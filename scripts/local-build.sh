#!/bin/bash

# Local build script for testing before publishing
# Usage: ./scripts/local-build.sh

set -e

echo "🔨 Building Glance Server locally..."

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Build for local architecture only
COMMIT_SHA=$(git rev-parse --short HEAD)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
docker build \
    --file server/Dockerfile \
    --build-arg IMAGE_VERSION="$COMMIT_SHA" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --tag glance-server:$COMMIT_SHA \
    server/

echo "✅ Local build complete!"
echo ""
echo "🧪 To test locally:"
echo "   docker run -p 3000:3000 -v \$(pwd)/data:/app/data glance-server:$COMMIT_SHA"
echo ""
echo "🌐 Then visit: http://localhost:3000"