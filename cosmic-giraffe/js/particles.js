/*
 * PARTICLES — slobber, stardust, splats, poofs and parties.
 * =========================================================
 * ASCENT.Particles owns every short-lived speck in Cosmic Giraffe, plus the
 * "how hard did that feel" screen-shake decisions (ASCENT.Cam.shake), so all
 * impact tuning lives in one place.
 *
 *   Event bursts (subscribed to the gameplay bus, ASCENT.FX):
 *     tongueShoot   slobber flung from the mouth        tongueAttach  goo splat + sparkle ring (dust on the planet)
 *     tongueMiss    drips off the flopping tip           tongueRelease little sparkle pop at the old anchor
 *     tongueCut     comet spark shower + purple goo      phaseDetach   cyan crystal shards
 *     crumble       ice/rock chunks + steam + embers     boost         stardust puff behind the giraffe
 *     jump          dust ring (double: a starry ring)    land          dust shockwave scaled by impact
 *     flareIgnite   rumble + ignition sparks             death         comic "poof": cloud, stars, flying spots
 *     respawn       warp-in light column + sparkles      goal          leafy golden party, ~4 s of fireworks
 *     runStart      a gentle twinkle around the giraffe
 *   Continuous (from update): a stardust wake at speed (tinted by altitude
 *   zone), hoof sparkles while boosting, drool while licking, glints and
 *   leaves drifting off the Celestial Acacia, streaks spiralling into
 *   on-screen black holes, sparks thrown off active flare fronts, and leaf
 *   crumbs from the munching mouth after the win.
 *
 * Timing contracts with game.js / cam.js
 *   - death: the giraffe is hidden and the camera holds on the spot for
 *     CONFIG.DEATH_BEAT (0.8 s), then cuts to the start ('respawn'). The poof
 *     covers the vanished giraffe at once and fully plays out inside the beat.
 *   - goal: the camera eases to CAMERA_VICTORY_ZOOM framing the Acacia at
 *     CAMERA_VICTORY_GOAL_Y of the screen; party bursts are placed inside that
 *     final view (around the tree and the munching giraffe).
 *   - giraffe-anchored offsets/sizes scale with CONFIG.GIRAFFE_SCALE and the
 *     live player radius (see GS / PR below).
 *
 * Implementation
 *   - One fixed pool (K.CAPACITY) held in parallel typed arrays: zero
 *     allocation per frame. A stable compaction pass in update() squeezes out
 *     the dead, so draw order = spawn order (older particles sit behind).
 *     When the pool is full, bursts overwrite the oldest slots and ambient
 *     emitters simply skip (they also back off above K.SOFT_LIMIT).
 *   - All art is pre-rendered ONCE at init into small sprite canvases (soft
 *     glows, 4-point sparkles, motion streaks, shock rings, puffs, acacia
 *     fronds + golden blossoms, giraffe-spot chips, slobber droplets, ice /
 *     rock / earth chunks, crystal shards) and stamped with drawImage.
 *     Light-like sprites draw additively ('lighter'); matter draws normally.
 *   - Every particle lives in the BACK layer (between the Acacia and the
 *     giraffe) or the FRONT layer (over everything in the world).
 *   - Nothing random at draw time: twinkle phase/speed come from a
 *     per-particle seed chosen at spawn.
 *
 * Optional helpers for other modules:
 *   ASCENT.Particles.sparkle(x, y, n, colour)  colour: white|gold|warm|cool|cyan|violet|leaf|pink
 *   ASCENT.Particles.puff(x, y, n, kind)       kind: dust|steam|poof
 *   ASCENT.Particles.clear(), .count()
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ============================== TUNING KNOBS ==============================
  const K = {
    CAPACITY: 1500,           // pool size (particles)
    SOFT_LIMIT: 0.85,         // ambient emitters stop spawning above this fill ratio
    DRAW_CAP_BACK: 420,       // max drawImage calls per frame in drawBack
    DRAW_CAP_FRONT: 460,      // ...and in drawFront (together ≲ 900)
    CULL_PAD: 80,             // screen px of slack around the view when culling

    // Giraffe-anchored effects are authored at GIRAFFE_SCALE 1 (player radius
    // 16, ~75 px tall standing) and scaled by ASCENT.CONFIG.GIRAFFE_SCALE and
    // the live player radius, so a bigger giraffe gets bigger dust / slobber.
    HOOF_FRAC: 1.1,           // COM → hooves = this × player radius, if Giraffe.hoofPos() gives null
    GIRAFFE_H: 75,            // standing height at scale 1 (hooves → ossicone tufts)
    // stardust wake behind a fast giraffe
    TRAIL_MIN_SPEED: 350,     // px/s before the wake appears
    TRAIL_RATE_MIN: 16,       // particles/s right at the threshold
    TRAIL_RATE_PER_PX: 0.085, // + this many particles/s per px/s above it
    TRAIL_RATE_MAX: 85,
    // other ambient emitters (particles per second)
    BOOST_RATE: 44,           // hoof sparkles while boosting
    DRIP_MIN: 0.45,           // seconds between drool drips while licking...
    DRIP_MAX: 1.15,           // ...(random in this range)
    GLINT_RATE: 7,            // glints off the Acacia while it is on screen
    LEAF_RATE: 0.7,           // leaves drifting off the Acacia
    WELL_RATE: 11,            // infalling streaks per on-screen black hole
    WELL_PULL: 900,           // px/s² central pull on those streaks (~270° spiral, ~2 s to fall in)
    WELL_CORE_FRAC: 0.2,      // streaks vanish at radius × this (+4 px), fading just outside it
    FLARE_RATE: 46,           // sparks per on-screen active flare front
    LEAF_SWAY: 45,            // px/s² sideways flutter on drifting leaves
    SPARK_STRETCH: 0.045,     // seconds of motion blur on spark streaks
    // death "poof": everything is timed to finish inside the game's death beat
    // (CONFIG.DEATH_BEAT, 0.8 s — the camera holds on the poof, then cuts to
    // the respawn), so nothing is left hanging when the camera cuts away
    DEATH_FIT: 0.9,           // longest poof particle life = this × DEATH_BEAT
    DEATH_EDGE: 70,           // a poof is kept this far inside the level's side edges (the camera stops at them)
    // victory party after reaching the Acacia (the camera eases to
    // CAMERA_VICTORY_ZOOM with the tree CAMERA_VICTORY_GOAL_Y down the screen;
    // bursts are placed inside that final framing)
    GOAL_PARTY_SECS: 4.0,
    GOAL_BURST_MIN: 0.36,
    GOAL_BURST_MAX: 0.62,
    GOAL_MARGIN: 90,          // world px a burst centre keeps from the final view's edges
    MUNCH_RATE: 1.2,          // leaf crumbs/s dropping from the munching mouth after the win
    // screen shake (trauma added, 0..1; the shake grows with trauma²)
    SHAKE_ATTACH: 0.06,
    SHAKE_CUT: 0.45,
    SHAKE_CRUMBLE: 0.2,
    SHAKE_LAND_MIN: 0.08,
    SHAKE_LAND_MAX: 0.35,
    SHAKE_FLARE: 0.12,
    SHAKE_DEATH: 0.6,         // applied once, when the poof pops (the camera holds there)
    SHAKE_RESPAWN: 0.1,       // a whisper of a thump as the giraffe warps back in
  };

  const TAU = Math.PI * 2;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ================================ COLOURS =================================
  function hex(h, fallback) {
    let s = String(h || fallback || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    if (!isFinite(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (Math.round(clamp01(a) * 1000) / 1000) + ')';
  }
  const WHITE = [255, 255, 255];

  // ================================ SPRITES =================================
  // Registry: IMG[id] canvas, ADD[id] 1 = draw additively, ASPECT[id] = h / w.
  const IMG = [], ADD = [], ASPECT = [];
  const SP = {};          // named sprite ids (filled by buildSprites)
  let ready = false;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function reg(canvas, additive) {
    IMG.push(canvas); ADD.push(additive ? 1 : 0); ASPECT.push(canvas.height / canvas.width);
    return IMG.length - 1;
  }

  // Soft light dot: hot white-ish core, coloured falloff. Visible core ≈ 30% of the drawn size.
  function glowSprite(c) {
    const S = 64, h = S / 2, cv = makeCanvas(S, S), x = cv.getContext('2d');
    const gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, rgba(mix(c, WHITE, 0.8), 1));
    gr.addColorStop(0.1, rgba(mix(c, WHITE, 0.45), 0.92));
    gr.addColorStop(0.3, rgba(c, 0.42));
    gr.addColorStop(0.6, rgba(c, 0.12));
    gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    return cv;
  }

  // Pinched 4-point star path (cubic curves with both controls at the centre
  // give a slim waist ≈ 0.18 R — the classic "twinkle" silhouette).
  function starPath(x, cx, cy, R, rot) {
    x.beginPath();
    for (let k = 0; k <= 4; k++) {
      const a = rot + (k % 4) * Math.PI / 2;
      const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      if (k === 0) x.moveTo(px, py);
      else x.bezierCurveTo(cx, cy, cx, cy, px, py);
    }
    x.closePath();
  }
  function sparkleSprite(c) {
    const S = 64, h = S / 2, cv = makeCanvas(S, S), x = cv.getContext('2d');
    // halo
    let gr = x.createRadialGradient(h, h, 0, h, h, h * 0.6);
    gr.addColorStop(0, rgba(c, 0.5)); gr.addColorStop(0.4, rgba(c, 0.16)); gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    // main rays + fainter diagonal rays
    gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, rgba(mix(c, WHITE, 0.6), 1));
    gr.addColorStop(0.55, rgba(c, 0.9));
    gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr;
    starPath(x, h, h, h - 1, 0); x.fill();
    x.globalAlpha = 0.6; starPath(x, h, h, h * 0.46, Math.PI / 4); x.fill();
    x.globalAlpha = 1;
    // hot core
    gr = x.createRadialGradient(h, h, 0, h, h, 6);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(h - 6, h - 6, 12, 12);
    return cv;
  }

  // Motion streak: a soft horizontal capsule, drawn aligned to velocity.
  function streakSprite(c) {
    const W = 64, H = 16, cv = makeCanvas(W, H), x = cv.getContext('2d');
    x.save();
    x.scale(1, H / W);
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(mix(c, WHITE, 0.85), 1));
    gr.addColorStop(0.25, rgba(mix(c, WHITE, 0.35), 0.9));
    gr.addColorStop(0.6, rgba(c, 0.35));
    gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, W, W);
    x.restore();
    return cv;
  }

  // Shock ring: bright band at ~84% radius, faint disc inside. Visible diameter ≈ 0.84 × size.
  function ringSprite(c, strength) {
    const S = 192, h = S / 2, cv = makeCanvas(S, S), x = cv.getContext('2d');
    const gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, rgba(c, 0));
    gr.addColorStop(0.45, rgba(c, 0.05 * strength));
    gr.addColorStop(0.72, rgba(c, 0.45 * strength));
    gr.addColorStop(0.84, rgba(c, strength));
    gr.addColorStop(0.93, rgba(c, 0.3 * strength));
    gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    return cv;
  }

  // Soft cloud (dust / steam): overlapping feathered blobs, lit from the top-left.
  function softPuffSprite(c, light) {
    const S = 64, cv = makeCanvas(S, S), x = cv.getContext('2d');
    const B = [[32, 35, 19], [21, 31, 13], [43, 31, 14], [31, 21, 13], [41, 42, 11], [22, 42, 11]];
    for (let i = 0; i < B.length; i++) {
      const bx = B[i][0], by = B[i][1], r = B[i][2];
      const gr = x.createRadialGradient(bx - r * 0.3, by - r * 0.35, 0, bx, by, r);
      gr.addColorStop(0, rgba(light, 0.5));
      gr.addColorStop(0.55, rgba(c, 0.36));
      gr.addColorStop(1, rgba(c, 0));
      x.fillStyle = gr; x.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    return cv;
  }

  // Cartoon puff (the death "poof"): crisp bubbly silhouette, shaded, with a rim.
  // Laid out on a 64-unit grid but rendered at 2× (these get drawn up to ~56 px,
  // i.e. ~112 device px on retina, and the crisp edge is the whole point).
  function comicPuffSprite(base, shade, light, rim) {
    const S = 64, cv = makeCanvas(S * 2, S * 2), x = cv.getContext('2d');
    x.scale(2, 2);
    const B = [[32, 36, 16], [20, 32, 11.5], [44, 32, 12], [31, 22, 12.5], [42, 43, 9.5], [22, 43, 9.5], [39, 24, 9]];
    const blobs = (grow) => {
      x.beginPath();
      for (let i = 0; i < B.length; i++) {
        const r = B[i][2] + grow;
        x.moveTo(B[i][0] + r, B[i][1]);
        x.arc(B[i][0], B[i][1], r, 0, TAU);
      }
    };
    x.fillStyle = rgba(base, 1); blobs(0); x.fill();
    x.globalCompositeOperation = 'source-atop';           // shade only inside the cloud
    const gr = x.createLinearGradient(14, 10, 50, 56);
    gr.addColorStop(0, rgba(light, 0.95)); gr.addColorStop(0.42, rgba(base, 0)); gr.addColorStop(1, rgba(shade, 0.9));
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'destination-over';      // rim only outside the silhouette
    x.fillStyle = rgba(rim, 0.95); blobs(1.8); x.fill();
    x.globalCompositeOperation = 'source-over';
    return cv;
  }

  // Acacia frond: a curved stem with paired leaflets (feathery at particle size).
  function frondSprite(body, lightC, shadow, glow) {
    const W = 64, H = 32, cv = makeCanvas(W, H), x = cv.getContext('2d');
    x.save(); x.scale(1, 0.5);
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(glow, 0.3)); gr.addColorStop(1, rgba(glow, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    x.restore();
    // stem: quadratic (5,17) → (32,12) → (59,15)
    const qx = (t) => (1 - t) * (1 - t) * 5 + 2 * (1 - t) * t * 32 + t * t * 59;
    const qy = (t) => (1 - t) * (1 - t) * 17 + 2 * (1 - t) * t * 12 + t * t * 15;
    const leaflet = (t, side, len, dx, dy, col) => {
      const tx = 2 * (1 - t) * (32 - 5) + 2 * t * (59 - 32), ty = 2 * (1 - t) * (12 - 17) + 2 * t * (15 - 12);
      const a = Math.atan2(ty, tx) + side * 1.0;
      const cx = qx(t) + Math.cos(a) * len * 0.5 + dx, cy = qy(t) + Math.sin(a) * len * 0.5 + dy;
      x.fillStyle = col;
      x.beginPath(); x.ellipse(cx, cy, len * 0.5, len * 0.21, a, 0, TAU); x.fill();
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < 7; k++) {
        const t = 0.12 + k * 0.12, len = 9 - k * 0.7;
        if (pass === 0) { leaflet(t, -1, len, 0.8, 1, rgba(shadow, 0.9)); leaflet(t, 1, len, 0.8, 1, rgba(shadow, 0.9)); }
        else { leaflet(t, -1, len, 0, 0, rgba(lightC, 1)); leaflet(t, 1, len, 0, 0, rgba(body, 1)); }
      }
    }
    // terminal leaflet + stem
    x.fillStyle = rgba(body, 1);
    x.beginPath(); x.ellipse(58, 15, 4.5, 2, -0.1, 0, TAU); x.fill();
    x.strokeStyle = rgba(shadow, 1); x.lineWidth = 1.3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(5, 17); x.quadraticCurveTo(32, 12, 59, 15); x.stroke();
    return cv;
  }

  // Golden acacia puffball blossom.
  function blossomSprite(gold) {
    const S = 32, h = 16, cv = makeCanvas(S, S), x = cv.getContext('2d');
    let gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, rgba(gold, 0.45)); gr.addColorStop(1, rgba(gold, 0));
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    x.fillStyle = rgba(mix(gold, WHITE, 0.35), 1);
    x.beginPath();
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * TAU, px = h + Math.cos(a) * 7.4, py = h + Math.sin(a) * 7.4;
      x.moveTo(px + 1.7, py); x.arc(px, py, 1.7, 0, TAU);
    }
    x.fill();
    gr = x.createRadialGradient(h - 2, h - 2, 0, h, h, 7.4);
    gr.addColorStop(0, 'rgba(255,248,210,1)'); gr.addColorStop(0.55, rgba(gold, 1)); gr.addColorStop(1, rgba(mix(gold, [170, 100, 20], 0.5), 1));
    x.fillStyle = gr;
    x.beginPath(); x.arc(h, h, 7.2, 0, TAU); x.fill();
    return cv;
  }

  // A giraffe patch: polygon-ish rounded spot on a rim of golden coat.
  function spotSprite(seed, coat, coatLight, spot, spotDark) {
    const S = 48, h = S / 2, cv = makeCanvas(S, S), x = cv.getContext('2d');
    let s = seed;
    const pr = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const n = 9, R = 13, px = [], py = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + (pr() - 0.5) * 0.4, r = R * (0.74 + pr() * 0.3);
      px.push(Math.cos(a) * r); py.push(Math.sin(a) * r);
    }
    const blob = (sc) => {
      x.beginPath();
      x.moveTo(h + (px[n - 1] + px[0]) * 0.5 * sc, h + (py[n - 1] + py[0]) * 0.5 * sc);
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        x.quadraticCurveTo(h + px[k] * sc, h + py[k] * sc, h + (px[k] + px[j]) * 0.5 * sc, h + (py[k] + py[j]) * 0.5 * sc);
      }
      x.closePath();
    };
    let gr = x.createLinearGradient(4, 4, 44, 44);
    gr.addColorStop(0, rgba(coatLight, 1)); gr.addColorStop(1, rgba(coat, 1));
    x.fillStyle = gr; blob(1.32); x.fill();
    gr = x.createRadialGradient(h - 3, h - 4, 0, h, h, R * 1.05);
    gr.addColorStop(0, rgba(mix(spot, coat, 0.25), 1)); gr.addColorStop(0.6, rgba(spot, 1)); gr.addColorStop(1, rgba(spotDark, 1));
    x.fillStyle = gr; blob(1); x.fill();
    return cv;
  }

  // Slobber droplet: round head at +x, tail trailing toward -x (drawn aligned to velocity).
  function dropSprite(body, dark, hi) {
    const W = 48, H = 32, cv = makeCanvas(W, H), x = cv.getContext('2d');
    x.beginPath();
    x.moveTo(3, 16);
    x.bezierCurveTo(12, 14.5, 19, 7, 30, 7);
    x.arc(30, 16, 9, -Math.PI / 2, Math.PI / 2, false);
    x.bezierCurveTo(19, 25, 12, 17.5, 3, 16);
    x.closePath();
    const gr = x.createRadialGradient(33, 12, 1, 30, 16, 13);
    gr.addColorStop(0, rgba(hi, 1)); gr.addColorStop(0.45, rgba(body, 0.95)); gr.addColorStop(1, rgba(dark, 0.95));
    x.fillStyle = gr; x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath(); x.ellipse(33.5, 11.5, 3.2, 2, -0.35, 0, TAU); x.fill();
    x.strokeStyle = rgba(hi, 0.55); x.lineWidth = 1;
    x.beginPath(); x.arc(30, 16, 8.2, 0.25, 1.4); x.stroke();
    return cv;
  }

  // Faceted chunk (comet ice / meteorite / planet pebble), lit from the top-left.
  function chunkSprite(seed, base, light, dark, edge, crack) {
    const S = 48, h = S / 2, cv = makeCanvas(S, S), x = cv.getContext('2d');
    let s = seed;
    const pr = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const n = 6 + (seed % 2), px = [], py = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + (pr() - 0.5) * 0.5, r = 12 + pr() * 6;
      px.push(h + Math.cos(a) * r); py.push(h + Math.sin(a) * r);
    }
    const qx = h - 2, qy = h - 3, lx = -0.6, ly = -0.8;
    x.lineJoin = 'round';
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      let mx = (px[k] + px[j]) * 0.5 - h, my = (py[k] + py[j]) * 0.5 - h;
      const ml = Math.sqrt(mx * mx + my * my) || 1;
      mx /= ml; my /= ml;
      const lit = (mx * lx + my * ly + 1) * 0.5;
      const col = rgba(lit > 0.5 ? mix(base, light, (lit - 0.5) * 2) : mix(dark, base, lit * 2), 1);
      x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(qx, qy); x.lineTo(px[k], py[k]); x.lineTo(px[j], py[j]); x.closePath();
      x.fill(); x.stroke();
    }
    if (edge) {
      x.strokeStyle = rgba(edge, 0.55); x.lineWidth = 1;
      x.beginPath(); x.moveTo(px[0], py[0]);
      for (let k = 1; k <= n; k++) x.lineTo(px[k % n], py[k % n]);
      x.closePath(); x.stroke();
    }
    if (crack) {
      const path = () => { x.beginPath(); x.moveTo(h - 11, h - 4); x.lineTo(h - 3, h + 1); x.lineTo(h + 2, h - 5); x.lineTo(h + 11, h + 3); };
      x.lineCap = 'round';
      x.strokeStyle = rgba(crack, 0.35); x.lineWidth = 4; path(); x.stroke();
      x.strokeStyle = rgba(mix(crack, WHITE, 0.55), 1); x.lineWidth = 1.4; path(); x.stroke();
    }
    return cv;
  }

  // Phase-crystal shard: long hexagonal prism, two-tone facets + halo (drawn additively).
  function shardSprite(c) {
    const W = 64, H = 32, cv = makeCanvas(W, H), x = cv.getContext('2d');
    x.save(); x.scale(1, 0.5);
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(c, 0.4)); gr.addColorStop(1, rgba(c, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    x.restore();
    x.fillStyle = rgba(mix(c, WHITE, 0.7), 1);
    x.beginPath(); x.moveTo(6, 16); x.lineTo(18, 9); x.lineTo(46, 10); x.lineTo(58, 16); x.closePath(); x.fill();
    x.fillStyle = rgba(mix(c, [20, 60, 120], 0.25), 1);
    x.beginPath(); x.moveTo(6, 16); x.lineTo(58, 16); x.lineTo(46, 22); x.lineTo(18, 23); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(8, 16); x.lineTo(56, 16); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.45)';
    x.beginPath(); x.moveTo(18, 9.5); x.lineTo(18, 22.5); x.moveTo(46, 10.5); x.lineTo(46, 21.5); x.stroke();
    return cv;
  }

  function buildSprites() {
    const PAL = ASCENT.PAL || {};
    const C = {
      white: hex('#fff8ec'),
      gold: hex(PAL.gold, '#ffd35c'),
      warm: hex(PAL.plasma, '#ffb13b'),
      cool: mix(hex(PAL.auroraB, '#6fb8ff'), hex(PAL.starCool, '#bcd8ff'), 0.5),
      cyan: hex('#7ef3ff'),
      violet: mix(hex(PAL.tongueHi, '#8a6cc8'), WHITE, 0.35),
      leaf: mix(hex(PAL.leaf, '#7fe07a'), hex(PAL.leafGlow, '#d8ffb0'), 0.5),
      pink: mix(hex(PAL.nebulaC, '#d2407a'), WHITE, 0.35),
      acc: hex(PAL.accretion, '#ffb86b'),
    };
    const names = ['white', 'gold', 'warm', 'cool', 'cyan', 'violet', 'leaf', 'pink'];
    SP.G = {}; SP.S = {};
    for (let i = 0; i < names.length; i++) {
      SP.G[names[i]] = reg(glowSprite(C[names[i]]), true);
      SP.S[names[i]] = reg(sparkleSprite(C[names[i]]), true);
    }
    SP.K = {};
    const streaks = ['white', 'gold', 'warm', 'cyan', 'violet', 'acc'];
    for (let i = 0; i < streaks.length; i++) SP.K[streaks[i]] = reg(streakSprite(C[streaks[i]]), true);
    SP.R = {
      white: reg(ringSprite(C.white, 0.9), true),
      gold: reg(ringSprite(C.gold, 0.9), true),
      cyan: reg(ringSprite(C.cyan, 0.9), true),
      violet: reg(ringSprite(C.violet, 0.9), true),
      dust: reg(ringSprite(mix(hex(PAL.savanna, '#c98a3a'), WHITE, 0.45), 0.8), false),
    };
    // one glow per altitude zone, for the stardust wake
    SP.GZ = [];
    const Z = ASCENT.ZONES || [];
    for (let i = 0; i < Z.length; i++) SP.GZ.push(reg(glowSprite(mix(hex(Z[i].tint, '#ffffff'), WHITE, 0.15)), true));
    if (!SP.GZ.length) SP.GZ.push(SP.G.white);

    const sand = mix(hex(PAL.savanna, '#c98a3a'), hex(PAL.hideLight, '#ffd98a'), 0.5);
    SP.DUST = reg(softPuffSprite(sand, hex('#fff0d0')), false);
    SP.STEAM = reg(softPuffSprite(hex('#bcdcff'), WHITE), false);
    SP.POOF = reg(comicPuffSprite(hex('#f1ecff'), hex('#9f93d6'), WHITE, hex('#6d5fae')), false);
    SP.CHAR = reg(comicPuffSprite(hex('#8f86a3'), hex('#4a4260'), hex('#d8d0e6'), hex('#2f2840')), false);

    const leafC = hex(PAL.leaf, '#7fe07a'), leafG = hex(PAL.leafGlow, '#d8ffb0');
    SP.LEAF = reg(frondSprite(mix(leafC, hex('#c8e860'), 0.35), mix(leafC, leafG, 0.55), mix(leafC, [20, 70, 30], 0.55), leafG), false);
    SP.BLOSSOM = reg(blossomSprite(C.gold), false);

    const coat = hex(PAL.hide, '#f2b64c'), coatL = hex(PAL.hideLight, '#ffd98a');
    const spot = hex(PAL.spots, '#9a4a17'), spotD = hex(PAL.spotsDark, '#6e3010');
    SP.SPOT = [reg(spotSprite(1234567, coat, coatL, spot, spotD), false), reg(spotSprite(7654321, coat, coatL, spot, spotD), false)];

    const tHi = hex(PAL.tongueHi, '#8a6cc8'), tMid = hex(PAL.tongue, '#4b2f78'), tDark = hex(PAL.tongueDark, '#2a1846');
    SP.DROP = reg(dropSprite(tHi, mix(tMid, tHi, 0.3), mix(tHi, WHITE, 0.55)), false);
    SP.DROP_DARK = reg(dropSprite(tMid, tDark, mix(tHi, WHITE, 0.3)), false);

    SP.ICE = [reg(chunkSprite(424242, hex('#a9dcf7'), hex('#f2fbff'), hex('#5d93c8'), WHITE, null), false),
              reg(chunkSprite(313131, hex('#a9dcf7'), hex('#f2fbff'), hex('#5d93c8'), WHITE, null), false)];
    SP.ROCK = reg(chunkSprite(987654, hex('#4b3d63'), hex('#8a78ad'), hex('#2a2139'), null, C.warm), false);
    SP.EARTH = reg(chunkSprite(555555, hex(PAL.savannaDark, '#6b3f1a'), hex(PAL.savanna, '#c98a3a'), hex('#3a2210'), null, null), false);
    SP.SHARD = reg(shardSprite(C.cyan), true);
    ready = true;
  }

  // GPU context restored: re-render the whole registry into NEW canvases (an old
  // one may be blank or still lost). The build order is fixed, so every sprite id
  // comes out the same and live particles (SPRI) keep drawing the right sprite.
  // A failed build rolls back to the old set; if the id layout ever changed, the
  // pool is dropped rather than drawn with the wrong (or a missing) sprite.
  function rebuildSprites() {
    const old = [IMG.slice(), ADD.slice(), ASPECT.slice(), Object.assign({}, SP), ready];
    IMG.length = ADD.length = ASPECT.length = 0;
    try { buildSprites(); }
    catch (e) {
      IMG.length = ADD.length = ASPECT.length = 0;
      IMG.push.apply(IMG, old[0]); ADD.push.apply(ADD, old[1]); ASPECT.push.apply(ASPECT, old[2]);
      Object.assign(SP, old[3]); ready = old[4];
      throw e;
    }
    if (old[0].length && old[0].length !== IMG.length) { count = 0; ovr = 0; }
  }

  // ================================== POOL ==================================
  const N = K.CAPACITY;
  const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
  const DRAG = new Float32Array(N), GRAV = new Float32Array(N), ROT = new Float32Array(N), SPIN = new Float32Array(N);
  const S0 = new Float32Array(N), S1 = new Float32Array(N), ASP = new Float32Array(N), A0 = new Float32Array(N);
  const LIFE = new Float32Array(N), MAXL = new Float32Array(N), DELAY = new Float32Array(N), STR = new Float32Array(N);
  const SEED = new Float32Array(N), TX = new Float32Array(N), TY = new Float32Array(N), PULL = new Float32Array(N);
  const KILLR = new Float32Array(N);
  const SPRI = new Uint8Array(N), FLG = new Uint8Array(N), MODE = new Uint8Array(N);
  let count = 0, ovr = 0, soft = false;

  // flags
  const F_FRONT = 1, F_ALIGN = 2, F_ATTRACT = 4, F_SWAY = 8;
  const BACK = 0, FRONT = F_FRONT;
  // alpha-over-life curves
  const M_FLASH = 0,   // linear fade out
        M_BURST = 1,   // (1-t)²: bright pop, quick fade
        M_SOFT = 2,    // quick fade-in, hold, fade (dust/steam)
        M_POOF = 3,    // instant, holds, fades late (comic cloud)
        M_TWINKLE = 4, // bright, flickering, fades at the end
        M_SOLID = 5,   // opaque matter, fades in the last 28%
        M_GHOST = 6,   // gentle fade in and out (ambient)
        M_GLINT = 7;   // ghost envelope × twinkle

  function add(spr, flags, x, y, vx, vy, life, s0, s1, a0, mode) {
    if (!ready || !(life > 0) || !fin(x) || !fin(y) || !fin(vx) || !fin(vy) || !fin(s0) || !fin(s1)) return -1;
    let i;
    if (count < N) {
      if (soft && count > N * K.SOFT_LIMIT) return -1;
      i = count++;
    } else {
      if (soft) return -1;
      i = ovr; ovr = (ovr + 1) % N;     // overwrite the oldest slots
    }
    SPRI[i] = spr; FLG[i] = flags; MODE[i] = mode;
    X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy;
    LIFE[i] = life; MAXL[i] = life;
    S0[i] = s0 > 0 ? s0 : 0; S1[i] = s1 > 0 ? s1 : 0; A0[i] = a0;
    DRAG[i] = 0; GRAV[i] = 0; ROT[i] = 0; SPIN[i] = 0; ASP[i] = ASPECT[spr] || 1;
    DELAY[i] = 0; STR[i] = 0; SEED[i] = Math.random();
    TX[i] = 0; TY[i] = 0; PULL[i] = 0; KILLR[i] = 0;
    return i;
  }
  // chainable setters (all tolerate i = -1)
  function phys(i, drag, grav) { if (i >= 0) { DRAG[i] = drag; GRAV[i] = grav; } return i; }
  function turn(i, rot, spin) { if (i >= 0) { ROT[i] = rot; SPIN[i] = spin; } return i; }
  function aspect(i, a) { if (i >= 0) ASP[i] = a; return i; }
  function blur(i, s) { if (i >= 0) STR[i] = s; return i; }
  function later(i, d) { if (i >= 0) DELAY[i] = d > 0 ? d : 0; return i; }

  function moveSlot(r, w) {
    X[w] = X[r]; Y[w] = Y[r]; VX[w] = VX[r]; VY[w] = VY[r];
    DRAG[w] = DRAG[r]; GRAV[w] = GRAV[r]; ROT[w] = ROT[r]; SPIN[w] = SPIN[r];
    S0[w] = S0[r]; S1[w] = S1[r]; ASP[w] = ASP[r]; A0[w] = A0[r];
    LIFE[w] = LIFE[r]; MAXL[w] = MAXL[r]; DELAY[w] = DELAY[r]; STR[w] = STR[r];
    SEED[w] = SEED[r]; TX[w] = TX[r]; TY[w] = TY[r]; PULL[w] = PULL[r]; KILLR[w] = KILLR[r];
    SPRI[w] = SPRI[r]; FLG[w] = FLG[r]; MODE[w] = MODE[r];
  }

  // Integrate + stable compaction in one pass.
  function step(dt) {
    let w = 0;
    for (let r = 0; r < count; r++) {
      if (DELAY[r] > 0) {
        DELAY[r] -= dt;                       // not born yet: frozen, invisible
      } else {
        const life = LIFE[r] - dt;
        if (life <= 0) continue;              // dead → dropped by compaction
        LIFE[r] = life;
        let vx = VX[r], vy = VY[r];
        const fl = FLG[r];
        if (fl & F_ATTRACT) {
          const dx = TX[r] - X[r], dy = TY[r] - Y[r];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < KILLR[r]) continue;         // swallowed by the black hole
          const a = PULL[r] * dt / d;
          vx += dx * a; vy += dy * a;
        }
        if (fl & F_SWAY) vx += Math.sin((MAXL[r] - life) * 2.3 + SEED[r] * 40) * K.LEAF_SWAY * dt;
        vy += GRAV[r] * dt;
        const dr = DRAG[r];
        if (dr > 0) { const k = Math.exp(-dr * dt); vx *= k; vy *= k; }
        VX[r] = vx; VY[r] = vy;
        X[r] += vx * dt; Y[r] += vy * dt;
        ROT[r] += SPIN[r] * dt;
      }
      if (w !== r) moveSlot(r, w);
      w++;
    }
    count = w;
    ovr = 0;
  }

  // ================================ DRAWING =================================
  function drawLayer(ctx, g, want, cap) {
    const cam = g.camera;
    if (!ready || count === 0 || !cam) return;
    const pad = K.CULL_PAD / (cam.zoom > 0.05 ? cam.zoom : 1);
    // View rect from the centre, not cam.x/y: Cam.reset() (respawn) leaves x/y
    // stale until the next Cam.update, and the respawn frame draws before that.
    const hw = cam.viewW * 0.5, hh = cam.viewH * 0.5;
    if (!fin(cam.cx) || !fin(cam.cy) || !fin(hw) || !fin(hh)) return;
    const minX = cam.cx - hw - pad, maxX = cam.cx + hw + pad;
    const minY = cam.cy - hh - pad, maxY = cam.cy + hh + pad;
    let drawn = 0;
    ctx.save();
    for (let pass = 0; pass < 2 && drawn < cap; pass++) {
      if (pass === 1) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const fl = FLG[i];
        if ((fl & F_FRONT) !== want) continue;
        const s = SPRI[i];
        if (ADD[s] !== pass || DELAY[i] > 0) continue;
        const x = X[i], y = Y[i];
        // cheap early cull on position (sprites here are < 400 px)
        if (x < minX - 200 || x > maxX + 200 || y < minY - 200 || y > maxY + 200) continue;

        const maxl = MAXL[i];
        const t = maxl > 0 ? clamp01(1 - LIFE[i] / maxl) : 1;
        // size: grow with ease-out, shrink with ease-in (holds size, then pops away)
        const s0 = S0[i], s1 = S1[i];
        let sz;
        if (s1 === s0) sz = s0;
        else if (s1 > s0) { const u = 1 - t; sz = s0 + (s1 - s0) * (1 - u * u * u); }
        else sz = s0 + (s1 - s0) * t * t;
        if (sz < 0.4) continue;

        // alpha over life
        let a;
        switch (MODE[i]) {
          case M_BURST: a = (1 - t) * (1 - t); break;
          case M_SOFT: a = Math.min(1, t * 8) * (1 - t * t); break;
          case M_POOF: a = 1 - t * t * t; break;
          case M_TWINKLE: {
            const sd = SEED[i];
            a = Math.min(1, t * 12) * (1 - t * t) * (0.62 + 0.38 * Math.sin((maxl - LIFE[i]) * (12 + sd * 10) + sd * 50));
            break;
          }
          case M_SOLID: a = t < 0.72 ? Math.min(1, t * 14) : (1 - t) / 0.28; break;
          case M_GHOST: a = Math.min(1, t / 0.25, (1 - t) / 0.4); break;
          case M_GLINT: {
            const sd = SEED[i];
            a = Math.min(1, t / 0.2, (1 - t) / 0.45) * (0.55 + 0.45 * Math.sin((maxl - LIFE[i]) * (7 + sd * 8) + sd * 50));
            break;
          }
          default: a = 1 - t;
        }
        a *= A0[i];

        let w = sz;
        const h = sz * ASP[i];
        let ang = ROT[i];
        if (fl & F_ALIGN) {
          const vx = VX[i], vy = VY[i];
          const sp = Math.sqrt(vx * vx + vy * vy);
          if (sp > 1) ang = Math.atan2(vy, vx);
          if (STR[i] > 0) w += sp * STR[i];
        }
        const rad = (w > h ? w : h) * 0.5;
        if (x + rad < minX || x - rad > maxX || y + rad < minY || y - rad > maxY) continue;
        if (fl & F_ATTRACT) {
          // fade out as it nears the event horizon
          const dx = x - TX[i], dy = y - TY[i], kr = KILLR[i];
          const d = Math.sqrt(dx * dx + dy * dy);
          a *= clamp01((d - kr) / (kr * 0.9 + 1));
        }
        if (!(a > 0.01)) continue;
        ctx.globalAlpha = a > 1 ? 1 : a;
        const img = IMG[s];
        if (ang !== 0) {
          ctx.translate(x, y); ctx.rotate(ang);
          ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h);
          ctx.rotate(-ang); ctx.translate(-x, -y);
        } else {
          ctx.drawImage(img, x - w * 0.5, y - h * 0.5, w, h);
        }
        if (++drawn >= cap) break;
      }
    }
    ctx.restore();
  }

  // ================================ HELPERS =================================
  // Giraffe size: GS = CONFIG.GIRAFFE_SCALE, PR = the player's collision radius
  // (= 16 × GS: COM → hooves when standing). Refreshed on every update/event.
  let GS = 1, PR = 16;
  function refreshScale(g) {
    const C = ASCENT.CONFIG || {};
    GS = fin(C.GIRAFFE_SCALE) && C.GIRAFFE_SCALE > 0.1 ? C.GIRAFFE_SCALE : 1;
    const p = g && g.player;
    PR = p && fin(p.radius) && p.radius > 1 ? p.radius : 16 * GS;
  }
  // ASCENT.Cam.visible, but measured from the camera centre (see drawLayer).
  function seen(g, x, y, r) {
    const cam = g.camera;
    if (!cam || !fin(cam.cx) || !fin(cam.cy) || !(cam.zoom > 0.05)) return false;
    const pad = 60 / cam.zoom + (r || 0), hw = cam.viewW * 0.5 + pad, hh = cam.viewH * 0.5 + pad;
    return x > cam.cx - hw && x < cam.cx + hw && y > cam.cy - hh && y < cam.cy + hh;
  }
  let MX = 0, MY = 0;        // scratch: last mouth / hoof position
  function mouth(g, fx, fy) {
    const Gi = ASCENT.Giraffe;
    if (Gi && typeof Gi.mouthPos === 'function') {
      try {
        const m = Gi.mouthPos(g);
        if (m && fin(m.x) && fin(m.y)) { MX = m.x; MY = m.y; return; }
      } catch (e) { /* fall back below */ }
    }
    const p = g.player;
    MX = fin(fx) ? fx : (p ? p.x : 0);
    MY = fin(fy) ? fy : (p ? p.y : 0);
  }
  // Hooves + the "down" direction of the body (away from the tongue anchor while licking).
  let HX = 0, HY = 0, HDX = 0, HDY = 1;
  function hooves(g) {
    const p = g.player, r = g.rope;
    HDX = 0; HDY = 1;
    if (r && r.active) {
      const ax = p.x - r.x, ay = p.y - r.y, d = Math.sqrt(ax * ax + ay * ay);
      if (d > 1) { HDX = ax / d; HDY = ay / d; }
    }
    const Gi = ASCENT.Giraffe;
    if (Gi && typeof Gi.hoofPos === 'function') {
      try {
        const m = Gi.hoofPos(g);
        if (m && fin(m.x) && fin(m.y)) { HX = m.x; HY = m.y; return; }
      } catch (e) { /* fall back below */ }
    }
    const off = K.HOOF_FRAC * PR;
    HX = p.x + HDX * off; HY = p.y + HDY * off;
  }
  function shake(g, amt) { if (ASCENT.Cam && g.camera) ASCENT.Cam.shake(g, amt); }
  function num(v, fb) { return fin(v) ? v : fb; }
  // Horizontal speed of a drifting platform (so splats ride along with it).
  function platVX(pl) {
    if (!pl || !pl.moving || !fin(pl.moveSpeed) || !fin(pl.moveAmplitude) || !fin(pl.moveTime)) return 0;
    const w = pl.moveSpeed / 100;
    return Math.cos(pl.moveTime * w) * pl.moveAmplitude * w;
  }
  function zoneIndex(g) {
    const Z = ASCENT.ZONES;
    if (!Z || typeof g.progress !== 'function') return 0;
    const pr = g.progress();
    let k = 0;
    for (let i = 0; i < Z.length; i++) if (pr >= Z[i].from) k = i;
    return k < SP.GZ.length ? k : 0;
  }

  // Generic radial sparkle burst (also the public helper).
  function sparkBurst(x, y, n, sprA, sprB, spMin, spMax, sizeMin, sizeMax, lifeMin, lifeMax, flags, vx0, vy0) {
    for (let k = 0; k < n; k++) {
      const a = (k + Math.random() * 0.8) / n * TAU, sp = rnd(spMin, spMax);
      const sz = rnd(sizeMin, sizeMax);
      const i = add(k % 2 ? sprB : sprA, flags, x, y, Math.cos(a) * sp + vx0, Math.sin(a) * sp + vy0,
        rnd(lifeMin, lifeMax), sz, 0, 1, M_TWINKLE);
      phys(i, 3, 0); turn(i, Math.random() * TAU, rnd(-4, 4));
    }
  }
  // Slobber droplets (sized with the giraffe: its tongue scales with it).
  function droplets(x, y, n, dirA, spread, spMin, spMax, vx0, vy0, grav, lifeMin, lifeMax) {
    for (let k = 0; k < n; k++) {
      const a = dirA + rnd(-spread, spread), sp = rnd(spMin, spMax), sz = rnd(9, 14) * GS;
      const i = add(Math.random() < 0.7 ? SP.DROP : SP.DROP_DARK, FRONT | F_ALIGN, x, y,
        Math.cos(a) * sp + vx0, Math.sin(a) * sp + vy0, rnd(lifeMin, lifeMax), sz, sz, 1, M_SOLID);
      phys(i, 2.5, grav); blur(i, 0.012);
    }
  }

  // ============================== EVENT EFFECTS =============================
  function fxShoot(g, d) {
    mouth(g, d.x, d.y);
    const p = g.player, pvx = p ? p.vx : 0, pvy = p ? p.vy : 0;
    const a = num(d.angle, -Math.PI / 2);
    const lip = 6 * GS;                            // just past the lips
    const ox = MX + Math.cos(a) * lip, oy = MY + Math.sin(a) * lip;
    droplets(ox, oy, 4 + (Math.random() * 3 | 0), a, 0.4, 160, 460, pvx * 0.6, pvy * 0.6, 260, 0.35, 0.6);
    add(SP.G.violet, FRONT, MX, MY, pvx * 0.8, pvy * 0.8, 0.14, 26 * GS, 34 * GS, 0.55, M_BURST);
  }

  function fxAttach(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0), p = g.player;
    if (d.ground) {
      for (let k = 0; k < 7; k++) {
        const i = add(SP.DUST, FRONT, x + rnd(-10, 10), y - rnd(2, 8), rnd(-150, 150), rnd(-70, -15),
          rnd(0.55, 0.85), rnd(10, 16), rnd(26, 40), 0.55, M_SOFT);
        phys(i, 3, 0);
      }
      aspect(add(SP.R.dust, BACK, x, y, 0, 0, 0.4, 12, 90, 0.5, M_BURST), 0.25);
      droplets(x, y - 3, 3, -Math.PI / 2, 1.1, 60, 160, 0, 0, 380, 0.35, 0.5);
      shake(g, K.SHAKE_ATTACH);
      return;
    }
    const pl = d.platform;
    const type = pl ? pl.type : 'normal';
    let sA = SP.S.gold, sB = SP.S.white, gl = SP.G.gold, ring = SP.R.white;
    if (type === 'rotating') { sA = SP.S.cool; gl = SP.G.cool; }
    else if (type === 'crumbling') { sA = SP.S.warm; sB = SP.S.gold; gl = SP.G.warm; ring = SP.R.gold; }
    else if (type === 'disappearing') { sA = SP.S.cyan; gl = SP.G.cyan; ring = SP.R.cyan; }
    const pv = platVX(pl);
    // splat: goo bounces back toward the giraffe and sprays sideways
    let ux = 0, uy = -1;
    if (p) {
      const dx = x - p.x, dy = y - p.y, dl = Math.sqrt(dx * dx + dy * dy);
      if (dl > 1) { ux = dx / dl; uy = dy / dl; }
    }
    droplets(x, y, 8, Math.atan2(-uy, -ux), 1.35, 90, 300, pv * 0.5, 0, 220, 0.35, 0.6);
    // quick sparkle ring
    for (let k = 0; k < 8; k++) {
      const a = (k + rnd(-0.2, 0.2)) / 8 * TAU, sp = rnd(230, 290);
      const i = add(k % 2 ? sB : sA, FRONT, x, y, Math.cos(a) * sp + pv, Math.sin(a) * sp, 0.42, rnd(10, 13), 0, 1, M_FLASH);
      phys(i, 7, 0); turn(i, Math.random() * TAU, rnd(-5, 5));
    }
    add(ring, FRONT, x, y, pv, 0, 0.3, 10, 64, 0.8, M_BURST);
    add(gl, FRONT, x, y, pv, 0, 0.16, 30, 46, 0.7, M_BURST);
    shake(g, K.SHAKE_ATTACH);
  }

  function fxMiss(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0), a = num(d.angle, 0);
    droplets(x, y, 3 + (Math.random() * 2 | 0), a, 0.9, 60, 200, 0, 0, 320, 0.45, 0.7);
    add(SP.G.violet, FRONT, x, y, 0, 0, 0.15, 14, 26, 0.6, M_BURST);
  }

  function fxRelease(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k + Math.random()) / 5 * TAU, sp = rnd(90, 170);
      const i = add(k % 2 ? SP.S.violet : SP.S.white, FRONT, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.32, rnd(7, 10), 0, 0.9, M_FLASH);
      phys(i, 6, 0); turn(i, Math.random() * TAU, rnd(-4, 4));
    }
    add(SP.R.white, FRONT, x, y, 0, 0, 0.22, 6, 30, 0.45, M_BURST);
    droplets(x, y, 2, Math.PI / 2, 0.7, 30, 90, 0, 0, 260, 0.4, 0.6);
  }

  function fxCut(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0), cvx = num(d.vx, 0), cvy = num(d.vy, 0);
    const cs = Math.sqrt(cvx * cvx + cvy * cvy);
    const ca = cs > 1 ? Math.atan2(cvy, cvx) : 0;
    add(SP.G.warm, FRONT, x, y, 0, 0, 0.32, 150, 200, 0.6, M_BURST);
    add(SP.G.white, FRONT, x, y, 0, 0, 0.16, 90, 120, 0.95, M_BURST);
    add(SP.R.gold, FRONT, x, y, 0, 0, 0.34, 14, 110, 0.9, M_BURST);
    const spr = [SP.K.warm, SP.K.gold, SP.K.white];
    for (let k = 0; k < 26; k++) {
      const a = Math.random() < 0.6 ? ca + rnd(-0.9, 0.9) : Math.random() * TAU;
      const sp = rnd(250, 720);
      const i = add(spr[k % 3], FRONT | F_ALIGN, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.28, 0.6), rnd(10, 13), 0, 1, M_FLASH);
      phys(i, 3.2, k % 4 === 0 ? 120 : 0); aspect(i, 0.35); blur(i, K.SPARK_STRETCH);
    }
    droplets(x, y, 14, ca, 1.6, 100, 380, cvx * 0.15, cvy * 0.15, 240, 0.6, 1.0);
    sparkBurst(x, y, 6, SP.S.gold, SP.S.white, 120, 260, 11, 16, 0.5, 0.8, FRONT, 0, 0);
    shake(g, K.SHAKE_CUT);
  }

  function fxPhase(g, d) {
    const pl = d.platform;
    const x = num(d.x, 0), y = num(d.y, 0);
    const w = pl && fin(pl.width) ? pl.width : 50, an = pl && fin(pl.angle) ? pl.angle : 0;
    const c = Math.cos(an), s = Math.sin(an), pv = platVX(pl) * 0.3;
    add(SP.G.cyan, FRONT, x, y, pv, 0, 0.25, 60, 90, 0.6, M_BURST);
    aspect(add(SP.R.cyan, FRONT, x, y, pv, 0, 0.3, 10, 80, 0.7, M_BURST), 0.45);
    for (let k = 0; k < 12; k++) {
      const u = rnd(-0.5, 0.5) * w;
      const i = add(SP.SHARD, FRONT, x + c * u, y + s * u + rnd(-4, 4), u * 2.2 + rnd(-70, 70) + pv, rnd(-150, 90),
        rnd(0.6, 1.0), rnd(12, 20), rnd(7, 11), 1, M_SOLID);
      phys(i, 1.4, 0); turn(i, Math.random() * TAU, rnd(-7, 7));
    }
    sparkBurst(x, y, 8, SP.S.cyan, SP.S.white, 60, 150, 9, 13, 0.4, 0.6, FRONT, pv, 0);
  }

  function fxCrumble(g, d) {
    const pl = d.platform;
    const x = num(d.x, 0), y = num(d.y, 0), w = Math.max(20, num(d.width, 80));
    const an = pl && fin(pl.angle) ? pl.angle : 0, c = Math.cos(an), s = Math.sin(an);
    const pv = platVX(pl) * 0.3;
    add(SP.G.warm, FRONT, x, y, pv, 0, 0.22, w * 1.1 + 40, w * 1.3 + 60, 0.5, M_BURST);
    // steam first so the chunks draw over it
    const ns = Math.max(3, Math.min(8, Math.round(w / 16)));
    for (let k = 0; k < ns; k++) {
      const u = rnd(-0.5, 0.5) * w;
      const i = add(SP.STEAM, FRONT, x + c * u, y + s * u, rnd(-30, 30) + pv, rnd(-60, -15), rnd(0.9, 1.3), rnd(14, 20), rnd(36, 48), 0.45, M_SOFT);
      phys(i, 1.5, 0);
    }
    const nc = Math.max(8, Math.min(20, Math.round(w / 5)));
    for (let k = 0; k < nc; k++) {
      const u = rnd(-0.5, 0.5) * w, off = rnd(-5, 5);
      const spr = Math.random() < 0.6 ? SP.ICE[k % 2] : SP.ROCK;
      const i = add(spr, FRONT, x + c * u - s * off, y + s * u + c * off, u * 1.6 + rnd(-80, 80) + pv, rnd(-90, 140),
        rnd(0.9, 1.4), rnd(8, 16), rnd(6, 12), 1, M_SOLID);
      phys(i, 0.6, 320); turn(i, Math.random() * TAU, rnd(-9, 9));
    }
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU, sp = rnd(120, 320);
      const i = add(k % 2 ? SP.K.warm : SP.K.gold, FRONT | F_ALIGN, x + c * rnd(-0.5, 0.5) * w, y, Math.cos(a) * sp + pv, Math.sin(a) * sp,
        rnd(0.3, 0.6), rnd(8, 11), 0, 1, M_FLASH);
      phys(i, 2.5, 150); aspect(i, 0.35); blur(i, K.SPARK_STRETCH * 0.8);
    }
    shake(g, K.SHAKE_CRUMBLE);
  }

  function fxBoost(g) {
    const p = g.player;
    if (!p) return;
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    let bx, by;
    if (sp > 40) { bx = -p.vx / sp; by = -p.vy / sp; } else { bx = -(p.facing || 1); by = 0.3; }
    const px = -by, py = bx;                       // perpendicular
    const back = K.HOOF_FRAC * PR, jit = 0.3 * PR; // puff from just behind the body
    const ox = p.x + bx * back, oy = p.y + by * back;
    const zg = SP.GZ[zoneIndex(g)];
    const glows = [SP.G.gold, SP.G.white, SP.G.violet, zg];
    for (let k = 0; k < 14; k++) {
      const f = rnd(80, 280) * GS, q = rnd(-70, 70) * GS;
      const i = add(glows[k % 4], BACK, ox + rnd(-jit, jit), oy + rnd(-jit, jit), bx * f + px * q + p.vx * 0.35, by * f + py * q + p.vy * 0.35,
        rnd(0.4, 0.8), rnd(10, 18) * GS, 0, 1, M_FLASH);
      phys(i, 3, 0);
    }
    for (let k = 0; k < 6; k++) {
      const f = rnd(60, 220) * GS, q = rnd(-90, 90) * GS;
      const i = add(k % 2 ? SP.S.gold : SP.S.white, FRONT, ox, oy, bx * f + px * q + p.vx * 0.35, by * f + py * q + p.vy * 0.35,
        rnd(0.45, 0.75), rnd(10, 14) * GS, 0, 1, M_TWINKLE);
      phys(i, 3, 0); turn(i, Math.random() * TAU, rnd(-5, 5));
    }
    add(SP.R.gold, BACK, ox, oy, p.vx * 0.5, p.vy * 0.5, 0.26, 8 * GS, 50 * GS, 0.6, M_BURST);
  }

  // (x, y) = hoof level (game.js sends p.y + radius).
  function fxJump(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0);
    if (!d.double) {
      // ring ≈ 1.6× the giraffe's width, flattened onto the planet surface
      aspect(add(SP.R.dust, BACK, x, y + 2 * GS, 0, 0, 0.45, 16 * GS, 120 * GS, 0.55, M_BURST), 0.22);
      for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1;
        const i = add(SP.DUST, FRONT, x + side * rnd(0, 0.75 * PR), y - 4 * GS, side * rnd(70, 200) * GS, rnd(-45, -10) * GS,
          rnd(0.5, 0.75), rnd(9, 13) * GS, rnd(22, 32) * GS, 0.5, M_SOFT);
        phys(i, 3.5, 0);
      }
      return;
    }
    // double jump: a starry ring kicked off thin air, just under the hooves
    const yy = y + 8 * GS;
    aspect(add(SP.R.gold, FRONT, x, yy, 0, 0, 0.4, 18 * GS, 96 * GS, 0.8, M_BURST), 0.32);
    aspect(add(SP.R.white, FRONT, x, yy, 0, 0, 0.28, 10 * GS, 60 * GS, 0.6, M_BURST), 0.32);
    add(SP.G.gold, FRONT, x, yy, 0, 0, 0.2, 40 * GS, 60 * GS, 0.5, M_BURST);
    const cols = [SP.S.gold, SP.S.white, SP.S.cool];
    const v = 210 * GS;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU;
      const i = add(cols[k % 3], FRONT, x, yy, Math.cos(a) * v, Math.sin(a) * v * 0.32 + 30, 0.5, rnd(9, 13) * GS, 0, 1, M_TWINKLE);
      phys(i, 5, 0); turn(i, Math.random() * TAU, rnd(-5, 5));
    }
  }

  // (x, y) = the touch-down point on the planet surface.
  function fxLand(g, d) {
    const x = num(d.x, 0), y = num(d.y, 0);
    const s = clamp01((num(d.speed, 0) - 100) / 800);
    // shockwave: from under the hooves out to ~2-5 giraffe widths, by impact
    aspect(add(SP.R.dust, BACK, x, y, 0, 0, 0.5 + 0.3 * s, 24 * GS, (140 + 260 * s) * GS, 0.45 + 0.3 * s, M_BURST), 0.2);
    const n = Math.round(6 + 14 * s);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const i = add(SP.DUST, FRONT, x + side * rnd(0, 1.25 * PR), y - rnd(2, 8) * GS, side * rnd(90, 180 + 300 * s) * GS, rnd(-30, -80 - 40 * s) * GS,
        rnd(0.55, 0.9 + 0.3 * s), rnd(10, 14) * GS, rnd(26, 34 + 28 * s) * GS, 0.55, M_SOFT);
      phys(i, 3, 0);
    }
    if (s > 0.3) {
      const m = Math.round(2 + 6 * s);
      for (let k = 0; k < m; k++) {
        const vy = -rnd(160, 260 + 200 * s);
        // live exactly until the pebble falls back to the surface (gravity 900)
        const i = add(SP.EARTH, FRONT, x + rnd(-0.9, 0.9) * PR, y - 2, rnd(-160, 160), vy, Math.min(1.2, -2 * vy / 900),
          rnd(4, 7) * GS, rnd(4, 7) * GS, 1, M_SOLID);
        phys(i, 0, 900); turn(i, Math.random() * TAU, rnd(-10, 10));
      }
    }
    shake(g, K.SHAKE_LAND_MIN + (K.SHAKE_LAND_MAX - K.SHAKE_LAND_MIN) * s);
  }

  function fxFlare(g, d) {
    const f = d.flare, p = g.player;
    if (!f || !p || !fin(f.y)) return;
    const viewH = g.camera ? g.camera.viewH : g.screenHeight;
    if (Math.abs(f.y - p.y) < viewH) shake(g, K.SHAKE_FLARE);
    const lw = g.levelWidth || 0;
    const ex = Math.max(0, Math.min(lw, num(f.x, 0))), dir = f.direction > 0 ? 1 : -1;
    if (!seen(g, ex, f.y, 120)) return;
    add(SP.G.warm, FRONT, ex, f.y, 0, 0, 0.3, 120, 170, 0.7, M_BURST);
    for (let k = 0; k < 14; k++) {
      const i = add(k % 2 ? SP.K.warm : SP.K.gold, FRONT | F_ALIGN, ex, f.y + rnd(-15, 15), dir * rnd(150, 600), rnd(-200, 200),
        rnd(0.3, 0.6), rnd(9, 12), 0, 1, M_FLASH);
      phys(i, 2.5, 0); aspect(i, 0.35); blur(i, K.SPARK_STRETCH);
    }
  }

  // The giraffe vanishes the instant it dies (the Giraffe module skips drawing
  // it during the death beat) and the camera holds on the spot for DEATH_BEAT,
  // so the poof must (1) cover the vanished giraffe at once, (2) read as a big
  // comic cloud for the first ~0.4 s and (3) be completely gone by the time
  // the camera cuts to the respawn. Every life here is a fraction of PL.
  function fxDeath(g, d) {
    const C = ASCENT.CONFIG || {};
    const beat = fin(C.DEATH_BEAT) && C.DEATH_BEAT > 0.2 ? C.DEATH_BEAT : 0.8;
    const PL = beat * K.DEATH_FIT;                 // ≈ 0.72 s
    let x = num(d.x, 0), y = num(d.y, 0);
    const singed = d.cause === 'flare';
    // A 'void' death happens ~100 px outside the level's side edge, but the
    // camera never shows past the edge — pull the poof just inside it and
    // blow the cloud inward so it bulges into view instead of off-screen.
    const lw = fin(g.levelWidth) && g.levelWidth > 0 ? g.levelWidth : 0;
    let inX = 0, inY = 0;
    if (lw > K.DEATH_EDGE * 2) {
      if (x < K.DEATH_EDGE) { x = K.DEATH_EDGE; inX = 1; }
      else if (x > lw - K.DEATH_EDGE) { x = lw - K.DEATH_EDGE; inX = -1; }
    }
    const gy = g.ground && fin(g.ground.y) ? g.ground.y : Infinity;
    if (y > gy - PR) { y = gy - PR; inY = -1; }     // (debug-flight through the planet)
    const vin = (vx, vy, out) => {                  // mirror outward-going velocity
      if (inX && vx * inX < 0) vx = -vx;
      if (inY && vy * inY < 0) vy = -vy;
      out[0] = vx; out[1] = vy;
    };
    const v = VTMP;

    // flash + shock ring hide the moment the giraffe blinks out
    add(SP.G.white, FRONT, x, y, 0, 0, 0.16, 70 * GS, 160 * GS, 0.95, M_BURST);
    add(SP.R.white, FRONT, x, y, 0, 0, 0.32, 24 * GS, 190 * GS, 0.55, M_BURST);
    // the comic cloud: starts giraffe-sized, balloons to ~2.3× it (~200 px),
    // holds, then evaporates by ~0.7 s
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * TAU, r0 = rnd(0, 0.9) * PR, sp = rnd(60, 200) * GS;
      vin(Math.cos(a) * sp, Math.sin(a) * sp - 20 * GS, v);
      const spr = singed && k % 2 ? SP.CHAR : SP.POOF;
      const i = add(spr, FRONT, x + Math.cos(a) * r0, y + Math.sin(a) * r0, v[0], v[1],
        PL * rnd(0.62, 1), rnd(20, 28) * GS, rnd(38, 56) * GS, 1, M_POOF);
      phys(i, 4.5, 0);
    }
    // bits of giraffe (coat patches) flung out of it
    for (let k = 0; k < 6; k++) {
      const a = (k + Math.random() * 0.7) / 6 * TAU, sp = rnd(170, 330) * GS, sz = rnd(10, 15) * GS;
      vin(Math.cos(a) * sp, Math.sin(a) * sp - 50 * GS, v);
      const i = add(SP.SPOT[k % 2], FRONT, x, y, v[0], v[1], PL * rnd(0.8, 1), sz, sz, 1, M_SOLID);
      phys(i, 1.2, 220); turn(i, Math.random() * TAU, rnd(-9, 9));
    }
    // cartoon stars
    for (let k = 0; k < 10; k++) {
      const a = (k + Math.random() * 0.5) / 10 * TAU, sp = rnd(190, 340) * GS;
      vin(Math.cos(a) * sp, Math.sin(a) * sp, v);
      const i = add(k % 2 ? SP.S.white : SP.S.gold, FRONT, x, y, v[0], v[1], PL * rnd(0.7, 1), rnd(14, 20) * GS, 0, 1, M_TWINKLE);
      phys(i, 2.6, 0); turn(i, Math.random() * TAU, rnd(-4, 4));
    }
    if (singed) {
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * TAU, sp = rnd(150, 450) * GS;
        vin(Math.cos(a) * sp, Math.sin(a) * sp, v);
        const i = add(k % 2 ? SP.K.warm : SP.K.gold, FRONT | F_ALIGN, x, y, v[0], v[1], PL * rnd(0.5, 0.9), rnd(9, 12) * GS, 0, 1, M_FLASH);
        phys(i, 2.5, 0); aspect(i, 0.35); blur(i, K.SPARK_STRETCH);
      }
    }
    // The camera object survives the beat (it only holds), so this plays out
    // in full on the poof.
    shake(g, K.SHAKE_DEATH);
  }
  const VTMP = [0, 0];

  // After the death beat game.js resets to the start (a fresh, still camera)
  // and fires this with the giraffe standing on the planet: a light column
  // beams it in, sparkles sweep up it and a ring spreads under the hooves.
  function fxRespawn(g, d) {
    shake(g, K.SHAKE_RESPAWN);
    const x = num(d.x, 0), y = num(d.y, 0);
    const H = K.GIRAFFE_H * GS;                     // ≈ 94 px standing
    const foot = y + PR;                            // hooves, on the surface
    const mid = foot - H * 0.5;
    const L = H * 2.7;                              // column height (~250 px), foot upward
    add(SP.G.cool, BACK, x, mid, 0, 0, 0.5, 90 * GS, 180 * GS, 0.6, M_BURST);
    // Streak sprites fade to nothing at both ends. Centred 0.4 L up, the beam
    // is brightest just above the head, still ~60% at the giraffe's middle,
    // faint at the hooves and gone ~0.1 L below the surface (so it doesn't
    // visibly stab into the planet).
    turn(aspect(add(SP.K.white, BACK, x, foot - L * 0.4, 0, 0, 0.6, L, L, 0.7, M_FLASH), 0.09), -Math.PI / 2, 0);
    turn(aspect(add(SP.K.cyan, BACK, x, foot - L * 0.45, 0, 0, 0.7, L * 1.1, L * 1.1, 0.45, M_FLASH), 0.24), -Math.PI / 2, 0);
    // a brief additive wash over the giraffe itself: it "materialises"
    add(SP.G.white, FRONT, x, mid, 0, 0, 0.28, 70 * GS, 110 * GS, 0.5, M_BURST);
    aspect(add(SP.R.cyan, FRONT, x, foot, 0, 0, 0.55, 24 * GS, 140 * GS, 0.75, M_BURST), 0.28);
    // sparkles sweep up the column, bottom first
    for (let k = 0; k < 24; k++) {
      const f = k / 23;
      const spr = Math.random() < 0.2 ? SP.S.gold : (k % 3 === 0 ? SP.S.cyan : k % 3 === 1 ? SP.S.cool : SP.S.white);
      const i = add(spr, FRONT, x + rnd(-0.9, 0.9) * PR, foot - 6 * GS - f * L * 0.85, rnd(-15, 15), rnd(-80, -30), rnd(0.45, 0.7), rnd(8, 13) * GS, 0, 1, M_TWINKLE);
      later(i, f * 0.35); turn(i, Math.random() * TAU, rnd(-3, 3));
    }
  }

  // ---- the Celestial Acacia party ----
  //
  // Where the camera will end up (cam.js, victory branch): zoom Z, centred
  // between the tree and the giraffe, the tree GY down the screen. At
  // 1600×900 that is a 1143×643 world rect reaching only ~193 px above the
  // tree (and ~450 below it), so everything here is launched with modest
  // upward speed and placed inside VL/VT/VW/VH.
  let partyUntil = 0, nextBurst = 0, burstN = 0, accMunch = 0;
  let VL = 0, VT = 0, VW = 1, VH = 1;
  function victoryView(g) {
    const C = ASCENT.CONFIG || {}, goal = g.goal, p = g.player;
    const z = fin(C.CAMERA_VICTORY_ZOOM) && C.CAMERA_VICTORY_ZOOM > 0.1 ? C.CAMERA_VICTORY_ZOOM : 1.4;
    const fy = fin(C.CAMERA_VICTORY_GOAL_Y) ? clamp01(C.CAMERA_VICTORY_GOAL_Y) : 0.3;
    VW = Math.max(100, num(g.screenWidth, 1600) / z);
    VH = Math.max(100, num(g.screenHeight, 900) / z);
    let cx = p && fin(p.x) ? (goal.x + p.x) / 2 : goal.x;
    const lw = num(g.levelWidth, 0);
    if (lw > 0) cx = lw <= VW ? lw / 2 : Math.max(VW / 2, Math.min(lw - VW / 2, cx));
    VL = cx - VW / 2;
    VT = goal.y - fy * VH;
  }
  // Clamp a burst centre into the final framing, keeping it off the edges and
  // out of the lower part of the screen (the win banner lives there).
  function frameX(x, m) { return Math.max(VL + m, Math.min(VL + VW - m, x)); }
  function frameY(y, m) { const lo = VT + m; return Math.max(lo, Math.min(Math.max(lo, VT + VH * 0.6), y)); }

  // Acacia fronds + golden puffballs. Vertical launch speed is squashed and
  // gravity pulls them back so they arc up, then flutter down through the view.
  function leafBits(x, y, n, spMin, spMax, upBias, lifeMin, lifeMax) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, sp = rnd(spMin, spMax);
      const blossom = Math.random() < 0.3;
      const sz = blossom ? rnd(9, 12) : rnd(14, 19);
      const i = add(blossom ? SP.BLOSSOM : SP.LEAF, FRONT | F_SWAY, x + Math.cos(a) * rnd(10, 50), y + Math.sin(a) * rnd(8, 30),
        Math.cos(a) * sp, Math.sin(a) * sp * 0.65 - upBias, rnd(lifeMin, lifeMax), sz, sz, 1, M_SOLID);
      phys(i, 1.1, 60); turn(i, Math.random() * TAU, rnd(-5, 5));
    }
  }
  function fxGoal(g, d) {
    const x = num(d.x, g.goal ? g.goal.x : 0), y = num(d.y, g.goal ? g.goal.y : 0);
    partyUntil = (g.time || 0) + K.GOAL_PARTY_SECS;
    nextBurst = (g.time || 0) + 0.3;
    burstN = 0; accMunch = 0;
    // the big bloom, centred on the tree (ring ≈ 300 px across)
    add(SP.G.gold, FRONT, x, y, 0, 0, 0.6, 120, 300, 0.8, M_BURST);
    add(SP.R.gold, FRONT, x, y, 0, 0, 0.7, 30, 360, 0.85, M_BURST);
    add(SP.R.white, FRONT, x, y, 0, 0, 0.45, 20, 220, 0.6, M_BURST);
    // fronds peak ≲ 190 px above the tree, then drift down past it
    leafBits(x, y - 20, 26, 60, 260, 70, 2.4, 3.6);
    // an elliptical star burst (flattened so the upward half stays in view)
    const cols = [SP.S.gold, SP.S.white, SP.S.leaf];
    for (let k = 0; k < 26; k++) {
      const a = (k + Math.random()) / 26 * TAU, sp = rnd(160, 420);
      const i = add(cols[k % 3], FRONT, x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.7, rnd(1.0, 1.6), rnd(12, 20), 0, 1, M_TWINKLE);
      phys(i, 2, 0); turn(i, Math.random() * TAU, rnd(-3, 3));
    }
  }
  function miniBurst(x, y) {
    add(Math.random() < 0.5 ? SP.G.gold : SP.G.leaf, FRONT, x, y, 0, 0, 0.25, 40, 80, 0.6, M_BURST);
    add(SP.R.gold, FRONT, x, y, 0, 0, 0.35, 8, 70, 0.6, M_BURST);
    // sparks travel ≲ 90 px (speed / drag)
    sparkBurst(x, y, 14, SP.S.gold, Math.random() < 0.5 ? SP.S.white : SP.S.leaf, 140, 260, 10, 15, 0.6, 0.9, FRONT, 0, 0);
    leafBits(x, y, 4, 40, 120, 20, 1.8, 2.8);
  }
  // Bursts cycle around the scene: over the canopy, beside the tree (alternating
  // sides), then behind the munching giraffe, all inside the final framing.
  function party(g) {
    if (partyUntil <= 0) return;
    const goal = g.goal, p = g.player, t = g.time || 0;
    if (!goal || !goal.reached || !fin(goal.x) || !fin(goal.y) || t > partyUntil) { partyUntil = 0; return; }
    if (t < nextBurst) return;
    nextBurst = t + rnd(K.GOAL_BURST_MIN, K.GOAL_BURST_MAX);
    victoryView(g);
    const m = Math.min(K.GOAL_MARGIN, VW * 0.12, VH * 0.14);
    const spot = burstN++ % 4;
    let x, y;
    if (spot === 0) {                                           // over the canopy
      x = goal.x + rnd(-110, 110); y = goal.y - rnd(45, 100);
    } else if (spot === 3 && p && fin(p.x) && fin(p.y)) {       // behind the giraffe's head
      const f = p.facing < 0 ? -1 : 1;
      x = p.x - f * rnd(50, 120); y = p.y - rnd(40, 110);
    } else {                                                    // flanking the tree, left then right
      const side = spot === 1 ? -1 : 1;
      x = goal.x + side * rnd(150, Math.max(160, Math.min(300, VW * 0.4))); y = goal.y + rnd(-100, 30);
    }
    miniBurst(frameX(x, m), frameY(y, m));
  }
  // Leaf crumbs tumbling from the munching mouth for as long as the win lasts.
  function emitMunch(g, dt) {
    const goal = g.goal;
    if (!goal || !goal.reached) { accMunch = 0; return; }
    accMunch += K.MUNCH_RATE * dt;
    if (accMunch < 1) return;
    accMunch -= 1;
    const p = g.player;
    mouth(g, p.x, p.y);
    if (!seen(g, MX, MY, 40)) return;
    const blossom = Math.random() < 0.25;
    const sz = (blossom ? rnd(5, 7) : rnd(8, 11)) * GS;
    const i = add(blossom ? SP.BLOSSOM : SP.LEAF, FRONT | F_SWAY, MX + rnd(-3, 3) * GS, MY + 2 * GS, rnd(-40, 40), rnd(-30, 10),
      rnd(1.2, 1.7), sz, sz * 0.8, 1, M_SOLID);
    phys(i, 1.4, 150); turn(i, Math.random() * TAU, rnd(-6, 6));
  }

  // The giraffe starts standing on the planet: twinkle around its middle
  // (not its COM, which sits low in the body), never below the surface.
  function fxRunStart(g) {
    count = 0; ovr = 0;
    resetEmitters();
    const p = g.player;
    if (!p || !fin(p.x) || !fin(p.y)) return;
    const foot = p.y + PR, mid = foot - K.GIRAFFE_H * GS * 0.5;
    add(SP.G.cool, BACK, p.x, mid, 0, 0, 0.6, 60 * GS, 120 * GS, 0.3, M_GHOST);
    const cols = [SP.S.white, SP.S.gold, SP.S.cool];
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * TAU, r = rnd(26, 70) * GS, sp = rnd(8, 30);
      const i = add(cols[k % 3], FRONT, p.x + Math.cos(a) * r, Math.min(foot - 6 * GS, mid + Math.sin(a) * r * 0.9),
        Math.cos(a) * sp, Math.sin(a) * sp * 0.5 - 15, rnd(0.7, 1.1), rnd(8, 13) * GS, 0, 1, M_TWINKLE);
      later(i, rnd(0, 0.45)); turn(i, Math.random() * TAU, rnd(-2, 2));
    }
  }

  function onEvent(g, type, d) {
    if (!ready) return;
    refreshScale(g);
    switch (type) {
      case 'tongueShoot': fxShoot(g, d); break;
      case 'tongueAttach': fxAttach(g, d); break;
      case 'tongueMiss': fxMiss(g, d); break;
      case 'tongueRelease': fxRelease(g, d); break;
      case 'tongueCut': fxCut(g, d); break;
      case 'phaseDetach': fxPhase(g, d); break;
      case 'crumble': fxCrumble(g, d); break;
      case 'boost': fxBoost(g); break;
      case 'jump': fxJump(g, d); break;
      case 'land': fxLand(g, d); break;
      case 'flareIgnite': fxFlare(g, d); break;
      case 'death': fxDeath(g, d); break;
      case 'respawn': hasLast = false; partyUntil = 0; fxRespawn(g, d); break;
      case 'goal': fxGoal(g, d); break;
      case 'runStart': fxRunStart(g); break;
    }
  }

  // ========================== CONTINUOUS EMITTERS ===========================
  let accTrail = 0, accBoost = 0, accGlint = 0, accLeaf = 0, dripT = 0.5;
  let lastX = 0, lastY = 0, hasLast = false;
  const accWell = new Float32Array(16), accFlare = new Float32Array(16);
  function resetEmitters() {
    accTrail = 0; accBoost = 0; accGlint = 0; accLeaf = 0; dripT = 0.5;
    hasLast = false; partyUntil = 0; burstN = 0; accMunch = 0;
    accWell.fill(0); accFlare.fill(0);
  }

  function emitTrail(g, dt, p) {
    const vx = p.vx, vy = p.vy;
    const sp = Math.sqrt(vx * vx + vy * vy);
    // a jump of >300 px in one frame is a teleport (respawn / debug), not motion
    const lastOk = hasLast && Math.abs(p.x - lastX) + Math.abs(p.y - lastY) < 300;
    if (sp > K.TRAIL_MIN_SPEED) {
      accTrail += Math.min(K.TRAIL_RATE_MAX, K.TRAIL_RATE_MIN + (sp - K.TRAIL_MIN_SPEED) * K.TRAIL_RATE_PER_PX) * dt;
      const ux = vx / sp, uy = vy / sp;
      const zg = SP.GZ[zoneIndex(g)];
      const back = 0.5 * PR, wide = 0.45 * PR;     // wake starts just behind the COM, ~a body wide
      while (accTrail >= 1) {
        accTrail -= 1;
        // scatter along this frame's path so fast motion leaves an unbroken wake
        const f = lastOk ? Math.random() : 1;
        const bx = (lastOk ? lastX + (p.x - lastX) * f : p.x) - ux * back;
        const by = (lastOk ? lastY + (p.y - lastY) * f : p.y) - uy * back;
        const j = rnd(-wide, wide);
        const r = Math.random();
        let i;
        if (r < 0.88) {
          i = add(r < 0.5 ? SP.G.white : zg, BACK, bx - uy * j, by + ux * j, vx * 0.12 + rnd(-25, 25), vy * 0.12 + rnd(-25, 25),
            rnd(0.45, 0.85), rnd(9, 16) * GS, 0, 0.9, M_FLASH);
        } else {
          i = add(SP.S.white, BACK, bx - uy * j, by + ux * j, vx * 0.1, vy * 0.1, rnd(0.5, 0.8), rnd(8, 12) * GS, 0, 0.9, M_TWINKLE);
          turn(i, Math.random() * TAU, rnd(-3, 3));
        }
        phys(i, 2.2, 0);
      }
    } else accTrail = 0;
    lastX = p.x; lastY = p.y; hasLast = true;
  }

  function emitBoost(g, dt, p) {
    if (!p.boosting) { accBoost = 0; return; }
    accBoost += K.BOOST_RATE * dt;
    if (accBoost < 1) return;
    hooves(g);
    const jx = 8 * GS, jy = 6 * GS;                // spread across the four hooves
    while (accBoost >= 1) {
      accBoost -= 1;
      const f = rnd(60, 180);
      const vx = HDX * f - p.vx * 0.15 + rnd(-50, 50), vy = HDY * f - p.vy * 0.15 + rnd(-50, 50);
      const r = Math.random();
      let i;
      if (r < 0.55) {
        i = add(r < 0.3 ? SP.S.gold : SP.S.white, r < 0.3 ? FRONT : BACK, HX + rnd(-jx, jx), HY + rnd(-jy, jy), vx, vy, rnd(0.3, 0.5), rnd(7, 11) * GS, 0, 1, M_TWINKLE);
        turn(i, Math.random() * TAU, rnd(-6, 6));
      } else {
        i = add(SP.G.gold, BACK, HX + rnd(-jx, jx), HY + rnd(-jy, jy), vx, vy, rnd(0.3, 0.5), rnd(8, 14) * GS, 0, 1, M_FLASH);
      }
      phys(i, 3, 0);
    }
  }

  function emitDrip(g, dt, p) {
    const r = g.rope;
    if (!r || !r.active) { dripT = rnd(0.2, 0.5); return; }
    dripT -= dt;
    if (dripT > 0) return;
    dripT = rnd(K.DRIP_MIN, K.DRIP_MAX);
    mouth(g, p.x, p.y);
    const sz = rnd(8, 11) * GS;
    const i = add(SP.DROP, FRONT | F_ALIGN, MX, MY + 3 * GS, p.vx * 0.75 + rnd(-15, 15), p.vy * 0.75 + rnd(20, 50), 0.9, sz, sz, 1, M_SOLID);
    phys(i, 0.8, 420); blur(i, 0.006);
  }

  function emitAcacia(g, dt) {
    const goal = g.goal;
    if (!goal || !fin(goal.x) || !fin(goal.y) || !seen(g, goal.x, goal.y, 220)) { accGlint = 0; accLeaf = 0; return; }
    accGlint += K.GLINT_RATE * dt;
    while (accGlint >= 1) {
      accGlint -= 1;
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random());
      const r = Math.random();
      const spr = r < 0.4 ? SP.S.gold : r < 0.7 ? SP.S.leaf : SP.G.leaf;
      const i = add(spr, FRONT, goal.x + Math.cos(a) * 120 * rr, goal.y - 10 + Math.sin(a) * 90 * rr, rnd(-12, 12), rnd(-30, -8),
        rnd(1.4, 2.4), rnd(8, 14), rnd(2, 5), 0.9, M_GLINT);
      turn(i, Math.random() * TAU, rnd(-1.5, 1.5));
    }
    accLeaf += K.LEAF_RATE * dt;
    while (accLeaf >= 1) {
      accLeaf -= 1;
      const sz = rnd(13, 17);
      const i = add(SP.LEAF, BACK | F_SWAY, goal.x + rnd(-90, 90), goal.y + rnd(-90, -10), rnd(-20, 20), rnd(8, 26), rnd(3, 4.5), sz, sz, 0.95, M_GHOST);
      turn(i, Math.random() * TAU, rnd(-1.4, 1.4));
    }
  }

  function emitWells(g, dt) {
    const wells = g.gravityWells;
    if (!wells) return;
    for (let n = 0; n < wells.length && n < 16; n++) {
      const w = wells[n];
      if (!w || !fin(w.x) || !fin(w.y) || !(w.radius > 0)) continue;
      const R = w.radius * 2;
      if (!seen(g, w.x, w.y, R)) { accWell[n] = 0; continue; }
      accWell[n] += K.WELL_RATE * dt;
      while (accWell[n] >= 1) {
        accWell[n] -= 1;
        const a = Math.random() * TAU, r = R * rnd(0.72, 0.98);
        const c = Math.cos(a), s = Math.sin(a);
        // sub-orbital tangential speed + a little inward → spirals in (drag saps the rest)
        const vt = Math.sqrt(K.WELL_PULL * r) * rnd(0.45, 0.75), vr = rnd(20, 60);
        // life outlasts the ~2 s fall, so the ghost fade-out never dims them early —
        // the event-horizon fade in drawLayer does the vanishing
        const i = add(Math.random() < 0.6 ? SP.K.acc : SP.K.violet, BACK | F_ALIGN | F_ATTRACT, w.x + c * r, w.y + s * r,
          -s * vt - c * vr, c * vt - s * vr, 3.4, rnd(6, 9), rnd(6, 9), rnd(0.4, 0.75), M_GHOST);
        if (i >= 0) {
          phys(i, 1.2, 0); aspect(i, 0.4); blur(i, 0.03);
          TX[i] = w.x; TY[i] = w.y; PULL[i] = K.WELL_PULL; KILLR[i] = w.radius * K.WELL_CORE_FRAC + 4;
        }
      }
    }
  }

  function emitFlares(g, dt) {
    const fl = g.solarFlares;
    if (!fl) return;
    for (let n = 0; n < fl.length && n < 16; n++) {
      const f = fl[n];
      if (!f || f.state !== 'active' || !fin(f.x) || !fin(f.y) || !seen(g, f.x, f.y, 60)) { accFlare[n] = 0; continue; }
      accFlare[n] += K.FLARE_RATE * dt;
      const dir = f.direction > 0 ? 1 : -1, hh = (f.height || 30) * 0.6;
      while (accFlare[n] >= 1) {
        accFlare[n] -= 1;
        const y = f.y + rnd(-1, 1) * hh;
        if (Math.random() < 0.78) {
          const r = Math.random();
          const i = add(r < 0.45 ? SP.K.warm : r < 0.85 ? SP.K.gold : SP.K.white, FRONT | F_ALIGN, f.x, y,
            dir * rnd(-100, 500), rnd(-1, 1) * rnd(40, 240), rnd(0.25, 0.55), rnd(7, 10), 0, 1, M_FLASH);
          phys(i, 2.2, 0); aspect(i, 0.32); blur(i, K.SPARK_STRETCH * 0.9);
        } else {
          const i = add(SP.G.warm, BACK, f.x - dir * rnd(0, 30), y, -dir * rnd(10, 60), rnd(-30, 30), rnd(0.4, 0.7), rnd(10, 18), 0, 0.8, M_FLASH);
          phys(i, 1.5, 0);
        }
      }
    }
  }

  // ================================= MODULE =================================
  ASCENT.Particles = {
    K,
    _subscribed: false,

    init(g) {
      if (!ready) {
        try { buildSprites(); }
        catch (e) { ready = false; if (window.console) console.warn('[Particles] sprite build failed', e); }
      }
      if (!this._subscribed && ASCENT.FX) {
        this._subscribed = true;
        ASCENT.FX.on((type, d) => onEvent(g, type, d || {}));
      }
    },

    // main.js calls this after 'contextrestored'. Safe before init / before a
    // level and when repeated: fresh sprite canvases each time, the FX listener
    // and live particles are left alone.
    rebuild(g) {
      rebuildSprites();
      if (g && g.player) refreshScale(g);
    },

    update(g, dt) {
      if (!ready || !(dt > 0)) return;
      step(dt);
      const p = g.player;
      if (!p || !g.camera || !fin(p.x) || !fin(p.y) || !fin(p.vx) || !fin(p.vy)) return;
      refreshScale(g);
      soft = true;                     // ambient emitters yield when the pool is busy
      if (!g.dying) {                  // the giraffe is hidden during the death beat
        emitTrail(g, dt, p);
        emitBoost(g, dt, p);
        emitDrip(g, dt, p);
        emitMunch(g, dt);
      }
      emitAcacia(g, dt);
      emitWells(g, dt);
      emitFlares(g, dt);
      soft = false;
      party(g);
    },

    drawBack(ctx, g) { drawLayer(ctx, g, 0, K.DRAW_CAP_BACK); },
    drawFront(ctx, g) { drawLayer(ctx, g, F_FRONT, K.DRAW_CAP_FRONT); },

    // ---- optional helpers for other modules ----
    sparkle(x, y, n, colour) {
      if (!ready || !fin(x) || !fin(y)) return;
      const s = Object.prototype.hasOwnProperty.call(SP.S, colour) ? SP.S[colour] : SP.S.white;
      sparkBurst(x, y, Math.max(1, Math.min(40, n | 0 || 8)), s, SP.S.white, 60, 200, 8, 13, 0.4, 0.7, FRONT, 0, 0);
    },
    puff(x, y, n, kind) {
      if (!ready || !fin(x) || !fin(y)) return;
      const spr = kind === 'steam' ? SP.STEAM : kind === 'poof' ? SP.POOF : SP.DUST;
      const m = Math.max(1, Math.min(30, n | 0 || 6));
      for (let k = 0; k < m; k++) {
        const a = Math.random() * TAU, sp = rnd(30, 120);
        const i = add(spr, FRONT, x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - 20, rnd(0.6, 0.9), rnd(10, 16), rnd(26, 40),
          kind === 'poof' ? 1 : 0.5, kind === 'poof' ? M_POOF : M_SOFT);
        phys(i, 3, 0);
      }
    },
    clear() { count = 0; ovr = 0; },
    count() { return count; },
  };
})();
