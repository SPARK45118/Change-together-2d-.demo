// ============================================================
// CHAINED TOGETHER — 2D Co-op Platformer
// Full game engine: physics, chain, stages, rendering
// ============================================================

(() => {
  'use strict';

  // --- Canvas Setup ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ============================================================
  // CONFIGURATION
  // ============================================================

  const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || ('ontouchstart' in window);

  const CONFIG = {
    GRAVITY: 0.48,
    PLAYER_SPEED: 4.0,
    JUMP_FORCE: -14,          // tuned: snappier, less floaty
    MAX_FALL_SPEED: 13,
    GROUND_FRICTION: 0.78,
    AIR_CONTROL: 0.18,
    AIR_DRAG: 0.96,
    PLAYER_W: 26,
    PLAYER_H: 36,
    CHAIN_SEGMENTS: 16,
    CHAIN_MAX_LEN: 180,
    CHAIN_SNAP_TIME: 180,
    CHAIN_ITERS: IS_MOBILE ? 6 : 8, // fewer iterations on mobile for performance
    CHAIN_GRAVITY: 0.28,
    CHAIN_DAMP: 0.97,
    CHAIN_PULL: 0.28,
    CAM_LERP: 0.08,
    DEATH_COOLDOWN: 55,
    INVINCIBILITY: 80,
    MAX_PARTICLES: 150,       // cap particles to reduce GC pressure
  };

  const COL = {
    P1: '#00e5ff',
    P2: '#ff0055',
    CHAIN: '#ffd700',
    CHAIN_TAUT: '#ff6600',
    PLAT: '#00ffc8',
    PLAT_MOVE: '#ffaa00',
    PLAT_VANISH: '#aa44ff',
    HAZARD: '#ff3300',
    EXIT: '#00ff66',
  };

  const STATE = { MENU: 0, PLAYING: 1, STAGE_COMPLETE: 2, GAME_OVER: 3, DYING: 4, INTRO: 5, STAGE_SELECT: 6, MODE_SELECT: 7, COOP_TYPE_SELECT: 8, WAITING_HOST: 9 };

  // ============================================================
  // UTILITIES
  // ============================================================

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }
  function rand(a, b) { return Math.random() * (b - a) + a; }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  // ============================================================
  // INPUT
  // ============================================================

  const keys = {};
  const justPressed = {};
  window.addEventListener('keydown', e => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  function consumeJustPressed(code) {
    if (justPressed[code]) { justPressed[code] = false; return true; }
    return false;
  }
  function clearJustPressed() {
    for (const k in justPressed) justPressed[k] = false;
  }

  // ============================================================
  // TOUCH / VIRTUAL GAMEPAD
  // Maps on-screen button presses directly into the keys/justPressed
  // objects so the rest of the engine needs zero changes.
  // ============================================================

  const touchBtns = {}; // id -> { code, held }

  function _touchDown(code) {
    if (!keys[code]) justPressed[code] = true;
    keys[code] = true;
  }
  function _touchUp(code) {
    keys[code] = false;
  }

  function _registerTouchBtn(el, code) {
    const start = (e) => {
      e.preventDefault();
      _touchDown(code);
    };
    const end = (e) => {
      e.preventDefault();
      _touchUp(code);
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend',   end,   { passive: false });
    el.addEventListener('touchcancel',end,   { passive: false });
    // Also support mouse for testing on desktop
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup',   end);
    el.addEventListener('mouseleave',end);
  }

  // ============================================================
  // SOUND MANAGER (Web Audio Synth)
  // ============================================================

  class SoundMgr {
    constructor() { this.ctx = null; this.ok = false; }

    init() {
      if (this.ok) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ok = true; } catch (e) { /* silent */ }
    }

    _osc(type, freq, freqEnd, dur, vol) {
      if (!this.ok) return;
      const c = this.ctx, now = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      if (freqEnd !== freq) o.frequency.linearRampToValueAtTime(freqEnd, now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.linearRampToValueAtTime(0, now + dur);
      o.start(now); o.stop(now + dur);
    }

    jump() { this._osc('sine', 320, 640, 0.1, 0.12); }
    land() { this._osc('triangle', 140, 70, 0.06, 0.08); }
    death() { this._osc('sawtooth', 440, 80, 0.45, 0.18); }
    taut() { this._osc('square', 900, 200, 0.05, 0.04); }

    complete() {
      if (!this.ok) return;
      const c = this.ctx, now = c.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.1);
        g.gain.setValueAtTime(0.12, now + i * 0.1);
        g.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.25);
        o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.25);
      });
    }
  }

  // ============================================================
  // PARTICLES
  // ============================================================

  class Particle {
    constructor(x, y, vx, vy, color, life, sz) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = life; this.maxLife = life; this.sz = sz;
    }
    update() {
      this.x += this.vx; this.y += this.vy; this.vy += 0.08; this.life--;
      return this.life > 0;
    }
    draw(c) {
      const a = this.life / this.maxLife;
      c.globalAlpha = a;
      c.fillStyle = this.color;
      c.shadowBlur = 8; c.shadowColor = this.color;
      c.beginPath(); c.arc(this.x, this.y, this.sz * a, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
  }

  class Particles {
    constructor() {
      this.list = [];
      // Object pool to avoid GC pauses
      this._pool = [];
    }
    _acquire(x, y, vx, vy, color, life, sz) {
      const p = this._pool.length ? this._pool.pop() : new Particle(x, y, vx, vy, color, life, sz);
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.color = color; p.life = life; p.maxLife = life; p.sz = sz;
      return p;
    }
    emit(x, y, n, color, opts = {}) {
      const { sMin = -3, sMax = 3, life = 30, sz = 3 } = opts;
      // Cap total particles to avoid GC spikes
      const space = CONFIG.MAX_PARTICLES - this.list.length;
      const count = Math.min(n, space);
      for (let i = 0; i < count; i++) {
        this.list.push(this._acquire(x, y, rand(sMin, sMax), rand(sMin, sMax * 0.6), color, (life + (rand(-8, 8) | 0)), sz));
      }
    }
    update() {
      let alive = 0;
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        if (p.update()) {
          this.list[alive++] = p;
        } else {
          this._pool.push(p); // return to pool
        }
      }
      this.list.length = alive;
    }
    draw(c) { for (let i = 0; i < this.list.length; i++) this.list[i].draw(c); }
    clear() {
      for (let i = 0; i < this.list.length; i++) this._pool.push(this.list[i]);
      this.list.length = 0;
    }
  }

  // ============================================================
  // CHAIN (Verlet Rope Physics)
  // ============================================================

  class Chain {
    constructor() {
      this.n = CONFIG.CHAIN_SEGMENTS;
      this.segLen = CONFIG.CHAIN_MAX_LEN / this.n;
      this.pts = [];
      this.tension = 0;
      for (let i = 0; i <= this.n; i++) this.pts.push({ x: 0, y: 0, px: 0, py: 0 });
    }

    reset(x1, y1, x2, y2) {
      for (let i = 0; i <= this.n; i++) {
        const t = i / this.n;
        const x = lerp(x1, x2, t), y = lerp(y1, y2, t);
        this.pts[i] = { x, y, px: x, py: y };
      }
      this.tension = 0;
    }

    update(ax, ay, bx, by, platforms) {
      const pts = this.pts, n = this.n;
      // pin endpoints
      pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
      pts[n].x = bx; pts[n].y = by; pts[n].px = bx; pts[n].py = by;

      // verlet integration for inner points
      for (let i = 1; i < n; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * CONFIG.CHAIN_DAMP;
        const vy = (p.y - p.py) * CONFIG.CHAIN_DAMP;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + CONFIG.CHAIN_GRAVITY;
      }

      // chain-platform collision (ONCE per frame to prevent jitter)
      for (let i = 1; i < n; i++) {
        const p = pts[i];
        for (const pl of platforms) {
          if (pl.type === 'disappearing' && pl.gone) continue;
          if (p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y && p.y < pl.y + pl.h) {
            const oT = p.y - pl.y, oB = pl.y + pl.h - p.y;
            const oL = p.x - pl.x, oR = pl.x + pl.w - p.x;
            const m = Math.min(oT, oB, oL, oR);
            if (m === oT) { p.y = pl.y; p.px = p.x; p.py = p.y; }
            else if (m === oB) { p.y = pl.y + pl.h; p.px = p.x; p.py = p.y; }
            else if (m === oL) { p.x = pl.x; p.px = p.x; p.py = p.y; }
            else { p.x = pl.x + pl.w; p.px = p.x; p.py = p.y; }
          }
        }
      }

      // constraint solving
      for (let iter = 0; iter < CONFIG.CHAIN_ITERS; iter++) {
        pts[0].x = ax; pts[0].y = ay;
        pts[n].x = bx; pts[n].y = by;

        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (d - this.segLen) / d * 0.5;
          const ox = dx * diff, oy = dy * diff;
          if (i > 0) { a.x += ox; a.y += oy; }
          if (i + 1 < n) { b.x -= ox; b.y -= oy; }
        }
      }

      // tension metric
      const d = dist(ax, ay, bx, by);
      this.tension = clamp((d - CONFIG.CHAIN_MAX_LEN * 0.65) / (CONFIG.CHAIN_MAX_LEN * 0.35), 0, 1);
    }

    /** Returns forces to apply + optional hard clamp positions */
    forces(ax, ay, bx, by, aGnd, bGnd) {
      const dx = bx - ax, dy = by - ay;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const r = { a: { fx: 0, fy: 0 }, b: { fx: 0, fy: 0 }, taut: false };

      if (d > CONFIG.CHAIN_MAX_LEN) {
        r.taut = true;
        const nx = dx / d, ny = dy / d;
        const excess = d - CONFIG.CHAIN_MAX_LEN;
        const f = excess * CONFIG.CHAIN_PULL;

        if (aGnd && !bGnd) {
          r.b.fx = -nx * f * 2; r.b.fy = -ny * f * 2;
        } else if (bGnd && !aGnd) {
          r.a.fx = nx * f * 2; r.a.fy = ny * f * 2;
        } else {
          r.a.fx = nx * f; r.a.fy = ny * f;
          r.b.fx = -nx * f; r.b.fy = -ny * f;
        }

        // hard clamp if way over
        if (d > CONFIG.CHAIN_MAX_LEN + 8) {
          const over = (d - CONFIG.CHAIN_MAX_LEN) / d;
          if (aGnd && !bGnd) {
            r.b.cx = bx - dx * over; r.b.cy = by - dy * over;
          } else if (bGnd && !aGnd) {
            r.a.cx = ax + dx * over; r.a.cy = ay + dy * over;
          } else {
            r.a.cx = ax + dx * over * 0.5; r.a.cy = ay + dy * over * 0.5;
            r.b.cx = bx - dx * over * 0.5; r.b.cy = by - dy * over * 0.5;
          }
        }
      }
      return r;
    }

    draw(c, time, heat = 0) {
      let glow = this.tension > 0.3 ? COL.CHAIN_TAUT : COL.CHAIN;
      if (heat > 0) {
        const hPct = heat / CONFIG.CHAIN_SNAP_TIME;
        glow = hPct > 0.5 ? '#ff0000' : glow;
      }
      const blur = lerp(8, 22, this.tension);

      c.strokeStyle = glow; c.lineWidth = 3;
      c.shadowBlur = blur; c.shadowColor = glow;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(this.pts[0].x, this.pts[0].y);
      for (let i = 1; i <= this.n; i++) c.lineTo(this.pts[i].x, this.pts[i].y);
      c.stroke();

      // links
      c.fillStyle = glow;
      for (let i = 0; i <= this.n; i++) {
        c.beginPath(); c.arc(this.pts[i].x, this.pts[i].y, 2.5, 0, Math.PI * 2); c.fill();
      }
      c.shadowBlur = 0;
    }
  }

  // ============================================================
  // PLAYER
  // ============================================================

  class Player {
    constructor(id, color, ctrlLeft, ctrlRight, ctrlJump) {
      this.id = id; this.color = color;
      this.kL = ctrlLeft; this.kR = ctrlRight; this.kJ = ctrlJump;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.w = CONFIG.PLAYER_W; this.h = CONFIG.PLAYER_H;
      this.gnd = false; this.wasGnd = false;
      this.face = 1; this.inv = 0;
      this.atExit = false;
      this.animT = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    reset(x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.gnd = false; this.wasGnd = false; this.inv = CONFIG.INVINCIBILITY; this.atExit = false;
    }

    update(platforms, fx, fy, clampPos, particles, sound, wb, inputSource) {
      this.wasGnd = this.gnd;
      const inp = inputSource || keys;
      let mx = 0;
      if (inp[this.kL]) mx = -1;
      if (inp[this.kR]) mx = 1;
      if (mx) this.face = mx;

      // movement
      if (this.gnd) {
        if (mx) this.vx = mx * CONFIG.PLAYER_SPEED;
        else this.vx *= CONFIG.GROUND_FRICTION;
      } else {
        this.vx += mx * CONFIG.PLAYER_SPEED * CONFIG.AIR_CONTROL;
        this.vx *= CONFIG.AIR_DRAG;
        this.vx = clamp(this.vx, -CONFIG.PLAYER_SPEED * 1.2, CONFIG.PLAYER_SPEED * 1.2);
      }

      // jump
      const jumpPressed = inputSource ? inputSource[this.kJ] : consumeJustPressed(this.kJ);
      if (jumpPressed && this.gnd) {
        this.vy = CONFIG.JUMP_FORCE;
        this.gnd = false;
        sound.jump();
        particles.emit(this.cx, this.y + this.h, 8, this.color, { sMin: -2, sMax: 2, life: 18, sz: 3 });
      }

      // gravity
      this.vy += CONFIG.GRAVITY;
      if (this.vy > CONFIG.MAX_FALL_SPEED) this.vy = CONFIG.MAX_FALL_SPEED;

      // chain forces
      this.vx += fx; this.vy += fy;

      // move X → collide
      this.x += this.vx;
      this.gnd = false;
      this._collide(platforms, 'x');

      // move Y → collide
      this.y += this.vy;
      this._collide(platforms, 'y');

      // hard clamp from chain
      if (clampPos) {
        this.x = clampPos.cx - this.w / 2;
        this.y = clampPos.cy - this.h / 2;
      }

      // world bounds
      if (this.x < wb.x) { this.x = wb.x; this.vx = 0; }
      if (this.x + this.w > wb.x + wb.w) { this.x = wb.x + wb.w - this.w; this.vx = 0; }

      // fall off bottom
      if (this.y > wb.y + wb.h + 120) return 'death';

      // landing fx
      if (this.gnd && !this.wasGnd) {
        particles.emit(this.cx, this.y + this.h, 5, '#999', { sMin: -1.5, sMax: 1.5, life: 14, sz: 2 });
        sound.land();
      }

      // run particles
      if (this.gnd && Math.abs(this.vx) > 1.5 && Math.random() < 0.25) {
        particles.emit(this.cx - this.face * 8, this.y + this.h, 1, '#555', { sMin: -0.4, sMax: 0.4, life: 12, sz: 2 });
      }

      if (this.inv > 0) this.inv--;
      this.animT++;
      return null;
    }

    _collide(plats, axis) {
      for (const p of plats) {
        if (p.type === 'disappearing' && p.gone) continue;
        if (this.x < p.x + p.w && this.x + this.w > p.x &&
          this.y < p.y + p.h && this.y + this.h > p.y) {
          if (axis === 'x') {
            if (this.vx > 0) this.x = p.x - this.w;
            else if (this.vx < 0) this.x = p.x + p.w;
            this.vx = 0;
          } else {
            if (this.vy > 0) {
              this.y = p.y - this.h;
              this.gnd = true; this.vy = 0;
              // carry player with moving platform using pre-calculated delta
              if (p.type === 'moving') {
                this.x += p.platformDx || 0;
                this.y += p.platformDy || 0;
              }
              if (p.type === 'disappearing' && !p.triggered) {
                p.triggered = true; p.timer = 80;
              }
            } else if (this.vy < 0) {
              this.y = p.y + p.h; this.vy = 0;
            }
          }
        }
      }
    }

    hitHazard(hazards) {
      if (this.inv > 0) return false;
      for (const h of hazards) {
        if (this.x < h.x + h.w && this.x + this.w > h.x &&
          this.y < h.y + h.h && this.y + this.h > h.y) return true;
      }
      return false;
    }

    inExit(e) {
      return this.cx > e.x && this.cx < e.x + e.w && this.cy > e.y && this.cy < e.y + e.h;
    }

    draw(c, time) {
      c.save();
      if (this.inv > 0 && ((this.inv / 4 | 0) & 1)) c.globalAlpha = 0.35;

      const bob = this.gnd ? Math.sin(this.animT * 0.3) * 1.5 : 0;

      // body
      c.shadowBlur = 16; c.shadowColor = this.color;
      c.fillStyle = this.color;
      roundRect(c, this.x, this.y + bob, this.w, this.h, 7);
      c.fill();
      c.shadowBlur = 0;

      // visor / face
      const ex = this.face * 3, ey = this.y + 11 + bob;
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(this.cx - 4 + ex, ey, 3.5, 0, Math.PI * 2);
      c.arc(this.cx + 4 + ex, ey, 3.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(this.cx - 4 + ex + this.face * 1.5, ey, 1.8, 0, Math.PI * 2);
      c.arc(this.cx + 4 + ex + this.face * 1.5, ey, 1.8, 0, Math.PI * 2);
      c.fill();

      // label
      c.fillStyle = '#fff';
      c.font = '10px Orbitron, sans-serif';
      c.textAlign = 'center';
      c.fillText('P' + this.id, this.cx, this.y - 8 + bob);

      // exit check mark
      if (this.atExit) {
        c.fillStyle = COL.EXIT;
        c.shadowBlur = 10; c.shadowColor = COL.EXIT;
        c.font = '16px sans-serif';
        c.fillText('✔', this.cx, this.y - 20 + bob);
        c.shadowBlur = 0;
      }

      c.restore();
    }
  }

  // ============================================================
  // STARS (parallax background)
  // ============================================================

  class Stars {
    constructor(count) {
      this.s = [];
      for (let i = 0; i < count; i++) {
        this.s.push({
          x: rand(0, 3000), y: rand(-2000, 2000),
          sz: rand(0.5, 2.5), br: rand(0.3, 1), tw: rand(0.01, 0.04),
        });
      }
    }
    draw(c, cx, cy, t) {
      for (const s of this.s) {
        const px = 0.25;
        const sx = ((s.x - cx * px) % canvas.width + canvas.width) % canvas.width;
        const sy = ((s.y - cy * px) % canvas.height + canvas.height) % canvas.height;
        const a = s.br * (0.5 + (Math.sin(t * s.tw + s.x) + 1) * 0.25);
        c.globalAlpha = a; c.fillStyle = '#fff';
        c.beginPath(); c.arc(sx, sy, s.sz, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  // ============================================================
  // CAMERA
  // ============================================================

  class Camera {
    constructor() { this.x = 0; this.y = 0; this.sx = 0; this.sy = 0; this.si = 0; }

    follow(tx, ty, wb) {
      this.x = lerp(this.x, tx, CONFIG.CAM_LERP);
      this.y = lerp(this.y, ty, CONFIG.CAM_LERP);
      const hw = canvas.width / 2, hh = canvas.height / 2;
      this.x = clamp(this.x, wb.x + hw, wb.x + wb.w - hw);
      this.y = clamp(this.y, wb.y + hh, wb.y + wb.h - hh);

      if (this.si > 0) {
        this.sx = rand(-this.si, this.si); this.sy = rand(-this.si, this.si);
        this.si *= 0.88; if (this.si < 0.5) this.si = 0;
      } else { this.sx = 0; this.sy = 0; }
    }

    shake(v) { this.si = v; }

    apply(c) {
      c.translate(-this.x + canvas.width / 2 + this.sx, -this.y + canvas.height / 2 + this.sy);
    }
  }

  class Drone {
    constructor(x, y, min, max, spd) {
      this.x = x; this.y = y; this.w = 32; this.h = 28;
      this.min = min; this.max = max; this.spd = spd; this.dir = 1;
      this.dead = false; this.animT = rand(0, 100);
      this.detectTimer = 0;
      this.alertState = false;
      this.laserTarget = null;
      this.laserDrawTimer = 0;
      this.sweepAngle = 0;
    }

    checkDetection(players) {
      if (this.dead) return null;
      const range = 240;
      const halfCone = 0.26;
      const dy = this.y + Math.sin(this.animT * 0.1) * 3;
      const dcx = this.x + this.w / 2;
      const dcy = dy + this.h / 2;
      this.sweepAngle = Math.PI / 2 + Math.sin(this.animT * 0.035) * 0.45;

      for (const p of players) {
        if (p.inv > 0) continue;
        const pcx = p.cx;
        const pcy = p.cy;
        const distToPlayer = dist(dcx, dcy, pcx, pcy);

        if (distToPlayer <= range) {
          const angleToPlayer = Math.atan2(pcy - dcy, pcx - dcx);
          const diff = Math.atan2(Math.sin(angleToPlayer - this.sweepAngle), Math.cos(angleToPlayer - this.sweepAngle));
          if (Math.abs(diff) <= halfCone) {
            return p;
          }
        }
      }
      return null;
    }

    update(players, sound, particles, onPlayerHit) {
      if (this.dead) return;
      this.animT++;

      if (this.laserDrawTimer > 0) {
        this.laserDrawTimer--;
      }

      const detectedPlayer = this.checkDetection(players);

      if (detectedPlayer) {
        this.alertState = true;
        this.detectTimer++;

        if (this.detectTimer >= 22) {
          this.detectTimer = 0;
          this.laserTarget = { x: detectedPlayer.cx, y: detectedPlayer.cy };
          this.laserDrawTimer = 10;
          sound._osc('sawtooth', 880, 220, 0.25, 0.15);

          const dy = this.y + Math.sin(this.animT * 0.1) * 3;
          const dcx = this.x + this.w / 2;
          const dcy = dy + this.h / 2;
          const steps = 15;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = lerp(dcx, this.laserTarget.x, t);
            const py = lerp(dcy, this.laserTarget.y, t);
            particles.emit(px, py, 1, '#ff0033', { sMin: -1, sMax: 1, life: 15, sz: 2 });
          }

          onPlayerHit();
        } else {
          if (this.detectTimer === 1) {
            sound._osc('sine', 440, 880, 0.2, 0.08);
          }
        }
      } else {
        this.alertState = false;
        if (this.detectTimer > 0) this.detectTimer--;

        this.x += this.spd * this.dir;
        if (this.x <= this.min || this.x + this.w >= this.max) this.dir *= -1;
      }
    }

    draw(c) {
      if (this.dead) return;
      const bob = Math.sin(this.animT * 0.1) * 3;
      const dy = this.y + bob;
      const dcx = this.x + this.w / 2;
      const dcy = dy + this.h / 2;

      c.save();

      const range = 240;
      const halfCone = 0.26;
      const leftAngle = this.sweepAngle - halfCone;
      const rightAngle = this.sweepAngle + halfCone;

      const grad = c.createRadialGradient(dcx, dcy, 10, dcx, dcy, range);
      const coneColor = this.alertState ? 'rgba(255, 0, 50, ' : 'rgba(189, 0, 255, ';
      const alphaMult = this.alertState ? 0.35 + Math.sin(this.animT * 0.5) * 0.1 : 0.18 + Math.sin(this.animT * 0.2) * 0.05;
      grad.addColorStop(0, coneColor + alphaMult + ')');
      grad.addColorStop(0.5, coneColor + alphaMult * 0.5 + ')');
      grad.addColorStop(1, coneColor + '0)');

      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(dcx, dcy);
      c.arc(dcx, dcy, range, leftAngle, rightAngle);
      c.closePath();
      c.fill();

      c.strokeStyle = this.alertState ? 'rgba(255, 0, 50, 0.4)' : 'rgba(189, 0, 255, 0.25)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(dcx, dcy);
      c.lineTo(dcx + Math.cos(leftAngle) * range, dcy + Math.sin(leftAngle) * range);
      c.moveTo(dcx, dcy);
      c.lineTo(dcx + Math.cos(rightAngle) * range, dcy + Math.sin(rightAngle) * range);
      c.stroke();

      if (this.laserDrawTimer > 0 && this.laserTarget) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 4 + Math.random() * 4;
        c.shadowBlur = 20;
        c.shadowColor = '#ff0033';
        c.beginPath();
        c.moveTo(dcx, dcy);
        c.lineTo(this.laserTarget.x, this.laserTarget.y);
        c.stroke();

        c.strokeStyle = '#ff3366';
        c.lineWidth = 1;
        c.stroke();
        c.shadowBlur = 0;
      }

      c.translate(dcx, dcy);

      const ringRot = this.animT * 0.03;
      c.strokeStyle = '#00ffff';
      c.lineWidth = 2;
      c.shadowBlur = 6;
      c.shadowColor = '#00ffff';
      c.beginPath();
      c.arc(0, 0, 16, ringRot, ringRot + Math.PI * 0.4);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 16, ringRot + Math.PI, ringRot + Math.PI * 1.4);
      c.stroke();

      c.fillStyle = '#11052C';
      c.strokeStyle = '#bd00ff';
      c.lineWidth = 2;
      c.shadowColor = '#bd00ff';
      c.shadowBlur = 10;

      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + this.animT * 0.005;
        const rx = 13 * Math.cos(angle);
        const ry = 11 * Math.sin(angle);
        if (i === 0) c.moveTo(rx, ry);
        else c.lineTo(rx, ry);
      }
      c.closePath();
      c.fill();
      c.stroke();

      const eyeColor = this.alertState ? '#ff0033' : '#bd00ff';
      const eyeRadius = this.alertState ? 4 + Math.sin(this.animT * 0.8) * 1.5 : 3.5 + Math.sin(this.animT * 0.15) * 0.5;

      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, eyeRadius + 1, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = eyeColor;
      c.beginPath();
      c.arc(0, 0, eyeRadius, 0, Math.PI * 2);
      c.fill();

      c.restore();
    }
  }

  // ============================================================
  // MAIN GAME
  // ============================================================

  class Game {
    constructor() {
      this.state = STATE.MENU;
      this.stageIdx = 0;
      this.selectedStageIdx = 0;
      this.gameMode = 'multi';   // 'single' | 'multi'
      this.coopType = 'local';   // 'local' | 'online'

      // Client-side interpolation state (used by online client)
      this._interpState = null; // latest target from host
      this._inputSendTick = 0;  // throttle client input sends
      this.selectedMode = 1;     // 0=single 1=multi
      this.selectedCoopType = 0; // 0=local 1=online
      this.tick = 0;
      this.stageTime = 0;
      this.deaths = 0;
      this.totDeaths = 0;
      this.totTime = 0;
      this.deathCD = 0;
      this.introTimer = 0;
      this.menuBlink = 0;

      this.net = new NetSync(this);
      this.remoteClientKeys = {}; // Keys received from Client (Host side)

      this.snd = new SoundMgr();
      this.ptcl = new Particles();
      this.stars = new Stars(200);
      this.cam = new Camera();
      this.chain = new Chain();

      this.p1 = new Player(1, COL.P1, 'KeyA', 'KeyD', 'KeyW');
      this.p2 = new Player(2, COL.P2, 'ArrowLeft', 'ArrowRight', 'ArrowUp');

      this.drones = [];
      this.plats = [];
      this.haz = [];
      this.exit = {};
      this.wb = {};
      this.bg = ['#0a0a2e', '#1a0a3e'];

      this.fade = 0; this.fadeDir = 0; this.fadeCB = null;

      this._loop = this._loop.bind(this);
      this._lastTime = 0;
      this._accumulator = 0;
      this._fixedStep = 1000 / 60; // 16.667ms per physics tick
      requestAnimationFrame(this._loop);

      // Build touch UI after a short delay (DOM must be ready)
      if (IS_MOBILE) this._buildTouchUI();
      
      // Wire up Peer Network DOM buttons
      this._wireLobbyEvents();
    }

    _wireLobbyEvents() {
      const createBtn = document.getElementById('createRoomBtn');
      const joinBtn = document.getElementById('joinRoomBtn');
      const copyBtn = document.getElementById('copyCodeBtn');
      const backBtn = document.getElementById('lobbyBackBtn');
      
      if (createBtn) {
        createBtn.addEventListener('click', async () => {
          createBtn.disabled = true;
          createBtn.textContent = 'CREATING...';
          try {
            const code = await this.net.hostRoom();
            document.getElementById('displayRoomCode').textContent = code;
            document.getElementById('roomCodeContainer').classList.remove('hidden-element');
            document.getElementById('hostStatus').textContent = 'Waiting for Player 2 to join...';
          } catch (e) {
            alert('Failed to host: ' + e.message);
            createBtn.disabled = false;
            createBtn.textContent = 'CREATE ROOM';
          }
        });
      }

      if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
          const codeInput = document.getElementById('roomCodeInput');
          const code = codeInput ? codeInput.value.trim() : '';
          const status = document.getElementById('joinStatus');
          
          if (!code || code.length < 6) {
            if (status) status.textContent = 'ENTER A VALID 6-CHAR CODE';
            return;
          }
          
          if (status) status.textContent = '';
          joinBtn.disabled = true;
          document.getElementById('connectingOverlay').classList.remove('hidden');
          document.getElementById('connectingStatusMsg').textContent = 'Connecting to room ' + code.toUpperCase();
          
          try {
            await this.net.joinRoom(code);
          } catch (e) {
            document.getElementById('connectingOverlay').classList.add('hidden');
            joinBtn.disabled = false;
            if (status) status.textContent = 'FAILED TO JOIN: ' + e.message;
          }
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const code = document.getElementById('displayRoomCode').textContent;
          navigator.clipboard.writeText(code).then(() => {
            copyBtn.textContent = 'COPIED!';
            setTimeout(() => { copyBtn.textContent = 'COPY'; }, 2000);
          });
        });
      }

      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.net.disconnect();
          document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
          this.startFade(1, () => {
            this.state = STATE.COOP_TYPE_SELECT;
          });
        });
      }
    }

    // --- Multiplayer synchronization callbacks ---
    netLaunchGame() {
      // Host selects the stage
      this.state = STATE.STAGE_SELECT;
      this.selectedStageIdx = 0;
    }

    netLaunchStage(stageIdx) {
      document.getElementById('hud').classList.remove('hidden');
      this.loadStage(stageIdx);
    }

    netEnterWaiting() {
      // Client transitions to waiting screen after joining
      document.getElementById('multiplayerLobbyOverlay').classList.add('hidden');
      document.getElementById('connectingOverlay').classList.add('hidden');
      this.state = STATE.WAITING_HOST;
    }

    netSetClientKeys(clientKeys) {
      this.remoteClientKeys = clientKeys;
    }

    netApplyDeath(data) {
      // Client receives death event from host
      this.state = STATE.DYING;
      this.deaths = data.deaths;
      this.totDeaths = data.totDeaths;
      this.deathCD = data.deathCD;
      this.cam.shake(10);
      this.snd.death();
      this.ptcl.emit(this.p1.cx, this.p1.cy, 20, COL.P1, { sMin: -5, sMax: 5, life: 40, sz: 4 });
      this.ptcl.emit(this.p2.cx, this.p2.cy, 20, COL.P2, { sMin: -5, sMax: 5, life: 40, sz: 4 });
      document.getElementById('deathCount').textContent = this.deaths;
      if (IS_MOBILE) {
        const tctrl = document.getElementById('touchControls');
        if (tctrl) tctrl.style.display = 'none';
      }
    }

    netApplySyncFrame(data) {
      // Client-side interpolation: lerp toward target instead of snapping
      const LERP_SPEED = 0.45; // fast but smooth

      // Lerp player positions for smooth visuals
      this.p1.x = lerp(this.p1.x, data.p1.x, LERP_SPEED);
      this.p1.y = lerp(this.p1.y, data.p1.y, LERP_SPEED);
      this.p1.vx = data.p1.vx;
      this.p1.vy = data.p1.vy;
      this.p1.gnd = data.p1.gnd;
      this.p1.face = data.p1.face;
      this.p1.inv = data.p1.inv;
      this.p1.atExit = data.p1.atExit;

      this.p2.x = lerp(this.p2.x, data.p2.x, LERP_SPEED);
      this.p2.y = lerp(this.p2.y, data.p2.y, LERP_SPEED);
      this.p2.vx = data.p2.vx;
      this.p2.vy = data.p2.vy;
      this.p2.gnd = data.p2.gnd;
      this.p2.face = data.p2.face;
      this.p2.inv = data.p2.inv;
      this.p2.atExit = data.p2.atExit;

      // Sync platforms
      if (data.plats) {
        data.plats.forEach((pData, idx) => {
          if (this.plats[idx]) {
            this.plats[idx].x = pData.x;
            this.plats[idx].y = pData.y;
            this.plats[idx].gone = pData.gone;
            this.plats[idx].opacity = pData.opacity;
          }
        });
      }

      // Sync drones
      if (data.drones) {
        data.drones.forEach((dData, idx) => {
          if (this.drones[idx]) {
            this.drones[idx].x = dData.x;
            this.drones[idx].y = dData.y;
            this.drones[idx].dead = dData.dead;
            this.drones[idx].alertState = dData.alertState;
          }
        });
      }

      // Sync chain & environment metrics
      this.chainHeat = data.chainHeat;
      this.stageTime = data.stageTime;
      this.deaths = data.deaths;
      document.getElementById('deathCount').textContent = this.deaths;

      this.chain.tension = data.tension;
      if (data.pts) {
        data.pts.forEach((pt, idx) => {
          if (this.chain.pts[idx]) {
            this.chain.pts[idx].x = pt.x;
            this.chain.pts[idx].y = pt.y;
          }
        });
      }

      // Apply state (playing, dying, etc) from host
      this.state = data.state;
      if (this.state === STATE.DYING) {
        this.deathCD = data.deathCD;
      }

      // Camera follows midpoint on client too
      const mx = (this.p1.cx + this.p2.cx) / 2;
      const my = (this.p1.cy + this.p2.cy) / 2;
      this.cam.follow(mx, my, this.wb);
    }

    netConfirmStageWin() {
      this._stageWin();
    }

    // ---- Touch UI ----
    _buildTouchUI() {
      // Remove old overlay if re-called
      const old = document.getElementById('touchControls');
      if (old) old.remove();

      const isOnline = this.gameMode === 'multi' && this.coopType === 'online';
      const isLocalMulti = this.gameMode === 'multi' && this.coopType === 'local';
      const isSingle = this.gameMode === 'single';

      const ui = document.createElement('div');
      ui.id = 'touchControls';
      ui.className = (isSingle || isOnline) ? 'tc-solo' : '';

      if (isOnline) {
        // Online co-op: show only ONE set of controls (no P1/P2 label needed)
        // Both host and client use the same visual buttons, but they map to
        // different key codes so the right player gets controlled.
        const leftCode = this.net.isHost ? 'KeyA' : 'ArrowLeft';
        const rightCode = this.net.isHost ? 'KeyD' : 'ArrowRight';
        const jumpCode = this.net.isHost ? 'KeyW' : 'ArrowUp';
        const label = this.net.isHost ? 'P1' : 'P2';

        ui.innerHTML = `
          <div class="tc-side-left">
            <div class="tc-player-move" id="tcMyMove">
              <span class="tc-player-label">${label}</span>
              <div class="tc-row">
                <button class="tc-btn" id="tcMyL">&#9664;</button>
                <button class="tc-btn" id="tcMyR">&#9654;</button>
              </div>
            </div>
          </div>
          <div class="tc-side-right">
            <div class="tc-player-jump" id="tcMyJump">
              <span class="tc-player-label">${label}</span>
              <button class="tc-btn tc-jump" id="tcMyJ">&#9650;</button>
            </div>
          </div>
        `;
        document.body.appendChild(ui);
        _registerTouchBtn(document.getElementById('tcMyL'), leftCode);
        _registerTouchBtn(document.getElementById('tcMyR'), rightCode);
        _registerTouchBtn(document.getElementById('tcMyJ'), jumpCode);
      } else {
        // Single player or Local 2P: current behavior
        const multi = isLocalMulti;
        ui.innerHTML = `
          <div class="tc-side-left">
            <div class="tc-player-move" id="tcP1Move">
              <span class="tc-player-label">P1</span>
              <div class="tc-row">
                <button class="tc-btn" id="tcP1L">&#9664;</button>
                <button class="tc-btn" id="tcP1R">&#9654;</button>
              </div>
            </div>
            ${multi ? `
            <div class="tc-player-move" id="tcP2Move">
              <span class="tc-player-label">P2</span>
              <div class="tc-row">
                <button class="tc-btn" id="tcP2L">&#9664;</button>
                <button class="tc-btn" id="tcP2R">&#9654;</button>
              </div>
            </div>` : ''}
          </div>
          <div class="tc-side-right">
            <div class="tc-player-jump" id="tcP1Jump">
              <span class="tc-player-label">P1</span>
              <button class="tc-btn tc-jump" id="tcP1J">&#9650;</button>
            </div>
            ${multi ? `
            <div class="tc-player-jump" id="tcP2Jump">
              <span class="tc-player-label">P2</span>
              <button class="tc-btn tc-jump" id="tcP2J">&#9650;</button>
            </div>` : ''}
          </div>
        `;
        document.body.appendChild(ui);
        _registerTouchBtn(document.getElementById('tcP1L'), 'KeyA');
        _registerTouchBtn(document.getElementById('tcP1R'), 'KeyD');
        _registerTouchBtn(document.getElementById('tcP1J'), 'KeyW');
        if (multi) {
          _registerTouchBtn(document.getElementById('tcP2L'), 'ArrowLeft');
          _registerTouchBtn(document.getElementById('tcP2R'), 'ArrowRight');
          _registerTouchBtn(document.getElementById('tcP2J'), 'ArrowUp');
        }
      }
    }

    // --- stage loading ---
    loadStage(i) {
      const s = STAGES[i];
      this.stageIdx = i;
      this.plats = s.platforms.map(p => ({ ...p }));
      this.haz = s.hazards.map(h => ({ ...h }));
      // pre-cache hazard gradients to avoid per-frame allocations
      this.haz.forEach(h => {
        const lg = ctx.createLinearGradient(h.x, h.y, h.x, h.y + h.h);
        lg.addColorStop(0, 'rgba(255,80,0,0.7)');
        lg.addColorStop(0.5, 'rgba(255,30,0,0.56)');
        lg.addColorStop(1, 'rgba(200,0,0,0.42)');
        h.gradient = lg;
      });
      this.drones = (s.drones || []).map(d => new Drone(d.x, d.y, d.moveMin, d.moveMax, d.speed));
      this.exit = { ...s.exit };
      // pre-cache exit radial gradient
      const _e = this.exit;
      this.exitRadial = ctx.createRadialGradient(
        _e.x + _e.w / 2, _e.y + _e.h / 2, 0,
        _e.x + _e.w / 2, _e.y + _e.h / 2, _e.w / 2
      );
      this.exitRadial.addColorStop(0, 'rgba(0,255,102,0.25)');
      this.exitRadial.addColorStop(1, 'rgba(0,255,102,0)');
      this.wb = { ...s.world };
      this.bg = [...s.bg];
      this.bgGradient = null; // rebuilt on first render frame
      this.decorations = (s.decorations || []).map(d => ({ ...d }));

      this.p1.reset(s.spawn.a.x, s.spawn.a.y);
      this.p2.reset(s.spawn.b.x, s.spawn.b.y);
      this.chain.reset(this.p1.cx, this.p1.cy, this.p2.cx, this.p2.cy);

      this.cam.x = (this.p1.cx + this.p2.cx) / 2;
      this.cam.y = (this.p1.cy + this.p2.cy) / 2;

      this.stageTime = 0; this.deaths = 0; this.deathCD = 0;
      this.chainHeat = 0;
      this.ptcl.clear();

      // Ensure touch UI is created and visible/hidden appropriately
      if (IS_MOBILE) {
        this._buildTouchUI();
        const tctrl = document.getElementById('touchControls');
        if (tctrl) tctrl.style.display = 'none'; // Keep hidden during stage intro
      }

      // HUD
      const sn = document.getElementById('stageNum');
      const st = document.getElementById('stageTitle');
      if (sn) sn.textContent = `Stage ${i + 1}/${STAGES.length}`;
      if (st) st.textContent = s.name;
      document.getElementById('deathCount').textContent = '0';

      // show stage intro
      this._showIntro(s, i);
    }

    _showIntro(s, i) {
      this.state = STATE.INTRO;
      this.introTimer = 150; // ~2.5s
      const el = document.getElementById('stageIntroOverlay');
      document.getElementById('introStageNum').textContent = `STAGE ${i + 1}`;
      document.getElementById('introStageName').textContent = s.name;
      document.getElementById('introStageSubtitle').textContent = s.sub;
      el.classList.remove('hidden');
      el.classList.add('visible');
    }

    respawn() {
      const s = STAGES[this.stageIdx];
      this.p1.reset(s.spawn.a.x, s.spawn.a.y);
      this.p2.reset(s.spawn.b.x, s.spawn.b.y);
      this.chain.reset(this.p1.cx, this.p1.cy, this.p2.cx, this.p2.cy);
      this.drones = (STAGES[this.stageIdx].drones || []).map(d => new Drone(d.x, d.y, d.moveMin, d.moveMax, d.speed));
      // reset disappearing & moving platforms
      s.platforms.forEach((op, idx) => {
        const p = this.plats[idx];
        if (p.type === 'disappearing') {
          p.triggered = false; p.timer = 0; p.gone = false; p.opacity = 1;
        }
        if (p.type === 'moving') { p.x = op.x; p.y = op.y; }
      });
      this.deathCD = 0;
      this.chainHeat = 0;
      if (IS_MOBILE) {
        const tctrl = document.getElementById('touchControls');
        if (tctrl) tctrl.style.display = 'flex';
      }
    }

    startFade(dir, cb) {
      this.fadeDir = dir; this.fadeCB = cb;
      if (dir === 1) this.fade = 0; else this.fade = 1;
    }

    // --- loop ---
    _loop(timestamp) {
      const raw = timestamp - this._lastTime;
      // clamp delta to avoid spiral of death after tab switch
      const delta = Math.min(raw, 50);
      this._lastTime = timestamp;
      this._accumulator += delta;

      // run fixed physics ticks
      while (this._accumulator >= this._fixedStep) {
        this.tick++;
        this._updateFade();
        this._update();
        clearJustPressed();
        this._accumulator -= this._fixedStep;
      }

      // render once per animation frame
      this._render();
      requestAnimationFrame(this._loop);
    }

    _updateFade() {
      if (!this.fadeDir) return;
      this.fade += this.fadeDir * 0.035;
      if (this.fade >= 1 && this.fadeDir === 1) {
        this.fade = 1; this.fadeDir = 0;
        if (this.fadeCB) this.fadeCB();
        this.startFade(-1, null);
      }
      if (this.fade <= 0 && this.fadeDir === -1) { this.fade = 0; this.fadeDir = 0; }
    }

    _update() {
      this.ptcl.update();

      // Show/Hide touch UI depending on whether we are in active play
      if (IS_MOBILE) {
        const tctrl = document.getElementById('touchControls');
        if (tctrl) {
          if (this.state === STATE.PLAYING) {
            tctrl.style.display = 'flex';
          } else {
            tctrl.style.display = 'none';
          }
        }
      }

      switch (this.state) {
        case STATE.MENU: this._updateMenu(); break;
        case STATE.MODE_SELECT: this._updateModeSelect(); break;
        case STATE.COOP_TYPE_SELECT: this._updateCoopTypeSelect(); break;
        case STATE.STAGE_SELECT: this._updateStageSelect(); break;
        case STATE.WAITING_HOST: this._updateWaitingHost(); break;
        case STATE.INTRO: this._updateIntro(); break;
        case STATE.PLAYING: this._updatePlay(); break;
        case STATE.DYING: this._updateDying(); break;
        case STATE.STAGE_COMPLETE: this._updateComplete(); break;
        case STATE.GAME_OVER: this._updateGameOver(); break;
      }
    }

    _updateMenu() {
      this.menuBlink++;
      if (keys['Enter'] || keys['Space'] || keys['__TAP__']) {
        keys['__TAP__'] = false;
        this.snd.init();
        this.startFade(1, () => {
          this.state = STATE.MODE_SELECT;
        });
      }
    }

    _updateModeSelect() {
      this.menuBlink++;
      // Left / Right (or A/D) to switch mode
      if (consumeJustPressed('ArrowLeft') || consumeJustPressed('KeyA')) {
        this.selectedMode = 0; this.snd.land();
      }
      if (consumeJustPressed('ArrowRight') || consumeJustPressed('KeyD')) {
        this.selectedMode = 1; this.snd.land();
      }
      // Confirm
      if (consumeJustPressed('Enter') || consumeJustPressed('Space') || consumeJustPressed('__TAP__')) {
        this.gameMode = this.selectedMode === 0 ? 'single' : 'multi';
        this.startFade(1, () => {
          if (this.gameMode === 'multi') {
            this.state = STATE.COOP_TYPE_SELECT;
          } else {
            if (IS_MOBILE) this._buildTouchUI();
            this.state = STATE.STAGE_SELECT;
            this.selectedStageIdx = 0;
          }
        });
      }
      if (consumeJustPressed('Escape')) {
        this.startFade(1, () => { this.state = STATE.MENU; });
      }
    }

    _updateCoopTypeSelect() {
      this.menuBlink++;
      if (consumeJustPressed('ArrowLeft') || consumeJustPressed('KeyA')) {
        this.selectedCoopType = 0; this.snd.land();
      }
      if (consumeJustPressed('ArrowRight') || consumeJustPressed('KeyD')) {
        this.selectedCoopType = 1; this.snd.land();
      }
      if (consumeJustPressed('Enter') || consumeJustPressed('Space') || consumeJustPressed('__TAP__')) {
        this.coopType = this.selectedCoopType === 0 ? 'local' : 'online';
        
        this.startFade(1, () => {
          if (this.coopType === 'online') {
            // Display lobby overlay
            document.getElementById('multiplayerLobbyOverlay').classList.remove('hidden');
            // reset host fields
            document.getElementById('createRoomBtn').disabled = false;
            document.getElementById('createRoomBtn').textContent = 'CREATE ROOM';
            document.getElementById('roomCodeContainer').classList.add('hidden-element');
            document.getElementById('joinRoomBtn').disabled = false;
            document.getElementById('roomCodeInput').value = '';
            document.getElementById('joinStatus').textContent = '';
          } else {
            // Local 2-Player (single screen setup)
            if (IS_MOBILE) this._buildTouchUI();
            this.state = STATE.STAGE_SELECT;
            this.selectedStageIdx = 0;
          }
        });
      }
      if (consumeJustPressed('Escape')) {
        this.startFade(1, () => { this.state = STATE.MODE_SELECT; });
      }
    }

    _updateStageSelect() {
      this.menuBlink++;
      if (consumeJustPressed('ArrowLeft') || consumeJustPressed('KeyA')) {
        this.selectedStageIdx = (this.selectedStageIdx - 1 + STAGES.length) % STAGES.length;
        this.snd.land();
      }
      if (consumeJustPressed('ArrowRight') || consumeJustPressed('KeyD')) {
        this.selectedStageIdx = (this.selectedStageIdx + 1) % STAGES.length;
        this.snd.land();
      }
      if (consumeJustPressed('ArrowUp') || consumeJustPressed('KeyW')) {
        if (this.selectedStageIdx - 5 >= 0) {
          this.selectedStageIdx -= 5;
          this.snd.land();
        }
      }
      if (consumeJustPressed('ArrowDown') || consumeJustPressed('KeyS')) {
        if (this.selectedStageIdx + 5 < STAGES.length) {
          this.selectedStageIdx += 5;
          this.snd.land();
        }
      }
      if (consumeJustPressed('Escape')) {
        this.startFade(1, () => {
          this.state = this.gameMode === 'multi' ? STATE.COOP_TYPE_SELECT : STATE.MODE_SELECT;
        });
      }
      if (consumeJustPressed('Enter') || consumeJustPressed('Space') || consumeJustPressed('__TAP__')) {
        this.startFade(1, () => {
          document.getElementById('hud').classList.remove('hidden');
          this.loadStage(this.selectedStageIdx);
          // If in WebRTC online mode and we are the host, notify the guest client
          if (this.gameMode === 'multi' && this.coopType === 'online' && this.net.isHost) {
            let attempts = 0;
            const interval = setInterval(() => {
              if (this.net.conn && this.net.conn.open) {
                this.net.sendState({ type: 'launch', stageIdx: this.selectedStageIdx });
              }
              attempts++;
              if (attempts >= 4) clearInterval(interval);
            }, 100);
          }
        });
      }
    }

    _updateIntro() {
      // If we are in online mode and we are the client, the host will sync us to STATE.PLAYING.
      // But we can also let either player tap to skip.
      this.introTimer--;
      
      const skipIntro = this.introTimer <= 0 || keys['Enter'] || keys['Space'] || keys['__TAP__'];
      if (skipIntro) {
        keys['__TAP__'] = false;
        document.getElementById('stageIntroOverlay').classList.remove('visible');
        document.getElementById('stageIntroOverlay').classList.add('hidden');
        this.state = STATE.PLAYING;
      }
      
      // camera idle at spawn
      const midX = this.gameMode === 'multi' ? (this.p1.cx + this.p2.cx) / 2 : this.p1.cx;
      const midY = this.gameMode === 'multi' ? (this.p1.cy + this.p2.cy) / 2 : this.p1.cy;
      this.cam.follow(midX, midY, this.wb);
    }

    _updateWaitingHost() {
      // Client is waiting for the host to select a level
      this.menuBlink++;
      // Nothing to do — just animate the waiting screen
      // The host will send a 'launch' message when ready
    }

    _updatePlay() {
          // ---- ONLINE CLIENT: prediction + interpolation (ZERO LAG) ----
      if (this.gameMode === 'multi' && this.coopType === 'online' && !this.net.isHost) {
        this.net.updateInterpolation();
        this._inputSendTick++;
        if (this._inputSendTick >= 2) {
          this._inputSendTick = 0;
          this.net.sendState({
            type: 'input',
            keys: { ArrowLeft: !!keys['ArrowLeft'], ArrowRight: !!keys['ArrowRight'], ArrowUp: !!keys['ArrowUp'] },
            seq: ++this.net.prediction.sequenceNumber
          });
        }
        const p2Input = { 'ArrowLeft': !!keys['ArrowLeft'], 'ArrowRight': !!keys['ArrowRight'], 'ArrowUp': !!keys['ArrowUp'] };
        this.p2.update(this.plats, 0, 0, null, this.ptcl, this.snd, this.wb, p2Input);
        const mx = (this.net.interp.renderX + CONFIG.PLAYER_W/2 + this.p2.cx) / 2;
        const my = (this.net.interp.renderY + CONFIG.PLAYER_H/2 + this.p2.cy) / 2;
        this.cam.follow(mx, my, this.wb);
        this.ptcl.update();
        return;
      }

      this.stageTime++;

      // update moving / disappearing platforms
      for (const p of this.plats) {
        if (p.type === 'moving') {
          if (p.moveAxis === 'x') {
            p.x += p.moveSpeed * p._dir;
            if (p.x <= p.moveMin) { p.x = p.moveMin; p._dir = 1; }
            else if (p.x >= p.moveMax) { p.x = p.moveMax; p._dir = -1; }
            p.platformDx = p.moveSpeed * p._dir;
            p.platformDy = 0;
          } else {
            p.y += p.moveSpeed * p._dir;
            if (p.y <= p.moveMin) { p.y = p.moveMin; p._dir = 1; }
            else if (p.y >= p.moveMax) { p.y = p.moveMax; p._dir = -1; }
            p.platformDx = 0;
            p.platformDy = p.moveSpeed * p._dir;
          }
        }
        if (p.type === 'disappearing' && p.triggered) {
          if (!p.gone) {
            p.timer--;
            p.opacity = clamp(p.timer / 30, 0, 1);
            if (p.timer <= 0) { p.gone = true; p.opacity = 0; p.respawnTimer = 120; }
          } else {
            p.respawnTimer--;
            if (p.respawnTimer <= 0) {
              p.triggered = false;
              p.gone = false;
              p.opacity = 1;
              p.timer = 0;
            }
          }
        }
      }

      const isSingle = this.gameMode === 'single';
      const isOnlineHost = this.gameMode === 'multi' && this.coopType === 'online' && this.net.isHost;

      // chain forces (multiplayer only)
      let cf = null;
      if (!isSingle) {
        cf = this.chain.forces(
          this.p1.cx, this.p1.cy, this.p2.cx, this.p2.cy,
          this.p1.gnd, this.p2.gnd
        );
      }

      // ---- Build input sources ----
      // P1 always reads from local keys (WASD or Arrows — both work for P1)
      // In online mode, the Host's local keys control P1. Arrow keys are
      // also mapped to P1 so the host can use either WASD or Arrows.
      let p1Input = null; // null = use default global keys
      let p2Input = null;

      if (isOnlineHost) {
        // Host controls P1: merge both WASD and Arrow keys into P1's keycodes
        p1Input = {
          'KeyA': !!(keys['KeyA'] || keys['ArrowLeft']),
          'KeyD': !!(keys['KeyD'] || keys['ArrowRight']),
          'KeyW': !!(keys['KeyW'] || keys['ArrowUp'])
        };
        // P2 is controlled by remote client inputs
        const rk = this.remoteClientKeys;
        p2Input = {
          'ArrowLeft': !!(rk.ArrowLeft),
          'ArrowRight': !!(rk.ArrowRight),
          'ArrowUp': !!(rk.ArrowUp)
        };
      }

      // Update P1
      const r1 = this.p1.update(this.plats,
        cf ? cf.a.fx : 0, cf ? cf.a.fy : 0,
        cf && cf.a.cx !== undefined ? { cx: cf.a.cx, cy: cf.a.cy } : null,
        this.ptcl, this.snd, this.wb, p1Input);

      // Update P2 (multiplayer only)
      let r2 = null;
      if (!isSingle) {
        r2 = this.p2.update(this.plats,
          cf.b.fx, cf.b.fy,
          cf.b.cx !== undefined ? { cx: cf.b.cx, cy: cf.b.cy } : null,
          this.ptcl, this.snd, this.wb, p2Input);
      }

      // update drones
      const activePlayers = isSingle ? [this.p1] : [this.p1, this.p2];
      for (const d of this.drones) {
        if (d.dead) continue;
        d.update(activePlayers, this.snd, this.ptcl, () => this._die());
        const checkHit = (p) => {
          const dy = d.y + Math.sin(d.animT * 0.1) * 3;
          if (p.x < d.x + d.w && p.x + p.w > d.x && p.y < dy + d.h && p.y + p.h > dy) {
            if (p.vy > 0 && p.y + p.h - p.vy <= dy + 10) {
              p.vy = CONFIG.JUMP_FORCE * 1.1; p.gnd = false; d.dead = true;
              this.ptcl.emit(d.x + d.w / 2, dy + d.h / 2, 15, '#ff0033', { sMin: -3, sMax: 3, life: 30, sz: 3 });
              this.snd.jump();
              return 'bounce';
            } else {
              return 'death';
            }
          }
          return null;
        };
        const hit1 = checkHit(this.p1);
        const hit2 = !isSingle && checkHit(this.p2);
        if (hit1 === 'death' || hit2 === 'death') { this._die(); return; }
      }

      // death checks
      const chainSnap = !isSingle && (this.chainHeat || 0) >= CONFIG.CHAIN_SNAP_TIME;
      if (r1 === 'death' || (!isSingle && r2 === 'death') ||
        this.p1.hitHazard(this.haz) || (!isSingle && this.p2.hitHazard(this.haz)) ||
        chainSnap) {
        this._die(); return;
      }

      // chain update (multiplayer only)
      if (!isSingle) {
        this.chain.update(this.p1.cx, this.p1.cy, this.p2.cx, this.p2.cy, this.plats);
        if (this.chain.tension > 0.6) {
          this.chainHeat = (this.chainHeat || 0) + 1;
          if (this.tick % 30 === 0) this.snd.taut();
        } else {
          this.chainHeat = Math.max(0, (this.chainHeat || 0) - 2);
        }
      }

      // exit check
      this.p1.atExit = this.p1.inExit(this.exit);
      if (isSingle) {
        if (this.p1.atExit) this._stageWin();
      } else {
        this.p2.atExit = this.p2.inExit(this.exit);
        if (this.p1.atExit && this.p2.atExit) this._stageWin();
      }

      // camera follows midpoint (multi) or P1 (single)
      const mx = isSingle ? this.p1.cx : (this.p1.cx + this.p2.cx) / 2;
      const my = isSingle ? this.p1.cy : (this.p1.cy + this.p2.cy) / 2;
      this.cam.follow(mx, my, this.wb);

      // ---- Host → Client sync (throttled to every 3rd tick) ----
      if (isOnlineHost) {
        this.net.trySendSync({
          type: 'sync',
          state: this.state,
          deathCD: this.deathCD,
          stageTime: this.stageTime,
          deaths: this.deaths,
          chainHeat: this.chainHeat,
          tension: this.chain.tension,
          p1: {
            x: this.p1.x, y: this.p1.y, vx: this.p1.vx, vy: this.p1.vy,
            gnd: this.p1.gnd, face: this.p1.face, inv: this.p1.inv, atExit: this.p1.atExit
          },
          p2: {
            x: this.p2.x, y: this.p2.y, vx: this.p2.vx, vy: this.p2.vy,
            gnd: this.p2.gnd, face: this.p2.face, inv: this.p2.inv, atExit: this.p2.atExit
          },
          plats: this.plats.map(p => ({ x: p.x, y: p.y, gone: p.gone, opacity: p.opacity })),
          drones: this.drones.map(d => ({ x: d.x, y: d.y, dead: d.dead, alertState: d.alertState })),
          pts: this.chain.pts.map(pt => ({ x: pt.x, y: pt.y }))
        });
      }
    }

    _die() {
      this.state = STATE.DYING;
      this.deaths++; this.totDeaths++;
      this.deathCD = CONFIG.DEATH_COOLDOWN;
      this.cam.shake(10);
      this.snd.death();
      this.ptcl.emit(this.p1.cx, this.p1.cy, 20, COL.P1, { sMin: -5, sMax: 5, life: 40, sz: 4 });
      if (this.gameMode === 'multi') {
        this.ptcl.emit(this.p2.cx, this.p2.cy, 20, COL.P2, { sMin: -5, sMax: 5, life: 40, sz: 4 });
      }
      document.getElementById('deathCount').textContent = this.deaths;
      if (IS_MOBILE) {
        const tctrl = document.getElementById('touchControls');
        if (tctrl) tctrl.style.display = 'none';
      }
    }

    _updateDying() {
      this.deathCD--;
      const mx = this.gameMode === 'single' ? this.p1.cx : (this.p1.cx + this.p2.cx) / 2;
      const my = this.gameMode === 'single' ? this.p1.cy : (this.p1.cy + this.p2.cy) / 2;
      this.cam.follow(mx, my, this.wb);
      if (this.deathCD <= 0) { this.respawn(); this.state = STATE.PLAYING; }
    }

    _stageWin() {
      this.state = STATE.STAGE_COMPLETE;
      this.totTime += this.stageTime;
      this.snd.complete();

      const el = document.getElementById('stageCompleteOverlay');
      document.getElementById('completeStageName').textContent = STAGES[this.stageIdx].name;
      document.getElementById('completeTime').textContent = this._fmtTime(this.stageTime);
      document.getElementById('completeDeaths').textContent = this.deaths;
      el.classList.remove('hidden'); el.classList.add('visible');
    }

    _updateComplete() {
      // celebration particles
      if (this.tick % 12 === 0) {
        this.ptcl.emit(this.exit.x + this.exit.w / 2 + rand(-20, 20),
          this.exit.y + rand(-10, 10), 4, COL.EXIT, { sMin: -2, sMax: 2, life: 30, sz: 3 });
      }

      // Online client cannot proceed without host
      if (this.gameMode === 'multi' && this.coopType === 'online' && !this.net.isHost) {
        return;
      }

      if (keys['Enter'] || keys['Space'] || keys['__TAP__']) {
        keys['__TAP__'] = false;
        
        // Notify client to clear overlay
        if (this.gameMode === 'multi' && this.coopType === 'online' && this.net.isHost) {
          this.net.sendState({ type: 'complete_confirm' });
        }

        const el = document.getElementById('stageCompleteOverlay');
        el.classList.remove('visible'); el.classList.add('hidden');

        if (this.stageIdx + 1 < STAGES.length) {
          this.startFade(1, () => { this.loadStage(this.stageIdx + 1); });
        } else {
          // game complete!
          this.state = STATE.GAME_OVER;
          const gel = document.getElementById('gameCompleteOverlay');
          document.getElementById('totalTime').textContent = this._fmtTime(this.totTime);
          document.getElementById('totalDeaths').textContent = this.totDeaths;
          gel.classList.remove('hidden'); gel.classList.add('visible');
        }
      }
    }

    _updateGameOver() {
      // fireworks
      if (this.tick % 8 === 0) {
        const x = rand(100, canvas.width - 100);
        this.ptcl.emit(x, canvas.height, 10,
          [COL.P1, COL.P2, COL.CHAIN, COL.EXIT][Math.random() * 4 | 0],
          { sMin: -3, sMax: 3, life: 55, sz: 4 });
      }
      if (keys['KeyR']) {
        document.getElementById('gameCompleteOverlay').classList.remove('visible');
        document.getElementById('gameCompleteOverlay').classList.add('hidden');
        this.totDeaths = 0; this.totTime = 0;
        this.startFade(1, () => { this.loadStage(0); });
      }
    }

    _fmtTime(f) {
      const s = (f / 60) | 0;
      return `${(s / 60) | 0}:${(s % 60).toString().padStart(2, '0')}`;
    }

    // ============================================================
    // RENDERING
    // ============================================================

    _render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (this.state === STATE.MENU) { this._renderMenu(); }
      else if (this.state === STATE.MODE_SELECT) { this._renderModeSelect(); }
      else if (this.state === STATE.COOP_TYPE_SELECT) { this._renderCoopTypeSelect(); }
      else if (this.state === STATE.STAGE_SELECT) { this._renderStageSelect(); }
      else if (this.state === STATE.WAITING_HOST) { this._renderWaitingHost(); }
      else { this._renderGame(); }

      // fade
      if (this.fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    _renderWaitingHost() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#05051a'); g.addColorStop(1, '#11052C');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.stars.draw(ctx, 0, 0, this.tick);
      
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 24px Orbitron, sans-serif';
      
      // blinking text effect
      const alpha = 0.5 + Math.sin(this.tick * 0.08) * 0.5;
      ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
      ctx.fillText('CONNECTED! WAITING FOR HOST TO SELECT LEVEL...', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }

    _renderStageSelect() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#05051a'); g.addColorStop(1, '#11052C');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

      this.stars.draw(ctx, 0, 0, this.tick);

      const cx = canvas.width / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px Orbitron, sans-serif';
      ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';
      ctx.fillText('SELECT MISSION', cx, 65);
      ctx.restore();

      // Card layout optimization
      let cols = 5;
      let cardW = 140;
      let cardH = 180;
      let gapX = 16;
      let gapY = 14;

      // Adapt grid sizes dynamically for mobile screen widths
      if (canvas.width < 800) {
        cardW = 100;
        cardH = 135;
        gapX = 10;
        gapY = 10;
      }
      
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = (canvas.width - totalW) / 2;
      const cardY = (canvas.height - (2 * cardH + gapY)) / 2 + 10;

      // Keep layout definitions on the instance so the touch controller can locate card boundaries
      this._stageLayout = { startX, cardY, cardW, cardH, gapX, gapY, cols };

      const stageColors = [
        '#00e5ff', '#bd00ff', '#00ffc8', '#ff3300', '#ffd700',
        '#33aa55', '#9e6d42', '#ff00aa', '#00e5ff', '#bd00ff'
      ];

      for (let i = 0; i < STAGES.length; i++) {
        const s = STAGES[i];
        const isSelected = this.selectedStageIdx === i;
        const col = stageColors[i % stageColors.length];

        const row = Math.floor(i / cols);
        const colIdx = i % cols;
        const x = startX + colIdx * (cardW + gapX);
        const bob = isSelected ? Math.sin(this.tick * 0.12) * 4 : 0;
        const cy = cardY + row * (cardH + gapY) + bob;

        ctx.save();

        if (isSelected) {
          ctx.shadowBlur = 25;
          ctx.shadowColor = col;
        } else {
          ctx.shadowBlur = 6;
          ctx.shadowColor = 'rgba(255,255,255,0.03)';
        }

        ctx.fillStyle = isSelected ? '#1c0c3a' : '#0c0721';
        ctx.strokeStyle = isSelected ? col : '#2a1a4a';
        ctx.lineWidth = isSelected ? 3.0 : 1.2;

        roundRect(ctx, x, cy, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)';
        ctx.font = `bold ${cardW > 110 ? '54px' : '38px'} Orbitron, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText((i + 1).toString().padStart(2, '0'), x + cardW - 10, cy + (cardW > 110 ? 55 : 40));

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${cardW > 110 ? '13px' : '10px'} Orbitron, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(s.name.toUpperCase(), x + 10, cy + (cardW > 110 ? 85 : 65));

        ctx.fillStyle = '#8888aa';
        ctx.font = `${cardW > 110 ? '10px' : '8px'} Rajdhani, sans-serif`;
        ctx.fillText(s.sub, x + 10, cy + (cardW > 110 ? 102 : 80));

        ctx.strokeStyle = isSelected ? col + '66' : '#332255';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 10, cy + (cardW > 110 ? 115 : 90), cardW - 20, cardW > 110 ? 40 : 25);

        ctx.fillStyle = isSelected ? col + '22' : '#22153c';
        const lineY = cy + (cardW > 110 ? 0 : -20);
        if (i === 0) {
          ctx.fillRect(x + 18, lineY + 140, 30, 6);
          ctx.fillRect(x + 60, lineY + 130, 20, 6);
          ctx.fillRect(x + 100, lineY + 140, 30, 6);
        } else if (i === 1) {
          ctx.fillRect(x + 18, lineY + 140, 35, 6);
          ctx.fillRect(x + 95, lineY + 140, 35, 6);
        } else if (i === 2) {
          ctx.fillRect(x + 35, lineY + 142, 20, 3);
          ctx.fillRect(x + 75, lineY + 132, 20, 3);
          ctx.fillRect(x + 45, lineY + 122, 20, 3);
        } else if (i === 3) {
          ctx.fillRect(x + 18, lineY + 140, 25, 6);
          ctx.fillRect(x + 60, lineY + 140, 25, 6);
          ctx.fillRect(x + 105, lineY + 140, 25, 6);
          ctx.fillStyle = '#ff3300';
          ctx.fillRect(x + 46, lineY + 146, 12, 3);
        } else if (i === 4) {
          ctx.fillRect(x + 18, lineY + 142, 30, 4);
          ctx.fillRect(x + 85, lineY + 125, 30, 4);
          ctx.fillRect(x + 55, lineY + 117, 35, 4);
        } else if (i === 5) {
          ctx.fillStyle = '#33aa55';
          ctx.fillRect(x + 18, lineY + 140, 40, 6);
          ctx.fillRect(x + 85, lineY + 140, 40, 6);
        } else if (i === 6) {
          ctx.fillStyle = '#9e6d42';
          ctx.fillRect(x + 18, lineY + 142, 20, 6);
          ctx.fillRect(x + 50, lineY + 134, 20, 6);
          ctx.fillRect(x + 80, lineY + 126, 20, 6);
        } else if (i === 7) {
          ctx.fillStyle = '#ff00aa';
          ctx.fillRect(x + 18, lineY + 136, 15, 4);
          ctx.fillRect(x + 60, lineY + 130, 15, 4);
          ctx.fillRect(x + 100, lineY + 138, 20, 4);
        } else if (i === 8) {
          ctx.fillStyle = '#00e5ff';
          ctx.fillRect(x + 18, lineY + 140, 25, 6);
          ctx.fillRect(x + 105, lineY + 140, 25, 6);
          ctx.fillRect(x + 55, lineY + 125, 40, 4);
        } else {
          ctx.fillStyle = '#bd00ff';
          ctx.fillRect(x + 18, lineY + 144, 25, 4);
          ctx.fillRect(x + 105, lineY + 144, 25, 4);
          ctx.fillRect(x + 60, lineY + 130, 30, 4);
        }

        let badgeY = cy + (cardW > 110 ? 168 : 120);
        const badgeW = cardW > 110 ? 62 : 40;
        const badgeH = cardW > 110 ? 14 : 10;
        const fontSize = cardW > 110 ? '8px' : '6px';
        const fontOffset = cardW > 110 ? 10 : 8;

        if (s.drones && s.drones.length > 0) {
          ctx.fillStyle = 'rgba(255,0,50,0.15)';
          ctx.strokeStyle = '#ff0033';
          ctx.lineWidth = 1;
          roundRect(ctx, x + 8, badgeY, badgeW, badgeH, 3);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff3366';
          ctx.font = `bold ${fontSize} Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('DRONES', x + 8 + badgeW / 2, badgeY + fontOffset);
        }

        if (s.hazards && s.hazards.length > 0) {
          const hOffset = (s.drones && s.drones.length > 0) ? (8 + badgeW + (cardW > 110 ? 8 : 4)) : 8;
          ctx.fillStyle = 'rgba(255,80,0,0.15)';
          ctx.strokeStyle = '#ff5500';
          ctx.lineWidth = 1;
          roundRect(ctx, x + hOffset, badgeY, badgeW, badgeH, 3);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff6600';
          ctx.font = `bold ${fontSize} Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('HAZARDS', x + hOffset + badgeW / 2, badgeY + fontOffset);
        }

        ctx.restore();
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '13px Orbitron, sans-serif';
      ctx.fillStyle = '#777799';
      ctx.fillText('Use  [WASD]  or  [ARROW KEYS]  to Navigate', cx, cardY + 2 * cardH + gapY + 22);
      if ((this.menuBlink / 24 | 0) & 1) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px Orbitron, sans-serif';
        ctx.fillText('Press ENTER to Launch Mission', cx, cardY + 2 * cardH + gapY + 48);
      }
      ctx.fillStyle = '#555577';
      ctx.font = '11px Orbitron, sans-serif';
      ctx.fillText('Press ESC to Return to Title', cx, cardY + 2 * cardH + gapY + 70);
      ctx.restore();
    }

    // --- MENU ---
    _renderMenu() {
      // bg
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#0a0a2e'); g.addColorStop(1, '#1a0a3e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.stars.draw(ctx, 0, 0, this.tick);

      const cx = canvas.width / 2, cy = canvas.height / 2;

      // title
      ctx.save();
      ctx.textAlign = 'center';
      ctx.shadowBlur = 35; ctx.shadowColor = '#ffd700';
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 58px Orbitron, sans-serif';
      ctx.fillText('CHAINED', cx, cy - 85);
      ctx.shadowColor = '#00e5ff'; ctx.fillStyle = '#00e5ff';
      ctx.fillText('TOGETHER', cx, cy - 22);
      ctx.restore();

      // subtitle
      ctx.fillStyle = '#777'; ctx.font = '16px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A 2-Player Cooperative Platformer', cx, cy + 24);

      // mini chars + chain
      const chainY = cy + 85;
      const ax = cx - 110, bx = cx + 110;
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = COL.P1; ctx.fillStyle = COL.P1;
      roundRect(ctx, ax - 10, chainY - 16, 20, 32, 5); ctx.fill();
      ctx.shadowColor = COL.P2; ctx.fillStyle = COL.P2;
      roundRect(ctx, bx - 10, chainY - 16, 20, 32, 5); ctx.fill();
      ctx.restore();

      ctx.strokeStyle = COL.CHAIN; ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10; ctx.shadowColor = COL.CHAIN;
      ctx.beginPath(); ctx.moveTo(ax, chainY);
      for (let t = 0; t <= 1; t += 0.04) {
        const x = lerp(ax, bx, t);
        const sag = Math.sin(t * Math.PI) * 28 + Math.sin(this.tick * 0.03 + t * 5) * 4;
        ctx.lineTo(x, chainY + sag);
      }
      ctx.stroke(); ctx.shadowBlur = 0;

      // controls hint (keyboard only on desktop)
      const ctrlY = cy + 165;
      if (!IS_MOBILE) {
        ctx.font = '14px Orbitron, sans-serif';
        ctx.fillStyle = COL.P1;
        ctx.fillText('Player 1 :  W  A  D', cx - 160, ctrlY);
        ctx.fillStyle = COL.P2;
        ctx.fillText('Player 2 :  ↑  ←  →', cx + 160, ctrlY);
      }

      // prompt
      if ((this.menuBlink / 28 | 0) & 1) {
        ctx.fillStyle = '#fff'; ctx.font = '17px Orbitron, sans-serif';
        ctx.fillText(IS_MOBILE ? 'TAP  TO  START' : 'Press ENTER to Start', cx, ctrlY + (IS_MOBILE ? 20 : 55));
      }
    }

    // --- MODE SELECT ---
    _renderModeSelect() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#0a0a2e'); g.addColorStop(1, '#1a0520');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.stars.draw(ctx, 0, 0, this.tick);

      const cxs = canvas.width / 2;
      const cys = canvas.height / 2;

      // Title
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Orbitron, sans-serif';
      ctx.shadowBlur = 20; ctx.shadowColor = '#ffd700';
      ctx.fillText('SELECT  MODE', cxs, cys - 155);
      ctx.shadowBlur = 0;
      ctx.restore();

      // Two mode cards
      const cardW = Math.min(200, canvas.width * 0.38);
      const cardH = 220;
      const gap   = Math.min(40, canvas.width * 0.06);
      const card0X = cxs - gap / 2 - cardW;  // SOLO
      const card1X = cxs + gap / 2;           // CO-OP
      const cardY  = cys - cardH / 2 - 10;

      const modes = [
        { label: 'SOLO',   sub: 'One player,\none goal',  col: COL.P1, idx: 0 },
        { label: 'CO-OP',  sub: 'Two players,\none chain', col: COL.P2, idx: 1 },
      ];

      modes.forEach((m, i) => {
        const x   = i === 0 ? card0X : card1X;
        const sel = this.selectedMode === m.idx;
        const bob = sel ? Math.sin(this.tick * 0.12) * 5 : 0;
        const y   = cardY + bob;

        ctx.save();
        ctx.shadowBlur = sel ? 30 : 6;
        ctx.shadowColor = sel ? m.col : 'rgba(255,255,255,0.04)';
        ctx.fillStyle = sel ? '#180830' : '#0c0720';
        ctx.strokeStyle = sel ? m.col : '#2a1a4a';
        ctx.lineWidth = sel ? 3 : 1.2;
        roundRect(ctx, x, y, cardW, cardH, 14);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon area
        const iconCX = x + cardW / 2;
        const iconY  = y + 62;

        if (m.idx === 0) {
          // Single character
          ctx.shadowBlur = 14; ctx.shadowColor = m.col;
          ctx.fillStyle = m.col;
          roundRect(ctx, iconCX - 14, iconY - 24, 28, 38, 7); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // Two characters + chain
          const p1x = iconCX - 36, p2x = iconCX + 10;
          ctx.shadowBlur = 10; ctx.shadowColor = COL.P1;
          ctx.fillStyle = COL.P1;
          roundRect(ctx, p1x, iconY - 24, 24, 34, 6); ctx.fill();
          ctx.shadowColor = COL.P2; ctx.fillStyle = COL.P2;
          roundRect(ctx, p2x, iconY - 24, 24, 34, 6); ctx.fill();
          ctx.shadowBlur = 0;
          // chain
          ctx.strokeStyle = COL.CHAIN; ctx.lineWidth = 2;
          ctx.shadowBlur = 6; ctx.shadowColor = COL.CHAIN;
          ctx.beginPath();
          for (let t = 0; t <= 1; t += 0.1) {
            const px = lerp(p1x + 24, p2x, t);
            const py = iconY - 8 + Math.sin(t * Math.PI) * 10 + Math.sin(this.tick * 0.04 + t * 4) * 3;
            t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke(); ctx.shadowBlur = 0;
        }

        // Label
        ctx.textAlign = 'center';
        ctx.fillStyle = sel ? m.col : 'rgba(255,255,255,0.7)';
        ctx.font = `bold 22px Orbitron, sans-serif`;
        ctx.shadowBlur = sel ? 12 : 0; ctx.shadowColor = m.col;
        ctx.fillText(m.label, iconCX, y + 130);
        ctx.shadowBlur = 0;

        // Sub
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px Rajdhani, sans-serif';
        m.sub.split('\n').forEach((line, li) => {
          ctx.fillText(line, iconCX, y + 155 + li * 16);
        });

        // Selected indicator
        if (sel) {
          ctx.fillStyle = m.col;
          ctx.shadowBlur = 8; ctx.shadowColor = m.col;
          ctx.beginPath();
          ctx.arc(iconCX, y + cardH - 18, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      });

      // Navigation hints
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '12px Orbitron, sans-serif';
      const hintY = cardY + cardH + 36;
      if (IS_MOBILE) {
        ctx.fillText('TAP A CARD  ·  ENTER to confirm', cxs, hintY);
      } else {
        ctx.fillText('← → to select   ·   ENTER to confirm   ·   ESC to go back', cxs, hintY);
      }
      if ((this.menuBlink / 24 | 0) & 1) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillText('Press ENTER / Tap to Play', cxs, hintY + 28);
      }
      ctx.restore();
    }

    // --- COOP TYPE SELECT ---
    _renderCoopTypeSelect() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#0a0a2e'); g.addColorStop(1, '#05182a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.stars.draw(ctx, 0, 0, this.tick);

      const cxs = canvas.width / 2;
      const cys = canvas.height / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Orbitron, sans-serif';
      ctx.shadowBlur = 20; ctx.shadowColor = '#ffd700';
      ctx.fillText('SELECT  CO-OP  TYPE', cxs, cys - 155);
      ctx.shadowBlur = 0;
      ctx.restore();

      const cardW = Math.min(220, canvas.width * 0.38);
      const cardH = 220;
      const gap = Math.min(40, canvas.width * 0.06);
      const card0X = cxs - gap / 2 - cardW;
      const card1X = cxs + gap / 2;
      const cardY = cys - cardH / 2 - 10;

      const types = [
        { label: 'LOCAL 2P', sub: 'Play on this device\nShared controls', col: COL.P1, idx: 0 },
        { label: 'ONLINE 2P', sub: 'Create or Join Room\nPlay across devices', col: COL.P2, idx: 1 }
      ];

      types.forEach((t, i) => {
        const x = i === 0 ? card0X : card1X;
        const sel = this.selectedCoopType === t.idx;
        const bob = sel ? Math.sin(this.tick * 0.12) * 5 : 0;
        const y = cardY + bob;

        ctx.save();
        ctx.shadowBlur = sel ? 30 : 6;
        ctx.shadowColor = sel ? t.col : 'rgba(255,255,255,0.04)';
        ctx.fillStyle = sel ? '#0d1835' : '#070f21';
        ctx.strokeStyle = sel ? t.col : '#1b2a4a';
        ctx.lineWidth = sel ? 3 : 1.2;
        roundRect(ctx, x, y, cardW, cardH, 14);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon area
        const iconCX = x + cardW / 2;
        const iconY = y + 62;

        if (t.idx === 0) {
          // Local setup: Keyboard/On-Screen icons together
          ctx.fillStyle = '#ffd700';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⌨️', iconCX, iconY + 10);
        } else {
          // Online setup: Globe network icon
          ctx.fillStyle = '#00e5ff';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🌐', iconCX, iconY + 10);
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = sel ? t.col : 'rgba(255,255,255,0.7)';
        ctx.font = `bold 20px Orbitron, sans-serif`;
        ctx.shadowBlur = sel ? 12 : 0; ctx.shadowColor = t.col;
        ctx.fillText(t.label, iconCX, y + 130);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px Rajdhani, sans-serif';
        t.sub.split('\n').forEach((line, li) => {
          ctx.fillText(line, iconCX, y + 155 + li * 16);
        });

        if (sel) {
          ctx.fillStyle = t.col;
          ctx.shadowBlur = 8; ctx.shadowColor = t.col;
          ctx.beginPath();
          ctx.arc(iconCX, y + cardH - 18, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      });

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '12px Orbitron, sans-serif';
      const hintY = cardY + cardH + 36;
      if (IS_MOBILE) {
        ctx.fillText('TAP A CARD  ·  ENTER to confirm', cxs, hintY);
      } else {
        ctx.fillText('← → to select   ·   ENTER to confirm   ·   ESC to go back', cxs, hintY);
      }
      if ((this.menuBlink / 24 | 0) & 1) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillText('Press ENTER / Tap to Select', cxs, hintY + 28);
      }
      ctx.restore();
    }

    // --- GAME RENDERING ---
    _renderGame() {
      // bg gradient
      // background gradient (cached)
      if (!this.bgGradient) {
        this.bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        this.bgGradient.addColorStop(0, this.bg[0]);
        this.bgGradient.addColorStop(1, this.bg[1]);
      }
      ctx.fillStyle = this.bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      this.stars.draw(ctx, this.cam.x, this.cam.y, this.tick);
      ctx.save();
      this.cam.apply(ctx);

      this._drawPlatforms();
      this._drawDecorations();
      this._drawHazards();
      for (const d of this.drones) d.draw(ctx);
      this._drawExit();

      // Chain only drawn in multiplayer
      if (this.gameMode === 'multi') {
        this.chain.draw(ctx, this.tick, this.chainHeat);
      }

           if (this.state !== STATE.DYING || this.deathCD > CONFIG.DEATH_COOLDOWN * 0.5) {
        if (this.gameMode === 'multi' && this.coopType === 'online' && !this.net.isHost) {
          const ox = this.p1.x, oy = this.p1.y;
          this.p1.x = this.net.interp.renderX; this.p1.y = this.net.interp.renderY;
          this.p1.draw(ctx, this.tick);
          this.p1.x = ox; this.p1.y = oy;
        } else {
          this.p1.draw(ctx, this.tick);
        }
        if (this.gameMode === 'multi') this.p2.draw(ctx, this.tick);
      }

      this.ptcl.draw(ctx);
      ctx.restore();

      // HUD updates
      document.getElementById('timer').textContent = this._fmtTime(this.stageTime);

      // chain taut warning / heat (multiplayer only)
      if (this.gameMode === 'multi' && (this.chainHeat || 0) > 0 && this.state === STATE.PLAYING) {
        const hPct = this.chainHeat / CONFIG.CHAIN_SNAP_TIME;
        ctx.save();
        ctx.globalAlpha = 0.6 + hPct * 0.4;
        ctx.fillStyle = hPct > 0.7 ? '#ff0000' : '#ff6600';
        ctx.font = 'bold 16px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        const txt = hPct > 0.7 ? '⚠ OVERHEATING! ⚠' : '⚠ CHAIN TAUT ⚠';
        const sx = hPct > 0.7 ? rand(-2, 2) : 0;
        const sy = hPct > 0.7 ? rand(-2, 2) : 0;
        ctx.fillText(txt, canvas.width / 2 + sx, 95 + sy);
        ctx.fillRect(canvas.width / 2 - 60, 105, 120 * hPct, 6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width / 2 - 60, 105, 120, 6);
        ctx.restore();
      }

      // death flash
      if (this.state === STATE.DYING) {
        ctx.fillStyle = `rgba(255,0,0,${(this.deathCD / CONFIG.DEATH_COOLDOWN) * 0.25})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    _drawPlatforms() {
      // Use a lower shadow blur on mobile to reduce GPU fill-rate cost
      const platBlur = IS_MOBILE ? 6 : 12;
      for (const p of this.plats) {
        if (p.type === 'disappearing' && p.gone) continue;

        let col;
        switch (p.type) {
          case 'moving': col = COL.PLAT_MOVE; break;
          case 'disappearing': col = COL.PLAT_VANISH; break;
          default: col = COL.PLAT;
        }

        ctx.save();
        if (p.type === 'disappearing') ctx.globalAlpha = p.opacity;

        if (p.style === 'forest') {
          col = '#33aa55';
        } else if (p.style === 'mine') {
          col = '#9e6d42';
        } else if (p.style === 'grid') {
          col = '#ff00aa';
        } else if (p.style === 'cyber') {
          col = '#00e5ff';
        } else if (p.style === 'void') {
          col = '#bd00ff';
        }

        ctx.fillStyle = col + '12';
        if (p.style === 'mine') {
          ctx.fillStyle = '#2c221a';
        } else if (p.style === 'forest') {
          ctx.fillStyle = '#0f3818';
        }
        ctx.fillRect(p.x, p.y, p.w, p.h);

        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.shadowBlur = platBlur; ctx.shadowColor = col;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

        if (p.style === 'mine') {
          // stable hash from position so colour doesn't flicker each frame
          const oreBlue = ((p.x * 7 + p.y * 13) & 1) === 0;
          ctx.fillStyle = oreBlue ? '#00e5ff' : '#ffd700';
          if (p.w > 40 && p.h > 40) {
            ctx.fillRect(p.x + 10, p.y + 10, 4, 4);
            ctx.fillRect(p.x + p.w - 14, p.y + 20, 4, 4);
          }
        } else if (p.style === 'forest') {
          ctx.fillStyle = '#33cc55';
          ctx.fillRect(p.x, p.y - 3, p.w, 4);
        }

        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    _drawDecorations() {
      if (!this.decorations || !this.decorations.length) return;
      ctx.save();
      for (const d of this.decorations) {
        if (d.type === 'tree') {
          // trunk
          ctx.fillStyle = '#4b5320';
          ctx.fillRect(d.x, d.y - d.h, d.w, d.h);
          // foliage layers
          ctx.shadowBlur = 10; ctx.shadowColor = '#2e8b57';
          ctx.fillStyle = '#2e8b57';
          ctx.beginPath();
          ctx.arc(d.x + d.w / 2, d.y - d.h - d.w * 1.2, d.w * 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3da858';
          ctx.beginPath();
          ctx.arc(d.x + d.w / 2, d.y - d.h - d.w * 2, d.w * 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (d.type === 'crystal') {
          ctx.shadowBlur = 14; ctx.shadowColor = '#a0c4ff';
          ctx.fillStyle = '#a0c4ff';
          // diamond shape
          ctx.beginPath();
          ctx.moveTo(d.x + d.w / 2, d.y - d.h);
          ctx.lineTo(d.x + d.w, d.y - d.h / 2);
          ctx.lineTo(d.x + d.w / 2, d.y);
          ctx.lineTo(d.x, d.y - d.h / 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.moveTo(d.x + d.w / 2, d.y - d.h);
          ctx.lineTo(d.x + d.w / 2 + 3, d.y - d.h / 2);
          ctx.lineTo(d.x + d.w / 2, d.y - d.h / 2 - 2);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (d.type === 'server') {
          ctx.fillStyle = '#3a3a4a';
          ctx.fillRect(d.x, d.y - d.h, d.w, d.h);
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 1;
          ctx.strokeRect(d.x, d.y - d.h, d.w, d.h);
          // LED indicators
          const leds = ['#00ff88', '#ff4444', '#ffaa00'];
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = leds[i];
            ctx.shadowBlur = 6; ctx.shadowColor = leds[i];
            ctx.fillRect(d.x + 4, d.y - d.h + 8 + i * 10, 6, 4);
          }
          ctx.shadowBlur = 0;
        } else if (d.type === 'obelisk') {
          ctx.shadowBlur = 18; ctx.shadowColor = '#aa00ff';
          const grd = ctx.createLinearGradient(d.x, d.y - d.h, d.x + d.w, d.y);
          grd.addColorStop(0, '#2b013f');
          grd.addColorStop(1, '#660066');
          ctx.fillStyle = grd;
          ctx.fillRect(d.x, d.y - d.h, d.w, d.h);
          // glowing runes
          ctx.fillStyle = '#cc00ff';
          ctx.beginPath();
          ctx.arc(d.x + d.w / 2, d.y - d.h / 2, d.w * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
    }

    _drawHazards() {
      for (const h of this.haz) {
        const pulse = Math.sin(this.tick * 0.08) * 0.3 + 0.7;
        ctx.save();
        ctx.shadowBlur = 20; ctx.shadowColor = COL.HAZARD;

        // use cached gradient
        ctx.fillStyle = h.gradient;
        ctx.fillRect(h.x, h.y, h.w, h.h);

        // bubbles
        for (let i = 0; i < h.w / 22; i++) {
          const bx = h.x + 10 + i * 22 + Math.sin(this.tick * 0.05 + i) * 4;
          const by = h.y + Math.sin(this.tick * 0.07 + i * 2) * 3;
          ctx.fillStyle = `rgba(255,200,0,${0.4 + Math.sin(this.tick * 0.1 + i) * 0.3})`;
          ctx.beginPath(); ctx.arc(bx, by, 2.5 + Math.sin(this.tick * 0.06 + i) * 1.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        // lava particles
        if (this.tick % 10 === 0) {
          this.ptcl.emit(h.x + rand(5, h.w - 5), h.y, 1, '#ff6600', { sMin: -0.5, sMax: 0.5, life: 18, sz: 2 });
        }
      }
    }

    _drawExit() {
      const e = this.exit;
      const pulse = Math.sin(this.tick * 0.06) * 0.3 + 0.7;
      ctx.save();
      ctx.shadowBlur = 25 + Math.sin(this.tick * 0.04) * 10;
      ctx.shadowColor = COL.EXIT;

      ctx.fillStyle = `rgba(0,255,102,${0.12 * pulse})`;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = COL.EXIT; ctx.lineWidth = 3;
      ctx.strokeRect(e.x, e.y, e.w, e.h);

      // use cached radial gradient for exit
      ctx.fillStyle = this.exitRadial;
      ctx.fillRect(e.x - 15, e.y - 15, e.w + 30, e.h + 30);

      ctx.fillStyle = COL.EXIT;
      ctx.font = '12px Orbitron, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('EXIT', e.x + e.w / 2, e.y - 10);
      ctx.restore();

      if (this.tick % 14 === 0) {
        this.ptcl.emit(e.x + rand(5, e.w - 5), e.y + rand(5, e.h - 5), 1, COL.EXIT,
          { sMin: -0.8, sMax: 0.8, life: 22, sz: 2 });
      }
    }
  }

  // ============================================================
  // BOOT
  // ============================================================

  // ---- Fullscreen + Landscape helpers ----
  function requestFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) req.call(el).catch(() => {});
  }
  function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* not supported on all browsers */ }
  }

  window.addEventListener('load', () => {
    const game = new Game();

    // --- Helper to register a screen tap input ---
    function triggerTap() {
      justPressed['__TAP__'] = true;
      keys['__TAP__'] = true;
      setTimeout(() => { keys['__TAP__'] = false; }, 100);
    }

    // --- Wire up DOM overlays directly so touches on them are not blocked/lost ---
    const overlays = [
      document.getElementById('stageIntroOverlay'),
      document.getElementById('stageCompleteOverlay'),
      document.getElementById('gameCompleteOverlay')
    ];

    overlays.forEach(overlay => {
      if (overlay) {
        const handler = (e) => {
          e.preventDefault();
          game.snd.init();
          
          if (game.state === STATE.GAME_OVER) {
            overlay.classList.remove('visible');
            overlay.classList.add('hidden');
            game.totDeaths = 0; game.totTime = 0;
            game.startFade(1, () => { game.loadStage(0); });
          } else {
            triggerTap();
          }
        };
        overlay.addEventListener('touchstart', handler, { passive: false });
        overlay.addEventListener('mousedown', handler);
      }
    });

    // --- Canvas tap: works as Enter for menus, inits audio, and handles mode/stage select ---
    canvas.addEventListener('touchstart', (e) => {
      game.snd.init();
      // Attempt fullscreen + landscape on first tap
      requestFullscreen();
      lockLandscape();

      const s = game.state;
      const touch = e.touches[0];
      
      // Calculate coordinates relative to canvas bounding client rect
      const rect = canvas.getBoundingClientRect();
      const touchX = ((touch.clientX - rect.left) / rect.width) * canvas.width;
      const touchY = ((touch.clientY - rect.top) / rect.height) * canvas.height;

      // Mode select tap handling
      if (s === STATE.MODE_SELECT) {
        game.selectedMode = touch.clientX < window.innerWidth / 2 ? 0 : 1;
        triggerTap();
        return;
      }

      // Coop type select tap handling
      if (s === STATE.COOP_TYPE_SELECT) {
        game.selectedCoopType = touch.clientX < window.innerWidth / 2 ? 0 : 1;
        triggerTap();
        return;
      }

      // Stage select tap handling
      if (s === STATE.STAGE_SELECT && game._stageLayout) {
        const lay = game._stageLayout;
        // Search which card bounds match our touch coordinates
        for (let idx = 0; idx < STAGES.length; idx++) {
          const row = Math.floor(idx / lay.cols);
          const colIdx = idx % lay.cols;
          const cx = lay.startX + colIdx * (lay.cardW + lay.gapX);
          const cy = lay.cardY + row * (lay.cardH + lay.gapY);

          if (touchX >= cx && touchX <= cx + lay.cardW &&
              touchY >= cy && touchY <= cy + lay.cardH) {
            
            // If already selected, double tap confirms and launches
            if (game.selectedStageIdx === idx) {
              triggerTap();
            } else {
              game.selectedStageIdx = idx;
              game.snd.land();
            }
            return;
          }
        }
      }

      if (s === STATE.MENU || s === STATE.STAGE_COMPLETE || s === STATE.INTRO) {
        triggerTap();
      }
      if (s === STATE.STAGE_SELECT) {
        // Online client should not trigger select screen tap to launch level
        if (game.gameMode === 'multi' && game.coopType === 'online' && !game.net.isHost) {
          return;
        }
        triggerTap();
      }
      // Game-over: tap restarts
      if (s === STATE.GAME_OVER) {
        document.getElementById('gameCompleteOverlay').classList.remove('visible');
        document.getElementById('gameCompleteOverlay').classList.add('hidden');
        game.totDeaths = 0; game.totTime = 0;
        game.startFade(1, () => { game.loadStage(0); });
      }
    }, { passive: true });
  });

})();
