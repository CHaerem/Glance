#!/bin/bash

# Monitor automatic updates and container status

echo "🔍 Glance Server Auto-Update Status"
echo "=================================="

cd ~/glance

# Container status
echo "📊 Container Status:"
docker compose ps
echo

# Watchtower logs (last 50 lines)
echo "🤖 Watchtower Activity (last 50 lines):"
docker compose logs --tail=50 watchtower | grep -E "(Found new|Updating|Successfully updated|No updates|Skipping)" || echo "No recent update activity"
echo

# Current image info
echo "🏷️  Current Images:"
docker images | grep -E "(REPOSITORY|chaerem/glance-server)"
echo

# Health check status
echo "❤️  Health Status:"
docker inspect glance-server --format='{{.State.Health.Status}}' 2>/dev/null || echo "No health check data"

# Last container restart time
echo "🕐 Last Restart:"
docker inspect glance-server --format='{{.State.StartedAt}}' 2>/dev/null | cut -d'T' -f1-2 | tr 'T' ' ' || echo "Cannot determine restart time"

echo
echo "💡 Commands:"
echo "   ./update-glance.sh       - Force manual update"
echo "   docker compose logs -f   - Follow live logs"
echo "   docker compose logs -f watchtower - Follow Watchtower logs"