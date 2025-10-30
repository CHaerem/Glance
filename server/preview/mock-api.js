/**
 * Mock API Server for GitHub Pages Preview
 *
 * Enhanced version with visually rich placeholder generation
 * for proper UX/design testing
 */

class MockAPI {
    constructor() {
        this.storage = {
            settings: {
                defaultSleepDuration: 3600000000,
                devMode: false,
                devServerHost: '',
                defaultOrientation: 'portrait',
                nightSleepEnabled: false,
                nightSleepStartHour: 23,
                nightSleepEndHour: 5
            },
            currentImage: {
                imageId: 'demo-001',
                originalImage: null,
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

        this.generateDemoImage();
    }

    /**
     * Generate visually rich placeholder based on prompt
     */
    generateArtisticImage(prompt, width = 400, height = 533) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Extract style hints from prompt
        const lowerPrompt = prompt.toLowerCase();
        let style = 'abstract';

        if (lowerPrompt.includes('landscape') || lowerPrompt.includes('mountain') || lowerPrompt.includes('lake')) {
            style = 'landscape';
        } else if (lowerPrompt.includes('portrait') || lowerPrompt.includes('face') || lowerPrompt.includes('person')) {
            style = 'portrait';
        } else if (lowerPrompt.includes('geometric') || lowerPrompt.includes('pattern')) {
            style = 'geometric';
        } else if (lowerPrompt.includes('minimal')) {
            style = 'minimal';
        }

        // Generate based on style
        switch(style) {
            case 'landscape':
                this.drawLandscape(ctx, width, height, prompt);
                break;
            case 'portrait':
                this.drawPortrait(ctx, width, height, prompt);
                break;
            case 'geometric':
                this.drawGeometric(ctx, width, height, prompt);
                break;
            case 'minimal':
                this.drawMinimal(ctx, width, height, prompt);
                break;
            default:
                this.drawAbstract(ctx, width, height, prompt);
        }

        // Add subtle prompt text at bottom
        this.addPromptOverlay(ctx, width, height, prompt);

        return canvas.toDataURL('image/png').split(',')[1];
    }

    drawLandscape(ctx, width, height, prompt) {
        // Sky gradient
        const skyGradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        skyGradient.addColorStop(0, '#87CEEB');
        skyGradient.addColorStop(0.5, '#B0E0E6');
        skyGradient.addColorStop(1, '#FFE4B5');
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, width, height * 0.6);

        // Mountains in layers
        const mountainLayers = [
            { y: height * 0.4, color: '#4A5568', points: 5 },
            { y: height * 0.45, color: '#718096', points: 6 },
            { y: height * 0.5, color: '#A0AEC0', points: 7 }
        ];

        mountainLayers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, height * 0.6);

            for (let i = 0; i <= layer.points; i++) {
                const x = (width / layer.points) * i;
                const peakHeight = layer.y + (Math.sin(i * 1.5) * height * 0.1);
                ctx.lineTo(x, peakHeight);
            }

            ctx.lineTo(width, height * 0.6);
            ctx.closePath();
            ctx.fill();
        });

        // Foreground - grass/lake
        const groundGradient = ctx.createLinearGradient(0, height * 0.6, 0, height);
        if (prompt.toLowerCase().includes('lake')) {
            groundGradient.addColorStop(0, '#4682B4');
            groundGradient.addColorStop(1, '#1E3A5F');
        } else {
            groundGradient.addColorStop(0, '#90EE90');
            groundGradient.addColorStop(1, '#228B22');
        }
        ctx.fillStyle = groundGradient;
        ctx.fillRect(0, height * 0.6, width, height * 0.4);

        // Sun/Moon
        ctx.fillStyle = prompt.toLowerCase().includes('sunset') ? '#FF6347' : '#FFD700';
        ctx.beginPath();
        ctx.arc(width * 0.8, height * 0.2, 30, 0, Math.PI * 2);
        ctx.fill();

        // Add some trees
        for (let i = 0; i < 5; i++) {
            const treeX = (width / 6) * (i + 1) + (Math.random() * 20 - 10);
            const treeY = height * 0.6 + (Math.random() * height * 0.1);
            this.drawTree(ctx, treeX, treeY, 15 + Math.random() * 10);
        }
    }

    drawTree(ctx, x, y, size) {
        // Trunk
        ctx.fillStyle = '#654321';
        ctx.fillRect(x - size * 0.1, y, size * 0.2, size);

        // Foliage
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.5);
        ctx.lineTo(x - size * 0.4, y + size * 0.2);
        ctx.lineTo(x + size * 0.4, y + size * 0.2);
        ctx.closePath();
        ctx.fill();
    }

    drawPortrait(ctx, width, height, prompt) {
        // Background
        const bgGradient = ctx.createRadialGradient(width/2, height/3, 0, width/2, height/3, width);
        bgGradient.addColorStop(0, '#FFF5E1');
        bgGradient.addColorStop(1, '#D2B48C');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);

        // Head
        const centerX = width / 2;
        const centerY = height * 0.4;
        const headRadius = width * 0.25;

        ctx.fillStyle = '#FFDAB9';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, headRadius * 0.8, headRadius, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#4A2C2A';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY - headRadius * 0.3, headRadius * 0.85, headRadius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        ctx.arc(centerX - headRadius * 0.3, centerY - headRadius * 0.1, headRadius * 0.08, 0, Math.PI * 2);
        ctx.arc(centerX + headRadius * 0.3, centerY - headRadius * 0.1, headRadius * 0.08, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.strokeStyle = '#B8956A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX - headRadius * 0.05, centerY + headRadius * 0.15);
        ctx.stroke();

        // Mouth
        ctx.strokeStyle = '#D2691E';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY + headRadius * 0.3, headRadius * 0.3, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Shoulders
        ctx.fillStyle = '#4682B4';
        ctx.beginPath();
        ctx.moveTo(centerX - headRadius * 1.2, height);
        ctx.lineTo(centerX - headRadius * 0.6, centerY + headRadius);
        ctx.lineTo(centerX + headRadius * 0.6, centerY + headRadius);
        ctx.lineTo(centerX + headRadius * 1.2, height);
        ctx.closePath();
        ctx.fill();
    }

    drawGeometric(ctx, width, height, prompt) {
        // Clean background
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, width, height);

        // Generate geometric pattern
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
        const shapes = Math.floor(Math.random() * 10) + 15;

        for (let i = 0; i < shapes; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 80 + 40;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const shape = Math.floor(Math.random() * 3);

            ctx.fillStyle = color + '80'; // Add transparency
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;

            ctx.beginPath();
            switch(shape) {
                case 0: // Circle
                    ctx.arc(x, y, size/2, 0, Math.PI * 2);
                    break;
                case 1: // Square
                    ctx.rect(x - size/2, y - size/2, size, size);
                    break;
                case 2: // Triangle
                    ctx.moveTo(x, y - size/2);
                    ctx.lineTo(x - size/2, y + size/2);
                    ctx.lineTo(x + size/2, y + size/2);
                    ctx.closePath();
                    break;
            }
            ctx.fill();
            ctx.stroke();
        }
    }

    drawMinimal(ctx, width, height, prompt) {
        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Single focal element
        const centerX = width / 2;
        const centerY = height / 2;

        // Large circle
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.min(width, height) * 0.3, 0, Math.PI * 2);
        ctx.stroke();

        // Smaller circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.min(width, height) * 0.15, 0, Math.PI * 2);
        ctx.stroke();

        // Line through
        ctx.beginPath();
        ctx.moveTo(centerX - width * 0.3, centerY);
        ctx.lineTo(centerX + width * 0.3, centerY);
        ctx.stroke();
    }

    drawAbstract(ctx, width, height, prompt) {
        // Colorful gradient background
        const hue1 = Math.random() * 360;
        const hue2 = (hue1 + 120) % 360;
        const hue3 = (hue1 + 240) % 360;

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, `hsl(${hue1}, 70%, 60%)`);
        gradient.addColorStop(0.5, `hsl(${hue2}, 70%, 60%)`);
        gradient.addColorStop(1, `hsl(${hue3}, 70%, 60%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Organic shapes
        const shapes = Math.floor(Math.random() * 5) + 8;
        for (let i = 0; i < shapes; i++) {
            ctx.fillStyle = `hsla(${Math.random() * 360}, 60%, 70%, 0.4)`;
            ctx.beginPath();

            const centerX = Math.random() * width;
            const centerY = Math.random() * height;
            const radius = Math.random() * 100 + 50;

            // Blob shape
            for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
                const wobble = Math.random() * 20 + radius;
                const x = centerX + Math.cos(angle) * wobble;
                const y = centerY + Math.sin(angle) * wobble;
                if (angle === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fill();
        }
    }

    addPromptOverlay(ctx, width, height, prompt) {
        // Semi-transparent overlay at bottom
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, height - 60, width, 60);

        // Prompt text
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Truncate prompt if too long
        let displayPrompt = prompt;
        if (prompt.length > 50) {
            displayPrompt = prompt.substring(0, 47) + '...';
        }

        ctx.fillText(displayPrompt, width / 2, height - 30);
    }

    generateDemoImage() {
        const base64 = this.generateArtisticImage(
            'A serene landscape with mountains and a lake at sunset',
            400,
            533
        );

        this.storage.currentImage.originalImage = base64;

        const imageData = {
            imageId: 'demo-001',
            originalImage: base64,
            originalImageMime: 'image/png',
            originalPrompt: 'A serene landscape with mountains and a lake at sunset',
            thumbnail: base64,
            timestamp: Date.now() - 3600000
        };

        this.storage.images.set('demo-001', imageData);
        this.storage.history.unshift({
            imageId: 'demo-001',
            thumbnail: base64,
            timestamp: Date.now() - 3600000
        });
    }

    generateMockCollections() {
        return [
            { id: 'renaissance-masters', name: 'Renaissance Masters', description: 'Great works from the Renaissance period' },
            { id: 'dutch-masters', name: 'Dutch Masters', description: 'Dutch Golden Age paintings' },
            { id: 'impressionists', name: 'Impressionists', description: 'French Impressionist masterpieces' },
            { id: 'post-impressionists', name: 'Post-Impressionists', description: 'Post-Impressionist works' },
            { id: 'japanese-masters', name: 'Japanese Masters', description: 'Traditional Japanese art' },
            { id: 'modern-icons', name: 'Modern Icons', description: 'Modern and contemporary art' }
        ];
    }

    generateMockArtworks(collectionId) {
        // Generate visually distinct artwork placeholders
        const artworks = [];
        const artworkData = {
            'renaissance-masters': [
                { title: 'Mona Lisa', artist: 'Leonardo da Vinci', style: 'portrait' },
                { title: 'The Birth of Venus', artist: 'Sandro Botticelli', style: 'portrait' },
                { title: 'The School of Athens', artist: 'Raphael', style: 'geometric' },
                { title: 'The Creation of Adam', artist: 'Michelangelo', style: 'portrait' }
            ],
            'dutch-masters': [
                { title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', style: 'portrait' },
                { title: 'The Night Watch', artist: 'Rembrandt', style: 'abstract' },
                { title: 'The Milkmaid', artist: 'Johannes Vermeer', style: 'portrait' }
            ],
            'impressionists': [
                { title: 'Water Lilies', artist: 'Claude Monet', style: 'landscape' },
                { title: 'Bal du moulin de la Galette', artist: 'Pierre-Auguste Renoir', style: 'abstract' },
                { title: 'Impression, Sunrise', artist: 'Claude Monet', style: 'landscape' }
            ],
            'post-impressionists': [
                { title: 'The Starry Night', artist: 'Vincent van Gogh', style: 'landscape' },
                { title: 'The Card Players', artist: 'Paul Cézanne', style: 'portrait' },
                { title: 'A Sunday Afternoon', artist: 'Georges Seurat', style: 'geometric' }
            ],
            'japanese-masters': [
                { title: 'The Great Wave', artist: 'Hokusai', style: 'landscape' },
                { title: 'Red Fuji', artist: 'Hokusai', style: 'landscape' },
                { title: 'Plum Blossoms', artist: 'Hiroshige', style: 'minimal' }
            ],
            'modern-icons': [
                { title: 'The Persistence of Memory', artist: 'Salvador Dalí', style: 'abstract' },
                { title: 'Campbell\'s Soup Cans', artist: 'Andy Warhol', style: 'minimal' },
                { title: 'The Scream', artist: 'Edvard Munch', style: 'portrait' }
            ]
        };

        const collectionArt = artworkData[collectionId] || [];

        collectionArt.forEach((art, index) => {
            const prompt = `${art.title} by ${art.artist}, ${art.style} style`;
            const thumbnail = this.generateArtisticImage(prompt, 200, 200);
            const fullImage = this.generateArtisticImage(prompt, 800, 800);

            artworks.push({
                id: `${collectionId}-${index}`,
                title: art.title,
                artist: art.artist,
                thumbnail: `data:image/png;base64,${thumbnail}`,
                imageUrl: `data:image/png;base64,${fullImage}`
            });
        });

        return artworks;
    }

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

    async simulateGeneration(prompt, rotation = 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const imageId = 'mock-' + Date.now();
        const width = (rotation === 90 || rotation === 270) ? 533 : 400;
        const height = (rotation === 90 || rotation === 270) ? 400 : 533;

        const base64 = this.generateArtisticImage(prompt, width, height);

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

        this.storage.history.unshift({
            imageId,
            thumbnail: base64,
            timestamp: Date.now()
        });

        if (this.storage.history.length > 20) {
            this.storage.history = this.storage.history.slice(0, 20);
        }

        return { imageId, current: this.storage.currentImage };
    }

    async handleRequest(method, path, body = null) {
        console.log(`[MockAPI] ${method} ${path}`, body);

        if (path === '/api/settings' && method === 'GET') {
            return this.storage.settings;
        }
        if (path === '/api/settings' && method === 'PUT') {
            this.storage.settings = { ...this.storage.settings, ...body };
            return { success: true };
        }

        if (path === '/api/current-full.json' && method === 'GET') {
            return {
                ...this.storage.currentImage,
                deviceStatus: this.storage.devices['esp32-001']
            };
        }

        if (path === '/api/generate-art' && method === 'POST') {
            return await this.simulateGeneration(body.prompt, body.rotation);
        }

        if (path === '/api/lucky-prompt' && method === 'POST') {
            return { prompt: this.generateRandomPrompt(body.currentPrompt) };
        }

        if (path === '/api/upload' && method === 'POST') {
            const imageId = 'upload-' + Date.now();
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { imageId, success: true };
        }

        if (path === '/api/collections' && method === 'GET') {
            return { collections: this.storage.collections };
        }

        if (path.startsWith('/api/collections/') && method === 'GET') {
            const collectionId = path.split('/')[3];
            return {
                id: collectionId,
                artworks: this.generateMockArtworks(collectionId)
            };
        }

        if (path.startsWith('/api/images/') && method === 'GET') {
            const imageId = path.split('/')[3];
            return this.storage.images.get(imageId) || null;
        }

        if (path === '/api/history' && method === 'GET') {
            return this.storage.history;
        }

        if (path.startsWith('/api/history/') && path.endsWith('/') === false && method === 'DELETE') {
            const imageId = path.split('/')[3];
            this.storage.history = this.storage.history.filter(h => h.imageId !== imageId);
            this.storage.images.delete(imageId);
            return { success: true };
        }

        if (path.match(/\/api\/history\/.+\/load/) && method === 'POST') {
            const imageId = path.split('/')[3];
            const image = this.storage.images.get(imageId);
            if (image) {
                this.storage.currentImage = image;
                return { success: true };
            }
            return { error: 'Image not found' };
        }

        if (path === '/api/art/import' && method === 'POST') {
            await new Promise(resolve => setTimeout(resolve, 1500));
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

        if (path.startsWith('/api/art/search') && method === 'GET') {
            const allArtworks = [];
            for (const collectionId of ['renaissance-masters', 'impressionists', 'japanese-masters']) {
                allArtworks.push(...this.generateMockArtworks(collectionId));
            }
            return { results: allArtworks.slice(0, 8) };
        }

        if (path === '/api/esp32-status' && method === 'GET') {
            return this.storage.devices['esp32-001'];
        }

        if (path === '/api/system-info' && method === 'GET') {
            return {
                version: 'preview-mock',
                nodeVersion: 'mock-v20.0.0',
                platform: 'browser',
                uptime: 3600
            };
        }

        if (path === '/api/logs' && method === 'GET') {
            return { logs: this.storage.logs };
        }

        if (path === '/api/device-logs' && method === 'GET') {
            return { logs: this.storage.deviceLogs };
        }

        if (path === '/api/client-ip' && method === 'GET') {
            return { ip: '192.168.1.100' };
        }

        return { error: 'Not found' };
    }
}

// Initialize mock API
window.mockAPI = new MockAPI();

// Intercept fetch calls
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
        const method = options.method || 'GET';
        let body = null;

        if (options.body) {
            if (options.body instanceof FormData) {
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

    return originalFetch.apply(this, arguments);
};

console.log('[MockAPI] Preview mode activated - generating artistic placeholders');
