"""
FUEL Phase 1 backend regression suite.

Covers Part A (security/OTP/JWT), Part B (B1 nutrition, B2 accepted status,
B3 duplicate guard, B5 prep-time scheduling, B6 BOGO coupon, B4 AI guardrails),
Part C (Socket.IO real-time) and C4 RBAC.

Run:
    pytest /app/backend/tests/test_fuel_phase1.py -v \
        --junitxml=/app/test_reports/pytest/fuel_phase1.xml
"""
import os
import re
import time
import uuid
import asyncio
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("FUEL_BASE_URL", "http://localhost:8001")
API = f"{BASE_URL}/api"

# Auth V2: code+password supplied via env (no fixed admin creds).
ADMIN_CODE = os.environ.get("SMOKE_ADMIN_CODE")
ADMIN_PASS = os.environ.get("SMOKE_ADMIN_PASSWORD")


# ---------- helpers ----------
def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _read_dev_otp(phone: str, timeout: float = 5.0) -> str | None:
    """Tail backend supervisor log for `[SMS][DEV] OTP for <phone>: <otp>`."""
    deadline = time.time() + timeout
    pat = re.compile(rf"\[SMS\]\[DEV\] OTP for {phone}: (\d{{4,8}})")
    last_match = None
    while time.time() < deadline:
        try:
            out = subprocess.check_output(
                "tail -n 400 /var/log/supervisor/backend.*.log",
                shell=True, stderr=subprocess.DEVNULL,
            ).decode()
            for m in pat.finditer(out):
                last_match = m.group(1)
            if last_match:
                return last_match
        except Exception:
            pass
        time.sleep(0.3)
    return last_match


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    if not ADMIN_CODE or not ADMIN_PASS:
        pytest.skip("Set SMOKE_ADMIN_CODE + SMOKE_ADMIN_PASSWORD")
    r = requests.post(f"{API}/auth/login", json={"code": ADMIN_CODE, "password": ADMIN_PASS}, timeout=10)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    """Create a customer via OTP login (using dev-mode OTP from logs)."""
    phone = "9" + str(int(time.time()))[-9:]
    rs = requests.post(f"{API}/auth/otp/send", json={"phone": phone, "name": "TEST_Cust"}, timeout=10)
    assert rs.status_code == 200, rs.text
    otp = _read_dev_otp(phone)
    assert otp, "Could not capture dev OTP from backend log"
    rv = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp, "name": "TEST_Cust"}, timeout=10)
    assert rv.status_code == 200, rv.text
    return rv.json()["token"]


@pytest.fixture(scope="module")
def some_product(admin_token):
    r = requests.get(f"{API}/products", timeout=10)
    assert r.status_code == 200
    prods = r.json()
    assert prods, "No products seeded"
    return prods[0]


# ===================== PART A - SECURITY =====================
class TestPartASecurity:
    def test_otp_send_does_not_leak_otp(self):
        phone = "9" + str(int(time.time()))[-9:]
        r = requests.post(f"{API}/auth/otp/send", json={"phone": phone}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # A1: response must not contain OTP value
        body_str = str(data).lower()
        assert "demo_otp" not in body_str
        assert "otp" not in {k.lower() for k in data.keys()} or data.get("otp") is None
        assert set(data.keys()) >= {"message", "phone", "expires_in"}
        # No 4-8 digit value field present
        for k, v in data.items():
            if isinstance(v, str) and v.isdigit() and 4 <= len(v) <= 8:
                pytest.fail(f"Field {k} looks like an OTP: {v}")

    def test_otp_wrong_attempts_then_cleared(self):
        phone = "9" + str(int(time.time()))[-9:]
        assert requests.post(f"{API}/auth/otp/send", json={"phone": phone}, timeout=10).status_code == 200
        # 3 wrong attempts
        last_resp = None
        for i in range(3):
            r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "000000"}, timeout=10)
            assert r.status_code == 400, r.text
            last_resp = r
            assert "attempts remaining" in r.text.lower() or "too many" in r.text.lower()
        # 4th attempt -> record cleared: server triggers the "too many wrong attempts" branch
        # (attempts>=3 -> delete record, then subsequent call returns "OTP expired or not sent")
        r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "000000"}, timeout=10)
        assert r.status_code == 400
        msg = r.text.lower()
        assert ("not sent" in msg) or ("expired" in msg) or ("too many" in msg)
        # 5th attempt confirms record is gone now -> "not sent or expired"
        r2 = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "000000"}, timeout=10)
        assert r2.status_code == 400
        assert ("not sent" in r2.text.lower()) or ("expired" in r2.text.lower())

    def test_otp_happy_path_returns_token(self):
        phone = "9" + str(int(time.time()))[-9:]
        requests.post(f"{API}/auth/otp/send", json={"phone": phone, "name": "TEST_Happy"}, timeout=10)
        otp = _read_dev_otp(phone)
        assert otp, "OTP not in logs"
        r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp, "name": "TEST_Happy"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("token") and body.get("user")
        assert body.get("is_new_user") is True
        # re-login -> existing user
        requests.post(f"{API}/auth/otp/send", json={"phone": phone}, timeout=10)
        otp2 = _read_dev_otp(phone)
        r2 = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp2}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("is_new_user") is False

    def test_otp_resend_rate_limited(self):
        phone = "9" + str(int(time.time()))[-9:]
        r1 = requests.post(f"{API}/auth/otp/send", json={"phone": phone}, timeout=10)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/otp/resend", json={"phone": phone}, timeout=10)
        assert r2.status_code == 429, f"expected 429, got {r2.status_code} {r2.text}"

    def test_admin_login_with_env_jwt(self, admin_token):
        # JWT works -> /auth/me succeeds
        r = requests.get(f"{API}/auth/me", headers=_headers(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("role") == "admin"


# ===================== PART B1 - NUTRITION PERSISTENCE =====================
class TestB1Nutrition:
    def test_single_product_persists_admin_nutrition(self, admin_token):
        unique = f"TEST_PROTEIN_BAR_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique,
            "price": 100,
            "grams": 100,
            "calories_per_100g": 333,
            "protein_per_100g": 44,
            "carbs_per_100g": 22,
            "fat_per_100g": 11,
            "preparation_time_minutes": 7,
        }
        r = requests.post(f"{API}/products/single", json=payload, headers=_headers(admin_token), timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["calories_per_100g"] == 333
        assert body["protein_per_100g"] == 44
        assert body["carbs_per_100g"] == 22
        assert body["fat_per_100g"] == 11
        assert body["preparation_time_minutes"] == 7
        pid = body["id"]
        # GET to verify persistence
        listing = requests.get(f"{API}/products", timeout=10).json()
        rec = next((p for p in listing if p["id"] == pid), None)
        assert rec, "Product not persisted"
        assert rec["calories_per_100g"] == 333
        assert rec["preparation_time_minutes"] == 7

        # PUT update nutrition fields
        upd = requests.put(
            f"{API}/products/{pid}",
            json={"calories_per_100g": 200, "protein_per_100g": 20, "preparation_time_minutes": 12},
            headers=_headers(admin_token), timeout=15,
        )
        assert upd.status_code == 200, upd.text
        listing2 = requests.get(f"{API}/products", timeout=10).json()
        rec2 = next(p for p in listing2 if p["id"] == pid)
        assert rec2["calories_per_100g"] == 200
        assert rec2["protein_per_100g"] == 20
        assert rec2["preparation_time_minutes"] == 12

    def test_single_product_falls_back_to_keyword_nutrition(self, admin_token):
        unique = f"TEST_CHICKEN_{uuid.uuid4().hex[:6]}"
        # NO nutrition fields => falls back to NUTRITION_DB / keyword
        payload = {"name": unique, "price": 100, "grams": 100}
        r = requests.post(f"{API}/products/single", json=payload, headers=_headers(admin_token), timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        # Defaults should be present (chicken has 0 carbs naturally, so allow >= 0)
        for k in ("calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"):
            assert body.get(k) is not None
        assert body["calories_per_100g"] > 0
        assert body["protein_per_100g"] > 0


# ===================== PART B2 - ACCEPTED STATUS =====================
def _build_order_payload(product):
    return {
        "order_type": "dine-in",
        "items": [{
            "product_id": product["id"], "product_name": product["name"],
            "grams": 100, "price": 50,
            "calories": 100, "protein": 5, "carbs": 10, "fat": 2,
            "product_type": "single", "quantity": 1,
        }],
        "total_price": 50, "total_calories": 100, "total_protein": 5,
        "total_carbs": 10, "total_fat": 2, "payment_mode": "cash",
    }


class TestB2AcceptedStatus:
    def test_status_flow_pending_to_completed(self, admin_token, some_product):
        order = _build_order_payload(some_product)
        # use confirm_duplicate to avoid 409 from prior tests
        order["confirm_duplicate"] = True
        r = requests.post(f"{API}/orders", json=order, headers=_headers(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        # Order currently 'preparing' (cash). Force to 'accepted' which must be valid.
        for st in ["accepted", "preparing", "ready", "completed"]:
            up = requests.put(f"{API}/orders/{oid}/status", params={"status": st},
                              headers=_headers(admin_token), timeout=10)
            assert up.status_code == 200, f"transition to {st}: {up.status_code} {up.text}"

    def test_invalid_status_400(self, admin_token, some_product):
        order = _build_order_payload(some_product); order["confirm_duplicate"] = True
        r = requests.post(f"{API}/orders", json=order, headers=_headers(admin_token), timeout=15)
        oid = r.json()["id"]
        bad = requests.put(f"{API}/orders/{oid}/status", params={"status": "bogus_x"},
                           headers=_headers(admin_token), timeout=10)
        assert bad.status_code == 400

    def test_kitchen_list_includes_accepted(self, admin_token, some_product):
        order = _build_order_payload(some_product); order["confirm_duplicate"] = True
        r = requests.post(f"{API}/orders", json=order, headers=_headers(admin_token), timeout=15)
        oid = r.json()["id"]
        requests.put(f"{API}/orders/{oid}/status", params={"status": "accepted"},
                     headers=_headers(admin_token), timeout=10)
        kit = requests.get(f"{API}/orders/kitchen", headers=_headers(admin_token), timeout=10)
        assert kit.status_code == 200
        ids = [o["id"] for o in kit.json()]
        assert oid in ids


# ===================== PART B3 - DUPLICATE ORDER GUARD =====================
class TestB3DuplicateGuard:
    def test_duplicate_blocked_then_confirmed(self, customer_token, some_product):
        order = _build_order_payload(some_product)
        r1 = requests.post(f"{API}/orders", json=order, headers=_headers(customer_token), timeout=15)
        assert r1.status_code == 200, r1.text
        # second identical within 2 min
        r2 = requests.post(f"{API}/orders", json=order, headers=_headers(customer_token), timeout=15)
        assert r2.status_code == 409, r2.text
        detail = r2.json().get("detail", {})
        assert isinstance(detail, dict) and detail.get("warning") == "duplicate_order"
        # bypass
        order2 = dict(order); order2["confirm_duplicate"] = True
        r3 = requests.post(f"{API}/orders", json=order2, headers=_headers(customer_token), timeout=15)
        assert r3.status_code == 200, r3.text


# ===================== PART B5 - PREP TIME ON KITCHEN TICKET =====================
class TestB5PrepTime:
    def test_kitchen_ticket_has_prep_times(self, admin_token, some_product):
        order = _build_order_payload(some_product); order["confirm_duplicate"] = True
        r = requests.post(f"{API}/orders", json=order, headers=_headers(admin_token), timeout=15)
        oid = r.json()["id"]
        t = requests.get(f"{API}/orders/{oid}/kitchen-ticket", headers=_headers(admin_token), timeout=10)
        assert t.status_code == 200, t.text
        body = t.json()
        assert "total_preparation_time_minutes" in body
        assert all("preparation_time_minutes" in it for it in body["items"])


# ===================== PART B6 - BOGO COUPON =====================
class TestB6BOGO:
    def test_create_and_apply_bogo(self, admin_token):
        code = f"TEST_BOGO_{uuid.uuid4().hex[:5].upper()}"
        offer = {
            "title": "TEST BOGO",
            "subtitle": "buy one get one",
            "description": "buy one get one",
            "discount_type": "bogo",
            "discount_value": 0,
            "coupon_code": code,
            "applicable_to": "all",
            "min_order_value": 0,
            "is_active": True,
        }
        r = requests.post(f"{API}/offers", json=offer, headers=_headers(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        # apply
        ap = requests.post(
            f"{API}/orders/apply-coupon",
            json={"coupon_code": code, "cart_items": [{"price": 120}, {"price": 80}]},
            headers=_headers(admin_token), timeout=10,
        )
        assert ap.status_code == 200, ap.text
        assert ap.json()["computed_discount"] == 80

    def test_percentage_and_flat_still_work(self, admin_token):
        code_p = f"TEST_PCT_{uuid.uuid4().hex[:5].upper()}"
        code_f = f"TEST_FLAT_{uuid.uuid4().hex[:5].upper()}"
        for code, dtype, val in [(code_p, "percentage", 10), (code_f, "flat", 25)]:
            requests.post(f"{API}/offers", json={
                "title": code, "subtitle": "t", "description": "t", "discount_type": dtype,
                "discount_value": val, "coupon_code": code,
                "applicable_to": "all", "min_order_value": 0, "is_active": True,
            }, headers=_headers(admin_token), timeout=10)
        rp = requests.post(f"{API}/orders/apply-coupon",
                           json={"coupon_code": code_p, "cart_total": 200, "cart_items": [{"price": 200}]},
                           headers=_headers(admin_token), timeout=10)
        assert rp.status_code == 200 and rp.json()["computed_discount"] == 20
        rf = requests.post(f"{API}/orders/apply-coupon",
                           json={"coupon_code": code_f, "cart_total": 200, "cart_items": [{"price": 200}]},
                           headers=_headers(admin_token), timeout=10)
        assert rf.status_code == 200 and rf.json()["computed_discount"] == 25


# ===================== PART B4 - AI GUARDRAILS (smoke) =====================
class TestB4AIGuardrails:
    def test_ai_endpoints_smoke(self, admin_token):
        # Just ensure adjust-portions returns 200 (does not error out)
        body = {
            "items": [{"name": "Test", "grams": 100, "calories_per_100g": 200, "protein_per_100g": 10}],
            "calorie_goal": 2000, "consumed_today": 0,
        }
        r = requests.post(f"{API}/ai/adjust-portions", json=body, headers=_headers(admin_token), timeout=30)
        assert r.status_code == 200, r.text


# ===================== C4 - RBAC =====================
class TestRBAC:
    def test_customer_cannot_create_product(self, customer_token):
        r = requests.post(f"{API}/products/single",
                          json={"name": "TEST_CUST_X", "price": 50, "grams": 100},
                          headers=_headers(customer_token), timeout=10)
        assert r.status_code == 403, f"customer was allowed (got {r.status_code})"


# ===================== PART C - SOCKET.IO REAL-TIME =====================
class TestSocketIO:
    def test_socketio_realtime_events(self, admin_token, some_product):
        import socketio as sio_lib
        import threading
        received_kitchen = []
        received_user = []

        async def runner():
            # Two clients
            kitchen_cli = sio_lib.AsyncClient()
            user_cli = sio_lib.AsyncClient()

            @kitchen_cli.on("update")
            async def k_upd(d):
                received_kitchen.append(d)

            @user_cli.on("update")
            async def u_upd(d):
                received_user.append(d)

            # Connect both
            await kitchen_cli.connect(BASE_URL, socketio_path="/api/socket.io", transports=["polling"])
            await user_cli.connect(BASE_URL, socketio_path="/api/socket.io", transports=["polling"])

            # Get admin user_id for room
            me = requests.get(f"{API}/auth/me", headers=_headers(admin_token)).json()
            uid = me["id"]

            await kitchen_cli.emit("join_room", {"room_id": "kitchen"})
            await user_cli.emit("join_room", {"room_id": f"user:{uid}"})
            await asyncio.sleep(0.8)

            # Create order via admin (user_id = admin id)
            order = _build_order_payload(some_product); order["confirm_duplicate"] = True
            r = requests.post(f"{API}/orders", json=order, headers=_headers(admin_token), timeout=15)
            assert r.status_code == 200, r.text
            oid = r.json()["id"]
            await asyncio.sleep(1.8)

            # Status change
            requests.put(f"{API}/orders/{oid}/status", params={"status": "accepted"},
                         headers=_headers(admin_token), timeout=10)
            await asyncio.sleep(1.8)

            await kitchen_cli.disconnect()
            await user_cli.disconnect()

        asyncio.run(runner())

        k_types = [m.get("type") for m in received_kitchen]
        u_types = [m.get("type") for m in received_user]
        assert "new_order" in k_types, f"kitchen did not get new_order. got={k_types}"
        assert "order_status" in k_types, f"kitchen did not get order_status. got={k_types}"
        assert "order_status" in u_types, f"user room did not get order_status. got={u_types}"

    def test_socketio_menu_update_on_product_change(self, admin_token):
        import socketio as sio_lib
        received = []

        async def runner():
            cli = sio_lib.AsyncClient()

            @cli.on("update")
            async def on_upd(d):
                received.append(d)

            await cli.connect(BASE_URL, socketio_path="/api/socket.io", transports=["polling"])
            await cli.emit("join_room", {"room_id": "customers"})
            await asyncio.sleep(0.6)
            # Create a product to trigger menu_update
            payload = {"name": f"TEST_WS_{uuid.uuid4().hex[:5]}", "price": 50, "grams": 100,
                       "calories_per_100g": 100, "protein_per_100g": 5,
                       "carbs_per_100g": 10, "fat_per_100g": 2}
            r = requests.post(f"{API}/products/single", json=payload, headers=_headers(admin_token), timeout=120)
            assert r.status_code == 200, r.text
            await asyncio.sleep(1.8)
            await cli.disconnect()

        asyncio.run(runner())
        types = [m.get("type") for m in received]
        assert "menu_update" in types, f"customers room did not get menu_update. got={types}"

    def test_socketio_wrong_path_fails(self):
        import socketio as sio_lib
        cli = sio_lib.Client(reconnection=False)
        with pytest.raises(Exception):
            cli.connect(BASE_URL, socketio_path="/api/wrong_path_xxx",
                        transports=["polling"], wait_timeout=3)
