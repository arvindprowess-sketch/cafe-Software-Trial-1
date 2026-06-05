"""Phase 4 backend regression tests — customer-app-only features.

Covers:
- POST /api/nutrition/day-plan (auto-build whole day plan, diet filter, scope)
- POST /api/user/weight-log (create + upsert + validation)
- GET  /api/user/weight-log (progress payload + streak)
- GET  /api/user/coach-nudge (gentle non-shaming nudge string)
- Auth gating (401/403 without token)
- SCOPE: Phase 4 data must NOT leak into POS/Kitchen order endpoints
- Regression: Phase 2/3 endpoints still respond OK
"""

import os
import random
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("BASE_URL") or "https://802e80a7-eb3b-403d-8952-db036e2da640.preview.emergentagent.com"
API = BASE_URL.rstrip("/") + "/api"


def _fresh_phone() -> str:
    return str(random.choice([7, 8, 9])) + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer(session):
    """Customer with body stats (so day-plan/coach-nudge work off computed target)."""
    phone = _fresh_phone()
    r = session.post(f"{API}/auth/otp/send", json={"phone": phone, "name": "TEST_phase4"})
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp, "DEV OTP missing"
    v = session.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": otp, "name": "TEST_phase4"})
    assert v.status_code == 200, v.text
    token = v.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    # populate body stats so we hit the personalised target path (muscle_gain → high cal/protein)
    payload = {"height_cm": 180, "weight_kg": 80, "age": 28, "gender": "male",
               "activity_level": "moderate", "fitness_goal": "muscle_gain",
               "target_weight_kg": 84, "consent": True}
    dt_r = session.post(f"{API}/user/daily-target", json=payload, headers=headers)
    assert dt_r.status_code == 200, dt_r.text
    target = dt_r.json()
    return {"token": token, "headers": headers, "phone": phone, "target": target}


@pytest.fixture(scope="module")
def headers(customer):
    return customer["headers"]


# ---------------------------- AUTH GATING ----------------------------
class TestAuthGating:
    def test_day_plan_requires_auth(self, session):
        r = session.post(f"{API}/nutrition/day-plan", json={"meals_count": 3})
        assert r.status_code in (401, 403), r.text

    def test_weight_log_post_requires_auth(self, session):
        r = session.post(f"{API}/user/weight-log", json={"weight_kg": 70})
        assert r.status_code in (401, 403)

    def test_weight_log_get_requires_auth(self, session):
        r = session.get(f"{API}/user/weight-log")
        assert r.status_code in (401, 403)

    def test_coach_nudge_requires_auth(self, session):
        r = session.get(f"{API}/user/coach-nudge")
        assert r.status_code in (401, 403)


# ---------------------------- DAY PLAN ----------------------------
class TestDayPlan:
    def test_day_plan_basic_three_meals(self, session, headers):
        r = session.post(f"{API}/nutrition/day-plan", json={"meals_count": 3}, headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        # Structural assertions
        assert j["meals_count"] == 3
        assert len(j["meals"]) == 3
        assert "totals" in j and "calories" in j["totals"]
        assert "disclaimer" in j and "not medical advice" in j["disclaimer"].lower()
        assert j["daily_calories"] > 0 and j["daily_protein"] > 0
        # Each meal has items[] with required cart-ready fields
        for m in j["meals"]:
            assert m["items"] and isinstance(m["items"], list)
            for it in m["items"]:
                for k in ("product_id", "name", "grams", "calories", "protein", "price"):
                    assert k in it, f"missing {k} in item: {it}"
                assert it["grams"] > 0
                assert it["calories"] >= 0
        # Totals roughly close to daily target (loose because seed menu is small)
        # Allow wide tolerance — at least 50% of target and not crazy high
        assert j["totals"]["calories"] >= j["daily_calories"] * 0.5

    @pytest.mark.parametrize("n", [3, 4, 5, 6])
    def test_day_plan_meals_counts(self, session, headers, n):
        r = session.post(f"{API}/nutrition/day-plan", json={"meals_count": n}, headers=headers)
        assert r.status_code == 200, r.text
        assert len(r.json()["meals"]) == n

    def test_day_plan_diet_filter_vegan(self, session, headers):
        r = session.post(f"{API}/nutrition/day-plan",
                         json={"meals_count": 3, "diet_types": ["vegan"]}, headers=headers)
        # Could legitimately 400 if no vegan dishes in seed menu; otherwise every item must match vegan
        if r.status_code == 400:
            assert "diet" in r.json().get("detail", "").lower() or "match" in r.json().get("detail", "").lower()
            return
        assert r.status_code == 200, r.text
        j = r.json()
        for m in j["meals"]:
            for it in m["items"]:
                tags = it.get("diet_types") or []
                # Accept either diet_types array containing vegan, or legacy diet_type==vegan
                assert ("vegan" in [t.lower() for t in tags]) or (it.get("diet_type") == "vegan"), \
                    f"non-vegan item leaked: {it.get('name')} -> {tags}/{it.get('diet_type')}"

    def test_day_plan_impossible_diet_returns_400(self, session, headers):
        r = session.post(f"{API}/nutrition/day-plan",
                         json={"meals_count": 3, "diet_types": ["__nonexistent_diet_xyz__"]},
                         headers=headers)
        assert r.status_code == 400, f"expected 400 friendly error, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert isinstance(detail, str) and len(detail) > 0
        # Must NOT be a 500-style stacktrace, must be friendly
        assert "diet" in detail.lower() or "match" in detail.lower()


# ---------------------------- WEIGHT LOG ----------------------------
class TestWeightLog:
    def test_post_weight_log_creates_and_returns_progress(self, session, headers):
        r = session.post(f"{API}/user/weight-log", json={"weight_kg": 80.0}, headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "logs" in j and len(j["logs"]) >= 1
        assert j["current_streak"] >= 1
        assert j["points"] == len(j["logs"]) * 10
        assert j["latest_weight"] == 80.0

    def test_post_weight_log_upsert_same_date(self, session, headers):
        # Use yesterday so we can also exercise streak math
        yesterday = (dt.datetime.utcnow().date() - dt.timedelta(days=1)).strftime("%Y-%m-%d")
        r1 = session.post(f"{API}/user/weight-log",
                          json={"weight_kg": 79.5, "date": yesterday}, headers=headers)
        assert r1.status_code == 200, r1.text
        logs_count_1 = len(r1.json()["logs"])
        # Same date again — should overwrite, not create new
        r2 = session.post(f"{API}/user/weight-log",
                          json={"weight_kg": 79.0, "date": yesterday}, headers=headers)
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert len(j2["logs"]) == logs_count_1, "same date should upsert, not add a new log"
        # Find that date's value
        same_day = [l for l in j2["logs"] if l["date"] == yesterday]
        assert same_day and same_day[0]["weight_kg"] == 79.0

    def test_streak_two_consecutive_days(self, session, headers):
        # After previous tests, we should have today + yesterday logs → streak >= 2
        r = session.get(f"{API}/user/weight-log", headers=headers)
        assert r.status_code == 200
        j = r.json()
        assert j["current_streak"] >= 2, f"expected streak >= 2, got {j['current_streak']}"

    def test_get_weight_log_progress_payload(self, session, headers):
        r = session.get(f"{API}/user/weight-log", headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("logs", "points", "current_streak", "start_weight", "latest_weight", "change"):
            assert k in j, f"missing {k} in progress payload"
        assert isinstance(j["logs"], list)
        assert j["points"] == len(j["logs"]) * 10

    @pytest.mark.parametrize("bad", [0, 10, 20, 401, 500, -5])
    def test_weight_log_validation_rejects_out_of_range(self, session, headers, bad):
        r = session.post(f"{API}/user/weight-log", json={"weight_kg": bad}, headers=headers)
        assert r.status_code == 400, f"weight_kg={bad} should be rejected, got {r.status_code}: {r.text}"


# ---------------------------- COACH NUDGE ----------------------------
class TestCoachNudge:
    def test_coach_nudge_basic_shape(self, session, headers):
        r = session.get(f"{API}/user/coach-nudge", headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("nudge", "type", "remaining_calories", "remaining_protein",
                  "daily_calories", "daily_protein"):
            assert k in j, f"missing {k} in coach-nudge payload"
        assert isinstance(j["nudge"], str) and len(j["nudge"]) > 0
        assert j["type"] in ("plan", "protein", "calories", "over", "ontrack")
        # Non-shaming + not medical advice
        bad_words = ["fat", "lazy", "stop eating", "diagnose", "disease", "medical advice"]
        low = j["nudge"].lower()
        for w in bad_words:
            assert w not in low, f"nudge contains shaming/medical wording '{w}': {j['nudge']}"


# ---------------------------- SCOPE (no leakage) ----------------------------
class TestScopeNoLeakage:
    def test_phase4_fields_not_in_user_me(self, session, headers):
        """Sanity: weight_logs / streak / points should not be inlined into /auth/me payload."""
        r = session.get(f"{API}/auth/me", headers=headers)
        assert r.status_code == 200
        body = r.json()
        # These are Phase 4 progress fields that belong to the dedicated endpoint, not the main user blob
        for k in ("current_streak", "points", "logs"):
            assert k not in body, f"Phase 4 field '{k}' leaking into /auth/me"

    def test_orders_create_model_unchanged(self):
        """Static check on backend source — OrderCreate must not carry Phase 4 personal-progress fields."""
        import re
        with open("/app/backend/server.py", "r") as fh:
            src = fh.read()
        m = re.search(r"class OrderCreate\(BaseModel\):(.*?)class\s+\w+", src, re.DOTALL)
        assert m, "Could not locate OrderCreate model"
        block = m.group(1)
        for forbidden in ("current_streak", "points", "weight_logs", "coach_nudge",
                          "day_plan", "remaining_calories", "remaining_protein"):
            assert forbidden not in block, f"OrderCreate leaks Phase 4 field '{forbidden}'"


# ---------------------------- REGRESSION ----------------------------
class TestRegressionPhase23:
    def test_daily_target_get_still_works(self, session, headers):
        r = session.get(f"{API}/user/daily-target", headers=headers)
        assert r.status_code == 200
        j = r.json()
        assert j.get("has_body_stats") is True
        assert j.get("daily_calories", 0) > 0

    def test_meal_plan_still_works(self, session, headers):
        r = session.post(f"{API}/nutrition/meal-plan", json={"meals_count": 4}, headers=headers)
        assert r.status_code == 200, r.text
        assert len(r.json()["meals"]) == 4

    def test_goal_fit_still_works(self, session, headers):
        r = session.get(f"{API}/products/goal-fit", headers=headers)
        assert r.status_code == 200
        j = r.json()
        # endpoint returns {"goal": "...", "products": [...]} OR a bare list (be tolerant)
        items = j["products"] if isinstance(j, dict) and "products" in j else j
        assert isinstance(items, list) and len(items) > 0

    def test_products_diet_types_array_present(self, session):
        r = session.get(f"{API}/products")
        assert r.status_code == 200
        prods = r.json()
        # at least one product should have diet_types array (Phase 1)
        assert any(isinstance(p.get("diet_types"), list) for p in prods), "diet_types array missing from products"
