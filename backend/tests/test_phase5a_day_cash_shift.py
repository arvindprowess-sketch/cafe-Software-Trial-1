"""Phase 5A — day open/close + cash reconciliation + shift/cashier sales.

In-process (mongomock). Each test is self-contained (opens & closes its own day)
so it is order-independent under pytest-randomly.

Run:  pytest backend/tests/test_phase5a_day_cash_shift.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase5a_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def pos_order(store_id, prod, price, payment_mode):
    # dine-in => no takeaway/delivery surcharge, so total_price == price.
    return {
        "order_type": "dine-in", "store_id": store_id,
        "items": [{"product_id": prod["id"], "product_name": prod["name"], "grams": 100, "price": price,
                   "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        "total_price": price, "item_subtotal": price, "payment_mode": payment_mode,
        "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1, "confirm_duplicate": True,
    }


class Ctx:
    pass


@pytest.fixture(scope="module")
def ctx():
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        await client.post("/api/seed")
        c.hq = (await client.post("/api/auth/login", json={"email": "admin@dietcafe.com", "password": "admin123"})).json()["token"]

        async def mk_store(n, code):
            return (await client.post("/api/stores", json={"name": n, "code": code}, headers=auth(c.hq))).json()["store_id"]
        c.store_a = await mk_store("A", "AAA")
        c.store_b = await mk_store("B", "BBB")
        c.store_z = await mk_store("Z", "ZZZ")  # NOT in area_ab's cluster

        async def mk_staff(role, store_id=None, cluster=None, pin="0"):
            body = {"name": role + pin, "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return r.json()["id"], server.create_token(r.json()["id"], role)
        c.mgr_a_id, c.mgr_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_a_id, c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.cashier2_id, c.cashier2 = await mk_staff("cashier", store_id=c.store_a, pin="2200")
        c.kitchen_a_id, c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="3333")
        c.area_ab_id, c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="4444")

        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))
        c.prod = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _open(ctx, token=None, float_amt=1000):
    return await ctx.client.post(f"/api/stores/{ctx.store_a}/day/open",
                                 headers=auth(token or ctx.cashier_a), json={"opening_cash_float": float_amt})


async def _close(ctx, counted, token=None):
    return await ctx.client.post(f"/api/stores/{ctx.store_a}/day/close",
                                 headers=auth(token or ctx.mgr_a), json={"closing_cash_counted": counted})


# ---------- open ----------

def test_open_captures_snapshot_and_rejects_double(ctx):
    async def go():
        r = await _open(ctx, ctx.cashier_a, 1000)
        assert r.status_code == 200, r.text
        day = r.json()
        assert day["status"] == "open" and day["opening_cash_float"] == 1000
        assert isinstance(day["opening_stock_snapshot"], list) and len(day["opening_stock_snapshot"]) > 0
        again = await _open(ctx, ctx.mgr_a, 500)
        assert again.status_code == 409
        await _close(ctx, 1000)  # cleanup -> leaves store closed for other tests
    run(go())


def test_open_by_cashier_own_store_only(ctx):
    async def go():
        r = await ctx.client.post(f"/api/stores/{ctx.store_b}/day/open", headers=auth(ctx.cashier_a),
                                  json={"opening_cash_float": 100})
        assert r.status_code == 403  # cashier_a belongs to store A
    run(go())


# ---------- close + cash reconciliation (cash only) ----------

def test_close_computes_variance_cash_only(ctx):
    async def go():
        assert (await _open(ctx, ctx.cashier_a, 1000)).status_code == 200
        # cash 100 + 200 = 300; card 500 + upi 50 -> excluded from drawer
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 100, "cash"), headers=auth(ctx.cashier_a))
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 200, "cash"), headers=auth(ctx.cashier_a))
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 500, "card"), headers=auth(ctx.cashier_a))
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 50, "upi"), headers=auth(ctx.cashier2))
        # cashier cannot close
        assert (await _close(ctx, 1300, ctx.cashier_a)).status_code == 403
        # store manager closes; expected = 1000 + 300 = 1300; counted 1290 -> variance -10
        ok = await _close(ctx, 1290, ctx.mgr_a)
        assert ok.status_code == 200, ok.text
        d = ok.json()
        assert d["cash_sales"] == 300
        assert d["expected_cash"] == 1300
        assert d["cash_variance"] == -10
        assert d["status"] == "closed" and isinstance(d["closing_stock_snapshot"], list)
    run(go())


# ---------- read scope + cashier masking ----------

def test_get_day_scope_and_cashier_masking(ctx):
    async def go():
        await _open(ctx, ctx.cashier_a, 1000)
        c = await _close(ctx, 1000, ctx.mgr_a)
        date = c.json()["business_date"]
        m = await ctx.client.get(f"/api/stores/{ctx.store_a}/day/{date}", headers=auth(ctx.mgr_a))
        assert m.status_code == 200 and "cash_variance" in m.json()
        a = await ctx.client.get(f"/api/stores/{ctx.store_a}/day/{date}", headers=auth(ctx.area_ab))
        assert a.status_code == 200  # store A is in area's cluster
        cs = await ctx.client.get(f"/api/stores/{ctx.store_a}/day/{date}", headers=auth(ctx.cashier_a))
        assert cs.status_code == 200 and "cash_variance" not in cs.json() and "expected_cash" not in cs.json()
        k = await ctx.client.get(f"/api/stores/{ctx.store_a}/day/{date}", headers=auth(ctx.kitchen_a))
        assert k.status_code == 403
        # area outside its cluster (store_z) -> 403 (independent of day existence)
        z = await ctx.client.get(f"/api/stores/{ctx.store_z}/day/{date}", headers=auth(ctx.area_ab))
        assert z.status_code == 403
    run(go())


# ---------- shift summary ----------

def test_shift_summary_scope(ctx):
    async def go():
        # walk-in orders by two cashiers (order_source=walk_in)
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 100, "cash"), headers=auth(ctx.cashier_a))
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 200, "card"), headers=auth(ctx.cashier_a))
        await ctx.client.post("/api/orders", json=pos_order(ctx.store_a, ctx.prod, 150, "upi"), headers=auth(ctx.cashier2))
        m = await ctx.client.get(f"/api/stores/{ctx.store_a}/shifts/summary", headers=auth(ctx.mgr_a))
        assert m.status_code == 200
        ids = {row["cashier_id"] for row in m.json()["cashiers"]}
        assert {ctx.cashier_a_id, ctx.cashier2_id} <= ids
        cs = await ctx.client.get(f"/api/stores/{ctx.store_a}/shifts/summary", headers=auth(ctx.cashier_a))
        assert cs.status_code == 200
        assert all(r["cashier_id"] == ctx.cashier_a_id for r in cs.json()["cashiers"])
        k = await ctx.client.get(f"/api/stores/{ctx.store_a}/shifts/summary", headers=auth(ctx.kitchen_a))
        assert k.status_code == 403
    run(go())


# ---------- immutability ----------

def test_no_edit_delete_route_for_business_days(ctx):
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    day_routes = [(p, m) for (p, m) in routes if "/day" in p]
    for p, m in day_routes:
        assert m in ("GET", "POST", "HEAD"), (p, m)
        assert m not in ("PUT", "DELETE", "PATCH"), (p, m)
    assert not any("business_days" in p for (p, _m) in routes)
