# Deployment Guide

## Overview

The Convoy Navigation Platform runs as a set of Docker containers behind a reverse proxy. This guide covers production deployment on a fresh Ubuntu/Debian server with a domain name.

## Architecture

```
Internet → Nginx (SSL) → :443
  ├── /            → Vite static build (Nginx)
  ├── /api         → PocketBase :8090
  ├── /pb/         → PocketBase Admin UI :8090
  ├── /voice       → Voice Server :3001 (WebSocket)
  └── /*           → Vite static build (Nginx)

Docker Network (convoy-network):
  ├── convoy-pocketbase   :8090  (SQLite + Auth + API + Realtime)
  ├── convoy-osrm         :5000  (OSRM routing engine)
  ├── convoy-nominatim    :8080  (Nominatim geocoder)
  ├── convoy-redis        :6379  (Redis cache)
  ├── convoy-simulation   :3002  (Simulation service)
  └── convoy-voice        :3001  (mediasoup SFU voice)
```

## System Requirements

| Resource | Minimum                    |
| -------- | -------------------------- |
| OS       | Ubuntu 22.04+ / Debian 12+ |
| CPU      | 2 vCPU                     |
| RAM      | 4 GB                       |
| Disk     | 40 GB SSD                  |
| Ports    | 80, 443, 8090 (admin only) |

## Software Requirements

- Docker Engine 24+
- Docker Compose v2+
- Git
- Nginx
- Certbot (for SSL)

## Quick Start (Automated)

```bash
git clone https://github.com/ragavellur/convoy-navigation-platform.git
cd convoy-navigation-platform
chmod +x scripts/install.sh
sudo ./scripts/install.sh
```

The install script will prompt for:

1. Domain name (e.g., `convoy.example.com`)
2. Admin email (for SSL certificate)
3. PocketBase admin credentials
4. JWT secret
5. Server public IP (for WebRTC)

## Manual Deployment

### 1. Install Dependencies

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose
sudo apt install docker-compose-plugin -y

# Nginx
sudo apt install nginx -y

# Certbot
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Clone Repository

```bash
git clone https://github.com/ragavellur/convoy-navigation-platform.git
cd convoy-navigation-platform
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```bash
# PocketBase
POCKETBASE_PORT=8090
POCKETBASE_ADMIN_EMAIL=admin@yourdomain.com
POCKETBASE_ADMIN_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# OSRM
OSRM_PORT=5001

# Nominatim
NOMINATIM_PORT=8080
NOMINATIM_DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Frontend (must use HTTPS in production)
VITE_POCKETBASE_URL=https://yourdomain.com/api
VITE_OSRM_URL=https://yourdomain.com
VITE_NOMINATIM_URL=https://yourdomain.com
VITE_MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png

# WebRTC (set to server public IP)
MEDIASOUP_ANNOUNCED_IP=YOUR_SERVER_PUBLIC_IP
```

### 4. Build and Start Services

```bash
# Build all images
docker compose build

# Start backend services
docker compose up -d

# Verify health
docker compose ps
```

### 5. Configure Nginx

Create `/etc/nginx/sites-available/convoy`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    client_max_body_size 10M;

    # Frontend (built Vite app)
    location / {
        root /opt/convoy/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # PocketBase API
    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (PocketBase realtime)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # PocketBase Admin UI
    location /pb/ {
        proxy_pass http://127.0.0.1:8090/_/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Voice Server (WebSocket)
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

    # OSRM (routing)
    location /routing/ {
        proxy_pass http://127.0.0.1:5001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Nominatim (geocoding)
    location /geocode/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/convoy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Build Frontend

```bash
# Build the web app with production API URL
cd apps/web
VITE_POCKETBASE_URL=https://yourdomain.com/api \
VITE_OSRM_URL=https://yourdomain.com/routing \
VITE_NOMINATIM_URL=https://yourdomain.com/geocode \
npm run build

# Copy to nginx serving directory
sudo mkdir -p /opt/convoy/frontend
sudo cp -r dist/* /opt/convoy/frontend/dist/
```

### 7. SSL Certificate

```bash
sudo certbot --nginx -d yourdomain.com
```

### 8. Setup PocketBase Admin

```bash
# Create admin account via PocketBase CLI inside container
docker exec -it convoy-pocketbase /pb/pocketbase admin create \
  admin@yourdomain.com \
  your-password
```

Or use the admin UI at `https://yourdomain.com/pb/`.

### 9. Configure Collections

After first login to PocketBase admin, create the required collections:

See `docs/pocketbase-setup.md` for the full collection schema and setup instructions.

Or run the setup script:

```bash
node scripts/setup-collections.js
```

### 10. Load Map Data

OSRM and Nominatim come pre-loaded with Monaco data. For other regions, mount your own `.osm.pbf` file:

```bash
# Download OSM data for your region
wget https://download.geofabrik.de/asia/india-latest.osm.pbf -O data/india-latest.osm.pbf

# Process with OSRM
docker run -v $(pwd)/data:/data ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf
docker run -v $(pwd)/data:/data ghcr.io/project-osrm/osrm-backend osrm-partition /data/india-latest.osrm
docker run -v $(pwd)/data:/data ghcr.io/project-osrm/osrm-backend osrm-customize /data/india-latest.osrm

# Update docker-compose command to use your data
# command: osrm-routed --algorithm mld /data/india-latest.osrm
```

## Service Ports

| Service    | Container Port | Host Port | Purpose             |
| ---------- | -------------- | --------- | ------------------- |
| PocketBase | 8090           | 8090      | API, Auth, Realtime |
| OSRM       | 5000           | 5001      | Route calculation   |
| Nominatim  | 8080           | 8080      | Geocoding           |
| Redis      | 6379           | 6379      | Cache               |
| Simulation | 3002           | 3002      | Vehicle simulation  |
| Voice      | 3001           | 3001      | WebRTC voice        |

## Firewall Rules

```bash
# Required
sudo ufw allow 80/tcp    # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8090/tcp  # PocketBase admin (restrict to your IP)

# UDP for WebRTC voice
sudo ufw allow 20000:20100/udp

# Optional (restrict as needed)
sudo ufw allow 5001/tcp  # OSRM (if exposing directly)
sudo ufw allow 3002/tcp  # Simulation (internal use only)
```

## Backup

```bash
# PocketBase database (SQLite)
docker exec convoy-pocketbase cp /pb/pb_data/data.db /pb/pb_data/backup-$(date +%Y%m%d).db
docker cp convoy-pocketbase:/pb/pb_data/backup-$(date +%Y%m%d).db ./backups/
```

## Updating

```bash
cd convoy-navigation-platform
git pull origin main

# Rebuild and restart
docker compose build
docker compose up -d

# Rebuild frontend
cd apps/web && npm run build
sudo cp -r dist/* /opt/convoy/frontend/dist/
```

## Troubleshooting

### Containers won't start

```bash
docker compose logs -f [service-name]
```

### OSRM unhealthy

The OSRM container uses `wget` for healthchecks (no `curl` in image). If unhealthy:

```bash
docker exec convoy-osrm wget -q -O /dev/null http://localhost:5000/health
```

### PocketBase 403 errors

Ensure collection rules are set correctly. See `docs/pocketbase-setup.md`.

### WebSocket connection failures

Ensure Nginx has WebSocket headers configured:

```
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### WebRTC voice not connecting

Ensure UDP ports 20000-20100 are open and `MEDIASOUP_ANNOUNCED_IP` is set to the server's public IP.
