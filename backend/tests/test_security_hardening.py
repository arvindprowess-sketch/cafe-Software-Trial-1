"""Security hardening — slowapi rate limits + token revocation (token_version).

In-process (mongomock_motor). The limiter is disabled by default under pytest
(so the rest of the suite's logins don't trip the shared in-memory window);
the autouse fixture re-enables it for this module and resets storage between
tests. The CORS production boot guard is covered by test_fix_env_guard.py.

Run:  pytest backend/tests/test_security_hardening.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "security_hardening_test")
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
        r = (await client.post("/api/staff", json={
            "name": "RevokeMe", "role": "cashier",
            "store_id": server.DEFAULT_STORE_ID, "login_code": "CODE-8642", "password": "password123"}, headers=auth(c.hq))).json()
        c.staff_id = r["id"]
        r = (await client.post("/api/auth/register", json={
            "email": "revoke@test.com", "password": "p", "name": "Cust", "role": "customer"})).json()
        c.cust, c.cust_id = r["token"], r["user"]["id"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


@pytest.fixture(autouse=True)
def rate_limiting(ctx):
    """Enable the limiter for these tests only; clean windows before and after."""
    server.limiter.reset()
    server._otp_phone_storage.reset()
    server.limiter.enabled = True
    yield
    server.limiter.enabled = False
    server.limiter.reset()
    server._otp_phone_storage.reset()


class TestOTPRateLimits:
    def test_fourth_send_for_same_phone_429(self, ctx):
        for _ in range(3):
            r = run(ctx.client.post("/api/auth/otp/send", json={"phone": "9876500001"}))
            assert r.status_code == 200, r.text
        r = run(ctx.client.post("/api/auth/otp/send", json={"phone": "9876500001"}))
        assert r.status_code == 429
        # Key is per-phone: a different number still goes through.
        r2 = run(ctx.client.post("/api/auth/otp/send", json={"phone": "9876500002"}))
        assert r2.status_code == 200

    def test_phone_limit_applies_to_resend_too(self, ctx):
        for _ in range(3):
            assert run(ctx.client.post("/api/auth/otp/send",
                                       json={"phone": "9876500003"})).status_code == 200
        # Resend shares the same per-phone window (well past the 30s resend gate
        # check since last_sent_at was just written — expect the 429 from the
        # 30-second guard or the phone window; either way it's throttled).
        r = run(ctx.client.post("/api/auth/otp/resend", json={"phone": "9876500003"}))
        assert r.status_code == 429

    def test_verify_otp_hammering_429(self, ctx):
        for _ in range(10):
            r = run(ctx.client.post("/api/auth/otp/verify",
                                    json={"phone": "9876500004", "otp": "000000"}))
            assert r.status_code == 400  # wrong/absent OTP, but not yet throttled
        r = run(ctx.client.post("/api/auth/otp/verify",
                                json={"phone": "9876500004", "otp": "000000"}))
        assert r.status_code == 429


class TestTokenRevocation:
    def test_version_bump_revokes_token(self, ctx):
        assert run(ctx.client.get("/api/auth/me", headers=auth(ctx.cust))).status_code == 200
        run(server.db.users.update_one({"id": ctx.cust_id}, {"$inc": {"token_version": 1}}))
        r = run(ctx.client.get("/api/auth/me", headers=auth(ctx.cust)))
        assert r.status_code == 401
        # A token minted with the new version works again.
        fresh = server.create_token(ctx.cust_id, "customer", 1)
        assert run(ctx.client.get("/api/auth/me", headers=auth(fresh))).status_code == 200

    def test_deactivated_staff_token_401(self, ctx):
        staff_tok = server.create_token(ctx.staff_id, "cashier")  # tv=0 matches absent field
        assert run(ctx.client.get("/api/auth/me", headers=auth(staff_tok))).status_code == 200
        r = run(ctx.client.put(f"/api/staff/{ctx.staff_id}", json={"is_active": False},
                               headers=auth(ctx.hq)))
        assert r.status_code == 200, r.text
        # Token now rejected (account inactive AND token_version bumped to 1).
        assert run(ctx.client.get("/api/auth/me", headers=auth(staff_tok))).status_code == 401
        doc = run(server.db.users.find_one({"id": ctx.staff_id}, {"_id": 0}))
        assert doc["is_active"] is False
        assert doc["token_version"] == 1
