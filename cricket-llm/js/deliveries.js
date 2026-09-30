/*
 * DELIVERIES
 * ==========
 * The delivery catalogue for PACE, OFF SPIN and LEG SPIN, plus a builder that
 * turns (type, variation, target, quality) into a ball-flight plan.
 *
 * Movement is fixed to the (right-arm, over the wicket) bowler, in world x:
 *   leg break turns toward -x,  off break toward +x
 *   out-swinger (to a right-hander) toward -x,  in-swinger toward +x
 * For a right-hander -x is the off side ("away"); for a left-hander it's "in".
 *
 * Lines are given in batter terms: offLine metres from middle stump toward
 * the batter's OFF side. Lengths are metres from the batter's stumps.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, BallPhys } = CLLM;

  const KMH = 1 / 3.6;

  // Per-type base parameters
  const TYPES = {
    pace: { name: 'Pace', speed: 136, bounceK: 0.52, paceKeep: 0.88 },
    off:  { name: 'Off spin', speed: 86, bounceK: 0.56, paceKeep: 0.8 },
    leg:  { name: 'Leg spin', speed: 82, bounceK: 0.58, paceKeep: 0.78 },
  };

  /*
   * Variation table. Units:
   *   swingB  lateral metres (world x) swung by the bounce (late, parabolic)
   *   seam    lateral velocity added at the bounce (m/s, world x); 'rand' = random small
   *   turn    lateral velocity added at the bounce (m/s, world x)
   *   drift   constant lateral accel before bounce (m/s^2, world x)
   *   dip     extra downward accel before bounce (m/s^2)
   *   kMul    bounce multiplier, sMul speed multiplier, keepMul pace-off-pitch multiplier
   *   grip    what the "hand read" tell shows
   */
  const VARIATIONS = {
    pace: [
      { key: 'stock',   name: 'Seamer',        seam: 'rand', grip: 'seam upright' },
      { key: 'out',     name: 'Out-swinger',   swingB: -0.13, grip: 'seam to slip', freq: 1 },
      { key: 'in',      name: 'In-swinger',    swingB: 0.12, grip: 'seam to fine leg', freq: 1 },
      { key: 'cutter',  name: 'Off-cutter',    seam: 0.9, sMul: 0.9, grip: 'fingers across seam', freq: 0.6 },
      { key: 'slower',  name: 'Slower ball',   sMul: 0.78, dip: 1.2, grip: 'knuckles', freq: 0.45 },
      { key: 'bouncer', name: 'Bouncer',       sMul: 1.03, kMul: 1.08, grip: 'seam upright', length: 'bouncer', freq: 0.7 },
      { key: 'yorker',  name: 'Yorker',        grip: 'seam upright', length: 'yorker', freq: 0.55 },
    ],
    off: [
      { key: 'stock',   name: 'Off break',     turn: 1.25, drift: -0.9, dip: 1.2, grip: 'seam to slip' },
      { key: 'arm',     name: 'Arm ball',      turn: 0.05, drift: -1.6, sMul: 1.06, kMul: 0.9, keepMul: 1.08, grip: 'seam upright', freq: 0.6 },
      { key: 'doosra',  name: 'Doosra',        turn: -1.1, drift: 0.6, kMul: 1.08, grip: 'back of hand', freq: 0.4 },
      { key: 'top',     name: 'Top-spinner',   turn: 0.1, dip: 3.0, kMul: 1.18, grip: 'seam forward', freq: 0.7 },
    ],
    leg: [
      { key: 'stock',   name: 'Leg break',     turn: -1.5, drift: 1.2, dip: 1.6, grip: 'palm to batter' },
      { key: 'googly',  name: 'Googly',        turn: 1.2, drift: -0.5, sMul: 0.96, kMul: 1.1, dip: 1.8, grip: 'back of hand', freq: 1 },
      { key: 'top',     name: 'Top-spinner',   turn: -0.15, dip: 3.2, kMul: 1.2, grip: 'knuckles forward', freq: 0.8 },
      { key: 'flipper', name: 'Flipper',       turn: 0.05, dip: -0.8, sMul: 1.1, kMul: 0.62, keepMul: 1.12, grip: 'squeezed from under', freq: 0.35 },
      { key: 'slider',  name: 'Slider',        turn: -0.2, drift: 0.4, sMul: 1.04, kMul: 0.85, keepMul: 1.06, grip: 'side of hand', freq: 0.5 },
    ],
  };

  // Length bands (metres from the batter's stumps) by type
  const LENGTHS = {
    pace: { yorker: [0.4, 1.4], full: [2.2, 4.6], good: [5.2, 7.8], back: [7.8, 9.4], short: [9.4, 10.8], bouncer: [10.8, 12.3] },
    spin: { fulltoss: [-1.2, 0.2], full: [0.9, 2.6], good: [2.7, 4.8], short: [5.0, 6.4], longhop: [6.6, 8.2] },
  };

  function lengthName(type, L) {
    if (L < 0.3) return 'full toss';
    // Kept in step with the batting fit bands (batting.js lengthBand)
    if (type === 'pace') {
      if (L < 2.0) return 'yorker';
      if (L < 3.8) return 'half-volley';
      if (L < 5.5) return 'full';
      if (L < 8.0) return 'good length';
      if (L < 9.2) return 'back of a length';
      if (L < 10.0) return 'short';
      return 'bouncer';
    }
    if (L < 1.5) return 'yorker';
    if (L < 2.5) return 'half-volley';
    if (L < 3.5) return 'full';
    if (L < 5.5) return 'good length';
    if (L < 6.8) return 'short';
    return 'long hop';
  }

  // Build a physics plan.
  // spec = { type, varKey, length, offLine, hand:'R'|'L', speedKmh?, quality (0..1, movement amount),
  //          release: V3 }
  function build(spec) {
    const T = TYPES[spec.type];
    const vr = VARIATIONS[spec.type].find((v) => v.key === spec.varKey) || VARIATIONS[spec.type][0];
    const q = spec.quality != null ? spec.quality : 1;
    const offSign = spec.hand === 'L' ? 1 : -1;     // world x of the batter's off side
    const bounce = { x: offSign * spec.offLine, z: spec.length };
    const kmh = (spec.speedKmh || T.speed) * (vr.sMul || 1);
    const speed = kmh * KMH;
    let seam = 0;
    if (vr.seam === 'rand') seam = (spec.seamRand != null ? spec.seamRand : M.gauss() * 0.35) * q;
    else if (vr.seam) seam = vr.seam * q;
    // Swing: jerk that moves swingB metres by the bounce
    const approxT = Math.max(0.15, (spec.release.z - spec.length) / speed);
    const swing = vr.swingB ? (6 * vr.swingB * q) / Math.pow(approxT, 3) : 0;
    const plan = BallPhys.planDelivery({
      release: spec.release,
      bounce,
      speed,
      swing,
      drift: (vr.drift || 0) * q * (spec.driftMul || 1),
      dip: Math.max(-2, (vr.dip || 0)),
      turn: ((vr.turn || 0) * q) + seam,
      bounceK: T.bounceK * (vr.kMul || 1) * (spec.bounceMul || 1),
      paceKeep: Math.min(0.97, T.paceKeep * (vr.keepMul || 1)),
    });
    plan.type = spec.type;
    plan.varKey = vr.key;
    plan.varName = vr.name;
    plan.grip = vr.grip;
    plan.kmh = kmh;
    plan.offLine = spec.offLine;
    plan.lengthM = spec.length;
    plan.lengthName = lengthName(spec.type, spec.length);
    plan.hand = spec.hand;
    // Movement relative to this batter: + = away (toward off side)
    const worldMove = (vr.swingB || 0) * 2.3 + (vr.turn || 0) * 0.2 + seam * 0.15;
    plan.moveAway = worldMove * offSign;
    return plan;
  }

  // Human description of how the ball moved, relative to the batter.
  function describeMove(plan) {
    const m = plan.moveAway;
    if (Math.abs(m) < 0.04) return '';
    const spin = plan.type !== 'pace';
    if (spin) return m > 0 ? 'turned away' : 'turned in';
    if (plan.varKey === 'out' || plan.varKey === 'in') return m > 0 ? 'swung away' : 'swung in';
    return m > 0 ? 'seamed away' : 'nipped back in';
  }

  /*
   * AI bowler for batting mode. Chooses a delivery each ball with intent:
   * stock balls in the corridor, variations, occasional loose balls, and
   * simple set-ups (away, away, away ... then one that comes back).
   */
  class AIBowler {
    constructor(type, diff) {
      this.type = type;
      this.diff = diff;
      this.history = [];
      this.plan = null;       // current set-up plan
    }

    _plans(type, D) {
      const all = type === 'pace' ? [
        { bait: 'out', sucker: 'in', n: 3 },
        { bait: 'stock', sucker: 'yorker', suckerLen: 'yorker', n: 2 },
        { bait: 'bouncer', sucker: 'yorker', suckerLen: 'yorker', n: 1 },
        { bait: 'stock', sucker: 'slower', n: 3 },
      ] : type === 'leg' ? [
        { bait: 'stock', sucker: 'googly', n: 3 },
        { bait: 'stock', sucker: 'flipper', suckerLen: 'good', n: 2 },
      ] : [
        { bait: 'stock', sucker: 'arm', n: 3 },
        { bait: 'stock', sucker: 'doosra', n: 3 },
      ];
      const ok = (k) => k === 'stock' || (D.allow || []).indexOf(k) >= 0;
      return all.filter((p) => ok(p.bait) && ok(p.sucker));
    }

    next(hand, level) {
      const D = this.diff;
      const type = this.type;
      const vars = VARIATIONS[type];
      const spin = type !== 'pace';
      const LB = spin ? LENGTHS.spin : LENGTHS.pace;
      // escalation level (0,1,2..) nudges variation & accuracy
      const lv = level || 0;
      const looseP = Math.max(0.05, D.loose - lv * 0.02);
      const varP = Math.min(0.75, D.variety + lv * 0.05);
      let varKey = 'stock';
      let band = 'good';
      let offLine = M.rand(0.02, 0.28);       // the corridor
      let note = '';

      // Set-up sequences on harder levels
      if (this.plan && this.plan.left > 0) {
        this.plan.left--;
        varKey = this.plan.left === 0 ? this.plan.sucker : this.plan.bait;
        band = this.plan.left === 0 ? this.plan.suckerLen || 'good' : 'good';
        if (this.plan.left === 0) { note = 'setup'; offLine = this.plan.suckerLine != null ? this.plan.suckerLine : M.rand(-0.02, 0.1); this.plan = null; }
      } else if (Math.random() < D.setup && this._plans(type, D).length) {
        // n baits, then the sucker ball
        const s = M.pick(this._plans(type, D));
        this.plan = { bait: s.bait, sucker: s.sucker, suckerLen: s.suckerLen, left: s.n };
        varKey = this.plan.bait;
      } else if (Math.random() < varP) {
        const pool = vars.filter((v) => v.key !== 'stock' && (D.allow || []).indexOf(v.key) >= 0);
        if (pool.length) varKey = M.pickW(pool.map((v) => ({ w: v.freq || 1, key: v.key }))).key;
      }

      const vr = vars.find((v) => v.key === varKey) || vars[0];
      if (vr.length) band = vr.length;
      // Loose balls
      if (Math.random() < looseP && note !== 'setup') {
        const loose = spin
          ? M.pick(['full', 'longhop', 'short', 'fulltoss', 'legside', 'wide'])
          : M.pick(['full', 'short', 'legside', 'wide', 'full']);
        note = 'loose';
        if (loose === 'legside') { offLine = M.rand(-0.45, -0.22); band = 'full'; }
        else if (loose === 'wide') { offLine = M.rand(0.45, 0.7); band = spin ? 'short' : M.pick(['short', 'full']); }
        else band = loose;
        if (band === 'full') band = 'full';
      }
      // Anti-exploit: a batter who always goes forward / back, or always
      // hits one side, gets bowled at (30% of balls) — unless it's a set-up.
      const hb = this.habits;
      if (hb && hb.n >= 8 && note !== 'setup' && Math.random() < 0.3) {
        if (hb.front / hb.n > 0.7) { band = spin ? 'short' : M.pick(['back', 'short', 'bouncer']); note = 'counter'; }
        else if (hb.back / hb.n > 0.7) { band = spin ? 'full' : M.pick(['yorker', 'full']); note = 'counter'; }
        else if (hb.off / hb.n > 0.65) { offLine = M.rand(-0.15, 0.02); note = 'counter'; }
        else if (hb.leg / hb.n > 0.65) { offLine = M.rand(0.3, 0.5); note = 'counter'; }
      }
      if (!LB[band]) band = 'good';
      let length = M.rand(LB[band][0], LB[band][1]);
      // Accuracy scatter
      length += M.gauss() * D.scatterL;
      offLine += M.gauss() * D.scatterX;
      // Pace variation
      const speedKmh = TYPES[type].speed * D.speedMul * (1 + lv * 0.025) + M.gauss() * (spin ? 2 : 3);
      const d = { varKey, length, offLine, speedKmh, note, quality: M.clamp(0.75 + Math.random() * 0.35 + lv * 0.04, 0.6, 1.15) };
      this.history.push(d);
      if (this.history.length > 12) this.history.shift();
      return d;
    }
  }

  CLLM.Deliveries = { TYPES, VARIATIONS, LENGTHS, build, lengthName, describeMove, AIBowler, KMH };
})();
