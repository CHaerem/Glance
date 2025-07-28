#ifndef CONFIG_H
#define CONFIG_H

// Configuration file for Glance ESP32 client
// This file loads settings from environment or defaults

// Load from environment variables or use defaults
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"  // Will be replaced by build system
#endif

#ifndef WIFI_PASSWORD  
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"  // Will be replaced by build system
#endif

#ifndef GITHUB_TOKEN
#define GITHUB_TOKEN ""  // Optional: GitHub token for status reporting
#endif

#ifndef DEVICE_ID
#define DEVICE_ID "esp32-001"  // Unique device identifier
#endif

// API Configuration - Local Server
// Uses serverpi.local hostname for automatic discovery
#define API_BASE_URL "http://serverpi.local:3000/api/"
#define STATUS_URL "http://serverpi.local:3000/api/device-status"

// Sleep Configuration (in microseconds)
#define MIN_SLEEP_TIME 300000000ULL    // 5 minutes
#define MAX_SLEEP_TIME 4294967295ULL   // Max value for 32-bit unsigned long (about 71 minutes)
#define DEFAULT_SLEEP_TIME 3600000000ULL // 1 hour

// Battery Configuration
#define BATTERY_PIN A13
#define LOW_BATTERY_THRESHOLD 3.3

// Hardware Configuration
#define FIRMWARE_VERSION "1.0.0"

#endif // CONFIG_H