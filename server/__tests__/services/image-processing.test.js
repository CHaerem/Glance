/**
 * Tests for services/image-processing.js
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const imageProcessing = require('../../services/image-processing');

describe('Image Processing Service', () => {
    const TEST_DIR = path.join(__dirname, 'output-image-processing');
    const TEST_IMAGE = path.join(TEST_DIR, 'test-image.png');

    beforeAll(async () => {
        // Create test directory
        await fs.mkdir(TEST_DIR, { recursive: true });

        // Create a simple test image (100x100 gradient)
        const width = 100;
        const height = 100;
        const channels = 3;
        const pixels = Buffer.alloc(width * height * channels);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * channels;
                pixels[idx] = Math.floor((x / width) * 255);     // R: gradient left to right
                pixels[idx + 1] = Math.floor((y / height) * 255); // G: gradient top to bottom
                pixels[idx + 2] = 128;                             // B: constant
            }
        }

        await sharp(pixels, { raw: { width, height, channels } })
            .png()
            .toFile(TEST_IMAGE);
    });

    afterAll(async () => {
        // Clean up test files
        try {
            await fs.unlink(TEST_IMAGE);
            await fs.rmdir(TEST_DIR);
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Color Palettes', () => {
        it('should provide Spectra 6 palette via getSpectra6Palette()', () => {
            const palette = imageProcessing.getSpectra6Palette();
            expect(palette).toBeDefined();
            expect(Array.isArray(palette)).toBe(true);
            expect(palette.length).toBe(6);
        });

        it('should have correct Spectra 6 colors', () => {
            const palette = imageProcessing.getSpectra6Palette();
            const colorNames = palette.map(c => c.name);

            expect(colorNames).toContain('Black');
            expect(colorNames).toContain('White');
            expect(colorNames).toContain('Yellow');
            expect(colorNames).toContain('Red');
            expect(colorNames).toContain('Blue');
            expect(colorNames).toContain('Green');
        });

        it('should provide e-ink palette via getEinkPalette()', () => {
            const palette = imageProcessing.getEinkPalette();
            expect(palette).toBeDefined();
            expect(Array.isArray(palette)).toBe(true);
        });
    });

    describe('Color Conversion Functions', () => {
        describe('rgbToLab', () => {
            it('should convert black correctly', () => {
                const [L, a, b] = imageProcessing.rgbToLab(0, 0, 0);
                expect(L).toBeCloseTo(0, 0);
            });

            it('should convert white correctly', () => {
                const [L, a, b] = imageProcessing.rgbToLab(255, 255, 255);
                expect(L).toBeCloseTo(100, 0);
            });

            it('should return array of three numbers', () => {
                const result = imageProcessing.rgbToLab(128, 64, 192);
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(3);
                result.forEach(v => expect(typeof v).toBe('number'));
            });
        });

        describe('deltaE2000', () => {
            it('should return 0 for identical colors', () => {
                const result = imageProcessing.deltaE2000(50, 10, -20, 50, 10, -20);
                expect(result).toBeCloseTo(0, 5);
            });

            it('should return larger values for different colors', () => {
                const result = imageProcessing.deltaE2000(0, 0, 0, 100, 0, 0);
                expect(result).toBeGreaterThan(0);
            });
        });

        describe('findClosestSpectraColor', () => {
            it('should find black for (0, 0, 0)', () => {
                const result = imageProcessing.findClosestSpectraColor(0, 0, 0);
                expect(result.name).toBe('Black');
            });

            it('should find white for (255, 255, 255)', () => {
                const result = imageProcessing.findClosestSpectraColor(255, 255, 255);
                expect(result.name).toBe('White');
            });

            it('should find red for (255, 0, 0)', () => {
                const result = imageProcessing.findClosestSpectraColor(255, 0, 0);
                expect(result.name).toBe('Red');
            });

            it('should find green for (0, 255, 0)', () => {
                const result = imageProcessing.findClosestSpectraColor(0, 255, 0);
                expect(result.name).toBe('Green');
            });

            it('should find blue for (0, 0, 255)', () => {
                const result = imageProcessing.findClosestSpectraColor(0, 0, 255);
                expect(result.name).toBe('Blue');
            });

            it('should find yellow for (255, 255, 0)', () => {
                const result = imageProcessing.findClosestSpectraColor(255, 255, 0);
                expect(result.name).toBe('Yellow');
            });
        });
    });

    describe('applyDithering', () => {
        it('should dither image data', () => {
            const width = 10;
            const height = 10;
            const imageData = Buffer.alloc(width * height * 3);

            // Fill with mid-gray
            for (let i = 0; i < imageData.length; i++) {
                imageData[i] = 128;
            }

            const result = imageProcessing.applyDithering(imageData, width, height);

            expect(result).toBeDefined();
            expect(result.length).toBe(width * height * 3);
        });

        it('should support floyd-steinberg algorithm', () => {
            const width = 10;
            const height = 10;
            const imageData = Buffer.alloc(width * height * 3, 128);

            const result = imageProcessing.applyDithering(
                imageData, width, height, 'floyd-steinberg'
            );

            expect(result).toBeDefined();
        });

        it('should support atkinson algorithm', () => {
            const width = 10;
            const height = 10;
            const imageData = Buffer.alloc(width * height * 3, 128);

            const result = imageProcessing.applyDithering(
                imageData, width, height, 'atkinson'
            );

            expect(result).toBeDefined();
        });

        it('should apply saturation boost', () => {
            const width = 10;
            const height = 10;
            const imageData = Buffer.alloc(width * height * 3);

            // Create colorful image
            for (let i = 0; i < width * height; i++) {
                imageData[i * 3] = 200;     // R
                imageData[i * 3 + 1] = 100; // G
                imageData[i * 3 + 2] = 50;  // B
            }

            const resultNormal = imageProcessing.applyDithering(
                imageData, width, height, 'floyd-steinberg', 1.0
            );
            const resultBoosted = imageProcessing.applyDithering(
                imageData, width, height, 'floyd-steinberg', 2.0
            );

            expect(resultNormal).toBeDefined();
            expect(resultBoosted).toBeDefined();
        });
    });

    describe('convertImageToRGB', () => {
        it('should convert image to RGB buffer', async () => {
            const result = await imageProcessing.convertImageToRGB(
                TEST_IMAGE,
                0,      // rotation
                100,    // targetWidth
                100     // targetHeight
            );

            expect(Buffer.isBuffer(result)).toBe(true);
            expect(result.length).toBe(100 * 100 * 3);
        });

        it('should handle rotation', async () => {
            const result = await imageProcessing.convertImageToRGB(
                TEST_IMAGE,
                90,     // rotation
                100,
                100
            );

            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should handle dithering options', async () => {
            const result = await imageProcessing.convertImageToRGB(
                TEST_IMAGE,
                0,
                100,
                100,
                { ditherAlgorithm: 'atkinson' }
            );

            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should handle contrast enhancement', async () => {
            const result = await imageProcessing.convertImageToRGB(
                TEST_IMAGE,
                0,
                100,
                100,
                { enhanceContrast: true }
            );

            expect(Buffer.isBuffer(result)).toBe(true);
        });

        it('should handle zoom and crop options', async () => {
            const result = await imageProcessing.convertImageToRGB(
                TEST_IMAGE,
                0,
                100,
                100,
                {
                    zoomLevel: 1.5,
                    cropX: 25,
                    cropY: 75
                }
            );

            expect(Buffer.isBuffer(result)).toBe(true);
        });
    });

    describe('createTextImage', () => {
        it('should create a text image with default dimensions', async () => {
            const result = await imageProcessing.createTextImage('Test Text');

            expect(Buffer.isBuffer(result)).toBe(true);
            // Default is 1200x1600 = 5,760,000 bytes (RGB)
            expect(result.length).toBe(1200 * 1600 * 3);
        });

        it('should create text image with custom dimensions', async () => {
            const result = await imageProcessing.createTextImage(
                'Custom Size',
                600,
                800
            );

            expect(Buffer.isBuffer(result)).toBe(true);
            // 600x800 = 1,440,000 bytes (RGB)
            expect(result.length).toBe(600 * 800 * 3);
        });
    });
});
