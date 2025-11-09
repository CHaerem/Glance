# Display Dimming for MHS35 Touchscreen

## Hardware Limitation

**The MHS35 3.5" LCD does not support software-controllable backlight.** This is a limitation of small SPI TFT displays - the backlight is hardwired and always on when the display has power.

After investigation, we found:
- `/sys/class/backlight` directory exists but is empty (no backlight device)
- The MHS35 device tree overlay does not expose backlight control
- `xset dpms force off` does not affect the backlight
- Small SPI displays typically don't have controllable backlights

## Current Solution: CSS Opacity Dimming

The dashboard uses CSS opacity to visually dim the screen after 30 seconds of inactivity:
- Sets `opacity: 0.01` on the body element
- Screen appears nearly black
- **Note**: The backlight physically remains on (minimal light emission)
- Touch interaction restores full brightness instantly

This is the best achievable solution without hardware modification

## No Setup Required

The CSS dimming works automatically - no configuration needed. Just deploy:

```bash
cd ~/glance
docker compose up -d
```

The dashboard at `http://serverpi:3000/dashboard` will automatically dim after 30 seconds of inactivity.

## Hardware Modification Alternative

If you need true backlight control (to completely eliminate light emission), you would need to:

1. **Identify the backlight power line** on the MHS35 PCB
2. **Add a MOSFET/transistor** controlled by a GPIO pin
3. **Wire GPIO control** from the Raspberry Pi to the transistor
4. **Update software** to control the GPIO pin

**Warning**: This requires:
- Soldering skills
- Understanding of electronics
- Potentially voiding warranty
- Risk of damaging the display

For most use cases, the CSS opacity dimming is sufficient.

## How CSS Dimming Works

1. Dashboard JavaScript monitors touch/click events
2. After 30 seconds of no interaction, adds `dimmed` class to body
3. CSS applies `opacity: 0.01` - screen appears nearly black
4. Any touch/click removes the `dimmed` class instantly
5. Screen returns to full brightness

The dimmed screen still emits minimal backlight, but is visually dark enough for most ambient/calm display purposes.
