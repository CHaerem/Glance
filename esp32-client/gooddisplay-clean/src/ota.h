#ifndef OTA_H
#define OTA_H

#include <stdbool.h>
#include <stdint.h>

// OTA configuration
#define OTA_MIN_BATTERY_VOLTAGE  3.8f   // Don't start OTA below this voltage (raised from 3.6V to prevent brownouts)
#define OTA_RECV_TIMEOUT_MS      30000  // 30 second receive timeout
#define OTA_BUFFER_SIZE          4096   // Download chunk size
#define OTA_MIN_FIRMWARE_SIZE    100000 // 100KB minimum (sanity check)
#define OTA_MAX_FIRMWARE_SIZE    8388608 // 8MB maximum (partition size limit)

// OTA result codes
typedef enum {
    OTA_RESULT_SUCCESS = 0,
    OTA_RESULT_NO_UPDATE,
    OTA_RESULT_BATTERY_LOW,
    OTA_RESULT_DOWNLOAD_FAILED,
    OTA_RESULT_VERIFY_FAILED,
    OTA_RESULT_WRITE_FAILED,
} ota_result_t;

// OTA version info from server
typedef struct {
    char version[64];  // Increased from 32 to fit full git SHA (40 chars)
    uint32_t build_date;
    uint32_t size;
    char sha256[65];
    float min_battery;
    bool update_available;
    bool force_update;      // When true, bypass version comparison (server override)
} ota_version_info_t;

/**
 * Check if server has a newer firmware version
 * @param info Pointer to struct to fill with version info
 * @return true if update is available, false otherwise
 */
bool ota_check_version(ota_version_info_t* info);

/**
 * Perform OTA update - downloads and flashes new firmware
 * @param info Version info from ota_check_version
 * @return OTA result code
 */
ota_result_t ota_perform_update(const ota_version_info_t* info);

/**
 * Mark current firmware as valid (cancel rollback timer)
 * Call this after successful boot to prevent automatic rollback
 */
void ota_mark_valid(void);

/**
 * Get current firmware version string
 * @return Version string (e.g., "1.0.0" or git SHA)
 */
const char* ota_get_version(void);

#endif // OTA_H
