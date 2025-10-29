# Battery Monitoring Implementation Plan

## Current Status: Software Ready, Hardware Pending

### Overview

The Glance e-ink display system now has comprehensive battery monitoring software, but requires a simple hardware modification to read actual battery voltage from the PowerBoost 1000C.

---

## ✅ Completed: Software Implementation (v2-psram-battery-3.0)

### ESP32 Firmware Changes

**File:** `esp32-client/src/main.cpp`

**Implemented Features:**
- ✅ Battery percentage calculation using LiPo discharge curve
- ✅ Charging detection (voltage increase >50mV between wake cycles)
- ✅ Boot counter tracking in RTC memory
- ✅ Previous voltage stored in RTC memory for comparison
- ✅ Enhanced status reporting with `batteryPercent`, `isCharging`, `bootCount`

**Key Functions:**
```cpp
int calculateBatteryPercentage(float voltage);  // Maps 4.2V-3.0V to 100%-0%
bool detectCharging(float currentVoltage, float previousVoltage);  // Detects +50mV
float readBatteryVoltage();  // Reads from ADC with voltage divider compensation
```

**Current Limitation:**
```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    return 4.2f; // ⚠️ Returns fake voltage - no hardware connected yet
#endif
```

### Server Backend Changes

**File:** `server/server.js`

**Implemented Features:**
- ✅ Charging event detection and logging
- ✅ `lastChargeTimestamp` tracking in devices.json
- ✅ Enhanced device status storage with battery metrics
- ✅ `/api/esp32-status` endpoint returns all battery data

**Key Logic:**
```javascript
// Detect charging event when device starts charging
if (isCharging && !previousDevice.isCharging) {
    lastChargeTimestamp = Date.now();
    console.log(`[Battery] Device ${deviceId} started charging`);
    addDeviceLog(`🔋 Device ${deviceId} started charging`);
}
```

### Admin UI Changes

**File:** `server/admin.html`

**Implemented Features:**
- ✅ Battery display: "4.2V (100%)" with percentage
- ✅ Charging indicator: "4.2V (100%) ⚡" when charging
- ✅ "Last Charged" status item with human-friendly times
- ✅ Time formatting: "Just now", "45m ago", "3h ago", "2d ago", "Never"

**Current Display:**
Shows "4.2V (100%)" constantly because firmware returns fake voltage.

---

## 🔧 Pending: Hardware Implementation

### Problem Statement

**Your Setup:**
```
LiPo Battery → PowerBoost 1000C → USB-C (5V) → Good Display ESP32-S3
```

**The Issue:**
- ESP32 board receives **constant 5V** via USB-C regardless of battery level
- No direct battery voltage visibility from USB power input
- Cannot measure battery level without additional wiring

**Why We Need PowerBoost BAT Pin:**
- PowerBoost 1000C has a **BAT pin** that outputs raw battery voltage (3.0V-4.2V)
- This is the **only** way to read actual battery level in your current configuration
- The BAT pin provides direct battery voltage monitoring

### Hardware Solution: Voltage Divider from PowerBoost BAT Pin

#### Components Required

| Item | Quantity | Specifications | Estimated Cost |
|------|----------|----------------|----------------|
| 100kΩ resistors | 2 | 1/4W, 1% tolerance | $0.20 |
| Jumper wires | 3 | 22-26 AWG, ~10cm | $0.50 |
| **Total** | | | **$0.70** |

Optional (for cleaner installation):
- Small perfboard (2cm × 2cm)
- Heat shrink tubing
- Soldering iron and solder

#### Circuit Diagram

```
PowerBoost 1000C                          Good Display ESP32-S3
┌─────────────────┐                      ┌──────────────────┐
│                 │                      │                  │
│  BAT  ●─────────┼──────[R1: 100kΩ]────┼──●  GPIO 4 (ADC) │
│  (3.0-4.2V)     │           │          │                  │
│                 │           │          │                  │
│  GND  ●─────────┼───────────┴──────────┼──●  GND          │
│                 │      [R2: 100kΩ]     │                  │
│                 │                      │                  │
│  5V OUT ●───────┼─── USB-C cable ──────┼──●  USB-C IN     │
│  (USB-C)        │                      │     (power)      │
└─────────────────┘                      └──────────────────┘

Voltage Divider Calculation:
- Input: 3.0V - 4.2V (battery range)
- Output at GPIO 4: 1.5V - 2.1V (safe for ESP32 ADC, max 3.3V)
- Divider ratio: 2:1
```

#### Wiring Instructions

**Step 1: Locate PowerBoost 1000C BAT Pin**
- Find the BAT pin on the PowerBoost board
- Usually labeled near the JST battery connector
- May be a solder pad or through-hole pin

**Step 2: Build Voltage Divider**
- Solder first 100kΩ resistor (R1) to BAT pin
- Solder second 100kΩ resistor (R2) from R1's other end to GND
- Junction between R1 and R2 is your ADC signal

**Step 3: Connect to ESP32**
- Wire from R1-R2 junction → ESP32 GPIO 4
- Connect PowerBoost GND → ESP32 GND (if not already via USB-C)

**Step 4: Verify Connections**
- ⚠️ Double-check: No direct battery voltage to GPIO pins!
- ⚠️ Measure voltage at GPIO 4: Should be ~2.1V max with full battery
- ⚠️ If voltage > 2.5V, do NOT connect - check resistor values

**Step 5: Secure Wiring**
- Use heat shrink tubing on resistor leads
- Secure wires with zip ties or hot glue
- Ensure no shorts between connections

#### Physical Installation Photos Needed

Please take photos of:
1. PowerBoost 1000C board showing BAT pin location
2. Good Display ESP32-S3 board showing GPIO 4 location
3. Current wiring setup (battery, PowerBoost, USB-C connection)

This will help identify the exact connection points and any potential issues.

---

## 📝 Firmware Update Required

### Current Code (Fake Voltage)

**File:** `esp32-client/src/main.cpp` (Line 743-746)

```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    // Good Display board doesn't have battery monitoring on A13
    // When USB powered, return a safe voltage to bypass low battery check
    return 4.2f; // Simulate full battery voltage
```

### Updated Code (Real Voltage Reading)

**Option A: Update Good Display Definition**

Replace the fake voltage return with actual ADC reading:

```cpp
#ifdef BOARD_GOODDISPLAY_ESP32_133C02
    // Good Display board with external voltage divider on GPIO 4
    // Connected to PowerBoost 1000C BAT pin via 2x 100kΩ resistors
    analogSetAttenuation(ADC_11db);  // Set 11dB attenuation for 0-3.3V range
    int adcReading = analogRead(4);  // GPIO 4 (ADC1_CH3)

    // Convert ADC reading to voltage
    // ESP32-S3 ADC: 12-bit (0-4095), 3.3V reference, 2:1 voltage divider
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;

    // Clamp to valid LiPo range
    if (voltage < 2.5f) voltage = 3.0f;  // Minimum safe voltage
    if (voltage > 4.3f) voltage = 4.2f;  // Maximum safe voltage

    return voltage;
```

**Option B: Add Separate Configuration**

Create a new build flag in `platformio.ini`:

```ini
[env:gooddisplay_battery]
platform = espressif32
board = freenove_esp32_s3_wroom
framework = arduino

build_flags =
    -DBOARD_GOODDISPLAY_ESP32_133C02
    -DBATTERY_MONITORING_ENABLED
    -DBATTERY_PIN=4
    # ... other flags
```

Then in `main.cpp`:

```cpp
float readBatteryVoltage() {
#if defined(BOARD_GOODDISPLAY_ESP32_133C02) && defined(BATTERY_MONITORING_ENABLED)
    // Real battery monitoring via PowerBoost BAT pin
    int adcReading = analogRead(BATTERY_PIN);
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;
    return voltage;
#elif defined(BOARD_GOODDISPLAY_ESP32_133C02)
    // Fallback for boards without battery monitoring
    return 4.2f;
#else
    // Other boards with built-in battery monitoring
    int adcReading = analogRead(BATTERY_PIN);
    float voltage = (adcReading / 4095.0f) * 3.3f * 2.0f;
    return voltage;
#endif
}
```

**Recommended:** Option B provides flexibility for users with/without hardware modification.

---

## 🔄 Implementation Steps

### Phase 1: Hardware Assembly (Est. 30 minutes)

- [ ] Gather components (2x 100kΩ resistors, 3 wires)
- [ ] Identify PowerBoost 1000C BAT pin location
- [ ] Identify ESP32 GPIO 4 pin location
- [ ] Solder/connect voltage divider circuit
- [ ] Verify voltage at GPIO 4 with multimeter (~2.1V max)
- [ ] Secure wiring and insulate connections

### Phase 2: Firmware Update (Est. 10 minutes)

- [ ] Decide on Option A or Option B firmware approach
- [ ] Update `esp32-client/src/main.cpp` with new voltage reading code
- [ ] If using Option B, update `platformio.ini` with new environment
- [ ] Compile firmware to verify no errors

### Phase 3: Flash and Test (Est. 15 minutes)

- [ ] Connect ESP32 to computer via USB
- [ ] Flash updated firmware to ESP32
- [ ] Monitor serial output for voltage readings
- [ ] Verify voltage matches multimeter reading (±0.1V acceptable)
- [ ] Test with battery at different charge levels

### Phase 4: Validation (Est. 30 minutes)

- [ ] Check admin UI shows actual battery voltage (not 4.2V constant)
- [ ] Check battery percentage updates correctly
- [ ] Test charging detection: Plug in USB charger, wait for next wake cycle
- [ ] Verify "Last Charged" timestamp updates in admin UI
- [ ] Run device through full charge/discharge cycle to verify accuracy

---

## 📊 Expected Results

### Before Hardware Modification

**Admin UI Display:**
```
Status: Online
Battery: 4.2V (100%)
Last Charged: Never
```

- Battery always shows 100% regardless of actual charge
- No charging detection
- "Last Charged" never updates

### After Hardware Modification

**Admin UI Display (Battery at 80%):**
```
Status: Online
Battery: 4.0V (80%)
Last Charged: 2h ago
```

**Admin UI Display (Battery Charging):**
```
Status: Online
Battery: 4.1V (90%) ⚡
Last Charged: Just now
```

**Console Logs (Server):**
```
[Battery] Device esp32-001 started charging
Device esp32-001 reported: Battery 4.1V (90%) [Charging], Signal -45dBm, Status: awake
```

**Serial Output (ESP32):**
```
=== ESP32 Feather v2 E-ink Display ===
Boot count: 42
Battery Voltage: 4.0V (80%)
Battery is charging
...
```

---

## 🐛 Troubleshooting Guide

### Issue: Battery shows 100% always

**Symptom:** Admin UI shows "4.2V (100%)" constantly

**Diagnosis:**
- Firmware still using fake voltage return
- Hardware not connected or not working

**Solutions:**
1. Check serial output for actual voltage readings
2. Verify firmware was updated and flashed
3. Check voltage divider is connected to GPIO 4
4. Measure voltage at GPIO 4 with multimeter (should vary with battery)

### Issue: Battery percentage jumps wildly

**Symptom:** Battery shows 50%, then 80%, then 30% within minutes

**Diagnosis:**
- ADC noise from poor connections
- Incorrect resistor values
- Loose wiring

**Solutions:**
1. Check all connections are secure
2. Verify resistor values are exactly 100kΩ each
3. Add 0.1µF capacitor between GPIO 4 and GND to filter noise
4. Keep wires short (<10cm) and away from noisy signals

### Issue: Charging never detected

**Symptom:** "Last Charged" always shows "Never", no ⚡ icon

**Diagnosis:**
- Battery not actually charging
- Voltage threshold too high (>50mV)
- Device doesn't wake up while charging

**Solutions:**
1. Verify battery is charging with multimeter (voltage should increase)
2. Check PowerBoost 1000C charge LED is lit
3. Wait for device to wake up (check sleep interval)
4. Lower charging threshold in firmware to 30mV if needed

### Issue: Voltage reading too high/low

**Symptom:** Shows 5.0V or 2.0V when battery is at 3.7V

**Diagnosis:**
- Incorrect voltage divider ratio
- Wrong ADC attenuation setting
- Bad resistor values

**Solutions:**
1. Measure actual resistor values with multimeter
2. Verify voltage divider calculation: V_out = V_in × R2/(R1+R2)
3. Check ADC attenuation is set to 11dB
4. Calibrate in firmware if needed: `voltage * calibration_factor`

---

## 📚 Reference Documentation

### Related Files

1. **`docs/BATTERY_MONITORING.md`** - General battery monitoring guide
2. **`esp32-client/src/main.cpp`** - Firmware implementation
3. **`server/server.js`** - Battery tracking server logic
4. **`server/admin.html`** - Admin UI battery display

### External Resources

- [PowerBoost 1000C Documentation](https://learn.adafruit.com/adafruit-powerboost-1000c-load-share-usb-charge-boost)
- [ESP32-S3 ADC Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/peripherals/adc.html)
- [LiPo Battery Discharge Curves](https://learn.adafruit.com/li-ion-and-lipoly-batteries/voltages)

### Voltage Divider Calculator

Online tool: https://ohmslawcalculator.com/voltage-divider-calculator

**For this project:**
- V_in = 4.2V (max battery voltage)
- R1 = 100kΩ
- R2 = 100kΩ
- V_out = 2.1V (safe for ESP32 ADC)

---

## 🎯 Success Criteria

The battery monitoring system is fully functional when:

1. ✅ Admin UI shows **variable voltage** (not constant 4.2V)
2. ✅ Battery **percentage** updates based on voltage (100% at 4.2V, 50% at 3.7V, 0% at 3.0V)
3. ✅ **Charging indicator** (⚡) appears when battery is charging
4. ✅ **"Last Charged"** timestamp updates when charging starts
5. ✅ Serial output shows **accurate voltage readings** (±0.1V of multimeter)
6. ✅ System **survives full discharge cycle** (enters extended sleep at <3.3V)
7. ✅ **Boot counter** increments correctly with each wake cycle

---

## 📅 Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| **Hardware Assembly** | 30 min | Components available |
| **Firmware Update** | 10 min | Code changes reviewed |
| **Flash and Test** | 15 min | Hardware assembled |
| **Validation** | 30 min | Full charge cycle |
| **Documentation** | 15 min | Testing complete |
| **Total** | **1.5 hours** | |

---

## 💡 Future Enhancements

Once basic battery monitoring is working:

1. **Battery Health Tracking**
   - Store voltage history over time
   - Detect battery degradation (capacity loss)
   - Alert when battery needs replacement

2. **Smart Power Management**
   - Adjust sleep intervals based on battery level
   - Skip display updates when battery is critically low
   - Predictive charging recommendations

3. **Historical Analytics**
   - Graph battery voltage over time in admin UI
   - Track charge/discharge cycles
   - Estimate remaining battery life

4. **Advanced Notifications**
   - Email/push notifications for low battery
   - Charging completion alerts
   - Battery health warnings

---

## 📞 Support

If you encounter issues during implementation:

1. Check serial debug output for detailed voltage readings
2. Measure voltages with multimeter at each connection point
3. Review troubleshooting guide above
4. Take photos of setup for visual diagnosis
5. Check GitHub issues for similar problems

---

**Document Version:** 1.0
**Last Updated:** 2025-10-29
**Firmware Version:** v2-psram-battery-3.0
**Status:** Software Complete, Hardware Pending
