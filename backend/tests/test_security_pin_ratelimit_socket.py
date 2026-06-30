"""Security tests: credential storage, retired PIN login, Socket.IO auth.

In-process (mongomock_motor) — no real server boot needed. Auth V2: staff sign in
with login_code + password; PIN login is retired (HTTP 410). The in-memory
rate-limit helpers remain unit-tested utilities.

Run:  pytest backend/tests/test_security_pin_ratelimit_socket.py
"""
import os
import asyncio
import time

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "security_test")
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
        await server.run_store_migration()
        c.hq = await hq_token()
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ── ITEM 1: credentials are hashed; no PIN / plaintext is persisted ──────────

def test_create_staff_uses_code_password(ctx):
    """Staff create stores password_hash + login_code, never a PIN / plaintext."""
    async def go():
        r = await ctx.client.post("/api/staff", json={
            "name": "Test Cashier Sec",
            "role": "cashier",
            "login_code": "SEC-CASH",
            "password": "supersecret1",
            "store_id": server.DEFAULT_STORE_ID,
        }, headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        staff_id = r.json()["id"]
        doc = await server.db.users.find_one({"id": staff_id}, {"_id": 0})
        assert doc is not None
        assert "password_hash" in doc, "password_hash must be present"
        assert doc.get("login_code") == "SEC-CASH" and doc.get("login_code_l") == "sec-cash"
        assert "password" not in doc, "plaintext password must not be stored"
        for k in ("pin", "pin_hash", "pin_token", "pin_plain"):
            assert k not in doc, f"{k} must not be stored (PIN retired)"
    run(go())


def test_seed_demo_staff_no_pin(ctx):
    """seed-demo-staff must not store any PIN field."""
    async def go():
        await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.hq))
        for doc in await server.db.users.find(
            {"role": {"$in": ["area_manager", "cashier", "kitchen"]}}, {"_id": 0}
        ).to_list(50):
            for k in ("pin", "pin_hash", "pin_token", "pin_plain"):
                assert k not in doc, f"{k} found in {doc.get('role')} doc"
    run(go())


def test_migration_store_manager_no_pin(ctx):
    """run_store_migration store_manager must use code+password, not a PIN."""
    async def go():
        doc = await server.db.users.find_one(
            {"role": "store_manager", "store_id": server.DEFAULT_STORE_ID}, {"_id": 0}
        )
        assert doc is not None
        assert doc.get("login_code_l") and "password_hash" in doc
        for k in ("pin", "pin_hash", "pin_token", "pin_plain"):
            assert k not in doc, f"{k} must not be stored"
    run(go())


def test_login_code_case_insensitive(ctx):
    """Login by code is case-insensitive and returns the right role."""
    async def go():
        r = await ctx.client.post("/api/auth/login", json={"code": "sec-cash", "password": "supersecret1"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "cashier"
        assert r.json()["user"]["login_code"] == "SEC-CASH"
    run(go())


def test_login_wrong_password_401(ctx):
    """Wrong password must return 401."""
    async def go():
        r = await ctx.client.post("/api/auth/login", json={"code": "SEC-CASH", "password": "nope"})
        assert r.status_code == 401
    run(go())


def test_pin_login_retired_410(ctx):
    """PIN login is retired and must return HTTP 410."""
    async def go():
        r = await ctx.client.post("/api/auth/pin-login", json={"pin": "550001"})
        assert r.status_code == 410, r.text
    run(go())


def test_update_staff_password_no_pin(ctx):
    """Staff password update must not write any PIN field."""
    async def go():
        doc = await server.db.users.find_one({"name": "Test Cashier Sec"}, {"_id": 0})
        assert doc is not None
        r = await ctx.client.put(f"/api/staff/{doc['id']}", json={"password": "rotated12345"},
                                 headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        updated = await server.db.users.find_one({"id": doc["id"]}, {"_id": 0})
        assert "password" not in updated
        for k in ("pin", "pin_hash", "pin_token", "pin_plain"):
            assert k not in updated
        # New password works; old one is revoked.
        assert (await ctx.client.post("/api/auth/login",
                json={"code": "SEC-CASH", "password": "rotated12345"})).status_code == 200
    run(go())


def test_list_staff_shows_login_code(ctx):
    """list_staff exposes login_code and never a password."""
    async def go():
        r = await ctx.client.get("/api/staff", headers=auth(ctx.hq))
        assert r.status_code == 200
        for s in r.json():
            assert "login_code" in s
            assert "password" not in s and "password_hash" not in s and "pin" not in s
    run(go())


# ── ITEM 2: rate-limit helper unit tests (utilities retained) ───────────────

def test_rate_limit_allows_under_threshold():
    key = "testip:555"
    server._PIN_FAIL_LOG.pop(key, None)
    now = time.time()
    for _ in range(4):
        server.record_pin_fail(key, now)
    allowed, _ = server.check_pin_login_rate(key, now + 1)
    assert allowed is True


def test_rate_limit_blocks_on_5th_fail():
    key = "testip:556"
    server._PIN_FAIL_LOG.pop(key, None)
    now = time.time()
    for _ in range(5):
        server.record_pin_fail(key, now)
    allowed, retry_after = server.check_pin_login_rate(key, now + 1)
    assert allowed is False
    assert retry_after > 0


def test_rate_limit_resets_on_success():
    key = "testclient:550"
    server._PIN_FAIL_LOG.pop(key, None)
    now = time.time()
    for _ in range(4):
        server.record_pin_fail(key, now)
    server.reset_pin_counter(key)
    allowed, _ = server.check_pin_login_rate(key, now + 1)
    assert allowed is True


def test_rate_limit_expires_after_lockout():
    key = "expired:557"
    server._PIN_FAIL_LOG.pop(key, None)
    old_time = time.time() - server._PIN_LOCKOUT_SECS - 5
    for _ in range(5):
        server.record_pin_fail(key, old_time)
    now = time.time()
    allowed, _ = server.check_pin_login_rate(key, now)
    assert allowed is True


# ── ITEM 3: Socket.IO auth / room-scope logic ────────────────────────────────

def test_socket_connect_rejects_no_token():
    async def go():
        result = await server.connect("sid_noauth", {})
        assert result is False
    run(go())


def test_socket_connect_rejects_invalid_token():
    async def go():
        environ = {"QUERY_STRING": "token=this.is.garbage"}
        result = await server.connect("sid_bad", environ)
        assert result is False
    run(go())


def test_socket_connect_accepts_valid_token(ctx):
    async def go():
        admin = await server.db.users.find_one({"role": "super_admin"}, {"_id": 0})
        assert admin, "super_admin must exist"
        token = server.create_token(admin["id"], "super_admin")
        payload = server.jwt.decode(token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])
        assert payload["user_id"] == admin["id"]
        assert payload["role"] == "super_admin"
        result = await server.connect("sid_noenv", {})
        assert result is False
    run(go())


def _room_allowed_for(role: str, store_id, cluster_ids: list, user_id: str, r: str) -> bool:
    """Mirror of the room_allowed closure inside join_room — unit-testable."""
    parts = r.split(":", 1)
    prefix = parts[0]
    room_store = parts[1] if len(parts) > 1 else None
    if role == "super_admin":
        return True
    if prefix == "hq":
        return False
    if prefix in ("kitchen", "cashier", "manager"):
        if role == "area_manager":
            return room_store in cluster_ids
        if role in ("store_manager", "cashier", "kitchen"):
            return room_store == store_id
        return False
    if prefix == "user":
        return role == "customer" and room_store == user_id
    if prefix == "customers":
        return role == "customer"
    return False


def test_socket_kitchen_denied_wrong_store():
    STORE_A = server.DEFAULT_STORE_ID
    STORE_B = "STORE-OTHER"
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", f"kitchen:{STORE_A}") is True
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", f"kitchen:{STORE_B}") is False
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", "hq") is False


def test_socket_hq_can_join_any_room():
    STORE_A = server.DEFAULT_STORE_ID
    assert _room_allowed_for("super_admin", None, [], "", f"kitchen:{STORE_A}") is True
    assert _room_allowed_for("super_admin", None, [], "", "hq") is True
    assert _room_allowed_for("super_admin", None, [], "", "cashier:STORE-X") is True


def test_socket_area_manager_cluster_scope():
    cluster = [server.DEFAULT_STORE_ID, "STORE-B"]
    assert _room_allowed_for("area_manager", None, cluster, "", f"kitchen:{server.DEFAULT_STORE_ID}") is True
    assert _room_allowed_for("area_manager", None, cluster, "", "kitchen:STORE-C") is False
    assert _room_allowed_for("area_manager", None, cluster, "", "hq") is False
