/* Diorama — procedural world generation (landscape styles + hydraulic erosion). */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE } = D;

const STYLES = [
  { id: 'continental', name: 'Coast & Mountains', icon: '⛰', clim: 0, desc: 'A coastline with a mountain range rising inland. The classic region.' },
  { id: 'island', name: 'Island', icon: '🏝', clim: 3, desc: 'One big island ringed by deep ocean, with a ridge down its spine.' },
  { id: 'archipelago', name: 'Archipelago', icon: '🌊', clim: 3, desc: 'A scatter of islands and channels. Lots of coastline to play with.' },
  { id: 'alpine', name: 'Alpine Valleys', icon: '🏔', clim: 1, desc: 'Towering ridges and deep glacial valleys. No sea, all drama.' },
  { id: 'plains', name: 'Rolling Plains', icon: '🌾', clim: 0, desc: 'Gentle farmland hills running down to a coast. Easy city building.' },
  { id: 'mesas', name: 'Desert Mesas', icon: '🏜', clim: 2, desc: 'Stepped plateaus split by canyons. Red rock country.' },
  { id: 'volcanic', name: 'Volcanic Isle', icon: '🌋', clim: 3, desc: 'A great cone with a crater, lava ridges and a lagoon shelf.' },
  { id: 'flat', name: 'Blank Canvas', icon: '▭', clim: 0, desc: 'Flat ground just above the sea. A clean document to sculpt from scratch.' }
];
const Gen = D.Gen = { STYLES };

function heightFn(style, seed) {
  const nA = D.makeNoise(seed), nB = D.makeNoise(seed + 101), nC = D.makeNoise(seed + 202);
  const r = D.rng(seed * 3 + 7);
  const warp = (u, v, amt, f) => [u + amt * nB.fbm(u * f, v * f, 3), v + amt * nC.fbm(u * f + 5.2, v * f + 1.3, 3)];
  const ang = r() * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
  switch (style) {
    case 'island': return (u, v) => {
      const [wu, wv] = warp(u, v, 0.14, 2);
      const d = Math.hypot(wu - 0.5, wv - 0.5) / 0.42;
      const m = 1 - d + nA.fbm(u * 3, v * 3, 5) * 0.42;
      if (m < 0) return m * 380 - 4;
      const rid = nA.ridged(wu * 4, wv * 4, 5);
      return m * 110 + rid * rid * Math.min(1, m * 2) * 720 + nB.fbm(u * 10, v * 10, 3) * 18 * Math.min(1, m * 4) + 1.5;
    };
    case 'archipelago': return (u, v) => {
      const [wu, wv] = warp(u, v, 0.1, 3);
      const edge = D.smooth(0.0, 0.14, Math.min(u, v, 1 - u, 1 - v));
      let m = nA.fbm(wu * 4.5, wv * 4.5, 5) + nB.fbm(wu * 11, wv * 11, 3) * 0.15 - 0.1;
      m = m * edge - (1 - edge) * 0.3;
      if (m < 0) return m * 320 - 3;
      const rid = nA.ridged(wu * 6, wv * 6, 4);
      return m * 240 + rid * rid * Math.min(1, m * 3) * 480 + 1.5;
    };
    case 'alpine': return (u, v) => {
      const [wu, wv] = warp(u, v, 0.08, 2);
      const rid = nA.ridged(wu * 2.6, wv * 2.6, 7, 2.1, 0.5);
      const big = nB.fbm(u * 1.2, v * 1.2, 3) * 0.5 + 0.5;
      return 70 + big * 200 + Math.pow(rid, 1.8) * 1500 * (0.55 + big * 0.6) + nC.fbm(u * 14, v * 14, 3) * 14;
    };
    case 'plains': return (u, v) => {
      const g = (u - 0.5) * dx + (v - 0.5) * dy + nC.fbm(u * 3, v * 3, 3) * 0.06;
      let h = 24 + nA.fbm(u * 2.4, v * 2.4, 4) * 40 + nB.fbm(u * 9, v * 9, 3) * 9;
      h += Math.pow(Math.max(0, nA.ridged(u * 2, v * 2, 3) - 0.5), 2) * 420;
      const t = D.smooth(0.27, 0.42, g);
      return D.lerp(h, -45, t);
    };
    case 'mesas': return (u, v) => {
      const [wu, wv] = warp(u, v, 0.1, 2.5);
      const b = nA.fbm(wu * 3, wv * 3, 5) * 0.5 + 0.5;
      const steps = 5, s = b * steps, fl = Math.floor(s), fr = s - fl;
      const terr = (fl + D.smooth(0.7, 0.93, fr)) / steps;
      let h = 40 + terr * 440;
      const can = nB.ridged(wu * 2.4 + 3, wv * 2.4 + 7, 4);
      h -= Math.pow(D.smooth(0.74, 0.985, can), 1.4) * 280;
      h += nC.fbm(u * 16, v * 16, 3) * 6;
      return Math.max(h, 6 + nC.fbm(u * 5, v * 5, 2) * 4);
    };
    case 'volcanic': {
      const cx = 0.5 + (r() - 0.5) * 0.1, cy = 0.5 + (r() - 0.5) * 0.1;
      return (u, v) => {
        const [wu, wv] = warp(u, v, 0.05, 3);
        const d = Math.hypot(wu - cx, wv - cy);
        const m = (1 - d / 0.40) + nB.fbm(wu * 4, wv * 4, 4) * 0.33;
        if (m <= 0) return m * 420 - 2;
        const a = Math.atan2(wv - cy, wu - cx);
        const cone = Math.pow(Math.max(0, 1 - d / 0.34), 1.7);
        const crater = D.smooth(0.055, 0.025, d);
        const rid = nA.ridged(Math.cos(a) * 2.2 + d * 7, Math.sin(a) * 2.2 + d * 7, 4);
        return m * 55 + cone * 1300 - crater * 260 + rid * cone * 150 + nC.fbm(u * 12, v * 12, 3) * 10 * Math.min(1, m * 5) + 1;
      };
    }
    case 'flat': return () => 14;
    default: return (u, v) => { // continental
      const [wu, wv] = warp(u, v, 0.12, 1.5);
      const g = (wu - 0.5) * dx + (wv - 0.5) * dy;
      const land = nA.fbm(wu * 2.2, wv * 2.2, 5) * 0.55 - g * 1.1 + 0.16;
      if (land < 0) return land * 440 - 1;
      const inland = D.smooth(0.05, 0.55, land);
      const rid = nA.ridged(wu * 3.2 + 10, wv * 3.2 + 10, 6);
      return land * 150 + inland * Math.pow(rid, 2.2) * 1350 + nB.fbm(u * 9, v * 9, 4) * 32 * inland + 2;
    };
  }
}

function climateFor(opts) {
  if (opts.climate === 'auto' || opts.climate === undefined) return STYLES.find(s => s.id === opts.style).clim;
  return opts.climate;
}

// ---- Quick low-res preview for the New World dialog ---------------------
Gen.preview = function (opts, canvas) {
  const S = 128;
  const f = heightFn(opts.style, opts.seed);
  const H = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) H[j * S + i] = f(i / (S - 1), j / (S - 1));
  const clim = climateFor(opts);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const pal = [
    { g: [96, 146, 62], hi: [140, 140, 100], r: [120, 115, 108], s: [240, 242, 246], b: [216, 202, 156] },
    { g: [88, 132, 76], hi: [120, 128, 100], r: [132, 134, 140], s: [240, 242, 246], b: [160, 158, 150] },
    { g: [222, 186, 124], hi: [200, 150, 96], r: [176, 100, 62], s: [240, 242, 246], b: [228, 204, 152] },
    { g: [70, 148, 56], hi: [90, 150, 66], r: [80, 74, 70], s: [240, 242, 246], b: [242, 232, 200] }
  ];
  const snowAt = [950, 600, 1700, 3200];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const h = H[j * S + i];
    const hx = H[j * S + Math.min(S - 1, i + 1)] - H[j * S + Math.max(0, i - 1)];
    const hz = H[Math.min(S - 1, j + 1) * S + i] - H[Math.max(0, j - 1) * S + i];
    const shade = D.clamp(1 - (hx * 0.7 + hz * 0.5) / 260, 0.55, 1.35);
    let c;
    const ci = clim === 'mixed' ? (h > 500 ? 1 : 0) : clim;
    const p = pal[ci];
    if (h < 0) { const k = D.clamp(-h / 250, 0, 1); c = [D.lerp(70, 18, k), D.lerp(170, 60, k), D.lerp(190, 110, k)]; }
    else if (h < 3) c = p.b;
    else {
      const slope = Math.hypot(hx, hz) / (2 * SIZE / S);
      c = h > snowAt[ci] ? p.s : slope > 0.45 ? p.r : h > 500 ? p.hi : p.g;
      c = c.map(v => v * shade);
    }
    const o = (j * S + i) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = S; tmp.height = S;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
};

// ---- Full generation -----------------------------------------------------
const tick = () => new Promise(r => setTimeout(r, 0));

Gen.generate = async function (opts, progress) {
  const W = D.W;
  progress = progress || (() => {});
  const seed = opts.seed >>> 0;
  W.seed = seed; W.style = opts.style; W.seaLevel = 0;
  const clim = climateFor(opts);
  W.climate = clim === 'mixed' ? 0 : clim;
  const f = heightFn(opts.style, seed);
  const h = W.h;
  progress('Shaping the land', 0.02);
  await tick();
  for (let j = 0; j < VN; j++) {
    const v = j / N;
    for (let i = 0; i < VN; i++) h[j * VN + i] = f(i / N, v);
    if ((j & 63) === 0) { progress('Shaping the land', 0.02 + 0.2 * j / VN); await tick(); }
  }
  if (opts.erosion && opts.style !== 'flat') {
    await Gen.erode(h, opts.style === 'mesas' ? 70000 : 150000, seed, (p) => progress('Eroding valleys', 0.22 + p * 0.45));
  }
  progress('Laying down biomes', 0.68); await tick();
  Gen.fillBiomes(clim, seed);
  W.paint.fill(0);
  W.forest.fill(0);
  W.water.fill(-1e9);
  D.History.clear();
  D.emit('world:reset');
  D.Terrain.recalcRange();
  if (opts.rivers && opts.style !== 'flat' && D.Water) {
    progress('Carving rivers', 0.74); await tick();
    D.Water.generateRivers(seed, opts.style);
  }
  if (opts.forests && opts.style !== 'flat' && D.Nature) {
    progress('Growing forests', 0.84); await tick();
    D.Nature.populate(seed);
  }
  progress('Building meshes', 0.95); await tick();
  D.Terrain.rebuildAll();
  D.emit('world:generated');
  progress('Done', 1);
};

Gen.fillBiomes = function (clim, seed) {
  const W = D.W, B = W.biome, h = W.h;
  B.fill(0);
  if (clim !== 'mixed') {
    for (let v = 0; v < D.V; v++) B[v * 4 + clim] = 255;
    return;
  }
  const nT = D.makeNoise(seed + 55), nW = D.makeNoise(seed + 77);
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    const u = i / N, v = j / N, k = j * VN + i;
    const temp = nT.fbm(u * 1.6, v * 1.6, 4), wet = nW.fbm(u * 1.6 + 9, v * 1.6, 4);
    const alt = h[k];
    let wa = D.smooth(380, 760, alt) + D.smooth(0.25, 0.55, -temp) * 0.7;
    let wd = D.smooth(0.12, 0.4, temp) * D.smooth(0.05, 0.35, -wet);
    let wt = D.smooth(0.15, 0.45, temp) * D.smooth(0.0, 0.3, wet) * (1 - D.smooth(150, 350, alt));
    let we = Math.max(0.05, 1 - wa - wd - wt);
    const s = wa + wd + wt + we;
    B[k * 4] = we / s * 255; B[k * 4 + 1] = wa / s * 255; B[k * 4 + 2] = wd / s * 255; B[k * 4 + 3] = wt / s * 255;
  }
};

// ---- Particle hydraulic erosion (after Hans Beyer / Sebastian Lague) ----------
// Works on heights measured in "cells" so slopes are dimensionless.
const EB = (() => {
  const R = 3, offs = [], wts = [];
  let wsum = 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= R) { offs.push(dx, dz); const w = 1 - d / R; wts.push(w); wsum += w; }
  }
  for (let k = 0; k < wts.length; k++) wts[k] /= wsum;
  return { offs, wts };
})();

// Run `drops` droplets inside region [x0,z0,x1,z1] (cell coords). Returns touched rect.
Gen.erodeSync = function (h, drops, rnd, region, strength) {
  const { offs, wts } = EB;
  const inertia = 0.05, capF = 3.5 * (strength || 1), minCap = 0.01, erodeS = 0.3, depS = 0.3, evap = 0.012, grav = 4, life = 40;
  const S = 1 / CELL;
  const x0 = Math.max(1, region[0]), z0 = Math.max(1, region[1]);
  const x1 = Math.min(N - 2, region[2]), z1 = Math.min(N - 2, region[3]);
  const lim = region[4] || 0; // optional wander limit beyond region
  const bx0 = Math.max(1, x0 - lim), bz0 = Math.max(1, z0 - lim), bx1 = Math.min(N - 2, x1 + lim), bz1 = Math.min(N - 2, z1 + lim);
  for (let n = 0; n < drops; n++) {
    let px = x0 + rnd() * (x1 - x0), pz = z0 + rnd() * (z1 - z0);
    let dirX = 0, dirZ = 0, speed = 1, water = 1, sed = 0;
    for (let l = 0; l < life; l++) {
      const ci = px | 0, cj = pz | 0;
      if (ci < bx0 || cj < bz0 || ci >= bx1 || cj >= bz1) break;
      const u = px - ci, v = pz - cj;
      const k = cj * VN + ci;
      const a = h[k] * S, b = h[k + 1] * S, c = h[k + VN] * S, d = h[k + VN + 1] * S;
      const gx = (b - a) * (1 - v) + (d - c) * v, gz = (c - a) * (1 - u) + (d - b) * u;
      const hOld = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      dirX = dirX * inertia - gx * (1 - inertia);
      dirZ = dirZ * inertia - gz * (1 - inertia);
      const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (len < 1e-6) break;
      dirX /= len; dirZ /= len;
      px += dirX; pz += dirZ;
      const ni = px | 0, nj = pz | 0;
      if (ni < bx0 || nj < bz0 || ni >= bx1 || nj >= bz1) break;
      const nu = px - ni, nv = pz - nj, nk = nj * VN + ni;
      const hNew = (h[nk] * (1 - nu) * (1 - nv) + h[nk + 1] * nu * (1 - nv) + h[nk + VN] * (1 - nu) * nv + h[nk + VN + 1] * nu * nv) * S;
      const dh = hNew - hOld;
      const cap = Math.max(-dh * speed * water * capF, minCap);
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depS;
        sed -= amt;
        const A = amt * CELL;
        h[k] += A * (1 - u) * (1 - v); h[k + 1] += A * u * (1 - v);
        h[k + VN] += A * (1 - u) * v; h[k + VN + 1] += A * u * v;
      } else {
        const amt = Math.min((cap - sed) * erodeS, -dh);
        for (let q = 0; q < wts.length; q++) {
          const ii = ci + offs[q * 2], jj = cj + offs[q * 2 + 1];
          if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
          const idx = jj * VN + ii;
          const e = Math.min(amt * wts[q], h[idx] * S - (hOld - 2));
          if (e <= 0) continue;
          h[idx] -= e * CELL;
          sed += e;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * grav));
      water *= 1 - evap;
    }
  }
  return [bx0 - 3, bz0 - 3, bx1 + 3, bz1 + 3];
};

Gen.erode = async function (h, drops, seed, progress) {
  const rnd = D.rng(seed + 999);
  const batch = 3000;
  for (let n = 0; n < drops; n += batch) {
    Gen.erodeSync(h, Math.min(batch, drops - n), rnd, [1, 1, N - 2, N - 2]);
    if (progress) progress(n / drops);
    await tick();
  }
  // gentle smoothing pass to remove single-cell spikes left by deposition
  const tmp = new Float32Array(h.length);
  tmp.set(h);
  for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
    const k = j * VN + i;
    const avg = (tmp[k - 1] + tmp[k + 1] + tmp[k - VN] + tmp[k + VN]) * 0.25;
    h[k] = tmp[k] * 0.7 + avg * 0.3;
  }
};
})();
