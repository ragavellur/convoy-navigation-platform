#!/bin/bash
set -e

echo "=== OSRM Data Setup for Monaco ==="
echo "Downloading Monaco OSM data..."

WORK_DIR="/tmp/osrm-setup"
mkdir -p "$WORK_DIR"

# Download Monaco OSM PBF
curl -L -o "$WORK_DIR/monaco-latest.osm.pbf" \
  "https://download.geofabrik.de/europe/monaco-latest.osm.pbf"

echo "Extracting OSRM data..."
docker run --rm \
  -v "$WORK_DIR:/data" \
  osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/monaco-latest.osm.pbf

echo "Partitioning OSRM data..."
docker run --rm \
  -v "$WORK_DIR:/data" \
  osrm/osrm-backend:latest \
  osrm-partition /data/monaco-latest.osrm

echo "Customizing OSRM data..."
docker run --rm \
  -v "$WORK_DIR:/data" \
  osrm/osrm-backend:latest \
  osrm-customize /data/monaco-latest.osrm

echo "Copying processed data to Docker volume..."
docker run --rm \
  -v "$WORK_DIR:/data" \
  -v "osrm_data:/dest" \
  alpine:latest \
  sh -c "cp /data/monaco-latest.osrm* /dest/ && chmod -R 755 /dest/"

echo "Restarting OSRM container..."
docker restart convoy-osrm

echo "Waiting for OSRM to start..."
sleep 5

echo "Testing OSRM health..."
for i in {1..10}; do
  if curl -sf http://localhost:5001/health > /dev/null 2>&1; then
    echo "OSRM is healthy!"
    echo ""
    echo "Testing route calculation..."
    curl -s "http://localhost:5001/route/v1/driving/7.426559,43.7402961;7.4191482,43.7370711?overview=full&geometries=geojson&steps=true" | python3 -m json.tool | head -20
    echo ""
    echo "=== OSRM setup complete! ==="
    exit 0
  fi
  echo "Waiting... ($i/10)"
  sleep 3
done

echo "ERROR: OSRM failed to start. Check logs with: docker logs convoy-osrm"
exit 1
