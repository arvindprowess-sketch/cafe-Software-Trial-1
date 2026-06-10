"""PR-2 — GST/FSSAI expiry dates + 90-day go-live gate + 30-day expiring report.

In-process tests (mongomock, no live server).

Run:  pytest backend/tests/test_pr2_compliance_expiry.py
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pr2_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def iso_in(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


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
        # cashier for scope-guard
        r = await client.post("/api/staff", json={
            "name": "Cash", "role": "cashier", "store_id": server.DEFAULT_STORE_ID, "pin": "4343"}, headers=auth(c.hq))
        c.cashier = server.create_token(r.json()["id"], "cashier")
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _mk_store(c, code, **kw):
    body = {"name": f"Store {code}", "code": code, **kw}
    r = await c.client.post("/api/stores", json=body, headers=auth(c.hq))
    assert r.status_code == 200, r.text
    return r.json()["store_id"]


# ── persistence / round-trip ─────────────────────────────────────────────────

def test_expiry_persists_and_roundtrips(ctx):
    async def go():
        sid = await _mk_store(ctx, "EXP1", gst_no="22AAAAA0000A1Z5", fssai_license="12345678901234",
                              gst_expiry_at=iso_in(400), fssai_expiry_at=iso_in(400))
        s = (await ctx.client.get(f"/api/stores/{sid}", headers=auth(ctx.hq))).json()
        assert s["gst_expiry_at"] == iso_in(400)
        assert s["fssai_expiry_at"] == iso_in(400)
        # update round-trip
        up = await ctx.client.put(f"/api/stores/{sid}", json={"gst_expiry_at": iso_in(500)}, headers=auth(ctx.hq))
        assert up.json()["gst_expiry_at"] == iso_in(500)
    run(go())


# ── go-live expiry gate ──────────────────────────────────────────────────────

def test_go_live_rejected_when_expiry_missing(ctx):
    async def go():
        sid = await _mk_store(ctx, "EXP2", gst_no="22AAAAA0000A1Z5", fssai_license="12345678901234")
        r = await ctx.client.post(f"/api/stores/{sid}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 400, r.text
        assert "expiry" in r.json()["detail"].lower()
    run(go())


def test_go_live_rejected_when_expiry_within_90_days(ctx):
    async def go():
        sid = await _mk_store(ctx, "EXP3", gst_no="22AAAAA0000A1Z5", fssai_license="12345678901234",
                              gst_expiry_at=iso_in(45), fssai_expiry_at=iso_in(400))
        r = await ctx.client.post(f"/api/stores/{sid}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 400, r.text
        assert "GST" in r.json()["detail"]
    run(go())


def test_go_live_rejected_when_expired(ctx):
    async def go():
        sid = await _mk_store(ctx, "EXP4", gst_no="22AAAAA0000A1Z5", fssai_license="12345678901234",
                              gst_expiry_at=iso_in(400), fssai_expiry_at=iso_in(-5))
        r = await ctx.client.post(f"/api/stores/{sid}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 400, r.text
        assert "FSSAI" in r.json()["detail"]
    run(go())


def test_go_live_succeeds_with_valid_expiry_and_presence(ctx):
    async def go():
        sid = await _mk_store(ctx, "EXP5", gst_no="22AAAAA0000A1Z5", fssai_license="12345678901234",
                              gst_expiry_at=iso_in(200), fssai_expiry_at=iso_in(200))
        r = await ctx.client.post(f"/api/stores/{sid}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        assert r.json()["onboarding_status"] == "live"
    run(go())


def test_go_live_still_gates_missing_presence(ctx):
    async def go():
        # valid expiry but NO gst_no -> existing presence gate still fires
        sid = await _mk_store(ctx, "EXP6", fssai_license="12345678901234",
                              gst_expiry_at=iso_in(200), fssai_expiry_at=iso_in(200))
        r = await ctx.client.post(f"/api/stores/{sid}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 400, r.text
        assert "GST number and FSSAI license are required" in r.json()["detail"]
    run(go())


# ── expiring report ──────────────────────────────────────────────────────────

def test_expiring_lists_within_30_and_excludes_far(ctx):
    async def go():
        near = await _mk_store(ctx, "NEAR", gst_no="x", fssai_license="y",
                               gst_expiry_at=iso_in(20), fssai_expiry_at=iso_in(400))
        far = await _mk_store(ctx, "FAR", gst_no="x", fssai_license="y",
                              gst_expiry_at=iso_in(365), fssai_expiry_at=iso_in(365))
        r = await ctx.client.get("/api/stores/compliance/expiring", headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        by_id = {x["store_id"]: x for x in r.json()}
        assert near in by_id, "store expiring in 20 days must be listed"
        assert by_id[near]["days_remaining"] == 20
        assert far not in by_id, "store a year out must be excluded"
    run(go())


def test_expiring_scope_guarded(ctx):
    async def go():
        r = await ctx.client.get("/api/stores/compliance/expiring", headers=auth(ctx.cashier))
        assert r.status_code == 403, r.text
    run(go())
