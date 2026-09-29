/* Diorama — director: history grows the world (Living History spec §3.9).
   A story part (order 10). Each season it may found a new place, spill an existing one outward as a compact
   growth lobe, raise walls or make a town richer, through the commit-only Town.hist mutators. It never razes,
   never touches terrain, nature, player buildings or player roads (I2), and claims only free land (I3).

   Site grid   64 m cells (SG 256): h, slope, wet, river, depth, forest, dWater, dRoad, dDeep, rel, coast.
               Built in ≤ 1 ms slices at story:prepare (or on load of a started chronicle); dirty rects are
               refreshed 5 s after terrain / sea / road edits.
   Scan        an async pass (≤ 1 ms per frame) over the grid that scores every kind of site against the current
               settlements (spacing, player land, vetoes, nearby towns). The clock holds before a Spring commit
               until the scan matches the current world, so the year's agenda is deterministic from state.
   Agenda      planned in Spring: Poisson(1.3·(.25 + .75·sat)) acts drawn from weighted wishes (extend, found,
               walls, richer), spread over the year's seasons; a heartbeat forces an act after 12 quiet seasons.
   Lobes       growLobe: pick a side (sector softmax, wayfarer pull), seed at its best free cell, best-first
               growth with a distance penalty and a compactness rule, then prune spurs.
   Optional: without this file the chronicle, roads, works and realm still run on the player's settlements. */
(function () {
'use strict';
const D = window.D;
if (!D) return;
const N = D.N || 1024, CELL = D.CELL || 16, SIZE = D.SIZE || N * CELL;
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();
const H32 = D.hash32 || function () {   // exact copy of town.js hash32 (core.js provides D.hash32)
  let h = 0x811c9dc5 ^ arguments.length;
  for (let a = 0; a < arguments.length; a++) {
    let v = arguments[a];
    if (typeof v === 'string') v = D.hashStr(v); else if (typeof v !== 'number' || !isFinite(v)) v = 0x9e37; else v = (v | 0) ^ ((v / 4294967296) | 0);
    h = Math.imul(h ^ v, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h ^= h >>> 15; return h >>> 0;
};
const h01 = function () { return H32.apply(null, arguments) / 4294967296; };

// ---- tuning (D.TUNE.director, merged here; spec §8) ----------------------------------------------------
const TUNE = Object.assign({
  acts: 1.3, heartbeat: 12, lobeMin: 60, lobeMax: 200, farmLobeMax: 400, cooldownMin: 4, cooldownMax: 8,
  maxSettlements: 180, maxMine: 120, maxBuildings: 40000, maxEpochs: 240, vetoYears: 40, vetoR: 800,
  gridMs: 1, scanMs: 1, catchUpMul: 3,
  thr: { village: 1.6, hamlet: 1.4, castle: 1.3, monastery: 1.3, harbour: 1.2, farm: 1.4 }
}, (D.TUNE && D.TUNE.director) || {});
if (D.TUNE) D.TUNE.director = TUNE;
const FULL = { 1: 0.7, 2: 0.6, 3: 0.85, 4: 0.8, 5: 0.7 };
const CELLCAP = { 1: 1600, 2: 2500, 3: 300, 4: 600, 5: 800 };
const KIND_TYPE = { hamlet: 1, village: 1, castle: 3, monastery: 4, harbour: 5, farm: 2 };
const KINDS = ['village', 'hamlet', 'castle', 'monastery', 'harbour', 'farm'];
// min spacing (m): to ANY settlement cell, and to settlements of the SAME type (castles/monasteries/harbours)
const SPACE_ANY = { village: 1400, hamlet: 800, castle: 600, monastery: 800, harbour: 300, farm: 250 };
const SPACE_SAME = { castle: 5000, monastery: 4000, harbour: 3000 };
const DISC_R = { hamlet: 5, village: 8, castle: 4, monastery: 6 };
const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];   // −z is north

// =====================================================================================================
// Pure helpers (exported as Director._pure for dev/tests/director.test.js)
// =====================================================================================================
// small max-heap with deterministic ties (lower key id first)
function Heap() { this.p = []; this.k = []; }
Heap.prototype.size = function () { return this.p.length; };
Heap.prototype.better = function (a, b) { return this.p[a] > this.p[b] || (this.p[a] === this.p[b] && this.k[a] < this.k[b]); };
Heap.prototype.push = function (pri, key) {
  const P = this.p, K = this.k; let i = P.length; P.push(pri); K.push(key);
  while (i > 0) { const q = (i - 1) >> 1; if (!this.better(i, q)) break; [P[i], P[q]] = [P[q], P[i]]; [K[i], K[q]] = [K[q], K[i]]; i = q; }
};
Heap.prototype.pop = function () {
  const P = this.p, K = this.k, top = K[0], lp = P.pop(), lk = K.pop();
  if (P.length) { P[0] = lp; K[0] = lk; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < P.length && this.better(l, m)) m = l; if (r < P.length && this.better(r, m)) m = r; if (m === i) break; [P[i], P[m]] = [P[m], P[i]]; [K[i], K[m]] = [K[m], K[i]]; i = m; } }
  return top;
};
// remove spurs: repeatedly drop cells with fewer than `minN` four-neighbours in (lobe ∪ S), until none are left
function pruneSpurs(lobe, minN, inS, Nn) {
  for (let pass = 0; pass < 64; pass++) {
    const drop = [];
    lobe.forEach(k => {
      const i = k % Nn; let c = 0;
      const has = q => lobe.has(q) || inS(q);
      if (i > 0 && has(k - 1)) c++; if (i < Nn - 1 && has(k + 1)) c++; if (k >= Nn && has(k - Nn)) c++; if (has(k + Nn)) c++;
      if (c < minN) drop.push(k);
    });
    if (!drop.length) break;
    for (const k of drop) lobe.delete(k);
  }
  return lobe;
}
// growLobe(env, target) -> Int32Array (sorted) | null.  env = {
//   N, cells: S's cells, inS(k), canClaim(k), score(k) (cellScore), roadAdj(k) 0..1, ox, oz (origin, cell units),
//   pull: [dx,dz] | null, rng() in [0,1), near: bool (closeLobe: seed nearest the core instead of a side) }
function growLobe(env, target) {
  const Nn = env.N, memo = new Map();
  const cc = k => { let v = memo.get(k); if (v === undefined) { v = !env.inS(k) && !!env.canClaim(k); memo.set(k, v); } return v; };
  const sc = new Map(), score = k => { let v = sc.get(k); if (v === undefined) { v = +env.score(k) || 0; sc.set(k, v); } return v; };
  const nb8 = (k, fn) => { const i = k % Nn, j = (k / Nn) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= Nn || b >= Nn) continue; fn(b * Nn + a); } };
  // frontier: free cells 8-adjacent to S
  const Fs = new Set();
  for (let q = 0; q < env.cells.length; q++) nb8(env.cells[q], k => { if (!Fs.has(k) && cc(k)) Fs.add(k); });
  if (!Fs.size) return null;
  const F = Array.from(Fs).sort((a, b) => a - b);
  const ci = k => k % Nn, cj = k => (k / Nn) | 0;
  let seed = -1;
  if (env.near) {
    let bs = -1e18;
    for (const k of F) { const s = score(k) - Math.hypot(ci(k) - env.ox, cj(k) - env.oz) / 12; if (s > bs) { bs = s; seed = k; } }
  } else {
    const sum = new Float64Array(8), cnt = new Int32Array(8), sec = k => { const a = Math.atan2(cj(k) + 0.5 - env.oz, ci(k) + 0.5 - env.ox); return ((Math.round(a / (PI / 4)) % 8) + 8) % 8; };
    for (const k of F) { const d = sec(k); sum[d] += score(k); cnt[d]++; }
    const pull = env.pull, w = new Float64Array(8); let tot = 0, mx = -1e18;
    const sv = []; for (let d = 0; d < 8; d++) { if (!cnt[d]) { sv.push(null); continue; } const a = d * PI / 4, v = sum[d] / cnt[d] + (pull ? 0.6 * (Math.cos(a) * pull[0] + Math.sin(a) * pull[1]) : 0); sv.push(v); if (v > mx) mx = v; }
    for (let d = 0; d < 8; d++) if (sv[d] !== null) { w[d] = Math.exp((sv[d] - mx) / 0.3); tot += w[d]; }
    let r = env.rng() * tot, pick = -1;
    for (let d = 0; d < 8; d++) { if (!w[d]) continue; pick = d; r -= w[d]; if (r <= 0) break; }
    let bs = -1e18;
    for (const k of F) if (sec(k) === pick) { const s = score(k); if (s > bs) { bs = s; seed = k; } }
  }
  if (seed < 0) return null;
  const si = ci(seed), sj = cj(seed);
  const lobe = new Set(), tries = new Map(), H = new Heap();
  const claimedNbrs = k => { let c = 0; nb8(k, q => { if (lobe.has(q) || env.inS(q)) c++; }); return c; };
  // spec priority (score − .08·dist(seed) + .6·roadAdj) plus two shaping terms so the lobe stays a compact blob
  // rather than snaking along score ridges: a steep penalty outside a disc of the target's size set just outside
  // the settlement at the seed, and a small bonus per lobe neighbour (cells are re-pushed as the lobe closes round them)
  const R = Math.sqrt(target / PI) + 0.5;
  let ux = si + 0.5 - env.ox, uz = sj + 0.5 - env.oz; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
  const cx0 = si + ux * R * 0.85, cz0 = sj + uz * R * 0.85;
  const lobeNbrs = k => { let c = 0; nb8(k, q => { if (lobe.has(q)) c++; }); return c; };
  const pri = k => score(k) - 0.08 * Math.hypot(ci(k) - si, cj(k) - sj) + 0.6 * (+env.roadAdj(k) || 0)
    - 0.35 * Math.max(0, Math.hypot(ci(k) - cx0, cj(k) - cz0) - R) + 0.12 * lobeNbrs(k);
  H.push(pri(seed), seed);
  let guard = 0;
  while (H.size() && lobe.size < target && guard++ < 20000) {
    const k = H.pop();
    if (lobe.has(k) || !cc(k)) continue;
    if (Math.max(Math.abs(ci(k) - si), Math.abs(cj(k) - sj)) > 14) continue;
    if (lobe.size > 20 && claimedNbrs(k) < 2) continue;                   // compact: no tendrils
    lobe.add(k);
    nb8(k, q => { if (lobe.has(q) || !cc(q)) return; const t = tries.get(q) || 0; if (t >= 4) return; tries.set(q, t + 1); H.push(pri(q), q); });
  }
  pruneSpurs(lobe, 2, env.inS, Nn);
  if (lobe.size < 12) return null;
  return Int32Array.from(Array.from(lobe).sort((a, b) => a - b));
}
// scoreSite(kind, L, info) -> score | -Infinity.  L = grid layers at the cell {slope, wet, forest, dWater, dRoad,
// rel, coast}; info = {nearRich 0|1, quiet (-1 reject | .3 | 1), nearTown 0|1, ring ≥ 0}
function scoreSite(kind, L, info) {
  if (L.wet) return -Infinity;
  const flat = 1 - clamp(L.slope / 0.3, 0, 1);
  info = info || {};
  switch (kind) {
    case 'village': case 'hamlet':
      if (L.forest > 0.5 || flat < 0.4) return -Infinity;
      return 1.0 * flat + 0.8 * Math.exp(-L.dWater / 300) + 0.4 * clamp(-L.rel / 30, -1, 1) + 0.7 * Math.exp(-L.dRoad / 500);
    case 'castle':
      if (L.forest > 0.6 || !info.nearRich) return -Infinity;
      return 1.2 * clamp(L.rel / 40, 0, 1.5) + 0.6 * flat + 0.8 * info.nearRich;
    case 'monastery':
      if (flat < 0.4 || info.quiet < 0) return -Infinity;
      return 1.0 * Math.exp(-L.dWater / 250) + 0.6 * clamp(-L.rel / 40, 0, 1) + (info.quiet || 0);
    case 'harbour':
      if (L.coast < 0.2 || !info.nearTown) return -Infinity;
      return 1.5 * L.coast + 0.6 * info.nearTown;
    case 'farm':
      if (flat < 0.5 || L.forest > 0.5 || !(info.ring > 0)) return -Infinity;
      return flat + info.ring;
  }
  return -Infinity;
}
function kindDemand(kind, year) {
  switch (kind) {
    case 'hamlet': return year < 1200 ? 1 : year < 1300 ? 0.7 : 0.4;
    case 'village': return year < 1250 ? 0.8 : 0.45;
    case 'castle': return year < 1250 ? 0.5 : 0.2;
    case 'monastery': return year >= 1100 && year <= 1300 ? 0.6 : 0.15;
    case 'harbour': return 0.6;
    case 'farm': return 0.7;
  }
  return 0;
}
function poisson(lam, r) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 20); return k - 1; }
// deterministic weighted pick (array order = tie order)
function wpick(arr, r) { let t = 0; for (const a of arr) t += a.w; if (!(t > 0)) return -1; let x = r() * t; for (let i = 0; i < arr.length; i++) { x -= arr[i].w; if (x <= 0) return i; } return arr.length - 1; }
// distance transform (m) on a w×h grid of `step` m: 0 where src[k] is set
function chamfer(src, w, h, step) {
  const d = new Float32Array(w * h), a = step, b = step * Math.SQRT2, INF = 1e9;
  for (let k = 0; k < w * h; k++) d[k] = src[k] ? 0 : INF;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; let v = d[k]; if (!v) continue;
    if (i > 0 && d[k - 1] + a < v) v = d[k - 1] + a;
    if (j > 0) { if (d[k - w] + a < v) v = d[k - w] + a; if (i > 0 && d[k - w - 1] + b < v) v = d[k - w - 1] + b; if (i < w - 1 && d[k - w + 1] + b < v) v = d[k - w + 1] + b; }
    d[k] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i; let v = d[k]; if (!v) continue;
    if (i < w - 1 && d[k + 1] + a < v) v = d[k + 1] + a;
    if (j < h - 1) { if (d[k + w] + a < v) v = d[k + w] + a; if (i < w - 1 && d[k + w + 1] + b < v) v = d[k + w + 1] + b; if (i > 0 && d[k + w - 1] + b < v) v = d[k + w - 1] + b; }
    d[k] = v;
  }
  return d;
}

// =====================================================================================================
// Site grid (64 m)
// =====================================================================================================
const SG = 256, GC = SIZE / SG, GN = SG * SG;
const G = { ready: false, built: false, job: null, h: null, slope: null, wet: null, river: null, depth: null, forest: null,
  dWater: null, dRoad: null, dDeep: null, rel: null, coast: null, dirty: null, dirtyT: 0, roadsDirty: false, roadsT: 0 };
function gridAlloc() {
  G.h = new Float32Array(GN); G.slope = new Float32Array(GN); G.wet = new Uint8Array(GN); G.river = new Uint8Array(GN);
  G.depth = new Float32Array(GN); G.forest = new Float32Array(GN); G.dWater = new Float32Array(GN).fill(1e9); G.dRoad = new Float32Array(GN).fill(1e9);
  G.dDeep = new Float32Array(GN).fill(1e9); G.rel = new Float32Array(GN); G.coast = new Float32Array(GN);
}
const gIdx = (x, z) => clamp(Math.floor(z / GC), 0, SG - 1) * SG + clamp(Math.floor(x / GC), 0, SG - 1);
function sampleCell(gi, gj) {
  const T = D.Terrain, k = gj * SG + gi, x = (gi + 0.5) * GC, z = (gj + 0.5) * GC;
  const h = [];
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) h.push(T.hAt(x + a * 24, z + b * 24));
  let sl = 0;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const p = b * 3 + a, gx = ((h[p + 1] - h[p]) + (h[p + 4] - h[p + 3])) / 48, gz = ((h[p + 3] - h[p]) + (h[p + 4] - h[p + 1])) / 48; const s = Math.hypot(gx, gz); if (s > sl) sl = s; }
  G.h[k] = h[4]; G.slope[k] = sl;
  const wl = T.waterAt(x, z), dep = wl - h[4];
  G.wet[k] = dep > 0 ? 1 : 0; G.depth[k] = dep > 0 ? dep : 0;
  let rv = 0; try { if (D.Water && D.Water.riverAt && D.Water.riverAt(x, z) > h[4]) rv = 1; } catch (e) { }
  G.river[k] = rv;
  let f = 0; try { if (D.Nature && D.Nature.cover) f = +D.Nature.cover(x, z, 48) || 0; } catch (e) { f = 0; }
  G.forest[k] = f;
}
function roadRaster() {
  const m = new Uint8Array(GN), R = D.Roads;
  if (R && R.segs && R.segSamples) R.segs.forEach(seg => { let S2; try { S2 = R.segSamples(seg); } catch (e) { return; } if (!S2) return; for (let q = 0; q < S2.n; q += 2) m[gIdx(S2.x[q], S2.z[q])] = 1; });
  return m;
}
function* deriveGrid() {
  G.dWater = chamfer(G.wet, SG, SG, GC); yield;
  const deep = new Uint8Array(GN); for (let k = 0; k < GN; k++) deep[k] = G.depth[k] > 3 ? 1 : 0;
  G.dDeep = chamfer(deep, SG, SG, GC); yield;
  G.dRoad = chamfer(roadRaster(), SG, SG, GC); yield;
  // rel = h − mean h within ~600 m (box of radius 9 cells, integral image); wet fraction for the bay term
  const S = new Float64Array((SG + 1) * (SG + 1)), Wf = new Float64Array((SG + 1) * (SG + 1)), R1 = SG + 1;
  for (let j = 0; j < SG; j++) { let rs = 0, rw = 0; for (let i = 0; i < SG; i++) { rs += G.h[j * SG + i]; rw += G.wet[j * SG + i]; S[(j + 1) * R1 + i + 1] = S[j * R1 + i + 1] + rs; Wf[(j + 1) * R1 + i + 1] = Wf[j * R1 + i + 1] + rw; } }
  yield;
  const r = 9;
  for (let j = 0; j < SG; j++) {
    for (let i = 0; i < SG; i++) {
      const a = Math.max(0, i - r), b = Math.max(0, j - r), c = Math.min(SG, i + r + 1), d = Math.min(SG, j + r + 1), n = (c - a) * (d - b);
      const k = j * SG + i, mean = (S[d * R1 + c] - S[b * R1 + c] - S[d * R1 + a] + S[b * R1 + a]) / n;
      G.rel[k] = G.h[k] - mean;
      if (G.wet[k] || G.dWater[k] > 128 || G.dDeep[k] > 300) { G.coast[k] = 0; continue; }
      const wf = (Wf[d * R1 + c] - Wf[b * R1 + c] - Wf[d * R1 + a] + Wf[b * R1 + a]) / n;
      G.coast[k] = clamp(0.5 + 0.5 * (1 - Math.abs(wf - 0.4) / 0.4), 0, 1);    // bays (moderate water share) score higher
    }
    if ((j & 31) === 31) yield;
  }
}
function* buildGrid(rect) {
  const T = D.Terrain; if (!T || !T.hAt) return;
  if (!G.h) gridAlloc();
  const [i0, j0, i1, j1] = rect || [0, 0, SG - 1, SG - 1];
  for (let j = j0; j <= j1; j++) { for (let i = i0; i <= i1; i++) sampleCell(i, j); yield; }
  yield* deriveGrid();
  G.built = true; G.ready = true; scanDirty();
}
// run a generator for ~ms of wall time
function drive(job, ms) { const end = now() + ms; for (;;) { const r = job.next(); if (r.done) return true; if (now() >= end) return false; } }
function markDirty(bb) { G.dirty = G.dirty ? [Math.min(G.dirty[0], bb[0]), Math.min(G.dirty[1], bb[1]), Math.max(G.dirty[2], bb[2]), Math.max(G.dirty[3], bb[3])] : bb.slice(); G.dirtyT = now(); }
// grid layer lookups at a world point / a 16 m zone cell (bilinear for smooth lobe scores)
function gAt(arr, x, z) {
  const fx = clamp(x / GC - 0.5, 0, SG - 1.001), fz = clamp(z / GC - 0.5, 0, SG - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * SG + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + SG] * (1 - u) + arr[k + SG + 1] * u) * v;
}
function cellScore(k) {
  if (!G.ready) return 1;
  const x = (k % N + 0.5) * CELL, z = (((k / N) | 0) + 0.5) * CELL;
  const flat = 1 - clamp(gAt(G.slope, x, z) / 0.3, 0, 1), dry = 1 - gAt(G.wet, x, z), wn = Math.exp(-gAt(G.dWater, x, z) / 300);
  return flat + 0.5 * dry + 0.4 * wn - 1.5 * gAt(G.forest, x, z);
}
function roadAdj(k) {
  if (!G.ready) return 0;
  const x = (k % N + 0.5) * CELL, z = (((k / N) | 0) + 0.5) * CELL, d = gAt(G.dRoad, x, z);
  return d <= 48 ? 1 : Math.exp(-(d - 48) / 64);
}

// =====================================================================================================
// State (snapshot / save) and helpers
// =====================================================================================================
// fw / satY: the year's snapshot of everything the async scan said, taken at Spring planning (the only moment the
// clock is guaranteed to wait for a fresh scan). Later seasons (found acts, heartbeat) read the snapshot, never
// the scan, so the year stays deterministic from state whatever the frame rate.
function fresh() { return { lastGrow: {}, mine: [], minePos: {}, veto: [], agenda: [], sat0: 0, quiet: 0, rewallY: {}, richY: {}, agendaY: 0, satY: 0, fw: [] }; }
let st = fresh();
function clone(s) {
  return { lastGrow: Object.assign({}, s.lastGrow), mine: (s.mine || []).slice(), minePos: Object.assign({}, s.minePos), veto: (s.veto || []).map(v => v.slice()),
    agenda: (s.agenda || []).map(a => a.slice()), sat0: +s.sat0 || 0, quiet: +s.quiet || 0, rewallY: Object.assign({}, s.rewallY), richY: Object.assign({}, s.richY), agendaY: s.agendaY | 0,
    satY: +s.satY || 0, fw: (s.fw || []).map(f => f.slice()) };
}
const TownH = () => (D.Town && D.Town.hist) || null;
function yearNowD() { const St = D.Story; return St && typeof St.time === 'function' ? +St.time() || 0 : 0; }
function traffic(sid) { try { if (D.Wayfarer && D.Wayfarer.trafficOf) { const t = +D.Wayfarer.trafficOf(sid); if (isFinite(t)) return clamp(t, 0, 1); } } catch (e) { } return 0.5; }
function pullOf(sid) { try { if (D.Wayfarer && D.Wayfarer.pull) { const p = D.Wayfarer.pull(sid); if (p && isFinite(p[0]) && isFinite(p[1])) return p; } } catch (e) { } return null; }
function knowEntry(sid) {                // tell the chronicle's diff table about our own act so it is not logged twice
  const St = D.Story, K = St && St._known, H = TownH(); if (!K || typeof K.set !== 'function' || !H) return;
  const e = H.info(sid); if (!e) return;
  try { K.set(e.uid, [e.name, e.type, e.ms, e.walls, e.morph]); } catch (er) { }
}
function vetoed(x, z, year) { for (const v of st.veto) if (v[3] > year && Math.hypot(x - v[0], z - v[1]) < v[2]) return true; return false; }
function nearestSettlementName(x, z, maxD, exceptSid) {
  const H = TownH(); if (!H) return null; let best = null, bd = maxD;
  for (const e of H.list()) { if (e.sid === exceptSid || e.type === 2) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
  return best;
}
// "by the river", "on the hill above Ashby" ... (spec §3.9 founding text)
function siteDescr(x, z, exceptSid) {
  const T = D.Terrain;
  try { if (D.Water && D.Water.riverAt) for (let a = 0; a < 8; a++) for (const r of [0, 80, 150]) { const px = x + Math.cos(a * PI / 4) * r, pz = z + Math.sin(a * PI / 4) * r; if (D.Water.riverAt(px, pz) > T.hAt(px, pz)) return 'by the river'; } } catch (e) { }
  if (G.ready && gAt(G.coast, x, z) > 0.3) return 'on the coast';
  const rel = G.ready ? gAt(G.rel, x, z) : 0;
  if (rel > 25) { const n = nearestSettlementName(x, z, 2500, exceptSid); return n ? 'on the hill above ' + n.name : 'on a hill'; }
  const R = D.Roads;
  if (R && R.nodes) { let cross = false; R.nodes.forEach(n => { if (!cross && (n.segs || []).length >= 3 && Math.hypot(n.x - x, n.z - z) < 150) cross = true; }); if (cross) return 'at the crossroads'; }
  if (G.ready && gAt(G.dRoad, x, z) < 120) { const n = nearestSettlementName(x, z, 6000, exceptSid); if (n) return 'on the road to ' + n.name; }
  if (rel < -20) return 'in a quiet valley';
  return 'in open country';
}

// =====================================================================================================
// Scan: score every site kind against the current settlements (async, sliced)
// =====================================================================================================
const SC = { job: null, key: '', res: null, want: '', gen: 0, pre: '', preT: -1e9 };
function scanDirty() { SC.want = ''; SC.gen++; }     // forces a rescan even when the world key is unchanged
// cheap per-frame change stamp (no list rebuild): zone + record versions, roads, vetoes, grid, forced rescans
function preKey() {
  const H = TownH(); if (!H) return '';
  const Tn = D.Town, R = D.Roads;
  return (H.ver ? H.ver() : Tn.zoneVersion ? Tn.zoneVersion() : 0) + '|' + (R ? (R.version | 0) + ':' + (R.segs ? R.segs.size : 0) : 0) + '|' + st.veto.length + '|' + (G.built ? 1 : 0) + '|' + SC.gen;
}
// the world key a scan describes (house counts bucketed, so a finished plan that adds a few houses does not rescan).
// Rebuilds Town.hist.list() when records changed: only called when preKey moved, at most 4 Hz, never mid-edit.
function scanKey() {
  const H = TownH(); if (!H) return '';
  const Tn = D.Town, R = D.Roads;
  let hs = 0; for (const e of H.list()) hs += e.sid * 31 + ((e.houses / 10) | 0) * 7 + e.type;
  return (Tn.zoneVersion ? Tn.zoneVersion() : 0) + '|' + (R ? (R.version | 0) + ':' + (R.segs ? R.segs.size : 0) : 0) + '|' + hs + '|' + st.veto.length + '|' + (G.built ? 1 : 0) + '|' + SC.gen;
}
function editing() { const Hi = D.History; return !!((Hi && Hi.active && Hi.active()) || (D.Tools && D.Tools.stroke) || (D.Roads && D.Roads.draft)); }
function* scanJob(key) {
  const H = TownH(), Z = D.W && D.W.zone; if (!H || !Z || !G.ready) return null;
  const L = H.list(), year = Math.floor(yearNowD()) || (D.Story && D.Story.Y0) || 1086;
  const any = new Uint8Array(GN), byT = [null, new Uint8Array(GN), new Uint8Array(GN), new Uint8Array(GN), new Uint8Array(GN), new Uint8Array(GN)], pl = new Uint8Array(GN);
  let n = 0;
  for (const e of L) {
    const i0 = clamp(Math.floor(e.bb[0] / CELL), 0, N - 1), i1 = clamp(Math.floor(e.bb[2] / CELL), 0, N - 1), j0 = clamp(Math.floor(e.bb[1] / CELL), 0, N - 1), j1 = clamp(Math.floor(e.bb[3] / CELL), 0, N - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = (j * N + i) * 4; if (Z[o + 1] !== e.sid || !Z[o]) continue;
      const g = ((j * CELL / GC) | 0) * SG + ((i * CELL / GC) | 0); any[g] = 1; byT[e.type][g] = 1; if (e.by === 'p') pl[g] = 1;
    }
    if ((++n & 7) === 0) yield;
  }
  if (D.Town.forManual) D.Town.forManual(0, 0, SIZE, SIZE, b => { pl[gIdx(b.x, b.z)] = 1; });
  yield;
  const dAny = chamfer(any, SG, SG, GC); yield;
  const dT = [null, chamfer(byT[1], SG, SG, GC)]; yield;
  dT[3] = chamfer(byT[3], SG, SG, GC); yield;
  dT[4] = chamfer(byT[4], SG, SG, GC); yield;
  dT[5] = chamfer(byT[5], SG, SG, GC); yield;
  const dPl = chamfer(pl, SG, SG, GC); yield;
  const towns = L.filter(e => e.type === 1).map(e => ({ sid: e.sid, x: e.x, z: e.z, houses: e.houses, wealth: e.wealth }));
  const best = {}; for (const k of KINDS) best[k] = [];
  let count = 0;
  const keep = (arr, s, x, z, extra) => {
    for (const c of arr) if (Math.hypot(c.x - x, c.z - z) < 600) { if (s > c.s) { c.s = s; c.x = x; c.z = z; c.extra = extra; } return; }
    arr.push({ s, x, z, extra }); arr.sort((a, b) => b.s - a.s || a.x - b.x || a.z - b.z); if (arr.length > 6) arr.length = 6;
  };
  const Lc = {};
  for (let gj = 2; gj < SG - 2; gj += 2) {
    for (let gi = 2; gi < SG - 2; gi += 2) {
      const k = gj * SG + gi;
      if (G.wet[k] || dPl[k] < 120 || dT[1][k] > 5000) continue;
      const x = (gi + 0.5) * GC, z = (gj + 0.5) * GC;
      if (vetoed(x, z, year)) continue;
      Lc.slope = G.slope[k]; Lc.wet = 0; Lc.forest = G.forest[k]; Lc.dWater = G.dWater[k]; Lc.dRoad = G.dRoad[k]; Lc.rel = G.rel[k]; Lc.coast = G.coast[k];
      // town proximity terms
      let nearRich = 0, qd = 1e9, nearTown = 0, ring = 0, ringSid = 0;
      for (const t of towns) {
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < 2500 && t.houses >= 40 && t.wealth >= 0.5) nearRich = 1;
        if (t.houses >= 30 && d < qd) qd = d;
        if (d < 1500 && t.houses >= 40) nearTown = 1;
        if (t.houses >= 25 && d >= 400 && d <= 1200) { const rr = Math.min(1, t.houses / 100) + 0.3; if (rr > ring) { ring = rr; ringSid = t.sid; } }
      }
      const quiet = qd < 1500 ? -1 : qd <= 5000 ? 1 : 0.3;
      const info = { nearRich, quiet, nearTown, ring };
      let anyOk = false;
      for (const kind of KINDS) {
        if (dAny[k] < SPACE_ANY[kind]) continue;
        const same = SPACE_SAME[kind]; if (same && dT[KIND_TYPE[kind]][k] < same) continue;
        const s = scoreSite(kind, Lc, info);
        if (!(s >= TUNE.thr[kind])) continue;
        anyOk = true;
        keep(best[kind], s + 0.02 * h01(gi, gj, kind), x, z, kind === 'farm' ? ringSid : 0);
      }
      if (anyOk) count++;
    }
    yield;
  }
  return { key, count, best, year };
}
function scanFresh() { return !!(SC.res && SC.res.key === SC.want && SC.want); }

// =====================================================================================================
// Foundings: shape the zone of a new place at a site
// =====================================================================================================
function comp8(cells, startK) {         // the 8-connected component of `cells` (Set) containing startK
  if (!cells.has(startK)) return [];
  const out = [], seen = new Set([startK]), q = [startK];
  while (q.length) { const k = q.pop(); out.push(k); const i = k % N, j = (k / N) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const nk = (j + dj) * N + i + di; if ((di || dj) && cells.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); } } }
  return out;
}
function foundShape(kind, x, z, extra) {
  const H = TownH(); if (!H) return null;
  const type = KIND_TYPE[kind], ci = clamp(Math.floor(x / CELL), 0, N - 1), cj = clamp(Math.floor(z / CELL), 0, N - 1);
  const ok = new Set(); let total = 0;
  const T = D.Terrain;
  if (kind === 'harbour') {
    const r = 9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r) continue; const i = ci + di, j = cj + dj; if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const k = j * N + i, px = (i + 0.5) * CELL, pz = (j + 0.5) * CELL;
      let shore = false; for (let a = 0; a < 8 && !shore; a++) if (T.isWet(px + Math.cos(a * PI / 4) * 40, pz + Math.sin(a * PI / 4) * 40)) shore = true;
      if (shore && H.canClaim(k, type, 0)) ok.add(k);
    }
    let bestC = [];
    const tried = new Set();
    for (const k of Array.from(ok).sort((a, b) => a - b)) { if (tried.has(k)) continue; const c = comp8(ok, k); c.forEach(q => tried.add(q)); if (c.length > bestC.length) bestC = c; }
    return bestC.length >= 10 ? Int32Array.from(bestC.sort((a, b) => a - b)) : null;
  }
  if (kind === 'farm') {
    const V = extra ? H.info(extra) : null; if (!V) return null;
    const d0 = Math.hypot(x - V.x, z - V.z), a0 = Math.atan2(z - V.z, x - V.x), half = clamp(220 / Math.max(1, d0), 0.12, 0.5);
    const r = Math.ceil(260 / CELL);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj; if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const px = (i + 0.5) * CELL, pz = (j + 0.5) * CELL, d = Math.hypot(px - V.x, pz - V.z);
      if (Math.abs(d - d0) > 160 || Math.abs(D.angDiff ? D.angDiff(a0, Math.atan2(pz - V.z, px - V.x)) : 0) > half) continue;
      total++;
      const k = j * N + i; if (H.canClaim(k, type, 0)) ok.add(k);
    }
  } else {
    const r = DISC_R[kind] || 6;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r + 0.5) continue; const i = ci + di, j = cj + dj; if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      total++;
      const k = j * N + i; if (H.canClaim(k, type, 0)) ok.add(k);
    }
  }
  // the component containing the centre (or the free cell nearest it)
  let start = cj * N + ci;
  if (!ok.has(start)) { let bd = 1e9; ok.forEach(k => { const d = Math.hypot(k % N - ci, ((k / N) | 0) - cj); if (d < bd || (d === bd && k < start)) { bd = d; start = k; } }); }
  const c = comp8(ok, start);
  if (c.length < 10 || c.length < 0.6 * total) return null;
  return Int32Array.from(c.sort((a, b) => a - b));
}

// =====================================================================================================
// Lobes on a live settlement
// =====================================================================================================
function lobeEnv(sid, rng, near) {
  const H = TownH(), e = H && H.info(sid), Z = D.W && D.W.zone; if (!e || !Z) return null;
  const i0 = clamp(Math.floor(e.bb[0] / CELL), 0, N - 1), i1 = clamp(Math.floor(e.bb[2] / CELL), 0, N - 1), j0 = clamp(Math.floor(e.bb[1] / CELL), 0, N - 1), j1 = clamp(Math.floor(e.bb[3] / CELL), 0, N - 1);
  const cells = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * N + i; if (Z[k * 4 + 1] === sid && Z[k * 4] === e.type) cells.push(k); }
  if (!cells.length) return null;
  const year = Math.floor(yearNowD());
  return { N, cells: Int32Array.from(cells), inS: k => Z[k * 4 + 1] === sid && Z[k * 4] === e.type,
    canClaim: k => { if (!H.canClaim(k, e.type, sid)) return false; if (!st.veto.length) return true; const x = (k % N + 0.5) * CELL, z = (((k / N) | 0) + 0.5) * CELL; return !vetoed(x, z, year); },
    score: cellScore, roadAdj, ox: e.x / CELL, oz: e.z / CELL, pull: near ? null : pullOf(sid), rng, near: !!near, e };
}
function closeLobe(sid, nCells) {
  nCells = Math.max(12, nCells | 0 || 45);
  const env = lobeEnv(sid, D.rng(H32(sid, 'close', nCells)), true); if (!env) return null;
  const c = growLobe(env, nCells);
  return c && c.length >= Math.min(nCells, Math.max(12, Math.floor(nCells * 0.6))) ? c : null;
}

// =====================================================================================================
// The season: vetoes, prehistory, agenda, acts, heartbeat
// =====================================================================================================
function quietSeasons(q) {
  const St = D.Story; if (!St || typeof St.events !== 'function') return st.quiet + 1;
  let ev = null; try { ev = St.events(); } catch (e) { ev = null; }
  if (!ev || !ev.length) return st.quiet + 1;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i], imp = Array.isArray(e) ? e[6] : e.imp, eq = Array.isArray(e) ? e[0] : e.q;
    if (imp >= 2) return Math.max(0, q - (eq | 0));
  }
  return st.quiet + 1;
}
function checkVetoes(ctx) {
  const H = TownH(); if (!H) return;
  const keep = [];
  for (const uid of st.mine) {
    const sid = H.byUid(uid);
    if (sid) { const e = H.info(sid); if (e) st.minePos[uid] = [e.x, e.z]; keep.push(uid); continue; }
    const p = st.minePos[uid];                    // the player demolished it: leave that ground alone for a while
    if (p) { st.veto.push([p[0], p[1], TUNE.vetoR, ctx.year + TUNE.vetoYears]); ctx.mark(); }
    delete st.minePos[uid];
  }
  if (keep.length !== st.mine.length) { st.mine = keep; ctx.mark(); }
  const v = st.veto.filter(x => x[3] > ctx.year); if (v.length !== st.veto.length) st.veto = v;
}
// the prosperity a town grows toward: bigger, busier and older towns rebuild in better stuff
//   40 houses ≈ .5 (a castle may rise nearby) · 140 houses with trade ≈ .65+ (cathedral-worthy)
function wealthGoal(e, tf, age) {
  return clamp(0.26 + 0.17 * Math.log2(1 + e.houses / 20) + 0.12 * (tf || 0) + 0.08 * Math.min(1, (age > 1e8 ? 150 : age) / 150), 0.3, 0.85);
}
function sat() { const c = SC.res ? SC.res.count : 0; return st.sat0 > 0 ? clamp(c / st.sat0, 0, 1) : (c > 0 ? 1 : 0); }
function wishes(year, satV) {
  const H = TownH(); if (!H) return [];
  const L = H.list(), out = [];
  const count = D.Town && D.Town.count ? D.Town.count() : 0;
  for (const e of L) {
    if (!e.grow || e.pending) continue;
    const last = st.lastGrow[e.uid], tf = traffic(e.sid);
    const cd = TUNE.cooldownMin + (TUNE.cooldownMax - TUNE.cooldownMin) * (0.5 * (1 - tf) + 0.5 * h01(e.uid, last | 0, 'cd'));
    const cooled = last === undefined || year - last >= cd;
    const age = e.fy > 0 ? year - e.fy : 1e9;
    let rewall = false;
    if (e.type === 1 && e.walls === 'stone' && e.wallOut >= 0.4 && !(year - (st.rewallY[e.uid] | 0) < 80)) rewall = true;
    if (cooled && e.full >= FULL[e.type] && e.cells < CELLCAP[e.type] && e.epochs < TUNE.maxEpochs && count < TUNE.maxBuildings) {
      const gr = e.type === 1 ? 0.6 + Math.min(1.4, e.houses / 80) : e.type === 5 ? 0.8 : e.type === 2 ? 0.7 : 0.4;
      out.push({ k: 'extend', sid: e.sid, uid: e.uid, w: gr * (0.4 + 0.6 * tf), rewall });
    }
    if (e.type === 1 && !e.plock.wealth && e.wealth < 0.85 && !(year - (st.richY[e.uid] | 0) < 8) && e.wealth + 0.025 < wealthGoal(e, tf, age)) out.push({ k: 'richer', sid: e.sid, uid: e.uid, w: 0.65 });
    if (e.type === 1 && !e.plock.walls && !(e.walls === 'none' && e.wallable === false)) {   // (a plan too small for a wall draws none)
      if (e.walls !== 'stone' && e.houses >= 120 && e.wealth >= 0.6 && age >= 30) out.push({ k: 'walls', sid: e.sid, uid: e.uid, v: 'stone', w: 0.5 });
      else if (e.walls === 'none' && e.houses >= 60 && e.wealth >= 0.45) out.push({ k: 'walls', sid: e.sid, uid: e.uid, v: 'palisade', w: 0.5 });
    }
  }
  // the scan-dependent wishes come from the year's snapshot (st.fw, taken at Spring planning)
  const open = L.length < TUNE.maxSettlements && st.mine.length < TUNE.maxMine && count < TUNE.maxBuildings;
  for (const f of st.fw || []) {
    if (f[0] === 'found') { if (open) out.push({ k: 'found', kind: f[1], w: f[2], cands: f[3] }); continue; }
    const sid = H.byUid(f[1]), e = sid ? H.info(sid) : null;
    if (!e || !e.grow || e.pending || out.some(o => o.k === 'extend' && o.sid === sid)) continue;
    out.push({ k: 'extend', sid, uid: f[1], w: f[2], farm: 1 });
  }
  return out;
}
// read the scan once per year (Spring planning): found wishes with their top candidate sites, as plain tuples
//   ['found', kind, w, [[x, z, extra], ...]]  |  ['extend', uid, w]  (farm: extend the village's farmland instead)
function foundWishes(year, satV) {
  const H = TownH(); if (!H || !SC.res) return [];
  const L = H.list(), out = [];
  const count = D.Town && D.Town.count ? D.Town.count() : 0;
  if (!(L.length < TUNE.maxSettlements && st.mine.length < TUNE.maxMine && count < TUNE.maxBuildings)) return out;
  for (const kind of KINDS) {
    const c = SC.res.best[kind]; if (!c || !c.length) continue;
    const w = kindDemand(kind, year) * satV; if (!(w > 0)) continue;
    if (kind === 'farm') {     // prefer extending the village's existing farmland (within 1.2 km) over founding
      const V = H.info(c[0].extra);
      const fm = V ? L.filter(e => e.type === 2 && e.grow && !e.pending && e.cells < CELLCAP[2] && Math.hypot(e.x - V.x, e.z - V.z) < 1200) : [];
      if (fm.length) { if (!out.some(o => o[0] === 'extend' && o[1] === fm[0].uid)) out.push(['extend', fm[0].uid, w]); continue; }
    }
    out.push(['found', kind, w, c.slice(0, 4).map(q => [q.x, q.z, q.extra | 0])]);
  }
  return out;
}
function planYear(ctx) {
  // the one place the scan is read (busy() held the clock until it matched the world): re-baseline sat0 when
  // new player land opened more room, then snapshot sat and the found wishes for the whole year
  if (SC.res && SC.res.count > st.sat0) st.sat0 = SC.res.count;
  const sv = sat();
  st.satY = sv; st.fw = foundWishes(ctx.year, sv);
  const r = ctx.rng('agenda');
  const A = TUNE.acts * (0.25 + 0.75 * sv);
  const W = wishes(ctx.year, sv);
  let n = poisson(A, r), founds = 0;
  const ag = [];
  while (n-- > 0 && W.length) {
    const i = wpick(W, r); if (i < 0) break;
    const w = W.splice(i, 1)[0];
    if (w.k === 'found') { if (founds) { n++; continue; } founds++; }
    ag.push([Math.floor(r() * 4), w.k, w.sid || 0, w.uid || 0, w.kind || w.v || '', w.rewall ? 1 : 0, w.cands || 0]);
  }
  ag.sort((a, b) => a[0] - b[0]);
  st.agenda = ag; st.agendaY = ctx.year;
}
function logAct(ctx, e) { try { ctx.log(e); } catch (er) { console.warn('[director] log failed', er); } }
function doExtend(ctx, sid, rewall, imp) {
  const H = TownH(), e = H && H.info(sid); if (!e || !e.grow || e.pending) return false;
  const r = ctx.rng('lobe' + e.uid);
  const max = e.type === 2 ? TUNE.farmLobeMax : TUNE.lobeMax, target = Math.round(TUNE.lobeMin + (max - TUNE.lobeMin) * r());
  const env = lobeEnv(sid, r, false); if (!env) return false;
  const cells = growLobe(env, target); if (!cells) { st.lastGrow[e.uid] = ctx.year; return false; }  // boxed in: cool down
  const n = H.extend(sid, cells, { instant: !!ctx.catchUp, rewall: !!rewall });
  if (!n) return false;
  st.lastGrow[e.uid] = ctx.year; if (rewall) st.rewallY[e.uid] = ctx.year;
  ctx.mark();
  let cx = 0, cz = 0; for (const k of cells) { cx += (k % N + 0.5) * CELL; cz += (((k / N) | 0) + 0.5) * CELL; } cx /= cells.length; cz /= cells.length;
  const a = Math.atan2(cz - e.z, cx - e.x), dir = DIRS[((Math.round(a / (PI / 4)) % 8) + 8) % 8];
  const tpl = r();
  const txt = rewall ? `${e.name} spills past its walls, and new walls are raised further out.`
    : e.type === 2 ? `The fields of ${e.name} are carried further ${dir}.`
      : roadAdj(cells[cells.length >> 1]) > 0.8 && tpl < 0.5 ? `${e.name} spreads ${dir} along the road.` : tpl < 0.5 ? `${e.name} spreads to the ${dir}.` : `New houses rise on the ${dir} side of ${e.name}.`;
  logAct(ctx, { k: 'grow', imp: imp || (rewall ? 2 : 1), txt, x: cx, z: cz, uid: e.uid });
  return true;
}
function doFound(ctx, kind, snap) {
  const H = TownH(); if (!H) return false;
  // the candidates snapshotted at Spring (older saves / dev wishes without one fall back to the live scan)
  const cands = Array.isArray(snap) ? snap.map(q => ({ x: q[0], z: q[1], extra: q[2] | 0 })) : SC.res ? SC.res.best[kind] || [] : [];
  for (let i = 0; i < cands.length && i < 4; i++) {
    const c = cands[i];
    if (vetoed(c.x, c.z, ctx.year)) continue;
    const cells = foundShape(kind, c.x, c.z, c.extra); if (!cells) continue;
    const r = ctx.rng('found' + kind);
    const tw = kind === 'hamlet' ? { dens: 0.3 + 0.1 * r(), wealth: 0.3 + 0.1 * r(), walls: 'none' }
      : kind === 'village' ? { dens: 0.35 + 0.25 * r(), wealth: 0.3 + 0.15 * r(), walls: 'none' }
        : kind === 'castle' ? { wealth: 0.25, walls: 'none' } : kind === 'monastery' ? { wealth: 0.45 } : kind === 'harbour' ? { wealth: 0.4 } : { wealth: 0.4, dens: 0.4 };
    const sid = H.found(KIND_TYPE[kind], cells, { tw, pin: kind === 'farm' || kind === 'harbour' ? null : [c.x, c.z], instant: !!ctx.catchUp });
    if (!sid) continue;
    const e = H.info(sid); if (!e) return true;
    st.mine.push(e.uid); st.minePos[e.uid] = [e.x, e.z];
    ctx.mark();
    knowEntry(sid);
    const where = siteDescr(c.x, c.z, sid);
    const txt = kind === 'castle' ? `${e.name} is raised ${where}.` : kind === 'monastery' ? `${e.name} is founded ${where}.`
      : kind === 'farm' ? `New fields are broken ${where}: ${e.name}.` : kind === 'harbour' ? `${e.name} is founded ${where}, a haven for boats.` : `${e.name} is founded ${where}.`;
    logAct(ctx, { k: 'found', imp: kind === 'castle' || kind === 'monastery' ? 3 : 2, txt, x: c.x, z: c.z, uid: e.uid });
    return true;
  }
  return false;
}
function doTweak(ctx, sid, k, v) {
  const H = TownH(), e = H && H.info(sid); if (!e || !e.grow) return false;
  if (k === 'richer') {
    const nv = Math.min(0.85, Math.round((e.wealth + 0.05) * 100) / 100);
    if (!H.setTweakQuiet(sid, 'wealth', nv)) return false;
    st.richY[e.uid] = ctx.year;
    ctx.mark(); knowEntry(sid);
    // only the thresholds make the chronicle (every step would crowd it): a market town, then a rich one
    const band = w => w >= 0.7 ? 2 : w >= 0.5 ? 1 : 0, b1 = band(nv);
    if (b1 > band(e.wealth)) logAct(ctx, { k: 'grow', imp: b1 === 2 ? 2 : 1, x: e.x, z: e.z, uid: e.uid,
      txt: b1 === 2 ? `${e.name} grows rich: its merchants rebuild in stone and tile.` : `${e.name} prospers; its folk rebuild in better stuff.` });
    return true;
  }
  if (!H.setTweakQuiet(sid, 'walls', v)) return false;
  ctx.mark(); knowEntry(sid);
  logAct(ctx, { k: 'walls', imp: 2, txt: v === 'stone' ? `${e.name} is walled in stone.` : `${e.name} raises a palisade.`, x: e.x, z: e.z, uid: e.uid });
  return true;
}
const BUDGET0 = { found: 1, extend: 2, tweak: 1 };
function runAct(ctx, a, used, imp) {
  const [, k, , uid, arg, rw, cands] = a;
  const H = TownH(), B = ctx.budget || BUDGET0;
  const live = uid && H ? H.byUid(uid) : 0;              // slots are reused: the uid is authoritative
  if (k === 'found') { if (used.found >= (B.found | 0)) return false; if (doFound(ctx, arg, cands)) { used.found++; return true; } return false; }
  if (k === 'extend') { if (!live || used.extend >= (B.extend | 0)) return false; if (doExtend(ctx, live, rw, imp)) { used.extend++; return true; } return false; }
  if (k === 'richer' || k === 'walls') { if (!live || used.tweak >= (B.tweak | 0)) return false; if (doTweak(ctx, live, k, arg)) { used.tweak++; return true; } return false; }
  return false;
}
const timeLeft = ctx => (typeof ctx.timeLeft === 'function' ? ctx.timeLeft() : 99);
function season(ctx) {
  const H = TownH(); if (!H) return;
  if (ctx.first) {
    const Y0 = (D.Story && D.Story.Y0) || 1086;
    if (H.stampPrehistory(Y0) > 0) ctx.mark();
    st.sat0 = SC.res ? SC.res.count : 0;
  }
  checkVetoes(ctx);
  if (ctx.season === 0 || st.agendaY !== ctx.year) planYear(ctx);
  const used = { found: 0, extend: 0, tweak: 0 };
  let acted = false;
  const rest = [];
  for (const a of st.agenda) {
    if (a[0] !== ctx.season) { rest.push(a); continue; }
    if (timeLeft(ctx) < 2) { if (a[0] < 3) { const b = a.slice(); b[0]++; rest.push(b); } continue; }   // out of budget: defer
    if (runAct(ctx, a, used)) acted = true;
  }
  st.agenda = rest;
  // prosperity (densify): in Summer and Autumn the town furthest below its wealth goal rebuilds in better stuff,
  // outside the act budget, so a full land still gets richer (walls, keeps and cathedrals follow from wealth)
  if ((ctx.season === 1 || ctx.season === 2) && used.tweak < ((ctx.budget || BUDGET0).tweak | 0) && timeLeft(ctx) > 3) {
    let best = null, bs = 0;
    for (const e of H.list()) {
      if (e.type !== 1 || !e.grow || e.pending || e.plock.wealth || e.wealth >= 0.85 || ctx.year - (st.richY[e.uid] | 0) < 8) continue;
      const age = e.fy > 0 ? ctx.year - e.fy : 1e9, gap = wealthGoal(e, traffic(e.sid), age) - e.wealth;
      const sc = gap * Math.log2(2 + e.houses);
      if (gap > 0.025 && sc > bs) { bs = sc; best = e; }
    }
    if (best && doTweak(ctx, best.sid, 'richer')) { used.tweak++; acted = true; }
  }
  // heartbeat: never silent for long while there is still room to grow
  st.quiet = quietSeasons(ctx.q);
  if (!acted && st.quiet >= TUNE.heartbeat && st.satY > 0.05 && timeLeft(ctx) > 4) {
    const W = wishes(ctx.year, st.satY).sort((a, b) => b.w - a.w || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || (a.sid | 0) - (b.sid | 0));
    for (const w of W) { if (runAct(ctx, [ctx.season, w.k, w.sid || 0, w.uid || 0, w.kind || w.v || '', w.rewall ? 1 : 0, w.cands || 0], used, 2)) { st.quiet = 0; break; } }
  }
}

// =====================================================================================================
// Part protocol
// =====================================================================================================
function update(dt) {
  const St = D.Story; if (!St) return;
  if (!(St.started || St.beginning)) return;
  let ms = St.partBudget ? St.partBudget(TUNE.gridMs) : dt > 0.025 ? TUNE.gridMs / 2 : TUNE.gridMs;   // halved after a slow frame
  if (St.catchingUp) ms *= TUNE.catchUpMul;
  // site grid: first build, then debounced dirty refreshes (5 s after the last edit)
  if (!G.built && !G.job) G.job = buildGrid(null);
  if (!G.job && G.dirty && now() - G.dirtyT > 5000) { const d = G.dirty; G.dirty = null; G.job = buildGrid(d); }
  if (!G.job && G.roadsDirty && now() - G.roadsT > 5000) { G.roadsDirty = false; G.job = (function* () { G.dRoad = chamfer(roadRaster(), SG, SG, GC); scanDirty(); })(); }
  if (G.job) { const t0 = now(); if (drive(G.job, ms)) G.job = null; ms = Math.max(0, ms - (now() - t0)); if (G.job) return; }
  if (!G.ready) return;
  // scan: restart when the world it describes has changed. The full key (a Town.hist.list() rebuild) is only
  // recomputed when the cheap stamp moved, at most 4 Hz and never while the player is mid-edit (paint dabs)
  const pre = preKey();
  if (pre !== SC.pre && !editing() && now() - SC.preT >= 250) {
    SC.pre = pre; SC.preT = now();
    const key = scanKey();
    if (key !== SC.want) { SC.want = key; SC.job = null; }
  }
  if (SC.want && !scanFresh()) {
    if (!SC.job) SC.job = scanJob(SC.want);
    const sms = (St.partBudget ? St.partBudget(TUNE.scanMs) : dt > 0.025 ? TUNE.scanMs / 2 : TUNE.scanMs) * (St.catchingUp ? TUNE.catchUpMul : 1);
    const end = now() + Math.max(0.2, sms);
    for (;;) { const r = SC.job.next(); if (r.done) { SC.res = r.value; SC.job = null; break; } if (now() >= end) break; }
  }
}
// hold the clock before any commit that plans a year (Spring, the begin commit, or a year whose agenda is
// missing) until the scan matches the current world: planning is the only reader of the scan
function busy() {
  if (!G.ready) return true;
  const St = D.Story; if (!St) return false;
  const nq = (St.q | 0) + 1;
  const plans = !St.started || (nq & 3) === 0 || st.agendaY !== (nq >> 2);
  return plans && (preKey() !== SC.pre || !scanFresh());
}
const part = {
  order: 10,
  season,
  update,
  busy,
  snap() { return clone(st); },
  restore(s) { st = s ? clone(s) : fresh(); scanDirty(); },
  serialize() {
    return { v: 1, lastGrow: Object.keys(st.lastGrow).map(u => [+u, st.lastGrow[u]]), mine: st.mine.slice(), minePos: Object.keys(st.minePos).map(u => [+u, st.minePos[u][0], st.minePos[u][1]]),
      veto: st.veto.map(v => v.slice()), agenda: st.agenda.map(a => a.slice()), agendaY: st.agendaY, sat0: st.sat0, quiet: st.quiet, rewall: Object.keys(st.rewallY).map(u => [+u, st.rewallY[u]]),
      rich: Object.keys(st.richY).map(u => [+u, st.richY[u]]), satY: st.satY, fw: st.fw.map(f => f.slice()) };
  },
  deserialize(o) {
    st = fresh();
    if (o && o.v === 1) {
      for (const [u, y] of o.lastGrow || []) st.lastGrow[u] = +y;
      st.mine = (o.mine || []).map(v => Array.isArray(v) ? +v[0] : +v).filter(v => v > 0);
      for (const p of o.minePos || []) if (Array.isArray(p)) st.minePos[p[0]] = [+p[1], +p[2]];
      st.veto = (o.veto || []).filter(v => Array.isArray(v) && v.length >= 4).map(v => [+v[0], +v[1], +v[2], +v[3]]);
      st.agenda = (o.agenda || []).filter(Array.isArray).map(a => a.slice());
      st.agendaY = o.agendaY | 0; st.sat0 = +o.sat0 || 0; st.quiet = +o.quiet || 0;
      for (const [u, y] of o.rewall || []) st.rewallY[u] = +y;
      for (const [u, y] of o.rich || []) st.richY[u] = +y;
      st.satY = +o.satY || 0; st.fw = (o.fw || []).filter(f => Array.isArray(f) && (f[0] === 'found' || f[0] === 'extend')).map(f => f.slice());
    }
    SC.res = null; SC.job = null; scanDirty();     // (a load also emits world:generated, which re-surveys the grid)
  },
  reset() { st = fresh(); scanDirty(); SC.res = null; SC.job = null; }
};

const Director = D.Director = {
  closeLobe, siteDescr: (x, z) => siteDescr(x, z, 0),
  _pure: { growLobe, scoreSite, pruneSpurs, kindDemand, poisson, chamfer },
  _dev: {
    grid: G, scan: SC, state: () => clone(st), foundShape, sat, part,
    // force a founding or a growth lobe on the next commit (browser helpers)
    wish(k, arg) { st.agenda.push([D.Story ? ((D.Story.q | 0) + 1) & 3 : 0, k, k === 'found' ? 0 : arg, k === 'found' ? 0 : (TownH() && TownH().info(arg) || {}).uid || 0, k === 'found' ? arg : '', 0]); },
    rebuild() { G.built = false; G.ready = false; G.job = null; }
  },
  init() {
    if (!D.Story || !D.Story.register) return;
    D.Story.register('director', part);
    console.log('[director] tune', JSON.stringify(TUNE));
    D.on('story:prepare', () => { if (!G.built && !G.job) G.job = buildGrid(null); });
    // terrain edits made while the first build is still running are kept too (re-sampled once it finishes)
    D.on('terrain:h', (i0, j0, i1, j1) => { if (!G.built && !G.job) return; const s = CELL / GC; if (!(j1 >= 0)) { i0 = 0; j0 = 0; i1 = N; j1 = N; } markDirty([Math.max(0, Math.floor((i0 | 0) * s) - 1), Math.max(0, Math.floor((j0 | 0) * s) - 1), Math.min(SG - 1, Math.ceil(i1 * s) + 1), Math.min(SG - 1, Math.ceil(j1 * s) + 1)]); });
    D.on('sea', () => { if (G.built || G.job) markDirty([0, 0, SG - 1, SG - 1]); });
    D.on('roads:changed', () => { G.roadsDirty = true; G.roadsT = now(); });
    D.on('roads:removed', () => { G.roadsDirty = true; G.roadsT = now(); });
    // a new or loaded world: re-survey from scratch (lazily, once the chronicle runs)
    const regrid = () => { G.built = false; G.ready = false; G.job = null; G.dirty = null; SC.res = null; SC.job = null; scanDirty(); };
    D.on('world:generated', regrid);
    D.on('world:reset', regrid);
    D.on('story:restored', scanDirty);
  }
};
})();
