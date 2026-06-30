"""Demo staff seeding — one login per staff role for role-separation testing.

In-process (mongomock_motor). Verifies POST /admin/seed-demo-staff is HQ-gated,
idempotent, creates area_manager/cashier/kitchen for the default store, and that
the seeded login_code + one-time password sign in to the correct role (Auth V2).

Run:  pytest backend/tests/test_demo_staff_seed.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "demostaff_test")
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
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        await client.post("/api/seed")
        # Ensure default store + the migration's store_manager.
        await server.run_store_migration()
        c.hq = await hq_token()
        # A plain customer for the 403 check
        c.cust = (await client.post("/api/auth/register", json={
            "email": "c@t.com", "password": "p", "name": "c", "role": "customer"})).json()["token"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


def test_non_super_admin_forbidden(ctx):
    async def go():
        r = await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.cust))
        assert r.status_code == 403, r.text
    run(go())


def test_seed_creates_each_role(ctx):
    async def go():
        r = await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        roles = {x["role"]: x for x in r.json()["demo_staff"]}
        assert {"area_manager", "cashier", "kitchen"} <= set(roles)
        # Each freshly-created role returns a login_code + one-time password.
        for role in ("area_manager", "cashier", "kitchen"):
            assert roles[role]["login_code"]
            assert roles[role]["password"]

        sid = server.DEFAULT_STORE_ID
        am = await server.db.users.find_one({"role": "area_manager", "cluster_store_ids": sid}, {"_id": 0})
        ca = await server.db.users.find_one({"role": "cashier", "store_id": sid}, {"_id": 0})
        ki = await server.db.users.find_one({"role": "kitchen", "store_id": sid}, {"_id": 0})
        assert am and am["cluster_store_ids"] == [sid]
        assert ca and ca["store_id"] == sid
        assert ki and ki["store_id"] == sid
        # Stored as password_hash + login_code_l; never a plaintext password / PIN.
        for doc in (am, ca, ki):
            assert "password_hash" in doc and doc.get("login_code_l")
            assert "pin_hash" not in doc and "pin_plain" not in doc
    run(go())


def test_idempotent_no_duplicates(ctx):
    async def go():
        # Seed twice more; counts must not grow beyond one demo user per role.
        await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.hq))
        await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.hq))
        sid = server.DEFAULT_STORE_ID
        assert await server.db.users.count_documents(
            {"role": "area_manager", "cluster_store_ids": sid}) == 1
        assert await server.db.users.count_documents(
            {"role": "cashier", "store_id": sid}) == 1
        assert await server.db.users.count_documents(
            {"role": "kitchen", "store_id": sid}) == 1
    run(go())


def test_login_returns_right_role(ctx):
    async def go():
        # Re-seed to capture the (idempotent) demo creds; only freshly-created
        # users return a plaintext password, so create them in a clean DB slice.
        server.client = AsyncMongoMockClient()
        server.db = server.client["demostaff_login_test"]
        await ctx.client.post("/api/seed")
        await server.run_store_migration()
        hq = await hq_token()
        creds = (await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(hq))).json()["demo_staff"]
        by_role = {x["role"]: x for x in creds}
        for role in ("area_manager", "cashier", "kitchen"):
            code, pw = by_role[role]["login_code"], by_role[role]["password"]
            # Case-insensitive: log in with the lower-cased code.
            r = await ctx.client.post("/api/auth/login", json={"code": code.lower(), "password": pw})
            assert r.status_code == 200, f"{role}: {r.text}"
            assert r.json()["user"]["role"] == role
    run(go())


def test_store_manager_default_uses_code_password(ctx):
    async def go():
        # Fresh slice so the migration's default store_manager is a single row.
        server.client = AsyncMongoMockClient()
        server.db = server.client["demostaff_sm_test"]
        await ctx.client.post("/api/seed")
        await server.run_store_migration()
        sid = server.DEFAULT_STORE_ID
        assert await server.db.users.count_documents(
            {"role": "store_manager", "store_id": sid}) == 1
        sm = await server.db.users.find_one({"role": "store_manager", "store_id": sid}, {"_id": 0})
        assert sm.get("login_code_l"), "store_manager must have a login code"
        assert "password_hash" in sm
        assert "pin_plain" not in sm and "pin_hash" not in sm, "PIN must be fully retired"
    run(go())
