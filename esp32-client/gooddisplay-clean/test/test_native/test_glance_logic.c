/**
 * @file test_glance_logic.c
 * @brief Unit tests for pure logic functions
 *
 * Run with: pio test -e native
 *
 * These tests run on the host machine (Mac/Linux) without requiring
 * ESP32 hardware, enabling fast feedback during development.
 */

#include <unity.h>
#include "glance_logic.h"

// ============================================================================
// rgb_to_eink() Tests
// ============================================================================

void test_rgb_to_eink_black(void) {
    // Pure black
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(0, 0, 0));
    // Near black (below threshold)
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(31, 31, 31));
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(10, 20, 15));
}

void test_rgb_to_eink_white(void) {
    // Pure white
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(255, 255, 255));
    // Near white (above threshold)
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(225, 225, 225));
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(240, 240, 240));
}

void test_rgb_to_eink_red(void) {
    // Pure red
    TEST_ASSERT_EQUAL(EINK_RED, rgb_to_eink(255, 0, 0));
    // High red with low green/blue
    TEST_ASSERT_EQUAL(EINK_RED, rgb_to_eink(220, 50, 50));
    TEST_ASSERT_EQUAL(EINK_RED, rgb_to_eink(201, 99, 99));
}

void test_rgb_to_eink_yellow(void) {
    // Pure yellow
    TEST_ASSERT_EQUAL(EINK_YELLOW, rgb_to_eink(255, 255, 0));
    // High red and green with low blue
    TEST_ASSERT_EQUAL(EINK_YELLOW, rgb_to_eink(220, 220, 50));
    TEST_ASSERT_EQUAL(EINK_YELLOW, rgb_to_eink(201, 201, 99));
}

void test_rgb_to_eink_blue(void) {
    // Pure blue
    TEST_ASSERT_EQUAL(EINK_BLUE, rgb_to_eink(0, 0, 255));
    // High blue with low red/green
    TEST_ASSERT_EQUAL(EINK_BLUE, rgb_to_eink(50, 50, 220));
    TEST_ASSERT_EQUAL(EINK_BLUE, rgb_to_eink(99, 99, 201));
}

void test_rgb_to_eink_green(void) {
    // Pure green
    TEST_ASSERT_EQUAL(EINK_GREEN, rgb_to_eink(0, 255, 0));
    // High green with low red/blue
    TEST_ASSERT_EQUAL(EINK_GREEN, rgb_to_eink(50, 220, 50));
    TEST_ASSERT_EQUAL(EINK_GREEN, rgb_to_eink(99, 201, 99));
}

void test_rgb_to_eink_grayscale_fallback(void) {
    // Mid-gray should become white (brightness > 127)
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(150, 150, 150));
    // Dark gray should become black (brightness <= 127)
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(100, 100, 100));
    // Mixed colors that don't match any primary should fall back
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(180, 180, 180));
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(50, 50, 50));
}

void test_rgb_to_eink_edge_cases(void) {
    // Test threshold boundaries
    // Just below black threshold (31, 31, 31) is black
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(31, 31, 31));
    // Just above black threshold should not be black (falls to grayscale)
    // 32+32+32 = 96, /3 = 32, which is <= 127, so still black
    TEST_ASSERT_EQUAL(EINK_BLACK, rgb_to_eink(32, 32, 32));

    // White threshold is 224
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(225, 225, 225));
    // Just below white threshold - becomes grayscale white (224*3/3 = 224 > 127)
    TEST_ASSERT_EQUAL(EINK_WHITE, rgb_to_eink(224, 224, 224));
}

// ============================================================================
// is_battery_charging() Tests
// ============================================================================

void test_is_battery_charging_true(void) {
    // At and above threshold should indicate charging
    TEST_ASSERT_TRUE(is_battery_charging(4.18f));
    TEST_ASSERT_TRUE(is_battery_charging(4.19f));
    TEST_ASSERT_TRUE(is_battery_charging(4.20f));
    TEST_ASSERT_TRUE(is_battery_charging(4.25f));  // Slightly over max (possible with some chargers)
}

void test_is_battery_charging_false(void) {
    // Below threshold should not indicate charging
    TEST_ASSERT_FALSE(is_battery_charging(4.17f));
    TEST_ASSERT_FALSE(is_battery_charging(4.10f));
    TEST_ASSERT_FALSE(is_battery_charging(4.00f));
    TEST_ASSERT_FALSE(is_battery_charging(3.70f));
    TEST_ASSERT_FALSE(is_battery_charging(3.30f));
}

// ============================================================================
// battery_voltage_to_percent() Tests
// ============================================================================

void test_battery_voltage_to_percent_full(void) {
    TEST_ASSERT_EQUAL(100, battery_voltage_to_percent(4.20f));
    TEST_ASSERT_EQUAL(100, battery_voltage_to_percent(4.25f));  // Over max
}

void test_battery_voltage_to_percent_empty(void) {
    TEST_ASSERT_EQUAL(0, battery_voltage_to_percent(3.30f));
    TEST_ASSERT_EQUAL(0, battery_voltage_to_percent(3.00f));  // Under min
}

void test_battery_voltage_to_percent_mid(void) {
    // 3.75V is exactly halfway between 3.3V and 4.2V
    TEST_ASSERT_EQUAL(50, battery_voltage_to_percent(3.75f));
    // 3.525V is 25%
    TEST_ASSERT_EQUAL(25, battery_voltage_to_percent(3.525f));
    // 3.975V is 75%
    TEST_ASSERT_EQUAL(75, battery_voltage_to_percent(3.975f));
}

void test_battery_voltage_to_percent_typical_values(void) {
    // Typical battery voltages during use
    int percent_4v = battery_voltage_to_percent(4.0f);
    TEST_ASSERT_TRUE(percent_4v >= 75 && percent_4v <= 80);  // ~77%

    int percent_3_7v = battery_voltage_to_percent(3.7f);
    TEST_ASSERT_TRUE(percent_3_7v >= 40 && percent_3_7v <= 50);  // ~44%

    int percent_3_5v = battery_voltage_to_percent(3.5f);
    TEST_ASSERT_TRUE(percent_3_5v >= 20 && percent_3_5v <= 25);  // ~22%
}

// ============================================================================
// calculate_sleep_duration() Tests
// ============================================================================

void test_calculate_sleep_duration_charging(void) {
    // When charging, always use 30 second sleep regardless of base duration
    uint64_t base = 5ULL * 60 * 1000000;  // 5 minutes
    uint64_t expected_charging = 30ULL * 1000000;  // 30 seconds

    TEST_ASSERT_EQUAL(expected_charging, calculate_sleep_duration(base, 4.20f, true));
    TEST_ASSERT_EQUAL(expected_charging, calculate_sleep_duration(base, 3.50f, true));
    TEST_ASSERT_EQUAL(expected_charging, calculate_sleep_duration(base, 3.30f, true));
}

void test_calculate_sleep_duration_normal_battery(void) {
    // Normal battery (>= 3.5V) should use base duration
    uint64_t base = 5ULL * 60 * 1000000;  // 5 minutes

    TEST_ASSERT_EQUAL(base, calculate_sleep_duration(base, 4.00f, false));
    TEST_ASSERT_EQUAL(base, calculate_sleep_duration(base, 3.70f, false));
    TEST_ASSERT_EQUAL(base, calculate_sleep_duration(base, 3.50f, false));
}

void test_calculate_sleep_duration_low_battery(void) {
    // Low battery (< 3.5V) should double the sleep duration
    uint64_t base = 5ULL * 60 * 1000000;  // 5 minutes
    uint64_t expected_doubled = 10ULL * 60 * 1000000;  // 10 minutes

    TEST_ASSERT_EQUAL(expected_doubled, calculate_sleep_duration(base, 3.49f, false));
    TEST_ASSERT_EQUAL(expected_doubled, calculate_sleep_duration(base, 3.40f, false));
    TEST_ASSERT_EQUAL(expected_doubled, calculate_sleep_duration(base, 3.30f, false));
}

// ============================================================================
// Test Runner
// ============================================================================

void setUp(void) {
    // Called before each test
}

void tearDown(void) {
    // Called after each test
}

int main(int argc, char **argv) {
    UNITY_BEGIN();

    // rgb_to_eink tests
    RUN_TEST(test_rgb_to_eink_black);
    RUN_TEST(test_rgb_to_eink_white);
    RUN_TEST(test_rgb_to_eink_red);
    RUN_TEST(test_rgb_to_eink_yellow);
    RUN_TEST(test_rgb_to_eink_blue);
    RUN_TEST(test_rgb_to_eink_green);
    RUN_TEST(test_rgb_to_eink_grayscale_fallback);
    RUN_TEST(test_rgb_to_eink_edge_cases);

    // is_battery_charging tests
    RUN_TEST(test_is_battery_charging_true);
    RUN_TEST(test_is_battery_charging_false);

    // battery_voltage_to_percent tests
    RUN_TEST(test_battery_voltage_to_percent_full);
    RUN_TEST(test_battery_voltage_to_percent_empty);
    RUN_TEST(test_battery_voltage_to_percent_mid);
    RUN_TEST(test_battery_voltage_to_percent_typical_values);

    // calculate_sleep_duration tests
    RUN_TEST(test_calculate_sleep_duration_charging);
    RUN_TEST(test_calculate_sleep_duration_normal_battery);
    RUN_TEST(test_calculate_sleep_duration_low_battery);

    return UNITY_END();
}
