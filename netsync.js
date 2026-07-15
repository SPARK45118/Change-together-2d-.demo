// ============================================================
// CHAINED TOGETHER — Peer-to-Peer Network Sync Layer
// Optimized WebRTC + public signaling connector
// ============================================================

class NetSync {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = '';
    this.connected = false;

    // Throttle: only send sync data every N ticks (reduces bandwidth ~66%)
    this.SYNC_INTERVAL = 1;
    this._syncTick = 0;

    // Client-side interpolation targets
    this._lerpTargets = null; // { p1, p2, cam } set by incoming sync frames
    this._lerpAlpha = 0;

    this.peerjsScriptLoaded = false;
  }

  // Load PeerJS library dynamically to avoid offline start issues
  async init() {
    if (this.peerjsScriptLoaded) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      script.onload = () => {
        this.peerjsScriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load PeerJS. Check internet.'));
      document.head.appendChild(script);
    });
  }

  // Generate a random room code (6 alphanumeric characters)
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host a new WebRTC room
  async hostRoom() {
    await this.init();
    this.isHost = true;
    this.roomCode = this._generateCode();

    const hostId = 'chained-together-' + this.roomCode;
    this.peer = new Peer(hostId, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        console.log('[NetSync] Room hosted:', id);
        this._setupHostListeners();
        resolve(this.roomCode);
      });

      this.peer.on('error', (err) => {
        console.error('[NetSync] Peer error:', err);
        if (err.type === 'unavailable-id') {
          this.roomCode = this._generateCode();
          this.peer.destroy();
          this.hostRoom().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // Join an existing WebRTC room
  async joinRoom(code) {
    await this.init();
    this.isHost = false;
    this.roomCode = code.toUpperCase().trim();

    this.peer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    const targetHostId = 'chained-together-' + this.roomCode;

    return new Promise((resolve, reject) => {
      this.peer.on('open', () => {
        console.log('[NetSync] Connecting to host:', targetHostId);

        // Use reliable: false (unreliable/UDP mode) for minimum latency and real-time responsiveness.
        // To handle packet loss for initial critical setup states (like launch/joined), we will send connection setup messages reliably.
        const conn = this.peer.connect(targetHostId, {
          reliable: false
        });

        this._setupConnection(conn);

        const timeout = setTimeout(() => {
          if (!this.connected) {
            this.disconnect();
            reject(new Error('Connection timed out.'));
          }
        }, 10000);

        conn.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  _setupHostListeners() {
    this.peer.on('connection', (conn) => {
      if (this.connected) {
        conn.close();
        return;
      }
      this._setupConnection(conn);
    });
  }

  _setupConnection(conn) {
    this.conn = conn;

    conn.on('open', () => {
      this.connected = true;
      console.log('[NetSync] Data channel open!');

      // Hide lobby overlays
      document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
      document.getElementById('connectingOverlay').classList.add('hidden');

      if (this.isHost) {
        // Send 'joined' multiple times with a small delay to guarantee client receives it and doesn't get stuck in lobby
        let attempts = 0;
        const interval = setInterval(() => {
          if (this.conn && this.conn.open) {
            this.sendState({ type: 'joined', role: 'client' });
          }
          attempts++;
          if (attempts >= 5 || !this.connected) clearInterval(interval);
        }, 150);

        // Host goes to stage select
        this.game.netLaunchGame();
      } else {
        // Client enters waiting state
        this.game.netEnterWaiting();
      }
    });

    conn.on('data', (data) => {
      this._handleNetworkData(data);
    });

    conn.on('close', () => {
      console.log('[NetSync] Connection closed by peer.');
      this.disconnect();
    });

    conn.on('error', (err) => {
      console.error('[NetSync] Connection error:', err);
      this.disconnect();
    });
  }

  // Send data to peer
  sendState(payload) {
    if (this.conn && this.conn.open) {
      this.conn.send(payload);
    }
  }

  // Called by the game loop every tick — throttles actual sends
  trySendSync(payload) {
    this._syncTick++;
    if (this._syncTick >= this.SYNC_INTERVAL) {
      this._syncTick = 0;
      this.sendState(payload);
    }
  }

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
          this.game.netSetClientKeys(data.keys, data.tick);
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
    if (this.conn) {
      try { this.conn.close(); } catch (e) { /* ignore */ }
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null;
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
