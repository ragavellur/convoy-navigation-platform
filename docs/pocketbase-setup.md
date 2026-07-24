# PocketBase Setup

## Overview

PocketBase serves as the primary backend for the Convoy Navigation Platform, providing:

- **Authentication**: User registration and login
- **Database**: SQLite-based storage for all collections
- **Real-time**: WebSocket subscriptions for live updates
- **Admin UI**: Built-in admin interface at `http://localhost:8090/_/`

---

## Collections

### Users (Extended Auth)
- Built-in auth with additional fields: `name`, `phone`, `avatar`, `role`, `status`

### Convoys
- Convoy groups with join codes, settings, and member limits

### Convoy Members
- Junction table for convoy membership with roles

### Vehicles
- Vehicle metadata with configurable telemetry settings

### Telemetry Aggregated
- Hourly position snapshots (Redis raw data aggregated here)

### Messages
- Text, voice, and system messages within convoys

### Geofences
- Virtual boundaries for alerts (circle or polygon)

### Audit Log
- Activity tracking for debugging

---

## API Rules

### Public (No Auth)
- User registration
- Convoy join (by code)

### Authenticated
- CRUD on own profile
- CRUD on convoys where owner/admin
- CRUD on vehicles in owned convoys
- Read messages in joined convoys
- Write messages in joined convoys

### Admin Only
- User management
- System settings
- Audit log access

---

## Real-time Events

### Convoy Channels
- `convoy:{id}:messages` - New messages
- `convoy:{id}:telemetry` - Telemetry updates
- `convoy:{id}:members` - Member join/leave

### User Channels
- `user:{id}:notifications` - Push notifications

---

## Migrations

### Running Migrations
```bash
# PocketBase automatically runs migrations on startup
# Migration files are in pb_migrations/
```

### Creating New Migrations
1. Create a new file in `pb_migrations/` with format `YYYYMMDDHHMMSS_name.js`
2. Export `up()` and `down()` functions
3. Restart PocketBase container

---

## Hooks

### Messages Hook (`pb_hooks/messages.js`)
- Broadcasts new messages to convoy members via WebSocket

### Vehicles Hook (`pb_hooks/vehicles.js`)
- Sets default telemetry configuration for new vehicles

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POCKETBASE_PORT` | 8090 | Admin UI port |
| `POCKETBASE_ADMIN_EMAIL` | admin@convoy.local | Admin email |
| `POCKETBASE_ADMIN_PASSWORD` | admin123456 | Admin password |

---

## Accessing Admin UI

1. Open `http://localhost:8090/_/`
2. Login with admin credentials
3. Create collections, manage users, view data

---

## Docker Configuration

PocketBase runs in a Docker container with:
- Persistent volume for data
- Health checks
- Network isolation
- Auto-restart on failure

See `docker-compose.yml` for full configuration.
