#!/usr/bin/env python3

import RPi.GPIO as GPIO
import time

# Test different GPIO initialization approaches
def test_gpio_approach_1():
    print("Testing Approach 1: Direct setup")
    try:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(17, GPIO.OUT)
        GPIO.setup(25, GPIO.OUT)
        GPIO.setup(8, GPIO.OUT)
        GPIO.setup(24, GPIO.IN)
        print("✓ Approach 1 SUCCESS")
        GPIO.cleanup()
        return True
    except Exception as e:
        print(f"✗ Approach 1 FAILED: {e}")
        try:
            GPIO.cleanup()
        except:
            pass
        return False

def test_gpio_approach_2():
    print("Testing Approach 2: Cleanup first")
    try:
        GPIO.setwarnings(False)
        GPIO.cleanup()
        time.sleep(0.1)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(17, GPIO.OUT)
        GPIO.setup(25, GPIO.OUT)
        GPIO.setup(8, GPIO.OUT)
        GPIO.setup(24, GPIO.IN)
        print("✓ Approach 2 SUCCESS")
        GPIO.cleanup()
        return True
    except Exception as e:
        print(f"✗ Approach 2 FAILED: {e}")
        try:
            GPIO.cleanup()
        except:
            pass
        return False

def test_gpio_approach_3():
    print("Testing Approach 3: Individual pin setup")
    try:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        
        pins = [17, 25, 8, 24]
        modes = [GPIO.OUT, GPIO.OUT, GPIO.OUT, GPIO.IN]
        
        for pin, mode in zip(pins, modes):
            GPIO.setup(pin, mode)
            print(f"  Pin {pin} setup OK")
            
        print("✓ Approach 3 SUCCESS")
        GPIO.cleanup()
        return True
    except Exception as e:
        print(f"✗ Approach 3 FAILED: {e}")
        try:
            GPIO.cleanup()
        except:
            pass
        return False

if __name__ == "__main__":
    print("GPIO Initialization Test")
    print("=" * 30)
    
    success = False
    success |= test_gpio_approach_1()
    success |= test_gpio_approach_2()
    success |= test_gpio_approach_3()
    
    if success:
        print("\nAt least one approach worked!")
    else:
        print("\nAll approaches failed - checking system...")
        print("GPIO version:", GPIO.VERSION)
        import os
        print("User:", os.getenv('USER'))
        print("Groups:", os.getenv('GROUPS', 'Not set'))