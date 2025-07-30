#!/bin/bash

# ESP32 Glance Client Build Script
# Usage: ./build.sh [compile|upload|monitor]

# Check for required environment variables
if [[ -z "$WIFI_SSID" || -z "$WIFI_PASSWORD" ]]; then
    echo "❌ Error: WiFi credentials not set!"
    echo ""
    echo "Please set environment variables:"
    echo "  export WIFI_SSID=\"YourWiFiNetwork\""
    echo "  export WIFI_PASSWORD=\"YourWiFiPassword\""
    echo ""
    echo "Optional variables:"
    echo "  export DEVICE_ID=\"esp32-001\"        # Default: esp32-001"
    echo "  export GITHUB_TOKEN=\"your_token\"    # Default: NONE"
    exit 1
fi

# Set defaults for optional variables
export GITHUB_TOKEN=${GITHUB_TOKEN:-"NONE"}
export DEVICE_ID=${DEVICE_ID:-"esp32-001"}

# Show configuration (without password)
echo "=== ESP32 Build Configuration ==="
echo "WIFI_SSID: $WIFI_SSID"
echo "DEVICE_ID: $DEVICE_ID"
echo "================================="

# Default action
ACTION=${1:-"upload"}

case $ACTION in
    "compile"|"build")
        echo "🔨 Compiling ESP32 client..."
        platformio run --environment huzzah32
        ;;
    "upload")
        echo "📤 Building and uploading to ESP32..."
        platformio run --target upload --target monitor --environment huzzah32
        ;;
    "monitor")
        echo "🖥️  Starting serial monitor..."
        platformio device monitor --environment huzzah32
        ;;
    "clean")
        echo "🧹 Cleaning build files..."
        platformio run --target clean --environment huzzah32
        ;;
    "fullclean")
        echo "🧹 Full clean - removing all build artifacts..."
        platformio run --target cleanall --environment huzzah32
        rm -rf .pio/
        rm -rf .vscode/
        echo "✅ Full clean complete"
        ;;
    *)
        echo "Usage: $0 [compile|upload|monitor|clean|fullclean]"
        echo "  compile   - Build only"
        echo "  upload    - Build, upload, and monitor (default)"
        echo "  monitor   - Serial monitor only"
        echo "  clean     - Clean build files"
        echo "  fullclean - Remove all build artifacts and directories"
        exit 1
        ;;
esac