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
      tell: { ms: 450, label: true }, ring: 0.28, trail: true, blind: 0.13, lateTol: 0.035, physAssist: 0.05, physRing: true, physMagnet: 0.35, physTimeAssist: 55, physTimeGain: 0.3,
      footDeadline: 0.35, earlySet: 0.5,
    },
    grade: {
      key: 'grade', name: 'Grade', blurb: 'Proper club cricket. Real variations, fewer freebies.',
      flight: { pace: 1.0, spin: 1.32 },
      win: { P: 30, G: 66, E: 104 },
      loose: 0.2, variety: 0.28, setup: 0.12, scatterL: 0.5, scatterX: 0.06, speedMul: 1.0, move: 0.88,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'arm', 'doosra', 'googly', 'top'],
      tell: { ms: 350, label: true }, ring: 0.42, trail: true, blind: 0.16, lateTol: 0.03, physAssist: 0.02, physRing: 'late', physMagnet: 0.25, physTimeAssist: 28, physTimeGain: 0.55,
      footDeadline: 0.3, earlySet: 0.4,
    },
    state: {
      key: 'state', name: 'State', blurb: 'First-class quality. Subtle tells, late movement, set-ups.',
      flight: { pace: 0.8, spin: 1.12 },
      win: { P: 24, G: 52, E: 88 },
      loose: 0.15, variety: 0.3, setup: 0.14, scatterL: 0.42, scatterX: 0.05, speedMul: 1.04, move: 0.92,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'cutter', 'arm', 'doosra', 'top', 'googly', 'flipper', 'slider'],
      tell: { ms: 250, label: false }, ring: null, trail: false, blind: 0.18, lateTol: 0.028, physAssist: 0.006, physRing: false, physMagnet: 0.1, physTimeAssist: 10, physTimeGain: 0.8,
      footDeadline: 0.26, earlySet: 0.34,
    },
    test: {
      key: 'test', name: 'Test', blurb: 'Close to real pace. You have to read the hand and predict.',
      flight: { pace: 0.62, spin: 0.98 },
      win: { P: 18, G: 40, E: 68 },
      loose: 0.1, variety: 0.4, setup: 0.22, scatterL: 0.36, scatterX: 0.045, speedMul: 1.08, move: 1.0,
      allow: ['out', 'in', 'bouncer', 'yorker', 'slower', 'cutter', 'arm', 'doosra', 'top', 'googly', 'flipper', 'slider'],
      tell: { ms: 150, label: false }, ring: null, trail: false, blind: 0.2, lateTol: 0.025, physAssist: 0, physRing: false, physMagnet: 0, physTimeAssist: 0, physTimeGain: 1,
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

  CLLM.CFG = { DIFFS, BAT, BOWL, AIBAT };
})();
