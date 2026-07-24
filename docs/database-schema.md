# Database Schema

## Overview

The Convoy Navigation Platform uses a hybrid storage approach:

- **PocketBase**: Primary database for users, convoys, vehicles, messages, and aggregated telemetry
- **Redis**: Real-time telemetry cache (last 24h raw GPS data)
- **localStorage**: Client-side position caching for threshold-based updates

---

## Collections

### users (Extended PocketBase Auth)

Built-in PocketBase auth collection with additional fields:

| Field | Type | Description |
|-------|------|-------------|
| name | text | Display name |
| phone | text | Phone number (optional) |
| avatar | file | Profile picture |
| role | select | `admin` / `member` |
| status | select | `active` / `inactive` / `banned` |

---

### convoys

Convoy groups that members can create or join.

| Field | Type | Description |
|-------|------|-------------|
| name | text | Convoy display name |
| code | text | 6-digit join code (unique) |
| description | text | Optional description |
| owner | relation → users | Creator of the convoy |
| status | select | `active` / `archived` |
| max_members | number | Maximum participants (default: 20) |
| settings | json | Convoy-specific settings |
| created | created | Auto timestamp |
| updated | updated | Auto timestamp |

**Settings JSON Schema:**
```json
{
  "distance_threshold_m": 10,
  "time_fallback_sec": 300,
  "heading_threshold_deg": 15,
  "sample_rate_sec": 5,
  "voice_enabled": true,
  "geofence_alerts": true
}
```

---

### convoy_members

Junction table for convoy membership.

| Field | Type | Description |
|-------|------|-------------|
| convoy | relation → convoys | Convoy reference |
| user | relation → users | User reference |
| role | select | `owner` / `admin` / `member` |
| vehicle | relation → vehicles | Assigned vehicle (optional) |
| joined_at | created | Auto timestamp |
| status | select | `active` / `kicked` / `left` |

---

### vehicles

Vehicle metadata and configuration.

| Field | Type | Description |
|-------|------|-------------|
| convoy | relation → convoys | Parent convoy |
| owner | relation → users | Vehicle owner |
| name | text | Vehicle display name (e.g., "Lead Jeep") |
| type | select | `car` / `truck` / `motorcycle` / `other` |
| color | text | Vehicle color |
| license_plate | text | License plate number |
| image | file | Vehicle photo (optional) |
| telemetry_config | json | Threshold settings |
| status | select | `active` / `inactive` / `maintenance` |
| created | created | Auto timestamp |

**Telemetry Config JSON Schema:**
```json
{
  "distance_threshold_m": 10,
  "time_fallback_sec": 300,
  "heading_threshold_deg": 15,
  "sample_rate_sec": 5,
  "speed_threshold_kmh": 5
}
```

---

### telemetry_aggregated

Hourly aggregated position snapshots (PocketBase).

| Field | Type | Description |
|-------|------|-------------|
| vehicle | relation → vehicles | Vehicle reference |
| hour_bucket | text | ISO hour (e.g., "2026-07-24T14:00:00Z") |
| start_lat | number | Position at hour start |
| start_lng | number | Position at hour start |
| end_lat | number | Position at hour end |
| end_lng | number | Position at hour end |
| avg_speed | number | Average speed (km/h) |
| max_speed | number | Max speed (km/h) |
| distance_traveled | number | Total distance (meters) |
| point_count | number | Raw points aggregated |
| route_polyline | text | Encoded polyline of path |
| created | created | Auto timestamp |

**Indexes:**
- `vehicle` + `hour_bucket` (compound unique)
- `hour_bucket` (for time-range queries)

---

### messages

Text and voice messages within convoys.

| Field | Type | Description |
|-------|------|-------------|
| convoy | relation → convoys | Target convoy |
| sender | relation → users | Message author |
| type | select | `text` / `voice` / `system` |
| content | text | Text content or voice file URL |
| duration | number | Voice message duration (seconds) |
| location_lat | number | Sender location when sent |
| location_lng | number | Sender location when sent |
| created | created | Auto timestamp |

---

### geofences

Virtual boundaries for alerts.

| Field | Type | Description |
|-------|------|-------------|
| convoy | relation → convoys | Target convoy |
| name | text | Geofence name |
| type | select | `circle` / `polygon` |
| center_lat | number | Center latitude (circle) |
| center_lng | number | Center longitude (circle) |
| radius_m | number | Radius in meters (circle) |
| polygon_coords | json | Array of {lat, lng} (polygon) |
| alert_on | select | `enter` / `exit` / `both` |
| status | select | `active` / `inactive` |
| created | created | Auto timestamp |

---

### audit_log

Activity tracking for debugging.

| Field | Type | Description |
|-------|------|-------------|
| user | relation → users | Actor |
| action | text | Action performed |
| resource_type | text | Collection name |
| resource_id | text | Record ID |
| metadata | json | Additional context |
| created | created | Auto timestamp |

---

## Redis Schema

### Real-time Telemetry (Auto-expire 24h)

```
convoy:{convoy_id}:positions
  Type: Sorted Set
  Score: Unix timestamp
  Member: {vehicle_id}
  Value: JSON { lat, lng, speed, heading, accuracy }

convoy:{convoy_id}:latest
  Type: Hash
  Fields: {vehicle_id} → JSON { lat, lng, speed, heading, timestamp }

convoy:{convoy_id}:config
  Type: Hash
  Fields: distance_threshold_m, time_fallback_sec, heading_threshold_deg
```

### Session Cache

```
session:{user_id}
  Type: String (JSON)
  TTL: 7 days
  Value: { user_id, convoy_ids[], last_active }
```

---

## Client-Side localStorage

### Position Cache

```javascript
// Key: convoy:last_position
{
  lat: 37.1234,
  lng: -122.5678,
  heading: 45.2,
  timestamp: 1690200000000,
  speed: 0.5
}

// Key: convoy:config
{
  distanceThreshold: 10,
  timeFallback: 300,
  headingThreshold: 15
}
```

---

## Telemetry Flow

### Client-Side (Web/Mobile)

```
1. GPS API returns new position
2. Read last_position from localStorage
3. Calculate:
   - distance = haversine(last, current)
   - heading_change = abs(current.heading - last.heading)
   - time_diff = now - last.timestamp
4. If ANY condition met:
   - distance > distanceThreshold
   - heading_change > headingThreshold
   - time_diff > timeFallback
   → Send to server
   → Update localStorage
5. Else: Skip network request
```

### Server-Side (Redis + PocketBase)

```
1. Receive position update from client
2. Store in Redis (sorted set + hash)
3. Every hour: Aggregation job runs
   a. Read all points from Redis for hour
   b. Calculate: start/end positions, avg/max speed, distance
   c. Encode route as polyline
   d. Write aggregated record to PocketBase
   e. Delete raw points from Redis
```

---

## Future: TimescaleDB Integration

> **TODO**: Consider migrating `telemetry_aggregated` to TimescaleDB for better time-series performance.

**Benefits:**
- Native time-series compression (90%+ reduction)
- Continuous aggregates (auto-updating materialized views)
- Data retention policies (auto-delete old data)
- Gap filling and interpolation queries

**Migration Path:**
1. Add `timescaledb` container to Docker Compose
2. Create hypertable on `telemetry_aggregated`
3. Enable compression policy for data > 7 days
4. Update PocketBase to use PostgreSQL adapter (if available) or proxy through API

---

## Indexing Strategy

### PocketBase

- `convoys.code` → Unique index (join code lookup)
- `convoy_members.convoy` + `convoy_members.user` → Compound unique
- `vehicles.convoy` → Foreign key index
- `telemetry_aggregated.vehicle` + `telemetry_aggregated.hour_bucket` → Compound unique
- `messages.convoy` + `messages.created` → Compound index (chat history)
- `audit_log.user` + `audit_log.created` → Compound index

### Redis

- Sorted Set scores enable efficient time-range queries
- Hash fields allow O(1) lookups for latest positions

---

## Data Retention

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| Raw telemetry | Redis | 24 hours |
| Aggregated telemetry | PocketBase | 90 days |
| Messages | PocketBase | Permanent |
| Audit logs | PocketBase | 1 year |
| User data | PocketBase | Permanent (until deletion request) |
