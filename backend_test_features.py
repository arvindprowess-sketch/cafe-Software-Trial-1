#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Use the public endpoint from the review request
API_BASE = "https://cashier-hub-8.preview.emergentagent.com/api"
print(f"🌐 Testing Diet Cafe NEW FEATURES at: {API_BASE}")
print(f"🎯 Focus: Stock Management, Notifications, Coupons, Receipts, Kitchen Tickets, Shifts, Loyalty, Streaks, Meal Plans")

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
        success_rate = len(self.passed) / (len(self.passed) + len(self.failed)) * 100 if (len(self.passed) + len(self.failed)) > 0 else 0
        print("\n" + "="*70)
        print(f"📊 DIET CAFE NEW FEATURES TEST RESULTS")
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
admin_token = None
test_order_id = None
product_id = None

async def test_admin_login(session):
    """Test admin login with admin@dietcafe.com / admin123"""
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

async def test_get_inventory(session):
    """Test GET /api/inventory"""
    global product_id
    if not admin_token:
        results.log_fail("Get Inventory", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/inventory", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list) and len(data) > 0:
                    product_id = data[0].get("id")
                    results.log_pass("Get Inventory", f"✓ {len(data)} items available")
                    return True
                else:
                    results.log_pass("Get Inventory", "✓ Empty inventory")
                    return True
            text = await response.text()
            results.log_fail("Get Inventory", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Inventory", f"Exception: {e}")
        return False

async def test_update_stock(session):
    """Test POST /api/inventory/update-stock"""
    if not admin_token or not product_id:
        results.log_fail("Update Stock", "No admin token or product ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "product_id": product_id,
            "quantity_grams": 500,
            "reason": "Test stock update"
        }
        async with session.post(f"{API_BASE}/inventory/update-stock", json=payload, headers=headers) as response:
            if response.status == 200:
                results.log_pass("Update Stock", "✓ Stock updated successfully")
                return True
            text = await response.text()
            results.log_fail("Update Stock", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Update Stock", f"Exception: {e}")
        return False

async def test_get_stock_logs(session):
    """Test GET /api/inventory/stock-logs"""
    if not admin_token:
        results.log_fail("Get Stock Logs", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/inventory/stock-logs", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Stock Logs", f"✓ {len(data)} log entries")
                return True
            text = await response.text()
            results.log_fail("Get Stock Logs", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Stock Logs", f"Exception: {e}")
        return False

async def test_apply_coupon(session):
    """Test POST /api/orders/apply-coupon with PROTEIN20"""
    if not admin_token:
        results.log_fail("Apply Coupon", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"coupon_code": "PROTEIN20"}
        async with session.post(f"{API_BASE}/orders/apply-coupon", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Apply Coupon", f"✓ PROTEIN20 valid: {data}")
                return True
            text = await response.text()
            results.log_fail("Apply Coupon", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Apply Coupon", f"Exception: {e}")
        return False

async def test_create_order_for_receipt(session):
    """Create test order for receipt testing"""
    global test_order_id
    if not admin_token:
        results.log_fail("Create Order for Receipt", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "order_type": "dine-in",
            "items": [{
                "product_id": "test-receipt-id",
                "product_name": "Test Receipt Item",
                "grams": 100,
                "price": 50,
                "calories": 100,
                "protein": 10,
                "carbs": 15,
                "fat": 5
            }],
            "total_price": 50,
            "total_calories": 100,
            "total_protein": 10,
            "total_carbs": 15,
            "total_fat": 5
        }
        
        async with session.post(f"{API_BASE}/orders", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                test_order_id = data.get("id")
                if test_order_id:
                    results.log_pass("Create Order for Receipt", f"✓ Created order: {test_order_id}")
                    return True
            text = await response.text()
            results.log_fail("Create Order for Receipt", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Create Order for Receipt", f"Exception: {e}")
        return False

async def test_get_order_receipt(session):
    """Test GET /api/orders/{order_id}/receipt"""
    if not admin_token or not test_order_id:
        results.log_fail("Get Order Receipt", "No admin token or order ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/orders/{test_order_id}/receipt", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Order Receipt", f"✓ Receipt generated: {data.get('order_id')}")
                return True
            text = await response.text()
            results.log_fail("Get Order Receipt", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Order Receipt", f"Exception: {e}")
        return False

async def test_get_kitchen_ticket(session):
    """Test GET /api/orders/{order_id}/kitchen-ticket"""
    if not admin_token or not test_order_id:
        results.log_fail("Get Kitchen Ticket", "No admin token or order ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/orders/{test_order_id}/kitchen-ticket", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Kitchen Ticket", f"✓ Kitchen ticket generated: {data.get('order_id')}")
                return True
            text = await response.text()
            results.log_fail("Get Kitchen Ticket", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Kitchen Ticket", f"Exception: {e}")
        return False

async def test_create_shift(session):
    """Test POST /api/shifts"""
    if not admin_token:
        results.log_fail("Create Shift", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "staff_id": "test-staff-id",
            "date": "2024-12-19",
            "start_time": "09:00",
            "end_time": "17:00",
            "notes": "Test shift"
        }
        async with session.post(f"{API_BASE}/shifts", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Create Shift", f"✓ Shift created: {data.get('id')}")
                return True
            text = await response.text()
            results.log_fail("Create Shift", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Create Shift", f"Exception: {e}")
        return False

async def test_get_shifts(session):
    """Test GET /api/shifts"""
    if not admin_token:
        results.log_fail("Get Shifts", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/shifts", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Shifts", f"✓ {len(data)} shifts found")
                return True
            text = await response.text()
            results.log_fail("Get Shifts", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Shifts", f"Exception: {e}")
        return False

async def test_get_loyalty_points(session):
    """Test GET /api/loyalty/points"""
    if not admin_token:
        results.log_fail("Get Loyalty Points", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/loyalty/points", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Loyalty Points", f"✓ Loyalty data: {data.get('points', 'N/A')} points")
                return True
            text = await response.text()
            results.log_fail("Get Loyalty Points", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Loyalty Points", f"Exception: {e}")
        return False

async def test_get_notifications(session):
    """Test GET /api/notifications"""
    if not admin_token:
        results.log_fail("Get Notifications", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/notifications", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Notifications", f"✓ {len(data)} notifications")
                return True
            text = await response.text()
            results.log_fail("Get Notifications", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Notifications", f"Exception: {e}")
        return False

async def test_get_streak(session):
    """Test GET /api/streak"""
    if not admin_token:
        results.log_fail("Get Streak", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/streak", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Streak", f"✓ Streak data: {data.get('current_streak', 'N/A')} days")
                return True
            text = await response.text()
            results.log_fail("Get Streak", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Streak", f"Exception: {e}")
        return False

async def test_get_meal_plans(session):
    """Test GET /api/meal-plans"""
    if not admin_token:
        results.log_fail("Get Meal Plans", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/meal-plans", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Get Meal Plans", f"✓ {len(data)} meal plans")
                return True
            text = await response.text()
            results.log_fail("Get Meal Plans", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Get Meal Plans", f"Exception: {e}")
        return False

async def test_create_meal_plan(session):
    """Test POST /api/meal-plans"""
    if not admin_token:
        results.log_fail("Create Meal Plan", "No admin token")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Test Weekly Plan",
            "duration_days": 7,
            "target_calories": 2000,
            "meals": []
        }
        async with session.post(f"{API_BASE}/meal-plans", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Create Meal Plan", f"✓ Meal plan created: {data.get('id')}")
                return True
            text = await response.text()
            results.log_fail("Create Meal Plan", f"HTTP {response.status}: {text}")
            return False
    except Exception as e:
        results.log_fail("Create Meal Plan", f"Exception: {e}")
        return False

async def main():
    print("🧪 Starting Diet Cafe NEW FEATURES Backend Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    print("🎯 FOCUS: New features from P0, P1, P2 implementation")
    print("📋 Testing key features from review request:")
    print("   - Stock Management: POST /api/inventory/update-stock, GET /api/inventory/stock-logs")
    print("   - Coupon Codes: POST /api/orders/apply-coupon")
    print("   - Receipt/Bill Generation: GET /api/orders/{order_id}/receipt")
    print("   - Kitchen Tickets: GET /api/orders/{order_id}/kitchen-ticket")
    print("   - Shift Management: POST /api/shifts, GET /api/shifts")
    print("   - Loyalty: GET /api/loyalty/points")
    print("   - Notifications: GET /api/notifications")
    print("   - Streak: GET /api/streak")
    print("   - Meal Plans: GET /api/meal-plans, POST /api/meal-plans")
    print("="*70)
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # Test sequence focusing on NEW features
        print("\n1️⃣ Testing Admin Login...")
        login_success = await test_admin_login(session)
        
        if login_success:
            print("\n📦 INVENTORY/STOCK MANAGEMENT TESTS")
            print("="*50)
            print("2️⃣ Testing Get Inventory...")
            await test_get_inventory(session)
            
            print("\n3️⃣ Testing Update Stock...")
            await test_update_stock(session)
            
            print("\n4️⃣ Testing Get Stock Logs...")
            await test_get_stock_logs(session)
            
            print("\n🏷️ COUPON & PAYMENT TESTS")
            print("="*50)
            print("5️⃣ Testing Apply Coupon (PROTEIN20)...")
            await test_apply_coupon(session)
            
            print("\n📋 ORDER & RECEIPT TESTS")
            print("="*50)
            print("6️⃣ Testing Create Order for Receipt...")
            await test_create_order_for_receipt(session)
            
            print("\n7️⃣ Testing Get Order Receipt...")
            await test_get_order_receipt(session)
            
            print("\n8️⃣ Testing Get Kitchen Ticket...")
            await test_get_kitchen_ticket(session)
            
            print("\n⏰ SHIFT MANAGEMENT TESTS")
            print("="*50)
            print("9️⃣ Testing Create Shift...")
            await test_create_shift(session)
            
            print("\n🔟 Testing Get Shifts...")
            await test_get_shifts(session)
            
            print("\n🎯 LOYALTY & GAMIFICATION TESTS")
            print("="*50)
            print("1️⃣1️⃣ Testing Get Loyalty Points...")
            await test_get_loyalty_points(session)
            
            print("\n1️⃣2️⃣ Testing Get Streak...")
            await test_get_streak(session)
            
            print("\n🔔 NOTIFICATION TESTS")
            print("="*50)
            print("1️⃣3️⃣ Testing Get Notifications...")
            await test_get_notifications(session)
            
            print("\n🍽️ MEAL PLANNING TESTS")
            print("="*50)
            print("1️⃣4️⃣ Testing Get Meal Plans...")
            await test_get_meal_plans(session)
            
            print("\n1️⃣5️⃣ Testing Create Meal Plan...")
            await test_create_meal_plan(session)
            
        else:
            print("⚠️ Skipping feature tests due to admin login failure")
    
    # Print final results
    results.print_summary()
    
    # Return exit code based on results
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)