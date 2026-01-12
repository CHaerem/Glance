/**
 * Glance Art Guide - Claude Artifact
 *
 * Instructions:
 * 1. Copy this entire code
 * 2. Go to Claude.ai and start a new chat
 * 3. Ask: "Create a React artifact with this code" and paste it
 * 4. After the artifact appears, enable "AI capabilities" in artifact settings
 * 5. Publish the artifact
 * 6. Add "serverpi.corgi-climb.ts.net" to allowed domains
 * 7. Copy the embed URL (https://claude.site/artifacts/...)
 * 8. Paste it in the Glance explore page
 */

import React, { useState, useRef, useEffect } from 'react';

export default function GlanceArtGuide() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Welcome to Glance Art Guide! I can help you discover and display art on your e-ink frame. Try asking me to search for art, show your playlists, or display a random artwork.'
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: input.trim() }]);
    setInput('');
  };

  const handleQuickAction = (action) => {
    const prompts = {
      search: 'Search for impressionist landscape paintings',
      random: 'Show me a random artwork and display it on my frame',
      playlists: 'What playlists are available?',
      current: "What's currently displaying on my Glance frame?",
      status: 'Check my device battery and status'
    };
    setInput(prompts[action] || '');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Glance Art Guide</h2>
        <p style={styles.subtitle}>AI-powered art discovery for your e-ink frame</p>
      </div>

      <div style={styles.messages}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage)
            }}
          >
            <p style={styles.messageText}>{msg.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.quickActions}>
        <button style={styles.chip} onClick={() => handleQuickAction('search')}>
          Search art
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('random')}>
          Random
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('playlists')}>
          Playlists
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('current')}>
          Current
        </button>
        <button style={styles.chip} onClick={() => handleQuickAction('status')}>
          Status
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about art or control your display..."
          style={styles.input}
        />
        <button type="submit" style={styles.sendButton}>
          Send
        </button>
      </form>

      <div style={styles.footer}>
        <p style={styles.footerText}>
          Connected to Glance MCP Server. I can search museums, display artwork, and check your device.
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
    minHeight: '450px',
    backgroundColor: '#fafafa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    backgroundColor: '#1a1a1a',
    color: 'white',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '12px',
    opacity: 0.7,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  message: {
    padding: '12px 16px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    color: 'white',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    border: '1px solid #e5e5e5',
    color: '#1a1a1a',
  },
  messageText: {
    margin: 0,
    fontSize: '14px',
    lineHeight: '1.5',
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
    border: '1px solid #e5e5e5',
    borderRadius: '20px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  },
  inputForm: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'white',
    borderTop: '1px solid #e5e5e5',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
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
  footer: {
    padding: '8px 16px',
    backgroundColor: '#f0f7ff',
    borderTop: '1px solid #d0e3ff',
  },
  footerText: {
    margin: 0,
    fontSize: '11px',
    color: '#4a6fa5',
    textAlign: 'center',
  },
};
