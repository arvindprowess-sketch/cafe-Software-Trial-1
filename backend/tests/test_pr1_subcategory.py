"""PR-1 — product subcategory + is_sellable + recipe-coverage report.

In-process tests (mongomock, no live server). Same harness style as Phase 1A.

Run:  pytest backend/tests/test_pr1_subcategory.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pr1_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


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
        await server.run_store_migration()
        c.hq = (await client.post("/api/auth/login", json={
            "email": "admin@dietcafe.com", "password": "admin123"})).json()["token"]
        c.store = server.DEFAULT_STORE_ID

        # A cashier (must be 403 on recipe-coverage)
        r = await client.post("/api/staff", json={
            "name": "Cash", "role": "cashier", "store_id": c.store, "pin": "4242"}, headers=auth(c.hq))
        assert r.status_code == 200, r.text
        c.cashier = server.create_token(r.json()["id"], "cashier")
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ── subcategory + is_sellable persistence / round-trip ───────────────────────

def test_single_create_persists_subcategory_and_sellable(ctx):
    async def go():
        r = await ctx.client.post("/api/products/single", json={
            "name": "Grilled Tofu PR1", "price": 120, "grams": 1000,
            "category_id": None, "subcategory": "Protein", "is_sellable": True,
        }, headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        doc = await server.db.products.find_one({"id": pid}, {"_id": 0})
        assert doc["subcategory"] == "Protein"
        assert doc["is_sellable"] is True
    run(go())


def test_create_non_sellable_single(ctx):
    async def go():
        r = await ctx.client.post("/api/products/single", json={
            "name": "Raw Olive Oil PR1", "price": 1, "grams": 5000,
            "subcategory": "Sauce", "is_sellable": False,
        }, headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        ctx.nonsellable_id = r.json()["id"]
        doc = await server.db.products.find_one({"id": ctx.nonsellable_id}, {"_id": 0})
        assert doc["is_sellable"] is False
    run(go())


def test_update_roundtrips_subcategory_and_sellable(ctx):
    async def go():
        r = await ctx.client.post("/api/products/single", json={
            "name": "Update Me PR1", "price": 50, "grams": 1000}, headers=auth(ctx.hq))
        pid = r.json()["id"]
        up = await ctx.client.put(f"/api/products/{pid}", json={
            "subcategory": "Veggies", "is_sellable": False}, headers=auth(ctx.hq))
        assert up.status_code == 200, up.text
        body = up.json()
        assert body["subcategory"] == "Veggies"
        assert body["is_sellable"] is False
    run(go())


# ── is_sellable filtering: customer menu + POS hide; admin + inventory keep ──

def test_non_sellable_absent_from_customer_menu(ctx):
    async def go():
        # global customer list (no store_id)
        menu = await ctx.client.get("/api/products")
        names = [p["name"] for p in menu.json()]
        assert "Raw Olive Oil PR1" not in names
        assert "Grilled Tofu PR1" in names  # sellable still present
    run(go())


def test_non_sellable_absent_from_pos_resolved_menu(ctx):
    async def go():
        menu = await ctx.client.get(f"/api/products?store_id={ctx.store}")
        names = [p["name"] for p in menu.json()]
        assert "Raw Olive Oil PR1" not in names
        # also via the dedicated store-menu endpoint
        menu2 = await ctx.client.get(f"/api/stores/{ctx.store}/menu")
        assert "Raw Olive Oil PR1" not in [p["name"] for p in menu2.json()]
    run(go())


def test_non_sellable_present_in_admin_list(ctx):
    async def go():
        allp = await ctx.client.get("/api/products/all", headers=auth(ctx.hq))
        names = [p["name"] for p in allp.json()]
        assert "Raw Olive Oil PR1" in names  # admin management still sees it
    run(go())


# ── recipe-coverage: report-only + scope-guarded ─────────────────────────────

def test_recipe_coverage_forbidden_for_cashier(ctx):
    async def go():
        r = await ctx.client.get(f"/api/catalog/recipe-coverage?store_id={ctx.store}",
                                 headers=auth(ctx.cashier))
        assert r.status_code == 403, r.text
    run(go())


def test_recipe_coverage_flags_empty_recipe_and_untracked(ctx):
    async def go():
        # ready_made with NO ingredients -> empty recipe
        rm = await ctx.client.post("/api/products/ready-made", json={
            "name": "Ghost Bowl PR1", "price": 200, "serving_grams": 300,
            "ingredients": [{"name": "Mystery", "grams_per_serving": 100}],
            "category_id": None,
        }, headers=auth(ctx.hq))
        assert rm.status_code == 200, rm.text
        ghost_id = rm.json()["id"]

        r = await ctx.client.get(f"/api/catalog/recipe-coverage?store_id={ctx.store}",
                                 headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        report = r.json()
        by_id = {x["product_id"]: x for x in report}
        # Ghost Bowl's single ingredient resolves to no inventory row -> flagged
        assert ghost_id in by_id, "ready_made with untracked ingredient must be flagged"
        # The sellable tofu single has no inventory row either -> flagged
        tofu = await server.db.products.find_one({"name": "Grilled Tofu PR1"}, {"_id": 0})
        assert tofu["id"] in by_id
        # Report-only: nothing was written to movement_log for these
        moved = await server.db.movement_log.count_documents({"ref_id": ghost_id})
        assert moved == 0
    run(go())


def test_recipe_coverage_excludes_non_sellable(ctx):
    async def go():
        r = await ctx.client.get(f"/api/catalog/recipe-coverage?store_id={ctx.store}",
                                 headers=auth(ctx.hq))
        ids = [x["product_id"] for x in r.json()]
        # The non-sellable raw is never sold -> not a ghost-stock risk -> excluded
        assert ctx.nonsellable_id not in ids
    run(go())


def test_recipe_coverage_resolves_when_inventory_linked(ctx):
    async def go():
        # Create a single + an inventory row linked to it -> NOT flagged.
        sp = await ctx.client.post("/api/products/single", json={
            "name": "Tracked Rice PR1", "price": 30, "grams": 1000}, headers=auth(ctx.hq))
        pid = sp.json()["id"]
        inv = await ctx.client.post(f"/api/inventory/{ctx.store}/items", json={
            "name": "Tracked Rice PR1", "unit": "g", "product_id": pid,
            "qty_on_hand": 5000, "avg_cost": 0.03}, headers=auth(ctx.hq))
        assert inv.status_code == 200, inv.text
        r = await ctx.client.get(f"/api/catalog/recipe-coverage?store_id={ctx.store}",
                                 headers=auth(ctx.hq))
        ids = [x["product_id"] for x in r.json()]
        assert pid not in ids, "single with a linked inventory row must NOT be flagged"
    run(go())
