# GitHub OAuth App Setup Guide

This guide will help you create a GitHub OAuth App to enable seamless authentication in your Glance dashboard.

## 🎯 Why OAuth Instead of Personal Tokens?

- **🔐 Better Security** - No need to manually create and share tokens
- **✨ Seamless Login** - One-click "Sign in with GitHub" 
- **👤 User Profile** - Shows user info and repository access
- **🔄 Auto-Refresh** - Tokens refresh automatically
- **📱 Better UX** - More professional and user-friendly

## 📋 Step-by-Step Setup

### Step 1: Create GitHub OAuth App

1. **Go to GitHub Developer Settings**
   - Navigate to: https://github.com/settings/developers
   - Click "OAuth Apps" in the left sidebar
   - Click "New OAuth App"

2. **Fill in Application Details**
   ```
   Application name: Glance Display Manager
   Homepage URL: https://chaerem.github.io/Glance
   Application description: E-Ink Display Manager for battery-powered WiFi displays
   Authorization callback URL: https://chaerem.github.io/Glance/
   ```

3. **Register the Application**
   - Click "Register application"
   - You'll see your new OAuth app with a **Client ID**

### Step 2: Configure Client ID

1. **Copy the Client ID** (looks like: `Ov23lijBvpNZtKTJklm0`)

2. **Update the Code**
   - Open: `docs/js/github-oauth.js`
   - Find the `detectEnvironment()` function
   - Replace `'your_github_app_client_id'` with your actual Client ID:

   ```javascript
   if (hostname === 'chaerem.github.io') {
       // Production GitHub Pages
       this.clientId = 'Ov23lijBvpNZtKTJklm0'; // Your actual Client ID here
   }
   ```

3. **Commit and Push Changes**
   ```bash
   git add docs/js/github-oauth.js
   git commit -m "Add GitHub OAuth Client ID"
   git push
   ```

### Step 3: Test the Integration

1. **Wait for GitHub Pages to Deploy** (2-3 minutes)

2. **Open Your Dashboard**
   - Go to: https://chaerem.github.io/Glance/
   - Navigate to the "Devices" tab

3. **Test OAuth Login**
   - Click "Sign in with GitHub"
   - You should be redirected to GitHub for authorization
   - After approval, you'll be redirected back with authentication

## 🔧 For Local Development

If you want to test locally:

1. **Create a Development OAuth App**
   - Use the same steps above
   - Set Authorization callback URL to: `http://localhost:3000/` (or your local URL)

2. **Update the Code for Development**
   ```javascript
   } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
       // Local development
       this.clientId = 'your_dev_client_id'; // Your development Client ID
   }
   ```

## 🔒 Security Features

### Current Implementation
- **State Parameter** - CSRF protection with random state verification
- **Client-Side Only** - No client secret exposed (secure for public repos)
- **Token Validation** - Validates token with GitHub API before storing
- **Secure Storage** - Tokens stored in browser localStorage only

### Fallback Option
- **Manual Token Flow** - Users can still use personal access tokens
- **Guided Setup** - Modal with step-by-step token creation
- **Pre-filled Scopes** - Opens GitHub with correct permissions

## 🎨 User Experience Flow

### First-Time Users
1. **See login options** with recommended OAuth flow
2. **Click "Sign in with GitHub"** 
3. **Authorize on GitHub** (one-time permission)
4. **Return to dashboard** with full authentication
5. **Upload images** and manage display immediately

### Returning Users
- **Automatic login** - stored tokens work seamlessly
- **User profile** shown with avatar and info
- **Repository access** for seamless data sync

## 🔧 Configuration Options

You can customize the OAuth integration:

### Scopes
Current scopes: `repo user`
- `repo` - Access to repository for data storage
- `user` - Basic user information for profile display

### Callback Handling
The system automatically:
- **Detects OAuth returns** with code parameter
- **Exchanges code for token** (simplified flow)
- **Validates and stores token** securely
- **Cleans up URL parameters** for clean experience

## 🐛 Troubleshooting

### "OAuth App not found"
- Check Client ID is correct
- Verify callback URL matches exactly
- Ensure OAuth app is active

### "Redirect URI mismatch"
- Callback URL must match exactly (including trailing slash)
- Use exact domain: `https://chaerem.github.io/Glance/`

### "Access denied"
- User clicked "Cancel" on GitHub
- Check if app has proper permissions
- Try again with "Authorize" button

### Local development issues
- Create separate OAuth app for localhost
- Use different Client ID for development
- Check port numbers match

## 🎯 Next Steps

1. **Create OAuth App** following steps above
2. **Update Client ID** in the code
3. **Test authentication** on your live site
4. **Enjoy seamless GitHub integration** 🎉

Your users can now sign in with one click and get immediate access to all Glance features with their GitHub account!

## 📚 Additional Resources

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [OAuth 2.0 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
- [GitHub API Rate Limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)