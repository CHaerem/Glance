// GitHub OAuth Integration
// Handles seamless GitHub login and authentication

class GitHubOAuth {
    constructor() {
        // GitHub OAuth App Configuration
        // NOTE: You'll need to create a GitHub OAuth App and update these values
        this.clientId = 'your_github_app_client_id'; // Will be set dynamically
        this.redirectUri = window.location.origin + window.location.pathname;
        this.scope = 'repo user';
        this.state = this.generateState();
        
        // OAuth endpoints
        this.authUrl = 'https://github.com/login/oauth/authorize';
        this.tokenUrl = 'https://github.com/login/oauth/access_token';
        
        // Storage keys
        this.tokenKey = 'github-oauth-token';
        this.userKey = 'github-user-info';
        this.stateKey = 'github-oauth-state';
        
        this.init();
    }

    init() {
        // Check if we're returning from OAuth callback
        this.handleOAuthCallback();
        
        // Load stored authentication
        this.loadStoredAuth();
        
        // Set up GitHub App client ID based on environment
        this.detectEnvironment();
    }

    detectEnvironment() {
        // Detect if we're on GitHub Pages or local development
        const hostname = window.location.hostname;
        
        if (hostname === 'chaerem.github.io') {
            // Production GitHub Pages
            this.clientId = 'Ov23lieMJ8jDPOSFeF2k'; // Your production OAuth app
        } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // Local development
            this.clientId = 'your_dev_client_id'; // Your development OAuth app
        } else {
            // Custom domain or other
            this.clientId = 'your_custom_client_id';
        }
    }

    generateState() {
        // Generate random state for CSRF protection
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // OAuth Login Flow
    async login() {
        try {
            // Store state for verification
            localStorage.setItem(this.stateKey, this.state);
            
            // Build authorization URL
            const params = new URLSearchParams({
                client_id: this.clientId,
                redirect_uri: this.redirectUri,
                scope: this.scope,
                state: this.state,
                allow_signup: 'true'
            });

            const authUrl = `${this.authUrl}?${params.toString()}`;
            
            // Redirect to GitHub OAuth
            window.location.href = authUrl;
            
        } catch (error) {
            console.error('OAuth login failed:', error);
            throw new Error('Failed to initiate GitHub login');
        }
    }

    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        // Check for OAuth errors
        if (error) {
            console.error('OAuth error:', error);
            this.showError(`GitHub login failed: ${error}`);
            this.cleanupOAuthParams();
            return;
        }

        // No code means this isn't an OAuth callback
        if (!code) {
            return;
        }

        // Verify state to prevent CSRF attacks
        const storedState = localStorage.getItem(this.stateKey);
        if (!state || state !== storedState) {
            console.error('OAuth state mismatch');
            this.showError('Security error: Invalid OAuth state');
            this.cleanupOAuthParams();
            return;
        }

        try {
            // Exchange code for access token
            await this.exchangeCodeForToken(code);
            
            // Clean up URL and storage
            this.cleanupOAuthParams();
            
            // Reload page to refresh UI
            window.location.href = window.location.pathname;
            
        } catch (error) {
            console.error('Token exchange failed:', error);
            this.showError('Failed to complete GitHub login');
            this.cleanupOAuthParams();
        }
    }

    async exchangeCodeForToken(code) {
        // Since we can't safely store client secret in frontend,
        // we need to use a proxy service or GitHub's device flow
        // For now, we'll use a workaround with the GitHub CLI approach
        
        console.log('OAuth code received:', code.substring(0, 8) + '...');
        
        // Option 1: Use GitHub's Personal Access Token flow (recommended)
        // We'll redirect users to create a token manually but with pre-filled scopes
        this.redirectToTokenCreation();
    }

    redirectToTokenCreation() {
        // Create a more user-friendly token creation flow
        const tokenUrl = `https://github.com/settings/tokens/new?` + 
            `scopes=repo,user&` +
            `description=Glance%20Display%20Manager%20-%20${new Date().toISOString().split('T')[0]}`;
        
        // Open in new tab
        window.open(tokenUrl, '_blank');
        
        // Show instructions in current page
        this.showTokenInstructions();
    }

    showTokenInstructions() {
        const modal = document.createElement('div');
        modal.className = 'oauth-modal';
        modal.innerHTML = `
            <div class="oauth-modal-content">
                <div class="oauth-header">
                    <h3><i class="fab fa-github"></i> GitHub Token Setup</h3>
                    <button class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="oauth-body">
                    <p>A new tab has opened to create your GitHub token. Please:</p>
                    <ol>
                        <li><strong>Review the pre-filled settings</strong> (should be correct)</li>
                        <li><strong>Click "Generate token"</strong></li>
                        <li><strong>Copy the token</strong> (starts with ghp_)</li>
                        <li><strong>Paste it below</strong> and click Connect</li>
                    </ol>
                    
                    <div class="token-input-section">
                        <label for="modalGithubToken">GitHub Personal Access Token:</label>
                        <div class="input-group">
                            <input type="password" id="modalGithubToken" class="form-input" 
                                   placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                            <button class="btn btn-primary" onclick="glanceManager.connectWithToken(this)">
                                <i class="fas fa-link"></i> Connect
                            </button>
                        </div>
                    </div>
                    
                    <div class="oauth-help">
                        <p><small>
                            <i class="fas fa-info-circle"></i>
                            This token allows the dashboard to update your display images automatically.
                            It's stored securely in your browser only.
                        </small></p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus on token input
        setTimeout(() => {
            document.getElementById('modalGithubToken').focus();
        }, 100);
    }

    cleanupOAuthParams() {
        // Remove OAuth parameters from URL
        const url = new URL(window.location);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        url.searchParams.delete('error');
        
        // Update URL without reload
        window.history.replaceState({}, document.title, url.toString());
        
        // Clean up stored state
        localStorage.removeItem(this.stateKey);
    }

    // Token Management
    async storeToken(token) {
        try {
            // Validate token by making a test API call
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Invalid token');
            }

            const user = await response.json();
            
            // Store token and user info
            localStorage.setItem(this.tokenKey, token);
            localStorage.setItem(this.userKey, JSON.stringify({
                id: user.id,
                login: user.login,
                name: user.name,
                avatar_url: user.avatar_url,
                email: user.email,
                company: user.company,
                location: user.location,
                bio: user.bio,
                public_repos: user.public_repos,
                followers: user.followers,
                following: user.following,
                created_at: user.created_at
            }));

            return { token, user };
            
        } catch (error) {
            console.error('Token validation failed:', error);
            throw new Error('Invalid GitHub token');
        }
    }

    loadStoredAuth() {
        const token = localStorage.getItem(this.tokenKey);
        const userInfo = localStorage.getItem(this.userKey);
        
        if (token && userInfo) {
            try {
                this.token = token;
                this.user = JSON.parse(userInfo);
                return { token, user: this.user };
            } catch (error) {
                console.error('Failed to load stored auth:', error);
                this.logout();
            }
        }
        
        return null;
    }

    logout() {
        // Clear stored authentication
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        localStorage.removeItem(this.stateKey);
        
        this.token = null;
        this.user = null;
        
        // Refresh UI
        if (window.glanceManager) {
            window.glanceManager.renderGitHubStatus();
        }
    }

    // Status Methods
    isAuthenticated() {
        return !!(this.token && this.user);
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }

    // Repository Methods
    async getUserRepositories() {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch repositories');
            }

            const repos = await response.json();
            return repos.filter(repo => !repo.fork); // Filter out forked repos
            
        } catch (error) {
            console.error('Failed to fetch repositories:', error);
            throw error;
        }
    }

    async createGlanceRepository() {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Glance',
                    description: 'E-Ink Display Manager - Battery-powered WiFi display system',
                    homepage: 'https://github.com/CHaerem/Glance',
                    private: false,
                    has_issues: true,
                    has_projects: false,
                    has_wiki: false,
                    auto_init: true,
                    license_template: 'mit',
                    gitignore_template: 'Node'
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create repository');
            }

            const repo = await response.json();
            return repo;
            
        } catch (error) {
            console.error('Failed to create repository:', error);
            throw error;
        }
    }

    // UI Helper Methods
    showError(message) {
        if (window.glanceManager) {
            window.glanceManager.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    showSuccess(message) {
        if (window.glanceManager) {
            window.glanceManager.showNotification(message, 'success');
        } else {
            console.log(message);
        }
    }

    // GitHub App Setup Instructions
    getOAuthAppInstructions() {
        return {
            title: 'Setup GitHub OAuth App',
            steps: [
                'Go to GitHub Settings → Developer settings → OAuth Apps',
                'Click "New OAuth App"',
                'Fill in the application details:',
                {
                    'Application name': 'Glance Display Manager',
                    'Homepage URL': window.location.origin,
                    'Authorization callback URL': this.redirectUri,
                    'Application description': 'E-Ink Display Manager for battery-powered WiFi displays'
                },
                'Click "Register application"',
                'Copy the Client ID and update the code',
                'For production, also set up Client Secret (server-side)'
            ]
        };
    }
}

// Export for use in main application
window.GitHubOAuth = GitHubOAuth;