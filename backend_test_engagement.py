#!/usr/bin/env python3
import asyncio
import aiohttp
import uuid

# Use the public endpoint from the review request (same base as the other suites)
API_BASE = "https://meal-fit-goals.preview.emergentagent.com/api"
print(f"🌐 Testing Diet Cafe P7 ENGAGEMENT PACK at: {API_BASE}")
print("🎯 Focus: Saved Meals (CRUD/ownership/cap), Order Rating (guards), Value-Card control")

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.critical_issues = []

    def log_pass(self, test_name, details=""):
        self.passed.append(f"✅ {test_name} {details}".strip())
        print(f"✅ {test_name} {details}".strip())

    def log_fail(self, test_name, error):
        self.failed.append(f"❌ {test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        if any(critical in test_name.lower() for critical in ["login", "auth", "401", "500", "404"]):
            self.critical_issues.append(f"{test_name}: {error}")

    def print_summary(self):
        total = len(self.passed) + len(self.failed)
        success_rate = len(self.passed) / total * 100 if total > 0 else 0
        print("\n" + "=" * 70)
        print("📊 DIET CAFE P7 ENGAGEMENT PACK TEST RESULTS")
        print("=" * 70)
        print(f"✅ PASSED: {len(self.passed)}")
        print(f"❌ FAILED: {len(self.failed)}")
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        if self.critical_issues:
            print("\n🔥 CRITICAL ISSUES:")
            for issue in self.critical_issues:
                print(f"  ❌ {issue}")
        if self.failed:
            print("\n📝 ALL FAILURES:")
            for failure in self.failed:
                print(f"  {failure}")
        print("=" * 70)

results = TestResults()
admin_token = None
customer_a_token = None
customer_b_token = None
saved_meal_id = None
test_order_id = None

SAVED_MEAL_ITEMS = [{
    "product_id": "test-engagement-product",
    "product_name": "Test Grilled Chicken",
    "name": "Test Grilled Chicken",
    "product_type": "single",
    "grams": 200,
    "quantity": 1,
    "price": 120,
    "calories": 330,
    "protein": 62,
    "carbs": 0,
    "fat": 7,
    "cost_per_100g": 60,
    "calories_per_100g": 165,
    "protein_per_100g": 31,
    "carbs_per_100g": 0,
    "fat_per_100g": 3.5,
}]

def auth(token):
    return {"Authorization": f"Bearer {token}"}

async def test_admin_login(session):
    """Admin (super_admin) login with admin@dietcafe.com / admin123"""
    global admin_token
    try:
        payload = {"email": "admin@dietcafe.com", "password": "admin123"}
        async with session.post(f"{API_BASE}/auth/login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                admin_token = data.get("token")
                if admin_token:
                    results.log_pass("Admin Login", "✓ Authentication successful")
                    return True
            text = await response.text()
            results.log_fail("Admin Login", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Admin Login", f"Exception: {e}")
        return False

async def register_customer(session, label):
    """Register a fresh customer and return their token"""
    try:
        email = f"engagement-{label}-{uuid.uuid4().hex[:8]}@test.com"
        payload = {"email": email, "password": "test1234", "name": f"Engagement {label.upper()}"}
        async with session.post(f"{API_BASE}/auth/register", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                token = data.get("token")
                if token:
                    results.log_pass(f"Register Customer {label.upper()}", f"✓ {email}")
                    return token
            text = await response.text()
            results.log_fail(f"Register Customer {label.upper()}", f"HTTP {response.status}: {text}")
            return None
    except Exception as e:
        results.log_fail(f"Register Customer {label.upper()}", f"Exception: {e}")
        return None

# ===================== A. SAVED MEALS =====================

async def test_create_saved_meal(session):
    """POST /api/saved-meals — customer A creates a saved meal"""
    global saved_meal_id
    try:
        payload = {
            "name": "Leg Day Fuel",
            "items": SAVED_MEAL_ITEMS,
            "macros": {"calories": 330, "protein": 62, "carbs": 0, "fat": 7},
            "price_estimate": 120,
        }
        async with session.post(f"{API_BASE}/saved-meals", json=payload, headers=auth(customer_a_token)) as response:
            if response.status == 200:
                data = await response.json()
                saved_meal_id = data.get("id")
                if saved_meal_id and data.get("name") == "Leg Day Fuel":
                    results.log_pass("Create Saved Meal", f"✓ id={saved_meal_id}")
                    return True
            text = await response.text()
            results.log_fail("Create Saved Meal", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Create Saved Meal", f"Exception: {e}")
        return False

async def test_saved_meal_validation(session):
    """POST /api/saved-meals — empty name / empty items / >60-char name rejected (400)"""
    cases = [
        ("Empty name", {"name": "   ", "items": SAVED_MEAL_ITEMS}),
        ("Empty items", {"name": "No Items", "items": []}),
        ("Name too long", {"name": "x" * 61, "items": SAVED_MEAL_ITEMS}),
    ]
    ok = True
    for label, payload in cases:
        try:
            async with session.post(f"{API_BASE}/saved-meals", json=payload, headers=auth(customer_a_token)) as response:
                if response.status == 400:
                    results.log_pass(f"Saved Meal Validation ({label})", "✓ 400 as expected")
                else:
                    text = await response.text()
                    results.log_fail(f"Saved Meal Validation ({label})", f"Expected 400, got {response.status}: {text}")
                    ok = False
        except Exception as e:
            results.log_fail(f"Saved Meal Validation ({label})", f"Exception: {e}")
            ok = False
    return ok

async def test_list_saved_meals_own_only(session):
    """GET /api/saved-meals — A sees their meal; B does NOT see A's meal"""
    try:
        async with session.get(f"{API_BASE}/saved-meals", headers=auth(customer_a_token)) as response:
            if response.status != 200:
                text = await response.text()
                results.log_fail("List Saved Meals (A)", f"HTTP {response.status}: {text}")
                return False
            data = await response.json()
            if not any(m.get("id") == saved_meal_id for m in data):
                results.log_fail("List Saved Meals (A)", "A's saved meal missing from own list")
                return False
            results.log_pass("List Saved Meals (A)", f"✓ {len(data)} meals, newest first")
        async with session.get(f"{API_BASE}/saved-meals", headers=auth(customer_b_token)) as response:
            if response.status != 200:
                text = await response.text()
                results.log_fail("List Saved Meals (B ownership)", f"HTTP {response.status}: {text}")
                return False
            data = await response.json()
            if any(m.get("id") == saved_meal_id for m in data):
                results.log_fail("List Saved Meals (B ownership)", "B can see A's saved meal!")
                return False
            results.log_pass("List Saved Meals (B ownership)", "✓ B cannot see A's meal")
            return True
    except Exception as e:
        results.log_fail("List Saved Meals", f"Exception: {e}")
        return False

async def test_delete_saved_meal_ownership(session):
    """DELETE /api/saved-meals/{id} — B gets 404 on A's meal; A deletes own (200)"""
    try:
        async with session.delete(f"{API_BASE}/saved-meals/{saved_meal_id}", headers=auth(customer_b_token)) as response:
            if response.status == 404:
                results.log_pass("Delete Saved Meal (B blocked)", "✓ 404 for foreign meal")
            else:
                text = await response.text()
                results.log_fail("Delete Saved Meal (B blocked)", f"Expected 404, got {response.status}: {text}")
                return False
        async with session.delete(f"{API_BASE}/saved-meals/{saved_meal_id}", headers=auth(customer_a_token)) as response:
            if response.status == 200:
                results.log_pass("Delete Saved Meal (A own)", "✓ deleted")
                return True
            text = await response.text()
            results.log_fail("Delete Saved Meal (A own)", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Delete Saved Meal", f"Exception: {e}")
        return False

async def test_saved_meal_cap(session):
    """POST /api/saved-meals — 21st meal for the same user rejected (400, max 20)"""
    created = []
    try:
        # Fill up to the 20-meal cap (A's list is empty again after the delete test)
        async with session.get(f"{API_BASE}/saved-meals", headers=auth(customer_a_token)) as response:
            existing = await response.json() if response.status == 200 else []
        for i in range(20 - len(existing)):
            payload = {"name": f"Cap Meal {i + 1}", "items": SAVED_MEAL_ITEMS}
            async with session.post(f"{API_BASE}/saved-meals", json=payload, headers=auth(customer_a_token)) as response:
                if response.status != 200:
                    text = await response.text()
                    results.log_fail("Saved Meal Cap (fill)", f"Meal {i + 1}: HTTP {response.status}: {text}")
                    return False
                data = await response.json()
                created.append(data.get("id"))
        payload = {"name": "One Too Many", "items": SAVED_MEAL_ITEMS}
        async with session.post(f"{API_BASE}/saved-meals", json=payload, headers=auth(customer_a_token)) as response:
            if response.status == 400:
                results.log_pass("Saved Meal Cap (20 max)", "✓ 21st meal rejected with 400")
                return True
            text = await response.text()
            results.log_fail("Saved Meal Cap (20 max)", f"Expected 400, got {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Saved Meal Cap (20 max)", f"Exception: {e}")
        return False
    finally:
        # Cleanup so reruns start from a clean slate
        for mid in created:
            try:
                async with session.delete(f"{API_BASE}/saved-meals/{mid}", headers=auth(customer_a_token)):
                    pass
            except Exception:
                pass

# ===================== B. ORDER RATING =====================

async def test_create_order_for_rating(session):
    """Create a customer-A order (starts in a NON-terminal status)"""
    global test_order_id
    try:
        payload = {
            "order_type": "dine-in",
            "items": [{
                "product_id": "test-rating-product",
                "product_name": "Test Rating Item",
                "grams": 100,
                "price": 50,
                "calories": 100,
                "protein": 10,
                "carbs": 15,
                "fat": 5,
            }],
            "total_price": 50,
            "total_calories": 100,
            "total_protein": 10,
            "total_carbs": 15,
            "total_fat": 5,
        }
        async with session.post(f"{API_BASE}/orders", json=payload, headers=auth(customer_a_token)) as response:
            if response.status == 200:
                data = await response.json()
                test_order_id = data.get("id")
                if test_order_id:
                    results.log_pass("Create Order for Rating", f"✓ id={test_order_id} status={data.get('status')}")
                    return True
            text = await response.text()
            results.log_fail("Create Order for Rating", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Create Order for Rating", f"Exception: {e}")
        return False

async def test_rating_status_guard(session):
    """POST /api/orders/{id}/rating on a NON-terminal order → 400"""
    try:
        async with session.post(f"{API_BASE}/orders/{test_order_id}/rating", json={"stars": 5}, headers=auth(customer_a_token)) as response:
            if response.status == 400:
                results.log_pass("Rating Status Guard", "✓ non-completed order rejected with 400")
                return True
            text = await response.text()
            results.log_fail("Rating Status Guard", f"Expected 400, got {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Rating Status Guard", f"Exception: {e}")
        return False

async def test_complete_order(session):
    """Staff moves the order to the terminal 'completed' status"""
    try:
        async with session.put(f"{API_BASE}/orders/{test_order_id}/status?status=completed", headers=auth(admin_token)) as response:
            if response.status == 200:
                results.log_pass("Complete Order", "✓ status=completed")
                return True
            text = await response.text()
            results.log_fail("Complete Order", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Complete Order", f"Exception: {e}")
        return False

async def test_rating_ownership(session):
    """POST rating by customer B on A's order → 404 (not yours)"""
    try:
        async with session.post(f"{API_BASE}/orders/{test_order_id}/rating", json={"stars": 1}, headers=auth(customer_b_token)) as response:
            if response.status in (403, 404):
                results.log_pass("Rating Ownership", f"✓ other user's rating rejected with {response.status}")
                return True
            text = await response.text()
            results.log_fail("Rating Ownership", f"Expected 403/404, got {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Rating Ownership", f"Exception: {e}")
        return False

async def test_rating_stars_validation(session):
    """POST rating with stars=0 and stars=6 → 400"""
    ok = True
    for stars in (0, 6):
        try:
            async with session.post(f"{API_BASE}/orders/{test_order_id}/rating", json={"stars": stars}, headers=auth(customer_a_token)) as response:
                if response.status in (400, 422):
                    results.log_pass(f"Rating Stars Validation (stars={stars})", f"✓ rejected with {response.status}")
                else:
                    text = await response.text()
                    results.log_fail(f"Rating Stars Validation (stars={stars})", f"Expected 400/422, got {response.status}: {text}")
                    ok = False
        except Exception as e:
            results.log_fail(f"Rating Stars Validation (stars={stars})", f"Exception: {e}")
            ok = False
    return ok

async def test_rating_once_only(session):
    """A rates their completed order (200), second attempt → 409"""
    try:
        async with session.post(f"{API_BASE}/orders/{test_order_id}/rating", json={"stars": 4, "comment": "Great meal"}, headers=auth(customer_a_token)) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("rating", {}).get("stars") == 4:
                    results.log_pass("Rate Completed Order", "✓ rating saved on the order doc")
                else:
                    results.log_fail("Rate Completed Order", f"Unexpected body: {data}")
                    return False
            else:
                text = await response.text()
                results.log_fail("Rate Completed Order", f"HTTP {response.status}: {text}")
                return False
        async with session.post(f"{API_BASE}/orders/{test_order_id}/rating", json={"stars": 5}, headers=auth(customer_a_token)) as response:
            if response.status == 409:
                results.log_pass("Rating Once Only", "✓ second rating rejected with 409")
                return True
            text = await response.text()
            results.log_fail("Rating Once Only", f"Expected 409, got {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Rating Once Only", f"Exception: {e}")
        return False

# ===================== C. VALUE-CARD CONTROL =====================

async def test_value_card_public_get(session):
    """GET /api/settings/value-card works WITHOUT auth"""
    try:
        async with session.get(f"{API_BASE}/settings/value-card") as response:
            if response.status == 200:
                data = await response.json()
                if data.get("mode") in ("auto", "pin", "off"):
                    results.log_pass("Value Card Public GET", f"✓ unauthenticated, mode={data.get('mode')}")
                    return True
                results.log_fail("Value Card Public GET", f"Unexpected body: {data}")
                return False
            text = await response.text()
            results.log_fail("Value Card Public GET", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Value Card Public GET", f"Exception: {e}")
        return False

async def test_value_card_put_role_guard(session):
    """PUT /api/admin/settings value_card — customer → 403, super_admin → 200"""
    try:
        body = {"value_card": {"mode": "off"}}
        async with session.put(f"{API_BASE}/admin/settings", json=body, headers=auth(customer_a_token)) as response:
            if response.status == 403:
                results.log_pass("Value Card PUT (customer blocked)", "✓ 403 for non-HQ")
            else:
                text = await response.text()
                results.log_fail("Value Card PUT (customer blocked)", f"Expected 403, got {response.status}: {text}")
                return False
        async with session.put(f"{API_BASE}/admin/settings", json=body, headers=auth(admin_token)) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("value_card", {}).get("mode") == "off":
                    results.log_pass("Value Card PUT (super_admin)", "✓ mode=off saved")
                else:
                    results.log_fail("Value Card PUT (super_admin)", f"Unexpected settings: {data}")
                    return False
            else:
                text = await response.text()
                results.log_fail("Value Card PUT (super_admin)", f"HTTP {response.status}: {text}")
                return False
        # pin without product_id must be rejected
        async with session.put(f"{API_BASE}/admin/settings", json={"value_card": {"mode": "pin"}}, headers=auth(admin_token)) as response:
            if response.status == 400:
                results.log_pass("Value Card PUT (pin needs product)", "✓ 400 without product_id")
            else:
                text = await response.text()
                results.log_fail("Value Card PUT (pin needs product)", f"Expected 400, got {response.status}: {text}")
                return False
        # restore default auto so other suites are unaffected
        async with session.put(f"{API_BASE}/admin/settings", json={"value_card": {"mode": "auto"}}, headers=auth(admin_token)) as response:
            if response.status == 200:
                results.log_pass("Value Card PUT (restore auto)", "✓ back to auto")
                return True
            text = await response.text()
            results.log_fail("Value Card PUT (restore auto)", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Value Card PUT Role Guard", f"Exception: {e}")
        return False

async def main():
    global customer_a_token, customer_b_token
    print("🧪 Starting Diet Cafe P7 ENGAGEMENT PACK Backend Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    print("📋 Testing key features:")
    print("   - Saved Meals: POST/GET/DELETE /api/saved-meals (ownership + 20-cap)")
    print("   - Order Rating: POST /api/orders/{id}/rating (status guard, once-only, ownership)")
    print("   - Value Card: GET /api/settings/value-card (public), PUT /api/admin/settings (HQ only)")
    print("=" * 70)

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        print("\n1️⃣ Testing Logins / Registrations...")
        login_success = await test_admin_login(session)
        customer_a_token = await register_customer(session, "a")
        customer_b_token = await register_customer(session, "b")

        if login_success and customer_a_token and customer_b_token:
            print("\n🍱 SAVED MEALS TESTS")
            print("=" * 50)
            print("2️⃣ Testing Create Saved Meal...")
            await test_create_saved_meal(session)
            print("\n3️⃣ Testing Saved Meal Validation...")
            await test_saved_meal_validation(session)
            print("\n4️⃣ Testing List Saved Meals (ownership)...")
            await test_list_saved_meals_own_only(session)
            print("\n5️⃣ Testing Delete Saved Meal (ownership)...")
            await test_delete_saved_meal_ownership(session)
            print("\n6️⃣ Testing Saved Meal 20-Cap...")
            await test_saved_meal_cap(session)

            print("\n⭐ ORDER RATING TESTS")
            print("=" * 50)
            print("7️⃣ Testing Create Order for Rating...")
            if await test_create_order_for_rating(session):
                print("\n8️⃣ Testing Rating Status Guard (non-terminal → 400)...")
                await test_rating_status_guard(session)
                print("\n9️⃣ Testing Complete Order...")
                if await test_complete_order(session):
                    print("\n🔟 Testing Rating Ownership (other user)...")
                    await test_rating_ownership(session)
                    print("\n1️⃣1️⃣ Testing Rating Stars Validation...")
                    await test_rating_stars_validation(session)
                    print("\n1️⃣2️⃣ Testing Rating Once-Only...")
                    await test_rating_once_only(session)

            print("\n🏷️ VALUE-CARD CONTROL TESTS")
            print("=" * 50)
            print("1️⃣3️⃣ Testing Value Card Public GET (no auth)...")
            await test_value_card_public_get(session)
            print("\n1️⃣4️⃣ Testing Value Card PUT Role Guard...")
            await test_value_card_put_role_guard(session)
        else:
            print("⚠️ Skipping feature tests due to login/registration failure")

    results.print_summary()
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
