// GitHub API Persistence Layer
// Handles data persistence using GitHub repository and Actions

class GitHubPersistence {
    constructor() {
        this.owner = 'CHaerem';
        this.repo = 'Glance';
        this.branch = 'main';
        this.apiBase = 'https://api.github.com';
        this.token = null;
        this.rateLimitRemaining = 60; // GitHub API rate limit for unauthenticated requests
        this.rateLimitReset = 0;
        
        this.loadConfig();
    }

    loadConfig() {
        // Load GitHub token from localStorage or prompt user
        const stored = localStorage.getItem('github-config');
        if (stored) {
            const config = JSON.parse(stored);
            this.token = config.token;
        }
    }

    saveConfig() {
        localStorage.setItem('github-config', JSON.stringify({
            token: this.token,
            lastConfigured: Date.now()
        }));
    }

    // Configuration
    configure(token) {
        this.token = token;
        this.saveConfig();
        return this.testConnection();
    }

    async testConnection() {
        try {
            const response = await this.makeRequest('/user');
            return response.ok;
        } catch (error) {
            console.error('GitHub connection test failed:', error);
            return false;
        }
    }

    // Core GitHub API methods
    async makeRequest(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Glance-Display-Manager/1.0',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }

        const requestOptions = {
            ...options,
            headers
        };

        const response = await fetch(url, requestOptions);
        
        // Update rate limit info
        this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
        this.rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') || '0');

        return response;
    }

    // Repository dispatch (triggers GitHub Actions)
    async triggerAction(eventType, payload = {}) {
        if (!this.token) {
            throw new Error('GitHub token required for triggering actions');
        }

        const response = await this.makeRequest(`/repos/${this.owner}/${this.repo}/dispatches`, {
            method: 'POST',
            body: JSON.stringify({
                event_type: eventType,
                client_payload: payload
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GitHub Action trigger failed: ${error.message}`);
        }

        return true;
    }

    // File operations
    async getFile(path) {
        try {
            const response = await this.makeRequest(`/repos/${this.owner}/${this.repo}/contents/${path}`);
            
            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to get file: ${response.status}`);
            }

            const data = await response.json();
            
            // Decode base64 content
            const content = atob(data.content.replace(/\n/g, ''));
            
            return {
                content: JSON.parse(content),
                sha: data.sha,
                path: data.path
            };
        } catch (error) {
            console.error(`Error getting file ${path}:`, error);
            return null;
        }
    }

    async updateFile(path, content, message, sha = null) {
        if (!this.token) {
            throw new Error('GitHub token required for file updates');
        }

        const body = {
            message: message,
            content: btoa(JSON.stringify(content, null, 2)),
            branch: this.branch
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await this.makeRequest(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`File update failed: ${error.message}`);
        }

        return await response.json();
    }

    // High-level data operations
    async getCurrentImage() {
        const file = await this.getFile('docs/api/current.json');
        return file ? file.content : null;
    }

    async updateCurrentImage(imageData) {
        const apiData = {
            image: imageData.optimized,
            title: imageData.title,
            sleepDuration: 3600000, // Will be calculated by schedule
            timestamp: Date.now(),
            deviceId: 'esp32-001',
            imageId: imageData.id,
            uploadedAt: imageData.uploadDate
        };

        // Use GitHub Actions for better reliability
        return this.triggerAction('update-current-image', {
            data: apiData
        });
    }

    async updateDeviceStatus(deviceId, status) {
        const statusData = {
            deviceId: deviceId,
            ...status,
            lastSeen: new Date().toISOString(),
            timestamp: Date.now()
        };

        return this.triggerAction('update-device-status', {
            device_id: deviceId,
            status: statusData
        });
    }

    async updateSchedule(schedule) {
        const scheduleData = {
            ...schedule,
            updatedAt: new Date().toISOString(),
            timestamp: Date.now()
        };

        return this.triggerAction('update-schedule', {
            schedule: scheduleData
        });
    }

    // Device registration
    async registerDevice(deviceInfo) {
        const devices = await this.getDevices();
        const existingIndex = devices.findIndex(d => d.id === deviceInfo.id);

        if (existingIndex >= 0) {
            devices[existingIndex] = {
                ...devices[existingIndex],
                ...deviceInfo,
                lastSeen: new Date().toISOString()
            };
        } else {
            devices.push({
                ...deviceInfo,
                registeredAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                status: 'online'
            });
        }

        await this.saveDevices(devices);
        return deviceInfo.id;
    }

    async getDevices() {
        const file = await this.getFile('docs/api/devices.json');
        return file ? file.content : [];
    }

    async saveDevices(devices) {
        const file = await this.getFile('docs/api/devices.json');
        const sha = file ? file.sha : null;

        return this.updateFile(
            'docs/api/devices.json',
            devices,
            '📱 Update device registry',
            sha
        );
    }

    // Image library management
    async getImageLibrary() {
        const file = await this.getFile('docs/api/images.json');
        return file ? file.content : [];
    }

    async saveImageToLibrary(imageData) {
        const images = await this.getImageLibrary();
        images.push(imageData);

        const file = await this.getFile('docs/api/images.json');
        const sha = file ? file.sha : null;

        await this.updateFile(
            'docs/api/images.json',
            images,
            `🖼️ Add image: ${imageData.title}`,
            sha
        );

        return imageData.id;
    }

    async deleteImageFromLibrary(imageId) {
        const images = await this.getImageLibrary();
        const filteredImages = images.filter(img => img.id !== imageId);

        const file = await this.getFile('docs/api/images.json');
        const sha = file ? file.sha : null;

        return this.updateFile(
            'docs/api/images.json',
            filteredImages,
            `🗑️ Delete image: ${imageId}`,
            sha
        );
    }

    // Sync operations
    async syncFromGitHub() {
        try {
            const [currentImage, devices, images, schedule] = await Promise.all([
                this.getCurrentImage(),
                this.getDevices(),
                this.getImageLibrary(),
                this.getSchedule()
            ]);

            return {
                currentImage,
                devices,
                imageLibrary: images,
                schedule: schedule || {
                    mode: 'manual',
                    interval: 60,
                    intervalUnit: 'minutes',
                    times: ['08:00'],
                    activeHoursStart: '06:00',
                    activeHoursEnd: '22:00'
                }
            };
        } catch (error) {
            console.error('Sync from GitHub failed:', error);
            throw error;
        }
    }

    async getSchedule() {
        const file = await this.getFile('docs/api/schedule.json');
        return file ? file.content : null;
    }

    // Rate limiting helpers
    getRateLimitStatus() {
        return {
            remaining: this.rateLimitRemaining,
            resetTime: new Date(this.rateLimitReset * 1000),
            isLimited: this.rateLimitRemaining <= 5
        };
    }

    async waitForRateLimit() {
        const status = this.getRateLimitStatus();
        if (status.isLimited) {
            const waitTime = Math.max(0, status.resetTime.getTime() - Date.now());
            console.log(`Rate limited. Waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
        }
    }

    // Webhook simulation for real-time updates
    startPolling(callback, interval = 30000) {
        let lastTimestamp = 0;

        const poll = async () => {
            try {
                const file = await this.getFile('docs/api/timestamp.json');
                if (file && file.content.timestamp > lastTimestamp) {
                    lastTimestamp = file.content.timestamp;
                    const data = await this.syncFromGitHub();
                    callback(data);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        };

        return setInterval(poll, interval);
    }

    // Utility methods
    async getCommitHistory(path = 'docs/api/', limit = 10) {
        const response = await this.makeRequest(
            `/repos/${this.owner}/${this.repo}/commits?path=${path}&per_page=${limit}`
        );

        if (!response.ok) {
            throw new Error('Failed to get commit history');
        }

        const commits = await response.json();
        return commits.map(commit => ({
            sha: commit.sha,
            message: commit.commit.message,
            date: commit.commit.committer.date,
            author: commit.commit.author.name,
            url: commit.html_url
        }));
    }

    async getRepoStats() {
        const response = await this.makeRequest(`/repos/${this.owner}/${this.repo}`);
        
        if (!response.ok) {
            throw new Error('Failed to get repository stats');
        }

        const repo = await response.json();
        return {
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            size: repo.size,
            lastPush: repo.pushed_at,
            isPrivate: repo.private
        };
    }
}

// Export for use in main application
window.GitHubPersistence = GitHubPersistence;