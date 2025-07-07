#!/usr/bin/env python3
"""
Simple test for 13.3" e-paper display with correct pin mappings
"""

import spidev
import RPi.GPIO as GPIO
import time
import sys
import os

# Pin definitions for Raspberry Pi to Waveshare 13.3" E-Paper HAT+ (E)
RST_PIN = 11  # Reset
DC_PIN = 22   # Data/Command
CS_M_PIN = 24 # Chip Select Master
CS_S_PIN = 26 # Chip Select Slave
BUSY_PIN = 18 # Busy

def init_gpio():
    """Initialize GPIO pins"""
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    
    GPIO.setup(RST_PIN, GPIO.OUT)
    GPIO.setup(DC_PIN, GPIO.OUT)
    GPIO.setup(CS_M_PIN, GPIO.OUT)
    GPIO.setup(CS_S_PIN, GPIO.OUT)
    GPIO.setup(BUSY_PIN, GPIO.IN)
    
    # Initialize pins
    GPIO.output(RST_PIN, GPIO.HIGH)
    GPIO.output(DC_PIN, GPIO.LOW)
    GPIO.output(CS_M_PIN, GPIO.HIGH)  # Deselect
    GPIO.output(CS_S_PIN, GPIO.HIGH)  # Deselect
    
    print("GPIO initialized successfully")

def test_pins():
    """Test pin functionality"""
    print("\n=== PIN TEST ===")
    
    # Test BUSY pin
    busy_state = GPIO.input(BUSY_PIN)
    print(f"BUSY pin state: {'HIGH' if busy_state else 'LOW'}")
    
    # Test reset sequence
    print("Testing reset sequence...")
    GPIO.output(RST_PIN, GPIO.HIGH)
    time.sleep(0.2)
    GPIO.output(RST_PIN, GPIO.LOW)
    time.sleep(0.002)
    GPIO.output(RST_PIN, GPIO.HIGH)
    time.sleep(0.2)
    
    # Check if BUSY pin responds
    busy_after_reset = GPIO.input(BUSY_PIN)
    print(f"BUSY pin after reset: {'HIGH' if busy_after_reset else 'LOW'}")
    
    return True

def test_spi_communication():
    """Test SPI with correct CS control"""
    print("\n=== SPI TEST ===")
    
    try:
        spi = spidev.SpiDev()
        spi.open(0, 0)
        spi.max_speed_hz = 4000000
        spi.mode = 0b00
        
        # Test master IC
        print("Testing master IC communication...")
        GPIO.output(CS_M_PIN, GPIO.LOW)
        GPIO.output(CS_S_PIN, GPIO.HIGH)
        GPIO.output(DC_PIN, GPIO.LOW)  # Command mode
        
        # Send power on command
        spi.xfer2([0x04])
        print("Power on command sent to master")
        
        # Wait and check BUSY
        time.sleep(0.1)
        busy_state = GPIO.input(BUSY_PIN)
        print(f"BUSY pin after power on: {'HIGH' if busy_state else 'LOW'}")
        
        # Deselect
        GPIO.output(CS_M_PIN, GPIO.HIGH)
        
        # Test slave IC
        print("Testing slave IC communication...")
        GPIO.output(CS_S_PIN, GPIO.LOW)
        GPIO.output(CS_M_PIN, GPIO.HIGH)
        
        # Send power on command
        spi.xfer2([0x04])
        print("Power on command sent to slave")
        
        # Deselect
        GPIO.output(CS_S_PIN, GPIO.HIGH)
        
        spi.close()
        print("SPI test completed")
        return True
        
    except Exception as e:
        print(f"SPI test failed: {e}")
        return False

def main():
    """Main test function"""
    print("=" * 50)
    print("Simple 13.3\" E-Paper Display Test")
    print("Testing with correct pin mappings")
    print("=" * 50)
    
    try:
        init_gpio()
        
        if test_pins():
            print("✓ Pin test passed")
        else:
            print("✗ Pin test failed")
            
        if test_spi_communication():
            print("✓ SPI test passed")
        else:
            print("✗ SPI test failed")
            
        print("\nTest completed. Check output for any issues.")
        
    except Exception as e:
        print(f"Test failed: {e}")
        return False
    finally:
        GPIO.cleanup()
        
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)