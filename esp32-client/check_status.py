#!/usr/bin/env python3
"""
Quick script to check if ESP32 is communicating after pin fix
"""
import serial
import time
import sys

def check_esp32_status():
    port = '/dev/cu.usbserial-0287BD6B'
    baud = 115200
    
    try:
        print(f"Connecting to {port} at {baud} baud...")
        ser = serial.Serial(port, baud, timeout=2)
        
        print("Listening for ESP32 output (15 seconds)...")
        start_time = time.time()
        
        while time.time() - start_time < 15:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    print(f"ESP32: {line}")
                    
                    # Look for key indicators
                    if "Display initialized" in line:
                        print("✅ Display initialization successful!")
                    elif "Clear(RED)" in line:
                        print("✅ Display clear command executed!")
                    elif "WiFi connected" in line:
                        print("✅ WiFi connection successful!")
                    elif "ERROR" in line or "FAILED" in line:
                        print("❌ Error detected!")
            
            time.sleep(0.1)
        
        ser.close()
        print("\nMonitoring complete.")
        
    except serial.SerialException as e:
        print(f"❌ Serial connection failed: {e}")
        print("Make sure ESP32 is connected and port is correct")
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped by user")

if __name__ == "__main__":
    check_esp32_status()