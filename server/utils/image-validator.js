/**
 * Image URL Validator
 * Re-exports from TypeScript implementation
 */

const imageValidatorModule = require('../dist/src/utils/image-validator');

module.exports = {
    isUrlAccessible: imageValidatorModule.isUrlAccessible,
    isWikimediaFileValid: imageValidatorModule.isWikimediaFileValid,
    isFilenameValidated: imageValidatorModule.isFilenameValidated,
    getWikimediaUrl: imageValidatorModule.getWikimediaUrl,
    filterValidArtworks: imageValidatorModule.filterValidArtworks,
    filterValidWikimediaArtworks: imageValidatorModule.filterValidWikimediaArtworks,
    warmupCache: imageValidatorModule.warmupCache,
    clearValidationCache: imageValidatorModule.clearValidationCache,
    getCacheStats: imageValidatorModule.getCacheStats
};
