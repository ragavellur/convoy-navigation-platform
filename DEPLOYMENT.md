# Deployment Guide

## Architecture Overview

```
Internet → Cloudflare Tunnel → Nginx (:80)
  ├── /            → convoy-frontend :8081 (containerized Nginx + Vite build)
  ├── /api/        → PocketBase :8090 (Auth + DB + Realtime)
  ├── /pb/         → PocketBase Admin UI :8090
  ├── /voice/      → Voice Server :3001 (WebSocket + WebRTC)
  ├── /routing/    → OSRM :5001
  ├── /simulation/ → Simulation Service :3002
  └── /geocode/    → Nominatim :8080

Docker Network (convoy-network) — all internal:
  ├── convoy-frontend     :80    (Vite build served by Nginx, mapped to 8081)
  ├── convoy-pocketbase   :8090  (SQLite + Auth + API + Realtime)
  ├── convoy-osrm         :5000  (OSRM routing engine, mapped to 5001)
  ├── convoy-nominatim    :8080  (Nominatim geocoder)
  ├── convoy-redis        :6379  (Redis cache)
  ├── convoy-simulation   :3002  (Simulation service + push notifications)
  └── convoy-voice        :3001  (mediasoup SFU voice)

Host:
  └── Nginx (:80) — reverse proxy to all containers
```

## Deployment Paths

| Change Type                                      | Deployment Method                             | Downtime          |
| ------------------------------------------------ | --------------------------------------------- | ----------------- |
| **All code changes** (frontend + backend)        | `docker compose up --build` on server         | ~30-60s (rolling) |
| **Database schema** (collections, fields, rules) | Run setup script against PocketBase Admin API | None (instant)    |

> **All code deployments are unified** — `docker compose up --build` rebuilds only
> the changed containers and replaces them. Frontend is a multi-stage Docker build
> (Node.js build → Nginx serve), no more rsync.

---

## Server Details

| Item             | Value                                       |
| ---------------- | ------------------------------------------- |
| Server IP        | `192.168.200.11`                            |
| Domain           | `convoy.vellur.in`                          |
| SSH              | `ssh user@host` (use SSH keys)              |
| Project path     | `/opt/convoy/`                              |
| Nginx config     | `/etc/nginx/sites-enabled/convoy`           |
| PocketBase admin | `admin@example.com` / (use strong password) |
| Cloudflare       | Dashboard-managed tunnel (token file)       |

---

## Unified Deployment (docker compose up --build)

All code changes (frontend + backend) use the same deployment command.

### Step 1: Pull latest code on server

```bash
ssh user@host "
  cd /opt/convoy
  sudo git pull origin main
"
```

### Step 2: Rebuild and restart all containers

```bash
ssh user@host "
  cd /opt/convoy
  sudo docker compose up -d --build
"
```

This rebuilds **only the changed containers** (Docker layer caching):

- `convoy-frontend` — multi-stage Node.js build + Nginx serve (rebuilds on any `apps/web/` change)
- `convoy-simulation` — rebuilds on `apps/simulation-service/` changes
- `convoy-voice` — rebuilds on `apps/voice-server/` changes
- `convoy-pocketbase` — rebuilds on `docker/pocketbase/` or `pb_hooks/` changes

Unchanged containers are **not rebuilt** — just left running.

### Step 3: Verify container health

```bash
ssh user@host "
  sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
"
```

All containers should show `healthy` (except `convoy-voice` which may show `unhealthy` — known issue, voice still works).

### Step 4: Purge Cloudflare cache

Cloudflare CDN aggressively caches static assets. After deployment:

1. Go to Cloudflare Dashboard → convoy.vellur.in → Caching → Configuration
2. Click "Purge Everything"

### Step 5: Smoke test

- [ ] `https://convoy.vellur.in` loads without blank page
- [ ] Login/Register works
- [ ] Console has no 404s for JS/CSS assets
- [ ] Theme toggle works (light/dark)
- [ ] Create/join convoy works
- [ ] Map loads and routes work

---

## Database Schema Deployment (Admin API)

When collections, fields, or rules change (separate from code deployment).

### Step 1: Run setup script locally against server

```bash
# Using the shell script (two-phase: create fields, then set rules)
PB_URL="https://convoy.vellur.in" \
PB_EMAIL="admin@example.com" \
PB_PASSWORD="strong-password" \
bash scripts/setup-collections.sh

# Or using the Python script
python3 scripts/setup-collections.py \
  --url https://convoy.vellur.in \
  --email admin@example.com \
  --password "strong-password"
```

### Step 2: Verify via PocketBase admin UI

- Go to `https://convoy.vellur.in/pb/`
- Login with admin credentials
- Check that new collections/fields exist

> **PocketBase v0.21.3 quirks:**
>
> - JSON fields require `maxSize: 2000000` in options
> - File fields require `maxSize` (e.g., `5242880`)
> - Bool fields must NOT have `options` key
> - PATCH returns 400 but actually applies changes
> - Collection schema uses `schema` field (not `fields`) in API body
> - Rules referencing schema fields must be set AFTER collection creation (two-phase)

---

## Cloudflare Tunnel

The server uses Cloudflare Tunnel (not port forwarding) for HTTPS.

- **Dashboard-managed** — config via Cloudflare Zero Trust dashboard
- **Token file** at `/etc/cloudflared/token` on server
- **Service:** `cloudflared` runs as a systemd service
- **HTTPS termination** happens at Cloudflare edge, not on server
- **Nginx listens on port 80 only** (no SSL certs on server)

### Managing the tunnel

```bash
# Check tunnel status
ssh user@host "
  sudo systemctl status cloudflared
"

# Restart tunnel
ssh user@host "
  sudo systemctl restart cloudflared
"
```

---

## Nginx Configuration

Server Nginx at `/etc/nginx/sites-enabled/convoy`:

```nginx
server {
    listen 80;
    server_name convoy.vellur.in;
    client_max_body_size 10M;

    # Frontend (PWA) — containerized Nginx
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /pb/ {
        proxy_pass http://127.0.0.1:8090/_;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /voice/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    location /routing/ {
        proxy_pass http://127.0.0.1:5001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /simulation/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /geocode/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> Template version at `nginx/convoy.conf` with `__DOMAIN__` placeholder.
> Install script substitutes the domain via `sed`.

---

## Service Ports

| Service      | Container Port | Host Port   | External Access           |
| ------------ | -------------- | ----------- | ------------------------- |
| Frontend     | 80             | 8081        | Via `/` (Nginx proxy)     |
| PocketBase   | 8090           | 8090        | Via `/api/` and `/pb/`    |
| OSRM         | 5000           | 5001        | Via `/routing/`           |
| Nominatim    | 8080           | 8080        | Via `/geocode/`           |
| Redis        | 6379           | 6379        | Internal only             |
| Simulation   | 3002           | 3002        | Via `/simulation/`        |
| Voice        | 3001           | 3001        | Via `/voice/` (WebSocket) |
| Voice (UDP)  | 20000-20100    | 20000-20100 | Direct (WebRTC)           |
| Nginx (host) | 80             | 80          | Via Cloudflare Tunnel     |

---

## PocketBase Collections

| Collection         | ID                | Purpose                                             |
| ------------------ | ----------------- | --------------------------------------------------- |
| users              | `_pb_users_auth_` | User accounts (name, email, phone, status, role)    |
| vehicles           | `u9ckdyaer5vm8hn` | User-owned vehicles (car/truck/motorcycle/trekker)  |
| convoys            | `hz79pz013alllc0` | Convoy groups (name, route, type: vehicle/trekker)  |
| convoy_members     | (auto)            | User-convoy assignments (role: owner/admin/member)  |
| positions          | (auto)            | Real-time vehicle positions (lat/lng/speed/heading) |
| push_subscriptions | `VFJ7GDQLPCCZV4Q` | Web push notification subscriptions                 |

---

## Pre-Deploy Checklist

Before any deployment, run through this:

### All code changes

- [ ] `apps/web/.env.production` has correct `VITE_POCKETBASE_URL` (production domain, NOT localhost)
- [ ] No hardcoded `localhost:8090` in source (grep for it)
- [ ] No hardcoded credentials in source
- [ ] Docker Compose file syntax valid: `docker compose config`
- [ ] Environment variables set in server's `/opt/convoy/.env`
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`

### Database schema changes

- [ ] Test collection creation against local PocketBase first
- [ ] Two-phase approach: create fields first, then set rules
- [ ] Verify via PocketBase admin UI after applying

---

## Troubleshooting

### Frontend shows blank page after deploy

- Check Cloudflare cache — purge everything
- Verify frontend container is running: `docker ps | grep frontend`
- Check frontend container logs: `docker compose logs -f frontend`
- Check browser console for 404s on JS/CSS assets

### Container won't start

```bash
docker compose logs -f <service-name>
```

### PocketBase auth failures

- Check that `users` collection has `verified: true` for existing users
- Auth store bug: do NOT use `pb.authStore.onChange()` — it overrides localStorage persistence

### Simulation API returns 404

- Frontend calls `window.location.origin + '/simulation/api/...'` — goes through Nginx proxy
- Verify Nginx config has the `/simulation/` location block

### Cloudflare serving stale content

- Cloudflare CDN caches aggressively
- Must purge cache via dashboard after frontend deploys
- Alternative: wait for edge expiry (varies, can be hours)

### Voice server shows unhealthy

- `convoy-voice` health check may fail even when functional
- Verify WebSocket connection works in browser DevTools
- Check UDP ports 20000-20100 are open

### OSRM returns 0 distance

- Local OSRM only has Monaco data
- Falls back to `router.project-osrm.org` public API for non-Monaco routes
- For full coverage, load region-specific OSM data (see OSRM Data Setup section)
