"""PR-4 — HQ-editable system settings (thresholds).

In-process (mongomock_motor), no live server.

Run:  pytest backend/tests/test_pr4_hq_settings.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pr4_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


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
    server._invalidate_settings_cache()
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        await client.post("/api/seed")
        await server.run_store_migration()
        c.hq = await hq_token()
        r = await client.post("/api/staff", json={
            "name": "Cash", "role": "cashier", "store_id": server.DEFAULT_STORE_ID, "login_code": "CODE-4455", "password": "password123"}, headers=auth(c.hq))
        c.cashier = server.create_token(r.json()["id"], "cashier")
        # an area_manager (non-super_admin HQ-ish) for the 403 check
        r2 = await client.post("/api/staff", json={
            "name": "Area", "role": "area_manager", "cluster_store_ids": [server.DEFAULT_STORE_ID], "login_code": "CODE-4466", "password": "password123"}, headers=auth(c.hq))
        c.area = server.create_token(r2.json()["id"], "area_manager")
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ── fallback when no doc exists ──────────────────────────────────────────────

def test_get_falls_back_to_defaults(ctx):
    async def go():
        server._invalidate_settings_cache()
        r = await ctx.client.get("/api/admin/settings", headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["hq_value_threshold"] == server.HQ_VALUE_THRESHOLD
        assert body["free_delivery_threshold"] == float(server.FREE_DELIVERY_THRESHOLD)
    run(go())


def test_get_setting_helper_fallback(ctx):
    async def go():
        await server.db.system_settings.delete_many({})
        server._invalidate_settings_cache()
        assert await server.get_setting("hq_value_threshold") == server.HQ_VALUE_THRESHOLD
        assert await server.get_setting("free_delivery_threshold") == float(server.FREE_DELIVERY_THRESHOLD)
    run(go())


# ── scope ────────────────────────────────────────────────────────────────────

def test_put_forbidden_non_hq(ctx):
    async def go():
        for tok in (ctx.cashier, ctx.area):
            r = await ctx.client.put("/api/admin/settings", json={"hq_value_threshold": 99}, headers=auth(tok))
            assert r.status_code == 403, r.text
        # GET also HQ-only
        assert (await ctx.client.get("/api/admin/settings", headers=auth(ctx.cashier))).status_code == 403
    run(go())


# ── persistence + effect on behaviour ────────────────────────────────────────

def test_put_persists_and_roundtrips(ctx):
    async def go():
        r = await ctx.client.put("/api/admin/settings", json={
            "hq_value_threshold": 500, "free_delivery_threshold": 1000}, headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        assert r.json()["hq_value_threshold"] == 500
        assert r.json()["free_delivery_threshold"] == 1000
        # round-trip via GET
        g = await ctx.client.get("/api/admin/settings", headers=auth(ctx.hq))
        assert g.json()["hq_value_threshold"] == 500
        # cache reflects new value through the helper
        assert await server.get_setting("hq_value_threshold") == 500
    run(go())


def test_discard_uses_updated_threshold(ctx):
    async def go():
        # threshold is 500 from the previous test; raise a discard worth >= 500
        # by adjusting an inventory item with a known avg_cost, then discarding.
        sid = server.DEFAULT_STORE_ID
        await server.db.inventory_items.insert_one({
            "id": "pr4raw", "store_id": sid, "product_id": None, "name": "PR4 Raw",
            "unit": "g", "qty_on_hand": 10000, "avg_cost": 1.0})
        server._invalidate_settings_cache()
        # value = grams * avg_cost = 600 * 1.0 = 600 >= 500 -> hq_required True
        r = await ctx.client.post("/api/discards", json={
            "store_id": sid, "target_type": "raw", "item_id": "pr4raw", "qty": 600, "reason": "expired"},
            headers=auth(ctx.hq))
        # super_admin may not be allowed to *raise* (only store_manager/kitchen do);
        # so raise as a store_manager instead.
        if r.status_code == 403:
            sm = await server.db.users.find_one({"role": "store_manager", "store_id": sid}, {"_id": 0})
            tok = server.create_token(sm["id"], "store_manager")
            r = await ctx.client.post("/api/discards", json={
                "store_id": sid, "target_type": "raw", "item_id": "pr4raw", "qty": 600, "reason": "expired"},
                headers=auth(tok))
        assert r.status_code == 200, r.text
        assert r.json()["hq_required"] is True  # 600 >= updated threshold 500

        # Now lower the threshold-busting qty: value 100 < 500 -> hq_required False
        sm = await server.db.users.find_one({"role": "store_manager", "store_id": sid}, {"_id": 0})
        tok = server.create_token(sm["id"], "store_manager")
        r2 = await ctx.client.post("/api/discards", json={
            "store_id": sid, "target_type": "raw", "item_id": "pr4raw", "qty": 100, "reason": "expired"},
            headers=auth(tok))
        assert r2.status_code == 200, r2.text
        assert r2.json()["hq_required"] is False  # 100 < 500
    run(go())
