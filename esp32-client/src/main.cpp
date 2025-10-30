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
// Production server (Raspberry Pi)
#ifndef SERVER_HOST
#define SERVER_HOST "serverpi.local:3000"
#endif

#define DEFAULT_SLEEP_TIME 3600000000ULL // 1 hour
#define BATTERY_PIN A13
#define LOW_BATTERY_THRESHOLD 3.3
#ifndef DEVICE_ID
#define DEVICE_ID "esp32-001"
#endif
#define FIRMWARE_VERSION "v2-psram-battery-3.0"

// Dev mode: ESP32 tries dev server first if provided, falls back to production
// Fallback is reported to production for auto-disable

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
void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength, int batteryPercent, bool isCharging);
void sendLogToServer(const char *message, const char *level = "INFO");
float readBatteryVoltage();
int calculateBatteryPercentage(float voltage);
bool detectCharging(float currentVoltage, float previousVoltage);
void enterDeepSleep(uint64_t sleepTime);
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b);
uint64_t getSleepDurationFromServer();
uint64_t calculateAlignedSleepDuration(uint64_t intervalMicroseconds);
String buildApiUrl(const char* endpoint, const String& serverHost);

// E-ink color palette
const uint8_t EINK_BLACK = 0x0;
const uint8_t EINK_WHITE = 0x1;
const uint8_t EINK_YELLOW = 0x2;
const uint8_t EINK_RED = 0x3;
const uint8_t EINK_BLUE = 0x5;
const uint8_t EINK_GREEN = 0x6;

// RTC memory to store last displayed imageId across deep sleep cycles
RTC_DATA_ATTR char lastDisplayedImageId[65] = ""; // Stores imageId (64 chars + null terminator)
RTC_DATA_ATTR float lastBatteryVoltage = 0.0f; // Previous voltage reading for charging detection
RTC_DATA_ATTR uint32_t bootCount = 0; // Track number of wake cycles

// Dev mode tracking (not stored in RTC, resets each wake)
String devServerHost = ""; // e.g. "192.168.1.26:3000"
bool usedFallback = false; // true if we tried dev server but it failed

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

    // Increment boot counter
    bootCount++;
    Debug("Boot count: " + String(bootCount) + "\r\n");

    // Read battery voltage and calculate metrics
    float batteryVoltage = readBatteryVoltage();
    int batteryPercent = calculateBatteryPercentage(batteryVoltage);
    bool isCharging = detectCharging(batteryVoltage, lastBatteryVoltage);

    Debug("Battery Voltage: " + String(batteryVoltage, 2) + "V (" + String(batteryPercent) + "%)\r\n");
    if (isCharging) {
        Debug("Battery is charging\r\n");
    }

    // Store current voltage for next wake cycle
    lastBatteryVoltage = batteryVoltage;

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
    reportDeviceStatus("awake", batteryVoltage, signalStrength, batteryPercent, isCharging);
    sendLogToServer("ESP32 v2 awakened, checking for new image");

    // Note: Always connect to production server (SERVER_HOST)
    // Dev mode is handled server-side via proxy - production server
    // forwards requests to dev server when dev mode is enabled

    // Check if image has changed by comparing imageId
    Debug("Last displayed imageId: " + String(lastDisplayedImageId) + "\r\n");

    HTTPClient http;
    String url = buildApiUrl("current.json", SERVER_HOST);
    http.begin(url);
    http.setTimeout(30000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);

    int httpResponseCode = http.GET();
    String currentImageId = "";
    bool imageChanged = true;
    bool metadataFetched = false;

    if (httpResponseCode == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error && doc.containsKey("imageId")) {
            currentImageId = doc["imageId"].as<String>();
            metadataFetched = true;
            Debug("Current server imageId: " + currentImageId + "\r\n");

            // Read dev server host if present
            if (doc.containsKey("devServerHost") && !doc["devServerHost"].isNull()) {
                devServerHost = doc["devServerHost"].as<String>();
                Debug("Dev mode enabled, will try dev server: " + devServerHost + "\r\n");
            }

            // Compare with last displayed imageId
            if (strlen(lastDisplayedImageId) > 0 && currentImageId.equals(lastDisplayedImageId)) {
                imageChanged = false;
                Debug("Image unchanged - skipping display update\r\n");
                sendLogToServer("Image unchanged, skipping update to save power");
            } else if (strlen(lastDisplayedImageId) > 0) {
                Debug("Image changed: '" + String(lastDisplayedImageId) + "' -> '" + currentImageId + "'\r\n");
                sendLogToServer("Image changed, will update display");
            } else {
                Debug("First boot - will display image\r\n");
                sendLogToServer("First boot, displaying initial image");
            }
        } else {
            Debug("Failed to parse metadata or imageId missing\r\n");
            sendLogToServer("Error: Failed to parse metadata from server");
        }
    } else {
        Debug("HTTP request failed: " + String(httpResponseCode) + "\r\n");
        String errorMsg = "Error: HTTP request failed with code " + String(httpResponseCode);
        sendLogToServer(errorMsg.c_str());
    }
    http.end();

    // Only proceed with display update if we successfully fetched metadata and image changed
    if (!metadataFetched) {
        // Failed to fetch metadata - skip display update to save power
        Debug("Skipping display update due to metadata fetch failure\r\n");
        reportDeviceStatus("metadata_fetch_failed", batteryVoltage, signalStrength, batteryPercent, isCharging);
    } else if (!imageChanged) {
        // Image hasn't changed, skip display update
        reportDeviceStatus("display_unchanged", batteryVoltage, signalStrength, batteryPercent, isCharging);
    } else {
        // Image has changed or this is first boot, proceed with update
        Debug("Proceeding with display update\r\n");

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
            // Store the new imageId in RTC memory
            if (currentImageId.length() > 0 && currentImageId.length() < 65) {
                strncpy(lastDisplayedImageId, currentImageId.c_str(), 64);
                lastDisplayedImageId[64] = '\0';
                Debug("Stored imageId in RTC memory: " + String(lastDisplayedImageId) + "\r\n");
            }

            reportDeviceStatus("display_updated", batteryVoltage, signalStrength, batteryPercent, isCharging);
            sendLogToServer("Image downloaded and displayed successfully");
        } else {
            reportDeviceStatus("display_fallback", batteryVoltage, signalStrength, batteryPercent, isCharging);
            sendLogToServer("Download failed, displaying fallback flag");
            generateAndDisplayBhutanFlag();
        }

        // Power down display after update
        powerDownDisplay();
    }

    // Power down radios
    teardownRadios();

    // Get sleep interval from server (with fallback to default)
    uint64_t sleepInterval = getSleepDurationFromServer();
    if (sleepInterval == 0) {
        Debug("Using default sleep interval\r\n");
        sleepInterval = DEFAULT_SLEEP_TIME;
    }

    Debug("Sleep interval: " + String(sleepInterval / 1000000) + " seconds (" + String(sleepInterval / 1000000 / 60) + " minutes)\r\n");

    // Calculate clock-aligned sleep duration
    uint64_t alignedSleepDuration = calculateAlignedSleepDuration(sleepInterval);
    Debug("Aligned sleep duration: " + String(alignedSleepDuration / 1000000) + " seconds (" + String(alignedSleepDuration / 1000000 / 60) + " minutes)\r\n");

    // Report going to sleep
    reportDeviceStatus("sleeping", batteryVoltage, signalStrength, batteryPercent, isCharging);
    sendLogToServer("Entering deep sleep");

    // Enter deep sleep with clock-aligned duration
    enterDeepSleep(alignedSleepDuration);
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
    String url = buildApiUrl("current.json", SERVER_HOST);
    http.begin(url);
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
    String serverToUse = SERVER_HOST;

    // Try dev server first if dev mode is enabled
    if (devServerHost.length() > 0) {
        serverToUse = devServerHost;
        Debug("Trying dev server: " + serverToUse + "\r\n");
    }

    String url = buildApiUrl("image.bin", serverToUse);
    http.begin(url);
    http.setTimeout(60000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);

    int httpCode = http.GET();
    Debug("Image download response: " + String(httpCode) + "\r\n");

    // If dev server failed, try production fallback
    if (httpCode != HTTP_CODE_OK && devServerHost.length() > 0) {
        Debug("Dev server failed, falling back to production\r\n");
        http.end();
        usedFallback = true;

        // Retry with production server
        serverToUse = SERVER_HOST;
        url = buildApiUrl("image.bin", serverToUse);
        http.begin(url);
        http.setTimeout(60000);
        http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);
        httpCode = http.GET();
        Debug("Production server response: " + String(httpCode) + "\r\n");
    }

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

void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength, int batteryPercent, bool isCharging) {
    Debug("Reporting status: " + String(status) + "\r\n");

    HTTPClient http;
    String url = buildApiUrl("device-status", SERVER_HOST);
    http.begin(url);
    http.setTimeout(10000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;

    // Create status object as expected by server
    JsonObject statusObj = doc.createNestedObject("status");
    statusObj["status"] = status;
    statusObj["batteryVoltage"] = batteryVoltage;
    statusObj["batteryPercent"] = batteryPercent;
    statusObj["isCharging"] = isCharging;
    statusObj["signalStrength"] = signalStrength;
    statusObj["firmwareVersion"] = FIRMWARE_VERSION;
    statusObj["freeHeap"] = ESP.getFreeHeap();
    statusObj["psramFree"] = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
    statusObj["uptime"] = millis();
    statusObj["bootCount"] = bootCount;
    statusObj["usedFallback"] = usedFallback; // Report if dev server failed

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
    String url = buildApiUrl("logs", SERVER_HOST);
    http.begin(url);
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
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    // Good Display board doesn't have battery monitoring on A13
    // When USB powered, return a safe voltage to bypass low battery check
    return 4.2f; // Simulate full battery voltage
#else
    int adcReading = analogRead(BATTERY_PIN);
    // Using 12-bit ADC, 11dB attenuation (~0-3.3V), and a 2:1 divider on the board
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;
    return voltage;
#endif
}

int calculateBatteryPercentage(float voltage) {
    // LiPo battery discharge curve approximation
    // 4.2V = 100%, 3.7V = 50%, 3.0V = 0%
    const float V_MAX = 4.2f;  // Fully charged
    const float V_MIN = 3.0f;  // Empty (cutoff)
    const float V_NOMINAL = 3.7f; // Mid-point

    if (voltage >= V_MAX) return 100;
    if (voltage <= V_MIN) return 0;

    // Use piecewise linear approximation
    // Upper half (4.2V-3.7V): 100%-50%
    // Lower half (3.7V-3.0V): 50%-0%
    int percent;
    if (voltage >= V_NOMINAL) {
        // Upper half: 50% to 100%
        percent = 50 + (int)((voltage - V_NOMINAL) / (V_MAX - V_NOMINAL) * 50.0f);
    } else {
        // Lower half: 0% to 50%
        percent = (int)((voltage - V_MIN) / (V_NOMINAL - V_MIN) * 50.0f);
    }

    // Clamp to 0-100 range
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    return percent;
}

bool detectCharging(float currentVoltage, float previousVoltage) {
    // If this is the first boot (previousVoltage == 0), can't detect charging
    if (previousVoltage < 0.1f) {
        return false;
    }

    // Charging detected if voltage increased by more than 50mV
    // This threshold avoids false positives from measurement noise
    const float CHARGING_THRESHOLD = 0.05f; // 50mV
    return (currentVoltage - previousVoltage) > CHARGING_THRESHOLD;
}

uint64_t getSleepDurationFromServer() {
    Debug("Fetching sleep duration from server...\r\n");

    HTTPClient http;
    String url = buildApiUrl("current.json", SERVER_HOST);
    http.begin(url);
    http.setTimeout(10000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        http.end();

        // Parse JSON to get sleepDuration
        DynamicJsonDocument doc(2048);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error && doc.containsKey("sleepDuration")) {
            uint64_t sleepDuration = doc["sleepDuration"];
            Debug("Server sleep duration: " + String(sleepDuration) + " microseconds\r\n");
            return sleepDuration;
        } else {
            Debug("Failed to parse sleepDuration from JSON\r\n");
        }
    } else {
        Debug("Failed to fetch current.json, code: " + String(httpCode) + "\r\n");
    }

    http.end();
    return 0; // Return 0 to indicate failure, caller will use default
}

uint64_t calculateAlignedSleepDuration(uint64_t intervalMicroseconds) {
    Debug("Calculating clock-aligned sleep duration...\r\n");

    // Get current time from server
    HTTPClient http;
    String url = buildApiUrl("time", SERVER_HOST);
    http.begin(url);
    http.setTimeout(10000);
    http.addHeader("User-Agent", "ESP32-Glance-v2/" FIRMWARE_VERSION);

    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Debug("Failed to get server time, using interval as-is\r\n");
        http.end();
        return intervalMicroseconds;
    }

    String payload = http.getString();
    http.end();

    // Parse JSON to get current epoch time in milliseconds
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, payload);

    if (error || !doc.containsKey("epoch")) {
        Debug("Failed to parse server time, using interval as-is\r\n");
        return intervalMicroseconds;
    }

    uint64_t currentEpochMs = doc["epoch"]; // Current time in milliseconds
    Debug("Current epoch: " + String(currentEpochMs) + " ms\r\n");

    // Convert interval from microseconds to milliseconds
    uint64_t intervalMs = intervalMicroseconds / 1000;

    // Calculate milliseconds since the last interval boundary
    uint64_t msSinceLastInterval = currentEpochMs % intervalMs;

    // Calculate milliseconds until next interval boundary
    uint64_t msUntilNextInterval = intervalMs - msSinceLastInterval;

    Debug("Time since last interval: " + String(msSinceLastInterval / 1000) + " seconds\r\n");
    Debug("Time until next interval: " + String(msUntilNextInterval / 1000) + " seconds\r\n");

    // Convert back to microseconds
    return msUntilNextInterval * 1000;
}

// Helper function to build API URL
String buildApiUrl(const char* endpoint, const String& serverHost) {
    return "http://" + serverHost + "/api/" + endpoint;
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
