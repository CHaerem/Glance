#!/bin/bash

# ESP32 Environment Setup Script
# This script helps you configure the necessary environment variables for building the ESP32 firmware

echo "🔧 ESP32 Glance Client - Environment Setup"
echo "=========================================="

# Function to read input with default value
read_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " input
        if [ -z "$input" ]; then
            input=$default
        fi
    else
        read -p "$prompt: " input
        while [ -z "$input" ]; do
            echo "❌ This field is required!"
            read -p "$prompt: " input
        done
    fi
    
    export $var_name="$input"
}

echo ""
echo "📶 WiFi Configuration (Required)"
echo "--------------------------------"

# WiFi SSID
read_with_default "WiFi Network Name (SSID)" "" "WIFI_SSID"

# WiFi Password
echo -n "WiFi Password: "
read -s WIFI_PASSWORD
export WIFI_PASSWORD
echo ""

if [ -z "$WIFI_PASSWORD" ]; then
    echo "❌ WiFi password is required!"
    exit 1
fi

echo ""
echo "🏷️  Device Configuration (Optional)"
echo "-----------------------------------"

# Device ID
read_with_default "Device ID" "esp32-001" "DEVICE_ID"

echo ""
echo "✅ Environment Variables Configured:"
echo "====================================="
echo "WIFI_SSID: $WIFI_SSID"
echo "DEVICE_ID: $DEVICE_ID"
echo ""

# Create export commands for easy copy-paste
echo "📋 Copy these commands to set variables in your shell:"
echo "======================================================"
echo "export WIFI_SSID=\"$WIFI_SSID\""
echo "export WIFI_PASSWORD=\"$WIFI_PASSWORD\""
echo "export DEVICE_ID=\"$DEVICE_ID\""
echo ""

# Ask if user wants to build now
read -p "🚀 Build and upload firmware now? (y/N): " build_now
if [[ $build_now =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔨 Building and uploading firmware..."
    ./build.sh
else
    echo ""
    echo "💡 To build later, run: ./build.sh"
    echo ""
    echo "🔄 To run this setup again, run: ./setup-env.sh"
fi