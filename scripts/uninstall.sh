#!/usr/bin/env bash
#
# Convoy Navigation Platform — Uninstall Script
# Stops containers, removes data, cleans up nginx/SSL/frontend/Docker
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }

echo -e "${RED}══════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}  Convoy Navigation Platform — Uninstall${NC}"
echo -e "${RED}══════════════════════════════════════════════════════════════${NC}"
echo ""
read -rp "  This will REMOVE all Convoy data. Are you sure? (y/N): " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""

# Step 1: Stop and remove Docker containers + volumes + network
info "Stopping Docker containers and removing volumes..."
if [[ -d /opt/convoy ]]; then
  cd /opt/convoy
  docker compose down -v --remove-orphans 2>/dev/null || true
  cd /
fi

# Also remove any leftover convoy containers
docker rm -f convoy-osrm convoy-pocketbase convoy-nominatim convoy-redis \
  convoy-simulation convoy-voice 2>/dev/null || true

# Also remove any leftover convoy containers/volumes by pattern (catches all naming conventions)
docker volume ls --format '{{.Name}}' | grep -E 'convoy' | xargs -r docker volume rm 2>/dev/null || true
docker network ls --format '{{.Name}}' | grep -E 'convoy' | xargs -r docker network rm 2>/dev/null || true

# Prune any dangling images
docker image prune -f 2>/dev/null || true

ok "Docker cleanup done."

# Step 2: Remove project files
if [[ -d /opt/convoy ]]; then
  info "Removing /opt/convoy..."
  rm -rf /opt/convoy
  ok "Project files removed."
fi

# Step 3: Remove ALL Nginx convoy configs
info "Cleaning up Nginx configuration..."
rm -f /etc/nginx/sites-available/convoy
rm -f /etc/nginx/sites-available/convoy-temp
rm -f /etc/nginx/sites-enabled/convoy
rm -f /etc/nginx/sites-enabled/convoy-temp
# Also remove any symlink that might reference convoy
find /etc/nginx/sites-enabled/ -type l -exec sh -c 'readlink "$1" | grep -q convoy && rm -f "$1"' _ {} \; 2>/dev/null || true

# Test and restart nginx
if nginx -t 2>/dev/null; then
  systemctl restart nginx 2>/dev/null || true
  ok "Nginx cleaned and restarted."
else
  warn "Nginx config test failed — restoring default..."
  # Restore a minimal default config
  cat > /etc/nginx/sites-available/default <<'DEFAULT'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
DEFAULT
  ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-enabled/convoy /etc/nginx/sites-enabled/convoy-temp
  nginx -t 2>/dev/null && systemctl restart nginx 2>/dev/null || true
  warn "Nginx reset to defaults."
fi

# Step 4: Remove SSL certificates
if command -v certbot >/dev/null 2>&1; then
  info "Removing SSL certificates..."
  # Delete any cert matching convoy
  for cert in $(certbot certificates 2>/dev/null | grep -oP 'Certificate Name: \K.*' | grep -i convoy); do
    certbot delete --cert-name "$cert" --non-interactive 2>/dev/null || true
  done
  # Also try common names
  certbot delete --cert-name convoy.vellur.in --non-interactive 2>/dev/null || true
  certbot delete --cert-name convoy.vallue.in --non-interactive 2>/dev/null || true
  ok "SSL cleanup done."
fi

# Step 5: Remove frontend build
if [[ -d /var/www/convoy ]]; then
  info "Removing frontend build at /var/www/convoy..."
  rm -rf /var/www/convoy
  ok "Frontend removed."
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Uninstall Complete${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Removed:"
echo -e "    - Docker containers, volumes, and network"
echo -e "    - /opt/convoy (project files)"
echo -e "    - All Nginx convoy configs"
echo -e "    - SSL certificates"
echo -e "    - /var/www/convoy (frontend build)"
echo ""
echo -e "  To reinstall:"
echo -e "    sudo ./scripts/install.sh"
echo ""
