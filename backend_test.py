#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Load frontend env to get backend URL
frontend_env_path = Path("/app/frontend/.env")
backend_url = "https://mobile-app-resume.preview.emergentagent.com"
if frontend_env_path.exists():
    with open(frontend_env_path) as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                backend_url = line.split("=", 1)[1].strip().strip('"')
                break

API_BASE = f"{backend_url}/api"
print(f"🌐 Testing backend at: {API_BASE}")

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        
    def log_pass(self, test_name, details=""):
        self.passed.append(f"✅ {test_name} {details}".strip())
        print(f"✅ {test_name} {details}".strip())
        
    def log_fail(self, test_name, error):
        self.failed.append(f"❌ {test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        
    def print_summary(self):
        print("\n" + "="*60)
        print(f"📊 BACKEND TEST RESULTS")
        print("="*60)
        print(f"✅ PASSED: {len(self.passed)}")
        print(f"❌ FAILED: {len(self.failed)}")
        if self.failed:
            print("\n🔥 FAILURES:")
            for failure in self.failed:
                print(f"  {failure}")
        print("="*60)

results = TestResults()
admin_token = None

async def test_admin_login(session):
    """Test admin login to get auth token"""
    global admin_token
    try:
        payload = {"email": "admin@dietcafe.com", "password": "admin123"}
        async with session.post(f"{API_BASE}/auth/login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                admin_token = data.get("token")
                user = data.get("user", {})
                if admin_token and user.get("role") == "admin":
                    results.log_pass("Admin Login", f"✓ Token received, role: {user['role']}")
                    return True
                else:
                    results.log_fail("Admin Login", "Missing token or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Admin Login", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Admin Login", f"Exception: {e}")
        return False

async def test_single_product_creation(session):
    """Test single product creation with AI features"""
    if not admin_token:
        results.log_fail("Single Product Creation", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"name": "Mushroom", "price": 80, "grams": 1000}
        
        async with session.post(f"{API_BASE}/products/single", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                
                # Verify required fields
                required_checks = [
                    ("product_type", "single", data.get("product_type")),
                    ("cost_per_100g", 8.0, data.get("cost_per_100g")),  # 80/1000 * 100 = 8.0
                    ("diet_type", "veg", data.get("diet_type")),
                    ("name", "Mushroom", data.get("name"))
                ]
                
                checks_passed = 0
                for field, expected, actual in required_checks:
                    if actual == expected:
                        checks_passed += 1
                    else:
                        results.log_fail("Single Product Creation", f"{field} mismatch: expected {expected}, got {actual}")
                        
                # Check AI-generated content
                has_description = bool(data.get("description"))
                has_image_url = bool(data.get("image_url"))
                has_nutrition = all(k in data for k in ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"])
                
                if checks_passed == 4 and has_description and has_image_url and has_nutrition:
                    results.log_pass("Single Product Creation", 
                        f"✓ cost_per_100g: {data['cost_per_100g']}, diet_type: {data['diet_type']}, " +
                        f"AI desc: '{data.get('description', '')[:40]}...', image: {data.get('image_url') is not None}, " +
                        f"nutrition: {data.get('calories_per_100g')}cal")
                    return data
                else:
                    results.log_fail("Single Product Creation", f"Missing fields: description={has_description}, image={has_image_url}, nutrition={has_nutrition}")
                    return False
            else:
                text = await response.text()
                results.log_fail("Single Product Creation", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Single Product Creation", f"Exception: {e}")
        return False

async def test_ready_made_veg_meal(session):
    """Test ready-made meal creation (veg)"""
    if not admin_token:
        results.log_fail("Ready-Made Veg Meal", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Paneer Butter Masala",
            "ingredients": ["paneer", "butter", "tomato", "cream", "spices"],
            "images": [],
            "price": 179,
            "serving_grams": 350
        }
        
        async with session.post(f"{API_BASE}/products/ready-made", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                
                # Verify required fields
                required_checks = [
                    ("product_type", "ready_made", data.get("product_type")),
                    ("fixed_price", 179, data.get("fixed_price")),
                    ("serving_grams", 350, data.get("serving_grams")),
                    ("diet_type", "veg", data.get("diet_type")),
                    ("name", "Paneer Butter Masala", data.get("name"))
                ]
                
                checks_passed = 0
                for field, expected, actual in required_checks:
                    if actual == expected:
                        checks_passed += 1
                    else:
                        results.log_fail("Ready-Made Veg Meal", f"{field} mismatch: expected {expected}, got {actual}")
                        
                # Check ingredients array
                ingredients_correct = data.get("ingredients") == payload["ingredients"]
                has_description = bool(data.get("description"))
                has_nutrition = all(k in data for k in ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"])
                
                if checks_passed == 5 and ingredients_correct and has_description and has_nutrition:
                    results.log_pass("Ready-Made Veg Meal", 
                        f"✓ diet_type: {data['diet_type']}, ingredients: {len(data['ingredients'])}, " +
                        f"serving: {data['serving_grams']}g, price: ₹{data['fixed_price']}, " +
                        f"AI desc: '{data.get('description', '')[:30]}...', " +
                        f"nutrition: {data.get('calories_per_100g')}cal")
                    return data
                else:
                    results.log_fail("Ready-Made Veg Meal", f"Failed checks: ingredients={ingredients_correct}, description={has_description}, nutrition={has_nutrition}")
                    return False
            else:
                text = await response.text()
                results.log_fail("Ready-Made Veg Meal", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Ready-Made Veg Meal", f"Exception: {e}")
        return False

async def test_ready_made_nonveg_meal(session):
    """Test ready-made meal creation with non-veg detection"""
    if not admin_token:
        results.log_fail("Ready-Made Non-Veg Detection", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Egg Curry",
            "ingredients": ["egg", "onion", "tomato", "spices"],
            "images": [],
            "price": 129,
            "serving_grams": 300
        }
        
        async with session.post(f"{API_BASE}/products/ready-made", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                
                # Main check: diet_type should be "non-veg" because of egg
                if data.get("diet_type") == "non-veg":
                    results.log_pass("Ready-Made Non-Veg Detection", 
                        f"✓ Correctly detected diet_type: {data['diet_type']} (egg ingredient)")
                    return data
                else:
                    results.log_fail("Ready-Made Non-Veg Detection", 
                        f"Expected diet_type 'non-veg' but got '{data.get('diet_type')}' (ingredients contain egg)")
                    return False
            else:
                text = await response.text()
                results.log_fail("Ready-Made Non-Veg Detection", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Ready-Made Non-Veg Detection", f"Exception: {e}")
        return False

async def test_products_list_admin(session):
    """Test admin products list to verify new products appear"""
    if not admin_token:
        results.log_fail("Products List (Admin)", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/products/all", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    # Look for the products we just created
                    mushroom_found = any(p.get("name") == "Mushroom" and p.get("product_type") == "single" for p in data)
                    paneer_masala_found = any(p.get("name") == "Paneer Butter Masala" and p.get("product_type") == "ready_made" for p in data)
                    egg_curry_found = any(p.get("name") == "Egg Curry" and p.get("product_type") == "ready_made" for p in data)
                    
                    total_products = len(data)
                    found_count = sum([mushroom_found, paneer_masala_found, egg_curry_found])
                    
                    results.log_pass("Products List (Admin)", 
                        f"✓ {total_products} products total, found {found_count}/3 new products with correct product_type")
                    return True
                else:
                    results.log_fail("Products List (Admin)", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Products List (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Products List (Admin)", f"Exception: {e}")
        return False

async def test_existing_products_endpoint(session):
    """Test that existing GET /api/products still works"""
    try:
        async with session.get(f"{API_BASE}/products") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    active_products = [p for p in data if p.get("is_active", True)]
                    results.log_pass("Existing Products Endpoint", f"✓ {len(active_products)} active products returned")
                    return True
                else:
                    results.log_fail("Existing Products Endpoint", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Existing Products Endpoint", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Existing Products Endpoint", f"Exception: {e}")
        return False

async def test_ai_quick_meal_endpoint(session):
    """Test that existing AI Quick Meal endpoint still works"""
    if not admin_token:
        results.log_fail("AI Quick Meal Endpoint", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "diet_preference": "veg",
            "goal": "maintenance",
            "budget": 150,
            "order_type": "dine-in"
        }
        
        async with session.post(f"{API_BASE}/ai/quick-meal", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                meal_items = data.get("meal_items", [])
                totals = data.get("totals", {})
                
                if meal_items and totals:
                    results.log_pass("AI Quick Meal Endpoint", 
                        f"✓ {len(meal_items)} items, ₹{totals.get('price', 0)} total, {totals.get('calories', 0)} cal")
                    return True
                else:
                    results.log_fail("AI Quick Meal Endpoint", "Missing meal_items or totals in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("AI Quick Meal Endpoint", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("AI Quick Meal Endpoint", f"Exception: {e}")
        return False

async def main():
    print("🧪 Starting Backend API Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # Test sequence following the review request
        print("\n1️⃣ Testing Admin Login...")
        login_success = await test_admin_login(session)
        
        if login_success:
            print("\n2️⃣ Testing Single Product Creation...")
            await test_single_product_creation(session)
            
            print("\n3️⃣ Testing Ready-Made Veg Meal Creation...")
            await test_ready_made_veg_meal(session)
            
            print("\n4️⃣ Testing Non-Veg Detection for Ready-Made Meals...")
            await test_ready_made_nonveg_meal(session)
            
            print("\n5️⃣ Testing Products List (Admin)...")
            await test_products_list_admin(session)
        
        print("\n6️⃣ Testing Existing Endpoints...")
        await test_existing_products_endpoint(session)
        await test_ai_quick_meal_endpoint(session)
    
    # Print final results
    results.print_summary()
    
    # Return exit code based on results
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)