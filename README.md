# **🏴 Flag Display with GitHub Pages and Google Sheets**

This project uses an ESP32 microcontroller and an e-ink display to dynamically showcase flags. The state (current flag and requested flag) is managed via Google Sheets, while GitHub Pages serves the flag images and metadata.

---

## **📋 Project Overview**

The project includes the following components:

1. **ESP32**:

   - Retrieves the "flag to display" from a Google Sheet via a lightweight REST API.
   - Displays the flag on an e-ink display.
   - Updates the "current flag" value in Google Sheets after displaying the flag.

2. **Google Sheets**:

   - Stores the state of the "requested flag" (user-specified) and the "current flag" (currently displayed).
   - Exposes the state via a simple Google Apps Script acting as a REST API.

3. **GitHub Pages**:
   - Hosts static resources:
     - Flag images (`/flags/<flag>.bmp`).
     - Metadata for each flag (`/info/<flag>.json`).
   - Provides an info page (`info.html`) to view metadata for the currently displayed flag.

---

## **✨ Features**

- **Dynamic Flag Display**:

  - The ESP32 fetches the flag to display dynamically from Google Sheets.
  - Supports manual updates via the "requested flag" field in the Google Sheet.

- **State Management**:

  - Google Sheets tracks:
    - **Requested Flag**: User-specified flag to display.
    - **Current Flag**: Flag currently displayed on the e-ink screen.

- **Metadata Info Page**:
  - GitHub Pages serves an info page (`info.html`) that fetches metadata for the current flag dynamically.

---

## **🏗️ System Architecture**

### 1. **ESP32 Workflow**

- **Fetch State**:
  - Retrieves the "requested flag" and "current flag" from Google Sheets.
- **Display Flag**:
  - Fetches the flag image and metadata from GitHub Pages.
  - Displays the flag on the e-ink screen.
- **Update State**:
  - Updates the "current flag" in Google Sheets after displaying the flag.

### 2. **Google Sheets**

- **State Management**:
  - Tracks the state in two fields:
    - `Requested Flag`: Manually updated by the user.
    - `Current Flag`: Automatically updated by the ESP32.
- **REST API**:
  - A Google Apps Script exposes these values via a simple JSON-based REST API.

### 3. **GitHub Pages**

- **Static Hosting**:
  - Hosts flag images and metadata.
  - Provides an info page to display metadata for the currently displayed flag.

---

## **📂 Project Structure**

### **Google Sheets**

| Cell | Value          |
| ---- | -------------- |
| A1   | Requested Flag |
| A2   | norway         |
| B1   | Current Flag   |
| B2   | sweden         |

### **GitHub Pages Directory**

```plaintext
server/
├── flags/
│   ├── norway.bmp
│   ├── sweden.bmp
│   ├── denmark.bmp
│   └── …
├── info/
│   ├── norway.json
│   ├── sweden.json
│   ├── index.json
│   └── current_flag.json
├── index.html
├── info.html
├── script.js
└── style.css
```

---

## **⚙️ Setup Instructions**

### 1. **ESP32 Setup**

- **Dependencies**:
  - Install the following libraries:
    - `WiFi`
    - `HTTPClient`
    - `ArduinoJson`
- **Configure Credentials**:
  - Add your Wi-Fi credentials in the ESP32 code.
  - Replace the Google Apps Script URL in the code with your deployment URL.

### 2. **Google Sheets Setup**

- **Create a Sheet**:
  - Add the columns for "Requested Flag" and "Current Flag."
- **Apps Script**:
  - Add the provided Google Apps Script to your sheet.
  - Deploy it as a Web App with public access.

### 3. **GitHub Pages Setup**

- **Deploy Static Resources**:
  - Upload your flag images and metadata to the appropriate directories.
  - Publish the repository using GitHub Pages.

---

## **🚀 Future Enhancements**

- **User Control**:
  - Allow users to rotate flags automatically or schedule updates via Google Sheets.
- **Real-Time Updates**:
  - Integrate WebSockets for instant updates (requires additional backend).
- **Analytics**:
  - Track flag usage or display history using a Google Sheet log.

---

## **📜 License**

This project is licensed under the MIT License. See the LICENSE file for details.

---

## **🤝 Contributions**

Contributions are welcome! Feel free to submit issues or pull requests.
