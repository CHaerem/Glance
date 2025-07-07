#!/usr/bin/env python3
"""
Minimal test to debug the library
"""

import sys
sys.path.append('./waveshare_lib')

print("Testing import...")
try:
    from epd13in3k import EPD
    print("✓ Import successful")
    
    epd = EPD()
    print(f"✓ EPD object created, size: {epd.width} x {epd.height}")
    
    print("Attempting init...")
    epd.init()
    print("✓ Init completed")
    
    print("Attempting clear...")
    epd.Clear()
    print("✓ Clear completed")
    
    print("Putting to sleep...")
    epd.sleep()
    print("✓ Sleep completed")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()