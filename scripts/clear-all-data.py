#!/usr/bin/env python3
"""
Clear all convoy-related data from PocketBase.
Run against local (localhost:8090) or production by setting PB_URL.

Usage:
  python3 scripts/clear-all-data.py                          # local
  PB_URL=http://192.168.200.11:8090 python3 scripts/clear-all-data.py   # production
"""
import os, sys, json, requests
from dotenv import load_dotenv

load_dotenv()

PB_URL = os.environ.get("PB_URL", "http://localhost:8090")
ADMIN_EMAIL = os.environ.get("POCKETBASE_ADMIN_EMAIL", "admin@vellur.in")
ADMIN_PASSWORD = os.environ.get("POCKETBASE_ADMIN_PASSWORD", "")

if not ADMIN_PASSWORD:
    print("ERROR: POCKETBASE_ADMIN_PASSWORD must be set.")
    sys.exit(1)

print(f"Authenticating to {PB_URL}...")
resp = requests.post(f"{PB_URL}/api/admins/auth-with-password", json={
    "identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
})
if resp.status_code != 200:
    print(f"Auth failed: {resp.json()}")
    sys.exit(1)

TOKEN = resp.json()["token"]
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Collections to clear (order matters due to relations)
COLLECTIONS = [
    "positions",
    "messages",
    "telemetry_aggregated",
    "geofences",
    "audit_log",
    "cached_routes",
    "convoy_members",
    "convoys",
]

print("\nFetching collection list...")
r = requests.get(f"{PB_URL}/api/collections", headers=HEADERS, params={"perPage": 100})
collections = {c["name"]: c["id"] for c in r.json().get("items", [])}

for name in COLLECTIONS:
    cid = collections.get(name)
    if not cid:
        print(f"  {name}: NOT FOUND, skipping")
        continue

    print(f"\n  {name}: deleting all records...")
    page = 1
    total = 0
    while True:
        r = requests.get(
            f"{PB_URL}/api/collections/{cid}/records",
            headers=HEADERS,
            params={"perPage": 100, "page": page, "sort": "-created"},
        )
        items = r.json().get("items", [])
        if not items:
            break
        for item in items:
            requests.delete(
                f"{PB_URL}/api/collections/{cid}/records/{item['id']}",
                headers=HEADERS,
            )
            total += 1
        page += 1

    print(f"    Deleted {total} records")

print("\n=== All collections cleared! ===")
print("\nNow run setup-collections.py to update schema:")
print(f"  PB_URL={PB_URL} python3 scripts/setup-collections.py")
