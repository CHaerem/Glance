# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project is focused on driving a Waveshare 13.3" Spectra 6 e-ink display using a Raspberry Pi Zero 2W with the 13.3 inch e-paper HAT+.

## Development Environment

- Target platform: Raspberry Pi Zero 2W
- Display: Waveshare 13.3" Spectra 6 e-ink display
- HAT: Waveshare 13.3 inch e-paper HAT+
- Programming language: Python 3

## Common Commands

Testing the display:
```bash
# Install dependencies
pip3 install -r requirements.txt

# Run the display test
python3 epaper_test.py

# Run with sudo if needed for GPIO access
sudo python3 epaper_test.py
```

## Hardware Specifications

- **Display**: Waveshare 13.3" Spectra 6 color e-ink display
- **Controller**: Raspberry Pi Zero 2W
- **Interface**: SPI communication via HAT+ connector
- **HAT**: Waveshare 13.3 inch e-paper HAT+ (plugs into Pi GPIO header)

## Development Notes

- E-ink displays require specific timing and refresh sequences
- The Spectra 6 supports 6-color display (black, white, red, yellow, blue, green)
- Partial refresh capabilities may be limited compared to monochrome displays
- SPI must be enabled on the Raspberry Pi (use `sudo raspi-config`)
- The HAT+ handles most of the low-level interfacing
- Display refresh can take 30-45 seconds for full updates