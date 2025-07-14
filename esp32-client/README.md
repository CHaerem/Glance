# ESP32 Glance Client

ESP32 firmware for the Glance E-Ink Display project. This client connects to WiFi, fetches display content from the local server, and manages the e-ink display.

## Hardware Requirements

- **ESP32 Development Board** (ESP32-DevKitC or similar)
- **Waveshare 13.3" Spectra 6 E-Ink Display**
- **Waveshare 13.3" E-Paper HAT+**
- **Jumper wires** for connections (if not using HAT)

## Software Requirements

- **PlatformIO** (recommended) or Arduino IDE
- **Python 3** (for PlatformIO)

## Quick Start

### 1. Install PlatformIO

```bash
# Install PlatformIO CLI
pip install platformio

# Or use VS Code extension
# Search for "PlatformIO IDE" in VS Code extensions
```

### 2. Configure WiFi

Edit `build.sh` with your WiFi credentials:

```bash
export WIFI_SSID=YourWiFiNetwork
export WIFI_PASSWORD=YourWiFiPassword
```

### 3. Configure Server

Edit `config.h` with your server IP:

```cpp
#define API_BASE_URL "http://192.168.1.100:3000/api/"
#define STATUS_URL "http://192.168.1.100:3000/api/device-status"
```

### 4. Build and Upload

```bash
# Build, upload, and monitor
./build.sh

# Or individual commands:
./build.sh compile    # Build only
./build.sh upload     # Build and upload
./build.sh monitor    # Serial monitor only
./build.sh clean      # Clean build files
```

## 🔄 How It Works

### Fetch Cycle
1. **Wake Up** from deep sleep (RTC timer)
2. **Connect** to WiFi using stored credentials
3. **Fetch** current image from local server: `http://server-ip:3000/api/current.json`
4. **Parse** JSON response for image data and sleep duration
5. **Update** e-paper display with new image
6. **Report** device status to local server
7. **Sleep** for duration specified by server

### API Endpoints
- **Image Fetch:** `http://server-ip:3000/api/current.json`
- **Status Report:** `http://server-ip:3000/api/device-status`
- **Log Reporting:** `http://server-ip:3000/api/logs`

### JSON Response Format
```json
{
  "image": "base64_encoded_image_data",
  "title": "Image Title",
  "sleepDuration": 3600000,
  "timestamp": 1704067200000,
  "imageId": "unique_id"
}
```

## 🔋 Power Management

### Deep Sleep Features
- **Ultra Low Power:** ~10μA in deep sleep mode
- **Smart Wake-up:** Server controls sleep duration
- **Battery Monitoring:** Tracks voltage and adjusts behavior
- **Low Battery Protection:** Extended sleep when battery low

### Battery Optimization
- **Adaptive Sleep:** Longer sleep when battery is low
- **Quick Updates:** Skips display refresh for same image
- **WiFi Efficiency:** Fast connect with stored credentials
- **Error Handling:** Exponential backoff on failures

## 📊 Status Reporting

The ESP32 reports comprehensive status to GitHub Actions:

```json
{
  "deviceId": "esp32-001",
  "batteryLevel": 85,
  "batteryVoltage": 3.7,
  "signalStrength": -45,
  "temperature": 23.5,
  "uptime": 12345678,
  "lastUpdateSuccess": true,
  "freeHeap": 123456,
  "macAddress": "AA:BB:CC:DD:EE:FF"
}
```

This data appears in your dashboard's device monitoring section.

## 🖼️ Display Features

### Image Handling
- **Base64 Decoding:** Converts web images to display format
- **6-Color Support:** Full Spectra 6 palette utilization
- **Memory Management:** Efficient RAM usage for large images
- **Error Screens:** Status display when images unavailable

### Display Modes
1. **Image Mode:** Shows uploaded image from dashboard
2. **Status Mode:** Device information when no image available
3. **Error Mode:** Diagnostic information for troubleshooting

## 🔧 Hardware Requirements

### ESP32 Board
- **Recommended:** Adafruit HUZZAH32 ESP32 Feather
- **Memory:** Minimum 4MB flash for image storage
- **WiFi:** 2.4GHz network support required

### E-Paper Display
- **Model:** Waveshare 13.3" E-Paper HAT+ Spectra 6
- **Resolution:** 1200×1600 pixels
- **Colors:** 6-color support (black, white, red, yellow, blue, green)
- **Interface:** SPI with dual chip select

### Power Supply
- **Development:** USB power (5V)
- **Production:** LiPo battery (3.7V nominal)
- **Voltage Range:** 3.2V - 4.2V for battery operation

## 🚀 Installation

### PlatformIO (Recommended)
```bash
# Clone and navigate to project
cd Glance/

# Open in PlatformIO
pio run --target upload
```

### Arduino IDE
1. Install ESP32 board support
2. Install required libraries:
   - ArduinoJson
   - WiFi
   - HTTPClient
3. Open `glance_client.cpp`
4. Configure WiFi credentials
5. Upload to ESP32

## 📚 Required Libraries

- **ArduinoJson:** JSON parsing for API responses
- **WiFi:** Network connectivity
- **HTTPClient:** API communication
- **esp_sleep:** Deep sleep functionality
- **Waveshare_EPD:** E-paper display drivers

## 🐛 Troubleshooting

### WiFi Connection Issues
- Check SSID and password are correct
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Verify signal strength is adequate

### Display Issues
- Check SPI connections match pin mapping
- Ensure display power supply is stable
- Verify HAT+ compatibility with your display

### API Communication
- Check internet connectivity
- Verify GitHub Pages is accessible
- Monitor serial output for HTTP error codes

### Power Issues
- Check battery voltage (3.2V minimum)
- Verify charging circuit if using solar
- Monitor deep sleep current draw

## 📈 Monitoring

### Serial Output
Connect to serial monitor (115200 baud) to see:
- WiFi connection status
- API fetch results
- Display update status
- Sleep duration calculations
- Error messages and diagnostics

### Dashboard Monitoring
- Device status updates in real-time
- Battery level and temperature
- WiFi signal strength
- Last seen timestamps
- Error reporting

## 🔄 Firmware Updates

### Over-the-Air (OTA)
Future versions will support OTA updates via the dashboard.

### Manual Update
1. Connect ESP32 via USB
2. Flash new firmware using PlatformIO or Arduino IDE
3. Device will resume normal operation

Your ESP32 is now ready to display images from your GitHub-hosted dashboard with intelligent power management! 🎉