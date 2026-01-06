#include "ota.h"
#include "server_config.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "esp_http_client.h"
#include "esp_ota_ops.h"
#include "esp_app_format.h"
#include "cJSON.h"

// Firmware version - injected at build time via FIRMWARE_VERSION env var
// CI/CD uses git SHA, local builds can use semantic versions like "1.0.0"
#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.0.0-dev"
#endif

static const char* TAG = "OTA";

const char* ota_get_version(void) {
    return FIRMWARE_VERSION;
}

/**
 * Compare semantic versions (e.g., "1.2.3")
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
/**
 * Compare two firmware versions
 * @param v1 Version string 1 (semver or git SHA)
 * @param v2 Version string 2 (semver or git SHA)
 * @param build_date1 Build timestamp for v1 (0 if unknown)
 * @param build_date2 Build timestamp for v2 (0 if unknown)
 * @return >0 if v2 is newer, 0 if same, <0 if v2 is older
 */
static int compare_versions(const char* v1, const char* v2, uint32_t build_date1, uint32_t build_date2) {
    // First check if versions are identical
    if (strcmp(v1, v2) == 0) {
        return 0;  // Same version
    }

    int major1 = 0, minor1 = 0, patch1 = 0;
    int major2 = 0, minor2 = 0, patch2 = 0;

    // Try to parse as semantic version
    int parsed1 = sscanf(v1, "%d.%d.%d", &major1, &minor1, &patch1);
    int parsed2 = sscanf(v2, "%d.%d.%d", &major2, &minor2, &patch2);

    // If both are semantic versions, compare numerically
    if (parsed1 == 3 && parsed2 == 3) {
        if (major1 != major2) return major2 > major1 ? 1 : -1;
        if (minor1 != minor2) return minor2 > minor1 ? 1 : -1;
        if (patch1 != patch2) return patch2 > patch1 ? 1 : -1;
        return 0;
    }

    // For git SHAs or other non-semantic versions, use build dates to determine which is newer
    // Build dates are Unix timestamps, so larger = more recent
    if (build_date1 > 0 && build_date2 > 0) {
        // Both have build dates - compare them
        if (build_date2 > build_date1) {
            printf("[%s] Server firmware is newer by build date (%lu > %lu)\n",
                   TAG, (unsigned long)build_date2, (unsigned long)build_date1);
            return 1;  // v2 is newer
        } else if (build_date2 < build_date1) {
            printf("[%s] Server firmware is OLDER by build date (%lu < %lu) - refusing downgrade\n",
                   TAG, (unsigned long)build_date2, (unsigned long)build_date1);
            return -1;  // v2 is older - refuse downgrade
        }
        // Same build date but different versions - treat as same
        return 0;
    }

    // If only server has build date (current was manually flashed without build date)
    if (build_date1 == 0 && build_date2 > 0) {
        printf("[%s] Server firmware has build date, current does not - allowing update\n", TAG);
        return 1;  // Allow update to CI-built firmware
    }

    // If current has build date but server doesn't, refuse (incomplete server firmware)
    if (build_date1 > 0 && build_date2 == 0) {
        printf("[%s] Server firmware missing build date - refusing update\n", TAG);
        return -1;
    }

    // If neither has build dates, refuse update to be safe
    // This prevents accidental downgrades when build date info is missing
    printf("[%s] Cannot determine version age (both missing build dates) - refusing update\n", TAG);
    return -1;
}

bool ota_check_version(ota_version_info_t* info) {
    printf("[%s] Checking for firmware updates at %s\n", TAG, OTA_VERSION_URL);
    printf("[%s] Current firmware version: %s\n", TAG, FIRMWARE_VERSION);

    memset(info, 0, sizeof(ota_version_info_t));

    esp_http_client_config_t config = {
        .url = OTA_VERSION_URL,
        .timeout_ms = 10000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        printf("[%s] Failed to initialize HTTP client\n", TAG);
        return false;
    }

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        printf("[%s] Failed to connect to OTA server: %s\n", TAG, esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return false;
    }

    int content_length = esp_http_client_fetch_headers(client);
    int status_code = esp_http_client_get_status_code(client);

    if (status_code != 200) {
        printf("[%s] Server returned status %d\n", TAG, status_code);
        esp_http_client_cleanup(client);
        return false;
    }

    if (content_length <= 0 || content_length > 2048) {
        printf("[%s] Invalid content length: %d\n", TAG, content_length);
        esp_http_client_cleanup(client);
        return false;
    }

    char* buffer = malloc(content_length + 1);
    if (!buffer) {
        printf("[%s] Failed to allocate buffer\n", TAG);
        esp_http_client_cleanup(client);
        return false;
    }

    int read_len = esp_http_client_read(client, buffer, content_length);
    buffer[read_len] = '\0';
    esp_http_client_cleanup(client);

    // Parse JSON response
    cJSON* json = cJSON_Parse(buffer);
    free(buffer);

    if (!json) {
        printf("[%s] Failed to parse version JSON\n", TAG);
        return false;
    }

    // Extract fields
    cJSON* version = cJSON_GetObjectItem(json, "version");
    cJSON* build_date = cJSON_GetObjectItem(json, "buildDate");
    cJSON* size = cJSON_GetObjectItem(json, "size");
    cJSON* sha256 = cJSON_GetObjectItem(json, "sha256");
    cJSON* min_battery = cJSON_GetObjectItem(json, "minBattery");
    cJSON* force_update = cJSON_GetObjectItem(json, "forceUpdate");

    if (version && cJSON_IsString(version)) {
        strncpy(info->version, version->valuestring, sizeof(info->version) - 1);
    }
    if (build_date && cJSON_IsNumber(build_date)) {
        info->build_date = (uint32_t)build_date->valuedouble;
    }
    if (size && cJSON_IsNumber(size)) {
        info->size = (uint32_t)size->valuedouble;
    }
    if (sha256 && cJSON_IsString(sha256)) {
        strncpy(info->sha256, sha256->valuestring, sizeof(info->sha256) - 1);
    }
    if (min_battery && cJSON_IsNumber(min_battery)) {
        info->min_battery = (float)min_battery->valuedouble;
    } else {
        info->min_battery = OTA_MIN_BATTERY_VOLTAGE;
    }
    // Parse force update flag from server
    info->force_update = force_update && cJSON_IsTrue(force_update);

    cJSON_Delete(json);

    // Check if server is forcing an update (bypasses version comparison)
    // This is used to recover from broken firmware or version comparison failures
    if (info->force_update) {
        printf("[%s] ⚠️  FORCE UPDATE enabled by server - bypassing version check\n", TAG);
        printf("[%s] Forcing update: %s -> %s (%lu bytes)\n",
               TAG, FIRMWARE_VERSION, info->version, (unsigned long)info->size);
        info->update_available = true;
        return true;
    }

    // Get current firmware's build timestamp from ESP32 app description
    // This is set by esp-idf during compilation
    const esp_app_desc_t* app_desc = esp_app_get_description();
    uint32_t current_build_date = 0;  // Will be 0 if manually flashed
    // Note: app_desc->date and time are compile-time strings, not timestamps
    // For now we'll use 0 for current firmware (no build date available)
    // Server firmware has build dates from CI/CD

    // Compare versions (current vs server)
    int cmp = compare_versions(FIRMWARE_VERSION, info->version, current_build_date, info->build_date);
    if (cmp > 0) {
        printf("[%s] Update available: %s -> %s (%lu bytes)\n",
               TAG, FIRMWARE_VERSION, info->version, (unsigned long)info->size);
        info->update_available = true;
        return true;
    } else if (cmp < 0) {
        printf("[%s] Server firmware is OLDER - refusing downgrade\n", TAG);
        info->update_available = false;
        return false;
    }

    printf("[%s] Firmware is up to date: %s\n", TAG, FIRMWARE_VERSION);
    info->update_available = false;
    return false;
}

ota_result_t ota_perform_update(const ota_version_info_t* info) {
    printf("[%s] Starting OTA update to version %s (%lu bytes)\n",
           TAG, info->version, (unsigned long)info->size);

    // Validate firmware size before starting
    if (info->size < OTA_MIN_FIRMWARE_SIZE) {
        printf("[%s] Firmware size %lu is too small (min %d bytes)\n",
               TAG, (unsigned long)info->size, OTA_MIN_FIRMWARE_SIZE);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    if (info->size > OTA_MAX_FIRMWARE_SIZE) {
        printf("[%s] Firmware size %lu exceeds maximum %d bytes\n",
               TAG, (unsigned long)info->size, OTA_MAX_FIRMWARE_SIZE);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    // Get the next OTA partition
    const esp_partition_t* update_partition = esp_ota_get_next_update_partition(NULL);
    if (!update_partition) {
        printf("[%s] No OTA partition available\n", TAG);
        return OTA_RESULT_WRITE_FAILED;
    }

    // Validate against actual partition size
    if (info->size > update_partition->size) {
        printf("[%s] Firmware size %lu exceeds partition size %lu\n",
               TAG, (unsigned long)info->size, (unsigned long)update_partition->size);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    printf("[%s] Writing to partition: %s at offset 0x%lx\n",
           TAG, update_partition->label, update_partition->address);

    // Begin OTA
    esp_ota_handle_t ota_handle;
    esp_err_t err = esp_ota_begin(update_partition, OTA_WITH_SEQUENTIAL_WRITES, &ota_handle);
    if (err != ESP_OK) {
        printf("[%s] esp_ota_begin failed: %s\n", TAG, esp_err_to_name(err));
        return OTA_RESULT_WRITE_FAILED;
    }

    // Setup HTTP client for download
    esp_http_client_config_t config = {
        .url = OTA_DOWNLOAD_URL,
        .timeout_ms = OTA_RECV_TIMEOUT_MS,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (!client) {
        printf("[%s] Failed to init HTTP client for download\n", TAG);
        esp_ota_abort(ota_handle);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        printf("[%s] Failed to connect for download: %s\n", TAG, esp_err_to_name(err));
        esp_ota_abort(ota_handle);
        esp_http_client_cleanup(client);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    int content_length = esp_http_client_fetch_headers(client);
    int status_code = esp_http_client_get_status_code(client);

    if (status_code != 200) {
        printf("[%s] Download failed with status %d\n", TAG, status_code);
        esp_ota_abort(ota_handle);
        esp_http_client_cleanup(client);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    printf("[%s] Downloading %d bytes...\n", TAG, content_length);

    // Allocate download buffer
    uint8_t* buffer = malloc(OTA_BUFFER_SIZE);
    if (!buffer) {
        printf("[%s] Failed to allocate download buffer\n", TAG);
        esp_ota_abort(ota_handle);
        esp_http_client_cleanup(client);
        return OTA_RESULT_WRITE_FAILED;
    }

    int total_read = 0;
    int read_len;
    int last_progress = 0;

    while ((read_len = esp_http_client_read(client, (char*)buffer, OTA_BUFFER_SIZE)) > 0) {
        err = esp_ota_write(ota_handle, buffer, read_len);
        if (err != ESP_OK) {
            printf("[%s] esp_ota_write failed: %s\n", TAG, esp_err_to_name(err));
            free(buffer);
            esp_ota_abort(ota_handle);
            esp_http_client_cleanup(client);
            return OTA_RESULT_WRITE_FAILED;
        }

        total_read += read_len;

        // Print progress every 10%
        int progress = (total_read * 100) / content_length;
        if (progress >= last_progress + 10) {
            printf("[%s] Progress: %d%% (%d / %d bytes)\n",
                   TAG, progress, total_read, content_length);
            last_progress = progress;
        }
    }

    free(buffer);
    esp_http_client_cleanup(client);

    if (total_read != content_length) {
        printf("[%s] Download incomplete: got %d, expected %d\n",
               TAG, total_read, content_length);
        esp_ota_abort(ota_handle);
        return OTA_RESULT_DOWNLOAD_FAILED;
    }

    printf("[%s] Download complete: %d bytes\n", TAG, total_read);

    // End OTA and verify
    err = esp_ota_end(ota_handle);
    if (err != ESP_OK) {
        printf("[%s] esp_ota_end failed: %s\n", TAG, esp_err_to_name(err));
        return OTA_RESULT_VERIFY_FAILED;
    }

    // Set boot partition to the new firmware
    err = esp_ota_set_boot_partition(update_partition);
    if (err != ESP_OK) {
        printf("[%s] esp_ota_set_boot_partition failed: %s\n", TAG, esp_err_to_name(err));
        return OTA_RESULT_WRITE_FAILED;
    }

    printf("[%s] OTA update successful! Ready to reboot.\n", TAG);
    return OTA_RESULT_SUCCESS;
}

void ota_mark_valid(void) {
    const esp_partition_t* running = esp_ota_get_running_partition();
    if (!running) {
        printf("[%s] ERROR: Failed to get running partition\n", TAG);
        return;
    }

    esp_ota_img_states_t state;
    if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
        if (state == ESP_OTA_IMG_PENDING_VERIFY) {
            printf("[%s] Marking firmware as valid (canceling rollback)\n", TAG);
            esp_ota_mark_app_valid_cancel_rollback();
        }
    }
}
