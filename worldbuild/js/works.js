/* Diorama — Living History: great works. Cathedrals rise on a new site beside a rich old town, castle mottes are
   rebuilt as stone keeps in place, and long river crossings on busy roads get stone bridges built pier by pier.
   A Story part (order 30, after the director and the wayfarer): works START and FINISH only inside season commits
   (their list lives in the Story snapshot, so undo turns them back with everything else); everything you SEE —
   the climbing cap (Kit.setBuild), the scaffolding / crane / pegs worksite, the bridge stage, the bells — is
   presentation derived from that list and the display year, re-derived after undo, load and replay scrubs.
   Contract: master spec §3.8, §5.10, §6 D. Optional: without this file gw records render complete, the keep
   follows wealth, lane upgrades pop stone bridges and no bells ring. */
(function () {
'use strict';
const D = window.D;
const clamp = D.clamp || ((v, a, b) => v < a ? a : v > b ? b : v);

// ---- tuning (D.TUNE.works; §8) ----------------------------------------------------------------------------
D.TUNE = D.TUNE || {};
const TUNE = D.TUNE.works = Object.assign({
  cathedral: [50, 70], keep: [15, 25], bridge: [12, 20], bridgeOrd: [4, 8],    // durations, years
  pCathedral: 0.12, pKeep: 0.15,                     // chance per eligible place per year (checked in Spring)
  greatGap: 8, greatActive: 3, greatTotal: 12, ordActive: 3,
  cathHouses: 140, cathWealth: 0.6, cathAge: 30, cathSpacing: 7000, cathCells: 45,
  keepWealth: 0.3, keepTownHouses: 60, keepTownWealth: 0.5, keepTownDist: 3000, keepRound: 0.35,
  bridgeMinWet: 30, bridgeGreatWet: 60, bridgeTownHouses: 60, bridgeTownDist: 2000
}, D.TUNE.works || {});
const MS_CATHEDRAL = 128 | 256;                      // Town.hist.list ms bits: legacy cathedral | great work

// ---- state (snapshot / save) ------------------------------------------------------------------------------
// work: {wid, kind:'cathedral'|'keep'|'bridge', uid, key, x, z, y0, dur, done, great, seg:{mx,mz}|null,
//        name, lg (stage bits logged), var (keep), n (bridge piers),
//        segs:[{mx,mz,n}] (bridge: every seg carrying part of the merged wet run, [0] = seg; absent in older saves)}
let list = [], nextWid = 1;
// ---- presentation (never saved) ---------------------------------------------------------------------------
const pres = new Map();                              // wid -> {target, site, p, st, bs:[{id, st}] per bridge seg}
const doneQ = [];                                    // wids finished this session, awaiting sink + bells
let pendLog = [];                                    // bridge starts from requestBridge, logged by our own season()
let forceQ = [];                                     // _dev.force requests, applied at the next commit
let dirty = true, rederive = true, fresh = true, tick = 0;
let prevKeeps = new Map();                           // uid -> keep wid last seen (decoKey version diff)
let ending = false, owedPeal = null;                 // ending: inside the catch-up "end" handler (S.catchingUp is already false)

// ---- pure helpers (exported as _pure for the Deno tests) ------------------------------------------------------
function progAt(w, t) { return w.dur > 0 ? clamp((t - w.y0) / w.dur, 0, 1) : 1; }
const STAGES = [[0.04, 1, 2], [0.4, 2, 1], [0.85, 4, 2]];   // [threshold, bit, imp]
function stagesCrossed(lg, p) { const out = []; for (const s of STAGES) if (p >= s[0] && !((lg | 0) & s[1])) out.push(s); return out; }
// bridge stage at progress p: piers 0..n−1, arches n..2n−1, deck and parapets 2n
function bridgeStage(p, n) { n = Math.max(1, n | 0); return Math.min(2 * n, Math.floor(clamp(p, 0, 1) * (2 * n + 1))); }
function durFor(kind, great, r) { const R = kind === 'bridge' ? (great ? TUNE.bridge : TUNE.bridgeOrd) : TUNE[kind] || [10, 20]; return R[0] + (R[1] - R[0]) * r; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function isCathedral(S) { return ((S.ms | 0) & MS_CATHEDRAL) !== 0; }
function greatStats(works, year) {
  let active = 0, total = 0, last = -1e9, ord = 0;
  for (const w of works) {
    if (w.great) { total++; if (!w.done) active++; if (w.y0 > last) last = w.y0; }
    else if (!w.done) ord++;
  }
  return { active, total, ord, gapOk: year - last >= TUNE.greatGap };
}
function greatOk(works, year) { const g = greatStats(works, year); return g.active < TUNE.greatActive && g.total < TUNE.greatTotal && g.gapOk; }
// §3.8: type-1, grow, houses ≥ 140, wealth ≥ .6, age ≥ 30 (or unknown), no cathedral (work or legacy) within 7 km
function cathedralOk(S, year, all, works) {
  if (!S || S.type !== 1 || S.grow === false || S.hasWork) return false;
  if ((S.houses | 0) < TUNE.cathHouses || !(S.wealth >= TUNE.cathWealth)) return false;
  if (S.fy > 0 && year - S.fy < TUNE.cathAge) return false;
  for (const o of all) if (isCathedral(o) && dist(o, S) < TUNE.cathSpacing) return false;
  for (const w of works) if (w.kind === 'cathedral' && dist(w, S) < TUNE.cathSpacing) return false;
  return true;
}
// a castle whose keep is still a motte; castle wealth ≥ .3 or a rich town (≥ 60 houses, wealth ≥ .5) within 3 km
function keepOk(S, all, works) {
  if (!S || S.type !== 3 || S.keep !== 'motte') return false;
  for (const w of works) if (w.kind === 'keep' && w.uid === S.uid) return false;
  if (S.wealth >= TUNE.keepWealth) return true;
  for (const o of all) if (o.type === 1 && (o.houses | 0) >= TUNE.keepTownHouses && o.wealth >= TUNE.keepTownWealth && dist(o, S) < TUNE.keepTownDist) return true;
  return false;
}
function nearTown(all, x, z, r, minHouses) {
  let best = null, bd = r;
  for (const o of all) { if (o.type !== 1 && o.type !== 5) continue; if ((o.houses | 0) < (minHouses | 0)) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function stageText(w, bit) {
  const n = w.name;
  if (w.kind === 'cathedral') return bit === 1 ? `The foundations of ${n} are laid.` : bit === 2 ? `The walls of ${n} stand half-high.` : `${n} is roofed.`;
  if (w.kind === 'keep') return bit === 1 ? `The footings of the new keep at ${n} are laid.` : bit === 2 ? `The new keep at ${n} stands half-high.` : `The new keep at ${n} is roofed.`;
  return bit === 1 ? `The first pier of ${n} rises from the river.` : bit === 2 ? `The arches of ${n} begin to close.` : `${cap(n)} is decked in stone.`;
}
function doneText(w, year) {
  const yrs = Math.max(1, Math.round(year - w.y0));
  if (w.kind === 'cathedral') return `${w.name} is consecrated, after ${yrs} years.`;
  if (w.kind === 'keep') return `The great stone keep of ${w.name} is finished, after ${yrs} years.`;
  return `${cap(w.name)} is finished${w.great ? `, after ${yrs} years` : ''}.`;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function copyWork(w) {
  const o = Object.assign({}, w); o.seg = w.seg ? { mx: w.seg.mx, mz: w.seg.mz } : null;
  if (Array.isArray(w.segs)) o.segs = w.segs.map(e => ({ mx: e.mx, mz: e.mz, n: e.n | 0 }));
  return o;
}
// a bridge's segs (older saves: the one seg, with the work's pier count)
function segsOf(w) {
  if (Array.isArray(w.segs) && w.segs.length) return w.segs;
  return w.seg ? [{ mx: w.seg.mx, mz: w.seg.mz, n: w.n | 0 }] : [];
}

// ---- cross-module access (every call guarded) ----------------------------------------------------------------
function hist() { return D.Town && D.Town.hist ? D.Town.hist : null; }
function story() { return D.Story || null; }
function kit() { return D.Kit && D.Kit.setBuild ? D.Kit : null; }
function roads() { return D.Roads || null; }
function displayTime() {
  const S = story(); if (!S) return 0;
  try { return S.displayTime ? S.displayTime() : S.time ? S.time() : 0; } catch (e) { return 0; }
}
function safe(fn, dflt) { try { return fn(); } catch (e) { console.warn('[works]', e); return dflt; } }
function byWid(wid) { for (const w of list) if (w.wid === wid) return w; return null; }
function hidden() { return typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden'); }

// ---- season (inside the Story commit) -----------------------------------------------------------------------------
function season(ctx) {
  const H = hist(), R = roads();
  if (forceQ.length) applyForce(ctx);
  for (const e of pendLog.splice(0)) ctx.log(e);                 // bridge starts requested this commit (wayfarer, _dev)
  for (const w of list) {
    if (w.done) continue;
    if (ctx.timeLeft && ctx.timeLeft() <= 0) break;              // budget: the rest carry on next season
    // prune works whose place or road has gone (logged once, imp 1)
    if (w.kind === 'bridge') {
      const seg = R && R.segAt ? safe(() => R.segAt(w.seg.mx, w.seg.mz, 4), null) : null;
      if (R && R.segAt && !seg) { drop(w, ctx, `Work on ${w.name} is abandoned.`); continue; }
    } else if (H) {
      if (H.byUid && !safe(() => H.byUid(w.uid), 1)) { drop(w, ctx, `Work on ${w.name} is abandoned.`); continue; }
      if (w.kind === 'cathedral' && H.workSite) {
        const s = safe(() => H.workSite(w.uid, w.wid), null);
        if (s === false) { drop(w, ctx, `The masons find no room for ${w.name}; the work is abandoned.`); continue; }
        if (s && s.key && w.key !== s.key) { w.key = s.key; w.x = s.x; w.z = s.z; ctx.mark(); }
      }
    }
    const p = progAt(w, ctx.yf !== undefined ? ctx.yf : ctx.year + ctx.season / 4);
    if (w.kind !== 'bridge' || w.great) for (const s of stagesCrossed(w.lg, p)) {
      w.lg = (w.lg | 0) | s[1];
      ctx.log({ k: 'workS', imp: s[2], txt: stageText(w, s[1]), x: w.x, z: w.z, uid: w.uid || 0, wid: w.wid });
    }
    if (p >= 1) {
      w.done = ctx.year;
      ctx.log({ k: 'work1', imp: w.great ? 3 : 2, txt: doneText(w, ctx.year), x: w.x, z: w.z, uid: w.uid || 0, wid: w.wid });
      ctx.mark(); doneQ.push(w.wid);
    }
  }
  if (ctx.season === 0) tryStart(ctx);
  prevKeeps = keepMap();                                         // starts / drops asked for their own wave already
  dirty = true;
}
function drop(w, ctx, txt) {
  list = list.filter(o => o !== w);
  ctx.log({ k: 'workS', imp: 1, txt, x: w.x, z: w.z, uid: w.uid || 0, wid: w.wid });
  ctx.mark();
  if (w.kind === 'keep') { const H = hist(); if (H && H.redecorate) safe(() => H.redecorate(w.uid)); }
}
// Spring: at most one great start a year, ≥ 8 years since the last, caps §3.14
function tryStart(ctx) {
  const H = hist(); if (!H || !H.list) return;
  if (!greatOk(list, ctx.year)) return;
  const all = safe(() => H.list(), []) || [];
  const cands = [];
  for (const S of all) {
    if (cathedralOk(S, ctx.year, all, list)) cands.push(['cathedral', S, TUNE.pCathedral]);
    else if (keepOk(S, all, list)) cands.push(['keep', S, TUNE.pKeep]);
  }
  if (!cands.length) return;
  cands.sort((a, b) => (a[1].uid > b[1].uid ? 1 : a[1].uid < b[1].uid ? -1 : 0));
  const r = ctx.rng('works');
  for (const [kind, S, P] of cands) if (r() < P && start(kind, S, ctx, r)) return;
}
function start(kind, S, ctx, r, dur) {
  const H = hist(); if (!H) return false;
  const wid = nextWid;
  const w = { wid, kind, uid: S.uid, key: null, x: S.x, z: S.z, y0: ctx.yf !== undefined ? ctx.yf : ctx.year + ctx.season / 4,
    dur: dur || durFor(kind, true, r()), done: 0, great: true, seg: null, name: '', lg: 0 };
  if (kind === 'cathedral') {
    if (!H.requestWork) return false;
    const cells = D.Director && D.Director.closeLobe ? safe(() => D.Director.closeLobe(S.sid, TUNE.cathCells), null) : null;
    const job = safe(() => H.requestWork(S.sid, { work: 'cathedral', wid, cells: cells || null, instant: !!ctx.catchUp }), 0);
    if (!job) return false;
    w.name = S.name + ' Cathedral';
    nextWid++; list.push(w); ctx.mark();
    ctx.log({ k: 'work0', imp: 2, txt: `${S.name} resolves to raise a cathedral.`, x: S.x, z: S.z, uid: S.uid, wid });
  } else {
    w.name = S.name; w.var = r() < TUNE.keepRound ? 1 : 0;
    nextWid++; list.push(w);
    if (H.redecorate) safe(() => H.redecorate(S.uid));             // the motte gives way to the pegged-out keep (ver changed)
    ctx.mark();
    ctx.log({ k: 'work0', imp: 2, txt: `Masons begin a stone keep at ${S.name}.`, x: S.x, z: S.z, uid: S.uid, wid });
  }
  return true;
}
// a lane upgrade over a wet run ≥ 30 m (wayfarer, inside its Summer commit) → a stone bridge work. segIds are
// every seg carrying part of one merged wet run (a crossing split at a mid-river node): all of them are staged
// together, each at its own pier count, so no part of the crossing pops finished beside its neighbour.
function startBridge(segIds, info, force) {
  const R = roads(), S = story();
  if (!R || !R.setBridgeWork || !segIds || !segIds.length) return 0;
  info = info || {};
  const wetLen = +info.wetLen || 0;
  if (!force && wetLen < TUNE.bridgeMinWet) return 0;
  let pts = [];                                                  // one per seg: its longest wet run's midpoint
  for (const id of segIds) {
    if (pts.some(q => q.id === id)) continue;
    const runs = R.wetRuns ? safe(() => R.wetRuns(id), []) || [] : [];
    let b = null; for (const q of runs) if (!b || q.len > b.len) b = q;
    if (b) pts.push({ id, x: b.x, z: b.z, len: b.len });
  }
  pts.sort((a, b) => b.len - a.len);                             // [0] = the longest run: the work's seg, name and worksite
  if (!pts.length) pts = [{ id: segIds[0], x: +info.x || 0, z: +info.z || 0, len: wetLen }];
  const best = pts[0];
  for (const w of list) if (w.kind === 'bridge' && !w.done)
    for (const e of segsOf(w)) for (const q of pts) if (Math.hypot(e.mx - q.x, e.mz - q.z) < 30) return w.wid;
  const year = S && S.year ? S.year() : 0, t = S && S.time ? S.time() : year;
  const H = hist(), all = H && H.list ? safe(() => H.list(), []) || [] : [];
  let great = wetLen >= TUNE.bridgeGreatWet || !!nearTown(all, best.x, best.z, TUNE.bridgeTownDist, TUNE.bridgeTownHouses);
  if (great && !greatOk(list, year)) great = false;
  if (!great && greatStats(list, year).ord >= TUNE.ordActive && !force) return 0;
  for (const q of pts) {                                         // each seg's own pier count, as roads renders it
    const site = R.bridgeWorkSite ? safe(() => R.bridgeWorkSite(q.id), null) : null;
    q.n = site && site.piers && site.piers.length ? site.piers.length : Math.max(1, Math.round(Math.max(pts.length > 1 ? q.len : wetLen, 12) / 12));
  }
  const n = best.n;
  const wid = nextWid++;
  const r = D.rng(D.hash32 ? D.hash32((D.W && D.W.seed) || 1, (S && S.q) | 0, wid, 'bridge') : wid * 7919 + 1);
  const town = nearTown(all, best.x, best.z, 3000, 0);
  // a town's later crossings are numbered, so two works never read as one logged twice
  const nth = town ? list.filter(o => o.kind === 'bridge' && o.name && o.name.endsWith(` stone bridge at ${town.name}`)).length : 0;
  const w = { wid, kind: 'bridge', uid: 0, key: null, x: best.x, z: best.z, y0: t, dur: info.dur || durFor('bridge', great, r()), done: 0, great,
    seg: { mx: best.x, mz: best.z }, name: town ? `the ${nth ? (['second', 'third', 'fourth', 'fifth'][nth - 1] || 'new') + ' ' : ''}stone bridge at ${town.name}` : 'the new stone bridge', lg: 0, n,
    segs: pts.map(q => ({ mx: q.x, mz: q.z, n: q.n })) };
  list.push(w);
  for (const q of pts) safe(() => R.setBridgeWork(q.id, { st: 0, n: q.n }));
  pres.set(wid, { target: null, site: null, p: 0, st: 0, bs: pts.map(q => ({ id: q.id, st: 0 })) });   // presentation adds the pier worksite
  pendLog.push({ k: 'work0', imp: great ? 2 : 1, txt: `Masons begin ${w.name}${great ? ', a great work of many arches' : ''}.`, x: w.x, z: w.z, uid: 0, wid });
  dirty = true;
  return wid;
}
function applyForce(ctx) {
  const H = hist(), all = H && H.list ? safe(() => H.list(), []) || [] : [];
  for (const f of forceQ.splice(0)) {
    if (f.kind === 'bridge') { const wid = startBridge([f.id], { wetLen: f.wetLen || 60, dur: f.dur }, true); if (wid) ctx.mark(); continue; }
    const S = all.find(s => s.sid === f.id || s.uid === f.id);
    if (!S) { console.warn('[works] force: no settlement', f.id); continue; }
    if (!start(f.kind, S, ctx, ctx.rng('works:force'), f.dur)) console.warn('[works] force: start refused', f.kind, S.name);
  }
}

// ---- presentation (Story.update → part.update; never mutates saved state) ------------------------------------------------
function update(dt) {
  if (rederive) doRederive();
  if (doneQ.length) flushDone();
  tick -= dt || 0;
  if (tick > 0 && !dirty) return;
  tick = 0.5; dirty = false;                                     // ≤ 2 Hz per work
  const K = kit(); if (!K) return;
  const T = displayTime();
  for (const w of list) safe(() => present(w, T, K));
  for (const [wid, P] of pres) if (!byWid(wid)) { clearPres(P); pres.delete(wid); }
  fresh = false;
}
function presOf(wid) { let P = pres.get(wid); if (!P) pres.set(wid, P = { target: null, site: null, p: -1, st: -1, bs: [] }); return P; }
function present(w, T, K) {
  const P = presOf(w.wid), p = progAt(w, T), building = p < 1;
  // replay to a year before the work began: no worksite, no stage (the bridge shows as the lane had it; a
  // cathedral fitted into older town cells is held at prog 0, i.e. unseen)
  const before = T < w.y0 - 1e-6;
  if (!building && w.done && !P.site && (w.kind === 'bridge' ? P.st < 0 : P.p === 1)) return;   // settled: nothing to re-check
  if (w.kind === 'bridge') return presentBridge(w, P, p, building && !before, K);
  const H = hist(); let target = null;
  if (H && H.forWork) H.forWork(w.uid, w.wid, rec => { if (!target && rec && !rec.die) target = rec; });
  if (target !== P.target) { killSite(P, K); P.target = target; P.p = -1; }
  if (P.site && K.has && !K.has(P.site)) P.site = null;           // the Kit was cleared under us: raise it again
  if (!target) return;
  if (before) {
    killSite(P, K);
    if (P.p !== 0 || target.prog !== 0) { K.setBuild(target, 0); P.p = 0; }
  } else if (building) {
    if (Math.abs(p - P.p) > 1e-4 || target.prog === undefined) { K.setBuild(target, p); P.p = p; if (P.site) K.setBuild(P.site, p); }
    if (!P.site) P.site = makeSite(K, target, p);
  } else {
    if (target.prog !== undefined) K.setBuild(target, undefined);
    P.p = 1; killSite(P, K);
  }
}
function instantBorn(K) { const S = story(); return fresh || ending || (S && (S.replaying || S.catchingUp)) ? K.clock - 10 : K.clock; }
function makeSite(K, target, p) {
  const s = K.design('worksite', target.x, target.z, target.rot, { target, seed: target.seed });
  s.y = target.y; s.y0 = target.y0; if (target.year > 0) s.year = target.year;   // replay hides it with its building
  s.born = instantBorn(K); s.prog = p;
  K.add(s);
  return s;
}
// every seg of the crossing is staged at the same progress, each at its own pier count; P.st is the work's
// stage (worksite moves, settled check), P.bs[i] what we last gave roads for segs[i]
function presentBridge(w, P, p, building, K) {
  const R = roads(); if (!R || !R.segAt) return;
  const ents = segsOf(w), seen = [];
  if (!P.bs) P.bs = [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i], seg = R.segAt(e.mx, e.mz, 4);
    let id = seg ? seg.id : 0; if (id && seen.includes(id)) id = 0;   // two midpoints on one seg: stage it once
    if (id) seen.push(id);
    const b = P.bs[i] || (P.bs[i] = { id: 0, st: -1 });
    if (id !== b.id) {
      clearOne(b, R); b.id = id;
      if (i === 0) { killSite(P, K); P.st = -1; }
    }
  }
  for (let i = ents.length; i < P.bs.length; i++) clearOne(P.bs[i], R);
  P.bs.length = ents.length;
  const id = ents.length ? P.bs[0].id : 0;
  if (!id) { clearBridge(P, R); return; }                        // the main span is gone: the season prune drops the work
  for (let i = 0; i < ents.length; i++) {
    const b = P.bs[i]; if (!b.id) continue;
    const n = Math.max(1, ents[i].n | 0), sti = building ? bridgeStage(p, n) : -2;
    if (sti === b.st || (sti === -2 && b.st === -1)) continue;  // never "clear" a bridge we never staged this session
    const had = b.st >= 0;
    b.st = sti;
    if (R.setBridgeWork && (building || had)) R.setBridgeWork(b.id, building ? { st: sti, n } : null);
  }
  const st = building ? bridgeStage(p, w.n) : -2;
  if (st !== P.st && !(st === -2 && P.st === -1)) { P.st = st; killSite(P, K); }   // the worksite moves to the active pier
  if (!building) { killSite(P, K); return; }
  if (P.site && K.has && !K.has(P.site)) P.site = null;
  if (!P.site && R.bridgeWorkSite) {
    const site = R.bridgeWorkSite(id);
    if (site) {
      let pr = null, bd = 1e18, yb = site.y || 0;
      for (const q of site.piers || []) { const d = (q.x - site.x) ** 2 + (q.z - site.z) ** 2; if (d < bd) { bd = d; pr = q; } if (q.yBase !== undefined) yb = Math.min(yb, q.yBase); }
      const s = K.design('worksite', site.x, site.z, site.rot || 0, { site, seed: w.wid * 131 + 7 });
      s.y = site.y || 0; s.y0 = yb - 1; s.born = instantBorn(K);
      if (pr && pr.yTop !== undefined) s._cap = pr.yTop;
      K.add(s); P.site = s;
    }
  }
}
function killSite(P, K, sink) { if (P.site) { const s = P.site; safe(() => (K || kit()).remove(s, !!sink, sink ? { stagger: 2.5 } : undefined)); P.site = null; } }   // completion: top-first
function clearOne(b, R) { if (b.id && b.st >= 0 && R && R.setBridgeWork) safe(() => R.setBridgeWork(b.id, null)); b.st = -1; }
function clearBridge(P, R) { if (P.bs) for (const b of P.bs) clearOne(b, R); P.st = -1; }
function clearPres(P) {
  const K = kit();
  if (K) killSite(P, K);
  if (P.target && K && P.target.prog !== undefined) safe(() => K.setBuild(P.target, undefined));
  clearBridge(P, roads());
}
// finished this session: the scaffolding comes down, the building is complete, bells ring (one peal after catch-up)
function flushDone() {
  const K = kit(), R = roads();
  for (const wid of doneQ.splice(0)) {
    const w = byWid(wid); if (!w) continue;
    const P = pres.get(wid);
    if (P && K) { if (P.target) safe(() => K.setBuild(P.target, undefined)); killSite(P, K, true); P.p = 1; }
    if (w.kind === 'bridge' && P) { clearBridge(P, R); P.st = -2; }
    D.emit('works:done', { wid, kind: w.kind, name: w.name, x: w.x, z: w.z });
    if (w.great) peal(w);
  }
}
function peal(w) {
  const S = story();
  if (ending || (S && S.catchingUp)) { owedPeal = { x: w.x, z: w.z, kind: 'peal', name: w.name }; return; }
  if ((S && S.replaying) || hidden()) return;
  D.emit('bells', { x: w.x, z: w.z, kind: 'peal', name: w.name });
}
// after undo / load: drop every derived worksite and bridge stage, re-derive next tick; keeps whose work
// appeared or vanished get a decoration wave (their decoKey carries Works.ver)
function doRederive() {
  rederive = false; fresh = true; dirty = true;
  for (const [, P] of pres) clearPres(P);
  pres.clear();
  const now = keepMap(), H = hist();
  if (H && H.redecorate) {
    const uids = new Set([...prevKeeps.keys(), ...now.keys()]);
    for (const uid of uids) if (prevKeeps.get(uid) !== now.get(uid)) safe(() => H.redecorate(uid));
  }
  prevKeeps = now;
}
function keepMap() { const m = new Map(); for (const w of list) if (w.kind === 'keep') m.set(w.uid, w.wid); return m; }

// ---- part protocol ---------------------------------------------------------------------------------------------
function snap() { return { nextWid, list: list.map(copyWork) }; }
function restore(s) {
  list = s && s.list ? s.list.map(copyWork) : [];
  nextWid = s && s.nextWid ? s.nextWid : 1;
  doneQ.length = 0; pendLog = []; rederive = true;
}
function serialize() { return { v: 1, nextWid, list: list.map(copyWork) }; }
function deserialize(o) {
  const ok = o && Array.isArray(o.list);
  const defs = { uid: 0, key: null, done: 0, great: false, seg: null, name: '', lg: 0 };
  list = ok ? o.list.filter(w => w && w.wid && w.kind).map(w => { const c = copyWork(w); for (const k in defs) if (c[k] === undefined) c[k] = defs[k]; return c; }) : [];
  nextWid = Math.max(ok ? o.nextWid | 0 : 1, 1, ...list.map(w => w.wid + 1));
  doneQ.length = 0; pendLog = []; forceQ = []; owedPeal = null;   // a load / new world mid catch-up owes nothing
  prevKeeps = new Map(); rederive = true;
}
function reset() { deserialize(null); }
function onView() { dirty = true; }
const part = { name: 'works', order: 30, season, update, snap, restore, serialize, deserialize, reset, onView, busy() { return false; } };

// ---- public API (§5.10) -------------------------------------------------------------------------------------------
const Works = D.Works = {
  init() {
    if (Works._inited) return; Works._inited = true;
    const S = story();
    if (S && S.register) S.register('works', part);
    D.on('story:view', onView);
    D.on('story:restored', () => { rederive = true; });
    D.on('story:catchup', e => {
      if (e && e.phase === 'start') { owedPeal = null; return; }
      // works finished in the last catch-up frame (Story runs parts' update before catchUpTick) fold into the
      // owed peal here, so exactly one peal rings after a catch-up
      ending = true;
      try { if (rederive) doRederive(); if (doneQ.length) flushDone(); } catch (err) { console.warn('[works] catch-up flush', err); } finally { ending = false; }
      if (owedPeal) { const p = owedPeal; owedPeal = null; if (!hidden()) D.emit('bells', p); }
    });
  },
  // progress of a work at the display year: undefined when complete or unknown (so gw records render whole)
  progOf(wid) { const w = byWid(wid); if (!w) return undefined; const p = progAt(w, displayTime()); return p >= 1 ? undefined : p; },
  workAt(uid, kind) {
    let hit = null; for (const w of list) if (w.uid === uid && w.kind === kind && (!hit || w.wid > hit.wid)) hit = w;
    return hit ? { wid: hit.wid, var: hit.var | 0, prog: Works.progOf(hit.wid) } : null;
  },
  ver(uid) { let v = 0; for (const w of list) if (w.kind === 'keep' && w.uid === uid && w.wid > v) v = w.wid; return v; },
  list() { return list.map(w => Object.freeze(copyWork(w))); },
  requestBridge(segIds, info) {
    const S = story();
    if (!S || !S.committing) { console.warn('[works] requestBridge outside a history commit'); return 0; }
    return safe(() => startBridge(segIds, info, false), 0);
  },
  _part: part,
  _pure: { progAt, stagesCrossed, bridgeStage, durFor, cathedralOk, keepOk, greatOk, greatStats, stageText, doneText, STAGES },
  _dev: {
    // queue a start for the next season commit (skips eligibility, chance and spacing); steps the clock when idle
    force(kind, id, opts) {
      forceQ.push({ kind, id, dur: opts && opts.dur, wetLen: opts && opts.wetLen });
      const S = story();
      if (S && S._dev && S._dev.step && !S.committing) safe(() => S._dev.step(1));
      return forceQ.length ? 'queued for the next season' : 'started';
    },
    list() { return list; },
    pres() { return pres; },
    // preview a climb without touching history: Kit.setBuild on every active work's recs at progress p
    preview(p) { const K = kit(); if (!K) return; for (const [, P] of pres) { if (P.target) K.setBuild(P.target, p); if (P.site) K.setBuild(P.site, p); } }
  }
};
})();
