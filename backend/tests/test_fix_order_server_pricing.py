"""FIX 1 — POST /orders is server-authoritative on price/discount/delivery.

In-process (mongomock). Verifies client money fields cannot tamper the saved
order, and that /cart/quote still returns the same totals.

Run:  pytest backend/tests/test_fix_order_server_pricing.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "fixprice_test")
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
        c.store_a = (await client.post("/api/stores", json={"name": "A", "code": "AAA"}, headers=auth(c.hq))).json()["store_id"]
        mid, c.mgr = ((await client.post("/api/staff", json={"name": "m", "role": "store_manager", "store_id": c.store_a, "login_code": "CODE-1111", "password": "password123"}, headers=auth(c.hq))).json()["id"],
                      None)
        c.mgr = server.create_token(mid, "store_manager")
        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))
        c.cust = (await client.post("/api/auth/register", json={"email": "c@t.com", "password": "p", "name": "c", "role": "customer"})).json()["token"]
        # ₹100/100g product so server line == grams
        c.pid = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": c.pid, "name": "Item", "product_type": "single", "cost_per_100g": 100,
            "available_qty_grams": 0, "is_active": True,
            "calories_per_100g": 100, "protein_per_100g": 10, "carbs_per_100g": 5, "fat_per_100g": 2})
        await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr),
                          json={"name": "Item", "unit": "g", "product_id": c.pid, "qty_on_hand": 0, "avg_cost": 0})
        await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr),
                          json={"product_id": c.pid, "qty": 100000, "purchase_price": 1})
        return c

    c = run(build())
    yield c
    run(client.aclose())


def _order(ctx, grams, total_price, **extra):
    body = {
        "order_type": "dine-in", "store_id": ctx.store_a,
        "items": [{"product_id": ctx.pid, "product_name": "Item", "grams": grams, "price": grams,
                   "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        "total_price": total_price, "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
        "confirm_duplicate": True,
    }
    body.update(extra)
    return body


# ---------- price tamper ----------

def test_underpay_rejected_price_mismatch(ctx):
    async def go():
        # real server line for 500g = ₹500, client claims total 1 -> 400 price_mismatch
        r = await ctx.client.post("/api/orders", json=_order(ctx, 500, 1), headers=auth(ctx.cust))
        assert r.status_code == 400, r.text
        assert r.json()["detail"]["error"] == "price_mismatch"
        assert r.json()["detail"]["server_total"] == 500
    run(go())


def test_fake_discount_ignored_server_total_used(ctx):
    async def go():
        # client sends discount 9999 + a correct total; no valid coupon -> saved discount 0
        body = _order(ctx, 300, 300, discount=9999, coupon_code=None)
        r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["discount"] == 0
        assert o["item_subtotal"] == 300 and o["total_price"] == 300
    run(go())


def test_client_delivery_fee_ignored(ctx):
    async def go():
        # delivery order: client tries delivery_fee 0; server sets 30 (subtotal 100 < 300 threshold)
        body = _order(ctx, 100, 100, order_type="delivery", delivery_fee=0, delivery_address="X")
        r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["delivery_fee"] == 30
        assert o["total_price"] == 130   # 100 food + 30 delivery
    run(go())


# ---------- coupon authority ----------

def test_valid_coupon_discount_from_validator(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Flat50", "coupon_code": "FLAT50", "discount_type": "flat", "discount_value": 50,
            "applicable_to": "all"})
        # quote to learn the server discount, then place
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.pid, "grams": 400}], "order_type": "dine-in",
            "coupon_code": "FLAT50", "store_id": ctx.store_a})
        qd = q.json()
        assert qd["discount"] == 50
        body = _order(ctx, 400, qd["net_food"], coupon_code="FLAT50")
        r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["discount"] == 50
        assert o["total_price"] == 350   # 400 - 50
        assert await server.db.coupon_redemptions.count_documents({"coupon_code": "FLAT50", "order_id": o["id"]}) == 1
    run(go())


def test_expired_coupon_rejected_no_redemption(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Old", "coupon_code": "OLD50", "discount_type": "flat", "discount_value": 50,
            "applicable_to": "all", "end_date": "2020-01-01T00:00:00+00:00"})
        body = _order(ctx, 400, 350, coupon_code="OLD50")
        r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cust))
        assert r.status_code == 400 and r.json()["detail"]["error"] == "coupon_rejected"
        assert await server.db.coupon_redemptions.count_documents({"coupon_code": "OLD50"}) == 0
    run(go())


# ---------- reorder advisory (Fix 2b) ----------

def test_reorder_in_stock_keeps_item(ctx):
    async def go():
        place = await ctx.client.post("/api/orders", json=_order(ctx, 200, 200), headers=auth(ctx.cust))
        assert place.status_code == 200, place.text
        oid = place.json()["id"]
        r = await ctx.client.post(f"/api/orders/{oid}/reorder", headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(ci["id"] == ctx.pid for ci in d["cart_items"])   # item kept
        assert d["unavailable"] == []                               # plenty of stock
    run(go())


def test_reorder_out_of_stock_advisory_not_dropped(ctx):
    async def go():
        # A product whose FROZEN global field is huge but whose live inventory_items is 0.
        pid2 = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": pid2, "name": "Empty", "product_type": "single", "cost_per_100g": 100,
            "available_qty_grams": 99999, "is_active": True,
            "calories_per_100g": 1, "protein_per_100g": 1, "carbs_per_100g": 1, "fat_per_100g": 1})
        await ctx.client.post(f"/api/inventory/{ctx.store_a}/items", headers=auth(ctx.mgr),
                              json={"name": "Empty", "unit": "g", "product_id": pid2, "qty_on_hand": 0, "avg_cost": 0})
        # Craft a past order containing pid2 (so we can reorder it)
        oid = str(uuid.uuid4())[:8].upper()
        me = (await ctx.client.get("/api/auth/me", headers=auth(ctx.cust))).json()
        await server.db.orders.insert_one({
            "id": oid, "user_id": me["id"], "store_id": ctx.store_a, "order_type": "dine-in",
            "items": [{"product_id": pid2, "product_name": "Empty", "grams": 100, "quantity": 1,
                       "product_type": "single"}],
            "status": "completed", "created_at": "2024-01-01T00:00:00+00:00"})
        r = await ctx.client.post(f"/api/orders/{oid}/reorder", headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        d = r.json()
        ci = next((x for x in d["cart_items"] if x["id"] == pid2), None)
        assert ci is not None                       # NOT hard-dropped (advisory only)
        assert ci["available_qty_grams"] == 0       # from inventory_items, NOT the 99999 global
        assert "Empty" in d["unavailable"]          # advisory warning present
        # create_order's authoritative recheck: the unstocked single is flagged out_of_stock
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": pid2, "grams": 100}], "order_type": "dine-in", "store_id": ctx.store_a})
        assert any(o["product_id"] == pid2 for o in q.json()["out_of_stock"])
    run(go())


# ---------- cart_quote regression ----------

def test_cart_quote_unchanged_totals(ctx):
    async def go():
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust), json={
            "items": [{"product_id": ctx.pid, "grams": 250}], "order_type": "dine-in", "store_id": ctx.store_a})
        b = q.json()
        # 250g @ ₹100/100g = ₹250; dine-in no delivery; GST inclusive 5%
        assert b["subtotal"] == 250 and b["discount"] == 0
        assert b["delivery_fee"] == 0 and b["grand_total"] == 250
        assert round(b["net_food"], 2) == 250
        assert b["gst_amount"] == round(250 * 5 / 105, 2)
        # response still carries the original keys
        for k in ("line_items", "subtotal", "discount", "delivery_fee", "gst_amount", "grand_total", "macros", "out_of_stock"):
            assert k in b
    run(go())
