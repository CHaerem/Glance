/**
 * Art Guide Chat Service
 * Agentic art discovery using GPT-5 mini with function calling.
 * Can search, display, and manage collection through natural conversation.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { loggers } from '../logger';
import { getErrorMessage } from '../../utils/error';
import tasteGuideService from '../taste-guide';
import type { Artwork } from '../../types';
import {
  type ChatMessage,
  type GuideResponse,
  type GuideAction,
  type GuideDependencies,
  type ConversationSession,
  type GuideMetrics,
  GUIDE_CONFIG,
} from './types';
import { guideTools, executeToolCall } from './tools';

const log = loggers.api.child({ component: 'guide-chat' });

// In-memory conversation storage (keyed by session ID)
const conversations = new Map<string, ConversationSession>();

class GuideChatService {
  private client: OpenAI | null = null;
  private initialized = false;
  private lastSearchResults: Artwork[] = [];
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup to prevent memory leaks
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, GUIDE_CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  shutdown(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      log.info('Guide chat service shutdown');
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      log.info('Guide chat service initialized with OpenAI (agentic mode)');
    } else {
      log.warn('OPENAI_API_KEY not set, guide chat will not work');
    }
    this.initialized = true;
  }

  /**
   * Get or create a conversation session
   */
  getSession(sessionId: string): ConversationSession {
    this.cleanupExpiredSessions();

    let session = conversations.get(sessionId);
    if (!session) {
      // Enforce maximum session limit to prevent memory leaks
      if (conversations.size >= GUIDE_CONFIG.MAX_SESSIONS) {
        // Remove the oldest session by lastActivity
        let oldestId: string | null = null;
        let oldestTime = Infinity;
        for (const [id, sess] of conversations) {
          if (sess.lastActivity < oldestTime) {
            oldestTime = sess.lastActivity;
            oldestId = id;
          }
        }
        if (oldestId) {
          conversations.delete(oldestId);
          log.info('Removed oldest session to stay within limit', { removedId: oldestId, limit: GUIDE_CONFIG.MAX_SESSIONS });
        }
      }

      session = {
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      conversations.set(sessionId, session);
    }
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Clear a conversation session
   */
  clearSession(sessionId: string): void {
    conversations.delete(sessionId);
    log.info('Cleared guide session', { sessionId });
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of conversations) {
      if (now - session.lastActivity > GUIDE_CONFIG.SESSION_TIMEOUT_MS) {
        conversations.delete(id);
      }
    }
  }

  /**
   * Chat with the art guide (agentic)
   */
  async chat(
    sessionId: string,
    userMessage: string,
    deps: GuideDependencies
  ): Promise<GuideResponse> {
    await this.initialize();

    if (!this.client) {
      return {
        message: 'The art guide is not available. Please check the OpenAI API key configuration.',
        actions: [],
      };
    }

    const session = this.getSession(sessionId);

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    // Trim old messages to prevent memory growth
    if (session.messages.length > GUIDE_CONFIG.MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-GUIDE_CONFIG.MAX_MESSAGES_PER_SESSION);
    }

    try {
      // Start performance tracking
      const startTime = Date.now();
      let firstResponseMs = 0;
      let toolExecutionMs = 0;
      let finalResponseMs = 0;
      const toolsCalled: string[] = [];
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      // Get taste profile context
      const tasteContext = await tasteGuideService.getCollectionSummary();

      // Build conversation history for OpenAI
      const conversationHistory: ChatCompletionMessageParam[] = session.messages.slice(-10).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Call GPT-5-mini with tools
      const response = await this.client.chat.completions.create({
        model: GUIDE_CONFIG.MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an art curator and guide for a personal e-ink art display called Glance. You can search for art, display artworks on the frame, and manage the user's collection.

${tasteContext ? `USER'S TASTE PROFILE:\n${tasteContext}\n\n` : ''}
BEHAVIOR:
- Act on clear intent: "display Starry Night" → call display_artwork
- Search for discovery requests: "show me impressionist art" → call search_art
- Ask for clarification only when genuinely ambiguous
- Be concise and curator-like (1-2 sentences max)
- Reference their taste when making suggestions

IMPORTANT:
- When displaying, the frame will refresh in a few seconds
- Search results appear in the grid below the chat
- Always confirm actions taken ("Displaying...", "Added to collection", etc.)`,
          },
          ...conversationHistory,
        ],
        tools: guideTools,
        tool_choice: 'auto',
        max_completion_tokens: GUIDE_CONFIG.MAX_COMPLETION_TOKENS,
      });

      // Track first response timing and tokens
      firstResponseMs = Date.now() - startTime;
      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens;
        totalCompletionTokens += response.usage.completion_tokens;
      }

      const assistantMessage = response.choices[0]?.message;
      const toolCalls = assistantMessage?.tool_calls || [];
      const actions: GuideAction[] = [];
      let displayedArtwork: Artwork | undefined;

      // Track which tools were called
      for (const tc of toolCalls) {
        if (tc.type === 'function') {
          toolsCalled.push(tc.function.name);
        }
      }

      // Execute tool calls in parallel
      if (toolCalls.length > 0) {
        const toolStartTime = Date.now();
        const toolPromises = toolCalls.map(async (toolCall) => {
          if (toolCall.type !== 'function') {
            return { action: { type: 'search' as const, data: {}, success: false }, toolResult: '{}' };
          }
          const args = JSON.parse(toolCall.function.arguments || '{}');
          return executeToolCall(
            toolCall.function.name,
            args,
            deps,
            this.lastSearchResults,
            (results) => { this.lastSearchResults = results; }
          );
        });

        const toolResults = await Promise.all(toolPromises);
        toolExecutionMs = Date.now() - toolStartTime;

        // Collect actions
        for (const result of toolResults) {
          actions.push(result.action);
          if (result.action.type === 'display' && result.action.success) {
            const data = result.action.data as { artwork?: Artwork };
            displayedArtwork = data.artwork;
          }
        }

        // Get final response with tool results
        const toolResultMessages: ChatCompletionMessageParam[] = toolCalls.map((toolCall, index) => ({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: toolResults[index]?.toolResult || '{}',
        }));

        const finalStartTime = Date.now();
        const finalResponse = await this.client.chat.completions.create({
          model: GUIDE_CONFIG.MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an art curator. Respond briefly (1-2 sentences) confirming the action taken. Be warm but concise.`,
            },
            ...conversationHistory,
            {
              role: 'assistant',
              content: assistantMessage?.content || '',
              tool_calls: toolCalls,
            },
            ...toolResultMessages,
          ],
          max_completion_tokens: GUIDE_CONFIG.MAX_FINAL_COMPLETION_TOKENS,
        });
        finalResponseMs = Date.now() - finalStartTime;

        // Track final response tokens
        if (finalResponse.usage) {
          totalPromptTokens += finalResponse.usage.prompt_tokens;
          totalCompletionTokens += finalResponse.usage.completion_tokens;
        }

        const finalContent = finalResponse.choices[0]?.message?.content || 'Done.';
        const totalDurationMs = Date.now() - startTime;

        // Build metrics
        const metrics: GuideMetrics = {
          totalDurationMs,
          firstResponseMs,
          toolExecutionMs,
          finalResponseMs,
          toolsCalled,
          tokenUsage: {
            prompt: totalPromptTokens,
            completion: totalCompletionTokens,
            total: totalPromptTokens + totalCompletionTokens,
          },
          model: GUIDE_CONFIG.MODEL,
        };

        // Log performance metrics
        log.info('Guide response completed', {
          sessionId,
          userMessage: userMessage.substring(0, 50),
          ...metrics,
          actionsCount: actions.length,
          resultsCount: this.lastSearchResults.length,
        });

        // Add assistant message to history
        session.messages.push({
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
        });

        return {
          message: finalContent,
          actions,
          results: this.lastSearchResults.length > 0 ? this.lastSearchResults : undefined,
          displayed: displayedArtwork,
          metrics,
        };
      }

      // No tool calls - just a conversational response
      const content = assistantMessage?.content || 'I\'m here to help you discover art. What would you like to find?';
      const totalDurationMs = Date.now() - startTime;

      // Build metrics for no-tool-call response
      const metrics: GuideMetrics = {
        totalDurationMs,
        firstResponseMs,
        toolExecutionMs: 0,
        finalResponseMs: 0,
        toolsCalled: [],
        tokenUsage: {
          prompt: totalPromptTokens,
          completion: totalCompletionTokens,
          total: totalPromptTokens + totalCompletionTokens,
        },
        model: GUIDE_CONFIG.MODEL,
      };

      // Log performance metrics
      log.info('Guide response completed (no tools)', {
        sessionId,
        userMessage: userMessage.substring(0, 50),
        ...metrics,
      });

      session.messages.push({
        role: 'assistant',
        content,
        timestamp: Date.now(),
      });

      return {
        message: content,
        actions: [],
        metrics,
      };
    } catch (error) {
      log.error('Guide chat failed', { error: getErrorMessage(error) });

      return {
        message: 'I had trouble processing that. Could you try rephrasing?',
        actions: [],
      };
    }
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): ChatMessage[] {
    const session = conversations.get(sessionId);
    return session?.messages || [];
  }

  /**
   * Store search results for reference by other tools
   */
  setLastSearchResults(results: Artwork[]): void {
    this.lastSearchResults = results;
  }

  /**
   * Get diagnostics for memory monitoring
   */
  getDiagnostics(): {
    sessionCount: number;
    totalMessages: number;
    maxSessionMessages: number;
    oldestSessionAge: number;
    limits: { maxSessions: number; maxMessagesPerSession: number; sessionTimeoutMs: number };
  } {
    let totalMessages = 0;
    let maxSessionMessages = 0;
    let oldestSessionAge = 0;
    const now = Date.now();

    for (const session of conversations.values()) {
      totalMessages += session.messages.length;
      maxSessionMessages = Math.max(maxSessionMessages, session.messages.length);
      const age = now - session.createdAt;
      oldestSessionAge = Math.max(oldestSessionAge, age);
    }

    return {
      sessionCount: conversations.size,
      totalMessages,
      maxSessionMessages,
      oldestSessionAge,
      limits: {
        maxSessions: GUIDE_CONFIG.MAX_SESSIONS,
        maxMessagesPerSession: GUIDE_CONFIG.MAX_MESSAGES_PER_SESSION,
        sessionTimeoutMs: GUIDE_CONFIG.SESSION_TIMEOUT_MS,
      },
    };
  }
}

// Export singleton instance
const guideChatService = new GuideChatService();
export default guideChatService;
export { GuideChatService };
export type { ChatMessage, GuideResponse, GuideAction, GuideDependencies };
