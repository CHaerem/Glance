// Beautiful web interface
app.get("/", (req, res) => {
	res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Glance E-Ink Display Server</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .card {
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            padding: 25px;
            margin-bottom: 20px;
            transition: transform 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
        }
        
        .tabs {
            display: flex;
            background: #f8f9fa;
            border-radius: 10px;
            padding: 5px;
            margin-bottom: 25px;
            overflow-x: auto;
        }
        
        .tab {
            flex: 1;
            padding: 12px 20px;
            text-align: center;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            white-space: nowrap;
            font-weight: 500;
        }
        
        .tab:hover {
            background: #e9ecef;
        }
        
        .tab.active {
            background: #007bff;
            color: white;
            box-shadow: 0 2px 8px rgba(0,123,255,0.3);
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .device-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .device {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .device.offline {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        
        .device h3 {
            font-size: 1.2rem;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .device-status {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #4ade80;
            animation: pulse 2s infinite;
        }
        
        .status-indicator.offline {
            background: #ef4444;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #555;
        }
        
        .form-control {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }
        
        .form-control:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
        }
        
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .btn-success {
            background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, #64748b 0%, #475569 100%);
        }
        
        .logs {
            background: #1a1a1a;
            color: #4ade80;
            font-family: 'Courier New', monospace;
            padding: 20px;
            border-radius: 10px;
            height: 400px;
            overflow-y: auto;
            border: 2px solid #333;
        }
        
        .log-entry {
            margin-bottom: 5px;
            padding: 2px 0;
        }
        
        .log-error { color: #ef4444; }
        .log-warn { color: #f59e0b; }
        .log-info { color: #4ade80; }
        
        .upload-area {
            border: 2px dashed #007bff;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            background: #f8f9ff;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .upload-area:hover {
            border-color: #0056b3;
            background: #e7f3ff;
        }
        
        .upload-area.dragover {
            border-color: #0056b3;
            background: #e7f3ff;
            transform: scale(1.02);
        }
        
        .upload-icon {
            font-size: 3rem;
            color: #007bff;
            margin-bottom: 15px;
        }
        
        .current-display {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #666;
            font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .tabs {
                flex-direction: column;
            }
            
            .tab {
                margin-bottom: 5px;
            }
            
            .device-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-display"></i> Glance E-Ink Display Server</h1>
            <p>Manage your autonomous e-paper displays with ease</p>
        </div>
        
        <div class="card">
            <div class="tabs">
                <div class="tab active" onclick="showTab('overview')">
                    <i class="fas fa-home"></i> Overview
                </div>
                <div class="tab" onclick="showTab('upload')">
                    <i class="fas fa-upload"></i> Upload Image
                </div>
                <div class="tab" onclick="showTab('text')">
                    <i class="fas fa-font"></i> Text Display
                </div>
                <div class="tab" onclick="showTab('logs')">
                    <i class="fas fa-list"></i> Device Logs
                </div>
                <div class="tab" onclick="showTab('settings')">
                    <i class="fas fa-cog"></i> Settings
                </div>
            </div>
            
            <div id="overview" class="tab-content active">
                <div class="current-display">
                    <h3><i class="fas fa-display"></i> Current Display</h3>
                    <div id="current">Loading...</div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="deviceCount">-</div>
                        <div class="stat-label">Connected Devices</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="onlineCount">-</div>
                        <div class="stat-label">Online Now</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="avgBattery">-</div>
                        <div class="stat-label">Average Battery</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastUpdate">-</div>
                        <div class="stat-label">Last Update</div>
                    </div>
                </div>
                
                <h3><i class="fas fa-microchip"></i> Connected Devices</h3>
                <div class="device-grid" id="devices">Loading...</div>
            </div>
            
            <div id="upload" class="tab-content">
                <h3><i class="fas fa-upload"></i> Upload Image</h3>
                <form id="uploadForm" enctype="multipart/form-data">
                    <div class="upload-area" onclick="document.getElementById('imageFile').click()" 
                         ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                        <i class="fas fa-cloud-upload-alt upload-icon"></i>
                        <h4>Drop an image here or click to select</h4>
                        <p>Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</p>
                        <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">
                    </div>
                    
                    <div class="form-group">
                        <label for="uploadTitle">Display Title</label>
                        <input type="text" id="uploadTitle" name="title" class="form-control" placeholder="Enter display title">
                    </div>
                    
                    <div class="form-group">
                        <label for="uploadSleep">Sleep Duration</label>
                        <select id="uploadSleep" name="sleepDuration" class="form-control">
                            <option value="300000000">5 minutes (testing)</option>
                            <option value="1800000000">30 minutes</option>
                            <option value="3600000000" selected>1 hour</option>
                            <option value="7200000000">2 hours</option>
                            <option value="21600000000">6 hours</option>
                            <option value="43200000000">12 hours</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-upload"></i> Upload & Display
                    </button>
                </form>
            </div>
            
            <div id="text" class="tab-content">
                <h3><i class="fas fa-font"></i> Text Display</h3>
                <form id="textForm">
                    <div class="form-group">
                        <label for="textContent">Text to Display</label>
                        <textarea id="textContent" class="form-control" rows="4" placeholder="Enter text to display on the e-ink screen"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="textTitle">Display Title</label>
                        <input type="text" id="textTitle" class="form-control" placeholder="Enter display title">
                    </div>
                    
                    <div class="form-group">
                        <label for="textSleep">Sleep Duration</label>
                        <select id="textSleep" class="form-control">
                            <option value="300000000">5 minutes (testing)</option>
                            <option value="1800000000">30 minutes</option>
                            <option value="3600000000" selected>1 hour</option>
                            <option value="7200000000">2 hours</option>
                            <option value="21600000000">6 hours</option>
                            <option value="43200000000">12 hours</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-font"></i> Display Text
                    </button>
                </form>
            </div>
            
            <div id="logs" class="tab-content">
                <h3><i class="fas fa-list"></i> Device Logs</h3>
                <div class="form-group">
                    <label for="deviceSelect">Select Device</label>
                    <div style="display: flex; gap: 10px;">
                        <select id="deviceSelect" class="form-control" onchange="loadLogs()">
                            <option value="">Select a device...</option>
                        </select>
                        <button onclick="loadLogs()" class="btn btn-secondary">
                            <i class="fas fa-refresh"></i> Refresh
                        </button>
                        <button onclick="clearLogs()" class="btn btn-danger">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
                <div id="logsContainer" class="logs">Select a device to view logs...</div>
            </div>
            
            <div id="settings" class="tab-content">
                <h3><i class="fas fa-cog"></i> Server Settings</h3>
                <div class="form-group">
                    <label>Server Status</label>
                    <div class="stat-card">
                        <div class="stat-value" style="color: #22c55e;">Online</div>
                        <div class="stat-label">Server is running on port 3000</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Quick Actions</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="clearAllDisplays()" class="btn btn-secondary">
                            <i class="fas fa-eraser"></i> Clear All Displays
                        </button>
                        <button onclick="wakeAllDevices()" class="btn btn-success">
                            <i class="fas fa-power-off"></i> Wake All Devices
                        </button>
                        <button onclick="exportLogs()" class="btn btn-secondary">
                            <i class="fas fa-download"></i> Export Logs
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // JavaScript functionality
        async function loadDevices() {
            try {
                const response = await fetch('/api/devices');
                const devices = await response.json();
                const devicesDiv = document.getElementById('devices');
                const deviceSelect = document.getElementById('deviceSelect');
                
                const deviceCount = Object.keys(devices).length;
                let onlineCount = 0;
                let totalBattery = 0;
                let lastUpdateTime = 0;
                
                if (deviceCount === 0) {
                    devicesDiv.innerHTML = '<p style="text-align: center; color: #666;">No devices connected yet.</p>';
                } else {
                    devicesDiv.innerHTML = Object.values(devices).map(device => {
                        const lastSeen = new Date(device.lastSeen);
                        const isOnline = Date.now() - device.lastSeen < 300000; // 5 minutes
                        
                        if (isOnline) onlineCount++;
                        totalBattery += device.batteryVoltage || 0;
                        if (device.lastSeen > lastUpdateTime) lastUpdateTime = device.lastSeen;
                        
                        return \`
                            <div class="device \${isOnline ? 'online' : 'offline'}">
                                <h3>
                                    <i class="fas fa-microchip"></i>
                                    \${device.deviceId}
                                    <div class="status-indicator \${isOnline ? 'online' : 'offline'}"></div>
                                </h3>
                                <div class="device-status">
                                    <span><i class="fas fa-battery-half"></i> \${device.batteryVoltage?.toFixed(2) || 'N/A'}V</span>
                                    <span><i class="fas fa-wifi"></i> \${device.signalStrength || 'N/A'}dBm</span>
                                </div>
                                <div class="device-status">
                                    <span><i class="fas fa-memory"></i> \${device.freeHeap ? Math.round(device.freeHeap/1024) + 'KB' : 'N/A'}</span>
                                    <span><i class="fas fa-boot"></i> Boot: \${device.bootCount || 'N/A'}</span>
                                </div>
                                <p style="font-size: 0.9rem; opacity: 0.8;">
                                    <i class="fas fa-clock"></i> Last seen: \${lastSeen.toLocaleString()}
                                </p>
                                <p style="font-size: 0.9rem;">
                                    Status: <strong>\${device.status || 'unknown'}</strong>
                                </p>
                            </div>
                        \`;
                    }).join('');
                }
                
                // Update stats
                document.getElementById('deviceCount').textContent = deviceCount;
                document.getElementById('onlineCount').textContent = onlineCount;
                document.getElementById('avgBattery').textContent = deviceCount > 0 ? 
                    (totalBattery / deviceCount).toFixed(1) + 'V' : '-';
                document.getElementById('lastUpdate').textContent = lastUpdateTime > 0 ? 
                    new Date(lastUpdateTime).toLocaleTimeString() : '-';
                
                // Update device select dropdown
                const currentDevice = deviceSelect.value;
                deviceSelect.innerHTML = '<option value="">Select a device...</option>' +
                    Object.keys(devices).map(deviceId => 
                        \`<option value="\${deviceId}" \${deviceId === currentDevice ? 'selected' : ''}>\${deviceId}</option>\`
                    ).join('');
                    
            } catch (error) {
                document.getElementById('devices').innerHTML = '<p style="color: red;">Error loading devices</p>';
                console.error('Error loading devices:', error);
            }
        }
        
        async function loadCurrent() {
            try {
                const response = await fetch('/api/current.json');
                const current = await response.json();
                document.getElementById('current').innerHTML = \`
                    <p><i class="fas fa-tag"></i> <strong>Title:</strong> \${current.title}</p>
                    <p><i class="fas fa-clock"></i> <strong>Last Updated:</strong> \${new Date(current.timestamp).toLocaleString()}</p>
                    <p><i class="fas fa-moon"></i> <strong>Sleep Duration:</strong> \${current.sleepDuration / 1000000} seconds</p>
                    <p><i class="fas fa-image"></i> <strong>Has Image:</strong> \${current.image ? 'Yes (' + Math.round(current.image.length/1024) + 'KB)' : 'No'}</p>
                \`;
            } catch (error) {
                document.getElementById('current').innerHTML = '<p style="color: #ff6b6b;">Error loading current data</p>';
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
        
        // File upload handling
        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                document.getElementById('imageFile').files = files;
                handleFileSelect({ target: { files: files } });
            }
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.add('dragover');
        }
        
        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.remove('dragover');
        }
        
        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (file) {
                const uploadArea = document.querySelector('.upload-area');
                uploadArea.innerHTML = \`
                    <i class="fas fa-check-circle upload-icon" style="color: #22c55e;"></i>
                    <h4>\${file.name}</h4>
                    <p>File selected (\${Math.round(file.size/1024)}KB)</p>
                \`;
            }
        }
        
        // Form submissions
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData();
            const fileInput = document.getElementById('imageFile');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select an image file first.');
                return;
            }
            
            formData.append('image', file);
            formData.append('title', document.getElementById('uploadTitle').value || file.name);
            formData.append('sleepDuration', document.getElementById('uploadSleep').value);
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    alert('Image uploaded and processed successfully!');
                    loadCurrent();
                    
                    // Reset form
                    document.getElementById('uploadForm').reset();
                    document.querySelector('.upload-area').innerHTML = \`
                        <i class="fas fa-cloud-upload-alt upload-icon"></i>
                        <h4>Drop an image here or click to select</h4>
                        <p>Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</p>
                    \`;
                } else {
                    alert('Error uploading image: ' + result.error);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
        
        document.getElementById('textForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const textContent = document.getElementById('textContent').value;
            if (!textContent.trim()) {
                alert('Please enter some text to display.');
                return;
            }
            
            try {
                const response = await fetch('/api/current', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: document.getElementById('textTitle').value || 'Text Display',
                        image: textContent,
                        isText: true,
                        sleepDuration: parseInt(document.getElementById('textSleep').value)
                    })
                });
                
                if (response.ok) {
                    alert('Text display updated successfully!');
                    loadCurrent();
                    document.getElementById('textForm').reset();
                } else {
                    alert('Error updating text display');
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
        
        // Settings functions
        async function clearAllDisplays() {
            if (confirm('Are you sure you want to clear all displays?')) {
                try {
                    const response = await fetch('/api/current', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: 'Display Cleared',
                            image: '',
                            sleepDuration: 3600000000
                        })
                    });
                    
                    if (response.ok) {
                        alert('All displays cleared!');
                        loadCurrent();
                    }
                } catch (error) {
                    alert('Error clearing displays: ' + error.message);
                }
            }
        }
        
        async function wakeAllDevices() {
            // This would require additional server implementation
            alert('Wake feature not yet implemented');
        }
        
        async function exportLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                const dataStr = JSON.stringify(logs, null, 2);
                const dataBlob = new Blob([dataStr], {type: 'application/json'});
                
                const link = document.createElement('a');
                link.href = URL.createObjectURL(dataBlob);
                link.download = 'glance-logs-' + new Date().toISOString().split('T')[0] + '.json';
                link.click();
            } catch (error) {
                alert('Error exporting logs: ' + error.message);
            }
        }
        
        // Load data on page load and refresh periodically
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
