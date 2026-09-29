/*
 * COSMIC GIRAFFE — CONFIG
 * =======================
 * The sequel/remake of Cosmic Ascent (/cosmic/). Same rope-swing ascent, but
 * you are a giraffe floating through space and the rope is your tongue.
 *
 * Every tunable number lives here. Physics values are inherited from the
 * original game (so the swing feel is identical); the camera / giraffe /
 * visual knobs below are new.
 *
 * The world is rendered in "world units"; the level is LEVEL_WIDTH_MULT
 * screens wide and LEVEL_HEIGHT_MULT screens tall, sized off the viewport.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.CONFIG = {
  // ---- Physics (unchanged from Cosmic Ascent) ----
  GRAVITY: 600,            // px/sec^2 downward
  MOVE_SPEED: 200,         // base horizontal accel unit (×3 in code, like original)
  MOVE_AIR_FACTOR: 0.3,    // air-control multiplier while the tongue is attached
  JUMP_POWER: -350,        // initial vy on a grounded jump (negative = up)
  DOUBLE_JUMP_MULT: 0.8,   // double-jump strength = JUMP_POWER × this
  FRICTION: 0.95,          // ground horizontal damping base
  AIR_FRICTION: 0.99,      // airborne horizontal damping base

  // ---- Tongue (the rope) ----
  ROPE_LENGTH_MULTIPLIER: 12.0, // max tongue = platform-spacing × this
  SWING_FORCE_MULTIPLIER: 2.0,  // global swing/boost amplifier
  SWING_FORCE: 300,             // pendulum drive (×SWING_FORCE_MULTIPLIER)
  BOOST_FORCE: 400,             // Shift boost (×SWING_FORCE_MULTIPLIER)
  ROPE_SHOOT_SPEED: 4000,       // tongue flight speed when firing
  ROPE_RETRACT_SPEED: 287.5,    // reel in/out speed (W/S while attached)
  ROPE_MIN_LENGTH: 50,
  ROPE_COOLDOWN_DURATION: 0.4,  // delay after a miss before you can re-fire
  ROPE_FAILED_MAX_TIME: 0.8,    // lifetime of the "snapped tongue" debris
  ROPE_GRACE_PERIOD: 0.5,       // post-release window where you keep a jump

  // ---- Player / giraffe ----
  PLAYER_RADIUS: 20,       // collision circle (the giraffe's centre of mass) = 16 × GIRAFFE_SCALE so hooves meet the ground
  GIRAFFE_SCALE: 1.25,     // visual scale of the giraffe (1 ≈ 75px tall standing); keep PLAYER_RADIUS = 16 × this

  // ---- Level generation ----
  LEVEL_WIDTH_MULT: 2.5,
  LEVEL_HEIGHT_MULT: 20,
  PLATFORM_COUNT: 220,
  PLATFORM_HEIGHT: 14,     // lickable thickness of every asteroid slab (orig 10)
  GROUND_HEIGHT: 100,

  // ---- Platform behaviours ----
  PLATFORM_CRUMBLE_DELAY: 1.5,      // sec after licking a crumbler before it falls
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
  METEOR_SPAWN_PROGRESS: 0.5,       // comets only above this progress
  METEOR_HIT_RADIUS_PAD: 5,         // tongue-cut tolerance

  // ---- Camera ----
  CAMERA_SMOOTHING: 0.1,            // per-60fps-frame follow factor
  CAMERA_Y_OFFSET: 0.6,             // keep giraffe 60% down the view
  CAMERA_ZOOM_MAX: 1.0,             // zoom when still
  CAMERA_ZOOM_MIN: 0.78,            // zoom at full speed (sees more of space)
  CAMERA_ZOOM_SPEED_REF: 1100,      // speed (px/s) that reaches ZOOM_MIN
  CAMERA_ZOOM_SMOOTHING: 0.025,     // per-frame zoom easing
  CAMERA_TILT_MAX: 0.03,            // radians of lean from horizontal speed
  CAMERA_SHAKE_DECAY: 1.6,          // trauma units lost per second
  CAMERA_SHAKE_MAX_PX: 14,          // shake offset at trauma = 1
  CAMERA_TOP_OVERSCROLL: 320,       // how far above the level top the view may rise (frames the Acacia)
  CAMERA_VICTORY_ZOOM: 1.4,         // zoom-in on the munching giraffe after reaching the goal
  CAMERA_VICTORY_GOAL_Y: 0.3,       // …with the Acacia this far down the screen

  // ---- Input ----
  DEADZONE: 0.25,                   // gamepad stick deadzone

  // ---- Audio ----
  DEFAULT_MASTER_VOLUME: 0.7,
  MUSIC_VOLUME_FACTOR: 0.5,         // music plays at master × this

  // ---- Misc ----
  ACHIEVEMENT_POPUP_DURATION: 3.0,
  MAX_BEST_TIMES: 10,
  STATS_SAVE_INTERVAL: 30,          // autosave stats every N sec of play
  ABERRATION_THRESHOLD: 600,        // fall speed that triggers the fast-fall effect
  DEATH_BEAT: 0.8,                  // seconds the camera lingers on the "poof" before respawn
};

// Shared colour language so every render module reads as one world.
// Hex strings (canvas-ready). Modules may derive tints from these.
ASCENT.PAL = {
  // giraffe
  hide: '#f2b64c',        // giraffe coat
  hideLight: '#ffd98a',   // belly / muzzle highlight
  spots: '#9a4a17',       // patches
  spotsDark: '#6e3010',
  hoof: '#3a2414',
  mane: '#7a3a12',
  tongue: '#4b2f78',      // giraffes have dark blue-purple tongues
  tongueHi: '#8a6cc8',
  tongueDark: '#2a1846',
  // space
  void: '#05040d',        // deepest background
  deep: '#0b0a24',
  nebulaA: '#6a2fa8',     // violet
  nebulaB: '#1f6fb5',     // cobalt
  nebulaC: '#d2407a',     // magenta-rose
  nebulaD: '#f0a23a',     // galactic-core gold
  starWarm: '#ffe7b8',
  starCool: '#bcd8ff',
  // home planet / atmosphere at the bottom of the level
  dusk1: '#ff9a4a',
  dusk2: '#d8456f',
  dusk3: '#3a1f5e',
  savanna: '#c98a3a',
  savannaDark: '#6b3f1a',
  // hazards / ui accents
  plasma: '#ffb13b',
  plasmaHot: '#fff2c4',
  danger: '#ff4b3e',
  aurora: '#46f0c0',
  auroraB: '#6fb8ff',
  hole: '#000000',
  accretion: '#ffb86b',
  leaf: '#7fe07a',        // the Celestial Acacia / goal
  leafGlow: '#d8ffb0',
  gold: '#ffd35c',
  ui: '#eaf2ff',
  uiDim: '#8f9ac2',
  uiPanel: 'rgba(12,14,40,0.62)',
};

// Altitude zones of the climb (progress 0 = home planet, 1 = the Acacia).
// Boundaries follow the level generator's difficulty bands and hazard
// placement (wind 0.3–0.6, black holes 0.5–0.7, comets 0.5+, flares 0.8–0.95).
// Space tints the sky per zone; the HUD announces each one as you enter it.
ASCENT.ZONES = [
  { from: 0.00, name: 'The Savanna Sky',     tint: '#ff9a4a' },
  { from: 0.12, name: 'Low Orbit',           tint: '#6fb8ff' },
  { from: 0.30, name: 'The Solar Winds',     tint: '#46f0c0' },
  { from: 0.50, name: 'The Black Hole Belt', tint: '#a45cff' },
  { from: 0.70, name: 'The Comet Fields',    tint: '#ff6a4a' },
  { from: 0.90, name: 'The Galactic Canopy', tint: '#ffd35c' },
];
ASCENT.zoneAt = function (progress) {
  let z = ASCENT.ZONES[0];
  for (const zz of ASCENT.ZONES) if (progress >= zz.from) z = zz;
  return z;
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

// The 10 achievements (same unlock rules as Cosmic Ascent, re-themed).
ASCENT.ACHIEVEMENTS = [
  { id: 'first_50',     name: 'Halfway to the Leaves', desc: 'Reach 50% of the climb' },
  { id: 'meteor_cut',   name: 'Ouch, My Tongue',       desc: 'Have a comet slice through your tongue' },
  { id: 'first_fail',   name: 'Tongue Twister',        desc: 'Miss your first lick' },
  { id: 'first_win',    name: 'Stellar Snack',         desc: 'Reach the Celestial Acacia' },
  { id: 'gravity_stuck',name: 'Event Horizon',         desc: "Spend 2 seconds in a black hole's pull" },
  { id: 'long_fall',    name: 'Long Neck, Longer Fall', desc: 'Fall the entire height of the sky' },
  { id: 'win_25',       name: 'Cosmic Grazer',         desc: 'Reach the Acacia 25 times' },
  { id: 'attempt_100',  name: 'Persistent Ungulate',   desc: 'Attempt the climb 100 times' },
  { id: 'jump_10k',     name: 'Hoof Hopper',           desc: 'Jump 10,000 times' },
  { id: 'rope_10k',     name: 'Master of Licks',       desc: 'Land 10,000 tongue grabs' },
];
