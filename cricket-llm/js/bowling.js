/*
 * BOWLING SESSION
 * ===============
 * PLAN -> RUN-UP (tap each footfall) -> LOAD (press & hold on the bound)
 * -> RELEASE (let go at the notch) -> the AI batter plays it.
 *
 *   rhythm R (0..1)   : how cleanly you hit your footfalls -> pace, scatter
 *   load timing       : pace: where the front foot lands (no-ball risk / bonus)
 *                       spin: how long you hold = revs
 *   release timing    : early = fuller, late = shorter; the marker sways,
 *                       and where the sway is at release is your line error
 *
 * Batter's score resets each time you get him out. Spell figures are kept.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, CFG, Deliveries, BallPhys, Ball, Figure, BowlerAnim, BatterAnim, Field, World, Audio, AIBatter } = CLLM;
  const B = CFG.BOWL;
  const D2R = Math.PI / 180;

  const LINES = [
    { off: -0.11, name: 'leg stump' }, { off: 0, name: 'middle' }, { off: 0.11, name: 'off stump' },
    { off: 0.23, name: '4th stump' }, { off: 0.34, name: '5th stump' }, { off: 0.45, name: '6th stump' },
  ];

  function lengthLabel(type, y) {
    if (y < 0) return 'FULL TOSS';
    if (type === 'pace') {
      if (y < 1.5) return 'YORKER'; if (y < 4.5) return 'HALF-VOLLEY'; if (y < 6) return 'FULL';
      if (y < 8.5) return 'GOOD'; if (y < 10.5) return 'SHORT'; return 'BOUNCER';
    }
    if (y < 0.8) return 'YORKER'; if (y < 2.5) return 'HALF-VOLLEY'; if (y < 3.2) return 'FULL';
    if (y < 5.5) return 'GOOD'; if (y < 6.8) return 'SHORT'; return 'LONG HOP';
  }

  class BowlingSession {
    constructor(game, opts) {
      this.game = game;
      this.type = opts.type || 'pace';
      this.hand = opts.hand || 'R';                 // the AI batter's hand
      this.h = this.hand === 'L' ? -1 : 1;
      this.diffKey = opts.diff || 'grade';
      this.spin = this.type !== 'pace';
      this.bowler = new Figure('bowler');
      this.bowler.kit = Object.assign({}, Figure.KITS.bowler, { shirt: '#1d4e8f', shirtShade: '#12305a', sleeve: '#1d4e8f', cap: '#0f2240' });
      this.bowlAnim = new BowlerAnim(this.bowler, this.type);
      this.batter = new Figure('batter');
      this.batter.mirror = this.hand === 'L';
      this.batter.setSkin(Math.floor(Math.random() * 5));
      this.batAnim = new BatterAnim(this.batter);
      this.ai = new AIBatter(CFG.AIBAT[this.diffKey].skill, this.hand);
      this.ai.setType(this.type);
      this.ball = new Ball();
      this.ball.onEvent = (ev, p, x) => {
        if (ev === 'bounce') Audio.bounce(this.spin ? 0.5 : 0.9);
        else if (ev === 'net') Audio.net(x);
        else if (ev === 'ground') Audio.bounce(Math.min(1, x / 8));
      };
      this.field = new Field();
      this.field.set(this.type, this.hand);
      this.stumpsFx = null;
      // target (batter-relative)
      this.target = { off: 0.18, len: this.spin ? 4.0 : 7.0 };
      this.varIdx = 0;
      this.flight = 'stock';
      this.groove = 0;
      this.freeHit = false;
      this.lastPitch = null;
      this.pitchMap = [];
      // spell / batter score
      this.batRuns = 0; this.batBalls = 0;
      this.spell = { balls: 0, runs: 0, wkts: 0, dots: 0, fours: 0, sixes: 0, maidens: 0, overRuns: 0, noballs: 0, topSpeed: 0, rSum: 0 };
      this.recent = [];
      this.innings = [];
      this.b = null;
      this._toPlan(0.3);
    }

    get vars() { return Deliveries.VARIATIONS[this.type].slice(0, 5); }

    // ---- phases ---------------------------------------------------------------
    _toPlan(delay) {
      this.field.last = null;
      this.game.ui.shotAnim = null;
      this.ball.reset();
      this.stumpsFx = null;
      this.batAnim.reset();
      this.b = { phase: 'plan', tPlan: this.game.clock + (delay || 0), beats: [], judged: [], taps: [], R: 0 };
      this.bowlAnim.steps = [];
      this.game.ui.setHint('bowl');
    }

    _startRunup(t) {
      const b = this.b;
      const gaps = B.beats[this.type];
      const countIn = 2;
      const startGap = this.spin ? 0.55 : 0.5;
      const times = [];
      let tt = t + 0.35;
      for (let i = 0; i < countIn; i++) { times.push(tt); tt += startGap; }
      for (let i = 0; i < gaps.length; i++) { times.push(tt); if (i < gaps.length - 1) tt += gaps[i] / 1000; }
      // the final judged footfall is the take-off; then the bound -> load beat
      const S = Object.assign({}, BowlerAnim.styleOf(this.type));
      S.bound = B.loadAfterLast[this.type] / 1000;
      const relAfter = B.releaseAfterLoad[this.type] / 1000;
      S.bfcToFfc = relAfter * 0.55;
      S.ffcToRel = relAfter * 0.45;
      const zs = this._runupZs();
      this.bowlAnim.S = S;
      this.bowlAnim.setSteps(times, zs, t);
      b.phase = 'runup';
      b.beats = times;
      b.countIn = countIn;
      b.judged = times.map(() => null);
      b.tLoad = times[times.length - 1] + S.bound;     // press & hold here (the gather)
      b.tRelTarget = b.tLoad + relAfter;               // let go here
      b.loadAt = null; b.relAt = null;
      b.swayPhase = Math.random() * Math.PI * 2;
      b.stray = 0;
      b.spec = this.vars[this.varIdx];
      this.game.ui.setHint('bowl');
    }

    // Footfall positions of the run-up (shorter strides so it all fits in
    // front of the camera). The bowler idles at zs[0] + 0.6 while planning.
    _runupZs() {
      const S = BowlerAnim.styleOf(this.type);
      const n = 2 + B.beats[this.type].length;
      const zs = [];
      const takeoff = S.bfcZ + S.boundLen;
      for (let i = n - 1; i >= 0; i--) {
        const k = (n - 1 - i) / Math.max(1, n - 1);
        zs[i] = i === n - 1 ? takeoff : zs[i + 1] + M.lerp(this.spin ? 1.05 : 1.6, this.spin ? 0.9 : 1.2, k);
      }
      return zs;
    }

    // ---- input ----------------------------------------------------------------
    input(ev, t) {
      const b = this.b;
      const k = ev.key;
      t -= (this.game.save.data.settings.calib || 0) / 1000;   // same calibration as batting
      let down = false, up = false;
      if (ev.type === 'keydown') {
        if (k === ' ' || k === 'enter') down = true;
        else if (b.phase === 'plan') this._planKey(k);
        else if (k === 'escape') return;
      } else if (ev.type === 'keyup') {
        if (k === ' ' || k === 'enter') up = true;
      } else if (ev.type === 'mousedown' && ev.button === 0) {
        if (b.phase === 'plan' && this._varAt(ev.x, ev.y)) return;
        down = true;
      }
      else if (ev.type === 'mouseup' && ev.button === 0) up = true;
      else if (ev.type === 'touchbtn' && k === 'bowl') { if (ev.phase === 'down') down = true; else up = true; }
      else if (ev.type === 'touchstart' || ev.type === 'touchmove') {
        if (b.phase === 'plan') {
          if (ev.type === 'touchstart' && this._varAt(ev.x, ev.y)) return;
          this.mouseMove(ev.x, ev.y, this.game.cam);
        }
        return;
      }
      if (down) this._press(t);
      if (up) this._releaseBtn(t);
    }

    // Click / tap on the variation bar? Select it and swallow the event.
    _varAt(x, y) {
      const i = this.vars.findIndex((v) => v._hit && x >= v._hit.x && x <= v._hit.x + v._hit.w && y >= v._hit.y && y <= v._hit.y + v._hit.h);
      if (i < 0) return false;
      this.game.input.mouse.moved = false;          // this tap was a button, not an aim
      if (i === this.varIdx && this.spin) {
        const order = ['stock', 'loop', 'flat'];
        this.flight = order[(order.indexOf(this.flight) + 1) % 3];
        this.game.ui.toast(`Flight: ${this.flight}`);
      }
      this.varIdx = i; Audio.ui(); this.refreshHud();
      return true;
    }

    _planKey(k) {
      const n = parseInt(k, 10);
      if (n >= 1 && n <= this.vars.length) { this.varIdx = n - 1; Audio.ui(); this.refreshHud(); return; }
      const T = this.target;
      if (k === 'arrowleft') T.off += 0.05 * (this.h === 1 ? 1 : -1) * 1;
      if (k === 'arrowright') T.off -= 0.05 * (this.h === 1 ? 1 : -1) * 1;
      if (k === 'arrowup') T.len += 0.25;
      if (k === 'arrowdown') T.len -= 0.25;
      if (this.spin && (k === 'w' || k === 's')) {
        const order = ['flat', 'stock', 'loop'];
        let i = order.indexOf(this.flight) + (k === 'w' ? 1 : -1);
        this.flight = order[M.clamp(i, 0, 2)];
        this.game.ui.toast(`Flight: ${this.flight}`);
      }
      this._clampTarget();
    }

    _clampTarget() {
      const T = this.target;
      T.off = M.clamp(T.off, -0.8, 1.1);
      T.len = M.clamp(T.len, this.spin ? -0.5 : -0.5, this.spin ? 9 : 13);
    }

    mouseMove(mx, my, cam) {
      if (!this.b || this.b.phase !== 'plan') return;
      if (this.vars.some((v) => v._hit && mx >= v._hit.x - 6 && mx <= v._hit.x + v._hit.w + 6 && my >= v._hit.y - 6 && my <= v._hit.y + v._hit.h + 6)) return;
      const p = cam.unprojectToPlane(mx, my, 0);
      if (!p) return;
      let off = p.x * -this.h;
      // soft snap to named lines
      for (const L of LINES) if (Math.abs(off - L.off) < 0.03) off = L.off;
      this.target.off = off;
      this.target.len = p.z;
      this._clampTarget();
    }

    _press(t) {
      const b = this.b;
      if (b.phase === 'plan') {
        if (this.game.clock < b.tPlan) return;
        this._startRunup(t);
        return;
      }
      if (b.phase === 'result') { if (this.game.clock > b.tResult + 0.4) this._toPlan(0); return; }
      if (b.phase !== 'runup') return;
      const W = B.beatWin[this.type];
      // Load beat? (a late tap on the take-off footfall still counts as that
      // footfall — only a press nearer the jump than the last beat is the load)
      const lastI = b.beats.length - 1, lastBeat = b.beats[lastI];
      const lastOpen = !b.judged[lastI] && Math.abs(t - lastBeat) <= (W[2] + 10) / 1000;
      const nearerLoad = Math.abs(t - b.tLoad) < Math.abs(t - lastBeat);
      if (Math.abs(t - b.tLoad) < 0.35 && t > lastBeat + 0.03 && (!lastOpen || nearerLoad)) {
        b.loadAt = t;
        b.phase = 'load';
        const e = (t - b.tLoad) * 1000;
        b.loadErr = e;
        Audio.step(0.9);
        return;
      }
      // Footfall taps (judged beats only)
      let best = -1, bestD = Infinity;
      for (let i = b.countIn; i < b.beats.length; i++) {
        if (b.judged[i]) continue;
        const dd = Math.abs(t - b.beats[i]);
        if (dd < bestD) { bestD = dd; best = i; }
      }
      const e = best >= 0 ? (t - b.beats[best]) * 1000 : 999;
      const early = e < 0 ? 10 : 0;      // people tap early: be a touch kinder
      const ae = Math.abs(e);
      let j = null;
      if (best >= 0 && ae <= W[0] + early) j = { q: 1, label: 'PERFECT' };
      else if (best >= 0 && ae <= W[1] + early) j = { q: 0.7, label: 'GOOD' };
      else if (best >= 0 && ae <= W[2] + early) j = { q: 0.4, label: 'OK' };
      if (j) {
        j.e = e; j.t = t;
        b.judged[best] = j;
        if (j.q >= 0.7) Audio.tick(false);
      } else {
        b.stray = Math.min(0.2, b.stray + 0.05);
      }
    }

    _releaseBtn(t) {
      const b = this.b;
      if (b.phase !== 'load') return;
      b.relAt = t;
      this._deliver();
    }

    // ---- the delivery -----------------------------------------------------------
    _rhythm() {
      const b = this.b;
      let sw = 0, sum = 0;
      const n = b.beats.length - b.countIn;
      for (let i = b.countIn; i < b.beats.length; i++) {
        const k = (i - b.countIn) / Math.max(1, n);
        const w = M.lerp(0.6, 1.6, k);
        sw += w;
        sum += w * (b.judged[i] ? b.judged[i].q : 0);
      }
      // the load beat counts too
      const le = Math.abs(b.loadErr || 999);
      const W = B.beatWin[this.type];
      const lq = le <= W[0] ? 1 : le <= W[1] ? 0.7 : le <= W[2] ? 0.4 : 0;
      sw += 1.6; sum += 1.6 * lq;
      return M.clamp(sum / sw - b.stray, 0, 1);
    }

    _deliver() {
      const b = this.b;
      const type = this.type;
      const spin = this.spin;
      const R = this._rhythm();
      b.R = R;
      const vr = b.spec;
      // --- release judgement
      const e = (b.relAt - b.tRelTarget) * 1000;
      const RW = B.relWin[type].map((w) => w * (vr.winMul || 1));
      const ae = Math.abs(e);
      const rel = ae <= RW[0] ? 'perfect' : ae <= RW[1] ? 'good' : ae <= RW[2] ? 'ok' : 'wild';
      b.rel = rel; b.relErr = e;
      const relFactor = { perfect: 1, good: 0.85, ok: 0.6, wild: 0.3 }[rel];
      let Q = (0.45 + 0.55 * R) * relFactor;
      // --- length error: early = fuller
      const a = B.lengthErr[type];
      let dLen = Math.sign(e) * a * Math.pow(ae / RW[0], 1.4);
      let len = this.target.len;
      if (rel === 'wild') {
        if (e < 0) { len = M.rand(-1.2, -0.3); b.wildNote = 'Let go too early — full toss'; }
        else { len = this.target.len + M.rand(2.5, 4); b.wildNote = 'Dragged it down — long hop'; }
      } else len += dLen;
      // --- line error: where the sway is at release
      const sw = B.sway[type];
      let amp = sw[0] + sw[1] * (1 - R);
      if (rel === 'ok') amp *= 1.3; if (rel === 'wild') amp *= 1.8;
      // spin revs
      let revMul = 1;
      if (spin) {
        const D = B.releaseAfterLoad[type] / 1000;
        const revs = (b.relAt - b.loadAt) / D;
        b.revs = revs;
        revMul = M.clamp(revs, 0.6, 1.1);
        if (revs > 1.1) { amp *= 1 + 5 * (revs - 1.1); len += dLen * 0.3; b.overRip = true; }
      }
      amp *= Math.pow(0.9, this.groove);
      const dLine = amp * Math.sin(2 * Math.PI * 2.3 * (b.relAt - b.tLoad) + b.swayPhase);
      const off = this.target.off + dLine;
      // --- no-ball (pace: bound timing sets where the front foot lands)
      let noBall = false, footCm = null, boundBonus = 0;
      const eb = b.loadErr || 0;
      if (!spin) {
        footCm = -16 + 0.3 * eb;
        noBall = footCm > 0;
        boundBonus = eb < -110 ? 0 : 4 * M.clamp(1 - Math.abs(footCm) / 40, 0, 1);
        if (eb < -110) R * 0.9;
      } else {
        footCm = -20 + 0.25 * eb;
        noBall = footCm > 0;
      }
      b.footCm = footCm; b.noBall = noBall;
      // --- speed
      let kmh;
      if (!spin) {
        const relBonus = { perfect: 1.5, good: 0.5, ok: 0, wild: -3 }[rel];
        kmh = (B.speed.pace * (0.9 + 0.1 * R) + boundBonus + relBonus + this.groove) * (vr.sMul || 1);
      } else {
        kmh = B.speed[type] + (this.flight === 'flat' ? 8 : this.flight === 'loop' ? -8 : 0);
        kmh *= (vr.sMul || 1);
      }
      // --- build the actual delivery
      // Release from the proper release point (nudged by how early/late you
      // let go) — never from wherever the follow-through has the hand.
      const release = this.bowlAnim.releasePoint();
      const eS = M.clamp(e / 1000, -0.15, 0.15);
      release.z -= eS * 2.5;          // early: still a touch further back; late: further forward
      release.y -= Math.abs(eS) * 1.2;
      len = Math.min(len, release.z - (spin ? 9 : 6.5));
      const flightMul = this.flight === 'loop' ? 1.3 : this.flight === 'flat' ? 0.6 : 1;
      const turnMul = this.flight === 'loop' ? 1.1 : this.flight === 'flat' ? 0.8 : 1;
      const plan = Deliveries.build({
        type, varKey: vr.key, length: len, offLine: off, hand: this.hand,
        speedKmh: kmh / (vr.sMul || 1), quality: Q * (spin ? revMul * turnMul : 1), release,
        driftMul: spin ? flightMul / turnMul : 1,
      });
      b.plan = plan;
      b.kmh = kmh;
      b.Q = Q;
      // sim: real speed, no time scaling in bowling (you're watching, not reacting)
      b.tsc = 1;
      b.tRelease = b.relAt;
      this.ball.launch(plan);
      this.bowler.ball = null;
      this.bowlAnim.ballGone = true;        // stop drawing the ball in hand
      this.batAnim.startBacklift(this.game.clock);
      b.phase = 'flight';
      // --- the batter's response (decided now, shown as it happens)
      this._batterResponds();
    }

    _moves(plan) {
      // actual movement relative to the batter (+ away), per the AI model
      const tPost = Math.max(0.05, BallPhys.timeAtZ(plan, 0) - plan.T);
      const sgn = -this.h;
      const mAir = (plan.vxB - plan.vx) * tPost * sgn;
      const mPitch = (plan.post.vx - plan.vxB) * tPost * sgn;
      return { mAir, mPitch };
    }

    _batterResponds() {
      const b = this.b, plan = b.plan;
      const st = BallPhys.hitsStumps(plan);
      const xSt = st.p.x * -this.h, zSt = st.p.y;
      const mv = this._moves(plan);
      const d = {
        type: this.type, varKey: plan.varKey, plan, lengthM: plan.lengthM, lineOff: plan.offLine,
        xStumps: xSt, zStumps: zSt, mAir: mv.mAir, mPitch: mv.mPitch, release: b.rel, freeHit: this.freeHit || b.noBall && false,
        kmh: b.kmh, onset: 0.65 - 0.3 * (1 - b.Q), groove5: this.groove >= 5, bounceMul: 1,
      };
      b.d = d;
      const fh = this.freeHit;
      const r = this.ai.face(Object.assign(d, { freeHit: fh }));
      b.ai = r;
      // Outcome from the model
      const out = { runs: 0, out: false, how: null, text: '', kind: '', edged: false, beaten: false, attacked: r.shot === 'hit' || r.shot === 'loft' };
      const wouldHit = Math.abs(xSt) <= 0.15 && zSt <= 0.75;
      const spin = this.spin;
      const F = this.field;
      const hsign = -this.h;
      const relToWorld = (deg) => M.wrapAng(deg * D2R * hsign);
      const E = r.E;
      let exit = null;
      if (r.shot === 'leave' || r.shot === 'duck') {
        if (wouldHit && !fh) { out.out = true; out.how = 'bowled'; out.text = 'Shouldered arms — BOWLED!'; }
        else if (r.shot === 'duck') out.text = 'Ducks under it';
        else if (Math.abs(xSt) <= 0.15 && zSt > 0.75) out.text = `Left alone — over the top by ${Math.round((zSt - 0.75) * 100)} cm`;
        else out.text = `Left alone — missing by ${Math.round(Math.max(0, Math.abs(xSt) - 0.15) * 100)} cm`;
        out.kind = 'leave';
      } else if (E > 1.6) {
        out.beaten = true;
        if (wouldHit && !fh) {
          const pitchedOutsideLeg = plan.offLine < -0.13;
          if (Math.random() < 0.5 || pitchedOutsideLeg) { out.out = true; out.how = 'bowled'; out.text = 'BOWLED! Beat him all ends up'; }
          else { out.out = true; out.how = 'lbw'; out.text = 'LBW! Trapped in front'; }
        } else out.text = r.lateral ? 'Beaten! Past the outside edge' : 'Beaten!';
        out.kind = 'beaten';
      } else if (E > 1.0) {
        out.edged = true;
        out.kind = 'edge';
        if (r.timingDominant && r.et < 0) {
          const pc = r.shot === 'loft' ? 0.55 : 0.35;
          if (Math.random() < pc && !fh) { out.out = true; out.how = 'caught'; out.text = 'Leading edge — caught!'; exit = { rel: 30 + M.rand(-10, 20), v: 13, loft: 0.6 }; }
          else { out.runs = 1; out.text = 'Leading edge — they scamper one'; exit = { rel: 40, v: 11, loft: 0.3 }; }
        } else if (r.timingDominant) {
          out.runs = Math.random() < 0.5 ? 0 : 1; out.text = 'Thick edge'; exit = { rel: 120, v: 12, loft: 0.05 };
        } else if (r.lateral && (mvAway(d) || plan.offLine > 0.12)) {
          const pc = spin ? (r.shot === 'defend' ? 0.25 : 0.3) : (r.shot === 'defend' ? 0.3 : 0.4);
          if (Math.random() < pc && !fh) {
            out.out = true; out.how = 'caught';
            out.text = spin ? 'Edged — taken at slip!' : M.pick(['Edged — caught behind!', 'Nicked — second slip takes it!', 'Edged — first slip!']);
            exit = { rel: 168, v: 17, loft: 0.2 };
          } else {
            const rr = Math.random();
            out.runs = rr < 0.5 ? 0 : rr < 0.8 ? 1 : 4;
            out.text = out.runs === 4 ? 'Edged — FOUR through third man' : 'Edged — falls short';
            exit = { rel: 150, v: out.runs === 4 ? 22 : 9, loft: 0.12 };
          }
        } else {
          // comes back in: inside edge
          if (wouldHit && Math.random() < 0.4 && !fh) { out.out = true; out.how = 'bowled'; out.text = 'Inside edge — PLAYED ON!'; exit = { rel: 0, v: 3, loft: -0.1, playedOn: true }; }
          else { out.runs = Math.random() < 0.5 ? 0 : 1; out.text = 'Inside edge onto the pad'; exit = { rel: -150, v: 8, loft: 0.02 }; }
        }
      } else if (r.shot === 'defend') {
        out.text = M.pick(['Solid defence', 'Blocked', 'Dead bat']);
        out.kind = 'block';
        exit = { rel: M.rand(-15, 15), v: 3, loft: -0.2, block: true };
      } else if (r.shot === 'loft') {
        if (E <= 0.4) { out.runs = 6; out.text = 'SIX! Launched'; exit = { rel: this._gapAngle(true), v: 34, loft: 0.55, six: true }; }
        else if (E <= 0.75) {
          if (Math.random() < 0.15 && !fh) { out.out = true; out.how = 'caught'; out.text = 'Caught in the deep!'; exit = { rel: this._gapAngle(false), v: 26, loft: 0.55 }; }
          else { out.runs = 4; out.text = 'FOUR — over the top'; exit = { rel: this._gapAngle(true), v: 27, loft: 0.5 }; }
        } else {
          if (Math.random() < 0.5 && !fh) { out.out = true; out.how = 'caught'; out.text = 'Skied it — caught!'; exit = { rel: this._gapAngle(false), v: 16, loft: 1.0 }; }
          else { out.runs = 1; out.text = 'Skied — lands safe'; exit = { rel: this._gapAngle(false), v: 14, loft: 0.9 }; }
        }
        out.kind = 'loft';
      } else {
        const runs = E <= 0.5 ? 4 : E <= 0.67 ? 3 : E <= 0.84 ? 2 : 1;
        out.runs = runs > 1 && Math.random() < 0.2 ? runs - 1 : runs;
        out.text = out.runs === 4 ? 'FOUR!' : out.runs === 1 ? 'Pushed for a single' : `${out.runs} runs`;
        exit = { rel: this._gapAngle(out.runs >= 3), v: out.runs === 4 ? 30 : 12 + out.runs * 4, loft: 0.03 };
        out.kind = 'hit';
      }
      if (fh && out.out) { out.out = false; out.text += ' — but it’s a FREE HIT!'; }
      else if (b.noBall && out.out) { out.out = false; out.text += ' — but it’s a NO BALL!'; }
      b.out = out;
      // Batter animation: foot & shot at the contact plane
      const foot = r.foot;
      const c = foot === 'front' ? 2.0 : 0.8;
      const tPlaneSim = BallPhys.timeAtZ(plan, c);
      b.tContact = b.tRelease + tPlaneSim + (r.shot === 'hit' || r.shot === 'loft' || r.shot === 'defend' ? M.clamp(r.et, -60, 60) / 1000 * 0.3 : 0);
      this.batAnim.setFoot(foot, this.game.clock + Math.min(0.3, tPlaneSim * 0.35));
      b.exit = exit;
      const contact = exit && !out.beaten && out.kind !== 'leave';
      b.contact = contact;
      const C0 = BallPhys.posAt(plan, tPlaneSim);
      let C = this.batter.mirror ? V.v(-C0.x, C0.y, C0.z) : C0;
      const exitRel = exit ? exit.rel : 0;
      const phi = relToWorld(exitRel);
      const dW = Field.dir(phi);
      let u = V.norm(V.v(this.batter.mirror ? -dW.x : dW.x, 0, dW.z));
      if (r.shot === 'leave' || r.shot === 'duck') {
        this.batAnim.playShot(BatterAnim.makeShot('leave', V.v(0, 1, 1), V.v(0, 0, 1), b.tRelease + tPlaneSim - 0.12));
      } else {
        const aRel = exitRel;
        let fam = r.shot === 'defend' ? 'defend' : foot === 'front' ? (aRel < -40 ? 'flick' : r.shot === 'loft' ? 'loft' : 'drive') : (aRel > 70 ? 'cut' : aRel < -40 ? 'pull' : 'punch');
        if (out.beaten) C = V.add(C, V.v(-0.12, 0.05, 0));   // canonical frame: just outside off
        this.batAnim.playShot(BatterAnim.makeShot(fam, C, u, b.tContact, 0.11));
      }
      b.phi = phi;
    }

    // pick an attacking direction: toward a gap if possible
    _gapAngle(good) {
      const F = this.field;
      const cands = [];
      for (let a = -150; a <= 150; a += 6) {
        const phi = M.wrapAng(a * D2R * -this.h);
        let near = Infinity;
        for (const p of F.players) {
          if (p.name === 'keeper' || /slip/.test(p.name)) continue;
          const ang = Math.atan2(p.x, p.z);
          near = Math.min(near, Math.abs(M.wrapAng(ang - phi)));
        }
        cands.push({ a, near });
      }
      cands.sort((x, y) => (good ? y.near - x.near : x.near - y.near));
      const pick = cands[Math.floor(Math.random() * Math.min(6, cands.length))];
      return pick.a;
    }

    // ---- per frame --------------------------------------------------------------
    update(dt) {
      const now = this.game.clock;
      const b = this.b;
      // Bowler: stand at the mark while planning
      if (b.phase === 'plan') {
        this.bowlAnim.steps = [];
        this.bowlAnim.S = BowlerAnim.styleOf(this.type);
        this.bowler.solve(this.bowlAnim._idle(now, this._runupZs()[0] + 0.05));
        this.bowler.ball = this.bowler.J.rHand;
      } else {
        this.bowlAnim.pose(now);
        if (b.phase === 'load') this.bowler.ball = this.bowler.J.rHand;     // still holding it
        else if (b.phase !== 'runup') this.bowler.ball = null;
      }
      this.bowler.alpha = M.clamp((this.game.cam.depth(this.bowler.J.pel) - 1.8) / 3.5, 0, 1);

      if (b.phase === 'runup' || b.phase === 'load') {
        // footfall thuds on the beat
        b.thudded = b.thudded || [];
        b.beats.forEach((bt, i) => { if (!b.thudded[i] && now >= bt) { b.thudded[i] = true; Audio.step(i < b.countIn ? 0.3 : 0.5 + 0.4 * (i / b.beats.length)); } });
        // missed beats
        for (let i = b.countIn; i < b.beats.length; i++) {
          if (!b.judged[i] && now > b.beats[i] + B.beatWin[this.type][2] / 1000 + 0.02) b.judged[i] = { q: 0, label: 'MISS', e: null, t: b.beats[i] };
        }
        // didn't load in time: pull out
        if (b.phase === 'runup' && now > b.tLoad + 0.22) {
          this.game.ui.callout('Pulled out', '', 'Press and HOLD on the jump (the last beat), then let go at the top');
          this.groove = 0;
          this._toPlan(0.6);
          return;
        }
        // held too long: the ball comes out anyway (wild late)
        if (b.phase === 'load' && now > b.tRelTarget + 0.4) { b.relAt = now; this._deliver(); }
      }
      if (b.phase === 'flight') {
        if (this.ball.mode === 'delivery') {
          const simT = (now - b.tRelease) * b.tsc;
          this.ball.update(Math.max(0, simT - this.ball.t));
          if (!b.hitDone && now >= b.tContact && b.contact) this._contact();
          if (!b.hitDone && !b.contact) this._missVisual();
          if (this.ball.pos.z < -2.4) this.ball.mode = 'dead';
        }
        if ((b.hitDone || now > b.tRelease + BallPhys.timeAtZ(b.plan, 0) + 0.1) && !b.finished) this._finish();
      }
      if ((b.phase === 'flight' || b.phase === 'result') && this.ball.mode === 'free') this.ball.update(dt);
      if (b.phase === 'result' && now > b.tResult + 2.6) this._toPlan(0);
      if (this.stumpsFx) this._updStumps(dt);
      this.batAnim.pose(now, V.v(-0.4 * (this.batter.mirror ? -1 : 1), 1.6, 19));
    }

    _contact() {
      const b = this.b, ex = b.exit;
      b.hitDone = true;
      const pos = BallPhys.posAt(b.plan, Math.max(0, (b.tContact - b.tRelease) * b.tsc));   // true contact point
      if (ex.playedOn) {
        this.ball.free(pos, V.v(-pos.x * 2, -0.3, -3), 0);
        this._breakStumps(pos.x);
        Audio.bat(0.2, 'edge');
        return;
      }
      const d = Field.dir(b.phi);
      const sp = ex.v;
      const vel = V.v(d.x * sp * Math.cos(ex.loft), Math.max(-2, sp * Math.sin(ex.loft)), d.z * sp * Math.cos(ex.loft));
      if (ex.block) { vel.x *= 0.5; vel.z = Math.abs(vel.z) * 0.5 + 1; vel.y = -0.4; }
      this.ball.free(pos, vel, 0);
      const o = b.out;
      Audio.bat(o.edged ? 0.2 : o.runs >= 4 ? 1 : 0.6, o.edged ? 'edge' : ex.block ? 'defend' : 'middle');
      if (o.runs === 6) this.game.cam.shake = 0.2;
      // mini-map
      const pr = { path: [{ x: 0, z: 0 }], out: o.out, kind: o.runs === 6 ? 'six' : o.runs === 4 ? 'four' : o.out ? 'caught' : 'runs', airborne: ex.loft > 0.2 };
      const len = o.runs === 6 ? 72 : o.runs === 4 ? 64 : o.out ? (ex.v > 20 ? 50 : 16) : 8 + o.runs * 10;
      pr.path.push({ x: d.x * len, z: d.z * len });
      this.field.last = pr;
      this.game.ui.fieldShot(pr, true);
    }

    _missVisual() {
      const b = this.b;
      const z = this.ball.pos.z;
      const o = b.out;
      if (o.how === 'lbw' && z <= (b.ai.foot === 'front' ? 1.95 : 0.85)) {
        b.hitDone = true;
        this.ball.free(V.copy(this.ball.pos), V.v(M.rand(-1, 1), 0.6, 1.4), 0);
        Audio.pad();
        return;
      }
      if (z <= 0.05) {
        b.hitDone = true;
        const v = BallPhys.velAt(b.plan, this.ball.t);
        if (o.how === 'bowled') {
          this._breakStumps(this.ball.pos.x);
          this.ball.free(V.copy(this.ball.pos), V.v(v.x * 0.3, Math.abs(v.y) * 0.2 + 0.5, v.z * 0.35), 0);
        } else this.ball.free(V.copy(this.ball.pos), v, 0);
      }
    }

    _breakStumps(x) {
      const P = World.PITCH;
      const lean = P.STUMP_X.map((sx) => (Math.abs(sx - x) < 0.07 ? M.rand(0.5, 0.9) : Math.abs(sx - x) < 0.14 ? M.rand(0.1, 0.3) : M.rand(0, 0.06)));
      this.stumpsFx = {
        broken: true, t: 0, lean, dir: x * 4,
        bails: [
          { a: V.v(-0.1, P.STUMP_H + 0.012, 0), b: V.v(-0.002, P.STUMP_H + 0.012, 0), v: V.v(M.rand(-2, -0.5), M.rand(2.5, 4), M.rand(-3, -1.5)) },
          { a: V.v(0.002, P.STUMP_H + 0.012, 0), b: V.v(0.1, P.STUMP_H + 0.012, 0), v: V.v(M.rand(0.5, 2), M.rand(2.5, 4.5), M.rand(-3, -1.5)) },
        ],
      };
      Audio.stumps();
      this.game.cam.shake = 0.35;
    }

    _updStumps(dt) {
      const fx = this.stumpsFx;
      fx.t += dt;
      for (const bl of fx.bails) {
        if (bl.a.y <= 0.013 && bl.v.y === 0) continue;
        bl.v.y -= 9.81 * dt;
        const dp = V.mul(bl.v, dt);
        bl.a = V.add(bl.a, dp); bl.b = V.add(bl.b, dp);
        if (bl.a.y < 0.012 || bl.b.y < 0.012) {
          const lift = 0.012 - Math.min(bl.a.y, bl.b.y);
          bl.a.y += lift; bl.b.y += lift;
          bl.v = V.v(bl.v.x * 0.4, Math.abs(bl.v.y) * 0.3, bl.v.z * 0.4);
          if (Math.abs(bl.v.y) < 0.3) bl.v.y = 0;
        }
      }
    }

    _finish() {
      const b = this.b, o = b.out, sp = this.spell;
      b.finished = true;
      b.phase = 'result';
      b.tResult = this.game.clock;
      const st = this.game.save.data.stats;
      const nb = b.noBall;
      let runs = o.runs + (nb ? 1 : 0);
      const wasFreeHit = this.freeHit;
      this.freeHit = nb;
      // tallies
      if (!nb) { sp.balls++; this.batBalls++; st.bowlBalls++; }
      sp.runs += runs; sp.overRuns += runs; st.bowlRuns += runs;
      this.batRuns += o.runs;
      if (o.runs === 4) sp.fours++;
      if (o.runs === 6) sp.sixes++;
      if (!nb && runs === 0 && !o.out) sp.dots++;
      if (nb) sp.noballs++;
      sp.rSum += b.R;
      if (!this.spin && b.kmh > sp.topSpeed) sp.topSpeed = b.kmh;
      if (!this.spin && b.kmh > st.topSpeed) st.topSpeed = b.kmh;
      let tag = nb ? 'nb' : o.out ? 'W' : o.runs ? String(o.runs) : '·';
      if (o.out) {
        sp.wkts++; st.bowlWkts++;
        this.innings.unshift({ runs: this.batRuns, balls: this.batBalls, how: o.how });
        if (this.innings.length > 6) this.innings.pop();
        b.dismissed = { runs: this.batRuns, balls: this.batBalls };
        this.batRuns = 0; this.batBalls = 0;
        Audio.cheer(true);
      } else if (o.runs >= 4) Audio.groan();
      if (sp.balls > 0 && sp.balls % 6 === 0 && !nb) {
        if (sp.overRuns === 0) sp.maidens++;
        sp.overRuns = 0;
      }
      // groove
      if (b.R >= 0.85 && (b.rel === 'perfect' || b.rel === 'good') && !nb) this.groove = Math.min(5, this.groove + 1);
      else if (nb || b.rel === 'wild' || b.R < 0.5) this.groove = 0;
      // learn
      this.ai.learn(b.d, { E: b.ai.E, attacked: o.attacked, beaten: o.beaten, edged: o.edged, out: o.out, runs: o.runs });
      this.recent.push(tag);
      if (this.recent.length > 8) this.recent.shift();
      this.pitchMap.push({ off: b.plan.offLine, len: b.plan.lengthM, out: o.out, runs: o.runs });
      if (this.pitchMap.length > 12) this.pitchMap.shift();
      this.lastPitch = { off: b.plan.offLine, len: b.plan.lengthM };
      // best spell
      const key = this.type;
      const best = this.game.save.best('bowl', this.diffKey, key, this.hand);
      if (sp.wkts > best.wkts || (sp.wkts === best.wkts && sp.wkts > 0 && sp.runs < best.runs)) {
        this.game.save.setBest('bowl', this.diffKey, key, this.hand, { wkts: sp.wkts, runs: sp.runs, balls: sp.balls });
      }
      this.game.save.write();
      this._resultCard(wasFreeHit);
      this.refreshHud();
    }

    _resultCard(wasFreeHit) {
      const b = this.b, o = b.out, ui = this.game.ui;
      let big = o.out ? 'WICKET!' : o.runs === 6 ? 'SIX' : o.runs === 4 ? 'FOUR' : b.noBall ? 'NO BALL' : o.runs ? `${o.runs} run${o.runs > 1 ? 's' : ''}` : 'Dot ball';
      let cls = o.out ? 'good' : o.runs >= 4 ? 'out' : b.noBall ? 'out' : '';
      let sub = o.text;
      if (o.out && b.dismissed) sub += `  ·  He made ${b.dismissed.runs} (${b.dismissed.balls})`;
      if (b.noBall) sub += ` · front foot ${Math.round(b.footCm)} cm over — FREE HIT next ball`;
      const setup = o.out && b.ai && !b.ai.read && Math.abs(b.d.mAir + b.d.mPitch - (this.ai.mAir + this.ai.mPitch)) > 0.1;
      if (setup) sub += ' · SET HIM UP!';
      ui.callout(big, cls, sub);
      // coach card (3 lines)
      const relTxt = { perfect: 'PERFECT', good: 'GOOD', ok: 'OK', wild: 'WILD' }[b.rel];
      const e = Math.round(b.relErr);
      const chips = [
        { t: `Rhythm ${Math.round(b.R * 100)}%`, c: b.R >= 0.85 ? 'good' : b.R >= 0.6 ? 'meh' : 'bad' },
        { t: `Release ${relTxt} ${e > 0 ? '+' : ''}${e} ms`, c: b.rel === 'perfect' ? 'good' : b.rel === 'good' ? 'meh' : 'bad' },
      ];
      if (!this.spin) chips.push({ t: `Front foot ${Math.abs(Math.round(b.footCm))} cm ${b.footCm > 0 ? 'OVER' : 'behind'}`, c: b.footCm > 0 ? 'bad' : b.footCm > -8 ? 'good' : 'meh' });
      else chips.push({ t: `Revs ${Math.round((b.revs || 0) * 100)}%${b.overRip ? ' (over-ripped)' : ''}`, c: b.revs >= 0.9 && b.revs <= 1.1 ? 'good' : b.revs > 1.1 ? 'bad' : 'meh' });
      chips.push({ t: this.spin ? `${Math.round(b.kmh)} km/h` : `${b.kmh.toFixed(1)} km/h`, c: '' });
      if (this.groove) chips.push({ t: `Groove ${this.groove}/5`, c: 'good' });
      const plan = b.plan;
      const mv = Deliveries.describeMove(plan);
      const lineName = this._lineName(plan.offLine);
      const del = `${plan.varName} · ${lengthLabel(this.type, plan.lengthM)} ${plan.lengthM.toFixed(1)} m · ${lineName}${mv ? ' · ' + mv : ''}`;
      let why = '';
      const ai = b.ai;
      if (ai) {
        if (ai.read && plan.varKey !== 'stock') why = `He read it from the hand${b.rel !== 'perfect' ? ' — a cleaner release hides it better' : ''}.`;
        else if (o.out && ai.lateral) why = `He was expecting ${Math.abs(this.ai.mAir + this.ai.mPitch) < 0.05 ? 'it straight' : 'the usual movement'} — it did something else.`;
        else if (ai.linedUp) why = 'Same ball again — he’s lined you up.';
        else if (b.wildNote) why = b.wildNote + '.';
      }
      document.getElementById('coach').innerHTML =
        `<div><span class="tag">${o.out ? 'Wicket' : 'Ball'}</span>${del}</div>` +
        `<div class="chips">${chips.map((ch) => `<span class="chip ${ch.c}">${ch.t}</span>`).join('')}</div>` +
        (why ? `<div style="margin-top:4px;opacity:.85">${why}</div>` : '');
      document.getElementById('coach').classList.remove('hidden');
    }

    _lineName(off) {
      let best = LINES[0], bd = Infinity;
      for (const L of LINES) { const d = Math.abs(off - L.off); if (d < bd) { bd = d; best = L; } }
      if (off < -0.2) return 'down leg';
      if (off > 0.6) return 'wide outside off';
      return bd < 0.04 ? best.name : off > 0 ? `${Math.round(off * 100)} cm outside middle` : 'leg side';
    }

    refreshHud() {
      const sp = this.spell;
      const $ = (id) => document.getElementById(id);
      const T = Deliveries.TYPES[this.type].name;
      $('sbTitle').innerHTML = `<span>Batter ${this.hand === 'L' ? '(left)' : '(right)'}</span><span>${CFG.AIBAT[this.diffKey].name} · you bowl ${T.toLowerCase()}</span>`;
      $('sbRuns').textContent = this.batRuns + (this.freeHit ? '' : '*');
      $('sbBalls').textContent = `(${this.batBalls} ball${this.batBalls === 1 ? '' : 's'})`;
      const overs = `${Math.floor(sp.balls / 6)}.${sp.balls % 6}`;
      const econ = sp.balls ? (sp.runs / (sp.balls / 6)).toFixed(1) : '0.0';
      const best = this.game.save.best('bowl', this.diffKey, this.type, this.hand);
      $('sbMeta').innerHTML = `<span>You <b>${sp.wkts}/${sp.runs}</b> (${overs} ov)</span><span>Econ <b>${econ}</b></span>` +
        (best.wkts ? `<span>Best <b>${best.wkts}/${best.runs}</b></span>` : '') + (this.freeHit ? '<span style="color:#ff8a8d"><b>FREE HIT</b></span>' : '');
      const rec = $('recent');
      rec.innerHTML = '';
      for (const r of this.recent.slice(-8)) {
        const s = document.createElement('span');
        s.textContent = r === 'nb' ? 'nb' : r;
        s.className = r === 'W' ? 'rW' : r === '4' ? 'r4' : r === '6' ? 'r6' : r !== '·' ? 'rN' : '';
        rec.appendChild(s);
      }
      $('bowlerTag').innerHTML = `${T} · ${this.vars[this.varIdx].name}${this.spin ? ` · ${this.flight}` : ''}`;
    }

    // ---- rendering --------------------------------------------------------------
    scene() {
      return {
        figures: [this.batter, this.bowler],
        ball: this.ball,
        ballOpts: { trail: true },
        stumps: [{ z: 0, state: this.stumpsFx }, { z: World.PITCH.LENGTH }],
        extra: (q, cam) => this._extra(q, cam),
      };
    }

    _extra(queue, cam) {
      const b = this.b;
      const now = this.game.clock;
      const T = this.target;
      const offSign = -this.h;
      // pitch map dots (last balls)
      for (const p of this.pitchMap) {
        const c = V.v(p.off * offSign, 0.004, p.len);
        queue.push({ z: cam.depth(c) + 0.7, draw: (ctx) => {
          const q = cam.project(c); if (!q) return;
          ctx.fillStyle = p.out ? 'rgba(255,110,110,0.8)' : p.runs >= 4 ? 'rgba(143,195,255,0.8)' : 'rgba(255,255,255,0.45)';
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(2, 0.05 * q.s), Math.max(1.2, 0.02 * q.s), 0, 0, Math.PI * 2); ctx.fill();
        } });
      }
      // target marker (sways during the delivery stride)
      if (b.phase === 'plan' || b.phase === 'runup' || b.phase === 'load') {
        let sway = 0;
        if (b.phase === 'load') {
          const sw = B.sway[this.type];
          const amp = (sw[0] + sw[1] * (1 - this._rhythm())) * Math.pow(0.9, this.groove);
          sway = amp * Math.sin(2 * Math.PI * 2.3 * (now - b.tLoad) + b.swayPhase);
        }
        const x = (T.off + sway) * offSign;
        const c = V.v(x, 0.005, T.len);
        const R = this._rhythmPreview();
        const rad = 0.06 + 0.25 * (1 - R);
        queue.push({ z: cam.depth(c) + 0.9, draw: (ctx) => {
          const pts = [];
          for (let i = 0; i < 32; i++) {
            const an = (i / 32) * Math.PI * 2;
            const p = cam.project(V.v(x + Math.cos(an) * rad, 0.005, T.len + Math.sin(an) * rad * 3));
            if (p) pts.push(p);
          }
          ctx.save();
          ctx.strokeStyle = 'rgba(242,193,78,0.95)'; ctx.lineWidth = 2;
          ctx.fillStyle = 'rgba(242,193,78,0.18)';
          ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.stroke();
          const q = cam.project(c);
          if (q) {
            ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill();
            if (b.phase === 'plan') {
              const label = `${lengthLabel(this.type, T.len)} ${T.len.toFixed(1)} m · ${this._lineName(T.off)}`;
              ctx.font = '700 13px "Barlow Condensed", sans-serif';
              ctx.textAlign = 'center';
              const w = ctx.measureText(label).width + 12;
              ctx.fillStyle = 'rgba(10,20,14,0.75)';
              ctx.fillRect(q.x - w / 2, q.y + 10, w, 19);
              ctx.fillStyle = '#f6f1e3';
              ctx.fillText(label, q.x, q.y + 24);
            }
          }
          ctx.restore();
        } });
      }
      // ghost of the last pitch
      if (this.lastPitch && b.phase === 'plan') {
        const c = V.v(this.lastPitch.off * offSign, 0.004, this.lastPitch.len);
        queue.push({ z: cam.depth(c) + 0.8, draw: (ctx) => {
          const q = cam.project(c); if (!q) return;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.stroke();
        } });
      }
      this._loadRing(queue, cam, now);
      // footfall approach rings
      if (b.phase === 'runup' || b.phase === 'load') {
        const st = this.bowlAnim.steps;
        for (let i = 0; i < st.length; i++) {
          const dtb = b.beats[i] - now;
          if (dtb > 0.9 || dtb < -0.35) continue;
          const judged = b.judged[i];
          const isCount = i < b.countIn;
          const fx = this.bowlAnim.runX(st[i].z) + (st[i].foot === 'l' ? -0.1 : 0.1);
          const c = V.v(fx, 0.006, st[i].z);
          queue.push({ z: cam.depth(c) + 0.5, draw: (ctx) => {
            const q = cam.project(c); if (!q) return;
            ctx.save();
            const base = Math.max(6, 0.12 * q.s);
            if (dtb > 0) {
              const r = base + (dtb / 0.9) * base * 4;
              ctx.strokeStyle = isCount ? 'rgba(255,255,255,0.35)' : `rgba(242,193,78,${0.4 + 0.6 * (1 - dtb / 0.9)})`;
              ctx.lineWidth = 2.5;
              ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = isCount ? 'rgba(255,255,255,0.25)' : 'rgba(242,193,78,0.35)';
            ctx.beginPath(); ctx.ellipse(q.x, q.y, base, base * 0.45, 0, 0, Math.PI * 2); ctx.fill();
            if (judged && dtb < 0) {
              ctx.font = '800 15px "Barlow Condensed", sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = judged.q >= 1 ? '#5fd28a' : judged.q >= 0.7 ? '#f2c14e' : judged.q > 0 ? '#ffb070' : '#ff6b6e';
              ctx.fillText(judged.label, q.x, q.y - 14 + dtb * 30);
            }
            ctx.restore();
          } });
        }
      }
    }

    // The jump: a HOLD ring where the back foot lands
    _loadRing(queue, cam, now) {
      const b = this.b;
      if (!(b.phase === 'runup' || b.phase === 'load') || !this.bowlAnim.S) return;
      const dtb = b.tLoad - now;
      if (dtb > 1.1 || dtb < -0.3) return;
      const c = V.v(this.bowlAnim.runX(this.bowlAnim.S.bfcZ), 0.006, this.bowlAnim.S.bfcZ);
      queue.push({ z: cam.depth(c) + 0.5, draw: (ctx) => {
        const q = cam.project(c); if (!q) return;
        ctx.save();
        const base = Math.max(8, 0.16 * q.s);
        if (dtb > 0) {
          const r = base + (dtb / 1.1) * base * 4;
          ctx.strokeStyle = 'rgba(95,210,138,0.95)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(q.x, q.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = b.loadAt ? 'rgba(95,210,138,0.6)' : 'rgba(95,210,138,0.3)';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, base, base * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.font = '800 14px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#e8ffe9';
        ctx.fillText(b.loadAt ? 'HOLD…' : 'HOLD', q.x, q.y - base * 0.7 - 4);
        ctx.restore();
      } });
    }

    _rhythmPreview() {
      const b = this.b;
      if (b.phase === 'plan') return 0.75 + 0.05 * this.groove;
      let sw = 0, sum = 0;
      for (let i = b.countIn; i < b.beats.length; i++) {
        if (!b.judged[i]) continue;
        sw += 1; sum += b.judged[i].q;
      }
      return sw ? sum / sw : 0.75;
    }

    // HUD overlay: phase prompt + load/release meter
    drawOverlay(ctx, cam) {
      const b = this.b, g = this.game;
      const W = cam.w, H = cam.h;
      const now = g.clock;
      ctx.save();
      ctx.textAlign = 'center';
      let prompt = '';
      if (b.phase === 'plan') {
        prompt = g.input.touch ? 'Drag to aim · tap BOWL to run in' : 'Aim the marker · 1–5 variation · SPACE / click to run in';
        this._variationBar(ctx, W, H);
      } else if (b.phase === 'runup') {
        prompt = now > b.beats[b.beats.length - 1] - 0.05 ? 'HOLD on the jump!' : 'Tap on each footfall';
      } else if (b.phase === 'load') prompt = 'LET GO at the notch';
      if (prompt) {
        ctx.font = '800 20px "Barlow Condensed", sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        const w = ctx.measureText(prompt).width + 24;
        const y = g.input.touch || W < 500 ? H * 0.36 : H * 0.18;
        ctx.fillRect(W / 2 - w / 2, y - 18, w, 28);
        ctx.fillStyle = '#f6f1e3';
        ctx.fillText(prompt, W / 2, y + 3);
      }
      // Rhythm strip
      if (b.phase === 'runup' || b.phase === 'load') {
        const n = b.beats.length - b.countIn;
        const x0 = W / 2 - n * 14, y0 = (g.input.touch || W < 500 ? H * 0.36 : H * 0.18) + 22;
        for (let i = 0; i < n; i++) {
          const j = b.judged[i + b.countIn];
          ctx.fillStyle = !j ? 'rgba(255,255,255,0.2)' : j.q >= 1 ? '#5fd28a' : j.q >= 0.7 ? '#f2c14e' : j.q > 0 ? '#ffb070' : '#ff6b6e';
          ctx.beginPath(); ctx.arc(x0 + i * 28 + 14, y0 + 8, 7, 0, Math.PI * 2); ctx.fill();
        }
        // load dot
        ctx.strokeStyle = b.loadAt ? '#5fd28a' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x0 + n * 28 + 18, y0 + 8, 9, 0, Math.PI * 2); ctx.stroke();
      }
      // Release meter (arc near the bowler)
      if (b.phase === 'load' || (b.phase === 'runup' && now > b.tLoad - 0.6)) {
        const cx = Math.max(90, W * 0.2), cy = H * 0.52;
        const Rr = Math.max(46, Math.min(64, H * 0.08));
        ctx.fillStyle = 'rgba(10,20,14,0.72)';
        ctx.beginPath(); ctx.arc(cx, cy, Rr + 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(242,193,78,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, Rr + 20, 0, Math.PI * 2); ctx.stroke();
        const D = B.releaseAfterLoad[this.type] / 1000;
        const RW = B.relWin[this.type].map((w) => w * (b.spec.winMul || 1));
        const a0 = -Math.PI * 0.95, a1 = Math.PI * 0.35;         // sweep from back-low to over the top
        const tA = b.tLoad, tB = b.tLoad + D * 1.6;
        const angAt = (t) => a0 + ((t - tA) / (tB - tA)) * (a1 - a0);
        const tgt = b.tRelTarget;
        ctx.lineCap = 'butt';
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(cx, cy, Rr, a0, a1); ctx.stroke();
        const band = (w, col) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, Rr, angAt(tgt - w / 1000), angAt(tgt + w / 1000)); ctx.stroke(); };
        band(RW[2], 'rgba(255,176,112,0.8)'); band(RW[1], 'rgba(242,193,78,0.9)'); band(RW[0], 'rgba(95,210,138,1)');
        // spin: rev ring
        if (this.spin && b.loadAt) {
          const revs = (now - b.loadAt) / D;
          ctx.lineWidth = 4;
          ctx.strokeStyle = revs > 1.1 ? '#ff6b6e' : revs >= 0.9 ? '#5fd28a' : '#9ec5ff';
          ctx.beginPath(); ctx.arc(cx, cy, Rr - 11, -Math.PI / 2, -Math.PI / 2 + Math.min(1.3, revs) * Math.PI * 2 / 1.3); ctx.stroke();
          ctx.font = '700 11px "Barlow", sans-serif'; ctx.fillStyle = '#f6f1e3';
          ctx.fillText(`REVS ${Math.round(revs * 100)}%`, cx, cy + Rr + 22);
        }
        if (b.loadAt) {
          const an = angAt(Math.min(now, tB));
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * (Rr + 8), cy + Math.sin(an) * (Rr + 8)); ctx.stroke();
        }
        // notch tick at the target
        const at = angAt(tgt);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(at) * (Rr - 9), cy + Math.sin(at) * (Rr - 9)); ctx.lineTo(cx + Math.cos(at) * (Rr + 9), cy + Math.sin(at) * (Rr + 9)); ctx.stroke();
        ctx.fillStyle = '#f6f1e3';
        ctx.font = '800 14px "Barlow Condensed", sans-serif';
        ctx.fillText(b.loadAt ? 'LET GO' : 'HOLD', cx, cy + 5);
      }
      ctx.restore();
    }

    _variationBar(ctx, W, H) {
      const vars = this.vars;
      const gap = W < 500 ? 4 : 8;
      const bw = Math.min(124, (W - 24 - gap * (vars.length - 1)) / vars.length);
      const small = bw < 100;
      const total = vars.length * (bw + gap) - gap;
      let x = W / 2 - total / 2;
      const coach = document.getElementById('coach');
      const coachH = coach && !coach.classList.contains('hidden') && !this.game.input.touch ? coach.offsetHeight + 18 : 0;
      const y = H - Math.max(150, coachH + 58);
      ctx.save();
      for (let i = 0; i < vars.length; i++) {
        const on = i === this.varIdx;
        ctx.fillStyle = on ? 'rgba(242,193,78,0.95)' : 'rgba(10,20,14,0.65)';
        ctx.fillRect(x, y, bw, 40);
        ctx.fillStyle = on ? '#1e1a0a' : '#f6f1e3';
        ctx.textAlign = 'left';
        if (small) {
          ctx.font = '700 12px "Barlow Condensed", sans-serif';
          ctx.fillText(`${i + 1}`, x + 5, y + 15);
          const words = vars[i].name.split(/[ -]/);
          ctx.fillText(words[0], x + 5, y + 27);
          if (words[1]) ctx.fillText(words[1], x + 5, y + 37);
        } else {
          ctx.font = '700 12px "Barlow", sans-serif';
          ctx.fillText(`${i + 1}`, x + 8, y + 16);
          ctx.font = '700 14px "Barlow Condensed", sans-serif';
          ctx.fillText(vars[i].name, x + 22, y + 16);
          ctx.font = '500 11px "Barlow", sans-serif';
          ctx.globalAlpha = 0.8;
          ctx.fillText(vars[i].grip, x + 8, y + 32);
          ctx.globalAlpha = 1;
        }
        vars[i]._hit = { x, y, w: bw, h: 40 };
        x += bw + gap;
      }
      ctx.restore();
    }
  }

  function mvAway(d) { return d.mAir + d.mPitch > 0.04; }

  CLLM.BowlingSession = BowlingSession;
})();
