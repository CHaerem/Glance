#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_sleep.h"
#include "esp_task_wdt.h"
#include "driver/rtc_io.h"
#include "esp_wifi.h"
#include "esp_bt.h"

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
void teardownRadios();
void powerDownDisplay();
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
    
    // Power down display and radios
    powerDownDisplay();
    teardownRadios();
    
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
    
    // Prefer modem sleep while connected to reduce peak current
    WiFi.setSleep(true);

    // ADC config for better voltage readings
    analogReadResolution(12);
    analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
    
    // Configure wake-up source
    esp_sleep_enable_timer_wakeup(DEFAULT_SLEEP_TIME);
}

bool connectToWiFi() {
    Debug("Connecting to WiFi: " + String(WIFI_SSID) + "\r\n");
    
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(true);
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
    Debug("=== DOWNLOADING IMAGE (STREAMING) ===\r\n");
    Debug("Regular heap: " + String(ESP.getFreeHeap()) + " bytes\r\n");
    Debug("PSRAM free: " + String(ESP.getFreePsram()) + " bytes\r\n");
    Debug("Heap caps PSRAM: " + String(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)) + " bytes\r\n");
    
    // Use streaming approach: only allocate e-ink output buffer (960KB)
    const int EINK_BUFFER_SIZE = IMAGE_BUFFER_SIZE; // 960KB
    const int CHUNK_SIZE = 4096; // 4KB chunks for streaming
    
    uint8_t* einkBuffer = nullptr;
    uint8_t* rgbChunk = nullptr;
    
    // Allocate e-ink buffer in PSRAM
    if (ESP.getFreePsram() > EINK_BUFFER_SIZE) {
        einkBuffer = (uint8_t*)ps_malloc(EINK_BUFFER_SIZE);
    }
    if (!einkBuffer && heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > EINK_BUFFER_SIZE) {
        einkBuffer = (uint8_t*)heap_caps_malloc(EINK_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
    }
    if (!einkBuffer) {
        einkBuffer = (uint8_t*)malloc(EINK_BUFFER_SIZE);
    }
    
    // Allocate small RGB chunk buffer in regular heap
    rgbChunk = (uint8_t*)malloc(CHUNK_SIZE);
    
    if (!einkBuffer || !rgbChunk) {
        Debug("ERROR: Cannot allocate streaming buffers!\r\n");
        Debug("E-ink buffer: " + String(EINK_BUFFER_SIZE / 1024) + "KB needed\r\n");
        Debug("Available PSRAM: " + String(ESP.getFreePsram() / 1024) + "KB\r\n");
        if (einkBuffer) free(einkBuffer);
        if (rgbChunk) free(rgbChunk);
        return false;
    }
    
    Debug("SUCCESS: Using streaming approach - e-ink buffer: " + String(EINK_BUFFER_SIZE / 1024) + "KB\r\n");
    
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
            heap_caps_free(einkBuffer);
        } else {
            free(einkBuffer);
        }
        free(rgbChunk);
        http.end();
        return false;
    }
    
    // Stream and convert RGB data on-the-fly
    WiFiClient* stream = http.getStreamPtr();
    int totalBytesRead = 0;
    int pixelIndex = 0;
    int contentLength = http.getSize();
    Debug("Content length: " + String(contentLength) + " bytes (streaming RGB)\r\n");
    
    // Clear e-ink buffer
    memset(einkBuffer, 0, EINK_BUFFER_SIZE);
    
    while (http.connected() && totalBytesRead < contentLength) {
        size_t available = stream->available();
        if (available > 0) {
            // Read chunk (ensure we read RGB triplets - multiple of 3)
            int readSize = min((int)available, CHUNK_SIZE);
            readSize = (readSize / 3) * 3; // Align to RGB triplets
            if (readSize < 3) readSize = 3; // Minimum one RGB triplet
            
            int bytesRead = stream->readBytes(rgbChunk, readSize);
            totalBytesRead += bytesRead;
            
            // Process RGB triplets in this chunk
            for (int i = 0; i < bytesRead && pixelIndex < (DISPLAY_WIDTH * DISPLAY_HEIGHT); i += 3) {
                if (i + 2 < bytesRead) { // Ensure we have full RGB triplet
                    uint8_t r = rgbChunk[i];
                    uint8_t g = rgbChunk[i + 1];
                    uint8_t b = rgbChunk[i + 2];
                    
                    // Convert RGB/BGR to Spectra 6 color
                    uint8_t einkColor = mapRGBToEink(r, g, b);
                    
                    // Pack into 4-bit format (2 pixels per byte)
                    int einkByteIndex = pixelIndex / 2;
                    bool isEvenPixel = (pixelIndex % 2) == 0;
                    
                    if (isEvenPixel) {
                        einkBuffer[einkByteIndex] = (einkColor << 4);  // Upper nibble
                    } else {
                        einkBuffer[einkByteIndex] |= einkColor;        // Lower nibble
                    }
                    
                    pixelIndex++;
                }
            }
            
            // Progress indicator
            if (totalBytesRead % 500000 == 0) {
                Debug("Streamed: " + String(totalBytesRead / 1024) + "KB, pixels: " + String(pixelIndex / 1000) + "K\r\n");
            }
        } else {
            delay(10);
        }
        esp_task_wdt_reset();
    }
    
    http.end();
    Debug("Stream complete: " + String(totalBytesRead) + " bytes, " + String(pixelIndex) + " pixels\r\n");
    
    // Display if we got most of the image
    if (pixelIndex >= (DISPLAY_WIDTH * DISPLAY_HEIGHT * 0.9)) {
        Debug("Displaying streamed image...\r\n");
        
        // Small delay for Feather v2 power stabilization
        delay(2000);
        esp_task_wdt_reset();
        
        EPD_13IN3E_Display(einkBuffer);
        Debug("SUCCESS: Streamed image displayed!\r\n");
        
        // Clean up
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
            heap_caps_free(einkBuffer);
        } else {
            free(einkBuffer);
        }
        free(rgbChunk);
        return true;
    } else {
        Debug("ERROR: Incomplete streaming download\r\n");
        if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
            heap_caps_free(einkBuffer);
        } else {
            free(einkBuffer);
        }
        free(rgbChunk);
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
        
        // Use streaming approach for Bhutan flag too
        const int CHUNK_SIZE = 4096;
        const int EINK_BUFFER_SIZE = IMAGE_BUFFER_SIZE; // 960KB
        
        uint8_t* einkBuffer = (uint8_t*)heap_caps_malloc(EINK_BUFFER_SIZE, MALLOC_CAP_SPIRAM);
        if (!einkBuffer) einkBuffer = (uint8_t*)malloc(EINK_BUFFER_SIZE);
        
        uint8_t* rgbChunk = (uint8_t*)malloc(CHUNK_SIZE);
        
        if (einkBuffer && rgbChunk) {
            Debug("Streaming Bhutan flag conversion...\r\n");
            memset(einkBuffer, 0, EINK_BUFFER_SIZE);
            
            // Stream and convert on-the-fly
            WiFiClient* stream = http.getStreamPtr();
            int totalBytesRead = 0;
            int pixelIndex = 0;
            int contentLength = http.getSize();
            
            while (http.connected() && totalBytesRead < contentLength) {
                size_t available = stream->available();
                if (available > 0) {
                    int readSize = min((int)available, CHUNK_SIZE);
                    readSize = (readSize / 3) * 3; // Align to RGB triplets
                    if (readSize < 3) readSize = 3;
                    
                    int bytesRead = stream->readBytes(rgbChunk, readSize);
                    totalBytesRead += bytesRead;
                    
                    // Process RGB triplets
                    for (int i = 0; i < bytesRead && pixelIndex < (DISPLAY_WIDTH * DISPLAY_HEIGHT); i += 3) {
                        if (i + 2 < bytesRead) {
                            uint8_t r = rgbChunk[i];
                            uint8_t g = rgbChunk[i + 1];
                            uint8_t b = rgbChunk[i + 2];
                            uint8_t einkColor = mapRGBToEink(r, g, b);
                            
                            int einkByteIndex = pixelIndex / 2;
                            bool isEvenPixel = (pixelIndex % 2) == 0;
                            
                            if (isEvenPixel) {
                                einkBuffer[einkByteIndex] = (einkColor << 4);
                            } else {
                                einkBuffer[einkByteIndex] |= einkColor;
                            }
                            
                            pixelIndex++;
                        }
                    }
                } else {
                    delay(10);
                }
                esp_task_wdt_reset();
            }
            
            http.end();
            
            if (pixelIndex >= (DISPLAY_WIDTH * DISPLAY_HEIGHT * 0.9)) {
                Debug("Displaying actual Bhutan flag...\r\n");
                EPD_13IN3E_Display(einkBuffer);
                Debug("SUCCESS: Actual Bhutan flag displayed!\r\n");
                
                // Cleanup
                if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) {
                    heap_caps_free(einkBuffer);
                } else {
                    free(einkBuffer);
                }
                free(rgbChunk);
                return;
            }
        }
        
        // Cleanup on failure
        if (einkBuffer) {
            if (heap_caps_get_free_size(MALLOC_CAP_SPIRAM) > 0) heap_caps_free(einkBuffer);
            else free(einkBuffer);
        }
        if (rgbChunk) free(rgbChunk);
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

// Cleanly power down the e-paper panel and cut its power rail
void powerDownDisplay() {
    Debug("Powering down e-Paper panel...\r\n");
    // Put panel into deep sleep
    EPD_13IN3E_Sleep();
    // Cut panel power rail
    DEV_Module_Exit();
    // Ensure the power pin is driven low and held through deep sleep
    pinMode(EPD_PWR_PIN, OUTPUT);
    digitalWrite(EPD_PWR_PIN, LOW);
}

// Cleanly shut down WiFi/BT to minimize sleep current
void teardownRadios() {
    Debug("Shutting down radios...\r\n");
    WiFi.disconnect(true, true);
    WiFi.mode(WIFI_OFF);
    esp_wifi_stop();
    btStop();
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
    
    // Create status object as expected by server
    JsonObject statusObj = doc.createNestedObject("status");
    statusObj["status"] = status;
    statusObj["batteryVoltage"] = batteryVoltage;
    statusObj["signalStrength"] = signalStrength;
    statusObj["firmwareVersion"] = FIRMWARE_VERSION;
    statusObj["freeHeap"] = ESP.getFreeHeap();
    statusObj["psramFree"] = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
    statusObj["uptime"] = millis();
    
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
    // Using 12-bit ADC, 11dB attenuation (~0-3.3V), and a 2:1 divider on the board
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;
    return voltage;
}

void enterDeepSleep(uint64_t sleepTime) {
    Debug("Entering deep sleep for " + String(sleepTime / 1000000) + " seconds\r\n");

    // Hold display power rail off during deep sleep to prevent leakage
    rtc_gpio_init((gpio_num_t)EPD_PWR_PIN);
    rtc_gpio_set_direction((gpio_num_t)EPD_PWR_PIN, RTC_GPIO_MODE_OUTPUT_ONLY);
    rtc_gpio_set_level((gpio_num_t)EPD_PWR_PIN, 0);
    rtc_gpio_hold_en((gpio_num_t)EPD_PWR_PIN);
    gpio_deep_sleep_hold_en();

    esp_sleep_enable_timer_wakeup(sleepTime);
    esp_deep_sleep_start();
}

// If your server sends BGR instead of RGB, set this to 1.
#ifndef COLOR_ORDER_BGR
#define COLOR_ORDER_BGR 0
#endif

// Six-color palette used by server dithering (must match server's conversion palette)
// These are the target RGBs the server chooses during dithering; we classify to these indices.
struct SpectraColor { uint8_t r, g, b, idx; };
static const SpectraColor SPECTRA6_PALETTE[] = {
    { 0,   0,   0,   0x0 }, // Black
    { 255, 255, 255, 0x1 }, // White
    { 255, 255, 0,   0x2 }, // Yellow
    { 255, 0,   0,   0x3 }, // Red
    { 0,   0,   255, 0x5 }, // Blue
    { 0,   255, 0,   0x6 }  // Green
};

// Direct color mapping for server-dithered images
// Classify incoming 24-bit pixel to closest Spectra-6 palette index.
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b) {
    // Optionally swap to handle BGR streams
#if COLOR_ORDER_BGR
    uint8_t rr = b; uint8_t gg = g; uint8_t bb = r;
#else
    uint8_t rr = r; uint8_t gg = g; uint8_t bb = b;
#endif

    // Fast-path exact matches to reduce computation
    if (rr < 8 && gg < 8 && bb < 8) return EINK_BLACK;
    if (rr > 247 && gg > 247 && bb > 247) return EINK_WHITE;

    // Compute nearest neighbor in RGB space
    uint32_t bestDist = UINT32_MAX;
    uint8_t bestIdx = EINK_WHITE;
    for (const auto &pc : SPECTRA6_PALETTE) {
        int dr = (int)rr - (int)pc.r;
        int dg = (int)gg - (int)pc.g;
        int db = (int)bb - (int)pc.b;
        uint32_t dist = (uint32_t)(dr*dr + dg*dg + db*db);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = pc.idx;
            if (bestDist == 0) break;
        }
    }
    return bestIdx;
}
