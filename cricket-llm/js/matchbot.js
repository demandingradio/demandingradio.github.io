/*
 * MATCH BOTS (dev only — not loaded by index.html)
 * ================================================
 * The spec §10 test bots for match mode. Every bot returns a JSON report:
 *   { bot, seed, pass, fails:[names], skipped:[names], targets:[{name, value, target, pass, note}], info:{...}, ms }
 * pass: true / false; a target whose feature isn't there yet FAILS (and says
 * "missing"); one that can't run in this environment is skipped (pass null).
 * Each bot seeds Math.random (mulberry32) and puts it back afterwards.
 *
 * In the page (the play bots drive window.__cllm through game.advance):
 *   await import('./js/matchbot.js?x=' + Date.now()); await CLLM.MatchBot.bowlBot(300)
 *   (hands off the mouse and keys while a play bot runs; the page returns to the menu after)
 * Headless (Deno): deno run --allow-read <scratchpad>/match/deno_load.js fieldOnly 2000
 *   (the play bots run headless too, on a Game with a recording stub canvas)
 *
 * Bots: physics() kinematics() throws() fieldOnly(n) laws() matchSims(n)
 *       netsRegression() batBot(balls) bowlBot(balls) perf() coverage() renderCount()
 * Sync bots return the report; netsRegression, the play bots, perf and renderCount
 * return a Promise of it. Options go last (or alone): bowlBot({ balls, level, seed }).
 * Read-only toward the game: every constant is read from CFG.MATCH with the
 * spec's §2 value as fallback, and saves/settings a bot touches are restored.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M } = CLLM;

  // ---- §2 fallbacks (the bots must run before config.js has them) ---------------------------------
  const DEF = {
    STEP: 1 / 120, LINGER: 1.0, RUN_LOCK: 0.12, FF: 3, FF_AFTER: 1.5,
    FIELD_SKILL: { club: 0.45, grade: 0.62, state: 0.76, test: 0.90 },
    WIDE: { off: 1.3, leg: 1.0 },
    OUTFIELD: { rollDecel: 1.05, rollLin: 0, bounceK: 0.42, keep: 0.8, keepK: 0.035, keepMin: 0.75, keepMax: 0.97 },
    FIELD: { reach: 1.0, aimSD: 0.026, directClose: 9, directMax: 20, deepNoShy: 30, jumpH: 2.75, catchH: 2.3, throwT: 0.46, pickT: 0.36, breakT: 0.2 },
    RUN: { vmax: 7.0, accel: 7.0, decel: 16, turnPause: 0.06, stretch: 1.3, carry: 0.35, stretchNear: 2.6, startDelay: 0.35, diveReach: 1.0, diveT: 0.35, diveMax: 3.5, queueMax: 1 },
    AI_RUN: { look: 0.35, lookSkill: 0.20, easy: 1.2, heldClose: 30, sendBackFrac: 0.45 },
    CAM: {
      hold: 0.30, noCutTravel: 12,
      bat: { pos: [0, 42, -96], tgt: [0, 0, 4], fov: 54, hfov: 64 },
      bowl: { pos: [0, 46, 116], tgt: [0, 0, 16], fov: 54, hfov: 64 },
      kMin: 1, kMax: 2.6,
    },
  };
  const MC = (k) => { const C = CLLM.CFG && CLLM.CFG.MATCH; return C && C[k] != null ? C[k] : DEF[k]; };
  const sub = (k) => Object.assign({}, DEF[k], MC(k) || {});
  const STEP = () => MC('STEP') || 1 / 120;
  const PT = () => CLLM.World.PITCH;
  const END_Z = [0, 20.12], CREASE = [1.22, 18.9], DIRZ = [-1, 1];
  const SETS_KEYS = ['paceNew', 'paceOld', 'paceTail', 'offAttack', 'offContain', 'legAttack', 'legContain'];
  const MATCH_KEY = 'cricketllm.match.v1', NETS_KEY = 'cricketllm.v1';

  // ---- seeding and reports ------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const quant = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const fin = (x) => typeof x === 'number' && !Number.isNaN(x);            // Infinity allowed, NaN never
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  class Report {
    constructor(bot, seed) { this.r = { bot, seed, pass: null, fails: [], skipped: [], targets: [], info: {}, ms: 0 }; this.t0 = nowMs(); }
    _t(name, value, target, pass, note) { const t = { name, value: r3(value), target, pass }; if (note) t.note = note; this.r.targets.push(t); return pass; }
    range(name, v, lo, hi, note) { return this._t(name, v, `${lo}..${hi}`, v != null && fin(v) && v >= lo && v <= hi, note); }
    max(name, v, hi, note) { return this._t(name, v, `<= ${hi}`, v != null && fin(v) && v <= hi, note); }
    min(name, v, lo, note) { return this._t(name, v, `>= ${lo}`, v != null && fin(v) && v >= lo, note); }
    eq(name, v, want, note) { return this._t(name, v, `= ${JSON.stringify(want)}`, JSON.stringify(v) === JSON.stringify(want), note); }
    ok(name, cond, value, note) { return this._t(name, value === undefined ? !!cond : value, 'true', !!cond, note); }
    missing(name, what) { return this._t(name, null, 'implemented', false, 'missing: ' + what); }
    skip(name, why) { return this._t(name, null, '-', null, why); }
    info(k, v) { this.r.info[k] = v; }
    done() {
      const R = this.r;
      R.fails = R.targets.filter((t) => t.pass === false).map((t) => t.name);
      R.skipped = R.targets.filter((t) => t.pass == null).map((t) => t.name);
      R.pass = R.targets.some((t) => t.pass != null) ? R.fails.length === 0 : null;
      R.ms = Math.round(nowMs() - this.t0);
      return R;
    }
  }
  // Run fn(report) with Math.random seeded; sync or async
  function run(bot, seed, fn) {
    const R = new Report(bot, seed);
    const r0 = Math.random;
    Math.random = mulberry32(seed);
    const fail = (e) => { R._t('no exception', String(e && e.message || e), 'none', false, String(e && e.stack || '').split('\n').slice(0, 4).join(' | ')); };
    let out;
    try { out = fn(R); } catch (e) { Math.random = r0; fail(e); return R.done(); }
    if (out && typeof out.then === 'function') {
      return out.then(() => { Math.random = r0; return R.done(); }, (e) => { Math.random = r0; fail(e); return R.done(); });
    }
    Math.random = r0;
    return R.done();
  }
  // Temporarily patch CFG.MATCH.<k> (merged); returns an undo
  function patchCfg(k, patch) {
    const CFG = CLLM.CFG || (CLLM.CFG = {});
    const C = CFG.MATCH || (CFG.MATCH = {});
    const had = Object.prototype.hasOwnProperty.call(C, k), old = C[k];
    C[k] = Object.assign({}, old || {}, patch);
    return () => { if (had) C[k] = old; else delete C[k]; };
  }
  // FNV-1a digest of anything JSON-able (numbers at full precision)
  function digest(obj) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // ---- shared helpers ---------------------------------------------------------------------------
  const outfield = () => Object.assign({}, MC('OUTFIELD') || CLLM.MATCH_OUTFIELD || DEF.OUTFIELD);
  function fieldFor(key, h) {
    const Mt = CLLM.Match;
    if (Mt && Mt.fieldFor) return Mt.fieldFor(key, h);
    throw new Error('Match.fieldFor missing');
  }
  function roleOf(name) {
    if (name === 'keeper') return 'keeper';
    if (name === 'bowler') return 'bowler';
    if (/slip|gully/.test(name)) return 'slips';
    if (/short|silly/.test(name)) return 'close';
    return 'ring';
  }
  // Batter-relative bearing (deg, + off) -> unit world direction for hand h
  const relDir = (rel, h) => { const phi = M.wrapAng(M.rad(rel) * -h); return { x: Math.sin(phi), z: Math.cos(phi) }; };
  // The session's exit -> ball velocity (bowling.js _contact)
  function exitVel(ex, h) {
    const d = relDir(ex.rel, h), sp = ex.v;
    const vel = V.v(d.x * sp * Math.cos(ex.loft), Math.max(-2, sp * Math.sin(ex.loft)), d.z * sp * Math.cos(ex.loft));
    if (ex.block) { vel.x *= 0.5; vel.z = Math.abs(vel.z) * 0.5 + 1; vel.y = -0.4; }
    return vel;
  }
  // In ground at end e (FieldSim's own judgement if it has one, else §3.8)
  function inGround(fs, r, e) {
    if (fs._inGround) return fs._inGround(r, e);
    const R = sub('RUN');
    const dir = r.goal != null ? DIRZ[r.goal] : r.z < 10 ? -1 : 1;
    const tip = r.z + dir * (r.stretch > 0.5 ? R.stretch : R.carry);
    return e === 0 ? Math.min(tip, r.z) <= CREASE[0] : Math.max(tip, r.z) >= CREASE[1];
  }
  const running = (fs) => fs.runners.some((r) => r.goal != null);
  // Swept stumps box at end e (the same box as FieldSim §3.5)
  function hitBox(a, b, zEnd) {
    const P = PT(), hx = P.STUMPS_HALF_W + P.BALL_R, hz = 0.02 + P.BALL_R, hy = P.STUMP_H + P.BALL_R;
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const [p, d, lo, hi] of [[a.x, dx, -hx, hx], [a.z, dz, zEnd - hz, zEnd + hz]]) {
      if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return false; continue; }
      let u0 = (lo - p) / d, u1 = (hi - p) / d;
      if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) return false;
    }
    return a.y + (b.y - a.y) * t0 <= hy;
  }
  function nanIn(fs) {
    const bad = (v) => typeof v === 'number' && Number.isNaN(v);
    for (const f of fs.fielders) if (bad(f.pos.x) || bad(f.pos.z) || (f.vel && (bad(f.vel.x) || bad(f.vel.z)))) return 'fielder ' + f.name;
    for (const r of fs.runners) if (bad(r.z) || bad(r.v) || bad(r.x)) return 'runner ' + r.key;
    const b = fs.ball;
    if (b && (bad(b.pos.x) || bad(b.pos.y) || bad(b.pos.z) || bad(b.vel.x) || bad(b.vel.y) || bad(b.vel.z))) return 'ball';
    return null;
  }
  function newMatch(format, level, youBatFirst, extra) {
    const m = new CLLM.Match(Object.assign({ format, level, hand: 'R', controls: 'physical', assist: 'manual', youBatFirst: !!youBatFirst }, extra || {}));
    m.save = () => {};                    // never touch the real save from a bot
    return m;
  }
  // Apply a scripted ball (a bowler picked for either side, as the sessions do)
  function play(m, r) {
    if (m.inn.bowler == null) m.inn.bowler = m.aiPickBowler();
    return m.applyBall(Object.assign({ runs: 0, boundary: 0, extras: {}, legal: true, swapped: false, out: null }, r || {}));
  }
  const dot = (m) => play(m, {});
  const four = (m) => play(m, { runs: 4, boundary: 4 });
  const single = (m) => play(m, { runs: 1, swapped: true });
  const bowled = (m) => play(m, { out: { how: 'bowled', who: 'striker', bowlerCredit: true } });
  // Law 28.4: at most 2 fielders behind square on the leg side (the keeper doesn't count)
  function legalByRule(positions, h) {
    let n = 0;
    for (const p of positions) if (p.name !== 'keeper' && p.z < CREASE[0] && p.x * h > 0) n++;
    return n <= 2;
  }
  // Instrument Ball.update: only FieldSim may step the live ball (§10.3 invariant)
  function guardBall() {
    const Bp = CLLM.Ball.prototype, Fp = CLLM.FieldSim.prototype;
    const bu = Bp.update, fu = Fp.update;
    const st = { fs: null, depth: 0, bad: 0 };
    Fp.update = function () { st.depth++; try { return fu.apply(this, arguments); } finally { st.depth--; } };
    Bp.update = function () { if (st.fs && this === st.fs.ball && st.fs.live && !st.depth) st.bad++; return bu.apply(this, arguments); };
    st.restore = () => { Bp.update = bu; Fp.update = fu; };
    return st;
  }
  // A FieldSim on a real field, ready for a ball (pre-ball walk-in included)
  function readyFS(fs, key, h, walk = true) {
    fs.setField(fieldFor(key, h), h);
    fs.preBall({ bowlerX: -0.8 });
    if (walk && fs.preUpdate) { const dt = STEP(); for (let t = 0; t < 2.2; t += dt) fs.preUpdate(dt, t, t / 2.2, t > 1.9); }
  }

  // ======================================================================================================
  // §10.2 physics: outfield rolls, throw flights, _predict == reality, the nets ball untouched
  // ======================================================================================================
  function roll(kmh, loftDeg, h0, O, dt) {
    const b = new CLLM.Ball(); b.open = O;
    const th = M.rad(loftDeg), v0 = kmh / 3.6;
    b.free(V.v(0, h0, 1.4), V.v(0, v0 * Math.sin(th), v0 * Math.cos(th)), 0);
    let t = 0, t30 = null, t65 = null, prev = 0;
    while (b.mode === 'free' && t < 40) {
      b.update(dt); t += dt;
      const d = b.pos.z - 1.4;
      if (t30 == null && d >= 30) t30 = t - dt * (d - 30) / Math.max(1e-9, d - prev);
      if (t65 == null && d >= 65) t65 = t - dt * (d - 65) / Math.max(1e-9, d - prev);
      prev = d;
    }
    return { t30, t65, stop: b.pos.z - 1.4, tStop: t };
  }
  // Fly a throw from `from` at `vel`; the time and height when it has covered the ground distance d
  function throwFlight(from, vel, d, O, dt) {
    const s = new CLLM.Ball(); s.open = O; s.onEvent = null; s.free(from, vel, 0);
    const hs = Math.hypot(vel.x, vel.z), ux = vel.x / hs, uz = vel.z / hs;
    let t = 0, pc = 0, py = from.y;
    while (t < 6 && s.mode === 'free') {
      s.update(dt); t += dt;
      const c = (s.pos.x - from.x) * ux + (s.pos.z - from.z) * uz;
      if (c >= d) { const u = (d - pc) / Math.max(1e-9, c - pc); return { t: t - dt + u * dt, y: py + (s.pos.y - py) * u, bounced: s.landed }; }
      pc = c; py = s.pos.y;
    }
    return { t: null, y: null };
  }
  // The nets ball (open = null): deliveries and free flights into the nets, digested
  function netsBallDigest() {
    const { Ball, BallPhys, Deliveries } = CLLM;
    const rnd = mulberry32(4242), R = (a, b) => a + rnd() * (b - a);
    const out = [];
    for (let i = 0; i < 30; i++) {
      const type = ['pace', 'off', 'leg'][i % 3];
      const r0 = Math.random; Math.random = mulberry32(900 + i);
      let plan;
      try {
        plan = Deliveries.build({ type, varKey: 'stock', length: type === 'pace' ? R(1, 11) : R(0.5, 6), offLine: R(-0.3, 0.6), hand: i % 2 ? 'L' : 'R',
          speedKmh: type === 'pace' ? R(120, 145) : R(75, 90), quality: R(0.4, 1.1), release: V.v(R(-0.6, 0.6), R(1.9, 2.2), R(18.8, 19.6)) });
      } finally { Math.random = r0; }
      const b = new Ball(); b.launch(plan);
      const pts = [];
      for (let k = 0; k < 90; k++) { b.update(1 / 120); if (k % 6 === 5) pts.push([b.pos.x, b.pos.y, b.pos.z]); }
      out.push(pts, BallPhys.hitsStumps(plan).hit);
    }
    for (let i = 0; i < 40; i++) {
      const b = new Ball();
      b.free(V.v(R(-0.5, 0.5), R(0.2, 1.4), R(0.6, 2.0)), V.v(R(-9, 9), R(-3, 12), R(-14, 30)), R(-5, 5));
      const pts = [];
      for (let k = 0; k < 360 && b.mode === 'free'; k++) { b.update(1 / 120); if (k % 12 === 11) pts.push([b.pos.x, b.pos.y, b.pos.z, b.netHit ? 1 : 0]); }
      out.push(pts, b.mode);
    }
    return digest(out);
  }

  function physics(opts = {}) {
    return run('physics', opts.seed || 1, (R) => {
      const { Ball, FieldSim } = CLLM;
      const O = outfield(), dt = STEP();
      R.info('outfield', O);
      const a = roll(110, 4, 1.0, O, dt), b = roll(90, 3, 0.9, O, dt), c = roll(50, -5, 0.6, O, dt), d = roll(70, 0, 0.8, O, dt);
      R.range('110 km/h @4 deg from 1.0 m: reaches 65 m (s)', a.t65, 2.90, 3.20);
      R.range('90 km/h @3 deg: reaches 65 m (s)', b.t65, 3.70, 4.05);
      R.range('50 km/h @-5 deg from 0.6 m: stops at (m)', c.stop, 50, 62);
      R.range('70 km/h flat: stops at (m)', d.stop, 80, 95);
      R.info('110 km/h', { t30: r3(a.t30), t65: r3(a.t65), stop: r3(a.stop) });
      R.info('90 km/h', { t30: r3(b.t30), t65: r3(b.t65), stop: r3(b.stop) });
      // throws (solveThrow + the real integrator), from 1.8 m to 0.95 m
      if (!FieldSim || !FieldSim.solveThrow) R.missing('throw flights', 'FieldSim.solveThrow');
      else {
        const T = { 15: [0.58, 0.68], 25: [0.95, 1.12], 40: null, 50: [1.70, 1.90], 60: null, 70: [2.6, 2.9] };
        const tab = {};
        let worstY = 0;
        for (const dist of [15, 25, 40, 50, 60, 70]) {
          const from = V.v(0, 1.8, dist), to = V.v(0, 0.95, 0);
          const sp = M.clamp(22 + 0.2 * dist, 22, 33);
          const vel = FieldSim.solveThrow(from, to, sp, O);
          const f = throwFlight(from, vel, dist, O, dt);
          tab[dist] = { speed: r3(sp), t: r3(f.t), y: r3(f.y), bounced: !!f.bounced };
          if (T[dist]) R.range(`throw ${dist} m flight (s)`, f.t, T[dist][0], T[dist][1]);
          if (f.y != null) worstY = Math.max(worstY, Math.abs(f.y - 0.95));
        }
        R.max('throw arrival height error, worst of 15-70 m (m)', worstY, 0.25);
        R.info('throws', tab);
      }
      // FS-2: _predict on the same fixed step as the live ball
      if (!FieldSim) R.missing('FS-2 predict == reality', 'FieldSim');
      else {
        const fs = new FieldSim({ skill: 0.76 });
        fs.setField([], 1); fs.preBall({});
        const ball = new Ball(); ball.open = O;
        ball.free(V.v(0, 1, 1.4), V.v(3, 6, 25), 0);
        fs.startLive(ball, { now: 0, strikerZ: 1.0, hit: true, control: 'none' });
        const S = fs._predict();
        const s2 = S.find((s) => Math.abs(s.t - 2) < 1e-6);
        let t = 0;
        for (let i = 0; i < Math.round(2 / dt); i++) { t += dt; fs.update(dt, t); }
        if (!s2) R.ok('FS-2 _predict has a sample at t = 2.0', false, S.length ? r3(S[1] && S[1].t) : null, 'sample spacing must be k/30 s');
        else R.max('FS-2 _predict(2.0) vs live ball after 2.0 s (m)', V.dist(s2.p, ball.pos), 1e-9);
        if (typeof fs.predictEnd === 'function') {
          const fs2 = new FieldSim({ skill: 0.76 }); fs2.setField([], 1); fs2.preBall({});
          const b2 = new Ball(); b2.open = O; b2.free(V.v(0, 1, 1.4), V.v(3, 6, 25), 0);
          fs2.startLive(b2, { now: 0, strikerZ: 1.0, hit: true, control: 'none' });
          const e = fs2.predictEnd(5);
          R.ok('FS-3 predictEnd(5) -> {x, z, t, over}', e && fin(e.x) && fin(e.z) && fin(e.t) && 'over' in e, e && { x: r3(e.x), z: r3(e.z), t: r3(e.t), over: e.over });
        } else R.missing('FS-3 predictEnd(5) -> {x, z, t, over}', 'FieldSim.predictEnd');
      }
      // the nets ball (open = null) must be byte-identical to the pre-change code
      const dg = netsBallDigest();
      const base = Bot.BASELINE && Bot.BASELINE.digests && Bot.BASELINE.digests.netsBall;
      if (base) R.eq('nets Ball (open null) trajectory digest', dg, base, 'vs the pre-change tree');
      else R.skip('nets Ball (open null) trajectory digest', 'no baseline embedded: run deno_load.js netsRegression');
      R.info('netsBallDigest', dg);
    });
  }

  // ======================================================================================================
  // §10.2 kinematics: runners on an empty field
  // ======================================================================================================
  function emptyLive(opts = {}) {
    const { FieldSim, Ball } = CLLM;
    const fs = new FieldSim({ skill: 0.7 });
    fs.setField(opts.positions || [], 1); fs.preBall({});
    const b = new Ball(); b.open = outfield();
    b.free(V.v(0, 0.05, 1.4), V.v(0.01, 0, 0.5), 0);            // trickling away: nobody fields it
    fs.startLive(b, { now: 0, strikerZ: 1.0, hit: true, control: opts.control || 'player' });
    return fs;
  }
  function kinematics(opts = {}) {
    return run('kinematics', opts.seed || 1, (R) => {
      if (!CLLM.FieldSim) return R.missing('FieldSim', 'FieldSim');
      const undo = patchCfg('RUN', { startDelay: 0 });
      const dt = STEP();
      let inv = 0, invRuns = 0;
      const check = (fs) => {
        const [A, B] = fs.runners;
        if (A.st !== 'out' && B.st !== 'out') for (let e = 0; e < 2; e++) if (inGround(fs, A, e) && inGround(fs, B, e)) inv++;
        if (fs.runsRun !== Math.min(A.legs, B.legs)) invRuns++;
      };
      try {
        const times = {};
        for (const n of [1, 2, 3]) {
          const fs = emptyLive();
          fs.call('run');
          fs.runners[0].startIn = 0;                     // "from first step": both set off now
          const got = [];
          let t = 0;
          while (t < 14 && got.length < n) {
            if (fs.want < n && fs.want - fs.runsRun < 2) fs.call('run');
            t += dt; fs.update(dt, t); check(fs);
            if (fs.runsRun > got.length) got.push(t);
          }
          times[n] = got.map(r3);
          const tn = got[n - 1];
          const T = { 1: [2.85, 3.05], 2: [5.95, 6.25], 3: [9.0, 9.5] }[n];
          R.range(`${n} run${n > 1 ? 's' : ''} complete at (s, from first step)`, tn == null ? null : tn, T[0], T[1]);
        }
        R.info('run times', times);
        // send-back from full speed
        {
          const fs = emptyLive();
          fs.call('run'); fs.runners[0].startIn = 0;
          const A = fs.runners[0];
          let t = 0, tBack = null, rev = null, vAt = null;
          while (t < 8) {
            t += dt; fs.update(dt, t); check(fs);
            if (tBack == null && A.z >= 8) { vAt = A.v; fs.call('back'); tBack = t; }
            if (tBack != null && rev == null && A.v <= 0) rev = t - tBack;
            if (tBack != null && A.goal == null && B_home(fs)) break;
          }
          R.range(`send-back from ${r3(vAt)} m/s reverses in (s)`, rev, 0.40, 0.50);
          R.info('send-back', { vAt: r3(vAt), reverse: r3(rev), runsAfter: fs.runsRun });
        }
        // the queue cap: a third press is refused while want = runsRun + 2
        {
          const fs = emptyLive();
          const a = fs.call('run'), b = fs.call('run'), c = fs.call('run');
          R.eq('queue: run, run, run -> accepted', [a, b, c], [true, true, false], 'want <= runsRun + 1 + queueMax');
          const d = fs.call('back');
          R.ok('back cancels the queued run (want = runsRun + 1), still running', d && fs.want === fs.runsRun + 1 && running(fs), { want: fs.want, runsRun: fs.runsRun });
          let t = 0; while (t < 1.5) { t += dt; fs.update(dt, t); check(fs); }
          const e = fs.call('back');
          R.ok('back mid-run turns both batters (never refused)', e && fs.runners.every((r) => r.goal == null || r.sentBack), e);
        }
        // the dive (FS-10)
        if (typeof CLLM.FieldSim.prototype.diveLegal !== 'function') R.missing('dive: legal only with a throw on and within 3.5 m', 'FieldSim.diveLegal');
        else {
          const fs = emptyLive();
          fs.call('run'); fs.runners[0].startIn = 0;
          let t = 0;
          while (fs.runners[0].z < 15 && t < 5) { t += dt; fs.update(dt, t); }
          const noThrow = fs.diveLegal();
          fs.thrown = true; fs.throwEnd = 1;
          while (Math.abs(CREASE[1] - fs.runners[0].z) - sub('RUN').stretch > sub('RUN').diveMax && t < 6) { t += dt; fs.update(dt, t); fs.thrown = true; }
          const legal = fs.diveLegal();
          const did = legal && fs.call('dive');
          R.ok('dive: refused with no throw, legal with a throw on within 3.5 m', !noThrow && legal && did, { noThrow, legal, did });
        }
        R.eq('invariant: both batters in ground at one end (steps)', inv, 0);
        R.eq('invariant: runsRun === min(A.legs, B.legs) (steps)', invRuns, 0);
      } finally { undo(); }
      // determinism: the same seed, the same report
      if (opts.determinism !== false) {
        const a = fieldOnly(Object.assign({ n: 200, seed: 77, skills: [0.9], sub: true }));
        const b = fieldOnly(Object.assign({ n: 200, seed: 77, skills: [0.9], sub: true }));
        const strip = (r) => JSON.stringify(Object.assign({}, r, { ms: 0 }));
        R.ok('determinism: fieldOnly(200) twice with one seed', strip(a) === strip(b), digest(strip(a)) + ' / ' + digest(strip(b)));
      }
    });
  }
  const B_home = (fs) => fs.runners[1].goal == null;

  // ======================================================================================================
  // §10.2 / FS-7 / FS-8 / FS-11: throws — direct-hit accuracy through FieldSim's own release
  // ======================================================================================================
  function releaseFrom(fs, f, end, hard, direct) {
    f.st = 'throw'; f.u = FieldSim_THROW(); f.released = false;
    f.throwAt = { end, hard, direct };
    const tz = END_Z[end];
    const d = { x: 0 - f.pos.x, z: tz - f.pos.z }, l = Math.hypot(d.x, d.z) || 1;
    f.face = { x: d.x / l, z: d.z / l };
    try { fs.pose(0, {}); } catch (e) { /* posing is cosmetic here */ }
    fs._release(f);
  }
  const FieldSim_THROW = () => (CLLM.FielderAnim && CLLM.FielderAnim.THROW_RELEASE) || 0.62;
  function shyTrial(fs, f, x, z, O, dt) {
    f.pos = { x, z }; f.vel = { x: 0, z: 0 }; f.holding = true; fs.holder = f;
    const ball = fs.ball;
    ball.mode = 'held';
    releaseFrom(fs, f, 0, true, true);
    let t = 0, prev = V.copy(ball.pos);
    while (t < 3 && ball.mode === 'free') {
      ball.update(dt); t += dt;
      if (hitBox(prev, ball.pos, 0)) return true;
      if (ball.pos.z < -2 || Math.abs(ball.pos.x) > Math.abs(x) + 3) break;
      prev = V.copy(ball.pos);
    }
    return false;
  }
  function throws(opts = {}) {
    return run('throws', opts.seed || 1, (R) => {
      const { FieldSim, Ball } = CLLM;
      if (!FieldSim || !FieldSim.prototype._release) return R.missing('throws', 'FieldSim._release');
      const n = opts.n || 1000, skill = opts.skill != null ? opts.skill : 0.76, O = outfield(), dt = STEP();
      const fs = new FieldSim({ skill });
      fs.setField([{ name: 'cover', x: 0, z: 10 }], 1); fs.preBall({});
      const ball = new Ball(); ball.open = O;
      fs.ball = ball; fs.live = true; fs.tLive = 0; fs.t = 0; fs.events = []; fs.hit = true; fs.result = null;
      const f = fs.fielders[0];
      const cases = [['end-on 10 m', 0, 10, 40, 60], ['end-on 15 m', 0, 15, 22, 38], ['end-on 25 m', 0, 25, 8, 18], ['side-on 15 m', 15, 0, 6, 16]];
      const tab = {};
      for (const [name, x, z, lo, hi] of cases) {
        let hits = 0;
        for (let i = 0; i < n; i++) { fs.events.length = 0; if (shyTrial(fs, f, x, z, O, dt)) hits++; }
        tab[name] = pct(hits, n);
        R.range(`direct hits ${name} (%)`, pct(hits, n), lo, hi, `skill ${skill}, standing, n=${n}`);
      }
      R.info('direct hit %', tab);
      // FS-11: forecast tBall vs the real time to the stumps, a fielder holding it 30 m out end-on
      if (typeof FieldSim.prototype.forecast !== 'function') R.missing('FS-11 forecast tBall(0) vs actual, 30 m end-on (s)', 'FieldSim.forecast');
      else {
        const undo = patchCfg('RUN', { startDelay: 0 });
        try {
          // 30 scripted throws (aim error makes some miss the gloves): the error where the stumps went down
          const errs = [], info = [];
          for (let k = 0; k < 30; k++) {
            const g = new FieldSim({ skill: 0.76 });
            g.setField([{ name: 'keeper', x: 0.05, z: -0.7 }, { name: 'long stop', x: 0.5, z: -30 }], 1);
            g.preBall({});
            const b = new Ball(); b.open = O;
            b.free(V.v(0.5, PT().BALL_R, -30.3), V.v(0, 0, -0.05), 0);
            g.startLive(b, { now: 0, strikerZ: 1.0, hit: true, control: 'player' });
            g.call('run'); g.runners[0].startIn = 0;
            let t = 0, tF = null, F = null, tS = null, endS = null;
            while (t < 12 && !g.result) {
              t += dt; g.update(dt, t);
              for (const e of g.events.splice(0)) {
                if ((e.type === 'gather' || e.type === 'take') && tF == null) { tF = g.tLive; F = g.forecast(); }
                if (e.type === 'stumps' && tS == null) { tS = g.tLive; endS = e.end; }
              }
            }
            if (tF != null && tS != null && F && F.ends && F.ends[endS]) { errs.push(Math.abs(F.ends[endS].tBall - (tS - tF))); if (info.length < 3) info.push({ forecast: r3(F.ends[endS].tBall), actual: r3(tS - tF), end: endS }); }
          }
          R.max('FS-11 |forecast tBall - actual| to the stumps, holder 30 m end-on, median (s)', median(errs), 0.10, `${errs.length}/30 throws broke the stumps; e.g. ${JSON.stringify(info)}`);
          R.info('FS-11 errors', { n: errs.length, median: r3(median(errs)), p90: r3(quant(errs, 0.9)) });
        } finally { undo(); }
      }
    });
  }

  // ======================================================================================================
  // §10.3 fieldOnly: AI v AI, the whole field, n balls per skill level
  // ======================================================================================================
  function sampleExit() {
    const u = Math.random();
    const relW = () => (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.6 ? M.clamp(60 + M.gauss() * 30, 0, 160) : M.rand(0, 160));
    if (u < 0.55) return { kind: 'ground', rel: relW(), v: M.rand(10, 34), loft: M.rand(0.02, 0.08) };
    if (u < 0.70) return { kind: 'loft', rel: relW(), v: M.rand(15, 35), loft: M.rand(0.45, 1.0) };
    if (u < 0.82) return { kind: 'thin', rel: M.rand(150, 175), v: 0.75 * M.rand(30, 40), loft: M.rand(0.10, 0.20) };
    if (u < 0.90) return Math.random() < 0.5
      ? { kind: 'leading', rel: (Math.random() < 0.5 ? 1 : -1) * M.rand(20, 45), v: 13, loft: 0.6 }
      : { kind: 'thick', rel: M.rand(110, 135), v: M.rand(10, 15), loft: 0.04 };
    return { kind: 'block', rel: M.rand(-20, 20), v: M.rand(2, 4), loft: -0.2, block: true };
  }

  function fieldOnly(nOrOpts, maybe) {
    const opts = typeof nOrOpts === 'object' && nOrOpts ? nOrOpts : Object.assign({ n: nOrOpts }, maybe || {});
    const n = opts.n || 2000, seed = opts.seed || 1;
    const skills = opts.skills || [0.9, 0.62];
    return run('fieldOnly', seed, (R) => {
      const { FieldSim, Ball, Figure } = CLLM;
      if (!FieldSim || !CLLM.Ground) return R.missing('fieldOnly', 'FieldSim / Ground');
      const O = outfield(), dt = STEP(), AR = sub('AI_RUN'), FD = sub('FIELD');
      const lookT = AR.look + AR.lookSkill * (1 - 0.7);
      const guard = guardBall();
      const hasForecast = typeof FieldSim.prototype.forecast === 'function';
      const per = {};
      const S = {                                           // pooled over the skill levels
        balls: 0, chances: {}, held: {}, shies: 0, shyHits: 0, shyNear: 0, shyNearHits: 0, shyFar: 0, overthrowBalls: 0,
        runouts: 0, catches: 0, easy: 0, easyTaken: 0, startHeld: 0, startThrown: 0, tDead: [], flipBalls: 0, flipsRaw: [],
        inv: { bothIn: 0, runs: 0, rope: 0, nan: 0, nanWhere: null, stepped: 0, fcNaN: 0 }, timeouts: 0, runs: 0, fours: 0, sixes: 0, dots: 0,
        why: {}, errors: 0, err: null, bySkill: {},
      };
      const bowlerFig = new Figure('bowler');
      try {
        for (const skill of skills) {
          const fs = new FieldSim({ skill, cap: '#6b1422' });
          const L = { balls: 0, chances: 0, held: 0, runouts: 0 };
          for (let i = 0; i < n; i++) {
            const h = i % 2 ? -1 : 1;
            const key = (i >> 1) % 2 ? 'paceOld' : 'paceNew';
            try {
              readyFS(fs, key, h, true);
              const ex = sampleExit();
              const ball = new Ball(); ball.open = O;
              ball.free(V.v(-0.1 * h + M.rand(-0.2, 0.2), M.rand(0.35, 1.0), M.rand(1.0, 1.9)), exitVel(ex, h), 0);
              fs.startLive(ball, { now: 2.2, strikerFig: null, strikerZ: 1.0, hit: true, control: 'ai', ai: { skill: 0.7, aggression: 0.45 },
                bowlerFig, bowlerPos: { x: -0.9, z: 17.0 } });
              guard.fs = fs;
              const ev = fieldBall(fs, dt, lookT, AR, FD, hasForecast, S);
              guard.fs = null;
              L.balls++; S.balls++;
              L.chances += ev.chances; L.held += ev.held; L.runouts += ev.runouts;
              fs.endLive();
            } catch (e) {
              S.errors++; if (!S.err) S.err = String(e && e.stack || e).split('\n').slice(0, 3).join(' | ');
              try { fs.endLive(); } catch (e2) { /* ignore */ }
              guard.fs = null;
            }
          }
          per[skill] = { balls: L.balls, heldPct: pct(L.held, L.chances), chances: L.chances, runouts: L.runouts };
        }
      } finally { S.inv.stepped = guard.bad; guard.restore(); }
      // ---- the report ----
      // the catch targets are Test-level numbers (Davis): judged at the highest skill run (0.9 by default)
      const top = Math.max(...skills), K = S.bySkill[top] || { chances: {}, held: {} };
      const ch = (k) => K.chances[k] || 0, hd = (k) => K.held[k] || 0;
      const allC = Object.values(K.chances).reduce((a, b) => a + b, 0), allH = Object.values(K.held).reduce((a, b) => a + b, 0);
      R.eq('no exceptions', S.errors, 0, S.err || undefined);
      R.range(`catches held, all chances, skill ${top} (%)`, pct(allH, allC), 72, 78, `n=${allC}`);
      // a rate from fewer than 30 events can't be judged: shown, not scored
      const rate = (name, a, b, lo, hi, note) => (b >= 30 ? R.range(name, pct(a, b), lo, hi, note) : R._t(name, pct(a, b), `${lo}..${hi}`, null, `${note}: under 30, not judged`));
      rate('... keeper (%)', hd('keeper'), ch('keeper'), 80, 90, `n=${ch('keeper')}`);
      rate('... slips / gully (%)', hd('slips'), ch('slips'), 65, 78, `n=${ch('slips')}`);
      rate('... ring / deep (%)', hd('ring'), ch('ring'), 85, 96, `n=${ch('ring')}`);
      rate('direct hits at 10-15 m end-on (%)', S.shyNearHits, S.shyNear, 25, 40, `n=${S.shyNear} shies (throws() measures accuracy directly)`);
      R.eq('shies from beyond 30 m', S.shyFar, 0);
      R.max('overthrow events (% of balls)', pct(S.overthrowBalls, S.balls), 1.2);
      const dismissals = (S.catches + S.runouts) / 0.59;          // + a scaled 41% bowled/lbw/stumped share
      R.range('run-outs (% of dismissals)', dismissals ? pct(S.runouts, dismissals) : null, 1.5, 5, `${S.runouts} run-outs, ${S.catches} catches; ${pct(S.runouts, S.balls)}% of balls`);
      if (hasForecast) R.min('easy singles taken (%)', S.easy ? pct(S.easyTaken, S.easy) : null, 90, `n=${S.easy}`);
      else R.missing('easy singles taken (%)', 'FieldSim.forecast');
      R.eq('runs started while held within 30 m', S.startHeld, 0);
      R.range('dead-ball time median (s)', median(S.tDead), 3.0, 4.5);
      R.max('dead-ball time p95 (s)', quant(S.tDead, 0.95), 12);
      R.max('dead-ball time max (s)', S.tDead.length ? Math.max(...S.tDead) : null, 25);
      R.min('balls with <= 1 primary-chaser change (%)', pct(S.balls - S.flipBalls, S.balls), 97);
      R.eq('invariant: both batters in ground at one end (steps)', S.inv.bothIn, 0);
      R.eq('invariant: runs === min(A.legs, B.legs) (steps)', S.inv.runs, 0);
      R.eq('invariant: fielder beyond ropeK 1.02 (steps)', S.inv.rope, 0);
      R.eq('invariant: NaN in fielder / runner / ball (steps)', S.inv.nan, 0, S.inv.nanWhere || undefined);
      R.eq('invariant: live ball stepped outside FieldSim', S.inv.stepped, 0);
      if (hasForecast) R.eq('forecast(): no NaN (checks every 0.1 s)', S.inv.fcNaN, 0);
      if (opts.keeper !== false) keeperTakes(R, opts.keeperN || 1000);
      R.info('per skill', per);
      for (const sk of Object.keys(S.bySkill)) {
        const Q = S.bySkill[sk];
        R.info(`chances / held by role, skill ${sk}`, Object.fromEntries(Object.keys(Q.chances).map((k) => [k, `${Q.held[k] || 0}/${Q.chances[k]} (${pct(Q.held[k] || 0, Q.chances[k])}%)`])));
      }
      R.info('outcomes', { balls: S.balls, runsPerBall: r3(S.runs / Math.max(1, S.balls)), dotsPct: pct(S.dots, S.balls), fours: S.fours, sixes: S.sixes, runouts: S.runouts, catches: S.catches, timeouts: S.timeouts,
        shies: S.shies, shyHitsPct: pct(S.shyHits, S.shies), overthrowBalls: S.overthrowBalls, startedWhileThrown: S.startThrown, why: S.why });
      R.info('dead-ball time', { median: r3(median(S.tDead)), p95: r3(quant(S.tDead, 0.95)), max: r3(S.tDead.length ? Math.max(...S.tDead) : null) });
      R.info('primary-chaser changes per ball', (() => { const hgram = {}; for (const f of S.flipsRaw) hgram[f] = (hgram[f] || 0) + 1; return hgram; })());
      if (opts.sub) delete R.r.info['primary-chaser changes per ball'];
    });
  }

  // FS-5: unhit deliveries (28-40 m/s) passing within 0.9 m of the keeper's hands at 0.2-2.6 m
  function keeperTakes(R, n) {
    const { FieldSim, Ball, Figure } = CLLM;
    const O = outfield(), dt = STEP(), FD = sub('FIELD');
    const fs = new FieldSim({ skill: 0.76, cap: '#6b1422' });
    const bowlerFig = new Figure('bowler');
    const K = { take: 0, fumble: 0, miss: 0, missHigh: 0, other: 0, n: 0 };
    for (let i = 0; i < n; i++) {
      readyFS(fs, 'paceNew', 1, false);
      const kp = fs.fielders.find((f) => f.name === 'keeper');
      const from = V.v(M.rand(-0.4, 0.4), M.rand(0.3, 1.4), 0.3);
      const tgt = V.v(kp.pos.x + M.rand(-0.9, 0.9), M.rand(0.2, 2.6), kp.pos.z);
      const ball = new Ball(); ball.open = O;
      ball.free(from, FieldSim.solveThrow(from, tgt, M.rand(28, 40), O), 0);
      fs.startLive(ball, { now: 0, strikerZ: 1.0, hit: false, control: 'none', bowlerFig, bowlerPos: { x: -0.9, z: 17 } });
      let t = 0, out = null, prev = V.copy(ball.pos);
      while (!out && t < 3) {
        t += dt; fs.update(dt, t);
        for (const e of fs.events.splice(0)) {
          if (out) break;
          if (e.fielder === 'keeper' && (e.type === 'take' || e.type === 'gather')) out = 'take';
          else if (e.fielder === 'keeper' && e.type === 'fumble') out = 'fumble';
          else if (e.type === 'take' || e.type === 'gather' || e.type === 'fumble') out = 'other';
        }
        if (!out && ball.mode === 'free' && ball.pos.z < kp.pos.z - 1.0) {
          // went by him: at what height, and how far from him, as it crossed his line?
          const u = (kp.pos.z - prev.z) / ((ball.pos.z - prev.z) || -1e-9);
          const y = prev.y + (ball.pos.y - prev.y) * M.clamp(u, 0, 1), x = prev.x + (ball.pos.x - prev.x) * M.clamp(u, 0, 1);
          out = 'miss';
          if (y > 1.1 && y <= FD.jumpH && Math.abs(x - kp.pos.x) <= FD.reach * 1.3) K.missHigh++;
        }
        if (!out && fs.result) out = 'other';
        prev = V.copy(ball.pos);
      }
      K[out || 'other']++; K.n++;
      fs.endLive();
    }
    R.min('FS-5 keeper takes unhit deliveries (%)', pct(K.take, K.n), 96.5, `n=${K.n}, skill 0.76`);
    R.range('FS-5 keeper fumbles (%)', pct(K.fumble, K.n), 1.5, 3.5);
    R.eq('FS-5 balls passing above 1.1 m within his reach, untouched', K.missHigh, 0);
    R.info('keeper takes', K);
  }

  // One live ball in fieldOnly: step it to the end, measure everything
  function fieldBall(fs, dt, lookT, AR, FD, hasForecast, S) {
    let t = 2.2, lookDone = false, easy = false, started = false, prim = null, flips = 0, tFc = 0;
    const out = { chances: 0, held: 0, runouts: 0 };
    let shy = null, overthrow = false;
    const hdist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    while (!fs.result && fs.tLive < 30) {
      const wasRunning = running(fs);
      // the look (just before the step in which the AI makes its call): both hypothetical margins
      if (hasForecast && !lookDone && fs.tLive + dt >= lookT - 1e-9) {
        lookDone = true;
        if (!wasRunning && !fs.result) {
          const F = fs.forecast();
          easy = !!(F && F.ends && F.ends.every((e) => e.margin > AR.easy));
          if (easy) S.easy++;
        }
      }
      t += dt; fs.update(dt, t);
      if (hasForecast && fs.tLive - tFc >= 0.1 && !fs.result) {
        tFc = fs.tLive;
        const F = fs.forecast();
        if (!F || !F.ends || F.ends.some((e) => !fin(e.tBat) || !fin(e.tBall) || !fin(e.margin))) S.inv.fcNaN++;
      }
      // who's going for it
      const p = fs.prim ? fs.prim.name : null;
      if (p && prim && p !== prim) flips++;
      if (p) prim = p;
      for (const e of fs.events.splice(0)) {
        if (e.type === 'caught' || e.type === 'dropped') {
          const role = roleOf(e.fielder);
          const K = S.bySkill[fs.skill] || (S.bySkill[fs.skill] = { chances: {}, held: {} });
          S.chances[role] = (S.chances[role] || 0) + 1; K.chances[role] = (K.chances[role] || 0) + 1; out.chances++;
          if (e.type === 'caught') { S.held[role] = (S.held[role] || 0) + 1; K.held[role] = (K.held[role] || 0) + 1; out.held++; S.catches++; }
        } else if (e.type === 'throw') {
          const f = fs.fielders.find((q) => q.name === e.fielder);
          const pos = f ? f.pos : { x: 0, z: 0 };
          const d = hdist(pos, { x: 0, z: END_Z[e.end] });
          const endOn = Math.abs(pos.x) <= Math.abs(pos.z - END_Z[e.end]) * Math.tan(M.rad(30));
          if (e.direct) {
            S.shies++;
            if (d > (FD.deepNoShy || 30)) S.shyFar++;
            shy = { end: e.end, near: d >= 10 && d <= 15 && endOn, hit: false };
            if (shy.near) S.shyNear++;
          } else shy = null;
        } else if (e.type === 'stumps' && e.direct && shy && e.end === shy.end && !shy.hit) {
          shy.hit = true; S.shyHits++; if (shy.near) S.shyNearHits++;
        } else if (e.type === 'overthrow') overthrow = true;
        else if (e.type === 'runout') { S.runouts++; out.runouts++; }
        else if (e.type === 'call' && e.what === 'yes' && !wasRunning && !started) {
          started = true;
          const b = fs.ball, H = fs.holder;
          if (b.mode === 'held' && H && Math.min(hdist(H.pos, { x: 0, z: 0 }), hdist(H.pos, { x: 0, z: 20.12 })) < (AR.heldClose || 30)) S.startHeld++;
          if (fs.thrown) S.startThrown++;
        }
      }
      // invariants, every step
      const [A, B] = fs.runners;
      if (A.st !== 'out' && B.st !== 'out') for (let e = 0; e < 2; e++) if (inGround(fs, A, e) && inGround(fs, B, e)) S.inv.bothIn++;
      if (fs.runsRun !== Math.min(A.legs, B.legs)) S.inv.runs++;
      for (const f of fs.fielders) if (CLLM.Ground.ropeK(f.pos.x, f.pos.z) > 1.02) { S.inv.rope++; break; }
      const nn = nanIn(fs); if (nn) { S.inv.nan++; if (!S.inv.nanWhere) S.inv.nanWhere = nn; }
    }
    if (!fs.result) { S.timeouts++; return out; }
    const r = fs.result;
    if (overthrow) S.overthrowBalls++;
    if (easy && started) S.easyTaken++;
    S.tDead.push(r.t != null ? r.t : fs.tLive);
    S.flipsRaw.push(flips);
    if (flips > 1) S.flipBalls++;
    S.why[r.why || '?'] = (S.why[r.why || '?'] || 0) + 1;
    if (!r.out) { S.runs += r.runs || 0; if (r.boundary === 4) S.fours++; if (r.boundary === 6) S.sixes++; if (!r.runs) S.dots++; }
    return out;
  }

  // ======================================================================================================
  // §10.4 laws: Match and FieldSim, scripted
  // ======================================================================================================
  // A live FieldSim with the runners placed by hand (for the adjudication tests)
  function liveFS(set) {
    const { FieldSim, Ball } = CLLM;
    const fs = new FieldSim({ skill: 0.76 });
    fs.setField(fieldFor('paceNew', 1), 1); fs.preBall({});
    const b = new Ball(); b.open = outfield();
    b.free(V.v(0, 0.05, 1.4), V.v(0, 0, 0.3), 0);
    fs.startLive(b, { now: 0, strikerZ: 1.0, hit: true, control: 'player' });
    const [A, B] = fs.runners;
    for (const [r, s] of [[A, set.A], [B, set.B]]) Object.assign(r, { st: s.goal != null ? 'run' : 'crease', v: s.goal != null ? 7 * DIRZ[s.goal] : 0, stretch: 0, legs: set.legs || 0, legDone: false, sentBack: false, startIn: 0 }, s);
    fs.runsRun = set.legs || 0; fs.want = set.want != null ? set.want : fs.runsRun + (set.A.goal != null ? 1 : 0);
    fs.events = [];
    return fs;
  }
  // A ball about to cross the rope along bearing rel, and the result once it does
  function ropeBall(fs, rel, how) {
    const dir = relDir(rel, 1);
    let lo = 10, hi = 120;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (CLLM.Ground.ropeK(dir.x * m, dir.z * m) < 0.997) lo = m; else hi = m; }
    const b = fs.ball;
    const air = how === 'six';
    b.free(V.v(dir.x * lo, air ? 6 : PT().BALL_R, dir.z * lo), V.v(dir.x * 25, air ? 1 : 0, dir.z * 25), 0);
    b.landed = !air;
    for (const f of fs.fielders) { f.pos = { x: f.home.x, z: f.home.z }; f.wait = 99; }
    let t = 0; const dt = STEP();
    while (!fs.result && t < 1) { t += dt; fs.update(dt, t); }
    return fs.result;
  }

  function laws(opts = {}) {
    return run('laws', opts.seed || 1, (R) => {
      const { Match, FieldSim, UI } = CLLM;
      if (!Match) return R.missing('laws', 'Match');
      // ---- Law 17.6 ----
      {
        let bad = 0, overs = 0, calls = 0;
        for (let g = 0; g < 3; g++) {
          const m = newMatch('lite', 'test', g % 2 === 0);
          let guard = 0;
          while (!m.result && guard++ < 5000) {
            if (m.followOnPending) { m.chooseFollowOn(true); continue; }
            if (m.inn.bowler == null) m.inn.bowler = m.aiPickBowler();
            if (m.inn.lastBowler != null && m.inn.bowler === m.inn.lastBowler) bad++;
            const ev = m.applyBall(m.simBall());
            if (ev.overEnd) overs++;
          }
          // and the AI captain asked directly, with every bowler as last over's man
          const inn = m.inn;
          for (let i = 0; i < 11; i++) { inn.lastBowler = i; for (let k = 0; k < 20; k++) { calls++; if (m.aiPickBowler() === i) bad++; } }
        }
        R.eq(`Law 17.6: aiPickBowler returns last over's bowler (${overs} overs, ${calls} direct calls)`, bad, 0);
        if (UI && UI.bowlerPicker && (window.CLLM_HEADLESS || UI.closePanel)) {
          const m = newMatch('lite', 'test', false);
          for (let i = 0; i < 6; i++) dot(m);
          const last = m.inn.lastBowler;
          try {
            UI.bowlerPicker(m, () => {}, false);
            const P = UI._pick;
            if (P) R.ok("Law 17.6: the picker's usable bowlers exclude last over's", P.usable.indexOf(last) < 0 && P.usable.length > 0, { last, usable: P.usable });
            else R.skip("Law 17.6: the picker's usable bowlers exclude last over's", 'UI._pick not exposed');
          } finally { if (UI.closePanel) UI.closePanel(); }
        } else R.skip("Law 17.6: the picker's usable bowlers exclude last over's", 'needs UI.closePanel in the page (runs headless)');
      }
      // ---- Law 18.11 ----
      {
        const m = newMatch('lite', 'test', true);
        dot(m); dot(m);
        const nb = m.inn.next;
        play(m, { out: { how: 'caught', who: 'striker', fielder: 'cover', bowlerCredit: true } });
        R.eq('Law 18.11: caught mid-over -> the new batter is on strike', m.inn.striker, nb);
        const m2 = newMatch('lite', 'test', true);
        for (let i = 0; i < 5; i++) dot(m2);
        const nb2 = m2.inn.next;
        play(m2, { out: { how: 'caught', who: 'striker', fielder: 'cover', bowlerCredit: true } });
        R.eq('Law 18.11: caught off the 6th ball -> the new batter at the non-striker\'s end', m2.inn.nonStriker, nb2);
      }
      // ---- run-out adjudication (FS-9) and whose ground ----
      if (!FieldSim || !FieldSim.prototype._runOutCheck) R.missing('run-out adjudication', 'FieldSim._runOutCheck');
      else {
        const Rn = sub('RUN');
        const zShort = CREASE[1] - 0.3 - Rn.carry;                 // bat carried: its tip 0.3 m short
        let fs = liveFS({ A: { z: zShort, goal: 1 }, B: { z: 20.12 - zShort, goal: 0 } });
        fs._runOutCheck(1, 'mid-on');
        R.ok('run out: 0.3 m short with the bat carried -> OUT', fs.result && fs.result.out && fs.result.out.how === 'run out' && fs.result.out.runner === 'A', fs.result && fs.result.out);
        fs = liveFS({ A: { z: zShort, goal: 1, stretch: 1 }, B: { z: 20.12 - zShort, goal: 0, stretch: 1 } });
        fs._runOutCheck(1, 'mid-on');
        R.ok('run out: the same spot, stretching (tip +1.3) -> NOT OUT', !(fs.result && fs.result.out), fs.lastMargin);
        // both past halfway: the runner nearer the broken end is the one judged
        fs = liveFS({ A: { z: 15, goal: 1 }, B: { z: 5, goal: 0 } });
        fs._runOutCheck(1, 'mid-on');
        const o1 = fs.result && fs.result.out;
        R.ok('both past halfway, stumps broken at end 1 -> the runner nearer end 1 (A) is out', o1 && o1.runner === 'A', o1);
        // Law 38 strike: the not-out batter's end sets who faces; the new batter takes the vacated end
        const strikeCheck = (label, set, end, wantRunner) => {
          const f2 = liveFS(set);
          f2._runOutCheck(end, 'cover');
          const fr = f2.result;
          if (!fr || !fr.out) return R.ok(label, false, fr);
          const m = newMatch('lite', 'test', true);
          dot(m);
          const si = m.inn.striker, ni = m.inn.nonStriker, nb = m.inn.next;
          const notOut = fr.out.runner === 'A' ? 'B' : 'A';
          const wantSwap = notOut === 'A' ? fr.ends.A === 1 : fr.ends.B === 0;
          play(m, { runs: fr.runs, out: { how: 'run out', who: fr.out.runner === 'A' ? 'striker' : 'nonStriker', fielder: 'cover', bowlerCredit: false }, swapped: fr.swapped });
          // the not-out batter faces iff he's at the striker's end (end 0)
          const notOutIdx = notOut === 'A' ? si : ni, notOutEnd = notOut === 'A' ? fr.ends.A : fr.ends.B;
          const faces = m.inn.striker === notOutIdx, newAtVacated = notOutEnd === 0 ? m.inn.nonStriker === nb : m.inn.striker === nb;
          R.ok(label, fr.out.runner === wantRunner && fr.swapped === wantSwap && faces === (notOutEnd === 0) && newAtVacated,
            { runner: fr.out.runner, swapped: fr.swapped, wantSwap, notOutEnd, striker: m.inn.striker, nonStriker: m.inn.nonStriker, newBatter: nb });
        };
        strikeCheck('run out after crossing (A out at end 1): B faces, the new batter to end 1', { A: { z: 15, goal: 1 }, B: { z: 5, goal: 0 } }, 1, 'A');
        strikeCheck('run out before crossing (A out at end 0): B stays, the new batter on strike', { A: { z: 8, goal: 1 }, B: { z: 12, goal: 0 } }, 0, 'A');
      }
      // ---- Law 19.7 / 19.8 through the rope ----
      if (!FieldSim) R.missing('Law 19.7 / 19.8', 'FieldSim');
      else {
        let fs = liveFS({ A: { z: 12, goal: 1 }, B: { z: 8, goal: 0 }, legs: 2, want: 3 });
        let r = ropeBall(fs, 60, 'four');
        R.ok('Law 19.7: 2 run + crossed on the 3rd, then four -> 4 (not 3)', r && r.runs === 4 && r.boundary === 4, r && { runs: r.runs, boundary: r.boundary });
        fs = liveFS({ A: { z: 19.6, goal: null }, B: { z: 0.55, goal: null }, legs: 5, want: 5 });
        r = ropeBall(fs, 60, 'four');
        R.ok('Law 19.7: 5 completed, then a hit to the rope -> 5 (odd: ends swapped)', r && r.runs === 5 && r.swapped === true, r && { runs: r.runs, boundary: r.boundary, swapped: r.swapped });
        fs = liveFS({ A: { z: 12, goal: 1 }, B: { z: 8, goal: 0 } });
        r = ropeBall(fs, 20, 'six');
        R.ok('a hit clearing the rope on the full -> 6', r && r.runs === 6 && r.boundary === 6, r && { runs: r.runs, boundary: r.boundary });
        // Law 19.8: thrown with 1 completed and crossed on the 2nd, then overthrows to the rope
        fs = liveFS({ A: { z: 8, goal: 0 }, B: { z: 12, goal: 1 }, legs: 1, want: 2 });
        const crossed = fs._crossed ? fs._crossed() : true;
        Object.assign(fs, { thrown: true, runsAtThrow: fs.runsRun, crossedAtThrow: crossed, throwEnd: 0, throwFrom: 'cover', throwTgt: null, overthrow: false, hit: true });
        const b = fs.ball, dir = relDir(100, 1);
        let lo = 10, hi = 120;
        for (let i = 0; i < 50; i++) { const mm = (lo + hi) / 2; if (CLLM.Ground.ropeK(dir.x * mm, dir.z * mm) < 0.997) lo = mm; else hi = mm; }
        b.free(V.v(dir.x * lo, 0.5, dir.z * lo), V.v(dir.x * 25, 0, dir.z * 25), 0);
        for (const f of fs.fielders) f.wait = 99;
        let t = 0; while (!fs.result && t < 1) { t += STEP(); fs.update(STEP(), t); }
        r = fs.result;
        R.ok('Law 19.8: thrown with 1 run + crossed on the 2nd, overthrow to the rope -> 4 + 1 + 1 = 6', r && r.runs === 6 && r.overthrow, r && { runs: r.runs, overthrow: r.overthrow, swapped: r.swapped, crossedAtThrow: crossed });
      }
      // ---- follow-on (MATCH-4) ----
      {
        const F = (newMatch('lite', 'test', true)).F, W = F.wickets;
        const innings = (m, runs, wkts) => { let r = runs; while (r >= 4) { four(m); r -= 4; } while (r > 0) { single(m); r--; } for (let i = 0; i < wkts; i++) bowled(m); };
        let m = newMatch('lite', 'test', true);
        innings(m, 100, W); innings(m, 100 - F.followOn, W);
        R.ok(`follow-on offered at a lead of exactly ${F.followOn}`, !!m.followOnPending && m.followOnPending.lead === F.followOn, m.followOnPending);
        m = newMatch('lite', 'test', true);
        innings(m, 100, W); innings(m, 101 - F.followOn, W);
        R.ok(`no follow-on at ${F.followOn - 1}`, !m.followOnPending && m.innings.length === 3 && m.innings[2].bat === 'you', { pending: m.followOnPending, third: m.innings[2] && m.innings[2].bat });
        m = newMatch('lite', 'test', false);
        innings(m, 100, W); innings(m, 100 - F.followOn, W);
        R.ok('AI enforces with time left (>= 18 W overs)', m.innings.length === 3 && m.innings[2].bat === 'you' && m.innings[2].followOn, m.innings[2] && { bat: m.innings[2].bat, followOn: m.innings[2].followOn });
        m = newMatch('lite', 'test', false);
        innings(m, 100, W);
        m.ballsTotal = Math.max(m.ballsTotal, F.budget * 6 - 18 * W * 6 + 6);
        innings(m, 100 - F.followOn, W);
        R.ok('AI bats again when short of time (< 18 W overs)', !m.result && m.innings.length === 3 && m.innings[2].bat === 'opp', m.innings[2] && m.innings[2].bat);
      }
      // ---- declaration, results ----
      {
        const W = newMatch('lite', 'test', true).F.wickets;
        const innings = (m, runs, wkts) => { let r = runs; while (r >= 4) { four(m); r -= 4; } while (r > 0) { single(m); r--; } for (let i = 0; i < wkts; i++) bowled(m); };
        let m = newMatch('lite', 'test', true);
        innings(m, 40, 0);
        const n0 = m.innings.length;
        m.declare();
        R.ok('declaration closes the innings (the next one starts)', m.innings[0].closed === 'declared' && m.innings.length === n0 + 1, m.innings[0].closed);
        m = newMatch('lite', 'test', true);
        innings(m, 100, W); innings(m, 100, W); innings(m, 50, W);
        innings(m, 0, 1); innings(m, 52, 0);
        R.ok(`4th innings: target reached with 1 down -> won by ${W - 1} wickets`, m.result && m.result.winner === 'opp' && m.result.wkts === W - 1, m.result && m.result.text);
        m = newMatch('lite', 'test', true);
        innings(m, 100, W); innings(m, 100, W); innings(m, 50, W);
        innings(m, 50, W);
        R.ok('4th innings: all out level -> tie', m.result && m.result.tie, m.result && m.result.text);
        m = newMatch('lite', 'test', true);
        innings(m, 100, W);
        m.ballsTotal = m.F.budget * 6 - 3;
        dot(m); dot(m); dot(m);
        R.ok('budget used up -> draw', m.result && m.result.draw, m.result && m.result.text);
      }
      // ---- Law 28.4 and the gap-plug (MATCH-6) ----
      {
        const sets = Match.SETS ? Object.keys(Match.SETS) : SETS_KEYS;
        let byRule = 0;
        for (const k of sets) for (const h of [1, -1]) if (!legalByRule(fieldFor(k, h), h)) byRule++;
        R.eq('Law 28.4: SETS x h=+-1 with > 2 leg-side fielders behind square (by the rule)', byRule, 0);
        const crafted = [{ name: 'keeper', x: 0, z: -15 }, { name: 'fine leg', x: 20, z: -40 }, { name: 'leg slip', x: 3, z: -12 }, { name: 'backward square', x: 40, z: -5 }];
        if (typeof Match.legalField === 'function') {
          let bad = 0;
          for (const k of sets) for (const h of [1, -1]) if (!Match.legalField(fieldFor(k, h), h)) bad++;
          R.eq('Match.legalField: all SETS x h=+-1 legal', bad, 0);
          R.eq('Match.legalField: a crafted 3-behind-square leg field is illegal', Match.legalField(crafted, 1), false);
          R.eq('Match.legalField: the same field for a left-hander (mirrored)', Match.legalField(crafted.map((p) => ({ name: p.name, x: -p.x, z: p.z })), -1), false);
        } else R.missing('Match.legalField(positions, h)', 'Match.legalField');
        // gap-plug: pound boundaries into each sector; the field must stay legal
        const m = newMatch('lite', 'test', false);
        let illegal = 0, plugs = 0, capt = 0, checks = 0;
        for (let s = 0; s < 12 && !m.result; s++) {
          const phi = -180 + 30 * s + 15;
          for (let k = 0; k < 3 && !m.result; k++) {
            const ev = play(m, { runs: 4, boundary: 4, phi });
            if (ev.captain) capt++;
            if (m.inn.plug) plugs++;
            const fset = m.fieldSet();
            const h = m.striker().hand === 'L' ? -1 : 1;
            checks++;
            if (!legalByRule(fset.positions, h)) illegal++;
          }
          if (m.inn.wkts === 0 && m.inn.balls > 50) bowled(m);
        }
        if (plugs || capt) R.eq(`gap-plug: illegal fields produced (${checks} checks, ${capt} captain moves)`, illegal, 0);
        else R.missing('gap-plug: never produces an illegal field', 'applyBall phi -> inn.zone / inn.plug / ev.captain');
      }
      // ---- wides (RUN-6) ----
      {
        const f = (Match && Match.isWide) || (CLLM.MatchRules && CLLM.MatchRules.isWide) || CLLM.isWide || (CLLM.MatchBatting && CLLM.MatchBatting.isWide);
        const Wd = sub('WIDE');
        R.ok('CFG.MATCH.WIDE = off 1.3 / leg 1.0 (m off middle)', Wd.off === 1.3 && Math.abs(Wd.leg) === 1.0, Wd);
        if (typeof f === 'function') {
          R.eq('wide: 1.35 m off, no shot -> wide', !!f(1.35, false), true);
          R.eq('wide: 1.35 m off, a shot offered -> not a wide', !!f(1.35, true), false);
          R.eq('wide: 1.05 m down leg, no shot -> wide', !!f(-1.05, false), true);
          R.eq('wide: 0.9 m down leg, no shot -> not a wide', !!f(-0.9, false), false);
        } else R.skip('wide rule (1.35 off / 1.05 leg, shot offered)', 'no pure helper isWide(offX, offered): judged ball by ball in bowlBot instead');
      }
      // ---- save -> load -> deep-equal ----
      {
        let raw0 = null, had = false;
        try { raw0 = localStorage.getItem(MATCH_KEY); had = raw0 != null; } catch (e) { /* no storage */ }
        try {
          const m = newMatch('half', 'state', true);
          for (let i = 0; i < 40; i++) play(m, m.simBall());
          delete m.save;                                       // the real save, this once
          m.save();
          const L = Match.load();
          const a = JSON.stringify(m), b = L && JSON.stringify(L);
          R.ok('save -> load -> JSON equal', a === b, L ? (a === b ? 'equal' : 'differs at ' + firstDiff(a, b)) : 'load() returned null');
        } finally { try { if (had) localStorage.setItem(MATCH_KEY, raw0); else localStorage.removeItem(MATCH_KEY); } catch (e) { /* ignore */ } }
      }
    });
  }
  function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i + ': ' + a.slice(Math.max(0, i - 40), i + 40); }

  // ======================================================================================================
  // §10.5 match-level sims
  // ======================================================================================================
  function matchSims(nOrOpts, formats, levels) {
    const opts = typeof nOrOpts === 'object' && nOrOpts ? nOrOpts
      : formats && typeof formats === 'object' && !Array.isArray(formats) ? Object.assign({ n: nOrOpts }, formats)
      : { n: nOrOpts, formats, levels };
    const n = opts.n || 500;
    const FMT = [].concat(opts.formats || ['lite', 'half', 'full']);
    const LV = [].concat(opts.levels || ['club', 'grade', 'state', 'test']);
    return run('matchSims', opts.seed || 1, (R) => {
      const { Match } = CLLM;
      if (!Match) return R.missing('matchSims', 'Match');
      const hasSimUntil = typeof Match.prototype.simUntil === 'function';
      const table = {};
      const lvBalls = {};
      for (const fk of FMT) for (const lv of LV) {
        const T = { matches: 0, draws: 0, ties: 0, wins: 0, youWon: 0, followOn: 0, ai3rdLead: 0, ai3rdDecl: 0, decl1: 0, guardHit: 0 };
        const B = lvBalls[`${fk}.${lv}`] = { balls: 0, legal: 0, runs: 0, wkts: 0, dots: 0, r1: 0, r2: 0, r3: 0, r4: 0, r6: 0, wd: 0 };
        for (let i = 0; i < n; i++) {
          const m = newMatch(fk, lv, Math.random() < 0.5);
          const w0 = { fo: false, lead3: false };
          const tally = (ev) => {
            const tag = ev && ev.tag;
            if (!tag) return;
            B.balls++;
            if (/wd|nb/.test(tag)) { B.wd++; return; }
            B.legal++;
            if (tag === 'W') { B.wkts++; return; }
            if (tag === '·') { B.dots++; return; }
            const x = parseInt(tag, 10) || 0;
            if (/b|lb/.test(tag)) { B.runs += x; return; }
            B.runs += x;
            if (x === 1) B.r1++; else if (x === 2) B.r2++; else if (x === 3) B.r3++; else if (x === 4) B.r4++; else if (x === 6) B.r6++;
          };
          const noteInnings = () => {
            const k = m.innings.length;
            if (k === 3 && !w0.lead3 && m.innings[2].bat === 'opp' && m.lead('opp') - m.inn.runs > 0) { w0.lead3 = true; T.ai3rdLead++; }
          };
          let guard = 0;
          while (!m.result && guard++ < 40000) {
            if (m.followOnPending) {
              w0.fo = true;
              const fo = m.followOnPending;
              if (fo.by === 'you') m.chooseFollowOn(m.ballsLeftMatch() / 6 >= 18 * m.F.wickets);
              else m.chooseFollowOn(true);
              continue;
            }
            noteInnings();
            if (hasSimUntil) {
              const res = m.simUntil('over', { userBowling: false });
              for (const ev of (res && res.events) || []) tally(ev);
              if (!res || !res.events || !res.events.length) { if (m.followOnPending) continue; if (!m.result) { T.guardHit++; break; } }
            } else {
              if (m.inn.bowler == null) m.inn.bowler = m.aiPickBowler();
              if (m.inn.bat === 'opp' && m.aiShouldDeclare()) { m.declare(); continue; }
              tally(m.applyBall(m.simBall()));
            }
            if (m.followOnPending) w0.fo = true;
          }
          if (!m.result) T.guardHit++;
          T.matches++;
          if (w0.fo) T.followOn++;
          const i3 = m.innings[2];
          if (i3 && i3.bat === 'opp' && i3.declared && w0.lead3) T.ai3rdDecl++;
          if (m.innings[0].declared && m.innings[0].bat === 'opp') T.decl1++;
          const res = m.result || {};
          if (res.draw) T.draws++; else if (res.tie) T.ties++; else if (res.winner) { T.wins++; if (res.youWon) T.youWon++; }
        }
        table[`${fk}.${lv}`] = { matches: T.matches, drawPct: pct(T.draws, T.matches), tiePct: pct(T.ties, T.matches), followOnPct: pct(T.followOn, T.matches),
          ai3rdDeclPct: pct(T.ai3rdDecl, T.ai3rdLead), ai3rdLead: T.ai3rdLead, youWonPct: pct(T.youWon, T.matches), unfinished: T.guardHit };
      }
      R.info('simUntil', hasSimUntil ? 'used (over by over)' : 'missing: fell back to applyBall(simBall()) with the declaration check');
      if (!hasSimUntil) R.missing('Match.simUntil(kind, opts)', 'Match.prototype.simUntil');
      const lt = table['lite.test'];
      if (lt) {
        R.range('Lite, Test level: draws (%)', lt.drawPct, 8, 30, `n=${lt.matches}`);
        R.range('Lite, Test level: follow-on offered (% of matches)', lt.followOnPct, 5, 20);
        R.min('Lite, Test level: AI declares its 3rd innings with a lead (%)', lt.ai3rdDeclPct, 20, `of ${lt.ai3rdLead} matches`);
        R.eq('Lite, Test level: matches left unfinished', lt.unfinished, 0);
      } else R.skip('Lite at Test level', 'not in this run (formats/levels)');
      // the ball-by-ball numbers: Lite (the default) carries the targets, where it was run
      const pickKey = (lv) => (lvBalls['lite.' + lv] ? 'lite.' + lv : Object.keys(lvBalls).find((k) => k.endsWith('.' + lv)));
      for (const key of Object.keys(lvBalls)) {
        const B = lvBalls[key], lv = key.split('.')[1];
        const tgt = pickKey(lv) === key;
        const s = { rpo: r3((B.runs / Math.max(1, B.legal)) * 6), dotsPct: pct(B.dots, B.balls), bpw: r3(B.legal / Math.max(1, B.wkts)),
          r1: pct(B.r1, B.balls), r2: pct(B.r2, B.balls), r3: pct(B.r3, B.balls), r4: pct(B.r4, B.balls), r6: pct(B.r6, B.balls), wdPct: pct(B.wd, B.balls), balls: B.balls };
        R.info(`simBall ${key}`, s);
        if (tgt && lv === 'test') {
          R.range('simBall Test: runs / over', s.rpo, 3.2, 3.8, key);
          R.range('simBall Test: dots (%)', s.dotsPct, 68, 75);
          R.range('simBall Test: balls / wicket', s.bpw, 45, 60);
          R.range('simBall Test: 1s (%)', s.r1, 16, 21);
          R.range('simBall Test: 2s (%)', s.r2, 2.5, 4);
          R.range('simBall Test: 3s (%)', s.r3, 0.3, 0.8);
          R.range('simBall Test: 4s (%)', s.r4, 5, 7);
          R.range('simBall Test: 6s (%)', s.r6, 0.4, 1);
        }
        if (tgt && lv === 'club') R.range('simBall Club: balls / wicket', s.bpw, 22, 38, key);
      }
      R.info('by format.level', table);
    });
  }

  // ======================================================================================================
  // §5 coverage: the whole rope from both follow poses; MatchCam's rules on a stub
  // ======================================================================================================
  function coverage(opts = {}) {
    return run('coverage', opts.seed || 1, (R) => {
      const { Camera } = CLLM;
      const CAM = sub('CAM');
      const poses = { bat: CAM.bat, bowl: CAM.bowl };
      const vps = [[1600, 900], [1280, 720], [1280, 800], [1024, 768], [844, 390]];
      const tab = {};
      for (const side of ['bat', 'bowl']) {
        const P = poses[side];
        for (const [W, H] of vps.concat([[390, 844]])) {
          const c = new Camera(); c.setViewport(W, H); c.hfov = P.hfov; c.set(V.v(...P.pos), V.v(...P.tgt), P.fov);
          let out = 0, clipX = 0, clipY = 0;
          for (let i = 0; i < 96; i++) {
            const a = (i / 96) * Math.PI * 2;
            const q = c.project(V.v(62.5 * Math.cos(a), 0, 10 + 68.5 * Math.sin(a)));
            if (!q) { out++; clipX = clipY = Infinity; continue; }
            const cx = Math.max(0, -q.x, q.x - W), cy = Math.max(0, -q.y, q.y - H);
            if (cx > 0 || cy > 0) { out++; clipX = Math.max(clipX, cx); clipY = Math.max(clipY, cy); }
          }
          tab[`${side} ${W}x${H}`] = { out, clipX: r3(clipX), clipY: r3(clipY) };
          if (H > W) {
            R.max(`rope clip at the sides, ${side} pose, portrait ${W}x${H} (px)`, clipX, 10, 'portrait phones may clip <= 10 px at the sides');
            R.eq(`rope clip top/bottom, ${side} pose, portrait ${W}x${H} (px)`, r3(clipY), 0);
          } else R.eq(`rope points outside, ${side} pose, ${W}x${H}`, out, 0);
        }
      }
      R.info('coverage', tab);
      // MatchCam (CAM-2) on a stub game and FieldSim
      const MatchCam = CLLM.MatchCam;
      if (typeof MatchCam !== 'function') { R.missing('MatchCam rules (hold, no-cut, cut pose, crop-zoom, stop)', 'CLLM.MatchCam'); return; }
      const mk = (travel, side) => {
        const cam = new Camera(); cam.setViewport(1280, 720); cam.set(V.v(0.25, 1.5, -1.7), V.v(-0.05, 0.1, 10), 48);
        const game = { cam, realTime: 5, clock: 5, match: null };
        const ball = new CLLM.Ball(); ball.mode = 'free'; ball.pos = V.v(0.5, 0.8, 2); ball.vel = V.v(1, 0.5, 8);
        const fs = { ball, want: 0, misfield: null, thrown: false, throwEnd: null, holder: null, prim: null, runsRun: 0, fielders: [], runners: [],
          predictEnd: () => ({ x: 0, z: 1.2 + travel, t: 5, over: false }), _predict: () => [{ t: 0, p: V.copy(ball.pos) }, { t: 5, p: V.v(0, 0, 1.2 + travel) }] };
        const mc = new MatchCam(game);
        mc.start(ball, fs, side);
        const stepRT = (sec) => { for (let t = 0; t < sec - 1e-9; t += 1 / 60) { game.realTime += 1 / 60; game.clock += 1 / 60; ball.pos = V.add(ball.pos, V.mul(ball.vel, 1 / 60)); mc.update(1 / 60); } };
        return { mc, game, fs, cam, stepRT };
      };
      let T = mk(40, 'bat');
      T.stepRT(0.25);
      const inHold = T.mc.active;
      T.stepRT(0.10);
      const P = CAM.bat;
      R.ok('MatchCam: holds 0.30 s real time, then cuts (long travel)', !inHold && T.mc.active, { atHold: inHold, after: T.mc.active });
      R.ok('MatchCam: the cut is the fixed CAM.bat pose (never chosen by where the ball goes)', V.dist(T.cam.pos, V.v(...P.pos)) < 1e-6 && Math.abs(T.cam.fov - P.fov) < 1e-9, { pos: T.cam.pos, fov: T.cam.fov });
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < 180; i++) { T.stepRT(1 / 60); zMin = Math.min(zMin, T.cam.zoom); zMax = Math.max(zMax, T.cam.zoom); }
      R.ok(`MatchCam: crop-zoom within [${CAM.kMin}, ${CAM.kMax}]`, zMin >= CAM.kMin - 1e-9 && zMax <= CAM.kMax + 1e-9, { zMin: r3(zMin), zMax: r3(zMax) });
      T.mc.stop();
      R.ok('MatchCam: stop() -> zoom 1, no offset, not active', !T.mc.active && T.cam.zoom === 1 && !T.cam.ox && !T.cam.oy, { zoom: T.cam.zoom, ox: T.cam.ox, oy: T.cam.oy });
      T = mk(5, 'bat');
      T.stepRT(1.2);
      const stayed = !T.mc.active;
      T.fs.want = 1;
      T.stepRT(1 / 30);
      R.ok('MatchCam: a block (< 12 m, no call) stays in the delivery view; a call cuts', stayed && T.mc.active, { stayed, afterCall: T.mc.active });
      T = mk(5, 'bat');
      T.mc.forceCut(); T.stepRT(0.2);
      const early = T.mc.active; T.stepRT(0.15);
      R.ok('MatchCam: forceCut() cuts once the hold is over (not before)', !early && T.mc.active, { before: early, after: T.mc.active });
      T = mk(40, 'bowl'); T.stepRT(0.4);
      R.ok('MatchCam: bowling uses CAM.bowl (behind the bowler, never mirrored)', V.dist(T.cam.pos, V.v(...CAM.bowl.pos)) < 1e-6, T.cam.pos);
    });
  }

  // ======================================================================================================
  // The play harness: drives the real Game (window.__cllm in the page; a stub-canvas Game headless)
  // through game.advance with a virtual performance clock, answers the match's prompts, and puts
  // the saves, settings and the rAF loop back afterwards.
  // ======================================================================================================
  async function harness(opts, body) {
    const headless = !!window.CLLM_HEADLESS;
    let game = opts.game || (!headless && window.__cllm) || null;
    if (!game && headless) game = Bot._game || (Bot._game = new CLLM.Game(document.getElementById('game')));
    if (!game) throw new Error('no game: load the page first (window.__cllm)');
    // headless there's no main.js: wire the match flow to this game ourselves
    if (CLLM.MatchFlow && CLLM.MatchFlow.game !== game && CLLM.MatchFlow.init) CLLM.MatchFlow.init(game);
    if (!game.openScorecard) game.openScorecard = () => {};
    const step = 1 / 120;
    const perf = performance, now0 = perf.now;
    // fixed clocks: the same numbers every run, in the page or headless (float rounding included)
    let vt = 1e6;
    const clk0 = { clock: game.clock, realTime: game.realTime, idle: game.idle };
    game.clock = 1000; game.realTime = 1000; game._stop = 0; game._slowT = 0; game.slowmo = 1; game.paused = false;
    if (game.cam) game.cam.shake = 0;
    const I = CLLM.Input;
    // a mouse at 60 fps, whatever this device is (the physical bat's latency reads frameMs)
    const dev0 = { touch: I.touch, enabled: I.enabled, frameMs: game.frameMs };
    I.touch = false; I.enabled = false; game.frameMs = 16.7;                 // (real key/mouse events are ignored while a bot plays)
    // the real pointer can't write the bat's history while a bot holds it
    const ptr0 = { hist: I._hist, newTouch: I._newTouch };
    I._hist = function (x, y, st) { if (I.botPtr) return ptr0.hist.call(this, x, y, st); };
    I._newTouch = function () {};
    I.clear(); I.hist = []; I.rest = null; I.ptrType = null;
    I.mouse.x = (game.cam && game.cam.w / 2) || 640; I.mouse.y = (game.cam && game.cam.h / 2) || 360; I.mouse.moved = false;
    // the scenery cache's LRU stamps come from performance.now: ours restarts at 1e6, so zero
    // them (here and after) or an earlier, later-stamped slot would never be evicted
    const lru0 = () => { const W = CLLM.World; if (W && W._gSlots) for (const sl of W._gSlots) sl.used = 0; };
    lru0();
    let perfPatched = true;
    try { perf.now = () => vt; if (perf.now() !== vt) perfPatched = false; } catch (e) { perfPatched = false; }
    const loop0 = game._loop;
    game._loop = function () { requestAnimationFrame((t) => this._loop(t)); };      // nothing but us moves the clock
    const raw = {};
    for (const k of [MATCH_KEY, NETS_KEY, 'cricketllm.matchflag']) { try { raw[k] = localStorage.getItem(k); } catch (e) { raw[k] = null; } }
    const data0 = JSON.stringify(game.save.data);
    Object.assign(game.save.data.settings, { calib: 0, batLimit: 0, batWeight: 20, batPower: 0.82, tuneV: 2, cam: 'broadcast' });
    game.save.data.stats.batBalls = Math.max(999, game.save.data.stats.batBalls || 0);
    const ui = game.ui, uiKeys = ['bowlerPicker', 'inningsBreak', 'followOnPrompt', 'matchResult', 'toss', 'scorecard'];
    const ui0 = {};
    const later = [];
    const H = {
      game, step, headless, perfPatched, pickerCalls: 0, results: 0, choosePicker: null, onBreak: null, onResult: null,
      get vt() { return vt; },
      perfOf: (tg) => vt + (tg - game.clock) * 1000,       // perf ms of game time tg (clock runs at 1:1 outside hit-stops)
      defer(fn) { later.push(fn); },
      // step `sec` of game time: 2 ticks + 1 render per 1/60 s (render less often headless)
      run(sec, fn) {
        const frames = Math.max(1, Math.round(sec * 60));
        for (let i = 0; i < frames; i++) {
          if (game.paused) game.paused = false;
          let stop = false;
          game.advance(1 / 60, (g) => {
            vt += step * 1000;
            while (later.length) later.shift()();
            if (fn && fn(g) === true) { stop = true; return true; }
            return false;
          }, step);
          if (stop) return true;
        }
        return false;
      },
    };
    for (const k of uiKeys) ui0[k] = ui[k];
    ui.bowlerPicker = (m, cb) => {
      H.pickerCalls++;
      const inn = m.inn, T = m.teams.you, usable = [];
      T.players.forEach((p, i) => { if (p.bowl && i !== inn.lastBowler) usable.push(i); });
      const c = H.choosePicker ? H.choosePicker(m, usable) : usable[0];
      H.defer(() => cb(c));
    };
    ui.inningsBreak = (m, inn, cb) => { if (H.onBreak) H.onBreak(m, inn); H.defer(cb); };
    ui.followOnPrompt = (m, cb) => H.defer(() => cb(true));
    ui.matchResult = (m, cb) => { H.results++; if (H.onResult) H.onResult(m); H.defer(cb); };
    ui.toss = (x, cb) => H.defer(() => cb(false));
    ui.scorecard = (m, cb) => H.defer(() => cb && cb());
    try {
      return await body(H);
    } finally {
      for (const k of uiKeys) ui[k] = ui0[k];
      try { if (game.session && game.session.live && game.session._liveEnd) game.session._liveEnd(); } catch (e) { /* ignore */ }
      try { game.quitToMenu(); } catch (e) { /* ignore */ }
      game._loop = loop0;
      try { delete perf.now; } catch (e) { /* ignore */ }
      if (perf.now !== now0) { try { perf.now = now0; } catch (e) { /* ignore */ } }
      game.clock = clk0.clock; game.realTime = clk0.realTime; game.idle = null;
      I.clear(); I.hist = []; I.rest = null;
      I.touch = dev0.touch; I.enabled = dev0.enabled; game.frameMs = dev0.frameMs;
      I._hist = ptr0.hist; I._newTouch = ptr0.newTouch; delete I.botPtr;
      game.save.data = JSON.parse(data0);
      for (const k in raw) { try { if (raw[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, raw[k]); } catch (e) { /* ignore */ } }
      game.lastPerf = now0.call(perf);
      lru0();
      if (!headless && game.onMenu) { try { game.onMenu(); } catch (e) { /* ignore */ } }
    }
  }
  const sleep0 = () => new Promise((r) => setTimeout(r, 0));

  // ---- the bowling bot: taps the beats with N(0, 30 ms) error, stock ball ----
  function bowlDriver(H, errMs = 30) {
    let planned = null;
    return (g) => {
      const s = g.session;
      if (!s || g.mode !== 'bowl' || s.waiting) return;
      const b = s.b;
      if (!b) return;
      const t = g.clock;
      if (b.phase === 'plan' && t >= b.tPlan && planned !== b) {
        planned = b;
        s.varIdx = 0;
        if (s.target) { s.target.off = 0.16 + M.gauss() * 0.08; s.target.len = s.spin ? 3.8 + M.gauss() * 0.5 : 6.8 + M.gauss() * 0.9; }
        s.input({ type: 'keydown', key: ' ' }, t);
        const bb = s.b;
        if (bb.phase === 'runup') {
          const acts = [];
          for (let i = bb.countIn; i < bb.beats.length; i++) acts.push({ t: bb.beats[i] + (M.gauss() * errMs) / 1000, ev: { type: 'keydown', key: ' ' } }, { t: bb.beats[i] + 0.05, ev: { type: 'keyup', key: ' ' } });
          acts.push({ t: bb.tLoad + (M.gauss() * errMs) / 1000, ev: { type: 'keydown', key: ' ' } });
          acts.push({ t: bb.tRelTarget + (M.gauss() * errMs) / 1000, ev: { type: 'keyup', key: ' ' } });
          acts.sort((x, y) => x.t - y.t);
          bb._botActs = acts;
        }
      }
      const acts = b._botActs;
      while (acts && acts.length && acts[0].t <= t) { const a = acts.shift(); s.input(a.ev, Math.max(a.t, t - 0.2)); }
    };
  }

  // The widest gap in front of square (batter-relative degrees, + off) in this field
  function gapRel(fielders, h, off) {
    const F = fielders.filter((f) => f.role !== 'keeper' && f.role !== 'bowler' && f.home)
      .map((f) => ({ rel: M.deg(Math.atan2(f.home.x * -h, f.home.z)), d: Math.hypot(f.home.x, f.home.z) }));
    let best = null;
    const lo = off > 0.15 ? -40 : -100, hi = off < -0.1 ? 40 : 100;           // don't hit across the line
    for (let r = lo; r <= hi; r += 5) {
      let g = 60;
      for (const f of F) g = Math.min(g, Math.abs(M.deg(M.wrapAng(M.rad(r - f.rel)))) * M.clamp(f.d / 25, 0.5, 1.5));
      if (!best || g > best.g) best = { r, g };
    }
    return best ? best.r : null;
  }

  // ---- the batting bot: synthetic pointer swipes for the physical bat ----
  function batDriver(H, o = {}) {
    const I = CLLM.Input, { BallPhys } = CLLM;
    let planFor = null, sw = null;
    const P0 = () => CLLM.CFG.BAT.PLANES.stance;
    const toScreen = (g, s, x, y) => {
      const shift = s.phys ? s.phys.camShift || 0 : 0;
      const q = g.cam.project(V.v(x, y, P0() + shift));
      return q ? { x: q.x, y: q.y } : { x: g.cam.w / 2, y: g.cam.h / 2 };
    };
    const push = (g, s) => {
      if (!sw) return;
      const t = H.vt;                                        // perf ms at this frame's end
      let p;
      if (t <= sw.s0) p = sw.rest;
      else if (t >= sw.s1) p = sw.end;
      else { const u = (t - sw.sC) / 1000; p = { x: sw.C.x + sw.d.x * sw.v * u, y: sw.C.y + sw.d.y * sw.v * u }; }
      const q = toScreen(g, s, p.x, p.y);
      I.ptrType = 'mouse';
      I.mouse.x = q.x; I.mouse.y = q.y; I.mouse.inside = true; I.mouse.moved = false;
      I.botPtr = true;
      try { if (I._hist) I._hist(q.x, q.y, t); else I.hist.push({ x: q.x, y: q.y, s: t }); } finally { I.botPtr = false; }
    };
    return (g) => {
      const s = g.session;
      if (!s || g.mode !== 'bat' || !s.physical) return;
      const b = s.b;
      if (b && b.plan && planFor !== b && b.phase === 'flight') {
        planFor = b;
        const plan = b.plan, h = s.h, ph = s.phys, plane = ph.plane;
        const tp = s.tAt(plane), C = BallPhys.posAt(plan, BallPhys.timeAtZ(plan, plane));
        const off = C.x * -h, st = BallPhys.hitsStumps(plan);
        // judged when you SEE it arrive: the crossing + the display latency
        const lat = ph.latency ? ph.latency() : 40;
        const sC = H.perfOf(tp) + lat + M.gauss() * (o.sigmaMs || 15) + (o.biasMs || 0);
        let shot = 'hit';
        if (!st.hit && off > 0.3 && Math.random() < 0.85) shot = 'leave';
        else if (C.y > 1.2 && !st.hit && Math.random() < 0.7) shot = 'leave';
        else if (st.hit && Math.random() < 0.3) shot = 'block';
        // mostly down the line of the ball (timing then only slides it along the blade), a
        // little sideways to steer it; the heavy bat trails the hand by 2v/omega on its spring
        // in a match, look for the gap in the real field and steer at it (a firmer sideways
        // component: in the nets it lands at about 0.85 of the asked angle); the nets keep the plain drive
        const gap = shot === 'hit' && o.rel == null && s.fs && s.fs.fielders ? gapRel(s.fs.fielders, h, off) : null;
        const rel = shot !== 'hit' ? 0 : o.rel != null ? o.rel : gap != null ? M.clamp((gap + M.gauss() * 8) / 0.85, -110, 110)
          : M.clamp((off > 0.1 ? 40 : off < -0.05 ? -35 : 0) + M.gauss() * 30, -110, 110);
        const side = Math.sin(M.rad(rel)) * -h;
        const d = V.norm(V.v(side * (o.sideK != null ? o.sideK : gap != null ? 0.8 : 0.35), -1, 0));
        const om = ph.weight ? ph.weight() : 0;
        const S = { x: C.x, y: M.clamp(C.y + 0.05, 0.12, 1.2) };
        let v = shot === 'hit' ? (o.v != null ? o.v : M.rand(4, 7)) : 0;
        if (om > 0 && v > 0) v = Math.min(v, Math.max(1.5, ((S.y - 0.1) * om) / 2));      // room below to swing through
        const lag = om > 0 ? (2 * v) / om : 0;
        const Hc = { x: S.x + d.x * lag, y: S.y + d.y * lag };
        if (shot === 'leave') {
          const away = { x: C.x + 0.9 * h, y: 1.3 };
          sw = { s0: sC - 400, s1: sC - 300, sC, C: away, d: { x: 0, y: 0 }, v: 0, rest: away, end: away };
        } else {
          const lead = 0.3;                                             // s of swing before contact
          sw = { s0: sC - lead * 1000, s1: sC + 150, sC, C: Hc, d, v, shot,
            rest: { x: Hc.x - d.x * v * lead, y: Hc.y - d.y * v * lead }, end: { x: Hc.x + d.x * v * 0.15, y: Hc.y + d.y * v * 0.15 } };
        }
        b._bot = { shot, rel: r3(rel), v: r3(v), off: r3(off), y: r3(C.y), d: { x: r3(d.x), y: r3(d.y) } };
      }
      push(g, s);
    };
  }

  // Record every applyBall of a match (res + ev), and per-ball camera / timing / exceptions
  function tapMatch(H, m, rec) {
    const ap = m.applyBall.bind(m);
    m.applyBall = (res) => {
      const ev = ap(res);
      const g = H.game, s = g.session, bb = s && s.b;
      // where it passed the popping crease (x * -h) and whether a shot was offered: the wide rule
      let wide = null;
      if (bb && bb.plan && CLLM.BallPhys && (s.live || bb.hitDone || bb.resolved || bb.phase === 'result' || bb.phase === 'done')) {
        const P = CLLM.BallPhys.posAt(bb.plan, CLLM.BallPhys.timeAtZ(bb.plan, CREASE[0]));
        const offered = g.mode === 'bowl' ? !!(bb.ai && bb.ai.shot !== 'leave' && bb.ai.shot !== 'duck') : !!(bb.res && bb.res.kind !== 'leave');
        wide = { offX: r3(P.x * -(s.h || 1)), offered };
      }
      rec.balls.push({ res: JSON.parse(JSON.stringify(res)), tag: ev.tag, wide, wicket: ev.wicket && ev.wicket.how, fielder: res.out && res.out.fielder, rt: g.realTime - rec.rt0, cut: rec.cut, tDead: s && s.fs && s.fs.result ? r3(s.fs.result.t) : null,
        live: !!(s && s.live), user: rec.user, youBat: m.youBatting });
      rec.rt0 = g.realTime; rec.cut = false;
      return ev;
    };
  }
  const camOn = (s) => !!(s && s.camOverride && s.camOverride());

  // ---- bowlBot(300): you bowl a Test-level Lite match ----
  function bowlBot(balls = 300, opts = {}) {
    if (balls && typeof balls === 'object') { opts = balls; balls = opts.balls || 300; }
    return run('bowlBot', opts.seed || 1, (R) => harness(opts, async (H) => {
      const { Match, MatchFlow } = CLLM;
      if (!Match || !MatchFlow || !CLLM.MatchBowling) return R.missing('bowlBot', 'Match / MatchFlow / MatchBowling');
      const g = H.game, rec = { balls: [], rt0: 0, cut: false, user: true };
      const guard = guardBall();
      const drive = bowlDriver(H, opts.errMs || 30);
      let errors = 0, err = null, m = null, matches = 0;
      const newM = () => { m = newMatchLive(opts.level || 'test', false); tapMatch(H, m, rec); matches++; rec.rt0 = g.realTime; MatchFlow.begin(m); };
      try {
        newM();
        let userBalls = 0, frames = 0;
        while (userBalls < balls && frames < balls * 60 * 40) {
          frames++;
          try {
            H.run(1 / 60, (gg) => {
              if (!g.match) { newM(); return true; }
              const s = gg.session;
              if (g.match && g.match.youBatting && !g.match.result && s && gg.mode === 'bat') { H.defer(() => MatchFlow.simTo('innings')); return true; }
              guard.fs = s && s.fs;
              if (camOn(s)) rec.cut = true;
              if (opts.onFrame) opts.onFrame(gg);
              drive(gg);
            });
          } catch (e) { errors++; if (!err) err = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); if (errors > 5) break; }
          userBalls = rec.balls.filter((b) => b.live != null && !b.youBat && b.user).length;
          if (frames % 600 === 0) await sleep0();
        }
      } finally { guard.restore(); }
      playStats(R, rec.balls.filter((b) => !b.youBat), { errors, err, bowl: true, stepped: guard.bad, matches, picker: H.pickerCalls });
    }));
  }
  function newMatchLive(level, youBatFirst, extra) {
    return new CLLM.Match(Object.assign({ format: 'lite', level, hand: 'R', controls: 'physical', assist: 'manual', youBatFirst }, extra || {}));
  }

  // ---- batBot(300): you bat (physical bat, synthetic swipes) and run on forecast() ----
  function batBot(balls = 300, opts = {}) {
    if (balls && typeof balls === 'object') { opts = balls; balls = opts.balls || 300; }
    return run('batBot', opts.seed || 1, (R) => harness(opts, async (H) => {
      const { Match, MatchFlow, FieldSim } = CLLM;
      if (!Match || !MatchFlow || !CLLM.MatchBatting) return R.missing('batBot', 'Match / MatchFlow / MatchBatting');
      const g = H.game, rec = { balls: [], rt0: 0, cut: false, user: true };
      const guard = guardBall();
      const swipe = batDriver(H, opts);
      const hasForecast = FieldSim && typeof FieldSim.prototype.forecast === 'function';
      const C = { run3: 0, heldStarts: 0, heldTests: 0, presses: 0, backs: 0, queueTests: 0, queueRefused: 0 };
      let errors = 0, err = null, m = null, matches = 0, ballNo = 0;
      H.choosePicker = () => 'siminns';                   // their innings: simulate it
      const newM = () => { m = newMatchLive(opts.level || 'grade', true, { assist: 'manual' }); tapMatch(H, m, rec); matches++; rec.rt0 = g.realTime; MatchFlow.begin(m); };
      const key = (k, up) => { const I = CLLM.Input; if (up) I.keys.delete(k); else I.keys.add(k); I.queue.push({ type: up ? 'keyup' : 'keydown', key: k, stamp: H.vt }); };
      let cur = null;
      const perBall = (s) => {
        const b = s.b;
        if (cur && cur.b === b) return cur;
        ballNo++;
        cur = { b, n: ballNo, called: false, leg: -1, held: ballNo % 20 === 7, heldDown: false, heldUp: false, spamDone: false, fresh: false };
        return cur;
      };
      try {
        newM();
        let frames = 0;
        const userBalls = () => rec.balls.filter((b) => b.youBat).length;
        while (userBalls() < balls && frames < balls * 60 * 40) {
          frames++;
          try {
            H.run(1 / 60, (gg) => {
              if (!g.match) { newM(); return true; }
              const s = gg.session;
              if (opts.onFrame) opts.onFrame(gg);
              if (!s || gg.mode !== 'bat') return;
              guard.fs = s.fs;
              if (camOn(s)) rec.cut = true;
              swipe(gg);
              const b = s.b, P = perBall(s), fs = s.fs;
              // a held key through contact: W down 0.2 s before the bat meets it, up 1.5 s later
              if (P.held && b && b.plan && !P.heldDown && gg.clock >= s.tAt(s.phys ? s.phys.plane : 1.4) - 0.2) { P.heldDown = true; P.tUp = gg.clock + 1.7; key('w'); C.heldTests++; }
              if (P.heldDown && !P.heldUp && gg.clock >= P.tUp) { P.heldUp = true; key('w', true); }
              if (!s.live || !fs || fs.result) return;
              const q = fs.want - fs.runsRun;
              if (q >= 3) C.run3++;
              if (P.held && !P.fresh && fs.want > 0) C.heldStarts++;
              if (P.held) return;                                      // that ball: no presses at all
              if (!hasForecast) return;
              const F = fs.forecast();
              if (!F || !F.ends) return;
              const mMin = Math.min(...F.ends.map((e) => e.margin));
              const tl = fs.tLive;
              if (!running(fs) && !P.called && tl >= 0.3 && mMin > 0.3) {
                P.called = true; key('w'); key('w', true); C.presses++;
                // every 8th run we start: hammer W twice more (the queue cap must refuse the third)
                C.starts = (C.starts || 0) + 1;
                if (C.starts % 8 === 4) { key('w'); key('w', true); key('w'); key('w', true); P.spamDone = true; C.queueTests++; }
                return;
              }
              if (running(fs) && fs.want === fs.runsRun + 1) {
                const A = fs.runners[0];
                const e = A.goal, frac = e == null ? 1 : 1 - Math.abs(CREASE[e] - A.z) / 17.68;
                const danger = Math.min(...F.ends.filter((x) => x.runner).map((x) => x.margin));
                if (danger < -0.2 && frac < 0.45) { key('s'); key('s', true); C.backs++; return; }
                if (P.leg !== fs.runsRun && Math.abs(A.z - 10) < 3 && typeof fs.advice === 'function' && fs.advice() === 'TWO') { P.leg = fs.runsRun; key('w'); key('w', true); C.presses++; }
              }
              if (P.spamDone && !P.cancelled && fs.want > 0) { P.cancelled = true; if (fs.want - fs.runsRun === 2) C.queueRefused++; key('s'); key('s', true); }
            });
          } catch (e) { errors++; if (!err) err = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); if (errors > 5) break; }
          if (frames % 600 === 0) await sleep0();
        }
      } finally { guard.restore(); }
      const mine = rec.balls.filter((b) => b.youBat);
      playStats(R, mine, { errors, err, bat: true, stepped: guard.bad, matches });
      const runs = mine.reduce((a, b) => a + (b.res.runs || 0), 0);
      const ro = mine.filter((b) => b.res.out && b.res.out.how === 'run out').length;
      R.max('run-outs per 150 balls', (ro * 150) / Math.max(1, mine.length), 1, `${ro} in ${mine.length}`);
      R.range('runs / ball', runs / Math.max(1, mine.length), 0.35, 0.9);
      if (!hasForecast) R.missing('running policy on forecast()', 'FieldSim.forecast');
      R.eq('RUN 3 queued (want >= runsRun + 3), steps', C.run3, 0);
      R.ok('queue cap: W x3 at once queues exactly RUN 2 (third refused)', !hasForecast || (C.queueTests > 0 && C.queueRefused === C.queueTests), { tests: C.queueTests, ok: C.queueRefused });
      R.eq(`held W through contact started a run (${C.heldTests} tests)`, C.heldStarts, 0);
      R.info('presses', C);
    }));
  }

  // The §10.6 tables from the recorded balls
  function playStats(R, list, o) {
    R.eq('exceptions', o.errors, 0, o.err || undefined);
    R.eq('live ball stepped outside FieldSim', o.stepped, 0);
    const legal = list.filter((b) => b.res.legal !== false);
    const n = list.length;
    const runs = list.reduce((a, b) => a + (b.res.runs || 0) + Object.values(b.res.extras || {}).reduce((x, y) => x + y, 0), 0);
    const outs = list.filter((b) => b.res.out);
    const how = {};
    for (const b of outs) how[b.res.out.how] = (how[b.res.out.how] || 0) + 1;
    const cK = outs.filter((b) => b.res.out.how === 'caught' && /keeper|slip|gully/.test(b.res.out.fielder || '')).length;
    const dots = list.filter((b) => b.tag === '·').length;
    const rt = list.map((b) => b.rt).filter((x) => x > 0);
    R.info('balls', { n, legal: legal.length, runs, outs: outs.length, how, matches: o.matches, picker: o.picker });
    if (!n) return R.ok('balls played', false, 0);
    if (o.bowl) {
      R.range('runs / over', (runs / Math.max(1, legal.length)) * 6, 2.6, 4.4);
      R.range('dots (%)', pct(dots, n), 62, 78);
      R.range('balls / wicket', legal.length / Math.max(1, outs.length), 35, 75);
      R.range('dismissals: caught (%)', pct(how.caught || 0, outs.length), 45, 65, `n=${outs.length}`);
      R.min('... keeper + slips (% of all dismissals)', pct(cK, outs.length), 10);
      R.range('... bowled + lbw (%)', pct((how.bowled || 0) + (how.lbw || 0), outs.length), 25, 45);
      R.max('... run out (%)', pct(how['run out'] || 0, outs.length), 6);
      R.min('balls with a cut to the follow cam (%)', pct(list.filter((b) => b.cut).length, n), 50);
      // RUN-6 wides, ball by ball: > 1.3 m off or > 1.0 m down leg at the popping crease, and no shot offered
      const Wd = sub('WIDE');
      const judged = list.filter((b) => b.wide && b.live != null);
      const bad = judged.filter((b) => ((b.wide.offX > Wd.off || b.wide.offX < -Math.abs(Wd.leg)) && !b.wide.offered) !== !!(b.res.extras && b.res.extras.w));
      R.eq(`wides called against the rule (${judged.length} balls, ${list.filter((b) => b.res.extras && b.res.extras.w).length} wides)`, bad.length, 0,
        bad.length ? JSON.stringify(bad.slice(0, 3).map((b) => ({ wide: b.wide, called: !!(b.res.extras && b.res.extras.w) }))) : undefined);
      R.max('real time per ball, mean (s)', rt.reduce((a, b) => a + b, 0) / Math.max(1, rt.length), 10);
      R.max('real time per ball, p90 (s)', quant(rt, 0.9), 16);
    } else {
      R.max('real time per ball, mean (s)', rt.reduce((a, b) => a + b, 0) / Math.max(1, rt.length), 8);
      const dead = list.map((b) => b.tDead).filter((x) => x != null);
      R.max('every live ball dead within (s)', dead.length ? Math.max(...dead) : null, 25);
    }
  }

  // ---- renderCount(): World._render calls while following must be 0 ----
  // 30 balls bowling + 30 batting (no resizes): at most 2 scenery renders per session start
  // (delivery + follow slots) plus 1 per change of batter hand, and none while following.
  async function renderCount(balls = 30, opts = {}) {
    if (balls && typeof balls === 'object') { opts = balls; balls = opts.balls || 30; }
    const W = CLLM.World, orig = W._render;
    const C = { total: 0, following: 0, followFills: 0, starts: 0, hands: 0 };
    let game = null, lastH = null, lastS = null;
    const filled = new Set();
    W._render = function () {
      C.total++;
      const s = game && game.session;
      // the first cut of a session fills the follow slot; any render after that while following is a miss
      if (camOn(s)) { if (filled.has(s)) C.following++; else { filled.add(s); C.followFills++; } }
      return orig.apply(this, arguments);
    };
    const onFrame = (g) => {
      game = g;
      const s = g.session;
      if (s !== lastS) { lastS = s; if (s) C.starts++; lastH = s ? s.h : null; return; }
      if (s && s.h !== lastH) { lastH = s.h; C.hands++; }
    };
    let a, b;
    try {
      a = await bowlBot(balls, Object.assign({}, opts, { onFrame }));
      b = await batBot(balls, Object.assign({}, opts, { onFrame }));
    } finally { W._render = orig; }
    return run('renderCount', opts.seed || 1, (R) => {
      R.eq('World._render calls while following (after the follow slot is filled)', C.following, 0);
      R.max('World._render calls (<= 2 per session start + 1 per batter-hand change)', C.total, 2 * C.starts + C.hands, `${C.starts} session starts, ${C.hands} hand changes`);
      R.info('counts', C);
      R.info('bowlBot', { pass: a.pass, fails: a.fails });
      R.info('batBot', { pass: b.pass, fails: b.fails });
    });
  }

  // ---- perf(): frame cost with the follow cam on (in the page only) ----
  // A frame = 2 sim ticks + 1 render (60 fps) + a synthetic 4 ms busy-loop for everything
  // else the browser does; measured with the real clock while the follow cam is on.
  const realNow = (typeof performance !== 'undefined' && performance.now) ? performance.now.bind(performance) : Date.now;   // bound before any bot patches it
  async function perf(opts = {}) {
    if (window.CLLM_HEADLESS) return run('perf', opts.seed || 1, (R) => { R.skip('p90 frame with the follow cam (ms)', 'needs a real canvas: run it in the page'); });
    return run('perf', opts.seed || 1, (R) => harness(opts, async (H) => {
      const { MatchFlow } = CLLM;
      if (!MatchFlow) return R.missing('perf', 'MatchFlow');
      const g = H.game;
      MatchFlow.begin(newMatchLive('test', false));
      const drive = bowlDriver(H, 30);
      const ms = [];
      let figs = 0, frames = 0;
      const want = opts.frames || 600;
      while (ms.length < want && frames < 60 * 300) {
        frames++;
        const following = camOn(g.session);
        const t0 = realNow();
        H.run(1 / 60, drive);
        const busy = realNow() + 4;
        while (realNow() < busy) { /* the rest of the browser's frame */ }
        if (following) {
          ms.push(realNow() - t0);
          const sc = g.session && g.session.scene ? g.session.scene() : null;
          if (sc && sc.figures) figs = Math.max(figs, sc.figures.length);
        }
        if (frames % 120 === 0) await sleep0();
      }
      R.max('p90 frame with the follow cam (2 ticks + render + 4 ms load, ms)', quant(ms, 0.9), 16.7, `${ms.length} frames, up to ${figs} figures`);
      R.min('figures in the follow-cam frames', figs, 16);
      R.info('frame ms', { median: r3(median(ms)), p90: r3(quant(ms, 0.9)), max: r3(ms.length ? Math.max(...ms) : null) });
    }));
  }

  // ======================================================================================================
  // §10.1 nets regression: one workload, run on the pre-change tree and on this one
  // ======================================================================================================
  async function netsWorkload(opts = {}) {
    const out = { v: 1, digests: {}, sim: {}, play: {} };
    const r0 = Math.random;
    try {
      // CLLM.simBat (sim.js; in the page it's imported on demand)
      if (!CLLM.simBat && !window.CLLM_HEADLESS) { try { await import('./sim.js?x=' + Date.now()); } catch (e) { /* no sim.js */ } }
      if (CLLM.simBat) {
        const cfgs = [
          { diff: 'grade', bowler: 'pace', sigma: 55, bias: -15, choice: 0.6, balls: 3000 },
          { diff: 'test', bowler: 'leg', hand: 'L', sigma: 45, bias: -10, choice: 0.7, balls: 1000 },
          { diff: 'club', bowler: 'off', sigma: 70, bias: -20, choice: 0.5, balls: 1000 },
        ];
        for (let i = 0; i < cfgs.length; i++) { Math.random = mulberry32(12345 + i); out.sim['simBat' + i] = CLLM.simBat(cfgs[i]); }
        out.digests.simBat = digest(out.sim);
      }
      Math.random = mulberry32(99);
      out.digests.netsBall = netsBallDigest();
      // the imaginary field (Field.project), every type and hand
      const F = new CLLM.Field(), fp = [];
      for (const type of ['pace', 'off', 'leg']) for (const hand of ['R', 'L']) {
        F.set(type, hand);
        for (let a = -180; a < 180; a += 7.5) for (const sp of [4, 11, 19, 27, 36]) for (const lf of [0.02, 0.2, 0.45, 0.8]) {
          const r = F.project(M.rad(a), sp, lf);
          fp.push([r.runs, r.out ? 1 : 0, r.how || '', r.fielder || '', r3(r.dist || 0)]);
        }
      }
      out.digests.fieldProject = digest(fp);
      // play: the nets through the real sessions (50 physical-bat balls, 50 bowled balls) + frame hashes
      if (opts.play !== false && CLLM.Game) {
        const pb = await netsPlay(opts);
        out.play = pb;
        out.digests.netsBat = digest(pb.bat);
        out.digests.netsBowl = digest(pb.bowl);
        if (pb.frames) out.digests.netsFrames = digest(pb.frames);
      }
    } finally { Math.random = r0; }
    return out;
  }

  // Headless frame hash: the static scenery re-rendered + one whole frame, through the recording canvas
  function snap(g, rec) {
    rec.state.on = true; rec.reset();
    try {
      const c = document.createElement('canvas');
      c.width = g.cam.w; c.height = g.cam.h;
      CLLM.World._render(c.getContext('2d'), g.cam);
      g._render();
      return rec.hash();
    } finally { rec.state.on = false; }
  }
  async function netsPlay(opts = {}) {
    const res = { bat: [], bowl: [], frames: null };
    Math.random = mulberry32(2024);
    await harness(Object.assign({}, opts), async (H) => {
      const g = H.game;
      const rec = window.CLLM_HEADLESS && CLLM.MatchBot.env && CLLM.MatchBot.env.rec;
      // batting: 50 balls, physical bat, pace, grade
      g.startBatting({ hand: 'R', bowler: 'pace', diff: 'grade', controls: 'physical' });
      const swipe = batDriver(H, {});
      let seen = null;
      const fr = [];
      for (let f = 0; f < 60 * 8 * 60 && res.bat.length < 50; f++) {
        H.run(1 / 60, (gg) => {
          swipe(gg);
          const b = gg.session.b;
          if (b && b.phase === 'done' && b !== seen && b.res) { seen = b; const r = b.res; res.bat.push([r.label || null, r.runs || 0, !!r.out, r.how || null, b._bot ? b._bot.shot : null]); }
        });
        if (rec && (f === 90 || f === 400)) fr.push('bat' + f + ':' + snap(g, rec));
        if (f % 600 === 0) await sleep0();
      }
      // bowling: 50 balls, pace at a right-hander, grade
      g.startBowling({ type: 'pace', hand: 'R', diff: 'grade' });
      const drive = bowlDriver(H, 30);
      seen = null;
      for (let f = 0; f < 60 * 12 * 60 && res.bowl.length < 50; f++) {
        H.run(1 / 60, (gg) => {
          drive(gg);
          const b = gg.session.b;
          if (b && b.phase === 'result' && b !== seen && b.out) { seen = b; const o = b.out; res.bowl.push([o.runs || 0, !!o.out, o.how || null, o.kind || null]); }
        });
        if (rec && (f === 120 || f === 500)) fr.push('bowl' + f + ':' + snap(g, rec));
        if (f % 600 === 0) await sleep0();
      }
      if (rec) res.frames = fr;
    });
    return res;
  }

  function netsRegression(opts = {}) {
    return run('netsRegression', opts.seed || 12345, async (R) => {
      const cur = await netsWorkload(opts);
      const base = opts.against || (Bot.BASELINE && Bot.BASELINE.workload) || Bot.BASELINE;
      R.info('digests', cur.digests);
      if (!base || !base.digests) { R.skip('nets regression', 'no baseline: run deno_load.js netsRegression (headless, both trees)'); return; }
      R.info('baseline digests', base.digests);
      for (const k of Object.keys(base.digests)) {
        if (k === 'netsFrames' && !cur.digests.netsFrames) { R.skip('nets frame draw-call hash', 'headless only (recording canvas)'); continue; }
        R.eq(`nets ${k} identical to the pre-change tree`, cur.digests[k], base.digests[k]);
      }
      if (base.sim && cur.sim && base.sim.simBat0) R.eq('CLLM.simBat(grade, pace, sigma 55, bias -15, choice 0.6, 3000) @ seed 12345', cur.sim.simBat0, base.sim.simBat0);
      if (base.play && cur.play && base.play.bat) {
        const diffAt = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i; return -1; };
        R.eq('nets 50-ball physical-bat sequence: first difference at ball', diffAt(cur.play.bat, base.play.bat), -1);
        R.eq('nets 50-ball bowling sequence: first difference at ball', diffAt(cur.play.bowl, base.play.bowl), -1);
        R.info('bat balls', cur.play.bat.length);
        R.info('bowl balls', cur.play.bowl.length);
      }
    });
  }

  const Bot = {
    physics, kinematics, throws, fieldOnly, laws, matchSims, netsRegression, batBot, bowlBot, perf, coverage, renderCount,
    _netsWorkload: netsWorkload, _harness: harness, _mulberry32: mulberry32, _digest: digest, _batDriver: batDriver, _bowlDriver: bowlDriver,
    // The pre-change tree's nets workload (git HEAD 6c31c03, made headless by
    // deno_load.js netsBaseline; regenerate it whenever _netsWorkload or the drivers change)
    BASELINE: {"v":1,"made":"2026-09-30T07:53:06","tree":"git HEAD 6c31c03 (pre match mode)","digests":{"simBat":"fd70ce6b","netsBall":"93abb514","fieldProject":"0d84199b","netsBat":"6607caea","netsBowl":"3a972edf","netsFrames":"7c1a9072"},"sim":{"simBat0":{"diff":"grade","bowler":"pace","sigma":55,"choice":0.6,"ballsPerOut":8.8,"runsPerOut":5.1,"boundaryPct":11.8,"sr":58,"how":{"lbw":173,"caught":50,"bowled":117},"clsPct":[21,22,29,27],"leaves":411}},"play":{"bat":[["MIDDLED",0,false,null,"hit"],["LEFT",0,false,null,"leave"],["MISTIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["MISTIMED",4,false,null,"hit"],["MISTIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["MISTIMED",0,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["BLOCKED",1,false,null,"block"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["LEFT",0,false,null,"leave"],["BLOCKED",0,false,null,"hit"],["MISTIMED",1,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["TIMED",0,false,null,"hit"],["BLOCKED",1,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["BLOCKED",0,false,null,"hit"],["MIDDLED",4,false,null,"hit"],["TIMED",0,false,null,"hit"],["BLOCKED",1,false,null,"block"],["BLOCKED",1,false,null,"block"],["MISSED",0,false,null,"hit"],["BLOCKED",2,false,null,"block"],["MIDDLED",4,false,null,"hit"],["BLOCKED",1,false,null,"block"],["TIMED",0,false,null,"hit"],["MIDDLED",4,false,null,"hit"],["MISTIMED",0,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["MIDDLED",4,false,null,"hit"],["MIDDLED",0,false,null,"hit"],["LEFT",0,false,null,"leave"],["LEFT",0,false,null,"leave"],["MISTIMED",0,false,null,"hit"],["LEFT",0,false,null,"leave"],["LEFT",0,false,null,"leave"],["LEFT",0,false,null,"leave"]],"bowl":[[0,false,null,"block"],[4,false,null,"hit"],[0,false,null,"block"],[1,false,null,"edge"],[6,false,null,"loft"],[0,false,null,"block"],[0,false,null,"block"],[4,false,null,"loft"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"leave"],[0,false,null,"leave"],[4,false,null,"hit"],[0,false,null,"block"],[0,false,null,"block"],[4,false,null,"hit"],[4,false,null,"hit"],[0,true,"caught","loft"],[4,false,null,"hit"],[0,false,null,"block"],[0,false,null,"block"],[4,false,null,"loft"],[0,false,null,"leave"],[0,false,null,"block"],[4,false,null,"hit"],[4,false,null,"loft"],[0,false,null,"leave"],[4,false,null,"loft"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"leave"],[0,false,null,"leave"],[0,false,null,"block"],[4,false,null,"hit"],[4,false,null,"hit"],[0,false,null,"block"],[0,false,null,"block"],[4,false,null,"hit"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"block"],[0,false,null,"block"],[4,false,null,"loft"],[0,false,null,"block"],[6,false,null,"loft"],[0,false,null,"block"],[3,false,null,"hit"]]}},
    // Everything that runs headless, in one go
    async all(o = {}) {
      const out = [];
      out.push(physics(), kinematics(), throws(), fieldOnly(o.n || 600), laws(), matchSims(o.sims || 100), coverage());
      return out.map((r) => ({ bot: r.bot, pass: r.pass, fails: r.fails }));
    },
  };
  CLLM.MatchBot = Bot;
})();
