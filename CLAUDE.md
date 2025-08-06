# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Glance** is a battery-powered ESP32 e-ink display system that fetches images from a local Node.js server running on a Raspberry Pi.

## Architecture

- **ESP32** → Connects to Waveshare 13.3" e-ink display (the display driver)
- **Raspberry Pi** → Runs Node.js server ("serverpi") that provides images and web interface
- **Communication** → ESP32 fetches display content via HTTP from serverpi

## Development Environment

- **ESP32 Client**: PlatformIO with Arduino framework
- **Server**: Node.js with Express.js running on Raspberry Pi
- **Display**: Waveshare 13.3" Spectra 6 e-ink display
- **Interface**: SPI communication between ESP32 and display

## Common Commands

ESP32 development:
```bash
# Set WiFi credentials
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"

# Build and upload ESP32 firmware
cd esp32-client/
./build.sh

# Monitor serial output
./build.sh monitor
```

Server development:
```bash
# Start server locally
cd server/
npm install
npm start

# Run tests
npm test

# Deploy to Raspberry Pi
./deploy-to-pi.sh serverpi.local your-dockerhub-username
```

## Hardware Specifications

- **ESP32**: Controls the e-ink display, deep sleep power management
- **Display**: Waveshare 13.3" Spectra 6 color e-ink display (1200×1600px)
- **Server**: Raspberry Pi running Node.js server on port 3000
- **Interface**: SPI between ESP32 and display, WiFi to server
- **Power**: LiPo battery with ultra-low power deep sleep

## Development Notes

- ESP32 wakes up periodically to check for new images
- Server controls sleep duration via API responses
- E-ink displays require specific timing and refresh sequences
- The Spectra 6 supports 6-color display (black, white, red, yellow, blue, green)
- Image processing happens server-side to reduce ESP32 workload
- Display refresh takes 30-45 seconds for full color updates
- Deep sleep current is ~10μA for months of battery life

## Art Gallery Application

**Glance** is designed as a local AI art gallery system, inspired by: https://charnley.github.io/blog/2025/04/02/e-ink-ai-esp32-local-art-gallery.html

### Art Display Optimization

**Color Processing for Art Reproduction**:
- **Floyd-Steinberg dithering**: Primary technique for art quality color reproduction
- **Atkinson dithering**: Alternative technique mentioned for specific artistic effects
- **Spectra 6 palette optimization**: Server-side color mapping to exact e-ink colors
- **Error diffusion**: Maintains tonal relationships and fine details in artwork

**Recommended Art Styles** (for AI generation or selection):
- Simplistic line art
- Ink drawings and sumi-e style
- High-contrast artistic styles
- Wireframe illustrations
- Minimalist designs optimized for e-ink limitations

**Image Processing Workflow**:
1. **Image acquisition**: Upload via web interface or AI generation
2. **Server processing**: Floyd-Steinberg dithering with Spectra 6 palette
3. **Streaming delivery**: ESP32 downloads optimized RGB data
4. **Display rendering**: Direct color mapping of pre-processed palette colors

### Battery-Powered Art Gallery Features

**Power Management**:
- Deep sleep between image updates (hours/days)
- Battery monitoring and low-power alerts
- Configurable wake-up schedules for art rotation
- Ultra-low current consumption (~10μA in sleep)

**Art Gallery Workflow**:
- Periodic wake-up to check for new artwork
- Automatic image download and display
- Status reporting (battery, signal strength, display success)
- Fallback mechanisms for connectivity issues

**Scalability**:
- Multiple ESP32 displays can create distributed art installations
- Centralized image management via Raspberry Pi server
- Support for different display sizes and orientations
- Modular system design for easy expansion