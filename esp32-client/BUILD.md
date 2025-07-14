# Building and Flashing ESP32 Firmware

This guide explains how to build and flash the Glance ESP32 firmware with environment-based configuration.

## 🔧 Setup

### 1. Install PlatformIO
```bash
# Install PlatformIO CLI
pip install platformio

# Or use VSCode extension
# Install "PlatformIO IDE" extension in VSCode
```

### 2. Create Environment File
```bash
# Copy the example file
cp src/.env.example src/.env

# Edit with your actual values
nano src/.env
```

### 3. Configure Your Settings
Edit `src/.env` with your WiFi credentials:

```bash
# WiFi Credentials (Required)
WIFI_SSID=Your_WiFi_Network_Name
WIFI_PASSWORD=Your_WiFi_Password

# GitHub Integration (Optional)
GITHUB_TOKEN=ghp_your_github_token_here

# Device Configuration (Optional)  
DEVICE_ID=esp32-001
```

## 🚀 Building

### Development Build
```bash
# Build for development (with debug info)
pio run -e esp32_dev

# Build and upload
pio run -e esp32_dev --target upload

# Monitor serial output
pio device monitor --baud 115200
```

### Production Build
```bash
# Build optimized for production
pio run -e esp32_prod --target upload
```

### All-in-One Command
```bash
# Build, upload, and monitor
pio run --target upload && pio device monitor --baud 115200
```

## 🔍 Environment Variables

The build system automatically injects your `.env` values as compile-time defines:

| Variable | Description | Required |
|----------|-------------|----------|
| `WIFI_SSID` | WiFi network name | ✅ Yes |
| `WIFI_PASSWORD` | WiFi password | ✅ Yes |
| `GITHUB_TOKEN` | GitHub API token | ❌ Optional |
| `DEVICE_ID` | Unique device identifier | ❌ Optional |

## 📁 File Structure

```
src/
├── .env.example          # Template configuration
├── .env                  # Your actual config (gitignored)
├── config.h              # Configuration header
├── glance_client.cpp     # Main firmware
├── BUILD.md             # This file
└── README.md            # Usage documentation
```

## 🐛 Troubleshooting

### Build Errors

**"Environment variable not found"**
- Ensure `.env` file exists in `src/` directory
- Check variable names match exactly
- Restart PlatformIO after creating `.env`

**"WiFi connection failed"**
- Verify SSID and password are correct
- Check for special characters in password
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

### Upload Errors

**"Serial port not found"**
- Check USB cable connection
- Install CP2102 or similar USB-to-serial drivers
- Try different USB ports

**"Permission denied"**
```bash
# On Linux/macOS, add user to dialout group
sudo usermod -a -G dialout $USER
# Log out and back in
```

## 📊 Monitoring

### Serial Output
Connect to see real-time logs:
```bash
pio device monitor --baud 115200
```

Expected output:
```
=== Glance E-Ink Display Client ===
Connecting to WiFi: YourNetwork
WiFi connected! IP address: 192.168.1.100
Fetching image from: https://chaerem.github.io/Glance/api/current.json
Image updated successfully
Entering deep sleep for 3600 seconds
```

### Debug Modes

**Development mode** (`esp32_dev`):
- Verbose logging
- Debug symbols included
- Serial output enabled

**Production mode** (`esp32_prod`):
- Optimized code
- Minimal logging
- Smaller binary size

## 🔄 Multiple Devices

### Different WiFi Networks
Create separate `.env` files:
```bash
# Home network
cp src/.env.example src/.env.home
# Office network  
cp src/.env.example src/.env.office
```

Build with specific environment:
```bash
# Copy desired config
cp src/.env.home src/.env
pio run --target upload
```

### Unique Device IDs
Each device should have a unique ID:
```bash
# Device 1
DEVICE_ID=esp32-living-room

# Device 2  
DEVICE_ID=esp32-kitchen

# Device 3
DEVICE_ID=esp32-office
```

## 🔒 Security Notes

- ✅ `.env` files are gitignored (never committed)
- ✅ Environment variables only exist at build time
- ✅ WiFi credentials are compiled into firmware
- ⚠️ GitHub tokens are optional for basic operation
- ⚠️ Use device-specific tokens when possible

## 🎯 Quick Start Commands

```bash
# Complete setup from scratch
cp src/.env.example src/.env
nano src/.env  # Edit your WiFi credentials
pio run --target upload
pio device monitor --baud 115200
```

Your ESP32 will now connect using your `.env` configuration! 🎉