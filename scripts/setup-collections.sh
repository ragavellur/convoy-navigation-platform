#!/bin/bash
set -e

PB_URL="http://localhost:8090"
ADMIN_EMAIL="admin@convoy.local"
ADMIN_PASSWORD="admin123456"

# Get admin token
TOKEN=$(curl -s -X POST "$PB_URL/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

echo "Admin token acquired"

# Helper function
create_collection() {
  local name="$1"
  local data="$2"
  
  echo "Creating collection: $name"
  RESULT=$(curl -s -X POST "$PB_URL/api/collections" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$data")
  
  ID=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', 'ERROR: ' + json.load(sys.stdin).get('message', 'unknown')))" 2>/dev/null || echo "ERROR")
  
  if [[ "$ID" == ERROR* ]]; then
    echo "  FAILED: $RESULT"
  else
    echo "  OK: id=$ID"
  fi
  echo "$ID"
}

# ============================================
# Create convoys collection
# ============================================
CONVOYS_RESULT=$(create_collection "convoys" '{
  "name": "convoys",
  "type": "base",
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != '\'''\''",
  "updateRule": "@request.auth.id = owner",
  "deleteRule": "@request.auth.id = owner",
  "schema": [
    {"name": "name", "type": "text", "required": true, "options": {"min": 2, "max": 100}},
    {"name": "code", "type": "text", "required": true, "options": {"min": 6, "max": 6}},
    {"name": "description", "type": "text", "required": false},
    {"name": "owner", "type": "relation", "required": true, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}},
    {"name": "status", "type": "select", "required": true, "options": {"values": ["active", "archived"], "maxSelect": 1}},
    {"name": "max_members", "type": "number", "required": false, "options": {"min": 2, "max": 100}},
    {"name": "settings", "type": "json", "required": false}
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_convoys_code ON convoys (code)",
    "CREATE INDEX idx_convoys_owner ON convoys (owner)"
  ]
}')

CONVOYS_ID=$(echo "$CONVOYS_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Convoys ID: $CONVOYS_ID"

# ============================================
# Create convoy_members collection
# ============================================
MEMBERS_RESULT=$(create_collection "convoy_members" "{
  \"name\": \"convoy_members\",
  \"type\": \"base\",
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"@request.auth.id != '\\''\\'''\",
  \"updateRule\": \"@request.auth.id = user\",
  \"deleteRule\": \"@request.auth.id = user\",
  \"schema\": [
    {\"name\": \"convoy\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$CONVOYS_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"user\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"role\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"owner\", \"admin\", \"member\"], \"maxSelect\": 1}},
    {\"name\": \"status\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"active\", \"kicked\", \"left\"], \"maxSelect\": 1}}
  ],
  \"indexes\": [
    \"CREATE UNIQUE INDEX idx_convoy_members_unique ON convoy_members (convoy, user)\",
    \"CREATE INDEX idx_convoy_members_convoy ON convoy_members (convoy)\",
    \"CREATE INDEX idx_convoy_members_user ON convoy_members (user)\"
  ]
}")

MEMBERS_ID=$(echo "$MEMBERS_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Convoy Members ID: $MEMBERS_ID"

# ============================================
# Create vehicles collection
# ============================================
VEHICLES_RESULT=$(create_collection "vehicles" "{
  \"name\": \"vehicles\",
  \"type\": \"base\",
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"@request.auth.id != '\\''\\'''\",
  \"updateRule\": \"@request.auth.id = owner\",
  \"deleteRule\": \"@request.auth.id = owner\",
  \"schema\": [
    {\"name\": \"convoy\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$CONVOYS_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"owner\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"name\", \"type\": \"text\", \"required\": true, \"options\": {\"min\": 1, \"max\": 50}},
    {\"name\": \"type\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"car\", \"truck\", \"motorcycle\", \"other\"], \"maxSelect\": 1}},
    {\"name\": \"color\", \"type\": \"text\", \"required\": false},
    {\"name\": \"license_plate\", \"type\": \"text\", \"required\": false},
    {\"name\": \"image\", \"type\": \"file\", \"required\": false, \"options\": {\"maxSelect\": 1, \"mimeTypes\": [\"image/jpeg\", \"image/png\", \"image/webp\"]}},
    {\"name\": \"telemetry_config\", \"type\": \"json\", \"required\": false},
    {\"name\": \"status\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"active\", \"inactive\", \"maintenance\"], \"maxSelect\": 1}}
  ],
  \"indexes\": [
    \"CREATE INDEX idx_vehicles_convoy ON vehicles (convoy)\",
    \"CREATE INDEX idx_vehicles_owner ON vehicles (owner)\"
  ]
}")

VEHICLES_ID=$(echo "$VEHICLES_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Vehicles ID: $VEHICLES_ID"

# Update convoy_members to reference vehicles
echo "Updating convoy_members with vehicle relation..."
curl -s -X PATCH "$PB_URL/api/collections/$MEMBERS_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"schema\": [
      {\"name\": \"convoy\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$CONVOYS_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
      {\"name\": \"user\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1}},
      {\"name\": \"role\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"owner\", \"admin\", \"member\"], \"maxSelect\": 1}},
      {\"name\": \"vehicle\", \"type\": \"relation\", \"required\": false, \"options\": {\"collectionId\": \"$VEHICLES_ID\", \"cascadeDelete\": false, \"maxSelect\": 1}},
      {\"name\": \"status\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"active\", \"kicked\", \"left\"], \"maxSelect\": 1}}
    ]
  }" | python3 -c "import sys, json; d=json.load(sys.stdin); print('  Updated OK' if 'id' in d else '  FAILED: ' + str(d))"

# ============================================
# Create telemetry_aggregated collection
# ============================================
TELEM_RESULT=$(create_collection "telemetry_aggregated" "{
  \"name\": \"telemetry_aggregated\",
  \"type\": \"base\",
  \"listRule\": null,
  \"viewRule\": null,
  \"createRule\": null,
  \"updateRule\": null,
  \"deleteRule\": null,
  \"schema\": [
    {\"name\": \"vehicle\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$VEHICLES_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"hour_bucket\", \"type\": \"text\", \"required\": true},
    {\"name\": \"start_lat\", \"type\": \"number\", \"required\": true},
    {\"name\": \"start_lng\", \"type\": \"number\", \"required\": true},
    {\"name\": \"end_lat\", \"type\": \"number\", \"required\": true},
    {\"name\": \"end_lng\", \"type\": \"number\", \"required\": true},
    {\"name\": \"avg_speed\", \"type\": \"number\", \"required\": false},
    {\"name\": \"max_speed\", \"type\": \"number\", \"required\": false},
    {\"name\": \"distance_traveled\", \"type\": \"number\", \"required\": false},
    {\"name\": \"point_count\", \"type\": \"number\", \"required\": false},
    {\"name\": \"route_polyline\", \"type\": \"text\", \"required\": false}
  ],
  \"indexes\": [
    \"CREATE UNIQUE INDEX idx_telemetry_vehicle_hour ON telemetry_aggregated (vehicle, hour_bucket)\",
    \"CREATE INDEX idx_telemetry_hour ON telemetry_aggregated (hour_bucket)\"
  ]
}")

TELEM_ID=$(echo "$TELEM_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Telemetry Aggregated ID: $TELEM_ID"

# ============================================
# Create messages collection
# ============================================
MESSAGES_RESULT=$(create_collection "messages" "{
  \"name\": \"messages\",
  \"type\": \"base\",
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"@request.auth.id != '\\''\\'''\",
  \"updateRule\": \"@request.auth.id = sender\",
  \"deleteRule\": \"@request.auth.id = sender\",
  \"schema\": [
    {\"name\": \"convoy\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$CONVOYS_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"sender\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"type\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"text\", \"voice\", \"system\"], \"maxSelect\": 1}},
    {\"name\": \"content\", \"type\": \"text\", \"required\": true},
    {\"name\": \"duration\", \"type\": \"number\", \"required\": false},
    {\"name\": \"location_lat\", \"type\": \"number\", \"required\": false},
    {\"name\": \"location_lng\", \"type\": \"number\", \"required\": false}
  ],
  \"indexes\": [
    \"CREATE INDEX idx_messages_convoy ON messages (convoy)\",
    \"CREATE INDEX idx_messages_sender ON messages (sender)\"
  ]
}")

MESSAGES_ID=$(echo "$MESSAGES_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Messages ID: $MESSAGES_ID"

# ============================================
# Create geofences collection
# ============================================
GEOS_RESULT=$(create_collection "geofences" "{
  \"name\": \"geofences\",
  \"type\": \"base\",
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"@request.auth.id != '\\''\\'''\",
  \"updateRule\": \"@request.auth.id != '\\''\\'''\",
  \"deleteRule\": \"@request.auth.id != '\\''\\'''\",
  \"schema\": [
    {\"name\": \"convoy\", \"type\": \"relation\", \"required\": true, \"options\": {\"collectionId\": \"$CONVOYS_ID\", \"cascadeDelete\": true, \"maxSelect\": 1}},
    {\"name\": \"name\", \"type\": \"text\", \"required\": true},
    {\"name\": \"type\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"circle\", \"polygon\"], \"maxSelect\": 1}},
    {\"name\": \"center_lat\", \"type\": \"number\", \"required\": false},
    {\"name\": \"center_lng\", \"type\": \"number\", \"required\": false},
    {\"name\": \"radius_m\", \"type\": \"number\", \"required\": false},
    {\"name\": \"polygon_coords\", \"type\": \"json\", \"required\": false},
    {\"name\": \"alert_on\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"enter\", \"exit\", \"both\"], \"maxSelect\": 1}},
    {\"name\": \"status\", \"type\": \"select\", \"required\": true, \"options\": {\"values\": [\"active\", \"inactive\"], \"maxSelect\": 1}}
  ],
  \"indexes\": [
    \"CREATE INDEX idx_geofences_convoy ON geofences (convoy)\"
  ]
}")

GEOS_ID=$(echo "$GEOS_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Geofences ID: $GEOS_ID"

# ============================================
# Create audit_log collection
# ============================================
AUDIT_RESULT=$(create_collection "audit_log" "{
  \"name\": \"audit_log\",
  \"type\": \"base\",
  \"listRule\": null,
  \"viewRule\": null,
  \"createRule\": null,
  \"updateRule\": null,
  \"deleteRule\": null,
  \"schema\": [
    {\"name\": \"user\", \"type\": \"relation\", \"required\": false, \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": false, \"maxSelect\": 1}},
    {\"name\": \"action\", \"type\": \"text\", \"required\": true},
    {\"name\": \"resource_type\", \"type\": \"text\", \"required\": true},
    {\"name\": \"resource_id\", \"type\": \"text\", \"required\": false},
    {\"name\": \"metadata\", \"type\": \"json\", \"required\": false}
  ],
  \"indexes\": [
    \"CREATE INDEX idx_audit_user ON audit_log (user)\",
    \"CREATE INDEX idx_audit_action ON audit_log (action)\"
  ]
}")

AUDIT_ID=$(echo "$AUDIT_RESULT" | grep -v "^Creating" | grep -v "^  " | head -1)
echo "Audit Log ID: $AUDIT_ID"

echo ""
echo "=== All collections created ==="
echo "convoys: $CONVOYS_ID"
echo "convoy_members: $MEMBERS_ID"
echo "vehicles: $VEHICLES_ID"
echo "telemetry_aggregated: $TELEM_ID"
echo "messages: $MESSAGES_ID"
echo "geofences: $GEOS_ID"
echo "audit_log: $AUDIT_ID"
