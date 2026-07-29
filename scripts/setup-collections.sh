#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
PB_URL="${PB_URL:-http://localhost:8090}"

# Read from .env if exists
ENV_FILE="${ENV_FILE:-.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

ADMIN_EMAIL="${POCKETBASE_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${POCKETBASE_ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set."
  echo "Either pass ENV_FILE=path or export them before running."
  exit 1
fi

echo "Authenticating as $ADMIN_EMAIL..."

TOKEN=$(curl -sf -X POST "$PB_URL/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

echo "Admin token acquired."

# Delegate all JSON handling to Python for reliability
export PB_URL TOKEN

python3 - "$PB_URL" "$TOKEN" << 'PYEOF'
import sys
import json
import os
import requests

PB_URL = sys.argv[1]
TOKEN = sys.argv[2]
headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def api_post(endpoint, data):
    r = requests.post(f"{PB_URL}{endpoint}", headers=headers, json=data)
    return r.json()

def api_patch(endpoint, data):
    r = requests.patch(f"{PB_URL}{endpoint}", headers=headers, json=data)
    return r.json()

def api_delete(endpoint):
    r = requests.delete(f"{PB_URL}{endpoint}", headers=headers)
    return r.status_code < 300

def get_existing():
    r = requests.get(f"{PB_URL}/api/collections", headers=headers, params={"perPage": 100})
    return {c["name"]: c["id"] for c in r.json().get("items", [])}

existing = get_existing()
print(f"Existing collections: {list(existing.keys())}")

# Track created collection IDs
ids = {}

def create_or_get(name, schema, indexes=None):
    if name in existing:
        ids[name] = existing[name]
        print(f"  {name}: EXISTS ({existing[name]})")
        return
    data = {
        "name": name,
        "type": "base",
        "listRule": "",
        "viewRule": "",
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
        "schema": schema,
        "indexes": indexes or [],
    }
    result = api_post("/api/collections", data)
    if "id" in result:
        ids[name] = result["id"]
        print(f"  {name}: CREATED ({result['id']})")
    else:
        print(f"  {name}: FAILED - {result.get('message', result)}")
        print(f"    Full error: {json.dumps(result.get('data', {}))}")

def patch_rules(name, list_rule=None, view_rule=None, create_rule=None, update_rule=None, delete_rule=None):
    cid = ids.get(name)
    if not cid:
        print(f"  SKIP rules for {name} (not created)")
        return
    # First get existing collection to preserve schema
    r = requests.get(f"{PB_URL}/api/collections/{cid}", headers=headers)
    col = r.json()
    patch = {"schema": col.get("schema", [])}
    if list_rule is not None: patch["listRule"] = list_rule
    if view_rule is not None: patch["viewRule"] = view_rule
    if create_rule is not None: patch["createRule"] = create_rule
    if update_rule is not None: patch["updateRule"] = update_rule
    if delete_rule is not None: patch["deleteRule"] = delete_rule
    result = api_patch(f"/api/collections/{cid}", patch)
    if "id" in result:
        print(f"  {name}: RULES UPDATED")
    else:
        print(f"  {name}: RULES FAILED - {result.get('message', result)}")

def patch_schema(name, new_fields):
    """Add new fields to existing collection schema"""
    if name == "_pb_users_auth_":
        cid = name
    else:
        cid = ids.get(name)
    if not cid:
        print(f"  SKIP schema for {name} (not created)")
        return
    r = requests.get(f"{PB_URL}/api/collections/{cid}", headers=headers)
    col = r.json()
    existing_fields = col.get("schema", [])
    existing_names = {f["name"] for f in existing_fields}
    for field in new_fields:
        if field["name"] not in existing_names:
            existing_fields.append(field)
    result = api_patch(f"/api/collections/{cid}", {"schema": existing_fields})
    if "id" in result:
        added = [f["name"] for f in new_fields if f["name"] not in existing_names]
        if added:
            print(f"  {name}: ADDED FIELDS {added}")
        else:
            print(f"  {name}: schema unchanged")
    else:
        print(f"  {name}: SCHEMA FAILED - {result.get('message', result)}")

# ============================================
# Phase 1: Create all collections (null rules)
# ============================================
print("\n=== Phase 1: Create collections ===")

create_or_get("convoys", [
    {"name": "name", "type": "text", "required": True, "options": {"min": 2, "max": 100}},
    {"name": "code", "type": "text", "required": True, "options": {"min": 6, "max": 6}},
    {"name": "description", "type": "text", "required": False},
    {"name": "owner", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
    {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "archived"], "maxSelect": 1}},
    {"name": "convoy_type", "type": "select", "required": True, "options": {"values": ["vehicle", "trekker"], "maxSelect": 1}},
    {"name": "max_members", "type": "number", "required": False},
    {"name": "settings", "type": "json", "required": False, "options": {"maxSize": 2000000}},
    {"name": "trip_id", "type": "text", "required": False},
    {"name": "security_token", "type": "text", "required": False},
    {"name": "source_lat", "type": "number", "required": False},
    {"name": "source_lng", "type": "number", "required": False},
    {"name": "source_name", "type": "text", "required": False},
    {"name": "dest_lat", "type": "number", "required": False},
    {"name": "dest_lng", "type": "number", "required": False},
    {"name": "dest_name", "type": "text", "required": False},
    {"name": "phase", "type": "select", "required": True, "options": {"values": ["forming", "assembling", "in_transit", "completed"], "maxSelect": 1}},
    {"name": "assembled_members", "type": "json", "required": False, "options": {"maxSize": 2000000}},
], [
    "CREATE UNIQUE INDEX idx_convoys_code ON convoys (code)",
    "CREATE INDEX idx_convoys_owner ON convoys (owner)",
])

create_or_get("vehicles", [
    {"name": "owner", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
    {"name": "name", "type": "text", "required": True, "options": {"min": 1, "max": 50}},
    {"name": "type", "type": "select", "required": True, "options": {"values": ["car", "truck", "motorcycle", "other", "trekker"], "maxSelect": 1}},
    {"name": "color", "type": "text", "required": False},
    {"name": "license_plate", "type": "text", "required": False},
    {"name": "image", "type": "file", "required": False, "options": {"maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/jpeg", "image/png", "image/webp"]}},
    {"name": "telemetry_config", "type": "json", "required": False, "options": {"maxSize": 2000000}},
    {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "inactive", "maintenance", "retired"], "maxSelect": 1}},
], [
    "CREATE INDEX idx_vehicles_owner ON vehicles (owner)",
])

create_or_get("convoy_members", [
    {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": ids.get("convoys", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "user", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
    {"name": "role", "type": "select", "required": True, "options": {"values": ["owner", "admin", "member"], "maxSelect": 1}},
    {"name": "vehicle", "type": "relation", "required": False, "options": {"collectionId": ids.get("vehicles", "_"), "cascadeDelete": False, "maxSelect": 1}},
    {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "kicked", "left"], "maxSelect": 1}},
    {"name": "joined_at", "type": "date", "required": False},
], [
    "CREATE INDEX idx_convoy_members_convoy ON convoy_members (convoy)",
    "CREATE INDEX idx_convoy_members_user ON convoy_members (user)",
])

create_or_get("positions", [
    {"name": "vehicle", "type": "relation", "required": True, "options": {"collectionId": ids.get("vehicles", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": ids.get("convoys", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "lat", "type": "number", "required": True},
    {"name": "lng", "type": "number", "required": True},
    {"name": "speed", "type": "number", "required": False},
    {"name": "heading", "type": "number", "required": False},
    {"name": "accuracy", "type": "number", "required": False},
], [
    "CREATE UNIQUE INDEX idx_positions_vehicle_convoy ON positions (vehicle, convoy)",
    "CREATE INDEX idx_positions_convoy ON positions (convoy)",
])

create_or_get("messages", [
    {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": ids.get("convoys", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "sender", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
    {"name": "type", "type": "select", "required": True, "options": {"values": ["text", "voice", "system"], "maxSelect": 1}},
    {"name": "content", "type": "text", "required": True},
    {"name": "duration", "type": "number", "required": False},
    {"name": "location_lat", "type": "number", "required": False},
    {"name": "location_lng", "type": "number", "required": False},
], [
    "CREATE INDEX idx_messages_convoy ON messages (convoy)",
    "CREATE INDEX idx_messages_sender ON messages (sender)",
])

create_or_get("cached_routes", [
    {"name": "origin_lat", "type": "number", "required": True},
    {"name": "origin_lng", "type": "number", "required": True},
    {"name": "dest_lat", "type": "number", "required": True},
    {"name": "dest_lng", "type": "number", "required": True},
    {"name": "distance", "type": "number", "required": True},
    {"name": "duration", "type": "number", "required": True},
    {"name": "geometry", "type": "text", "required": True},
    {"name": "alternatives_json", "type": "text", "required": False},
], [
    "CREATE UNIQUE INDEX idx_routes_coords ON cached_routes (origin_lat, origin_lng, dest_lat, dest_lng)",
])

create_or_get("telemetry_aggregated", [
    {"name": "vehicle", "type": "relation", "required": True, "options": {"collectionId": ids.get("vehicles", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "hour_bucket", "type": "text", "required": True},
    {"name": "start_lat", "type": "number", "required": True},
    {"name": "start_lng", "type": "number", "required": True},
    {"name": "end_lat", "type": "number", "required": True},
    {"name": "end_lng", "type": "number", "required": True},
    {"name": "avg_speed", "type": "number", "required": False},
    {"name": "max_speed", "type": "number", "required": False},
    {"name": "distance_traveled", "type": "number", "required": False},
    {"name": "point_count", "type": "number", "required": False},
    {"name": "route_polyline", "type": "text", "required": False},
], [
    "CREATE UNIQUE INDEX idx_telemetry_vehicle_hour ON telemetry_aggregated (vehicle, hour_bucket)",
    "CREATE INDEX idx_telemetry_hour ON telemetry_aggregated (hour_bucket)",
])

create_or_get("geofences", [
    {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": ids.get("convoys", "_"), "cascadeDelete": True, "maxSelect": 1}},
    {"name": "name", "type": "text", "required": True},
    {"name": "type", "type": "select", "required": True, "options": {"values": ["circle", "polygon"], "maxSelect": 1}},
    {"name": "center_lat", "type": "number", "required": False},
    {"name": "center_lng", "type": "number", "required": False},
    {"name": "radius_m", "type": "number", "required": False},
    {"name": "polygon_coords", "type": "json", "required": False, "options": {"maxSize": 2000000}},
    {"name": "alert_on", "type": "select", "required": True, "options": {"values": ["enter", "exit", "both"], "maxSelect": 1}},
    {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "inactive"], "maxSelect": 1}},
], [
    "CREATE INDEX idx_geofences_convoy ON geofences (convoy)",
])

create_or_get("audit_log", [
    {"name": "user", "type": "relation", "required": False, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": False, "maxSelect": 1}},
    {"name": "action", "type": "text", "required": True},
    {"name": "resource_type", "type": "text", "required": True},
    {"name": "resource_id", "type": "text", "required": False},
    {"name": "metadata", "type": "json", "required": False, "options": {"maxSize": 2000000}},
], [
    "CREATE INDEX idx_audit_user ON audit_log (user)",
    "CREATE INDEX idx_audit_action ON audit_log (action)",
])

# ============================================
# Phase 2: Set rules (after schema exists)
# ============================================
print("\n=== Phase 2: Set access rules ===")

patch_rules("convoys",
    list_rule="",
    view_rule="",
    create_rule="@request.auth.id != ''",
    update_rule="@request.auth.id = owner",
    delete_rule="@request.auth.id = owner",
)

patch_rules("vehicles",
    list_rule="",
    view_rule="",
    create_rule="",
    update_rule="@request.auth.id = owner",
    delete_rule="@request.auth.id = owner",
)

patch_rules("convoy_members",
    list_rule="",
    view_rule="",
    create_rule="@request.auth.id != ''",
    update_rule="",
    delete_rule="",
)

patch_rules("positions",
    list_rule="",
    view_rule="",
    create_rule="",
    update_rule="",
    delete_rule="",
)

patch_rules("messages",
    list_rule="",
    view_rule="",
    create_rule="@request.auth.id != ''",
    update_rule="@request.auth.id = sender",
    delete_rule="@request.auth.id = sender",
)

patch_rules("cached_routes",
    list_rule=None,
    view_rule=None,
    create_rule=None,
    update_rule=None,
    delete_rule=None,
)

patch_rules("telemetry_aggregated",
    list_rule=None,
    view_rule=None,
    create_rule=None,
    update_rule=None,
    delete_rule=None,
)

patch_rules("geofences",
    list_rule="",
    view_rule="",
    create_rule="@request.auth.id != ''",
    update_rule="@request.auth.id != ''",
    delete_rule="@request.auth.id != ''",
)

patch_rules("audit_log",
    list_rule=None,
    view_rule=None,
    create_rule=None,
    update_rule=None,
    delete_rule=None,
)

# Users collection needs open list/view rules for expand=user to work
# (convoy_members expand needs to resolve other users' names)
patch_rules("_pb_users_auth_",
    list_rule="",
    view_rule="",
    create_rule=None,
    update_rule=None,
    delete_rule=None,
)

# ============================================
# Phase 3: Add role + status to users auth
# ============================================
print("\n=== Phase 3: Update users auth collection ===")

patch_schema("_pb_users_auth_", [
    {"name": "name", "type": "text", "required": False, "options": {"max": 100}},
    {"name": "avatar", "type": "file", "required": False, "options": {"maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/jpeg", "image/png", "image/webp"]}},
    {"name": "phone", "type": "text", "required": False},
    {"name": "role", "type": "select", "required": False, "options": {"values": ["admin", "member"], "maxSelect": 1}},
    {"name": "status", "type": "select", "required": False, "options": {"values": ["active", "inactive", "banned"], "maxSelect": 1}},
])

# ============================================
# Add unique index on convoy_members (convoy, user)
# ============================================
print("\n=== Phase 4: Add unique constraint ===")
cid = ids.get("convoy_members")
if cid:
    r = requests.get(f"{PB_URL}/api/collections/{cid}", headers=headers)
    col = r.json()
    indexes = col.get("indexes", [])
    has_unique = any("idx_convoy_members_unique" in i for i in indexes)
    if not has_unique:
        indexes.append("CREATE UNIQUE INDEX idx_convoy_members_unique ON convoy_members (convoy, user)")
        result = api_patch(f"/api/collections/{cid}", {"indexes": indexes})
        if "id" in result:
            print("  convoy_members: UNIQUE INDEX ADDED")
        else:
            print(f"  convoy_members: UNIQUE INDEX FAILED - {result.get('message', result)}")
    else:
        print("  convoy_members: UNIQUE INDEX EXISTS")

# ============================================
# Phase 5: Add convoy lifecycle fields
# ============================================
print("\n=== Phase 5: Add convoy lifecycle fields ===")

patch_schema("convoys", [
    {"name": "phase", "type": "select", "required": True, "options": {"values": ["forming", "assembling", "in_transit", "completed"], "maxSelect": 1}},
    {"name": "assembled_members", "type": "json", "required": False, "options": {"maxSize": 2000000}},
])

# ============================================
# Summary
# ============================================
print("\n==========================================")
print("  All collections configured!")
print("==========================================")
for name, cid in ids.items():
    print(f"  {name:24s} {cid}")
print("  users                  (auth collection + role/status fields)")
print("==========================================")
PYEOF

echo ""
echo "Setup complete."
