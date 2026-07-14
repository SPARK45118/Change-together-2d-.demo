// ============================================================
// CHAINED TOGETHER — 2D Co-op Platformer
// Full game engine: physics, chain, stages, rendering
// ZERO-LAG NETWORKING EDITION
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
    JUMP_FORCE: -14,
    MAX_FALL_SPEED: 13,
    GROUND_FRICTION: 0.78,
    AIR_CONTROL: 0.18,
    AIR_DRAG: 0.96,
    PLAYER_W: 26,
    PLAYER_H: 36,
    CHAIN_SEGMENTS: 16,
    CHAIN_MAX_LEN: 180,
    CHAIN_SNAP_TIME: 180,
    CHAIN_ITERS: IS_MOBILE ? 6 : 8,
    CHAIN_GRAVITY: 0.28,
    CHAIN_DAMP: 0.97,
    CHAIN_PULL: 0.28,
    CAM_LERP: 0.08,
    DEATH_COOLDOWN: 55,
    INVINCIBILITY: 80,
    MAX_PARTICLES: 150,
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
  // ============================================================

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
          this._pool.push(p);
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
      pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
      pts[n].x = bx; pts[n].y = by; pts[n].px = bx; pts[n].py = by;

      for (let i = 1; i < n; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * CONFIG.CHAIN_DAMP;
        const vy = (p.y - p.py) * CONFIG.CHAIN_DAMP;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + CONFIG.CHAIN_GRAVITY;
      }

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

      const d = dist(ax, ay, bx, by);
      this.tension = clamp((d - CONFIG.CHAIN_MAX_LEN * 0.65) / (CONFIG.CHAIN_MAX_LEN * 0.35), 0, 1);
    }

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

      if (this.gnd) {
        if (mx) this.vx = mx * CONFIG.PLAYER_SPEED;
        else this.vx *= CONFIG.GROUND_FRICTION;
      } else {
        this.vx += mx * CONFIG.PLAYER_SPEED * CONFIG.AIR_CONTROL;
        this.vx *= CONFIG.AIR_DRAG;
        this.vx = clamp(this.vx, -CONFIG.PLAYER_SPEED * 1.2, CONFIG.PLAYER_SPEED * 1.2);
      }

      const jumpPressed = inputSource ? inputSource[this.kJ] : consumeJustPressed(this.kJ);
      if (jumpPressed && this.gnd) {
        this.vy = CONFIG.JUMP_FORCE;
        this.gnd = false;
        sound.jump();
        particles.emit(this.cx, this.y + this.h, 8, this.color, { sMin: -2, sMax: 2, life: 18, sz: 3 });
      }

      this.vy += CONFIG.GRAVITY;
      if (this.vy > CONFIG.MAX_FALL_SPEED) this.vy = CONFIG.MAX_FALL_SPEED;

      this.vx += fx; this.vy += fy;

      this.x += this.vx;
      this.gnd = false;
      this._collide(platforms, 'x');

      this.y += this.vy;
      this._collide(platforms, 'y');

      if (clampPos) {
        this.x = clampPos.cx - this.w / 2;
        this.y = clampPos.cy - this.h / 2;
      }

      if (this.x < wb.x) { this.x = wb.x; this.vx = 0; }
      if (this.x + this.w > wb.x + wb.w) { this.x = wb.x + wb.w - this.w; this.vx = 0; }

      if (this.y > wb.y + wb.h + 120) return 'death';

      if (this.gnd && !this.wasGnd) {
        particles.emit(this.cx, this.y + this.h, 5, '#999', { sMin: -1.5, sMax: 1.5, life: 14, sz: 2 });
        sound.land();
      }

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

      c.shadowBlur = 16; c.shadowColor = this.color;
      c.fillStyle = this.color;
      roundRect(c, this.x, this.y + bob, this.w, this.h, 7);
      c.fill();
      c.shadowBlur = 0;

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

      c.fillStyle = '#fff';
      c.font = '10px Orbitron, sans-serif';
      c.textAlign = 'center';
      c.fillText('P' + this.id, this.cx, this.y - 8 + bob);

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

  // ============================================================
  // DRONE
  // ============================================================

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
        c.shadow