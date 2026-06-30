import asyncio, json, os, socketio, httpx

BASE = "http://localhost:8001"
# Auth V2: code+password from env (no fixed admin creds).
ADMIN_CODE = os.environ.get("SMOKE_ADMIN_CODE", "owner@boraroc.com")
ADMIN_PASSWORD = os.environ.get("SMOKE_ADMIN_PASSWORD", "")

async def main():
    received = []
    sio = socketio.AsyncClient()

    @sio.on("update")
    async def on_update(data):
        received.append(data)
        print("[WS] received:", data.get("type"))

    await sio.connect(BASE, socketio_path="/api/socket.io", transports=["polling"])
    await sio.emit("join_room", {"room_id": "kitchen"})
    await asyncio.sleep(1)

    async with httpx.AsyncClient(timeout=20) as hc:
        tok = (await hc.post(f"{BASE}/api/auth/login", json={"code": ADMIN_CODE, "password": ADMIN_PASSWORD})).json()["token"]
        prods = (await hc.get(f"{BASE}/api/products")).json()
        p = prods[0]
        order = {
            "order_type":"dine-in",
            "items":[{"product_id":p["id"],"product_name":p["name"],"grams":100,"price":50,
                      "calories":100,"protein":5,"carbs":10,"fat":2,"product_type":"single","quantity":1}],
            "total_price":50,"total_calories":100,"total_protein":5,"total_carbs":10,"total_fat":2,
            "payment_mode":"cash"
        }
        r = await hc.post(f"{BASE}/api/orders", json=order, headers={"Authorization":f"Bearer {tok}"})
        print("order create:", r.status_code, r.json().get("id"))
        oid = r.json().get("id")
        await asyncio.sleep(1.5)
        # status update -> should broadcast order_status
        await hc.put(f"{BASE}/api/orders/{oid}/status?status=accepted", headers={"Authorization":f"Bearer {tok}"})
        await asyncio.sleep(1.5)

    await sio.disconnect()
    types = [m.get("type") for m in received]
    print("EVENT TYPES RECEIVED:", types)
    assert "new_order" in types, "new_order not received!"
    assert "order_status" in types, "order_status not received!"
    print("WS SMOKE PASS")

asyncio.run(main())
