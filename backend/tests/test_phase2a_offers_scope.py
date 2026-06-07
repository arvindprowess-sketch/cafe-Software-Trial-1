"""Phase 2A — scope-aware offers/coupons (backend).

In-process (mongomock). Verifies scope/date/usage enforcement in BOTH
apply-coupon and cart_quote, role-scoped create gating, redemption tracking,
and backward compatibility for scope-less offers.

Run:  pytest backend/tests/test_phase2a_offers_scope.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase2a_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def order_payload(store_id, product, price=120, coupon=None):
    p = {
        "order_type": "dine-in",
        "store_id": store_id,
        "items": [{
            "product_id": product["id"], "product_name": product["name"],
            "grams": 100, "price": price, "quantity": 1,
            "calories": 100, "protein": 10, "carbs": 5, "fat": 2, "product_type": "single",
        }],
        "total_price": price,
        "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
        "confirm_duplicate": True,
    }
    if coupon:
        p["coupon_code"] = coupon
    return p


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

        async def mk_store(name, code):
            return (await client.post("/api/stores", json={"name": name, "code": code}, headers=auth(c.hq))).json()["store_id"]
        c.store_a = await mk_store("A", "AAA")
        c.store_b = await mk_store("B", "BBB")
        c.store_c = await mk_store("C", "CCC")

        async def mk_staff(role, store_id=None, cluster=None, pin="0000"):
            body = {"name": role, "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            sid = r.json()["id"]
            return sid, server.create_token(sid, role)

        c.area_id, c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="1111")
        c.mgr_id, c.manager_a = await mk_staff("store_manager", store_id=c.store_a, pin="2222")
        _, c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="3333")

        async def mk_customer(email):
            return (await client.post("/api/auth/register", json={"email": email, "password": "p", "name": email, "role": "customer"})).json()

        c.cust1 = await mk_customer("u1@t.com")
        c.cust2 = await mk_customer("u2@t.com")
        c.product = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _apply(ctx, token, code, store_id, total=100):
    return await ctx.client.post("/api/orders/apply-coupon", headers=auth(token),
                                 json={"coupon_code": code, "cart_items": [{"price": total}], "cart_total": total, "store_id": store_id})


# ---------- backward compatibility ----------

def test_scopeless_offer_treated_as_all(ctx):
    async def go():
        # Insert a legacy offer with NO scope field
        await server.db.offers.insert_one({
            "id": str(uuid.uuid4()), "title": "Legacy", "coupon_code": "LEGACY",
            "discount_type": "flat", "discount_value": 15, "applicable_to": "all",
            "min_order_value": 0, "is_active": True,
        })
        r = await _apply(ctx, ctx.cust1["token"], "LEGACY", ctx.store_b, total=100)
        assert r.status_code == 200, r.text
        assert r.json()["computed_discount"] == 15
    run(go())


# ---------- date enforcement (both paths) ----------

def test_expired_offer_rejected_both_paths(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Old", "coupon_code": "OLD", "discount_type": "flat", "discount_value": 20,
            "applicable_to": "all", "end_date": "2020-01-01T00:00:00+00:00", "is_active": True})
        # apply-coupon -> 400 expired
        r = await _apply(ctx, ctx.cust1["token"], "OLD", ctx.store_a, total=200)
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower(), r.text
        # cart_quote -> coupon_error mentions expired, discount 0
        q = await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust1["token"]), json={
            "items": [{"product_id": ctx.product["id"], "grams": 200, "cost_per_100g": ctx.product["cost_per_100g"]}],
            "order_type": "dine-in", "coupon_code": "OLD", "store_id": ctx.store_a})
        assert q.status_code == 200
        assert q.json()["discount"] == 0
        assert "expired" in (q.json()["coupon_error"] or "").lower()
    run(go())


# ---------- scope enforcement ----------

def test_scope_stores(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "StoreA only", "coupon_code": "ONLYA", "discount_type": "flat", "discount_value": 25,
            "applicable_to": "all", "scope": "stores", "store_ids": [ctx.store_a]})
        ok = await _apply(ctx, ctx.cust1["token"], "ONLYA", ctx.store_a, total=200)
        assert ok.status_code == 200 and ok.json()["computed_discount"] == 25
        bad = await _apply(ctx, ctx.cust1["token"], "ONLYA", ctx.store_b, total=200)
        assert bad.status_code == 400 and "store" in bad.json()["detail"].lower()
    run(go())


def test_scope_cluster(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Cluster AB", "coupon_code": "CLUSAB", "discount_type": "flat", "discount_value": 10,
            "applicable_to": "all", "scope": "cluster", "cluster_owner_id": ctx.area_id})
        ok = await _apply(ctx, ctx.cust1["token"], "CLUSAB", ctx.store_b, total=200)
        assert ok.status_code == 200, ok.text
        bad = await _apply(ctx, ctx.cust1["token"], "CLUSAB", ctx.store_c, total=200)
        assert bad.status_code == 400
    run(go())


# ---------- create gating ----------

def test_area_manager_cannot_create_all(ctx):
    async def go():
        r = await ctx.client.post("/api/offers", headers=auth(ctx.area_ab), json={
            "title": "x", "coupon_code": "AMALL", "discount_type": "flat", "discount_value": 5, "scope": "all"})
        assert r.status_code == 403
    run(go())


def test_area_manager_stores_scope_enforced(ctx):
    async def go():
        outside = await ctx.client.post("/api/offers", headers=auth(ctx.area_ab), json={
            "title": "x", "coupon_code": "AMOUT", "discount_type": "flat", "discount_value": 5,
            "scope": "stores", "store_ids": [ctx.store_c]})
        assert outside.status_code == 403
        inside = await ctx.client.post("/api/offers", headers=auth(ctx.area_ab), json={
            "title": "x", "coupon_code": "AMIN", "discount_type": "flat", "discount_value": 5,
            "scope": "stores", "store_ids": [ctx.store_a]})
        assert inside.status_code == 200, inside.text
    run(go())


def test_store_manager_scope(ctx):
    async def go():
        other = await ctx.client.post("/api/offers", headers=auth(ctx.manager_a), json={
            "title": "x", "coupon_code": "SMOUT", "discount_type": "flat", "discount_value": 5,
            "scope": "stores", "store_ids": [ctx.store_b]})
        assert other.status_code == 403
        own = await ctx.client.post("/api/offers", headers=auth(ctx.manager_a), json={
            "title": "x", "coupon_code": "SMOWN", "discount_type": "flat", "discount_value": 5,
            "scope": "stores", "store_ids": [ctx.store_a]})
        assert own.status_code == 200, own.text
    run(go())


def test_cashier_cannot_create_offer(ctx):
    async def go():
        r = await ctx.client.post("/api/offers", headers=auth(ctx.cashier_a), json={
            "title": "x", "coupon_code": "CASH", "discount_type": "flat", "discount_value": 5,
            "scope": "stores", "store_ids": [ctx.store_a]})
        assert r.status_code == 403
    run(go())


# ---------- usage limits ----------

def test_usage_limit_total(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Cap1", "coupon_code": "CAP1", "discount_type": "flat", "discount_value": 10,
            "applicable_to": "all", "usage_limit_total": 1})
        # one redemption already exists -> limit reached
        await server.db.coupon_redemptions.insert_one({"id": str(uuid.uuid4()), "coupon_code": "CAP1", "user_id": "someone"})
        r = await _apply(ctx, ctx.cust1["token"], "CAP1", ctx.store_a, total=100)
        assert r.status_code == 400 and "limit" in r.json()["detail"].lower()
    run(go())


def test_usage_limit_per_user(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Once", "coupon_code": "ONCE", "discount_type": "flat", "discount_value": 10,
            "applicable_to": "all", "usage_limit_per_user": 1})
        await server.db.coupon_redemptions.insert_one({"id": str(uuid.uuid4()), "coupon_code": "ONCE", "user_id": ctx.cust1["user"]["id"]})
        used = await _apply(ctx, ctx.cust1["token"], "ONCE", ctx.store_a, total=100)
        assert used.status_code == 400 and "already used" in used.json()["detail"].lower()
        other = await _apply(ctx, ctx.cust2["token"], "ONCE", ctx.store_a, total=100)
        assert other.status_code == 200, other.text
    run(go())


# ---------- first_order_only ----------

def test_first_order_only(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "New users", "coupon_code": "NEWBIE", "discount_type": "flat", "discount_value": 10,
            "applicable_to": "all", "first_order_only": True})
        # brand-new customer with no orders -> ok
        fresh = (await ctx.client.post("/api/auth/register", json={"email": "fresh@t.com", "password": "p", "name": "f", "role": "customer"})).json()
        ok = await _apply(ctx, fresh["token"], "NEWBIE", ctx.store_a, total=100)
        assert ok.status_code == 200, ok.text
        # place an order for them, then it's no longer their first
        await ctx.client.post("/api/orders", json=order_payload(ctx.store_a, ctx.product), headers=auth(fresh["token"]))
        again = await _apply(ctx, fresh["token"], "NEWBIE", ctx.store_a, total=100)
        assert again.status_code == 400 and "first order" in again.json()["detail"].lower()
    run(go())


# ---------- redemption tracking ----------

def test_redemption_written_once_on_placed_order_only(ctx):
    async def go():
        await ctx.client.post("/api/offers", headers=auth(ctx.hq), json={
            "title": "Track", "coupon_code": "TRACK", "discount_type": "flat", "discount_value": 10, "applicable_to": "all"})
        # quote + apply-coupon must NOT write a redemption
        await _apply(ctx, ctx.cust1["token"], "TRACK", ctx.store_a, total=100)
        await ctx.client.post("/api/cart/quote", headers=auth(ctx.cust1["token"]), json={
            "items": [{"product_id": ctx.product["id"], "grams": 100, "cost_per_100g": ctx.product["cost_per_100g"]}],
            "order_type": "dine-in", "coupon_code": "TRACK", "store_id": ctx.store_a})
        assert await server.db.coupon_redemptions.count_documents({"coupon_code": "TRACK"}) == 0
        # placing an order with the coupon writes exactly one
        await ctx.client.post("/api/orders", json=order_payload(ctx.store_a, ctx.product, coupon="TRACK"), headers=auth(ctx.cust1["token"]))
        assert await server.db.coupon_redemptions.count_documents({"coupon_code": "TRACK"}) == 1
    run(go())


def test_no_edit_or_delete_route_for_redemptions(ctx):
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    assert not any("coupon_redemptions" in p or "redemptions" in p for (p, _m) in routes)
