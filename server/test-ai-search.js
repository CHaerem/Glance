#!/usr/bin/env node

/**
 * Test script to evaluate AI search quality
 */

const testQueries = [
    {
        query: "peaceful blue impressionist paintings",
        expectedThemes: ["impressionism", "blue", "peaceful", "landscape"]
    },
    {
        query: "dramatic renaissance portraits of women",
        expectedThemes: ["renaissance", "portrait", "woman", "dramatic"]
    },
    {
        query: "bold colorful abstract modern art",
        expectedThemes: ["abstract", "modern", "colorful", "bold"]
    },
    {
        query: "japanese woodblock prints",
        expectedThemes: ["japanese", "woodblock", "print", "asia"]
    },
    {
        query: "van gogh starry night style paintings",
        expectedThemes: ["van gogh", "post-impressionism", "landscape", "night"]
    }
];

async function testSmartSearch(query) {
    try {
        const response = await fetch('http://localhost:3000/api/art/smart-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            return { error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return { error: error.message };
    }
}

async function testSimilarSearch(artwork) {
    try {
        const response = await fetch('http://localhost:3000/api/art/similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(artwork)
        });

        if (!response.ok) {
            return { error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return { error: error.message };
    }
}

console.log("=".repeat(80));
console.log("AI SEARCH EVALUATION TEST");
console.log("=".repeat(80));
console.log();

// Test 1: Smart Search
console.log("TEST 1: SMART SEARCH (Natural Language Queries)");
console.log("-".repeat(80));

for (const test of testQueries) {
    console.log(`\nQuery: "${test.query}"`);
    console.log(`Expected themes: ${test.expectedThemes.join(", ")}`);

    const result = await testSmartSearch(test.query);

    if (result.error) {
        console.log(`❌ ERROR: ${result.error}`);
        continue;
    }

    console.log(`\nAI Extracted Parameters:`);
    if (result.metadata && result.metadata.parameters) {
        const params = result.metadata.parameters;
        console.log(`  - Search terms: ${params.searchTerms?.join(", ") || "none"}`);
        console.log(`  - Styles: ${params.styles?.join(", ") || "none"}`);
        console.log(`  - Colors: ${params.colors?.join(", ") || "none"}`);
        console.log(`  - Moods: ${params.moods?.join(", ") || "none"}`);
        console.log(`  - Subjects: ${params.subjects?.join(", ") || "none"}`);
    }

    console.log(`\nSearch Query: "${result.metadata?.searchQuery}"`);
    console.log(`Results: ${result.results?.length || 0} artworks found`);

    if (result.results && result.results.length > 0) {
        console.log(`\nTop 3 Results:`);
        result.results.slice(0, 3).forEach((art, i) => {
            console.log(`  ${i + 1}. "${art.title}" by ${art.artist || "Unknown"}`);
            console.log(`     Source: ${art.source}`);
        });
    }
}

// Test 2: Similar Artworks
console.log("\n" + "=".repeat(80));
console.log("TEST 2: MORE LIKE THIS (Similarity Search)");
console.log("-".repeat(80));

const similarityTests = [
    {
        title: "Water Lilies",
        artist: "Claude Monet",
        date: "1906",
        department: "Paintings"
    },
    {
        title: "The Starry Night",
        artist: "Vincent van Gogh",
        date: "1889",
        department: "Paintings"
    },
    {
        title: "Girl with a Pearl Earring",
        artist: "Johannes Vermeer",
        date: "1665",
        department: "Paintings"
    }
];

for (const artwork of similarityTests) {
    console.log(`\nFinding artworks similar to: "${artwork.title}" by ${artwork.artist}`);

    const result = await testSimilarSearch(artwork);

    if (result.error) {
        console.log(`❌ ERROR: ${result.error}`);
        continue;
    }

    if (result.metadata) {
        console.log(`\nAI Analysis:`);
        console.log(`  Search terms: ${result.metadata.searchTerms?.join(", ") || "none"}`);
        console.log(`  Reasoning: ${result.metadata.reasoning || "none"}`);
    }

    console.log(`\nResults: ${result.results?.length || 0} similar artworks found`);

    if (result.results && result.results.length > 0) {
        console.log(`\nTop 5 Similar Artworks:`);
        result.results.slice(0, 5).forEach((art, i) => {
            console.log(`  ${i + 1}. "${art.title}" by ${art.artist || "Unknown"}`);
            console.log(`     Source: ${art.source}, Date: ${art.date || "Unknown"}`);
        });
    }
}

console.log("\n" + "=".repeat(80));
console.log("EVALUATION SUMMARY");
console.log("-".repeat(80));
console.log("\nKey Metrics to Evaluate:");
console.log("1. Parameter Extraction: Does AI correctly identify styles, moods, colors?");
console.log("2. Result Relevance: Do returned artworks match the query intent?");
console.log("3. Similarity Quality: Are 'similar' artworks actually similar?");
console.log("4. Diversity: Does it return varied but relevant results?");
console.log("5. Source Coverage: Does it search across multiple museums?");
console.log("\n" + "=".repeat(80));
