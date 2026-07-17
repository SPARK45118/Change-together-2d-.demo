// ============================================================
// CONNECTORS — Socket.io Relay Server  (Anti-Lag Build)
// Low-latency WebSocket relay for real-time multiplayer
// Serves static game files + relays game state between players
// ============================================================

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },

  // Only use raw WebSocket — never fall back to long-polling
  transports: ['websocket'],

  // Fast keepalive: detect dead connections in ~7s total
  pingInterval: 2000,
  pingTimeout:  5000,

  // Allow larger payloads (chain + platform data can be ~2-4 KB)
  maxHttpBufferSize: 1e6, // 1 MB

  // EIO3 compatibility for older socket.io clients
  allowEIO3: true,
});

// Serve all static game files from this directory
app.use(express.static(path.join(__dirname)));

// ---- Room Management ----
// roomCode -> { host: socketId, client: socketId | null }
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ---- Socket.io Events ----
io.on('connection', (socket) => {
  console.log(`[Server] Connected: ${socket.id}`);

  // Host creates a new room
  socket.on('create_room', () => {
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (rooms[code] && attempts < 20);

    rooms[code] = { host: socket.id, client: null };
    socket.join(code);
    socket.roomCode = code;
    socket.role     = 'host';

    socket.emit('room_created', { code });
    console.log(`[Server] Room created: ${code} (host: ${socket.id})`);
  });

  // Client joins an existing room
  socket.on('join_room', ({ code }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit('join_error', { message: 'Room not found. Check the code.' });
      return;
    }
    if (room.client) {
      socket.emit('join_error', { message: 'Room is already full.' });
      return;
    }

    room.client = socket.id;
    socket.join(code);
    socket.roomCode = code;
    socket.role     = 'client';

    // Tell client they joined
    socket.emit('room_joined', { code });
    // Tell host that player 2 joined — use socket.to() for minimal overhead
    socket.to(room.host).emit('player_joined');

    console.log(`[Server] ${socket.id} joined room ${code}`);
  });

  // ── Hot relay path ─────────────────────────────────────────────────────────
  // All game payloads go through here. Kept as lean as possible.
  socket.on('relay', (payload) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const room     = rooms[code];
    const targetId = socket.role === 'host' ? room.client : room.host;
    if (targetId) {
      // socket.to() is faster than io.to() — skips the extra room lookup
      socket.to(targetId).emit('relayed', payload);
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      const room     = rooms[code];
      const targetId = socket.role === 'host' ? room.client : room.host;
      if (targetId) {
        socket.to(targetId).emit('peer_disconnected');
      }
      // Full room teardown — both sockets will leave via socket.io internally
      delete rooms[code];
      console.log(`[Server] Room ${code} closed (${socket.role} disconnected: ${reason}).`);
    }
    console.log(`[Server] Disconnected: ${socket.id}`);
  });
});

// ---- Start Server ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] Connectors listening on port ${PORT}`);
  console.log(`[Server] Open http://localhost:${PORT} to play`);
});
