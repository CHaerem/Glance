# ESP32 Glance Client

ESP32 firmware for the Glance E-Ink Display project. This client connects to WiFi, fetches display content from a local Raspberry Pi server, manages power consumption, and handles remote commands.

## 🛠️ Hardware Requirements

- **ESP32 Development Board** (HUZZAH32 ESP32 Feather recommended)
- **Waveshare 13.3" Spectra 6 E-Ink Display** (1200×1600 pixels)
- **Waveshare 13.3" E-Paper HAT+** (SPI interface)
- **LiPo Battery** (3.7V, 2000mAh+ recommended)
- **Jumper wires** for connections

## 📡 Software Requirements

- **PlatformIO** (recommended) or Arduino IDE
- **Raspberry Pi** running Glance server on local network

## 🔌 Hardware Connections

Connect ESP32 to Waveshare 13.3" HAT+ as follows:

| ESP32 Pin | HAT+ Pin | Function |
|-----------|----------|----------|
| 21        | PWR      | Power Control |
| 15        | BUSY     | Busy Signal |
| 4         | RST      | Reset |
| 17        | DC       | Data/Command |
| 16        | CS_S     | Chip Select Slave |
| 5         | CS_M     | Chip Select Master |
| 18        | CLK      | SPI Clock |
| 23        | DIN      | SPI Data |
| GND       | GND      | Ground |
| 3V        | VCC      | Power Supply |

## 🚀 Quick Start

### 1. Set Environment Variables

```bash
# Required: WiFi credentials
export WIFI_SSID="YourWiFiNetwork"
export WIFI_PASSWORD="YourWiFiPassword"

# Optional: Device configuration
export DEVICE_ID="esp32-001"        # Default: esp32-001
export GITHUB_TOKEN="your_token"    # Default: NONE
```

### 2. Build and Upload

```bash
# Build, upload, and monitor in one command
./build.sh

# Or use individual commands:
./build.sh compile    # Build only
./build.sh upload     # Build and upload
./build.sh monitor    # Serial monitor only
./build.sh clean      # Clean build files
```

## 🔄 How It Works

### Operation Cycle
1. **Wake Up** from deep sleep (RTC timer controlled by server)
2. **Connect** to WiFi using stored credentials  
3. **Check Commands** for remote control (stay awake, force update)
4. **Fetch Image** from server: `http://serverpi.local:3000/api/current.json`
5. **Update Display** with new image data (if changed)
6. **Report Status** to server (battery, WiFi signal, device health)
7. **Enter Deep Sleep** for duration specified by server (1-6 hours)

### API Communication
- **Image Fetch:** `GET /api/current.json`
- **Status Report:** `POST /api/device-status`
- **Log Reporting:** `POST /api/logs`
- **Command Polling:** `GET /api/commands/:deviceId`

### JSON Response Format
```json
{
  "image": "base64_encoded_image_data",
  "title": "Image Title",
  "sleepDuration": 3600000000,
  "timestamp": 1704067200000,
  "imageId": "unique_id"
}
```

## 🎛️ Remote Control Features

The ESP32 supports remote commands sent via the web dashboard:

- **Stay Awake** - Keeps device active for 5 minutes for debugging
- **Force Update** - Triggers immediate display refresh  
- **Update Now** - Forces content refresh on next wake cycle

Commands are queued on the server and executed when the device wakes up or during stay-awake periods.

## 🔋 Power Management

### Deep Sleep Features
- **Ultra Low Power:** ~10μA in deep sleep mode
- **Smart Wake-up:** Server controls sleep duration (5 minutes to 12 hours)
- **Battery Monitoring:** Tracks voltage and reports to server
- **Low Battery Protection:** Extended sleep when battery < 3.3V
- **Watchdog Timer:** 5-minute timeout prevents hangs

### Battery Optimization
- **Adaptive Sleep:** Longer sleep when battery is low
- **Quick Updates:** Skips display refresh if image unchanged
- **WiFi Efficiency:** Fast reconnect with stored credentials
- **Error Handling:** Progressive retry delays on failures

## 📊 Status Reporting

The ESP32 reports comprehensive status to the server:

```json
{
  "deviceId": "esp32-001",
  "status": {
    "status": "display_updated",
    "batteryVoltage": 3.85,
    "signalStrength": -45,
    "firmwareVersion": "1.0.0",
    "bootCount": 42,
    "freeHeap": 123456
  }
}
```

This data appears in the web dashboard's device monitoring section.

## 🖼️ Display Features

### Image Handling
- **Base64 Decoding:** Converts server images to display format
- **6-Color Support:** Full Spectra 6 palette utilization (black, white, red, yellow, blue, green)
- **Memory Management:** Efficient RAM usage for 1150×1550 pixel images
- **Text Display:** Supports server-generated text images

### Display Modes
1. **Image Mode:** Shows uploaded image from server
2. **Text Mode:** Displays server-generated text content
3. **Clear Mode:** White screen when no content available

## 🔧 Configuration

### WiFi Configuration
Set via environment variables (required):
```bash
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"
```

### Server Configuration
Default server URL (edit in `src/main.cpp` if needed):
```cpp
#define API_BASE_URL "http://serverpi.local:3000/api/"
#define STATUS_URL "http://serverpi.local:3000/api/device-status"
```

### Device Configuration
Optional device-specific settings:
```bash
export DEVICE_ID="esp32-living-room"  # Unique identifier
```

## 📚 Dependencies

Automatically managed by PlatformIO:
- **ArduinoJson** (6.18.5) - JSON parsing for API responses
- **WiFi** - Network connectivity
- **HTTPClient** - API communication
- **esp_sleep** - Deep sleep functionality
- **Waveshare EPD** - E-paper display drivers (included in lib/)

## 🐛 Troubleshooting

### WiFi Connection Issues
- Check SSID and password are correct in environment variables
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
- Verify signal strength is adequate (-70dBm or better)
- Try different ESP32 board if connection is unstable

### Display Issues
- Check SPI connections match pin mapping above
- Ensure display power supply is stable (3.3V)
- Verify HAT+ compatibility with your display model
- Check for loose connections on breadboard/jumper wires

### Server Communication
- Verify Raspberry Pi server is running on port 3000
- Check network connectivity with `ping serverpi.local`
- Monitor serial output for HTTP error codes
- Verify firewall allows port 3000 access

### Power Issues
- Check battery voltage (3.2V minimum for operation)
- Verify charging circuit if using solar/external charger
- Monitor deep sleep current draw with multimeter
- Ensure no serial monitor connected during sleep

### Build Issues
- Install PlatformIO: `pip install platformio`
- Set environment variables before building
- Check USB cable and drivers for ESP32
- Try different USB port or cable if upload fails

## 📈 Serial Monitoring

Connect to serial monitor (115200 baud) to see:
```
=== ESP32 Build Configuration ===
WIFI_SSID: YourNetwork
DEVICE_ID: esp32-001
=================================
Boot number: 1
Glance ESP32 Client Starting...
Device ID: esp32-001
Firmware Version: 1.0.0
Battery Voltage: 3.85V
Connecting to WiFi: YourNetwork
WiFi connected!
IP address: 192.168.1.100
Signal strength: -45 dBm
Checking for pending commands...
No pending commands
Fetching current image from server...
Server response received
Processing as image data
Data decoded successfully
Processing as image data
Displaying image: 1150x1550
Image display completed
Status reported successfully
Entering deep sleep for 3600 seconds
```

## 🔄 Firmware Updates

### Over USB
1. Connect ESP32 via USB cable
2. Set environment variables
3. Run `./build.sh upload`
4. Device will resume normal operation

### Future OTA Support
Planned feature for wireless firmware updates via the web dashboard.

## 🌐 Multiple Devices

### Unique Device IDs
Each device should have a unique identifier:
```bash
# Living room display
export DEVICE_ID="esp32-living-room"

# Kitchen display  
export DEVICE_ID="esp32-kitchen"

# Office display
export DEVICE_ID="esp32-office"
```

### Different Networks
Devices can connect to different WiFi networks by setting different credentials before building.

Your ESP32 is now ready to display images from your Raspberry Pi server with intelligent power management and remote control! 🎉