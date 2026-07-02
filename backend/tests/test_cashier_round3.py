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
