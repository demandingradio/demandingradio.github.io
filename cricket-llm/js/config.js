/*
 * CONFIG
 * ======
 * Every tuning number that shapes the feel lives here.
 *
 * Batting windows are ± milliseconds of REAL time around the ideal click.
 * Flight times are real seconds from release to the batter's stumps; the ball
 * is simulated at true speed and then time-scaled so swing and turn keep
 * their real shapes.
 */
(function () {
  const CLLM = window.CLLM;

  const DIFFS = {
    club: {
      key: 'club', name: 'Club', blurb: 'Gentle net bowlers. Big timing windows, a bounce marker, plenty of loose balls.',
      flight: { pace: 1.25, spin: 1.6 },
      win: { P: 45, G: 100, E: 165 },
      loose: 0.3, variety: 0.1, setup: 0.0, scatterL: 0.55, scatterX: 0.07, speedMul: 0.93, move: 0.5,
      allow: ['out', 'in', 'bouncer', 'yorker', 'arm', 'googly'],
      tell: { ms: 450, label: true }, ring: 0.28, trail: true, blind: 0.13, lateTol: 0.035, physAssist: 0.05, physRing: true, physMagnet: 0.35, physTimeAssist: 55, physTimeGain: 0.3, physReadFeet: 0,
      footDeadline: 0.35, earlySet: 0.5,
    },
    grade: {
      key: 'grade', name: 'Grade', blurb: 'Proper club cricket. Real variations, fewer freebies.',
      flight: { pace: 1.0, spin: 1.32 },
      win: { P: 30, G: 66, E: 104 },
      loose: 0.2, variety: 0.28, setup: 0.12, scatterL: 0.5, scatterX: 0.06, speedMul: 1.0, move: 0.88,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'arm', 'doosra', 'googly', 'top'],
      tell: { ms: 350, label: true }, ring: 0.42, trail: true, blind: 0.16, lateTol: 0.03, physAssist: 0.02, physRing: 'late', physMagnet: 0.25, physTimeAssist: 28, physTimeGain: 0.55, physReadFeet: 0.35,
      footDeadline: 0.3, earlySet: 0.4,
    },
    state: {
      key: 'state', name: 'State', blurb: 'First-class quality. Subtle tells, late movement, set-ups.',
      flight: { pace: 0.8, spin: 1.12 },
      win: { P: 24, G: 52, E: 88 },
      loose: 0.15, variety: 0.3, setup: 0.14, scatterL: 0.42, scatterX: 0.05, speedMul: 1.04, move: 0.92,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'cutter', 'arm', 'doosra', 'top', 'googly', 'flipper', 'slider'],
      tell: { ms: 250, label: false }, ring: null, trail: false, blind: 0.18, lateTol: 0.028, physAssist: 0.006, physRing: false, physMagnet: 0.1, physTimeAssist: 10, physTimeGain: 0.8, physReadFeet: 0.5,
      footDeadline: 0.26, earlySet: 0.34,
    },
    test: {
      key: 'test', name: 'Test', blurb: 'Close to real pace. You have to read the hand and predict.',
      flight: { pace: 0.62, spin: 0.98 },
      win: { P: 18, G: 40, E: 68 },
      loose: 0.1, variety: 0.4, setup: 0.22, scatterL: 0.36, scatterX: 0.045, speedMul: 1.08, move: 1.0,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'cutter', 'arm', 'doosra', 'top', 'googly', 'flipper', 'slider'],
      tell: { ms: 150, label: false }, ring: null, trail: false, blind: 0.2, lateTol: 0.025, physAssist: 0, physRing: false, physMagnet: 0, physTimeAssist: 0, physTimeGain: 1, physReadFeet: 0.6,
      footDeadline: 0.23, earlySet: 0.3,
    },
  };

  const BAT = {
    SWING_LEAD: 0.1,          // seconds from click to bat reaching the contact plane
    PLANES: { front: 2.0, back: 0.8, stance: 1.4, dance: 3.4, sweep: 1.9 },
    FOOT_TRAVEL: 0.18,        // seconds for the feet to get into position
    // Next ball timing
    GAP_AFTER: 1.9, GAP_AFTER_OUT: 2.8,
    // In-session ramp: every N balls survived the bowler steps it up
    RAMP_BALLS: 8, RAMP_MAX: 4,
  };

  // Bowling (player bowls) — rhythm & release windows, ms
  const BOWL = {
    beats: {
      pace: [440, 410, 385, 365, 348, 335],   // gaps between footfalls (ms)
      off: [470, 470, 470, 470],
      leg: [540, 520, 505, 490],
    },
    beatWin: { pace: [40, 75, 115], off: [50, 90, 130], leg: [50, 95, 140] },   // perfect/good/ok
    loadAfterLast: { pace: 360, off: 320, leg: 280 },   // the bound/pivot beat after the last footfall
    releaseAfterLoad: { pace: 480, off: 520, leg: 560 },
    relWin: { pace: [28, 55, 90], off: [42, 80, 125], leg: [45, 85, 130] },
    lengthErr: { pace: 0.3, off: 0.3, leg: 0.36 },       // metres per "perfect window" of error
    sway: { pace: [0.03, 0.22], off: [0.02, 0.22], leg: [0.035, 0.28] },  // line wobble base + rhythm penalty
    speed: { pace: 138, off: 86, leg: 82 },
  };

  // AI batter skill for bowling mode
  const AIBAT = {
    club:  { key: 'club',  name: 'Club',  skill: 0.3 },
    grade: { key: 'grade', name: 'Grade', skill: 0.56 },
    state: { key: 'state', name: 'State', skill: 0.7 },
    test:  { key: 'test',  name: 'Test',  skill: 0.88 },
  };

  // ---- Physical bat: reach, cross bat, footwork -------------------------------
  const PHYS = {
    BODY_X: 0.2,           // batter's body line (x * h) on the plane
    // Where the sweet spot can go (m). Going back lifts you, striding forward
    // lowers you and lets you reach further outside off. A straight bat only
    // gets to about chest height (the splice above it still makes contact:
    // that's a fend); the cross bat goes from a knee-down sweep to a hook.
    REACH: {
      straight: { lo: { back: 0.10, stance: 0.10, front: 0.10 }, hi: { back: 1.18, stance: 1.05, front: 0.92 } },
      cross:    { lo: { back: 0.45, stance: 0.28, front: 0.08 }, hi: { back: 1.90, stance: 1.75, front: 1.45 } },
      off: { back: 0.90, stance: 1.00, front: 1.15 },   // off side of the body line
      leg: { straight: 0.55, cross: 0.25 },            // leg side (a cross bat can't: the hands are there)
      give: 0.06,          // soft edge: a few cm of give past the limit
    },
    CROSS_IN_MS: 80,       // blade turning horizontal
    CROSS_OUT_MS: 130,     // ... and back upright
    FEET_RATE: 10,         // 1/s: a 0.1 s tap is a short step, a hold a full stride
    // Committing your feet before it's bowled is allowed, but the bowler may
    // see it and change the length (chance per level: DIFFS.physReadFeet)
    COMMIT_EARLY: 0.6,     // |feet| at release that counts as committing
    CAM_FOLLOW: 1,         // the camera comes with your feet (0 = fixed)
    // The standard bat everyone plays with (pause-menu sliders start here;
    // best scores only count at this swing power or less)
    BASE: { power: 0.82, weight: 20, limit: 0 },
    // Shift held: play along the ground - face over the ball, hands ahead,
    // off the face it stays down (edges still fly), a touch less power
    GROUND: { faceDown: 14, maxLaunch: 2, power: 0.92, rampMs: 80 },
    SWEET_BOOST: 0.5,      // a pure middle adds up to this much exit speed (scaled by sweetness^1.5)
    BODY_ALPHA: { legs: 0.28, arms: 0.5, torso: 0.07, head: 0 },    // your batter, seen from just behind (ghosted: the ball comes past it)
    LIMIT_STEPS: [0, 20, 15, 12, 9, 7, 5],   // bat speed limit choices (m/s; 0 = off)
    WEIGHT_STEPS: [0, 60, 45, 35, 25, 20],   // bat weight choices (spring rad/s; 0 = off; lower = heavier)
    // Footwork: how good is it to be right back / on the crease / fully
    // forward, by where it pitched (m from your stumps). Coaching truth:
    // pace - forward to full, back to short, either is OK at good length;
    // spin - right forward or right back, never stuck on the crease.
    FIT: {
      pace: [[0.3, 0.55, 0.90, 1.0], [1.5, 0.45, 0.90, 0.90], [3.0, 0.35, 0.75, 1.0], [5.0, 0.50, 0.80, 1.0],
             [6.5, 0.85, 0.80, 0.90], [7.8, 0.95, 0.80, 0.80], [9.0, 1.0, 0.75, 0.60], [10.5, 1.0, 0.70, 0.45], [13, 1.0, 0.70, 0.45]],
      spin: [[0.3, 0.60, 0.85, 1.0], [1.5, 0.40, 0.70, 1.0], [3.0, 0.45, 0.60, 1.0], [4.2, 0.75, 0.50, 0.95],
             [5.2, 0.95, 0.55, 0.65], [6.2, 1.0, 0.65, 0.45], [9, 1.0, 0.65, 0.45]],
      shapePace: 0.7,      // a small trigger press earns most of the credit vs pace
      shapeSpin: 1.6,      // half-forward to spin earns little
      lateMove: 0.25,      // feet moving this much after your deadline = late
      late: { pace: 0.85, spinBack: 0.95, spinFwd: 0.8 },
      floor: 0.25,
    },
  };

  CLLM.CFG = { DIFFS, BAT, BOWL, AIBAT, PHYS };
})();
