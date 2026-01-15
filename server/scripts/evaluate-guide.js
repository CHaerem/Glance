#!/usr/bin/env node
/**
 * Guide Performance Evaluation Script
 *
 * Runs live tests against the AI guide to measure actual performance.
 * Requires OPENAI_API_KEY environment variable.
 *
 * Usage: node scripts/evaluate-guide.js
 */

// Load environment variables from .env file
require('dotenv').config();

const guideChatService = require('../services/guide-chat').default;

// Test scenarios with expected tool selections
const testScenarios = [
    { input: 'show me Van Gogh paintings', expectedTool: 'search_art', category: 'Search' },
    { input: 'impressionist landscapes', expectedTool: 'search_art', category: 'Search' },
    { input: 'something peaceful and calm', expectedTool: 'search_art', category: 'Search' },
    { input: 'display Starry Night', expectedTool: 'display_artwork', category: 'Display' },
    { input: "what's on the frame?", expectedTool: 'get_current_display', category: 'Info' },
    { input: 'hello', expectedTool: null, category: 'Conversational' },
];

// Mock dependencies (we're testing the AI, not the actual actions)
const mockDeps = {
    searchFn: async (query, limit) => {
        // Simulate search delay
        await new Promise(r => setTimeout(r, 100));
        return [
            {
                id: 'test-1',
                title: 'The Starry Night',
                artist: 'Vincent van Gogh',
                date: '1889',
                source: 'met',
                imageUrl: 'https://example.com/starry-night.jpg',
                thumbnailUrl: 'https://example.com/starry-night-thumb.jpg',
            },
        ];
    },
    displayFn: async (artwork) => {
        await new Promise(r => setTimeout(r, 50));
        return { success: true, message: 'Displayed' };
    },
    getCurrentDisplayFn: async () => ({
        title: 'Water Lilies',
        artist: 'Claude Monet',
    }),
};

async function runEvaluation() {
    console.log('='.repeat(70));
    console.log('GUIDE PERFORMANCE EVALUATION');
    console.log('='.repeat(70));
    console.log();

    if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: OPENAI_API_KEY environment variable not set');
        process.exit(1);
    }

    const results = [];

    for (const scenario of testScenarios) {
        const sessionId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        console.log(`Testing: "${scenario.input}"`);
        console.log(`  Expected: ${scenario.expectedTool || 'no tool'}`);

        try {
            const response = await guideChatService.chat(sessionId, scenario.input, mockDeps);

            const metrics = response.metrics || {};
            const toolsCalled = metrics.toolsCalled || [];
            const actualTool = toolsCalled[0] || null;
            const correct = actualTool === scenario.expectedTool;

            results.push({
                input: scenario.input,
                category: scenario.category,
                expected: scenario.expectedTool,
                actual: actualTool,
                correct,
                totalMs: metrics.totalDurationMs || 0,
                firstResponseMs: metrics.firstResponseMs || 0,
                toolExecutionMs: metrics.toolExecutionMs || 0,
                tokens: metrics.tokenUsage?.total || 0,
                message: response.message?.substring(0, 60) + '...',
            });

            console.log(`  Actual: ${actualTool || 'no tool'} ${correct ? '✓' : '✗'}`);
            console.log(`  Time: ${metrics.totalDurationMs}ms (first: ${metrics.firstResponseMs}ms)`);
            console.log(`  Tokens: ${metrics.tokenUsage?.total || 'N/A'}`);
            console.log(`  Response: "${response.message?.substring(0, 50)}..."`);
            console.log();

            // Clear session
            guideChatService.clearSession(sessionId);
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
            results.push({
                input: scenario.input,
                category: scenario.category,
                expected: scenario.expectedTool,
                actual: 'ERROR',
                correct: false,
                totalMs: 0,
                error: error.message,
            });
            console.log();
        }

        // Small delay between tests
        await new Promise(r => setTimeout(r, 500));
    }

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log();

    const correct = results.filter(r => r.correct).length;
    const total = results.length;
    const accuracy = ((correct / total) * 100).toFixed(1);

    console.log(`Tool Selection Accuracy: ${correct}/${total} (${accuracy}%)`);
    console.log();

    // Performance stats
    const validResults = results.filter(r => r.totalMs > 0);
    if (validResults.length > 0) {
        const avgTotal = Math.round(validResults.reduce((s, r) => s + r.totalMs, 0) / validResults.length);
        const avgFirst = Math.round(validResults.reduce((s, r) => s + r.firstResponseMs, 0) / validResults.length);
        const avgTokens = Math.round(validResults.reduce((s, r) => s + r.tokens, 0) / validResults.length);
        const maxTotal = Math.max(...validResults.map(r => r.totalMs));
        const minTotal = Math.min(...validResults.map(r => r.totalMs));

        console.log('Performance:');
        console.log(`  Avg total time: ${avgTotal}ms`);
        console.log(`  Avg first response: ${avgFirst}ms`);
        console.log(`  Min/Max total: ${minTotal}ms / ${maxTotal}ms`);
        console.log(`  Avg tokens: ${avgTokens}`);
        console.log();

        // Check against benchmarks
        const TARGET_TOTAL = 5000;
        const TARGET_FIRST = 2000;

        console.log('Benchmarks:');
        console.log(`  Total time < ${TARGET_TOTAL}ms: ${avgTotal < TARGET_TOTAL ? '✓ PASS' : '✗ FAIL'}`);
        console.log(`  First response < ${TARGET_FIRST}ms: ${avgFirst < TARGET_FIRST ? '✓ PASS' : '✗ FAIL'}`);
    }

    console.log();
    console.log('='.repeat(70));

    // Detailed results table
    console.log();
    console.log('Detailed Results:');
    console.log('-'.repeat(70));
    console.log('| Input (truncated)              | Expected        | Actual          | Time   |');
    console.log('-'.repeat(70));
    for (const r of results) {
        const input = r.input.substring(0, 30).padEnd(30);
        const expected = (r.expected || 'none').padEnd(15);
        const actual = (r.actual || 'none').padEnd(15);
        const time = `${r.totalMs}ms`.padStart(6);
        const mark = r.correct ? '✓' : '✗';
        console.log(`| ${input} | ${expected} | ${actual} | ${time} | ${mark}`);
    }
    console.log('-'.repeat(70));
}

runEvaluation().catch(console.error);
