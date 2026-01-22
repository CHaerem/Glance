# Power Optimization Upgrade: TPL5110 + NFC

This document describes a hardware upgrade to dramatically improve battery life from ~3 months to 1.7-3.3 years using the Adafruit TPL5110 timer and NFC TAG 2 CLICK (NT3H2111) module.

**Key feature:** Wake the display by simply holding your iPhone near the frame - no app required!

## Current System Limitations

### Power Consumption Analysis

The current system uses ESP32 deep sleep, but the **PowerBoost 1000C quiescent current** is the main battery drain:

| Component | Current | Notes |
|-----------|---------|-------|
| PowerBoost 1000C (always on) | 3 mA | Blue LED removed, saves ~2mA |
| ESP32 deep sleep | 10 μA | Negligible vs PowerBoost |
| Display (LOAD_SW=LOW) | 0 μA | After power-off fix |
| **Total sleep current** | **~3 mA** | |

### Current Battery Life

With 12000mAh battery and 15-minute wake intervals + night sleep:

```
Sleep:   3mA × 24h = 72 mAh/day (PowerBoost quiescent)
Wake:    76 × 0.42mAh = 32 mAh/day
Display: ~17 mAh/day
─────────────────────────
Total:   ~121 mAh/day

Battery life: 12000mAh ÷ 121 = 99 days ≈ 3 months
```

### The Problem

Even with ZERO wakes (infinite deep sleep), the PowerBoost quiescent current limits battery life to:

```
12000mAh ÷ (3mA × 24h) = 166 days ≈ 5.5 months maximum
```

**The PowerBoost must be completely powered off to achieve longer battery life.**

## Proposed Solution

### Components

| Component | Product | Price | Function |
|-----------|---------|-------|----------|
| TPL5110 | [Adafruit 3435](https://www.adafruit.com/product/3435) | ~$5 | Nano-power timer |
| NFC TAG 2 CLICK | [MikroE MIKROE-2462](https://www.mikroe.com/nfc-tag-2-click) | ~$20 | Manual wake via phone tap |
| P-MOSFET | Si2301 or similar | ~$1 | Load switch |
| Diodes | 2× 1N4148 | ~$0.10 | Diode-OR circuit |

**Total upgrade cost: ~$27**

### TPL5110 Specifications

| Specification | Value |
|---------------|-------|
| Quiescent current | ~20 μA |
| Timer range | 100ms - 2 hours |
| Input voltage | 3-5V |
| Timer adjustment | Onboard trimpot |
| Manual wake | Tactile button (included) |

### NFC TAG 2 CLICK (NT3H2111) Specifications

| Specification | Value |
|---------------|-------|
| Chip | NXP NT3H2111 |
| Quiescent current (passive) | ~5 μA |
| Interface | I²C (up to 400kHz, address 0x55) |
| Energy harvesting | ~5mA @ 2V from NFC field (VOUT pin) |
| Field Detection | FD pin goes HIGH when phone is near |
| Memory | 888 bytes EEPROM + 64 bytes SRAM |
| Standards | NFC Forum Type 2, ISO/IEC 14443 |

### How iPhone Wake Works

The NT3H2111 has a **Field Detection (FD)** pin that triggers when any NFC-enabled phone is held nearby:

```
┌─────────────────────────────────────────┐
│                                         │
│  1. iPhone held near frame              │
│         ↓                               │
│  2. iPhone emits NFC field              │
│     (always active, no app needed)      │
│         ↓                               │
│  3. NT3H2111 detects field              │
│         ↓                               │
│  4. FD pin → HIGH                       │
│         ↓                               │
│  5. Triggers TPL5110/MOSFET             │
│         ↓                               │
│  6. ESP32 powers on, shows new art      │
│                                         │
└─────────────────────────────────────────┘
```

**No app required** - just hold iPhone (or any NFC phone) against the frame!

## System Architecture

### Block Diagram

```
     LiPo Battery (3.7V)
          │
          ├──────────────────────────────────────┐
          │                                      │
          ▼                                      ▼
    ┌───────────┐                        ┌───────────────┐
    │ TPL5110   │                        │  PowerBoost   │
    │   20μA    │      Diode-OR          │    1000C      │
    │           │    ┌───────────┐       │               │
    │  DRV ─────┼──►|┤           ├──────►│ BAT       5V ─┼──► ESP32 VIN
    │  DONE ◄───┼────┤           │   │   │               │
    │           │    │           │   │   │               │
    │  DELAY ◄──┼─┐  └───────────┘   │   └───────────────┘
    └───────────┘ │        ▲         │          │
          │       │        │         │          ▼
       Trimpot    │   ┌────┴────┐    │    ┌───────────┐
      (2 hours)   │   │NT3H2111 │    │    │  ESP32-S3 │
          │       │   │NFC TAG 2│    │    │           │
         GND      │   │ CLICK   │    │    │  GPIO ────┼──► DONE
                  │   │         │    │    │  GPIO 2 ◄─┼─── Battery ADC
                  │   │  FD ────┼──►|┘    │           │
                  │   │  I²C ───┼─────────┼──► (opt)  │
                  │   └─────────┘         └───────────┘
                  │
                  └─── Trimpot: 60kΩ = 15min, max = 2 hours
```

### Physical Placement

Position the NFC antenna where users can easily tap with their phone:

```
┌─────────────────────────────────┐
│                                 │
│     ┌───────────────────┐       │
│     │                   │       │
│     │    E-ink          │       │
│     │    Display        │       │
│     │                   │       │
│     │                   │       │
│     └───────────────────┘       │
│                                 │
│  📱 Tap here    ┌─────┐         │
│  (mark on       │ NFC │         │
│   frame)        │ TAG │         │
│                 └─────┘         │
│           (behind frame)        │
└─────────────────────────────────┘
```

**Important placement notes:**
- Do NOT place behind metal (blocks NFC)
- Keep within 2-3cm of frame surface
- Consider adding a subtle "tap here" icon on the frame

### Wiring Details

#### TPL5110 Connections

| TPL5110 Pin | Connect To | Notes |
|-------------|------------|-------|
| VDD | Battery + | Direct from LiPo (3.7V) |
| GND | Battery - | Common ground |
| DRV | Diode-OR input 1 | Via 1N4148 diode |
| DONE | ESP32 GPIO | Any available GPIO |
| DELAY | Trimpot (included) | Adjust for wake interval |

#### NFC TAG 2 CLICK (NT3H2111) Connections

| NFC TAG 2 Pin | Connect To | Notes |
|---------------|------------|-------|
| VCC | 3.3V | Required for I²C and FD operation |
| GND | Battery - | Common ground |
| FD | Diode-OR input 2 | Field Detection - goes HIGH on NFC tap |
| SDA | ESP32 I²C (optional) | For reading/writing NFC data |
| SCL | ESP32 I²C (optional) | For reading/writing NFC data |
| VOUT | Not used | Energy harvest output (alternative to FD) |
| SDA/SCL | ESP32 I²C (optional) | Only if reading NFC data |

#### Diode-OR Circuit

```
TPL5110 DRV ────►|────┬────► P-MOSFET Gate
                      │
NT3H2111 FD ────►|────┘

Diodes: 1N4148 (prevents backfeed between sources)
```

#### P-MOSFET Load Switch

| MOSFET Pin | Connect To |
|------------|------------|
| Source | Battery + |
| Gate | Diode-OR output |
| Drain | PowerBoost BAT+ |

Recommended: Si2301 or equivalent P-channel MOSFET with low Rds(on).

## Power Consumption: Upgraded System

### Sleep Mode (Complete Power-Off)

| Component | Current | Notes |
|-----------|---------|-------|
| TPL5110 | 20 μA | Timer running |
| NT3H2111 (NFC TAG 2) | 5 μA | Passive (no NFC field) |
| PowerBoost | 0 μA | Completely off |
| ESP32 | 0 μA | Completely off |
| **Total** | **~25 μA** | **120× better than current 3mA** |

### Wake Mode

Same as current system:
- WiFi connection: ~300mA for ~5 seconds
- Display refresh: ~500mA for ~30 seconds

## Battery Life Calculations

### Scenario 1: 2-Hour Wake Interval + Night Sleep

```
Day (05:00-00:00): 19h ÷ 2h = 9.5 wakes
Night (00:00-05:00): 0 wakes
Total: ~10 wakes/day

Sleep:   25μA × 24h = 0.6 mAh/day
Wake:    10 × 0.42mAh = 4.2 mAh/day
Display: 10 × 4.2mAh = 42 mAh/day (assuming every wake updates)
─────────────────────────
Total:   ~47 mAh/day

Battery life: 12000mAh ÷ 47 = 255 days ≈ 8.5 months
```

### Scenario 2: 2 Wakes/Day + NFC On-Demand

With NFC for on-demand wake, automatic updates can be reduced to minimum:

```
Auto wake: 2/day (morning + evening)
NFC wake: ~2/day average (user-triggered)
Total: ~4 wakes/day

Sleep:   25μA × 24h = 0.6 mAh/day
Wake:    4 × 0.42mAh = 1.7 mAh/day
Display: 4 × 4.2mAh = 16.8 mAh/day
─────────────────────────
Total:   ~19 mAh/day

Battery life: 12000mAh ÷ 19 = 631 days ≈ 1.7 years
```

### Scenario 3: Minimal Auto-Wake (2/day, minimal NFC use)

```
Sleep:   25μA × 24h = 0.6 mAh/day
Wake:    2 × 0.42mAh = 0.84 mAh/day
Display: 2 × 4.2mAh = 8.4 mAh/day
─────────────────────────
Total:   ~10 mAh/day

Battery life: 12000mAh ÷ 10 = 1200 days ≈ 3.3 years
```

## Comparison Summary

| Configuration | Sleep Current | Wake Interval | Battery Life |
|---------------|---------------|---------------|--------------|
| Current (no TPL5110) | 3 mA | 15 min | ~3 months |
| Current + NFC only | 3 mA | On-demand | ~5.5 months max |
| TPL5110 + 2h interval | 25 μA | 2 hours | ~8 months |
| TPL5110 + NFC (4/day) | 25 μA | On-demand | ~1.7 years |
| TPL5110 + NFC (2/day) | 25 μA | On-demand | ~3.3 years |

## Firmware Modifications

### New GPIO Requirements

| GPIO | Function | Direction |
|------|----------|-----------|
| Existing GPIO 2 | Battery ADC | Input |
| New GPIO X | TPL5110 DONE | Output |
| New GPIO Y | NFC I²C SDA (optional) | Bidirectional |
| New GPIO Z | NFC I²C SCL (optional) | Output |

### Boot Sequence Changes

```c
void app_main(void) {
    // 1. Initialize hardware
    // 2. Read battery voltage
    // 3. Connect WiFi
    // 4. Check for new image
    // 5. Update display if needed
    // 6. Signal TPL5110 DONE

    // Signal completion to TPL5110
    gpio_set_level(TPL5110_DONE_PIN, 1);
    vTaskDelay(pdMS_TO_TICKS(100));  // Hold DONE high
    gpio_set_level(TPL5110_DONE_PIN, 0);

    // TPL5110 will cut power - no need for deep sleep
    // This line should never be reached
    while(1) { vTaskDelay(1000); }
}
```

### Key Differences from Current Code

1. **No `esp_deep_sleep()` call** - TPL5110 cuts power instead
2. **DONE signal** - Must pulse DONE pin high when finished
3. **No wake reason check** - Always cold boot (no RTC memory)
4. **Faster startup** - No need to restore deep sleep state

## User Experience

### Wake Triggers

| Trigger | Action | Response Time |
|---------|--------|---------------|
| Timer (2h default) | Auto-wake | Immediate |
| NFC tap | Manual wake | ~1 second |
| TPL5110 button | Manual wake (testing) | Immediate |

### NFC Wake Flow

```
1. User holds iPhone/Android near frame (no app needed!)
2. Phone's NFC field activates NT3H2111
3. FD (Field Detection) pin goes HIGH
4. Diode-OR triggers P-MOSFET
5. PowerBoost powers on
6. ESP32 boots (~3 seconds)
7. WiFi connects, fetches new image
8. Display updates (~20 seconds)
9. ESP32 signals DONE
10. TPL5110 cuts power
11. Total time: ~30 seconds
```

## Installation Checklist

### Hardware Assembly

- [ ] Solder voltage divider for TPL5110 timer (or use onboard trimpot)
- [ ] Connect TPL5110 VDD to battery +
- [ ] Connect TPL5110 GND to battery -
- [ ] Connect TPL5110 DRV to diode anode
- [ ] Connect NFC TAG 2 CLICK FD pin to diode anode
- [ ] Connect NFC TAG 2 CLICK VCC to 3.3V
- [ ] Connect diode cathodes together (OR output)
- [ ] Connect OR output to P-MOSFET gate
- [ ] Connect P-MOSFET source to battery +
- [ ] Connect P-MOSFET drain to PowerBoost BAT+
- [ ] Connect TPL5110 DONE to ESP32 GPIO
- [ ] Position NFC TAG 2 CLICK for easy phone access (not behind metal!)

### Firmware Updates

- [ ] Add TPL5110 DONE pin definition
- [ ] Replace `esp_deep_sleep()` with DONE signal
- [ ] Remove deep sleep wake reason handling
- [ ] Test power-off cycle
- [ ] Verify NFC wake works

### Testing

- [ ] Verify TPL5110 timer interval
- [ ] Verify NFC wake triggers correctly
- [ ] Measure sleep current (~25μA expected)
- [ ] Full discharge test to validate battery life

## Troubleshooting

### System Not Waking

1. Check TPL5110 VDD connection (needs 3-5V)
2. Verify trimpot is not at minimum (100ms)
3. Test DRV output with multimeter
4. Check P-MOSFET gate threshold voltage

### NFC Wake Not Working

1. Verify NFC TAG 2 CLICK has 3.3V power
2. Check FD pin connection to diode
3. Test with phone held very close (~1-2cm)
4. Verify diode orientation (cathode to MOSFET gate)
5. Check I²C pull-ups if FD needs configuration
6. Default FD behavior should work without I²C setup

### Short Battery Life

1. Measure actual sleep current
2. Check for current leaks (shorts)
3. Verify PowerBoost is completely off when sleeping
4. Ensure DONE signal is properly cutting power

### NT3H2111 I²C Issues (if using data features)

1. Default I²C address is 0x55
2. Requires 3.3V logic levels
3. Add 4.7kΩ pull-up resistors on SDA/SCL
4. Max I²C speed: 400kHz

## Bill of Materials

| Item | Quantity | Source | Price |
|------|----------|--------|-------|
| Adafruit TPL5110 | 1 | [Adafruit 3435](https://www.adafruit.com/product/3435) | $4.95 |
| NFC TAG 2 CLICK | 1 | [MikroE MIKROE-2462](https://www.mikroe.com/nfc-tag-2-click) | ~$20 |
| Si2301 P-MOSFET | 1 | DigiKey/Mouser | ~$0.50 |
| 1N4148 Diode | 2 | DigiKey/Mouser | ~$0.10 |
| Hookup wire | - | - | - |
| **Total** | | | **~$27** |

## References

- [Adafruit TPL5110 Guide](https://learn.adafruit.com/adafruit-tpl5110-power-timer-breakout)
- [TPL5110 Datasheet](https://www.ti.com/lit/ds/symlink/tpl5110.pdf)
- [NFC TAG 2 CLICK Product Page](https://www.mikroe.com/nfc-tag-2-click)
- [NT3H2111 Datasheet](https://www.nxp.com/docs/en/data-sheet/NT3H2111_2211.pdf)
- [PowerBoost 1000C Guide](https://learn.adafruit.com/adafruit-powerboost-1000c-load-share-usb-charge-boost)
