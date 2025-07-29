const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Creates test images for testing the e-ink processing pipeline
 */
async function createTestImages() {
    const fixturesDir = __dirname;
    
    // Test image 1: Solid colors
    await sharp({
        create: {
            width: 60,
            height: 40,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    })
    .png()
    .toFile(path.join(fixturesDir, 'solid-black.png'));
    
    await sharp({
        create: {
            width: 60,
            height: 40,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .png()
    .toFile(path.join(fixturesDir, 'solid-white.png'));
    
    await sharp({
        create: {
            width: 60,
            height: 40,
            channels: 3,
            background: { r: 255, g: 0, b: 0 }
        }
    })
    .png()
    .toFile(path.join(fixturesDir, 'solid-red.png'));
    
    // Test image 2: Gradient
    const gradientBuffer = Buffer.alloc(60 * 40 * 3);
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 60; x++) {
            const idx = (y * 60 + x) * 3;
            const gray = Math.floor((x / 60) * 255);
            gradientBuffer[idx] = gray;     // R
            gradientBuffer[idx + 1] = gray; // G
            gradientBuffer[idx + 2] = gray; // B
        }
    }
    
    await sharp(gradientBuffer, {
        raw: { width: 60, height: 40, channels: 3 }
    })
    .png()
    .toFile(path.join(fixturesDir, 'gradient.png'));
    
    // Test image 3: Mixed colors
    const mixedBuffer = Buffer.alloc(60 * 40 * 3);
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 60; x++) {
            const idx = (y * 60 + x) * 3;
            if (x < 10) {
                // Black stripe
                mixedBuffer[idx] = 0;
                mixedBuffer[idx + 1] = 0;
                mixedBuffer[idx + 2] = 0;
            } else if (x < 20) {
                // White stripe
                mixedBuffer[idx] = 255;
                mixedBuffer[idx + 1] = 255;
                mixedBuffer[idx + 2] = 255;
            } else if (x < 30) {
                // Red stripe
                mixedBuffer[idx] = 255;
                mixedBuffer[idx + 1] = 0;
                mixedBuffer[idx + 2] = 0;
            } else if (x < 40) {
                // Yellow stripe
                mixedBuffer[idx] = 255;
                mixedBuffer[idx + 1] = 255;
                mixedBuffer[idx + 2] = 0;
            } else if (x < 50) {
                // Blue stripe
                mixedBuffer[idx] = 0;
                mixedBuffer[idx + 1] = 0;
                mixedBuffer[idx + 2] = 255;
            } else {
                // Green stripe
                mixedBuffer[idx] = 0;
                mixedBuffer[idx + 1] = 255;
                mixedBuffer[idx + 2] = 0;
            }
        }
    }
    
    await sharp(mixedBuffer, {
        raw: { width: 60, height: 40, channels: 3 }
    })
    .png()
    .toFile(path.join(fixturesDir, 'color-stripes.png'));
    
    console.log('Test images created successfully!');
}

// Run if called directly
if (require.main === module) {
    createTestImages().catch(console.error);
}

module.exports = { createTestImages };

// Add a simple test to avoid "no tests" error
if (process.env.NODE_ENV === 'test') {
    test('createTestImages should be a function', () => {
        expect(typeof createTestImages).toBe('function');
    });
}