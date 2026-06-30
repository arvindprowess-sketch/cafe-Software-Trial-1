"""Auth V2 test helpers (in-process mongomock suites).

Auth V2 retired the fixed admin@dietcafe.com/admin123 credentials: the bootstrap
super-admin now gets a RANDOM one-time password. These suites only need an HQ
token, so we mint one for the seeded super-admin the same way they already mint
staff tokens via server.create_token() — no password round-trip required.
"""
import server


async def hq_token():
    """Return a freshly-minted super-admin token for the seeded bootstrap HQ user.

    Call AFTER POST /api/seed (which creates the bootstrap super-admin).
    """
    sa = await server.db.users.find_one({"role": "super_admin"}, {"_id": 0})
    assert sa, "no super_admin found — call POST /api/seed before hq_token()"
    return server.create_token(sa["id"], "super_admin", sa.get("token_version", 0))
