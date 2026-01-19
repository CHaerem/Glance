/**
 * Tests for firmware OTA routes
 * Critical tests for OTA update functionality - device bricking risk if this fails
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Create test fixtures
const TEST_FIRMWARE_CONTENT = Buffer.from('FAKE_FIRMWARE_BINARY_CONTENT_FOR_TESTING');
const TEST_FIRMWARE_SHA256 = crypto.createHash('sha256').update(TEST_FIRMWARE_CONTENT).digest('hex');

describe('Firmware Routes', () => {
    let app;
    let testDataDir;
    let firmwarePath;
    let firmwareInfoPath;
    let forceOtaPath;

    beforeAll(() => {
        // Create temporary test directory
        testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-firmware-test-'));
        firmwarePath = path.join(testDataDir, 'firmware.bin');
        firmwareInfoPath = path.join(testDataDir, 'firmware-info.json');
        forceOtaPath = path.join(testDataDir, 'force-ota.json');
    });

    afterAll(() => {
        // Clean up test directory
        try {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        } catch (e) {
            console.warn('Failed to clean up test directory:', e);
        }
    });

    beforeEach(() => {
        // Clean up files between tests
        [firmwarePath, firmwareInfoPath, forceOtaPath].forEach(file => {
            try {
                if (fs.existsSync(file)) fs.unlinkSync(file);
            } catch (e) { /* ignore */ }
        });

        // Create fresh Express app with firmware routes
        const { createFirmwareRoutes } = require('../../dist/src/routes/firmware');
        app = express();
        app.use(express.json());
        app.use('/api/firmware', createFirmwareRoutes({
            dataDir: testDataDir,
            firmwareVersion: '1.0.0-test',
            buildDate: '2024-01-01T00:00:00Z'
        }));
    });

    describe('GET /api/firmware/version', () => {
        it('should return 404 when no firmware exists', async () => {
            const response = await request(app)
                .get('/api/firmware/version')
                .expect(404);

            expect(response.body).toHaveProperty('error', 'No firmware available');
        });

        it('should return firmware info when firmware exists', async () => {
            // Create test firmware
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/version')
                .expect(200);

            expect(response.body).toHaveProperty('version');
            expect(response.body).toHaveProperty('size', TEST_FIRMWARE_CONTENT.length);
            expect(response.body).toHaveProperty('sha256', TEST_FIRMWARE_SHA256);
            expect(response.body).toHaveProperty('minBattery');
            expect(response.body).toHaveProperty('forceUpdate');
            expect(response.body).toHaveProperty('deployedAt');
        });

        it('should cache firmware info', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            // First call - generates info
            await request(app)
                .get('/api/firmware/version')
                .expect(200);

            // Verify cache file was created
            expect(fs.existsSync(firmwareInfoPath)).toBe(true);

            // Second call - uses cache
            const response = await request(app)
                .get('/api/firmware/version')
                .expect(200);

            expect(response.body.sha256).toBe(TEST_FIRMWARE_SHA256);
        });

        it('should regenerate info when firmware changes', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            // First call
            await request(app)
                .get('/api/firmware/version')
                .expect(200);

            // Modify firmware (simulate new upload)
            const newContent = Buffer.from('NEW_FIRMWARE_CONTENT');
            const newSha256 = crypto.createHash('sha256').update(newContent).digest('hex');

            // Need to wait a bit so mtime changes
            await new Promise(resolve => setTimeout(resolve, 100));
            fs.writeFileSync(firmwarePath, newContent);

            // Second call should detect change
            const response = await request(app)
                .get('/api/firmware/version')
                .expect(200);

            expect(response.body.sha256).toBe(newSha256);
            expect(response.body.size).toBe(newContent.length);
        });

        it('should report forceUpdate status', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            // Default is false
            let response = await request(app)
                .get('/api/firmware/version')
                .expect(200);
            expect(response.body.forceUpdate).toBe(false);

            // Set force OTA
            fs.writeFileSync(forceOtaPath, JSON.stringify({
                forceUpdate: true,
                updatedAt: new Date().toISOString()
            }));

            response = await request(app)
                .get('/api/firmware/version')
                .expect(200);
            expect(response.body.forceUpdate).toBe(true);
        });
    });

    describe('GET /api/firmware/download', () => {
        it('should return 404 when no firmware exists', async () => {
            await request(app)
                .get('/api/firmware/download')
                .expect(404);
        });

        it('should stream firmware binary', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/download')
                .expect(200);

            expect(response.headers['content-type']).toBe('application/octet-stream');
            expect(response.headers['content-length']).toBe(String(TEST_FIRMWARE_CONTENT.length));
            expect(response.headers['content-disposition']).toContain('firmware.bin');
            expect(response.body).toEqual(TEST_FIRMWARE_CONTENT);
        });

        it('should accept deviceId query parameter', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/download?deviceId=test-device-123')
                .expect(200);

            expect(response.body).toEqual(TEST_FIRMWARE_CONTENT);
        });
    });

    describe('POST /api/firmware/force', () => {
        it('should return 400 for invalid request body', async () => {
            const response = await request(app)
                .post('/api/firmware/force')
                .send({ invalid: 'data' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should enable force OTA', async () => {
            const response = await request(app)
                .post('/api/firmware/force')
                .send({ enabled: true })
                .expect(200);

            expect(response.body.forceUpdate).toBe(true);
            expect(response.body.message).toContain('enabled');

            // Verify state was persisted
            const state = JSON.parse(fs.readFileSync(forceOtaPath, 'utf8'));
            expect(state.forceUpdate).toBe(true);
        });

        it('should disable force OTA', async () => {
            // First enable
            fs.writeFileSync(forceOtaPath, JSON.stringify({
                forceUpdate: true,
                updatedAt: new Date().toISOString()
            }));

            // Then disable
            const response = await request(app)
                .post('/api/firmware/force')
                .send({ enabled: false })
                .expect(200);

            expect(response.body.forceUpdate).toBe(false);
            expect(response.body.message).toContain('disabled');

            // Verify state was persisted
            const state = JSON.parse(fs.readFileSync(forceOtaPath, 'utf8'));
            expect(state.forceUpdate).toBe(false);
        });
    });

    describe('GET /api/firmware/status', () => {
        it('should return unavailable when no firmware exists', async () => {
            const response = await request(app)
                .get('/api/firmware/status')
                .expect(200);

            expect(response.body.available).toBe(false);
            expect(response.body).toHaveProperty('message');
        });

        it('should return available with info when firmware exists', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/status')
                .expect(200);

            expect(response.body.available).toBe(true);
            expect(response.body.size).toBe(TEST_FIRMWARE_CONTENT.length);
            expect(response.body.version).toBe('1.0.0-test');
        });
    });

    describe('OTA Safety Checks', () => {
        it('should require minimum battery level', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/version')
                .expect(200);

            // minBattery should be set to a safe level (3.8V to prevent brownouts)
            expect(response.body.minBattery).toBeGreaterThanOrEqual(3.6);
        });

        it('should provide SHA256 for firmware verification', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/version')
                .expect(200);

            // SHA256 should be present and valid hex
            expect(response.body.sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(response.body.sha256).toBe(TEST_FIRMWARE_SHA256);
        });

        it('should set no-cache header on downloads', async () => {
            fs.writeFileSync(firmwarePath, TEST_FIRMWARE_CONTENT);

            const response = await request(app)
                .get('/api/firmware/download')
                .expect(200);

            expect(response.headers['cache-control']).toBe('no-cache');
        });
    });
});
