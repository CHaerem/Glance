/**
 * Input validation utility functions
 */

/**
 * Validate device ID format
 * @param {string} deviceId - Device identifier to validate
 * @returns {boolean} True if valid
 */
function validateDeviceId(deviceId) {
    return (
        typeof deviceId === "string" &&
        deviceId.length > 0 &&
        deviceId.length < 100
    );
}

/**
 * Validate image data (base64 or buffer)
 * @param {string} imageData - Image data to validate
 * @returns {boolean} True if valid (under 10MB)
 */
function validateImageData(imageData) {
    return typeof imageData === "string" && imageData.length < 10 * 1024 * 1024;
}

/**
 * Sanitize user input by removing dangerous characters
 * @param {string} input - Raw user input
 * @returns {string} Sanitized input (max 1000 chars)
 */
function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>]/g, "").trim().substring(0, 1000);
}

/**
 * Get a random lucky prompt for AI art generation
 * @returns {string} Random art generation prompt
 */
function getRandomLuckyPrompt() {
    const themes = [
        "ethereal landscapes with dramatic weather",
        "abstract geometric patterns with bold colors",
        "surreal dreamscapes with unexpected elements",
        "vintage botanical illustrations",
        "minimalist architecture with strong shadows",
        "cosmic and celestial phenomena",
        "mythological creatures in natural settings",
        "urban scenes with dramatic lighting",
        "organic flowing forms and textures",
        "vintage travel poster aesthetics",
        "art deco patterns and motifs",
        "underwater scenes with unusual creatures",
        "futuristic cityscapes",
        "folk art and cultural patterns",
        "wildlife in dramatic poses",
        "abstract expressionism with bold strokes",
        "Japanese woodblock print style",
        "steampunk mechanical designs",
        "northern lights and aurora borealis",
        "retro sci-fi illustrations"
    ];

    const styles = [
        "in the style of vintage illustration",
        "with impressionist brushwork",
        "using bold graphic design",
        "with delicate watercolor washes",
        "in minimalist line art style",
        "with dramatic chiaroscuro lighting",
        "using warm earth tones",
        "with cool monochromatic palette",
        "in vibrant pop art colors",
        "with subtle muted tones"
    ];

    const theme = themes[Math.floor(Math.random() * themes.length)];
    const style = styles[Math.floor(Math.random() * styles.length)];

    return `Create ${theme}, ${style}. The image should be visually striking and work well on an e-ink display with limited colors.`;
}

module.exports = {
    validateDeviceId,
    validateImageData,
    sanitizeInput,
    getRandomLuckyPrompt
};
