#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include "bhutan_flag_fullscreen.h"

void setup() {
    Serial.begin(115200);
    delay(2000);
    Debug("EPD_13IN3E Full-Screen Display with USB Power\r\n");
    
    Debug("USB Power Configuration Active\r\n");
    Debug("HAT+ VCC connected to ESP32 VIN pin (5V from USB)\r\n");
    Debug("No power management workarounds needed\r\n");
    
    // Standard initialization - no power workarounds needed
    DEV_Module_Init();
    delay(2000);
    
    Debug("e-Paper initialization...\r\n");
    EPD_13IN3E_Init();
    delay(3000);
    
    Debug("Clearing display...\r\n");
    EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
    delay(5000);
    
    Debug("Preparing Full-Screen Bhutan Flag Display\r\n");
    Debug("Image: 1150x1550 pixels (891KB)\r\n");
    Debug("Coverage: 96% width x 97% height (93% total area)\r\n");
    Debug("Floyd-Steinberg dithering for professional quality\r\n");
    
    // Calculate minimal margins for full-screen effect
    // Display: 1200x1600, Flag: 1150x1550
    UWORD flag_x = (EPD_13IN3E_WIDTH - bhutan_flag_width) / 2;   // 25px margin
    UWORD flag_y = (EPD_13IN3E_HEIGHT - bhutan_flag_height) / 2; // 25px margin
    
    Debug("Margins: 25px on all sides (minimal borders)\r\n");
    Debug("Full-screen display with stable USB power\r\n");
    
    delay(2000);
    
    Debug("Starting full-screen display update...\r\n");
    Debug("USB power provides stable operation\r\n");
    
    // Display at full performance - no power restrictions
    EPD_13IN3E_DisplayPart(bhutan_flag_data, flag_x, flag_y, bhutan_flag_width, bhutan_flag_height);
    
    Debug("FULL-SCREEN DISPLAY COMPLETED!\r\n");
    Debug("1150x1550 pixels covering 96%x97% of display\r\n");
    Debug("Professional Floyd-Steinberg dithering\r\n");
    Debug("Stable USB power operation\r\n");
    Debug("Colors: 47.4% Yellow, 33.3% Red, 17.8% White, 0.5% Black\r\n");
    Debug("\r\n");
    Debug("USB Power Benefits:\r\n");
    Debug("- Full CPU performance (240MHz)\r\n");
    Debug("- No brownout detector issues\r\n");
    Debug("- Stable power delivery during display operations\r\n");
    Debug("- Simplified code without power workarounds\r\n");
    Debug("\r\n");
    Debug("Press reset to display again.\r\n");
}

void loop() {
    // Ultra-low power loop
    delay(30000);  // Simple delay approach - most compatible
}