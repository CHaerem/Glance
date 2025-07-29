#!/bin/bash

# Deploy Glance Server to Raspberry Pi using published Docker image
# Usage: ./deploy-to-pi.sh [pi-hostname-or-ip] [docker-username]

set -e

PI_HOST=${1:-"serverpi.local"}
DOCKER_USERNAME=${2:-"chaerem"}

# Get the current git commit for version info
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
export IMAGE_VERSION=$GIT_COMMIT

echo "🥧 Deploying Glance Server to Raspberry Pi at ${PI_HOST}"
echo "📦 Using image version: ${IMAGE_VERSION}"

# Create deployment directory on Pi
echo "📁 Creating deployment directory..."
ssh chris@${PI_HOST} "mkdir -p ~/glance"

# Copy necessary files
echo "📋 Copying configuration files..."
scp docker-compose.prod.yml chris@${PI_HOST}:~/glance/docker-compose.yml

# Update the docker-compose file with the correct username (if needed)
ssh chris@${PI_HOST} "sed -i 's/your-username/${DOCKER_USERNAME}/g' ~/glance/docker-compose.yml"

# Copy helper scripts
echo "📋 Copying management scripts..."
scp scripts/update-glance.sh chris@${PI_HOST}:~/glance/ 2>/dev/null || echo "Note: update-glance.sh not found locally"
scp scripts/monitor-updates.sh chris@${PI_HOST}:~/glance/ 2>/dev/null || echo "Note: monitor-updates.sh not found locally"
ssh chris@${PI_HOST} "chmod +x ~/glance/*.sh" 2>/dev/null || true

# Deploy and start the service
echo "🚀 Starting Glance Server with auto-updates on Pi..."
ssh chris@${PI_HOST} "cd ~/glance && IMAGE_VERSION=${IMAGE_VERSION} docker compose pull && IMAGE_VERSION=${IMAGE_VERSION} docker compose up -d"

# Get Pi IP for reference
PI_IP=$(ssh chris@${PI_HOST} "hostname -I | awk '{print \$1}'")

echo "✅ Deployment complete!"
echo ""
echo "🌐 Web interface: http://${PI_IP}:3000"
echo "📡 ESP32 API: http://${PI_IP}:3000/api/current.json"
echo ""
echo "🤖 Auto-updates enabled! Watchtower checks for new images every 5 minutes"
echo ""
echo "📊 Management commands:"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && ./monitor-updates.sh'  # Check update status"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && ./update-glance.sh'    # Force manual update"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && docker compose logs -f' # View logs"
echo ""
echo "🔧 ESP32 is configured to use serverpi.local hostname"
echo "   If you need to change it, update config.h:"
echo "   #define API_BASE_URL \"http://serverpi.local:3000/api/\""
echo "   #define STATUS_URL \"http://serverpi.local:3000/api/device-status\""