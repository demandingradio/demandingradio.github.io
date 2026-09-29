// Director (Living History §3.9) + the town.js history hooks (§5.5). Pure logic only: no WebGL / DOM.
//   cd worldbuild && deno run -A dev/tests/run.js director
import { load, test, assert, eq, near } from './harness.js';

const FILES = ['js/core.js', 'dev/tests/director.stub.js', 'js/history.js', 'js/town.js', 'js/townx.js', 'js/director.js'];
function world() {
  const D = load(FILES);
  const reg = [];
  D.Story = { started: true, beginning: false, running: true, committing: false, catchingUp: false, Y0: 1086, q: 1150 * 4, time: () => 1150.1,
    ypm: () => 4, frameSeconds: () => 5, events: () => [], _known: new Map(), register: (n, p) => reg.push([n, p]) };
  D.Town.init({});
  D.Director.init();
  return { D, reg };
}
const origWarn = console.warn;
function quiet(fn) { console.warn = () => {}; try { return fn(); } finally { console.warn = origWarn; } }
function commit(D, fn) { D.History.begin('History test', 'story'); D.Story.committing = true; try { return fn(); } finally { D.Story.committing = false; D.History.end(); } }
function disc(N, ci, cj, r) { const out = []; for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) out.push(j * N + i); return Int32Array.from(out); }

// ---- growLobe on synthetic grids ---------------------------------------------------------------------------
function synth(seed, opts = {}) {
  const N = 64, S = new Set(disc(N, 30, 30, 5)), other = new Set(), blocked = new Set();
  for (let j = 10; j < 54; j++) other.add(j * N + 44);                    // a neighbour of the same type (a column)
  const rr = (a, b) => ((Math.sin(a * 12.9898 + b * 78.233 + seed) * 43758.5453) % 1 + 1) % 1;
  // r≠0 cells: a few clustered obstacles (ponds, other zones, a stream) like real ground, plus sparse single cells
  if (!opts.open) for (let b = 0; b < 5; b++) { const bi = 14 + Math.floor(rr(b, 1) * 36), bj = 14 + Math.floor(rr(b, 2) * 36), r = 1 + Math.floor(rr(b, 3) * 3); for (const k of disc(N, bi, bj, r)) if (!S.has(k)) blocked.add(k); }
  if (!opts.open) for (let j = 0; j < N; j++) blocked.add(j * N + Math.round(12 + 4 * Math.sin(j / 6 + seed)));
  if (!opts.open) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (rr(i, j) < 0.01 && !S.has(j * N + i)) blocked.add(j * N + i);
  const gapOK = k => { const i = k % N, j = (k / N) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (other.has((j + dj) * N + i + di)) return false; return true; };
  const canClaim = k => k >= 0 && k < N * N && !S.has(k) && !blocked.has(k) && !other.has(k) && gapOK(k);
  return { N, S, other, blocked, gapOK, env: { N, cells: Int32Array.from(S), inS: k => S.has(k), canClaim, score: k => 1 + 0.3 * Math.sin((k % N) / 5) + 0.2 * Math.cos(((k / N) | 0) / 7),
    roadAdj: k => ((k % N) === 20 ? 1 : 0), ox: 30.5, oz: 30.5, pull: opts.pull || null, rng: null, near: !!opts.near } };
}
// perimeter in cell edges; `skip` = edges shared with the parent settlement are not exposed boundary
function perim(cells, N, skip) { const s = new Set(cells); let p = 0; for (const k of cells) for (const q of [k - 1, k + 1, k - N, k + N]) if (!s.has(q) && !(skip && skip.has(q))) p++; return p; }

test('growLobe: only claimable cells, gap rule, no tendrils, deterministic (obstructed ground)', () => {
  const { D } = world(), gl = D.Director._pure.growLobe;
  for (let seed = 1; seed <= 12; seed++) {
    for (const target of [60, 120, 200]) {
      const s = synth(seed), N = s.N;
      s.env.rng = D.rng(seed * 101 + target);
      const a = gl(s.env, target);
      assert(a && a.length >= 12, 'lobe made');
      assert(a.length <= target, 'no more than the target');
      const L = new Set(a);
      for (const k of a) {
        assert(!s.S.has(k), 'never inside S'); assert(!s.blocked.has(k), 'never on r≠0'); assert(s.gapOK(k), 'gap to the other settlement');
        let n4 = 0; for (const q of [k - 1, k + 1, k - N, k + N]) if (L.has(q) || s.S.has(q)) n4++;
        assert(n4 >= 2, 'no 1-wide tendril tips');
      }
      s.env.rng = D.rng(seed * 101 + target);
      eq(Array.from(gl(s.env, target)), Array.from(a), 'same RNG → same lobe');
    }
  }
});

test('growLobe: compact on open ground (exposed perimeter²/area < 30)', () => {
  const { D } = world(), gl = D.Director._pure.growLobe;
  for (let seed = 1; seed <= 12; seed++) for (const target of [60, 120, 200]) {
    const s = synth(seed, { open: true }); s.env.rng = D.rng(seed * 7 + target);
    const a = gl(s.env, target), pe = perim(a, s.N, s.S), pf = perim(a, s.N);
    assert(pe * pe / a.length < 30, `compact: exposed ${(pe * pe / a.length).toFixed(1)} (seed ${seed}, target ${target})`);
    assert(pf * pf / a.length < 40, `compact: full ${(pf * pf / a.length).toFixed(1)} (seed ${seed}, target ${target})`);
  }
});

test('growLobe: touches S, honours the wayfarer pull, closeLobe mode hugs the core', () => {
  const { D } = world(), gl = D.Director._pure.growLobe;
  const s = synth(3, { pull: [-1, 0] }); s.env.rng = D.rng(5);
  const a = gl(s.env, 80), N = s.N;
  let touch = false; for (const k of a) { const i = k % N, j = (k / N) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (s.S.has((j + dj) * N + i + di)) touch = true; }
  assert(touch, 'the lobe is adjacent to the settlement');
  const meanX = pull => { let wx = 0, n = 0; for (let q = 0; q < 40; q++) { const t = synth(q, { pull }); t.env.rng = D.rng(q); const b = gl(t.env, 80); if (!b) continue; for (const k of b) wx += (k % N) - 30.5; n += b.length; } return wx / n; };
  assert(meanX([-1, 0]) < meanX([1, 0]) - 2, 'a westward pull makes lobes spill further west than an eastward one');
  const c = synth(4, { near: true }); c.env.rng = D.rng(1);
  const z = gl(c.env, 45);
  assert(z && z.length >= 27, 'closeLobe-style lobe');
  let md = 0; for (const k of z) md = Math.max(md, Math.hypot(k % N - 30.5, ((k / N) | 0) - 30.5));
  assert(md < 16, 'stays beside the core');
});

test('pruneSpurs removes 1-wide tendrils', () => {
  const { D } = world(), N = 32;
  const lobe = new Set(disc(N, 10, 10, 3));
  for (let i = 14; i < 20; i++) lobe.add(10 * N + i);                     // a tendril
  D.Director._pure.pruneSpurs(lobe, 2, () => false, N);
  assert(!lobe.has(10 * N + 19) && !lobe.has(10 * N + 18), 'tendril tip pruned');
  assert(lobe.has(10 * N + 10), 'body kept');
});

test('scoreSite rejects wet / steep / forest and rewards water and roads', () => {
  const { D } = world(), sc = D.Director._pure.scoreSite;
  const base = { slope: 0.02, wet: 0, forest: 0, dWater: 100, dRoad: 100, rel: -5, coast: 0 };
  assert(sc('village', Object.assign({}, base, { wet: 1 })) === -Infinity);
  assert(sc('village', Object.assign({}, base, { slope: 0.25 })) === -Infinity);
  assert(sc('village', Object.assign({}, base, { forest: 0.8 })) === -Infinity);
  assert(sc('village', base) > sc('village', Object.assign({}, base, { dWater: 2000, dRoad: 3000 })));
  assert(sc('castle', Object.assign({}, base, { rel: 40 }), { nearRich: 0 }) === -Infinity, 'castles need a rich town');
  assert(sc('castle', Object.assign({}, base, { rel: 40 }), { nearRich: 1 }) > sc('castle', base, { nearRich: 1 }), 'castles like heights');
  assert(sc('monastery', base, { quiet: -1 }) === -Infinity, 'monasteries keep away from towns');
  assert(sc('harbour', Object.assign({}, base, { coast: 0.8 }), { nearTown: 1 }) > 1.5);
  assert(sc('farm', base, { ring: 0 }) === -Infinity && sc('farm', base, { ring: 1 }) > 1.5);
});

test('poisson mean ≈ λ', () => {
  const { D } = world(), r = D.rng(9); let s = 0; const n = 4000;
  for (let i = 0; i < n; i++) s += D.Director._pure.poisson(1.3, r);
  near(s / n, 1.3, 0.08);
});

// ---- town.js hooks ---------------------------------------------------------------------------------------------
test('element keys stay unique across 300 expands (epochs cap at 254)', () => {
  const { D } = world(), jp = D.Town._pure.jobPrefix;
  const seen = new Set(); let epochs = 1, job = 1;
  for (let x = 0; x < 300; x++) {
    epochs = Math.min(254, epochs + 1);
    const pre = jp(42, { kind: 'expand', epoch: epochs, jobId: job++ });
    for (const e of ['L0.0', 'P0', 'P1', 'S0', 'A0']) { const k = pre + e; assert(!seen.has(k), 'duplicate key ' + k); seen.add(k); }
  }
  const w = jp(42, { kind: 'work', jobId: 9 }); assert(w === '42:w9:', 'work prefix'); assert(jp(42, { kind: 'found', jobId: 1 }) === '42:', 'found prefix unchanged');
});

test('itemYear is monotone in o and spreads over ≤ 2 years', () => {
  const { D } = world(), iy = D.Town._pure.itemYearOf;
  const ey = [0, 1100, 1101.2, 1140];
  let prev = -1;
  for (let o = 10; o <= 50; o += 0.5) { const y = iy(ey, 1100, 1, o, [10, 50]); assert(y >= prev, 'monotone'); assert(y >= 1100 && y <= 1101.2 + 1e-9, 'within the epoch'); prev = y; }
  prev = -1;
  for (let o = 0; o <= 100; o++) { const y = iy(ey, 1100, 3, o, [0, 100]); assert(y >= prev && y <= 1142 + 1e-9, 'last epoch spread ≤ 2 y'); prev = y; }
  eq(iy([], 0, 1, 5, null), 0, 'unknown year');
  eq(iy([], 1090, 1, 5, null), 1090, 'falls back to fy');
  eq(iy(ey, 1100, 255, 5, [0, 9]), 1100, 'transient alpha → fy');
});

test('500 unique names (Great/Little/Market/Kings before numbering; saints for monasteries)', () => {
  const { D } = world(), mk = D.Town._pure.makeName, L = D.Town.list;
  const names = new Set(); let saints = 0;
  for (let i = 0; i < 500; i++) {
    const type = [1, 1, 2, 4, 5, 3][i % 6], n = mk(type, new Int32Array([i]), 'none', 1000 + i * 7, 0);
    assert(!/^Settlement /.test(n), 'no numbering fallback: ' + n);
    assert(!names.has(n), 'duplicate name ' + n);
    names.add(n); if (/^St .*'s (Priory|Abbey)$/.test(n)) saints++;
    L.set(1000 + i, { id: 1000 + i, name: n });                                // later names must avoid it
  }
  assert(saints > 20, 'some monasteries are named for saints');
  L.clear();
});

test('canClaim: free, dry, gentle, gap to same-type settlements, not under manual buildings', () => {
  const { D } = world(), H = D.Town.hist, Z = D.W.zone, N = D.N;
  const at = (i, j) => j * N + i;
  // a settlement (slot 1, type 1) occupying cells (100..104, 100..104)
  D.Town.list.set(1, { id: 1, uid: 1, type: 1, name: 'A', tw: { dens: .5, wealth: .45, walls: 'none' }, epochs: 1, razed: [], plan: null, pending: null });
  for (let j = 100; j <= 104; j++) for (let i = 100; i <= 104; i++) { Z[at(i, j) * 4] = 1; Z[at(i, j) * 4 + 1] = 1; Z[at(i, j) * 4 + 3] = 1; }
  assert(!H.canClaim(at(102, 102), 1, 0), 'occupied');
  assert(!H.canClaim(at(105, 102), 1, 0), 'gap rule: a new village may not touch it');
  assert(H.canClaim(at(105, 102), 1, 1), 'the settlement itself may grow there');
  assert(H.canClaim(at(105, 102), 2, 0), 'another type may abut');
  assert(H.canClaim(at(106, 102), 1, 0), 'one cell of gap is enough');
  D._stub.water = (x, z) => (x > 200 * 16 && x < 210 * 16 ? 50 : -1e9);
  assert(!H.canClaim(at(205, 102), 2, 0), 'wet');
  D._stub.h = (x, z) => (x > 300 * 16 ? x * 0.5 : 10);
  assert(!H.canClaim(at(310, 102), 2, 0), 'steep');
  D._stub.h = () => 10; D._stub.water = () => -1e9;
  // a player's manual building on cell (150,150)
  assert(H.canClaim(at(150, 150), 2, 0), 'free before the building');
  D.Town.pasteList([{ kind: 'cottage', x: 0, z: 0, rot: 0.3, w: 8, d: 6 }], () => [150.5 * 16, 150.5 * 16], 0);
  assert(!H.canClaim(at(150, 150), 2, 0), 'never under a manual building');
  assert(H.canClaim(at(160, 150), 2, 0), 'far from it: free');
});

test('hist mutators refuse outside a commit (I1); found/extend/undo inside one', () => {
  const { D } = world(), H = D.Town.hist, Z = D.W.zone, N = D.N;
  const cells = disc(N, 300, 300, 6);
  eq(quiet(() => H.found(1, cells, {})), 0, 'no commit → refused');
  eq(Z[cells[0] * 4], 0, 'nothing written');
  const sid = commit(D, () => H.found(1, cells, { tw: { dens: 0.4, wealth: 0.35 }, pin: [300 * 16, 300 * 16] }));
  assert(sid > 0, 'founded');
  const S = D.Town.list.get(sid);
  eq([S.by, S.fy, Math.round(S.ey[1]), S.grow, S.pending.kind, S.pending.src], ['h', 1150, 1150, true, 'found', 'dir']);
  for (const k of cells) { assert(Z[k * 4] === 1 && Z[k * 4 + 1] === sid && Z[k * 4 + 3] === 1, 'zone written'); }
  assert(D.History.entries.length === 1, 'one history entry');
  // a planned settlement expands: epoch 2, pending expand from the director; a second extend keeps epoch 2
  S.plan = { v: 1, uid: S.uid, type: 1, style: {}, origin: { x: 4800, z: 4800, kind: 'none' }, lanes: [], plots: [], specials: [], areas: [], wallO: -1, n: 0 }; S.pending = null;
  const ring1 = Int32Array.from(Array.from(disc(N, 300, 300, 8)).filter(k => !cells.includes(k)));
  const n1 = commit(D, () => H.extend(sid, ring1, {}));
  assert(n1 > 20, 'extended');
  eq([S.epochs, S.pending.kind, S.pending.epoch, S.pending.src], [2, 'expand', 2, 'dir']);
  const ring2 = Int32Array.from(Array.from(disc(N, 300, 300, 10)).filter(k => Z[k * 4 + 1] === 0));
  commit(D, () => H.extend(sid, ring2, { rewall: true }));
  eq([S.epochs, S.pending.kind, S.pending.epoch, S.pending.rewall], [3, 'expand', 2, 1], 'pending expand keeps its older epoch');
  assert(Math.round(S.ey[3]) === 1150, 'epoch year stamped');
  // setTweakQuiet: refused when the player locked it
  S.plock = { walls: 1 };
  eq(commit(D, () => H.setTweakQuiet(sid, 'walls', 'stone')), false, 'plock');
  eq(commit(D, () => H.setTweakQuiet(sid, 'wealth', 0.5)), true, 'wealth tweak');
  // undo everything back to before the founding
  while (D.History.pos > 0) D.History.undo();
  assert(!D.Town.list.has(sid), 'undo removes the record');
  for (const k of disc(N, 300, 300, 10)) assert(Z[k * 4 + 1] === 0 && Z[k * 4] === 0, 'undo clears the zone');
  D.History.redo();
  assert(D.Town.list.get(sid) && D.Town.list.get(sid).by === 'h', 'redo restores it');
});

test('record fields survive serialize/deserialize; old saves get defaults', () => {
  const { D } = world(), H = D.Town.hist;
  const sid = commit(D, () => H.found(1, disc(D.N, 500, 500, 6), {}));
  const S = D.Town.list.get(sid);
  S.plan = { v: 1, pv: 4, uid: S.uid, type: 1, style: {}, origin: { x: 8000, z: 8000, kind: 'none' }, lanes: [], plots: [], specials: [], areas: [], wallO: -1, n: 0 }; S.pending = null;
  S.plock = { wealth: 1 }; S.grow = false; S.ey = [0, 1150.25, 1160];
  const ser = JSON.parse(JSON.stringify(D.Town.serialize()));
  D.Town.deserialize(ser);
  const T = D.Town.list.get(sid);
  eq([T.by, T.fy, T.ey, T.grow, T.plock], ['h', 1150, [0, 1150.25, 1160], false, { wealth: 1 }]);
  const old = JSON.parse(JSON.stringify(ser)); for (const s of old.settlements) { delete s.by; delete s.fy; delete s.ey; delete s.grow; delete s.plock; }
  D.Town.deserialize(old);
  const U = D.Town.list.get(sid);
  eq([U.by, U.fy, U.ey, U.grow, U.plock], ['p', 0, [], true, {}], 'defaults for a v44 save');
});

test('nextPending: expands keep the older epoch; a queued great work rides along', () => {
  const { D } = world(), np = D.Town._pure.nextPending;
  const S = { epochs: 5, pending: { kind: 'expand', epoch: 3, jobId: 1 } };
  eq(np(S, 'expand').epoch, 3);
  const W = { epochs: 6, pending: { kind: 'work', epoch: 6, jobId: 2, work: 'cathedral', wid: 9, cellsEp: 6 } };
  const p = np(W, 'expand'); eq([p.kind, p.epoch, p.work, p.wid, p.cellsEp], ['expand', 6, 'cathedral', 9, 6]);
  eq(np({ epochs: 4, pending: null }, 'replan').epoch, 4);
});

test('stampPrehistory dates the pre-chronicle places 946–1066, epochs up to 1084', () => {
  const { D } = world(), H = D.Town.hist;
  const a = commit(D, () => H.found(1, disc(D.N, 200, 600, 6), {}));
  const S = D.Town.list.get(a); S.epochs = 4; S.by = 'p'; S.fy = 0; S.ey = [];   // as if painted before ▶ (no year yet)
  const n = commit(D, () => H.stampPrehistory(1086));
  eq(n, 1);
  assert(S.fy >= 946 && S.fy <= 1066, 'founded ' + S.fy);
  eq(S.ey.length, 5); eq(S.ey[1], S.fy); near(S.ey[4], 1084, 1e-9);
  assert(S.ey[2] > S.ey[1] && S.ey[3] > S.ey[2], 'evenly spaced');
  eq(S.by, 'p', 'still the player’s');
  eq(commit(D, () => H.stampPrehistory(1086)), 0, 'idempotent');
});

// ---- the director as a story part ---------------------------------------------------------------------------------
function ctxFor(D, q, logs) {
  let marks = 0;
  return { q, year: q >> 2, season: q & 3, yf: q / 4, first: false, catchUp: false, branch: 0, rng: salt => D.rng(D.hash32(D.W.seed, q, 0, salt)),
    timeLeft: () => 12, log: e => logs.push(e), mark: () => { marks++; }, get marks() { return marks; }, budget: { found: 1, extend: 2, tweak: 1, legs: 12, upgrades: 2, realm: 1 } };
}
test('registers as the order-10 story part; serialize/snap round-trip', () => {
  const { D, reg } = world();
  eq(reg.length, 1); eq(reg[0][0], 'director'); eq(reg[0][1].order, 10);
  const part = reg[0][1];
  part.deserialize({ v: 1, lastGrow: [[3, 1140]], mine: [3, 4], minePos: [[3, 100, 200]], veto: [[1, 2, 800, 1190]], agenda: [[1, 'extend', 2, 3, '', 0]], agendaY: 1150, sat0: 12, quiet: 2, rewall: [[3, 1100]] });
  const s = part.serialize();
  eq(s, JSON.parse(JSON.stringify(s)), 'JSON only');
  eq([s.lastGrow, s.mine, s.minePos, s.veto, s.agenda, s.agendaY, s.sat0, s.quiet, s.rewall],
    [[[3, 1140]], [3, 4], [[3, 100, 200]], [[1, 2, 800, 1190]], [[1, 'extend', 2, 3, '', 0]], 1150, 12, 2, [[3, 1100]]]);
  const snap = part.snap(); part.deserialize(null); eq(part.serialize().mine, []);
  part.restore(snap); eq(part.serialize().mine, [3, 4], 'restore from snapshot');
  snap.mine.push(99); eq(part.serialize().mine, [3, 4], 'snapshots are not aliased');
});

test('a season extends a full place as a compact lobe through Town.hist.extend', () => {
  const { D, reg } = world(), H = D.Town.hist, part = reg[0][1], Z = D.W.zone, N = D.N;
  const cells = disc(N, 400, 400, 7);
  const sid = commit(D, () => H.found(1, cells, {}));
  const S = D.Town.list.get(sid);
  S.plan = { v: 1, pv: 4, uid: S.uid, type: 1, style: {}, origin: { x: 400.5 * 16, z: 400.5 * 16, kind: 'none' }, lanes: [], plots: [], specials: [], areas: [], wallO: -1, n: 0 }; S.pending = null;
  const q = 1150 * 4 + 1, logs = [];
  part.deserialize({ v: 1, agendaY: 1150, agenda: [] });
  D.Story.q = q - 1;
  D.Director._dev.wish('extend', sid);
  const ctx = ctxFor(D, q, logs);
  commit(D, () => part.season(ctx));
  assert(S.epochs === 2 && S.pending && S.pending.src === 'dir', 'extended by the director');
  let grown = 0; for (let k = 0; k < N * N; k++) if (Z[k * 4 + 1] === sid && Z[k * 4 + 3] === 2) grown++;
  assert(grown >= 60 && grown <= 200, 'lobe of 60–200 cells: ' + grown);
  assert(logs.some(e => e.k === 'grow' && e.uid === S.uid && /spreads|New houses/.test(e.txt)), 'logged');
  assert(ctx.marks > 0, 'marked the world mutation');
  const st = D.Director._dev.state(); eq(st.lastGrow[S.uid], 1150, 'cooldown recorded');
});

test('the scan finds a lakeside village site; a season founds it (by history, logged, known)', () => {
  const { D, reg } = world(), H = D.Town.hist, part = reg[0][1], N = D.N;
  D._stub.water = (x, z) => (x < 3050 ? 20 : -1e9);                       // a lake on the west side
  const home = disc(N, 330, 500, 7);                                        // an existing village ~5.3 km east
  const sid = commit(D, () => H.found(1, home, {}));
  const S = D.Town.list.get(sid);
  S.plan = { v: 1, pv: 4, uid: S.uid, type: 1, style: {}, origin: { x: 330.5 * 16, z: 500.5 * 16, kind: 'none' }, lanes: [], plots: [], specials: [], areas: [], wallO: -1, n: 0 }; S.pending = null;
  // drive the site grid and the scan to completion
  for (let i = 0; i < 20000 && !(D.Director._dev.scan.res && D.Director._dev.grid.ready && !part.busy()); i++) { D.Story.q = 1150 * 4 + 3; part.update(0.016); }
  const res = D.Director._dev.scan.res;
  assert(res && res.count > 0, 'candidates found');
  const v = res.best.village;
  assert(v && v.length, 'a village site');
  assert(v[0].x > 3050 && v[0].x < 3600, 'by the lake shore: ' + v[0].x);
  assert(Math.hypot(v[0].x - 330.5 * 16, v[0].z - 500.5 * 16) >= 1400, 'spaced from the existing village');
  const logs = [], q = 1151 * 4;
  // Spring planning is the only reader of the scan: it snapshots sat and the found wishes (with their sites)
  const T = D.TUNE && D.TUNE.director; assert(T, 'D.TUNE.director merged');
  const acts0 = T.acts, hb0 = T.heartbeat; T.acts = 0; T.heartbeat = 1e9;       // plan an empty year
  part.deserialize({ v: 1, agendaY: 1150, agenda: [] }); D.Director._dev.scan.res = res;   // (a load drops the scan)
  try { commit(D, () => part.season(ctxFor(D, q, []))); } finally { T.acts = acts0; T.heartbeat = hb0; }
  const stS = D.Director._dev.state();
  eq(stS.agendaY, 1151); assert(stS.satY > 0, 'sat snapshotted: ' + stS.satY); eq(stS.sat0, res.count, 'sat0 re-baselined at planning');
  const fv = stS.fw.find(f => f[0] === 'found' && f[1] === 'village');
  assert(fv && fv[3].length && fv[3][0][0] === v[0].x && fv[3][0][1] === v[0].z, 'village wish carries its best site: ' + JSON.stringify(fv));
  // not busy again this year (only a planning commit waits for the scan)
  D.Story.q = q; assert(!part.busy(), 'Summer does not wait for the scan');
  // a Summer act founds at the snapshotted site even with the scan gone / mid-rescan
  const sv = part.serialize(); sv.agenda = [[1, 'found', 0, 0, 'village', 0, fv[3]]];
  part.deserialize(JSON.parse(JSON.stringify(sv)));
  D.Director._dev.scan.res = null;
  const ctx = ctxFor(D, q + 1, logs);
  commit(D, () => part.season(ctx));
  const e = H.list().find(x => x.by === 'h' && x.sid !== sid);
  assert(e, 'a new place, founded by history');
  assert(logs.some(l => l.k === 'found' && l.uid === e.uid && /is founded (by the river|in open country|on the road|in a quiet valley|on the coast|at the crossroads|on (a|the) hill)/.test(l.txt) && l.imp === 2), 'founding logged: ' + JSON.stringify(logs));
  assert(D.Story._known.has(e.uid), 'the chronicle diff table knows it (no double log)');
  eq(D.Director._dev.state().mine, [e.uid]);
  // the founding changed the world: the next planning commit (Spring) waits for a rescan; the scan key is cheap
  D.Story.q = q + 3; assert(part.busy(), 'Spring waits for a fresh scan after a zone change');
  // demolished by the player → a veto disc at the next commit
  commit(D, () => { D.History.touchChunk('town', e.sid); D.Town.list.delete(e.sid); });
  const ctx2 = ctxFor(D, q + 2, []);
  commit(D, () => part.season(ctx2));
  const st2 = D.Director._dev.state();
  eq(st2.mine, []); eq(st2.veto.length, 1); eq(st2.veto[0][3], 1151 + 40);
});

// ---- the real planner: keys, phase anchors, great-work job, replan survival, player buildings --------------------
const TW = { dens: 0.6, wealth: 0.55, walls: 'none', layout: 0.2, squares: 0.4, greens: 0.5, gardens: 0.6 };
function plan(D, S, job) { return D.Town._debug.planJob(S, Object.assign({}, job)).plan; }
function village(D, ci, cj, r) {                  // a planned village made through the real (history) path
  const H = D.Town.hist, sid = commit(D, () => H.found(1, disc(D.N, ci, cj, r), { tw: TW }));
  const S = D.Town.list.get(sid); S.plan = plan(D, S, S.pending); S.pending = null; S.by = 'p';
  return S;
}
test('planner: expand keys unique, phase anchors, frozen walls for director expands', () => {
  const { D } = world(), N = D.N, H = D.Town.hist;
  const S = village(D, 512, 512, 12), P1 = S.plan;
  assert(P1.plots.length > 20, 'a village was planned: ' + P1.plots.length);
  assert(P1.plots.every(p => p.nE === P1.n), 'new elements anchor to their plan size');
  P1.wallO = 5;
  const ring = Int32Array.from(Array.from(disc(N, 512, 530, 12)).filter(k => D.W.zone[k * 4 + 1] === 0));
  assert(commit(D, () => H.extend(S.id, ring, {})) > 50, 'claimed');
  S.tw = Object.assign({}, S.tw, { walls: 'palisade' });        // only an existing wall is frozen
  const P2 = plan(D, S, S.pending);
  const keys = new Set(); for (const a of [P2.lanes, P2.plots, P2.specials, P2.areas]) for (const e of a) { assert(!keys.has(e.key), 'unique key ' + e.key); keys.add(e.key); }
  assert(P2.plots.some(p => p.key.startsWith(S.uid + ':x2.' + S.pending.jobId + ':')), 'expand prefix carries the job id');
  assert(P2.plots.length > P1.plots.length, 'houses on the new land');
  for (const p of P2.plots) { if (p.o < P1.n) assert(p.nE === P1.n, 'old element keeps prev.n'); else assert(p.nE === P2.n, 'new element anchored to P2.n'); }
  eq(P2.wallO, 5, 'director expand keeps the wall threshold');
  const P2b = plan(D, S, Object.assign({}, S.pending, { src: undefined }));
  assert(P2b.wallO !== 5, 'a player expand moves it');
  S.tw = Object.assign({}, S.tw, { walls: 'none' });
  assert(plan(D, S, S.pending).wallO !== 5, 'an unwalled place keeps planning its wall order on director expands');
  S.tw = Object.assign({}, S.tw, { walls: 'palisade' }); P1.wallO = -1;
  assert(plan(D, S, S.pending).wallO >= 0, 'a plan that had no wall order (too small) gets one on a director expand');
  S.tw = Object.assign({}, S.tw, { walls: 'none' });
  // the director cannot raise a wall that would not be drawn (plan without a wall order)
  const savedP = S.plan, savedPend = S.pending; S.pending = null;
  S.plan = Object.assign({}, P1, { wallO: -1 });
  eq(commit(D, () => H.setTweakQuiet(S.id, 'walls', 'palisade')), false, 'no wall order: refused');
  assert(H.list().find(e => e.sid === S.id).wallable === false, 'list reports wallable false');
  S.plan = Object.assign({}, P1, { wallO: 5 });
  eq(commit(D, () => H.setTweakQuiet(S.id, 'walls', 'palisade')), true, 'with a wall order: raised');
  S.tw = Object.assign({}, S.tw, { walls: 'none' }); S.plan = savedP; S.pending = savedPend; P1.wallO = 5;
  // decorate: an old house's phase order does not move when the plan grows
  const d1 = D.Town._debug.decorate(Object.assign({}, S, { plan: P1 })), d2 = D.Town._debug.decorate(Object.assign({}, S, { plan: P2 }));
  let same = 0; d1.items.forEach(it => { if (it.endO === undefined) return; const o = d2.byKey.get(it.key); assert(o && o.endO === it.endO, 'phase anchor moved for ' + it.key); same++; });
  assert(same > 0, 'some phased houses/churches were checked');
  eq(d2.byKey.size, d2.items.length, 'decorated keys unique');
});
test('planner: a great-work job reserves a cathedral footprint; a replan keeps it (same key); decorate tags gw', () => {
  const { D } = world(), N = D.N, H = D.Town.hist;
  const S = village(D, 300, 700, 16);
  const lobe = Int32Array.from(Array.from(disc(N, 300, 723, 7)).filter(k => D.W.zone[k * 4 + 1] === 0));
  const job = commit(D, () => H.requestWork(S.id, { work: 'cathedral', wid: 5, cells: lobe }));
  assert(job > 0 && S.pending.kind === 'work' && S.pending.cellsEp === 2, 'work requested, cells claimed');
  eq(H.workSite(S.uid, 5), null, 'pending while it is planned');
  const W = plan(D, S, S.pending);
  const gw = W.specials.find(s => s.kind === 'greatwork');
  assert(gw, 'great work placed ' + JSON.stringify(W.extra || null));
  eq([gw.key, gw.extra.wid, gw.extra.work, gw.o], [S.uid + ':w' + job + ':S0', 5, 'cathedral', S.plan.n]);
  assert(gw.w >= 26 && gw.d >= 60, 'a real cathedral footprint');
  eq(W.plots.length, S.plan.plots.length, 'nothing removed');
  for (const p of W.plots) { const c = Math.cos(gw.rot), s = Math.sin(gw.rot), dx = p.x - gw.x, dz = p.z - gw.z, lx = dx * c - dz * s, lz = dx * s + dz * c; assert(!(Math.abs(lx) < gw.w / 2 && Math.abs(lz) < gw.d / 2), 'no house inside the cathedral'); }
  S.plan = W; S.pending = null;
  const it = D.Town._debug.decorate(S).byKey.get(gw.key);
  assert(it && it.rec.gw === 5 && it.rec.kind === 'cathedral', 'decorated as a cathedral with rec.gw');
  eq(H.workSite(S.uid, 5).key, gw.key, 'workSite finds it');
  eq(H.workSite(S.uid, 6), false, 'unknown work: false');
  const R = plan(D, S, { kind: 'replan', jobId: 999, epoch: S.epochs });
  const kept = R.specials.find(s => s.kind === 'greatwork');
  assert(kept && kept.key === gw.key && kept.x === gw.x && kept.z === gw.z, 'replan keeps the work (same key and footprint)');
  // a work carried onto a player replan (nextPending) still gets its own w-prefixed key; a later reroll keeps it once
  const C = plan(D, S, { kind: 'replan', jobId: 1234, epoch: S.epochs, work: 'cathedral', wid: 9 });
  const g9 = C.specials.find(s => s.kind === 'greatwork' && s.extra.wid === 9);
  assert(g9 && g9.key === S.uid + ':w1234:S0', 'carried work keyed by its job: ' + (g9 && g9.key));
  S.plan = C;
  const R2 = plan(D, S, { kind: 'replan', jobId: 1235, epoch: S.epochs });
  const k9 = R2.specials.filter(s => s.kind === 'greatwork' && s.extra.wid === 9), k5 = R2.specials.filter(s => s.kind === 'greatwork' && s.extra.wid === 5);
  assert(k9.length === 1 && k9[0].key === g9.key && k5.length === 1 && k5[0].key === gw.key, 'both works survive a reroll, once each, same keys');
  const ks = new Set(); for (const a of [R2.lanes, R2.plots, R2.specials, R2.areas]) for (const e of a) { assert(!ks.has(e.key), 'dup key ' + e.key); ks.add(e.key); }
  S.plan = W;
  // a failed siting: no room at all → the plan comes back unchanged with extra.workFail
  const tiny = village(D, 700, 200, 5);
  const j2 = commit(D, () => H.requestWork(tiny.id, { work: 'cathedral', wid: 7, cells: null }));
  const F = plan(D, tiny, tiny.pending);
  assert(!F.specials.some(s => s.kind === 'greatwork') && F.extra && F.extra.workFail === 7 && F.plots.length === tiny.plan.plots.length, 'workFail ' + j2);
  tiny.plan = F; tiny.pending = null;
  eq(H.workSite(tiny.uid, 7), false, 'failed');
});
test('planner: never builds over a manual building', () => {
  const { D } = world();
  const S = village(D, 600, 300, 14), P0 = S.plan;
  const spots = P0.plots.filter((p, i) => i % 4 === 0).slice(0, 10);
  D.Town.pasteList(spots.map((p, i) => ({ kind: 'cottage', x: i, z: 0, rot: p.rot, w: 9, d: 7 })), (x) => [spots[x].x, spots[x].z], 0);
  const man = []; D.Town.forManual(0, 0, D.SIZE, D.SIZE, b => { man.push(b); });
  eq(man.length, spots.length, 'manual buildings placed');
  const P = plan(D, S, { kind: 'replan', jobId: 50, epoch: S.epochs });
  const hit = (a, b) => { const c = Math.cos(a.rot), s = Math.sin(a.rot); for (const [lx, lz] of [[0, 0], [-a.w / 2, -a.d / 2], [a.w / 2, -a.d / 2], [a.w / 2, a.d / 2], [-a.w / 2, a.d / 2]]) { const x = a.x + lx * c + lz * s, z = a.z - lx * s + lz * c, dx = x - b.x, dz = z - b.z, c2 = Math.cos(b.rot), s2 = Math.sin(b.rot); if (Math.abs(dx * c2 - dz * s2) < b.w / 2 && Math.abs(dx * s2 + dz * c2) < b.d / 2) return true; } return false; };
  for (const p of P.plots) for (const b of man) assert(!hit(p, b) && !hit(b, p), 'plot ' + p.key + ' overlaps a manual building');
  for (const sp of P.specials) if (sp.w > 0) for (const b of man) assert(!hit(sp, b) && !hit(b, sp), 'special ' + sp.kind + ' overlaps a manual building');
  // and the decorated OLD plan hides the houses the player built over (visibleItem → manualSuppressed)
  eq(D.Town._dev.manualOverlaps(), [], 'nothing shown over them');
  // undo / redo of a player building (cityStore.loadChunk) re-filters the settlement under it
  const Hi = D.History, p1 = P0.plots[P0.plots.length - 1];
  Hi.begin('Paste', 'paste'); D.Town.pasteList([{ kind: 'cottage', x: 0, z: 0, rot: 0, w: 9, d: 7 }], () => [p1.x, p1.z], 0); Hi.end();
  const NR = D.Town._debug.needRefilter; NR.clear();
  assert(Hi.undo(), 'undone'); assert(NR.has(S.id), 'undo re-filters the village');
  NR.clear(); assert(Hi.redo(), 'redone'); assert(NR.has(S.id), 'redo re-filters the village');
});

// ---- audit fixes: manualCount (I2 guard) + history roads never replan a player village (E5) -----------------
test('Town.manualCount counts only sid-less (player) records', () => {
  const { D } = world();
  eq(D.Town.manualCount(), 0, 'empty world');
  D.Town.pasteList([{ kind: 'cottage', x: 0, z: 0, rot: 0, w: 8, d: 6 }, { kind: 'cottage', x: 1, z: 0, rot: 0, w: 8, d: 6 }], x => [(150.5 + x * 3) * 16, 150.5 * 16], 0);
  eq(D.Town.manualCount(), 2, 'two pasted');
  village(D, 400, 400, 10);                        // settlement records carry a sid and are not counted
  eq(D.Town.manualCount(), 2, 'settlement records ignored');
});
test('roads:changed infill: a history seg skips player villages, still infills director places', () => {
  const { D } = world();
  const S = village(D, 512, 512, 12), cx = 512.5 * 16;
  D.Roads = { segSamples: () => { const n = 21, x = new Float32Array(n), z = new Float32Array(n); for (let q = 0; q < n; q++) { x[q] = cx - 150 + q * 15; z[q] = cx; } return { n, x, z }; } };
  const fire = by => { D.History.begin('Road', 'roads'); try { D.emit('roads:changed', [{ id: 900 + by, by }]); } finally { D.History.end(); } };
  quiet(() => fire(1));
  assert(!S.pending, 'history road does not replan a player village');
  quiet(() => fire(0));
  assert(S.pending && S.pending.kind === 'infill', 'a player road still infills it');
  S.pending = null; S.by = 'h';
  quiet(() => fire(1));
  assert(S.pending && S.pending.kind === 'infill', 'a history road infills a director-founded place');
});
