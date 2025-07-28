#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "fonts.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "soc/rtc_cntl_reg.h"
#include "esp32-hal-cpu.h"
#include "esp_sleep.h"

// Configuration constants
#define API_BASE_URL "http://serverpi.local:3000/api/"
#define STATUS_URL "http://serverpi.local:3000/api/device-status"
#define MIN_SLEEP_TIME 300000000ULL      // 5 minutes
#define MAX_SLEEP_TIME 4294967295ULL     // Max value for 32-bit unsigned long (about 71 minutes)
#define DEFAULT_SLEEP_TIME 3600000000ULL // 1 hour
#define BATTERY_PIN A13
#define LOW_BATTERY_THRESHOLD 3.3
#define DEVICE_ID "esp32-001"
#define FIRMWARE_VERSION "1.0.0"

// Simple base64 decoder
String base64_decode(String input)
{
    const char *chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    String output = "";

    // Remove any padding
    while (input.endsWith("="))
    {
        input.remove(input.length() - 1);
    }

    for (int i = 0; i < input.length(); i += 4)
    {
        unsigned long combined = 0;
        int chars_count = 0;

        // Process 4 characters at a time
        for (int j = 0; j < 4 && (i + j) < input.length(); j++)
        {
            char c = input.charAt(i + j);
            int val = 0;

            // Find character in base64 alphabet
            for (int k = 0; k < 64; k++)
            {
                if (chars[k] == c)
                {
                    val = k;
                    break;
                }
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
    }

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

    // Fetch and display current image
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

    // Configure wake-up source
    esp_sleep_enable_timer_wakeup(DEFAULT_SLEEP_TIME);
}

bool connectToWiFi()
{
    Debug("Connecting to WiFi: " WIFI_SSID "\r\n");

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20)
    {
        delay(500);
        Debug(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Debug("\r\nWiFi connected!\r\n");
        Debug("IP address: " + WiFi.localIP().toString() + "\r\n");
        Debug("Signal strength: " + String(WiFi.RSSI()) + " dBm\r\n");
        return true;
    }
    else
    {
        Debug("\r\nWiFi connection failed!\r\n");
        return false;
    }
}

bool fetchCurrentImage()
{
    Debug("Fetching current image from server...\r\n");

    HTTPClient http;
    http.begin(API_BASE_URL "current.json");

    int httpResponseCode = http.GET();

    if (httpResponseCode == 200)
    {
        String payload = http.getString();
        Debug("Server response received\r\n");

        // Parse JSON response
        DynamicJsonDocument doc(8192);
        deserializeJson(doc, payload);

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

            // Decode base64 image
            String decoded = base64_decode(imageBase64);

            if (decoded.length() > 0)
            {
                Debug("Data decoded successfully\r\n");

                // Clear display first
                EPD_13IN3E_Clear(EPD_13IN3E_WHITE);
                delay(3000);

                // Check if this looks like image data or text data
                if (decoded.length() == (1150 * 1550))
                {
                    // This looks like raw image data for the display
                    Debug("Processing as image data\r\n");
                    displayImageFromData((const uint8_t *)decoded.c_str(), 1150, 1550);
                }
                else
                {
                    // This looks like text data
                    Debug("Processing as text data\r\n");
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

    // Calculate centering
    UWORD x_offset = (EPD_13IN3E_WIDTH - width) / 2;
    UWORD y_offset = (EPD_13IN3E_HEIGHT - height) / 2;

    // Display the image
    EPD_13IN3E_DisplayPart(imageData, x_offset, y_offset, width, height);

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

    HTTPClient http;
    http.begin(STATUS_URL);
    http.addHeader("Content-Type", "application/json");

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;

    JsonObject statusObj = doc.createNestedObject("status");
    statusObj["status"] = status;
    statusObj["batteryVoltage"] = batteryVoltage;
    statusObj["signalStrength"] = signalStrength;
    statusObj["firmwareVersion"] = FIRMWARE_VERSION;
    statusObj["bootCount"] = bootCount;
    statusObj["freeHeap"] = ESP.getFreeHeap();

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode == 200)
    {
        Debug("Status reported successfully\r\n");
    }
    else
    {
        Debug("Status report failed: " + String(httpResponseCode) + "\r\n");
    }

    http.end();
}

void sendLogToServer(const char *message, const char *level)
{
    Debug("Sending log: " + String(message) + "\r\n");

    HTTPClient http;
    http.begin(API_BASE_URL "logs");
    http.addHeader("Content-Type", "application/json");

    DynamicJsonDocument doc(1024);
    doc["deviceId"] = DEVICE_ID;
    doc["logs"] = message;
    doc["logLevel"] = level;
    doc["deviceTime"] = millis();

    String jsonString;
    serializeJson(doc, jsonString);

    http.POST(jsonString);
    http.end();
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