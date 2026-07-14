const STAGES = [
  // ---------- STAGE 1: Tutorial Plains ----------
  {
    name: 'Tutorial Plains',
    sub: 'Learn the basics',
    world: { x: 0, y: 0, w: 1800, h: 700 },
    spawn: { a: { x: 80, y: 440 }, b: { x: 160, y: 440 } },
    exit: { x: 1650, y: 420, w: 65, h: 85 },
    platforms: [
      { x: 0, y: 520, w: 480, h: 180, type: 'solid' },
      { x: 550, y: 520, w: 340, h: 180, type: 'solid' },
      { x: 960, y: 520, w: 340, h: 180, type: 'solid' },
      { x: 1380, y: 520, w: 420, h: 180, type: 'solid' },
      { x: 320, y: 440, w: 100, h: 14, type: 'solid' },
      { x: 680, y: 410, w: 110, h: 14, type: 'solid' },
      { x: 1080, y: 420, w: 100, h: 14, type: 'solid' },
      { x: 1520, y: 438, w: 110, h: 14, type: 'solid' },
    ],
    hazards: [],
    bg: ['#0a0a2e', '#1a0a3e'],
  },

  // ---------- STAGE 2: The Gap ----------
  {
    name: 'The Gap',
    sub: 'Cross together',
    world: { x: 0, y: 0, w: 2000, h: 800 },
    spawn: { a: { x: 80, y: 440 }, b: { x: 160, y: 440 } },
    exit: { x: 1840, y: 420, w: 65, h: 85 },
    platforms: [
      { x: 0, y: 520, w: 560, h: 280, type: 'solid' },
      { x: 660, y: 490, w: 80, h: 14, type: 'solid' },
      { x: 830, y: 450, w: 80, h: 14, type: 'solid' },
      { x: 1000, y: 470, w: 80, h: 14, type: 'solid' },
      { x: 1160, y: 520, w: 840, h: 280, type: 'solid' },
      { x: 350, y: 390, w: 120, h: 14, type: 'solid' },
      { x: 1280, y: 400, w: 120, h: 14, type: 'solid' },
      { x: 1620, y: 450, w: 100, h: 14, type: 'solid' },
    ],
    hazards: [
      { x: 560, y: 760, w: 600, h: 40 },
    ],
    drones: [
      { x: 750, y: 320, moveMin: 650, moveMax: 1100, speed: 1.6 }
    ],
    bg: ['#0a1a2e', '#2a0a1e'],
  },

  // ---------- STAGE 3: Vertical Ascent ----------
  {
    name: 'Vertical Ascent',
    sub: 'Climb together',
    world: { x: 0, y: -1100, w: 850, h: 1800 },
    spawn: { a: { x: 120, y: 560 }, b: { x: 200, y: 560 } },
    exit: { x: 380, y: -960, w: 65, h: 85 },
    platforms: [
      { x: 0, y: 620, w: 850, h: 80, type: 'solid' },
      // zigzag ascent
      { x: 250, y: 520, w: 140, h: 14, type: 'solid' },
      { x: 420, y: 430, w: 140, h: 14, type: 'solid' },
      { x: 270, y: 330, w: 140, h: 14, type: 'solid' },
      { x: 440, y: 240, w: 140, h: 14, type: 'solid' },
      { x: 280, y: 140, w: 140, h: 14, type: 'solid' },
      { x: 430, y: 50, w: 140, h: 14, type: 'solid' },
      { x: 290, y: -40, w: 140, h: 14, type: 'solid' },
      // disappearing section
      { x: 440, y: -130, w: 110, h: 14, type: 'disappearing', triggered: false, timer: 0, gone: false, opacity: 1 },
      { x: 300, y: -230, w: 110, h: 14, type: 'disappearing', triggered: false, timer: 0, gone: false, opacity: 1 },
      { x: 420, y: -330, w: 110, h: 14, type: 'disappearing', triggered: false, timer: 0, gone: false, opacity: 1 },
      // solid upper
      { x: 280, y: -420, w: 140, h: 14, type: 'solid' },
      { x: 430, y: -520, w: 140, h: 14, type: 'solid' },
      { x: 260, y: -620, w: 140, h: 14, type: 'solid' },
      { x: 440, y: -720, w: 140, h: 14, type: 'solid' },
      { x: 280, y: -820, w: 140, h: 14, type: 'solid' },
      // summit
      { x: 280, y: -920, w: 260, h: 14, type: 'solid' },
      // walls
      { x: 0, y: -1100, w: 28, h: 1800, type: 'solid' },
      { x: 822, y: -1100, w: 28, h: 1800, type: 'solid' },
    ],
    hazards: [],
    drones: [
      { x: 200, y: 280, moveMin: 80, moveMax: 770, speed: 2.0 },
      { x: 350, y: -480, moveMin: 80, moveMax: 770, speed: 1.8 }
    ],
    bg: ['#0a0a1e', '#1a1a3e'],
  },

  // ---------- STAGE 4: Lava Gauntlet ----------
  {
    name: 'Lava Gauntlet',
    sub: 'Dodge the hazards',
    world: { x: 0, y: 0, w: 2600, h: 700 },
    spawn: { a: { x: 80, y: 440 }, b: { x: 160, y: 440 } },
    exit: { x: 2430, y: 420, w: 65, h: 85 },
    platforms: [
      { x: 0, y: 520, w: 350, h: 180, type: 'solid' },
      { x: 460, y: 520, w: 180, h: 180, type: 'solid' },
      { x: 760, y: 520, w: 150, h: 180, type: 'solid' },
      { x: 1060, y: 520, w: 200, h: 180, type: 'solid' },
      { x: 1410, y: 520, w: 150, h: 180, type: 'solid' },
      { x: 1710, y: 520, w: 180, h: 180, type: 'solid' },
      { x: 2050, y: 520, w: 150, h: 180, type: 'solid' },
      { x: 2310, y: 520, w: 290, h: 180, type: 'solid' },
      // moving platforms
      { x: 380, y: 460, w: 64, h: 14, type: 'moving', moveAxis: 'y', moveMin: 390, moveMax: 500, moveSpeed: 1.2, _dir: 1 },
      { x: 1290, y: 470, w: 80, h: 14, type: 'moving', moveAxis: 'x', moveMin: 1270, moveMax: 1390, moveSpeed: 1.5, _dir: 1 },
      { x: 1950, y: 450, w: 70, h: 14, type: 'moving', moveAxis: 'y', moveMin: 380, moveMax: 500, moveSpeed: 1.0, _dir: 1 },
      // upper refuge platforms
      { x: 520, y: 390, w: 110, h: 14, type: 'solid' },
      { x: 910, y: 410, w: 100, h: 14, type: 'solid' },
      { x: 1510, y: 400, w: 110, h: 14, type: 'solid' },
    ],
    hazards: [
      { x: 350, y: 665, w: 110, h: 35 },
      { x: 640, y: 665, w: 120, h: 35 },
      { x: 910, y: 665, w: 150, h: 35 },
      { x: 1260, y: 665, w: 150, h: 35 },
      { x: 1560, y: 665, w: 150, h: 35 },
      { x: 1890, y: 665, w: 160, h: 35 },
      { x: 2200, y: 665, w: 110, h: 35 },
    ],
    drones: [
      { x: 800, y: 330, moveMin: 660, moveMax: 1200, speed: 2.0 },
      { x: 1600, y: 320, moveMin: 1420, moveMax: 1880, speed: 2.2 }
    ],
    bg: ['#1a0a0a', '#3a1a0a'],
  },

  // ---------- STAGE 5: Final Summit ----------
  {
    name: 'Final Summit',
    sub: 'The ultimate challenge',
    world: { x: 0, y: -850, w: 1800, h: 1550 },
    spawn: { a: { x: 80, y: 540 }, b: { x: 170, y: 540 } },
    exit: { x: 830, y: -720, w: 70, h: 90 },
    platforms: [
      // ground
      { x: 0, y: 600, w: 500, h: 100, type: 'solid' },
      { x: 600, y: 600, w: 250, h: 100, type: 'solid' },
      { x: 960, y: 600, w: 250, h: 100, type: 'solid' },
      { x: 1320, y: 600, w: 480, h: 100, type: 'solid' },
      // climb right side
      { x: 1500, y: 500, w: 140, h: 14, type: 'solid' },
      { x: 1300, y: 400, w: 140, h: 14, type: 'solid' },
      { x: 1530, y: 290, w: 120, h: 14, type: 'solid' },
      { x: 1290, y: 180, w: 130, h: 14, type: 'solid' },
      // bridge
      { x: 1040, y: 120, w: 200, h: 14, type: 'solid' },
      { x: 800, y: 80, w: 140, h: 14, type: 'solid' },
      // moving
      { x: 600, y: 50, w: 80, h: 14, type: 'moving', moveAxis: 'y', moveMin: -10, moveMax: 70, moveSpeed: 0.8, _dir: 1 },
      // disappearing
      { x: 400, y: -10, w: 110, h: 14, type: 'disappearing', triggered: false, timer: 0, gone: false, opacity: 1 },
      { x: 600, y: -110, w: 110, h: 14, type: 'disappearing', triggered: false, timer: 0, gone: false, opacity: 1 },
      // more ascent
      { x: 200, y: -60, w: 140, h: 14, type: 'solid' },
      { x: 350, y: -200, w: 130, h: 14, type: 'solid' },
      { x: 600, y: -290, w: 120, h: 14, type: 'solid' },
      { x: 850, y: -360, w: 140, h: 14, type: 'solid' },
      // moving near top
      { x: 1100, y: -400, w: 80, h: 14, type: 'moving', moveAxis: 'x', moveMin: 1000, moveMax: 1200, moveSpeed: 1.0, _dir: 1 },
      // final ascent
      { x: 1200, y: -500, w: 130, h: 14, type: 'solid' },
      { x: 950, y: -570, w: 130, h: 14, type: 'solid' },
      { x: 700, y: -640, w: 130, h: 14, type: 'solid' },
      // summit
      { x: 740, y: -700, w: 300, h: 18, type: 'solid' },
      // walls
      { x: 0, y: -850, w: 24, h: 1550, type: 'solid' },
      { x: 1776, y: -850, w: 24, h: 1550, type: 'solid' },
    ],
    hazards: [
      { x: 500, y: 665, w: 100, h: 35 },
      { x: 850, y: 665, w: 110, h: 35 },
    ],
    drones: [
      { x: 1100, y: 220, moveMin: 900, moveMax: 1300, speed: 2.0 },
      { x: 400, y: -100, moveMin: 100, moveMax: 700, speed: 2.0 },
      { x: 800, y: -450, moveMin: 500, moveMax: 1200, speed: 2.5 }
    ],
    bg: ['#0a0a0a', '#1a0a2e'],
  },

  // ---------- STAGE 6: Forest Canopy ----------
  {
    name: 'Forest Canopy',
    sub: 'Climb the treetops',
    world: { x: 0, y: 0, w: 2000, h: 800 },
    spawn: { a: { x: 80, y: 440 }, b: { x: 160, y: 440 } },
    exit: { x: 1820, y: 350, w: 65, h: 85 },
    decorations: [
      { type: 'tree', x: 100, y: 520, w: 12, h: 50 },
      { type: 'tree', x: 300, y: 460, w: 12, h: 45 },
      { type: 'tree', x: 600, y: 380, w: 12, h: 55 },
      { type: 'tree', x: 900, y: 340, w: 12, h: 48 },
      { type: 'tree', x: 1200, y: 390, w: 12, h: 52 }
    ],
    platforms: [
      { x: 0, y: 520, w: 420, h: 280, type: 'solid', style: 'forest' },
      { x: 500, y: 460, w: 180, h: 340, type: 'solid', style: 'forest' },
      { x: 780, y: 380, w: 140, h: 420, type: 'solid', style: 'forest' },
      { x: 1020, y: 440, w: 110, h: 14, type: 'solid', style: 'forest' },
      { x: 1220, y: 490, w: 110, h: 14, type: 'solid', style: 'forest' },
      { x: 1420, y: 440, w: 420, h: 360, type: 'solid', style: 'forest' },
      // upper tree branches
      { x: 250, y: 380, w: 120, h: 14, type: 'solid', style: 'forest' },
      { x: 580, y: 320, w: 120, h: 14, type: 'solid', style: 'forest' },
      { x: 900, y: 260, w: 120, h: 14, type: 'solid', style: 'forest' },
      { x: 1250, y: 340, w: 120, h: 14, type: 'solid', style: 'forest' },
      { x: 1550, y: 360, w: 110, h: 14, type: 'solid', style: 'forest' },
    ],
    hazards: [
      { x: 420, y: 760, w: 1000, h: 40 },
    ],
    drones: [
      { x: 800, y: 200, moveMin: 650, moveMax: 1150, speed: 2.2 }
    ],
    bg: ['#0d2e1a', '#05140b'],
  },

  // ---------- STAGE 7: Pixel Mines ----------
  {
    name: 'Pixel Mines',
    sub: 'Watch the lava pockets',
    world: { x: 0, y: -400, w: 1800, h: 1100 },
    spawn: { a: { x: 100, y: 520 }, b: { x: 180, y: 520 } },
    exit: { x: 1600, y: -250, w: 65, h: 85 },
    decorations: [
      { type: 'crystal', x: 500, y: 480, w: 20, h: 30 },
      { type: 'crystal', x: 800, y: 420, w: 20, h: 30 },
      { type: 'crystal', x: 1100, y: 360, w: 20, h: 30 }
    ],
    platforms: [
      { x: 0, y: 600, w: 320, h: 100, type: 'solid', style: 'mine' },
      { x: 400, y: 520, w: 140, h: 180, type: 'solid', style: 'mine' },
      { x: 620, y: 440, w: 140, h: 260, type: 'solid', style: 'mine' },
      { x: 840, y: 360, w: 140, h: 340, type: 'solid', style: 'mine' },
      // descending side
      { x: 1080, y: 280, w: 180, h: 420, type: 'solid', style: 'mine' },
      { x: 1340, y: 200, w: 120, h: 14, type: 'solid', style: 'mine' },
      // upper platform paths
      { x: 1150, y: 150, w: 120, h: 14, type: 'solid', style: 'mine' },
      { x: 920, y: 80, w: 120, h: 14, type: 'solid', style: 'mine' },
      { x: 660, y: 0, w: 140, h: 14, type: 'solid', style: 'mine' },
      { x: 400, y: -80, w: 130, h: 14, type: 'solid', style: 'mine' },
      { x: 180, y: -160, w: 130, h: 14, type: 'solid', style: 'mine' },
      { x: 400, y: -250, w: 200, h: 14, type: 'solid', style: 'mine' },
      // moving platform over a shaft
      { x: 680, y: -230, w: 75, h: 14, type: 'moving', moveAxis: 'x', moveMin: 650, moveMax: 880, moveSpeed: 1.4, _dir: 1, style: 'mine' },
      { x: 1000, y: -200, w: 75, h: 14, type: 'moving', moveAxis: 'y', moveMin: -300, moveMax: -100, moveSpeed: 1.6, _dir: 1, style: 'mine' },
      // exit summit
      { x: 1550, y: -170, w: 250, h: 200, type: 'solid', style: 'mine' },
    ],
    hazards: [
      { x: 320, y: 665, w: 80, h: 35 },
      { x: 540, y: 665, w: 80, h: 35 },
      { x: 760, y: 665, w: 80, h: 35 },
      { x: 980, y: 665, w: 100, h: 35 },
    ],
    drones: [
      { x: 600, y: 180, moveMin: 450, moveMax: 850, speed: 2.2 },
      { x: 600, y: -150, moveMin: 200, moveMax: 950, speed: 2.0 }
    ],
    bg: ['#1c1c1c', '#2c1e11'],
  },

  // ---------- STAGE 8: The Grid ----------
  {
    name: 'The Grid',
    sub: 'Navigate the cyber matrix',
    world: { x: 0, y: 0, w: 2200, h: 800 },
    spawn: { a: { x: 80, y: 440 }, b: { x: 160, y: 440 } },
    exit: { x: 1980, y: 420, w: 65, h: 85 },
    decorations: [
      { type: 'server', x: 600, y: 520, w: 30, h: 60 },
      { type: 'server', x: 1400, y: 520, w: 30, h: 60 }
    ],
    platforms: [
      { x: 0, y: 520, w: 380, h: 280, type: 'solid', style: 'grid' },
      { x: 1800, y: 520, w: 400, h: 280, type: 'solid', style: 'grid' },
      // fast moving columns
      { x: 440, y: 420, w: 64, h: 14, type: 'moving', moveAxis: 'y', moveMin: 220, moveMax: 500, moveSpeed: 2.5, _dir: 1, style: 'grid' },
      { x: 620, y: 300, w: 64, h: 14, type: 'moving', moveAxis: 'y', moveMin: 180, moveMax: 480, moveSpeed: 2.8, _dir: -1, style: 'grid' },
      { x: 800, y: 400, w: 64, h: 14, type: 'moving', moveAxis: 'x', moveMin: 720, moveMax: 980, moveSpeed: 2.0, _dir: 1, style: 'grid' },
      // safety platform
      { x: 1100, y: 450, w: 180, h: 14, type: 'solid', style: 'grid' },
      // disappearing cyber steps
      { x: 1350, y: 410, w: 90, h: 14, type: 'disappearing', triggered: false, timer: 60, gone: false, opacity: 1, style: 'grid' },
      { x: 1500, y: 340, w: 90, h: 14, type: 'disappearing', triggered: false, timer: 60, gone: false, opacity: 1, style: 'grid' },
      { x: 1650, y: 420, w: 90, h: 14, type: 'disappearing', triggered: false, timer: 60, gone: false, opacity: 1, style: 'grid' },
    ],
    hazards: [
      { x: 380, y: 760, w: 1420, h: 40 },
    ],
    drones: [
      { x: 1100, y: 350, moveMin: 1000, moveMax: 1350, speed: 2.4 },
      { x: 1500, y: 220, moveMin: 1300, moveMax: 1750, speed: 2.8 }
    ],
    bg: ['#04001a', '#1e003a'],
  },

  // ---------- STAGE 9: Cyber Nexus ----------
  {
    name: 'Cyber Nexus',
    sub: 'Infiltrate the mainframe',
    world: { x: 0, y: -700, w: 1800, h: 1400 },
    spawn: { a: { x: 100, y: 520 }, b: { x: 180, y: 520 } },
    exit: { x: 860, y: -580, w: 65, h: 85 },
    decorations: [
      { type: 'server', x: 500, y: 600, w: 25, h: 70 },
      { type: 'server', x: 1300, y: 600, w: 25, h: 70 }
    ],
    platforms: [
      { x: 0, y: 600, w: 420, h: 100, type: 'solid', style: 'cyber' },
      { x: 1380, y: 600, w: 420, h: 100, type: 'solid', style: 'cyber' },
      // outer ascent scaffolds
      { x: 260, y: 480, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1420, y: 480, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 100, y: 380, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1580, y: 380, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 240, y: 260, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1440, y: 260, w: 120, h: 14, type: 'solid', style: 'cyber' },
      // bridges
      { x: 420, y: 180, w: 200, h: 14, type: 'solid', style: 'cyber' },
      { x: 1180, y: 180, w: 200, h: 14, type: 'solid', style: 'cyber' },
      { x: 720, y: 100, w: 360, h: 14, type: 'solid', style: 'cyber' },
      // upper inner platforms
      { x: 520, y: 0, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1160, y: 0, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 700, y: -100, w: 100, h: 14, type: 'solid', style: 'cyber' },
      { x: 1000, y: -100, w: 100, h: 14, type: 'solid', style: 'cyber' },
      { x: 500, y: -210, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1180, y: -210, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 640, y: -320, w: 120, h: 14, type: 'solid', style: 'cyber' },
      { x: 1040, y: -320, w: 120, h: 14, type: 'solid', style: 'cyber' },
      // center target summit
      { x: 740, y: -500, w: 320, h: 20, type: 'solid', style: 'cyber' },
      // walls
      { x: 0, y: -700, w: 24, h: 1400, type: 'solid', style: 'cyber' },
      { x: 1776, y: -700, w: 24, h: 1400, type: 'solid', style: 'cyber' },
    ],
    hazards: [
      { x: 420, y: 665, w: 960, h: 35 },
    ],
    drones: [
      { x: 500, y: 60, moveMin: 350, moveMax: 1450, speed: 2.2 },
      { x: 500, y: -150, moveMin: 350, moveMax: 1450, speed: 2.5 },
      { x: 800, y: -380, moveMin: 550, moveMax: 1250, speed: 3.0 }
    ],
    bg: ['#111122', '#221133'],
  },

  // ---------- STAGE 10: Void Anomaly ----------
  {
    name: 'Void Anomaly',
    sub: 'The final escape',
    world: { x: 0, y: -900, w: 1800, h: 1600 },
    spawn: { a: { x: 120, y: 620 }, b: { x: 200, y: 620 } },
    exit: { x: 870, y: -780, w: 70, h: 90 },
    decorations: [
      { type: 'obelisk', x: 800, y: 680, w: 20, h: 80 },
      { type: 'obelisk', x: 1200, y: 680, w: 20, h: 80 }
    ],
    platforms: [
      { x: 0, y: 680, w: 500, h: 100, type: 'solid', style: 'void' },
      { x: 1300, y: 680, w: 500, h: 100, type: 'solid', style: 'void' },
      // tiny intermediate blocks
      { x: 600, y: 560, w: 80, h: 14, type: 'solid', style: 'void' },
      { x: 1120, y: 560, w: 80, h: 14, type: 'solid', style: 'void' },
      // vertical moving chains
      { x: 860, y: 450, w: 80, h: 14, type: 'moving', moveAxis: 'y', moveMin: 300, moveMax: 540, moveSpeed: 1.8, _dir: 1, style: 'void' },
      // high level platforms
      { x: 350, y: 350, w: 100, h: 14, type: 'solid', style: 'void' },
      { x: 1350, y: 350, w: 100, h: 14, type: 'solid', style: 'void' },
      // horizontal moving void blocks
      { x: 600, y: 240, w: 75, h: 14, type: 'moving', moveAxis: 'x', moveMin: 450, moveMax: 780, moveSpeed: 2.2, _dir: 1, style: 'void' },
      { x: 1100, y: 240, w: 75, h: 14, type: 'moving', moveAxis: 'x', moveMin: 1000, moveMax: 1350, moveSpeed: 2.2, _dir: -1, style: 'void' },
      // disappearing blocks near exit path
      { x: 850, y: 150, w: 100, h: 14, type: 'disappearing', triggered: false, timer: 50, gone: false, opacity: 1, style: 'void' },
      { x: 600, y: 60, w: 90, h: 14, type: 'solid', style: 'void' },
      { x: 1110, y: 60, w: 90, h: 14, type: 'solid', style: 'void' },
      // summit elevator
      { x: 860, y: -100, w: 80, h: 14, type: 'moving', moveAxis: 'y', moveMin: -250, moveMax: 0, moveSpeed: 2.0, _dir: 1, style: 'void' },
      // left/right side final walls
      { x: 450, y: -400, w: 100, h: 14, type: 'solid', style: 'void' },
      { x: 1250, y: -400, w: 100, h: 14, type: 'solid', style: 'void' },
      // final ascent steps
      { x: 620, y: -520, w: 100, h: 14, type: 'solid', style: 'void' },
      { x: 1080, y: -520, w: 100, h: 14, type: 'solid', style: 'void' },
      { x: 850, y: -620, w: 100, h: 14, type: 'solid', style: 'void' },
      // exit base
      { x: 780, y: -700, w: 240, h: 20, type: 'solid', style: 'void' },
      // walls
      { x: 0, y: -900, w: 24, h: 1600, type: 'solid', style: 'void' },
      { x: 1776, y: -900, w: 24, h: 1600, type: 'solid', style: 'void' },
    ],
    hazards: [
      { x: 500, y: 745, w: 800, h: 35 },
      { x: 700, y: 290, w: 400, h: 15 },
    ],
    drones: [
      { x: 800, y: 400, moveMin: 550, moveMax: 1250, speed: 2.5 },
      { x: 800, y: 0, moveMin: 500, moveMax: 1300, speed: 2.8 },
      { x: 800, y: -450, moveMin: 550, moveMax: 1250, speed: 3.2 }
    ],
    bg: ['#000000', '#120024'],
  },
];