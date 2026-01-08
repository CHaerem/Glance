# ESP32 Client Testing Improvements

This document outlines future plans for improving the robustness and testability of the ESP32 firmware.

## Current State (Implemented)

### Unit Tests for Pure Logic (Option 1)
- **Status**: Implemented
- **Location**: `esp32-client/gooddisplay-clean/test/test_native/`
- **Run with**: `pio test -e native`

Testable functions extracted to `lib/glance_logic/`:
- `rgb_to_eink()` - Color conversion from RGB to 6-color e-ink palette
- `is_battery_charging()` - Battery charging detection
- `battery_voltage_to_percent()` - Battery percentage calculation
- `calculate_sleep_duration()` - Sleep duration logic

**17 tests currently passing.**

### OTA Stability Validation (Option 2)
- **Status**: Implemented
- **Location**: `esp32-client/gooddisplay-clean/src/main.c`

After an OTA update:
1. Last image ID is cleared, forcing a display refresh
2. Refresh counter is reset
3. Firmware is only marked stable after 2 successful display refreshes
4. If device fails before completing 2 refreshes, it automatically rolls back

---

## Future Plans

### Option 3: Better Observability

**Goal**: Add more detailed logging and state tracking to catch issues quickly.

#### 3.1 Structured State Logging
Add JSON-formatted state logs that can be parsed by the server:
```c
// Example structured log
{
  "event": "display_refresh",
  "state": {
    "voltage_before": 4.15,
    "voltage_after": 4.08,
    "duration_ms": 12500,
    "success": true
  },
  "firmware": "abc123",
  "uptime_ms": 45000
}
```

**Implementation steps**:
1. Create `log_event()` function that outputs structured JSON
2. Add state tracking for key operations (WiFi connect, download, display refresh)
3. Server parses and stores these events for analysis
4. Add dashboard visualization

#### 3.2 State Machine Visualization
Track and report the device state machine transitions:
```
BOOT -> BATTERY_CHECK -> WIFI_CONNECT -> METADATA_FETCH ->
DISPLAY_INIT -> DOWNLOAD -> DISPLAY_REFRESH -> SLEEP
```

**Implementation steps**:
1. Define enum for device states
2. Log state transitions with timestamps
3. Server tracks state history per device
4. Detect stuck states or unexpected transitions

#### 3.3 Performance Metrics
Track timing of each operation:
- WiFi connection time
- Metadata fetch time
- Image download time (KB/s)
- Display refresh time
- Total wake cycle time

**Implementation steps**:
1. Add timing macros/functions
2. Report metrics to server
3. Track trends over time
4. Alert on degradation

---

### Option 4: Hardware Simulation (Limited)

**Goal**: Enable some level of firmware testing without physical hardware.

#### 4.1 Mock Hardware Abstraction Layer (HAL)

Create mock implementations of hardware functions for testing:

```c
// Real implementation (ESP32)
#ifdef TARGET_ESP32
float read_battery_voltage(void) {
    // ADC read code
}
#endif

// Mock implementation (native tests)
#ifdef TARGET_NATIVE
static float mock_battery_voltage = 4.0f;
float read_battery_voltage(void) {
    return mock_battery_voltage;
}
void test_set_battery_voltage(float v) {
    mock_battery_voltage = v;
}
#endif
```

**Mockable components**:
- Battery ADC reading
- WiFi status
- NVS storage (use in-memory map)
- Display commands (verify sequence)

**Implementation steps**:
1. Create HAL header with all hardware interfaces
2. Create ESP32 implementation
3. Create mock implementation for native tests
4. Write integration tests using mocks

#### 4.2 QEMU Simulation (Advanced)

ESP-IDF has QEMU support, but it's complex and limited:
- Can emulate ESP32 CPU and memory
- Cannot emulate custom peripherals (display, battery ADC)
- Useful for testing core logic, WiFi stack

**Evaluation needed**:
- Time investment vs. benefit
- Coverage of actual hardware issues
- Maintenance burden

#### 4.3 Hardware-in-the-Loop (HIL) Testing

For critical changes, test on actual hardware automatically:

**Setup**:
1. Dedicated ESP32 test device connected to CI server
2. Automated firmware upload
3. Serial log capture and parsing
4. Pass/fail based on expected log patterns

**Implementation steps**:
1. Set up test ESP32 on Raspberry Pi
2. Create CI job for HIL tests
3. Define test scenarios and expected outcomes
4. Run on PR merge to main

---

## Priority Recommendation

1. **High Priority**: Option 3.3 (Performance Metrics) - Low effort, high value
2. **Medium Priority**: Option 3.1 (Structured Logging) - Helps debugging
3. **Lower Priority**: Option 4.1 (Mock HAL) - More effort, enables better testing
4. **Future**: Option 4.3 (HIL) - High setup cost, but most reliable

---

## Running Tests

```bash
# Unit tests (native, runs on Mac/Linux)
cd esp32-client/gooddisplay-clean
pio test -e native

# Build firmware
pio run -e esp32s3

# Upload and monitor
pio run -e esp32s3 -t upload && pio device monitor
```
