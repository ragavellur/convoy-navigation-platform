#!/usr/bin/env bash
#
# Convoy Navigation Platform — Uninstall Script
# Stops containers, removes data, cleans up nginx/SSL/frontend
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

# Step 1: Stop and remove Docker containers + volumes
if [[ -d /opt/convoy ]]; then
  info "Stopping Docker containers and removing volumes..."
  cd /opt/convoy
  docker compose down -v 2>/dev/null || true
  cd /
  ok "Docker containers stopped and volumes removed."
else
  warn "/opt/convoy not found — skipping Docker cleanup."
fi

# Step 2: Remove project files
if [[ -d /opt/convoy ]]; then
  info "Removing /opt/convoy..."
  rm -rf /opt/convoy
  ok "Project files removed."
fi

# Step 3: Remove Nginx config
info "Cleaning up Nginx configuration..."
rm -f /etc/nginx/sites-available/convoy
rm -f /etc/nginx/sites-available/convoy-temp
rm -f /etc/nginx/sites-enabled/convoy
rm -f /etc/nginx/sites-enabled/convoy-temp
if nginx -t 2>/dev/null; then
  systemctl restart nginx 2>/dev/null || true
  ok "Nginx cleaned and restarted."
else
  warn "Nginx config test failed — you may need to fix manually."
  systemctl restart nginx 2>/dev/null || true
fi

# Step 4: Remove SSL certificates
if command -v certbot >/dev/null 2>&1; then
  info "Removing SSL certificates..."
  certbot delete --cert-name convoy.vellur.in --non-interactive 2>/dev/null || warn "No SSL cert found."
  ok "SSL cleanup done."
fi

# Step 5: Remove frontend build
if [[ -d /var/www/convoy ]]; then
  info "Removing frontend build at /var/www/convoy..."
  rm -rf /var/www/convoy
  ok "Frontend removed."
fi

# Step 6: Remove Docker images (optional)
read -rp "  Remove Docker images too? (y/N): " REMOVE_IMAGES
if [[ "${REMOVE_IMAGES,,}" == "y" ]]; then
  info "Removing Docker images..."
  docker rmi convoy-pocketbase convoy-simulation-service convoy-voice-server 2>/dev/null || true
  ok "Docker images removed."
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Uninstall Complete${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Removed:"
echo -e "    - Docker containers and volumes"
echo -e "    - /opt/convoy (project files)"
echo -e "    - Nginx config"
echo -e "    - SSL certificates"
echo -e "    - /var/www/convoy (frontend build)"
echo ""
echo -e "  To reinstall:"
echo -e "    git clone https://github.com/ragavellur/convoy-navigation-platform.git /opt/convoy"
echo -e "    cd /opt/convoy && sudo ./scripts/install.sh"
echo ""
