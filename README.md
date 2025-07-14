# ESP32 E-Ink Display Project

This project drives a Waveshare 13.3" Spectra 6 color e-ink display using an ESP32 Feather board with full-screen image display capabilities.

## Hardware Components

- **ESP32 Board**: Adafruit HUZZAH32 ESP32 Feather
- **Display**: Waveshare 13.3" E-Paper HAT+ Spectra 6 (E6) - 1200×1600 resolution
- **Colors**: 6-color support (BLACK, WHITE, YELLOW, RED, BLUE, GREEN)
- **Interface**: SPI communication via GPIO pins

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

### LiPo Battery Power
```
LiPo battery → ESP32 BAT pin
HAT+ VCC → ESP32 3V pin (regulated 3.3V)
```
- Requires power management optimizations
- CPU frequency scaling recommended
- Extended delays during display operations

## Image Processing

The project includes advanced image processing capabilities:

- **Floyd-Steinberg dithering** for smooth color transitions
- **6-color e-paper optimization** with custom color mapping
- **Full-screen coverage** (1150×1550 pixels, 93% display area)
- **Memory-efficient storage** in ESP32 flash (891KB image data)

## Current Image

Displays the flag of Bhutan with:
- Professional dithering quality
- Accurate color representation
- Near full-screen coverage with minimal borders
- Optimized for e-paper color palette

## Code Structure

- `main.cpp` - Main application with display control
- `bhutan_flag_fullscreen.h` - Image data (1150×1550 pixels)
- `convert_dithered.py` - Image conversion script with dithering
- Waveshare e-paper library integration

## Usage

1. **Setup Hardware**: Connect ESP32 to HAT+ using pin mapping above
2. **Power Connection**: Use USB power with 3V pin for stable operation
3. **Upload Code**: Flash the firmware to ESP32
4. **Display Update**: Reset ESP32 to refresh display

## Performance

- **Display Size**: 1150×1550 pixels (96%×97% coverage)
- **Memory Usage**: 891KB image data stored in flash
- **Refresh Time**: ~30-45 seconds for full update
- **Power Consumption**: Optimized for battery operation
- **Color Accuracy**: Custom 6-color e-paper mapping

## Future Enhancements

- WiFi image fetching from remote servers
- Dynamic content updates
- Battery voltage monitoring
- Multiple image format support
- Web interface for image upload

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