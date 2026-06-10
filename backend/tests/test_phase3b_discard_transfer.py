"""Phase 3B — discard (meal-explode + raw-direct), transfer, manual adjust.

In-process (mongomock). Reuses the 3A inventory backend.

Run:  pytest backend/tests/test_phase3b_discard_transfer.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase3b_test")
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

        async def mk_store(n, code):
            return (await client.post("/api/stores", json={"name": n, "code": code}, headers=auth(c.hq))).json()["store_id"]
        c.store_a = await mk_store("A", "AAA")
        c.store_b = await mk_store("B", "BBB")   # same cluster as A
        c.store_z = await mk_store("Z", "ZZZ")   # different cluster

        async def mk_staff(role, store_id=None, cluster=None, pin="0"):
            body = {"name": role + pin, "role": role, "pin": pin}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq))
            return r.json()["id"], server.create_token(r.json()["id"], role)

        c.mgr_a_id, c.mgr_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.kitchen_a_id, c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="2222")
        c.cashier_a_id, c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="3333")
        c.area_ab_id, c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="4444")
        c.mgr_b_id, c.mgr_b = await mk_staff("store_manager", store_id=c.store_b, pin="5555")

        await client.post("/api/admin/migrate-inventory", headers=auth(c.hq))

        # A raw item with real avg_cost (inward) so discard/adjust values are meaningful
        chick = await client.post(f"/api/inventory/{c.store_a}/items", headers=auth(c.mgr_a),
                                  json={"name": "Chicken", "unit": "g", "qty_on_hand": 0, "avg_cost": 0})
        c.chicken_id = chick.json()["id"]
        await client.post(f"/api/inventory/{c.store_a}/inward", headers=auth(c.mgr_a),
                          json={"item_id": c.chicken_id, "qty": 10000, "purchase_price": 0.5})  # ₹0.5/g

        # Build a ready_made product whose recipe points at the Chicken raw (via raw_item_id)
        import uuid as _uuid
        c.meal_id = str(_uuid.uuid4())
        await server.db.products.insert_one({
            "id": c.meal_id, "name": "Chicken Bowl", "product_type": "ready_made",
            "fixed_price": 200, "is_active": True,
            "ingredients": [{"name": "Chicken", "grams_per_serving": 100, "raw_item_id": c.chicken_id}],
        })
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def _qty(store_id, item_id):
    it = await server.db.inventory_items.find_one({"id": item_id, "store_id": store_id}, {"_id": 0})
    return float(it["qty_on_hand"])


# ---------- discard raise (no deduction) ----------

def test_kitchen_raises_meal_discard_pending_no_deduct(ctx):
    async def go():
        before = await _qty(ctx.store_a, ctx.chicken_id)
        r = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "meal", "product_id": ctx.meal_id, "qty": 3, "reason": "spoiled"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        # value = 3 bowls * 100g * ₹0.5 = ₹150
        assert d["value"] == 150
        assert await _qty(ctx.store_a, ctx.chicken_id) == before  # NOT deducted
        ctx._meal_discard = d["id"]
    run(go())


def test_raiser_cannot_self_approve(ctx):
    async def go():
        # store_manager raises, then tries to decide own -> store_manager can't decide at all (403)
        r = await ctx.client.post("/api/discards", headers=auth(ctx.mgr_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": ctx.chicken_id, "qty": 100, "reason": "spillage"})
        did = r.json()["id"]
        dec = await ctx.client.put(f"/api/discards/{did}/decide", headers=auth(ctx.mgr_a), json={"action": "approve"})
        assert dec.status_code == 403
        ctx._raw_discard = did
    run(go())


def test_area_approves_meal_discard_deducts_recipe(ctx):
    async def go():
        before = await _qty(ctx.store_a, ctx.chicken_id)
        dec = await ctx.client.put(f"/api/discards/{ctx._meal_discard}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        assert dec.status_code == 200, dec.text
        assert dec.json()["status"] == "approved"
        # 3 bowls * 100g = 300g deducted
        assert await _qty(ctx.store_a, ctx.chicken_id) == before - 300
        mv = await server.db.movement_log.find_one({"ref_id": ctx._meal_discard, "type": "discard"}, {"_id": 0})
        assert mv and mv["qty_delta"] == -300 and mv["user_id"] == ctx.area_ab_id
    run(go())


def test_raw_discard_deducts_directly(ctx):
    async def go():
        before = await _qty(ctx.store_a, ctx.chicken_id)
        dec = await ctx.client.put(f"/api/discards/{ctx._raw_discard}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        assert dec.status_code == 200, dec.text
        assert await _qty(ctx.store_a, ctx.chicken_id) == before - 100  # direct raw, not via recipe
    run(go())


def test_high_value_discard_needs_hq(ctx):
    async def go():
        # 5000g chicken * ₹0.5 = ₹2500 >= 2000 -> hq_required
        r = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": ctx.chicken_id, "qty": 5000, "reason": "expired"})
        d = r.json()
        assert d["hq_required"] is True
        did = d["id"]
        before = await _qty(ctx.store_a, ctx.chicken_id)
        # area approval -> pending_hq, NOT deducted
        a = await ctx.client.put(f"/api/discards/{did}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        assert a.status_code == 200 and a.json()["status"] == "pending_hq"
        assert await _qty(ctx.store_a, ctx.chicken_id) == before
        # HQ finalizes -> deducted
        h = await ctx.client.put(f"/api/discards/{did}/decide", headers=auth(ctx.hq), json={"action": "approve"})
        assert h.status_code == 200 and h.json()["status"] == "approved"
        assert await _qty(ctx.store_a, ctx.chicken_id) == before - 5000
    run(go())


def test_cashier_cannot_decide_discard(ctx):
    async def go():
        r = await ctx.client.post("/api/discards", headers=auth(ctx.kitchen_a), json={
            "store_id": ctx.store_a, "target_type": "raw", "item_id": ctx.chicken_id, "qty": 10, "reason": "spillage"})
        did = r.json()["id"]
        dec = await ctx.client.put(f"/api/discards/{did}/decide", headers=auth(ctx.cashier_a), json={"action": "approve"})
        assert dec.status_code == 403
    run(go())


# ---------- transfers ----------

def test_same_cluster_transfer(ctx):
    async def go():
        # ensure store B has a chicken row via migration/product; use product-linked raw
        # use a fresh raw with product_id None -> dest matched by name (created if missing)
        # source: store A chicken
        src_before = await _qty(ctx.store_a, ctx.chicken_id)
        r = await ctx.client.post("/api/transfers", headers=auth(ctx.mgr_a), json={
            "from_store_id": ctx.store_a, "to_store_id": ctx.store_b, "item_id": ctx.chicken_id, "qty": 1000})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        dec = await ctx.client.put(f"/api/transfers/{tid}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        assert dec.status_code == 200 and dec.json()["status"] == "completed", dec.text
        assert await _qty(ctx.store_a, ctx.chicken_id) == src_before - 1000
        # dest row exists with +1000 and avg_cost reweighted (was 0 -> 0.5)
        dest = await server.db.inventory_items.find_one({"store_id": ctx.store_b, "name": "Chicken"}, {"_id": 0})
        assert dest and dest["qty_on_hand"] == 1000 and dest["avg_cost"] == 0.5
        # both legs logged
        assert await server.db.movement_log.count_documents({"ref_id": tid, "type": "transfer_out"}) == 1
        assert await server.db.movement_log.count_documents({"ref_id": tid, "type": "transfer_in"}) == 1
    run(go())


def test_cross_cluster_transfer_blocks_area_allows_hq(ctx):
    async def go():
        r = await ctx.client.post("/api/transfers", headers=auth(ctx.mgr_a), json={
            "from_store_id": ctx.store_a, "to_store_id": ctx.store_z, "item_id": ctx.chicken_id, "qty": 100})
        tid = r.json()["id"]
        blocked = await ctx.client.put(f"/api/transfers/{tid}/decide", headers=auth(ctx.area_ab), json={"action": "approve"})
        assert blocked.status_code == 403  # store_z outside area's cluster
        ok = await ctx.client.put(f"/api/transfers/{tid}/decide", headers=auth(ctx.hq), json={"action": "approve"})
        assert ok.status_code == 200 and ok.json()["status"] == "completed", ok.text
    run(go())


# ---------- transfers list (read-only, UI-0) ----------

def test_list_transfers_store_manager_scoped(ctx):
    async def go():
        # fresh requested transfer touching store A
        r = await ctx.client.post("/api/transfers", headers=auth(ctx.mgr_a), json={
            "from_store_id": ctx.store_a, "to_store_id": ctx.store_b, "item_id": ctx.chicken_id, "qty": 5})
        assert r.status_code == 200, r.text
        lst = await ctx.client.get("/api/transfers", headers=auth(ctx.mgr_a))
        assert lst.status_code == 200, lst.text
        rows = lst.json()
        assert len(rows) >= 1
        for t in rows:
            assert ctx.store_a in (t["from_store_id"], t["to_store_id"])
    run(go())


def test_list_transfers_kitchen_forbidden(ctx):
    async def go():
        r = await ctx.client.get("/api/transfers", headers=auth(ctx.kitchen_a))
        assert r.status_code == 403
    run(go())


def test_list_transfers_area_out_of_cluster_store_id_forbidden(ctx):
    async def go():
        r = await ctx.client.get(f"/api/transfers?store_id={ctx.store_z}", headers=auth(ctx.area_ab))
        assert r.status_code == 403  # store_z outside area's cluster
    run(go())


def test_list_transfers_status_filter(ctx):
    async def go():
        await ctx.client.post("/api/transfers", headers=auth(ctx.mgr_a), json={
            "from_store_id": ctx.store_a, "to_store_id": ctx.store_b, "item_id": ctx.chicken_id, "qty": 7})
        r = await ctx.client.get("/api/transfers?status=requested", headers=auth(ctx.area_ab))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) >= 1
        assert all(t["status"] == "requested" for t in rows)
    run(go())


# ---------- adjust ----------

def test_adjust_requires_reason_and_value_gating(ctx):
    async def go():
        # no reason -> 400
        no_reason = await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.mgr_a),
                                         json={"item_id": ctx.chicken_id, "new_qty": 100, "reason": ""})
        assert no_reason.status_code == 400
        # small variance with reason -> applied + flagged
        cur = await _qty(ctx.store_a, ctx.chicken_id)
        small = await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.mgr_a),
                                     json={"item_id": ctx.chicken_id, "new_qty": cur - 10, "reason": "spill"})
        assert small.status_code == 200 and small.json()["flagged_for_review"] is True
        # large variance by store_manager -> 403 (needs area)
        cur2 = await _qty(ctx.store_a, ctx.chicken_id)
        big = await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.mgr_a),
                                   json={"item_id": ctx.chicken_id, "new_qty": cur2 - 8000, "reason": "audit"})
        assert big.status_code == 403
        # area_manager may apply the large adjustment
        big_ok = await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.area_ab),
                                      json={"item_id": ctx.chicken_id, "new_qty": cur2 - 8000, "reason": "audit"})
        assert big_ok.status_code == 200, big_ok.text
    run(go())


def test_cashier_cannot_adjust(ctx):
    async def go():
        r = await ctx.client.put(f"/api/inventory/{ctx.store_a}/adjust", headers=auth(ctx.cashier_a),
                                 json={"item_id": ctx.chicken_id, "new_qty": 5, "reason": "x"})
        assert r.status_code == 403
    run(go())


# ---------- immutability ----------

def test_no_edit_delete_routes_for_discards_transfers(ctx):
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    for coll in ("discards", "transfers"):
        coll_routes = [(p, m) for (p, m) in routes if f"/{coll}" in p]
        # allowed: POST /discards|/transfers, PUT .../decide, GET .../{store}
        for p, m in coll_routes:
            assert m in ("GET", "POST", "PUT", "HEAD"), (p, m)
            if m in ("PUT",):
                assert p.endswith("/decide"), (p, m)
            assert m != "DELETE", (p, m)
        assert not any(f"{coll}_log" in p for (p, _m) in routes)
