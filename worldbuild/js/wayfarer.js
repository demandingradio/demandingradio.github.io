/* Diorama — Wayfarer (Living History, spec §3.10): traffic between places, desire lines that wear
   in as footpaths, and well-used history roads upgraded (track → lane → king's road), with stone
   bridge works asked of works.js. A Story part (order 20). Optional: without this file there are
   simply no history roads (pull() / trafficOf() fall back to null / .5 in their callers).

   Year rhythm (spec §3.10): the Winter commit starts an async job (traffic Dijkstra + desire lines +
   A* for the best new route), time-sliced in update() at ≤ 2 ms a frame, and busy() holds the next
   commit until it is done (so it reads the world between the same two commits whatever the frame
   rate); the Summer commit applies it and makes every road mutation of the year inside one R.batch
   (≤ 12 legs, ≤ 2 upgrades, both deferred to next Summer when ctx.timeLeft() runs short).
   History roads are draped footpaths (by 1) built with keepPlayer/noClear/noUnders, so the player's
   roads, terrain, plants and buildings are never touched (E5, I2). */
(function () {
'use strict';
const D = window.D;

const DEF = {
  T1: 150, T2: 400, T3: 2500,        // upgrade thresholds (smoothed yearly flow): footpath→track, track→lane, lane→king's road
  sustain: [3, 4, 5],                // years at threshold for those three upgrades
  pathAge: 6,                        // a footpath becomes a track after this many years anyway
  scale: 5e4,                        // demand = scale·mA·mB / max(d,600)^1.6 (calibrate on a real save)
  Dmin: 25,                          // minimum demand for a desire line
  pairKm: 9, anchorR: 250,           // pairs within 9 km; anchor to a node within 250 m (virtual edge ×1.5)
  legsPerYear: 12, upgradesPerYear: 2, maxKm: 160,
  grid: 32, pad: 1500, dp: 20, legMin: 40, legMax: 150,
  maxFloat: 1.2, wetMax: 60, bridgeWet: 30,
  vetoFail: 30, vetoBulldoze: 50, redoYears: 30,
  heur: 0.6, turn: 0.35,             // A* heuristic weight (cells) and turn penalty per 45°
  budgetMs: 2,                       // async work per frame (halved after a slow frame)
  jobMs: 2500                        // busy() holds a commit for at most this much job work (ms)
};
D.TUNE = D.TUNE || {};
const TUNE = D.TUNE.wayfarer = Object.assign({}, DEF, D.TUNE.wayfarer || {});

const NEXT = { footpath: 'track', track: 'lane', lane: 'kingsroad' };
const COSTF = { footpath: 1.3, track: 1, lane: 0.8, street: 0.7, kingsroad: 0.6 };
const MASSF = { 1: 1, 2: 0, 3: 0.6, 4: 0.5, 5: 1.3 };      // farmland is not somewhere people travel to
const SQ2 = Math.SQRT2;
const pairKey = (a, b) => a < b ? a + '-' + b : b + '-' + a;
const now = () => performance.now();

// =====================================================================================================
// Pure helpers (node-testable through Wayfarer._pure)
// =====================================================================================================
function massOf(p) { return Math.pow(Math.max(1, p.houses || 0), 0.8) * (MASSF[p.type] === undefined ? 1 : MASSF[p.type]); }
// gravity demand between every pair of places within o.maxD metres -> [{i, j, d, demand}] (i < j)
function gravity(pl, o) {
  o = o || {};
  const maxD = o.maxD || TUNE.pairKm * 1000, K = o.scale || TUNE.scale, m = pl.map(massOf), out = [];
  for (let i = 0; i < pl.length; i++) {
    if (!m[i]) continue;
    for (let j = i + 1; j < pl.length; j++) {
      if (!m[j]) continue;
      const d = Math.hypot(pl[i].x - pl[j].x, pl[i].z - pl[j].z);
      if (d > maxD) continue;
      out.push({ i, j, d, demand: K * m[i] * m[j] / Math.pow(Math.max(d, 600), 1.6) });
    }
  }
  return out;
}
// Dijkstra over a CSR graph G = {n, off, to, w} from sources [[node, cost]]; stops past maxCost.
// Returns {dist (Float32Array, Infinity = unreached), via (slot of the edge used to arrive, -1)}.
function dijkstra(G, src, maxCost) {
  const dist = new Float32Array(G.n).fill(Infinity), via = new Int32Array(G.n).fill(-1);
  const H = new D.Heap(64), lim = maxCost === undefined ? Infinity : maxCost;
  for (const [v, c] of src) if (v >= 0 && c < dist[v]) { dist[v] = c; via[v] = -1; H.push(c, v); }
  while (H.n) {
    const u = H.pop(), du = H.lastKey;
    if (du > dist[u]) continue;
    if (du > lim) break;
    for (let k = G.off[u]; k < G.off[u + 1]; k++) {
      const v = G.to[k], nd = Math.fround(du + G.w[k]);
      if (nd < dist[v]) { dist[v] = nd; via[v] = k; H.push(nd, v); }
    }
  }
  return { dist, via };
}
// A* on a grid {w, h, cost(i) -> cost per cell step (Infinity = impassable)} from source cells to any
// cell with isDst(i). 8-connected, no corner cutting past impassable cells, octile heuristic towards the
// target set (centroid minus radius, weighted by o.heur), and a turn penalty (o.turn per 45°).
// A generator: it yields every 256 expansions so a caller can time-slice it; returns the cell path.
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function* astarGen(grid, src, dst, o) {
  o = o || {};
  const W = grid.w, Hh = grid.h, N = W * Hh, heur = o.heur === undefined ? TUNE.heur : o.heur, turnP = o.turn === undefined ? TUNE.turn : o.turn;
  const g = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), pdir = new Int8Array(N).fill(-1), closed = new Uint8Array(N);
  const cc = new Float32Array(N).fill(-1);
  const cost = i => { let c = cc[i]; if (c < 0) { c = grid.cost(i); if (!(c >= 0)) c = Infinity; cc[i] = c; } return c; };
  const isDst = new Uint8Array(N), tl = [];
  for (const t of dst) if (t >= 0 && t < N && !isDst[t]) { isDst[t] = 1; tl.push(t); }
  if (!tl.length) return null;
  // heuristic: octile distance to the nearest of (up to 48 evenly sampled) targets
  const step = Math.max(1, Math.ceil(tl.length / 48)), TI = [], TJ = [];
  for (let k = 0; k < tl.length; k += step) { TI.push(tl[k] % W); TJ.push((tl[k] / W) | 0); }
  const h = i => {
    const ii = i % W, jj = (i / W) | 0; let best = Infinity;
    for (let k = 0; k < TI.length; k++) { const dx = Math.abs(ii - TI[k]), dz = Math.abs(jj - TJ[k]), oct = Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz); if (oct < best) best = oct; }
    return heur * best;
  };
  const H = new D.Heap(256);
  for (const s of src) if (s >= 0 && s < N && isFinite(cost(s)) && g[s] > 0) { g[s] = 0; H.push(h(s), s); }
  let it = 0;
  while (H.n) {
    const u = H.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (isDst[u]) { const path = []; for (let c = u; c >= 0; c = par[c]) path.push(c); return path.reverse(); }
    const ui = u % W, uj = (u / W) | 0, cu = cost(u), pd = pdir[u];
    for (let d = 0; d < 8; d++) {
      const vi = ui + DIRS[d][0], vj = uj + DIRS[d][1];
      if (vi < 0 || vj < 0 || vi >= W || vj >= Hh) continue;
      const v = vj * W + vi; if (closed[v]) continue;
      const cv = cost(v); if (!isFinite(cv)) continue;
      const diag = d & 1;
      if (diag && (!isFinite(cost(uj * W + vi)) || !isFinite(cost(vj * W + ui)))) continue;
      let ng = g[u] + (diag ? SQ2 : 1) * (cu + cv) * 0.5;
      if (pd >= 0) { const t = Math.abs(d - pd), a = t > 4 ? 8 - t : t; ng += turnP * a; }
      if (ng < g[v]) { g[v] = ng; par[v] = u; pdir[v] = d; H.push(ng + h(v), v); }
    }
    if ((++it & 63) === 0) yield it;
  }
  return null;
}
function astar(grid, src, dst, o) { const gen = astarGen(grid, src, dst, o); let r; do { r = gen.next(); } while (!r.done); return r.value; }
// Douglas–Peucker on a flat [x, z, ...] polyline
function douglasPeucker(pts, tol) {
  const n = pts.length / 2; if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], az = pts[a * 2 + 1], dx = pts[b * 2] - ax, dz = pts[b * 2 + 1] - az, L2 = dx * dx + dz * dz;
    let best = -1, bd = tol;
    for (let k = a + 1; k < b; k++) {
      const px = pts[k * 2] - ax, pz = pts[k * 2 + 1] - az;
      let d;
      if (L2 < 1e-9) d = Math.hypot(px, pz);
      else { const u = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2)); d = Math.hypot(px - dx * u, pz - dz * u); }
      if (d > bd) { bd = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = []; for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k * 2], pts[k * 2 + 1]);
  return out;
}
// Cut a simplified polyline into legs of o.min..o.max metres, preferring to cut at its vertices (the
// bends) so each leg's chord stays close to the planned line. A line shorter than o.tiny gives none.
// -> [[x0, z0, x1, z1], ...]
function legsOf(pts, o) {
  o = o || {};
  const mn = o.min || TUNE.legMin, mx = o.max || TUNE.legMax, tiny = o.tiny || 12, n = pts.length / 2;
  if (n < 2) return [];
  const L = [0];
  for (let k = 1; k < n; k++) L.push(L[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]));
  const total = L[n - 1];
  if (total < tiny) return [];
  const at = s => {                       // point at arc length s
    let k = 1; while (k < n - 1 && L[k] < s) k++;
    const u = (s - L[k - 1]) / Math.max(1e-9, L[k] - L[k - 1]);
    return [pts[k * 2 - 2] + (pts[k * 2] - pts[k * 2 - 2]) * u, pts[k * 2 - 1] + (pts[k * 2 + 1] - pts[k * 2 - 1]) * u];
  };
  const turn = k => {                     // turn angle at vertex k
    const ax = pts[k * 2] - pts[k * 2 - 2], az = pts[k * 2 + 1] - pts[k * 2 - 1], bx = pts[k * 2 + 2] - pts[k * 2], bz = pts[k * 2 + 3] - pts[k * 2 + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); if (la < 1e-9 || lb < 1e-9) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb))));
  };
  // o.dry(x, z): cuts are kept off water (a leg end in a river would put a junction on the bridge and
  // split one crossing into two short bridges); a wet cut slides back towards the bank it came from
  const dry = o.dry || null, isDry = p => !dry || dry(p[0], p[1]);
  const cuts = [[pts[0], pts[1]]];
  let s0 = 0;
  while (total - s0 > mx) {
    let first = -1, last = -1;
    for (let k = 1; k < n - 1; k++) {
      if (L[k] < s0 + mn || L[k] > s0 + mx || total - L[k] < mn) continue;
      if (dry && !dry(pts[k * 2], pts[k * 2 + 1])) continue;
      if (last < 0 || L[k] > L[last]) last = k;
      if (first < 0 && turn(k) > 15 * Math.PI / 180) first = k;
    }
    const k = first >= 0 ? first : last;
    let s = k >= 0 ? L[k] : Math.min(s0 + mx, total - mn), P = k >= 0 ? [pts[k * 2], pts[k * 2 + 1]] : at(s);
    if (!isDry(P)) {
      const lo = s0 + mn, hi = Math.min(s0 + mx, total - mn);
      let got = null;
      for (let e = 4; !got && (s - e >= lo || s + e <= hi); e += 4) {
        if (s - e >= lo) { const Q = at(s - e); if (isDry(Q)) { got = [s - e, Q]; break; } }
        if (s + e <= hi) { const Q = at(s + e); if (isDry(Q)) got = [s + e, Q]; }
      }
      if (got) [s, P] = got;
    }
    cuts.push(P);
    s0 = s;
  }
  cuts.push([pts[n * 2 - 2], pts[n * 2 - 1]]);
  const out = [];
  for (let c = 0; c + 1 < cuts.length; c++) out.push([cuts[c][0], cuts[c][1], cuts[c + 1][0], cuts[c + 1][1]]);
  return out;
}
// Split a path's per-point road flags into the off-road runs to build: [[a, b], ...] inclusive.
// Short gaps (≤ minGap points) between two road contacts are the road itself wobbling; dropped.
function offRoadRuns(onRoad, minGap) {
  const n = onRoad.length, out = [];
  let k = 0;
  while (k < n) {
    if (onRoad[k]) { k++; continue; }
    let e = k; while (e + 1 < n && !onRoad[e + 1]) e++;
    if (!(k > 0 && e < n - 1 && e - k + 1 <= (minGap === undefined ? 1 : minGap))) out.push([k, e]);
    k = e + 1;
  }
  return out;
}

// =====================================================================================================
// State (the part snapshot). Every container is replaced, never edited, so snap() is a reference.
// =====================================================================================================
function fresh() { return { tf: new Map(), sustain: new Map(), route: null, routes: [], veto: [], nextRt: 1 }; }
let st = fresh();
const setSt = patch => { st = Object.assign({}, st, patch); cacheT = null; };
let job = null;                 // {q, it, done, result, t0}: runtime only, never saved
let removedQ = [];              // route ids of history roads the player bulldozed (outside commits)
let taken = 0;                  // how many of them the last commit turned into vetoes (see consumeRemovals)
let cacheT = null;              // trafficOf cache
let pullCache = null;           // {list, map}

// ---- places ------------------------------------------------------------------------------------------
// memoised on Town.hist.ver(), the same key Town.hist.list() caches on: placeByUid/nameOf/linksTowns call this
// per chain and per log line, and rebuilding it each time cost ~3 ms of a Summer commit (§3.14). Read-only.
let plMemo = null, plKey = null;
function places() {
  const T = D.Town; if (!T) return [];
  if (T.hist && T.hist.list) {
    const k = T.hist.ver ? T.hist.ver() : null;
    if (k !== null && k === plKey && plMemo) return plMemo;
    try { const out = T.hist.list().map(s => ({ sid: s.sid, uid: s.uid, type: s.type, name: s.name, houses: s.houses | 0, x: s.x, z: s.z, bb: s.bb })); plKey = k; plMemo = out; return out; }
    catch (e) { console.warn('[wayfarer] Town.hist.list', e); }
  }
  const out = [];
  if (T.list && T.originOf) T.list.forEach((S, sid) => {
    const o = T.originOf(sid); if (!o) return;
    const houses = S.plan && S.plan.plots ? S.plan.plots.filter(p => p.role === 'house').length : 0;
    out.push({ sid, uid: S.uid, type: S.type, name: S.name, houses, x: o.x, z: o.z, bb: [o.x - 200, o.z - 200, o.x + 200, o.z + 200] });
  });
  return out.sort((a, b) => a.sid - b.sid);
}
function gatesOf(p) {
  const T = D.Town; let g = null;
  try { g = T && T.hist && T.hist.gates ? T.hist.gates(p.sid) : null; } catch (e) { g = null; }
  return g && g.length ? g : [{ x: p.x, z: p.z, dx: 0, dz: 0, origin: true }];
}
function placeByUid(uid) { for (const p of places()) if (p.uid === uid) return p; return null; }
const nameOf = (uid, fb) => { const p = placeByUid(uid); return p && p.name ? p.name : fb || 'a place now gone'; };

// ---- road graph snapshot (CSR) ------------------------------------------------------------------------
function buildGraph() {
  const R = D.Roads, ids = [], idx = new Map(), xs = [], zs = [];
  R.nodes.forEach(n => { if (!n.segs.length) return; idx.set(n.id, ids.length); ids.push(n.id); xs.push(n.x); zs.push(n.z); });
  const n = ids.length, deg = new Int32Array(n + 1), E = [];
  R.segs.forEach(s => {
    const u = idx.get(s.a), v = idx.get(s.b); if (u === undefined || v === undefined) return;
    const len = R.segSamples(s).len, w = len * (COSTF[s.type] || 1);
    E.push([u, v, w, len, pairKey(s.a, s.b), s.id]); deg[u]++; deg[v]++;
  });
  const off = new Int32Array(n + 1); for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const fill = off.slice(0, n), m2 = off[n];
  const to = new Int32Array(m2), from = new Int32Array(m2), w = new Float32Array(m2), len = new Float32Array(m2), eid = new Int32Array(m2);
  E.forEach((e, k) => { for (const [a, b] of [[e[0], e[1]], [e[1], e[0]]]) { const s = fill[a]++; to[s] = b; from[s] = a; w[s] = e[2]; len[s] = e[3]; eid[s] = k; } });
  // components (for multi-source routing between two disconnected networks)
  const comp = new Int32Array(n).fill(-1); let nc = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s]; comp[s] = nc;
    while (stack.length) { const u = stack.pop(); for (let k = off[u]; k < off[u + 1]; k++) if (comp[to[k]] < 0) { comp[to[k]] = nc; stack.push(to[k]); } }
    nc++;
  }
  // 256 m buckets for nearest-node queries
  const bk = new Map();
  for (let i = 0; i < n; i++) { const k = Math.floor(xs[i] / 256) * 4096 + Math.floor(zs[i] / 256); let l = bk.get(k); if (!l) bk.set(k, l = []); l.push(i); }
  const nearest = (x, z, r) => {
    let best = -1, bd = r;
    for (let cx = Math.floor((x - r) / 256); cx <= Math.floor((x + r) / 256); cx++)
      for (let cz = Math.floor((z - r) / 256); cz <= Math.floor((z + r) / 256); cz++) {
        const l = bk.get(cx * 4096 + cz); if (!l) continue;
        for (const i of l) { const d = Math.hypot(xs[i] - x, zs[i] - z); if (d < bd) { bd = d; best = i; } }
      }
    return best >= 0 ? [best, bd] : null;
  };
  return { n, off, to, from, w, len, eid, E, ids, xs, zs, comp, nearest };
}
// anchor of a place: the nearest node within anchorR of its origin or one of its gates
function anchorOf(G, p, gates) {
  let best = null;
  for (const q of [{ x: p.x, z: p.z }].concat(gates)) { const a = G.nearest(q.x, q.z, TUNE.anchorR); if (a && (!best || a[1] < best[1])) best = a; }
  return best;
}

// =====================================================================================================
// The yearly job (async; started by the Winter commit, consumed by the Summer commit)
// =====================================================================================================
function* yearJob(snap) {
  const R = D.Roads; if (!R || !R.segs) return null;
  const P = places().filter(p => massOf(p) > 0).map(p => Object.assign({}, p));   // own copies: gates/anchor are added below
  const G = buildGraph();
  yield 0;
  for (const p of P) { p.gates = gatesOf(p); p.anchor = anchorOf(G, p, p.gates); }
  const pairs = gravity(P), byI = new Map();
  for (const pr of pairs) { let l = byI.get(pr.i); if (!l) byI.set(pr.i, l = []); l.push(pr); }
  const flowE = new Float64Array(G.E.length), info = [];
  for (let i = 0; i < P.length; i++) {
    const l = byI.get(i); if (!l) continue;
    const A = P[i].anchor;
    if (!A) { for (const pr of l) info.push({ pr, has: false, plen: 0 }); continue; }
    let maxD = 0; for (const pr of l) maxD = Math.max(maxD, pr.d);
    const { dist, via } = dijkstra(G, [[A[0], A[1] * 1.5]], maxD * 2.2 + 3000);
    for (const pr of l) {
      const B = P[pr.j].anchor;
      if (!B || !isFinite(dist[B[0]])) { info.push({ pr, has: false, plen: 0 }); continue; }
      let plen = A[1] + B[1];
      for (let v = B[0], guard = 0; via[v] >= 0 && guard < 100000; guard++) { const k = via[v]; flowE[G.eid[k]] += pr.demand; plen += G.len[k]; v = G.from[k]; }
      info.push({ pr, has: true, plen });
    }
    yield i + 1;
  }
  // flows per node pair (parallel segs share a key)
  const flows = new Map();
  G.E.forEach((e, k) => flows.set(e[4], (flows.get(e[4]) || 0) + flowE[k]));
  // desire lines: no path, or a path much longer than the crow flies
  const vetoed = (a, b) => isVetoed(snap.veto, a, b, snap.year) || recentlyRouted(snap.routes, a, b, snap.year);
  const cands = [];
  if (!snap.route && director_km() < TUNE.maxKm) {
    for (const f of info) {
      const { pr } = f;
      if (pr.demand < TUNE.Dmin) continue;
      if (f.has && f.plen <= 1.5 * pr.d + 800) continue;
      const A = P[pr.i], B = P[pr.j];
      if (vetoed(A.uid, B.uid)) continue;
      cands.push({ A, B, d: pr.d, demand: pr.demand, has: f.has });
    }
    cands.sort((p, q) => q.demand - p.demand || p.A.uid - q.A.uid || p.B.uid - q.B.uid);
  }
  const failed = [];
  let cand = null;
  for (let c = 0; c < Math.min(3, cands.length) && !cand; c++) {
    const plan = yield* routeJob(G, cands[c]);
    if (plan && plan.legs.length) cand = plan; else failed.push([cands[c].A.uid, cands[c].B.uid]);
  }
  return { flows, cand, failed };
}
function director_km() { let s = 0; D.Roads.segs.forEach(g => { if (g.by === 1) s += D.Roads.segSamples(g).len; }); return s / 1000; }
function isVetoed(veto, a, b, year) { const [p, q] = a < b ? [a, b] : [b, a]; return veto.some(v => v[0] === p && v[1] === q && v[2] > year); }
function recentlyRouted(routes, a, b, year) { const [p, q] = a < b ? [a, b] : [b, a]; return routes.some(r => r[1] === p && r[2] === q && year - r[3] < TUNE.redoYears); }

// ---- route search: A* on a 32 m cost grid, then legs -----------------------------------------------------
function* routeJob(G, c) {
  const R = D.Roads, T = D.Terrain, W = D.W, N = D.N, CELL = D.CELL, SIZE = D.SIZE, GS = TUNE.grid;
  const A = c.A, B = c.B;
  const pts0 = [A.x, A.z, B.x, B.z];
  for (const q of A.gates.concat(B.gates)) pts0.push(q.x, q.z);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  for (let k = 0; k < pts0.length; k += 2) grow(pts0[k], pts0[k + 1]);
  for (const p of [A, B]) if (p.bb) { grow(p.bb[0], p.bb[1]); grow(p.bb[2], p.bb[3]); }
  x0 = Math.max(0, x0 - TUNE.pad); z0 = Math.max(0, z0 - TUNE.pad); x1 = Math.min(SIZE, x1 + TUNE.pad); z1 = Math.min(SIZE, z1 + TUNE.pad);
  const gw = Math.max(2, Math.ceil((x1 - x0) / GS)), gh = Math.max(2, Math.ceil((z1 - z0) / GS)), NN = gw * gh;
  const cellOf = (x, z) => D.clamp(Math.floor((z - z0) / GS), 0, gh - 1) * gw + D.clamp(Math.floor((x - x0) / GS), 0, gw - 1);
  const cx = i => x0 + (i % gw + 0.5) * GS, cz = i => z0 + (((i / gw) | 0) + 0.5) * GS;
  // masks: roads (cells a road passes through), manual records (+10 m), gate approaches (2 cells)
  const road = new Uint8Array(NN), block = new Uint8Array(NN), approach = new Uint8Array(NN);
  let cnt = 0;
  for (const s of Array.from(R.segs.values())) {
    if (!R.segs.has(s.id)) continue;
    const bb = s._bb; if (bb && (bb[0] > x1 || bb[2] < x0 || bb[1] > z1 || bb[3] < z0)) continue;
    const S = R.segSamples(s);
    for (let q = 0; q < S.n; q++) if (S.x[q] >= x0 && S.x[q] < x1 && S.z[q] >= z0 && S.z[q] < z1) road[cellOf(S.x[q], S.z[q])] = 1;
    if ((++cnt & 127) === 0) yield 0;
  }
  yield 0;
  if (R._manualIn) R._manualIn(x0, z0, x1, z1, (b, r) => {
    const rr = r + 10, i0 = Math.floor((b.x - rr - x0) / GS), i1 = Math.floor((b.x + rr - x0) / GS), j0 = Math.floor((b.z - rr - z0) / GS), j1 = Math.floor((b.z + rr - z0) / GS);
    for (let j = Math.max(0, j0); j <= Math.min(gh - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(gw - 1, i1); i++) {
      const px = x0 + (i + 0.5) * GS, pz = z0 + (j + 0.5) * GS;
      if (Math.hypot(px - b.x, pz - b.z) < rr + GS * 0.5) block[j * gw + i] = 1;
    }
    return false;
  });
  for (const q of A.gates.concat(B.gates)) {
    const ci = cellOf(q.x, q.z), i = ci % gw, j = (ci / gw) | 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b2 = j + dj; if (a >= 0 && b2 >= 0 && a < gw && b2 < gh) approach[b2 * gw + a] = 1; }
  }
  // wet cells, with the narrowest crossing width through each
  const wetC = new Int8Array(NN).fill(-1);
  const isWet = i => { let w = wetC[i]; if (w < 0) { const x = cx(i), z = cz(i); w = wetC[i] = T.waterAt(x, z) > T.hAt(x, z) - 0.3 ? 1 : 0; } return w === 1; };
  const wetWidth = i => {
    const ii = i % gw, jj = (i / gw) | 0; let best = 1e9;
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let n = 1;
      for (const sg of [1, -1]) for (let s = 1; s <= 4; s++) { const a = ii + dx * s * sg, b2 = jj + dz * s * sg; if (a < 0 || b2 < 0 || a >= gw || b2 >= gh || !isWet(b2 * gw + a)) break; n++; }
      best = Math.min(best, n * GS * (dx && dz ? SQ2 : 1));
    }
    return best;
  };
  const cover = D.Nature && D.Nature.cover ? D.Nature.cover : null;
  let usedWet = false;
  const grid = {
    w: gw, h: gh,
    cost(i) {
      if (block[i]) return Infinity;
      const x = cx(i), z = cz(i);
      if (road[i]) return 0.3;             // before water: an existing bridge is reused, never re-bridged
      if (isWet(i)) return wetWidth(i) > TUNE.wetMax ? Infinity : 1 + 25;
      const gx = (T.hAt(x + 8, z) - T.hAt(x - 8, z)) / 16, gz = (T.hAt(x, z + 8) - T.hAt(x, z - 8)) / 16, sl = Math.hypot(gx, gz);
      if (sl > 0.3) return Infinity;
      let c = 1 + 8 * (sl / 0.16) * (sl / 0.16);
      if (cover) { let f = 0; try { f = cover(x, z, 24) || 0; } catch (e) { f = 0; } c *= 1 + 2 * D.clamp(f, 0, 1); }
      const k = (D.clamp(Math.floor(z / CELL), 0, N - 1) * N + D.clamp(Math.floor(x / CELL), 0, N - 1)) * 4;
      if (W.zone && W.zone[k] && !approach[i]) c *= 1.4;
      return c;
    }
  };
  // sources / targets: gates (or the origin), the anchor node, and, when the two places lie on different
  // road networks, every node of each network inside the grid (so the new path joins the networks)
  const ends = new Map();       // cell -> {x, z, dir, node}
  const setOf = (p, other) => {
    const cells = [];
    const add = (x, z, e) => { if (x < x0 || x >= x1 || z < z0 || z >= z1) return; const ci = cellOf(x, z); if (!ends.has(ci)) ends.set(ci, e); cells.push(ci); };
    for (const q of p.gates) add(q.x, q.z, { x: q.x, z: q.z });
    const a = p.anchor;
    if (a) {
      const sameNet = other.anchor && G.comp[a[0]] === G.comp[other.anchor[0]];
      if (sameNet) add(G.xs[a[0]], G.zs[a[0]], { x: G.xs[a[0]], z: G.zs[a[0]], node: G.ids[a[0]] });
      else for (let v = 0; v < G.n; v++) if (G.comp[v] === G.comp[a[0]]) add(G.xs[v], G.zs[v], { x: G.xs[v], z: G.zs[v], node: G.ids[v] });
    }
    return cells;
  };
  const src = setOf(A, B), dst = setOf(B, A);
  if (!src.length || !dst.length) return null;
  const dstSet = new Set(dst); for (const s of src) if (dstSet.has(s)) return null;   // already touching: nothing to wear in
  const path = yield* astarGen(grid, src, dst, {});
  if (!path || path.length < 2) return null;
  for (const i of path) if (!road[i] && isWet(i)) usedWet = true;
  // world points (exact ends), road contacts, off-road runs -> legs
  const pts = path.map(i => [cx(i), cz(i)]);
  const e0 = ends.get(path[0]), e1 = ends.get(path[path.length - 1]);
  if (e0) pts[0] = [e0.x, e0.z];
  if (e1) pts[pts.length - 1] = [e1.x, e1.z];
  const onRoad = path.map((i, k) => road[i] && !(k === 0 && e0 && !e0.node) && !(k === path.length - 1 && e1 && !e1.node) ? 1 : 0);
  const legs = [];
  for (const [a, b] of offRoadRuns(onRoad, 1)) {
    const line = [];
    line.push(...(a === 0 ? pts[0] : contactPt(pts[a - 1])));
    for (let k = a; k <= b; k++) if (!(k === 0 || k === pts.length - 1)) line.push(pts[k][0], pts[k][1]);
    line.push(...(b === pts.length - 1 ? pts[pts.length - 1] : contactPt(pts[b + 1])));
    const lg = legsOf(douglasPeucker(line, TUNE.dp), { min: TUNE.legMin, max: TUNE.legMax, dry: dryAt });
    lg.forEach((l, k) => legs.push(l[0], l[1], l[2], l[3], k === lg.length - 1 ? 1 : 0));
  }
  yield 1;
  return { uidA: A.uid, uidB: B.uid, legs, wet: usedWet, d: c.d };
}
const dryAt = (x, z) => { const T = D.Terrain; return !(T.waterAt(x, z) > T.hAt(x, z) - 0.3); };
// the point on the nearest road to a contact cell centre
function contactPt(p) {
  const R = D.Roads, seg = R.segAt ? R.segAt(p[0], p[1], 30) : null;
  if (!seg || !R.nearestOnSeg) return [p[0], p[1]];
  const r = R.nearestOnSeg(seg, p[0], p[1]);
  return r ? [r.x, r.z] : [p[0], p[1]];
}

// =====================================================================================================
// Commit-side (inside the Story entry)
// =====================================================================================================
// The queue is only dropped once the commit that turned it into vetoes stands: 'taken' is cleared by
// restore() (a rolled-back or undone commit, so the next commit converts them again) and otherwise
// retired at the start of the next commit.
function consumeRemovals(ctx) {
  if (taken) { removedQ = removedQ.slice(taken); taken = 0; }
  if (!removedQ.length) return;
  const q = removedQ.slice(); taken = q.length;
  let veto = st.veto, route = st.route, any = false;
  for (const rt of q) {
    const r = st.routes.find(e => e[0] === rt) || (route && route.rt === rt ? [rt, route.uidA, route.uidB] : null);
    if (!r) continue;
    const [p, s] = r[1] < r[2] ? [r[1], r[2]] : [r[2], r[1]];
    veto = veto.filter(v => !(v[0] === p && v[1] === s)).concat([[p, s, ctx.year + TUNE.vetoBulldoze]]);
    if (route && route.rt === rt) route = null;
    any = true;
  }
  if (any) { setSt({ veto, route }); ctx.mark(); }
}
function startJob(ctx) {
  const snap = { veto: st.veto, routes: st.routes, route: st.route, year: ctx.year };
  job = { q: ctx.q, it: yearJob(snap), done: false, result: null, work: 0 };
}
// history road chains: one per route and current type
function chains() {
  const R = D.Roads, out = new Map();
  R.segs.forEach(s => {
    if (s.by !== 1 || !s.rt) return;
    const k = s.rt + ':' + s.type;
    let c = out.get(k); if (!c) out.set(k, c = { key: k, rt: s.rt, type: s.type, ids: [], len: 0, yr0: 1e9, tf: 0 });
    const L = R.segSamples(s).len;
    c.ids.push(s.id); c.len += L; c.yr0 = Math.min(c.yr0, s.yr || 1e9); c.tf += (st.tf.get(pairKey(s.a, s.b)) || 0) * L;
  });
  out.forEach(c => { c.tf /= Math.max(1, c.len); c.ids.sort((a, b) => a - b); });
  return out;
}
const FIN = 1000;                // sustain value of a chain whose upgrade the budget cut short (finishes next Summer)
const thrOf = type => type === 'footpath' ? TUNE.T1 : type === 'track' ? TUNE.T2 : TUNE.T3;
function applyTraffic(res, ctx) {
  const old = st.tf, tf = new Map();
  res.flows.forEach((f, k) => { const o = old.get(k), v = o === undefined ? f : 0.7 * o + 0.3 * f; if (v >= 0.5) tf.set(k, Math.round(v * 10) / 10); });
  setSt({ tf });
  const sus = new Map();
  chains().forEach(c => {
    const n = st.sustain.get(c.key) || 0;
    sus.set(c.key, n >= FIN ? n : n < 0 ? n + 1 : c.tf >= thrOf(c.type) ? n + 1 : 0);
  });
  const veto = st.veto.filter(v => v[2] > ctx.year).concat((res.failed || []).map(([a, b]) => a < b ? [a, b, ctx.year + TUNE.vetoFail] : [b, a, ctx.year + TUNE.vetoFail]));
  setSt({ sustain: sus, veto });
}
const b64 = f32 => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s || ''), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer, 0, u8.length >> 2); };

// the outgoing direction at a dead end (continue the road it ends), else null
function deadEndDir(nid) {
  const R = D.Roads, n = nid && R.nodes.get(nid); if (!n || n.segs.length !== 1) return null;
  const s = R.segs.get(n.segs[0]); if (!s) return null;
  const S = R.segSamples(s);
  return s.b === nid ? [S.tx[S.n - 1], S.tz[S.n - 1]] : [-S.tx[0], -S.tz[0]];
}
// build leg k of the route (legs flat, 5 per leg: x0, z0, x1, z1, endFixed). Returns the (possibly
// edited) legs array and whether a road was laid, or null when every attempt failed.
function tryLeg(legs, k, ctx, rt, touch) {
  const R = D.Roads, o = k * 5, x0 = legs[o], z0 = legs[o + 1], x1 = legs[o + 2], z1 = legs[o + 3], fixed = legs[o + 4] > 0.5;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
  const tries = [[x1, z1, 'as']];
  if (L * 0.7 >= 20) tries.push([x0 + dx * 0.7, z0 + dz * 0.7, 'short']);
  if (!fixed) tries.push([x1 + px * 10, z1 + pz * 10, 'nudge'], [x1 - px * 10, z1 - pz * 10, 'nudge']);
  for (const [ex, ez, how] of tries.slice(0, 4)) {
    const A = R.snap(x0, z0, 'footpath'), B = R.snap(ex, ez, 'footpath');
    let out = legs;
    if (how === 'short') { out = legs.slice(0, o + 2).concat([ex, ez, 0, ex, ez, x1, z1, legs[o + 4]], legs.slice(o + 5)); }
    else if (how === 'nudge') { out = legs.slice(); out[o + 2] = ex; out[o + 3] = ez; if (out.length > o + 5 && Math.hypot(out[o + 5] - x1, out[o + 6] - z1) < 1) { out[o + 5] = ex; out[o + 6] = ez; } }
    if ((A.node && B.node && A.node === B.node) || Math.hypot(B.x - A.x, B.z - A.z) < 12) return { legs: out, built: false };
    if (!B.node && !B.seg && !dryAt(B.x, B.z)) continue;      // a fresh end never stands in the water
    const { c1, c2 } = R.curveFor([A.x, A.z], [B.x, B.z], deadEndDir(A.node));
    const v = R.validate(A, B, c1, c2, 'footpath');
    if (!v.ok) continue;
    if (v.upgrade) return { legs: out, built: false };          // already joined by a road
    const pv = R.previewProfile(A, B, c1, c2, 'footpath', { seps: v.seps });
    if (!pv.ok) continue;
    touch();
    const made = R.build(A, B, c1, c2, 'footpath', { grade: false, noUnders: true, keepPlayer: true, noClear: true, meta: { by: 1, yr: ctx.year, rt } });
    if (made && made.length) return { legs: out, built: true, wet: pv.wetLen > 0 };
  }
  return null;
}
function buildLegs(ctx, touch) {
  const r = st.route; if (!r) return;
  if (!placeByUid(r.uidA) || !placeByUid(r.uidB)) { setSt({ route: null }); ctx.mark(); return; }
  let legs = Array.from(r.legs), next = r.next, built = 0, wet = r.wet;
  const cap = Math.min(TUNE.legsPerYear, ctx.budget && ctx.budget.legs !== undefined ? ctx.budget.legs : 12);
  if (director_km() >= TUNE.maxKm) return;
  while (next * 5 < legs.length && built < cap && (!ctx.timeLeft || ctx.timeLeft() > 3)) {
    const res = tryLeg(legs, next, ctx, r.rt, touch);
    if (!res) {                           // abort the route; the pair rests 30 years
      const [p, q] = r.uidA < r.uidB ? [r.uidA, r.uidB] : [r.uidB, r.uidA];
      const done = next > 0 ? st.routes.concat([[r.rt, p, q, ctx.year, 'footpath']]) : st.routes;   // what was laid stays a route
      setSt({ route: null, routes: done, veto: st.veto.concat([[p, q, ctx.year + TUNE.vetoFail]]) }); ctx.mark();
      return;
    }
    legs = res.legs; next++;
    if (res.built) { built++; if (res.wet) wet = true; }
  }
  if (next * 5 >= legs.length) {
    const [p, q] = r.uidA < r.uidB ? [r.uidA, r.uidB] : [r.uidB, r.uidA];
    setSt({ route: null, routes: st.routes.concat([[r.rt, p, q, ctx.year, 'footpath']]) });
    const mx = (legs[0] + legs[legs.length - 3]) / 2, mz = (legs[1] + legs[legs.length - 2]) / 2;
    ctx.log({ k: 'path', imp: 2, x: mx, z: mz, uid: r.uidA, txt: `A path wears in between ${nameOf(r.uidA)} and ${nameOf(r.uidB)}${wet ? ', bridging the river' : ''}.` });
  } else setSt({ route: Object.assign({}, r, { legs: new Float32Array(legs), next, wet }) });
  ctx.mark();
}
function doUpgrades(ctx, touch) {
  const R = D.Roads;
  let budget = Math.min(TUNE.upgradesPerYear, ctx.budget && ctx.budget.upgrades !== undefined ? ctx.budget.upgrades : 2);
  const list = [], out = () => ctx.timeLeft && ctx.timeLeft() < 3;
  chains().forEach(c => {
    const nx = NEXT[c.type]; if (!nx) return;
    const n = st.sustain.get(c.key) || 0;
    let ok;
    if (n >= FIN) ok = true;             // a chain cut short by the budget last Summer: it finishes now
    else if (c.type === 'footpath') ok = n >= TUNE.sustain[0] || (n >= 0 && c.yr0 < 1e9 && ctx.year - c.yr0 >= TUNE.pathAge);
    else if (c.type === 'track') ok = n >= TUNE.sustain[1];
    else ok = n >= TUNE.sustain[2] && (linksTowns(c.rt) || c.len >= 5000);
    if (ok) { c.fin = n >= FIN ? 1 : 0; list.push(c); }
  });
  list.sort((p, q) => q.fin - p.fin || q.tf - p.tf || (p.key < q.key ? -1 : 1));
  for (const c of list) {
    if (budget <= 0 || out()) break;
    const nx = NEXT[c.type], up = [];
    let deferred = false;
    // the budget is checked per seg (each is a profile + tidy): a chain cut short keeps its sustain
    // count and finishes next Summer, where its remaining segs are the same chain again
    for (const id of c.ids) {
      if (out()) { deferred = true; break; }
      if (!R.segs.has(id)) continue;
      touch();
      const made = R.upgrade(id, nx, { yr: ctx.year, maxFloat: TUNE.maxFloat });
      if (made && made.length) up.push(id);
    }
    budget--;
    if (up.length) ctx.mark();
    // a lane over a wide river: a stone bridge is begun (works.js), in this same commit
    if (nx === 'lane') requestBridges(up);
    if (deferred) { const sus = new Map(st.sustain); sus.set(c.key, FIN); setSt({ sustain: sus }); ctx.mark(); continue; }
    const sus = new Map(st.sustain);
    if (!up.length) { sus.set(c.key, -10); setSt({ sustain: sus }); ctx.mark(); budget++; continue; }   // stuck: rest 10 years
    sus.delete(c.key); setSt({ sustain: sus });
    // the chronicle speaks when the whole chain has changed (this Summer, or finishing last Summer's)
    const e = st.routes.find(x => x[0] === c.rt), a = e ? nameOf(e[1]) : 'the old way', b = e ? nameOf(e[2]) : 'the next place';
    if (e) setSt({ routes: st.routes.map(x => x === e ? [x[0], x[1], x[2], x[3], nx] : x) });
    let mx = 0, mz = 0, cnt = 0;
    for (const id of up) { const s = R.segs.get(id); if (!s) continue; const S = R.segSamples(s), m = S.n >> 1; mx += S.x[m]; mz += S.z[m]; cnt++; }
    if (cnt) { mx /= cnt; mz /= cnt; }
    if (nx === 'track') ctx.log({ k: 'road', imp: 1, x: mx, z: mz, uid: e ? e[1] : 0, txt: `The path between ${a} and ${b} is worn into a track.` });
    else if (nx === 'lane') ctx.log({ k: 'road', imp: 2, x: mx, z: mz, uid: e ? e[1] : 0, txt: `The track between ${a} and ${b} is cobbled into a lane.` });
    else ctx.log({ k: 'highway', imp: 3, x: mx, z: mz, uid: e ? e[1] : 0, txt: `The road from ${a} to ${b} is made a king's highway.` });
    ctx.mark();
  }
}
// Stone bridge works for the new lane segs: wet runs are merged across segs that meet at a node (a
// crossing may be split where a leg or another path joins), and a merged run of ≥ bridgeWet metres is
// one works.js request with all of its segs.
function requestBridges(ids) {
  const R = D.Roads, W = D.Works;
  if (!ids.length || !W || !W.requestBridge || !R.wetRuns) return;
  const runs = [], par = [];
  const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const ends = new Map();       // node id -> run indices touching it
  for (const id of ids) {
    const s = R.segs.get(id); if (!s) continue;
    const L = R.segSamples(s).len;
    for (const w of R.wetRuns(id)) {
      const i = runs.length; runs.push({ id, len: w.len, x: w.x, z: w.z }); par.push(i);
      for (const [touches, nid] of [[w.d0 < 0.01, s.a], [w.d1 > L - 0.01, s.b]]) {
        if (!touches) continue;
        let l = ends.get(nid); if (!l) ends.set(nid, l = []);
        for (const j of l) par[find(j)] = find(i);
        l.push(i);
      }
    }
  }
  const groups = new Map();
  runs.forEach((r, i) => { const g = find(i); let o = groups.get(g); if (!o) groups.set(g, o = { ids: [], len: 0, best: r }); if (!o.ids.includes(r.id)) o.ids.push(r.id); o.len += r.len; if (r.len > o.best.len) o.best = r; });
  groups.forEach(g => {
    if (g.len < TUNE.bridgeWet) return;
    try { W.requestBridge(g.ids, { wetLen: g.len, x: g.best.x, z: g.best.z }); } catch (err) { console.warn('[wayfarer] requestBridge', err); }
  });
}
function linksTowns(rt) {
  const e = st.routes.find(x => x[0] === rt); if (!e) return false;
  const a = placeByUid(e[1]), b = placeByUid(e[2]);
  return !!(a && b && a.houses >= 60 && b.houses >= 60);
}
function summer(ctx) {
  const R = D.Roads; if (!R || !R.batch || !R.build) return;
  const res = job && job.done && job.result && job.q < ctx.q && ctx.q - job.q <= 4 ? job.result : null;
  job = null;
  if (res) {
    applyTraffic(res, ctx);
    if (!st.route && res.cand && director_km() < TUNE.maxKm) {
      const c = res.cand, [p, q] = c.uidA < c.uidB ? [c.uidA, c.uidB] : [c.uidB, c.uidA];
      if (!isVetoed(st.veto, p, q, ctx.year) && !recentlyRouted(st.routes, p, q, ctx.year))
        setSt({ route: { rt: st.nextRt, uidA: c.uidA, uidB: c.uidB, legs: new Float32Array(c.legs), next: 0, wet: false, y0: ctx.year }, nextRt: st.nextRt + 1 });
    }
    ctx.mark();
  }
  let touched = false;
  const touch = () => { if (!touched) { touched = true; D.History.touchObj('roads'); } };
  let hist = !!st.route;
  if (!hist) for (const s of R.segs.values()) if (s.by === 1) { hist = true; break; }
  if (hist) R.batch(() => { buildLegs(ctx, touch); doUpgrades(ctx, touch); });
  if (touched) ctx.mark();
}

// =====================================================================================================
// The part
// =====================================================================================================
const part = {
  name: 'wayfarer', order: 20,
  season(ctx) {
    if (!D.Roads || !D.Roads.segs) return;
    consumeRemovals(ctx);
    if (ctx.season === 1) summer(ctx);                       // Summer: all road mutations, one rebuild a year
    // traffic and desire lines for next year (after summer(), which consumes the old job); a job lost
    // to a reload, rollback or undo restarts in Spring
    if (ctx.season === 3 || ctx.first || (ctx.season === 0 && !job)) startJob(ctx);
  },
  update(dt) {
    if (!job || job.done) return;
    const ms = D.Story && D.Story.partBudget ? D.Story.partBudget(TUNE.budgetMs) : TUNE.budgetMs * (dt > 0.025 ? 0.5 : 1), t0 = now(), end = t0 + ms, J = job;
    try {
      while (now() < end) { const r = J.it.next(); if (r.done) { J.done = true; J.result = r.value || null; break; } }
    } catch (e) { console.error('[wayfarer] yearly job', e); J.done = true; J.result = null; }
    J.work += now() - t0;
  },
  // Hold the next commit (Spring or Summer) until this year's job is in, so every world read the job makes
  // (zones, roads, places) happens between the same two commits whatever the frame timing (§3.2). The cap is
  // work time spent in update(), not wall time, so a hidden tab or a slow frame never lets it lapse.
  busy() {
    if (!job || job.done || job.work >= TUNE.jobMs || !D.Story) return false;
    const nx = (D.Story.q + 1) & 3;
    return nx === 0 || nx === 1;
  },
  snap() { return st; },
  // (the job is kept: 'story:restored' drops it only when time turned back before it began)
  restore(s) { st = s || fresh(); cacheT = null; taken = 0; },
  serialize() {
    const r = st.route;
    return { v: 1,
      tf: Array.from(st.tf.entries()),
      sustain: Array.from(st.sustain.entries()),
      route: r ? { rt: r.rt, uidA: r.uidA, uidB: r.uidB, ptsB64: b64(r.legs), next: r.next, wet: r.wet ? 1 : 0, y0: r.y0 } : null,
      routes: st.routes.map(e => e.slice()), veto: st.veto.map(e => e.slice()), nextRt: st.nextRt };
  },
  deserialize(o) {
    job = null; cacheT = null; removedQ = []; taken = 0;
    if (!o || o.v !== 1) { st = fresh(); return; }
    const r = o.route;
    st = { tf: new Map(Array.isArray(o.tf) ? o.tf.filter(e => Array.isArray(e) && e.length === 2) : []),
      sustain: new Map(Array.isArray(o.sustain) ? o.sustain.filter(e => Array.isArray(e) && e.length === 2) : []),
      route: r && r.ptsB64 !== undefined ? { rt: r.rt | 0, uidA: r.uidA, uidB: r.uidB, legs: unb64(r.ptsB64), next: r.next | 0, wet: !!r.wet, y0: r.y0 | 0 } : null,
      routes: Array.isArray(o.routes) ? o.routes.filter(Array.isArray).map(e => e.slice()) : [],
      veto: Array.isArray(o.veto) ? o.veto.filter(Array.isArray).map(e => e.slice()) : [],
      nextRt: Math.max(o.nextRt | 0, 1) };
    for (const e of st.routes) if (e[0] >= st.nextRt) st.nextRt = e[0] + 1;
    if (st.route && st.route.rt >= st.nextRt) st.nextRt = st.route.rt + 1;
  },
  reset() { st = fresh(); job = null; cacheT = null; removedQ = []; taken = 0; },
  onView() {}
};

// =====================================================================================================
// Exports (spec §5.8)
// =====================================================================================================
const Wf = D.Wayfarer = {
  // unit vector from a place towards the partner it has the heaviest desire line with, or null
  pull(sid) {
    let list = null; try { list = D.Town && D.Town.hist && D.Town.hist.list ? D.Town.hist.list() : null; } catch (e) { list = null; }
    if (!list) return null;
    // Town's list object changes on every building reveal: key the cache on what gravity reads
    const sig = pullCache && pullCache.list === list ? pullCache.sig : list.map(s => s.sid + ':' + ((s.houses | 0) >> 2) + ':' + (s.x | 0) + ':' + (s.z | 0) + ':' + s.type).join(',');
    if (pullCache && pullCache.sig === sig) pullCache.list = list;
    else {
      const pl = list.map(s => ({ sid: s.sid, type: s.type, houses: s.houses, x: s.x, z: s.z })), best = new Map();
      for (const pr of gravity(pl)) for (const [a, b] of [[pr.i, pr.j], [pr.j, pr.i]]) { const o = best.get(pl[a].sid); if (!o || pr.demand > o.demand) best.set(pl[a].sid, { demand: pr.demand, dx: pl[b].x - pl[a].x, dz: pl[b].z - pl[a].z }); }
      const map = new Map(); best.forEach((o, s) => { const l = Math.hypot(o.dx, o.dz); if (l > 1e-6) map.set(s, [o.dx / l, o.dz / l]); });
      pullCache = { list, sig, map };
    }
    return pullCache.map.get(sid) || null;
  },
  // how busy the roads at a place are, 0..1 against the busiest place (.5 before any traffic is known)
  trafficOf(sid) {
    if (!st.tf.size || !D.Roads) return 0.5;
    if (!cacheT) {
      const pl = places(), sum = new Map(), R = D.Roads, cells = new Map(), C = 512;
      // places by 512 m cell of their bbox grown by 250 m, so each flow looks at a handful of places
      for (const p of pl) {
        const bb = p.bb || [p.x, p.z, p.x, p.z];
        for (let i = Math.floor((bb[0] - 250) / C); i <= Math.floor((bb[2] + 250) / C); i++)
          for (let j = Math.floor((bb[1] - 250) / C); j <= Math.floor((bb[3] + 250) / C); j++) { const k = i * 4096 + j; let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(p); }
      }
      st.tf.forEach((f, k) => {
        const [a, b] = k.split('-').map(Number), na = R.nodes.get(a), nb = R.nodes.get(b); if (!na || !nb) return;
        const x = (na.x + nb.x) / 2, z = (na.z + nb.z) / 2, l = cells.get(Math.floor(x / C) * 4096 + Math.floor(z / C)); if (!l) return;
        for (const p of l) { const bb = p.bb || [p.x, p.z, p.x, p.z]; if (x > bb[0] - 250 && x < bb[2] + 250 && z > bb[1] - 250 && z < bb[3] + 250) sum.set(p.sid, (sum.get(p.sid) || 0) + f); }
      });
      let mx = 0; sum.forEach(v => { if (v > mx) mx = v; });
      cacheT = { sum, mx };
    }
    if (!cacheT.mx) return 0.5;
    return D.clamp((cacheT.sum.get(sid) || 0) / cacheT.mx, 0, 1);
  },
  get traffic() { return st.tf; },
  routes() {
    const out = st.routes.map(e => ({ rt: e[0], uidA: e[1], uidB: e[2], y: e[3], type: e[4], done: true }));
    if (st.route) out.push({ rt: st.route.rt, uidA: st.route.uidA, uidB: st.route.uidB, y: st.route.y0, type: 'footpath', done: false, next: st.route.next, legs: st.route.legs.length / 5 });
    return out;
  },
  part,
  init() {
    if (Wf._inited) return; Wf._inited = true;
    if (D.Story && D.Story.register) D.Story.register('wayfarer', part);
    // the player bulldozes a history road: its pair rests 50 years (converted at the next commit)
    D.on('roads:removed', (bb, metas) => {
      if ((D.Story && D.Story.committing) || !metas) return;
      for (const m of metas) if (m && m.by === 1 && m.rt) removedQ.push(m.rt);
    });
    D.on('story:restored', () => {
      cacheT = null; pullCache = null;
      const S = D.Story; if (!S) { job = null; return; }
      if (job && !(S.q >= job.q)) job = null;               // time turned back before the job began
      // an undo or load that lands just before a Summer: its job is started now, so busy() can hold it
      if (!job && S.started && ((S.q + 1) & 3) === 1 && D.Roads && D.Roads.segs) startJob({ q: S.q, year: S.q >> 2 });
    });
    D.on('world:reset', () => { removedQ = []; taken = 0; job = null; });
    console.info('[wayfarer] tune', JSON.stringify(TUNE));
  },
  _pure: { astar, astarGen, douglasPeucker, legsOf, gravity, dijkstra, massOf, offRoadRuns },
  _dev: {
    state: () => st,
    job: () => job,
    // run this year's job synchronously (browser console): Wayfarer._dev.runJob()
    runJob() { if (!job) job = { q: D.Story ? D.Story.q : 0, it: yearJob({ veto: st.veto, routes: st.routes, route: st.route, year: D.Story ? D.Story.year() : 0 }), done: false, result: null, work: 0 }; let r; do { r = job.it.next(); } while (!r.done); job.done = true; job.result = r.value || null; return job.result; },
    // plan a route between two places now (does not build): Wayfarer._dev.plan(uidA, uidB)
    plan(uidA, uidB) {
      const A = placeByUid(uidA), B = placeByUid(uidB); if (!A || !B) return null;
      const G = buildGraph(); for (const p of [A, B]) { p.gates = gatesOf(p); p.anchor = anchorOf(G, p, p.gates); }
      const it = routeJob(G, { A, B, d: Math.hypot(A.x - B.x, A.z - B.z) }); let r; do { r = it.next(); } while (!r.done); return r.value;
    },
    queueRemoval: rt => removedQ.push(rt)
  }
};
})();
