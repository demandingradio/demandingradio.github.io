/* Diorama — townx: the Castle (3), Monastery (4) and Harbour (5) planners.
   Loaded after js/town.js. Registers D.TownX.planners at parse time; Town calls each one as a
   time-sliced generator with its planner ctx (see "PLANNER EXTENSION API" at the top of town.js).
   Everything here is deterministic (ctx.rng / ctx.fbm only, arrays iterated in index order) and
   yields regularly through ctx.yieldIfOverBudget().

   Castle     defensible site (prominence, steep surroundings, flat top, water, approach), a curtain that
              follows the hill's contour (area-targeted marching squares; noisy ellipse or planned
              quadrangle on flat ground), a switchbacking approach found by a grade-aware search, the
              gatehouse where it crosses the wall, keep by wealth (motte + palisade / square keep / round
              keep + inner curtain), bailey buildings packed along the wall, dry ditch, gate hamlet.
   Monastery  east-oriented claustral template (abbey church, cloister, east/south/west ranges, Lady
              chapel, cemetery), fitted by rotation/offset/scale search; outer court, infirmary, herb
              garden, orchard, fishponds, precinct wall with its gatehouse and approach.
   Harbour    shoreline by marching squares, strand lane along it, piers where depth grows fastest,
              quays, crane, moored boats, boathouses, storehouses, harbour tavern, fishers' plots,
              lanes climbing inland, a fishermen's chapel.
   Local frame reminder (spec §3.4): front = local −z; world = (x + lx·cos + lz·sin, z − lx·sin + lz·cos);
   local +z points along (sin rot, cos rot). Churches: local +z = east (world +x). North = −z. */
(function () {
'use strict';
const D = window.D;
if (!D) return;
const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const SIZE = D.SIZE || 16384;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };

// =====================================================================================================
// Geometry helpers (flat Float32Array [x,z,...] polylines / loops)
// =====================================================================================================
function f32(p) {
  if (p instanceof Float32Array) return p;
  if (!p || !p.length) return new Float32Array(0);
  if (Array.isArray(p[0])) { const o = new Float32Array(p.length * 2); for (let i = 0; i < p.length; i++) { o[i * 2] = p[i][0]; o[i * 2 + 1] = p[i][1]; } return o; }
  return Float32Array.from(p);
}
function sArea(p) { let a = 0; const n = p.length >> 1; for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; return a / 2; }
function cen(p) {
  const n = p.length >> 1; let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) { const f = p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; a += f; cx += (p[j * 2] + p[i * 2]) * f; cz += (p[j * 2 + 1] + p[i * 2 + 1]) * f; }
  if (Math.abs(a) < 1e-6) { let sx = 0, sz = 0; for (let i = 0; i < n; i++) { sx += p[i * 2]; sz += p[i * 2 + 1]; } return [sx / Math.max(1, n), sz / Math.max(1, n)]; }
  return [cx / (3 * a), cz / (3 * a)];
}
function pip(p, x, z) {
  let inside = false; const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segD2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}
function dLoop(p, x, z) { let b = 1e18; const n = p.length >> 1; for (let i = 0; i < n; i++) { const j = (i + 1) % n, d = segD2(x, z, p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1]); if (d < b) b = d; } return Math.sqrt(b); }
function dLine(p, x, z) { const n = p.length >> 1; if (n === 1) return hyp(p[0] - x, p[1] - z); let b = 1e18; for (let i = 0; i < n - 1; i++) { const d = segD2(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]); if (d < b) b = d; } return Math.sqrt(b); }
function plLen(p) { let L = 0; for (let i = 2; i + 1 < p.length; i += 2) L += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return L; }
function loopLen(p) { const n = p.length >> 1; return n < 2 ? 0 : plLen(p) + hyp(p[0] - p[n * 2 - 2], p[1] - p[n * 2 - 1]); }
function bbox(p, pad) { pad = pad || 0; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i + 1 < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1]; } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; }
function rectPoly(x, z, rot, w, d) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2, o = new Float32Array(8), L = [-hw, -hd, hw, -hd, hw, hd, -hw, hd];
  for (let i = 0; i < 4; i++) { const lx = L[i * 2], lz = L[i * 2 + 1]; o[i * 2] = x + lx * c + lz * s; o[i * 2 + 1] = z - lx * s + lz * c; }
  return o;
}
function toW(cx, cz, rot, lx, lz) { const c = Math.cos(rot), s = Math.sin(rot); return [cx + lx * c + lz * s, cz - lx * s + lz * c]; }
const rotBack = (bx, bz) => Math.atan2(bx, bz);      // local +z (back) points along (bx,bz)
const rotFront = (fx, fz) => Math.atan2(-fx, -fz);   // local −z (front, door) faces (fx,fz)
function discPoly(x, z, r, n) { const o = new Float32Array(n * 2); for (let i = 0; i < n; i++) { const a = i / n * TAU; o[i * 2] = x + Math.cos(a) * r; o[i * 2 + 1] = z + Math.sin(a) * r; } return o; }
// outward unit normal per vertex of a closed loop
function vNormals(p) {
  const n = p.length >> 1, sg = sArea(p) > 0 ? 1 : -1, out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    let t1x = p[i * 2] - p[a * 2], t1z = p[i * 2 + 1] - p[a * 2 + 1]; const l1 = hyp(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
    let t2x = p[b * 2] - p[i * 2], t2z = p[b * 2 + 1] - p[i * 2 + 1]; const l2 = hyp(t2x, t2z) || 1; t2x /= l2; t2z /= l2;
    let nx = sg * (t1z + t2z), nz = -sg * (t1x + t2x); const l = hyp(nx, nz);
    if (l < 1e-6) { nx = sg * t2z; nz = -sg * t2x; } else { nx /= l; nz /= l; }
    out[i * 2] = nx; out[i * 2 + 1] = nz;
  }
  return out;
}
function offsetLoop(p, d) { const N = vNormals(p), o = new Float32Array(p.length); for (let i = 0; i < p.length; i += 2) { o[i] = p[i] + N[i] * d; o[i + 1] = p[i + 1] + N[i + 1] * d; } return o; }
function hull(p) {
  const pts = []; for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return f32(pts);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return f32(lo.concat(up));
}
function nearestOn(p, x, z, closed) {
  const n = p.length >> 1; let bd = Infinity, bx = p[0], bz = p[1], bi = 0, bt = 0;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az, L2 = ex * ex + ez * ez;
    let t = L2 > 1e-9 ? ((x - ax) * ex + (z - az) * ez) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qz = az + ez * t, d = (qx - x) * (qx - x) + (qz - z) * (qz - z);
    if (d < bd) { bd = d; bx = qx; bz = qz; bi = i; bt = t; }
  }
  return { x: bx, z: bz, i: bi, t: bt, d: Math.sqrt(bd) };
}
// outward normal of a loop at its edge i
function edgeOut(p, i) {
  const n = p.length >> 1, j = (i + 1) % n, sg = sArea(p) > 0 ? 1 : -1;
  let tx = p[j * 2] - p[i * 2], tz = p[j * 2 + 1] - p[i * 2 + 1]; const l = hyp(tx, tz) || 1; tx /= l; tz /= l;
  return [sg * tz, -sg * tx];
}
function hullBlend(p, f) {
  const H = hull(p); if (H.length < 6) return p;
  const o = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 2) { const q = nearestOn(H, p[i], p[i + 1], true); o[i] = p[i] + (q.x - p[i]) * f; o[i + 1] = p[i + 1] + (q.z - p[i + 1]) * f; }
  return o;
}
function smoothTurns(p, maxTurn, iters) {
  let a = Float32Array.from(p); const n = a.length >> 1; if (n < 5) return a;
  for (let it = 0; it < iters; it++) {
    let any = false; const b = a.slice();
    for (let i = 0; i < n; i++) {
      const pi = (i + n - 1) % n, ni = (i + 1) % n;
      const t1 = Math.atan2(a[i * 2 + 1] - a[pi * 2 + 1], a[i * 2] - a[pi * 2]), t2 = Math.atan2(a[ni * 2 + 1] - a[i * 2 + 1], a[ni * 2] - a[i * 2]);
      if (Math.abs(angDiff(t1, t2)) > maxTurn) { any = true; b[i * 2] = a[i * 2] * 0.5 + (a[pi * 2] + a[ni * 2]) * 0.25; b[i * 2 + 1] = a[i * 2 + 1] * 0.5 + (a[pi * 2 + 1] + a[ni * 2 + 1]) * 0.25; }
    }
    a = b; if (!any) break;
  }
  return a;
}
// every crossing of an open path with a closed loop, in path order
function crossings(path, loop) {
  const out = [], n = loop.length >> 1, m = path.length >> 1;
  for (let s = 0; s < m - 1; s++) {
    const ax = path[s * 2], az = path[s * 2 + 1], r1x = path[s * 2 + 2] - ax, r1z = path[s * 2 + 3] - az;
    const hits = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, cx = loop[i * 2], cz = loop[i * 2 + 1], r2x = loop[j * 2] - cx, r2z = loop[j * 2 + 1] - cz, den = r1x * r2z - r1z * r2x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * r2z - (cz - az) * r2x) / den, u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
      if (t >= 0 && t < 1 && u >= 0 && u <= 1) hits.push({ x: ax + r1x * t, z: az + r1z * t, si: s, t, li: i });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const h of hits) out.push(h);
  }
  return out;
}
function polyNear(a, b, d) {
  const d2 = d * d;
  for (let i = 0; i + 1 < a.length; i += 2) for (let q = 0; q + 3 < b.length; q += 2) if (segD2(a[i], a[i + 1], b[q], b[q + 1], b[q + 2], b[q + 3]) < d2) return true;
  for (let i = 0; i + 1 < b.length; i += 2) for (let q = 0; q + 3 < a.length; q += 2) if (segD2(b[i], b[i + 1], a[q], a[q + 1], a[q + 2], a[q + 3]) < d2) return true;
  return false;
}
// exact oriented-rect overlap (separating axes), rects {x,z,rot,w,d}, grown by `pad` on every side
function obbHit(a, b, pad) {
  const A = rectPoly(a.x, a.z, a.rot, a.w + 2 * pad, a.d + 2 * pad), B = rectPoly(b.x, b.z, b.rot, b.w + 2 * pad, b.d + 2 * pad);
  for (const ang of [a.rot, a.rot + PI / 2, b.rot, b.rot + PI / 2]) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let i = 0; i < 4; i++) { const v = A[i * 2] * ax + A[i * 2 + 1] * az, u = B[i * 2] * ax + B[i * 2 + 1] * az; if (v < a0) a0 = v; if (v > a1) a1 = v; if (u < b0) b0 = u; if (u > b1) b1 = u; }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
// exact footprint registry per planning job: the 2 m occupancy raster can let slivers < 2 m slip between
// cell centres, so every building placed by these planners is also checked against its neighbours exactly
const REG = new WeakMap();
function reg(ctx) {
  let r = REG.get(ctx);
  if (!r) {
    REG.set(ctx, r = new Map()); r.maxR = 0;
    if (ctx.prev) { // an expansion: the frozen buildings are neighbours too
      for (const p of ctx.prev.plots) regAdd(ctx, p);
      for (const s of ctx.prev.specials) if (s.w > 0 && s.d > 0 && s.kind !== 'boat' && s.kind !== 'pond') regAdd(ctx, s);
    }
  }
  return r;
}
function regHit(ctx, b, pad) {
  const m = reg(ctx), rad = hyp(b.w, b.d) / 2 + m.maxR + pad + 1;
  const i0 = Math.floor((b.x - rad) / 32), i1 = Math.floor((b.x + rad) / 32), j0 = Math.floor((b.z - rad) / 32), j1 = Math.floor((b.z + rad) / 32);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = m.get(i * 8192 + j); if (a) for (const o of a) if (obbHit(b, o, pad)) return true; }
  return false;
}
function regAdd(ctx, b) { const m = reg(ctx), k = Math.floor(b.x / 32) * 8192 + Math.floor(b.z / 32); let a = m.get(k); if (!a) m.set(k, a = []); a.push({ x: b.x, z: b.z, rot: b.rot, w: b.w, d: b.d }); m.maxR = Math.max(m.maxR, hyp(b.w, b.d) / 2); }
function rectInLoop(loop, cx, cz, rot, w, d, minD) {
  const P = rectPoly(cx, cz, rot, w, d);
  if (!pip(loop, cx, cz)) return false;
  for (let i = 0; i < 4; i++) { const x = P[i * 2], z = P[i * 2 + 1]; if (!pip(loop, x, z) || dLoop(loop, x, z) < minD) return false; }
  return true;
}
// distance (m) from every cell to the nearest cell with src == want (two-pass chamfer)
function chamfer(src, w, h, step, want) {
  const d = new Float32Array(w * h), a = step, b = step * Math.SQRT2, INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = src[i] === want ? 0 : INF;
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
// scanline raster of a polygon into a mask (cell (i,j) centre = (ox + (i+.5)·st, oz + (j+.5)·st))
function fillPoly(m, w, h, ox, oz, st, poly) {
  const b = bbox(poly, 0), xs = [], n = poly.length >> 1;
  const j0 = Math.max(0, Math.floor((b[1] - oz) / st)), j1 = Math.min(h - 1, Math.floor((b[3] - oz) / st));
  for (let j = j0; j <= j1; j++) {
    const z = oz + (j + 0.5) * st; xs.length = 0;
    for (let i = 0, k = n - 1; i < n; k = i++) { const zi = poly[i * 2 + 1], zk = poly[k * 2 + 1]; if ((zi > z) !== (zk > z)) xs.push(poly[i * 2] + (poly[k * 2] - poly[i * 2]) * (z - zi) / (zk - zi)); }
    xs.sort((a, c) => a - c);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const ia = Math.max(0, Math.ceil((xs[q] - ox) / st - 0.5)), ib = Math.min(w - 1, Math.floor((xs[q + 1] - ox) / st - 0.5));
      for (let i = ia; i <= ib; i++) m[j * w + i] = 1;
    }
  }
}
// 4-connected flood of `src` cells from k0 into dst (value 1); returns the count
function flood(src, dst, w, h, k0) {
  if (!src[k0] || dst[k0]) return 0;
  const st = [k0]; dst[k0] = 1; let c = 0;
  while (st.length) {
    const k = st.pop(); c++; const i = k % w;
    if (i + 1 < w && src[k + 1] && !dst[k + 1]) { dst[k + 1] = 1; st.push(k + 1); }
    if (i > 0 && src[k - 1] && !dst[k - 1]) { dst[k - 1] = 1; st.push(k - 1); }
    if (k + w < w * h && src[k + w] && !dst[k + w]) { dst[k + w] = 1; st.push(k + w); }
    if (k >= w && src[k - w] && !dst[k - w]) { dst[k - w] = 1; st.push(k - w); }
  }
  return c;
}
// fill the holes of a mask (cells not reachable from the border through empty cells)
function fillHoles(m, w, h) {
  const empty = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) empty[k] = m[k] ? 0 : 1;
  for (let i = 0; i < w; i++) { flood(empty, out, w, h, i); flood(empty, out, w, h, (h - 1) * w + i); }
  for (let j = 0; j < h; j++) { flood(empty, out, w, h, j * w); flood(empty, out, w, h, j * w + w - 1); }
  const r = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) r[k] = out[k] ? 0 : 1;
  return r;
}
// group plan lane steps into whole polylines (step order), filtered
function laneGroups(lanes, filter) {
  const groups = new Map();
  for (const L of lanes) { if (filter && !filter(L)) continue; const b = L.key.slice(0, L.key.lastIndexOf('.')); let g = groups.get(b); if (!g) groups.set(b, g = []); g.push(L); }
  const keys = Array.from(groups.keys()).sort();
  const idx = k => +k.slice(k.lastIndexOf('.') + 1) || 0;
  return keys.map(k => {
    const steps = groups.get(k).sort((a, b) => idx(a.key) - idx(b.key)), o = [];
    for (const s of steps) { const p = s.pts; for (let i = 0; i + 1 < p.length; i += 2) { if (o.length >= 2 && Math.abs(o[o.length - 2] - p[i]) < 0.01 && Math.abs(o[o.length - 1] - p[i + 1]) < 0.01) continue; o.push(p[i], p[i + 1]); } }
    return { key: k, rank: steps[0].rank, w: steps[0].w, pts: Float32Array.from(o) };
  });
}

// deterministic binary heap (Float64 keys, ties by insertion order)
class Heap {
  constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.s = new Float64Array(1024); this.n = 0; this.q = 0; }
  get size() { return this.n; }
  less(a, b) { return this.k[a] < this.k[b] || (this.k[a] === this.k[b] && this.s[a] < this.s[b]); }
  sw(a, b) { let t = this.k[a]; this.k[a] = this.k[b]; this.k[b] = t; t = this.v[a]; this.v[a] = this.v[b]; this.v[b] = t; t = this.s[a]; this.s[a] = this.s[b]; this.s[b] = t; }
  push(key, val) {
    if (this.n >= this.k.length) { const c = this.k.length * 2, k = new Float64Array(c), v = new Int32Array(c), s = new Float64Array(c); k.set(this.k); v.set(this.v); s.set(this.s); this.k = k; this.v = v; this.s = s; }
    let i = this.n++; this.k[i] = key; this.v[i] = val; this.s[i] = this.q++;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.sw(i, p); i = p; }
  }
  pop() {
    const top = this.v[0]; this.n--;
    if (this.n > 0) { this.k[0] = this.k[this.n]; this.v[0] = this.v[this.n]; this.s[0] = this.s[this.n]; }
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.n && this.less(l, m)) m = l; if (r < this.n && this.less(r, m)) m = r; if (m === i) break; this.sw(i, m); i = m; }
    return top;
  }
}

// =====================================================================================================
// Shared planning helpers (ctx-based)
// =====================================================================================================
const DI = [1, 0, -1, 0, 1, -1, -1, 1, 2, 1, -1, -2, -2, -1, 1, 2];
const DJ = [0, 1, 0, -1, 1, 1, -1, -1, 1, 2, 2, 1, -1, -2, -2, -1];
const DL = DI.map((d, i) => hyp(d, DJ[i]));
function gridDims(ctx, st) { return { st, w: Math.max(2, Math.ceil((ctx.x1 - ctx.x0) / st)), h: Math.max(2, Math.ceil((ctx.z1 - ctx.z0) / st)) }; }
// Grade-aware least-cost path on an st-metre grid (16 directions incl. knight moves, so paths can wind
// across a slope: switchbacks appear by themselves where the direct line is too steep).
// o.cell(x,z) → extra cost ≥ 0 or Infinity (blocked); o.target(x,z,i,j) → bool. Returns Float32Array or null.
function* searchPath(ctx, sx, sz, o) {
  const G = gridDims(ctx, o.step || 8), st = G.st, w = G.w, h = G.h, n = w * h, x0 = ctx.x0, z0 = ctx.z0;
  const H = new Float32Array(n), C = new Float32Array(n), T = new Uint8Array(n);
  for (let j = 0; j < h; j++) {
    const z = z0 + (j + 0.5) * st;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * st, k = j * w + i;
      H[k] = ctx.h4(x, z);
      const c = o.cell(x, z); C[k] = c;
      T[k] = c < Infinity && o.target(x, z, i, j) ? 1 : 0;
    }
    if ((j & 7) === 7) yield* ctx.yieldIfOverBudget();
  }
  const si = clamp(Math.floor((sx - x0) / st), 0, w - 1), sj = clamp(Math.floor((sz - z0) / st), 0, h - 1), start = sj * w + si;
  if (!(C[start] < Infinity)) C[start] = 0;
  T[start] = 0;
  const Gc = new Float64Array(n).fill(Infinity), P = new Int32Array(n).fill(-1), done = new Uint8Array(n), hp = new Heap();
  const gRef = o.gRef || 0.1, gMax = o.gMax || 0.16, maxPops = o.maxPops || 300000;
  Gc[start] = 0; hp.push(0, start);
  let found = -1, pops = 0;
  while (hp.size) {
    const k = hp.pop(); if (done[k]) continue; done[k] = 1;
    if (T[k]) { found = k; break; }
    if (++pops > maxPops) break;
    const i = k % w, j = (k / w) | 0;
    for (let d = 0; d < 16; d++) {
      const ni = i + DI[d], nj = j + DJ[d];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni; if (done[nk] || !(C[nk] < Infinity)) continue;
      if (d >= 8) { // a knight move brushes two cells: both must be passable
        const ai = i + (Math.abs(DI[d]) === 2 ? Math.sign(DI[d]) : 0), aj = j + (Math.abs(DJ[d]) === 2 ? Math.sign(DJ[d]) : 0);
        const bi = i + Math.sign(DI[d]), bj = j + Math.sign(DJ[d]);
        if (!(C[aj * w + ai] < Infinity) || !(C[bj * w + bi] < Infinity)) continue;
      }
      const len = st * DL[d], g = Math.abs(H[nk] - H[k]) / len;
      const c = 1 + (g / gRef) * (g / gRef) + (g > gMax ? (g - gMax) * 220 : 0) + C[nk];
      const ng = Gc[k] + len * c;
      if (ng < Gc[nk]) { Gc[nk] = ng; P[nk] = k; hp.push(ng, nk); }
    }
    if ((pops & 1023) === 1023) yield* ctx.yieldIfOverBudget();
  }
  if (found < 0) return null;
  const rev = [];
  for (let k = found; k >= 0; k = P[k]) { rev.push(x0 + (k % w + 0.5) * st, z0 + (((k / w) | 0) + 0.5) * st); if (k === start) break; }
  const res = new Float32Array(rev.length);
  for (let a = 0, b = rev.length - 2; b >= 0; a += 2, b -= 2) { res[a] = rev[b]; res[a + 1] = rev[b + 1]; }
  res[0] = sx; res[1] = sz;
  return res;
}
// manual roads and neighbouring settlements' lanes rasterized on the search grid
function laneMask(ctx, st) {
  const G = gridDims(ctx, st), m = new Uint8Array(G.w * G.h); let any = false;
  const mark = p => {
    for (let q = 0; q + 1 < p.length; q += 2) {
      const ax = p[q], az = p[q + 1], bx = q + 3 < p.length ? p[q + 2] : ax, bz = q + 3 < p.length ? p[q + 3] : az;
      const L = hyp(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (st * 0.5)));
      for (let s = 0; s <= n; s++) {
        const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n, i = Math.floor((x - ctx.x0) / st), j = Math.floor((z - ctx.z0) / st);
        if (i >= 0 && j >= 0 && i < G.w && j < G.h) { m[j * G.w + i] = 1; any = true; }
      }
    }
  };
  for (const rd of ctx.roads) mark(rd.pts);
  for (const nb of ctx.neighbours) if (nb.plan && nb.plan.lanes) for (const L of nb.plan.lanes) if (L.rank <= 3 && L.pts && L.pts.length >= 4) mark(L.pts);
  return { m, any, w: G.w, h: G.h, st };
}
// the approach from a point inside `loop` to the nearest road / neighbour lane, else to the zone's edge
function* approach(ctx, sx, sz, loop, clear) {
  const OCC = ctx.OCC, st = 8, LM = laneMask(ctx, st), lb = bbox(loop, clear + 2);
  const outside = (x, z) => x < lb[0] || x > lb[2] || z < lb[1] || z > lb[3] || (!pip(loop, x, z) && dLoop(loop, x, z) > clear);
  const cell = (x, z) => {
    if (x < 1 || z < 1 || x > SIZE - 1 || z > SIZE - 1) return Infinity;
    if (ctx.isWet(x, z)) return Infinity;
    const oc = ctx.occAt(x, z);
    if (oc === OCC.BUILDING) return Infinity;
    if (ctx.slopeAt(x, z) > 0.85) return Infinity;
    if (oc === OCC.YARD || oc === OCC.PRECINCT) return 3;
    if (oc === OCC.LANE || oc === OCC.ROAD) return 0;
    return ctx.inH(x, z) ? 0.15 : 0.5;
  };
  let path = null;
  if (LM.any) path = yield* searchPath(ctx, sx, sz, { step: st, cell, target: (x, z, i, j) => LM.m[j * LM.w + i] === 1 && outside(x, z) });
  if (!path) path = yield* searchPath(ctx, sx, sz, { step: st, cell, target: (x, z) => !ctx.inH(x, z) && outside(x, z) });
  return path;
}
// the last crossing of a path with a loop: the gate, the part outside it and the part inside
function gateFrom(path, loop) {
  const xs = crossings(path, loop); if (!xs.length) return null;
  const g = xs[xs.length - 1];
  const outer = [g.x, g.z]; for (let q = (g.si + 1) * 2; q + 1 < path.length; q += 2) outer.push(path[q], path[q + 1]);
  const inner = []; for (let q = 0; q <= g.si * 2; q += 2) inner.push(path[q], path[q + 1]); inner.push(g.x, g.z);
  return { x: g.x, z: g.z, li: g.li, outer: Float32Array.from(outer), inner: Float32Array.from(inner) };
}
function stampLane(ctx, pts, w) { const OCC = ctx.OCC; ctx.stampPolyline(pts, w / 2, OCC.LANE, 2); ctx.stampPolyline(pts, w / 2 + 1.5, OCC.VERGE, 1); }
// house plots along one side of a lane (the Kit frame: front faces the lane; yard behind)
function frontage(ctx, pts, o) {
  const AL = ctx.ALLOW, OCC = ctx.OCC, r = o.rng, out = [];
  const P = ctx.geo.resample(f32(pts), 2, false), n = P.length >> 1; if (n < 2) return out;
  let s = 0, next = o.start || 0;
  for (let i = 1; i < n && out.length < o.max; i++) {
    const dx = P[i * 2] - P[i * 2 - 2], dz = P[i * 2 + 1] - P[i * 2 - 1], l = hyp(dx, dz) || 1;
    s += l;
    if (s < next) continue;
    const tx = dx / l, tz = dz / l, nx = -tz * o.side, nz = tx * o.side, rot = Math.atan2(nx, nz);
    const fw = lerp(o.fw[0], o.fw[1], r()), w = fw * lerp(o.frac[0], o.frac[1], r()), d = lerp(o.dep[0], o.dep[1], r());
    const yardD = o.yard ? lerp(o.yard[0], o.yard[1], r()) : 0, sb = lerp(o.setback[0], o.setback[1], r());
    const off = o.lw + sb + d / 2, cx = P[i * 2] + nx * off, cz = P[i * 2 + 1] + nz * off;
    let ok = (o.inside === 'H' ? ctx.inH(cx, cz) : ctx.inside(cx, cz)) && !ctx.isWet(cx, cz) && (!o.test || o.test(cx, cz));
    ok = ok && ctx.testRect(cx, cz, rot, w, d, -0.25, AL.FV);
    let yx = 0, yz = 0;
    if (ok && yardD > 0.5) {
      const yo = d / 2 + yardD / 2; yx = cx + nx * yo; yz = cz + nz * yo;
      ok = ctx.inH(yx, yz) && !ctx.isWet(yx, yz) && ctx.testRect(yx, yz, rot, fw, yardD, -0.35, AL.FV);
    }
    ok = ok && ctx.spread(cx, cz, rot, w, d) <= Math.max(3, 0.35 * Math.min(w, d));
    const me = { x: cx, z: cz, rot, w, d };
    if (ok && regHit(ctx, me, 0.15)) ok = false;   // the 2 m raster misses corner clips on bends
    if (!ok) { next = s + 3; continue; }
    regAdd(ctx, me);
    ctx.stampRect(cx, cz, rot, w, d, OCC.BUILDING, 0);
    if (yardD > 0.5) ctx.stampRect(yx, yz, rot, fw, yardD, OCC.YARD, 0);
    out.push({ x: cx, z: cz, rot, w, d, yardD: yardD > 0.5 ? yardD : 0, frontW: fw, s });
    next = s + fw + (o.gap || 0.4);
  }
  return out;
}
// try a building rect near (x,z), spiralling outwards; rot may be a number or fn(x,z) → rot
function placeNear(ctx, x, z, rot, w, d, opt) {
  opt = opt || {};
  const AL = ctx.ALLOW, OCC = ctx.OCC;
  const radii = opt.radii || [0, 5, 10, 15, 21, 28];
  for (const r of radii) {
    const na = r ? Math.max(6, Math.round(r / 2.5)) : 1;
    for (let a = 0; a < na; a++) {
      const th = a / na * TAU + (opt.phase || 0), px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r;
      const rr = typeof rot === 'function' ? rot(px, pz) : rot;
      if (opt.test && !opt.test(px, pz, rr)) continue;
      if (!ctx.fits(px, pz, rr, w, d, { pad: opt.pad === undefined ? 0.6 : opt.pad, allow: opt.allow || AL.FV, maxSpread: opt.maxSpread, inside: opt.inside === undefined ? 'H' : opt.inside })) continue;
      const me = { x: px, z: pz, rot: rr, w, d };
      if (regHit(ctx, me, 0.4)) continue;
      regAdd(ctx, me);
      if (!opt.noStamp) ctx.stampRect(px, pz, rr, w, d, opt.code === undefined ? OCC.BUILDING : opt.code, opt.stampPad === undefined ? 0.6 : opt.stampPad);
      return { x: px, z: pz, rot: rr };
    }
  }
  return null;
}
// ground-paint area near (x,z): rect w×d, inside H, over free/verge/field ground
function placeArea(ctx, x, z, rot, w, d, code, radii) {
  const AL = ctx.ALLOW;
  for (const r of radii || [0, 6, 12, 18, 26]) {
    const na = r ? Math.max(6, Math.round(r / 3)) : 1;
    for (let a = 0; a < na; a++) {
      const th = a / na * TAU, px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r, poly = rectPoly(px, pz, rot, w, d);
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) if (!ctx.inH(poly[i * 2], poly[i * 2 + 1]) || ctx.isWet(poly[i * 2], poly[i * 2 + 1])) ok = false;
      if (!ok || !ctx.testPoly(poly, AL.FV)) continue;
      ctx.stampPoly(poly, code);
      return { x: px, z: pz, rot, w, d, poly };
    }
  }
  return null;
}
// pull loop vertices that leave H or stand in water back towards (cx,cz)
function pullIntoH(ctx, loop, cx, cz) {
  const o = Float32Array.from(loop);
  for (let i = 0; i < o.length; i += 2) {
    let x = o[i], z = o[i + 1];
    for (let k = 1; k <= 10 && (!ctx.inH(x, z) || ctx.isWet(x, z)); k++) { x = o[i] + (cx - o[i]) * k * 0.08; z = o[i + 1] + (cz - o[i + 1]) * k * 0.08; }
    o[i] = x; o[i + 1] = z;
  }
  return o;
}
// the wealth offset of a plot: a little richer near the centre, a little noise
function wqAt(ctx, x, z, o, R90) { const d = hyp(x - o.x, z - o.z); return 0.25 * (1 - clamp(d / R90, 0, 1.5)) - 0.1 + 0.08 * ctx.fbm(x / 200, z / 200); }
function emitPlot(ctx, p, extra) {
  return ctx.plot(Object.assign({ x: p.x, z: p.z, rot: p.rot, w: p.w, d: p.d, yardD: p.yardD || 0, frontW: p.frontW || p.w, rank: 1, netD: 0, wq: 0, role: 'house', noStamp: true }, extra || {}));
}

// =====================================================================================================
// CASTLE (type 3)
// =====================================================================================================
function* castleSite(ctx, R0, R) {
  if (ctx.S.pin) return { x: ctx.S.pin[0], z: ctx.S.pin[1] };
  const cells = ctx.cells;
  let maxSdf = 0; for (let i = 0; i < cells.length; i++) { const c = ctx.cellCenter(cells[i]); const s = ctx.sdf(c[0], c[1]); if (s > maxSdf) maxSdf = s; }
  const need = Math.min(R0 * 0.7, maxSdf * 0.8);
  // approach distance field (16 m) to manual roads and neighbour lanes
  const LM = laneMask(ctx, 16), AD = LM.any ? chamfer(LM.m, LM.w, LM.h, 16, 1) : null;
  const adAt = (x, z) => { if (!AD) return 0; const i = clamp(Math.floor((x - ctx.x0) / 16), 0, LM.w - 1), j = clamp(Math.floor((z - ctx.z0) / 16), 0, LM.h - 1); return Math.min(1500, AD[j * LM.w + i]); };
  const step = Math.max(1, Math.floor(cells.length / 2500));
  const cand = [];
  for (let i = 0, q = 0; i < cells.length; i += step, q++) {
    const c = ctx.cellCenter(cells[i]), x = c[0], z = c[1], rr = R();
    if (ctx.sdf(x, z) < need || ctx.isWet(x, z) || ctx.occAt(x, z) === 255) continue;
    const prom = ctx.prominence(x, z, 60);
    let ms = 0; for (const r of [30, 60, 90]) for (let a = 0; a < 8; a++) ms += ctx.slopeAt(x + Math.cos(a * PI / 4) * r, z + Math.sin(a * PI / 4) * r);
    ms /= 24;
    let flat = ctx.slopeAt(x, z) < 0.12 ? 1 : 0;
    for (const r of [20, 40]) for (let a = 0; a < 6; a++) { const t = a * PI / 3 + (r > 30 ? PI / 6 : 0); if (ctx.slopeAt(x + Math.cos(t) * r, z + Math.sin(t) * r) < 0.12) flat++; }
    flat /= 13;
    const wat = ctx.waterDist(x, z) < 70 ? 1 : 0;
    // (+ room: prefer sites the whole castle fits around, not the zone's rim — decisive on flat ground)
    let sc = prom + 60 * ms + 6 * flat + 4 * wat - 0.02 * adAt(x, z) + 4 * clamp(ctx.sdf(x, z) / (R0 + 40), 0, 1) + 0.3 * rr;
    if (flat < 0.25) sc -= 20;
    cand.push({ x, z, sc, i });
    if ((q & 31) === 31) yield* ctx.yieldIfOverBudget();
  }
  cand.sort((a, b) => b.sc - a.sc || a.i - b.i);
  for (let i = 0; i < Math.min(60, cand.length); i++) {
    const c = cand[i];
    if (ctx.fits(c.x, c.z, 0, 14, 14, { pad: 0, allow: ctx.ALLOW.FV, maxSpread: 5, inside: 'H' })) return c;
  }
  return cand.length ? cand[0] : { x: ctx.centroid.x, z: ctx.centroid.z };
}
function ellipseLoop(ctx, cx, cz, A, th, R, quad) {
  const asp = 1.1 + 0.35 * R(), a = Math.sqrt(A * asp / PI), b = A / (PI * a);
  const ct = Math.cos(th), st = Math.sin(th), pts = [];
  const put = (ex, ez) => pts.push(cx + ex * ct - ez * st, cz + ex * st + ez * ct);
  if (quad) { // planned quadrangle, same area as the ellipse
    const ha = a * 0.886, hb = b * 0.886, C = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]];
    for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; for (let t = 0; t < 3; t++) put(p[0] + (q[0] - p[0]) * t / 3 + (t ? (R() - 0.5) * 1.2 : 0), p[1] + (q[1] - p[1]) * t / 3 + (t ? (R() - 0.5) * 1.2 : 0)); }
  } else {
    const n = 30;
    for (let k = 0; k < n; k++) { const t = k / n * TAU, rr = 1 + 0.13 * ctx.fbm(Math.cos(t) * 1.4 + cx * 0.003, Math.sin(t) * 1.4 + cz * 0.003); put(Math.cos(t) * a * rr, Math.sin(t) * b * rr); }
  }
  return Float32Array.from(pts);
}
function loopFitsH(ctx, loop) {
  const P = ctx.geo.resample(loop, 6, true);
  for (let i = 0; i < P.length; i += 2) if (!ctx.inH(P[i], P[i + 1]) || ctx.isWet(P[i], P[i + 1])) return false;
  return true;
}
function scaleLoop(loop, cx, cz, k) { const o = new Float32Array(loop.length); for (let i = 0; i < loop.length; i += 2) { o[i] = cx + (loop[i] - cx) * k; o[i + 1] = cz + (loop[i + 1] - cz) * k; } return o; }
function* castleCurtain(ctx, site, A, R, quadOK) {
  const S = 4, G = 65, half = S * G / 2, gx0 = site.x - half, gz0 = site.z - half, n = G * G;
  const Hg = new Float32Array(n), ok = new Uint8Array(n);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = gx0 + (i + 0.5) * S, z = gz0 + (j + 0.5) * S, k = j * G + i;
    Hg[k] = ctx.h4(x, z); ok[k] = ctx.inH(x, z) && !ctx.isWet(x, z) ? 1 : 0;
  }
  yield* ctx.yieldIfOverBudget();
  const c0 = (G >> 1) * G + (G >> 1);
  let hTop = Hg[c0];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const k = c0 + dj * G + di; if (ok[k] && Hg[k] > hTop) hTop = Hg[k]; }
  const mark = new Uint8Array(n), Q = new Int32Array(n);
  const comp = delta => {
    mark.fill(0); const lim = hTop - delta; let qh = 0, qt = 0, cnt = 0, border = false;
    if (!ok[c0] || Hg[c0] < lim) return { cnt: 0, border: false };
    Q[qt++] = c0; mark[c0] = 1;
    while (qh < qt) {
      const k = Q[qh++]; cnt++; const i = k % G, j = (k / G) | 0;
      if (i === 0 || j === 0 || i === G - 1 || j === G - 1) { border = true; continue; }
      for (let q = 0; q < 4; q++) {
        const nk = q === 0 ? k + 1 : q === 1 ? k - 1 : q === 2 ? k + G : k - G;
        if (!mark[nk] && ok[nk] && Hg[nk] >= lim) { mark[nk] = 1; Q[qt++] = nk; }
      }
    }
    return { cnt, border };
  };
  const tgt = A / (S * S);
  let mode = 'contour';
  const lo0 = comp(1);
  if (lo0.border || lo0.cnt >= tgt * 1.25 || lo0.cnt === 0) mode = 'flat';
  else { const hi0 = comp(25); if (!hi0.border && hi0.cnt < tgt * 0.6) mode = 'peak'; }
  let mask = null;
  if (mode === 'contour') {
    let lo = 1, hi = 25;
    for (let it = 0; it < 11; it++) { const mid = (lo + hi) / 2, c = comp(mid); if (c.border || c.cnt > tgt) hi = mid; else lo = mid; }
    const a = comp(lo);
    if (a.cnt >= tgt * 0.45) mask = mark.slice(); else mode = 'flat';
  } else if (mode === 'peak') {
    comp(25);
    const dist = chamfer(mark, G, G, S, 1);
    for (let r = 4; r <= 48; r += 4) {
      let cnt = 0; for (let k = 0; k < n; k++) if (dist[k] <= r && ok[k]) cnt++;
      if (cnt >= tgt * 0.85 || r === 48) { mask = new Uint8Array(n); for (let k = 0; k < n; k++) mask[k] = dist[k] <= r && ok[k] ? 1 : 0; break; }
    }
    const keep = new Uint8Array(n); flood(mask, keep, G, G, c0); mask = keep;
  }
  yield* ctx.yieldIfOverBudget();
  let loop = null;
  if (mask) {
    const filled = fillHoles(mask, G, G), loops = ctx.traceMask(filled, G, G, gx0, gz0, S);
    if (loops.length) {
      loop = ctx.geo.chaikin(ctx.geo.dp(loops[0], 3, true), 1, true);
      loop = hullBlend(loop, 0.3);
      if (Math.abs(sArea(loop)) < 0.3 * A) loop = null;
    }
  }
  if (!loop) {
    // flat ground: a noisy ellipse (or a planned quadrangle) along the zone's longest axis
    let th = 0, bl = -1;
    for (let a = 0; a < 16; a++) { const t = a / 16 * PI, dx = Math.cos(t), dz = Math.sin(t); let L = 0; for (const sg of [1, -1]) for (let d = 8; d <= 400; d += 8) { if (!ctx.inH(site.x + dx * d * sg, site.z + dz * d * sg)) break; L += 8; } if (L > bl) { bl = L; th = t; } }
    // try the site, then centres drifting towards the roomiest part of the zone; keep the largest fit
    let mx = site.x, mz = site.z, ms = -1e9;
    for (let i = 0; i < ctx.cells.length; i++) { const c = ctx.cellCenter(ctx.cells[i]), s = ctx.sdf(c[0], c[1]); if (s > ms) { ms = s; mx = c[0]; mz = c[1]; } }
    const base = ellipseLoop(ctx, site.x, site.z, A, th, R, quadOK);
    const sx0 = site.x, sz0 = site.z;
    let bestK = -1, bx = sx0, bz = sz0;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const ox = (mx - sx0) * f, oz = (mz - sz0) * f;
      if (f > 0 && hyp(ox, oz) < 4) break;
      for (let k = 1; k >= 0.5 && k > bestK + 1e-6; k -= 0.05) {
        const Lp = scaleLoop(base, sx0, sz0, k); for (let i = 0; i < Lp.length; i += 2) { Lp[i] += ox; Lp[i + 1] += oz; }
        if (loopFitsH(ctx, Lp)) { bestK = k; loop = Lp; bx = sx0 + ox; bz = sz0 + oz; break; }
      }
      if (bestK >= 0.999) break;
    }
    if (!loop) loop = scaleLoop(base, sx0, sz0, 0.5);
    site.x = bx; site.z = bz;
  }
  return loop;
}
function keepSpot(ctx, loop, kw, motte, R, inset) {
  const b = bbox(loop, 0), c = cen(loop), rad = motte ? kw / 2 : kw * 0.72, foot = motte ? kw * 0.8 : kw;
  let best = null, bs = -1e9;
  for (let z = b[1] + 2; z < b[3]; z += 4) for (let x = b[0] + 2; x < b[2]; x += 4) {
    if (!pip(loop, x, z)) continue;
    if (dLoop(loop, x, z) < rad + (inset || (motte ? 3 : 6))) continue;
    const sc = ctx.h4(x, z) + 0.15 * R() - 0.004 * hyp(x - c[0], z - c[1]);
    if (sc <= bs) continue;
    if (!ctx.testDisc(x, z, rad, ctx.ALLOW.FV)) continue;
    if (ctx.spread(x, z, 0, foot, foot) > (motte ? 10 : 5)) continue;
    bs = sc; best = { x, z };
  }
  return best;
}
// buildings packed along the inside of a wall loop, 6 m in, back to the wall
function* packAlongWall(ctx, loop, specs, gates, R, keepOff) {
  const OCC = ctx.OCC, AL = ctx.ALLOW;
  const P = ctx.geo.resample(loop, 2, true), n = P.length >> 1, N = vNormals(P), c = cen(loop), L = loopLen(loop);
  const g0 = gates[0] || { x: c[0], z: c[1] };
  const placed = [];
  for (const b of specs) {
    const keys = [], idx = [];
    for (let i = 0; i < n; i += 2) {
      const x = P[i * 2], z = P[i * 2 + 1], dg = hyp(x - g0.x, z - g0.z);
      let k = 0;
      if (b.pref === 'far') k = -dg; else if (b.pref === 'gate') k = dg; else if (b.pref === 'east') k = -(x - c[0]); else if (b.pref === 'mid') k = Math.abs(dg - L / 4);
      keys[i] = k + R() * (b.jit || 6); idx.push(i);
    }
    idx.sort((a, q) => keys[a] - keys[q] || a - q);
    let got = null;
    for (const shrink of b.alt ? [1, b.alt] : [1]) {
      const w = b.w * shrink, d = b.d * shrink;
      for (const i of idx) {
        const x = P[i * 2], z = P[i * 2 + 1], inx = -N[i * 2], inz = -N[i * 2 + 1];
        let near = false; for (const g of gates) if (hyp(g.x - x, g.z - z) < 14 + w / 2) near = true;
        if (near) continue;
        let rot, ext;
        if (b.east) {
          rot = PI / 2 + (R() - 0.5) * 0.2;
          const ax = Math.cos(rot), az = -Math.sin(rot), bx = Math.sin(rot), bz = Math.cos(rot);
          ext = Math.abs(inx * ax + inz * az) * w / 2 + Math.abs(inx * bx + inz * bz) * d / 2;
        } else { rot = rotBack(-inx, -inz); ext = d / 2; }
        const off = (b.off || 6) + ext, cx = x + inx * off, cz = z + inz * off;
        if (!rectInLoop(loop, cx, cz, rot, w, d, 4.5)) continue;
        if (keepOff && hyp(cx - keepOff.x, cz - keepOff.z) < keepOff.r + Math.max(w, d) / 2) continue;
        if (!ctx.testRect(cx, cz, rot, w, d, 0.8, AL.FV)) continue;
        if (ctx.spread(cx, cz, rot, w, d) > Math.max(3.5, 0.4 * Math.min(w, d))) continue;
        if (regHit(ctx, { x: cx, z: cz, rot, w, d }, 0.8)) continue;
        ctx.stampRect(cx, cz, rot, w, d, OCC.BUILDING, 1);
        got = { kind: b.kind, x: cx, z: cz, rot, w, d, b }; regAdd(ctx, got); break;
      }
      if (got) break;
      yield* ctx.yieldIfOverBudget();
    }
    if (!got) { // a cramped (hill-top) bailey: anywhere inside, facing the middle of the ward
      const w = b.w * (b.alt || 1), d = b.d * (b.alt || 1), bb = bbox(loop, 0), cand = [];
      for (let z = bb[1] + 3; z < bb[3]; z += 5) for (let x = bb[0] + 3; x < bb[2]; x += 5) {
        if (!pip(loop, x, z) || dLoop(loop, x, z) < 5) continue;
        const dg = hyp(x - g0.x, z - g0.z);
        cand.push([(b.pref === 'far' ? -dg : b.pref === 'gate' ? dg : 0) + R() * 8, x, z]);
      }
      cand.sort((a, q) => a[0] - q[0] || a[1] - q[1] || a[2] - q[2]);
      for (const [, x, z] of cand) {
        let near = false; for (const g of gates) if (hyp(g.x - x, g.z - z) < 12 + w / 2) near = true;
        if (near) continue;
        const rot = b.east ? PI / 2 : rotFront(c[0] - x, c[1] - z);
        if (!rectInLoop(loop, x, z, rot, w, d, 4)) continue;
        if (keepOff && hyp(x - keepOff.x, z - keepOff.z) < keepOff.r + Math.max(w, d) / 2) continue;
        if (!ctx.testRect(x, z, rot, w, d, 0.8, AL.FV) || ctx.spread(x, z, rot, w, d) > Math.max(3.5, 0.4 * Math.min(w, d))) continue;
        if (regHit(ctx, { x, z, rot, w, d }, 0.8)) continue;
        ctx.stampRect(x, z, rot, w, d, OCC.BUILDING, 1);
        got = { kind: b.kind, x, z, rot, w, d, b }; regAdd(ctx, got); break;
      }
    }
    if (got) placed.push(got);
  }
  return placed;
}
// wall-hugging plots (servants' houses, workshops) along the rest of the wall
function wallPlots(ctx, loop, gates, R, max, keepOff) {
  const OCC = ctx.OCC, AL = ctx.ALLOW, out = [];
  const P = ctx.geo.resample(loop, 2, true), n = P.length >> 1, N = vNormals(P);
  let next = 0;
  for (let i = 0, s = 0; i < n && out.length < max; i++, s += 2) {
    if (s < next) continue;
    const x = P[i * 2], z = P[i * 2 + 1], inx = -N[i * 2], inz = -N[i * 2 + 1];
    const w = 6 + 3 * R(), d = 5 + 2 * R();
    let near = false; for (const g of gates) if (hyp(g.x - x, g.z - z) < 13 + w / 2) near = true;
    const rot = rotBack(-inx, -inz), off = 6 + d / 2, cx = x + inx * off, cz = z + inz * off;
    if (near || !rectInLoop(loop, cx, cz, rot, w, d, 4.5) || (keepOff && hyp(cx - keepOff.x, cz - keepOff.z) < keepOff.r + w / 2) ||
      !ctx.testRect(cx, cz, rot, w, d, 0.6, AL.FV) || ctx.spread(cx, cz, rot, w, d) > 2.6 || regHit(ctx, { x: cx, z: cz, rot, w, d }, 0.6)) { next = s + 4; continue; }
    ctx.stampRect(cx, cz, rot, w, d, OCC.BUILDING, 0.6);
    out.push({ x: cx, z: cz, rot, w, d }); regAdd(ctx, out[out.length - 1]);
    next = s + w + 1.5 + 4 * R();
  }
  return out;
}
// dry ditch: bands along the outside of the wall wherever the ground allows (a causeway at each gate)
function ditchBands(ctx, loop, gates, wd) {
  const P = ctx.geo.resample(loop, 4, true), n = P.length >> 1, N = vNormals(P), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 2], z = P[i * 2 + 1], nx = N[i * 2], nz = N[i * 2 + 1];
    let good = true;
    for (const g of gates) if (hyp(g.x - x, g.z - z) < 11) good = false;
    for (const t of [3.5, 3.5 + wd * 0.5, 3.5 + wd]) {
      const qx = x + nx * t, qz = z + nz * t;
      if (qx < 1 || qz < 1 || qx > SIZE - 1 || qz > SIZE - 1 || ctx.isWet(qx, qz) || ctx.slopeAt(qx, qz) > 0.4) { good = false; break; }
    }
    ok[i] = good ? 1 : 0;
  }
  const runs = [];
  let start = -1; for (let i = 0; i < n; i++) if (!ok[i]) { start = i; break; }
  if (start < 0) { const h = n >> 1; runs.push(Array.from({ length: h + 1 }, (_, k) => k)); runs.push(Array.from({ length: n - h + 1 }, (_, k) => (h + k) % n)); }
  else {
    let cur = [];
    for (let s = 1; s <= n; s++) { const i = (start + s) % n; if (ok[i]) cur.push(i); else { if (cur.length) runs.push(cur); cur = []; } }
    if (cur.length) runs.push(cur);
  }
  const out = [];
  for (const r of runs) {
    if (r.length < 4) continue;
    const o = [], inn = [];
    for (const i of r) { o.push(P[i * 2] + N[i * 2] * (3.5 + wd), P[i * 2 + 1] + N[i * 2 + 1] * (3.5 + wd)); inn.push(P[i * 2] + N[i * 2] * 3.5, P[i * 2 + 1] + N[i * 2 + 1] * 3.5); }
    for (let k = inn.length - 2; k >= 0; k -= 2) o.push(inn[k], inn[k + 1]);
    out.push(Float32Array.from(o));
  }
  return out;
}

function* planCastle(ctx) {
  if (ctx.empty || ctx.kind === 'infill') return;
  if (ctx.prev) { yield* castleExpand(ctx); return; }
  const OCC = ctx.OCC, tw = ctx.tw, dens = tw.dens, wealth = tw.wealth;
  const R = ctx.rng('castle');
  const wallKind = tw.walls === 'stone' ? 'stone' : tw.walls === 'palisade' ? 'palisade' : wealth < 0.35 ? 'palisade' : 'stone';
  const keepType = wealth < 0.35 ? 'motte' : wealth < 0.7 ? 'square' : 'round';
  const motte = keepType === 'motte';
  const motteW = motte ? clamp(0.5 * Math.sqrt(2500 + 9000 * dens) + 4 * R(), 24, 36) : 0;
  let A = 2500 + 9000 * dens;
  if (motte) A += PI * (motteW / 2) * (motteW / 2) * 0.7;
  A = Math.min(A, Math.max(900, ctx.areaM2 * 0.7));
  const R0 = Math.sqrt(A / PI);

  // ---- 1. site and curtain ------------------------------------------------------------------------------
  const site = yield* castleSite(ctx, R0, R);
  let loop = yield* castleCurtain(ctx, site, A, R, tw.layout > 0.6 && wealth > 0.45);
  loop = pullIntoH(ctx, loop, site.x, site.z);
  if (Math.abs(sArea(loop)) < 500) loop = discPoly(site.x, site.z, 15, 16);
  loop = ctx.geo.resample(loop, 5, true);
  const lc = cen(loop);
  ctx.stampPolyline(Float32Array.from(Array.from(loop).concat([loop[0], loop[1]])), 3, OCC.WALL, 0);
  yield* ctx.yieldIfOverBudget();

  // ---- 2. keep ----------------------------------------------------------------------------------------------
  let kw = motte ? motteW : keepType === 'square' ? 15 + 6 * wealth : 15 + 4 * wealth;
  let keep = null;
  if (keepType === 'round') keep = keepSpot(ctx, loop, kw, false, R, 20);   // room for the inner curtain ring
  if (!keep) for (const sh of [1, 0.85, 0.72]) { keep = keepSpot(ctx, loop, kw * sh, motte, R); if (keep) { kw *= sh; break; } }
  if (!keep) keep = { x: lc[0], z: lc[1] };
  const kr = motte ? kw / 2 : kw * 0.72;
  ctx.stampDisc(keep.x, keep.z, kr + 1, OCC.BUILDING);
  regAdd(ctx, { x: keep.x, z: keep.z, rot: 0, w: kr * 1.5, d: kr * 1.5 });   // a round-ish footprint as a square inside the disc
  // round keep: an inner curtain ring (a concentric castle)
  let inner = null;
  if (keepType === 'round') {
    for (const rk of [kr + 10, kr + 7]) {
      const pts = []; let ok = true;
      for (let a = 0; a < 20 && ok; a++) { const th = a / 20 * TAU, x = keep.x + Math.cos(th) * rk, z = keep.z + Math.sin(th) * rk; if (!pip(loop, x, z) || dLoop(loop, x, z) < 9 || !ctx.inH(x, z) || ctx.isWet(x, z)) ok = false; pts.push(x, z); }
      if (ok) { inner = { loop: Float32Array.from(pts), r: rk }; break; }
    }
    if (inner) ctx.stampPolyline(Float32Array.from(Array.from(inner.loop).concat([inner.loop[0], inner.loop[1]])), 2.4, OCC.WALL, 0);
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 3. approach, gate ------------------------------------------------------------------------------------
  let dx = lc[0] - keep.x, dz = lc[1] - keep.z, dl = hyp(dx, dz);
  if (dl < 4) { const g = ctx.gradAt(keep.x, keep.z); dx = -g[0]; dz = -g[1]; dl = hyp(dx, dz); if (dl < 1e-6) { dx = 1; dz = 0; dl = 1; } }
  const soff = (inner ? inner.r : kr) + 5;
  let sx = keep.x + dx / dl * soff, sz = keep.z + dz / dl * soff;
  if (!pip(loop, sx, sz)) { sx = lc[0]; sz = lc[1]; }
  const path = yield* approach(ctx, sx, sz, loop, 12);
  let gate = null, outer = null;
  if (path && path.length >= 4) {
    const g = gateFrom(ctx.geo.chaikin(path, 2, false), loop);
    if (g && g.outer.length >= 4) { gate = { x: g.x, z: g.z }; outer = g.outer; }
  }
  if (!gate) { // no route found: leave by the gentlest dry side
    const N = vNormals(loop); let bi = 0, bs = -1e9;
    for (let i = 0; i < loop.length >> 1; i++) {
      const x = loop[i * 2], z = loop[i * 2 + 1], ox = x + N[i * 2] * 24, oz = z + N[i * 2 + 1] * 24;
      const s = -Math.abs(ctx.h4(ox, oz) - ctx.h4(x, z)) - (ctx.isWet(ox, oz) ? 100 : 0) - (ctx.inH(ox, oz) ? 0 : 2);
      if (s > bs) { bs = s; bi = i; }
    }
    const x = loop[bi * 2], z = loop[bi * 2 + 1], nx = N[bi * 2], nz = N[bi * 2 + 1], o = [x, z];
    for (let t = 6; t <= 90; t += 6) { const px = x + nx * t, pz = z + nz * t; if (ctx.isWet(px, pz) || px < 1 || pz < 1 || px > SIZE - 1 || pz > SIZE - 1) break; o.push(px, pz); }
    gate = { x, z }; outer = o.length >= 4 ? Float32Array.from(o) : null;
  }
  const gdx = gate.x - keep.x, gdz = gate.z - keep.z, gl = hyp(gdx, gdz) || 1, fx = gdx / gl, fz = gdz / gl;
  const keepRot = rotFront(fx, fz);
  const gates = [{ x: gate.x, z: gate.z, kind: 'gatehouse' }];
  const L = loopLen(loop);
  if (wallKind === 'stone' && wealth > 0.45 && L > 220) { // a postern on the far side, towards water if any
    let bi = -1, bs = -1e9;
    for (let i = 0; i < loop.length >> 1; i++) {
      const x = loop[i * 2], z = loop[i * 2 + 1], dg = hyp(x - gate.x, z - gate.z); if (dg < 90) continue;
      const s = dg + (ctx.waterDist(x, z) < 90 ? 60 : 0) + 10 * R();
      if (s > bs) { bs = s; bi = i; }
    }
    if (bi >= 0) gates.push({ x: loop[bi * 2], z: loop[bi * 2 + 1], kind: 'postern' });
  }
  if (inner) { const np = nearestOn(inner.loop, gate.x, gate.z, true); inner.gate = { x: np.x, z: np.z, kind: inner.r > 21 ? 'gatehouse' : 'postern' }; }
  const laneW = 5 + 1.5 * wealth;
  if (outer) stampLane(ctx, outer, laneW);
  const kFront = [keep.x + fx * (soff - 1), keep.z + fz * (soff - 1)];
  const eg = edgeOut(loop, nearestOn(loop, gate.x, gate.z, true).i);
  const innerLane = Float32Array.from([gate.x - eg[0] * 1.5, gate.z - eg[1] * 1.5, kFront[0], kFront[1]]);
  stampLane(ctx, innerLane, 4);
  yield* ctx.yieldIfOverBudget();

  // ---- 4. ditch ---------------------------------------------------------------------------------------------
  const wd = wallKind === 'stone' ? 5 + 4 * wealth : 4 + 2 * wealth;
  const ditch = ditchBands(ctx, loop, gates, wd);
  for (const b of ditch) ctx.stampPoly(b, OCC.WALL);

  // ---- 5. bailey ---------------------------------------------------------------------------------------------
  const area = Math.abs(sArea(loop)), big = area > 4200;
  const specs = [];
  specs.push({ kind: 'hall', w: motte ? 9 : 11 + 3 * wealth, d: motte ? 14 : 17 + 4 * wealth, pref: 'far', alt: 0.78 });
  if (!motte || big) specs.push({ kind: 'chapel', w: 7.5, d: 12.5, east: true, pref: 'east', alt: 0.85, extra: { orient: 'east' } });
  specs.push({ kind: 'stable', w: 12, d: 6, pref: 'gate', alt: 0.8 });
  specs.push({ kind: 'smithy', w: 9, d: 7, pref: 'gate', alt: 0.85 });
  if (big && wealth > 0.4) specs.push({ kind: 'hall', w: 10, d: 15, pref: 'mid', alt: 0.8 });   // barracks
  specs.push({ kind: 'granary', w: 5.5, d: 4.5, pref: 'any' });
  if (wallKind === 'palisade' || R() < 0.45) specs.push({ kind: 'watchtower', w: 4, d: 4, pref: 'far' });
  const keepOff = { x: keep.x, z: keep.z, r: (inner ? inner.r + 3 : kr + 3) };
  const bld = yield* packAlongWall(ctx, loop, specs, gates, ctx.rng('bailey'), keepOff);
  // the well near the middle of the bailey
  let well = null;
  {
    const wx = lerp(lc[0], gate.x, 0.3), wz = lerp(lc[1], gate.z, 0.3);
    well = placeNear(ctx, wx, wz, 0, 3.4, 3.4, { pad: 1.2, inside: false, maxSpread: 1.5, radii: [0, 5, 9, 13, 18, 24], test: (x, z) => pip(loop, x, z) && dLoop(loop, x, z) > 6 && hyp(x - keep.x, z - keep.z) > keepOff.r + 3 });
  }
  const plots = wallPlots(ctx, loop, gates, ctx.rng('bplots'), clamp(Math.round(L / 20 * (0.35 + 0.65 * dens)), 0, 24), keepOff);
  yield* ctx.yieldIfOverBudget();

  // ---- 6. a hamlet at the gate, along the approach, when the zone is large ------------------------------------
  let town = [];
  if (outer && ctx.areaHa > 3) {
    const lim = 3.5 + wd + 10, run = [];
    for (let q = 0; q + 1 < outer.length; q += 2) { const x = outer[q], z = outer[q + 1]; if (!pip(loop, x, z) && dLoop(loop, x, z) > lim) run.push(x, z); else if (run.length) break; }
    const max = clamp(Math.round((ctx.areaHa - area / 1e4 * 2) * (2 + 6 * dens)), 0, 36);
    if (run.length >= 8 && max > 0) {
      const RT = ctx.rng('gatetown');
      for (const side of [1, -1]) town = town.concat(frontage(ctx, run, {
        side, lw: laneW / 2 + 1.2, fw: [lerp(15, 9, dens), lerp(19, 12, dens)], frac: [0.62, 0.8], dep: [6, 9], yard: [8, 8 + 16 * tw.gardens],
        setback: [1.5, 4], max: Math.ceil(max / 2), rng: RT, start: 4
      }));
    }
  }

  // ---- emission: keep, curtain, ditch, lanes, bailey, gate hamlet ----------------------------------------------
  ctx.setOrigin(keep.x, keep.z, 'castle');
  if (motte) ctx.special({ kind: 'motte', x: keep.x, z: keep.z, rot: keepRot, w: kw, d: kw, h: 8 + 4 * R(), noStamp: true });
  else ctx.special({ kind: 'keep', x: keep.x, z: keep.z, rot: keepRot, w: kw, d: kw, var: keepType === 'round' ? 1 : 0, noStamp: true });
  const hWall = wallKind === 'stone' ? 7.5 + 3.5 * wealth : 3.6 + 1.4 * wealth;
  if (inner) ctx.special({ kind: 'curtain', x: keep.x, z: keep.z, extra: { loop: inner.loop, gates: [inner.gate], wallKind: 'stone', h: hWall + 2.5 }, noStamp: true });
  ctx.special({ kind: 'curtain', x: lc[0], z: lc[1], extra: { loop: Float32Array.from(loop), gates, wallKind, h: hWall }, noStamp: true });
  for (const b of ditch) ctx.area({ cls: 15, poly: b, noStamp: true });
  if (outer) ctx.lane({ pts: outer, rank: 0, w: laneW, surf: 1, noStamp: true });
  ctx.area({ cls: 1, poly: offsetLoop(loop, -2), noStamp: true });
  ctx.lane({ pts: innerLane, rank: 1, w: 4, surf: 1, noStamp: true });
  let wellDone = false;
  for (const b of bld) {
    ctx.special({ kind: b.kind, x: b.x, z: b.z, rot: b.rot, w: b.w, d: b.d, extra: b.b.extra || null, noStamp: true });
    if (!wellDone && well && (b.kind === 'chapel' || b.kind === 'stable')) { ctx.special({ kind: 'well', x: well.x, z: well.z, rot: well.rot, w: 3.4, d: 3.4, noStamp: true }); wellDone = true; }
  }
  if (!wellDone && well) ctx.special({ kind: 'well', x: well.x, z: well.z, rot: well.rot, w: 3.4, d: 3.4, noStamp: true });
  for (const p of plots) emitPlot(ctx, p, { role: 'bailey', rank: 1, netD: hyp(p.x - keep.x, p.z - keep.z), wq: 0.05 * (R() - 0.5) });
  town.sort((a, b) => hyp(a.x - gate.x, a.z - gate.z) - hyp(b.x - gate.x, b.z - gate.z) || a.x - b.x);
  for (const p of town) { const nd = hyp(p.x - gate.x, p.z - gate.z); emitPlot(ctx, p, { role: 'house', rank: 0, netD: nd, wq: wqAt(ctx, p.x, p.z, gate, 300) }); }
}
// expansion: the castle's own gate hamlet grows along its approach into the newly painted land
function* castleExpand(ctx) {
  const P = ctx.prev, tw = ctx.tw, dens = tw.dens;
  let curtain = null;
  for (const s of P.specials) if (s.kind === 'curtain' && s.extra && s.extra.loop) { const L = f32(s.extra.loop), a = Math.abs(sArea(L)); if (!curtain || a > curtain.a) curtain = { L, a }; }
  const groups = laneGroups(P.lanes, L => L.rank === 0);
  if (!P.lanes.length) return;
  const R = ctx.rng('castlex', ctx.epoch), o = ctx.origin || { x: ctx.centroid.x, z: ctx.centroid.z };
  let placed = [];
  const max = clamp(Math.round(ctx.areaHa * (2 + 6 * dens)), 4, 60);
  const test = (x, z) => ctx.isNew(x, z) && (!curtain || (!pip(curtain.L, x, z) && dLoop(curtain.L, x, z) > 22));
  const fOpt = (side, w) => ({ side, lw: w / 2 + 1.2, fw: [lerp(15, 9, dens), lerp(19, 12, dens)], frac: [0.62, 0.8], dep: [6, 9], yard: [8, 8 + 16 * tw.gardens], setback: [1.5, 4], max: max - placed.length, rng: R, test });
  for (const g of groups) for (const side of [1, -1]) {
    if (placed.length >= max) break;
    placed = placed.concat(frontage(ctx, g.pts, fOpt(side, g.w)));
    yield* ctx.yieldIfOverBudget();
  }
  // new land away from the approach: a lane from the existing network into it, houses along it
  let reach = null;
  if (placed.length < max / 3) {
    let sx = 0, sz = 0, n = 0;
    ctx.forCells((k, x, z) => { if (ctx.isNew(x, z)) { sx += x; sz += z; n++; } });
    if (n >= 8) {
      let gx = 0, gz = 0, bd = 1e18; sx /= n; sz /= n;
      ctx.forCells((k, x, z) => { if (!ctx.isNew(x, z) || !ctx.inside(x, z)) return; const d = (x - sx) * (x - sx) + (z - sz) * (z - sz); if (d < bd) { bd = d; gx = x; gz = z; } });
      const LM = new Uint8Array(gridDims(ctx, 8).w * gridDims(ctx, 8).h), G8 = gridDims(ctx, 8); let any = false;
      for (const L of P.lanes) for (let q = 0; q + 1 < L.pts.length; q += 2) { const i = Math.floor((L.pts[q] - ctx.x0) / 8), j = Math.floor((L.pts[q + 1] - ctx.z0) / 8); if (i >= 0 && j >= 0 && i < G8.w && j < G8.h) { LM[j * G8.w + i] = 1; any = true; } }
      if (any && bd < 1e17) {
        const OCC = ctx.OCC;
        const path = yield* searchPath(ctx, gx, gz, { step: 8, cell: (x, z) => ctx.isWet(x, z) || ctx.occAt(x, z) === OCC.BUILDING || ctx.occAt(x, z) === OCC.WALL ? Infinity : 0, target: (x, z, i, j) => LM[j * G8.w + i] === 1 });
        if (path && path.length >= 6) {
          const rev = new Float32Array(path.length); for (let a = 0, b = path.length - 2; b >= 0; a += 2, b -= 2) { rev[a] = path[b]; rev[a + 1] = path[b + 1]; }
          reach = ctx.geo.chaikin(rev, 2, false);
          stampLane(ctx, reach, 4.5);
          for (const side of [1, -1]) { placed = placed.concat(frontage(ctx, reach, Object.assign(fOpt(side, 4.5), { start: 10 }))); yield* ctx.yieldIfOverBudget(); }
        }
      }
    }
  }
  if (reach) ctx.lane({ pts: reach, rank: 1, w: 4.5, surf: 1, noStamp: true });
  placed.sort((a, b) => hyp(a.x - o.x, a.z - o.z) - hyp(b.x - o.x, b.z - o.z) || a.x - b.x);
  for (const p of placed) emitPlot(ctx, p, { role: 'house', rank: 0, netD: hyp(p.x - o.x, p.z - o.z), wq: wqAt(ctx, p.x, p.z, o, 400) });
}

// =====================================================================================================
// MONASTERY (type 4)
// =====================================================================================================
// the claustral core in a (u east, v towards the cloister) frame; side = +1 cloister south, −1 north
function monLayout(s, j, side, cx, cz, wealth) {
  const cath = s >= 0.85;
  const Wc = cath ? 16 * s : clamp(15 * s, 11, 14), Dc = cath ? 55 * s : clamp(36 * s, 24, 30);
  const nh = cath ? 0.31 * Wc : Wc / 2, ut = 0.1 * Dc, ta = cath ? 0.368 * Wc : 0;
  const C = clamp(Math.min(20 + 12 * s, 0.6 * Dc - ta / 2 + 3.4), 20, 40);
  const dr = 8.5 + wealth;
  const Ex = Math.cos(j), Ez = -Math.sin(j), Sx = Math.sin(j) * side, Sz = Math.cos(j) * side;
  const W2 = (u, v) => [cx + u * Ex + v * Sx, cz + u * Ez + v * Sz];
  const rotE = Math.atan2(Ex, Ez), rotW = Math.atan2(-Ex, -Ez), rotS = Math.atan2(Sx, Sz), rotN = Math.atan2(-Sx, -Sz);
  const vS = cath ? 0.42 * Wc + 0.4 : Wc / 2 + 1;   // clear of the aisles and of a rich front's west towers (≤ 0.416·W)
  const uc = ut - ta / 2 - 0.6 - C / 2, vc = vS + C / 2;
  const mk = (kind, u, v, rot, w, d, ms, wt) => { const p = W2(u, v); return { kind, x: p[0], z: p[1], rot, w, d, ms, wt, u, v }; };
  const church = mk(cath ? 'cathedral' : 'church', 0, 0, rotE, Wc, Dc, 4 + 0.05 * Dc, 1);
  const cloister = mk('cloister', uc, vc, rotE, C, C, 3, 1.5);
  const vA = Wc / 2 + 0.8, vB = vS + C + 0.4 + dr;
  const rE = mk('range', uc + C / 2 + 0.4 + dr / 2, (vA + vB) / 2, rotE, vB - vA, dr, 3.5, 0.6);
  const rS = mk('range', uc, vS + C + 0.4 + dr / 2, rotS, C, dr, 3.5, 0.6);
  const vW0 = vS, vW1 = vS + C + 0.4 + dr;
  const rW = mk('range', uc - C / 2 - 0.4 - dr / 2, (vW0 + vW1) / 2, rotW, vW1 - vW0, dr, 3.5, 0.6);
  return { cath, s, Wc, Dc, nh, vS, ut, ta, C, dr, cx, cz, j, side, W2, rotE, rotW, rotS, rotN, uc, vc, church, cloister, rE, rS, rW, core: [church, cloister, rE, rS, rW] };
}
function monScore(ctx, L, offD) {
  const AL = ctx.ALLOW;
  for (const e of L.core) {
    const P = rectPoly(e.x, e.z, e.rot, e.w, e.d);
    if (!ctx.inH(e.x, e.z) || ctx.isWet(e.x, e.z)) return null;
    for (let i = 0; i < 4; i++) if (!ctx.inH(P[i * 2], P[i * 2 + 1]) || ctx.isWet(P[i * 2], P[i * 2 + 1])) return null;
  }
  let sp = 0;
  for (const e of L.core) {
    if (!ctx.testRect(e.x, e.z, e.rot, e.w, e.d, 0.5, AL.FV)) return null;
    const s = ctx.spread(e.x, e.z, e.rot, e.w, e.d); if (s > e.ms) return null;
    sp += s * e.wt;
  }
  return -sp - 0.012 * offD + 0.5 * Math.min(1, ctx.sdf(L.cx, L.cz) / 60);
}
function waterSide(ctx, x, z) {
  let dN = 1e9, dS = 1e9;
  for (let t = 16; t <= 260; t += 8) for (const ox of [-40, 0, 40]) {
    if (t < dN && ctx.isWet(x + ox, z - t)) dN = t;
    if (t < dS && ctx.isWet(x + ox, z + t)) dS = t;
  }
  return dN < dS && dN < 260 ? -1 : 1;
}
// the precinct: every placed footprint, closed by 10–16 m, traced and smoothed so it never turns sharply
function precinctLoop(ctx, polys, cx, cz, margin) {
  let bb = null;
  for (const p of polys) { const b = bbox(p, 0); if (!bb) bb = b; else { bb[0] = Math.min(bb[0], b[0]); bb[1] = Math.min(bb[1], b[1]); bb[2] = Math.max(bb[2], b[2]); bb[3] = Math.max(bb[3], b[3]); } }
  if (!bb) return null;
  const st = 4, pad = margin + 16, ox = bb[0] - pad, oz = bb[1] - pad;
  const w = Math.ceil((bb[2] - bb[0] + 2 * pad) / st), h = Math.ceil((bb[3] - bb[1] + 2 * pad) / st);
  if (w * h > 900 * 900) return null;
  const m = new Uint8Array(w * h);
  for (const p of polys) fillPoly(m, w, h, ox, oz, st, p);
  const dOut = chamfer(m, w, h, st, 1), dil = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) dil[k] = dOut[k] <= margin + 6 ? 1 : 0;
  const dIn = chamfer(dil, w, h, st, 0), ero = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) ero[k] = dil[k] && dIn[k] > 6 ? 1 : 0;
  const ci = clamp(Math.floor((cx - ox) / st), 0, w - 1), cj = clamp(Math.floor((cz - oz) / st), 0, h - 1);
  let comp = new Uint8Array(w * h);
  if (!flood(ero, comp, w, h, cj * w + ci)) { let best = 0; for (let k = 0; k < w * h; k++) if (ero[k] && !comp[k]) { const t = new Uint8Array(w * h), c = flood(ero, t, w, h, k); if (c > best) { best = c; comp = t; } } }
  const loops = ctx.traceMask(fillHoles(comp, w, h), w, h, ox, oz, st);
  if (!loops.length) return null;
  let loop = ctx.geo.chaikin(ctx.geo.dp(loops[0], 3, true), 2, true);
  loop = ctx.geo.resample(loop, 7, true);
  return smoothTurns(loop, 24 * DEG, 12);
}
function* planMonastery(ctx) {
  if (ctx.empty || ctx.kind === 'infill') return;
  if (ctx.prev) { yield* monasteryGrange(ctx); return; }
  const OCC = ctx.OCC, tw = ctx.tw, wealth = tw.wealth, dens = tw.dens, gardens = tw.gardens;
  const R = ctx.rng('abbey');

  // ---- 1. fit the claustral core: scales (largest first) × centres × rotations −15..15° ---------------------
  const bases = [];
  if (ctx.S.pin) bases.push([ctx.S.pin[0], ctx.S.pin[1]]);
  else {
    bases.push([ctx.centroid.x, ctx.centroid.z]);
    let bs = -1e9, bx = 0, bz = 0; for (let i = 0; i < ctx.cells.length; i++) { const c = ctx.cellCenter(ctx.cells[i]), s = ctx.sdf(c[0], c[1]); if (s > bs) { bs = s; bx = c[0]; bz = c[1]; } }
    if (hyp(bx - ctx.centroid.x, bz - ctx.centroid.z) > 20) bases.push([bx, bz]);
  }
  const side = waterSide(ctx, bases[0][0], bases[0][1]);
  const Rz = Math.sqrt(ctx.areaM2 / PI);
  const offStep = Math.max(10, Math.round(Rz / 5)), offMax = Math.max(40, Math.round(Rz * 0.6 / offStep) * offStep);
  const offs = [];
  for (let oz = -offMax; oz <= offMax; oz += offStep) for (let ox = -offMax; ox <= offMax; ox += offStep) offs.push([ox, oz, hyp(ox, oz)]);
  offs.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  if (offs.length > 121) offs.length = 121;
  const sTop = clamp(0.8 + 0.18 * Math.sqrt(ctx.areaHa) + 0.15 * wealth, 0.8, 1.55);
  let best = null, evals = 0;
  for (let s = sTop; s >= 0.6 && !best; s *= 0.88) {
    for (const b of bases) for (const o of offs) {
      const cx = b[0] + o[0], cz = b[1] + o[1];
      if (!ctx.inH(cx, cz)) continue;
      for (let jd = -15; jd <= 15; jd += 5) {
        const L = monLayout(s, jd * DEG, side, cx, cz, wealth), sc = monScore(ctx, L, o[2]);
        if (sc !== null && (!best || sc > best.sc)) best = { sc, L };
        if ((++evals & 7) === 7) yield* ctx.yieldIfOverBudget();
      }
    }
  }
  if (!best) { ctx.toast(`${ctx.S.name || 'The monastery'}: this ground is too small or too steep for an abbey. Paint a larger, gentler area.`); return; }
  const L = best.L, W2 = L.W2, s1 = Math.max(1, L.s);
  // stamp the core
  if (L.cath) {
    const nb = W2(0, 0), tr = W2(L.ut, 0);
    ctx.stampRect(nb[0], nb[1], L.rotE, 0.84 * L.Wc, L.Dc, OCC.BUILDING, 0.5);
    ctx.stampRect(tr[0], tr[1], L.rotE, L.Wc, L.ta + 1, OCC.BUILDING, 0.5);
  } else ctx.stampRect(L.church.x, L.church.z, L.rotE, L.Wc, L.Dc, OCC.BUILDING, 0.5);
  for (const e of [L.cloister, L.rE, L.rS, L.rW]) { ctx.stampRect(e.x, e.z, e.rot, e.w, e.d, OCC.BUILDING, 0.5); regAdd(ctx, e); }
  regAdd(ctx, L.church);
  yield* ctx.yieldIfOverBudget();

  // ---- 2. Lady chapel at the east end, monks' cemetery on the far side of the nave, the garth ----------------
  let lady = null;
  { const p = W2(L.Dc / 2 + 0.3 + 6, 0); if (ctx.fits(p[0], p[1], L.rotE, 7.5, 12, { pad: 0.3, allow: ctx.ALLOW.FV, maxSpread: 3.5, inside: 'H' })) { lady = { x: p[0], z: p[1] }; ctx.stampRect(p[0], p[1], L.rotE, 7.5, 12, OCC.BUILDING, 0.3); regAdd(ctx, { x: p[0], z: p[1], rot: L.rotE, w: 7.5, d: 12 }); } }
  let cemetery = null;
  {
    const uA = -L.Dc / 2 + 3, uB = L.ut - L.ta / 2 - 1.5, cw = 12 + 4 * s1, v0 = (L.cath ? 0.42 * L.Wc : L.Wc / 2) + 2;
    if (uB - uA > 12) { const p = W2((uA + uB) / 2, -(v0 + cw / 2)); cemetery = placeArea(ctx, p[0], p[1], L.rotE, cw, uB - uA, OCC.PRECINCT, [0, 4, 8]); }
  }
  const walk = clamp(L.C * 0.1, 2.8, 3.6), garth = rectPoly(L.cloister.x, L.cloister.z, L.rotE, L.C - 2 * walk - 1.2, L.C - 2 * walk - 1.2);

  // ---- 3. outer court (west), infirmary (south-east), gardens, fishponds --------------------------------------
  const K = W2(-L.Dc / 2 - 20, -4);
  const faceK = (x, z) => rotFront(K[0] - x, K[1] - z);
  const court = [];
  const courtSpec = [
    { kind: 'hall', w: 11 + 2 * wealth, d: 17 + 3 * wealth, at: W2(-L.Dc / 2 - 11, -(L.Wc / 2 + 14)) },
    { kind: 'barn', w: 20 + 4 * wealth, d: 10.5, at: W2(-L.Dc / 2 - 42, 8) },
    { kind: 'stable', w: 12, d: 6, at: W2(-L.Dc / 2 - 33, -(L.Wc / 2 + 16)) },
    { kind: 'granary', w: 5.5, d: 4.5, at: W2(-L.Dc / 2 - 45, -10) }
  ];
  for (const c of courtSpec) { const p = placeNear(ctx, c.at[0], c.at[1], faceK, c.w, c.d, { maxSpread: Math.max(3, 0.35 * Math.min(c.w, c.d)) }); if (p) court.push({ kind: c.kind, x: p.x, z: p.z, rot: p.rot, w: c.w, d: c.d }); }
  const well = placeNear(ctx, K[0], K[1], L.rotE, 3.4, 3.4, { pad: 1.2, maxSpread: 1.5, radii: [0, 4, 8, 12] });
  yield* ctx.yieldIfOverBudget();
  const infW = 20 + 4 * wealth, infAt = W2(L.ut + L.ta / 2 + 8 + infW / 2, L.vS + L.C * 0.55);
  const inf = placeNear(ctx, infAt[0], infAt[1], L.rotS, infW, 8.5, { maxSpread: 3.5, radii: [0, 6, 12, 18, 26, 34] });
  let herb = null, orchard = null;
  {
    const hw = 16 * s1, hd = 12 * s1;
    const hp = inf ? toW(inf.x, inf.z, L.rotS, 0, 4.25 + 1.5 + hd / 2) : W2(L.ut + L.ta / 2 + 16, L.vS + L.C * 0.55 + 12);
    herb = placeArea(ctx, hp[0], hp[1], L.rotS, hw, hd, OCC.PRECINCT);
    const ow = (24 + 14 * gardens) * s1, od = (20 + 8 * gardens) * s1;
    const op = W2(L.uc, L.vS + L.C + 0.4 + L.dr + 4 + od / 2);
    orchard = placeArea(ctx, op[0], op[1], L.rotS, ow, od, OCC.FIELD, [0, 8, 16, 24, 34]);
  }
  // fishponds: the low, flat, dry ground near the abbey (nearer water is better), in a little chain
  const ponds = [];
  {
    const nP = Math.min(3, 1 + (gardens > 0.4 ? 1 : 0) + (R() < gardens * 0.6 ? 1 : 0));
    const RP = ctx.rng('ponds');
    let bestP = null, bs = -1e9;
    for (let dz = -160; dz <= 160; dz += 8) for (let dx = -160; dx <= 160; dx += 8) {
      const x = L.cx + dx, z = L.cz + dz, rr = RP();
      if (!ctx.inH(x, z) || ctx.isWet(x, z) || ctx.occAt(x, z) !== 0) continue;
      const sc = -ctx.h4(x, z) - 0.012 * hyp(dx, dz) + (ctx.waterDist(x, z) < 150 ? 4 : 0) + rr * 0.5;
      if (sc <= bs) continue;
      if (!ctx.fits(x, z, L.rotE, 16, 10, { pad: 1.5, allow: ctx.ALLOW.FV, maxSpread: 0.9, inside: 'H' })) continue;
      bs = sc; bestP = [x, z];
    }
    if (bestP) {
      let px = bestP[0], pz = bestP[1];
      for (let k = 0; k < nP; k++) {
        const w = 10 + 6 * RP(), d = 6 + 4 * RP();
        const p = k === 0 ? placeNear(ctx, px, pz, L.rotE, w, d, { pad: 1.2, maxSpread: 0.9, radii: [0, 4] })
          : placeNear(ctx, px, pz, L.rotE, w, d, { pad: 1.2, maxSpread: 0.9, radii: [w / 2 + 9, w / 2 + 14], phase: 0 });
        if (!p) break;
        ponds.push({ x: p.x, z: p.z, w, d }); px = p.x; pz = p.z;
      }
    }
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 4. precinct wall, gate, approach ----------------------------------------------------------------------
  const polys = [];
  polys.push(rectPoly(L.church.x, L.church.z, L.rotE, L.Wc, L.Dc));
  for (const e of [L.cloister, L.rE, L.rS, L.rW]) polys.push(rectPoly(e.x, e.z, e.rot, e.w, e.d));
  if (lady) polys.push(rectPoly(lady.x, lady.z, L.rotE, 7.5, 12));
  if (cemetery) polys.push(cemetery.poly);
  for (const c of court) polys.push(rectPoly(c.x, c.z, c.rot, c.w, c.d));
  polys.push(discPoly(K[0], K[1], 10, 12));
  if (inf) polys.push(rectPoly(inf.x, inf.z, inf.rot, infW, 8.5));
  if (herb) polys.push(herb.poly);
  if (orchard) polys.push(orchard.poly);
  for (const p of ponds) polys.push(rectPoly(p.x, p.z, L.rotE, p.w, p.d));
  let ploop = precinctLoop(ctx, polys, L.church.x, L.church.z, 9 + 4 * wealth);
  if (ploop) { ploop = smoothTurns(pullIntoH(ctx, ploop, L.church.x, L.church.z), 24 * DEG, 6); if (Math.abs(sArea(ploop)) < 2000) ploop = null; }
  let gate = null, outer = null, innerL = null;
  if (ploop) {
    ctx.stampPolyline(Float32Array.from(Array.from(ploop).concat([ploop[0], ploop[1]])), 1.8, OCC.WALL, 0);
    const path = yield* approach(ctx, K[0], K[1], ploop, 10);
    if (path && path.length >= 4) {
      const g = gateFrom(ctx.geo.chaikin(path, 2, false), ploop);
      if (g && g.outer.length >= 4) { gate = { x: g.x, z: g.z, li: g.li }; outer = g.outer; innerL = g.inner; }
    }
    if (!gate) { const far = W2(-L.Dc / 2 - 400, 0), q = nearestOn(ploop, far[0], far[1], true); gate = { x: q.x, z: q.z, li: q.i }; }
  } else {
    const q = W2(-L.Dc / 2 - 34, 0); gate = { x: q[0], z: q[1], li: -1 };
  }
  let gh = null;
  const gates = [{ x: gate.x, z: gate.z, kind: 'postern' }];
  if (ploop) {
    const eo = edgeOut(ploop, gate.li >= 0 ? gate.li : nearestOn(ploop, gate.x, gate.z, true).i);
    gh = { x: gate.x, z: gate.z, rot: rotBack(-eo[0], -eo[1]) };
    if (!outer) { const o = [gate.x, gate.z]; for (let t = 6; t <= 60; t += 6) { const x = gate.x + eo[0] * t, z = gate.z + eo[1] * t; if (ctx.isWet(x, z) || x < 1 || z < 1 || x > SIZE - 1 || z > SIZE - 1) break; o.push(x, z); } if (o.length >= 4) outer = Float32Array.from(o); }
    if (loopLen(ploop) > 320) { // an east postern towards the fields and fishponds
      let bi = -1, bs = -1e9; const Ex = Math.cos(L.j), Ez = -Math.sin(L.j);
      for (let i = 0; i < ploop.length >> 1; i++) { const x = ploop[i * 2], z = ploop[i * 2 + 1]; if (hyp(x - gate.x, z - gate.z) < 110) continue; const s = (x - L.cx) * Ex + (z - L.cz) * Ez; if (s > bs) { bs = s; bi = i; } }
      if (bi >= 0) gates.push({ x: ploop[bi * 2], z: ploop[bi * 2 + 1], kind: 'postern' });
    }
  }
  const westDoor = W2(-L.Dc / 2 - 2.5, 0);
  const inLane = [];
  if (innerL && innerL.length >= 4) { for (let q = innerL.length - 2; q >= 0; q -= 2) inLane.push(innerL[q], innerL[q + 1]); }
  else inLane.push(gate.x, gate.z, K[0], K[1]);
  inLane.push(westDoor[0], westDoor[1]);
  const laneW = 5 + wealth;
  if (outer) stampLane(ctx, outer, laneW);
  stampLane(ctx, inLane, 4);
  // outer court ground
  const cpts = [K[0], K[1]]; for (const c of court) { const P = rectPoly(c.x, c.z, c.rot, c.w, c.d); for (let i = 0; i < 8; i++) cpts.push(P[i]); }
  const courtPoly = court.length >= 2 ? offsetLoop(hull(Float32Array.from(cpts)), 3) : discPoly(K[0], K[1], 14, 12);

  // ---- emission: chapel, church, cemetery, cloister, ranges, precinct, outer court, infirmary, gardens -------
  ctx.setOrigin(L.church.x, L.church.z, 'monastery');
  if (lady) ctx.special({ kind: 'chapel', x: lady.x, z: lady.z, rot: L.rotE, w: 7.5, d: 12, extra: { orient: 'east', lady: 1 }, noStamp: true });
  ctx.special({ kind: L.church.kind, x: L.church.x, z: L.church.z, rot: L.rotE, w: L.Wc, d: L.Dc, var: (ctx.style && ctx.style.churchStyle) | 0, extra: { orient: 'east', abbey: 1 }, noStamp: true });
  if (cemetery) ctx.area({ cls: 4, poly: cemetery.poly, noStamp: true });
  ctx.special({ kind: 'cloister', x: L.cloister.x, z: L.cloister.z, rot: L.rotE, w: L.C, d: L.C, noStamp: true });
  ctx.area({ cls: 3, poly: garth, noStamp: true });
  for (const e of [L.rE, L.rS, L.rW]) ctx.special({ kind: 'range', x: e.x, z: e.z, rot: e.rot, w: e.w, d: e.d, extra: { floors: 2 }, noStamp: true });
  if (ploop) {
    ctx.special({ kind: 'precinct', x: L.church.x, z: L.church.z, extra: { loop: ploop, gates }, noStamp: true });
    if (gh) ctx.special({ kind: 'gatehouse', x: gh.x, z: gh.z, rot: gh.rot, w: 16, d: 10, h: 7.5 + 2 * wealth, extra: { abbey: 1 }, noStamp: true });
  }
  if (outer) ctx.lane({ pts: outer, rank: 0, w: laneW, surf: 1, noStamp: true });
  ctx.lane({ pts: Float32Array.from(inLane), rank: 1, w: 4, surf: 1, noStamp: true });
  ctx.area({ cls: 1, poly: courtPoly, noStamp: true });
  for (const c of court) ctx.special({ kind: c.kind, x: c.x, z: c.z, rot: c.rot, w: c.w, d: c.d, noStamp: true });
  if (well) ctx.special({ kind: 'well', x: well.x, z: well.z, rot: well.rot, w: 3.4, d: 3.4, noStamp: true });
  if (inf) ctx.special({ kind: 'range', x: inf.x, z: inf.z, rot: inf.rot, w: infW, d: 8.5, extra: { floors: 2, infirmary: 1 }, noStamp: true });
  if (herb) ctx.area({ cls: 16, poly: herb.poly, ang: herb.rot, noStamp: true });
  if (orchard) ctx.area({ cls: 13, poly: orchard.poly, ang: orchard.rot, noStamp: true });
  for (const p of ponds) ctx.special({ kind: 'pond', x: p.x, z: p.z, rot: L.rotE + (R() - 0.5) * 0.1, w: p.w, d: p.d, noStamp: true });
  void dens;
}
// expansion: an outlying grange (barn, granary, orchard, a pond) in the new land, joined by a track
function* monasteryGrange(ctx) {
  const OCC = ctx.OCC, tw = ctx.tw;
  let sx = 0, sz = 0, n = 0;
  ctx.forCells((k, x, z) => { if (ctx.isNew(x, z)) { sx += x; sz += z; n++; } });
  if (n < 6) return;
  const R = ctx.rng('grange', ctx.epoch), o = ctx.origin || { x: ctx.centroid.x, z: ctx.centroid.z };
  // the new cell nearest the new land's centroid
  let gx = sx / n, gz = sz / n, bd = 1e18;
  ctx.forCells((k, x, z) => { if (!ctx.isNew(x, z)) return; const d = (x - sx / n) * (x - sx / n) + (z - sz / n) * (z - sz / n); if (d < bd) { bd = d; gx = x; gz = z; } });
  const face = (x, z) => rotFront(o.x - x, o.z - z);
  const isNew = (x, z) => ctx.isNew(x, z);
  const barn = placeNear(ctx, gx, gz, face, 22, 10.5, { maxSpread: 3.5, radii: [0, 8, 16, 24, 34, 46], test: isNew });
  if (!barn) return;
  const gran = placeNear(ctx, barn.x, barn.z, barn.rot, 5.5, 4.5, { maxSpread: 2, radii: [16, 20, 26], test: isNew });
  const orch = placeArea(ctx, barn.x + (R() - 0.5) * 30, barn.z + (R() - 0.5) * 30, barn.rot, 30 + 12 * tw.gardens, 24, OCC.FIELD, [30, 40, 52]);
  const pond = placeNear(ctx, barn.x, barn.z, barn.rot, 12, 7, { maxSpread: 0.9, pad: 1.2, radii: [22, 30, 40, 52], test: isNew });
  // a track from the nearest existing lane
  let track = null;
  if (ctx.prev) {
    let bp = null, bdd = 1e18;
    for (const Ln of ctx.prev.lanes) for (let q = 0; q + 1 < Ln.pts.length; q += 2) { const d = hyp(Ln.pts[q] - barn.x, Ln.pts[q + 1] - barn.z); if (d < bdd) { bdd = d; bp = [Ln.pts[q], Ln.pts[q + 1]]; } }
    const front = toW(barn.x, barn.z, barn.rot, 0, -10.5 / 2 - 3);
    if (bp && bdd < 900) {
      const path = yield* searchPath(ctx, front[0], front[1], { step: 8, cell: (x, z) => ctx.isWet(x, z) || ctx.occAt(x, z) === OCC.BUILDING ? Infinity : 0, target: (x, z) => hyp(x - bp[0], z - bp[1]) < 8 });
      if (path && path.length >= 4) { track = ctx.geo.chaikin(path, 2, false); stampLane(ctx, track, 3.5); }
    }
  }
  if (track) ctx.lane({ pts: track, rank: 3, w: 3.5, surf: 1, noStamp: true });
  ctx.special({ kind: 'barn', x: barn.x, z: barn.z, rot: barn.rot, w: 22, d: 10.5, noStamp: true });
  if (gran) ctx.special({ kind: 'granary', x: gran.x, z: gran.z, rot: gran.rot, w: 5.5, d: 4.5, noStamp: true });
  if (orch) ctx.area({ cls: 13, poly: orch.poly, ang: orch.rot, noStamp: true });
  if (pond) ctx.special({ kind: 'pond', x: pond.x, z: pond.z, rot: pond.rot, w: 12, d: 7, noStamp: true });
}

// =====================================================================================================
// HARBOUR (type 5)
// =====================================================================================================
const BOAT_DIM = [[1.6, 4.4], [2.7, 8], [6.5, 20]], BOAT_DRAFT = [0.4, 0.9, 2.0];
function* planHarbour(ctx) {
  if (ctx.empty || ctx.kind === 'infill') return;
  const OCC = ctx.OCC, AL = ctx.ALLOW, tw = ctx.tw, dens = tw.dens, wealth = tw.wealth, gardens = tw.gardens;
  const R = ctx.rng('harbour', ctx.epoch);
  const expand = ctx.kind === 'expand';
  const mine = (x, z) => ctx.inH(x, z) && (!expand || ctx.isNew(x, z));

  // ---- 1. shoreline (marching squares of water − land at 4 m), split into runs on our land ----------------
  const chains = ctx.shoreline();
  yield* ctx.yieldIfOverBudget();
  const runs = [];
  for (const ch of chains) {
    if (!ch.len || ch.len < 16) continue;
    const p = ctx.geo.resample(ch.pts, 4, ch.closed), n = p.length >> 1; if (n < 4) continue;
    const raw = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = ch.closed ? (i + n - 1) % n : Math.max(0, i - 1), b = ch.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      let tx = p[b * 2] - p[a * 2], tz = p[b * 2 + 1] - p[a * 2 + 1]; const tl = hyp(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx, x = p[i * 2], z = p[i * 2 + 1];
      let wa = 0, wb = 0;
      for (const t of [5, 10, 16]) { if (ctx.isWet(x + nx * t, z + nz * t)) wa++; if (ctx.isWet(x - nx * t, z - nz * t)) wb++; }
      let ox = nx, oz = nz;
      if (wb > wa) { ox = -nx; oz = -nz; }
      else if (wa === wb) { const g = ctx.gradAt(x, z), gl = hyp(g[0], g[1]); if (gl > 1e-4) { ox = -g[0] / gl; oz = -g[1] / gl; } }
      raw[i * 2] = ox; raw[i * 2 + 1] = oz;
    }
    const out = new Float32Array(n * 2), ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sz = 0;
      for (let k = -2; k <= 2; k++) { const q = ch.closed ? (i + k + n) % n : clamp(i + k, 0, n - 1); sx += raw[q * 2]; sz += raw[q * 2 + 1]; }
      const l = hyp(sx, sz) || 1; out[i * 2] = sx / l; out[i * 2 + 1] = sz / l;
      const x = p[i * 2], z = p[i * 2 + 1], ox = out[i * 2], oz = out[i * 2 + 1];
      if (!(mine(x, z) || mine(x - ox * 8, z - oz * 8))) continue;
      let deep = 0; for (const t of [6, 12, 20, 30]) deep = Math.max(deep, ctx.depthAt(x + ox * t, z + oz * t));
      ok[i] = deep > 0.6 ? 1 : 0;
    }
    // runs of consecutive usable points (wrapping on closed chains)
    let start = 0;
    if (ch.closed) { start = -1; for (let i = 0; i < n; i++) if (!ok[i]) { start = i; break; } }
    const idxRuns = [];
    if (start < 0) idxRuns.push(Array.from({ length: n }, (_, k) => k));
    else { let cur = []; for (let s = 0; s < n; s++) { const i = ch.closed ? (start + s) % n : s; if (ok[i]) cur.push(i); else { if (cur.length) idxRuns.push(cur); cur = []; } } if (cur.length) idxRuns.push(cur); }
    for (const r of idxRuns) {
      if (r.length < 6) continue;
      const pts = new Float32Array(r.length * 2), nrm = new Float32Array(r.length * 2);
      r.forEach((i, k) => { pts[k * 2] = p[i * 2]; pts[k * 2 + 1] = p[i * 2 + 1]; nrm[k * 2] = out[i * 2]; nrm[k * 2 + 1] = out[i * 2 + 1]; });
      runs.push({ pts, out: nrm, len: plLen(pts), ri: runs.length });
    }
    yield* ctx.yieldIfOverBudget();
  }
  runs.sort((a, b) => b.len - a.len || a.pts[0] - b.pts[0]);
  runs.forEach((r, i) => { r.ri = i; });
  // shore point buckets (16 m) for "near the shore" tests
  const SB = new Map();
  for (const r of runs) for (let i = 0; i < r.pts.length; i += 2) { const k = Math.floor(r.pts[i] / 16) * 4096 + Math.floor(r.pts[i + 1] / 16); let a = SB.get(k); if (!a) SB.set(k, a = []); a.push(r.pts[i], r.pts[i + 1]); }
  const nearShore = (x, z, rad) => {
    const bx0 = Math.floor((x - rad) / 16), bx1 = Math.floor((x + rad) / 16), bz0 = Math.floor((z - rad) / 16), bz1 = Math.floor((z + rad) / 16), r2 = rad * rad;
    for (let bx = bx0; bx <= bx1; bx++) for (let bz = bz0; bz <= bz1; bz++) { const a = SB.get(bx * 4096 + bz); if (a) for (let i = 0; i < a.length; i += 2) if ((a[i] - x) * (a[i] - x) + (a[i + 1] - z) * (a[i + 1] - z) <= r2) return true; }
    return false;
  };

  // ---- 2. strand: a lane 10–18 m inland along the water (a contour of the distance to water) ------------------
  const strands = [];
  if (runs.length) {
    const lev = (x, z) => ctx.waterDist(x, z) - (14 + 4 * ctx.fbm(x / 70, z / 70));
    let rb = null;
    for (const r of runs) { const b = bbox(r.pts, 44); if (!rb) rb = b; else { rb[0] = Math.min(rb[0], b[0]); rb[1] = Math.min(rb[1], b[1]); rb[2] = Math.max(rb[2], b[2]); rb[3] = Math.max(rb[3], b[3]); } }
    const cx0 = Math.max(ctx.x0, Math.floor(rb[0] / 4) * 4), cz0 = Math.max(ctx.z0, Math.floor(rb[1] / 4) * 4), cx1 = Math.min(ctx.x1, Math.ceil(rb[2] / 4) * 4), cz1 = Math.min(ctx.z1, Math.ceil(rb[3] / 4) * 4);
    const cs = cx1 - cx0 >= 16 && cz1 - cz0 >= 16 ? ctx.contours(lev, 0, 4, cx0, cz0, cx1, cz1) : [];
    yield* ctx.yieldIfOverBudget();
    const okS = (x, z) => {
      if (!ctx.inside(x, z) || (expand && !ctx.isNew(x, z)) || ctx.isWet(x, z) || ctx.slopeAt(x, z) > 0.22) return false;
      const oc = ctx.occAt(x, z); if (!(oc === 0 || oc === OCC.VERGE || oc === OCC.ROAD || oc === OCC.FIELD)) return false;
      return nearShore(x, z, 28);
    };
    const cand = [];
    for (const c of cs) {
      if (!c.len || c.len < 30) continue;
      const p = ctx.geo.resample(c.pts, 4, c.closed), n = p.length >> 1;
      let cur = [];
      const flush = () => { if (cur.length >= 10) cand.push(Float32Array.from(cur)); cur = []; };
      for (let i = 0; i < n; i++) { if (okS(p[i * 2], p[i * 2 + 1])) cur.push(p[i * 2], p[i * 2 + 1]); else flush(); }
      flush();
    }
    cand.sort((a, b) => plLen(b) - plLen(a) || a[0] - b[0]);
    for (const c of cand) { if (strands.length >= 3) break; const pts = ctx.geo.chaikin(c, 1, false); if (strands.some(s => polyNear(s.pts, pts, 12))) continue; strands.push({ pts, len: plLen(pts), w: strands.length ? 4.5 : 5.5 + 2 * dens }); }
    if (!strands.length) { // narrow ground: follow the shore 9 m inland
      const r = runs[0], o = [];
      for (let i = 0; i < r.pts.length; i += 2) { const x = r.pts[i] - r.out[i] * 9, z = r.pts[i + 1] - r.out[i + 1] * 9; if (mine(x, z) && !ctx.isWet(x, z) && ctx.slopeAt(x, z) < 0.25) o.push(x, z); else if (o.length >= 12) break; else o.length = 0; }
      if (o.length >= 12) { const pts = ctx.geo.chaikin(Float32Array.from(o), 1, false); strands.push({ pts, len: plLen(pts), w: 4.5 + 2 * dens }); }
    }
  }
  // expansions: the old waterfront lanes keep growing inland lanes and plots into the new land
  if (expand) for (const g of laneGroups(ctx.prev.lanes, L => L.rank === 0)) if (g.pts.length >= 8) strands.push({ pts: g.pts, len: plLen(g.pts), w: g.w, old: true });
  if (!runs.length && !strands.length) {
    if (!expand) ctx.toast('A harbour needs to touch the sea, a lake or a river.');
    return;
  }
  for (const s of strands) {
    let vote = 0; const p = s.pts;
    for (let i = 2; i + 1 < p.length; i += 6) { const tx = p[i] - p[i - 2], tz = p[i + 1] - p[i - 1], l = hyp(tx, tz) || 1, nx = -tz / l, nz = tx / l; vote += ctx.waterDist(p[i] + nx * 8, p[i + 1] + nz * 8) >= ctx.waterDist(p[i] - nx * 8, p[i + 1] - nz * 8) ? 1 : -1; }
    s.land = vote >= 0 ? 1 : -1;
    if (!s.old) stampLane(ctx, s.pts, s.w);
  }

  // ---- 3. piers where the depth grows fastest ---------------------------------------------------------------
  const pierW = 3.2 + 1.2 * wealth, main = strands.find(s => !s.old) || strands[0] || null;
  const cands = [];
  for (const r of runs) {
    const n = r.pts.length >> 1;
    for (let i = 1; i < n - 1; i++) {
      const x = r.pts[i * 2], z = r.pts[i * 2 + 1], ox = r.out[i * 2], oz = r.out[i * 2 + 1], rr = R();
      const lx = x - ox * 3, lz = z - oz * 3;
      if (!mine(lx, lz) || ctx.isWet(lx, lz)) continue;
      const oc = ctx.occAt(lx, lz); if (oc === OCC.BUILDING || oc === OCC.ROAD || oc === OCC.YARD) continue;
      let L22 = -1;
      for (let k = 2; k <= 72; k += 2) { const qx = x + ox * k, qz = z + oz * k; if (qx < 2 || qz < 2 || qx > SIZE - 2 || qz > SIZE - 2) break; if (k > 4 && !ctx.isWet(qx, qz)) break; if (ctx.depthAt(qx, qz) > 2.2) { L22 = k; break; } }
      if (L22 < 0) continue;
      const turn = Math.abs(angDiff(Math.atan2(r.out[i * 2 - 1], r.out[i * 2 - 2]), Math.atan2(r.out[i * 2 + 3], r.out[i * 2 + 2])));
      const nearStr = !main || dLine(main.pts, x, z) < 34;
      cands.push({ x, z, ox, oz, L22, sc: -L22 + (nearStr ? 10 : 0) - 8 * turn + 3 * rr, ri: r.ri, i });
    }
  }
  cands.sort((a, b) => b.sc - a.sc || a.ri - b.ri || a.i - b.i);
  let totalLen = 0; for (const r of runs) totalLen += r.len;
  const nMax = clamp(Math.round(totalLen / lerp(120, 60, dens)), runs.length ? 1 : 0, 6);
  const piers = [];
  for (const c of cands) {
    if (piers.length >= nMax) break;
    const spacing = lerp(80, 40, dens) * (0.85 + 0.3 * R());
    if (piers.some(p => hyp(p.x - c.x, p.z - c.z) < spacing)) continue;
    const Lp = clamp(c.L22 + 4, 20, 70);
    let Lok = 0; for (let k = 4; k <= Lp; k += 2) { if (!ctx.isWet(c.x + c.ox * k, c.z + c.oz * k)) break; Lok = k; }
    if (Lok < 14) continue;
    const pts = [c.x - c.ox * 3, c.z - c.oz * 3, c.x, c.z, c.x + c.ox * Lok, c.z + c.oz * Lok];
    if (wealth > 0.55 && Lok >= 30) { // a T-head on rich piers
      const sg = R() < 0.5 ? 1 : -1, px = -c.oz * sg, pz = c.ox * sg, hl = 8 + 6 * wealth, ex = c.x + c.ox * Lok, ez = c.z + c.oz * Lok;
      let ok = true; for (let t = 2; t <= hl; t += 2) if (!ctx.isWet(ex + px * t, ez + pz * t) || ctx.depthAt(ex + px * t, ez + pz * t) < 1.2) ok = false;
      if (ok) pts.push(ex + px * hl, ez + pz * hl);
    }
    const P = Float32Array.from(pts);
    if (piers.some(p => polyNear(p.pts, P, 12))) continue;
    piers.push({ x: c.x, z: c.z, ox: c.ox, oz: c.oz, pts: P, L: Lok, len: plLen(P) });
    ctx.stampPolyline(P.slice(0, 4), pierW / 2 + 1, OCC.BUILDING, 0);
  }
  piers.sort((a, b) => b.len - a.len || a.x - b.x);
  const mp = piers[0] || null;
  if (!ctx.origin) {
    if (mp) ctx.setOrigin(mp.x - mp.ox * 6, mp.z - mp.oz * 6, 'harbour');
    else if (main) { const q = main.pts, m = (q.length >> 2) * 2; ctx.setOrigin(q[m], q[m + 1], 'harbour'); }
    else ctx.setOrigin(runs[0].pts[0], runs[0].pts[1], 'harbour');
  }
  const origin = ctx.origin, Rmax = Math.max(120, Math.sqrt(ctx.areaM2 / PI));
  const dist = (x, z) => hyp(x - origin.x, z - origin.z);
  yield* ctx.yieldIfOverBudget();

  // ---- 4. quays where deep water comes close ------------------------------------------------------------------
  const quays = [];
  if (wealth >= 0.4 && runs.length) {
    const maxQ = wealth > 0.75 ? 4 : 3;
    for (const r of runs) {
      const n = r.pts.length >> 1, q22 = new Float32Array(n);
      for (let i = 0; i < n; i++) { q22[i] = 99; const x = r.pts[i * 2], z = r.pts[i * 2 + 1], ox = r.out[i * 2], oz = r.out[i * 2 + 1]; for (let k = 2; k <= 12; k += 2) if (ctx.depthAt(x + ox * k, z + oz * k) > 2.2) { q22[i] = k; break; } }
      let i = 0;
      while (i < n && quays.length < maxQ) {
        if (q22[i] > 12) { i++; continue; }
        let j = i; while (j + 1 < n && q22[j + 1] <= 12 && j - i < 6) j++;
        if (j - i >= 3) {
          const ax = r.pts[i * 2], az = r.pts[i * 2 + 1], bx = r.pts[j * 2], bz = r.pts[j * 2 + 1];
          let dev = 0, sox = 0, soz = 0; for (let k = i; k <= j; k++) { dev = Math.max(dev, Math.sqrt(segD2(r.pts[k * 2], r.pts[k * 2 + 1], ax, az, bx, bz))); sox += r.out[k * 2]; soz += r.out[k * 2 + 1]; }
          const ol = hyp(sox, soz) || 1, ox = sox / ol, oz = soz / ol, mx = (ax + bx) / 2, mz = (az + bz) / 2, w = hyp(bx - ax, bz - az) + 2;
          const clearP = !piers.some(p => segD2(p.x, p.z, ax, az, bx, bz) < 144);
          const lx = mx - ox * 1.5, lz = mz - oz * 1.5, rot = rotBack(-ox, -oz);
          const land = [[lx, lz], toW(lx, lz, rot, -w / 2 + 1, 0), toW(lx, lz, rot, w / 2 - 1, 0)].every(p => mine(p[0], p[1]) && !ctx.isWet(p[0], p[1]) && (ctx.occAt(p[0], p[1]) === 0 || ctx.occAt(p[0], p[1]) === OCC.VERGE));
          if (dev < 2.5 && clearP && land && w >= 12) {
            const dq = 6, qx = mx + ox * (dq / 2 - 2), qz = mz + oz * (dq / 2 - 2);
            quays.push({ x: qx, z: qz, rot, w, d: dq, ox, oz, mx, mz }); regAdd(ctx, quays[quays.length - 1]);
            ctx.stampRect(qx, qz, rot, w, dq, OCC.BUILDING, 0.5);
          }
        }
        i = j + 2;
      }
      if (quays.length >= maxQ) break;
    }
  }

  // ---- 5. crane, tavern, storehouses (landward of the strand) ----------------------------------------------------
  let crane = null;
  if (mp && wealth > 0.6) {
    const px = -mp.oz, pz = mp.ox;
    for (const sg of [1, -1]) { if (crane) break; for (const back of [4, 7, 10]) {
      const cx = mp.x - mp.ox * back + px * sg * (pierW / 2 + 4.2), cz = mp.z - mp.oz * back + pz * sg * (pierW / 2 + 4.2), rot = rotBack(-mp.ox, -mp.oz);
      if (ctx.fits(cx, cz, rot, 6, 6, { pad: 0.3, allow: AL.FV, maxSpread: 3, inside: 'H' }) && !regHit(ctx, { x: cx, z: cz, rot, w: 6, d: 6 }, 0.5)) { ctx.stampRect(cx, cz, rot, 6, 6, OCC.BUILDING, 0.3); crane = { x: cx, z: cz, rot, w: 6, d: 6 }; regAdd(ctx, crane); break; }
    } }
  }
  const onStrand = (w, d, near, maxD, setback) => {
    for (const s of strands) {
      const P = ctx.geo.resample(s.pts, 2, false), n = P.length >> 1, idx = [];
      for (let i = 1; i < n; i++) { const dd = hyp(P[i * 2] - near.x, P[i * 2 + 1] - near.z); if (dd <= maxD) idx.push([dd, i]); }
      idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [, i] of idx) {
        const dx = P[i * 2] - P[i * 2 - 2], dz = P[i * 2 + 1] - P[i * 2 - 1], l = hyp(dx, dz) || 1, nx = -dz / l * s.land, nz = dx / l * s.land;
        const off = s.w / 2 + 1.2 + setback + d / 2, cx = P[i * 2] + nx * off, cz = P[i * 2 + 1] + nz * off, rot = Math.atan2(nx, nz);
        if (!mine(cx, cz)) continue;
        if (ctx.fits(cx, cz, rot, w, d, { pad: 0.4, allow: AL.FV, inside: true }) && !regHit(ctx, { x: cx, z: cz, rot, w, d }, 0.6)) {
          ctx.stampRect(cx, cz, rot, w, d, OCC.BUILDING, 0.4); regAdd(ctx, { x: cx, z: cz, rot, w, d }); return { x: cx, z: cz, rot };
        }
      }
    }
    return null;
  };
  let tavern = null;
  if (strands.length && (!expand || !(ctx.prev.specials || []).some(s => s.kind === 'tavern'))) tavern = onStrand(13 + 2 * wealth, 11, mp ? { x: mp.x, z: mp.z } : origin, 260, 1.2);
  const stores = [];
  if (wealth > 0.45 && strands.length) {
    const nS = 1 + Math.round(2 * wealth * R());
    for (let k = 0; k < nS; k++) {
      const pr = piers[k % Math.max(1, piers.length)], near = pr ? { x: pr.x, z: pr.z } : origin, w = 9 + 1.5 * R(), d = 8.5 + 1.5 * R();
      const st = onStrand(w, d, near, 220, 0.8);
      if (!st) break;
      st.w = w; st.d = d; stores.push(st);
    }
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 6. boathouses on the water side of the strand ------------------------------------------------------------
  const boathouses = [];
  for (const s of strands) {
    if (s.old) continue;
    const cap = clamp(Math.round(s.len / 70 * (0.4 + 0.6 * dens)), 0, 5);
    const P = ctx.geo.resample(s.pts, 2, false), n = P.length >> 1;
    let acc = 0, next = 10 + 20 * R(), got = 0;
    for (let i = 1; i < n && boathouses.length < 12 && got < cap; i++) {
      const dx = P[i * 2] - P[i * 2 - 2], dz = P[i * 2 + 1] - P[i * 2 - 1], l = hyp(dx, dz) || 1; acc += l;
      if (acc < next) continue;
      const wx = dz / l * s.land, wz = -dx / l * s.land, x = P[i * 2], z = P[i * 2 + 1];   // towards the water
      let sd = 0; for (let t = s.w / 2 + 2; t <= 30; t += 1) if (ctx.isWet(x + wx * t, z + wz * t)) { sd = t; break; }
      if (!sd) { next = acc + 6; continue; }
      const wB = 6.5 + 1.5 * R(), dB = 11 + 3 * R();
      const cx = x + wx * (sd - dB / 2 + 2.5), cz = z + wz * (sd - dB / 2 + 2.5), rot = rotBack(-wx, -wz);
      const lx = cx - wx * dB * 0.2, lz = cz - wz * dB * 0.2;
      const f1 = toW(cx, cz, rot, -wB / 2, -dB / 2), f2 = toW(cx, cz, rot, wB / 2, -dB / 2);
      const ok = mine(lx, lz) && ctx.anchorCell(cx, cz) >= 0 && ctx.testRect(lx, lz, rot, wB, dB * 0.6, 0.2, AL.FV) && ctx.spread(lx, lz, rot, wB, dB * 0.6) < 2.5 &&
        (ctx.isWet(f1[0], f1[1]) || ctx.isWet(f2[0], f2[1])) && !piers.some(p => dLine(p.pts, cx, cz) < wB / 2 + pierW / 2 + 3) &&
        !regHit(ctx, { x: cx, z: cz, rot, w: wB, d: dB }, 1);
      if (!ok) { next = acc + 4; continue; }
      ctx.stampRect(cx, cz, rot, wB, dB, OCC.BUILDING, 0.6);
      boathouses.push({ x: cx, z: cz, rot, w: wB, d: dB }); regAdd(ctx, boathouses[boathouses.length - 1]);
      got++;
      next = acc + 26 + 30 * R();
    }
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 7. inland lanes climbing away from the water ----------------------------------------------------------------
  const inland = [];
  {
    const spacing = lerp(170, 90, dens);
    const landOK = (x, z) => ctx.inside(x, z) && (!expand || ctx.isNew(x, z)) && !ctx.isWet(x, z);
    let lin = 0;
    for (const s of strands) {
      const P = ctx.geo.resample(s.pts, 2, false), n = P.length >> 1;
      let acc = 0, next = spacing * (0.4 + 0.3 * R());
      for (let i = 1; i < n && inland.length < 10; i++) {
        const dx = P[i * 2] - P[i * 2 - 2], dz = P[i * 2 + 1] - P[i * 2 - 1], l = hyp(dx, dz) || 1; acc += l;
        if (acc < next) continue;
        const nx = -dz / l * s.land, nz = dx / l * s.land, th0 = Math.atan2(nz, nx), lid = lin++;
        const pts = [P[i * 2], P[i * 2 + 1]]; let cx = P[i * 2], cz = P[i * 2 + 1], joined = false;
        for (let k = 1; k <= 28; k++) {
          const th = th0 + 0.45 * ctx.fbm(k * 0.12 + lid * 3.7, lid * 1.9), ux = Math.cos(th), uz = Math.sin(th);
          const x = cx + ux * 6, z = cz + uz * 6, far = k * 6 > s.w / 2 + 4;
          if (!landOK(x, z) || ctx.slopeAt(x, z) > 0.2 || Math.abs(ctx.h4(x, z) - ctx.h4(cx, cz)) / 6 > 0.15) break;
          if (far) {
            const oc = ctx.occAt(x, z), o1 = ctx.occAt(x - uz * 2, z + ux * 2), o2 = ctx.occAt(x + uz * 2, z - ux * 2);
            if (oc === OCC.LANE && k > 3) { pts.push(x, z); joined = true; break; }
            const bad = c => c === OCC.BUILDING || c === OCC.YARD || c === OCC.WALL || c === 255 || c === OCC.LANE;
            if (bad(oc) || bad(o1) || bad(o2)) break;
          }
          pts.push(x, z); cx = x; cz = z;
        }
        const Lpts = Float32Array.from(pts), len = plLen(Lpts);
        if (len >= 36 || (joined && len >= 20)) {
          const sm = ctx.geo.chaikin(Lpts, 1, false);
          stampLane(ctx, sm, 4);
          inland.push({ pts: sm, len, d: dist(P[i * 2], P[i * 2 + 1]) });
          next = acc + spacing * (0.8 + 0.4 * R());
        } else next = acc + 12;
      }
    }
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 8. a fishermen's chapel (reserved before the plots claim the frontage) -------------------------------------
  let expect = 0; for (const s of strands) expect += s.len / 10; for (const L of inland) expect += L.len / 8;
  let chapel = null;
  if (expect * 0.5 >= 14 && !(expand && (ctx.prev.specials || []).some(s => s.extra && s.extra.ms === 'church'))) {
    const big = expect * 0.5 >= 60, envW = big ? 14 : 9, envD = big ? 30 : 16, cyW = envW + 12, cyD = envD + 14;
    const rotC = PI / 2 + (R() * 2 - 1) * 12 * DEG, c = Math.cos(rotC), s = Math.sin(rotC);
    const lines = inland.map(L => ({ pts: L.pts, w: 4, both: true })).concat(strands.map(S => ({ pts: S.pts, w: S.w, land: S.land })));
    const opts = [];
    for (const ln of lines) {
      const P = ctx.geo.resample(ln.pts, 6, false), n = P.length >> 1;
      for (let i = 1; i < n; i++) {
        const dx = P[i * 2] - P[i * 2 - 2], dz = P[i * 2 + 1] - P[i * 2 - 1], l = hyp(dx, dz) || 1;
        for (const sd of ln.both ? [1, -1] : [ln.land]) {
          const nx = -dz / l * sd, nz = dx / l * sd, ext = Math.abs(nx * c - nz * s) * cyW / 2 + Math.abs(nx * s + nz * c) * cyD / 2;
          const x = P[i * 2] + nx * (ln.w / 2 + 1.5 + ext), z = P[i * 2 + 1] + nz * (ln.w / 2 + 1.5 + ext);
          opts.push([Math.abs(dist(x, z) - 120), x, z]);
        }
      }
    }
    opts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [, x, z] of opts) {
      if (!mine(x, z) || !ctx.inside(x, z) || ctx.isWet(x, z)) continue;
      if (!ctx.testRect(x, z, rotC, cyW, cyD, -0.5, AL.FV) || ctx.spread(x, z, rotC, envW, envD) > 5 || regHit(ctx, { x, z, rot: rotC, w: cyW, d: cyD }, 0)) continue;
      ctx.stampRect(x, z, rotC, cyW, cyD, OCC.PRECINCT, 0); ctx.stampRect(x, z, rotC, envW, envD, OCC.BUILDING, 0.5);
      regAdd(ctx, { x, z, rot: rotC, w: cyW - 4, d: cyD - 4 });
      chapel = { x, z, rot: rotC, w: envW, d: envD, cy: rectPoly(x, z, rotC, cyW, cyD), kind: big ? 'church' : 'chapel' };
      break;
    }
  }

  // ---- 9. plots: fishers' huts on the water side, harbour houses landward, cottages up the inland lanes ------------
  const plotCap = clamp(Math.round(ctx.areaHa * (4 + 14 * dens)) + 6, 8, 600);
  const plots = [];
  const RP = ctx.rng('hplots', ctx.epoch);
  const newOnly = expand ? (x, z) => ctx.isNew(x, z) : null;
  for (const s of strands) {
    if (plots.length >= plotCap) break;
    // water side: small huts between the strand and the shore
    frontage(ctx, s.pts, { side: -s.land, lw: s.w / 2 + 1.2, fw: [6.5, 9], frac: [0.75, 0.92], dep: [4, 5.2], yard: null, setback: [0.4, 1.6], max: Math.min(plotCap - plots.length, Math.round(3 + 10 * dens)), rng: RP, test: newOnly })
      .forEach(p => { p.role = 'harbour'; p.rank = 0; plots.push(p); });
    // landward: the harbour's houses and stores
    frontage(ctx, s.pts, { side: s.land, lw: s.w / 2 + 1.2, fw: dens > 0.55 ? [7, 10] : [10, 14], frac: [0.7, 0.92], dep: [5.5, 8], yard: [4, 4 + 10 * gardens], setback: [0.6, 2.5], max: plotCap - plots.length, rng: RP, test: newOnly })
      .forEach(p => { p.role = 'harbour'; p.rank = 0; plots.push(p); });
    yield* ctx.yieldIfOverBudget();
  }
  for (const L of inland) {
    if (plots.length >= plotCap) break;
    for (const sd of [1, -1]) frontage(ctx, L.pts, { side: sd, lw: 2 + 1.2, fw: [lerp(16, 10, dens), lerp(20, 12, dens)], frac: [0.62, 0.8], dep: [6, 9.5], yard: [8, 8 + 16 * gardens], setback: [1.5, 4.5], max: plotCap - plots.length, rng: RP, start: 8, test: newOnly })
      .forEach(p => { p.role = 'house'; p.rank = 1; plots.push(p); });
    yield* ctx.yieldIfOverBudget();
  }

  // ---- 10. boats moored along the piers (and the quays) ------------------------------------------------------------
  const boats = [];
  const RB = ctx.rng('boats', ctx.epoch);
  let cog = false;
  piers.forEach((pr, pi) => {
    const px = -pr.oz, pz = pr.ox, cnt = clamp(Math.round(pr.L / 12 * (0.5 + 0.8 * dens)), 1, 6), used = [[], []];
    for (let k = 0; k < cnt; k++) {
      const sideI = (k + pi) % 2, sg = sideI ? 1 : -1;
      let v = RB() < 0.55 - 0.4 * wealth ? 0 : 1;
      if (!cog && pr === mp && wealth > 0.65 && k === cnt - 1) v = 2;
      if (v === 2 && pr.L < 28) v = 1;
      const j = 0.92 + 0.16 * RB(), bw = BOAT_DIM[v][0] * j, bd = BOAT_DIM[v][1] * j;
      const along = clamp(8 + (pr.L - 10) * (k + 0.5) / cnt, bd / 2 + 3, Math.max(bd / 2 + 3, pr.L - bd / 2 + 1));
      if (used[sideI].some(u => Math.abs(u[0] - along) < (u[1] + bd) / 2 + 1)) continue;
      const cx = pr.x + pr.ox * along + px * sg * (pierW / 2 + bw / 2 + 0.7), cz = pr.z + pr.oz * along + pz * sg * (pierW / 2 + bw / 2 + 0.7);
      const rot = rotBack(pr.ox, pr.oz) + (RB() < 0.5 ? PI : 0);
      const C = rectPoly(cx, cz, rot, bw, bd);
      let ok = ctx.depthAt(cx, cz) >= BOAT_DRAFT[v] && ctx.anchorCell(cx, cz) >= 0;
      for (let i = 0; i < 4 && ok; i++) if (!ctx.isWet(C[i * 2], C[i * 2 + 1])) ok = false;
      if (ok && piers.some(q => q !== pr && dLine(q.pts, cx, cz) < bd / 2 + pierW)) ok = false;
      if (!ok) continue;
      used[sideI].push([along, bd]);
      if (v === 2) cog = true;
      boats.push({ x: cx, z: cz, rot, w: bw, d: bd, v, pier: pr, k });
    }
  });
  for (const q of quays) {
    const v = RB() < 0.5 ? 1 : 0, bw = BOAT_DIM[v][0], bd = BOAT_DIM[v][1];
    const cx = q.mx + q.ox * (q.d - 2 + bw / 2 + 0.8), cz = q.mz + q.oz * (q.d - 2 + bw / 2 + 0.8), rot = rotBack(-q.oz, q.ox);
    if (ctx.depthAt(cx, cz) >= BOAT_DRAFT[v] && ctx.anchorCell(cx, cz) >= 0 && ctx.isWet(cx, cz)) boats.push({ x: cx, z: cz, rot, w: bw, d: bd, v, quay: q });
  }

  // ---- emission, in reveal order: waterfront, main pier (+ boats), crane, tavern, then outwards by distance ---------
  const ev = [];
  const push = (d, f) => ev.push({ d, i: ev.length, f });
  strands.forEach((s, i) => { if (!s.old) push(-10 + i * 0.01, () => ctx.lane({ pts: s.pts, rank: i === 0 ? 0 : 1, w: s.w, surf: 1, noStamp: true })); });
  const emitPier = pr => ctx.special({ kind: 'pierline', x: pr.pts[0], z: pr.pts[1], extra: { pts: pr.pts }, noStamp: true });
  const emitBoat = b => ctx.special({ kind: 'boat', x: b.x, z: b.z, rot: b.rot, w: b.w, d: b.d, var: b.v, noStamp: true });
  piers.forEach(pr => {
    const d0 = pr === mp ? -9 : dist(pr.x, pr.z);
    push(d0, () => emitPier(pr));
    boats.filter(b => b.pier === pr).forEach((b, k) => push(d0 + 0.05 + k * 0.01, () => emitBoat(b)));
  });
  if (crane) push(-8.5, () => ctx.special({ kind: 'crane', x: crane.x, z: crane.z, rot: crane.rot, w: 6, d: 6, noStamp: true }));
  if (tavern) push(-8, () => ctx.special({ kind: 'tavern', x: tavern.x, z: tavern.z, rot: tavern.rot, w: 13 + 2 * wealth, d: 11, extra: { harbour: 1 }, noStamp: true }));
  quays.forEach(q => {
    const d0 = Math.max(-7.5, dist(q.x, q.z));
    push(d0, () => ctx.special({ kind: 'quay', x: q.x, z: q.z, rot: q.rot, w: q.w, d: q.d, noStamp: true }));
    boats.filter(b => b.quay === q).forEach(b => push(d0 + 0.05, () => emitBoat(b)));
  });
  stores.forEach(st => push(dist(st.x, st.z), () => ctx.special({ kind: 'storehouse', x: st.x, z: st.z, rot: st.rot, w: st.w, d: st.d, extra: { floors: 3 }, noStamp: true })));
  boathouses.forEach(b => push(dist(b.x, b.z), () => ctx.special({ kind: 'boathouse', x: b.x, z: b.z, rot: b.rot, w: b.w, d: b.d, noStamp: true })));
  inland.forEach(L => push(L.d - 0.5, () => ctx.lane({ pts: L.pts, rank: 1, w: 4, surf: 1, noStamp: true })));
  const pd = plots.map(p => dist(p.x, p.z)).sort((a, b) => a - b);
  plots.forEach(p => push(dist(p.x, p.z) + 0.001, () => emitPlot(ctx, p, { role: p.role, rank: p.rank, netD: dist(p.x, p.z), wq: wqAt(ctx, p.x, p.z, origin, Rmax) + (p.role === 'harbour' ? 0.05 : 0) })));
  if (chapel) {
    const dC = pd.length >= 14 ? pd[13] + 0.01 : dist(chapel.x, chapel.z);
    push(dC, () => { ctx.area({ cls: 4, poly: chapel.cy, noStamp: true }); ctx.special({ kind: chapel.kind, x: chapel.x, z: chapel.z, rot: chapel.rot, w: chapel.w, d: chapel.d, extra: { ms: 'church', tag: 'church', orient: 'east' }, noStamp: true }); });
  }
  ev.sort((a, b) => a.d - b.d || a.i - b.i);
  for (let i = 0; i < ev.length; i++) { ev[i].f(); if ((i & 31) === 31) yield* ctx.yieldIfOverBudget(); }
}

// =====================================================================================================
// Registration
// =====================================================================================================
D.TownX = Object.assign(D.TownX || {}, {
  planners: { 3: planCastle, 4: planMonastery, 5: planHarbour },
  _debug: { searchPath, monLayout, precinctLoop, ditchBands, frontage, crossings, hull, vNormals }
});
})();
