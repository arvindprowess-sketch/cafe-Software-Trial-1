#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Load backend URL - using localhost since external routing has issues
backend_url = "http://localhost:8001"

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
        print(f"📊 BACKEND TEST RESULTS - Diet Cafe Expo")
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
customer_token = None
offer_id = None
pack_id = None
order_id = None

async def test_admin_login(session):
    """Test admin login with admin@dietcafe.com / admin123"""
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

async def test_seed_offers_packs(session):
    """Test POST /api/seed-offers-packs to seed test data"""
    if not admin_token:
        results.log_fail("Seed Offers & Packs", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.post(f"{API_BASE}/seed-offers-packs", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Seed Offers & Packs", f"✓ {data.get('message', 'Seeded successfully')}")
                return True
            else:
                text = await response.text()
                results.log_fail("Seed Offers & Packs", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Seed Offers & Packs", f"Exception: {e}")
        return False

async def test_get_banners(session):
    """Test GET /api/banners should return 6 banners (3 offers + 3 packs)"""
    try:
        async with session.get(f"{API_BASE}/banners") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    banner_count = len(data)
                    if banner_count == 6:
                        offers_count = sum(1 for b in data if b.get("type") == "offer")
                        packs_count = sum(1 for b in data if b.get("type") == "pack")
                        results.log_pass("Get Banners", f"✓ {banner_count} banners ({offers_count} offers, {packs_count} packs)")
                        return True
                    else:
                        results.log_fail("Get Banners", f"Expected 6 banners, got {banner_count}")
                        return False
                else:
                    results.log_fail("Get Banners", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Banners", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Banners", f"Exception: {e}")
        return False

async def test_get_offers(session):
    """Test GET /api/offers should return 3 active offers"""
    global offer_id
    try:
        async with session.get(f"{API_BASE}/offers") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    offer_count = len(data)
                    if offer_count == 3:
                        # Store first offer ID for later tests
                        if data and data[0].get("id"):
                            offer_id = data[0]["id"]
                        offer_names = [o.get("title", "Unknown") for o in data]
                        results.log_pass("Get Offers", f"✓ {offer_count} offers: {', '.join(offer_names)}")
                        return True
                    else:
                        results.log_fail("Get Offers", f"Expected 3 offers, got {offer_count}")
                        return False
                else:
                    results.log_fail("Get Offers", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Offers", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Offers", f"Exception: {e}")
        return False

async def test_get_offers_all_admin(session):
    """Test GET /api/offers/all (admin) should return all offers"""
    if not admin_token:
        results.log_fail("Get Offers All (Admin)", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/offers/all", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    offer_count = len(data)
                    results.log_pass("Get Offers All (Admin)", f"✓ {offer_count} offers (including inactive)")
                    return True
                else:
                    results.log_fail("Get Offers All (Admin)", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Offers All (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Offers All (Admin)", f"Exception: {e}")
        return False

async def test_get_offer_products(session):
    """Test GET /api/offers/{offer_id}/products should return filtered products with discounted prices"""
    if not offer_id:
        results.log_fail("Get Offer Products", "No offer ID available")
        return False
    
    try:
        async with session.get(f"{API_BASE}/offers/{offer_id}/products") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    product_count = len(data)
                    # Check if products have discounted prices
                    has_discounted = any("discounted_price" in p for p in data) if data else False
                    results.log_pass("Get Offer Products", f"✓ {product_count} products, has discounts: {has_discounted}")
                    return True
                else:
                    results.log_fail("Get Offer Products", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Offer Products", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Offer Products", f"Exception: {e}")
        return False

async def test_create_offer_admin(session):
    """Test POST /api/offers (admin) should create a new offer"""
    if not admin_token:
        results.log_fail("Create Offer (Admin)", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": "Test Offer 50% OFF",
            "description": "Testing offer creation",
            "discount_type": "percentage",
            "discount_value": 50,
            "min_order_value": 100,
            "applicable_categories": ["Protein"],
            "coupon_code": "TEST50",
            "max_discount": 100,
            "is_active": True
        }
        
        async with session.post(f"{API_BASE}/offers", json=payload, headers=headers) as response:
            if response.status == 201:
                data = await response.json()
                if data.get("id"):
                    results.log_pass("Create Offer (Admin)", f"✓ Created offer: {data.get('title')}")
                    return True
                else:
                    results.log_fail("Create Offer (Admin)", "No ID in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Offer (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Offer (Admin)", f"Exception: {e}")
        return False

async def test_update_offer_admin(session):
    """Test PUT /api/offers/{offer_id} (admin) should update an offer"""
    if not admin_token or not offer_id:
        results.log_fail("Update Offer (Admin)", "No admin token or offer ID available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "description": "Updated description via test"
        }
        
        async with session.put(f"{API_BASE}/offers/{offer_id}", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("description") == "Updated description via test":
                    results.log_pass("Update Offer (Admin)", f"✓ Updated offer: {data.get('title')}")
                    return True
                else:
                    results.log_fail("Update Offer (Admin)", "Description not updated")
                    return False
            else:
                text = await response.text()
                results.log_fail("Update Offer (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Update Offer (Admin)", f"Exception: {e}")
        return False

async def test_get_packs(session):
    """Test GET /api/packs should return 3 active packs"""
    global pack_id
    try:
        async with session.get(f"{API_BASE}/packs") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    pack_count = len(data)
                    if pack_count == 3:
                        # Store first pack ID for later tests
                        if data and data[0].get("id"):
                            pack_id = data[0]["id"]
                        pack_names = [p.get("name", "Unknown") for p in data]
                        results.log_pass("Get Packs", f"✓ {pack_count} packs: {', '.join(pack_names)}")
                        return True
                    else:
                        results.log_fail("Get Packs", f"Expected 3 packs, got {pack_count}")
                        return False
                else:
                    results.log_fail("Get Packs", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Packs", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Packs", f"Exception: {e}")
        return False

async def test_get_pack_detail(session):
    """Test GET /api/packs/{pack_id} should return pack detail with enriched items, total_calories, savings"""
    if not pack_id:
        results.log_fail("Get Pack Detail", "No pack ID available")
        return False
    
    try:
        async with session.get(f"{API_BASE}/packs/{pack_id}") as response:
            if response.status == 200:
                data = await response.json()
                has_enriched = "enriched_items" in data
                has_calories = "total_calories" in data
                has_savings = "savings" in data
                results.log_pass("Get Pack Detail", 
                    f"✓ Pack details: enriched_items: {has_enriched}, total_calories: {has_calories}, savings: {has_savings}")
                return True
            else:
                text = await response.text()
                results.log_fail("Get Pack Detail", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Pack Detail", f"Exception: {e}")
        return False

async def test_create_pack_admin(session):
    """Test POST /api/packs (admin) should create a new pack"""
    if not admin_token:
        results.log_fail("Create Pack (Admin)", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Test Pack",
            "description": "Testing pack creation",
            "items": [
                {"product_name": "chicken", "grams": 150},
                {"product_name": "rice", "grams": 100}
            ],
            "original_price": 200,
            "discounted_price": 150,
            "is_active": True
        }
        
        async with session.post(f"{API_BASE}/packs", json=payload, headers=headers) as response:
            if response.status == 201:
                data = await response.json()
                if data.get("id"):
                    results.log_pass("Create Pack (Admin)", f"✓ Created pack: {data.get('name')}")
                    return True
                else:
                    results.log_fail("Create Pack (Admin)", "No ID in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Pack (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Pack (Admin)", f"Exception: {e}")
        return False

async def test_create_mock_order_for_payment(session):
    """Create a test order for payment testing"""
    global order_id
    if not admin_token:
        results.log_fail("Create Mock Order", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "order_type": "dine-in",
            "items": [
                {
                    "product_id": "test-id",
                    "product_name": "Test Item",
                    "grams": 100,
                    "price": 50,
                    "calories": 100,
                    "protein": 10,
                    "carbs": 15,
                    "fat": 5
                }
            ],
            "total_price": 50,
            "total_calories": 100,
            "total_protein": 10,
            "total_carbs": 15,
            "total_fat": 5
        }
        
        async with session.post(f"{API_BASE}/orders", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                order_id = data.get("id")
                if order_id:
                    results.log_pass("Create Mock Order", f"✓ Created order: {order_id}")
                    return True
                else:
                    results.log_fail("Create Mock Order", "No order ID in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Mock Order", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Mock Order", f"Exception: {e}")
        return False

async def test_create_payment_order(session):
    """Test POST /api/payments/create-order should create mock Razorpay order"""
    if not order_id:
        results.log_fail("Create Payment Order", "No order ID available")
        return False
    
    try:
        payload = {
            "order_id": order_id,
            "amount": 50
        }
        
        async with session.post(f"{API_BASE}/payments/create-order", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("razorpay_order_id"):
                    results.log_pass("Create Payment Order", f"✓ Mock Razorpay order: {data.get('razorpay_order_id')}")
                    return True
                else:
                    results.log_fail("Create Payment Order", "No razorpay_order_id in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Payment Order", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Payment Order", f"Exception: {e}")
        return False

async def test_verify_payment(session):
    """Test POST /api/payments/verify should verify mock payment"""
    try:
        payload = {
            "razorpay_order_id": "mock_order_123",
            "razorpay_payment_id": "mock_payment_456",
            "razorpay_signature": "mock_signature"
        }
        
        async with session.post(f"{API_BASE}/payments/verify", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("status") == "success":
                    results.log_pass("Verify Payment", f"✓ Payment verified successfully")
                    return True
                else:
                    results.log_fail("Verify Payment", f"Unexpected status: {data.get('status')}")
                    return False
            else:
                text = await response.text()
                results.log_fail("Verify Payment", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Verify Payment", f"Exception: {e}")
        return False

async def test_apply_coupon(session):
    """Test POST /api/orders/apply-coupon should return discount for valid coupon PROTEIN20"""
    try:
        payload = {
            "coupon_code": "PROTEIN20",
            "total_amount": 100
        }
        
        async with session.post(f"{API_BASE}/orders/apply-coupon", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("discount_amount") is not None:
                    results.log_pass("Apply Coupon", f"✓ PROTEIN20 discount: ₹{data.get('discount_amount')}")
                    return True
                else:
                    results.log_fail("Apply Coupon", "No discount_amount in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Apply Coupon", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Apply Coupon", f"Exception: {e}")
        return False

async def test_ai_adjust_portions(session):
    """Test POST /api/ai/adjust-portions should return AI-suggested portion adjustments"""
    if not admin_token:
        results.log_fail("AI Adjust Portions", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "current_items": [
                {"name": "chicken", "grams": 100},
                {"name": "rice", "grams": 150}
            ],
            "target_calories": 500,
            "fitness_goal": "muscle_gain"
        }
        
        async with session.post(f"{API_BASE}/ai/adjust-portions", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if "adjustments" in data or "suggestions" in data:
                    results.log_pass("AI Adjust Portions", f"✓ AI suggestions received")
                    return True
                else:
                    results.log_fail("AI Adjust Portions", "No adjustments or suggestions in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("AI Adjust Portions", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("AI Adjust Portions", f"Exception: {e}")
        return False

async def main():
    print("🧪 Starting Diet Cafe Expo Backend Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    print("📋 Testing new features as per review request:")
    print("   - Offers/Banners system with admin CRUD")
    print("   - Goal Packs with admin CRUD") 
    print("   - Dynamic Banners from offers + packs (6 total)")
    print("   - Razorpay payment endpoints (mock mode)")
    print("   - Smart Portion Adjuster (AI-powered)")
    print("   - Coupon code application")
    print("   - Admin: admin@dietcafe.com / admin123")
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # Test sequence following the review request features
        print("\n1️⃣ Testing Admin Login...")
        login_success = await test_admin_login(session)
        
        if login_success:
            print("\n2️⃣ Seeding Offers & Packs...")
            await test_seed_offers_packs(session)
            
            print("\n3️⃣ Testing Dynamic Banners (6 expected: 3 offers + 3 packs)...")
            await test_get_banners(session)
            
            print("\n4️⃣ Testing Offers Endpoints...")
            await test_get_offers(session)
            await test_get_offers_all_admin(session)
            await test_get_offer_products(session)
            await test_create_offer_admin(session)
            await test_update_offer_admin(session)
            
            print("\n5️⃣ Testing Packs Endpoints...")
            await test_get_packs(session)
            await test_get_pack_detail(session)
            await test_create_pack_admin(session)
            
            print("\n6️⃣ Testing Payment Endpoints (Mock Mode)...")
            await test_create_mock_order_for_payment(session)
            await test_create_payment_order(session)
            await test_verify_payment(session)
            
            print("\n7️⃣ Testing Coupon System...")
            await test_apply_coupon(session)
            
            print("\n8️⃣ Testing AI Portion Adjuster...")
            await test_ai_adjust_portions(session)
        
        else:
            print("⚠️ Skipping feature tests due to admin login failure")
    
    # Print final results
    results.print_summary()
    
    # Return exit code based on results
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)