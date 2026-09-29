// D: Works & Age — kit construction / age maths, the works lifecycle (with stubbed Town / Story / Roads / Kit),
// and the bell synthesis. Run: cd worldbuild && deno run -A dev/tests/run.js works
import { load, test, assert, eq, near } from './harness.js';

// ---- kit ------------------------------------------------------------------------------------------------------
const K = () => load(['js/core.js', 'js/kit.js']).Kit;
const PSTR = 21;
function parts(Kit, rec) { return Kit._recipe(rec).parts; }
function gname(Kit, gi) { return Kit._geos[gi].name; }

test('kit: capKnots hits the §3.7 knots and is monotone', () => {
  const { capKnots } = K()._pure;
  near(capKnots(0, 10, 16, 30), -0.2); near(capKnots(0.04, 10, 16, 30), -0.2); near(capKnots(0.10, 10, 16, 30), 1.5);
  near(capKnots(0.75, 10, 16, 30), 10); near(capKnots(0.85, 10, 16, 30), 16); near(capKnots(1, 10, 16, 30), 30.5);
  let prev = -1e9;
  for (let p = 0; p <= 1.0001; p += 0.01) { const h = capKnots(p, 0.5, 0.2, 0.1); assert(h >= prev - 1e-9, 'monotone even with degenerate knots'); prev = h; }
  near(capKnots(-1, 10, 16, 30), -0.2); near(capKnots(2, 10, 16, 30), 30.5);
});

test('kit: partTops — eaves ignore towers and chimneys; ridge ≥ eaves; top covers the spire', () => {
  const Kit = K();
  const cath = Kit.design('cathedral', 1000, 1000, 0, { wealth: 0.9, seed: 7 });
  cath.y = 50; cath.y0 = 48.5;
  const T = Kit._pure.partTops(parts(Kit, cath));
  assert(T.eav > 8 && T.eav < 40, 'cathedral eaves ~ nave height, got ' + T.eav);
  assert(T.rdg >= T.eav && T.top > T.rdg, `knots ordered ${T.eav} ${T.rdg} ${T.top}`);
  const cot = Kit.design('cottage', 10, 10, 0, { wealth: 0.2, seed: 3 }); cot.y = 5; cot.y0 = 3.5;
  const C = Kit._pure.partTops(parts(Kit, cot));
  assert(C.eav > 2 && C.eav < 3.2, 'cottage eaves ≈ storey height, got ' + C.eav);
  const cap = Kit.capFor(cath, 0.5), capNone = Kit.capFor(cath, undefined);
  assert(cap > 50 && cap < 50 + T.eav, 'mid-climb cap is between footings and eaves: ' + cap);
  eq(capNone, 1e7, 'no progress = complete');
});

test('kit: lifeOf — an undated, complete, un-staged record is the legacy iLife (die, 0, 1e7, 0)', () => {
  const Kit = K(), a = new Float32Array(4);
  const rec = Kit.design('cottage', 10, 10, 0, { seed: 5 });
  Kit._pure.lifeOf(rec, a, 0); eq(Array.from(a), [0, 0, 1e7, 0]);
  rec.die = 12.5; rec.year = 1142.25; rec._fe = 33; rec.y = 4;
  Kit._pure.lifeOf(rec, a, 0);
  near(a[0], 12.5); near(a[1], 1142.25, 1e-3); eq(a[2], 1e7); near(a[3], 33);
  rec.prog = 0; Kit._pure.lifeOf(rec, a, 0); near(a[2], 4 - 0.2, 1e-5, 'pegs: cap just below the ground');
});

test('kit: design copies year / gw only when given; undated records keep exactly their old fields', () => {
  const Kit = K();
  const a = Kit.design('church', 100, 200, 0.3, { seed: 11, wealth: 0.5 });
  const b = Kit.design('church', 100, 200, 0.3, { seed: 11, wealth: 0.5, year: 1150, gw: 4 });
  assert(!('year' in a) && !('gw' in a), 'no new keys on legacy designs');
  eq(b.year, 1150); eq(b.gw, 4);
  const { year, gw, ...rest } = b; eq(rest, a, 'everything else identical');
  const ws = Kit.design('worksite', 1, 2, 0, { target: a });
  eq(ws.kind, 'worksite'); assert(ws.target === a, 'worksite keeps its target');
});

test('kit: dated thatch starts fresh but the RNG sequence (every other colour, every part) is unchanged', () => {
  const Kit = K();
  let checked = 0;
  for (let s = 1; s < 60 && checked < 3; s++) {
    const o = { seed: s, wealth: 0.1, age: 0.9, region: 0 };
    const a = Kit.design('cottage', 50, 50, 0, o), b = Kit.design('cottage', 50, 50, 0, Object.assign({ year: 1200 }, o));
    a.y = b.y = 3; a.y0 = b.y0 = 1.5;
    const pa = parts(Kit, a), pb = parts(Kit, b);
    eq(pa.length, pb.length, 'same part count');
    let roofDiff = 0;
    for (let o2 = 0; o2 < pa.length; o2 += PSTR) {
      const isRoof = Kit._geos[pa[o2]].mat === 1;
      for (let k = 0; k < PSTR; k++) {
        if (pa[o2 + k] === pb[o2 + k]) continue;
        assert(isRoof && k >= 10 && k <= 12, `only roof colours may differ (part ${gname(Kit, pa[o2])} field ${k})`);
        roofDiff++;
      }
    }
    if (roofDiff) checked++;
  }
  assert(checked >= 1, 'found thatched cottages whose old-thatch colour was dropped');
});

test('kit: every house storey and gable carries FRAMESTAGE; house roofs carry LATE', () => {
  const Kit = K(), F = Kit.F;
  for (const kind of ['cottage', 'stonehouse', 'timberhouse', 'barn']) {
    const r = Kit.design(kind, 0, 0, 0, { seed: 21 }); r.y = 1; r.y0 = -0.5;
    const P = parts(Kit, r); let bodies = 0, roofs = 0;
    for (let o = 0; o < P.length; o += PSTR) {
      const n = gname(Kit, P[o]), fl = P[o + 17];
      if (n === 'gwall' && fl & F.GABLE && fl & F.FRAMESTAGE) bodies++;
      if ((n === 'roofG' || n === 'roofT') && fl & F.LATE) roofs++;
      if (n === 'body' && fl & F.FRAMESTAGE) bodies++;
    }
    assert(bodies >= 1, kind + ' has staged walls'); assert(roofs >= 1, kind + ' has a late roof');
  }
  eq([F.SCAFF, F.RIDE, F.PEG, F.LATE, F.FRAMEOLD], [1 << 17, 1 << 18, 1 << 19, 1 << 20, 1 << 21]);
  assert(F.FRAMEOLD * 2 < (1 << 24), 'float-exact flags');
});

// v44 set FRAMESTAGE (the 2.2 s timber skeleton on every animated reveal) only on framed timber storeys / gables;
// FRAMEOLD must match that exactly so undated houses reveal as before (checked part-for-part against the v44
// kit.js over every catalogue kind while fixing the review; this keeps the rule)
test('kit: FRAMEOLD only on framed timber (the v44 legacy skeleton), always with FRAMESTAGE', () => {
  const Kit = K(), F = Kit.F;
  let old = 0;
  for (const kind of ['cottage', 'barn', 'stonehouse', 'timberhouse', 'tavern', 'shop', 'stable', 'shed']) {
    for (let s = 1; s < 12; s++) {
      const r = Kit.design(kind, 0, 0, 0, { seed: s, wealth: s / 12 }); r.y = 1; r.y0 = -0.5;
      const P = parts(Kit, r);
      for (let o = 0; o < P.length; o += PSTR) {
        const fl = P[o + 17];
        if (!(fl & F.FRAMEOLD)) continue;
        old++;
        assert(fl & F.FRAMESTAGE, 'FRAMEOLD implies FRAMESTAGE');
        assert(kind !== 'cottage' && kind !== 'barn' && kind !== 'stable' && kind !== 'shed', kind + ' is not framed: no legacy skeleton');
      }
    }
  }
  assert(old > 0, 'framed timber houses keep the legacy skeleton');
});

test('kit: worksite wraps the cathedral — scaffold (SCAFF), a riding crane + wheel (RIDE), pegs (PEG), capped count', () => {
  const Kit = K(), F = Kit.F;
  const cath = Kit.design('cathedral', 3000, 3000, 0.4, { wealth: 0.9, seed: 9 }); cath.y = 20; cath.y0 = 18.5;
  const ws = Kit.design('worksite', cath.x, cath.z, cath.rot, { target: cath }); ws.y = cath.y; ws.y0 = cath.y0;
  const P = parts(Kit, ws); const n = { scaffold: 0, craneT: 0, wheel: 0, peg: 0, other: 0 };
  for (let o = 0; o < P.length; o += PSTR) {
    const g = gname(Kit, P[o]), fl = P[o + 17];
    if (g === 'scaffold') { n.scaffold++; assert(fl & F.SCAFF, 'scaffold flagged'); assert(P[o + 5] > 2 && P[o + 5] < 12, 'tier height ' + P[o + 5]); }
    else if (g === 'craneT') { n.craneT++; assert(fl & F.RIDE, 'crane rides'); }
    else if (g === 'wheel') { n.wheel++; assert(fl & F.RIDE, 'wheel rides'); assert(P[o + 15] > 1, 'wheel lifted above the cap (iParams.w)'); }
    else if (fl & F.PEG) n.peg++;
    else { n.other++; assert(fl & F.SCAFF, 'heap / stack never squash with the cap'); }
  }
  assert(n.scaffold > 40 && n.scaffold <= 1100, 'scaffold bays: ' + n.scaffold);
  eq([n.craneT, n.wheel], [1, 1]); assert(n.peg >= 8, 'pegs + lines: ' + n.peg);
  // bridge site
  const site = { x: 500, z: 500, y: 10, rot: 0.2, len: 80, piers: [{ x: 480, z: 495, yBase: 2, yTop: 9 }, { x: 505, z: 501, yBase: 1, yTop: 9 }] };
  const bw = Kit.design('worksite', site.x, site.z, site.rot, { site }); bw.y = 10; bw.y0 = 0;
  const B = parts(Kit, bw); let sc = 0, cr = 0;
  for (let o = 0; o < B.length; o += PSTR) { const g = gname(Kit, B[o]); if (g === 'scaffold') sc++; if (g === 'craneT') cr++; }
  assert(sc >= 4 && cr === 1, `bridge pier tower ${sc} bays, ${cr} crane`);
});

test('kit (real three r137): iLife follows setBuild / setYear / staggered sink, and a full tile rebuild reproduces it', () => {
  if (!globalThis.THREE) (0, eval)(Deno.readTextFileSync(new URL('../../lib/three.min.js', import.meta.url)));
  const D = load(['js/core.js', 'js/kit.js'], { THREE: globalThis.THREE }), Kit = D.Kit;
  Kit.init(new globalThis.THREE.Scene());
  const rec = Kit.design('cathedral', 2100, 2100, 0.2, { wealth: 0.8, seed: 5 }); rec.y = 30; rec.y0 = 28.5; rec.born = -10;
  Kit.add(rec); Kit.update(0.1);
  const T = Kit._tiles[rec._tile];
  const snapLife = () => { const out = []; const P = rec._parts; for (let k = 0, o = 0; o < P.length; k++, o += PSTR) { const M = T.meshes[P[o]], i = rec._slots[k] * 4; out.push(Array.from(M.iL.array.slice(i, i + 4))); } return out; };
  eq(snapLife()[0], [0, 0, 1e7, 0], 'legacy iLife');
  Kit.setBuild(rec, 0.5); Kit.update(0.1);
  const cap = Kit.capFor(rec, 0.5); const L1 = snapLife();
  assert(L1.every(v => Math.abs(v[2] - cap) < 1e-3), 'every part carries the cap');
  Kit.setYear(rec, 1150); Kit.update(0.1);
  const L2 = snapLife(); assert(L2.every(v => Math.abs(v[1] - 1150) < 1e-3 && Math.abs(v[2] - cap) < 1e-3), 'year written, cap kept');
  T.full = true; T.last = -1; Kit.update(0.1);               // full rebuild from rec fields only
  eq(snapLife(), L2, 'a full tile rebuild reproduces iLife');
  Kit.setBuild(rec, undefined); Kit.update(0.1); assert(snapLife().every(v => v[2] === 1e7), 'complete again');
  Kit.remove(rec, true, { stagger: 2.5 }); Kit.update(0.01);
  const dies = snapLife().map(v => v[0]);
  const lo = Math.min(...dies), hi = Math.max(...dies);
  assert(lo > 0 && hi - lo > 1.5 && hi - lo <= 2.5 + 1e-3, `staggered: ${lo}..${hi}`);
  assert(!Kit.has(rec), 'sinking is not live');
});

test('kit (real three r137): a year flip on old thatch defers the recipe to the tile rebuild; full rebuilds are frame-budgeted', () => {
  if (!globalThis.THREE) (0, eval)(Deno.readTextFileSync(new URL('../../lib/three.min.js', import.meta.url)));
  const D = load(['js/core.js', 'js/kit.js'], { THREE: globalThis.THREE }), Kit = D.Kit;
  Kit.init(new globalThis.THREE.Scene());
  const recs = [];
  for (let i = 0; i < 400; i++) {                              // spread over many tiles
    const r = Kit.design('cottage', 300 + (i % 20) * 900, 300 + Math.floor(i / 20) * 900, 0, { seed: i + 1, wealth: 0.1, age: 0.9, region: 0 });
    r.y = 5; r.y0 = 3.5; r.born = -10; Kit.add(r); recs.push(r);
  }
  Kit.update(0.1);
  const tho = recs.filter(r => r._tho);
  assert(tho.length > 5, 'some old-thatch cottages: ' + tho.length);
  const roofOld = tho.map(r => Array.from(r._parts));
  for (const r of recs) Kit.setYear(r, 1200);
  assert(tho.every(r => r._parts === null), 'no synchronous recipe on the flip');
  assert(recs.filter(r => !r._tho).every(r => r._parts), 'other records keep their parts (fast iLife path)');
  const fullN = () => Kit._tiles.filter(T => T.full).length;
  const f0 = fullN(); assert(f0 > 1, 'several tiles dirty: ' + f0);
  let frames = 0;
  while (fullN() && frames < 400) { Kit.clock += 0.1; Kit.update(0.1); frames++; }
  eq(fullN(), 0, 'every tile rebuilt within ' + frames + ' frames');
  assert(tho.every(r => r._parts && r._gen === Kit._tiles[r._tile].gen), 'rebuilt parts are live');
  assert(tho.some((r, i) => r._parts.some((v, k) => v !== roofOld[i][k])), 'dated thatch re-derived (colour changed)');
});

// ---- works lifecycle (stubs) ---------------------------------------------------------------------------------------------
function world(opts = {}) {
  const D = load(['js/core.js', 'js/works.js']);
  const W = D.Works;
  const towns = opts.towns || [
    { sid: 1, uid: 'u-a', type: 1, name: 'Crowfield', grow: true, fy: 1000, houses: 200, wealth: 0.7, x: 1000, z: 1000, ms: 1, keep: null },
    { sid: 2, uid: 'u-b', type: 3, name: 'Wexcombe Castle', grow: true, fy: 1000, houses: 5, wealth: 0.4, x: 5000, z: 5000, ms: 0, keep: 'motte' }
  ];
  const calls = { requestWork: [], redecorate: [], setBuild: [], add: [], remove: [], bridge: [] };
  const recs = new Map();                                      // wid -> live target rec
  D.Town = { hist: {
    list: () => towns, byUid: uid => (towns.find(t => t.uid === uid) || { sid: 0 }).sid,
    workSite: (uid, wid) => ({ key: uid + ':w' + wid, x: 1010, z: 1020, rot: 0, w: 30, d: 70, y: 5 }),
    requestWork: (sid, o) => { calls.requestWork.push([sid, o]); recs.set(o.wid, { kind: 'cathedral', x: 1010, z: 1020, rot: 0, y: 5, y0: 3.5, gw: o.wid, seed: 3 }); return 7; },
    redecorate: uid => calls.redecorate.push(uid),
    forWork: (uid, wid, fn) => { const r = recs.get(wid); if (r) fn(r); }
  } };
  const S = D.Story = { started: true, committing: false, catchingUp: false, replaying: false, q: 1086 * 4, t: 1086,
    time() { return this.t; }, displayTime() { return this.t; }, year() { return this.q >> 2; }, register() {} };
  D.Kit = { clock: 100, setBuild(r, p) { calls.setBuild.push([r.kind, p]); if (p === undefined) delete r.prog; else r.prog = p; },
    design(kind, x, z, rot, o) { return { kind, x, z, rot, target: o.target, site: o.site }; }, add(r) { calls.add.push(r.kind); }, remove(r, s) { calls.remove.push([r.kind, !!s]); } };
  D.Roads = { segAt: (x, z) => ({ id: 42 }), wetRuns: id => [{ d0: 10, d1: 90, len: 80, x: 700, z: 700 }], setBridgeWork: (id, o) => calls.bridge.push([id, o]),
    bridgeWorkSite: id => ({ x: 700, z: 700, y: 12, rot: 0, len: 80, piers: [{ x: 690, z: 700, yBase: 2, yTop: 11 }] }) };
  const logs = [], events = [];
  D.on('works:done', e => events.push(['done', e])); D.on('bells', e => events.push(['bells', e]));
  W.init();
  W._part.update(0.1);                                          // frames run before the first commit (load re-derive)
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      S.q++; S.t = S.q / 4; S.committing = true;
      let marks = 0;
      const ctx = { q: S.q, year: S.q >> 2, season: S.q & 3, yf: S.q / 4, first: false, catchUp: false, branch: 0,
        rng: salt => D.rng(D.hash32(1, S.q, 0, salt)), timeLeft: () => 12, log: e => logs.push(Object.assign({ y: S.q >> 2 }, e)), mark: () => marks++ };
      W._part.season(ctx);
      S.committing = false;
      W._part.update(0.6);
    }
  };
  return { D, W, S, step, logs, events, calls, towns, recs };
}

test('works: pure progress / stages / bridge stages', () => {
  const { W } = world(), P = W._pure;
  near(P.progAt({ y0: 1100, dur: 50 }, 1125), 0.5); eq(P.progAt({ y0: 1100, dur: 50 }, 1000), 0); eq(P.progAt({ y0: 1100, dur: 50 }, 1200), 1);
  eq(P.stagesCrossed(0, 0.5).map(s => s[1]), [1, 2]); eq(P.stagesCrossed(1 | 2, 0.9).map(s => s[1]), [4]); eq(P.stagesCrossed(7, 1), []);
  let prev = -1; const n = 4;
  for (let p = 0; p <= 1; p += 0.001) { const st = P.bridgeStage(p, n); assert(st >= prev && st <= 2 * n, 'monotone, ≤ 2n'); prev = st; }
  eq(P.bridgeStage(0, 4), 0); eq(P.bridgeStage(1, 4), 8); eq(P.bridgeStage(0.999, 4), 8);
  for (let i = 0; i < 20; i++) { const d = P.durFor('cathedral', true, i / 19); assert(d >= 50 && d <= 70); }
  const b = P.durFor('bridge', false, 0.5); assert(b >= 4 && b <= 8);
});

test('works: eligibility rules (cathedral size / wealth / age / spacing; keep motte + wealth or rich town)', () => {
  const { W } = world(), P = W._pure;
  const town = { uid: 'x', type: 1, grow: true, houses: 150, wealth: 0.65, fy: 1100, x: 0, z: 0, ms: 0 };
  assert(P.cathedralOk(town, 1140, [town], []), 'eligible');
  assert(!P.cathedralOk(Object.assign({}, town, { houses: 100 }), 1140, [], []), 'too small');
  assert(!P.cathedralOk(Object.assign({}, town, { wealth: 0.5 }), 1140, [], []), 'too poor');
  assert(!P.cathedralOk(town, 1120, [], []), 'too young');
  assert(P.cathedralOk(Object.assign({}, town, { fy: 0 }), 1120, [], []), 'unknown age is fine');
  assert(!P.cathedralOk(town, 1140, [{ ms: 128, x: 3000, z: 0 }], []), 'legacy cathedral within 7 km');
  assert(!P.cathedralOk(town, 1140, [], [{ kind: 'cathedral', x: 0, z: 6000 }]), 'cathedral work within 7 km');
  assert(!P.cathedralOk(Object.assign({}, town, { grow: false }), 1140, [], []), 'grow off');
  const castle = { uid: 'c', type: 3, keep: 'motte', wealth: 0.1, x: 0, z: 0 };
  assert(!P.keepOk(castle, [], []), 'poor castle, no town');
  assert(P.keepOk(castle, [{ type: 1, houses: 70, wealth: 0.6, x: 2000, z: 0 }], []), 'rich town within 3 km');
  assert(P.keepOk(Object.assign({}, castle, { wealth: 0.35 }), [], []), 'rich castle');
  assert(!P.keepOk(Object.assign({}, castle, { keep: 'keep' }), [], []), 'already a keep');
  assert(!P.greatOk([{ great: true, y0: 1135, done: 0 }], 1140), 'within 8 years of the last great start');
  assert(!P.greatOk([1, 2, 3].map(i => ({ great: true, y0: 1000 + i, done: 0 })), 1140), '≤ 3 active');
});

test('works: a cathedral starts, climbs with a worksite, logs each stage once and is consecrated with bells', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 1; w.D.TUNE.works.pKeep = 0;
  w.step(4);                                                    // Summer → Spring 1087 (q 4348)
  eq(w.calls.requestWork.length, 1, 'requested the site');
  const L = w.W.list(); eq(L.length, 1); eq(L[0].kind, 'cathedral'); eq(L[0].name, 'Crowfield Cathedral');
  assert(L[0].dur >= 50 && L[0].dur <= 70);
  assert(w.logs.some(e => e.k === 'work0'), 'start logged');
  assert(w.calls.add.includes('worksite'), 'worksite raised round the target');
  const rec = w.recs.get(L[0].wid); assert(rec.prog !== undefined && rec.prog < 0.02, 'target set to its progress');
  w.step(4 * 30);
  assert(rec.prog > 0.4 && rec.prog < 0.61, 'climbing: ' + rec.prog);
  w.step(4 * 45);
  const stages = w.logs.filter(e => e.k === 'workS').map(e => e.imp);
  eq(stages, [2, 1, 2], 'foundations (2), half-high (1), roofed (2) — once each');
  const done = w.logs.find(e => e.k === 'work1');
  assert(done && done.imp === 3 && /Crowfield Cathedral is consecrated, after \d+ years\./.test(done.txt), 'headline: ' + (done && done.txt));
  assert(rec.prog === undefined, 'complete');
  assert(w.calls.remove.some(([k, s]) => k === 'worksite' && s), 'scaffolding comes down (sink)');
  eq(w.events.map(e => e[0]), ['done', 'bells']);
  eq(w.logs.filter(e => e.k === 'work0').length, 1, 'no second cathedral within 7 km');
  eq(w.W.progOf(L[0].wid), undefined);
});

test('works: keep start bumps ver(uid), asks for a wave, and workAt reports it; caps and spacing hold', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 0; w.D.TUNE.works.pKeep = 1;
  eq(w.W.ver('u-b'), 0); eq(w.W.workAt('u-b', 'keep'), null);
  w.step(4);
  const k = w.W.workAt('u-b', 'keep');
  assert(k && k.wid > 0 && (k.var === 0 || k.var === 1) && k.prog < 0.05, 'keep work ' + JSON.stringify(k));
  eq(w.W.ver('u-b'), k.wid); eq(w.calls.redecorate, ['u-b']);
  w.towns.push({ sid: 3, uid: 'u-c', type: 3, name: 'Holt Castle', wealth: 0.5, x: 9000, z: 9000, keep: 'motte' });
  w.step(4 * 5);
  eq(w.W.list().filter(x => x.kind === 'keep').length, 1, '≥ 8 years between great starts');
  w.step(4 * 4);
  eq(w.W.list().filter(x => x.kind === 'keep').length, 2, 'second keep after the gap');
});

test('works: snapshot / restore and save round-trips are exact; restore re-derives (keeps redecorated)', () => {
  const w = world();
  w.D.TUNE.works.pKeep = 1; w.D.TUNE.works.pCathedral = 1;
  w.step(4 * 12);
  const s0 = JSON.stringify(w.W._part.snap());
  const ser = JSON.parse(JSON.stringify(w.W._part.serialize()));
  w.step(4 * 20);
  assert(JSON.stringify(w.W._part.snap()) !== s0, 'state moved on');
  w.W._part.restore(JSON.parse(s0));
  eq(JSON.stringify(w.W._part.snap()), s0, 'restore is exact');
  w.calls.redecorate.length = 0;
  w.W._part.update(0.1);
  w.W._part.deserialize(ser);
  eq(JSON.stringify(w.W._part.serialize()), JSON.stringify(ser), 'serialize round-trip');
  w.W._part.update(0.1);
  assert(w.calls.redecorate.includes('u-b'), 'loaded keep works trigger a decoration wave');
  w.W._part.deserialize(null); eq(w.W.list(), []); eq(w.W.ver('u-b'), 0);
});

test('works: undoing a keep start (restore) asks for the motte back; worksites are dropped and re-derived', () => {
  const w = world();
  w.D.TUNE.works.pKeep = 1; w.D.TUNE.works.pCathedral = 1;
  w.step(3);                                                    // up to Winter 1086: nothing started yet
  const before = JSON.parse(JSON.stringify(w.W._part.snap()));
  w.step(1);                                                    // Spring 1087: the cathedral and the keep compete; one starts
  w.step(4 * 9); w.step(4);                                     // ≥ 8 years later the other one
  assert(w.W.ver('u-b') > 0, 'keep started');
  w.calls.redecorate.length = 0; const removed = w.calls.remove.length;
  w.W._part.restore(before); w.W._part.update(0.1);
  eq(w.W.ver('u-b'), 0); assert(w.calls.redecorate.includes('u-b'), 'the castle is redecorated back to its motte');
  assert(w.calls.remove.length > removed, 'derived worksites dropped');
});

test('works: deterministic — same seeds, same history', () => {
  const run = () => { const w = world(); w.D.TUNE.works.pKeep = 0.15; w.D.TUNE.works.pCathedral = 0.12; w.step(4 * 80); return JSON.stringify(w.W._part.serialize()) + JSON.stringify(w.logs); };
  eq(run(), run());
});

test('works: requestBridge only inside a commit; stages the seg, raises a pier worksite, finishes with bells if great', () => {
  const w = world({ towns: [] });
  eq(w.W.requestBridge([42], { wetLen: 80, x: 700, z: 700 }), 0, 'refused outside a commit');
  w.S.committing = true;
  const wid = w.W.requestBridge([42], { wetLen: 80, x: 700, z: 700 });
  w.S.committing = false;
  assert(wid > 0, 'accepted');
  eq(w.calls.bridge[0], [42, { st: 0, n: 1 }], 'timber deck stays, stage 0 set at once');
  const b = w.W.list()[0]; eq(b.great, true, 'a wet run ≥ 60 m is a great bridge'); assert(b.dur >= 12 && b.dur <= 20);
  w.step(1);
  assert(w.logs.some(e => e.k === 'work0' && e.wid === wid), 'start logged in the works season');
  assert(w.calls.add.includes('worksite'), 'pier worksite');
  w.step(4 * 21);
  const sts = w.calls.bridge.filter(c => c[1]).map(c => c[1].st);
  eq(sts, [0, 1, 2], 'pier, arch, deck stages in order');
  eq(w.calls.bridge[w.calls.bridge.length - 1], [42, null], 'gw removed at completion');
  assert(w.events.some(e => e[0] === 'bells'), 'great bridge bells');
  w.S.committing = true;
  eq(w.W.requestBridge([42], { wetLen: 20 }), 0, 'short wet runs keep today\'s humpback');
  const o1 = w.W.requestBridge([42], { wetLen: 40, x: 700, z: 700 });
  assert(o1 > 0 && !w.W.list().find(x => x.wid === o1).great, 'ordinary bridge (< 60 m, no town)');
  w.S.committing = false;
});

test('works: a crossing split over several segs is one work; every seg is staged, cleared, replayed and saved', () => {
  const w = world({ towns: [] });
  // three segs meet at mid-river nodes: 42 (longest run, 2 piers), 43 (1 pier), 44 (3 piers); segAt by position
  const SEGS = { 42: { x: 700, z: 700, len: 50, piers: 2 }, 43: { x: 760, z: 700, len: 20, piers: 1 }, 44: { x: 640, z: 700, len: 30, piers: 3 } };
  const R = w.D.Roads;
  R.segAt = (x, z) => { for (const id in SEGS) if (Math.hypot(SEGS[id].x - x, SEGS[id].z - z) < 5) return { id: +id }; return null; };
  R.wetRuns = id => { const s = SEGS[id]; return s ? [{ d0: 0, d1: s.len, len: s.len, x: s.x, z: s.z }] : []; };
  R.bridgeWorkSite = id => { const s = SEGS[id]; return s ? { x: s.x, z: s.z, y: 12, rot: 0, len: s.len, piers: Array.from({ length: s.piers }, (_, i) => ({ x: s.x + i, z: s.z, yBase: 2, yTop: 11 })) } : null; };
  const staged = () => { const m = new Map(); for (const [id, o] of w.calls.bridge) m.set(id, o); return m; };
  w.S.committing = true;
  const wid = w.W.requestBridge([43, 42, 44], { wetLen: 100, x: 700, z: 700 });
  eq(w.W.requestBridge([44], { wetLen: 100, x: 640, z: 700 }), wid, 'a request touching a seg under works is the same work');
  w.S.committing = false;
  assert(wid > 0, 'accepted');
  eq(w.W.list().length, 1, 'one work for the whole crossing');
  const b = w.W.list()[0];
  eq(b.seg, { mx: 700, mz: 700 }, 'seg = the longest run (save-compatible)'); eq(b.n, 2);
  eq(b.segs.map(e => [e.mx, e.n]), [[700, 2], [640, 3], [760, 1]], 'every seg, longest first, each with its own pier count');
  let m = staged();
  eq([42, 43, 44].map(id => m.get(id)), [{ st: 0, n: 2 }, { st: 0, n: 1 }, { st: 0, n: 3 }], 'all segs staged at once (none pops finished)');
  w.step(1);
  // replay to before the start clears every seg; the present restages every seg
  const nb = w.calls.bridge.length;
  w.S.replaying = true; w.S.displayTime = () => b.y0 - 1; w.D.emit('story:view', {}); w.W._part.update(0.6);
  eq(w.calls.bridge.slice(nb).map(c => c[0]).sort(), [42, 43, 44], 'replay clears every seg');
  assert(w.calls.bridge.slice(nb).every(c => c[1] === null));
  w.S.displayTime = function () { return this.t; }; w.S.replaying = false; w.D.emit('story:view', {}); w.W._part.update(0.6);
  m = staged(); assert([42, 43, 44].every(id => m.get(id) && m.get(id).st >= 0), 'every seg restaged at the present');
  // save round-trip keeps the list; an old save (seg only) still stages its one seg
  const ser = JSON.parse(JSON.stringify(w.W._part.serialize()));
  w.W._part.deserialize(ser); eq(JSON.stringify(w.W._part.serialize()), JSON.stringify(ser), 'segs survive serialize');
  w.W._part.update(0.6);
  m = staged(); assert([42, 43, 44].every(id => m.get(id) && m.get(id).st >= 0), 'restaged after load');
  // mid-build: the piers of every seg progress; at the end all three are handed back
  w.step(4 * 5);
  m = staged(); assert(m.get(44) && m.get(44).st > 0 && m.get(44).n === 3, 'seg 44 climbs on its own 3 piers');
  w.step(4 * 20);
  assert(w.W.list()[0].done, 'finished');
  m = staged(); eq([42, 43, 44].map(id => m.get(id)), [null, null, null], 'gw removed on every seg at completion');
  // an old save: seg only, no segs list
  const old = { v: 1, nextWid: 9, list: [{ wid: 8, kind: 'bridge', uid: 0, key: null, x: 700, z: 700, y0: w.S.t, dur: 10, done: 0, great: false, seg: { mx: 700, mz: 700 }, name: 'the new stone bridge', lg: 0, n: 2 }] };
  w.calls.bridge.length = 0;
  w.W._part.deserialize(old); w.W._part.update(0.6);
  eq(w.calls.bridge, [[42, { st: 0, n: 2 }]], 'old save: its one seg staged as before');
  eq(JSON.stringify(w.W._part.serialize().list[0].segs), undefined, 'and saved back without a segs list');
});

test('works: catch-up owes one peal, rung once at the end', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 1; w.D.TUNE.works.cathedral = [1, 1];
  w.step(4);
  // like Story: catchingUp set, then 'start'; finishCatchUp clears catchingUp BEFORE emitting 'end'
  w.S.catchingUp = true; w.D.emit('story:catchup', { phase: 'start' });
  w.step(8);
  eq(w.events.filter(e => e[0] === 'bells').length, 0, 'no bells during catch-up');
  w.S.catchingUp = false; w.D.emit('story:catchup', { phase: 'end' });
  eq(w.events.filter(e => e[0] === 'bells').length, 1, 'one peal after');
  w.W._part.update(0.6); eq(w.events.filter(e => e[0] === 'bells').length, 1, 'and no second one');
});

test('works: a great work finishing in the LAST catch-up frame still gives exactly one peal', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 1; w.D.TUNE.works.cathedral = [1, 1]; w.D.TUNE.works.pKeep = 0;
  w.step(4);                                                    // Spring 1087: the cathedral starts (1 year)
  w.S.catchingUp = true; w.D.emit('story:catchup', { phase: 'start' });
  // Story.update order: parts' update() first, then catchUpTick() commits the seasons and ends the catch-up
  let n = 0;
  while (!w.W.list()[0].done && n++ < 12) {
    w.W._part.update(0.6);
    w.S.q++; w.S.t = w.S.q / 4; w.S.committing = true;
    const ctx = { q: w.S.q, year: w.S.q >> 2, season: w.S.q & 3, yf: w.S.q / 4, first: false, catchUp: true, branch: 0,
      rng: salt => w.D.rng(w.D.hash32(1, w.S.q, 0, salt)), timeLeft: () => 12, log: () => {}, mark: () => {} };
    w.W._part.season(ctx); w.S.committing = false;
  }
  assert(w.W.list()[0].done, 'finished during the catch-up');
  w.S.catchingUp = false; w.D.emit('story:catchup', { phase: 'end' });   // same tick as the completing commit
  eq(w.events.filter(e => e[0] === 'bells').length, 1, 'the owed peal rings at the end');
  w.W._part.update(0.6); w.W._part.update(0.6);
  eq(w.events.filter(e => e[0] === 'bells').length, 1, 'no second peal on the next frame');
});

test('works: a load / new world mid catch-up (no "end" event) never holds later bells', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 1; w.D.TUNE.works.cathedral = [1, 1]; w.D.TUNE.works.pKeep = 0;
  w.S.catchingUp = true; w.D.emit('story:catchup', { phase: 'start' });
  w.W._part.deserialize(null); w.S.catchingUp = false;           // Story.reset / deserialize: freshState, no 'end'
  w.step(1 + 8);
  eq(w.events.filter(e => e[0] === 'bells').length, 1, 'bells ring live after the load');
});

test('works: replay to before a work began shows no worksite, no bridge stage; the present restores them', () => {
  const w = world();
  w.D.TUNE.works.pCathedral = 1; w.D.TUNE.works.pKeep = 0;
  w.step(4 * 3);
  w.S.committing = true; w.W.requestBridge([42], { wetLen: 80, x: 700, z: 700 }); w.S.committing = false;
  w.step(4 * 2);
  const L = w.W.list(), cath = L.find(x => x.kind === 'cathedral'), br = L.find(x => x.kind === 'bridge');
  const rec = w.recs.get(cath.wid);
  assert(rec.prog > 0, 'climbing');
  const removed = w.calls.remove.length, nb = w.calls.bridge.length;
  w.S.replaying = true; w.S.displayTime = () => cath.y0 - 1; w.D.emit('story:view', {}); w.W._part.update(0.6);
  eq(rec.prog, 0, 'the cathedral is held unseen');
  assert(w.calls.remove.length >= removed + 2, 'both worksites dropped');
  eq(w.calls.bridge.slice(nb), [[42, null]], 'bridge stage cleared (the lane as it was)');
  const adds = w.calls.add.length;
  w.S.displayTime = function () { return this.t; }; w.S.replaying = false; w.D.emit('story:view', {}); w.W._part.update(0.6);
  assert(rec.prog > 0, 'climbing again at the present');
  eq(w.calls.add.length, adds + 2, 'worksites re-raised');
  eq(w.calls.bridge[w.calls.bridge.length - 1][1].st >= 0, true, 'bridge restaged');
  assert(!br.done);
});

// ---- bells --------------------------------------------------------------------------------------------------------------
test('audio: the bell strike is finite and non-silent; the peal is rounds on eight then five tolls', () => {
  const D = load(['js/core.js', 'js/audio.js']);
  const { bellStrike, pealSchedule, strikeParams } = D.Audio._pure;
  const b = bellStrike(22050, 4, D.rng(3));
  let rms = 0, bad = 0, pk = 0;
  for (const v of b) { if (!isFinite(v)) bad++; rms += v * v; pk = Math.max(pk, Math.abs(v)); }
  rms = Math.sqrt(rms / b.length);
  eq(bad, 0); assert(rms > 0.02, 'audible: rms ' + rms); assert(pk <= 0.9001, 'normalised');
  let late = 0; for (let i = b.length - 2000; i < b.length; i++) late = Math.max(late, Math.abs(b[i])); assert(late < 0.05, 'fades to silence');
  const s = pealSchedule();
  eq(s.length, 3 * 8 + 5);
  for (let i = 1; i < s.length; i++) assert(s[i][0] > s[i - 1][0], 'strictly increasing times');
  eq(s.slice(0, 8).map(e => e[1]), [2, 15 / 8, 5 / 3, 3 / 2, 4 / 3, 5 / 4, 9 / 8, 1], 'treble to tenor');
  near(s[16][0] - s[15][0], 0.56, 1e-9, 'handstroke gap before the third row');
  assert(s.slice(24).every(e => e[1] === 1), 'tenor tolls');
  const n = strikeParams(100), f = strikeParams(6000);
  assert(n.gain > f.gain && n.lp > f.lp && n.delay < f.delay && f.delay <= 4 && f.gain >= 0.05, 'distance dulls, quietens and delays');
});
