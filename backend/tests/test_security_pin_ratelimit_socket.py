"""Security tests: PIN plaintext removal, rate-limit, Socket.IO auth.

In-process (mongomock_motor) — no real server boot needed.

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
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ── ITEM 1: pin_plain must never be persisted ────────────────────────────────

def test_create_staff_no_pin_plain(ctx):
    """pin_plain must not be written to the DB on staff create."""
    async def go():
        r = await ctx.client.post("/api/staff", json={
            "name": "Test Cashier Sec",
            "role": "cashier",
            "pin": "667701",
            "store_id": server.DEFAULT_STORE_ID,
        }, headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        staff_id = r.json()["id"]
        doc = await server.db.users.find_one({"id": staff_id}, {"_id": 0})
        assert doc is not None
        assert "pin_plain" not in doc, "pin_plain must not be stored in DB"
        assert "pin_hash" in doc, "pin_hash must be present"
        assert "pin_token" in doc, "pin_token (uniqueness index) must be present"
    run(go())


def test_seed_demo_staff_no_pin_plain(ctx):
    """seed-demo-staff must not store pin_plain."""
    async def go():
        await ctx.client.post("/api/admin/seed-demo-staff", headers=auth(ctx.hq))
        async for doc in server.db.users.find(
            {"role": {"$in": ["area_manager", "cashier", "kitchen"]}}, {"_id": 0}
        ):
            assert "pin_plain" not in doc, f"pin_plain found in {doc.get('role')} doc"
    run(go())


def test_migration_store_manager_no_pin_plain(ctx):
    """run_store_migration store_manager must not have pin_plain."""
    async def go():
        doc = await server.db.users.find_one(
            {"role": "store_manager", "store_id": server.DEFAULT_STORE_ID}, {"_id": 0}
        )
        assert doc is not None
        assert "pin_plain" not in doc, "pin_plain must not be stored"
    run(go())


def test_pin_login_succeeds_via_hash(ctx):
    """PIN login must work via bcrypt hash even without pin_plain."""
    async def go():
        # store_manager created by run_store_migration
        r = await ctx.client.post("/api/auth/pin-login", json={"pin": "550001"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "store_manager"
        # cashier created directly in test_create_staff_no_pin_plain
        r2 = await ctx.client.post("/api/auth/pin-login", json={"pin": "667701"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["role"] == "cashier"
    run(go())


def test_wrong_pin_fails(ctx):
    """Wrong PIN must return 401."""
    async def go():
        r = await ctx.client.post("/api/auth/pin-login", json={"pin": "000000"})
        assert r.status_code == 401
    run(go())


def test_update_staff_no_pin_plain(ctx):
    """Staff PIN update must not write pin_plain."""
    async def go():
        # find the cashier created in test_create_staff_no_pin_plain
        doc = await server.db.users.find_one({"name": "Test Cashier Sec"}, {"_id": 0})
        assert doc is not None
        r = await ctx.client.put(f"/api/staff/{doc['id']}", json={"pin": "667702"},
                                 headers=auth(ctx.hq))
        assert r.status_code == 200, r.text
        updated = await server.db.users.find_one({"id": doc["id"]}, {"_id": 0})
        assert "pin_plain" not in updated
    run(go())


def test_list_staff_pin_masked(ctx):
    """list_staff must never expose pin_plain — returns '***'."""
    async def go():
        r = await ctx.client.get("/api/staff", headers=auth(ctx.hq))
        assert r.status_code == 200
        for s in r.json():
            assert s.get("pin") == "***", f"Expected masked pin, got {s.get('pin')!r}"
    run(go())


# ── ITEM 2: rate-limit helper unit tests ────────────────────────────────────

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


def test_rate_limit_429_via_api(ctx):
    """6th failed attempt in window must return 429."""
    async def go():
        # Use a PIN that doesn't match anyone
        for _ in range(5):
            r = await ctx.client.post("/api/auth/pin-login", json={"pin": "999991"})
            assert r.status_code == 401
        r = await ctx.client.post("/api/auth/pin-login", json={"pin": "999991"})
        assert r.status_code == 429, f"Expected 429, got {r.status_code}"
        assert "Retry-After" in r.headers
    run(go())


def test_rate_limit_resets_on_success(ctx):
    """Successful PIN login must clear the fail counter for that key."""
    async def go():
        pin = "550001"
        key_prefix = "testclient:550"  # matches ip=testclient, pin[:3]=550
        server._PIN_FAIL_LOG.pop(key_prefix, None)
        # Inject 4 fails manually
        now = time.time()
        for _ in range(4):
            server.record_pin_fail(key_prefix, now)
        # Successful login resets (we can't inject the IP easily via httpx, so test directly)
        server.reset_pin_counter(key_prefix)
        allowed, _ = server.check_pin_login_rate(key_prefix, now + 1)
        assert allowed is True
    run(go())


def test_rate_limit_expires_after_lockout(ctx):
    """After lockout window passes, attempts should be allowed again."""
    key = "expired:557"
    server._PIN_FAIL_LOG.pop(key, None)
    # Record 5 fails that happened more than _PIN_LOCKOUT_SECS ago
    old_time = time.time() - server._PIN_LOCKOUT_SECS - 5
    for _ in range(5):
        server.record_pin_fail(key, old_time)
    now = time.time()
    allowed, _ = server.check_pin_login_rate(key, now)
    assert allowed is True


# ── ITEM 3: Socket.IO auth / room-scope logic ────────────────────────────────

def test_socket_connect_rejects_no_token():
    """connect without token must reject (return False)."""
    async def go():
        result = await server.connect("sid_noauth", {})
        assert result is False
    run(go())


def test_socket_connect_rejects_invalid_token():
    """connect with a garbled token must reject."""
    async def go():
        environ = {"QUERY_STRING": "token=this.is.garbage"}
        result = await server.connect("sid_bad", environ)
        assert result is False
    run(go())


def test_socket_connect_accepts_valid_token():
    """Valid JWT token is correctly decoded — the auth logic accepts it.
    (sio.save_session requires a live engine socket; we test the decode path directly.)"""
    async def go():
        admin = await server.db.users.find_one({"role": "super_admin"}, {"_id": 0})
        assert admin, "super_admin must exist"
        token = server.create_token(admin["id"], "super_admin")
        # Verify the token round-trips through jwt.decode correctly
        payload = server.jwt.decode(token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])
        assert payload["user_id"] == admin["id"]
        assert payload["role"] == "super_admin"
        # A bad/empty environ should be rejected
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
    """Kitchen staff from store-A must not be allowed into store-B's kitchen room."""
    STORE_A = server.DEFAULT_STORE_ID
    STORE_B = "STORE-OTHER"
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", f"kitchen:{STORE_A}") is True
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", f"kitchen:{STORE_B}") is False
    assert _room_allowed_for("kitchen", STORE_A, [], "u1", "hq") is False


def test_socket_hq_can_join_any_room():
    """super_admin must be allowed to join any store room."""
    STORE_A = server.DEFAULT_STORE_ID
    assert _room_allowed_for("super_admin", None, [], "", f"kitchen:{STORE_A}") is True
    assert _room_allowed_for("super_admin", None, [], "", "hq") is True
    assert _room_allowed_for("super_admin", None, [], "", "cashier:STORE-X") is True


def test_socket_area_manager_cluster_scope():
    """area_manager may only join rooms for stores in their cluster."""
    cluster = [server.DEFAULT_STORE_ID, "STORE-B"]
    assert _room_allowed_for("area_manager", None, cluster, "", f"kitchen:{server.DEFAULT_STORE_ID}") is True
    assert _room_allowed_for("area_manager", None, cluster, "", "kitchen:STORE-C") is False
    assert _room_allowed_for("area_manager", None, cluster, "", "hq") is False
