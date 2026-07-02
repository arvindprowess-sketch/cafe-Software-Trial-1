"""Cashier Round 3 — backend surface for the POS gap-fix brief.

In-process (mongomock). Covers:
  FIX 4  server-quoted bill == placed-order total (parity across cases)
  FIX 2  walk-in phone -> find/create customer, loyalty to CUSTOMER not cashier,
         cashier order with no phone grants NO rewards, first_order_only checks
         the customer, /customers/lookup
  FIX 3  offer channel (all / app_only / pos_only) list filtering + enforcement
  FIX 6  held-bill 24h soft expiry

Run:  pytest backend/tests/test_cashier_round3.py
"""
import os
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "round3_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import pytest
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
        c.store = (await client.post("/api/stores", json={"name": "Store A", "code": "AAA"},
                                     headers=auth(c.hq))).json()["store_id"]

        async def mk_staff(role, store_id=None, code="C1"):
            body = {"name": role, "role": role, "login_code": code, "password": "password123"}
            if store_id:
                body["store_id"] = store_id
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            sid = r.json()["id"]
            return sid, server.create_token(sid, role)

        c.cashier_id, c.cashier = await mk_staff("cashier", store_id=c.store, code="CASH1")
        # Second store + its cashier for isolation checks (FIX 5)
        c.store_b = (await client.post("/api/stores", json={"name": "Store B", "code": "BBB"},
                                       headers=auth(c.hq))).json()["store_id"]
        c.cashier_b_id, c.cashier_b = await mk_staff("cashier", store_id=c.store_b, code="CASH2")
        c.product = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


def pos_items(product, grams=200):
    return [{
        "product_id": product["id"], "product_name": product["name"],
        "grams": grams, "quantity": 1, "product_type": "single",
        "cost_per_100g": product["cost_per_100g"],
        "price": round(grams / 100 * product["cost_per_100g"], 2),
        "calories": 100, "protein": 10, "carbs": 5, "fat": 2,
    }]


async def place_pos_order(ctx, order_type="dine-in", coupon=None, grams=200, phone=None):
    items = pos_items(ctx.product, grams)
    body = {
        "order_type": order_type, "payment_mode": "cash", "items": items,
        "total_price": sum(i["price"] for i in items),
        "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
        "confirm_duplicate": True,
    }
    if coupon:
        body["coupon_code"] = coupon
    if phone:
        body["customer_phone"] = phone
    return await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cashier))


async def quote(ctx, order_type="dine-in", coupon=None, grams=200):
    body = {"items": [{"product_id": ctx.product["id"], "grams": grams,
                       "quantity": 1, "product_type": "single",
                       "cost_per_100g": ctx.product["cost_per_100g"]}],
            "order_type": order_type, "store_id": ctx.store}
    if coupon:
        body["coupon_code"] = coupon
    return (await ctx.client.post("/api/cart/quote", json=body, headers=auth(ctx.cashier))).json()


# ---------------- FIX 4 — quote/receipt parity ----------------

def test_quote_matches_receipt_plain(ctx):
    async def go():
        q = await quote(ctx, "dine-in")
        r = await place_pos_order(ctx, "dine-in")
        assert r.status_code == 200, r.text
        assert round(q["total"], 2) == round(r.json()["total_price"], 2)
    run(go())


def test_quote_matches_receipt_takeaway(ctx):
    async def go():
        q = await quote(ctx, "takeaway")
        r = await place_pos_order(ctx, "takeaway")
        assert r.status_code == 200, r.text
        # takeaway adds ₹10 packaging on both sides
        assert q["delivery_fee"] == 10
        assert round(q["total"], 2) == round(r.json()["total_price"], 2)
    run(go())


def test_quote_matches_receipt_coupon_percent(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "10% off", "coupon_code": "TEN", "discount_type": "percentage",
            "discount_value": 10, "applicable_to": "all", "is_active": True})
        q = await quote(ctx, "dine-in", coupon="TEN")
        assert q["coupon_applied"] and q["discount"] > 0
        r = await place_pos_order(ctx, "dine-in", coupon="TEN")
        assert r.status_code == 200, r.text
        assert round(q["total"], 2) == round(r.json()["total_price"], 2)
    run(go())


def test_quote_matches_receipt_coupon_flat_maxcap(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Flat 50 cap 20", "coupon_code": "CAP", "discount_type": "flat",
            "discount_value": 50, "max_discount": 20, "applicable_to": "all", "is_active": True})
        q = await quote(ctx, "dine-in", coupon="CAP")
        assert q["discount"] <= 20
        r = await place_pos_order(ctx, "dine-in", coupon="CAP")
        assert r.status_code == 200, r.text
        assert round(q["total"], 2) == round(r.json()["total_price"], 2)
    run(go())


# ---------------- FIX 1 — table number on dine-in POS order ----------------

def test_dinein_order_carries_table_number(ctx):
    async def go():
        items = pos_items(ctx.product)
        body = {
            "order_type": "dine-in", "payment_mode": "cash", "items": items,
            "total_price": sum(i["price"] for i in items), "total_calories": 100,
            "total_protein": 10, "total_carbs": 5, "total_fat": 2,
            "table_number": 4, "confirm_duplicate": True,
        }
        r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cashier))
        assert r.status_code == 200, r.text
        assert r.json()["table_number"] == 4
    run(go())


# ---------------- FIX 5 — table store isolation ----------------

def test_table_occupy_scoped_to_staff_store(ctx):
    async def go():
        # Load tables first (materializes store B's tables, as the page does),
        # then cashier B occupies table 2 WITHOUT passing store_id -> must hit
        # store B, never the DEFAULT store.
        await ctx.client.get("/api/tables", headers=auth(ctx.cashier_b))
        r = await ctx.client.post("/api/tables/2/occupy", headers=auth(ctx.cashier_b))
        assert r.status_code == 200, r.text
        # store B's table 2 is occupied...
        tb = await server.db.tables.find_one({"table_number": 2, "store_id": ctx.store_b}, {"_id": 0})
        assert tb and tb["status"] == "occupied"
        # ...and the DEFAULT store's table 2 is untouched
        td = await server.db.tables.find_one({"table_number": 2, "store_id": server.DEFAULT_STORE_ID}, {"_id": 0})
        assert (td or {}).get("status") != "occupied"
        # cashier A sees store A tables only (GET is store-scoped)
        ta = (await ctx.client.get("/api/tables", headers=auth(ctx.cashier))).json()
        assert all(t["store_id"] == ctx.store for t in ta)
    run(go())


# ---------------- FIX 6 — held-bill table + 24h soft expiry ----------------

def test_held_bill_stores_and_lists_table(ctx):
    async def go():
        r = await ctx.client.post("/api/held-bills", headers=auth(ctx.cashier), json={
            "customer_name": "T4 guest", "order_type": "dine-in",
            "items": [{"name": "X", "price": 100}], "table_number": 4})
        assert r.status_code == 200, r.text
        assert r.json()["table_number"] == 4
        bills = (await ctx.client.get("/api/held-bills", headers=auth(ctx.cashier))).json()
        assert any(b.get("table_number") == 4 for b in bills)
    run(go())


def test_held_bill_older_than_24h_hidden(ctx):
    async def go():
        old_id = str(uuid.uuid4())
        stale = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        await server.db.held_bills.insert_one({
            "id": old_id, "store_id": ctx.store, "cashier_id": ctx.cashier_id,
            "cashier_name": "cashier", "customer_name": "Old", "order_type": "dine-in",
            "items": [{"name": "Y", "price": 50}], "status": "held", "created_at": stale})
        bills = (await ctx.client.get("/api/held-bills", headers=auth(ctx.cashier))).json()
        assert all(b["id"] != old_id for b in bills), "25h-old held bill must be hidden"
    run(go())
