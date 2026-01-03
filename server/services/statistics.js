/**
 * Statistics Service
 * Tracks API usage, costs, and logging statistics
 */

const { readJSONFile, writeJSONFile } = require("../utils/data-store");

// OpenAI model pricing (as of 2025, in USD per 1M tokens)
const OPENAI_PRICING = {
	'gpt-image-1': { input: 0, output: 0, imagePerRequest: 0.05 }, // $0.05 per image (estimated)
	'gpt-4': { input: 30.00, output: 60.00 },
	'gpt-4o': { input: 5.00, output: 15.00 },
	'gpt-4o-mini': { input: 0.15, output: 0.60 },
	'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
};

// Statistics storage
const STATS_FILE = 'stats.json';

class StatisticsService {
	constructor() {
		// In-memory statistics cache (synced with file)
		this.statsCache = {
			openai: {
				calls: [],
				summary: {
					totalCalls: 0,
					totalTokens: 0,
					totalCost: 0,
					byModel: {}
				}
			},
			apiCalls: {
				calls: [],
				summary: {
					totalCalls: 0,
					bySource: {}
				}
			},
			logs: {
				summary: {
					totalLogs: 0,
					byLevel: { INFO: 0, ERROR: 0 },
					recentActivity: []
				}
			},
			startTime: Date.now()
		};
	}

	/**
	 * Load statistics from file
	 */
	async loadStats() {
		try {
			const stats = await readJSONFile(STATS_FILE);
			if (stats) {
				this.statsCache = stats;
				console.log('Statistics loaded from file');
			}
		} catch (error) {
			console.log('No existing statistics file, starting fresh');
		}
	}

	/**
	 * Save statistics to file
	 */
	async saveStats() {
		try {
			await writeJSONFile(STATS_FILE, this.statsCache);
		} catch (error) {
			console.error('Failed to save statistics:', error);
		}
	}

	/**
	 * Track OpenAI API call
	 * @param {string} model - The model used
	 * @param {number} promptTokens - Number of prompt tokens
	 * @param {number} completionTokens - Number of completion tokens
	 * @param {boolean} success - Whether the call succeeded
	 * @param {Object} metadata - Additional metadata
	 * @returns {Object} The tracked call
	 */
	async trackOpenAICall(model, promptTokens, completionTokens, success, metadata = {}) {
		const call = {
			timestamp: Date.now(),
			model,
			promptTokens: promptTokens || 0,
			completionTokens: completionTokens || 0,
			totalTokens: (promptTokens || 0) + (completionTokens || 0),
			success,
			metadata
		};

		// Calculate cost
		const pricing = OPENAI_PRICING[model] || OPENAI_PRICING['gpt-4o-mini'];
		if (pricing.imagePerRequest) {
			call.cost = pricing.imagePerRequest;
		} else {
			call.cost = (
				(call.promptTokens / 1000000) * pricing.input +
				(call.completionTokens / 1000000) * pricing.output
			);
		}

		// Add to calls array (keep last 1000)
		this.statsCache.openai.calls.push(call);
		if (this.statsCache.openai.calls.length > 1000) {
			this.statsCache.openai.calls.shift();
		}

		// Update summary
		this.statsCache.openai.summary.totalCalls++;
		this.statsCache.openai.summary.totalTokens += call.totalTokens;
		this.statsCache.openai.summary.totalCost += call.cost;

		// Update by-model stats
		if (!this.statsCache.openai.summary.byModel[model]) {
			this.statsCache.openai.summary.byModel[model] = {
				calls: 0,
				tokens: 0,
				cost: 0
			};
		}
		this.statsCache.openai.summary.byModel[model].calls++;
		this.statsCache.openai.summary.byModel[model].tokens += call.totalTokens;
		this.statsCache.openai.summary.byModel[model].cost += call.cost;

		// Save to file (async, don't wait)
		this.saveStats().catch(err => console.error('Failed to save stats:', err));

		return call;
	}

	/**
	 * Track external API call (museum APIs, etc.)
	 * @param {string} source - The API source
	 * @param {string} endpoint - The endpoint called
	 * @param {boolean} success - Whether the call succeeded
	 * @param {Object} metadata - Additional metadata
	 * @returns {Object} The tracked call
	 */
	async trackAPICall(source, endpoint, success, metadata = {}) {
		const call = {
			timestamp: Date.now(),
			source,
			endpoint,
			success,
			metadata
		};

		// Add to calls array (keep last 1000)
		this.statsCache.apiCalls.calls.push(call);
		if (this.statsCache.apiCalls.calls.length > 1000) {
			this.statsCache.apiCalls.calls.shift();
		}

		// Update summary
		this.statsCache.apiCalls.summary.totalCalls++;

		// Update by-source stats
		if (!this.statsCache.apiCalls.summary.bySource[source]) {
			this.statsCache.apiCalls.summary.bySource[source] = {
				calls: 0,
				successes: 0,
				failures: 0
			};
		}
		this.statsCache.apiCalls.summary.bySource[source].calls++;
		if (success) {
			this.statsCache.apiCalls.summary.bySource[source].successes++;
		} else {
			this.statsCache.apiCalls.summary.bySource[source].failures++;
		}

		// Save to file (async, don't wait)
		this.saveStats().catch(err => console.error('Failed to save stats:', err));

		return call;
	}

	/**
	 * Track log entry
	 * @param {string} level - Log level (INFO, ERROR, etc.)
	 * @param {string} message - Log message
	 */
	async trackLog(level, message) {
		this.statsCache.logs.summary.totalLogs++;
		this.statsCache.logs.summary.byLevel[level] = (this.statsCache.logs.summary.byLevel[level] || 0) + 1;

		// Add to recent activity (keep last 100)
		const activity = {
			timestamp: Date.now(),
			level,
			message: message.substring(0, 100) // Truncate for storage
		};
		this.statsCache.logs.summary.recentActivity.push(activity);
		if (this.statsCache.logs.summary.recentActivity.length > 100) {
			this.statsCache.logs.summary.recentActivity.shift();
		}

		// Don't save on every log (too frequent), will be saved with other stats
	}

	/**
	 * Get statistics with time ranges
	 * @param {string} timeRange - Time range ('1h', '24h', '7d', '30d', 'all')
	 * @returns {Object} Filtered statistics
	 */
	getStats(timeRange = 'all') {
		const now = Date.now();
		const ranges = {
			'1h': 60 * 60 * 1000,
			'24h': 24 * 60 * 60 * 1000,
			'7d': 7 * 24 * 60 * 60 * 1000,
			'30d': 30 * 24 * 60 * 60 * 1000,
			'all': Infinity
		};
		const cutoff = now - (ranges[timeRange] || ranges['all']);

		// Filter calls by time range
		const filteredOpenAICalls = this.statsCache.openai.calls.filter(c => c.timestamp >= cutoff);
		const filteredAPICalls = this.statsCache.apiCalls.calls.filter(c => c.timestamp >= cutoff);

		// Calculate filtered summaries
		const openaiSummary = {
			totalCalls: filteredOpenAICalls.length,
			totalTokens: filteredOpenAICalls.reduce((sum, c) => sum + c.totalTokens, 0),
			totalCost: filteredOpenAICalls.reduce((sum, c) => sum + c.cost, 0),
			byModel: {}
		};

		filteredOpenAICalls.forEach(call => {
			if (!openaiSummary.byModel[call.model]) {
				openaiSummary.byModel[call.model] = { calls: 0, tokens: 0, cost: 0 };
			}
			openaiSummary.byModel[call.model].calls++;
			openaiSummary.byModel[call.model].tokens += call.totalTokens;
			openaiSummary.byModel[call.model].cost += call.cost;
		});

		const apiSummary = {
			totalCalls: filteredAPICalls.length,
			bySource: {}
		};

		filteredAPICalls.forEach(call => {
			if (!apiSummary.bySource[call.source]) {
				apiSummary.bySource[call.source] = { calls: 0, successes: 0, failures: 0 };
			}
			apiSummary.bySource[call.source].calls++;
			if (call.success) {
				apiSummary.bySource[call.source].successes++;
			} else {
				apiSummary.bySource[call.source].failures++;
			}
		});

		return {
			timeRange,
			uptime: now - this.statsCache.startTime,
			openai: {
				summary: openaiSummary,
				recentCalls: filteredOpenAICalls.slice(-10)
			},
			apiCalls: {
				summary: apiSummary,
				recentCalls: filteredAPICalls.slice(-10)
			},
			logs: this.statsCache.logs.summary
		};
	}

	/**
	 * Reset all statistics
	 */
	async resetStats() {
		this.statsCache = {
			openai: {
				calls: [],
				summary: {
					totalCalls: 0,
					totalTokens: 0,
					totalCost: 0,
					byModel: {}
				}
			},
			apiCalls: {
				calls: [],
				summary: {
					totalCalls: 0,
					bySource: {}
				}
			},
			logs: {
				summary: {
					totalLogs: 0,
					byLevel: { INFO: 0, ERROR: 0 },
					recentActivity: []
				}
			},
			startTime: Date.now()
		};
		await this.saveStats();
	}
}

// Export singleton instance
module.exports = new StatisticsService();
