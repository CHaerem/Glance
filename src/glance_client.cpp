/*
 * Glance ESP32 Client
 * Fetches images and schedules from GitHub Pages server
 * Handles deep sleep cycles for battery optimization
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#include <SPIFFS.h>
#include <time.h>
#include "EPD_13in3e.h"
#include "GUI_Paint.h"
#include "ImageData.h"
#include "config.h"

// Configuration loaded from config.h (which uses environment variables)
const char* WIFI_SSID_VAR = WIFI_SSID;
const char* WIFI_PASSWORD_VAR = WIFI_PASSWORD;
const char* API_BASE_URL_VAR = API_BASE_URL;
const char* STATUS_URL_VAR = STATUS_URL;
const char* DEVICE_ID_VAR = DEVICE_ID;
const char* GITHUB_TOKEN_VAR = GITHUB_TOKEN;

// Status tracking
struct DeviceStatus {
  float batteryVoltage;
  int signalStrength;
  float temperature;
  unsigned long uptime;
  String firmwareVersion;
  bool lastUpdateSuccess;
  unsigned long lastUpdateTime;
  String lastError;
};

DeviceStatus deviceStatus;
EPD_13IN3E epd;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=== Glance E-Ink Display Client ===");
  
  // Initialize device status
  initializeDeviceStatus();
  
  // Initialize display
  if (initializeDisplay()) {
    Serial.println("Display initialized successfully");
  } else {
    Serial.println("Display initialization failed");
    enterDeepSleep(DEFAULT_SLEEP_TIME);
  }
  
  // Check battery level
  if (!checkBatteryLevel()) {
    Serial.println("Battery too low, entering extended sleep");
    showLowBatteryScreen();
    enterDeepSleep(MAX_SLEEP_TIME); // Sleep for 24 hours
  }
  
  // Connect to WiFi
  if (connectToWiFi()) {
    Serial.println("WiFi connected successfully");
    updateDeviceStatus();
    
    // Fetch and display new image
    if (fetchAndDisplayImage()) {
      Serial.println("Image updated successfully");
      deviceStatus.lastUpdateSuccess = true;
    } else {
      Serial.println("Image update failed");
      deviceStatus.lastUpdateSuccess = false;
    }
    
    // Report status to server
    reportDeviceStatus();
    
    // Calculate next sleep duration
    unsigned long sleepDuration = calculateSleepDuration();
    Serial.printf("Entering deep sleep for %lu seconds\n", sleepDuration / 1000000ULL);
    
    enterDeepSleep(sleepDuration);
  } else {
    Serial.println("WiFi connection failed");
    // Use exponential backoff for retry
    unsigned long retryDelay = getRetryDelay();
    Serial.printf("Retrying in %lu minutes\n", retryDelay / 60000000ULL);
    enterDeepSleep(retryDelay);
  }
}

void loop() {
  // This should never be reached due to deep sleep
  delay(1000);
}

void initializeDeviceStatus() {
  deviceStatus.firmwareVersion = FIRMWARE_VERSION;
  deviceStatus.uptime = millis();
  deviceStatus.lastUpdateSuccess = false;
  deviceStatus.lastUpdateTime = 0;
  deviceStatus.lastError = "";
}

bool initializeDisplay() {
  if (epd.Init() != 0) {
    return false;
  }
  
  // Clear display on first boot
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if (wakeup_reason == ESP_SLEEP_WAKEUP_UNDEFINED) {
    epd.Clear();
    Serial.println("Display cleared (first boot)");
  }
  
  return true;
}

bool checkBatteryLevel() {
  deviceStatus.batteryVoltage = getBatteryVoltage();
  Serial.printf("Battery voltage: %.2fV\n", deviceStatus.batteryVoltage);
  
  return deviceStatus.batteryVoltage > LOW_BATTERY_THRESHOLD;
}

float getBatteryVoltage() {
  // Read battery voltage (adjust based on your voltage divider)
  int rawValue = analogRead(BATTERY_PIN);
  float voltage = (rawValue / 4095.0) * 3.3 * 2; // Assuming 2:1 voltage divider
  return voltage;
}

void showLowBatteryScreen() {
  // Display low battery warning
  epd.Clear();
  
  // Create battery warning image
  UBYTE *image = (UBYTE *)malloc(EPD_13IN3E_WIDTH * EPD_13IN3E_HEIGHT / 2);
  if (image == NULL) return;
  
  Paint_NewImage(image, EPD_13IN3E_WIDTH, EPD_13IN3E_HEIGHT, 0, WHITE);
  Paint_Clear(WHITE);
  
  // Draw low battery icon and text
  Paint_DrawString_EN(400, 300, "LOW BATTERY", &Font48, WHITE, BLACK);
  Paint_DrawString_EN(350, 400, "Please charge device", &Font24, WHITE, BLACK);
  Paint_DrawString_EN(300, 450, "Entering extended sleep mode", &Font20, WHITE, BLACK);
  
  epd.Display(image);
  free(image);
}

bool connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID_VAR, WIFI_PASSWORD_VAR);
  
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID_VAR);
  
  int attempts = 0;
  const int maxAttempts = 20; // 10 seconds timeout
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.print("WiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    return true;
  } else {
    Serial.println("");
    Serial.println("WiFi connection failed");
    Serial.print("Status code: ");
    Serial.println(WiFi.status());
    return false;
  }
}

void updateDeviceStatus() {
  deviceStatus.signalStrength = WiFi.RSSI();
  deviceStatus.temperature = getTemperature();
  deviceStatus.uptime = millis();
  
  Serial.printf("Signal strength: %d dBm\n", deviceStatus.signalStrength);
  Serial.printf("Temperature: %.1f°C\n", deviceStatus.temperature);
}

float getTemperature() {
  // Get internal temperature (ESP32 has built-in temperature sensor)
  // Note: This is approximate and needs calibration
  return 25.0 + (random(-50, 50) / 10.0); // Simulated for now
}

bool fetchAndDisplayImage() {
  HTTPClient http;
  String url = String(API_BASE_URL_VAR) + "current.json";
  
  // Add cache-busting parameter to ensure fresh data
  url += "?t=" + String(millis());
  
  http.begin(url);
  http.addHeader("User-Agent", "Glance-ESP32/1.0");
  http.addHeader("X-Device-ID", DEVICE_ID_VAR);
  http.addHeader("Cache-Control", "no-cache");
  
  Serial.println("Fetching image from: " + url);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String response = http.getString();
    http.end();
    return processImageResponse(response);
  } else if (httpResponseCode == 304) {
    Serial.println("Image not modified, using cached version");
    http.end();
    return true; // Not an error, just no update needed
  } else {
    Serial.printf("HTTP request failed: %d\n", httpResponseCode);
    deviceStatus.lastError = "HTTP Error: " + String(httpResponseCode);
    http.end();
    return false;
  }
}

bool processImageResponse(String jsonResponse) {
  DynamicJsonDocument doc(8192);
  DeserializationError error = deserializeJson(doc, jsonResponse);
  
  if (error) {
    Serial.print("JSON parsing failed: ");
    Serial.println(error.c_str());
    deviceStatus.lastError = "JSON Parse Error: " + String(error.c_str());
    return false;
  }
  
  // Extract data from GitHub API response
  String imageData = doc["image"];
  String title = doc["title"];
  unsigned long sleepDuration = doc["sleepDuration"] | DEFAULT_SLEEP_TIME; // Default if not provided
  unsigned long timestamp = doc["timestamp"];
  String imageId = doc["imageId"];
  
  Serial.printf("Received image: %s\n", title.c_str());
  Serial.printf("Image ID: %s\n", imageId.c_str());
  Serial.printf("Sleep duration: %lu ms\n", sleepDuration);
  Serial.printf("Server timestamp: %lu\n", timestamp);
  
  // Check if this is a new image by comparing timestamp or imageId
  static String lastImageId = "";
  if (imageId == lastImageId && imageId.length() > 0) {
    Serial.println("Same image as last update, skipping display refresh");
    storeSleepDuration(sleepDuration);
    return true;
  }
  lastImageId = imageId;
  
  // Store sleep duration for later use
  storeSleepDuration(sleepDuration);
  
  // Process and display image
  if (imageData.length() > 0) {
    return displayBase64Image(imageData, title);
  } else {
    Serial.println("No image data in response, displaying status only");
    return displayStatusScreen(title);
  }
}

bool displayBase64Image(String base64Data, String title) {
  // For now, display a placeholder with the title
  // In production, you'd decode the base64 and convert to e-paper format
  
  epd.Clear();
  
  UBYTE *image = (UBYTE *)malloc(EPD_13IN3E_WIDTH * EPD_13IN3E_HEIGHT / 2);
  if (image == NULL) {
    deviceStatus.lastError = "Memory allocation failed";
    return false;
  }
  
  Paint_NewImage(image, EPD_13IN3E_WIDTH, EPD_13IN3E_HEIGHT, 0, WHITE);
  Paint_Clear(WHITE);
  
  // Display title and status
  Paint_DrawString_EN(100, 100, title.c_str(), &Font48, WHITE, BLACK);
  Paint_DrawString_EN(100, 200, "Glance Display", &Font24, WHITE, RED);
  
  // Display device info
  String batteryText = "Battery: " + String(deviceStatus.batteryVoltage, 1) + "V";
  String signalText = "Signal: " + String(deviceStatus.signalStrength) + " dBm";
  String timeText = "Updated: " + getCurrentTimeString();
  
  Paint_DrawString_EN(100, 300, batteryText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 330, signalText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 360, timeText.c_str(), &Font20, WHITE, BLACK);
  
  // TODO: Implement actual base64 image decoding and display
  // This would involve:
  // 1. Decode base64 to binary
  // 2. Convert image format to e-paper compatible
  // 3. Apply dithering and color mapping
  // 4. Display on e-paper
  
  epd.Display(image);
  free(image);
  
  deviceStatus.lastUpdateTime = millis();
  return true;
}

bool displayStatusScreen(String title) {
  // Display status screen when no image is available
  epd.Clear();
  
  UBYTE *image = (UBYTE *)malloc(EPD_13IN3E_WIDTH * EPD_13IN3E_HEIGHT / 2);
  if (image == NULL) {
    deviceStatus.lastError = "Memory allocation failed";
    return false;
  }
  
  Paint_NewImage(image, EPD_13IN3E_WIDTH, EPD_13IN3E_HEIGHT, 0, WHITE);
  Paint_Clear(WHITE);
  
  // Display title and status
  Paint_DrawString_EN(100, 100, "Glance Display", &Font48, WHITE, BLACK);
  Paint_DrawString_EN(100, 180, title.c_str(), &Font24, WHITE, RED);
  
  // Display device status
  String batteryText = "Battery: " + String(deviceStatus.batteryVoltage, 1) + "V (" + 
                      String(int((deviceStatus.batteryVoltage - 3.2) / (4.2 - 3.2) * 100)) + "%)";
  String signalText = "WiFi: " + String(deviceStatus.signalStrength) + " dBm";
  String tempText = "Temperature: " + String(deviceStatus.temperature, 1) + "°C";
  String timeText = "Updated: " + getCurrentTimeString();
  String deviceText = "Device: " + String(DEVICE_ID_VAR);
  String firmwareText = "Firmware: " + deviceStatus.firmwareVersion;
  
  Paint_DrawString_EN(100, 280, batteryText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 310, signalText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 340, tempText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 370, timeText.c_str(), &Font20, WHITE, BLACK);
  Paint_DrawString_EN(100, 420, deviceText.c_str(), &Font16, WHITE, BLUE);
  Paint_DrawString_EN(100, 450, firmwareText.c_str(), &Font16, WHITE, BLUE);
  
  // Show connection status
  if (WiFi.status() == WL_CONNECTED) {
    String ipText = "IP: " + WiFi.localIP().toString();
    Paint_DrawString_EN(100, 500, ipText.c_str(), &Font16, WHITE, GREEN);
  } else {
    Paint_DrawString_EN(100, 500, "WiFi: Disconnected", &Font16, WHITE, RED);
  }
  
  epd.Display(image);
  free(image);
  
  deviceStatus.lastUpdateTime = millis();
  return true;
}

void storeSleepDuration(unsigned long duration) {
  // Store in RTC memory for persistence across deep sleep
  esp_sleep_enable_timer_wakeup(duration * 1000); // Convert ms to microseconds
}

unsigned long calculateSleepDuration() {
  // Get stored duration from last server response
  unsigned long duration = DEFAULT_SLEEP_TIME;
  
  // Adjust based on battery level
  if (deviceStatus.batteryVoltage < 3.6) {
    duration *= 2; // Double sleep time if battery is low
  }
  
  // Ensure within bounds
  if (duration < MIN_SLEEP_TIME) duration = MIN_SLEEP_TIME;
  if (duration > MAX_SLEEP_TIME) duration = MAX_SLEEP_TIME;
  
  return duration;
}

unsigned long getRetryDelay() {
  // Exponential backoff for retry attempts
  static int retryCount = 0;
  retryCount++;
  
  unsigned long delay = MIN_SLEEP_TIME * (1 << min(retryCount - 1, 6)); // Max 64x multiplier
  return min(delay, MAX_SLEEP_TIME);
}

bool reportDeviceStatus() {
  // Report status via GitHub Actions (Repository Dispatch)
  if (strlen(GITHUB_TOKEN_VAR) == 0) {
    Serial.println("No GitHub token configured, skipping status report");
    return true; // Don't treat as error if token not configured
  }
  
  HTTPClient http;
  http.begin(STATUS_URL_VAR);
  http.addHeader("Authorization", "token " + String(GITHUB_TOKEN_VAR));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/vnd.github.v3+json");
  http.addHeader("User-Agent", "Glance-ESP32/1.0");
  
  // Create GitHub Actions dispatch payload
  DynamicJsonDocument doc(1024);
  doc["event_type"] = "update-device-status";
  
  // Create client_payload with device status
  JsonObject payload = doc.createNestedObject("client_payload");
  payload["device_id"] = DEVICE_ID_VAR;
  
  JsonObject status = payload.createNestedObject("status");
  status["deviceId"] = DEVICE_ID_VAR;
  status["batteryLevel"] = int((deviceStatus.batteryVoltage - 3.2) / (4.2 - 3.2) * 100);
  status["batteryVoltage"] = deviceStatus.batteryVoltage;
  status["signalStrength"] = deviceStatus.signalStrength;
  status["temperature"] = deviceStatus.temperature;
  status["uptime"] = deviceStatus.uptime;
  status["firmwareVersion"] = deviceStatus.firmwareVersion;
  status["lastUpdateSuccess"] = deviceStatus.lastUpdateSuccess;
  status["lastUpdateTime"] = deviceStatus.lastUpdateTime;
  status["freeHeap"] = ESP.getFreeHeap();
  status["timestamp"] = getCurrentTimestamp();
  status["wifiRSSI"] = WiFi.RSSI();
  status["macAddress"] = WiFi.macAddress();
  
  if (!deviceStatus.lastError.isEmpty()) {
    status["lastError"] = deviceStatus.lastError;
  }
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("Sending status to GitHub Actions:");
  Serial.println(jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  String response = http.getString();
  http.end();
  
  Serial.printf("GitHub Actions dispatch: %d\n", httpResponseCode);
  if (httpResponseCode != 204) {
    Serial.println("Response: " + response);
  }
  
  return httpResponseCode == 204; // GitHub Actions returns 204 on success
}

String getCurrentTimeString() {
  time_t now;
  struct tm timeinfo;
  time(&now);
  localtime_r(&now, &timeinfo);
  
  char timeStr[64];
  strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeStr);
}

unsigned long getCurrentTimestamp() {
  time_t now;
  time(&now);
  return now;
}

void enterDeepSleep(unsigned long duration) {
  Serial.println("Preparing for deep sleep...");
  
  // Cleanup
  WiFi.disconnect(true);
  esp_wifi_stop();
  
  // Configure wake up timer
  esp_sleep_enable_timer_wakeup(duration);
  
  // Optional: Enable wake up on external button press
  // esp_sleep_enable_ext0_wakeup(GPIO_NUM_0, 0);
  
  Serial.println("Entering deep sleep...");
  Serial.flush();
  
  // Enter deep sleep
  esp_deep_sleep_start();
}