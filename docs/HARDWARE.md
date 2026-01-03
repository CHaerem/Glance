# Glance E-Ink Art Display - Hardware Documentation

## Project Overview

Glance is a battery-powered, wireless e-ink art display system designed to showcase digital artwork with ultra-low power consumption. The system uses NFC triggers from smartphones and WiFi connectivity to update displayed images, making it ideal for long-term, maintenance-free art installations.

## Hardware Components

### 1. Display - Waveshare 13.3" Spectra 6 E-Paper

**Model**: 13.3inch E-Paper HAT Plus (E)
**Technology**: E Ink Spectra 6 (E6) Full Color

#### Technical Specifications
- **Resolution**: 1600 × 1200 pixels
- **Physical Size**: 270.40 × 202.80 mm active area
- **Colors**: Full color Spectra 6 (Black, White, Red, Yellow, Blue, Green)
- **Interface**: 3-wire or 4-wire SPI
- **Operating Voltage**: 3.3V
- **Refresh Time**: 19 seconds (full color update)
- **Viewing Angle**: >170°
- **Power Consumption**: <0.5W during refresh
- **Standby Current**: <0.01μA
- **Dot Pitch**: 0.169 × 0.169 mm

#### Key Features
- Image retention without power (bistable display)
- No backlight required (reflective technology)
- Ultra-low power consumption
- Wide viewing angle
- Sunlight readable

### 2. Controller Board - GoodDisplay ESP32-133C02

**Model**: Development Kit for 13.3" E6 Series Color E-Ink Display
**Platform**: ESP32-based with QSPI interface

#### Technical Specifications
- **Microcontroller**: ESP32 dual-core processor
- **Connectivity**: WiFi 802.11 b/g/n, Bluetooth 4.2/BLE
- **Memory**: 
  - 520KB SRAM
  - 4MB Flash (expandable)
- **Interfaces**:
  - USB Type-C for programming and power
  - QSPI for display communication
  - SD card slot for local image storage
  - GPIO pins for expansion
- **Board Dimensions**: 98.298mm × 69.215mm
- **Operating Temperature**: 0°C to 50°C

#### Power Management
- **Input**: Type-C USB or lithium battery
- **Deep Sleep Current**: ~10μA
- **Operating Voltage**: 3.3V core
- **Power Input**: 5V via USB-C or battery connector

#### Software Features
- Web interface for wireless image updates
- Integrated image dithering algorithms
- Support for multiple image update modes
- Arduino and ESP-IDF compatible

#### GPIO Pin Assignments (Good Display ESP32-133C02)

| Function | GPIO | Notes |
|----------|------|-------|
| SPI_CS0 | 18 | Chip select 0 |
| SPI_CS1 | 17 | Chip select 1 |
| SPI_CLK | 9 | SPI clock |
| SPI_Data0 | 41 | QSPI data line 0 |
| SPI_Data1 | 40 | QSPI data line 1 |
| SPI_Data2 | 39 | QSPI data line 2 |
| SPI_Data3 | 38 | QSPI data line 3 |
| EPD_BUSY | 7 | Display busy signal (input) |
| EPD_RST | 6 | Display reset (output) |
| LOAD_SW | 45 | Load switch control (output) |
| BATTERY_ADC | 2 | Battery voltage via ADC1_CH1 |

### 3. Power System

#### Primary Battery - PiJuice 12,000mAh LiPo
- **Capacity**: 12,000mAh (~44Wh)
- **Voltage**: 3.7V nominal (3.0V-4.2V range)
- **Chemistry**: Lithium Polymer (LiPo)
- **Connector**: 2-pin JST connector
- **Features**:
  - High discharge rate for display refresh
  - Rechargeable via LiPo Amigo Pro
  - Long-term deep sleep support

#### Power Management - LiPo Amigo Pro
- **Manufacturer**: Pimoroni
- **Function**: LiPo/LiIon battery charger and protection
- **Input**: USB-C (5V for charging)
- **Output Connectors**:
  - **BAT**: 2-pin JST for battery connection
  - **DEVICE**: 2-pin JST for device power output
- **Key Pins**:
  - **VBAT**: Battery voltage monitoring pin (3.0V-4.2V)
  - **VDEV**: Device output voltage
  - **GND**: Common ground
- **Features**:
  - Automatic charging when USB-C connected
  - Over-charge/discharge protection
  - Battery voltage accessible via VBAT pin
  - Pass-through power delivery
  - LED charging indicators

#### Boost Converter - Adafruit MiniBoost 5V
- **Model**: TPS61023-based boost converter
- **Input**: 2-5V DC (from LiPo Amigo Pro DEVICE output)
- **Output**: 5.2V @ 1A (regulated)
- **Connector**: USB-C output to ESP32
- **Key Pins**:
  - **VIN**: Input from LiPo Amigo Pro
  - **GND**: Common ground
  - **5V OUT**: Regulated 5V output
  - **EN**: Enable pin (pulled HIGH by default)
- **Features**:
  - Efficient boost conversion (85-95% efficiency)
  - Low quiescent current
  - True disconnect via EN pin
  - Over 5V to account for cable drop

#### Power Flow Diagram
```
[PiJuice 12Ah LiPo]
       │ 2-pin JST
       ↓
[LiPo Amigo Pro]
   │         │
   │ VBAT    │ DEVICE (2-pin JST)
   │ (mon.)  ↓
   │    [Adafruit MiniBoost 5V]
   │              │ USB-C
   │              ↓
   │        [ESP32-133C02]
   │              │
   │              ↓
   ↓        [13.3" Display]
[Voltage Divider → GPIO 2]
```

#### Power Budget Analysis
- **Display Refresh**: ~500mW for 19 seconds = ~2.6mWh per update
- **ESP32 Active**: ~150mA @ 3.3V = ~500mW
- **ESP32 Deep Sleep**: 10μA @ 3.3V = 0.033mW
- **Expected Battery Life**: 
  - With hourly updates: ~6 months
  - With daily updates: >1 year

### 4. NFC Wake Module (Future Addition)

**Model**: ST25R3916 NFC Reader Module
**Purpose**: Wake ESP32 from deep sleep via smartphone NFC tap

#### Technical Specifications
- **NFC Standards**: 
  - ISO 14443A/B
  - ISO 15693
  - FeliCa
  - NFC Forum Type 1-5
- **Communication**: SPI (up to 10 Mbps) or I2C (400 kbps)
- **Operating Voltage**: 3.3V logic, 5V input
- **Read Range**: Up to 6cm (depending on tag type)
- **Dimensions**: 42.8mm × 40.3mm × 5.4mm

#### Integration Features
- Low-power card detection mode
- Wake-up interrupt capability
- Compatible with iPhone NFC (NFC Forum Type 2/4)
- Integrated PCB antenna

## System Architecture

### Hardware Interconnections

```
[PiJuice Battery 12Ah]
         |
    [2-pin JST]
         |
  [LiPo Amigo Pro]
         |
    [USB-C Cable]
         |
  [Adafruit MiniBoost 5V]
         |
    [USB-C Cable]
         |
  [ESP32-133C02 Controller]
         |
    [QSPI Bus]
         |
  [13.3" Spectra 6 Display]
```

### Communication Protocols

1. **Display Communication (SPI/QSPI)**
   - Clock Speed: Up to 20MHz
   - Data Lines: MOSI, MISO, CLK, CS
   - Additional: BUSY, RST, D/C pins

2. **Server Communication (WiFi)**
   - Protocol: HTTP/HTTPS
   - Port: 3000 (default)
   - Format: RGB bitmap data (pre-dithered)

3. **NFC Communication (Future)**
   - Wake interrupt on GPIO pin
   - Data transfer via SPI/I2C
   - Payload: Image URL or direct transfer trigger

## Operating Modes

### 1. Periodic Fetch Mode (Current)
- ESP32 wakes periodically (configurable interval)
- Connects to WiFi
- Checks server for new images
- Downloads and displays if updated
- Returns to deep sleep

### 2. NFC Triggered Mode (Future)
- ESP32 in ultra-deep sleep
- NFC module in low-power detection mode
- Phone tap wakes ESP32 via interrupt
- Establishes Bluetooth connection
- Receives image data
- Updates display
- Returns to deep sleep

### 3. Manual Update Mode
- Web interface access via browser
- Direct image upload
- Immediate display update
- Used for testing and setup

## Power Optimization Strategies

### Hardware Optimizations
1. **Display Power Management**
   - Hold EPD PWR pin low during deep sleep
   - Use proper power sequencing for display init/deinit
   - Minimize refresh cycles (partial updates when possible)

2. **ESP32 Power Modes**
   - Deep sleep with RTC timer wake
   - WiFi modem sleep when idle
   - CPU frequency scaling based on task

3. **Power Supply Design**
   - Large decoupling capacitors (1000-4700μF) near display
   - Short, thick power cables (18-22 AWG)
   - Proper ground plane design

### Software Optimizations
1. **Efficient Wake Cycles**
   - Batch operations during wake period
   - Minimize WiFi connection time
   - Cache frequently used data

2. **Smart Scheduling**
   - Time-of-day aware updates
   - Battery level based frequency adjustment
   - Skip updates if battery critical

## Environmental Considerations

### Operating Conditions
- **Temperature**: 0°C to 50°C
- **Humidity**: 35% to 65% RH
- **Storage**: -20°C to 70°C

### Installation Requirements
- Adequate ambient lighting (no backlight)
- Protection from direct moisture
- Stable mounting (display is fragile)
- WiFi signal strength >-70dBm for reliable operation

## Troubleshooting Guide

### Common Issues and Solutions

1. **Display Not Updating**
   - Check SPI connections and cable integrity
   - Verify power supply can deliver >1A peaks
   - Ensure proper GPIO pin configuration

2. **Brownout/Reset During Refresh**
   - Insufficient power supply current
   - Add larger decoupling capacitors
   - Use shorter, thicker power cables

3. **WiFi Connection Failures**
   - Check signal strength
   - Verify credentials in environment variables
   - Ensure router supports 2.4GHz band

4. **Excessive Battery Drain**
   - Check deep sleep is properly entering
   - Verify WiFi disconnect after transfers
   - Monitor wake frequency settings

## Future Enhancements

### Planned Features
1. **NFC Wake Integration**
   - Hardware interrupt wake from deep sleep
   - iPhone-initiated image transfers
   - NFC tag-based configuration

2. **Bluetooth Image Transfer**
   - Direct phone-to-display transfers
   - Eliminate server dependency for updates
   - Companion mobile app

3. **Multi-Display Coordination**
   - Synchronized updates across displays
   - Centralized management interface
   - Display grouping and zones

### Potential Upgrades
- Solar charging integration
- Environmental sensors (temp, humidity, light)
- Motion detection for interactive displays
- Partial refresh optimization for animations

## References and Resources

- [Waveshare 13.3" Display Wiki](https://www.waveshare.com/wiki/13.3inch_e-Paper_HAT_Plus_(E))
- [GoodDisplay ESP32 Documentation](https://www.good-display.com/companyfile/files/GoodDisplay_Development_Kit_User_Manual.pdf)
- [ESP32 Deep Sleep Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/sleep_modes.html)
- [ST25R3916 Datasheet](https://www.st.com/resource/en/datasheet/st25r3916.pdf)