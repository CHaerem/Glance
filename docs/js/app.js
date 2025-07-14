// Glance E-Ink Display Manager
// Main JavaScript application

class GlanceManager {
    constructor() {
        this.githubOAuth = new GitHubOAuth();
        this.persistence = new PersistenceManager();
        this.init();
    }

    init() {
        this.loadStoredData();
        this.setupEventListeners();
        this.updateDisplay();
        this.startStatusUpdates();
        this.persistence.startDeviceMonitoring();
    }

    loadStoredData() {
        const data = this.persistence.getData();
        this.currentImage = data.currentImage;
        this.imageLibrary = data.imageLibrary;
        this.schedule = data.schedule;
        this.devices = data.devices;
        
        // Add default device if none exist
        if (this.devices.length === 0) {
            this.devices.push(this.createDefaultDevice());
            this.persistence.registerDevice(this.devices[0]);
        }
    }

    async saveData() {
        // Update persistence layer
        const data = this.persistence.getData();
        data.currentImage = this.currentImage;
        data.imageLibrary = this.imageLibrary;
        data.schedule = this.schedule;
        data.devices = this.devices;
        
        await this.persistence.save();
    }

    createDefaultDevice() {
        return {
            id: 'esp32-001',
            name: 'Glance Display #1',
            status: 'online',
            battery: 85,
            signal: -45,
            temperature: 23,
            lastSeen: new Date().toISOString(),
            firmwareVersion: '1.0.0'
        };
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Image upload
        const uploadArea = document.getElementById('uploadArea');
        const imageInput = document.getElementById('imageInput');
        
        uploadArea.addEventListener('click', () => imageInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            this.handleImageUpload(e.dataTransfer.files[0]);
        });
        
        imageInput.addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0]);
        });

        // Upload controls
        document.getElementById('saveImageBtn').addEventListener('click', () => this.saveUploadedImage());
        document.getElementById('cancelUploadBtn').addEventListener('click', () => this.cancelUpload());

        // Update now button
        document.getElementById('updateNowBtn').addEventListener('click', () => this.updateDisplayNow());

        // Schedule form
        document.getElementById('scheduleForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSchedule();
        });

        document.getElementById('scheduleMode').addEventListener('change', (e) => {
            this.updateScheduleSettings(e.target.value);
        });

        document.getElementById('addTimeBtn').addEventListener('click', () => this.addTimeSlot());

        // Remove time buttons (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.remove-time')) {
                e.target.closest('.time-item').remove();
            }
        });

        // GitHub OAuth connections
        document.getElementById('githubLoginBtn').addEventListener('click', () => this.githubOAuth.login());
        document.getElementById('connectTokenBtn').addEventListener('click', () => this.connectWithToken());
        document.getElementById('showTokenFormBtn').addEventListener('click', () => this.toggleTokenForm());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnectGitHub());
        document.getElementById('refreshConnectionBtn').addEventListener('click', () => this.refreshGitHubConnection());
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        // Load tab-specific content
        switch(tabName) {
            case 'upload':
                this.renderImageGallery();
                break;
            case 'schedule':
                this.renderScheduleForm();
                this.renderUpdateHistory();
                break;
            case 'devices':
                this.renderDeviceList();
                this.renderGitHubStatus();
                this.renderRepoStats();
                break;
        }
    }

    handleImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const originalPreview = document.getElementById('originalPreview');
            originalPreview.src = e.target.result;
            
            // Simulate e-paper optimization
            this.optimizeForEPaper(e.target.result).then(optimizedDataUrl => {
                document.getElementById('optimizedPreview').src = optimizedDataUrl;
                document.getElementById('uploadPreview').style.display = 'block';
                
                // Store for saving
                this.pendingUpload = {
                    original: e.target.result,
                    optimized: optimizedDataUrl,
                    filename: file.name
                };
            });
        };
        reader.readAsDataURL(file);
    }

    async optimizeForEPaper(imageDataUrl) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Set e-paper dimensions
                canvas.width = 400; // Scaled down for preview
                canvas.height = 533; // Maintains 1150x1550 aspect ratio
                
                // Draw and resize image
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Apply simple color reduction (simulation of e-paper palette)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // Simple color mapping to 6-color e-paper palette
                    const brightness = (r + g + b) / 3;
                    
                    if (brightness > 200) {
                        // White
                        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                    } else if (brightness > 150) {
                        // Yellow
                        data[i] = 255; data[i + 1] = 255; data[i + 2] = 0;
                    } else if (brightness > 100) {
                        // Red
                        data[i] = 255; data[i + 1] = 0; data[i + 2] = 0;
                    } else if (brightness > 80) {
                        // Green
                        data[i] = 0; data[i + 1] = 255; data[i + 2] = 0;
                    } else if (brightness > 50) {
                        // Blue
                        data[i] = 0; data[i + 1] = 0; data[i + 2] = 255;
                    } else {
                        // Black
                        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL());
            };
            
            img.src = imageDataUrl;
        });
    }

    saveUploadedImage() {
        if (!this.pendingUpload) return;
        
        const title = document.getElementById('imageTitle').value || 
                     this.pendingUpload.filename.replace(/\.[^/.]+$/, "");
        
        const image = {
            id: Date.now().toString(),
            title: title,
            original: this.pendingUpload.original,
            optimized: this.pendingUpload.optimized,
            uploadDate: new Date().toISOString(),
            dimensions: '1150x1550'
        };
        
        this.imageLibrary.push(image);
        this.saveData();
        this.cancelUpload();
        this.renderImageGallery();
        
        // Show success message
        this.showNotification('Image saved successfully!', 'success');
    }

    cancelUpload() {
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('imageTitle').value = '';
        this.pendingUpload = null;
    }

    updateDisplayNow() {
        if (!this.currentImage) {
            alert('No image selected to display');
            return;
        }
        
        // Simulate device update
        this.showNotification('Updating display...', 'info');
        
        setTimeout(() => {
            document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
            this.calculateNextUpdate();
            this.saveData();
            this.showNotification('Display updated successfully!', 'success');
        }, 2000);
    }

    renderImageGallery() {
        const gallery = document.getElementById('imageGallery');
        gallery.innerHTML = '';
        
        if (this.imageLibrary.length === 0) {
            gallery.innerHTML = '<p class="empty-state">No images uploaded yet</p>';
            return;
        }
        
        this.imageLibrary.forEach(image => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `
                <img src="${image.optimized}" alt="${image.title}">
                <div class="gallery-item-info">
                    <h4>${image.title}</h4>
                    <p>${new Date(image.uploadDate).toLocaleDateString()}</p>
                    <div class="gallery-actions">
                        <button class="btn btn-small btn-primary" onclick="glanceManager.setCurrentImage('${image.id}')">
                            <i class="fas fa-eye"></i> Display
                        </button>
                        <button class="btn btn-small btn-danger" onclick="glanceManager.deleteImage('${image.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
            gallery.appendChild(item);
        });
    }

    setCurrentImage(imageId) {
        const image = this.imageLibrary.find(img => img.id === imageId);
        if (!image) return;
        
        this.currentImage = image;
        this.updateDisplay();
        this.saveData();
        this.showNotification(`Set "${image.title}" as current image`, 'success');
    }

    deleteImage(imageId) {
        if (confirm('Are you sure you want to delete this image?')) {
            this.imageLibrary = this.imageLibrary.filter(img => img.id !== imageId);
            if (this.currentImage && this.currentImage.id === imageId) {
                this.currentImage = null;
                this.updateDisplay();
            }
            this.saveData();
            this.renderImageGallery();
            this.showNotification('Image deleted', 'success');
        }
    }

    updateDisplay() {
        const currentImageEl = document.getElementById('currentImage');
        const displayTitleEl = document.getElementById('displayTitle');
        
        if (this.currentImage) {
            currentImageEl.src = this.currentImage.optimized;
            displayTitleEl.textContent = this.currentImage.title;
        } else {
            currentImageEl.src = "https://via.placeholder.com/400x533/2c3e50/ecf0f1?text=No+Image";
            displayTitleEl.textContent = "No Image Selected";
        }
        
        this.calculateNextUpdate();
    }

    calculateNextUpdate() {
        let nextUpdate = 'Not scheduled';
        
        if (this.schedule.mode === 'interval') {
            const now = new Date();
            const intervalMs = this.getIntervalInMs();
            const next = new Date(now.getTime() + intervalMs);
            nextUpdate = next.toLocaleString();
        } else if (this.schedule.mode === 'times') {
            // Find next scheduled time
            const now = new Date();
            const today = now.toDateString();
            
            for (const time of this.schedule.times) {
                const nextTime = new Date(`${today} ${time}`);
                if (nextTime > now) {
                    nextUpdate = nextTime.toLocaleString();
                    break;
                }
            }
            
            if (nextUpdate === 'Not scheduled') {
                // All times today have passed, use first time tomorrow
                const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
                const nextTime = new Date(`${tomorrow} ${this.schedule.times[0]}`);
                nextUpdate = nextTime.toLocaleString();
            }
        }
        
        document.getElementById('nextUpdate').textContent = nextUpdate;
        document.getElementById('updateInterval').textContent = this.getScheduleDescription();
    }

    getIntervalInMs() {
        const value = this.schedule.interval;
        const unit = this.schedule.intervalUnit;
        
        switch(unit) {
            case 'minutes': return value * 60 * 1000;
            case 'hours': return value * 60 * 60 * 1000;
            case 'days': return value * 24 * 60 * 60 * 1000;
            default: return 60 * 60 * 1000;
        }
    }

    getScheduleDescription() {
        switch(this.schedule.mode) {
            case 'manual': return 'Manual only';
            case 'interval': return `Every ${this.schedule.interval} ${this.schedule.intervalUnit}`;
            case 'times': return `At ${this.schedule.times.join(', ')}`;
            case 'smart': return 'Smart schedule';
            default: return 'Unknown';
        }
    }

    renderScheduleForm() {
        document.getElementById('scheduleMode').value = this.schedule.mode;
        document.getElementById('intervalValue').value = this.schedule.interval;
        document.getElementById('intervalUnit').value = this.schedule.intervalUnit;
        document.getElementById('activeHoursStart').value = this.schedule.activeHoursStart;
        document.getElementById('activeHoursEnd').value = this.schedule.activeHoursEnd;
        
        this.updateScheduleSettings(this.schedule.mode);
        this.renderTimeSlots();
    }

    updateScheduleSettings(mode) {
        document.getElementById('intervalSettings').style.display = 
            mode === 'interval' ? 'block' : 'none';
        document.getElementById('timesSettings').style.display = 
            mode === 'times' ? 'block' : 'none';
    }

    renderTimeSlots() {
        const timeList = document.getElementById('timeList');
        timeList.innerHTML = '';
        
        this.schedule.times.forEach((time, index) => {
            const item = document.createElement('div');
            item.className = 'time-item';
            item.innerHTML = `
                <input type="time" class="form-input time-input" value="${time}">
                <button type="button" class="btn btn-small btn-danger remove-time">
                    <i class="fas fa-minus"></i>
                </button>
            `;
            timeList.appendChild(item);
        });
    }

    addTimeSlot() {
        this.schedule.times.push('12:00');
        this.renderTimeSlots();
    }

    saveSchedule() {
        this.schedule.mode = document.getElementById('scheduleMode').value;
        this.schedule.interval = parseInt(document.getElementById('intervalValue').value);
        this.schedule.intervalUnit = document.getElementById('intervalUnit').value;
        this.schedule.activeHoursStart = document.getElementById('activeHoursStart').value;
        this.schedule.activeHoursEnd = document.getElementById('activeHoursEnd').value;
        
        // Collect time slots
        const timeInputs = document.querySelectorAll('.time-input');
        this.schedule.times = Array.from(timeInputs).map(input => input.value);
        
        this.saveData();
        this.calculateNextUpdate();
        this.showNotification('Schedule saved successfully!', 'success');
    }

    renderUpdateHistory() {
        const history = document.getElementById('updateHistory');
        
        // Simulate update history
        const mockHistory = [
            { date: new Date(Date.now() - 2 * 60 * 60 * 1000), status: 'success', image: 'Bhutan Flag' },
            { date: new Date(Date.now() - 8 * 60 * 60 * 1000), status: 'success', image: 'Mountain View' },
            { date: new Date(Date.now() - 24 * 60 * 60 * 1000), status: 'failed', image: 'Abstract Art' },
            { date: new Date(Date.now() - 48 * 60 * 60 * 1000), status: 'success', image: 'Sunrise' }
        ];
        
        history.innerHTML = mockHistory.map(entry => `
            <div class="history-item ${entry.status}">
                <div class="history-time">${entry.date.toLocaleString()}</div>
                <div class="history-details">
                    <span class="history-image">${entry.image}</span>
                    <span class="history-status">
                        <i class="fas fa-${entry.status === 'success' ? 'check' : 'times'}"></i>
                        ${entry.status}
                    </span>
                </div>
            </div>
        `).join('');
    }

    renderDeviceList() {
        const deviceList = document.getElementById('deviceList');
        
        deviceList.innerHTML = this.devices.map(device => `
            <div class="device-card ${device.status}">
                <div class="device-header">
                    <h3>
                        <i class="fas fa-microchip"></i>
                        ${device.name}
                    </h3>
                    <span class="device-status ${device.status}">
                        <i class="fas fa-circle"></i>
                        ${device.status}
                    </span>
                </div>
                <div class="device-details">
                    <div class="device-stat">
                        <i class="fas fa-battery-three-quarters"></i>
                        <span>Battery: ${device.battery}%</span>
                    </div>
                    <div class="device-stat">
                        <i class="fas fa-wifi"></i>
                        <span>Signal: ${device.signal} dBm</span>
                    </div>
                    <div class="device-stat">
                        <i class="fas fa-thermometer-half"></i>
                        <span>Temp: ${device.temperature}°C</span>
                    </div>
                    <div class="device-stat">
                        <i class="fas fa-clock"></i>
                        <span>Last seen: ${new Date(device.lastSeen).toLocaleString()}</span>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="btn btn-small btn-primary">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                    <button class="btn btn-small btn-secondary">
                        <i class="fas fa-sync"></i> Update
                    </button>
                </div>
            </div>
        `).join('');
    }

    startStatusUpdates() {
        // Update status indicators
        setInterval(() => {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            
            if (this.devices.some(d => d.status === 'online')) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Online';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Offline';
            }
            
            // Update device stats
            document.getElementById('batteryLevel').textContent = `${this.devices[0]?.battery || 0}%`;
            document.getElementById('signalStrength').textContent = `${this.devices[0]?.signal || 0} dBm`;
            document.getElementById('temperature').textContent = `${this.devices[0]?.temperature || 0}°C`;
            
            // Calculate uptime
            const now = Date.now();
            const uptime = Math.floor((now - (now - 2.5 * 24 * 60 * 60 * 1000)) / 1000);
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            document.getElementById('uptime').textContent = `${days}d ${hours}h`;
            
        }, 5000);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // GitHub Integration Methods
    async connectWithToken(buttonElement) {
        // Handle token from modal or main form
        const tokenInput = buttonElement ? 
            buttonElement.previousElementSibling : 
            document.getElementById('githubToken');
            
        const token = tokenInput.value.trim();
        if (!token) {
            this.showNotification('Please enter a GitHub token', 'error');
            return;
        }

        this.showNotification('Connecting to GitHub...', 'info');

        try {
            // Store token in OAuth manager
            const result = await this.githubOAuth.storeToken(token);
            
            // Configure persistence layer
            await this.persistence.configure({ githubToken: token });
            
            this.showNotification('Connected to GitHub successfully!', 'success');
            this.renderGitHubStatus();
            
            // Clear token input
            tokenInput.value = '';
            
            // Close modal if it exists
            const modal = document.querySelector('.oauth-modal');
            if (modal) {
                modal.remove();
            }
            
        } catch (error) {
            this.showNotification(`GitHub connection failed: ${error.message}`, 'error');
        }
    }

    toggleTokenForm() {
        const form = document.getElementById('manualTokenForm');
        const button = document.getElementById('showTokenFormBtn');
        const icon = button.querySelector('i');
        
        if (form.style.display === 'none') {
            form.style.display = 'block';
            button.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Token Form';
        } else {
            form.style.display = 'none';
            button.innerHTML = '<i class="fas fa-chevron-down"></i> Use Token Instead';
        }
    }

    async disconnectGitHub() {
        if (confirm('Are you sure you want to disconnect from GitHub? This will stop automatic syncing.')) {
            this.githubOAuth.logout();
            this.persistence.useGitHub = false;
            this.showNotification('Disconnected from GitHub', 'success');
            this.renderGitHubStatus();
        }
    }

    async refreshGitHubConnection() {
        this.showNotification('Refreshing connection...', 'info');
        
        try {
            if (this.githubOAuth.isAuthenticated()) {
                // Re-configure persistence with existing token
                await this.persistence.configure({ 
                    githubToken: this.githubOAuth.getToken() 
                });
                this.renderGitHubStatus();
                this.showNotification('Connection refreshed!', 'success');
            } else {
                this.showNotification('Not authenticated', 'error');
            }
        } catch (error) {
            this.showNotification(`Refresh failed: ${error.message}`, 'error');
        }
    }

    renderGitHubStatus() {
        const loginSection = document.getElementById('githubLoginSection');
        const authenticatedSection = document.getElementById('githubAuthenticatedSection');
        
        if (this.githubOAuth.isAuthenticated()) {
            // Show authenticated state
            loginSection.style.display = 'none';
            authenticatedSection.style.display = 'block';
            
            // Update user profile
            const user = this.githubOAuth.getUser();
            document.getElementById('userAvatar').src = user.avatar_url;
            document.getElementById('userName').textContent = user.name || user.login;
            document.getElementById('userLogin').textContent = `@${user.login}`;
            document.getElementById('userBio').textContent = user.bio || '';
            
            // Update connection info
            if (this.persistence.useGitHub && this.persistence.github) {
                const rateLimit = this.persistence.github.getRateLimitStatus();
                const infoEl = document.getElementById('githubInfo');
                infoEl.innerHTML = `
                    <p><strong>Repository:</strong> ${this.persistence.github.owner}/${this.persistence.github.repo}</p>
                    <p><strong>Rate Limit:</strong> ${rateLimit.remaining} requests remaining</p>
                    <p><strong>Reset Time:</strong> ${rateLimit.resetTime.toLocaleTimeString()}</p>
                    <p><strong>User:</strong> ${user.public_repos} repos, ${user.followers} followers</p>
                `;
            }
        } else {
            // Show login state
            loginSection.style.display = 'block';
            authenticatedSection.style.display = 'none';
        }
    }

    async renderRepoStats() {
        if (!this.persistence.useGitHub) {
            return;
        }

        try {
            const [stats, commits] = await Promise.all([
                this.persistence.github.getRepoStats(),
                this.persistence.github.getCommitHistory()
            ]);

            // Update stats
            document.getElementById('commitCount').textContent = commits.length + '+';
            document.getElementById('repoSize').textContent = `${(stats.size / 1024).toFixed(1)} MB`;
            document.getElementById('lastPush').textContent = new Date(stats.lastPush).toLocaleDateString();

            // Update commit history
            const historyEl = document.getElementById('commitHistory');
            historyEl.innerHTML = commits.slice(0, 5).map(commit => `
                <div class="commit-item">
                    <div class="commit-message">${commit.message}</div>
                    <div class="commit-meta">
                        <span class="commit-author">${commit.author}</span>
                        <span class="commit-date">${new Date(commit.date).toLocaleDateString()}</span>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Failed to load repository stats:', error);
        }
    }

    // API simulation for GitHub Pages
    generateApiResponse() {
        if (!this.currentImage) {
            return {
                error: 'No image configured',
                sleepDuration: 3600000 // 1 hour
            };
        }
        
        return {
            image: this.currentImage.optimized,
            title: this.currentImage.title,
            sleepDuration: this.getIntervalInMs(),
            timestamp: Date.now(),
            deviceId: 'esp32-001'
        };
    }
}

// Initialize the application
let glanceManager;
document.addEventListener('DOMContentLoaded', () => {
    glanceManager = new GlanceManager();
});

// Export for GitHub Pages API simulation
window.glanceManager = glanceManager;