const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Helper functions
async function readJSONFile(filename) {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function writeJSONFile(filename, data) {
    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// API Routes

// Get current image/schedule for ESP32
app.get('/api/current.json', async (req, res) => {
    try {
        const current = await readJSONFile('current.json') || {
            title: 'Glance Display',
            image: '',
            imageId: '',
            timestamp: Date.now(),
            sleepDuration: 3600000000 // 1 hour in microseconds
        };
        
        res.json(current);
    } catch (error) {
        console.error('Error getting current:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update current image (for web interface or manual updates)
app.post('/api/current', async (req, res) => {
    try {
        const { title, image, sleepDuration } = req.body;
        
        const current = {
            title: title || 'Glance Display',
            image: image || '',
            imageId: image ? uuidv4() : '',
            timestamp: Date.now(),
            sleepDuration: sleepDuration || 3600000000 // 1 hour default
        };
        
        await writeJSONFile('current.json', current);
        
        // Log the update
        const devices = await readJSONFile('devices.json') || {};
        console.log(`Image updated: ${title} (${current.imageId})`);
        
        res.json({ success: true, current });
    } catch (error) {
        console.error('Error updating current:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Device status reporting (replaces GitHub Actions)
app.post('/api/device-status', async (req, res) => {
    try {
        const { deviceId, status } = req.body;
        
        if (!deviceId || !status) {
            return res.status(400).json({ error: 'deviceId and status required' });
        }
        
        // Load existing devices
        const devices = await readJSONFile('devices.json') || {};
        
        // Update device status
        devices[deviceId] = {
            ...status,
            lastSeen: Date.now(),
            deviceId
        };
        
        await writeJSONFile('devices.json', devices);
        
        console.log(`Device status updated: ${deviceId} - Battery: ${status.batteryVoltage}V, Signal: ${status.signalStrength}dBm`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating device status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ESP32 log reporting
app.post('/api/logs', async (req, res) => {
    try {
        const { deviceId, logs, logLevel } = req.body;
        
        if (!deviceId || !logs) {
            return res.status(400).json({ error: 'deviceId and logs required' });
        }
        
        // Load existing logs
        const allLogs = await readJSONFile('logs.json') || {};
        
        // Initialize device logs if not exists
        if (!allLogs[deviceId]) {
            allLogs[deviceId] = [];
        }
        
        // Add new log entry
        const logEntry = {
            timestamp: Date.now(),
            level: logLevel || 'INFO',
            message: logs,
            deviceTime: req.body.deviceTime || Date.now()
        };
        
        allLogs[deviceId].push(logEntry);
        
        // Keep only last 1000 log entries per device
        if (allLogs[deviceId].length > 1000) {
            allLogs[deviceId] = allLogs[deviceId].slice(-1000);
        }
        
        await writeJSONFile('logs.json', allLogs);
        
        console.log(`Log received from ${deviceId}: ${logs}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error storing logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get logs for a device
app.get('/api/logs/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit = 100 } = req.query;
        
        const allLogs = await readJSONFile('logs.json') || {};
        const deviceLogs = allLogs[deviceId] || [];
        
        // Return last N logs
        const logs = deviceLogs.slice(-parseInt(limit));
        
        res.json({ deviceId, logs });
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all logs
app.get('/api/logs', async (req, res) => {
    try {
        const allLogs = await readJSONFile('logs.json') || {};
        res.json(allLogs);
    } catch (error) {
        console.error('Error getting all logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all devices (for monitoring dashboard)
app.get('/api/devices', async (req, res) => {
    try {
        const devices = await readJSONFile('devices.json') || {};
        res.json(devices);
    } catch (error) {
        console.error('Error getting devices:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
});

// Simple web interface
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Glance Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; }
        .device { border: 1px solid #ccc; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .device.online { border-color: #4CAF50; }
        .device.offline { border-color: #f44336; }
        form { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        input, textarea, button { margin: 5px 0; padding: 8px; }
        textarea { width: 100%; height: 100px; }
        button { background: #007cba; color: white; border: none; padding: 10px 20px; cursor: pointer; }
        button:hover { background: #005a87; }
        .logs { background: #000; color: #0f0; font-family: monospace; padding: 10px; height: 300px; overflow-y: auto; border-radius: 5px; }
        .log-entry { margin: 2px 0; }
        .log-error { color: #f44336; }
        .log-warn { color: #ff9800; }
        .log-info { color: #4CAF50; }
        .tabs { margin: 20px 0; }
        .tab { display: inline-block; padding: 10px 20px; cursor: pointer; background: #f0f0f0; margin-right: 5px; }
        .tab.active { background: #007cba; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Glance E-Ink Display Server</h1>
        
        <div class="tabs">
            <div class="tab active" onclick="showTab('overview')">Overview</div>
            <div class="tab" onclick="showTab('logs')">ESP32 Logs</div>
            <div class="tab" onclick="showTab('update')">Update Display</div>
        </div>
        
        <div id="overview" class="tab-content active">
            <h2>Connected Devices</h2>
            <div id="devices">Loading...</div>
            
            <h2>Current Display</h2>
            <div id="current">Loading...</div>
        </div>
        
        <div id="logs" class="tab-content">
            <h2>ESP32 Device Logs</h2>
            <div>
                <label>Device:</label>
                <select id="deviceSelect" onchange="loadLogs()">
                    <option value="">Select a device...</option>
                </select>
                <button onclick="loadLogs()">Refresh Logs</button>
                <button onclick="clearLogs()">Clear Display</button>
            </div>
            <div id="logsContainer" class="logs">Select a device to view logs...</div>
        </div>
        
        <div id="update" class="tab-content">
            <h2>Update Display</h2>
            <form id="updateForm">
                <div>
                    <label>Title:</label><br>
                    <input type="text" id="title" placeholder="Display title" required>
                </div>
                <div>
                    <label>Image (Base64):</label><br>
                    <textarea id="image" placeholder="Base64 encoded image data (optional)"></textarea>
                </div>
                <div>
                    <label>Sleep Duration (microseconds):</label><br>
                    <input type="number" id="sleepDuration" value="3600000000" min="300000000">
                </div>
                <button type="submit">Update Display</button>
            </form>
        </div>
    </div>
    
    <script>
        async function loadDevices() {
            try {
                const response = await fetch('/api/devices');
                const devices = await response.json();
                const devicesDiv = document.getElementById('devices');
                const deviceSelect = document.getElementById('deviceSelect');
                
                if (Object.keys(devices).length === 0) {
                    devicesDiv.innerHTML = '<p>No devices connected yet.</p>';
                    return;
                }
                
                // Update device list
                devicesDiv.innerHTML = Object.values(devices).map(device => {
                    const lastSeen = new Date(device.lastSeen);
                    const isOnline = Date.now() - device.lastSeen < 300000; // 5 minutes
                    return \`
                        <div class="device \${isOnline ? 'online' : 'offline'}">
                            <h3>\${device.deviceId}</h3>
                            <p>Battery: \${device.batteryVoltage}V (\${device.batteryLevel}%)</p>
                            <p>Signal: \${device.signalStrength}dBm</p>
                            <p>Temperature: \${device.temperature}°C</p>
                            <p>Last Seen: \${lastSeen.toLocaleString()}</p>
                            <p>Status: <span style="color: \${isOnline ? 'green' : 'red'}">\${isOnline ? 'Online' : 'Offline'}</span></p>
                        </div>
                    \`;
                }).join('');
                
                // Update device select dropdown
                const currentDevice = deviceSelect.value;
                deviceSelect.innerHTML = '<option value="">Select a device...</option>' +
                    Object.keys(devices).map(deviceId => 
                        \`<option value="\${deviceId}" \${deviceId === currentDevice ? 'selected' : ''}>\${deviceId}</option>\`
                    ).join('');
                    
            } catch (error) {
                document.getElementById('devices').innerHTML = '<p>Error loading devices</p>';
            }
        }
        
        async function loadCurrent() {
            try {
                const response = await fetch('/api/current.json');
                const current = await response.json();
                document.getElementById('current').innerHTML = \`
                    <p><strong>Title:</strong> \${current.title}</p>
                    <p><strong>Last Updated:</strong> \${new Date(current.timestamp).toLocaleString()}</p>
                    <p><strong>Sleep Duration:</strong> \${current.sleepDuration / 1000000} seconds</p>
                    <p><strong>Has Image:</strong> \${current.image ? 'Yes' : 'No'}</p>
                \`;
            } catch (error) {
                document.getElementById('current').innerHTML = '<p>Error loading current data</p>';
            }
        }
        
        async function loadLogs() {
            const deviceId = document.getElementById('deviceSelect').value;
            const logsContainer = document.getElementById('logsContainer');
            
            if (!deviceId) {
                logsContainer.innerHTML = 'Select a device to view logs...';
                return;
            }
            
            try {
                const response = await fetch(\`/api/logs/\${deviceId}?limit=500\`);
                const data = await response.json();
                
                if (data.logs.length === 0) {
                    logsContainer.innerHTML = 'No logs available for this device.';
                    return;
                }
                
                logsContainer.innerHTML = data.logs.map(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString();
                    const levelClass = \`log-\${log.level.toLowerCase()}\`;
                    return \`<div class="log-entry \${levelClass}">[\${timestamp}] \${log.level}: \${log.message}</div>\`;
                }).join('');
                
                // Auto-scroll to bottom
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } catch (error) {
                logsContainer.innerHTML = 'Error loading logs: ' + error.message;
            }
        }
        
        function clearLogs() {
            document.getElementById('logsContainer').innerHTML = '';
        }
        
        function showTab(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab content
            document.getElementById(tabName).classList.add('active');
            
            // Add active class to clicked tab
            event.target.classList.add('active');
        }
        
        document.getElementById('updateForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('/api/current', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: document.getElementById('title').value,
                        image: document.getElementById('image').value,
                        sleepDuration: parseInt(document.getElementById('sleepDuration').value)
                    })
                });
                
                if (response.ok) {
                    alert('Display updated successfully!');
                    loadCurrent();
                } else {
                    alert('Error updating display');
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
        
        // Load data on page load and refresh every 30 seconds
        loadDevices();
        loadCurrent();
        setInterval(() => {
            loadDevices();
            loadCurrent();
        }, 30000);
        
        // Auto-refresh logs every 10 seconds if a device is selected
        setInterval(() => {
            const deviceId = document.getElementById('deviceSelect').value;
            if (deviceId && document.getElementById('logs').classList.contains('active')) {
                loadLogs();
            }
        }, 10000);
    </script>
</body>
</html>
    `);
});

// Start server
async function startServer() {
    await ensureDataDir();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Glance server running on port ${PORT}`);
        console.log(`Access the web interface at http://localhost:${PORT}`);
        console.log(`API endpoint for ESP32: http://localhost:${PORT}/api/current.json`);
    });
}

startServer().catch(console.error);