#!/bin/bash

# Export environment variables directly
export WIFI_SSID=YourNetwork
export WIFI_PASSWORD=YourPassword
export GITHUB_TOKEN=NONE
export DEVICE_ID=esp32-001

# Show WiFi configuration (without password)
echo "=== Build Configuration ==="
echo "WIFI_SSID: $WIFI_SSID"
echo "DEVICE_ID: $DEVICE_ID"
echo "=========================="

# Build and upload
platformio run --target upload --target monitor --environment esp32_prod