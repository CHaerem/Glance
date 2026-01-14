/**
 * Art Guide Chat Routes
 * Conversational art discovery API endpoints.
 */

import { Router, Request, Response } from 'express';
import guideChatService from '../services/guide-chat';
import { performArtSearch } from '../services/museum-api';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';

const log = loggers.api.child({ component: 'guide-routes' });

/** Request body for chat endpoint */
interface ChatRequest {
  message: string;
  sessionId?: string;
}

/**
 * Create guide routes
 */
export function createGuideRoutes(): Router {
  const router = Router();

  /**
   * POST /api/guide/chat
   * Send a message to the art guide and get a response with optional search results
   */
  router.post('/chat', async (req: Request<object, object, ChatRequest>, res: Response) => {
    try {
      const { message, sessionId = 'default' } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (message.length > 1000) {
        res.status(400).json({ error: 'Message too long (max 1000 characters)' });
        return;
      }

      log.info('Guide chat request', { sessionId, messageLength: message.length });

      // Search function that wraps museum API
      const searchFn = async (query: string, limit: number) => {
        const result = await performArtSearch(query, limit);
        return result.results;
      };

      const response = await guideChatService.chat(sessionId, message, searchFn);

      res.json({
        message: response.message,
        searchQuery: response.searchQuery,
        results: response.results || [],
        resultCount: response.results?.length || 0,
      });
    } catch (error) {
      log.error('Guide chat error', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  /**
   * GET /api/guide/history
   * Get conversation history for a session
   */
  router.get('/history', (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const history = guideChatService.getHistory(sessionId);
    res.json({ messages: history });
  });

  /**
   * DELETE /api/guide/chat
   * Clear conversation history for a session
   */
  router.delete('/chat', (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    guideChatService.clearSession(sessionId);
    res.json({ success: true, message: 'Conversation cleared' });
  });

  return router;
}
