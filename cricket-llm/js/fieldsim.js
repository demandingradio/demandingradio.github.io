/*
 * FIELD SIMULATION (match mode)
 * =============================
 * Eleven real fielders on a real ground. Once the ball is in play (hit, or
 * past the bat and on to the keeper) this owns it: fielders react, read the
 * ball's flight against the same integrator the ball uses, go for catches
 * (diving if they have to, and sometimes dropping them), cut it off, pick it
 * up, throw it to the end where there's a run-out on, and take the return at
 * the stumps. The two batters run between the wickets on the calls they're
 * given (the player's, or the AI's), and a run-out is judged the moment the
 * stumps are broken: bat grounded behind the popping crease or not.
 *
 * Everything live runs on one fixed step (CFG.MATCH.STEP, 1/120 s), and the
 * fielders' read of the ball (_predict) uses that same step, so what they
 * predict is exactly what happens.
 *
 * forecast() is the one source of truth for "is there a run in it?": the run
 * strip, the partner's shout (advice), the AI batters and the throw choice
 * all read it. margin = tBall - tBat: positive = the batter is safe by that.
 *
 * Frame: striker's stumps at z = 0, bowler's end stumps at z = 20.12 (the
 * same striker-relative frame as the rest of the game). End 0 = striker's
 * end, end 1 = bowler's end.
 *
 * Out: `this.result` once the ball is dead:
 *   { runs, ran, boundary: 0|4|6, out: null|{how: 'caught'|'run out'|'stumped', fielder, runner, end}, overthrow,
 *     drops:[names], why, ends: {A: 0|1, B: 0|1}, swapped, margin, closest: null|{end, s, cm, runner, out}, t }
 *   runs = what scores (0 when caught); ran = the runs completed before the ball was dead.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, World, Ball, Figure, FielderAnim } = CLLM;
  const PT = World.PITCH;
  const END_Z = [0, PT.LENGTH];
  const CREASE = [PT.POPPING, PT.LENGTH - PT.POPPING];     // 1.22, 18.9
  const DIRZ = [-1, 1];                                     // running toward end e moves z this way
  const STUMPS = [{ x: 0, z: END_Z[0] }, { x: 0, z: END_Z[1] }];
  const LEG = CREASE[1] - CREASE[0];                        // 17.68 m, crease to crease
  const DRAG = 0.0045;                                      // Ball's quadratic drag (per m)

  // Defaults = CFG.MATCH (config.js); FieldSim works before or without it
  const DEF = {
    STEP: 1 / 120,
    // Research-grounded (BBL GPS, Houghton 2010, Freeston, Davis catch data):
    // fielders 8.0 m/s, reach 1.0 / dive 2.4 m, one-motion pick-up-and-throw
    // ~0.6-0.8 s, accurate throws at ~75% of max (25-26 m/s), long ones 31-33.
    FIELD: {
      vmax: 7.8, accel: 6.5, react: 0.27, reactClose: 0.15, reactKeeper: 0.12,
      reach: 1.0, diveReach: 2.4, diveT: 0.35, catchH: 2.3, jumpH: 2.75,
      pickT: 0.36, pickRunT: 0.28, diveGetUp: 1.0,
      throwT: 0.46, throwV: 25.5, lobV: 17, throwMin: 22, throwPerM: 0.2, throwMax: 33,
      keeperV: 6.4, keeperAccel: 7,
      breakT: 0.2, fumbleKeeper: 0.03, keeperTakeBack: 0.03, keeperTakeUp: 0.06, noTouch: 0.35,
      fumbleV0: 13, fumbleK: 0.011, fumbleHighK: 1.3, aimSD: 0.026,
      directClose: 9, directMax: 20, deepNoShy: 30,
      walkIn: 3.0, sticky: 0.25, planEvery: 0.25, horizon: 7.5,
      catchBase: 0.95,
      // calibrated in the fieldOnly bot (WP-A, 30 Sep: all ~75%, keeper ~85, slips ~70, ring/deep ~89)
      kPos: { keeper: 1.12, slip: 0.90, close: 0.90, bowler: 0.80, ring: 1.08, deep: 1.06 },
      kSpeedV0: 20, kSpeedK: 0.015, kSpeedMin: 0.6,
      kHigh: 0.8, kLow: 0.85, kRun: 0.88, kDive: 0.55, kSkier: 0.92,
    },
    // Batters in pads: a single 2.93 s, a two 6.10, a three 9.28 (from the first step)
    RUN: {
      vmax: 7.0, accel: 7.0, decel: 16, turnPause: 0.06,
      stretch: 1.3, carry: 0.35, stretchNear: 2.6,
      startDelay: 0.35, playerStartMin: 0.30, playerStartLag: 0.12,
      backUp: 1.2, diveReach: 1.0, diveT: 0.35, diveDown: 0.8, diveMax: 3.5, diveDecel: 10,
      queueMax: 1, slideCost: 0.92,
    },
    AI_RUN: {
      look: 0.35, lookSkill: 0.20, base: 0.42, aggK: 0.30, skillK: 0.12,
      noise: 0.16, behindK: 1.5, easy: 1.2, heldClose: 30, strikerEnd: 0.15,
      sendBack: -0.25, sendBackFrac: 0.45, recheck: 0.1,
    },
  };

  // Merged once per ball (startLive / preBall / setField rebuild it), so a
  // tweak to CFG.MATCH in the console applies from the next ball, and the
  // 120 Hz inner loop doesn't re-merge objects.
  let CF = null;
  const cfg = () => {
    if (CF) return CF;
    const C = (CLLM.CFG && CLLM.CFG.MATCH) || {};
    const F = Object.assign({}, DEF.FIELD, C.FIELD || {});
    F.kPos = Object.assign({}, DEF.FIELD.kPos, (C.FIELD && C.FIELD.kPos) || {});
    CF = { F, R: Object.assign({}, DEF.RUN, C.RUN || {}), A: Object.assign({}, DEF.AI_RUN, C.AI_RUN || {}), STEP: C.STEP || DEF.STEP };
    return CF;
  };
  const recfg = () => { CF = null; return cfg(); };

  // Time to cover d metres from rest with acceleration a up to top speed v.
  function tCover(d, v, a) {
    if (d <= 0) return 0;
    const dA = (v * v) / (2 * a);
    return d <= dA ? Math.sqrt((2 * d) / a) : v / a + (d - dA) / v;
  }
  // The same, already moving at v0 toward it (v0 < 0: moving away, stop first at dec)
  function tCoverV(d, v0, v, a, dec) {
    if (d <= 0) return 0;
    let t = 0;
    if (v0 < 0) { t = -v0 / dec; d += (v0 * v0) / (2 * dec); v0 = 0; }
    v0 = Math.min(v0, v);
    const dA = (v * v - v0 * v0) / (2 * a);
    if (d <= dA) return t + (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a;
    return t + (v - v0) / a + (d - dA) / v;
  }
  const flat = (p) => ({ x: p.x, z: p.z });
  const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function roleOf(name) {
    if (name === 'keeper') return 'keeper';
    if (/slip|gully|short|silly|leg slip/.test(name)) return 'close';
    return 'ring';
  }

  // Keep a ground point inside the rope (ropeK <= k), pulling it toward the middle
  function inRope(p, k) {
    const G = CLLM.Ground;
    if (!G) return p;
    const r = G.ropeK(p.x, p.z);
    if (r <= k) return p;
    const C = G.C || { x: 0, z: 10 };
    return { x: C.x + ((p.x - C.x) * k) / r, z: C.z + ((p.z - C.z) * k) / r };
  }

  // Stumps shattering at either end
  function stumpsFx(zEnd, hitX, power) {
    const P = PT;
    const lean = P.STUMP_X.map((sx) => {
      const d = Math.abs(sx - hitX);
      return d < 0.07 ? M.rand(0.45, 0.85) * power : d < 0.14 ? M.rand(0.1, 0.3) * power : M.rand(0, 0.08);
    });
    const away = zEnd > 10 ? 1 : -1;
    const bails = [
      { a: V.v(-0.1, P.STUMP_H + 0.012, zEnd), b: V.v(-0.002, P.STUMP_H + 0.012, zEnd), v: V.v(M.rand(-2, -0.5), M.rand(2.5, 4), away * M.rand(1.5, 3)), w: M.rand(-12, 12) },
      { a: V.v(0.002, P.STUMP_H + 0.012, zEnd), b: V.v(0.1, P.STUMP_H + 0.012, zEnd), v: V.v(M.rand(0.5, 2), M.rand(2.5, 4.5), away * M.rand(1.5, 3)), w: M.rand(-12, 12) },
    ];
    return { broken: true, t: 0, lean, dir: hitX * 4, bails };
  }
  function stumpsFxStep(fx, dt) {
    fx.t += dt;
    for (const b of fx.bails) {
      if (b.a.y <= 0.013 && b.v.y === 0) continue;
      b.v.y -= 9.81 * dt;
      const dp = V.mul(b.v, dt);
      b.a = V.add(b.a, dp); b.b = V.add(b.b, dp);
      const c = V.lerp(b.a, b.b, 0.5), r = V.rotY(V.sub(b.b, c), b.w * dt);
      b.a = V.sub(c, r); b.b = V.add(c, r);
      if (b.a.y < 0.012 || b.b.y < 0.012) {
        const lift = 0.012 - Math.min(b.a.y, b.b.y);
        b.a.y += lift; b.b.y += lift;
        b.v = V.v(b.v.x * 0.4, Math.abs(b.v.y) * 0.3, b.v.z * 0.4); b.w *= 0.5;
        if (Math.abs(b.v.y) < 0.3) b.v.y = 0;
      }
    }
  }

  class FieldSim {
    /*
     * opts: { skill 0..1 (the fielding side), cap colour, keeperUp (bool) }
     */
    constructor(opts = {}) {
      recfg();
      this.skill = opts.skill == null ? 0.7 : opts.skill;
      this.cap = opts.cap || '#15294a';
      this.fielders = [];
      this.runners = [];
      this.umpires = [];
      this.live = false;
      this.ball = null;
      this.fx = [null, null];              // stumps effects per end
      this.events = [];                    // for sound / commentary: {type, ...}
      this.t = 0;
      this.tLive = 0;
      this.acc = 0;
      this.control = 'player';
      // umpires: bowler's end (behind the stumps) and square leg
      for (let i = 0; i < 2; i++) {
        const f = new Figure('bowler', FielderAnim.umpireKit());
        f.setSkin(3 + i);
        this.umpires.push({ fig: f, anim: new FielderAnim(f), at: i ? { x: 24, z: 1.2 } : { x: 0.95, z: 22.4 }, face: i ? { x: -1, z: 0 } : { x: 0, z: -1 } });
      }
      // the non-striker (runner B); runner A is the striker's own figure, handed over at the hit
      this.nsFig = new Figure('batter');
      this.nsFig.setSkin(1);
    }

    // ---- set-up --------------------------------------------------------------------
    // positions: [{name, x, z}] in world coords (already mirrored for the batter's hand)
    setField(positions, h) {
      const C = recfg().F;
      this.h = h || 1;
      const old = new Map(this.fielders.map((f) => [f.name, f]));
      this.fielders = positions.map((p, i) => {
        const prev = old.get(p.name);
        const role = roleOf(p.name);
        const keeper = role === 'keeper';
        const fig = prev ? prev.fig : new Figure(keeper ? 'batter' : 'bowler', keeper ? FielderAnim.keeperKit(this.cap) : FielderAnim.whites(this.cap));
        if (!prev) fig.setSkin(i * 3 + 1);
        fig.mirror = false;
        const f = prev || { fig, anim: new FielderAnim(fig) };
        // the deep men stand a few metres inside the rope (set distances are from the striker)
        const home = inRope({ x: p.x, z: p.z }, 0.93);
        Object.assign(f, {
          name: p.name, role, home,
          vmax: keeper ? C.keeperV : C.vmax * (0.94 + 0.12 * this.skill), accel: keeper ? C.keeperAccel : C.accel,
          react: keeper ? C.reactKeeper : role === 'close' ? C.reactClose : C.react * (1.15 - 0.3 * this.skill),
        });
        if (!prev) Object.assign(f, { pos: { x: home.x, z: home.z }, vel: { x: 0, z: 0 } });
        return f;
      });
      this.resetPositions(true);
    }

    // Everyone back to their marks (snap = teleport, between balls)
    resetPositions(snap) {
      for (const f of this.fielders) {
        if (snap) { f.pos = { x: f.home.x, z: f.home.z }; f.vel = { x: 0, z: 0 }; }
        f.job = 'set'; f.st = 'set'; f.u = 0; f.holding = false; f.dive = null; f.wait = 0; f.hands = null; f.pt = null; f.noTouchUntil = -1;
        f.plan = null; f.breakAt = null; f.carryTo = null; f.throwAt = null; f.released = false;
        f.face = this._faceBat(f.pos);
      }
      this.fx = [null, null];
    }

    _faceBat(p) { const d = { x: 0.2 - p.x, z: 3 - p.z }; const l = Math.hypot(d.x, d.z) || 1; return { x: d.x / l, z: d.z / l }; }

    // Before each ball: marks, the non-striker backing up, the keeper up or back
    preBall(opts = {}) {
      recfg();
      this.live = false; this.result = null; this.ball = null; this.events = [];
      this.acc = 0; this.tLive = 0; this.thrown = false; this.holder = null; this.prim = null;
      this.resetPositions(true);
      const keeper = this.fielders.find((f) => f.role === 'keeper');
      if (keeper && opts.keeperUp != null) keeper.up = opts.keeperUp;
      // non-striker on the other side of the stumps from the bowler's arm
      const nsX = (opts.bowlerX || -0.8) > 0 ? -1.0 : 1.0;
      this.nsX = nsX;
      const sq = this.umpires[1];
      if (sq) { sq.at = { x: 24 * this.h, z: 1.2 }; sq.face = { x: -this.h, z: 0 }; }
      this.nsFig.mirror = false;
      this.runners = [
        { key: 'A', fig: null, z: 0.9, x: 0.15 * this.h, v: 0, goal: null, legs: 0, st: 'crease', stretch: 0, face: 1, startIn: 0, dive: null, dived: false },
        { key: 'B', fig: this.nsFig, z: CREASE[1] + 0.6, x: nsX, v: 0, goal: null, legs: 0, st: 'crease', stretch: 0, face: -1, startIn: 0, dive: null, dived: false },
      ];
      this.want = 0;            // runs called (the batters stop when they've run this many)
      this.runsRun = 0;
      this.drops = [];
      this.overthrows = 0;
    }

    // Called every frame while the bowler runs in (k: 0..1 of the run-up)
    // and until the ball is hit or passes the bat.
    preUpdate(dt, now, k, released) {
      const C = cfg().F;
      for (const f of this.fielders) {
        // ring fielders walk in as the bowler approaches; close catchers crouch
        let tgt = f.home;
        if (f.role === 'ring' && k > 0.35) {
          const w = C.walkIn * M.smooth((k - 0.35) / 0.65);
          const d = { x: 0.2 - f.home.x, z: 6 - f.home.z }, l = Math.hypot(d.x, d.z) || 1;
          tgt = { x: f.home.x + (d.x / l) * w, z: f.home.z + (d.z / l) * w };
        }
        this._steer(f, tgt, dt, 1.6, 2);
        f.face = this._faceBat(f.pos);
      }
      // the non-striker backs up as the ball is bowled
      const B = this.runners[1];
      if (B && !this.live) {
        const R = cfg().R;
        const want = released || k > 0.8 ? CREASE[1] - R.backUp : CREASE[1] + 0.6;
        const dz = want - B.z;
        B.v = M.clamp(dz * 2.2, -1.6, 1.6);
        B.z += B.v * dt;
      }
      this.t = now;
    }

    // ---- going live ------------------------------------------------------------------
    /*
     * The ball is in play. info = {
     *   now, strikerFig, strikerZ, hit (bool: off the bat), control: 'player'|'ai'|'none',
     *   ai: {skill, aggression}  (AI running), bowlerFig, bowlerPos {x,z},
     *   keeperFumble (bool: the session has ruled a missed stumping, so the keeper's first take goes down)
     * }
     */
    startLive(ball, info) {
      const C = recfg().F, R = cfg().R;
      this.live = true;
      this.ball = ball;
      this.t0 = info.now; this.t = info.now; this.tLive = 0; this.acc = 0; this.tried = null; this.triedAt = null;
      this.control = info.control || 'player';
      this.userCalls = false;
      this.playerCalled = false;              // a player call this ball (in 'ai' mode it takes over)
      this.ai = info.ai || { skill: 0.6, aggression: 0.5 };
      this.hit = !!info.hit;
      this.thrown = false; this.throwFrom = null; this.throwEnd = null; this.throwHard = false; this.lastTouch = null;
      this.boundaryDone = false; this.deadAt = null; this.result = null; this.caught = null;
      this.overthrow = false; this.runsAtThrow = 0; this.crossedAtThrow = false; this.throwTgt = null; this.throwDir = null;
      this.lastMargin = null; this.closest = null; this.holder = null; this.throwFromF = null;
      this.fielded = false;                   // a fielder has had it (or thrown it): no catch now
      this.parried = false;                   // a catch went down: no second go at it
      this.defl = null;                       // the fielder it last came off (a fumble or a drop), until it's in hand again
      this.keeperOnly = true;                 // nobody but the keeper has laid a hand on it (for stumped, Law 39)
      this.runCalled = false;                 // a run has been tried this ball
      this.keeperFumble = !!info.keeperFumble;
      this.deadHold = 0; this.deadAcc = 0; this.holdCheck = 0; this.tDead = null;
      this.runsRun = 0; this.want = 0; this.drops = [];
      this.lastPlan = -1;
      this.aiDecided = false; this.aiLeg = -1; this.aiNoise = null; this.aiSeen = null; this.aiT = 0; this.misfield = null; this.prim = null;
      // which of them calls: the striker in front of square, the non-striker behind it
      const bv = ball && ball.vel ? ball.vel : { x: 0, z: 1 };
      this.shotBearing = this.hit ? Math.abs(M.deg(Math.atan2(bv.x, bv.z))) : 180;
      // runner A: the striker, from where he played the shot
      const A = this.runners[0];
      A.fig = info.strikerFig || null;
      if (A.fig) { A.mirror0 = A.fig.mirror; A.fig.mirror = false; }
      A.z = Math.min(info.strikerZ != null ? info.strikerZ : 0.9, 2.6);
      A.startIn = info.hit ? R.startDelay : 0.25;
      for (const r of this.runners) { r.dive = null; r.dived = false; r.groundAt = null; r.groundEnd = null; r.sentBack = false; r.legDone = false; r.pause = 0; }
      // past the bat with him out of his ground (he danced): he scrambles straight back
      if (!this.hit && !this._inGround(A, 0)) { A.goal = 0; A.sentBack = true; A.st = 'run'; A.startIn = 0; }
      const Bn = this.runners[1];
      if (Bn && Bn.z < CREASE[1]) Bn.v = Math.min(Bn.v, -1.2);      // backing up: already on the move
      // the bowler joins the field at the end of his follow-through
      if (info.bowlerFig) {
        const bp = info.bowlerPos || { x: -1.2, z: 16.8 };
        let bw = this.fielders.find((f) => f.role === 'bowler');
        if (!bw) {
          bw = { name: 'bowler', role: 'bowler', fig: info.bowlerFig, anim: new FielderAnim(info.bowlerFig), home: { x: bp.x, z: bp.z } };
          this.fielders.push(bw);
        }
        bw.fig = info.bowlerFig; bw.anim.fig = info.bowlerFig;
        bw.mirror0 = info.bowlerFig.mirror; info.bowlerFig.mirror = false;
        Object.assign(bw, { pos: { x: bp.x, z: bp.z }, vel: { x: 0, z: -1.5 }, home: { x: bp.x, z: bp.z }, vmax: C.vmax * 0.9, accel: C.accel, react: C.react + 0.1, job: 'set', st: 'set', holding: false, dive: null, u: 0, breakAt: null, carryTo: null, plan: null });
      }
      for (const f of this.fielders) { f.wait = f.react; f.job = 'set'; f.st = 'set'; f.breakAt = null; f.carryTo = null; f.noTouchUntil = -1; }
      this._plan(true);
    }

    // Player / AI calls. 'run': go (each further press queues one more run,
    // at most queueMax beyond the one in progress; on the way back after a
    // 'back', it turns them round again for the run). 'back': cancel a queued
    // run, or (mid-run, from anywhere) turn both batters round and get back
    // to the ends they started the run from; refused only once they're
    // already going back (or a diver is down). 'dive': the runner a throw is
    // coming at dives for the line (only when diveLegal()). src 'ai' = the
    // AI batters' own call. true = the call is on (a 'run' is really run).
    call(cmd, src) {
      if (!this.live || this.result || this.control === 'none') return false;
      const R = cfg().R;
      const [A, B] = this.runners;
      if (A.st === 'out' || B.st === 'out') return false;
      const player = src !== 'ai', by = player ? 'player' : 'ai';
      const running = A.goal != null || B.goal != null;
      if (cmd === 'run') {
        if (A.dived || B.dived) return false;                 // a diver is down: that's the last run
        if (this.runners.some((r) => r.sentBack && r.goal != null)) {
          // on the way back and he's changed his mind: round again, and it's the run they gave up on
          for (const r of this.runners) {
            if (r.goal != null && !r.sentBack) continue;      // (still on the run in progress: he turns for it)
            r.goal = r.goal == null ? (r.z < 10 ? 1 : 0) : 1 - r.goal;
            r.sentBack = false; r.st = 'run';
            this._legStart(r);
            this.want = Math.max(this.want, r.legDone ? r.legs : r.legs + 1);
          }
        } else if (!running) {
          this.want = this.runsRun + 1;
          // ends from the pair: the one nearer the striker's end runs to the far one, and vice versa
          A.goal = A.z <= B.z ? 1 : 0; B.goal = 1 - A.goal;
          for (const r of this.runners) { r.st = 'run'; r.sentBack = false; r.legs = this.runsRun; this._legStart(r); }
          // your striker: off as soon as he's out of his shot (a quick call pays)
          if (player && A.startIn > 0) A.startIn = Math.max(R.playerStartMin - this.tLive, 0) + R.playerStartLag;
        } else {
          if (this.want >= this.runsRun + 1 + R.queueMax) return false;
          this.want++;
          // one of them already pulled up at the end: he's off again too
          for (const r of this.runners) if (r.goal == null) { r.goal = r.z < 10 ? 1 : 0; r.st = 'run'; r.sentBack = false; this._legStart(r); }
        }
        if (player) this.playerCalled = true;
        this.runCalled = true;
        this.events.push({ type: 'call', what: 'yes', want: this.want - this.runsRun, by });
        return true;
      }
      if (cmd === 'back') {
        if (!running || A.dived || B.dived || this.want <= this.runsRun) return false;     // (the runs called are all made: they're just pulling up)
        const legNow = this.runsRun + 1;          // the run they're on
        if (this.want > legNow) {
          this._capRuns(legNow);
          if (player) this.playerCalled = true;
          this.events.push({ type: 'call', what: 'stay', by });
          return true;
        }
        if (!this.runners.some((r) => r.goal != null && !r.sentBack)) return false;    // already on their way back
        if (player) this.playerCalled = true;
        // turn round: both back to the ends they started this run from (it won't count)
        const a0 = this.runsRun % 2;              // A's end before this run
        for (const r of this.runners) { r.goal = r.key === 'A' ? a0 : 1 - a0; r.sentBack = true; r.st = 'run'; r.legs = this.runsRun; r.legDone = false; }
        this.want = this.runsRun;
        this.events.push({ type: 'call', what: 'back', by });
        return true;
      }
      if (cmd === 'dive') {
        if (!this.diveLegal()) return false;
        const r = this._diveRunner();
        r.dive = { t: 0, down: 0 }; r.dived = true; r.stretch = 1;
        this._capRuns(this.runsRun + 1);
        this.events.push({ type: 'dive', runner: r.key });
        return true;
      }
      return false;
    }
    // r sets off for his goal (already over the line there: that end's made)
    _legStart(r) {
      r.legDone = false;
      if (this._inGround(r, r.goal)) { r.legDone = true; r.legs++; r.groundAt = this.tLive; r.groundEnd = r.goal; }
    }
    // No more than n runs: anyone already off on a later one goes back to the end he's just made
    _capRuns(n) {
      this.want = Math.min(this.want, n);
      for (const r of this.runners) if (r.goal != null && !r.sentBack && !r.legDone && r.legs >= this.want) { r.goal = 1 - r.goal; r.sentBack = true; }
    }
    // Runs still to come on the current calls
    get queued() { return Math.max(0, this.want - this.runsRun); }
    // Can the player make a call right now?
    get userCanCall() { return this.control !== 'none' && this.live && !this.result; }

    // The runner a throw is coming at, still running for the line
    _diveRunner() {
      return this.runners.find((q) => q.goal === this.throwEnd && q.st === 'run' && !q.dive && !q.dived) || null;
    }
    // A dive is on: a throw in the air, your runner heading for that end, within diveMax
    diveLegal() {
      if (!this.live || this.result || !this.thrown || this.throwEnd == null) return false;
      if (!(this.control === 'player' || (this.control === 'ai' && this.playerCalled))) return false;
      const r = this._diveRunner();
      if (!r || this._inGround(r, r.goal)) return false;
      const R = cfg().R;
      return Math.abs(CREASE[r.goal] - r.z) - R.stretch <= R.diveMax;
    }

    // ---- per frame ----------------------------------------------------------------------
    // Cosmetics on the frame's dt; the simulation on a fixed step.
    update(dt, now) {
      this.t = now;
      for (let e = 0; e < 2; e++) if (this.fx[e]) stumpsFxStep(this.fx[e], dt);
      if (!this.live) return;
      const STEP = cfg().STEP;
      this.acc = Math.min((this.acc || 0) + dt, 0.5);        // a stalled tab doesn't spiral
      while (this.acc >= STEP - 1e-9) {
        this.acc -= STEP;
        this._step(STEP);
      }
    }

    _step(h) {
      const C = cfg().F, b = this.ball;
      this.tLive += h;
      if (b.mode === 'free') {
        const prev = V.copy(b.pos);
        b.update(h);
        this._ballStep(prev, b.pos);
      }
      if (this.result) { this._settle(h); this._keepIn(); return; }
      if (this.tLive - this.lastPlan >= C.planEvery - 1e-9) this._plan(false);
      for (const f of this.fielders) this._fielder(f, h);
      if (b.mode === 'held' && this.holder) b.pos = this.holder.fig && this.holder.fig.J ? V.copy(this.holder.fig.J.rHand) : V.v(this.holder.pos.x, 1, this.holder.pos.z);
      this._aiRunning(h);
      this._runnersStep(h);
      this._deadCheck(h);
      this._keepIn();
      if (this.tLive > 25 && !this.result) this._dead('timeout');
    }

    // Nobody runs through the rope
    _keepIn() {
      for (const f of this.fielders) {
        const p = inRope(f.pos, 1);
        if (p !== f.pos) { f.pos = p; f.vel.x *= 0.3; f.vel.z *= 0.3; }
      }
    }

    // ---- the ball meets the world ----------------------------------------------------------
    _ballStep(prev, cur) {
      const b = this.ball, C = cfg().F;
      // boundary
      if (CLLM.Ground.ropeK(cur.x, cur.z) >= 1 && !this.boundaryDone) {
        this.boundaryDone = true;
        const six = !b.landed && !this.thrown && this.hit && !this.overthrow && !this.fielded;
        const allow = six ? 6 : 4;
        const overthrow = this.thrown || this.overthrow;
        this.events.push({ type: 'boundary', runs: allow, overthrow });
        this._finish({ boundary: allow, overthrow });
        return;
      }
      // a throw (or a straight hit) crashing into the stumps (already down: it takes a man with the ball in hand now, Law 29.2)
      for (let e = 0; e < 2; e++) {
        if (this.fx[e]) continue;
        const hit = hitStumps(prev, cur, END_Z[e]);
        if (hit) {
          const x = hit.x;
          if (!this.thrown && !this.defl) continue;   // only a throw (or off a fielder: the bowler's fingertips, Law 38) can run someone out
          const by = this.thrown ? this.throwFrom || 'direct hit' : this.defl.name;
          this.fx[e] = stumpsFx(END_Z[e], x, 0.8);
          this.events.push({ type: 'stumps', end: e, direct: true, by });
          b.vel = V.v(b.vel.x * 0.5 + M.rand(-1, 1), Math.abs(b.vel.y) * 0.3, -b.vel.z * 0.25);
          this._runOutCheck(e, by);
          if (this.result) return;
        }
      }
      // hands: catches, stops, takes
      for (const f of this.fielders) {
        if (f.holding || f.st === 'throw' || f.st === 'down' || f.noTouchUntil > this.tLive) continue;   // (just fumbled / dropped it: it's gone past him)
        const hands = this._handsReach(f);
        if (!hands) continue;
        const d = distSeg(hands.c, prev, cur);
        if (d > hands.r) continue;
        if (!b.landed && this.hit && !this.thrown && !this.fielded && !this.parried && cur.y > 0.05) {
          if (cur.y > C.jumpH) continue;                      // over his head, out of reach
          // a high one coming down to him: take it at chest height if it'll still be in reach there
          // (where he'll be by then, if he's still running under it)
          if (cur.y > 1.9 && b.vel.y < 0 && f.job === 'catch' && !hands.dive) {
            const vy = -b.vel.y, tD = (-vy + Math.sqrt(vy * vy + 2 * 9.81 * (cur.y - 1.5))) / 9.81;
            if (Math.hypot(cur.x + b.vel.x * tD - f.pos.x - f.vel.x * tD, cur.z + b.vel.z * tD - f.pos.z - f.vel.z * tD) < hands.r * 0.8) continue;
          }
          this._catchAttempt(f, cur, hands);
          if (this.result || f.holding) return;
          continue;
        }
        if (this.thrown) {
          if (f === this.throwFromF) continue;
          if (f.job === 'stumps' || f.job === 'backup') { this._take(f); if (f.holding) return; }
          continue;
        }
        if (!this.hit && f.role === 'keeper' && !this.fielded && !this.defl) {
          if (cur.z > END_Z[0]) continue;               // (his gloves stay behind the stumps till it's past them, Law 27.3)
          this._keeperTake(f); if (f.holding) return; continue;
        }
        if (cur.y < C.catchH) { this._stop(f, cur.y > 1.1 ? C.fumbleHighK : 1); if (f.holding) return; }
      }
      // a throw that has got past its target and everyone behind it (or died
      // on the way) is a loose ball
      if (this.thrown && this.throwTgt) {
        const T = this.throwTgt, u = this.throwDir;
        const past = (cur.x - T.x) * u.x + (cur.z - T.z) * u.z;
        const died = b.landed && Math.hypot(b.vel.x, b.vel.z) < 4;
        if ((past > 2.5 && !this._takerAhead(cur, u)) || died) {
          this.thrown = false; this.throwFromF = null;
          this.misfield = this.tLive;
          if (past > 2.5 && !died) { this.overthrow = true; this.overthrows++; this.events.push({ type: 'overthrow' }); }
          this._plan(true);
        }
      }
    }

    // Someone taking the throw still in front of it (the keeper coming up behind the stumps)?
    _takerAhead(p, u) {
      for (const f of this.fielders) {
        if (f === this.throwFromF || f.holding || (f.job !== 'stumps' && f.job !== 'backup')) continue;
        const along = (f.pos.x - p.x) * u.x + (f.pos.z - p.z) * u.z;
        if (along < -0.5 || along > 14) continue;
        const side = Math.abs((f.pos.x - p.x) * u.z - (f.pos.z - p.z) * u.x);
        if (side < 2.5) return true;
      }
      return false;
    }

    // Where a fielder's hands can get to right now
    _handsReach(f) {
      const C = cfg().F;
      if (f.st === 'dive' && f.dive) {
        const u = M.clamp(f.u, 0, 1);
        if (u > 0.55) return null;
        const c = V.v(f.pos.x + f.dive.dir.x * f.dive.reach * M.easeOut(u / 0.3), 0.5, f.pos.z + f.dive.dir.z * f.dive.reach * M.easeOut(u / 0.3));
        return { c, r: 0.75, dive: true };
      }
      if (f.job === 'set' && f.role !== 'keeper' && f.role !== 'close' && !this.thrown) {
        // not going for it, but a ball straight at you still gets stopped
        return { c: V.v(f.pos.x, 0.7, f.pos.z), r: 0.55 };
      }
      const hy = M.clamp(this.ball.pos.y, 0.1, C.jumpH);
      return { c: V.v(f.pos.x, hy, f.pos.z), r: f.role === 'keeper' ? C.reach * 1.3 : C.reach, dive: false };
    }

    // P(held) = catchBase * position * speed * height * movement * skill (Davis 2008-16:
    // 75% held overall, keeper ~85%, slips ~71%; the kPos table is calibrated in the fieldOnly bot)
    _catchAttempt(f, p, hands) {
      const C = cfg().F, b = this.ball, K = C.kPos;
      const sp = V.len(b.vel);
      const dive = hands.dive;
      // Reflexes: hit hard at a man a few metres away, it's often past him
      // before he moves. He gets one go at it (touch or not); a proper
      // chance (half a second or more to see it) is judged as usual.
      const reflex = M.clamp((this.tLive - 0.1) / 0.35, 0.25, 1);
      if (reflex < 1 && f.role !== 'keeper') {
        if (!this.tried) this.tried = new Set();
        if (this.tried.has(f)) return;
        this.tried.add(f);
        if (Math.random() > reflex) { this.events.push({ type: 'beat', fielder: f.name }); return; }
      }
      const dist = Math.hypot(f.home.x, f.home.z);
      const kPos = f.role === 'keeper' ? K.keeper : f.role === 'bowler' ? K.bowler : /slip|gully/.test(f.name) ? K.slip : f.role === 'close' ? K.close : dist > 45 ? K.deep : K.ring;
      const kSpeed = Math.max(C.kSpeedMin, 1 - C.kSpeedK * Math.max(0, sp - C.kSpeedV0));
      const kHeight = p.y > 2.0 ? C.kHigh : p.y < 0.35 ? C.kLow : 1;
      const moving = Math.hypot(f.vel.x, f.vel.z);
      const kMove = dive ? C.kDive : moving > 1.2 ? C.kRun : 1;
      const kSkill = 0.9 + 0.12 * this.skill;
      let pr = C.catchBase * kPos * kSpeed * kHeight * kMove * kSkill;
      if (this.tLive > 3) pr *= C.kSkier;                          // a skier: all that time to think
      pr = M.clamp(pr, 0.05, 0.99);
      const ok = Math.random() < pr;
      f.st = dive ? 'dive' : 'catch'; if (!dive) f.u = 0;
      f.hands = V.copy(p);
      if (ok) {
        this.caught = f;
        f.holding = true; this.holder = f;
        b.mode = 'held';
        this.events.push({ type: 'caught', fielder: f.name, role: f.role, dive, moving: moving > 1.2, pr, y: p.y, sp });
        this._finish({ out: { how: 'caught', fielder: f.name, runner: 'A', end: null } });
      } else {
        this.drops.push(f.name);
        this.events.push({ type: 'dropped', fielder: f.name, role: f.role, dive, moving: moving > 1.2, pr, y: p.y, sp });
        // it pops out: slower, deflected, and no more catches (it still hasn't bounced: over the rope on the full is six)
        const v = b.vel;
        b.vel = V.v(v.x * 0.25 + M.rand(-2, 2), Math.max(1.5, Math.abs(v.y) * 0.2), v.z * 0.25 + M.rand(-2, 2));
        this.parried = true;
        f.wait = 0.35;
        this._misfield(f);
      }
    }

    // It's come off f (a fumble or a drop): gone past him for a moment, and news for the batters
    _misfield(f) {
      f.noTouchUntil = this.tLive + cfg().F.noTouch;
      this.lastTouch = f.role; this.defl = f;
      if (f.role !== 'keeper') this.keeperOnly = false;
      this.misfield = this.tLive;
      this._plan(true);
    }

    // A ground ball meets a fielder: gathered cleanly, or fumbled
    _stop(f, extra = 1) {
      const C = cfg().F, b = this.ball;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      const pf = Math.max(0, C.fumbleK * (sp - C.fumbleV0)) * (1.3 - 0.6 * this.skill) * (f.st === 'dive' ? 1.8 : 1) * extra;
      if (Math.random() < pf) {
        b.vel = V.v(b.vel.x * 0.18 + M.rand(-1.5, 1.5), 0.6, b.vel.z * 0.18 + M.rand(-1.5, 1.5));
        this.events.push({ type: 'fumble', fielder: f.name });
        f.wait = 0.3;
        this._misfield(f);
        return;
      }
      this._gather(f);
    }

    // The keeper taking the delivery (byes if he fumbles it; a missed stumping always goes down)
    _keeperTake(f) {
      const C = cfg().F;
      const up = Math.hypot(f.home.x, f.home.z) < 4;
      if (this.keeperFumble || Math.random() < (up ? C.keeperTakeUp : C.keeperTakeBack) * (1.3 - 0.6 * this.skill)) {
        const b = this.ball;
        this.keeperFumble = false;
        b.vel = V.v(b.vel.x * 0.15 + M.rand(-2.5, 2.5), 0.6, -Math.abs(b.vel.z) * 0.12 - M.rand(0.5, 2.5));
        this.events.push({ type: 'fumble', fielder: f.name });
        f.wait = 0.35;
        this._misfield(f);
        return;
      }
      this._gather(f, true);
    }

    // Taking a throw (keeper / bowler at the stumps, or the man backing up)
    _take(f) {
      const C = cfg().F;
      if (Math.random() < C.fumbleKeeper * (f.role === 'keeper' ? 1 : 2)) {
        const b = this.ball;
        b.vel = V.v(b.vel.x * 0.2 + M.rand(-1, 1), 0.5, b.vel.z * 0.2 + M.rand(-1, 1));
        this.events.push({ type: 'fumble', fielder: f.name });
        this.thrown = false; this.throwFromF = null;
        f.wait = 0.25;
        this._misfield(f);
        return;
      }
      this._gather(f, true);
    }

    _gather(f, taken) {
      const C = cfg().F, b = this.ball;
      f.holding = true; this.holder = f;
      b.mode = 'held';
      this.thrown = false; this.throwFromF = null; this.fielded = true;
      this.lastTouch = f.role; this.defl = null;
      if (f.role !== 'keeper') this.keeperOnly = false;
      const moving = Math.hypot(f.vel.x, f.vel.z) > 3;
      f.st = f.st === 'dive' ? 'down' : taken ? 'hold' : 'pickup';
      f.u = 0;
      f.stT = f.st === 'down' ? C.diveGetUp : taken ? 0.05 : moving ? C.pickRunT : C.pickT;
      f.hands = V.copy(b.pos);
      this.events.push({ type: taken ? 'take' : 'gather', fielder: f.name });
      // someone has it: the chase is off, and the keeper (and bowler) get to the stumps for the return
      for (const g of this.fielders) {
        if (g === f || g.holding || g.st === 'throw') continue;
        if (g.role === 'keeper' && g.job !== 'stumps') { g.job = 'stumps'; g.pt = this._stumpsSpot(0); }
        else if (g.role === 'bowler' && g.job !== 'stumps') { g.job = 'stumps'; g.pt = this._stumpsSpot(1); }
        else if (g.job === 'field' || g.job === 'catch') { g.job = 'watch'; g.pt = null; }
      }
      // at the stumps with a runner short? break them
      this._atStumps(f, true);
    }

    // ---- planning: who goes where ---------------------------------------------------
    // The ball's flight from here, on the live step (so prediction == reality):
    // a sample every `every` steps {t, p, landed, dead, over}. (A legacy
    // second argument < 1 is read as a sample interval in seconds.)
    _predict(T, every) {
      const K = cfg(), STEP = K.STEP;
      if (T == null) T = K.F.horizon;
      if (every == null) every = 4;
      else if (every < 1) every = Math.max(1, Math.round(every / STEP));
      const b = this.ball;
      const out = [{ t: 0, p: V.copy(b.pos), landed: !!b.landed, dead: b.mode === 'dead' }];
      if (b.mode !== 'free') return out;
      const s = this._scratch || (this._scratch = new Ball());
      s.onEvent = null; s.open = b.open; s.mode = 'free'; s.trail = [];
      s.pos = V.copy(b.pos); s.vel = V.copy(b.vel); s.landed = b.landed; s.tFree = 0; s.netHit = false;
      const n = Math.round(T / STEP);
      const G = CLLM.Ground;
      for (let i = 1; i <= n; i++) {
        s.update(STEP);
        const dead = s.mode === 'dead';
        const over = G.ropeK(s.pos.x, s.pos.z) > 1.04;
        if (i % every === 0 || dead || over || i === n) out.push({ t: i * STEP, p: V.copy(s.pos), landed: s.landed, dead, over });
        if (dead || over) break;
      }
      return out;
    }

    // Where will the ball end up (or be in T s)? For the camera's no-cut rule.
    predictEnd(T = 5) {
      if (!this.ball) return { x: 0, z: 0, t: 0, over: false };
      const S = this._predict(T, 8), s = S[S.length - 1];
      return { x: s.p.x, z: s.p.z, t: s.t, over: !!s.over };
    }

    _plan(force) {
      const C = cfg().F, b = this.ball;
      this.lastPlan = this.tLive;
      if (b.mode !== 'free' || this.result) return;
      if (this.thrown) return;               // the receiver and the back-up man are set; everyone else watches
      const S = this._predict();
      // (a man in mid-dive is committed: he's not in the plan until he's up)
      const avail = this.fielders.filter((f) => !f.holding && f.st !== 'throw' && f.st !== 'down' && f.st !== 'dive');
      // catches: the ball in the air at a catchable height, off the bat
      const catchable = this.hit && !this.thrown && !this.fielded && !b.landed && !this.parried;
      for (const f of this.fielders) f.plan = null;          // no stale plans
      for (const f of avail) {
        const c = catchable ? this._bestCatch(f, S) : null;
        const g = this._bestField(f, S);
        g.tAbs = this.tLive + g.t;                            // when (live-clock) he gets to it
        if (g.dv) g.dv.tAbs = this.tLive + g.dv.t;
        if (g.fc && g.fc !== g) g.fc.tAbs = this.tLive + g.fc.t;
        f.plan = { c, g };
      }
      // primary: the best catch chance (most time to spare), else first to cut it off.
      // Sticky: the man already going keeps it unless someone is clearly better.
      let prim = null;
      const cur = this.prim;
      const diving = cur && cur.st === 'dive' && cur.u <= 0.55;     // his hands are still in it
      if (diving) prim = cur;
      if (catchable && !prim) {
        for (const f of avail) {
          const c = f.plan.c;
          if (c && c.margin > -C.diveT && (!prim || c.margin > prim.plan.c.margin)) prim = f;
        }
        if (prim && cur && cur !== prim && avail.indexOf(cur) >= 0 && cur.plan.c && cur.plan.c.margin > -C.diveT && cur.plan.c.margin >= prim.plan.c.margin - C.sticky) prim = cur;
        if (prim) prim.jobNext = 'catch';
      }
      // a ball that's gone past the bat is the keeper's: he gets across to
      // where it'll reach him (any height he can get a glove to)
      const kp = this.fielders.find((f) => f.role === 'keeper');
      if (!prim && !this.hit && b.vel.z < 0 && kp && avail.indexOf(kp) >= 0) {
        let at = null;
        for (const s of S) if (s.p.z <= kp.pos.z + 0.3 || s.dead) { at = s; break; }
        if (at && at.p.y < C.jumpH && hd(kp.pos, at.p) < 6) { prim = kp; prim.jobNext = 'field'; kp.plan.g = { t: at.t, p: at.p, tAbs: this.tLive + at.t, run: false }; }
      }
      if (!prim) {
        for (const f of avail) if (!prim || f.plan.g.t < prim.plan.g.t) prim = f;
        // (nobody can cut it off: they all chase it to the rope, and he's as good as anyone)
        const stick = cur && cur.plan && prim && cur.plan.g.t >= 99 && prim.plan.g.t >= 99 ? 5 : C.sticky;
        if (cur && prim && cur !== prim && avail.indexOf(cur) >= 0 && cur.plan && cur.plan.g.t < prim.plan.g.t + stick) prim = cur;
        if (prim) prim.jobNext = 'field';
      }
      this.prim = prim;
      // second man: backs up / chases too
      let sec = null;
      for (const f of avail) if (f !== prim && f.role !== 'keeper' && (!sec || f.plan.g.t < sec.plan.g.t)) sec = f;
      const keeper = kp;
      const bowler = this.fielders.find((f) => f.role === 'bowler');
      const end1 = bowler || this._nearestTo({ x: 0, z: 21 }, [prim, keeper, sec]);       // (no bowler: the nearest man takes his end)
      for (const f of this.fielders) {
        if (f.holding || f.st === 'throw' || f.st === 'down' || f.st === 'dive') continue;
        let job = 'watch', pt = null;
        if (f === prim) { job = prim.jobNext; pt = prim.jobNext === 'catch' ? flat(prim.plan.c.p) : flat(prim.plan.g.p); f.late = prim.jobNext === 'catch' && prim.plan.c.margin < 0.12; }
        else if (f === keeper) {
          // up to the stumps, unless it's still on its way back to him (an edge: stay and take it)
          let coming = false;
          if (b.vel.z < -2 && b.pos.z > f.pos.z - 1) {
            const tc = (b.pos.z - f.pos.z) / -b.vel.z;
            coming = Math.abs(b.pos.x + b.vel.x * tc - f.pos.x) < 4 && b.pos.y + b.vel.y * tc - 4.9 * tc * tc < 3;
          }
          if (coming) job = 'watch'; else { job = 'stumps'; pt = this._stumpsSpot(0); }
        }
        else if (f === end1) { job = 'stumps'; pt = this._stumpsSpot(1); }
        else if (f === sec) {
          // go too, but stop short in line behind it (backing up)
          const g = f.plan.g.p, q = flat(prim ? prim.pos : g);
          const d = { x: g.x - q.x, z: g.z - q.z }, l = Math.hypot(d.x, d.z) || 1;
          job = 'backup'; pt = { x: g.x + (d.x / l) * 6, z: g.z + (d.z / l) * 6 };
          if (CLLM.Ground.ropeK(pt.x, pt.z) > 0.97) pt = flat(g);
        }
        if (pt) pt = inRope(pt, 0.99);
        if (force || f.job !== job || job === 'field' || job === 'catch' || job === 'backup') { f.job = job; f.pt = pt; }
      }
      // the non-bowler at the bowler's end, if the bowler is chasing it himself
      let cover1 = end1;
      if (bowler && prim === bowler) {
        cover1 = this._nearestTo({ x: 0, z: 21 }, [prim, keeper, sec]);
        if (cover1) { cover1.job = 'stumps'; cover1.pt = this._stumpsSpot(1); }
      }
      // and someone up to the keeper's end if he's off chasing it (short fine, leg slip, fine leg...)
      if (keeper && prim === keeper && prim.plan && hd(prim.plan.g.p, STUMPS[0]) > 12 && hd(prim.plan.g.p, keeper.pos) > 2.5) {
        const cover = this._nearestTo(this._stumpsSpot(0), [prim, keeper, sec, cover1]);
        if (cover) { cover.job = 'stumps'; cover.pt = this._stumpsSpot(0); }
      }
    }

    _nearestTo(p, not) {
      let best = null, bd = Infinity;
      for (const f of this.fielders) {
        if (not.indexOf(f) >= 0 || f.holding || f.role === 'keeper' || f.st === 'throw' || f.st === 'down' || f.st === 'dive') continue;
        const d = hd(f.pos, p);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    }

    // Time for f to get his hands to p (extra: more reach, e.g. a dive). A
    // man already on the move toward it gets there sooner than from rest.
    _tNeed(f, p, extra = 0) {
      const C = cfg().F;
      const dx = p.x - f.pos.x, dz = p.z - f.pos.z, dist = Math.hypot(dx, dz);
      const d = Math.max(0, dist - C.reach * (f.role === 'keeper' ? 1.3 : 1) * 0.7 - extra);     // (the keeper's gloves reach further)
      let v0 = 0, turn = 0;
      if (f.wait <= 0 && dist > 1e-6 && f.vel) {
        v0 = (f.vel.x * dx + f.vel.z * dz) / dist;
        turn = Math.abs(f.vel.x * dz - f.vel.z * dx) / dist / (2 * f.accel);   // stopping the sideways run costs a little
      }
      return Math.max(0, f.wait) + tCoverV(d, v0, f.vmax, f.accel, f.accel * 1.6) + turn + 0.1;
    }

    _bestCatch(f, S) {
      const C = cfg().F;
      let best = null;
      for (const s of S) {
        if (s.landed) break;
        if (s.t < 0.05 || s.p.y > C.jumpH || s.p.y < 0.08) continue;
        if (CLLM.Ground.ropeK(s.p.x, s.p.z) > 0.985) continue;      // can't catch it over the rope
        const margin = s.t - this._tNeed(f, s.p);
        // prefer a comfortable height, a little (not over his head, not at his boots)
        const score = margin - (s.p.y > C.catchH ? 0.12 : s.p.y < 0.6 ? 0.1 : 0);
        if (!best || score > best.score) best = { t: s.t, p: s.p, margin, score };
      }
      return best;
    }

    // First point on the ball's path he can get to in time. run: he gets
    // there as the ball does (fields it on the move: the quicker pick-up)
    // dv: the first point he could stop it with a dive (then he's down a while)
    // fc: the same for the forecast, without the 0.1 s planning margin (the
    // batters must not count on a fielder being slow)
    _bestField(f, S) {
      const C = cfg().F;
      let dv = null, fc = null;
      for (const s of S) {
        if (s.p.y > 1.4 && !s.dead) continue;
        if (s.over) break;
        const need = this._tNeed(f, s.p);
        const run = need > s.t - 0.3 && hd(f.pos, s.p) > 2;
        if (!fc && need - 0.1 <= s.t + 0.02) fc = { t: Math.max(s.t, need - 0.1), p: s.p, run };
        // (or it's coming within reach of where he is: he just has to put his hands down)
        if (need <= s.t + 0.02 || s.dead || (f.wait <= s.t && s.t < 0.6 && hd(f.pos, s.p) < C.reach * 1.25)) {
          const g = { t: Math.min(Math.max(s.t, need), Math.max(s.t, f.wait)), p: s.p, run, dv };
          g.fc = fc || g;
          return g;
        }
        if (!dv && s.p.y < 0.9 && s.t > 0.15 && this._tNeed(f, s.p, C.diveReach * 0.8) <= s.t) dv = { t: s.t, p: s.p };
      }
      const last = S[S.length - 1];
      return { t: 99 + hd(f.pos, last.p), p: last.p, run: false, dv, fc };
    }

    // ---- fielders ---------------------------------------------------------------------
    _steer(f, tgt, dt, vmaxK = 1, arriveK = 2.4) {
      const dx = tgt.x - f.pos.x, dz = tgt.z - f.pos.z, d = Math.hypot(dx, dz);
      const vm = Math.min(f.vmax * vmaxK, d * arriveK);
      const want = d > 1e-4 ? { x: (dx / d) * vm, z: (dz / d) * vm } : { x: 0, z: 0 };
      let ax = want.x - f.vel.x, az = want.z - f.vel.z;
      const al = Math.hypot(ax, az), amax = f.accel * dt * (al > 0 && ax * f.vel.x + az * f.vel.z < 0 ? 1.6 : 1);
      if (al > amax) { ax *= amax / al; az *= amax / al; }
      f.vel.x += ax; f.vel.z += az;
      f.pos.x += f.vel.x * dt; f.pos.z += f.vel.z * dt;
    }

    _fielder(f, dt) {
      const C = cfg().F, b = this.ball;
      f.wait -= dt;
      const ballG = flat(b.pos);
      const toBall = () => { const d = { x: b.pos.x - f.pos.x, z: b.pos.z - f.pos.z }, l = Math.hypot(d.x, d.z) || 1; return { x: d.x / l, z: d.z / l }; };
      // one-shot actions
      if (f.st === 'catch') { f.u += dt / 0.9; this._stopMoving(f, dt); if (f.u >= 1 && !f.holding) f.st = 'set'; return; }
      if (f.st === 'dive') {
        const u0 = f.u;
        f.u += dt / 0.95;
        // dived and missed it: that's news for the batters
        if (u0 <= 0.55 && f.u > 0.55 && !f.holding && b.mode === 'free') { this.misfield = this.tLive; this._plan(true); }
        if (f.u >= 1) {
          f.st = f.holding ? 'down' : 'set'; f.stT = C.diveGetUp * 0.4; f.u = 0;
          if (f.dive) { f.pos.x += f.dive.dir.x * f.dive.reach; f.pos.z += f.dive.dir.z * f.dive.reach; }
          f.dive = null;
          if (!f.holding) { f.wait = C.diveGetUp * 0.4; this._plan(true); }    // getting up again
        }
        this._stopMoving(f, dt, 6);
        return;
      }
      if (f.st === 'pickup' || f.st === 'down' || f.st === 'hold') {
        f.stT -= dt; f.u += dt / Math.max(0.2, C.pickT);
        if (f.st === 'hold' && f.carryTo != null) {
          // near his own stumps with it: run it in (and take the bails off if one's short)
          this._steer(f, this._stumpsSpot(f.carryTo), dt, 1, 4);
          f.face = norm2({ x: 0 - f.pos.x, z: END_Z[f.carryTo] - f.pos.z });
        } else this._stopMoving(f, dt, f.st === 'pickup' ? 10 : 20);
        if (f.st === 'hold') { this._atStumps(f); if (this.result) return; }
        if (f.stT <= 0) this._decideThrow(f);
        // holding at the stumps: if the batters set off again, think again (throw to the other end?)
        if (f.st === 'hold' && f.stT > 50 && this.runners.some((r) => r.goal != null)) {
          this.holdCheck = (this.holdCheck || 0) + dt;
          if (this.holdCheck > 0.25) { this.holdCheck = 0; this._decideThrow(f); }
        }
        return;
      }
      if (f.st === 'throw') {
        f.u += dt / C.throwT;
        this._stopMoving(f, dt, 8);
        if (!f.released && f.u >= FielderAnim.THROW_RELEASE) this._release(f);
        if (f.u >= 1) { f.st = 'set'; f.job = 'return'; f.pt = f.home; }
        return;
      }
      if (f.holding) {
        // holding it at the stumps: wait for a runner to be short, or it's dead
        this._stopMoving(f, dt, 10);
        this._atStumps(f);
        return;
      }
      if (f.wait > 0) { this._stopMoving(f, dt); f.face = toBall(); return; }
      switch (f.job) {
        case 'catch':
        case 'field': {
          // a ball that has stopped (or is barely moving) just gets picked up
          if ((b.mode === 'dead' || (b.mode === 'free' && V.len(b.vel) < 2.5 && b.pos.y < 0.5)) && hd(f.pos, ballG) < C.reach * 0.9 && !(f.noTouchUntil > this.tLive)) { this._gather(f); return; }
          const pt = f.pt || ballG;
          // when it's close, go at the ball itself
          // a ground ball: run through the intercept, and when it's close go at the ball itself.
          // A catch: get under it and settle (unless he's only just going to make it)
          const catching = f.job === 'catch' && !b.landed && !this.parried;
          const close = !catching && hd(f.pos, ballG) < 4 && b.pos.y < 2.5;
          // (his hands already cover where it's coming: stay put and wait for it)
          if (catching && hd(f.pos, pt) < (f.role === 'keeper' ? 1.3 : 1) * C.reach * 0.6) this._stopMoving(f, dt, 8);
          else this._steer(f, close ? ballG : pt, dt, 1, catching && !f.late ? 2.4 : 9);
          f.face = hd(f.pos, pt) > 1.5 && !close ? norm2(f.vel) : toBall();
          // dive at it if it's going to pass just out of reach
          this._maybeDive(f);
          break;
        }
        case 'stumps':
          if (this.thrown && this.throwEnd != null) {
            const spot = this._stumpsSpot(this.throwEnd);
            if (hd(f.pt || f.pos, spot) < 1.5) {
              // where will the throw pass? get across to it (within a few metres of the stumps)
              const bv = { x: b.vel.x, z: b.vel.z }, bs = Math.hypot(bv.x, bv.z);
              if (bs > 2) {
                const t = M.clamp(((f.pos.x - b.pos.x) * bv.x + (f.pos.z - b.pos.z) * bv.z) / (bs * bs), 0, 2);
                const p = { x: b.pos.x + bv.x * t, z: b.pos.z + bv.z * t };
                const d = hd(p, spot);
                const tgt = d < 3.5 ? p : { x: spot.x + ((p.x - spot.x) / d) * 3.5, z: spot.z + ((p.z - spot.z) / d) * 3.5 };
                this._steer(f, tgt, dt, 1, 4);
                f.face = toBall();
                break;
              }
            }
          }
          // falls through
        case 'backup':
        case 'return':
          this._steer(f, f.pt || f.home, dt, f.job === 'return' ? 0.45 : 1, 2.5);
          f.face = f.job === 'return' && hd(f.pos, f.pt || f.home) > 2 ? norm2(f.vel) : toBall();
          break;
        default:
          // watching: a couple of steps toward the ball, then stand
          this._steer(f, f.pos, dt);
          f.face = toBall();
      }
    }

    _stopMoving(f, dt, k = 4) {
      const s = Math.max(0, 1 - k * dt);
      f.vel.x *= s; f.vel.z *= s;
      f.pos.x += f.vel.x * dt; f.pos.z += f.vel.z * dt;
    }

    _maybeDive(f) {
      const C = cfg().F, b = this.ball;
      if (f.st === 'dive' || b.mode !== 'free') return;
      const bv = { x: b.vel.x, z: b.vel.z }, bs = Math.hypot(bv.x, bv.z);
      if (bs < 2) return;
      // closest approach of the ball's ground track to the fielder, and when
      const rx = f.pos.x - b.pos.x, rz = f.pos.z - b.pos.z;
      const tc = (rx * bv.x + rz * bv.z) / (bs * bs);
      if (tc < 0.05 || tc > C.diveT + 0.08) return;
      const cx = b.pos.x + bv.x * tc, cz = b.pos.z + bv.z * tc;
      const miss = Math.hypot(cx - f.pos.x, cz - f.pos.z);
      const yAt = b.pos.y + b.vel.y * tc - 4.9 * tc * tc;
      const catchDive = f.job === 'catch' && !b.landed && !this.parried && yAt < 1.8 && yAt > 0.05;
      const stopDive = f.job === 'field' && yAt < 0.9;
      // only if running won't get him there (nobody dives at one he can walk to)
      const dir0 = norm2({ x: cx - f.pos.x, z: cz - f.pos.z });
      const vTo = f.vel.x * dir0.x + f.vel.z * dir0.z;
      if (tCoverV(miss - C.reach * 0.9, vTo, f.vmax, f.accel, f.accel * 1.6) <= tc) return;
      if ((catchDive || stopDive) && miss > C.reach * 0.9 && miss < C.reach + C.diveReach) {
        const dir = norm2({ x: cx - f.pos.x, z: cz - f.pos.z });
        f.st = 'dive'; f.u = 0; f.dive = { dir, reach: Math.min(C.diveReach, miss - 0.2) };
        f.hands = V.v(cx, Math.max(0.1, yAt), cz);
        this.events.push({ type: 'dive', fielder: f.name });
      }
    }

    // ---- forecast: is there a run in it? -------------------------------------------------
    // Hard-throw speed over d metres (the same as _release) and its flight
    // time (with the ball's drag, and the flat arc a throw that far needs)
    _spd(d) { const C = cfg().F; return M.clamp(C.throwMin + C.throwPerM * d, C.throwMin, C.throwMax) * (0.94 + 0.1 * this.skill); }
    _flightT(d, v) {
      if (d <= 0) return 0;
      const th = 0.5 * Math.asin(Math.min(1, (9.81 * d) / (v * v)));
      return (Math.exp(DRAG * d) - 1) / (DRAG * v * Math.cos(th));
    }
    _recvReady(e) {
      const r = this._receiver(e);
      return !!r && hd(r.pos, this._stumpsSpot(e)) < 1.5;
    }
    // Would f shy at the stumps at end e from d metres (FS-8)?
    _directOK(f, e, d) {
      const C = cfg().F;
      if (f.role === 'keeper' || this.fx[e] || d > C.deepNoShy || Math.hypot(f.home.x, f.home.z) > 40) return false;   // (no shying at stumps already down)
      return d < C.directClose || (!this._recvReady(e) && d < C.directMax);
    }

    // When will the man taking it at end e be at the stumps? (0: he's there)
    _recvIn(e) {
      const r = this._receiver(e);
      if (!r) return null;
      const spot = this._stumpsSpot(e), dist = hd(r.pos, spot);
      if (dist < 1.5) return 0;
      const v0 = r.wait <= 0 ? (r.vel.x * (spot.x - r.pos.x) + r.vel.z * (spot.z - r.pos.z)) / dist : 0;
      return Math.max(0, r.wait) + tCoverV(dist - 1.0, v0, r.vmax, r.accel, r.accel * 1.6);
    }
    // Ball in the air to end e, arriving in tArr: when can the wicket be broken?
    // (a shy breaks it itself; a take needs the man there and a beat to do it)
    _atEnd(e, tArr, direct) {
      const C = cfg().F;
      if (direct) return tArr;
      const tR = this._recvIn(e);
      if (tR == null) return tArr + C.breakT + 0.5;           // nobody there: someone has to get to it
      return Math.max(tArr, tR) + C.breakT;
    }
    // f throws from `at` to end e once `wait` s have passed (plus the wind-up)
    _throwIn(f, at, e, wait) {
      const C = cfg().F;
      const d = hd(at, STUMPS[e]);
      const tArr = wait + FielderAnim.THROW_RELEASE * C.throwT + this._flightT(d, this._spd(d));
      return this._atEnd(e, tArr, this._directOK(f, e, d));
    }
    // Seconds until the ball can break the wicket at end e (Infinity: nobody can get to it)
    _tBall(e, from) {
      const C = cfg().F, b = this.ball;
      if (!b) return Infinity;
      if (this.thrown && this.throwEnd != null && !from) {
        const te = this.throwEnd;
        const rem = hd(b.pos, STUMPS[te]);
        const hs = Math.max(4, Math.hypot(b.vel.x, b.vel.z));
        let t = this._atEnd(te, (Math.exp(DRAG * rem) - 1) / (DRAG * hs), this.throwDirect && !this.fx[te]);
        if (e !== te) t += 0.5 * C.pickT + this._flightT(LEG + 2.44, this._spd(20)) + C.breakT;
        return t;
      }
      const f = from || (b.mode === 'held' ? this.holder : null);
      if (f) return this._tBallHeld(f, e);
      // free: the first man to it picks up and throws (or dives, stops it, gets up and throws)
      let best = Infinity;
      for (const g of this.fielders) {
        if (!g.plan || !g.plan.g || g.holding) continue;
        const P = g.plan.g;
        const Q = P.fc && P.fc.tAbs != null ? P.fc : P;
        if (Q.t < 60) {
          const reach = Math.max(0, Q.tAbs - this.tLive);
          const t = hd(Q.p, STUMPS[e]) <= 2.2 ? reach + C.pickRunT + C.breakT : this._throwIn(g, Q.p, e, reach + (Q.run ? C.pickRunT : C.pickT));
          if (t < best) best = t;
        }
        if (P.dv && g === this.prim && P.dv.t < P.t) {
          const t = this._throwIn(g, P.dv.p, e, Math.max(0, P.dv.tAbs - this.tLive) + C.diveGetUp);
          if (t < best) best = t;
        }
      }
      // a man in mid-dive at it
      for (const g of this.fielders) {
        if (g.st !== 'dive' || !g.dive || g.u > 0.55 || b.mode !== 'free') continue;
        const t = this._throwIn(g, g.pos, e, Math.max(0, 0.55 - g.u) * 0.95 + C.diveGetUp);
        if (t < best) best = t;
      }
      return best;
    }
    _tBallHeld(f, e) {
      const C = cfg().F;
      const d = hd(f.pos, STUMPS[e]);
      if (d <= 2.2) return f.breakAt != null ? Math.max(0, f.breakAt - this.tLive) : 0.6 * C.breakT;
      if (f.st === 'hold' && f.carryTo === e) return tCover(Math.max(0, d - 1.8), f.vmax, f.accel) + 0.6 * C.breakT;
      const rel = FielderAnim.THROW_RELEASE;
      if (f.st === 'throw' && f.throwAt && !f.released) {
        // already winding up: to where he's throwing (and relayed on from there)
        const T = f.throwAt, dT = hd(f.pos, STUMPS[T.end]);
        const v = T.hard ? this._spd(dT) : C.lobV;
        let t = this._atEnd(T.end, Math.max(0, rel - f.u) * C.throwT + this._flightT(dT, v), (T.direct || !this._receiver(T.end)) && !this.fx[T.end]);
        if (T.end !== e) t += 0.5 * C.pickT + this._flightT(LEG + 2.44, this._spd(20)) + C.breakT;
        return t;
      }
      const wait = f.st === 'hold' && f.stT > 50 ? 0 : Math.max(0, f.stT || 0);
      return this._throwIn(f, f.pos, e, wait);
    }

    // How long A has to wait before his first step if they go now
    _startWait(r) {
      if (r.key !== 'A' || !(r.startIn > 0)) return 0;
      const R = cfg().R;
      return this.control === 'player' ? Math.max(R.playerStartMin - this.tLive, 0) + R.playerStartLag : r.startIn;
    }
    // Seconds for runner r to make his ground at end e. hyp: he isn't running (yet)
    _tBat(r, e) {
      const R = cfg().R;
      if (!r || r.st === 'out') return 0;
      if (r.goal === e) return this._runnerETA(r, e);
      if (r.goal == null) {
        if (this._inGround(r, e)) return 0;         // in, and staying there
        // standing: if he set off now (at his current speed toward it)
        const dist = Math.max(0, (CREASE[e] - r.z) * DIRZ[e] - R.stretch);
        return this._startWait(r) + tCoverV(dist, r.v * DIRZ[e], R.vmax, R.accel, R.decel);
      }
      // running the other way: get there, turn, and come back
      return this._turnTimeLeft(r) + R.turnPause + tCover(LEG - R.stretch, R.vmax, R.accel);
    }
    // Time for r to reach the turn at the end he's running to (and stop)
    _turnTimeLeft(r) {
      const R = cfg().R;
      if (r.goal == null) return 0;
      const e = r.goal, v = Math.max(0, r.v * DIRZ[e]);
      const d = Math.max(0, (CREASE[e] - 0.35 * DIRZ[e] - r.z) * DIRZ[e]);
      // (+ the extra a stop costs over running straight through: v / 2 decel)
      return this._startWait(r) + tCoverV(d, v, R.vmax, R.accel, R.decel) + Math.min(R.vmax, Math.sqrt(v * v + 2 * R.accel * d)) / (2 * R.decel);
    }

    /*
     * The run-out picture right now (or, with `from`, as if fielder `from` had the ball):
     * { t, runsRun, want, queued, running, crossed, basis: 'none'|'plan'|'held'|'thrown',
     *   chaser, throwEnd, ends: [{end, runner, tBat, tBall, margin}] }
     * margin = tBall - tBat: + = the batter makes his ground by that many seconds.
     * Not running: "if we go now" (the batter at the striker's end runs to end 1).
     */
    forecast(from = null) {
      const [A, B] = this.runners;
      const running = !!(A && B) && (A.goal != null || B.goal != null);
      const b = this.ball;
      const F = {
        t: this.tLive, runsRun: this.runsRun || 0, want: this.want || 0, queued: this.queued, running, crossed: this._crossed(),
        basis: 'none', chaser: null, throwEnd: this.thrown && !from ? this.throwEnd : null, ends: [],
      };
      if (!this.live || !A || !B || !b) {
        for (let e = 0; e < 2; e++) F.ends.push({ end: e, runner: null, tBat: 0, tBall: Infinity, margin: Infinity });
        return F;
      }
      const holder = from || (b.mode === 'held' ? this.holder : null);
      F.basis = this.thrown && !from ? 'thrown' : holder ? 'held' : 'plan';
      F.chaser = holder ? holder.name : this.prim ? this.prim.name : null;
      let finite = false;
      for (let e = 0; e < 2; e++) {
        let r;
        if (running) r = this.runners.find((q) => q.goal === e) || this._atRisk(e);
        else r = e === 1 ? (A.z < 10 ? A : B.z < 10 ? B : A) : (B.z >= 10 ? B : A.z >= 10 ? A : B);
        const tBat = this._tBat(r, e);
        const tBall = this._tBall(e, from);
        if (tBall < Infinity) finite = true;
        const margin = tBall - tBat;
        F.ends.push({ end: e, runner: r ? r.key : null, tBat, tBall, margin: margin === margin ? margin : Infinity });
      }
      if (!finite && F.basis === 'plan') F.basis = 'none';
      return F;
    }
    // The tighter end (less a bit at the keeper's end: that's where they get run out)
    _dangerMargin(F) {
      const A0 = cfg().A;
      const e = F.ends[0].margin <= F.ends[1].margin ? 0 : 1;
      return F.ends[e].margin - (e === 0 ? A0.strikerEnd : 0);
    }
    // Another run after this one: the ball against each batter turning for it
    _nextLegMargin(F) {
      const R = cfg().R;
      let m = Infinity;
      for (const r of this.runners) {
        if (r.goal == null || r.st === 'out') continue;
        const e = 1 - r.goal;
        const tBat = this._turnTimeLeft(r) + R.turnPause + tCover(LEG - R.stretch, R.vmax, R.accel);
        m = Math.min(m, F.ends[e].tBall - tBat);
      }
      return m;
    }

    // The partner's call: a pure judgement on the forecast, no noise (FS-12)
    advice() {
      if (!this.live || this.result || this.control === 'none' || this.tLive < 0.35) return null;
      const F = this.forecast();
      const mMin = this._dangerMargin(F);
      if (!F.running) {
        if (mMin > 0.45) return 'YES';
        if (mMin > -0.1 && this.tLive < 1.2 && F.basis === 'plan') return 'WAIT';
        return 'NO';
      }
      if (this.want !== this.runsRun + 1) return null;
      const lead = this._leadRunner();
      if (!lead || Math.abs(lead.z - 10) >= 4) return null;
      return this._nextLegMargin(F) > 0.5 ? 'TWO' : null;
    }
    // The one further through his run
    _leadRunner() {
      let best = null, bf = -1;
      for (const r of this.runners) {
        if (r.goal == null) continue;
        const f = this._legFrac(r);
        if (f > bf) { bf = f; best = r; }
      }
      return best;
    }
    // How far through the current run (0 at the start .. 1 bat over the line)
    _legFrac(r) {
      const R = cfg().R;
      if (r.goal == null) return 1;
      const left = Math.max(0, (CREASE[r.goal] - r.z) * DIRZ[r.goal] - R.stretch);
      return M.clamp(1 - left / (LEG - R.stretch), 0, 1);
    }

    // Nothing left but the ball coming back: the session may run the clock faster (FS-13)
    canFastForward() {
      const K = (CLLM.CFG && CLLM.CFG.MATCH) || {};
      if (!this.live || this.result || this.tLive <= (K.FF_AFTER != null ? K.FF_AFTER : 1.5)) return false;
      if (this.runners.some((r) => r.goal != null)) return false;
      const b = this.ball;
      if (!(b && (b.mode === 'held' || (this.thrown && !this.throwHard)))) return false;
      return !this.fielders.some((f) => f.breakAt != null);
    }

    // ---- throws -----------------------------------------------------------------------
    // Legacy (v0 HUD): run-out chances, fielder-positive (margin > 0: the ball
    // would beat the batter). Built on forecast(), which is the source of truth.
    _runOutChance() {
      const F = this.forecast();
      const res = [];
      for (const E of F.ends) {
        if (!E.runner) continue;
        const r = this.runners.find((q) => q.key === E.runner);
        if (!r || r.st === 'out' || E.tBat <= 0) continue;
        const recv = this._receiver(E.end);
        const src = this.holder || this.throwFromF;
        const d = src ? hd(src.pos, STUMPS[E.end]) : 99;
        res.push({ end: E.end, runner: r, margin: -E.margin, direct: src ? this._directOK(src, E.end, d) : false, d, recv });
      }
      res.sort((a, b) => b.margin - a.margin);
      return res;
    }

    _decideThrow(f) {
      const F = this.forecast(f);
      const run = this.runners.some((r) => r.goal != null);
      let end, hard, direct = false;
      f.carryTo = null;
      // the keeper or bowler with nobody running: it's settled in his hands (Law 20.1.2)
      if (!run && (f.role === 'keeper' || f.role === 'bowler')) { f.st = 'hold'; f.stT = 99; return; }
      // the keeper / bowler (or anyone within a few metres of a set of stumps)
      // doesn't throw to himself: he runs it in to his stumps, unless
      // there's a clear chance at the other end
      const d0 = hd(f.pos, STUMPS[0]), d1 = hd(f.pos, STUMPS[1]);
      const ownEnd = f.role === 'keeper' && d0 < 20 ? 0 : f.role === 'bowler' && d1 < 12 ? 1 : d0 < 6 ? 0 : d1 < 6 ? 1 : null;
      if (ownEnd != null && (ownEnd ? d1 : d0) > 2.2) {
        if (!(run && F.ends[1 - ownEnd].margin < -0.25)) { f.st = 'hold'; f.stT = 99; f.carryTo = ownEnd; return; }
      }
      // already at a set of stumps: hang on to it there (and take the bails
      // off if a batter's short), unless there's a clear chance at the other end
      for (let e = 0; e < 2; e++) {
        if ((e ? d1 : d0) > 2.2) continue;
        const here = this._atRisk(e);
        const short = here && here.st !== 'out' && !this._inGround(here, e);
        if (short || !(run && F.ends[1 - e].margin < -0.25)) { f.st = 'hold'; f.stT = 99; return; }
      }
      const best = F.ends[0].margin <= F.ends[1].margin ? F.ends[0] : F.ends[1];
      if (run && best.margin < 0.35) {
        // a run-out chance: hard, at the end it's on (a shy if he's close enough)
        end = best.end; hard = true;
        direct = this._directOK(f, end, end ? d1 : d0);
      } else {
        // nothing on: return it to the keeper (or the bowler, if it's much closer to that end)
        end = d0 <= d1 + 8 ? 0 : 1;
        hard = run;
      }
      // the keeper out chasing, with nobody back at his stumps: to the bowler's end, or he runs it in himself
      if (f.role === 'keeper' && end === 0 && !this._receiver(0)) {
        if (!this._receiver(1)) { f.st = 'hold'; f.stT = 99; f.carryTo = 0; return; }
        end = 1; direct = false;
      }
      f.st = 'throw'; f.u = 0; f.released = false;
      f.throwAt = { end, hard, direct };
      f.face = norm2({ x: 0 - f.pos.x, z: END_Z[end] + (end ? 0.6 : -0.6) - f.pos.z });
    }

    _release(f) {
      const C = cfg().F, b = this.ball, T = f.throwAt;
      f.released = true;
      f.holding = false; this.holder = null;
      const from = f.fig && f.fig.J ? V.copy(f.fig.J.rHand) : V.v(f.pos.x, 1.9, f.pos.z);
      const recv = this._receiver(T.end);
      let tgt;
      if (T.direct || !recv) tgt = V.v(0, 0.36, END_Z[T.end]);
      else if (!T.hard) {
        // nothing on: lob it to him, where he'll be (he's still walking to the stumps)
        const pt = recv.pt || recv.pos, tf = hd(from, recv.pos) / C.lobV;
        let p = { x: recv.pos.x + recv.vel.x * tf, z: recv.pos.z + recv.vel.z * tf };
        if (hd(p, recv.pos) > hd(pt, recv.pos)) p = pt;
        tgt = V.v(p.x, 0.95, p.z);
      } else tgt = V.v(recv.pt ? recv.pt.x : 0, 0.95, recv.pt ? recv.pt.z : END_Z[T.end]);
      const far = hd(from, tgt);
      // from the deep: flat, landing a few metres short, on one bounce into the gloves
      let aim = tgt;
      if (far > 38 && !T.direct && recv) {
        const u = norm2({ x: tgt.x - from.x, z: tgt.z - from.z });
        aim = V.v(tgt.x - u.x * 5, 0.05, tgt.z - u.z * 5);
      }
      // flat and hard close in, longer ones harder still (70-75% of max for accuracy)
      const speed = T.hard ? this._spd(far) : C.lobV;
      let vel = solveThrow(from, aim, speed, b.open);
      // accuracy: about 2% of the distance either way, on both axes (x1.5 on the run)
      const sd = C.aimSD * (1.25 - 0.5 * this.skill) * (T.hard ? 1 : 0.6) * (f.vel && Math.hypot(f.vel.x, f.vel.z) > 3 ? 1.5 : 1);
      vel = V.rotY(vel, M.gauss() * sd);
      const hs = Math.hypot(vel.x, vel.z), el = Math.atan2(vel.y, hs) + M.gauss() * sd * 0.8, spd = V.len(vel);
      vel = V.v((vel.x / hs) * spd * Math.cos(el), spd * Math.sin(el), (vel.z / hs) * spd * Math.cos(el));
      b.free(from, vel, 0);
      b.landed = false;
      this.thrown = true; this.throwFrom = f.name; this.throwFromF = f; this.throwEnd = T.end; this.throwHard = !!T.hard;
      this.throwDirect = !!(T.direct || !recv);
      this.runsAtThrow = this.runsRun; this.crossedAtThrow = this._crossed();
      this.throwTgt = { x: tgt.x, z: tgt.z };
      this.throwDir = norm2({ x: tgt.x - from.x, z: tgt.z - from.z });
      this.lastTouch = f.role; this.defl = null;
      // d and ang (0 = straight down the pitch, 90 = side-on) are for the bots
      const ang = Math.abs(M.deg(Math.atan2(Math.abs(this.throwDir.x), Math.abs(this.throwDir.z))));
      this.events.push({ type: 'throw', fielder: f.name, end: T.end, direct: T.direct, hard: T.hard, d: far, ang });
      // the receiver stays at the stumps; anyone "backing up" who isn't
      // actually behind the target goes back to his mark
      if (recv) { recv.job = 'stumps'; recv.pt = this._stumpsSpot(T.end); }
      for (const g of this.fielders) {
        if (g === f || g === recv || g.job !== 'backup') continue;
        const behind = (g.pos.x - tgt.x) * this.throwDir.x + (g.pos.z - tgt.z) * this.throwDir.z;
        if (behind < 2) { g.job = 'return'; g.pt = g.home; }
      }
      // someone backs up the throw (the nearest free man behind the stumps)
      const behindPt = inRope({ x: tgt.x + this.throwDir.x * 12, z: tgt.z + this.throwDir.z * 12 }, 0.99);
      let bu = null, bd = Infinity;
      for (const g of this.fielders) {
        if (g === f || g === recv || g.holding || g.role === 'keeper') continue;
        const d = hd(g.pos, behindPt);
        if (d < bd && d < 30) { bd = d; bu = g; }
      }
      if (bu) { bu.job = 'backup'; bu.pt = behindPt; }
    }

    _receiver(e) {
      let best = null, bd = Infinity;
      for (const f of this.fielders) {
        if (f.job !== 'stumps' || f.holding) continue;
        const d = Math.abs((f.pt ? f.pt.z : f.pos.z) - END_Z[e]);
        if (d < 4 && hd(f.pos, this._stumpsSpot(e)) < bd) { bd = hd(f.pos, this._stumpsSpot(e)); best = f; }
      }
      return best;
    }
    _stumpsSpot(e) { return e === 0 ? { x: 0.05 * (this.h || 1), z: -0.7 } : { x: -0.3, z: 20.9 }; }

    // Holding the ball within reach of the stumps: break them if a runner is short
    // (already broken: he pulls a stump out of the ground with the ball in hand, Law 29.2)
    _atStumps(f, justGot) {
      const C = cfg().F;
      for (let e = 0; e < 2; e++) {
        if (hd(f.pos, STUMPS[e]) > 1.8) continue;
        const r = this._atRisk(e);
        if (!r || r.st === 'out' || this._inGround(r, e)) { f.breakAt = null; continue; }   // he's in: nothing on
        // take the bails off (a beat to do it)
        if (f.breakAt == null) f.breakAt = this.tLive + (justGot ? C.breakT : C.breakT * 0.6);
        if (this.tLive >= f.breakAt) {
          f.breakAt = null;
          if (this.fx[e]) this.fx[e].lean[1] = Math.max(this.fx[e].lean[1], 0.9);
          else this.fx[e] = stumpsFx(END_Z[e], 0, 0.5);
          this.events.push({ type: 'stumps', end: e, direct: false, by: f.name });
          this._runOutCheck(e, f.name);
          return;
        }
      }
    }

    // ---- runners ------------------------------------------------------------------------
    // The batter whose ground end e is: the one nearer to it
    _atRisk(e) {
      const [A, B] = this.runners;
      if (!A || !B) return null;
      const dA = Math.abs(A.z - END_Z[e]), dB = Math.abs(B.z - END_Z[e]);
      return dA <= dB ? A : B;
    }
    // The bat's tip: stretched out (or carried), plus the dive
    _tip(r) {
      const R = cfg().R;
      const dir = r.goal != null ? DIRZ[r.goal] : (r.z < 10 ? -1 : 1);
      let t = r.z + dir * (r.stretch > 0.5 ? R.stretch : R.carry);
      if (r.dive) t += dir * R.diveReach * M.easeOut(Math.min(1, r.dive.t / R.diveT));
      return t;
    }
    _inGround(r, e) {
      const tip = this._tip(r);
      return e === 0 ? Math.min(tip, r.z) <= CREASE[0] : Math.max(tip, r.z) >= CREASE[1];
    }
    // Seconds until r (running toward e) makes his ground there
    _runnerETA(r, e) {
      if (this._inGround(r, e)) return 0;
      const R = cfg().R;
      const dist = Math.max(0, (CREASE[e] - r.z) * DIRZ[e] - R.stretch);
      const v = r.v * DIRZ[e];
      if (r.dive) {
        // sliding in: does the slide (and the reach) get him there?
        const reachLeft = R.diveReach * (1 - M.easeOut(Math.min(1, r.dive.t / R.diveT)));
        const need = Math.max(0, dist - reachLeft), vs = Math.max(0, v);
        if (need <= 0) return Math.max(0, R.diveT - r.dive.t);
        if ((vs * vs) / (2 * R.diveDecel) >= need) return (vs - Math.sqrt(Math.max(0, vs * vs - 2 * R.diveDecel * need))) / R.diveDecel;
        return vs / R.diveDecel + R.diveDown + tCover(need - (vs * vs) / (2 * R.diveDecel), R.vmax, R.accel);
      }
      return this._startWait(r) + Math.max(0, r.pause || 0) + tCoverV(dist, v, R.vmax, R.accel, R.decel);
    }

    _runnersStep(dt) {
      const R = cfg().R;
      for (const r of this.runners) {
        if (r.st === 'out') { r.v *= Math.max(0, 1 - 3 * dt); r.z += r.v * dt; continue; }
        if (r.key === 'A' && r.startIn > 0) { r.startIn -= dt; if (r.goal == null) continue; if (r.startIn > 0) continue; }
        if (r.dive && r.dive.t < 90) {
          // diving for the line: slide on, never turn; down for a moment once he's in
          const e = r.goal != null ? r.goal : (r.z < 10 ? 0 : 1), dz = DIRZ[e];
          const was = this._inGround(r, e);
          r.dive.t += dt;
          const sp = Math.max(0, r.v * dz - R.diveDecel * dt);
          r.v = sp * dz;
          r.z += r.v * dt;
          r.stretch = 1;
          if (r.goal != null && !was && this._inGround(r, e)) this._grounded(r, e);
          if (sp <= 0) {
            r.dive.down += dt;
            if (this._inGround(r, e)) { if (r.goal != null) { r.goal = null; r.st = 'crease'; r.legDone = false; r.sentBack = false; } }
            else if (r.dive.down >= R.diveDown) { r.dive = null; }       // short of it: up, and scramble on
            if (r.dive && r.dive.down >= R.diveDown) r.dive.t = 99;      // up again (the bat's where it fell)
          }
          continue;
        }
        if (r.goal == null) {
          // settle into the crease (the non-striker, backing up, first comes
          // to a stop where he is: ready to go if it's called)
          if (r.dive) continue;                   // on the ground after a dive
          const home = r.z < 10 ? 0.55 : 19.6;
          const hold = r.key === 'B' && this.tLive < 1.3 && !r.stood;
          const want = hold ? 0 : M.clamp((home - r.z) * 2, -1.5, 1.5);
          r.v += M.clamp(want - r.v, -6 * dt, 6 * dt);
          r.z += r.v * dt;
          r.stretch = 0;
          continue;
        }
        r.stood = true;
        const e = r.goal, dz = DIRZ[e];
        // turn at this end if more runs are called than this leg completes
        const legNo = r.legDone ? r.legs : r.legs + 1;
        const turning = !r.sentBack && !r.dived && this.want > legNo;
        const stopZ = CREASE[e] + dz * (turning ? -0.35 : 0.8);
        const dist = (stopZ - r.z) * dz;
        const vAllow = Math.sqrt(2 * R.decel * Math.max(0, dist));
        const want = Math.min(R.vmax, vAllow) * dz;
        const dv = want - r.v;
        const lim = (Math.sign(dv) === Math.sign(r.v) || r.v === 0 ? R.accel : R.decel) * dt;
        r.v += M.clamp(dv, -lim, lim);
        if (r.pause > 0) { r.pause -= dt; r.v = 0; }
        const tipBefore = this._inGround(r, e);
        r.z += r.v * dt;
        const near = Math.abs(CREASE[e] - r.z) < R.stretchNear && Math.sign(CREASE[e] - r.z) === dz;
        const sliding = this.slideManual && this.control === 'player' ? !!this.slideHeld : near;
        if (this.slideManual && this.control === 'player' && this.slideHeld) r.v *= Math.pow(R.slideCost, dt * 4);
        r.stretch = M.clamp(r.stretch + (sliding ? 5 : -4) * dt, 0, 1);
        if (!tipBefore && this._inGround(r, e)) this._grounded(r, e);
        // arrived at the far end of this leg
        if (dist < 0.05 && Math.abs(r.v) < 0.6) {
          r.legDone = false;
          if (r.sentBack) { r.sentBack = false; r.goal = null; r.st = 'crease'; }
          else if (turning) { r.goal = 1 - e; r.pause = R.turnPause; }
          else { r.goal = null; r.st = 'crease'; }
        }
      }
      // a run counts when both have made their ground
      const [A, B] = this.runners;
      const runs = Math.min(A.legs, B.legs);
      if (runs > this.runsRun) {
        this.runsRun = runs;
        this.events.push({ type: 'run', n: runs });
      }
      // both stopped: nothing's left on the calls (so the next 'run' starts afresh)
      if (A.goal == null && B.goal == null && this.want > this.runsRun) this.want = this.runsRun;
    }

    // r has just got his bat down over the line at end e
    _grounded(r, e) {
      if (!r.sentBack && !r.legDone) { r.legDone = true; r.legs++; }
      r.groundAt = this.tLive; r.groundEnd = e;
      // a close one? (the ball on its way to this end, or in hand at it)
      const h = this.holder;
      if ((this.thrown && this.throwEnd === e) || (h && this.ball.mode === 'held' && hd(h.pos, STUMPS[e]) <= 2.2)) {
        this._closeCall({ end: e, s: this._tBall(e), cm: null, runner: r.key, out: false });
      }
    }
    // Keep the closest call of the ball (a dismissal always wins)
    _closeCall(c) {
      if (!(c.s === c.s) || Math.abs(c.s) === Infinity) return;
      const k = this.closest;
      if (k && k.out && !c.out) return;
      if (!k || c.out || Math.abs(c.s) <= Math.abs(k.s) || (k.end === c.end && k.runner === c.runner && c.cm != null)) this.closest = c;
    }

    // The AI batters (FS-15): the striker calls in front of square, the
    // non-striker behind it (a bit less sure). They take the easy ones, never
    // set off once a fielder close by has it, send each other back if it's on,
    // and look for a second halfway down. All judged on forecast().
    _aiRunning(h) {
      if (this.control !== 'ai' || this.playerCalled || this.result) return;
      const A0 = cfg().A;
      const [A, B] = this.runners;
      if (A.sentBack || B.sentBack || A.dived || B.dived) return;
      const ai = this.ai;
      if (this.tLive < A0.look + A0.lookSkill * (1 - ai.skill)) return;
      if (this.aiNoise == null) {
        this.aiCaller = this.shotBearing > 100 ? 'B' : 'A';
        this.aiNoise = M.gauss() * A0.noise * (1.2 - ai.skill) * (this.aiCaller === 'B' ? A0.behindK : 1);
      }
      const need = A0.base - A0.aggK * ai.aggression - A0.skillK * ai.skill + this.aiNoise;
      const running = A.goal != null || B.goal != null;
      const heldClose = this._heldClose();
      if (!running) {
        // decide once (again only on news: a misfield or an overthrow)
        if (this.aiDecided && this.misfield === this.aiSeen) return;
        if (heldClose || this.thrown) return;
        this.aiDecided = true; this.aiSeen = this.misfield;
        const m = this._dangerMargin(this.forecast());
        if (m > A0.easy || m > need) this.call('run', 'ai');       // the easy single is always taken
        return;
      }
      // running: every recheck, is it still on? Another in it?
      this.aiT = (this.aiT || 0) + h;
      if (this.aiT < A0.recheck - 1e-9) return;
      this.aiT = 0;
      if (this.want !== this.runsRun + 1) return;
      const F = this.forecast();
      const e = F.ends[0].margin <= F.ends[1].margin ? 0 : 1;
      const r = this.runners.find((q) => q.goal === e);
      if (r && F.ends[e].margin < A0.sendBack && this._legFrac(r) < A0.sendBackFrac) { this.call('back', 'ai'); return; }
      const lead = this._leadRunner();
      if (this.aiLeg !== this.runsRun && lead && Math.abs(lead.z - 10) < 3 && !heldClose) {
        this.aiLeg = this.runsRun;
        if (this._nextLegMargin(F) > need) this.call('run', 'ai');
      }
    }
    // In a fielder's hands within heldClose of either set of stumps
    _heldClose() {
      const A0 = cfg().A, b = this.ball, f = this.holder;
      return !!(b && b.mode === 'held' && f && Math.min(hd(f.pos, STUMPS[0]), hd(f.pos, STUMPS[1])) < A0.heldClose);
    }

    // Legacy (v0 partner call): when could the ball be back at the stumps?
    _ballBackIn() {
      const F = this.forecast();
      return Math.min(F.ends[0].tBall, F.ends[1].tBall);
    }
    _legTime(fromRest) {
      const R = cfg().R;
      const d = LEG - R.stretch + (fromRest ? 0.3 : 0.6);
      return tCover(d, R.vmax, R.accel) + (fromRest ? 0.3 : R.turnPause + 0.35);
    }
    _legTimeLeft(r) {
      const R = cfg().R;
      const e = r.goal == null ? 0 : r.goal;
      return Math.max(0, (CREASE[e] - r.z) * DIRZ[e] - R.stretch) / Math.max(3, Math.abs(r.v));
    }

    // ---- verdicts ------------------------------------------------------------------------
    _runOutCheck(e, by) {
      const r = this._atRisk(e);
      if (!r || r.st === 'out') return;
      const tip = this._tip(r), reach = e === 0 ? Math.min(tip, r.z) : Math.max(tip, r.z);
      const over = (CREASE[e] - reach) * (e === 0 ? 1 : -1);        // + = grounded past the line
      this.lastMargin = { end: e, cm: Math.round(over * 100), runner: r.key };
      const safe = this._inGround(r, e);
      // how close: time since he got in (+), or still needed (-)
      if (safe) {
        if (r.groundAt != null && r.groundEnd === e) this._closeCall({ end: e, s: this.tLive - r.groundAt, cm: this.lastMargin.cm, runner: r.key, out: false });
      } else {
        const need = r.goal === e ? this._runnerETA(r, e) : Math.max(0, -over) / cfg().R.vmax + 0.3;
        this._closeCall({ end: e, s: -need, cm: this.lastMargin.cm, runner: r.key, out: true });
      }
      if (safe) {
        this.events.push({ type: 'safe', end: e, runner: r.key, by });
        return;
      }
      r.st = 'out';
      // past the bat, the striker out of his ground and not trying a run, and only the keeper has had it: stumped (Law 39)
      const st = e === 0 && r.key === 'A' && !this.hit && this.keeperOnly && !this.runCalled && this.runsRun === 0;
      const how = st ? 'stumped' : 'run out', kp = st && this.fielders.find((f) => f.role === 'keeper');
      if (kp) by = kp.name;
      this.events.push({ type: 'runout', end: e, runner: r.key, by, how });
      this._finish({ out: { how, fielder: by, runner: r.key, end: e } });
    }

    // Dead: in hand at a set of stumps (or settled with the keeper or bowler,
    // Law 20.1.2) and nobody running for 0.5 s; else, with nobody running and
    // the ball held or stopped, after 3.2 s all told. Never earlier.
    _deadCheck(dt) {
      const b = this.ball;
      if (this.runners.some((r) => r.goal != null)) { this.deadHold = 0; this.deadAcc = 0; return; }
      const f = b.mode === 'held' ? this.holder : null;
      const near = f && (hd(f.pos, STUMPS[0]) < 3.5 || hd(f.pos, STUMPS[1]) < 3.5);
      const gloves = f && (f.role === 'keeper' || f.role === 'bowler');
      if (f && (near || gloves) && f.breakAt == null) {
        this.deadHold = (this.deadHold || 0) + dt;
        if (this.deadHold > 0.5) { this._dead('settled'); return; }
      } else this.deadHold = 0;
      if ((f || b.mode === 'dead') && this.tLive > 2.5) {
        this.deadAcc = (this.deadAcc || 0) + dt * 0.5;
        if (this.deadAcc >= 1.6) this._dead('settled');
      }
    }

    _dead(why) { this._finish({ why }); }

    // Have the batters crossed on the run in progress? (Not on one they've given up on: Law 19.8.)
    // A (the striker) runs to end 1 on the 1st, 3rd... run of the ball.
    _crossed() {
      const [A, B] = this.runners;
      if (!A || !B || this.want <= this.runsRun || !this.runners.some((r) => r.goal != null && !r.sentBack)) return false;
      return this.runsRun % 2 === 0 ? A.z > B.z : A.z < B.z;
    }

    _finish(o) {
      if (this.result) return;
      const [A, B] = this.runners;
      let runs = this.runsRun, boundary = 0, swapped = A.z >= 10;
      const ends = { A: A.z < 10 ? 0 : 1, B: B.z < 10 ? 0 : 1 };
      if (o.boundary && o.overthrow) {
        // Law 19.8: the allowance + runs completed + the one in progress if crossed when it was thrown
        runs = o.boundary + (this.runsAtThrow || 0) + (this.crossedAtThrow ? 1 : 0);
        swapped = ((this.runsAtThrow || 0) + (this.crossedAtThrow ? 1 : 0)) % 2 === 1;
      } else if (o.boundary) {
        // Law 19.7: the allowance, or the runs completed (+ one if crossed) if that's more
        const ran = this.runsRun + (this._crossed() ? 1 : 0);
        if (ran > o.boundary) { runs = ran; swapped = ran % 2 === 1; }
        else { runs = o.boundary; boundary = o.boundary; swapped = false; }
      } else if (o.out && (o.out.how === 'run out' || o.out.how === 'stumped')) {
        // the not-out batter's ground is the other end (Law 30.2); the new man takes the vacated one
        const e = o.out.end;
        if (o.out.runner === 'A') { ends.A = e; ends.B = 1 - e; swapped = ends.B === 0; }
        else { ends.B = e; ends.A = 1 - e; swapped = ends.A === 1; }
      } else if (o.out && o.out.how === 'caught') runs = 0;      // no runs off a catch (Law 33); `ran` keeps the ones completed
      this.result = {
        runs, ran: this.runsRun, boundary, out: o.out || null, overthrow: !!o.overthrow,
        drops: this.drops.slice(), why: o.why || (o.boundary ? 'boundary' : o.out ? o.out.how : ''),
        // which end each batter finished at (for who faces next)
        ends,
        swapped,
        margin: this.lastMargin || null,
        closest: this.closest || null,
        t: this.tLive,
      };
      this.tDead = this.tLive;
    }

    // After the verdict: celebrations, everyone slows down
    _settle(dt) {
      for (const f of this.fielders) {
        if (f === this.caught) { f.st = 'catch'; f.u = Math.min(1, f.u + dt / 0.9); this._stopMoving(f, dt, 5); continue; }
        if (f.st === 'dive') { f.u += dt / 0.95; if (f.u >= 1) { f.st = 'set'; f.dive = null; } }
        this._stopMoving(f, dt, 3);
      }
      for (const r of this.runners) { r.v *= Math.max(0, 1 - 3 * dt); r.z += r.v * dt; r.stretch = Math.max(0, r.stretch - 3 * dt); }
    }

    // Hand the borrowed figures back (between balls)
    endLive() {
      this.live = false;
      const A = this.runners[0];
      if (A && A.fig && A.mirror0 != null) { A.fig.mirror = A.mirror0; A.mirror0 = null; }
      const bw = this.fielders.find((f) => f.role === 'bowler');
      if (bw) { if (bw.mirror0 != null) bw.fig.mirror = bw.mirror0; this.fielders.splice(this.fielders.indexOf(bw), 1); }
      this.holder = null;
    }

    // ---- drawing ---------------------------------------------------------------------------
    // Pose everyone (call once a frame, after update) and list the figures to draw.
    pose(now, opts = {}) {
      const out = [];
      const b = this.ball;
      const look = b && b.mode !== 'hidden' ? V.copy(b.pos) : V.v(0, 1, 10);
      for (const f of this.fielders) {
        if (f.role === 'bowler' && !this.live) continue;          // the bowler is the session's until then
        const sp = Math.hypot(f.vel.x, f.vel.z);
        const d = { at: f.pos, face: f.face || this._faceBat(f.pos), speed: sp, look, holding: f.holding && (f.st === 'throw' || f.st === 'pickup' || f.st === 'hold' || f.st === 'set' || f.st === 'down') };
        if (f.st === 'dive') Object.assign(d, { mode: 'dive', u: f.u, dir: f.dive ? f.dive.dir : f.face, reach: f.dive ? f.dive.reach : 1.5, hands: f.hands });
        else if (f.st === 'catch') Object.assign(d, { mode: 'catch', u: f.u, hands: f.hands || look });
        else if (f.st === 'pickup' || f.st === 'down') Object.assign(d, { mode: 'pickup', u: M.clamp(f.u, 0, 1), hands: f.hands });
        else if (f.st === 'throw') Object.assign(d, { mode: 'throw', u: f.u });
        else if (f.role === 'keeper' && !this.live) Object.assign(d, { mode: 'keeper', rise: opts.keeperRise || 0, hands: opts.keeperHands || null });
        else if (sp > 0.6) Object.assign(d, { mode: 'run' });
        else if (f.role === 'keeper' || f.holding) Object.assign(d, { mode: this.live ? 'stand' : 'keeper', rise: 1 });
        else Object.assign(d, { mode: this.live ? 'ready' : (opts.set ? 'ready' : 'stand'), crouch: f.role === 'close' ? 1 : 0.35 });
        f.anim.pose(now, d);
        out.push(f.fig);
      }
      // runners (A only while live: before that the striker is the session's)
      for (const r of this.runners) {
        if (!r.fig || (r.key === 'A' && !this.live)) continue;
        if (!r.anim || r.anim.fig !== r.fig) r.anim = new FielderAnim(r.fig);
        const face = r.goal != null ? { x: 0, z: DIRZ[r.goal] } : { x: 0, z: r.z < 10 ? 1 : -1 };
        const x = r.key === 'A' ? M.lerp(r.x, 0.9 * (this.nsX || 1) * -1, M.clamp(Math.abs(r.z - 0.9) / 3, 0, 1)) : r.x;
        r.anim.pose(now, { at: { x, z: r.z }, face, speed: Math.abs(r.v), mode: 'batrun', ground: r.dive ? 1 : r.stretch, dive: r.dive ? Math.min(1, r.dive.t / 0.35) : 0, look });
        r.fig.alpha = 1; r.fig.partAlpha = null; r.fig.hideBat = false;
        out.push(r.fig);
      }
      for (const u of this.umpires) {
        u.anim.pose(now, { at: u.at, face: u.face, speed: 0, mode: 'umpire', crouch: opts.set ? 1 : 0, look });
        out.push(u.fig);
      }
      return out;
    }

    stumpsState() { return this.fx; }
  }

  // Launch velocity to throw from `from` to `to` at about `speed` (flat as
  // it'll go), corrected for drag with a couple of test flights.
  let flightBall = null;
  function solveThrow(from, to, speed, open) {
    const g = 9.81;
    const dx = to.x - from.x, dz = to.z - from.z, dh = to.y - from.y;
    const d = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / d, uz = dz / d;
    const STEP = cfg().STEP;
    const flight = (ang, sp) => {
      // test flight with the real integrator, on the live step: height (interpolated) when it has covered d
      const s = flightBall || (flightBall = new Ball());
      s.open = open || { rollDecel: 2, rollLin: 0, bounceK: 0.4, keep: 0.8 }; s.onEvent = null; s.trail = [];
      s.free(from, V.v(ux * sp * Math.cos(ang), sp * Math.sin(ang), uz * sp * Math.cos(ang)), 0);
      let t = 0, py = from.y, pc = 0;
      while (t < 6) {
        s.update(STEP); t += STEP;
        const cov = (s.pos.x - from.x) * ux + (s.pos.z - from.z) * uz;
        // landed short: "below the ground" by how short (keeps this monotonic in the angle)
        if (s.landed && cov < d) return -0.2 * (d - cov);
        if (cov >= d) return py + (s.pos.y - py) * ((d - pc) / Math.max(1e-6, cov - pc));
        py = s.pos.y; pc = cov;
      }
      return -0.2 * d;
    };
    // flattest angle that gets there (no-drag guess over the drag-stretched
    // distance), then bracket and regula falsi on the real flight
    const v2 = speed * speed, dEff = (Math.exp(0.0045 * d) - 1) / 0.0045;
    const disc = v2 * v2 - g * (g * dEff * dEff + 2 * dh * v2);
    let ang = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * dEff)) : Math.PI / 4;
    const sp = disc > 0 ? speed : Math.min(speed * 1.1, Math.sqrt(g * d) * 1.15);
    let lo = null, hi = null;
    for (let i = 0; i < 8; i++) {
      const err = to.y - flight(ang, sp);
      if (Math.abs(err) < 0.04) break;
      if (err > 0) lo = { a: ang, e: err }; else hi = { a: ang, e: err };
      ang = lo && hi ? lo.a + ((hi.a - lo.a) * lo.e) / (lo.e - hi.e) : ang + M.clamp((2 * err) / d, -0.15, 0.15) + (err > 0 ? 0.01 : -0.01);
      ang = M.clamp(ang, -0.2, 0.8);
    }
    return V.v(ux * sp * Math.cos(ang), sp * Math.sin(ang), uz * sp * Math.cos(ang));
  }

  // Does the path prev->cur hit the stumps at zEnd? (a thin box: the three
  // stumps side by side, 0.23 m wide, a few cm deep, 0.71 m tall; ball radius added)
  function hitStumps(a, b, zEnd) {
    const hx = PT.STUMPS_HALF_W + PT.BALL_R, hz = 0.02 + PT.BALL_R, hy = PT.STUMP_H + PT.BALL_R;
    // slab clipping in x and z
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const [p, d, lo, hi] of [[a.x, dx, -hx, hx], [a.z, dz, zEnd - hz, zEnd + hz]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
      let u0 = (lo - p) / d, u1 = (hi - p) / d;
      if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) return null;
    }
    const y = a.y + (b.y - a.y) * t0;
    if (y > hy) return null;
    return { x: a.x + dx * t0, y, t: t0 };
  }

  // Distance from point c to segment ab (3D)
  function distSeg(c, a, b) {
    const ab = V.sub(b, a), ac = V.sub(c, a);
    const l2 = V.dot(ab, ab);
    const t = l2 > 1e-9 ? M.clamp(V.dot(ac, ab) / l2, 0, 1) : 0;
    return V.len(V.sub(ac, V.mul(ab, t)));
  }
  function norm2(f) { const l = Math.hypot(f.x, f.z) || 1; return { x: f.x / l, z: f.z / l }; }

  FieldSim.solveThrow = solveThrow;
  FieldSim.tCover = tCover;
  FieldSim.tCoverV = tCoverV;
  FieldSim.stumpsFx = stumpsFx;
  FieldSim.DEF = DEF;
  FieldSim.END_Z = END_Z;
  FieldSim.CREASE = CREASE;
  FieldSim.cfg = recfg;
  CLLM.FieldSim = FieldSim;
})();
