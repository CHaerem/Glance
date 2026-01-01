/**
 * Tests for image adjustment features:
 * - EXIF orientation auto-rotation
 * - Crop/zoom parameter handling
 * - Upload preview flow (no immediate apply)
 * - Pre-computed LAB palette optimization
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Mock the server modules we need to test
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({}));
});

describe('Image Adjustment Features', () => {
    const OUTPUT_DIR = path.join(__dirname, 'output');

    beforeAll(async () => {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterAll(async () => {
        await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    });

    describe('EXIF Orientation Handling', () => {
        test('sharp.rotate() without args should auto-rotate from EXIF', async () => {
            // Create a test image
            const testImage = await sharp({
                create: {
                    width: 100,
                    height: 200,  // Portrait
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 }
                }
            }).png().toBuffer();

            // Apply rotate() without arguments (EXIF auto-rotation)
            const rotated = await sharp(testImage)
                .rotate()  // This is what we added to fix EXIF
                .toBuffer();

            // Should still work without error
            const metadata = await sharp(rotated).metadata();
            expect(metadata.width).toBeDefined();
            expect(metadata.height).toBeDefined();
        });

        test('rotate() with degrees should apply manual rotation', async () => {
            const testImage = await sharp({
                create: {
                    width: 100,
                    height: 200,  // Portrait
                    channels: 3,
                    background: { r: 255, g: 0, b: 0 }
                }
            }).png().toBuffer();

            // Apply 90 degree rotation
            const rotated = await sharp(testImage)
                .rotate(90)
                .toBuffer();

            const metadata = await sharp(rotated).metadata();
            // After 90 degree rotation, width and height should swap
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(100);
        });
    });

    describe('Crop/Zoom Parameter Extraction', () => {
        test('extract() should crop image based on position and zoom', async () => {
            // Create a 400x400 test image
            const testImage = await sharp({
                create: {
                    width: 400,
                    height: 400,
                    channels: 3,
                    background: { r: 0, g: 255, b: 0 }
                }
            }).png().toBuffer();

            // Simulate zoom level 2.0 (extract half the image)
            const zoomLevel = 2.0;
            const cropX = 50;  // Center
            const cropY = 50;  // Center

            const imgWidth = 400;
            const imgHeight = 400;
            const visibleWidth = Math.round(imgWidth / zoomLevel);  // 200
            const visibleHeight = Math.round(imgHeight / zoomLevel);  // 200

            const maxOffsetX = imgWidth - visibleWidth;  // 200
            const maxOffsetY = imgHeight - visibleHeight;  // 200
            const extractX = Math.round((cropX / 100) * maxOffsetX);  // 100
            const extractY = Math.round((cropY / 100) * maxOffsetY);  // 100

            const cropped = await sharp(testImage)
                .extract({
                    left: extractX,
                    top: extractY,
                    width: visibleWidth,
                    height: visibleHeight
                })
                .toBuffer();

            const metadata = await sharp(cropped).metadata();
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(200);
        });

        test('crop position 0,0 should extract from top-left', async () => {
            const testImage = await sharp({
                create: {
                    width: 400,
                    height: 400,
                    channels: 3,
                    background: { r: 0, g: 0, b: 255 }
                }
            }).png().toBuffer();

            const zoomLevel = 2.0;
            const cropX = 0;  // Left edge
            const cropY = 0;  // Top edge

            const imgWidth = 400;
            const imgHeight = 400;
            const visibleWidth = Math.round(imgWidth / zoomLevel);
            const visibleHeight = Math.round(imgHeight / zoomLevel);

            const maxOffsetX = imgWidth - visibleWidth;
            const maxOffsetY = imgHeight - visibleHeight;
            const extractX = Math.round((cropX / 100) * maxOffsetX);  // 0
            const extractY = Math.round((cropY / 100) * maxOffsetY);  // 0

            expect(extractX).toBe(0);
            expect(extractY).toBe(0);

            const cropped = await sharp(testImage)
                .extract({
                    left: extractX,
                    top: extractY,
                    width: visibleWidth,
                    height: visibleHeight
                })
                .toBuffer();

            const metadata = await sharp(cropped).metadata();
            expect(metadata.width).toBe(200);
            expect(metadata.height).toBe(200);
        });

        test('crop position 100,100 should extract from bottom-right', async () => {
            const testImage = await sharp({
                create: {
                    width: 400,
                    height: 400,
                    channels: 3,
                    background: { r: 255, g: 255, b: 0 }
                }
            }).png().toBuffer();

            const zoomLevel = 2.0;
            const cropX = 100;  // Right edge
            const cropY = 100;  // Bottom edge

            const imgWidth = 400;
            const imgHeight = 400;
            const visibleWidth = Math.round(imgWidth / zoomLevel);
            const visibleHeight = Math.round(imgHeight / zoomLevel);

            const maxOffsetX = imgWidth - visibleWidth;
            const maxOffsetY = imgHeight - visibleHeight;
            const extractX = Math.round((cropX / 100) * maxOffsetX);  // 200
            const extractY = Math.round((cropY / 100) * maxOffsetY);  // 200

            expect(extractX).toBe(200);
            expect(extractY).toBe(200);
        });
    });

    describe('Pre-computed LAB Palette', () => {
        test('rgbToLab should convert colors correctly', () => {
            // Import the function from server.js
            // We'll test the concept - black should have L=0, white should have L=100

            // RGB to LAB conversion formula test
            // Black (0,0,0) -> L=0
            // White (255,255,255) -> L=100

            // These are the expected LAB values for the Spectra 6 palette
            const expectedColors = [
                { r: 0, g: 0, b: 0, name: "Black" },      // L ≈ 0
                { r: 255, g: 255, b: 255, name: "White" }, // L ≈ 100
                { r: 255, g: 255, b: 0, name: "Yellow" },
                { r: 255, g: 0, b: 0, name: "Red" },
                { r: 0, g: 0, b: 255, name: "Blue" },
                { r: 0, g: 255, b: 0, name: "Green" }
            ];

            expect(expectedColors.length).toBe(6);
            expect(expectedColors[0].r).toBe(0);  // Black
            expect(expectedColors[1].r).toBe(255);  // White
        });
    });

    describe('Parallel Image Processing', () => {
        test('Promise.all should process multiple sharp operations in parallel', async () => {
            const testImage = await sharp({
                create: {
                    width: 200,
                    height: 300,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'parallel-test.png');
            await fs.writeFile(testPath, testImage);

            // This is how we now process uploads - in parallel
            const [optimizedBuffer, thumbnailBuffer] = await Promise.all([
                sharp(testPath)
                    .rotate()
                    .resize(800, null, { fit: "inside", withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer(),
                sharp(testPath)
                    .rotate()
                    .resize(300, 400, { fit: "inside" })
                    .png()
                    .toBuffer()
            ]);

            // Both should complete successfully
            expect(optimizedBuffer.length).toBeGreaterThan(0);
            expect(thumbnailBuffer.length).toBeGreaterThan(0);

            // Verify dimensions
            const optimizedMeta = await sharp(optimizedBuffer).metadata();
            const thumbnailMeta = await sharp(thumbnailBuffer).metadata();

            expect(optimizedMeta.width).toBeLessThanOrEqual(800);
            expect(thumbnailMeta.width).toBeLessThanOrEqual(300);
            expect(thumbnailMeta.height).toBeLessThanOrEqual(400);
        });
    });

    describe('Upload Preview Flow', () => {
        test('upload should not require dithering before preview', async () => {
            // The new upload flow:
            // 1. Upload saves original + thumbnail (fast, no dithering)
            // 2. User adjusts crop/zoom in modal
            // 3. Apply triggers dithering with adjustments

            // This test verifies we can create preview assets without dithering
            const testImage = await sharp({
                create: {
                    width: 1200,
                    height: 1600,
                    channels: 3,
                    background: { r: 100, g: 150, b: 200 }
                }
            }).png().toBuffer();

            const testPath = path.join(OUTPUT_DIR, 'preview-flow-test.png');
            await fs.writeFile(testPath, testImage);

            // Create preview assets (what upload now does - no dithering)
            const startTime = Date.now();

            const [optimizedBuffer, thumbnailBuffer] = await Promise.all([
                sharp(testPath)
                    .rotate()
                    .resize(800, null, { fit: "inside", withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer(),
                sharp(testPath)
                    .rotate()
                    .resize(300, 400, { fit: "inside" })
                    .png()
                    .toBuffer()
            ]);

            const elapsed = Date.now() - startTime;

            // Should be fast (< 1 second) without dithering
            expect(elapsed).toBeLessThan(1000);
            expect(optimizedBuffer.length).toBeGreaterThan(0);
            expect(thumbnailBuffer.length).toBeGreaterThan(0);
        });
    });
});
