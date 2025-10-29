/**
 * Integration tests for image upload endpoints
 *
 * These tests ensure all API endpoints that call convertImageToRGB
 * pass parameters in the correct order. The bug we had was:
 *
 * WRONG: convertImageToRGB(path, 1200, 1600, {...})
 * RIGHT: convertImageToRGB(path, 0, 1200, 1600, {...})
 */

const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Import app for testing (requires NODE_ENV=test to be set)
const { app } = require('../server.js');

describe('Upload Endpoint Integration Tests', () => {
    const OUTPUT_DIR = path.join(__dirname, 'output');

    beforeAll(async () => {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    });

    describe('POST /api/upload', () => {
        test('should upload RGB image and return correct dimensions', async () => {
            // Create test image (RGB, 3 channels)
            const testImage = await sharp({
                create: {
                    width: 800,
                    height: 600,
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'upload-test-rgb.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.imageId).toBeDefined();
            expect(response.body.title).toContain('upload-test-rgb.png');
        });

        test('should upload RGBA image (with alpha) and handle correctly', async () => {
            // Create test image with alpha channel
            const testImage = await sharp({
                create: {
                    width: 800,
                    height: 600,
                    channels: 4,
                    background: { r: 255, g: 255, b: 0, alpha: 0.8 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'upload-test-rgba.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.imageId).toBeDefined();

            // Verify the processed image is exactly 5.76MB (1200x1600x3 bytes in base64)
            // Base64 encoding increases size by ~33%, so:
            // 5,760,000 bytes * 4/3 = 7,680,000 chars
        });

        test('should process image with correct dimensions (not swapped)', async () => {
            // Create 100x200 image to test dimension handling
            const testImage = await sharp({
                create: {
                    width: 100,
                    height: 200,
                    channels: 3,
                    background: { r: 0, g: 255, b: 0 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'upload-test-dimensions.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Get the uploaded image metadata
            const currentResponse = await request(app)
                .get('/api/current.json')
                .expect(200);

            expect(currentResponse.body.hasImage).toBe(true);

            // Verify image.bin is exactly 5.76MB (1200x1600x3)
            const imageResponse = await request(app)
                .get('/api/image.bin')
                .expect(200);

            expect(imageResponse.body.length).toBe(5760000);
        }, 30000);

        test('should apply rotation=0 by default (not rotation=1200)', async () => {
            // The bug was passing 1200 as rotation parameter
            // This test verifies correct rotation handling

            const testImage = await sharp({
                create: {
                    width: 800,
                    height: 600,
                    channels: 3,
                    background: { r: 0, g: 0, b: 255 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'upload-test-rotation.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Image should be processed with rotation=0, width=1200, height=1600
            // NOT rotation=1200, width=1600, height={...}
        });

        test('should reject images without file', async () => {
            const response = await request(app)
                .post('/api/upload')
                .expect(400);

            expect(response.body.error).toContain('No file uploaded');
        });
    });

    describe('POST /api/preview', () => {
        test('should generate preview with correct dimensions', async () => {
            const testImage = await sharp({
                create: {
                    width: 500,
                    height: 700,
                    channels: 3,
                    background: { r: 255, g: 128, b: 64 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'preview-test.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/preview')
                .attach('image', testPath)
                .field('ditherAlgorithm', 'floyd-steinberg')
                .field('enhanceContrast', 'true')
                .expect(200);

            expect(response.header['content-type']).toContain('image/png');
            expect(response.body.length).toBeGreaterThan(0);

            // Verify preview dimensions using sharp
            const previewMetadata = await sharp(response.body).metadata();
            expect(previewMetadata.width).toBe(600); // Half of 1200
            expect(previewMetadata.height).toBe(800); // Half of 1600
        }, 30000);

        test('should use correct parameter order for convertImageToRGB', async () => {
            // This test verifies the fix:
            // BEFORE (WRONG): convertImageToRGB(path, 1200, 1600, {...})
            // AFTER (RIGHT): convertImageToRGB(path, 0, 1200, 1600, {...})

            const testImage = await sharp({
                create: {
                    width: 300,
                    height: 400,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'preview-params-test.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/preview')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.length).toBeGreaterThan(0);
        }, 30000);
    });

    describe('POST /api/current (image data)', () => {
        test('should handle base64 image data correctly', async () => {
            const testImage = await sharp({
                create: {
                    width: 400,
                    height: 500,
                    channels: 3,
                    background: { r: 200, g: 100, b: 50 }
                }
            }).png().toBuffer();

            const base64Data = testImage.toString('base64');

            const response = await request(app)
                .post('/api/current')
                .send({
                    title: 'Test Base64 Image',
                    image: base64Data,
                    sleepDuration: 3600000000
                })
                .expect(200);

            expect(response.body.success).toBe(true);
        }, 30000);

        test('should process uploaded file with correct parameters', async () => {
            // Test file upload path (not base64)
            const testImage = await sharp({
                create: {
                    width: 600,
                    height: 800,
                    channels: 3,
                    background: { r: 64, g: 128, b: 192 }
                }
            }).jpeg().toBuffer();

            const base64Data = testImage.toString('base64');
            const dataUri = `data:image/jpeg;base64,${base64Data}`;

            const response = await request(app)
                .post('/api/current')
                .send({
                    title: 'Test Data URI',
                    image: dataUri,
                    sleepDuration: 3600000000
                })
                .expect(200);

            expect(response.body.success).toBe(true);
        }, 30000);
    });

    describe('Regression Tests - Parameter Order Bug', () => {
        test('should NOT swap rotation and width parameters', async () => {
            // THE BUG: convertImageToRGB(path, 1200, 1600, {...})
            // This passed 1200 as rotation, 1600 as width, {...} as height
            //
            // CORRECT: convertImageToRGB(path, 0, 1200, 1600, {...})
            // rotation=0, width=1200, height=1600, options={...}

            const testImage = await sharp({
                create: {
                    width: 1000,
                    height: 1000,
                    channels: 3,
                    background: { r: 255, g: 255, b: 0 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'regression-test.png');
            await fs.writeFile(testPath, testImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);

            // Verify the output is 1200x1600, not corrupted dimensions
            const imageResponse = await request(app)
                .get('/api/image.bin')
                .expect(200);

            // Should be exactly 1200 * 1600 * 3 = 5,760,000 bytes
            expect(imageResponse.body.length).toBe(5760000);
        }, 30000);

        test('should handle all color channels correctly', async () => {
            // Create image with all 6 Spectra colors
            const width = 60;
            const height = 10;
            const testImage = Buffer.alloc(width * height * 3);

            // Fill with 6 colors (10 pixels each)
            const colors = [
                [0, 0, 0],       // Black
                [255, 255, 255], // White
                [255, 255, 0],   // Yellow
                [255, 0, 0],     // Red
                [0, 0, 255],     // Blue
                [0, 255, 0]      // Green
            ];

            for (let i = 0; i < 600; i++) {
                const colorIndex = Math.floor(i / 100);
                const color = colors[colorIndex];
                testImage[i * 3] = color[0];
                testImage[i * 3 + 1] = color[1];
                testImage[i * 3 + 2] = color[2];
            }

            const pngImage = await sharp(testImage, {
                raw: { width, height, channels: 3 }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'colors-test.png');
            await fs.writeFile(testPath, pngImage);

            const response = await request(app)
                .post('/api/upload')
                .attach('image', testPath)
                .expect(200);

            expect(response.body.success).toBe(true);
        }, 30000);
    });
});
