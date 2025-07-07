#!/usr/bin/env python3
"""
Test script using official Waveshare e-paper library
"""

import epaper
import time
from PIL import Image, ImageDraw, ImageFont

def test_epd13in3k():
    """Test with epd13in3k module"""
    print("=== Testing epd13in3k ===")
    try:
        epd = epaper.epaper('epd13in3k').EPD()
        print(f"Display size: {epd.width} x {epd.height}")
        
        print("Initializing display...")
        epd.init()
        
        print("Clearing display...")
        epd.Clear()
        
        print("Creating test image...")
        image = Image.new('RGB', (epd.width, epd.height), 255)  # White background
        draw = ImageDraw.Draw(image)
        
        # Draw colored rectangles
        colors = [
            (0, 0, 0),        # Black
            (255, 255, 255),  # White  
            (255, 0, 0),      # Red
            (255, 255, 0),    # Yellow
            (0, 0, 255),      # Blue
            (0, 255, 0),      # Green
        ]
        
        rect_height = epd.height // len(colors)
        for i, color in enumerate(colors):
            y1 = i * rect_height
            y2 = (i + 1) * rect_height
            draw.rectangle([0, y1, epd.width, y2], fill=color)
        
        # Add text
        try:
            font = ImageFont.load_default()
            draw.text((50, 50), "Waveshare 13.3\" Test", fill=(0, 0, 0), font=font)
        except:
            pass
        
        print("Displaying image...")
        epd.display(epd.getbuffer(image))
        
        print("Putting display to sleep...")
        epd.sleep()
        
        print("✓ epd13in3k test completed successfully")
        return True
        
    except Exception as e:
        print(f"✗ epd13in3k test failed: {e}")
        return False

def test_epd13in3b():
    """Test with epd13in3b module"""
    print("\n=== Testing epd13in3b ===")
    try:
        epd = epaper.epaper('epd13in3b').EPD()
        print(f"Display size: {epd.width} x {epd.height}")
        
        print("Initializing display...")
        epd.init()
        
        print("Clearing display...")
        epd.Clear()
        
        print("Creating test image...")
        # For B/W/R displays, use palette mode
        image = Image.new('P', (epd.width, epd.height), 255)  # White background
        draw = ImageDraw.Draw(image)
        
        # Draw test pattern
        draw.rectangle([0, 0, epd.width//2, epd.height//2], fill=0)    # Black
        draw.rectangle([epd.width//2, 0, epd.width, epd.height//2], fill=1)  # Red/other color
        
        # Add text
        draw.text((50, 50), "13.3\" B/W/R Test", fill=0)
        
        print("Displaying image...")
        epd.display(epd.getbuffer(image))
        
        print("Putting display to sleep...")
        epd.sleep()
        
        print("✓ epd13in3b test completed successfully")
        return True
        
    except Exception as e:
        print(f"✗ epd13in3b test failed: {e}")
        return False

def main():
    """Main test function"""
    print("Waveshare E-Paper Library Test")
    print("=" * 40)
    
    # Test both 13.3" modules to see which one works
    results = []
    
    # Test the K model (might be Spectra 6)
    results.append(("epd13in3k", test_epd13in3k()))
    
    # Test the B model (B/W/R)
    results.append(("epd13in3b", test_epd13in3b()))
    
    print("\n" + "=" * 40)
    print("TEST RESULTS")
    print("=" * 40)
    for model, success in results:
        status = "SUCCESS" if success else "FAILED"
        print(f"{model}: {status}")
    
    # Return True if any test succeeded
    return any(result[1] for result in results)

if __name__ == "__main__":
    try:
        success = main()
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        exit(1)