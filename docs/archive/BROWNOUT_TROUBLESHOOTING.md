# ESP32 Brownout Troubleshooting Guide

This document captures findings from brownout debugging session (January 2026).

## Symptoms

- Device enters boot loop with ~30 second cycles instead of normal 5-minute sleep
- Display refresh stops halfway through (partial screen update visible)
- Server logs show rapid reconnections without "no_update_needed" status
- Works fine on USB power, fails on battery

## Root Causes

### Primary: Battery Charge Level
The LiPo battery couldn't deliver sufficient peak current for simultaneous WiFi + display operations.

| Battery Level | Peak Current Capacity | Result |
|---------------|----------------------|--------|
| 100% (4.2V+) | High | Works |
| 70-80% (~3.9V) | Marginal | May brownout |
| <70% (~3.7V) | Low | Likely brownout |

### Secondary: Code Timing Issues
The OTA implementation changed `report_device_status()` to use slow battery reading:

| Function | Time | Impact |
|----------|------|--------|
| `read_battery_raw()` | ~1ms | Safe - WiFi shuts down quickly |
| `read_battery_voltage()` | ~100ms+ | Risky - delays WiFi shutdown |

When status report is called before WiFi shutdown, the slow read delays shutdown, meaning WiFi (~200mA) is still active when display refresh starts (>1A peak), causing combined current to exceed battery capacity.

## Diagnosis

### Check Server Logs
```bash
ssh chris@serverpi.local "docker logs --tail 50 --timestamps glance-server 2>&1 | grep 'Device esp32'"
```

**Brownout pattern:**
- Connections every ~30-35 seconds (should be 5 minutes)
- Status shows "connected" but rarely "no_update_needed"
- Image download starts but device reboots before completion

**Normal pattern:**
- Connections every ~5 minutes (or 30s when charging)
- Status shows "connected" followed by "no_update_needed"

### Check Battery Voltage
Look for voltage readings in server logs:
- **Good:** 3.9V+ (should work)
- **Marginal:** 3.7-3.9V (may brownout under load)
- **Critical:** <3.7V (will likely brownout)

## Solutions

### Immediate Fix: Charge Battery
Simply charging the battery to 100% resolves the issue.

### Code Fixes Applied

1. **Fast battery read in status reports** ([main.c:404](../esp32-client/gooddisplay-clean/src/main.c#L404))
   ```c
   // Use FAST battery read (single ADC sample) to avoid delaying WiFi shutdown
   float battery_voltage = read_battery_raw();
   ```

2. **WiFi shutdown before display** ([main.c:885](../esp32-client/gooddisplay-clean/src/main.c#L885))
   ```c
   esp_wifi_disconnect();
   esp_wifi_stop();
   vTaskDelay(pdMS_TO_TICKS(100));  // 100ms delay
   ```

3. **Brownout recovery mode** ([main.c:1054](../esp32-client/gooddisplay-clean/src/main.c#L1054))
   - After 3 consecutive brownouts, device sleeps for 6 hours
   - Prevents infinite boot loop

### Hardware Considerations

- **Battery capacity:** 2000mAh+ recommended with >=10C discharge rate
- **Decoupling capacitor:** 1000-4700μF near display helps with peak current
- **Display refresh:** Draws >1A peak current

### Hardware Fix: Supercapacitor + Boost Converter

For persistent brownout issues at lower battery levels, adding a supercapacitor provides instant peak current delivery that batteries can't match due to internal resistance.

#### Why Supercapacitors Help

| Component | Internal Resistance | Peak Current | Role |
|-----------|---------------------|--------------|------|
| LiPo Battery | 50-150mΩ | Limited by chemistry | Average power |
| Supercapacitor | 10-50mΩ | Very high (10A+) | Peak bursts |

The supercap handles >1A display refresh peaks while the battery provides average current (~200mA).

#### Recommended Setup

```
                    ┌─────────────┐
Battery+ ──────────►│  MiniBoost  │──┬── Supercap+ ──┬── ESP32/Display VIN
                    │  (3.7→5V)   │  │               │
Battery- ──────────►│             │──┴── Supercap- ──┴── GND
                    └─────────────┘
```

**Place supercapacitor AFTER the boost converter** (on 5V output side):
- Supercap delivers 5V peaks directly to load
- Boost converter only handles average current
- No voltage conversion delay during peaks

#### Component Recommendations

| Component | Spec | Notes |
|-----------|------|-------|
| **Supercapacitor** | 4.7-10F, 5.5V, low ESR (<100mΩ) | Handles ~1s of 1A draw |
| **Boost converter** | Adafruit PowerBoost 1000 or similar | 3.7V→5V, 1A continuous |
| **Electrolytic cap** | 100-1000μF | At display power pins for high-freq noise |

#### Specific Part Options

**Budget ($2-5):**
- Generic 4.7F 5.5V supercap (AliExpress/Amazon)
- Look for "low ESR" versions

**Better quality ($5-15):**
- Eaton/Bussmann KR series (1-10F, very low ESR)
- Panasonic Gold Cap (1-5.5F)
- Maxwell/KEMET (excellent ESR)

#### Benefits

With supercapacitor installed:
- Can use more of battery capacity (down to 50-60% instead of 70%)
- Display refresh succeeds even at lower voltages
- Eliminates brownout boot loops
- Reduces stress on battery (longer lifespan)

## Timeline of Changes

| Commit | Date | Change | Impact |
|--------|------|--------|--------|
| `de2a99d` | Jan 3 | Pre-OTA baseline | Working |
| `08e7b3d` | Jan 3 | Added OTA, changed to slow battery read | Brownouts at low battery |
| `922d4c5` | Jan 4 | Removed status report before display | Partial fix |
| `de5ffbd` | Jan 4 | Use fast battery read in all status reports | Full fix |

## Testing Procedure

To verify if brownout is code-related or battery-related:

1. **Charge battery to 100%**
2. **Flash "broken" firmware** (with slow battery read)
3. **Test on battery** - if it works, battery was the issue
4. **Discharge to ~70%** and test again - if brownout occurs, code fix helps

## Key Files

- [main.c](../esp32-client/gooddisplay-clean/src/main.c) - Main firmware with battery monitoring
- [ota.c](../esp32-client/gooddisplay-clean/src/ota.c) - OTA update logic
- [BATTERY_MONITORING.md](./BATTERY_MONITORING.md) - Battery system details

## Quick Commands

```bash
# Monitor device on battery
ssh chris@serverpi.local "docker logs -f glance-server 2>&1 | grep 'Device esp32'"

# Check last 20 connections with timestamps
ssh chris@serverpi.local "docker logs --tail 100 --timestamps glance-server 2>&1 | grep 'Device esp32' | tail -20"

# Flash firmware via USB
cd esp32-client/gooddisplay-clean
WIFI_SSID="Internett" WIFI_PASSWORD="Yellowfinch924" DEVICE_ID="esp32-b04970" \
pio run --target upload --upload-port /dev/cu.usbserial-*

# Build only (no flash)
pio run --environment esp32s3
```
