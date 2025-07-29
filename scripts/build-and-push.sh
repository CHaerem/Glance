#!/bin/bash

# Build and push multi-architecture Docker image for Glance Server
# Usage: ./scripts/build-and-push.sh [your-dockerhub-username]

set -e

# Configuration
DOCKER_USERNAME=${1:-"your-username"}
IMAGE_NAME="glance-server"
VERSION="1.0.0"
LATEST_TAG="latest"

# Full image names
FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}"

echo "🐳 Building and pushing ${FULL_IMAGE_NAME}"

# Ensure we're in the right directory
cd "$(dirname "$0")/.."

# Enable Docker BuildKit and multi-platform builds
export DOCKER_BUILDKIT=1

# Create a new builder instance if it doesn't exist
if ! docker buildx ls | grep -q "glance-builder"; then
    echo "📦 Creating Docker buildx instance..."
    docker buildx create --name glance-builder --use
    docker buildx inspect --bootstrap
fi

# Use the builder
docker buildx use glance-builder

echo "🔨 Building multi-architecture image..."

GIT_COMMIT=$(git rev-parse --short HEAD)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build and push for multiple architectures
docker buildx build \
    --platform linux/amd64,linux/arm64,linux/arm/v7 \
    --file server/Dockerfile \
    --context server \
    --build-arg IMAGE_VERSION="$GIT_COMMIT" \
    --build-arg BUILD_DATE="$BUILD_DATE" \
    --tag "${FULL_IMAGE_NAME}:${VERSION}" \
    --tag "${FULL_IMAGE_NAME}:${GIT_COMMIT}" \
    --tag "${FULL_IMAGE_NAME}:${LATEST_TAG}" \
    --push \
    .

echo "✅ Successfully built and pushed:"
echo "   - ${FULL_IMAGE_NAME}:${VERSION}"
echo "   - ${FULL_IMAGE_NAME}:${LATEST_TAG}"
echo ""
echo "🚀 To deploy on Raspberry Pi:"
echo "   docker pull ${FULL_IMAGE_NAME}:${LATEST_TAG}"
echo ""
echo "📋 Multi-architecture support:"
echo "   - linux/amd64 (Intel/AMD 64-bit)"
echo "   - linux/arm64 (Raspberry Pi 4, Apple Silicon)"
echo "   - linux/arm/v7 (Raspberry Pi 3/Zero 2W)"