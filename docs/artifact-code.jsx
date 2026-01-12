/**
 * Glance Art Guide Artifact (MCP Version)
 *
 * This artifact uses MCP tools to interact with the Glance e-ink display.
 * It requires the Glance Art Guide MCP server to be connected in Claude.ai settings.
 *
 * To use:
 * 1. Connect MCP server in Claude.ai: https://serverpi.corgi-climb.ts.net/api/mcp
 * 2. Create a new artifact with this code
 * 3. Publish and embed in your Glance explore page
 */

import React, { useState, useEffect, useRef } from 'react';

export default function GlanceArtGuide() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Welcome to Glance Art Guide! Search for art, browse playlists, or ask me to display something on your e-ink frame.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDisplay, setCurrentDisplay] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load current display on mount
  useEffect(() => {
    loadCurrentDisplay();
  }, []);

  const addMessage = (role, content, artworks = null) => {
    setMessages(prev => [...prev, { role, content, artworks, timestamp: Date.now() }]);
  };

  // MCP tool calls (these will be handled by Claude when the artifact runs)
  const loadCurrentDisplay = async () => {
    try {
      // This would use the get_current_display MCP tool
      // For now, show a placeholder - Claude will fill this in
      addMessage('system', 'Use the "What\'s displaying?" button to check your current artwork.');
    } catch (err) {
      console.error('Failed to load current display:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    // The artifact will send this to Claude, which will use MCP tools
    addMessage('assistant', `I'll help you with: "${userMessage}". Use the MCP tools in Claude to search for art or control your display.`);

    setIsLoading(false);
  };

  const handleQuickAction = (action) => {
    let message = '';
    switch (action) {
      case 'random':
        message = 'Get me a random artwork and display it on my frame';
        break;
      case 'search':
        message = 'Search for impressionist landscapes';
        break;
      case 'current':
        message = "What's currently displaying on my Glance frame?";
        break;
      case 'playlists':
        message = 'Show me the available playlists';
        break;
      case 'status':
        message = 'Check the device battery and connection status';
        break;
    }
    setInput(message);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>Glance Art Guide</h2>
        <p style={styles.headerSubtitle}>AI-powered art discovery for your e-ink frame</p>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.message,
            ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
          }}>
            <p style={styles.messageText}>{msg.content}</p>
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
          Random artwork
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('search')}>
          Impressionist
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('current')}>
          What's displaying?
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('playlists')}>
          Playlists
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('status')}>
          Device status
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about art or control your display..."
          style={styles.chatInput}
          disabled={isLoading}
        />
        <button type="submit" style={styles.sendButton} disabled={isLoading}>
          Send
        </button>
      </form>

      {/* MCP Info */}
      <div style={styles.mcpInfo}>
        <p style={styles.mcpText}>
          This artifact uses MCP tools. Ask Claude to search for art, display artworks, or check your device status.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '500px',
    backgroundColor: '#f8f9fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    backgroundColor: '#1a1a1a',
    color: 'white',
  },
  headerTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
  },
  headerSubtitle: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    opacity: 0.8,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    minHeight: '200px',
  },
  message: {
    marginBottom: '12px',
    padding: '10px 14px',
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
    border: '1px solid #e5e5e5',
  },
  messageText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: '1.5',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
    padding: '12px',
  },
  quickActions: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    overflowX: 'auto',
    borderTop: '1px solid #e5e5e5',
    backgroundColor: 'white',
  },
  chip: {
    padding: '8px 14px',
    fontSize: '13px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '20px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  inputForm: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'white',
    borderTop: '1px solid #e5e5e5',
  },
  chatInput: {
    flex: 1,
    padding: '10px 14px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '20px',
    outline: 'none',
  },
  sendButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    backgroundColor: '#1a1a1a',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
  },
  mcpInfo: {
    padding: '8px 16px',
    backgroundColor: '#f0f7ff',
    borderTop: '1px solid #d0e3ff',
  },
  mcpText: {
    margin: 0,
    fontSize: '11px',
    color: '#4a6fa5',
    textAlign: 'center',
  },
};
