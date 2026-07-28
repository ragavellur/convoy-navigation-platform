# Deployment Guide

## Architecture Overview

```
Internet → Cloudflare Tunnel → Nginx (:80)
  ├── /            → Frontend (rsync'd static files)
  ├── /api/        → PocketBase :8090 (Auth + DB + Realtime)
  ├── /pb/         → PocketBase Admin UI :8090
  ├── /voice/      → Voice Server :3001 (WebSocket + WebRTC)
  ├── /routing/    → OSRM :5001
  ├── /simulation/ → Simulation Service :3002
  └── /geocode/    → Nominatim :8080

Docker Network (convoy-network) — all internal:
  ├── convoy-pocketbase   :8090  (SQLite + Auth + API + Realtime)
  ├── convoy-osrm         :5000  (OSRM routing engine, mapped to 5001)
  ├── convoy-nominatim    :8080  (Nominatim geocoder)
  ├── convoy-redis        :6379  (Redis cache)
  ├── convoy-simulation   :3002  (Simulation service + push notifications)
  └── convoy-voice        :3001  (mediasoup SFU voice)

Host:
  └── Nginx (:80) — reverse proxy + static file serving
```

## Three Deployment Paths

The platform has **three distinct deployment paths** depending on what changed:

| Change Type                                       | Deployment Method                                  | Downtime              |
| ------------------------------------------------- | -------------------------------------------------- | --------------------- |
| **Frontend** (React/Vite/JS/CSS)                  | Build locally → rsync to server → purge Cloudflare | None (instant)        |
| **Backend** (PocketBase hooks, simulation, voice) | Rebuild Docker container on server                 | ~10-30s per container |
| **Database schema** (collections, fields, rules)  | Run setup script against PocketBase Admin API      | None (instant)        |

> **Future:** Frontend will be containerized (multi-stage Docker build + Nginx).
> This eliminates rsync and unifies all deployments to `docker compose up --build`.

---

## Server Details

| Item             | Value                                               |
| ---------------- | --------------------------------------------------- |
| Server IP        | `192.168.200.11`                                    |
| Domain           | `convoy.vellur.in`                                  |
| SSH              | `bharatradar@192.168.200.11` (password: `raga@098`) |
| Project path     | `/opt/convoy/`                                      |
| Frontend path    | `/var/www/convoy/`                                  |
| Nginx config     | `/etc/nginx/sites-enabled/convoy`                   |
| PocketBase admin | `raghavan@vellur.in` / `raga!098`                   |
| Cloudflare       | Dashboard-managed tunnel (token file)               |

---

## Path 1: Frontend Deployment (rsync)

This is the most common deployment — theme changes, UI fixes, new components, etc.

### Step 1: Build locally

```bash
cd apps/web
npm run build
```

Verify `.env.production` has correct values before building:

```bash
cat .env.production
# VITE_POCKETBASE_URL=https://convoy.vellur.in
# VITE_VAPID_PUBLIC_KEY=...
```

### Step 2: rsync to server

```bash
rsync -avz --delete dist/ bharatradar@192.168.200.11:/tmp/convoy-deploy/
```

### Step 3: Move files on server (sudo required — files are root-owned)

```bash
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
  sudo rm -rf /var/www/convoy/*
  sudo cp -r /tmp/convoy-deploy/* /var/www/convoy/
  sudo chown -R root:root /var/www/convoy/
  rm -rf /tmp/convoy-deploy
"
```

> **Why `rm -rf` first?** Old hashed asset filenames (e.g., `index-abc123.js`) would
> linger if we just copied. `--delete` in rsync handles this too, but the sudo
> copy step needs the clean approach.

### Step 4: Purge Cloudflare cache

Cloudflare CDN aggressively caches static assets. After deployment:

1. Go to Cloudflare Dashboard → convoy.vellur.in → Caching → Configuration
2. Click "Purge Everything" (or purge specific URLs)
3. Hard-refresh the site (`Ctrl+Shift+R`)

### Step 5: Smoke test

- [ ] `https://convoy.vellur.in` loads without blank page
- [ ] Login/Register works
- [ ] Console has no 404s for JS/CSS assets
- [ ] Theme toggle works (light/dark)

---

## Path 2: Backend Deployment (Docker rebuild)

When backend code changes — PocketBase hooks, simulation service, voice server.

### Step 1: Pull latest code on server

```bash
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
  cd /opt/convoy
  sudo git pull origin main
"
```

### Step 2: Rebuild the changed service

```bash
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
  cd /opt/convoy
  sudo docker compose up -d --build <service-name>
"
```

Available service names:

- `pocketbase` — PocketBase server + custom hooks
- `simulation-service` — Simulation API + push notifications
- `voice-server` — WebRTC voice SFU
- `osrm` — OSRM routing engine (rarely changes)
- `nominatim` — Nominatim geocoder (rarely changes)
- `redis` — Redis cache (rarely changes)

### Step 3: Verify container health

```bash
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
  sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
"
```

All containers should show `healthy` (except `convoy-voice` which may show `unhealthy` — known issue, voice still works).

---

## Path 3: Database Schema Deployment (Admin API)

When collections, fields, or rules change.

### Step 1: Run setup script locally against server

```bash
# Using the shell script (two-phase: create fields, then set rules)
PB_URL="https://convoy.vellur.in" \
PB_EMAIL="raghavan@vellur.in" \
PB_PASSWORD="raga!098" \
bash scripts/setup-collections.sh

# Or using the Python script
python3 scripts/setup-collections.py \
  --url https://convoy.vellur.in \
  --email raghavan@vellur.in \
  --password "raga!098"
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
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
  sudo systemctl status cloudflared
"

# Restart tunnel
sshpass -p 'raga@098' ssh bharatradar@192.168.200.11 "
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

    location / {
        root /var/www/convoy;
        try_files $uri $uri/ /index.html;
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

| Service     | Container Port | Host Port   | External Access           |
| ----------- | -------------- | ----------- | ------------------------- |
| PocketBase  | 8090           | 8090        | Via `/api/` and `/pb/`    |
| OSRM        | 5000           | 5001        | Via `/routing/`           |
| Nominatim   | 8080           | 8080        | Via `/geocode/`           |
| Redis       | 6379           | 6379        | Internal only             |
| Simulation  | 3002           | 3002        | Via `/simulation/`        |
| Voice       | 3001           | 3001        | Via `/voice/` (WebSocket) |
| Voice (UDP) | 20000-20100    | 20000-20100 | Direct (WebRTC)           |
| Nginx       | 80             | 80          | Via Cloudflare Tunnel     |

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

### Frontend changes

- [ ] `apps/web/.env.production` has correct `VITE_POCKETBASE_URL` (production domain, NOT localhost)
- [ ] `npm run build` succeeds
- [ ] No hardcoded `localhost:8090` in source (grep for it)
- [ ] No hardcoded credentials in source

### Backend changes

- [ ] Docker Compose file syntax valid: `docker compose config`
- [ ] Environment variables set in server's `/opt/convoy/.env`
- [ ] Health checks pass after rebuild

### Database schema changes

- [ ] Test collection creation against local PocketBase first
- [ ] Two-phase approach: create fields first, then set rules
- [ ] Verify via PocketBase admin UI after applying

---

## Troubleshooting

### Frontend shows blank page after deploy

- Check Cloudflare cache — purge everything
- Verify `/var/www/convoy/index.html` exists on server
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
