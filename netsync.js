// ============================================================
// CONNECTORS — Socket.io Network Sync Layer  (Anti-Lag Build)
// Low-latency WebSocket relay — minimum jitter, minimum delay
// ============================================================

class NetSync {
  constructor(game) {
    this.game      = game;
    this.socket    = null;
    this.isHost    = false;
    this.roomCode  = '';
    this.connected = false;

    // ── Send-rate controls ─────────────────────────────────────────────────
    // Host sync: send authoritative state every N physics ticks (60 ticks/s).
    //   SYNC_INTERVAL = 2  →  30 sync packets / second  (was 60 — halved)
    this.SYNC_INTERVAL = 2;
    this._syncTick     = 0;

    // Client input: send local keys every N ticks.
    //   INPUT_INTERVAL = 2  →  30 input packets / second (was 60 — halved)
    this.INPUT_INTERVAL = 2;
    this._inputTick     = 0;
  }

  // Returns the server URL (same origin works locally and in production)
  _getServerUrl() {
    return window.location.origin;
  }

  // Load Socket.io client and connect to the server
  async init() {
    if (this.socket && this.socket.connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const connect = () => {
        this.socket = window.io(this._getServerUrl(), {
          // Force WebSocket only — skip the HTTP long-poll upgrade handshake
          transports: ['websocket'],

          // Allow auto-reconnect on brief network hiccups
          reconnection:        true,
          reconnectionAttempts: 3,
          reconnectionDelay:   500,

          // Connection timeout
          timeout: 8000,
        });

        this.socket.on('connect', () => {
          console.log('[NetSync] Connected to server:', this.socket.id);
          resolve();
        });

        this.socket.on('connect_error', (err) => {
          reject(new Error('Cannot connect to game server: ' + err.message));
        });
      };

      // Socket.io client is served by our server at /socket.io/socket.io.js
      if (window.io) {
        connect();
        return;
      }

      const script    = document.createElement('script');
      script.src      = '/socket.io/socket.io.js';
      script.onload   = connect;
      script.onerror  = () => reject(new Error('Failed to load Socket.io client.'));
      document.head.appendChild(script);
    });
  }

  // Host: create a new room and get a room code
  async hostRoom() {
    await this.init();
    this.isHost = true;

    return new Promise((resolve) => {
      this.socket.emit('create_room');

      this.socket.once('room_created', ({ code }) => {
        this.roomCode = code;
        console.log('[NetSync] Room created:', code);
        this._setupListeners();
        resolve(code);
      });
    });
  }

  // Client: join an existing room by code
  async joinRoom(code) {
    await this.init();
    this.isHost   = false;
    this.roomCode = code.toUpperCase().trim();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timed out. Check the room code.'));
        }
      }, 10000);

      this.socket.emit('join_room', { code: this.roomCode });

      this.socket.once('room_joined', () => {
        clearTimeout(timeout);
        console.log('[NetSync] Joined room:', this.roomCode);
        this._setupListeners();
        this._onConnected();
        resolve();
      });

      this.socket.once('join_error', ({ message }) => {
        clearTimeout(timeout);
        reject(new Error(message));
      });
    });
  }

  _setupListeners() {
    // Host: wait for client to join, then start the game
    if (this.isHost) {
      this.socket.once('player_joined', () => {
        console.log('[NetSync] Player 2 joined!');
        this._onConnected();
      });
    }

    // Both: receive relayed game messages from the peer
    this.socket.on('relayed', (data) => {
      this._handleNetworkData(data);
    });

    // Both: peer left the room
    this.socket.on('peer_disconnected', () => {
      console.log('[NetSync] Peer disconnected.');
      this.disconnect();
    });
  }

  _onConnected() {
    this.connected = true;
    console.log('[NetSync] Game connection established!');

    // Hide lobby overlays
    document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
    document.getElementById('connectingOverlay').classList.add('hidden');

    if (this.isHost) {
      // Send 'joined' ONCE — client acknowledges and transitions itself.
      // (Previous code fired this 5× in a setInterval which caused duplicate state transitions.)
      this.sendState({ type: 'joined', role: 'client' });
      this.game.netLaunchGame();
    } else {
      this.game.netEnterWaiting();
    }
  }

  // ── Send helpers ───────────────────────────────────────────────────────────

  // Send game state/input to the peer (relayed via server)
  sendState(payload) {
    if (this.socket && this.socket.connected && this.connected) {
      this.socket.emit('relay', payload);
    }
  }

  // Throttled HOST sync — called every physics tick; only fires every SYNC_INTERVAL ticks
  trySendSync(payload) {
    this._syncTick++;
    if (this._syncTick >= this.SYNC_INTERVAL) {
      this._syncTick = 0;
      this.sendState(payload);
    }
  }

  // Throttled CLIENT input — called every physics tick; only fires every INPUT_INTERVAL ticks
  trySendInput(payload) {
    this._inputTick++;
    if (this._inputTick >= this.INPUT_INTERVAL) {
      this._inputTick = 0;
      this.sendState(payload);
    }
  }

  // ── Receive dispatcher ─────────────────────────────────────────────────────
  _handleNetworkData(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'joined':
        // Client received confirmation from host
        this.game.netEnterWaiting();
        break;

      case 'launch':
        // Host selected a stage — client loads it
        this.game.netLaunchStage(data.stageIdx);
        break;

      case 'input':
        // Host receives client's P2 inputs
        if (this.isHost) {
          this.game.netSetClientKeys(data.keys);
        }
        break;

      case 'sync':
        // Client receives authoritative game state from host
        if (!this.isHost) {
          this.game.netApplySyncFrame(data);
        }
        break;

      case 'death':
        // Host tells client a death occurred
        if (!this.isHost) {
          this.game.netApplyDeath(data);
        }
        break;

      case 'complete_confirm':
        this.game.netConfirmStageWin();
        break;
    }
  }

  disconnect() {
    this.connected = false;
    if (this.socket) {
      try { this.socket.disconnect(); } catch (e) { /* ignore */ }
      this.socket = null;
    }

    // Hide overlays, return to title
    document.getElementById('connectingOverlay').classList.add('hidden');
    document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');

    const s = this.game.state;
    if (s === STATE.PLAYING || s === STATE.INTRO || s === STATE.STAGE_COMPLETE ||
      s === STATE.WAITING_HOST || s === STATE.STAGE_SELECT) {
      this.game.state = STATE.MENU;
      alert('Disconnected from peer.');
    }
  }
}
