#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "nvs_flash.h"
#include "esp_task_wdt.h"

#include "GDEP133C02.h"
#include "comm.h"
#include "pindefine.h"

static const char *TAG = "GLANCE";

#define WIFI_SSID      "Skynet"
#define WIFI_PASSWORD  "2013sverreCFO"
#define SERVER_URL     "http://192.168.86.40:3000/api/image.bin"

#define DISPLAY_WIDTH  1200
#define DISPLAY_HEIGHT 1600
#define RGB_SIZE       (DISPLAY_WIDTH * DISPLAY_HEIGHT * 3)
#define EINK_SIZE      (DISPLAY_WIDTH * DISPLAY_HEIGHT / 2)

#define WIFI_CONNECTED_BIT BIT0
static EventGroupHandle_t s_wifi_event_group;

static uint8_t *rgb_buffer = NULL;
static uint8_t *eink_buffer = NULL;
static int bytes_downloaded = 0;

// E-ink color mapping
const uint8_t EINK_BLACK = 0x0;
const uint8_t EINK_WHITE = 0x1;
const uint8_t EINK_YELLOW = 0x2;
const uint8_t EINK_RED = 0x3;
const uint8_t EINK_BLUE = 0x5;
const uint8_t EINK_GREEN = 0x6;

uint8_t rgb_to_eink(uint8_t r, uint8_t g, uint8_t b) {
    // Simple color mapping to 6-color palette
    if (r < 32 && g < 32 && b < 32) return EINK_BLACK;
    if (r > 224 && g > 224 && b > 224) return EINK_WHITE;
    if (r > 200 && g > 200 && b < 100) return EINK_YELLOW;
    if (r > 200 && g < 100 && b < 100) return EINK_RED;
    if (r < 100 && g < 100 && b > 200) return EINK_BLUE;
    if (r < 100 && g > 200 && b < 100) return EINK_GREEN;
    
    // Default: choose closest
    int brightness = (r + g + b) / 3;
    return (brightness > 127) ? EINK_WHITE : EINK_BLACK;
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

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data)
{
    static int retry = 0;
    
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (retry < 5) {
            esp_wifi_connect();
            retry++;
            ESP_LOGI(TAG, "WiFi retry %d/5", retry);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "IP: " IPSTR, IP2STR(&event->ip_info.ip));
        retry = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

void wifi_init(void)
{
    s_wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASSWORD,
        },
    };
    
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "Connecting to %s...", WIFI_SSID);
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
}

esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    if (evt->event_id == HTTP_EVENT_ON_DATA) {
        if (!esp_http_client_is_chunked_response(evt->client)) {
            if (rgb_buffer && (bytes_downloaded + evt->data_len) <= RGB_SIZE) {
                memcpy(rgb_buffer + bytes_downloaded, evt->data, evt->data_len);
                bytes_downloaded += evt->data_len;
                
                if (bytes_downloaded % 100000 == 0) {
                    ESP_LOGI(TAG, "Downloaded: %d KB", bytes_downloaded / 1024);
                }
            }
        }
    }
    return ESP_OK;
}

bool download_and_display(void)
{
    ESP_LOGI(TAG, "Allocating RGB buffer (%d KB)...", RGB_SIZE / 1024);
    rgb_buffer = (uint8_t *)malloc(RGB_SIZE);
    
    ESP_LOGI(TAG, "Allocating e-ink buffer (%d KB)...", EINK_SIZE / 1024);
    eink_buffer = (uint8_t *)malloc(EINK_SIZE);
    
    if (!rgb_buffer || !eink_buffer) {
        ESP_LOGE(TAG, "Memory allocation failed!");
        if (rgb_buffer) free(rgb_buffer);
        if (eink_buffer) free(eink_buffer);
        return false;
    }
    
    bytes_downloaded = 0;
    ESP_LOGI(TAG, "Downloading from server...");

    esp_http_client_config_t config = {
        .url = SERVER_URL,
        .event_handler = http_event_handler,
        .timeout_ms = 60000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "HTTP %d, got %d bytes", status, bytes_downloaded);

        if (status == 200 && bytes_downloaded > 0) {
            ESP_LOGI(TAG, "Converting RGB to e-ink...");
            memset(eink_buffer, 0x11, EINK_SIZE);
            convert_rgb_to_eink(rgb_buffer, eink_buffer, DISPLAY_WIDTH * DISPLAY_HEIGHT);
            
            ESP_LOGI(TAG, "Displaying image...");
            setPinCsAll(GPIO_LOW);
            checkBusyLow();
            writeEpdImage(SPI_CS0, eink_buffer, EINK_SIZE);
            setPinCsAll(GPIO_HIGH);
            
            ESP_LOGI(TAG, "Done!");
            esp_http_client_cleanup(client);
            free(rgb_buffer);
            free(eink_buffer);
            return true;
        }
    }

    ESP_LOGE(TAG, "Download failed: %s", esp_err_to_name(err));
    esp_http_client_cleanup(client);
    free(rgb_buffer);
    free(eink_buffer);
    return false;
}

void app_main(void)
{
    // Init hardware FIRST - before anything can fail
    initialGpio();
    initialSpi();
    setGpioLevel(LOAD_SW, GPIO_HIGH);
    epdHardwareReset();
    vTaskDelay(pdMS_TO_TICKS(100));
    setPinCsAll(GPIO_HIGH);
    initEPD();

    // Show WHITE immediately - this proves code is running
    setPinCsAll(GPIO_LOW);
    checkBusyLow();
    epdDisplayColor(WHITE);
    setPinCsAll(GPIO_HIGH);
    vTaskDelay(pdMS_TO_TICKS(5000));

    // NOW try WiFi stuff that might fail
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = 30000,
        .idle_core_mask = 0,
        .trigger_panic = false
    };
    esp_task_wdt_reconfigure(&wdt_config);

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    // Connect WiFi
    esp_task_wdt_reset();
    wifi_init();

    // BLACK screen = WiFi connected, downloading
    esp_task_wdt_reset();
    initEPD();
    setPinCsAll(GPIO_LOW);
    checkBusyLow();
    epdDisplayColor(BLACK);
    setPinCsAll(GPIO_HIGH);
    vTaskDelay(pdMS_TO_TICKS(2000));

    // Download and display image
    esp_task_wdt_reset();
    initEPD();
    esp_task_wdt_reset();

    if (!download_and_display()) {
        // FAILED - show color bars
        esp_task_wdt_reset();
        initEPD();
        esp_task_wdt_reset();
        epdDisplayColorBar();
    }

    // Done - wait forever
    while(1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}
