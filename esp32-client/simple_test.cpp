/*
 * Simple E-Paper Display Test
 * Tests basic display functionality with proper initialization
 * Use this to verify your wiring and pin configuration
 */

#include <Arduino.h>
#include <SPI.h>

// Waveshare Official Pin Mapping for ESP32
#define EPD_SCK_PIN     13    // SPI Clock (CLK)
#define EPD_MOSI_PIN    14    // SPI MOSI (DIN)  
#define EPD_CS_M_PIN    15    // Chip Select Master
#define EPD_CS_S_PIN    2     // Chip Select Slave
#define EPD_RST_PIN     26    // Reset
#define EPD_DC_PIN      27    // Data/Command
#define EPD_BUSY_PIN    25    // Busy Signal
#define EPD_PWR_PIN     33    // Power Control

// Alternative: Your current pin mapping (comment above and uncomment below if your wiring matches README)
/*
#define EPD_SCK_PIN     18    // SPI Clock (CLK)
#define EPD_MOSI_PIN    23    // SPI MOSI (DIN)  
#define EPD_CS_M_PIN    5     // Chip Select Master
#define EPD_CS_S_PIN    16    // Chip Select Slave
#define EPD_RST_PIN     4     // Reset
#define EPD_DC_PIN      17    // Data/Command
#define EPD_BUSY_PIN    15    // Busy Signal
#define EPD_PWR_PIN     21    // Power Control
*/

// Display constants
#define EPD_WIDTH       1200
#define EPD_HEIGHT      1600
#define EPD_BLACK       0x0
#define EPD_WHITE       0x1
#define EPD_RED         0x3
#define EPD_BLUE        0x5
#define EPD_GREEN       0x6
#define EPD_YELLOW      0x2

// Function declarations
void initializePins();
void testPins();
void testDisplayInit();
void testSPI();
void sendSPIByte(uint8_t data);
void waitForReady();

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("=== E-Paper Display Test ===");
  Serial.println("Pin Configuration:");
  Serial.printf("SCK: %d, MOSI: %d\n", EPD_SCK_PIN, EPD_MOSI_PIN);
  Serial.printf("CS_M: %d, CS_S: %d\n", EPD_CS_M_PIN, EPD_CS_S_PIN);
  Serial.printf("RST: %d, DC: %d, BUSY: %d, PWR: %d\n", EPD_RST_PIN, EPD_DC_PIN, EPD_BUSY_PIN, EPD_PWR_PIN);
  
  // Initialize pins
  initializePins();
  
  Serial.println("Testing pin outputs...");
  testPins();
  
  Serial.println("Testing display power and reset sequence...");
  testDisplayInit();
  
  Serial.println("Test complete - check serial output for results");
}

void loop() {
  // Blink power pin to indicate program is running
  digitalWrite(EPD_PWR_PIN, HIGH);
  delay(1000);
  digitalWrite(EPD_PWR_PIN, LOW);
  delay(1000);
}

void initializePins() {
  // Configure GPIO pins
  pinMode(EPD_BUSY_PIN, INPUT);
  pinMode(EPD_RST_PIN, OUTPUT);
  pinMode(EPD_DC_PIN, OUTPUT);
  pinMode(EPD_PWR_PIN, OUTPUT);
  pinMode(EPD_CS_M_PIN, OUTPUT);
  pinMode(EPD_CS_S_PIN, OUTPUT);
  
  // Initialize SPI pins
  pinMode(EPD_SCK_PIN, OUTPUT);
  pinMode(EPD_MOSI_PIN, OUTPUT);
  
  // Set initial states
  digitalWrite(EPD_CS_M_PIN, HIGH);
  digitalWrite(EPD_CS_S_PIN, HIGH);
  digitalWrite(EPD_SCK_PIN, LOW);
  digitalWrite(EPD_PWR_PIN, HIGH);
  digitalWrite(EPD_RST_PIN, HIGH);
  digitalWrite(EPD_DC_PIN, LOW);
  
  Serial.println("✓ Pins initialized");
}

void testPins() {
  Serial.println("Testing individual pins...");
  
  // Test each output pin
  const int testPins[] = {EPD_RST_PIN, EPD_DC_PIN, EPD_PWR_PIN, EPD_CS_M_PIN, EPD_CS_S_PIN, EPD_SCK_PIN, EPD_MOSI_PIN};
  const char* pinNames[] = {"RST", "DC", "PWR", "CS_M", "CS_S", "SCK", "MOSI"};
  
  for (int i = 0; i < 7; i++) {
    Serial.printf("Testing %s (pin %d): ", pinNames[i], testPins[i]);
    
    digitalWrite(testPins[i], HIGH);
    delay(100);
    digitalWrite(testPins[i], LOW);
    delay(100);
    digitalWrite(testPins[i], HIGH);
    
    Serial.println("OK");
  }
  
  // Test BUSY pin (input)
  Serial.printf("BUSY pin (pin %d) reading: %s\n", EPD_BUSY_PIN, digitalRead(EPD_BUSY_PIN) ? "HIGH" : "LOW");
}

void testDisplayInit() {
  Serial.println("Testing display initialization sequence...");
  
  // Power on sequence
  digitalWrite(EPD_PWR_PIN, HIGH);
  delay(100);
  Serial.println("✓ Power ON");
  
  // Reset sequence
  digitalWrite(EPD_RST_PIN, HIGH);
  delay(200);
  digitalWrite(EPD_RST_PIN, LOW);
  delay(2);
  digitalWrite(EPD_RST_PIN, HIGH);
  delay(200);
  Serial.println("✓ Reset sequence completed");
  
  // Test SPI communication
  Serial.println("Testing SPI communication...");
  testSPI();
  
  // Check BUSY pin during operation
  Serial.printf("BUSY pin status after init: %s\n", digitalRead(EPD_BUSY_PIN) ? "HIGH (busy)" : "LOW (ready)");
  
  // Wait for display to be ready
  waitForReady();
  
  Serial.println("✓ Display initialization test completed");
}

void testSPI() {
  // Test basic SPI bit-banging (like your current library does)
  Serial.println("Testing bit-banged SPI...");
  
  // Select both chips
  digitalWrite(EPD_CS_M_PIN, LOW);
  digitalWrite(EPD_CS_S_PIN, LOW);
  delay(1);
  
  // Send test byte (0xAA = 10101010)
  sendSPIByte(0xAA);
  
  // Deselect chips  
  digitalWrite(EPD_CS_M_PIN, HIGH);
  digitalWrite(EPD_CS_S_PIN, HIGH);
  
  Serial.println("✓ SPI test byte sent");
}

void sendSPIByte(uint8_t data) {
  for (int i = 0; i < 8; i++) {
    // Set data line
    digitalWrite(EPD_MOSI_PIN, (data & 0x80) ? HIGH : LOW);
    data <<= 1;
    
    // Clock pulse
    digitalWrite(EPD_SCK_PIN, HIGH);
    delayMicroseconds(1);
    digitalWrite(EPD_SCK_PIN, LOW);
    delayMicroseconds(1);
  }
}

void waitForReady() {
  Serial.print("Waiting for display ready");
  int timeout = 0;
  while (digitalRead(EPD_BUSY_PIN) == HIGH && timeout < 100) {
    Serial.print(".");
    delay(100);
    timeout++;
  }
  if (timeout >= 100) {
    Serial.println(" TIMEOUT!");
  } else {
    Serial.println(" READY!");
  }
}