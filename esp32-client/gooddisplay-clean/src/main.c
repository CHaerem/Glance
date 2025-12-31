#include <stdio.h>
#include <string.h>
#include <stdlib.h>
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

// WiFi credentials - set via environment variables during build
// Example: export WIFI_SSID="YourNetwork" WIFI_PASSWORD="YourPassword"
#ifndef WIFI_SSID
#define WIFI_SSID      "Internett"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD  "Yellowfinch924"
#endif

// Server URL - production: serverpi.local, dev override with env var
#ifndef SERVER_URL
#define SERVER_BASE    "http://serverpi.local:3000"
#else
#define SERVER_BASE    SERVER_URL
#endif
#define SERVER_METADATA_URL  SERVER_BASE "/api/current.json"
#define SERVER_IMAGE_URL     SERVER_BASE "/api/image.bin"
#define SERVER_STATUS_URL    SERVER_BASE "/api/device-status"

#define DISPLAY_WIDTH  1200
#define DISPLAY_HEIGHT 1600
#define EINK_SIZE      (DISPLAY_WIDTH * DISPLAY_HEIGHT / 2)  // 2 pixels per byte (4 bits each)
#define CHUNK_SIZE     (32 * 1024)

#define WIFI_CONNECTED_BIT BIT0
#define DEFAULT_SLEEP_DURATION (60ULL * 60 * 1000000)  // 1 hour in microseconds

static EventGroupHandle_t s_wifi_event_group;
static char device_id[32] = {0};

// RTC memory survives deep sleep - boot count only
RTC_DATA_ATTR static uint32_t boot_count = 0;

// NVS keys for persistent storage (survives power cycle)
#define NVS_NAMESPACE "glance"
#define NVS_KEY_IMAGE_ID "image_id"

// Battery monitoring configuration
// GPIO 2 = ADC1_CH1 - connected to unlabeled solder pad on Good Display ESP32-133C02
// Pad identified by "2 sec HIGH" timing in GPIO discovery mode
#define BATTERY_ADC_CHANNEL ADC_CHANNEL_1  // GPIO 2 on ESP32-S3
#define BATTERY_GPIO        2
#define BATTERY_ADC_ATTEN   ADC_ATTEN_DB_12  // 0-3.3V range
#define VOLTAGE_DIVIDER_RATIO 2.0f  // 2:1 divider (2x 10kΩ resistors)

// Battery protection thresholds (LiPo safe discharge levels)
#define BATTERY_CRITICAL 3.3f  // Below this: emergency mode (stop waking up)
#define BATTERY_LOW      3.5f  // Below this: low battery warning
#define BATTERY_CHARGED  3.6f  // Above this after critical: resume normal operation
#define EMERGENCY_SLEEP_DURATION (24ULL * 60 * 60 * 1000000)  // 24 hours

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

// Read battery voltage from GPIO 2 (ADC1_CH1) via voltage divider
// Voltage divider: VBAT -> 10k -> GPIO2 -> 10k -> GND (2:1 ratio)
float read_battery_voltage(void) {
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

    // Take multiple readings and average for stability
    int total = 0;
    const int num_samples = 10;
    for (int i = 0; i < num_samples; i++) {
        int raw = 0;
        adc_oneshot_read(adc_handle, BATTERY_ADC_CHANNEL, &raw);
        total += raw;
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    int avg_raw = total / num_samples;

    float adc_voltage = (avg_raw / 4095.0f) * 3.3f;
    float battery_voltage = adc_voltage * VOLTAGE_DIVIDER_RATIO;

    printf("Battery: raw=%d, adc=%.2fV, bat=%.2fV (GPIO %d)\n",
           avg_raw, adc_voltage, battery_voltage, BATTERY_GPIO);

    ESP_ERROR_CHECK(adc_oneshot_del_unit(adc_handle));
    return battery_voltage;
}

void get_device_id(void) {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(device_id, sizeof(device_id), "esp32-%02x%02x%02x",
             mac[3], mac[4], mac[5]);
    printf("Device ID: %s\n", device_id);
}

void report_device_status(const char* status_msg) {
    wifi_ap_record_t ap_info;
    esp_wifi_sta_get_ap_info(&ap_info);

    // Read actual battery voltage
    float battery_voltage = read_battery_voltage();

    char post_data[512];
    snprintf(post_data, sizeof(post_data),
        "{\"deviceId\":\"%s\",\"status\":{"
        "\"batteryVoltage\":%.2f,"
        "\"signalStrength\":%d,"
        "\"freeHeap\":%lu,"
        "\"bootCount\":%lu,"
        "\"status\":\"%s\"}}",
        device_id,
        battery_voltage,
        ap_info.rssi,
        (unsigned long)esp_get_free_heap_size(),
        (unsigned long)boot_count,
        status_msg
    );

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

typedef struct {
    char image_id[64];
    uint64_t sleep_duration;
    bool has_new_image;
} metadata_t;

bool fetch_metadata(metadata_t* metadata) {
    printf("Fetching metadata from %s...\n", SERVER_METADATA_URL);

    esp_http_client_config_t config = {
        .url = SERVER_METADATA_URL,
        .timeout_ms = 10000,
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

    if (content_length <= 0 || content_length > 100000) {
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
        metadata->sleep_duration = (uint64_t)sleepDuration->valuedouble;
        printf("Found sleepDuration: %llu us\n", metadata->sleep_duration);
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
}

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
        .timeout_ms = 60000,
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
        // Report success BEFORE disabling WiFi
        extern void report_device_status(const char* status_msg);
        report_device_status("display_updating");

        printf("Displaying image...\n");

        // POWER OPTIMIZATION: Disable WiFi before display refresh to save ~100-200mA
        printf("Disabling WiFi to conserve power during display refresh...\n");
        esp_wifi_disconnect();
        esp_wifi_stop();
        vTaskDelay(pdMS_TO_TICKS(100));  // Let WiFi fully shut down

        initEPD();

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
            vTaskDelay(pdMS_TO_TICKS(1));  // 1ms delay for stability

            if (row % 200 == 0) {
                printf("  Left IC: row %d/%d\n", row, DISPLAY_HEIGHT);
            }
        }
        setPinCsAll(GPIO_HIGH);
        printf("Left IC complete\n");

        // Small delay between ICs
        vTaskDelay(pdMS_TO_TICKS(50));

        // Send to second IC (right half) - with 1ms delay between rows
        setPinCs(1, 0);
        writeEpdCommand(DTM);
        for (int row = 0; row < DISPLAY_HEIGHT; row++) {
            writeEpdData(eink_buffer + row * bytes_per_row + bytes_per_ic_row, bytes_per_ic_row);
            vTaskDelay(pdMS_TO_TICKS(1));  // 1ms delay for stability

            if (row % 200 == 0) {
                printf("  Right IC: row %d/%d\n", row, DISPLAY_HEIGHT);
            }
        }
        setPinCsAll(GPIO_HIGH);
        printf("Right IC complete\n");

        printf("Triggering display refresh...\n");
        epdDisplay();

        printf("=== Image displayed! ===\n");
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

    // Initialize hardware
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    vTaskDelay(pdMS_TO_TICKS(500));
    setPinCsAll(GPIO_HIGH);
    initEPD();

    // Don't clear display on boot - preserve existing image!
    printf("Hardware initialized, display preserved\n");

    // Initialize NVS first (required before any NVS operations)
    esp_err_t nvs_init_err = nvs_flash_init();
    if (nvs_init_err != ESP_OK) {
        printf("ERROR: NVS flash init failed: %s\n", esp_err_to_name(nvs_init_err));
    }

    // Check boot reason
    esp_reset_reason_t reset_reason = esp_reset_reason();

    if (reset_reason == ESP_RST_POWERON) {
        printf("=== POWER ON RESET ===\n");
        boot_count = 0;

        // Power cycle should force display refresh - clear last image ID
        nvs_handle_t nvs_handle;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle);
        if (err == ESP_OK) {
            nvs_erase_key(nvs_handle, NVS_KEY_IMAGE_ID);
            nvs_commit(nvs_handle);
            nvs_close(nvs_handle);
            printf("✅ Cleared last image ID - will force refresh\n");
        } else {
            printf("⚠️  Failed to clear NVS: %s\n", esp_err_to_name(err));
        }
    } else {
        boot_count++;
        printf("=== BOOT #%lu (from deep sleep) ===\n", boot_count);
    }

    // Get device ID
    get_device_id();

    // ===== BATTERY CHECK FIRST (before WiFi to save power) =====
    printf("\n=== Checking battery level ===\n");
    float battery_voltage = read_battery_voltage();

    if (battery_voltage < BATTERY_CRITICAL) {
        printf("⚠️  CRITICAL BATTERY: %.2fV (threshold: %.2fV)\n", battery_voltage, BATTERY_CRITICAL);
        printf("Entering emergency mode...\n");

        // Initialize WiFi to report critical battery (NVS already initialized above)
        wifi_init();

        printf("Waiting for WiFi (quick timeout)...\n");
        EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                               WIFI_CONNECTED_BIT,
                                               pdFALSE, pdTRUE,
                                               pdMS_TO_TICKS(10000));  // Short timeout

        if (bits & WIFI_CONNECTED_BIT) {
            printf("WiFi connected - reporting critical battery\n");
            report_device_status("battery_critical");
        } else {
            printf("WiFi failed - skipping report to save power\n");
        }

        // Show RED screen with battery warning
        printf("Displaying battery warning (RED)...\n");
        initEPD();
        epdDisplayColor(RED);

        // Sleep for 24 hours - will check battery again when waking up
        printf("💤 Entering emergency deep sleep for 24 hours\n");
        printf("Device will check battery again after sleep\n");
        printf("Please charge the battery!\n");
        esp_deep_sleep(EMERGENCY_SLEEP_DURATION);
    }

    if (battery_voltage < BATTERY_LOW) {
        printf("⚠️  Low battery: %.2fV (threshold: %.2fV)\n", battery_voltage, BATTERY_LOW);
        printf("Will continue operation but recommend charging\n");
    } else {
        printf("✅ Battery OK: %.2fV\n", battery_voltage);
    }

    // Initialize WiFi (NVS already initialized above)
    wifi_init();

    printf("Waiting for WiFi...\n");
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT,
                                           pdFALSE, pdTRUE,
                                           pdMS_TO_TICKS(30000));

    if (!(bits & WIFI_CONNECTED_BIT)) {
        printf("WiFi FAILED - showing RED\n");
        report_device_status("wifi_failed");
        initEPD();
        epdDisplayColor(RED);
        esp_deep_sleep(DEFAULT_SLEEP_DURATION);
    }

    printf("WiFi connected!\n");

    // Report status based on battery level
    if (battery_voltage < BATTERY_LOW) {
        report_device_status("battery_low");
    } else {
        report_device_status("connected");
    }

    // Fetch metadata from server
    metadata_t metadata = {0};
    uint64_t sleep_duration = DEFAULT_SLEEP_DURATION;

    if (fetch_metadata(&metadata)) {
        sleep_duration = metadata.sleep_duration;

        // If battery is low, double the sleep duration to conserve power
        if (battery_voltage < BATTERY_LOW) {
            sleep_duration *= 2;
            printf("⚠️  Low battery: doubling sleep duration to %llu seconds\n",
                   sleep_duration / 1000000);
        }

        // Only download if we have a new image
        if (metadata.has_new_image) {
            printf("New image detected (ID: %s), downloading...\n", metadata.image_id);

            if (download_and_display_image()) {
                printf("=== SUCCESS ===\n");
                // Save to NVS so it persists across power cycles
                save_last_image_id(metadata.image_id);
                // Note: report_device_status() is called BEFORE WiFi shutdown inside download_and_display_image()
            } else {
                printf("Download failed - showing color bars\n");
                report_device_status("download_failed");
                initEPD();
                epdDisplayColorBar();
            }
        } else {
            printf("Image unchanged, keeping current display\n");
            report_device_status("no_update_needed");
        }
    } else {
        printf("Failed to fetch metadata\n");
        report_device_status("metadata_failed");
    }

    printf("Entering deep sleep for %llu seconds...\n", sleep_duration / 1000000);
    esp_deep_sleep(sleep_duration);
}
