#!/usr/bin/env bash
#
# Convoy Navigation Platform — Interactive Production Installer
# Supports: Ubuntu 22.04+, Debian 12+, macOS (Docker Desktop required)
# Fully automated: cleanup → install → configure → verify
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}    $*"; exit 1; }

INSTALL_DIR="/opt/convoy"

# ─── Root check ──────────────────────────────────────────────────────────────
check_root() {
  [[ "$EUID" -eq 0 ]] || fail "Run as root: sudo ./scripts/install.sh"
}

# ─── OS detection ────────────────────────────────────────────────────────────
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release; OS_ID="$ID"; OS_VERSION="$VERSION_ID"
  elif [[ "$(uname)" == "Darwin" ]]; then
    OS_ID="macos"; OS_VERSION="$(sw_vers -productVersion)"
  else
    fail "Unsupported OS. Use Ubuntu 22.04+ or Debian 12+."
  fi
  info "Detected OS: $OS_ID $OS_VERSION"
}

# ─── Cleanup previous installation ───────────────────────────────────────────
cleanup_previous() {
  info "Cleaning up any previous installation..."

  # Docker containers
  docker rm -f convoy-osrm convoy-pocketbase convoy-nominatim convoy-redis \
    convoy-simulation convoy-voice 2>/dev/null || true

  # Docker compose down (if old install exists)
  if [[ -d "$INSTALL_DIR" ]]; then
    cd "$INSTALL_DIR"
    docker compose down -v --remove-orphans 2>/dev/null || true
    cd /
  fi

  # Docker volumes (all matching convoy*)
  docker volume ls --format '{{.Name}}' | grep -E '^convoy' | xargs -r docker volume rm 2>/dev/null || true

  # Docker network
  docker network ls --format '{{.Name}}' | grep -E '^convoy' | xargs -r docker network rm 2>/dev/null || true

  # Nginx configs
  rm -f /etc/nginx/sites-available/convoy /etc/nginx/sites-available/convoy-temp
  rm -f /etc/nginx/sites-enabled/convoy /etc/nginx/sites-enabled/convoy-temp
  find /etc/nginx/sites-enabled/ -type l -exec sh -c 'readlink "$1" 2>/dev/null | grep -q convoy && rm -f "$1"' _ {} \; 2>/dev/null || true

  # Frontend build
  rm -rf /var/www/convoy

  # Project directory
  rm -rf "$INSTALL_DIR"

  # Temp files
  rm -f /tmp/monaco-latest.osm.pbf

  ok "Previous installation cleaned up."
}

# ─── Prerequisite installation ───────────────────────────────────────────────
install_prereqs() {
  if [[ "$OS_ID" == "macos" ]]; then
    command -v docker >/dev/null 2>&1 || fail "Docker Desktop not found"
    command -v git    >/dev/null 2>&1 || fail "Git not found"
    ok "Docker and Git found."
    return
  fi

  info "Updating package lists..."
  apt-get update -qq

  if ! command -v docker >/dev/null 2>&1; then
    info "Installing Docker..."
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS_ID $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    ok "Docker installed."
  else
    ok "Docker already installed."
  fi

  docker compose version >/dev/null 2>&1 || { apt-get install -y -qq docker-compose-plugin 2>/dev/null; }
  command -v git >/dev/null 2>&1 || apt-get install -y -qq git
  if ! command -v nginx >/dev/null 2>&1; then
    apt-get install -y -qq nginx && systemctl enable nginx
  fi
  if [[ "$USE_CLOUDFLARE" != "y" ]] && ! command -v certbot >/dev/null 2>&1; then
    apt-get install -y -qq certbot python3-certbot-nginx
  fi

  # Node.js 20+ required (mediasoup uses import attributes)
  local node_version
  if command -v node >/dev/null 2>&1; then
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
  else
    node_version=0
  fi
  if [[ "$node_version" -lt 20 ]]; then
    info "Installing Node.js 22 LTS (required by mediasoup)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
    ok "Node.js $(node -v) installed."
  else
    ok "Node.js $(node -v) found."
  fi

  # python3 and python3-requests for setup-collections.py
  command -v python3 >/dev/null 2>&1 || apt-get install -y -qq python3
  pip3 install requests python-dotenv 2>/dev/null || true

  ok "Prerequisites ready."
}

# ─── Gather configuration ────────────────────────────────────────────────────
gather_config() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Convoy Navigation Platform — Production Setup${NC}"
  echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
  echo ""

  while true; do
    read -rp "  Domain name (e.g. convoy.example.com): " DOMAIN
    [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] && break
    warn "Invalid domain."
  done

  while true; do
    read -rp "  Confirm domain [$DOMAIN]: " DOMAIN_CONFIRM
    DOMAIN_CONFIRM="${DOMAIN_CONFIRM:-$DOMAIN}"
    [[ "$DOMAIN_CONFIRM" == "$DOMAIN" ]] && break
    warn "Domain mismatch. Try again."
  done

  while true; do
    read -rp "  Admin email (for SSL certificate): " ADMIN_EMAIL
    [[ "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] && break
    warn "Invalid email."
  done

  while true; do
    read -rsp "  PocketBase admin email: " PB_ADMIN_EMAIL; echo ""
    [[ -n "$PB_ADMIN_EMAIL" ]] && break
  done

  while true; do
    read -rsp "  PocketBase admin password (min 8 chars): " PB_ADMIN_PASSWORD; echo ""
    [[ ${#PB_ADMIN_PASSWORD} -ge 8 ]] && break
    warn "Password must be at least 8 characters."
  done

  read -rp "  JWT secret (leave empty to auto-generate): " JWT_SECRET
  [[ -z "$JWT_SECRET" ]] && JWT_SECRET=$(openssl rand -hex 32) && info "Generated JWT secret."

  read -rp "  Server public IP (for WebRTC, leave empty to detect): " SERVER_IP
  if [[ -z "$SERVER_IP" ]]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "127.0.0.1")
    info "Detected public IP: $SERVER_IP"
  fi

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
  [[ "${CONFIRM,,}" == "y" ]] || { info "Aborted."; exit 0; }
}

# ─── Clone repo ──────────────────────────────────────────────────────────────
clone_repo() {
  info "Cloning repository..."
  git clone https://github.com/ragavellur/convoy-navigation-platform.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Repository ready at $INSTALL_DIR"
}

# ─── Generate .env ───────────────────────────────────────────────────────────
generate_env() {
  info "Generating .env file..."
  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    API_SCHEME="http"; WS_SCHEME="ws"
  else
    API_SCHEME="https"; WS_SCHEME="wss"
  fi
  cat > .env <<EOF
# Convoy Navigation Platform — Production Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
POCKETBASE_PORT=8090
POCKETBASE_ADMIN_EMAIL=$PB_ADMIN_EMAIL
POCKETBASE_ADMIN_PASSWORD=$PB_ADMIN_PASSWORD
OSRM_PORT=5001
NOMINATIM_PORT=8080
NOMINATIM_DB_PASSWORD=$NOMINATIM_DB_PASSWORD
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
VITE_POCKETBASE_URL=${API_SCHEME}://$DOMAIN
VITE_OSRM_URL=${API_SCHEME}://$DOMAIN/routing
VITE_NOMINATIM_URL=${API_SCHEME}://$DOMAIN/geocode
VITE_MAP_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
MEDIASOUP_ANNOUNCED_IP=$SERVER_IP
VOICE_SERVER_URL=${WS_SCHEME}://$DOMAIN/voice
JWT_SECRET=$JWT_SECRET
SIMULATION_SERVICE_URL=http://localhost:3002
EOF
  chmod 600 .env
  ok ".env generated."
}

# ─── Build & start Docker services ───────────────────────────────────────────
start_services() {
  info "Building Docker images..."
  docker compose build --parallel 2>&1 | tail -5
  info "Starting backend services..."
  docker compose up -d
  sleep 5
  docker compose ps
  ok "Backend services started."
}

# ─── Setup OSRM data ────────────────────────────────────────────────────────
setup_osrm_data() {
  info "Setting up OSRM routing data..."
  docker stop convoy-osrm 2>/dev/null || true

  local vol_name vol_path
  vol_name=$(docker volume ls --format '{{.Name}}' | grep osrm_data | head -1)
  [[ -z "$vol_name" ]] && fail "Could not find OSRM Docker volume."
  vol_path=$(docker volume inspect "$vol_name" --format '{{.Mountpoint}}')
  info "Volume: $vol_name → $vol_path"

  info "Downloading Monaco OSM data..."
  curl -sL -o /tmp/monaco-latest.osm.pbf \
    https://download.geofabrik.de/europe/monaco-latest.osm.pbf \
    || fail "Failed to download OSM data."

  cp /tmp/monaco-latest.osm.pbf "$vol_path/monaco-latest.osm.pbf"

  info "Extracting OSRM data (may take a minute)..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-extract -p /opt/car.lua /data/monaco-latest.osm.pbf 2>&1 | tail -3

  info "Partitioning..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-partition /data/monaco-latest.osrm 2>&1 | tail -2

  info "Customizing..."
  docker run --rm -v "$vol_path:/data" osrm/osrm-backend:latest \
    osrm-customize /data/monaco-latest.osrm 2>&1 | tail -2

  rm -f /tmp/monaco-latest.osm.pbf

  local file_count
  file_count=$(ls "$vol_path"/monaco-latest.osrm.* 2>/dev/null | wc -l)
  [[ "$file_count" -gt 0 ]] || fail "OSRM data files not found after processing!"
  ok "OSRM data ready ($file_count files)."

  docker start convoy-osrm
  info "Waiting for OSRM health..."
  local retries=20
  while [[ $retries -gt 0 ]]; do
    docker inspect --format='{{.State.Health.Status}}' convoy-osrm 2>/dev/null | grep -q healthy && break
    sleep 2; retries=$((retries - 1)); echo -n "."
  done
  echo ""
  ok "OSRM healthy."
}

# ─── Build frontend ──────────────────────────────────────────────────────────
build_frontend() {
  info "Installing frontend dependencies..."
  cd "$INSTALL_DIR"
  npm install --legacy-peer-deps 2>&1 | tail -5

  info "Building frontend for production..."
  cd "$INSTALL_DIR/apps/web"
  FE_API="${API_SCHEME}://$DOMAIN"; FE_OSRM="${API_SCHEME}://$DOMAIN/routing"; FE_GEO="${API_SCHEME}://$DOMAIN/geocode"
  VITE_POCKETBASE_URL="$FE_API" VITE_OSRM_URL="$FE_OSRM" VITE_NOMINATIM_URL="$FE_GEO" \
    npm run build 2>&1 | tail -5

  mkdir -p /var/www/convoy
  cp -r dist/* /var/www/convoy/
  [[ -f /var/www/convoy/index.html ]] || fail "Frontend build failed — index.html not found."
  ok "Frontend built and deployed."
  cd "$INSTALL_DIR"
}

# ─── Configure Nginx ─────────────────────────────────────────────────────────
configure_nginx() {
  info "Configuring Nginx..."

  rm -f /etc/nginx/sites-available/convoy /etc/nginx/sites-available/convoy-temp
  rm -f /etc/nginx/sites-enabled/convoy /etc/nginx/sites-enabled/convoy-temp
  rm -f /etc/nginx/sites-enabled/default

  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
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
  else
    cat > /etc/nginx/sites-available/convoy-temp <<NGINX_TEMP
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
NGINX_TEMP
    ln -sf /etc/nginx/sites-available/convoy-temp /etc/nginx/sites-enabled/convoy
  fi

  [[ "$USE_CLOUDFLARE" == "y" ]] && ln -sf /etc/nginx/sites-available/convoy /etc/nginx/sites-enabled/convoy

  nginx -t || fail "Nginx config test failed."
  systemctl restart nginx
  ok "Nginx configured."
}

# ─── SSL with Let's Encrypt ──────────────────────────────────────────────────
setup_ssl() {
  info "Requesting SSL certificate from Let's Encrypt..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ADMIN_EMAIL" --redirect 2>&1 | tail -5
  ln -sf /etc/nginx/sites-available/convoy /etc/nginx/sites-enabled/convoy
  nginx -t && systemctl reload nginx
  systemctl enable certbot.timer 2>/dev/null || true
  systemctl start certbot.timer 2>/dev/null || true
  ok "SSL configured."
}

# ─── Create PocketBase admin ─────────────────────────────────────────────────
setup_pocketbase_admin() {
  info "Creating PocketBase admin account..."
  docker exec convoy-pocketbase /pb/pocketbase admin create \
    "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" 2>/dev/null || warn "Admin may already exist."
  ok "PocketBase admin configured."
}

# ─── Setup collections ───────────────────────────────────────────────────────
setup_collections() {
  info "Setting up PocketBase collections..."
  cd "$INSTALL_DIR"
  if [[ -f scripts/setup-collections.sh ]]; then
    chmod +x scripts/setup-collections.sh
    ENV_FILE=".env" bash scripts/setup-collections.sh 2>&1 || warn "Collection setup may need manual intervention."
    ok "Collections configured."
  elif [[ -f scripts/setup-collections.py ]]; then
    cd "$INSTALL_DIR"
    ENV_FILE=".env" python3 scripts/setup-collections.py 2>&1 || warn "Collection setup may need manual intervention."
    ok "Collections configured."
  else
    warn "No setup-collections script found. Configure collections manually via PocketBase admin UI."
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
  fi
}

# ─── Verify installation ────────────────────────────────────────────────────
verify_install() {
  info "Verifying installation..."
  local errors=0

  # PocketBase
  if curl -sf http://localhost:8090/api/health >/dev/null 2>&1; then
    ok "PocketBase API: healthy"
  else
    warn "PocketBase API: not responding"; errors=$((errors + 1))
  fi

  # OSRM
  if docker inspect --format='{{.State.Health.Status}}' convoy-osrm 2>/dev/null | grep -q healthy; then
    ok "OSRM: healthy"
  else
    warn "OSRM: not healthy"; errors=$((errors + 1))
  fi

  # Nginx
  if curl -sf -o /dev/null http://localhost/ 2>&1; then
    ok "Nginx: serving"
  else
    warn "Nginx: not serving"; errors=$((errors + 1))
  fi

  # Frontend
  if [[ -f /var/www/convoy/index.html ]]; then
    ok "Frontend: deployed"
  else
    warn "Frontend: not deployed"; errors=$((errors + 1))
  fi

  if [[ $errors -gt 0 ]]; then
    warn "$errors verification checks failed — check logs above."
  else
    ok "All verification checks passed."
  fi
}

# ─── Summary ─────────────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Installation Complete!${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  App URL:         ${CYAN}https://$DOMAIN${NC}"
  echo -e "  Admin UI:        ${CYAN}https://$DOMAIN/pb/${NC}"
  echo -e "  PocketBase API:  ${CYAN}https://$DOMAIN/api/${NC}"
  echo ""
  echo -e "  PocketBase Admin: ${YELLOW}$PB_ADMIN_EMAIL${NC}"
  echo ""
  if [[ "$USE_CLOUDFLARE" == "y" ]]; then
    echo -e "  ${YELLOW}Cloudflare Tunnel config (/etc/cloudflared/config.yml):${NC}"
    echo ""
    echo -e "    ingress:"
    echo -e "      - hostname: ${GREEN}$DOMAIN${NC}"
    echo -e "        service: ${GREEN}http://localhost:80${NC}"
    echo -e "      - service: http_status:404"
    echo ""
    echo -e "  Then run: ${CYAN}sudo systemctl restart cloudflared${NC}"
    echo ""
  fi
  echo -e "  ${YELLOW}Useful commands:${NC}"
  echo -e "  cd $INSTALL_DIR && docker compose ps"
  echo -e "  cd $INSTALL_DIR && docker compose logs -f"
  echo -e "  sudo ./scripts/uninstall.sh    # Clean uninstall"
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  check_root
  detect_os
  gather_config
  cleanup_previous
  install_prereqs
  clone_repo
  generate_env
  start_services
  setup_osrm_data
  build_frontend
  configure_nginx
  [[ "$USE_CLOUDFLARE" != "y" ]] && setup_ssl
  setup_pocketbase_admin
  setup_collections
  configure_firewall
  verify_install
  print_summary
}

main "$@"
