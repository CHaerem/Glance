const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate Bhutan flag image optimized for e-ink display
 * The flag has a diagonal split with yellow (top-left) and orange (bottom-right)
 * and a white dragon in the center
 */
async function generateBhutanFlag(width = 1200, height = 1600) {
    console.log(`Generating Bhutan flag at ${width}x${height}...`);
    
    // Create the flag buffer
    const buffer = Buffer.alloc(width * height * 3);
    
    // Bhutan flag colors (RGB)
    const yellow = { r: 255, g: 193, b: 0 };    // Bright yellow
    const orange = { r: 255, g: 69, b: 0 };     // Orange-red  
    const white = { r: 255, g: 255, b: 255 };   // White for dragon
    const black = { r: 0, g: 0, b: 0 };         // Black for dragon details
    
    // Fill the flag with diagonal split
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            
            // Diagonal split: if x + y < some threshold, use yellow, else orange
            // Adjust the diagonal to make it more realistic
            const diagonalThreshold = (width + height) * 0.5;
            
            let color;
            if (x + y < diagonalThreshold) {
                color = yellow;
            } else {
                color = orange;
            }
            
            buffer[idx] = color.r;     // R
            buffer[idx + 1] = color.g; // G
            buffer[idx + 2] = color.b; // B
        }
    }
    
    // Add a simplified dragon in the center
    // Since drawing a complex dragon is difficult, we'll create a simplified geometric dragon
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const dragonSize = Math.min(width, height) * 0.3; // 30% of smaller dimension
    
    // Dragon body (white circle)
    const dragonRadius = dragonSize / 4;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= dragonRadius) {
                const idx = (y * width + x) * 3;
                buffer[idx] = white.r;
                buffer[idx + 1] = white.g;
                buffer[idx + 2] = white.b;
            }
        }
    }
    
    // Dragon details (simplified geometric shapes in black)
    // Eyes
    const eyeRadius = dragonRadius / 8;
    const eyeOffsetX = dragonRadius / 3;
    const eyeOffsetY = dragonRadius / 4;
    
    // Left eye
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - (centerX - eyeOffsetX);
            const dy = y - (centerY - eyeOffsetY);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= eyeRadius) {
                const idx = (y * width + x) * 3;
                buffer[idx] = black.r;
                buffer[idx + 1] = black.g;
                buffer[idx + 2] = black.b;
            }
        }
    }
    
    // Right eye
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - (centerX + eyeOffsetX);
            const dy = y - (centerY - eyeOffsetY);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= eyeRadius) {
                const idx = (y * width + x) * 3;
                buffer[idx] = black.r;
                buffer[idx + 1] = black.g;
                buffer[idx + 2] = black.b;
            }
        }
    }
    
    // Dragon mouth (simple arc)
    const mouthRadius = dragonRadius / 6;
    const mouthOffsetY = dragonRadius / 2;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - (centerY + mouthOffsetY);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= mouthRadius && dy > 0) {
                const idx = (y * width + x) * 3;
                buffer[idx] = black.r;
                buffer[idx + 1] = black.g;
                buffer[idx + 2] = black.b;
            }
        }
    }
    
    // Convert buffer to image
    const image = sharp(buffer, {
        raw: { width, height, channels: 3 }
    });
    
    return image;
}

/**
 * Generate Bhutan flag and save as PNG
 */
async function saveBhutanFlag(outputPath, width = 1200, height = 1600) {
    const image = await generateBhutanFlag(width, height);
    await image.png().toFile(outputPath);
    console.log(`Bhutan flag saved to: ${outputPath}`);
}

/**
 * Generate Bhutan flag as RGB buffer for direct server use
 */
async function getBhutanFlagRGB(width = 1200, height = 1600) {
    const image = await generateBhutanFlag(width, height);
    return await image.raw().toBuffer();
}

module.exports = {
    generateBhutanFlag,
    saveBhutanFlag,
    getBhutanFlagRGB
};

// If run directly, generate and save the flag
if (require.main === module) {
    const outputPath = path.join(__dirname, 'bhutan-flag.png');
    saveBhutanFlag(outputPath)
        .then(() => console.log('Bhutan flag generated successfully!'))
        .catch(console.error);
}