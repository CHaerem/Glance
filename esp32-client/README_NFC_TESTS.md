# NFC Test Suite for ESP32-S3 + ST25R3916

## Test Files Created

### 1. `test_gpio_toggle.c`
**Purpose**: Verify IO1 and IO42 are accessible GPIOs
- Toggles IO1 and IO42 alternately every 500ms
- Measure with multimeter: should see ~0V/3.3V alternating
- Serial output shows current state

### 2. `test_i2c_scanner.c`  
**Purpose**: Find NFC module on I2C bus
- Scans addresses 0x01-0x7F every 3 seconds
- ST25R3916 typically at: **0x50**, 0x28, or 0x2C
- Shows all found devices with highlighting for NFC addresses
- **IMPORTANT**: Set Elechouse jumper to I2C mode!

### 3. `test_nfc_irq.c`
**Purpose**: Verify IRQ signal from NFC on IO37
- Sets up interrupt handler on falling edge
- Logs message when IRQ triggers
- Tap NFC tag/phone to trigger interrupt
- Shows IRQ count and current pin level

### 4. `test_spi_nfc.c`
**Purpose**: Fallback if I2C doesn't work
- Uses SPI pins: SCK=IO12, MOSI=IO11, MISO=IO13, CS=IO25
- Reads IC Identity register (should be 0x51)
- Sends basic commands to verify communication
- **Use if I2C scanner finds nothing**

## How to Build & Run

```bash
# Replace main.c with test file temporarily
cd esp32-client/
cp src/test_gpio_toggle.c src/main.c  # Or any other test file

# Build and upload
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"
export DEVICE_ID="esp32-001"
platformio run --target upload --environment esp32_prod

# Monitor output
platformio device monitor -b 115200
```

## Test Sequence

1. **GPIO Test First** → Verify pins work
2. **I2C Scanner** → Look for address 0x50
3. **IRQ Test** → Tap tag, see interrupt
4. **SPI Test** → Only if I2C fails

## Troubleshooting

**No I2C devices found:**
- Check Elechouse jumper → must be in I2C position
- Verify 5V power to NFC module
- Check SDA/SCL connections (IO1/IO42)
- Try adding external 4.7kΩ pull-ups

**No IRQ triggers:**
- IRQ is active-low (falls when tag detected)
- Check IO37 connection
- Verify NFC has power
- Module may need initialization first

**SPI fails:**
- Switch Elechouse jumper to SPI mode
- Check all 5 SPI connections
- Verify 5V power stable during communication