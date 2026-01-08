/**
 * @file glance_logic.c
 * @brief Implementation of pure logic functions
 */

#include "glance_logic.h"

uint8_t rgb_to_eink(uint8_t r, uint8_t g, uint8_t b) {
    // Return 4-bit color value (will be packed 2 per byte)
    if (r < 32 && g < 32 && b < 32) return EINK_BLACK;
    if (r > 224 && g > 224 && b > 224) return EINK_WHITE;
    if (r > 200 && g > 200 && b < 100) return EINK_YELLOW;
    if (r > 200 && g < 100 && b < 100) return EINK_RED;
    if (r < 100 && g < 100 && b > 200) return EINK_BLUE;
    if (r < 100 && g > 200 && b < 100) return EINK_GREEN;

    // Fallback: convert to grayscale and threshold
    int brightness = (r + g + b) / 3;
    return (brightness > 127) ? EINK_WHITE : EINK_BLACK;
}

bool is_battery_charging(float voltage) {
    // A fully charged LiPo naturally settles at ~4.1V when not plugged in.
    // Only voltages very close to max (4.2V) reliably indicate active charging.
    // Using 4.18V as threshold to avoid false positives from full battery.
    // Note: This is imperfect - proper detection requires hardware (charger status pin).
    return voltage >= CHARGING_THRESHOLD_V;
}

int battery_voltage_to_percent(float voltage) {
    // Linear interpolation between empty and full
    // LiPo discharge curve is not perfectly linear, but this is a reasonable approximation
    if (voltage >= BATTERY_FULL_V) return 100;
    if (voltage <= BATTERY_EMPTY_V) return 0;

    float range = BATTERY_FULL_V - BATTERY_EMPTY_V;  // 0.9V
    float level = voltage - BATTERY_EMPTY_V;
    return (int)((level / range) * 100.0f);
}

uint64_t calculate_sleep_duration(uint64_t base_duration_us, float voltage, bool is_charging) {
    // When charging, use short sleep for fast OTA checks (30 seconds)
    const uint64_t CHARGING_SLEEP_US = 30ULL * 1000000;
    if (is_charging) {
        return CHARGING_SLEEP_US;
    }

    // Low battery threshold
    const float BATTERY_LOW_V = 3.5f;

    // If battery is low, double the sleep duration to conserve power
    if (voltage < BATTERY_LOW_V) {
        return base_duration_us * 2;
    }

    return base_duration_us;
}
