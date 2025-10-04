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

#define WIFI_SSID      "Skynet"
#define WIFI_PASSWORD  "2013sverreCFO"
#define SERVER_BASE    "http://192.168.86.40:3000"
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

    char post_data[512];
    snprintf(post_data, sizeof(post_data),
        "{\"deviceId\":\"%s\",\"status\":{"
        "\"batteryVoltage\":%.2f,"
        "\"signalStrength\":%d,"
        "\"freeHeap\":%lu,"
        "\"bootCount\":%lu,"
        "\"status\":\"%s\"}}",
        device_id,
        3.7,  // TODO: Read actual battery voltage
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
        printf("Displaying image...\n");
        initEPD();

        // Display has 2 driver ICs - split data horizontally
        int width_per_ic = DISPLAY_WIDTH / 2;  // 600 pixels per IC
        int bytes_per_row = DISPLAY_WIDTH / 2;  // 1200 pixels / 2 = 600 bytes per row
        int bytes_per_ic_row = width_per_ic / 2;  // 600 pixels / 2 = 300 bytes per IC per row

        // Send to first IC (left half)
        setPinCsAll(GPIO_HIGH);
        setPinCs(0, 0);
        writeEpdCommand(DTM);
        for (int row = 0; row < DISPLAY_HEIGHT; row++) {
            writeEpdData(eink_buffer + row * bytes_per_row, bytes_per_ic_row);
        }
        setPinCsAll(GPIO_HIGH);

        // Send to second IC (right half)
        setPinCs(1, 0);
        writeEpdCommand(DTM);
        for (int row = 0; row < DISPLAY_HEIGHT; row++) {
            writeEpdData(eink_buffer + row * bytes_per_row + bytes_per_ic_row, bytes_per_ic_row);
        }
        setPinCsAll(GPIO_HIGH);

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

    // Check boot reason
    esp_reset_reason_t reset_reason = esp_reset_reason();

    if (reset_reason == ESP_RST_POWERON) {
        printf("=== POWER ON RESET ===\n");
        boot_count = 0;
    } else {
        boot_count++;
        printf("=== BOOT #%lu (from deep sleep) ===\n", boot_count);
    }

    // Get device ID
    get_device_id();

    // Initialize WiFi
    nvs_flash_init();
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
    report_device_status("connected");

    // Fetch metadata from server
    metadata_t metadata = {0};
    uint64_t sleep_duration = DEFAULT_SLEEP_DURATION;

    if (fetch_metadata(&metadata)) {
        sleep_duration = metadata.sleep_duration;

        // Only download if we have a new image
        if (metadata.has_new_image) {
            printf("New image detected (ID: %s), downloading...\n", metadata.image_id);

            if (download_and_display_image()) {
                printf("=== SUCCESS ===\n");
                // Save to NVS so it persists across power cycles
                save_last_image_id(metadata.image_id);
                report_device_status("display_updated");
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
