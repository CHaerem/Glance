# Battery Monitoring Setup Guide

Complete guide to add real battery voltage monitoring to your ESP32 e-ink display.

---

## Quick Start

**Need just the wiring steps? Start here. For detailed explanations, see sections below.**

### Components Needed
- 2× 100kΩ resistors
- 3 jumper wires (10-15cm)
- Multimeter (for safety)

### Wiring Steps

```
LiPo Amigo Pro VBAT pin → [100kΩ] → Junction → [100kΩ] → GND
                                        ↓
                                  ESP32 GPIO 4
```

**Safety:** Measure voltage at junction before connecting to GPIO 4. Must be ≤2.5V (should be ~2.1V).

### Firmware Update

Edit `esp32-client/src/main.cpp` lines 765-768, replace:
```cpp
return 4.2f; // Simulate full battery voltage
```

With:
```cpp
analogSetAttenuation(ADC_11db);
int adcReading = analogRead(4);
float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;
if (voltage < 2.5f) voltage = 3.0f;
if (voltage > 4.3f) voltage = 4.2f;
return voltage;
```

### Flash and Test
```bash
cd esp32-client/
./build.sh
./build.sh monitor
```

---

## Overview

**Current Status:** Software is fully implemented. You just need hardware wiring.

**What you'll get:**
- Real-time battery percentage (0-100%) in admin UI
- Charging detection with ⚡ indicator
- "Last Charged" timestamp tracking
- Low battery warnings

### Your Setup

```
PiJuice 12Ah LiPo → LiPo Amigo Pro → MiniBoost 5V → USB-C (5V) → ESP32-S3 → E-ink Display
                          ↓
                      VBAT pin
                    (3.0-4.2V)
```

**The Problem:**
- ESP32 receives constant 5V via USB-C regardless of battery level
- MiniBoost 5V regulates output, hiding actual battery voltage
- Cannot measure battery without additional wiring

**The Solution:**
- Connect **LiPo Amigo Pro VBAT pin** to ESP32 **GPIO 4** via voltage divider
- VBAT pin outputs actual battery voltage (3.0V-4.2V)
- Voltage divider makes it safe for ESP32 (converts to 1.5V-2.1V)

---

## Component List

| Item | Quantity | Specifications | Where to Get | Cost |
|------|----------|----------------|--------------|------|
| 100kΩ resistors | 2 | 1/4W, 5% or better | Any electronics store | $0.20 |
| Jumper wires | 3 | 22-26 AWG, 10-15cm | Any electronics store | $0.50 |
| **TOTAL** | | | | **$0.70** |

**Optional:**
- Soldering iron & solder
- Heat shrink tubing
- Small perfboard
- Multimeter (highly recommended)

---

## Detailed Wiring Instructions

### Step 1: Identify the Pins

**On LiPo Amigo Pro:**
- **VBAT pin** - Battery voltage monitoring pin (labeled on board), outputs raw battery voltage (3.0V-4.2V)
  - Located on the castellated edge pads
  - Look for "VBAT" silkscreen label
  - **Alternative**: You can also solder directly to the BAT+ pad near the JST connector
- **GND pin** - Ground pin (shared with device output)
  - Multiple GND pads available on castellated edges
  - Can also use GND from DEVICE JST connector

**Note on LiPo Amigo Pro pinout:**
```
        USB-C (charging)
            │
    ┌───────────────┐
    │  LiPo Amigo   │
    │     Pro       │
    ├───────────────┤  Castellated Pads:
    │ VBAT          │  ← Battery voltage monitoring (3.0-4.2V)
    │ GND           │  ← Ground
    │ VDEV          │  ← Device output voltage
    └───────────────┘
     │           │
    BAT       DEVICE (to MiniBoost)
 (2-pin JST)  (2-pin JST)
```

**On ESP32-S3 (Good Display board):**
- **GPIO 4** - May be labeled IO4 or GPIO4
- **GND** - Any ground pin (shared via USB-C connection)

### Step 2: Build the Voltage Divider

**Circuit Diagram:**
```
LiPo Amigo Pro VBAT pin (3.0-4.2V)
        │
        ├─────────[R1: 100kΩ]─────┬─────> ESP32 GPIO 4
        │                         │
        │                    [R2: 100kΩ]
        │                         │
LiPo Amigo GND ───────────────────┴─────> ESP32 GND (via USB-C)
```

**How it works:**
- Battery at 4.2V (full) → GPIO 4 sees 2.1V ✅ (safe)
- Battery at 3.7V (mid) → GPIO 4 sees 1.85V ✅
- Battery at 3.0V (empty) → GPIO 4 sees 1.5V ✅

ESP32 ADC maximum is 3.3V, so 2.1V is perfectly safe.

### Step 3: Physical Wiring

**Option A: Breadboard (Quick Testing)**
1. Insert both 100kΩ resistors in breadboard in series
2. Wire from LiPo Amigo Pro VBAT pin to first resistor
3. Wire from junction (between resistors) to ESP32 GPIO 4
4. Wire from second resistor to GND

**Option B: Soldered (Permanent)**
1. Solder R1 (100kΩ) to LiPo Amigo Pro VBAT pin
2. Solder R2 (100kΩ) to other end of R1
3. Solder wire from R1-R2 junction to ESP32 GPIO 4
4. Solder other end of R2 to GND (can use LiPo Amigo GND or ESP32 GND - they're connected via USB-C)
5. Use heat shrink to protect connections

**Visual Reference:**
```
LiPo Amigo Pro                 MiniBoost 5V               ESP32-S3
┌──────────────┐              ┌──────────────┐         ┌──────────────┐
│              │              │              │         │              │
│ [VBAT] ●─────┼──[R1]──┬─────┼──────────────┼─────────┼──●[GPIO 4]   │
│              │  100kΩ │     │              │         │              │
│              │        │     │              │         │              │
│ [GND] ●──────┼──[R2]──┴─────┼──────────────┼─────────┼──●[GND]      │
│              │  100kΩ       │              │         │              │
│              │              │              │         │              │
│ [DEVICE] ●═══╪══JST cable═══╪══●[VIN]      │         │              │
│  (JST out)   │              │  [5V] ●══════╪═USB-C═══╪══●[USB-C]    │
└──────────────┘              └──────────────┘         │  (power in)  │
                                                        └──────────────┘
```

### Step 4: Safety Checks (CRITICAL!)

⚠️ **Do these checks BEFORE connecting to ESP32:**

1. **Verify resistor values:**
   - Use multimeter to measure each resistor
   - Should read ~100kΩ (100,000 ohms)
   - Acceptable range: 95kΩ - 105kΩ

2. **Check voltage at junction:**
   - Connect BAT pin and GND through voltage divider
   - Measure voltage at junction (where GPIO 4 will connect)
   - **Must read ≤2.5V** with fully charged battery
   - If higher than 2.5V: **STOP! Check resistors!**

3. **Verify polarity:**
   - BAT pin → R1 → Junction → R2 → GND
   - Ensure not connecting battery voltage directly to GPIO

### Step 5: Connect to ESP32

Once voltage is verified safe:
1. Connect junction wire to ESP32 GPIO 4
2. Verify GND is connected (usually via USB-C)
3. Power on ESP32

---

## Firmware Update

### Current Code (Returns Fake Voltage)

**File:** `esp32-client/src/main.cpp` lines 765-768

```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    // Good Display board doesn't have battery monitoring on A13
    // When USB powered, return a safe voltage to bypass low battery check
    return 4.2f; // Simulate full battery voltage
```

This returns fake 4.2V, which is why admin UI always shows 100%.

### Updated Code (Read Real Voltage)

Replace lines 765-768 with:

```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    // Good Display board with PowerBoost BAT pin voltage divider on GPIO 4
    // Connected via 2x 100kΩ resistors (2:1 divider)
    analogSetAttenuation(ADC_11db);  // 0-3.3V range
    int adcReading = analogRead(4);   // GPIO 4 (ADC1_CH3)

    // Convert ADC to voltage: 12-bit ADC (0-4095), 3.3V ref, 2:1 divider
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;

    // Clamp to valid LiPo range
    if (voltage < 2.5f) voltage = 3.0f;  // Below min = empty
    if (voltage > 4.3f) voltage = 4.2f;  // Above max = full

    return voltage;
```

### Compile and Flash

```bash
cd esp32-client/
./build.sh                    # Compile
./build.sh monitor            # Flash and monitor
```

Watch serial output for:
```
Battery Voltage: 4.0V (80%)   # Should vary, not always 4.2V
```

---

## Testing & Verification

### 1. Serial Output Check

```bash
./build.sh monitor
```

Expected output:
```
=== ESP32 Feather v2 E-ink Display ===
Boot count: 42
Battery Voltage: 4.0V (80%)    ← Varies with battery level
Battery is charging             ← When USB charger connected
```

### 2. Admin UI Check

**When discharging:**
```
Battery: 3.9V (75%)
Last Charged: 2h ago
```

**When charging:**
```
Battery: 4.1V (90%) ⚡
Last Charged: Just now
```

### 3. Accuracy Test

1. Measure battery with multimeter at PowerBoost BAT pin
2. Compare to admin UI display
3. Should match within ±0.2V

### 4. Charging Detection Test

1. Let battery discharge to ~3.9V
2. Plug in USB charger to PowerBoost
3. Wait for ESP32 wake cycle
4. Admin UI should show ⚡ icon
5. "Last Charged" updates to "Just now"

---

## Troubleshooting

### Battery always shows 4.2V (100%)

**Cause:** Firmware not updated or voltage divider not connected

**Fix:**
1. Check serial output - varying voltage?
2. Verify firmware compiled and uploaded
3. Measure voltage at GPIO 4 - should vary
4. Check voltage divider connections

### Battery percentage jumps wildly

**Cause:** ADC noise or poor connections

**Fix:**
1. Verify resistors firmly connected
2. Keep wires short (< 10cm)
3. Add 0.1µF capacitor between GPIO 4 and GND
4. Check for loose connections
5. Verify resistor values (100kΩ each)

### Voltage reading too high/low

**Cause:** Wrong resistor values or bad connections

**Fix:**
1. Measure resistors with multimeter (should be 100kΩ)
2. Verify formula: V_out = V_in × (R2 / (R1 + R2))
3. With R1=R2=100kΩ: V_out = V_in × 0.5 ✓
4. Check ADC attenuation is ADC_11db
5. Calibrate by adjusting multiplier in code

### Charging never detected

**Cause:** Battery not charging or threshold too high

**Fix:**
1. Verify PowerBoost charge LED lights when USB connected
2. Measure battery voltage - should increase when charging
3. Ensure ESP32 wakes during charging
4. Lower threshold in firmware (~line 810):
   ```cpp
   const float CHARGING_THRESHOLD = 0.03f; // Try 30mV
   ```

### GPIO 4 conflict with display

**Cause:** Display using GPIO 4 for SPI/control

**Fix:**
1. Check if GPIO 4 already in use
2. Choose different GPIO (try 5, 6, or 7)
3. Update code:
   ```cpp
   int adcReading = analogRead(5);  // Use GPIO 5
   ```
4. Ensure GPIO supports ADC (ADC1 channels only)

---

## Implementation Checklist

- [ ] Gather components (2× 100kΩ resistors, 3 wires)
- [ ] Identify PowerBoost BAT pin
- [ ] Identify ESP32 GPIO 4
- [ ] Build voltage divider
- [ ] Verify voltage with multimeter (≤2.5V)
- [ ] Connect to ESP32 GPIO 4
- [ ] Update firmware (main.cpp lines 765-768)
- [ ] Compile and flash
- [ ] Test with serial monitor
- [ ] Verify in admin UI
- [ ] Test charging detection
- [ ] Secure connections

---

## Technical Reference

### LiPo Discharge Curve

| Voltage | Percentage | Battery State |
|---------|-----------|---------------|
| 4.2V    | 100%      | Fully charged |
| 4.0V    | 80%       | Good |
| 3.7V    | 50%       | Nominal |
| 3.5V    | 30%       | Getting low |
| 3.3V    | 10%       | Low warning |
| 3.0V    | 0%        | Empty (cutoff) |

### Voltage Divider Formula

```
V_out = V_in × (R2 / (R1 + R2))
      = V_in × (100kΩ / (100kΩ + 100kΩ))
      = V_in × 0.5

Examples:
- 4.2V battery → 2.1V at GPIO 4
- 3.7V battery → 1.85V at GPIO 4
- 3.0V battery → 1.5V at GPIO 4
```

### Charging Detection

```cpp
bool detectCharging(float currentVoltage, float previousVoltage) {
    const float CHARGING_THRESHOLD = 0.05f; // 50mV
    return (currentVoltage - previousVoltage) >= CHARGING_THRESHOLD;
}
```

If voltage increases >50mV since last wake, charging detected.

---

## Safety Notes

⚠️ **Important:**

1. **Never connect battery voltage directly to GPIO**
   - ESP32 ADC max: 3.3V
   - LiPo battery: 4.2V
   - Direct connection = damaged ESP32

2. **Always verify voltage before connecting**
   - Use multimeter on voltage divider output
   - Must be ≤2.5V with full battery
   - If higher, check resistor values

3. **Use correct resistor values**
   - Both must be 100kΩ
   - Mismatched values = wrong voltage = damage

4. **Check polarity**
   - BAT pin is positive
   - GND is ground
   - Don't reverse

5. **Secure connections**
   - Loose wires can short
   - Use solder or heat shrink
   - Insulate exposed connections

---

## Related Files

- **Firmware:** `esp32-client/src/main.cpp`
- **Server:** `server/server.js`
- **Admin UI:** `server/admin.html`

## Support Resources

- [PowerBoost 1000C Pinout](https://learn.adafruit.com/adafruit-powerboost-1000c-load-share-usb-charge-boost)
- [ESP32-S3 ADC Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/adc.html)
- [LiPo Battery Care](https://learn.adafruit.com/li-ion-and-lipoly-batteries/voltages)
- [Voltage Divider Calculator](https://ohmslawcalculator.com/voltage-divider-calculator)

---

**Last Updated:** 2025-11-15
**Hardware:** LiPo Amigo Pro + Adafruit MiniBoost 5V + ESP32 GoodDisplay
**Status:** Implemented and ready for testing
