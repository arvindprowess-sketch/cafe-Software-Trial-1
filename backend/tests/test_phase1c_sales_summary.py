"""Phase 1C-backend — sales aggregation (store-vs-store, scope-locked).

In-process (mongomock). Sales/orders metrics ONLY — asserts no cost/COGS/
margin/profit leaks into the response.

Run:  pytest backend/tests/test_phase1c_sales_summary.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase1c_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def order_payload(store_id, product, price, created_at=None, qty_grams=100):
    # Server-authoritative pricing: line = grams/100 * cost_per_100g. The test
    # product is priced at ₹100/100g, so grams == price makes the server line == price.
    p = {
        "order_type": "dine-in",
        "store_id": store_id,
        "items": [{
            "product_id": product["id"], "product_name": product["name"],
            "grams": price, "price": price, "quantity": 1,
            "calories": 100, "protein": 10, "carbs": 5, "fat": 2, "product_type": "single",
        }],
        "total_price": price,
        "total_calories": 100, "total_protein": 10, "total_carbs": 5, "total_fat": 2,
        "confirm_duplicate": True,
    }
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
        c.hq_token = await hq_token()

        async def mk_store(name, code):
            return (await client.post("/api/stores", json={"name": name, "code": code},
                                      headers=auth(c.hq_token))).json()["store_id"]
        c.store_a = await mk_store("Store A", "AAA")
        c.store_b = await mk_store("Store B", "BBB")
        c.store_c = await mk_store("Store C", "CCC")

        async def mk_staff(role, store_id=None, cluster=None, pin="0000"):
            body = {"name": role, "role": role, "login_code": f"CODE-{pin}", "password": "password123"}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq_token))
            return server.create_token(r.json()["id"], role)

        c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="1111")
        c.manager_a = await mk_staff("store_manager", store_id=c.store_a, pin="2222")
        c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="3333")
        c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="4444")

        # Dedicated product at ₹100/100g so the server line price == the test's price.
        import uuid as _uuid
        c.product = {"id": str(_uuid.uuid4()), "name": "Test Item", "cost_per_100g": 100}
        await server.db.products.insert_one({
            "id": c.product["id"], "name": "Test Item", "product_type": "single",
            "cost_per_100g": 100, "available_qty_grams": 0, "is_active": True,
            "calories_per_100g": 100, "protein_per_100g": 10, "carbs_per_100g": 5, "fat_per_100g": 2})
        cust = (await client.post("/api/auth/register", json={
            "email": "c1@test.com", "password": "p", "name": "c1", "role": "customer"})).json()["token"]

        # Seed orders: A=2 (100, 300), B=1 (200), C=0
        for price in (100, 300):
            await client.post("/api/orders", json=order_payload(c.store_a, c.product, price), headers=auth(cust))
        await client.post("/api/orders", json=order_payload(c.store_b, c.product, 200), headers=auth(cust))

        # Backdate one Store A order to 2020 to test the date filter
        await server.db.orders.update_one(
            {"store_id": c.store_a, "total_price": 300},
            {"$set": {"created_at": "2020-01-01T10:00:00+00:00"}})
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- role scope (#1 leak: cross-store / cross-cluster) ----------

def test_area_manager_outside_cluster_403(ctx):
    async def go():
        r = await ctx.client.get(f"/api/reports/sales-summary?store_ids={ctx.store_c}", headers=auth(ctx.area_ab))
        assert r.status_code == 403, r.text
    run(go())


def test_store_manager_other_store_403(ctx):
    async def go():
        r = await ctx.client.get(f"/api/reports/sales-summary?store_ids={ctx.store_b}", headers=auth(ctx.manager_a))
        assert r.status_code == 403
    run(go())


def test_cashier_and_kitchen_403(ctx):
    async def go():
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.get("/api/reports/sales-summary", headers=auth(tok))
            assert r.status_code == 403, r.text
    run(go())


# ---------- aggregation correctness ----------

def test_super_admin_all_one_object_per_store(ctx):
    async def go():
        r = await ctx.client.get("/api/reports/sales-summary", headers=auth(ctx.hq_token))
        assert r.status_code == 200, r.text
        rows = {x["store_id"]: x for x in r.json()}
        # all three stores present (incl. zero-order Store C)
        assert {ctx.store_a, ctx.store_b, ctx.store_c} <= set(rows)
        # No date filter -> Store A has both orders (100 + 300)
        assert rows[ctx.store_a]["order_count"] == 2
        assert rows[ctx.store_a]["gross_revenue"] == 400
        assert rows[ctx.store_a]["avg_order_value"] == 200
        assert rows[ctx.store_b]["order_count"] == 1
        assert rows[ctx.store_b]["gross_revenue"] == 200
        assert rows[ctx.store_c]["order_count"] == 0
        # top products present for A
        assert rows[ctx.store_a]["top_products"][0]["product_id"] == ctx.product["id"]
    run(go())


def test_date_range_excludes_out_of_range(ctx):
    async def go():
        # Range covering only 2026 excludes the backdated 2020 order
        r = await ctx.client.get("/api/reports/sales-summary?from=2026-01-01&to=2030-01-01", headers=auth(ctx.hq_token))
        rows = {x["store_id"]: x for x in r.json()}
        assert rows[ctx.store_a]["order_count"] == 1       # only the in-range (100) order
        assert rows[ctx.store_a]["gross_revenue"] == 100
    run(go())


def test_area_manager_scoped_to_cluster_by_default(ctx):
    async def go():
        r = await ctx.client.get("/api/reports/sales-summary", headers=auth(ctx.area_ab))
        assert r.status_code == 200
        ids = {x["store_id"] for x in r.json()}
        assert ids == {ctx.store_a, ctx.store_b}   # cluster only, never Store C
    run(go())


def test_store_manager_own_store_only(ctx):
    async def go():
        r = await ctx.client.get("/api/reports/sales-summary", headers=auth(ctx.manager_a))
        ids = [x["store_id"] for x in r.json()]
        assert ids == [ctx.store_a]
    run(go())


# ---------- NO cost / COGS / margin / profit (#1 leak point) ----------

def test_response_has_no_cost_or_profit_fields(ctx):
    async def go():
        r = await ctx.client.get("/api/reports/sales-summary", headers=auth(ctx.hq_token))
        banned = ("cost", "cogs", "margin", "profit")
        import json as _json
        blob = _json.dumps(r.json()).lower()
        for word in banned:
            assert word not in blob, f"forbidden term '{word}' leaked into sales summary"
        # explicit key check on each store object
        for row in r.json():
            for k in row.keys():
                assert not any(b in k.lower() for b in banned), k
    run(go())
