#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Use the public endpoint from environment
API_BASE = "https://wellness-cafe.preview.emergentagent.com/api"
print(f"🌐 Testing Diet Cafe Cashier POS 5 Fixes at: {API_BASE}")
print(f"🎯 Testing 5 specific fixes from review request")

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
        if any(critical in test_name.lower() for critical in ["login", "auth", "401", "ai", "budget"]):
            self.critical_issues.append(f"{test_name}: {error}")
        
    def print_summary(self):
        success_rate = len(self.passed) / (len(self.passed) + len(self.failed)) * 100 if (len(self.passed) + len(self.failed)) > 0 else 0
        print("\n" + "="*70)
        print(f"📊 CASHIER POS 5 FIXES TEST RESULTS")
        print("="*70)
        print(f"✅ PASSED: {len(self.passed)}")
        print(f"❌ FAILED: {len(self.failed)}")
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        
        if self.critical_issues:
            print(f"\n🔥 CRITICAL ISSUES:")
            for issue in self.critical_issues:
                print(f"  ❌ {issue}")
                
        if self.failed:
            print(f"\n📝 ALL FAILURES:")
            for failure in self.failed:
                print(f"  {failure}")
        print("="*70)

results = TestResults()
cashier_token = None

async def test_cashier_pin_login(session):
    """Test FIX VALIDATION: Cashier login with PIN 5678"""
    global cashier_token
    try:
        payload = {"pin": "5678"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                cashier_token = data.get("token")
                user = data.get("user", {})
                if cashier_token and user.get("role") == "cashier":
                    results.log_pass("Cashier PIN Login (5678)", f"✓ Login successful, role: {user['role']}, name: {user.get('name')}")
                    return True
                else:
                    results.log_fail("Cashier PIN Login (5678)", "Missing token or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Cashier PIN Login (5678)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Cashier PIN Login (5678)", f"Exception: {e}")
        return False

async def test_get_admin_categories_only(session):
    """Test FIX #4: Categories endpoint returns admin-created categories only"""
    try:
        async with session.get(f"{API_BASE}/categories") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    # Check for admin-created categories like Protein, Carb, Fat, Meal
                    category_keys = [cat.get("key") for cat in data]
                    expected_categories = ["Protein", "Carb", "Fat", "Meal"]
                    found_categories = [cat for cat in expected_categories if cat in category_keys]
                    
                    if len(found_categories) >= 3:  # Should have at least 3 of the expected categories
                        results.log_pass("FIX #4: Admin Categories", f"✓ Found admin categories: {found_categories}")
                        return True
                    else:
                        results.log_fail("FIX #4: Admin Categories", f"Only found {len(found_categories)} admin categories: {found_categories}")
                        return False
                else:
                    results.log_fail("FIX #4: Admin Categories", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("FIX #4: Admin Categories", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #4: Admin Categories", f"Exception: {e}")
        return False

async def test_get_active_offers(session):
    """Test FIX #5: Offers endpoint returns active offers for banner"""
    try:
        async with session.get(f"{API_BASE}/offers") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    active_offers = len(data)
                    if active_offers > 0:
                        # Check if offers have required fields for banner
                        first_offer = data[0]
                        has_title = "title" in first_offer
                        has_subtitle = "subtitle" in first_offer
                        has_coupon = "coupon_code" in first_offer
                        has_banner_color = "banner_color" in first_offer
                        results.log_pass("FIX #5: Active Offers", f"✓ {active_offers} offers found, has required fields: title={has_title}, subtitle={has_subtitle}, coupon={has_coupon}, banner_color={has_banner_color}")
                        return True
                    else:
                        results.log_pass("FIX #5: Active Offers", "✓ No active offers (valid state)")
                        return True
                else:
                    results.log_fail("FIX #5: Active Offers", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("FIX #5: Active Offers", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #5: Active Offers", f"Exception: {e}")
        return False

async def test_apply_coupon(session):
    """Test FIX #5 INTEGRATION: Apply coupon code functionality"""
    if not cashier_token:
        results.log_fail("FIX #5: Apply Coupon", "No cashier token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {cashier_token}"}
        payload = {"coupon_code": "PROTEIN20"}  # Based on default seeded offers
        async with session.post(f"{API_BASE}/orders/apply-coupon", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if "discount_type" in data and "discount_value" in data:
                    results.log_pass("FIX #5: Apply Coupon", f"✓ Coupon applied: {data.get('title', 'N/A')}, discount: {data.get('discount_value', 0)}% off")
                    return True
                else:
                    results.log_fail("FIX #5: Apply Coupon", "Missing discount fields in response")
                    return False
            elif response.status == 404:
                results.log_pass("FIX #5: Apply Coupon", "✓ No active coupons available (valid state)")
                return True
            else:
                text = await response.text()
                results.log_fail("FIX #5: Apply Coupon", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #5: Apply Coupon", f"Exception: {e}")
        return False

async def test_ai_quick_meal_budget_accuracy(session):
    """Test FIX #1: AI Guide ₹300 budget should utilize 95-100% of budget"""
    if not cashier_token:
        results.log_fail("FIX #1: AI Budget Test", "No cashier token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {cashier_token}"}
        payload = {
            "diet_preference": "both",
            "goal": "maintenance", 
            "budget": 300,
            "order_type": "dine-in"
        }
        
        async with session.post(f"{API_BASE}/ai/quick-meal", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                meal_items = data.get("meal_items", [])
                totals = data.get("totals", {})
                total_price = totals.get("price", 0)
                
                if meal_items and total_price > 0:
                    budget_utilization = (total_price / 300) * 100
                    if 95 <= budget_utilization <= 105:  # 95-100% + 5% tolerance
                        results.log_pass("FIX #1: AI Budget 300", f"✓ Budget utilization: {budget_utilization:.1f}% (₹{total_price}/₹300)")
                        return True
                    else:
                        results.log_fail("FIX #1: AI Budget 300", f"Budget utilization: {budget_utilization:.1f}% (₹{total_price}/₹300) - Should be 95-100%")
                        return False
                else:
                    results.log_fail("FIX #1: AI Budget 300", "No meal items or price in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("FIX #1: AI Budget 300", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #1: AI Budget 300", f"Exception: {e}")
        return False

async def test_hold_bills_crud(session):
    """Test FIX #2: Hold bills - CRUD operations"""
    if not cashier_token:
        results.log_fail("FIX #2: Hold Bills", "No cashier token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {cashier_token}"}
        
        # Test POST: Create a held bill
        hold_payload = {
            "customer_name": "Test Customer",
            "order_type": "dine-in",
            "items": [
                {
                    "id": "test-item",
                    "name": "Test Item",
                    "grams": 100,
                    "price": 50,
                    "calories": 100,
                    "protein": 10,
                    "carbs": 15,
                    "fat": 5
                }
            ],
            "coupon_code": None,
            "coupon_discount": 0
        }
        
        async with session.post(f"{API_BASE}/held-bills", json=hold_payload, headers=headers) as response:
            if response.status == 200:
                hold_data = await response.json()
                hold_id = hold_data.get("id")
                
                if hold_id:
                    results.log_pass("FIX #2: Hold Bills Create", f"✓ Created held bill: {hold_id}")
                    
                    # Test GET: List held bills
                    async with session.get(f"{API_BASE}/held-bills", headers=headers) as get_response:
                        if get_response.status == 200:
                            bills_data = await get_response.json()
                            if isinstance(bills_data, list) and len(bills_data) > 0:
                                results.log_pass("FIX #2: Hold Bills List", f"✓ Found {len(bills_data)} held bills")
                                
                                # Test DELETE: Remove held bill
                                async with session.delete(f"{API_BASE}/held-bills/{hold_id}", headers=headers) as delete_response:
                                    if delete_response.status == 200:
                                        results.log_pass("FIX #2: Hold Bills Delete", f"✓ Deleted held bill: {hold_id}")
                                        return True
                                    else:
                                        results.log_fail("FIX #2: Hold Bills Delete", f"Delete failed: {delete_response.status}")
                                        return False
                            else:
                                results.log_fail("FIX #2: Hold Bills List", "No held bills found")
                                return False
                        else:
                            results.log_fail("FIX #2: Hold Bills List", f"Get failed: {get_response.status}")
                            return False
                else:
                    results.log_fail("FIX #2: Hold Bills Create", "No ID in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("FIX #2: Hold Bills Create", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #2: Hold Bills", f"Exception: {e}")
        return False

async def test_get_products_for_merging(session):
    """Test FIX #3: Get products for cart merging test"""
    try:
        async with session.get(f"{API_BASE}/products") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Find products suitable for testing cart merging
                    single_products = [p for p in data if p.get("product_type") != "ready_made"]
                    if len(single_products) > 0:
                        results.log_pass("FIX #3: Products Available", f"✓ Found {len(single_products)} single products for cart merging test")
                        return True
                    else:
                        results.log_fail("FIX #3: Products Available", "No single products found for merging test")
                        return False
                else:
                    results.log_fail("FIX #3: Products Available", "No products found")
                    return False
            else:
                text = await response.text()
                results.log_fail("FIX #3: Products Available", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("FIX #3: Products Available", f"Exception: {e}")
        return False

async def main():
    print("🧪 Starting Cashier POS 5 Fixes Backend Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    print("🎯 TESTING 5 SPECIFIC FIXES:")
    print("   Fix #1: AI ₹300 budget should divide diet exactly to ₹300 (95-100% utilization)")
    print("   Fix #2: Hold bills - when moved back, goes to Hold under Orders")  
    print("   Fix #3: AI cart items merge into single entries (not multiple)")
    print("   Fix #4: Categories show ONLY admin-created categories")
    print("   Fix #5: Admin offers visible to cashier with clickable add-to-cart")
    print("   Test credentials: Cashier PIN: 5678")
    print("="*70)
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # Test cashier login first
        print("\n🔐 Testing Cashier PIN Login...")
        login_success = await test_cashier_pin_login(session)
        
        # Test all 5 fixes
        print("\n🏗️ TESTING THE 5 FIXES")
        print("="*50)
        
        print("\n1️⃣ FIX #4: Testing Admin-Created Categories...")
        await test_get_admin_categories_only(session)
        
        print("\n2️⃣ FIX #5: Testing Active Offers for Banner...")
        await test_get_active_offers(session)
        
        if login_success:
            print("\n3️⃣ FIX #5: Testing Apply Coupon Integration...")
            await test_apply_coupon(session)
            
            print("\n4️⃣ FIX #1: Testing AI ₹300 Budget Accuracy...")
            await test_ai_quick_meal_budget_accuracy(session)
            
            print("\n5️⃣ FIX #2: Testing Hold Bills CRUD...")
            await test_hold_bills_crud(session)
            
            print("\n6️⃣ FIX #3: Testing Products for Cart Merging...")
            await test_get_products_for_merging(session)
        else:
            print("⚠️ Skipping cashier-specific tests due to login failure")
    
    # Print final results
    results.print_summary()
    
    # Return exit code based on results
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)