/*
 * Hardware Connection Test
 * Tests all display pins to verify wiring
 */

#include <Arduino.h>

// Pin definitions
#define EPD_SCK_PIN     18    // SPI Clock (CLK) 
#define EPD_MOSI_PIN    23    // SPI MOSI (DIN)
#define EPD_CS_M_PIN    5     // Chip Select Master (ORANGE)
#define EPD_CS_S_PIN    16    // Chip Select Slave (GREEN)  
#define EPD_RST_PIN     4     // Reset (PURPLE)
#define EPD_DC_PIN      17    // Data/Command (WHITE)
#define EPD_BUSY_PIN    15    // Busy Signal (BROWN)
#define EPD_PWR_PIN     21    // Power Control (GRAY)

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("=== Hardware Connection Test ===");
  
  // Setup pins
  pinMode(EPD_BUSY_PIN, INPUT);
  pinMode(EPD_RST_PIN, OUTPUT);
  pinMode(EPD_DC_PIN, OUTPUT);
  pinMode(EPD_PWR_PIN, OUTPUT);
  pinMode(EPD_SCK_PIN, OUTPUT);
  pinMode(EPD_MOSI_PIN, OUTPUT);
  pinMode(EPD_CS_M_PIN, OUTPUT);
  pinMode(EPD_CS_S_PIN, OUTPUT);
  
  Serial.println("✓ Pins configured");
  
  // Test power control
  Serial.println("\nTesting power control...");
  digitalWrite(EPD_PWR_PIN, LOW);
  delay(100);
  Serial.println("Power OFF");
  delay(1000);
  
  digitalWrite(EPD_PWR_PIN, HIGH);
  delay(100);
  Serial.println("Power ON");
  delay(1000);
  
  // Test busy pin reading
  Serial.println("\nTesting busy pin...");
  for(int i = 0; i < 10; i++) {
    int busy_state = digitalRead(EPD_BUSY_PIN);
    Serial.printf("BUSY pin read %d: %d\n", i, busy_state);
    delay(100);
  }
  
  // Test reset pin
  Serial.println("\nTesting reset pin...");
  digitalWrite(EPD_RST_PIN, HIGH);
  delay(100);
  Serial.println("Reset HIGH");
  delay(500);
  
  digitalWrite(EPD_RST_PIN, LOW);
  delay(100);
  Serial.println("Reset LOW");
  delay(500);
  
  digitalWrite(EPD_RST_PIN, HIGH);
  delay(100);  
  Serial.println("Reset HIGH");
  
  // Test chip select pins
  Serial.println("\nTesting chip select pins...");
  digitalWrite(EPD_CS_M_PIN, HIGH);
  digitalWrite(EPD_CS_S_PIN, HIGH);
  Serial.println("Both CS pins HIGH");
  delay(500);
  
  digitalWrite(EPD_CS_M_PIN, LOW);
  Serial.println("Master CS LOW");
  delay(500);
  
  digitalWrite(EPD_CS_M_PIN, HIGH);
  digitalWrite(EPD_CS_S_PIN, LOW);
  Serial.println("Slave CS LOW");
  delay(500);
  
  digitalWrite(EPD_CS_S_PIN, HIGH);
  Serial.println("Both CS pins HIGH");
  
  Serial.println("\n=== Hardware Test Complete ===");
  Serial.println("Check connections if any issues reported");
}

void loop() {
  delay(5000);
  
  // Continuous busy pin monitoring
  int busy_state = digitalRead(EPD_BUSY_PIN);
  Serial.printf("BUSY pin: %d (should vary if display is connected)\n", busy_state);
}