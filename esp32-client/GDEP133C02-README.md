# Good Display ESP32-133C02 Development Board

## Hardware
- **Board**: Good Display ESP32-133C02 Development Kit
- **Display**: 13.3" E6 Series Color E-Ink (QSPI interface)
- **MCU**: ESP32-S3 (revision v0.2)
- **Features**: WiFi, BLE, Embedded PSRAM 8MB
- **Flash**: 8MB (note: detected as 2MB in some tools)
- **Product page**: https://www.good-display.com/product/574.html

## Pin Configuration (from example code)
```
QSPI Interface:
- CS0: GPIO 18
- CS1: GPIO 17
- CLK: GPIO 9
- Data0: GPIO 41
- Data1: GPIO 40
- Data2: GPIO 39
- Data3: GPIO 38

Control Pins:
- BUSY: GPIO 7 (input)
- RST: GPIO 6 (output)
- LOAD_SW: GPIO 45 (output - power control)
```

## Display Specifications
- Resolution: 1200×1600 pixels
- Colors: 6-color Spectra palette (Black, White, Red, Yellow, Green, Blue)
- Data format: 4-bit packed (2 pixels per byte) = 960KB per frame
- Refresh time: ~30-45 seconds for full color update

## Example Code Location
`GDEP133C02 2 example code/` - Original Good Display example code

### Working Tests
The example code demonstrates:
1. Color bars (6 horizontal stripes)
2. Test image display
3. Checkerboard pattern
4. Solid color fill

### Test Results
✅ Display hardware verified working
✅ QSPI communication functional
✅ All 6 colors display correctly
✅ Full resolution (1200×1600) confirmed

## Development Status

### Current State
- ✅ Hardware tested and working
- ✅ Display driver functional (ESP-IDF based)
- ✅ Local Node.js server running on Mac (port 3000)
- ⏳ WiFi integration in progress

### Next Steps
1. **Install ESP-IDF** (required for building custom firmware)
   ```bash
   mkdir -p ~/esp
   cd ~/esp
   git clone --recursive https://github.com/espressif/esp-idf.git
   cd esp-idf
   ./install.sh esp32s3
   . ./export.sh
   ```

2. **Build WiFi-enabled firmware**
   - Modified main.c with WiFi + HTTP client ready
   - Connects to local server at 192.168.86.40:3000
   - Downloads RGB image data
   - Converts to e-ink palette
   - Displays on screen

3. **Test complete workflow**
   - Upload image via web interface
   - ESP32 downloads and displays image
   - Implement deep sleep for battery operation

## Framework Notes

### Why ESP-IDF (not Arduino)?
The Good Display board uses **QSPI** (Quad SPI) interface for the display, which requires:
- ESP-IDF framework for proper QSPI driver support
- Native ESP32-S3 toolchain
- CMake-based build system

Arduino framework with standard SPI will **not work** with this hardware.

## Serial Port
- macOS: `/dev/cu.usbserial-21210`
- Baud rate: 115200

## Flashing
The pre-built example can be flashed with:
```bash
cd "GDEP133C02 2 example code/build"
esptool.py --chip esp32s3 --port /dev/cu.usbserial-21210 --baud 115200 \
  write_flash 0x0 bootloader/bootloader.bin \
  0x8000 partition_table/partition-table.bin \
  0x10000 133_ReferenceDesign_SampleCode.bin
```

## Resources
- [Good Display Product Page](https://www.good-display.com/product/574.html)
- Example code location: `GDEP133C02 2 example code/`
- Display driver: `main/GDEP133C02.c` and `main/comm.c`
