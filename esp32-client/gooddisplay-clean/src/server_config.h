#ifndef SERVER_CONFIG_H
#define SERVER_CONFIG_H

/**
 * Server configuration - shared between main.c and ota.c
 *
 * SERVER_URL can be overridden via build environment variable.
 * Default: serverpi.local (production Raspberry Pi server)
 */

#ifndef SERVER_URL
#define SERVER_BASE    "http://serverpi.local"  // Port 80 (default HTTP)
#else
#define SERVER_BASE    SERVER_URL
#endif

// API endpoints
#define SERVER_METADATA_URL  SERVER_BASE "/api/current.json"
#define SERVER_IMAGE_URL     SERVER_BASE "/api/image.bin"
#define SERVER_STATUS_URL    SERVER_BASE "/api/device-status"
#define OTA_VERSION_URL      SERVER_BASE "/api/firmware/version"
#define OTA_DOWNLOAD_URL     SERVER_BASE "/api/firmware/download"

#endif // SERVER_CONFIG_H
