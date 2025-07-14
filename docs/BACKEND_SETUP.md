# Backend Setup Guide

This guide explains how to set up persistent data storage for your Glance e-ink display system.

## Current State

The dashboard currently uses localStorage for data persistence, which works for single-device testing but doesn't persist across browsers or allow real device communication.

## Backend Options

### 1. 🔥 Firebase (Recommended for Beginners)

**Pros:** Easy setup, real-time sync, generous free tier  
**Setup Time:** 15 minutes

```javascript
// Add to docs/js/firebase-config.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // Your Firebase config
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
```

Update `persistence.js` to use Firebase:
```javascript
// Replace localStorage calls with Firestore operations
await setDoc(doc(db, 'glance', 'current'), apiData);
const snapshot = await getDoc(doc(db, 'glance', 'current'));
```

### 2. 🐙 GitHub API + GitHub Actions

**Pros:** Free, version controlled, works with GitHub Pages  
**Setup Time:** 30 minutes

Create a GitHub Action that updates JSON files in your repository when triggered by the web dashboard.

```yaml
# .github/workflows/update-data.yml
name: Update Display Data
on:
  repository_dispatch:
    types: [update-display]
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Update API files
        run: |
          echo '${{ github.event.client_payload.data }}' > docs/api/current.json
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add docs/api/current.json
          git commit -m "Update display data" || exit 0
          git push
```

### 3. ☁️ Netlify Functions

**Pros:** Serverless, integrates with Netlify hosting  
**Setup Time:** 45 minutes

```javascript
// netlify/functions/api.js
exports.handler = async (event, context) => {
  if (event.httpMethod === 'POST') {
    // Save image data
    const data = JSON.parse(event.body);
    // Store in external service (Airtable, etc.)
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  }
  
  if (event.httpMethod === 'GET') {
    // Return current image data
    return {
      statusCode: 200,
      body: JSON.stringify(getCurrentImageData())
    };
  }
};
```

### 4. 🗄️ Supabase

**Pros:** PostgreSQL database, real-time subscriptions, auth  
**Setup Time:** 20 minutes

```sql
-- Create tables
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE device_status (
  device_id TEXT PRIMARY KEY,
  battery_level INTEGER,
  last_seen TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'online'
);
```

### 5. 🔧 Simple REST API (Node.js/Express)

**Pros:** Full control, can host anywhere  
**Setup Time:** 60 minutes

```javascript
// server.js
const express = require('express');
const fs = require('fs');
const app = express();

app.post('/api/current', (req, res) => {
  fs.writeFileSync('data/current.json', JSON.stringify(req.body));
  res.json({ success: true });
});

app.get('/api/current.json', (req, res) => {
  const data = fs.readFileSync('data/current.json');
  res.json(JSON.parse(data));
});

app.listen(3000);
```

## Implementation Steps

### Phase 1: Choose Your Backend
1. **Pick a backend** from the options above
2. **Set up the service** following their documentation
3. **Get API credentials** (keys, URLs, etc.)

### Phase 2: Update the Dashboard
1. **Configure persistence.js** with your backend credentials:
   ```javascript
   await glanceManager.persistence.configure({
     backendUrl: 'https://your-backend.com/api',
     apiKey: 'your-api-key'
   });
   ```

2. **Test the connection** in the dashboard
3. **Upload an image** and verify it persists

### Phase 3: Update ESP32 Code
1. **Change the API URL** in `glance_client.cpp`:
   ```cpp
   const char* API_BASE_URL = "https://your-backend.com/api/";
   ```

2. **Flash the updated firmware** to your ESP32
3. **Test the full cycle**: upload image → ESP32 fetches → display updates

## Quick Start with Firebase

1. **Create Firebase project** at https://console.firebase.google.com
2. **Enable Firestore Database**
3. **Get config object** from Project Settings
4. **Add to your dashboard**:
   ```html
   <script type="module">
     import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js';
     import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js';
     
     const firebaseConfig = { /* your config */ };
     const app = initializeApp(firebaseConfig);
     window.db = getFirestore(app);
   </script>
   ```

5. **Update persistence.js** to use Firestore instead of localStorage

## Security Considerations

- **API Keys**: Never expose secret keys in client-side code
- **CORS**: Configure your backend to allow requests from your GitHub Pages domain
- **Rate Limiting**: Implement limits to prevent abuse
- **Device Authentication**: Consider device-specific tokens for ESP32 requests

## Costs

- **Firebase**: Free tier covers most personal use
- **GitHub Actions**: 2000 minutes/month free
- **Netlify**: 125k function calls/month free
- **Supabase**: 500MB database free
- **Self-hosted**: Only hosting costs

Choose based on your technical comfort level and requirements!