# Convoy Travel Simulation

## Overview

The simulation script (`scripts/simulate-convoy.js`) drives vehicles along a real OSRM route, publishing GPS positions to PocketBase at **75m intervals** — exactly matching the frontend's position threshold. This lets you see realistic convoy movement on the map in real-time or accelerated.

## How It Works

```
┌─────────────┐     positions every 75m     ┌──────────────┐
│  simulate-  │ ──────────────────────────>  │  PocketBase  │
│  convoy.js  │    POST /positions/records   │  (positions) │
└─────────────┘                              └──────┬───────┘
       │                                           │
       │ sets simulation_active=true               │ Realtime subscription
       │                                           ▼
       │                                    ┌──────────────┐
       │                                    │  Browser UI  │
       │                                    │  (MapPage)   │
       │                                    └──────────────┘
       │                                           ▲
       └─ simulation_active=true ──────────────────┘
         → frontend skips real GPS publishing
```

### Conflict Resolution: Simulation vs Real GPS

When a user (Bob/Alice) has the web app open, their browser publishes real GPS positions every time they move ≥75m. The simulation script also writes positions for the same vehicles. These would conflict.

**Solution:** The `simulation_active` flag in the convoy's `settings` JSON field.

| State                      | Script behavior                   | Frontend behavior                     |
| -------------------------- | --------------------------------- | ------------------------------------- |
| `simulation_active: false` | Script not running                | Publishes real GPS positions normally |
| `simulation_active: true`  | Script writes simulated positions | Skips publishing real GPS positions   |

The script sets this flag to `true` on start and resets it to `false` on exit (including Ctrl+C).

## Prerequisites

- **Node.js 18+** (uses built-in `fetch`)
- **PocketBase** running at `http://localhost:8090`
- **OSRM** — tries local (`localhost:5001`) first, falls back to public (`router.project-osrm.org`)
- A convoy with `source_lat/lng` and `dest_lat/lng` coordinates
- At least one active convoy member with a vehicle

## Quick Start

```bash
# 1. Start PocketBase (if not running)
docker-compose up -d pocketbase

# 2. Open the map in your browser
open http://localhost:5173/map?convoy=<convoyId>

# 3. Run the simulation
node scripts/simulate-convoy.js <convoyId>
```

## Usage

```bash
node scripts/simulate-convoy.js <convoyId> [options]
```

### Options

| Flag                 | Default | Description                                                                    |
| -------------------- | ------- | ------------------------------------------------------------------------------ |
| `--speed-factor <n>` | `1`     | Time compression. `10` = 10x faster, `60` = 1 real second = 1 simulated minute |
| `--interval <n>`     | `2`     | Seconds between position updates (wall clock)                                  |
| `--dry-run`          | `false` | Preview movement without writing to DB                                         |
| `--no-flag`          | `false` | Don't set `simulation_active` flag                                             |

### Examples

```bash
# Real-time simulation (full journey takes ~21 min for 15km route)
node scripts/simulate-convoy.js yy6us6zhjtx2l2y

# 60x faster — full journey in ~21 seconds
node scripts/simulate-convoy.js yy6us6zhjtx2l2y --speed-factor 60

# 10x faster with 1-second updates
node scripts/simulate-convoy.js yy6us6zhjtx2l2y --speed-factor 10 --interval 1

# Preview without writing to DB
node scripts/simulate-convoy.js yy6us6zhjtx2l2y --dry-run

# If you want real GPS to keep working alongside simulation
node scripts/simulate-convoy.js yy6us6zhjtx2l2y --no-flag
```

## What Happens During Simulation

### 1. Setup Phase

```
🚗 Convoy Travel Simulation
──────────────────────────────────────────────────
Connecting to PocketBase...     ✓ Authenticated
Fetching convoy...              ✓ Weekend Road Trip - Test
Fetching convoy members...      ✓ 2 members
  - Bob (MH12EB9589)
  - Alice (MH12MW5420)
Fetching route from OSRM...     ✓ Route: 15.5 km, 21.1 min
Resampling to 75m waypoints...  ✓ 208 waypoints
Clearing old positions...       ✓ Deleted 1366 old positions
Setting simulation_active flag... ✓ simulation_active = true
```

### 2. Live Progress

```
═══════════════════════════════════════════════════
SIMULATION STARTED
Speed factor: 10x | Update interval: 2s
═══════════════════════════════════════════════════

  [T+60s] Bob: 5.23 km (34%) @ 50 km/h          | Alice: 3.67 km (24%) @ 35 km/h
  🏁 Bob arrived at destination! (180s simulated)
  [T+90s] Bob: ✅ arrived                         | Alice: 7.12 km (46%) @ 36 km/h
  [T+150s] Bob: ✅ arrived                        | Alice: ✅ arrived

  🎉 All vehicles arrived!
```

### 3. Summary

```
═══════════════════════════════════════════════════
SIMULATION SUMMARY
═══════════════════════════════════════════════════
Convoy:    Weekend Road Trip - Test (AN1XU5)
Route:     15.5 km
Wall time: 15.2s

  Bob:   15.5 km | 208 positions | avg 50.2 km/h | arrived
  Alice: 15.5 km | 198 positions | avg 35.8 km/h | arrived

Total positions published: 406
═══════════════════════════════════════════════════
```

## Technical Details

### Route Resampling

The OSRM route returns ~451 geometry points with variable spacing (1m to 369m apart). The script resamples to uniform **75m intervals**:

1. Walk through geometry points, accumulating distance
2. Every 75m, record a new waypoint
3. Interpolate exact lat/lng between the two bracketing geometry points
4. Compute bearing (heading in degrees) for each waypoint

Result: **208 waypoints** for a 15.5 km route.

### Vehicle Speed Profiles

Each vehicle gets a different base speed with ±10% random variance:

| Vehicle | Base Speed | ~KM/H   |
| ------- | ---------- | ------- |
| Bob     | 13.9 m/s   | 50 km/h |
| Alice   | 9.7 m/s    | 35 km/h |

Speed varies ±10% every 2 seconds (wall clock) to simulate realistic driving — braking, acceleration, traffic.

### Position Format

Each position written to PocketBase:

```json
{
  "vehicle": "9cmh9z6svvj22wd",
  "convoy": "yy6us6zhjtx2l2y",
  "lat": 18.523456,
  "lng": 73.908123,
  "speed": 13.2,
  "heading": 42,
  "accuracy": 5
}
```

- `speed`: m/s (varying)
- `heading`: degrees (0-360, direction of travel)
- `accuracy`: fixed at 5m (simulated GPS accuracy)

### Graceful Shutdown

Press **Ctrl+C** at any time:

1. Stops the simulation loop
2. Resets `simulation_active = false` (resumes real GPS publishing)
3. Prints summary of positions published

## Creating a New Convoy for Simulation

```bash
# 1. Create convoy via the web UI at /convoy
#    - Set source and destination coordinates
#    - Add at least one member with a vehicle

# 2. Get the convoy ID from PocketBase admin or URL
#    http://localhost:5173/map?convoy=<NEW_CONVoy_ID>

# 3. Run simulation
node scripts/simulate-convoy.js <NEW_CONVoy_ID> --speed-factor 60
```

## Troubleshooting

| Issue                     | Fix                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PocketBase auth failed`  | Ensure PB is running at `localhost:8090` with admin `admin@convoy.local`                                                                                              |
| `No active members`       | Ensure convoy members have `status: "active"`                                                                                                                         |
| `Could not fetch route`   | Check internet (for public OSRM) or start local OSRM (`docker-compose up osrm`)                                                                                       |
| `simulation_active` stuck | Run: `curl -X PATCH http://localhost:8090/api/collections/convoys/records/<id> -H "Content-Type: application/json" -d '{"settings":"{\"simulation_active\":false}"}'` |
| Map doesn't show vehicles | Open browser console — check for Realtime subscription errors                                                                                                         |
| Real GPS still publishing | Ensure the user's browser tab is on the `/map?convoy=<id>` page (flag is checked via Realtime subscription)                                                           |
