# AI Art Guide Artifact Specification

This document describes the Claude artifact that powers the AI Art Guide feature in Glance. Use this as context when asking Claude to create or update the artifact.

## Overview

The AI Art Guide is an embedded Claude chat interface that helps users discover and display art on their Glance e-ink frame. It uses Claude's AI capabilities (via the user's Max subscription) to understand natural language requests and executes actions via the Glance MCP server.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Glance Explore Page                                        │
│  ┌───────────────────┐  ┌────────────────────────────────┐  │
│  │ AI Art Guide      │  │ Art Cards Grid                 │  │
│  │ (Claude Artifact) │  │ (displays search results)      │  │
│  │                   │  │                                │  │
│  │ User: "Show me    │  │  [img] [img] [img] [img]       │  │
│  │ Monet paintings"  │  │  [img] [img] [img] [img]       │  │
│  │                   │  │                                │  │
│  │ Claude uses MCP ──┼──┼──► Results appear here         │  │
│  └───────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         │ MCP (Model Context Protocol)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Glance Server (via Tailscale Funnel)                       │
│  https://serverpi.corgi-climb.ts.net/api/mcp                │
│                                                             │
│  MCP Tools:                                                 │
│  - search_artworks: Search museum collections               │
│  - display_artwork: Send artwork to e-ink frame             │
│  - get_current_display: What's showing now                  │
│  - list_playlists: Available art playlists                  │
│  - get_playlist: Get artworks from a playlist               │
│  - get_device_status: Battery, WiFi, firmware info          │
│  - random_artwork: Surprise me with random art              │
└─────────────────────────────────────────────────────────────┘
```

## Key Concept: Server-Side Result Coordination

When Claude calls `search_artworks`, `get_playlist`, or `random_artwork` via MCP, the results are:
1. Returned to Claude for the conversational response
2. Stored server-side in a cache

The Glance page polls `/api/ai-search/latest` to fetch these results and displays them in the existing art grid. This means:

- The artifact does NOT need to render artwork images
- The artifact does NOT need to post messages to the parent window
- Claude just responds conversationally ("I found 8 beautiful Monet paintings!")
- The Glance page automatically shows the visual results

## User Flow

### Typical Discovery Flow
1. User opens Explore page and clicks the ✨ AI Guide button
2. AI Guide panel appears with chat interface
3. User asks Claude: "Show me impressionist landscapes"
4. Claude uses `search_artworks` → results stored server-side
5. Glance page polls and displays results in the art grid
6. Claude responds: "Found 15 beautiful landscapes! Click any one to preview."
7. User clicks an artwork in the grid → modal opens with preview
8. User clicks "apply to display" → artwork sent to e-ink frame

### Direct Display Flow
1. User asks: "Display Water Lilies by Monet"
2. Claude searches for the specific artwork, gets the imageUrl
3. Claude uses `display_artwork` with the URL, title, artist
4. Claude confirms: "Displaying Water Lilies on your frame now!"
5. E-ink frame refreshes in ~30 seconds

### Why the Split?
The artifact is just a chat interface - it doesn't render images. The Glance page already has a beautiful art grid with previews, modals, and display controls. Rather than duplicate this UI in the artifact, we let each part do what it does best:
- **Artifact**: Natural language understanding, tool execution
- **Glance page**: Visual browsing, artwork preview, display controls

## Design Requirements

### Visual Style

Match Glance's minimal aesthetic:
- **Background**: White (#ffffff) or very light gray (#fafafa)
- **Text**: Dark (#1a1a1a)
- **Font**: System fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
- **Borders**: Subtle gray (#e5e5e5), 1px
- **Border radius**: 16px for message bubbles, 20px for input
- **Shadows**: None or very subtle
- **Typography**: Clean, minimal, no decorations

### Layout

Simple chat interface:
1. **Messages area** (scrollable)
   - User messages: right-aligned, white background with subtle border
   - Assistant messages: left-aligned, light gray background (#f5f5f5)
   - Keep messages concise

2. **Input area** (fixed at bottom)
   - Simple text input with rounded corners
   - Send button (dark background, white text)
   - Optional: Quick action chips above input

### Size

The artifact is embedded in a panel that's approximately:
- Width: 100% of panel (max ~400px on desktop)
- Height: ~450px

## Personality & Behavior

### Claude's Role

You are a friendly, knowledgeable art curator assistant. Your personality:
- Warm and enthusiastic about art, but concise
- Conversational, not formal
- Brief responses (1-3 sentences typically)

### Response Guidelines

**When searching:**
- Use `search_artworks` with the user's query
- Respond naturally: "I found 12 stunning Van Gogh paintings! Click any one in the grid to preview it."
- Don't list individual artworks - they appear in the Glance grid automatically
- Guide users to interact with the grid to preview and display artwork
- Suggest related searches if helpful

**When displaying:**
- Only use `display_artwork` when user asks for a specific artwork by name
- You need the artwork's imageUrl, title, and artist to display it
- If user asks to "display the third one" or similar, explain they should click it in the grid instead
- Confirm: "Displaying 'Starry Night' on your frame now. It'll refresh in about 30 seconds."

**When asked about status:**
- Use `get_device_status` for battery, WiFi, firmware info
- Present clearly: "Your frame is at 78% battery, connected with strong WiFi signal."

**When browsing playlists:**
- Use `list_playlists` to show available collections
- Use `get_playlist` to explore a specific playlist
- Results appear in the grid automatically
- Guide users to click artworks in the grid to preview/display

## MCP Tools Reference

### search_artworks
Search museum collections for artworks.

**Parameters:**
- `query` (string, required): Search terms like "Monet water lilies", "impressionist landscape", "Dutch Golden Age"
- `limit` (number, optional): Max results (default: 12, max: 20)

**Example queries:**
- "peaceful blue paintings"
- "Van Gogh"
- "Japanese woodblock prints"
- "bold abstract art"
- "Renaissance portraits"

### display_artwork
Display an artwork on the e-ink frame.

**Parameters:**
- `imageUrl` (string, required): URL of the artwork image
- `title` (string, optional): Artwork title
- `artist` (string, optional): Artist name

**Notes:**
- The server processes the image (resize, dither) for e-ink
- Display refresh takes ~30 seconds
- User must have selected an artwork from search results first

### get_current_display
Get info about what's currently showing on the frame.

**Parameters:** None

**Returns:** Title, timestamp of last update

### list_playlists
List all available art playlists.

**Parameters:** None

**Returns:** List of playlists with names, types (curated/dynamic), descriptions

### get_playlist
Get artworks from a specific playlist.

**Parameters:**
- `playlistId` (string, required): e.g., "impressionist-masters", "serene-nature"

### get_device_status
Get e-ink display device status.

**Parameters:** None

**Returns:** Battery %, voltage, charging status, WiFi signal, firmware version, last seen

### random_artwork
Get a random artwork for serendipitous discovery.

**Parameters:** None

**Notes:** Good for "surprise me" or "feeling lucky" requests

## Example Conversations

### Art Discovery
```
User: "Show me some peaceful landscape paintings"
Assistant: "I found 15 serene landscapes for you! There's a beautiful mix of Constable,
Corot, and some lovely Hudson River School works. Take a look at the results - click
any artwork in the grid to preview and display it."
[Results appear in Glance grid - user clicks to preview/display]
```

### Displaying a Specific Artwork
```
User: "Display Starry Night by Van Gogh"
Assistant: "Displaying 'The Starry Night' by Vincent van Gogh on your frame now!
It'll refresh in about 30 seconds."
[Claude uses display_artwork with the artwork info]
```

**Note:** Since the visual grid is in the Glance page (not the artifact), Claude can't
reference artworks by position ("the third one"). Users either:
- Click artworks directly in the Glance grid to preview and display
- Ask Claude to display a specific artwork by name

### Playlist Exploration
```
User: "What playlists do you have?"
Assistant: "You have 12 playlists available:
- Impressionist Masters (curated)
- Serene Nature (dynamic)
- Bold Abstract (dynamic)
- Dutch Golden Age (curated)
...and more. Want me to show you one?"

User: "Show me the nature one"
Assistant: "Here are the artworks from 'Serene Nature' - 20 peaceful scenes from
various collections. The results are showing in your grid now."
```

### Device Status
```
User: "How's my frame doing?"
Assistant: "Your Glance frame is healthy! Battery at 82%, strong WiFi signal (-45 dBm),
running firmware v1.2.3. Last check-in was 5 minutes ago."
```

### Quick Actions
```
User: "Surprise me with something"
Assistant: "Here's a delightful surprise - 'Girl with a Pearl Earring' by Vermeer!
Want me to display it on your frame?"
```

## Technical Notes

### MCP Connection

The artifact needs access to the Glance MCP server. Users must:
1. Add the MCP connector in Claude.ai Settings → Connectors
2. URL: `https://serverpi.corgi-climb.ts.net/api/mcp`
3. Enable the connector for the artifact

### Embedding

The artifact is embedded in Glance via iframe:
```html
<iframe
    src="https://claude.site/artifacts/[artifact-id]/embed"
    allow="clipboard-write"
    allowfullscreen
></iframe>
```

Allowed domains for embedding:
- `serverpi.corgi-climb.ts.net`
- `serverpi.local` (for local development)

### No API Keys Needed

The artifact uses:
- Claude's AI via the user's Max subscription (no API costs)
- MCP tools for actions (no additional auth needed)

## Creating the Artifact

When asking Claude to create this artifact, you can say:

"Create an AI-powered chat artifact for Glance Art Guide. It should be a minimal chat interface that helps users discover art. The artifact will use MCP tools to search museums and control an e-ink display. Keep the UI extremely simple - just chat bubbles and an input. Don't render artwork images - results appear elsewhere. Match this aesthetic: white background, dark text, system fonts, subtle borders."

Then provide this document as context for the detailed requirements.
