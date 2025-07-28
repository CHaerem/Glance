#!/bin/bash
# Simple test build script for e-paper display

echo "=== E-Paper Display Test ==="
echo "Building and uploading simple test program..."

# Set environment variables if not already set
export WIFI_SSID=${WIFI_SSID:-"test"}
export WIFI_PASSWORD=${WIFI_PASSWORD:-"test"}
export GITHUB_TOKEN=${GITHUB_TOKEN:-""}
export DEVICE_ID=${DEVICE_ID:-"esp32-test"}

# Build and upload the test
pio run -e simple_test --target upload --target monitor

echo "Test upload complete. Check serial monitor for results."