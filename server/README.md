# **🏴 Flag Display Server**

This server, hosted on GitHub Pages, provides static assets and metadata for displaying flags dynamically on an ESP32 e-ink screen. It works in conjunction with Google Sheets for state management, ensuring the "current flag" being displayed can be dynamically updated and accessed.

---

## **✨ Features**

1. **📁 Static Hosting**:

   - Serves flag images in BMP format for the ESP32 e-ink display.
   - Provides JSON metadata for each flag, including details such as country name, population, and region.

2. **📄 Dynamic Metadata Info Page**:

   - Includes an `info.html` page that dynamically fetches and displays metadata for the "current flag" being displayed.

3. **🔗 Integration with Google Sheets**:

   - Relies on a Google Sheets-powered API to determine the "current flag."

4. **ℹ️ Metadata Info Page**:
   - **URL**: `/info.html`
   - **Description**: Displays metadata for the currently displayed flag based on the value stored in Google Sheets.

---

## **📂 Server Structure**

### **📁 Directory Layout**

server/
├── flags/ # Flag images in BMP format
│ ├── norway.bmp
│ ├── sweden.bmp
│ ├── denmark.bmp
│ └── …
├── info/ # Metadata for each flag in JSON format
│ ├── norway.json
│ ├── sweden.json
│ ├── index.json # List of all available flags
│ └── current_flag.json # Tracks the “current flag”
├── index.html # Main page (optional)
├── info.html # Metadata info page for the current flag
├── script.js # JavaScript for dynamic functionality
└── style.css # Styles for the pages

---

## **🌐 Endpoints**

### **1. 🏴 Flag Images**

- **URL**: `/flags/<flag>.bmp`
- **Description**: Serves the BMP image for a specific flag.
- **Example**: `/flags/norway.bmp`

### **2. 📄 Metadata**

- **URL**: `/info/<flag>.json`
- **Description**: Provides JSON metadata for a specific flag.
- **Example**: `/info/norway.json`

#### **Example JSON File**:

```json
{
	"country": "Norway",
	"official_name": "Kingdom of Norway",
	"population": 5379475,
	"area": 385207,
	"capital": "Oslo",
	"region": "Europe",
	"subregion": "Northern Europe",
	"languages": "Norwegian",
	"currencies": "Norwegian Krone (NOK)",
	"timezones": "UTC+01:00",
	"borders": "SWE, FIN, RUS"
}
```

### **3. 📄 Index of Flags**

- **URL**: `/info/index.json`
- **Description**: Returns a JSON array of all available flags.

#### **Example Response**:

```json
["norway.json", "sweden.json", "denmark.json"]
```

### **4. ℹ️ Metadata Info Page**

- **URL**: `/info.html`
- **Description**: Displays metadata for the currently displayed flag based on the value stored in Google Sheets.

---

## **⚙️ How It Works**

1. The `info.html` page fetches the `current_flag.json` file.
2. It uses the value in `current_flag.json` to fetch the corresponding metadata JSON file (e.g., `/info/norway.json`).
3. Dynamically displays the metadata on the page.
