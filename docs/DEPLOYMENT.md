# Deployment Guide

This document describes the deployment setup for the Glance Server using GitHub Actions and Tailscale for direct deployment to your Raspberry Pi.

## Deployment Architecture

```
GitHub Actions → Docker Hub → Tailscale → serverpi → Docker Compose
```

1. **GitHub Actions**: Runs tests, builds multi-arch Docker images
2. **Docker Hub**: Stores the built images with version tags
3. **Tailscale**: Provides secure SSH access to serverpi from GitHub Actions
4. **serverpi**: Pulls and runs the new Docker image via compose

## Required Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

### Docker Hub
- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_TOKEN`: Docker Hub access token (not password!)

### Tailscale
- `TAILSCALE_OAUTH_CLIENT_ID`: Tailscale OAuth client ID
- `TAILSCALE_OAUTH_CLIENT_SECRET`: Tailscale OAuth client secret

## Automatic Deployment

### Trigger
Deployment happens automatically when you push to the `main` branch:

```bash
git push origin main
```

### Workflow Steps
1. **Test**: Run full test suite with coverage
2. **Build**: Build multi-architecture Docker images (amd64, arm64, arm/v7)
3. **Push**: Push images to Docker Hub with tags (latest, commit SHA)
4. **Deploy**: Connect to serverpi via Tailscale and update containers

### GitHub Actions Workflow

The `.github/workflows/test-and-build.yml` workflow:

```yaml
- name: Join tailnet (with SSH)
  uses: tailscale/github-action@v3
  with:
    oauth-client-id: ${{ secrets.TAILSCALE_OAUTH_CLIENT_ID }}
    oauth-secret: ${{ secrets.TAILSCALE_OAUTH_CLIENT_SECRET }}
    tags: tag:ci
    args: --ssh

- name: Deploy to serverpi
  run: |
    tailscale ssh chris@serverpi \
      'cd ~/glance && IMAGE_VERSION=${{ github.sha }} docker compose pull && IMAGE_VERSION=${{ github.sha }} docker compose up -d'
```

## Manual Deployment

### Local to Pi
```bash
# Deploy current commit to Pi
./deploy-to-pi.sh serverpi.local chaerem

# Deploy specific version
IMAGE_VERSION=abc1234 ./deploy-to-pi.sh serverpi.local chaerem
```

### Direct SSH
```bash
# Update to latest
ssh chris@serverpi 'cd ~/glance && docker compose pull && docker compose up -d'

# Update to specific version
ssh chris@serverpi 'cd ~/glance && IMAGE_VERSION=abc1234 docker compose pull && IMAGE_VERSION=abc1234 docker compose up -d'
```

## Docker Compose Configuration

The `docker-compose.prod.yml` uses version-tagged images:

```yaml
services:
  glance-server:
    image: chaerem/glance-server:${IMAGE_VERSION:-latest}
    environment:
      - IMAGE_VERSION=${IMAGE_VERSION:-latest}
```

### Image Versioning
- `latest`: Always points to the most recent main branch build
- `<commit-sha>`: Specific commit version (e.g., `abc1234`)
- `main`: Latest main branch (same as latest)

## Monitoring Deployments

### GitHub Actions
- Go to Actions tab in your GitHub repo
- Monitor the "Test and Build" workflow
- Check logs for deployment status

### On serverpi
```bash
# Check container status
ssh chris@serverpi 'cd ~/glance && docker compose ps'

# View logs
ssh chris@serverpi 'cd ~/glance && docker compose logs -f'

# Check current version
ssh chris@serverpi 'cd ~/glance && docker compose exec glance-server env | grep IMAGE_VERSION'
```

### Web Interface
Visit http://serverpi.local:3000 and check the footer for the current image version.

## Rollback Procedure

### To Previous Version
```bash
# Find previous version in Docker Hub or git log
PREVIOUS_VERSION=xyz5678

# Deploy previous version
ssh chris@serverpi "cd ~/glance && IMAGE_VERSION=${PREVIOUS_VERSION} docker compose pull && IMAGE_VERSION=${PREVIOUS_VERSION} docker compose up -d"
```

### Emergency Rollback
```bash
# Quick rollback to latest stable
ssh chris@serverpi 'cd ~/glance && IMAGE_VERSION=latest docker compose pull && IMAGE_VERSION=latest docker compose up -d'
```

## Troubleshooting

### GitHub Actions Failures

**Test Failures**:
```bash
# Run tests locally first
cd server
npm run test:ci

# Fix issues, then push again
```

**Build Failures**:
```bash
# Test local build
./scripts/local-build.sh

# Check Docker Hub permissions
docker login
```

**Deployment Failures**:
- Check Tailscale secrets are correct
- Verify serverpi is accessible via Tailscale
- Check serverpi disk space: `ssh chris@serverpi 'df -h'`

### serverpi Issues

**Container Won't Start**:
```bash
# Check logs
ssh chris@serverpi 'cd ~/glance && docker compose logs'

# Check system resources
ssh chris@serverpi 'free -h && df -h'

# Restart Docker daemon
ssh chris@serverpi 'sudo systemctl restart docker'
```

**Image Pull Failures**:
```bash
# Manual pull test
ssh chris@serverpi 'docker pull chaerem/glance-server:latest'

# Check Docker Hub rate limits
ssh chris@serverpi 'docker system events --since 1h'
```

### Network Issues

**ESP32 Can't Connect**:
- Verify serverpi.local resolves: `ping serverpi.local`
- Check firewall: `ssh chris@serverpi 'sudo ufw status'`
- Test API endpoint: `curl http://serverpi.local:3000/api/current.json`

## Security Notes

### Tailscale Access
- GitHub Actions connects with limited `tag:ci` permissions
- SSH access is ephemeral (only during deployment)
- No persistent connections or stored keys

### Docker Security
- Images are pulled from public Docker Hub
- Container runs as non-root user
- Limited filesystem access via volumes

### Pi Security
- SSH key-based authentication required
- Firewall should limit external access
- Regular security updates recommended

## Development Workflow

### Feature Development
```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes, test locally
npm test
./scripts/local-build.sh

# Push to GitHub (triggers test-only workflow)
git push origin feature/new-feature

# Create PR to main (triggers test workflow)
# Merge PR (triggers build and deploy workflow)
```

### Hotfix Deployment
```bash
# Create hotfix branch
git checkout -b hotfix/critical-fix

# Make minimal changes
# Test thoroughly
npm run test:ci

# Push directly to main for urgent fixes
git checkout main
git merge hotfix/critical-fix
git push origin main  # Auto-deploys
```

This setup provides reliable, tested deployments with quick rollback capabilities while maintaining security through Tailscale's zero-trust network access.

---

# Manual Docker Deployment



## 🥧 Deploying to Raspberry Pi

### Option 1: Automated Deployment

```bash
# Deploy directly to your Pi (replace with your details)
./deploy-to-pi.sh ServerPi.local your-username
```

### Option 2: Manual Deployment

1. **Copy files to Pi:**
   ```bash
   scp docker-compose.prod.yml pi@ServerPi.local:~/glance/docker-compose.yml
   ```

2. **Update the image name:**
   ```bash
   # On the Pi, edit docker-compose.yml
   ssh pi@ServerPi.local
   cd ~/glance
   nano docker-compose.yml
   # Change: your-username/glance-server:latest
   ```

3. **Start the service:**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

## 🖥️ Local Development

### Test Locally Before Publishing

```bash
# Build local image
./scripts/local-build.sh

# Test locally
docker run -p 3000:3000 -v $(pwd)/data:/app/data glance-server:local
```

### View Logs

```bash
# On Raspberry Pi
docker-compose logs -f

# For specific container
docker logs glance-server -f
```

## 🔧 ESP32 Configuration

After deployment, update your ESP32 code with the Pi's IP:

```cpp
// In esp32-client/config.h - already configured for ServerPi.local
#define API_BASE_URL "http://ServerPi.local:3000/api/"
#define STATUS_URL "http://ServerPi.local:3000/api/device-status"
```

The ESP32 client is already configured to use ServerPi.local hostname for automatic discovery.

## 🔄 Updates

### Update Published Image

1. **Make changes to server code**
2. **Rebuild and push:**
   ```bash
   ./scripts/build-and-push.sh your-username
   ```

### Update Pi Deployment

```bash
# On the Pi
cd ~/glance
docker-compose pull
docker-compose up -d
```

## 🐳 Docker Commands Reference

```bash
# View running containers
docker ps

# Stop service
docker-compose down

# View all images
docker images

# Remove old images
docker image prune

# Check Pi architecture
docker info | grep Architecture
```

## 🔍 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs

# Check container status
docker ps -a

# Restart service
docker-compose restart
```

### Port Already in Use
```bash
# Check what's using port 3000
sudo netstat -tulpn | grep 3000

# Or change port in docker-compose.yml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Architecture Issues
```bash
# Force pull for specific architecture
docker pull --platform linux/arm64 your-username/glance-server:latest
```

## 📊 Monitoring

### Health Checks
```bash
# Manual health check
curl http://localhost:3000/health

# Docker health status
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Resource Usage
```bash
# Container stats
docker stats glance-server

# Disk usage
docker system df
```

## 🔐 Security Notes

- Image runs as non-root user (UID 1001)
- No sensitive data in image layers
- Health checks enabled
- Proper signal handling with dumb-init

## 📈 Scaling

For multiple Pi deployments:

1. **Same image, different configs:**
   ```bash
   # Use environment variables
   docker run -e PI_LOCATION="Kitchen" your-username/glance-server
   ```

2. **Docker Swarm (advanced):**
   ```bash
   docker swarm init
   docker stack deploy -c docker-compose.yml glance
   ```