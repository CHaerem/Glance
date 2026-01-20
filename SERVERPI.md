# ServerPI Setup Documentation

This document describes the serverpi Raspberry Pi 4 setup that runs the Glance server and other home automation services.

## Hardware

### Raspberry Pi 4
- **Model**: Raspberry Pi 4
- **OS**: Raspberry Pi OS (64-bit, headless)
- **Hostname**: `serverpi.local`
- **Location**: Wall-mounted next to home office

### Display Hardware
- **Display**: MHS35 3.5" TFT LCD (480x320 resolution)
- **Controller**: ILI9486 via SPI
- **Touchscreen**: XPT2046/ADS7846 resistive touch
- **Framebuffer**: `/dev/fb1` (fb_ili9486 driver)
- **Case**: [The Pi Hut Raspberry Pi 4 Metal Case with 3.5" TFT Touchscreen](https://thepihut.com/products/raspberry-pi-4-metal-case-with-3-5-tft-touchscreen-480x320)

**Display Limitations**:
- Backlight is hardwired, no software control available
- `/sys/class/backlight` directory exists but is empty (no device)
- Framebuffer blank (`/sys/class/graphics/fb1/blank`) not implemented
- `xset dpms` has no effect
- CSS opacity is the only way to visually dim the screen

### Display Configuration
**Boot config** (`/boot/firmware/config.txt`):
```
dtparam=spi=on
dtparam=i2c_arm=on
dtoverlay=mhs35:rotate=270

# Touchscreen
dtoverlay=ads7846,cs=1,penirq=17,penirq_pull=2,speed=1000000,swapxy=1,pmax=255,xohms=60
```

**X Server** (`/etc/X11/xorg.conf.d/99-fbdev.conf`):
```
Section "Device"
  Identifier "mhs35"
  Driver "fbdev"
  Option "fbdev" "/dev/fb1"
  Option "ShadowFB" "off"
EndSection

Section "Monitor"
  Identifier "mhs35 monitor"
EndSection

Section "Screen"
  Identifier "mhs35 screen"
  Device "mhs35"
  Monitor "mhs35 monitor"
  DefaultDepth 16
EndSection

Section "ServerLayout"
  Identifier "mhs35 layout"
  Screen "mhs35 screen"
EndSection
```

**Touchscreen Calibration** (`/etc/X11/xorg.conf.d/99-calibration.conf`):
```
Section "InputClass"
        Identifier      "calibration"
        MatchDriver     "evdev"
        Option  "Calibration"   "329 3961 3802 273"
        Option  "SwapAxes"      "1"
EndSection
```

## Networking

### Tailscale VPN
- **Tailscale IP**: `100.108.19.115`
- **Magic DNS**: `serverpi.ts.net`
- **Configured as**: Subnet router and exit node
- **Advertised routes**: `192.168.1.0/24` (local network)

**Tailscale Configuration**:
- Tailscale installed and running as systemd service
- SSH access via: `tailscale ssh chris@100.108.19.115` or `ssh chris@serverpi.local`
- ACLs configured in Tailscale admin console

**Useful Commands**:
```bash
# Check Tailscale status
tailscale status

# Check advertised routes
tailscale status --json | jq .Self.AllowedIPs

# Re-authenticate if needed
tailscale up --advertise-routes=192.168.1.0/24 --advertise-exit-node --accept-routes
```

### Local Network
- **Local IP**: DHCP assigned on `192.168.1.x`
- **mDNS**: `serverpi.local`
- **WiFi**: Connected to home network

## Docker Setup

### Docker Installation
- **Docker**: Installed via official Docker repository
- **Docker Compose**: Installed via pip3
- **Services**: Managed via docker-compose.yml

### Docker Services

**Glance Project** (`~/glance/docker-compose.yml`):
```yaml
services:
  glance-server:
    image: chaerem/glance-server:sha-<commit>
    container_name: glance-server
    ports:
      - "3000:3000"
    volumes:
      - glance-data:/app/data
      - glance-uploads:/app/uploads
      - huggingface-cache:/home/glance/.cache/huggingface
    environment:
      - NODE_ENV=production
      - PORT=3000
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - QDRANT_URL=http://qdrant:6333
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: glance-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant-data:/qdrant/storage
    restart: unless-stopped
```

**Named Volumes**:
- `glance-data` - SQLite database and application data
- `glance-uploads` - User-uploaded images and artwork
- `huggingface-cache` - Cached AI models
- `qdrant-data` - Vector database storage

### Service Ports
- **3000**: Glance web UI and API
- **6333**: Qdrant HTTP API
- **6334**: Qdrant gRPC API

## User Configuration

### User: chris
- **Home**: `/home/chris`
- **Groups**: Standard user groups + docker
- **Shell**: bash
- **SSH**: Key-based authentication configured

**Docker Access**:
```bash
# chris user is in docker group
sudo usermod -aG docker chris
```

## Kiosk Mode (Optional)

A systemd service exists for running a kiosk on the touchscreen display:

**Kiosk Service** (`/etc/systemd/system/kiosk.service`):
```
[Unit]
Description=Glance Kiosk Mode on Touchscreen
After=multi-user.target network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=chris
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/chris/.Xauthority
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/startx -- -nocursor vt1
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Kiosk Startup Script** (`~/kiosk/start-kiosk.sh`):
```bash
#!/bin/bash
xset s off
xset -dpms
xset s noblank
unclutter -idle 1 -root &
matchbox-window-manager -use_titlebar no &
sleep 2
chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --window-size=480,320 \
  --window-position=0,0 \
  http://localhost:3000/your-dashboard-url
```

**Kiosk Commands**:
```bash
# Start kiosk
sudo systemctl start kiosk.service

# Stop kiosk
sudo systemctl stop kiosk.service

# Enable on boot
sudo systemctl enable kiosk.service

# Disable on boot
sudo systemctl disable kiosk.service

# Check status
sudo systemctl status kiosk.service
```

## CI/CD Deployment

The Glance project uses GitHub Actions for automated deployment:

**Deployment Process**:
1. Push to main branch triggers CI/CD
2. Tests run in GitHub Actions
3. Docker image built and tagged with commit SHA
4. Image pushed to Docker Hub (`chaerem/glance-server`)
5. SSH into serverpi via Tailscale
6. Pull new image and restart services
7. Old Docker images automatically pruned
8. Kiosk service restarted if enabled

**Manual Deployment**:
```bash
# On serverpi
cd ~/glance
git pull  # If deploying from local changes
IMAGE_VERSION=sha-<commit> docker compose pull
IMAGE_VERSION=sha-<commit> docker compose up -d
docker image prune -af  # Clean up old images
```

## Maintenance Commands

### Docker Maintenance
```bash
# View logs
docker logs glance-server -f
docker logs glance-qdrant -f

# Restart services
cd ~/glance
docker compose restart

# Clean up disk space
docker system prune -af --volumes

# Check disk usage
df -h
docker system df
```

### System Maintenance
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Reboot
sudo reboot

# Check system resources
htop
free -h
df -h

# Check service status
systemctl status docker
systemctl status tailscaled
systemctl status kiosk.service
```

### Troubleshooting
```bash
# If disk fills up (happens due to Docker images accumulating)
docker image prune -af
docker volume prune
docker system prune -af --volumes

# If Glance server won't start
cd ~/glance
docker compose logs glance-server
docker compose restart glance-server

# If display not working
ls -l /dev/fb*
cat /boot/firmware/config.txt | grep mhs35
dmesg | grep -i fb_ili9486

# If touchscreen not working
DISPLAY=:0 xinput list
cat /etc/X11/xorg.conf.d/99-calibration.conf
```

## Environment Variables

**Required for Glance**:
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `IMAGE_VERSION` - Docker image tag (usually `sha-<commit>`)

**Optional**:
- `HF_TOKEN` - Hugging Face token for model downloads
- `DOCKER_USERNAME` - Docker Hub username (defaults to `chaerem`)

## Security Notes

- Container runs as non-root user (UID 1001, username: glance)
- No privileged mode required
- Tailscale provides encrypted VPN access
- SSH via Tailscale uses key-based authentication
- Docker socket access limited to docker group
- Firewall rules managed by Tailscale and UFW

## Network Services Exposed

**Locally**:
- Port 3000: Glance web UI (HTTP)
- Port 6333: Qdrant HTTP API
- Port 6334: Qdrant gRPC API
- Port 22: SSH (Tailscale only)

**Via Tailscale**:
- All services accessible from Tailscale network
- MagicDNS: `serverpi.ts.net`
- Subnet router: Exposes local network (`192.168.1.0/24`) to Tailscale

## File Locations

**Glance Project**:
- Code: `~/glance/`
- Docker Compose: `~/glance/docker-compose.yml`
- Data Volume: Docker named volume `glance-data`
- Uploads Volume: Docker named volume `glance-uploads`

**Kiosk (if using)**:
- Scripts: `~/kiosk/`
- Systemd service: `/etc/systemd/system/kiosk.service`
- X11 configs: `/etc/X11/xorg.conf.d/`

**System**:
- Boot config: `/boot/firmware/config.txt`
- Device tree overlays: `/boot/firmware/overlays/`
- Framebuffer devices: `/dev/fb0`, `/dev/fb1`
- Display sysfs: `/sys/class/graphics/fb1/`

## Home Assistant Kiosk Setup

Home Assistant is running in Docker on serverpi, displaying a status dashboard on the touchscreen.

### Current Setup

**Docker Service** (in `~/glance/docker-compose.yml`):
```yaml
homeassistant:
  image: ghcr.io/home-assistant/home-assistant:stable
  container_name: homeassistant
  network_mode: host
  volumes:
    - homeassistant-config:/config
    - /etc/localtime:/etc/localtime:ro
    - /run/dbus:/run/dbus:ro
  environment:
    - TZ=Europe/Oslo
  restart: unless-stopped
  privileged: true
```

**Kiosk URL**: `http://localhost:8123/kiosk/status?kiosk=1`

**Features**:
- Auto-login via trusted networks (no password for local access)
- Dark theme for always-on display
- Kiosk mode (header/sidebar hidden via [kiosk-mode plugin](https://github.com/NemesisRE/kiosk-mode))
- Weather from Met.no integration
- GitHub Actions workflow status (personal repos + 3lvia org)

### Key Configuration Files

| File | Purpose |
|------|---------|
| `/config/configuration.yaml` | Main HA config with trusted networks auth |
| `/config/secrets.yaml` | GitHub token for Actions monitoring |
| `/config/themes/dark.yaml` | Dark theme for kiosk |
| `/config/scripts/check_github_actions.py` | Script to check workflow status |
| `/config/.storage/lovelace.kiosk` | Kiosk dashboard config |
| `/config/www/kiosk-mode.js` | Plugin to hide header/sidebar |

### Access

- **Local**: `http://serverpi.local:8123`
- **Tailscale**: `http://100.108.19.115:8123`

### Dashboard Tips

1. **Resolution**: Design for 480x320 pixels (landscape)
2. **Touch**: Use large touch targets (min 44x44px)
3. **Calibration**: Touchscreen calibrated for finger/stylus use
4. **Dimming**: Implement CSS opacity dimming (backlight can't be controlled)
5. **Auto-start**: Kiosk service auto-starts on boot
6. **Performance**: Keep UI simple, Chromium runs in kiosk mode
