#!/usr/bin/env python3
import serial
import time

def quick_check():
    try:
        ser = serial.Serial('/dev/cu.usbserial-0287BD6B', 115200, timeout=1)
        print("Reading ESP32 output...")
        
        for i in range(30):  # 30 seconds
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    print(line)
            time.sleep(1)
        
        ser.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    quick_check()