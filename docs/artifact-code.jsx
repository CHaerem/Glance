/**
 * Glance Art Guide Artifact
 *
 * This is the React code for a Claude artifact that provides an AI-powered
 * art discovery interface for the Glance e-ink display system.
 *
 * To use:
 * 1. Go to Claude.ai
 * 2. Ask Claude to create a React artifact
 * 3. Paste this code into the artifact editor
 * 4. Publish the artifact and get the embed code
 *
 * The artifact connects to your Glance server via Tailscale Funnel
 * and allows you to search for art, browse playlists, and display
 * artwork on your e-ink frame through natural conversation.
 */

import React, { useState, useEffect, useRef } from 'react';

// Default server URL - user can change this
const DEFAULT_SERVER = 'https://serverpi.corgi-climb.ts.net';

export default function GlanceArtGuide() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [artworks, setArtworks] = useState([]);
  const [currentDisplay, setCurrentDisplay] = useState(null);
  const [playlists, setPlaylists] = useState([]);

  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Test connection to server
  const testConnection = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const response = await fetch(`${serverUrl}/health`);
      if (response.ok) {
        setIsConnected(true);
        // Load initial data
        await loadPlaylists();
        await loadCurrentDisplay();
        addMessage('system', 'Connected to Glance! Ask me to find art, show playlists, or display something on your frame.');
      } else {
        throw new Error('Server not responding');
      }
    } catch (err) {
      setError(`Could not connect to ${serverUrl}. Make sure Tailscale Funnel is running.`);
    }
    setIsConnecting(false);
  };

  // Load playlists
  const loadPlaylists = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/playlists`);
      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    }
  };

  // Load current display
  const loadCurrentDisplay = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/current.json`);
      const data = await response.json();
      setCurrentDisplay(data);
    } catch (err) {
      console.error('Failed to load current display:', err);
    }
  };

  // Search for art
  const searchArt = async (query) => {
    try {
      const response = await fetch(`${serverUrl}/api/art/search?q=${encodeURIComponent(query)}&limit=12`);
      const data = await response.json();
      return data.results || [];
    } catch (err) {
      console.error('Search failed:', err);
      return [];
    }
  };

  // Get playlist artworks
  const getPlaylistArtworks = async (playlistId) => {
    try {
      const response = await fetch(`${serverUrl}/api/playlists/${playlistId}`);
      const data = await response.json();
      return data.artworks || [];
    } catch (err) {
      console.error('Failed to load playlist:', err);
      return [];
    }
  };

  // Display artwork on e-ink
  const displayArtwork = async (artwork) => {
    try {
      addMessage('system', `Displaying "${artwork.title}" on your frame... This takes about 30 seconds.`);
      const response = await fetch(`${serverUrl}/api/art/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: artwork.imageUrl,
          title: artwork.title,
          artist: artwork.artist,
          source: artwork.source,
          rotation: 0
        })
      });

      if (response.ok) {
        addMessage('system', `"${artwork.title}" is now displaying on your e-ink frame!`);
        await loadCurrentDisplay();
      } else {
        throw new Error('Failed to display');
      }
    } catch (err) {
      addMessage('system', `Sorry, I couldn't display that artwork. ${err.message}`);
    }
  };

  // Add message to chat
  const addMessage = (role, content, artworks = null) => {
    setMessages(prev => [...prev, { role, content, artworks, timestamp: Date.now() }]);
  };

  // Handle user input
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    try {
      // Simple intent detection
      const lower = userMessage.toLowerCase();

      if (lower.includes('playlist') || lower.includes('browse') || lower.includes('collection')) {
        // Show playlists
        addMessage('assistant', 'Here are the available playlists:', null);
        setArtworks([]);
      } else if (lower.includes('display') || lower.includes('show') || lower.includes("what's on")) {
        // Show current display
        if (currentDisplay?.title) {
          addMessage('assistant', `Currently displaying: "${currentDisplay.title}"`);
        } else {
          addMessage('assistant', 'Nothing is currently displayed on the frame.');
        }
      } else if (lower.includes('random') || lower.includes('surprise')) {
        // Random artwork
        addMessage('assistant', 'Let me find something interesting for you...');
        const results = await searchArt('masterpiece painting');
        if (results.length > 0) {
          const random = results[Math.floor(Math.random() * results.length)];
          setArtworks([random]);
          addMessage('assistant', `How about "${random.title}" by ${random.artist}?`, [random]);
        }
      } else {
        // Search for art
        addMessage('assistant', `Searching for "${userMessage}"...`);
        const results = await searchArt(userMessage);
        setArtworks(results);

        if (results.length > 0) {
          addMessage('assistant', `Found ${results.length} artworks. Click any to display it on your frame.`, results);
        } else {
          addMessage('assistant', `No results found for "${userMessage}". Try different keywords like artist names, styles, or subjects.`);
        }
      }
    } catch (err) {
      addMessage('assistant', `Sorry, something went wrong: ${err.message}`);
    }

    setIsLoading(false);
  };

  // Quick action handlers
  const handleQuickAction = async (action) => {
    switch (action) {
      case 'random':
        setInput('surprise me with something random');
        break;
      case 'playlists':
        setInput('show me the playlists');
        break;
      case 'current':
        setInput("what's currently displaying?");
        break;
      case 'impressionist':
        setInput('impressionist landscapes');
        break;
    }
  };

  // Render connection screen
  if (!isConnected) {
    return (
      <div style={styles.container}>
        <div style={styles.connectCard}>
          <h2 style={styles.title}>Glance Art Guide</h2>
          <p style={styles.subtitle}>Connect to your Glance server to start exploring art</p>

          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="Server URL"
            style={styles.input}
          />

          <button
            onClick={testConnection}
            disabled={isConnecting}
            style={styles.connectButton}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  // Render main chat interface
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Glance Art Guide</h2>
        {currentDisplay?.title && (
          <p style={styles.headerSubtitle}>Displaying: {currentDisplay.title}</p>
        )}
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.message,
            ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
          }}>
            <p style={styles.messageText}>{msg.content}</p>

            {/* Artwork grid */}
            {msg.artworks && msg.artworks.length > 0 && (
              <div style={styles.artworkGrid}>
                {msg.artworks.slice(0, 6).map((art, j) => (
                  <div
                    key={j}
                    style={styles.artworkCard}
                    onClick={() => displayArtwork(art)}
                  >
                    <img
                      src={art.thumbnail || art.imageUrl}
                      alt={art.title}
                      style={styles.artworkImage}
                    />
                    <div style={styles.artworkInfo}>
                      <p style={styles.artworkTitle}>{art.title}</p>
                      <p style={styles.artworkArtist}>{art.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={styles.loading}>Thinking...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      <div style={styles.quickActions}>
        <button style={styles.chip} onClick={() => handleQuickAction('random')}>
          Surprise me
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('impressionist')}>
          Impressionist
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('current')}>
          What's displaying?
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search for art or ask me anything..."
          style={styles.chatInput}
          disabled={isLoading}
        />
        <button type="submit" style={styles.sendButton} disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

// Styles
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxHeight: '600px',
    backgroundColor: '#f8f9fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  connectCard: {
    margin: 'auto',
    padding: '32px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    textAlign: 'center',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: '600',
  },
  subtitle: {
    margin: '0 0 24px 0',
    color: '#666',
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '16px',
    boxSizing: 'border-box',
  },
  connectButton: {
    width: '100%',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  error: {
    marginTop: '16px',
    color: '#d32f2f',
    fontSize: '14px',
  },
  header: {
    padding: '16px',
    backgroundColor: 'white',
    borderBottom: '1px solid #eee',
  },
  headerTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
  },
  headerSubtitle: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    color: '#666',
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  message: {
    marginBottom: '16px',
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  userMessage: {
    marginLeft: 'auto',
    backgroundColor: '#1a1a1a',
    color: 'white',
  },
  assistantMessage: {
    marginRight: 'auto',
    backgroundColor: 'white',
    border: '1px solid #eee',
  },
  messageText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: '1.5',
  },
  artworkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '12px',
  },
  artworkCard: {
    cursor: 'pointer',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    transition: 'transform 0.2s',
  },
  artworkImage: {
    width: '100%',
    aspectRatio: '4/5',
    objectFit: 'cover',
  },
  artworkInfo: {
    padding: '6px 8px',
  },
  artworkTitle: {
    margin: 0,
    fontSize: '11px',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  artworkArtist: {
    margin: '2px 0 0 0',
    fontSize: '10px',
    color: '#666',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
    padding: '16px',
  },
  quickActions: {
    display: 'flex',
    gap: '8px',
    padding: '8px 16px',
    overflowX: 'auto',
  },
  chip: {
    padding: '8px 16px',
    fontSize: '13px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '20px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  inputForm: {
    display: 'flex',
    gap: '8px',
    padding: '16px',
    backgroundColor: 'white',
    borderTop: '1px solid #eee',
  },
  chatInput: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '24px',
    outline: 'none',
  },
  sendButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '24px',
    cursor: 'pointer',
  },
};
