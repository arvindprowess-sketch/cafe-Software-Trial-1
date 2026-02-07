#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Load backend URL - Use the exact URL from review request
backend_url = "https://healthy-bites-72.preview.emergentagent.com"

# Also check frontend env as backup
frontend_env_path = Path("/app/frontend/.env")
if frontend_env_path.exists():
    with open(frontend_env_path) as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                backup_url = line.split("=", 1)[1].strip().strip('"')
                print(f"📝 Found frontend backup URL: {backup_url}")
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

async def test_categories_endpoint(session):
    """Test GET /api/categories should return 6 categories (per review request)"""
    try:
        async with session.get(f"{API_BASE}/categories") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    category_count = len(data)
                    # Check for expected 6 categories
                    if category_count == 6:
                        results.log_pass("Categories Endpoint", f"✓ Found exactly {category_count} categories as expected")
                        
                        # Verify category structure  
                        sample_category = data[0] if data else {}
                        required_fields = ['id', 'name', 'icon', 'color']
                        missing_fields = [field for field in required_fields if field not in sample_category]
                        
                        if not missing_fields:
                            results.log_pass("Category Structure Validation", "✓ Categories have all required fields")
                            return True
                        else:
                            results.log_fail("Category Structure Validation", f"Missing fields: {missing_fields}")
                            return False
                    else:
                        results.log_fail("Categories Endpoint", f"Expected 6 categories, got {category_count}")
                        return False
                else:
                    results.log_fail("Categories Endpoint", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Categories Endpoint", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Categories Endpoint", f"Exception: {e}")
        return False

async def test_admin_products_all_endpoint(session):
    """Test GET /api/products/all with admin token should return all products"""
    if not admin_token:
        results.log_fail("Admin Products All Endpoint", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/products/all", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    total_products = len(data)
                    results.log_pass("Admin Products All Endpoint", f"✓ {total_products} products returned with admin token")
                    return True
                else:
                    results.log_fail("Admin Products All Endpoint", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Admin Products All Endpoint", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Admin Products All Endpoint", f"Exception: {e}")
        return False

async def test_admin_only_access(session):
    """Test that admin-only endpoints require proper authentication"""
    try:
        # Test without token first
        async with session.get(f"{API_BASE}/products/all") as response:
            if response.status == 401:
                results.log_pass("Admin Authentication - No Token", "✓ Correctly rejected access without token")
                
                # Test with invalid token
                headers = {"Authorization": "Bearer invalid_token"}
                async with session.get(f"{API_BASE}/products/all", headers=headers) as response2:
                    if response2.status == 401:
                        results.log_pass("Admin Authentication - Invalid Token", "✓ Correctly rejected invalid token")
                        return True
                    else:
                        results.log_fail("Admin Authentication - Invalid Token", f"Expected 401, got {response2.status}")
                        return False
            else:
                results.log_fail("Admin Authentication - No Token", f"Expected 401, got {response.status}")
                return False
    except Exception as e:
        results.log_fail("Admin Authentication", f"Exception: {e}")
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

async def test_products_health_check(session):
    """Test GET /api/products should return 16 products (per review request)"""
    try:
        async with session.get(f"{API_BASE}/products") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    product_count = len(data)
                    # Check for expected 16 products
                    if product_count == 16:
                        results.log_pass("Backend Health Check - Products Count", f"✓ Found exactly {product_count} products as expected")
                        
                        # Verify product structure
                        sample_product = data[0] if data else {}
                        required_fields = ['id', 'name', 'category', 'diet_type', 'calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'cost_per_100g']
                        missing_fields = [field for field in required_fields if field not in sample_product]
                        
                        if not missing_fields:
                            results.log_pass("Product Structure Validation", "✓ Products have all required fields")
                            return True
                        else:
                            results.log_fail("Product Structure Validation", f"Missing fields: {missing_fields}")
                            return False
                    else:
                        results.log_fail("Backend Health Check - Products Count", f"Expected 16 products, got {product_count}")
                        return False
                else:
                    results.log_fail("Backend Health Check - Products", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Backend Health Check - Products", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Backend Health Check - Products", f"Exception: {e}")
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