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
#include "nvs_flash.h"

#include "GDEP133C02.h"
#include "comm.h"
#include "pindefine.h"

#define WIFI_SSID      "Skynet"
#define WIFI_PASSWORD  "2013sverreCFO"
#define SERVER_URL     "http://192.168.86.40:3000/api/image.bin"

#define DISPLAY_WIDTH  1200
#define DISPLAY_HEIGHT 1600
#define EINK_SIZE      (DISPLAY_WIDTH * DISPLAY_HEIGHT / 2)  // 2 pixels per byte (4 bits each)
#define CHUNK_SIZE     (32 * 1024)

#define WIFI_CONNECTED_BIT BIT0

static EventGroupHandle_t s_wifi_event_group;

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
    
    printf("Connecting to %s...\n", SERVER_URL);
    esp_http_client_config_t config = {
        .url = SERVER_URL,
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
    
    printf("\n=== GLANCE: WiFi E-ink Display ===\n");
    
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    vTaskDelay(pdMS_TO_TICKS(500));
    setPinCsAll(GPIO_HIGH);
    initEPD();
    
    printf("Initializing (WHITE)...\n");
    epdDisplayColor(WHITE);
    
    nvs_flash_init();
    wifi_init();
    
    printf("Waiting for WiFi...\n");
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group, 
                                           WIFI_CONNECTED_BIT,
                                           pdFALSE, pdTRUE, 
                                           pdMS_TO_TICKS(30000));
    
    if (!(bits & WIFI_CONNECTED_BIT)) {
        printf("WiFi FAILED - showing RED\n");
        initEPD();
        epdDisplayColor(RED);
        while(1) vTaskDelay(pdMS_TO_TICKS(10000));
    }
    
    printf("WiFi connected! Downloading...\n");
    
    if (download_and_display_image()) {
        printf("=== SUCCESS ===\n");
    } else {
        printf("Download failed - showing color bars\n");
        initEPD();
        epdDisplayColorBar();
    }
    
    while(1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}
