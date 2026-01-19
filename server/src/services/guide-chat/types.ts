/**
 * Guide Chat Types
 * Type definitions for the art guide chat service
 */

import type { Artwork } from '../../types';

/** Chat message */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** Action taken by the guide */
export interface GuideAction {
  type: 'search' | 'display' | 'add_to_collection' | 'get_recommendations' | 'get_current_display';
  data: unknown;
  success: boolean;
}

/** Guide response with actions and results */
export interface GuideResponse {
  message: string;
  actions: GuideAction[];
  results?: Artwork[];
  displayed?: Artwork;
  metrics?: GuideMetrics;
}

/** Performance metrics for evaluation */
export interface GuideMetrics {
  totalDurationMs: number;
  firstResponseMs: number;
  toolExecutionMs: number;
  finalResponseMs: number;
  toolsCalled: string[];
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
}

/** Conversation session */
export interface ConversationSession {
  messages: ChatMessage[];
  createdAt: number;
  lastActivity: number;
}

/** Dependencies for tool handlers */
export interface GuideDependencies {
  searchFn: (query: string, limit: number) => Promise<Artwork[]>;
  displayFn: (artwork: Artwork) => Promise<{ success: boolean; message: string }>;
  getCurrentDisplayFn: () => Promise<{ artwork?: Artwork; title?: string; artist?: string } | null>;
}

/** Tool execution result */
export interface ToolExecutionResult {
  action: GuideAction;
  toolResult: string;
}

/** Service configuration constants */
export const GUIDE_CONFIG = {
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  MAX_SESSIONS: 100,
  MAX_MESSAGES_PER_SESSION: 50,
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
  MODEL: 'gpt-5-mini',
  MAX_COMPLETION_TOKENS: 400,
  MAX_FINAL_COMPLETION_TOKENS: 150,
} as const;
