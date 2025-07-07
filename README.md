# Raspberry Pi E-ink Display Test

Test program for driving a Waveshare 13.3" Spectra 6 e-ink display with Raspberry Pi Zero 2W.

## Hardware Requirements

- Raspberry Pi Zero 2W
- Waveshare 13.3" Spectra 6 e-ink display
- Waveshare 13.3 inch e-paper HAT+
- MicroSD card (16GB+ recommended)
- Power supply for Raspberry Pi

## Hardware Setup

1. **Install Raspberry Pi OS** on your microSD card
2. **Connect the HAT+**: Plug the Waveshare 13.3 inch e-paper HAT+ directly onto the Raspberry Pi GPIO header
3. **Ensure proper seating**: The HAT+ should sit flush on the GPIO pins
4. **Connect display**: The e-paper display connects to the HAT+ via the provided cable

## Software Setup

### Prerequisites

1. **Enable SPI interface**:
   ```bash
   sudo raspi-config
   ```
   - Navigate to Interface Options → SPI → Enable
   - Reboot when prompted

2. **Install Python dependencies**:
   ```bash
   pip3 install -r requirements.txt
   ```

### Installation Steps

1. Clone this repository:
   ```bash
   git clone https://github.com/CHaerem/Glance.git
   cd Glance
   ```

2. Install dependencies:
   ```bash
   pip3 install -r requirements.txt
   ```

3. Run the test:
   ```bash
   python3 epaper_test.py
   ```

   If you get permission errors, try:
   ```bash
   sudo python3 epaper_test.py
   ```

## Expected Behavior

When successfully running:

1. **Initialization**: Console will show initialization messages
2. **Display Clear**: Display will first clear to white (takes ~30-45 seconds)
3. **Test Pattern**: Display will show 6 horizontal color bands:
   - Black (top)
   - White
   - Red
   - Yellow
   - Blue
   - Green (bottom)
4. **Refresh Time**: Full display refresh takes 30-45 seconds
5. **Sleep Mode**: Display enters low-power sleep mode when complete

## Troubleshooting

**Permission Issues:**
- Try running with `sudo python3 epaper_test.py`
- Ensure user is in the `spi` and `gpio` groups:
  ```bash
  sudo usermod -a -G spi,gpio $USER
  ```
- Logout and login again after group changes

**SPI Issues:**
- Verify SPI is enabled: `sudo raspi-config` → Interface Options → SPI
- Check SPI devices exist: `ls /dev/spi*`
- Reboot after enabling SPI

**Display Issues:**
- Ensure HAT+ is properly seated on GPIO header
- Check display cable connection to HAT+
- Verify power supply is adequate (2.5A+ recommended)
- Confirm display model matches (13.3" Spectra 6)

**No Output:**
- Check console output for error messages
- Verify Python dependencies are installed
- Try running with verbose output: `python3 -v epaper_test.py`

## Technical Details

- **SPI Interface**: Uses `/dev/spidev0.0` at 4MHz
- **GPIO Pins**: 
  - RST: GPIO 17
  - DC: GPIO 25
  - CS: GPIO 8 (CE0)
  - BUSY: GPIO 24
- **Display Resolution**: 1600x1200 pixels
- **Color Depth**: 6 colors (2 bits per pixel)
- **Refresh Rate**: ~30-45 seconds for full refresh

## Power Consumption Note

E-ink displays only consume power during refresh cycles. After the test completes, the display enters sleep mode to minimize power consumption. The Raspberry Pi will continue running normally.