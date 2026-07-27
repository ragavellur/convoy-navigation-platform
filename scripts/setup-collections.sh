#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
PB_URL="${PB_URL:-http://localhost:8090}"

# Read from .env if exists
ENV_FILE="${ENV_FILE:-.env}"
if [[ -f "$ENV_FILE" ]]; then
  source <(grep -v '^#' "$ENV_FILE" | sed 's/^/export /')
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

# ─── Helper functions ────────────────────────────────────────────────────────
pb_post() {
  curl -sf -X POST "$PB_URL/api/collections" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$1"
}

pb_patch() {
  local id="$1"
  local data="$2"
  curl -sf -X PATCH "$PB_URL/api/collections/$id" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$data"
}

get_id() {
  echo "$1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])"
}

create_or_skip() {
  local name="$1"
  local data="$2"
  echo -n "Creating $name... "
  RESULT=$(pb_post "$data" 2>&1) && {
    ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
    echo "OK ($ID)"
    echo "$ID"
    return 0
  } || {
    if echo "$RESULT" | grep -q "already exists"; then
      echo "SKIPPED (already exists)"
      # Try to get existing collection ID
      EXISTING=$(curl -sf -H "Authorization: Bearer $TOKEN" "$PB_URL/api/collections?filter=name='$name'" \
        | python3 -c "import sys, json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')" 2>/dev/null || echo "")
      echo "$EXISTING"
      return 0
    else
      echo "FAILED: $RESULT"
      echo ""
      return 1
    fi
  }
}

# ============================================
# 1. convoys collection
# ============================================
CONVOYS_ID=$(create_or_skip "convoys" '{
  "name": "convoys",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != \"\"",
  "updateRule": "@request.auth.id = owner",
  "deleteRule": "@request.auth.id = owner",
  "schema": [
    {"name": "name", "type": "text", "required": true, "options": {"min": 2, "max": 100}},
    {"name": "code", "type": "text", "required": true, "options": {"min": 6, "max": 6}},
    {"name": "description", "type": "text", "required": false},
    {"name": "owner", "type": "relation", "required": true, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "status", "type": "select", "required": true, "options": {"values": ["active", "archived"], "maxSelect": 1}},
    {"name": "max_members", "type": "number", "required": false, "options": {"min": 2, "max": 100}},
    {"name": "settings", "type": "json", "required": false},
    {"name": "trip_id", "type": "text", "required": false},
    {"name": "security_token", "type": "text", "required": false},
    {"name": "source_lat", "type": "number", "required": false},
    {"name": "source_lng", "type": "number", "required": false},
    {"name": "source_name", "type": "text", "required": false},
    {"name": "dest_lat", "type": "number", "required": false},
    {"name": "dest_lng", "type": "number", "required": false},
    {"name": "dest_name", "type": "text", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_convoys_code ON convoys (code)",
    "CREATE INDEX idx_convoys_owner ON convoys (owner)"
  ]
}')
echo "  convoys: $CONVOYS_ID"

# ============================================
# 2. vehicles collection
# ============================================
VEHICLES_ID=$(create_or_skip "vehicles" '{
  "name": "vehicles",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": "@request.auth.id = owner",
  "deleteRule": "@request.auth.id = owner",
  "schema": [
    {"name": "owner", "type": "relation", "required": true, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "name", "type": "text", "required": true, "options": {"min": 1, "max": 50}},
    {"name": "type", "type": "select", "required": true, "options": {"values": ["car", "truck", "motorcycle", "other"], "maxSelect": 1}},
    {"name": "color", "type": "text", "required": false},
    {"name": "license_plate", "type": "text", "required": true, "options": {"unique": true}},
    {"name": "image", "type": "file", "required": false, "options": {"maxSelect": 1, "mimeTypes": ["image/jpeg", "image/png", "image/webp"]}},
    {"name": "telemetry_config", "type": "json", "required": false},
    {"name": "status", "type": "select", "required": true, "options": {"values": ["active", "inactive", "maintenance"], "maxSelect": 1}}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_vehicles_license ON vehicles (license_plate)",
    "CREATE INDEX idx_vehicles_owner ON vehicles (owner)"
  ]
}')
echo "  vehicles: $VEHICLES_ID"

# ============================================
# 3. convoy_members collection
# ============================================
MEMBERS_ID=$(create_or_skip "convoy_members" '{
  "name": "convoy_members",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != \"\"",
  "updateRule": "",
  "deleteRule": "",
  "schema": [
    {"name": "convoy", "type": "relation", "required": true, "options": {"collectionId": "'"$CONVOYS_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "user", "type": "relation", "required": true, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "role", "type": "select", "required": true, "options": {"values": ["owner", "admin", "member"], "maxSelect": 1}},
    {"name": "vehicle", "type": "relation", "required": false, "options": {"collectionId": "'"$VEHICLES_ID"'", "cascadeDelete": false, "maxSelect": 1}},
    {"name": "status", "type": "select", "required": true, "options": {"values": ["active", "kicked", "left"], "maxSelect": 1}},
    {"name": "joined_at", "type": "date", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_convoy_members_unique ON convoy_members (convoy, user)",
    "CREATE INDEX idx_convoy_members_convoy ON convoy_members (convoy)",
    "CREATE INDEX idx_convoy_members_user ON convoy_members (user)"
  ]
}')
echo "  convoy_members: $MEMBERS_ID"

# ============================================
# 4. positions collection
# ============================================
POSITIONS_ID=$(create_or_skip "positions" '{
  "name": "positions",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": "",
  "deleteRule": "",
  "schema": [
    {"name": "vehicle", "type": "relation", "required": true, "options": {"collectionId": "'"$VEHICLES_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "convoy", "type": "relation", "required": true, "options": {"collectionId": "'"$CONVOYS_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "lat", "type": "number", "required": true},
    {"name": "lng", "type": "number", "required": true},
    {"name": "speed", "type": "number", "required": false},
    {"name": "heading", "type": "number", "required": false},
    {"name": "accuracy", "type": "number", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_positions_vehicle_convoy ON positions (vehicle, convoy)",
    "CREATE INDEX idx_positions_convoy ON positions (convoy)"
  ]
}')
echo "  positions: $POSITIONS_ID"

# ============================================
# 5. messages collection
# ============================================
MESSAGES_ID=$(create_or_skip "messages" '{
  "name": "messages",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != \"\"",
  "updateRule": "@request.auth.id = sender",
  "deleteRule": "@request.auth.id = sender",
  "schema": [
    {"name": "convoy", "type": "relation", "required": true, "options": {"collectionId": "'"$CONVOYS_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "sender", "type": "relation", "required": true, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "type", "type": "select", "required": true, "options": {"values": ["text", "voice", "system"], "maxSelect": 1}},
    {"name": "content", "type": "text", "required": true},
    {"name": "duration", "type": "number", "required": false},
    {"name": "location_lat", "type": "number", "required": false},
    {"name": "location_lng", "type": "number", "required": false}
  ],
  "indexes": [
    "CREATE INDEX idx_messages_convoy ON messages (convoy)",
    "CREATE INDEX idx_messages_sender ON messages (sender)"
  ]
}')
echo "  messages: $MESSAGES_ID"

# ============================================
# 6. cached_routes collection
# ============================================
ROUTES_ID=$(create_or_skip "cached_routes" '{
  "name": "cached_routes",
  "type": "base",
  "listRule": null,
  "viewRule": null,
  "createRule": null,
  "updateRule": null,
  "deleteRule": null,
  "schema": [
    {"name": "origin_lat", "type": "number", "required": true},
    {"name": "origin_lng", "type": "number", "required": true},
    {"name": "dest_lat", "type": "number", "required": true},
    {"name": "dest_lng", "type": "number", "required": true},
    {"name": "distance", "type": "number", "required": true},
    {"name": "duration", "type": "number", "required": true},
    {"name": "geometry", "type": "text", "required": true},
    {"name": "alternatives_json", "type": "text", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_routes_coords ON cached_routes (origin_lat, origin_lng, dest_lat, dest_lng)"
  ]
}')
echo "  cached_routes: $ROUTES_ID"

# ============================================
# 7. telemetry_aggregated collection
# ============================================
TELEM_ID=$(create_or_skip "telemetry_aggregated" '{
  "name": "telemetry_aggregated",
  "type": "base",
  "listRule": null,
  "viewRule": null,
  "createRule": null,
  "updateRule": null,
  "deleteRule": null,
  "schema": [
    {"name": "vehicle", "type": "relation", "required": true, "options": {"collectionId": "'"$VEHICLES_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "hour_bucket", "type": "text", "required": true},
    {"name": "start_lat", "type": "number", "required": true},
    {"name": "start_lng", "type": "number", "required": true},
    {"name": "end_lat", "type": "number", "required": true},
    {"name": "end_lng", "type": "number", "required": true},
    {"name": "avg_speed", "type": "number", "required": false},
    {"name": "max_speed", "type": "number", "required": false},
    {"name": "distance_traveled", "type": "number", "required": false},
    {"name": "point_count", "type": "number", "required": false},
    {"name": "route_polyline", "type": "text", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_telemetry_vehicle_hour ON telemetry_aggregated (vehicle, hour_bucket)",
    "CREATE INDEX idx_telemetry_hour ON telemetry_aggregated (hour_bucket)"
  ]
}')
echo "  telemetry_aggregated: $TELEM_ID"

# ============================================
# 8. geofences collection
# ============================================
GEOS_ID=$(create_or_skip "geofences" '{
  "name": "geofences",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != \"\"",
  "updateRule": "@request.auth.id != \"\"",
  "deleteRule": "@request.auth.id != \"\"",
  "schema": [
    {"name": "convoy", "type": "relation", "required": true, "options": {"collectionId": "'"$CONVOYS_ID"'", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "name", "type": "text", "required": true},
    {"name": "type", "type": "select", "required": true, "options": {"values": ["circle", "polygon"], "maxSelect": 1}},
    {"name": "center_lat", "type": "number", "required": false},
    {"name": "center_lng", "type": "number", "required": false},
    {"name": "radius_m", "type": "number", "required": false},
    {"name": "polygon_coords", "type": "json", "required": false},
    {"name": "alert_on", "type": "select", "required": true, "options": {"values": ["enter", "exit", "both"], "maxSelect": 1}},
    {"name": "status", "type": "select", "required": true, "options": {"values": ["active", "inactive"], "maxSelect": 1}}
  ],
  "indexes": [
    "CREATE INDEX idx_geofences_convoy ON geofences (convoy)"
  ]
}')
echo "  geofences: $GEOS_ID"

# ============================================
# 9. audit_log collection
# ============================================
AUDIT_ID=$(create_or_skip "audit_log" '{
  "name": "audit_log",
  "type": "base",
  "listRule": null,
  "viewRule": null,
  "createRule": null,
  "updateRule": null,
  "deleteRule": null,
  "schema": [
    {"name": "user", "type": "relation", "required": false, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": false, "maxSelect": 1}},
    {"name": "action", "type": "text", "required": true},
    {"name": "resource_type", "type": "text", "required": true},
    {"name": "resource_id", "type": "text", "required": false},
    {"name": "metadata", "type": "json", "required": false}
  ],
  "indexes": [
    "CREATE INDEX idx_audit_user ON audit_log (user)",
    "CREATE INDEX idx_audit_action ON audit_log (action)"
  ]
}')
echo "  audit_log: $AUDIT_ID"

# ============================================
# 10. Add role + status fields to users auth collection
# ============================================
echo ""
echo "Adding role and status fields to users collection..."
USERS_PATCH=$(curl -sf -X PATCH "$PB_URL/api/collections/_pb_users_auth_" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "schema": [
      {"name": "name", "type": "text", "required": false, "options": {"max": 100}},
      {"name": "avatar", "type": "file", "required": false, "options": {"maxSelect": 1, "mimeTypes": ["image/jpeg", "image/png", "image/webp"]}},
      {"name": "phone", "type": "text", "required": false},
      {"name": "role", "type": "select", "required": false, "options": {"values": ["admin", "member"], "maxSelect": 1}},
      {"name": "status", "type": "select", "required": false, "options": {"values": ["active", "inactive", "banned"], "maxSelect": 1}}
    ]
  }' 2>&1) || true

if echo "$USERS_PATCH" | grep -q '"id"'; then
  echo "  users collection updated OK"
else
  echo "  users collection update: $USERS_PATCH"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=========================================="
echo "  All collections configured!"
echo "=========================================="
echo "  convoys:              $CONVOYS_ID"
echo "  vehicles:             $VEHICLES_ID"
echo "  convoy_members:       $MEMBERS_ID"
echo "  positions:            $POSITIONS_ID"
echo "  messages:             $MESSAGES_ID"
echo "  cached_routes:        $ROUTES_ID"
echo "  telemetry_aggregated: $TELEM_ID"
echo "  geofences:            $GEOS_ID"
echo "  audit_log:            $AUDIT_ID"
echo "  users:                (auth collection + role/status fields)"
echo "=========================================="
