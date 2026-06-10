"""PR-3 — atomic stock decrement + negative-stock flagging + startup indexes.

In-process (mongomock_motor), no live server.

Run:  pytest backend/tests/test_pr3_negstock_indexes.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pr3_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def db():
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]
    return server.db


async def _mk_item(store_id, item_id, qty, cost=2.0):
    await server.db.inventory_items.insert_one({
        "id": item_id, "store_id": store_id, "product_id": None,
        "name": item_id, "unit": "g", "qty_on_hand": qty, "avg_cost": cost,
    })
    return await server.db.inventory_items.find_one({"id": item_id, "store_id": store_id}, {"_id": 0})


# ── item 6: atomic decrement + flagging ──────────────────────────────────────

def test_decrement_deducts_correctly(db):
    async def go():
        item = await _mk_item("S1", "rice1", 1000)
        await server._apply_stock_deltas(
            [{"item": item, "grams": 300, "unit_cost": 2.0}],
            "S1", "sale", "sale:o1", "u1", "o1")
        row = await server.db.inventory_items.find_one({"id": "rice1"}, {"_id": 0})
        assert row["qty_on_hand"] == 700
        mv = await server.db.movement_log.find_one({"ref_id": "o1"}, {"_id": 0})
        assert mv["qty_delta"] == -300
        assert mv["qty_after"] == 700
        assert mv["flagged_for_review"] is False
    run(go())


def test_oversell_flags_movement(db):
    async def go():
        item = await _mk_item("S1", "oil1", 100)
        await server._apply_stock_deltas(
            [{"item": item, "grams": 250, "unit_cost": 5.0}],
            "S1", "sale", "sale:o2", "u1", "o2")
        row = await server.db.inventory_items.find_one({"id": "oil1"}, {"_id": 0})
        assert row["qty_on_hand"] == -150  # went negative
        mv = await server.db.movement_log.find_one({"ref_id": "o2"}, {"_id": 0})
        assert mv["qty_after"] == -150
        assert mv["flagged_for_review"] is True  # flagged for review
    run(go())


def test_atomic_inc_no_lost_update(db):
    async def go():
        # Two sequential deltas on the same stale 'item' snapshot must both apply
        # (atomic $inc), not clobber each other as read-then-set would.
        item = await _mk_item("S1", "salt1", 500)
        await server._apply_stock_deltas([{"item": item, "grams": 100, "unit_cost": 1.0}], "S1", "sale", "r", "u", "a")
        # reuse the SAME stale snapshot (qty_on_hand still 500 in `item`)
        await server._apply_stock_deltas([{"item": item, "grams": 100, "unit_cost": 1.0}], "S1", "sale", "r", "u", "b")
        row = await server.db.inventory_items.find_one({"id": "salt1"}, {"_id": 0})
        assert row["qty_on_hand"] == 300  # 500 - 100 - 100, not 400
    run(go())


# ── item 5: startup indexes ──────────────────────────────────────────────────

def test_startup_runs_and_creates_indexes():
    async def go():
        # Fresh client so the assertion is deterministic regardless of test order.
        server.client = AsyncMongoMockClient()
        server.db = server.client["pr3_startup_test"]
        await server.on_startup()  # must not raise
        for coll in ("orders", "discards", "transfers", "refunds", "business_days", "audit_log"):
            idx = await server.db[coll].index_information()
            keys = [tuple(v["key"]) for v in idx.values()]
            assert (("store_id", 1), ("created_at", -1)) in keys, f"{coll} missing (store_id, created_at) index"
    run(go())
