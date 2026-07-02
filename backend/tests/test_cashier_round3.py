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


# ---------------- FIX 2 — walk-in loyalty / customer resolution ----------------

async def _register_customer(ctx, email):
    return (await ctx.client.post("/api/auth/register", json={
        "email": email, "password": "p", "name": email, "role": "customer"})).json()


def test_pos_phone_grants_loyalty_to_customer_not_cashier(ctx):
    async def go():
        phone = "9876500011"
        r = await place_pos_order(ctx, "dine-in", phone=phone)
        assert r.status_code == 200, r.text
        order = r.json()
        # user_id stays the cashier (audit); customer_user_id points at the customer
        assert order["user_id"] == ctx.cashier_id
        assert order.get("customer_user_id")
        cust = await server.db.users.find_one({"phone": phone}, {"_id": 0})
        assert cust and cust["role"] == "customer" and cust.get("walk_in_created")
        assert order["customer_user_id"] == cust["id"]
        # loyalty credited to the CUSTOMER, never the cashier
        cust_loyalty = await server.db.loyalty.find_one({"user_id": cust["id"]}, {"_id": 0})
        assert cust_loyalty and cust_loyalty["points"] > 0
        cashier_loyalty = await server.db.loyalty.find_one({"user_id": ctx.cashier_id}, {"_id": 0})
        assert cashier_loyalty is None, "cashier must never earn points on a walk-in"
    run(go())


def test_same_phone_reuses_customer(ctx):
    async def go():
        phone = "9876500011"  # same as above
        before = await server.db.users.count_documents({"phone": phone})
        r = await place_pos_order(ctx, "dine-in", phone=phone)
        assert r.status_code == 200
        after = await server.db.users.count_documents({"phone": phone})
        assert before == after == 1, "must reuse the existing customer, not duplicate"
    run(go())


def test_pos_order_without_phone_grants_nobody(ctx):
    async def go():
        r = await place_pos_order(ctx, "dine-in")  # no phone
        assert r.status_code == 200
        assert r.json().get("customer_user_id") is None
        # cashier still earns nothing
        assert await server.db.loyalty.find_one({"user_id": ctx.cashier_id}, {"_id": 0}) is None
    run(go())


def test_lookup_endpoint(ctx):
    async def go():
        # unknown phone
        r = await ctx.client.get("/api/customers/lookup?phone=9000000000", headers=auth(ctx.cashier))
        assert r.status_code == 200 and r.json()["exists"] is False
        # known walk-in from earlier test, minimal PII only
        r2 = await ctx.client.get("/api/customers/lookup?phone=9876500011", headers=auth(ctx.cashier))
        body = r2.json()
        assert r2.status_code == 200 and body["exists"] is True
        assert set(body.keys()) == {"exists", "name", "loyalty_points"}
        assert body["loyalty_points"] > 0
        # invalid phone -> 400
        assert (await ctx.client.get("/api/customers/lookup?phone=123", headers=auth(ctx.cashier))).status_code == 400
    run(go())


def test_first_order_only_checks_customer_at_pos(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Welcome", "coupon_code": "FIRST", "discount_type": "flat",
            "discount_value": 20, "applicable_to": "all", "first_order_only": True, "is_active": True})
        phone = "9876500022"  # genuinely new
        # quote sees it as valid for the new phone
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cashier), json={
            "items": [{"product_id": ctx.product["id"], "grams": 200,
                       "cost_per_100g": ctx.product["cost_per_100g"]}],
            "order_type": "dine-in", "coupon_code": "FIRST", "store_id": ctx.store,
            "customer_phone": phone})
        assert q.json()["coupon_applied"] is True, q.text
        # 1st placement succeeds
        r1 = await place_pos_order(ctx, "dine-in", coupon="FIRST", phone=phone)
        assert r1.status_code == 200, r1.text
        # 2nd placement for the SAME phone is rejected (first order only)
        r2 = await place_pos_order(ctx, "dine-in", coupon="FIRST", phone=phone)
        assert r2.status_code == 400, r2.text
    run(go())


def test_app_customer_cash_order_still_grants(ctx):
    async def go():
        cust = await _register_customer(ctx, "appcash@t.com")
        items = pos_items(ctx.product)
        body = {
            "order_type": "dine-in", "payment_mode": "cash", "store_id": ctx.store,
            "items": items, "total_price": sum(i["price"] for i in items),
            "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
            "confirm_duplicate": True,
        }
        r = await ctx.client.post("/api/orders", json=body, headers=auth(cust["token"]))
        assert r.status_code == 200, r.text
        # regression: the app customer earns points (user_id is the customer here)
        loyalty = await server.db.loyalty.find_one({"user_id": cust["user"]["id"]}, {"_id": 0})
        assert loyalty and loyalty["points"] > 0
    run(go())


# ---------------- FIX 3 — offer channel (list filter + enforcement) ----------------

def test_offer_channel_list_and_enforcement(ctx):
    async def go():
        cust = await _register_customer(ctx, "chan@t.com")
        # app_only offer
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "App only", "coupon_code": "APPONLY", "discount_type": "flat",
            "discount_value": 15, "applicable_to": "all", "channel": "app_only", "is_active": True})
        # pos_only offer
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Counter only", "coupon_code": "POSONLY", "discount_type": "flat",
            "discount_value": 15, "applicable_to": "all", "channel": "pos_only", "is_active": True})

        # --- list filtering ---
        app_list = (await ctx.client.get("/api/offers", headers=auth(cust["token"]))).json()
        app_codes = {o.get("coupon_code") for o in app_list}
        assert "APPONLY" in app_codes and "POSONLY" not in app_codes
        pos_list = (await ctx.client.get("/api/offers", headers=auth(ctx.cashier))).json()
        pos_codes = {o.get("coupon_code") for o in pos_list}
        assert "POSONLY" in pos_codes and "APPONLY" not in pos_codes
        # anonymous == app channel
        anon = (await ctx.client.get("/api/offers")).json()
        assert "APPONLY" in {o.get("coupon_code") for o in anon}

        # --- enforcement (typing the code anyway) ---
        # POS tries the app_only code -> rejected
        r = await place_pos_order(ctx, "dine-in", coupon="APPONLY")
        assert r.status_code == 400, r.text
        # app customer tries the pos_only code -> rejected
        items = pos_items(ctx.product)
        body = {"order_type": "dine-in", "payment_mode": "cash", "store_id": ctx.store,
                "items": items, "total_price": sum(i["price"] for i in items),
                "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
                "coupon_code": "POSONLY", "confirm_duplicate": True}
        r2 = await ctx.client.post("/api/orders", json=body, headers=auth(cust["token"]))
        assert r2.status_code == 400, r2.text
        # correct channel works: POS + pos_only
        r3 = await place_pos_order(ctx, "dine-in", coupon="POSONLY")
        assert r3.status_code == 200, r3.text
    run(go())
