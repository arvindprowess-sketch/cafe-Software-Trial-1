"""admin_audit — append-only admin audit trail + role-scoped read endpoint.

In-process (mongomock_motor). Note: StaffUpdate has no `role` field (role
changes aren't possible via the API), so the staff-change test covers the
deactivate path, which uses the same audit write as update.

Run:  pytest backend/tests/test_admin_audit.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "admin_audit_test")
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
        c.store_a = (await client.post("/api/stores", json={"name": "A", "code": "AUD-A"},
                                       headers=auth(c.hq))).json()["store_id"]
        c.store_b = (await client.post("/api/stores", json={"name": "B", "code": "AUD-B"},
                                       headers=auth(c.hq))).json()["store_id"]
        r = (await client.post("/api/staff", json={
            "name": "MgrA", "role": "store_manager", "store_id": c.store_a, "login_code": "CODE-7301", "password": "password123"},
            headers=auth(c.hq))).json()
        c.mgr_a = server.create_token(r["id"], "store_manager")
        r = (await client.post("/api/staff", json={
            "name": "CashA", "role": "cashier", "store_id": c.store_a, "login_code": "CODE-7302", "password": "password123"},
            headers=auth(c.hq))).json()
        c.cashier_a, c.cashier_a_id = server.create_token(r["id"], "cashier"), r["id"]
        r = (await client.post("/api/products", json={"name": "Audit Dish", "cost_per_100g": 50},
                               headers=auth(c.hq))).json()
        c.pid = r["id"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


def audit_rows(**q):
    return run(server.db.admin_audit.find(q, {"_id": 0}).sort("created_at", -1).to_list(100))


class TestAuditWrites:
    def test_product_price_update_writes_before_after(self, ctx):
        r = run(ctx.client.put(f"/api/products/{ctx.pid}", json={"cost_per_100g": 75},
                               headers=auth(ctx.hq)))
        assert r.status_code == 200, r.text
        rows = audit_rows(entity="product", entity_id=ctx.pid, action="update")
        assert rows, "no audit row written"
        row = rows[0]
        # Trimmed to changed keys: the price diff must land in before/after.
        assert row["before"]["cost_per_100g"] == 50
        assert row["after"]["cost_per_100g"] == 75
        assert row["actor_role"] == "super_admin"
        # Create was audited too (full doc, secrets/_id stripped).
        assert audit_rows(entity="product", entity_id=ctx.pid, action="create")

    def test_staff_deactivate_writes_row(self, ctx):
        r = run(ctx.client.put(f"/api/staff/{ctx.cashier_a_id}", json={"is_active": False},
                               headers=auth(ctx.hq)))
        assert r.status_code == 200, r.text
        rows = audit_rows(entity="staff", entity_id=ctx.cashier_a_id, action="deactivate")
        assert rows, "no audit row written"
        assert rows[0]["before"]["is_active"] is True
        assert rows[0]["after"]["is_active"] is False
        # No secrets in the audit trail.
        assert "pin_hash" not in (rows[0]["before"] or {})
        # Re-activate so the cashier token still works for the 403 test.
        run(ctx.client.put(f"/api/staff/{ctx.cashier_a_id}", json={"is_active": True},
                           headers=auth(ctx.hq)))


class TestAuditRead:
    def test_cashier_403(self, ctx):
        # The deactivate test above bumped this cashier's token_version (token
        # revocation), so mint a token carrying the CURRENT version: the request
        # must fail on role (403), not on a revoked token (401).
        doc = run(server.db.users.find_one({"id": ctx.cashier_a_id}, {"_id": 0}))
        tok = server.create_token(ctx.cashier_a_id, "cashier", doc.get("token_version", 0))
        r = run(ctx.client.get("/api/admin-audit", headers=auth(tok)))
        assert r.status_code == 403

    def test_store_manager_sees_only_own_store(self, ctx):
        # One override per store -> one store-scoped audit row each.
        for sid, tok in ((ctx.store_a, ctx.mgr_a), (ctx.store_b, ctx.hq)):
            r = run(ctx.client.put(f"/api/stores/{sid}/products/{ctx.pid}/override",
                                   json={"selling_price": 80}, headers=auth(tok)))
            assert r.status_code == 200, r.text
        body = run(ctx.client.get("/api/admin-audit", headers=auth(ctx.mgr_a))).json()
        assert body["entries"], "store manager should see own-store rows"
        assert all(e.get("store_id") == ctx.store_a for e in body["entries"])
        # HQ sees both stores.
        hq_body = run(ctx.client.get("/api/admin-audit", headers=auth(ctx.hq))).json()
        seen_stores = {e.get("store_id") for e in hq_body["entries"]}
        assert {ctx.store_a, ctx.store_b} <= seen_stores

    def test_pagination_limit_and_cursor(self, ctx):
        page1 = run(ctx.client.get("/api/admin-audit?limit=1", headers=auth(ctx.hq))).json()
        assert len(page1["entries"]) == 1 and page1["next_before"]
        page2 = run(ctx.client.get(f"/api/admin-audit?limit=1&before={page1['next_before']}",
                                   headers=auth(ctx.hq))).json()
        assert len(page2["entries"]) == 1
        assert page2["entries"][0]["created_at"] < page1["entries"][0]["created_at"]
        # limit hard-capped at 100
        capped = run(ctx.client.get("/api/admin-audit?limit=5000", headers=auth(ctx.hq)))
        assert capped.status_code == 200
