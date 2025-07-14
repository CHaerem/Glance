#!/bin/bash

# ESP32 Glance Client Build Script
# Usage: ./build.sh [compile|upload|monitor]

# Export environment variables directly
export WIFI_SSID=Internett
export WIFI_PASSWORD=Yellowfinch924
export GITHUB_TOKEN=NONE
export DEVICE_ID=esp32-001

# Show WiFi configuration (without password)
echo "=== ESP32 Build Configuration ==="
echo "WIFI_SSID: $WIFI_SSID"
echo "DEVICE_ID: $DEVICE_ID"
echo "================================="

# Default action
ACTION=${1:-"upload"}

case $ACTION in
    "compile"|"build")
        echo "🔨 Compiling ESP32 client..."
        platformio run --environment esp32_prod
        ;;
    "upload")
        echo "📤 Building and uploading to ESP32..."
        platformio run --target upload --target monitor --environment esp32_prod
        ;;
    "monitor")
        echo "🖥️  Starting serial monitor..."
        platformio device monitor --environment esp32_prod
        ;;
    "clean")
        echo "🧹 Cleaning build files..."
        platformio run --target clean --environment esp32_prod
        ;;
    *)
        echo "Usage: $0 [compile|upload|monitor|clean]"
        echo "  compile - Build only"
        echo "  upload  - Build, upload, and monitor (default)"
        echo "  monitor - Serial monitor only"
        echo "  clean   - Clean build files"
        exit 1
        ;;
esac