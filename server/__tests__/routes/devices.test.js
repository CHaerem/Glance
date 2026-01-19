/**
 * Tests for device routes
 * Critical tests for battery monitoring and device state management
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Device Routes', () => {
    let app;
    let testDataDir;
    let devicesPath;
    let settingsPath;

    beforeAll(() => {
        // Create temporary test directory
        testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-device-test-'));
        devicesPath = path.join(testDataDir, 'devices.json');
        settingsPath = path.join(testDataDir, 'settings.json');

        // Mock the data-store to use test directory
        jest.mock('../../dist/src/utils/data-store', () => {
            const original = jest.requireActual('../../dist/src/utils/data-store');
            return {
                ...original,
                readJSONFile: async (filename) => {
                    const filePath = path.join(testDataDir, filename);
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        return JSON.parse(content);
                    } catch {
                        return null;
                    }
                },
                writeJSONFile: async (filename, data) => {
                    const filePath = path.join(testDataDir, filename);
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                },
                modifyJSONFile: async (filename, modifier, defaultValue) => {
                    const filePath = path.join(testDataDir, filename);
                    let data;
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        data = JSON.parse(content);
                    } catch {
                        data = defaultValue;
                    }
                    const modified = await modifier(data);
                    fs.writeFileSync(filePath, JSON.stringify(modified, null, 2));
                    return modified;
                }
            };
        });
    });

    afterAll(() => {
        // Clean up test directory
        try {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        } catch (e) {
            console.warn('Failed to clean up test directory:', e);
        }
        jest.resetModules();
    });

    beforeEach(() => {
        // Clean up files between tests
        [devicesPath, settingsPath].forEach(file => {
            try {
                if (fs.existsSync(file)) fs.unlinkSync(file);
            } catch (e) { /* ignore */ }
        });

        // Initialize empty devices file
        fs.writeFileSync(devicesPath, '{}');

        // Initialize settings
        fs.writeFileSync(settingsPath, JSON.stringify({
            sleepDuration: 900,
            devMode: false
        }));

        // Reset modules to pick up mock
        jest.resetModules();

        // Create fresh Express app with device routes
        const { createDeviceRoutes } = require('../../dist/src/routes/devices');
        app = express();
        app.use(express.json());
        app.use('/api', createDeviceRoutes({}));
    });

    describe('POST /api/device-status', () => {
        it('should reject invalid device ID', async () => {
            const response = await request(app)
                .post('/api/device-status')
                .send({ deviceId: '', status: {} })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject missing status object', async () => {
            const response = await request(app)
                .post('/api/device-status')
                .send({ deviceId: 'test-device-001' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should accept valid device status', async () => {
            const response = await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        batteryPercent: 75,
                        signalStrength: -65,
                        status: 'idle',
                        firmwareVersion: '1.0.0'
                    }
                })
                .expect(200);

            expect(response.body.success).toBe(true);

            // Verify device was saved
            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            expect(devices['test-device-001']).toBeDefined();
        });

        it('should calculate battery percentage from voltage', async () => {
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 4.0,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            // 4.0V should be around 80%
            expect(device.batteryPercent).toBeGreaterThan(70);
            expect(device.batteryPercent).toBeLessThanOrEqual(100);
        });

        it('should track battery history', async () => {
            // Send multiple status updates
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/api/device-status')
                    .send({
                        deviceId: 'test-device-001',
                        status: {
                            batteryVoltage: 3.9 - (i * 0.05),
                            signalStrength: -65,
                            status: 'idle'
                        }
                    })
                    .expect(200);
            }

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.batteryHistory).toBeDefined();
            expect(device.batteryHistory.length).toBe(3);
        });

        it('should track signal history', async () => {
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.signalHistory).toBeDefined();
            expect(device.signalHistory.length).toBe(1);
            expect(device.signalHistory[0].rssi).toBe(-65);
        });

        it('should detect charging state from ESP32', async () => {
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 4.1,
                        isCharging: true,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.isCharging).toBe(true);
            expect(device.chargingSource).toBe('esp32');
        });

        it('should detect charging via voltage rise', async () => {
            // First report at low voltage
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.5,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            // Second report at higher voltage (>0.15V rise)
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.7,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.isCharging).toBe(true);
            expect(device.chargingSource).toBe('voltage_rise');
        });

        it('should limit battery history to 100 entries', async () => {
            // Send 110 status updates
            for (let i = 0; i < 110; i++) {
                await request(app)
                    .post('/api/device-status')
                    .send({
                        deviceId: 'test-device-001',
                        status: {
                            batteryVoltage: 3.9,
                            signalStrength: -65,
                            status: 'idle'
                        }
                    });
            }

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.batteryHistory.length).toBeLessThanOrEqual(100);
        });

        it('should update lastSeen timestamp', async () => {
            const beforeTime = Date.now();

            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'idle'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.lastSeen).toBeGreaterThanOrEqual(beforeTime);
            expect(device.lastSeen).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('GET /api/esp32-status', () => {
        it('should return empty object when no devices', async () => {
            const response = await request(app)
                .get('/api/esp32-status')
                .expect(200);

            expect(response.body).toEqual({});
        });

        it('should return device status', async () => {
            // First create a device
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        batteryPercent: 75,
                        signalStrength: -65,
                        status: 'idle',
                        firmwareVersion: '1.0.0'
                    }
                })
                .expect(200);

            const response = await request(app)
                .get('/api/esp32-status')
                .expect(200);

            expect(response.body['test-device-001']).toBeDefined();
            expect(response.body['test-device-001'].batteryVoltage).toBe(3.9);
        });
    });

    describe('Battery Level Calculations', () => {
        const testCases = [
            { voltage: 4.2, expectedRange: [95, 100] },
            { voltage: 4.0, expectedRange: [75, 85] },
            { voltage: 3.7, expectedRange: [45, 55] },
            { voltage: 3.5, expectedRange: [25, 35] },
            { voltage: 3.3, expectedRange: [5, 15] },
            { voltage: 3.0, expectedRange: [0, 5] },
        ];

        testCases.forEach(({ voltage, expectedRange }) => {
            it(`should calculate correct percentage for ${voltage}V`, async () => {
                await request(app)
                    .post('/api/device-status')
                    .send({
                        deviceId: 'test-device-001',
                        status: {
                            batteryVoltage: voltage,
                            signalStrength: -65,
                            status: 'idle'
                        }
                    })
                    .expect(200);

                const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
                const device = devices['test-device-001'];
                expect(device.batteryPercent).toBeGreaterThanOrEqual(expectedRange[0]);
                expect(device.batteryPercent).toBeLessThanOrEqual(expectedRange[1]);
            });
        });
    });

    describe('OTA Event Tracking', () => {
        it('should track OTA start', async () => {
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'ota_updating'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.status).toBe('ota_updating');
        });

        it('should track OTA success', async () => {
            // Start OTA
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'ota_updating',
                        firmwareVersion: '1.0.0'
                    }
                })
                .expect(200);

            // Complete OTA with new version
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'idle',
                        firmwareVersion: '1.1.0'
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.firmwareVersion).toBe('1.1.0');
            expect(device.otaHistory).toBeDefined();
        });
    });

    describe('Profiling Data', () => {
        it('should track profiling telemetry', async () => {
            await request(app)
                .post('/api/device-status')
                .send({
                    deviceId: 'test-device-001',
                    status: {
                        batteryVoltage: 3.9,
                        signalStrength: -65,
                        status: 'idle'
                    },
                    profiling: {
                        displayInitMs: 150,
                        wifiConnectMs: 2500,
                        otaCheckMs: 100,
                        metadataFetchMs: 200,
                        imageDownloadMs: 3000,
                        displayRefreshMs: 15000,
                        totalWakeMs: 21000,
                        hasDisplayUpdate: true
                    }
                })
                .expect(200);

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.profilingHistory).toBeDefined();
            expect(device.profilingHistory.length).toBe(1);
            expect(device.profilingHistory[0].displayRefreshMs).toBe(15000);
        });

        it('should limit profiling history to 100 entries', async () => {
            for (let i = 0; i < 110; i++) {
                await request(app)
                    .post('/api/device-status')
                    .send({
                        deviceId: 'test-device-001',
                        status: {
                            batteryVoltage: 3.9,
                            signalStrength: -65,
                            status: 'idle'
                        },
                        profiling: {
                            totalWakeMs: 1000 + i
                        }
                    });
            }

            const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
            const device = devices['test-device-001'];
            expect(device.profilingHistory.length).toBeLessThanOrEqual(100);
        });
    });
});
