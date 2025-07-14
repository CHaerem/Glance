#!/bin/bash

# Deploy Glance Server to Raspberry Pi using published Docker image
# Usage: ./deploy-to-pi.sh [pi-hostname-or-ip] [docker-username]

set -e

PI_HOST=${1:-"ServerPi.local"}
DOCKER_USERNAME=${2:-"your-username"}

echo "🥧 Deploying Glance Server to Raspberry Pi at ${PI_HOST}"

# Create deployment directory on Pi
echo "📁 Creating deployment directory..."
ssh pi@${PI_HOST} "mkdir -p ~/glance"

# Copy necessary files
echo "📋 Copying configuration files..."
scp docker-compose.prod.yml pi@${PI_HOST}:~/glance/docker-compose.yml
scp README-SERVER.md pi@${PI_HOST}:~/glance/

# Update the docker-compose file with the correct username
ssh pi@${PI_HOST} "sed -i 's/your-username/${DOCKER_USERNAME}/g' ~/glance/docker-compose.yml"

# Deploy and start the service
echo "🚀 Starting Glance Server on Pi..."
ssh pi@${PI_HOST} "cd ~/glance && docker-compose pull && docker-compose up -d"

# Get Pi IP for reference
PI_IP=$(ssh pi@${PI_HOST} "hostname -I | awk '{print \$1}'")

echo "✅ Deployment complete!"
echo ""
echo "🌐 Web interface: http://${PI_IP}:3000"
echo "📡 ESP32 API: http://${PI_IP}:3000/api/current.json"
echo ""
echo "📊 To check status:"
echo "   ssh pi@${PI_HOST} 'cd ~/glance && docker-compose logs -f'"
echo ""
echo "🔧 ESP32 is already configured to use ServerPi.local hostname"
echo "   If you need to change it, update config.h:"
echo "   #define API_BASE_URL \"http://ServerPi.local:3000/api/\""
echo "   #define STATUS_URL \"http://ServerPi.local:3000/api/device-status\""