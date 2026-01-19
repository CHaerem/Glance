/**
 * Statistics Service
 * Tracks API usage, costs, and logging statistics
 */

import { readJSONFile, writeJSONFile } from '../utils/data-store';
import { getErrorMessage } from '../utils/error';
import { loggers } from './logger';

const log = loggers.server;

/** OpenAI model pricing (as of 2025, in USD per 1M tokens) */
interface ModelPricing {
  input: number;
  output: number;
  imagePerRequest?: number;
}

const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-image-1': { input: 0, output: 0, imagePerRequest: 0.05 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
};

/** Statistics storage file */
const STATS_FILE = 'stats.json';

/** OpenAI call record */
interface OpenAICall {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
  cost: number;
  metadata: Record<string, unknown>;
}

/** API call record */
interface APICall {
  timestamp: number;
  source: string;
  endpoint: string;
  success: boolean;
  metadata: Record<string, unknown>;
}

/** Log activity record */
interface LogActivity {
  timestamp: number;
  level: string;
  message: string;
}

/** Model stats */
interface ModelStats {
  calls: number;
  tokens: number;
  cost: number;
}

/** Source stats */
interface SourceStats {
  calls: number;
  successes: number;
  failures: number;
}

/** Statistics cache structure */
interface StatsCache {
  openai: {
    calls: OpenAICall[];
    summary: {
      totalCalls: number;
      totalTokens: number;
      totalCost: number;
      byModel: Record<string, ModelStats>;
    };
  };
  apiCalls: {
    calls: APICall[];
    summary: {
      totalCalls: number;
      bySource: Record<string, SourceStats>;
    };
  };
  logs: {
    summary: {
      totalLogs: number;
      byLevel: Record<string, number>;
      recentActivity: LogActivity[];
    };
  };
  startTime: number;
}

/** Time range options */
type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

class StatisticsService {
  private statsCache: StatsCache;

  constructor() {
    // In-memory statistics cache (synced with file)
    this.statsCache = this.createEmptyCache();
  }

  private createEmptyCache(): StatsCache {
    return {
      openai: {
        calls: [],
        summary: {
          totalCalls: 0,
          totalTokens: 0,
          totalCost: 0,
          byModel: {},
        },
      },
      apiCalls: {
        calls: [],
        summary: {
          totalCalls: 0,
          bySource: {},
        },
      },
      logs: {
        summary: {
          totalLogs: 0,
          byLevel: { INFO: 0, ERROR: 0 },
          recentActivity: [],
        },
      },
      startTime: Date.now(),
    };
  }

  /**
   * Load statistics from file
   */
  async loadStats(): Promise<void> {
    try {
      const stats = await readJSONFile<StatsCache>(STATS_FILE);
      if (stats) {
        this.statsCache = stats;
        log.debug('Statistics loaded from file');
      }
    } catch {
      log.debug('No existing statistics file, starting fresh');
    }
  }

  /**
   * Save statistics to file
   */
  async saveStats(): Promise<void> {
    try {
      await writeJSONFile(STATS_FILE, this.statsCache);
    } catch (error) {
      log.error('Failed to save statistics', {
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Track OpenAI API call
   * @param model - The model used
   * @param promptTokens - Number of prompt tokens
   * @param completionTokens - Number of completion tokens
   * @param success - Whether the call succeeded
   * @param metadata - Additional metadata
   * @returns The tracked call
   */
  async trackOpenAICall(
    model: string,
    promptTokens: number,
    completionTokens: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): Promise<OpenAICall> {
    const call: OpenAICall = {
      timestamp: Date.now(),
      model,
      promptTokens: promptTokens || 0,
      completionTokens: completionTokens || 0,
      totalTokens: (promptTokens || 0) + (completionTokens || 0),
      success,
      cost: 0,
      metadata,
    };

    // Calculate cost
    const pricing = OPENAI_PRICING[model] ?? OPENAI_PRICING['gpt-4o-mini'];
    if (pricing?.imagePerRequest) {
      call.cost = pricing.imagePerRequest;
    } else if (pricing) {
      call.cost =
        (call.promptTokens / 1000000) * pricing.input +
        (call.completionTokens / 1000000) * pricing.output;
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
        cost: 0,
      };
    }
    const modelStats = this.statsCache.openai.summary.byModel[model];
    if (modelStats) {
      modelStats.calls++;
      modelStats.tokens += call.totalTokens;
      modelStats.cost += call.cost;
    }

    // Save to file (async, don't wait)
    this.saveStats().catch((err: Error) =>
      log.error('Failed to save stats', { error: err.message })
    );

    return call;
  }

  /**
   * Track external API call (museum APIs, etc.)
   * @param source - The API source
   * @param endpoint - The endpoint called
   * @param success - Whether the call succeeded
   * @param metadata - Additional metadata
   * @returns The tracked call
   */
  async trackAPICall(
    source: string,
    endpoint: string,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): Promise<APICall> {
    const call: APICall = {
      timestamp: Date.now(),
      source,
      endpoint,
      success,
      metadata,
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
        failures: 0,
      };
    }
    const sourceStats = this.statsCache.apiCalls.summary.bySource[source];
    if (sourceStats) {
      sourceStats.calls++;
      if (success) {
        sourceStats.successes++;
      } else {
        sourceStats.failures++;
      }
    }

    // Save to file (async, don't wait)
    this.saveStats().catch((err: Error) =>
      log.error('Failed to save stats', { error: err.message })
    );

    return call;
  }

  /**
   * Track log entry
   * @param level - Log level (INFO, ERROR, etc.)
   * @param message - Log message
   */
  async trackLog(level: string, message: string): Promise<void> {
    this.statsCache.logs.summary.totalLogs++;
    this.statsCache.logs.summary.byLevel[level] =
      (this.statsCache.logs.summary.byLevel[level] ?? 0) + 1;

    // Add to recent activity (keep last 100)
    const activity: LogActivity = {
      timestamp: Date.now(),
      level,
      message: message.substring(0, 100), // Truncate for storage
    };
    this.statsCache.logs.summary.recentActivity.push(activity);
    if (this.statsCache.logs.summary.recentActivity.length > 100) {
      this.statsCache.logs.summary.recentActivity.shift();
    }

    // Don't save on every log (too frequent), will be saved with other stats
  }

  /**
   * Get statistics with time ranges
   * @param timeRange - Time range ('1h', '24h', '7d', '30d', 'all')
   * @returns Filtered statistics
   */
  getStats(timeRange: TimeRange = 'all'): Record<string, unknown> {
    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      all: Infinity,
    };
    const cutoff = now - (ranges[timeRange] ?? ranges['all']);

    // Filter calls by time range
    const filteredOpenAICalls = this.statsCache.openai.calls.filter(
      (c) => c.timestamp >= cutoff
    );
    const filteredAPICalls = this.statsCache.apiCalls.calls.filter(
      (c) => c.timestamp >= cutoff
    );

    // Calculate filtered summaries
    const openaiSummary: {
      totalCalls: number;
      totalTokens: number;
      totalCost: number;
      byModel: Record<string, ModelStats>;
    } = {
      totalCalls: filteredOpenAICalls.length,
      totalTokens: filteredOpenAICalls.reduce((sum, c) => sum + c.totalTokens, 0),
      totalCost: filteredOpenAICalls.reduce((sum, c) => sum + c.cost, 0),
      byModel: {},
    };

    filteredOpenAICalls.forEach((call) => {
      if (!openaiSummary.byModel[call.model]) {
        openaiSummary.byModel[call.model] = { calls: 0, tokens: 0, cost: 0 };
      }
      const modelStats = openaiSummary.byModel[call.model];
      if (modelStats) {
        modelStats.calls++;
        modelStats.tokens += call.totalTokens;
        modelStats.cost += call.cost;
      }
    });

    const apiSummary: {
      totalCalls: number;
      bySource: Record<string, SourceStats>;
    } = {
      totalCalls: filteredAPICalls.length,
      bySource: {},
    };

    filteredAPICalls.forEach((call) => {
      if (!apiSummary.bySource[call.source]) {
        apiSummary.bySource[call.source] = {
          calls: 0,
          successes: 0,
          failures: 0,
        };
      }
      const sourceStats = apiSummary.bySource[call.source];
      if (sourceStats) {
        sourceStats.calls++;
        if (call.success) {
          sourceStats.successes++;
        } else {
          sourceStats.failures++;
        }
      }
    });

    return {
      timeRange,
      uptime: now - this.statsCache.startTime,
      openai: {
        summary: openaiSummary,
        recentCalls: filteredOpenAICalls.slice(-10),
      },
      apiCalls: {
        summary: apiSummary,
        recentCalls: filteredAPICalls.slice(-10),
      },
      logs: this.statsCache.logs.summary,
    };
  }

  /**
   * Reset all statistics
   */
  async resetStats(): Promise<void> {
    this.statsCache = this.createEmptyCache();
    await this.saveStats();
  }
}

// Export singleton instance
const statisticsService = new StatisticsService();
export default statisticsService;

// Also export the class for testing
export { StatisticsService };
export type { TimeRange };
