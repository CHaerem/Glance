# **🏴 ESP32 Flag Display**

This project uses an ESP32 microcontroller and an e-ink display to dynamically fetch and display flags. The ESP32 interacts with Google Sheets to determine the "flag to display" and updates the current flag state after displaying it. Flag images and metadata are hosted on a GitHub Pages server.

---

## **✨ Features**

1. **Dynamic Flag Display**:

   - Fetches the flag to display based on the "requested flag" or "current flag" stored in Google Sheets.
   - Displays the flag image on an e-ink screen.

2. **Google Sheets Integration**:

   - Reads the "requested flag" and "current flag" from a Google Sheet via a REST API.
   - Updates the "current flag" in the Google Sheet after displaying the flag.

3. **GitHub Pages Integration**:

   - Fetches flag images (BMP) and metadata (JSON) hosted on a GitHub Pages server.

4. **Battery Efficiency**:
   - Utilizes deep sleep to conserve battery between updates.

---

## **🏗️ System Architecture**

- **Google Sheets**:

  - Tracks the "requested flag" (user-specified) and "current flag" (currently displayed).
  - Exposes a REST API for the ESP32 to interact with.

- **GitHub Pages**:

  - Hosts static assets for flags and metadata.

- **ESP32**:
  - Fetches and displays the flag.
  - Updates the state in Google Sheets.

---

## **📂 Project Structure**

### **Google Sheets**

| Cell | Value          |
| ---- | -------------- |
| A1   | Requested Flag |
| A2   | norway         |
| B1   | Current Flag   |
| B2   | sweden         |

---

## **⚙️ Setup Instructions**

### 1. **ESP32 Hardware Setup**

#### **Pin Layout**

| Pin  | Description                            | ESP32 Pin |
| ---- | -------------------------------------- | --------- |
| VCC  | Power (3.3V / 5V input)                | 3V        |
| GND  | Ground                                 | GND       |
| DIN  | SPI MOSI pin                           | 14        |
| SCLK | SPI SCK pin                            | 12        |
| CS   | SPI chip selection (low active)        | 15        |
| DC   | Data/Command selection (high for data) | 33        |
| RST  | External reset (low active)            | 27        |
| BUSY | Busy status output pin                 | 32        |

#### **Dependencies**

Install the following libraries in the Arduino IDE:

- [WiFi](https://github.com/arduino-libraries/WiFi)
- [HTTPClient](https://github.com/espressif/arduino-esp32/tree/master/libraries/HTTPClient)
- [ArduinoJson](https://arduinojson.org/)
- [GxEPD2](https://github.com/ZinggJM/GxEPD2) (for e-ink displays)

---

### 2. **Google Sheets Setup**

1. Create a Google Sheet with the following structure:

| Cell | Value          |
| ---- | -------------- |
| A1   | Requested Flag |
| A2   | norway         |
| B1   | Current Flag   |
| B2   | sweden         |

2. Add the provided Google Apps Script to expose the sheet as a REST API.

### 3. **GitHub Pages Setup**

Ensure flag images (`.bmp`) and metadata (`.json`) are hosted in the `/flags` and `/info` directories on your GitHub Pages server.

---

## **📋 ESP32 Workflow**

1. **Fetch State**:

   - Reads the "requested flag" or "current flag" from Google Sheets.

2. **Display Flag**:

   - Fetches the corresponding flag image (`/flags/<flag>.bmp`) and metadata (`/info/<flag>.json`) from GitHub Pages.
   - Displays the flag on the e-ink screen.

3. **Update State**:
   - Updates the "current flag" value in Google Sheets after successfully displaying the flag.
