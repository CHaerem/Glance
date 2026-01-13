/**
 * Input validation utility functions
 * Re-exports from TypeScript implementation
 */

const validationModule = require('../dist/src/utils/validation');

module.exports = {
    validateDeviceId: validationModule.validateDeviceId,
    validateImageData: validationModule.validateImageData,
    sanitizeInput: validationModule.sanitizeInput,
    getRandomLuckyPrompt: validationModule.getRandomLuckyPrompt
};
