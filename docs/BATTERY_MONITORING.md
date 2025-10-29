# Battery Monitoring Hardware Setup

This guide explains how to add battery voltage monitoring to your ESP32 board for accurate battery percentage tracking and charging detection.

## Overview

The firmware (v2-psram-battery-3.0+) includes advanced battery tracking features:
- **Battery Percentage**: Accurate LiPo discharge curve mapping (4.2V = 100%, 3.0V = 0%)
- **Charging Detection**: Automatic detection when battery is being charged
- **Last Charged Tracking**: Server tracks when the battery was last charged
- **Boot Counter**: Track wake cycles for battery life analysis

## Hardware Requirements

### For Good Display ESP32-S3-133C02 Board

The Good Display board does not have battery monitoring connected by default. To enable it, you need to add a voltage divider circuit.

#### Components Needed:
- 2x 100kΩ resistors (1/4W, 1% tolerance recommended)
- Small piece of perfboard or direct soldering
- Thin wire (22-26 AWG)

#### Circuit Diagram:

```
VBAT (Battery +) ──┬──────────────────> To Battery Connector
                   │
                   ├─[100kΩ]──┬──────> GPIO 4 (ADC1_CH3)
                   │          │
                   │         [100kΩ]
                   │          │
GND ───────────────┴──────────┴──────> Ground
```

This creates a 2:1 voltage divider:
- LiPo max voltage: 4.2V → ADC sees: 2.1V (safe for ESP32's 3.3V ADC)
- LiPo min voltage: 3.0V → ADC sees: 1.5V

#### Installation Steps:

1. **Locate ADC Pin**:
   - Use GPIO 4 (ADC1_CH3) on the ESP32-S3
   - This pin must not be used by the display

2. **Build Voltage Divider**:
   - Solder two 100kΩ resistors in series
   - Connect one end to VBAT (battery positive terminal)
   - Connect the middle junction to GPIO 4
   - Connect the other end to GND

3. **Verify Connections**:
   - Measure voltage at GPIO 4 with multimeter
   - Should read approximately half of battery voltage
   - With fully charged battery (4.2V), GPIO 4 should read ~2.1V

4. **Update Firmware**:
   - Remove the `BOARD_GOODDISPLAY_ESP32_133C02` define OR
   - Change `BATTERY_PIN` to `GPIO_NUM_4`
   - Recompile and upload firmware

#### Code Changes for Good Display Board:

In `platformio.ini`, remove or comment out the Good Display flag:
```ini
build_flags =
    ; -DBOARD_GOODDISPLAY_ESP32_133C02  # Comment this out
    -DBATTERY_PIN=4  # Add this to specify GPIO 4
```

Or modify `main.cpp` to use a different pin for Good Display:
```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    #define BATTERY_PIN 4  // GPIO 4 for voltage divider
#else
    #define BATTERY_PIN A13
#endif
```

### For Other ESP32 Boards

Most ESP32 development boards with LiPo charging circuits already include voltage monitoring on pin A13 or similar. Check your board's schematic.

#### Common Boards:
- **Adafruit Feather ESP32**: Battery monitoring on A13 (works out of the box)
- **ESP32-PICO-V3**: May need external voltage divider
- **Generic ESP32 DevKit**: Usually no battery circuit, add voltage divider as above

## Software Configuration

### Calibration

The default voltage mapping should work for most LiPo batteries:
```cpp
const float V_MAX = 4.2f;      // Fully charged
const float V_MIN = 3.0f;      // Empty (cutoff)
const float V_NOMINAL = 3.7f;  // Mid-point
```

If you experience inaccurate readings:

1. **Check with multimeter**: Measure actual battery voltage
2. **Compare ESP32 reading**: Check serial debug output
3. **Adjust calibration**: Modify voltage divider ratio in code:
   ```cpp
   float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;  // 2.0f is divider ratio
   ```

### Charging Detection

Charging is detected when voltage increases by >50mV between wake cycles:
```cpp
const float CHARGING_THRESHOLD = 0.05f; // 50mV
```

You may need to adjust this if you experience false positives/negatives.

## Admin UI Display

Once hardware is connected, the admin panel will show:

**Battery Status**:
- Voltage: `4.2V (100%) ⚡` (when charging)
- Voltage: `3.7V (50%)` (when discharging)

**Last Charged**:
- `Just now` (< 1 minute)
- `45m ago` (< 1 hour)
- `3h ago` (< 24 hours)
- `2d ago` (>= 24 hours)
- `Never` (no charging events detected)

## Troubleshooting

### Battery shows 100% always
**Problem**: Good Display board returns fake 4.2V
**Solution**: Add voltage divider hardware and update firmware flag

### Battery percentage jumps around
**Problem**: ADC noise or poor connections
**Solution**:
- Add 0.1µF capacitor between ADC pin and GND
- Use 1% tolerance resistors
- Shorten wires to voltage divider

### Charging never detected
**Problem**: Voltage threshold too high or not actually charging
**Solution**:
- Verify battery is actually charging (use multimeter)
- Lower `CHARGING_THRESHOLD` to 0.03f (30mV)
- Check that battery is connected during ESP32 wake cycles

### Last Charged shows "Never"
**Problem**: No charging events since firmware update
**Solution**: This is normal - plug in charger and wait for next ESP32 wake cycle

## Safety Notes

⚠️ **Important**:
- Never connect battery voltage directly to GPIO pins
- ESP32 ADC maximum input: 3.3V (will be damaged above this)
- Always use voltage divider for LiPo batteries (4.2V max)
- Double-check polarity before connecting
- Use proper gauge wire for battery connections (18-22 AWG)

## Technical Details

### LiPo Discharge Curve

The percentage calculation uses a piecewise linear approximation:
- **Upper range (4.2V - 3.7V)**: 50% to 100% battery
- **Lower range (3.7V - 3.0V)**: 0% to 50% battery

This matches typical LiPo discharge characteristics where:
- Voltage drops slowly when >50% charged
- Voltage drops rapidly when <50% charged

### RTC Memory Storage

Battery data stored across deep sleep:
- `lastBatteryVoltage`: Previous voltage (for charging detection)
- `bootCount`: Number of wake cycles (for battery life tracking)

This allows the ESP32 to track battery trends without continuous power.

## Future Improvements

Potential enhancements:
- [ ] Battery health tracking over time
- [ ] Low battery email/notification alerts
- [ ] Graph of battery voltage history
- [ ] Estimated time remaining on battery
- [ ] Temperature compensation for voltage readings
