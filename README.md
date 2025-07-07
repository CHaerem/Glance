# ESP32 E-ink Display Test

Test program for driving a Waveshare 13.3" Spectra 6 e-ink display with ESP32 Feather.

## Hardware Requirements

- ESP32 Feather (4MB, Bluetooth/WiFi)
- Waveshare 13.3" Spectra 6 e-ink display
- Breadboard and jumper wires

## Wiring Connections

Connect the ESP32 Feather to the 13.3" E-Paper HAT+ as follows:

| ESP32 Feather Pin | E-Paper HAT+ Pin | Cable Color | Description |
|-------------------|------------------|-------------|-------------|
| GPIO 4            | BUSY             | 🤎 **Brown**     | Busy Signal |
| GPIO 16           | RST              | 🟣 **Purple**    | Reset |
| GPIO 17           | DC               | ⚪ **White**     | Data/Command |
| GPIO 5            | CS_S             | 🟢 **Green**     | Slave Chip Select |
| GPIO 18 (SCK)     | SCLK             | 🟡 **Yellow**    | Serial Clock |
| GPIO 23 (MOSI)    | DIN              | 🔵 **Blue**      | Data Input |
| GND               | GND              | ⚫ **Black**     | Ground |
| 3.3V              | VCC              | 🔴 **Red**       | Power Supply |

**Notes:**
- 🩶 **Gray cable (PWR)** - Not connected in this setup
- 🟠 **Orange cable (CS_M)** - Not connected in this setup  
- Use the actual cable colors from your E-Paper HAT+ ribbon cable

## VS Code Setup

### Required Extensions

1. **PlatformIO IDE** - Main development environment
   - Extension ID: `platformio.platformio-ide`
   - Provides complete ESP32 development toolkit

### Installation Steps

1. Install VS Code if not already installed
2. Open VS Code
3. Go to Extensions (Ctrl+Shift+X)
4. Search for "PlatformIO IDE"
5. Click Install
6. Restart VS Code when prompted

### Project Setup

1. Open VS Code
2. Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
3. Type "PlatformIO: Home" and select it
4. Click "New Project"
5. Configure project:
   - **Name**: `eink-display-test`
   - **Board**: Search for "Adafruit ESP32 Feather" or "ESP32 Feather"
   - **Framework**: Arduino
   - **Location**: Choose your desired folder

### Alternative: Arduino IDE Method

If you prefer Arduino IDE:

1. Install Arduino IDE 2.x
2. Add ESP32 board support:
   - Go to File → Preferences
   - Add this URL to "Additional Boards Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
3. Go to Tools → Board → Boards Manager
4. Search "ESP32" and install "esp32 by Espressif Systems"
5. Select board: Tools → Board → ESP32 Arduino → "Adafruit ESP32 Feather"

## Upload and Run Instructions

### Using PlatformIO (Recommended)

1. Copy `eink_test.ino` to `src/main.cpp` in your PlatformIO project
2. Connect ESP32 Feather via USB
3. Press `Ctrl+Shift+P` and select "PlatformIO: Upload"
4. Open Serial Monitor: `Ctrl+Shift+P` → "PlatformIO: Serial Monitor"
5. Set baud rate to 115200

### Using Arduino IDE

1. Open `eink_test.ino` in Arduino IDE
2. Select correct board and port:
   - Tools → Board → "Adafruit ESP32 Feather"
   - Tools → Port → Select your ESP32's COM port
3. Click Upload button (→)
4. Open Serial Monitor (Ctrl+Shift+M)
5. Set baud rate to 115200

## Expected Behavior

When successfully uploaded and running:

1. Serial monitor will show initialization messages
2. Display will first clear to white (takes ~15 seconds)
3. Then display 6 horizontal color bands:
   - Black (top)
   - White
   - Red
   - Yellow
   - Blue
   - Green (bottom)
4. Display refresh takes 20-30 seconds
5. ESP32 enters sleep mode when complete

## Troubleshooting

**Upload Issues:**
- Hold BOOT button while uploading if upload fails
- Check USB cable (data cable, not charging-only)
- Verify correct COM port selected

**Display Issues:**
- Double-check all wiring connections
- Ensure 3.3V power supply is adequate
- Verify display model matches (13.3" Spectra 6)

**Serial Monitor Shows Nothing:**
- Check baud rate is set to 115200
- Try pressing Reset button on ESP32

## Power Consumption Note

E-ink displays only consume power during refresh cycles. After the test completes, the ESP32 enters deep sleep mode to minimize power consumption.