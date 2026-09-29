/*
 * SPACE — the deep-space backdrop that sells "flying through space".
 * ==================================================================
 * Screen-space and purely visual. Three things are drawn from here:
 *
 *   drawBack(ctx, g)      the frame clear while playing — every layer behind the world:
 *       sky gradient ...... zone "mood" colours blended by altitude (dusk at the home planet)
 *       nebulae ........... fBm value-noise clouds, one texture per zone, cross-faded (parallax .04)
 *       galactic core ..... the blazing heart of the galaxy behind the Celestial Acacia
 *       spiral galaxies ... two, additive, drifting very slowly
 *       star tiles ........ 3 wrapped, pre-rendered star fields (parallax .10 / .22 / .42)
 *       constellations .... Camelopardalis (the real "giraffe") mid-climb, Orion near the top
 *       bright stars ...... individually twinkling, soft glow + 4-point diffraction spikes
 *       the sun ........... a distant blazing star off the Comet Fields
 *       gas giant, moon ... opaque ray-traced spheres (ring shadows, craters, terminators)
 *       home planet ....... the dusk limb + atmosphere glow you climb away from
 *   drawFront(ctx, g)     over the world: near-field dust that streams past and smears into
 *                         speed streaks, fast-fall rush lines + edge tint, a soft vignette.
 *   drawMenuBack(ctx, g)  behind every menu: a slow fly-through of a violet nebula with
 *                         radiating stars and the home planet's sunrise limb at the bottom.
 *
 * Altitude ("prog", 0 = the home planet, 1 = the Acacia) is taken from the CAMERA, not the
 * giraffe, so the sky always matches what is on screen.
 *
 * Performance: every cloud, star field, planet and glow is pre-rendered per-pixel into
 * ImageData (value-noise fBm clouds, ray-traced spheres, Gaussian-splatted stars) and drawn
 * with drawImage. The heavy textures (~1 s of CPU in all) are generated a few rows per frame
 * while the title screen is up, in the order the climb needs them; the title clouds bloom in
 * when ready. Launch before that finishes and only what the bottom of the climb shows is
 * completed on the spot (~0.1 s); the rest carries on in the background during play.
 * ~150-400 draw calls a frame, no per-frame canvases, no shadowBlur/filter; ~15 MB of
 * canvases at dpr 1, ~35 MB at dpr 2.
 *
 * Fill-rate (what a retina laptop actually pays for — each full-screen pass at dpr 2 is
 * ~5.8 Mpx): the soft, low-frequency layers (sky gradient + zone clouds + galactic core; the
 * sky + fly-through veils on the title screen) are composited every frame into a small
 * low-resolution canvas and put on screen in ONE opaque pass; the sparse near star layer is
 * drawn star by star (only the pixels that hold a star) instead of as a full-screen tile;
 * layers that have faded to ~nothing are skipped; the vignette skips its empty centre and,
 * during a fast fall, is pre-mixed with the red edge tint so the pair costs one pass.
 * Measured at 1600x900: typical play ~4 passes (was 6.2-7.3), the home-planet dusk and the
 * sun's band 5.2-6.1 (were 7.3-8.4), a fast fall 4.6 (was 9.1), the title screen 6.3 (was 9.3),
 * plus ~0.1 of a pass of low-res composite work at dpr 2 (~0.4 at dpr 1).
 *
 * Resolution changes (window resize, GRAPHICS option, the AUTO quality stepping 2 → 0.75):
 * nothing is rebuilt that does not need it; what does is regenerated in the background while
 * the old texture stays on screen (textures are always drawn at a fixed CSS size, whatever
 * their pixel resolution), so a change never blanks a layer or stalls a frame.
 *
 * GPU context restored (Chrome, via main.js): rebuild(g) throws every cached canvas away and
 * runs the boot builds again into NEW canvases; mid-climb, what is on screen is made first.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ==========================================================================
  // KNOBS
  // ==========================================================================
  const K = {
    // --- altitude → sky mood ---
    ZONE_BLEND: 0.045,          // ± progress over which neighbouring zone moods cross-fade
    DUSK_BLEND: [0.02, 0.12],   // the home-planet dusk thins into Low Orbit across this range
    DUSK_GLOW_END: 0.13,        // the broad sunset glow above the horizon is gone by here
    HORIZON_PARALLAX: 0.065,    // how fast the far horizon sinks vs the ground (1 = with the ground)
    LIMB_RIM_FADE: [0.2, 0.32], // the planet's thin atmosphere rim fades out over this range
    STAR_VIS: [0.3, 0.1],       // star brightness at prog 0 (in the atmosphere) → full by prog .1
    SHAKE_FOLLOW: 0.25,         // share of camera shake the backdrop follows

    // --- nebulae ---
    NEB_W: 480, NEB_H: 270,     // texels per zone cloud (drawn ~4x upscaled: soft on purpose)
    NEB_MARGIN: 1.32,           // cloud drawn this much larger than the screen (parallax room)
    NEB_PARALLAX: 0.04,
    NEB_ZOOM_DEPTH: 0.06,       // layerScale = 1 + (zoom - 1) * depth
    NEB_ALPHA: [0.3, 0.8, 0.85, 0.95, 0.85, 0.8],   // cloud strength per zone
    NEB_CUT: 0.02,              // a cross-fading cloud below ~this alpha is dropped (eased, no pop)

    // --- low-res composite of the soft layers (sky + clouds + core; see the header) ---
    COMP_TEXEL: 1.8,            // composite px per cloud/core texel (≥ ~1.5: no detail lost)
    COMP_SCALE: [0.2, 0.5],     // composite px per CSS px (also ≤ 0.45 × dpr)

    // --- stars ---
    TILES: [                    // wrapped star tiles, far → near (size in CSS px)
      { size: 512, count: 620, P: 0.10, depth: 0.10, r: [0.3, 0.7],  b: [0.10, 0.7], halo: 0,    alpha: 0.95, cluster: 0.8, seed: 101 },
      { size: 640, count: 200, P: 0.22, depth: 0.22, r: [0.45, 1.0], b: [0.22, 0.9], halo: 0.05, alpha: 1,    cluster: 0.4, seed: 202 },
      // sparse: 64 stars on a 768px tile are ~97% empty pixels, so this layer is drawn star by
      // star (each star's own little rectangle of the tile) instead of as full-screen tiles
      { size: 768, count: 64,  P: 0.42, depth: 0.42, r: [0.7, 1.4],  b: [0.35, 1.0], halo: 0.1,  alpha: 1,    cluster: 0,   seed: 303, sparse: true },
    ],
    SPARSE_MAX_DRAWS: 300,      // ...unless that would take more draw calls than this (huge screens)
    SPRITE_REBUILD: [0.72, 1.08],   // rebuild the glow/dust sprites when dpr leaves this ratio of theirs
    BRIGHT_COUNT: 44,           // individually drawn twinkling stars
    BRIGHT_P: [0.13, 0.3],      // their parallax range
    BRIGHT_DEPTH: 0.25,
    SPIKE_FRACTION: 0.3,        // brightest share that get diffraction spikes
    CONST_SCALE: 11,            // constellation px per degree of sky (at a 900px-tall screen)
    CONST_P: 0.2,

    // --- set pieces: prog = anchor altitude; fx/fy = screen position at the anchor;
    //     P = parallax; size × min(H, 0.62W); win = fade in (a→b) / out (c→d) progress ---
    // (the moon and the giant are opaque, so their windows only fade them while off screen:
    //  they slide in from the top and out at the bottom like real parallax)
    MOON:   { prog: 0.19, fx: 0.22, fy: 0.30, P: 0.2,  size: 0.075, win: [0.04, 0.085, 0.4, 0.44] },
    GAL2:   { prog: 0.2,  fx: 0.62, fy: 0.15, P: 0.06, size: 0.30,  win: [0.1, 0.15, 0.24, 0.29], alpha: 0.8 },
    GIANT:  { prog: 0.40, fx: 0.77, fy: 0.40, P: 0.2,  size: 0.16,  win: [0.2, 0.245, 0.61, 0.66] },
    CAMEL:  { prog: 0.47, fx: 0.20, fy: 0.42 },
    GAL1:   { prog: 0.60, fx: 0.27, fy: 0.34, P: 0.07, size: 0.5,   win: [0.49, 0.55, 0.68, 0.74], alpha: 0.9 },
    SUN:    { prog: 0.80, fx: 0.77, fy: 0.28, P: 0.07, size: 0.8,   win: [0.67, 0.73, 0.85, 0.9], rays: 0.3 },
    // the core sits just above where the Acacia ends up (top-centre), backlighting it
    CORE:   { prog: 0.99, fx: 0.50, fy: 0.045, P: 0.05, win: [0.80, 0.92, 9, 10], alpha: 0.88 },
    ORION:  { prog: 0.93, fx: 0.17, fy: 0.46 },

    // --- foreground (drawFront) ---
    MOTES: 56,
    MOTE_DEPTH: [1.25, 2.3],    // parallax of near dust (> 1: closer than the world)
    BOKEH: 7,
    BOKEH_DEPTH: [2.8, 4.2],
    BOKEH_GAIN: 0.4,            // lens-bokeh strength vs the original (full strength read as smudges)
    BOKEH_SHOW: [1200, 2600],   // their own screen speed (px/s) over which they fade in: none
                                // when still (≈ camera 400-800 px/s, when they are already smears)
    DUST_MARGIN: 90,
    EXPOSURE: 0.034,            // "shutter" seconds: streak length = screen speed × this
    STREAK_MAX: 170,
    STREAK_SPEED: [160, 1100],  // world px/s where streaks start / are at full strength
    MOTE_IDLE: 0.3,             // mote alpha when still ...
    MOTE_FAST: 0.52,            // ... plus this much at full speed
    MAX_CAM_SPEED: 4000,
    VIGNETTE: 0.5,
    VIGNETTE_SPEED: 0.14,       // extra vignette at full speed (tunnel vision)
    RUSH_LINES: 15,             // fast-fall speed lines (fewer + shorter than they were: at a
    RUSH_LEN: [70, 240],        // full fall 22 long ones read as rain) — CSS px ...
    RUSH_GROW: 0.6,             // ... × (0.6 + this × fall)
    RUSH_EDGE: 0.32,            // they keep to this outer share of each side of the screen
    RUSH_SPEED: 2300,
    RUSH_ALPHA: 0.32,
    FALL_TINT: 0.36,

    // --- menu ---
    MENU_FLOW: 110,             // radiating fly-through stars
    MENU_FLOW_CYCLE: 34,        // seconds for a star to travel far → past the camera
    MENU_WISP_CYCLE: 48,        // seconds per fly-through cloud layer

    JOB_BUDGET_MS: 5,           // texture generation time per frame while in menus ...
    JOB_BUDGET_PLAY_MS: 2.5,    // ... and while playing (only if you launched within ~1s)
  };

  // ==========================================================================
  // helpers
  // ==========================================================================
  const TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function posmod(a, m) { const r = a % m; return r < 0 ? r + m : r; }
  function frac(x) { return x - Math.floor(x); }
  function win(p, w) { return smooth(w[0], w[1], p) * (1 - smooth(w[2], w[3], p)); }
  // An alpha eased to exactly 0 once it is below K.NEB_CUT (continuously, so nothing pops, and
  // untouched from 2 × NEB_CUT up): a big layer that has faded to next to nothing costs no pass.
  function cutAlpha(a) {
    const c = K.NEB_CUT;
    return a >= 2 * c ? a : a <= c ? 0 : a * smooth(c, 2 * c, a);
  }
  function hexRGB(h) { const n = parseInt(String(h).slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixRGB(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function ch(v) { v = Math.round(v); return v > 0 ? (v < 255 ? v : 255) : 0; }   // NaN → 0
  function rgba(c, a) {
    const al = a === undefined ? 1 : (a > 0 ? (a < 1 ? a : 1) : 0);
    return 'rgba(' + ch(c[0]) + ',' + ch(c[1]) + ',' + ch(c[2]) + ',' + al.toFixed(3) + ')';
  }
  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  // Re-use a canvas when it exists (resizing its backing store only if the size changed).
  function sizeCanvas(c, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (!c) return newCanvas(w, h);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }
  // Sprite resolution: dpr snapped to 1/8 steps (64 CSS px × any step = whole pixels).
  function quantDpr(d) { return clamp(Math.round((d > 0 ? d : 1) * 8) / 8, 0.5, 3); }

  // ---- value noise (seeded lattice, smoothstep interpolation) ----
  const NP = new Uint8Array(512), NV = new Float32Array(256);
  (function () {
    const r = mulberry32(1337), p = [];
    for (let i = 0; i < 256; i++) { p[i] = i; NV[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) NP[i] = p[i & 255];
  })();
  function vnoise(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y);
    let tx = x - fx, ty = y - fy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const X = fx & 255, Y = fy & 255, r0 = NP[Y], r1 = NP[Y + 1];
    const a = NV[NP[X + r0]], b = NV[NP[X + 1 + r0]], c = NV[NP[X + r1]], d = NV[NP[X + 1 + r1]];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }
  // Tileable variant: the lattice wraps every `per` cells (per ≤ 256).
  function tvnoise(x, y, per) {
    const fx = Math.floor(x), fy = Math.floor(y);
    let tx = x - fx, ty = y - fy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const X0 = posmod(fx, per), X1 = (X0 + 1) % per, Y0 = posmod(fy, per), Y1 = (Y0 + 1) % per;
    const a = NV[NP[X0 + NP[Y0]]], b = NV[NP[X1 + NP[Y0]]], c = NV[NP[X0 + NP[Y1]]], d = NV[NP[X1 + NP[Y1]]];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }
  // fBm; each octave is rotated ~37° so the lattice grid never lines up.
  function fbm(x, y, oct) {
    let s = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * vnoise(x, y); norm += amp;
      const nx = (0.8 * x - 0.6 * y) * 2.02 + 17.3, ny = (0.6 * x + 0.8 * y) * 2.02 - 9.1;
      x = nx; y = ny; amp *= 0.5;
    }
    return s / norm;
  }
  // 5-octave fBm that also leaves its 3-octave partial (normalised) in FB3 — no allocation.
  let FB3 = 0;
  function fbm53(x, y) {
    let s = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < 5; i++) {
      s += amp * vnoise(x, y); norm += amp;
      if (i === 2) FB3 = s / norm;
      const nx = (0.8 * x - 0.6 * y) * 2.02 + 17.3, ny = (0.6 * x + 0.8 * y) * 2.02 - 9.1;
      x = nx; y = ny; amp *= 0.5;
    }
    return s / norm;
  }

  // ==========================================================================
  // palette
  // ==========================================================================
  const PAL = ASCENT.PAL;
  const C = {
    dusk1: hexRGB(PAL.dusk1), dusk2: hexRGB(PAL.dusk2), dusk3: hexRGB(PAL.dusk3),
    starWarm: hexRGB(PAL.starWarm), starCool: hexRGB(PAL.starCool), nebA: hexRGB(PAL.nebulaA),
  };
  // star colour classes: white, cool, warm, orange giant, hot blue
  const STAR_COLS = [[255, 250, 244], C.starCool, C.starWarm, [255, 172, 116], [160, 188, 255]];
  const STAR_W = [0.42, 0.22, 0.22, 0.09, 0.05];
  function pickStarCol(u) { let a = 0; for (let i = 0; i < STAR_W.length; i++) { a += STAR_W[i]; if (u < a) return i; } return 0; }

  // Sky "mood" per altitude zone (index = ASCENT.ZONES index). neb = which cloud texture.
  const MOODS = [
    { top: [26, 12, 52], mid: [62, 26, 88], bot: [128, 46, 96], neb: 0 },   // The Savanna Sky (dusk)
    { top: [4, 7, 22],   mid: [8, 15, 40],  bot: [14, 28, 62],  neb: 0 },   // Low Orbit
    { top: [2, 12, 20],  mid: [4, 22, 34],  bot: [7, 34, 46],   neb: 1 },   // The Solar Winds
    { top: [9, 3, 22],   mid: [18, 7, 38],  bot: [30, 11, 54],  neb: 2 },   // The Black Hole Belt
    { top: [18, 5, 10],  mid: [34, 9, 18],  bot: [52, 14, 22],  neb: 3 },   // The Comet Fields
    { top: [48, 26, 38], mid: [22, 12, 30], bot: [12, 8, 24],   neb: 4 },   // The Galactic Canopy (lit from above)
  ];
  const NEB_CENTER = [0.16, 0.40, 0.60, 0.80, 0.95];   // altitude each cloud texture is centred on
  const ZONE_TINT = ASCENT.ZONES.map((z) => mixRGB(hexRGB(z.tint), [255, 255, 255], 0.35));

  // Nebula recipes. Colours are 0..255 emission; body/hot/filaments are layered, dust lanes cut;
  // peak = brightness of the 98th-percentile texel after normalisation.
  const NEB_SPECS = [
    { // 0 — Low Orbit: thin cobalt veils along a diagonal band
      seed: 11, scale: 3.0, warp: 0.9, lo: 0.47, hi: 0.76, haze: 0.4, fil: 0.35, lanes: 0.4, hotAmt: 0.3, peak: 80,
      deep: [18, 36, 104], mid: [44, 112, 196], hot: [170, 210, 255], alt: C.nebA.map((v) => v * 0.8),
      env: (u, v) => 0.3 + 0.7 * Math.exp(-Math.pow((v - (0.85 - u * 0.7)) / 0.32, 2)),
    },
    { // 1 — The Solar Winds: long sinuous aurora ribbons streaming sideways
      seed: 22, scale: 3.4, ax: 0.45, ay: 1.5, warp: 0.7, lo: 0.38, hi: 0.68, haze: 0.35, fil: 0.7, lanes: 0.3, hotAmt: 0.4, peak: 96,
      deep: [8, 60, 90], mid: [38, 196, 168], hot: [190, 255, 236], alt: [40, 110, 200],
      env: (u, v) => {
        const r1 = Math.exp(-Math.pow((v - 0.24 - 0.07 * Math.sin(u * 6.5 + 0.8)) / 0.1, 2));
        const r2 = Math.exp(-Math.pow((v - 0.55 - 0.08 * Math.sin(u * 5.2 + 2.9)) / 0.12, 2));
        const r3 = Math.exp(-Math.pow((v - 0.84 - 0.05 * Math.sin(u * 7.7 + 4.4)) / 0.09, 2));
        return 0.12 + 0.88 * Math.max(r1, r2 * 0.9, r3 * 0.8);
      },
    },
    { // 2 — The Black Hole Belt: dense violet-magenta turbulence twisted into a swirl
      seed: 33, scale: 3.4, warp: 1.25, lo: 0.48, hi: 0.74, haze: 0.45, fil: 0.45, lanes: 0.6, hotAmt: 0.45, peak: 105,
      deep: [58, 20, 118], mid: [178, 52, 142], hot: [255, 176, 222], alt: [30, 50, 150],
      swirl: { x: 0.62, y: 0.45, r: 0.34, k: 2.4 },
      env: (u, v) => 0.35 + 0.65 * Math.exp(-(Math.pow((u - 0.6) / 0.45, 2) + Math.pow((v - 0.45) / 0.4, 2))),
    },
    { // 3 — The Comet Fields: ember and rose clouds streaming from the sun (upper right)
      seed: 44, scale: 2.8, ax: 1.2, ay: 0.8, warp: 1.0, lo: 0.46, hi: 0.7, haze: 0.3, fil: 0.45, lanes: 0.5, hotAmt: 0.5, peak: 98,
      deep: [100, 18, 36], mid: [230, 88, 64], hot: [255, 198, 116], alt: [190, 52, 110],
      env: (u, v) => 0.3 + 0.7 * Math.exp(-Math.pow((v - (u * 0.9 - 0.25)) / 0.34, 2)),
    },
    { // 4 — The Galactic Canopy: rose-violet clouds with golden cores, brighter toward the core above
      seed: 55, scale: 3.2, warp: 0.9, lo: 0.44, hi: 0.74, haze: 0.45, fil: 0.25, lanes: 0.5, hotAmt: 0.6, peak: 95,
      deep: [96, 40, 136], mid: [230, 104, 150], hot: [255, 230, 184], alt: [255, 172, 84],
      env: (u, v) => 0.3 + 0.7 * Math.pow(1 - v, 1.4),
    },
  ];
  const NEB_MENU_SPEC = { // menu key art: violet + cobalt + rose, a luminous diagonal river
    seed: 77, scale: 3.1, warp: 1.1, lo: 0.47, hi: 0.74, haze: 0.5, fil: 0.5, lanes: 0.55, hotAmt: 0.5, peak: 104,
    deep: [46, 28, 128], mid: [196, 68, 152], hot: [255, 206, 170], alt: [36, 110, 200],
    env: (u, v) => 0.22 + 0.78 * Math.exp(-Math.pow((v - (0.2 + u * 0.55)) / 0.3, 2)),
  };
  const NEB_WISP_SPEC = { // soft veils for the menu fly-through layers (fade to black at the
    // borders: these layers are drawn turned, so their edges must never show)
    seed: 88, scale: 2.4, warp: 1.2, lo: 0.55, hi: 0.8, haze: 0.12, fil: 0.45, lanes: 0.7, hotAmt: 0.2, peak: 58,
    deep: [70, 44, 150], mid: [150, 96, 230], hot: [226, 206, 255],
    env: (u, v) => (1 - smooth(0.3, 0.5, Math.abs(u - 0.5))) * (1 - smooth(0.28, 0.5, Math.abs(v - 0.5))),
  };

  // Constellations (sky-chart orientation: north up, east left; x/y in degrees).
  // Camelopardalis — the real giraffe in the sky — and Orion (the old game had it).
  const CONSTELLATIONS = {
    camel: {
      label: 'C A M E L O P A R D A L I S', sub: 'the giraffe', scale: 11,
      pts: [ // α, β, γ, 7 Cam, CS Cam, BE Cam  [x, y, magnitude, colour class]
        [-2.41, -2.34, 4.29, 4], [-4.12, 3.56, 4.03, 2], [3.17, -7.33, 4.63, 0],
        [-4.04, 10.25, 4.47, 0], [7.62, 4.06, 4.21, 1], [4.18, -1.53, 4.39, 3],
      ],
      lines: [[3, 1], [1, 0], [0, 5], [5, 4], [5, 2]],   // hind leg, rump, back, fore leg, neck
      labelY: 13.2,
    },
    orion: {
      label: 'O R I O N', scale: 12,
      pts: [ // Betelgeuse, Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel, Meissa
        [-4.79, -7.41, 0.45, 3], [2.72, -6.35, 1.64, 4], [1.0, 0.3, 2.23, 4], [-0.06, 1.2, 1.69, 4],
        [-1.19, 1.94, 1.77, 4], [-2.94, 9.67, 2.06, 4], [5.37, 8.2, 0.13, 1], [0.23, -9.93, 3.39, 4],
      ],
      lines: [[7, 0], [7, 1], [0, 4], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6]],
      nebula: [0.18, 5.39],   // M42, the Orion Nebula, in the sword
      labelY: 12.6,
    },
  };

  // ==========================================================================
  // state
  // ==========================================================================
  const S = {
    built: false, dpr: 1, W: 1280, H: 720,
    hasLevel: false, levelW: 1, levelH: 1,
    // pre-rendered assets (jobs: {cv, ready})
    neb: [], nebMenu: null, nebWisp: null, core: null, gal1: null, gal2: null,
    giant: null, moon: null, giantR: 0, moonR: 0, gal1D: 0, gal2D: 0,
    sunCorona: null, sunRays: null, sunStreak: null,
    tiles: [], glow: [], spike: [], moteDot: [], moteStreak: [], bokeh: [], glowPink: null,
    spriteDpr: 1, tileDpr: 1,   // resolution the sprites / star tiles were built at
    vign: null, fallTint: null,
    // per-frame render targets (made at init/resize, re-used)
    comp: null, compCtx: null, compScale: 0.4,   // low-res sky + clouds + core
    over: null, overCtx: null,                    // vignette pre-mixed with the fall tint
    // animated populations
    bright: [], motes: [], bokehs: [], rush: [], flow: [],
    BW: 1, BH: 1, sBW: 1, sBH: 1, popW: 0, popH: 0,
    lastZoom: 1, rushPhase: 0, fall: 0, boost: 0, zone: 0, menuNebA: 0, listening: false,
  };
  // per-frame scratch (no allocation in the draw loop)
  const F = { dpr: 1, W: 1, H: 1, cx: 0, cy: 0, cos: 1, sin: 0, shx: 0, shy: 0 };
  const M = { top: [0, 0, 0], mid: [0, 0, 0], bot: [0, 0, 0], neb: new Float32Array(5), w: new Float32Array(8), zone: 0 };

  // ==========================================================================
  // texture jobs — pixel generators that fill an ImageData a few rows per frame
  // ==========================================================================
  const jobs = [];
  // extra: fields merged into the job before it runs (a step sees the job as its 3rd arg).
  // front: queue ahead of everything else (a texture a resize wants back soon).
  function pixelJob(cv, steps, stepFn, immediate, extra, front) {
    const job = { cv, c: cv.getContext('2d'), img: null, steps, i: 0, stepFn, ready: false, onDone: null };
    if (extra) Object.assign(job, extra);
    if (immediate) runJob(job, 0); else if (front) jobs.unshift(job); else jobs.push(job);
    return job;
  }
  function runJob(job, deadline) {
    // the pixel buffer is made on the first step, so queued jobs hold no pixel memory
    if (!job.img) job.img = job.c.createImageData(job.cv.width, job.cv.height);
    while (job.i < job.steps) {
      job.stepFn(job.img.data, job.i++, job);
      if (deadline && (job.i & 1) === 0 && now() > deadline) return false;
    }
    job.c.putImageData(job.img, 0, 0);
    job.img = null;
    job.stepFn = null;   // drop the generator closure (and its float buffers) for the GC
    job.ready = true;
    if (job.onDone) { const f = job.onDone; job.onDone = null; f(job); }
    return true;
  }
  function runJobs(budgetMs) {           // budgetMs = 0 → finish everything now
    const deadline = budgetMs ? now() + budgetMs : 0;
    while (jobs.length) {
      if (!runJob(jobs[0], deadline)) return;
      jobs.shift();
      if (deadline && now() > deadline) return;
    }
  }
  function cancelJob(job) { const i = jobs.indexOf(job); if (i >= 0) jobs.splice(i, 1); }
  function finishJob(job) { if (job && !job.ready) { cancelJob(job); runJob(job, 0); } }   // now, not queued

  // Put a new texture job in holder[key]. If a finished texture is showing there, it stays on
  // screen until the new one is ready (every texture is drawn at a fixed CSS size, so one at
  // the old resolution still fits): a resize never blanks a layer or stalls a frame.
  const swaps = [];
  function swapIn(holder, key, job) {
    for (let i = swaps.length - 1; i >= 0; i--) {   // a newer request replaces a waiting one
      const s = swaps[i];
      if (s.holder === holder && s.key === key) { cancelJob(s.job); swaps.splice(i, 1); }
    }
    const cur = holder[key];
    if (job.ready || !cur || !cur.ready) {
      if (cur && cur !== job && !cur.ready) cancelJob(cur);
      holder[key] = job;
      return;
    }
    const s = { holder, key, job };
    swaps.push(s);
    job.onDone = () => { const i = swaps.indexOf(s); if (i >= 0) { swaps.splice(i, 1); holder[key] = job; } };
  }

  // ---- nebula: warped fBm body (self-shadowed) + broad haze + bright filaments − dust lanes ----
  // Pass 1 computes raw emission into a float buffer; pass 2 rescales so the 98th-percentile
  // brightness lands on spec.peak (every zone reads equally strong whatever the noise did).
  function nebulaJob(tw, th, spec, immediate) {
    const cv = newCanvas(tw, th);
    const rnd = mulberry32(spec.seed), dith = mulberry32(spec.seed * 7 + 3);
    const offX = rnd() * 60, offY = rnd() * 60;
    const deep = spec.deep, mid = spec.mid, hot = spec.hot, alt = spec.alt;
    const asp = th / tw, sc = spec.scale, ax = spec.ax || 1, ay = spec.ay || 1;
    const sw = spec.swirl;
    const buf = new Float32Array(tw * th * 3), samp = new Float32Array(Math.ceil(tw * th / 5) + 8);
    let ns = 0, gain = 1;
    const pass1 = (j) => {
      const v = j / (th - 1);
      let k = j * tw * 3;
      for (let i = 0; i < tw; i++, k += 3) {
        const u = i / (tw - 1);
        let x = u * sc * ax, y = v * sc * asp * ay;
        if (sw) {   // twist the sample point around a centre: spiral arms of gas
          const dx = u - sw.x, dy = (v - sw.y) * asp;
          const ang = sw.k * Math.exp(-(dx * dx + dy * dy) / (sw.r * sw.r));
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const cx = sw.x * sc * ax, cy = sw.y * sc * asp * ay, px = x - cx, py = y - cy;
          x = cx + px * cs - py * sn; y = cy + px * sn + py * cs;
        }
        x += offX; y += offY;
        const wx = fbm(x * 0.8 + 3.1, y * 0.8 + 7.7, 2) - 0.5;
        const wy = fbm(x * 0.8 + 11.4, y * 0.8 + 1.9, 2) - 0.5;
        const qx = x + wx * spec.warp * 2.5, qy = y + wy * spec.warp * 2.5;
        const n = fbm53(qx, qy), n3 = FB3;
        const dens = smooth(spec.lo, spec.hi, n);
        // fake volumetric lighting: brighter where the cloud thickens toward the upper left
        // (3 octaves are enough for the broad slope; n3 is n's own 3-octave partial sum)
        const nl = fbm(qx - 0.045, qy - 0.045, 3);
        const lit = clamp(0.62 + (n3 - nl) * 9, 0.25, 1.45);
        const haze = smooth(0.3, 0.72, fbm(qx * 0.42 + 5.3, qy * 0.42 + 2.1, 2));
        const rg = 1 - Math.abs(2 * fbm(qx * 1.6 + 9.2, qy * 1.6 + 4.4, 3) - 1);
        const rg2 = rg * rg, rg4 = rg2 * rg2, rg8 = rg4 * rg4;
        // wisps along the cloud's iso-lines, faded in and out along their length
        const fil = rg8 * rg2 * smooth(spec.lo - 0.14, spec.lo + 0.04, n) * smooth(0.4, 0.64, fbm(qx * 2.2 + 1.7, qy * 2.2 - 3.1, 2));
        const lane = smooth(0.5, 0.64, fbm(qx * 1.25 - 6.6, qy * 1.25 + 13.1, 4));
        const m1 = smooth(0.36, 0.64, fbm(x * 0.55 + 21.7, y * 0.55 + 3.3, 2));
        const m2 = alt ? smooth(0.46, 0.7, fbm(x * 0.7 - 13.1, y * 0.7 + 17.9, 2)) * 0.75 : 0;
        const env = spec.env ? spec.env(u, v) : 1;
        const body = (Math.pow(dens, 1.6) * 0.95 * lit + haze * spec.haze) * env;
        const hk = dens * dens * dens * spec.hotAmt * env * lit;
        const fk = fil * spec.fil * env;
        const dark = 1 - spec.lanes * lane;
        let r = deep[0] + (mid[0] - deep[0]) * m1, g = deep[1] + (mid[1] - deep[1]) * m1, b = deep[2] + (mid[2] - deep[2]) * m1;
        if (alt) { r += (alt[0] - r) * m2; g += (alt[1] - g) * m2; b += (alt[2] - b) * m2; }
        const oR = (r * body + hot[0] * hk + (mid[0] + hot[0]) * 0.5 * fk) * dark;
        const oG = (g * body + hot[1] * hk + (mid[1] + hot[1]) * 0.5 * fk) * dark;
        const oB = (b * body + hot[2] * hk + (mid[2] + hot[2]) * 0.5 * fk) * dark;
        buf[k] = oR; buf[k + 1] = oG; buf[k + 2] = oB;
        if ((i + j * 3) % 5 === 0 && ns < samp.length) samp[ns++] = Math.max(oR, oG, oB);
      }
    };
    const normalise = () => {   // 98th percentile via a histogram (O(n), no sort hitch)
      let mx = 1;
      for (let i = 0; i < ns; i++) if (samp[i] > mx) mx = samp[i];
      const bins = new Uint32Array(1024), k = 1023 / mx;
      for (let i = 0; i < ns; i++) bins[(samp[i] * k) | 0]++;
      let acc = 0, b = 0;
      const target = ns * 0.98;
      for (; b < 1024; b++) { acc += bins[b]; if (acc >= target) break; }
      gain = spec.peak / Math.max(1, (b + 0.5) / k);
    };
    const pass2 = (D, j) => {
      let k = j * tw * 4, q = j * tw * 3;
      for (let i = 0; i < tw; i++, k += 4, q += 3) {
        const dz = (dith() - 0.5) * 1.6;   // dither: no banding once it is scaled up 4x
        D[k] = buf[q] * gain + dz; D[k + 1] = buf[q + 1] * gain + dz; D[k + 2] = buf[q + 2] * gain + dz;
        D[k + 3] = 255;   // emission: drawn with 'lighter', black adds nothing
      }
    };
    return pixelJob(cv, th * 2, (D, s) => {
      if (s < th) pass1(s);
      else { if (s === th) normalise(); pass2(D, s - th); }
    }, immediate);
  }

  // ---- galactic core: bulge + thin disc of star clouds split by a dark dust rift ----
  function coreJob(immediate) {
    const tw = 640, th = 320, cv = newCanvas(tw, th);
    const ca = Math.cos(0.1), sa = Math.sin(0.1);
    const ramp = [[0, [70, 28, 130]], [0.3, [214, 68, 128]], [0.6, [255, 166, 80]], [0.92, [255, 226, 172]], [1.3, [255, 248, 234]]];
    const row = (D, j) => {
      const v = (j + 0.5) / th - 0.5;            // −0.5..0.5
      let k = j * tw * 4;
      for (let i = 0; i < tw; i++, k += 4) {
        const u = ((i + 0.5) / tw - 0.5) * 2;      // −1..1
        const ur = u * ca - v * sa, vr = u * sa + v * ca;
        const bulge = Math.exp(-Math.sqrt((ur / 0.17) * (ur / 0.17) + (vr / 0.105) * (vr / 0.105)) * 2.0);
        const bulgeW = Math.exp(-Math.sqrt((ur / 0.36) * (ur / 0.36) + (vr / 0.2) * (vr / 0.2)) * 1.8) * 0.35;
        const band = Math.exp(-Math.abs(vr) / 0.045) * (0.25 + 0.75 * Math.exp(-Math.abs(ur) / 0.55));
        const halo = Math.exp(-Math.sqrt((ur / 0.7) * (ur / 0.7) + (vr / 0.32) * (vr / 0.32)) * 2.2) * 0.3;
        const cloud = 0.45 + 1.1 * fbm(ur * 10 + 3.3, vr * 26 + 1.1, 4);          // star clouds
        // the great rift: thin dark lanes hugging the mid-plane, with filaments branching off
        const rift = smooth(0.44, 0.58, fbm(ur * 7 + 11.2, vr * 34 + 5.4, 5)) * Math.exp(-((vr + 0.008) / 0.028) * ((vr + 0.008) / 0.028)) * 0.95;
        const fr = 1 - Math.abs(2 * fbm(ur * 9 - 4.4, vr * 40 + 8.8, 4) - 1);
        const fr2 = fr * fr, fr4 = fr2 * fr2;
        const fil = fr4 * fr4 * fr2 * Math.exp(-(vr / 0.075) * (vr / 0.075)) * 0.6;
        const edge = (1 - smooth(0.72, 1.0, Math.abs(u))) * (1 - smooth(0.28, 0.5, Math.abs(v)));
        const I = (bulge * 1.3 + bulgeW + band * 0.85 * cloud + halo) * (1 - clamp(rift + fil, 0, 0.95)) * edge;
        // colour ramp by intensity
        let a = ramp[0][1], b = ramp[ramp.length - 1][1], t = 0;
        for (let q = 0; q < ramp.length - 1; q++) {
          if (I <= ramp[q + 1][0]) { a = ramp[q][1]; b = ramp[q + 1][1]; t = (I - ramp[q][0]) / (ramp[q + 1][0] - ramp[q][0]); break; }
          if (q === ramp.length - 2) { a = b = ramp[q + 1][1]; t = 0; }
        }
        const e = Math.pow(Math.min(I, 1.25), 0.85) * 0.92;
        D[k] = (a[0] + (b[0] - a[0]) * t) * e;
        D[k + 1] = (a[1] + (b[1] - a[1]) * t) * e;
        D[k + 2] = (a[2] + (b[2] - a[2]) * t) * e;
        D[k + 3] = 255;
      }
    };
    return pixelJob(cv, th, row, immediate);
  }

  // ---- spiral galaxy (emission): bulge + logarithmic arms + HII knots − dust lanes ----
  function galaxyJob(D0, p, immediate, front) {
    const Dp = Math.max(24, Math.round(D0)), cv = newCanvas(Dp, Dp), R = Dp / 2;
    const cp = Math.cos(-p.pa), sp = Math.sin(-p.pa), tanP = 1 / Math.tan(p.pitch);
    const rnd = mulberry32(p.seed), o1 = rnd() * 40, o2 = rnd() * 40, o3 = rnd() * 40;
    const row = (D, j) => {
      let k = j * Dp * 4;
      for (let i = 0; i < Dp; i++, k += 4) {
        const x = (i + 0.5 - R) / R, y = (j + 0.5 - R) / R;
        const xr = x * cp - y * sp, yr = x * sp + y * cp;
        const u = xr, v = yr / p.cosI;
        const r = Math.sqrt(u * u + v * v);
        const rb = Math.sqrt(xr * xr + (yr / 0.8) * (yr / 0.8));
        const fade = 1 - smooth(0.9, 1.0, Math.sqrt(x * x + y * y));
        if (r > 1.0 && rb > 0.45) { D[k] = D[k + 1] = D[k + 2] = 0; D[k + 3] = 255; continue; }
        const th = Math.atan2(v, u);
        const phi = th - Math.log(r + 0.03) * tanP;
        const turb = (fbm(u * 3 + o1, v * 3 + o2, 3) - 0.5) * 1.1;
        const wave = 0.5 + 0.5 * Math.cos(2 * phi + turb);
        const arm = wave * wave * wave;
        const disk = Math.exp(-r / p.scaleR) * (1 - smooth(0.72, 1.0, r));
        const bulge = Math.exp(-rb * rb / 0.0045) + Math.exp(-rb / 0.1) * 0.42;
        const kq = smooth(0.6, 0.8, fbm(u * 16 + o3, v * 16 + o1, 3));
        const knots = kq * kq * arm * arm * smooth(0.12, 0.3, r) * 0.7;
        const lw = 0.5 + 0.5 * Math.cos(2 * phi + turb - 0.85);
        const lw2 = lw * lw, lw4 = lw2 * lw2;
        const lane = lw4 * lw4 * lw2 * smooth(0.06, 0.2, r) * (1 - smooth(0.55, 0.9, r));
        const mottle = 0.6 + 0.8 * fbm(u * 6 + o2, v * 6 + o3, 3);
        const armE = disk * (0.16 + 1.3 * arm) * mottle * (1 - 0.75 * lane);
        const ac = smooth(0.04, 0.32, r);
        const aR = p.core[0] + (p.arm[0] - p.core[0]) * ac, aG = p.core[1] + (p.arm[1] - p.core[1]) * ac, aB = p.core[2] + (p.arm[2] - p.core[2]) * ac;
        const kn = knots * disk * 2.2, bl = bulge * p.coreGain;
        D[k] = (p.core[0] * bl + aR * armE + p.knot[0] * kn) * p.gain * fade;
        D[k + 1] = (p.core[1] * bl + aG * armE + p.knot[1] * kn) * p.gain * fade;
        D[k + 2] = (p.core[2] * bl + aB * armE + p.knot[2] * kn) * p.gain * fade;
        D[k + 3] = 255;
      }
    };
    return pixelJob(cv, Dp, row, immediate, null, front);
  }
  const GAL1_P = { cosI: 0.52, pa: 0.45, pitch: 0.3, scaleR: 0.4, core: [255, 226, 180], arm: [160, 128, 255], knot: [255, 110, 180], gain: 1.0, coreGain: 0.9, seed: 11 };
  const GAL2_P = { cosI: 0.36, pa: -0.6, pitch: 0.33, scaleR: 0.34, core: [255, 236, 204], arm: [140, 182, 255], knot: [255, 128, 190], gain: 1.0, coreGain: 0.9, seed: 23 };

  // ---- ringed gas giant: ray-traced sphere + tilted ring plane, mutual shadows ----
  function ringDensity(rho) {
    if (rho < 1.26 || rho > 2.26) return 0;
    let d;
    if (rho < 1.5) d = 0.1 + 0.22 * smooth(1.26, 1.5, rho);          // faint inner ring
    else if (rho < 1.88) d = 0.72 + 0.12 * Math.sin(rho * 57);        // bright main ring
    else if (rho < 1.95) d = 0.05;                                     // the dark gap
    else if (rho < 2.18) d = 0.5 + 0.08 * Math.sin(rho * 83);         // outer ring
    else d = 0.14;
    d *= 0.82 + 0.36 * vnoise(rho * 95, 7.7);                          // ringlets
    return d * smooth(1.26, 1.3, rho) * (1 - smooth(2.22, 2.26, rho));
  }
  function giantJob(Rpx, immediate, front) {
    const R = Math.max(20, Math.round(Rpx));
    const roll = -0.3, sT = 0.3, cT = Math.sqrt(1 - sT * sT);
    const halfW = Math.ceil(R * 2.24) + 3, halfH = Math.ceil(R * 1.02) + 3;
    const w = halfW * 2, h = halfH * 2, cv = newCanvas(w, h);
    const cr = Math.cos(-roll), sr = Math.sin(-roll);
    let Lx = -0.78, Ly = -0.42, Lz = 0.47;                           // sun off to the upper left
    const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln;
    const lx = Lx * cr - Ly * sr, ly = Lx * sr + Ly * cr, lz = Lz;     // light in the ring frame
    const Ny = -cT, Nz = sT;                                          // ring-plane normal (pole)
    const LdotN = ly * Ny + lz * Nz;
    const CREAM = [236, 214, 170], TAN = [206, 164, 110], RUST = [168, 104, 62], PALE = [238, 226, 198];
    const BROWN = [120, 78, 50], POLE = [150, 142, 124], STORM = [218, 126, 84];
    const AMB = [6, 16, 26], RIM = [60, 190, 185], RA = [224, 206, 172], RB = [168, 138, 106];
    const BRIGHT = 0.88, sub = 0.25 / R;
    const row = (D, j) => {
      let k = j * w * 4;
      for (let i = 0; i < w; i++, k += 4) {
        const px = (i + 0.5 - halfW) / R, py = (j + 0.5 - halfH) / R;
        const xr = px * cr - py * sr, yr = px * sr + py * cr;
        // --- planet ---
        const r2 = xr * xr + yr * yr;
        let pa = 0, pR = 0, pG = 0, pB = 0, zp = -9;
        if (r2 < 1 + 3 / R) {
          const rr = Math.sqrt(r2);
          pa = clamp((1 - rr) * R + 0.5, 0, 1);
          const z = Math.sqrt(Math.max(0, 1 - Math.min(r2, 1)));
          zp = z;
          const lat = yr * Ny + z * Nz;
          const tt = lat + 0.06 * (fbm(xr * 2.3 + 4.1, lat * 10 + 1.7, 3) - 0.5) + 0.018 * Math.sin(xr * 7 + lat * 30);
          const s1 = 0.5 + 0.5 * Math.sin(tt * 24 + 0.6), s2 = 0.5 + 0.5 * Math.sin(tt * 10.5 + 1.9), s3 = 0.5 + 0.5 * Math.sin(tt * 47 + 0.3);
          let cR = lerp(CREAM[0], TAN[0], s1), cG = lerp(CREAM[1], TAN[1], s1), cB = lerp(CREAM[2], TAN[2], s1);
          const mr = s2 * s2 * s2 * 0.75, mp = Math.pow(1 - s2, 4) * 0.45, mb = Math.pow(s3, 8) * 0.3;
          cR = lerp(cR, RUST[0], mr); cG = lerp(cG, RUST[1], mr); cB = lerp(cB, RUST[2], mr);
          cR = lerp(cR, PALE[0], mp); cG = lerp(cG, PALE[1], mp); cB = lerp(cB, PALE[2], mp);
          cR = lerp(cR, BROWN[0], mb); cG = lerp(cG, BROWN[1], mb); cB = lerp(cB, BROWN[2], mb);
          const pol = smooth(0.66, 0.95, Math.abs(tt)) * 0.55;
          cR = lerp(cR, POLE[0], pol); cG = lerp(cG, POLE[1], pol); cB = lerp(cB, POLE[2], pol);
          const e = Math.pow((xr - 0.32) / 0.17, 2) + Math.pow((lat + 0.3) / 0.065, 2);   // the storm
          if (e < 1.6) {
            const st = (1 - smooth(0.45, 1.0, e)) * 0.85, ring = smooth(0.7, 1.0, e) * (1 - smooth(1.0, 1.5, e)) * 0.4;
            cR = lerp(cR, STORM[0], st); cG = lerp(cG, STORM[1], st); cB = lerp(cB, STORM[2], st);
            cR = lerp(cR, PALE[0], ring); cG = lerp(cG, PALE[1], ring); cB = lerp(cB, PALE[2], ring);
          }
          const ndl = xr * lx + yr * ly + z * lz;
          const diff = smooth(-0.1, 0.7, ndl);
          const limb = 0.55 + 0.45 * Math.pow(z, 0.45);
          let rs = 1;                                   // shadow of the rings on the planet
          const tq = -(yr * Ny + z * Nz) / LdotN;
          if (tq > 0) { const qx = xr + lx * tq, qy = yr + ly * tq, qz = z + lz * tq; rs = 1 - 0.7 * ringDensity(Math.sqrt(qx * qx + qy * qy + qz * qz)); }
          const lit = diff * limb * rs * BRIGHT;
          const rim = Math.pow(1 - z, 3) * 0.3 * (0.25 + 0.75 * diff);
          pR = cR * lit + AMB[0] * (1 - diff) + RIM[0] * rim;
          pG = cG * lit + AMB[1] * (1 - diff) + RIM[1] * rim;
          pB = cB * lit + AMB[2] * (1 - diff) + RIM[2] * rim;
        }
        // --- rings (4 sub-samples: they are thin ellipses and alias badly otherwise) ---
        let rd = 0, rho = 0;
        const yc = yr / sT, rc = Math.sqrt(xr * xr + yc * yc);
        if (rc > 1.18 && rc < 2.34) {
          for (let s = 0; s < 4; s++) {
            const X = xr + ((s & 1) ? sub : -sub), Y = (yr + ((s & 2) ? sub : -sub)) / sT;
            const q = Math.sqrt(X * X + Y * Y);
            rd += ringDensity(q); rho += q;
          }
          rd *= 0.25; rho *= 0.25;
        }
        let ra = 0, rR = 0, rG = 0, rB = 0, zr = 0;
        if (rd > 0.002) {
          zr = (yr / sT) * cT;
          const tone = vnoise(rho * 26, 3.3);
          let sh = 1;                                    // the planet's shadow across the rings
          const dp = xr * lx + yr * ly + zr * lz;
          if (dp < 0) { const perp = Math.sqrt(Math.max(0, xr * xr + yr * yr + zr * zr - dp * dp)); sh = 0.12 + 0.88 * smooth(0.97, 1.05, perp); }
          const br = 0.95 * sh;
          rR = lerp(RA[0], RB[0], tone) * br; rG = lerp(RA[1], RB[1], tone) * br; rB = lerp(RA[2], RB[2], tone) * br;
          ra = Math.min(1, rd * 1.05);
        }
        // --- composite (premultiplied, then back to straight alpha) ---
        let oR, oG, oB, oA;
        if (pa > 0 && ra > 0 && zr > zp) {          // ring passes in front of the planet
          oA = ra + pa * (1 - ra);
          oR = rR * ra + pR * pa * (1 - ra); oG = rG * ra + pG * pa * (1 - ra); oB = rB * ra + pB * pa * (1 - ra);
        } else if (pa > 0) {                          // planet in front (ring behind or absent)
          oA = pa + ra * (1 - pa);
          oR = pR * pa + rR * ra * (1 - pa); oG = pG * pa + rG * ra * (1 - pa); oB = pB * pa + rB * ra * (1 - pa);
        } else {
          oA = ra; oR = rR * ra; oG = rG * ra; oB = rB * ra;
        }
        if (oA > 0.001) { D[k] = oR / oA; D[k + 1] = oG / oA; D[k + 2] = oB / oA; D[k + 3] = oA * 255; }
        else { D[k] = D[k + 1] = D[k + 2] = D[k + 3] = 0; }
      }
    };
    const job = pixelJob(cv, h, row, immediate, null, front);
    job.halfW = halfW; job.halfH = halfH; job.R = R;
    return job;
  }

  // ---- cratered moon: heightfield of foreshortened craters, bump-lit, maria, a rayed crater ----
  function moonJob(Rpx, immediate, front) {
    const R = Math.max(12, Math.round(Rpx)), pad = 3, w = 2 * (R + pad), c0 = R + pad;
    const cv = newCanvas(w, w);
    const hf = new Float32Array(w * w);
    const rnd = mulberry32(4242), craters = [];
    for (let i = 0; i < 110; i++) {
      let x, y;
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; } while (x * x + y * y > 0.97);
      const z = Math.sqrt(1 - x * x - y * y), rho = Math.hypot(x, y) || 1;
      craters.push({ x, y, z: Math.max(0.18, z), ux: x / rho, uy: y / rho, r: 0.018 + 0.15 * Math.pow(rnd(), 3.2), d: 0.4 + 0.4 * rnd() });
    }
    const rayC = { x: 0.2, y: 0.4, z: Math.sqrt(1 - 0.2 * 0.2 - 0.4 * 0.4), ux: 0.447, uy: 0.894, r: 0.055, d: 0.8 };
    craters.push(rayC);
    let Lx = -0.8, Ly = -0.36, Lz = 0.48;                            // side light: a gibbous moon
    const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln;
    function craterLocal(c, px, py) {   // distance in crater radii, undoing limb foreshortening
      const dx = px - c.x, dy = py - c.y;
      const a = (dx * c.ux + dy * c.uy) / c.z, b = -dx * c.uy + dy * c.ux;
      return Math.sqrt(a * a + b * b) / c.r;
    }
    const heightRow = (j) => {
      for (let i = 0; i < w; i++) {
        const px = (i + 0.5 - c0) / R, py = (j + 0.5 - c0) / R;
        if (px * px + py * py > 1.1) continue;
        let h = 0.012 * fbm(px * 9 + 2, py * 9 + 5, 3);
        for (let n = 0; n < craters.length; n++) {
          const c = craters[n];
          if (Math.abs(px - c.x) > c.r * 2.2 || Math.abs(py - c.y) > c.r * 2.2) continue;
          const d = craterLocal(c, px, py);
          if (d > 2) continue;
          const dep = c.d * c.r;
          if (d < 1) h -= dep * 0.5 * (1 - d * d) * (1 - d * d * 0.35);
          h += dep * 0.16 * Math.exp(-((d - 1) / 0.2) * ((d - 1) / 0.2));
          if (c.r > 0.1) h += dep * 0.15 * Math.exp(-(d / 0.14) * (d / 0.14));
        }
        hf[j * w + i] = h;
      }
    };
    const shadeRow = (D, j) => {
      let k = j * w * 4;
      for (let i = 0; i < w; i++, k += 4) {
        const px = (i + 0.5 - c0) / R, py = (j + 0.5 - c0) / R;
        const r2 = px * px + py * py;
        if (r2 > 1 + 3 / R) { D[k] = D[k + 1] = D[k + 2] = D[k + 3] = 0; continue; }
        const rr = Math.sqrt(r2), a = clamp((1 - rr) * R + 0.5, 0, 1);
        const z = Math.sqrt(Math.max(0.0001, 1 - Math.min(r2, 1)));
        const il = Math.max(0, i - 1), ir = Math.min(w - 1, i + 1), ju = Math.max(0, j - 1), jd = Math.min(w - 1, j + 1);
        const gx = (hf[j * w + ir] - hf[j * w + il]) * R * 0.5, gy = (hf[jd * w + i] - hf[ju * w + i]) * R * 0.5;
        let nx = px - gx * 1.1 * z, ny = py - gy * 1.1 * z, nz = z;           // bumps flatten toward the limb
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const ndl = nx * Lx + ny * Ly + nz * Lz;
        let alb = 0.74 - 0.24 * smooth(0.48, 0.6, fbm(px * 1.8 + 5, py * 1.8 + 1, 4));   // maria
        alb += 0.06 * (fbm(px * 14 + 1, py * 14 + 9, 2) - 0.5);
        const rd = craterLocal(rayC, px, py);                                          // the rayed crater
        if (rd < 9) {
          const ang = Math.atan2(py - rayC.y, px - rayC.x);
          const ray = Math.pow(0.5 + 0.5 * Math.cos(ang * 13 + 2 * vnoise(ang * 3 + 7, 1.1)), 14);
          alb += (ray * 0.22 * Math.exp(-rd / 3.5) + 0.2 * Math.exp(-rd * rd * 0.8)) * smooth(0.8, 1.3, rd + 0.5);
        }
        const shade = (smooth(-0.06, 0.2, ndl) * 0.55 + clamp(ndl, 0, 1) * 0.55) * (0.86 + 0.14 * z) * alb;
        const earth = (1 - smooth(-0.1, 0.25, ndl)) * 0.05;                             // warm earthshine
        D[k] = 226 * shade + 255 * earth + 10;
        D[k + 1] = 220 * shade + 160 * earth + 13;
        D[k + 2] = 210 * shade + 120 * earth + 28;
        D[k + 3] = a * 255;
      }
    };
    const job = pixelJob(cv, w * 2, (D, s) => (s < w ? heightRow(s) : shadeRow(D, s - w)), immediate, null, front);
    job.R = R; job.half = c0;
    return job;
  }

  // ---- the sun: corona, slowly turning rays, an anamorphic streak ----
  function sunJobs() {
    const cs = 320, corona = newCanvas(cs, cs);
    const ramp = (r) => {
      if (r < 0.05) return [255, 253, 246];
      if (r < 0.12) return mixRGB([255, 253, 246], [255, 236, 184], (r - 0.05) / 0.07);
      if (r < 0.24) return mixRGB([255, 236, 184], [255, 178, 80], (r - 0.12) / 0.12);
      if (r < 0.45) return mixRGB([255, 178, 80], [255, 106, 74], (r - 0.24) / 0.21);
      return mixRGB([255, 106, 74], [210, 64, 122], Math.min(1, (r - 0.45) / 0.35));
    };
    const cj = pixelJob(corona, cs, (D, j) => {
      let k = j * cs * 4;
      for (let i = 0; i < cs; i++, k += 4) {
        const r = Math.hypot(i + 0.5 - cs / 2, j + 0.5 - cs / 2) / (cs / 2);
        const disc = 1 - smooth(0.036, 0.044, r);
        const I = (disc * 1.2 + 0.9 * Math.exp(-r / 0.03) + 0.48 * Math.exp(-r / 0.085) + 0.22 * Math.exp(-r / 0.22) + 0.06 * Math.exp(-r / 0.5)) * (1 - smooth(0.85, 1, r));
        const c = ramp(r);
        D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = Math.min(1, I) * 255;
      }
    }, true);   // the title screen's sunrise uses it straight away
    const rs = 384, rays = newCanvas(rs, rs), rnd = mulberry32(99);
    const RAYS = [];
    for (let n = 0; n < 12; n++) RAYS.push({ a: rnd() * TAU, len: 0.35 + 0.65 * rnd(), w: 1.2 + 2.6 * rnd(), s: 0.35 + 0.65 * rnd() });
    const rj = pixelJob(rays, rs, (D, j) => {
      let k = j * rs * 4;
      for (let i = 0; i < rs; i++, k += 4) {
        const dx = i + 0.5 - rs / 2, dy = j + 0.5 - rs / 2, r = Math.hypot(dx, dy) / (rs / 2), th = Math.atan2(dy, dx);
        let I = 0;
        for (let n = 0; n < RAYS.length; n++) {
          const ry = RAYS[n];
          if (r >= ry.len) continue;
          let d = th - ry.a; d -= TAU * Math.round(d / TAU);
          const q = d * r * (rs / 2) / ry.w;
          if (q > 3 || q < -3) continue;          // exp(-9): nothing to add
          I += Math.exp(-q * q) * Math.pow(1 - r / ry.len, 1.6) * ry.s;
        }
        D[k] = 255; D[k + 1] = 222; D[k + 2] = 178; D[k + 3] = Math.min(1, I) * 255;
      }
    }, false);
    const sw = 512, shh = 40, streak = newCanvas(sw, shh);
    const sj = pixelJob(streak, shh, (D, j) => {
      let k = j * sw * 4;
      const y = j + 0.5 - shh / 2;
      for (let i = 0; i < sw; i++, k += 4) {
        const x = Math.abs((i + 0.5) / sw - 0.5) * 2;
        const I = Math.exp(-(y / 2.2) * (y / 2.2)) * Math.pow(1 - x, 2.2) + Math.exp(-(y / 9) * (y / 9)) * Math.pow(1 - x, 5) * 0.25;
        D[k] = 255; D[k + 1] = 214; D[k + 2] = 186; D[k + 3] = Math.min(1, I) * 255;
      }
    }, true);
    return { cj, rj, sj };
  }

  // ---- small sprites (glow, spikes, dust) — rendered at device resolution ----
  // Made at once at boot (the title screen needs them); a later rebuild for a new dpr runs in
  // the background at the head of the queue and swaps in (see swapIn / buildSprites).
  let spritesNow = true;
  function spriteJob(wCss, hCss, dpr, fn) {   // fn(xCss, yCss, out) → out = [r,g,b,a 0..1]
    const w = Math.max(2, Math.round(wCss * dpr)), h = Math.max(2, Math.round(hCss * dpr));
    const cv = newCanvas(w, h), out = [0, 0, 0, 0];
    return pixelJob(cv, h, (D, j) => {
      let k = j * w * 4;
      for (let i = 0; i < w; i++, k += 4) {
        fn(((i + 0.5) / w - 0.5) * wCss, ((j + 0.5) / h - 0.5) * hCss, out);
        D[k] = out[0]; D[k + 1] = out[1]; D[k + 2] = out[2]; D[k + 3] = clamp(out[3], 0, 1) * 255;
      }
    }, spritesNow, null, true);
  }
  function glowSprite(col, dpr) {   // 64 css px; a star's core + bloom
    return spriteJob(64, 64, dpr, (x, y, o) => {
      const r = Math.hypot(x, y) / 32, r2 = r * r;
      const I = (Math.exp(-r2 * 70) + Math.exp(-r2 * 16) * 0.5 + Math.exp(-r2 * 3.4) * 0.14) * (1 - smooth(0.8, 1, r));
      const wh = Math.exp(-r2 * 45);
      o[0] = lerp(col[0], 255, wh); o[1] = lerp(col[1], 255, wh); o[2] = lerp(col[2], 255, wh); o[3] = I;
    });
  }
  function spikeSprite(col, dpr) {  // 64 css px; 4-point diffraction cross
    return spriteJob(64, 64, dpr, (x, y, o) => {
      const ax = Math.abs(x), ay = Math.abs(y);
      const hz = ax < 32 ? Math.exp(-(y / 1.0) * (y / 1.0)) * Math.pow(1 - ax / 32, 2.4) : 0;
      const vt = ay < 32 ? Math.exp(-(x / 1.0) * (x / 1.0)) * Math.pow(1 - ay / 32, 2.4) : 0;
      o[0] = lerp(col[0], 255, 0.4); o[1] = lerp(col[1], 255, 0.4); o[2] = lerp(col[2], 255, 0.4);
      o[3] = (hz + vt - hz * vt) * 0.95;
    });
  }
  function moteDotSprite(col, dpr) {   // 32 css; soft dot, visible radius ≈ 5 css px
    return spriteJob(32, 32, dpr, (x, y, o) => {
      const r2 = (x * x + y * y) / 256;
      const wh = 0.35 + 0.65 * Math.exp(-r2 * 40);
      o[0] = lerp(col[0], 255, wh); o[1] = lerp(col[1], 255, wh); o[2] = lerp(col[2], 255, wh);
      o[3] = Math.exp(-r2 * 10) * (1 - smooth(0.85, 1, Math.sqrt(r2)));
    });
  }
  function moteStreakSprite(col, dpr) {   // 64×16 css; tail at x=0 → bright head at x=56
    return spriteJob(64, 16, dpr, (x, y, o) => {
      const X = x + 32;
      const along = X < 56 ? Math.pow(X / 56, 1.8) : Math.pow(Math.max(0, 1 - (X - 56) / 8), 2);
      const I = along * Math.exp(-(y / 2.2) * (y / 2.2)) + Math.exp(-((X - 55) / 3) * ((X - 55) / 3) - (y / 1.6) * (y / 1.6)) * 0.6;
      const wh = Math.min(1, 0.3 + 0.7 * smooth(30, 58, X));
      o[0] = lerp(col[0], 255, wh); o[1] = lerp(col[1], 255, wh); o[2] = lerp(col[2], 255, wh); o[3] = I;
    });
  }
  function bokehSprite(col, dpr) {    // 64 css; out-of-focus disc (radius 25.6 css) with a brighter rim
    return spriteJob(64, 64, dpr, (x, y, o) => {
      const rr = Math.hypot(x, y) / 25.6;
      const inside = 1 - smooth(0.93, 1.02, rr);
      const rim = Math.exp(-((rr - 0.93) / 0.06) * ((rr - 0.93) / 0.06)) * 0.6;
      const outer = rr > 1 ? Math.exp(-((rr - 1) / 0.12) * ((rr - 1) / 0.12)) * 0.08 : 0;
      o[0] = lerp(col[0], 255, 0.3); o[1] = lerp(col[1], 255, 0.3); o[2] = lerp(col[2], 255, 0.3);
      o[3] = inside * (0.42 + 0.22 * rr * rr + rim) + outer;
    });
  }

  // ---- a wrapped star tile: Gaussian-splatted stars, clustered into faint star clouds ----
  // T device px square, drawn T/dpr CSS px wide: exactly 1:1 on screen at any dpr (0.75, 1.6…).
  // Step 0 splats every star into a float buffer, steps 1..T convert a row each (so a rebuild
  // after a resolution change can run in the background). A `sparse` layer keeps each star's
  // footprint inside the tile and records the rectangles that hold stars (job.rects, job.n).
  function starTile(L, dpr, immediate) {
    const T = Math.max(16, Math.round(L.size * dpr));
    let acc = null;
    const extra = { size: T / dpr, P: L.P, depth: L.depth, alpha: L.alpha, rects: null, n: 0 };
    return pixelJob(newCanvas(T, T), T + 1, (D, s, job) => {
      if (s === 0) { acc = new Float32Array(T * T * 3); splatStars(L, T, dpr, acc, job); return; }
      const j = s - 1;
      for (let p = j * T, k = p * 4, e = p + T; p < e; p++, k += 4) {   // (ImageData starts transparent)
        const r = acc[p * 3], g = acc[p * 3 + 1], bl = acc[p * 3 + 2];
        const m = Math.max(r, g, bl);
        if (m < 0.5) continue;
        const a = Math.min(1, m / 255);
        D[k] = r / a; D[k + 1] = g / a; D[k + 2] = bl / a; D[k + 3] = a * 255;
      }
      if (j === T - 1) acc = null;
    }, immediate, extra, !immediate);
  }
  function splatStars(L, T, dpr, acc, job) {
    const rnd = mulberry32(L.seed);
    const boxes = L.sparse ? [] : null;
    const splat = (x, y, sigma, col, inten) => {
      const rad = Math.ceil(sigma * 3), inv = 1 / (2 * sigma * sigma);
      const x0 = Math.floor(x) - rad, y0 = Math.floor(y) - rad;
      for (let yy = y0; yy <= y0 + 2 * rad + 1; yy++) {
        const dy = yy + 0.5 - y, Y = posmod(yy, T);
        for (let xx = x0; xx <= x0 + 2 * rad + 1; xx++) {
          const dx = xx + 0.5 - x, wgt = Math.exp(-(dx * dx + dy * dy) * inv) * inten;
          if (wgt < 0.002) continue;
          const idx = (Y * T + posmod(xx, T)) * 3;
          acc[idx] += col[0] * wgt; acc[idx + 1] += col[1] * wgt; acc[idx + 2] += col[2] * wgt;
        }
      }
    };
    let placed = 0, tries = 0;
    while (placed < L.count && tries < L.count * 30) {
      tries++;
      let x = rnd() * T, y = rnd() * T;
      if (L.cluster) {   // tileable density field → the far layer clumps into Milky-Way-ish clouds
        const u = x / T, v = y / T;
        const dn = 0.62 * tvnoise(u * 4, v * 4, 4) + 0.38 * tvnoise(u * 8 + 3, v * 8 + 5, 8);
        if (rnd() > (1 - L.cluster) + L.cluster * smooth(0.3, 0.72, dn)) continue;
      }
      placed++;
      const q = rnd();
      const b = lerp(L.b[0], L.b[1], q * q * q);                 // many faint, few bright
      const rC = lerp(L.r[0], L.r[1], Math.pow(rnd(), 1.6)) * (0.7 + 0.6 * q);
      const col = STAR_COLS[pickStarCol(rnd())];
      const sigma = Math.max(0.42, rC * dpr * 0.62);
      const halo = L.halo && q > 0.6;
      if (boxes) {
        // footprint = the widest splat (± rad px, as splat() loops it) + 1 px of empty border;
        // nudge the star inward so that box never wraps across the tile edge
        const rad = Math.ceil((halo ? sigma * 4 : sigma) * 3);
        const lo = rad + 1, hi = T - rad - 3;
        if (hi > lo) { x = clamp(x, lo, hi); y = clamp(y, lo, hi); }
        const fx = Math.floor(x), fy = Math.floor(y);
        boxes.push([Math.max(0, fx - rad - 1), Math.max(0, fy - rad - 1), Math.min(T, fx + rad + 3), Math.min(T, fy + rad + 3)]);
      }
      splat(x, y, sigma, col, b);
      if (halo) splat(x, y, sigma * 4, col, b * L.halo);
    }
    if (!boxes) return;
    // Overlapping boxes are merged (drawing an overlap twice would double its light) until all
    // are disjoint; each then has an empty 1 px border, so bilinear sampling at its edge only
    // ever reads black, and adjacent boxes can be drawn separately without a seam.
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) {
            a[0] = Math.min(a[0], c[0]); a[1] = Math.min(a[1], c[1]); a[2] = Math.max(a[2], c[2]); a[3] = Math.max(a[3], c[3]);
            boxes.splice(j, 1); merged = true; break;
          }
        }
      }
    }
    const R = new Float32Array(boxes.length * 4);
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      R[i * 4] = bx[0]; R[i * 4 + 1] = bx[1]; R[i * 4 + 2] = bx[2] - bx[0]; R[i * 4 + 3] = bx[3] - bx[1];
    }
    job.rects = R; job.n = boxes.length;
  }

  // ---- screen-size sprites: vignette + fast-fall edge tint (low-res, stretched) ----
  // Only the aspect ratio matters, so they are re-made (in the same canvases) only when it changes.
  function edgeSprites(W, H) {
    const w = 192, h = Math.max(2, Math.round(192 * H / Math.max(1, W)));
    if (S.vign && S.vign.width === w && S.vign.height === h) return;
    const vign = sizeCanvas(S.vign, w, h), tint = sizeCanvas(S.fallTint, w, h);
    S.over = sizeCanvas(S.over, w, h);            // per-frame mix of the two (drawFront)
    if (!S.overCtx) S.overCtx = S.over.getContext('2d');
    pixelJob(vign, h, (D, j) => {
      let k = j * w * 4;
      for (let i = 0; i < w; i++, k += 4) {
        const dx = ((i + 0.5) / w - 0.5) * 2, dy = ((j + 0.5) / h - 0.5) * 2;
        const d = Math.sqrt(dx * dx * 0.9 + dy * dy);
        D[k] = 4; D[k + 1] = 3; D[k + 2] = 12; D[k + 3] = Math.pow(smooth(0.5, 1.5, d), 1.2) * 255;
      }
    }, true);
    pixelJob(tint, h, (D, j) => {
      let k = j * w * 4;
      const vy = (j + 0.5) / h, m = smooth(0.15, 0.95, vy);
      for (let i = 0; i < w; i++, k += 4) {
        const dx = ((i + 0.5) / w - 0.5) * 2, dy = (vy - 0.5) * 2;
        const d = Math.sqrt(dx * dx * 0.9 + dy * dy);
        D[k] = lerp(111, 255, m); D[k + 1] = lerp(184, 64, m); D[k + 2] = lerp(255, 86, m);
        D[k + 3] = Math.pow(smooth(0.68, 1.45, d), 1.5) * 255;
      }
    }, true);
    S.vign = vign; S.fallTint = tint;
  }

  // ---- the low-res composite target for the soft layers (sky + clouds + core) ----
  // Sized so each cloud / core texel gets ~COMP_TEXEL composite px (nothing is lost: those
  // textures are drawn 4-8x magnified anyway), and never more than 0.45 × the device resolution.
  function setupComp() {
    const W = S.W, H = S.H;
    const nebCss = Math.max(W / K.NEB_W, H / K.NEB_H) * K.NEB_MARGIN;   // CSS px per cloud texel
    const coreCss = Math.max(W * 1.7, H * 2.6) / 640;                    // … per core texel
    const wispCss = Math.max(W / 320, H / 180) * 1.05;                   // … per menu veil texel
    const cs = clamp(K.COMP_TEXEL / Math.max(0.1, Math.min(nebCss, coreCss, wispCss)),
      K.COMP_SCALE[0], Math.max(K.COMP_SCALE[0], Math.min(K.COMP_SCALE[1], 0.45 * S.dpr)));
    const had = !!S.comp;
    S.comp = sizeCanvas(S.comp, Math.ceil(W * cs), Math.ceil(H * cs));
    // opaque: the browser can put it on screen as a plain copy (no blending)
    if (!had) S.compCtx = S.comp.getContext('2d', { alpha: false }) || S.comp.getContext('2d');
    S.compScale = cs;
  }

  // ==========================================================================
  // builders
  // ==========================================================================
  function unit() { return Math.min(S.H, S.W * 0.62); }

  // Glow / spike / dust sprites at (quantised) resolution q. At boot they are made at once;
  // later rebuilds run in the background and swap in sprite by sprite.
  function buildSprites(q, immediate) {
    spritesNow = !!immediate;
    const tints = [[255, 255, 255]].concat(ZONE_TINT);
    for (let i = 0; i < STAR_COLS.length; i++) {
      swapIn(S.glow, i, glowSprite(STAR_COLS[i], q));
      swapIn(S.spike, i, spikeSprite(STAR_COLS[i], q));
    }
    for (let i = 0; i < tints.length; i++) {
      swapIn(S.moteDot, i, moteDotSprite(tints[i], q));
      swapIn(S.moteStreak, i, moteStreakSprite(tints[i], q));
      swapIn(S.bokeh, i, bokehSprite(tints[i], q));
    }
    swapIn(S, 'glowPink', glowSprite([255, 120, 170], q));
    spritesNow = true;
    S.spriteDpr = q;
  }
  // The three star tiles at exactly dpr d (their crisp 1:1 look depends on it).
  function buildTiles(d, immediate) {
    for (let i = 0; i < K.TILES.length; i++) swapIn(S.tiles, i, starTile(K.TILES[i], d, immediate));
    S.tileDpr = d;
  }

  // Sprites whose pixel size follows the screen (re-made only on a big size change, in the
  // background; the old one stays up meanwhile). front = jump the queue (mid-game resize).
  function buildSizedAssets(force, front) {
    const U = unit(), d = S.dpr;
    const want = (cur, target) => force || !cur || target / cur > 1.3 || target / cur < 0.77;
    const gR = Math.min(300, K.GIANT.size * U * d), mR = Math.min(170, K.MOON.size * U * d);
    const g1 = Math.min(560, K.GAL1.size * U * Math.min(d, 1.5)), g2 = Math.min(400, K.GAL2.size * U * Math.min(d, 1.5));
    if (want(S.giantR, gR)) { swapIn(S, 'giant', giantJob(gR, false, front)); S.giantR = gR; }
    if (want(S.moonR, mR)) { swapIn(S, 'moon', moonJob(mR, false, front)); S.moonR = mR; }
    if (want(S.gal1D, g1)) { swapIn(S, 'gal1', galaxyJob(g1, GAL1_P, false, front)); S.gal1D = g1; }
    // the title screen shows the small galaxy: the very first one is made at once
    if (want(S.gal2D, g2)) { swapIn(S, 'gal2', galaxyJob(g2, GAL2_P, !S.gal2, true)); S.gal2D = g2; }
  }

  function setupPopulations() {
    if (S.popW === S.W && S.popH === S.H) return;   // (a dpr-only change keeps the dust where it is)
    S.popW = S.W; S.popH = S.H;
    const W = S.W, H = S.H, m = K.DUST_MARGIN;
    // bright stars live in a wrapped box slightly larger than the screen
    S.sBW = W + 120; S.sBH = H + 120;
    let rnd = mulberry32(515);
    S.bright.length = 0;
    for (let i = 0; i < K.BRIGHT_COUNT; i++) {
      const q = rnd();
      S.bright.push({
        x: rnd() * S.sBW, y: rnd() * S.sBH, P: lerp(K.BRIGHT_P[0], K.BRIGHT_P[1], rnd()),
        b: 0.45 + 0.55 * q, size: 9 + 16 * q * q, c: pickStarCol(rnd()),
        spike: q > 1 - K.SPIKE_FRACTION, spikeLen: 12 + 22 * q,
        f1: 0.7 + 2.2 * rnd(), f2: 1.9 + 3.1 * rnd(), p1: rnd() * TAU, p2: rnd() * TAU,
      });
    }
    // near-field dust
    S.BW = W + 2 * m; S.BH = H + 2 * m;
    rnd = mulberry32(777);
    S.motes.length = 0;
    for (let i = 0; i < K.MOTES; i++) {
      const dq = Math.pow(rnd(), 1.4), d = lerp(K.MOTE_DEPTH[0], K.MOTE_DEPTH[1], dq);
      S.motes.push({
        x: rnd() * S.BW, y: rnd() * S.BH, d, r: lerp(0.7, 2.1, dq) * (0.8 + 0.4 * rnd()),
        a: 0.5 + 0.5 * rnd(), f: 0.6 + 2.2 * rnd(), p: rnd() * TAU, tint: rnd() < 0.45 ? 1 : 0,
        dx: (rnd() - 0.5) * 8, dy: (rnd() - 0.5) * 8,
      });
    }
    S.bokehs.length = 0;
    for (let i = 0; i < K.BOKEH; i++) {
      const d = lerp(K.BOKEH_DEPTH[0], K.BOKEH_DEPTH[1], rnd());
      S.bokehs.push({ x: rnd() * S.BW, y: rnd() * S.BH, d, r: 14 + 30 * rnd(), a: 0.03 + 0.04 * rnd(), dx: (rnd() - 0.5) * 6, dy: (rnd() - 0.5) * 6 });
    }
    // fast-fall rush lines (their own stream; the draws below skip what the old 22-line set
    // used, so the title screen's fly-through stars stay exactly where they were)
    for (let i = 0; i < 22 * 7; i++) rnd();
    const rr = mulberry32(919);
    S.rush.length = 0;
    for (let i = 0; i < K.RUSH_LINES; i++) {
      const e = Math.pow(rr(), 2.2) * K.RUSH_EDGE;   // hug the screen edges, clear of the giraffe
      S.rush.push({ fx: rr() < 0.5 ? 0.01 + e : 0.99 - e, y0: rr(), v: 0.7 + 0.6 * rr(), l: lerp(K.RUSH_LEN[0], K.RUSH_LEN[1], rr()), a: 0.45 + 0.55 * rr(), w: 0.6 + 0.9 * rr() });
    }
    // menu fly-through stars
    S.flow.length = 0;
    for (let i = 0; i < K.MENU_FLOW; i++) {
      S.flow.push({ X: rnd() * 2 - 1, Y: rnd() * 2 - 1, ph: rnd(), b: 0.35 + 0.65 * Math.pow(rnd(), 2), s: 0.6 + 0.8 * rnd(), c: pickStarCol(rnd()) });
    }
  }

  // ==========================================================================
  // per-frame transform helpers
  // ==========================================================================
  function frameSetup(W, H, tilt, shx, shy) {
    F.dpr = ASCENT.dpr || 1; F.W = W; F.H = H; F.cx = W / 2; F.cy = H / 2;
    F.cos = Math.cos(tilt); F.sin = Math.sin(tilt); F.shx = shx; F.shy = shy;
  }
  function layerScale(zoom, depth) { return 1 + (zoom - 1) * depth; }
  // A backdrop layer: scaled by ls about the screen centre, leaning with the camera tilt.
  function setLayer(ctx, ls) {
    const d = F.dpr, c = F.cos * ls, s = F.sin * ls;
    ctx.setTransform(d * c, d * s, -d * s, d * c,
      d * (F.cx + F.shx - (c * F.cx - s * F.cy)), d * (F.cy + F.shy - (s * F.cx + c * F.cy)));
  }
  // The layer transform, then translate to (x, y) (layer coords), rotate ang, scale (sx, sy).
  function setLayerAt(ctx, ls, x, y, ang, sx, sy) {
    const d = F.dpr, ca = Math.cos(ang), sa = Math.sin(ang);
    const c = F.cos * ca - F.sin * sa, s = F.sin * ca + F.cos * sa;   // tilt + ang
    const dx = x - F.cx, dy = y - F.cy;
    const tx = F.cx + F.shx + ls * (F.cos * dx - F.sin * dy), ty = F.cy + F.shy + ls * (F.sin * dx + F.cos * dy);
    ctx.setTransform(d * ls * c * sx, d * ls * s * sx, -d * ls * s * sy, d * ls * c * sy, d * tx, d * ty);
  }
  // Screen space (no tilt): translate, rotate by unit vector (c, s), scale.
  function setScreenAt(ctx, x, y, c, s, sx, sy) {
    const d = F.dpr;
    ctx.setTransform(d * c * sx, d * s * sx, -d * s * sy, d * c * sy, d * x, d * y);
  }

  // Near dust drifts opposite the camera, d× faster than the world (d > 1), wrapping in a box a
  // little larger than the screen; zooming pushes it radially (nearer dust more).
  function moveDust(arr, vx, vy, zr, dt) {
    const bw = S.BW, bh = S.BH, cx = bw / 2, cy = bh / 2;
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      m.x += (vx * m.d + m.dx) * dt; m.y += (vy * m.d + m.dy) * dt;
      if (zr !== 1) { const k = 1 + (zr - 1) * m.d; m.x = cx + (m.x - cx) * k; m.y = cy + (m.y - cy) * k; }
      m.x = posmod(m.x, bw); m.y = posmod(m.y, bh);
    }
  }

  // Blend the zone moods for this altitude into M (sky colours, cloud alphas, dominant zone).
  function moodAt(prog) {
    const Z = ASCENT.ZONES, n = Math.min(Z.length, MOODS.length, 8), hw = K.ZONE_BLEND;
    const w = M.w;
    for (let i = 0; i < n; i++) {
      let inn = 1, out = 1;
      if (i > 0) { const lo = i === 1 ? K.DUSK_BLEND[0] : Z[i].from - hw, hi = i === 1 ? K.DUSK_BLEND[1] : Z[i].from + hw; inn = smooth(lo, hi, prog); }
      if (i < n - 1) { const j = i + 1, lo = j === 1 ? K.DUSK_BLEND[0] : Z[j].from - hw, hi = j === 1 ? K.DUSK_BLEND[1] : Z[j].from + hw; out = 1 - smooth(lo, hi, prog); }
      w[i] = inn * out;
    }
    let sum = 0, best = 0;
    for (let i = 0; i < n; i++) { sum += w[i]; if (w[i] > w[best]) best = i; }
    if (sum <= 0) { w[0] = 1; sum = 1; }
    for (let c = 0; c < 3; c++) { M.top[c] = 0; M.mid[c] = 0; M.bot[c] = 0; }
    M.neb.fill(0);
    for (let i = 0; i < n; i++) {
      const wi = w[i] / sum; if (wi <= 0) continue;
      const mo = MOODS[i];
      for (let c = 0; c < 3; c++) { M.top[c] += mo.top[c] * wi; M.mid[c] += mo.mid[c] * wi; M.bot[c] += mo.bot[c] * wi; }
      M.neb[mo.neb] += wi * K.NEB_ALPHA[Math.min(i, K.NEB_ALPHA.length - 1)];
    }
    M.zone = best;
  }

  // ==========================================================================
  // drawing pieces (shared by the game and the menu)
  // ==========================================================================
  function fillSky(ctx, W, H, top, mid, bot) {
    ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, rgba(top)); gr.addColorStop(0.55, rgba(mid)); gr.addColorStop(1, rgba(bot));
    ctx.fillStyle = gr;
    const m = 4 + 2 / F.dpr;   // ≥ 2 target px of overhang, whatever the target's scale
    ctx.fillRect(-m, -m, W + 2 * m, H + 2 * m);
  }

  // The composite (sky + soft layers, low-res) put on screen: one opaque pass, the frame clear.
  function blitComp(ctx) {
    const cs = S.compScale;
    ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(S.comp, 0, 0, S.comp.width / cs, S.comp.height / cs);
  }
  // Is the composite target sized for this screen? (resize() keeps it so; this is a safety net)
  function compFits(W, H) {
    return !!(S.compCtx && S.comp.width / S.compScale >= W - 0.01 && S.comp.height / S.compScale >= H - 0.01 &&
      S.comp.width / S.compScale < W + 8 / S.compScale && S.comp.height / S.compScale < H + 8 / S.compScale);
  }

  // Vignette-type overlays have a fully transparent centre (alpha 0 inside the ellipse
  // d = √(0.9x² + y²) < 0.5, see edgeSprites), so they are drawn as four pieces around the
  // largest rectangle inside it: the same pixels for ~12% less fill. The cuts sit on whole
  // device pixels, so the pieces meet without a seam.
  const VHOLE_X = 0.5 / Math.sqrt(0.9) / Math.SQRT2 * 0.94, VHOLE_Y = 0.5 / Math.SQRT2 * 0.94;
  function drawVignette(ctx, img, alpha, W, H) {
    if (!img || alpha < 0.004) return;
    const d = F.dpr, iw = img.width, ih = img.height, kx = iw / W, ky = ih / H;
    const xa = Math.round(W * (1 - VHOLE_X) / 2 * d) / d, xb = Math.round(W * (1 + VHOLE_X) / 2 * d) / d;
    const ya = Math.round(H * (1 - VHOLE_Y) / 2 * d) / d, yb = Math.round(H * (1 + VHOLE_Y) / 2 * d) / d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, alpha);
    if (xb - xa < 2 || yb - ya < 2) { ctx.drawImage(img, 0, 0, W, H); return; }
    ctx.drawImage(img, 0, 0, iw, ya * ky, 0, 0, W, ya);                                          // top
    ctx.drawImage(img, 0, yb * ky, iw, ih - yb * ky, 0, yb, W, H - yb);                          // bottom
    ctx.drawImage(img, 0, ya * ky, xa * kx, (yb - ya) * ky, 0, ya, xa, yb - ya);                 // left
    ctx.drawImage(img, xb * kx, ya * ky, iw - xb * kx, (yb - ya) * ky, xb, ya, W - xb, yb - ya); // right
  }

  // A cloud texture drawn cover-scaled, offset (layer px), clamped so it never uncovers the screen.
  function drawNebula(ctx, tex, alpha, ox, oy, ls, scaleMul, ang) {
    if (!tex || !tex.ready || alpha < 0.004) return;
    const tw = tex.cv.width, th = tex.cv.height;
    const sc = Math.max(F.W / tw, F.H / th) * K.NEB_MARGIN * (scaleMul || 1);
    const dw = tw * sc, dh = th * sc;
    const mx = Math.max(0, dw / 2 - (F.W / 2 + 48) / ls), my = Math.max(0, dh / 2 - (F.H / 2 + 48) / ls);
    ox = clamp(ox, -mx, mx); oy = clamp(oy, -my, my);
    setLayerAt(ctx, ls, F.cx + ox, F.cy + oy, ang || 0, 1, 1);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(tex.cv, -dw / 2, -dh / 2, dw, dh);
  }

  function drawTile(ctx, tile, offX, offY, ls, alpha) {
    if (alpha < 0.004 || !tile || !tile.ready) return;
    const T = tile.size;
    if (Math.abs(ls - 1) < 0.002 && Math.abs(F.sin) < 0.0005) {   // at rest: snap to device pixels (no shimmer)
      offX = Math.round(offX * F.dpr) / F.dpr; offY = Math.round(offY * F.dpr) / F.dpr;
    }
    setLayer(ctx, ls);
    ctx.globalAlpha = Math.min(1, alpha);
    // the screen's bounding box in layer space (it is turned by the tilt and nudged by shake)
    const ac = Math.abs(F.cos), as = Math.abs(F.sin), sh = Math.abs(F.shx) + Math.abs(F.shy) + 2;
    const hw = (F.W / 2 * ac + F.H / 2 * as + sh) / ls, hh = (F.W / 2 * as + F.H / 2 * ac + sh) / ls;
    const x0 = F.cx - hw, x1 = F.cx + hw, y0 = F.cy - hh, y1 = F.cy + hh;
    const sx = x0 - posmod(x0 - offX, T), sy = y0 - posmod(y0 - offY, T);
    const R = tile.rects, n = tile.n;
    if (R && n * (x1 - x0) * (y1 - y0) / (T * T) <= K.SPARSE_MAX_DRAWS) {
      // sparse layer: only the little rectangles that hold stars (the rest of the tile is black)
      const k = T / tile.cv.width;   // CSS px per tile px
      for (let y = sy; y < y1; y += T) {
        for (let x = sx; x < x1; x += T) {
          for (let i = 0; i < n * 4; i += 4) {
            const dx = x + R[i] * k, dy = y + R[i + 1] * k, dw = R[i + 2] * k, dh = R[i + 3] * k;
            if (dx > x1 || dy > y1 || dx + dw < x0 || dy + dh < y0) continue;
            ctx.drawImage(tile.cv, R[i], R[i + 1], R[i + 2], R[i + 3], dx, dy, dw, dh);
          }
        }
      }
      return;
    }
    for (let y = sy; y < y1; y += T) for (let x = sx; x < x1; x += T) ctx.drawImage(tile.cv, x, y, T, T);
  }

  // Individually twinkling stars; (camX, camY) = parallax source position.
  function drawBright(ctx, camX, camY, ls, vis, t) {
    setLayer(ctx, ls);
    const bw = S.sBW, bh = S.sBH;
    for (let i = 0; i < S.bright.length; i++) {
      const s = S.bright[i];
      const x = posmod(s.x - camX * s.P, bw) - 60, y = posmod(s.y - camY * s.P, bh) - 60;
      if (x < -40 || x > F.W + 40 || y < -40 || y > F.H + 40) continue;
      const tw = 0.72 + 0.28 * Math.sin(t * s.f1 + s.p1) * Math.sin(t * s.f2 + s.p2);
      const a = vis * s.b * tw;
      if (a < 0.01) continue;
      const sz = s.size * (0.85 + 0.3 * tw);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(S.glow[s.c].cv, x - sz / 2, y - sz / 2, sz, sz);
      if (s.spike) {
        const L = s.spikeLen * (0.55 + 0.55 * tw);
        ctx.globalAlpha = Math.min(1, a * 0.75);
        ctx.drawImage(S.spike[s.c].cv, x - L, y - L, 2 * L, 2 * L);
      }
    }
  }

  // A distant shooting star every few seconds (deterministic per time slot: no flicker, no allocation).
  function hash01(k, i) { const s = Math.sin(k * 127.1 + i * 311.7) * 43758.5453; return s - Math.floor(s); }
  function drawShootingStar(ctx, t, vis) {
    const period = 6.5, k = Math.floor(t / period), ph = t - k * period, dur = 0.9;
    if (ph > dur || vis < 0.05 || hash01(k, 9) < 0.25) return;   // some slots stay empty
    const u = ph / dur;
    const x0 = F.W * (0.1 + 0.8 * hash01(k, 1)), y0 = F.H * (0.06 + 0.45 * hash01(k, 2));
    const ang = (hash01(k, 3) < 0.5 ? 0.42 : Math.PI - 0.42) + (hash01(k, 4) - 0.5) * 0.5;
    const dist = (220 + 260 * hash01(k, 5)) * (F.H / 900);
    const c = Math.cos(ang), s = Math.sin(ang), d = dist * u;
    const len = Math.max(4, Math.min(d, dist * 0.45));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, vis * 0.85 * Math.sin(Math.PI * u));
    setScreenAt(ctx, x0 + c * d, y0 + s * d, c, s, len / 56, 0.55);
    ctx.drawImage(S.moteStreak[0].cv, -56, -8, 64, 16);
  }

  function drawConstellation(ctx, C, x, y, sc, alpha, t) {
    if (alpha < 0.01) return;
    const pts = C.pts, gap = 5 / sc;
    ctx.globalCompositeOperation = 'lighter';
    // faint chart lines, stopping short of each star
    ctx.globalAlpha = 0.3 * alpha;
    ctx.strokeStyle = 'rgb(150,176,255)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < C.lines.length; i++) {
      const a = pts[C.lines[i][0]], b = pts[C.lines[i][1]];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      if (len <= gap * 2) continue;
      const ux = dx / len * gap, uy = dy / len * gap;
      ctx.moveTo(x + (a[0] + ux) * sc, y + (a[1] + uy) * sc);
      ctx.lineTo(x + (b[0] - ux) * sc, y + (b[1] - uy) * sc);
    }
    ctx.stroke();
    if (C.nebula) {
      const nx = x + C.nebula[0] * sc, ny = y + C.nebula[1] * sc, ns = 1.6 * sc;
      ctx.globalAlpha = 0.45 * alpha;
      ctx.drawImage(S.glowPink.cv, nx - ns, ny - ns, 2 * ns, 2 * ns);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], b = clamp(1.25 - 0.17 * p[2], 0.3, 1);
      const tw = 0.85 + 0.15 * Math.sin(t * (1.3 + i * 0.37) + i * 2.1);
      const sz = (10 + 16 * b) * tw;
      ctx.globalAlpha = Math.min(1, alpha * (0.6 + 0.4 * b));
      ctx.drawImage(S.glow[p[3]].cv, x + p[0] * sc - sz / 2, y + p[1] * sc - sz / 2, sz, sz);
      if (b > 0.85) {
        const L = 7 + 9 * b * tw;
        ctx.globalAlpha = Math.min(1, alpha * 0.5);
        ctx.drawImage(S.spike[p[3]].cv, x + p[0] * sc - L, y + p[1] * sc - L, 2 * L, 2 * L);
      }
    }
    // tiny label
    const fs = Math.max(9, Math.round(10 * sc / C.scale));
    ctx.globalAlpha = 0.32 * alpha;
    ctx.fillStyle = 'rgb(192,206,255)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '600 ' + fs + 'px Fredoka, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(C.label, x, y + C.labelY * sc);
    if (C.sub) {
      ctx.globalAlpha = 0.24 * alpha;
      ctx.font = 'italic ' + Math.max(8, fs - 1) + 'px Fredoka, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(C.sub, x, y + C.labelY * sc + fs + 3);
    }
  }

  // The home planet from just above its dusk atmosphere: dark curved body, a thin bright rim,
  // scattered sunset light rising off the horizon. Drawn in the current (layer) transform.
  // topY = where the limb crests; R = limb radius; glowH = height of the broad glow.
  function drawLimb(ctx, W, H, cx, topY, R, glowH, duskA, rimA, sunX, sunA) {
    if (topY - Math.max(glowH, 0.12 * H) > H + 60 || R <= 0) return;
    const cyc = topY + R;
    const reach = Math.min(0.999, (W / 2 + Math.abs(cx - W / 2) + 160) / R);
    const half = Math.asin(reach);
    const a0 = -Math.PI / 2 - half, a1 = -Math.PI / 2 + half;
    const top = Math.max(-80, topY - glowH - 10), bottom = H + 80;
    // Below `low` the opaque planet body (step 4) covers everything across the screen, so the
    // glows drawn before it stop there (the limb is lowest at the screen edges).
    const dxm = Math.max(Math.abs(cx + 80), Math.abs(W + 80 - cx));
    const low = dxm < R * reach ? Math.min(bottom, cyc - Math.sqrt(R * R - dxm * dxm) + 2) : bottom;
    // 1 · broad scattered sunset glow (the sky itself brightens toward the horizon)
    if (duskA > 0.004 && glowH > 1 && low > top) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const gr = ctx.createRadialGradient(cx, cyc, Math.max(0, R - 2), cx, cyc, R + glowH);
      gr.addColorStop(0, rgba(C.dusk1, 0.9 * duskA));
      gr.addColorStop(0.1, rgba([255, 128, 92], 0.62 * duskA));
      gr.addColorStop(0.32, rgba(C.dusk2, 0.34 * duskA));
      gr.addColorStop(0.62, rgba(C.dusk3, 0.14 * duskA));
      gr.addColorStop(1, rgba(C.dusk3, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(-80, top, W + 160, low - top);
    }
    ctx.globalCompositeOperation = 'lighter';
    // 2 · the sun just below the horizon
    const sr = Math.max(40, glowH * 1.6);
    if (sunA > 0.004 && low > topY + 4 - sr) {
      const sg = ctx.createRadialGradient(sunX, topY + 4, 0, sunX, topY + 4, sr);
      sg.addColorStop(0, rgba([255, 238, 196], 0.66 * sunA));
      sg.addColorStop(0.08, rgba([255, 184, 96], 0.45 * sunA));
      sg.addColorStop(0.34, rgba([255, 104, 74], 0.16 * sunA));
      sg.addColorStop(1, rgba([255, 104, 74], 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - sr, topY + 4 - sr, sr * 2, Math.min(sr * 2, low - (topY + 4 - sr)));
    }
    // 3 · the thin atmosphere shell seen edge-on (warm near the sun, blue-hour elsewhere)
    const th = Math.max(8, 0.075 * H), shellTop = Math.max(-80, topY - th - 4), shellH = low - shellTop;
    if (rimA > 0.004 && shellH > 0) {
      const ag = ctx.createRadialGradient(cx, cyc, Math.max(0, R - 1), cx, cyc, R + th);
      ag.addColorStop(0, rgba([255, 176, 132], 0.5 * rimA));
      ag.addColorStop(0.3, rgba([126, 140, 255], 0.22 * rimA));
      ag.addColorStop(1, rgba([90, 90, 220], 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = ag;
      ctx.fillRect(-80, shellTop, W + 160, shellH);
    }
    // 4 · the planet body (night-side savanna under a violet sky)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const bg = ctx.createLinearGradient(0, topY, 0, topY + 0.35 * H + 1);
    bg.addColorStop(0, rgba([70, 34, 70]));
    bg.addColorStop(0.08, rgba([40, 20, 46]));
    bg.addColorStop(1, rgba([12, 8, 22]));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cyc, R, a0, a1);
    ctx.lineTo(cx + R * reach, bottom + R);
    ctx.lineTo(cx - R * reach, bottom + R);
    ctx.closePath();
    ctx.fill();
    // 4b · low sunlight grazing the surface below the sun
    if (sunA > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      const shR = Math.max(60, W * 0.32);
      const sh = ctx.createRadialGradient(sunX, topY, 0, sunX, topY, shR);
      sh.addColorStop(0, rgba([255, 170, 110], 0.22 * sunA));
      sh.addColorStop(0.4, rgba([220, 90, 110], 0.08 * sunA));
      sh.addColorStop(1, rgba([220, 90, 110], 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = sh;
      ctx.fillRect(sunX - shR, topY, shR * 2, shR);
    }
    // 5 · the bright rim line, hottest near the sun
    if (rimA > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      const u = clamp(sunX / Math.max(1, W), 0.05, 0.95);
      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, rgba([200, 110, 190], 0.35));
      lg.addColorStop(clamp(u - 0.22, 0, 1), rgba([255, 150, 120], 0.6));
      lg.addColorStop(u, rgba([255, 240, 214], 1));
      lg.addColorStop(clamp(u + 0.22, 0, 1), rgba([255, 150, 110], 0.6));
      lg.addColorStop(1, rgba([200, 110, 190], 0.35));
      ctx.strokeStyle = lg;
      ctx.beginPath();
      ctx.arc(cx, cyc, R, a0, a1);
      ctx.globalAlpha = 0.22 * rimA; ctx.lineWidth = 6; ctx.stroke();
      ctx.globalAlpha = 0.85 * rimA; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }

  function drawSun(ctx, x, y, U, a, ls, t) {
    if (a < 0.004 || !S.sunCorona || !S.sunCorona.ready) return;
    const pulse = 1 + 0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 3.7);
    const D = K.SUN.size * U * pulse;
    ctx.globalCompositeOperation = 'lighter';
    if (S.sunRays.ready) {
      const Rr = D * 1.1;
      ctx.globalAlpha = K.SUN.rays * a;
      setLayerAt(ctx, ls, x, y, t * 0.02, 1, 1);
      ctx.drawImage(S.sunRays.cv, -Rr / 2, -Rr / 2, Rr, Rr);
      ctx.globalAlpha = K.SUN.rays * 0.6 * a;
      setLayerAt(ctx, ls, x, y, -t * 0.013 + 1.3, 1, 1);
      ctx.drawImage(S.sunRays.cv, -Rr * 0.4, -Rr * 0.4, Rr * 0.8, Rr * 0.8);
    }
    setLayer(ctx, ls);
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(S.sunCorona.cv, x - D / 2, y - D / 2, D, D);
    const cs = D * 0.12;
    ctx.drawImage(S.glow[0].cv, x - cs / 2, y - cs / 2, cs, cs);
    if (S.sunStreak.ready) {
      const sw = Math.max(F.W, F.H) * 1.1, sh = sw * 40 / 512;
      ctx.globalAlpha = 0.3 * a;
      ctx.drawImage(S.sunStreak.cv, x - sw / 2, y - sh / 2, sw, sh);
    }
  }

  // ==========================================================================
  // the module
  // ==========================================================================
  // The level fields the backdrop reads (onLevel, and rebuild after a GPU reset).
  function setLevel(g) {
    S.levelW = Math.max(1, g.levelWidth || 1);
    S.levelH = Math.max(400, g.levelHeight || 400);
    S.hasLevel = true;
  }

  ASCENT.Space = {
    K,

    init(g) {
      S.W = Math.max(1, g.screenWidth || 1280); S.H = Math.max(1, g.screenHeight || 720);
      S.dpr = ASCENT.dpr > 0 ? ASCENT.dpr : 1;
      buildSprites(quantDpr(S.dpr), true);
      buildTiles(S.dpr, true);
      edgeSprites(S.W, S.H);
      setupComp();
      // Everything heavy is generated in the background, a few rows per frame (see update):
      // the title screen's clouds first (they bloom in as soon as they are ready), then the
      // zone clouds, sun, core, planets.
      // Queue order = the order the climb needs them in.
      S.nebMenu = nebulaJob(640, 360, NEB_MENU_SPEC, false);
      S.nebWisp = nebulaJob(320, 180, NEB_WISP_SPEC, false);
      S.neb[0] = nebulaJob(K.NEB_W, K.NEB_H, NEB_SPECS[0], false);
      buildSizedAssets(true, false);      // moon, giant, galaxies (the small galaxy immediately)
      for (let i = 1; i < NEB_SPECS.length; i++) S.neb[i] = nebulaJob(K.NEB_W, K.NEB_H, NEB_SPECS[i], false);
      const sj = sunJobs(); S.sunCorona = sj.cj; S.sunRays = sj.rj; S.sunStreak = sj.sj;
      S.core = coreJob(false);
      setupPopulations();
      S.built = true;
      if (ASCENT.FX && !S.listening) {
        S.listening = true;
        ASCENT.FX.on((type) => {
          if (type === 'boost') S.boost = 1;
          else if (type === 'respawn' || type === 'runStart') { S.fall = 0; S.rushPhase = 0; }
        });
      }
    },

    // Window resize or a new render resolution (GRAPHICS option / AUTO quality, dpr 0.75..2).
    // Only what is actually out of date is rebuilt, in the background, while the old texture
    // stays on screen; canvases whose size is unchanged are kept as they are.
    resize(g) {
      if (!S.built) return;
      S.W = Math.max(1, g.screenWidth || S.W); S.H = Math.max(1, g.screenHeight || S.H);
      S.dpr = ASCENT.dpr > 0 ? ASCENT.dpr : 1;
      // glow / dust sprites are always drawn resampled: a bit sharper than needed is fine
      // (AUTO steps by 20% at a time — this skips every other step), blurrier is not
      const q = quantDpr(S.dpr);
      if (q > S.spriteDpr * K.SPRITE_REBUILD[1] || q < S.spriteDpr * K.SPRITE_REBUILD[0]) buildSprites(q, false);
      // star tiles are drawn 1:1 (pin-sharp at rest), so they follow the dpr exactly
      if (Math.abs(S.dpr / S.tileDpr - 1) > 0.01) buildTiles(S.dpr, false);
      buildSizedAssets(false, S.hasLevel);   // planets, galaxies: only on a big size change
      edgeSprites(S.W, S.H);                 // only on an aspect change (same canvases)
      setupComp();                           // same canvas, resized if needed
      setupPopulations();                    // only if the CSS size changed
    },

    onLevel(g) {
      setLevel(g);
      S.lastZoom = g.camera ? g.camera.zoom : 1;
      // Launched before the title screen finished generating? Finish what the bottom of the
      // climb shows right now; the rest keeps generating in the background (update) and is
      // needed only further up.
      finishJob(S.neb[0]); finishJob(S.moon);
    },

    // GPU context restored (main.js): a restored canvas comes back CLEARED and an offscreen one
    // may still be lost, so every cached canvas is dropped (with the queued work that targets
    // them) and init's builds run again into NEW ones. Dust, twinkles, fall / boost and the FX
    // listener (S.listening) are kept. Before init there is nothing to rebuild; safe to repeat.
    rebuild(g) {
      if (!S.built) return;
      g = g || ASCENT.Game || {};
      jobs.length = 0; swaps.length = 0;
      for (const a of [S.neb, S.tiles, S.glow, S.spike, S.moteDot, S.moteStreak, S.bokeh]) a.length = 0;
      S.nebMenu = S.nebWisp = S.core = S.gal1 = S.gal2 = S.giant = S.moon = null;
      S.sunCorona = S.sunRays = S.sunStreak = S.glowPink = null;
      S.vign = S.fallTint = S.over = S.overCtx = S.comp = S.compCtx = null;   // (else re-used by size)
      this.init(g);
      if (!S.nebMenu.ready) S.menuNebA = 0;   // the title clouds bloom back in once remade
      if (!(S.hasLevel || g.player) || !(g.levelHeight > 0)) return;
      setLevel(g);   // onLevel's part; its "finish the bottom of the climb" is done by view here
      // In play: the clouds on screen now are made at once (~70 ms each), the heavier set pieces
      // on screen jump the queue (made over the next few frames, not in one long stall) and the
      // title screen's textures wait at the back. (In the menus init's queue order is right.)
      if (g.state !== 'playing' && g.state !== 'paused') return;
      const cam = g.camera;
      const prog = cam ? clamp((S.levelH - cam.cy - 150) / Math.max(1, S.levelH - 250), 0, 1) || 0 : 0;
      moodAt(prog);
      for (let j = 0; j < S.neb.length; j++) if (cutAlpha(M.neb[j]) > 0.004) finishJob(S.neb[j]);
      const sets = [K.MOON, S.moon, K.GAL2, S.gal2, K.GIANT, S.giant, K.GAL1, S.gal1, K.SUN, S.sunRays, K.CORE, S.core];
      for (let i = sets.length - 2; i >= 0; i -= 2) {
        const jb = sets[i + 1];
        if (!jb.ready && win(prog, sets[i].win) > 0.004) { cancelJob(jb); jobs.unshift(jb); }
      }
      for (const jb of [S.nebMenu, S.nebWisp]) if (!jb.ready) { cancelJob(jb); jobs.push(jb); }
    },

    update(g, dt) {
      if (!S.built) return;
      if (jobs.length) runJobs(g.state === 'playing' ? K.JOB_BUDGET_PLAY_MS : K.JOB_BUDGET_MS);
      if (S.nebMenu.ready) S.menuNebA = Math.min(1, S.menuNebA + dt / 1.4);   // title clouds bloom in
      S.boost = Math.max(0, S.boost - dt * 1.6);
      if (g.state !== 'playing' || !g.camera || !S.hasLevel) return;
      const cam = g.camera, z = cam.zoom > 0 ? cam.zoom : 1;
      // screen velocity of something at depth 1 (dust at depth d moves d times this)
      let vx = -(cam.vx || 0) * z, vy = -(cam.vy || 0) * z;
      const vm = Math.hypot(vx, vy), cap = K.MAX_CAM_SPEED * z;
      if (vm > cap) { vx *= cap / vm; vy *= cap / vm; }
      const zr = S.lastZoom > 0 ? clamp(z / S.lastZoom, 0.95, 1.05) : 1;   // (a respawn snaps zoom)
      S.lastZoom = z;
      moveDust(S.motes, vx, vy, zr, dt);
      moveDust(S.bokehs, vx, vy, zr, dt);
      const fs = clamp(g.fallShake || 0, 0, 1);
      S.fall += (fs - S.fall) * Math.min(1, dt * 6);
      S.rushPhase += dt * (0.6 + 0.8 * S.fall) * K.RUSH_SPEED;
      if (S.rushPhase > 1e7) S.rushPhase -= 1e7;
    },

    // ---------------------------------------------------------------------
    // in-game backdrop (the frame clear)
    // ---------------------------------------------------------------------
    drawBack(ctx, g) {
      if (!S.built || !S.hasLevel || !g.camera) { this.drawMenuBack(ctx, g); return; }
      const W = g.screenWidth, H = g.screenHeight, cam = g.camera, t = g.shaderTime || 0;
      const span = Math.max(1, S.levelH - 250);
      const progRaw = (S.levelH - cam.cy - 150) / span;
      const prog = clamp(progRaw, 0, 1);
      const zoom = cam.zoom > 0 ? cam.zoom : 1;
      const camDX = cam.cx - S.levelW / 2;
      const U = Math.min(H, W * 0.62);
      frameSetup(W, H, cam.tilt || 0, (cam.shakeX || 0) * K.SHAKE_FOLLOW, (cam.shakeY || 0) * K.SHAKE_FOLLOW);
      moodAt(prog);
      S.zone = M.zone;
      const starVis = lerp(K.STAR_VIS[0], 1, smooth(0, K.STAR_VIS[1], prog));

      ctx.save();
      // 1-3 · sky, zone clouds, galactic core: all soft and low-frequency, so they are
      //       composited at low resolution and put on screen in ONE opaque pass
      if (compFits(W, H)) {
        const cc = S.compCtx, dpr = F.dpr;
        F.dpr = S.compScale;               // the layer transforms now address the composite
        cc.save();
        this._soft(cc, W, H, prog, progRaw, span, camDX, zoom, U, t);
        cc.restore();
        F.dpr = dpr;
        blitComp(ctx);
      } else {
        this._soft(ctx, W, H, prog, progRaw, span, camDX, zoom, U, t);   // (safety net: direct)
      }
      ctx.globalCompositeOperation = 'lighter';

      // 4 · spiral galaxies
      this._galaxy(ctx, S.gal2, K.GAL2, prog, progRaw, span, camDX, zoom, U);
      this._galaxy(ctx, S.gal1, K.GAL1, prog, progRaw, span, camDX, zoom, U);

      // 5 · star tiles, far → near
      for (let i = 0; i < S.tiles.length; i++) {
        const tl = S.tiles[i];
        drawTile(ctx, tl, -cam.cx * tl.P, -cam.cy * tl.P, layerScale(zoom, tl.depth), tl.alpha * starVis);
      }

      // 6 · constellations
      const cls = layerScale(zoom, K.CONST_P);
      const csc = U / 900;
      setLayer(ctx, cls);
      const cm = CONSTELLATIONS.camel, cp = K.CAMEL;
      let x = cp.fx * W - camDX * K.CONST_P, y = cp.fy * H + (progRaw - cp.prog) * span * K.CONST_P;
      if (y > -200 * csc && y < H + 200 * csc) drawConstellation(ctx, cm, x, y, cm.scale * csc, starVis, t);
      const orr = CONSTELLATIONS.orion, op = K.ORION;
      x = op.fx * W - camDX * K.CONST_P; y = op.fy * H + (progRaw - op.prog) * span * K.CONST_P;
      if (y > -200 * csc && y < H + 200 * csc) drawConstellation(ctx, orr, x, y, orr.scale * csc, starVis, t);

      // 7 · bright twinkling stars
      ctx.globalCompositeOperation = 'lighter';
      drawBright(ctx, cam.cx, cam.cy, layerScale(zoom, K.BRIGHT_DEPTH), starVis, t);
      drawShootingStar(ctx, t, starVis);

      // 8 · the sun off the Comet Fields
      const ps = K.SUN, sunA = win(prog, ps.win);
      if (sunA > 0.004) {
        const ls = layerScale(zoom, ps.P * 1.5);
        drawSun(ctx, ps.fx * W - camDX * ps.P, ps.fy * H + (progRaw - ps.prog) * span * ps.P, U, sunA, ls, t);
      }

      // 9 · gas giant + moon (opaque)
      this._giant(ctx, prog, progRaw, span, camDX, zoom, U);
      this._moon(ctx, prog, progRaw, span, camDX, zoom, U);

      // 10 · the home planet: far horizon sinking slowly below as you climb
      if (prog < 0.36 && g.ground) {
        const z0 = H - 100 * zoom;                                  // ground line with the camera at the bottom
        const gsy = H / 2 + (g.ground.y - cam.cy) * zoom;           // where the real ground is now
        const topY = z0 + Math.max(0, gsy - z0) * K.HORIZON_PARALLAX;
        const Wm = Math.max(W, H);
        const R = Wm * lerp(9, 2.2, smooth(0, 0.25, prog));
        // (eased to exactly 0 a little early: its two big glows are ~2 full-screen passes)
        const duskA = cutAlpha(1 - smooth(0.015, K.DUSK_GLOW_END, prog));
        const rimA = 1 - smooth(K.LIMB_RIM_FADE[0], K.LIMB_RIM_FADE[1], prog);
        const glowH = H * lerp(0.95, 0.3, smooth(0, 0.12, prog));
        F.shx = cam.shakeX || 0; F.shy = cam.shakeY || 0;          // the horizon shakes with the ground it meets
        setLayer(ctx, 1);
        drawLimb(ctx, W, H, W / 2 - camDX * 0.03, topY, R, glowH, duskA, rimA, 0.72 * W - camDX * 0.05, duskA);
      }
      ctx.restore();
    },

    // Sky gradient + zone clouds (cross-faded) + the galactic core, into context c (the low-res
    // composite, or the screen itself); F.dpr = c's px per CSS px.
    _soft(c, W, H, prog, progRaw, span, camDX, zoom, U, t) {
      fillSky(c, W, H, M.top, M.mid, M.bot);
      c.globalCompositeOperation = 'lighter';
      // nebulae (one per zone, cross-faded; one that has faded below NEB_CUT is dropped)
      const nls = layerScale(zoom, K.NEB_ZOOM_DEPTH);
      for (let j = 0; j < S.neb.length; j++) {
        const a = cutAlpha(M.neb[j]);
        if (a < 0.004) continue;
        drawNebula(c, S.neb[j], a, -camDX * K.NEB_PARALLAX, (progRaw - NEB_CENTER[j]) * span * K.NEB_PARALLAX, nls, 1, 0);
      }
      // the galactic core behind the Celestial Acacia
      const pc = K.CORE, coreA = cutAlpha(win(prog, pc.win) * pc.alpha);
      if (coreA > 0.004 && S.core.ready) {
        const ls = layerScale(zoom, pc.P * 1.5);
        const cw = Math.max(W * 1.7, H * 2.6), chh = cw * S.core.cv.height / S.core.cv.width;
        const x = pc.fx * W - camDX * pc.P, y = pc.fy * H + (progRaw - pc.prog) * span * pc.P;
        setLayer(c, ls);
        c.globalAlpha = Math.min(1, coreA);
        c.drawImage(S.core.cv, x - cw / 2, y - chh / 2, cw, chh);
        const gs = 0.55 * U * (1 + 0.04 * Math.sin(t * 0.7));
        c.globalAlpha = Math.min(1, coreA * 0.4);
        c.drawImage(S.glow[2].cv, x - gs / 2, y - gs / 2, gs, gs);
      }
    },

    _galaxy(ctx, gal, pc, prog, progRaw, span, camDX, zoom, U) {
      const a = win(prog, pc.win) * (pc.alpha || 1);
      if (a < 0.004 || !gal || !gal.ready) return;
      const D = pc.size * U, x = pc.fx * F.W - camDX * pc.P;
      const y = pc.fy * F.H + (progRaw - pc.prog) * span * pc.P;
      if (y < -D || y > F.H + D) return;
      ctx.globalCompositeOperation = 'lighter';
      setLayer(ctx, layerScale(zoom, pc.P * 1.5));
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(gal.cv, x - D / 2, y - D / 2, D, D);
    },

    _giant(ctx, prog, progRaw, span, camDX, zoom, U) {
      const pc = K.GIANT, a = win(prog, pc.win), gj = S.giant;
      if (a < 0.004 || !gj || !gj.ready) return;
      const R = pc.size * U, k = R / gj.R;
      const x = pc.fx * F.W - camDX * pc.P, y = pc.fy * F.H + (progRaw - pc.prog) * span * pc.P;
      if (y < -R * 1.2 || y > F.H + R * 1.2) return;
      const ls = layerScale(zoom, pc.P * 1.5);
      setLayer(ctx, ls);
      ctx.globalCompositeOperation = 'lighter';           // faint atmospheric aura
      ctx.globalAlpha = 0.16 * a;
      ctx.drawImage(S.glow[1].cv, x - R * 1.6, y - R * 1.6, R * 3.2, R * 3.2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(gj.cv, x - gj.halfW * k, y - gj.halfH * k, gj.cv.width * k, gj.cv.height * k);
    },

    _moon(ctx, prog, progRaw, span, camDX, zoom, U) {
      const pc = K.MOON, a = win(prog, pc.win), mj = S.moon;
      if (a < 0.004 || !mj || !mj.ready) return;
      const R = pc.size * U, k = R / mj.R;
      const x = pc.fx * F.W - camDX * pc.P, y = pc.fy * F.H + (progRaw - pc.prog) * span * pc.P;
      if (y < -R * 2 || y > F.H + R * 2) return;
      setLayer(ctx, layerScale(zoom, pc.P * 1.5));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1 * a;
      ctx.drawImage(S.glow[0].cv, x - R * 1.4, y - R * 1.4, R * 2.8, R * 2.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(mj.cv, x - mj.half * k, y - mj.half * k, mj.cv.width * k, mj.cv.height * k);
    },

    // ---------------------------------------------------------------------
    // foreground: near dust, speed streaks, fast-fall rush, vignette
    // ---------------------------------------------------------------------
    drawFront(ctx, g) {
      if (!S.built || !g.camera) return;
      const W = g.screenWidth, H = g.screenHeight, cam = g.camera, t = g.shaderTime || 0;
      frameSetup(W, H, 0, 0, 0);
      const z = cam.zoom > 0 ? cam.zoom : 1;
      const p = g.player;
      const camSpeed = Math.hypot(cam.vx || 0, cam.vy || 0);
      const plSpeed = p ? Math.hypot(p.vx || 0, p.vy || 0) : 0;
      const sp = Math.min(K.MAX_CAM_SPEED, Math.max(camSpeed, plSpeed * 0.85));
      const sf = clamp(smooth(K.STREAK_SPEED[0], K.STREAK_SPEED[1], sp) + S.boost * 0.35, 0, 1);
      let vx = -(cam.vx || 0) * z, vy = -(cam.vy || 0) * z;
      const vm = Math.hypot(vx, vy), cap = K.MAX_CAM_SPEED * z;
      if (vm > cap) { vx *= cap / vm; vy *= cap / vm; }
      const tint = Math.min(S.moteDot.length - 1, S.zone + 1);
      const m0 = K.DUST_MARGIN;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // near-field motes → streaks
      for (let i = 0; i < S.motes.length; i++) {
        const m = S.motes[i];
        const sx = m.x - m0, sy = m.y - m0;
        const mvx = vx * m.d, mvy = vy * m.d, mv = Math.hypot(mvx, mvy);
        const len = Math.min(K.STREAK_MAX, mv * K.EXPOSURE);
        if (sx < -len - 20 || sx > W + len + 20 || sy < -len - 20 || sy > H + len + 20) continue;
        const tw = 0.7 + 0.3 * Math.sin(t * m.f + m.p);
        const a = m.a * (K.MOTE_IDLE + K.MOTE_FAST * sf) * tw;
        if (a < 0.01) continue;
        ctx.globalAlpha = Math.min(1, a);
        const ti = m.tint ? tint : 0;
        if (len < m.r * 1.5 || mv < 1) {
          const s = 32 * m.r / 5;
          ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
          ctx.drawImage(S.moteDot[ti].cv, sx - s / 2, sy - s / 2, s, s);
        } else {
          const c = mvx / mv, s = mvy / mv;
          setScreenAt(ctx, sx, sy, c, s, (len + m.r) / 56, m.r / 2.2);
          ctx.drawImage(S.moteStreak[ti].cv, -56, -8, 64, 16);
        }
      }
      // out-of-focus bokeh drifting right past the lens — only while they actually stream past
      // fast, and faint even then (held still in a frame they read as smudges / rings on the lens)
      const bokehA = K.BOKEH_GAIN * (0.8 + 0.6 * sf);
      for (let i = 0; i < S.bokehs.length; i++) {
        const b = S.bokehs[i];
        const sx = b.x - m0, sy = b.y - m0;
        if (sx < -b.r * 3 || sx > W + b.r * 3 || sy < -b.r * 3 || sy > H + b.r * 3) continue;
        const bvx = vx * b.d, bvy = vy * b.d, bv = Math.hypot(bvx, bvy);
        const show = smooth(K.BOKEH_SHOW[0], K.BOKEH_SHOW[1], bv);
        if (show <= 0) continue;
        const len = Math.min(K.STREAK_MAX * 1.2, bv * K.EXPOSURE);
        const k = b.r / 25.6;
        const a = b.a * bokehA * show * (b.r / (b.r + len * 0.5));
        if (a < 0.002) continue;
        const smear = smooth(b.r * 0.3, b.r * 1.5, len);   // crisp-rimmed disc → soft smear with speed
        const c = bv < 1 ? 1 : bvx / bv, s = bv < 1 ? 0 : bvy / bv;
        if (smear < 0.99) {
          ctx.globalAlpha = Math.min(1, a * (1 - smear));
          setScreenAt(ctx, sx - c * len / 2, sy - s * len / 2, c, s, (len / 2 + b.r) / 25.6, k);
          ctx.drawImage(S.bokeh[tint].cv, -32, -32, 64, 64);
        }
        if (smear > 0.01) {
          // the dot sprite stretched into the smear; only its visible middle (radius 10 of 16:
          // beyond that it is < 2% of an already faint smear): the quad is ~40% of the pixels
          const md = S.moteDot[tint].cv, q = md.width / 32;
          ctx.globalAlpha = Math.min(1, a * smear * 1.3);
          setScreenAt(ctx, sx - c * len / 2, sy - s * len / 2, c, s, (len / 2 + b.r) / 5, b.r / 5);
          ctx.drawImage(md, 6 * q, 6 * q, 20 * q, 20 * q, -10, -10, 20, 20);
        }
      }
      // fast fall: speed lines rushing up the screen edges (kept short and few, clear of the
      // middle, so a long fall still reads as the scene rather than as rain)
      if (S.fall > 0.01) {
        const span = H + 600;
        for (let i = 0; i < S.rush.length; i++) {
          const r = S.rush[i];
          const y = posmod(r.y0 * span - S.rushPhase * r.v, span) - 300;
          const L = r.l * (0.6 + K.RUSH_GROW * S.fall);
          if (y > H + 10 || y + L < -10) continue;
          ctx.globalAlpha = Math.min(1, S.fall * K.RUSH_ALPHA * r.a);
          setScreenAt(ctx, r.fx * W, y, 0, -1, L / 56, r.w);
          ctx.drawImage(S.moteStreak[r.fx < 0.5 ? 0 : tint].cv, -56, -8, 64, 16);
        }
      }
      // vignette (+ tunnel vision at speed) and the fast-fall edge tint. While the tint shows,
      // the two are first mixed in a tiny canvas (source-over is associative: the very same
      // result) so the pair costs one full-screen pass instead of two.
      const va = clamp(K.VIGNETTE + K.VIGNETTE_SPEED * sf, 0, 1);
      const ta = clamp(S.fall * K.FALL_TINT, 0, 1);
      if (ta > 0.003 && S.overCtx) {
        const oc = S.overCtx, ow = S.over.width, oh = S.over.height;
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.globalCompositeOperation = 'source-over';
        oc.globalAlpha = 1;
        oc.clearRect(0, 0, ow, oh);
        oc.globalAlpha = va; oc.drawImage(S.vign, 0, 0, ow, oh);
        oc.globalAlpha = ta; oc.drawImage(S.fallTint, 0, 0, ow, oh);
        oc.globalAlpha = 1;
        drawVignette(ctx, S.over, 1, W, H);
      } else {
        drawVignette(ctx, S.vign, va, W, H);
      }
      ctx.restore();
    },

    // ---------------------------------------------------------------------
    // menus: a slow fly-through of the nebula, radiating stars, home planet sunrise
    // ---------------------------------------------------------------------
    drawMenuBack(ctx, g) {
      const W = g.screenWidth, H = g.screenHeight, t = g.shaderTime || 0;
      ctx.save();
      frameSetup(W, H, 0, 0, 0);
      if (!S.built) {
        ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        return;
      }
      const U = Math.min(H, W * 0.62);
      const bloom = S.menuNebA * S.menuNebA * (3 - 2 * S.menuNebA);
      const vpx = W * 0.5, vpy = H * 0.42;
      // sky + the two soft fly-through veils: composited at low resolution, one opaque pass
      // (the key-art cloud keeps its full detail: it is drawn straight on top, below)
      const useComp = compFits(W, H), sc0 = useComp ? S.compCtx : ctx, dpr = F.dpr;
      if (useComp) { F.dpr = S.compScale; sc0.save(); }
      fillSky(sc0, W, H, [7, 5, 22], [16, 9, 40], [42, 16, 60]);
      sc0.globalCompositeOperation = 'lighter';
      // fly-through: two wisp layers that grow from the vanishing point, fading in and out
      const wp = S.nebWisp;
      if (wp && wp.ready) {
        for (let k = 0; k < 2; k++) {
          const ph = frac(t / K.MENU_WISP_CYCLE + k * 0.5);
          const a = Math.pow(Math.sin(Math.PI * ph), 2) * 0.42 * bloom;
          if (a < 0.004) continue;
          const sc = Math.max(W / wp.cv.width, H / wp.cv.height) * 1.05 * Math.exp(ph * 0.9);
          const dw = wp.cv.width * sc, dh = wp.cv.height * sc;
          setLayerAt(sc0, 1, vpx, vpy, k ? 2.2 : 0.6, k ? -1 : 1, 1);   // each layer mirrored / turned
          sc0.globalAlpha = a;
          sc0.drawImage(wp.cv, -dw / 2, -dh / 2, dw, dh);
        }
      }
      if (useComp) { sc0.restore(); F.dpr = dpr; blitComp(ctx); }
      ctx.globalCompositeOperation = 'lighter';

      // the key-art nebula: a slow Lissajous drift with a gentle roll
      const nb = S.nebMenu;
      if (nb && nb.ready) {
        const sc = Math.max(W / nb.cv.width, H / nb.cv.height) * K.NEB_MARGIN;
        const mx = nb.cv.width * sc / 2 - W / 2 - 60, my = nb.cv.height * sc / 2 - H / 2 - 60;
        drawNebula(ctx, nb, 0.95 * bloom, Math.sin(t * 0.013) * mx * 0.8, Math.cos(t * 0.0093) * my * 0.8, 1, 1, Math.sin(t * 0.011) * 0.03);
      }
      // a distant spiral, upper right
      if (S.gal2 && S.gal2.ready) {
        const D = 0.26 * U;
        setLayer(ctx, 1);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(S.gal2.cv, W * 0.83 - D / 2 + Math.sin(t * 0.02) * 6, H * 0.2 - D / 2, D, D);
      }
      // star tiles drifting down-left at their parallax rates
      for (let i = 0; i < S.tiles.length; i++) {
        const tl = S.tiles[i], k = tl.P / 0.1;
        drawTile(ctx, tl, -t * 2.2 * k, t * 3.2 * k, 1, tl.alpha * 0.9);
      }
      // stars streaming out of the vanishing point (we are drifting forward)
      setLayer(ctx, 1);
      const zf = 4, zn = 0.32, f = 0.5 * Math.max(W, H);
      for (let i = 0; i < S.flow.length; i++) {
        const s = S.flow[i];
        const ph = frac(s.ph + t / K.MENU_FLOW_CYCLE);
        const Z = zn + (zf - zn) * (1 - ph);
        const ox = s.X * f / Z, oy = s.Y * f / Z;
        const x = vpx + ox, y = vpy + oy;
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        const a = s.b * smooth(zf, zf * 0.62, Z) * 0.9;
        if (a < 0.01) continue;
        const r = Math.min(2.6, (0.35 + 1.1 / Z) * s.s);
        const vr = Math.hypot(ox, oy) * (zf - zn) / K.MENU_FLOW_CYCLE / Z;   // radial px/s
        const len = Math.min(46, vr * 0.12);
        ctx.globalAlpha = Math.min(1, a);
        if (len < r * 1.5) {
          const sz = 32 * r / 5;
          setLayer(ctx, 1);
          ctx.drawImage(S.moteDot[0].cv, x - sz / 2, y - sz / 2, sz, sz);
        } else {
          const d = Math.hypot(ox, oy) || 1;
          setScreenAt(ctx, x, y, ox / d, oy / d, (len + r) / 56, r / 2.2);
          ctx.drawImage(S.moteStreak[0].cv, -56, -8, 64, 16);
        }
      }
      // bright twinkling stars on a slow virtual drift
      ctx.globalCompositeOperation = 'lighter';
      drawBright(ctx, t * 20, -t * 30, 1, 1, t);
      drawShootingStar(ctx, t + 3.1, 1);
      // the home planet's limb at sunrise
      setLayer(ctx, 1);
      const Rl = Math.max(W, H) * 2.4, topY = H * 0.905, sunX = W * 0.73;
      drawLimb(ctx, W, H, W / 2, topY, Rl, H * 0.36, 0.7, 1, sunX, 0.9);
      // the sun cresting the limb
      if (S.sunCorona.ready && S.sunStreak.ready) {
        const sy = topY + (Rl - Math.sqrt(Math.max(0, Rl * Rl - (sunX - W / 2) * (sunX - W / 2)))) - 2;
        const Dd = 0.3 * U * (1 + 0.03 * Math.sin(t * 1.1));
        ctx.globalCompositeOperation = 'lighter';
        setLayer(ctx, 1);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(S.sunCorona.cv, sunX - Dd / 2, sy - Dd / 2, Dd, Dd);
        const sw = W * 0.9, sh = sw * 40 / 512;
        ctx.globalAlpha = 0.28;
        ctx.drawImage(S.sunStreak.cv, sunX - sw / 2, sy - sh / 2, sw, sh);
      }
      // vignette
      drawVignette(ctx, S.vign, K.VIGNETTE, W, H);
      ctx.restore();
    },

    _state: S,                         // for console debugging
    _finishTextures() { runJobs(0); }, // debugging: generate everything now
  };

})();
