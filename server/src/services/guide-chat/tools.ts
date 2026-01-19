/**
 * Guide Chat Tools
 * Tool definitions and execution handlers for the art guide
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { loggers } from '../logger';
import { getErrorMessage } from '../../utils/error';
import tasteGuideService from '../taste-guide';
import type { Artwork } from '../../types';
import type { GuideDependencies, ToolExecutionResult } from './types';

const log = loggers.api.child({ component: 'guide-tools' });

/** Tool definitions for OpenAI function calling */
export const guideTools: ChatCompletionTool[] = [
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

/**
 * Execute the search_art tool
 */
async function executeSearchArt(
  args: Record<string, unknown>,
  deps: GuideDependencies,
  setLastSearchResults: (results: Artwork[]) => void
): Promise<ToolExecutionResult> {
  const query = args.query as string;
  const limit = Math.min((args.limit as number) || 12, 24);

  try {
    const results = await deps.searchFn(query, limit);
    setLastSearchResults(results);
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

/**
 * Execute the display_artwork tool
 */
async function executeDisplayArtwork(
  args: Record<string, unknown>,
  deps: GuideDependencies,
  lastSearchResults: Artwork[]
): Promise<ToolExecutionResult> {
  const title = args.title as string;
  const artist = args.artist as string | undefined;

  // Find artwork from recent search results
  let artwork = lastSearchResults.find(
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

/**
 * Execute the add_to_collection tool
 */
async function executeAddToCollection(
  args: Record<string, unknown>,
  lastSearchResults: Artwork[]
): Promise<ToolExecutionResult> {
  const artworkId = args.artworkId as string;
  const artwork = lastSearchResults.find((a) => a.id === artworkId);

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

/**
 * Execute the get_recommendations tool
 */
async function executeGetRecommendations(
  args: Record<string, unknown>,
  deps: GuideDependencies,
  setLastSearchResults: (results: Artwork[]) => void
): Promise<ToolExecutionResult> {
  const limit = (args.limit as number) || 12;

  try {
    const recommendations = await tasteGuideService.getRecommendations(deps.searchFn, limit);
    setLastSearchResults(recommendations);
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

/**
 * Execute the get_current_display tool
 */
async function executeGetCurrentDisplay(
  deps: GuideDependencies
): Promise<ToolExecutionResult> {
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

/**
 * Execute a tool call by name
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: GuideDependencies,
  lastSearchResults: Artwork[],
  setLastSearchResults: (results: Artwork[]) => void
): Promise<ToolExecutionResult> {
  log.info('Executing tool', { toolName, args });

  switch (toolName) {
    case 'search_art':
      return executeSearchArt(args, deps, setLastSearchResults);

    case 'display_artwork':
      return executeDisplayArtwork(args, deps, lastSearchResults);

    case 'add_to_collection':
      return executeAddToCollection(args, lastSearchResults);

    case 'get_recommendations':
      return executeGetRecommendations(args, deps, setLastSearchResults);

    case 'get_current_display':
      return executeGetCurrentDisplay(deps);

    default:
      return {
        action: { type: 'search', data: { error: 'Unknown tool' }, success: false },
        toolResult: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
      };
  }
}
