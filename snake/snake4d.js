/* Snakey 4D — snake in a four-dimensional hypercube.
 *
 * World: N⁴ cells, each [x, y, z, w]. Two ways to look at it:
 *   Grid view       an N×N array of N×N boards. Inside a board: X across, Y down.
 *                   Boards are laid out by Z (across) and W (down).
 *   Tesseract view  the same cells projected 4D → 3D → 2D, slowly spinning.
 *
 * A "view" maps display slots to world axes: slot 0 = in-board across,
 * 1 = in-board down, 2 = board across, 3 = board down (perm + flip).
 * Keys act on display slots, so after a Tumble (a 90° hyper-rotation that
 * rewrites the view) "right" still means right on screen.
 */
(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ───────────────────────── constants ───────────────────────── */

const AX = ['X', 'Y', 'Z', 'W'];
const PANEL_AX = ['#c0203a', '#138a3a', '#1558c0', '#a36800'];   // axis colours on the grey panel
const KEYS = [['←', '→'], ['↑', '↓'], ['J', 'L'], ['I', 'K']];     // per display slot: [minus, plus]
const SLOT_TAG = ['board', 'board', 'hop', 'hop'];
const COMBO_MS = 4500;
const MAX_SCORES = 5;

const MODES = {
  classic: { label: 'Classic', icon: '🐍', blurb: 'Eat, grow, don\'t crash. The snake speeds up with every apple.' },
  zen:     { label: 'Zen',     icon: '🧘', blurb: 'Wrap-around hyperspace, steady pace, no deaths. Biting yourself just snips your tail.' },
  tumble:  { label: 'Tumble',  icon: '🌀', blurb: 'Every 4 apples hyperspace rotates 90° and the boards reshuffle. Keys stay screen-relative. ×1.5 points.' },
  timed:   { label: 'Timed',   icon: '⏱',  blurb: '60 seconds on the clock. Grab ⏱️ clocks for +5s.' },
  daily:   { label: 'Daily',   icon: '📅', blurb: 'Today\'s seeded hyperspace: same void crystals and apple spawns for everyone. 5⁴, normal speed, solid walls.' },
};
const MODE_ORDER = ['classic', 'zen', 'tumble', 'timed', 'daily'];

const DIFFS = {
  easy:   { label: 'Easy',   start: 320, min: 190, step: 3, mult: 1,    obst: 0 },
  normal: { label: 'Normal', start: 250, min: 130, step: 4, mult: 1.25, obst: 0 },
  hard:   { label: 'Hard',   start: 190, min: 95,  step: 4, mult: 1.6,  obst: 0.012 },
};

const ITEMS = {
  apple: { emoji: '🍎', col: '#ff4d4d', pts: 10 },
  star:  { emoji: '⭐', col: '#ffd43b', pts: 50, ttl: 9000 },
  phase: { emoji: '👻', col: '#b197fc', pts: 5,  ttl: 11000, dur: 8000 },
  slow:  { emoji: '🐢', col: '#51cf66', pts: 5,  ttl: 11000, dur: 8000 },
  trim:  { emoji: '✂️', col: '#74c0fc', pts: 5,  ttl: 11000 },
  twist: { emoji: '🔀', col: '#e599f7', pts: 30, ttl: 11000 },
  clock: { emoji: '⏱️', col: '#ffa94d', pts: 5,  ttl: 10000 },
};

const THEMES = {
  hyper: { name: 'Hyperspace', swatch: 'linear-gradient(135deg,#070b1a 45%,#4ef0a0 45%,#4ef0a0 60%,#5ef0ff 60%)',
    bg: '#070b1a', board: '#0e1530', boardEdge: '#1f2b58', dot: 'rgba(140,170,255,0.16)', text: '#9fb3e8', dim: '#56679a',
    head: '#b4ffd8', body0: '#4ef0a0', body1: '#1b6b93', eye: '#07121f', accent: '#5ef0ff', danger: '#ff4d6d',
    obst: '#2c1a4a', obstEdge: '#9b6bff', hop: '#c38bff', axes: ['#ff6b81', '#5cf29a', '#4db3ff', '#ffd24d'], glow: true },
  nokia: { name: 'Nokia LCD', swatch: '#8bac0f',
    bg: '#879e0c', board: '#9bbc0f', boardEdge: '#6f8a0a', dot: 'rgba(15,56,15,0.22)', text: '#0f380f', dim: '#306230',
    head: '#0f380f', body0: '#1c4a1c', body1: '#56802a', eye: '#9bbc0f', accent: '#0f380f', danger: '#6b1010',
    obst: '#306230', obstEdge: '#0f380f', hop: '#0f380f', axes: ['#7a2410', '#0f4a10', '#12306b', '#6a4a05'], glow: false },
  vapor: { name: 'Vaporwave', swatch: 'linear-gradient(135deg,#ff71ce,#b967ff,#01cdfe)',
    bg: '#1a0b2e', board: '#2a1450', boardEdge: '#4d2c86', dot: 'rgba(255,113,206,0.17)', text: '#ffd1f0', dim: '#8a5ab0',
    head: '#fffb96', body0: '#ff71ce', body1: '#01cdfe', eye: '#1a0b2e', accent: '#01cdfe', danger: '#ff3860',
    obst: '#120622', obstEdge: '#b967ff', hop: '#b967ff', axes: ['#ff71ce', '#05ffa1', '#4dd8ff', '#fffb96'], glow: true },
  paper: { name: 'Paper', swatch: 'linear-gradient(135deg,#fbf8f0 50%,#2f6fc0 50%)',
    bg: '#e9e2cf', board: '#fbf8f0', boardEdge: '#c9bfa4', dot: 'rgba(90,80,60,0.2)', text: '#4a4234', dim: '#968a70',
    head: '#173f78', body0: '#2f6fc0', body1: '#8ec3ea', eye: '#ffffff', accent: '#d9480f', danger: '#c92a2a',
    obst: '#5c5446', obstEdge: '#2b2620', hop: '#7048e8', axes: ['#d6336c', '#2b8a3e', '#1c7ed6', '#e67700'], glow: false },
};
const THEME_ORDER = ['hyper', 'nokia', 'vapor', 'paper'];

const ACHS = [
  { id: 'first',   icon: '🍎', name: 'First Bite',          desc: 'Eat your first 4D apple.' },
  { id: 'hops',    icon: '🐇', name: 'Hyper-hopper',        desc: 'Hop between boards 25 times in one game.' },
  { id: 'len15',   icon: '📏', name: 'Long Boi',            desc: 'Reach length 15.' },
  { id: 'len30',   icon: '🐉', name: 'Tesseract Serpent',   desc: 'Reach length 30.' },
  { id: 's250',    icon: '💯', name: 'Quarter Grand',       desc: 'Score 250 in one game.' },
  { id: 's1000',   icon: '👑', name: 'Four Figures',        desc: 'Score 1,000 in one game.' },
  { id: 'combo5',  icon: '🔥', name: 'On Fire',             desc: 'Hit a ×5 combo.' },
  { id: 'tumble3', icon: '🌀', name: 'Tumble Dry',          desc: 'Live through 3 hyper-tumbles in one game.' },
  { id: 'vision',  icon: '🧊', name: 'Hyper-Vision',        desc: 'Eat 3 apples in one game while in Tesseract view.' },
  { id: 'donut',   icon: '🍩', name: 'Donut Dweller',       desc: 'With Wrap walls, wrap around all four axes in one game.' },
  { id: 'tourist', icon: '🗺️', name: 'Hyperspace Tourist',  desc: 'Visit every board in one game.' },
  { id: 'zen5',    icon: '🧘', name: 'Inner Peace',         desc: 'Spend 5 minutes in one Zen game.' },
  { id: 'daily',   icon: '📅', name: 'Daily Dose',          desc: 'Finish a Daily run.' },
  { id: 'timed',   icon: '⏱️', name: 'Clock Watcher',       desc: 'Score 300 in Timed mode.' },
  { id: 'big',     icon: '🌌', name: 'Big Space',           desc: 'Eat 10 apples on a 6⁴ hyperspace.' },
  { id: 'ghost',   icon: '👻', name: 'Ghost in the Shell',  desc: 'Slither through your own body while phased.' },
];

/* ───────────────────────── storage ───────────────────────── */

const PREFIX = 'snakey4d.';
function load(key, def) { try { const v = localStorage.getItem(PREFIX + key); return v == null ? def : JSON.parse(v); } catch { return def; } }
function save(key, v) { try { localStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

const CFG = Object.assign(
  { mode: 'classic', diff: 'normal', size: 5, walls: 'solid', theme: 'hyper', view: 'grid', sfx: true, music: false },
  load('settings', {}));
if (!MODES[CFG.mode]) CFG.mode = 'classic';
if (!DIFFS[CFG.diff]) CFG.diff = 'normal';
if (![4, 5, 6].includes(CFG.size)) CFG.size = 5;
if (!THEMES[CFG.theme]) CFG.theme = 'hyper';
const saveCfg = () => save('settings', CFG);
let T = THEMES[CFG.theme];

/* ───────────────────────── colour helpers ───────────────────────── */

const rgbCache = new Map();
function rgb(h) {
  let c = rgbCache.get(h);
  if (!c) { const n = parseInt(h.slice(1), 16); c = [n >> 16 & 255, n >> 8 & 255, n & 255]; rgbCache.set(h, c); }
  return c;
}
const rgba = (h, a) => { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function mix(h1, h2, t) {
  const a = rgb(h1), b = rgb(h2);
  return `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
  else ctx.rect(x, y, w, h);
}

const emojiCache = new Map();
function drawEmoji(ctx, ch, x, y, size) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(6, Math.round(size * dpr / 2) * 2);
  const key = ch + '|' + px;
  let c = emojiCache.get(key);
  if (!c) {
    if (emojiCache.size > 300) emojiCache.clear();
    c = document.createElement('canvas');
    const s = Math.ceil(px * 1.3);
    c.width = c.height = s;
    const x2 = c.getContext('2d');
    x2.font = `${px}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    x2.textAlign = 'center'; x2.textBaseline = 'middle';
    x2.fillText(ch, s / 2, s / 2 + px * 0.06);
    emojiCache.set(key, c);
  }
  const s = c.width / dpr;
  ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
}

/* ───────────────────────── RNG / dates ───────────────────────── */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function dayId(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function dayStr(d = new Date()) { return d.toISOString().slice(0, 10); }

/* ───────────────────────── audio ───────────────────────── */

const Snd = (() => {
  let ac = null, master = null;
  let musicBus = null, musicTimer = null, nextNote = 0, step = 0;

  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    return ac;
  }
  function tone(f, dur, type = 'square', vol = 0.1, f2 = null, delay = 0, dest = null) {
    const a = ensure(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), gn = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, f1, f2) {
    const a = ensure(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    const t = a.currentTime;
    bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = a.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(gn); gn.connect(master);
    src.start(t);
  }
  const fx = (fn) => (...args) => { if (CFG.sfx) fn(...args); };

  // Generative backing track: Am–F–C–G arpeggios over a soft bass, with a feedback delay.
  const CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function schedule() {
    const a = ac; if (!a || !musicBus) return;
    const eighth = 60 / 104 / 2;
    while (nextNote < a.currentTime + 0.3) {
      const chord = CHORDS[Math.floor(step / 16) % 4];
      const t = nextNote - a.currentTime;
      if (step % 8 === 0) tone(midi(chord[0] - 24), eighth * 7, 'triangle', 0.16, null, t, musicBus);
      if (Math.random() > 0.18) tone(midi(chord[ARP[step % 8]] + 12), eighth * 1.6, 'sine', 0.05, null, t, musicBus);
      nextNote += eighth; step++;
    }
  }
  function startMusic() {
    const a = ensure(); if (!a || musicTimer) return;
    musicBus = a.createGain();
    musicBus.gain.setValueAtTime(0.0001, a.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(0.8, a.currentTime + 1.5);
    const delay = a.createDelay(1); delay.delayTime.value = 0.43;
    const fb = a.createGain(); fb.gain.value = 0.32;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    musicBus.connect(master); musicBus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
    nextNote = a.currentTime + 0.1; step = 0;
    musicTimer = setInterval(schedule, 80);
  }
  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer); musicTimer = null;
    const bus = musicBus; musicBus = null;
    if (bus && ac) { bus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.2); setTimeout(() => bus.disconnect(), 1500); }
  }

  return {
    unlock() { const a = ensure(); if (a && a.state === 'suspended') a.resume(); if (CFG.music) startMusic(); },
    music(on) { if (on) startMusic(); else stopMusic(); },
    eat: fx((combo) => { const b = 520 * Math.pow(1.07, Math.min(combo, 8)); tone(b, 0.07, 'square', 0.07, b * 1.5); tone(b * 1.5, 0.09, 'square', 0.06, b * 2, 0.05); }),
    hop: fx(() => { tone(260, 0.16, 'sine', 0.11, 820); tone(520, 0.12, 'triangle', 0.04, 1300, 0.03); }),
    power: fx(() => [0, 4, 7, 12].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.12, 'triangle', 0.09, null, i * 0.06))),
    star: fx(() => [0, 7, 12, 19].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 0.1, 'square', 0.06, null, i * 0.05))),
    snip: fx(() => { tone(900, 0.05, 'square', 0.06, 300); noise(0.12, 0.08, 3000, 800); }),
    tumble: fx(() => { noise(1.0, 0.16, 250, 3200); tone(110, 1.0, 'sawtooth', 0.04, 440); }),
    die: fx(() => { tone(420, 0.55, 'sawtooth', 0.11, 55); noise(0.45, 0.12, 1800, 150); }),
    count: fx((last) => tone(last ? 1320 : 880, last ? 0.18 : 0.07, 'square', 0.06)),
    click: fx(() => tone(1400, 0.025, 'square', 0.03)),
    ach: fx(() => [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.14, 'triangle', 0.08, null, i * 0.07))),
  };
})();

/* ───────────────────────── hyperspace maths ───────────────────────── */

const idx = (g, c) => c[0] + g.N * (c[1] + g.N * (c[2] + g.N * c[3]));
const cellOf = (g, i) => [i % g.N, Math.floor(i / g.N) % g.N, Math.floor(i / g.N2) % g.N, Math.floor(i / g.N3)];

// Signed distance along one axis, taking the short way round when walls wrap.
function axisDelta(g, from, to) {
  let d = to - from;
  if (g.walls === 'wrap' && Math.abs(d) > g.N / 2) d -= Math.sign(d) * g.N;
  return d;
}
function dist(g, a, b) {
  let s = 0;
  for (let k = 0; k < 4; k++) s += Math.abs(axisDelta(g, a[k], b[k]));
  return s;
}
// True when consecutive positions differ by more than one step (a wrap-around jump).
const jumped = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) > 1;

// World cell → display coords under a view.
function disp(g, c, v = g.view) {
  const r = [0, 0, 0, 0], n1 = g.N - 1;
  for (let k = 0; k < 4; k++) { const val = c[v.perm[k]]; r[k] = v.flip[k] ? n1 - val : val; }
  return r;
}
// Display coords mid-tumble: a genuine rotation in the (i, j) display plane.
function dispNow(g, c) {
  const tb = g.tumble;
  if (!tb) return disp(g, c);
  const d = disp(g, c, tb.from), m = (g.N - 1) / 2;
  const th = easeIO(Math.min(1, tb.t)) * Math.PI / 2, co = Math.cos(th), si = Math.sin(th);
  const ui = d[tb.i] - m, uj = d[tb.j] - m;
  d[tb.i] = m + ui * co + uj * si;
  d[tb.j] = m + uj * co - ui * si;
  return d;
}
function slotOf(g, dir) {
  const slot = g.view.perm.indexOf(dir.a);
  return { slot, sign: g.view.flip[slot] ? -dir.s : dir.s };
}

/* ───────────────────────── game model ───────────────────────── */

let G = null;            // the game on screen (a real run, or the attract-mode demo)
let state = 'menu';      // menu | countdown | play | paused | dead | over
let lastRun = null;      // last finished real game, for the stats panel on the menu

function newGame(opt) {
  const mode = opt.mode, daily = mode === 'daily';
  const N = daily ? 5 : opt.size;
  const diff = daily ? 'normal' : opt.diff;
  const D = DIFFS[diff];
  const g = {
    N, N2: N * N, N3: N * N * N, cells: N ** 4, mode, diff, D, demo: !!opt.demo,
    rng: daily ? mulberry32(dayId() * 7919 + 17) : Math.random,
    walls: mode === 'zen' ? 'wrap' : daily ? 'solid' : opt.walls,
    view: { perm: [0, 1, 2, 3], flip: [false, false, false, false] },
    snake: [], prev: [], dir: { a: 0, s: 1 }, queue: [], grow: 2,
    occ: new Uint8Array(N ** 4), obst: new Uint8Array(N ** 4), obstList: [], items: [],
    score: 0, eaten: 0, hops: 0, combo: 0, comboUntil: 0, bestCombo: 0,
    tickMs: D.start, gt: 0, nextTick: 900, tickStart: 0,
    alive: true, cause: '', deathAt: 0, finished: false,
    tumble: null, tumbles: 0, fx: { phase: 0, slow: 0 },
    timeLeft: mode === 'timed' ? 60000 : 0,
    tessEats: 0, wrapped: [false, false, false, false], ghosted: false, visited: new Set(),
  };
  const c = N >> 1;
  const head = [0, c, c, c];
  g.snake.push(head); g.prev.push(head);
  g.occ[idx(g, head)]++;
  g.visited.add(head[2] + N * head[3]);

  const nObst = daily ? 10 : Math.round(g.cells * D.obst);
  for (let tries = 0; g.obstList.length < nObst && tries < 5000; tries++) {
    const o = randCell(g);
    if (o[1] === c && o[2] === c && o[3] === c) continue;     // keep the starting runway clear
    if (dist(g, o, head) < 3) continue;
    const i = idx(g, o);
    if (g.obst[i]) continue;
    g.obst[i] = 1; g.obstList.push(o);
  }
  spawn(g, 'apple');
  return g;
}

const randCell = (g) => [0, 0, 0, 0].map(() => Math.floor(g.rng() * g.N));
const itemAt = (g, i) => g.items.some((it) => it.i === i);

function freeCell(g, minDist) {
  const head = g.snake[0];
  for (let t = 0; t < 400; t++) {
    const c = randCell(g), i = idx(g, c);
    if (g.occ[i] || g.obst[i] || itemAt(g, i)) continue;
    if (t < 300 && dist(g, c, head) < minDist) continue;
    return c;
  }
  for (let i = 0; i < g.cells; i++) if (!g.occ[i] && !g.obst[i] && !itemAt(g, i)) return cellOf(g, i);
  return null;
}
function spawn(g, type) {
  const c = freeCell(g, type === 'apple' ? 3 : 2);
  if (!c) return false;
  g.items.push({ type, c, i: idx(g, c), born: g.gt });
  return true;
}
function spawnExtras(g) {
  const has = (t) => g.items.some((it) => it.type === t);
  const r = g.rng();
  if (g.mode === 'timed' && !has('clock') && r < 0.45) spawn(g, 'clock');
  else if (!has('star') && g.eaten >= 3 && r < 0.62 && g.rng() < 0.3) spawn(g, 'star');
  else if (g.items.length < 3 && g.eaten >= 2 && g.rng() < 0.24) {
    const pool = ['phase', 'slow', 'trim', 'twist'];
    const pick = pool[Math.floor(g.rng() * pool.length)];
    if (!has(pick)) spawn(g, pick);
  }
}

const interval = (g) => g.tickMs * (g.fx.slow > g.gt ? 1.6 : 1);
const lenOf = (g) => g.snake.length + g.grow;   // includes growth still to come

function queueDir(g, slot, sign) {
  const a = g.view.perm[slot], s = g.view.flip[slot] ? -sign : sign;
  const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
  if (a === last.a && (s === last.s || g.snake.length > 1)) return;   // same way, or reversing into your neck
  if (g.queue.length >= 3) return;
  g.queue.push({ a, s });
}
function upcomingDir(g) { return g.queue.length ? g.queue[0] : g.dir; }

function step(g) {
  const N = g.N;
  if (g.queue.length) g.dir = g.queue.shift();
  const head = g.snake[0], a = g.dir.a;
  const n = head.slice(); n[a] += g.dir.s;
  if (n[a] < 0 || n[a] >= N) {
    if (g.walls === 'wrap') { n[a] = (n[a] + N) % N; g.wrapped[a] = true; }
    else return die(g, 'wall');
  }
  const ni = idx(g, n);
  if (g.obst[ni]) return die(g, 'obstacle');
  const tail = g.snake[g.snake.length - 1];
  const growing = g.grow > 0;
  const blocked = g.occ[ni] > 0 && !(!growing && ni === idx(g, tail) && g.occ[ni] === 1);
  if (blocked) {
    if (g.fx.phase > g.gt) g.ghosted = true;
    else if (g.mode === 'zen') snipAt(g, ni);
    else return die(g, 'self');
  }

  const prev = g.snake.slice();
  g.snake.unshift(n); g.occ[ni]++;
  if (g.grow > 0) { g.grow--; prev.push(prev[prev.length - 1]); }
  else { const t = g.snake.pop(); g.occ[idx(g, t)]--; }
  g.prev = prev;

  if (slotOf(g, g.dir).slot >= 2) { g.hops++; if (!g.demo) Snd.hop(); }
  g.visited.add(n[2] + N * n[3]);

  for (let k = g.items.length - 1; k >= 0; k--) {
    const it = g.items[k];
    if (it.i === ni) { g.items.splice(k, 1); consume(g, it); }
  }
  if (!g.demo) checkAch(g);
}

// Zen: biting yourself removes everything from the bite to the tail.
function snipAt(g, ni) {
  const k = g.snake.findIndex((c) => idx(g, c) === ni);
  if (k <= 0) return;
  const cut = g.snake.splice(k);
  g.prev.splice(k);
  for (const c of cut) { g.occ[idx(g, c)]--; if (!g.demo) burst(c, T.danger, 3, 60); }
  g.grow = 0;
  if (!g.demo) { Snd.snip(); floater(g.snake[0], '✂ snip', T.danger); }
}

function consume(g, it) {
  const I = ITEMS[it.type];
  let mult = 1;
  if (it.type === 'apple' || it.type === 'star') {
    if (it.type === 'apple') {
      g.combo = g.gt < g.comboUntil ? g.combo + 1 : 1;
      g.comboUntil = g.gt + COMBO_MS;
      g.bestCombo = Math.max(g.bestCombo, g.combo);
    }
    mult = Math.min(Math.max(g.combo, 1), 5);
  }
  const pts = Math.round(I.pts * mult * g.D.mult * (g.mode === 'tumble' ? 1.5 : 1));
  g.score += pts;

  switch (it.type) {
    case 'apple':
      g.eaten++; g.grow += 1;
      if (g.mode !== 'zen') g.tickMs = Math.max(g.D.min, g.tickMs - g.D.step);
      if (CFG.view === 'tess') g.tessEats++;
      if (!spawn(g, 'apple')) return win(g);
      spawnExtras(g);
      if (!g.demo) Snd.eat(g.combo);
      if (g.mode === 'tumble' && g.eaten % 4 === 0) startTumble(g);
      break;
    case 'star': g.grow += 2; if (!g.demo) Snd.star(); break;
    case 'phase': g.fx.phase = g.gt + I.dur; if (!g.demo) Snd.power(); break;
    case 'slow': g.fx.slow = g.gt + I.dur; if (!g.demo) Snd.power(); break;
    case 'trim': {
      const cut = Math.min(3, g.snake.length - 2);
      for (let k = 0; k < cut; k++) { const c = g.snake.pop(); g.prev.pop(); g.occ[idx(g, c)]--; }
      g.grow = 0;
      if (!g.demo) Snd.power();
      break;
    }
    case 'twist': startTumble(g); break;
    case 'clock': g.timeLeft += 5000; if (!g.demo) Snd.power(); break;
  }
  burst(it.c, I.col, it.type === 'apple' ? 12 : 18, 110);
  floater(it.c, (pts ? '+' + pts : '') + (mult > 1 ? ' ×' + mult : ''), I.col);
}

function startTumble(g) {
  const pairs = [[0, 2], [1, 3], [0, 3], [1, 2]];
  const [i, j] = pairs[Math.floor(g.rng() * pairs.length)];
  const from = { perm: g.view.perm.slice(), flip: g.view.flip.slice() };
  const to = { perm: from.perm.slice(), flip: from.flip.slice() };
  to.perm[i] = from.perm[j]; to.flip[i] = from.flip[j];
  to.perm[j] = from.perm[i]; to.flip[j] = !from.flip[i];
  g.view = to;
  g.tumble = { from, i, j, t: 0, dur: 1150, label: `${AX[from.perm[i]]} ⟲ ${AX[from.perm[j]]}` };
  g.tumbles++;
  if (!g.demo) Snd.tumble();
}

function die(g, cause) {
  g.alive = false; g.cause = cause; g.deathAt = performance.now();
  g.prev = g.snake.slice();
  if (g.demo) return;
  Snd.die();
  shakeUntil = performance.now() + 380;
  burst(g.snake[0], T.danger, 26, 170);
  state = 'dead';
  setTimeout(finishGame, 1200);
}
function timeUp(g) {
  g.alive = false; g.cause = 'time'; g.deathAt = performance.now(); g.prev = g.snake.slice();
  state = 'dead';
  Snd.count(true);
  setTimeout(finishGame, 700);
}
function win(g) {
  g.alive = false; g.cause = 'win'; g.deathAt = performance.now();
  state = 'dead';
  setTimeout(finishGame, 900);
}

// Attract-mode pilot: greedy toward the apple, with a little look-around to avoid dead ends.
function autopilot(g) {
  const head = g.snake[0], apple = g.items.find((it) => it.type === 'apple');
  if (!apple) return;
  const tail = g.snake[g.snake.length - 1], ti = idx(g, tail);
  const free = (c) => {
    const i = idx(g, c);
    return !g.obst[i] && (!g.occ[i] || (i === ti && g.grow === 0));
  };
  const nextCell = (c, a, s) => {
    const n = c.slice(); n[a] += s;
    if (n[a] < 0 || n[a] >= g.N) { if (g.walls !== 'wrap') return null; n[a] = (n[a] + g.N) % g.N; }
    return n;
  };
  let best = null, bestScore = Infinity;
  for (let a = 0; a < 4; a++) for (const s of [-1, 1]) {
    if (a === g.dir.a && s === -g.dir.s && g.snake.length > 1) continue;
    const n = nextCell(head, a, s);
    if (!n || !free(n)) continue;
    let room = 0;
    for (let b = 0; b < 4; b++) for (const t of [-1, 1]) { const m = nextCell(n, b, t); if (m && free(m)) room++; }
    let sc = dist(g, n, apple.c) * 10 - room * 2 + Math.random() * 4;
    if (a === g.dir.a && s === g.dir.s) sc -= 3;
    if (room === 0) sc += 500;
    if (sc < bestScore) { bestScore = sc; best = { a, s }; }
  }
  if (best) g.dir = best;
}

/* ───────────────────────── particles ───────────────────────── */

let parts = [], floats = [];
let shakeUntil = 0;
function burst(c, col, n = 12, speed = 100) {
  for (let k = 0; k < n; k++) {
    const an = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.8);
    parts.push({ c, ox: 0, oy: 0, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 0, max: 450 + Math.random() * 450, col, r: 1.5 + Math.random() * 2.5 });
  }
}
function floater(c, text, col) { if (text) floats.push({ c, text, col, life: 0, max: 1100 }); }
function updateParts(dt) {
  for (const p of parts) { p.life += dt; p.ox += p.vx * dt / 1000; p.oy += p.vy * dt / 1000; p.vx *= 0.95; p.vy *= 0.95; }
  parts = parts.filter((p) => p.life < p.max);
  for (const f of floats) f.life += dt;
  floats = floats.filter((f) => f.life < f.max);
}
function drawParts(ctx, map, sc, fontPx) {
  for (const p of parts) {
    const [x, y] = map(p.c);
    ctx.fillStyle = rgba(p.col, 1 - p.life / p.max);
    const r = p.r * sc;
    ctx.fillRect(x + p.ox * sc - r / 2, y + p.oy * sc - r / 2, r, r);
  }
  if (!fontPx) return;
  ctx.font = `bold ${fontPx}px "Courier New", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floats) {
    const [x, y] = map(f.c), t = f.life / f.max;
    ctx.globalAlpha = 1 - t * t;
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(T.bg, 0.8);
    ctx.strokeText(f.text, x, y - 10 - t * 26);
    ctx.fillStyle = f.col; ctx.fillText(f.text, x, y - 10 - t * 26);
  }
  ctx.globalAlpha = 1;
}

/* ───────────────────────── rendering: grid view ───────────────────────── */

function gridLayout(W, H, N, labels) {
  const m = labels ? Math.round(clamp(Math.min(W, H) * 0.04, 15, 22)) : 0;
  const side = Math.max(N * 4, Math.min(W - m, H - m) - (labels ? 6 : 4));
  const P = side / N, Gp = Math.max(labels ? 4 : 2, P * 0.1), B = P - Gp, C = B / N;
  const ox = (W - m - side) / 2 + m, oy = (H - m - side) / 2 + m;
  return { N, m, side, P, Gp, B, C, ox, oy };
}

function segColour(i, n) { return mix(T.body0, T.body1, n > 1 ? i / (n - 1) : 0); }

// Interpolated display coords for every snake segment (smooth slide between ticks).
function snakeDisp(g) {
  const tt = g.alive && !g.tumble ? clamp((g.gt - g.tickStart) / Math.max(1, g.nextTick - g.tickStart), 0, 1) : 1;
  return g.snake.map((cur, i) => {
    if (g.tumble) return dispNow(g, cur);
    const pr = g.prev[i] || cur;
    if (tt >= 1 || pr === cur || jumped(pr, cur)) return disp(g, cur);
    const a = disp(g, pr), b = disp(g, cur);
    return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, a[2] + (b[2] - a[2]) * tt, a[3] + (b[3] - a[3]) * tt];
  });
}

function drawRich(ctx, parts, x, y, align) {
  let w = 0;
  for (const [txt] of parts) w += ctx.measureText(txt).width;
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (const [txt, col] of parts) { ctx.fillStyle = col; ctx.fillText(txt, cx, y); cx += ctx.measureText(txt).width; }
}

function renderGrid(ctx, W, H, mini) {
  const g = G, N = g.N, t = T, L = gridLayout(W, H, N, !mini), v = g.view;
  const now = performance.now();
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);

  const bx = (bz) => L.ox + bz * L.P + L.Gp / 2;
  const by = (bw) => L.oy + bw * L.P + L.Gp / 2;
  const cellXY = (d) => [bx(d[2]) + (d[0] + 0.5) * L.C, by(d[3]) + (d[1] + 0.5) * L.C];
  const rad = Math.min(6, L.B * 0.07);
  const head = g.snake[0], dh = disp(g, head);
  const apple = g.items.find((it) => it.type === 'apple');
  const da = apple ? disp(g, apple.c) : null;
  const live = g.alive && !g.tumble;
  const hints = live && !mini;

  // Boards
  ctx.lineWidth = 1;
  if (g.walls === 'wrap') ctx.setLineDash([3, 3]);
  for (let bw = 0; bw < N; bw++) for (let bz = 0; bz < N; bz++) {
    rr(ctx, bx(bz), by(bw), L.B, L.B, rad);
    ctx.fillStyle = t.board; ctx.fill();
    ctx.strokeStyle = t.boardEdge; ctx.stroke();
  }
  ctx.setLineDash([]);
  if (!mini) {
    ctx.fillStyle = t.dot;
    const ds = Math.max(1.2, L.C * 0.11);
    for (let bw = 0; bw < N; bw++) for (let bz = 0; bz < N; bz++) {
      const x0 = bx(bz), y0 = by(bw);
      for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
        ctx.fillRect(x0 + (cx + 0.5) * L.C - ds / 2, y0 + (cy + 0.5) * L.C - ds / 2, ds, ds);
      }
    }
  }

  if (hints) {
    // Neighbouring boards one hop away: tint + a watermark of the key that gets you there.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(L.B * 0.46)}px "Courier New", monospace`;
    for (const slot of [2, 3]) for (const sg of [-1, 1]) {
      const nb = dh.slice(); nb[slot] += sg;
      if (nb[slot] < 0 || nb[slot] >= N) { if (g.walls !== 'wrap') continue; nb[slot] = (nb[slot] + N) % N; }
      const x0 = bx(nb[2]), y0 = by(nb[3]);
      rr(ctx, x0, y0, L.B, L.B, rad); ctx.fillStyle = rgba(t.hop, 0.08); ctx.fill();
      ctx.fillStyle = rgba(t.hop, 0.2);
      ctx.fillText(KEYS[slot][sg > 0 ? 1 : 0], x0 + L.B / 2, y0 + L.B / 2 + 1);
    }
    // Every board in line with yours: where your head would land if you kept hopping.
    ctx.strokeStyle = rgba(t.head, 0.22); ctx.lineWidth = 1;
    for (let bw = 0; bw < N; bw++) for (let bz = 0; bz < N; bz++) {
      if ((bz === dh[2]) === (bw === dh[3])) continue;
      const [x, y] = cellXY([dh[0], dh[1], bz, bw]);
      ctx.beginPath(); ctx.arc(x, y, L.C * 0.3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Apple's board + your board
  if (apple && !g.tumble) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 240);
    ctx.lineWidth = mini ? 1.5 : 2;
    ctx.strokeStyle = rgba(ITEMS.apple.col, 0.35 + 0.45 * pulse);
    rr(ctx, bx(da[2]) - 1.5, by(da[3]) - 1.5, L.B + 3, L.B + 3, rad + 1); ctx.stroke();
  }
  if (!g.tumble) {
    ctx.lineWidth = mini ? 1.5 : 2;
    ctx.strokeStyle = t.accent;
    if (t.glow && !mini) { ctx.shadowColor = t.accent; ctx.shadowBlur = 10; }
    rr(ctx, bx(dh[2]) - 1, by(dh[3]) - 1, L.B + 2, L.B + 2, rad + 1); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Shadows: where the apple sits (drawn in your board) and where you are (drawn in the apple's board).
  if (hints && apple && (da[2] !== dh[2] || da[3] !== dh[3])) {
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
    let [x, y] = cellXY([da[0], da[1], dh[2], dh[3]]);
    ctx.strokeStyle = rgba(ITEMS.apple.col, 0.85);
    ctx.beginPath(); ctx.arc(x, y, L.C * 0.42, 0, Math.PI * 2); ctx.stroke();
    [x, y] = cellXY([dh[0], dh[1], da[2], da[3]]);
    ctx.strokeStyle = rgba(t.head, 0.6);
    rr(ctx, x - L.C * 0.4, y - L.C * 0.4, L.C * 0.8, L.C * 0.8, L.C * 0.2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Void crystals
  for (const o of g.obstList) {
    const [x, y] = cellXY(dispNow(g, o)), s = L.C * 0.42;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath();
    ctx.fillStyle = t.obst; ctx.fill();
    ctx.strokeStyle = t.obstEdge; ctx.lineWidth = 1; ctx.stroke();
  }

  // Items
  for (const it of g.items) {
    const I = ITEMS[it.type];
    const left = I.ttl ? I.ttl - (g.gt - it.born) : Infinity;
    if (left < 2500 && Math.floor(now / 130) % 2) continue;
    const [x, y] = cellXY(dispNow(g, it.c));
    const bob = 1 + 0.08 * Math.sin(now / 200 + it.i);
    ctx.fillStyle = rgba(I.col, t.glow ? 0.3 : 0.22);
    ctx.beginPath(); ctx.arc(x, y, L.C * 0.55 * bob, 0, Math.PI * 2); ctx.fill();
    if (L.C >= 7) drawEmoji(ctx, I.emoji, x, y, L.C * 0.78 * bob);
    else { ctx.fillStyle = I.col; ctx.beginPath(); ctx.arc(x, y, L.C * 0.35, 0, Math.PI * 2); ctx.fill(); }
  }

  // Snake
  const ds = snakeDisp(g);
  const pos = ds.map(cellXY);
  const n = g.snake.length;
  const dead = !g.alive && g.cause !== 'time' && g.cause !== 'win';
  const flash = dead && Math.floor((now - g.deathAt) / 110) % 2 === 0;
  const phased = g.fx.phase > g.gt;
  if (phased) ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now / 80);
  ctx.lineCap = 'round';
  const curD = g.snake.map((c) => disp(g, c));
  const prevD = g.prev.map((c) => disp(g, c));
  for (let i = 1; i < n; i++) {
    if (jumped(g.snake[i - 1], g.snake[i])) continue;
    const a = curD[i - 1], b = curD[i], pa = prevD[i - 1] || a, pb = prevD[i] || b;
    const inBoard = a[2] === b[2] && a[3] === b[3] && pa[2] === pb[2] && pa[3] === pb[3];
    ctx.beginPath(); ctx.moveTo(pos[i - 1][0], pos[i - 1][1]); ctx.lineTo(pos[i][0], pos[i][1]);
    if (inBoard && !g.tumble) {
      ctx.strokeStyle = flash ? t.danger : segColour(i, n); ctx.lineWidth = L.C * 0.52; ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(t.hop, 0.8); ctx.lineWidth = Math.max(1.2, L.C * 0.14);
      ctx.setLineDash([Math.max(2, L.C * 0.28), Math.max(2, L.C * 0.2)]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  for (let i = n - 1; i >= 1; i--) {
    const [x, y] = pos[i], s = L.C * (0.76 - 0.16 * (i / n));
    rr(ctx, x - s / 2, y - s / 2, s, s, s * 0.32);
    ctx.fillStyle = flash ? t.danger : segColour(i, n); ctx.fill();
    // Portal ring on segments that sit at either end of a hop.
    const hopEnd = (i > 0 && curD[i - 1] && (curD[i - 1][2] !== curD[i][2] || curD[i - 1][3] !== curD[i][3]))
      || (i < n - 1 && (curD[i + 1][2] !== curD[i][2] || curD[i + 1][3] !== curD[i][3]));
    if (hopEnd && !mini && !g.tumble) {
      ctx.strokeStyle = rgba(t.hop, 0.9); ctx.lineWidth = Math.max(1, L.C * 0.08);
      ctx.beginPath(); ctx.arc(x, y, s * 0.26, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Head
  {
    const [x, y] = pos[0], s = L.C * 0.92;
    if (t.glow && !mini) { ctx.shadowColor = t.head; ctx.shadowBlur = 10; }
    rr(ctx, x - s / 2, y - s / 2, s, s, s * 0.34);
    ctx.fillStyle = dead ? t.danger : t.head; ctx.fill();
    ctx.shadowBlur = 0;
    const { slot, sign } = slotOf(g, g.dir);
    const vx = slot % 2 === 0 ? sign : 0, vy = slot % 2 === 0 ? 0 : sign;
    if (L.C >= 6) {
      ctx.fillStyle = t.eye;
      const f = L.C * 0.17, sp = L.C * 0.19, er = Math.max(1, L.C * 0.09);
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.arc(x + vx * f - vy * sp * side, y + vy * f + vx * sp * side, er, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (slot >= 2 && g.alive && !mini) {
      // Heading for another board: chevrons past the head.
      ctx.strokeStyle = t.hop; ctx.lineWidth = Math.max(1.5, L.C * 0.1);
      for (const k of [0.62, 0.84]) {
        const cx = x + vx * L.C * k, cy = y + vy * L.C * k, w = L.C * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - vx * w - vy * w, cy - vy * w - vx * w);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - vx * w + vy * w, cy - vy * w + vx * w);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Next-move preview
  if (hints) {
    const nd = upcomingDir(g), nx = head.slice(); nx[nd.a] += nd.s;
    const { slot, sign } = slotOf(g, nd);
    let wall = false;
    if (nx[nd.a] < 0 || nx[nd.a] >= N) { if (g.walls === 'wrap') nx[nd.a] = (nx[nd.a] + N) % N; else wall = true; }
    ctx.lineWidth = 2;
    if (wall) {
      const [hx, hy] = cellXY(dh);
      ctx.strokeStyle = t.danger; ctx.beginPath();
      const horiz = slot % 2 === 0;
      if (slot < 2) {
        if (horiz) { ctx.moveTo(hx + sign * L.C / 2, hy - L.C / 2); ctx.lineTo(hx + sign * L.C / 2, hy + L.C / 2); }
        else { ctx.moveTo(hx - L.C / 2, hy + sign * L.C / 2); ctx.lineTo(hx + L.C / 2, hy + sign * L.C / 2); }
      } else if (horiz) {
        const ex = sign > 0 ? bx(dh[2]) + L.B + 1 : bx(dh[2]) - 1;
        ctx.moveTo(ex, by(dh[3])); ctx.lineTo(ex, by(dh[3]) + L.B);
      } else {
        const ey = sign > 0 ? by(dh[3]) + L.B + 1 : by(dh[3]) - 1;
        ctx.moveTo(bx(dh[2]), ey); ctx.lineTo(bx(dh[2]) + L.B, ey);
      }
      ctx.lineWidth = 3; ctx.stroke();
    } else {
      const i2 = idx(g, nx), tail = g.snake[n - 1];
      const bad = g.obst[i2] || (g.occ[i2] && !(i2 === idx(g, tail) && g.grow === 0) && !phased && g.mode !== 'zen');
      const [x, y] = cellXY(disp(g, nx)), s = L.C * 0.94;
      ctx.strokeStyle = bad ? t.danger : rgba(t.accent, 0.65);
      ctx.setLineDash([3, 2]);
      rr(ctx, x - s / 2, y - s / 2, s, s, s * 0.25); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawParts(ctx, (c) => cellXY(dispNow(g, c)), mini ? W / VW : 1, mini ? 0 : Math.round(clamp(L.C * 0.7, 10, 15)));

  // Axis labels
  if (!mini) {
    const fs = Math.max(10, Math.round(L.m * 0.62));
    ctx.font = `bold ${fs}px "Courier New", monospace`; ctx.textBaseline = 'middle';
    const ty = L.oy - L.m / 2 - 1;
    const a0 = v.perm[0], a1 = v.perm[1], a2 = v.perm[2], a3 = v.perm[3];
    drawRich(ctx, [['in a board: ', t.dim], [AX[a0], t.axes[a0]], [v.flip[0] ? '← ' : '→ ', t.dim], [AX[a1], t.axes[a1]], [v.flip[1] ? '↑' : '↓', t.dim]], L.ox + 2, ty, 'left');
    drawRich(ctx, [['boards: ', t.dim], [AX[a2], t.axes[a2]], [v.flip[2] ? ' ←' : ' →', t.dim], ['  J·L', t.hop]], L.ox + L.side - 2, ty, 'right');
    ctx.save();
    ctx.translate(L.ox - L.m / 2 - 1, L.oy + L.side / 2);
    ctx.rotate(-Math.PI / 2);
    drawRich(ctx, [['boards: ', t.dim], [AX[a3], t.axes[a3]], [v.flip[3] ? ' →' : ' ←', t.dim], ['  I·K', t.hop]], 0, 0, 'center');
    ctx.restore();
  }

  if (g.tumble && !mini) drawTumbleBanner(ctx, W, H, g);
}

function drawTumbleBanner(ctx, W, H, g) {
  const a = Math.sin(Math.min(1, g.tumble.t) * Math.PI);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(W * 0.07)}px "Courier New", monospace`;
  ctx.lineWidth = 5; ctx.strokeStyle = T.bg;
  ctx.strokeText('HYPER-TUMBLE', W / 2, H / 2 - W * 0.03);
  ctx.fillStyle = T.hop; ctx.fillText('HYPER-TUMBLE', W / 2, H / 2 - W * 0.03);
  ctx.font = `bold ${Math.round(W * 0.04)}px "Courier New", monospace`;
  ctx.strokeText(g.tumble.label, W / 2, H / 2 + W * 0.04);
  ctx.fillStyle = T.text; ctx.fillText(g.tumble.label, W / 2, H / 2 + W * 0.04);
  ctx.globalAlpha = 1;
}

/* ───────────────────────── rendering: tesseract view ───────────────────────── */

const cam = { yaw: 0.62, pitch: -0.42, xw: 0, yw: 0, autoUntil: 0 };
let camClock = 0;

function makeProjector(W, H, N) {
  const R = Math.min(W, H) * 0.182;
  const half = (N - 1) / 2, norm = half + 0.5;
  const a1 = cam.xw + 0.32 * Math.sin(camClock * 0.00021), a2 = cam.yw + 0.18 * Math.sin(camClock * 0.00013 + 1);
  const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const D4 = 3.2, D3 = 5.2;
  const rot = (x, y, z, w) => {
    let q = x * c1 - w * s1; w = x * s1 + w * c1; x = q;
    q = y * c2 - w * s2; w = y * s2 + w * c2; y = q;
    const k4 = D4 / (D4 - w); x *= k4; y *= k4; z *= k4;
    q = x * cy + z * sy; z = -x * sy + z * cy; x = q;
    q = y * cp - z * sp; z = y * sp + z * cp; y = q;
    return [x, y, z, k4];
  };
  const P = (d) => {
    const [x, y, z, k4] = rot((d[0] - half) / norm, (d[1] - half) / norm, (d[2] - half) / norm, (d[3] - half) / norm);
    const k3 = D3 / (D3 - z);
    return { x: W / 2 + x * k3 * R, y: H / 2 + y * k3 * R, z, k: k3 * k4 };
  };
  // Direction of a display axis on screen (no perspective), for the axis gizmo.
  const dir = (slot) => { const e = [0, 0, 0, 0]; e[slot] = 1; const [x, y] = rot(e[0], e[1], e[2], e[3]); return [x, y]; };
  return { P, dir, unit: R / norm };
}

function renderTess(ctx, W, H, mini) {
  const g = G, N = g.N, t = T, v = g.view, now = performance.now();
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
  if (t.glow) {
    const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    gr.addColorStop(0, rgba(t.accent, 0.08)); gr.addColorStop(1, rgba(t.accent, 0));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  const { P, dir, unit } = makeProjector(W, H, N);

  // Hypercube frame: 16 corners, 32 edges, each coloured by the axis it runs along.
  const lo = -0.5, hi = N - 0.5, corners = [];
  for (let m = 0; m < 16; m++) corners.push(P([m & 1 ? hi : lo, m & 2 ? hi : lo, m & 4 ? hi : lo, m & 8 ? hi : lo]));
  ctx.lineWidth = mini ? 1 : 1.4;
  for (let m = 0; m < 16; m++) for (let k = 0; k < 4; k++) {
    if (m & (1 << k)) continue;
    const a = corners[m], b = corners[m | (1 << k)];
    ctx.strokeStyle = rgba(t.axes[v.perm[k]], mini ? 0.4 : 0.38);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // Lattice
  if (!mini) {
    ctx.fillStyle = t.dot;
    const d = [0, 0, 0, 0];
    for (d[3] = 0; d[3] < N; d[3]++) for (d[2] = 0; d[2] < N; d[2]++) for (d[1] = 0; d[1] < N; d[1]++) for (d[0] = 0; d[0] < N; d[0]++) {
      const p = P(d), s = Math.max(1.2, 1.9 * p.k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  const ds = snakeDisp(g).map(P);
  const n = ds.length;
  const dead = !g.alive && g.cause !== 'time' && g.cause !== 'win';
  const flash = dead && Math.floor((now - g.deathAt) / 110) % 2 === 0;
  const phased = g.fx.phase > g.gt;
  const apple = g.items.find((it) => it.type === 'apple');

  // Guide line from head to apple
  if (apple && g.alive) {
    const pa = P(dispNow(g, apple.c));
    ctx.strokeStyle = rgba(ITEMS.apple.col, 0.4); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ds[0].x, ds[0].y); ctx.lineTo(pa.x, pa.y); ctx.stroke(); ctx.setLineDash([]);
  }

  // Snake links (drawn back to front)
  const links = [];
  for (let i = 1; i < n; i++) if (!jumped(g.snake[i - 1], g.snake[i])) links.push(i);
  links.sort((a, b) => (ds[a - 1].z + ds[a].z) - (ds[b - 1].z + ds[b].z));
  ctx.lineCap = 'round';
  if (phased) ctx.globalAlpha = 0.55;
  for (const i of links) {
    const a = ds[i - 1], b = ds[i];
    ctx.strokeStyle = flash ? t.danger : segColour(i, n);
    ctx.lineWidth = Math.max(1, unit * 0.16 * Math.min(a.k, b.k));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Everything with a position, sorted by depth
  const objs = [];
  for (let i = 0; i < n; i++) objs.push({ z: ds[i].z + (i === 0 ? 0.02 : 0), kind: 'seg', i, p: ds[i] });
  for (const it of g.items) objs.push({ z: 0, kind: 'item', it, p: P(dispNow(g, it.c)) });
  for (const o of g.obstList) objs.push({ z: 0, kind: 'obst', p: P(dispNow(g, o)) });
  for (const o of objs) if (o.kind !== 'seg') o.z = o.p.z;
  objs.sort((a, b) => a.z - b.z);

  for (const o of objs) {
    const p = o.p, r = Math.max(1.5, unit * 0.2 * p.k);
    if (o.kind === 'seg') {
      if (phased) ctx.globalAlpha = 0.55 + 0.2 * Math.sin(now / 80);
      if (o.i === 0) {
        if (t.glow && !mini) { ctx.shadowColor = t.head; ctx.shadowBlur = 14; }
        ctx.fillStyle = dead ? t.danger : t.head;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.25, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (!mini) { ctx.strokeStyle = rgba(t.accent, 0.8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.25 + 3, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        ctx.fillStyle = flash ? t.danger : segColour(o.i, n);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(t.bg, 0.35); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (o.kind === 'item') {
      const I = ITEMS[o.it.type];
      const left = I.ttl ? I.ttl - (g.gt - o.it.born) : Infinity;
      if (left < 2500 && Math.floor(now / 130) % 2) continue;
      const pulse = 1 + 0.12 * Math.sin(now / 180 + o.it.i);
      ctx.fillStyle = rgba(I.col, 0.28);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.9 * pulse, 0, Math.PI * 2); ctx.fill();
      if (r * 2.4 >= 7) drawEmoji(ctx, I.emoji, p.x, p.y, r * 2.4);
      else { ctx.fillStyle = I.col; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      const s = r * 1.1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s, p.y); ctx.closePath();
      ctx.fillStyle = t.obst; ctx.fill(); ctx.strokeStyle = t.obstEdge; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  drawParts(ctx, (c) => { const p = P(dispNow(g, c)); return [p.x, p.y]; }, mini ? W / VW : 1, mini ? 0 : 13);

  if (!mini) {
    // Axis gizmo
    const ox = 34, oy = H - 34;
    ctx.font = 'bold 11px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = dir(k), len = Math.hypot(dx, dy), col = t.axes[v.perm[k]], sg = v.flip[k] ? -1 : 1;
      if (len < 0.25) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, oy, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.fillText(AX[v.perm[k]] + (sg > 0 ? ' out' : ' in'), ox + 30, oy + 16);
        continue;
      }
      const ex = ox + dx * sg * 22, ey = oy + dy * sg * 22;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(AX[v.perm[k]], ox + dx * sg * 31, oy + dy * sg * 31);
    }
    ctx.fillStyle = rgba(t.text, 0.55); ctx.font = '10px "Courier New", monospace'; ctx.textAlign = 'right';
    ctx.fillText('drag: spin · shift-drag: spin in 4D · dbl-click: reset', W - 8, H - 10);
    if (g.tumble) drawTumbleBanner(ctx, W, H, g);
  }
}

/* ───────────────────────── canvases & layout ───────────────────────── */

const view = $('view'), vctx = view.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const layoutEl = $('game-layout'), panel = $('side-panel'), winEl = document.querySelector('.window');
let VW = 480, MW = 188, MH = 160;

function sizeCanvas(c, w, h) {
  const dpr = window.devicePixelRatio || 1;
  c.style.width = w + 'px'; c.style.height = h + 'px';
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
}
function layout() {
  const maxed = winEl.classList.contains('maximized');
  const vw = window.innerWidth, vh = window.innerHeight;
  const PANEL = 214, TITLE = 26, TASK = 40;
  let size, column = false, panelH;
  if (maxed) {
    const aw = vw - 6, ah = vh - TASK - TITLE - 6;
    if (aw - PANEL >= 380) { size = Math.min(aw - PANEL, ah); panelH = size; }
    else { column = true; size = Math.min(aw, Math.max(260, ah - 190)); panelH = Math.max(150, ah - size); }
  } else {
    size = Math.max(300, Math.min(vw - PANEL - 40, vh - TASK - TITLE - 44, 660));
    panelH = size;
  }
  VW = Math.max(200, Math.floor(size));
  sizeCanvas(view, VW, VW);
  layoutEl.classList.toggle('column', column);
  panel.style.height = panelH + 'px';
  MW = column ? clamp(vw - 40, 150, 300) : 188;
  MH = Math.round(MW * (column ? 0.62 : 0.86));
  sizeCanvas(mini, MW, MH);
}

/* ───────────────────────── main loop ───────────────────────── */

let lastFrame = performance.now();
let hudClock = 0;

function loop(now) {
  requestAnimationFrame(loop);    // schedule first so one bad frame can't stop the game
  frame(now);
}

function frame(now) {
  const dt = clamp(now - lastFrame, 0, 64);
  lastFrame = now;
  camClock += dt;
  if (now > cam.autoUntil) cam.yaw += dt * 0.00011;

  const g = G;
  if (g) {
    const running = state === 'play' || (state === 'menu' && g.demo);
    if (g.tumble) {
      g.tumble.t += dt / g.tumble.dur;
      if (g.tumble.t >= 1) {
        g.tumble = null;
        g.prev = g.snake.slice();
        g.tickStart = g.gt; g.nextTick = g.gt + interval(g);
        if (!g.demo) checkAch(g);
      }
    } else if (running && g.alive) {
      g.gt += dt;
      if (g.mode === 'timed' && !g.demo) {
        g.timeLeft -= dt;
        if (g.timeLeft <= 0) { g.timeLeft = 0; timeUp(g); }
      }
      let guard = 0;
      while (g.alive && !g.tumble && g.gt >= g.nextTick && guard++ < 3) {
        if (g.demo) autopilot(g);
        step(g);
        g.tickStart = g.nextTick;
        g.nextTick += interval(g);
        if (g.nextTick < g.gt) g.nextTick = g.gt + interval(g);
      }
      for (let k = g.items.length - 1; k >= 0; k--) {
        const it = g.items[k], ttl = ITEMS[it.type].ttl;
        if (ttl && g.gt - it.born > ttl) g.items.splice(k, 1);
      }
    }
    if (g.demo && !g.alive && now - g.deathAt > 1400) { G = demoGame(); parts = []; floats = []; }
  }
  updateParts(dt);
  render(now);

  hudClock += dt;
  if (hudClock > 100) { hudClock = 0; updateLive(); }
}

function render(now) {
  if (!G) return;
  const dpr = window.devicePixelRatio || 1;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (now < shakeUntil) vctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  if (CFG.view === 'grid') renderGrid(vctx, VW, VW, false); else renderTess(vctx, VW, VW, false);
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (CFG.view === 'grid') renderTess(mctx, MW, MH, true); else renderGrid(mctx, MW, MH, true);
}

/* ───────────────────────── game flow ───────────────────────── */

let cdTimers = [];
function demoGame() {
  const mode = CFG.mode === 'zen' || CFG.mode === 'tumble' ? CFG.mode : 'classic';
  return newGame({ mode, size: CFG.size, diff: 'easy', walls: CFG.walls, demo: true });
}
function clearTimers() { cdTimers.forEach(clearTimeout); cdTimers = []; }
function hideOverlays() {
  ['main-overlay', 'pause-menu', 'name-dialog', 'countdown'].forEach((id) => $(id).classList.remove('show'));
}

function showMenu() {
  clearTimers(); hideOverlays();
  state = 'menu';
  G = demoGame(); parts = []; floats = [];
  const m = MODES[CFG.mode];
  $('ov-title').innerHTML = '🐍 SNAKEY <sup>4D</sup>';
  $('ov-body').innerHTML =
    '<div class="overlay-line">Snake, plus two extra dimensions.</div>' +
    `<div class="overlay-mode"><b>${m.icon} ${m.label}</b> · ${settingsTag()}<br>${m.blurb}</div>`;
  $('ov-btns').innerHTML = '<button class="btn" id="ov-start">▶ START</button><button class="btn" id="ov-help">❓ How to play</button>';
  $('ov-hint').innerHTML = '<span class="blink">Press SPACE to start</span>';
  $('ov-start').onclick = startCountdown;
  $('ov-help').onclick = () => toggleHelp(true);
  $('main-overlay').classList.add('show');
  updatePanel();
}

function settingsTag() {
  if (CFG.mode === 'daily') return `5⁴ · Normal · Solid · ${dayStr()}`;
  const walls = CFG.mode === 'zen' ? 'Wrap' : CFG.walls === 'wrap' ? 'Wrap' : 'Solid';
  return `${CFG.size}⁴ · ${DIFFS[CFG.diff].label} · ${walls}`;
}

function startCountdown() {
  Snd.unlock();
  clearTimers(); hideOverlays(); toggleHelp(false);
  G = newGame({ mode: CFG.mode, size: CFG.size, diff: CFG.diff, walls: CFG.walls });
  parts = []; floats = [];
  state = 'countdown';
  updatePanel();
  const cd = $('countdown'), num = $('cd-num');
  cd.classList.add('show');
  const show = (k) => {
    num.textContent = k; num.classList.remove('cd-pulse'); void num.offsetWidth; num.classList.add('cd-pulse');
    Snd.count(false);
  };
  show(3);
  cdTimers.push(setTimeout(() => show(2), 600));
  cdTimers.push(setTimeout(() => show(1), 1200));
  cdTimers.push(setTimeout(() => { cd.classList.remove('show'); state = 'play'; Snd.count(true); }, 1800));
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  const g = G;
  $('pm-stats').innerHTML = `Score ${g.score} · Length ${lenOf(g)}<br>Hops ${g.hops} · ${fmtTime(g.gt)}`;
  $('pause-menu').classList.add('show');
}
function resume() {
  if (state !== 'paused') return;
  $('pause-menu').classList.remove('show');
  toggleHelp(false);
  state = 'play';
}

function finishGame() {
  const g = G;
  if (!g || g.demo || g.finished) return;
  g.finished = true;
  lastRun = g;

  const st = Object.assign({ games: 0, best: 0, foods: 0, hops: 0, time: 0 }, load('stats', {}));
  st.games++; st.best = Math.max(st.best, g.score); st.foods += g.eaten; st.hops += g.hops; st.time += g.gt;
  save('stats', st);

  if (g.mode === 'daily') {
    const rec = load('daily', {}), key = dayStr();
    if (!rec[key] || g.score > rec[key]) rec[key] = g.score;
    save('daily', rec);
    const sk = load('streak', { n: 0, last: '' });
    if (sk.last !== key) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      sk.n = sk.last === dayStr(y) ? sk.n + 1 : 1; sk.last = key;
      save('streak', sk);
    }
    unlock('daily');
  }
  checkAch(g);

  state = 'over';
  const list = getScores(g.mode);
  const qualifies = g.score > 0 && (list.length < MAX_SCORES || g.score > list[list.length - 1].s);
  if (qualifies) {
    $('ne-score').textContent = g.score;
    $('name-input').value = load('name', '');
    $('name-dialog').classList.add('show');
    setTimeout(() => $('name-input').focus(), 50);
  } else {
    showGameOver(false);
  }
  updatePanel();
}

function submitName() {
  const g = lastRun;
  const name = ($('name-input').value || 'SNAKE').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 8) || 'SNAKE';
  save('name', name);
  addScore(g.mode, { n: name, s: g.score, len: lenOf(g), size: g.N, d: dayStr() });
  $('name-dialog').classList.remove('show');
  scoreTab = g.mode;
  showGameOver(true);
  updatePanel();
}

const CAUSES = {
  wall: 'You hit the edge of hyperspace.',
  self: 'You bit yourself (in four dimensions).',
  obstacle: 'You hit a void crystal.',
  time: 'Time\'s up!',
  win: 'You filled all of hyperspace. Incredible.',
};

function showGameOver(isHigh) {
  const g = lastRun;
  const best = getScores(g.mode)[0];
  $('ov-title').textContent = g.cause === 'time' ? '⏱ TIME!' : g.cause === 'win' ? '🏆 YOU WIN' : '💀 GAME OVER';
  let body = `<div class="overlay-line">${CAUSES[g.cause] || ''}</div>` +
    `<div class="overlay-stats">Score <b>${g.score}</b>${isHigh ? ' 🏆' : ''}<br>` +
    `Length ${lenOf(g)} · Eaten ${g.eaten} · Hops ${g.hops}<br>` +
    (g.bestCombo > 1 ? `Best combo ×${Math.min(g.bestCombo, 5)} · ` : '') + `Time ${fmtTime(g.gt)}</div>`;
  if (best) body += `<div class="overlay-line" style="font-size:11px;color:#444;">${MODES[g.mode].label} best: ${best.s} (${best.n})</div>`;
  if (g.mode === 'daily') body += `<div class="overlay-line" style="font-size:11px;color:#444;">Today's best: ${load('daily', {})[dayStr()] || g.score}</div>`;
  $('ov-body').innerHTML = body;
  $('ov-btns').innerHTML = '<button class="btn" id="ov-again">▶ Play again</button><button class="btn" id="ov-share">📋 Copy score</button><button class="btn" id="ov-menu">Menu</button>';
  $('ov-hint').textContent = 'Space = play again';
  $('ov-again').onclick = startCountdown;
  $('ov-menu').onclick = showMenu;
  $('ov-share').onclick = () => {
    const txt = `🐍 Snakey 4D — ${g.score} pts in ${MODES[g.mode].label} (${g.N}⁴), length ${lenOf(g)}, ${g.hops} hops through hyperspace. mondayjeffrey.com/snake/`;
    const done = () => toast('📋', 'Score copied to clipboard');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => toast('⚠️', 'Couldn\'t copy'));
  };
  $('main-overlay').classList.add('show');
}

/* ───────────────────────── scores & achievements ───────────────────────── */

function getScores(mode) { return (load('scores', {})[mode] || []).slice().sort((a, b) => b.s - a.s); }
function addScore(mode, entry) {
  const all = load('scores', {});
  const list = (all[mode] || []).concat(entry).sort((a, b) => b.s - a.s).slice(0, MAX_SCORES);
  all[mode] = list; save('scores', all);
}

const unlocked = new Set(load('ach', []));
function unlock(id) {
  if (unlocked.has(id)) return;
  unlocked.add(id); save('ach', [...unlocked]);
  const a = ACHS.find((x) => x.id === id);
  toast(a.icon, 'Achievement: ' + a.name);
  Snd.ach();
  renderAch();
}
function checkAch(g) {
  if (g.demo) return;
  if (g.eaten >= 1) unlock('first');
  if (g.hops >= 25) unlock('hops');
  if (g.snake.length >= 15) unlock('len15');
  if (g.snake.length >= 30) unlock('len30');
  if (g.score >= 250) unlock('s250');
  if (g.score >= 1000) unlock('s1000');
  if (g.bestCombo >= 5) unlock('combo5');
  if (g.tumbles >= 3 && !g.tumble && g.alive) unlock('tumble3');
  if (g.tessEats >= 3) unlock('vision');
  if (g.wrapped.every(Boolean)) unlock('donut');
  if (g.visited.size >= g.N * g.N) unlock('tourist');
  if (g.mode === 'zen' && g.gt >= 300000) unlock('zen5');
  if (g.mode === 'timed' && g.score >= 300) unlock('timed');
  if (g.N === 6 && g.eaten >= 10) unlock('big');
  if (g.ghosted) unlock('ghost');
}

let toastQ = [], toastBusy = false;
function toast(icon, text, ms = 2300) {
  toastQ.push([icon, text, ms]);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const it = toastQ.shift();
  if (!it) { toastBusy = false; return; }
  toastBusy = true;
  $('toast-icon').textContent = it[0]; $('toast-text').textContent = it[1];
  $('toast').classList.add('show');
  setTimeout(() => { $('toast').classList.remove('show'); setTimeout(nextToast, 380); }, it[2]);
}

/* ───────────────────────── side panel ───────────────────────── */

const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let scoreTab = CFG.mode;

function buildStatic() {
  // Compass rows
  let html = '';
  for (let k = 0; k < 4; k++) {
    html += `<div class="cmp-row"><span class="cmp-slot" id="cs${k}"></span><span class="cmp-ax" id="ca${k}"></span>` +
      `<span class="cmp-track"><span class="cmp-fill" id="cf${k}"></span></span><span class="cmp-key" id="ck${k}"></span></div>`;
  }
  $('compass').innerHTML = html + '<div class="cmp-foot" id="cmp-foot"></div>';

  // Themes
  $('theme-row').innerHTML = THEME_ORDER.map((k) =>
    `<div class="swatch" data-theme="${k}" title="${THEMES[k].name}" style="background:${THEMES[k].swatch}"></div>`).join('');

  // Score tabs
  $('score-tabs').innerHTML = MODE_ORDER.map((m) => `<span class="score-tab" data-tab="${m}">${MODES[m].icon} ${MODES[m].label}</span>`).join('');

  renderAch();
  $('help-diagram').innerHTML = helpDiagram();
}

function renderAch() {
  $('ach-grid').innerHTML = ACHS.map((a) =>
    `<span class="ach-pip${unlocked.has(a.id) ? ' unlocked' : ''}" data-ach="${a.id}" title="${a.name}: ${a.desc}">${a.icon}</span>`).join('');
  $('ach-count').textContent = `${unlocked.size}/${ACHS.length}`;
}

// Things that change with settings or at the end of a game.
function updatePanel() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === CFG.mode));
  document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === CFG.diff));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', +b.dataset.size === CFG.size));
  document.querySelectorAll('[data-walls]').forEach((b) => b.classList.toggle('on', b.dataset.walls === CFG.walls));
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === CFG.view));
  document.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === CFG.theme));
  const locked = CFG.mode === 'daily';
  document.querySelectorAll('[data-diff],[data-size],[data-walls]').forEach((b) => { b.disabled = locked || (CFG.mode === 'zen' && b.dataset.walls != null); });
  $('mode-blurb').textContent = MODES[CFG.mode].blurb;
  $('sfx-btn').classList.toggle('on', CFG.sfx);
  $('music-btn').classList.toggle('on', CFG.music);
  $('mini-title').textContent = CFG.view === 'grid' ? 'Tesseract view' : 'Grid view';
  view.classList.toggle('draggable', CFG.view === 'tess');

  // High scores
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === scoreTab));
  const list = getScores(scoreTab);
  $('score-list').innerHTML = list.length
    ? list.map((e, i) => `<div class="score-row"><span>${i + 1}. ${e.n}</span><span>${e.s} <span class="dim">${e.size}⁴</span></span></div>`).join('')
    : '<div class="score-empty">No scores yet</div>';

  // Lifetime
  const st = Object.assign({ games: 0, best: 0, foods: 0, hops: 0, time: 0 }, load('stats', {}));
  $('lt-games').textContent = st.games; $('lt-best').textContent = st.best;
  $('lt-foods').textContent = st.foods; $('lt-hops').textContent = st.hops;
  $('lt-time').textContent = st.time >= 3600000 ? `${(st.time / 3600000).toFixed(1)}h` : `${Math.round(st.time / 60000)}m`;
  const sk = load('streak', { n: 0, last: '' });
  const y = new Date(); y.setDate(y.getDate() - 1);
  $('lt-streak').textContent = sk.last === dayStr() || sk.last === dayStr(y) ? sk.n : 0;
  updateLive();
}

// Things that change every tick (called ~10×/s).
function updateLive() {
  const g = G;
  if (!g) return;
  const real = !g.demo ? g : lastRun;
  const mode = real ? real.mode : CFG.mode;
  const best = getScores(mode)[0];
  $('p-modetag').textContent = `${MODES[mode].icon} ${MODES[mode].label}${g.demo ? ' · demo' : ''}`;
  $('p-score').textContent = real ? real.score : 0;
  $('p-best').textContent = best ? best.s : 0;
  $('p-len').textContent = real ? lenOf(real) : 0;
  $('p-eaten').textContent = real ? real.eaten : 0;
  $('p-hops').textContent = real ? real.hops : 0;
  if (real) {
    const D = real.D, lvl = 1 + Math.round((D.start - real.tickMs) / Math.max(1, D.start - D.min) * 9);
    $('p-speed').textContent = real.fx.slow > real.gt ? lvl + '🐢' : lvl;
  } else $('p-speed').textContent = 1;

  const timed = real && real.mode === 'timed';
  $('timer-wrap').style.display = timed ? '' : 'none';
  if (timed) {
    $('p-time').textContent = Math.ceil(real.timeLeft / 1000) + 's';
    const bar = $('timer-bar');
    bar.style.width = clamp(real.timeLeft / 60000 * 100, 0, 100) + '%';
    bar.style.background = real.timeLeft < 10000 ? '#cc0000' : real.timeLeft < 20000 ? '#dd8800' : '#00aa00';
  }
  const comboOn = real && real.alive && real.combo > 1 && real.gt < real.comboUntil;
  $('combo-display').textContent = comboOn ? `🔥 ×${Math.min(real.combo, 5)} COMBO` : '';

  // Compass (for whatever is on screen — the demo teaches too)
  const apple = g.items.find((it) => it.type === 'apple');
  const head = g.snake[0], v = g.view;
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const a = v.perm[k];
    let d = apple ? axisDelta(g, head[a], apple.c[a]) : 0;
    if (v.flip[k]) d = -d;
    total += Math.abs(d);
    $('cs' + k).textContent = SLOT_TAG[k] + (k % 2 ? '↕' : '↔');
    const ax = $('ca' + k); ax.textContent = AX[a]; ax.style.color = PANEL_AX[a];
    const fill = $('cf' + k), frac = Math.min(1, Math.abs(d) / (g.N - 1)) * 50;
    fill.style.background = PANEL_AX[a];
    fill.style.left = d >= 0 ? '50%' : (50 - frac) + '%';
    fill.style.width = frac + '%';
    const key = $('ck' + k);
    key.className = 'cmp-key' + (d === 0 ? ' ok' : '');
    key.textContent = d === 0 ? '✓' : `${KEYS[k][d > 0 ? 1 : 0]}×${Math.abs(d)}`;
  }
  $('cmp-dist').textContent = apple ? `${total} step${total === 1 ? '' : 's'}` : '';
  const hopsLeft = apple ? Math.abs(axisDelta(g, head[v.perm[2]], apple.c[v.perm[2]])) + Math.abs(axisDelta(g, head[v.perm[3]], apple.c[v.perm[3]])) : 0;
  $('cmp-foot').textContent = !apple ? '' : total === 0 ? '' : hopsLeft === 0 ? 'Apple is in your board!' : `${hopsLeft} hop${hopsLeft === 1 ? '' : 's'} to the apple's board`;

  // Power-ups
  const pu = [];
  if (real && real.alive) {
    for (const [k, col] of [['phase', '#6a4fb3'], ['slow', '#1f7a3a']]) {
      const left = real.fx[k] - real.gt;
      if (left > 0) pu.push(`<span class="pu-badge${left < 2000 ? ' pu-expiring' : ''}" style="background:${col}">${ITEMS[k].emoji} ${k} ${Math.ceil(left / 1000)}s</span>`);
    }
  }
  const puHtml = pu.length ? pu.join('') : '<span class="pu-none">None active</span>';
  if ($('pu-slots').innerHTML !== puHtml) $('pu-slots').innerHTML = puHtml;
}

/* ───────────────────────── help diagram ───────────────────────── */

function helpDiagram() {
  // 3×3 boards of 4×4 cells; the head sits in the middle board, with its moves drawn.
  const bs = 64, gap = 14, cs = bs / 4, ox = 40, oy = 30, W = ox + 3 * bs + 2 * gap + 16, H = oy + 3 * bs + 2 * gap + 30;
  const bx = (c) => ox + c * (bs + gap), by = (r) => oy + r * (bs + gap);
  const cx = (b, i) => bx(b) + (i + 0.5) * cs, cy = (b, j) => by(b) + (j + 0.5) * cs;
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Courier New, monospace" font-weight="bold">`;
  s += '<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#c38bff"/></marker>' +
    '<marker id="ag" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#b4ffd8"/></marker></defs>';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const hot = (r === 1 && c === 2) || (r === 2 && c === 1);
    s += `<rect x="${bx(c)}" y="${by(r)}" width="${bs}" height="${bs}" rx="4" fill="${hot ? '#1d1a45' : '#0e1530'}" stroke="${r === 1 && c === 1 ? '#5ef0ff' : '#1f2b58'}" stroke-width="${r === 1 && c === 1 ? 2 : 1}"/>`;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += `<rect x="${cx(c, i) - 1}" y="${cy(r, j) - 1}" width="2" height="2" fill="rgba(140,170,255,0.3)"/>`;
  }
  // head + body in middle board
  s += `<rect x="${cx(1, 0) - 6}" y="${cy(1, 1) - 6}" width="12" height="12" rx="3" fill="#1b6b93"/>`;
  s += `<rect x="${cx(1, 1) - 7}" y="${cy(1, 1) - 7}" width="14" height="14" rx="4" fill="#b4ffd8"/>`;
  // in-board move
  s += `<line x1="${cx(1, 1) + 8}" y1="${cy(1, 1)}" x2="${cx(1, 2) + 3}" y2="${cy(1, 1)}" stroke="#b4ffd8" stroke-width="2" marker-end="url(#ag)"/>`;
  s += `<text x="${cx(1, 2) + 2}" y="${cy(1, 3) + 5}" fill="#b4ffd8" font-size="10" text-anchor="middle">→</text>`;
  // hop right (L)
  s += `<path d="M${cx(1, 1)},${cy(1, 1) - 8} Q${(cx(1, 1) + cx(2, 1)) / 2},${by(1) - 16} ${cx(2, 1)},${cy(1, 1) - 10}" fill="none" stroke="#c38bff" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#ah)"/>`;
  s += `<rect x="${cx(2, 1) - 7}" y="${cy(1, 1) - 7}" width="14" height="14" rx="4" fill="none" stroke="#c38bff" stroke-width="2" stroke-dasharray="3 2"/>`;
  s += `<text x="${bx(2) + bs / 2}" y="${by(1) + bs - 8}" fill="#c38bff" font-size="13" text-anchor="middle">L</text>`;
  // hop down (K)
  s += `<path d="M${cx(1, 1) - 8},${cy(1, 1)} Q${bx(1) - 12},${(cy(1, 1) + cy(2, 1)) / 2} ${cx(1, 1) - 9},${cy(2, 1)}" fill="none" stroke="#c38bff" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#ah)"/>`;
  s += `<rect x="${cx(1, 1) - 7}" y="${cy(2, 1) - 7}" width="14" height="14" rx="4" fill="none" stroke="#c38bff" stroke-width="2" stroke-dasharray="3 2"/>`;
  s += `<text x="${bx(1) + bs - 10}" y="${by(2) + bs - 8}" fill="#c38bff" font-size="13" text-anchor="middle">K</text>`;
  // axis labels
  const mid = ox + (3 * bs + 2 * gap) / 2, bottom = oy + 3 * bs + 2 * gap + 18;
  s += `<text x="${mid}" y="${oy - 12}" font-size="11" fill="#4db3ff" text-anchor="middle">Z → across the boards</text>`;
  s += `<text x="${mid}" y="${bottom}" font-size="11" text-anchor="middle"><tspan fill="#ff6b81">X→</tspan> <tspan fill="#5cf29a">Y↓</tspan><tspan fill="#8a9bd0"> inside each board</tspan></text>`;
  s += `<text transform="translate(${ox - 16},${oy + (3 * bs + 2 * gap) / 2}) rotate(-90)" font-size="11" fill="#ffd24d" text-anchor="middle">← W down boards</text>`;
  s += '</svg>';
  return s;
}

/* ───────────────────────── input ───────────────────────── */

const KEYMAP = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, -1], ArrowDown: [1, 1],
  KeyA: [0, -1], KeyD: [0, 1], KeyW: [1, -1], KeyS: [1, 1],
  KeyJ: [2, -1], KeyL: [2, 1], KeyI: [3, -1], KeyK: [3, 1],
};
let helpOpen = false;

function press(slot, sign) {
  if ((state === 'play' || state === 'countdown') && G && !G.demo && G.alive) queueDir(G, slot, sign);
}

document.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.key === 'Enter') submitName();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let m = KEYMAP[e.code];
  if (m && e.shiftKey && e.code.startsWith('Arrow')) m = [m[0] + 2, m[1]];
  if (m) {
    if (state === 'play' || state === 'countdown' || e.code.startsWith('Arrow')) e.preventDefault();
    press(m[0], m[1]);
    return;
  }
  switch (e.code) {
    case 'Space': case 'Enter':
      e.preventDefault();
      if (helpOpen) toggleHelp(false);
      else if (state === 'menu' || state === 'over') { if (!$('name-dialog').classList.contains('show')) startCountdown(); }
      else if (state === 'play') pause();
      else if (state === 'paused') resume();
      break;
    case 'KeyP': case 'Escape':
      if (helpOpen) toggleHelp(false);
      else if (state === 'play') pause();
      else if (state === 'paused') resume();
      break;
    case 'KeyR': if (state === 'play' || state === 'paused' || state === 'over') startCountdown(); break;
    case 'KeyV': setView(CFG.view === 'grid' ? 'tess' : 'grid'); break;
    case 'KeyH': toggleHelp(!helpOpen); break;
    case 'KeyT': setTheme(THEME_ORDER[(THEME_ORDER.indexOf(CFG.theme) + 1) % THEME_ORDER.length]); break;
    case 'KeyX': CFG.sfx = !CFG.sfx; saveCfg(); updatePanel(); toast(CFG.sfx ? '🔊' : '🔇', CFG.sfx ? 'Sound effects on' : 'Sound effects off', 1200); break;
    case 'KeyM': toggleMusic(); break;
  }
});

function toggleMusic() {
  CFG.music = !CFG.music; saveCfg();
  Snd.unlock(); Snd.music(CFG.music);
  updatePanel();
}
function toggleHelp(on) {
  helpOpen = on;
  $('help-overlay').classList.toggle('show', on);
  if (on && state === 'play') pause();
  if (on) save('seenHelp', true);
}
function setView(vw) {
  CFG.view = vw; saveCfg(); updatePanel();
}
function setTheme(k) {
  CFG.theme = k; T = THEMES[k]; saveCfg(); updatePanel();
  $('game-area').style.background = T.bg;
}
function settingChanged() {
  saveCfg();
  if (state === 'menu') showMenu();
  else if (state === 'over') updatePanel();
  else { updatePanel(); note('Takes effect next game'); }
}
let noteTimer = 0;
function note(msg) {
  const el = $('settings-note');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(noteTimer); noteTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
}

// Panel buttons
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode],[data-diff],[data-size],[data-walls],[data-view],[data-theme],[data-tab]');
  if (!b || b.disabled) return;
  Snd.click();
  if (b.dataset.mode) { CFG.mode = b.dataset.mode; scoreTab = CFG.mode; settingChanged(); }
  else if (b.dataset.diff) { CFG.diff = b.dataset.diff; settingChanged(); }
  else if (b.dataset.size) { CFG.size = +b.dataset.size; settingChanged(); }
  else if (b.dataset.walls) { CFG.walls = b.dataset.walls; settingChanged(); }
  else if (b.dataset.view) setView(b.dataset.view);
  else if (b.dataset.theme) setTheme(b.dataset.theme);
  else if (b.dataset.tab) { scoreTab = b.dataset.tab; updatePanel(); }
});
$('ach-grid').addEventListener('mouseover', (e) => {
  const p = e.target.closest('[data-ach]'); if (!p) return;
  const a = ACHS.find((x) => x.id === p.dataset.ach);
  $('ach-info').innerHTML = `<b>${a.name}</b>${unlocked.has(a.id) ? ' ✓' : ''} — ${a.desc}`;
});
$('sfx-btn').onclick = () => { CFG.sfx = !CFG.sfx; saveCfg(); updatePanel(); };
$('music-btn').onclick = toggleMusic;
$('help-btn').onclick = () => toggleHelp(true);
$('help-close').onclick = () => toggleHelp(false);
$('help-overlay').addEventListener('click', (e) => { if (e.target.id === 'help-overlay') toggleHelp(false); });
$('pm-resume').onclick = resume;
$('pm-restart').onclick = startCountdown;
$('pm-help').onclick = () => toggleHelp(true);
$('pm-quit').onclick = showMenu;
$('ne-submit').onclick = submitName;

// Touch pads
document.querySelectorAll('.pad-btn').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Snd.unlock();
    if (state === 'menu' || state === 'over') return;
    press(+b.dataset.slot, +b.dataset.sign);
  });
});
if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) $('game-area').classList.add('touch');

// Drag to spin the tesseract (main canvas when in tess view; the mini canvas when it shows the tesseract).
function attachSpin(canvas, isTess, onClick) {
  let drag = null;
  canvas.addEventListener('contextmenu', (e) => { if (isTess()) e.preventDefault(); });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, four: e.shiftKey || e.button === 2 };
    if (isTess()) { canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (!isTess()) return;
    cam.autoUntil = performance.now() + 4000;
    if (drag.four) { cam.xw += dx * 0.008; cam.yw += dy * 0.008; }
    else { cam.yaw += dx * 0.009; cam.pitch = clamp(cam.pitch + dy * 0.009, -1.45, 1.45); }
  });
  const end = () => {
    if (drag && drag.moved < 5 && onClick) onClick();
    drag = null; canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('dblclick', () => { if (isTess()) { cam.yaw = 0.62; cam.pitch = -0.42; cam.xw = 0; cam.yw = 0; } });
}
attachSpin(view, () => CFG.view === 'tess', null);
attachSpin(mini, () => CFG.view === 'grid', () => setView(CFG.view === 'grid' ? 'tess' : 'grid'));

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });
document.addEventListener('pointerdown', () => Snd.unlock(), { once: true });

/* ───────────────────────── boot ───────────────────────── */

buildStatic();
setTheme(CFG.theme);
layout();
window.addEventListener('resize', layout);
new MutationObserver(layout).observe(winEl, { attributes: true, attributeFilter: ['class'] });
showMenu();
if (!load('seenHelp', false)) toggleHelp(true);
lastFrame = performance.now();
requestAnimationFrame(loop);

// Console handle for testing: Snakey4D.advance(ms) runs the game forward in 16ms frames.
window.Snakey4D = {
  get game() { return G; },
  get state() { return state; },
  advance(ms) { for (let t = 0; t < ms; t += 16) frame(lastFrame + 16); },
  press,
};

})();
