#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_sleep.h"
#include "esp_task_wdt.h"

// Configuration constants
#define API_BASE_URL "http://serverpi.local:3000/api/"
#define STATUS_URL "http://serverpi.local:3000/api/device-status"
#define IMAGE_URL "http://serverpi.local:3000/api/image.bin"
#define DEFAULT_SLEEP_TIME 3600000000ULL // 1 hour
#define BATTERY_PIN A13
#define LOW_BATTERY_THRESHOLD 3.3
#define DEVICE_ID "esp32-001"
#define FIRMWARE_VERSION "v2-psram-1.0"

// Display dimensions
#define DISPLAY_WIDTH 1200
#define DISPLAY_HEIGHT 1600
#define IMAGE_BUFFER_SIZE ((DISPLAY_WIDTH * DISPLAY_HEIGHT) / 2) // 960KB for 4-bit packed

// Function declarations
void setupPowerManagement();
bool connectToWiFi();
bool downloadAndDisplayImage();
bool downloadImageToPSRAM();
void generateAndDisplayBhutanFlag();
void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength);
void sendLogToServer(const char *message, const char *level = "INFO");
float readBatteryVoltage();
void enterDeepSleep(uint64_t sleepTime);
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b);

// E-ink color palette
const uint8_t EINK_BLACK = 0x0;
const uint8_t EINK_WHITE = 0x1;
const uint8_t EINK_YELLOW = 0x2;
const uint8_t EINK_RED = 0x3;
const uint8_t EINK_BLUE = 0x5;
const uint8_t EINK_GREEN = 0x6;

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Debug("=== ESP32 Feather v2 E-ink Display ===\r\n");
    Debug("Device ID: " DEVICE_ID "\r\n");
    Debug("Firmware: " FIRMWARE_VERSION "\r\n");
    Debug("Display: Waveshare 13.3\" Spectra 6\r\n");
    Debug("=======================================\r\n");
    
    // Check PSRAM availability (ESP32-PICO-V3 has embedded PSRAM)
    Debug("Regular heap: " + String(ESP.getFreeHeap()) + " bytes\r\n");
    
    // Initialize PSRAM if available
    if (psramInit()) {
        Debug("PSRAM initialized successfully\r\n");
        Debug("PSRAM size: " + String(ESP.getPsramSize()) + " bytes\r\n");
        Debug("PSRAM free: " + String(ESP.getFreePsram()) + " bytes\r\n");
    } else {
        Debug("PSRAM initialization failed or not available\r\n");
        Debug("PSRAM via heap_caps: " + String(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)) + " bytes\r\n");
    }
    
    // Setup power management
    setupPowerManagement();
    
    // Read battery voltage
    float batteryVoltage = readBatteryVoltage();
    Debug("Battery Voltage: " + String(batteryVoltage, 2) + "V\r\n");
    
    if (batteryVoltage < LOW_BATTERY_THRESHOLD) {
        Debug("Low battery detected, entering extended sleep\r\n");
        enterDeepSleep(DEFAULT_SLEEP_TIME * 2); // Double sleep time for low battery
        return;
    }
    
    // Connect to WiFi
    if (!connectToWiFi()) {
        Debug("WiFi connection failed, displaying fallback flag\r\n");
        generateAndDisplayBhutanFlag();
        enterDeepSleep(DEFAULT_SLEEP_TIME);
        return;
    }
    
    // Report device status
    int signalStrength = WiFi.RSSI();
    reportDeviceStatus("awake", batteryVoltage, signalStrength);
    sendLogToServer("ESP32 v2 awakened, downloading image");
    
    // Initialize e-Paper display
    Debug("Initializing e-Paper display...\r\n");
    DEV_Module_Init();
    delay(2000);
    EPD_13IN3E_Init();
    delay(2000);
    
    // Clear display with white background first
    Debug("Clearing display...\r\n");
    EPD_13IN3E_Clear(EINK_WHITE);
    Debug("Display cleared\r\n");
    delay(1000);
    
    // Download and display image from server
    bool success = downloadAndDisplayImage();
    
    if (success) {
        reportDeviceStatus("display_updated", batteryVoltage, signalStrength);
        sendLogToServer("Image downloaded and displayed successfully");
    } else {
        reportDeviceStatus("display_fallback", batteryVoltage, signalStrength);
        sendLogToServer("Download failed, displaying fallback flag");
        generateAndDisplayBhutanFlag();
    }
    
    // Power down display
    EPD_13IN3E_Sleep();
    
    // Report going to sleep
    reportDeviceStatus("sleeping", batteryVoltage, signalStrength);
    sendLogToServer("Entering deep sleep");
    
    // Enter deep sleep
    enterDeepSleep(DEFAULT_SLEEP_TIME);
}

void loop() {
    // Should never be reached due to deep sleep
    delay(1000);
}

void setupPowerManagement() {
    Debug("Setting up power management...\r\n");
    
    // Configure watchdog timer
    esp_task_wdt_init(300, true);
    esp_task_wdt_add(NULL);
    
    // Configure wake-up source
    esp_sleep_enable_timer_wakeup(DEFAULT_SLEEP_TIME);
}

bool connectToWiFi() {
    Debug("Connecting to WiFi: " + String(WIFI_SSID) + "\r\n");
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Debug(".");
        attempts++;
        esp_task_wdt_reset();
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Debug("\r\nWiFi connected!\r\n");
        Debug("IP address: " + WiFi.localIP().toString() + "\r\n");
        Debug("Signal strength: " + String(WiFi.RSSI()) + " dBm\r\n");
        return true;
    }
    
    Debug("\r\nWiFi connection failed!\r\n");
    return false;
}

bool downloadAndDisplayImage() {
    Debug("=== DOWNLOADING IMAGE FROM SERVER ===\r\n");
    
    // Try to download to PSRAM first
    if (downloadImageToPSRAM()) {
        return true;
    }
    
    // If PSRAM download fails, try server's processed image endpoint
    Debug("PSRAM download failed, trying processed image from server\r\n");
    
    HTTPClient http;
    http.begin(API_BASE_URL "current.json");
    http.setTimeout(60000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
    
    int httpResponseCode = http.GET();
    Debug("HTTP response: " + String(httpResponseCode) + "\r\n");
    
    if (httpResponseCode == 200) {
        String payload = http.getString();
        http.end();
        
        // Parse JSON response (simplified - assuming server sends pre-processed e-ink data)
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error && doc.containsKey("hasImage") && doc["hasImage"]) {
            Debug("Server has image available\r\n");
            return downloadImageToPSRAM(); // Try PSRAM download again
        }
    }
    
    http.end();
    return false;
}

bool downloadImageToPSRAM() {
    Debug("=== DOWNLOADING IMAGE ===\r\n");
    Debug("Regular heap: " + String(ESP.getFreeHeap()) + " bytes\r\n");
    Debug("PSRAM free: " + String(ESP.getFreePsram()) + " bytes\r\n");
    Debug("Heap caps PSRAM: " + String(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)) + " bytes\r\n");
    
    // Allocate buffers - RGB input buffer (5.76MB) and e-ink output buffer (960KB)  
    const int RGB_BUFFER_SIZE = DISPLAY_WIDTH * DISPLAY_HEIGHT * 3; // 5.76MB
    const int EINK_BUFFER_SIZE = IMAGE_BUFFER_SIZE; // 960KB
    
    uint8_t* rgbBuffer = nullptr;
    uint8_t* einkBuffer = nullptr;
    
    // Try to allocate both buffers in PSRAM
    if (ESP.getFreePsram() > (RGB_BUFFER_SIZE + EINK_BUFFER_SIZE)) {
        rgbBuffer = (uint8_t*)ps_malloc(RGB_BUFFER_SIZE);
        einkBuffer = (uint8_t*)ps_malloc(EINK_BUFFER_SIZE);
        if (rgbBuffer && einkBuffer) {
            Debug("SUCCESS: Using PSRAM for both RGB (5.76MB) and e-ink (960KB) buffers\r\n");
        }
    }
    
    // Try heap_caps PSRAM allocation
    if (!rgbBuffer || !einkBuffer) {
        if (rgbBuffer) { free(rgbBuffer); rgbBuffer = nullptr; }
        if (einkBuffer) { free(einkBuffer); einkBuffer = nullptr; }
        
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > (RGB_BUFFER_SIZE + EINK_BUFFER_SIZE)) {
            rgbBuffer = (uint8_t*)heap_caps_malloc(RGB_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
            einkBuffer = (uint8_t*)heap_caps_malloc(EINK_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
            if (rgbBuffer && einkBuffer) {
                Debug("SUCCESS: Using heap_caps PSRAM for both buffers\r\n");
            }
        }
    }
    
    if (!rgbBuffer || !einkBuffer) {
        Debug("ERROR: Cannot allocate RGB and e-ink buffers!\r\n");
        Debug("Need " + String((RGB_BUFFER_SIZE + EINK_BUFFER_SIZE) / 1024) + "KB total\r\n");
        Debug("Available PSRAM: " + String(ESP.getFreePsram() / 1024) + "KB\r\n");
        if (rgbBuffer) free(rgbBuffer);
        if (einkBuffer) free(einkBuffer);
        return false;
    }
    
    // Download raw binary image data
    HTTPClient http;
    http.begin(IMAGE_URL);
    http.setTimeout(60000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
    
    int httpCode = http.GET();
    Debug("Image download response: " + String(httpCode) + "\r\n");
    
    if (httpCode != HTTP_CODE_OK) {
        Debug("Download failed with code: " + String(httpCode) + "\r\n");
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
            heap_caps_free(rgbBuffer);
            heap_caps_free(einkBuffer);
        } else {
            free(rgbBuffer);
            free(einkBuffer);
        }
        http.end();
        return false;
    }
    
    // Stream RGB data into buffer
    WiFiClient* stream = http.getStreamPtr();
    int totalBytes = 0;
    int contentLength = http.getSize();
    Debug("Content length: " + String(contentLength) + " bytes (expecting RGB)\r\n");
    
    while (http.connected() && totalBytes < RGB_BUFFER_SIZE) {
        size_t available = stream->available();
        if (available > 0) {
            int chunkSize = min((int)available, min(4096, RGB_BUFFER_SIZE - totalBytes));
            int bytesRead = stream->readBytes(rgbBuffer + totalBytes, chunkSize);
            totalBytes += bytesRead;
            
            if (totalBytes % 500000 == 0) {
                Debug("Downloaded RGB: " + String(totalBytes / 1024) + "KB\r\n");
            }
        } else {
            delay(10);
        }
        esp_task_wdt_reset();
    }
    
    http.end();
    Debug("Download complete: " + String(totalBytes) + " bytes\r\n");
    
    // Convert RGB to e-ink format if we got enough data
    if (totalBytes >= RGB_BUFFER_SIZE * 0.9) {
        Debug("Converting RGB to Spectra 6 e-ink format...\r\n");
        
        // Convert RGB pixels to 4-bit packed e-ink colors (2 pixels per byte)
        for (int i = 0; i < DISPLAY_WIDTH * DISPLAY_HEIGHT; i++) {
            int rgbIndex = i * 3;  // RGB: 3 bytes per pixel
            int einkByteIndex = i / 2;  // E-ink: 2 pixels per byte
            bool isEvenPixel = (i % 2) == 0;
            
            // Extract RGB values
            uint8_t r = rgbBuffer[rgbIndex];
            uint8_t g = rgbBuffer[rgbIndex + 1];
            uint8_t b = rgbBuffer[rgbIndex + 2];
            
            // Convert RGB to Spectra 6 color
            uint8_t einkColor = mapRGBToEink(r, g, b);
            
            // Pack into 4-bit format
            if (isEvenPixel) {
                einkBuffer[einkByteIndex] = (einkColor << 4);  // Upper nibble
            } else {
                einkBuffer[einkByteIndex] |= einkColor;        // Lower nibble
            }
            
            // Progress indicator
            if (i % 200000 == 0) {
                Debug("Converted: " + String(i / 1000) + "K pixels\r\n");
                esp_task_wdt_reset();
            }
        }
        
        Debug("RGB conversion complete, displaying image...\r\n");
        EPD_13IN3E_Display(einkBuffer);
        Debug("SUCCESS: Converted image displayed!\r\n");
        
        // Clean up
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
            heap_caps_free(rgbBuffer);
            heap_caps_free(einkBuffer);
        } else {
            free(rgbBuffer);
            free(einkBuffer);
        }
        return true;
    } else {
        Debug("ERROR: Incomplete RGB download\r\n");
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
            heap_caps_free(rgbBuffer);
            heap_caps_free(einkBuffer);
        } else {
            free(rgbBuffer);
            free(einkBuffer);
        }
        return false;
    }
}

void generateAndDisplayBhutanFlag() {
    Debug("=== DOWNLOADING BHUTAN FLAG (FALLBACK) ===\r\n");
    
    // Try to download the actual Bhutan flag from server first
    HTTPClient http;
    http.begin("http://serverpi.local:3000/api/bhutan.bin");
    http.setTimeout(30000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
    
    int httpCode = http.GET();
    Debug("Bhutan flag download response: " + String(httpCode) + "\r\n");
    
    if (httpCode == 200) {
        Debug("Server has Bhutan flag, downloading...\r\n");
        
        // Allocate buffers for RGB and e-ink conversion  
        const int RGB_BUFFER_SIZE = DISPLAY_WIDTH * DISPLAY_HEIGHT * 3;
        uint8_t* rgbBuffer = (uint8_t*)heap_caps_malloc(RGB_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
        uint8_t* einkBuffer = (uint8_t*)heap_caps_malloc(IMAGE_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
        
        if (!rgbBuffer) rgbBuffer = (uint8_t*)malloc(RGB_BUFFER_SIZE);
        if (!einkBuffer) einkBuffer = (uint8_t*)malloc(IMAGE_BUFFER_SIZE);
        
        if (rgbBuffer && einkBuffer) {
            // Download RGB data
            WiFiClient* stream = http.getStreamPtr();
            int totalBytes = 0;
            
            while (http.connected() && totalBytes < RGB_BUFFER_SIZE) {
                size_t available = stream->available();
                if (available > 0) {
                    int chunkSize = min((int)available, min(4096, RGB_BUFFER_SIZE - totalBytes));
                    int bytesRead = stream->readBytes(rgbBuffer + totalBytes, chunkSize);
                    totalBytes += bytesRead;
                } else {
                    delay(10);
                }
                esp_task_wdt_reset();
            }
            
            http.end();
            
            if (totalBytes >= RGB_BUFFER_SIZE * 0.9) {
                Debug("Converting Bhutan flag RGB to e-ink...\r\n");
                
                // Convert RGB to e-ink format
                for (int i = 0; i < DISPLAY_WIDTH * DISPLAY_HEIGHT; i++) {
                    int rgbIndex = i * 3;
                    int einkByteIndex = i / 2;
                    bool isEvenPixel = (i % 2) == 0;
                    
                    uint8_t r = rgbBuffer[rgbIndex];
                    uint8_t g = rgbBuffer[rgbIndex + 1];
                    uint8_t b = rgbBuffer[rgbIndex + 2];
                    uint8_t einkColor = mapRGBToEink(r, g, b);
                    
                    if (isEvenPixel) {
                        einkBuffer[einkByteIndex] = (einkColor << 4);
                    } else {
                        einkBuffer[einkByteIndex] |= einkColor;
                    }
                    
                    if (i % 200000 == 0) {
                        esp_task_wdt_reset();
                    }
                }
                
                Debug("Displaying actual Bhutan flag...\r\n");
                EPD_13IN3E_Display(einkBuffer);
                Debug("SUCCESS: Actual Bhutan flag displayed!\r\n");
                
                // Cleanup
                if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
                    heap_caps_free(rgbBuffer);
                    heap_caps_free(einkBuffer);
                } else {
                    free(rgbBuffer);
                    free(einkBuffer);
                }
                return;
            }
        }
        
        // Cleanup on failure
        if (rgbBuffer) {
            if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) heap_caps_free(rgbBuffer);
            else free(rgbBuffer);
        }
        if (einkBuffer) {
            if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) heap_caps_free(einkBuffer);
            else free(einkBuffer);
        }
    }
    
    http.end();
    Debug("Server Bhutan flag failed, using simple fallback...\r\n");
    
    // Fallback: simple geometric flag if server fails
    uint8_t* flagBuffer = (uint8_t*)heap_caps_malloc(IMAGE_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
    if (!flagBuffer) {
        flagBuffer = (uint8_t*)malloc(IMAGE_BUFFER_SIZE);
        if (!flagBuffer) {
            Debug("ERROR: Cannot allocate simple flag buffer\r\n");
            return;
        }
    }
    
    memset(flagBuffer, 0, IMAGE_BUFFER_SIZE);
    
    // Simple diagonal Bhutan-inspired pattern
    for (int y = 0; y < DISPLAY_HEIGHT; y++) {
        for (int x = 0; x < DISPLAY_WIDTH; x++) {
            int pixelIndex = y * DISPLAY_WIDTH + x;
            int byteIndex = pixelIndex / 2;
            bool isEvenPixel = (pixelIndex % 2) == 0;
            
            uint8_t color;
            if (y < (DISPLAY_HEIGHT * x / DISPLAY_WIDTH)) {
                color = EINK_YELLOW;
            } else {
                color = EINK_RED;
            }
            
            // Simple white circle for dragon
            int centerX = DISPLAY_WIDTH / 2;
            int centerY = DISPLAY_HEIGHT / 2;
            int dragonRadius = 200;
            int dx = x - centerX;
            int dy = y - centerY;
            if (dx*dx + dy*dy < dragonRadius*dragonRadius) {
                color = EINK_WHITE;
            }
            
            if (isEvenPixel) {
                flagBuffer[byteIndex] = (color << 4);
            } else {
                flagBuffer[byteIndex] |= color;
            }
        }
        
        if (y % 400 == 0) {
            esp_task_wdt_reset();
        }
    }
    
    Debug("Displaying simple Bhutan flag fallback...\r\n");
    EPD_13IN3E_Display(flagBuffer);
    Debug("SUCCESS: Simple Bhutan flag displayed!\r\n");
    
    if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
        heap_caps_free(flagBuffer);
    } else {
        free(flagBuffer);
    }
}

void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength) {
    Debug("Reporting status: " + String(status) + "\r\n");
    
    HTTPClient http;
    http.begin(STATUS_URL);
    http.setTimeout(10000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
    
    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    doc["status"] = status;
    doc["batteryVoltage"] = batteryVoltage;
    doc["signalStrength"] = signalStrength;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["psramFree"] = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
    doc["uptime"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpCode = http.POST(jsonString);
    if (httpCode > 0) {
        Debug("Status reported: " + String(httpCode) + "\r\n");
    } else {
        Debug("Status report failed: " + String(httpCode) + "\r\n");
    }
    
    http.end();
}

void sendLogToServer(const char *message, const char *level) {
    Debug("Log: " + String(message) + "\r\n");
    
    HTTPClient http;
    http.begin(API_BASE_URL "logs");
    http.setTimeout(5000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
    
    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    doc["logs"] = message;
    doc["logLevel"] = level;
    doc["deviceTime"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpCode = http.POST(jsonString);
    http.end();
}

float readBatteryVoltage() {
    int adcReading = analogRead(BATTERY_PIN);
    float voltage = (adcReading / 4095.0) * 3.3 * 2.0; // Voltage divider factor
    return voltage;
}

void enterDeepSleep(uint64_t sleepTime) {
    Debug("Entering deep sleep for " + String(sleepTime / 1000000) + " seconds\r\n");
    esp_sleep_enable_timer_wakeup(sleepTime);
    esp_deep_sleep_start();
}

// Simple RGB to e-ink color mapping
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b) {
    int brightness = (r + g + b) / 3;
    
    if (brightness < 30) return EINK_BLACK;
    if (brightness > 230) return EINK_WHITE;
    
    // Color detection
    if (r > g && r > b && r > 150) return EINK_RED;
    if (g > r && g > b) return EINK_GREEN;
    if (b > r && b > g && b > 100) return EINK_BLUE;
    if (r > 150 && g > 150 && b < 100) return EINK_YELLOW;
    
    return brightness > 128 ? EINK_WHITE : EINK_BLACK;
}