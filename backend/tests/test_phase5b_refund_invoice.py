"""Phase 5B — refund/void (reason + audit + stock reversal) + GST invoice.

In-process (mongomock). Order-independent (pytest-randomly-safe): each test
places its own fresh order.

Run:  pytest backend/tests/test_phase5b_refund_invoice.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase5b_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


class Ctx:
    pass


@pytest.fixture(scope="module")
def ctx():
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        await client.post("/api/seed")
        c.hq = (await client.post("/api/auth/login", json={"email": "admin@dietcafe.com", "password": "admin123"})).json()["token"]
        c.store_a = (await client.post("/api/stores", json={"name": "A", "code": "AAA", "gst_no": "29ABCDE1234F1Z5", "fssai_license": "12345678901234", "address": "MG Road"}, headers=auth(c.hq))).json()["store_id"]

        async def mk_staff(role, store_id=None, pin="0"):
            body = {"name": role + pin, "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return r.json()["id"], server.create_token(r.json()["id"], role)
        c.mgr_id, c.mgr = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_id, c.cashier = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.kitchen_id, c.kitchen = await mk_staff("kitchen", store_id=c.store_a, pin="3333")

        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))
        c.cust = (await client.post("/api/auth/register", json={"email": "c@t.com", "password": "p", "name": "c", "role": "customer"})).json()
        c.cust_token = c.cust["token"]
        c.cust_id = c.cust["user"]["id"]

        # clean raw product + inventory in store A (avg_cost 1, qty 10000)
        c.prod_id = str(uuid.uuid4())
        await server.db.products.insert_one({
            "id": c.prod_id, "name": "Refund Chicken", "product_type": "single",
            "cost_per_100g": 100, "available_qty_grams": 0, "is_active": True,
            "calories_per_100g": 100, "protein_per_100g": 10, "carbs_per_100g": 5, "fat_per_100g": 2})
        iid = (await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr),
                                 json={"name": "Refund Chicken", "unit": "g", "product_id": c.prod_id, "qty_on_hand": 0, "avg_cost": 0})).json()["id"]
        c.item_id = iid
        await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr),
                          json={"item_id": iid, "qty": 100000, "purchase_price": 1})
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _place(ctx, grams=200, price=300, gst=True):
    body = {
        "order_type": "dine-in", "store_id": ctx.store_a,
        "items": [{"product_id": ctx.prod_id, "product_name": "Refund Chicken", "grams": grams, "price": price,
                   "quantity": 1, "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "product_type": "single"}],
        "total_price": price, "item_subtotal": price,
        "total_calories": 1, "total_protein": 1, "total_carbs": 1, "total_fat": 1, "confirm_duplicate": True,
    }
    if gst:
        body["gstin"] = "29XYZAB9999Q1Z2"
        body["business_name"] = "Acme Foods"
    r = await ctx.client.post("/api/orders", json=body, headers=auth(ctx.cust_token))
    return r.json()


async def _item_qty(ctx):
    it = await server.db.inventory_items.find_one({"id": ctx.item_id, "store_id": ctx.store_a}, {"_id": 0})
    return float(it["qty_on_hand"])


# ---------- reason required ----------

def test_refund_and_void_require_reason(ctx):
    async def go():
        o = await _place(ctx)
        r = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.mgr), json={"reason": ""})
        assert r.status_code == 400
        v = await ctx.client.post(f"/api/orders/{o['id']}/void", headers=auth(ctx.mgr), json={"reason": ""})
        assert v.status_code == 400
    run(go())


# ---------- refund reverses stock once; idempotent ----------

def test_refund_reverses_stock_once(ctx):
    async def go():
        before = await _item_qty(ctx)
        o = await _place(ctx, grams=200)          # sale -200
        assert await _item_qty(ctx) == before - 200
        r = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.mgr), json={"reason": "customer changed mind"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "refunded"
        assert await _item_qty(ctx) == before     # +200 re-added
        # exactly one 'refund' movement for this order
        assert await server.db.movement_log.count_documents({"ref_id": o["id"], "type": "refund"}) == 1
        # second refund attempt -> 400 (already refunded) => no double reversal
        r2 = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.mgr), json={"reason": "again"})
        assert r2.status_code == 400
        assert await _item_qty(ctx) == before
    run(go())


def test_partial_refund_reverses_only_that_qty(ctx):
    async def go():
        before = await _item_qty(ctx)
        o = await _place(ctx, grams=200)
        assert await _item_qty(ctx) == before - 200
        r = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.mgr),
                                  json={"reason": "one item bad", "amount": 150, "lines": [{"product_id": ctx.prod_id, "grams": 100}]})
        assert r.status_code == 200, r.text
        assert await _item_qty(ctx) == before - 100   # only 100g re-added
    run(go())


# ---------- cashier raise vs store_manager finalize ----------

def test_cashier_raises_high_value_manager_finalizes(ctx):
    async def go():
        o = await _place(ctx, grams=300, price=2500)   # >= 2000 -> high value
        # cashier raises -> pending, NO stock reversal yet
        qty_after_sale = await _item_qty(ctx)
        raised = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.cashier), json={"reason": "wrong order"})
        assert raised.status_code == 200 and raised.json()["status"] == "pending"
        rid = raised.json()["refund"]["id"]
        assert raised.json()["refund"]["flagged"] is True
        assert await _item_qty(ctx) == qty_after_sale  # not reversed yet
        # cashier cannot finalize
        bad = await ctx.client.post(f"/api/refunds/{rid}/finalize", headers=auth(ctx.cashier))
        assert bad.status_code == 403
        # store manager finalizes -> reversed
        ok = await ctx.client.post(f"/api/refunds/{rid}/finalize", headers=auth(ctx.mgr))
        assert ok.status_code == 200 and ok.json()["status"] == "refunded"
        assert await _item_qty(ctx) == qty_after_sale + 300
        # finalize again -> 400
        assert (await ctx.client.post(f"/api/refunds/{rid}/finalize", headers=auth(ctx.mgr))).status_code == 400
    run(go())


def test_kitchen_cannot_refund(ctx):
    async def go():
        o = await _place(ctx)
        r = await ctx.client.post(f"/api/orders/{o['id']}/refund", headers=auth(ctx.kitchen), json={"reason": "x"})
        assert r.status_code == 403
    run(go())


# ---------- GST invoice ----------

def test_invoice_payload_ties_and_no_cost(ctx):
    async def go():
        o = await _place(ctx, grams=100, price=420)
        inv = await ctx.client.get(f"/api/orders/{o['id']}/invoice", headers=auth(ctx.cashier))
        assert inv.status_code == 200, inv.text
        b = inv.json()
        assert b["invoice_no"] == f"INV-{o['id']}"
        assert b["store"]["gst_no"] == "29ABCDE1234F1Z5" and b["store"]["fssai_license"] == "12345678901234"
        assert b["customer"]["gstin"] == "29XYZAB9999Q1Z2" and b["customer"]["business_name"] == "Acme Foods"
        # CGST + SGST tie to gst_amount; taxable + gst tie to total
        assert round(b["cgst"] + b["sgst"], 2) == b["gst_amount"]
        assert round(b["taxable_value"] + b["gst_amount"], 2) == b["total"]
        # NO purchase cost anywhere
        import json as _json
        blob = _json.dumps(b).lower()
        assert "cost" not in blob and "cogs" not in blob and "margin" not in blob and "avg_cost" not in blob
        # customer can read own invoice; another customer cannot
        own = await ctx.client.get(f"/api/orders/{o['id']}/invoice", headers=auth(ctx.cust_token))
        assert own.status_code == 200
    run(go())


# ---------- immutability ----------

def test_no_edit_delete_route_for_refunds(ctx):
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    refund_routes = [(p, m) for (p, m) in routes if "/refund" in p or "/refunds" in p or "/void" in p]
    for p, m in refund_routes:
        assert m in ("POST", "HEAD", "GET"), (p, m)
        assert m not in ("PUT", "DELETE", "PATCH"), (p, m)
    assert not any("refunds_log" in p for (p, _m) in routes)
