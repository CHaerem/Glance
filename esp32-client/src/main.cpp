#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include "bhutan_flag_fullscreen.h"
#include "soc/rtc_cntl_reg.h"
#include "esp32-hal-cpu.h"

void setup() {
    Serial.begin(115200);
    delay(2000);
    Debug("EPD_13IN3E Battery Power Test - Large Image\r\n");
    
    Debug("Battery Power Configuration Active\r\n");
    Debug("Optimized for 10,000 mAh LiPo battery\r\n");
    Debug("Implementing power management for large images\r\n");
    
    // Power management for battery operation
    Debug("Configuring CPU for battery operation...\r\n");
    setCpuFrequencyMhz(80);  // Reduce CPU frequency to save power
    delay(100);
    
    Debug("CPU frequency reduced to 80MHz for power efficiency\r\n");
    
    // Disable brownout detector completely for battery operation
    Debug("Disabling brownout detector for battery operation...\r\n");
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    
    // Extended startup delay for stable power
    Debug("Extended startup delay for power stabilization...\r\n");
    delay(5000);
    
    // Standard initialization
    DEV_Module_Init();
    delay(3000);  // Longer delay for battery power
    
    Debug("e-Paper initialization...\r\n");
    EPD_13IN3E_Init();
    delay(5000);  // Longer delay for battery power
    
    Debug("Clearing display to white...\r\n");
    EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
    
    // Long delay between operations for power recovery
    Debug("Power recovery delay between operations...\r\n");
    delay(10000);
    
    Debug("Preparing Full-Screen Bhutan Flag Display\r\n");
    Debug("Image: 1150x1550 pixels (891KB)\r\n");
    Debug("Battery-optimized power management active\r\n");
    
    // Calculate display area
    UWORD flag_x = (EPD_13IN3E_WIDTH - bhutan_flag_width) / 2;   // 25px margin
    UWORD flag_y = (EPD_13IN3E_HEIGHT - bhutan_flag_height) / 2; // 25px margin
    
    Debug("Starting battery-optimized display operation...\r\n");
    Debug("CPU at 80MHz, brownout disabled, extended delays\r\n");
    
    // Pre-display power stabilization
    delay(5000);
    
    // Display the large image with battery power management
    EPD_13IN3E_DisplayPart(bhutan_flag_data, flag_x, flag_y, bhutan_flag_width, bhutan_flag_height);
    
    Debug("BATTERY-POWERED DISPLAY COMPLETED!\r\n");
    Debug("Large image displayed successfully on battery power\r\n");
    Debug("Power management: 80MHz CPU, no brownout detection\r\n");
    
    // Post-display power recovery
    Debug("Post-display power recovery period...\r\n");
    delay(5000);
    
    // Return to normal power settings for general operation
    Debug("Returning to normal power settings...\r\n");
    setCpuFrequencyMhz(240);  // Return to full speed
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 1);  // Re-enable brownout detection
    
    Debug("Battery power test completed successfully!\r\n");
    Debug("System ready for battery-powered operation\r\n");
    Debug("Press reset to test again.\r\n");
}

void loop() {
    // Ultra-low power loop for battery operation
    delay(60000);  // 1 minute delay for battery conservation
}