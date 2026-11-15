// STACK UP — Platanus Hack 26 arcade challenge. One file, Phaser 3.87, no assets.
// Top-down tactical room clearing for one or two players: kick the door, surprise the room,
// stop the radio call. Everything is drawn in code, every sound is synthesised.

const W = 800, H = 600;

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const KEY_TO_ARCADE = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) KEY_TO_ARCADE[key.toLowerCase()] = code;
}

// ---- Input: held state plus one-shot presses, keyed by cabinet code ----
const held = Object.create(null), pressed = Object.create(null);
const codeOf = (e) => (typeof e.key === 'string' ? KEY_TO_ARCADE[e.key.toLowerCase()] : undefined);
window.addEventListener('keydown', (e) => {
  const c = codeOf(e); if (!c) return;
  if (!held[c]) pressed[c] = true;
  held[c] = true;
});
window.addEventListener('keyup', (e) => { const c = codeOf(e); if (c) held[c] = false; });
const take = (c) => { const p = pressed[c]; pressed[c] = false; return p; };
// The same control on either player's panel (menus accept both).
const any = (c) => take('P1_' + c) | take('P2_' + c);
// Drop presses buffered in another state, so a mashed button cannot skip a screen.
const flush = () => { for (const c in pressed) pressed[c] = false; };

// ---- Storage: the arcade's parent bridge, or guarded localStorage when testing locally ----
function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? { found: false, value: null } : { found: true, value: JSON.parse(raw) };
      } catch { return { found: false, value: null }; }
    },
    async set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
}

// ---- Tuning: every gameplay number lives here ----
const TUNE = {
  speed: 185, fireMs: 150, bullet: 640, hp: 3, invulnMs: 1000,
  // Aim assist: a shot goes to the visible enemy nearest to where you face, inside a triangle
  // this wide (radians each side) and this long (pixels). Beyond it you aim by hand.
  assist: 0.3, assistRange: 170, laser: 240,
  // Surprise: how long a freshly kicked room cannot act, and the slow motion that goes with it.
  surpriseMs: 800, slowMs: 550, slowScale: 0.35,
  // Enemy reaction time is the main difficulty number; each *Step applies per floor.
  reactMs: 520, reactStep: 50, reactMin: 220,
  eFireMs: 900, eFireStep: 60, eFireMin: 450,
  eBullet: 330, eBulletStep: 25, spread: 0.07, sight: 520,
  huntSpeed: 70, rushSpeed: 150, rushStep: 8,
  // Heavy: from floor 2, chance per room rising by heavyP per floor; fires bursts of three.
  heavyHp: 3, heavySpeed: 45, heavyP: 0.3, burstMs: 110,
  callMs: 2400, callStep: 150, callMin: 1300,
  shooters: 2, shootersMax: 6, extraDoor: 0.35,
  horde: 6, hordeStep: 2, hordeAgain: 3, hordeEveryMs: 260, hordeDuo: 1.5,
  throwSpeed: 430, fuseMs: 850, grenades: 3, nadeMax: 5, friction: 0.0022, blindMs: 900,
  // Pickups dropped by a cleared room, and the shotgun one of them gives.
  pickMs: 9000, shotMs: 9000, shotFireMs: 330, pellets: 5, pelletSpread: 0.11,
  // Hostages: from floor 2, chance per room; what losing or saving one is worth.
  hostP: 0.4, hostPen: 500, hostSave: 400,
  kill: 100, rushKill: 50, clear: 250, multMax: 9,
  floorBonus: 3000, bonusPerSec: 25, silent: 1000,
};

// Grenades: one system, one row each. Every effect also applies to the players.
// r is the blast radius in pixels; rgb/body/band only colour the drawing.
const KITS = [
  { n: 'FLASH', d: 'BLINDS THE ROOM. SAFE FOR HOSTAGES.', c: 0xffffff, rgb: '255,255,255', body: '#c8d2dc', band: '#2f7bff', r: 80, stun: 2600 },
  { n: 'CONC', d: 'STUNS, SHOVES AND BLOWS DOORS OPEN.', c: 0x66ccff, rgb: '102,204,255', body: '#2c5d7a', band: '#66ccff', r: 75, stun: 1400, kb: 300, door: 1 },
  { n: 'FRAG', d: 'KILLS EVERYONE NEAR. BLOWS DOORS OPEN.', c: 0xffaa33, rgb: '255,170,51', body: '#3d5a2a', band: '#ffaa33', r: 70, kill: 1, door: 1 },
];
const PICKS = ['+1 GRENADE', '+1 ARMOUR', 'SHOTGUN!'];
// Cover layouts as [x, y, w, h] blocks inside a 12x12 room; the two outer rings stay clear
// so no door is ever blocked. Layout 0 (not listed) is two random stacks.
const COVER = [
  [[4, 4, 4, 4]],
  [[5, 2, 2, 3], [5, 7, 2, 3]],
  [[2, 2, 2, 2], [8, 2, 2, 2], [2, 8, 2, 2], [8, 8, 2, 2]],
  [[3, 5, 6, 2]],
  [[2, 5, 1, 1], [5, 2, 1, 1], [9, 6, 1, 1], [6, 9, 1, 1], [5, 5, 2, 2]],
];
// One palette per floor, cycling: wall, wall edge, then floor colour for hidden / awake / clear rooms.
const PAL = [
  [0x16304f, 0x6fb8ff, 0x0a1322, 0x14213b, 0x0e2824],
  [0x3a1a4f, 0xd47bff, 0x130a1c, 0x26143a, 0x0e2824],
  [0x4f2a16, 0xffa24a, 0x1a0f0a, 0x33201a, 0x0e2824],
];
const SONG = [110, 110, 131, 110, 147, 110, 131, 98];

// ---- Map: a tile grid. 0 floor, 1 wall, 2 closed door, 3 open door, 4 street door, 5 crate ----
const T = 20, COLS = 40, ROWS = 30, OY = 2, RS = 13, FLOOR_ROWS = 27;
const idx = (tx, ty) => tx + ty * COLS;

// ---- Sound: synth tones and filtered noise, no files. `to` slides the pitch. ----
function tone(scene, freq, ms, type = 'square', vol = 0.08, to) {
  const ctx = scene.sound.context; if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime, e = t + ms / 1000;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, e);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, e);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(e);
}
// A burst of noise through a low-pass filter: gunshots (bright), kicks and blasts (dark).
let NB;
function noise(scene, ms, vol, freq) {
  const ctx = scene.sound.context; if (!ctx) return;
  if (!NB || NB.sampleRate !== ctx.sampleRate) {
    NB = ctx.createBuffer(1, ctx.sampleRate >> 1, ctx.sampleRate);
    const d = NB.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime, e = t + ms / 1000;
  src.buffer = NB; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, e);
  src.connect(f).connect(g).connect(ctx.destination); src.start(t, Math.random() * 0.05); src.stop(e);
}

// ---- Textures: painted once on small canvases, people facing right, each with its own glow ----
function makeTextures(scene) {
  if (scene.textures.exists('p0')) return;
  const tex = (key, w, h, draw) => { const c = scene.textures.createCanvas(key, w, h); draw(c.getContext()); c.refresh(); };
  const halo = (x, cx, cy, r, rgb, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  const disc = (x, cx, cy, rx, ry, fill) => { x.fillStyle = fill; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); };
  const box = (x, a, b, w, h, fill) => { x.fillStyle = fill; x.fillRect(a, b, w, h); };
  // A person seen from above: glow, shoulders, then whatever `draw` adds (weapon, head, hat).
  const person = (key, rgb, coat, draw) => tex(key, 40, 40, (x) => { halo(x, 20, 20, 20, rgb, 0.5); disc(x, 19, 20, 6, 10, coat); draw(x); });
  const operator = (key, rgb, coat, helmet) => person(key, rgb, coat, (x) => {
    box(x, 21, 23, 16, 3, '#e8f6ff'); box(x, 21, 22, 6, 5, '#0d3a44'); // rifle and grip
    disc(x, 20, 20, 6, 6, helmet); box(x, 23, 17, 3, 6, '#06222b'); // helmet and visor
  });
  operator('p0', '57,230,255', '#17606f', '#39e6ff');
  operator('p1', '141,255,74', '#3f7a1f', '#8dff4a');
  person('e0', '255,68,85', '#b3202f', (x) => { // gunman: red suit, pistol, fedora
    box(x, 22, 23, 11, 3, '#cfd6e4');
    disc(x, 20, 20, 8, 8, '#3a0a12'); disc(x, 20, 20, 5, 5, '#6b1522');
  });
  person('e1', '255,225,74', '#c9a81e', (x) => { // lookout: yellow coat, radio at his ear, antenna
    disc(x, 20, 20, 6, 6, '#ffe14a'); box(x, 17, 9, 6, 9, '#2b2606'); box(x, 19, 2, 2, 8, '#ffffff');
  });
  person('e2', '255,61,200', '#a01d7c', (x) => { // thug: magenta jacket, bat out front
    box(x, 22, 15, 15, 3, '#f1e2bd'); box(x, 20, 23, 8, 3, '#a01d7c');
    disc(x, 20, 20, 6, 6, '#ff8fe0');
  });
  person('e3', '255,110,40', '#5a1608', (x) => { // heavy: wide armour, long gun, steel helmet
    disc(x, 18, 20, 8, 13, '#8a2a12'); box(x, 20, 22, 18, 4, '#d6d6d6'); box(x, 20, 21, 7, 6, '#2a2a2a');
    disc(x, 19, 20, 7, 7, '#b9c2cc'); box(x, 22, 17, 3, 6, '#30363d');
  });
  person('e4', '160,255,190', '#e9f0f4', (x) => { // hostage: pale shirt, both hands up
    disc(x, 25, 8, 3, 3, '#ffd9b0'); disc(x, 25, 32, 3, 3, '#ffd9b0'); disc(x, 20, 20, 6, 6, '#ffd9b0'); disc(x, 18, 20, 4, 5, '#5a3b22');
  });
  tex('pb', 18, 8, (x) => { halo(x, 9, 4, 9, '120,240,255', 0.8); box(x, 3, 3, 12, 2, '#eaffff'); });
  tex('eb', 18, 8, (x) => { halo(x, 9, 4, 9, '255,140,50', 0.8); box(x, 3, 3, 12, 2, '#fff0d0'); });
  const nade = (x, K) => { // grenade: body, cap, lever, coloured band
    halo(x, 9, 9, 9, K.rgb, 0.6);
    disc(x, 9, 10, 4, 5, K.body); box(x, 7, 3, 4, 3, '#d9d9d9'); box(x, 10, 2, 4, 2, '#d9d9d9'); box(x, 5, 9, 8, 2, K.band);
  };
  KITS.forEach((K, i) => tex('n' + i, 18, 18, (x) => nade(x, K)));
  // Pickups: a grenade, an armour plate with a cross, a shotgun shell.
  tex('k0', 26, 26, (x) => { halo(x, 13, 13, 13, '255,225,74', 0.7); x.translate(4, 4); nade(x, { rgb: '255,225,74', body: '#55606b', band: '#ffe14a' }); });
  tex('k1', 26, 26, (x) => { halo(x, 13, 13, 13, '57,230,255', 0.7); box(x, 6, 6, 14, 14, '#0e3d48'); box(x, 11, 8, 4, 10, '#39e6ff'); box(x, 8, 11, 10, 4, '#39e6ff'); });
  tex('k2', 26, 26, (x) => { halo(x, 13, 13, 13, '255,110,40', 0.7); box(x, 9, 5, 8, 12, '#e23b2a'); box(x, 9, 17, 8, 4, '#ffd27a'); });
  tex('glow', 64, 64, (x) => halo(x, 32, 32, 32, '255,255,255', 1));
  tex('dot', 2, 2, (x) => box(x, 0, 0, 2, 2, '#ffffff'));
  tex('scan', 2, 3, (x) => box(x, 0, 0, 2, 1, '#000000'));
  tex('vig', 200, 150, (x) => {
    const g = x.createRadialGradient(100, 75, 85, 100, 75, 135);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = g; x.fillRect(0, 0, 200, 150);
  });
}

// An old-monitor look over everything: dark corners and scanlines.
const crt = (scene) => {
  scene.add.image(0, 0, 'vig').setOrigin(0).setScale(4).setDepth(20);
  scene.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setDepth(21).setAlpha(0.16);
};

const FONT = 'monospace';
const label = (scene, x, y, s, size, color) =>
  scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color: color || '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5);

// ---- Score table: top five runs, validated every time it is read ----
const SCORE_KEY = 'stack-up-scores';
const clean = (v) => (Array.isArray(v) ? v : [])
  .filter((e) => e && /^[A-Z]{3}$/.test(e.n) && Number.isFinite(e.s) && Number.isFinite(e.f))
  .sort((a, b) => b.s - a.s).slice(0, 5);
const table = () => scores.map((e, i) => (i + 1) + '. ' + e.n + ' ' + String(e.s).padStart(7) + '  F' + e.f).join('\n') || 'NO SCORES YET';
let scores = [], lastN = 'AAA', kit = 0, duo = false;

class Title extends Phaser.Scene {
  constructor() { super('title'); }
  create() {
    flush(); makeTextures(this);
    // A floor-plan backdrop: grid, one room, the operator at its door.
    const g = this.add.graphics();
    g.lineStyle(1, 0x14233c);
    for (let x = 0; x <= W; x += T) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += T) g.lineBetween(0, y, W, y);
    g.fillStyle(0x14213b).fillRect(170, 200, 250, 160).lineStyle(6, 0x6fb8ff).strokeRect(170, 200, 250, 160);
    g.fillStyle(0x05080f).fillRect(164, 255, 12, 50).fillStyle(0xffb020).fillRect(167, 259, 6, 42);
    this.add.image(120, 280, 'glow').setScale(4.5).setTint(0x39e6ff).setAlpha(0.25).setBlendMode(1);
    this.add.image(105, 280, 'p0').setScale(2.2);
    this.add.image(60, 320, 'p1').setScale(2.2).setRotation(-0.5);
    this.add.image(205, 280, 'pb').setScale(2.2); this.add.image(255, 280, 'pb').setScale(2.2);
    this.add.image(330, 245, 'e0').setScale(2).setRotation(2.6);
    this.add.image(375, 320, 'e3').setScale(2.3).setRotation(3.4);
    this.add.image(290, 322, 'e1').setScale(2).setRotation(3.3);
    g.fillStyle(0x000000, 0.7).fillRect(262, 282, 56, 9).fillStyle(0xffe14a).fillRect(264, 284, 32, 5);

    const title = label(this, W / 2, 78, 'STACK UP', 84, '#39e6ff').setShadow(0, 0, '#39e6ff', 24, true, true);
    this.tweens.add({ targets: title, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, W / 2, 146, 'KICK THE DOOR. SURPRISE THE ROOM. STOP THE CALL.', 20, '#ffb020');
    label(this, 600, 205, 'TOP OPERATORS', 20, '#ffe14a');
    this.tableText = label(this, 600, 222, table(), 19).setOrigin(0.5, 0).setLineSpacing(5);
    this.kitIcon = this.add.image(W / 2 - 190, 412, 'n0').setScale(2.6);
    this.kitText = label(this, W / 2, 412, '', 26);
    this.kitDesc = label(this, W / 2, 442, '', 16, '#9fb6d6');
    const p = label(this, W / 2, 492, 'PRESS START', 32, '#ff4455');
    this.tweens.add({ targets: p, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    label(this, W / 2, 532, '2 PLAYERS: PLAYER 2 PRESSES START, NOW OR ANY TIME', 16, '#8dff4a');
    label(this, W / 2, 578, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 14, '#5d7699');
    crt(this);
    this.showKit();
    getStorage().get(SCORE_KEY).then((r) => {
      if (r && r.found) { scores = clean(r.value); this.tableText.setText(table()); }
    }).catch(() => {});
  }
  showKit() {
    this.kitIcon.setTexture('n' + kit);
    this.kitText.setText('<  GRENADE: ' + KITS[kit].n + '  >');
    this.kitDesc.setText(KITS[kit].d + '  A BAD THROW HITS YOU TOO.');
  }
  update() {
    const d = (any('R') ? 1 : 0) - (any('L') ? 1 : 0), two = take('START2');
    if (d) { kit = (kit + d + 3) % 3; this.showKit(); tone(this, 520, 60); }
    if (two || take('START1') || take('P1_1')) { duo = !!two; tone(this, 660, 120); this.scene.start('play'); }
  }
}

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    flush();
    this.grid = new Uint8Array(COLS * ROWS);
    this.flow = new Int16Array(COLS * ROWS);
    this.score = 0; this.floor = 0; this.mult = 1; this.over = 0; this.overT = 0;
    this.slow = 0; this.blind = 0; this.winT = 0; this.sirenT = 0; this.beat = 0; this.beatT = 0;
    this.roomsN = 0; this.silentN = 0; this.bestM = 1; this.savedN = 0; this.hint = null;
    this.enemies = []; this.bullets = []; this.nades = []; this.rings = []; this.picks = [];
    this.mapG = this.add.graphics();
    this.decal = this.add.graphics().setDepth(1);
    this.fx = this.add.graphics().setDepth(4);
    this.fogs = [];
    for (let i = 0; i < 6; i++) {
      const x = (1 + (i % 3) * RS) * T, y = (OY + 1 + ((i / 3) | 0) * RS) * T;
      this.fogs.push(this.add.rectangle(x, y, 12 * T, 12 * T, 0x04070d).setOrigin(0).setDepth(5));
    }
    const parts = (tint) => this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 260 }, lifespan: 450, scale: { start: 2.6, end: 0 }, tint, emitting: false,
    }).setDepth(4);
    this.blood = parts(0xff3355); this.sparks = parts(0xffd27a);
    // Two operators; player 2 only takes part once he has pressed START. Each carries a different grenade.
    this.ps = [0, 1].map((i) => ({
      i, c: 'P' + (i + 1) + '_', k: (kit + i) % 3, col: i ? 0x8dff4a : 0x39e6ff, in: !i || duo, down: false,
      x: 0, y: 0, ang: 0, cd: 0, hp: TUNE.hp, inv: 0, kx: 0, ky: 0, slow: 0, shot: 0, nadeN: TUNE.grenades,
      img: this.add.image(0, 0, 'p' + i).setDepth(3).setScale(1.2).setVisible(!i || duo),
      // His pool of light: it makes the room he stands in read as lit.
      light: this.add.image(0, 0, 'glow').setDepth(2).setBlendMode(1).setTint(0x9fdcff).setAlpha(0.2).setScale(6.5).setVisible(!i || duo),
    }));
    this.white = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(9).setAlpha(0);
    const hud = (x, y, ox, size) => this.add.text(x, y, '', { fontFamily: FONT, fontSize: size + 'px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(ox, 0).setDepth(10);
    this.hudL = hud(12, 9, 0, 20); this.hudC = hud(W / 2 - 40, 9, 0.5, 20);
    this.rowT = [0, 1].map((i) => hud(590, 5 + i * 17, 0, 13)); this.kitT = [0, 1].map((i) => hud(W - 8, 5 + i * 17, 1, 13));
    this.rows();
    label(this, W / 2, 590, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 13, '#3f5878').setDepth(10);
    this.banner = label(this, W / 2, 300, '', 44).setDepth(11).setAlpha(0).setShadow(0, 0, '#000000', 8, true, true);
    crt(this);
    this.nextFloor();
  }
  rows() {
    this.ps.forEach((p, i) => {
      this.rowT[i].setText(p.in ? 'P' + (i + 1) : 'P2: PRESS START').setColor(i ? '#8dff4a' : '#39e6ff');
      this.kitT[i].setText(p.in ? KITS[p.k].n : '');
    });
  }
  join() {
    const p = this.ps[1], a = this.ps[0];
    duo = p.in = true; p.x = a.x; p.y = a.y; p.ang = a.ang;
    p.img.setVisible(true); p.light.setVisible(true);
    this.rows(); this.pop(p.x, p.y - 24, 'PLAYER 2 JOINED', '#8dff4a', 22);
    tone(this, 660, 150, 'square', 0.07, 990);
  }

  // ---- Floor ----
  nextFloor() {
    const f = ++this.floor, s = f - 1;
    for (const o of [...this.enemies, ...this.bullets, ...this.nades, ...this.picks]) { this.tweens.killTweensOf(o.img); o.img.destroy(); }
    this.enemies = []; this.bullets = []; this.nades = []; this.rings = []; this.picks = [];
    this.decal.clear();
    this.alarm = false; this.pending = 0; this.spawnT = 0; this.floorT = 0; this.cleared = 0; this.flowT = 0;
    this.react = Math.max(TUNE.reactMin, TUNE.reactMs - TUNE.reactStep * s);
    this.eFire = Math.max(TUNE.eFireMin, TUNE.eFireMs - TUNE.eFireStep * s);
    this.eBullet = TUNE.eBullet + TUNE.eBulletStep * s;
    this.callMs = Math.max(TUNE.callMin, TUNE.callMs - TUNE.callStep * s);
    // A new floor gives everyone one hit back and puts a downed partner back on his feet.
    for (const p of this.ps) if (p.in) {
      if (s) p.hp = Math.min(TUNE.hp, p.hp + 1);
      p.down = false; p.kx = p.ky = 0; p.nadeN = Math.max(p.nadeN, TUNE.grenades);
      p.img.setVisible(true); p.light.setVisible(true);
    }
    this.build();
    this.say('FLOOR ' + f, '#39e6ff');
    tone(this, 440, 140, 'square', 0.06, 880);
    if (!s) {
      const h = this.hint = label(this, W / 2, 346, 'WALK INTO A DOOR TO KICK IT IN', 18, '#ffb020').setDepth(11);
      this.tweens.add({ targets: h, alpha: 0, delay: 3500, duration: 600 });
    }
  }

  build() {
    const g = this.grid.fill(1), f = this.floor, B = Phaser.Math.Between;
    this.rooms = []; this.doors = []; this.doorAt = {};
    for (let i = 0; i < 6; i++) {
      const x0 = 1 + (i % 3) * RS, y0 = OY + 1 + ((i / 3) | 0) * RS;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) g[idx(x0 + x, y0 + y)] = 0;
      // st: 0 hidden, 1 awake, 2 clear. left: enemies alive. ns: a kill outside surprise happened. host: its hostage.
      this.rooms.push({ x0, y0, st: 0, left: 0, ns: 0, host: null });
    }
    // Doors: a random spanning tree over the six rooms, plus a few extra doors.
    const edges = [], set = [0, 1, 2, 3, 4, 5];
    for (let i = 0; i < 6; i++) { if (i % 3 < 2) edges.push([i, i + 1]); if (i < 3) edges.push([i, i + 3]); }
    Phaser.Utils.Array.Shuffle(edges);
    const find = (a) => (set[a] === a ? a : (set[a] = find(set[a])));
    for (const [a, b] of edges) {
      const ra = find(a), rb = find(b);
      if (ra === rb && Math.random() > TUNE.extraDoor) continue;
      set[ra] = rb;
      const A = this.rooms[a], k = B(1, 9), d = { tiles: [], a, b, open: false, x: 0, y: 0 };
      for (let j = 0; j < 2; j++) {
        const tx = b === a + 1 ? A.x0 + 12 : A.x0 + k + j, ty = b === a + 1 ? A.y0 + k + j : A.y0 + 12, t = idx(tx, ty);
        g[t] = 2; this.doorAt[t] = d; d.tiles.push(t);
        d.x += (tx * T + T / 2) / 2; d.y += (ty * T + T / 2) / 2;
      }
      this.doors.push(d);
    }
    // Entry room: already clear, with the street door the horde comes through.
    const en = B(0, 5), E = this.rooms[en], top = en < 3, wy = top ? E.y0 - 1 : E.y0 + 12;
    E.st = 2;
    g[idx(E.x0 + 5, wy)] = g[idx(E.x0 + 6, wy)] = 4;
    this.sx = (E.x0 + 6) * T; this.sy = (top ? E.y0 + 1 : E.y0 + 11) * T;
    for (let i = 0; i < 6; i++) {
      const R = this.rooms[i];
      this.fogs[i].setVisible(i !== en).setAlpha(0.97);
      if (i === en) continue;
      // Cover: one of six layouts of crates, mirrored at random.
      const L = B(0, 5), flip = Math.random() < 0.5;
      const blocks = L ? COVER[L - 1] : [[B(2, 8), B(2, 8), 2, 2], [B(2, 8), B(2, 8), 2, 2]];
      for (const [a, b, w, h] of blocks) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        g[idx(R.x0 + (flip ? b + y : a + x), R.y0 + (flip ? a + x : b + y))] = 5;
      }
      const n = Math.min(TUNE.shootersMax, TUNE.shooters + ((f - 1) >> 1) + B(0, 1));
      const heavy = Math.random() < TUNE.heavyP * (f - 1);
      // One lookout, then the gunmen; from floor 2 one of them may be a heavy.
      for (let k = 0; k <= n; k++) this.spawn(k ? (k === 1 && heavy ? 3 : 0) : 1, i);
      if (f > 1 && Math.random() < TUNE.hostP) this.spawn(4, i);
    }
    for (const p of this.ps) { p.x = this.sx + (p.i ? 11 : -11); p.y = this.sy; p.ang = top ? Math.PI / 2 : -Math.PI / 2; }
    this.drawMap();
  }

  // kind: 0 gunman, 1 lookout (radio), 2 thug (horde), 3 heavy, 4 hostage. room -1 = no room.
  spawn(k, room, x, y) {
    const R = this.rooms[room];
    if (R) {
      for (let tries = 0; tries < 200; tries++) {
        const tx = R.x0 + Phaser.Math.Between(0, 11), ty = R.y0 + Phaser.Math.Between(0, 11);
        x = tx * T + T / 2; y = ty * T + T / 2;
        if (!this.grid[idx(tx, ty)] && !this.doors.some((d) => (d.a === room || d.b === room) && Math.hypot(d.x - x, d.y - y) < 75)) break;
      }
    }
    const ang = Math.random() * 6.28;
    const img = this.add.image(x, y, 'e' + k).setDepth(3).setScale(k === 3 ? 1.5 : 1.2).setRotation(ang).setVisible(!R);
    const e = { k, room, x, y, ang, stun: 0, t: 0, call: 0, bt: 0, bn: 0, seen: false, kx: 0, ky: 0, hp: k === 3 ? TUNE.heavyHp : 1, img };
    if (k === 4) R.host = e; else if (R) R.left++;
    this.enemies.push(e);
  }

  // Redrawn when a door opens or a room changes state: lit rooms and cleared rooms look different.
  drawMap() {
    const m = this.mapG.clear(), g = this.grid, P = PAL[(this.floor - 1) % 3];
    for (let ty = OY; ty < OY + FLOOR_ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const i = idx(tx, ty), t = g[i], x = tx * T, y = ty * T;
      if (t === 1) { // wall: dark slab with a bright edge wherever it faces open floor
        m.fillStyle(P[0]).fillRect(x, y, T, T).fillStyle(P[1]);
        if (g[i - 1] !== 1) m.fillRect(x, y, 2, T);
        if (g[i + 1] !== 1) m.fillRect(x + T - 2, y, 2, T);
        if (g[i - COLS] !== 1) m.fillRect(x, y, T, 2);
        if (g[i + COLS] !== 1) m.fillRect(x, y + T - 2, T, 2);
        continue;
      }
      const R = this.rooms[(((tx - 1) / RS) | 0) + 3 * (((ty - OY - 1) / RS) | 0)];
      m.fillStyle(P[2 + (R ? R.st : 1)] + ((tx + ty) & 1 ? 0x030506 : 0)).fillRect(x, y, T, T);
      if (t === 2) m.fillStyle(0xffb020).fillRect(x + 1, y + 1, T - 2, T - 2).fillStyle(0x7a4c00).fillRect(x + 8, y + 8, 4, 4);
      else if (t === 3) m.fillStyle(0xffb020, 0.45).fillRect(x + 2, y + 2, 6, 3).fillRect(x + 11, y + 12, 7, 3).fillRect(x + 5, y + 15, 3, 3);
      else if (t === 4) m.fillStyle(0x35d07f).fillRect(x + 1, y + 1, T - 2, T - 2).fillStyle(0x0c5a34).fillRect(x + 4, y + 8, T - 8, 4);
      else if (t === 5) m.fillStyle(0x7a4f25).fillRect(x + 1, y + 1, T - 2, T - 2).lineStyle(2, 0x3d2610).strokeRect(x + 2, y + 2, T - 4, T - 4).lineBetween(x + 3, y + 3, x + T - 3, y + T - 3);
    }
  }

  // ---- Grid queries ----
  solid(x, y) { const t = this.grid[idx((x / T) | 0, (y / T) | 0)]; return t !== 0 && t !== 3; }
  // A body of half-size r at x,y. Remembers a closed door it touched, for the kick.
  blocked(x, y, r) {
    let b = false;
    for (let i = 0; i < 4; i++) {
      const t = idx(((x + (i & 1 ? r : -r)) / T) | 0, ((y + (i & 2 ? r : -r)) / T) | 0), v = this.grid[t];
      if (v !== 0 && v !== 3) { b = true; if (v === 2) this.hitD = this.doorAt[t]; }
    }
    return b;
  }
  // One axis at a time, so bodies slide along walls.
  move(o, dx, dy, r) {
    if (dx && !this.blocked(o.x + dx, o.y, r)) o.x += dx;
    if (dy && !this.blocked(o.x, o.y + dy, r)) o.y += dy;
  }
  los(ax, ay, bx, by) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8);
    for (let i = 1; i < n; i++) if (this.solid(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
    return true;
  }
  // Distance in tiles from every reachable tile to the nearest standing player; chasers walk downhill.
  flood() {
    const f = this.flow.fill(-1), g = this.grid, q = [];
    for (const p of this.ps) if (p.in && !p.down) { const c = idx((p.x / T) | 0, (p.y / T) | 0); f[c] = 0; q.push(c); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], d = f[c] + 1;
      for (const n of [c - 1, c + 1, c - COLS, c + COLS]) if (f[n] < 0 && (g[n] === 0 || g[n] === 3)) { f[n] = d; q.push(n); }
    }
  }
  // The standing player this enemy goes for: one he can see first, then the nearest. Sets this.see.
  target(e) {
    let best = null, bd = 1e9, seen = false;
    for (const p of this.ps) if (p.in && !p.down) {
      const d = Math.hypot(p.x - e.x, p.y - e.y), v = d < TUNE.sight && this.los(e.x, e.y, p.x, p.y);
      if ((v && !seen) || (v === seen && d < bd)) { best = p; bd = d; seen = v; }
    }
    this.see = seen;
    return best;
  }
  chase(e, step, q) {
    const c = idx((e.x / T) | 0, (e.y / T) | 0), f = this.flow;
    let tx = q.x, ty = q.y, best = f[c];
    if (best > 1) for (const n of [c - 1, c + 1, c - COLS, c + COLS]) {
      if (f[n] >= 0 && f[n] < best) { best = f[n]; tx = (n % COLS) * T + T / 2; ty = ((n / COLS) | 0) * T + T / 2; }
    }
    e.ang = Math.atan2(ty - e.y, tx - e.x);
    this.move(e, Math.cos(e.ang) * step, Math.sin(e.ang) * step, 7);
  }
  // One grenade step: bounce off walls, lose speed. Also used to predict where a throw lands.
  fly(n, dt) {
    const s = dt / 1000;
    for (let k = 0; k < 4; k++) {
      const dx = (n.vx * s) / 4, dy = (n.vy * s) / 4;
      if (this.solid(n.x + dx, n.y)) n.vx *= -0.55; else n.x += dx;
      if (this.solid(n.x, n.y + dy)) n.vy *= -0.55; else n.y += dy;
    }
    const fr = Math.max(0, 1 - dt * TUNE.friction); n.vx *= fr; n.vy *= fr;
  }

  // ---- Doors, rooms, alarm ----
  openDoor(d) {
    if (d.open) return;
    d.open = true;
    for (const t of d.tiles) this.grid[t] = 3;
    this.flowT = 0;
    this.sparks.explode(22, d.x, d.y);
    this.flare(d.x, d.y, 0xffb020, 2.2, 220);
    this.cameras.main.shake(160, 0.01);
    tone(this, 150, 170, 'sawtooth', 0.12, 45); noise(this, 220, 0.25, 900);
    let woke = false;
    for (const r of [d.a, d.b]) if (this.wake(r)) woke = true;
    if (woke && !this.alarm) this.slow = TUNE.slowMs;
    this.drawMap();
  }
  wake(i) {
    const R = this.rooms[i];
    if (R.st) return false;
    R.st = 1;
    this.tweens.add({ targets: this.fogs[i], alpha: 0, duration: 150 });
    for (const e of this.enemies) if (e.room === i) {
      e.img.setVisible(true);
      e.stun = this.alarm ? 0 : TUNE.surpriseMs; // an alerted room is not surprised
      e.t = this.react;
    }
    return true;
  }
  raise() {
    const n = this.alarm ? TUNE.hordeAgain + this.floor : TUNE.horde + TUNE.hordeStep * this.floor;
    this.pending += Math.round(n * (this.ps[1].in ? TUNE.hordeDuo : 1));
    this.alarm = true;
    this.say('ALARM!', '#ff4455');
    this.cameras.main.flash(200, 255, 40, 40);
  }
  clearRoom(R) {
    R.st = 2; this.cleared++; this.roomsN++; this.score += TUNE.clear;
    this.drawMap();
    const cx = (R.x0 + 6) * T, cy = (R.y0 + 6) * T;
    this.pop(cx, cy, 'ROOM CLEAR +' + TUNE.clear, '#35d07f', 24);
    [523, 659, 784].forEach((f, i) => this.time.delayedCall(i * 70, () => tone(this, f, 160, 'triangle', 0.07)));
    const h = R.host;
    if (h) { // the hostage walks out alive
      R.host = null; this.score += TUNE.hostSave; this.savedN++;
      this.enemies.splice(this.enemies.indexOf(h), 1);
      this.pop(h.x, h.y - 18, 'HOSTAGE SAFE +' + TUNE.hostSave, '#a0ffbe', 18);
      this.tweens.add({ targets: h.img, alpha: 0, duration: 600, onComplete: () => h.img.destroy() });
    }
    // The drop: a clean, all-surprise clear gives armour (if anyone is hurt) or the shotgun.
    let tx = R.x0 + 6, ty = R.y0 + 6;
    for (let i = 0; i < 60 && this.grid[idx(tx, ty)]; i++) { tx = R.x0 + Phaser.Math.Between(2, 9); ty = R.y0 + Phaser.Math.Between(2, 9); }
    const hurt = this.ps.some((p) => p.in && p.hp < TUNE.hp), r = Math.random();
    const k = !R.ns ? (hurt ? 1 : 2) : r < 0.5 ? 0 : r < 0.8 || !hurt ? 2 : 1;
    const img = this.add.image(tx * T + T / 2, ty * T + T / 2, 'k' + k).setDepth(2);
    this.tweens.add({ targets: img, scale: 1.35, duration: 380, yoyo: true, repeat: -1 });
    this.picks.push({ x: img.x, y: img.y, k, t: TUNE.pickMs, img });
  }

  // ---- Combat ----
  shoot(x, y, a, sp, foe) {
    const img = this.add.image(x, y, foe ? 'eb' : 'pb').setRotation(a).setDepth(3).setBlendMode(1);
    this.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, foe, img });
    this.flare(x + Math.cos(a) * 6, y + Math.sin(a) * 6, foe ? 0xff9a3c : 0xcff6ff, 0.5, 70);
  }
  // A player's bullet lands: a heavy takes several, everyone else falls.
  hit(e) {
    if (--e.hp > 0) {
      e.img.setTintFill(0xffffff);
      this.time.delayedCall(60, () => e.img.active && e.img.clearTint());
      this.sparks.explode(6, e.x, e.y); tone(this, 500, 50, 'square', 0.05, 200);
    } else this.kill(e);
  }
  kill(e) {
    const sur = e.stun > 0, d = this.decal, R = this.rooms[e.room];
    this.enemies.splice(this.enemies.indexOf(e), 1);
    e.img.destroy();
    this.blood.explode(18, e.x, e.y);
    this.flare(e.x, e.y, 0xff3355, 1.6, 200);
    // What stays on the floor: a body and its blood.
    d.fillStyle(0x7a0c1e, 0.55);
    for (let i = 0; i < 4; i++) d.fillCircle(e.x + Phaser.Math.Between(-12, 12), e.y + Phaser.Math.Between(-12, 12), Phaser.Math.Between(3, 8));
    d.fillStyle([0x5a1018, 0x6b5a10, 0x55103f, 0x5a2a10, 0xb9c4c9][e.k], 0.9).fillEllipse(e.x, e.y, e.k === 3 ? 24 : 17, e.k === 3 ? 17 : 12);
    tone(this, 220, 90, 'square', 0.06, 70);
    if (e.k === 4) { // you shot the hostage
      R.host = null; this.mult = 1; this.score = Math.max(0, this.score - TUNE.hostPen);
      this.pop(e.x, e.y - 18, 'HOSTAGE DOWN -' + TUNE.hostPen, '#ff4455', 20);
      tone(this, 160, 500, 'sawtooth', 0.12, 50);
      return;
    }
    if (e.k === 2) this.score += TUNE.rushKill;
    else {
      this.mult = sur ? Math.min(TUNE.multMax, this.mult + 1) : 1;
      this.bestM = Math.max(this.bestM, this.mult);
      this.score += TUNE.kill * this.mult * (e.k === 3 ? 2 : 1);
      if (sur) this.pop(e.x, e.y - 16, 'x' + this.mult, '#ffe14a', 22);
    }
    if (R) { if (!sur) R.ns = 1; if (!--R.left) this.clearRoom(R); }
  }
  hurt(p) {
    if (p.inv > 0 || p.down || this.over) return;
    p.hp--; p.inv = TUNE.invulnMs; this.mult = 1;
    this.cameras.main.shake(200, 0.014); this.cameras.main.flash(160, 255, 40, 40);
    tone(this, 180, 260, 'sawtooth', 0.16, 60);
    if (p.hp > 0) return;
    p.down = true; p.img.setVisible(false); p.light.setVisible(false);
    this.blood.explode(50, p.x, p.y);
    this.decal.fillStyle(p.col, 0.5).fillEllipse(p.x, p.y, 18, 13);
    if (this.ps.some((q) => q.in && !q.down)) this.pop(p.x, p.y - 20, 'P' + (p.i + 1) + ' DOWN - CLEAR THE FLOOR', '#ff4455', 18);
    else this.die();
  }
  die() {
    const S = this.score, two = this.ps[1].in;
    this.over = 2; this.overT = 700; flush();
    this.cameras.main.shake(400, 0.02);
    tone(this, 200, 700, 'sawtooth', 0.18, 40);
    this.banner.setVisible(false); if (this.hint) this.hint.setVisible(false);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setDepth(11);
    label(this, W / 2, 120, two ? 'TEAM DOWN' : 'OPERATOR DOWN', 56, '#ff4455').setDepth(12).setShadow(0, 0, '#ff4455', 18, true, true);
    label(this, W / 2, 185, 'SCORE ' + S + '    FLOOR ' + this.floor, 28).setDepth(12);
    label(this, W / 2, 225, 'ROOMS ' + this.roomsN + '   SILENT FLOORS ' + this.silentN + '   BEST COMBO x' + this.bestM + '   HOSTAGES ' + this.savedN, 15, '#9fb6d6').setDepth(12);
    // A top-five score asks for three initials first.
    if (S > 0 && scores.filter((e) => e.s >= S).length < 5) {
      this.over = 1; this.nm = lastN.split(''); this.ci = 0;
      this.ini = [
        label(this, W / 2, 300, 'TOP 5!  ENTER YOUR INITIALS', 22, '#ffe14a'),
        label(this, W / 2, 360, '', 52, '#ffffff'),
        label(this, W / 2, 420, 'STICK UP / DOWN: LETTER        B1: NEXT', 16, '#9fb6d6'),
      ];
      this.ini.forEach((t) => t.setDepth(12));
      this.showIni();
    } else this.endUI();
  }
  showIni() { this.ini[1].setText(this.nm.map((ch, i) => (i === this.ci ? '[' + ch + ']' : ' ' + ch + ' ')).join('')); }
  endUI() {
    label(this, W / 2, 290, 'TOP OPERATORS', 20, '#ffe14a').setDepth(12);
    label(this, W / 2, 308, table(), 19).setOrigin(0.5, 0).setLineSpacing(5).setDepth(12);
    label(this, W / 2, 490, 'B1 / START: GO AGAIN        B2: MENU', 20, '#9fb6d6').setDepth(12);
  }
  // Game over: initials if the score earned them, then one press to play again.
  overTick(rdt) {
    if ((this.overT -= rdt) > 0) return;
    const go = any('1') | take('START1') | take('START2'), menu = any('2'), d = (any('U') ? 1 : 0) - (any('D') ? 1 : 0);
    if (this.over === 1) {
      if (d) { this.nm[this.ci] = String.fromCharCode(((this.nm[this.ci].charCodeAt(0) - 39 + d) % 26) + 65); this.showIni(); tone(this, 520, 50); }
      if (go) {
        tone(this, 660, 90);
        if (++this.ci < 3) return this.showIni();
        lastN = this.nm.join('');
        scores = clean([...scores, { n: lastN, s: this.score, f: this.floor }]);
        getStorage().set(SCORE_KEY, scores);
        this.ini.forEach((t) => t.destroy());
        this.over = 2; this.overT = 300; this.endUI();
      }
    } else if (go) this.scene.restart();
    else if (menu) this.scene.start('title');
  }
  boom(x, y, K) {
    // Each grenade looks different: white burst, blue shock rings, orange fireball with a scorch mark.
    for (let i = 0; i < (K.kb ? 3 : 1); i++) this.rings.push({ x, y, r: K.r, t: 320 + i * 90, c: K.c });
    this.flare(x, y, K.c, (K.r * 3) / 64, K.kill ? 450 : 320);
    this.cameras.main.shake(K.kill ? 320 : 180, K.kill ? 0.02 : 0.01);
    tone(this, K.kill ? 110 : 1900, 420, K.kill ? 'sawtooth' : 'sine', 0.14, K.kill ? 30 : 500);
    noise(this, K.kill ? 600 : 350, 0.3, K.kill ? 700 : 2500);
    this.sparks.explode(K.kill ? 60 : 26, x, y);
    if (K.kill) this.decal.fillStyle(0x000000, 0.5).fillCircle(x, y, K.r * 0.5);
    else if (!K.kb) this.cameras.main.flash(90, 255, 255, 255);
    if (K.door) for (const d of this.doors) if (Math.hypot(d.x - x, d.y - y) < K.r) this.openDoor(d);
    for (const e of this.enemies.slice()) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > K.r || !this.los(x, y, e.x, e.y) || (e.room >= 0 && !this.rooms[e.room].st)) continue;
      if (K.kill) { this.kill(e); continue; }
      if (e.k === 4) continue; // flash and concussion do not hurt a hostage
      e.stun = Math.max(e.stun, K.stun);
      if (K.kb) { e.kx = ((e.x - x) / (d || 1)) * K.kb; e.ky = ((e.y - y) / (d || 1)) * K.kb; }
    }
    for (const p of this.ps) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (!p.in || p.down || d > K.r || !this.los(x, y, p.x, p.y)) continue;
      if (K.kill) this.hurt(p);
      else if (K.kb) { p.kx = ((p.x - x) / (d || 1)) * K.kb; p.ky = ((p.y - y) / (d || 1)) * K.kb; p.slow = 1500; this.pop(p.x, p.y - 20, 'DAZED', '#66ccff', 20); }
      else this.blind = TUNE.blindMs;
    }
  }

  // ---- Feedback ----
  say(s, color) {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(s).setColor(color).setAlpha(1).setScale(1.4);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 180 });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 800, duration: 400 });
  }
  pop(x, y, s, color, size) {
    const t = label(this, Phaser.Math.Clamp(x, 110, W - 110), y, s, size || 16, color).setDepth(11).setShadow(0, 0, '#000000', 6, true, true);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 850, onComplete: () => t.destroy() });
  }
  // A burst of light that swells and fades: muzzle flashes, kicked doors, kills, explosions.
  flare(x, y, tint, scale, ms) {
    const g = this.add.image(x, y, 'glow').setDepth(6).setBlendMode(1).setTint(tint).setScale(scale * 0.35);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  // ---- One player's turn: move, kick, aim, fire, throw ----
  drive(p, dt, time) {
    const s = dt / 1000, c = p.c, fx = this.fx, K = KITS[p.k], fire = held[c + '1'], thr = take(c + '2');
    const mx = (held[c + 'R'] ? 1 : 0) - (held[c + 'L'] ? 1 : 0), my = (held[c + 'D'] ? 1 : 0) - (held[c + 'U'] ? 1 : 0);
    if (mx || my) {
      if (!fire) p.ang = Math.atan2(my, mx); // holding fire locks the aim: strafe
      const sp = (TUNE.speed * (p.slow > 0 ? 0.45 : 1) * s) / Math.hypot(mx, my);
      this.hitD = null;
      this.move(p, mx * sp, my * sp, 7);
      if (this.hitD) this.openDoor(this.hitD); // the kick: walk into a door and it bursts open
    }
    if (p.kx || p.ky) {
      this.move(p, p.kx * s, p.ky * s, 7);
      const k = Math.max(0, 1 - dt * 0.006); p.kx *= k; p.ky *= k;
      if (Math.abs(p.kx) + Math.abs(p.ky) < 8) p.kx = p.ky = 0;
    }
    if (p.slow > 0) p.slow -= dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.shot > 0) { p.shot -= dt; fx.lineStyle(2, 0xff6e28, 0.8).strokeCircle(p.x, p.y, 14); }
    // Aim assist: among enemies in sight, take the one nearest to where you face.
    // It only reaches inside a short triangle in front of you, drawn faintly on the floor,
    // and it never picks a hostage.
    let aim = p.ang, tgt = null, near = TUNE.assist;
    const AR = TUNE.assistRange, a1 = p.ang - near, a2 = p.ang + near;
    fx.fillStyle(p.col, 0.07).fillTriangle(p.x, p.y, p.x + Math.cos(a1) * AR, p.y + Math.sin(a1) * AR, p.x + Math.cos(a2) * AR, p.y + Math.sin(a2) * AR);
    for (const e of this.enemies) {
      if (e.k === 4 || (e.room >= 0 && !this.rooms[e.room].st) || Math.hypot(e.x - p.x, e.y - p.y) > AR) continue;
      const a = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - p.y, e.x - p.x) - p.ang));
      if (a < near && this.los(p.x, p.y, e.x, e.y)) { near = a; tgt = e; }
    }
    if (tgt) aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const ca = Math.cos(aim), sa = Math.sin(aim);
    // Laser sight: shows exactly where the next shot goes, and rings the enemy it will hit.
    let lx = p.x, ly = p.y;
    for (let d = 0; d < TUNE.laser && !this.solid(lx + ca * 8, ly + sa * 8); d += 8) { lx += ca * 8; ly += sa * 8; }
    fx.lineStyle(1, p.col, 0.4).lineBetween(p.x + ca * 16, p.y + sa * 16, lx, ly);
    if (tgt) fx.lineStyle(2, p.col, 0.9).strokeCircle(tgt.x, tgt.y, 15);
    if ((p.cd -= dt) <= 0 && fire) {
      const n = p.shot > 0 ? TUNE.pellets : 1;
      p.cd = n > 1 ? TUNE.shotFireMs : TUNE.fireMs;
      for (let i = 0; i < n; i++) this.shoot(p.x + ca * 10, p.y + sa * 10, aim + (i - (n - 1) / 2) * TUNE.pelletSpread, TUNE.bullet, false);
      noise(this, n > 1 ? 160 : 70, n > 1 ? 0.22 : 0.12, n > 1 ? 1800 : 4500);
      tone(this, n > 1 ? 200 : 700, 40, 'square', 0.03, 120);
    }
    // Where a grenade thrown now would go off, and how far its blast reaches.
    if (p.nadeN > 0) {
      const q = { x: p.x, y: p.y, vx: Math.cos(p.ang) * TUNE.throwSpeed, vy: Math.sin(p.ang) * TUNE.throwSpeed };
      for (let t = 0; t < TUNE.fuseMs; t += 16) this.fly(q, 16);
      fx.lineStyle(1, K.c, 0.22).strokeCircle(q.x, q.y, K.r).lineStyle(2, K.c, 0.5)
        .lineBetween(q.x - 5, q.y - 5, q.x + 5, q.y + 5).lineBetween(q.x - 5, q.y + 5, q.x + 5, q.y - 5);
      if (thr) {
        p.nadeN--;
        const img = this.add.image(p.x, p.y, 'n' + p.k).setDepth(6);
        this.nades.push({ x: p.x, y: p.y, vx: Math.cos(p.ang) * TUNE.throwSpeed, vy: Math.sin(p.ang) * TUNE.throwSpeed, t: TUNE.fuseMs, K, img });
        tone(this, 300, 90, 'triangle', 0.06, 600);
      }
    }
    p.img.setPosition(p.x, p.y).setRotation(aim).setAlpha(p.inv > 0 && (time / 60) % 2 < 1 ? 0.3 : 1);
    p.light.setPosition(p.x, p.y);
  }

  update(time, delta) {
    const rdt = Math.min(delta, 50), fx = this.fx.clear(), E = this.enemies, ps = this.ps;
    if (this.over) return this.overTick(rdt);
    if (!ps[1].in && take('START2')) this.join();
    // One clock: every gameplay timer counts in dt, so slow motion slows all of them.
    if (this.slow > 0) this.slow -= rdt;
    const dt = rdt * (this.slow > 0 ? TUNE.slowScale : 1), s = dt / 1000;
    this.floorT += dt;
    if ((this.flowT -= rdt) <= 0) { this.flowT = 200; this.flood(); }
    // Bass line: slow while nobody has called it in, fast and higher once the alarm is up.
    if ((this.beatT -= rdt) <= 0) {
      const al = this.alarm;
      this.beatT = al ? 150 : 300;
      tone(this, SONG[this.beat++ % 8] * (al ? 1.5 : 1), al ? 130 : 240, 'triangle', 0.06);
      if (al && this.beat & 1) noise(this, 30, 0.04, 7000);
    }

    for (const p of ps) if (p.in && !p.down) this.drive(p, dt, time);

    // ---- Pickups: walk over one to take it ----
    for (let i = this.picks.length - 1; i >= 0; i--) {
      const k = this.picks[i];
      let got = (k.t -= dt) <= 0;
      k.img.setAlpha(k.t < 2000 && (time / 90) % 2 < 1 ? 0.25 : 1);
      for (const p of ps) if (!got && p.in && !p.down && Math.hypot(p.x - k.x, p.y - k.y) < 18) {
        got = true;
        if (k.k === 0) p.nadeN = Math.min(TUNE.nadeMax, p.nadeN + 1);
        else if (k.k === 1) p.hp = Math.min(TUNE.hp, p.hp + 1);
        else p.shot = TUNE.shotMs;
        this.pop(k.x, k.y - 16, PICKS[k.k], '#ffe14a', 20);
        this.flare(k.x, k.y, 0xffe14a, 1.8, 250);
        tone(this, 660, 120, 'square', 0.07, 1320);
      }
      if (got) { this.tweens.killTweensOf(k.img); k.img.destroy(); this.picks.splice(i, 1); }
    }

    // ---- Horde: enters by the street door, one thug at a time ----
    if (this.pending > 0 && (this.spawnT -= dt) <= 0) {
      this.spawnT = TUNE.hordeEveryMs; this.pending--;
      this.spawn(2, -1, this.sx + Phaser.Math.Between(-12, 12), this.sy);
    }
    if (this.pending > 0 && (this.sirenT -= rdt) <= 0) {
      this.sirenT = 420; this.siren = !this.siren;
      tone(this, this.siren ? 880 : 660, 300, 'square', 0.03);
    }

    // ---- Enemies ----
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      if (e.k === 4 || (e.room >= 0 && !this.rooms[e.room].st)) continue; // hostage, or still behind closed doors
      const q = this.target(e);
      if (!q) break;
      const see = this.see, dx = q.x - e.x, dy = q.y - e.y, dist = Math.hypot(dx, dy);
      if (e.kx || e.ky) {
        this.move(e, e.kx * s, e.ky * s, 7);
        const k = Math.max(0, 1 - dt * 0.006); e.kx *= k; e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 8) e.kx = e.ky = 0;
      }
      if (e.stun > 0) {
        e.stun -= dt; e.ang += dt * 0.012; e.t = this.react;
        e.img.setAlpha(0.55 + 0.4 * Math.sin(time / 35));
        // Stunned: stars circle his head.
        for (let k = 0; k < 3; k++) fx.fillStyle(0xffffff, 0.9).fillCircle(e.x + Math.cos(time / 110 + k * 2.1) * 13, e.y + Math.sin(time / 110 + k * 2.1) * 13, 2);
      } else {
        e.img.setAlpha(1);
        if (e.k === 2) {
          this.chase(e, (TUNE.rushSpeed + TUNE.rushStep * this.floor) * s, q);
          if (dist < 15 && q.inv <= 0) { this.hurt(q); e.kx = (-dx / (dist || 1)) * 260; e.ky = (-dy / (dist || 1)) * 260; }
        } else if (e.k === 1) {
          // The lookout calls for backup once he has seen you. Kill him before the bar fills.
          if (e.seen || see) {
            if (!e.seen) this.pop(e.x, e.y - 30, 'CALLING BACKUP!', '#ffe14a', 18);
            e.seen = true; e.ang = Math.atan2(dy, dx);
            if ((e.bt -= dt) <= 0) { e.bt = 280; tone(this, 1300, 50, 'square', 0.04); this.flare(e.x, e.y, 0xffe14a, 1.5, 250); }
            if ((e.call += dt) >= this.callMs) { e.k = 0; e.img.setTexture('e0'); e.t = this.react; this.raise(); }
            fx.fillStyle(0x000000, 0.75).fillRect(e.x - 19, e.y - 25, 38, 8)
              .fillStyle(0xffe14a).fillRect(e.x - 18, e.y - 24, (36 * e.call) / this.callMs, 6);
          }
        } else if (see) { // gunman or heavy with a shot
          e.ang = Math.atan2(dy, dx);
          // The aiming line brightens as the shot comes: it is the warning.
          fx.lineStyle(e.k === 3 ? 2 : 1, 0xff4455, Phaser.Math.Clamp(1 - e.t / this.react, 0, 0.8)).lineBetween(e.x, e.y, q.x, q.y);
          if ((e.t -= dt) <= 0) {
            const burst = e.k === 3 && ++e.bn < 3; // a heavy fires three in a row
            e.t = burst ? TUNE.burstMs : this.eFire * (e.k === 3 ? 1.4 : 1);
            if (!burst) e.bn = 0;
            this.shoot(e.x + Math.cos(e.ang) * 10, e.y + Math.sin(e.ang) * 10, e.ang + (Math.random() - 0.5) * 2 * TUNE.spread, this.eBullet, true);
            noise(this, 90, 0.1, e.k === 3 ? 1500 : 3000);
          }
        } else { e.t = this.react; this.chase(e, (e.k === 3 ? TUNE.heavySpeed : TUNE.huntSpeed) * s, q); } // no shot: push toward you
      }
      e.img.setPosition(e.x, e.y).setRotation(e.ang);
    }
    // Keep bodies from stacking on one spot (a hostage stays put).
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const a = E[i], b = E[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (a.k !== 4 && b.k !== 4 && d < 15 && d > 0.01) { const k = (15 - d) / 2 / d; this.move(a, -dx * k, -dy * k, 7); this.move(b, dx * k, dy * k, 7); }
    }

    // ---- Bullets: short steps so a fast bullet never skips a wall ----
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * s) / 8));
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        b.x += (b.vx * s) / n; b.y += (b.vy * s) / n;
        if (this.solid(b.x, b.y)) { dead = true; this.sparks.explode(4, b.x, b.y); }
        else if (b.foe) { for (const p of ps) if (p.in && !p.down && Math.hypot(p.x - b.x, p.y - b.y) < 9) { dead = true; this.hurt(p); break; } }
        else for (const e of E) if (Math.hypot(e.x - b.x, e.y - b.y) < (e.k === 3 ? 15 : 12)) { dead = true; this.hit(e); break; }
      }
      if (dead) { b.img.destroy(); this.bullets.splice(i, 1); } else b.img.setPosition(b.x, b.y);
    }

    // ---- Grenades: thrown in an arc, bounce off walls, go off when the fuse ends ----
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i], K = n.K, h = Math.sin((1 - n.t / TUNE.fuseMs) * Math.PI); // height of the arc, 0..1
      this.fly(n, dt);
      fx.fillStyle(0x000000, 0.4).fillEllipse(n.x, n.y + 2, 12, 6); // its shadow on the floor
      fx.fillStyle(K.c, 0.08).fillCircle(n.x, n.y, K.r).lineStyle(2, K.c, 0.55 + 0.35 * Math.sin(time / 40)).strokeCircle(n.x, n.y, K.r);
      n.img.setPosition(n.x, n.y - h * 14).setScale(1.3 + h).setRotation(n.t / 60);
      if ((n.t -= dt) <= 0) { n.img.destroy(); this.nades.splice(i, 1); this.boom(n.x, n.y, K); }
    }

    // ---- Effects and HUD ----
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i], a = r.t / 320;
      if (a <= 1) fx.fillStyle(r.c, a * 0.3).fillCircle(r.x, r.y, r.r).lineStyle(4, r.c, a).strokeCircle(r.x, r.y, r.r * (1.05 - a * 0.5));
      if ((r.t -= rdt) <= 0) this.rings.splice(i, 1);
    }
    const top = OY * T + 4, tall = FLOOR_ROWS * T - 8;
    if (this.slow > 0) fx.lineStyle(8, 0x39e6ff, 0.55).strokeRect(4, top, W - 8, tall);
    else if (this.alarm) fx.lineStyle(8, 0xff2233, 0.45 + 0.3 * Math.sin(time / 120)).strokeRect(4, top, W - 8, tall);
    if (this.blind > 0) this.blind -= rdt;
    this.white.setAlpha(Phaser.Math.Clamp(this.blind / 400, 0, 1));
    for (const p of ps) if (p.in) {
      const y = 6 + p.i * 17;
      for (let j = 0; j < TUNE.hp; j++) fx.fillStyle(j < p.hp ? p.col : 0x24344d).fillRect(616 + j * 13, y, 10, 12);
      for (let j = 0; j < p.nadeN; j++) fx.fillStyle(KITS[p.k].c).fillCircle(668 + j * 12, y + 6, 4);
    }
    this.rowT[1].setAlpha(ps[1].in || (time / 400) % 2 < 1 ? 1 : 0.2);
    this.hudL.setText('SCORE ' + this.score + (this.mult > 1 ? '  x' + this.mult : ''));
    this.hudC.setText(this.alarm ? 'ALARM  FLOOR ' + this.floor : 'FLOOR ' + this.floor).setColor(this.alarm ? '#ff4455' : '#ffffff');

    // ---- Floor cleared: every room empty and the horde dead ----
    if (this.winT > 0) { if ((this.winT -= rdt) <= 0) this.nextFloor(); }
    else if (this.cleared === 5 && !E.length && !this.pending) {
      const bonus = Math.max(0, Math.round(TUNE.floorBonus - (this.floorT / 1000) * TUNE.bonusPerSec)) + (this.alarm ? 0 : TUNE.silent);
      this.score += bonus; this.winT = 1700;
      if (!this.alarm) this.silentN++;
      this.say((this.alarm ? 'FLOOR CLEAR +' : 'SILENT CLEAR +') + bonus, '#35d07f');
      [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 90, () => tone(this, f, 220, 'triangle', 0.08)));
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO, width: W, height: H, parent: 'game-root', backgroundColor: '#05080f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Title, Play],
});
