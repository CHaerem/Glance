# ESP32 E-Ink Display Improvements

## Overview
This project has been significantly enhanced to display a high-quality, dithered Bhutan flag on a 13.3" Waveshare E-Paper Spectra 6 display using an ESP32 Feather.

## Major Improvements

### 1. **Image Quality Enhancement**
- **Fresh Source**: Downloaded official Bhutan flag SVG from Wikipedia
- **Proper Orientation**: Rotated flag 90° for correct portrait display  
- **High Resolution**: 1100×1400 pixels (92% width × 87% height coverage)
- **Professional Dithering**: Floyd-Steinberg error diffusion algorithm

### 2. **Advanced Dithering Implementation**
- **Multiple Algorithms**: Floyd-Steinberg, Ordered (Bayer), and Atkinson dithering
- **Smooth Gradients**: Eliminates color banding and creates natural transitions
- **Optimized Colors**: 47.3% Yellow, 33.2% Red, 17.9% White, 0.6% Black
- **Superior Quality**: Much improved visual fidelity over simple quantization

### 3. **Technical Optimizations**
- **Memory Efficient**: 770KB image fits in ESP32's 4MB flash (33.2% usage)
- **4-bit Packing**: 2 pixels per byte for optimal storage
- **Generic Architecture**: Ready for dynamic image loading from URLs
- **Clean Codebase**: Removed all unused files and legacy code

### 4. **Display Coverage**
- **Minimal Borders**: Only 50px left/right, 100px top/bottom margins
- **Maximum Utilization**: Flag covers 92% × 87% of the 13.3" display
- **Proper Centering**: Perfectly positioned on 1200×1600 display

## Technical Details

### Dithering Algorithms Tested
1. **Floyd-Steinberg** (Selected): Best for photographic content, smooth gradients
2. **Ordered (Bayer)**: Good for patterns, more structured appearance  
3. **Atkinson**: Classic Mac-style, lighter error diffusion

### Color Mapping
- **BLACK** (0x0): Outlines and details (0.6%)
- **WHITE** (0x1): Dragon and highlights (17.9%)  
- **YELLOW** (0x2): Left triangle/saffron regions (47.3%)
- **RED** (0x3): Right triangle/orange regions (33.2%)
- **BLUE/GREEN**: Minimal (<1% combined)

### Flash Memory Usage
- **Total**: 1.04MB (33.2% of 4MB)
- **Flag Image**: 770KB (Floyd-Steinberg dithered)
- **Framework**: ~270KB
- **Available**: 2.1MB for future features

## File Structure
```
esp32-eink-test/
├── src/                          # ESP32 source code
│   ├── main.cpp                  # Main display application
│   ├── bhutan_flag_floyd.h       # Dithered flag data
│   └── [Waveshare library files] # E-paper drivers
├── convert_dithered.py           # Advanced dithering converter
├── bhutan_flag_fresh.svg         # Original Wikipedia SVG
├── bhutan_flag_rotated_fitted.png # Processed source image
└── venv/                         # Python environment
```

## Future Enhancements Ready
The architecture is now prepared for:
1. **WiFi Integration**: Fetch images from remote URLs
2. **Dynamic Content**: Periodic image updates  
3. **Multiple Formats**: Support various image types
4. **Power Management**: Optimized for battery operation

## Build Status
✅ **Compilation**: Success (1.04MB firmware)  
✅ **Memory**: 6.6% RAM, 33.2% Flash usage  
✅ **Architecture**: Generic image display system  
✅ **Quality**: Professional dithering implementation  

The ESP32 is now ready to display high-quality, properly oriented, and beautifully dithered images on the full 13.3" e-paper display.