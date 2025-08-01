#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "soc/rtc_cntl_reg.h"
#include "esp32-hal-cpu.h"
#include "esp_sleep.h"
#include "esp_task_wdt.h"

// Configuration constants
#define API_BASE_URL "http://serverpi.local:3000/api/"
#define STATUS_URL "http://serverpi.local:3000/api/device-status"
#define MIN_SLEEP_TIME 300000000ULL      // 5 minutes
#define MAX_SLEEP_TIME 4294967295ULL     // Max value for 32-bit unsigned long (about 71 minutes)
#define DEFAULT_SLEEP_TIME 3600000000ULL // 1 hour
#define BATTERY_PIN A13
#define LOW_BATTERY_THRESHOLD 3.3
#define DEVICE_ID "esp32-001"
#define FIRMWARE_VERSION "1.1.0"

// Enhanced communication constants
#define MAX_RETRY_ATTEMPTS 3
#define BASE_TIMEOUT 5000
#define MAX_TIMEOUT 15000
#define OFFLINE_BUFFER_SIZE 10
#define HEARTBEAT_INTERVAL 30000  // 30 seconds when staying awake
#define CONNECTION_CHECK_INTERVAL 5000  // 5 seconds

// Serial streaming constants
#define SERIAL_STREAM_BUFFER_SIZE 1024
#define SERIAL_STREAM_INTERVAL 10000  // Stream every 10 seconds when awake
#define SERIAL_STREAM_MIN_CHARS 50    // Minimum characters before streaming

// Communication state tracking
struct CommState {
    unsigned long lastSuccessfulContact = 0;
    unsigned long lastHeartbeat = 0;
    int consecutiveFailures = 0;
    bool serverReachable = false;
    int adaptiveTimeout = BASE_TIMEOUT;
};

// Offline buffer for logs and status updates
struct BufferedMessage {
    String endpoint;
    String payload;
    unsigned long timestamp;
    int retryCount;
};

// Serial streaming state
struct SerialStreamState {
    String buffer;
    unsigned long lastStreamTime = 0;
    boolean isStreaming = false;
    boolean streamingEnabled = false;
};

// Global state
CommState commState;
BufferedMessage offlineBuffer[OFFLINE_BUFFER_SIZE];
int bufferHead = 0;
int bufferCount = 0;
SerialStreamState serialStream;

// Improved base64 decoder with pre-allocated buffer
String base64_decode(String input)
{
    const char *chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    // Remove any padding
    while (input.endsWith("="))
    {
        input.remove(input.length() - 1);
    }

    // Calculate output size and pre-allocate
    int outputSize = (input.length() * 3) / 4;
    String output;
    output.reserve(outputSize + 100); // Reserve memory to avoid reallocations

    Debug("Base64 input length: " + String(input.length()) + ", estimated output: " + String(outputSize) + "\r\n");

    for (int i = 0; i < input.length(); i += 4)
    {
        unsigned long combined = 0;
        int chars_count = 0;

        // Process 4 characters at a time
        for (int j = 0; j < 4 && (i + j) < input.length(); j++)
        {
            char c = input.charAt(i + j);
            int val = 0;

            // Find character in base64 alphabet using faster lookup
            if (c >= 'A' && c <= 'Z') {
                val = c - 'A';
            } else if (c >= 'a' && c <= 'z') {
                val = c - 'a' + 26;
            } else if (c >= '0' && c <= '9') {
                val = c - '0' + 52;
            } else if (c == '+') {
                val = 62;
            } else if (c == '/') {
                val = 63;
            }

            combined = (combined << 6) | val;
            chars_count++;
        }

        // Extract bytes
        if (chars_count >= 2)
        {
            output += (char)((combined >> 16) & 0xFF);
        }
        if (chars_count >= 3)
        {
            output += (char)((combined >> 8) & 0xFF);
        }
        if (chars_count >= 4)
        {
            output += (char)(combined & 0xFF);
        }

        // Reset watchdog periodically during long decode
        if (i % 1000 == 0) {
            esp_task_wdt_reset();
        }
    }

    Debug("Base64 decode completed, actual output length: " + String(output.length()) + "\r\n");
    return output;
}

// Global variables for power management
RTC_DATA_ATTR int bootCount = 0;
RTC_DATA_ATTR uint64_t lastSleepDuration = DEFAULT_SLEEP_TIME;


// Function declarations
void setupPowerManagement();
bool connectToWiFi();
bool fetchCurrentImage();
void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength);
void sendLogToServer(const char *message, const char *level = "INFO");
void displayImageFromData(const uint8_t *imageData, int width, int height);
void displayTextMessage(const String &text);
void enterDeepSleep(uint64_t sleepTime);
float readBatteryVoltage();
bool checkForCommands();
void processCommand(const String &command, unsigned long duration);
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b);
void processRGBImageData(const uint8_t *rgbData, int width, int height);

// Enhanced communication functions
bool makeHttpRequest(const String &url, const String &method, const String &payload, String &response, int customTimeout = 0);
void bufferMessage(const String &endpoint, const String &payload);
void flushOfflineBuffer();
void updateCommState(bool success);
void sendHeartbeat();
bool isServerReachable();
void adaptiveDelay(int baseDelay);

// Serial streaming functions
void enableSerialStreaming();
void disableSerialStreaming();
void captureSerialOutput(const String &output);
void flushSerialStream();
size_t debugWrite(const uint8_t *buffer, size_t size);

// E-ink color palette (hardware defined)
const uint8_t EINK_BLACK = 0x0;
const uint8_t EINK_WHITE = 0x1;
const uint8_t EINK_YELLOW = 0x2;
const uint8_t EINK_RED = 0x3;
const uint8_t EINK_BLUE = 0x5;
const uint8_t EINK_GREEN = 0x6;

// Color mapping configuration - easily adjustable
struct ColorMappingConfig {
    int brightnessThresholdLow = 30;    // Below this -> black
    int brightnessThresholdHigh = 230;  // Above this -> white
    int colorfulnessThreshold = 50;     // Below this -> grayscale
    int redThreshold = 150;             // For detecting strong reds
    int blueThreshold = 100;            // For detecting blues
    int yellowRedThreshold = 150;       // For yellow detection
    int yellowGreenThreshold = 150;     // For yellow detection
    int yellowBlueMax = 100;            // For yellow detection
    bool usePerceptualWeighting = true; // Use human vision weights
};

ColorMappingConfig colorConfig;

// ESP32 color mapping function - fully configurable
uint8_t mapRGBToEink(uint8_t r, uint8_t g, uint8_t b) {
    int brightness = (r + g + b) / 3;
    
    // Very bright -> White
    if (brightness > colorConfig.brightnessThresholdHigh) {
        return EINK_WHITE;
    }
    
    // Very dark -> Black
    if (brightness < colorConfig.brightnessThresholdLow) {
        return EINK_BLACK;
    }
    
    // Check colorfulness
    int maxChannel = max(r, max(g, b));
    int minChannel = min(r, min(g, b));
    int colorfulness = maxChannel - minChannel;
    
    // Low colorfulness -> grayscale
    if (colorfulness < colorConfig.colorfulnessThreshold) {
        return brightness > 128 ? EINK_WHITE : EINK_BLACK;
    }
    
    // High colorfulness -> detect dominant color
    if (g > r && g > b) {
        return EINK_GREEN;  // Green dominant
    } else if (r > g && r > b && r > colorConfig.redThreshold) {
        return EINK_RED;    // Strong red
    } else if (b > r && b > g && b > colorConfig.blueThreshold) {
        return EINK_BLUE;   // Blue dominant
    } else if (r > colorConfig.yellowRedThreshold && g > colorConfig.yellowGreenThreshold && b < colorConfig.yellowBlueMax) {
        return EINK_YELLOW; // Yellow-ish
    }
    
    // Fallback: use perceptual distance or simple distance
    if (colorConfig.usePerceptualWeighting) {
        // Perceptually weighted distance to each color
        uint8_t colors[6][3] = {
            {0, 0, 0},       // Black
            {255, 255, 255}, // White
            {255, 255, 0},   // Yellow
            {255, 0, 0},     // Red
            {0, 0, 255},     // Blue
            {0, 255, 0}      // Green
        };
        uint8_t indices[6] = {EINK_BLACK, EINK_WHITE, EINK_YELLOW, EINK_RED, EINK_BLUE, EINK_GREEN};
        
        long minDistance = LONG_MAX;
        uint8_t closestColor = EINK_WHITE;
        
        for (int i = 0; i < 6; i++) {
            long deltaR = r - colors[i][0];
            long deltaG = g - colors[i][1];
            long deltaB = b - colors[i][2];
            
            // Human perception weights: green most sensitive
            long distance = 2 * deltaR * deltaR + 4 * deltaG * deltaG + 3 * deltaB * deltaB;
            
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = indices[i];
            }
        }
        
        return closestColor;
    }
    
    // Simple fallback
    return EINK_WHITE;
}

// Process RGB image data and convert to e-ink display
void processRGBImageData(const uint8_t *rgbData, int width, int height) {
    Debug("Converting RGB to e-ink colors on ESP32...\r\n");
    Debug("Free heap before conversion: " + String(ESP.getFreeHeap()) + "\r\n");
    
    // Allocate buffer for e-ink data
    int pixelCount = width * height;
    uint8_t *einkData = (uint8_t*)malloc(pixelCount);
    
    if (!einkData) {
        Debug("Failed to allocate memory for e-ink conversion!\r\n");
        return;
    }
    
    // Convert each RGB pixel to e-ink color
    for (int i = 0; i < pixelCount; i++) {
        uint8_t r = rgbData[i * 3];
        uint8_t g = rgbData[i * 3 + 1];
        uint8_t b = rgbData[i * 3 + 2];
        
        einkData[i] = mapRGBToEink(r, g, b);
        
        // Reset watchdog periodically
        if (i % 10000 == 0) {
            esp_task_wdt_reset();
        }
    }
    
    Debug("RGB to e-ink conversion completed\r\n");
    Debug("Free heap after conversion: " + String(ESP.getFreeHeap()) + "\r\n");
    
    // Display the converted image
    displayImageFromData(einkData, width, height);
    
    // Free the allocated memory
    free(einkData);
}

void setup()
{
    Serial.begin(115200);
    delay(1000);

    // Increment boot number and print it every reboot
    ++bootCount;
    Debug("Boot number: " + String(bootCount) + "\r\n");

    // Setup power management first
    setupPowerManagement();

    Debug("Glance ESP32 Client Starting...\r\n");
    Debug("Device ID: ");
    Debug(DEVICE_ID);
    Debug("\r\n");
    Debug("Firmware Version: ");
    Debug(FIRMWARE_VERSION);
    Debug("\r\n");

    // Read battery voltage
    float batteryVoltage = readBatteryVoltage();
    Debug("Battery Voltage: " + String(batteryVoltage) + "V\r\n");

    // Check if we need to skip this cycle due to low battery
    if (batteryVoltage < LOW_BATTERY_THRESHOLD)
    {
        Debug("Low battery detected, entering extended sleep\r\n");
        sendLogToServer("Low battery - entering extended sleep", "WARN");
        enterDeepSleep(MAX_SLEEP_TIME); // Sleep for maximum time to conserve power
        return;
    }

    // Connect to WiFi
    if (!connectToWiFi())
    {
        Debug("WiFi connection failed, entering sleep\r\n");
        sendLogToServer("WiFi connection failed", "ERROR");
        enterDeepSleep(MIN_SLEEP_TIME); // Retry sooner on WiFi failure
        return;
    }

    // Report initial status
    int signalStrength = WiFi.RSSI();
    reportDeviceStatus("awake", batteryVoltage, signalStrength);
    sendLogToServer("Device awakened, checking for updates");

    // Initialize e-Paper display
    Debug("Initializing e-Paper display...\r\n");
    DEV_Module_Init();
    delay(2000);

    EPD_13IN3E_Init();
    delay(2000);

    // Check for pending commands first
    esp_task_wdt_reset();
    checkForCommands();

    // Fetch and display current image
    esp_task_wdt_reset();
    bool imageUpdated = fetchCurrentImage();

    if (imageUpdated)
    {
        reportDeviceStatus("display_updated", batteryVoltage, signalStrength);
        sendLogToServer("Display updated successfully");
    }
    else
    {
        reportDeviceStatus("no_update", batteryVoltage, signalStrength);
        sendLogToServer("No display update needed");
    }

    // Power down display
    EPD_13IN3E_Sleep();

    // Check for commands again before sleeping
    bool shouldStayAwake = checkForCommands();

    if (shouldStayAwake)
    {
        reportDeviceStatus("staying_awake", batteryVoltage, signalStrength);
        sendLogToServer("Staying awake for remote commands");
        
        // Enable serial streaming while awake
        enableSerialStreaming();
        
        // Stay awake for up to 5 minutes, checking for commands every 30 seconds
        unsigned long stayAwakeStart = millis();
        unsigned long stayAwakeTimeout = 5 * 60 * 1000; // 5 minutes
        
        while (millis() - stayAwakeStart < stayAwakeTimeout)
        {
            // Send heartbeat to maintain connection
            sendHeartbeat();
            
            // Wait between heartbeats, but check for commands more frequently
            unsigned long heartbeatStart = millis();
            while (millis() - heartbeatStart < HEARTBEAT_INTERVAL && 
                   millis() - stayAwakeStart < stayAwakeTimeout)
            {
                delay(CONNECTION_CHECK_INTERVAL); // Check every 5 seconds
                esp_task_wdt_reset(); // Reset watchdog during stay awake period
                
                // Check for new commands
                if (checkForCommands())
                {
                    // New commands received, continue staying awake
                    stayAwakeStart = millis(); // Reset stay awake timer
                }
            }
            
            // If we haven't received commands for a while, check server reachability
            if (!isServerReachable())
            {
                Debug("Server unreachable, ending stay awake period\r\n");
                sendLogToServer("Ending stay awake - server unreachable", "WARN");
                break;
            }
        }
        
        // Disable serial streaming before sleeping
        disableSerialStreaming();
    }

    // Report going to sleep
    reportDeviceStatus("sleeping", batteryVoltage, signalStrength);
    String sleepMessage = "Entering deep sleep for " + String(lastSleepDuration / 1000000) + " seconds";
    sendLogToServer(sleepMessage.c_str());

    // Enter deep sleep
    enterDeepSleep(lastSleepDuration);
}

void loop()
{
    // This should never be reached due to deep sleep
    delay(1000);
}

void setupPowerManagement()
{
    Debug("Setting up power management...\r\n");

    // Set CPU frequency to 80MHz for power efficiency
    setCpuFrequencyMhz(80);
    Debug("CPU frequency set to 80MHz\r\n");

    // Disable brownout detector for battery operation
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    Debug("Brownout detector disabled\r\n");

    // Configure watchdog timer (300 seconds = 5 minutes)
    esp_task_wdt_init(300, true);
    esp_task_wdt_add(NULL);
    Debug("Watchdog timer configured (300s)\r\n");

    // Configure wake-up source
    esp_sleep_enable_timer_wakeup(DEFAULT_SLEEP_TIME);
}

bool connectToWiFi()
{
    Debug("Connecting to WiFi: " WIFI_SSID "\r\n");

    // Try WiFi connection with multiple attempts
    for (int retry = 0; retry < 3; retry++)
    {
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20)
        {
            delay(500);
            Debug(".");
            attempts++;
            
            // Feed watchdog during long operations
            esp_task_wdt_reset();
        }

        if (WiFi.status() == WL_CONNECTED)
        {
            Debug("\r\nWiFi connected!\r\n");
            Debug("IP address: " + WiFi.localIP().toString() + "\r\n");
            Debug("Signal strength: " + String(WiFi.RSSI()) + " dBm\r\n");
            return true;
        }
        
        Debug("\r\nWiFi connection attempt " + String(retry + 1) + " failed\r\n");
        
        if (retry < 2)
        {
            WiFi.disconnect();
            delay(2000); // Wait before retry
        }
    }
    
    Debug("WiFi connection failed after 3 attempts!\r\n");
    return false;
}

bool fetchCurrentImage()
{
    Debug("Fetching current image from server...\r\n");

    HTTPClient http;
    http.begin(API_BASE_URL "current.json");
    http.setTimeout(15000); // 15 second timeout for image downloads
    http.addHeader("User-Agent", "ESP32-Glance-Client/" FIRMWARE_VERSION);

    int httpResponseCode = http.GET();

    if (httpResponseCode == 200)
    {
        String payload = http.getString();
        Debug("Server response received\r\n");

        // Parse JSON response - increased size for large RGB image data (~7.7MB base64)
        DynamicJsonDocument doc(10 * 1024 * 1024); // 10MB to handle large image data
        DeserializationError error = deserializeJson(doc, payload);
        
        if (error) {
            Debug("JSON parsing failed: " + String(error.c_str()) + "\r\n");
            return false;
        }

        String title = doc["title"];
        String imageBase64 = doc["image"];
        uint64_t sleepDuration = doc["sleepDuration"];

        Debug("Title: " + title + "\r\n");
        Debug("Sleep duration: " + String(sleepDuration / 1000000) + " seconds\r\n");

        // Update sleep duration for next cycle
        lastSleepDuration = (sleepDuration > 0) ? sleepDuration : DEFAULT_SLEEP_TIME;

        if (imageBase64.length() > 0)
        {
            Debug("Processing image data...\r\n");
            Debug("Base64 length: " + String(imageBase64.length()) + "\r\n");
            Debug("Free heap before decode: " + String(ESP.getFreeHeap()) + "\r\n");

            // Decode base64 image
            String decoded = base64_decode(imageBase64);
            Debug("Free heap after decode: " + String(ESP.getFreeHeap()) + "\r\n");

            if (decoded.length() > 0)
            {
                Debug("Data decoded successfully\r\n");
                Debug("Decoded data length: " + String(decoded.length()) + "\r\n");
                Debug("Expected length: " + String(1200 * 1600) + "\r\n");

                // Clear display first
                EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
                delay(3000);

                // Check if this looks like RGB data (3 bytes per pixel)
                if (decoded.length() == (1200 * 1600 * 3))
                {
                    // This is raw RGB data - convert to e-ink colors
                    Debug("Processing as RGB data\r\n");
                    processRGBImageData((const uint8_t *)decoded.c_str(), 1200, 1600);
                }
                else if (decoded.length() == (1200 * 1600))
                {
                    // This looks like pre-processed e-ink data (legacy)
                    Debug("Processing as legacy e-ink data\r\n");
                    displayImageFromData((const uint8_t *)decoded.c_str(), 1200, 1600);
                }
                else
                {
                    // This looks like text data - but let's show more debug info
                    Debug("Processing as text data (length mismatch)\r\n");
                    Debug("Expected RGB: " + String(1200 * 1600 * 3) + " bytes\r\n");
                    Debug("Expected E-ink: " + String(1200 * 1600) + " bytes\r\n");
                    Debug("First 10 bytes: ");
                    for (int i = 0; i < min(10, (int)decoded.length()); i++) {
                        Debug(String((unsigned char)decoded[i], HEX) + " ");
                    }
                    Debug("\r\n");
                    displayTextMessage(decoded);
                }

                http.end();
                return true;
            }
            else
            {
                Debug("Failed to decode image data\r\n");
            }
        }
        else
        {
            Debug("No image data in response\r\n");
            // Still clear the display to show we're working
            EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
            delay(2000);
        }
    }
    else
    {
        Debug("HTTP Error: " + String(httpResponseCode) + "\r\n");
    }

    http.end();
    return false;
}

void displayImageFromData(const uint8_t *imageData, int width, int height)
{
    Debug("Displaying image: " + String(width) + "x" + String(height) + "\r\n");
    Debug("Free heap before display: " + String(ESP.getFreeHeap()) + "\r\n");

    // For debugging, show first few bytes of image data
    Debug("First 10 image bytes: ");
    for (int i = 0; i < min(10, width * height); i++) {
        Debug(String(imageData[i], HEX) + " ");
    }
    Debug("\r\n");

    // Use full display instead of DisplayPart to avoid centering issues
    if (width == EPD_13IN3E_WIDTH && height == EPD_13IN3E_HEIGHT) {
        Debug("Using full display mode\r\n");
        EPD_13IN3E_Display(imageData);
    } else {
        Debug("Using partial display mode with centering\r\n");
        // Calculate centering
        UWORD x_offset = (EPD_13IN3E_WIDTH - width) / 2;
        UWORD y_offset = (EPD_13IN3E_HEIGHT - height) / 2;
        
        Debug("Display offsets: x=" + String(x_offset) + ", y=" + String(y_offset) + "\r\n");
        
        // Display the image
        EPD_13IN3E_DisplayPart(imageData, x_offset, y_offset, width, height);
    }

    Debug("Image display completed\r\n");
}

void displayTextMessage(const String &text)
{
    Debug("Displaying text message: " + text + "\r\n");

    // Create a simple text display
    // For now, just clear the screen and show we got the message
    EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
    delay(2000);

    // You can implement text rendering here if needed
    // For now, just indicate success in logs
    Debug("Text display completed: " + text + "\r\n");
}

void reportDeviceStatus(const char *status, float batteryVoltage, int signalStrength)
{
    Debug("Reporting device status: " + String(status) + "\r\n");

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;

    JsonObject statusObj = doc.createNestedObject("status");
    statusObj["status"] = status;
    statusObj["batteryVoltage"] = batteryVoltage;
    statusObj["signalStrength"] = signalStrength;
    statusObj["firmwareVersion"] = FIRMWARE_VERSION;
    statusObj["bootCount"] = bootCount;
    statusObj["freeHeap"] = ESP.getFreeHeap();
    statusObj["uptime"] = millis();

    String jsonString;
    serializeJson(doc, jsonString);

    String response;
    if (makeHttpRequest(STATUS_URL, "POST", jsonString, response))
    {
        Debug("Device status reported successfully\r\n");
        
        // Try to flush any buffered messages when we have connectivity
        if (bufferCount > 0)
        {
            flushOfflineBuffer();
        }
    }
    else
    {
        Debug("Device status reporting failed, buffering...\r\n");
        bufferMessage("device-status", jsonString);
    }
}

void sendLogToServer(const char *message, const char *level)
{
    Debug("Sending log: " + String(message) + "\r\n");

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    doc["logs"] = message;
    doc["logLevel"] = level;
    doc["deviceTime"] = millis();

    String jsonString;
    serializeJson(doc, jsonString);

    String response;
    String logsUrl = String(API_BASE_URL) + "logs";
    
    if (makeHttpRequest(logsUrl, "POST", jsonString, response, BASE_TIMEOUT))
    {
        Debug("Log sent successfully\r\n");
    }
    else
    {
        // Don't buffer logs if we're already having connectivity issues to avoid infinite recursion
        if (commState.consecutiveFailures < 2)
        {
            bufferMessage("logs", jsonString);
        }
    }
}

float readBatteryVoltage()
{
    // Read battery voltage from analog pin
    int adcReading = analogRead(BATTERY_PIN);

    // Convert ADC reading to voltage (3.3V reference, 12-bit ADC)
    // Assuming voltage divider if needed
    float voltage = (adcReading / 4095.0) * 3.3 * 2.0; // *2.0 if using voltage divider

    return voltage;
}

void enterDeepSleep(uint64_t sleepTime)
{
    Debug("Entering deep sleep for " + String(sleepTime / 1000000) + " seconds\r\n");

    // Configure timer wake-up
    esp_sleep_enable_timer_wakeup(sleepTime);

    // Enter deep sleep
    esp_deep_sleep_start();
}

bool checkForCommands()
{
    Debug("Checking for pending commands...\r\n");

    String commandsUrl = String(API_BASE_URL) + "commands/" + DEVICE_ID;
    String response;
    bool shouldStayAwake = false;

    if (makeHttpRequest(commandsUrl, "GET", "", response))
    {
        Debug("Commands response received\r\n");

        // Parse JSON response
        DynamicJsonDocument doc(4096);
        DeserializationError error = deserializeJson(doc, response);

        if (!error)
        {
            JsonArray commands = doc["commands"];
            
            if (commands.size() > 0)
            {
                Debug("Found " + String(commands.size()) + " pending commands\r\n");
                
                for (JsonObject command : commands)
                {
                    String cmd = command["command"];
                    unsigned long duration = command["duration"];
                    
                    Debug("Processing command: " + cmd + "\r\n");
                    processCommand(cmd, duration);
                    
                    // If any command is "stay_awake", we should stay awake
                    if (cmd == "stay_awake")
                    {
                        shouldStayAwake = true;
                    }
                }
            }
            else
            {
                Debug("No pending commands\r\n");
            }
        }
        else
        {
            Debug("JSON parsing error: " + String(error.c_str()) + "\r\n");
        }
    }
    else
    {
        Debug("Commands check failed - server not reachable\r\n");
    }

    return shouldStayAwake;
}

void processCommand(const String &command, unsigned long duration)
{
    Debug("Processing command: " + command + " (duration: " + String(duration) + "ms)\r\n");
    
    if (command == "stay_awake")
    {
        sendLogToServer(("Stay awake command received - duration: " + String(duration/1000) + "s").c_str());
        // The stay awake logic is handled in the main loop
    }
    else if (command == "update_now" || command == "force_update")
    {
        sendLogToServer("Force update command received - refreshing display");
        
        // Re-initialize display if needed
        EPD_13IN3E_Init();
        delay(1000);
        
        // Force fetch current image
        bool updated = fetchCurrentImage();
        
        if (updated)
        {
            sendLogToServer("Forced display update completed successfully");
        }
        else
        {
            sendLogToServer("Forced display update completed (no changes)", "WARN");
        }
        
        // Power down display
        EPD_13IN3E_Sleep();
    }
    else if (command == "enable_streaming")
    {
        sendLogToServer("Serial streaming enable command received");
        enableSerialStreaming();
    }
    else if (command == "disable_streaming")
    {
        sendLogToServer("Serial streaming disable command received");
        disableSerialStreaming();
    }
    else
    {
        sendLogToServer(("Unknown command received: " + command).c_str(), "WARN");
    }
}

// Enhanced communication functions for robustness

bool makeHttpRequest(const String &url, const String &method, const String &payload, String &response, int customTimeout)
{
    int timeout = customTimeout > 0 ? customTimeout : commState.adaptiveTimeout;
    
    for (int attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++)
    {
        HTTPClient http;
        http.begin(url);
        http.setTimeout(timeout);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("User-Agent", "ESP32-Glance-Client/" FIRMWARE_VERSION);
        
        int httpResponseCode;
        if (method == "POST")
        {
            httpResponseCode = http.POST(payload);
        }
        else
        {
            httpResponseCode = http.GET();
        }
        
        if (httpResponseCode == 200 || httpResponseCode == 201)
        {
            response = http.getString();
            http.end();
            updateCommState(true);
            return true;
        }
        else if (httpResponseCode > 0)
        {
            Debug("HTTP request failed with code: " + String(httpResponseCode) + " (attempt " + String(attempt + 1) + ")\r\n");
        }
        else
        {
            Debug("HTTP request failed: " + http.errorToString(httpResponseCode) + " (attempt " + String(attempt + 1) + ")\r\n");
        }
        
        http.end();
        
        if (attempt < MAX_RETRY_ATTEMPTS - 1)
        {
            adaptiveDelay(1000 * (attempt + 1)); // Exponential backoff
        }
    }
    
    updateCommState(false);
    return false;
}

void bufferMessage(const String &endpoint, const String &payload)
{
    if (bufferCount >= OFFLINE_BUFFER_SIZE)
    {
        // Buffer full, remove oldest message
        bufferHead = (bufferHead + 1) % OFFLINE_BUFFER_SIZE;
        bufferCount--;
    }
    
    int index = (bufferHead + bufferCount) % OFFLINE_BUFFER_SIZE;
    offlineBuffer[index].endpoint = endpoint;
    offlineBuffer[index].payload = payload;
    offlineBuffer[index].timestamp = millis();
    offlineBuffer[index].retryCount = 0;
    bufferCount++;
    
    Debug("Message buffered: " + endpoint + " (buffer count: " + String(bufferCount) + ")\r\n");
}

void flushOfflineBuffer()
{
    if (bufferCount == 0) return;
    
    Debug("Flushing offline buffer (" + String(bufferCount) + " messages)...\r\n");
    
    int processed = 0;
    for (int i = 0; i < bufferCount && processed < 5; i++) // Limit to 5 messages per flush to avoid timeout
    {
        int index = (bufferHead + i) % OFFLINE_BUFFER_SIZE;
        BufferedMessage &msg = offlineBuffer[index];
        
        if (msg.retryCount >= MAX_RETRY_ATTEMPTS)
        {
            Debug("Discarding message after max retries: " + msg.endpoint + "\r\n");
            processed++;
            continue;
        }
        
        String response;
        String fullUrl = String(API_BASE_URL) + msg.endpoint;
        
        if (makeHttpRequest(fullUrl, "POST", msg.payload, response, BASE_TIMEOUT))
        {
            Debug("Buffered message sent successfully: " + msg.endpoint + "\r\n");
            processed++;
        }
        else
        {
            msg.retryCount++;
            Debug("Buffered message retry " + String(msg.retryCount) + ": " + msg.endpoint + "\r\n");
            break; // Stop processing if we can't reach server
        }
    }
    
    // Remove processed messages
    if (processed > 0)
    {
        bufferHead = (bufferHead + processed) % OFFLINE_BUFFER_SIZE;
        bufferCount -= processed;
    }
}

void updateCommState(bool success)
{
    if (success)
    {
        commState.lastSuccessfulContact = millis();
        commState.consecutiveFailures = 0;
        commState.serverReachable = true;
        
        // Reduce timeout if we've been having issues
        if (commState.adaptiveTimeout > BASE_TIMEOUT)
        {
            commState.adaptiveTimeout = max(BASE_TIMEOUT, commState.adaptiveTimeout - 1000);
        }
    }
    else
    {
        commState.consecutiveFailures++;
        commState.serverReachable = false;
        
        // Increase timeout for future requests
        commState.adaptiveTimeout = min(MAX_TIMEOUT, commState.adaptiveTimeout + 2000);
        
        Debug("Communication failure #" + String(commState.consecutiveFailures) + 
              ", timeout increased to " + String(commState.adaptiveTimeout) + "ms\r\n");
    }
}

void sendHeartbeat()
{
    if (millis() - commState.lastHeartbeat < HEARTBEAT_INTERVAL)
    {
        return; // Too soon for next heartbeat
    }
    
    float batteryVoltage = readBatteryVoltage();
    int signalStrength = WiFi.RSSI();
    
    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    
    JsonObject statusObj = doc.createNestedObject("status");
    statusObj["status"] = "heartbeat";
    statusObj["batteryVoltage"] = batteryVoltage;
    statusObj["signalStrength"] = signalStrength;
    statusObj["firmwareVersion"] = FIRMWARE_VERSION;
    statusObj["bootCount"] = bootCount;
    statusObj["freeHeap"] = ESP.getFreeHeap();
    statusObj["uptime"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    String response;
    if (makeHttpRequest(STATUS_URL, "POST", jsonString, response, BASE_TIMEOUT))
    {
        Debug("Heartbeat sent successfully\r\n");
    }
    else
    {
        Debug("Heartbeat failed, buffering...\r\n");
        bufferMessage("device-status", jsonString);
    }
    
    commState.lastHeartbeat = millis();
}

bool isServerReachable()
{
    return commState.serverReachable || 
           (millis() - commState.lastSuccessfulContact < 300000); // 5 minutes grace period
}

void adaptiveDelay(int baseDelay)
{
    // Use shorter delays if we have good connectivity, longer if poor
    int actualDelay = baseDelay;
    if (commState.consecutiveFailures > 2)
    {
        actualDelay *= 2; // Double delay if having connection issues
    }
    
    unsigned long startTime = millis();
    while (millis() - startTime < actualDelay)
    {
        esp_task_wdt_reset(); // Feed watchdog during delays
        delay(100);
    }
}

// Serial streaming functions for efficient real-time monitoring

void enableSerialStreaming()
{
    if (!serialStream.streamingEnabled && isServerReachable())
    {
        serialStream.streamingEnabled = true;
        serialStream.buffer.reserve(SERIAL_STREAM_BUFFER_SIZE);
        serialStream.lastStreamTime = millis();
        Debug("Serial streaming enabled\r\n");
        
        // Send initial stream enable notification
        DynamicJsonDocument doc(512);
        doc["deviceId"] = DEVICE_ID;
        doc["streamEvent"] = "started";
        doc["timestamp"] = millis();
        
        String jsonString;
        serializeJson(doc, jsonString);
        bufferMessage("serial-stream", jsonString);
    }
}

void disableSerialStreaming()
{
    if (serialStream.streamingEnabled)
    {
        // Flush any remaining buffer content
        if (serialStream.buffer.length() > 0)
        {
            flushSerialStream();
        }
        
        serialStream.streamingEnabled = false;
        serialStream.isStreaming = false;
        serialStream.buffer = "";
        Debug("Serial streaming disabled\r\n");
        
        // Send stream disable notification
        DynamicJsonDocument doc(512);
        doc["deviceId"] = DEVICE_ID;
        doc["streamEvent"] = "stopped";
        doc["timestamp"] = millis();
        
        String jsonString;
        serializeJson(doc, jsonString);
        bufferMessage("serial-stream", jsonString);
    }
}

void captureSerialOutput(const String &output)
{
    if (!serialStream.streamingEnabled) return;
    
    // Add to buffer
    serialStream.buffer += output;
    
    // If buffer is getting full or enough time has passed, flush it
    if (serialStream.buffer.length() >= SERIAL_STREAM_MIN_CHARS ||
        (serialStream.buffer.length() > 0 && 
         millis() - serialStream.lastStreamTime >= SERIAL_STREAM_INTERVAL))
    {
        flushSerialStream();
    }
}

void flushSerialStream()
{
    if (!serialStream.streamingEnabled || serialStream.buffer.length() == 0) return;
    
    DynamicJsonDocument doc(2048);
    doc["deviceId"] = DEVICE_ID;
    doc["serialOutput"] = serialStream.buffer;
    doc["timestamp"] = millis();
    doc["bufferSize"] = serialStream.buffer.length();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    String response;
    String streamUrl = String(API_BASE_URL) + "serial-stream";
    
    if (makeHttpRequest(streamUrl, "POST", jsonString, response, BASE_TIMEOUT))
    {
        // Successfully streamed, clear buffer
        serialStream.buffer = "";
        serialStream.lastStreamTime = millis();
    }
    else
    {
        // Failed to stream, keep buffer but prevent it from growing too large
        if (serialStream.buffer.length() > SERIAL_STREAM_BUFFER_SIZE)
        {
            // Keep only the last half of the buffer to prevent memory issues
            int keepLength = SERIAL_STREAM_BUFFER_SIZE / 2;
            serialStream.buffer = serialStream.buffer.substring(serialStream.buffer.length() - keepLength);
        }
    }
}

// Custom debug write function that captures output for streaming
size_t debugWrite(const uint8_t *buffer, size_t size)
{
    // Write to serial as normal
    size_t written = Serial.write(buffer, size);
    
    // If streaming is enabled and we have good connectivity, capture the output
    if (serialStream.streamingEnabled && isServerReachable())
    {
        String output = "";
        for (size_t i = 0; i < size; i++)
        {
            output += (char)buffer[i];
        }
        captureSerialOutput(output);
    }
    
    return written;
}