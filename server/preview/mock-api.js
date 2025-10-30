/**
 * Mock API Server for GitHub Pages Preview
 *
 * This mock API runs entirely in the browser and simulates the Glance server API
 * for demo and GUI testing purposes. No real backend or OpenAI calls are made.
 */

class MockAPI {
    constructor() {
        // Initialize mock data storage
        this.storage = {
            settings: {
                defaultSleepDuration: 3600000000, // 1 hour in microseconds
                devMode: false,
                devServerHost: '',
                defaultOrientation: 'portrait',
                nightSleepEnabled: false,
                nightSleepStartHour: 23,
                nightSleepEndHour: 5
            },
            currentImage: {
                imageId: 'demo-001',
                originalImage: null, // Will be populated
                originalImageMime: 'image/png',
                originalPrompt: 'A serene landscape with mountains and a lake at sunset',
                timestamp: Date.now() - 3600000
            },
            images: new Map(),
            history: [],
            devices: {
                'esp32-001': {
                    deviceId: 'esp32-001',
                    state: 'sleeping',
                    batteryVoltage: 4.1,
                    batteryPercent: 85,
                    isCharging: false,
                    lastChargeTimestamp: Date.now() - 7200000,
                    signalStrength: -45,
                    lastSeen: Date.now() - 1800000,
                    sleepDuration: 3600000000,
                    status: 'sleeping'
                }
            },
            logs: [
                '[2025-10-30 10:15:32] Server started',
                '[2025-10-30 10:15:33] Mock API initialized',
                '[2025-10-30 10:16:45] ESP32 connected',
                '[2025-10-30 10:17:12] Image generated: demo-001'
            ],
            deviceLogs: [
                '[2025-10-30 10:16:45] ESP32 woke up',
                '[2025-10-30 10:16:46] Connected to WiFi',
                '[2025-10-30 10:16:47] Battery: 4.1V (85%)',
                '[2025-10-30 10:17:12] Display refresh complete',
                '[2025-10-30 10:17:13] Entering deep sleep for 60 minutes'
            ],
            collections: this.generateMockCollections()
        };

        // Generate initial demo image
        this.generateDemoImage();
    }

    /**
     * Generate a demo image for the current display
     */
    generateDemoImage() {
        // Create a canvas with a demo pattern
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 533; // 3:4 aspect ratio
        const ctx = canvas.getContext('2d');

        // Draw a gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#FFE5E5');
        gradient.addColorStop(0.5, '#FFF5E5');
        gradient.addColorStop(1, '#E5F5FF');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw some shapes
        ctx.fillStyle = '#FF6B6B';
        ctx.beginPath();
        ctx.arc(100, 150, 50, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4ECDC4';
        ctx.fillRect(250, 100, 100, 100);

        ctx.fillStyle = '#FFE66D';
        ctx.beginPath();
        ctx.moveTo(200, 300);
        ctx.lineTo(150, 400);
        ctx.lineTo(250, 400);
        ctx.closePath();
        ctx.fill();

        // Add text
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '24px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Glance Demo', canvas.width / 2, 450);
        ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText('Mock preview mode', canvas.width / 2, 480);

        // Convert to base64
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        this.storage.currentImage.originalImage = base64;

        // Add to images map
        this.storage.images.set('demo-001', {
            imageId: 'demo-001',
            originalImage: base64,
            originalImageMime: 'image/png',
            originalPrompt: 'A serene landscape with mountains and a lake at sunset',
            thumbnail: base64,
            timestamp: Date.now() - 3600000
        });

        // Add to history
        this.storage.history.unshift({
            imageId: 'demo-001',
            thumbnail: base64,
            timestamp: Date.now() - 3600000
        });
    }

    /**
     * Generate mock art collections
     */
    generateMockCollections() {
        return [
            {
                id: 'renaissance-masters',
                name: 'Renaissance Masters',
                description: 'Great works from the Renaissance period'
            },
            {
                id: 'dutch-masters',
                name: 'Dutch Masters',
                description: 'Dutch Golden Age paintings'
            },
            {
                id: 'impressionists',
                name: 'Impressionists',
                description: 'French Impressionist masterpieces'
            },
            {
                id: 'post-impressionists',
                name: 'Post-Impressionists',
                description: 'Post-Impressionist works'
            },
            {
                id: 'japanese-masters',
                name: 'Japanese Masters',
                description: 'Traditional Japanese art'
            },
            {
                id: 'modern-icons',
                name: 'Modern Icons',
                description: 'Modern and contemporary art'
            }
        ];
    }

    /**
     * Generate mock artworks for a collection
     */
    generateMockArtworks(collectionId) {
        const mockArtworks = {
            'renaissance-masters': [
                { id: '1', title: 'Mona Lisa', artist: 'Leonardo da Vinci', thumbnail: this.generatePlaceholder('Mona Lisa'), imageUrl: this.generatePlaceholder('Mona Lisa', 800) },
                { id: '2', title: 'The Birth of Venus', artist: 'Sandro Botticelli', thumbnail: this.generatePlaceholder('Birth of Venus'), imageUrl: this.generatePlaceholder('Birth of Venus', 800) },
                { id: '3', title: 'The School of Athens', artist: 'Raphael', thumbnail: this.generatePlaceholder('School of Athens'), imageUrl: this.generatePlaceholder('School of Athens', 800) },
                { id: '4', title: 'The Creation of Adam', artist: 'Michelangelo', thumbnail: this.generatePlaceholder('Creation of Adam'), imageUrl: this.generatePlaceholder('Creation of Adam', 800) }
            ],
            'dutch-masters': [
                { id: '5', title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', thumbnail: this.generatePlaceholder('Girl with Pearl'), imageUrl: this.generatePlaceholder('Girl with Pearl', 800) },
                { id: '6', title: 'The Night Watch', artist: 'Rembrandt', thumbnail: this.generatePlaceholder('Night Watch'), imageUrl: this.generatePlaceholder('Night Watch', 800) },
                { id: '7', title: 'The Milkmaid', artist: 'Johannes Vermeer', thumbnail: this.generatePlaceholder('Milkmaid'), imageUrl: this.generatePlaceholder('Milkmaid', 800) }
            ],
            'impressionists': [
                { id: '8', title: 'Water Lilies', artist: 'Claude Monet', thumbnail: this.generatePlaceholder('Water Lilies'), imageUrl: this.generatePlaceholder('Water Lilies', 800) },
                { id: '9', title: 'Bal du moulin de la Galette', artist: 'Pierre-Auguste Renoir', thumbnail: this.generatePlaceholder('Bal du moulin'), imageUrl: this.generatePlaceholder('Bal du moulin', 800) },
                { id: '10', title: 'Impression, Sunrise', artist: 'Claude Monet', thumbnail: this.generatePlaceholder('Impression Sunrise'), imageUrl: this.generatePlaceholder('Impression Sunrise', 800) }
            ],
            'post-impressionists': [
                { id: '11', title: 'The Starry Night', artist: 'Vincent van Gogh', thumbnail: this.generatePlaceholder('Starry Night'), imageUrl: this.generatePlaceholder('Starry Night', 800) },
                { id: '12', title: 'The Card Players', artist: 'Paul Cézanne', thumbnail: this.generatePlaceholder('Card Players'), imageUrl: this.generatePlaceholder('Card Players', 800) },
                { id: '13', title: 'A Sunday Afternoon', artist: 'Georges Seurat', thumbnail: this.generatePlaceholder('Sunday Afternoon'), imageUrl: this.generatePlaceholder('Sunday Afternoon', 800) }
            ],
            'japanese-masters': [
                { id: '14', title: 'The Great Wave', artist: 'Hokusai', thumbnail: this.generatePlaceholder('Great Wave'), imageUrl: this.generatePlaceholder('Great Wave', 800) },
                { id: '15', title: 'Red Fuji', artist: 'Hokusai', thumbnail: this.generatePlaceholder('Red Fuji'), imageUrl: this.generatePlaceholder('Red Fuji', 800) },
                { id: '16', title: 'Plum Blossoms', artist: 'Hiroshige', thumbnail: this.generatePlaceholder('Plum Blossoms'), imageUrl: this.generatePlaceholder('Plum Blossoms', 800) }
            ],
            'modern-icons': [
                { id: '17', title: 'The Persistence of Memory', artist: 'Salvador Dalí', thumbnail: this.generatePlaceholder('Persistence'), imageUrl: this.generatePlaceholder('Persistence', 800) },
                { id: '18', title: 'Campbell\'s Soup Cans', artist: 'Andy Warhol', thumbnail: this.generatePlaceholder('Soup Cans'), imageUrl: this.generatePlaceholder('Soup Cans', 800) },
                { id: '19', title: 'The Scream', artist: 'Edvard Munch', thumbnail: this.generatePlaceholder('The Scream'), imageUrl: this.generatePlaceholder('The Scream', 800) }
            ]
        };

        return mockArtworks[collectionId] || [];
    }

    /**
     * Generate a placeholder image for artwork
     */
    generatePlaceholder(text, size = 200) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Random pastel background
        const hue = Math.random() * 360;
        ctx.fillStyle = `hsl(${hue}, 70%, 85%)`;
        ctx.fillRect(0, 0, size, size);

        // Text
        ctx.fillStyle = '#333';
        ctx.font = `${size / 15}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, size / 2, size / 2);

        return canvas.toDataURL('image/png');
    }

    /**
     * Generate a random art prompt
     */
    generateRandomPrompt(basePrompt = '') {
        const subjects = ['landscape', 'portrait', 'abstract art', 'still life', 'cityscape', 'seascape'];
        const styles = ['impressionist', 'minimalist', 'art nouveau', 'art deco', 'cubist', 'surrealist'];
        const moods = ['serene', 'dramatic', 'whimsical', 'melancholic', 'vibrant', 'ethereal'];
        const details = ['with soft lighting', 'with bold colors', 'in pastel tones', 'with intricate details', 'with geometric patterns'];

        if (basePrompt) {
            return `${basePrompt}, ${styles[Math.floor(Math.random() * styles.length)]} style, ${moods[Math.floor(Math.random() * moods.length)]} mood`;
        }

        return `A ${moods[Math.floor(Math.random() * moods.length)]} ${subjects[Math.floor(Math.random() * subjects.length)]}, ${styles[Math.floor(Math.random() * styles.length)]} style, ${details[Math.floor(Math.random() * details.length)]}`;
    }

    /**
     * Simulate image generation with delay
     */
    async simulateGeneration(prompt, rotation = 0) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create a new mock image
        const imageId = 'mock-' + Date.now();
        const canvas = document.createElement('canvas');

        // Adjust dimensions based on rotation
        if (rotation === 90 || rotation === 270) {
            canvas.width = 533;
            canvas.height = 400;
        } else {
            canvas.width = 400;
            canvas.height = 533;
        }

        const ctx = canvas.getContext('2d');

        // Generate random gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        const hue1 = Math.random() * 360;
        const hue2 = (hue1 + 60) % 360;
        gradient.addColorStop(0, `hsl(${hue1}, 60%, 80%)`);
        gradient.addColorStop(1, `hsl(${hue2}, 60%, 70%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add some random shapes
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `hsla(${Math.random() * 360}, 70%, 60%, 0.3)`;
            ctx.beginPath();
            ctx.arc(
                Math.random() * canvas.width,
                Math.random() * canvas.height,
                Math.random() * 100 + 20,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        // Add prompt text
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        const words = prompt.split(' ');
        let line = '';
        let y = canvas.height - 60;
        for (let word of words.slice(0, 10)) { // First 10 words only
            line += word + ' ';
        }
        ctx.fillText(line.trim() + '...', canvas.width / 2, y);

        const base64 = canvas.toDataURL('image/png').split(',')[1];

        // Store the new image
        const imageData = {
            imageId,
            originalImage: base64,
            originalImageMime: 'image/png',
            originalPrompt: prompt,
            thumbnail: base64,
            timestamp: Date.now()
        };

        this.storage.images.set(imageId, imageData);
        this.storage.currentImage = {
            imageId,
            originalImage: base64,
            originalImageMime: 'image/png',
            originalPrompt: prompt,
            timestamp: Date.now()
        };

        // Add to history
        this.storage.history.unshift({
            imageId,
            thumbnail: base64,
            timestamp: Date.now()
        });

        // Limit history to 20 items
        if (this.storage.history.length > 20) {
            this.storage.history = this.storage.history.slice(0, 20);
        }

        return { imageId, current: this.storage.currentImage };
    }

    /**
     * Route API requests to appropriate handlers
     */
    async handleRequest(method, path, body = null) {
        console.log(`[MockAPI] ${method} ${path}`, body);

        // Settings endpoints
        if (path === '/api/settings' && method === 'GET') {
            return this.storage.settings;
        }
        if (path === '/api/settings' && method === 'PUT') {
            this.storage.settings = { ...this.storage.settings, ...body };
            return { success: true };
        }

        // Current display
        if (path === '/api/current-full.json' && method === 'GET') {
            return {
                ...this.storage.currentImage,
                deviceStatus: this.storage.devices['esp32-001']
            };
        }

        // Generate art
        if (path === '/api/generate-art' && method === 'POST') {
            return await this.simulateGeneration(body.prompt, body.rotation);
        }

        // Lucky prompt
        if (path === '/api/lucky-prompt' && method === 'POST') {
            return { prompt: this.generateRandomPrompt(body.currentPrompt) };
        }

        // Upload
        if (path === '/api/upload' && method === 'POST') {
            // For file uploads, body would be FormData in real scenario
            // Here we'll just simulate it
            const imageId = 'upload-' + Date.now();
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { imageId, success: true };
        }

        // Collections
        if (path === '/api/collections' && method === 'GET') {
            return { collections: this.storage.collections };
        }

        // Collection artworks
        if (path.startsWith('/api/collections/') && method === 'GET') {
            const collectionId = path.split('/')[3];
            return {
                id: collectionId,
                artworks: this.generateMockArtworks(collectionId)
            };
        }

        // Images by ID
        if (path.startsWith('/api/images/') && method === 'GET') {
            const imageId = path.split('/')[3];
            return this.storage.images.get(imageId) || null;
        }

        // History
        if (path === '/api/history' && method === 'GET') {
            return this.storage.history;
        }

        // Delete history item
        if (path.startsWith('/api/history/') && path.endsWith('/') === false && method === 'DELETE') {
            const imageId = path.split('/')[3];
            this.storage.history = this.storage.history.filter(h => h.imageId !== imageId);
            this.storage.images.delete(imageId);
            return { success: true };
        }

        // Load from history
        if (path.match(/\/api\/history\/.+\/load/) && method === 'POST') {
            const imageId = path.split('/')[3];
            const image = this.storage.images.get(imageId);
            if (image) {
                this.storage.currentImage = image;
                return { success: true };
            }
            return { error: 'Image not found' };
        }

        // Import artwork
        if (path === '/api/art/import' && method === 'POST') {
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Simulate importing artwork
            const imageId = 'import-' + Date.now();
            this.storage.currentImage = {
                imageId,
                originalImage: body.imageUrl,
                originalImageMime: 'image/png',
                originalPrompt: `${body.title} by ${body.artist}`,
                timestamp: Date.now()
            };
            return { success: true, imageId };
        }

        // Art search
        if (path.startsWith('/api/art/search') && method === 'GET') {
            // Simple mock search - return random artworks
            const allArtworks = [];
            for (const collectionId of ['renaissance-masters', 'impressionists', 'japanese-masters']) {
                allArtworks.push(...this.generateMockArtworks(collectionId));
            }
            return { results: allArtworks.slice(0, 8) };
        }

        // ESP32 status
        if (path === '/api/esp32-status' && method === 'GET') {
            return this.storage.devices['esp32-001'];
        }

        // System info
        if (path === '/api/system-info' && method === 'GET') {
            return {
                version: 'preview-mock',
                nodeVersion: 'mock-v20.0.0',
                platform: 'browser',
                uptime: 3600
            };
        }

        // Logs
        if (path === '/api/logs' && method === 'GET') {
            return { logs: this.storage.logs };
        }

        // Device logs
        if (path === '/api/device-logs' && method === 'GET') {
            return { logs: this.storage.deviceLogs };
        }

        // Client IP (used for dev mode)
        if (path === '/api/client-ip' && method === 'GET') {
            return { ip: '192.168.1.100' };
        }

        // Default: not found
        return { error: 'Not found' };
    }
}

// Create global mock API instance
window.mockAPI = new MockAPI();

// Intercept fetch calls to redirect to mock API
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
    // Only intercept API calls
    if (typeof url === 'string' && url.startsWith('/api/')) {
        const method = options.method || 'GET';
        let body = null;

        if (options.body) {
            if (options.body instanceof FormData) {
                // Handle file uploads specially
                body = { type: 'file-upload' };
            } else if (typeof options.body === 'string') {
                try {
                    body = JSON.parse(options.body);
                } catch (e) {
                    body = options.body;
                }
            } else {
                body = options.body;
            }
        }

        try {
            const data = await window.mockAPI.handleRequest(method, url, body);

            // Return a mock Response object
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
                json: async () => data,
                text: async () => JSON.stringify(data),
                blob: async () => new Blob([JSON.stringify(data)], { type: 'application/json' })
            };
        } catch (error) {
            console.error('[MockAPI] Error:', error);
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Headers({ 'Content-Type': 'application/json' }),
                json: async () => ({ error: error.message }),
                text: async () => JSON.stringify({ error: error.message })
            };
        }
    }

    // Pass through non-API calls
    return originalFetch.apply(this, arguments);
};

console.log('[MockAPI] Preview mode activated - all API calls are mocked');
