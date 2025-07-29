const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Import functions from server.js (we'll need to export them)
// For now, we'll copy the functions here for testing
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

describe('E-ink Image Processing', () => {
    describe('findClosestColor', () => {
        test('should return black for pure black input', () => {
            const result = findClosestColor([0, 0, 0]);
            expect(result.rgb).toEqual([0, 0, 0]);
            expect(result.index).toBe(0x0);
        });

        test('should return white for pure white input', () => {
            const result = findClosestColor([255, 255, 255]);
            expect(result.rgb).toEqual([255, 255, 255]);
            expect(result.index).toBe(0x1);
        });

        test('should return red for pure red input', () => {
            const result = findClosestColor([255, 0, 0]);
            expect(result.rgb).toEqual([255, 0, 0]);
            expect(result.index).toBe(0x3);
        });

        test('should return closest color for mixed input', () => {
            // Should map dark gray to black
            const result = findClosestColor([50, 50, 50]);
            expect(result.rgb).toEqual([0, 0, 0]);
            expect(result.index).toBe(0x0);
        });

        test('should return yellow for yellow-ish input', () => {
            const result = findClosestColor([200, 200, 50]);
            expect(result.rgb).toEqual([255, 255, 0]);
            expect(result.index).toBe(0x2);
        });

        test('should handle edge cases gracefully', () => {
            const result = findClosestColor([128, 128, 128]);
            expect(result).toBeDefined();
            expect(result.rgb).toBeDefined();
            expect(result.index).toBeDefined();
        });
    });

    describe('applyFloydSteinbergDithering', () => {
        test('should process small image correctly', () => {
            const width = 2;
            const height = 2;
            const imageData = new Uint8Array([
                128, 128, 128,  // Gray pixel
                64, 64, 64,     // Dark gray pixel
                192, 192, 192,  // Light gray pixel
                32, 32, 32      // Very dark pixel
            ]);

            const result = applyFloydSteinbergDithering(imageData, width, height);
            
            expect(result).toBeInstanceOf(Uint8ClampedArray);
            expect(result.length).toBe(12); // 4 pixels * 3 channels
            
            // Check that all values are from the e-ink palette
            for (let i = 0; i < result.length; i += 3) {
                const rgb = [result[i], result[i + 1], result[i + 2]];
                const paletteColor = EINK_PALETTE.find(color => 
                    color.rgb[0] === rgb[0] && 
                    color.rgb[1] === rgb[1] && 
                    color.rgb[2] === rgb[2]
                );
                expect(paletteColor).toBeDefined();
            }
        });

        test('should preserve dimensions', () => {
            const width = 4;
            const height = 4;
            const imageData = new Uint8Array(width * height * 3).fill(128);

            const result = applyFloydSteinbergDithering(imageData, width, height);
            
            expect(result.length).toBe(width * height * 3);
        });

        test('should handle single pixel', () => {
            const width = 1;
            const height = 1;
            const imageData = new Uint8Array([128, 128, 128]);

            const result = applyFloydSteinbergDithering(imageData, width, height);
            
            expect(result.length).toBe(3);
            // Should map to closest color in palette
            const rgb = [result[0], result[1], result[2]];
            const paletteColor = EINK_PALETTE.find(color => 
                color.rgb[0] === rgb[0] && 
                color.rgb[1] === rgb[1] && 
                color.rgb[2] === rgb[2]
            );
            expect(paletteColor).toBeDefined();
        });
    });

    describe('EINK_PALETTE', () => {
        test('should have correct number of colors', () => {
            expect(EINK_PALETTE).toHaveLength(6);
        });

        test('should have correct color indices', () => {
            const indices = EINK_PALETTE.map(color => color.index);
            expect(indices).toContain(0x0); // Black
            expect(indices).toContain(0x1); // White
            expect(indices).toContain(0x2); // Yellow
            expect(indices).toContain(0x3); // Red
            expect(indices).toContain(0x5); // Blue
            expect(indices).toContain(0x6); // Green
        });

        test('should have valid RGB values', () => {
            EINK_PALETTE.forEach(color => {
                expect(color.rgb).toHaveLength(3);
                color.rgb.forEach(value => {
                    expect(value).toBeGreaterThanOrEqual(0);
                    expect(value).toBeLessThanOrEqual(255);
                });
            });
        });
    });
});

describe('Image Processing Integration', () => {
    let testImagePath;

    beforeAll(async () => {
        // Create a simple test image
        testImagePath = path.join(__dirname, 'fixtures', 'test-image.png');
        await fs.mkdir(path.dirname(testImagePath), { recursive: true });
        
        // Create a simple 10x10 test image
        const testBuffer = await sharp({
            create: {
                width: 10,
                height: 10,
                channels: 3,
                background: { r: 128, g: 128, b: 128 }
            }
        }).png().toBuffer();
        
        await fs.writeFile(testImagePath, testBuffer);
    });

    afterAll(async () => {
        try {
            await fs.unlink(testImagePath);
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    test('should process test image through full pipeline', async () => {
        // Load and process image with Sharp
        const imageBuffer = await sharp(testImagePath)
            .resize(20, 20, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .raw()
            .toBuffer();
        
        // Apply dithering
        const ditheredBuffer = applyFloydSteinbergDithering(imageBuffer, 20, 20);
        
        // Convert to e-ink format
        const pixels = [];
        for (let i = 0; i < ditheredBuffer.length; i += 3) {
            const rgb = [ditheredBuffer[i], ditheredBuffer[i + 1], ditheredBuffer[i + 2]];
            const closestColor = findClosestColor(rgb);
            pixels.push(closestColor.index);
        }
        
        expect(pixels).toHaveLength(400); // 20x20 pixels
        
        // All pixels should be valid e-ink color indices
        pixels.forEach(pixel => {
            expect([0x0, 0x1, 0x2, 0x3, 0x5, 0x6]).toContain(pixel);
        });
    });
});