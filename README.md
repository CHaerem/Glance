# 🖼️ Glance - ESP32 E-Ink Display

> A battery-powered, WiFi-enabled e-ink display that fetches and displays images from a remote server with intelligent power management.

## ✨ Features

🔋 **Ultra-Low Power** - Months of battery life with deep sleep cycles  
🌐 **Remote Updates** - Fetch images wirelessly from your server  
🎨 **6-Color Display** - Beautiful Spectra 6 e-paper technology  
📱 **Web Dashboard** - Manage images and schedules remotely  
⚡ **Smart Scheduling** - Server controls update frequency

## 🛠️ Hardware

| Component           | Model                     | Purpose                   |
| ------------------- | ------------------------- | ------------------------- |
| **Microcontroller** | ESP32 HUZZAH32 Feather    | WiFi + Processing         |
| **Display**         | Waveshare 13.3" Spectra 6 | 1200×1600 6-color e-paper |
| **Power**           | LiPo Battery              | Portable operation        |
| **Interface**       | SPI + GPIO                | Display communication     |

## 🔌 Connections

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

### 🔧 Development Setup

```bash
1. Connect ESP32 to e-paper HAT using pin mapping
2. Power via USB cable
3. Flash firmware to ESP32
4. Reset to see display update
```

### 🔋 Production Deployment

```bash
1. Configure WiFi credentials in firmware
2. Set up remote image service API
3. Connect LiPo battery to BAT pin
4. Deploy - device runs autonomously
```

## 📁 Project Structure

```
src/
├── main.cpp                    # Core application
├── bhutan_flag_fullscreen.h    # Demo image data
└── [libraries]                 # Waveshare e-paper drivers
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

### 📱 Remote Service

- [ ] Web dashboard for image management
- [ ] Scheduled updates with custom intervals
- [ ] Multi-device support
- [ ] User authentication & device pairing

### 🔋 Advanced Power

- [ ] Battery voltage monitoring
- [ ] Adaptive sleep based on battery level
- [ ] Solar charging support
- [ ] Manual wake triggers

### 🌟 Smart Features

- [ ] Weather integration
- [ ] Calendar synchronization
- [ ] Multi-zone content areas
- [ ] Robust error handling

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
