# Docker Hub Deployment Guide

This guide shows how to publish the Glance Server to Docker Hub and deploy it easily to your Raspberry Pi.

## 📦 Publishing to Docker Hub

### 1. Setup Docker Hub Account

1. Create account at [hub.docker.com](https://hub.docker.com)
2. Login from command line:
   ```bash
   docker login
   ```

### 2. Build and Push Multi-Architecture Image

```bash
# Replace 'your-username' with your Docker Hub username
./scripts/build-and-push.sh your-username
```

This creates images for:
- **linux/amd64** - Intel/AMD 64-bit (development, servers)
- **linux/arm64** - Raspberry Pi 4, Apple Silicon
- **linux/arm/v7** - Raspberry Pi 3, Zero 2W

### 3. Verify Publication

Check your image at: `https://hub.docker.com/r/your-username/glance-server`

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