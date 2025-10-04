# ESP32 Upload Troubleshooting

## ⚠️ ESP32 Not Detected

Your ESP32 board is not currently detected by the system. Please follow these steps:

### 1. Check Physical Connection
- Connect ESP32 to Mac via USB cable
- Use a **data cable** (not charge-only)
- Try different USB ports or hubs

### 2. Install USB Drivers (if needed)

For ESP32-S3 boards, drivers might be needed:

**Option A: CP210x Driver (most common)**
```bash
brew install --cask silicon-labs-vcp-driver
# Restart Mac after installation
```

**Option B: CH340 Driver**
```bash
brew install --cask wch-ch34x-usb-serial-driver
# Restart Mac after installation
```

### 3. Find Your Serial Port

After connecting ESP32:
```bash
ls /dev/cu.* | grep -v Bluetooth
```

Look for ports like:
- `/dev/cu.usbserial-0001`
- `/dev/cu.wchusbserial1420`
- `/dev/cu.SLAB_USBtoUART`
- `/dev/cu.usbmodem14201`

### 4. Configure PlatformIO

Edit `platformio.ini` and uncomment/set your port:
```ini
upload_port = /dev/cu.YOUR_PORT_HERE
monitor_port = /dev/cu.YOUR_PORT_HERE
```

### 5. Upload Firmware

```bash
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"
./build.sh gooddisplay
```

### 6. Monitor Output

```bash
./build.sh gooddisplay monitor
```

## Alternative: Manual Upload

If the build script doesn't work:

```bash
# Build only
pio run --environment gooddisplay

# Upload with specific port
pio run --target upload --environment gooddisplay --upload-port /dev/cu.YOUR_PORT

# Monitor with specific port
pio device monitor --environment gooddisplay --port /dev/cu.YOUR_PORT
```

## ESP32-S3 Boot Mode

Some ESP32-S3 boards require manual boot mode:
1. Hold **BOOT** button
2. Press and release **RESET** button
3. Release **BOOT** button
4. Run upload command
5. Press **RESET** after upload completes

## Still Having Issues?

1. Check board is powered (LED should be on)
2. Try a different USB cable
3. Check System Information > USB for device
4. Restart Mac if drivers were just installed
5. Try Arduino IDE to verify board works