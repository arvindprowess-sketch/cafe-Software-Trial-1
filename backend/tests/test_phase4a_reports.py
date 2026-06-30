"""Phase 4A — costing + P&L + report endpoints (read-only).

In-process (mongomock). Verifies COGS from movement_log, P&L math + monthly
buckets, wastage = approved discards only, scope guards, ranking, inventory
report ties, and read-only audit log.

Run:  pytest backend/tests/test_phase4a_reports.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase4a_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def loose_order(store_id, pid, name, grams=100, price=100):
    return {
        "order_type": "dine-in", "store_id": store_id,
        "items": [{"product_id": pid, "product_name": name, "grams": grams, "price": price,
                   "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        "total_price": price, "item_subtotal": price,
        "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1,
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
        c.hq = await hq_token()

        async def mk_store(n, code):
            return (await client.post("/api/stores", json={"name": n, "code": code}, headers=auth(c.hq))).json()["store_id"]
        c.store_a = await mk_store("A", "AAA")
        c.store_b = await mk_store("B", "BBB")
        c.store_z = await mk_store("Z", "ZZZ")

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
        c.cust = (await client.post("/api/auth/register", json={"email": "c@t.com", "password": "p", "name": "c", "role": "customer"})).json()["token"]

        # A dedicated loose product with a CLEAN store-A raw row (qty 0, avg 0),
        # then inward 10000 @ ₹0.5/g -> avg_cost exactly 0.5 (no migration dilution).
        c.prod = {"id": str(uuid.uuid4()), "name": "Test Chicken", "cost_per_100g": 150}
        await server.db.products.insert_one({
            "id": c.prod["id"], "name": c.prod["name"], "product_type": "single",
            "cost_per_100g": 150, "available_qty_grams": 0, "is_active": True,
            "calories_per_100g": 100, "protein_per_100g": 10, "carbs_per_100g": 5, "fat_per_100g": 2})
        await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr_a),
                          json={"name": "Test Chicken", "unit": "g", "product_id": c.prod["id"], "qty_on_hand": 0, "avg_cost": 0})
        await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr_a),
                          json={"product_id": c.prod["id"], "qty": 10000, "purchase_price": 0.5})
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- COGS + P&L math ----------

def test_pnl_cogs_from_movement_and_profit(ctx):
    async def go():
        # sale 200g @ ₹0.5/g raw -> COGS 100; price 300, subtotal 300 -> profit 200
        r = await ctx.client.post("/api/orders", json=loose_order(ctx.store_a, ctx.prod["id"], ctx.prod["name"], grams=200, price=300), headers=auth(ctx.cust))
        assert r.status_code == 200, r.text
        p = await ctx.client.get("/api/reports/pnl", headers=auth(ctx.mgr_a))
        assert p.status_code == 200, p.text
        row = next(x for x in p.json() if x["store_id"] == ctx.store_a)
        assert row["revenue"] == 300
        assert row["cogs"] == 100         # 200g * 0.5
        assert row["gross_profit"] == 200  # 300 - 0 discount - 100
        assert row["order_count"] == 1
    run(go())


def test_pnl_monthly_buckets_and_wastage_approved_only(ctx):
    async def go():
        # raise + approve a discard (wastage); plus a pending one that must NOT count
        # approved: 100g @0.5 = ₹50 value
        d = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": None, "product_id": ctx.prod["id"], "qty": 100, "reason": "spoiled"})
        # discard needs item_id for raw; fetch the inventory item id
        it = await server.db.inventory_items.find_one({"store_id": ctx.store_a, "product_id": ctx.prod["id"]}, {"_id": 0})
        d = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": it["id"], "qty": 100, "reason": "spoiled"})
        did = d.json()["id"]
        await ctx.client.put(f"/api/discards/{did}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        # a pending (un-decided) discard -> excluded from wastage
        await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": it["id"], "qty": 50, "reason": "spillage"})

        p = await ctx.client.get("/api/reports/pnl?granularity=monthly", headers=auth(ctx.mgr_a))
        row = next(x for x in p.json() if x["store_id"] == ctx.store_a)
        assert row["wastage"] == 50, row          # only the approved 100g*0.5
        assert row["net_contribution"] == row["gross_profit"] - 50
        assert "months" in row and len(row["months"]) >= 1
    run(go())


# ---------- scope guards ----------

def test_consolidated_hq_only(ctx):
    async def go():
        ok = await ctx.client.get("/api/reports/pnl/consolidated", headers=auth(ctx.hq))
        assert ok.status_code == 200 and "company" in ok.json()
        for tok in (ctx.area_ab, ctx.mgr_a, ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.get("/api/reports/pnl/consolidated", headers=auth(tok))
            assert r.status_code == 403
    run(go())


def test_pnl_scope_enforced(ctx):
    async def go():
        # area manager including a store outside its cluster -> 403
        r = await ctx.client.get(f"/api/reports/pnl?store_ids={ctx.store_z}", headers=auth(ctx.area_ab))
        assert r.status_code == 403
        # store manager other store -> 403
        r2 = await ctx.client.get(f"/api/reports/pnl?store_ids={ctx.store_b}", headers=auth(ctx.mgr_a))
        assert r2.status_code == 403
        # cashier/kitchen any report -> 403
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            assert (await ctx.client.get("/api/reports/pnl", headers=auth(tok))).status_code == 403
            assert (await ctx.client.get("/api/reports/items", headers=auth(tok))).status_code == 403
    run(go())


def test_ranking_scope(ctx):
    async def go():
        # store_manager -> 403 (single store)
        assert (await ctx.client.get("/api/reports/ranking", headers=auth(ctx.mgr_a))).status_code == 403
        # area sees only own cluster (A,B) — never Z
        r = await ctx.client.get("/api/reports/ranking", headers=auth(ctx.area_ab))
        assert r.status_code == 200
        ids = {s["store_id"] for s in r.json()["by_revenue"]}
        assert ids == {ctx.store_a, ctx.store_b}
    run(go())


# ---------- inventory report ----------

def test_inventory_report_ties(ctx):
    async def go():
        r = await ctx.client.get(f"/api/reports/inventory?store_id={ctx.store_a}", headers=auth(ctx.mgr_a))
        assert r.status_code == 200, r.text
        body = r.json()
        # consumption ties to sale movements (200g sold @0.5 = 100) ...
        assert body["consumption"] == 100
        # wastage ties to approved discards (50)
        assert body["wastage"] == 50
        # purchases: one inward of 10000g @0.5 = 5000
        assert body["purchases"]["total"] == 5000
        # cost-restricted
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            assert (await ctx.client.get(f"/api/reports/inventory?store_id={ctx.store_a}", headers=auth(tok))).status_code == 403
    run(go())


# ---------- audit log ----------

def test_audit_log_readonly_and_scoped(ctx):
    async def go():
        r = await ctx.client.get(f"/api/reports/audit-log?store_id={ctx.store_a}", headers=auth(ctx.mgr_a))
        assert r.status_code == 200
        assert len(r.json()["entries"]) > 0
        # cashier/kitchen 403
        assert (await ctx.client.get(f"/api/reports/audit-log?store_id={ctx.store_a}", headers=auth(ctx.cashier_a))).status_code == 403
        # store manager A cannot read store B audit
        assert (await ctx.client.get(f"/api/reports/audit-log?store_id={ctx.store_b}", headers=auth(ctx.mgr_a))).status_code == 403
    run(go())
    # No mutation route for reports/* (all GET)
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    report_routes = [(p, m) for (p, m) in routes if "/reports/" in p]
    assert all(m in ("GET", "HEAD") for (_p, m) in report_routes), report_routes
