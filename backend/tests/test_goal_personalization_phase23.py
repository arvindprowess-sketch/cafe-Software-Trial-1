"""Phase 2 & Phase 3 backend regression tests.

Covers:
- POST/GET /api/user/daily-target (Mifflin-St Jeor + guardrails + persistence)
- POST /api/nutrition/meal-plan (3-6 meal split + goal-fit suggestions + remaining tracker)
- GET  /api/products/goal-fit (annotation + sort)
- Auth gating (401 without token)
- Phase 1 regression (diet_types on /api/products + AND multi-diet filter)
- SCOPE rule: POS/Kitchen order endpoints carry no Phase2/3 personal goal data
"""

import os
import uuid
import random
import pytest
import requests

# Hard-coded preview URL from /app/frontend/.env (EXPO_PUBLIC_BACKEND_URL)
BASE_URL = os.environ.get("BASE_URL") or "https://802e80a7-eb3b-403d-8952-db036e2da640.preview.emergentagent.com"
API = BASE_URL.rstrip("/") + "/api"


def _fresh_phone() -> str:
    # 10 digits, leading 7/8/9 to look like an Indian mobile
    return str(random.choice([7, 8, 9])) + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer_auth(session):
    """Brand-new customer (no body stats). Uses DEV OTP path."""
    phone = _fresh_phone()
    r = session.post(f"{API}/auth/otp/send", json={"phone": phone, "name": "TEST_phase23"})
    assert r.status_code == 200, f"otp/send failed: {r.status_code} {r.text}"
    body = r.json()
    otp = body.get("dev_otp")
    assert otp, f"dev_otp missing in DEV mode response: {body}"
    v = session.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp, "name": "TEST_phase23"})
    assert v.status_code == 200, f"otp/verify failed: {v.status_code} {v.text}"
    j = v.json()
    assert j.get("is_new_user") is True, "expected a brand-new user with no body stats"
    return {"token": j["token"], "user": j["user"], "phone": phone}


@pytest.fixture(scope="module")
def auth_headers(customer_auth):
    return {"Authorization": f"Bearer {customer_auth['token']}"}


@pytest.fixture(scope="module")
def admin_token(session):
    # Auth V2: code+password supplied via env (no fixed admin creds).
    code = os.environ.get("SMOKE_ADMIN_CODE")
    password = os.environ.get("SMOKE_ADMIN_PASSWORD")
    if not code or not password:
        pytest.skip("Set SMOKE_ADMIN_CODE + SMOKE_ADMIN_PASSWORD")
    r = session.post(f"{API}/auth/login", json={"code": code, "password": password})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


# ---------------------------- AUTH GATING ----------------------------
class TestAuthGating:
    def test_get_daily_target_requires_auth(self, session):
        r = session.get(f"{API}/user/daily-target")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_post_daily_target_requires_auth(self, session):
        r = session.post(f"{API}/user/daily-target", json={"height_cm": 170, "weight_kg": 70, "age": 28})
        assert r.status_code in (401, 403)

    def test_meal_plan_requires_auth(self, session):
        r = session.post(f"{API}/nutrition/meal-plan", json={"meals_count": 3})
        assert r.status_code in (401, 403)

    def test_goal_fit_requires_auth(self, session):
        r = session.get(f"{API}/products/goal-fit")
        assert r.status_code in (401, 403)


# ---------------------------- /auth/me ----------------------------
class TestAuthMeBodyStats:
    def test_new_user_has_no_body_stats(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("has_body_stats") is False
        assert me.get("daily_calories") == 2000  # default
        assert me.get("fitness_goal") == "maintenance"


# ---------------------------- GET /user/daily-target (before) ----------------------------
class TestDailyTargetBeforeStats:
    def test_get_returns_has_body_stats_false(self, session, auth_headers):
        r = session.get(f"{API}/user/daily-target", headers=auth_headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["has_body_stats"] is False
        assert j["daily_calories"] == 2000
        assert j["fitness_goal"] == "maintenance"


# ---------------------------- POST /user/daily-target ----------------------------
class TestDailyTargetCompute:
    def test_compute_muscle_gain_male(self, session, auth_headers):
        payload = {
            "height_cm": 180, "weight_kg": 80, "age": 28, "gender": "male",
            "activity_level": "moderate", "fitness_goal": "muscle_gain", "target_weight_kg": 85,
            "meals_per_day": 4
        }
        r = session.post(f"{API}/user/daily-target", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        # Expected: BMR = 10*80 + 6.25*180 - 5*28 + 5 = 800 + 1125 - 140 + 5 = 1790
        # TDEE = 1790 * 1.55 = 2774.5 -> 2775
        # cal  = 2774.5 * 1.15 = 3190.675 -> 3191
        assert j["has_body_stats"] is True
        assert j["bmr"] == 1790
        # Python uses banker's rounding -> round(2774.5)=2774
        assert j["tdee"] == 2774
        assert j["daily_calories"] == 3191
        assert j["daily_protein"] == int(round(1.8 * 80))  # 144
        assert j["floor_applied"] is False
        assert "disclaimer" in j and "not medical advice" in j["disclaimer"].lower()
        assert isinstance(j.get("notes"), list) and len(j["notes"]) >= 1

    def test_persistence_via_get(self, session, auth_headers):
        # GET right after POST should now reflect has_body_stats=true with same calories
        r = session.get(f"{API}/user/daily-target", headers=auth_headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["has_body_stats"] is True
        assert j["height_cm"] == 180
        assert j["weight_kg"] == 80
        assert j["age"] == 28
        assert j["gender"] == "male"
        assert j["activity_level"] == "moderate"
        assert j["fitness_goal"] == "muscle_gain"
        assert j["daily_calories"] == 3191
        assert j["meals_per_day"] == 4

    def test_auth_me_reflects_body_stats(self, session, auth_headers):
        r = session.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        me = r.json()
        assert me["has_body_stats"] is True
        assert me["height_cm"] == 180
        assert me["weight_kg"] == 80
        assert me["fitness_goal"] == "muscle_gain"
        assert me["daily_calories"] == 3191

    def test_missing_required_returns_400(self, session, auth_headers):
        # New isolated user (we don't want existing stats to satisfy the defaults path)
        phone = _fresh_phone()
        s2 = session.post(f"{API}/auth/otp/send", json={"phone": phone}).json()
        otp = s2["dev_otp"]
        token = session.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp}).json()["token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = session.post(f"{API}/user/daily-target", headers=h, json={"gender": "female"})
        assert r.status_code == 400


# ---------------------------- Guardrails (extreme cut floor) ----------------------------
class TestGuardrails:
    def test_extreme_fat_loss_floors_at_1200(self, session):
        """Extreme case: small/older sedentary female on fat_loss must NOT go below 1200,
        floor_applied must be true, safety note must be present, and disclaimer included."""
        # Brand-new isolated user to avoid pollution
        phone = _fresh_phone()
        send = session.post(f"{API}/auth/otp/send", json={"phone": phone})
        assert send.status_code == 200, send.text
        otp = send.json()["dev_otp"]
        v = session.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp})
        token = v.json()["token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {
            "height_cm": 150, "weight_kg": 45, "age": 60, "gender": "female",
            "activity_level": "sedentary", "fitness_goal": "fat_loss"
        }
        r = session.post(f"{API}/user/daily-target", headers=h, json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        # BMR(f) = 10*45 + 6.25*150 - 5*60 - 161 = 450 + 937.5 - 300 - 161 = 926.5 -> 927
        # TDEE = 926.5 * 1.2 = 1111.8 ; cal = *0.82 = 911.676
        # Guardrails: fat_loss min_safe = max(1200, BMR=927) = 1200 -> calories floored to 1200
        assert j["daily_calories"] >= 1200, f"calories={j['daily_calories']} below safety floor"
        assert j["floor_applied"] is True
        assert isinstance(j["notes"], list) and any("minimum" in n.lower() or "unsafe" in n.lower() or "energized" in n.lower() for n in j["notes"]), j["notes"]
        assert "disclaimer" in j and "medical advice" in j["disclaimer"].lower()

    def test_no_endpoint_returns_below_1200(self, session):
        """Across an array of extreme fat-loss profiles, calories must always be >=1200."""
        cases = [
            {"height_cm": 150, "weight_kg": 40, "age": 70, "gender": "female", "activity_level": "sedentary", "fitness_goal": "fat_loss"},
            {"height_cm": 155, "weight_kg": 42, "age": 65, "gender": "female", "activity_level": "sedentary", "fitness_goal": "fat_loss"},
            {"height_cm": 160, "weight_kg": 50, "age": 55, "gender": "other", "activity_level": "sedentary", "fitness_goal": "fat_loss"},
        ]
        for payload in cases:
            phone = _fresh_phone()
            otp = session.post(f"{API}/auth/otp/send", json={"phone": phone}).json()["dev_otp"]
            token = session.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp}).json()["token"]
            h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            r = session.post(f"{API}/user/daily-target", headers=h, json=payload)
            assert r.status_code == 200, r.text
            j = r.json()
            assert j["daily_calories"] >= 1200, f"{payload} -> {j['daily_calories']}"


# ---------------------------- POST /nutrition/meal-plan ----------------------------
class TestMealPlan:
    @pytest.mark.parametrize("n", [3, 4, 5, 6])
    def test_meal_count_split(self, session, auth_headers, n):
        r = session.post(f"{API}/nutrition/meal-plan", headers=auth_headers, json={"meals_count": n})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["meals_count"] == n
        assert isinstance(j["meals"], list) and len(j["meals"]) == n
        for m in j["meals"]:
            for k in ("calories", "protein", "carbs", "fat"):
                assert k in m and isinstance(m[k], (int, float))
            assert "suggestions" in m and isinstance(m["suggestions"], list)
        # disclaimer present
        assert "disclaimer" in j

    def test_remaining_calories_populates_remaining_suggestions(self, session, auth_headers):
        r = session.post(f"{API}/nutrition/meal-plan", headers=auth_headers,
                         json={"meals_count": 3, "remaining_calories": 800, "remaining_protein": 40})
        assert r.status_code == 200, r.text
        j = r.json()
        assert isinstance(j["remaining_suggestions"], list)
        # Should have up to 5 suggestions when remaining provided
        assert len(j["remaining_suggestions"]) >= 1

    def test_no_remaining_returns_empty_remaining_suggestions(self, session, auth_headers):
        r = session.post(f"{API}/nutrition/meal-plan", headers=auth_headers, json={"meals_count": 3})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["remaining_suggestions"] == []


# ---------------------------- GET /products/goal-fit ----------------------------
class TestGoalFit:
    def test_fat_loss_annotated_and_sorted(self, session, auth_headers):
        r = session.get(f"{API}/products/goal-fit", headers=auth_headers, params={"goal": "fat_loss"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["goal"] == "fat_loss"
        prods = j["products"]
        assert isinstance(prods, list) and len(prods) >= 1
        # All must carry goal_fit flag + score
        for p in prods:
            assert "goal_fit" in p and isinstance(p["goal_fit"], bool)
            assert "goal_fit_score" in p
        # Sorted: goal_fit=True items must come first
        fits = [p["goal_fit"] for p in prods]
        # find boundary
        try:
            first_false = fits.index(False)
        except ValueError:
            first_false = len(fits)
        assert all(fits[:first_false]) and not any(fits[first_false:]), \
            "Goal-fitting items must be sorted first"

    def test_muscle_gain_sort(self, session, auth_headers):
        r = session.get(f"{API}/products/goal-fit", headers=auth_headers, params={"goal": "muscle_gain"})
        assert r.status_code == 200
        prods = r.json()["products"]
        # at least some items should be goal_fit=true
        assert any(p["goal_fit"] for p in prods)


# ---------------------------- Phase 1 regression ----------------------------
class TestPhase1Regression:
    def test_products_carry_diet_types_array(self, session):
        r = session.get(f"{API}/products")
        assert r.status_code == 200, r.text
        prods = r.json()
        assert isinstance(prods, list) and len(prods) >= 1
        for p in prods:
            assert isinstance(p.get("diet_types"), list), f"Missing diet_types: {p.get('name')}"

    def test_diet_filter_and_semantics(self, session):
        r = session.get(f"{API}/products", params={"diet": "veg,high-protein"})
        assert r.status_code == 200
        prods = r.json()
        for p in prods:
            tags = p.get("diet_types") or []
            assert "veg" in tags and "high-protein" in tags, f"{p['name']} returned without both tags: {tags}"


# ---------------------------- Scope rule: no leakage into orders/POS ----------------------------
class TestScopeNoLeakageIntoOrders:
    def test_order_create_payload_has_no_personal_goal_fields(self):
        """Static assertion on the OrderCreate model: it must NOT accept Phase 2/3 personal
        body-stats / target fields (height_cm/weight_kg/age/gender/activity_level/bmr/tdee/
        daily_calories/daily_protein/daily_carbs/daily_fat/target_weight_kg/meals_per_day).
        fitness_goal IS pre-existing on orders and is allowed."""
        import importlib.util, sys
        spec = importlib.util.spec_from_file_location("fuel_server", "/app/backend/server.py")
        # avoid actually importing (motor connection); just read source instead
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        # Find OrderCreate block
        start = src.index("class OrderCreate(")
        end = src.index("\nclass ", start + 1)
        block = src[start:end]
        forbidden = ["height_cm", "weight_kg", "age:", "gender:", "activity_level",
                     "bmr", "tdee", "daily_calories", "daily_protein", "daily_carbs",
                     "daily_fat", "target_weight_kg", "meals_per_day"]
        leaks = [k for k in forbidden if k in block]
        assert not leaks, f"OrderCreate leaks personal-goal fields: {leaks}\n{block}"

    def test_order_created_has_no_personal_goal_leak(self, session, auth_headers):
        # Create a minimal order and verify the returned/persisted order has no leaked fields
        prods = session.get(f"{API}/products").json()
        if not prods:
            pytest.skip("no products to order")
        p = prods[0]
        item = {
            "product_id": p["id"], "product_name": p["name"], "grams": 100,
            "price": float(p.get("fixed_price") or p.get("price") or 100),
            "calories": float(p.get("calories_per_100g") or 100),
            "protein": float(p.get("protein_per_100g") or 5),
            "carbs": float(p.get("carbs_per_100g") or 10),
            "fat": float(p.get("fat_per_100g") or 3),
            "product_type": p.get("product_type", "single"), "quantity": 1,
        }
        body = {
            "order_type": "takeaway",
            "items": [item],
            "total_price": item["price"],
            "total_calories": item["calories"],
            "total_protein": item["protein"],
            "total_carbs": item["carbs"],
            "total_fat": item["fat"],
        }
        r = session.post(f"{API}/orders", headers=auth_headers, json=body)
        if r.status_code >= 400:
            pytest.skip(f"order create returned {r.status_code}: {r.text[:200]}")
        order = r.json()
        forbidden_keys = ["height_cm", "weight_kg", "age", "gender", "activity_level",
                          "bmr", "tdee", "daily_calories", "daily_protein", "daily_carbs",
                          "daily_fat", "target_weight_kg", "meals_per_day"]
        leaked = [k for k in forbidden_keys if k in order]
        assert not leaked, f"Order response leaks personal-goal fields: {leaked}"
