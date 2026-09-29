// Wayfarer (js/wayfarer.js) and the Living History road hooks (js/roads.js).
import { load, test, assert, eq, near } from './harness.js';

const FILES = ['js/core.js', 'dev/tests/wayfarer.env.js', 'js/roads.js', 'js/wayfarer.js'];
const fresh = () => load(FILES);
const P = D => D.Wayfarer._pure;
const spec = (x, z) => ({ x, z });
// build helper: straight road between two points (player unless opts given)
function road(D, a, b, type, opts) {
  const R = D.Roads, A = R.snap(a[0], a[1], type), B = R.snap(b[0], b[1], type);
  const { c1, c2 } = R.curveFor([A.x, A.z], [B.x, B.z], null);
  return R.build(A, B, c1, c2, type || 'track', opts);
}
const HIST = (yr, rt) => ({ grade: false, noUnders: true, keepPlayer: true, noClear: true, meta: { by: 1, yr, rt } });

// ---------------------------------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------------------------------
test('gravity: symmetric pairs, spec formula, 9 km cut-off, farmland ignored', () => {
  const D = fresh(), g = P(D).gravity;
  const pl = [{ x: 0, z: 0, houses: 50, type: 1 }, { x: 2000, z: 0, houses: 50, type: 1 }, { x: 20000, z: 0, houses: 50, type: 1 }, { x: 100, z: 0, houses: 80, type: 2 }];
  const pr = g(pl, { scale: 1 });
  eq(pr.length, 1, 'only the pair within 9 km, farmland skipped');
  const m = Math.pow(50, 0.8);
  near(pr[0].demand, m * m / Math.pow(2000, 1.6), 1e-12);
  const castle = g([{ x: 0, z: 0, houses: 50, type: 3 }, { x: 500, z: 0, houses: 50, type: 5 }], { scale: 1 })[0];
  near(castle.demand, m * 0.6 * m * 1.3 / Math.pow(600, 1.6), 1e-12, 'mass factors and the 600 m floor');
});

test('dijkstra finds the cheapest path over a CSR graph', () => {
  const D = fresh();
  // 0-1 (1), 1-2 (1), 0-2 (5)
  const E = [[0, 1, 1], [1, 2, 1], [0, 2, 5]], n = 3, deg = [0, 0, 0];
  E.forEach(e => { deg[e[0]]++; deg[e[1]]++; });
  const off = new Int32Array(n + 1); for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const fill = off.slice(0, n), to = new Int32Array(off[n]), w = new Float32Array(off[n]);
  for (const [a, b, c] of E) { to[fill[a]] = b; w[fill[a]++] = c; to[fill[b]] = a; w[fill[b]++] = c; }
  const r = P(D).dijkstra({ n, off, to, w }, [[0, 0]]);
  eq(Array.from(r.dist), [0, 1, 2]);
  assert(to[r.via[2]] === 2 && r.via[2] >= off[1] && r.via[2] < off[2], 'reached 2 from 1');
});

function gridOf(w, h, fn) { return { w, h, cost: i => fn(i % w, (i / w) | 0) }; }
test('A* avoids impassable cells (and corners) and finds the gap', () => {
  const D = fresh();
  const grid = gridOf(30, 30, (i, j) => (i === 15 && j !== 25) ? Infinity : 1);
  const path = P(D).astar(grid, [5 * 30 + 2], [5 * 30 + 28], { heur: 1, turn: 0 });
  assert(path && path.length > 2, 'found');
  for (const c of path) assert(!(c % 30 === 15 && ((c / 30) | 0) !== 25), 'never through the wall');
  assert(path.some(c => c % 30 === 15 && ((c / 30) | 0) === 25), 'through the gap');
  eq(path[0], 152); eq(path[path.length - 1], 178);
  // fully walled: no path
  eq(P(D).astar(gridOf(10, 10, i => i === 5 ? Infinity : 1), [2], [8]), null);
});

test('A* merges onto a cheap road instead of running parallel', () => {
  const D = fresh();
  // a road along row 10 (cost .3); start/end just off it at either end
  const grid = gridOf(60, 30, (i, j) => j === 10 ? 0.3 : 1);
  const path = P(D).astar(grid, [8 * 60 + 2], [8 * 60 + 57], { heur: 0.5, turn: 0.35 });
  const onRoad = path.filter(c => ((c / 60) | 0) === 10).length;
  assert(onRoad > 40, 'most of the way on the road: ' + onRoad);
});

test('Douglas-Peucker keeps bends and drops jitter', () => {
  const D = fresh(), dp = P(D).douglasPeucker;
  const line = []; for (let k = 0; k <= 20; k++) line.push(k * 10, (k % 2) * 3);
  eq(dp(line, 5).length, 4, 'jitter < tol → just the ends');
  const bend = [0, 0, 50, 0, 100, 0, 100, 50, 100, 100];
  eq(dp(bend, 5), [0, 0, 100, 0, 100, 100]);
});

test('legsOf: legs within 40–150 m, cover the line, cut at bends', () => {
  const D = fresh(), legsOf = P(D).legsOf, len = l => Math.hypot(l[2] - l[0], l[3] - l[1]);
  const straight = legsOf([0, 0, 1000, 0], { min: 40, max: 150 });
  assert(straight.length >= 7, 'enough legs');
  let sum = 0; for (const l of straight) { assert(len(l) >= 40 - 1e-6 && len(l) <= 150 + 1e-6, 'leg length ' + len(l)); sum += len(l); }
  near(sum, 1000, 1e-6, 'covers the line');
  for (let k = 1; k < straight.length; k++) eq([straight[k][0], straight[k][1]], [straight[k - 1][2], straight[k - 1][3]], 'chained');
  eq(legsOf([0, 0, 30, 0], { min: 40, max: 150 }).length, 1, 'a short line is one leg');
  eq(legsOf([0, 0, 8, 0], { min: 40, max: 150 }).length, 0, 'a tiny line is none');
  // an L of 120 + 120 m: the corner is a leg end
  const L = legsOf([0, 0, 120, 0, 120, 120], { min: 40, max: 150 });
  assert(L.some(l => l[2] === 120 && l[3] === 0), 'cut at the corner');
  for (const l of L) assert(len(l) >= 40 - 1e-6 && len(l) <= 150 + 1e-6, 'L leg length');
});

test('offRoadRuns splits at contacts and drops 1-point wobbles', () => {
  const D = fresh(), f = P(D).offRoadRuns;
  eq(f([0, 0, 1, 1, 0, 1, 0, 0, 0]), [[0, 1], [6, 8]]);
  eq(f([0, 0, 0]), [[0, 2]]);
  eq(f([1, 1]), []);
});

// ---------------------------------------------------------------------------------------------------
// roads.js hooks
// ---------------------------------------------------------------------------------------------------
test('metadata: player vs history segs, save round trip, v44-shaped player records', () => {
  const D = fresh(), R = D.Roads;
  road(D, [1000, 1000], [1300, 1000], 'track');
  road(D, [1000, 1400], [1300, 1400], 'footpath', HIST(1120, 7));
  const segs = Array.from(R.segs.values());
  const pl = segs.find(s => s.type === 'track'), hi = segs.find(s => s.type === 'footpath');
  eq([pl.by, pl.yr, pl.up, pl.rt], [0, undefined, undefined, undefined]);
  eq([hi.by, hi.yr, hi.rt, hi.up], [1, 1120, 7, [[1120, 'footpath']]]);
  const s = JSON.parse(JSON.stringify(R.serialize()));
  const ps = s.segs.find(x => x.t === 'track'), hs = s.segs.find(x => x.t === 'footpath');
  eq(Object.keys(ps), ['id', 'a', 'b', 't', 'c1', 'c2', 'p', 'f', 'd', 'm'], 'player record exactly as v44');
  eq([hs.by, hs.yr, hs.rt, hs.up], [1, 1120, 7, [[1120, 'footpath']]]);
  R.deserialize(s);
  eq(JSON.stringify(R.serialize()), JSON.stringify(s), 'round trip');
  const h2 = Array.from(R.segs.values()).find(x => x.type === 'footpath');
  eq([h2.by, h2.yr, h2.rt], [1, 1120, 7]);
});

test('split keeps by/yr/up/rt on both halves', () => {
  const D = fresh(), R = D.Roads;
  road(D, [2000, 2000], [2400, 2000], 'footpath', HIST(1100, 3));
  road(D, [2200, 1800], [2200, 2200], 'footpath', HIST(1105, 4));
  const r3 = Array.from(R.segs.values()).filter(s => s.rt === 3);
  eq(r3.length, 2, 'the first road was split at the crossing');
  for (const s of r3) eq([s.by, s.yr, s.up], [1, 1100, [[1100, 'footpath']]]);
});

test('keepPlayer: a history path may split a player road but playerHash is unchanged; bulldozing it restores', () => {
  const D = fresh(), R = D.Roads;
  road(D, [3000, 3000], [3500, 3000], 'track');
  road(D, [3500, 3000], [3800, 3200], 'track');
  const h0 = R.playerHash(), n0 = Array.from(R.nodes.values()).filter(n => n.segs.length).map(n => [n.id, n.x, n.z, n.y]);
  const made = road(D, [3250, 2800], [3250, 3300], 'footpath', HIST(1200, 9));
  assert(made.length >= 2, 'crossed and joined');
  const players = Array.from(R.segs.values()).filter(s => !s.by);
  eq(players.length, 3, 'player road split in two');
  eq(R.playerHash(), h0, 'player hash is split-independent');
  for (const [id, x, z, y] of n0) { const n = R.nodes.get(id); assert(n && n.x === x && n.z === z && n.y === y, 'player node untouched ' + id); }
  // bulldoze the history segs: the glued player road hashes the same
  const metas = []; D.on('roads:removed', (bb, m) => metas.push(...(m || [])));
  for (const s of Array.from(R.segs.values())) if (s.by) R.removeSeg(s);
  eq(metas.length, 2); assert(metas.every(m => m.by === 1 && m.rt === 9 && m.yr === 1200), 'removal metas');
  eq(R.playerHash(), h0);
  // a real player change does change it
  const s0 = Array.from(R.segs.values()).find(s => !s.by);
  s0.type = 'lane';
  assert(R.playerHash() !== h0, 'retyping a player road changes the hash');
});

test('keepPlayer: a history end near a player junction merges into it without moving it', () => {
  const D = fresh(), R = D.Roads;
  road(D, [4000, 4000], [4300, 4000], 'track');
  const end = Array.from(R.nodes.values()).find(n => n.x > 4290);
  const before = [end.x, end.z, end.y], h0 = R.playerHash();
  // a history path ending 4 m from the player's dead end (no snapping: raw coordinates)
  const A = { x: 4304, z: 4200 }, B = { x: 4303, z: 4003 };
  const { c1, c2 } = R.curveFor([A.x, A.z], [B.x, B.z], null);
  const made = R.build(A, B, c1, c2, 'footpath', HIST(1300, 11));
  assert(made.length === 1, 'built');
  eq([end.x, end.z, end.y], before, 'player node kept its place');
  assert(R.nodes.get(end.id).segs.length === 2, 'history path merged into the player node');
  eq(R.playerHash(), h0);
});

test('noUnders: refuses (without mutating) where an existing road would have to bridge us', () => {
  const D = fresh(), R = D.Roads;
  road(D, [5000, 5000], [5400, 5000], 'track');
  const pl = Array.from(R.segs.values())[0];
  pl.prof = pl.prof.map(() => 20); for (const id of [pl.a, pl.b]) R.nodes.get(id).y = 20;   // an embanked player road
  const snap = JSON.stringify(R.serialize()), next = R.nextId;
  const out = road(D, [5200, 4800], [5200, 5200], 'footpath', HIST(1100, 1));
  eq(out, []);
  eq(JSON.stringify(R.serialize()), snap, 'nothing changed');
  eq(R.nextId, next);
  // the player tool (no noUnders) would re-flag the player road as a bridge
  road(D, [5200, 4800], [5200, 5200], 'footpath');
  assert(Array.from(R.segs.values()).some(s => s.type === 'track' && s.flags.some(f => f === 1)), 'player path does get the under-bridge');
});

test('noClear: no clearCorridor, Town.hideRoadRect gets the corridor instead', () => {
  const D = fresh(), R = D.Roads;
  let cleared = 0; D.Nature = { clearWhere() { cleared++; } };
  road(D, [6000, 6000], [6200, 6000], 'footpath', HIST(1100, 2));
  eq(cleared, 0); eq(D._env.hidden.length, 1);
  road(D, [6000, 6300], [6200, 6300], 'track');
  eq(cleared, 1, 'player roads still clear as before');
});

test('R.batch: one roads:changed and a coherent spatial hash', () => {
  const D = fresh(), R = D.Roads;
  let n = 0; D.on('roads:changed', () => n++);
  R.batch(() => {
    road(D, [7000, 7000], [7300, 7000], 'footpath', HIST(1100, 5));
    road(D, [7150, 6850], [7150, 7150], 'footpath', HIST(1100, 6));
    road(D, [7300, 7000], [7500, 7100], 'footpath', HIST(1100, 5));
  });
  eq(n, 1, 'one emission');
  const probes = [[7100, 7000], [7150, 6900], [7400, 7050], [7150, 7100]];
  const a = probes.map(p => { const s = R.segAt(p[0], p[1], 3); return s ? s.id : 0; });
  R.deserialize(R.serialize());
  const b = probes.map(p => { const s = R.segAt(p[0], p[1], 3); return s ? s.id : 0; });
  eq(a, b, 'incremental hash answers like a full rehash');
  assert(a.every(Boolean), 'all probes hit');
  n = 0; R.batch(() => {}); eq(n, 0, 'an empty batch emits nothing');
});

test('R.upgrade: history only, logs the type, reverts on float', () => {
  const D = fresh(), R = D.Roads;
  road(D, [8000, 8000], [8300, 8000], 'track');
  road(D, [8000, 8300], [8300, 8300], 'footpath', HIST(1100, 8));
  const pl = Array.from(R.segs.values()).find(s => !s.by), hi = Array.from(R.segs.values()).find(s => s.by);
  eq(R.upgrade(pl.id, 'lane', { yr: 1150 }), [], 'player roads are never upgraded');
  const prof0 = Array.from(hi.prof);
  eq(R.upgrade(hi.id, 'track', { yr: 1150, maxFloat: 0 }), [], 'refused: floats');
  eq([hi.type, Array.from(hi.prof)], ['footpath', prof0], 'reverted exactly');
  const up = R.upgrade(hi.id, 'track', { yr: 1150, maxFloat: 1.2 });
  eq(up.length, 1);
  eq([hi.type, hi.dr, hi.up], ['track', 1, [[1100, 'footpath'], [1150, 'track']]]);
  eq(R.typeAt(hi, 1120), 'footpath'); eq(R.typeAt(hi, 1150), 'track'); eq(R.typeAt(hi, undefined), 'track');
  // a manual building in the widened corridor refuses
  D.Town.addManual({ x: 8150, z: 8304, w: 6, d: 6, rot: 0, kind: 'cottage' });
  eq(R.upgrade(hi.id, 'lane', { yr: 1160 }), []);
});

test('curveFor, previewProfile and wetRuns', () => {
  const D = fresh(), R = D.Roads, env = D._env;
  const s = R.curveFor([0, 0], [300, 0], null);
  eq([s.c1, s.c2], [[100, 0], [200, 0]]);
  const c = R.curveFor([0, 0], [300, 0], [1, 1]);
  near(c.c1[0], c.c1[1], 1e-9, 'leaves along dir');
  const far = R.curveFor([0, 0], [300, 0], [-1, 0]);
  eq([far.c1, far.c2], [[100, 0], [200, 0]], 'dir against the chord → straight');
  // a river 40 m wide at x 9480..9520
  env.water = (x, z) => (x > 9480 && x < 9520 ? 12 : -100);
  const A = spec(9400, 9000), B = spec(9600, 9000), k = R.curveFor([A.x, A.z], [B.x, B.z], null);
  const p = R.previewProfile(A, B, k.c1, k.c2, 'footpath');
  assert(p.ok, 'ok'); near(p.wetLen, 40, 4.5, 'wet length'); assert(p.maxFloat < 0.5, 'drapes: ' + p.maxFloat); eq(p.manualHit, false);
  env.water = (x, z) => (x > 9450 && x < 9550 ? 12 : -100);
  assert(!R.previewProfile(A, B, k.c1, k.c2, 'footpath').ok, 'too wide to bridge');
  env.water = (x, z) => (x > 9480 && x < 9520 ? 12 : -100);
  const made = R.build(A, B, k.c1, k.c2, 'lane', HIST(1100, 1));
  const runs = R.wetRuns(made[0].id);
  eq(runs.length, 1); near(runs[0].len, 40, 4.5); near(runs[0].x, 9500, 3);
  D.Town.addManual({ x: 9450, z: 9003, w: 5, d: 5, rot: 0 });
  assert(R.previewProfile(A, B, k.c1, k.c2, 'footpath').manualHit, 'manual record in the corridor');
});

test('bridge works: site piers from the town bank, staged _gw, survives undo (deserialize)', () => {
  const D = fresh(), R = D.Roads, env = D._env;
  env.water = (x, z) => (x > 10060 && x < 10140 ? 12 : -100);                 // 80 m of water
  env.places = [{ sid: 1, uid: 1, type: 1, name: 'Ashby', houses: 80, x: 10400, z: 10000, bb: [10300, 9900, 10500, 10100] }];
  const made = road(D, [9900, 10000], [10300, 10000], 'lane', HIST(1100, 1));
  const seg = made.find(s => R.wetRuns(s.id).length);
  const site0 = R.bridgeWorkSite(seg.id);
  assert(site0 && site0.piers.length >= 3, 'piers: ' + (site0 && site0.piers.length));
  assert(site0.piers[0].x > site0.piers[site0.piers.length - 1].x, 'first pier on the town (east) bank');
  R.setBridgeWork(seg.id, { st: 1, n: site0.piers.length });
  eq(seg._gw.st, 1); assert(R.dirty, 'marks a rebuild');
  near(R.bridgeWorkSite(seg.id).x, site0.piers[1].x, 1e-6, 'active pier follows the stage');
  R.deserialize(R.serialize());
  eq(R.segs.get(seg.id)._gw.st, 1, 're-applied after an undo/redo round trip');
  R.setBridgeWork(seg.id, null);
  eq(R.segs.get(seg.id)._gw, null);
});

test('bridgeWorkSite measures the bridge run clamped to the junction trims (as buildBridges renders it)', () => {
  const D = fresh(), R = D.Roads, env = D._env;
  env.water = (x, z) => (x > 3120 && x < 3260 ? 12 : -100);                   // the junction node at 3200 is mid-river
  road(D, [3000, 3000], [3200, 3000], 'lane', HIST(1100, 1));
  road(D, [3200, 3000], [3400, 3000], 'lane', HIST(1100, 1));
  road(D, [3200, 3000], [3200, 2800], 'lane', HIST(1100, 2));
  const seg = Array.from(R.segs.values()).find(s => s.rt === 1 && R.nodes.get(s.a).x < 3100);
  const S = R.segSamples(seg), tB = R.trimAt(seg, seg.b === Array.from(R.nodes.values()).find(n => Math.abs(n.x - 3200) < 1 && Math.abs(n.z - 3000) < 1).id ? 'b' : 'a');
  assert(tB > 0.5, 'a junction trim: ' + tB);
  let q0 = -1, q1 = -1; for (let q = 0; q < S.n; q++) if (seg.flags[q] === 1) { if (q0 < 0) q0 = q; q1 = q; }
  assert(q0 >= 0 && q1 === S.n - 1, 'the bridge runs into the junction');
  const d0 = q0 > 0 ? (S.L[q0 - 1] + S.L[q0]) / 2 : 0;
  const site = R.bridgeWorkSite(seg.id);
  near(site.len, S.len - tB - d0, 1e-6, 'run clamped to the trim');
});

test('drawAtlas draws every mode without throwing', () => {
  const D = fresh(), R = D.Roads;
  road(D, [11000, 11000], [11300, 11000], 'track');
  road(D, [11000, 11300], [11300, 11300], 'footpath', HIST(1150, 1));
  const calls = { stroke: 0 };
  const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : (k === 'stroke' ? () => calls.stroke++ : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  for (const mode of ['type', 'traffic', 'age']) R.drawAtlas(ctx, 1024 / 16384, { mode, traffic: new Map() });
  eq(calls.stroke, 6);
  calls.stroke = 0; R.drawAtlas(ctx, 0.0625, { mode: 'age', year: 1100 });
  eq(calls.stroke, 1, 'year filter hides the later path');
});

// ---------------------------------------------------------------------------------------------------
// the Story part, end to end on stubs
// ---------------------------------------------------------------------------------------------------
function world(D) {
  const env = D._env;
  env.places = [
    { sid: 1, uid: 101, type: 1, name: 'Ashby', houses: 60, x: 12000, z: 12000, bb: [11900, 11900, 12100, 12100] },
    { sid: 2, uid: 102, type: 1, name: 'Crowfield', houses: 60, x: 13600, z: 12000, bb: [13500, 11900, 13700, 12100] }
  ];
  env.gates = { 1: [{ x: 12100, z: 12000, dx: 1, dz: 0 }], 2: [{ x: 13500, z: 12000, dx: -1, dz: 0 }] };
  D.Story = { q: 0, committing: false, register() {} };
  D.Wayfarer.init();
}
function commit(D, q, logs) {
  const ctx = { q, year: q >> 2, season: q & 3, first: false, catchUp: false, branch: 0, budget: { legs: 12, upgrades: 2 },
    timeLeft: () => 12, log: e => logs.push(e), mark() { ctx.dirty = true; } };
  D.Story.q = q; D.Story.committing = true;
  try { D.Wayfarer.part.season(ctx); } finally { D.Story.committing = false; }
  return ctx;
}
function drain(D) { for (let k = 0; k < 20000 && D.Wayfarer._dev.job() && !D.Wayfarer._dev.job().done; k++) D.Wayfarer.part.update(0.016); }
function years(D, y0, n, logs) {
  for (let q = y0 * 4; q < (y0 + n) * 4; q++) {
    D.Story.q = q - 1;                 // busy() looks at the next season
    drain(D);
    commit(D, q, logs);
  }
}

test('part: a desire line wears in as history footpaths, crossing a player road without disturbing it', () => {
  const D = fresh(), R = D.Roads, logs = [];
  world(D);
  D._env.ground = (x, z) => 10 + 4 * Math.sin(x / 300) * Math.cos(z / 260);   // rolling land
  road(D, [12800, 11600], [12800, 12400], 'track', { grade: true });   // the player's graded road between them
  let cleared = 0; D.Nature = { clearWhere() { cleared++; } };
  const wh = () => { let h = 0; for (let i = 0; i < D.W.h.length; i++) h = (h * 31 + Math.round(D.W.h[i] * 1000)) | 0; return h; };
  const h0 = R.playerHash(), w0 = wh();
  years(D, 1086, 3, logs);
  eq(wh(), w0, 'terrain never touched'); eq(cleared, 0, 'no plants cleared');
  const hist = Array.from(R.segs.values()).filter(s => s.by === 1);
  assert(hist.length >= 8, 'history segs: ' + hist.length);
  assert(hist.every(s => s.type === 'footpath' && s.dr === 1 && s.rt === 1 && s.yr >= 1086), 'draped footpaths of route 1');
  eq(R.playerHash(), h0, 'player road unchanged (split only)');
  const path = logs.find(e => e.k === 'path');
  assert(path && path.imp === 2 && /Ashby and Crowfield/.test(path.txt), 'chronicle: ' + (path && path.txt));
  const legsPerSummer = hist.length;
  assert(legsPerSummer <= 3 * 12 + 4, 'leg cap');
  eq(D.Wayfarer.routes().filter(r => r.done).length, 1);
  assert(D.Wayfarer.traffic.size > 0 && D.Wayfarer.trafficOf(1) > 0, 'traffic known');
  const pull = D.Wayfarer.pull(1); near(pull[0], 1, 1e-9, 'Ashby is pulled east');
});

test('part: footpaths age into tracks, snapshots are immutable, save round trip, bulldoze veto', () => {
  const D = fresh(), R = D.Roads, logs = [];
  world(D);
  years(D, 1086, 3, logs);
  const snapA = D.Wayfarer.part.snap(), jsonA = JSON.stringify(D.Wayfarer.part.serialize());
  years(D, 1089, 5, logs);
  const snapB = D.Wayfarer.part.snap(), jsonB = JSON.stringify(D.Wayfarer.part.serialize());
  eq(jsonB !== jsonA, true);
  D.Wayfarer.part.restore(snapA);
  eq(JSON.stringify(D.Wayfarer.part.serialize()), jsonA, 'restoring an old snap gives the old state back exactly');
  D.Wayfarer.part.restore(snapB);
  eq(JSON.stringify(D.Wayfarer.part.serialize()), jsonB);
  const hist = Array.from(R.segs.values()).filter(s => s.by === 1);
  assert(hist.some(s => s.type === 'track'), 'worn into tracks');
  assert(logs.some(e => e.k === 'road' && /worn into a track/.test(e.txt)), 'logged');
  const t = hist.find(s => s.type === 'track'); eq(t.up.length, 2);
  // save round trip
  const s = JSON.parse(JSON.stringify(D.Wayfarer.part.serialize()));
  D.Wayfarer.part.deserialize(s);
  eq(JSON.stringify(D.Wayfarer.part.serialize()), JSON.stringify(s));
  D.Wayfarer.part.deserialize(null);
  eq(D.Wayfarer.part.serialize().routes, []);
  D.Wayfarer.part.deserialize(s);
  // the player bulldozes a history road: the pair rests 50 years
  R.removeSeg(t);
  commit(D, 1094 * 4 + 2, logs);
  const v = D.Wayfarer.part.serialize().veto;
  assert(v.some(e => e[0] === 101 && e[1] === 102 && e[2] === 1094 + 50), 'veto ' + JSON.stringify(v));
});

test('part: busy() holds the next commit until the job is in; restores keep or drop the job by time; Spring restarts a lost job', () => {
  const D = fresh(), logs = [];
  world(D);
  commit(D, 1086 * 4 + 3, logs);                 // Winter: job starts
  D.Story.q = 1086 * 4 + 3;                      // next season = Spring: held (the job reads the world before it)
  eq(D.Wayfarer.part.busy(), true);
  D.Story.q = 1086 * 4 + 1;                      // next = Autumn: never held
  eq(D.Wayfarer.part.busy(), false);
  D.Story.q = 1086 * 4 + 3;
  drain(D);
  eq(D.Wayfarer.part.busy(), false, 'done');
  const J = D.Wayfarer._dev.job();
  D.emit('story:restored');                      // e.g. undo of a player stroke: the clock did not go back
  eq(D.Wayfarer._dev.job(), J, 'job kept');
  D.Wayfarer.part.restore(D.Wayfarer.part.snap());
  eq(D.Wayfarer._dev.job(), J, 'restore() does not drop it either');
  D.Story.q = 1086 * 4 + 2; D.emit('story:restored');   // undo back before the Winter commit
  eq(D.Wayfarer._dev.job(), null, 'job dropped: time turned back before it');
  const ctx = commit(D, 1087 * 4 + 1, logs);
  eq(D.Wayfarer.routes().length, 0, 'no route without a job');
  assert(!ctx.dirty, 'nothing changed');
  // a lost job (reload) restarts in Spring and holds the Summer commit
  commit(D, 1088 * 4, logs);
  assert(D.Wayfarer._dev.job() && !D.Wayfarer._dev.job().done, 'Spring started a job');
  D.Story.q = 1088 * 4; eq(D.Wayfarer.part.busy(), true, 'Summer held for it');
  drain(D); commit(D, 1088 * 4 + 1, logs);
  eq(D.Wayfarer.routes().length, 1, 'the route is laid from the Spring job');
  // loaded just before a Summer: story:restored starts the job at once
  D.Wayfarer.part.deserialize(null); eq(D.Wayfarer._dev.job(), null);
  D.Story.started = true; D.Story.q = 1090 * 4; D.emit('story:restored');
  assert(D.Wayfarer._dev.job(), 'job started for the coming Summer');
  // the work cap: a job that has eaten jobMs of work no longer holds anything
  D.Wayfarer._dev.job().work = 1e9; eq(D.Wayfarer.part.busy(), false);
});

test('part: bulldoze vetoes survive a rolled-back commit and are applied once', () => {
  const D = fresh(), logs = [];
  world(D);
  const W = D.Wayfarer;
  W.part.deserialize({ v: 1, tf: [], sustain: [], route: null, routes: [[5, 101, 102, 1080, 'footpath']], veto: [], nextRt: 6 });
  W._dev.queueRemoval(5);
  const before = W.part.snap();
  commit(D, 1090 * 4, logs);
  assert(W._dev.state().veto.some(v => v[0] === 101 && v[2] === 1140), 'veto');
  W.part.restore(before);                        // the commit was rolled back (I10)
  eq(W._dev.state().veto, []);
  commit(D, 1090 * 4 + 1, logs);
  eq(W._dev.state().veto.length, 1, 're-applied by the next commit');
  const after = W._dev.state().veto;
  commit(D, 1090 * 4 + 2, logs);
  eq(W._dev.state().veto, after, 'the queue was retired: not re-applied');
});

// a history chain of n straight pieces (route rt) along x, returns the seg ids
function chainOf(D, x0, z, n, step, type, rt) {
  for (let k = 0; k < n; k++) road(D, [x0 + k * step, z], [x0 + (k + 1) * step, z], type, HIST(1080, rt));
  return Array.from(D.Roads.segs.values()).filter(s => s.rt === rt).map(s => s.id);
}
test('part: an upgrade cut short by the budget keeps its place and finishes next Summer (one chronicle line)', () => {
  const D = fresh(), R = D.Roads, logs = [];
  world(D);
  const ids = chainOf(D, 3000, 3000, 12, 60, 'footpath', 1);
  eq(ids.length, 12);
  D.Wayfarer.part.deserialize({ v: 1, tf: [], sustain: [['1:footpath', 3]], route: null, routes: [[1, 101, 102, 1080, 'footpath']], veto: [], nextRt: 2 });
  // a clock that runs out after five checks
  let calls = 0;
  const ctx = { q: 1090 * 4 + 1, year: 1090, season: 1, first: false, budget: { legs: 12, upgrades: 2 }, timeLeft: () => (++calls <= 5 ? 12 : 0), log: e => logs.push(e), mark() { ctx.dirty = true; } };
  D.Story.committing = true; try { D.Wayfarer.part.season(ctx); } finally { D.Story.committing = false; }
  const tracks = () => Array.from(R.segs.values()).filter(s => s.rt === 1 && s.type === 'track').length;
  const n1 = tracks();
  assert(n1 > 0 && n1 < 12, 'part of the chain: ' + n1);
  assert(ctx.dirty, 'marked');
  eq(logs.filter(e => e.k === 'road').length, 0, 'no chronicle line yet');
  eq(D.Wayfarer._dev.state().sustain.get('1:footpath'), 1000, 'the rest is marked to finish');
  commit(D, 1091 * 4 + 1, logs);
  eq(Array.from(R.segs.values()).filter(s => s.rt === 1 && s.type === 'footpath').length, 0, 'finished (tidy may merge the tracks)');
  eq(logs.filter(e => e.k === 'road').length, 1, 'one chronicle line');
  eq(D.Wayfarer._dev.state().sustain.has('1:footpath'), false);
});

test('part: a Summer on a real clock defers legs past the budget and carries on next year', () => {
  const D = fresh(), R = D.Roads, logs = [];
  world(D);
  D._env.places[1].x = 15000; D._env.places[1].bb = [14900, 11900, 15100, 12100]; D._env.gates[2] = [{ x: 14900, z: 12000, dx: -1, dz: 0 }];
  commit(D, 1086 * 4 + 3, logs); D.Story.q = 1087 * 4; drain(D);
  const t0 = performance.now(), end = t0 + 4;     // a 4 ms budget: legs stop when under 3 ms is left
  const ctx = { q: 1087 * 4 + 1, year: 1087, season: 1, first: false, budget: { legs: 12, upgrades: 2 }, timeLeft: () => end - performance.now(), log: e => logs.push(e), mark() { ctx.dirty = true; } };
  D.Story.committing = true; try { D.Wayfarer.part.season(ctx); } finally { D.Story.committing = false; }
  const n1 = Array.from(R.segs.values()).filter(s => s.by === 1).length, r = D.Wayfarer.routes().find(x => !x.done);
  console.log(`    4 ms budget: ${n1} legs laid in ${(performance.now() - t0).toFixed(1)} ms`);
  assert(n1 < 12 && r && r.next < r.legs, 'deferred: ' + n1);
  commit(D, 1088 * 4 + 1, logs);
  assert(Array.from(R.segs.values()).filter(s => s.by === 1).length > n1, 'carried on next Summer');
});

test('part: a lane over a river split at a node asks works.js for one bridge with the merged wet run', () => {
  const D = fresh(), R = D.Roads, env = D._env, calls = [];
  world(D);
  env.water = (x, z) => (x > 3175 && x < 3225 ? 12 : -100);       // 50 m of water, a node mid-river
  D.Works = { requestBridge(ids, info) { calls.push([ids.slice().sort(), info.wetLen]); return 1; } };
  road(D, [3000, 3000], [3200, 3000], 'track', HIST(1080, 1));
  road(D, [3200, 3000], [3400, 3000], 'track', HIST(1080, 1));
  const ids = Array.from(R.segs.values()).filter(s => s.rt === 1).map(s => s.id);
  eq(ids.length, 2);
  for (const id of ids) assert(R.wetRuns(id)[0].len < 30, 'each half alone is under 30 m');
  D.Wayfarer.part.deserialize({ v: 1, tf: [], sustain: [['1:track', 9]], route: null, routes: [[1, 101, 102, 1080, 'track']], veto: [], nextRt: 2 });
  const logs = []; commit(D, 1090 * 4 + 1, logs);
  eq(Array.from(R.segs.values()).filter(s => s.rt === 1 && s.type === 'lane').length, 2, 'cobbled');
  eq(calls.length, 1, 'one request');
  eq(calls[0][0], ids.slice().sort());
  near(calls[0][1], 50, 5, 'merged wet length');
});

test('legsOf keeps cuts off water; a planned route reuses an existing bridge over a wide river', () => {
  const D = fresh(), legsOf = P(D).legsOf;
  const wet = x => x > 130 && x < 170;
  const legs = legsOf([0, 0, 1000, 0], { min: 40, max: 150, dry: (x, z) => !wet(x) });
  for (const l of legs) { assert(!wet(l[2]), 'cut in the water at ' + l[2]); const L = Math.hypot(l[2] - l[0], l[3] - l[1]); assert(L >= 40 - 1e-6 && L <= 150 + 1e-6, 'leg ' + L); }
  near(legs[legs.length - 1][2], 1000, 1e-9);
  // a 100 m river (too wide to bridge) with the player's bridge across it
  const R = D.Roads, env = D._env;
  world(D);
  env.water = (x, z) => (x > 12700 && x < 12800 ? 12 : -100);
  road(D, [12450, 12500], [13050, 12500], 'lane');
  assert(Array.from(R.segs.values()).some(s => s.flags.some(f => f === 1)), 'the player road bridges');
  const plan = D.Wayfarer._dev.plan(101, 102);
  assert(plan && plan.legs.length >= 10, 'planned over the bridge');
  for (let o = 0; o < plan.legs.length; o += 5) assert(!(plan.legs[o + 2] > 12700 && plan.legs[o + 2] < 12800), 'no leg ends in the river');
  eq(plan.wet, false, 'crossing on the existing bridge is not a new river crossing');
});

test('Clear Roads reports the history roads with their bounds (Town re-shows plants under them)', () => {
  const D = fresh(), R = D.Roads, got = [];
  D.History.begin = D.History.end = () => {};
  road(D, [4000, 4000], [4300, 4000], 'track');
  road(D, [4000, 4400], [4300, 4600], 'footpath', HIST(1100, 3));
  D.on('roads:removed', (bb, m) => got.push([bb, m]));
  R.clearAll();
  eq(got.length, 1);
  const [bb, m] = got[0];
  assert(bb && bb[0] <= 4000 && bb[2] >= 4300 && bb[1] <= 4400 && bb[3] >= 4600 && bb[1] > 4100, 'bb ' + bb);
  eq(m, [{ by: 1, yr: 1100, rt: 3 }]);
  R.clearAll(); eq(got.length, 1, 'nothing more without history roads');
});

test('playerProfiles: a history split is resampling noise; a re-profile is not', () => {
  const D = fresh(), R = D.Roads;
  D._env.ground = (x, z) => 10 + 4 * Math.sin(x / 90) * Math.cos(z / 70);
  road(D, [5000, 5000], [5500, 5100], 'track', { grade: true });
  const p0 = R.playerProfiles();
  road(D, [5250, 4800], [5250, 5300], 'footpath', HIST(1200, 9));
  eq(Array.from(R.segs.values()).filter(s => !s.by).length, 2, 'split');
  const d = R.playerProfileDelta(p0, R.playerProfiles());
  assert(d < 0.1, 'split delta ' + d);
  const s = Array.from(R.segs.values()).find(x => !x.by);
  s.prof = s.prof.map(v => v + 1);
  assert(R.playerProfileDelta(p0, R.playerProfiles()) > 0.9, 're-profile seen');
  s.type = 'lane';
  eq(R.playerProfileDelta(p0, R.playerProfiles()), Infinity, 'a different record set');
});

test('replay view: later segs left out of the rebuild, older types used, live network restored exactly', () => {
  const D = fresh(), R = D.Roads, env = D._env;
  R.group = { children: [], add() {} };                    // geometry goes nowhere; we watch the filter
  road(D, [14000, 14000], [14300, 14000], 'track');                        // before the chronicle
  road(D, [14000, 14300], [14300, 14300], 'footpath', HIST(1150, 1));
  const late = Array.from(R.segs.values()).find(s => s.by);
  R.upgrade(late.id, 'track', { yr: 1180 });
  env.water = (x, z) => (x > 14100 && x < 14180 ? 12 : -100);
  const br = road(D, [14000, 14600], [14300, 14600], 'lane', HIST(1200, 2)).find(s => R.wetRuns(s.id).length);
  R.setBridgeWork(br.id, { st: 1, n: 4 });
  const before = JSON.stringify(R.serialize()), order = Array.from(R.segs.keys()), nsegs = Array.from(R.nodes.values()).map(n => n.segs.slice());
  let seen = null; D.on('roads:rebuilt', () => { seen = Array.from(R.segs.values()).map(s => s.id + ':' + s.type); });
  R.setViewYear(1160); R.rebuildNow();
  eq(seen.length, 2, 'the 1200 lane is not there yet');
  assert(seen.includes(late.id + ':footpath'), 'the 1180 upgrade is not there yet: ' + seen);
  eq(JSON.stringify(R.serialize()), before, 'live network untouched');
  eq(Array.from(R.segs.keys()), order);
  eq(Array.from(R.nodes.values()).map(n => n.segs.slice()), nsegs);
  R.setViewYear(1300); R.rebuildNow(); eq(seen.length, 3);
  R.setViewYear(undefined); R.rebuildNow(); eq(seen.length, 3); eq(R.viewYear, undefined);
  eq(R.typeAt(late, 1160), 'footpath');
});

test('a Summer commit laying 12 legs (timing on the stub terrain)', () => {
  const D = fresh(), R = D.Roads, logs = [];
  world(D);
  D._env.places[1].x = 15000; D._env.places[1].bb = [14900, 11900, 15100, 12100]; D._env.gates[2] = [{ x: 14900, z: 12000, dx: -1, dz: 0 }];
  commit(D, 1086 * 4 + 3, logs); D.Story.q = 1087 * 4; drain(D);
  const t0 = performance.now(); commit(D, 1087 * 4 + 1, logs); const ms = performance.now() - t0;
  const n = Array.from(R.segs.values()).filter(s => s.by === 1).length;
  console.log(`    summer commit: ${n} history segs in ${ms.toFixed(1)} ms`);
  assert(n >= 10 && n <= 14, 'twelve legs a year: ' + n);
});
