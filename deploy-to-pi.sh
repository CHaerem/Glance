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

# Deploy and start the service
echo "🚀 Starting Glance Server on Pi..."
ssh chris@${PI_HOST} "cd ~/glance && IMAGE_VERSION=${IMAGE_VERSION} docker compose pull && IMAGE_VERSION=${IMAGE_VERSION} docker compose up -d"

# Get Pi IP for reference
PI_IP=$(ssh chris@${PI_HOST} "hostname -I | awk '{print \$1}'")

echo "✅ Deployment complete!"
echo ""
echo "🌐 Web interface: http://${PI_IP}:3000"
echo "📡 ESP32 API: http://${PI_IP}:3000/api/current.json"
echo ""
echo "🚀 Deployed image version: ${IMAGE_VERSION}"
echo "🔄 Auto-deployment: GitHub Actions will deploy new versions automatically on push to main"
echo ""
echo "📊 Management commands:"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && docker compose logs -f'          # View logs"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && docker compose ps'               # Check status"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && docker compose restart'          # Restart services"
echo "   ssh chris@${PI_HOST} 'cd ~/glance && docker compose pull && docker compose up -d'  # Manual update"
echo ""
echo "🔧 ESP32 is configured to use serverpi.local hostname"
echo "   If you need to change it, update config.h:"
echo "   #define API_BASE_URL \"http://serverpi.local:3000/api/\""
echo "   #define STATUS_URL \"http://serverpi.local:3000/api/device-status\""