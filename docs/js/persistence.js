// Glance Persistence Layer
// Handles data storage and synchronization with external services

class PersistenceManager {
    constructor() {
        this.storageKey = 'glanceData';
        this.apiBase = 'https://chaerem.github.io/Glance/api/';
        this.github = new GitHubPersistence();
        this.syncInterval = 30000; // 30 seconds
        this.deviceStates = new Map();
        this.useGitHub = false;
        
        this.init();
    }

    init() {
        this.loadLocalData();
        this.detectBackendService();
        this.startPeriodicSync();
        this.setupAutoSave();
    }

    // Local Storage Management
    loadLocalData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                this.data = {
                    currentImage: data.currentImage || null,
                    imageLibrary: data.imageLibrary || [],
                    schedule: data.schedule || this.getDefaultSchedule(),
                    devices: data.devices || [],
                    settings: data.settings || this.getDefaultSettings(),
                    lastSync: data.lastSync || 0
                };
            } else {
                this.data = this.getDefaultData();
            }
        } catch (error) {
            console.error('Failed to load local data:', error);
            this.data = this.getDefaultData();
        }
    }

    saveLocalData() {
        try {
            this.data.lastSync = Date.now();
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            return true;
        } catch (error) {
            console.error('Failed to save local data:', error);
            return false;
        }
    }

    getDefaultData() {
        return {
            currentImage: null,
            imageLibrary: [],
            schedule: this.getDefaultSchedule(),
            devices: [],
            settings: this.getDefaultSettings(),
            lastSync: 0
        };
    }

    getDefaultSchedule() {
        return {
            mode: 'manual',
            interval: 60,
            intervalUnit: 'minutes',
            times: ['08:00'],
            activeHoursStart: '06:00',
            activeHoursEnd: '22:00'
        };
    }

    getDefaultSettings() {
        return {
            backendUrl: '',
            apiKey: '',
            autoSync: true,
            compressionLevel: 85,
            deviceTimeout: 300000, // 5 minutes
            retryAttempts: 3
        };
    }

    // Backend Service Detection
    async detectBackendService() {
        const services = [
            'https://api.github.com/repos/CHaerem/Glance', // GitHub API
            'https://httpbin.org/anything', // Fallback test service
            // Add more services as available
        ];

        for (const service of services) {
            if (await this.testService(service)) {
                this.backendUrl = service;
                console.log('Backend service detected:', service);
                break;
            }
        }

        if (!this.backendUrl) {
            console.warn('No backend service available, using local storage only');
        }
    }

    async testService(url) {
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // Data Operations
    async saveImage(imageData) {
        // Add to local library
        this.data.imageLibrary.push(imageData);
        this.saveLocalData();

        // Sync to GitHub if configured
        if (this.useGitHub) {
            try {
                await this.github.saveImageToLibrary(imageData);
            } catch (error) {
                console.error('Failed to sync image to GitHub:', error);
            }
        }

        return imageData.id;
    }

    async setCurrentImage(imageId) {
        const image = this.data.imageLibrary.find(img => img.id === imageId);
        if (!image) throw new Error('Image not found');

        this.data.currentImage = image;
        this.saveLocalData();

        // Update API endpoint via GitHub Actions
        if (this.useGitHub) {
            await this.github.updateCurrentImage(image);
        } else {
            await this.updateApiEndpoint();
        }

        return image;
    }

    async updateSchedule(schedule) {
        this.data.schedule = { ...this.data.schedule, ...schedule };
        this.saveLocalData();

        // Update schedule via GitHub Actions
        if (this.useGitHub) {
            await this.github.updateSchedule(this.data.schedule);
        }

        // Calculate and update sleep durations for all devices
        await this.updateDeviceSleepDurations();

        return this.data.schedule;
    }

    async registerDevice(deviceInfo) {
        const existingDevice = this.data.devices.find(d => d.id === deviceInfo.id);
        
        if (existingDevice) {
            // Update existing device
            Object.assign(existingDevice, deviceInfo, {
                lastSeen: new Date().toISOString(),
                status: 'online'
            });
        } else {
            // Add new device
            const device = {
                ...deviceInfo,
                registeredAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                status: 'online'
            };
            this.data.devices.push(device);
        }

        this.saveLocalData();
        return deviceInfo.id;
    }

    async updateDeviceStatus(deviceId, status) {
        const device = this.data.devices.find(d => d.id === deviceId);
        if (!device) throw new Error('Device not found');

        Object.assign(device, status, {
            lastSeen: new Date().toISOString(),
            status: 'online'
        });

        this.deviceStates.set(deviceId, {
            ...status,
            timestamp: Date.now()
        });

        this.saveLocalData();
        return device;
    }

    // API Endpoint Management
    async updateApiEndpoint() {
        const apiData = {
            image: this.data.currentImage?.optimized || '',
            title: this.data.currentImage?.title || 'No Image',
            sleepDuration: this.calculateSleepDuration(),
            timestamp: Date.now(),
            deviceId: 'esp32-001',
            batteryLevel: this.getLatestDeviceState('esp32-001')?.batteryLevel || 85,
            temperature: this.getLatestDeviceState('esp32-001')?.temperature || 23,
            signalStrength: this.getLatestDeviceState('esp32-001')?.signalStrength || -45
        };

        // Update local API file (for GitHub Pages)
        try {
            // Note: This won't work on GitHub Pages as it's static
            // You'll need to implement this with your chosen backend
            console.log('API data to persist:', apiData);
            
            // For now, store in localStorage for simulation
            localStorage.setItem('apiCurrent', JSON.stringify(apiData));
            
            return apiData;
        } catch (error) {
            console.error('Failed to update API endpoint:', error);
            throw error;
        }
    }

    calculateSleepDuration() {
        const schedule = this.data.schedule;
        
        switch (schedule.mode) {
            case 'interval':
                return this.getIntervalInMs(schedule.interval, schedule.intervalUnit);
            
            case 'times':
                return this.getTimeUntilNextScheduled(schedule.times);
            
            case 'smart':
                return this.calculateSmartSleepDuration();
            
            default:
                return 3600000; // 1 hour default
        }
    }

    getIntervalInMs(value, unit) {
        const multipliers = {
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000
        };
        return value * (multipliers[unit] || multipliers.hours);
    }

    getTimeUntilNextScheduled(times) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Convert time strings to minutes
        const scheduledTimes = times.map(time => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        }).sort((a, b) => a - b);

        // Find next scheduled time
        for (const scheduledTime of scheduledTimes) {
            if (scheduledTime > currentTime) {
                return (scheduledTime - currentTime) * 60 * 1000;
            }
        }

        // All times today have passed, use first time tomorrow
        const firstTime = scheduledTimes[0];
        const minutesUntilTomorrow = (24 * 60) - currentTime + firstTime;
        return minutesUntilTomorrow * 60 * 1000;
    }

    calculateSmartSleepDuration() {
        // Smart algorithm based on:
        // - Battery level
        // - Historical usage patterns
        // - Time of day
        // - Device status

        let baseDuration = 3600000; // 1 hour

        const latestDevice = this.getLatestDeviceState('esp32-001');
        if (latestDevice) {
            // Adjust based on battery level
            if (latestDevice.batteryLevel < 20) {
                baseDuration *= 4; // 4 hours if battery low
            } else if (latestDevice.batteryLevel < 50) {
                baseDuration *= 2; // 2 hours if battery medium
            }

            // Adjust based on time of day
            const hour = new Date().getHours();
            if (hour >= 22 || hour <= 6) {
                baseDuration *= 2; // Longer sleep during night
            }
        }

        return Math.min(baseDuration, 24 * 60 * 60 * 1000); // Max 24 hours
    }

    getLatestDeviceState(deviceId) {
        return this.deviceStates.get(deviceId);
    }

    async updateDeviceSleepDurations() {
        // Recalculate sleep durations for all devices
        const sleepDuration = this.calculateSleepDuration();
        
        for (const device of this.data.devices) {
            device.nextSleepDuration = sleepDuration;
        }

        await this.updateApiEndpoint();
    }

    // Synchronization
    startPeriodicSync() {
        setInterval(() => {
            this.performSync();
        }, this.syncInterval);
    }

    async performSync() {
        if (!this.backendUrl || !this.data.settings.autoSync) {
            return;
        }

        try {
            await this.syncToBackend();
            await this.syncFromBackend();
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }

    async syncToBackend() {
        // Implement backend sync based on your chosen service
        // This could be GitHub API, Firebase, AWS, etc.
        
        if (this.backendUrl.includes('github.com')) {
            return this.syncToGitHub();
        }
        
        // Generic REST API sync
        return this.syncToRestApi();
    }

    async syncToGitHub() {
        // Sync data to GitHub repository
        // This would require GitHub API token and proper setup
        console.log('GitHub sync not implemented yet');
    }

    async syncToRestApi() {
        // Generic REST API sync
        const response = await fetch(`${this.backendUrl}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.data.settings.apiKey
            },
            body: JSON.stringify({
                data: this.data,
                timestamp: Date.now()
            })
        });

        if (!response.ok) {
            throw new Error(`Sync failed: ${response.status}`);
        }

        return response.json();
    }

    async syncFromBackend() {
        // Pull updates from backend
        const response = await fetch(`${this.backendUrl}/data`, {
            headers: {
                'X-API-Key': this.data.settings.apiKey,
                'If-Modified-Since': new Date(this.data.lastSync).toISOString()
            }
        });

        if (response.status === 304) {
            // No changes
            return;
        }

        if (!response.ok) {
            throw new Error(`Sync failed: ${response.status}`);
        }

        const remoteData = await response.json();
        this.mergeRemoteData(remoteData);
    }

    mergeRemoteData(remoteData) {
        // Intelligent merge of remote and local data
        // Resolve conflicts based on timestamps
        
        if (remoteData.timestamp > this.data.lastSync) {
            // Remote data is newer, merge carefully
            if (remoteData.currentImage) {
                this.data.currentImage = remoteData.currentImage;
            }
            
            if (remoteData.schedule) {
                this.data.schedule = { ...this.data.schedule, ...remoteData.schedule };
            }

            // Merge image library (avoid duplicates)
            if (remoteData.imageLibrary) {
                const existingIds = new Set(this.data.imageLibrary.map(img => img.id));
                const newImages = remoteData.imageLibrary.filter(img => !existingIds.has(img.id));
                this.data.imageLibrary.push(...newImages);
            }

            this.saveLocalData();
        }
    }

    setupAutoSave() {
        // Auto-save on page visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.saveLocalData();
            }
        });

        // Auto-save on page unload
        window.addEventListener('beforeunload', () => {
            this.saveLocalData();
        });
    }

    // Public API for the main application
    getData() {
        return this.data;
    }

    async save() {
        this.saveLocalData();
        if (this.backendUrl) {
            await this.syncToBackend();
        }
    }

    // Device timeout monitoring
    startDeviceMonitoring() {
        setInterval(() => {
            const now = Date.now();
            const timeout = this.data.settings.deviceTimeout;

            for (const device of this.data.devices) {
                const lastSeen = new Date(device.lastSeen).getTime();
                if (now - lastSeen > timeout) {
                    device.status = 'offline';
                }
            }

            this.saveLocalData();
        }, 60000); // Check every minute
    }

    // Configuration
    async configure(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.saveLocalData();

        // Configure GitHub integration
        if (settings.githubToken) {
            const success = await this.github.configure(settings.githubToken);
            this.useGitHub = success;
            
            if (success) {
                // Start polling for real-time updates
                this.github.startPolling((data) => {
                    this.mergeRemoteData(data);
                });
                
                // Initial sync from GitHub
                try {
                    const remoteData = await this.github.syncFromGitHub();
                    this.mergeRemoteData(remoteData);
                } catch (error) {
                    console.error('Initial GitHub sync failed:', error);
                }
            }
        }

        if (settings.backendUrl) {
            this.backendUrl = settings.backendUrl;
            await this.testService(this.backendUrl);
        }
    }

    // Export/Import
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    async importData(jsonData) {
        try {
            const importedData = JSON.parse(jsonData);
            this.data = { ...this.data, ...importedData };
            this.saveLocalData();
            await this.updateApiEndpoint();
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }
}

// Export for use in main application
window.PersistenceManager = PersistenceManager;