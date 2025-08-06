# ESP32 Glance Client

ESP32 firmware for the Glance E-Ink Display project. This client connects to WiFi, fetches display content from a local Raspberry Pi server, manages power consumption, and handles remote commands.

## 🛠️ Hardware Requirements

- **ESP32 Feather v2** with ESP32-PICO-V3-02 (embedded 4MB PSRAM for large image processing)
- **Waveshare 13.3" Spectra 6 E-Ink Display** (1200×1600 pixels, 6-color support)
- **Waveshare 13.3" E-Paper HAT+** (SPI interface with 10-pin connector)
- **LiPo Battery** (3.7V, 2000mAh+ recommended for long runtime)
- **Jumper wires** for connections (10 wires needed for HAT+)

## 📡 Software Requirements

- **PlatformIO** (recommended) or Arduino IDE
- **Raspberry Pi** running Glance server on local network

## 🔌 Hardware Connections

Connect ESP32 Feather v2 to Waveshare 13.3" HAT+ as follows:

| ESP32 Feather v2 Pin | HAT+ Pin | Wire Color | Function |
|----------------------|----------|------------|----------|
| 5                    | CLK      | Orange     | SPI Clock |
| 19                   | DIN      | Yellow     | SPI MOSI (Data Input) |
| 32                   | CS_M     | Orange     | Chip Select Master |
| 12                   | CS_S     | Green      | Chip Select Slave |
| 33                   | RST      | Purple     | Reset |
| 15                   | DC       | White      | Data/Command |
| 27                   | BUSY     | Brown      | Busy Signal |
| 14                   | PWR      | Gray       | Power Control |
| GND                  | GND      | Black      | Ground |
| 3V                   | VCC      | Red        | Power Supply (3.3V) |

### Important Notes:
- **ESP32-PICO-V3-02**: The Feather v2 uses a different chip with embedded PSRAM
- **Pin Changes**: Pin numbers are different from original ESP32 Feather
- **10-Wire Setup**: All 10 connections are required for proper HAT+ operation
- **3.3V Power**: Use 3V pin, not 5V, to power the display
- **Wire Colors**: Suggested colors for easy identification during wiring

## 🚀 Quick Start

### 1. Set Environment Variables

```bash
# Required: WiFi credentials
export WIFI_SSID="YourWiFiNetwork"
export WIFI_PASSWORD="YourWiFiPassword"

# Optional: Device configuration
export DEVICE_ID="esp32-001"        # Default: esp32-001
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
- **Image Download:** `GET /api/image.bin` (5.76MB RGB binary data)
- **Status Check:** `GET /api/current.json` (image availability check)
- **Status Report:** `POST /api/device-status` (device health and battery)
- **Log Reporting:** `POST /api/logs` (debug and error messages)

### Binary Image Format
The ESP32 downloads raw RGB data (1200×1600×3 = 5,760,000 bytes) and converts it to 4-bit e-ink format:
- **Input:** 5.76MB RGB data (3 bytes per pixel)
- **Processing:** RGB to 6-color e-ink mapping
- **Output:** 960KB packed format (0.5 bytes per pixel)
- **Display:** Direct buffer to Waveshare 13.3" Spectra 6

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
- **RGB to E-ink Conversion:** Converts 5.76MB RGB data to optimized 4-bit e-ink format
- **PSRAM Utilization:** Uses embedded 4MB PSRAM for large image buffer processing
- **6-Color Support:** Full Spectra 6 palette (black, white, red, yellow, blue, green)
- **Dual Buffer System:** Separate RGB input (5.76MB) and e-ink output (960KB) buffers
- **Real-time Processing:** Converts 1.92M pixels from RGB to e-ink colors on-device
- **Memory Optimization:** Automatic fallback from PSRAM to regular heap if needed

### Display Modes
1. **Image Mode:** Shows uploaded image from server
2. **Text Mode:** Displays server-generated text content
3. **Clear Mode:** White screen when no content available

## 💾 PSRAM Configuration

The ESP32 Feather v2 with ESP32-PICO-V3-02 includes 4MB of embedded PSRAM for handling large images:

### PSRAM Features
- **Embedded PSRAM:** 4MB built into ESP32-PICO-V3-02 chip
- **Large Buffer Support:** Handles 5.76MB RGB + 960KB e-ink buffers simultaneously
- **Automatic Detection:** Firmware detects and utilizes PSRAM automatically
- **Memory Management:** Falls back to regular heap if PSRAM unavailable
- **Build Configuration:** Enabled via platformio.ini PSRAM flags

### Memory Usage
```
Total Image Processing Memory: ~6.7MB
├── RGB Input Buffer: 5.76MB (in PSRAM)
├── E-ink Output Buffer: 960KB (in PSRAM)  
└── Regular Heap: ~240KB available
```

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
- **Pin Mapping:** Verify ESP32 Feather v2 pin connections match the new mapping above
- **Power Supply:** Ensure stable 3.3V power (use 3V pin, not 5V)
- **HAT+ Wiring:** All 10 wires must be connected for proper operation
- **SPI Communication:** Check CLK (pin 5) and DIN (pin 19) connections
- **Chip Select:** Both CS_M (pin 32) and CS_S (pin 12) are required
- **Display Clear:** ESP32 now clears display before each update

### Server Communication
- Verify Raspberry Pi server is running on port 3000
- Check network connectivity with `ping serverpi.local`
- Monitor serial output for HTTP error codes
- Verify firewall allows port 3000 access

### PSRAM Issues
- **PSRAM Detection:** Check serial output for "PSRAM initialized successfully"
- **Board Type:** Ensure platformio.ini uses correct board configuration for ESP32-PICO-V3-02
- **Build Flags:** Verify PSRAM support flags are enabled in platformio.ini
- **Memory Allocation:** Monitor "Using PSRAM for both RGB and e-ink buffers" message
- **Fallback Mode:** System falls back to regular heap if PSRAM fails

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
=== ESP32 Feather v2 E-ink Display ===
Device ID: esp32-001
Firmware: v2-psram-1.0
Display: Waveshare 13.3" Spectra 6
=======================================
Regular heap: 238684 bytes
PSRAM initialized successfully
PSRAM size: 4194304 bytes
PSRAM free: 2095103 bytes
Battery Voltage: 3.88V
Connecting to WiFi: Internett
WiFi connected!
IP address: 192.168.1.56
Signal strength: -50 dBm
Initializing e-Paper display...
Clearing display...
Display cleared
=== DOWNLOADING IMAGE FROM SERVER ===
SUCCESS: Using PSRAM for both RGB (5.76MB) and e-ink (960KB) buffers
Image download response: 200
Content length: 5760000 bytes (expecting RGB)
Downloaded RGB: 2500KB
Downloaded RGB: 5000KB
Download complete: 5760000 bytes
Converting RGB to Spectra 6 e-ink format...
Converted: 400K pixels
Converted: 800K pixels
Converted: 1200K pixels
RGB conversion complete, displaying image...
SUCCESS: Converted image displayed!
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