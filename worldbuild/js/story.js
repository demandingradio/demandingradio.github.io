/* Diorama — Living History: the story core.
   One year clock ("Spring 1142") that advances in seasons. Each season is ONE History entry
   (merge key 'story') inside which every registered part (director 10, wayfarer 20, works 30,
   realm 40) runs synchronously within a hard time budget; consecutive seasons fold into one
   undo step ("History 1142–1150"). The clock never outruns the parts: when a season is due but
   the world is not ready (a stroke is open, redo is pending, towns are still planning...) the
   clock holds at the boundary and says why. Also here: the chronicle (a compact append-only log),
   player-change diffing, catch-up after hidden time ("while you were away"), the view-only
   time-lapse replay, and all of their DOM (built on 'ui:ready').
   Optional module: without this file there is no clock and every other module degrades (§5.13). */
(function () {
'use strict';
const D = window.D;
D.TUNE = D.TUNE || {};
const TUNE = D.TUNE.story = Object.assign({
  speeds: [0, 1, 4, 12, 40],          // years per real minute per detent (pause, slow, normal, fast, rapid)
  grace: 6,                           // s: no commit after a player edit
  awayCapYears: 25, awayWallSec: 45,  // catch-up caps
  frameSec: [2.2, 8, 5, 2.5, 1.2],    // house skeleton stage per detent (index 0 = paused / legacy)
  budgetMs: 12, catchUpMs: 20,        // season commit budget; catch-up budget per frame
  logCap: 5000,
  replayRate: 5                       // years per second when replay plays
}, D.TUNE.story || {});
if (typeof navigator === 'undefined' || navigator.userAgent !== 'harness') console.info('[story] tune', JSON.stringify(TUNE));

const Y0 = 1086, Q0 = Y0 * 4, EPS = 1e-6;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
const FEASTS = ['Lady Day', 'Midsummer Day', 'Michaelmas', 'Christmas'];
// chronicle entry = frozen [q, k, x, z, uid, txt, imp, wid]
const E = Object.freeze({ Q: 0, K: 1, X: 2, Z: 3, UID: 4, TXT: 5, IMP: 6, WID: 7 });
const CAT = {};
[['places', 'begin found grow abandon rename church ms walls morph'], ['roads', 'path road highway bridge'], ['works', 'work0 workS work1'],
  ['lands', 'charter dowry bequest partition sale regrant escheat house see stone'], ['away', 'away']].forEach(([c, ks]) => ks.split(' ').forEach(k => { CAT[k] = c; }));
const FLY_DIST = { places: 650, works: 380, roads: 1400, lands: 2600, away: 1400 };
const ICON = { begin: '📜', found: '🏘', grow: '🌱', abandon: '🕯', rename: '✎', church: '⛪', ms: '🏛', walls: '🧱', morph: '⬆',
  path: '👣', road: '🛤', highway: '👑', bridge: '🌉', work0: '🏗', workS: '🏗', work1: '🔔',
  charter: '📜', dowry: '💍', bequest: '🕊', partition: '✂', sale: '⚖', regrant: '👑', escheat: '⚰', house: '🛡', see: '✝', stone: '🪨', away: '🌙' };
const now = () => performance.now();

// ================================================================================
// Pure helpers (exported as Story._pure for the Deno tests)
// ================================================================================
function dateLabel(q, feast) { const y = q >> 2, s = q & 3; return (feast ? FEASTS[s] : SEASON_NAMES[s]) + ' ' + y; }
// advance the clock by dt at ypm; clamps at the next season boundary and reports whether a season is due
function advanceClock(t, q, dt, ypm) {
  const edge = (q + 1) / 4;
  t += dt * ypm / 60;
  return t >= edge ? { t: edge, due: true } : { t, due: false };
}
// years owed after hiddenSec of hidden time at ypm, capped
function owedYears(hiddenSec, ypm, cap) { return ypm > 0 && hiddenSec > 0 ? Math.min(cap, hiddenSec * ypm / 60) : 0; }
function packEntry(e, qDefault) {
  const q = e.q !== undefined ? e.q | 0 : e.y !== undefined ? (e.y | 0) * 4 + ((e.s | 0) & 3) : qDefault | 0;
  const imp = Math.max(1, Math.min(3, (e.imp | 0) || 1));
  return Object.freeze([q, String(e.k || 'ms'), (+e.x || 0) | 0, (+e.z || 0) | 0, (e.uid | 0), String(e.txt || ''), imp, (e.wid | 0)]);
}
function unpackEntry(a) {
  return Object.freeze([a[0] | 0, String(a[1] || 'ms'), a[2] | 0, a[3] | 0, a[4] | 0, String(a[5] || ''), Math.max(1, Math.min(3, a[6] | 0 || 1)), a[7] | 0]);
}
// keep the log within cap: drop the oldest imp-1 entries first, then the oldest of any kind
function capLog(log, cap) {
  let over = log.length - cap; if (over <= 0) return 0;
  const drop = new Set();
  for (let i = 0; i < log.length && drop.size < over; i++) if (log[i][E.IMP] <= 1) drop.add(i);
  for (let i = 0; i < log.length && drop.size < over; i++) drop.add(i);
  let w = 0;
  for (let i = 0; i < log.length; i++) if (!drop.has(i)) log[w++] = log[i];
  log.length = w;
  return over;
}
// top n entries by imp, then by recency
function topEntries(list, n) {
  return list.map((e, i) => [e, i]).sort((a, b) => b[0][E.IMP] - a[0][E.IMP] || b[0][E.Q] - a[0][E.Q] || b[1] - a[1]).slice(0, n).map(p => p[0]);
}
const MORPH_RANK = { hamlet: 1, village: 2, town: 3, monastery: 1, abbey: 2, harbour: 1, port: 2 };
const WALL_RANK = w => w === 'stone' ? 2 : w && w !== 'none' ? 1 : 0;
const MS_BITS = [
  [1, 'church', 2, n => `${n} raises its first church.`], [2, 'ms', 1, n => `An alehouse opens its doors in ${n}.`],
  [4, 'ms', 1, n => `A smithy's hammer rings in ${n}.`], [8, 'ms', 1, n => `${n} builds a mill.`],
  [16, 'ms', 2, n => `${n} is granted a market.`], [32, 'ms', 2, n => `The guilds of ${n} raise a guildhall.`],
  [64, 'church', 1, n => `${n} raises a second church.`], [128, 'church', 3, n => `${n} raises a cathedral.`]
];
const an = w => /^[aeiou]/i.test(w) ? 'an ' + w : 'a ' + w;
function foundText(s) {
  const n = s.name || 'A new place';
  switch (s.type) {
    case 2: return `Fields are first ploughed at ${n}.`;
    case 3: return `A castle is raised at ${n}.`;
    case 4: return `${n} is founded, a house of prayer.`;
    case 5: return `A harbour is dug at ${n}.`;
  }
  return `${n} is founded.`;
}
// Compare Town.hist.list() with the known table (uid -> [name, type, ms, walls, morph]); mutates known.
// Returns the chronicle entries for player-made place changes. first: silently adopt everything.
function diffKnownPure(known, list, first, lastPos) {
  const logs = [], seen = new Set();
  for (const s of list) {
    if (!s || !s.uid) continue;
    seen.add(s.uid);
    const cur = [String(s.name || ''), s.type | 0, s.ms | 0, s.walls || 'none', s.morph || ''];
    const old = known.get(s.uid);
    const x = +s.x || 0, z = +s.z || 0;
    if (lastPos) lastPos.set(s.uid, [x, z]);
    if (!old || old[0] !== cur[0] || old[1] !== cur[1] || old[2] !== cur[2] || old[3] !== cur[3] || old[4] !== cur[4]) known.set(s.uid, cur);
    if (first) continue;
    const base = { uid: s.uid, x, z };
    if (!old) { logs.push(Object.assign({ k: 'found', imp: 2, txt: foundText(s) }, base)); continue; }
    const name = cur[0] || old[0];
    if (old[0] && cur[0] && old[0] !== cur[0]) logs.push(Object.assign({ k: 'rename', imp: 1, txt: `${old[0]} is renamed ${cur[0]}.` }, base));
    const bits = cur[2] & ~old[2];
    if (bits) for (const [b, k, imp, f] of MS_BITS) if (bits & b) logs.push(Object.assign({ k, imp, txt: f(name) }, base));
    if (WALL_RANK(cur[3]) > WALL_RANK(old[3]))
      logs.push(Object.assign({ k: 'walls', imp: 2, txt: cur[3] === 'stone' ? `${name} is walled in stone.` : `${name} raises a palisade.` }, base));
    // morph-ups ("Crowfield is now a town"); the 'walled ' prefix is the walls entry's business
    const m0 = String(old[4]).replace(/^walled /, ''), m1 = String(cur[4]).replace(/^walled /, '');
    const r0 = MORPH_RANK[m0] || 0, r1 = MORPH_RANK[m1] || 0;
    if (r0 && r1 > r0)
      logs.push(Object.assign({ k: 'morph', imp: r1 >= 3 || m1 === 'abbey' || m1 === 'port' ? 2 : 1, txt: `${name} is now ${an(m1)}.` }, base));
  }
  for (const [uid, old] of Array.from(known)) {
    if (seen.has(uid)) continue;
    known.delete(uid);
    if (first) continue;
    const p = lastPos && lastPos.get(uid);
    logs.push({ k: 'abandon', imp: 2, txt: `${old[0] || 'A place'} is abandoned.`, uid: 0, x: p ? p[0] : 0, z: p ? p[1] : 0 });
  }
  return logs;
}
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const words = n => n >= 0 && n < WORDS.length ? WORDS[n] : String(n);

// ================================================================================
// State
// ================================================================================
const S = D.Story = {
  started: false, beginning: false, running: false, speedIdx: 2,
  q: Q0 - 1, t: Y0 - EPS, branch: 0, follow: true,
  replaying: false, viewYear: null, catchingUp: false, committing: false, cancelling: false,
  awayId: 0, holdWhy: '', frameMs: 16, lastCommitMs: 0,
  Y0, SEASONS, E, CAT,
  get SPEEDS() { return TUNE.speeds; }
};
let parts = [];                 // sorted by order
let orphanParts = {};           // serialized data of parts whose module is absent (passed through on save)
let log = [];                   // chronicle
let known = new Map();          // uid -> [name, type, ms, walls, morph]
const lastPos = new Map();      // uid -> [x, z] (volatile, for 'abandoned' entries)
let unread = 0;
let pendingEvents = null;       // story:log events held back until the commit succeeds
let lastPlayerEdit = -1e9, lastTop = null, suppressEdit = false;
let owedSeasons = 0;            // small catch-up (< 2 years) run through the normal loop
let hiddenAt = 0, lastFrameT = 0;
let away = null;                // catch-up job
let lastRecorded = false;         // did the last commitSeason add/fold an entry (dev: roundTrip compares recorded seasons only)
let runSalt = 0, runSeq = 0;    // _dev.roundTrip: a unique 'story:<n>' key so a fresh run never folds into an older entry
let replayWasRunning = false, replayPlay = null, viewPending = undefined, viewT = 0;

Object.defineProperty(S, '_known', { get: () => known, enumerable: false });
S.time = () => S.t;
S.year = () => S.q >> 2;
S.season = () => S.q & 3;
S.ypm = () => TUNE.speeds[S.speedIdx] || 0;
S.displayTime = () => S.replaying && S.viewYear !== null ? S.viewYear : S.started ? S.t : 0;
S.displayYear = () => Math.floor(S.displayTime());
S.frameSeconds = () => (!S.running || !S.started || !S.speedIdx) ? TUNE.frameSec[0] : TUNE.frameSec[S.speedIdx] || TUNE.frameSec[0];
S.dateLabel = dateLabel;
S.events = () => log;           // read-only view: never mutate
S.yearOf = e => e[E.Q] >> 2;
S.catOf = e => CAT[e[E.K]] || 'places';
// per-frame budget helper for parts: halved when the last frame was slow (§3.14)
S.partBudget = ms => S.frameMs > 25 ? ms / 2 : ms;

// ---- parts -------------------------------------------------------------------------------------
S.register = function (name, part) {
  if (!part || typeof part.season !== 'function') { console.warn('[story] part', name, 'has no season()'); return; }
  parts = parts.filter(p => p.name !== name);
  part.name = name; part.errors = 0; part.disabled = false;
  if (part.order === undefined) part.order = 50;
  parts.push(part);
  parts.sort((a, b) => a.order - b.order);
  if (orphanParts[name] !== undefined) { const d = orphanParts[name]; delete orphanParts[name]; try { part.deserialize && part.deserialize(d); } catch (err) { console.error('[story]', name, err); } }
};
S.parts = () => parts.slice();
function partError(p, err, where) {
  console.error('[story]', p.name, where || '', err);
  if (++p.errors >= 3 && !p.disabled) { p.disabled = true; D.toast(`History: ${p.name} paused after an error`, 'warn'); }
}

// ---- chronicle ---------------------------------------------------------------------------------
S.log = function (e, qDefault) {
  if (!e || !e.txt) return null;
  const ent = packEntry(e, qDefault !== undefined ? qDefault : S.q);
  log.push(ent);
  if (log.length > TUNE.logCap) capLog(log, TUNE.logCap);
  if (pendingEvents) pendingEvents.push(ent); else announce(ent);
  return ent;
};
function announce(ent) {
  if (ent[E.IMP] >= 2 && !S.catchingUp && !chronVisible()) { unread++; btnDirty = true; }
  emit('story:log', ent);
}
// D.emit does not catch listener errors: a bad story:* listener must never break a commit or the frame
function emit(evt, a, b, c) {
  try { D.emit(evt, a, b, c); } catch (err) { console.error('[story] listener for ' + evt, err); }
}

// ---- commit gate -------------------------------------------------------------------------------
function shown(id) { if (typeof document === 'undefined') return false; const el = document.getElementById(id); return !!(el && !el.hidden); }
function gate(catchUp) {
  if (!(S.started || S.beginning) || !S.running) return 'paused';
  if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return 'hidden';
  if (!D.UI || !D.UI.hasWorld || shown('newworld') || shown('loading')) return 'no world';
  if (S.replaying) return 'replaying';
  const H = D.History;
  if (H.active() || (D.Tools && D.Tools.stroke) || (D.Roads && D.Roads.draft)) return 'waiting for your edit';
  if (H.pos !== H.entries.length) return 'redo available';
  if (!catchUp && now() - lastPlayerEdit < TUNE.grace * 1000) return 'waiting for your edit';
  const T = D.Town;
  try { if (T && T.hist && T.hist.busy && T.hist.busy() > (catchUp ? 12 : 6)) return 'towns still planning'; } catch (err) { }
  for (const p of parts) if (!p.disabled && p.busy) { try { if (p.busy()) return 'surveying the land'; } catch (err) { partError(p, err, 'busy'); } }
  return '';
}
S.canCommit = catchUp => !gate(!!catchUp);
S.holdReason = catchUp => gate(!!catchUp);

// ---- season commit (§6A) -------------------------------------------------------------------------
function worldSeed() { return (D.W && D.W.seed) || 1; }
function makeCtx(q, catchUp, first, deadline) {
  const ctx = {
    q, year: q >> 2, season: q & 3, yf: q / 4, first, catchUp, branch: S.branch, dirty: false,
    budget: { found: 1, extend: 2, tweak: 1, legs: 12, upgrades: 2, realm: 1 },
    rng(salt) { return D.rng(D.hash32(worldSeed(), q, S.branch, salt === undefined ? 0 : salt)); },
    timeLeft() { return deadline - now(); },
    log(e) { ctx.dirty = true; return S.log(e, q); },
    mark() { ctx.dirty = true; }
  };
  return ctx;
}
const chronPart = { name: 'chronicle', errors: 0 };
function commitSeason(catchUp, frameEnd) {
  const H = D.History;
  const q = S.q + 1, y = q >> 2, s = q & 3, first = !S.started;
  const t0 = now();
  const deadline = Math.min(t0 + TUNE.budgetMs, frameEnd || Infinity);
  const ctx = makeCtx(q, catchUp, first, deadline);
  const merge = catchUp ? 'away:' + S.awayId : runSalt ? 'story:' + runSalt : 'story';
  H.begin(first ? 'Chronicle begins' : catchUp ? `While you were away ${y}` : `History ${y}`, catchUp ? 'away' : 'story',
    { merge, y, relabel: (a, b) => (catchUp ? 'While you were away ' : 'History ') + (a === b ? a : a + '–' + b) });
  // the before-snapshot must keep t inside its season (§3.1), so an undo lands at edge − EPS, not on the edge
  S.t = Math.min(S.t, q / 4 - EPS);
  H.touchObj('story');
  S.committing = true; S.q = q; S.t = Math.max(S.t, q / 4);
  const mark0 = log.length;
  pendingEvents = [];
  let bad = null;
  for (const p of parts) {
    if (p.disabled) continue;
    try { p.season(ctx); } catch (err) { bad = p; console.error('[story]', p.name, err); break; }
  }
  if (!bad && !chronPart.disabled) try { if (first) logBegin(ctx, mark0); diffKnown(ctx); } catch (err) { bad = chronPart; console.error('[story] chronicle', err); }
  S.committing = false;
  if (bad) {
    S.cancelling = true;
    try { H.cancel(); } finally { S.cancelling = false; }
    pendingEvents = null;
    // the clock still advances outside history so the world does not stall; a failed begin retries
    // next frame (loadState cleared 'beginning' because started is still false: put it back)
    if (!first) { S.q = q; S.t = Math.max(S.t, q / 4); }
    else S.beginning = true;
    if (++bad.errors >= 3 && !bad.disabled) { bad.disabled = true; D.toast(`History: ${bad.name} paused after an error`, 'warn'); }
    emit('story:restored');
    S.lastCommitMs = now() - t0;
    return false;
  }
  if (first) { S.started = true; S.beginning = false; }
  // a season that touched nothing but the clock adds no entry; one that changed tiles/chunks/objs without
  // calling ctx.mark() is still recorded, so no world change ever escapes history (I1/I5)
  const touched = !ctx.dirty && !!H.changedBeyond && H.changedBeyond('story');
  if (touched) console.warn('[story] a part changed the world without ctx.mark(); recorded anyway');
  lastRecorded = !!(ctx.dirty || touched);
  if (lastRecorded) H.end(); else H.abort();
  markStoryDirty();
  const evs = pendingEvents; pendingEvents = null;
  for (const ent of evs) { try { announce(ent); } catch (err) { console.error('[story] announce', err); } }
  S.lastCommitMs = now() - t0;
  emit('story:season', y, s, catchUp);
  if (!s) emit('story:year', y);
  if (first) emit('story:begin', y);
  const ypm = S.ypm();
  if (S.follow && !catchUp && ypm > 0 && ypm <= 1 && D.Sky && D.Sky.setSeason) {
    try { D.Sky.setSeason(SEASONS[s]); if (D.UI && D.UI.refreshEnv) D.UI.refreshEnv(); } catch (err) { console.warn('[story] season follow', err); }
  }
  labelDirty = true;
  return true;
}
function markStoryDirty() { if (D.Save) D.Save.dirtyStory = true; }
function logBegin(ctx, at) {
  const L = D.Town && D.Town.hist && D.Town.hist.list ? D.Town.hist.list() : [];
  const R = D.Realm;
  let c = null;
  try { c = R && R.counts ? R.counts() : null; } catch (err) { c = null; }
  const name = (D.W && D.W.name) || 'this land';
  let txt = `Here begins the chronicle of ${name}. `;
  if (!L.length) txt += 'The land lies empty, waiting for its first founder.';
  else if (c && c.shires && c.manors) txt += `The land is reckoned in ${words(c.shires)} shires and ${words(c.manors)} manors.`;
  else txt += `${words(L.length).replace(/^./, m => m.toUpperCase())} ${L.length === 1 ? 'place stands' : 'places stand'} upon the land.`;
  const ent = packEntry({ k: 'begin', imp: 3, txt, x: D.SIZE ? D.SIZE / 2 : 0, z: D.SIZE ? D.SIZE / 2 : 0 }, ctx.q);
  log.splice(Math.min(at, log.length), 0, ent);
  if (pendingEvents) pendingEvents.unshift(ent);
  ctx.dirty = true;
}
function diffKnown(ctx) {
  const T = D.Town; if (!T || !T.hist || !T.hist.list) return;
  const logs = diffKnownPure(known, T.hist.list() || [], ctx.first, lastPos);
  for (const e of logs) ctx.log(e);
}

// ---- undo snapshot ('story' regObj; realm cells live in their own regArray) -----------------------
function snapState() {
  const ps = {};
  for (const p of parts) if (p.snap) { try { ps[p.name] = p.snap(); } catch (err) { console.error('[story] snap', p.name, err); ps[p.name] = null; } }
  return { q: S.q, t: S.t, started: S.started, log: log.slice(), known: new Map(known), parts: ps };
}
function loadState(st) {
  if (!st) return;
  S.q = st.q; S.t = D.clamp(st.t, st.q / 4, (st.q + 1) / 4 - EPS); S.started = !!st.started;
  if (!S.started && !S.cancelling) S.beginning = false;
  log = st.log.slice(); known = new Map(st.known);
  for (const p of parts) if (p.restore) { try { p.restore(st.parts && st.parts[p.name] !== undefined ? st.parts[p.name] : null); } catch (err) { console.error('[story] restore', p.name, err); } }
  chronDirty = true; labelDirty = true;
}
function stateBytes(st) { return st ? 512 + st.log.length * 24 + st.known.size * 64 + Object.keys(st.parts || {}).length * 2048 : 0; }

// ---- serialize (disk) ------------------------------------------------------------------------------
S.serialize = function () {
  const ps = Object.assign({}, orphanParts);
  for (const p of parts) if (p.serialize) { try { ps[p.name] = p.serialize(); } catch (err) { console.error('[story] serialize', p.name, err); } }
  const kn = []; known.forEach((a, uid) => kn.push([uid, a[0], a[1], a[2], a[3], a[4]]));
  return {
    v: 1,
    clock: { q: S.q, t: S.t, speedIdx: S.speedIdx, running: S.replaying ? replayWasRunning : S.running, started: S.started, branch: S.branch, follow: S.follow, awayId: S.awayId },
    log: log.map(a => a.slice()), unread, known: kn, parts: ps
  };
};
function freshState() {
  S.started = false; S.beginning = false; S.running = false; S.speedIdx = 2;
  S.q = Q0 - 1; S.t = Y0 - EPS; S.branch = 0; S.follow = true; S.awayId = 0;
  S.replaying = false; S.viewYear = null; S.catchingUp = false; S.committing = false; S.cancelling = false; S.holdWhy = '';
  if (away && away.catchOff) { try { D.Town.hist.setCatchUp(false); } catch (err) { } }
  log = []; known = new Map(); lastPos.clear(); unread = 0; pendingEvents = null; owedSeasons = 0; away = null; replayPlay = null;
  orphanParts = {};
  lastFrameT = 0;   // a load or new world takes one long task: never mistake it for hidden time
  chronDirty = true; labelDirty = true;
}
S.deserialize = function (obj) {
  const wasReplay = S.replaying;
  freshState();
  if (wasReplay) S.onViewChange(null, true);
  closeAway(); closeReplayBar();
  if (obj && typeof obj === 'object') {
    const c = obj.clock || {};
    const q = Number.isFinite(c.q) ? c.q | 0 : Q0 - 1;
    S.q = q;
    S.t = Number.isFinite(c.t) ? D.clamp(c.t, q / 4, (q + 1) / 4 - EPS) : (q + 1) / 4 - EPS;
    S.speedIdx = D.clamp(c.speedIdx | 0, 0, TUNE.speeds.length - 1);
    S.started = !!c.started && q >= Q0;
    S.running = !!c.running && S.started;
    S.branch = c.branch | 0; S.follow = c.follow !== false; S.awayId = c.awayId | 0;
    log = Array.isArray(obj.log) ? obj.log.filter(Array.isArray).map(unpackEntry) : [];
    unread = obj.unread | 0;
    if (Array.isArray(obj.known)) for (const r of obj.known) if (Array.isArray(r) && r[0]) known.set(r[0], [String(r[1] || ''), r[2] | 0, r[3] | 0, r[4] || 'none', r[5] || '']);
  }
  const ps = obj && obj.parts && typeof obj.parts === 'object' ? obj.parts : {};
  for (const p of parts) {
    try { if (p.deserialize) p.deserialize(ps[p.name] !== undefined ? ps[p.name] : null); } catch (err) { console.error('[story] deserialize', p.name, err); }
  }
  for (const k in ps) if (!parts.some(p => p.name === k)) orphanParts[k] = ps[k];
  afterClockChange();
  emit('story:restored');
};
S.reset = function () {
  const wasReplay = S.replaying;
  freshState();
  if (wasReplay) S.onViewChange(null, true);
  for (const p of parts) { try { if (p.reset) p.reset(); else if (p.deserialize) p.deserialize(null); } catch (err) { console.error('[story] reset', p.name, err); } }
  closeAway(); closeReplayBar();
  afterClockChange();
  emit('story:restored');
};

// ---- play / pause / speed ------------------------------------------------------------------------
function setRunning(v) {
  v = !!v;
  if (S.running === v) { afterClockChange(); return; }
  S.running = v;
  afterClockChange();
  emit('story:speed', S.speedIdx, S.ypm());
}
function afterClockChange() {
  if (D.Town) D.Town.histPace = S.running ? D.clamp(S.ypm() / 4, 1, 10) : 1;
  labelDirty = true; btnDirty = true;
}
S.play = function () {
  if (S.catchingUp) return;
  if (S.replaying) S.exitReplay();
  const H = D.History;
  // an open player entry (a brush drag) is never closed here: its own end() drops the redo branch
  if (H && H.pos < H.entries.length && !H.active()) {
    suppressEdit = true;
    try { H.dropRedo(); } finally { suppressEdit = false; lastTop = H.entries[H.entries.length - 1] || null; }
    D.toast('Carrying on; the undone steps are forgotten.');
  }
  if (!S.speedIdx) { S.speedIdx = 2; emit('story:speed', S.speedIdx, S.ypm()); }
  if (!S.started && !S.beginning) {
    S.beginning = true;
    dismissCoach();
    emit('story:prepare');
  }
  setRunning(true);
};
S.pause = function () {
  if (S.catchingUp && away) finishCatchUp(true);
  setRunning(false);
};
S.toggle = function () { if (S.running && !heldForRedo()) S.pause(); else S.play(); };
S.setSpeed = function (idx) {
  idx = D.clamp(idx | 0, 0, TUNE.speeds.length - 1);
  const was = S.speedIdx;
  S.speedIdx = idx;
  if (!idx) { S.pause(); if (was !== idx) emit('story:speed', idx, 0); return; }
  afterClockChange();
  if (was !== idx) emit('story:speed', idx, S.ypm());
};
S.cycleSpeed = function () { // Backquote: slow → normal → fast → rapid → slow
  const n = TUNE.speeds.length - 1;
  S.setSpeed(S.speedIdx >= n || S.speedIdx < 1 ? 1 : S.speedIdx + 1);
  D.hint(`History: <b>${SPEED_NAMES[S.speedIdx]}</b>${S.running ? '' : ' (paused)'}`, 1400);
};
const SPEED_NAMES = ['Paused', 'Slow', 'Normal', 'Fast', 'Rapid'];
S.SPEED_NAMES = SPEED_NAMES;
function heldForRedo() { const H = D.History; return !!(H && S.running && H.pos < H.entries.length); }

// ---- the frame --------------------------------------------------------------------------------------
S.update = function (dt) {
  const t0 = now();
  if (lastFrameT) {
    const gap = t0 - lastFrameT;
    S.frameMs = gap;
    if (gap > 5000 && !hiddenAt) owe(gap / 1000);   // laptop sleep while visible
  }
  lastFrameT = t0;
  if (!D.UI || !D.UI.hasWorld) { refreshDom(); return; }
  for (const p of parts) {
    if (p.disabled || !p.update) continue;
    try { p.update(dt); } catch (err) { partError(p, err, 'update'); }
  }
  replayTick(dt);
  if (away && !S.catchingUp && away.catchOff && D.Town && D.Town.hist) {
    let b = 0; try { b = D.Town.hist.busy ? D.Town.hist.busy() : 0; } catch (err) { }
    if (b === 0 || t0 - away.cardAt > 10000) { away.catchOff = false; try { D.Town.hist.setCatchUp && D.Town.hist.setCatchUp(false); } catch (err) { } }
  }
  if (S.catchingUp) { catchUpTick(); refreshDom(); return; }
  S.holdWhy = '';
  if (S.running && (S.started || S.beginning) && !S.replaying) {
    const visible = typeof document === 'undefined' || !document.visibilityState || document.visibilityState === 'visible';
    let due;
    if (!S.started) { due = true; S.t = Math.min(S.t, (S.q + 1) / 4 - EPS); }
    else if (visible) { const a = advanceClock(S.t, S.q, dt, S.ypm()); S.t = a.t; due = a.due; }
    if (owedSeasons > 0) due = true;
    let commits = 0;
    const maxC = owedSeasons > 0 ? 4 : 1;
    while (due && commits < maxC) {
      const why = gate(false);
      if (why) { S.holdWhy = why; break; }
      const ok = commitSeason(false);
      commits++;
      if (owedSeasons > 0) owedSeasons--;
      if (!ok && !S.started) break;
      due = owedSeasons > 0 && commits < maxC;
    }
    // never beyond the boundary: a held or finished season parks just short of the next edge
    if (S.t >= (S.q + 1) / 4) S.t = (S.q + 1) / 4 - EPS;
    if (S.holdWhy === 'paused') S.holdWhy = '';
  }
  refreshDom();
};

// ---- player edits (grace) and undo rules -----------------------------------------------------------
function onHistory() {
  const H = D.History, top = H.entries[H.entries.length - 1] || null;
  if (top !== lastTop) { lastTop = top; if (top && !top.merge && !suppressEdit) lastPlayerEdit = now(); }
  btnDirty = true; labelDirty = true;
}
let restoredToast = null;
function onRestored(e, which) {
  if (S.cancelling || !e) return;
  const isStory = typeof e.merge === 'string' && (e.merge.startsWith('story') || e.merge.startsWith('away'));
  if (isStory) {
    if (S.replaying) S.exitReplay();
    if (S.catchingUp) finishCatchUp(true);
    owedSeasons = 0;
    S.beginning = false;
    if (which === 'before') S.branch++;
    setRunning(false);
    if (!restoredToast) setTimeout(() => {
      const w = restoredToast; restoredToast = null;
      D.toast(`History paused, time turned ${w === 'after' ? 'forward' : 'back'} to ${S.started ? dateLabel(S.q) : dateLabel(Q0) + ', before the chronicle'}`);
    }, 0);
    restoredToast = which;
  }
  chronDirty = true; labelDirty = true; btnDirty = true;
  emit('story:restored');
}

// ---- hidden time and catch-up (§3.4) ------------------------------------------------------------------
function owe(sec) {
  if (!S.running || !S.started || S.catchingUp || S.replaying) return 0;
  const y = owedYears(sec, S.ypm(), TUNE.awayCapYears);
  if (y <= 0) return 0;
  if (y < 2) { owedSeasons += Math.round(y * 4); return y; }
  startCatchUp(y);
  return y;
}
function startCatchUp(years) {
  owedSeasons = 0;
  S.catchingUp = true; S.awayId++;
  const left = Math.max(1, Math.round(years * 4));
  away = { fromQ: S.q, left, total: left, start: now(), cardAt: 0, hurried: false, catchOff: true, bells: 0 };
  try { if (D.Town && D.Town.hist && D.Town.hist.setCatchUp) D.Town.hist.setCatchUp(true); } catch (err) { }
  emit('story:catchup', { phase: 'start', from: S.q, to: S.q + left });
  showVeil();
}
function catchUpTick() {
  const fe = now() + TUNE.catchUpMs;
  let n = 0;
  while (away.left > 0 && n < 4 && now() < fe) {
    if (gate(true)) break;
    commitSeason(true, fe);
    n++; away.left--;
  }
  if (S.t >= (S.q + 1) / 4) S.t = (S.q + 1) / 4 - EPS;
  veilTick();
  if (away.left <= 0) finishCatchUp(false);
  else if (now() - away.start > TUNE.awayWallSec * 1000) { away.hurried = true; finishCatchUp(false); }
}
function finishCatchUp(stopped) {
  if (!away || !S.catchingUp) return;
  S.catchingUp = false;
  away.toQ = S.q; away.cardAt = now(); away.stopped = !!stopped; away.hurried = away.hurried || (stopped && away.left > 0);
  S.t = S.q / 4 + EPS;
  emit('story:catchup', { phase: 'end', from: away.fromQ, to: S.q });
  showSummary();
  labelDirty = true;
}
function awayEntries(a) { return log.filter(e => e[E.Q] > a.fromQ && e[E.Q] <= a.toQ); }

// ---- replay (view only, §3.6) ---------------------------------------------------------------------------
function firstYear() { return log.length ? Math.min(Y0, log[0][E.Q] >> 2) : Y0; }
S.enterReplay = function (from, to) {
  if (!S.started || S.catchingUp) return false;
  if (!S.replaying) {
    replayWasRunning = S.running;
    if (S.running) { S.running = false; afterClockChange(); emit('story:speed', S.speedIdx, S.ypm()); }
    S.replaying = true;
    buildReplayBar();
  }
  const y0 = from !== undefined && from !== null ? from : S.t;
  S.setReplayYear(y0);
  replayPlay = to !== undefined && to !== null ? { to: Math.min(to, S.t), exit: true } : null;
  return true;
};
S.setReplayYear = function (y) {
  if (!S.replaying) return;
  const v = y === null || y === undefined || y >= S.t - EPS ? null : D.clamp(+y, firstYear(), S.t);
  S.viewYear = v;
  viewPending = v;
  labelDirty = true; chronDirty = true; replayBarDirty = true;
};
S.exitReplay = function () {
  if (!S.replaying) return;
  S.replaying = false; S.viewYear = null; replayPlay = null;
  S.onViewChange(null, true);
  closeReplayBar();
  chronDirty = true; labelDirty = true;
  if (replayWasRunning) setRunning(true); else afterClockChange();
};
S.toggleReplay = function () { if (S.replaying) S.exitReplay(); else if (S.started) S.enterReplay(); else D.toast('Press ▶ first: there is no history to replay yet.'); };
// parts' onView + the story:view event, throttled to 4 per second by replayTick (force = now)
S.onViewChange = function (v, force) {
  viewPending = undefined; viewT = now();
  for (const p of parts) if (!p.disabled && p.onView) { try { p.onView(v); } catch (err) { partError(p, err, 'onView'); } }
  emit('story:view', v);
};
function replayTick(dt) {
  if (!S.replaying) return;
  if (replayPlay) {
    const cur = S.viewYear === null ? S.t : S.viewYear;
    const to = replayPlay.to;
    const ny = cur + dt * TUNE.replayRate;
    if (ny >= to) {
      const exit = replayPlay.exit; replayPlay = null;
      S.setReplayYear(to >= S.t - EPS ? null : to);
      if (exit) { S.exitReplay(); return; }
    } else S.setReplayYear(ny);
  }
  if (viewPending !== undefined && now() - viewT >= 250) S.onViewChange(viewPending);
}

// ---- fly-to ----------------------------------------------------------------------------------------------
S.flyTo = function (ent) {
  if (!ent) return false;
  let x = ent[E.X], z = ent[E.Z];
  const uid = ent[E.UID];
  const T = D.Town;
  // the entry's own point wins (a road's midpoint, a growth lobe, a stone); the place origin only fills in a missing one
  if (!x && !z && uid && T && T.hist && T.hist.byUid && T.originOf) {
    try { const sid = T.hist.byUid(uid); if (sid) { const o = T.originOf(sid); if (o) { x = o.x; z = o.z; } } } catch (err) { }
  }
  if (!x && !z) return false;
  const dist = FLY_DIST[S.catOf(ent)] || 900;
  if (D.Cam && D.Cam.flyTo) D.Cam.flyTo(x, z, dist);
  else if (D.Cam && D.Cam.focusOn) D.Cam.focusOn(x, z, dist);
  return true;
};

// ================================================================================
// DOM (built on 'ui:ready'; everything below is a no-op without a document)
// ================================================================================
const $ = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
function mk(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let ui = null;
let labelDirty = true, btnDirty = true, chronDirty = true, replayBarDirty = true;
let chronFilter = 'all', chronLimit = 300, chronT = 0;
const slipQ = [];
let slipEl = null, slipTimer = 0;

function buildUI() {
  if (ui || typeof document === 'undefined') return;
  const mb = $('menubar'); if (!mb) return;
  ui = {};
  const bar = mk('div', '', '');
  bar.id = 'yearbar';
  bar.innerHTML = `<button class="qbtn yb-play" id="yb-play" title="Play / pause history (Shift+P)">▶</button>
    <span class="yb-label" id="yb-label" title="The year of your chronicle">Spring ${Y0}</span>
    <input type="range" id="yb-speed" min="0" max="${TUNE.speeds.length - 1}" step="1" title="History speed (\`)">
    <button class="qbtn yb-chron" id="yb-chron" title="Chronicle (Shift+C)">📜<span class="yb-badge" id="yb-badge" hidden></span></button>
    <button class="qbtn yb-replay" id="yb-replay" title="Time-lapse replay (Shift+H)">⟲</button>`;
  const spacer = mb.querySelector('.spacer');
  mb.insertBefore(bar, spacer || null);
  ui.play = $('yb-play'); ui.label = $('yb-label'); ui.speed = $('yb-speed'); ui.badge = $('yb-badge');
  ui.play.onclick = () => { S.toggle(); ui.play.blur(); };
  ui.speed.value = S.speedIdx;
  ui.speed.addEventListener('input', () => S.setSpeed(+ui.speed.value));
  ui.speed.addEventListener('change', () => ui.speed.blur());
  ui.speed.addEventListener('pointerup', () => setTimeout(() => ui.speed.blur(), 0));
  $('yb-chron').onclick = () => { S.openChronicle(); $('yb-chron').blur(); };
  $('yb-replay').onclick = () => { S.toggleReplay(); $('yb-replay').blur(); };
  ui.label.onclick = () => S.openChronicle();
  // viewport chip for when the panels (and so the menubar) are hidden
  const vp = $('viewport');
  if (vp) { ui.chip = mk('div', '', ''); ui.chip.id = 'yearchip'; vp.appendChild(ui.chip); ui.chip.onclick = () => S.toggle(); }
  buildChronicle();
  labelDirty = btnDirty = chronDirty = true;
  refreshDom();
  maybeCoach();
}

let lastHasWorld = false;
function refreshDom() {
  if (!ui) return;
  const hw = !!(D.UI && D.UI.hasWorld);
  if (hw !== lastHasWorld) { lastHasWorld = hw; btnDirty = true; labelDirty = true; if (hw) setTimeout(maybeCoach, 800); }
  if (S.holdWhy !== lastHold) labelDirty = true;   // the held reason changes without an event
  if (labelDirty) { labelDirty = false; refreshLabel(); }
  if (btnDirty) { btnDirty = false; refreshButtons(); }
  if (chronDirty && now() - chronT > 400) { chronT = now(); if (chronVisible()) { chronDirty = false; renderChronicle(); } }
  if (replayBarDirty && ui.rb) { replayBarDirty = false; refreshReplayBar(); }
  if (away && S.catchingUp) veilTick();
  slipTick();
}
let lastHold = '';
function refreshLabel() {
  let txt, tip, dim = false;
  if (S.replaying) { txt = S.viewYear === null ? 'The present · ' + dateLabel(S.q) : 'Replay · ' + Math.floor(S.viewYear); tip = 'Time-lapse replay (Esc returns to the present)'; }
  else if (!S.started && S.beginning) { txt = 'Surveying the land…'; tip = 'History is about to begin'; dim = true; }
  else if (!S.started) { txt = dateLabel(Q0); tip = 'Press ▶ and let history unfold'; dim = true; }
  else {
    txt = dateLabel(S.q);
    const why = S.holdWhy;
    if (why === 'redo available' && S.running) { txt += ' · held'; tip = 'Held · redo available. Press ▶ to carry on (the undone steps are forgotten)'; dim = true; }
    else if (why && S.running) { txt += ' …'; tip = 'History is waiting: ' + why; dim = true; }
    else tip = S.running ? `${SPEED_NAMES[S.speedIdx]} · ${S.ypm()} years a minute` : 'History is paused';
  }
  if (ui.label._t !== txt) { ui.label.textContent = txt; ui.label._t = txt; }
  if (ui.label._tip !== tip) { ui.label.title = tip; ui.label._tip = tip; }
  ui.label.classList.toggle('dim', dim);
  if (ui.chip) { const c = (S.running && !heldForRedo() ? '⏸ ' : '▶ ') + txt; if (ui.chip._t !== c) { ui.chip.textContent = c; ui.chip._t = c; } }
  lastHold = S.holdWhy;
}
function refreshButtons() {
  const playing = S.running && !heldForRedo();
  ui.play.textContent = playing ? '⏸' : '▶';
  ui.play.title = heldForRedo() ? 'Held · redo available. Press to carry on (forgets the undone steps)' : playing ? 'Pause history (Shift+P)' : 'Play history (Shift+P)';
  ui.play.classList.toggle('pulse', !S.started && !S.beginning && !!(D.UI && D.UI.hasWorld));
  ui.play.classList.toggle('held', heldForRedo());
  if (+ui.speed.value !== S.speedIdx) ui.speed.value = S.speedIdx;
  ui.speed.title = 'History speed: ' + SPEED_NAMES[S.speedIdx] + ' (`)';
  if (unread > 0) { ui.badge.hidden = false; ui.badge.textContent = unread > 99 ? '99+' : unread; } else ui.badge.hidden = true;
}

function shimmer() {
  if (!ui || S.catchingUp) return;
  ui.label.classList.remove('shimmer'); void ui.label.offsetWidth; ui.label.classList.add('shimmer');
  setTimeout(() => ui && ui.label.classList.remove('shimmer'), 1300);
}

// ---- coach mark ------------------------------------------------------------------------------------------
function maybeCoach() {
  if (!ui || S.started || S.beginning) return;
  const prefs = D.Save && D.Save.loadPrefs ? D.Save.loadPrefs() : {};
  if (prefs.storyCoach || !(D.UI && D.UI.hasWorld)) return;
  if ($('story-coach')) return;
  const c = mk('div', '', 'Press ▶ and let history unfold<span class="x" title="Dismiss">×</span>');
  c.id = 'story-coach';
  document.body.appendChild(c);
  const r = ui.play.getBoundingClientRect();
  c.style.left = Math.max(8, r.left - 10) + 'px'; c.style.top = (r.bottom + 9) + 'px';
  c.onclick = () => dismissCoach();
}
function dismissCoach() {
  const c = $('story-coach'); if (c) c.remove();
  if (D.Save && D.Save.prefs) D.Save.prefs({ storyCoach: true });
}

// ---- chronicle panel --------------------------------------------------------------------------------------
function buildChronicle() {
  if (!D.UI || !D.UI.panel) return;
  const body = mk('div', '', `<div class="chr-filters chips" id="chr-filters"></div><div class="chr-list" id="chr-list"></div>`);
  ui.chron = D.UI.panel('chron', 'Chronicle', body, { flush: true, before: 'world' });
  const items = [['all', 'All'], ['places', 'Places'], ['roads', 'Roads'], ['works', 'Works'], ['lands', 'Lands']];
  if (D.UI.chips) ui.chronChips = D.UI.chips($('chr-filters'), items, () => chronFilter, v => { chronFilter = v; chronLimit = 300; chronDirty = true; chronT = 0; });
  ui.chron.h.addEventListener('click', () => { if (!ui.chron.p.classList.contains('collapsed')) { markRead(); chronDirty = true; chronT = 0; } });
  $('chr-list').addEventListener('click', onChronClick);
  $('chr-list').addEventListener('mouseover', onChronHover);
  $('chr-list').addEventListener('mouseleave', () => ping(null));
}
function chronVisible() { return !!(ui && ui.chron && !ui.chron.p.classList.contains('collapsed') && ui.chron.p.offsetParent !== null); }
function markRead() { if (unread) { unread = 0; btnDirty = true; } }
S.openChronicle = function () {
  if (!ui || !ui.chron) return;
  const app = $('app');
  if (app && app.classList.contains('no-panels') && !(D.UI && D.UI.photo) && !(D.Cam && D.Cam.mode !== 'orbit')) { if (D.UI.togglePanels) D.UI.togglePanels(); }
  ui.chron.p.classList.remove('collapsed');
  markRead();
  chronDirty = true; chronT = 0; refreshDom();
  try { ui.chron.p.scrollIntoView({ block: 'nearest' }); } catch (err) { }
};
function rowDate(e) { return e[E.IMP] >= 3 ? dateLabel(e[E.Q], true) + ':' : (e[E.Q] >> 2) + ' ·'; }
function renderChronicle() {
  const list = $('chr-list'); if (!list) return;
  const vy = S.replaying && S.viewYear !== null ? S.viewYear : Infinity;
  let html = '', n = 0, lastDec = null, more = false;
  if (!log.length) html = `<div class="chr-empty">${S.started ? 'Nothing written yet.' : 'The chronicle is blank. Press ▶ to begin it.'}</div>`;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i], cat = CAT[e[E.K]] || 'places';
    if (chronFilter !== 'all' && cat !== chronFilter && cat !== 'away') continue;
    if (n >= chronLimit) { more = true; break; }
    const y = e[E.Q] >> 2, dec = Math.floor(y / 10) * 10;
    if (dec !== lastDec) { html += `<div class="chr-dec">${dec}s</div>`; lastDec = dec; }
    const cls = 'chr-row imp' + e[E.IMP] + (e[E.Q] / 4 > vy ? ' future' : '');
    html += `<div class="${cls}" data-i="${i}"><span class="chr-ic">${ICON[e[E.K]] || '•'}</span><span class="chr-t"><span class="chr-d">${rowDate(e)}</span> ${esc(e[E.TXT])}</span></div>`;
    n++;
  }
  if (more) html += `<div class="chr-more" data-more="1">Show older…</div>`;
  list.innerHTML = html;
}
function rowEntry(t) { const r = t.closest && t.closest('.chr-row'); if (!r) return null; return log[+r.dataset.i] || null; }
function onChronClick(ev) {
  if (ev.target.closest('.chr-more')) { chronLimit += 300; chronDirty = true; chronT = 0; refreshDom(); return; }
  const e = rowEntry(ev.target); if (!e) return;
  if (S.replaying) S.setReplayYear(e[E.Q] / 4 + 0.2);
  S.flyTo(e);
}
function onChronHover(ev) { ping(rowEntry(ev.target)); }
// P2: a DOM ping ring at the entry's spot while its row is hovered
function ping(e) {
  let r = $('story-ping');
  if (!e || !D.camera || typeof THREE === 'undefined' || !THREE.Vector3 || !D.Terrain) { if (r) r.hidden = true; return; }
  const vp = $('viewport'); if (!vp) return;
  let x = e[E.X], z = e[E.Z];
  if (!x && !z) { if (r) r.hidden = true; return; }
  const v = new THREE.Vector3(x, D.Terrain.hAt ? D.Terrain.hAt(D.clamp(x, 0, D.SIZE), D.clamp(z, 0, D.SIZE)) : 0, z).project(D.camera);
  if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { if (r) r.hidden = true; return; }
  if (!r) { r = mk('div', '', ''); r.id = 'story-ping'; vp.appendChild(r); }
  r.hidden = false;
  r.style.left = ((v.x + 1) / 2 * vp.clientWidth) + 'px'; r.style.top = ((1 - v.y) / 2 * vp.clientHeight) + 'px';
}

// ---- parchment slips (P1) -----------------------------------------------------------------------------------
function onLog(ent) {
  chronDirty = true;
  if (ent[E.IMP] >= 3) shimmer();
  if (!ui || S.catchingUp || S.replaying || ent[E.IMP] < 2) return;
  if (S.speedIdx >= 4 && ent[E.IMP] < 3) return;
  let txt = ent[E.TXT];
  if (ent[E.K] === 'work1' && ent[E.IMP] >= 3 && !(D.Audio && D.Audio.on)) txt += ' The bells ring across the shire.';
  slipQ.push({ ent, txt });
  while (slipQ.length > 3) { const i = slipQ.findIndex(s => s.ent[E.IMP] < 3); slipQ.splice(i >= 0 ? i : 0, 1); }
}
function slipTick() {
  if (slipEl && now() < slipTimer) return;
  if (slipEl) { const old = slipEl; slipEl = null; old.classList.add('out'); setTimeout(() => old.remove(), 450); }
  if (!slipQ.length || S.catchingUp) return;
  const vp = $('viewport'); if (!vp) return;
  const s = slipQ.shift(), e = s.ent;
  const el = mk('div', 'story-slip imp' + e[E.IMP], `<div class="ss-d">${esc(rowDate(e))}</div><div class="ss-t">${esc(s.txt)}</div>`);
  el.title = 'Click to go there';
  el.onclick = () => { S.flyTo(e); slipTimer = 0; };
  vp.appendChild(el);
  slipEl = el; slipTimer = now() + (e[E.IMP] >= 3 ? 9000 : 6000);
}

// ---- away card (§3.4) --------------------------------------------------------------------------------------
function showVeil() {
  const vp = $('viewport'); if (!vp) return;
  closeAway();
  const v = mk('div', '', `<div class="sa-card"><div class="sa-glass">⌛</div><div class="sa-title">The years pass…</div>
    <div class="sa-year" id="sa-year">${S.q >> 2}</div><div class="sa-sub" id="sa-sub"></div>
    <div class="btnrow sa-btns"><button class="btn small" id="sa-stop">Stop here</button></div></div>`);
  v.id = 'story-away';
  vp.appendChild(v);
  $('sa-stop').onclick = () => { if (S.catchingUp) { away.hurried = true; finishCatchUp(true); } };
}
function veilTick() {
  const y = $('sa-year'); if (!y || !away) return;
  const t = String(S.q >> 2); if (y.textContent !== t) y.textContent = t;
  const sub = $('sa-sub'); if (sub) { const k = away.total - away.left; const s = `${k} of ${away.total} seasons`; if (sub.textContent !== s) sub.textContent = s; }
}
function showSummary() {
  const v = $('story-away'); if (!v || !away) return;
  const list = awayEntries(away), top = topEntries(list, 6);
  const span = `${dateLabel(away.fromQ + 1)} → ${dateLabel(away.toQ)}`;
  v.classList.add('done');
  v.innerHTML = `<div class="sa-card sum"><div class="sa-title">While you were away</div>
    <div class="sa-sub">${span}: ${list.length} ${list.length === 1 ? 'happening' : 'happenings'}</div>
    ${away.hurried ? `<div class="sa-note">History hurried as far as ${away.toQ >> 2}.</div>` : ''}
    <div class="sa-list">${top.map((e, i) => `<div class="sa-row imp${e[E.IMP]}" data-k="${i}"><span class="chr-ic">${ICON[e[E.K]] || '•'}</span><span><span class="chr-d">${esc(rowDate(e))}</span> ${esc(e[E.TXT])}</span></div>`).join('') || '<div class="muted">A quiet time: nothing of note.</div>'}</div>
    ${list.length > top.length ? `<div class="sa-more">and ${list.length - top.length} more</div>` : ''}
    <div class="btnrow sa-btns">${list.length ? '<button class="btn small" id="sa-watch">▶ Watch these years</button>' : ''}<button class="btn small primary" id="sa-ok">Carry on</button></div></div>`;
  v.querySelectorAll('.sa-row').forEach(r => { r.onclick = () => S.flyTo(top[+r.dataset.k]); });
  const a = away;
  $('sa-ok').onclick = () => closeAway();
  const w = $('sa-watch'); if (w) w.onclick = () => { closeAway(); S.enterReplay((a.fromQ + 1) / 4, (a.toQ + 1) / 4); };
}
function closeAway() { const v = $('story-away'); if (v) v.remove(); }

// ---- replay bar ---------------------------------------------------------------------------------------------
function buildReplayBar() {
  const vp = $('viewport'); if (!vp || $('replaybar')) return;
  const b = mk('div', '', `<div class="rb-year" id="rb-year"></div>
    <div class="rb-track"><div class="rb-ticks" id="rb-ticks"></div><input type="range" id="rb-range" step="0.25"></div>
    <div class="rb-btns"><button class="btn small" id="rb-play" title="Play (5 years a second)">▶</button>
    <button class="btn small" id="rb-present">Return to the present</button><span class="rb-esc">Esc</span></div>`);
  b.id = 'replaybar';
  vp.appendChild(b); vp.classList.add('replaying');
  const R = $('rb-range');
  R.addEventListener('input', () => { replayPlay = null; S.setReplayYear(+R.value); });
  R.addEventListener('change', () => R.blur());
  R.addEventListener('pointerup', () => setTimeout(() => R.blur(), 0));
  $('rb-play').onclick = () => {
    if (replayPlay) replayPlay = null;
    else { if (S.viewYear === null) S.setReplayYear(firstYear()); replayPlay = { to: S.t, exit: false }; }
    $('rb-play').blur(); replayBarDirty = true;
  };
  $('rb-present').onclick = () => S.exitReplay();
  if (ui) ui.rb = b;
  layoutTicks();
  replayBarDirty = true; refreshDom();
}
function replayMax() { return S.t + 0.5; }   // the extra half-year detent is "Present" (filter off)
function layoutTicks() {
  const R = $('rb-range'), T = $('rb-ticks'); if (!R || !T) return;
  const a = firstYear(), b = replayMax();
  R.min = a; R.max = b;
  let html = '';
  const pos = y => ((y - a) / (b - a) * 100).toFixed(2) + '%';
  for (let c = Math.ceil(a / 100) * 100; c <= S.t; c += 100) html += `<i class="rb-c" style="left:${pos(c)}"><b>${c}</b></i>`;
  for (const e of log) if (e[E.IMP] >= 3 && e[E.Q] / 4 >= a) html += `<i class="rb-h" style="left:${pos(e[E.Q] / 4)}" title="${esc(rowDate(e) + ' ' + e[E.TXT])}"></i>`;
  html += `<i class="rb-p" style="left:100%"><b>Present</b></i>`;
  T.innerHTML = html;
}
function refreshReplayBar() {
  const R = $('rb-range'), Y = $('rb-year'); if (!R || !Y) return;
  const v = S.viewYear === null ? replayMax() : S.viewYear;
  if (document.activeElement !== R) R.value = v;
  Y.textContent = S.viewYear === null ? 'The present' : String(Math.floor(S.viewYear));
  const p = $('rb-play'); if (p) p.textContent = replayPlay ? '⏸' : '▶';
}
function closeReplayBar() {
  const b = $('replaybar'); if (b) b.remove();
  const vp = $('viewport'); if (vp) vp.classList.remove('replaying');
  if (ui) ui.rb = null;
}

// ================================================================================
// Init
// ================================================================================
S.init = function () {
  const H = D.History;
  H.regObj('story', { save: snapState, load: loadState, bytes: stateBytes });
  D.on('history', onHistory);
  D.on('restored', onRestored);
  D.on('stroke:end', () => { if (!S.committing) lastPlayerEdit = now(); });   // (a part's own edits never count as the player's)
  D.on('world:reset', () => S.reset());
  D.on('story:log', onLog);
  D.on('works:done', () => shimmer());
  D.on('ui:ready', buildUI);
  D.on('world:generated', () => { btnDirty = true; labelDirty = true; setTimeout(maybeCoach, 800); });
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hiddenAt = now();
      else if (hiddenAt) { const sec = (now() - hiddenAt) / 1000; hiddenAt = 0; lastFrameT = 0; owe(sec); }
    });
  }
  afterClockChange();
};

// ================================================================================
// Dev / test surface
// ================================================================================
function devGate() {
  const H = D.History;
  if (H.active()) return 'an edit is open';
  if (H.pos !== H.entries.length) return 'redo available';
  if (S.catchingUp || S.replaying) return 'catching up / replaying';
  for (const p of parts) if (!p.disabled && p.busy) { try { if (p.busy()) return p.name + ' busy'; } catch (err) { } }
  return '';
}
// hook(phase, recorded): 'pre' before each commit, 'post' after it (recorded: the season added or folded an entry)
function devStep(n, hook) {
  n = n === undefined ? 1 : n | 0;
  let c = 0;
  if (!S.started && !S.beginning) { S.beginning = true; emit('story:prepare'); }
  for (let i = 0; i < n; i++) {
    let why = devGate();
    // a part still preparing (site-grid scan, the yearly traffic job, a survey): drive its async update like frames
    // would, for up to 5 s of wall time (the director's rescan is throttled to 4 Hz of real time)
    const spinEnd = now() + 5000;
    for (let spin = 0; why && / busy$/.test(why) && now() < spinEnd; spin++) {
      for (const p of parts) if (!p.disabled && p.update) { try { p.update(1 / 60); } catch (err) { partError(p, err, 'update'); } }
      // the director waits on the town planner (Town.hist.list is keyed by plans), which runs in City.update
      if (spin % 8 === 7 && D.City && D.City.update) { try { D.City.update(1 / 60, D.Cam && D.Cam.camera); } catch (err) { console.warn('[story] step: town update', err); } }
      why = devGate();
    }
    if (why) { console.warn('[story] step stopped:', why); break; }
    if (hook) hook('pre');
    if (commitSeason(false)) c++;
    if (hook) hook('post', lastRecorded);
  }
  S.t = Math.min(S.t, (S.q + 1) / 4 - EPS);
  labelDirty = true; refreshDom();
  return c;
}
function hashArr(a) {
  if (!a) return 0;
  const u = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
  return h >>> 0;
}
const jsonHash = o => { try { return D.hashStr(JSON.stringify(o, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v)); } catch (err) { return -1; } };
// volatile, by design outside undo: id counters (roads next, town nextUid/nextJob) never rewind, and t is only
// pinned to its season (the before-snapshot is taken at the boundary the run started from)
function stateHash() {
  const H = D.History, W = D.W || {};
  const st = S.serialize(); delete st.clock.running; delete st.clock.speedIdx; delete st.clock.branch; delete st.clock.follow; delete st.unread; delete st.clock.t;
  const rd = D.Roads && D.Roads.serialize ? D.Roads.serialize() : null, tw = D.Town && D.Town.serialize ? D.Town.serialize() : null;
  if (rd) delete rd.next;
  if (tw) { delete tw.nextUid; delete tw.nextJob; }
  return {
    zone: hashArr(W.zone), realm: H.arrays.realm ? hashArr(H.arrays.realm.data) : 0,
    roads: rd ? jsonHash(rd) : 0, town: tw ? jsonHash(tw) : 0, story: jsonHash(st)
  };
}
// let the town planner finish its pending jobs (they are replanned deterministically after undo/redo)
function settleTowns() {
  const T = D.Town, C = D.City;
  if (!T || !T.hist || !T.hist.busy || !C || !C.update) return 0;
  let i = 0;
  for (; i < 3000; i++) { let b = 0; try { b = T.hist.busy(); } catch (err) { } if (!b) break; try { C.update(1 / 60, D.Cam && D.Cam.camera); } catch (err) { break; } }
  return i;
}
const diffKeys = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]);
let guard = null;
function guardSnap() {
  const W = D.W || {};
  return {
    h: hashArr(W.h), biome: hashArr(W.biome), paint: hashArr(W.paint),
    roads: D.Roads && D.Roads.playerHash ? D.Roads.playerHash() : '',
    nature: D.Nature && D.Nature.count ? D.Nature.count() : 0,
    manual: D.Town && D.Town.manualCount ? D.Town.manualCount() : -1,
    // playerHash deliberately ignores road profiles (they resample on split); the profile half of I2
    // compares R.playerProfiles() snapshots with a tolerance instead (R.playerProfileDelta, metres)
    prof: D.Roads && D.Roads.playerProfiles ? D.Roads.playerProfiles() : null,
    top: D.History.entries.filter(e => !e.merge).length
  };
}
S._dev = {
  step: devStep,
  // I1–I3 (partial): the first call arms a baseline of player-owned state; later calls compare.
  // Player edits since the baseline re-arm it (they are allowed to change it).
  check() {
    const problems = [];
    if (D.History.active()) problems.push('I1: a History entry is open outside a stroke');
    if (S.committing) problems.push('I1: committing flag stuck');
    // I2 (§11.6): no manual building is overlapped / suppressed by a settlement (absolute, needs no baseline)
    const TD = D.Town && D.Town._dev, ov = TD && TD.manualOverlaps ? TD.manualOverlaps() : null;
    if (ov && ov.length) problems.push(`I2: ${ov.length} manual building(s) overlapped (${ov.slice(0, 3).join(', ')})`);
    const g = guardSnap();
    if (!guard || guard.top !== g.top) { const re = !!guard; guard = g; return { ok: !problems.length, armed: true, rearmed: re, problems }; }
    ['h', 'biome', 'paint', 'roads', 'nature', 'manual'].forEach(k => { if (guard[k] !== g[k]) problems.push(`I2: ${k} changed by history (${guard[k]} → ${g[k]})`); });
    if (guard.prof && g.prof && D.Roads.playerProfileDelta) {
      const dp = D.Roads.playerProfileDelta(guard.prof, g.prof);
      if (dp > 0.1) problems.push(`I2: player road re-profiled by history (max ${isFinite(dp) ? dp.toFixed(2) + ' m' : 'record set changed'})`);
    }
    // I3: a director zone never touches a different settlement of the same type (8-neighbourhood)
    const W = D.W, T = D.Town, Z = W && W.zone, N = D.N;
    if (Z && T && T.hist && T.hist.list) {
      const byH = new Set(); for (const s of T.hist.list()) if (s.by === 'h') byH.add(s.sid);
      let bad = 0;
      if (byH.size) for (let j = 1; j < N - 1 && bad < 20; j++) for (let i = 1; i < N - 1; i++) {
        const k = (j * N + i) * 4, g0 = Z[k + 1]; if (!g0) continue;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const k2 = ((j + dj) * N + i + di) * 4, g1 = Z[k2 + 1];
          if (g1 && g1 !== g0 && Z[k2] === Z[k] && (byH.has(g0) || byH.has(g1))) bad++;
        }
      }
      if (bad) problems.push(`I3: ${bad} director cell contacts with a same-type neighbour`);
    }
    return { ok: !problems.length, problems };
  },
  bench(n) {
    // times only commitSeason; parts still preparing are driven like frames would (devStep's spin), so a busy
    // director/wayfarer no longer ends the bench after the first season
    n = n || 40; const ms = [], bySeason = [0, 0, 0, 0]; let a = 0, sq = 0;
    devStep(n, ph => {
      if (ph === 'pre') { sq = (S.q + 1) & 3; a = now(); return; }
      const d = now() - a; ms.push(d); bySeason[sq] = Math.max(bySeason[sq], +d.toFixed(2));
    });
    ms.sort((a, b) => a - b);
    const pct = p => ms.length ? +ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2) : 0;
    return { n: ms.length, p50: pct(0.5), p95: pct(0.95), max: pct(1), maxBySeason: { spring: bySeason[0], summer: bySeason[1], autumn: bySeason[2], winter: bySeason[3] } };
  },
  // I5: n seasons as one fresh run; undo must restore the exact before-state, redo the after-state
  roundTrip(n) {
    const H = D.History; n = n || 20;
    if (devGate()) return { ok: false, why: devGate() };
    if (!S.started) devStep(1);
    runSalt = ++runSeq;
    // a season that changes nothing moves the clock (and part bookkeeping) outside history by design (§3.2), so
    // undo is compared with the state just before the FIRST recorded season, redo with the one after the LAST
    const pos0 = H.pos;
    let pre = null, before = null, after = null;
    const c = devStep(n, (ph, rec) => {
      if (ph === 'pre') { settleTowns(); pre = before ? null : stateHash(); return; }
      if (!rec) return;
      if (!before) before = pre;
      settleTowns(); after = stateHash();
    });
    runSalt = 0;
    if (H.pos === pos0 || !before) return { ok: true, note: 'no season changed anything', steps: c };
    const runs = H.pos - pos0;
    for (let i = 0; i < runs; i++) H.undo();
    settleTowns();
    const u = stateHash();
    for (let i = 0; i < runs; i++) H.redo();
    settleTowns();
    const r = stateHash();
    const du = diffKeys(before, u), dr = diffKeys(after, r);
    return { ok: !du.length && !dr.length, steps: c, entries: runs, undoDiff: du, redoDiff: dr };
  },
  hideFor(sec) { return owe(+sec || 0); },
  gate: catchUp => gate(!!catchUp),
  state: () => ({ q: S.q, t: S.t, label: dateLabel(S.q), started: S.started, running: S.running, hold: S.holdWhy, owed: owedSeasons, parts: parts.map(p => p.name + (p.disabled ? ' (disabled)' : '')), log: log.length })
};
S._pure = { dateLabel, advanceClock, owedYears, packEntry, unpackEntry, capLog, topEntries, diffKnownPure, foundText, words };
})();
