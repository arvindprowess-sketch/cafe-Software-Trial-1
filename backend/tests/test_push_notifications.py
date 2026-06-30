"""P6 — Expo push notifications: token save/dedupe, status triggers, fail-safety.

In-process (mongomock_motor). The Expo HTTP layer (server._post_expo_push) is
monkeypatched — no real network.

Run:  pytest backend/tests/test_push_notifications.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "push_notifications_test")
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
        r = (await client.post("/api/auth/register", json={
            "email": "push@test.com", "password": "p", "name": "Pusher", "role": "customer"})).json()
        c.cust, c.cust_id = r["token"], r["user"]["id"]
        await server.db.users.update_one(
            {"id": c.cust_id},
            {"$push": {"push_tokens": {"token": "ExponentPushToken[seed]", "platform": "ios"}}})
        return c

    c = run(build())
    yield c
    run(client.aclose())


def make_order(ctx, order_type="dine-in"):
    oid = str(uuid.uuid4())
    run(server.db.orders.insert_one({
        "id": oid, "store_id": server.DEFAULT_STORE_ID, "user_id": ctx.cust_id,
        "status": "pending", "order_type": order_type, "items": [],
    }))
    return oid


def set_status(ctx, oid, status):
    return run(ctx.client.put(f"/api/orders/{oid}/status?status={status}", headers=auth(ctx.hq)))


@pytest.fixture
def expo(monkeypatch):
    """Capture Expo chunks; tickets default to ok."""
    sent = []

    async def fake_post(messages):
        sent.append(messages)
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(server, "_post_expo_push", fake_post)
    return sent


class TestTokenSave:
    def test_save_and_dedupe(self, ctx):
        for _ in range(2):  # same token twice -> one entry
            r = run(ctx.client.post("/api/users/push-token", headers=auth(ctx.cust),
                                    json={"token": "ExponentPushToken[devA]", "platform": "android"}))
            assert r.status_code == 200, r.text
        run(ctx.client.post("/api/users/push-token", headers=auth(ctx.cust),
                            json={"token": "ExponentPushToken[devB]", "platform": "ios"}))
        doc = run(server.db.users.find_one({"id": ctx.cust_id}, {"_id": 0}))
        tokens = [t["token"] for t in doc["push_tokens"]]
        assert tokens.count("ExponentPushToken[devA]") == 1
        assert "ExponentPushToken[devB]" in tokens

    def test_empty_token_400(self, ctx):
        r = run(ctx.client.post("/api/users/push-token", headers=auth(ctx.cust),
                                json={"token": "  ", "platform": "ios"}))
        assert r.status_code == 400


class TestStatusTriggers:
    @pytest.mark.parametrize("status,title", [
        ("accepted", "Order accepted ✅"),
        ("ready", "Order ready ⚡ FUEL pe aa jao"),
        ("completed", "Enjoy! 💪"),
    ])
    def test_status_sends_push(self, ctx, expo, status, title):
        oid = make_order(ctx)
        assert set_status(ctx, oid, status).status_code == 200
        titles = [m["title"] for chunk in expo for m in chunk]
        assert title in titles
        datas = [m["data"] for chunk in expo for m in chunk]
        assert any(d.get("order_id") == oid and d.get("status") == status for d in datas)

    def test_out_for_delivery_only_for_delivery_orders(self, ctx, expo):
        dine_in = make_order(ctx, order_type="dine-in")
        assert set_status(ctx, dine_in, "out_for_delivery").status_code == 200
        assert expo == []  # skipped for dine-in
        delivery = make_order(ctx, order_type="delivery")
        assert set_status(ctx, delivery, "out_for_delivery").status_code == 200
        assert any(m["title"] == "Rider nikal gaya 🛵" for chunk in expo for m in chunk)

    def test_non_push_status_silent(self, ctx, expo):
        oid = make_order(ctx)
        assert set_status(ctx, oid, "preparing").status_code == 200
        assert expo == []


class TestFailSafety:
    def test_push_failure_never_breaks_order_update(self, ctx, monkeypatch):
        async def boom(messages):
            raise RuntimeError("expo down")
        monkeypatch.setattr(server, "_post_expo_push", boom)
        oid = make_order(ctx)
        r = set_status(ctx, oid, "ready")
        assert r.status_code == 200
        assert r.json()["status"] == "ready"

    def test_device_not_registered_removes_token(self, ctx, monkeypatch):
        async def dead_device(messages):
            return [{"status": "error", "details": {"error": "DeviceNotRegistered"}}
                    for _ in messages]
        monkeypatch.setattr(server, "_post_expo_push", dead_device)
        run(server.db.users.update_one(
            {"id": ctx.cust_id},
            {"$push": {"push_tokens": {"token": "ExponentPushToken[dead]", "platform": "ios"}}}))
        run(server.send_push(ctx.cust_id, "t", "b", {}))
        doc = run(server.db.users.find_one({"id": ctx.cust_id}, {"_id": 0}))
        assert all(t["token"] != "ExponentPushToken[dead]" for t in doc.get("push_tokens", []))
