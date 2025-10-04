#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

extern "C" {
  #include "GDEP133C02.h"
  #include "comm.h"
  #include "pindefine.h"
}

#define DISPLAY_WIDTH  1200
#define DISPLAY_HEIGHT 1600
#define RGB_SIZE       (DISPLAY_WIDTH * DISPLAY_HEIGHT * 3)
#define EINK_SIZE      (DISPLAY_WIDTH * DISPLAY_HEIGHT / 2)

const char* WIFI_SSID = "YourNetwork";
const char* WIFI_PASSWORD = "YourPassword";
const char* SERVER_URL = "http://192.168.86.40:3000/api/image.bin";

uint8_t* rgb_buffer = NULL;
uint8_t* eink_buffer = NULL;
int bytes_downloaded = 0;

// E-ink color mapping
uint8_t rgb_to_eink(uint8_t r, uint8_t g, uint8_t b) {
    if (r < 32 && g < 32 && b < 32) return 0x0; // BLACK
    if (r > 224 && g > 224 && b > 224) return 0x1; // WHITE
    if (r > 200 && g > 200 && b < 100) return 0x2; // YELLOW
    if (r > 200 && g < 100 && b < 100) return 0x3; // RED
    if (r < 100 && g < 100 && b > 200) return 0x5; // BLUE
    if (r < 100 && g > 200 && b < 100) return 0x6; // GREEN

    int brightness = (r + g + b) / 3;
    return (brightness > 127) ? 0x1 : 0x0;
}

void convert_rgb_to_eink(uint8_t *rgb, uint8_t *eink, int pixels) {
    for (int i = 0; i < pixels; i++) {
        uint8_t r = rgb[i * 3];
        uint8_t g = rgb[i * 3 + 1];
        uint8_t b = rgb[i * 3 + 2];
        uint8_t color = rgb_to_eink(r, g, b);

        int eink_idx = i / 2;
        if (i % 2 == 0) {
            eink[eink_idx] = (eink[eink_idx] & 0x0F) | (color << 4);
        } else {
            eink[eink_idx] = (eink[eink_idx] & 0xF0) | color;
        }
    }
}

void wifi_connect() {
    Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\nWiFi connection failed!");
    }
}

bool download_and_display() {
    Serial.printf("Allocating RGB buffer (%d KB)...\n", RGB_SIZE / 1024);
    rgb_buffer = (uint8_t *)malloc(RGB_SIZE);

    Serial.printf("Allocating e-ink buffer (%d KB)...\n", EINK_SIZE / 1024);
    eink_buffer = (uint8_t *)malloc(EINK_SIZE);

    if (!rgb_buffer || !eink_buffer) {
        Serial.println("Memory allocation failed!");
        if (rgb_buffer) free(rgb_buffer);
        if (eink_buffer) free(eink_buffer);
        return false;
    }

    bytes_downloaded = 0;
    Serial.println("Downloading from server...");

    HTTPClient http;
    http.begin(SERVER_URL);
    http.setTimeout(60000);

    int httpCode = http.GET();
    Serial.printf("HTTP Status: %d\n", httpCode);

    if (httpCode == 200) {
        WiFiClient* stream = http.getStreamPtr();
        int total = http.getSize();
        Serial.printf("Content length: %d bytes\n", total);

        while (http.connected() && bytes_downloaded < total && bytes_downloaded < RGB_SIZE) {
            size_t available = stream->available();
            if (available) {
                int toRead = min((int)available, RGB_SIZE - bytes_downloaded);
                int read = stream->readBytes(rgb_buffer + bytes_downloaded, toRead);
                bytes_downloaded += read;

                if (bytes_downloaded % 100000 == 0) {
                    Serial.printf("Downloaded: %d KB\n", bytes_downloaded / 1024);
                }
            }
            delay(1);
        }

        Serial.printf("Download complete! Got %d bytes\n", bytes_downloaded);

        if (bytes_downloaded > 0) {
            Serial.println("Converting RGB to e-ink...");
            memset(eink_buffer, 0x11, EINK_SIZE);
            convert_rgb_to_eink(rgb_buffer, eink_buffer, DISPLAY_WIDTH * DISPLAY_HEIGHT);

            Serial.println("Displaying image...");
            setPinCsAll(GPIO_LOW);
            checkBusyLow();
            epdDisplayImage(eink_buffer);
            setPinCsAll(GPIO_HIGH);

            Serial.println("Done!");
            http.end();
            free(rgb_buffer);
            free(eink_buffer);
            return true;
        }
    }

    Serial.println("Download failed!");
    http.end();
    free(rgb_buffer);
    free(eink_buffer);
    return false;
}

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println("\n=== Glance WiFi E-ink Display ===");
    Serial.println("Good Display ESP32-133C02");

    // Init display hardware
    Serial.println("Initializing display...");
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    setPinCsAll(GPIO_HIGH);
    initEPD();

    // Clear to white
    Serial.println("Clearing display...");
    setPinCsAll(GPIO_LOW);
    checkBusyLow();
    epdDisplayColor(WHITE);
    setPinCsAll(GPIO_HIGH);
    delay(2000);

    // Connect WiFi
    wifi_connect();

    // Download and display
    if (WiFi.status() == WL_CONNECTED) {
        initEPD();
        if (!download_and_display()) {
            Serial.println("Fallback to color bars");
            initEPD();
            epdDisplayColorBar();
        }
    } else {
        Serial.println("No WiFi - showing color bars");
        initEPD();
        epdDisplayColorBar();
    }

    Serial.println("Restart in 60 seconds...");
    delay(60000);
    ESP.restart();
}

void loop() {
    delay(1000);
}
