// ============================================================
// CHAINED TOGETHER — Peer-to-Peer Network Sync Layer
// Simple WebRTC + public signaling connector
// ============================================================

class NetSync {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = '';
    this.connected = false;
    
    // We use a free public signaling relay (or PeerJS public server)
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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars like O, 0, I, 1
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
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        console.log('Room hosted with Peer ID:', id);
        this._setupHostListeners();
        resolve(this.roomCode);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
          // Retry generating a code if ID conflicts
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
      debug: 1,
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
        console.log('Connecting to host room:', targetHostId);
        
        // Connect to host
        const conn = this.peer.connect(targetHostId, {
          reliable: false // WebRTC UDP mode for rapid updates
        });
        
        this._setupConnection(conn);

        // Timeout if no response
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
        // Only 1 player can join our room
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
      console.log('Data connection established!');
      
      // Update overlays
      document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
      document.getElementById('connectingOverlay').classList.add('hidden');
      
      // If we are host, we start loading the stages
      if (this.isHost) {
        this.game.netLaunchGame();
      }
    });

    conn.on('data', (data) => {
      this._handleNetworkData(data);
    });

    conn.on('close', () => {
      console.log('Connection closed by peer.');
      this.disconnect();
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.disconnect();
    });
  }

  // Send tick/input state to peer
  sendState(payload) {
    if (this.conn && this.conn.open) {
      this.conn.send(payload);
    }
  }

  _handleNetworkData(data) {
    if (!data) return;

    // Type 1: Sync Level Launch / Stage Selection
    if (data.type === 'launch') {
      this.game.netLaunchStage(data.stageIdx);
      return;
    }

    // Type 2: Game Sync Frame
    if (data.type === 'sync') {
      if (this.isHost) {
        // Host controls physics, so client only sends its direct movement inputs
        // Client reports keys back to host so host's player update handles it locally
        this.game.netSetClientKeys(data.keys);
      } else {
        // Client receives fully-computed state from the host
        this.game.netApplySyncFrame(data);
      }
      return;
    }

    // Type 3: Stage Completed (Proceed together)
    if (data.type === 'complete_confirm') {
      this.game.netConfirmStageWin();
    }
  }

  disconnect() {
    this.connected = false;
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    // Hide game, return to title screen on disconnect
    document.getElementById('connectingOverlay').classList.add('hidden');
    document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    
    if (this.game.state === STATE.PLAYING || this.game.state === STATE.INTRO || this.game.state === STATE.STAGE_COMPLETE) {
      this.game.state = STATE.MENU;
      alert('Disconnected from peer.');
    }
  }
}
