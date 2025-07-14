#!/bin/bash

# Local build script for testing before publishing
# Usage: ./scripts/local-build.sh

set -e

echo "🔨 Building Glance Server locally..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Build for local architecture only
docker build \
    --file server/Dockerfile \
    --tag glance-server:local \
    server/

echo "✅ Local build complete!"
echo ""
echo "🧪 To test locally:"
echo "   docker run -p 3000:3000 -v \$(pwd)/data:/app/data glance-server:local"
echo ""
echo "🌐 Then visit: http://localhost:3000"