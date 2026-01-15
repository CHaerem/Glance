# Unified Glance Experience Design

A comprehensive design for Explore, Collection, playlists, and AI guide integration.

## Design Principles

1. **Calm by default** - No animations unless intentional, muted colors, generous whitespace
2. **Progressive disclosure** - Simple surface, depth on demand
3. **Smart, not chatty** - Guide acts when useful, stays quiet otherwise
4. **Unified vocabulary** - Same concepts work across pages

---

## Core Concepts

### Playlists & Now Playing (Spotify-like)

```
Playlist = Saved collection of art (like a Spotify playlist)
├── User-created: "Evening Calm", "Bold Favorites"
├── AI-generated: "Your Taste", "Calm Nights"
└── Curated: "Museum Picks", "Impressionist Masters"

Now Playing = What's rotating on the frame (like Spotify's bottom bar)
├── Shows current artwork + playlist name
├── Controls: pause, skip, shuffle, interval
└── When you "play" a playlist, it becomes Now Playing
```

No separate "queue" concept. Play a playlist = it's now playing. Simple.

**"Play Next"** = The only queue-like action. Adds artwork to play after current piece.

### The Guide
An ambient AI assistant available everywhere:

```
Guide = Helps when asked, invisible when not
├── Explore: Suggests, searches, explains art
├── Collection: Helps organize, create playlists
└── Never: Takes over, requires interaction
```

---

## Page Designs

### Explore Page (Initial State)

Shows famous, recognizable art immediately. Feels like walking into a gallery.

```
┌─────────────────────────────────────────────────────────────┐
│  GLANCE                                                     │
├─────────────────────────────────────────────────────────────┤
│  create    explore    collection                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  explore art...                              🎲     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  playlists                                    see all│   │
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐               │   │
│  │  │░░░░│ │░░░░│ │░░░░│ │░░░░│ │░░░░│               │   │
│  │  └────┘ └────┘ └────┘ └────┘ └────┘               │   │
│  │  Museum   Monet  Evening  Bold    Your            │   │
│  │  Picks           Calm     Colors  Taste           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Today's Gallery                           refresh ↻│   │
│  │                                                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │   │
│  │  │ ★★★★★★ │ │ ░░░░░░ │ │ ▓▓▓▓▓▓ │ │ ░░▓▓░░ │       │   │
│  │  │ ★★★★★★ │ │ ░░░░░░ │ │ ▓▓▓▓▓▓ │ │ ░░▓▓░░ │       │   │
│  │  │ Starry │ │ Water  │ │ Girl   │ │ The    │       │   │
│  │  │ Night  │ │ Lilies │ │ Pearl  │ │ Scream │       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │   │
│  │                                                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │   │
│  │  │ ░░░░░░ │ │ ▓▓▓▓▓▓ │ │ ░░░░░░ │ │ ▓▓░░▓▓ │       │   │
│  │  │ ░░░░░░ │ │ ▓▓▓▓▓▓ │ │ ░░░░░░ │ │ ▓▓░░▓▓ │       │   │
│  │  │ Monet  │ │ Great  │ │ Klimt  │ │ Picasso│       │   │
│  │  │ Bridge │ │ Wave   │ │ Kiss   │ │ Blue   │       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  or try:  impressionists · portraits · landscapes   │   │
│  │           abstract · dutch masters · japanese       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components:**

1. **Search Input** (top, minimal)
   - Types directly for keyword search (fast, ~500ms)
   - 🎲 button for random/surprise
   - On focus: more suggestions appear

2. **Playlists** (horizontal scroll, prominent)
   - Quick access to curated collections
   - Mix of curated + user-created
   - "Your Taste" = auto-generated from collection
   - Tap = view playlist contents

3. **Today's Gallery** (main content, immediate)
   - 8 famous, recognizable masterpieces
   - Mix of iconic works everyone knows
   - "refresh ↻" reshuffles from curated famous pool
   - Changes daily to feel fresh
   - Tap any artwork to preview/display

4. **Quick Suggestions** (subtle chips, bottom)
   - Popular categories as tappable links
   - Fast path to common interests
   - Context-aware additions (evening: "calm night scenes")

---

### Today's Gallery (Fresh & Recognizable)

The initial Explore state shows famous art immediately. Here's how it stays fresh:

**Curated Pool (~100 masterpieces):**
- Starry Night, Water Lilies, Girl with a Pearl Earring, The Scream
- Great Wave, The Kiss, Persistence of Memory, Birth of Venus
- American Gothic, Nighthawks, A Sunday Afternoon...
- Classic, recognizable, gallery-worthy pieces

**Daily Rotation:**
- Each day, pick 8 random pieces from the pool
- Weighted toward variety (avoid same artist twice)
- "refresh ↻" button reshuffles without waiting for tomorrow

**Personalization (optional):**
- If user has a collection, occasionally include "based on your taste"
- Mix: 6 famous + 2 personalized recommendations

**Why this works:**
- Immediate visual engagement (not blank or loading)
- Recognizable = inviting, not intimidating
- Fresh each day = reason to come back
- Famous art = proven to be beautiful

---

### Search Active State

When user types or taps a suggestion:

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────┐   │
│  │  impressionist landscapes                     ✕     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  refine:  + water  + sunset  + dreamy  + ask guide  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │        │ │        │ │        │ │        │              │
│  │  ░░░░  │ │  ░░░░  │ │  ░░░░  │ │  ░░░░  │              │
│  │  ░░░░  │ │  ░░░░  │ │  ░░░░  │ │  ░░░░  │              │
│  │        │ │        │ │        │ │        │              │
│  └────────┘ └────────┘ └────────┘ └────────┘              │
│   Monet      Renoir     Sisley    Pissarro                │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ▶ play these  │  + save as playlist  │  ⋮ more     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Refinement Flow:**

1. **Quick refinements** - AI suggests related filters based on results
2. **"ask guide"** - Opens conversational refinement (only when needed)
3. **Results grid** - Tappable cards, long-press for quick actions
4. **Bottom actions** - Play all, save as playlist, or menu for more

---

### Guide Conversation (when activated)

Slides up from bottom, partial overlay:

```
┌─────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  (dimmed results visible above)                            │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┬─────┐  │
│  │                                                │  ⌄  │  │
│  │  Guide                                         │     │  │
│  ├────────────────────────────────────────────────┴─────┤  │
│  │                                                      │  │
│  │  You: I want something more dreamy and abstract      │  │
│  │                                                      │  │
│  │  Guide: I've refined the search to show              │  │
│  │  impressionist works with softer focus and           │  │
│  │  atmospheric qualities. The Monet water lilies       │  │
│  │  series might be perfect for this mood.              │  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  type to refine or ask questions...            │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ╭───────────╮ ╭───────────╮ ╭───────────╮          │  │
│  │  │ show me   │ │ more like │ │ save these│          │  │
│  │  │ the Monet │ │ this      │ │ as queue  │          │  │
│  │  ╰───────────╯ ╰───────────╯ ╰───────────╯          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Guide Interaction:**
- Slides up, doesn't replace the page
- Shows quick action chips for common follow-ups
- Results update live above as guide refines
- Swipe down to minimize, conversation persists
- Guide remembers context within session

---

### Collection Page

```
┌─────────────────────────────────────────────────────────────┐
│  GLANCE                                                     │
├─────────────────────────────────────────────────────────────┤
│  create    explore    collection                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  search collection...                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Playlists                              + new       │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ ░░░░  Evening Calm      ▶    12 items    ⋮   │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ ░░░░  Bold Favorites          8 items    ⋮   │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ ░░░░  Van Gogh Collection     5 items    ⋮   │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  All Saved (47)                      sort: newest ▾ │   │
│  │                                                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │   │
│  │  │        │ │        │ │        │ │        │       │   │
│  │  │  ░░░░  │ │  ░░░░  │ │  ░░░░  │ │  ░░░░  │       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ╭─────────────────────────────────────────────────────╮   │
│  │  🗨 ask guide to organize                           │   │
│  ╰─────────────────────────────────────────────────────╯   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ▶ │ ░░  Water Lilies · Evening Calm    ⟳ │ ⏱ 5m │ ⋮ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Collection Structure:**

1. **Playlists Section** (top)
   - User-created playlists
   - ▶ indicator shows which is currently playing
   - "+ new" opens naming dialog
   - ⋮ menu: edit, delete, play

2. **All Saved** - Flat grid of everything saved
   - Sort options: newest, oldest, artist, title
   - Long-press: "add to playlist" or "play next"
   - Multi-select mode for bulk actions

3. **Guide Prompt** - Subtle button
   - "ask guide to organize" → opens guide
   - Guide can: suggest playlists, auto-organize, explain collection

4. **Now Playing Bar** (bottom, Spotify-like)
   - Only visible when something is playing
   - Shows: current artwork thumbnail, title, playlist name
   - Quick controls: play/pause, shuffle, interval, menu
   - Tap to expand full now-playing view
   - Persistent across all pages

---

### Guide in Collection

```
┌─────────────────────────────────────────────────────────────┐
│  (collection visible above, dimmed)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┬─────┐  │
│  │  Guide                                         │  ⌄  │  │
│  ├────────────────────────────────────────────────┴─────┤  │
│  │                                                      │  │
│  │  You: organize my collection into playlists          │  │
│  │                                                      │  │
│  │  Guide: Looking at your 47 saved artworks, I        │  │
│  │  notice some natural groupings:                      │  │
│  │                                                      │  │
│  │  • Impressionist Landscapes (12 works)               │  │
│  │  • Evening & Night Scenes (8 works)                  │  │
│  │  • Bold Abstract (6 works)                           │  │
│  │  • Portraits (4 works)                               │  │
│  │                                                      │  │
│  │  Would you like me to create these playlists?        │  │
│  │                                                      │  │
│  │  ╭────────────╮ ╭────────────╮ ╭────────────╮        │  │
│  │  │ yes, all   │ │ let me     │ │ suggest    │        │  │
│  │  │ of them    │ │ pick       │ │ differently│        │  │
│  │  ╰────────────╯ ╰────────────╯ ╰────────────╯        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Guide Capabilities in Collection:**
- Analyze collection and suggest organization
- Create playlists from natural groupings
- Answer questions about saved art
- Suggest similar art to explore
- Help curate for specific moods/times

---

## Playlist System (Spotify-like)

### Simple Model

```typescript
interface Playlist {
  id: string;
  name: string;
  items: Artwork[];
  createdAt: Date;
  createdBy: 'user' | 'guide' | 'system';
  isSmartPlaylist: boolean;  // Auto-updates based on criteria
  smartCriteria?: string;    // e.g., "impressionist landscapes"
}

interface NowPlaying {
  playlist: Playlist | null;     // What playlist is playing (null = single artwork)
  currentArtwork: Artwork;       // Currently displayed
  currentIndex: number;          // Position in playlist
  mode: 'sequential' | 'shuffle';
  interval: number;              // minutes between changes
  isPaused: boolean;
  playNext: Artwork[];           // Items queued to play next (like Spotify)
}
```

**Key insight**: No separate "queue" entity. You play a playlist, and it becomes "now playing".

### Creating Playlists

**Manual:**
1. Collection page → "+ new playlist"
2. Name it → select artworks from grid
3. Or: long-press artwork → "add to playlist" → select/create

**Via Guide:**
1. Explore: "save these as a playlist called Evening Calm"
2. Collection: "create a playlist of my favorite night scenes"
3. Guide creates and confirms

**Smart Playlists:**
1. Guide: "create a smart playlist of calm landscapes"
2. Auto-updates when new matching art is added to collection
3. Shows ✨ indicator to distinguish from static playlists

### Now Playing View (expanded)

Tap the Now Playing bar to expand:

```
┌─────────────────────────────────────────────────────────────┐
│                                              ⌄ minimize     │
│                                                             │
│         ┌──────────────────────────────────────┐           │
│         │                                      │           │
│         │          ░░░░░░░░░░░░░░░░           │           │
│         │          ░░░░░░░░░░░░░░░░           │           │
│         │          ░░░░░░░░░░░░░░░░           │           │
│         │                                      │           │
│         └──────────────────────────────────────┘           │
│                                                             │
│                    Water Lilies                             │
│                    Claude Monet                             │
│                                                             │
│         ┌─────┬─────────────────────┬─────┐               │
│         │  ◀  │         ▶▶         │  ▶  │               │
│         └─────┴─────────────────────┴─────┘               │
│                                                             │
│         ⟳ shuffle on     ⏱ every 5 min                     │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Playing from: Evening Calm (3 of 12)                       │
│                                                             │
│  Up next:                                                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │░░░░│ │░░░░│ │░░░░│ │░░░░│ │░░░░│                       │
│  └────┘ └────┘ └────┘ └────┘ └────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Interaction Flows

### Flow 1: Casual Browse → Save

```
User opens Explore
  → Sees suggestions based on evening time
  → Taps "peaceful evening art"
  → Results appear
  → Long-press on Monet water lilies
  → "Add to collection" ✓
  → Continues browsing
```

### Flow 2: Guided Discovery

```
User opens Explore
  → Types "something for a dinner party"
  → Smart routing detects intent, uses AI
  → Guide responds with curated selection
  → User: "more abstract"
  → Guide refines
  → User: "perfect, play these tonight"
  → Queue set, frame starts rotating
```

### Flow 3: Organize Collection

```
User opens Collection
  → Has 50+ saved artworks, feels cluttered
  → Taps "ask guide to organize"
  → Guide analyzes and suggests playlists
  → User picks 3 suggested groupings
  → Playlists created automatically
  → User sets "Evening Calm" as queue
```

### Flow 4: Create Playlist Manually

```
User opens Collection
  → Taps "+ new playlist"
  → Names it "Bedroom Art"
  → Multi-selects artworks from grid
  → Confirms selection
  → Playlist appears in list
  → User taps ▶ to start playing
```

---

## Technical Implementation

### Smart Routing Logic

```typescript
function routeQuery(input: string): 'direct' | 'guide' {
  // Direct search patterns (fast path)
  const directPatterns = [
    /^(show|find|search)\s+\w+/i,      // "show monet"
    /^[\w\s]+paintings?$/i,             // "landscape paintings"
    /^[\w\s]+by\s+[\w\s]+$/i,          // "starry night by van gogh"
  ];

  // Guide patterns (needs AI)
  const guidePatterns = [
    /something\s+(for|like|similar)/i,  // "something for evening"
    /^(help|suggest|recommend)/i,       // "suggest something calm"
    /^(what|why|how|tell me)/i,         // questions
    /mood|feeling|vibe/i,               // mood-based
  ];

  if (guidePatterns.some(p => p.test(input))) return 'guide';
  if (directPatterns.some(p => p.test(input))) return 'direct';

  // Default: if short and noun-like, direct search
  return input.split(' ').length <= 3 ? 'direct' : 'guide';
}
```

### Guide Tools (Updated)

```typescript
const guideTools = [
  // Search & Display
  { name: 'search_art', params: { query, limit, filters? } },
  { name: 'display_artwork', params: { artworkId } },
  { name: 'get_current_display', params: {} },

  // Playback (Spotify-like)
  { name: 'play_playlist', params: { playlistId, shuffle?, interval? } },
  { name: 'play_next', params: { artworkId } },  // Add to "up next"
  { name: 'get_now_playing', params: {} },
  { name: 'pause_playback', params: {} },
  { name: 'skip_to_next', params: {} },

  // Collection & Playlists
  { name: 'add_to_collection', params: { artworkId } },
  { name: 'get_collection', params: { limit?, sort? } },
  { name: 'create_playlist', params: { name, artworkIds, isSmart?, criteria? } },
  { name: 'get_playlists', params: {} },
  { name: 'add_to_playlist', params: { playlistId, artworkId } },

  // Recommendations
  { name: 'get_recommendations', params: { mood?, basedOn? } },
  { name: 'analyze_collection', params: {} },
];
```

### Response Format

```typescript
interface GuideResponse {
  message: string;              // Conversational text
  actions: Action[];            // What was done
  results?: Artwork[];          // Search results if any
  suggestions?: string[];       // Quick follow-up chips
  nowPlayingUpdated?: boolean;  // If playback changed
}

type Action =
  | { type: 'search', query: string, count: number }
  | { type: 'display', artwork: Artwork }
  | { type: 'play_playlist', playlist: Playlist }
  | { type: 'added_to_collection', artwork: Artwork }
  | { type: 'playlist_created', playlist: Playlist };
```

---

## Visual Design Notes

### Color Palette (unchanged)
- Background: #1a1a1a
- Surface: #242424
- Text: #e5e5e5
- Muted: #888
- Accent: subtle warm tones for actions

### Animation Guidelines
- Slide-up for guide panel: 200ms ease-out
- Fade for results: 150ms
- Card hover: subtle shadow increase, 100ms
- No bouncing, no playful animations
- Everything feels deliberate and calm

### Typography
- Headings: system font, light weight
- Body: system font, regular
- All lowercase for labels (calm aesthetic)

---

## File Changes Required

| File | Changes |
|------|---------|
| `server/public/index.html` | New explore layout, guide panel, queue bar |
| `server/public/css/styles.css` | Guide panel, suggestions, queue styles |
| `server/public/js/main.js` | Smart routing, guide integration, queue management |
| `server/src/services/guide-chat.ts` | Add queue/playlist tools |
| `server/src/routes/guide.ts` | Update response format |
| `server/src/routes/playlists.ts` | Add create/update endpoints |
| `server/data/playlists.json` | Support user playlists alongside curated |

---

## Success Metrics

1. **Calm**: No jarring transitions, everything feels intentional
2. **Fast**: Direct searches < 500ms, guide < 3s first response
3. **Coherent**: Same concepts (queue, playlist) work everywhere
4. **Discoverable**: Features reveal themselves naturally
5. **Optional AI**: Everything works without guide, guide enhances
