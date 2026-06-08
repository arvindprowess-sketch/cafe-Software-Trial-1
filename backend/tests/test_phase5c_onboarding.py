"""Phase 5C — store onboarding workflow + go-live gating.

In-process (mongomock). Order-independent (each test builds its own store).

Run:  pytest backend/tests/test_phase5c_onboarding.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase5c_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server

_codeseq = [0]


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
        c.hq = (await client.post("/api/auth/login", json={"email": "admin@dietcafe.com", "password": "admin123"})).json()["token"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _mk_store(ctx, gst=None, fssai=None):
    _codeseq[0] += 1
    body = {"name": f"S{_codeseq[0]}", "code": f"C{_codeseq[0]:04d}"}
    if gst:
        body["gst_no"] = gst
    if fssai:
        body["fssai_license"] = fssai
    return (await ctx.client.post("/api/stores", json=body, headers=auth(ctx.hq))).json()["store_id"]


async def _mk_staff(ctx, role, store_id=None, cluster=None):
    _codeseq[0] += 1
    body = {"name": f"{role}{_codeseq[0]}", "role": role, "pin": f"{7000 + _codeseq[0]}"}
    if store_id:
        body["store_id"] = store_id
    if cluster:
        body["cluster_store_ids"] = cluster
    r = await ctx.client.post("/api/staff", json=body, headers=auth(ctx.hq))
    return r.json()["id"], server.create_token(r.json()["id"], role)


# ---------- go-live hard gate ----------

def test_go_live_requires_gst_and_fssai(ctx):
    async def go():
        s = await _mk_store(ctx)  # no compliance
        r = await ctx.client.post(f"/api/stores/{s}/go-live", headers=auth(ctx.hq))
        assert r.status_code == 400 and "FSSAI" in r.json()["detail"]
        # add GST only -> still 400
        await ctx.client.put(f"/api/stores/{s}", json={"gst_no": "29ABCDE1234F1Z5"}, headers=auth(ctx.hq))
        assert (await ctx.client.post(f"/api/stores/{s}/go-live", headers=auth(ctx.hq))).status_code == 400
        # add FSSAI too -> live
        await ctx.client.put(f"/api/stores/{s}", json={"fssai_license": "12345678901234"}, headers=auth(ctx.hq))
        ok = await ctx.client.post(f"/api/stores/{s}/go-live", headers=auth(ctx.hq))
        assert ok.status_code == 200 and ok.json()["onboarding_status"] == "live"
    run(go())


# ---------- transitions are super_admin only ----------

def test_transitions_super_admin_only(ctx):
    async def go():
        s = await _mk_store(ctx, gst="G", fssai="F")
        _, area = await _mk_staff(ctx, "area_manager", cluster=[s])
        mgr_id, mgr = await _mk_staff(ctx, "store_manager", store_id=s)
        # area_manager can READ own cluster
        r = await ctx.client.get(f"/api/stores/{s}/onboarding", headers=auth(area))
        assert r.status_code == 200 and "checklist" in r.json()
        # but cannot transition
        a = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(area))
        assert a.status_code == 403
        g = await ctx.client.post(f"/api/stores/{s}/go-live", headers=auth(area))
        assert g.status_code == 403
        # store_manager cannot transition
        assert (await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(mgr))).status_code == 403
        # cashier/kitchen cannot even read
        _, cash = await _mk_staff(ctx, "cashier", store_id=s)
        _, kit = await _mk_staff(ctx, "kitchen", store_id=s)
        assert (await ctx.client.get(f"/api/stores/{s}/onboarding", headers=auth(cash))).status_code == 403
        assert (await ctx.client.get(f"/api/stores/{s}/onboarding", headers=auth(kit))).status_code == 403
    run(go())


# ---------- full advance flow + checklist gates ----------

def test_advance_flow_with_gates(ctx):
    async def go():
        s = await _mk_store(ctx)  # created, no compliance, no overrides, no staff
        # advance created -> catalog_priced fails without overrides/accept
        a1 = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a1.status_code == 400
        # accept master prices -> catalog_priced
        a1b = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={"accept_master_prices": True}, headers=auth(ctx.hq))
        assert a1b.status_code == 200 and a1b.json()["onboarding_status"] == "catalog_priced"
        # staff_assigned fails (no area manager / store manager yet)
        a2 = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a2.status_code == 400
        # assign area manager + a store manager
        await ctx.client.put(f"/api/stores/{s}", json={"area_manager_id": "am-1"}, headers=auth(ctx.hq))
        await _mk_staff(ctx, "store_manager", store_id=s)
        a2b = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a2b.status_code == 200 and a2b.json()["onboarding_status"] == "staff_assigned"
        # compliance_done fails without GST/FSSAI
        a3 = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a3.status_code == 400
        await ctx.client.put(f"/api/stores/{s}", json={"gst_no": "G1", "fssai_license": "F1"}, headers=auth(ctx.hq))
        a3b = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a3b.status_code == 200 and a3b.json()["onboarding_status"] == "compliance_done"
        # advancing further routes to go-live
        a4 = await ctx.client.post(f"/api/stores/{s}/onboarding/advance", json={}, headers=auth(ctx.hq))
        assert a4.status_code == 400 and "go-live" in a4.json()["detail"]
        ok = await ctx.client.post(f"/api/stores/{s}/go-live", headers=auth(ctx.hq))
        assert ok.status_code == 200 and ok.json()["onboarding_status"] == "live"
    run(go())


# ---------- pending list ----------

def test_pending_list_hq_only_and_reflects_non_live(ctx):
    async def go():
        s_pending = await _mk_store(ctx)  # stays non-live
        s_live = await _mk_store(ctx, gst="G", fssai="F")
        await ctx.client.post(f"/api/stores/{s_live}/go-live", headers=auth(ctx.hq))
        p = await ctx.client.get("/api/stores/onboarding/pending", headers=auth(ctx.hq))
        assert p.status_code == 200
        ids = {x["store_id"] for x in p.json()}
        assert s_pending in ids and s_live not in ids
        # non-HQ forbidden
        _, area = await _mk_staff(ctx, "area_manager", cluster=[s_pending])
        assert (await ctx.client.get("/api/stores/onboarding/pending", headers=auth(area))).status_code == 403
    run(go())
