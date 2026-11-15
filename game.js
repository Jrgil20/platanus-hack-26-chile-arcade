// STACK UP — Platanus Hack 26 arcade challenge. One file, Phaser 3.87, no assets.
// Top-down tactical room clearing: kick the door, surprise the room, stop the radio call.
// Everything drawn with Graphics, every sound a Web Audio tone.

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
  throwSpeed: 430, fuseMs: 850, grenades: 3, friction: 0.0022,
  kill: 100, rushKill: 50, clear: 250, multMax: 9,
  floorBonus: 3000, bonusPerSec: 25, silent: 1000,
};

// Grenades: one system, one row each. Every effect also applies to the player.
const KITS = [
  { n: 'FLASH', d: 'BLINDS THE ROOM. NO DAMAGE.', c: 0xffffff, r: 115, stun: 2600 },
  { n: 'CONC', d: 'STUNS, SHOVES AND BLOWS DOORS OPEN.', c: 0x66ccff, r: 100, stun: 1400, kb: 300, door: 1 },
  { n: 'FRAG', d: 'KILLS. BLOWS DOORS OPEN.', c: 0xffaa33, r: 85, kill: 1, door: 1 },
];

// ---- Map: a tile grid. 0 floor, 1 wall, 2 closed door, 3 open door, 4 street door ----
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

// ---- Textures: drawn once, all facing right ----
function makeTextures(scene) {
  if (scene.textures.exists('player')) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Operator: cyan body, dark helmet, white rifle.
  g.fillStyle(0x39e6ff).fillCircle(10, 10, 7).fillStyle(0x0b2a3a).fillCircle(9, 10, 3)
    .fillStyle(0xffffff).fillRect(12, 8, 8, 3).generateTexture('player', 20, 20).clear();
  // Gunman: red body, dark hat, grey pistol.
  g.fillStyle(0xff4455).fillCircle(10, 10, 7).fillStyle(0x3a0a12).fillRect(5, 6, 6, 8)
    .fillStyle(0xbfc7d5).fillRect(13, 9, 6, 2).generateTexture('e0', 20, 20).clear();
  // Lookout: yellow body with a radio and its antenna.
  g.fillStyle(0xffe14a).fillCircle(10, 10, 7).fillStyle(0x3a3205).fillRect(8, 3, 5, 6)
    .fillStyle(0xffffff).fillRect(12, 1, 1, 6).generateTexture('e1', 20, 20).clear();
  // Thug (horde): a magenta wedge that charges.
  g.fillStyle(0xff3dc8).fillTriangle(19, 10, 3, 2, 3, 18).fillStyle(0x3a0a2e).fillRect(8, 7, 3, 6)
    .generateTexture('e2', 20, 20).clear();
  g.fillStyle(0xbff6ff).fillRect(0, 0, 8, 2).generateTexture('pb', 8, 2).clear();
  g.fillStyle(0xff9a3c).fillRect(0, 0, 8, 3).generateTexture('eb', 8, 3).clear();
  g.fillStyle(0xffffff).fillCircle(5, 5, 4).fillStyle(0x222222).fillRect(4, 0, 2, 3).generateTexture('nade', 10, 10).clear();
  g.fillStyle(0xffffff).fillRect(0, 0, 2, 2).generateTexture('dot', 2, 2).destroy();
}

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
    g.lineStyle(6, 0x4f8fd6).strokeRect(360, 230, 300, 170);
    g.fillStyle(0x05080f).fillRect(354, 290, 12, 50).fillStyle(0xffb020).fillRect(357, 294, 6, 42);
    this.add.image(300, 315, 'player').setScale(3.2);
    g.fillStyle(0xbff6ff).fillRect(380, 313, 26, 4).fillRect(430, 313, 26, 4);
    this.add.image(520, 275, 'e0').setScale(3).setRotation(2.6);
    this.add.image(590, 350, 'e0').setScale(3).setRotation(3.4);
    this.add.image(470, 365, 'e1').setScale(3).setRotation(3.3);
    g.fillStyle(0x000000, 0.7).fillRect(440, 322, 60, 9).fillStyle(0xffe14a).fillRect(442, 324, 34, 5);

    label(this, W / 2, 96, 'STACK UP', 92, '#39e6ff');
    label(this, W / 2, 170, 'KICK THE DOOR. SURPRISE THE ROOM. STOP THE CALL.', 20, '#ffb020');
    this.kitText = label(this, W / 2, 436, '', 26);
    this.kitDesc = label(this, W / 2, 466, '', 16, '#9fb6d6');
    this.bestText = label(this, W / 2, 500, 'BEST ' + best, 20, '#ffe14a');
    const p = label(this, W / 2, 540, 'PRESS START', 30, '#ff4455');
    this.tweens.add({ targets: p, alpha: 0.15, duration: 500, yoyo: true, repeat: -1 });
    label(this, W / 2, 580, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 14, '#5d7699');
    this.showKit();
    getStorage().get(BEST_KEY).then((r) => {
      if (r && r.found && Number.isFinite(r.value) && r.value > best) { best = r.value; this.bestText.setText('BEST ' + best); }
    }).catch(() => {});
  }
  showKit() {
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
    this.fx = this.add.graphics().setDepth(4);
    this.fogs = [];
    for (let i = 0; i < 6; i++) {
      const x = (1 + (i % 3) * RS) * T, y = (OY + 1 + ((i / 3) | 0) * RS) * T;
      this.fogs.push(this.add.rectangle(x, y, 12 * T, 12 * T, 0x04070d).setOrigin(0).setDepth(5));
    }
    const parts = (tint) => this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 230 }, lifespan: 420, scale: { start: 2.2, end: 0 }, tint, emitting: false,
    }).setDepth(4);
    this.blood = parts(0xff3355); this.sparks = parts(0xffd27a);
    this.p = { x: 0, y: 0, ang: 0, cd: 0, hp: TUNE.hp, inv: 0, kx: 0, ky: 0, slow: 0, img: this.add.image(0, 0, 'player').setDepth(3) };
    this.white = this.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0).setDepth(9).setAlpha(0);
    const hud = (x, ox) => this.add.text(x, 9, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(ox, 0).setDepth(10);
    this.hudL = hud(12, 0); this.hudC = hud(W / 2, 0.5); this.hudR = hud(W - 12, 1);
    label(this, W / 2, 590, 'STICK: MOVE    B1: FIRE (HOLD TO LOCK AIM)    B2: GRENADE', 13, '#3f5878').setDepth(10);
    this.banner = label(this, W / 2, 300, '', 44).setDepth(11).setAlpha(0);
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
      // Two pillars for cover, kept two tiles off the walls so no door is ever blocked.
      for (let n = 0; n < 2; n++) {
        const px = R.x0 + Phaser.Math.Between(2, 8), py = R.y0 + Phaser.Math.Between(2, 8);
        g[idx(px, py)] = g[idx(px + 1, py)] = g[idx(px, py + 1)] = g[idx(px + 1, py + 1)] = 1;
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
    const img = this.add.image(x, y, 'e' + k).setDepth(3).setVisible(room < 0);
    this.enemies.push({ k, room, x, y, ang: Math.random() * 6.28, stun: 0, t: 0, call: 0, bt: 0, seen: false, kx: 0, ky: 0, img });
  }

  drawMap() {
    const m = this.mapG.clear(), top = OY * T, bot = (OY + FLOOR_ROWS) * T;
    m.fillStyle(0x0a1322).fillRect(0, top, W, bot - top).lineStyle(1, 0x14233c);
    for (let x = 0; x <= W; x += T) m.lineBetween(x, top, x, bot);
    for (let y = top; y <= bot; y += T) m.lineBetween(0, y, W, y);
    for (let ty = OY; ty < OY + FLOOR_ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const t = this.grid[idx(tx, ty)], x = tx * T, y = ty * T;
      if (t === 1) m.fillStyle(0x1d3a5f).fillRect(x, y, T, T).lineStyle(1, 0x4f8fd6, 0.55).strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      else if (t === 2) m.fillStyle(0xffb020).fillRect(x + 1, y + 1, T - 2, T - 2);
      else if (t === 3) m.fillStyle(0xffb020, 0.3).fillRect(x + 2, y + 2, 5, 5).fillRect(x + 12, y + 11, 6, 4);
      else if (t === 4) m.fillStyle(0x35d07f).fillRect(x + 1, y + 1, T - 2, T - 2);
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

  // ---- Doors, rooms, alarm ----
  openDoor(d) {
    if (d.open) return;
    d.open = true;
    for (const t of d.tiles) this.grid[t] = 3;
    this.drawMap(); this.flowT = 0;
    this.sparks.explode(16, d.x, d.y);
    this.cameras.main.shake(140, 0.008);
    tone(this, 150, 170, 'sawtooth', 0.16, 45);
    let woke = false;
    for (const r of [d.a, d.b]) if (this.wake(r)) woke = true;
    if (woke && !this.alarm) this.slow = TUNE.slowMs;
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
    const img = this.add.image(x, y, foe ? 'eb' : 'pb').setRotation(a).setDepth(3);
    this.bullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, foe, img });
  }
  kill(e) {
    const sur = e.stun > 0;
    this.enemies.splice(this.enemies.indexOf(e), 1);
    e.img.destroy();
    this.blood.explode(14, e.x, e.y);
    this.decal.fillStyle(0x8a1026, 0.5).fillCircle(e.x, e.y, 7 + Math.random() * 6);
    tone(this, 220, 90, 'square', 0.06, 70);
    if (e.k === 2) this.score += TUNE.rushKill;
    else {
      this.mult = sur ? Math.min(TUNE.multMax, this.mult + 1) : 1;
      this.score += TUNE.kill * this.mult;
      if (sur) this.pop(e.x, e.y - 14, 'x' + this.mult, '#ffe14a');
    }
    if (e.room >= 0 && !--this.rooms[e.room].left) {
      const R = this.rooms[e.room];
      R.st = 2; this.cleared++; this.score += TUNE.clear;
      this.pop((R.x0 + 6) * T, (R.y0 + 6) * T, 'CLEAR +' + TUNE.clear, '#35d07f');
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
    p.img.setVisible(false); this.blood.explode(40, p.x, p.y);
    this.cameras.main.shake(400, 0.02);
    tone(this, 200, 700, 'sawtooth', 0.18, 40);
    if (this.score > best) { best = this.score; getStorage().set(BEST_KEY, best); }
    this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(11);
    label(this, W / 2, 220, 'OPERATOR DOWN', 56, '#ff4455').setDepth(12);
    label(this, W / 2, 300, 'SCORE ' + this.score + '    FLOOR ' + this.floor, 28).setDepth(12);
    label(this, W / 2, 345, 'BEST ' + best, 24, '#ffe14a').setDepth(12);
    label(this, W / 2, 420, 'B1 / START: GO AGAIN        B2: MENU', 20, '#9fb6d6').setDepth(12);
  }
  boom(x, y) {
    const K = KITS[kit], p = this.p;
    this.rings.push({ x, y, r: K.r, t: 320, c: K.c });
    this.cameras.main.shake(K.kill ? 320 : 180, K.kill ? 0.02 : 0.01);
    tone(this, K.kill ? 110 : 1900, 420, K.kill ? 'sawtooth' : 'sine', 0.2, K.kill ? 30 : 500);
    this.sparks.explode(26, x, y);
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
      else if (K.kb) { p.kx = ((p.x - x) / (d || 1)) * K.kb; p.ky = ((p.y - y) / (d || 1)) * K.kb; p.slow = 1500; }
      else this.blind = 1600;
    }
  }

  // ---- Feedback ----
  say(s, color) {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(s).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 800, duration: 400 });
  }
  pop(x, y, s, color) {
    const t = label(this, x, y, s, 16, color).setDepth(11);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 750, onComplete: () => t.destroy() });
  }

  update(time, delta) {
    const rdt = Math.min(delta, 50), p = this.p, fx = this.fx.clear();
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
    if ((p.cd -= dt) <= 0 && held.P1_1) {
      p.cd = TUNE.fireMs;
      this.shoot(p.x + Math.cos(p.ang) * 10, p.y + Math.sin(p.ang) * 10, p.ang, TUNE.bullet, false);
      tone(this, 880, 45, 'square', 0.03, 300);
    }
    if (take('P1_2') && this.nadeN > 0) {
      this.nadeN--;
      const img = this.add.image(p.x, p.y, 'nade').setDepth(3).setTint(KITS[kit].c);
      this.nades.push({ x: p.x, y: p.y, vx: Math.cos(p.ang) * TUNE.throwSpeed, vy: Math.sin(p.ang) * TUNE.throwSpeed, t: TUNE.fuseMs, img });
      tone(this, 300, 90, 'triangle', 0.06, 600);
    }
    p.img.setPosition(p.x, p.y).setRotation(p.ang).setAlpha(p.inv > 0 && (time / 60) % 2 < 1 ? 0.3 : 1);

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
    const E = this.enemies;
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
        fx.lineStyle(2, 0xffffff, 0.7).strokeCircle(e.x, e.y, 11);
      } else {
        e.img.setAlpha(1);
        const see = dist < TUNE.sight && this.los(e.x, e.y, p.x, p.y);
        if (e.k === 2) {
          this.chase(e, (TUNE.rushSpeed + TUNE.rushStep * this.floor) * s);
          if (dist < 15 && p.inv <= 0) { this.hurt(); e.kx = (-dx / (dist || 1)) * 260; e.ky = (-dy / (dist || 1)) * 260; }
        } else if (e.k === 1 && (e.seen || see)) {
          // The lookout calls for backup once he has seen you. Kill him before the bar fills.
          e.seen = true; e.ang = Math.atan2(dy, dx);
          if ((e.bt -= dt) <= 0) { e.bt = 280; tone(this, 1300, 50, 'square', 0.04); }
          if ((e.call += dt) >= this.callMs) { e.k = 0; e.img.setTexture('e0'); e.t = this.react; this.raise(); }
          fx.fillStyle(0x000000, 0.7).fillRect(e.x - 15, e.y - 21, 30, 6)
            .fillStyle(0xffe14a).fillRect(e.x - 14, e.y - 20, (28 * e.call) / this.callMs, 4);
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
      if (d < 13 && d > 0.01) { const k = (13 - d) / 2 / d; this.move(a, -dx * k, -dy * k, 7); this.move(b, dx * k, dy * k, 7); }
    }

    // ---- Bullets: short steps so a fast bullet never skips a wall ----
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * s) / 8));
      let dead = false;
      for (let k = 0; k < n && !dead; k++) {
        b.x += (b.vx * s) / n; b.y += (b.vy * s) / n;
        if (this.solid(b.x, b.y)) { dead = true; this.sparks.explode(3, b.x, b.y); }
        else if (b.foe) { if (Math.hypot(p.x - b.x, p.y - b.y) < 9) { dead = true; this.hurt(); } }
        else for (const e of E) if (Math.hypot(e.x - b.x, e.y - b.y) < 11) { dead = true; this.kill(e); break; }
      }
      if (dead) { b.img.destroy(); this.bullets.splice(i, 1); } else b.img.setPosition(b.x, b.y);
    }

    // ---- Grenades: bounce off walls, go off when the fuse ends ----
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      for (let k = 0; k < 4; k++) {
        const dx = (n.vx * s) / 4, dy = (n.vy * s) / 4;
        if (this.solid(n.x + dx, n.y)) n.vx *= -0.55; else n.x += dx;
        if (this.solid(n.x, n.y + dy)) n.vy *= -0.55; else n.y += dy;
      }
      const fr = Math.max(0, 1 - dt * TUNE.friction); n.vx *= fr; n.vy *= fr;
      n.img.setPosition(n.x, n.y).setScale(1 + 0.35 * Math.abs(Math.sin(n.t / 45)));
      fx.lineStyle(1, KITS[kit].c, 0.25).strokeCircle(n.x, n.y, KITS[kit].r);
      if ((n.t -= dt) <= 0) { n.img.destroy(); this.nades.splice(i, 1); this.boom(n.x, n.y); }
    }

    // ---- Effects and HUD ----
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i], a = r.t / 320;
      fx.fillStyle(r.c, a * 0.35).fillCircle(r.x, r.y, r.r).lineStyle(3, r.c, a).strokeCircle(r.x, r.y, r.r * (1.05 - a * 0.4));
      if ((r.t -= rdt) <= 0) this.rings.splice(i, 1);
    }
    if (this.slow > 0) fx.lineStyle(6, 0x39e6ff, 0.5).strokeRect(3, OY * T + 3, W - 6, FLOOR_ROWS * T - 6);
    if (this.blind > 0) this.blind -= rdt;
    this.white.setAlpha(Phaser.Math.Clamp(this.blind / 500, 0, 1));
    for (let i = 0; i < TUNE.hp; i++) fx.fillStyle(i < p.hp ? 0x39e6ff : 0x24344d).fillRect(250 + i * 20, 11, 15, 17);
    this.hudL.setText('SCORE ' + this.score + (this.mult > 1 ? '  x' + this.mult : ''));
    this.hudC.setText(this.alarm ? 'ALARM  FLOOR ' + this.floor : 'FLOOR ' + this.floor).setColor(this.alarm ? '#ff4455' : '#ffffff');
    this.hudR.setText(KITS[kit].n + ' x' + this.nadeN);

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
