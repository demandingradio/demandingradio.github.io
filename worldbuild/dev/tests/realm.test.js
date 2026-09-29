// Realm ("The Patchwork", spec §3.11 / §6E verification): survey determinism and river-following shires,
// a 400-year transfer simulation (exclaves, street cuts, caps, determinism), RLE round-trip, colouring guarantee,
// tripoint finder, exact disp() past reconstruction, snap/restore and serialize round-trips.
import { load, test, assert, eq } from './harness.js';

const D = load(['js/core.js', 'js/realm.js']);
const P = D.Realm._pure;
const N = D.N, VN = N + 1, CELL = 16, SIZE = N * CELL;

// ---- a synthetic world: sea in the west, rolling hills, a meandering river valley down the middle -------------
const riverX = z => 8600 + 520 * Math.sin(z / 1900);
function makeWorld() {
  const h = new Float32Array(VN * VN);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = i * CELL, z = j * CELL;
    let y = 34 + 22 * Math.sin(x / 1700) * Math.cos(z / 2300) + 12 * Math.sin((x + z) / 900) + 8 * Math.cos(z / 610 - x / 1300);
    const d = Math.abs(x - riverX(z)); y -= 14 * Math.exp(-((d / 320) ** 2));
    if (x < 1400) y = Math.min(y, -8 + (x - 1400) * 0.02 + 6 * Math.sin(z / 700));
    h[j * VN + i] = y;
  }
  const hV = (i, j) => h[Math.min(N, Math.max(0, j)) * VN + Math.min(N, Math.max(0, i))];
  const wetV = (i, j) => hV(i, j) < 0;
  const hAt = (x, z) => hV(Math.round(x / CELL), Math.round(z / CELL));
  const river32 = G => { const cs = SIZE / G, m = new Uint8Array(G * G); for (let J = 0; J < G; J++) { const z = (J + .5) * cs, x = riverX(z); for (let I = 0; I < G; I++) if (Math.abs((I + .5) * cs - x) < 28) m[J * G + I] = 1; } return m; };
  // places: villages on a jittered grid (dry, off the river), plus castles, monasteries and a harbour
  const r = D.rng(99), sets = [], zone = new Uint8Array(N * N);
  let sid = 0;
  const paint = s => {
    const rad = s.type === 1 ? 190 : 110;
    for (let j = Math.floor((s.z - rad) / CELL); j <= Math.floor((s.z + rad) / CELL); j++) for (let i = Math.floor((s.x - rad) / CELL); i <= Math.floor((s.x + rad) / CELL); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (Math.hypot((i + .5) * CELL - s.x, (j + .5) * CELL - s.z) < rad && !wetV(i, j) && !zone[j * N + i]) zone[j * N + i] = s.sid;
    }
  };
  const add = (type, x, z, extra) => { sid++; const s = Object.assign({ sid, uid: 100 + sid, type, name: 'Place' + sid, by: 'p', fy: 0, x, z, houses: 30, wealth: .4, ms: 1,
    bb: [x - 200, z - 200, x + 200, z + 200] }, extra); sets.push(s); paint(s); return s; };
  for (let z = 1500; z < SIZE - 800; z += 2600) for (let x = 2600; x < SIZE - 800; x += 2700) {
    const px = x + (r() - .5) * 900, pz = z + (r() - .5) * 900;
    if (Math.abs(px - riverX(pz)) < 500 || hAt(px, pz) < 2) continue;
    add(1, px, pz, { name: 'Village' + (sid + 1), houses: 40 + Math.floor(r() * 120), wealth: .35 + r() * .4, ms: r() < .8 ? 1 | 8 : 8 });
  }
  add(3, 5200, 4200, { name: 'Wexcombe Castle' }); add(3, 12500, 11800, { name: 'Harrow Castle' });
  add(4, 6400, 12600, { name: "St Mary's Abbey" }); add(4, 13200, 3600, { name: 'Holme Priory' });
  add(5, 1650, 8000, { name: 'Saltmouth' });
  const works = [];
  const env = {
    N, CELL, hV, wetV, hAt, river32,
    settlements: () => sets, zoneSid: k => zone[k],
    mainStreet: id => { const s = sets.find(q => q.sid === id); return s && s.type === 1 ? new Float32Array([s.x - 240, s.z - 30, s.x, s.z, s.x + 240, s.z + 35]) : null; },
    specials: id => { const s = sets.find(q => q.sid === id); return s ? [{ name: 'the church', x: s.x, z: s.z - 60 }, { name: 'the mill', x: s.x + 30, z: s.z + 70 }] : []; },
    works: () => works,
    stoneOk: (x, z) => x > 20 && z > 20 && x < SIZE - 20 && z < SIZE - 20 && !wetV(Math.round(x / CELL), Math.round(z / CELL)) && !zone[Math.floor(z / CELL) * N + Math.floor(x / CELL)],
    touch() { env.touches++; }, touches: 0
  };
  return { env, sets, zone, works, add, hAt };
}

function hashCells(a) { let h = 2166136261; for (let i = 0; i < a.length; i += 1) h = Math.imul(h ^ a[i], 16777619); return h >>> 0; }
function mkCtx(q, seed, logs) {
  return { q, year: q >> 2, season: q & 3, yf: q / 4, first: false, catchUp: false, branch: 0,
    rng: salt => D.rng(D.hash32(seed, q, 0, salt)), timeLeft: () => 50, log: e => { logs.push(Object.assign({ y: q >> 2 }, e)); }, mark() { }, budget: { realm: 1 } };
}
// run `years` of seasons from the begin commit; hook(ctx, st) runs before each season
function sim(years, seed, hook, world) {
  const W = world || makeWorld(), st = P.newState(N), res = P.runSurvey(W.env, seed), logs = [];
  const q0 = 1086 * 4;
  let begin = null;
  for (let q = q0; q < (1086 + years) * 4; q++) {
    const ctx = mkCtx(q, seed, logs); ctx.first = q === q0;
    if (hook) hook(ctx, st, W);
    P.seasonStep(st, W.env, ctx, res, seed);
    if (q === q0) begin = { cells: st.cells.slice(), owner: st.manors.map((m, i) => i ? P.holderNow(st, i) : 0) };
  }
  return { st, logs, W, begin, res };
}

// ---- survey ---------------------------------------------------------------------------------------------
const W0 = makeWorld();
const S1 = P.runSurvey(W0.env, 1234), S2 = P.runSurvey(W0.env, 1234);

test('survey is deterministic for a seed (same grid hash, names, holders)', () => {
  eq(hashCells(S1.cells), hashCells(S2.cells));
  eq(S1.manors.slice(1).map(m => m.name), S2.manors.slice(1).map(m => m.name));
  eq(S1.holders.slice(1).map(h => h.name), S2.holders.slice(1).map(h => h.name));
  const S3 = P.runSurvey(W0.env, 999);
  assert(hashCells(S3.cells) !== hashCells(S1.cells), 'another seed gives another realm');
});

test('survey covers the land, leaves the sea, 3-6 named shires, 1-4000 manors', () => {
  let land = 0, sea = 0, bad = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = S1.cells[j * N + i], wet = W0.env.wetV(i, j);
    if (wet) { sea++; if (c & P.MANOR) bad++; } else { land++; if (!(c & P.MANOR)) bad++; }
  }
  assert(bad < land * 0.001, 'unassigned land / claimed sea cells: ' + bad);
  assert(S1.K >= 3 && S1.K <= 6, 'shires ' + S1.K);
  assert(S1.shireNames.slice(1).every(n => /shire$/.test(n)), S1.shireNames.join());
  assert(new Set(S1.shireNames).size === S1.shireNames.length, 'unique shire names');
  assert(S1.M > 60 && S1.M <= 4000, 'manors ' + S1.M);
  // every place keeps its name on its own manor
  // every place lies in a manor named after a place; villages keep their own names
  const names = new Set(W0.sets.map(s => s.name)); let own = 0, vil = 0;
  for (const s of W0.sets) { const m = S1.cells[Math.floor(s.z / 16) * N + Math.floor(s.x / 16)] & P.MANOR; assert(names.has(S1.manors[m].name), s.name + ' -> ' + S1.manors[m].name); if (s.type === 1) { vil++; if (S1.manors[m].name === s.name) own++; } }
  assert(own >= vil * .9, 'villages named ' + own + '/' + vil);
  // holders: the Crown keeps >= 10%, there is a See, abbeys, castle honours, 6-12 knights
  const kinds = {}; S1.holders.slice(1).forEach(h => kinds[h.kind] = (kinds[h.kind] || 0) + 1);
  assert(kinds.see === 1 && kinds.abbey === 2 && kinds.house >= 8, JSON.stringify(kinds));
  let crown = 0; for (let m = 1; m <= S1.M; m++) if (S1.owner[m] === 1) crown++;
  assert(crown >= S1.M * .1, 'crown share');
  assert(S1.holders.some(h => h && h.honour === 'the Honour of Wexcombe'), 'castle honour named from the castle root');
});

test('manor and shire borders follow the river', () => {
  let cross = 0, diffM = 0, diffS = 0;
  for (let z = 200; z < SIZE - 200; z += 32) {
    const x = riverX(z), a = S1.cells[Math.floor(z / 16) * N + Math.floor((x - 90) / 16)], b = S1.cells[Math.floor(z / 16) * N + Math.floor((x + 90) / 16)];
    if (!(a & P.MANOR) || !(b & P.MANOR)) continue;
    cross++; if ((a & P.MANOR) !== (b & P.MANOR)) diffM++; if ((a >>> 16 & 255) !== (b >>> 16 & 255)) diffS++;
  }
  assert(diffM / cross > .85, 'manor bound on the river ' + (diffM / cross).toFixed(2));
  assert(diffS / cross > .6, 'shire bound on the river ' + (diffS / cross).toFixed(2));
});

// ---- RLE / colouring / tripoints ------------------------------------------------------------------------
test('RLE32 round-trips the realm grid and odd arrays', () => {
  eq(hashCells(P.rle32Dec(P.rle32Enc(S1.cells), N * N)), hashCells(S1.cells));
  const a = new Uint32Array([0, 0, 0xffffffff, 7, 7, 7, 1 << 25 | 5, 0]);
  eq(Array.from(P.rle32Dec(P.rle32Enc(a), a.length)), Array.from(a));
  assert(P.rle32Dec(P.rle32Enc(a), a.length + 1) === null, 'length mismatch rejected');
  assert(P.rle32Dec('%%%', 4) === null, 'garbage rejected');
  assert(P.rle32Enc(S1.cells).length < 600000, 'compact: ' + P.rle32Enc(S1.cells).length);
});

test('greedy colouring never gives neighbours the same index', () => {
  // a wheel graph plus a clique of 6
  const nb = { 1: [2, 3, 4, 5, 6], 2: [1, 3, 6], 3: [1, 2, 4], 4: [1, 3, 5], 5: [1, 4, 6], 6: [1, 5, 2], 7: [8, 9, 10, 11, 12], 8: [7, 9, 10, 11, 12], 9: [7, 8, 10, 11, 12], 10: [7, 8, 9, 11, 12], 11: [7, 8, 9, 10, 12], 12: [7, 8, 9, 10, 11] };
  const col = P.colourGreedy(Object.keys(nb).map(Number), v => nb[v]);
  for (const v in nb) for (const u of nb[v]) assert(col.get(+v) !== col.get(u), v + '-' + u);
  for (const c of col.values()) assert(c >= 1 && c <= 254);
});

test('tripoint finder: three manors meeting, a four-way corner, holder tripoints', () => {
  const st = P.newState(64);
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) st.cells[j * 64 + i] = i < 32 ? 1 : (j < 20 ? 2 : j < 40 ? 3 : 4);
  st.manors = [null, 1, 2, 3, 4].map(m => m && { id: m, name: 'M' + m, parent: 0, y0: 1086, group: m, seat: [0, 0] });
  st.hold = [null, [[1086, 1]], [[1086, 2]], [[1086, 2]], [[1086, 3]]];
  st.ready = true;
  const T = P.topo(st), keys = Array.from(T.tri.keys()).map(k => [k % 64, Math.floor(k / 64)]);
  eq(keys.sort((a, b) => a[1] - b[1]), [[31, 19], [31, 39]]);
  eq(T.tri.get(19 * 64 + 31).slice().sort(), [1, 2, 3]);
  // manors 2 and 3 share holder 2: only the 1|3|4 point is a holder tripoint
  const ht = P.holderTripoints(st, T);
  eq(ht.length, 1); eq(ht[0].ms.slice().sort(), [1, 3, 4]);
  // adjacency: 1 touches 2,3,4; 2 touches 3; 3 touches 4
  const pairs = Array.from(T.adj.keys()).map(k => [Math.floor(k / 65536), k % 65536]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  eq(pairs, [[1, 2], [1, 3], [1, 4], [2, 3], [3, 4]]);
});

test('chainEdges + Douglas-Peucker give simple polylines', () => {
  const E = []; for (let a = 0; a < 10; a++) E.push([a, 0, a + 1, 0]); for (let b = 0; b < 5; b++) E.push([10, b, 10, b + 1]);
  const L = P.chainEdges(E); eq(L.length, 1); eq(L[0].length, 16);
  const s = P.dpSimplify(L[0].map(p => [p[0] * 32, p[1] * 32]), 12); eq(s.length, 3);
});

// ---- the 400-year simulation ------------------------------------------------------------------------------
const XFER_K = new Set(['dowry', 'bequest', 'partition', 'sale', 'regrant', 'charter', 'escheat']);
let castleUid = 0, catUid = 0, founded = null;
const hook = (ctx, st, W) => {
  // like the director, history founds a village every 25 years (in open country, 1.2 km from any place)
  if (ctx.season === 0 && ctx.year > 1086 && (ctx.year - 1086) % 25 === 0) {
    const r = D.rng(ctx.year);
    for (let t = 0; t < 400; t++) {
      const x = 2000 + r() * (SIZE - 3000), z = 800 + r() * (SIZE - 1600);
      if (W.hAt(x, z) < 3 || Math.abs(x - riverX(z)) < 500 || W.sets.some(s => Math.hypot(s.x - x, s.z - z) < 1200)) continue;
      W.add(1, x, z, { name: 'Newton' + ctx.year, by: 'h', fy: ctx.year, houses: 60 + Math.floor(r() * 60), wealth: .45 + r() * .2 }); break;
    }
  }
  if (ctx.year === 1150 && ctx.season === 0 && !castleUid) { W.add(3, 10400, 6800, { name: 'Ravenscar Castle', by: 'h', fy: 1150 }); castleUid = W.sets[W.sets.length - 1].uid; }
  if (ctx.year === 1180 && ctx.season === 1 && !founded) {
    // a history founding inside a virtual manor
    for (let m = 1; m < st.manors.length; m++) { const M = st.manors[m]; if (M && M.virt && !M.parent) { W.add(1, M.seat[0], M.seat[1], { name: 'Crowfield', by: 'h', fy: 1180 }); founded = { m, old: M.name }; break; } }
  }
  if (ctx.year === 1210 && ctx.season === 2 && !catUid) { const v = W.sets.find(s => s.type === 1 && s.houses > 60); catUid = v.uid; W.works.push({ wid: 1, kind: 'cathedral', uid: v.uid, done: 1210 }); }
};
const t0 = Date.now();
const A = sim(400, 77, hook);
const simMs = Date.now() - t0;

test(`400-year simulation: exclaves and street cuts every century, caps respected (${simMs} ms)`, () => {
  const { st, logs } = A;
  // re-run century snapshots from the log: exclaves are measured on the final realm AND via dowries per century
  const cuts = [0, 0, 0, 0], dow = [0, 0, 0, 0];
  for (const e of logs) { const c = Math.floor((e.y - 1086) / 100); if (c > 3) continue; if (e.k === 'partition' && e.via === 'street') cuts[c]++; if (e.k === 'dowry') dow[c]++; }
  for (let c = 0; c < 4; c++) { assert(cuts[c] >= 1, 'street cuts per century ' + cuts); assert(dow[c] >= 3, 'dowries (exclaves) per century ' + dow); }
  assert(P.exclaves(st) >= 3, 'detached house pieces at the end: ' + P.exclaves(st));
  // caps
  assert(st.manors.length - 1 <= 4000 && st.holders.length - 1 <= 400, 'manor/holder caps');
  assert(st.ghosts.length <= 60 && st.stones.length <= 24, 'ghost/stone caps ' + st.ghosts.length + '/' + st.stones.length);
  const perYear = new Map(), perQ = new Map();
  for (const e of logs) if (XFER_K.has(e.k)) { perYear.set(e.y, (perYear.get(e.y) || 0) + 1); }
  for (const n of perYear.values()) assert(n <= 2, 'transfers per year ' + n);
  const total = Array.from(perYear.values()).reduce((a, b) => a + b, 0);
  assert(total > 90 && total < 240, 'about 0.4 transfers a year: ' + total);
  const kinds = new Set(logs.map(e => e.k));
  for (const k of ['dowry', 'bequest', 'partition', 'sale', 'regrant', 'charter', 'escheat', 'stone', 'house', 'see', 'rename']) assert(kinds.has(k), 'saw ' + k);
  eq(P.deserializeState ? true : false, true);
  void perQ;
});

test('event-driven changes: castle house, See seat, rename of a virtual manor', () => {
  const { st, logs } = A;
  const h = logs.find(e => e.k === 'house'); assert(h && /Ravenscar/.test(h.txt) && h.y === 1150 + 1, h && h.txt + ' ' + h.y);
  const s = logs.find(e => e.k === 'see'); assert(s && s.y === 1210, s && s.txt);
  const rn = logs.find(e => e.k === 'rename' && /Crowfield/.test(e.txt)); assert(rn && rn.txt === `The manor of ${founded.old}, now called Crowfield.`, rn && rn.txt);
  assert(st.manors[founded.m].name === 'Crowfield' && st.manors[founded.m].aka === founded.old);
  assert(st.holders.some(H => H && H.kind === 'see' && H.seatManor === (st.cells[Math.floor(A.W.sets.find(q => q.uid === catUid).z / 16) * N + Math.floor(A.W.sets.find(q => q.uid === catUid).x / 16)] & P.MANOR)), 'new See seated on the cathedral town');
  const stoneLog = logs.filter(e => e.k === 'stone'); assert(stoneLog.length === st.stones.length, 'every stone logged');
  assert(stoneLog.some(e => /where .* meet/.test(e.txt)));
  assert(logs.some(e => e.k === 'charter' && / buys its charter and answers to no lord\.$/.test(e.txt)));
  // borough cells carry the flag
  let bor = 0; for (let k = 0; k < st.cells.length; k++) if (st.cells[k] & P.BOROUGH) bor++;
  assert(bor > 100, 'borough cells ' + bor);
});

test('disp(): the realm of the begin commit is reconstructed exactly after 400 years of carving', () => {
  const { st, begin } = A;
  let carved = 0;
  for (let k = 0; k < st.cells.length; k++) {
    const m = st.cells[k] & P.MANOR, m0 = begin.cells[k] & P.MANOR;
    if (m !== m0) carved++;
    const d = P.dispManor(st, m, 1085.5);   // just before the first season after the begin commit
    if (d !== m0) throw new Error(`cell ${k}: disp ${d} != ${m0}`);
    if (m0 && P.holderAt(st, d, 1085.5) !== begin.owner[m0]) throw new Error(`cell ${k}: holder at 1086 differs`);
  }
  assert(carved > 1000, 'carving happened: ' + carved);
  // halfway: a manor carved in year y shows its parent the year before and itself from y
  const kid = st.manors.find(M => M && M.parent);
  eq(P.disp(st, kid.id, kid.y0 - 1), P.disp(st, kid.parent, kid.y0 - 1));
  eq(P.disp(st, kid.id, kid.y0), kid.group);
});

test('fillIdTex: adjacent regions never share a colour at any level (present and past)', () => {
  const { st, W } = A;
  for (const Y of [null, 1150, 1300]) {
    const out = new Uint8Array(N * N * 4); P.fillIdTex(st, W.env, out, Y);
    const Pa = P.parishes(st, W.env, Y);
    const id = (k, l) => {
      const c = st.cells[k], m = c & P.MANOR; if (!m) return 0;
      if (l === 0) return c >>> 16 & 255;
      const d = P.dispManor(st, m, Y);
      if (l === 1) return P.holderAt(st, d, Y);
      if (l === 2) return st.manors[d].group;
      const i = k % N, j = (k - i) / N; return Pa.grid[(j >> 2) * Pa.G4 + (i >> 2)];
    };
    let checked = 0;
    for (let j = 0; j < N - 1; j += 1) for (let i = 1; i < N - 1; i += 1) {
      const k = j * N + i;
      if (!(st.cells[k] & P.MANOR)) continue;
      for (const k2 of [k + 1, k + N, k + N + 1, k + N - 1]) {
        if (!(st.cells[k2] & P.MANOR)) continue;
        if (st.cells[k2] === st.cells[k] && Math.floor((k2 % N) / 4) === Math.floor(i / 4) && Math.floor(((k2 - k2 % N) / N) / 4) === Math.floor(j / 4)) continue;
        for (let l = 0; l < 4; l++) {
          const a = id(k, l), b = id(k2, l);
          if (a && b && a !== b) { checked++; if (out[k * 4 + l] === out[k2 * 4 + l]) throw new Error(`Y ${Y} level ${l}: ${a}/${b} share colour ${out[k * 4 + l]}`); }
          if (a && a === b && out[k * 4 + l] !== out[k2 * 4 + l]) throw new Error('same region, two colours');
        }
      }
    }
    assert(checked > 1000, 'edges checked ' + checked);
  }
});

test('legend, masks and ghosts are well formed', () => {
  const { st, W } = A;
  const L = P.legend(st, null); assert(L.length > 5 && L[0].manors >= L[L.length - 1].manors);
  assert(L.some(e => e.pieces > 1), 'some honour lies in pieces');
  const mask = new Uint8Array(N * N), big = L.find(e => e.pieces > 1);
  const r = P.maskOf(st, W.env, 'honour', big.holder.id, null, mask); assert(r.n > 0);
  const s = P.maskStats(st, mask, r.bb); assert(s.pieces >= big.pieces, s.pieces + ' vs ' + big.pieces);
  const G = P.ghostsAt(st, null); assert(G.length > 10 && G.length <= 60, 'ghosts ' + G.length);
  for (const g of G) {
    assert(/^Bounds of .+, to \d{4}$/.test(g.label), g.label);
    assert(g.pts.length >= 4 && g.pts.length % 2 === 0);
    for (const v of g.pts) assert(Number.isNaN(v) || (v >= -64 && v <= SIZE + 64), 'pt ' + v);
  }
  assert(P.ghostsAt(st, 1100).every(g => g.y1 <= 1100));
});

test('400-year simulation is deterministic (serialize is byte-identical)', () => {
  castleUid = 0; catUid = 0; founded = null;
  const B = sim(400, 77, hook);
  eq(JSON.stringify(P.serializeState(B.st)).length, JSON.stringify(P.serializeState(A.st)).length);
  assert(JSON.stringify(P.serializeState(B.st)) === JSON.stringify(P.serializeState(A.st)), 'identical');
  const C = sim(60, 78);
  assert(JSON.stringify(P.serializeState(C.st)) !== JSON.stringify(P.serializeState(A.st)), 'another seed differs');
});

test('serialize -> JSON -> deserialize round-trips exactly; old/garbage saves reset', () => {
  const s1 = JSON.stringify(P.serializeState(A.st));
  const st2 = P.newState(N); assert(P.deserializeState(st2, JSON.parse(s1)));
  eq(JSON.stringify(P.serializeState(st2)), s1);
  assert(s1.length < 1.2e6, 'realm save size ' + s1.length);
  const st3 = P.newState(N); st3.cells[5] = 9;
  assert(!P.deserializeState(st3, null) && !st3.ready && st3.cells[5] === 0);
  assert(!P.deserializeState(st3, { v: 1 }) && !st3.ready);
  assert(!P.deserializeState(st3, { v: 1, cells: 'AAAA', manors: [] }) && !st3.ready, 'bad cells reset');
  eq(P.serializeState(st3), { v: 1 });
});

test('snap/restore (undo metadata) + cell copy reproduce the state exactly', () => {
  const W = makeWorld(), st = P.newState(N), res = P.runSurvey(W.env, 5), logs = [];
  const q0 = 1086 * 4;
  for (let q = q0; q < 1120 * 4; q++) { const c = mkCtx(q, 5, logs); c.first = q === q0; P.seasonStep(st, W.env, c, res, 5); }
  const snap = P.snapState(st), cells = st.cells.slice(), ser = JSON.stringify(P.serializeState(st));
  for (let q = 1120 * 4; q < 1200 * 4; q++) P.seasonStep(st, W.env, mkCtx(q, 5, logs), res, 5);
  assert(JSON.stringify(P.serializeState(st)) !== ser, 'something happened');
  st.cells.set(cells); P.restoreState(st, snap);
  eq(JSON.stringify(P.serializeState(st)), ser);
  // and the realm carries on identically after the restore
  const st2 = P.newState(N); P.deserializeState(st2, JSON.parse(ser));
  for (let q = 1120 * 4; q < 1160 * 4; q++) { P.seasonStep(st, W.env, mkCtx(q, 5, []), res, 5); P.seasonStep(st2, W.env, mkCtx(q, 5, []), res, 5); }
  eq(JSON.stringify(P.serializeState(st)), JSON.stringify(P.serializeState(st2)));
  // restore(null) empties the metadata (cells are the History regArray's business)
  P.restoreState(st, null); assert(!st.ready && st.manors.length === 1);
});

test('the realm only writes cells after announcing the rect to History (touch)', () => {
  const W = makeWorld(), st = P.newState(N), res = P.runSurvey(W.env, 5);
  let touched = null; const seen = [];
  W.env.touch = (i0, j0, i1, j1) => { touched = [i0, j0, i1, j1]; seen.push(touched); };
  const before = st.cells.slice();
  const c0 = mkCtx(1086 * 4, 5, []); c0.first = true; P.seasonStep(st, W.env, c0, res, 5);
  eq(seen[0], [0, 0, N - 1, N - 1]);
  let prev = st.cells.slice();
  for (let q = 1086 * 4 + 1; q < 1200 * 4; q++) {
    const n0 = seen.length; P.seasonStep(st, W.env, mkCtx(q, 5, []), res, 5);
    for (let k = 0; k < N * N; k++) if (st.cells[k] !== prev[k]) {
      const i = k % N, j = (k - i) / N;
      assert(seen.slice(n0).some(t => i >= t[0] && i <= t[2] && j >= t[1] && j <= t[3]), 'untouched write at ' + i + ',' + j);
    }
    if (seen.length !== n0) prev = st.cells.slice();
  }
  void before;
});

// ---- browser glue: Realm.init + the real History regArray + a stand-in Story commit ------------------------
test('glue: survey slices in update(), begin commit is undoable/redoable exactly, busy gates, stones render', () => {
  const G = load(['js/core.js', 'js/history.js', 'js/realm.js']);
  const W = makeWorld(), VN_ = N + 1;
  // world data the browser env reads
  G.VN = VN_; G.W = { h: new Float32Array(VN_ * VN_), water: new Float32Array(VN_ * VN_).fill(-1e9), seaLevel: 0, rivers: [{ s: (() => { const a = []; for (let z = 0; z <= SIZE; z += 64) a.push(riverX(z), z, 0, 30); return new Float32Array(a); })() }], zone: new Uint8Array(N * N * 4), seed: 3 };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) G.W.h[j * VN_ + i] = W.env.hV(i, j);
  let parts = [], extra = null;
  G.Nature = { SP_INDEX: { boundstone: 34 }, setExtra: (k, a) => { if (k === 'realm:stones') extra = a; } };
  G.Story = { register: (n, p) => { p.name = n; parts.push(p); }, partBudget: ms => ms };
  G.Realm.init();
  const part = parts[0];
  assert(part && part.order === 40 && G.History.arrays.realm, 'registered');
  // Story's own snapshot object, like story.js does it
  G.History.regObj('story', { save: () => part.snap(), load: s => part.restore(s) });
  assert(!part.busy());
  G.emit('story:prepare');
  assert(part.busy() && G.Realm.busy(), 'surveying');
  let frames = 0; const sl = [];
  while (part.busy() && frames < 5000) { const t = performance.now(); part.update(1 / 60); sl.push(performance.now() - t); frames++; }
  assert(!part.busy() && frames > 5, 'survey ran in slices: ' + frames);
  sl.sort((a, b) => a - b);
  console.log(`       survey: ${frames} slices, ${sl.reduce((a, b) => a + b, 0).toFixed(0)} ms total, p95 ${sl[Math.floor(frames * .95)].toFixed(1)} ms, max ${sl[frames - 1].toFixed(1)} ms`);
  assert(sl[Math.floor(frames * .95)] < 6, 'survey slices stay near the 2 ms budget');
  // the begin commit
  let dirty = false;
  const ctxFor = (q, first) => ({ q, year: q >> 2, season: q & 3, yf: q / 4, first, catchUp: false, branch: 0, rng: s => G.rng(G.hash32(1, q, 0, s)), timeLeft: () => 12, log() { dirty = true; }, mark() { dirty = true; }, budget: { realm: 1 } });
  G.History.begin('Chronicle begins', 'story'); G.History.touchObj('story');
  part.season(ctxFor(1086 * 4, true));
  G.History.end();
  assert(G.Realm.ready && G.Realm.counts().manors > 50, 'ready');
  const ser0 = JSON.stringify(part.serialize());
  const desc = G.Realm.describe(9000, 9000); assert(/^Manor of .+ · held by .+/.test(desc), desc);
  const at = G.Realm.at(9000, 9000); assert(at.manor.name && at.shire.name && at.honour.holder.name, JSON.stringify(at));
  // a run of seasons, each its own entry
  // a run of seasons exactly as story.js commits them (merge-folded runs; untouched seasons aborted)
  for (let q = 1086 * 4 + 1; q < 1140 * 4; q++) {
    dirty = false; G.History.begin('History', 'story', { merge: 'story', y: q >> 2 }); G.History.touchObj('story');
    part.season(ctxFor(q, false));
    if (dirty) G.History.end(); else G.History.abort();
    for (let f = 0; f < 3; f++) part.update(1 / 60);
  }
  const ser1 = JSON.stringify(part.serialize());
  assert(ser1 !== ser0, 'the realm changed over 54 years');
  const n = G.History.entries.length; assert(n > 2 && n < 12, 'folded runs: ' + n);
  G.History.jump(1); eq(JSON.stringify(part.serialize()), ser0, 'undo back to the begin state');
  G.History.jump(n); eq(JSON.stringify(part.serialize()), ser1, 'redo to the present');
  G.History.jump(0); assert(!G.Realm.ready && JSON.stringify(part.serialize()) === '{"v":1}', 'undo the begin commit');
  let nz = 0; for (const c of G.Realm._dev.state().cells) if (c) nz++; eq(nz, 0, 'cells cleared by the regArray');
  G.History.jump(n); eq(JSON.stringify(part.serialize()), ser1);
  // stones reach Nature after the debounce, with the boundstone species
  for (let f = 0; f < 400; f++) part.update(1 / 60);
  assert(extra && extra.length === G.Realm.stones().length * 7 && extra[3] === 34, 'stones rendered: ' + (extra && extra.length));
  part.onView(1087); for (let f = 0; f < 100; f++) part.update(1 / 60);
  assert(!extra || extra.length / 7 === G.Realm.stones(1087).length, 'replay hides later stones');
  eq(G.Realm._dev.check(), []);
  // atlas-facing queries
  const id = new Uint8Array(N * N * 4); G.Realm.fillIdTex(id, 1100);
  { const t = performance.now(); G.Realm.fillIdTex(id, 1120); const t2 = performance.now(); G.Realm.fillIdTex(id); console.log(`       fillIdTex: ${(t2 - t).toFixed(1)} ms (year change), ${(performance.now() - t2).toFixed(1)} ms (present)`); }
  const mask = new Uint8Array(N * N), rg = G.Realm.rings(9000, 9000, null);
  assert(rg.length >= 3 && rg.every(r => r.bb.length === 4 && r.pieces >= 1 && r.maskHash), JSON.stringify(rg.map(r => r.level)));
  eq(rg.map(r => r.level).slice(-3), ['manor', 'honour', 'shire']);
  assert(G.Realm.maskOf('shire', rg[rg.length - 1].id, undefined, mask).n > 1000);
  assert(G.Realm.legend().length > 5 && G.Realm.labels().some(l => l.level === 'shire'));
  // deserialize(null) = fresh; reset clears
  part.deserialize(null); assert(!G.Realm.ready);
  part.deserialize(JSON.parse(ser1)); eq(JSON.stringify(part.serialize()), ser1, 'load');
  // a chronicle that began without the realm: the next season starts a survey (busy), a later one writes it
  part.deserialize(null); let d2 = false;
  const c = ctxFor(1150 * 4, false); c.mark = () => { d2 = true; };
  part.season(c); assert(part.busy() && !G.Realm.ready && !d2, 'late survey started');
  while (part.busy()) part.update(1 / 60);
  G.History.begin('History', 'story'); G.History.touchObj('story'); part.season(ctxFor(1150 * 4 + 1, false)); G.History.end();
  assert(G.Realm.ready && G.Realm._dev.state().manors[1].y0 === 1150, 'late begin at 1150');
});

test('partition falls back to a road through the manor, then to a straight bound; children partition the parent', () => {
  const M = 128, mk = () => {
    const st = P.newState(M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) st.cells[j * M + i] = (i < 64 ? 1 : 2) | (1 << 16);
    st.manors = [null, 1, 2].map(m => m && Object.freeze({ id: m, name: m === 1 ? 'Ashby' : 'Wexcombe', parent: 0, y0: 1086, group: m, seat: Object.freeze([m === 1 ? 500 : 1500, 1000]), virt: 0, uid: 0 }));
    st.holders = [null, { id: 1, kind: 'crown', name: 'the Crown', seatManor: 0, y0: 1086, y1: 0 }, { id: 2, kind: 'house', name: 'the Basset family', sur: 'Basset', seatManor: 1, y0: 1086, y1: 0 },
      { id: 3, kind: 'house', name: 'the Lovel family', sur: 'Lovel', seatManor: 2, y0: 1086, y1: 0 }, { id: 4, kind: 'house', name: 'the Corbet family', sur: 'Corbet', seatManor: 0, y0: 1086, y1: 0 }];
    st.hold = [null, [[1086, 2]], [[1086, 3]]]; st.shireNames = ['', 'Ashbyshire']; st.ready = true;
    return st;
  };
  const env = { N: M, CELL: 16, hV: () => 10, wetV: () => false, hAt: () => 10, settlements: () => [], zoneSid: () => 0, touch() {}, stoneOk: () => true };
  for (const [roads, via] of [[bb => [new Float32Array([0, 1100, 400, 1000, 1000, 900])], 'road'], [null, 'line']]) {
    const st = mk(), logs = [], ctx = mkCtx(1200 * 4, 3, logs);
    const E = Object.assign({}, env, roads ? { roads } : {});
    // force the Basset manor (Lovel's seat is excluded by making it too small to part)
    for (let j = 0; j < M; j++) for (let i = 64; i < M; i++) if (j >= 4 || i > 70) st.cells[j * M + i] = 1 | (1 << 16);
    const T = P.topo(st);
    assert(P.transfers(st, E, ctx, T, [], ctx.rng('t'), 'partition'), 'parted');
    const e = logs[0]; eq(e.k, 'partition'); eq(e.via, via);
    assert(via === 'road' ? /the road becomes the bound/.test(e.txt) : /straight bound/.test(e.txt), e.txt);
    // every former Ashby cell now belongs to a child of Ashby, and no Ashby cells remain
    let left = 0; const kids = new Set();
    for (let k = 0; k < M * M; k++) { const m = st.cells[k] & P.MANOR; if (m === 1) left++; if (m > 2) { kids.add(m); eq(st.manors[m].parent, 1); } }
    eq(left, 0); assert(kids.size >= 2 && kids.size <= 3);
    for (const c of kids) { const h = P.holderNow(st, c); assert(h !== 2 && st.holders[h].kind === 'house', 'dealt to other houses'); eq(P.disp(st, c, 1199), 1); }
    assert(st.ghosts.length <= 1);
  }
});

// ---- review fixes: river cuts, owed transfers, stone budget, rename years, bad saves, glue slices ----------
// a 128-cell realm: one big house manor (Ashby) with a river running north-south through it at x = 600 m
function smallRealm() {
  const M = 128, st = P.newState(M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) st.cells[j * M + i] = ((j < 4 && i >= 64 && i <= 70) ? 2 : 1) | (1 << 16);
  st.manors = [null, 1, 2].map(m => m && Object.freeze({ id: m, name: m === 1 ? 'Ashby' : 'Wexcombe', parent: 0, y0: 1086, group: m, seat: Object.freeze([m === 1 ? 500 : 1500, 1000]), virt: 0, uid: 0 }));
  st.holders = [null, { id: 1, kind: 'crown', name: 'the Crown', seatManor: 0, y0: 1086, y1: 0 }, { id: 2, kind: 'house', name: 'the Basset family', sur: 'Basset', seatManor: 1, y0: 1086, y1: 0 },
    { id: 3, kind: 'house', name: 'the Lovel family', sur: 'Lovel', seatManor: 2, y0: 1086, y1: 0 }, { id: 4, kind: 'house', name: 'the Corbet family', sur: 'Corbet', seatManor: 0, y0: 1086, y1: 0 }];
  st.hold = [null, [[1086, 2]], [[1086, 3]]]; st.shireNames = ['', 'Ashbyshire']; st.ready = true;
  return st;
}
const smallEnv = river => ({ N: 128, CELL: 16, hV: () => 10, wetV: () => false, hAt: () => 10, settlements: () => [], zoneSid: () => 0, touch() {}, stoneOk: () => true,
  river32: river ? G => { const m = new Uint8Array(G * G), cs = 128 * 16 / G; for (let J = 0; J < G; J++) for (let I = 0; I < G; I++) if (Math.abs((I + .5) * cs - (600 + 60 * Math.sin(J / 9))) < 20) m[J * G + I] = 1; return m; } : undefined });

test('partition cuts along a river from a freshly rasterised mask, identically after serialize/deserialize', () => {
  const E = smallEnv(true), outs = [];
  for (const reload of [false, true]) {
    // a live state (normalised once through the save format), or the same state saved and loaded again
    const rt = s0 => { const s2 = P.newState(128); assert(P.deserializeState(s2, JSON.parse(JSON.stringify(P.serializeState(s0))))); return s2; };
    let st = rt(smallRealm()); P.topo(st);
    if (reload) st = rt(st);
    assert(!st.riv32, 'no cached river mask');
    const logs = [], ctx = mkCtx(1200 * 4, 3, logs);
    assert(P.transfers(st, E, ctx, P.topo(st), [], ctx.rng('t'), 'partition'), 'parted');
    eq(logs[0].via, 'river'); assert(/the river becomes the bound/.test(logs[0].txt), logs[0].txt);
    // the bound runs along the river: no child lies substantially on both sides of it
    const side = new Map();
    for (let k = 0; k < 128 * 128; k++) { const m = st.cells[k] & P.MANOR; if (m < 3) continue; const x = (k % 128 + .5) * 16; if (Math.abs(x - 600) < 90) continue; const s = x < 600 ? 'w' : 'e'; const a = side.get(m) || {}; a[s] = (a[s] || 0) + 1; side.set(m, a); }
    for (const [m, a] of side) assert(!(a.w > 20 && a.e > 20), 'child ' + m + ' straddles the river ' + JSON.stringify(a));
    outs.push(JSON.stringify(P.serializeState(st)));
  }
  eq(outs[0], outs[1], 'same cut in memory and after a reload');
  // no river in the world -> not a river cut (no stale mask from an earlier world can leak in)
  const st = smallRealm(), logs = [], ctx = mkCtx(1200 * 4, 3, logs);
  P.transfers(st, smallEnv(false), ctx, P.topo(st), [], ctx.rng('t'), 'partition');
  assert(logs[0] && logs[0].via !== 'river', 'no river, no river cut');
});

test('a transfer roll that finds no time is owed, not lost; owed rolls respect the caps', () => {
  const rate = P.TUNE.rate;
  try {
    const st = smallRealm(), logs = [];
    P.TUNE.rate = 1;                                   // every roll hits
    const c1 = mkCtx(1200 * 4, 3, logs); c1.timeLeft = () => 2;
    let dirty = false; c1.mark = () => { dirty = true; };
    const before = st.cells.slice();
    assert(P.transfers(st, smallEnv(true), c1, P.topo(st), [], c1.rng('realm')), 'owed counts as a change');
    assert(dirty && st.x.owe === 1 && !logs.length, 'owed, nothing done');
    assert(st.cells.every((c, k) => c === before[k]), 'no cells written');
    // lazy topology (T null) owes too, and debts cap at 2
    const c2 = mkCtx(1200 * 4 + 1, 3, logs); P.transfers(st, smallEnv(true), c2, null, null, c2.rng('realm')); eq(st.x.owe, 2);
    const c3 = mkCtx(1200 * 4 + 2, 3, logs); c3.timeLeft = () => 1; P.transfers(st, smallEnv(true), c3, null, null, c3.rng('realm')); eq(st.x.owe, 2);
    // with time and no fresh hit, the debt is paid one transfer a season
    P.TUNE.rate = 0;
    const c4 = mkCtx(1201 * 4, 3, logs); assert(P.transfers(st, smallEnv(true), c4, P.topo(st), [], c4.rng('realm')));
    eq(st.x.owe, 1); eq(st.x.tn, 1); assert(logs.length === 1, 'one transfer');
    // the serialised debt survives a reload
    const st2 = P.newState(128); P.deserializeState(st2, JSON.parse(JSON.stringify(P.serializeState(st)))); eq(st2.x.owe, 1);
    // seasonStep with lazyTopo on a stale cache: no cells written, only the debt ledger
    P.TUNE.rate = 1; st.cver++;
    const c5 = mkCtx(1202 * 4, 3, logs); c5.lazyTopo = true; const b5 = st.cells.slice();
    P.seasonStep(st, smallEnv(true), c5, null, 3);
    assert(st.cells.every((c, k) => c === b5[k]), 'lazy: no cells written'); eq(st.x.owe, 2);
  } finally { P.TUNE.rate = rate; }
});

test('stone placement is bounded: <= 97 probes per stone, none once the commit is out of time', () => {
  const W = makeWorld(), st = P.newState(N), res = P.runSurvey(W.env, 5);
  let calls = 0, worst = 0; const ok = W.env.stoneOk;
  W.env.stoneOk = (x, z) => { calls++; return ok(x, z) && ((x * 7 + z * 13) | 0) % 5 === 0; };   // most probes fail
  const c0 = mkCtx(1086 * 4, 5, []); c0.first = true; P.seasonStep(st, W.env, c0, res, 5);
  assert(calls <= res.triShire.length * 97, 'begin probes ' + calls + ' for ' + res.triShire.length);
  for (let q = 1086 * 4 + 1; q < 1140 * 4; q++) {
    calls = 0; P.seasonStep(st, W.env, mkCtx(q, 5, []), res, 5);
    worst = Math.max(worst, calls);
  }
  assert(worst <= 6 * 97, 'winter probes ' + worst);
  // out of time: a Winter tries no stone at all
  calls = 0; const cw = mkCtx(1140 * 4 + 3, 5, []); cw.timeLeft = () => 2; P.seasonStep(st, W.env, cw, res, 5); eq(calls, 0);
  // a begin commit out of time keeps its tri-shire stones pending (saved in x.tri); the next season sets them
  const st2 = P.newState(N), res2 = P.runSurvey(makeWorld().env, 5), logs = [];
  const b = mkCtx(1086 * 4, 5, logs); b.first = true; b.timeLeft = () => 2; P.seasonStep(st2, W.env, b, res2, 5);
  assert(res2.triShire.length > 0 && st2.stones.length === 0 && st2.x.tri.length === res2.triShire.length, 'pending ' + st2.x.tri.length);
  const st3 = P.newState(N); P.deserializeState(st3, JSON.parse(JSON.stringify(P.serializeState(st2)))); eq(st3.x.tri.length, st2.x.tri.length);
  P.seasonStep(st2, W.env, mkCtx(1086 * 4 + 1, 5, logs), res2, 5);
  assert(st2.x.tri.length === 0 && st2.stones.length > 0 && logs.some(e => /A stone marks where/.test(e.txt)), 'tri-shire stones set later');
});

test('a renamed manor shows its old name before the rename year (nameAt), and the year round-trips', () => {
  const { st } = A, M = st.manors[founded.m];
  eq(M.ry, 1180);
  eq(P.nameAt(M, 1179), founded.old); eq(P.nameAt(M, 1180), 'Crowfield'); eq(P.nameAt(M, null), 'Crowfield'); eq(P.nameAt(M, undefined), 'Crowfield');
  const st2 = P.newState(N); P.deserializeState(st2, JSON.parse(JSON.stringify(P.serializeState(st)))); eq(st2.manors[founded.m].ry, 1180);
  // an old save without the year keeps the new name everywhere
  eq(P.nameAt(Object.assign({}, M, { ry: 0 }), 1100), 'Crowfield');
});

test('inconsistent saves are refused as a whole; dangling holders fall to the Crown', () => {
  const o = JSON.parse(JSON.stringify(P.serializeState(A.st)));
  const short = Object.assign({}, o, { manors: o.manors.slice(0, 10) });   // cells name manors the save no longer lists
  const st = P.newState(N);
  assert(!P.deserializeState(st, short) && !st.ready && st.cells.every(c => c === 0), 'refused');
  const badParent = JSON.parse(JSON.stringify(o)); badParent.manors[3][2] = 99999;
  assert(!P.deserializeState(st, badParent) && !st.ready, 'broken parent chain refused');
  const dang = JSON.parse(JSON.stringify(o)); dang.hold[0][1] = [[1086, 9999]];
  assert(P.deserializeState(st, dang) && P.holderNow(st, dang.hold[0][0]) === 1, 'dangling holder -> Crown');
});

test('glue: load drops the cost grid and primes it in slices; stale topology defers a tight commit; no sync survey in a begin commit', () => {
  const G = load(['js/core.js', 'js/history.js', 'js/realm.js']);
  const W = makeWorld(), VN_ = N + 1;
  G.VN = VN_; G.W = { h: new Float32Array(VN_ * VN_), water: new Float32Array(VN_ * VN_).fill(-1e9), seaLevel: 0, rivers: [], zone: new Uint8Array(N * N * 4), seed: 3 };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) G.W.h[j * VN_ + i] = W.env.hV(i, j);
  let part = null; G.Story = { register: (n, p) => { p.name = n; part = p; }, partBudget: ms => ms, started: false };
  G.Realm.init();
  const R = G.Realm._dev, ctxFor = (q, first, tl) => ({ q, year: q >> 2, season: q & 3, yf: q / 4, first, catchUp: false, branch: 0, rng: s => G.rng(G.hash32(1, q, 0, s)), timeLeft: () => tl, log() {}, mark() {}, budget: { realm: 1 } });
  // a begin commit with no survey in hand starts one instead of surveying synchronously
  const t0 = performance.now(); part.season(ctxFor(1086 * 4, true, 12));
  assert(performance.now() - t0 < 60 && part.busy() && !G.Realm.ready, 'no synchronous survey');
  while (part.busy()) part.update(1 / 60);
  G.History.begin('H', 'story'); G.History.touchObj('story'); part.season(ctxFor(1086 * 4 + 1, false, 12)); G.History.end();
  assert(G.Realm.ready && R.state().topo && R.state().topo.ver === R.state().cver, 'begin adopted the survey topology');
  assert(R.held().surveyRes, 'kept until the chronicle runs'); G.Story.started = true; part.update(1 / 60); assert(!R.held().surveyRes, 'released');
  const ser = part.serialize();
  // load: derived caches dropped, then rebuilt by update() slices
  part.deserialize(JSON.parse(JSON.stringify(ser)));
  assert(!R.state().cost32 && !(R.state().topo && R.state().topo.ver === R.state().cver), 'caches dropped on load');
  // a commit with no time to spare while the topology is stale writes nothing
  const before = R.state().cells.slice(); part.season(ctxFor(1087 * 4, false, 0));
  assert(R.state().cells.every((c, k) => c === before[k]), 'deferred');
  let f = 0; while ((!R.state().cost32 || R.held().topoJob) && f < 2000) { part.update(1 / 60); f++; }
  assert(R.state().cost32 && R.state().topo.ver === R.state().cver && f > 3, 'primed in ' + f + ' slices');
  // a reset drops it again (a new world never sees the old cost grid)
  part.reset(); assert(!R.state().cost32 && !G.Realm.ready);
});

test('counts() is exact while the topology is stale after a load (a cell scan, not manors.length - 1)', () => {
  const G = load(['js/core.js', 'js/history.js', 'js/realm.js']);
  const W = makeWorld(), VN_ = N + 1;
  G.VN = VN_; G.W = { h: new Float32Array(VN_ * VN_), water: new Float32Array(VN_ * VN_).fill(-1e9), seaLevel: 0, rivers: [], zone: new Uint8Array(N * N * 4), seed: 3 };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) G.W.h[j * VN_ + i] = W.env.hV(i, j);
  let part = null; G.Story = { register: (n, p) => { p.name = n; part = p; }, partBudget: ms => ms, started: true };
  G.Realm.init();
  const R = G.Realm._dev, ctxFor = q => ({ q, year: q >> 2, season: q & 3, yf: q / 4, first: q === 1086 * 4, catchUp: false, branch: 0, rng: s => G.rng(G.hash32(1, q, 0, s)), timeLeft: () => 50, log() {}, mark() {}, budget: { realm: 1 } });
  G.emit('story:prepare'); while (part.busy()) part.update(1 / 60);
  let q = 1086 * 4;
  G.History.begin('H', 'story'); G.History.touchObj('story'); part.season(ctxFor(q)); G.History.end();
  // carve until some manor has children (partition / bequest leave a parent with fewer or no cells)
  for (let k = 0; k < 400 && !R.state().manors.some(m => m && m.parent); k++) {
    R.force(['partition', 'bequest'][k & 1]); q++;
    G.History.begin('H', 'story'); G.History.touchObj('story'); part.season(ctxFor(q)); G.History.end();
  }
  assert(R.state().manors.some(m => m && m.parent), 'something was carved');
  const live = G.Realm.counts().manors;
  part.deserialize(JSON.parse(JSON.stringify(part.serialize())));
  assert(!(R.state().topo && R.state().topo.ver === R.state().cver), 'topology stale after load');
  eq(G.Realm.counts().manors, live, 'stale-topology count matches the live count');
  let f = 0; while (R.held().topoJob && f < 2000) { part.update(1 / 60); f++; }
  eq(G.Realm.counts().manors, live, 'and the primed count');
});
