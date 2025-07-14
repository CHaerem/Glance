# ESP32 E-Ink Display Project

This project drives a Waveshare 13.3" Spectra 6 color e-ink display using an ESP32 Feather board with dynamic image updates fetched from a remote server. The device operates on battery power using deep sleep cycles for optimal power efficiency.

## Hardware Components

- **ESP32 Board**: Adafruit HUZZAH32 ESP32 Feather
- **Display**: Waveshare 13.3" E-Paper HAT+ Spectra 6 (E6) - 1200×1600 resolution
- **Power**: LiPo battery connected to BAT pin for portable operation
- **Colors**: 6-color support (BLACK, WHITE, YELLOW, RED, BLUE, GREEN)
- **Interface**: SPI communication via GPIO pins
- **Connectivity**: WiFi for remote image fetching

## Pin Connections

| ESP32 Pin | HAT+ Pin | Function |
|-----------|----------|----------|
| SCK (18)  | CLK      | SPI Clock |
| MOSI (23) | DIN      | SPI Data In |
| 5         | CS_M     | Chip Select Master |
| 16        | CS_S     | Chip Select Slave |
| 17        | DC       | Data/Command |
| 4         | RST      | Reset |
| 15        | BUSY     | Busy Signal |
| 21        | PWR      | Power Control |

## Power Configuration

### USB Power (Recommended for Development)
```
HAT+ VCC → ESP32 3V pin (regulated 3.3V)
USB cable → ESP32 USB connector
```
- Stable power delivery
- No brownout issues
- Full CPU performance
- Simplified code

### LiPo Battery Power (Primary Mode)
```
LiPo battery → ESP32 BAT pin
HAT+ VCC → ESP32 3V pin (regulated 3.3V)
```
- **Deep sleep cycles** for maximum battery life
- Wake up periodically to fetch new images
- Power consumption optimized for extended operation
- Battery monitoring and low-voltage protection

## System Architecture

### Remote Image Service
- **Web service** for image management and scheduling
- **User interface** to upload and configure display images
- **Update scheduling** with configurable intervals
- **API endpoint** providing image data and sleep duration
- **Image optimization** server-side processing for e-paper display

### ESP32 Operation Cycle
1. **Wake from deep sleep** (RTC timer or external trigger)
2. **Connect to WiFi** and fetch current image + schedule
3. **Download image data** optimized for e-paper display
4. **Update display** with new image content
5. **Calculate next wake time** from server response
6. **Enter deep sleep** until next scheduled update

## Image Processing

The project includes advanced image processing capabilities:

- **Floyd-Steinberg dithering** for smooth color transitions
- **6-color e-paper optimization** with custom color mapping
- **Remote processing** on server to reduce ESP32 workload
- **Compressed image transfer** to minimize download time
- **Full-screen coverage** (1150×1550 pixels, 93% display area)

## Current Implementation

Currently displays a static Bhutan flag image demonstrating:
- Professional dithering quality
- Accurate color representation
- Near full-screen coverage with minimal borders
- Optimized for e-paper color palette

## Code Structure

- `main.cpp` - Main application with display control and WiFi connectivity
- `bhutan_flag_fullscreen.h` - Static image data (1150×1550 pixels)
- Waveshare e-paper library integration
- Future: Remote image fetching and deep sleep management

## Usage

### Development Mode (Current)
1. **Setup Hardware**: Connect ESP32 to HAT+ using pin mapping above
2. **Power Connection**: Use USB power with 3V pin for stable operation
3. **Upload Code**: Flash the firmware to ESP32
4. **Display Update**: Reset ESP32 to refresh display

### Production Mode (Planned)
1. **Configure WiFi credentials** in firmware
2. **Set up remote image service** with API endpoint
3. **Install LiPo battery** and power via BAT pin
4. **Deploy device** - will automatically wake, fetch, and update images

## Performance

### Display Specifications
- **Display Size**: 1150×1550 pixels (96%×97% coverage)
- **Refresh Time**: ~30-45 seconds for full update
- **Color Accuracy**: Custom 6-color e-paper mapping

### Power Management
- **Deep Sleep Current**: ~10μA (ESP32 ultra-low power mode)
- **Active Current**: ~100mA during WiFi and display update
- **Battery Life**: Months to years depending on update frequency
- **Wake-up Time**: ~2-3 seconds from deep sleep to WiFi ready

### Network Performance
- **Image Download**: Compressed data transfer
- **Server Response**: Image data + next wake time
- **WiFi Connection**: Quick connect with stored credentials
- **Failsafe**: Local fallback if server unreachable

## Planned Features

### Remote Image Service
- **Web dashboard** for image management
- **Scheduled updates** with custom intervals
- **Multiple device support** with individual configurations
- **Image gallery** and history
- **User authentication** and device pairing

### Advanced Power Management
- **Battery voltage monitoring** with low-power alerts
- **Adaptive sleep intervals** based on battery level
- **Solar charging support** for outdoor installations
- **Wake-up triggers** (button press, motion sensor)

### Enhanced Functionality
- **Weather integration** with dynamic content
- **Calendar synchronization** for event displays
- **Multi-zone displays** with different content areas
- **Error handling** and recovery mechanisms

## Development Notes

- E-ink displays require specific refresh sequences
- Partial updates limited compared to monochrome displays
- SPI communication uses dual-IC control for large display
- Floyd-Steinberg dithering provides professional image quality
- Power management critical for battery operation

## Display Specifications

- **Resolution**: 1200×1600 pixels
- **Size**: 13.3 inches diagonal
- **Technology**: Spectra 6 color e-paper
- **Refresh**: Full screen update required
- **Interface**: SPI with dual chip select
- **Power**: 3.3V operation