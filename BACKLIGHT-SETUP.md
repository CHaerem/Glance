# Backlight Control Setup

This document explains how to set up secure backlight control for the touchscreen dashboard.

## Security Design

The Glance server needs to control the LCD backlight to dim the screen after inactivity. Instead of running the container as root (insecure), we use Linux udev rules to grant specific permissions to the video group.

**Security benefits:**
- Container runs as non-root user (UID 1001)
- Only has write access to backlight device (not full system)
- Uses principle of least privilege
- Follows Linux security best practices

## Setup Instructions

### One-Time Setup on serverpi

Run this command on your serverpi (Raspberry Pi) **once** to configure permissions:

```bash
# Make the setup script executable and run it
chmod +x setup-backlight-permissions.sh
./setup-backlight-permissions.sh
```

This script:
1. Creates a udev rule at `/etc/udev/rules.d/99-backlight.rules`
2. Makes backlight brightness files writable by the `video` group (GID 44)
3. Applies permissions to existing backlight devices
4. Reloads udev rules

### Deploy with Docker Compose

After running the setup script, deploy normally:

```bash
cd ~/glance
docker compose up -d
```

The container will run as the `glance` user (non-root) with access to the `video` group, allowing it to control backlight brightness.

## How It Works

1. **udev rule**: When a backlight device is detected, udev automatically sets group ownership to `video` and makes it group-writable
2. **Docker user mapping**: Container runs as UID 1001 (glance) with supplementary GID 44 (video)
3. **File access**: The glance user can write to `/sys/class/backlight/*/brightness` via video group membership
4. **Backlight API**: Server endpoint `/api/backlight` writes `0` (off) or `255` (on) to the brightness file
5. **Dashboard**: After 30s of inactivity, calls API to turn off backlight; touch turns it back on

## Verification

Check that permissions are correct:

```bash
# Check udev rule exists
cat /etc/udev/rules.d/99-backlight.rules

# Check backlight device permissions
ls -l /sys/class/backlight/*/brightness
# Should show: -rw-rw-r-- 1 root video ...
```

## Troubleshooting

**Backlight not dimming:**

1. Check container logs:
   ```bash
   docker logs glance-server | grep -i backlight
   ```

2. Verify permissions:
   ```bash
   ls -l /sys/class/backlight/*/brightness
   ```
   Should show group `video` with write permission.

3. Test manually inside container:
   ```bash
   docker exec -it glance-server sh
   echo 0 > /sys/class/backlight/*/brightness  # Should dim
   echo 255 > /sys/class/backlight/*/brightness  # Should brighten
   ```

**Permission denied errors:**

Re-run the setup script:
```bash
./setup-backlight-permissions.sh
```

Then restart the container:
```bash
docker compose restart glance-server
```
