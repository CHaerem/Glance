#!/bin/bash

# Manual update script for Glance Server
# This script forces an immediate update check

set -e

cd ~/glance

echo "🚀 Manually updating Glance Server..."

# Pull latest image
echo "📥 Pulling latest image..."
docker compose pull glance-server

# Restart with new image
echo "🔄 Restarting container..."
docker compose up -d glance-server

# Show status
echo "📊 Container status:"
docker compose ps

# Show logs
echo "📋 Recent logs:"
docker compose logs --tail=20 glance-server

echo "✅ Manual update complete!"

# Get container info
CONTAINER_ID=$(docker ps --filter "name=glance-server" --format "table {{.ID}}")
if [ ! -z "$CONTAINER_ID" ]; then
    echo "🏃 Container ID: $CONTAINER_ID"
    echo "🌐 Web interface: http://$(hostname -I | awk '{print $1}'):3000"
fi