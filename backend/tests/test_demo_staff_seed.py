"""Demo staff seeding — one login per staff role for role-separation testing.

In-process (mongomock_motor). Verifies POST /admin/seed-demo-staff is HQ-gated,
idempotent, creates area_manager/cashier/kitchen for the default store, and that
the seeded PINs pin-login to the correct role.

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
        # Ensure default store + the migration's store_manager (PIN 550001).
        await server.run_store_migration()
        c.hq = (await client.post("/api/auth/login", json={
            "email": "admin@dietcafe.com", "password": "admin123"})).json()["token"]
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

        sid = server.DEFAULT_STORE_ID
        am = await server.db.users.find_one({"role": "area_manager", "cluster_store_ids": sid}, {"_id": 0})
        ca = await server.db.users.find_one({"role": "cashier", "store_id": sid}, {"_id": 0})
        ki = await server.db.users.find_one({"role": "kitchen", "store_id": sid}, {"_id": 0})
        assert am and am["cluster_store_ids"] == [sid]
        assert ca and ca["store_id"] == sid
        assert ki and ki["store_id"] == sid
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


def test_pin_login_returns_right_role(ctx):
    async def go():
        for pin, role in [("550010", "area_manager"), ("550020", "cashier"), ("550030", "kitchen")]:
            r = await ctx.client.post("/api/auth/pin-login", json={"pin": pin})
            assert r.status_code == 200, f"{pin}: {r.text}"
            assert r.json()["user"]["role"] == role
    run(go())


def test_store_manager_550001_untouched(ctx):
    async def go():
        # The migration's store_manager (PIN 550001) must remain a single row.
        sid = server.DEFAULT_STORE_ID
        assert await server.db.users.count_documents(
            {"role": "store_manager", "store_id": sid}) == 1
        sm = await server.db.users.find_one({"role": "store_manager", "store_id": sid}, {"_id": 0})
        assert sm["pin_plain"] == "550001"
    run(go())
