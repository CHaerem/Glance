#!/usr/bin/env python3
"""
E-Paper Display Diagnostic Tool
This script helps diagnose common e-paper display issues
"""

import spidev
import RPi.GPIO as GPIO
import time
import sys

# Pin definitions
RST_PIN = 17  # Reset
DC_PIN = 25   # Data/Command
BUSY_PIN = 24 # Busy

def test_gpio_connectivity():
    """Test basic GPIO pin connectivity"""
    print("=== GPIO CONNECTIVITY TEST ===")
    
    GPIO.setwarnings(False)
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(RST_PIN, GPIO.OUT)
        GPIO.setup(DC_PIN, GPIO.OUT)
        GPIO.setup(BUSY_PIN, GPIO.IN)
        
        # Test output pins
        print("Testing RST_PIN (17)...")
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.1)
        GPIO.output(RST_PIN, GPIO.LOW)
        time.sleep(0.1)
        GPIO.output(RST_PIN, GPIO.HIGH)
        print("✓ RST_PIN test complete")
        
        print("Testing DC_PIN (25)...")
        GPIO.output(DC_PIN, GPIO.HIGH)
        time.sleep(0.1)
        GPIO.output(DC_PIN, GPIO.LOW)
        time.sleep(0.1)
        GPIO.output(DC_PIN, GPIO.HIGH)
        print("✓ DC_PIN test complete")
        
        # Test input pin
        print("Testing BUSY_PIN (24)...")
        busy_state = GPIO.input(BUSY_PIN)
        print(f"BUSY_PIN current state: {'HIGH' if busy_state else 'LOW'}")
        
        return True
        
    except Exception as e:
        print(f"GPIO test failed: {e}")
        return False
    finally:
        GPIO.cleanup()

def test_spi_communication():
    """Test SPI communication"""
    print("\n=== SPI COMMUNICATION TEST ===")
    
    try:
        spi = spidev.SpiDev()
        spi.open(0, 0)
        spi.max_speed_hz = 4000000
        spi.mode = 0b00
        
        # Test basic SPI transfer
        print("Testing SPI transfer...")
        test_data = [0x00, 0x01, 0x02, 0x03]
        result = spi.xfer2(test_data)
        print(f"Sent: {[hex(x) for x in test_data]}")
        print(f"Received: {[hex(x) for x in result]}")
        
        spi.close()
        print("✓ SPI communication test complete")
        return True
        
    except Exception as e:
        print(f"SPI test failed: {e}")
        return False

def test_display_reset_sequence():
    """Test display reset sequence and check BUSY pin response"""
    print("\n=== DISPLAY RESET SEQUENCE TEST ===")
    
    GPIO.setwarnings(False)
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(RST_PIN, GPIO.OUT)
        GPIO.setup(DC_PIN, GPIO.OUT)
        GPIO.setup(BUSY_PIN, GPIO.IN)
        
        # Initialize SPI
        spi = spidev.SpiDev()
        spi.open(0, 0)
        spi.max_speed_hz = 4000000
        spi.mode = 0b00
        
        print("Initial BUSY pin state:", "HIGH" if GPIO.input(BUSY_PIN) else "LOW")
        
        # Reset sequence
        print("Performing reset sequence...")
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.2)
        GPIO.output(RST_PIN, GPIO.LOW)
        time.sleep(0.002)
        GPIO.output(RST_PIN, GPIO.HIGH)
        time.sleep(0.2)
        
        print("Post-reset BUSY pin state:", "HIGH" if GPIO.input(BUSY_PIN) else "LOW")
        
        # Try power on command
        print("Sending power on command (0x04)...")
        GPIO.output(DC_PIN, GPIO.LOW)  # Command mode
        spi.xfer2([0x04])
        
        print("Waiting for BUSY pin response...")
        start_time = time.time()
        initial_busy = GPIO.input(BUSY_PIN)
        
        # Monitor BUSY pin for 10 seconds
        for i in range(100):
            current_busy = GPIO.input(BUSY_PIN)
            if current_busy != initial_busy:
                print(f"BUSY pin changed from {'HIGH' if initial_busy else 'LOW'} to {'HIGH' if current_busy else 'LOW'} after {time.time() - start_time:.2f}s")
                break
            time.sleep(0.1)
        else:
            print("BUSY pin did not change state - possible connection issue")
            
        final_busy = GPIO.input(BUSY_PIN)
        print(f"Final BUSY pin state: {'HIGH' if final_busy else 'LOW'}")
        
        spi.close()
        return True
        
    except Exception as e:
        print(f"Reset sequence test failed: {e}")
        return False
    finally:
        GPIO.cleanup()

def check_hardware_info():
    """Check hardware and system information"""
    print("\n=== HARDWARE INFORMATION ===")
    
    try:
        # Check Pi model
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if 'Model' in line:
                    print(f"Pi Model: {line.strip()}")
                    break
        
        # Check SPI status
        try:
            with open('/boot/firmware/config.txt', 'r') as f:
                spi_enabled = 'dtparam=spi=on' in f.read()
                print(f"SPI enabled in config: {spi_enabled}")
        except:
            print("Could not check SPI config")
            
        # Check SPI devices
        import os
        spi_devices = os.listdir('/dev/') if os.path.exists('/dev/') else []
        spi_devices = [d for d in spi_devices if d.startswith('spi')]
        print(f"SPI devices: {spi_devices}")
        
        return True
        
    except Exception as e:
        print(f"Hardware info check failed: {e}")
        return False

def main():
    """Run all diagnostic tests"""
    print("E-Paper Display Diagnostic Tool")
    print("=" * 50)
    
    tests = [
        ("Hardware Info", check_hardware_info),
        ("GPIO Connectivity", test_gpio_connectivity),
        ("SPI Communication", test_spi_communication),
        ("Display Reset Sequence", test_display_reset_sequence),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\nRunning {test_name}...")
        try:
            result = test_func()
            results.append((test_name, result))
            print(f"{'✓' if result else '✗'} {test_name}: {'PASSED' if result else 'FAILED'}")
        except Exception as e:
            results.append((test_name, False))
            print(f"✗ {test_name}: FAILED - {e}")
    
    print("\n" + "=" * 50)
    print("DIAGNOSTIC SUMMARY")
    print("=" * 50)
    
    all_passed = True
    for test_name, result in results:
        status = "PASSED" if result else "FAILED"
        print(f"{test_name}: {status}")
        if not result:
            all_passed = False
    
    if all_passed:
        print("\n✓ All tests passed - hardware appears to be working")
        print("If display still doesn't update, check:")
        print("- Display power connection")
        print("- Correct display model (13.3\" Spectra 6)")
        print("- HAT+ is properly seated")
    else:
        print("\n✗ Some tests failed - check hardware connections")

if __name__ == "__main__":
    main()