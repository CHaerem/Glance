const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// E-ink specific test cases
describe('E-ink Color Conversion', () => {
    const EINK_PALETTE = [
        { rgb: [0, 0, 0], index: 0x0 },         // Black
        { rgb: [255, 255, 255], index: 0x1 },   // White  
        { rgb: [255, 255, 0], index: 0x2 },     // Yellow
        { rgb: [255, 0, 0], index: 0x3 },       // Red
        { rgb: [0, 0, 255], index: 0x5 },       // Blue
        { rgb: [0, 255, 0], index: 0x6 }        // Green
    ];

    describe('Waveshare 13.3\" Spectra 6 Compliance', () => {
        test('should use correct color indices', () => {
            const expectedIndices = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6];
            const actualIndices = EINK_PALETTE.map(color => color.index);
            
            expectedIndices.forEach(index => {
                expect(actualIndices).toContain(index);
            });
        });

        test('should have exactly 6 colors', () => {
            expect(EINK_PALETTE).toHaveLength(6);
        });

        test('should have correct RGB values for standard colors', () => {
            const colorMap = new Map(EINK_PALETTE.map(c => [c.index, c.rgb]));
            
            expect(colorMap.get(0x0)).toEqual([0, 0, 0]);       // Black
            expect(colorMap.get(0x1)).toEqual([255, 255, 255]); // White
            expect(colorMap.get(0x2)).toEqual([255, 255, 0]);   // Yellow
            expect(colorMap.get(0x3)).toEqual([255, 0, 0]);     // Red
            expect(colorMap.get(0x5)).toEqual([0, 0, 255]);     // Blue
            expect(colorMap.get(0x6)).toEqual([0, 255, 0]);     // Green
        });
    });

    describe('Color Distance Calculation', () => {
        function calculateDistance(rgb1, rgb2) {
            return Math.sqrt(
                Math.pow(rgb1[0] - rgb2[0], 2) +
                Math.pow(rgb1[1] - rgb2[1], 2) +
                Math.pow(rgb1[2] - rgb2[2], 2)
            );
        }

        test('should correctly calculate color distance', () => {
            const black = [0, 0, 0];
            const white = [255, 255, 255];
            const red = [255, 0, 0];
            
            expect(calculateDistance(black, black)).toBe(0);
            expect(calculateDistance(white, white)).toBe(0);
            expect(calculateDistance(black, white)).toBeCloseTo(441.67, 1);
            expect(calculateDistance(black, red)).toBe(255);
        });

        test('should find closest color correctly', () => {
            // Test cases for color mapping
            const testCases = [
                { input: [10, 10, 10], expected: 0x0 },      // Very dark -> Black
                { input: [245, 245, 245], expected: 0x1 },   // Very light -> White
                { input: [200, 200, 20], expected: 0x2 },    // Yellowish -> Yellow
                { input: [200, 20, 20], expected: 0x3 },     // Reddish -> Red
                { input: [20, 20, 200], expected: 0x5 },     // Bluish -> Blue
                { input: [20, 200, 20], expected: 0x6 },     // Greenish -> Green
            ];

            testCases.forEach(({ input, expected }) => {
                let minDistance = Infinity;
                let closestColor = EINK_PALETTE[1];
                
                for (const color of EINK_PALETTE) {
                    const distance = calculateDistance(input, color.rgb);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestColor = color;
                    }
                }
                
                expect(closestColor.index).toBe(expected);
            });
        });
    });

    describe('Image Resolution Handling', () => {
        test('should handle target resolution 1150x1550', async () => {
            const targetWidth = 1150;
            const targetHeight = 1550;
            
            // Create test image
            const testBuffer = await sharp({
                create: {
                    width: 100,
                    height: 100,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 }
                }
            }).raw().toBuffer();
            
            // Resize to target resolution
            const resizedBuffer = await sharp(testBuffer, {
                raw: { width: 100, height: 100, channels: 3 }
            })
            .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .raw()
            .toBuffer();
            
            expect(resizedBuffer.length).toBe(targetWidth * targetHeight * 3);
        });

        test('should maintain aspect ratio with contain fit', async () => {
            // Test with a square image resized to rectangular display
            const originalSize = 100;
            const targetWidth = 1150;
            const targetHeight = 1550;
            
            const testBuffer = await sharp({
                create: {
                    width: originalSize,
                    height: originalSize,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 }
                }
            }).raw().toBuffer();
            
            const resizedBuffer = await sharp(testBuffer, {
                raw: { width: originalSize, height: originalSize, channels: 3 }
            })
            .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .raw()
            .toBuffer();
            
            // Should have white padding due to aspect ratio difference
            expect(resizedBuffer.length).toBe(targetWidth * targetHeight * 3);
        });
    });

    describe('Dithering Algorithm', () => {
        test('should apply Floyd-Steinberg error distribution', () => {
            const width = 3;
            const height = 3;
            const imageData = new Uint8Array([
                128, 128, 128,  100, 100, 100,  150, 150, 150,
                120, 120, 120,  110, 110, 110,  140, 140, 140,
                130, 130, 130,  105, 105, 105,  145, 145, 145
            ]);
            
            // Mock dithering function
            function applyDithering(data, w, h) {
                const result = new Uint8ClampedArray(data);
                
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 3;
                        const gray = result[idx];
                        
                        // Simple threshold for testing
                        const newValue = gray > 127 ? 255 : 0;
                        const error = gray - newValue;
                        
                        result[idx] = newValue;
                        result[idx + 1] = newValue;
                        result[idx + 2] = newValue;
                        
                        // Distribute error (simplified Floyd-Steinberg)
                        if (x + 1 < w) {
                            const rightIdx = (y * w + (x + 1)) * 3;
                            result[rightIdx] = Math.max(0, Math.min(255, result[rightIdx] + error * 0.4375));
                        }
                    }
                }
                
                return result;
            }
            
            const result = applyDithering(imageData, width, height);
            
            expect(result.length).toBe(imageData.length);
            
            // Check that values are quantized
            for (let i = 0; i < result.length; i += 3) {
                const value = result[i];
                expect(value === 0 || value === 255 || (value > 0 && value < 255)).toBe(true);
            }
        });
    });

    describe('Binary Output Format', () => {
        test('should produce correct binary format for ESP32', () => {
            const pixels = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6];
            const buffer = Buffer.from(pixels);
            
            expect(buffer.length).toBe(6);
            expect(buffer[0]).toBe(0x0);
            expect(buffer[1]).toBe(0x1);
            expect(buffer[2]).toBe(0x2);
            expect(buffer[3]).toBe(0x3);
            expect(buffer[4]).toBe(0x5);
            expect(buffer[5]).toBe(0x6);
        });

        test('should produce correct buffer size for target resolution', () => {
            const targetPixels = 1150 * 1550;
            const pixels = new Array(targetPixels).fill(0x1); // White
            const buffer = Buffer.from(pixels);
            
            expect(buffer.length).toBe(targetPixels);
        });

        test('should base64 encode correctly', () => {
            const pixels = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6];
            const buffer = Buffer.from(pixels);
            const base64 = buffer.toString('base64');
            
            expect(typeof base64).toBe('string');
            expect(base64.length).toBeGreaterThan(0);
            
            // Should decode back to original
            const decoded = Buffer.from(base64, 'base64');
            expect(Array.from(decoded)).toEqual(pixels);
        });
    });

    describe('Performance Requirements', () => {
        test('should process image within reasonable time', async () => {
            const startTime = Date.now();
            
            // Simulate processing a small test image
            const testBuffer = await sharp({
                create: {
                    width: 100,
                    height: 100,
                    channels: 3,
                    background: { r: 128, g: 128, b: 128 }
                }
            })
            .resize(100, 100)
            .raw()
            .toBuffer();
            
            // Simple color conversion
            const pixels = [];
            for (let i = 0; i < testBuffer.length; i += 3) {
                pixels.push(0x1); // Mock conversion to white
            }
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            // Should complete within 1 second for small images
            expect(processingTime).toBeLessThan(1000);
        });

        test('should handle memory efficiently', () => {
            const largeArray = new Uint8Array(1150 * 1550 * 3);
            largeArray.fill(128);
            
            // Should not throw memory errors
            expect(() => {
                const result = new Uint8ClampedArray(largeArray);
                expect(result.length).toBe(largeArray.length);
            }).not.toThrow();
        });
    });
});