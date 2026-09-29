/* Diorama — roads & paths: a medieval spline network drawn segment by segment, with
   snapping, validated connections, automatic junctions (filleted patches, tapers, caps),
   terrain grading or draping, stone arch bridges and timber trestles, lanterns and
   wayside crosses. Settlement lanes are NOT roads: Town draws those in the terrain
   shader; manual roads here are inputs to the planner and draw on top. */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE } = D;
const W = D.W;

// ---- Types -------------------------------------------------------------------------------
const TYPES = {
  footpath:  { id: 'footpath',  name: 'Footpath',       w: 2.4, fam: 'road', cars: false, peds: true, speed: 0,   grade: 0.25, surf: 0, drape: true, col: '#a58f68' },
  track:     { id: 'track',     name: 'Dirt track',     w: 4.5, fam: 'road', cars: true,  peds: true, speed: 4,   grade: 0.16, surf: 1, col: '#8a6e4a' },
  lane:      { id: 'lane',      name: 'Cobbled lane',   w: 5.5, fam: 'road', cars: true,  peds: true, speed: 3.5, grade: 0.14, surf: 2, col: '#7d766c' },
  street:    { id: 'street',    name: 'Cobbled street', w: 9,   fam: 'road', cars: true,  peds: true, speed: 4,   grade: 0.12, surf: 2, margin: 1.2, lights: 38, col: '#8c857a' },
  kingsroad: { id: 'kingsroad', name: "King's road",    w: 11,  fam: 'road', cars: true,  peds: true, speed: 5,   grade: 0.10, surf: 3, shoulder: 1.5, milestone: 250, col: '#a39a86' }
};
const TYPE_IDS = Object.keys(TYPES);
TYPE_IDS.forEach((t, i) => { TYPES[t].rank = i; TYPES[t].stone = TYPES[t].surf >= 2; });
const EMOJI = { footpath: '🚶', track: '🟫', lane: '🧱', street: '🏘', kingsroad: '👑' };
const LEGACY = { path: 'footpath', lane: 'track', street: 'street', tram: 'street', avenue: 'kingsroad', highway: 'kingsroad' };

const R = D.Roads = { TYPES, TYPE_IDS, nodes: new Map(), segs: new Map(), nextId: 1, draft: null, version: 0, dirty: false };

const BED = 0.35;                       // road surface sits this far above the graded bed
const K_SURF = 0, K_FLAG = 1, K_SHOULDER = 4, K_PATCH = 6, K_PATCHFLAG = 7;
const hcOf = T => T.w / 2 - (T.margin || T.shoulder || 0);
const zrank = T => 0.004 * T.rank;
const clearance = T => T.stone ? 5.5 : 3.2;
const minSeg = (wA, wB) => Math.max(12, 0.5 * (wA + wB) + 2);
const endZone = (wNew, wOld) => Math.max(8, 0.5 * (wNew + wOld) + 4);
function nodeW(n) { let w = 0; if (n) for (const id of n.segs) { const s = R.segs.get(id); if (s) w = Math.max(w, TYPES[s.type].w); } return w; }
const typeOf = t => TYPES[t] || TYPES.track;

// Cross sections: columns [lat, dy, kind] from the left verge to the right verge.
// Flush medieval surfaces: no curbs; verges fall away into the grass.
const HALF = {};
const SECTIONS = {};
TYPE_IDS.forEach(id => {
  const T = TYPES[id], hw = T.w / 2;
  let half;
  switch (id) {
    case 'footpath': half = [[0, 0.10, K_SURF], [hw, 0.06, K_SURF], [hw + 0.6, -0.35, K_SURF]]; break;
    case 'track': half = [[0, 0.14, K_SURF], [hw, 0.10, K_SURF], [hw + 0.8, -0.5, K_SURF]]; break;
    case 'lane': half = [[0, 0.10, K_SURF], [hw, 0.16, K_SURF], [hw + 0.7, -0.5, K_SURF]]; break;       // V kennel
    case 'street': half = [[0, 0.20, K_SURF], [hw - T.margin, 0.16, K_SURF], [hw - T.margin, 0.18, K_FLAG], [hw, 0.18, K_FLAG], [hw + 0.6, -0.6, K_FLAG]]; break;
    default: half = [[0, 0.18, K_SURF], [hw - T.shoulder, 0.14, K_SURF], [hw - T.shoulder, 0.14, K_SHOULDER], [hw, 0.10, K_SHOULDER], [hw + 0.8, -0.7, K_SHOULDER]];
  }
  HALF[id] = half;
  const cols = [];
  for (let k = half.length - 1; k >= 1; k--) cols.push([-half[k][0], half[k][1], half[k][2]]);
  for (let k = 0; k < half.length; k++) cols.push(half[k].slice());
  SECTIONS[id] = cols;
});
// section height at |lat| = a (first matching column wins, i.e. the surface side of a step)
function dyAt(T, a) {
  const h = HALF[T.id];
  a = Math.abs(a);
  for (let k = 0; k < h.length; k++) {
    if (Math.abs(h[k][0] - a) < 1e-4) return h[k][1];
    if (h[k][0] > a) { const p = h[k - 1], q = h[k]; return p[1] + (q[1] - p[1]) * (a - p[0]) / Math.max(1e-6, q[0] - p[0]); }
  }
  return h[h.length - 1][1];
}

// ---- Bezier helpers ------------------------------------------------------------------------
function bez(a, c1, c2, b, t) {
  const u = 1 - t, uu = u * u, tt = t * t;
  return [uu * u * a[0] + 3 * uu * t * c1[0] + 3 * u * tt * c2[0] + tt * t * b[0], uu * u * a[1] + 3 * uu * t * c1[1] + 3 * u * tt * c2[1] + tt * t * b[1]];
}
function bezD(a, c1, c2, b, t) {
  const u = 1 - t;
  return [3 * u * u * (c1[0] - a[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (b[0] - c2[0]), 3 * u * u * (c1[1] - a[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (b[1] - c2[1])];
}
function splitBez(a, c1, c2, b, t) {
  const L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const p01 = L(a, c1), p12 = L(c1, c2), p23 = L(c2, b), p012 = L(p01, p12), p123 = L(p12, p23), m = L(p012, p123);
  return [[a, p01, p012, m], [m, p123, p23, b]];
}

// Arc-length sampled curve (derived; not saved)
function sampleCurve(a, c1, c2, b, step) {
  step = step || 4;
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c1[0] - a[0], c1[1] - a[1]) * 0.5 + Math.hypot(b[0] - c2[0], b[1] - c2[1]) * 0.5;
  const M = Math.max(24, Math.ceil(chord / 1.5));
  const ft = new Float32Array(M + 1), fs = new Float32Array(M + 1);
  let prev = a, s = 0;
  for (let k = 0; k <= M; k++) {
    const t = k / M, p = bez(a, c1, c2, b, t);
    if (k) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    ft[k] = t; fs[k] = s; prev = p;
  }
  const len = s, n = Math.max(2, Math.ceil(len / step) + 1);
  const x = new Float32Array(n), z = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n), L = new Float32Array(n), T = new Float32Array(n);
  let f = 0;
  for (let q = 0; q < n; q++) {
    const target = len * q / (n - 1);
    while (f < M - 1 && fs[f + 1] < target) f++;
    const span = fs[f + 1] - fs[f] || 1;
    const t = ft[f] + (ft[f + 1] - ft[f]) * D.clamp((target - fs[f]) / span, 0, 1);
    const p = bez(a, c1, c2, b, t), d = bezD(a, c1, c2, b, t);
    const dl = Math.hypot(d[0], d[1]) || 1;
    x[q] = p[0]; z[q] = p[1]; tx[q] = d[0] / dl; tz[q] = d[1] / dl; L[q] = target; T[q] = t;
  }
  return { n, x, z, tx, tz, L, T, len, ft, fs };
}
function tAtDist(S, dist) {
  const { ft, fs } = S;
  let f = 0; while (f < fs.length - 2 && fs[f + 1] < dist) f++;
  const span = fs[f + 1] - fs[f] || 1;
  return ft[f] + (ft[f + 1] - ft[f]) * D.clamp((dist - fs[f]) / span, 0, 1);
}
function distAtT(S, t) {
  const { ft, fs } = S;
  let f = 0; while (f < ft.length - 2 && ft[f + 1] < t) f++;
  const span = ft[f + 1] - ft[f] || 1;
  return fs[f] + (fs[f + 1] - fs[f]) * D.clamp((t - ft[f]) / span, 0, 1);
}
function segCurve(seg) { const A = R.nodes.get(seg.a), B = R.nodes.get(seg.b); return [[A.x, A.z], seg.c1, seg.c2, [B.x, B.z]]; }
function ensureS(seg) {
  if (!seg._s) { const [a, c1, c2, b] = segCurve(seg); seg._s = sampleCurve(a, c1, c2, b); seg._cb = null; seg._hr = null; }
  return seg._s;
}
// interpolated centreline frame at arc distance d
function pointAt(seg, d) {
  const S = ensureS(seg);
  const f = D.clamp(d / (S.len || 1) * (S.n - 1), 0, S.n - 1), q = Math.min(S.n - 2, Math.floor(f)), u = f - q;
  let tx = S.tx[q] + (S.tx[q + 1] - S.tx[q]) * u, tz = S.tz[q] + (S.tz[q + 1] - S.tz[q]) * u;
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  return { x: S.x[q] + (S.x[q + 1] - S.x[q]) * u, z: S.z[q] + (S.z[q + 1] - S.z[q]) * u, tx, tz };
}
// Humpback stone bridges: short bridge runs on stone types get a raised crown. Derived
// from the saved flags, so profAt (and everything that follows the road) agrees.
function humpRuns(seg) {
  if (seg._hr) return seg._hr;
  const out = [], T = typeOf(seg.type);
  if (T.stone && seg.flags) {
    const S = ensureS(seg), f = seg.flags, n = S.n;
    let q = 0;
    while (q < n) {
      if (f[q] !== 1) { q++; continue; }
      let e = q; while (e + 1 < n && f[e + 1] === 1) e++;
      const d0 = q > 0 ? (S.L[q - 1] + S.L[q]) * 0.5 : 0, d1 = e < n - 1 ? (S.L[e] + S.L[e + 1]) * 0.5 : S.len;
      const Ls = d1 - d0;
      if (Ls > 2 && Ls < 36) out.push(d0, d1, Math.min(1.5, 0.05 * Ls));
      q = e + 1;
    }
  }
  return (seg._hr = out);
}
function profAt(seg, dist) {
  const S = ensureS(seg), p = seg.prof;
  const f = D.clamp(dist / (S.len || 1) * (S.n - 1), 0, S.n - 1);
  const i = Math.min(S.n - 2, Math.floor(f)), u = f - i;
  let y = p[i] + (p[i + 1] - p[i]) * u;
  const hr = humpRuns(seg);
  for (let k = 0; k < hr.length; k += 3) if (dist > hr[k] && dist < hr[k + 1]) y += hr[k + 2] * Math.sin(Math.PI * (dist - hr[k]) / (hr[k + 1] - hr[k]));
  return y;
}
function flagAt(seg, dist) {
  const S = ensureS(seg);
  return seg.flags[D.clamp(Math.round(dist / (S.len || 1) * (S.n - 1)), 0, S.n - 1)];
}
function setProf(seg, prof, flags) { seg.prof = prof; seg.flags = flags; seg._hr = null; }

// ---- Spatial hash of segments (bbox, 128 m cells) ------------------------------------------
const HC = 128;
let hash = new Map();
const hcell = v => D.clamp(Math.floor(v / HC), -16, 200);
const hkey = (cx, cz) => (cx + 16) * 512 + (cz + 16);
function rehash() {
  hash = new Map();
  R.segs.forEach(seg => {
    const S = ensureS(seg), w = typeOf(seg.type).w / 2 + 2;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let q = 0; q < S.n; q++) { x0 = Math.min(x0, S.x[q]); x1 = Math.max(x1, S.x[q]); z0 = Math.min(z0, S.z[q]); z1 = Math.max(z1, S.z[q]); }
    seg._bb = [x0 - w, z0 - w, x1 + w, z1 + w];
    for (let cz = hcell(z0 - w); cz <= hcell(z1 + w); cz++)
      for (let cx = hcell(x0 - w); cx <= hcell(x1 + w); cx++) {
        const k = hkey(cx, cz); let l = hash.get(k); if (!l) hash.set(k, l = []); l.push(seg.id);
      }
  });
}
let qStamp = 0;
// visit each segment whose hash cells overlap the rect once; fn returns true to stop
function forSegsNear(x0, z0, x1, z1, fn) {
  const st = ++qStamp;
  for (let cz = hcell(z0), cz1 = hcell(z1); cz <= cz1; cz++)
    for (let cx = hcell(x0), cx1 = hcell(x1); cx <= cx1; cx++) {
      const l = hash.get(hkey(cx, cz)); if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const seg = R.segs.get(l[i]);
        if (!seg || seg._qs === st) continue;
        seg._qs = st;
        if (fn(seg)) return;
      }
    }
}
function segsNear(x0, z0, x1, z1) { const out = []; forSegsNear(x0, z0, x1, z1, s => { out.push(s.id); }); return out; }

// ---- Spatial hash of nodes (64 m cells) — snap, near and merge never iterate R.nodes --------
const NHC = 64;
const nhash = new Map();
const ncell = v => D.clamp(Math.floor(v / NHC), -4, 300);
const nkey = (cx, cz) => (cx + 4) * 1024 + (cz + 4);
function nhAdd(n) { n._hk = nkey(ncell(n.x), ncell(n.z)); let l = nhash.get(n._hk); if (!l) nhash.set(n._hk, l = []); l.push(n); }
function nhDel(n) { const l = nhash.get(n._hk); if (!l) return; const i = l.indexOf(n); if (i >= 0) l.splice(i, 1); if (!l.length) nhash.delete(n._hk); }
function rebuildNodeHash() { nhash.clear(); R.nodes.forEach(nhAdd); }
function forNodesNear(x, z, r, fn) {
  for (let cz = ncell(z - r), cz1 = ncell(z + r); cz <= cz1; cz++)
    for (let cx = ncell(x - r), cx1 = ncell(x + r); cx <= cx1; cx++) {
      const l = nhash.get(nkey(cx, cz)); if (!l) continue;
      for (let i = 0; i < l.length; i++) if (fn(l[i])) return;
    }
}

// ---- Distance queries ----------------------------------------------------------------------
const CHK = 16;
function segChunks(seg) {
  if (seg._cb) return seg._cb;
  const S = ensureS(seg), nc = Math.max(1, Math.ceil((S.n - 1) / CHK)), cb = new Float32Array(nc * 4);
  for (let c = 0; c < nc; c++) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let q = c * CHK, q1 = Math.min(S.n - 1, c * CHK + CHK); q <= q1; q++) { if (S.x[q] < x0) x0 = S.x[q]; if (S.x[q] > x1) x1 = S.x[q]; if (S.z[q] < z0) z0 = S.z[q]; if (S.z[q] > z1) z1 = S.z[q]; }
    cb[c * 4] = x0; cb[c * 4 + 1] = z0; cb[c * 4 + 2] = x1; cb[c * 4 + 3] = z1;
  }
  return (seg._cb = cb);
}
// nearest centreline point within lim metres, or null (chunk-culled; used by hot queries)
function segDistWithin(seg, x, z, lim) {
  const S = ensureS(seg), cb = segChunks(seg), nc = cb.length / 4;
  let best = lim * lim, bq = -1, bu = 0;
  for (let c = 0; c < nc; c++) {
    if (x < cb[c * 4] - lim || x > cb[c * 4 + 2] + lim || z < cb[c * 4 + 1] - lim || z > cb[c * 4 + 3] + lim) continue;
    for (let q = c * CHK, q1 = Math.min(S.n - 1, c * CHK + CHK); q < q1; q++) {
      const ax = S.x[q], az = S.z[q], dx = S.x[q + 1] - ax, dz = S.z[q + 1] - az, L2 = dx * dx + dz * dz || 1;
      let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + dx * u - x, ez = az + dz * u - z, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bq = q; bu = u; }
    }
  }
  if (bq < 0) return null;
  return { d: Math.sqrt(best), dist: S.L[bq] + (S.L[bq + 1] - S.L[bq]) * bu, x: S.x[bq] + (S.x[bq + 1] - S.x[bq]) * bu, z: S.z[bq] + (S.z[bq + 1] - S.z[bq]) * bu, tx: S.tx[bq], tz: S.tz[bq] };
}
function nearestOnSeg(seg, x, z) { return segDistWithin(seg, x, z, 1e7); }
function pip(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyDist(poly, x, z) {
  let best = 1e18;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const ax = poly[j], az = poly[j + 1], dx = poly[i] - ax, dz = poly[i + 1] - az, L2 = dx * dx + dz * dz || 1;
    const u = D.clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = ax + dx * u - x, ez = az + dz * u - z;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

// ---- Public queries ------------------------------------------------------------------------
R.near = function (x, z, margin, famFilter) {
  margin = margin || 0;
  let hit = null;
  forSegsNear(x - margin, z - margin, x + margin, z + margin, seg => {
    const T = typeOf(seg.type);
    if (famFilter && T.fam !== famFilter) return false;
    const bb = seg._bb; if (!bb || x < bb[0] - margin || x > bb[2] + margin || z < bb[1] - margin || z > bb[3] + margin) return false;
    const r = segDistWithin(seg, x, z, T.w / 2 + margin);
    if (r && r.d < T.w / 2 + margin) { hit = seg; return true; }
    return false;
  });
  if (hit) return hit;
  // junction patches (filleted polygons)
  ensureLayout();
  if (!R._rmaxAll) return null;
  forNodesNear(x, z, R._rmaxAll + margin, n => {
    const L = n._jl; if (!L || !L.poly) return false;
    const dx = x - n.x, dz = z - n.z, rr = L.rmax + margin;
    if (dx * dx + dz * dz > rr * rr) return false;
    if (pip(L.poly, x, z) || (margin > 0 && polyDist(L.poly, x, z) < margin)) { hit = n; return true; }
    return false;
  });
  return hit;
};
R.heightAt = function (x, z) {
  let best = null;
  forSegsNear(x - 1, z - 1, x + 1, z + 1, seg => {
    const T = typeOf(seg.type), r = segDistWithin(seg, x, z, T.w / 2 + 0.5);
    if (r) { const y = profAt(seg, r.dist) + 0.15; if (best === null || y > best) best = y; }
    return false;
  });
  ensureLayout();
  if (R._rmaxAll) forNodesNear(x, z, R._rmaxAll, n => {
    const L = n._jl; if (!L || !L.poly) return false;
    if ((x - n.x) ** 2 + (z - n.z) ** 2 > L.rmax * L.rmax || !pip(L.poly, x, z)) return false;
    const y = L.py + 0.15; if (best === null || y > best) best = y;
    return false;
  });
  return best;
};
R.nearestPoint = function (x, z, maxD) {
  let best = null, bd = maxD || 100;
  forSegsNear(x - bd, z - bd, x + bd, z + bd, seg => {
    const T = typeOf(seg.type);
    if (!T.cars) return false;
    const r = segDistWithin(seg, x, z, bd);
    if (r && r.d < bd) { bd = r.d; const off = Math.min(2.5, T.w / 4); best = { x: r.x - r.tz * off, z: r.z + r.tx * off, heading: Math.atan2(-r.tx, -r.tz), seg }; }
    return false;
  });
  return best;
};
R.segAt = function (x, z, extra) {
  let best = null, bd = 1e9;
  const ex = extra || 2;
  forSegsNear(x - 16 - ex, z - 16 - ex, x + 16 + ex, z + 16 + ex, seg => {
    const lim = typeOf(seg.type).w / 2 + ex, r = segDistWithin(seg, x, z, lim);
    if (r && r.d < bd) { bd = r.d; best = seg; }
    return false;
  });
  return best;
};
R.totalLength = function () { let s = 0; R.segs.forEach(seg => s += ensureS(seg).len); return s; };
R.segSamples = ensureS;
R.profAt = profAt;
R.flagAt = flagAt;
R.nearestOnSeg = nearestOnSeg;
R.trimAt = function (seg, end) { ensureLayout(); return (end === 'a' ? seg._tA : seg._tB) || 0; };
R.junctionPoly = function (nodeId) { ensureLayout(); const n = R.nodes.get(nodeId); return n && n._jl && n._jl.poly || null; };

// ---- Nodes and links -----------------------------------------------------------------------
function newNode(x, z, y) {
  x = D.clamp(x, 1, SIZE - 1); z = D.clamp(z, 1, SIZE - 1);
  if (y === undefined) {
    const g = D.Terrain.hAt(x, z), w = D.Terrain.waterAt(x, z);
    y = w > g - 0.2 ? w + 4 : g;
  }
  const n = { id: R.nextId++, x, z, y, segs: [] };
  R.nodes.set(n.id, n);
  nhAdd(n);
  return n;
}
function delNode(n) { if (!n) return; R.nodes.delete(n.id); nhDel(n); }
function dropIfOrphan(nid) { const n = R.nodes.get(nid); if (n && !n.segs.length) delNode(n); }
function link(seg) { R.segs.set(seg.id, seg); R.nodes.get(seg.a).segs.push(seg.id); R.nodes.get(seg.b).segs.push(seg.id); }
function unlink(seg) {
  R.segs.delete(seg.id);
  [seg.a, seg.b].forEach(nid => { const n = R.nodes.get(nid); if (n) n.segs = n.segs.filter(s => s !== seg.id); });
}

// ---- Profiles --------------------------------------------------------------------------------
// Height profile + bridge flags (0 ground, 1 bridge; tunnels are gone: deep ground is a cutting).
function profileSeg(seg, opts) {
  opts = opts || {};
  const S = ensureS(seg), n = S.n, T = typeOf(seg.type), hw = T.w / 2;
  const A = R.nodes.get(seg.a), B = R.nodes.get(seg.b);
  const drape = opts.grade === false || !!T.drape;
  seg.dr = drape ? 1 : 0;
  const H = D.Terrain.hAt, WA = D.Terrain.waterAt;
  const g = new Float32Array(n), wl = new Float32Array(n), dg = new Float32Array(n), wet = new Uint8Array(n);
  for (let q = 0; q < n; q++) {
    const x = S.x[q], z = S.z[q], tx = S.tx[q], tz = S.tz[q];
    g[q] = H(x, z); wl[q] = WA(x, z);
    wet[q] = wl[q] > g[q] - 0.3 ? 1 : 0;
    if (drape) { // max of the ground across the width, every 2 m along
      let m = -1e9;
      for (let a = -2; a <= 2; a += 2) {
        const px = x + tx * a, pz = z + tz * a;
        for (let k = -1; k <= 1; k += 0.5) { const h = H(px - tz * hw * k, pz + tx * hw * k); if (h > m) m = h; }
      }
      dg[q] = m + 0.02;
    }
  }
  const r = new Float32Array(n);
  if (drape) {
    for (let q = 0; q < n; q++) r[q] = wet[q] ? Math.max(dg[q], wl[q] + clearance(T)) : dg[q];
  } else {
    for (let q = 0; q < n; q++) {
      let s = 0, c = 0;
      for (let k = -5; k <= 5; k++) { s += g[D.clamp(q + k, 0, n - 1)]; c++; }
      r[q] = wet[q] ? Math.max(s / c, wl[q] + clearance(T)) : s / c;
    }
  }
  // existing end nodes pin the profile; fresh ones float with the grade clamp and adopt the
  // result afterwards (pinning a fresh end to the ground made steep drags infeasible: the
  // clamp then produced a cliff at the start and a long bogus bridge)
  const pinA = A.segs.length > 0, pinB = B.segs.length > 0;
  if (pinA) r[0] = A.y;
  if (pinB) r[n - 1] = B.y;
  const qLo = pinA ? 1 : 0, qHi = pinB ? n - 2 : n - 1;
  const step = S.len / (n - 1), maxD = T.grade * step;
  const clampFB = () => {
    for (let q = Math.max(1, qLo); q <= qHi; q++) r[q] = D.clamp(r[q], r[q - 1] - maxD, r[q - 1] + maxD);
    for (let q = Math.min(n - 2, qHi); q >= qLo; q--) r[q] = D.clamp(r[q], r[q + 1] - maxD, r[q + 1] + maxD);
  };
  if (drape) {
    for (let it = 0; it < 4; it++) clampFB();
    for (let q = qLo; q <= qHi; q++) r[q] = Math.max(r[q], wet[q] ? wl[q] + 1.2 : dg[q]);
  } else {
    for (let it = 0; it < 6; it++) {
      clampFB();
      const t = r.slice();
      for (let q = 1; q < n - 1; q++) r[q] = (t[q - 1] + t[q] * 2 + t[q + 1]) / 4;
      if (!pinA) r[0] = (t[0] * 3 + t[1]) / 4;
      if (!pinB) r[n - 1] = (t[n - 1] * 3 + t[n - 2]) / 4;
    }
    clampFB();
  }
  if (!pinA) A.y = r[0]; else r[0] = A.y;
  if (!pinB) B.y = r[n - 1]; else r[n - 1] = B.y;
  // grade separation: pass over roads we cross without joining them
  const forced = new Uint8Array(n);
  if (opts.seps && opts.seps.length) {
    for (const sp of opts.seps) {
      const reach = sp.wO / 2 + 6;
      for (let q = 1; q < n - 1; q++) if (Math.abs(S.L[q] - sp.dNew) <= reach) { r[q] = Math.max(r[q], sp.yOld + 6); forced[q] = 1; }
    }
    for (let q = 1; q < n - 1; q++) r[q] = Math.max(r[q], r[q - 1] - maxD);
    for (let q = n - 2; q > 0; q--) r[q] = Math.max(r[q], r[q + 1] - maxD);
  }
  setProf(seg, r, computeFlags(r, g, wet, forced, drape));
  if (!drape) gradeTerrain(seg);
}
// bridge flags with hysteresis: enter above 4.5 m, leave below 3 m; water is always bridged
function computeFlags(r, g, wet, forced, drape) {
  const n = r.length, fw = new Uint8Array(n), fb = new Uint8Array(n), fl = new Uint8Array(n);
  const scan = (out, q0, q1, dq) => {
    let on = false;
    for (let q = q0; q !== q1; q += dq) {
      const rel = r[q] - g[q];
      if (wet[q] || forced[q]) on = true;
      else if (drape) on = false;
      else if (!on && rel > 4.5) on = true;
      else if (on && rel < 3) on = false;
      out[q] = on ? 1 : 0;
    }
  };
  scan(fw, 0, n, 1); scan(fb, n - 1, -1, -1);
  for (let q = 0; q < n; q++) fl[q] = (fw[q] && fb[q]) || wet[q] || forced[q] ? 1 : 0;
  // bridge runs shorter than 3 samples become ground; ground gaps shorter than 4 become bridge
  const runs = v => { const out = []; let q = 0; while (q < n) { if (fl[q] !== v) { q++; continue; } let e = q; while (e + 1 < n && fl[e + 1] === v) e++; out.push([q, e]); q = e + 1; } return out; };
  for (const [a, b] of runs(1)) if (b - a + 1 < 3 && !wet.subarray(a, b + 1).some(v => v) && !forced.subarray(a, b + 1).some(v => v)) fl.fill(0, a, b + 1);
  for (const [a, b] of runs(0)) if (a > 0 && b < n - 1 && b - a + 1 < 4) fl.fill(1, a, b + 1);
  return fl;
}

// Grade the terrain to the road bed: hard core, cut side clamped, fill side embanked.
function gradeTerrain(seg) {
  if (seg.dr) return;
  const S = ensureS(seg), T = typeOf(seg.type), r = seg.prof, fl = seg.flags;
  const edge = T.w / 2 + 0.6, core = edge + CELL * 0.5, band = edge + CELL * 1.5;
  const h = W.h, H = D.Terrain.hAt;
  const best = new Map();
  for (let q = 0; q < S.n - 1; q++) {
    if (fl[q] && fl[q + 1]) continue;
    const ax = S.x[q], az = S.z[q], bx = S.x[q + 1], bz = S.z[q + 1];
    const diff = Math.max(Math.abs(H(ax, az) - r[q]), Math.abs(H(bx, bz) - r[q + 1]));
    const emb = Math.min(60, diff * 1.6 + 5);
    const reach = band + emb;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / CELL)), i1 = Math.min(N, Math.ceil((Math.max(ax, bx) + reach) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach) / CELL)), j1 = Math.min(N, Math.ceil((Math.max(az, bz) + reach) / CELL));
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * CELL, pz = j * CELL;
      const u = D.clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
      const d = Math.hypot(px - ax - dx * u, pz - az - dz * u);
      if (d > reach) continue;
      const key = j * VN + i, prev = best.get(key);
      if (prev && prev[0] <= d) continue;
      best.set(key, [d, r[q] + (r[q + 1] - r[q]) * u - BED, emb]);
    }
  }
  if (!best.size) return;
  let bi0 = N, bj0 = N, bi1 = 0, bj1 = 0;
  best.forEach((t, key) => { const i = key % VN, j = (key / VN) | 0; if (i < bi0) bi0 = i; if (i > bi1) bi1 = i; if (j < bj0) bj0 = j; if (j > bj1) bj1 = j; });
  D.History.touch('h', bi0, bj0, bi1, bj1);
  best.forEach((t, key) => {
    const d = t[0], ry = t[1], emb = t[2];
    let y = h[key];
    if (d <= core) y = ry;
    else if (d <= band) y = y > ry ? ry : y + (ry - y) * (1 - D.smooth(0, emb, d - core));
    else y += (ry - y) * (1 - D.smooth(0, emb, d - band));
    h[key] = y;
  });
  D.Terrain.markH(bi0, bj0, bi1, bj1);
}
// Level a disc under a junction to the node height
function gradeDisc(n) {
  const L = n._jl; if (!L || !L.arms) return;
  let graded = false, maxT = 0, maxHw = 0;
  for (const a of L.arms) {
    if (!a.seg.dr) graded = true;
    const t = (a.atA ? a.seg._tA : a.seg._tB) || 0;
    maxT = Math.max(maxT, t); maxHw = Math.max(maxHw, a.ho);
    if (flagAt(a.seg, a.atA ? t : a.len - t) === 1) return;   // junction on a bridge: leave the ground alone
  }
  if (!graded) return;
  const R0 = maxT + maxHw + 8, R1 = R0 + 12, ty = n.y - BED, h = W.h;
  const i0 = Math.max(0, Math.floor((n.x - R1) / CELL)), i1 = Math.min(N, Math.ceil((n.x + R1) / CELL));
  const j0 = Math.max(0, Math.floor((n.z - R1) / CELL)), j1 = Math.min(N, Math.ceil((n.z + R1) / CELL));
  D.History.touch('h', i0, j0, i1, j1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(i * CELL - n.x, j * CELL - n.z);
    if (d > R1) continue;
    const w = 1 - D.smooth(R0, R1, d), k = j * VN + i;
    h[k] += (ty - h[k]) * w;
  }
  D.Terrain.markH(i0, j0, i1, j1);
}

// Resample a segment's profile after its curve changed (node merge); ends blend to the nodes.
function resampleProf(seg, oldProf, oldFlags) {
  const S = ensureS(seg), n = S.n, on = oldProf.length;
  const r = new Float32Array(n), f = new Uint8Array(n);
  for (let q = 0; q < n; q++) {
    const t = q / (n - 1) * (on - 1), i = Math.min(on - 2, Math.floor(t)), u = t - i;
    r[q] = on > 1 ? oldProf[i] + (oldProf[i + 1] - oldProf[i]) * u : oldProf[0];
    f[q] = oldFlags[Math.min(on - 1, Math.round(t))];
  }
  const A = R.nodes.get(seg.a), B = R.nodes.get(seg.b), bl = Math.min(20, S.len / 2);
  const d0 = A.y - r[0], d1 = B.y - r[n - 1];
  for (let q = 0; q < n; q++) r[q] += d0 * (1 - D.smooth(0, bl, S.L[q])) + d1 * (1 - D.smooth(0, bl, S.len - S.L[q]));
  r[0] = A.y; r[n - 1] = B.y;
  setProf(seg, r, f);
}

function makeSeg(aId, bId, c1, c2, type, opts, seps) {
  const seg = { id: R.nextId++, a: aId, b: bId, c1: c1.slice(), c2: c2.slice(), type };
  profileSeg(seg, Object.assign({}, opts, { seps }));
  link(seg);
  clearCorridor(seg);
  return seg;
}
function clearCorridor(seg) {
  const S = ensureS(seg), T = typeOf(seg.type), w = T.w / 2 + 2.5;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let q = 0; q < S.n; q++) { x0 = Math.min(x0, S.x[q]); x1 = Math.max(x1, S.x[q]); z0 = Math.min(z0, S.z[q]); z1 = Math.max(z1, S.z[q]); }
  const test = (x, z) => { const r = segDistWithin(seg, x, z, w); return !!r; };
  if (D.Nature && D.Nature.clearWhere) D.Nature.clearWhere(x0 - w, z0 - w, x1 + w, z1 + w, test);
  if (D.City && D.City.clearCorridor) D.City.clearCorridor(seg, w);
}

// Split a segment at bezier parameter t; returns the new node
function splitAt(seg, t) {
  const S = ensureS(seg);
  const [a, c1, c2, b] = segCurve(seg);
  const [p1, p2] = splitBez(a, c1, c2, b, t);
  const dSplit = distAtT(S, t);
  const X = newNode(p1[3][0], p1[3][1], profAt(seg, dSplit));
  const mk = (aId, bId, part, d0, d1) => {
    const s = { id: R.nextId++, a: aId, b: bId, c1: part[1], c2: part[2], type: seg.type, dr: seg.dr };
    const SS = ensureS(s);
    const pr = new Float32Array(SS.n), fl = new Uint8Array(SS.n);
    for (let q = 0; q < SS.n; q++) {
      const dd = d0 + (d1 - d0) * (SS.L[q] / (SS.len || 1));
      const f = D.clamp(dd / (S.len || 1) * (S.n - 1), 0, S.n - 1), i = Math.min(S.n - 2, Math.floor(f)), u = f - i;
      pr[q] = seg.prof[i] + (seg.prof[i + 1] - seg.prof[i]) * u;   // base profile (humps are derived)
      fl[q] = flagAt(seg, dd);
    }
    pr[0] = R.nodes.get(aId).y; pr[SS.n - 1] = R.nodes.get(bId).y;
    setProf(s, pr, fl);
    return s;
  };
  const s1 = mk(seg.a, X.id, p1, 0, dSplit), s2 = mk(X.id, seg.b, p2, dSplit, S.len);
  unlink(seg);
  link(s1); link(s2);
  return X;
}

// ---- Crossings -------------------------------------------------------------------------------
// Provisional heights of a candidate road (for grade-separation decisions)
function provisional(S, T, yA, yB) {
  const n = S.n, r = new Float32Array(n), br = new Uint8Array(n), g = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    g[q] = D.Terrain.hAt(S.x[q], S.z[q]);
    const w = D.Terrain.waterAt(S.x[q], S.z[q]);
    r[q] = g[q];
    if (w > g[q] - 0.3) { r[q] = w + clearance(T); br[q] = 1; }
  }
  if (yA !== null && yA !== undefined) r[0] = yA;
  if (yB !== null && yB !== undefined) r[n - 1] = yB;
  const maxD = T.grade * S.len / Math.max(1, n - 1);
  for (let it = 0; it < 3; it++) {
    for (let q = 1; q < n - 1; q++) r[q] = D.clamp(r[q], r[q - 1] - maxD, r[q - 1] + maxD);
    for (let q = n - 2; q > 0; q--) r[q] = D.clamp(r[q], r[q + 1] - maxD, r[q + 1] + maxD);
  }
  for (let q = 0; q < n; q++) if (!br[q] && !T.drape && r[q] - g[q] > 4.5) br[q] = 1;
  return { r, br };
}
function refineHit(ca, cb, tn, to) {
  for (let it = 0; it < 3; it++) {
    const P = bez(ca[0], ca[1], ca[2], ca[3], tn), dP = bezD(ca[0], ca[1], ca[2], ca[3], tn);
    const Q = bez(cb[0], cb[1], cb[2], cb[3], to), dQ = bezD(cb[0], cb[1], cb[2], cb[3], to);
    const det = -dP[0] * dQ[1] + dQ[0] * dP[1];
    if (Math.abs(det) < 1e-9) break;
    const rx = Q[0] - P[0], rz = Q[1] - P[1];
    tn = D.clamp(tn + (-rx * dQ[1] + dQ[0] * rz) / det, 0, 1);
    to = D.clamp(to + (dP[0] * rz - dP[1] * rx) / det, 0, 1);
  }
  return [tn, to];
}
// Every place a candidate curve meets the network: junction hits (sorted) and grade separations.
function crossings(a, c1, c2, b, T, skipNodes, yA, yB) {
  const S = sampleCurve(a, c1, c2, b, 4), ca = [a, c1, c2, b];
  const pv = provisional(S, T, yA, yB);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let q = 0; q < S.n; q++) { x0 = Math.min(x0, S.x[q]); x1 = Math.max(x1, S.x[q]); z0 = Math.min(z0, S.z[q]); z1 = Math.max(z1, S.z[q]); }
  const hits = [], seps = [], unders = [];
  forSegsNear(x0 - 2, z0 - 2, x1 + 2, z1 + 2, seg => {
    const O = ensureS(seg), wO = typeOf(seg.type).w, ez = endZone(T.w, wO), cb = segCurve(seg);
    const bb = seg._bb; if (bb && (bb[0] > x1 || bb[2] < x0 || bb[1] > z1 || bb[3] < z0)) return false;
    for (let i = 0; i < S.n - 1; i++) {
      const px = S.x[i], pz = S.z[i], rx = S.x[i + 1] - px, rz = S.z[i + 1] - pz;
      const mnx = Math.min(px, px + rx), mxx = Math.max(px, px + rx), mnz = Math.min(pz, pz + rz), mxz = Math.max(pz, pz + rz);
      for (let j = 0; j < O.n - 1; j++) {
        const qx = O.x[j], qz = O.z[j], sx = O.x[j + 1] - qx, sz = O.z[j + 1] - qz;
        if (Math.max(qx, qx + sx) < mnx || Math.min(qx, qx + sx) > mxx || Math.max(qz, qz + sz) < mnz || Math.min(qz, qz + sz) > mxz) continue;
        const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
        const u = ((qx - px) * sz - (qz - pz) * sx) / den, v = ((qx - px) * rz - (qz - pz) * rx) / den;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        let tn = S.T[i] + (S.T[i + 1] - S.T[i]) * u, to = O.T[j] + (O.T[j + 1] - O.T[j]) * v;
        [tn, to] = refineHit(ca, cb, tn, to);
        const dNew = distAtT(S, tn), dOld = distAtT(O, to);
        if (dNew < ez / 2 || dNew > S.len - ez / 2) continue;
        if (hits.some(h => h.seg === seg.id && Math.abs(h.dNew - dNew) < 1.5) || seps.some(h => h.sid === seg.id && Math.abs(h.dNew - dNew) < 1.5)) continue;
        // grade separation: either side bridged here, or the heights differ by more than 4 m
        const yOld = profAt(seg, dOld), fi = D.clamp(Math.round(dNew / (S.len || 1) * (S.n - 1)), 0, S.n - 1);
        const yN = pv.r[fi];
        if (flagAt(seg, dOld) === 1 || pv.br[fi] || Math.abs(yN - yOld) > 4) {
          if (yN >= yOld - 2) seps.push({ dNew, yOld, wO, sid: seg.id });
          else if (flagAt(seg, dOld) !== 1) unders.push({ sid: seg.id, dOld, reach: T.w / 2 + 4 });   // we dive under: the old road bridges us
          continue;
        }
        const tnD = bezD(a, c1, c2, b, tn), toD = bezD(cb[0], cb[1], cb[2], cb[3], to);
        const dot = (tnD[0] * toD[0] + tnD[1] * toD[1]) / ((Math.hypot(tnD[0], tnD[1]) * Math.hypot(toD[0], toD[1])) || 1);
        if (Math.abs(dot) > 0.966) { hits.push({ dNew, invalid: 'Roads meet at too sharp an angle', seg: seg.id }); continue; }
        if (dOld < ez || dOld > O.len - ez) {
          const nid = dOld < ez ? seg.a : seg.b;
          if (skipNodes.has(nid) || hits.some(h => h.node === nid)) continue;
          hits.push({ dNew, node: nid, wO });
          continue;
        }
        hits.push({ dNew, seg: seg.id, tOld: to, wO });
      }
    }
    return false;
  });
  hits.sort((p, q) => p.dNew - q.dNew);
  return { S, hits, seps, unders };
}

// Resolve a snap spec to a node id (creating/splitting as needed)
function resolve(spec, type) {
  if (spec.node && R.nodes.has(spec.node)) return spec.node;
  if (spec.seg || spec.node) {
    let seg = spec.seg ? R.segs.get(spec.seg) : null, dist = spec.dist;
    if (!seg) {
      rehash();
      const s = R.snap(spec.x, spec.z, type);
      if (s.node) return s.node;
      if (s.seg) { seg = R.segs.get(s.seg); dist = s.dist; }
    }
    if (seg) return splitAt(seg, tAtDist(ensureS(seg), dist)).id;
  }
  return newNode(spec.x, spec.z).id;
}
const sepsBefore = (seps, d) => seps.filter(s => s.dNew < d);

// Build a road from spec A to spec B with the given control points.
R.build = function (A, B, c1, c2, type, opts) {
  opts = opts || {};
  const T = typeOf(type); type = T.id;
  rehash();
  let aId = resolve(A, type);
  rehash();
  let bId = resolve(B, type);
  if (aId === bId) { dropIfOrphan(aId); rehash(); return []; }
  const nA = R.nodes.get(aId), nB = R.nodes.get(bId);
  let a = [nA.x, nA.z], b = [nB.x, nB.z];
  // control points: re-anchor to the resolved node positions
  let C1 = [a[0] + c1[0] - A.x, a[1] + c1[1] - A.z], C2 = [b[0] + c2[0] - B.x, b[1] + c2[1] - B.z];
  const made = [], touched = new Set([aId, bId]), unders = [];
  for (let guard = 0; guard < 24; guard++) {
    rehash();
    const cr = crossings(a, C1, C2, b, T, new Set([aId, bId]), R.nodes.get(aId).y, R.nodes.get(bId).y);
    unders.push(...cr.unders);
    const hit = cr.hits.find(h => !h.invalid);
    if (!hit) { made.push(makeSeg(aId, bId, C1, C2, type, opts, cr.seps)); break; }
    const len = cr.S.len, ms = minSeg(T.w, hit.wO || T.w);
    const xId = hit.node ? hit.node : splitAt(R.segs.get(hit.seg), hit.tOld).id;
    touched.add(xId);
    const X = R.nodes.get(xId);
    const t = tAtDist(cr.S, hit.dNew);
    const [p1, p2] = splitBez(a, C1, C2, b, t);
    const e1 = [X.x - p1[3][0], X.z - p1[3][1]];
    // (only a fresh, unconnected end node is dropped; otherwise the stub is built and tidy collapses it)
    if (hit.dNew < ms && xId !== bId && !made.length && !R.nodes.get(aId).segs.length) {
      // too close to the start for a stub: start from the crossing instead
      const old = aId; aId = xId; dropIfOrphan(old);   // a split node stays touched so tidy can collapse the sliver
      a = [X.x, X.z]; C1 = [p2[1][0] + e1[0], p2[1][1] + e1[1]]; C2 = p2[2];
      continue;
    }
    if (xId === bId || (len - hit.dNew < ms && !R.nodes.get(bId).segs.length)) {
      // too close to the end: finish at the crossing
      made.push(makeSeg(aId, xId, p1[1], [p1[2][0] + e1[0], p1[2][1] + e1[1]], type, opts, sepsBefore(cr.seps, hit.dNew)));
      if (bId !== xId) { touched.delete(bId); dropIfOrphan(bId); bId = xId; }
      break;
    }
    made.push(makeSeg(aId, xId, p1[1], [p1[2][0] + e1[0], p1[2][1] + e1[1]], type, opts, sepsBefore(cr.seps, hit.dNew)));
    aId = xId; a = [X.x, X.z]; C1 = [p2[1][0] + e1[0], p2[1][1] + e1[1]]; C2 = p2[2];
  }
  made.forEach(s => { touched.add(s.a); touched.add(s.b); });
  // where the new road passes well below an existing one, that road now crosses on a bridge
  for (const u of unders) {
    const s = R.segs.get(u.sid); if (!s) continue;
    const S = ensureS(s), f = s.flags.slice(); let any = false;
    for (let q = 1; q < S.n - 1; q++) if (Math.abs(S.L[q] - u.dOld) <= u.reach && !f[q]) { f[q] = 1; any = true; }
    if (any) setProf(s, s.prof, f);
  }
  tidy(touched);
  const live = made.filter(s => R.segs.has(s.id));
  rehash();
  R.dirty = true; R.version++;
  layoutAll();
  D.emit('roads:changed', live);
  return live;
};

// ---- Validation --------------------------------------------------------------------------------
function segBetween(n1, n2) {
  const n = R.nodes.get(n1); if (!n) return null;
  for (const id of n.segs) { const s = R.segs.get(id); if (s && ((s.a === n1 && s.b === n2) || (s.a === n2 && s.b === n1))) return s; }
  return null;
}
function armDirs(spec) { // outgoing directions of what a spec attaches to
  if (spec.node && R.nodes.has(spec.node)) {
    const n = R.nodes.get(spec.node);
    return n.segs.map(id => { const s = R.segs.get(id), S = ensureS(s); return s.a === n.id ? [S.tx[0], S.tz[0]] : [-S.tx[S.n - 1], -S.tz[S.n - 1]]; });
  }
  if (spec.seg && R.segs.has(spec.seg)) { const p = pointAt(R.segs.get(spec.seg), spec.dist); return [[p.tx, p.tz], [-p.tx, -p.tz]]; }
  return [];
}
R.validate = function (A, B, c1, c2, type) {
  const T = TYPES[type];
  if (!T) return { ok: false, reason: 'Unknown road type' };
  if (A.node && B.node && A.node === B.node) return { ok: false, reason: 'Start and end are the same junction' };
  const a = [A.x, A.z], b = [B.x, B.z];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord < minSeg(T.w, T.w)) return { ok: false, reason: 'Too short' };
  const S = sampleCurve(a, c1, c2, b, 4);
  // same two junctions as an existing road that the candidate runs along: upgrade it
  if (A.node && B.node) {
    const s = segBetween(A.node, B.node);
    if (s) {
      const lim = Math.max(3, 0.35 * (T.w + typeOf(s.type).w) + 2);
      let covers = true;
      for (let q = 0; q < S.n && covers; q += 2) if (!segDistWithin(s, S.x[q], S.z[q], lim)) covers = false;
      if (covers) return s.type === T.id ? { ok: false, reason: 'There is already a ' + T.name.toLowerCase() + ' here' } : { ok: true, upgrade: s.id };
    }
  }
  // tight curve
  const rmin = 1.2 * (T.w / 2 + 0.6);
  for (let q = 1; q < S.n - 1; q++) {
    const dot = D.clamp(S.tx[q - 1] * S.tx[q + 1] + S.tz[q - 1] * S.tz[q + 1], -1, 1);
    const th = Math.acos(dot), ds = S.L[q + 1] - S.L[q - 1];
    if (th > 1e-4 && ds / th < rmin) return { ok: false, reason: 'Curve too tight' };
  }
  // crossings
  const skip = new Set(); if (A.node) skip.add(A.node); if (B.node) skip.add(B.node);
  const yOf = sp => sp.node && R.nodes.has(sp.node) ? R.nodes.get(sp.node).y : sp.seg && R.segs.has(sp.seg) ? profAt(R.segs.get(sp.seg), sp.dist) : null;
  // both ends fixed by existing roads: the climb between them must fit the type's grade
  const yA0 = yOf(A), yB0 = yOf(B);
  if (yA0 !== null && yB0 !== null && Math.abs(yB0 - yA0) > T.grade * S.len * 1.02) return { ok: false, reason: 'Too steep between those roads for a ' + T.name.toLowerCase() };
  const cr = crossings(a, c1, c2, b, T, skip, yOf(A), yOf(B));
  const bad = cr.hits.find(h => h.invalid);
  if (bad) return { ok: false, reason: bad.invalid };
  for (let k = 0; k + 1 < cr.hits.length; k++) {
    const h0 = cr.hits[k], h1 = cr.hits[k + 1];
    if (h1.dNew - h0.dNew < minSeg(h0.wO || T.w, h1.wO || T.w)) return { ok: false, reason: 'Too close to another junction' };
  }
  // running along an existing road
  const hitNodes = new Set(cr.hits.filter(h => h.node).map(h => h.node));
  const hitSegs = new Set(cr.hits.filter(h => h.seg).map(h => h.seg));
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let q = 0; q < S.n; q++) { x0 = Math.min(x0, S.x[q]); x1 = Math.max(x1, S.x[q]); z0 = Math.min(z0, S.z[q]); z1 = Math.max(z1, S.z[q]); }
  let reason = null;
  forSegsNear(x0 - 12, z0 - 12, x1 + 12, z1 + 12, seg => {
    const wO = typeOf(seg.type).w, lim = 0.35 * (T.w + wO), ez = endZone(T.w, wO);
    let run = 0;
    for (let q = 0; q < S.n; q++) {
      if (S.L[q] < ez || S.L[q] > S.len - ez) { run = 0; continue; }
      const r = segDistWithin(seg, S.x[q], S.z[q], lim);
      if (r && Math.abs(r.tx * S.tx[q] + r.tz * S.tz[q]) > 0.9) { if (++run >= 3) { reason = 'Runs along an existing road'; return true; } }
      else run = 0;
    }
    return false;
  });
  if (reason) return { ok: false, reason };
  // near miss of a junction or road end
  for (let q = 0; q < S.n && !reason; q++) {
    forNodesNear(S.x[q], S.z[q], 24, n => {
      if (skip.has(n.id) || hitNodes.has(n.id)) return false;
      if (n.segs.some(id => hitSegs.has(id))) { // the node belongs to a road we are joining: allow if far enough along
        const d = Math.hypot(n.x - S.x[q], n.z - S.z[q]);
        if (d >= endZone(T.w, nodeW(n)) * 0.5) return false;
      }
      const lim = Math.max(5, nodeW(n) / 2 + T.w / 2 + 2);
      if (Math.hypot(n.x - S.x[q], n.z - S.z[q]) < lim && S.L[q] > 3 && S.L[q] < S.len - 3) { reason = 'Passes too close to a junction: join it or keep clear'; return true; }
      return false;
    });
  }
  if (reason) return { ok: false, reason };
  // acute angles where the road attaches
  const ta = [S.tx[0], S.tz[0]], tb = [-S.tx[S.n - 1], -S.tz[S.n - 1]];
  const cos20 = Math.cos(20 * Math.PI / 180);
  for (const [spec, t] of [[A, ta], [B, tb]]) {
    for (const d of armDirs(spec)) if (d[0] * t[0] + d[1] * t[1] > cos20) return { ok: false, reason: 'Roads meet at too sharp an angle' };
  }
  return { ok: true };
};

// ---- Tidy: merge close nodes, collapse slivers, settle heights, grade -----------------------------
function keeperOf(n, m) { return n.segs.length !== m.segs.length ? (n.segs.length > m.segs.length ? n : m) : (n.id < m.id ? n : m); }
function mergeNodes(keep, gone, mod) {
  const dx = keep.x - gone.x, dz = keep.z - gone.z;
  for (const sid of gone.segs.slice()) {
    const seg = R.segs.get(sid); if (!seg) continue;
    const other = seg.a === gone.id ? seg.b : seg.a;
    if (other === keep.id) { unlink(seg); mod.delete(sid); continue; }
    // duplicate of an existing keep–other road: drop it
    const dup = keep.segs.some(k => {
      const s = R.segs.get(k); if (!s || (s.a !== other && s.b !== other)) return false;
      const m1 = pointAt(s, ensureS(s).len / 2), m2 = pointAt(seg, ensureS(seg).len / 2);
      return Math.hypot(m1.x - m2.x, m1.z - m2.z) < Math.max(typeOf(s.type).w, typeOf(seg.type).w);
    });
    unlink(seg);
    if (dup) { mod.delete(sid); continue; }
    const oldP = seg.prof, oldF = seg.flags;
    if (seg.a === gone.id) { seg.a = keep.id; seg.c1 = [seg.c1[0] + dx, seg.c1[1] + dz]; }
    else { seg.b = keep.id; seg.c2 = [seg.c2[0] + dx, seg.c2[1] + dz]; }
    seg._s = null; seg._cb = null;
    link(seg);
    resampleProf(seg, oldP, oldF);
    mod.add(seg.id);
  }
  gone.segs = [];
  delNode(gone);
}
function tidy(touched) {
  const mod = new Set();
  // 1. merge nodes within max(6, 0.35·max(nodeW))
  for (const nid of Array.from(touched)) {
    const n = R.nodes.get(nid); if (!n) continue;
    const cands = [];
    forNodesNear(n.x, n.z, 24, m => { if (m !== n) cands.push(m); return false; });
    cands.sort((p, q) => p.id - q.id);
    for (const m of cands) {
      if (!R.nodes.has(n.id) || !R.nodes.has(m.id)) continue;
      const thr = Math.max(6, 0.35 * Math.max(nodeW(n), nodeW(m)));
      if (Math.hypot(m.x - n.x, m.z - n.z) >= thr) continue;
      const keep = keeperOf(n, m), gone = keep === n ? m : n;
      mergeNodes(keep, gone, mod);
      touched.delete(gone.id); touched.add(keep.id);
      if (gone === n) break;
    }
  }
  // 2. collapse slivers shorter than minSeg whose two ends both carry other roads
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (const nid of Array.from(touched)) {
      const n = R.nodes.get(nid); if (!n) continue;
      for (const sid of n.segs.slice()) {
        const s = R.segs.get(sid); if (!s) continue;
        const A = R.nodes.get(s.a), B = R.nodes.get(s.b);
        if (!A || !B || A === B) continue;
        const w = typeOf(s.type).w;
        if (ensureS(s).len >= minSeg(w, w) || A.segs.length < 2 || B.segs.length < 2) continue;
        unlink(s); mod.delete(sid);
        const keep = keeperOf(A, B), gone = keep === A ? B : A;
        mergeNodes(keep, gone, mod);
        touched.delete(gone.id); touched.add(keep.id);
        any = true; break;
      }
    }
    if (!any) break;
  }
  // 3. settle heights, level junction discs, regrade what moved
  touched.forEach(nid => { const n = R.nodes.get(nid); if (n) n.segs.forEach(id => mod.add(id)); });
  rehash();
  layoutAll();
  settleHeights(touched).forEach(id => mod.add(id));
  touched.forEach(nid => { const n = R.nodes.get(nid); if (n && n.segs.length >= 3) gradeDisc(n); });
  mod.forEach(id => { const s = R.segs.get(id); if (s && !s.dr) gradeTerrain(s); });
}
// Plateaus at junctions, vertical G1 through degree-2 nodes
function settleHeights(touched) {
  const out = new Set();
  const clampPass = (r, maxD) => {
    const n = r.length;
    for (let it = 0; it < 3; it++) {
      for (let q = 1; q < n - 1; q++) r[q] = D.clamp(r[q], r[q - 1] - maxD, r[q - 1] + maxD);
      for (let q = n - 2; q > 0; q--) r[q] = D.clamp(r[q], r[q + 1] - maxD, r[q + 1] + maxD);
    }
  };
  touched.forEach(nid => {
    const n = R.nodes.get(nid); if (!n) return;
    const deg = n.segs.length;
    if (deg >= 3) {
      for (const id of n.segs) {
        const seg = R.segs.get(id); if (!seg || seg.dr) continue;
        const S = ensureS(seg), T = typeOf(seg.type), atA = seg.a === n.id, trim = (atA ? seg._tA : seg._tB) || 0;
        const r = seg.prof.slice();
        for (let q = 0; q < S.n; q++) {
          const L = atA ? S.L[q] : S.len - S.L[q];
          r[q] += (n.y - r[q]) * (1 - D.smooth(trim + 6, trim + 26, L));
        }
        r[0] = R.nodes.get(seg.a).y; r[S.n - 1] = R.nodes.get(seg.b).y;
        clampPass(r, T.grade * S.len / Math.max(1, S.n - 1));
        setProf(seg, r, seg.flags); out.add(id);
      }
    } else if (deg === 2) {
      const arms = n.segs.map(id => R.segs.get(id));
      if (arms.some(s => !s || s.dr)) return;
      const info = arms.map(seg => {
        const S = ensureS(seg), atA = seg.a === n.id, Lb = Math.min(20, S.len * 0.45);
        const yb = profAt(seg, atA ? Lb : S.len - Lb);
        return { seg, S, atA, s: (yb - n.y) / Math.max(1, Lb) };
      });
      if (info.some(i => flagAt(i.seg, i.atA ? 0 : i.S.len) === 1)) return;
      const target = (info[1].s - info[0].s) / 2;
      [[info[0], -target], [info[1], target]].forEach(([i, sT]) => {
        const Lb = Math.min(30, i.S.len * 0.45), ds = sT - i.s;
        if (Math.abs(ds) < 1e-3) return;
        const r = i.seg.prof.slice();
        for (let q = 0; q < i.S.n; q++) {
          const L = i.atA ? i.S.L[q] : i.S.len - i.S.L[q];
          if (L < Lb) r[q] += ds * L * (1 - L / Lb) * (1 - L / Lb);
        }
        setProf(i.seg, r, i.seg.flags); out.add(i.seg.id);
      });
    }
  });
  return out;
}

// ---- Junction layout: trims, fillets, tapers, caps, miters ------------------------------------------
function armsOf(n) {
  return n.segs.map(id => {
    const seg = R.segs.get(id), S = ensureS(seg), T = typeOf(seg.type), atA = seg.a === n.id;
    const q = atA ? 0 : S.n - 1, sg = atA ? 1 : -1;
    const dx = S.tx[q] * sg, dz = S.tz[q] * sg;
    return { seg, S, T, atA, dx, dz, ang: Math.atan2(dz, dx), ho: T.w / 2, hc: hcOf(T), len: S.len };
  }).sort((p, q) => p.ang - q.ang);
}
// arm centreline offset by side·ho (side +1 = the increasing-angle side of the outgoing direction)
function offLine(arm, side, lim) {
  const S = arm.S, out = [];
  for (let k = 0; k < S.n; k++) {
    const q = arm.atA ? k : S.n - 1 - k;
    const d = arm.atA ? S.L[q] : S.len - S.L[q];
    const ox = arm.atA ? S.tx[q] : -S.tx[q], oz = arm.atA ? S.tz[q] : -S.tz[q], h = arm.ho * side;
    out.push(S.x[q] - oz * h, S.z[q] + ox * h, d);
    if (d > lim) break;
  }
  return out;
}
function polyHit(P, Q) {
  let best = null;
  for (let i = 0; i + 5 < P.length; i += 3) {
    const px = P[i], pz = P[i + 1], rx = P[i + 3] - px, rz = P[i + 4] - pz;
    for (let j = 0; j + 5 < Q.length; j += 3) {
      const qx = Q[j], qz = Q[j + 1], sx = Q[j + 3] - qx, sz = Q[j + 4] - qz;
      const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
      const u = ((qx - px) * sz - (qz - pz) * sx) / den, v = ((qx - px) * rz - (qz - pz) * rx) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const dA = P[i + 2] + (P[i + 5] - P[i + 2]) * u, dB = Q[j + 2] + (Q[j + 5] - Q[j + 2]) * v;
      if (!best || dA + dB < best[0] + best[1]) best = [dA, dB];
    }
  }
  return best;
}
const DEG = Math.PI / 180;
function layoutAll() {
  R.segs.forEach(s => { s._rA = s._rB = 0; s._tA = s._tB = 0; s._mA = s._mB = null; });
  // pass 1: kinds and raw trims
  R.nodes.forEach(n => {
    n._jl = null;
    const deg = n.segs.length; if (!deg) return;
    const arms = armsOf(n);
    let kind = 'junction';
    if (deg === 1) kind = 'cap';
    else if (deg === 2) {
      const a0 = arms[0], a1 = arms[1];
      const defl = Math.acos(D.clamp(-(a0.dx * a1.dx + a0.dz * a1.dz), -1, 1));
      if (a0.seg.type === a1.seg.type && defl <= 4 * DEG) kind = 'miter';
      else if (a0.seg.type !== a1.seg.type && defl <= 20 * DEG) kind = 'taper';
    }
    const raw = arms.map(() => 0);
    if (kind === 'junction') {
      for (let i = 0; i < arms.length; i++) {
        const A = arms[i], B = arms[(i + 1) % arms.length];
        const hit = polyHit(offLine(A, 1, Math.min(0.5 * A.len, 80)), offLine(B, -1, Math.min(0.5 * B.len, 80)));
        if (!hit) continue;
        const rf = D.clamp(0.5 * Math.min(A.ho, B.ho), 1.5, 8);
        raw[i] = Math.max(raw[i], hit[0] + rf);
        raw[(i + 1) % arms.length] = Math.max(raw[(i + 1) % arms.length], hit[1] + rf);
      }
    } else if (kind === 'taper') {
      const t = Math.abs(arms[0].T.w - arms[1].T.w) / 2 + 4; raw[0] = raw[1] = t;
    } else if (kind === 'miter') {
      // bisector normal on both end rows so the two segments meet without a gap
      const a0 = arms[0], a1 = arms[1];
      let bx = -a0.dx + a1.dx, bz = -a0.dz + a1.dz; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const cosH = Math.max(0.2, Math.abs(-a0.dx * bx - a0.dz * bz));
      for (const a of arms) {
        const S = a.S, q = a.atA ? 0 : S.n - 1, dot = bx * S.tx[q] + bz * S.tz[q], sg = dot >= 0 ? 1 : -1;
        const m = [bx * sg, bz * sg, 1 / cosH];
        if (a.atA) a.seg._mA = m; else a.seg._mB = m;
      }
    }
    arms.forEach((a, i) => { if (a.atA) a.seg._rA = raw[i]; else a.seg._rB = raw[i]; });
    n._jl = { kind, arms };
  });
  // pass 2: clamp against the far end, keep short segments visible
  R.segs.forEach(seg => {
    const len = ensureS(seg).len, T = typeOf(seg.type), ho = T.w / 2;
    const kA = R.nodes.get(seg.a)._jl, kB = R.nodes.get(seg.b)._jl;
    const needA = kA && (kA.kind === 'junction' || kA.kind === 'taper'), needB = kB && (kB.kind === 'junction' || kB.kind === 'taper');
    const lo = Math.max(0.6 * ho, 3);
    const clampT = (r, far) => Math.min(Math.max(r, lo), Math.max(0, Math.min(0.45 * len, len - far - 1)));
    let tA = needA ? clampT(seg._rA, needB ? seg._rB : 0) : 0;
    let tB = needB ? clampT(seg._rB, needA ? seg._rA : 0) : 0;
    if (tA + tB > len - 1) { const k = Math.max(0, len - 1) / (tA + tB); tA *= k; tB *= k; }
    seg._tA = tA; seg._tB = tB;
  });
  // pass 3: junction rings (surface fan, fillets, outer polygon)
  let rmaxAll = 0;
  R.nodes.forEach(n => {
    const L = n._jl; if (!L || L.kind !== 'junction') return;
    junctionRing(n, L);
    if (L.poly) rmaxAll = Math.max(rmaxAll, L.rmax);
  });
  R._rmaxAll = rmaxAll;
  R._jlVer = R.version;
}
function ensureLayout() { if (R._jlVer !== R.version) layoutAll(); }

function fillet(A, dA, B, dB, node, lim) {
  // quadratic Bezier from A (edge of arm i) to B (edge of arm i+1), 6 steps; returns the 5 interior points
  let K = null;
  const cr = dA[0] * dB[1] - dA[1] * dB[0];
  if (Math.abs(cr) > 0.08) {
    const rx = B[0] - A[0], rz = B[1] - A[1];
    const s = (rx * dB[1] - rz * dB[0]) / cr, t = (rx * dA[1] - rz * dA[0]) / cr;
    const kx = A[0] + dA[0] * s, kz = A[1] + dA[1] * s;
    if (s <= 0.25 && t <= 0.25 && Math.hypot(kx - node.x, kz - node.z) < lim) K = [kx, kz];
  }
  if (!K) K = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const out = [];
  for (let k = 1; k < 6; k++) {
    const t = k / 6, u = 1 - t;
    out.push([u * u * A[0] + 2 * u * t * K[0] + t * t * B[0], u * u * A[1] + 2 * u * t * K[1] + t * t * B[1], A[2] + (B[2] - A[2]) * t]);
  }
  return out;
}
function junctionRing(n, L) {
  const ends = L.arms.map(arm => {
    const t = (arm.atA ? arm.seg._tA : arm.seg._tB) || 0, d = arm.atA ? t : arm.len - t;
    const P = pointAt(arm.seg, d);
    const ox = arm.atA ? P.tx : -P.tx, oz = arm.atA ? P.tz : -P.tz, lx = -oz, lz = ox;
    const T = arm.T, y = profAt(arm.seg, d) + zrank(T), hc = arm.hc, ho = arm.ho;
    const pt = (s, h, dy) => [P.x + lx * h * s, P.z + lz * h * s, y + dy];
    return { ox, oz, T, ho, hc, Rc: pt(-1, hc, dyAt(T, hc)), Lc: pt(1, hc, dyAt(T, hc)), Ro: pt(-1, ho, dyAt(T, ho)), Lo: pt(1, ho, dyAt(T, ho)),
      RcM: pt(-1, hc, dyAt(T, hc + 0.001)), LcM: pt(1, hc, dyAt(T, hc + 0.001)) };
  });
  let wide = ends[0];
  ends.forEach(e => { if (e.T.w > wide.T.w) wide = e; });
  const lim = 3 * wide.ho + 20;
  const ring = [], outer = [], corners = [];
  for (let i = 0; i < ends.length; i++) {
    const E = ends[i], F = ends[(i + 1) % ends.length];
    ring.push(E.Rc, E.Lc); outer.push(E.Ro, E.Lo);
    const fc = fillet(E.Lc, [E.ox, E.oz], F.Rc, [F.ox, F.oz], n, lim);
    const fo = fillet(E.Lo, [E.ox, E.oz], F.Ro, [F.ox, F.oz], n, lim);
    ring.push(...fc); outer.push(...fo);
    const fm = fillet(E.LcM, [E.ox, E.oz], F.RcM, [F.ox, F.oz], n, lim);
    corners.push({ inner: [E.LcM].concat(fm, [F.RcM]), outer: [E.Lo].concat(fo, [F.Ro]), flat: E.hc >= E.ho - 1e-3 && F.hc >= F.ho - 1e-3 });
  }
  let cx = 0, cz = 0, cy = 0;
  ring.forEach(p => { cx += p[0]; cz += p[1]; cy += p[2]; });
  cx /= ring.length; cz /= ring.length; cy /= ring.length;
  const poly = new Float32Array(outer.length * 2);
  let rmax = 0;
  outer.forEach((p, i) => { poly[i * 2] = p[0]; poly[i * 2 + 1] = p[1]; rmax = Math.max(rmax, Math.hypot(p[0] - n.x, p[1] - n.z)); });
  Object.assign(L, { ring, outer, corners, center: [cx, cz, cy], poly, rmax: rmax + 0.5, py: cy, wide });
}

// ---- Geometry -----------------------------------------------------------------------------------
function vpush(o, x, y, z, nx, ny, nz, lat, along, kind, typ, re) {
  o.pos.push(x, y, z); o.nor.push(nx, ny, nz); o.rd.push(lat, along, kind, typ); o.re.push(re);
  return o.pos.length / 3 - 1;
}
function tri(o, a, b, c, nrm) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) { const t = b; b = c; c = t; }
  o.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let k = 0; k < 3; k++) o.nor.push(nrm[0], nrm[1], nrm[2]);
}
// quad with edge a–b opposite edge c–d (a above c, b above d)
function quad(o, a, b, c, d, nrm) { tri(o, a, b, c, nrm); tri(o, b, d, c, nrm); }
function boxAt(o, cx, cy, cz, w, h, d, rot, pitch) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pitch) g.rotateX(-pitch);
  g.rotateY(rot); g.translate(cx, cy + h / 2, cz);
  const ng = g.toNonIndexed();
  const p = ng.attributes.position.array, nn = ng.attributes.normal.array;
  for (let i = 0; i < p.length; i++) { o.pos.push(p[i]); o.nor.push(nn[i]); }
  g.dispose(); ng.dispose();
}

function buildGeometry() {
  ensureLayout();
  const road = { pos: [], nor: [], rd: [], re: [], idx: [] };
  const st = { pos: [], nor: [] }, wd = { pos: [], nor: [] };
  const lamps = [], crosses = [];
  R.segs.forEach(seg => buildSegment(seg, road, st, wd, lamps, crosses));
  R.nodes.forEach(n => {
    const L = n._jl; if (!L) return;
    if (L.kind === 'junction' && L.ring) buildJunction(n, L, road);
    else if (L.kind === 'taper') buildTaper(n, L, road);
    else if (L.kind === 'cap') buildCap(n, L, road);
  });
  return { road, st, wd, lamps, crosses };
}

function buildSegment(seg, road, st, wd, lamps, crosses) {
  const T = typeOf(seg.type), typ = T.rank, S = ensureS(seg), sec = SECTIONS[T.id], hw = T.w / 2, zr = zrank(T);
  let tA = seg._tA || 0, tB = seg._tB || 0;
  if (tA + tB > S.len - 1) { const k = Math.max(0, S.len - 1) / Math.max(1e-6, tA + tB); tA *= k; tB *= k; }
  const ds = [tA];
  for (let q = 0; q < S.n; q++) if (S.L[q] > tA + 0.5 && S.L[q] < S.len - tB - 0.5) ds.push(S.L[q]);
  ds.push(S.len - tB);
  let prevRow = null;
  for (let ri = 0; ri < ds.length; ri++) {
    const d = ds[ri];
    const P = pointAt(seg, d);
    let tx = P.tx, tz = P.tz, scale = 1;
    const mit = ri === 0 && tA === 0 ? seg._mA : ri === ds.length - 1 && tB === 0 ? seg._mB : null;
    if (mit) { tx = mit[0]; tz = mit[1]; scale = mit[2]; }
    const y = profAt(seg, d), bridge = flagAt(seg, d) === 1;
    const sl = (profAt(seg, Math.min(S.len, d + 1)) - profAt(seg, Math.max(0, d - 1))) / Math.max(0.5, Math.min(S.len, d + 1) - Math.max(0, d - 1));
    const re = hw + (bridge ? 100 : 0);
    const row = [];
    for (let k = 0; k < sec.length; k++) {
      let lat = sec[k][0], dy = sec[k][1];
      const verge = Math.abs(lat) > hw + 1e-3;
      if (verge && bridge) { lat = Math.sign(lat) * (T.stone ? hw + 0.3 : hw + 0.05); dy = T.stone ? -0.45 : -0.25; }
      let gl = 0;
      if (verge && !bridge) { const inner = sec[lat < 0 ? k + 1 : k - 1]; gl = (dy - inner[1]) / (lat - inner[0]); }
      const nlx = -tz, nlz = tx;
      let nx = -(tx * sl + nlx * gl), nz = -(tz * sl + nlz * gl);
      const nl = Math.hypot(nx, 1, nz);
      row.push(vpush(road, P.x + nlx * lat * scale, y + dy + zr, P.z + nlz * lat * scale, nx / nl, 1 / nl, nz / nl, lat, d, sec[k][2], typ, re));
    }
    if (prevRow) for (let k = 0; k < row.length - 1; k++) road.idx.push(prevRow[k], prevRow[k + 1], row[k], prevRow[k + 1], row[k + 1], row[k]);
    prevRow = row;
  }
  // lanterns on streets: every 38 m, alternating sides (the shader's light pools use the same rhythm)
  if (T.lights) {
    for (let d = T.lights / 2; d < S.len; d += T.lights) {
      if (d < tA + 2 || d > S.len - tB - 2 || flagAt(seg, d) === 1) continue;
      const k = Math.floor(d / T.lights), side = k % 2 ? 1 : -1, P = pointAt(seg, d), lat = side * (hw + 0.35);
      lamps.push([P.x - P.tz * lat, profAt(seg, d) + dyAt(T, hw + 0.35) + zr - 0.05, P.z + P.tx * lat, Math.atan2(P.tx * side, P.tz * side)]);
    }
  }
  // wayside crosses as milestones on the King's road
  if (T.milestone) {
    for (let d = T.milestone / 2; d < S.len; d += T.milestone) {
      if (d < tA + 4 || d > S.len - tB - 4 || flagAt(seg, d) === 1) continue;
      const P = pointAt(seg, d), lat = hw + 1.8, x = P.x - P.tz * lat, z = P.z + P.tx * lat;
      crosses.push([x, Math.max(D.Terrain.hAt(x, z), profAt(seg, d) - 0.7), z, Math.atan2(P.tx, P.tz)]);
    }
  }
  buildBridges(seg, S, T, st, wd, tA, tB);
}

// ---- Bridges: stone arches for lanes, streets and the King's road; timber for paths and tracks ----
function buildBridges(seg, S, T, st, wd, tA, tB) {
  const f = seg.flags, n = S.n;
  let q = 0;
  while (q < n) {
    if (f[q] !== 1) { q++; continue; }
    let e = q; while (e + 1 < n && f[e + 1] === 1) e++;
    const d0 = Math.max(tA, q > 0 ? (S.L[q - 1] + S.L[q]) * 0.5 : 0), d1 = Math.min(S.len - tB, e < n - 1 ? (S.L[e] + S.L[e + 1]) * 0.5 : S.len);
    if (d1 - d0 > 2) { if (T.stone) stoneBridge(seg, S, T, st, d0, d1, tA, tB); else timberBridge(seg, S, T, wd, d0, d1, tA, tB); }
    q = e + 1;
  }
}
function stoneBridge(seg, S, T, st, d0, d1, tA, tB) {
  const hw = T.w / 2, W2 = hw + 0.4, zr = zrank(T), H = D.Terrain.hAt;
  const Ls = d1 - d0, k = Math.max(1, Math.round(Ls / 15)), span = Ls / k;
  const ph = D.clamp(span * 0.09, 0.6, 1.5);
  const deck = d => profAt(seg, d) + zr;
  const side = (P, lat, y) => [P.x - P.tz * lat, y, P.z + P.tx * lat];
  const springs = [];
  for (let j = 0; j < k; j++) {
    const a0 = d0 + j * span + (j > 0 ? ph : 0), a1 = d0 + (j + 1) * span - (j < k - 1 ? ph : 0), cs = a1 - a0;
    if (cs < 1) { springs.push(deck(a0) - 1.5); continue; }
    let minDeck = 1e9, base = -1e9, bedMin = 1e9;
    for (let s = 0; s <= 8; s++) {
      const d = a0 + cs * s / 8, P = pointAt(seg, d);
      minDeck = Math.min(minDeck, deck(d));
      bedMin = Math.min(bedMin, H(P.x, P.z));
      base = Math.max(base, D.Terrain.waterAt(P.x, P.z));
    }
    base = Math.max(base, bedMin) + 0.4;
    const crown = minDeck - 1.1;
    let rise = Math.min(cs / 2, crown - base);
    if (rise < 0.8) rise = Math.min(0.8, cs / 2);
    const spring = crown - rise;
    springs.push(spring);
    const intr = d => { const u = D.clamp((d - a0) / cs, 0, 1), v = 2 * u - 1; return spring + rise * Math.sqrt(Math.max(0, 1 - v * v)); };
    const steps = Math.max(6, Math.ceil(cs / 0.8));
    let prev = null;
    for (let s = 0; s <= steps; s++) {
      const d = a0 + cs * s / steps, P = pointAt(seg, d), top = deck(d) + 0.05, bot = intr(d);
      const row = { P, d, bot, L: side(P, -W2, top), Lb: side(P, -W2, bot), R: side(P, W2, top), Rb: side(P, W2, bot) };
      if (prev) {
        quad(st, prev.L, row.L, prev.Lb, row.Lb, [P.tz, 0, -P.tx]);     // spandrel, -lat face
        quad(st, prev.R, row.R, prev.Rb, row.Rb, [-P.tz, 0, P.tx]);     // spandrel, +lat face
        const sl = (row.bot - prev.bot) / Math.max(0.05, row.d - prev.d), nl = Math.hypot(sl, 1);
        quad(st, prev.Lb, row.Lb, prev.Rb, row.Rb, [P.tx * sl / nl, -1 / nl, P.tz * sl / nl]);   // soffit
      }
      prev = row;
    }
  }
  // piers with cutwaters between the arches
  for (let j = 1; j < k; j++) {
    const dc = d0 + j * span, P = pointAt(seg, dc), rot = Math.atan2(P.tx, P.tz);
    const bed = Math.min(H(P.x, P.z), H(P.x - P.tz * W2, P.z + P.tx * W2), H(P.x + P.tz * W2, P.z - P.tx * W2)) - 2;
    const top = deck(dc) - 0.02;
    boxAt(st, P.x, bed, P.z, 2 * W2, top - bed, 2 * ph, rot);
    const cwTop = Math.max(bed + 1, Math.min(springs[j - 1], springs[j]) + 0.6);
    const s2 = ph * 1.41;
    for (const sd of [-1, 1]) {
      const c = side(P, sd * W2, 0);
      boxAt(st, c[0], bed, c[2], s2, cwTop - bed, s2, rot + Math.PI / 4);
    }
  }
  // abutments / wing walls at both ends
  for (const [dEnd, dir] of [[d0, -1], [d1, 1]]) {
    const dc = D.clamp(dEnd + dir * 0.9, tA, S.len - tB), P = pointAt(seg, dc), rot = Math.atan2(P.tx, P.tz);
    const bed = Math.min(H(P.x, P.z), H(P.x - P.tz * W2, P.z + P.tx * W2), H(P.x + P.tz * W2, P.z - P.tx * W2)) - 2;
    const top = deck(dc) - 0.02;
    if (top - bed > 0.5) boxAt(st, P.x, bed, P.z, 2 * W2, top - bed, 2.4, rot);
  }
  // parapets (they replace railings), running a little onto the approaches
  const pa0 = Math.max(tA, d0 - 3), pa1 = Math.min(S.len - tB, d1 + 3);
  const steps = Math.max(2, Math.ceil((pa1 - pa0) / 1.0));
  const ph2 = 0.9 + dyAt(T, hw);
  for (const sd of [-1, 1]) {
    let prev = null;
    for (let s = 0; s <= steps; s++) {
      const d = pa0 + (pa1 - pa0) * s / steps, P = pointAt(seg, d), y = deck(d);
      const row = {
        ib: side(P, sd * hw, y + dyAt(T, hw) - 0.02), it: side(P, sd * hw, y + ph2),
        ob: side(P, sd * W2, y - 0.35), ot: side(P, sd * W2, y + ph2), P
      };
      const out = [-P.tz * sd, 0, P.tx * sd];
      if (prev) {
        quad(st, prev.it, row.it, prev.ib, row.ib, [-out[0], 0, -out[2]]);   // inner face
        quad(st, prev.ot, row.ot, prev.ob, row.ob, out);                   // outer face
        quad(st, prev.it, row.it, prev.ot, row.ot, [0, 1, 0]);             // coping
      } else quad(st, row.it, row.ot, row.ib, row.ob, [-P.tx, 0, -P.tz]);  // end cap
      prev = row;
    }
    const P = prev.P; quad(st, prev.it, prev.ot, prev.ib, prev.ob, [P.tx, 0, P.tz]);
  }
}
function timberBridge(seg, S, T, wd, d0, d1, tA, tB) {
  const hw = T.w / 2, zr = zrank(T), H = D.Terrain.hAt;
  const a0 = Math.max(tA, d0 - 1), a1 = Math.min(S.len - tB, d1 + 1), L = a1 - a0;
  if (L < 1) return;
  const nb = Math.max(1, Math.round(L / 4)), sp = L / nb;
  const sidePt = (P, lat) => [P.x - P.tz * lat, P.z + P.tx * lat];
  for (let i = 0; i <= nb; i++) {
    const d = a0 + sp * i, P = pointAt(seg, d), y = profAt(seg, d) + zr, rot = Math.atan2(P.tx, P.tz);
    for (const s of [-1, 1]) {               // trestle posts down to the bed
      const [px, pz] = sidePt(P, s * (hw - 0.25)), g = H(px, pz) - 0.6, top = y - 0.45;
      if (top - g > 0.3) boxAt(wd, px, g, pz, 0.3, top - g, 0.3, rot);
    }
    boxAt(wd, P.x, y - 0.8, P.z, T.w + 0.3, 0.32, 0.32, rot);           // cap beam
    for (const s of [-1, 1]) { const [px, pz] = sidePt(P, s * (hw + 0.08)); boxAt(wd, px, y - 0.2, pz, 0.12, 1.25, 0.12, rot); }
    if (i < nb) {
      const dm = d + sp / 2, Pm = pointAt(seg, dm), ym = profAt(seg, dm) + zr, rm = Math.atan2(Pm.tx, Pm.tz);
      const pitch = Math.atan((profAt(seg, d + sp) - profAt(seg, d)) / sp);
      boxAt(wd, Pm.x, ym - 0.47, Pm.z, T.w + 0.2, 0.45, sp + 0.04, rm, pitch);   // plank deck body
      for (const s of [-1, 1]) { const [px, pz] = sidePt(Pm, s * (hw + 0.08)); boxAt(wd, px, ym + 0.92, pz, 0.1, 0.1, sp, rm, pitch); }
    }
  }
}

// ---- Node shapes -----------------------------------------------------------------------------------
function buildJunction(n, L, road) {
  const WT = L.wide.T, typ = WT.rank, re = WT.w / 2;
  const c = vpush(road, L.center[0], L.center[2] + 0.01, L.center[1], 0, 1, 0, 0, 0, K_PATCH, typ, re);
  const ring = L.ring.map(p => vpush(road, p[0], p[2] + 0.01, p[1], 0, 1, 0, 0, 0, K_PATCH, typ, re));
  const m = ring.length;
  for (let k = 0; k < m; k++) road.idx.push(c, ring[(k + 1) % m], ring[k]);
  const ck = WT.margin ? K_PATCHFLAG : WT.shoulder ? K_SHOULDER : K_PATCH;
  for (const cr of L.corners) {
    if (!cr.flat) {
      const I = cr.inner.map(p => vpush(road, p[0], p[2] + 0.01, p[1], 0, 1, 0, 0, 0, ck, typ, re));
      const O = cr.outer.map(p => vpush(road, p[0], p[2] + 0.01, p[1], 0, 1, 0, 0, 0, ck, typ, re));
      for (let k = 0; k < I.length - 1; k++) road.idx.push(I[k], I[k + 1], O[k], O[k], I[k + 1], O[k + 1]);
    }
    // verge skirt 0.6 m out and 0.8 m down along the outer fillet
    const O = [], Sk = [];
    for (const p of cr.outer) {
      let rx = p[0] - n.x, rz = p[1] - n.z; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const nl = Math.hypot(0.8, 0.6);
      O.push(vpush(road, p[0], p[2] + 0.01, p[1], rx * 0.8 / nl, 0.6 / nl, rz * 0.8 / nl, 0, 0, ck, typ, re));
      Sk.push(vpush(road, p[0] + rx * 0.6, p[2] - 0.8, p[1] + rz * 0.6, rx * 0.8 / nl, 0.6 / nl, rz * 0.8 / nl, 0, 0, ck, typ, re));
    }
    for (let k = 0; k < O.length - 1; k++) road.idx.push(O[k], O[k + 1], Sk[k], Sk[k], O[k + 1], Sk[k + 1]);
  }
}
// width change between two types: lerp the section points across a short strip
function buildTaper(n, L, road) {
  const [a0, a1] = L.arms;
  const wide = a0.T.w >= a1.T.w ? a0 : a1, sec = SECTIONS[wide.T.id], outerW = Math.abs(sec[0][0]);
  const endOf = (arm, arriving) => {
    const t = (arm.atA ? arm.seg._tA : arm.seg._tB) || 0, d = arm.atA ? t : arm.len - t, P = pointAt(arm.seg, d);
    const ox = arm.atA ? P.tx : -P.tx, oz = arm.atA ? P.tz : -P.tz;
    const tx = arriving ? -ox : ox, tz = arriving ? -oz : oz;   // through direction a0 -> node -> a1
    const oW = Math.abs(SECTIONS[arm.T.id][0][0]);
    return { x: P.x, z: P.z, tx, tz, y: profAt(arm.seg, d) + zrank(arm.T), T: arm.T, oW };
  };
  const E0 = endOf(a0, true), E1 = endOf(a1, false);
  const len = Math.hypot(E1.x - E0.x, E1.z - E0.z), STEPS = 4;
  const typ = wide.T.rank;
  let prev = null;
  for (let s = 0; s <= STEPS; s++) {
    const u = s / STEPS;
    const x = E0.x + (E1.x - E0.x) * u, z = E0.z + (E1.z - E0.z) * u, y = E0.y + (E1.y - E0.y) * u;
    let tx = E0.tx + (E1.tx - E0.tx) * u, tz = E0.tz + (E1.tz - E0.tz) * u; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const hw = E0.T.w / 2 + (E1.T.w / 2 - E0.T.w / 2) * u;
    const row = sec.map(col => {
      const f = col[0] / outerW;
      const l0 = f * E0.oW, l1 = f * E1.oW, lat = l0 + (l1 - l0) * u;
      const dy = (Math.abs(l0) > E0.T.w / 2 + 1e-3 ? col[1] : dyAt(E0.T, l0)) * (1 - u) + (Math.abs(l1) > E1.T.w / 2 + 1e-3 ? col[1] : dyAt(E1.T, l1)) * u;
      return vpush(road, x - tz * lat, y + dy, z + tx * lat, 0, 1, 0, lat, len * u, col[2], typ, hw);
    });
    if (prev) for (let k = 0; k < row.length - 1; k++) road.idx.push(prev[k], prev[k + 1], row[k], prev[k + 1], row[k + 1], row[k]);
    prev = row;
  }
}
// dead end: a semicircular cap and skirt
function buildCap(n, L, road) {
  const arm = L.arms[0], T = arm.T, typ = T.rank, ho = arm.ho;
  const d = arm.atA ? 0 : arm.len, P = pointAt(arm.seg, d), y = profAt(arm.seg, d) + zrank(T);
  const bx = arm.atA ? -P.tx : P.tx, bz = arm.atA ? -P.tz : P.tz;   // pointing out of the road
  const a0 = Math.atan2(bz, bx) - Math.PI / 2;
  const c = vpush(road, P.x, y + dyAt(T, 0), P.z, 0, 1, 0, 0, d, K_PATCH, typ, T.w / 2);
  const ring = [], skirt = [];
  const nl = Math.hypot(0.8, 0.6);
  for (let k = 0; k <= 8; k++) {
    const a = a0 + Math.PI * k / 8, cx = Math.cos(a), cz = Math.sin(a);
    ring.push(vpush(road, P.x + cx * ho, y + dyAt(T, ho), P.z + cz * ho, 0, 1, 0, 0, d, K_PATCH, typ, T.w / 2));
    skirt.push(vpush(road, P.x + cx * (ho + 0.6), y + dyAt(T, ho) - 0.8, P.z + cz * (ho + 0.6), cx * 0.8 / nl, 0.6 / nl, cz * 0.8 / nl, 0, d, K_PATCH, typ, T.w / 2));
  }
  for (let k = 0; k < 8; k++) {
    road.idx.push(c, ring[k + 1], ring[k]);
    road.idx.push(ring[k], ring[k + 1], skirt[k], skirt[k], ring[k + 1], skirt[k + 1]);
  }
}

// ---- Materials --------------------------------------------------------------------------------------
const RU = {
  uNightR: { value: 0 }, uWetR: { value: 0 }, uCamR: { value: new THREE.Vector3() },
  uTimeR: { value: 0 }, uSnowR: { value: 0 }, uSeasonR: { value: new THREE.Vector4(0, 1, 0, 0) },
  uPull: { value: new THREE.Vector4(0.03, 0.0005, 3000, 0.004) }
};
const PULL_VERT = `
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    float dcP = length(mvPosition.xyz);
    float pullP = uPull.x + dcP * uPull.y + max(dcP - uPull.z, 0.0) * uPull.w;
    mvPosition.xyz *= 1.0 - min(pullP, dcP * 0.25) / max(dcP, 1e-3);
    gl_Position = projectionMatrix * mvPosition;`;
function checkShader(sh, markers, name) {
  for (const m of markers) {
    const ok = sh.vertexShader.includes(m) || sh.fragmentShader.includes(m);
    console.assert(ok, `roads: ${name} shader injection failed (${m})`);
  }
}
function roadMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, RU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 rd; attribute float re; varying vec4 vRd; varying float vRe; varying vec3 vWPr;\nuniform vec4 uPull;`)
      .replace('#include <project_vertex>', PULL_VERT)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvRd = rd; vRe = re; vWPr = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNightR, uWetR, uTimeR, uSnowR; uniform vec3 uCamR; uniform vec4 uSeasonR;
varying vec4 vRd; varying float vRe; varying vec3 vWPr;
float R_rough; vec3 R_emis;
${D.GLSL_NOISE}
vec3 r_seas(vec3 a, vec3 b, vec3 c, vec3 d){ return a * uSeasonR.x + b * uSeasonR.y + c * uSeasonR.z + d * uSeasonR.w; }
vec3 r_cobble(vec2 uv, float fine, float mid, out float joint){
  vec2 cc = vec2(uv.x / 0.28, uv.y / 0.36); cc.y += floor(cc.x) * 0.5;
  vec2 f = fract(cc), id = floor(cc);
  float e = min(min(f.x, 1.0 - f.x) * 0.28, min(f.y, 1.0 - f.y) * 0.36);
  float stone = smoothstep(0.012, 0.045, e);
  joint = (1.0 - stone) * fine;
  vec3 sc = mix(vec3(.46,.43,.38), vec3(.46,.43,.38) * (0.8 + 0.4 * d_hash12(id)) * (0.9 + 0.1 * smoothstep(0.0, 0.1, e)), fine);
  vec3 c = mix(vec3(.17,.15,.12), sc, mix(0.82, stone, fine));
  return mix(vec3(.40,.37,.33), c, mid);
}
vec3 roadCol(){
  float lat = vRd.x, along = vRd.y, kind = vRd.z, typ = vRd.w;
  // derivatives first, in uniform control flow
  float fwA = fwidth(along), fwL = fwidth(lat);
  vec2 fwW = fwidth(vWPr.xz);
  float bridge = step(50.0, vRe), hw = vRe - bridge * 100.0;
  bool isPatch = kind > 5.5;
  vec2 uv = isPatch ? vWPr.xz : vec2(along, lat);
  float px = isPatch ? max(fwW.x, fwW.y) : max(fwA, fwL);
  float fine = 1.0 - smoothstep(0.03, 0.12, px);
  float mid = 1.0 - smoothstep(0.2, 0.8, px);
  float al = isPatch ? 0.0 : abs(lat);
  float n = d_vnoise(vWPr.xz * 0.9) * 0.5 + d_vnoise(vWPr.xz * 3.7) * 0.5;
  float n2 = d_vnoise(vWPr.xz * 0.23);
  vec3 grass = r_seas(vec3(.36,.50,.22), vec3(.32,.44,.19), vec3(.46,.44,.24), vec3(.42,.42,.33));
  vec3 c; R_rough = 0.92; R_emis = vec3(0.0);
  float joint = 0.0, stoneS = 0.0, rut = 0.0;
  float verge = isPatch ? 0.0 : smoothstep(hw - 0.05, hw + 0.25, al);
  float surf = typ < 0.5 ? 0.0 : typ < 1.5 ? 1.0 : typ < 3.5 ? 2.0 : 3.0;
  if (bridge > 0.5 && surf < 1.5) {                           // timber deck planks
    float pl = along / 0.32, f = fract(pl), id = floor(pl);
    c = vec3(.42,.31,.20) * (0.8 + 0.35 * d_hash12(vec2(id, 7.0))) * (0.92 + 0.12 * d_vnoise(vec2(lat * 3.0, id)));
    c = mix(c, vec3(.13,.10,.07), (1.0 - smoothstep(0.04, 0.1, min(f, 1.0 - f))) * fine);
    c = mix(vec3(.38,.28,.19), c, mid);
    R_rough = 0.85;
  } else if ((kind > 0.5 && kind < 1.5) || kind > 6.5) {   // flagstone margins 0.9 x 0.6 m
    vec2 q = kind > 6.5 ? uv / vec2(0.9, 0.6) : vec2(along / 0.9, al / 0.6);
    q.x += floor(q.y) * 0.5;
    vec2 f = fract(q), id = floor(q);
    float e = min(min(f.x, 1.0 - f.x) * 0.9, min(f.y, 1.0 - f.y) * 0.6);
    joint = (1.0 - smoothstep(0.015, 0.05, e)) * fine;
    vec3 sc = vec3(.60,.57,.51) * mix(1.0, 0.85 + 0.25 * d_hash12(id + 3.0), fine);
    c = mix(sc, vec3(.28,.26,.23), joint);
    c = mix(vec3(.55,.52,.47), c, mid);
    stoneS = 1.0; R_rough = 0.8;
  } else if (kind > 3.5 && kind < 4.5) {                    // dirt shoulders
    c = vec3(.45,.36,.25) * (0.82 + 0.3 * n);
  } else if (surf < 0.5) {                                   // footpath: patchy dirt into grass
    c = vec3(.47,.38,.26) * (0.8 + 0.35 * n);
    float g = smoothstep(0.35, 0.95, al / max(hw, 0.1) + (n2 - 0.5) * 0.8 + (n - 0.5) * 0.3);
    c = mix(c, grass * (0.9 + 0.2 * n), g);
  } else if (surf < 1.5) {                                   // dirt track: ruts, grass crown
    c = vec3(.42,.33,.22) * (0.8 + 0.35 * n);
    rut = isPatch ? 0.0 : (1.0 - smoothstep(0.08, 0.26, abs(al - 1.1)));
    c *= 1.0 - rut * 0.18;
    float crown = isPatch ? 0.0 : (1.0 - smoothstep(0.25, 0.45, al)) * smoothstep(0.3, 0.7, n + 0.2);
    c = mix(c, grass * 0.9, crown * 0.75);
  } else if (surf < 2.5) {                                   // cobbles
    c = r_cobble(uv, fine, mid, joint);
    stoneS = 1.0; R_rough = 0.78;
  } else {                                                   // gravel King's road
    float h1 = d_hash12(floor(vWPr.xz * 8.0)), h2 = d_hash12(floor(vWPr.xz * 15.0) + 3.0);
    c = vec3(.58,.54,.46) * (0.86 + 0.24 * n);
    c = mix(c, vec3(.74,.70,.62), step(0.8, h1) * fine);
    c = mix(c, vec3(.34,.31,.27), step(0.85, h2) * fine);
    rut = isPatch ? 0.0 : (1.0 - smoothstep(0.2, 0.6, abs(al - 1.6)));
    c *= 1.0 - rut * 0.08;
  }
  if (verge > 0.001) c = mix(c, mix(vec3(.40,.33,.23) * (0.85 + 0.3 * n), grass, smoothstep(0.2, 0.7, n2 + 0.2)), verge);
  // wet: stones take a sheen and their joints darken; dirt goes to mud and the ruts hold puddles
  if (uWetR > 0.01) {
    c *= 1.0 - uWetR * (0.22 + 0.25 * joint);
    R_rough = mix(R_rough, 0.3, uWetR * stoneS * (1.0 - joint));
    float mud = (surf < 1.5 && bridge < 0.5) ? 1.0 : 0.0;
    c = mix(c, c * vec3(0.72, 0.68, 0.64), uWetR * mud * 0.6);
    R_rough = mix(R_rough, 0.12, uWetR * mud * rut);
  }
  // snow settles, less in the ruts and wheel tracks
  if (uSnowR > 0.01) {
    float s = clamp(uSnowR * 1.1 - rut * 0.5 + (n - 0.5) * 0.4 - (1.0 - verge) * 0.12, 0.0, 1.0);
    c = mix(c, vec3(.92,.93,.96), smoothstep(0.2, 0.7, s));
  }
  // night: warm lantern pools on cobbled streets (38 m, alternating sides)
  if (uNightR > 0.01 && typ > 2.5 && typ < 3.5 && !isPatch) {
    float k = floor(along / 38.0);
    float ph = (fract(along / 38.0) - 0.5) * 38.0;
    float sd = mod(k, 2.0) < 1.0 ? -1.0 : 1.0;
    float dl = lat - sd * (hw - 1.0);
    float pool = exp(-(ph * ph + dl * dl) / 32.0);
    float fl = 0.9 + 0.1 * sin(uTimeR * 9.0 + k * 3.1);
    R_emis = vec3(1.0, 0.62, 0.3) * pool * fl * uNightR * 0.16;
  }
  return pow(max(c, vec3(0.0)), vec3(2.2));
}`)
      .replace('#include <color_fragment>', `diffuseColor.rgb = roadCol();`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = R_rough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += R_emis;`);
    checkShader(sh, ['uniform vec4 uPull', 'dcP', 'vRd = rd', 'roadCol()', 'roughnessFactor = R_rough', 'totalEmissiveRadiance += R_emis'], 'road');
  };
  m.customProgramCacheKey = () => 'dio-road-medieval';
  return m;
}
// ashlar blocks (0.6 x 0.3 m) projected in world space
function stoneMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uPull = RU.uPull; sh.uniforms.uWetR = RU.uWetR; sh.uniforms.uSnowR = RU.uSnowR;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uPull; varying vec3 vWPs; varying vec3 vWNs;`)
      .replace('#include <project_vertex>', PULL_VERT)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWPs = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNs = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWetR, uSnowR; varying vec3 vWPs; varying vec3 vWNs;
float S_rough;
${D.GLSL_NOISE}
vec3 ashlar(){
  vec3 p = vWPs, nw = normalize(vWNs);
  float px = max(max(fwidth(p.x), fwidth(p.z)), fwidth(p.y));
  vec3 an = abs(nw);
  vec2 uv = an.y > 0.7 ? p.xz : (an.x > an.z ? vec2(p.z, p.y) : vec2(p.x, p.y));
  vec2 q = uv / vec2(0.6, 0.3); q.x += floor(q.y) * 0.5;
  vec2 f = fract(q), id = floor(q);
  float e = min(min(f.x, 1.0 - f.x) * 0.6, min(f.y, 1.0 - f.y) * 0.3);
  float fine = 1.0 - smoothstep(0.02, 0.09, px);
  float mortar = (1.0 - smoothstep(0.012, 0.035, e)) * fine;
  vec3 blk = vec3(.62,.58,.51) * mix(1.0, 0.82 + 0.3 * d_hash12(id), fine) * (0.9 + 0.18 * d_vnoise(p.xz * 0.35 + p.y * 0.21));
  vec3 c = mix(blk, vec3(.36,.34,.30), mortar * 0.85);
  c *= 1.0 - uWetR * (0.25 + 0.2 * mortar);
  S_rough = mix(0.92, 0.45, uWetR * (1.0 - mortar));
  if (uSnowR > 0.01) c = mix(c, vec3(.92,.93,.96), smoothstep(0.6, 0.9, nw.y) * uSnowR);
  return pow(c, vec3(2.2));
}`)
      .replace('#include <color_fragment>', `diffuseColor.rgb = ashlar();`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = S_rough;`);
    checkShader(sh, ['dcP', 'vWNs = normalize', 'diffuseColor.rgb = ashlar()', 'roughnessFactor = S_rough'], 'bridge stone');
  };
  m.customProgramCacheKey = () => 'dio-road-stone';
  return m;
}
function woodMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: D.lin(0x6a5038), roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uPull = RU.uPull;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uPull;`)
      .replace('#include <project_vertex>', PULL_VERT);
    checkShader(sh, ['uniform vec4 uPull', 'dcP'], 'bridge timber');
  };
  m.customProgramCacheKey = () => 'dio-road-wood';
  return m;
}

// ---- Init / rebuild ------------------------------------------------------------------------------
R.init = function (scene) {
  R.scene = scene;
  R.mat = roadMaterial();
  R.structMat = stoneMaterial();
  R.woodMat = woodMaterial();
  R.group = new THREE.Group(); scene.add(R.group);
  D.History.regObj('roads', { save: R.serialize, load: s => { R.deserialize(s); } });
  D.on('restored', () => { R.dirty = true; });
  D.on('world:reset', R.reset);
  // preview ghost
  R.ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x31a8ff, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide }));
  R.ghost.renderOrder = 25; R.ghost.frustumCulled = false; R.ghost.visible = false;
  scene.add(R.ghost);
  window.addEventListener('keydown', e => { if (e.key === 'Alt') R._alt = true; });
  window.addEventListener('keyup', e => { if (e.key === 'Alt') R._alt = false; });
  window.addEventListener('blur', () => { R._alt = false; });
};
R.reset = function () {
  R.nodes.clear(); R.segs.clear(); R.draft = null; hash = new Map(); nhash.clear();
  R._rmaxAll = 0; R.dirty = true; R.version++;
};
R.clearAll = function () {
  D.History.begin('Clear Roads', 'trash'); D.History.touchObj('roads');
  R.reset(); D.emit('roads:changed', []); D.History.end();
};

let rebuildT = 0;
R.update = function (dt, camera) {
  RU.uNightR.value = D.Env.night;
  RU.uWetR.value = D.TU.uWet.value;
  RU.uSnowR.value = D.TU.uSnow.value;
  RU.uTimeR.value = D.TU.uTime.value;
  RU.uSeasonR.value.copy(D.TU.uSeason.value);
  RU.uCamR.value.copy(camera.position);
  RU.uPull.value.z = (D.Q.high ? 1350 : 800) * 2.5 * 0.9;
  rebuildT -= dt;
  if (R.dirty && rebuildT <= 0) { R.dirty = false; rebuildT = 0.05; rebuild(); }
  const vis = D.Layers ? D.Layers.visible('roads') : true;
  R.group.visible = vis;
};
function rebuild() {
  R.segs.forEach(seg => { seg._s = null; seg._cb = null; seg._hr = null; });
  rehash();
  layoutAll();
  while (R.group.children.length) {
    const m = R.group.children.pop();
    if (m.geometry) m.geometry.dispose();
    if (m.isInstancedMesh) m.dispose();
  }
  if (!R.segs.size) { D.emit('roads:rebuilt'); if (D.UI && D.UI.navDirty) D.UI.navDirty(); return; }
  const G = buildGeometry();
  if (G.road.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.road.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.road.nor, 3));
    g.setAttribute('rd', new THREE.Float32BufferAttribute(G.road.rd, 4));
    g.setAttribute('re', new THREE.Float32BufferAttribute(G.road.re, 1));
    g.setIndex(G.road.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, R.mat); m.receiveShadow = true;
    R.group.add(m);
  }
  for (const [buf, mat] of [[G.st, R.structMat], [G.wd, R.woodMat]]) {
    if (!buf.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    R.group.add(m);
  }
  const inst = (list, geoId, scale, colHex) => {
    if (!list.length || !geoId) return;
    let geo;
    try { geo = D.Nature.makeGeo(geoId, false); } catch (e) { geo = null; }
    if (!geo) return;
    const im = new THREE.InstancedMesh(geo, D.Nature.mat, list.length);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(scale, scale, scale), p = new THREE.Vector3();
    const c = D.lin(colHex);
    list.forEach((L, i) => {
      q.setFromAxisAngle(THREE.Object3D.DefaultUp, L[3]); p.set(L[0], L[1], L[2]);
      m4.compose(p, q, s); im.setMatrixAt(i, m4);
      const v = 0.85 + ((i * 0.618) % 1) * 0.3;
      im.instanceColor.setXYZ(i, c.r * v, c.g * v, c.b * v);
    });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    R.group.add(im);
  };
  const SPI = (D.Nature && D.Nature.SP_INDEX) || {};
  inst(G.lamps, SPI.lantern !== undefined ? 'lantern' : 'streetlight', 1, 0x3a3430);
  inst(G.crosses, SPI.waycross !== undefined ? 'waycross' : null, 1, 0x9a948a);
  D.emit('roads:rebuilt');
  if (D.UI && D.UI.navDirty) D.UI.navDirty();
}
R.rebuildNow = rebuild;

// ---- Save / load ----------------------------------------------------------------------------------
R.serialize = function () {
  const nodes = [], segs = [];
  R.nodes.forEach(n => nodes.push([n.id, n.x, n.z, n.y]));
  // copies: history snapshots must never share arrays with the live network
  R.segs.forEach(s => segs.push({ id: s.id, a: s.a, b: s.b, t: s.type, c1: s.c1.slice(), c2: s.c2.slice(), p: s.prof.slice(), f: s.flags.slice(), d: s.dr ? 1 : 0, m: 1 }));
  return { v: 2, nodes, segs, next: R.nextId };
};
// v1 roads: map the modern types onto medieval ones, drop railways, turn tunnels into cuttings
function migrateSeg(seg) {
  const f = seg.flags; if (!f.some(v => v === 2)) return;
  const S = ensureS(seg), T = typeOf(seg.type), r = seg.prof.slice(), fl = new Uint8Array(f.length);
  for (let q = 0; q < S.n; q++) { fl[q] = f[q] === 2 ? 0 : f[q]; if (f[q] === 2) r[q] = D.Terrain.hAt(S.x[q], S.z[q]) + 0.05; }
  const maxD = T.grade * S.len / Math.max(1, S.n - 1);
  for (let q = 1; q < S.n - 1; q++) r[q] = Math.max(r[q], r[q - 1] - maxD);
  for (let q = S.n - 2; q > 0; q--) r[q] = Math.max(r[q], r[q + 1] - maxD);
  setProf(seg, r, fl);
}
R.deserialize = function (d) {
  R.nodes.clear(); R.segs.clear(); nhash.clear(); hash = new Map(); R.draft = null;
  if (d && d.nodes && d.segs) {
    const legacy = !(d.v >= 2);
    d.nodes.forEach(([id, x, z, y]) => R.nodes.set(id, { id, x, z, y, segs: [] }));
    let maxId = 0;
    d.segs.forEach(s => {
      let t = s.t;
      const isNew = !legacy || s.m;
      if (!isNew) { if (t === 'rail') return; t = LEGACY[t] || 'track'; }
      else if (!TYPES[t]) t = LEGACY[t] || 'track';
      if (!R.nodes.has(s.a) || !R.nodes.has(s.b) || s.a === s.b) return;
      const seg = { id: s.id, a: s.a, b: s.b, type: t, c1: Array.from(s.c1), c2: Array.from(s.c2), prof: new Float32Array(s.p), flags: new Uint8Array(s.f), dr: s.d ? 1 : (!isNew && TYPES[t].drape ? 1 : 0) };
      if (s.d === undefined && isNew) seg.dr = TYPES[t].drape ? 1 : 0;
      link(seg);
      if (seg.prof.length !== ensureS(seg).n) { // sampling changed: stretch the stored profile
        resampleProf(seg, seg.prof.length ? seg.prof : new Float32Array([R.nodes.get(seg.a).y, R.nodes.get(seg.b).y]), seg.flags.length ? seg.flags : new Uint8Array(2));
      }
      if (!isNew) migrateSeg(seg);
      maxId = Math.max(maxId, seg.id, seg.a, seg.b);
    });
    // drop orphan nodes (railway stations and the like)
    Array.from(R.nodes.values()).forEach(n => { if (!n.segs.length) R.nodes.delete(n.id); });
    R.nextId = Math.max(R.nextId, d.next || 1, maxId + 1);
  }
  rebuildNodeHash();
  rehash();
  R.dirty = true; R.version++;
  layoutAll();
  D.emit('roads:changed', null);
};

// Navigator
R.drawNav = function (ctx, S) {
  R.segs.forEach(seg => {
    const s = ensureS(seg), T = typeOf(seg.type);
    ctx.strokeStyle = T.col;
    ctx.lineWidth = Math.max(T.id === 'footpath' ? 0.5 : 0.8, T.w / SIZE * S * 3);
    ctx.beginPath();
    for (let q = 0; q < s.n; q += 2) { const x = s.x[q] / SIZE * S, z = s.z[q] / SIZE * S; q ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }
    ctx.lineTo(s.x[s.n - 1] / SIZE * S, s.z[s.n - 1] / SIZE * S);
    ctx.stroke();
  });
};

// ---- Tools --------------------------------------------------------------------------------------------
D.toolDefs = D.toolDefs || [];
function ghostRibbon(a, c1, c2, b, w, ok) {
  const S = sampleCurve(a, c1, c2, b, 6);
  const pos = [], idx = [];
  for (let q = 0; q < S.n; q++) {
    const x = S.x[q], z = S.z[q];
    const g = Math.max(D.Terrain.hAt(x, z), D.Terrain.waterAt(x, z)) + 0.4;
    pos.push(x - S.tz[q] * w / 2, g, z + S.tx[q] * w / 2, x + S.tz[q] * w / 2, g, z - S.tx[q] * w / 2);
    if (q) { const b0 = (q - 1) * 2; idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  R.ghost.geometry.dispose();
  R.ghost.geometry = g;
  R.ghost.material.color.setHex(ok ? 0x31a8ff : 0xff5a4a);
  R.ghost.visible = true;
  return S;
}
// outward direction of a dead end
function nodeDir(nid) {
  const n = R.nodes.get(nid);
  if (!n || n.segs.length !== 1) return null;
  const seg = R.segs.get(n.segs[0]), S = ensureS(seg);
  return seg.b === nid ? [S.tx[S.n - 1], S.tz[S.n - 1]] : [-S.tx[0], -S.tz[0]];
}
// at a junction start, continue the one arm that runs (within 10°) straight into the new road
function straightThrough(nid, cx, cz) {
  const n = R.nodes.get(nid); if (!n || n.segs.length < 2) return null;
  let found = null, cnt = 0;
  const lim = Math.cos(10 * DEG);
  for (const id of n.segs) {
    const s = R.segs.get(id), S = ensureS(s);
    const arr = s.b === nid ? [S.tx[S.n - 1], S.tz[S.n - 1]] : [-S.tx[0], -S.tz[0]];   // arriving direction
    if (arr[0] * cx + arr[1] * cz > lim) { found = arr; cnt++; }
  }
  return cnt === 1 ? found : null;
}
function curveFor(start, end, straight) {
  const a = [start.x, start.z], b = [end.x, end.z];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, cx = dx / L, cz = dz / L;
  let c1 = [a[0] + dx / 3, a[1] + dz / 3], c2 = [a[0] + dx * 2 / 3, a[1] + dz * 2 / 3];
  if (straight) return { a, b, c1, c2, len: L };
  let sd = R.draft && R.draft.dir ? R.draft.dir : null;
  if (!sd && start.node) sd = straightThrough(start.node, cx, cz);
  // G1 into a dead end we snap to
  let ed = null;
  if (end.node) { const nd = nodeDir(end.node); if (nd && -(nd[0] * cx + nd[1] * cz) > Math.cos(70 * DEG)) ed = nd; }
  const k = L * 0.38;
  if (sd && ed) { c1 = [a[0] + sd[0] * k, a[1] + sd[1] * k]; c2 = [b[0] + ed[0] * k, b[1] + ed[1] * k]; }
  else if (sd) {
    c1 = [a[0] + sd[0] * k, a[1] + sd[1] * k];
    const dot = sd[0] * cx + sd[1] * cz, ex = 2 * dot * cx - sd[0], ez = 2 * dot * cz - sd[1];   // mirrored end tangent: circular-ish arc
    c2 = [b[0] - ex * k, b[1] - ez * k];
  } else if (ed) {
    c2 = [b[0] + ed[0] * k, b[1] + ed[1] * k];
    const te = [-ed[0], -ed[1]], dot = te[0] * cx + te[1] * cz, sx = 2 * dot * cx - te[0], sz = 2 * dot * cz - te[1];
    c1 = [a[0] + sx * k, a[1] + sz * k];
  }
  return { a, b, c1, c2, len: L };
}
function clearGhost() { if (R.ghost) R.ghost.visible = false; D.TU.uBrushOn.value.x = 0; }
function upgradeSeg(id, type, grade) {
  const seg = R.segs.get(id); if (!seg) return [];
  seg.type = type; seg._s = null; seg._cb = null; seg._hr = null;
  profileSeg(seg, { grade });
  clearCorridor(seg);
  const touched = new Set([seg.a, seg.b]);
  tidy(touched);
  rehash();
  R.dirty = true; R.version++;
  layoutAll();
  const live = R.segs.has(seg.id) ? [seg] : [];
  D.emit('roads:changed', live);
  return live;
}
let valCache = { key: '', v: null };
function validateCached(A, B, c1, c2, type) {
  const key = [A.node || 0, A.seg || 0, A.x.toFixed(1), A.z.toFixed(1), B.node || 0, B.seg || 0, B.x.toFixed(1), B.z.toFixed(1), c1[0].toFixed(1), c1[1].toFixed(1), c2[0].toFixed(1), c2[1].toFixed(1), type, R.version].join('|');
  if (valCache.key !== key) valCache = { key, v: R.validate(A, B, c1, c2, type) };
  return valCache.v;
}

D.toolDefs.push({
  id: 'road', name: 'Roads & Paths', key: 'R', group: 'city', icon: 'road', noBrush: true, ownCursor: true, cursor: 'crosshair', layer: 'roads', sort: 1,
  desc: "Lay footpaths, dirt tracks, cobbled lanes and streets and the King's road. They snap together, hug the land, and cross rivers on stone bridges.",
  defaults: { type: 'track', curve: 'curved', grade: true },
  options: [
    { id: 'type', label: 'Type', type: 'select', choices: TYPE_IDS.map(t => [t, TYPES[t].name]) },
    { id: 'curve', type: 'seg', choices: [['curved', 'Curved'], ['straight', 'Straight']] },
    { id: 'grade', label: 'Level terrain', type: 'check' }
  ],
  hint: '<b>Click</b> to start, <b>click</b> again for each segment · <b>Esc</b>/<b>Enter</b> or double-click to finish · <b>Shift</b> straight · <b>Alt</b> no snapping',
  catalogue(grid, item, o) {
    TYPE_IDS.forEach(t => item(TYPES[t].name, EMOJI[t], o.type === t, () => { o.type = t; R.draft = null; clearGhost(); D.emit('opts:values'); }, `${TYPES[t].w} m wide${TYPES[t].drape ? ' · follows the ground' : ''}`));
    return 'Roads & paths';
  },
  down(p, st, o) {
    st.cancel = true;
    if (!TYPES[o.type]) o.type = 'track';
    const now = performance.now();
    const snap = R.snap(p.x, p.z, o.type, st.alt);
    if (R.draft && now - (R._lastClick || 0) < 300 && Math.hypot(snap.x - R.draft.start.x, snap.z - R.draft.start.z) < 8) { R.draft = null; clearGhost(); return; }
    R._lastClick = now;
    if (!R.draft) {
      R.draft = { start: snap, dir: snap.snapped === 'node' ? nodeDir(snap.node) : null };
      return;
    }
    const c = curveFor(R.draft.start, snap, st.shift || o.curve === 'straight');
    const v = R.validate(R.draft.start, snap, c.c1, c.c2, o.type);
    if (!v.ok) { D.toast(v.reason + '.', 'warn'); return; }
    const T = TYPES[o.type];
    D.History.begin((v.upgrade ? 'Upgrade to ' : 'Build ') + T.name, 'road');
    D.History.touchObj('roads');
    const made = v.upgrade ? upgradeSeg(v.upgrade, o.type, o.grade) : R.build(R.draft.start, snap, c.c1, c.c2, o.type, { grade: o.grade });
    D.History.end();
    D.emit('stroke:end');
    if (made && made.length) {
      const last = made[made.length - 1];
      const S = ensureS(last);
      const B = R.nodes.get(last.b);
      R.draft = B ? { start: { node: B.id, x: B.x, z: B.z, snapped: 'node' }, dir: [S.tx[S.n - 1], S.tz[S.n - 1]] } : null;
      if (D.Audio && D.Audio.thunk) D.Audio.thunk();
      if (snap.snapped || v.upgrade) { R.draft = null; clearGhost(); }
    }
  },
  move(hit) {
    const o = D.Tools.o('road');
    if (!TYPES[o.type]) o.type = 'track';
    if (!hit) { clearGhost(); return; }
    const snap = R.snap(hit.x, hit.z, o.type, R._alt);
    const T = TYPES[o.type];
    const U = D.TU;
    U.uBrushOn.value.set(1, snap.snapped ? 0.35 : 0.2, snap.snapped ? 1 : 0.65, snap.snapped ? 0.5 : 1);
    U.uBrush.value.set(snap.x, snap.z, T.w / 2 + (snap.snapped ? 2 : 0), 1);
    if (!R.draft) { R.ghost.visible = false; D.hint(snap.snapped ? `Snap to ${snap.snapped === 'node' ? 'junction' : 'road'}` : null, 0); return; }
    const c = curveFor(R.draft.start, snap, D.Tools.keyShift || o.curve === 'straight');
    const v = validateCached(R.draft.start, snap, c.c1, c.c2, o.type);
    ghostRibbon(c.a, c.c1, c.c2, c.b, T.w, v.ok);
    const y0 = D.Terrain.hAt(c.a[0], c.a[1]), y1 = D.Terrain.hAt(c.b[0], c.b[1]);
    D.hint(`${T.name} · ${c.len.toFixed(0)} m · ${(Math.abs(y1 - y0) / Math.max(1, c.len) * 100).toFixed(0)}% grade${snap.snapped ? ' · <b>snap</b>' : ''}${v.upgrade ? ' · <b>upgrade</b>' : ''}${v.ok ? '' : ` · <b style="color:#ff8a70">${v.reason}</b>`}`, 0);
  },
  cancel() { R.draft = null; clearGhost(); D.hint(null); },
  enter() { R.draft = null; clearGhost(); D.hint(null); },
  leave() { R.draft = null; clearGhost(); D.hint(null); }
});

// snapping for the drawing tool (and Town): nodes beat segments; end zones snap to the end node
R.snap = function (x, z, type, alt) {
  if (alt) return { x, z };
  const T = typeOf(type);
  let best = null, bs = 1e9;
  forNodesNear(x, z, 30, n => {
    if (!n.segs.length) return false;
    const rad = D.clamp(0.6 * T.w + 0.5 * nodeW(n), 12, 30), d = Math.hypot(n.x - x, n.z - z);
    if (d < rad && d / rad < bs) { bs = d / rad; best = n; }
    return false;
  });
  if (best) return { node: best.id, x: best.x, z: best.z, snapped: 'node' };
  let sb = null, sdist = 1e9;
  forSegsNear(x - 30, z - 30, x + 30, z + 30, seg => {
    const wo = typeOf(seg.type).w, lim = wo / 2 + T.w / 2 + 3;
    const r = segDistWithin(seg, x, z, lim);
    if (r && r.d < sdist) { sdist = r.d; sb = { seg, r, wo }; }
    return false;
  });
  if (sb) {
    const S = ensureS(sb.seg), ez = endZone(T.w, sb.wo);
    const endNode = sb.r.dist < ez ? R.nodes.get(sb.seg.a) : sb.r.dist > S.len - ez ? R.nodes.get(sb.seg.b) : null;
    if (endNode) return { node: endNode.id, x: endNode.x, z: endNode.z, snapped: 'node' };
    return { seg: sb.seg.id, dist: sb.r.dist, x: sb.r.x, z: sb.r.z, tx: sb.r.tx, tz: sb.r.tz, snapped: 'seg' };
  }
  let fn = null, fd = 1e9;
  forNodesNear(x, z, 16, n => {
    if (!n.segs.length) return false;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < minSeg(T.w, nodeW(n)) && d < fd) { fd = d; fn = n; }
    return false;
  });
  if (fn) return { node: fn.id, x: fn.x, z: fn.z, snapped: 'node' };
  return { x, z };
};

R.removeSeg = function (seg) {
  if (!seg._bb) rehash();
  const bb = seg._bb;
  unlink(seg);
  if (bb) D.emit('roads:removed', bb);
  [seg.a, seg.b].forEach(dropIfOrphan);
  R.dirty = true; R.version++;
};

D.toolDefs.push({
  id: 'bulldoze', name: 'Bulldoze', key: 'X', group: 'city', icon: 'bulldoze', color: [1, 0.35, 0.3], sort: 2,
  desc: 'Demolish roads, buildings and plants under the brush. Pick what to remove in the options bar.',
  defaults: { size: 24, target: 'all', hardness: 1 },
  options: [{ id: 'size', label: 'Size', type: 'range', min: 4, max: 400, log: true, fmt: v => Math.round(v) + ' m' },
    { id: 'target', type: 'seg', choices: [['all', 'Everything'], ['roads', 'Roads'], ['buildings', 'Buildings'], ['nature', 'Plants']] }],
  hint: '<b>Drag</b> over things to demolish them',
  brushColor() { return [1, 0.35, 0.3]; },
  apply(p, dt, st, o) {
    const r = o.size;
    if ((o.target === 'all' || o.target === 'roads') && !(D.Layers && D.Layers.locked('roads'))) {
      const ids = segsNear(p.x - r - 30, p.z - r - 30, p.x + r + 30, p.z + r + 30);
      let removed = false;
      for (const id of ids) {
        const seg = R.segs.get(id); if (!seg) continue;
        const lim = r + typeOf(seg.type).w / 2 * 0.6;
        if (segDistWithin(seg, p.x, p.z, lim)) { D.History.touchObj('roads'); R.removeSeg(seg); removed = true; }
      }
      if (removed) { rehash(); layoutAll(); D.emit('roads:changed', []); }
    }
    if ((o.target === 'all' || o.target === 'buildings') && D.City && D.City.removeIn && !(D.Layers && D.Layers.locked('buildings'))) D.City.removeIn(p.x, p.z, r);
    if ((o.target === 'all' || o.target === 'nature') && !(D.Layers && D.Layers.locked('nature'))) D.Nature.erase(p.x, p.z, r, 1, 1, null, Math.random);
  }
});
})();
