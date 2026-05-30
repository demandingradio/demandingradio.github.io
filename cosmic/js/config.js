/*
 * COSMIC ASCENT — CONFIG
 * ======================
 * Every tunable number lives here (ported from the original LÖVE2D
 * config/constants.lua). To iterate on feel, edit this file.
 *
 * The world is rendered in "world units"; the level is LEVEL.WIDTH_MULT screens
 * wide and LEVEL.HEIGHT_MULT screens tall, sized off the viewport at launch.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.CONFIG = {
  // ---- Physics ----
  GRAVITY: 600,            // px/sec^2 downward
  MOVE_SPEED: 200,         // base horizontal accel unit (×3 in code, like original)
  MOVE_AIR_FACTOR: 0.3,    // air-control multiplier while a rope is attached
  JUMP_POWER: -350,        // initial vy on a grounded jump (negative = up)
  DOUBLE_JUMP_MULT: 0.8,   // double-jump strength = JUMP_POWER × this
  FRICTION: 0.95,          // ground horizontal damping base
  AIR_FRICTION: 0.99,      // airborne horizontal damping base

  // ---- Rope / grapple ----
  ROPE_LENGTH_MULTIPLIER: 12.0, // max rope = platform-spacing × this
  SWING_FORCE_MULTIPLIER: 2.0,  // global swing/boost amplifier
  SWING_FORCE: 300,             // pendulum drive (×SWING_FORCE_MULTIPLIER)
  BOOST_FORCE: 400,             // Shift boost (×SWING_FORCE_MULTIPLIER)
  ROPE_SHOOT_SPEED: 4000,       // projectile speed when firing
  ROPE_RETRACT_SPEED: 287.5,    // reel in/out speed (W/S while attached)
  ROPE_MIN_LENGTH: 50,
  ROPE_COOLDOWN_DURATION: 0.4,  // delay after a miss before you can re-fire
  ROPE_FAILED_MAX_TIME: 0.8,    // lifetime of the "snapped rope" debris
  ROPE_GRACE_PERIOD: 0.5,       // post-release window where you keep a jump

  // ---- Player ----
  PLAYER_RADIUS: 10,

  // ---- Level generation ----
  LEVEL_WIDTH_MULT: 2.5,
  LEVEL_HEIGHT_MULT: 20,
  PLATFORM_COUNT: 220,
  GROUND_HEIGHT: 100,

  // ---- Platform behaviours ----
  PLATFORM_CRUMBLE_DELAY: 1.5,      // sec after grabbing a crumbler before it falls
  PLATFORM_DISAPPEAR_VISIBLE: 3,    // sec phasing platforms stay solid
  PLATFORM_DISAPPEAR_INVISIBLE: 2,  // sec they stay gone

  // ---- Hazards ----
  WIND_ZONE_COUNT: 8,
  WIND_BASE_STRENGTH: 1200,         // + up to another 1200 random
  GRAVITY_WELL_COUNT: 6,
  GRAVITY_WELL_BASE_STRENGTH: 2400, // + up to another 1600 random
  SOLAR_FLARE_COUNT: 5,
  SOLAR_FLARE_WARNING_TIME: 2,
  METEOR_BASE_SPEED: 300,
  METEOR_SPAWN_PROGRESS: 0.5,       // meteors only above this progress
  METEOR_HIT_RADIUS_PAD: 5,         // rope-cut tolerance

  // ---- Camera ----
  CAMERA_SMOOTHING: 0.1,
  CAMERA_Y_OFFSET: 0.6,             // keep player 60% down the screen

  // ---- Input ----
  DEADZONE: 0.25,                   // gamepad stick deadzone

  // ---- Audio ----
  DEFAULT_MASTER_VOLUME: 0.7,
  MUSIC_VOLUME_FACTOR: 0.5,         // music plays at master × this

  // ---- Misc ----
  ACHIEVEMENT_POPUP_DURATION: 3.0,
  MAX_BEST_TIMES: 10,
  STATS_SAVE_INTERVAL: 30,          // autosave stats every N sec of play
  ABERRATION_THRESHOLD: 600,        // fall speed that triggers the screen-shake/colour effect
};

// Game states (the canvas state machine), mirrors the original GameState enum.
ASCENT.STATES = {
  MENU: 'menu',
  PLAYING: 'playing',
  OPTIONS: 'options',
  PAUSED: 'paused',
  BEST_TIMES: 'best_times',
  ACHIEVEMENTS: 'achievements',
};

// The 10 achievements (id / name / description). `unlocked` is loaded from save.
ASCENT.ACHIEVEMENTS = [
  { id: 'first_50',     name: 'Halfway to the Stars', desc: 'Reach 50% completion' },
  { id: 'meteor_cut',   name: 'Cosmic Hazard',        desc: 'Have your rope cut by a meteor' },
  { id: 'first_fail',   name: 'Learning the Ropes',   desc: 'Fail your first rope shot' },
  { id: 'first_win',    name: 'Stellar Success',      desc: 'Complete the game for the first time' },
  { id: 'gravity_stuck',name: 'Event Horizon',        desc: 'Get stuck in a gravity well for 2 seconds' },
  { id: 'long_fall',    name: 'Terminal Velocity',    desc: 'Fall the entire length of the level' },
  { id: 'win_25',       name: 'Cosmic Champion',      desc: 'Complete the game 25 times' },
  { id: 'attempt_100',  name: 'Persistent Explorer',  desc: 'Attempt the game 100 times' },
  { id: 'jump_10k',     name: 'Lunar Leaper',         desc: 'Jump 10,000 times' },
  { id: 'rope_10k',     name: 'Master of Strings',    desc: 'Successfully shoot 10,000 ropes' },
];
