/**
 * Smart Categories Module
 * Browse art by subject, mood, and color using semantic search
 */

// Module state
let categoriesData = null;
let activeCategory = null;

/**
 * Load all categories configuration
 * @returns {Promise<Object>} Categories data
 */
async function loadCategories() {
    if (categoriesData) return categoriesData;

    try {
        const response = await fetch('/api/categories');
        if (!response.ok) {
            throw new Error(`Failed to load categories: ${response.status}`);
        }
        categoriesData = await response.json();
        return categoriesData;
    } catch (error) {
        console.error('Error loading categories:', error);
        return null;
    }
}

/**
 * Browse artworks by category
 * @param {string} type - Category type (subjects, moods, colors)
 * @param {string} id - Category id (e.g., landscape, peaceful, blue)
 * @param {number} limit - Max results to return
 * @returns {Promise<Object>} Search results
 */
async function browseByCategory(type, id, limit = 30) {
    activeCategory = { type, id };

    try {
        const response = await fetch(`/api/categories/${type}/${id}?limit=${limit}`);
        if (!response.ok) {
            throw new Error(`Failed to browse category: ${response.status}`);
        }

        const data = await response.json();
        return {
            category: data.category,
            results: data.results || [],
            metadata: data.metadata
        };
    } catch (error) {
        console.error('Error browsing category:', error);

        // Fall back to using smart search directly
        const categories = await loadCategories();
        if (categories && categories[type]) {
            const category = categories[type].find(c => c.id === id);
            if (category && window.smartSearch) {
                const results = await window.smartSearch(category.query);
                return {
                    category: { type, id, label: category.label },
                    results: results.results || [],
                    metadata: { fallback: true }
                };
            }
        }

        return { category: null, results: [], error: error.message };
    }
}

/**
 * Get the currently active category
 * @returns {Object|null} Active category {type, id} or null
 */
function getActiveCategory() {
    return activeCategory;
}

/**
 * Clear the active category
 */
function clearActiveCategory() {
    activeCategory = null;
}

/**
 * Render category items for a column
 * @param {Array} items - Category items
 * @param {string} type - Category type
 * @returns {string} HTML string
 */
function renderCategoryItems(items, type) {
    return items.map(item => `
        <button class="category-item${activeCategory && activeCategory.type === type && activeCategory.id === item.id ? ' active' : ''}"
                data-type="${type}"
                data-id="${item.id}"
                onclick="window.handleCategoryClick('${type}', '${item.id}')">
            ${item.label}
        </button>
    `).join('');
}

/**
 * Initialize categories UI
 * @param {Object} containers - DOM element IDs { subjects, moods, colors }
 */
async function initializeCategoriesUI(containers) {
    const categories = await loadCategories();
    if (!categories) return;

    // Populate subject items
    if (containers.subjects) {
        const subjectEl = document.getElementById(containers.subjects);
        if (subjectEl) {
            subjectEl.innerHTML = renderCategoryItems(categories.subjects, 'subjects');
        }
    }

    // Populate mood items
    if (containers.moods) {
        const moodEl = document.getElementById(containers.moods);
        if (moodEl) {
            moodEl.innerHTML = renderCategoryItems(categories.moods, 'moods');
        }
    }

    // Populate color items
    if (containers.colors) {
        const colorEl = document.getElementById(containers.colors);
        if (colorEl) {
            colorEl.innerHTML = renderCategoryItems(categories.colors, 'colors');
        }
    }
}

/**
 * Update active state in UI
 * @param {string} type - Category type
 * @param {string} id - Category id
 */
function updateCategoryActiveState(type, id) {
    // Remove all active states
    document.querySelectorAll('.category-item.active').forEach(el => {
        el.classList.remove('active');
    });

    // Add active to selected
    if (type && id) {
        const activeEl = document.querySelector(`.category-item[data-type="${type}"][data-id="${id}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
        }
    }
}

// Export to window for use in main.js
window.loadCategories = loadCategories;
window.browseByCategory = browseByCategory;
window.getActiveCategory = getActiveCategory;
window.clearActiveCategory = clearActiveCategory;
window.initializeCategoriesUI = initializeCategoriesUI;
window.updateCategoryActiveState = updateCategoryActiveState;
