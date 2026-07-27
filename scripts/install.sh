#!/usr/bin/env bash
#
# Convoy Navigation Platform — Interactive Production Installer
# Supports: Ubuntu 22.04+, Debian 12+, macOS (Docker Desktop required)
#
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}    $*"; exit 1; }

# ─── Root check ──────────────────────────────────────────────────────────────
check_root() {
  if [[ "$EUID" -ne 0 ]]; then
    fail "This script must be run as root. Use: sudo ./scripts/install.sh"
  fi
}

# ─── OS detection ────────────────────────────────────────────────────────────
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID="$ID"
    OS_VERSION="$VERSION_ID"
  elif [[ "$(uname)" == "Darwin" ]]; then
    OS_ID="macos"
    OS_VERSION="$(sw_vers -productVersion)"
  else
    fail "Unsupported OS. Use Ubuntu 22.04+ or Debian 12+."
  fi
  info "Detected OS: $OS_ID $OS_VERSION"
}

# ─── Prerequisite installation ───────────────────────────────────────────────
install_prereqs() {
  if [[ "$OS_ID" == "macos" ]]; then
    info "macOS detected — ensure Docker Desktop is running."
    command -v docker >/dev/null 2>&1 || fail "Docker Desktop not found. Install from https://docker.com"
    command -v git    >/dev/null 2>&1 || fail "Git not found. Install via: xcode-select --install"
    ok "Docker and Git found."
    return
  fi

  info "Updating package lists..."
  apt-get update -qq

  # Docker
  if ! command -v docker >/dev/null 2>&1; then
    info "Installing Docker..."
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS_ID/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS_ID $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    ok "Docker installed."
  else
    ok "Docker already installed."
  fi

  # Docker Compose plugin
  if ! docker compose version >/dev/null 2>&1; then
    info "Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
    ok "Docker Compose installed."
  else
    ok "Docker Compose already installed."
  fi

  # Git
  if ! command -v git >/dev/null 2>&1; then
    apt-get install -y -qq git
    ok "Git installed."
  else
    ok "Git already installed."
  fi

  # Nginx
  if ! command -v nginx >/dev/null 2>&1; then
    info "Installing Nginx..."
    apt-get install -y -qq nginx
    systemctl enable nginx
    ok "Nginx installed."
  else
    ok "Nginx already installed."
  fi

  # Certbot
  if ! command -v certbot >/dev/null 2>&1; then
    info "Installing Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
    ok "Certbot installed."
  else
    ok "Certbot already installed."
  fi
}

# ─── Gather configuration ────────────────────────────────────────────────────
gather_config() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Convoy Navigation Platform — Production Setup${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo ""

  # Domain
  while true; do
    read -rp "  Domain name (e.g. convoy.example.com): " DOMAIN
    if [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
      break
    fi
    warn "Invalid domain. Use something like convoy.example.com"
  done

  # Admin email (for SSL)
  while true; do
    read -rp "  Admin email (for SSL certificate): " ADMIN_EMAIL
    if [[ "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
      break
    fi
    warn "Invalid email address."
  done

  # PocketBase admin credentials
  while true; do
    read -rsp "  PocketBase admin email: " PB_ADMIN_EMAIL
    echo ""
    if [[ -n "$PB_ADMIN_EMAIL" ]]; then
      break
    fi
  done

  while true; do
    read -rsp "  PocketBase admin password (min 8 chars): " PB_ADMIN_PASSWORD
    echo ""
    if [[ ${#PB_ADMIN_PASSWORD} -ge 8 ]]; then
      break
    fi
    warn "Password must be at least 8 characters."
  done

  read -rp "  JWT secret (leave empty to auto-generate): " JWT_SECRET
  if [[ -z "$JWT_SECRET" ]]; then
    JWT_SECRET=$(openssl rand -hex 32)
    info "Generated JWT secret."
  fi

  read -rp "  Server public IP (for WebRTC): " SERVER_IP
  if [[ -z "$SERVER_IP" ]]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "127.0.0.1")
    info "Detected public IP: $SERVER_IP"
  fi

  # Cloudflare Tunnel?
  echo ""
  read -rp "  Using Cloudflare Tunnel for SSL? (y/N): " USE_CLOUDFLARE
  USE_CLOUDFLARE="${USE_CLOUDFLARE,,}"

  REDIS_PASSWORD=$(openssl rand -hex 16)
  NOMINATIM_DB_PASSWORD=$(openssl rand -hex 16)

  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "  Domain:            ${GREEN}$DOMAIN${NC}"
  echo -e "  Admin Email:       ${GREEN}$ADMIN_EMAIL${NC}"
  echo -e "  PB Admin:          ${GREEN}$PB_ADMIN_EMAIL${NC}"
  echo -e "  Server IP:         ${GREEN}$SERVER_IP${NC}"
  echo -e "  Cloudflare Tunnel: ${GREEN}$([ "$USE_CLOUDFLARE" = "y" ] && echo "Yes" || echo "No (Let's Encrypt SSL)")${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo ""
  read -rp "  Proceed? (y/N): " CONFIRM
  if [[ "${CONFIRM,,}" != "y" ]]; then
    info "Aborted."
    exit 0
  fi
}

# ─── Clone repo ──────────────────────────────────────────────────────────────
clone_repo() {
  INSTALL_DIR="/opt/convoy"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Repository already exists at $INSTALL_DIR. Pulling latest..."
    cd "$INSTALL_DIR"
    git pull origin main
  else
    info "Cloning repository to $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    git clone https://github.com/ragavellur/convoy-navigation-platform.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
  ok "Repository ready at $INSTALL_DIR"
}

# ─── Generate .env ───────────────────────────────────────────────────────────
generate_env() {
  info "Generating .env file..."

  # Cloudflare terminates SSL at edge — origin serves plain HTTP
  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    API_SCHEME="http"
    WS_SCHEME="ws"
  else
    API_SCHEME="https"
    WS_SCHEME="wss"
  fi

  cat > .env <<EOF
# Convoy Navigation Platform — Production Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# PocketBase
POCKETBASE_PORT=8090
POCKETBASE_ADMIN_EMAIL=$PB_ADMIN_EMAIL
POCKETBASE_ADMIN_PASSWORD=$PB_ADMIN_PASSWORD

# OSRM
OSRM_PORT=5001

# Nominatim
NOMINATIM_PORT=8080
NOMINATIM_DB_PASSWORD=$NOMINATIM_DB_PASSWORD

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# Frontend API URLs (Cloudflare terminates SSL — origin is plain HTTP)
VITE_POCKETBASE_URL=${API_SCHEME}://$DOMAIN/api
VITE_OSRM_URL=${API_SCHEME}://$DOMAIN/routing
VITE_NOMINATIM_URL=${API_SCHEME}://$DOMAIN/geocode

# Map tiles
VITE_MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty

# WebRTC
MEDIASOUP_ANNOUNCED_IP=$SERVER_IP
VOICE_SERVER_URL=${WS_SCHEME}://$DOMAIN/voice

# JWT
JWT_SECRET=$JWT_SECRET

# Simulation
SIMULATION_SERVICE_URL=http://localhost:3002
EOF
  chmod 600 .env
  ok ".env generated."
}

# ─── Build & start Docker services ───────────────────────────────────────────
start_services() {
  info "Building Docker images..."
  docker compose build --parallel 2>&1 | tail -20

  info "Starting backend services..."
  docker compose up -d

  info "Waiting for services to become healthy..."
  local retries=30
  while [[ $retries -gt 0 ]]; do
    if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || \
       docker compose ps 2>/dev/null | grep -q "(healthy)"; then
      break
    fi
    sleep 2
    retries=$((retries - 1))
    echo -n "."
  done
  echo ""

  docker compose ps
  ok "Backend services started."
}

# ─── Setup OSRM data ────────────────────────────────────────────────────────
# Write directly to the Docker volume's host path — bypasses all Docker
# volume abstraction that causes data not to persist between containers.
setup_osrm_data() {
  info "Setting up OSRM routing data..."

  # Stop the crash-looping OSRM container
  docker stop convoy-osrm 2>/dev/null || true

  # Find the actual host path of the Docker volume
  local vol_name
  vol_name=$(docker volume ls --format '{{.Name}}' | grep osrm_data | head -1)
  if [[ -z "$vol_name" ]]; then
    fail "Could not find OSRM Docker volume."
  fi
  local vol_path
  vol_path=$(docker volume inspect "$vol_name" --format '{{.Mountpoint}}')
  info "OSRM volume: $vol_name → $vol_path"

  # Download PBF on the host
  info "Downloading Monaco OSM data..."
  curl -sL -o /tmp/monaco-latest.osm.pbf \
    https://download.geofabrik.de/europe/monaco-latest.osm.pbf \
    || fail "Failed to download OSM data."
  ok "Downloaded $(du -h /tmp/monaco-latest.osm.pbf | cut -f1) PBF file."

  # Copy PBF into volume path directly
  cp /tmp/monaco-latest.osm.pbf "$vol_path/monaco-latest.osm.pbf"
  ok "PBF copied to volume."

  # Process with a temporary container that mounts the volume path directly
  info "Extracting OSRM routing data (may take a few minutes)..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-extract -p /opt/car.lua /data/monaco-latest.osm.pbf 2>&1 | tail -5

  info "Partitioning OSRM data..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-partition /data/monaco-latest.osrm 2>&1 | tail -3

  info "Customizing OSRM data..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-customize /data/monaco-latest.osrm 2>&1 | tail -3

  # Verify data files exist
  if ls "$vol_path"/monaco-latest.osrm.* >/dev/null 2>&1; then
    ok "OSRM data files created: $(ls "$vol_path"/monaco-latest.osrm.* | wc -l) files"
  else
    fail "OSRM data files not found after processing!"
  fi

  # Clean up
  rm -f /tmp/monaco-latest.osm.pbf

  # Start the real OSRM container — data exists, it will boot
  info "Starting OSRM container..."
  docker start convoy-osrm

  info "Waiting for OSRM to become healthy..."
  local retries=30
  while [[ $retries -gt 0 ]]; do
    if docker inspect --format='{{.State.Health.Status}}' convoy-osrm 2>/dev/null | grep -q healthy; then
      break
    fi
    sleep 3
    retries=$((retries - 1))
    echo -n "."
  done
  echo ""

  local status
  status=$(docker inspect --format='{{.State.Health.Status}}' convoy-osrm 2>/dev/null || echo "unknown")
  if [[ "$status" == "healthy" ]]; then
    ok "OSRM data ready and healthy."
  else
    warn "OSRM status: $status — routing may not work for non-Monaco locations."
  fi
}

# ─── Build frontend ──────────────────────────────────────────────────────────
build_frontend() {
  info "Installing frontend dependencies..."
  cd "$INSTALL_DIR/apps/web"
  npm ci --silent 2>&1 | tail -5

  info "Building frontend for production..."
  # Cloudflare terminates SSL — origin serves plain HTTP
  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    FE_API="http://$DOMAIN/api"
    FE_OSRM="http://$DOMAIN/routing"
    FE_GEO="http://$DOMAIN/geocode"
  else
    FE_API="https://$DOMAIN/api"
    FE_OSRM="https://$DOMAIN/routing"
    FE_GEO="https://$DOMAIN/geocode"
  fi
  VITE_POCKETBASE_URL="$FE_API" \
  VITE_OSRM_URL="$FE_OSRM" \
  VITE_NOMINATIM_URL="$FE_GEO" \
  npm run build 2>&1 | tail -10

  info "Copying build to Nginx serving directory..."
  mkdir -p /var/www/convoy
  cp -r dist/* /var/www/convoy/
  ok "Frontend built and deployed."
  cd "$INSTALL_DIR"
}

# ─── Configure Nginx ─────────────────────────────────────────────────────────
configure_nginx() {
  info "Configuring Nginx..."

  # Clean up any previous convoy configs to avoid conflicts
  rm -f /etc/nginx/sites-available/convoy
  rm -f /etc/nginx/sites-available/convoy-temp
  rm -f /etc/nginx/sites-enabled/convoy
  rm -f /etc/nginx/sites-enabled/convoy-temp
  find /etc/nginx/sites-enabled/ -type l -exec sh -c 'readlink "$1" | grep -q convoy && rm -f "$1"' _ {} \; 2>/dev/null || true

  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    # Cloudflare mode: plain HTTP only (SSL terminated at Cloudflare edge)
    cat > /etc/nginx/sites-available/convoy <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 10M;

    location / {
        root /var/www/convoy;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /pb/ {
        proxy_pass http://127.0.0.1:8090/_;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /voice/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    location /routing/ {
        proxy_pass http://127.0.0.1:5001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /geocode/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX
    ln -sf /etc/nginx/sites-available/convoy /etc/nginx/sites-enabled/convoy
  else
    # Direct mode: HTTP→HTTPS redirect + SSL via certbot
    cat > /etc/nginx/sites-available/convoy-temp <<NGINX_TEMP
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        root /var/www/convoy;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /pb/ {
        proxy_pass http://127.0.0.1:8090/_;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /voice/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    location /routing/ {
        proxy_pass http://127.0.0.1:5001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /geocode/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX_TEMP
    ln -sf /etc/nginx/sites-available/convoy-temp /etc/nginx/sites-enabled/convoy
  fi

  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  ok "Nginx configured."
}

# ─── SSL with Let's Encrypt ──────────────────────────────────────────────────
setup_ssl() {
  info "Requesting SSL certificate from Let's Encrypt..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ADMIN_EMAIL" --redirect 2>&1 | tail -10

  # Swap to full SSL config
  ln -sf /etc/nginx/sites-available/convoy /etc/nginx/sites-enabled/convoy
  nginx -t
  systemctl reload nginx

  # Setup auto-renewal
  systemctl enable certbot.timer 2>/dev/null || true
  systemctl start certbot.timer 2>/dev/null || true

  ok "SSL certificate installed and auto-renewal configured."
}

# ─── Create PocketBase admin ─────────────────────────────────────────────────
setup_pocketbase_admin() {
  info "Creating PocketBase admin account..."
  docker exec convoy-pocketbase /pb/pocketbase admin create \
    "$PB_ADMIN_EMAIL" \
    "$PB_ADMIN_PASSWORD" 2>/dev/null || warn "Admin may already exist."
  ok "PocketBase admin configured."
}

# ─── Setup collections ───────────────────────────────────────────────────────
setup_collections() {
  info "Setting up PocketBase collections..."
  if [[ -f scripts/setup-collections.js ]]; then
    node scripts/setup-collections.js 2>/dev/null || warn "Collection setup may need manual intervention."
    ok "Collections configured."
  else
    warn "No setup-collections.js found. Configure collections manually via PocketBase admin UI."
  fi
}

# ─── Configure firewall ──────────────────────────────────────────────────────
configure_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    info "Configuring UFW firewall..."
    ufw --force enable
    ufw allow 80/tcp   comment "HTTP"
    ufw allow 443/tcp  comment "HTTPS"
    ufw allow 22/tcp   comment "SSH"
    ufw allow 8090/tcp comment "PocketBase admin"
    ufw allow 20000:20100/udp comment "WebRTC voice"
    ok "Firewall configured."
  else
    warn "UFW not found. Configure firewall manually."
  fi
}

# ─── Summary ─────────────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Installation Complete!${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo ""
  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    echo -e "  App URL:         ${CYAN}https://$DOMAIN${NC}"
    echo -e "  Admin UI:        ${CYAN}https://$DOMAIN/pb/${NC}"
    echo -e "  PocketBase API:  ${CYAN}https://$DOMAIN/api/${NC}"
    echo ""
    echo -e "  ${YELLOW}Cloudflare Tunnel — Update your config:${NC}"
    echo -e "  File: /etc/cloudflared/config.yml"
    echo ""
    echo -e "    ingress:"
    echo -e "      - hostname: ${GREEN}$DOMAIN${NC}"
    echo -e "        service: ${GREEN}http://localhost:80${NC}"
    echo -e "      - service: http_status:404"
    echo ""
    echo -e "  Then run:"
    echo -e "    ${CYAN}sudo systemctl restart cloudflared${NC}"
  else
    echo -e "  App URL:         ${CYAN}https://$DOMAIN${NC}"
    echo -e "  Admin UI:        ${CYAN}https://$DOMAIN/pb/${NC}"
    echo -e "  PocketBase API:  ${CYAN}https://$DOMAIN/api/${NC}"
  fi
  echo ""
  echo -e "  PocketBase Admin: ${YELLOW}$PB_ADMIN_EMAIL${NC}"
  echo ""
  echo -e "  ${YELLOW}Next steps:${NC}"
  echo -e "  1. Open https://$DOMAIN/pb/ and create collections (see docs/pocketbase-setup.md)"
  echo -e "  2. Create your first user account at https://$DOMAIN/"
  echo -e "  3. Create a convoy and start navigating!"
  echo ""
  echo -e "  ${YELLOW}Useful commands:${NC}"
  echo -e "  cd $INSTALL_DIR"
  echo -e "  docker compose ps          # Service status"
  echo -e "  docker compose logs -f     # Live logs"
  echo -e "  docker compose restart     # Restart all"
  echo -e "  docker compose down        # Stop all"
  echo -e "  docker compose up -d       # Start all"
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  check_root
  detect_os
  install_prereqs
  gather_config
  clone_repo
  generate_env
  start_services
  setup_osrm_data
  build_frontend
  configure_nginx
  if [[ "$USE_CLOUDFLARE" != "y" ]]; then
    setup_ssl
  fi
  setup_pocketbase_admin
  setup_collections
  configure_firewall
  print_summary
}

main "$@"
