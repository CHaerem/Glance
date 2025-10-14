# Security Guidelines

## WiFi Credentials Management

**NEVER commit WiFi credentials to git.** This project uses environment variables for all sensitive configuration.

### Proper Usage

Set credentials via environment variables before building:

```bash
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"
export DEVICE_ID="esp32-001"

# Then build
cd esp32-client/
./build.sh
```

### For Development

To override the server URL for local development:

```bash
# For Good Display board (ESP-IDF)
export SERVER_URL="http://192.168.1.x:3000"

# For Feather ESP32 (Arduino)
export SERVER_HOST="192.168.1.x:3000"
```

### .gitignore Protection

The following patterns are ignored to prevent credential leaks:
- `.env*` files (except `.env.example`)
- `**/flash-*.sh` scripts
- `**/*credentials*.sh` scripts
- `**/*secrets*.sh` scripts

## Historical Note

**Previous commits contain exposed WiFi credentials.** If this repository was public:

1. **Change your WiFi password immediately**
2. Consider the old password permanently compromised
3. Review your network security settings

## Best Practices

### DO:
- ✅ Use environment variables for all credentials
- ✅ Use `.env.example` files as templates (without real values)
- ✅ Use `serverpi.local` for production configuration
- ✅ Document required environment variables in README

### DON'T:
- ❌ Never hardcode WiFi credentials in source files
- ❌ Never commit files containing passwords
- ❌ Never commit API keys or tokens
- ❌ Never use production credentials in example code

## Server Configuration

For the Node.js server, use environment variables:

```bash
export PORT=3000
export OPENAI_API_KEY="sk-..."  # Optional, for AI features
```

### Docker Deployment

Pass secrets via environment variables or Docker secrets:

```bash
docker run -d \
  --name glance-server \
  -p 3000:3000 \
  -e OPENAI_API_KEY="sk-..." \
  -v $(pwd)/data:/app/data \
  glance-server:latest
```

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do not** open a public issue
2. Contact the maintainer privately via GitHub
3. Provide details about the vulnerability
4. Allow time for a fix before public disclosure

## OpenAI API Key

The `OPENAI_API_KEY` is optional and only required for AI art generation features:
- Store in environment variables only
- Never commit to git
- Rotate regularly
- Monitor usage on OpenAI dashboard

## Network Security

### WiFi Network
- Use WPA3 or WPA2-Personal encryption minimum
- Change default router passwords
- Disable WPS
- Use strong, unique WiFi passwords (16+ characters)

### Raspberry Pi Server
- Keep system updated: `sudo apt update && sudo apt upgrade`
- Use firewall: `sudo ufw enable`
- Change default SSH password
- Consider SSH key authentication only
- Regularly update Docker images
