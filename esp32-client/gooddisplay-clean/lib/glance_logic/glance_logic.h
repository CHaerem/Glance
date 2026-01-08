/**
 * @file glance_logic.h
 * @brief Pure logic functions that can be unit tested without hardware
 *
 * This header contains functions that have no hardware dependencies and can
 * be tested on the host machine (Mac/Linux) using PlatformIO's native test runner.
 */

#ifndef GLANCE_LOGIC_H
#define GLANCE_LOGIC_H

#include <stdint.h>
#include <stdbool.h>

// E-ink color palette (Spectra 6)
#define EINK_BLACK   0x0
#define EINK_WHITE   0x1
#define EINK_YELLOW  0x2
#define EINK_RED     0x3
#define EINK_BLUE    0x5
#define EINK_GREEN   0x6

// Battery thresholds
#define CHARGING_THRESHOLD_V    4.18f   // Voltage indicating active charging
#define BATTERY_FULL_V          4.2f    // Fully charged LiPo
#define BATTERY_EMPTY_V         3.3f    // LiPo cutoff voltage

/**
 * @brief Convert RGB pixel to 4-bit e-ink color
 *
 * Maps 24-bit RGB colors to the 6-color Spectra palette.
 * Uses thresholds to identify primary colors, falls back to
 * black/white based on brightness for mixed colors.
 *
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @return 4-bit e-ink color value (0x0-0x6)
 */
uint8_t rgb_to_eink(uint8_t r, uint8_t g, uint8_t b);

/**
 * @brief Check if battery is currently charging
 *
 * Detects charging by checking if voltage is near maximum (4.2V).
 * Note: This is imperfect - proper detection requires hardware
 * (charger status pin). A fully charged battery at rest reads ~4.1V,
 * so we use 4.18V threshold to avoid false positives.
 *
 * @param voltage Battery voltage in volts
 * @return true if charging (voltage >= 4.18V), false otherwise
 */
bool is_battery_charging(float voltage);

/**
 * @brief Calculate battery percentage from voltage
 *
 * Uses linear interpolation between empty (3.3V) and full (4.2V).
 * Clamps result to 0-100 range.
 *
 * @param voltage Battery voltage in volts
 * @return Battery percentage (0-100)
 */
int battery_voltage_to_percent(float voltage);

/**
 * @brief Calculate sleep duration based on battery level
 *
 * Returns longer sleep duration when battery is low to conserve power.
 *
 * @param base_duration_us Base sleep duration in microseconds
 * @param voltage Battery voltage in volts
 * @param is_charging Whether device is currently charging
 * @return Adjusted sleep duration in microseconds
 */
uint64_t calculate_sleep_duration(uint64_t base_duration_us, float voltage, bool is_charging);

#endif // GLANCE_LOGIC_H
