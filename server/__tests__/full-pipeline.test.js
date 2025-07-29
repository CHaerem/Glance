const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { createTestImages } = require('./fixtures/create-test-images');

// Import the actual functions from server.js
// Note: In a real implementation, these should be exported from server.js
const EINK_PALETTE = [
    { rgb: [0, 0, 0], index: 0x0 },         // Black
    { rgb: [255, 255, 255], index: 0x1 },   // White  
    { rgb: [255, 255, 0], index: 0x2 },     // Yellow
    { rgb: [255, 0, 0], index: 0x3 },       // Red
    { rgb: [0, 0, 255], index: 0x5 },       // Blue
    { rgb: [0, 255, 0], index: 0x6 }        // Green
];

function findClosestColor(rgb) {
    let minDistance = Infinity;
    let closestColor = EINK_PALETTE[1]; // Default to white
    
    for (const color of EINK_PALETTE) {
        const [r, g, b] = color.rgb;
        const distance = Math.sqrt(
            Math.pow(rgb[0] - r, 2) +
            Math.pow(rgb[1] - g, 2) +
            Math.pow(rgb[2] - b, 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color;
        }
    }
    
    return closestColor;
}

function applyFloydSteinbergDithering(imageData, width, height) {
    const ditheredData = new Uint8ClampedArray(imageData);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const oldR = ditheredData[idx];
            const oldG = ditheredData[idx + 1];
            const oldB = ditheredData[idx + 2];
            
            // Find closest color
            const closestColor = findClosestColor([oldR, oldG, oldB]);
            const [newR, newG, newB] = closestColor.rgb;
            
            // Set new color
            ditheredData[idx] = newR;
            ditheredData[idx + 1] = newG;
            ditheredData[idx + 2] = newB;
            
            // Calculate error
            const errR = oldR - newR;
            const errG = oldG - newG;
            const errB = oldB - newB;
            
            // Distribute error to neighboring pixels
            const distributeError = (dx, dy, factor) => {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = (ny * width + nx) * 3;
                    ditheredData[nIdx] = Math.max(0, Math.min(255, ditheredData[nIdx] + errR * factor));
                    ditheredData[nIdx + 1] = Math.max(0, Math.min(255, ditheredData[nIdx + 1] + errG * factor));
                    ditheredData[nIdx + 2] = Math.max(0, Math.min(255, ditheredData[nIdx + 2] + errB * factor));
                }
            };
            
            // Floyd-Steinberg error distribution
            distributeError(1, 0, 7/16);  // Right
            distributeError(-1, 1, 3/16); // Below-left
            distributeError(0, 1, 5/16);  // Below  
            distributeError(1, 1, 1/16);  // Below-right
        }
    }
    
    return ditheredData;
}

async function convertImageToEink(imagePath, targetWidth = 100, targetHeight = 100) {
    try {
        // Load and process image with Sharp
        const imageBuffer = await sharp(imagePath)
            .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .raw()
            .toBuffer();
        
        // Apply Floyd-Steinberg dithering for better color conversion
        const ditheredBuffer = applyFloydSteinbergDithering(imageBuffer, targetWidth, targetHeight);
        
        // Convert dithered image to e-ink format
        const pixels = [];
        for (let i = 0; i < ditheredBuffer.length; i += 3) {
            const rgb = [ditheredBuffer[i], ditheredBuffer[i + 1], ditheredBuffer[i + 2]];
            const closestColor = findClosestColor(rgb);
            pixels.push(closestColor.index);
        }
        
        return Buffer.from(pixels);
    } catch (error) {
        console.error('Error converting image:', error);
        throw error;
    }
}

describe('Full E-ink Processing Pipeline', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    
    beforeAll(async () => {
        // Create test images
        await createTestImages();
    });
    
    afterAll(async () => {
        // Clean up test images
        const testImages = [
            'solid-black.png',
            'solid-white.png', 
            'solid-red.png',
            'gradient.png',
            'color-stripes.png'
        ];
        
        for (const image of testImages) {
            try {
                await fs.unlink(path.join(fixturesDir, image));
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    });
    
    describe('Solid Color Processing', () => {
        test('should process solid black image correctly', async () => {
            const imagePath = path.join(fixturesDir, 'solid-black.png');
            const result = await convertImageToEink(imagePath, 60, 40); // Match original size
            
            expect(result.length).toBe(2400); // 60x40 pixels
            
            // All pixels should be black (0x0)
            const pixels = Array.from(result);
            const uniqueValues = [...new Set(pixels)];
            const allBlack = pixels.every(pixel => pixel === 0x0);
            expect(allBlack).toBe(true);
        });
        
        test('should process solid white image correctly', async () => {
            const imagePath = path.join(fixturesDir, 'solid-white.png');
            const result = await convertImageToEink(imagePath, 60, 40); // Match original size
            
            expect(result.length).toBe(2400); // 60x40 pixels
            
            // All pixels should be white (0x1)
            const pixels = Array.from(result);
            const allWhite = pixels.every(pixel => pixel === 0x1);
            expect(allWhite).toBe(true);
        });
        
        test('should process solid red image correctly', async () => {
            const imagePath = path.join(fixturesDir, 'solid-red.png');
            const result = await convertImageToEink(imagePath, 60, 40); // Match original size
            
            expect(result.length).toBe(2400); // 60x40 pixels
            
            // All pixels should be red (0x3)
            const pixels = Array.from(result);
            const uniqueValues = [...new Set(pixels)];
            const allRed = pixels.every(pixel => pixel === 0x3);
            expect(allRed).toBe(true);
        });
    });
    
    describe('Complex Image Processing', () => {
        test('should process gradient image with dithering', async () => {
            const imagePath = path.join(fixturesDir, 'gradient.png');
            const result = await convertImageToEink(imagePath, 60, 40);
            
            expect(result.length).toBe(2400); // 60x40 pixels
            
            const pixels = Array.from(result);
            
            // Should contain multiple colors due to dithering
            const uniqueColors = [...new Set(pixels)];
            expect(uniqueColors.length).toBeGreaterThan(1);
            
            // All colors should be valid e-ink indices
            const validIndices = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6];
            pixels.forEach(pixel => {
                expect(validIndices).toContain(pixel);
            });
        });
        
        test('should process color stripes correctly', async () => {
            const imagePath = path.join(fixturesDir, 'color-stripes.png');
            const result = await convertImageToEink(imagePath, 60, 40);
            
            expect(result.length).toBe(2400); // 60x40 pixels
            
            const pixels = Array.from(result);
            
            // Should maintain different colors for different stripes
            const uniqueColors = [...new Set(pixels)];
            expect(uniqueColors.length).toBeGreaterThanOrEqual(3);
            
            // All colors should be valid e-ink indices
            const validIndices = [0x0, 0x1, 0x2, 0x3, 0x5, 0x6];
            pixels.forEach(pixel => {
                expect(validIndices).toContain(pixel);
            });
        });
    });
    
    describe('Size and Format Validation', () => {
        test('should handle different target sizes', async () => {
            const imagePath = path.join(fixturesDir, 'solid-white.png');
            
            const sizes = [
                { width: 10, height: 10 },
                { width: 100, height: 50 },
                { width: 200, height: 300 }
            ];
            
            for (const { width, height } of sizes) {
                const result = await convertImageToEink(imagePath, width, height);
                expect(result.length).toBe(width * height);
            }
        });
        
        test('should produce base64 encodable output', async () => {
            const imagePath = path.join(fixturesDir, 'solid-black.png');
            const result = await convertImageToEink(imagePath, 10, 10);
            
            const base64 = result.toString('base64');
            expect(typeof base64).toBe('string');
            expect(base64.length).toBeGreaterThan(0);
            
            // Should decode back to original
            const decoded = Buffer.from(base64, 'base64');
            expect(decoded.equals(result)).toBe(true);
        });
    });
    
    describe('Error Handling', () => {
        test('should handle non-existent files gracefully', async () => {
            const imagePath = path.join(fixturesDir, 'non-existent.png');
            
            await expect(convertImageToEink(imagePath)).rejects.toThrow();
        });
        
        test('should handle invalid dimensions', async () => {
            const imagePath = path.join(fixturesDir, 'solid-white.png');
            
            // Zero dimensions should throw
            await expect(convertImageToEink(imagePath, 0, 10)).rejects.toThrow();
            await expect(convertImageToEink(imagePath, 10, 0)).rejects.toThrow();
        });
    });
    
    describe('Performance Requirements', () => {
        test('should process images within reasonable time', async () => {
            const imagePath = path.join(fixturesDir, 'color-stripes.png');
            const startTime = Date.now();
            
            await convertImageToEink(imagePath, 200, 200);
            
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            
            // Should complete within 5 seconds for medium-sized images
            expect(processingTime).toBeLessThan(5000);
        });
        
        test('should handle memory efficiently', async () => {
            const imagePath = path.join(fixturesDir, 'gradient.png');
            
            // Process multiple images without memory issues
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(convertImageToEink(imagePath, 100, 100));
            }
            
            const results = await Promise.all(promises);
            
            // All should complete successfully
            results.forEach(result => {
                expect(result.length).toBe(10000);
            });
        });
    });
});