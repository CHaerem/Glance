# Glance E-Ink Display Power Investigation Report

**Date:** January 2025
**Issue:** Brownouts during display refresh when running on battery power

---

## Executive Summary

The Glance e-ink display system experiences brownouts (device resets) during display refresh when powered by battery. The system works reliably on USB power. Investigation reveals the likely cause is **current limiting in the power chain**, specifically the LiPo Amigo Pro's 1A discharge limit and/or the MiniBoost's 1A output limit, combined with the display's high peak current demand during refresh.

**Recommended solution:** Add a 5.5V 5-10F supercapacitor after the MiniBoost to buffer peak current demands.

---

## System Overview

### Hardware Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           POWER CHAIN                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PiJuice 12000mAh LiPo Battery (3.7V nominal)                           │
│         │                                                                │
│         ▼                                                                │
│  LiPo Amigo Pro (charger + protection)                                  │
│  - Charge: 200mA default, 500mA with mod                                │
│  - Discharge limit: ~1A (protection IC)                                 │
│  - Output: 3.7-4.2V (battery voltage pass-through)                      │
│         │                                                                │
│         ▼                                                                │
│  Adafruit MiniBoost 5V @ 1A (TPS61023)                                  │
│  - Input: 0.5-5.5V (min 1.8V for startup)                               │
│  - Output: 5.2V                                                          │
│  - Max output current (at 3.7V input): ~1A                              │
│  - Efficiency: ~78-88% depending on load                                │
│         │                                                                │
│         ▼                                                                │
│  Good Display ESP32-133C02 Board                                        │
│  - Input: 5V                                                             │
│  - ESP32-S3 + Waveshare 13.3" Spectra 6 Display                         │
│  - Display: 1600×1200, 6-color e-ink                                    │
│  - Refresh time: ~19-55 seconds                                          │
│  - Peak current: Unknown, but >1A suspected                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Display Specifications (Waveshare 13.3" Spectra 6)

| Spec | Value |
|------|-------|
| Resolution | 1600 × 1200 |
| Colors | 6 (Black, White, Red, Yellow, Blue, Green) |
| Refresh power | <0.5W typical |
| Recommended PSU | 3.3V/1A or more |
| Refresh time | ~19 seconds (per Waveshare specs) |

---

## Problem Description

### Symptoms

1. Display refresh works reliably on USB power (~4.4V, high current available)
2. Display refresh causes brownout (ESP32 resets) on battery power (~4.0-4.2V)
3. Brownout occurs during the `epdDisplay()` call (display refresh phase)
4. Battery voltage reads 4.0-4.2V before brownout (appears healthy)

### Observations

- WiFi connection works on battery (draws ~100-200mA)
- Image download works on battery (draws ~100-200mA)
- Display data transfer works on battery
- **Display refresh (charge pump activation) triggers brownout**

---

## Root Cause Analysis

### Theory: Current Limiting in Power Chain

The display refresh activates the e-ink charge pump, which creates a high peak current demand. The power chain has multiple potential bottlenecks:

#### Bottleneck #1: LiPo Amigo Pro (1A discharge limit)

The LiPo Amigo Pro has a protection IC that limits discharge current to approximately 1A.

**Problem calculation:**
- MiniBoost efficiency at full load: ~78%
- To output 1A at 5V (5W), MiniBoost needs: 5W / 0.78 = 6.4W input
- At 3.7V input: 6.4W / 3.7V = **1.73A required**
- Amigo Pro allows: **1A max**
- **Result:** Current limited before reaching MiniBoost

#### Bottleneck #2: MiniBoost (1A output limit)

Even if the Amigo Pro could supply more current, the MiniBoost itself is limited:

| Input Voltage | Max Output Current |
|---------------|-------------------|
| 3.0V | 800mA |
| 3.5V | 1100mA |
| 3.7V | ~1000mA |
| 4.0V | 1400mA |

If the display needs >1A at 5V during refresh, the MiniBoost cannot supply it.

#### Why USB Works

USB power provides:
- Regulated 5V directly (no boost conversion needed)
- 500mA-2A+ available depending on source
- No Amigo Pro protection IC in the path
- Direct connection to Good Display board

### Voltage Sag Under Load

When high current is demanded:

```
Battery at rest:        4.2V
Under 1A+ load:         Voltage sags due to internal resistance
Amigo Pro:              May hit current limit, restrict flow
MiniBoost input:        Drops below optimal range
MiniBoost output:       Drops below 5V, or current limited
ESP32:                  Receives insufficient voltage/current
Result:                 BROWNOUT
```

---

## Software Optimization Attempts (Failed)

### Attempt 1: Deferred Display Init

**Theory:** Move `initEPD()` to after image download, with WiFi disabled, to reduce competing loads during capacitor charging.

**Implementation:**
```c
// After download completes:
esp_wifi_disconnect();
esp_wifi_stop();
initEPD();
vTaskDelay(pdMS_TO_TICKS(8000));  // 8 second delay
epdDisplay();
```

**Result:** Still caused brownouts on battery.

### Attempt 2: Increased Delay

**Theory:** 8 seconds wasn't enough for capacitor charging, try 15 seconds.

**Result:** Still caused brownouts on battery.

### Attempt 3: Revert to Original Timing

**Theory:** Test if original code (initEPD at boot, before WiFi) still works.

**Result:** Also caused brownouts, suggesting the issue is hardware-related, not timing-related.

### Conclusion

Software timing changes cannot solve a hardware current limitation. The peak current demand exceeds what the power chain can provide, regardless of timing.

---

## Proposed Solutions

### Solution 1: Supercapacitor (RECOMMENDED)

Add a supercapacitor after the MiniBoost to buffer peak current demands.

**How it works:**
1. Supercap charges slowly from MiniBoost at <1A (within all limits)
2. During display refresh, supercap delivers the peak current burst
3. Upstream components never see the spike

**Wiring:**
```
MiniBoost 5V ──┬── [2-5Ω resistor] ── Supercap+ ──┬── Good Display Board 5V
               │                                   │
              GND ─────────────── Supercap- ──────┴── GND
```

**Specifications needed:**
- Voltage rating: 5.5V (to handle 5.2V from MiniBoost)
- Capacitance: 5-10F recommended
- ESR: <1Ω preferred (lower is better)

**Energy calculation:**
- 5F @ 5V = ½ × 5 × 5² = 62.5 Joules stored
- 1A for 20 seconds @ 5V = 100 Joules needed
- With 10F: 125 Joules stored (plenty of margin)

**Recommended products:**
- Generic 5.5V 5F or 10F supercapacitor from AliExpress (~$2)
- Eaton PHV-5R4H505-R (5F 5.4V, ~$12-15, DigiKey/Mouser)

**Pros:**
- Keeps all safety protections in place
- Cheap ($2-15)
- Guaranteed to solve the problem
- No firmware changes needed

**Cons:**
- Adds physical size
- 2-4 week shipping from AliExpress
- Adds slight complexity to wiring

### Solution 2: Disable Amigo Pro Protection (NOT RECOMMENDED)

Bridge the "NO PROTECT" pads on the LiPo Amigo Pro to disable the 1A limit.

**Pros:**
- Free (just solder bridge)
- No additional components

**Cons:**
- Removes protection against overcurrent
- May not solve the problem if MiniBoost is also a bottleneck
- Risk of battery damage if something shorts
- Not recommended by manufacturer without external protection

**Note:** The PiJuice battery reportedly has its own protection circuit, but this is unverified.

### Solution 3: Replace Power Chain

Replace LiPo Amigo Pro + MiniBoost with a single higher-current solution.

**Option A: Adafruit PowerBoost 1000C**
- Integrated charger + boost converter
- 1A continuous, 2A peak
- Still limited by battery's ability to source current

**Option B: Higher-C Battery**
- Use a LiPo with 10C+ discharge rating
- Can deliver higher peak currents without voltage sag

**Cons:**
- Doesn't address MiniBoost 1A limit
- More expensive than supercap
- May still require supercap for peaks >1A

### Solution 4: USB Power Bank

Use a USB power bank with "always-on" mode.

**Pros:**
- Integrated battery management
- High current output (2A+)
- Easy recharge

**Cons:**
- Many power banks auto-shutoff during deep sleep (low current)
- Bulkier than current setup
- Doesn't fit slim frame requirement

---

## Recommended Action Plan

### Immediate (Free)
1. Keep device on USB power while waiting for supercap
2. Keep current firmware (original timing with initEPD at boot)

### Short-term (~$2, 2-4 weeks)
1. Order 5.5V 5-10F supercapacitor from AliExpress
2. Order 2-3 units in case of DOA
3. Also order a few 2-5Ω resistors (1/2W or 1W) if not already available

### Installation
1. Wire supercap between MiniBoost output and Good Display board input
2. Add series resistor to limit inrush current during initial charge
3. Test on battery

### Verification
```bash
# Check brownout count
curl http://serverpi.local:3000/api/esp32-status | jq '{brownoutCount, state, batteryVoltage}'

# Target: 10+ consecutive display updates without brownout
```

---

## Open Questions

1. **Exact peak current draw:** What is the actual current draw at the 5V rail during display refresh? Would require a current meter in-line to measure.

2. **Battery protection:** Does the PiJuice battery actually have built-in overcurrent protection? What is its limit?

3. **Why did it work before?** User reported it worked on battery previously. Possible explanations:
   - Battery degradation (increased internal resistance)
   - Different code path that happened to work
   - Misremembering (may have been on USB)
   - Environmental factors (temperature affects battery performance)

4. **MiniBoost vs Amigo Pro:** Which is the primary bottleneck? The supercap solution doesn't require knowing this.

---

## Appendix: Component Links

- **Battery:** [PiJuice 12000mAh Li-Po](https://www.tinytronics.nl/en/power/batteries/li-po/pijuice-12000mah-li-po-battery)
- **Charger:** [LiPo Amigo Pro](https://shop.pimoroni.com/products/lipo-amigo?variant=39779302539347)
- **Boost Converter:** [Adafruit MiniBoost 5V @ 1A](https://www.adafruit.com/product/4654)
- **Supercap (AliExpress):** Search "5.5V 5F supercapacitor" or "5.5V 10F supercapacitor"
- **Supercap (DigiKey):** [Eaton PHV-5R4H505-R](https://www.digikey.com/en/products/detail/eaton-electronics-division/PHV-5R4H505-R/3878059)

---

## Changelog

- **2025-01-09:** Initial investigation, identified current limiting as likely cause
- **2025-01-09:** Software timing optimizations tested (8s, 15s delays) - failed
- **2025-01-09:** Reverted to original timing - also failed
- **2025-01-09:** Concluded hardware solution (supercapacitor) is required
- **2025-01-10:** **SOLVED** - Replaced LiPo Amigo Pro + MiniBoost with PowerBoost 1000C
  - PowerBoost 1000C has no 1A discharge limit - handles peak current
  - Display refresh works reliably on battery without brownout
  - Blue LED removed to save ~2mA standby current
  - Battery monitoring via 100kΩ + 27kΩ voltage divider (ratio 8.3)
  - Wiring: Battery JST → PowerBoost → USB-A to USB-C → ESP32
