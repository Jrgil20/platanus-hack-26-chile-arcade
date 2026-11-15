// STACK UP — Platanus Hack 26 arcade challenge. One file, Phaser 3.87, no assets.
// Top-down tactical room clearing: kick the door, surprise the room, stop the radio call.
// Everything is drawn in code (canvas and Graphics), every sound is a Web Audio tone.

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
  // Aim assist: a shot goes to the visible enemy nearest to where you face, inside this cone (radians each side).
  assist: 0.6, laser: 330,
  // Surprise: how long a freshly kicked room cannot act, and the slow motion that goes with it.
  surpriseMs: 800, slowMs: 550, slowScale: 0.35,
  // Enemy reaction time is the main difficulty number; each *Step applies per floor.
  reactMs: 520, reactStep: 50, reactMin: 220,
  eFireMs: 900, eFireStep: 60, eFireMin: 450,
  eBullet: 330, eBulletStep: 25, spread: 0.07, sight: 520,
  huntSpeed: 70, rushSpeed: 150, rushStep: 8,
  callMs: 2400, callStep: 150, callMin: 1300,
  shooters: 2, shootersMax: 6, extraDoor: 0.35,
  horde: 6, hordeStep: 2, hordeAgain: 3, hordeEveryMs: 260,
  throwSpeed: 430, fuseMs: 850, grenades: 3, friction: 0.0022, blindMs: 900,
  kill: 100, rushKill: 50, clear: 250, multMax: 9,
  floorBonus: 3000, bonusPerSec: 25, silent: 1000,
};

// Grenades: one system, one row each. Every effect also applies to the player.
// r is the blast radius in pixels; rgb/body/band only colour the drawing.
const KITS = [
  { n: 'FLASH', d: 'BLINDS THE ROOM. NO DAMAGE.', c: 0xffffff, rgb: '255,255,255', body: '#c8d2dc', band: '#2f7bff', r: 80, stun: 2600 },
  { n: 'CONC', d: 'STUNS, SHOVES AND BLOWS DOORS OPEN.', c: 0x66ccff, rgb: '102,204,255', body: '#2c5d7a', band: '#66ccff', r: 75, stun: 1400, kb: 300, door: 1 },
  { n: 'FRAG', d: 'KILLS. BLOWS DOORS OPEN.', c: 0xffaa33, rgb: '255,170,51', body: '#3d5a2a', band: '#ffaa33', r: 70, kill: 1, door: 1 },
];

// ---- Map: a tile grid. 0 floor, 1 wall, 2 closed door, 3 open door, 4 street door, 5 crate ----
const T = 20, COLS = 40, ROWS = 30, OY = 2, RS = 13, FLOOR_ROWS = 27;
const idx = (tx, ty) => tx + ty * COLS;

// ---- Sound: short synth tones, no files. `to` slides the pitch. ----
function tone(scene, freq, ms, type = 'square', vol = 0.08, to) {
  const ctx = scene.sound.context; if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime, e = t + ms / 1000;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, e);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, e);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(e);
}

// ---- Textures: painted once on small canvases, people facing right, each with its own glow ----
function makeTextures(scene) {
  if (scene.textures.exists('player')) return;
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
  person('player', '57,230,255', '#17606f', (x) => {
    box(x, 21, 23, 16, 3, '#e8f6ff'); box(x, 21, 22, 6, 5, '#0d3a44'); // rifle and grip
    disc(x, 20, 20, 6, 6, '#39e6ff'); box(x, 23, 17, 3, 6, '#06222b'); // helmet and visor
  });
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
  tex('pb', 18, 8, (x) => { halo(x, 9, 4, 9, '120,240,255', 0.8); box(x, 3, 3, 12, 2, '#eaffff'); });
  tex('eb', 18, 8, (x) => { halo(x, 9, 4, 9, '255,140,50', 0.8); box(x, 3, 3, 12, 2, '#fff0d0'); });
  KITS.forEach((K, i) => tex('n' + i, 18, 18, (x) => { // grenade: body, cap, lever, coloured band
    halo(x, 9, 9, 9, K.rgb, 0.6);
    disc(x, 9, 10, 4, 5, K.body); box(x, 7, 3, 4, 3, '#d9d9d9'); box(x, 10, 2, 4, 2, '#d9d9d9'); box(x, 5, 9, 8, 2, K.band);
  }));
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
  scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color: color || '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

const BEST_KEY = 'stack-up-best';
let best = 0, kit = 0;

class Title extends Phaser.Scene {
  constructor() { super('title'); }
  create() {
    flush(); makeTextures(this);
    // A floor-plan backdrop: grid, one room, the operator at its door.
    const g = this.add.graphics();
    g.lineStyle(1, 0x14233c);
    for (let x = 0; x <= W; x += T) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += T) g.lineBetween(0, y, W, y);
    g.fillStyle(0x14213b).fillRect(360, 230, 300, 170).lineStyle(6, 0x6fb8ff).strokeRect(360, 230, 300, 170);
    g.fillStyle(0x05080f).fillRect(354, 290, 12, 50).fillStyle(0xffb020).fillRect(357, 294, 6, 42);
    this.add.image(315, 315, 'glow').setScale(5).setTint(0x39e6ff).setAlpha(0.25).setBlendMode(1);
    this.add.image(300, 315, 'player').setScale(2.4);
    this.add.image(400, 315, 'pb').setScale(2.4); this.add.image(455, 315, 'pb').setScale(2.4);
    this.add.image(530, 275, 'e0').setScale(2.2).setRotation(2.6);
    this.add.image(600, 350, 'e0').setScale(2.2).setRotation(3.4);
    this.add.image(480, 362, 'e1').setScale(2.2).setRotation(3.3);
    g.fillStyle(0x000000, 0.7).fillRect(450, 318, 60, 9).fillStyle(0xffe14a).fillRect(452, 320, 34, 5);

    const title = label(this, W / 2, 96, 'STACK UP', 92, '#39e6ff').setShadow(0, 0, '#39e6ff', 24, true, true);
    this.tweens.add({ targets: title, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, W / 2, 170, 'KICK THE DOOR. SURPRISE THE ROOM. STOP THE CALL.', 20, '#ffb020');
    this.kitIcon = this.add.image(W / 2 - 190, 436, 'n0').setScale(2.6);
    this.kitText = label(this, W / 2, 436, '', 26);
    this.kitDesc = label(this, W / 2, 466, '', 16, '#9fb6d6');
    this.bestText = label(this, W / 2, 500, 'BEST ' + best, 20, '#ffe14a');
    const p = label(this, W / 2, 540, 'PRESS START', 30, '#ff4455');
    this.tweens.add({ targets: p, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    label(this, W / 2, 580, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 14, '#5d7699');
    crt(this);
    this.showKit();
    getStorage().get(BEST_KEY).then((r) => {
      if (r && r.found && Number.isFinite(r.value) && r.value > best) { best = r.value; this.bestText.setText('BEST ' + best); }
    }).catch(() => {});
  }
  showKit() {
    this.kitIcon.setTexture('n' + kit);
    this.kitText.setText('<  GRENADE: ' + KITS[kit].n + '  >');
    this.kitDesc.setText(KITS[kit].d + '  A BAD THROW HITS YOU TOO.');
  }
  update() {
    const d = (take('P1_R') ? 1 : 0) - (take('P1_L') ? 1 : 0);
    if (d) { kit = (kit + d + 3) % 3; this.showKit(); tone(this, 520, 60); }
    if (take('START1') || take('P1_1')) { tone(this, 660, 120); this.scene.start('play'); }
  }
}

class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    flush();
    this.grid = new Uint8Array(COLS * ROWS);
    this.flow = new Int16Array(COLS * ROWS);
    this.score = 0; this.floor = 0; this.mult = 1; this.over = false; this.overT = 0;
    this.slow = 0; this.blind = 0; this.winT = 0; this.sirenT = 0;
    this.enemies = []; this.bullets = []; this.nades = []; this.rings = [];
    this.mapG = this.add.graphics();
    this.decal = this.add.graphics().setDepth(1);
    // The operator's pool of light: it makes the room you stand in read as lit.
    this.light = this.add.image(0, 0, 'glow').setDepth(2).setBlendMode(1).setTint(0x9fdcff).setAlpha(0.2).setScale(6.5);
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
    this.p = { x: 0, y: 0, ang: 0, cd: 0, hp: TUNE.hp, inv: 0, kx: 0, ky: 0, slow: 0, img: this.add.image(0, 0, 'player').setDepth(3).setScale(1.2) };
    this.white = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(9).setAlpha(0);
    const hud = (x, ox) => this.add.text(x, 9, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(ox, 0).setDepth(10);
    this.hudL = hud(12, 0); this.hudC = hud(W / 2, 0.5); this.hudR = hud(W - 74, 1).setText(KITS[kit].n);
    label(this, W / 2, 590, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 13, '#3f5878').setDepth(10);
    this.banner = label(this, W / 2, 300, '', 44).setDepth(11).setAlpha(0).setShadow(0, 0, '#000000', 8, true, true);
    crt(this);
    this.nextFloor();
  }

  // ---- Floor ----
  nextFloor() {
    const f = ++this.floor, p = this.p, s = f - 1;
    for (const o of [...this.enemies, ...this.bullets, ...this.nades]) o.img.destroy();
    this.enemies = []; this.bullets = []; this.nades = []; this.rings = [];
    this.decal.clear();
    this.alarm = false; this.pending = 0; this.spawnT = 0; this.floorT = 0; this.cleared = 0; this.flowT = 0;
    this.nadeN = TUNE.grenades;
    this.react = Math.max(TUNE.reactMin, TUNE.reactMs - TUNE.reactStep * s);
    this.eFire = Math.max(TUNE.eFireMin, TUNE.eFireMs - TUNE.eFireStep * s);
    this.eBullet = TUNE.eBullet + TUNE.eBulletStep * s;
    this.callMs = Math.max(TUNE.callMin, TUNE.callMs - TUNE.callStep * s);
    if (s) p.hp = Math.min(TUNE.hp, p.hp + 1);
    this.build();
    this.say('FLOOR ' + f, '#39e6ff');
    tone(this, 440, 140, 'square', 0.06, 880);
    if (!s) {
      const h = this.hint = label(this, W / 2, 346, 'WALK INTO A DOOR TO KICK IT IN', 18, '#ffb020').setDepth(11);
      this.tweens.add({ targets: h, alpha: 0, delay: 3500, duration: 600 });
    }
  }

  build() {
    const g = this.grid.fill(1), f = this.floor;
    this.rooms = []; this.doors = []; this.doorAt = {};
    for (let i = 0; i < 6; i++) {
      const x0 = 1 + (i % 3) * RS, y0 = OY + 1 + ((i / 3) | 0) * RS;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) g[idx(x0 + x, y0 + y)] = 0;
      this.rooms.push({ x0, y0, st: 0, left: 0 }); // st: 0 hidden, 1 awake, 2 clear
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
      const A = this.rooms[a], k = Phaser.Math.Between(1, 9), d = { tiles: [], a, b, open: false, x: 0, y: 0 };
      for (let j = 0; j < 2; j++) {
        const tx = b === a + 1 ? A.x0 + 12 : A.x0 + k + j, ty = b === a + 1 ? A.y0 + k + j : A.y0 + 12, t = idx(tx, ty);
        g[t] = 2; this.doorAt[t] = d; d.tiles.push(t);
        d.x += (tx * T + T / 2) / 2; d.y += (ty * T + T / 2) / 2;
      }
      this.doors.push(d);
    }
    // Entry room: already clear, with the street door the horde comes through.
    const en = Phaser.Math.Between(0, 5), E = this.rooms[en], top = en < 3, wy = top ? E.y0 - 1 : E.y0 + 12;
    E.st = 2;
    g[idx(E.x0 + 5, wy)] = g[idx(E.x0 + 6, wy)] = 4;
    this.sx = (E.x0 + 6) * T; this.sy = (top ? E.y0 + 1 : E.y0 + 11) * T;
    for (let i = 0; i < 6; i++) {
      const R = this.rooms[i];
      this.fogs[i].setVisible(i !== en).setAlpha(0.97);
      if (i === en) continue;
      // Two stacks of crates for cover, kept two tiles off the walls so no door is ever blocked.
      for (let n = 0; n < 2; n++) {
        const px = R.x0 + Phaser.Math.Between(2, 8), py = R.y0 + Phaser.Math.Between(2, 8);
        g[idx(px, py)] = g[idx(px + 1, py)] = g[idx(px, py + 1)] = g[idx(px + 1, py + 1)] = 5;
      }
      const n = Math.min(TUNE.shootersMax, TUNE.shooters + ((f - 1) >> 1) + Phaser.Math.Between(0, 1));
      for (let k = 0; k <= n; k++) this.spawn(k ? 0 : 1, i); // one lookout, then the gunmen
    }
    const p = this.p;
    p.x = this.sx; p.y = this.sy; p.kx = p.ky = 0; p.ang = top ? Math.PI / 2 : -Math.PI / 2;
    this.drawMap();
  }

  // kind: 0 gunman, 1 lookout (radio), 2 thug (horde). room -1 = no room.
  spawn(k, room, x, y) {
    if (room >= 0) {
      const R = this.rooms[room];
      for (let tries = 0; tries < 200; tries++) {
        const tx = R.x0 + Phaser.Math.Between(0, 11), ty = R.y0 + Phaser.Math.Between(0, 11);
        x = tx * T + T / 2; y = ty * T + T / 2;
        if (!this.grid[idx(tx, ty)] && !this.doors.some((d) => (d.a === room || d.b === room) && Math.hypot(d.x - x, d.y - y) < 75)) break;
      }
      R.left++;
    }
    const img = this.add.image(x, y, 'e' + k).setDepth(3).setScale(1.2).setVisible(room < 0);
    this.enemies.push({ k, room, x, y, ang: Math.random() * 6.28, stun: 0, t: 0, call: 0, bt: 0, seen: false, kx: 0, ky: 0, img });
  }

  // Redrawn when a door opens or a room changes state: lit rooms and cleared rooms look different.
  drawMap() {
    const m = this.mapG.clear(), g = this.grid;
    for (let ty = OY; ty < OY + FLOOR_ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const i = idx(tx, ty), t = g[i], x = tx * T, y = ty * T;
      if (t === 1) { // wall: dark slab with a bright edge wherever it faces open floor
        m.fillStyle(0x16304f).fillRect(x, y, T, T).fillStyle(0x6fb8ff);
        if (g[i - 1] !== 1) m.fillRect(x, y, 2, T);
        if (g[i + 1] !== 1) m.fillRect(x + T - 2, y, 2, T);
        if (g[i - COLS] !== 1) m.fillRect(x, y, T, 2);
        if (g[i + COLS] !== 1) m.fillRect(x, y + T - 2, T, 2);
        continue;
      }
      const R = this.rooms[(((tx - 1) / RS) | 0) + 3 * (((ty - OY - 1) / RS) | 0)];
      m.fillStyle([0x0a1322, 0x14213b, 0x0e2824][R ? R.st : 1] + ((tx + ty) & 1 ? 0x030506 : 0)).fillRect(x, y, T, T);
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
  // Distance in tiles from every reachable tile to the player; chasers walk downhill.
  flood() {
    const f = this.flow.fill(-1), g = this.grid, q = [idx((this.p.x / T) | 0, (this.p.y / T) | 0)];
    f[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], d = f[c] + 1;
      for (const n of [c - 1, c + 1, c - COLS, c + COLS]) if (f[n] < 0 && (g[n] === 0 || g[n] === 3)) { f[n] = d; q.push(n); }
    }
  }
  chase(e, step) {
    const p = this.p, c = idx((e.x / T) | 0, (e.y / T) | 0), f = this.flow;
    let tx = p.x, ty = p.y, best = f[c];
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
    tone(this, 150, 170, 'sawtooth', 0.16, 45);
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
    this.pending += this.alarm ? TUNE.hordeAgain + this.floor : TUNE.horde + TUNE.hordeStep * this.floor;
    this.alarm = true;
    this.say('ALARM!', '#ff4455');
    this.cameras.main.flash(200, 255, 40, 40);
  }

  // ---- Combat ----
  shoot(x, y, a, sp, foe) {
    const img = this.add.image(x, y, foe ? 'eb' : 'pb').setRotation(a).setDepth(3).setBlendMode(1);
    this.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, foe, img });
    this.flare(x + Math.cos(a) * 6, y + Math.sin(a) * 6, foe ? 0xff9a3c : 0xcff6ff, 0.5, 70);
  }
  kill(e) {
    const sur = e.stun > 0, d = this.decal;
    this.enemies.splice(this.enemies.indexOf(e), 1);
    e.img.destroy();
    this.blood.explode(18, e.x, e.y);
    this.flare(e.x, e.y, 0xff3355, 1.6, 200);
    // What stays on the floor: a body and its blood.
    d.fillStyle(0x7a0c1e, 0.55);
    for (let i = 0; i < 4; i++) d.fillCircle(e.x + Phaser.Math.Between(-12, 12), e.y + Phaser.Math.Between(-12, 12), Phaser.Math.Between(3, 8));
    d.fillStyle([0x5a1018, 0x6b5a10, 0x55103f][e.k], 0.9).fillEllipse(e.x, e.y, 17, 12);
    tone(this, 220, 90, 'square', 0.06, 70);
    if (e.k === 2) this.score += TUNE.rushKill;
    else {
      this.mult = sur ? Math.min(TUNE.multMax, this.mult + 1) : 1;
      this.score += TUNE.kill * this.mult;
      if (sur) this.pop(e.x, e.y - 16, 'x' + this.mult, '#ffe14a', 22);
    }
    if (e.room >= 0 && !--this.rooms[e.room].left) {
      const R = this.rooms[e.room];
      R.st = 2; this.cleared++; this.score += TUNE.clear;
      this.drawMap();
      this.pop((R.x0 + 6) * T, (R.y0 + 6) * T, 'ROOM CLEAR +' + TUNE.clear, '#35d07f', 24);
      [523, 659, 784].forEach((f, i) => this.time.delayedCall(i * 70, () => tone(this, f, 160, 'triangle', 0.07)));
    }
  }
  hurt() {
    const p = this.p;
    if (p.inv > 0 || this.over) return;
    p.hp--; p.inv = TUNE.invulnMs; this.mult = 1;
    this.cameras.main.shake(200, 0.014); this.cameras.main.flash(160, 255, 40, 40);
    tone(this, 180, 260, 'sawtooth', 0.16, 60);
    if (p.hp <= 0) this.die();
  }
  die() {
    const p = this.p;
    this.over = true; this.overT = 700; flush();
    p.img.setVisible(false); this.light.setVisible(false); this.blood.explode(50, p.x, p.y);
    this.cameras.main.shake(400, 0.02);
    tone(this, 200, 700, 'sawtooth', 0.18, 40);
    if (this.score > best) { best = this.score; getStorage().set(BEST_KEY, best); }
    this.banner.setVisible(false); if (this.hint) this.hint.setVisible(false);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(11);
    label(this, W / 2, 220, 'OPERATOR DOWN', 56, '#ff4455').setDepth(12).setShadow(0, 0, '#ff4455', 18, true, true);
    label(this, W / 2, 300, 'SCORE ' + this.score + '    FLOOR ' + this.floor, 28).setDepth(12);
    label(this, W / 2, 345, 'BEST ' + best, 24, '#ffe14a').setDepth(12);
    label(this, W / 2, 420, 'B1 / START: GO AGAIN        B2: MENU', 20, '#9fb6d6').setDepth(12);
  }
  boom(x, y) {
    const K = KITS[kit], p = this.p;
    // Each grenade looks different: white burst, blue shock rings, orange fireball with a scorch mark.
    for (let i = 0; i < (K.kb ? 3 : 1); i++) this.rings.push({ x, y, r: K.r, t: 320 + i * 90, c: K.c });
    this.flare(x, y, K.c, (K.r * 3) / 64, K.kill ? 450 : 320);
    this.cameras.main.shake(K.kill ? 320 : 180, K.kill ? 0.02 : 0.01);
    tone(this, K.kill ? 110 : 1900, 420, K.kill ? 'sawtooth' : 'sine', 0.2, K.kill ? 30 : 500);
    this.sparks.explode(K.kill ? 60 : 26, x, y);
    if (K.kill) this.decal.fillStyle(0x000000, 0.5).fillCircle(x, y, K.r * 0.5);
    else if (!K.kb) this.cameras.main.flash(90, 255, 255, 255);
    if (K.door) for (const d of this.doors) if (Math.hypot(d.x - x, d.y - y) < K.r) this.openDoor(d);
    for (const e of this.enemies.slice()) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > K.r || !this.los(x, y, e.x, e.y)) continue;
      if (K.kill) { this.kill(e); continue; }
      e.stun = Math.max(e.stun, K.stun);
      if (K.kb) { e.kx = ((e.x - x) / (d || 1)) * K.kb; e.ky = ((e.y - y) / (d || 1)) * K.kb; }
    }
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < K.r && this.los(x, y, p.x, p.y)) {
      if (K.kill) this.hurt();
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
    const t = label(this, x, y, s, size || 16, color).setDepth(11).setShadow(0, 0, '#000000', 6, true, true);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 850, onComplete: () => t.destroy() });
  }
  // A burst of light that swells and fades: muzzle flashes, kicked doors, kills, explosions.
  flare(x, y, tint, scale, ms) {
    const g = this.add.image(x, y, 'glow').setDepth(6).setBlendMode(1).setTint(tint).setScale(scale * 0.35);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  update(time, delta) {
    const rdt = Math.min(delta, 50), p = this.p, fx = this.fx.clear(), E = this.enemies, K = KITS[kit];
    if (this.over) {
      if ((this.overT -= rdt) < 0) {
        if (take('START1') || take('P1_1')) this.scene.restart();
        else if (take('P1_2')) this.scene.start('title');
      }
      return;
    }
    // One clock: every gameplay timer counts in dt, so slow motion slows all of them.
    if (this.slow > 0) this.slow -= rdt;
    const dt = rdt * (this.slow > 0 ? TUNE.slowScale : 1), s = dt / 1000;
    this.floorT += dt;
    if ((this.flowT -= rdt) <= 0) { this.flowT = 200; this.flood(); }

    // ---- Player ----
    const mx = (held.P1_R ? 1 : 0) - (held.P1_L ? 1 : 0), my = (held.P1_D ? 1 : 0) - (held.P1_U ? 1 : 0);
    if (mx || my) {
      if (!held.P1_1) p.ang = Math.atan2(my, mx); // holding fire locks the aim: strafe
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
    // Aim assist: among enemies in sight, take the one nearest to where you face.
    let aim = p.ang, tgt = null, near = TUNE.assist;
    for (const e of E) {
      if (e.room >= 0 && !this.rooms[e.room].st) continue;
      const a = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - p.y, e.x - p.x) - p.ang));
      if (a < near && this.los(p.x, p.y, e.x, e.y)) { near = a; tgt = e; }
    }
    if (tgt) aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    const ca = Math.cos(aim), sa = Math.sin(aim);
    // Laser sight: shows exactly where the next shot goes, and rings the enemy it will hit.
    let lx = p.x, ly = p.y;
    for (let d = 0; d < TUNE.laser && !this.solid(lx + ca * 8, ly + sa * 8); d += 8) { lx += ca * 8; ly += sa * 8; }
    fx.lineStyle(1, 0x39e6ff, 0.4).lineBetween(p.x + ca * 16, p.y + sa * 16, lx, ly);
    if (tgt) fx.lineStyle(2, 0x39e6ff, 0.9).strokeCircle(tgt.x, tgt.y, 15);
    if ((p.cd -= dt) <= 0 && held.P1_1) {
      p.cd = TUNE.fireMs;
      this.shoot(p.x + ca * 10, p.y + sa * 10, aim, TUNE.bullet, false);
      tone(this, 880, 45, 'square', 0.03, 300);
    }
    // Where a grenade thrown now would go off, and how far its blast reaches.
    if (this.nadeN > 0) {
      const q = { x: p.x, y: p.y, vx: Math.cos(p.ang) * TUNE.throwSpeed, vy: Math.sin(p.ang) * TUNE.throwSpeed };
      for (let t = 0; t < TUNE.fuseMs; t += 16) this.fly(q, 16);
      fx.lineStyle(1, K.c, 0.22).strokeCircle(q.x, q.y, K.r).lineStyle(2, K.c, 0.5)
        .lineBetween(q.x - 5, q.y - 5, q.x + 5, q.y + 5).lineBetween(q.x - 5, q.y + 5, q.x + 5, q.y - 5);
      if (take('P1_2')) {
        this.nadeN--;
        const img = this.add.image(p.x, p.y, 'n' + kit).setDepth(6);
        this.nades.push({ x: p.x, y: p.y, vx: Math.cos(p.ang) * TUNE.throwSpeed, vy: Math.sin(p.ang) * TUNE.throwSpeed, t: TUNE.fuseMs, img });
        tone(this, 300, 90, 'triangle', 0.06, 600);
      }
    }
    p.img.setPosition(p.x, p.y).setRotation(aim).setAlpha(p.inv > 0 && (time / 60) % 2 < 1 ? 0.3 : 1);
    this.light.setPosition(p.x, p.y);

    // ---- Horde: enters by the street door, one thug at a time ----
    if (this.pending > 0 && (this.spawnT -= dt) <= 0) {
      this.spawnT = TUNE.hordeEveryMs; this.pending--;
      this.spawn(2, -1, this.sx + Phaser.Math.Between(-12, 12), this.sy);
    }
    if (this.pending > 0 && (this.sirenT -= rdt) <= 0) {
      this.sirenT = 420; this.siren = !this.siren;
      tone(this, this.siren ? 880 : 660, 300, 'square', 0.035);
    }

    // ---- Enemies ----
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      if (e.room >= 0 && !this.rooms[e.room].st) continue; // still behind closed doors
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
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
        const see = dist < TUNE.sight && this.los(e.x, e.y, p.x, p.y);
        if (e.k === 2) {
          this.chase(e, (TUNE.rushSpeed + TUNE.rushStep * this.floor) * s);
          if (dist < 15 && p.inv <= 0) { this.hurt(); e.kx = (-dx / (dist || 1)) * 260; e.ky = (-dy / (dist || 1)) * 260; }
        } else if (e.k === 1 && (e.seen || see)) {
          // The lookout calls for backup once he has seen you. Kill him before the bar fills.
          if (!e.seen) this.pop(e.x, e.y - 30, 'CALLING BACKUP!', '#ffe14a', 18);
          e.seen = true; e.ang = Math.atan2(dy, dx);
          if ((e.bt -= dt) <= 0) { e.bt = 280; tone(this, 1300, 50, 'square', 0.04); this.flare(e.x, e.y, 0xffe14a, 1.5, 250); }
          if ((e.call += dt) >= this.callMs) { e.k = 0; e.img.setTexture('e0'); e.t = this.react; this.raise(); }
          fx.fillStyle(0x000000, 0.75).fillRect(e.x - 19, e.y - 25, 38, 8)
            .fillStyle(0xffe14a).fillRect(e.x - 18, e.y - 24, (36 * e.call) / this.callMs, 6);
        } else if (e.k === 0) {
          if (see) {
            e.ang = Math.atan2(dy, dx);
            // The aiming line brightens as the shot comes: it is the warning.
            fx.lineStyle(1, 0xff4455, Math.min(0.8, 1 - e.t / this.react)).lineBetween(e.x, e.y, p.x, p.y);
            if ((e.t -= dt) <= 0) {
              e.t = this.eFire;
              this.shoot(e.x + Math.cos(e.ang) * 10, e.y + Math.sin(e.ang) * 10, e.ang + (Math.random() - 0.5) * 2 * TUNE.spread, this.eBullet, true);
              tone(this, 320, 70, 'sawtooth', 0.04, 120);
            }
          } else { e.t = this.react; this.chase(e, TUNE.huntSpeed * s); } // no shot: push toward you
        }
      }
      e.img.setPosition(e.x, e.y).setRotation(e.ang);
    }
    // Keep bodies from stacking on one spot.
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const a = E[i], b = E[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < 15 && d > 0.01) { const k = (15 - d) / 2 / d; this.move(a, -dx * k, -dy * k, 7); this.move(b, dx * k, dy * k, 7); }
    }

    // ---- Bullets: short steps so a fast bullet never skips a wall ----
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * s) / 8));
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        b.x += (b.vx * s) / n; b.y += (b.vy * s) / n;
        if (this.solid(b.x, b.y)) { dead = true; this.sparks.explode(4, b.x, b.y); }
        else if (b.foe) { if (Math.hypot(p.x - b.x, p.y - b.y) < 9) { dead = true; this.hurt(); } }
        else for (const e of E) if (Math.hypot(e.x - b.x, e.y - b.y) < 12) { dead = true; this.kill(e); break; }
      }
      if (dead) { b.img.destroy(); this.bullets.splice(i, 1); } else b.img.setPosition(b.x, b.y);
    }

    // ---- Grenades: thrown in an arc, bounce off walls, go off when the fuse ends ----
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i], h = Math.sin((1 - n.t / TUNE.fuseMs) * Math.PI); // height of the arc, 0..1
      this.fly(n, dt);
      fx.fillStyle(0x000000, 0.4).fillEllipse(n.x, n.y + 2, 12, 6); // its shadow on the floor
      fx.fillStyle(K.c, 0.08).fillCircle(n.x, n.y, K.r).lineStyle(2, K.c, 0.55 + 0.35 * Math.sin(time / 40)).strokeCircle(n.x, n.y, K.r);
      n.img.setPosition(n.x, n.y - h * 14).setScale(1.3 + h).setRotation(n.t / 60);
      if ((n.t -= dt) <= 0) { n.img.destroy(); this.nades.splice(i, 1); this.boom(n.x, n.y); }
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
    for (let i = 0; i < TUNE.hp; i++) fx.fillStyle(i < p.hp ? 0x39e6ff : 0x24344d).fillRect(250 + i * 20, 11, 15, 17);
    for (let i = 0; i < TUNE.grenades; i++) fx.fillStyle(i < this.nadeN ? K.c : 0x24344d).fillCircle(W - 58 + i * 20, 20, 7);
    this.hudL.setText('SCORE ' + this.score + (this.mult > 1 ? '  x' + this.mult : ''));
    this.hudC.setText(this.alarm ? 'ALARM  FLOOR ' + this.floor : 'FLOOR ' + this.floor).setColor(this.alarm ? '#ff4455' : '#ffffff');

    // ---- Floor cleared: every room empty and the horde dead ----
    if (this.winT > 0) { if ((this.winT -= rdt) <= 0) this.nextFloor(); }
    else if (this.cleared === 5 && !E.length && !this.pending) {
      const bonus = Math.max(0, Math.round(TUNE.floorBonus - (this.floorT / 1000) * TUNE.bonusPerSec)) + (this.alarm ? 0 : TUNE.silent);
      this.score += bonus; this.winT = 1700;
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
