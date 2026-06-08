"""Phase 3C — auto-decrement on sale, availability-from-raw, physical count, reorder.

In-process (mongomock). Reuses 3A inventory + 3B explode_to_raw. Asserts the
sale path now drives raw stock, is store-isolated, idempotent, and graceful.

Run:  pytest backend/tests/test_phase3c_auto_decrement.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase3c_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


async def _qty(store_id, item_id):
    it = await server.db.inventory_items.find_one({"id": item_id, "store_id": store_id}, {"_id": 0})
    return float(it["qty_on_hand"]) if it else None


async def _qty_by_product(store_id, product_id):
    it = await server.db.inventory_items.find_one({"store_id": store_id, "product_id": product_id}, {"_id": 0})
    return float(it["qty_on_hand"]) if it else None


def loose_order(store_id, product, grams=100, price=50, coupon=None):
    o = {
        "order_type": "dine-in", "store_id": store_id,
        "items": [{"product_id": product["id"], "product_name": product["name"], "grams": grams,
                   "price": price, "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        # total_price is now server-authoritative; send a high value so the
        # anti-tamper underpayment guard never fires (these tests assert on stock).
        "total_price": 1000000, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
        "confirm_duplicate": True,
    }
    return o


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

        prods = (await client.get("/api/products")).json()
        c.loose = prods[0]   # a single/loose product (tracked in inventory)

        # Two raws for a meal recipe in store A
        async def mk_raw(name, qty):
            r = await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr_a),
                                  json={"name": name, "unit": "g", "qty_on_hand": 0, "avg_cost": 0})
            iid = r.json()["id"]
            await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr_a),
                              json={"item_id": iid, "qty": qty, "purchase_price": 1})
            return iid
        c.chicken = await mk_raw("Chicken", 5000)
        c.aata = await mk_raw("Aata", 5000)
        c.meal_id = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": c.meal_id, "name": "Chicken Roll", "product_type": "ready_made",
            "fixed_price": 150, "serving_grams": 300, "is_active": True,
            "calories_per_100g": 200, "protein_per_100g": 15, "carbs_per_100g": 20, "fat_per_100g": 8,
            "ingredients": [
                {"name": "Chicken", "grams_per_serving": 150, "raw_item_id": c.chicken},
                {"name": "Aata", "grams_per_serving": 100, "raw_item_id": c.aata},
            ],
        })
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- loose sale decrements raw + store isolation ----------

def test_loose_sale_decrements_and_isolated(ctx):
    async def go():
        a_before = await _qty_by_product(ctx.store_a, ctx.loose["id"])
        b_before = await _qty_by_product(ctx.store_b, ctx.loose["id"])
        r = await ctx.client.post("/api/orders", json=loose_order(ctx.store_a, ctx.loose, grams=120), headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        assert await _qty_by_product(ctx.store_a, ctx.loose["id"]) == a_before - 120
        assert await _qty_by_product(ctx.store_b, ctx.loose["id"]) == b_before   # other store untouched
    run(go())


# ---------- ready_made sale explodes recipe ----------

def test_meal_sale_explodes_recipe(ctx):
    async def go():
        ch_before = await _qty(ctx.store_a, ctx.chicken)
        aa_before = await _qty(ctx.store_a, ctx.aata)
        order = {
            "order_type": "dine-in", "store_id": ctx.store_a,
            "items": [{"product_id": ctx.meal_id, "product_name": "Chicken Roll", "grams": 300, "price": 150,
                       "quantity": 20, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "ready_made"}],
            "total_price": 3000, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
            "confirm_duplicate": True,
        }
        r = await ctx.client.post("/api/orders", json=order, headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        # 20 units: chicken -3000g, aata -2000g
        assert await _qty(ctx.store_a, ctx.chicken) == ch_before - 3000
        assert await _qty(ctx.store_a, ctx.aata) == aa_before - 2000
        # sale movements logged for this order, per raw
        oid = r.json()["id"]
        assert await server.db.movement_log.count_documents({"ref_id": oid, "type": "sale"}) == 2
        ctx._meal_oid = oid
    run(go())


def test_sale_and_discard_use_same_explosion(ctx):
    async def go():
        # discard 2 meals -> chicken 2*150=300, aata 2*100=200 (same per-unit as sale)
        d = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "meal", "product_id": ctx.meal_id, "qty": 2, "reason": "spoiled"})
        # value uses avg_cost 1 -> (300+200)*1 = 500
        assert d.json()["value"] == 500
    run(go())


# ---------- idempotency ----------

def test_no_double_decrement_idempotent(ctx):
    async def go():
        order = loose_order(ctx.store_a, ctx.loose, grams=50)
        r = await ctx.client.post("/api/orders", json=order, headers=auth(ctx.cust))
        oid = r.json()["id"]
        before = await _qty_by_product(ctx.store_a, ctx.loose["id"])
        # re-run decrement directly for same order -> must be a no-op (idempotent on order_id)
        full_order = await server.db.orders.find_one({"id": oid}, {"_id": 0})
        await server.decrement_stock_for_order(full_order, "someone")
        assert await _qty_by_product(ctx.store_a, ctx.loose["id"]) == before
    run(go())


# ---------- graceful: untracked item ----------

def test_untracked_item_sale_succeeds_no_crash(ctx):
    async def go():
        # a product with NO inventory row in store A
        ghost_id = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": ghost_id, "name": "Ghost", "product_type": "single",
            "cost_per_100g": 10, "available_qty_grams": 999, "is_active": True})
        order = {
            "order_type": "dine-in", "store_id": ctx.store_a,
            "items": [{"product_id": ghost_id, "product_name": "Ghost", "grams": 100, "price": 10,
                       "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
            "total_price": 10, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
            "confirm_duplicate": True,
        }
        r = await ctx.client.post("/api/orders", json=order, headers=auth(ctx.cust))
        assert r.status_code == 200, r.text  # no crash, sale succeeds
        assert await _qty_by_product(ctx.store_a, ghost_id) is None  # nothing tracked, nothing decremented
    run(go())


# ---------- availability via cart_quote ----------

def test_availability_meal_short_vs_ok(ctx):
    async def go():
        # quote a huge meal qty that exceeds raw stock -> out_of_stock
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.meal_id, "product_type": "ready_made", "quantity": 1000}],
            "order_type": "dine-in", "store_id": ctx.store_a})
        assert q.status_code == 200
        assert any(o["product_id"] == ctx.meal_id for o in q.json()["out_of_stock"])
        # a small qty is fine
        q2 = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.meal_id, "product_type": "ready_made", "quantity": 1}],
            "order_type": "dine-in", "store_id": ctx.store_a})
        assert not q2.json()["out_of_stock"]
    run(go())


# ---------- physical count + reorder ----------

def test_physical_count_variance_and_flag(ctx):
    async def go():
        # set chicken counted lower; avg_cost 1 -> variance value large -> flagged
        sys_qty = await _qty(ctx.store_a, ctx.chicken)
        r = await ctx.client.post(f"/api/inventory/{ctx.store_a}/count", headers=auth(ctx.mgr_a),
                                  json={"counts": [{"item_id": ctx.chicken, "counted_qty": sys_qty - 2500}]})
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        assert res["variance"] == -2500 and res["flagged_for_review"] is True
        assert await _qty(ctx.store_a, ctx.chicken) == sys_qty - 2500
        mv = await server.db.movement_log.find_one({"item_id": ctx.chicken, "reason": "physical_count"}, {"_id": 0})
        assert mv and mv["type"] == "adjust"
    run(go())


def test_reorder_and_cost_restriction(ctx):
    async def go():
        # raise reorder_level above current qty so it shows up
        cur = await _qty(ctx.store_a, ctx.aata)
        await ctx.client.put(f"/api/inventory/{ctx.store_a}/items/{ctx.aata}", headers=auth(ctx.mgr_a),
                             json={"reorder_level": cur + 1000})
        r = await ctx.client.get(f"/api/inventory/{ctx.store_a}/reorder", headers=auth(ctx.mgr_a))
        assert r.status_code == 200
        assert any(x["item_id"] == ctx.aata and x["suggested_qty"] > 0 for x in r.json()["items"])
        # cashier/kitchen cost-restricted
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            rr = await ctx.client.get(f"/api/inventory/{ctx.store_a}/reorder", headers=auth(tok))
            assert rr.status_code == 403
    run(go())


# ---------- full loop ----------

def test_full_loop_inward_sale_valuation(ctx):
    async def go():
        # fresh raw + product
        iid = (await ctx.client.post(f"/api/inventory/{ctx.store_a}/items", headers=auth(ctx.mgr_a),
                                     json={"name": "Paneer", "unit": "g", "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
        await ctx.client.post(f"/api/inventory/{ctx.store_a}/inward", headers=auth(ctx.mgr_a),
                              json={"item_id": iid, "qty": 1000, "purchase_price": 2})  # ₹2/g, value 2000
        pid = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": pid, "name": "Paneer Loose", "product_type": "single",
            "cost_per_100g": 30, "available_qty_grams": 1000, "is_active": True})
        # link inventory row to this product so loose sale decrements it
        await server.db.inventory_items.update_one({"id": iid, "store_id": ctx.store_a}, {"$set": {"product_id": pid}})
        # sale 200g
        order = loose_order(ctx.store_a, {"id": pid, "name": "Paneer Loose"}, grams=200)
        await ctx.client.post("/api/orders", json=order, headers=auth(ctx.cust))
        assert await _qty(ctx.store_a, iid) == 800
        # valuation reflects 800 * 2 = 1600
        val = await ctx.client.get(f"/api/inventory/{ctx.store_a}/valuation", headers=auth(ctx.mgr_a))
        row = next(x for x in val.json()["items"] if x["item_id"] == iid)
        assert row["value"] == 1600
    run(go())
