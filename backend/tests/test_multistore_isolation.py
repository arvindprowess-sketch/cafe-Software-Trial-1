"""Multi-store (Phase 0) isolation tests.

These run fully in-process against the FastAPI app with an in-memory MongoDB
(mongomock_motor), so they need no network / live server. They prove that
store-scoped data never leaks across stores or across customers, and that
real-time order events are delivered only to the originating store's rooms.

Run:  pytest backend/tests/test_multistore_isolation.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "multistore_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def order_payload(store_id, product, qty_grams=100):
    return {
        "order_type": "takeaway",
        "store_id": store_id,
        "items": [{
            "product_id": product["id"],
            "product_name": product["name"],
            "grams": qty_grams,
            "price": 50,
            "calories": 100, "protein": 10, "carbs": 5, "fat": 2,
            "product_type": "single",
        }],
        "total_price": 50,
        "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
        "confirm_duplicate": True,
    }


class Ctx:
    """Holds the test world (tokens, ids) built once and shared by all tests."""


@pytest.fixture(scope="module")
def ctx():
    # Fresh in-memory DB
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]

    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        # Seed catalog + HQ super_admin + default store/migration
        await client.post("/api/seed")

        # HQ token (legacy admin login is now super_admin)
        r = await client.post("/api/auth/login", json={"email": "admin@dietcafe.com", "password": "admin123"})
        c.hq_token = r.json()["token"]

        # Two stores
        ra = await client.post("/api/stores", json={"name": "Store A", "code": "AAA"}, headers=auth(c.hq_token))
        rb = await client.post("/api/stores", json={"name": "Store B", "code": "BBB"}, headers=auth(c.hq_token))
        c.store_a = ra.json()["store_id"]
        c.store_b = rb.json()["store_id"]

        # Staff for store A and B (created by HQ), then mint tokens directly
        async def make_staff(role, store_id=None, cluster=None, pin="0000"):
            body = {"name": f"{role}", "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            resp = await client.post("/api/staff", json=body, headers=auth(c.hq_token))
            assert resp.status_code == 200, resp.text
            sid = resp.json()["id"]
            return server.create_token(sid, role)

        c.cashier_a = await make_staff("cashier", store_id=c.store_a, pin="1111")
        c.kitchen_a = await make_staff("kitchen", store_id=c.store_a, pin="2222")
        c.manager_a = await make_staff("store_manager", store_id=c.store_a, pin="3333")
        c.cashier_b = await make_staff("cashier", store_id=c.store_b, pin="4444")
        c.kitchen_b = await make_staff("kitchen", store_id=c.store_b, pin="5555")
        c.area_1 = await make_staff("area_manager", cluster=[c.store_a], pin="6666")
        c.area_2 = await make_staff("area_manager", cluster=[c.store_b], pin="7777")

        # Two customers
        async def make_customer(email):
            resp = await client.post("/api/auth/register", json={
                "email": email, "password": "pass123", "name": email, "role": "customer"})
            return resp.json()["token"]

        c.cust1 = await make_customer("cust1@test.com")
        c.cust2 = await make_customer("cust2@test.com")

        # A product to order
        products = (await client.get("/api/products")).json()
        c.product = products[0]

        # Customer1 orders at Store A; Customer2 orders at Store B
        oa = await client.post("/api/orders", json=order_payload(c.store_a, c.product), headers=auth(c.cust1))
        ob = await client.post("/api/orders", json=order_payload(c.store_b, c.product), headers=auth(c.cust2))
        assert oa.status_code == 200, oa.text
        assert ob.status_code == 200, ob.text
        c.order_a = oa.json()
        c.order_b = ob.json()
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- store_id stamping ----------

def test_orders_carry_store_id(ctx):
    assert ctx.order_a["store_id"] == ctx.store_a
    assert ctx.order_b["store_id"] == ctx.store_b


def test_pos_order_uses_staff_store(ctx):
    async def go():
        # Cashier A creates a POS order WITHOUT a store_id -> must use cashier's store (A)
        payload = order_payload(ctx.store_b, ctx.product)  # even if a B id is passed...
        payload.pop("store_id")
        r = await ctx.client.post("/api/orders", json=payload, headers=auth(ctx.cashier_a))
        assert r.status_code == 200, r.text
        assert r.json()["store_id"] == ctx.store_a
    run(go())


# ---------- order isolation across stores ----------

def test_cashier_sees_only_own_store_orders(ctx):
    async def go():
        r = await ctx.client.get("/api/orders/all", headers=auth(ctx.cashier_a))
        assert r.status_code == 200
        store_ids = {o["store_id"] for o in r.json()}
        assert ctx.store_b not in store_ids
        assert store_ids <= {ctx.store_a}
    run(go())


def test_kitchen_sees_only_own_store_orders(ctx):
    async def go():
        r = await ctx.client.get("/api/orders/kitchen", headers=auth(ctx.kitchen_a))
        assert r.status_code == 200
        assert all(o["store_id"] == ctx.store_a for o in r.json())
        # Store B's order id must not appear
        assert ctx.order_b["id"] not in {o["id"] for o in r.json()}
    run(go())


def test_manager_list_orders_scoped(ctx):
    async def go():
        r = await ctx.client.get("/api/orders", headers=auth(ctx.manager_a))
        assert r.status_code == 200
        assert all(o["store_id"] == ctx.store_a for o in r.json())
    run(go())


def test_cashier_cannot_mutate_other_store_order(ctx):
    async def go():
        # Cashier A tries to advance Store B's order -> 403
        r = await ctx.client.put(
            f"/api/orders/{ctx.order_b['id']}/status?status=ready", headers=auth(ctx.cashier_a))
        assert r.status_code == 403, r.text
        # Cashier B (correct store) can
        r2 = await ctx.client.put(
            f"/api/orders/{ctx.order_b['id']}/status?status=ready", headers=auth(ctx.cashier_b))
        assert r2.status_code == 200, r2.text
    run(go())


def test_cashier_cannot_read_other_store_receipt(ctx):
    async def go():
        r = await ctx.client.get(f"/api/orders/{ctx.order_b['id']}/receipt", headers=auth(ctx.cashier_a))
        assert r.status_code == 403
    run(go())


# ---------- area manager cluster isolation ----------

def test_area_manager_sees_only_cluster_stores(ctx):
    async def go():
        r = await ctx.client.get("/api/stores", headers=auth(ctx.area_1))
        assert r.status_code == 200
        ids = {s["store_id"] for s in r.json()}
        assert ids == {ctx.store_a}
        # Cluster 2 area manager cannot read store A
        r2 = await ctx.client.get(f"/api/stores/{ctx.store_a}", headers=auth(ctx.area_2))
        assert r2.status_code == 403
        # ...but can read its own store B
        r3 = await ctx.client.get(f"/api/stores/{ctx.store_b}", headers=auth(ctx.area_2))
        assert r3.status_code == 200
    run(go())


def test_area_manager_orders_scoped_to_cluster(ctx):
    async def go():
        r = await ctx.client.get("/api/orders/all", headers=auth(ctx.area_1))
        assert r.status_code == 200
        assert all(o["store_id"] == ctx.store_a for o in r.json())
    run(go())


# ---------- customer isolation ----------

def test_customer_cannot_read_other_customers_order(ctx):
    async def go():
        # Customer1 only sees own orders
        r = await ctx.client.get("/api/orders", headers=auth(ctx.cust1))
        assert all(o["user_id"] == ctx.order_a["user_id"] for o in r.json())
        # Customer1 cannot read customer2's receipt
        r2 = await ctx.client.get(f"/api/orders/{ctx.order_b['id']}/receipt", headers=auth(ctx.cust1))
        assert r2.status_code == 403
    run(go())


# ---------- stock logs / tables / payments isolation ----------

def test_stock_logs_scoped_by_store(ctx):
    async def go():
        # Kitchen A and Kitchen B each log a stock change
        await ctx.client.post("/api/inventory/update-stock",
                              json={"product_id": ctx.product["id"], "quantity_grams": 100, "reason": "A"},
                              headers=auth(ctx.kitchen_a))
        await ctx.client.post("/api/inventory/update-stock",
                              json={"product_id": ctx.product["id"], "quantity_grams": 100, "reason": "B"},
                              headers=auth(ctx.kitchen_b))
        ra = await ctx.client.get("/api/inventory/stock-logs", headers=auth(ctx.kitchen_a))
        assert ra.status_code == 200
        assert all(l["store_id"] == ctx.store_a for l in ra.json())
        assert all(l["store_id"] != ctx.store_b for l in ra.json())
    run(go())


def test_tables_scoped_by_store(ctx):
    async def go():
        r = await ctx.client.get("/api/tables", headers=auth(ctx.cashier_a))
        assert r.status_code == 200
        assert all(t["store_id"] == ctx.store_a for t in r.json())
        # Cashier A explicitly requesting store B's tables is denied
        r2 = await ctx.client.get(f"/api/tables?store_id={ctx.store_b}", headers=auth(ctx.cashier_a))
        assert r2.status_code == 403
    run(go())


def test_payment_scoped_to_order_store(ctx):
    async def go():
        # Gateway payments are only allowed against unpaid orders (walk-in cash
        # orders are saved as paid), so reset order B for this test.
        await server.db.orders.update_one(
            {"id": ctx.order_b["id"]}, {"$set": {"payment_status": "unpaid"}})
        # Cashier A cannot create a payment against Store B's order
        r = await ctx.client.post("/api/payments/create-order",
                                  json={"order_id": ctx.order_b["id"]},
                                  headers=auth(ctx.cashier_a))
        assert r.status_code == 403
        # Cashier B can, and the payment inherits store B
        r2 = await ctx.client.post("/api/payments/create-order",
                                   json={"order_id": ctx.order_b["id"]},
                                   headers=auth(ctx.cashier_b))
        assert r2.status_code == 200, r2.text
        pay = await server.db.payments.find_one({"order_id": ctx.order_b["id"]}, {"_id": 0})
        assert pay["store_id"] == ctx.store_b
    run(go())


def test_reports_are_hq_only(ctx):
    async def go():
        # Store manager / cashier get zero access to admin reports
        for tok in (ctx.manager_a, ctx.cashier_a):
            r = await ctx.client.get("/api/admin/analytics", headers=auth(tok))
            assert r.status_code == 403
    run(go())


def test_staff_notifications_scoped_by_store(ctx):
    async def go():
        # New-order notifications are stamped with the order's store_id.
        ra = await ctx.client.get("/api/notifications", headers=auth(ctx.kitchen_a))
        assert ra.status_code == 200
        assert all(n.get("store_id") == ctx.store_a for n in ra.json())
        assert all(n.get("store_id") != ctx.store_b for n in ra.json())
    run(go())


# ---------- real-time room isolation ----------

def test_realtime_order_event_does_not_leak_to_other_store(ctx):
    async def go():
        captured = []

        async def fake_emit(event, message=None, room=None, **kwargs):
            captured.append((event, room))

        orig = server.sio.emit
        server.sio.emit = fake_emit
        try:
            r = await ctx.client.post(
                "/api/orders", json=order_payload(ctx.store_a, ctx.product), headers=auth(ctx.cust1))
            assert r.status_code == 200
        finally:
            server.sio.emit = orig

        rooms = {room for (_event, room) in captured}
        # Reaches store A's staff rooms + HQ
        assert f"kitchen:{ctx.store_a}" in rooms
        assert f"cashier:{ctx.store_a}" in rooms
        assert "hq" in rooms
        # NEVER reaches store B's rooms
        assert f"kitchen:{ctx.store_b}" not in rooms
        assert f"cashier:{ctx.store_b}" not in rooms
    run(go())
