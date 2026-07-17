# ─────────────────────────────────────────────────────────
# Anti Gravity (Connectors) — Node.js + Socket.io Server
# Serves all static game files AND handles WebSocket relay
# Compatible with Railway, Render, Fly.io, DigitalOcean, etc.
# ─────────────────────────────────────────────────────────

# Use slim Node.js image (Alpine = ~50 MB total)
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy dependency manifest first (layer caching — only reinstalls when deps change)
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy all game files
COPY server.js   ./
COPY netsync.js  ./
COPY index.html  ./
COPY style.css   ./
COPY game.js     ./
COPY stages.js   ./

# Railway/Render inject $PORT at runtime (default fallback: 3000)
ENV PORT=3000
EXPOSE 3000

# Start the Socket.io relay server
CMD ["node", "server.js"]
