/**
 * Art Guide Chat Service
 * Agentic art discovery using GPT-5 mini with function calling.
 * Can search, display, and manage collection through natural conversation.
 */

import OpenAI from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
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

/** Action taken by the guide */
interface GuideAction {
  type: 'search' | 'display' | 'add_to_collection' | 'get_recommendations' | 'get_current_display';
  data: unknown;
  success: boolean;
}

/** Guide response with actions and results */
interface GuideResponse {
  message: string;
  actions: GuideAction[];
  results?: Artwork[];
  displayed?: Artwork;
}

/** Conversation session */
interface ConversationSession {
  messages: ChatMessage[];
  createdAt: number;
  lastActivity: number;
}

/** Dependencies for tool handlers */
interface GuideDependencies {
  searchFn: (query: string, limit: number) => Promise<Artwork[]>;
  displayFn: (artwork: Artwork) => Promise<{ success: boolean; message: string }>;
  getCurrentDisplayFn: () => Promise<{ artwork?: Artwork; title?: string; artist?: string } | null>;
}

// In-memory conversation storage (keyed by session ID)
const conversations = new Map<string, ConversationSession>();

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Tools available to the guide
const guideTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_art',
      description: 'Search museum collections for artworks matching a query. Use this when the user wants to find, discover, or explore art.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "impressionist landscapes", "Van Gogh", "peaceful water scenes")',
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (default 12, max 24)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'display_artwork',
      description: 'Display an artwork on the e-ink frame. Use this when the user clearly wants to show a specific artwork (e.g., "display this", "show Starry Night on the frame").',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the artwork to display',
          },
          artist: {
            type: 'string',
            description: 'Artist name (optional but helpful)',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_collection',
      description: 'Add an artwork to the user\'s personal collection. Use when user says "save this", "add to favorites", or "add to my collection".',
      parameters: {
        type: 'object',
        properties: {
          artworkId: {
            type: 'string',
            description: 'ID of the artwork to add',
          },
        },
        required: ['artworkId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recommendations',
      description: 'Get personalized art recommendations based on the user\'s collection and taste. Use when user asks for suggestions or "something like my collection".',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recommendations (default 12)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_display',
      description: 'Check what artwork is currently showing on the e-ink frame. Use when user asks "what\'s on the frame" or "what\'s currently displayed".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

class GuideChatService {
  private client: OpenAI | null = null;
  private initialized = false;
  private lastSearchResults: Artwork[] = [];

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
   * Execute a tool call
   */
  private async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    deps: GuideDependencies
  ): Promise<{ action: GuideAction; toolResult: string }> {
    log.info('Executing tool', { toolName, args });

    switch (toolName) {
      case 'search_art': {
        const query = args.query as string;
        const limit = Math.min((args.limit as number) || 12, 24);
        try {
          const results = await deps.searchFn(query, limit);
          this.lastSearchResults = results;
          return {
            action: { type: 'search', data: { query, resultCount: results.length }, success: true },
            toolResult: JSON.stringify({ success: true, resultCount: results.length, query }),
          };
        } catch (error) {
          return {
            action: { type: 'search', data: { query, error: getErrorMessage(error) }, success: false },
            toolResult: JSON.stringify({ success: false, error: getErrorMessage(error) }),
          };
        }
      }

      case 'display_artwork': {
        const title = args.title as string;
        const artist = args.artist as string | undefined;

        // Find artwork from recent search results
        let artwork = this.lastSearchResults.find(
          (a) => a.title.toLowerCase().includes(title.toLowerCase()) ||
                 (artist && a.artist.toLowerCase().includes(artist.toLowerCase()))
        );

        // If not found in recent results, search for it
        if (!artwork) {
          try {
            const searchResults = await deps.searchFn(`${title} ${artist || ''}`, 5);
            artwork = searchResults[0];
          } catch {
            // Continue without artwork
          }
        }

        if (!artwork) {
          return {
            action: { type: 'display', data: { title, error: 'Artwork not found' }, success: false },
            toolResult: JSON.stringify({ success: false, error: `Could not find "${title}"` }),
          };
        }

        try {
          const result = await deps.displayFn(artwork);
          return {
            action: { type: 'display', data: { artwork, result }, success: result.success },
            toolResult: JSON.stringify({ success: result.success, title: artwork.title, artist: artwork.artist }),
          };
        } catch (error) {
          return {
            action: { type: 'display', data: { title, error: getErrorMessage(error) }, success: false },
            toolResult: JSON.stringify({ success: false, error: getErrorMessage(error) }),
          };
        }
      }

      case 'add_to_collection': {
        const artworkId = args.artworkId as string;
        const artwork = this.lastSearchResults.find((a) => a.id === artworkId);

        if (!artwork) {
          return {
            action: { type: 'add_to_collection', data: { artworkId, error: 'Artwork not found' }, success: false },
            toolResult: JSON.stringify({ success: false, error: 'Artwork not found in recent results' }),
          };
        }

        try {
          const result = await tasteGuideService.addToCollection(artwork);
          return {
            action: { type: 'add_to_collection', data: { artwork, result }, success: result.success },
            toolResult: JSON.stringify(result),
          };
        } catch (error) {
          return {
            action: { type: 'add_to_collection', data: { artworkId, error: getErrorMessage(error) }, success: false },
            toolResult: JSON.stringify({ success: false, error: getErrorMessage(error) }),
          };
        }
      }

      case 'get_recommendations': {
        const limit = (args.limit as number) || 12;
        try {
          const recommendations = await tasteGuideService.getRecommendations(deps.searchFn, limit);
          this.lastSearchResults = recommendations;
          return {
            action: { type: 'get_recommendations', data: { resultCount: recommendations.length }, success: true },
            toolResult: JSON.stringify({ success: true, resultCount: recommendations.length }),
          };
        } catch (error) {
          return {
            action: { type: 'get_recommendations', data: { error: getErrorMessage(error) }, success: false },
            toolResult: JSON.stringify({ success: false, error: getErrorMessage(error) }),
          };
        }
      }

      case 'get_current_display': {
        try {
          const current = await deps.getCurrentDisplayFn();
          if (current) {
            return {
              action: { type: 'get_current_display', data: current, success: true },
              toolResult: JSON.stringify({ success: true, ...current }),
            };
          } else {
            return {
              action: { type: 'get_current_display', data: null, success: true },
              toolResult: JSON.stringify({ success: true, message: 'No artwork currently displayed' }),
            };
          }
        } catch (error) {
          return {
            action: { type: 'get_current_display', data: { error: getErrorMessage(error) }, success: false },
            toolResult: JSON.stringify({ success: false, error: getErrorMessage(error) }),
          };
        }
      }

      default:
        return {
          action: { type: 'search', data: { error: 'Unknown tool' }, success: false },
          toolResult: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
        };
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

    try {
      // Get taste profile context
      const tasteContext = await tasteGuideService.getCollectionSummary();

      // Build conversation history for OpenAI
      const conversationHistory: ChatCompletionMessageParam[] = session.messages.slice(-10).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Call GPT-5 mini with tools
      const response = await this.client.chat.completions.create({
        model: 'gpt-5-mini',
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
        max_tokens: 400,
        temperature: 0.7,
      });

      const assistantMessage = response.choices[0]?.message;
      const toolCalls = assistantMessage?.tool_calls || [];
      const actions: GuideAction[] = [];
      let displayedArtwork: Artwork | undefined;

      // Execute tool calls in parallel
      if (toolCalls.length > 0) {
        const toolPromises = toolCalls.map(async (toolCall) => {
          if (toolCall.type !== 'function') {
            return { action: { type: 'search' as const, data: {}, success: false }, toolResult: '{}' };
          }
          const args = JSON.parse(toolCall.function.arguments || '{}');
          return this.executeToolCall(toolCall.function.name, args, deps);
        });

        const toolResults = await Promise.all(toolPromises);

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

        const finalResponse = await this.client.chat.completions.create({
          model: 'gpt-5-mini',
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
          max_tokens: 150,
          temperature: 0.7,
        });

        const finalContent = finalResponse.choices[0]?.message?.content || 'Done.';

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
        };
      }

      // No tool calls - just a conversational response
      const content = assistantMessage?.content || 'I\'m here to help you discover art. What would you like to find?';

      session.messages.push({
        role: 'assistant',
        content,
        timestamp: Date.now(),
      });

      return {
        message: content,
        actions: [],
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
}

// Export singleton instance
const guideChatService = new GuideChatService();
export default guideChatService;
export { GuideChatService, ChatMessage, GuideResponse, GuideAction, GuideDependencies };
