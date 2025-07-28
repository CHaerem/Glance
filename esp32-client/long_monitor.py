#!/usr/bin/env python3
"""
Extended monitoring for ESP32 display test
"""
import serial
import time
import sys

def monitor_esp32():
    port = '/dev/cu.usbserial-0287BD6B'
    baud = 115200
    
    try:
        print(f"Connecting to {port} at {baud} baud...")
        ser = serial.Serial(port, baud, timeout=2)
        
        print("Monitoring ESP32 for display changes (60 seconds)...")
        print("Watch your display - it should cycle: RED -> BLUE -> GREEN -> WHITE")
        start_time = time.time()
        
        while time.time() - start_time < 60:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    print(f"ESP32: {line}")
                    
                    # Highlight important messages
                    if "RED" in line:
                        print("🔴 RED display should be showing!")
                    elif "BLUE" in line:
                        print("🔵 BLUE display should be showing!")
                    elif "GREEN" in line:
                        print("🟢 GREEN display should be showing!")
                    elif "WHITE" in line:
                        print("⚪ WHITE display should be showing!")
                    elif "Text display completed" in line:
                        print("📝 Text with 'ESP32 WORKING!' should be showing!")
            
            time.sleep(0.1)
        
        ser.close()
        print("\nMonitoring complete.")
        print("Did you see the display change colors? If yes, your ESP32 is working perfectly!")
        
    except serial.SerialException as e:
        print(f"❌ Serial connection failed: {e}")
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped by user")

if __name__ == "__main__":
    monitor_esp32()