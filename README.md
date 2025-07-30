# 🖼️ Glance - ESP32 E-Ink Display

> A battery-powered, WiFi-enabled e-ink display that fetches and displays images from a local server with intelligent power management.

## ✨ Features

🔋 **Ultra-Low Power** - Months of battery life with deep sleep cycles  
🌐 **Local Server** - No cloud dependencies, runs on your Raspberry Pi  
🎨 **6-Color Display** - Beautiful Spectra 6 e-paper technology  
📱 **Web Dashboard** - Manage images and monitor devices locally  
⚡ **Smart Scheduling** - Server controls update frequency  
🐳 **Docker Ready** - Easy deployment with published Docker images

## 🛠️ Hardware

| Component           | Model                     | Purpose                   |
| ------------------- | ------------------------- | ------------------------- |
| **Microcontroller** | ESP32 HUZZAH32 Feather    | WiFi + Processing         |
| **Display**         | Waveshare 13.3" Spectra 6 | 1200×1600 6-color e-paper |
| **Power**           | LiPo Battery              | Portable operation        |
| **Interface**       | SPI + GPIO                | Display communication     |

## 🔌 Connections

> **Note**: This project now includes comprehensive test coverage and automated deployment via GitHub Actions with Tailscale integration.

<details>
<summary><strong>📍 Pin Mapping</strong></summary>

| ESP32 Pin | HAT+ Pin | Cable Color | Function           |
| --------- | -------- | ----------- | ------------------ |
| 21        | PWR      | 🔘 GRAY     | Power Control      |
| 15        | BUSY     | 🟤 BROWN    | Busy Signal        |
| 4         | RST      | 🟣 PURPLE   | Reset              |
| 17        | DC       | ⚪ WHITE    | Data/Command       |
| 16        | CS_S     | 🟢 GREEN    | Chip Select Slave  |
| 5         | CS_M     | 🟠 ORANGE   | Chip Select Master |
| SCK (18)  | CLK      | 🟡 YELLOW   | SPI Clock          |
| MOSI (23) | DIN      | 🔵 BLUE     | SPI Data In        |
| GND       | GND      | ⚫ BLACK    | Ground             |
| 3V        | VCC      | 🔴 RED      | Power Supply       |

</details>

<details>
<summary><strong>⚡ Power Setup</strong></summary>

**🔧 Development Mode**

```
HAT+ VCC → ESP32 3V pin
Power via USB cable
```

**🔋 Production Mode**

```
LiPo battery → ESP32 BAT pin
HAT+ VCC → ESP32 3V pin
```

</details>

## 🏗️ How It Works

```mermaid
graph LR
    A[😴 Deep Sleep] --> B[⏰ Wake Up]
    B --> C[📶 Connect WiFi]
    C --> D[📥 Fetch Image]
    D --> E[🖼️ Update Display]
    E --> F[💤 Calculate Sleep]
    F --> A
```

### 🔄 Operation Cycle

1. **😴 Deep Sleep** - Ultra-low power mode (10μA)
2. **📶 WiFi Connect** - Quick reconnect with saved credentials
3. **📥 Image Fetch** - Download optimized image + schedule
4. **🖼️ Display Update** - Refresh e-paper display (~30s)
5. **💤 Sleep Timer** - Server determines next wake time

## 🚀 Quick Start

### 🥧 Deploy Server (Raspberry Pi)

```bash
# Option 1: One-command deployment
./deploy-to-pi.sh raspberrypi.local your-dockerhub-username

# Option 2: Manual deployment
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data your-username/glance-server:latest
```

### 🌐 Web Dashboard
**Access:** `http://your-pi-ip:3000`

Manage your e-ink displays with a beautiful web interface:
- 🖼️ Upload and optimize images for e-paper
- ⏰ Schedule automatic updates with smart timing
- 📊 Monitor device status and battery levels
- 📋 View ESP32 logs in real-time
- 🔧 Configure display settings

### 🔧 ESP32 Setup

```bash
# Navigate to ESP32 client directory
cd esp32-client/

# Configure WiFi and server IP
nano build.sh    # Set WIFI_SSID and WIFI_PASSWORD
nano config.h    # Set your Pi's IP address

# Build and upload
./build.sh
```

### 🔋 Production Deployment

```bash
1. Set up Raspberry Pi with Docker
2. Deploy Glance server container
3. Configure ESP32 with WiFi credentials
4. Connect LiPo battery to ESP32
5. Deploy - system runs autonomously
```

## 🔄 Updating the Server

Pushing changes to the **`main`** branch automatically builds and deploys a new
Docker image:

1. GitHub Actions runs the full test suite and builds a multi-architecture image.
2. The image is pushed to Docker Hub and tagged with the commit SHA.
3. Using Tailscale SSH, the workflow updates the Raspberry Pi with
   `docker compose pull` and `docker compose up -d`.
4. Check the running version with:

```bash
docker compose exec glance-server env | grep IMAGE_VERSION
```

To deploy a specific commit manually, run:

```bash
IMAGE_VERSION=<sha> ./deploy-to-pi.sh serverpi.local your-dockerhub-username
```

## 📁 Project Structure

```
glance/
├── esp32-client/              # ESP32 firmware
│   ├── glance_client.cpp     # Main ESP32 application
│   ├── config.h              # Hardware configuration
│   ├── build.sh              # Build script
│   └── platformio.ini        # PlatformIO config
├── server/                   # Local server
│   ├── server.js             # Express.js server
│   ├── package.json          # Node.js dependencies
│   └── Dockerfile            # Container build
├── scripts/                  # Deployment scripts
│   ├── build-and-push.sh     # Docker Hub publishing
│   └── local-build.sh        # Local development
└── docker-compose.yml        # Local development
```

## 🎨 Image Processing

- **🌈 6-Color Optimization** - Custom mapping for e-paper palette
- **✨ Floyd-Steinberg Dithering** - Smooth color transitions
- **📦 Server-Side Processing** - Reduces ESP32 workload
- **🗜️ Compressed Transfer** - Faster downloads
- **📺 Full Coverage** - 1150×1550 pixels (93% display area)

## 📊 Performance

| Metric                 | Value         | Notes                  |
| ---------------------- | ------------- | ---------------------- |
| **Display Resolution** | 1150×1550px   | 93% screen coverage    |
| **Refresh Time**       | 30-45 seconds | Full color update      |
| **Deep Sleep Current** | ~10μA         | Months of battery life |
| **Active Current**     | ~100mA        | During WiFi + display  |
| **Wake-up Time**       | 2-3 seconds   | To WiFi ready          |

## 🗺️ Roadmap

### 📱 Web Dashboard

- [x] Web dashboard for image management
- [x] Real-time device monitoring
- [x] ESP32 log viewing
- [x] Multi-device support
- [ ] User authentication & device pairing

### 🔋 Advanced Power

- [x] Battery voltage monitoring
- [x] Adaptive sleep based on battery level
- [ ] Solar charging support
- [ ] Manual wake triggers

### 🌟 Smart Features

- [ ] Weather integration
- [ ] Calendar synchronization
- [ ] Multi-zone content areas
- [x] Robust error handling
- [x] Local server deployment

---

## 📝 Development Notes

<details>
<summary><strong>⚠️ Important Considerations</strong></summary>

- E-ink displays require specific refresh sequences
- Partial updates limited compared to monochrome displays
- SPI uses dual-IC control for large display
- Power management critical for battery operation
- Floyd-Steinberg dithering provides professional quality

</details>

<details>
<summary><strong>📋 Display Specifications</strong></summary>

| Spec           | Value                     |
| -------------- | ------------------------- |
| **Resolution** | 1200×1600 pixels          |
| **Size**       | 13.3" diagonal            |
| **Technology** | Spectra 6 color e-paper   |
| **Interface**  | SPI with dual chip select |
| **Power**      | 3.3V operation            |

</details>
