"""Phase 3A — raw inventory item master + inward/GRN + movement log (backend).

In-process (mongomock). Cost-leak, weighted-average, role scoping, append-only
log, idempotent migration, and live-sale-path-unchanged smoke.

Run:  pytest backend/tests/test_phase3a_inventory.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase3a_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


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
        c.hq = await hq_token()

        async def mk_store(n, code):
            return (await client.post("/api/stores", json={"name": n, "code": code}, headers=auth(c.hq))).json()["store_id"]
        c.store_a = await mk_store("A", "AAA")
        c.store_b = await mk_store("B", "BBB")

        async def mk_staff(role, store_id=None, cluster=None, pin="0"):
            body = {"name": role, "role": role, "login_code": f"CODE-{pin}", "password": "password123"}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return server.create_token(r.json()["id"], role)
        c.manager_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="3333")
        c.area_b = await mk_staff("area_manager", cluster=[c.store_b], pin="4444")

        # Run the inventory seed migration (startup events don't fire under ASGITransport)
        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))
        c.product = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- inward + weighted average + movement log ----------

def test_inward_weighted_average_and_one_movement(ctx):
    async def go():
        # fresh pure-raw item (qty 0, avg 0)
        r = await ctx.client.post(f"/api/inventory/{ctx.store_a}/items", headers=auth(ctx.manager_a),
                                  json={"name": "Olive Oil", "unit": "ml", "qty_on_hand": 0, "avg_cost": 0})
        assert r.status_code == 200, r.text
        item_id = r.json()["id"]
        # inward 100 @ ₹10  -> avg 10, qty 100
        i1 = await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.manager_a),
                                   json={"item_id": item_id, "qty": 100, "purchase_price": 10})
        assert i1.status_code == 200, i1.text
        assert i1.json()["qty_on_hand"] == 100 and i1.json()["avg_cost"] == 10
        # inward 100 @ ₹20  -> blended avg 15, qty 200
        i2 = await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.manager_a),
                                   json={"item_id": item_id, "qty": 100, "purchase_price": 20})
        assert i2.json()["qty_on_hand"] == 200 and i2.json()["avg_cost"] == 15
        # exactly two 'inward' movement entries for this item
        cnt = await server.db.movement_log.count_documents({"item_id": item_id, "type": "inward"})
        assert cnt == 2
        ctx._oil_id = item_id
    run(go())


# ---------- role scoping on inward ----------

def test_inward_scope_and_role(ctx):
    async def go():
        # area manager of cluster {B} cannot inward into store A
        r = await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.area_b),
                                  json={"product_id": ctx.product["id"], "qty": 10, "purchase_price": 5})
        assert r.status_code == 403, r.text
        # cashier cannot inward at all
        r2 = await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.cashier_a),
                                   json={"product_id": ctx.product["id"], "qty": 10, "purchase_price": 5})
        assert r2.status_code == 403
    run(go())


# ---------- cost leak ----------

def test_cashier_kitchen_get_items_no_cost(ctx):
    async def go():
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.get(f"/api/inventory/{ctx.store_a}/items", headers=auth(tok))
            assert r.status_code == 200, r.text
            items = r.json()
            assert len(items) > 0
            assert all("avg_cost" not in i for i in items), "cost leaked to cashier/kitchen"
            assert all("qty_on_hand" in i for i in items)  # kitchen still sees qty
        # manager DOES see cost
        mgr = await ctx.client.get(f"/api/inventory/{ctx.store_a}/items", headers=auth(ctx.manager_a))
        assert any("avg_cost" in i for i in mgr.json())
    run(go())


def test_valuation_cost_restricted(ctx):
    async def go():
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.get(f"/api/inventory/{ctx.store_a}/valuation", headers=auth(tok))
            assert r.status_code == 403, r.text
        ok = await ctx.client.get(f"/api/inventory/{ctx.store_a}/valuation", headers=auth(ctx.manager_a))
        assert ok.status_code == 200 and "total_valuation" in ok.json()
    run(go())


def test_movement_log_manager_only_and_append_only(ctx):
    async def go():
        # cashier/kitchen cannot read the movement log
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.get(f"/api/inventory/{ctx.store_a}/movements", headers=auth(tok))
            assert r.status_code == 403
        ok = await ctx.client.get(f"/api/inventory/{ctx.store_a}/movements", headers=auth(ctx.manager_a))
        assert ok.status_code == 200
    run(go())
    # No edit/delete route exists for movement_log
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    assert not any("movement_log" in p for (p, _m) in routes)
    move_routes = [(p, m) for (p, m) in routes if p.endswith("/movements")]
    assert all(m in ("GET", "HEAD") for (_p, m) in move_routes), move_routes


# ---------- migration ----------

def test_migration_idempotent_and_skips_ready_made(ctx):
    async def go():
        # Insert a ready_made product directly; it must NOT get a stock row
        rm_id = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": rm_id, "name": "Combo Bowl", "product_type": "ready_made",
            "fixed_price": 200, "is_active": True, "ingredients": []})
        before = await server.db.inventory_items.count_documents({"store_id": ctx.store_a})
        await ctx.client.post("/api/admin/migrate-inventory", headers=auth(ctx.hq))
        await ctx.client.post("/api/admin/migrate-inventory", headers=auth(ctx.hq))
        after = await server.db.inventory_items.count_documents({"store_id": ctx.store_a})
        assert after == before, "migration not idempotent"
        assert await server.db.inventory_items.count_documents({"product_id": rm_id}) == 0
    run(go())


# ---------- live sale path unchanged ----------

def test_sale_flow_unchanged(ctx):
    async def go():
        cust = (await ctx.client.post("/api/auth/register", json={"email": "s@t.com", "password": "p", "name": "s", "role": "customer"})).json()["token"]
        # cart_quote still works
        q = await ctx.client.post("/api/cart/quote", headers=auth(cust), json={
            "items": [{"product_id": ctx.product["id"], "grams": 100, "cost_per_100g": ctx.product["cost_per_100g"]}],
            "order_type": "dine-in"})
        assert q.status_code == 200, q.text
        # placing an order still works
        o = await ctx.client.post("/api/orders", headers=auth(cust), json={
            "order_type": "dine-in", "store_id": ctx.store_a,
            "items": [{"product_id": ctx.product["id"], "product_name": ctx.product["name"], "grams": 100,
                       "price": 50, "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
            "total_price": 50, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
            "confirm_duplicate": True})
        assert o.status_code == 200, o.text
    run(go())
