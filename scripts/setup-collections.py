import requests
import json
import sys

PB_URL = "http://localhost:8090"
ADMIN_EMAIL = "admin@convoy.local"
ADMIN_PASSWORD = "admin123456"

# Get admin token
resp = requests.post(f"{PB_URL}/api/admins/auth-with-password", json={
    "identity": ADMIN_EMAIL,
    "password": ADMIN_PASSWORD
})
token = resp.json()["token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("Admin token acquired")

def create_collection(data):
    name = data["name"]
    resp = requests.post(f"{PB_URL}/api/collections", headers=headers, json=data)
    result = resp.json()
    if "id" in result:
        print(f"  Created {name}: {result['id']}")
        return result["id"]
    else:
        print(f"  FAILED {name}: {result.get('message', result)}")
        return None

# ============================================
# Create convoys collection
# ============================================
convoys_id = create_collection({
    "name": "convoys",
    "type": "base",
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id = owner",
    "deleteRule": "@request.auth.id = owner",
    "schema": [
        {"name": "name", "type": "text", "required": True, "options": {"min": 2, "max": 100}},
        {"name": "code", "type": "text", "required": True, "options": {"min": 6, "max": 6}},
        {"name": "description", "type": "text", "required": False},
        {"name": "owner", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
        {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "archived"], "maxSelect": 1}},
        {"name": "max_members", "type": "number", "required": False, "options": {"min": 2, "max": 100}},
        {"name": "settings", "type": "json", "required": False}
    ],
    "indexes": [
        "CREATE UNIQUE INDEX idx_convoys_code ON convoys (code)",
        "CREATE INDEX idx_convoys_owner ON convoys (owner)"
    ]
})

# ============================================
# Create convoy_members collection
# ============================================
members_id = create_collection({
    "name": "convoy_members",
    "type": "base",
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id = user",
    "deleteRule": "@request.auth.id = user",
    "schema": [
        {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": convoys_id, "cascadeDelete": True, "maxSelect": 1}},
        {"name": "user", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
        {"name": "role", "type": "select", "required": True, "options": {"values": ["owner", "admin", "member"], "maxSelect": 1}},
        {"name": "vehicle", "type": "relation", "required": False, "options": {"collectionId": convoys_id, "cascadeDelete": False, "maxSelect": 1}},
        {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "kicked", "left"], "maxSelect": 1}}
    ],
    "indexes": [
        "CREATE UNIQUE INDEX idx_convoy_members_unique ON convoy_members (convoy, user)",
        "CREATE INDEX idx_convoy_members_convoy ON convoy_members (convoy)",
        "CREATE INDEX idx_convoy_members_user ON convoy_members (user)"
    ]
})

# ============================================
# Create vehicles collection
# ============================================
vehicles_id = create_collection({
    "name": "vehicles",
    "type": "base",
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id = owner",
    "deleteRule": "@request.auth.id = owner",
    "schema": [
        {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": convoys_id, "cascadeDelete": True, "maxSelect": 1}},
        {"name": "owner", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
        {"name": "name", "type": "text", "required": True, "options": {"min": 1, "max": 50}},
        {"name": "type", "type": "select", "required": True, "options": {"values": ["car", "truck", "motorcycle", "other"], "maxSelect": 1}},
        {"name": "color", "type": "text", "required": False},
        {"name": "license_plate", "type": "text", "required": False},
        {"name": "image", "type": "file", "required": False, "options": {"maxSelect": 1, "mimeTypes": ["image/jpeg", "image/png", "image/webp"]}},
        {"name": "telemetry_config", "type": "json", "required": False},
        {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "inactive", "maintenance"], "maxSelect": 1}}
    ],
    "indexes": [
        "CREATE INDEX idx_vehicles_convoy ON vehicles (convoy)",
        "CREATE INDEX idx_vehicles_owner ON vehicles (owner)"
    ]
})

# Update convoy_members vehicle relation to point to vehicles
if members_id and vehicles_id:
    print("  Updating convoy_members vehicle relation...")
    resp = requests.patch(f"{PB_URL}/api/collections/{members_id}", headers=headers, json={
        "schema": [
            {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": convoys_id, "cascadeDelete": True, "maxSelect": 1}},
            {"name": "user", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
            {"name": "role", "type": "select", "required": True, "options": {"values": ["owner", "admin", "member"], "maxSelect": 1}},
            {"name": "vehicle", "type": "relation", "required": False, "options": {"collectionId": vehicles_id, "cascadeDelete": False, "maxSelect": 1}},
            {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "kicked", "left"], "maxSelect": 1}}
        ]
    })
    if "id" in resp.json():
        print("  Updated OK")
    else:
        print(f"  Update FAILED: {resp.json()}")

# ============================================
# Create telemetry_aggregated collection
# ============================================
telem_id = create_collection({
    "name": "telemetry_aggregated",
    "type": "base",
    "listRule": None,
    "viewRule": None,
    "createRule": None,
    "updateRule": None,
    "deleteRule": None,
    "schema": [
        {"name": "vehicle", "type": "relation", "required": True, "options": {"collectionId": vehicles_id, "cascadeDelete": True, "maxSelect": 1}},
        {"name": "hour_bucket", "type": "text", "required": True},
        {"name": "start_lat", "type": "number", "required": True},
        {"name": "start_lng", "type": "number", "required": True},
        {"name": "end_lat", "type": "number", "required": True},
        {"name": "end_lng", "type": "number", "required": True},
        {"name": "avg_speed", "type": "number", "required": False},
        {"name": "max_speed", "type": "number", "required": False},
        {"name": "distance_traveled", "type": "number", "required": False},
        {"name": "point_count", "type": "number", "required": False},
        {"name": "route_polyline", "type": "text", "required": False}
    ],
    "indexes": [
        "CREATE UNIQUE INDEX idx_telemetry_vehicle_hour ON telemetry_aggregated (vehicle, hour_bucket)",
        "CREATE INDEX idx_telemetry_hour ON telemetry_aggregated (hour_bucket)"
    ]
})

# ============================================
# Create messages collection
# ============================================
messages_id = create_collection({
    "name": "messages",
    "type": "base",
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id = sender",
    "deleteRule": "@request.auth.id = sender",
    "schema": [
        {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": convoys_id, "cascadeDelete": True, "maxSelect": 1}},
        {"name": "sender", "type": "relation", "required": True, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": True, "maxSelect": 1}},
        {"name": "type", "type": "select", "required": True, "options": {"values": ["text", "voice", "system"], "maxSelect": 1}},
        {"name": "content", "type": "text", "required": True},
        {"name": "duration", "type": "number", "required": False},
        {"name": "location_lat", "type": "number", "required": False},
        {"name": "location_lng", "type": "number", "required": False}
    ],
    "indexes": [
        "CREATE INDEX idx_messages_convoy ON messages (convoy)",
        "CREATE INDEX idx_messages_sender ON messages (sender)"
    ]
})

# ============================================
# Create geofences collection
# ============================================
geofences_id = create_collection({
    "name": "geofences",
    "type": "base",
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != ''",
    "deleteRule": "@request.auth.id != ''",
    "schema": [
        {"name": "convoy", "type": "relation", "required": True, "options": {"collectionId": convoys_id, "cascadeDelete": True, "maxSelect": 1}},
        {"name": "name", "type": "text", "required": True},
        {"name": "type", "type": "select", "required": True, "options": {"values": ["circle", "polygon"], "maxSelect": 1}},
        {"name": "center_lat", "type": "number", "required": False},
        {"name": "center_lng", "type": "number", "required": False},
        {"name": "radius_m", "type": "number", "required": False},
        {"name": "polygon_coords", "type": "json", "required": False},
        {"name": "alert_on", "type": "select", "required": True, "options": {"values": ["enter", "exit", "both"], "maxSelect": 1}},
        {"name": "status", "type": "select", "required": True, "options": {"values": ["active", "inactive"], "maxSelect": 1}}
    ],
    "indexes": [
        "CREATE INDEX idx_geofences_convoy ON geofences (convoy)"
    ]
})

# ============================================
# Create audit_log collection
# ============================================
audit_id = create_collection({
    "name": "audit_log",
    "type": "base",
    "listRule": None,
    "viewRule": None,
    "createRule": None,
    "updateRule": None,
    "deleteRule": None,
    "schema": [
        {"name": "user", "type": "relation", "required": False, "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": False, "maxSelect": 1}},
        {"name": "action", "type": "text", "required": True},
        {"name": "resource_type", "type": "text", "required": True},
        {"name": "resource_id", "type": "text", "required": False},
        {"name": "metadata", "type": "json", "required": False}
    ],
    "indexes": [
        "CREATE INDEX idx_audit_user ON audit_log (user)",
        "CREATE INDEX idx_audit_action ON audit_log (action)"
    ]
})

print("\n=== Summary ===")
print(f"convoys: {convoys_id}")
print(f"convoy_members: {members_id}")
print(f"vehicles: {vehicles_id}")
print(f"telemetry_aggregated: {telem_id}")
print(f"messages: {messages_id}")
print(f"geofences: {geofences_id}")
print(f"audit_log: {audit_id}")

# Verify
resp = requests.get(f"{PB_URL}/api/collections", headers=headers)
total = resp.json().get("totalItems", 0)
print(f"\nTotal collections: {total}")
