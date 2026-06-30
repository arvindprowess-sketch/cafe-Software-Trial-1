#!/usr/bin/env python3
"""Emergency super-admin password reset (out-of-band, no portal).

For total-lockout recovery when even the self-service phone+email reset is
unavailable. Run directly on a host with database access.

    MONGO_URL=mongodb://... DB_NAME=boraroc \
        python scripts/reset_superadmin.py --email owner@boraroc.com

If --password is omitted you are prompted (input hidden). On success the target
super-admin's password_hash is replaced and token_version is bumped, which
revokes every outstanding session/token. Only users with role == super_admin can
be reset by this script.

Exit codes: 0 success · 1 not found · 2 bad usage/config.
"""
import argparse
import getpass
import os
import sys

import bcrypt
from pymongo import MongoClient

MIN_PASSWORD_LEN = 12


def reset_password(db, email: str, new_password: str) -> bool:
    """Set a super-admin's password_hash and bump token_version.

    Returns True if a super_admin with that email was updated, False otherwise.
    Kept dependency-light so it can be unit-exercised with any pymongo-compatible
    database handle.
    """
    email = (email or "").strip().lower()
    user = db.users.find_one({"email": email, "role": "super_admin"})
    if not user:
        return False
    password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": password_hash}, "$inc": {"token_version": 1}},
    )
    return True


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Emergency reset of a super-admin password (out-of-band, no portal).")
    parser.add_argument("--email", required=True, help="super-admin company email")
    parser.add_argument("--password", help=f"new password (>= {MIN_PASSWORD_LEN} chars); prompted if omitted")
    args = parser.parse_args(argv)

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("ERROR: set MONGO_URL and DB_NAME environment variables", file=sys.stderr)
        return 2

    new_password = args.password or getpass.getpass(f"New super-admin password (>= {MIN_PASSWORD_LEN} chars): ")
    if not new_password or len(new_password) < MIN_PASSWORD_LEN:
        print(f"ERROR: password must be at least {MIN_PASSWORD_LEN} characters", file=sys.stderr)
        return 2

    client = MongoClient(mongo_url)
    try:
        db = client[db_name]
        if not reset_password(db, args.email, new_password):
            print(f"FAILURE: no super_admin found with email {args.email!r}", file=sys.stderr)
            return 1
        print(f"SUCCESS: password reset for super_admin {args.email}. "
              f"All existing sessions have been revoked.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
