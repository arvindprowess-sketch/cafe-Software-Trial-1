"""Phase 1A — central catalog + per-store override + HQ push + version log.

In-process tests (mongomock, no live server). Reuse the Phase 0 isolation
harness style.

Run:  pytest backend/tests/test_phase1a_catalog_override.py
"""
import os
import asyncio

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "phase1a_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


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
        c.hq_token = await hq_token()

        # Three stores
        async def mk_store(name, code):
            return (await client.post("/api/stores", json={"name": name, "code": code},
                                      headers=auth(c.hq_token))).json()["store_id"]
        c.store_a = await mk_store("Store A", "AAA")
        c.store_b = await mk_store("Store B", "BBB")
        c.store_c = await mk_store("Store C", "CCC")

        async def mk_staff(role, store_id=None, cluster=None, pin="0000"):
            body = {"name": role, "role": role, "login_code": f"CODE-{pin}", "password": "password123"}
            if store_id:
                body["store_id"] = store_id
            if cluster:
                body["cluster_store_ids"] = cluster
            r = await client.post("/api/staff", json=body, headers=auth(c.hq_token))
            assert r.status_code == 200, r.text
            return server.create_token(r.json()["id"], role)

        c.manager_a = await mk_staff("store_manager", store_id=c.store_a, pin="1111")
        c.cashier_a = await mk_staff("cashier", store_id=c.store_a, pin="2222")
        c.kitchen_a = await mk_staff("kitchen", store_id=c.store_a, pin="3333")
        # Area manager over cluster {A, B} (NOT C)
        c.area_ab = await mk_staff("area_manager", cluster=[c.store_a, c.store_b], pin="4444")

        products = (await client.get("/api/products")).json()
        c.product = products[0]
        c.product2 = products[1]
        c.base_price = server._product_base_price(c.product)
        return c

    c = run(build())
    yield c
    run(client.aclose())


# ---------- role scoping on override write (#1 leak point) ----------

def test_area_manager_override_outside_cluster_403(ctx):
    async def go():
        # area manager AB cannot override store C
        r = await ctx.client.put(
            f"/api/stores/{ctx.store_c}/products/{ctx.product['id']}/override",
            json={"selling_price": 99}, headers=auth(ctx.area_ab))
        assert r.status_code == 403, r.text
        # ...but CAN override store A (in cluster)
        r2 = await ctx.client.put(
            f"/api/stores/{ctx.store_a}/products/{ctx.product['id']}/override",
            json={"selling_price": 88}, headers=auth(ctx.area_ab))
        assert r2.status_code == 200, r2.text
    run(go())


def test_store_manager_override_other_store_403(ctx):
    async def go():
        r = await ctx.client.put(
            f"/api/stores/{ctx.store_b}/products/{ctx.product['id']}/override",
            json={"selling_price": 50}, headers=auth(ctx.manager_a))
        assert r.status_code == 403
        # own store ok
        r2 = await ctx.client.put(
            f"/api/stores/{ctx.store_a}/products/{ctx.product['id']}/override",
            json={"available": True}, headers=auth(ctx.manager_a))
        assert r2.status_code == 200, r2.text
    run(go())


def test_cashier_and_kitchen_override_403(ctx):
    async def go():
        for tok in (ctx.cashier_a, ctx.kitchen_a):
            r = await ctx.client.put(
                f"/api/stores/{ctx.store_a}/products/{ctx.product['id']}/override",
                json={"selling_price": 10}, headers=auth(tok))
            assert r.status_code == 403, r.text
    run(go())


# ---------- resolved menu reflects overrides ----------

def test_resolved_menu_price_and_availability(ctx):
    async def go():
        # Override store A: product -> price 77, product2 -> unavailable
        await ctx.client.put(
            f"/api/stores/{ctx.store_a}/products/{ctx.product['id']}/override",
            json={"selling_price": 77}, headers=auth(ctx.hq_token))
        await ctx.client.put(
            f"/api/stores/{ctx.store_a}/products/{ctx.product2['id']}/override",
            json={"available": False}, headers=auth(ctx.hq_token))

        menu_a = (await ctx.client.get(f"/api/stores/{ctx.store_a}/menu")).json()
        by_id = {m["id"]: m for m in menu_a}
        assert by_id[ctx.product["id"]]["selling_price"] == 77
        assert ctx.product2["id"] not in by_id  # hidden (unavailable)

        # Store C has no overrides -> base price, all available
        menu_c = (await ctx.client.get(f"/api/stores/{ctx.store_c}/menu")).json()
        by_id_c = {m["id"]: m for m in menu_c}
        assert by_id_c[ctx.product["id"]]["selling_price"] == ctx.base_price
        assert ctx.product2["id"] in by_id_c
    run(go())


def test_global_menu_unchanged_without_store_id(ctx):
    async def go():
        # Existing customer-app path: GET /products with NO store_id still works
        r = await ctx.client.get("/api/products")
        assert r.status_code == 200
        items = r.json()
        assert len(items) > 0
        # Global items don't carry per-store resolution fields
        assert all("selling_price" not in i for i in items)
    run(go())


# ---------- HQ push: all vs selected + append-only log ----------

def test_push_all_writes_every_store_and_one_log_entry(ctx):
    async def go():
        before = len((await ctx.client.get("/api/catalog/push-log", headers=auth(ctx.hq_token))).json())
        r = await ctx.client.post("/api/catalog/push", json={
            "product_ids": [ctx.product["id"]],
            "fields": ["price"],
            "target": "all",
            "selling_price": 123,
        }, headers=auth(ctx.hq_token))
        assert r.status_code == 200, r.text

        # Every store now has the override at 123
        for sid in (ctx.store_a, ctx.store_b, ctx.store_c):
            ov = await server.db.product_overrides.find_one(
                {"store_id": sid, "product_id": ctx.product["id"]}, {"_id": 0})
            assert ov and ov["selling_price"] == 123, sid

        # Exactly one new log entry
        after = (await ctx.client.get("/api/catalog/push-log", headers=auth(ctx.hq_token))).json()
        assert len(after) == before + 1
        assert after[0]["target"] == "all"
    run(go())


def test_push_selected_only_those_stores(ctx):
    async def go():
        r = await ctx.client.post("/api/catalog/push", json={
            "product_ids": [ctx.product2["id"]],
            "fields": ["availability"],
            "target": [ctx.store_b],
            "available": False,
        }, headers=auth(ctx.hq_token))
        assert r.status_code == 200, r.text
        ov_b = await server.db.product_overrides.find_one(
            {"store_id": ctx.store_b, "product_id": ctx.product2["id"]}, {"_id": 0})
        assert ov_b and ov_b["available"] is False
        # Store C must NOT have received this push
        ov_c = await server.db.product_overrides.find_one(
            {"store_id": ctx.store_c, "product_id": ctx.product2["id"]}, {"_id": 0})
        assert ov_c is None
    run(go())


def test_push_is_hq_only(ctx):
    async def go():
        for tok in (ctx.manager_a, ctx.area_ab, ctx.cashier_a):
            r = await ctx.client.post("/api/catalog/push", json={
                "product_ids": [ctx.product["id"]], "fields": ["price"],
                "target": "all", "selling_price": 5,
            }, headers=auth(tok))
            assert r.status_code == 403, r.text
    run(go())


def test_catalog_push_log_is_append_only(ctx):
    """No edit/delete route exists for catalog_push_log."""
    routes = [(getattr(r, "path", ""), m)
              for r in server.app.other_asgi_app.routes  # type: ignore[attr-defined]
              for m in getattr(r, "methods", []) or []]
    push_log_routes = [(p, m) for (p, m) in routes if "push-log" in p or "push_log" in p]
    # Only a GET reader may exist; never PUT/PATCH/DELETE/POST on the log itself.
    assert all(m in ("GET", "HEAD") for (_p, m) in push_log_routes), push_log_routes
    assert not any("catalog_push_log" in p for (p, _m) in routes)
