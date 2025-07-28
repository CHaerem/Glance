/*
 * Simple Display Test - Just test basic display functionality
 * This replaces main.cpp temporarily to test display without WiFi/server dependencies
 */

#include <Arduino.h>
#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("=== Simple Display Test ===");
  Serial.println("Initializing display...");
  
  // Initialize display
  EPD_13IN3E_Init();
  Serial.println("✓ Display initialized");
  
  // Test 1: Clear display with red
  Serial.println("Test 1: Clearing display with RED...");
  EPD_13IN3E_Clear(EPD_13IN3E_RED);
  Serial.println("✓ Red clear completed");
  
  delay(5000);
  
  // Test 2: Clear display with blue  
  Serial.println("Test 2: Clearing display with BLUE...");
  EPD_13IN3E_Clear(EPD_13IN3E_BLUE);
  Serial.println("✓ Blue clear completed");
  
  delay(5000);
  
  // Test 3: Clear display with white
  Serial.println("Test 3: Clearing display with WHITE...");
  EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
  Serial.println("✓ White clear completed");
  
  Serial.println("=== Display test complete ===");
  Serial.println("If you see color changes on your display, the fix worked!");
}

void loop() {
  // Just blink to show we're alive
  delay(1000);
  Serial.println("Loop running - display test completed");
  delay(4000);
}