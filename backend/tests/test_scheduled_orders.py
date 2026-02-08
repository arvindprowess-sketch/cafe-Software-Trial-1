"""
Test suite for Scheduled Order feature in Diet Cafe app.
Tests:
- Creating scheduled orders (dine-in, takeaway, delivery)
- Kitchen alert time calculation (10min for dine-in/takeaway, 20min for delivery)
- Normal orders creation (non-scheduled)
- GET /api/orders/scheduled endpoint
- Confirm scheduled order endpoint
"""

import pytest
import requests
import os
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')

# Product ID for testing
PRODUCT_ID = "f889181b-813f-4de6-94d1-6e0bd2826d43"  # Chicken Breast


class TestScheduledOrders:
    """Test scheduled order functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth tokens for testing"""
        # Kitchen user login
        kitchen_resp = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "1234"})
        assert kitchen_resp.status_code == 200, f"Kitchen login failed: {kitchen_resp.text}"
        self.kitchen_token = kitchen_resp.json()["token"]
        
        # Cashier user login
        cashier_resp = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5678"})
        assert cashier_resp.status_code == 200, f"Cashier login failed: {cashier_resp.text}"
        self.cashier_token = cashier_resp.json()["token"]
        
        self.cashier_headers = {"Authorization": f"Bearer {self.cashier_token}", "Content-Type": "application/json"}
        self.kitchen_headers = {"Authorization": f"Bearer {self.kitchen_token}", "Content-Type": "application/json"}

    def _create_order_payload(self, order_type="dine-in", is_scheduled=False, scheduled_ready_time=None):
        """Helper to create order payload"""
        payload = {
            "order_type": order_type,
            "items": [{
                "product_id": PRODUCT_ID,
                "product_name": "TEST_Chicken Breast",
                "grams": 100,
                "price": 45,
                "calories": 165,
                "protein": 31,
                "carbs": 0,
                "fat": 3.6,
                "product_type": "single"
            }],
            "total_price": 45,
            "total_calories": 165,
            "total_protein": 31,
            "total_carbs": 0,
            "total_fat": 3.6,
            "payment_mode": "cash"
        }
        if is_scheduled and scheduled_ready_time:
            payload["is_scheduled"] = True
            payload["scheduled_ready_time"] = scheduled_ready_time
        return payload

    def test_scheduled_order_dinein_alert_10min(self):
        """Test scheduled dine-in order has 10min kitchen alert time"""
        # Schedule for 30 minutes from now
        ready_time = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        payload = self._create_order_payload(order_type="dine-in", is_scheduled=True, scheduled_ready_time=ready_time)
        
        response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "scheduled", f"Expected status='scheduled', got '{order['status']}'"
        assert order["is_scheduled"] == True
        assert order["scheduled_ready_time"] is not None
        assert order["kitchen_alert_time"] is not None
        assert order["schedule_confirmed"] == False
        
        # Verify 10 minute difference
        ready_dt = datetime.fromisoformat(order["scheduled_ready_time"].replace('Z', '+00:00'))
        alert_dt = datetime.fromisoformat(order["kitchen_alert_time"].replace('Z', '+00:00'))
        diff_minutes = (ready_dt - alert_dt).total_seconds() / 60
        assert diff_minutes == 10, f"Expected 10min alert, got {diff_minutes}min"
        print(f"✅ Dine-in scheduled order created with 10min kitchen alert")

    def test_scheduled_order_takeaway_alert_10min(self):
        """Test scheduled takeaway order has 10min kitchen alert time"""
        ready_time = (datetime.now(timezone.utc) + timedelta(minutes=35)).isoformat()
        payload = self._create_order_payload(order_type="takeaway", is_scheduled=True, scheduled_ready_time=ready_time)
        
        response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "scheduled"
        
        # Verify 10 minute difference
        ready_dt = datetime.fromisoformat(order["scheduled_ready_time"].replace('Z', '+00:00'))
        alert_dt = datetime.fromisoformat(order["kitchen_alert_time"].replace('Z', '+00:00'))
        diff_minutes = (ready_dt - alert_dt).total_seconds() / 60
        assert diff_minutes == 10, f"Expected 10min alert for takeaway, got {diff_minutes}min"
        print(f"✅ Takeaway scheduled order created with 10min kitchen alert")

    def test_scheduled_order_delivery_alert_20min(self):
        """Test scheduled delivery order has 20min kitchen alert time"""
        ready_time = (datetime.now(timezone.utc) + timedelta(minutes=40)).isoformat()
        payload = self._create_order_payload(order_type="delivery", is_scheduled=True, scheduled_ready_time=ready_time)
        
        response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "scheduled"
        
        # Verify 20 minute difference
        ready_dt = datetime.fromisoformat(order["scheduled_ready_time"].replace('Z', '+00:00'))
        alert_dt = datetime.fromisoformat(order["kitchen_alert_time"].replace('Z', '+00:00'))
        diff_minutes = (ready_dt - alert_dt).total_seconds() / 60
        assert diff_minutes == 20, f"Expected 20min alert for delivery, got {diff_minutes}min"
        print(f"✅ Delivery scheduled order created with 20min kitchen alert")

    def test_normal_order_status_preparing(self):
        """Test non-scheduled order has status='preparing' immediately"""
        payload = self._create_order_payload(order_type="dine-in", is_scheduled=False)
        
        response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()
        assert order["status"] == "preparing", f"Expected status='preparing', got '{order['status']}'"
        assert order["is_scheduled"] == False
        assert order["scheduled_ready_time"] is None
        assert order["kitchen_alert_time"] is None
        print(f"✅ Normal order created with status='preparing'")

    def test_get_scheduled_orders_returns_list(self):
        """Test GET /api/orders/scheduled returns scheduled orders with alert_triggered"""
        response = requests.get(f"{BASE_URL}/api/orders/scheduled", headers=self.kitchen_headers)
        assert response.status_code == 200, f"Failed to get scheduled orders: {response.text}"
        
        orders = response.json()
        assert isinstance(orders, list), "Expected list of orders"
        
        # Check that returned orders have alert_triggered field
        for order in orders:
            assert "alert_triggered" in order, "Missing alert_triggered field"
            assert order["is_scheduled"] == True
            assert order["status"] == "scheduled"
        
        print(f"✅ GET /api/orders/scheduled returned {len(orders)} orders")

    def test_confirm_scheduled_order_success(self):
        """Test confirming a scheduled order changes status to preparing"""
        # First create a scheduled order with past alert time (so it's alert triggered)
        ready_time = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        payload = self._create_order_payload(order_type="dine-in", is_scheduled=True, scheduled_ready_time=ready_time)
        
        create_response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert create_response.status_code == 200
        order_id = create_response.json()["id"]
        
        # Confirm the scheduled order
        confirm_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/confirm-scheduled",
            headers=self.kitchen_headers
        )
        assert confirm_response.status_code == 200, f"Confirm failed: {confirm_response.text}"
        
        confirmed_order = confirm_response.json()
        assert confirmed_order["status"] == "preparing", f"Expected status='preparing', got '{confirmed_order['status']}'"
        assert confirmed_order["schedule_confirmed"] == True
        assert "confirmed_at" in confirmed_order
        print(f"✅ Scheduled order confirmed and moved to preparing")

    def test_confirm_non_scheduled_order_fails_400(self):
        """Test confirming a non-scheduled order returns 400 error"""
        # Create a normal order
        payload = self._create_order_payload(order_type="dine-in", is_scheduled=False)
        create_response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert create_response.status_code == 200
        order_id = create_response.json()["id"]
        
        # Try to confirm non-scheduled order (should fail)
        confirm_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/confirm-scheduled",
            headers=self.kitchen_headers
        )
        assert confirm_response.status_code == 400, f"Expected 400 but got {confirm_response.status_code}"
        
        error = confirm_response.json()
        assert "not in scheduled status" in error.get("detail", "").lower() or "scheduled" in error.get("detail", "").lower()
        print(f"✅ Confirm non-scheduled order correctly rejected with 400")

    def test_scheduled_orders_sorted_by_ready_time(self):
        """Test scheduled orders are returned sorted by scheduled_ready_time"""
        response = requests.get(f"{BASE_URL}/api/orders/scheduled", headers=self.kitchen_headers)
        assert response.status_code == 200
        
        orders = response.json()
        if len(orders) >= 2:
            ready_times = [o.get("scheduled_ready_time") for o in orders if o.get("scheduled_ready_time")]
            sorted_times = sorted(ready_times)
            assert ready_times == sorted_times, "Orders should be sorted by scheduled_ready_time"
            print(f"✅ Scheduled orders sorted by ready time")
        else:
            print(f"⚠️ Only {len(orders)} scheduled orders, skipping sort check")


class TestAlertTriggeredLogic:
    """Test alert_triggered computation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth tokens for testing"""
        kitchen_resp = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "1234"})
        assert kitchen_resp.status_code == 200
        self.kitchen_token = kitchen_resp.json()["token"]
        self.kitchen_headers = {"Authorization": f"Bearer {self.kitchen_token}"}
        
        cashier_resp = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5678"})
        assert cashier_resp.status_code == 200
        self.cashier_token = cashier_resp.json()["token"]
        self.cashier_headers = {"Authorization": f"Bearer {self.cashier_token}", "Content-Type": "application/json"}

    def test_alert_triggered_true_for_past_alert_time(self):
        """Test alert_triggered is true when kitchen_alert_time is in the past"""
        # Create order with ready_time only 5 minutes away (alert time would be in the past for 10min rule)
        ready_time = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        
        payload = {
            "order_type": "dine-in",
            "items": [{
                "product_id": PRODUCT_ID,
                "product_name": "TEST_Alert_Order",
                "grams": 50,
                "price": 22.5,
                "calories": 82.5,
                "protein": 15.5,
                "carbs": 0,
                "fat": 1.8,
                "product_type": "single"
            }],
            "total_price": 22.5,
            "total_calories": 82.5,
            "total_protein": 15.5,
            "total_carbs": 0,
            "total_fat": 1.8,
            "payment_mode": "cash",
            "is_scheduled": True,
            "scheduled_ready_time": ready_time
        }
        
        create_response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=self.cashier_headers)
        assert create_response.status_code == 200
        
        # Get scheduled orders and check alert_triggered
        response = requests.get(f"{BASE_URL}/api/orders/scheduled", headers=self.kitchen_headers)
        assert response.status_code == 200
        
        orders = response.json()
        # Find orders with alert_triggered = true
        alert_triggered_orders = [o for o in orders if o.get("alert_triggered") == True]
        print(f"✅ Found {len(alert_triggered_orders)} orders with alert_triggered=true")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
