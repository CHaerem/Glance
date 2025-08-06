import serial
import time

try:
    ser = serial.Serial('/dev/cu.usbserial-0287BD6B', 115200, timeout=1)
    print('ESP32 Monitor - Press Ctrl+C to stop')
    print('=' * 40)
    
    while True:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line:
                print(line)
        time.sleep(0.1)
        
except KeyboardInterrupt:
    print('\nStopped monitoring.')
except Exception as e:
    print(f'Error: {e}')
finally:
    try:
        ser.close()
    except:
        pass
EOF < /dev/null