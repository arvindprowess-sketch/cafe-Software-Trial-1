"""Payments hardening — server-derived amount, verify binding, prod mock gate, webhook.

In-process (mongomock_motor), no live server. Razorpay keys are absent, so
/payments/create-order runs in mock mode (allowed outside production).

Run:  pytest backend/tests/test_payments_hardening.py
"""
import os
import asyncio
import hashlib
import hmac
import json
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "payments_hardening_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")
# Mock mode must be active: no gateway keys.
os.environ.pop("RAZORPAY_KEY_ID", None)
os.environ.pop("RAZORPAY_KEY_SECRET", None)

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


WEBHOOK_SECRET = "whsec_test_123"


def sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


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
        r = (await client.post("/api/auth/register", json={
            "email": "pay1@test.com", "password": "p", "name": "Payer One", "role": "customer"})).json()
        c.cust, c.cust_id = r["token"], r["user"]["id"]
        r = (await client.post("/api/auth/register", json={
            "email": "pay2@test.com", "password": "p", "name": "Payer Two", "role": "customer"})).json()
        c.cust2, c.cust2_id = r["token"], r["user"]["id"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


def make_order(ctx, user_id, total=500.0, payment_status="unpaid", status="pending"):
    oid = str(uuid.uuid4())
    run(server.db.orders.insert_one({
        "id": oid, "store_id": server.DEFAULT_STORE_ID, "user_id": user_id,
        "total_price": total, "payment_status": payment_status, "status": status,
        "items": [],
    }))
    return oid


def create_payment(ctx, oid, token, extra_body=None):
    body = {"order_id": oid}
    if extra_body:
        body.update(extra_body)
    return run(ctx.client.post("/api/payments/create-order", json=body, headers=auth(token)))


class TestCreateOrderAmount:
    def test_amount_is_server_derived_and_client_amount_ignored(self, ctx):
        oid = make_order(ctx, ctx.cust_id, total=500.0)
        # Attacker sends amount=1 — must be ignored; amount comes from order.total_price.
        r = create_payment(ctx, oid, ctx.cust, extra_body={"amount": 1})
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 50000  # paise, from the ₹500 order
        payment = run(server.db.payments.find_one({"order_id": oid}, {"_id": 0}))
        assert payment["amount"] == 500.0

    def test_already_paid_order_rejected(self, ctx):
        oid = make_order(ctx, ctx.cust_id, payment_status="paid")
        assert create_payment(ctx, oid, ctx.cust).status_code == 400

    @pytest.mark.parametrize("status", ["cancelled", "voided", "refunded"])
    def test_dead_order_rejected(self, ctx, status):
        oid = make_order(ctx, ctx.cust_id, status=status)
        assert create_payment(ctx, oid, ctx.cust).status_code == 400


class TestVerifyBinding:
    def test_mismatched_order_id_400(self, ctx):
        oid = make_order(ctx, ctx.cust_id)
        other_oid = make_order(ctx, ctx.cust_id)
        rp = create_payment(ctx, oid, ctx.cust).json()["razorpay_order_id"]
        r = run(ctx.client.post("/api/payments/verify", headers=auth(ctx.cust), json={
            "razorpay_order_id": rp, "razorpay_payment_id": "pay_x",
            "razorpay_signature": "sig", "order_id": other_oid}))
        assert r.status_code == 400
        assert "mismatch" in r.json()["detail"].lower()

    def test_other_customers_payment_403(self, ctx):
        oid = make_order(ctx, ctx.cust_id)
        rp = create_payment(ctx, oid, ctx.cust).json()["razorpay_order_id"]
        r = run(ctx.client.post("/api/payments/verify", headers=auth(ctx.cust2), json={
            "razorpay_order_id": rp, "razorpay_payment_id": "pay_x",
            "razorpay_signature": "sig", "order_id": oid}))
        assert r.status_code == 403

    def test_reverify_idempotent_then_409(self, ctx):
        oid = make_order(ctx, ctx.cust_id)
        rp = create_payment(ctx, oid, ctx.cust).json()["razorpay_order_id"]
        body = {"razorpay_order_id": rp, "razorpay_payment_id": "pay_abc",
                "razorpay_signature": "sig", "order_id": oid}
        r1 = run(ctx.client.post("/api/payments/verify", json=body, headers=auth(ctx.cust)))
        assert r1.status_code == 200 and r1.json()["status"] == "paid"
        # Same razorpay_payment_id again → idempotent 200.
        r2 = run(ctx.client.post("/api/payments/verify", json=body, headers=auth(ctx.cust)))
        assert r2.status_code == 200
        # Different payment id against the already-paid record → 409.
        r3 = run(ctx.client.post("/api/payments/verify", headers=auth(ctx.cust),
                                 json={**body, "razorpay_payment_id": "pay_other"}))
        assert r3.status_code == 409


class TestProdMockGate:
    def test_mock_blocked_in_production(self, ctx, monkeypatch):
        monkeypatch.setenv("APP_ENV", "production")
        oid = make_order(ctx, ctx.cust_id)
        r = create_payment(ctx, oid, ctx.cust)
        assert r.status_code == 503
        assert "not configured" in r.json()["detail"].lower()

    def test_mock_allowed_in_dev(self, ctx, monkeypatch):
        monkeypatch.setenv("APP_ENV", "development")
        oid = make_order(ctx, ctx.cust_id)
        assert create_payment(ctx, oid, ctx.cust).status_code == 200


class TestWebhook:
    def _captured_event(self, rp_order_id, rp_payment_id="pay_wh_1"):
        return json.dumps({
            "event": "payment.captured",
            "payload": {"payment": {"entity": {"id": rp_payment_id, "order_id": rp_order_id}}},
        }).encode()

    def test_missing_secret_503(self, ctx, monkeypatch):
        monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
        r = run(ctx.client.post("/api/payments/webhook", content=b"{}",
                                headers={"X-Razorpay-Signature": "x"}))
        assert r.status_code == 503

    def test_bad_signature_400(self, ctx, monkeypatch):
        monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
        body = self._captured_event("order_nope")
        r = run(ctx.client.post("/api/payments/webhook", content=body,
                                headers={"X-Razorpay-Signature": "deadbeef"}))
        assert r.status_code == 400

    def test_valid_capture_marks_paid_and_is_idempotent(self, ctx, monkeypatch):
        monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
        oid = make_order(ctx, ctx.cust_id)
        rp = create_payment(ctx, oid, ctx.cust).json()["razorpay_order_id"]
        body = self._captured_event(rp, "pay_wh_42")
        r = run(ctx.client.post("/api/payments/webhook", content=body,
                                headers={"X-Razorpay-Signature": sign(body),
                                         "Content-Type": "application/json"}))
        assert r.status_code == 200, r.text
        payment = run(server.db.payments.find_one({"razorpay_order_id": rp}, {"_id": 0}))
        assert payment["status"] == "paid"
        assert payment["razorpay_payment_id"] == "pay_wh_42"
        order = run(server.db.orders.find_one({"id": oid}, {"_id": 0}))
        assert order["payment_status"] == "paid"
        # Duplicate delivery — idempotent, payment id unchanged.
        r2 = run(ctx.client.post("/api/payments/webhook", content=body,
                                 headers={"X-Razorpay-Signature": sign(body),
                                          "Content-Type": "application/json"}))
        assert r2.status_code == 200
        payment2 = run(server.db.payments.find_one({"razorpay_order_id": rp}, {"_id": 0}))
        assert payment2["razorpay_payment_id"] == "pay_wh_42"

    def test_unknown_payment_ignored(self, ctx, monkeypatch):
        monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
        body = self._captured_event("order_unknown_xyz")
        r = run(ctx.client.post("/api/payments/webhook", content=body,
                                headers={"X-Razorpay-Signature": sign(body)}))
        assert r.status_code == 200
        assert r.json()["status"] == "ignored"
