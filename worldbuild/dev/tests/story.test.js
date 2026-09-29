// Story core: history merge folds, the season clock and commit gate, catch-up, chronicle.
import { load, test, assert, eq, near } from './harness.js';

// ---- history.js -------------------------------------------------------------------------------------
function hist(opts = {}) {
  const D = load(['js/core.js', 'js/history.js']);
  const H = D.History;
  const data = new Uint8Array(64 * 64);
  const restoredRects = [];
  H.regArray('a', { get data() { return data; }, ch: 1, res: 64, onRestore: (a, b, c, d) => restoredRects.push([a, b, c, d]) });
  const obj = { v: 0, list: [] };
  H.regObj('o', { save: () => ({ v: obj.v, list: obj.list.slice() }), load: s => { obj.v = s.v; obj.list = s.list.slice(); }, bytes: opts.bytes });
  const ev = [];
  D.on('changed', a => ev.push(['changed', a]));
  D.on('restored', (e, w) => ev.push(['restored', w]));
  return { D, H, data, obj, ev, restoredRects };
}
const relabel = (a, b) => 'History ' + (a === b ? a : a + '–' + b);
function season(T, y, i, merge = 'story') {
  T.H.begin('History ' + y, 'story', { merge, y, relabel });
  T.H.touch('a', i, 0, i, 0); T.data[i] = 10 + y % 100;
  T.H.touchObj('o'); T.obj.v = y; T.obj.list.push(y);
  return T.H.end();
}

test('history: merge entries fold into one run; undo restores the original, redo the final state', () => {
  const T = hist();
  const e1 = season(T, 1100, 3), e2 = season(T, 1101, 40), e3 = season(T, 1102, 3);
  eq(T.H.entries.length, 1, 'one entry');
  assert(e1 === e2 && e2 === e3, 'fold returns the previous entry');
  eq(T.H.entries[0].label, 'History 1100–1102');
  eq([T.H.entries[0].y0, T.H.entries[0].y1], [1100, 1102]);
  const fin = { d3: T.data[3], d40: T.data[40], v: T.obj.v, list: T.obj.list.slice() };
  T.H.undo();
  eq([T.data[3], T.data[40], T.obj.v, T.obj.list], [0, 0, 0, []], 'undo restores original');
  T.H.redo();
  eq([T.data[3], T.data[40], T.obj.v, T.obj.list], [fin.d3, fin.d40, fin.v, fin.list], 'redo restores final');
  assert(T.ev.some(x => x[0] === 'changed' && x[1] === 'story'), "merge entries emit 'changed' with 'story'");
  assert(T.ev.some(x => x[0] === 'restored' && x[1] === 'before') && T.ev.some(x => x[0] === 'restored' && x[1] === 'after'), "'restored' carries which");
});

test('history: a player entry in between breaks the run; redo branch prevents folding', () => {
  const T = hist();
  season(T, 1100, 1);
  T.H.begin('Raise', 'raise'); T.H.touch('a', 9, 9, 9, 9); T.data[9 * 64 + 9] = 7; T.H.end();
  season(T, 1101, 2);
  eq(T.H.entries.length, 3);
  assert(T.ev.some(x => x[0] === 'changed' && x[1] === undefined), "player entries emit plain 'changed'");
  T.H.undo();                       // redo branch now exists
  eq(T.H.pos, 2);
  season(T, 1102, 5);               // a new merge entry cannot fold into prev while pos < length: redo is dropped instead
  eq(T.H.entries.length, 3, 'redo branch replaced, not folded');
  eq(T.H.entries[2].y0, 1102);
});

test('history: the 10-year span cap and the 64 MB byte cap split runs; away runs have no span cap', () => {
  const T = hist();
  season(T, 1100, 1); season(T, 1109, 2); season(T, 1110, 3);
  eq(T.H.entries.length, 2, 'span cap');
  eq(T.H.entries[0].label, 'History 1100–1109');
  const B = hist({ bytes: () => 17e6 });   // before+after = 34 MB per season
  season(B, 1100, 1); season(B, 1101, 2);
  eq(B.H.entries.length, 2, 'byte cap');
  const A = hist();
  season(A, 1100, 1, 'away:1'); season(A, 1150, 2, 'away:1');
  eq(A.H.entries.length, 1, 'away: no span cap');
  season(A, 1151, 3, 'away:2');
  eq(A.H.entries.length, 2, 'a different away key starts a new run');
});

test('history: fold keeps byte accounting exact', () => {
  const T = hist({ bytes: s => 100 + s.list.length });
  season(T, 1100, 1); season(T, 1101, 1); season(T, 1102, 33);
  const e = T.H.entries[0];
  const tiles = 2 * (1024 * 2);   // tiles a:0:0 and a:1:0 (32x32x1 bytes), before + after each
  const objs = (100 + 0) + (100 + 3);
  eq(e.bytes, tiles + objs, 'entry bytes');
  eq(T.H.bytes, e.bytes, 'stack bytes');
});

test('history: abort leaves nothing behind; dropRedo accounts bytes', () => {
  const T = hist();
  T.H.begin('x', 'story', { merge: 'story', y: 1100 }); T.H.touch('a', 0, 0, 0, 0); T.data[0] = 5; T.H.abort();
  eq([T.H.active(), T.H.entries.length, T.H.bytes, T.data[0]], [false, 0, 0, 5], 'abort: no entry, no restore');
  season(T, 1100, 1);
  T.H.begin('Raise', 'raise'); T.H.touch('a', 50, 50, 50, 50); T.data[50 * 64 + 50] = 1; T.H.end();
  const b0 = T.H.entries[0].bytes;
  T.H.undo();
  T.H.dropRedo();
  eq([T.H.entries.length, T.H.pos, T.H.bytes], [1, 1, b0]);
});

// ---- story.js -------------------------------------------------------------------------------------
function world(opts = {}) {
  let clock = 1000;
  const D = load(['js/core.js', 'js/history.js', 'js/story.js'], { now: () => clock });
  const S = D.Story;
  D.UI = { hasWorld: true };
  const places = opts.places || [];
  D.Town = { histPace: 1, hist: { list: () => places, busy: () => 0, setCatchUp() { } } };
  const zone = new Uint8Array(64);
  D.History.regArray('z', { get data() { return zone; }, ch: 1, res: 8, onRestore() { } });
  const seen = [];
  const part = {
    order: 10, calls: 0, state: 0,
    season(ctx) { this.calls++; seen.push(ctx.q); if (opts.act && opts.act(ctx)) { D.History.touch('z', 0, 0, 7, 7); zone[ctx.q % 64]++; this.state++; ctx.mark(); } if (opts.boom && opts.boom(ctx)) throw new Error('boom'); },
    snap() { return this.state; }, restore(s) { this.state = s || 0; },
    serialize() { return { v: 1, state: this.state }; }, deserialize(o) { this.state = o ? o.state : 0; }
  };
  S.init();
  S.register('test', part);
  const ev = {};
  ['story:season', 'story:year', 'story:begin', 'story:log', 'story:catchup', 'story:restored', 'story:prepare'].forEach(k => D.on(k, (...a) => (ev[k] = ev[k] || []).push(a)));
  const tick = (sec, dt = 0.1) => { for (let t = 0; t < sec - 1e-9; t += dt) { clock += dt * 1000; S.update(dt); } };
  return { D, S, part, zone, seen, ev, tick, adv: ms => { clock += ms; }, places };
}

test('story: pure clock maths holds at the boundary and never double-steps', () => {
  const { S } = world();
  const P = S._pure;
  const q = 1100 * 4 + 1;
  let a = P.advanceClock(q / 4, q, 0.1, 40);
  assert(!a.due && a.t > q / 4, 'advances');
  a = P.advanceClock(q / 4, q, 600, 40);   // ten minutes in one step still only reaches the edge
  eq(a, { t: (q + 1) / 4, due: true });
  near(P.owedYears(360, 4, 25), 24, 1e-9); eq(P.owedYears(3600, 40, 25), 25); eq(P.owedYears(100, 0, 25), 0);
  eq(P.dateLabel(1142 * 4), 'Spring 1142'); eq(P.dateLabel(1203 * 4 + 2, true), 'Michaelmas 1203');
});

test('story: the begin commit, one season per frame at Rapid, and a single folded run', () => {
  const W = world({ act: () => true, places: [{ sid: 1, uid: 7, name: 'Ashby', type: 1, ms: 1, walls: 'none', morph: 'village', x: 100, z: 200 }] });
  const { S, D, tick, ev } = W;
  tick(1);
  eq(S.started, false, 'nothing runs before play');
  S.play();
  assert(S.beginning && ev['story:prepare'], 'play prepares');
  tick(0.1);
  assert(S.started && S.q === 1086 * 4, 'begin commit at Spring 1086');
  eq(D.History.entries.length, 1); eq(D.History.entries[0].label, 'Chronicle begins');
  eq(S.events()[0][1], 'begin');
  assert(/Here begins the chronicle/.test(S.events()[0][5]), 'begin text');
  eq(S._known.get(7)[0], 'Ashby', 'begin adopts existing places silently');
  S.setSpeed(4);                 // rapid: a season every 0.375 s
  const q0 = S.q;
  S.update(10);                  // a monstrous frame still commits at most one season
  eq(S.q, q0 + 1, 'no double step');
  tick(3);
  assert(S.q > q0 + 4, 'seasons keep coming');
  eq(D.History.entries.length, 1, 'all folded into one run');
  assert(/^History 1086–108\d$/.test(D.History.entries[0].label), D.History.entries[0].label);
  assert(S.t >= S.q / 4 && S.t < (S.q + 1) / 4, 't stays inside its season');
});

test('story: a season that changed nothing is not an undo step', () => {
  const { S, D, tick } = world({ act: ctx => ctx.first });
  S.play(); tick(0.1);
  const n = D.History.entries.length;
  S.setSpeed(4); tick(2);
  assert(S.q > 1086 * 4 + 2, 'clock moved');
  eq(D.History.entries.length, n, 'no new entries');
  eq(D.History.entries[0].y1, 1086, 'the run was not extended');
});

test('story: grace after a player edit, the redo hold, and play dropping redo', () => {
  const W = world({ act: () => true });
  const { S, D, tick } = W;
  S.play(); tick(0.1); S.setSpeed(4);
  // a player edit
  D.History.begin('Raise', 'raise'); D.History.touch('z', 7, 7, 7, 7); W.zone[63] = 99; D.History.end();
  D.emit('stroke:end');
  const q0 = S.q;
  tick(5);
  eq(S.q, q0, 'held for the grace period');
  eq(S.holdWhy, 'waiting for your edit');
  tick(1.5);
  assert(S.q > q0, 'resumes after 6 s');
  // undo of a player entry (Ctrl+Z inside the grace period) holds the clock (redo available)
  D.History.begin('Raise', 'raise'); D.History.touch('z', 7, 7, 7, 7); W.zone[62] = (W.zone[62] + 77) & 255; D.History.end();
  tick(1);
  eq(D.History.entries[D.History.entries.length - 1].label, 'Raise', 'no season slipped in during the grace');
  D.History.undo();
  const q1 = S.q;
  tick(2);
  eq(S.q, q1, 'held while redo is available');
  eq(S.holdWhy, 'redo available');
  assert(S.running, 'still running (held, not paused)');
  S.toggle();                    // ▶ while held = carry on
  eq(D.History.pos, D.History.entries.length, 'redo dropped');
  tick(4);                       // (the undone edit still owns its 6 s grace)
  assert(S.q > q1, 'carries on');
});

test('story: undo of a story run pauses, turns the clock back and branches; redo goes forward', () => {
  const W = world({ act: () => true });
  const { S, D, tick, part } = W;
  S.play(); tick(0.1); S.setSpeed(4); tick(3);
  const qEnd = S.q, logN = S.events().length, st = part.state;
  D.History.begin('Raise', 'raise'); D.History.touch('z', 7, 7, 7, 7); W.zone[63] = (W.zone[63] + 101) & 255; D.History.end();  // break the run
  tick(7); tick(2);
  const qMid = S.q;
  assert(qMid > qEnd, 'a second run');
  D.History.undo();                // the second story run
  eq([S.running, S.q, S.branch, part.state], [false, qEnd, 1, st], 'paused, turned back, branched, part restored');
  D.History.redo();
  eq(S.q, qMid, 'forward again');
  eq(S.running, false);
  assert(S.events().length >= logN, 'chronicle restored with the world');
});

test('story: a throwing part rolls the whole season back and is disabled after 3 errors', () => {
  let n = 0;
  const W = world({ act: () => true, boom: ctx => !ctx.first && ++n <= 3 });
  const { S, D, tick, part } = W;
  S.play(); tick(0.1); S.setSpeed(4);
  const before = W.zone.slice(), q0 = S.q, entries = D.History.entries.length, bytes = D.History.bytes;
  S.update(0.4);                   // first failing season
  eq(Array.from(W.zone), Array.from(before), 'world rolled back');
  eq(S.q, q0 + 1, 'the clock still advances');
  eq([D.History.entries.length, D.History.bytes, D.History.active()], [entries, bytes, false], 'no entry left behind');
  tick(1);
  assert(part.disabled, 'disabled after 3 errors');
  const q1 = S.q; tick(1);
  assert(S.q > q1, 'history carries on without it');
});

test('story: small absences run silently; long ones catch up under an away key', () => {
  const W = world({ act: () => true });
  const { S, D, tick, ev } = W;
  S.play(); tick(0.1); S.setSpeed(2);    // normal: 4 years a minute
  const q0 = S.q;
  S._dev.hideFor(20);                    // 1.33 years owed -> 5 seasons, no veil
  assert(!S.catchingUp, 'no veil under 2 years');
  S.update(0.016); S.update(0.016);
  assert(S.q - q0 >= 5, 'owed seasons processed up to 4 a frame: ' + (S.q - q0));
  const q1 = S.q;
  S._dev.hideFor(360);                   // 24 years
  assert(S.catchingUp, 'veil');
  eq(ev['story:catchup'][0][0].phase, 'start');
  tick(5, 0.05);
  assert(!S.catchingUp, 'finished');
  assert(S.q - q1 >= 96 && S.q - q1 <= 98, 'caught up 24 years (+ the live clock after): ' + (S.q - q1));
  eq(ev['story:catchup'][1][0].phase, 'end');
  const top = D.History.entries.find(e => e.merge === 'away:1');
  assert(top, 'an away run exists');
  assert(/^While you were away \d+–\d+$/.test(top.label), top.label);
});

test('story: chronicle entries, cap and serialize round-trip', () => {
  const W = world({ act: () => true });
  const { S, D, tick } = W;
  S.play(); tick(0.1); S.setSpeed(4); tick(1);
  S.log({ k: 'found', imp: 2, txt: 'Crowfield is founded by the river.', x: 1234.7, z: 88.2, uid: 9 });
  S.log({ k: 'work1', imp: 3, txt: 'Crowfield Cathedral is consecrated, after 43 years.', wid: 3 });
  const snap = JSON.parse(JSON.stringify(S.serialize()));
  eq(snap.v, 1); eq(snap.parts.test.v, 1);
  const e = S.events()[S.events().length - 2];
  eq([e[1], e[2], e[3], e[4], e[6]], ['found', 1234, 88, 9, 2]);
  assert(Object.isFrozen(e), 'entries are frozen');
  const W2 = world();
  W2.S.deserialize(snap);
  eq(JSON.stringify(W2.S.serialize()), JSON.stringify(snap), 'round-trip');
  eq(W2.part.state, W.part.state, 'part state restored');
  W2.S.deserialize(null);
  eq([W2.S.started, W2.S.running, W2.S.events().length, W2.part.state], [false, false, 0, 0], 'null = fresh');
  // unknown parts survive a load/save of a build without that module
  const W3 = world();
  W3.S.deserialize(Object.assign({}, snap, { parts: Object.assign({}, snap.parts, { realm: { v: 1, keep: 'me' } }) }));
  eq(W3.S.serialize().parts.realm, { v: 1, keep: 'me' });
  // cap: imp-1 entries are dropped first
  const P = S._pure;
  const log = []; for (let i = 0; i < 10; i++) log.push(P.packEntry({ k: 'ms', imp: i % 3 ? 2 : 1, txt: 't' + i }, i));
  P.capLog(log, 7);
  eq(log.map(x => x[5]), ['t1', 't2', 't4', 't5', 't7', 't8', 't9']);
});

test('story: diffKnown logs player changes once and adopts silently at the beginning', () => {
  const { S } = world();
  const P = S._pure;
  const known = new Map();
  const L = [{ uid: 1, name: 'Ashby', type: 1, ms: 0, walls: 'none', morph: 'hamlet', x: 1, z: 2 }];
  eq(P.diffKnownPure(known, L, true), [], 'first: silent');
  L[0] = Object.assign({}, L[0], { ms: 1 | 16, walls: 'palisade', morph: 'village', name: 'Ashby' });
  L.push({ uid: 2, name: 'Crowfield', type: 3, ms: 0, walls: 'none', morph: 'castle', x: 5, z: 6 });
  const logs = P.diffKnownPure(known, L, false);
  eq(logs.map(l => l.k).sort(), ['church', 'found', 'morph', 'ms', 'walls']);
  eq(P.diffKnownPure(known, L, false), [], 'nothing twice');
  L[0] = Object.assign({}, L[0], { morph: 'walled town', walls: 'stone', name: 'Ashbury' });
  eq(P.diffKnownPure(known, L, false).map(l => l.txt), ['Ashby is renamed Ashbury.', 'Ashbury is walled in stone.', 'Ashbury is now a town.']);
  const gone = P.diffKnownPure(known, [L[1]], false);
  eq(gone.map(l => [l.k, l.txt]), [['abandon', 'Ashbury is abandoned.']]);
});

test('story: frameSeconds, histPace and replay view state', () => {
  const W = world({ act: () => true });
  const { S, D, tick } = W;
  eq(S.frameSeconds(), 2.2, 'legacy before start');
  S.play(); tick(0.1);
  eq(S.frameSeconds(), 5); eq(D.Town.histPace, 1);
  S.setSpeed(4); eq(S.frameSeconds(), 1.2); eq(D.Town.histPace, 10);
  tick(4);
  const views = []; D.on('story:view', v => views.push(v));
  S.enterReplay(1086.5);
  assert(S.replaying && !S.running, 'replay pauses');
  near(S.displayTime(), 1086.5, 1e-9);
  S.update(0.016); W.adv(300); S.update(0.016);
  eq(views[views.length - 1], 1086.5, 'view emitted (throttled)');
  S.exitReplay();
  eq([S.replaying, S.running, views[views.length - 1]], [false, true, null]);
  near(S.displayTime(), S.t, 1e-9);
});

// ---- review fixes ------------------------------------------------------------------------------------
test('story: a part that throws on the begin commit retries on the next frame', () => {
  let n = 0;
  const W = world({ act: () => true, boom: ctx => ctx.first && ++n === 1 });
  const { S, D, tick } = W;
  S.play(); tick(0.1);
  eq([S.started, S.beginning, S.running, S.q], [false, true, true, 1086 * 4 - 1], 'still beginning after the failed begin');
  eq([D.History.entries.length, D.History.active()], [0, false], 'nothing left behind');
  tick(0.1);
  eq([S.started, S.q, D.History.entries[0].label], [true, 1086 * 4, 'Chronicle begins'], 'begins on the retry');
});

test('story: a bad story:* listener cannot break the commit', () => {
  const W = world({ act: () => true });
  const { S, D, tick } = W;
  D.on('story:season', () => { throw new Error('bad listener'); });
  D.on('story:log', () => { throw new Error('bad listener'); });
  const err = console.error; console.error = () => { };
  try { S.play(); tick(0.1); S.setSpeed(4); tick(2); } finally { console.error = err; }
  assert(S.started && S.q > 1086 * 4 + 2, 'seasons keep committing');
  eq([D.History.active(), S.committing], [false, false]);
});

test('story: _dev.roundTrip gets a fresh run key every call', () => {
  const { S } = world({ act: () => true });
  const r1 = S._dev.roundTrip(8), r2 = S._dev.roundTrip(8);
  assert(r1.ok && r1.entries >= 1 && !r1.note, JSON.stringify(r1));
  assert(r2.ok && r2.entries >= 1 && !r2.note, 'second call is a real test: ' + JSON.stringify(r2));
});

test('story: a part that edits the world without ctx.mark() is still recorded', () => {
  const W = world();
  const { S, D, tick } = W;
  S.register('sloppy', { order: 20, season() { D.History.touch('z', 0, 0, 7, 7); W.zone[5]++; } });
  const warn = console.warn; console.warn = () => { };
  try { S.play(); tick(0.1); S.setSpeed(4); tick(2); } finally { console.warn = warn; }
  eq(D.History.entries.length, 1, 'recorded as one run');
  const z = W.zone[5];
  assert(z > 1, 'edited every season');
  D.History.undo();
  eq(W.zone[5], 0, 'undo restores it');
  // and a part that only touches without changing anything still adds no entry
  const W2 = world({ act: ctx => ctx.first });
  W2.S.register('looker', { order: 20, season() { W2.D.History.touch('z', 0, 0, 7, 7); } });
  W2.S.play(); W2.tick(0.1); W2.S.setSpeed(4); W2.tick(2);
  eq([W2.D.History.entries.length, W2.D.History.entries[0].y1], [1, 1086], 'untouched seasons add nothing');
});

test('story: undo keeps t inside its season; replay never saves running:false; play leaves an open stroke alone', () => {
  const W = world({ act: () => true });
  const { S, D, tick } = W;
  S.play(); tick(0.1); S.setSpeed(4); tick(2);
  D.History.begin('Raise', 'raise'); D.History.touch('z', 7, 7, 7, 7); W.zone[63] = (W.zone[63] + 3) & 255; D.History.end();
  tick(7); tick(1);
  D.History.undo();                // story run 2 turned back
  assert(S.t >= S.q / 4 && S.t < (S.q + 1) / 4, `t in season after undo: q=${S.q} t=${S.t}`);
  D.History.redo();
  S.play(); tick(1);
  S.enterReplay(1086.5);
  eq(S.serialize().clock.running, true, 'saved as running during replay');
  S.exitReplay();
  // Shift+P mid-drag with a redo branch: the open stroke entry stays open
  D.History.begin('Raise', 'raise'); D.History.touch('z', 7, 7, 7, 7); W.zone[60] = 1; D.History.end();
  D.History.undo();
  D.History.begin('Paint', 'paint'); D.History.touch('z', 6, 6, 6, 6);
  S.play();
  assert(D.History.active(), 'stroke entry still open');
  W.zone[54] = 9; D.History.end();
  eq(D.History.entries[D.History.entries.length - 1].label, 'Paint');
  eq(D.History.pos, D.History.entries.length, 'the stroke dropped redo itself');
});

test('story: a long frame gap while visible (laptop sleep) is owed like hidden time', () => {
  const W = world({ act: () => true });
  const { S, tick } = W;
  S.play(); tick(0.1); S.setSpeed(2); tick(0.5);
  const q0 = S.q;
  W.adv(12000); S.update(0.1);       // 12 s asleep at Normal = 0.8 years owed -> run silently
  assert(!S.catchingUp, 'no veil under 2 years');
  tick(0.2);
  assert(S.q - q0 >= 3, 'owed seasons processed: ' + (S.q - q0));
  W.adv(400000); S.update(0.1);      // ~27 years -> capped catch-up with the veil
  assert(S.catchingUp, 'veil for a long sleep');
});

test('story: _dev.check flags a re-profiled player road (profile delta) and overlapped manual buildings', () => {
  const W = world();
  const { S, D } = W;
  let y = 0, over = [];
  D.Roads = {
    playerHash: () => '1:abc',                         // unchanged: playerHash ignores profiles
    playerProfiles: () => new Map([['r1', { y: new Float32Array(17).fill(y), br: 0 }]]),
    playerProfileDelta(A, B) { let m = 0; for (const [k, a] of A) { const b = B.get(k); if (!b) return Infinity; for (let i = 0; i < 17; i++) m = Math.max(m, Math.abs(a.y[i] - b.y[i])); } return m; }
  };
  D.Town._dev = { manualOverlaps: () => over };
  let r = S._dev.check();
  assert(r.armed && r.ok, 'first call arms: ' + JSON.stringify(r.problems));
  y = 0.05; r = S._dev.check();
  assert(r.ok, 'resampling noise under 0.1 m is fine: ' + JSON.stringify(r.problems));
  y = 0.5; r = S._dev.check();
  assert(!r.ok && r.problems.some(p => /re-profiled/.test(p)), 'a 0.5 m re-profile is an I2 problem');
  y = 0; over = ['m:3']; r = S._dev.check();
  assert(!r.ok && r.problems.some(p => /manual building/.test(p) && /m:3/.test(p)), 'overlapped manual building flagged');
  over = []; r = S._dev.check();
  assert(r.ok, 'clean again: ' + JSON.stringify(r.problems));
  delete D.Roads.playerProfiles; delete D.Town._dev;   // older roads/town: the checks simply do not run
  S._dev.check(); r = S._dev.check();
  assert(r.ok, 'missing hooks are tolerated: ' + JSON.stringify(r.problems));
});
