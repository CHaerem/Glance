#!/usr/bin/env python3
"""
Test using official Waveshare 13.3k e-paper module
"""

import sys
import os
sys.path.append('./waveshare_lib')

from PIL import Image, ImageDraw, ImageFont
import time

def test_display():
    """Test the display using official library"""
    try:
        print("=== Waveshare 13.3\" E-Paper Test ===")
        
        # Import the official module
        from epd13in3k import EPD
        
        epd = EPD()
        print(f"Display size: {epd.width} x {epd.height}")
        
        print("Initializing display...")
        epd.init()
        
        print("Clearing display...")
        epd.Clear()
        
        print("Creating colorful test image...")
        
        # Create image with 6 colors
        image = Image.new('RGB', (epd.width, epd.height), 255)  # White background
        draw = ImageDraw.Draw(image)
        
        # Define 6-color palette
        colors = [
            (0, 0, 0),        # Black
            (255, 255, 255),  # White
            (255, 0, 0),      # Red
            (255, 255, 0),    # Yellow
            (0, 0, 255),      # Blue
            (0, 255, 0),      # Green
        ]
        
        # Draw horizontal color stripes
        rect_height = epd.height // len(colors)
        for i, color in enumerate(colors):
            y1 = i * rect_height
            y2 = (i + 1) * rect_height
            draw.rectangle([0, y1, epd.width, y2], fill=color)
            
            # Add text label
            color_names = ["Black", "White", "Red", "Yellow", "Blue", "Green"]
            text_color = (255, 255, 255) if i == 0 else (0, 0, 0)  # White text on black, black text elsewhere
            draw.text((50, y1 + rect_height//2 - 20), f"Color {i+1}: {color_names[i]}", fill=text_color)
        
        # Add title
        draw.text((epd.width//2 - 200, 50), "Waveshare 13.3\" Spectra 6 Test", fill=(0, 0, 0))
        draw.text((epd.width//2 - 150, 100), "Official Library Test", fill=(0, 0, 0))
        
        print("Displaying image...")
        epd.display(epd.getbuffer(image))
        
        print("Test pattern displayed! Check your e-paper display.")
        print("The display should show 6 colored horizontal stripes.")
        
        time.sleep(5)  # Give some time to see the result
        
        print("Putting display to sleep...")
        epd.sleep()
        
        print("✓ Test completed successfully!")
        return True
        
    except Exception as e:
        print(f"✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main test function"""
    print("Starting Waveshare E-Paper Library Test")
    print("=" * 50)
    
    try:
        success = test_display()
        
        print("\n" + "=" * 50)
        if success:
            print("✓ DISPLAY TEST PASSED")
            print("Check your e-paper display for the colorful test pattern!")
        else:
            print("✗ DISPLAY TEST FAILED")
            
        return success
        
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        return False
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)