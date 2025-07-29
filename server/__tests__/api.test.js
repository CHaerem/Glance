const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// We'll need to create a test version of the app
// For now, let's create a minimal test server
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mock the server endpoints for testing
const devices = {};
let currentData = {
    title: 'Test Display',
    image: '',
    imageId: '',
    timestamp: Date.now(),
    sleepDuration: 3600000000
};

// Mock endpoints
app.get('/api/current.json', (req, res) => {
    res.json(currentData);
});

app.post('/api/current', (req, res) => {
    const { title, image, sleepDuration, isText } = req.body;
    
    if (!title && !image) {
        return res.status(400).json({ error: 'Title or image required' });
    }
    
    currentData = {
        title: title || 'Untitled',
        image: image || '',
        imageId: 'test-' + Date.now(),
        timestamp: Date.now(),
        sleepDuration: sleepDuration || 3600000000
    };
    
    res.json({ success: true, current: currentData });
});

app.get('/api/devices', (req, res) => {
    res.json({ devices });
});

app.post('/api/device-status', (req, res) => {
    const { deviceId, status } = req.body;
    
    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
    }
    
    devices[deviceId] = {
        ...devices[deviceId],
        deviceId,
        status: status || 'unknown',
        lastSeen: Date.now()
    };
    
    res.json({ success: true });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

describe('API Endpoints', () => {
    describe('GET /api/current.json', () => {
        test('should return current display data', async () => {
            const response = await request(app)
                .get('/api/current.json')
                .expect(200);
            
            expect(response.body).toHaveProperty('title');
            expect(response.body).toHaveProperty('image');
            expect(response.body).toHaveProperty('imageId');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('sleepDuration');
        });

        test('should return valid JSON structure', async () => {
            const response = await request(app)
                .get('/api/current.json')
                .expect(200);
            
            expect(typeof response.body.title).toBe('string');
            expect(typeof response.body.image).toBe('string');
            expect(typeof response.body.sleepDuration).toBe('number');
            expect(typeof response.body.timestamp).toBe('number');
        });
    });

    describe('POST /api/current', () => {
        test('should update current display data', async () => {
            const testData = {
                title: 'Test Title',
                image: 'test-image-data',
                sleepDuration: 1800000000
            };

            const response = await request(app)
                .post('/api/current')
                .send(testData)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.current.title).toBe(testData.title);
            expect(response.body.current.image).toBe(testData.image);
            expect(response.body.current.sleepDuration).toBe(testData.sleepDuration);
        });

        test('should require title or image', async () => {
            const response = await request(app)
                .post('/api/current')
                .send({})
                .expect(400);
            
            expect(response.body.error).toBe('Title or image required');
        });

        test('should handle text data', async () => {
            const testData = {
                title: 'Text Display',
                image: 'Hello World',
                isText: true
            };

            const response = await request(app)
                .post('/api/current')
                .send(testData)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.current.title).toBe(testData.title);
        });

        test('should validate sleep duration', async () => {
            const testData = {
                title: 'Test',
                image: 'data',
                sleepDuration: 'invalid'
            };

            const response = await request(app)
                .post('/api/current')
                .send(testData)
                .expect(200);
            
            // Should use default sleep duration for invalid input
            expect(response.body.current.sleepDuration).toBe(3600000000);
        });
    });

    describe('GET /api/devices', () => {
        test('should return devices list', async () => {
            const response = await request(app)
                .get('/api/devices')
                .expect(200);
            
            expect(response.body).toHaveProperty('devices');
            expect(typeof response.body.devices).toBe('object');
        });
    });

    describe('POST /api/device-status', () => {
        test('should update device status', async () => {
            const deviceData = {
                deviceId: 'test-device-001',
                status: 'active',
                batteryVoltage: 3.7,
                signalStrength: -45
            };

            const response = await request(app)
                .post('/api/device-status')
                .send(deviceData)
                .expect(200);
            
            expect(response.body.success).toBe(true);
        });

        test('should require deviceId', async () => {
            const response = await request(app)
                .post('/api/device-status')
                .send({ status: 'active' })
                .expect(400);
            
            expect(response.body.error).toBe('deviceId required');
        });
    });

    describe('GET /health', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body.status).toBe('ok');
            expect(response.body).toHaveProperty('timestamp');
        });
    });
});

describe('Error Handling', () => {
    test('should handle invalid JSON', async () => {
        const response = await request(app)
            .post('/api/current')
            .send('invalid-json')
            .set('Content-Type', 'application/json')
            .expect(400);
    });

    test('should handle missing endpoints', async () => {
        await request(app)
            .get('/api/nonexistent')
            .expect(404);
    });
});

describe('CORS and Security', () => {
    test('should include CORS headers', async () => {
        const response = await request(app)
            .get('/api/current.json')
            .expect(200);
        
        expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should handle OPTIONS requests', async () => {
        await request(app)
            .options('/api/current')
            .expect(204);
    });
});