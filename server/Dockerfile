FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Create data directory for persistence
RUN mkdir -p /app/data

# Start the server
CMD ["node", "server.js"]