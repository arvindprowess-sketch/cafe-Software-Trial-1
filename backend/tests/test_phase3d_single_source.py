"""Phase 3D — inventory_items is the single source of truth for stock.

Verifies the legacy global available_qty_grams is no longer authoritative:
sales decrement only inventory_items, availability + restock read/write
inventory_items, and ready_made availability is one path.

Run:  pytest backend/tests/test_phase3d_single_source.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase3d_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


async def _inv_qty(store_id, product_id):
    it = await server.db.inventory_items.find_one({"store_id": store_id, "product_id": product_id}, {"_id": 0})
    return float(it["qty_on_hand"]) if it else None


async def _global_qty(product_id):
    p = await server.db.products.find_one({"id": product_id}, {"_id": 0})
    return p.get("available_qty_grams")


def loose_order(store_id, product_id, name, grams=100, price=50):
    return {
        "order_type": "dine-in", "store_id": store_id,
        "items": [{"product_id": product_id, "product_name": name, "grams": grams, "price": price,
                   "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        "total_price": price, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
        "confirm_duplicate": True,
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

        async def mk_staff(role, store_id=None, pin="0"):
            body = {"name": role + pin, "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return server.create_token(r.json()["id"], role)
        c.mgr_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="3333")

        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))
        c.cust = (await client.post("/api/auth/register", json={"email": "c@t.com", "password": "p", "name": "c", "role": "customer"})).json()["token"]
        c.prod = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- sale decrements only inventory_items ----------

def test_sale_decrements_inventory_not_global(ctx):
    async def go():
        inv_before = await _inv_qty(ctx.store_a, ctx.prod["id"])
        glob_before = await _global_qty(ctx.prod["id"])
        r = await ctx.client.post("/api/orders", json=loose_order(ctx.store_a, ctx.prod["id"], ctx.prod["name"], grams=120), headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        # inventory_items moved; global field NOT touched on sale
        assert await _inv_qty(ctx.store_a, ctx.prod["id"]) == inv_before - 120
        assert await _global_qty(ctx.prod["id"]) == glob_before
    run(go())


# ---------- availability follows inventory_items, not the stale global field ----------

def test_availability_follows_inventory_not_global(ctx):
    async def go():
        # Drain store A's inventory for this product to 0, but leave global field high
        cur = await _inv_qty(ctx.store_a, ctx.prod["id"])
        await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.mgr_a),
                             json={"product_id": ctx.prod["id"], "new_qty": 0, "reason": "drain"})
        await server.db.products.update_one({"id": ctx.prod["id"]}, {"$set": {"available_qty_grams": 99999}})
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.prod["id"], "grams": 100, "cost_per_100g": ctx.prod["cost_per_100g"]}],
            "order_type": "dine-in", "store_id": ctx.store_a})
        assert any(o["product_id"] == ctx.prod["id"] for o in q.json()["out_of_stock"]), "should be out-of-stock per inventory_items"
        # Store B (still seeded) is fine -> availability is per-store
        q2 = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.prod["id"], "grams": 100, "cost_per_100g": ctx.prod["cost_per_100g"]}],
            "order_type": "dine-in", "store_id": ctx.store_b})
        assert not q2.json()["out_of_stock"]
    run(go())


# ---------- restock writes inventory_items, role-scoped ----------

def test_restock_writes_inventory_items_role_scoped(ctx):
    async def go():
        # cashier/kitchen forbidden
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.post("/api/inventory/update-stock", headers=auth(tok),
                                      json={"product_id": ctx.prod["id"], "quantity_grams": 100, "store_id": ctx.store_a})
            assert r.status_code == 403, r.text
        # store_manager restock adds to inventory_items (not the global field)
        inv_before = await _inv_qty(ctx.store_a, ctx.prod["id"])
        glob_before = await _global_qty(ctx.prod["id"])
        ok = await ctx.client.post("/api/inventory/update-stock", headers=auth(ctx.mgr_a),
                                   json={"product_id": ctx.prod["id"], "quantity_grams": 500, "store_id": ctx.store_a, "reason": "restock"})
        assert ok.status_code == 200, ok.text
        assert await _inv_qty(ctx.store_a, ctx.prod["id"]) == inv_before + 500
        assert await _global_qty(ctx.prod["id"]) == glob_before  # global untouched
        # a movement_log 'adjust' was written for the store
        assert await server.db.movement_log.count_documents({"store_id": ctx.store_a, "product_id": ctx.prod["id"], "type": "adjust"}) >= 1
    run(go())


def test_restock_other_store_forbidden(ctx):
    async def go():
        r = await ctx.client.post("/api/inventory/update-stock", headers=auth(ctx.mgr_a),
                                  json={"product_id": ctx.prod["id"], "quantity_grams": 100, "store_id": ctx.store_b})
        assert r.status_code == 403  # store_manager A cannot restock store B
    run(go())


# ---------- ready_made availability is one path (raw_meal_available) ----------

def test_ready_made_availability_single_path(ctx):
    async def go():
        # raw with limited stock in store A
        iid = (await ctx.client.post(f"/api/inventory/{ctx.store_a}/items", headers=auth(ctx.mgr_a),
                                     json={"name": "Paneer", "unit": "g", "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
        await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.mgr_a),
                              json={"item_id": iid, "qty": 250, "purchase_price": 1})
        meal_id = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": meal_id, "name": "Paneer Bowl", "product_type": "ready_made", "fixed_price": 120,
            "serving_grams": 300, "is_active": True,
            "calories_per_100g": 180, "protein_per_100g": 12, "carbs_per_100g": 14, "fat_per_100g": 9,
            "ingredients": [{"name": "Paneer", "grams_per_serving": 100, "raw_item_id": iid}]})
        # check_ready_made_stock now delegates to raw_meal_available (store-scoped)
        c2 = await ctx.client.get(f"/api/products/{meal_id}/check-stock?quantity=2&store_id={ctx.store_a}")
        assert c2.json()["available"] is True   # need 200g, have 250g
        c3 = await ctx.client.get(f"/api/products/{meal_id}/check-stock?quantity=3&store_id={ctx.store_a}")
        assert c3.json()["available"] is False  # need 300g, have 250g
        # And the order path agrees (same single computation)
        order = {"order_type": "dine-in", "store_id": ctx.store_a,
                 "items": [{"product_id": meal_id, "product_name": "Paneer Bowl", "grams": 300, "price": 120,
                            "quantity": 3, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "ready_made"}],
                 "total_price": 360, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
                 "confirm_duplicate": True}
        bad = await ctx.client.post("/api/orders", json=order, headers=auth(ctx.cust))
        assert bad.status_code == 400  # insufficient per inventory_items
    run(go())
