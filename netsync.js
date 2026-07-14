// ============================================================
// CHAINED TOGETHER — Peer-to-Peer Network Sync Layer
// ZERO-LAG EDITION: Prediction + Interpolation + Reconciliation
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
    this.SYNC_INTERVAL = 3;
    this._syncTick = 0;

    // Latency tracking
    this.currentLatency = 0;
    this.latencyHistory = [];

    // Client-side prediction state
    this.prediction = {
      pendingInputs: [],
      sequenceNumber: 0,
      lastAcknowledgedSeq: 0
    };

    // Entity interpolation state
    this.interp = {
      buffer: [],
      renderX: 0,
      renderY: 0,
      renderVX: 0,
      renderVY: 0,
      delay: 50
    };

    // Heartbeat
    this._heartbeatInterval = null;
    this._lastDataReceived = Date.now();

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

        const conn = this.peer.connect(targetHostId, {
          reliable: false,
          ordered: false,
          maxRetransmits: 0
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
      this._lastDataReceived = Date.now();
      console.log('[NetSync] Data channel open!');

      // Hide lobby overlays
      document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
      document.getElementById('connectingOverlay').classList.add('hidden');

      // Start heartbeat
      this._startHeartbeat();

      if (this.isHost) {
        let attempts = 0;
        const interval = setInterval(() => {
          if (this.conn && this.conn.open) {
            this.sendState({ type: 'joined', role: 'client' });
          }
          attempts++;
          if (attempts >= 5 || !this.connected) clearInterval(interval);
        }, 150);

        this.game.netLaunchGame();
      } else {
        this.game.netEnterWaiting();
      }
    });

    conn.on('data', (data) => {
      this._lastDataReceived = Date.now();
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

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (!this.connected) {
        this._stopHeartbeat();
        return;
      }
      if (Date.now() - this._lastDataReceived > 5000) {
        console.warn('[NetSync] No data for 5s, checking connection...');
        this.sendState({ type: 'heartbeat' });
      }
      this.sendState({ type: 'ping', time: performance.now() });
    }, 1000);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  // Send data to peer
  sendState(payload) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(payload);
      } catch (e) {
        console.error('[NetSync] Send error:', e);
      }
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

  // Entity interpolation - called every frame on client
  updateInterpolation() {
    if (this.isHost || !this.connected) return;

    const buffer = this.interp.buffer;
    if (buffer.length === 0) return;
    
    if (buffer.length === 1) {
      this.interp.renderX = buffer[0].x;
      this.interp.renderY = buffer[0].y;
      return;
    }

    const renderTime = performance.now() - this.interp.delay;
    let from = null, to = null;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
        from = buffer[i];
        to = buffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      const latest = buffer[buffer.length - 1];
      this.interp.renderX = latest.x;
      this.interp.renderY = latest.y;
      return;
    }

    const duration = to.timestamp - from.timestamp;
    const elapsed = renderTime - from.timestamp;
    const t = duration > 0 ? Math.min(Math.max(elapsed / duration, 0), 1) : 0;
    const smoothT = t * t * (3 - 2 * t);
    
    this.interp.renderX = from.x + (to.x - from.x) * smoothT;
    this.interp.renderY = from.y + (to.y - from.y) * smoothT;
  }

  _handleNetworkData(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'joined':
        this.game.netEnterWaiting();
        break;

      case 'launch':
        this.game.netLaunchStage(data.stageIdx);
        break;

      case 'heartbeat':
        break;

      case 'ping':
        this.sendState({ type: 'pong', time: data.time });
        break;

      case 'pong':
        this.currentLatency = (performance.now() - data.time) / 2;
        this.latencyHistory.push(this.currentLatency);
        if (this.latencyHistory.length > 20) this.latencyHistory.shift();
        this._adjustInterpolationDelay();
        break;

      case 'input':
        if (this.isHost) {
          this.game.netSetClientKeys(data.keys);
          if (this.game.p2 && data.seq) {
            this.sendState({
              type: 'input_ack',
              seq: data.seq,
              x: this.game.p2.x,
              y: this.game.p2.y,
              vx: this.game.p2.vx || 0,
              vy: this.game.p2.vy || 0
            });
          }
        }
        break;

      case 'input_ack':
        if (!this.isHost) {
          this.prediction.pendingInputs = this.prediction.pendingInputs.filter(
            input => input.seq > data.seq
          );
          this.prediction.lastAcknowledgedSeq = data.seq;
          this._reconcileP2(data);
        }
        break;

      case 'sync':
        if (!this.isHost) {
          this.interp.buffer.push({
            timestamp: performance.now(),
            x: data.p1.x,
            y: data.p1.y,
            vx: data.p1.vx || 0,
            vy: data.p1.vy || 0
          });
          while (this.interp.buffer.length > 8) this.interp.buffer.shift();
          this.game.netApplySyncFrame(data);
        }
        break;

      case 'death':
        if (!this.isHost) {
          this.game.netApplyDeath(data);
        }
        break;

      case 'complete_confirm':
        this.game.netConfirmStageWin();
        break;
    }
  }

  _reconcileP2(serverState) {
    if (this.isHost || !this.game.p2) return;
    
    const p2 = this.game.p2;
    const dx = serverState.x - p2.x;
    const dy = serverState.y - p2.y;
    const error = Math.sqrt(dx * dx + dy * dy);

    if (error > 10) {
      p2.x += dx * 0.3;
      p2.y += dy * 0.3;
      p2.vx = serverState.vx;
      p2.vy = serverState.vy;
    } else if (error > 3) {
      p2.x += dx * 0.15;
      p2.y += dy * 0.15;
    } else if (error > 0.5) {
      p2.x += dx * 0.05;
      p2.y += dy * 0.05;
    }
  }

  _adjustInterpolationDelay() {
    if (this.latencyHistory.length < 3) return;
    const avg = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    const variance = this.latencyHistory.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.latencyHistory.length;
    const jitter = Math.sqrt(variance);
    this.interp.delay = Math.min(Math.max(avg + jitter * 1.5, 16), 100);
  }

  disconnect() {
    this.connected = false;
    this._stopHeartbeat();
    
    if (this.conn) {
      try { this.conn.close(); } catch (e) { /* ignore */ }
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null;
    }

    this.prediction.pendingInputs = [];
    this.prediction.sequenceNumber = 0;
    this.interp.buffer = [];

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

  destroy() {
    this._stopHeartbeat();
    this.disconnect();
    this.game = null;
  }
}