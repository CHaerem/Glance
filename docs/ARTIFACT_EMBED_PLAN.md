# Claude Artifact Embedding Plan for Glance Explore Page

## Research Summary

### How Claude Artifact Embedding Works

Based on research from the [Claude Help Center](https://support.claude.com/en/articles/9547008-discovering-publishing-customizing-and-sharing-artifacts) and [reverse engineering analysis](https://www.reidbarber.com/blog/reverse-engineering-claude-artifacts):

1. **Publishing**: After creating an artifact, click "Publish" to make it public
2. **Embed Code**: Click "Get embed code" to get an `<iframe>` snippet
3. **Domain Whitelist**: You must specify allowed domains (e.g., `serverpi.corgi-climb.ts.net`)
4. **Iframe Structure**: Artifacts render in an isolated iframe from `https://www.claudeusercontent.com`

### Technical Constraints

| Constraint | Details |
|------------|---------|
| **Sandbox** | Artifacts run in a sandboxed iframe that blocks external API calls |
| **External Resources** | Only `https://cdnjs.cloudflare.com` is whitelisted for libraries |
| **postMessage** | Used internally by Anthropic for parent-to-artifact communication |
| **MCP Tools** | Available to Claude AI when responding, not to artifact code directly |

### Key Insight: AI-Powered Artifacts

[AI-powered artifacts](https://www.claude.com/blog/build-artifacts) are the solution:
- Users interact with Claude directly within the embedded artifact
- Claude uses MCP tools to search/display art
- Each user authenticates MCP servers with their own Claude account
- Usage counts against the user's limits, not the creator's

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Glance Explore Page (serverpi.corgi-climb.ts.net)              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Embedded Claude Artifact (iframe)                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  User: "Show me impressionist landscapes"           │  │  │
│  │  │                                                     │  │  │
│  │  │  Claude: (uses search_artworks MCP tool)            │  │  │
│  │  │  → Returns artwork cards with "Display" buttons     │  │  │
│  │  │                                                     │  │  │
│  │  │  User clicks "Display this" →                       │  │  │
│  │  │  Claude: (uses display_artwork MCP tool)            │  │  │
│  │  │  → Artwork sent to e-ink frame                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Playlist Stacks (existing, unchanged)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ MCP Protocol (via user's Claude.ai connection)
         ▼
┌─────────────────────────────────────────┐
│  Glance MCP Server                      │
│  https://serverpi.corgi-climb.ts.net/   │
│  └── /api/mcp                           │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Create the Claude Artifact

**What**: Create an AI-powered artifact in Claude.ai that serves as the art discovery chat interface.

**Steps**:
1. Open Claude.ai and start a new conversation
2. Ask Claude to create a React artifact with a chat interface for art discovery
3. The artifact should have:
   - Chat message history display
   - Text input for user queries
   - Quick action chips (random, playlists, current display)
   - Artwork cards with "Display" button
   - Device status indicator

**Key Code Elements**:
```jsx
// The artifact is an AI-powered React component
// Claude uses MCP tools to respond to user messages
// Example structure:
export default function GlanceArtGuide() {
  // Chat state
  // Artwork display
  // Quick actions
  // Claude handles search/display via MCP
}
```

### Phase 2: Enable AI Capabilities

**What**: Enable the "AI capabilities" feature on the artifact.

**Steps**:
1. After creating the artifact, click the artifact settings/options
2. Enable "AI capabilities" (beta feature)
3. This allows Claude to respond to user interactions within the artifact
4. Claude will use your connected MCP server to fulfill requests

### Phase 3: Publish and Get Embed Code

**What**: Publish the artifact and configure embedding permissions.

**Steps**:
1. Click "Publish" on the artifact
2. After publishing, click "Get embed code"
3. In the **Allowed domains** field, add:
   - `serverpi.corgi-climb.ts.net`
   - `localhost:3000` (for local testing)
4. Copy the generated `<iframe>` snippet

**Expected embed code format**:
```html
<iframe
  src="https://claude.site/artifacts/{artifact-id}"
  width="100%"
  height="600"
  sandbox="allow-scripts allow-same-origin"
></iframe>
```

### Phase 4: Update Glance Explore Page

**What**: Replace the search bar area with the embedded artifact.

**Files to modify**:
- `server/public/index.html` - Add iframe container
- `server/public/css/styles.css` - Styles for embed area
- `server/public/js/main.js` - Optional: postMessage listener for future enhancements

**HTML Changes**:
```html
<!-- Replace search bar with artifact embed -->
<div class="ai-guide-container">
  <iframe
    id="aiGuideFrame"
    src="https://claude.site/artifacts/{YOUR-ARTIFACT-ID}"
    class="ai-guide-iframe"
    allow="clipboard-read; clipboard-write"
  ></iframe>
</div>
```

**CSS Changes**:
```css
.ai-guide-container {
  width: 100%;
  margin-bottom: 20px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e5e5;
}

.ai-guide-iframe {
  width: 100%;
  height: 400px;
  border: none;
}
```

### Phase 5: User Setup (One-Time)

**What**: Each user must connect their MCP server in Claude.ai settings.

**Steps for users**:
1. Go to Claude.ai Settings → MCP Servers
2. Add the Glance MCP server: `https://serverpi.corgi-climb.ts.net/api/mcp`
3. Authenticate/allow the connection
4. Now when using the embedded artifact, Claude can use Glance tools

## Alternative Approach: No Parent Communication Needed

The beauty of AI-powered artifacts with MCP is that **no postMessage communication is needed** between the artifact iframe and the parent page:

- User interacts with Claude in the artifact
- Claude calls `search_artworks` → shows results in artifact
- Claude calls `display_artwork` → sends to e-ink frame via MCP
- Everything happens within the artifact + MCP server

The parent page (Glance explore) simply embeds the artifact and provides the surrounding UI (playlist stacks, etc.).

## Considerations

### User Requirements
- Users need a Claude Pro/Max account (free tier has limits)
- Users must connect the MCP server once in their Claude.ai settings
- Each user's usage counts against their own Claude limits

### Fallback for Non-Claude Users
Keep the existing keyword search as a fallback:
- Show the artifact for users who want AI-powered discovery
- Keep the playlist stacks for browsing
- Keep the search input for keyword searches

### Security
- The artifact can only use MCP tools the user has authorized
- Sensitive endpoints (upload, generate, delete) require API key
- Rate limiting protects against abuse

## File Changes Summary

| File | Change |
|------|--------|
| `server/public/index.html` | Replace search bar with iframe container |
| `server/public/css/styles.css` | Add iframe styling |
| `server/public/js/main.js` | Optional postMessage listener |
| `docs/artifact-code.jsx` | Reference artifact code (user creates in Claude.ai) |

## Next Steps

1. **Create artifact in Claude.ai** with chat UI for art discovery
2. **Enable AI capabilities** on the artifact
3. **Publish** and configure allowed domains
4. **Get embed code** and add to explore page
5. **Test** end-to-end flow with MCP tools

## Sources

- [Claude Help Center - Publishing Artifacts](https://support.claude.com/en/articles/9547008-discovering-publishing-customizing-and-sharing-artifacts)
- [Claude Help Center - What are Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Claude Blog - Build Artifacts](https://www.claude.com/blog/build-artifacts)
- [Reverse Engineering Claude Artifacts](https://www.reidbarber.com/blog/reverse-engineering-claude-artifacts)
