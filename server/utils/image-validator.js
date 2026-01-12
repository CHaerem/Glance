/**
 * Image URL Validator
 * Validates and caches image URL availability
 */

const { loggers } = require('../services/logger');
const log = loggers.api;

// Cache for validated URLs (valid for 24 hours)
const validationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Pre-validated Wikimedia filenames (manually verified to exist)
// These skip validation for faster loading
const VERIFIED_FILENAMES = new Set([
    // Renaissance Masters
    "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg",
    "The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg",
    "Da_Vinci_Vitruve_Luc_Viatour.jpg",
    "Leonardo_da_Vinci_046.jpg",
    "Michelangelo_-_Creation_of_Adam_(cropped).jpg",
    "Last_Judgement_(Michelangelo).jpg",
    "Michelangelo_Buonarroti_-_Tondo_Doni_-_Google_Art_Project.jpg",
    "Raphael_School_of_Athens.jpg",
    "Raphael_-_Sistine_Madonna_-_WGA18595.jpg",
    "Transfiguration_Raphael.jpg",
    "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",
    "Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg",
    // Dutch Masters
    "La_ronda_de_noche,_por_Rembrandt_van_Rijn.jpg",
    "Girl_with_a_Pearl_Earring.jpg",
    "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg",
    "Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg",
    "Vermeer-view-of-delft.jpg",
    "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg",
    // Impressionists
    "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg",
    "Monet_-_Impression,_Sunrise.jpg",
    "Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg",
    "Auguste_Renoir_-_Dance_at_Le_Moulin_de_la_Galette_-_Google_Art_Project.jpg",
    "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg",
    "Edgar_Degas_-_The_Ballet_Class_-_Google_Art_Project.jpg",
    "Edgar_Degas_-_In_a_Caf%C3%A9_-_Google_Art_Project_2.jpg",
    // Post-Impressionists
    "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    "Vincent_Willem_van_Gogh_128.jpg",
    "Van_Gogh_-_Terrasse_des_Caf%C3%A9s_an_der_Place_du_Forum_in_Arles_am_Abend1.jpeg",
    "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg",
    "Paul_C%C3%A9zanne_-_Mont_Sainte-Victoire_-_Google_Art_Project.jpg",
    "Les_Joueurs_de_cartes,_par_Paul_C%C3%A9zanne.jpg",
    "Paul_Gauguin_-_D%27ou_venons-nous.jpg",
    "Paul_Gauguin_-_Le_Christ_jaune_(The_Yellow_Christ).jpg",
    // Japanese Masters
    "Tsunami_by_hokusai_19th_century.jpg",
    "Red_Fuji_southern_wind_clear_morning.jpg",
    "Lightnings_below_the_summit.jpg",
    "Hiroshige,_Plum_Park_in_Kameido.jpg",
    "Hiroshige_-_Sudden_Shower_at_the_Atake_Bridge.jpg",
    // Modern Icons
    "Mural_del_Gernika.jpg",
    "Les_Demoiselles_d%27Avignon.jpg",
    "The_Persistence_of_Memory.jpg",
    "Gustav_Klimt_016.jpg",
    "Gustav_Klimt_046.jpg",
    "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg"
]);

/**
 * Check if a URL is accessible (returns 200 or redirect)
 * Uses HEAD request for efficiency
 */
async function isUrlAccessible(url, timeout = 5000) {
    // Check cache first
    const cached = validationCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.valid;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Glance/1.0 (Art Gallery Display; contact@example.com)'
            }
        });

        clearTimeout(timeoutId);

        const valid = response.ok || (response.status >= 300 && response.status < 400);

        // Cache the result
        validationCache.set(url, { valid, timestamp: Date.now() });

        if (!valid) {
            log.debug('Image URL not accessible', { url, status: response.status });
        }

        return valid;
    } catch (error) {
        // Cache negative results too (but maybe shorter TTL)
        validationCache.set(url, { valid: false, timestamp: Date.now() });
        log.debug('Image URL check failed', { url, error: error.message });
        return false;
    }
}

/**
 * Build Wikimedia Commons URL from filename
 */
function getWikimediaUrl(filename, width = 1200) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

/**
 * Check if a Wikimedia filename is pre-verified (skip validation)
 */
function isVerifiedFilename(filename) {
    return VERIFIED_FILENAMES.has(filename);
}

/**
 * Validate a Wikimedia filename
 * Returns true immediately for pre-verified files
 */
async function isWikimediaFileValid(filename) {
    // Skip validation for pre-verified files
    if (VERIFIED_FILENAMES.has(filename)) {
        return true;
    }
    const url = getWikimediaUrl(filename, 400); // Use smaller size for validation
    return isUrlAccessible(url);
}

/**
 * Filter artworks to only include those with valid images
 * Validates in parallel for efficiency
 */
async function filterValidArtworks(artworks, getImageUrl) {
    if (!artworks || artworks.length === 0) return [];

    const validationResults = await Promise.all(
        artworks.map(async (artwork) => {
            const url = getImageUrl(artwork);
            if (!url) return { artwork, valid: false };

            const valid = await isUrlAccessible(url);
            return { artwork, valid };
        })
    );

    const validArtworks = validationResults
        .filter(r => r.valid)
        .map(r => r.artwork);

    const invalidCount = artworks.length - validArtworks.length;
    if (invalidCount > 0) {
        log.info('Filtered out artworks with invalid images', {
            total: artworks.length,
            valid: validArtworks.length,
            invalid: invalidCount
        });
    }

    return validArtworks;
}

/**
 * Validate artworks with Wikimedia filenames
 * Pre-verified files skip validation for instant results
 */
async function filterValidWikimediaArtworks(artworks) {
    if (!artworks || artworks.length === 0) return [];

    // Separate verified and unverified artworks
    const verified = [];
    const needsValidation = [];

    for (const artwork of artworks) {
        if (!artwork.wikimedia) continue;
        if (VERIFIED_FILENAMES.has(artwork.wikimedia)) {
            verified.push(artwork);
        } else {
            needsValidation.push(artwork);
        }
    }

    // Validate only unverified artworks
    const validatedUnverified = await filterValidArtworks(needsValidation, (artwork) => {
        return getWikimediaUrl(artwork.wikimedia, 400);
    });

    // Combine results
    return [...verified, ...validatedUnverified];
}

/**
 * Clear validation cache (useful for testing or manual refresh)
 */
function clearValidationCache() {
    validationCache.clear();
    log.info('Cleared image validation cache');
}

/**
 * Get cache stats
 */
function getCacheStats() {
    let valid = 0;
    let invalid = 0;

    for (const entry of validationCache.values()) {
        if (entry.valid) valid++;
        else invalid++;
    }

    return {
        totalEntries: validationCache.size,
        validUrls: valid,
        invalidUrls: invalid
    };
}

module.exports = {
    isUrlAccessible,
    isWikimediaFileValid,
    isVerifiedFilename,
    getWikimediaUrl,
    filterValidArtworks,
    filterValidWikimediaArtworks,
    clearValidationCache,
    getCacheStats
};
