# Development Status - Glance E-ink Display

## Session Summary - October 2, 2025

### Hardware Identified ✅
- **Board**: Good Display ESP32-133C02 (ESP32-S3 with QSPI e-ink)
- **Display**: 13.3" Spectra 6 color e-ink (1200×1600)
- **Interface**: QSPI (Quad SPI) - requires ESP-IDF framework

### Working Components ✅

#### 1. Display Hardware
- ✅ Hardware tested with Good Display example code
- ✅ All 6 colors working (Black, White, Red, Yellow, Green, Blue)
- ✅ Full resolution confirmed (1200×1600)
- ✅ Example code location: `GDEP133C02 2 example code/`

#### 2. Server
- ✅ Node.js server running locally on Mac
- ✅ URL: http://192.168.86.40:3000
- ✅ API endpoint ready: `/api/image.bin` (returns RGB data)
- ✅ Web interface for image upload
- ✅ Floyd-Steinberg dithering implemented
- ✅ Spectra 6 palette mapping

### Work In Progress ⏳

#### WiFi Firmware
- ✅ Code written: `GDEP133C02 2 example code/main/main.c`
- ✅ Features: WiFi connection, HTTP download, RGB→e-ink conversion
- ⏳ **Blocked**: Needs ESP-IDF installation to build

### Architecture Decisions

#### Framework Choice: ESP-IDF ✅
**Why not Arduino?**
- Good Display board uses QSPI interface
- QSPI requires ESP-IDF native drivers
- Arduino framework only supports standard SPI
- Good Display's example code is ESP-IDF based

**Consequence:**
- Must use ESP-IDF toolchain for building
- CMake-based build system
- More complex setup, but necessary for hardware compatibility

### Files Cleaned Up
- ❌ Removed: Arduino-based code (incompatible with QSPI)
- ❌ Removed: Temporary ESP-IDF experiments
- ❌ Removed: PlatformIO ESP-IDF configs (didn't work without full ESP-IDF)
- ✅ Kept: Good Display example code (working baseline)
- ✅ Kept: Original Arduino code in git history (for reference)

### Next Steps

#### 1. Install ESP-IDF (Required)
```bash
# Install ESP-IDF v5.x
mkdir -p ~/esp
cd ~/esp
git clone --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32s3
. ./export.sh

# Verify installation
idf.py --version
```

#### 2. Build WiFi Firmware
```bash
cd "/Users/christopherhaerem/Privat/Glance/esp32-client/GDEP133C02 2 example code"
idf.py build
```

#### 3. Flash and Test
```bash
idf.py -p /dev/cu.usbserial-21210 flash monitor
```

#### 4. Expected Behavior
1. ESP32 boots and clears display to white
2. Connects to WiFi (SSID: "YourNetwork")
3. Downloads RGB image from http://192.168.86.40:3000/api/image.bin
4. Converts RGB to e-ink palette (on-device)
5. Displays image on screen
6. Falls back to color bars if download fails
7. Restarts after 60 seconds

### Technical Notes

#### Memory Requirements
- RGB buffer: 5.76 MB (1200×1600×3)
- E-ink buffer: 960 KB (1200×1600÷2)
- Total: ~6.7 MB
- ESP32-S3 has 8MB PSRAM - should be sufficient

#### Color Conversion
RGB → E-ink palette mapping implemented in firmware:
```c
// Simple threshold-based conversion
- Black:  RGB < 32
- White:  RGB > 224
- Yellow: R>200, G>200, B<100
- Red:    R>200, G<100, B<100
- Blue:   R<100, G<100, B>200
- Green:  R<100, G>200, B<100
```

Server uses Floyd-Steinberg dithering for better quality.

### Known Issues
1. **Build system**: PlatformIO can't build ESP-IDF projects without full ESP-IDF install
2. **Memory**: Need to verify PSRAM allocation works for 5.76MB RGB buffer
3. **Flash size**: CMake detects 2MB, but hardware has 8MB (sdkconfig issue)

### Clean Restart Plan
1. Install ESP-IDF properly
2. Build custom firmware with WiFi
3. Test image download
4. Optimize memory usage if needed
5. Add deep sleep and power management
6. Commit working version to main

### Git Status
- Branch: main
- Modified: Cleaned up temporary files
- Untracked: Good Display example code, NFC examples, documentation
- Ready for: ESP-IDF setup and proper firmware development

---

**Last Updated**: October 2, 2025
**Current Blocker**: ESP-IDF installation required
**Estimated Time to Working Prototype**: 30-60 minutes (after ESP-IDF install)
