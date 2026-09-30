/*
 * SIM (dev only — not loaded by index.html)
 * =========================================
 * Monte Carlo batting bot for tuning. Load in the console:
 *   await import('./js/sim.js?x=' + Date.now()); CLLM.simBat({ diff:'grade', bowler:'pace', sigma:55, bias:-15, choice:0.6, balls:3000 })
 */
(function () {
  const CLLM = window.CLLM;
  const { M, CFG, BallPhys } = CLLM;

  function mockGame() {
    const noop = () => {};
    return {
      clock: 0, slowmo: 1, cam: new CLLM.Camera(),
      save: { data: { settings: { calib: 0 }, stats: { batBalls: 999, batRuns: 0, batOuts: 0, fours: 0, sixes: 0 } }, best: () => ({ runs: 1e9 }), setBest: noop, write: noop },
      ui: { toast: noop, bowlerInfo: noop, ballResult: noop, score: noop, newInnings: noop, fieldShot: noop },
      input: { touch: false }, hitStop: noop,
    };
  }

  // What would a batter who reads this ball correctly do?
  function idealChoice(s, plan) {
    const spin = s.spin;
    const L = plan.lengthM;
    const band = s.b.band;
    const plane = CFG.BAT.PLANES;
    const tsim = BallPhys.timeAtZ(plan, 1.4);
    const p = BallPhys.posAt(plan, tsim);
    const off = p.x * -s.h;
    const st = s._stumpsCheck();
    let foot, aim, kind;
    const full = band === 'toss' || band === 'yorker' || band === 'full';
    const short = band === 'short' || band === 'bouncer';
    if (full) {
      foot = 'front';
      aim = off > 0.2 ? 45 : off < -0.1 ? -45 : 0;
      kind = 'hit';
      if (spin && off < 0.15 && Math.random() < 0.3) { aim = -100; }
    } else if (short) {
      foot = 'back';
      if (plan.lengthName === 'bouncer' && p.y > 1.4) { kind = 'leave'; aim = 0; }
      else { aim = off > 0.25 ? 100 : -60; kind = 'hit'; }
    } else {
      // good length: defend if straight, leave if wide
      foot = spin ? 'front' : (L > 7 ? 'back' : 'front');
      if (!st.hit && off > 0.18) { kind = 'leave'; aim = 0; }
      else { kind = Math.random() < 0.55 ? 'defend' : 'hit'; aim = off > 0.15 ? 40 : 0; }
    }
    return { foot, aim, kind };
  }

  CLLM.simBat = function (opt) {
    const o = Object.assign({ diff: 'grade', bowler: 'pace', hand: 'R', sigma: 55, bias: -15, choice: 0.6, balls: 2000, loft: 0.08, gapSkill: 0.3 }, opt || {});
    const g = mockGame();
    const s = new CLLM.BattingSession(g, { diff: o.diff, bowler: o.bowler, hand: o.hand });
    s.ui = g.ui;
    const out = { balls: 0, outs: 0, runs: 0, fours: 0, sixes: 0, how: {}, cls: [0, 0, 0, 0], leaves: 0, innings: [] };
    let inn = 0, innBalls = 0;
    for (let n = 0; n < o.balls; n++) {
      g.clock += 5;
      s._newBall(0);
      s.b.tRelease = g.clock;
      s._release();
      s.b.phase = 'flight';
      const plan = s.b.plan;
      let ch = idealChoice(s, plan);
      // Misread: wrong foot / shot some of the time
      if (Math.random() > o.choice) {
        const r = Math.random();
        if (r < 0.45) ch.foot = ch.foot === 'front' ? 'back' : 'front';
        else if (r < 0.7) ch.foot = null;
        else if (ch.kind === 'leave') ch.kind = 'hit';
        else if (ch.kind === 'defend') ch.kind = 'hit';
        else ch.aim += (Math.random() < 0.5 ? -1 : 1) * 70;
      }
      // Commit timing: somewhere after the length is readable
      const tRead = s.b.tRelease + s.b.flight * M.rand(0.28, 0.55);
      if (ch.foot) s._commit(ch.foot, tRead);
      // gap seeking: nudge aim toward a gap sometimes
      s.aimPhi = M.wrapAng(M.rad(ch.aim + M.gauss() * 12) * -s.h);
      if (ch.kind === 'leave') {
        s._resolveLeave();
        out.leaves++;
      } else {
        const kind = ch.kind === 'hit' && Math.random() < o.loft ? 'loft' : ch.kind;
        const foot = s.b.foot || 'stance';
        const plane = foot === 'dance' ? CFG.BAT.PLANES.dance : CFG.BAT.PLANES[foot];
        const tPlane = s.tAt(plane);
        const e = (o.bias + M.gauss() * o.sigma) / 1000;
        s._exec(kind, tPlane - CFG.BAT.SWING_LEAD + e);
        if (!s.b.res) { s._resolveLeave(); }
      }
      const r = s.b.res;
      out.balls++; innBalls++;
      if (r.cls != null && r.kind !== 'leave') out.cls[r.cls]++;
      if (r.out) {
        out.outs++; out.how[r.how] = (out.how[r.how] || 0) + 1;
        out.innings.push(inn); inn = 0; innBalls = 0;
        s.ramp = 0;
      } else {
        out.runs += r.runs || 0; inn += r.runs || 0;
        if (r.runs === 4) out.fours++;
        if (r.runs === 6) out.sixes++;
        if (innBalls > 0 && innBalls % CFG.BAT.RAMP_BALLS === 0 && s.ramp < CFG.BAT.RAMP_MAX) s.ramp++;
      }
      s.batAnim.reset();
      s.b.phase = 'done';
    }
    const res = {
      diff: o.diff, bowler: o.bowler, sigma: o.sigma, choice: o.choice,
      ballsPerOut: +(out.balls / Math.max(1, out.outs)).toFixed(1),
      runsPerOut: +(out.runs / Math.max(1, out.outs)).toFixed(1),
      boundaryPct: +((100 * (out.fours + out.sixes)) / out.balls).toFixed(1),
      sr: +((100 * out.runs) / out.balls).toFixed(0),
      how: out.how,
      clsPct: out.cls.map((c) => Math.round((100 * c) / Math.max(1, out.cls.reduce((a, b) => a + b, 0)))),
      leaves: out.leaves,
    };
    return res;
  };
})();
