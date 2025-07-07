#!/usr/bin/env python3
"""
Waveshare 13.3" Spectra 6 E-Paper HAT+ Test for Raspberry Pi Zero 2W
This script tests the basic functionality of the e-paper display.
"""

import spidev
import RPi.GPIO as GPIO
import time
import sys

# Pin definitions for Raspberry Pi to Waveshare 13.3" E-Paper HAT+
# These correspond to the HAT+ pin connections
RST_PIN = 17  # Reset
DC_PIN = 25   # Data/Command
CS_PIN = 8    # Chip Select (CE0)
BUSY_PIN = 24 # Busy

# Display dimensions
EPD_WIDTH = 1600
EPD_HEIGHT = 1200

class EPD_13in3_Spectra6:
    def __init__(self):
        self.spi = spidev.SpiDev()
        self.spi.open(0, 0)  # SPI bus 0, device 0
        self.spi.max_speed_hz = 4000000
        self.spi.mode = 0b00
        
    def _spi_transfer(self, data):
        """Send data via SPI"""
        self.spi.xfer2([data])
        
    def _send_command(self, command):
        """Send command to display"""
        GPIO.output(DC_PIN, GPIO.LOW)
        self._spi_transfer(command)
        print(f"CMD: 0x{command:02X}")
        
    def _send_data(self, data):
        """Send data to display"""
        GPIO.output(DC_PIN, GPIO.HIGH)
        self._spi_transfer(data)
        
    def _wait_until_idle(self, timeout_seconds=30):
        """Wait until display is not busy"""
        print(f"Waiting for display (max {timeout_seconds}s)...", end="", flush=True)
        start_time = time.time()
        
        while GPIO.input(BUSY_PIN) == GPIO.HIGH:
            time.sleep(0.1)
            if time.time() - start_time > timeout_seconds:
                print(" TIMEOUT!")
                return False
                
        print(" Ready")
        return True
        
    def init(self):
        """Initialize the display"""
        print("\n=== DISPLAY INITIALIZATION ===")
        
        # Setup GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        
        # Clean up any previous GPIO state
        try:
            GPIO.cleanup()
        except:
            pass
            
        GPIO.setup(RST_PIN, GPIO.OUT)
        GPIO.setup(DC_PIN, GPIO.OUT)
        GPIO.setup(CS_PIN, GPIO.OUT)
        GPIO.setup(BUSY_PIN, GPIO.IN)
        
        # Initialize pins
        GPIO.output(CS_PIN, GPIO.HIGH)
        GPIO.output(DC_PIN, GPIO.LOW)
        GPIO.output(RST_PIN, GPIO.HIGH)
        
        print("Resetting display...")
        self._reset()
        
        print("Sending power on command...")
        self._send_command(0x04)  # Power on
        if not self._wait_until_idle(10):
            print("ERROR: Power on timeout")
            return False
            
        print("Setting panel configuration...")
        self._send_command(0x00)  # Panel setting
        self._send_data(0x2f)     # KW-3f, KWR-2f, BWROTP-0f, BWOTP-1f
        self._send_data(0x00)     # 400x300
        
        print("Setting resolution...")
        self._send_command(0x61)  # Resolution setting
        self._send_data(EPD_WIDTH >> 8)
        self._send_data(EPD_WIDTH & 0xff)
        self._send_data(EPD_HEIGHT >> 8)
        self._send_data(EPD_HEIGHT & 0xff)
        
        print("Display initialization complete")
        return True
        
    def _reset(self):
        """Hardware reset sequence"""
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.2)
        GPIO.output(RST_PIN, GPIO.LOW)
        time.sleep(0.002)
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.2)
        
    def clear(self):
        """Clear display to white"""
        print("\n=== CLEARING DISPLAY ===")
        
        # Send white pixels to entire display
        print("Sending clear data...")
        
        self._send_command(0x10)  # Start transmission 1
        total_pixels = EPD_WIDTH * EPD_HEIGHT // 4
        for i in range(total_pixels):
            self._send_data(0x11)  # White pixels
            if i % 10000 == 0:
                print(".", end="", flush=True)
        print()
        
        self._send_command(0x13)  # Start transmission 2
        for i in range(total_pixels):
            self._send_data(0x11)  # White pixels
            if i % 10000 == 0:
                print(".", end="", flush=True)
        print()
        
        self._refresh()
        
    def draw_test_pattern(self):
        """Draw a 6-color test pattern"""
        print("\n=== DRAWING COLOR TEST PATTERN ===")
        
        rect_height = EPD_HEIGHT // 6
        pixels_per_byte = 4
        
        print("Drawing 6-color test pattern...")
        
        # First transmission
        self._send_command(0x10)
        for y in range(EPD_HEIGHT):
            for x in range(0, EPD_WIDTH, pixels_per_byte):
                pixel_data = 0
                
                for p in range(pixels_per_byte):
                    # Determine color based on vertical position
                    if y < rect_height:
                        color = 0x0  # Black
                    elif y < rect_height * 2:
                        color = 0x1  # White
                    elif y < rect_height * 3:
                        color = 0x2  # Red
                    elif y < rect_height * 4:
                        color = 0x3  # Yellow
                    elif y < rect_height * 5:
                        color = 0x4  # Blue
                    else:
                        color = 0x5  # Green
                        
                    pixel_data |= (color << (6 - p * 2))
                    
                self._send_data(pixel_data)
                
            if y % 200 == 0:
                print(".", end="", flush=True)
        print()
        
        # Second transmission (duplicate)
        self._send_command(0x13)
        print("Sending second buffer...")
        for y in range(EPD_HEIGHT):
            for x in range(0, EPD_WIDTH, pixels_per_byte):
                pixel_data = 0
                
                for p in range(pixels_per_byte):
                    if y < rect_height:
                        color = 0x0
                    elif y < rect_height * 2:
                        color = 0x1
                    elif y < rect_height * 3:
                        color = 0x2
                    elif y < rect_height * 4:
                        color = 0x3
                    elif y < rect_height * 5:
                        color = 0x4
                    else:
                        color = 0x5
                        
                    pixel_data |= (color << (6 - p * 2))
                    
                self._send_data(pixel_data)
                
            if y % 200 == 0:
                print(".", end="", flush=True)
        print()
        
        self._refresh()
        
    def _refresh(self):
        """Refresh the display"""
        print("\n=== REFRESHING DISPLAY ===")
        print("Starting display refresh...")
        self._send_command(0x12)  # Display refresh
        time.sleep(0.1)
        
        print("Waiting for refresh to complete (up to 45 seconds)...")
        if not self._wait_until_idle(45):
            print("WARNING: Refresh timeout")
        else:
            print("Display refresh completed!")
            
    def sleep(self):
        """Put display to sleep"""
        print("\nPutting display to sleep...")
        self._send_command(0x02)  # Power off
        self._wait_until_idle(5)
        self._send_command(0x07)  # Deep sleep
        self._send_data(0xA5)
        print("Display is now in sleep mode")
        
    def cleanup(self):
        """Clean up resources"""
        try:
            self.spi.close()
        except:
            pass
        try:
            GPIO.cleanup()
        except:
            pass

def main():
    """Main test function"""
    print("=" * 50)
    print("Waveshare 13.3\" Spectra 6 E-ink Display Test")
    print("For Raspberry Pi Zero 2W with HAT+")
    print("=" * 50)
    print()
    
    print("Expected HAT+ connections:")
    print("- Display HAT+ plugged into Pi GPIO header")
    print("- Ensure HAT+ is properly seated")
    print("- Check power connections")
    print()
    
    epd = EPD_13in3_Spectra6()
    
    try:
        # Initialize display
        print("Initializing display...")
        if not epd.init():
            print("ERROR: Failed to initialize display")
            return False
            
        time.sleep(2)
        
        # Clear display first
        print("Clearing display to white...")
        epd.clear()
        
        print("Clear completed! Check if display turned white.")
        print("Waiting 10 seconds before drawing test pattern...")
        time.sleep(10)
        
        # Draw test pattern
        print("Drawing 6-color test pattern...")
        epd.draw_test_pattern()
        
        print("\n" + "=" * 50)
        print("TEST COMPLETE!")
        print("=" * 50)
        print("You should see 6 horizontal colored stripes:")
        print("1. Black (top)")
        print("2. White")
        print("3. Red")
        print("4. Yellow")
        print("5. Blue")
        print("6. Green (bottom)")
        print()
        print("If display shows no change:")
        print("- Check HAT+ connections")
        print("- Verify power supply")
        print("- Check SPI is enabled: sudo raspi-config")
        print("- Try: sudo python3 epaper_test.py")
        print("=" * 50)
        
        epd.sleep()
        return True
        
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        return False
    except Exception as e:
        print(f"\nERROR: {e}")
        return False
    finally:
        epd.cleanup()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)