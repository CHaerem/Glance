/**
 * Art Guide Chat Service
 * Conversational art discovery using GPT-4o with taste profile context.
 */

import OpenAI from 'openai';
import { loggers } from './logger';
import { getErrorMessage } from '../utils/error';
import tasteGuideService from './taste-guide';
import type { Artwork } from '../types';

const log = loggers.api.child({ component: 'guide-chat' });

/** Chat message */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** Guide response with optional search results */
interface GuideResponse {
  message: string;
  searchQuery?: string;
  results?: Artwork[];
}

/** Conversation session */
interface ConversationSession {
  messages: ChatMessage[];
  createdAt: number;
  lastActivity: number;
}

// In-memory conversation storage (keyed by session ID)
const conversations = new Map<string, ConversationSession>();

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

class GuideChatService {
  private client: OpenAI | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      log.info('Guide chat service initialized with OpenAI');
    } else {
      log.warn('OPENAI_API_KEY not set, guide chat will not work');
    }
    this.initialized = true;
  }

  /**
   * Get or create a conversation session
   */
  getSession(sessionId: string): ConversationSession {
    // Clean up expired sessions periodically
    this.cleanupExpiredSessions();

    let session = conversations.get(sessionId);
    if (!session) {
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
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        conversations.delete(id);
      }
    }
  }

  /**
   * Chat with the art guide
   */
  async chat(
    sessionId: string,
    userMessage: string,
    searchFn: (query: string, limit: number) => Promise<Artwork[]>
  ): Promise<GuideResponse> {
    await this.initialize();

    if (!this.client) {
      return {
        message: 'The art guide is not available. Please check the OpenAI API key configuration.',
      };
    }

    const session = this.getSession(sessionId);

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    try {
      // Get taste profile context
      const tasteContext = await tasteGuideService.getCollectionSummary();

      // Build conversation history for OpenAI
      const conversationHistory = session.messages.slice(-10).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Call GPT-5 mini for response (fast, capable, cost-effective)
      const response = await this.client.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an art curator and guide for a personal e-ink art display. You help users discover art they'll love.

${tasteContext ? `USER'S TASTE PROFILE:\n${tasteContext}\n\n` : ''}
YOUR ROLE:
- Help users find art through natural conversation
- Understand nuanced requests ("moody like Turner but more colorful")
- Make thoughtful recommendations based on their taste
- Be concise and curator-like (not verbose)

RESPONSE FORMAT:
Always respond with valid JSON in this exact format:
{
  "message": "Your conversational response (1-2 sentences, curator-style)",
  "searchQuery": "search terms to find matching art" or null if no search needed
}

GUIDELINES:
- If the user wants to find art, include a searchQuery
- If they're asking a question or chatting, searchQuery can be null
- Keep messages brief and elegant
- Reference their taste when relevant
- Suggest refinements if results might be too broad`,
          },
          ...conversationHistory,
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response
      let parsed: { message: string; searchQuery?: string | null };
      try {
        // Extract JSON from response (handle potential markdown wrapping)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: treat entire response as message
          parsed = { message: content, searchQuery: null };
        }
      } catch {
        log.warn('Failed to parse guide response as JSON', { content });
        parsed = { message: content, searchQuery: null };
      }

      // Execute search if query provided
      let results: Artwork[] | undefined;
      if (parsed.searchQuery) {
        try {
          results = await searchFn(parsed.searchQuery, 12);
          log.info('Guide search executed', {
            query: parsed.searchQuery,
            resultCount: results.length,
          });
        } catch (error) {
          log.error('Guide search failed', { error: getErrorMessage(error) });
        }
      }

      // Add assistant message to history
      session.messages.push({
        role: 'assistant',
        content: parsed.message,
        timestamp: Date.now(),
      });

      return {
        message: parsed.message,
        searchQuery: parsed.searchQuery || undefined,
        results,
      };
    } catch (error) {
      log.error('Guide chat failed', { error: getErrorMessage(error) });

      return {
        message: 'I had trouble processing that. Could you try rephrasing?',
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
}

// Export singleton instance
const guideChatService = new GuideChatService();
export default guideChatService;
export { GuideChatService, ChatMessage, GuideResponse };
