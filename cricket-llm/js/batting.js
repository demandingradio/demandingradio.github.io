/*
 * BATTING SESSION
 * ===============
 * READ -> COMMIT -> EXECUTE, one ball at a time, against an AI net bowler.
 *
 *   READ     the bowler's hand (tells), then the flight and the shadow
 *   COMMIT   W = front foot, S = back foot (locks on first press), E = dance
 *            down the pitch (spin only). No press = neutral stance.
 *   EXECUTE  aim with the mouse (world-true: move right, hit right), then
 *            left click = along the ground, right click = loft,
 *            Space = defend. No click = leave.
 *
 * Outcomes are deterministic: timing error (ms) vs this ball's windows,
 * shot/foot fit, and late movement (one grade at most). Cosmetic noise only.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, CFG, Deliveries, BallPhys, Ball, Figure, BowlerAnim, BatterAnim, Field, World, Audio } = CLLM;
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------------------
  // Shot tables (batter-relative angle a: 0 straight, + off side, - leg side)
  // ---------------------------------------------------------------------------
  function family(foot, a, spin, ballH) {
    const A = Math.abs(a);
    const f = foot === 'dance' ? 'front' : foot;
    if (f === 'front') {
      if (a >= -25 && a <= 25) return { key: 'drive', name: 'Straight drive', bat: 'drive' };
      if (a > 25 && a <= 80) return { key: 'drive', name: 'Cover drive', bat: 'drive' };
      if (a > 80) return { key: 'sqdrive', name: A > 130 ? 'Steer' : 'Square drive', bat: 'drive' };
      if (a < -25 && a >= -80) return { key: 'flick', name: a > -50 ? 'On drive' : 'Flick', bat: 'flick' };
      return spin ? { key: 'sweep', name: 'Sweep', bat: 'sweep' } : { key: 'glance', name: 'Glance', bat: 'flick' };
    }
    if (f === 'back') {
      if (a >= -25 && a <= 80) return { key: 'punch', name: 'Back-foot punch', bat: 'punch' };
      if (a > 80) return { key: 'cut', name: A > 125 ? 'Late cut' : 'Cut', bat: 'cut' };
      if (a < -25 && a >= -80) return { key: 'pull', name: 'Pull', bat: 'pull' };
      return { key: 'pull', name: ballH > 1.25 ? 'Hook' : 'Pull', bat: 'pull' };
    }
    // neutral stance: best guess from the angle
    if (a > 80) return { key: 'cut', name: 'Cut (from the crease)', bat: 'cut' };
    if (a < -60) return { key: 'pull', name: 'Pull (from the crease)', bat: 'pull' };
    if (a < -25) return { key: 'flick', name: 'Clip (from the crease)', bat: 'flick' };
    return { key: 'punch', name: 'Push (from the crease)', bat: 'punch' };
  }

  function lengthBand(type, L) {
    if (L < 0.3) return 'toss';
    if (type === 'pace') {
      if (L < 2) return 'yorker';
      if (L < 5.5) return 'full';
      if (L < 8) return 'good';
      if (L < 10) return 'short';
      return 'bouncer';
    }
    if (L < 1.5) return 'yorker';
    if (L < 3.5) return 'full';
    if (L < 5.5) return 'good';
    return 'short';
  }

  const FOOTFIT = {
    pace: { front: { toss: 1, yorker: 0.8, full: 1.0, good: 0.8, short: 0.5, bouncer: 0.4 },
            back: { toss: 0.8, yorker: 0.5, full: 0.45, good: 0.8, short: 1.0, bouncer: 1.0 } },
    spin: { front: { toss: 1, yorker: 1.0, full: 1.0, good: 0.85, short: 0.45, bouncer: 0.45 },
            back: { toss: 0.8, yorker: 0.6, full: 0.5, good: 0.75, short: 1.0, bouncer: 1.0 } },
  };

  // Shot fit by length zone (FULL / GOOD / SHORT)
  const SHOTFIT = {
    drive:   { full: 1.0, good: 0.75, short: 0.4 },
    sqdrive: { full: 0.9, good: 0.7, short: 0.45 },
    flick:   { full: 1.0, good: 0.8, short: 0.45 },
    glance:  { full: 0.6, good: 0.55, short: 0.5 },
    sweep:   { full: 1.0, good: 0.9, short: 0.4 },
    punch:   { full: 0.5, good: 0.85, short: 1.0 },
    cut:     { full: 0.35, good: 0.6, short: 1.0 },
    pull:    { full: 0.35, good: 0.55, short: 1.0 },
    defend:  { full: 1.0, good: 1.0, short: 1.0 },
  };

  function zoneOf(band) {
    if (band === 'toss' || band === 'yorker' || band === 'full') return 'full';
    if (band === 'good') return 'good';
    return 'short';
  }
  function lineBand(off) {
    if (off < -0.12) return 'leg';
    if (off <= 0.12) return 'stumps';
    if (off <= 0.45) return 'channel';
    return 'wide';
  }

  // ---------------------------------------------------------------------------
  // Stumps shattering effect
  // ---------------------------------------------------------------------------
  function makeStumpsFx(hitX, power) {
    const P = World.PITCH;
    const lean = P.STUMP_X.map((sx) => {
      const d = Math.abs(sx - hitX);
      return d < 0.07 ? M.rand(0.5, 0.9) * power : d < 0.14 ? M.rand(0.1, 0.3) * power : M.rand(0, 0.08);
    });
    const bails = [
      { a: V.v(-0.1, P.STUMP_H + 0.012, 0), b: V.v(-0.002, P.STUMP_H + 0.012, 0), v: V.v(M.rand(-2, -0.5), M.rand(2.5, 4), M.rand(-3, -1.5)), w: M.rand(-12, 12) },
      { a: V.v(0.002, P.STUMP_H + 0.012, 0), b: V.v(0.1, P.STUMP_H + 0.012, 0), v: V.v(M.rand(0.5, 2), M.rand(2.5, 4.5), M.rand(-3, -1.5)), w: M.rand(-12, 12) },
    ];
    return { broken: true, t: 0, lean, dir: hitX * 4, bails };
  }
  function updateStumpsFx(fx, dt) {
    fx.t += dt;
    for (const b of fx.bails) {
      if (b.a.y <= 0.012 && b.v.y <= 0) continue;
      b.v.y -= 9.81 * dt;
      const dp = V.mul(b.v, dt);
      b.a = V.add(b.a, dp); b.b = V.add(b.b, dp);
      // spin the bail around its centre
      const c = V.lerp(b.a, b.b, 0.5);
      const half = V.sub(b.b, c);
      const r = V.rotY(half, b.w * dt);
      b.a = V.sub(c, r); b.b = V.add(c, r);
      if (b.a.y < 0.012 || b.b.y < 0.012) {
        const lift = 0.012 - Math.min(b.a.y, b.b.y);
        b.a.y += lift; b.b.y += lift;
        b.v = V.v(b.v.x * 0.4, Math.abs(b.v.y) * 0.3, b.v.z * 0.4);
        b.w *= 0.5;
        if (Math.abs(b.v.y) < 0.3) b.v.y = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  class BattingSession {
    constructor(game, opts) {
      this.game = game;
      this.hand = opts.hand || 'R';
      this.h = this.hand === 'L' ? -1 : 1;          // world x of the off side = -h
      this.diff = CFG.DIFFS[opts.diff] || CFG.DIFFS.grade;
      this.bowlerChoice = opts.bowler || 'pace';
      this.type = this.bowlerChoice === 'mixed' ? 'pace' : this.bowlerChoice;
      this.batter = new Figure('batter');
      this.batter.mirror = this.hand === 'L';
      this.batAnim = new BatterAnim(this.batter);
      this.bowler = new Figure('bowler');
      this.bowler.setSkin(Math.floor(Math.random() * 5));
      this.bowlAnim = new BowlerAnim(this.bowler, this.type);
      this.ai = new Deliveries.AIBowler(this.type, this.diff);
      this.ball = new Ball();
      this.ball.onEvent = (ev, p, x) => this._ballEvent(ev, p, x);
      this.field = new Field();
      this.field.set(this.type, this.hand);
      this.stumpsFx = null;
      // session score
      this.runs = 0; this.balls = 0; this.fours = 0; this.sixes = 0;
      this.recent = [];
      this.innings = [];
      this.totalBalls = 0;
      this.ramp = 0;
      this.timingLog = [];
      this.aimPhi = 0.6 * -this.h;          // world angle; default toward cover
      this.aimBand = 'drive';
      this.aimR = 0.8;
      this.keyAim = false;
      this.ballNo = 0;
      this.stint = [];                      // boundary angles for the captain rule
      this.b = null;
      this.onScore = null; this.onBall = null; this.onOut = null;
      // Physical bat: you hold the bat yourself (pointer = sweet spot)
      this.physical = opts.controls === 'physical';
      this.bestKey = this.physical ? this.bowlerChoice + '-phys' : this.bowlerChoice;
      if (this.physical) {
        this.phys = new CLLM.PhysBat(this);
        this.batter.hideBat = true;
      }
      this._newBall(0.8);
    }

    get spin() { return this.type !== 'pace'; }

    // ---- ball lifecycle -----------------------------------------------------
    _newBall(delay) {
      const now = this.game.clock;
      if (this.bowlerChoice === 'mixed' && this.ballNo > 0 && this.ballNo % 6 === 0) {
        this.type = M.pick(['pace', 'off', 'leg'].filter((t) => t !== this.type));
        this.bowlAnim.setType(this.type);
        const habits = this.ai.habits;
        this.ai = new Deliveries.AIBowler(this.type, this.diff);
        this.ai.habits = habits;
        this.field.set(this.type, this.hand);
        this.game.ui.toast(`New bowler: ${Deliveries.TYPES[this.type].name}`);
      }
      this.ballNo++;
      if (this.phys) this.phys.resetFeet();
      this.field.last = null;
      this.game.ui.shotAnim = null;
      this.ball.reset();
      this.stumpsFx = null;
      this.batAnim.reset();
      const spec = this.ai.next(this.hand, this.ramp);
      // First ever balls: be kind
      if (this.game.save.data.stats.batBalls < 3 && this.totalBalls < 3 && Math.random() < 0.6) {
        spec.length = this.spin ? M.rand(1.2, 2.2) : M.rand(2.6, 4.2);
        spec.offLine = M.rand(0.05, 0.3); spec.varKey = 'stock'; spec.note = 'loose';
      }
      const strides = this.spin ? 5 : 7;
      this.bowlAnim.S = Object.assign({}, BowlerAnim.styleOf(this.type), { strides });
      if (spec.varKey === 'bouncer') this.bowlAnim.S.boundH *= 1.5;
      if (spec.varKey === 'yorker') this.bowlAnim.S.relH -= 0.1;
      this.bowlAnim.autoSchedule(now + delay);
      this.b = {
        phase: 'runup', spec, plan: null, tRelease: this.bowlAnim.tRelease,
        foot: null, tFoot: null, danced: false, ex: null, res: null, resolved: false,
        tHit: null, hitDone: false, passed: false, tsc: 1, tEnd: null, tellShown: false,
      };
    }

    _release() {
      const b = this.b;
      const rel = this.bowlAnim.releasePoint();
      const D = this.diff;
      const spec = b.spec;
      const plan = Deliveries.build({
        type: this.type, varKey: spec.varKey, length: spec.length, offLine: spec.offLine,
        hand: this.hand, speedKmh: spec.speedKmh, quality: spec.quality * D.move, release: rel,
      });
      b.plan = plan;
      const realFlight = BallPhys.timeAtZ(plan, 0);
      const target = D.flight[this.spin ? 'spin' : 'pace'] * Math.pow(0.97, this.ramp);
      b.tsc = realFlight / target;
      b.flight = target;
      this.ball.launch(plan);
      this.batAnim.startBacklift(this.game.clock);
      this.game.ui.bowlerInfo(plan, this.type);
      // stumps projection & length band (for the resolver)
      b.band = lengthBand(this.spin ? 'spin' : 'pace', plan.lengthM);
      b.toss = plan.lengthM < 0.3;
    }

    // Real time at which the ball reaches plane z
    tAt(z) { const b = this.b; return b.tRelease + BallPhys.timeAtZ(b.plan, z) / b.tsc; }
    simAt(t) { const b = this.b; return (t - b.tRelease) * b.tsc; }
    posAtReal(t) { return BallPhys.posAt(this.b.plan, Math.max(0, this.simAt(t))); }

    // ---- input ----------------------------------------------------------------
    input(ev, t) {
      const b = this.b;
      if (!b) return;
      const k = ev.key;
      if (this.physical) return this._inputPhys(ev, t);
      const inPlay = b.phase === 'runup' || b.phase === 'flight';
      if (ev.type === 'keydown') {
        if (k === 'w' || k === 'arrowup') return this._commit('front', t);
        if (k === 's' || k === 'arrowdown') return this._commit('back', t);
        if (k === 'e') return this._commit('dance', t);
        if (k === ' ') return this._exec('defend', t);
        if (k === 'j') return this._exec('hit', t);
        if (k === 'k') return this._exec('loft', t);
        if (k === 'a' || k === 'arrowleft') { this._nudgeAim(-1); return; }
        if (k === 'd' || k === 'arrowright') { this._nudgeAim(1); return; }
        if ((k === 'enter') && b.phase === 'done') this._skip();
      } else if (ev.type === 'mousedown') {
        if (b.phase === 'done') { this._skip(); return; }
        if (!inPlay) return;
        if (ev.button === 2 || ev.shift) this._exec('loft', t);
        else if (ev.button === 0) this._exec('hit', t);
      } else if (ev.type === 'touchbtn') {
        if (ev.phase === 'up') return;
        if (b.phase === 'done') { this._skip(); return; }
        if (k === 'front' || k === 'back' || k === 'dance') this._commit(k, t);
        else this._exec(k, t);
      }
    }

    // Physical bat: the pointer IS the bat. Keys only move your feet.
    // Physical bat: the pointer IS the bat. Hold W / S to move your feet;
    // hold Space (or Shift, or the right mouse button) to turn the bat cross.
    // Holds are read as levels (they can't get stuck), and changes are
    // stamped with the moment they happened.
    _crossLevel() {
      const I = this.game.input;
      return I.down(' ') || I.down('shift') || I.rmb || !!(I.pad && I.pad.cross) || !!(I.btnHeld && I.btnHeld.cross);
    }
    _inputPhys(ev, t) {
      const b = this.b, k = ev.key;
      if (((ev.type === 'keydown' || ev.type === 'keyup') && (k === ' ' || k === 'shift')) ||
          ((ev.type === 'mousedown' || ev.type === 'mouseup') && ev.button === 2) || ev.type === 'pad') {
        this.phys.noteCross(ev.stamp, this._crossLevel());
      }
      if (ev.type === 'keydown') {
        if (k === 'e') this._commit('dance', t);
        else if ((k === 'enter' || k === ' ') && b.phase === 'done') this._skip();
        else if (k === '[' || k === ']') this._tune('batLimit', k === ']' ? 1 : -1);
        else if (k === '-' || k === '=') this._tune('batWeight', k === '=' ? 1 : -1);
      } else if (ev.type === 'mousedown' && ev.button === 0 && b.phase === 'done') this._skip();
      else if (ev.type === 'touchbtn' && ev.phase !== 'up') {
        if (b.phase === 'done' && k !== 'cross') this._skip();
        else if (k === 'dance') this._commit('dance', t);
      }
    }

    // Pause-menu tuning, also on hotkeys so it can be A/B tested between balls
    _tune(key, dir) {
      const S = this.game.save.data.settings;
      const steps = key === 'batLimit' ? CFG.PHYS.LIMIT_STEPS : CFG.PHYS.WEIGHT_STEPS;
      let i = steps.indexOf(+S[key] || 0);
      if (i < 0) i = 0;
      i = M.clamp(i + dir, 0, steps.length - 1);
      S[key] = steps[i];
      this.game.save.write();
      this.game.ui.toast(this.game.ui.tuneText(key, steps[i]));
    }

    // Feet and bat turn from what's held right now (physical mode)
    _physControls(dt) {
      const b = this.b, I = this.game.input, ph = this.phys, now = this.game.clock;
      const held = I.btnHeld || {};
      const fwd = I.down('w') || I.down('arrowup') || !!held.front;
      const back = I.down('s') || I.down('arrowdown') || !!held.back;
      let target = I.pad && I.pad.active ? I.pad.feet : fwd && !back ? 1 : back && !fwd ? -1 : null;
      // before it's bowled you can only press (a trigger movement), not commit
      if (target != null && b.phase === 'runup') target = M.clamp(target, -CFG.PHYS.TRIGGER_MAX, CFG.PHYS.TRIGGER_MAX);
      // ... and a stride can never take you past the ball
      const canFwd = (p) => !(b.phase === 'flight' && b.plan) || now + 0.12 < this.tAt(ph.planeFor(p));
      const locked = !!b.physPending || !!b.resolved || !!b.danced || b.phase === 'done';
      ph.stepFeet(dt, target, locked, canFwd);
      if (b.danced && !b.physPending && !b.resolved) {
        // down the track: glide there like a stride
        let z = ph.plane + (CFG.BAT.PLANES.dance - ph.plane) * (1 - Math.exp(-CFG.PHYS.FEET_RATE * 0.8 * dt));
        if (b.plan && b.phase === 'flight' && !(now + 0.12 < this.tAt(z))) z = ph.plane;
        ph.setPlane(z);
        ph.camShift = (z - CFG.BAT.PLANES.stance) * CFG.PHYS.CAM_FOLLOW;
      }
      if (Math.abs(ph.camShift - (ph.camApplied || 0)) > 1e-5) this.game._setCamera();
      // cross-bat hold: events stamp it exactly; this catches anything missed
      const lv = this._crossLevel();
      if (lv !== ph.crossOn) ph.noteCross(performance.now(), lv);
      // How freely your feet let you swing at this ball: the swing meter
      // shows the cap once it has pitched; Club tints your reach by it from
      // release, Grade once it has pitched.
      if (b.plan && b.phase === 'flight' && !b.physPending && !b.resolved) {
        const pitched = this.simAt(now) >= b.plan.T;
        const ff = ph.footFit(b.plan, ph.feet, { spin: this.spin, cross: ph.crossOn, danced: !!b.danced });
        b.physFit = ff.fit;
        b.physCap = pitched ? CLLM.PhysBat.PHYS.MAX_BAT * (0.55 + 0.45 * ff.fit) : null;
        const R = this.diff.physRing;
        b.envFit = R === true || (R === 'late' && pitched) ? ff.fit : null;
      } else if (!b.physPending && !b.resolved) { b.physCap = null; b.envFit = null; }
    }

    _physResolve() {
      const b = this.b, P = b.physPending;
      this.phys.perfX = P.perfX;
      // your feet where you were judged: a label for the pads, LBW and the bowler's notes
      const pJ = this.phys.feetAt(P.tJ);
      if (!b.danced) { b.feetP = pJ; b.foot = pJ > 0.4 ? 'front' : pJ < -0.4 ? 'back' : null; }
      const r = this.phys.resolve(P.tX);
      b.res = r; b.resolved = true;
      this._bestOK();                                   // note the swing power this stroke was played at
      // after the verdict, the swing meter shows the verdict's cap (if any)
      b.physCap = r.physInfo && r.physInfo.capped ? r.physInfo.cap : null;
      this._habit(b.danced ? 'dance' : b.foot || 'stance', r.exitPhi != null ? M.deg(M.wrapAng(r.exitPhi * -this.h)) : 0);
      if (r.contact) { b.tHit = P.tX; if (this.game.input.touch && navigator.vibrate) { try { navigator.vibrate(r.label === 'MIDDLED' ? 25 : 12); } catch (e) { /* ignore */ } } }
      else if (r.kind === 'leave' && !b.leaveAnim) { b.leaveAnim = true; }
    }

    // Pausing mid-verdict: decide it now (the swing is what it was)
    onPause() {
      if (!this.physical) return;
      const b = this.b;
      if (b && b.physPending && !b.resolved) this._physResolve();
      this.phys.noteCross(performance.now(), false);
    }
    onResume() {
      if (this.physical) { this.phys.noteCross(performance.now(), this._crossLevel()); this._bestOK(); }
    }

    // Best scores only count if the whole innings was at standard swing power
    _bestOK() {
      if (this.physical && Math.abs(this.phys.power() - 1) >= 1e-6) this.boosted = true;
      return !this.boosted;
    }

    _nudgeAim(dir) {
      this.keyAim = true;
      const flip = this.game.camMode === 'eye' ? -1 : 1;     // keep "left key = hit to screen-left"
      this.aimPhi = M.wrapAng(this.aimPhi + dir * flip * 15 * D2R);
    }

    // Mouse / touch aim, world-true, relative to the batter's feet on screen.
    updateAim(mx, my, cam) {
      if (this.physical) return;
      if (this.b && this.b.ex) return;          // aim locks on execute
      let anchor = cam.project(V.v(0.15 * this.h, 0.0, 1.1));
      // Batter's-eye view: your feet are below the screen, aim from bottom centre
      if (this.game.camMode === 'eye' || !anchor || anchor.y > cam.h) anchor = { x: cam.w / 2, y: cam.h * 0.92 };
      const dx = mx - anchor.x, dy = my - anchor.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 24) return;                    // dead zone keeps last aim
      this.keyAim = false;
      // World-true aim. Broadcast camera looks toward -z (screen down = toward
      // the bowler, screen right = +x); the batter's-eye camera looks toward +z,
      // so both axes flip.
      this.aimPhi = this.game.camMode === 'eye' ? Math.atan2(-dx, -dy) : Math.atan2(dx, dy);
    }

    // batter-relative aim angle, degrees (+off / -leg)
    aimRel(phi) { return M.deg(M.wrapAng((phi == null ? this.aimPhi : phi) * -this.h)); }

    _commit(foot, t) {
      const b = this.b;
      if (!b || b.ex || b.physPending || b.phase === 'done') return;
      if (foot === 'dance') {
        if (!this.spin) return;
        if (b.foot && b.foot !== 'front') return;
        if (b.phase === 'flight' && this.simAt(t) > b.plan.T * 0.55) return;  // too late to dance
        b.danced = true; b.foot = 'dance'; b.tFoot = t;
        this.batAnim.setFoot('dance', this.game.clock);
        return;
      }
      if (b.foot) return;                        // foot locks on first press
      b.foot = foot; b.tFoot = t;
      if (this.phys && !b.resolved) this.phys.setPlane(CFG.BAT.PLANES[foot]);
      b.footBeforeRelease = b.phase === 'runup';
      this.batAnim.setFoot(foot, this.game.clock);
    }

    _exec(kind, t) {
      const b = this.b;
      if (!b || b.ex || b.resolved || b.phase !== 'flight') return;
      // Swings long after the ball has gone are ignored
      if (t > this.tAt(0) + 0.05) return;
      b.ex = { kind, t, phi: this.aimPhi };
      this._resolve();
    }

    _skip() {
      const b = this.b;
      if (b && b.phase === 'done' && this.game.clock > b.tDone + 0.5) b.tEnd = Math.min(b.tEnd, this.game.clock + 0.05);
    }

    // ---- the contact model ---------------------------------------------------
    _resolve() {
      const b = this.b, D = this.diff, ex = b.ex, plan = b.plan;
      const spin = this.spin;
      const P = CFG.BAT.PLANES;
      const footKey = b.foot || 'stance';
      const plane = footKey === 'dance' ? P.dance : P[footKey];
      const tPlane = this.tAt(plane);
      const tSimPlane = BallPhys.timeAtZ(plan, plane);
      const ballAtPlane = BallPhys.posAt(plan, tSimPlane);
      const off = ballAtPlane.x * -this.h;          // + = off side of middle
      const Lband = b.danced ? lengthBand('spin', Math.max(0, plan.lengthM - 1.8)) : b.band;
      const zone = zoneOf(Lband);
      const a = this.aimRel(ex.phi);
      const fam = ex.kind === 'defend' ? { key: 'defend', name: b.foot === 'back' ? 'Back-foot defence' : 'Forward defence', bat: 'defend' } : family(footKey, a, spin, ballAtPlane.y);
      // timing error (ms): + late
      const calib = (this.game.save.data.settings.calib || 0) / 1000;
      const e = (ex.t + CFG.BAT.SWING_LEAD - calib - tPlane) * 1000;
      const aE = Math.abs(e);

      // --- foot fit
      const ftab = FOOTFIT[spin ? 'spin' : 'pace'];
      let fitFoot;
      if (footKey === 'stance') fitFoot = 0.75;
      else if (footKey === 'dance') fitFoot = plan.lengthM - 1.8 > 6 ? 0.45 : 1.05;
      else fitFoot = ftab[footKey][Lband];
      const lateFeet = b.foot && b.foot !== 'dance' && b.tFoot > tPlane - this.diff.footDeadline;
      const earlySet = b.foot && (b.tFoot <= tPlane - this.diff.earlySet) && fitFoot >= 1;
      if (lateFeet) fitFoot *= 0.75;
      // feet still travelling at the click? (cramped)
      const settled = !b.foot || (ex.t - b.tFoot) >= CFG.BAT.FOOT_TRAVEL * 0.6;

      // --- shot fit
      let fitShot = (SHOTFIT[fam.key] || SHOTFIT.drive)[zone];
      const lb = lineBand(off);
      const notes = [];
      if (fam.key === 'drive') { if (lb === 'leg') { fitShot *= 0.6; notes.push('driving across the line'); } if (lb === 'wide') fitShot *= 0.8; }
      if (fam.key === 'sqdrive') { if (lb === 'stumps' || lb === 'leg') { fitShot *= 0.6; notes.push('no width to go square'); } }
      if (fam.key === 'flick') { if (lb === 'channel') { fitShot *= 0.6; notes.push('across the line'); } if (lb === 'wide') { fitShot *= 0.35; notes.push('way across the line'); } }
      if (fam.key === 'glance') { if (lb !== 'leg' && lb !== 'stumps') { fitShot *= 0.5; notes.push('nothing on the pads'); } }
      if (fam.key === 'sweep') { if (lb === 'wide') fitShot *= 0.5; if (ballAtPlane.y > 0.7) { fitShot *= 0.6; notes.push('too much bounce to sweep'); } }
      if (fam.key === 'punch') { if (lb === 'leg') fitShot *= 0.6; }
      if (fam.key === 'cut') { if (lb === 'stumps') { fitShot *= 0.55; notes.push('too close to cut'); } if (lb === 'leg') { fitShot *= 0.3; notes.push('no room to cut'); } }
      if (fam.key === 'pull') { if (lb === 'wide') fitShot *= 0.5; if (ballAtPlane.y > 1.55 && ex.kind !== 'loft') { fitShot *= 0.7; notes.push('too high to pull down'); } }
      // Against the turn (spin) when lofting
      const turningAway = plan.moveAway > 0.06, turningIn = plan.moveAway < -0.06;
      if (spin && ex.kind === 'loft' && ((turningAway && a < -20) || (turningIn && a > 40))) { fitShot *= 0.85; notes.push('lofting against the turn'); }

      // --- delivery multiplier
      let mult = 1;
      const nm = plan.lengthName;
      if (b.toss) mult = 1.4;
      else if (nm === 'half-volley' || nm === 'long hop') mult = 1.25;
      else if (nm === 'bouncer') mult = 0.8;
      else if (nm === 'yorker') mult = 0.7;
      if (spin && Math.abs(plan.post.vx - plan.vxB) > 1.35) mult *= 0.85;

      let K = mult * fitFoot * fitShot;
      if (earlySet) K *= 1.15;
      if (ex.kind === 'loft') K *= 0.75;
      if (ex.kind === 'defend') K *= 1.5;
      if (!settled) K *= 0.8;
      K *= Math.pow(b.flight / (spin ? 1.32 : 1.0), 0.15);
      if (this.game.input.touch) K *= 1.15;
      K = M.clamp(K, 0.3, 1.8);
      const W = D.win;
      const Pw = W.P * K, Gw = W.G * K, Ew = W.E * K;
      let cls = aE <= Pw ? 3 : aE <= Gw ? 2 : aE <= Ew ? 1 : 0;
      let thin = aE > (Gw + Ew) / 2;
      const why = [];

      // --- height caps (can't be better than an edge)
      const hgt = ballAtPlane.y;
      let capNote = null;
      if ((fam.key === 'drive' || fam.key === 'sqdrive' || fam.key === 'flick') && hgt > 0.95) capNote = 'fended at it — too high to drive';
      if ((fam.key === 'cut' || fam.key === 'pull') && hgt < 0.33) capNote = 'too low for a cross-bat shot';
      if (fam.key === 'sweep' && hgt > 0.75) capNote = 'bounced over the sweep';
      if (fam.key === 'defend' && hgt > 1.5) capNote = 'fending at a bouncer';
      // (a perfectly timed stroke is capped at a THICK edge — never out)
      let safeEdge = false;
      if (capNote && cls > 1) { thin = cls === 2 && (hgt > 1.2 || fam.key === 'cut'); if (cls === 3) safeEdge = true; cls = 1; why.push(capNote); }

      // --- late movement: the batter's bat line locks a fixed PHYSICAL time
      // before contact (~human reaction). He expects the bowler's stock
      // movement (a spinner's stock turn), so only the SURPRISE counts:
      // seam off the pitch, an arm ball that doesn't turn, a googly...
      const sLock = Math.max(0, tSimPlane - D.blind);
      let dx = 0;
      if (sLock < tSimPlane) {
        const pL = BallPhys.posAt(plan, sLock), vL = BallPhys.velAt(plan, sLock);
        let pred = pL.x + vL.x * (tSimPlane - sLock);
        if (sLock < plan.T && spin) {
          // Playing WITH the turn means you read it (from the hand or the
          // flight): you're ready for exactly what it does.
          const actualTurn = plan.post.vx - plan.vxB;
          const readIt = ex.kind !== 'defend' && Math.abs(plan.moveAway) > 0.06 && Math.abs(a) > 15 && Math.sign(a) === Math.sign(plan.moveAway);
          const stock = Deliveries.VARIATIONS[this.type][0];
          const expTurn = readIt ? actualTurn : (stock.turn || 0) * D.move * 0.6;
          pred += expTurn * Math.max(0, tSimPlane - plan.T);   // no turn before it pitches
          b.readTurn = readIt;
        }
        dx = (ballAtPlane.x - pred) * -this.h;   // + = moved away (toward off)
      }
      const tol = D.lateTol + (fam.key === 'defend' ? 0.03 : 0);
      let lateMove = false;
      const timingCls = aE <= Pw ? 3 : cls;
      if (Math.abs(dx) > tol && cls > 0) {
        lateMove = true;
        // Late movement costs ONE grade at most and can never beat the bat.
        cls = Math.max(1, cls - 1);
        if (cls === 1) thin = timingCls === 2 ? Math.abs(dx) > tol + 0.045 : thin;
        // Invariant: perfectly timed shots are never out — a sideways edge
        // off a middled swing is a thick edge that runs away for runs.
        if (timingCls === 3 && cls === 1) { safeEdge = true; thin = false; }
      }
      // Feet: dance that misses = stumped; LBW possible only from the pad
      const res = {
        cls, e, aE, K, Pw, Gw, Ew, fam, foot: footKey, fitFoot, fitShot, mult, earlySet, lateFeet, settled,
        dx, lateMove, thin, a, off, hgt, zone, band: Lband, why, notes, kind: ex.kind, tPlane, plane, capNote, safeEdge,
        pure: cls === 3 && aE <= Pw * 0.5 && fitFoot >= 1 && fitShot >= 1,
        perfect: aE <= Pw,            // perfectly timed: can never be out
      };
      this._outcome(res);
      b.res = res;
      b.resolved = true;
      // Visual contact time: warp the swing so bat meets ball on any contact
      if (res.contact) {
        b.tHit = Math.max(tPlane, ex.t + 0.03);
        const pHit = this.posAtReal(b.tHit);
        let C = pHit;
        if (this.batter.mirror) C = V.v(-C.x, C.y, C.z);
        const uW = Field.dir(res.exitPhi != null ? res.exitPhi : ex.phi);
        let u = V.v(uW.x, 0, uW.z);
        if (this.batter.mirror) u = V.v(-u.x, 0, u.z);
        this.batAnim.playShot(BatterAnim.makeShot(fam.bat === 'defend' ? 'defend' : (ex.kind === 'loft' && fam.bat === 'drive' ? 'loft' : fam.bat), C, V.norm(u), b.tHit, Math.max(0.06, b.tHit - ex.t)));
      } else {
        // a genuine miss: the bat goes where the batter expected
        const tc = ex.t + CFG.BAT.SWING_LEAD;
        let C = V.v(off * -this.h * 0.6 + 0.02 * -this.h, M.clamp(hgt, 0.2, 1.2), plane);
        if (this.batter.mirror) C = V.v(-C.x, C.y, C.z);
        const uW = Field.dir(ex.phi);
        let u = V.v(uW.x, 0, uW.z);
        if (this.batter.mirror) u = V.v(-u.x, 0, u.z);
        this.batAnim.playShot(BatterAnim.makeShot(fam.bat, C, V.norm(u), tc, CFG.BAT.SWING_LEAD));
      }
      this._habit(footKey, a);
      this.timingLog.push(M.clamp(e, -200, 200));
      if (this.timingLog.length > 20) this.timingLog.shift();
    }

    // Remember the batter's habits (last 10 swings) so the bowler can adapt
    _habit(foot, a) {
      this.habitLog = this.habitLog || [];
      this.habitLog.push({ foot, a });
      if (this.habitLog.length > 10) this.habitLog.shift();
      const L = this.habitLog;
      this.ai.habits = {
        n: L.length,
        front: L.filter((x) => x.foot === 'front' || x.foot === 'dance').length,
        back: L.filter((x) => x.foot === 'back').length,
        off: L.filter((x) => x.a > 20).length,
        leg: L.filter((x) => x.a < -20).length,
      };
    }

    // Stumps / pad checks for a ball that isn't hit (or is edged on)
    _stumpsCheck() {
      const plan = this.b.plan;
      const t0 = BallPhys.timeAtZ(plan, 0);
      const p = BallPhys.posAt(plan, t0);
      const hit = Math.abs(p.x) <= 0.15 && p.y <= 0.75;
      return { hit, p, missBy: Math.max(0, Math.abs(p.x) - 0.15), over: p.y > 0.75 };
    }

    _padCheck(footKey, offered) {
      // Is the ball intercepted by the pads, and is it LBW?
      const b = this.b, plan = b.plan;
      const P = CFG.BAT.PLANES;
      let padZ = footKey === 'front' ? 1.95 : footKey === 'back' ? 0.85 : footKey === 'dance' ? 3.3 : 1.3;
      // pad box in batter-relative x (+ = off side of middle stump)
      let box = footKey === 'front' ? [-0.03, 0.1] : footKey === 'back' ? [-0.07, 0.05] : footKey === 'dance' ? [-0.05, 0.07] : [-0.13, 0.0];
      if (this.physical && b.feetP != null && footKey !== 'dance') {
        const p = b.feetP, mix = (A, Z, u) => [M.lerp(A[0], Z[0], u), M.lerp(A[1], Z[1], u)];
        padZ = this.phys.planeFor(p) - 0.05;
        box = p >= 0 ? mix([-0.13, 0.0], [-0.03, 0.1], p) : mix([-0.13, 0.0], [-0.07, 0.05], -p);
      }
      const ts = BallPhys.timeAtZ(plan, padZ);
      const pp = BallPhys.posAt(plan, ts);
      const xo = pp.x * -this.h;                 // + off
      const lo = box[0], hi = box[1];
      const onPad = xo >= lo - 0.036 && xo <= hi + 0.036 && pp.y <= 0.58;
      if (!onPad) return { onPad: false };
      const bounceOff = plan.bounce.x * -this.h;
      const pitchedOutsideLeg = !b.toss && bounceOff < -0.13;
      const inLine = Math.abs(xo) <= 0.15 + 0.036;
      const st = this._stumpsCheck();
      const lbw = !pitchedOutsideLeg && (inLine || (!offered && xo > 0)) && st.hit && padZ < 3.0;
      return { onPad: true, lbw, pitchedOutsideLeg, inLine, hitting: st.hit, padZ, ts, xo };
    }

    _outcome(r) {
      const b = this.b, plan = b.plan;
      const spin = this.spin;
      const h = this.h;
      const F = this.field;
      r.runs = 0; r.out = false; r.how = null; r.contact = false; r.call = ''; r.sub = '';
      r.runs = r.runs || 0;
      const power = (r.earlySet ? 1.1 : 1) * (r.lateFeet ? 0.7 : 1) * (r.foot === 'dance' ? 1.15 : 1) * Math.sqrt(M.clamp(r.fitShot, 0.3, 1.2));
      const speedRatio = 0.9 + 0.1 * (plan.kmh / (spin ? 85 : 136));
      const aimPhi = b.ex.phi;
      const relToWorld = (aDeg) => M.wrapAng(aDeg * D2R * -h);   // batter-relative deg -> world phi
      const vertical = ['drive', 'sqdrive', 'flick', 'punch', 'defend', 'glance'].indexOf(r.fam.key) >= 0;

      if (r.kind === 'defend') {
        if (r.cls >= 2) {
          r.contact = true; r.label = 'SOLID'; r.call = r.cls === 3 ? 'Dead bat.' : 'Blocked.';
          r.exitPhi = aimPhi; r.exitSpeed = 3; r.exitLoft = -0.2; r.kindRes = 'block';
          return;
        }
        if (r.cls === 1) return this._edge(r, relToWorld, power, true);
        return this._beaten(r, true);
      }
      if (r.cls === 0) return this._beaten(r, true);
      if (r.cls === 1) return this._edge(r, relToWorld, power, false);

      // MIDDLE / TIMED
      r.contact = true;
      const aimRel = r.a;
      let exitRel;
      if (vertical || r.fam.key === 'cut') exitRel = aimRel + 0.35 * r.e;
      else exitRel = aimRel + 0.35 * r.e * Math.sign(aimRel || -1);   // pull/sweep: late goes finer (away from straight)
      exitRel = M.clamp(exitRel, aimRel - 35, aimRel + 35);
      r.exitPhi = relToWorld(exitRel);
      const loft = r.kind === 'loft';
      if (r.cls === 3) {
        r.label = 'MIDDLED';
        if (loft) {
          r.exitSpeed = 35; r.exitLoft = 0.52;
          const pr = F.project(r.exitPhi, 34, 0.55);
          // A middled loft always clears the rope
          pr.runs = 6; pr.out = false; pr.kind = 'six'; pr.how = 'six';
          const d = Field.dir(r.exitPhi); const bd = Field.boundaryDist(d.x, d.z);
          pr.path = [{ x: 0, z: 0 }, { x: d.x * bd * 1.1, z: d.z * bd * 1.1 }];
          F.last = pr;
          this._applyProjection(r, pr);
        } else {
          r.exitSpeed = 32 * power * speedRatio * (r.pure ? 1.12 : 1); r.exitLoft = 0.04;
          const pr = F.project(r.exitPhi, r.exitSpeed, 0, { pure: r.pure });
          this._applyProjection(r, pr);
        }
      } else {
        r.label = 'TIMED';
        if (loft) {
          r.exitSpeed = 26 * power; r.exitLoft = 0.55;
          const pr = F.project(r.exitPhi, r.exitSpeed, 0.55);
          this._applyProjection(r, pr);
        } else {
          r.exitSpeed = 23 * power * speedRatio; r.exitLoft = 0.03;
          const pr = F.project(r.exitPhi, r.exitSpeed, 0);
          this._applyProjection(r, pr);
        }
      }
    }

    _applyProjection(r, pr) {
      // Invariant: a perfectly timed stroke is never out. If late movement
      // took it in the air to a fielder, it falls safe instead.
      if (r.perfect && pr.out) {
        pr.out = false; pr.how = 'gap'; pr.fielder = null;
        pr.runs = pr.airborne ? 2 : 1; pr.kind = 'runs';
      }
      r.proj = pr;
      r.runs = pr.runs;
      r.out = !!pr.out;
      const where = this.field.regionName(pr.phi);
      if (pr.out) {
        r.how = 'caught';
        r.call = `Caught at ${pr.fielder}!`;
        r.sub = r.kind === 'loft' ? `Went for the big one — didn't get enough of it` : 'In the air, straight to him';
      } else if (pr.kind === 'six') {
        r.call = 'SIX!'; r.sub = `Launched ${where}`;
      } else if (pr.kind === 'four') {
        r.call = 'FOUR!'; r.sub = `Crunched ${where}`;
      } else if (pr.kind === 'stopped') {
        r.call = pr.fielder ? `Straight to ${pr.fielder}` : 'No run'; r.sub = where;
      } else {
        r.call = r.runs === 1 ? 'Single' : `${r.runs} runs`;
        r.sub = pr.fielder ? `${where} — ${pr.fielder} cuts it off` : `Into the gap ${where}`;
      }
    }

    _edge(r, relToWorld, power, defending) {
      const spin = this.spin;
      const F = this.field;
      const early = r.e < 0;
      const vertical = ['drive', 'sqdrive', 'flick', 'punch', 'defend', 'glance'].indexOf(r.fam.key) >= 0;
      r.contact = true;
      r.label = 'EDGED';
      let type;
      if (r.lateMove) type = r.dx > 0 ? 'outside' : 'inside';
      else if (r.capNote) type = r.fam.key === 'cut' || r.fam.key === 'pull' ? 'bottom' : 'top';
      else if (vertical) type = early ? 'leading' : 'outside';
      else if (r.fam.key === 'cut') type = early ? 'chop' : 'outside';
      else type = early ? 'uppish' : 'top';
      if (r.capNote && vertical) type = 'glove';
      r.edgeType = type;
      const thin = r.thin && !r.safeEdge;
      const st = this._stumpsCheck();
      let pr;
      if (type === 'outside') {
        if (thin) {
          // Thin edge: it keeps most of its pace and flies behind square.
          const cord = this._cordon(r, defending);
          r.exitPhi = cord.phi; r.exitSpeed = cord.v; r.exitLoft = 0.15;
          pr = cord.pr;
          r.sub = r.lateMove ? `${Deliveries.describeMove(this.b.plan) || 'moved'} late — found the edge` : 'Late on it — thin edge';
        } else {
          const rel = 128 + (r.aE % 7) * 2;
          r.exitPhi = relToWorld(rel); r.exitSpeed = defending ? 9 : 15; r.exitLoft = 0.02;
          pr = F.project(r.exitPhi, r.exitSpeed, 0);
          r.sub = 'Thick edge down to third man';
        }
      } else if (type === 'inside') {
        if (thin && st.hit && Math.abs(st.p.x) < 0.085) {
          r.out = true; r.how = 'bowled'; r.call = 'Played on!';
          r.sub = `${Deliveries.describeMove(this.b.plan) || 'Came back in'} — inside edge onto the stumps`;
          r.exitPhi = relToWorld(-10); r.exitSpeed = 4; r.exitLoft = -0.1;
          r.playedOn = true;
          return;
        }
        const shortLeg = F.players.find((p) => p.name === 'short leg');
        if (thin && shortLeg && (defending || r.foot === 'front')) {
          r.out = true; r.how = 'caught'; r.call = 'Bat-pad — caught at short leg!';
          r.sub = 'Inside edge, onto the pad, and popped up';
          r.exitPhi = relToWorld(-100); r.exitSpeed = 5; r.exitLoft = 0.9;
          this.field.last = { path: [{ x: 0, z: 0 }, { x: shortLeg.x, z: shortLeg.z }], out: true, kind: 'caught', airborne: true };
          return;
        }
        r.exitPhi = relToWorld(-160); r.exitSpeed = 10; r.exitLoft = 0.02;
        pr = F.project(r.exitPhi, 10, 0);
        r.sub = 'Inside edge past the stumps';
      } else if (type === 'leading' || type === 'uppish') {
        const rel = type === 'leading' ? r.a + 30 : r.a - 15 * Math.sign(r.a || 1);
        r.exitPhi = relToWorld(rel); r.exitSpeed = 14; r.exitLoft = 0.6;
        pr = F.project(r.exitPhi, thin ? 15 : 12, thin ? 0.6 : 0.45);
        r.sub = type === 'leading' ? 'Early on the shot — leading edge' : 'Through it too early — in the air';
      } else if (type === 'chop') {
        if (thin && (st.hit || Math.abs(r.off) < 0.25)) {
          r.out = true; r.how = 'bowled'; r.call = 'Chopped on!';
          r.sub = 'Too close to cut — dragged it onto the stumps';
          r.exitPhi = relToWorld(-5); r.exitSpeed = 4; r.exitLoft = -0.1; r.playedOn = true;
          return;
        }
        r.exitPhi = relToWorld(100); r.exitSpeed = 8; r.exitLoft = -0.05;
        pr = F.project(r.exitPhi, 8, 0);
        r.sub = 'Bottom edge into the ground';
      } else if (type === 'bottom') {
        if (thin && st.hit) {
          r.out = true; r.how = 'bowled'; r.call = 'Bowled!';
          r.sub = 'Kept low — under the cross bat';
          r.exitPhi = relToWorld(0); r.exitSpeed = 3; r.exitLoft = -0.1; r.playedOn = true;
          return;
        }
        r.exitPhi = relToWorld(r.a * 0.5); r.exitSpeed = 6; r.exitLoft = -0.05;
        pr = F.project(r.exitPhi, 6, 0);
        r.sub = 'Bottom edge';
      } else if (type === 'glove') {
        const rel = 175;
        r.exitPhi = relToWorld(rel); r.exitSpeed = 12; r.exitLoft = 0.5;
        pr = thin ? F.project(r.exitPhi, 12, 0.5) : F.project(relToWorld(150), 8, 0.1);
        r.sub = 'Couldn’t get on top of the bounce';
      } else {
        // top edge
        const rel = r.a > 0 ? 165 : -160;
        r.exitPhi = relToWorld(rel); r.exitSpeed = 19; r.exitLoft = 1.0;
        pr = F.project(r.exitPhi, thin ? 20 : 16, 0.95);
        r.sub = 'Top edge — skied';
      }
      if (pr && r.safeEdge && pr.out) {
        // a middled swing is never out: the edge runs away safely
        pr.out = false; pr.kind = 'runs'; pr.runs = 1; pr.how = 'gap';
      }
      if (pr) {
        const sub = r.sub;
        this._applyProjection(r, pr);
        r.sub = sub + (pr.out ? '' : r.runs ? ` — ${r.runs === 4 ? 'four' : r.runs + (r.runs === 1 ? ' run' : ' runs')}` : '');
        if (pr.out) r.call = `Caught${pr.fielder ? ' — ' + pr.fielder : ''}!`;
        if (!pr.out && pr.kind !== 'four') r.call = r.runs ? `Edged — ${r.runs}` : 'Edged';
        if (!pr.out && pr.kind === 'four') r.call = 'Edged — FOUR';
      }
    }

    // Thin outside edge vs the keeper / slips / gully. Direction comes from
    // how thin it was (thinner = finer); it's caught if a catcher stands on
    // that line and the ball carries to him, otherwise it runs away.
    _cordon(r, defending) {
      const b = this.b, plan = b.plan, F = this.field, h = this.h;
      const D = this.diff;
      let frac;
      if (r.lateMove) frac = M.clamp((Math.abs(r.dx) - D.lateTol) / 0.06, 0, 1);
      else frac = M.clamp((r.aE - (r.Gw + r.Ew) / 2) / Math.max(1, r.Ew - (r.Gw + r.Ew) / 2), 0, 1);
      const rel = 146 + 32 * frac;                           // 146 (squarer) .. 178 (very fine)
      const phi = M.wrapAng(rel * D2R * -h);
      const tS = BallPhys.timeAtZ(plan, r.plane);
      const vb = V.len(BallPhys.velAt(plan, tS));
      const v = vb * (defending ? 0.55 : 0.8);
      const h0 = M.clamp(BallPhys.posAt(plan, tS).y, 0.3, 1.4);
      const loft = 0.15, vh = v * Math.cos(loft), vy = v * Math.sin(loft);
      const yAt = (d) => { const t = d / vh; return h0 + vy * t - 4.905 * t * t; };
      const dir = Field.dir(phi);
      let catcher = null;
      for (const p of F.players) {
        if (!/keeper|slip|gully/.test(p.name)) continue;
        const along = p.x * dir.x + p.z * dir.z;
        if (along <= 0) continue;
        const perp = Math.abs(p.x * dir.z - p.z * dir.x);
        // Close in (standing up to spin) there's no time to move: small reach
        const dist = Math.hypot(p.x, p.z);
        const reach = Math.min(p.name === 'keeper' ? 1.8 : 1.5, 0.3 + 0.11 * dist);
        const y = yAt(along);
        if (perp <= reach && y > 0.08 && y < 2.4) { catcher = p; break; }
      }
      let pr;
      if (catcher) {
        pr = { runs: 0, out: true, how: 'caught', fielder: catcher.name, kind: 'caught', airborne: true, phi,
          path: [{ x: 0, z: 0 }, { x: catcher.x, z: catcher.z }] };
      } else {
        // through the cordon (or falls short): ground ball to third man
        pr = F.project(phi, v * 0.7, 0);
        if (defending && pr.runs === 4) { pr.runs = 2; pr.kind = 'runs'; }
      }
      F.last = pr;
      return { phi, v, pr };
    }

    _beaten(r, offered) {
      const b = this.b;
      r.label = offered ? 'BEATEN' : 'LEFT';
      if (r.foot === 'dance' && b.danced) {
        r.out = true; r.how = 'stumped'; r.call = 'Stumped!'; r.sub = 'Down the track and missed it';
        return;
      }
      const pad = this._padCheck(r.foot, offered);
      const st = this._stumpsCheck();
      if (pad.onPad) {
        r.padHit = pad;
        if (pad.lbw) {
          r.out = true; r.how = 'lbw'; r.call = 'LBW!'; r.sub = 'Pitched in line, hit in line, hitting the stumps';
          return;
        }
        r.call = offered ? 'Beaten — hit on the pad' : 'Padded away';
        r.sub = pad.pitchedOutsideLeg ? 'Pitched outside leg — not out' : !pad.hitting ? 'Going over / missing — not out' : 'Outside the line';
        return;
      }
      if (st.hit) {
        r.out = true; r.how = 'bowled';
        r.call = offered ? 'BOWLED!' : 'Bowled — shouldered arms!';
        r.sub = offered ? 'Through the gate' : 'Left one that was hitting';
        r.stumps = st;
        return;
      }
      if (st.over && b.plan.lengthName === 'bouncer') { r.call = offered ? 'Swung and missed the bouncer' : 'Ducked under it'; r.sub = ''; return; }
      const cm = Math.round(st.missBy * 100);
      r.call = offered ? 'Played and missed' : 'Well left';
      r.sub = st.over ? 'Over the top of the stumps' : `Missing ${st.p.x * -this.h > 0 ? 'off' : 'leg'} by ${cm} cm`;
    }

    // Leave: resolved when the ball reaches the stumps without a swing
    _resolveLeave() {
      const b = this.b;
      b.resolved = true;
      const r = { cls: 0, e: null, fam: { key: 'leave', name: 'Leave' }, foot: b.foot || 'stance', kind: 'leave', notes: [], why: [], a: 0, runs: 0, out: false, contact: false };
      this._beaten(r, false);
      b.res = r;
      if (!b.leaveAnim) this.batAnim.playShot(BatterAnim.makeShot('leave', V.v(0, 1, 1), V.v(0, 0, 1), this.game.clock + 0.12));
    }

    // ---- per-frame ------------------------------------------------------------
    update(dt) {
      const now = this.game.clock;
      const b = this.b;
      if (!b) return;
      // Bowler
      this.bowlAnim.pose(now);
      if (this.phys) { this._physControls(dt); this.phys.update(); }
      const d = cam => 0;
      // Fade the bowler when he's right on top of the camera
      const dep = this.game.cam.depth(this.bowler.J.pel);
      this.bowler.alpha = M.clamp((dep - 1.8) / 3.5, 0, 1);

      if (b.phase === 'runup' && now >= b.tRelease) {
        b.phase = 'flight';
        this._release();
      }
      if (b.phase === 'flight' || b.phase === 'done') {
        // Ball: delivery path until contact, then free flight
        if (b.plan && this.ball.mode === 'delivery') {
          const Pp = b.physPending;
          if (!(this.physical && Pp && Pp.frozen && !b.resolved)) {    // frozen: hold it ON the crossing
            const simT = this.simAt(now);
            const prevT = this.ball.t;
            this.ball.update(Math.max(0, simT - prevT));
          }
          // Physical bat: decide the instant the ball crosses your hitting plane
          if (this.physical && !b.resolved && !b.physPending && now >= this.tAt(this.phys.plane)) {
            // The ball has reached your hitting plane. You'll SEE that a
            // frame or two from now, so the bat is judged then (tJ); freeze
            // on the crossing until those samples (plus a little
            // follow-through) are in. Bat nowhere near it = a leave, decide now.
            const tX = this.tAt(this.phys.plane);
            const perfX = this.game.perfAt(tX), L = this.phys.latency();
            b.physPending = { tX, perfX, tJ: perfX + L, rt: this.game.realTime || 0, wait: (L + 60) / 1000 };
            if (this.phys.shouldFreeze()) {
              b.physPending.frozen = true;
              this.game.hitStop(b.physPending.wait + 0.02, 0, 1);
              const tc = BallPhys.timeAtZ(b.plan, this.phys.plane);
              this.ball.t = tc; this.ball.pos = BallPhys.posAt(b.plan, tc);
              if (this.ball.trail.length) this.ball.trail[this.ball.trail.length - 1] = V.copy(this.ball.pos);
            }
          }
          if (this.physical && b.physPending && !b.resolved && (this.game.realTime || 0) >= b.physPending.rt + b.physPending.wait) this._physResolve();
          // Contact visual
          if (b.res && b.res.contact && !b.hitDone && now >= b.tHit) this._doHit();
          // Pad / stumps interactions for unhit balls
          if (b.res && !b.res.contact && !b.hitDone) this._missVisual(now);
          // No swing: shoulder arms just before the ball arrives, and the
          // verdict comes when it reaches the pads (or the stumps).
          if (!this.physical && !b.resolved && !b.ex) {
            const fk = b.foot || 'stance';
            const plane = fk === 'dance' ? CFG.BAT.PLANES.dance : CFG.BAT.PLANES[fk];
            if (!b.leaveAnim && now >= this.tAt(plane) - 0.12) {
              b.leaveAnim = true;
              this.batAnim.playShot(BatterAnim.makeShot('leave', V.v(0, 1, 1), V.v(0, 0, 1), this.tAt(plane)));
            }
            const pad = this._padCheck(fk, false);
            if ((pad.onPad && now >= this.tAt(pad.padZ)) || now >= this.tAt(0)) this._resolveLeave();
          }
          if (this.ball.pos.z < -2.4 && b.resolved) { this.ball.mode = 'dead'; }
        } else if (this.ball.mode === 'free') {
          // Easy levels slow the delivery down; once it's hit, ease the ball
          // back up to real speed so the shot itself isn't floaty.
          const k = b.tHit != null ? M.clamp((now - b.tHit) / 0.15, 0, 1) : 0;
          this.ball.update(dt * M.lerp(b.tsc || 1, 1, k));
        }
        if (b.resolved && b.phase === 'flight' && this._resultReady(now)) this._finishBall();
      }
      if (this.stumpsFx) updateStumpsFx(this.stumpsFx, dt);
      this.batAnim.pose(now, V.v(-0.4 * (this.batter.mirror ? -1 : 1), 1.6, 19));
      // Batter's-eye camera: ghost the body so it doesn't block the view
      const eye = this.game.camMode === 'eye';
      this.batter.alpha = this.physical ? 0.07 : eye ? 0.12 : 1;
      this.batter.batAlpha = eye ? 0.95 : 0;
      if (b.phase === 'done' && now >= b.tEnd) this._nextBall();
    }

    // Show the result once the audience can see it: at bat contact, or when
    // the ball reaches the pad / stumps.
    _resultReady(now) {
      const b = this.b, r = b.res;
      if (r.contact) return b.hitDone && now >= b.tHit + 0.04;
      return b.hitDone || now >= this.tAt(0) + 0.08;
    }

    _doHit() {
      const b = this.b, r = b.res;
      b.hitDone = true;
      const pos = this.posAtReal(b.tHit);          // exactly where bat met ball
      const d = Field.dir(r.exitPhi);
      const sp = r.exitSpeed || 5;
      const loft = r.exitLoft || 0;
      const vel = r.exitVel ? V.copy(r.exitVel) : V.v(d.x * sp * Math.cos(loft), Math.max(-2, sp * Math.sin(loft)), d.z * sp * Math.cos(loft));
      if (r.kindRes === 'block') { vel.x *= 0.6; vel.z = Math.abs(vel.z) * 0.6 + 1.2; vel.y = -0.5; }
      if (r.playedOn) { vel.x = -pos.x * 2; vel.z = -3; vel.y = -0.5; }
      this.ball.free(pos, vel, 0);
      this.ball.update(Math.max(0, this.game.clock - b.tHit) * (b.tsc || 1));   // catch up the frame overshoot
      const q = r.label === 'MIDDLED' ? 1 : r.label === 'TIMED' ? 0.6 : 0.2;
      Audio.bat(q, r.label === 'EDGED' ? 'edge' : r.kindRes === 'block' ? 'defend' : 'middle');
      if (r.label === 'MIDDLED') { this.game.hitStop(0.06, 0.45, 0.35); this.game.cam.shake = 0.25; }
      if (r.playedOn) this._breakStumps(pos.x);
      this.game.ui.fieldShot(r.proj || this.field.last, true);
    }

    _missVisual(now) {
      const b = this.b, r = b.res;
      const z = this.ball.pos.z;
      if (r.padHit && r.padHit.onPad && z <= r.padHit.padZ + 0.02) {
        b.hitDone = true;
        const pos = V.copy(this.ball.pos);
        this.ball.free(pos, V.v(M.rand(-1, 1), 0.8, 1.5), 0);
        Audio.pad();
        return;
      }
      if (z <= 0.05) {
        b.hitDone = true;
        if (r.out && r.how === 'bowled') {
          this._breakStumps(this.ball.pos.x);
          const pos = V.copy(this.ball.pos);
          const v = BallPhys.velAt(b.plan, this.ball.t);
          this.ball.free(pos, V.v(v.x * 0.3, Math.abs(v.y) * 0.2 + 0.5, v.z * 0.35), 0);
        } else {
          // continue into the back net
          const pos = V.copy(this.ball.pos);
          const v = BallPhys.velAt(b.plan, this.ball.t);
          this.ball.free(pos, v, 0);
        }
      }
    }

    _breakStumps(x) {
      this.stumpsFx = makeStumpsFx(x, 1);
      Audio.stumps();
      this.game.cam.shake = 0.35;
    }

    _ballEvent(ev, p, x) {
      if (ev === 'bounce') Audio.bounce(this.spin ? 0.5 : 0.9);
      else if (ev === 'net') Audio.net(x);
      else if (ev === 'ground') Audio.bounce(Math.min(1, x / 8));
    }

    _finishBall() {
      const b = this.b, r = b.res;
      b.phase = 'done';
      b.tDone = this.game.clock;
      this.balls++; this.totalBalls++;
      const st = this.game.save.data.stats;
      st.batBalls++;
      let tag;
      if (r.out) {
        tag = 'W';
        const score = this.runs, balls = this.balls;
        this.innings.unshift({ runs: score, balls, how: r.how });
        if (this.innings.length > 6) this.innings.pop();
        st.batOuts++;
        const best = this.game.save.best('bat', this.diff.key, this.bestKey, this.hand);
        const isBest = score > best.runs && this._bestOK();
        if (isBest) this.game.save.setBest('bat', this.diff.key, this.bestKey, this.hand, { runs: score, balls });
        r.innings = { runs: score, balls, isBest };
        Audio.groan();
        b.tEnd = b.tDone + CFG.BAT.GAP_AFTER_OUT;
        this.recent.push('W');
      } else {
        r.runs = r.runs || 0;
        this.runs += r.runs;
        st.batRuns += r.runs;
        if (r.runs === 4) { this.fours++; st.fours++; }
        if (r.runs === 6) { this.sixes++; st.sixes++; }
        if (r.runs >= 4) Audio.cheer(r.runs === 6);
        tag = r.runs ? String(r.runs) : '·';
        this.recent.push(tag);
        b.tEnd = b.tDone + CFG.BAT.GAP_AFTER + (r.runs >= 4 ? 0.4 : 0);
        const best = this.game.save.best('bat', this.diff.key, this.bestKey, this.hand);
        if (this.runs > best.runs && this._bestOK()) this.game.save.setBest('bat', this.diff.key, this.bestKey, this.hand, { runs: this.runs, balls: this.balls });
        if (r.runs >= 4 && r.proj) this.stint.push(r.proj.phi);
      }
      if (this.recent.length > 8) this.recent.shift();
      this.game.save.write();
      this.game.ui.ballResult(this, r);
    }

    _nextBall() {
      const b = this.b;
      if (b.res && b.res.out) {
        this.runs = 0; this.balls = 0; this.fours = 0; this.sixes = 0; this.ramp = 0; this.boosted = false;
        this.game.ui.newInnings(this);
      } else {
        // In-session ramp: survive and the bowler steps it up
        if (this.balls > 0 && this.balls % CFG.BAT.RAMP_BALLS === 0 && this.ramp < CFG.BAT.RAMP_MAX) {
          this.ramp++;
          this.game.ui.toast('The bowler steps it up ↑');
        }
      }
      // Captain rule: every 6 balls, plug the gaps you've been hitting (on
      // the field the next ball will use — after any change of bowler)
      const captainDue = this.ballNo % 6 === 0 && this.stint.length;
      this._newBall(0.25);
      if (captainDue) this._captain();
      this.game.ui.score(this);
    }

    _captain() {
      const F = this.field;
      const moved = [];
      const used = new Set();
      for (const phi of this.stint.slice(-2)) {
        let best = null, bd = Infinity;
        for (const p of F.players) {
          if (used.has(p) || p.name === 'keeper' || /slip|short leg|gully/.test(p.name)) continue;
          const ang = Math.atan2(p.x, p.z);
          const dd = Math.abs(M.wrapAng(ang - phi));
          if (dd < bd) { bd = dd; best = p; }
        }
        if (best && bd > 0.08) {
          const r = Math.hypot(best.x, best.z);
          const d = Field.dir(phi);
          best.x = d.x * r; best.z = d.z * r;
          used.add(best);
          moved.push(best.name);
        }
      }
      this.stint = [];
      if (moved.length) this.game.ui.toast(`Captain plugs the gap: ${moved.join(' & ')} moved`);
    }

    // ---- rendering hooks --------------------------------------------------------
    scene() {
      const b = this.b;
      const stumps = [{ z: 0, state: this.stumpsFx }, { z: World.PITCH.LENGTH }];
      return {
        figures: [this.batter, this.bowler],
        ball: this.ball,
        ballOpts: { trail: this.diff.trail },
        stumps,
        extra: (queue, cam) => this._extra(queue, cam),
      };
    }

    // Assist (Club/Grade): once it has pitched, mark where the ball will
    // come through your hitting plane.
    _crossMarker(queue, cam, now) {
      const b = this.b, D = this.diff;
      if (!D.physRing || !b.plan || b.phase !== 'flight' || b.resolved) return;
      const tB = b.tRelease + b.plan.T / b.tsc + (D.physRing === 'late' ? 0.12 : 0);
      if (now < tB) return;
      const P = BallPhys.posAt(b.plan, BallPhys.timeAtZ(b.plan, this.phys.plane));
      const a = M.clamp((now - tB) / 0.12, 0, 1) * (D.physRing === 'late' ? 0.55 : 0.9);
      queue.push({
        z: cam.depth(P) + 0.1,
        draw: (ctx) => {
          const q = cam.project(P); if (!q) return;
          const r = Math.max(6, World.PITCH.BALL_R * q.s * 1.6);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(q.x - r * 1.6, q.y); ctx.lineTo(q.x - r * 0.6, q.y); ctx.moveTo(q.x + r * 0.6, q.y); ctx.lineTo(q.x + r * 1.6, q.y); ctx.stroke();
          ctx.restore();
        },
      });
    }

    _extra(queue, cam) {
      const b = this.b;
      if (!b) return;
      const now = this.game.clock;
      if (this.phys) { this.phys.queue(queue, cam); this._crossMarker(queue, cam, now); }
      // Aim arrow on the ground from the batter's feet
      const aimCol = b.ex ? 'rgba(242,193,78,0.25)' : 'rgba(242,193,78,0.7)';
      const d = Field.dir(this.aimPhi);
      const o = V.v(0.12 * this.h, 0.01, 1.3);
      const len = b.phase === 'done' || this.physical ? 0 : 2.2;
      if (len > 0) {
        const tip = V.add(o, V.v(d.x * len, 0, d.z * len));
        queue.push({
          z: cam.depth(o) + 0.8,
          draw: (ctx) => {
            const a = cam.project(o), t = cam.project(tip);
            if (!a || !t) return;
            ctx.save();
            ctx.strokeStyle = aimCol; ctx.lineWidth = Math.max(2, 0.05 * a.s); ctx.lineCap = 'round';
            ctx.setLineDash([Math.max(4, 0.15 * a.s), Math.max(3, 0.1 * a.s)]);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(t.x, t.y); ctx.stroke();
            ctx.setLineDash([]);
            const ang = Math.atan2(t.y - a.y, t.x - a.x);
            const hs = Math.max(6, 0.14 * t.s);
            ctx.fillStyle = aimCol;
            ctx.beginPath();
            ctx.moveTo(t.x + Math.cos(ang) * hs, t.y + Math.sin(ang) * hs);
            ctx.lineTo(t.x + Math.cos(ang + 2.5) * hs, t.y + Math.sin(ang + 2.5) * hs);
            ctx.lineTo(t.x + Math.cos(ang - 2.5) * hs, t.y + Math.sin(ang - 2.5) * hs);
            ctx.closePath(); ctx.fill();
            ctx.restore();
          },
        });
      }
      // Bounce-spot ring (assist) — appears part-way through the flight
      if (this.diff.ring && b.plan && b.phase !== 'runup') {
        const tr = b.tRelease + this.diff.ring * b.flight * (b.plan.T / BallPhys.timeAtZ(b.plan, 0)) * 1.0;
        const age = now - (b.tRelease + this.diff.ring * (b.plan.T / b.tsc));
        if (age > 0 && age < 0.9) {
          const c = V.v(b.plan.bounce.x, 0.004, b.plan.bounce.z);
          const alpha = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.15) / 0.75);
          queue.push({
            z: cam.depth(c) + 0.6,
            draw: (ctx) => {
              const pts = [];
              for (let i = 0; i < 28; i++) {
                const an = (i / 28) * Math.PI * 2;
                const p = cam.project(V.v(c.x + Math.cos(an) * 0.2, 0.004, c.z + Math.sin(an) * 0.28));
                if (p) pts.push(p);
              }
              if (pts.length < 3) return;
              ctx.save();
              ctx.strokeStyle = `rgba(255,255,255,${0.75 * alpha})`;
              ctx.lineWidth = 2;
              ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
              ctx.restore();
            },
          });
        }
      }
    }
  }

  BattingSession.family = family;
  CLLM.BattingSession = BattingSession;
})();
