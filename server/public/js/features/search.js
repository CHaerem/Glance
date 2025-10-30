// AI-powered smart search module

/**
 * Perform smart search using AI to interpret natural language queries
 * @param {string} query - Natural language search query
 * @returns {Promise<Object>} Search results with metadata
 */
async function smartSearch(query) {
    try {
        const response = await fetch('/api/art/smart-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Smart search error:', error);
        throw error;
    }
}

/**
 * Get search suggestions based on current collections
 * @returns {Array<string>} Array of suggested search queries
 */
function getSearchSuggestions() {
    return [
        'Monet water lilies',
        'Japanese landscapes',
        'Bold colorful abstract',
        'Peaceful blue paintings',
        'Van Gogh sunflowers',
        'Renaissance portraits',
        'Impressionist gardens'
    ];
}

/**
 * Format search results for display
 * @param {Array} results - Raw search results
 * @returns {Array} Formatted results
 */
function formatSearchResults(results) {
    return results.map(result => ({
        id: result.id,
        title: result.title || 'Untitled',
        artist: result.artist || 'Unknown Artist',
        imageUrl: result.imageUrl || result.thumbnailUrl,
        thumbnail: result.thumbnailUrl || result.imageUrl,
        year: result.date || result.year,
        source: result.source || 'Unknown'
    }));
}

// Export functions for use in main.js
window.smartSearch = smartSearch;
window.getSearchSuggestions = getSearchSuggestions;
window.formatSearchResults = formatSearchResults;
