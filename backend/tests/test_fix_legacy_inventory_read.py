"""FIX 2 — legacy inventory reads repointed to inventory_items / movement_log.

In-process (mongomock). Order-independent.

Run:  pytest backend/tests/test_fix_legacy_inventory_read.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "fixinv_test")
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
        c.store_b = (await client.post("/api/stores", json={"name": "B", "code": "BBB"}, headers=auth(c.hq))).json()["store_id"]
        c.store_z = (await client.post("/api/stores", json={"name": "Z", "code": "ZZZ"}, headers=auth(c.hq))).json()["store_id"]

        async def mk_staff(role, store_id=None, cluster=None, pin="0"):
            body = {"name": role + pin, "role": role, "login_code": f"CODE-{pin}", "password": "password123"}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return r.json()["id"], server.create_token(r.json()["id"], role)
        c.mgr_a_id, c.mgr_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_a_id, c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.kitchen_a_id, c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="3333")
        c.area_ab_id, c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="4444")

        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))

        # Store-A raw item with a distinct qty + an inward (creates a movement_log row)
        c.item_a = (await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr_a),
                                      json={"name": "Chicken", "unit": "g", "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
        await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr_a),
                          json={"item_id": c.item_a, "qty": 4321, "purchase_price": 2})
        # Store-B item (to confirm isolation)
        c.item_b = (await client.post(f"/api/inventory/{c.store_b}/items", headers=auth(c.area_ab),
                                      json={"name": "Paneer", "unit": "g", "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
        await client.post(f"/api/inventory/{c.store_b}/inward", headers=auth(c.area_ab),
                          json={"item_id": c.item_b, "qty": 99, "purchase_price": 3})
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- GET /inventory ----------

def test_inventory_kitchen_scoped_no_cost(ctx):
    async def go():
        r = await ctx.client.get("/api/inventory", headers=auth(ctx.kitchen_a))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert all(row["store_id"] == ctx.store_a for row in rows)         # only store A
        assert all("avg_cost" not in row for row in rows)                  # no cost for kitchen
        chick = next(row for row in rows if row["id"] == ctx.item_a)
        assert chick["qty_on_hand"] == 4321 and chick["available_qty_grams"] == 4321  # from inventory_items
    run(go())


def test_inventory_manager_sees_cost(ctx):
    async def go():
        r = await ctx.client.get("/api/inventory", headers=auth(ctx.mgr_a))
        assert r.status_code == 200
        assert any("avg_cost" in row for row in r.json())
    run(go())


def test_inventory_area_out_of_cluster_403(ctx):
    async def go():
        r = await ctx.client.get(f"/api/inventory?store_id={ctx.store_z}", headers=auth(ctx.area_ab))
        assert r.status_code == 403
        # in-cluster store B ok
        ok = await ctx.client.get(f"/api/inventory?store_id={ctx.store_b}", headers=auth(ctx.area_ab))
        assert ok.status_code == 200 and all(row["store_id"] == ctx.store_b for row in ok.json())
    run(go())


def test_inventory_hq_all_or_scoped(ctx):
    async def go():
        allr = await ctx.client.get("/api/inventory", headers=auth(ctx.hq))
        assert allr.status_code == 200
        stores = {row["store_id"] for row in allr.json()}
        assert {ctx.store_a, ctx.store_b} <= stores                 # all stores in scope
        one = await ctx.client.get(f"/api/inventory?store_id={ctx.store_a}", headers=auth(ctx.hq))
        assert {row["store_id"] for row in one.json()} == {ctx.store_a}
    run(go())


def test_inventory_customer_403(ctx):
    async def go():
        tok = (await ctx.client.post("/api/auth/register", json={"email": "z@t.com", "password": "p", "name": "z", "role": "customer"})).json()["token"]
        r = await ctx.client.get("/api/inventory", headers=auth(tok))
        assert r.status_code == 403
    run(go())


# ---------- GET /inventory/stock-logs ----------

def test_stock_logs_cashier_scoped_no_cost(ctx):
    async def go():
        r = await ctx.client.get("/api/inventory/stock-logs", headers=auth(ctx.cashier_a))
        assert r.status_code == 200, r.text
        logs = r.json()
        assert all(l["store_id"] == ctx.store_a for l in logs)         # own store only
        assert all("unit_cost_at_time" not in l for l in logs)         # no cost for cashier
        assert any(l.get("type") == "inward" for l in logs)            # from movement_log
    run(go())


def test_stock_logs_manager_has_cost_and_scoped(ctx):
    async def go():
        r = await ctx.client.get("/api/inventory/stock-logs", headers=auth(ctx.mgr_a))
        assert r.status_code == 200
        logs = r.json()
        assert all(l["store_id"] == ctx.store_a for l in logs)
        assert any("unit_cost_at_time" in l for l in logs)             # manager sees cost
        # area outside cluster -> 403
        z = await ctx.client.get(f"/api/inventory/stock-logs?store_id={ctx.store_z}", headers=auth(ctx.area_ab))
        assert z.status_code == 403
    run(go())


# ---------- low-stock alerts repointed to inventory_items (Fix 2b) ----------

async def _mk_low_item(ctx, store, token, name, qty):
    """Create a raw item and inward `qty` so it is below the 500g default threshold."""
    iid = (await ctx.client.post(f"/api/inventory/{store}/items", headers=auth(token),
                                 json={"name": name, "unit": "g", "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
    await ctx.client.post(f"/api/inventory/{store}/inward", headers=auth(token),
                          json={"item_id": iid, "qty": qty, "purchase_price": 7})
    return iid


def test_dashboard_low_stock_from_inventory_items(ctx):
    async def go():
        await _mk_low_item(ctx, ctx.store_a, ctx.mgr_a, "LowMilk", 42)   # 42g < 500 -> low
        r = await ctx.client.get("/api/admin/dashboard-stats", headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        alerts = r.json()["low_stock_alerts"]
        by_name = {a["name"]: a for a in alerts}
        assert "LowMilk" in by_name                          # low item surfaces
        assert by_name["LowMilk"]["available_qty_grams"] == 42  # value from inventory_items
        assert "Chicken" not in by_name                      # 4321g in stock -> not low
    run(go())


def test_insights_analytics_low_stock_shape_and_source(ctx):
    # get_admin_analytics powers /admin/ai-insights; assert its low_stock_alerts keep
    # the {name, stock} shape AND come from inventory_items, store-scoped.
    async def go():
        hq_user = await server.db.users.find_one({"role": "super_admin"}, {"_id": 0})
        analytics = await server.get_admin_analytics(hq_user)
        alerts = analytics["low_stock_alerts"]
        assert all(set(a.keys()) == {"name", "stock"} for a in alerts)   # shape unchanged
        names = {a["name"]: a["stock"] for a in alerts}
        assert names.get("Paneer") == 99                                  # store_b, from inventory_items
        assert "Chicken" not in names                                     # 4321 in stock
    run(go())


def test_low_stock_helper_scoped_and_strips_cost(ctx):
    async def go():
        # store-A low item so a store-bound role has something to see
        await _mk_low_item(ctx, ctx.store_a, ctx.mgr_a, "LowOil", 30)
        kitchen_user = await server.db.users.find_one({"id": ctx.kitchen_a_id}, {"_id": 0})
        mgr_user = await server.db.users.find_one({"id": ctx.mgr_a_id}, {"_id": 0})
        k_rows = await server.low_stock_alerts(kitchen_user)
        m_rows = await server.low_stock_alerts(mgr_user)
        assert all(r["store_id"] == ctx.store_a for r in k_rows)   # store-scoped
        assert all("avg_cost" not in r for r in k_rows)            # kitchen: no cost
        assert any("avg_cost" in r for r in m_rows)                # manager: cost visible
        assert any(r["name"] == "LowOil" for r in k_rows)          # low item present
    run(go())
