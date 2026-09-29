/* Diorama — tools: input handling, brush engine and every editing tool.
   Other modules (roads, city) add their own tool definitions via D.toolDefs. */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE } = D;
const W = D.W;

const fmtM = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' km' : Math.round(v) + ' m';
const pct = v => Math.round(v * 100) + '%';
const O = {
  size: { id: 'size', label: 'Size', type: 'range', min: 8, max: 2500, log: true, fmt: fmtM, tip: '[ and ] to resize' },
  strength: { id: 'strength', label: 'Strength', type: 'range', min: 0.02, max: 1, fmt: pct, tip: 'Number keys 1–0 set strength' },
  hardness: { id: 'hardness', label: 'Hardness', type: 'range', min: 0, max: 1, fmt: pct, tip: 'Shift+[ and Shift+] change hardness' }
};

const Tools = D.Tools = {
  defs: {}, order: [], cur: null, opts: {},
  hit: null, mouse: { x: 0, y: 0, in: false }, stroke: null,
  selection: null, clipboard: null, paste: null,
  O, fmtM, pct
};
D.toolDefs = D.toolDefs || [];

function def(id, d) {
  d.id = id;
  Tools.defs[id] = d; Tools.order.push(id);
  Tools.opts[id] = Object.assign({}, d.defaults || {});
  return d;
}
Tools.def = def;
Tools.o = id => Tools.opts[id || Tools.cur];
Tools.optSpec = function (id) {
  const d = Tools.defs[id];
  return (d.options || []).map(o => typeof o === 'string' ? O[o] : o);
};

// ---- helpers ---------------------------------------------------------------------
const clampH = v => v < -600 ? -600 : v > 3200 ? 3200 : v;
function rectFor(x, z, r) {
  return [Math.max(0, Math.floor((x - r) / CELL)), Math.max(0, Math.floor((z - r) / CELL)),
    Math.min(N, Math.ceil((x + r) / CELL)), Math.min(N, Math.ceil((z + r) / CELL))];
}
function growRect(st, r) {
  if (!st.rect) st.rect = r.slice();
  else { st.rect[0] = Math.min(st.rect[0], r[0]); st.rect[1] = Math.min(st.rect[1], r[1]); st.rect[2] = Math.max(st.rect[2], r[2]); st.rect[3] = Math.max(st.rect[3], r[3]); }
}
function eachV(r, cx, cz, rad, hard, fn) {
  for (let j = r[1]; j <= r[3]; j++) {
    const dz = j * CELL - cz;
    for (let i = r[0]; i <= r[2]; i++) {
      const dx = i * CELL - cx;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= rad) continue;
      fn(j * VN + i, D.falloff(d / rad, hard), i, j, d);
    }
  }
}
function heightEdit(st, r) {
  D.History.touch('h', r[0], r[1], r[2], r[3]);
  growRect(st, r);
}
function heightDone(r) { D.Terrain.markH(r[0], r[1], r[2], r[3]); }

// ================================================================================
// NAVIGATION
// ================================================================================
def('hand', { name: 'Hand', key: 'H', group: 'nav', icon: 'hand', desc: 'Drag to pan the view. You can also hold Space, or drag with the middle mouse button.', cursor: 'grab', noBrush: true,
  hint: '<b>Drag</b> to pan · right-drag to orbit · wheel to zoom' });

def('select', { name: 'Marquee Select', key: 'M', group: 'nav', icon: 'marquee', noBrush: true, cursor: 'crosshair',
  desc: 'Drag a rectangle to select land. Ctrl+C copies it (terrain, paint, trees and buildings), Ctrl+V pastes it somewhere else.',
  defaults: { hmode: 'relative', incTerrain: true, incPaint: true, incNature: true, incCity: true, feather: 3 },
  options: [
    { id: 'hmode', label: 'Paste height', type: 'seg', choices: [['relative', 'Relative'], ['absolute', 'Absolute'], ['max', 'Raise only']] },
    { id: 'incTerrain', label: 'Terrain', type: 'check' }, { id: 'incPaint', label: 'Paint', type: 'check' },
    { id: 'incNature', label: 'Nature', type: 'check' }, { id: 'incCity', label: 'Buildings', type: 'check' },
    { id: 'feather', label: 'Feather', type: 'range', min: 0, max: 12, step: 1, fmt: v => v + ' cells' }
  ],
  hint: '<b>Drag</b> to select · <b>Ctrl+C</b> copy · <b>Ctrl+V</b> paste · <b>Del</b> clear trees & buildings · <b>Ctrl+D</b> deselect',
  down(p, st) {
    if (Tools.paste) { commitPaste(p); st.cancel = true; return; }
    st.a = { x: p.x, z: p.z };
    Tools.setSelection(null);
  },
  drag(p, st) {
    if (!st.a) return;
    Tools.setSelection({ x0: Math.min(st.a.x, p.x), z0: Math.min(st.a.z, p.z), x1: Math.max(st.a.x, p.x), z1: Math.max(st.a.z, p.z) });
  },
  up(p, st) {
    const s = Tools.selection;
    if (s && (s.x1 - s.x0 < CELL * 2 || s.z1 - s.z0 < CELL * 2)) Tools.setSelection(null);
    else if (s) D.toast(`Selected ${fmtM(s.x1 - s.x0)} × ${fmtM(s.z1 - s.z0)}`);
  }
});

// ================================================================================
// TERRAIN
// ================================================================================
def('raise', { name: 'Raise / Lower', key: 'B', group: 'terrain', icon: 'raise', color: [0.35, 0.78, 1],
  desc: 'Paint the ground up or down. Hold Shift to lower.',
  defaults: { size: 320, strength: 0.45, hardness: 0.25, mode: 'raise' },
  options: ['size', 'strength', 'hardness', { id: 'mode', type: 'seg', choices: [['raise', 'Raise'], ['lower', 'Lower']] }],
  hint: '<b>Drag</b> to raise · hold <b>Shift</b> to lower',
  brushColor(st) { return ((Tools.o().mode === 'lower') !== !!(st && st.shift || Tools.keyShift)) ? [1, 0.55, 0.3] : [0.35, 0.78, 1]; },
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    heightEdit(st, r);
    const lower = (o.mode === 'lower') !== st.shift;
    const rate = o.strength * (4 + o.size * 0.22) * (lower ? -1 : 1) * dt;
    const h = W.h;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w) => { h[k] = clampH(h[k] + rate * w); });
    heightDone(r);
  }
});

def('smooth', { name: 'Smooth', key: 'U', group: 'terrain', icon: 'smooth', color: [0.55, 0.85, 1],
  desc: 'Soften bumps and blend sharp edges, like a blur brush for land.',
  defaults: { size: 280, strength: 0.5, hardness: 0.2 },
  options: ['size', 'strength', 'hardness'],
  hint: '<b>Drag</b> to smooth',
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    const kr = Math.max(1, Math.round(o.size / CELL / 7));
    const x0 = Math.max(0, r[0] - kr), z0 = Math.max(0, r[1] - kr), x1 = Math.min(N, r[2] + kr), z1 = Math.min(N, r[3] + kr);
    const w = x1 - x0 + 1, hh = z1 - z0 + 1;
    const h = W.h;
    const src = new Float32Array(w * hh), tmp = new Float32Array(w * hh);
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) src[j * w + i] = h[(z0 + j) * VN + x0 + i];
    // separable box blur
    for (let j = 0; j < hh; j++) {
      let s = 0; const row = j * w;
      for (let i = -kr; i <= kr; i++) s += src[row + D.clamp(i, 0, w - 1)];
      for (let i = 0; i < w; i++) { tmp[row + i] = s / (2 * kr + 1); s += src[row + D.clamp(i + kr + 1, 0, w - 1)] - src[row + D.clamp(i - kr, 0, w - 1)]; }
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -kr; j <= kr; j++) s += tmp[D.clamp(j, 0, hh - 1) * w + i];
      for (let j = 0; j < hh; j++) { src[j * w + i] = s / (2 * kr + 1); s += tmp[D.clamp(j + kr + 1, 0, hh - 1) * w + i] - tmp[D.clamp(j - kr, 0, hh - 1) * w + i]; }
    }
    heightEdit(st, r);
    const kk = Math.min(1, o.strength * dt * 9);
    eachV(r, p.x, p.z, o.size, o.hardness, (k, wt, i, j) => {
      const a = src[(j - z0) * w + (i - x0)];
      h[k] += (a - h[k]) * Math.min(1, wt * kk);
    });
    heightDone(r);
  }
});

def('flatten', { name: 'Flatten', key: 'F', group: 'terrain', icon: 'flatten', color: [0.95, 0.85, 0.35],
  desc: 'Level the ground to the height where you start the stroke. Alt+click to sample a height; tick “Fixed” to reuse it.',
  defaults: { size: 220, strength: 0.6, hardness: 0.5, mode: 'level', useHeight: false, height: 20 },
  options: ['size', 'strength', 'hardness',
    { id: 'mode', type: 'seg', choices: [['level', 'Level'], ['cut', 'Cut only'], ['fill', 'Fill only']] },
    { id: 'useHeight', label: 'Fixed', type: 'check' },
    { id: 'height', label: 'Height', type: 'number', min: -500, max: 3000, step: 1, fmt: v => v.toFixed(0) + ' m' }],
  hint: '<b>Drag</b> to level to the start height · <b>Alt+click</b> to sample a height',
  down(p, st, o) {
    if (st.alt) { o.height = Math.round(p.y); o.useHeight = true; D.emit('opts'); D.toast(`Flatten height set to ${o.height} m`); st.cancel = true; return; }
    st.target = o.useHeight ? o.height : p.y;
  },
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    heightEdit(st, r);
    const h = W.h, t = st.target;
    const kk = o.strength * dt * 10;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w) => {
      const d = t - h[k];
      if ((o.mode === 'cut' && d > 0) || (o.mode === 'fill' && d < 0)) return;
      h[k] += d * Math.min(1, w * kk);
    });
    heightDone(r);
  }
});

let noiseObj = null;
def('noise', { name: 'Noise', key: 'N', group: 'terrain', icon: 'noise', color: [0.8, 0.6, 1],
  desc: 'Roughen the ground with natural bumps or craggy ridges. Strokes build up the same pattern.',
  defaults: { size: 400, strength: 0.4, hardness: 0.2, scale: 'medium', kind: 'bumps' },
  options: ['size', 'strength', 'hardness',
    { id: 'scale', type: 'seg', choices: [['fine', 'Fine'], ['medium', 'Medium'], ['coarse', 'Coarse']] },
    { id: 'kind', type: 'seg', choices: [['bumps', 'Bumps'], ['ridges', 'Ridges']] }],
  hint: '<b>Drag</b> to roughen · hold <b>Shift</b> to invert',
  apply(p, dt, st, o) {
    if (!noiseObj) noiseObj = D.makeNoise(W.seed + 12345);
    const f = { fine: 1 / 70, medium: 1 / 200, coarse: 1 / 520 }[o.scale];
    const r = rectFor(p.x, p.z, o.size);
    heightEdit(st, r);
    const amp = o.strength * (3 + o.size * 0.05) * dt * 2.5 * (st.shift ? -1 : 1);
    const h = W.h;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w, i, j) => {
      const x = i * CELL * f, z = j * CELL * f;
      const v = o.kind === 'ridges' ? (noiseObj.ridged(x, z, 4) - 0.35) * 2 : noiseObj.fbm(x, z, 4) * 1.6;
      h[k] = clampH(h[k] + v * amp * w);
    });
    heightDone(r);
  }
});

def('terrace', { name: 'Terrace', key: 'T', group: 'terrain', icon: 'terrace', color: [0.6, 0.9, 0.5],
  desc: 'Carve stepped shelves into slopes: rice paddies, quarries, stepped hills.',
  defaults: { size: 350, strength: 0.5, hardness: 0.3, step: 12, sharp: 0.6 },
  options: ['size', 'strength', 'hardness',
    { id: 'step', label: 'Step', type: 'range', min: 2, max: 120, step: 1, fmt: v => v.toFixed(0) + ' m' },
    { id: 'sharp', label: 'Sharpness', type: 'range', min: 0, max: 1, fmt: pct }],
  hint: '<b>Drag</b> across a slope to terrace it',
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    heightEdit(st, r);
    const h = W.h, stp = o.step, kp = 1 + o.sharp * 9, base = W.seaLevel;
    const kk = o.strength * dt * 7;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w) => {
      const f = (h[k] - base) / stp, b = Math.floor(f), t = f - b;
      const target = base + (b + Math.pow(t, kp)) * stp;
      h[k] += (target - h[k]) * Math.min(1, w * kk);
    });
    heightDone(r);
  }
});

def('erode', { name: 'Erode', key: 'O', group: 'terrain', icon: 'erode', color: [0.9, 0.7, 0.45],
  desc: 'Weather the land. Rain carves gullies and valleys; Slump crumbles steep slopes into scree.',
  defaults: { size: 450, strength: 0.5, hardness: 0.3, kind: 'rain' },
  options: ['size', 'strength', 'hardness', { id: 'kind', type: 'seg', choices: [['rain', 'Rain gullies'], ['slump', 'Slump']] }],
  hint: '<b>Drag</b> over mountains to weather them',
  down(p, st) { st.rnd = D.rng(Date.now() & 0xffff); },
  apply(p, dt, st, o) {
    const h = W.h;
    if (o.kind === 'rain') {
      const r = rectFor(p.x, p.z, o.size);
      const big = [r[0] - 10, r[1] - 10, r[2] + 10, r[3] + 10].map(v => D.clamp(v, 0, N));
      heightEdit(st, big);
      const drops = Math.ceil(o.strength * dt * (300 + (o.size / CELL) * (o.size / CELL) * 1.2));
      const rr = o.size / CELL * 0.75;
      const ci = p.x / CELL, cj = p.z / CELL;
      D.Gen.erodeSync(h, Math.min(drops, 4000), st.rnd, [Math.floor(ci - rr), Math.floor(cj - rr), Math.ceil(ci + rr), Math.ceil(cj + rr), 8], 1.3);
      heightDone(big);
    } else {
      const r = rectFor(p.x, p.z, o.size);
      heightEdit(st, r);
      const talus = CELL * (0.9 - o.strength * 0.4);
      const nb = [1, -1, VN, -VN];
      for (let it = 0; it < 2; it++) eachV(r, p.x, p.z, o.size, o.hardness, (k, w, i, j) => {
        if (i < 1 || j < 1 || i >= N || j >= N) return;
        for (let q = 0; q < 4; q++) {
          const n = k + nb[q];
          const diff = h[k] - h[n];
          if (diff > talus) { const m = (diff - talus) * 0.25 * w * Math.min(1, dt * 20); h[k] -= m; h[n] += m; }
        }
      });
      heightDone(r);
    }
  }
});

def('cliff', { name: 'Cliff', key: 'C', group: 'terrain', icon: 'cliff', color: [1, 0.72, 0.35],
  desc: 'Paint a plateau with sheer edges, stepped up (or down) from where you click. Great for coastlines, quarries and mesas.',
  defaults: { size: 160, strength: 0.8, hardness: 0.9, step: 30 },
  options: ['size', 'strength', 'hardness', { id: 'step', label: 'Step', type: 'range', min: -250, max: 250, step: 1, fmt: v => (v > 0 ? '+' : '') + v.toFixed(0) + ' m' }],
  hint: '<b>Drag</b> to paint a cliff-edged plateau · <b>Shift</b> flips the step',
  down(p, st, o) { st.target = p.y + o.step * (st.shift ? -1 : 1); st.up = (o.step * (st.shift ? -1 : 1)) > 0; },
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    heightEdit(st, r);
    const h = W.h, t = st.target, kk = o.strength * dt * 14;
    const hard = Math.max(o.hardness, 0.6);
    eachV(r, p.x, p.z, o.size, hard, (k, w) => {
      const d = t - h[k];
      if (st.up ? d < 0 : d > 0) return;
      h[k] += d * Math.min(1, D.smooth(0.2, 0.55, w) * kk);
    });
    heightDone(r);
  }
});

def('ramp', { name: 'Ramp', key: 'G', group: 'terrain', icon: 'ramp', color: [1, 0.75, 0.25], historyStroke: true,
  desc: 'Drag from one point to another to cut a straight, even slope between their heights. Perfect for roads up hills.',
  defaults: { size: 40, hardness: 0.5, ease: false },
  options: [Object.assign({}, O.size, { label: 'Width' }), 'hardness', { id: 'ease', label: 'S-curve', type: 'check' }],
  hint: '<b>Drag</b> from the bottom to the top of your slope',
  down(p, st) { st.a = { x: p.x, z: p.z, y: p.y }; st.b = { x: p.x, z: p.z, y: p.y }; },
  drag(p, st, o) {
    st.b = { x: p.x, z: p.z, y: p.y };
    D.TU.uLine.value.set(st.a.x, st.a.z, st.b.x, st.b.z);
    D.TU.uLineOn.value.set(1, o.size, 0, 0);
    const len = Math.hypot(st.b.x - st.a.x, st.b.z - st.a.z);
    D.hint(`Ramp ${fmtM(len)} · ${(st.b.y - st.a.y).toFixed(0)} m rise · ${len > 0 ? Math.abs((st.b.y - st.a.y) / len * 100).toFixed(0) : 0}% grade`, 0);
  },
  up(p, st, o) {
    D.TU.uLineOn.value.x = 0; D.hint(null);
    const a = st.a, b = st.b;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < CELL * 2) return;
    const hw = o.size / 2;
    const r = rectFor(Math.min(a.x, b.x) - hw, Math.min(a.z, b.z) - hw, 0);
    const r2 = rectFor(Math.max(a.x, b.x) + hw, Math.max(a.z, b.z) + hw, 0);
    const rr = [r[0], r[1], r2[2], r2[3]];
    heightEdit(st, rr);
    const h = W.h, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    for (let j = rr[1]; j <= rr[3]; j++) for (let i = rr[0]; i <= rr[2]; i++) {
      const px = i * CELL, pz = j * CELL;
      const t = ((px - a.x) * dx + (pz - a.z) * dz) / L2;
      if (t < -0.02 || t > 1.02) continue;
      const tc = D.clamp(t, 0, 1);
      const d = Math.hypot(px - (a.x + dx * tc), pz - (a.z + dz * tc));
      if (d >= hw) continue;
      const w = D.falloff(d / hw, o.hardness);
      const u = o.ease ? tc * tc * (3 - 2 * tc) : tc;
      const target = a.y + (b.y - a.y) * u;
      const k = j * VN + i;
      h[k] += (target - h[k]) * w;
    }
    heightDone(rr);
  }
});

const STAMPS = [
  { id: 'mountain', name: 'Mountain' }, { id: 'volcano', name: 'Volcano' }, { id: 'hill', name: 'Hill' }, { id: 'mesa', name: 'Mesa' },
  { id: 'ridge', name: 'Ridge' }, { id: 'crater', name: 'Crater' }, { id: 'canyon', name: 'Canyon' }, { id: 'dunes', name: 'Dunes' }
];
Tools.STAMPS = STAMPS;
function stampShape(id, u, v, nz) {
  const d = Math.sqrt(u * u + v * v);
  if (d >= 1 && id !== 'ridge' && id !== 'canyon' && id !== 'dunes') return 0;
  switch (id) {
    case 'mountain': { const base = Math.pow(1 - d, 1.6); const rd = nz.ridged(u * 2.2 + 5, v * 2.2 + 5, 5); return base * (0.45 + 0.75 * rd) * (1 - Math.pow(d, 6)); }
    case 'volcano': { const cone = Math.pow(1 - d, 1.25); const crater = D.smooth(0.16, 0.07, d); return cone * (1 + nz.fbm(u * 4, v * 4, 3) * 0.12) - crater * 0.32; }
    case 'hill': return Math.exp(-d * d * 4.2) * (1 - d * d) * (1 + nz.fbm(u * 3, v * 3, 3) * 0.12);
    case 'mesa': { const top = D.smooth(0.82, 0.62, d + nz.fbm(u * 3, v * 3, 3) * 0.12); return top * (0.94 + nz.fbm(u * 8, v * 8, 2) * 0.05) + D.smooth(1, 0.8, d) * 0.06; }
    case 'ridge': { if (Math.abs(u) >= 1) return 0; const w = Math.exp(-v * v * 9); return w * Math.pow(1 - u * u, 0.8) * (0.5 + 0.6 * nz.ridged(u * 3 + 2, v * 3 + 2, 4)); }
    case 'crater': { const rim = Math.exp(-Math.pow((d - 0.72) / 0.14, 2)) * 0.45; const bowl = -D.smooth(0.72, 0.1, d) * 0.7; return (rim + bowl) * (1 - Math.pow(d, 8)); }
    case 'canyon': { if (Math.abs(u) >= 1) return 0; const mv = v + nz.fbm(u * 1.5, 3, 2) * 0.25; const w = D.smooth(0.28, 0.1, Math.abs(mv)); return -w * Math.pow(1 - u * u, 0.4); }
    case 'dunes': { if (d >= 1) return 0; const s = Math.pow(0.5 + 0.5 * Math.sin(u * 14 + nz.fbm(u * 2, v * 2, 2) * 3), 2); return s * (1 - d * d) * 0.35; }
  }
  return 0;
}
def('stamp', { name: 'Stamp', key: 'K', group: 'terrain', icon: 'stamp', color: [0.45, 0.95, 0.75], historyStroke: true,
  desc: 'Stamp a whole landform: a mountain, volcano, crater, canyon and more. Each stamp is unique.',
  defaults: { size: 900, height: 420, shape: 'mountain', rot: 0, randRot: true, blend: 'add' },
  options: ['size',
    { id: 'height', label: 'Height', type: 'range', min: 10, max: 1600, step: 5, fmt: v => v.toFixed(0) + ' m' },
    { id: 'shape', label: 'Shape', type: 'select', choices: STAMPS.map(s => [s.id, s.name]) },
    { id: 'rot', label: 'Rotate', type: 'range', min: 0, max: 360, step: 1, fmt: v => v.toFixed(0) + '°' },
    { id: 'randRot', label: 'Random', type: 'check' },
    { id: 'blend', type: 'seg', choices: [['add', 'Add'], ['max', 'Raise only'], ['sub', 'Carve']] }],
  hint: '<b>Click</b> to stamp · drag to stamp a row · <b>Shift</b> carves',
  down(p, st, o) { st.rnd = D.rng(Date.now() & 0xffffff); st.lastStamp = null; stampAt(p, st, o); },
  drag(p, st, o) { if (st.lastStamp && Math.hypot(p.x - st.lastStamp.x, p.z - st.lastStamp.z) > o.size * 0.9) stampAt(p, st, o); }
});
function stampAt(p, st, o) {
  st.lastStamp = { x: p.x, z: p.z };
  const R = o.size;
  const nz = D.makeNoise((st.rnd() * 1e9) | 0);
  const rot = (o.randRot ? st.rnd() * 360 : o.rot) * Math.PI / 180;
  const c = Math.cos(rot), s = Math.sin(rot);
  const reach = (o.shape === 'ridge' || o.shape === 'canyon') ? R * 1.05 : R;
  const r = rectFor(p.x, p.z, reach);
  heightEdit(st, r);
  const h = W.h;
  const blend = st.shift ? 'sub' : o.blend;
  const base = p.y;
  for (let j = r[1]; j <= r[3]; j++) for (let i = r[0]; i <= r[2]; i++) {
    const dx = i * CELL - p.x, dz = j * CELL - p.z;
    let u = (dx * c + dz * s) / R, v = (-dx * s + dz * c) / R;
    if (o.shape === 'ridge' || o.shape === 'canyon') v *= 2.2;
    const val = stampShape(o.shape, u, v, nz);
    if (!val) continue;
    const k = j * VN + i;
    if (blend === 'add') h[k] = clampH(h[k] + val * o.height);
    else if (blend === 'sub') h[k] = clampH(h[k] - Math.abs(val) * o.height);
    else h[k] = Math.max(h[k], clampH(base + val * o.height));
  }
  heightDone(r);
}

// ================================================================================
// WATER
// ================================================================================
def('sea', { name: 'Sea Level', key: 'Y', group: 'water', icon: 'sea', noBrush: true, cursor: 'ns-resize',
  desc: 'Drag up or down in the view to raise or lower the ocean. Alt+click sets the sea to that spot’s height.',
  defaults: {},
  options: [{ id: 'sea', label: 'Sea level', type: 'range', min: -250, max: 900, step: 0.5, fmt: v => v.toFixed(1) + ' m', get: () => W.seaLevel, set: v => { D.Water.setSeaLevel(v); } }],
  hint: '<b>Drag up/down</b> to flood or drain · <b>Alt+click</b> to set from terrain',
  down(p, st, o, e) {
    D.History.begin('Sea Level', 'sea'); D.History.touchObj('sea');
    if (st.alt && p) { D.Water.setSeaLevel(p.y + 0.1); st.cancel = true; D.History.end(); return; }
    st.y0 = W.seaLevel; st.sy = e.clientY;
  },
  drag(p, st, o, e) {
    const dy = st.sy - e.clientY;
    D.Water.setSeaLevel(st.y0 + dy * Math.max(0.05, D.Cam.distance() * 0.0012));
    D.emit('opts:values');
    D.hint(`Sea level <b>${W.seaLevel.toFixed(1)} m</b>`, 0);
  },
  up() { D.hint(null); }
});

def('lake', { name: 'Lake', key: 'L', group: 'water', icon: 'lake', noBrush: true, cursor: 'crosshair',
  desc: 'Click inside a hollow and it fills with water right up to its rim, even high in the mountains. Shift+click a lake to drain it.',
  hint: '<b>Click</b> a basin to fill it · <b>Shift+click</b> to drain',
  down(p, st) {
    st.cancel = true;
    if (st.shift || st.alt) { const l = D.Water.lakeAt(p.x, p.z); if (l) { D.Water.removeLake(l); D.toast('Lake drained'); } else D.toast('No lake there.'); return; }
    D.Water.addLake(p.x, p.z);
  }
});

let riverLine = null;
def('river', { name: 'River', key: 'I', group: 'water', icon: 'river', noBrush: true, cursor: 'crosshair',
  desc: 'Draw a river point by point, or drop a spring and let the water find its own way downhill to the sea. Rivers carve their beds and tumble over cliffs as waterfalls.',
  defaults: { mode: 'spring', width: 24, depth: 3 },
  options: [{ id: 'mode', type: 'seg', choices: [['spring', 'Spring (auto)'], ['draw', 'Draw path']] },
    { id: 'width', label: 'Width', type: 'range', min: 6, max: 90, step: 1, fmt: v => v.toFixed(0) + ' m' },
    { id: 'depth', label: 'Depth', type: 'range', min: 1, max: 12, step: 0.5, fmt: v => v.toFixed(1) + ' m' }],
  hint: 'Spring: <b>click</b> high ground · Draw: <b>click</b> points, <b>double-click / Enter</b> to finish · <b>Shift+click</b> removes a river',
  down(p, st, o) {
    st.cancel = true;
    if (st.shift) { const rv = D.Water.riverNear(p.x, p.z, 30); if (rv) { D.Water.removeRiver(rv); D.toast('River removed'); } else D.toast('No river there.'); return; }
    if (o.mode === 'spring') { D.Water.autoRiver(p.x, p.z, { width: o.width, depth: o.depth }); return; }
    Tools.riverPts = Tools.riverPts || [];
    const pts = Tools.riverPts;
    const now = performance.now();
    if (pts.length && now - (Tools._lastClick || 0) < 320) { finishRiver(); return; }
    Tools._lastClick = now;
    pts.push([p.x, p.z]);
    updateRiverLine();
  },
  cancel() { Tools.riverPts = []; updateRiverLine(); },
  enter() { finishRiver(); },
  back() { if (Tools.riverPts && Tools.riverPts.length) { Tools.riverPts.pop(); updateRiverLine(); } },
  move() { if (Tools.riverPts && Tools.riverPts.length) updateRiverLine(); },
  leave() { Tools.riverPts = []; updateRiverLine(); }
});
function updateRiverLine() {
  const pts = (Tools.riverPts || []).slice();
  if (Tools.hit && pts.length) pts.push([Tools.hit.x, Tools.hit.z]);
  if (!riverLine) {
    riverLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fd4ff, depthTest: false, transparent: true }));
    riverLine.renderOrder = 20; riverLine.frustumCulled = false; D.scene.add(riverLine);
  }
  const sm = pts.length > 2 ? D.Water.smoothPath(pts) : pts;
  const arr = [];
  sm.forEach(([x, z]) => arr.push(x, D.Terrain.hAt(x, z) + 3, z));
  riverLine.geometry.dispose();
  riverLine.geometry = new THREE.BufferGeometry();
  riverLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  riverLine.visible = pts.length > 1;
}
function finishRiver() {
  const pts = Tools.riverPts || [];
  Tools.riverPts = [];
  updateRiverLine();
  if (pts.length < 2) return;
  const o = Tools.o('river');
  const r = D.Water.addRiver(D.Water.smoothPath(pts), { width: o.width * 0.8, widthEnd: o.width * 1.2, depth: o.depth, label: 'Draw River' });
  if (r) D.toast('River carved'); else D.toast('River too short.', 'warn');
}

// ================================================================================
// PAINT
// ================================================================================
const MATERIALS = [
  { id: 0, name: 'Lawn', col: '#6a9e3e' }, { id: 1, name: 'Dirt', col: '#7a5e40' }, { id: 2, name: 'Sand', col: '#dcc99a' }, { id: 3, name: 'Rock', col: '#7e7b76' },
  { id: 4, name: 'Snow', col: '#eef1f6' }, { id: 5, name: 'Farmland', col: '#b9a24e' }, { id: 6, name: 'Paving', col: '#b8b3aa' }, { id: 7, name: 'Wildflowers', col: '#d98fb0' },
  { id: -1, name: 'Eraser', col: 'transparent' }
];
Tools.MATERIALS = MATERIALS;
def('paint', { name: 'Ground Paint', key: 'P', group: 'paint', icon: 'brush', color: [1, 1, 1],
  desc: 'Paint lawn, dirt, sand, rock, snow, farm fields, plaza paving or wildflowers over the automatic ground colours.',
  defaults: { size: 120, strength: 0.6, hardness: 0.4, material: 5 },
  options: ['size', 'strength', 'hardness'],
  panel: 'materials',
  hint: '<b>Drag</b> to paint · <b>Shift</b> erases · pick materials in the panel',
  brushColor() { const m = MATERIALS.find(m => m.id === Tools.o('paint').material); if (!m || m.id < 0) return [1, 0.5, 0.4]; const c = new THREE.Color(m.col); return [c.r, c.g, c.b]; },
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    D.History.touch('paint', r[0], r[1], r[2], r[3]);
    const P = W.paint, ch = st.shift ? -1 : o.material;
    const amt = o.strength * dt * 4 * 255;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w) => {
      const a = amt * w, b = k * 8;
      if (ch < 0) { for (let c = 0; c < 8; c++) P[b + c] = Math.max(0, P[b + c] - a); return; }
      P[b + ch] = Math.min(255, P[b + ch] + a);
      for (let c = 0; c < 8; c++) if (c !== ch) P[b + c] = Math.max(0, P[b + c] - a * 0.8);
    });
    D.Terrain.markA(r[0], r[1], r[2], r[3]);
  }
});
const BIOMES = [{ id: 0, name: 'Temperate', col: '#5d9440' }, { id: 1, name: 'Alpine', col: '#8fa3a8' }, { id: 2, name: 'Desert', col: '#d9a860' }, { id: 3, name: 'Tropical', col: '#2fb06a' }];
Tools.BIOMES = BIOMES;
def('biome', { name: 'Biome Paint', key: 'J', group: 'paint', icon: 'biome', color: [0.5, 1, 0.6],
  desc: 'Change the climate of an area. Grass, beaches, cliffs, snowlines and forests all follow the biome.',
  defaults: { size: 800, strength: 0.5, hardness: 0.2, biome: 2 },
  options: ['size', 'strength', 'hardness', { id: 'biome', type: 'seg', choices: BIOMES.map(b => [b.id, b.name]) }],
  hint: '<b>Drag</b> to paint a climate',
  brushColor() { const c = new THREE.Color(BIOMES[Tools.o('biome').biome].col); return [c.r, c.g, c.b]; },
  apply(p, dt, st, o) {
    const r = rectFor(p.x, p.z, o.size);
    D.History.touch('biome', r[0], r[1], r[2], r[3]);
    const B = W.biome, ch = +o.biome;
    const amt = o.strength * dt * 3 * 255;
    eachV(r, p.x, p.z, o.size, o.hardness, (k, w) => {
      const b = k * 4;
      let v = [B[b], B[b + 1], B[b + 2], B[b + 3]];
      v[ch] = Math.min(255, v[ch] + amt * w);
      let others = 0; for (let c = 0; c < 4; c++) if (c !== ch) others += v[c];
      const room = 255 - v[ch];
      if (others > room && others > 0) { const f = room / others; for (let c = 0; c < 4; c++) if (c !== ch) v[c] *= f; }
      for (let c = 0; c < 4; c++) B[b + c] = Math.round(v[c]);
    });
    D.Terrain.markA(r[0], r[1], r[2], r[3]);
  }
});

// ================================================================================
// NATURE
// ================================================================================
def('forest', { name: 'Nature Brush', key: 'V', group: 'nature', icon: 'tree', color: [0.45, 0.95, 0.4],
  desc: 'Spray forests, bushes, rocks and flowers, or lay props like fences, hedges and street lamps in a line along your stroke.',
  defaults: { size: 160, strength: 0.6, hardness: 0.35, species: -1, density: 0.6, scaleVar: 0.5, mode: 'scatter', maxSlope: 42 },
  options: ['size', 'strength', 'hardness',
    { id: 'density', label: 'Density', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'scaleVar', label: 'Size mix', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'mode', type: 'seg', choices: [['scatter', 'Scatter'], ['line', 'Line'], ['erase', 'Erase']] }],
  panel: 'species',
  hint: '<b>Drag</b> to plant · <b>Shift</b> erases · Line mode lays fences, hedges and lamps along your stroke',
  brushColor(st) { return (Tools.o('forest').mode === 'erase' || (st && st.shift) || Tools.keyShift) ? [1, 0.5, 0.35] : [0.45, 0.95, 0.4]; },
  down(p, st, o) { st.rnd = D.rng(Date.now() & 0xffffff); st.lastLine = null; st.lineCarry = 0; },
  apply(p, dt, st, o) {
    const NS = D.Nature;
    const species = o.species;
    const cat = species === -2 ? 'bush' : species === -3 ? 'rock' : 'tree';
    const sp = species >= 0 ? species : -1;
    if (o.mode === 'erase' || st.shift) {
      const filter = species >= 0 ? (s => s === species) : null;
      NS.erase(p.x, p.z, o.size, o.hardness, Math.min(1, o.strength * dt * 5), filter, st.rnd);
      return;
    }
    if (o.mode === 'line') {
      const spec = sp >= 0 ? NS.SPECIES[sp] : null;
      const spacing = spec && spec.line ? spec.line : D.lerp(30, 6, o.density);
      if (!st.lastLine) { st.lastLine = { x: p.x, z: p.z }; placeLine(p.x, p.z, 0, st, o, sp, cat); return; }
      const dx = p.x - st.lastLine.x, dz = p.z - st.lastLine.z, L = Math.hypot(dx, dz);
      if (L < spacing) return;
      const ang = Math.atan2(dx, dz);
      const n = Math.floor(L / spacing);
      for (let k = 1; k <= n; k++) {
        const t = k * spacing / L;
        placeLine(st.lastLine.x + dx * t, st.lastLine.z + dz * t, ang, st, o, sp, cat);
      }
      st.lastLine = { x: st.lastLine.x + dx * n * spacing / L, z: st.lastLine.z + dz * n * spacing / L };
      return;
    }
    const spacing = D.lerp(42, 6.5, o.density);
    const area = Math.PI * o.size * o.size;
    const target = area / (spacing * spacing);
    const tries = Math.min(400, Math.ceil(target * o.strength * dt * 1.2) + 1);
    NS.scatter(p.x, p.z, o.size, o.hardness, tries, { species: sp, cat, spacing, scaleVar: o.scaleVar, maxSlope: o.maxSlope }, st.rnd);
  }
});
function placeLine(x, z, ang, st, o, sp, cat) {
  const NS = D.Nature;
  const s = sp >= 0 ? sp : NS.autoSpecies(x, z, st.rnd, cat);
  const spec = NS.SPECIES[s];
  let rot = ang + Math.PI / 2;
  if (spec.id === 'lantern' || spec.id === 'torchpost') rot = ang + (st.lineCarry++ % 2 ? Math.PI : 0);
  if (spec.cat === 'tree' || spec.cat === 'bush' || spec.cat === 'rock') rot = st.rnd() * Math.PI * 2;
  NS.place(x, z, s, rot, spec.noScale ? 1 : 0.85 + st.rnd() * o.scaleVar * 0.5, st.rnd);
}

// ================================================================================
// VIEW
// ================================================================================
def('walk', { name: 'Walk & Drive', key: '', group: 'view', icon: 'walk', noBrush: true, cursor: 'crosshair',
  desc: 'Click anywhere to drop in at street level. Walk around your world, or press C to jump in a car and drive.',
  defaults: { start: 'walk' },
  options: [{ id: 'start', type: 'seg', choices: [['walk', 'Walk'], ['drive', 'Drive']] }],
  hint: '<b>Click</b> the ground to drop in · Esc to come back',
  down(p, st, o) { st.cancel = true; if (o.start === 'drive') D.Cam.enterDrive(p.x, p.z); else D.Cam.enterWalk(p.x, p.z); }
});
def('photo', { name: 'Photo Mode', key: '', group: 'view', icon: 'camera', noBrush: true,
  desc: 'Hide the editor and take beautiful shots: filters, tilt-shift, depth of field, time of day, flyovers.',
  select() { if (D.UI) D.UI.enterPhoto(); return false; }
});

// ================================================================================
// SELECTION / CLIPBOARD
// ================================================================================
Tools.setSelection = function (s) {
  Tools.selection = s;
  if (s) D.TU.uSel.value.set(s.x0, s.z0, s.x1, s.z1); else D.TU.uSel.value.set(1, 1, 0, 0);
  D.emit('selection', s);
};
Tools.copy = function (cut) {
  const s = Tools.selection;
  if (!s) { D.toast('Select an area first (Marquee tool, M).', 'warn'); return; }
  const i0 = Math.max(0, Math.round(s.x0 / CELL)), j0 = Math.max(0, Math.round(s.z0 / CELL));
  const i1 = Math.min(N, Math.round(s.x1 / CELL)), j1 = Math.min(N, Math.round(s.z1 / CELL));
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const H = new Float32Array(w * h), P = new Uint8Array(w * h * 8), B = new Uint8Array(w * h * 4);
  let edge = 0, ec = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j0 + j) * VN + i0 + i, o = j * w + i;
    H[o] = W.h[k];
    for (let c = 0; c < 8; c++) P[o * 8 + c] = W.paint[k * 8 + c];
    for (let c = 0; c < 4; c++) B[o * 4 + c] = W.biome[k * 4 + c];
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1) { edge += W.h[k]; ec++; }
  }
  const base = edge / ec;
  const nature = [];
  D.Nature.forEachIn(i0 * CELL, j0 * CELL, i1 * CELL, j1 * CELL, (x, z, sp, sc, rot, seed) => nature.push([x - i0 * CELL, z - j0 * CELL, sp, sc, rot, seed]));
  const city = D.City && D.City.copyIn ? D.City.copyIn(i0 * CELL, j0 * CELL, i1 * CELL, j1 * CELL) : [];
  Tools.clipboard = { w, h, H, P, B, base, nature, city };
  D.toast(`Copied ${fmtM((w - 1) * CELL)} × ${fmtM((h - 1) * CELL)}${nature.length ? ` · ${nature.length} plants` : ''}${city.length ? ` · ${city.length} buildings` : ''}`);
  if (cut) Tools.clearSelection();
};
Tools.clearSelection = function () {
  const s = Tools.selection; if (!s) return;
  D.History.begin('Clear Selection', 'trash');
  const n = D.Nature.clearWhere(s.x0, s.z0, s.x1, s.z1, () => true);
  const b = D.City && D.City.clearRect ? D.City.clearRect(s.x0, s.z0, s.x1, s.z1) : 0;
  D.History.end();
  D.toast(`Cleared ${n} plants${b ? ` and ${b} buildings` : ''}`);
};
Tools.flattenSelection = function () {
  const s = Tools.selection; if (!s) { D.toast('Select an area first.', 'warn'); return; }
  const i0 = Math.round(s.x0 / CELL), j0 = Math.round(s.z0 / CELL), i1 = Math.round(s.x1 / CELL), j1 = Math.round(s.z1 / CELL);
  let sum = 0, c = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { sum += W.h[j * VN + i]; c++; }
  const t = sum / c;
  D.History.begin('Flatten Selection', 'flatten');
  D.History.touch('h', i0, j0, i1, j1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) W.h[j * VN + i] = t;
  D.Terrain.markH(i0, j0, i1, j1);
  D.History.end();
  D.emit('stroke:end');
};
// Edit ▸ Weather peaks: needle peaks and blade ridges slump into buttressed ridges and scree slopes
// (thermal weathering over the selection, or the whole map). Gentle ground is untouched. Undoable.
Tools.weatherPeaks = function () {
  const s = Tools.selection;
  const r = s ? [Math.max(1, Math.floor(s.x0 / CELL)), Math.max(1, Math.floor(s.z0 / CELL)), Math.min(N - 1, Math.ceil(s.x1 / CELL)), Math.min(N - 1, Math.ceil(s.z1 / CELL))] : [1, 1, N - 1, N - 1];
  D.toast('Weathering the peaks…', '', 1500);
  setTimeout(() => {
    D.History.begin('Weather Peaks', 'erode');
    D.History.touch('h', r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1);
    D.Gen.thermalSync(W.h, 24, W.seed || 1, 0.95, 1.5, r);
    D.Terrain.markH(r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1);
    D.History.end();
    D.emit('stroke:end');
    D.toast('Peaks weathered. Ctrl+Z to undo.', '', 2500);
  }, 30);
};
Tools.startPaste = function () {
  if (!Tools.clipboard) { D.toast('Nothing copied yet. Select an area and press Ctrl+C.', 'warn'); return; }
  Tools.select('select');
  Tools.paste = { rot: 0 };
  buildGhost();
  D.hint('<b>Click</b> to paste · <b>,</b> and <b>.</b> rotate 90° · <b>Esc</b> cancels', 0);
};
Tools.cancelPaste = function () {
  Tools.paste = null;
  if (Tools.ghost) { D.scene.remove(Tools.ghost); Tools.ghost.geometry.dispose(); Tools.ghost = null; }
  D.hint(null);
};
function clipDims(rot) { const c = Tools.clipboard; return rot % 2 ? [c.h, c.w] : [c.w, c.h]; }
// map destination local cell (i,j) to source index for rotation rot (0..3)
function srcIndex(i, j, rot) {
  const c = Tools.clipboard;
  let si, sj;
  switch (rot & 3) {
    case 0: si = i; sj = j; break;
    case 1: si = j; sj = c.h - 1 - i; break;
    case 2: si = c.w - 1 - i; sj = c.h - 1 - j; break;
    default: si = c.w - 1 - j; sj = i;
  }
  return sj * c.w + si;
}
function buildGhost() {
  if (Tools.ghost) { D.scene.remove(Tools.ghost); Tools.ghost.geometry.dispose(); }
  const c = Tools.clipboard, rot = Tools.paste.rot;
  const [w, h] = clipDims(rot);
  const step = Math.max(1, Math.ceil(Math.max(w, h) / 90));
  const pos = [], idx = [];
  const cols = Math.floor((w - 1) / step) + 1, rows = Math.floor((h - 1) / step) + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const si = Math.min(w - 1, i * step), sj = Math.min(h - 1, j * step);
    pos.push(si * CELL, c.H[srcIndex(si, sj, rot)] - c.base, sj * CELL);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i; idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x31a8ff, wireframe: true, transparent: true, opacity: 0.55, depthTest: false }));
  m.renderOrder = 30; m.frustumCulled = false;
  D.scene.add(m);
  Tools.ghost = m;
}
function pasteOrigin(p) {
  const [w, h] = clipDims(Tools.paste.rot);
  return [D.clamp(Math.round(p.x / CELL - (w - 1) / 2), 0, N - (w - 1)), D.clamp(Math.round(p.z / CELL - (h - 1) / 2), 0, N - (h - 1))];
}
function commitPaste(p) {
  const c = Tools.clipboard, rot = Tools.paste.rot, o = Tools.o('select');
  const [w, h] = clipDims(rot);
  const [oi, oj] = pasteOrigin(p);
  let edge = 0, ec = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i === 0 || j === 0 || i === w - 1 || j === h - 1) { edge += W.h[(oj + j) * VN + oi + i]; ec++; }
  const base = edge / ec;
  D.History.begin('Paste', 'paste');
  const r = [oi, oj, oi + w - 1, oj + h - 1];
  const fe = o.feather;
  if (o.incTerrain) D.History.touch('h', ...r);
  if (o.incPaint) { D.History.touch('paint', ...r); D.History.touch('biome', ...r); }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (oj + j) * VN + oi + i, s = srcIndex(i, j, rot);
    const ed = Math.min(i, j, w - 1 - i, h - 1 - j);
    const f = fe > 0 ? D.smooth(0, fe, ed) : 1;
    if (o.incTerrain) {
      const rel = c.H[s] - c.base;
      let t = o.hmode === 'absolute' ? c.H[s] : base + rel;
      if (o.hmode === 'max') t = Math.max(W.h[k], t);
      W.h[k] += (t - W.h[k]) * f;
    }
    if (o.incPaint) {
      for (let q = 0; q < 8; q++) W.paint[k * 8 + q] = Math.round(D.lerp(W.paint[k * 8 + q], c.P[s * 8 + q], f));
      for (let q = 0; q < 4; q++) W.biome[k * 4 + q] = Math.round(D.lerp(W.biome[k * 4 + q], c.B[s * 4 + q], f));
    }
  }
  if (o.incTerrain) D.Terrain.markH(...r);
  if (o.incPaint) D.Terrain.markA(...r);
  const xform = (x, z) => {
    const ww = (c.w - 1) * CELL, hh = (c.h - 1) * CELL;
    let nx, nz;
    switch (rot & 3) { case 0: nx = x; nz = z; break; case 1: nx = hh - z; nz = x; break; case 2: nx = ww - x; nz = hh - z; break; default: nx = z; nz = ww - x; }
    return [oi * CELL + nx, oj * CELL + nz];
  };
  if (o.incNature) {
    D.Nature.clearWhere(oi * CELL, oj * CELL, (oi + w - 1) * CELL, (oj + h - 1) * CELL, () => true);
    const rnd = D.rng(7);
    c.nature.forEach(([x, z, sp, sc, r0, seed]) => { const [nx, nz] = xform(x, z); D.Nature.place(nx, nz, sp, r0 + rot * Math.PI / 2, sc, () => seed); });
  }
  if (o.incCity && c.city.length && D.City && D.City.pasteList) D.City.pasteList(c.city, xform, rot);
  D.History.end();
  D.emit('stroke:end');
  D.toast('Pasted');
}

// ================================================================================
// INPUT
// ================================================================================
Tools.keyShift = false;
Tools.init = function (canvas) {
  Tools.canvas = canvas;
  // external tool definitions (roads, city)
  D.toolDefs.forEach(d => def(d.id, d));
  // sort tools into strip order
  const groups = ['nav', 'terrain', 'water', 'paint', 'nature', 'city', 'view'];
  Tools.order.sort((a, b) => groups.indexOf(Tools.defs[a].group) - groups.indexOf(Tools.defs[b].group) || (Tools.defs[a].sort || 0) - (Tools.defs[b].sort || 0));
  Tools.select('raise');

  let drag = null; // {kind:'orbit'|'pan'|'tool', x, y}
  const rayFrom = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    const nx = ((cx - r.left) / r.width) * 2 - 1, ny = -((cy - r.top) / r.height) * 2 + 1;
    const cam = D.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(o).normalize();
    return { o, d };
  };
  Tools.rayFrom = rayFrom;
  const pick = (cx, cy) => {
    const { o, d } = rayFrom(cx, cy);
    return D.Terrain.raycast(o, d);
  };
  Tools.pick = pick;
  // like pick, but also finds points beyond the map edge (outer ring / sea) so tools can explain the border
  const pickAny = (cx, cy) => { const { o, d } = rayFrom(cx, cy); return D.Terrain.raycastAny ? D.Terrain.raycastAny(o, d) : null; };
  Tools.pickAny = pickAny;
  // an outside point is still usable as a brush centre when the brush reaches back into the map
  Tools.overhang = (ah, o) => (ah && ah.outside && o && o.size !== undefined && ah.dOut < o.size * 0.9)
    ? { x: ah.x, z: ah.z, y: D.Terrain.hAt(D.clamp(ah.x, 0, SIZE), D.clamp(ah.z, 0, SIZE)), outside: true } : null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (D.Cam.mode !== 'orbit' || D.Cam.flyT >= 0) {
      if (D.Cam.mode !== 'orbit' && !document.pointerLockElement) { try { canvas.requestPointerLock(); } catch (er) { } }
      return;
    }
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    Tools.mouse.x = e.clientX; Tools.mouse.y = e.clientY;
    const def = Tools.defs[Tools.cur];
    if (e.button === 2) { drag = { kind: 'orbit', x: e.clientX, y: e.clientY }; return; }
    if (e.button === 1 || (e.button === 0 && (Tools.space || Tools.cur === 'hand'))) {
      const hit = pick(e.clientX, e.clientY);
      drag = { kind: 'pan', y0: hit ? hit.y : D.Cam.target.y, px: e.clientX, py: e.clientY };
      D.Cam.dragging = true;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    let hit = pick(e.clientX, e.clientY);
    if (D.UI && D.UI.photo) { // photo mode: click sets focus
      if (hit && D.Post.p.dofOn) { D.Post.p.dofFocus = D.camera.position.distanceTo(new THREE.Vector3(hit.x, hit.y, hit.z)); D.emit('post'); D.toast('Focus set'); }
      return;
    }
    if (!hit && !def.noHit && def.id !== 'sea') {
      const ah = pickAny(e.clientX, e.clientY);
      const oh = def.apply ? Tools.overhang(ah, Tools.o()) : null;
      if (oh) hit = oh;
      else { if (ah && D.Terrain.edgeRefuse) D.Terrain.edgeRefuse(ah.x, ah.z); return; }
    }
    const layer = def.layer;
    if (layer && D.Layers && D.Layers.locked(layer)) { D.toast(`The ${layer} layer is locked.`, 'warn'); return; }
    const st = Tools.stroke = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, last: hit ? { x: hit.x, z: hit.z } : null, start: hit, rect: null, t: 0 };
    drag = { kind: 'tool' };
    const o = Tools.o();
    if (def.apply || def.historyStroke) D.History.begin(def.name, def.icon);
    if (def.down) def.down(hit, st, o, e);
    if (st.cancel) { drag = null; Tools.stroke = null; if (D.History.active() && (def.apply || def.historyStroke)) D.History.end(); return; }
    if (def.apply && hit) def.apply(hit, 1 / 60, st, o);
  });
  canvas.addEventListener('pointermove', e => {
    Tools.mouse.x = e.clientX; Tools.mouse.y = e.clientY; Tools.mouse.in = true;
    if (D.Cam.mode !== 'orbit') return;
    if (drag && drag.kind === 'orbit') {
      D.Cam.orbitBy(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
      return;
    }
    if (drag && drag.kind === 'pan') {
      // grab-pan: move the ground by exactly what passed under the cursor
      const a = rayFrom(drag.px, drag.py), b = rayFrom(e.clientX, e.clientY);
      const pa = D.Terrain.rayPlane(a.o, a.d, drag.y0), pb = D.Terrain.rayPlane(b.o, b.d, drag.y0);
      if (pa && pb) D.Cam.panBy(pa.x - pb.x, pa.z - pb.z);
      drag.px = e.clientX; drag.py = e.clientY;
      return;
    }
    Tools.hitDirty = true;
    const def = Tools.defs[Tools.cur];
    if (drag && drag.kind === 'tool' && def.drag) {
      const hit = pick(e.clientX, e.clientY);
      if (hit || def.id === 'sea') def.drag(hit, Tools.stroke, Tools.o(), e);
    }
  });
  const end = e => {
    if (!drag) return;
    const k = drag.kind; drag = null;
    D.Cam.dragging = false;
    canvas.style.cursor = cursorFor();
    if (k !== 'tool') return;
    const def = Tools.defs[Tools.cur], st = Tools.stroke;
    if (def.up) def.up(Tools.hit, st, Tools.o(), e);
    Tools.stroke = null;
    if (D.History.active()) D.History.end();
    D.emit('stroke:end', st && st.rect);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { Tools.mouse.in = false; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (D.Cam.mode !== 'orbit' || D.Cam.flyT >= 0) return;
    const def = Tools.defs[Tools.cur];
    if ((e.ctrlKey || e.altKey) && Tools.o().size !== undefined) {
      const o = Tools.o(); o.size = D.clamp(o.size * Math.pow(1.0015, -e.deltaY), 8, 2500); D.emit('opts:values'); return;
    }
    if (e.shiftKey && Tools.cur === 'stamp') { const o = Tools.o(); o.rot = (o.rot + (e.deltaY > 0 ? 15 : -15) + 360) % 360; o.randRot = false; D.emit('opts:values'); return; }
    if (e.shiftKey && Tools.cur === 'building') { const o = Tools.o(); o.rot = (o.rot + (e.deltaY > 0 ? 15 : -15) + 360) % 360; D.emit('opts:values'); if (Tools.hit) def.move(Tools.hit); return; }
    let dy = e.deltaY; if (e.deltaMode === 1) dy *= 40;
    const hit = pick(e.clientX, e.clientY);
    D.Cam.zoomAt(dy, hit);
  }, { passive: false });

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { Tools.space = false; canvas.style.cursor = cursorFor(); }
    if (e.key === 'Shift') Tools.keyShift = false;
    if (e.key === 'Alt') e.preventDefault();
  });
};

function cursorFor() {
  if (Tools.space) return 'grab';
  const d = Tools.defs[Tools.cur];
  return d && d.cursor ? d.cursor : (d && !d.noBrush ? 'none' : 'default');
}
Tools.cursorFor = cursorFor;

Tools.select = function (id) {
  const d = Tools.defs[id]; if (!d) return;
  if (d.select && d.select() === false) return;
  const prev = Tools.defs[Tools.cur];
  if (prev && prev !== d && prev.leave) prev.leave();
  if (Tools.paste && id !== 'select') Tools.cancelPaste();
  Tools.cur = id;
  if (d.enterTool) d.enterTool();
  if (Tools.canvas) Tools.canvas.style.cursor = cursorFor();
  D.TU.uZoneOn.value = d.zoneOverlay || (D.Layers && D.Layers.visible('zones') ? 1 : 0);
  D.emit('tool', id);
  if (d.hint) D.hint(d.hint, 4000);
};

function onKey(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) { if (e.key === 'Escape') t.blur(); return; }
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Shift') Tools.keyShift = true;
  if (e.key === 'Alt') { e.preventDefault(); return; }
  // street modes
  if (D.Cam.mode === 'walk' || D.Cam.mode === 'drive') {
    if (e.code === 'KeyC') D.Cam.toggleWalkDrive();
    if (e.code === 'Escape') D.Cam.exitStreet();
    return;
  }
  if (D.Cam.flyT >= 0) { if (e.code === 'Escape' || e.code === 'Space') D.Cam.stopFly(); return; }
  if (D.UI && D.UI.photo) {
    if (e.code === 'Escape') D.UI.exitPhoto();
    if (e.code === 'KeyH' && !ctrl) D.UI.togglePhotoPanel();
    return;
  }
  if (e.code === 'Space') { Tools.space = true; if (Tools.canvas) Tools.canvas.style.cursor = 'grab'; if (e.target === document.body || e.target === Tools.canvas) e.preventDefault(); return; }
  const def = Tools.defs[Tools.cur], o = Tools.o();
  if (ctrl) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); D.History.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); D.History.redo(); }
    else if (k === 'c') { e.preventDefault(); Tools.copy(false); }
    else if (k === 'x') { e.preventDefault(); Tools.copy(true); }
    else if (k === 'v') { e.preventDefault(); Tools.startPaste(); }
    else if (k === 'd') { e.preventDefault(); Tools.setSelection(null); }
    else if (k === 's') { e.preventDefault(); if (D.Save) D.Save.saveNow(true); }
    else if (k === 'a') { e.preventDefault(); Tools.select('select'); Tools.setSelection({ x0: 0, z0: 0, x1: SIZE, z1: SIZE }); }
    return;
  }
  switch (e.key) {
    case '[': case '{':
      if (e.shiftKey && o.hardness !== undefined) o.hardness = D.clamp(o.hardness - 0.1, 0, 1);
      else if (o.size !== undefined) o.size = Math.max(8, o.size / 1.2);
      D.emit('opts:values'); return;
    case ']': case '}':
      if (e.shiftKey && o.hardness !== undefined) o.hardness = D.clamp(o.hardness + 0.1, 0, 1);
      else if (o.size !== undefined) o.size = Math.min(2500, o.size * 1.2);
      D.emit('opts:values'); return;
    case ',': case '<': if (Tools.paste) { Tools.paste.rot = (Tools.paste.rot + 3) & 3; buildGhost(); } return;
    case '.': case '>': if (Tools.paste) { Tools.paste.rot = (Tools.paste.rot + 1) & 3; buildGhost(); } return;
    case 'Escape':
      if (Tools.paste) { Tools.cancelPaste(); return; }
      if (def.cancel) { def.cancel(); return; }
      if (Tools.selection) { Tools.setSelection(null); return; }
      return;
    case 'Enter': if (def.enter) def.enter(); return;
    case 'Backspace': if (def.back) { e.preventDefault(); def.back(); } return;
    case 'Delete': if (Tools.selection) Tools.clearSelection(); else if (def.del) def.del(); return;
    case 'Tab': e.preventDefault(); if (D.UI) D.UI.togglePanels(); return;
    case 'Home': D.Cam.overview(); return;
    case 'F1': case '?': e.preventDefault(); if (D.UI) D.UI.help(); return;
  }
  if (/^[0-9]$/.test(e.key) && o.strength !== undefined) {
    o.strength = e.key === '0' ? 1 : +e.key / 10; D.emit('opts:values'); D.hint(`Strength ${Math.round(o.strength * 100)}%`, 1200); return;
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) return; // camera keys
  const key = ((e.shiftKey ? 'shift+' : '') + e.key).toUpperCase();
  for (const id of Tools.order) {
    const d = Tools.defs[id];
    if (d.key && d.key.toUpperCase() === key) { Tools.select(id); return; }
  }
}

// ---- per-frame --------------------------------------------------------------------
let hitTimer = 0;
Tools.update = function (dt) {
  if (D.Cam.mode !== 'orbit') { D.TU.uBrushOn.value.x = 0; return; }
  hitTimer -= dt;
  const st = Tools.stroke;
  // re-pick every frame while painting (terrain moves under the brush), otherwise on mouse move
  if ((Tools.hitDirty || st || hitTimer <= 0) && Tools.mouse.in) {
    Tools.hit = Tools.pick(Tools.mouse.x, Tools.mouse.y);
    Tools.hitAny = Tools.hit || Tools.pickAny(Tools.mouse.x, Tools.mouse.y);
    Tools.hitDirty = false; hitTimer = 0.1;
    const def = Tools.defs[Tools.cur];
    if (def.move) def.move(Tools.hit);
    D.emit('hover', Tools.hit);
  }
  const def = Tools.defs[Tools.cur], o = Tools.o();
  // the brush may hang over the border (its centre outside) as long as it reaches back in
  const hit = Tools.hit || Tools.overhang(Tools.hitAny, o);
  // brush cursor
  const U = D.TU;
  if (hit && Tools.mouse.in && !def.noBrush && o.size !== undefined && !Tools.space && !(D.UI && D.UI.photo)) {
    const c = def.brushColor ? def.brushColor(st) : (def.color || [0.4, 0.8, 1]);
    U.uBrushOn.value.set(1, c[0], c[1], c[2]);
    U.uBrush.value.set(hit.x, hit.z, def.id === 'ramp' ? o.size / 2 : o.size, o.hardness !== undefined ? o.hardness : 1);
    if (def.id === 'stamp') {
      const a = o.rot * Math.PI / 180;
      if (!o.randRot) { U.uLine.value.set(hit.x, hit.z, hit.x + Math.cos(a) * o.size, hit.z + Math.sin(a) * o.size); U.uLineOn.value.set(1, Math.max(4, o.size * 0.02), 0, 0); }
      else U.uLineOn.value.x = 0;
    }
  } else if (!def.ownCursor) U.uBrushOn.value.x = 0;
  // paste ghost follows the cursor
  if (Tools.paste && Tools.ghost && hit) {
    const [oi, oj] = pasteOrigin(hit);
    let edge = 0, ec = 0;
    const [w, h] = clipDims(Tools.paste.rot);
    for (let k = 0; k < w; k += Math.max(1, w >> 4)) { edge += W.h[oj * VN + oi + k] + W.h[(oj + h - 1) * VN + oi + k]; ec += 2; }
    Tools.ghost.position.set(oi * CELL, edge / ec + 2, oj * CELL);
  }
  // continuous brush application with spacing
  if (st && def.apply && hit) {
    const last = st.last || hit;
    const d = Math.hypot(hit.x - last.x, hit.z - last.z);
    const spacing = Math.max(4, (o.size || 50) * 0.22);
    const steps = Math.min(12, Math.max(1, Math.ceil(d / spacing)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const p = { x: last.x + (hit.x - last.x) * t, z: last.z + (hit.z - last.z) * t };
      p.y = D.Terrain.hAt(p.x, p.z);
      def.apply(p, dt / steps, st, o);
    }
    st.last = { x: hit.x, z: hit.z };
  }
};

// HUD for walk/drive
D.hud = function (html) {
  let el = document.getElementById('walkhud');
  if (!html) { if (el) el.remove(); const c = document.getElementById('crosshair'); if (c) c.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'walkhud'; document.body.appendChild(el);
    const c = document.createElement('div'); c.id = 'crosshair'; document.body.appendChild(c);
  }
  if (el._h !== html) { el.innerHTML = html; el._h = html; }
};
})();
