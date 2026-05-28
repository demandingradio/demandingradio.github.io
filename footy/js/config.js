/*
 * FOOTY CONFIG
 * ============
 * Every tunable number lives here. To iterate on feel, edit this file.
 * Distances are in "field units" — the field is FIELD.WIDTH x FIELD.HEIGHT.
 * The canvas auto-fits the viewport; we render in field units, then scale.
 */
window.FOOTY = window.FOOTY || {};

FOOTY.CONFIG = {

  FIELD: {
    WIDTH:  2000,            // long axis (left-right, goal-to-goal) — 1.25× original
    HEIGHT: 1250,            // short axis (top-bottom)             — 1.25× original
    PADDING: 50,             // visual border between canvas edge and oval
    GOAL_WIDTH: 140,         // gap between the 2 inner goal posts (unchanged)
    BEHIND_WIDTH: 280,       // gap between the 2 outer behind posts
    POST_DEPTH: 70,          // how far the post strokes extend "outward" (visual)
    FIFTY_ARC_RADIUS: 360,   // 50m arc radius from goal-center
    CENTER_CIRCLE_RADIUS: 70,
  },

  PLAYER: {
    RADIUS: 20,
    MAX_SPEED: 320,          // px/sec when chasing
    CARRY_SPEED: 260,        // px/sec when holding the ball (slower)
    ACCEL: 1800,             // how fast players reach max speed
    FRICTION: 10,            // velocity decay/sec when no input
    POSSESSION_RADIUS: 26,   // ball must be within this (on ground) to pick up
    MARK_RADIUS: 36,         // catch radius when ball lands
    PICKUP_COOLDOWN: 0.35,   // after a kick, briefly can't re-grab own ball
    TACKLE_COOLDOWN: 1.5,    // after losing ball to tackle, can't re-pick for this long
    COLLIDE_RADIUS: 22,      // player-vs-player soft collision
    TACKLE_RADIUS: 48,       // centre-to-centre distance that triggers a tackle attempt
                             // (must be > COLLIDE_RADIUS*2 so post-separation contact still tackles)
  },

  BALL: {
    RADIUS: 9,
    GRAVITY: 1400,           // px/sec^2 downward (acts on z)
    GROUND_FRICTION: 1.8,    // velocity decay/sec when rolling
    AIR_FRICTION: 0.10,      // velocity decay/sec while airborne (slight)
    BOUNCE_DAMPING_Z: 0.45,  // vertical energy retained on bounce
    BOUNCE_DAMPING_XY: 0.75, // horizontal energy retained on bounce
    REST_Z_VELOCITY: 60,     // below this on a bounce, ball stops bouncing
  },

  KICK: {
    MIN_POWER: 280,          // initial horizontal speed at zero charge
    MAX_POWER: 730,          // initial horizontal speed at full charge
                             // (tuned so a flat max kick travels ~55m = 550 units)
    CHARGE_TIME: 0.9,        // sec to reach full power by holding left-click
    LIFT_RATIO: 0.65,        // initial vz = horizontal_speed * this
    INACCURACY_BASE: 0.08,   // baseline angle wobble (radians)

    // Overcharge: holding past CHARGE_TIME keeps power at max but adds wobble.
    // Wobble grows linearly from 0 (at exactly CHARGE_TIME) up to
    // MAX_OVERCHARGE_WOBBLE radians (at CHARGE_TIME + OVERCHARGE_TIME and beyond).
    OVERCHARGE_TIME: 0.6,
    MAX_OVERCHARGE_WOBBLE: 0.45,

    // Angle penalty model (direction is set by cursor position):
    //   angleDelta = |kickDir - facing|
    //   if angleDelta > MAX_FORWARD_ANGLE → kick rejected (can't kick behind)
    //   else distanceMult = ANGLE_PENALTY_MIN + (1 - ANGLE_PENALTY_MIN) * cos(angleDelta)
    //   launchSpeed = (MIN_POWER + (MAX_POWER - MIN_POWER) * power01) * distanceMult
    MAX_KICK_DISTANCE: 550,        // 55m at our 10u-per-metre scale (used for aim-line)
    MAX_FORWARD_ANGLE: Math.PI/2,  // > this from facing → reject
    ANGLE_PENALTY_MIN: 0.4,        // sideways kicks at 90° travel this fraction of full
  },

  HANDBALL: {
    SPEED: 480,              // horizontal speed
    LIFT_RATIO: 0.18,        // flatter than a kick
  },

  // Sprint mechanic. Hold SPRINT key while moving → +SPEED_MULT × base speed
  // until stamina runs out. Recharges when not sprinting.
  SPRINT: {
    SPEED_MULT: 1.6,
    STAMINA_DRAIN_RATE: 0.4,  // /sec — full stamina lasts 2.5s
    STAMINA_REGEN_RATE: 0.2,  // /sec — full recharge takes 5s
  },

  ACCURACY: {
    BAR_PERIOD: 1.0,         // sec for indicator to traverse bar one way
    TRIGGER_DIST: 380,       // within this of goal-line center → bar appears
    PERFECT_ZONE: 0.12,      // |indicator - 0.5| < this → perfectly straight
    MAX_DEFLECTION: 0.35,    // worst-case angle deflection (radians)
  },

  // Holding-the-ball model (simplified AFL rule).
  //   t = carrier.possessionTime at moment of tackle
  //   if t < PRIOR_OPP_TIME            → always spills (no prior opportunity)
  //   else base = min(1, (t - PRIOR_OPP_TIME) / FULL_PENALTY_DELAY)
  //        prob = base + (tacklerStrength - 0.5) * STRENGTH_INFLUENCE
  //        random() < prob → "HOLDING THE BALL!" free kick to tackler
  //                          otherwise → ball spills loose
  HOLDING_BALL: {
    PRIOR_OPP_TIME: 0.4,        // sec — grace period after pickup; no penalty possible
    FULL_PENALTY_DELAY: 0.7,    // sec past PRIOR_OPP at which base prob hits 1.0
    STRENGTH_INFLUENCE: 0.6,    // tackler strength swing (strength range [0..1] maps to ±0.3)
    BANNER_MS: 1200,            // how long "HOLDING THE BALL!" stays on screen
    // Per-player tackle strength is set in game.js where players are built.
    // 0.0 = soft, 1.0 = always wins the call (within prob bounds).
  },

  SCORE: { GOAL: 6, BEHIND: 1 },

  AI: {
    REACTION: 0.18,          // sec between AI decisions (light throttling)
    MAX_SPEED: 300,
    KICK_RANGE: 460,         // try to shoot at goal when within this
    HANDBALL_CHANCE: 0.05,   // sometimes handball instead of kick (future-friendly)
    CHASE_DIST: 1200,        // always chase if ball within this
  },

  MATCH: {
    DURATION: 240,           // total match seconds (testing — make 4 mins)
    KICKOFF_DELAY: 1.5,      // pause after goals/start before play resumes
  },

  COLORS: {
    GRASS_LIGHT: '#3aa83a',
    GRASS_DARK:  '#2f9a2f',
    LINE:        '#ffffff',
    POST_GOAL:   '#fafafa',
    POST_BEHIND: '#dcdcdc',
    BALL:        '#7a3a14',
    BALL_LACE:   '#f5e6c8',
    BALL_SHADOW: 'rgba(0,0,0,0.35)',

    P1_BODY: '#e63946',
    P1_HEAD: '#ffd6da',
    P2_BODY: '#1d4ed8',
    P2_HEAD: '#cfd9ff',
    AI_BODY: '#fbbf24',
    AI_HEAD: '#fff3c4',
    OUTLINE: '#1a1a1a',
    HOLDER_RING: 'rgba(255,255,255,0.9)',
  },

  KEYS: {
    P1: {
      UP: 'KeyW', DOWN: 'KeyS', LEFT: 'KeyA', RIGHT: 'KeyD',
      SPRINT: 'ShiftLeft',
      TACKLE: 'Space',
      // Kick/handball are now mouse-driven (see FOOTY.Mouse).
    },
    PAUSE: 'Escape',
  },

  // Which end each team attacks. Team A (us) attacks RIGHT, B (AI) attacks LEFT.
  TEAMS: {
    A_ATTACKS: 'right',
    B_ATTACKS: 'left',
  },

  DEBUG: false,              // flip to true to draw collision radii etc.
};
