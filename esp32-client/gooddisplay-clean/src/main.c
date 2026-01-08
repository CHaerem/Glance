#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_task_wdt.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_sleep.h"
#include "esp_mac.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "cJSON.h"

#include "GDEP133C02.h"
#include "comm.h"
#include "pindefine.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "ota.h"
#include "server_config.h"

// WiFi credentials - set via environment variables during build
// Example: export WIFI_SSID="YourNetwork" WIFI_PASSWORD="YourPassword"
#ifndef WIFI_SSID
#define WIFI_SSID      "Internett"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD  "Yellowfinch924"
#endif

#define DISPLAY_WIDTH  1200
#define DISPLAY_HEIGHT 1600
#define EINK_SIZE      (DISPLAY_WIDTH * DISPLAY_HEIGHT / 2)  // 2 pixels per byte (4 bits each)
#define CHUNK_SIZE     (32 * 1024)

#define WIFI_CONNECTED_BIT BIT0
#define DEFAULT_SLEEP_DURATION (60ULL * 60 * 1000000)  // 1 hour in microseconds
#define MIN_SLEEP_DURATION (10ULL * 1000000)           // 10 seconds minimum
#define MAX_SLEEP_DURATION (24ULL * 60 * 60 * 1000000) // 24 hours maximum
#define CHARGING_SLEEP_DURATION (30ULL * 1000000)      // 30 seconds when charging

// Network timeouts and delays
#define WIFI_CONNECT_TIMEOUT_MS    30000  // 30 second WiFi connection timeout
#define HTTP_METADATA_TIMEOUT_MS   10000  // 10 second metadata fetch timeout
#define HTTP_IMAGE_TIMEOUT_MS      60000  // 60 second image download timeout
#define BATTERY_RECOVERY_DELAY_MS  2000   // 2 second delay between operations

// ADC configuration
#define ADC_SAMPLE_COUNT           20     // Number of ADC samples for median
#define ADC_SAMPLE_DELAY_MS        5      // Delay between ADC samples
#define ADC_MAX_VARIANCE_RAW       200    // Max variance for valid sensor
#define ADC_STABILIZE_DELAY_MS     50     // Initial ADC stabilization delay

// HTTP limits
#define METADATA_MAX_SIZE_BYTES    100000 // Maximum metadata JSON size
#define STATUS_POST_BUFFER_SIZE    512    // Device status POST buffer size
#define TEST_POST_BUFFER_SIZE      256    // Battery test POST buffer size

// Display timing - increased delays to prevent brownout at high-current operations
#define DISPLAY_ROW_DELAY_MS       1      // Delay between display rows
#define DISPLAY_IC_DELAY_MS        100    // Delay between display ICs (increased from 50ms)
#define WIFI_SHUTDOWN_DELAY_MS     1000   // WiFi shutdown stabilization (increased from 500ms)
#define POST_INIT_DELAY_MS         500    // Delay after initEPD() before data transfer
#define PRE_REFRESH_DELAY_MS       500    // Delay before display refresh (increased from 200ms)

// Brownout recovery
#define BROWNOUT_THRESHOLD_COUNT   3      // Brownouts before recovery mode
#define BROWNOUT_RECOVERY_SLEEP_S  3600   // 1 hour sleep in recovery mode

static EventGroupHandle_t s_wifi_event_group;
static char device_id[32] = {0};

// RTC memory survives deep sleep - boot count only
RTC_DATA_ATTR static uint32_t boot_count = 0;

// NVS keys for persistent storage (survives power cycle)
#define NVS_NAMESPACE "glance"
#define NVS_KEY_IMAGE_ID "image_id"
#define NVS_KEY_IN_OPERATION "in_op"  // Dirty flag for pseudo-brownout detection

// Battery monitoring configuration
// GPIO 2 = ADC1_CH1 - connected to unlabeled solder pad on Good Display ESP32-133C02
// Pad identified by "2 sec HIGH" timing in GPIO discovery mode
#define BATTERY_ADC_CHANNEL ADC_CHANNEL_1  // GPIO 2 on ESP32-S3
#define BATTERY_GPIO        2
#define BATTERY_ADC_ATTEN   ADC_ATTEN_DB_12  // 0-3.3V range
// Voltage divider ratio: calibrated from actual ADC readings
// ADC reads ~0.85V when battery is ~4.0V → ratio = 4.0 / 0.85 ≈ 4.7
#define VOLTAGE_DIVIDER_RATIO 4.7f

// Battery protection thresholds (standard LiPo values)
#define BATTERY_CRITICAL 3.3f  // Below this: emergency mode (LiPo cutoff)
#define BATTERY_LOW      3.5f  // Below this: low battery warning
#define BATTERY_CHARGED  3.6f  // Above this: normal operation
// Display threshold: Conservative but not excessive
// Healthy battery at 3.5V can handle display refresh (>1A peak)
// Let brownout recovery handle weak batteries instead of blocking all displays
#define DISPLAY_MIN_BATTERY 3.5f  // Minimum for display refresh (healthy battery should work)
#define EMERGENCY_SLEEP_DURATION (24ULL * 60 * 60 * 1000000)  // 24 hours

// Battery sensor sanity checks (detect disconnected/faulty sensor)
#define BATTERY_MAX_VALID 4.5f   // Max possible LiPo voltage (with some margin)
#define BATTERY_MIN_VALID 2.5f   // Below this, sensor is likely disconnected
#define BATTERY_SENSOR_INVALID -1.0f  // Return value when sensor is not connected

// Battery test mode - set to 1 to enable, 0 for normal operation
#define BATTERY_TEST_MODE 0
#define BATTERY_TEST_CYCLES 3  // Number of test cycles before normal mode

// Load last image ID from NVS (persistent storage)
bool load_last_image_id(char* image_id, size_t max_len) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs_handle);

    if (err != ESP_OK) {
        printf("NVS open failed (first boot?): %s\n", esp_err_to_name(err));
        return false;
    }

    size_t required_size = max_len;
    err = nvs_get_str(nvs_handle, NVS_KEY_IMAGE_ID, image_id, &required_size);
    nvs_close(nvs_handle);

    if (err == ESP_OK) {
        printf("Loaded last image ID from NVS: %s\n", image_id);
        return true;
    } else if (err == ESP_ERR_NVS_NOT_FOUND) {
        printf("No previous image ID in NVS (first boot)\n");
        return false;
    } else {
        printf("NVS read error: %s\n", esp_err_to_name(err));
        return false;
    }
}

// Save image ID to NVS (persistent storage)
void save_last_image_id(const char* image_id) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle);

    if (err != ESP_OK) {
        printf("ERROR: Failed to open NVS for write: %s\n", esp_err_to_name(err));
        return;
    }

    err = nvs_set_str(nvs_handle, NVS_KEY_IMAGE_ID, image_id);
    if (err != ESP_OK) {
        printf("ERROR: Failed to write image ID to NVS: %s\n", esp_err_to_name(err));
        nvs_close(nvs_handle);
        return;
    }

    err = nvs_commit(nvs_handle);
    if (err != ESP_OK) {
        printf("ERROR: Failed to commit NVS: %s\n", esp_err_to_name(err));
    } else {
        printf("Saved image ID to NVS: %s\n", image_id);
    }

    nvs_close(nvs_handle);
}

/**
 * @brief Set the "in operation" dirty flag for pseudo-brownout detection
 *
 * Call this BEFORE starting high-power operations (display refresh).
 * If the device resets while this flag is set, it indicates a brownout
 * even if the reset reason shows as POWERON.
 */
void set_in_operation_flag(bool in_operation) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) return;

    if (in_operation) {
        nvs_set_u8(nvs_handle, NVS_KEY_IN_OPERATION, 1);
    } else {
        nvs_erase_key(nvs_handle, NVS_KEY_IN_OPERATION);
    }
    nvs_commit(nvs_handle);
    nvs_close(nvs_handle);
}

/**
 * @brief Check if the "in operation" flag was set when device reset
 *
 * @return true if device was in a high-power operation when it reset
 */
bool was_in_operation(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) return false;

    uint8_t flag = 0;
    nvs_get_u8(nvs_handle, NVS_KEY_IN_OPERATION, &flag);
    nvs_close(nvs_handle);
    return flag == 1;
}

/**
 * @brief Read battery voltage from ADC with median filtering
 *
 * Reads battery voltage from GPIO 2 (ADC1_CH1) via voltage divider.
 * Takes 20 samples over 100ms and returns median to reject outliers.
 *
 * Voltage divider ratio: 4.7 (calibrated from actual ADC readings)
 *
 * Performs sanity checks:
 * - Variance < 200 raw units (sensor not floating)
 * - Voltage < 4.5V (sensor not floating high)
 * - Voltage > 2.5V (sensor connected)
 *
 * @return Battery voltage in volts, or BATTERY_SENSOR_INVALID (-1.0) if sensor is disconnected/faulty
 */
float read_battery_voltage(void) {
    // Small delay to let ADC stabilize after boot
    vTaskDelay(pdMS_TO_TICKS(ADC_STABILIZE_DELAY_MS));

    adc_oneshot_unit_handle_t adc_handle;
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config, &adc_handle));

    adc_oneshot_chan_cfg_t config = {
        .atten = ADC_ATTEN_DB_12,  // 0-3.3V range
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, BATTERY_ADC_CHANNEL, &config));

    // Take multiple readings for stability - use median to reject outliers
    const int num_samples = ADC_SAMPLE_COUNT;
    int samples[ADC_SAMPLE_COUNT];
    int min_raw = 4095;
    int max_raw = 0;

    for (int i = 0; i < num_samples; i++) {
        int raw = 0;
        adc_oneshot_read(adc_handle, BATTERY_ADC_CHANNEL, &raw);
        samples[i] = raw;
        if (raw < min_raw) min_raw = raw;
        if (raw > max_raw) max_raw = raw;
        vTaskDelay(pdMS_TO_TICKS(ADC_SAMPLE_DELAY_MS));
    }

    // Simple bubble sort for median
    for (int i = 0; i < num_samples - 1; i++) {
        for (int j = 0; j < num_samples - i - 1; j++) {
            if (samples[j] > samples[j + 1]) {
                int temp = samples[j];
                samples[j] = samples[j + 1];
                samples[j + 1] = temp;
            }
        }
    }

    // Use median (average of middle two values for even count)
    int median_raw = (samples[num_samples/2 - 1] + samples[num_samples/2]) / 2;
    int range = max_raw - min_raw;
    int avg_raw = median_raw;  // Use median as the "average"

    float adc_voltage = (avg_raw / 4095.0f) * 3.3f;
    float battery_voltage = adc_voltage * VOLTAGE_DIVIDER_RATIO;

    printf("Battery: raw=%d (range=%d), adc=%.2fV, bat=%.2fV (GPIO %d)\n",
           avg_raw, range, adc_voltage, battery_voltage, BATTERY_GPIO);

    ESP_ERROR_CHECK(adc_oneshot_del_unit(adc_handle));

    // Sanity check 1: High variance means floating/disconnected sensor
    // A properly connected voltage divider should have stable readings
    if (range > ADC_MAX_VARIANCE_RAW) {
        printf("⚠️  Battery readings unstable (range=%d) - sensor floating or disconnected\n", range);
        return BATTERY_SENSOR_INVALID;
    }

    // Sanity check 2: Impossible high voltage (> 4.5V means floating high)
    if (battery_voltage > BATTERY_MAX_VALID) {
        printf("⚠️  Battery reading %.2fV is impossible (>%.1fV) - sensor floating\n",
               battery_voltage, BATTERY_MAX_VALID);
        return BATTERY_SENSOR_INVALID;
    }

    // Sanity check 3: Very low voltage (< 0.5V means disconnected or shorted to GND)
    if (battery_voltage < BATTERY_MIN_VALID) {
        printf("⚠️  Battery reading %.2fV is too low (<%.1fV) - sensor disconnected\n",
               battery_voltage, BATTERY_MIN_VALID);
        return BATTERY_SENSOR_INVALID;
    }

    return battery_voltage;
}

void get_device_id(void) {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(device_id, sizeof(device_id), "esp32-%02x%02x%02x",
             mac[3], mac[4], mac[5]);
    printf("Device ID: %s\n", device_id);
}

#ifdef ENABLE_HARDWARE_DEBUG
// Hardware debugging functions - only compiled when ENABLE_HARDWARE_DEBUG is defined
// These are useful for hardware bring-up and troubleshooting

// Scan ALL ADC1 channels to find where the battery voltage appears
void scan_all_adc_channels(void) {
    printf("\n=== SCANNING ALL ADC1 CHANNELS ===\n");
    printf("Looking for ~0.46V ADC (should show as ~4.0V battery with 8.8:1 divider)...\n\n");

    adc_oneshot_unit_handle_t adc_handle;
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    adc_oneshot_new_unit(&init_config, &adc_handle);

    adc_oneshot_chan_cfg_t config = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };

    // Scan channels 0-9 (GPIO 1-10 on ESP32-S3)
    for (int ch = 0; ch <= 9; ch++) {
        adc_oneshot_config_channel(adc_handle, ch, &config);
        int raw = 0;
        adc_oneshot_read(adc_handle, ch, &raw);
        float adc_v = (raw / 4095.0f) * 3.3f;
        float bat_v = adc_v * VOLTAGE_DIVIDER_RATIO;

        // Highlight channels with battery-like voltage (3.0-4.5V range)
        const char* marker = (bat_v > 3.0f && bat_v < 4.5f) ? " <-- POSSIBLE BATTERY" : "";
        printf("  CH%d (GPIO %d): raw=%4d, adc=%.2fV, bat=%.2fV%s\n",
               ch, ch+1, raw, adc_v, bat_v, marker);
    }
    printf("=== END SCAN ===\n\n");

    adc_oneshot_del_unit(adc_handle);
}

// GPIO TOGGLE TEST - toggle a specific GPIO HIGH/LOW in a loop
// Use multimeter to verify which pad this GPIO corresponds to
void gpio_discovery_test(void) {
    int test_gpio = 2;  // GPIO 2 - suspected battery pin

    printf("\n");
    printf("╔═══════════════════════════════════════════════════════════════╗\n");
    printf("║              GPIO %2d TOGGLE TEST                              ║\n", test_gpio);
    printf("║                                                               ║\n");
    printf("║  GPIO %2d will toggle: HIGH (3.3V) for 5 sec, LOW for 5 sec   ║\n", test_gpio);
    printf("║  Use multimeter to find which pad shows 3.3V / 0V            ║\n");
    printf("║                                                               ║\n");
    printf("║  Runs forever - reset device when done                       ║\n");
    printf("╚═══════════════════════════════════════════════════════════════╝\n\n");

    gpio_reset_pin(test_gpio);
    gpio_set_direction(test_gpio, GPIO_MODE_OUTPUT);

    int cycle = 0;
    while (1) {
        cycle++;

        printf("Cycle %d: GPIO %d -> HIGH (3.3V)\n", cycle, test_gpio);
        gpio_set_level(test_gpio, 1);
        vTaskDelay(pdMS_TO_TICKS(5000));  // 5 seconds HIGH

        printf("Cycle %d: GPIO %d -> LOW (0V)\n", cycle, test_gpio);
        gpio_set_level(test_gpio, 0);
        vTaskDelay(pdMS_TO_TICKS(5000));  // 5 seconds LOW
    }
}

#endif // ENABLE_HARDWARE_DEBUG

// Fast battery read without filtering - single ADC sample for quick status reports
// This avoids the 100ms+ delay of read_battery_voltage() which causes brownouts
float read_battery_raw(void) {
    adc_oneshot_unit_handle_t adc_handle;
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    adc_oneshot_new_unit(&init_config, &adc_handle);

    adc_oneshot_chan_cfg_t config = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    adc_oneshot_config_channel(adc_handle, BATTERY_ADC_CHANNEL, &config);

    int raw = 0;
    adc_oneshot_read(adc_handle, BATTERY_ADC_CHANNEL, &raw);
    adc_oneshot_del_unit(adc_handle);

    float adc_voltage = (raw / 4095.0f) * 3.3f;
    float battery_voltage = adc_voltage * VOLTAGE_DIVIDER_RATIO;

    return battery_voltage;
}

/**
 * @brief Detect if battery is charging based on voltage
 *
 * When plugged into USB, voltage typically rises to ~4.0V or higher.
 * LiPo fully charged: 4.2V, discharged: ~3.3-3.7V
 *
 * @param voltage Battery voltage in volts
 * @return true if charging (voltage >= 4.18V), false otherwise
 */
bool is_battery_charging(float voltage) {
    // A fully charged LiPo naturally settles at ~4.1V when not plugged in.
    // Only voltages very close to max (4.2V) reliably indicate active charging.
    // Using 4.18V as threshold to avoid false positives from full battery.
    // Note: This is imperfect - proper detection requires hardware (charger status pin).
    const float CHARGING_THRESHOLD = 4.18f;
    return voltage >= CHARGING_THRESHOLD;
}

/**
 * @brief Report device status to server via HTTP POST
 *
 * Sends device telemetry to server including:
 * - Battery voltage
 * - WiFi signal strength (RSSI)
 * - Free heap memory
 * - Boot count
 * - Brownout count
 * - Status message
 *
 * @param status_msg Status string (e.g., "connected", "battery_low", "ota_updating")
 * @param brownout_count Number of brownout resets since power-on
 */
// Forward declaration for fast battery read (defined below)
float read_battery_raw(void);

void report_device_status(const char* status_msg, int32_t brownout_count) {
    wifi_ap_record_t ap_info;
    esp_wifi_sta_get_ap_info(&ap_info);

    // Use FAST battery read (single ADC sample) to avoid delaying WiFi shutdown
    // The slow read_battery_voltage() with 20 samples causes brownouts when called
    // before display refresh because it delays WiFi shutdown by 100ms+
    float battery_voltage = read_battery_raw();

    // Get firmware version from OTA module
    extern const char* ota_get_version(void);
    const char* firmware_version = ota_get_version();

    // Detect charging status
    bool is_charging = is_battery_charging(battery_voltage);

    char post_data[STATUS_POST_BUFFER_SIZE];
    int written = snprintf(post_data, sizeof(post_data),
        "{\"deviceId\":\"%s\",\"status\":{"
        "\"batteryVoltage\":%.2f,"
        "\"isCharging\":%s,"
        "\"signalStrength\":%d,"
        "\"freeHeap\":%lu,"
        "\"bootCount\":%lu,"
        "\"brownoutCount\":%ld,"
        "\"firmwareVersion\":\"%s\","
        "\"status\":\"%s\"}}",
        device_id,
        battery_voltage,
        is_charging ? "true" : "false",
        ap_info.rssi,
        (unsigned long)esp_get_free_heap_size(),
        (unsigned long)boot_count,
        (long)brownout_count,
        firmware_version,
        status_msg
    );

    // Check for truncation
    if (written >= (int)sizeof(post_data)) {
        printf("ERROR: Status message truncated (%d >= %zu), skipping report\n",
               written, sizeof(post_data));
        return;
    }

    esp_http_client_config_t config = {
        .url = SERVER_STATUS_URL,
        .method = HTTP_METHOD_POST,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, post_data, strlen(post_data));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        printf("Status reported: %s (RSSI: %d dBm, Heap: %lu)\n",
               status_msg, ap_info.rssi, (unsigned long)esp_get_free_heap_size());
    } else {
        printf("Failed to report status: %s\n", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
}

// Forward declaration for wifi_init (defined later)
void wifi_init(void);

#if BATTERY_TEST_MODE
// Battery test mode - measures voltage at different states and reports to server
void send_battery_test_result(const char* test_name, float voltage, int duration_ms) {
    char post_data[TEST_POST_BUFFER_SIZE];
    int written = snprintf(post_data, sizeof(post_data),
        "{\"deviceId\":\"%s\",\"test\":\"%s\",\"voltage\":%.3f,\"duration_ms\":%d,\"heap\":%lu}",
        device_id, test_name, voltage, duration_ms, (unsigned long)esp_get_free_heap_size());

    if (written >= (int)sizeof(post_data)) {
        printf("ERROR: Test result truncated, skipping\n");
        return;
    }

    esp_http_client_config_t config = {
        .url = SERVER_STATUS_URL,
        .method = HTTP_METHOD_POST,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, post_data, strlen(post_data));
    esp_http_client_perform(client);
    esp_http_client_cleanup(client);

    printf("TEST [%s]: %.3fV (%dms)\n", test_name, voltage, duration_ms);
}

void run_battery_test(void) {
    printf("\n");
    printf("╔════════════════════════════════════════════╗\n");
    printf("║     BATTERY TEST MODE - Cycle %lu/%d       ║\n", boot_count + 1, BATTERY_TEST_CYCLES);
    printf("╚════════════════════════════════════════════╝\n\n");

    int64_t start_time, elapsed;

    // Test 1: Voltage at boot (before WiFi)
    start_time = esp_timer_get_time();
    float v_boot = read_battery_voltage();
    elapsed = (esp_timer_get_time() - start_time) / 1000;
    printf("1. BOOT voltage: %.3fV\n", v_boot);

    // Test 2: Voltage during WiFi connection
    printf("2. Connecting to WiFi...\n");
    start_time = esp_timer_get_time();
    wifi_init();

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT,
                                           pdFALSE, pdTRUE,
                                           pdMS_TO_TICKS(WIFI_CONNECT_TIMEOUT_MS));
    elapsed = (esp_timer_get_time() - start_time) / 1000;

    if (!(bits & WIFI_CONNECTED_BIT)) {
        printf("WiFi FAILED after %lldms\n", elapsed);
        esp_deep_sleep(10 * 1000000);  // Sleep 10 seconds and retry
    }

    float v_wifi = read_battery_voltage();
    printf("   WiFi connected in %lldms, voltage: %.3fV\n", elapsed, v_wifi);

    // Test 3: Voltage while idle (WiFi connected, no activity)
    printf("3. Idle test (5 seconds)...\n");
    vTaskDelay(pdMS_TO_TICKS(5000));
    float v_idle = read_battery_voltage();
    printf("   Idle voltage: %.3fV\n", v_idle);

    // Send results to server
    printf("\n4. Sending results to server...\n");
    send_battery_test_result("boot", v_boot, 0);
    send_battery_test_result("wifi_connect", v_wifi, (int)elapsed);
    send_battery_test_result("idle_5s", v_idle, 5000);

    // Test 4: Optional display refresh test
    printf("5. Display refresh test...\n");
    start_time = esp_timer_get_time();
    float v_before_refresh = read_battery_voltage();

    initEPD();
    // Just clear to white - fast test
    epdDisplayColor(WHITE);

    elapsed = (esp_timer_get_time() - start_time) / 1000;
    float v_after_refresh = read_battery_voltage();

    printf("   Before refresh: %.3fV, After: %.3fV (took %lldms)\n",
           v_before_refresh, v_after_refresh, elapsed);
    send_battery_test_result("display_refresh", v_after_refresh, (int)elapsed);

    // Summary
    printf("\n");
    printf("╔════════════════════════════════════════════╗\n");
    printf("║           TEST RESULTS SUMMARY             ║\n");
    printf("╠════════════════════════════════════════════╣\n");
    printf("║ Boot voltage:      %.3fV                  ║\n", v_boot);
    printf("║ WiFi connected:    %.3fV                  ║\n", v_wifi);
    printf("║ Idle (5s):         %.3fV                  ║\n", v_idle);
    printf("║ After display:     %.3fV                  ║\n", v_after_refresh);
    printf("║ Voltage range:     %.3fV                  ║\n",
           fmaxf(fmaxf(v_boot, v_wifi), fmaxf(v_idle, v_after_refresh)) -
           fminf(fminf(v_boot, v_wifi), fminf(v_idle, v_after_refresh)));
    printf("╚════════════════════════════════════════════╝\n");

    // Report final status
    report_device_status("battery_test_complete", 0);

    // Prepare for next cycle or normal operation
    if (boot_count + 1 < BATTERY_TEST_CYCLES) {
        printf("\nSleeping 30 seconds before next test cycle...\n");
        esp_deep_sleep(30 * 1000000);  // 30 second sleep between tests
    } else {
        printf("\nBattery test complete! Returning to normal operation.\n");
        printf("To run more tests, power cycle the device.\n");
        esp_deep_sleep(DEFAULT_SLEEP_DURATION);
    }
}
#endif // BATTERY_TEST_MODE

typedef struct {
    char image_id[64];
    uint64_t sleep_duration;
    bool has_new_image;
} metadata_t;

/**
 * @brief Fetch image metadata from server
 *
 * Downloads current.json from server, which contains:
 * - imageId: Unique identifier for current image
 * - sleepDuration: Time to sleep before next wake (microseconds)
 *
 * Validates sleep duration is within safe bounds (10 sec - 24 hours).
 * Compares imageId with last stored ID to detect new images.
 *
 * @param metadata Pointer to metadata struct to fill
 * @return true if metadata fetched successfully, false on error
 */
bool fetch_metadata(metadata_t* metadata) {
    printf("Fetching metadata from %s...\n", SERVER_METADATA_URL);

    esp_http_client_config_t config = {
        .url = SERVER_METADATA_URL,
        .timeout_ms = HTTP_METADATA_TIMEOUT_MS,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_open(client, 0);

    if (err != ESP_OK) {
        printf("ERROR: Failed to open metadata connection: %s\n", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return false;
    }

    int content_length = esp_http_client_fetch_headers(client);
    printf("Metadata content length: %d\n", content_length);

    if (content_length <= 0 || content_length > METADATA_MAX_SIZE_BYTES) {
        printf("ERROR: Invalid content length\n");
        esp_http_client_cleanup(client);
        return false;
    }

    char* buffer = malloc(content_length + 1);
    if (!buffer) {
        printf("ERROR: Failed to allocate %d bytes for metadata\n", content_length);
        esp_http_client_cleanup(client);
        return false;
    }

    int read_len = esp_http_client_read(client, buffer, content_length);
    buffer[read_len] = '\0';
    esp_http_client_cleanup(client);

    printf("Read %d bytes of metadata\n", read_len);
    printf("First 200 chars: %.200s\n", buffer);

    // Parse JSON
    printf("Parsing JSON...\n");
    cJSON* json = cJSON_Parse(buffer);

    if (!json) {
        const char* err_ptr = cJSON_GetErrorPtr();
        printf("ERROR: Failed to parse JSON. Error: %s\n", err_ptr ? err_ptr : "unknown");
        free(buffer);
        return false;
    }

    printf("JSON parsed successfully\n");

    // Set defaults
    strcpy(metadata->image_id, "default");
    metadata->sleep_duration = DEFAULT_SLEEP_DURATION;

    // Extract imageId
    cJSON* imageId = cJSON_GetObjectItem(json, "imageId");
    if (imageId && cJSON_IsString(imageId)) {
        strncpy(metadata->image_id, imageId->valuestring, sizeof(metadata->image_id) - 1);
        printf("Found imageId: %s\n", metadata->image_id);
    }

    // Extract sleepDuration (in microseconds)
    cJSON* sleepDuration = cJSON_GetObjectItem(json, "sleepDuration");
    if (sleepDuration && cJSON_IsNumber(sleepDuration)) {
        uint64_t server_sleep = (uint64_t)sleepDuration->valuedouble;

        // Validate sleep duration to prevent device brick scenarios
        if (server_sleep < MIN_SLEEP_DURATION) {
            printf("⚠️  Sleep duration %llu us is too short, using minimum %llu us\n",
                   server_sleep, MIN_SLEEP_DURATION);
            metadata->sleep_duration = MIN_SLEEP_DURATION;
        } else if (server_sleep > MAX_SLEEP_DURATION) {
            printf("⚠️  Sleep duration %llu us is too long, using maximum %llu us\n",
                   server_sleep, MAX_SLEEP_DURATION);
            metadata->sleep_duration = MAX_SLEEP_DURATION;
        } else {
            metadata->sleep_duration = server_sleep;
            printf("Found sleepDuration: %llu us\n", metadata->sleep_duration);
        }
    }

    // Load last image ID from NVS and check if we have a new image
    char last_image_id[64] = {0};
    bool has_previous = load_last_image_id(last_image_id, sizeof(last_image_id));

    if (!has_previous) {
        printf("No previous image found - will download\n");
        metadata->has_new_image = true;
    } else {
        metadata->has_new_image = (strcmp(metadata->image_id, last_image_id) != 0);
        printf("Comparing: server='%s' vs stored='%s' -> %s\n",
               metadata->image_id, last_image_id,
               metadata->has_new_image ? "NEW" : "SAME");
    }

    cJSON_Delete(json);
    free(buffer);

    printf("Metadata OK: imageId=%s, sleep=%llu us, new=%d\n",
           metadata->image_id, metadata->sleep_duration, metadata->has_new_image);

    return true;
}

uint8_t rgb_to_eink(uint8_t r, uint8_t g, uint8_t b) {
    // Return 4-bit color value (will be packed 2 per byte)
    if (r < 32 && g < 32 && b < 32) return 0x0;         // BLACK
    if (r > 224 && g > 224 && b > 224) return 0x1;      // WHITE
    if (r > 200 && g > 200 && b < 100) return 0x2;      // YELLOW
    if (r > 200 && g < 100 && b < 100) return 0x3;      // RED
    if (r < 100 && g < 100 && b > 200) return 0x5;      // BLUE
    if (r < 100 && g > 200 && b < 100) return 0x6;      // GREEN

    int brightness = (r + g + b) / 3;
    return (brightness > 127) ? 0x1 : 0x0;              // WHITE or BLACK
}

/**
 * @brief WiFi event handler
 *
 * Handles WiFi connection events:
 * - STA_START: Initiate connection
 * - STA_DISCONNECTED: Retry connection
 * - GOT_IP: Set WIFI_CONNECTED_BIT flag
 */
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        printf("WiFi connected!\n");
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

void wifi_init(void)
{
    s_wifi_event_group = xEventGroupCreate();
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL);

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
        },
    };

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    esp_wifi_start();

    // Reduce WiFi transmission power to conserve battery and reduce current spikes
    // Default is WIFI_POWER_19_5dBm (78mA), we reduce to WIFI_POWER_15dBm (~60mA)
    // This is enough for local network communication and significantly reduces brownout risk
    esp_wifi_set_max_tx_power(60);  // 60 = 15dBm (quarter steps: 60/4 = 15)
    printf("WiFi TX power reduced to 15dBm for battery operation\n");
}

/**
 * @brief Download image from server and display on e-ink
 *
 * Downloads RGB24 image data from server (/api/image.bin), converts
 * to 6-color e-ink format, and displays on Waveshare 13.3" Spectra 6.
 *
 * Process:
 * 1. Allocate 960KB buffer for 1200x1600 4-bit image
 * 2. Download RGB24 data in 32KB chunks
 * 3. Convert RGB to 6-color palette (Black, White, Red, Yellow, Blue, Green)
 * 4. Disable WiFi before display refresh (saves ~100-200mA)
 * 5. Send data to two driver ICs (left/right halves)
 * 6. Trigger display refresh
 *
 * @return true if download and display successful, false on error
 */
bool download_and_display_image(void)
{
    printf("Allocating %d bytes for e-ink buffer...\n", EINK_SIZE);
    uint8_t *eink_buffer = malloc(EINK_SIZE);
    if (!eink_buffer) {
        printf("ERROR: Failed to allocate e-ink buffer!\n");
        return false;
    }
    memset(eink_buffer, 0x11, EINK_SIZE);  // 0x11 = white (both nibbles)
    
    printf("Connecting to %s...\n", SERVER_IMAGE_URL);
    esp_http_client_config_t config = {
        .url = SERVER_IMAGE_URL,
        .timeout_ms = HTTP_IMAGE_TIMEOUT_MS,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_open(client, 0);
    
    if (err != ESP_OK) {
        printf("ERROR: HTTP open failed: %d\n", err);
        free(eink_buffer);
        esp_http_client_cleanup(client);
        return false;
    }
    
    int content_length = esp_http_client_fetch_headers(client);
    printf("Content-Length: %d bytes (%d pixels)\n", content_length, content_length / 3);
    
    uint8_t *chunk = malloc(CHUNK_SIZE + 3); // +3 for leftover bytes from previous chunk
    if (!chunk) {
        printf("ERROR: Failed to allocate chunk buffer!\n");
        free(eink_buffer);
        esp_http_client_cleanup(client);
        return false;
    }
    
    int total_read = 0;
    int pixels_written = 0;
    int max_pixels = DISPLAY_WIDTH * DISPLAY_HEIGHT;
    uint8_t leftover[3] = {0};
    int leftover_count = 0;
    
    printf("Downloading and converting...\n");
    
    while (total_read < content_length) {
        // Copy leftover bytes from previous chunk to beginning of buffer
        memcpy(chunk, leftover, leftover_count);
        
        // Read new data after leftover bytes
        int read_len = esp_http_client_read(client, (char*)(chunk + leftover_count), CHUNK_SIZE);
        if (read_len <= 0) break;
        
        int available_bytes = leftover_count + read_len;
        int complete_pixels = available_bytes / 3;
        int new_leftover = available_bytes % 3;
        
        // Process complete RGB triplets (2 pixels per byte: high nibble, low nibble)
        for (int i = 0; i < complete_pixels && pixels_written < max_pixels; i++) {
            uint8_t r = chunk[i * 3];
            uint8_t g = chunk[i * 3 + 1];
            uint8_t b = chunk[i * 3 + 2];
            uint8_t color = rgb_to_eink(r, g, b);

            int eink_idx = pixels_written / 2;
            if (pixels_written % 2 == 0) {
                eink_buffer[eink_idx] = (color << 4);  // High nibble
            } else {
                eink_buffer[eink_idx] |= color;         // Low nibble
            }
            pixels_written++;
        }
        
        // Save leftover bytes for next chunk
        if (new_leftover > 0) {
            memcpy(leftover, chunk + (complete_pixels * 3), new_leftover);
        }
        leftover_count = new_leftover;
        
        total_read += read_len;
        
        if (total_read % 500000 == 0) {
            printf("  %d KB downloaded, %d pixels written\n", total_read / 1024, pixels_written);
        }
    }
    
    free(chunk);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    
    printf("Complete! Downloaded %d bytes, wrote %d/%d pixels\n",
           total_read, pixels_written, max_pixels);

    if (pixels_written > 0) {
        printf("Displaying image...\n");

        // Report display update status BEFORE shutting down WiFi
        // This allows server to track display updates and correlate with battery usage
        // Note: brownout_count passed as 0 since it's a local variable in app_main
        // The server will use this status to detect when display updates occur
        report_device_status("display_updating", 0);

        // Set dirty flag for pseudo-brownout detection
        // If device resets during display refresh, this flag tells us it was a brownout
        set_in_operation_flag(true);

        // POWER OPTIMIZATION: Disable WiFi before display refresh to save ~100-200mA
        printf("Disabling WiFi to conserve power during display refresh...\n");
        esp_wifi_disconnect();
        esp_wifi_stop();
        vTaskDelay(pdMS_TO_TICKS(WIFI_SHUTDOWN_DELAY_MS));

        initEPD();

        // Wait after display initialization before data transfer
        // initEPD sends many SPI commands - let things settle
        printf("Waiting %d ms after display init...\n", POST_INIT_DELAY_MS);
        vTaskDelay(pdMS_TO_TICKS(POST_INIT_DELAY_MS));

        // Display has 2 driver ICs - split data horizontally
        int width_per_ic = DISPLAY_WIDTH / 2;  // 600 pixels per IC
        int bytes_per_row = DISPLAY_WIDTH / 2;  // 1200 pixels / 2 = 600 bytes per row
        int bytes_per_ic_row = width_per_ic / 2;  // 600 pixels / 2 = 300 bytes per IC per row

        printf("Sending data to display...\n");

        // Send to first IC (left half) - with 1ms delay between rows
        setPinCsAll(GPIO_HIGH);
        setPinCs(0, 0);
        writeEpdCommand(DTM);
        for (int row = 0; row < DISPLAY_HEIGHT; row++) {
            writeEpdData(eink_buffer + row * bytes_per_row, bytes_per_ic_row);
            vTaskDelay(pdMS_TO_TICKS(DISPLAY_ROW_DELAY_MS));

            if (row % 200 == 0) {
                printf("  Left IC: row %d/%d\n", row, DISPLAY_HEIGHT);
            }
        }
        setPinCsAll(GPIO_HIGH);
        printf("Left IC complete\n");

        // Small delay between ICs
        vTaskDelay(pdMS_TO_TICKS(DISPLAY_IC_DELAY_MS));

        // Send to second IC (right half) - with 1ms delay between rows
        setPinCs(1, 0);
        writeEpdCommand(DTM);
        for (int row = 0; row < DISPLAY_HEIGHT; row++) {
            writeEpdData(eink_buffer + row * bytes_per_row + bytes_per_ic_row, bytes_per_ic_row);
            vTaskDelay(pdMS_TO_TICKS(DISPLAY_ROW_DELAY_MS));

            if (row % 200 == 0) {
                printf("  Right IC: row %d/%d\n", row, DISPLAY_HEIGHT);
            }
        }
        setPinCsAll(GPIO_HIGH);
        printf("Right IC complete\n");

        // CRITICAL: Let battery voltage stabilize before high-current display refresh
        // epdDisplay() activates the charge pump (PON command) which draws >1A peak current
        // This delay allows voltage to recover after data transmission
        printf("Waiting %d ms before display refresh (battery stabilization)...\n", PRE_REFRESH_DELAY_MS);
        vTaskDelay(pdMS_TO_TICKS(PRE_REFRESH_DELAY_MS));

        printf("Triggering display refresh...\n");
        epdDisplay();

        printf("=== Image displayed! ===\n");

        // Clear dirty flag - display completed successfully (no brownout)
        set_in_operation_flag(false);

        free(eink_buffer);
        return true;
    }
    
    free(eink_buffer);
    return false;
}

void app_main(void)
{
    esp_task_wdt_deinit();

    printf("\n=== GLANCE: WiFi E-ink Art Gallery ===\n");

    // CRITICAL: Initialize GPIO and SPI first (needed for battery monitoring)
    initialGpio();
    initialSpi();

    // CRITICAL: Initialize NVS FIRST to track brownout count
    // Must happen before battery check so we can detect brownout loops
    esp_err_t nvs_init_err = nvs_flash_init();
    if (nvs_init_err != ESP_OK) {
        printf("ERROR: NVS flash init failed: %s\n", esp_err_to_name(nvs_init_err));
    }

    // Check boot reason and track brownouts BEFORE battery check
    // This allows brownout recovery mode to prevent repeated attempts
    esp_reset_reason_t reset_reason = esp_reset_reason();

    // Load brownout tracking from NVS
    static const char* BROWNOUT_COUNT_KEY = "brownout_cnt";
    static const char* BROWNOUT_TIME_KEY = "brownout_time";
    int32_t brownout_count = 0;
    int64_t last_brownout_time = 0;
    bool in_brownout_recovery = false;

    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle);
    if (err == ESP_OK) {
        nvs_get_i32(nvs_handle, BROWNOUT_COUNT_KEY, &brownout_count);
        nvs_get_i64(nvs_handle, BROWNOUT_TIME_KEY, &last_brownout_time);
    }

    if (reset_reason == ESP_RST_BROWNOUT) {
        printf("⚠️  BROWNOUT RESET DETECTED! ⚠️\n");
        printf("Brownout count: %ld\n", (long)(brownout_count + 1));

        brownout_count++;
        last_brownout_time = esp_timer_get_time() / 1000000;  // seconds since boot

        // Save brownout tracking
        if (err == ESP_OK) {
            nvs_set_i32(nvs_handle, BROWNOUT_COUNT_KEY, brownout_count);
            nvs_set_i64(nvs_handle, BROWNOUT_TIME_KEY, last_brownout_time);
            nvs_commit(nvs_handle);
        }

        // Enter recovery mode if multiple brownouts
        if (brownout_count >= BROWNOUT_THRESHOLD_COUNT) {
            in_brownout_recovery = true;
            printf("🚨 BROWNOUT RECOVERY MODE - Skipping heavy operations\n");
            printf("   Battery likely too weak for display refresh\n");
            printf("   Will skip display and OTA, sleep for extended period\n");
        }
    } else if (reset_reason == ESP_RST_POWERON) {
        printf("=== POWER ON RESET ===\n");
        boot_count = 0;

        // Check for pseudo-brownout: if we were in a high-power operation
        // when the power reset occurred, treat it as a brownout
        if (was_in_operation()) {
            printf("⚡ PSEUDO-BROWNOUT DETECTED (reset during display operation)\n");
            brownout_count++;
            printf("Brownout count: %ld\n", (long)brownout_count);

            // Save updated count and clear the in_operation flag
            if (err == ESP_OK) {
                nvs_set_i32(nvs_handle, BROWNOUT_COUNT_KEY, brownout_count);
                nvs_erase_key(nvs_handle, NVS_KEY_IN_OPERATION);
                nvs_commit(nvs_handle);
            }

            // Enter recovery mode if multiple brownouts
            if (brownout_count >= BROWNOUT_THRESHOLD_COUNT) {
                in_brownout_recovery = true;
                printf("🚨 BROWNOUT RECOVERY MODE - Skipping heavy operations\n");
                printf("   Battery likely too weak for display refresh\n");
                printf("   Will skip display and OTA, sleep for extended period\n");
            }
        } else {
            // Genuine power cycle - clear brownout counter AND last_image_id
            // This ensures display always refreshes after user power cycles the device
            // Deep sleep wakes keep last_image_id (only refresh when image changes)
            if (err == ESP_OK) {
                nvs_erase_key(nvs_handle, BROWNOUT_COUNT_KEY);
                nvs_erase_key(nvs_handle, BROWNOUT_TIME_KEY);
                nvs_erase_key(nvs_handle, NVS_KEY_IMAGE_ID);
                nvs_commit(nvs_handle);
                printf("✅ Power cycle: cleared brownout counter and last_image_id\n");
                printf("   Display will refresh on this boot\n");
            } else {
                printf("⚠️  Failed to clear NVS: %s\n", esp_err_to_name(err));
            }
            brownout_count = 0;
        }
    } else {
        boot_count++;
        printf("=== BOOT #%lu (from deep sleep) ===\n", boot_count);
        // Note: Brownout counter is cleared at END of successful wake cycle, not at start
    }

    if (err == ESP_OK) {
        nvs_close(nvs_handle);
    }

    // Get device ID
    get_device_id();

    // CRITICAL: Check battery voltage BEFORE any power-hungry operations
    printf("Checking battery voltage...\n");
    float battery_voltage = read_battery_voltage();

    // Handle invalid sensor readings (treat as "no battery monitoring")
    if (battery_voltage == BATTERY_SENSOR_INVALID) {
        printf("Battery sensor not connected - continuing without protection\n");
        battery_voltage = 4.0f;  // Assume good battery
    } else {
        printf("Battery: %.2fV\n", battery_voltage);
    }

    bool is_charging = is_battery_charging(battery_voltage);

#if BATTERY_TEST_MODE
    // Run battery test instead of normal operation
    // This handles its own WiFi init to measure voltage during connection
    run_battery_test();
    // run_battery_test() never returns - it loops through test cycles
#endif

    // If in brownout recovery mode, skip even battery checks and just sleep
    if (in_brownout_recovery) {
        printf("⚠️  BROWNOUT RECOVERY MODE ACTIVE\n");
        printf("Skipping ALL operations, sleeping for extended period\n");
        const uint64_t BROWNOUT_RECOVERY_SLEEP = 6ULL * 60 * 60 * 1000000;  // 6 hours
        esp_deep_sleep(BROWNOUT_RECOVERY_SLEEP);
        // Never returns
    }

    // CRITICAL: If battery is dangerously low, skip initialization
    // Only skip if battery is at LiPo cutoff voltage
    const float CRITICAL_BATTERY = 3.3f;  // LiPo cutoff - below this is emergency only

    if (!is_charging && battery_voltage < CRITICAL_BATTERY) {
        printf("🚨 CRITICAL BATTERY: %.2fV < %.2fV\n", battery_voltage, CRITICAL_BATTERY);
        printf("Skipping ALL initialization to prevent brownout\n");
        printf("Sleeping for 12 hours - battery may recover or charge device\n");
        const uint64_t CRITICAL_SLEEP = 12ULL * 60 * 60 * 1000000;  // 12 hours
        esp_deep_sleep(CRITICAL_SLEEP);
        // Never returns
    }

    // Battery is sufficient for basic init - proceed with hardware setup
    // NOTE: We do NOT call initEPD() here - it draws current and will be called
    // later right before display operations when actually needed. This reduces
    // current draw during the critical WiFi connection phase.
    printf("Battery sufficient (%.2fV), initializing hardware...\n", battery_voltage);
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    vTaskDelay(pdMS_TO_TICKS(500));
    setPinCsAll(GPIO_HIGH);

    // Don't call initEPD() or clear display here - preserve existing image!
    // initEPD() will be called right before display operations in download_and_display_image()
    printf("Hardware initialized, display preserved\n");

    // WIFI BATTERY CHECK - WiFi requires slightly more power than basic init
    // WiFi connection draws ~460mA which can cause brownouts on weak battery
    // Account for voltage sag: weak battery may drop 0.4-0.6V under WiFi load
    const float WIFI_MIN_BATTERY = 3.7f;  // Raised to account for voltage sag (was 3.4V)

    if (!is_charging && battery_voltage < WIFI_MIN_BATTERY) {
        printf("🚨 CRITICAL: Battery too low for WiFi (%.2fV < %.2fV)\n",
               battery_voltage, WIFI_MIN_BATTERY);
        printf("Skipping ALL operations to prevent brownout boot loop\n");
        printf("Device will sleep for 6 hours to allow battery recovery\n");
        printf("Plug in USB to charge or perform emergency OTA update\n");

        // Sleep for extended period (6 hours) - battery might recover or user will charge
        const uint64_t CRITICAL_BATTERY_SLEEP = 6ULL * 60 * 60 * 1000000;  // 6 hours
        esp_deep_sleep(CRITICAL_BATTERY_SLEEP);
        // Never returns
    }

    // Battery sufficient for WiFi - proceed normally
    printf("Battery sufficient for WiFi (%.2fV), proceeding...\n", battery_voltage);

    // Initialize WiFi (NVS already initialized above)
    wifi_init();

    printf("Waiting for WiFi...\n");
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT,
                                           pdFALSE, pdTRUE,
                                           pdMS_TO_TICKS(WIFI_CONNECT_TIMEOUT_MS));

    if (!(bits & WIFI_CONNECTED_BIT)) {
        printf("WiFi FAILED\n");
        report_device_status("wifi_failed", brownout_count);

        // Detect if charging (WiFi failed, but we can still read battery voltage)
        bool wifi_fail_is_charging = is_battery_charging(battery_voltage);

        // Only show RED error screen if battery is sufficient (prevents brownout boot loop)
        // Display refresh draws >1A peak current - dangerous on weak battery
        // Exception: Always show when charging (external power is safe)
        if (wifi_fail_is_charging || battery_voltage >= DISPLAY_MIN_BATTERY) {
            printf("Showing RED error screen (charging=%d, voltage=%.2fV)\n",
                   wifi_fail_is_charging, battery_voltage);
            initEPD();
            epdDisplayColor(RED);
        } else {
            printf("⚠️  Battery too low for error display (%.2fV < %.2fV) - skipping RED screen\n",
                   battery_voltage, DISPLAY_MIN_BATTERY);
            printf("This prevents brownout boot loop on WiFi failures\n");
        }

        esp_deep_sleep(DEFAULT_SLEEP_DURATION);
    }

    printf("WiFi connected!\n");

    // Re-read battery voltage after WiFi - voltage stabilizes after connection
    // and gives more accurate reading for charging detection
    battery_voltage = read_battery_raw();
    is_charging = is_battery_charging(battery_voltage);
    printf("Post-WiFi battery: %.2fV (charging=%s)\n", battery_voltage, is_charging ? "yes" : "no");

    // CRITICAL: Wait after WiFi before doing anything else
    // WiFi draws significant current - let battery voltage recover before next operation
    printf("Waiting %d ms for battery to recover from WiFi...\n", BATTERY_RECOVERY_DELAY_MS);
    vTaskDelay(pdMS_TO_TICKS(BATTERY_RECOVERY_DELAY_MS));

    // Mark current firmware as valid on first boot after successful OTA (quick, no network)
    ota_mark_valid();

    // PRIORITY 1: Check for OTA FIRST - before any display operations
    // This ensures firmware updates can be applied even if display refresh causes brownout
    // Without this, a brownout-causing bug would prevent the fix from ever being deployed
    bool should_check_ota_early = is_charging || (battery_voltage >= OTA_MIN_BATTERY_VOLTAGE);

    if (should_check_ota_early) {
        printf("🔄 Checking for OTA update (before display operations)...\n");

        ota_version_info_t ota_info = {0};
        if (ota_check_version(&ota_info)) {
            printf("📥 OTA update available! Downloading FIRST (before display)...\n");
            report_device_status("ota_updating", brownout_count);

            ota_result_t result = ota_perform_update(&ota_info);

            if (result == OTA_RESULT_SUCCESS) {
                printf("✅ OTA complete, rebooting into new firmware...\n");
                esp_restart();  // Reboot into new firmware - display will work there
            } else {
                printf("❌ OTA failed with code %d, continuing with display...\n", result);
                report_device_status("ota_failed", brownout_count);
            }
        } else {
            printf("✅ Firmware is up to date, proceeding with display...\n");
        }
    }

    // BROWNOUT RECOVERY MODE - Skip heavy operations to prevent boot loop
    // EXCEPTION: Allow OTA when charging (provides escape hatch - plug in USB to update firmware)
    if (in_brownout_recovery) {
        printf("⚠️  In brownout recovery mode (battery too weak)\n");
        report_device_status("brownout_recovery", brownout_count);

        // If charging, allow OTA check (safe with external power, provides escape path)
        if (is_charging) {
            printf("🔌 Charging detected - checking for OTA update (escape path)\n");

            // Skip display refresh (still too risky), but check for OTA
            ota_version_info_t ota_info = {0};
            if (ota_check_version(&ota_info)) {
                printf("📥 OTA update available, downloading...\n");
                report_device_status("ota_updating", brownout_count);

                ota_result_t result = ota_perform_update(&ota_info);

                if (result == OTA_RESULT_SUCCESS) {
                    printf("✅ OTA complete, rebooting...\n");
                    esp_restart();  // Reboot into new firmware with fixes
                } else {
                    printf("❌ OTA failed with code %d\n", result);
                    report_device_status("ota_failed", brownout_count);
                }
            }

            // Sleep shorter when charging for faster OTA checks
            printf("Sleeping for %d seconds (charging mode)...\n", (int)(CHARGING_SLEEP_DURATION / 1000000));
            esp_deep_sleep(CHARGING_SLEEP_DURATION);
        } else {
            // On battery - skip everything and sleep for extended period
            printf("⏭️  Battery recovery - skipping display and OTA\n");
            uint64_t recovery_sleep = BROWNOUT_RECOVERY_SLEEP_S * 1000000ULL;
            printf("Sleeping for %d seconds to allow battery recovery...\n", BROWNOUT_RECOVERY_SLEEP_S);
            esp_deep_sleep(recovery_sleep);
        }
        return;  // Never reached, but makes intent clear
    }

    // Report status based on battery level
    if (battery_voltage < BATTERY_LOW) {
        report_device_status("battery_low", brownout_count);
    } else {
        report_device_status("connected", brownout_count);
    }

    // Fetch metadata from server
    metadata_t metadata = {0};
    uint64_t sleep_duration = DEFAULT_SLEEP_DURATION;

    if (fetch_metadata(&metadata)) {
        sleep_duration = metadata.sleep_duration;

        // CHARGING MODE: Wake frequently for fast OTA and battery monitoring
        // When plugged in, wake every 30 seconds to check for OTA and report charge level
        // This gives near-instant OTA updates and live battery charge monitoring
        if (is_charging) {
            sleep_duration = CHARGING_SLEEP_DURATION;
            printf("🔌 Charging mode: fast wake (%llu sec) for OTA and monitoring\n",
                   CHARGING_SLEEP_DURATION / 1000000);
        }
        // If battery is low, double the sleep duration to conserve power
        else if (battery_voltage < BATTERY_LOW) {
            sleep_duration *= 2;
            printf("⚠️  Low battery: doubling sleep duration to %llu seconds\n",
                   sleep_duration / 1000000);
        }

        // Only download if we have a new image
        if (metadata.has_new_image) {
            printf("New image detected (ID: %s), downloading...\n", metadata.image_id);

            // Battery safety check: Display refresh draws >1A peak current
            // Skip refresh if battery is too low (unless charging on external power)
            if (!is_charging && battery_voltage < DISPLAY_MIN_BATTERY) {
                printf("⚠️  Battery too low for display refresh (%.2fV < %.2fV threshold)\n",
                       battery_voltage, DISPLAY_MIN_BATTERY);
                printf("Skipping display update to prevent brownout - will retry when battery recovers\n");
                report_device_status("battery_too_low", brownout_count);
            } else {
                // CRITICAL: Save image ID BEFORE download/display to prevent infinite loops
                // If device brownouts during display refresh, next boot will see "same image"
                // and skip the 5.76MB download, breaking the brownout cycle
                save_last_image_id(metadata.image_id);

                if (download_and_display_image()) {
                    printf("=== SUCCESS ===\n");
                    // Image ID already saved above
                } else {
                    printf("Download failed\n");
                    report_device_status("download_failed", brownout_count);
                    // Only show error pattern if battery is sufficient
                    if (!is_charging && battery_voltage < DISPLAY_MIN_BATTERY) {
                        printf("Battery too low for error display - skipping\n");
                    } else {
                        printf("Showing color bars\n");
                        initEPD();
                        epdDisplayColorBar();
                    }
                }
            }
        } else {
            printf("Image unchanged, keeping current display\n");
            report_device_status("no_update_needed", brownout_count);
        }
    } else {
        printf("Failed to fetch metadata\n");
        report_device_status("metadata_failed", brownout_count);
    }

    // Display refresh complete (or skipped)
    // OTA was already checked at the beginning of the wake cycle

    // Successful wake cycle completed - clear brownout counter
    // (Only gets here if we didn't brownout during display/OTA operations)
    if (brownout_count > 0) {
        printf("✅ Wake cycle successful - clearing brownout counter (%ld)\n", (long)brownout_count);
        nvs_handle_t nvs_handle_clear;
        if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle_clear) == ESP_OK) {
            nvs_erase_key(nvs_handle_clear, "brownout_cnt");
            nvs_erase_key(nvs_handle_clear, "brownout_time");
            nvs_commit(nvs_handle_clear);
            nvs_close(nvs_handle_clear);
        }
    }

    printf("Entering deep sleep for %llu seconds...\n", sleep_duration / 1000000);
    esp_deep_sleep(sleep_duration);
}
