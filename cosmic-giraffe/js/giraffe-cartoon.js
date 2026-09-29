/*
 * GIRAFFE STYLE: CARTOON (design C, the default) — "Bold cartoon ink"
 * =======================================
 * The star of the show: a Saturday-morning-cartoon giraffe adrift in space,
 * hanging from its own giant rubbery tongue. Confident dark-brown outlines,
 * bright flat fills with a single cel-shade tone, goofy expressive eyes and
 * plenty of squash & stretch.
 *
 * API (ASCENT.Giraffe):
 *   init(g)                 build the seeded coat pattern + glow sprites, hook FX events
 *   update(g, dt)           springs / secondary motion / expressions (while playing)
 *   draw(ctx, g)            tongue + giraffe + aim reticle (camera transform applied)
 *   drawPortrait(ctx, x, y, scale, t, opts)
 *                           menu portrait in screen space; (x, y) = the giraffe's
 *                           centre of mass (same point as g.player in game), scale 1
 *                           = in-game size. opts = {pose:'float'|'lick'|'munch',
 *                           facing:±1, tongueTo:{x,y}|null, bodyAngle?}
 *   mouthPos(g)             world position of the mouth {x, y}
 *   rebuild(g)              GPU context restored: re-render the glow sprites
 *                           into NEW canvases (pose / FX hook untouched)
 *
 * The rig lives in BODY-LOCAL units (≈ px at GIRAFFE_SCALE 1): origin = the
 * centre of mass (the physics point), facing right, +y down. Hooves rest at
 * y = +16 (= player radius), ossicone tufts top out near y = −59, so the
 * standing giraffe is ~75 units tall. World transform:
 *   translate(COM) · rotate(theta) · scale(facing·S, S) · squash-about-pivot
 * The head has its own frame (origin = neck top, rotated by psi, u = muzzle
 * forward, v = chin-down) so the jaw, eyes and ears are authored once.
 *
 * Hanging from the tongue: the head tilts until the mouth, the muzzle and the
 * centre of mass line up (psi = angle of the mouth itself — a tiny fixed-point
 * solve), then the whole body springs to theta = angle(anchor − COM) −
 * angle(mouth). So the tongue leaves the lips on exactly the ray the physics
 * uses, and the tongue drawn from the true mouth meets the anchor. Reeled in
 * tight, the neck scrunches so the mouth never overshoots the anchor.
 *
 * Draw order (so outlines merge into one clean silhouette): the long tongue is
 * drawn BEHIND the head (it slides out from between the lips), then tail /
 * far legs / far ear, then an "ink pass" (thick strokes of neck + torso +
 * head), the mane, the near legs, then the "fill pass" which covers the inner
 * half of every ink stroke, then spots / cel shade, the open mouth (dark
 * interior + the tongue lying in it + lips) and the face.
 * All secondary motion is dt-based damped springs held in this closure.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ------------------------------------------------------------ tuning knobs
  const K = {
    INK: 1.9,                  // outline width, body units (≈ px at scale 1, zoom 1)
    PORTRAIT_INK_EXP: 0.42,    // big menu portraits thin the ink: INK / scale^exp
    TONGUE_W0: 7,              // tongue width at the lips (px at scale 1)
    TONGUE_W1: 4,              // ... at the tip
    TONGUE_STRETCH: 0.38,      // a long taut tongue thins by up to this fraction
    SPLAT_R: 5.2,              // sticky blob radius at the anchor
    SAG: 0.375,                // loose tongue: parabola sag h = sqrt(SAG · span · slack)
    WOBBLE_TIME: 0.35,         // attach wobble duration (s)
    WOBBLE_AMP: 9,             // attach wobble amplitude (px at scale 1)
    JAW_TONGUE: 0.9,           // jaw opening while the tongue is out (0..1 → 0..0.5 rad)
    // body-rotation springs (stiffness k, damping ratio z)
    HANG_K: 170, HANG_Z: 0.62,
    SNAP_K: 330, SNAP_Z: 0.8,
    FLY_K: 70, FLY_Z: 0.55,
    GROUND_K: 150, GROUND_Z: 0.78,
    // secondary motion springs
    LEG_K: 70, LEG_Z: 0.3, KNEE_K: 90, KNEE_Z: 0.45,
    TAIL_K: 40, TAIL_Z: 0.28,
    EAR_K: 60, EAR_Z: 0.22,
    NECK_K: 55, NECK_Z: 0.35,
    HEAD_K: 280, HEAD_Z: 0.72,
    SQUASH_K: 180, SQUASH_Z: 0.28,
    // flight pose
    DIVE_MAX: 1.6,             // head-first dive rotation at high fall speed (rad)
    NOSE_UP: 0.3,              // nose-up tilt while rising (rad)
    LEAN: 0.28,                // lean into horizontal motion (rad at 900 px/s)
    FLIP_RATE: 9,              // facing flip speed (1/s through the squash)
    BLINK_MIN: 2.5, BLINK_MAX: 5,
    GLOW_ALPHA: 0.2,           // warm back-glow that lifts the silhouette off dark space
    AIM_DOT_SPACING: 15,       // reticle dot spacing (world px)
    AIM_DOT_R: 1.8,
    MUNCH_PERIOD: 1.9,         // victory lick → chew cycle (s)
    PORTRAIT_LICK_PERIOD: 3.4, // matches ui.js LICK_PERIOD so the slurp wobble syncs
  };

  // ------------------------------------------------------------ colours
  const PAL = ASCENT.PAL;
  const C_INK = '#2b1409';            // dark brown "ink", never pure black
  const C_HIDE = PAL.hide;
  const C_LIGHT = PAL.hideLight;
  const C_HIDE_FAR = '#cf9038';       // far-side limbs sit in shade
  const C_LIGHT_FAR = '#e2b467';
  const C_TAIL = '#dc9c40';
  const C_SPOT = PAL.spots;
  const C_SHADE = 'rgba(120,44,10,0.30)';   // the single cel-shade tone (multiplies over spots)
  const C_HI = 'rgba(255,246,214,0.85)';
  const C_TUFT = '#4a200b';
  const C_EAR_IN = '#ec9a74';
  const C_EYE = '#fffdf4';
  const C_PUPIL = '#1d0e06';
  const C_MOUTH = '#3b0f24';
  const C_BLUSH = '#ff6e7d';
  const C_AIM = 'rgba(255,236,190,';        // + alpha + ')'

  const TAU = Math.PI * 2;

  // ------------------------------------------------------------ rig geometry (body-local units)
  const NB_X = 10, NB_Y = -10;        // neck base (inside the withers)
  const NECK_L = 32, NECK_W0 = 10.5, NECK_W1 = 6.4, NS = 8;
  const PHI0 = 0.28;                  // neck lean from vertical (forward +)
  const PSI0 = 0.35;                  // head angle (muzzle slightly down)
  // hips/shoulders: far back, far front, near back, near front (far pair a touch higher)
  const HIPS = [-12.8, -3.6, 6.2, -3.6, -9.8, -3, 9.2, -3];
  const UPPER = 8.5, LOWER = 7.5, HOOF = 3;
  const KNEE_SIGN = [1, -1, 1, -1];   // hocks fold forward, knees fold back
  const REST_A = [-0.06, 0.06, -0.06, 0.06];
  const FLY_A = [-0.16, 0.2, -0.12, 0.16];
  const LEG_WU = [5.0, 4.4, 5.0, 4.4], LEG_WL = 3.3;
  const TAIL_X = -17.3, TAIL_Y = -6.6, TAIL_REST = -0.55;
  const HINGE_U = 3.5, HINGE_V = 3.5; // jaw hinge (head frame)
  const OSS_DX = -2.0, OSS_DY = -7.2, OSS_W = 2.8, TUFT_R = 2.1;

  // ------------------------------------------------------------ helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  function wrapA(a) {
    if (!isFinite(a)) return 0;
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }
  function mulberry(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Damped spring, semi-implicit Euler in 2 substeps (stable for k ≤ ~1500 at dt 0.05).
  // Returns the new value; the new velocity is left in _v.
  let _v = 0;
  function spr(x, v, target, k, z, dt) {
    const c = 2 * Math.sqrt(k) * z, h = dt * 0.5;
    for (let i = 0; i < 2; i++) { v += (k * (target - x) - c * v) * h; x += v * h; }
    if (!isFinite(x) || !isFinite(v)) { x = target; v = 0; }
    _v = v;
    return x;
  }
  const fxc = (fx) => (fx < 0 ? Math.min(fx, -0.06) : Math.max(fx, 0.06));
  const gScale = () => fin(ASCENT.CONFIG && ASCENT.CONFIG.GIRAFFE_SCALE, 1) || 1;

  // ------------------------------------------------------------ the rig
  function makeRig() {
    return {
      // pose parameters
      theta: 0, fx: 1, sx: 1, sy: 1, pivot: 0,
      phi: PHI0, bend: 0, psi: PSI0, jaw: 0, neckL: NECK_L,
      legA: new Float64Array([-0.06, 0.06, -0.06, 0.06]), legK: new Float64Array(4),
      tail1: TAIL_REST, tail2: TAIL_REST - 0.1, earN: 0.2, earF: 0.25,
      lid: 0.12, wide: 0, happy: 0, blush: 0, grin: 0.35, brow: 0,
      lookU: 0.9, lookV: 0.2, leaf: 0, tongueIn: 0,
      // derived (solve)
      n1x: 0, n1y: 0, ncx: 0, ncy: 0,
      nF: new Float64Array(NS * 2), nB: new Float64Array(NS * 2),
      hc: 1, hs: 0, jc: 1, js: 0, lfu: 15.2, lfv: 3.5, mhu: 15.9, mhv: 3.25,
      mx: 0, my: 0, rx: 0, ry: 0,
      joints: new Float64Array(24), lowAng: new Float64Array(4),
      tmx: 0, tmy: 0, ttx: 0, tty: 0,
    };
  }

  // Head frame (u, v) → body local, written into _hx/_hy.
  let _hx = 0, _hy = 0;
  function h2l(R, u, v) { _hx = R.n1x + u * R.hc - v * R.hs; _hy = R.n1y + u * R.hs + v * R.hc; }

  // Neck centreline (quadratic N0 → C → N1) at t, into _qx/_qy (+ unit tangent _tx/_ty).
  let _qx = 0, _qy = 0, _tx = 0, _ty = -1;
  function neckAt(R, t) {
    const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    _qx = a * NB_X + b * R.ncx + c * R.n1x;
    _qy = a * NB_Y + b * R.ncy + c * R.n1y;
    const tx = 2 * (1 - t) * (R.ncx - NB_X) + 2 * t * (R.n1x - R.ncx);
    const ty = 2 * (1 - t) * (R.ncy - NB_Y) + 2 * t * (R.n1y - R.ncy);
    const l = Math.sqrt(tx * tx + ty * ty);
    if (l > 1e-6) { _tx = tx / l; _ty = ty / l; } else { _tx = 0; _ty = -1; }
  }
  const neckW = (t) => lerp(NECK_W0, NECK_W1, t);

  // Mouth (head frame) for the current jaw — the midpoint between the lips.
  function mouthHead(R) {
    const ja = R.jaw * 0.5;
    R.jc = Math.cos(ja); R.js = Math.sin(ja);
    R.lfu = HINGE_U + 11.7 * R.jc;
    R.lfv = HINGE_V + 11.7 * R.js;
    R.mhu = (15.4 + R.lfu) * 0.5 + 0.6;
    R.mhv = (3.0 + R.lfv) * 0.5;
  }

  // Derive every joint / outline point from the pose parameters.
  function solve(R) {
    const sp = Math.sin(R.phi), cp = Math.cos(R.phi);
    R.n1x = NB_X + sp * R.neckL; R.n1y = NB_Y - cp * R.neckL;
    R.ncx = (NB_X + R.n1x) * 0.5 + cp * R.bend;
    R.ncy = (NB_Y + R.n1y) * 0.5 + sp * R.bend;
    for (let i = 0; i < NS; i++) {
      const t = i / (NS - 1);
      neckAt(R, t);
      const w = neckW(t) * 0.5, nx = -_ty, ny = _tx;   // nx,ny = forward normal
      R.nF[i * 2] = _qx + nx * w; R.nF[i * 2 + 1] = _qy + ny * w;
      R.nB[i * 2] = _qx - nx * w; R.nB[i * 2 + 1] = _qy - ny * w;
    }
    R.hc = Math.cos(R.psi); R.hs = Math.sin(R.psi);
    mouthHead(R);
    h2l(R, R.mhu, R.mhv); R.mx = _hx; R.my = _hy;
    h2l(R, R.mhu - 4.5, R.mhv); R.rx = _hx; R.ry = _hy;
    for (let i = 0; i < 4; i++) {
      const hx = HIPS[i * 2], hy = HIPS[i * 2 + 1], a = R.legA[i];
      const kx = hx + Math.sin(a) * UPPER, ky = hy + Math.cos(a) * UPPER;
      const b = a + KNEE_SIGN[i] * R.legK[i];
      const o = i * 6;
      R.joints[o] = hx; R.joints[o + 1] = hy; R.joints[o + 2] = kx; R.joints[o + 3] = ky;
      R.joints[o + 4] = kx + Math.sin(b) * LOWER; R.joints[o + 5] = ky + Math.cos(b) * LOWER;
      R.lowAng[i] = b;
    }
    R.tmx = TAIL_X + Math.sin(R.tail1) * 6.5; R.tmy = TAIL_Y + Math.cos(R.tail1) * 6.5;
    R.ttx = R.tmx + Math.sin(R.tail2) * 6.2; R.tty = R.tmy + Math.cos(R.tail2) * 6.2;
  }

  // Head angle at which the muzzle points straight along the COM → mouth ray
  // (fixed point of psi = angle(mouth(psi)); contraction ≈ 0.3, 4 steps is plenty).
  function psiAligned(R, start) {
    let s = start;
    for (let i = 0; i < 4; i++) {
      const c = Math.cos(s), sn = Math.sin(s);
      const mx = R.n1x + R.mhu * c - R.mhv * sn, my = R.n1y + R.mhu * sn + R.mhv * c;
      s = Math.atan2(my, mx);
    }
    return s;
  }

  // Body local → world (or screen for portraits), into _wx/_wy.
  let _wx = 0, _wy = 0;
  function l2w(R, px, py, S, lx, ly) {
    const X = fxc(R.fx) * S * lx * R.sx, Y = S * (R.pivot + (ly - R.pivot) * R.sy);
    const c = Math.cos(R.theta), s = Math.sin(R.theta);
    _wx = px + X * c - Y * s; _wy = py + X * s + Y * c;
  }
  // World direction → body-local direction (unnormalised), into _lx/_ly.
  let _lx = 0, _ly = 0;
  function w2lDir(R, dx, dy) {
    const c = Math.cos(R.theta), s = Math.sin(R.theta), fs = R.fx < 0 ? -1 : 1;
    _lx = fs * (dx * c + dy * s); _ly = -dx * s + dy * c;
  }
  function applyLocal(ctx, R, px, py, S) {
    ctx.translate(px, py);
    ctx.rotate(R.theta);
    ctx.scale(fxc(R.fx) * S, S);
    if (R.pivot !== 0) { ctx.translate(0, R.pivot); ctx.scale(R.sx, R.sy); ctx.translate(0, -R.pivot); }
    else ctx.scale(R.sx, R.sy);
  }
  const headFrame = (ctx, R) => { ctx.translate(R.n1x, R.n1y); ctx.rotate(R.psi); };

  // ------------------------------------------------------------ seeded coat pattern
  // Reticulated-giraffe patches: a jittered hex grid of rounded polygons, the
  // gaps between them read as the thin light "cracks" of the coat.
  let torsoSpots = null, torsoSpotN = 0;
  let neckSpots = null, neckSpotN = 0;          // per spot: t, s, size, then 6×(angle, radius)
  function buildSpots() {
    const rnd = mulberry(0x51a7c0de);
    const tmp = [];
    const sp = 6.4;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        const cx = -19.5 + col * sp + (row % 2) * sp * 0.5 + (rnd() - 0.5) * 1.6;
        const cy = -16.2 + row * sp * 0.87 + (rnd() - 0.5) * 1.3;
        const ex = (cx + 1.2) / 17.5, ey = (cy + 5.4) / 10.5;
        if (ex * ex + ey * ey > 1) continue;
        if (cy > 0.5) continue;                 // keep the belly pale
        const size = sp * 0.53 * (0.92 + rnd() * 0.16), rot = rnd() * 1.05;
        for (let k = 0; k < 6; k++) {
          const ang = rot + k * Math.PI / 3 + (rnd() - 0.5) * 0.35;
          const rr = size * (0.78 + rnd() * 0.3);
          tmp.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9);
        }
      }
    }
    torsoSpots = new Float64Array(tmp);
    torsoSpotN = tmp.length / 12;

    const nt = [];
    for (let r = 0; r < 7; r++) {
      const t = 0.1 + r * 0.14;
      const ss = r % 2 === 0 ? [-0.5, 0.5] : [-1.0, 0.0, 1.0];
      for (const s of ss) {
        nt.push(t + (rnd() - 0.5) * 0.03, s + (rnd() - 0.5) * 0.12, 0.25 * (0.9 + rnd() * 0.2));
        const rot = rnd();
        for (let k = 0; k < 6; k++) nt.push(rot + k * Math.PI / 3 + (rnd() - 0.5) * 0.35, 0.8 + rnd() * 0.3);
      }
    }
    neckSpots = new Float64Array(nt);
    neckSpotN = nt.length / 15;
  }

  // Rounded closed polygon through 6 points (quadratic corners at the vertices).
  function roundPoly(ctx, P, o) {
    ctx.moveTo((P[o + 10] + P[o]) * 0.5, (P[o + 11] + P[o + 1]) * 0.5);
    for (let k = 0; k < 6; k++) {
      const a = o + k * 2, b = o + ((k + 1) % 6) * 2;
      ctx.quadraticCurveTo(P[a], P[a + 1], (P[a] + P[b]) * 0.5, (P[a + 1] + P[b + 1]) * 0.5);
    }
    ctx.closePath();
  }
  const _poly = new Float64Array(12);

  // ------------------------------------------------------------ glow sprites (built at init)
  let glowWarm = null, glowCyan = null;
  function makeGlow(inner, mid) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    if (!x) return null;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.45, mid);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  }
  // fresh = always make new canvases (after a GPU context loss the old ones may
  // be blank or still lost); otherwise only fill in what is missing.
  function buildGlows(fresh) {
    if (glowWarm && !fresh) return;
    try {
      glowWarm = makeGlow('rgba(255,196,120,0.55)', 'rgba(255,140,70,0.18)');
      glowCyan = makeGlow('rgba(120,240,255,0.5)', 'rgba(70,200,255,0.16)');
    } catch (_e) { glowWarm = null; glowCyan = null; }
  }

  // ------------------------------------------------------------ body paths (body-local)
  // Torso: high withers sloping to a round rump, soft belly, deep chest.
  function torsoPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(13, -12);
    ctx.bezierCurveTo(5, -16.5, -8, -14, -14.5, -10);
    ctx.bezierCurveTo(-19, -7, -19.5, 0, -14.5, 2);
    ctx.bezierCurveTo(-7, 4.5, 5, 4.5, 11, 1.5);
    ctx.bezierCurveTo(16.5, -1, 17.5, -8.5, 13, -12);
    ctx.closePath();
  }
  // Tapered neck polygon (front edge up, back edge down).
  function neckPath(ctx, R) {
    const F = R.nF, B = R.nB;
    ctx.beginPath();
    ctx.moveTo(F[0], F[1]);
    for (let i = 1; i < NS; i++) ctx.lineTo(F[i * 2], F[i * 2 + 1]);
    for (let i = NS - 1; i >= 0; i--) ctx.lineTo(B[i * 2], B[i * 2 + 1]);
    ctx.closePath();
  }
  // Jaw points (u > hinge) rotate about the hinge by the jaw angle -> _jx/_jy.
  let _jx = 0, _jy = 0;
  function jw(R, u, v) {
    const du = u - HINGE_U, dv = v - HINGE_V;
    _jx = HINGE_U + du * R.jc - dv * R.js; _jy = HINGE_V + du * R.js + dv * R.jc;
  }
  // Head (head frame): big round skull, long muzzle, hinged lower jaw. The
  // path doubles back through the mouth corner, so an open jaw leaves a notch
  // in the silhouette; drawMouth() paints the open mouth + tongue into it.
  function headPath(ctx, R) {
    ctx.beginPath();
    ctx.moveTo(-6.2, -1.5);
    ctx.bezierCurveTo(-6.6, -7.8, -0.5, -9.8, 5, -7.2);
    ctx.bezierCurveTo(9, -5.4, 13, -4.4, 16, -2.1);
    ctx.bezierCurveTo(18.3, -0.4, 18.1, 2.4, 15.4, 3.0);
    ctx.lineTo(9.5, 3.4);
    ctx.lineTo(R.lfu, R.lfv);
    jw(R, 16.4, 5.0); const ax = _jx, ay = _jy;
    jw(R, 15.0, 6.8); const bx = _jx, by = _jy;
    jw(R, 11.0, 6.7); const cx = _jx, cy = _jy;
    ctx.bezierCurveTo(ax, ay, bx, by, cx, cy);
    jw(R, 7.0, 6.6);
    ctx.bezierCurveTo(_jx, _jy, 2.5, 6.5, -2, 5.0);
    ctx.bezierCurveTo(-5.6, 3.8, -6.4, 1.2, -6.2, -1.5);
    ctx.closePath();
  }
  function mouthNotchPath(ctx, R) {
    ctx.beginPath();
    ctx.moveTo(15.4, 3.0);
    ctx.lineTo(9.5, 3.4);
    ctx.lineTo(R.lfu, R.lfv);
    ctx.closePath();
  }
  // Scalloped mane along the back edge of the neck.
  function manePath(ctx, R) {
    const N = 12, t0 = 0.14, t1 = 1.0;
    ctx.beginPath();
    let px = 0, py = 0, ox = 0, oy = 0;
    for (let j = 0; j <= N; j++) {
      const t = t0 + (t1 - t0) * j / N;
      neckAt(R, t);
      const w = neckW(t) * 0.5;
      // outward normal = backward = -(forward normal)
      const nx = _ty, ny = -_tx;
      const ex = _qx + nx * w, ey = _qy + ny * w;
      if (j === 0) { ctx.moveTo(ex - nx * 0.9, ey - ny * 0.9); ctx.lineTo(ex + nx * 0.6, ey + ny * 0.6); }
      else ctx.quadraticCurveTo((px + ex) * 0.5 + (ox + nx) * 1.6, (py + ey) * 0.5 + (oy + ny) * 1.6, ex + nx * 0.6, ey + ny * 0.6);
      px = ex; py = ey; ox = nx; oy = ny;
    }
    for (let j = N; j >= 0; j -= 3) {
      const t = t0 + (t1 - t0) * j / N;
      neckAt(R, t);
      const w = neckW(t) * 0.5;
      ctx.lineTo(_qx + _ty * (w - 1.2), _qy - _tx * (w - 1.2));
    }
    ctx.closePath();
  }

  // ------------------------------------------------------------ limbs
  function drawLeg(ctx, R, i, inkW, far) {
    const J = R.joints, o = i * 6, b = R.lowAng[i];
    const hx = J[o], hy = J[o + 1], kx = J[o + 2], ky = J[o + 3], ax = J[o + 4], ay = J[o + 5];
    const wu = LEG_WU[i];
    ctx.strokeStyle = C_INK;
    ctx.lineWidth = wu + inkW * 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = LEG_WL + inkW * 2;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = far ? C_HIDE_FAR : C_HIDE;
    ctx.lineWidth = wu;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = far ? C_LIGHT_FAR : C_LIGHT;
    ctx.lineWidth = LEG_WL;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ax, ay); ctx.stroke();
    // hoof: a little trapezoid along the lower leg
    const dx = Math.sin(b), dy = Math.cos(b), nx = dy, ny = -dx;
    ctx.beginPath();
    ctx.moveTo(ax + nx * 2.0, ay + ny * 2.0);
    ctx.lineTo(ax + dx * HOOF + nx * 2.35, ay + dy * HOOF + ny * 2.35);
    ctx.lineTo(ax + dx * HOOF - nx * 2.35, ay + dy * HOOF - ny * 2.35);
    ctx.lineTo(ax - nx * 2.0, ay - ny * 2.0);
    ctx.closePath();
    ctx.lineWidth = inkW * 1.6;
    ctx.strokeStyle = C_INK; ctx.stroke();
    ctx.fillStyle = PAL.hoof; ctx.fill();
  }

  function drawTail(ctx, R, inkW) {
    ctx.beginPath();
    ctx.moveTo(TAIL_X + 1.5, TAIL_Y + 0.5);
    ctx.quadraticCurveTo(R.tmx, R.tmy, R.ttx, R.tty);
    ctx.strokeStyle = C_INK; ctx.lineWidth = 1.8 + inkW * 2; ctx.stroke();
    ctx.strokeStyle = C_TAIL; ctx.lineWidth = 1.8; ctx.stroke();
    // tuft: a teardrop hanging along the tip direction
    const dx = Math.sin(R.tail2), dy = Math.cos(R.tail2);
    ctx.beginPath();
    ctx.ellipse(R.ttx + dx * 2.2, R.tty + dy * 2.2, 1.9, 3.2, -R.tail2, 0, TAU);
    ctx.lineWidth = inkW * 1.6; ctx.strokeStyle = C_INK; ctx.stroke();
    ctx.fillStyle = C_TUFT; ctx.fill();
  }

  // Leaf-shaped ear in the head frame; angle measured from +u (pi = straight back).
  function earPath(ctx, bu, bv, ang, len, wid) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const tx = bu + dx * len, ty = bv + dy * len, mx = bu + dx * len * 0.5, my = bv + dy * len * 0.5;
    ctx.beginPath();
    ctx.moveTo(bu + nx * 0.8, bv + ny * 0.8);
    ctx.quadraticCurveTo(mx + nx * wid, my + ny * wid, tx, ty);
    ctx.quadraticCurveTo(mx - nx * wid, my - ny * wid, bu - nx * 0.8, bv - ny * 0.8);
    ctx.closePath();
  }
  function drawEar(ctx, R, inkW, far) {
    const bu = far ? -1.8 : -3.2, bv = far ? -6.6 : -5.3;
    const ang = Math.PI + (far ? 0.85 : 0.55) - (far ? R.earF : R.earN);
    const len = far ? 7.6 : 8.6;
    earPath(ctx, bu, bv, ang, len, 3.9);
    ctx.strokeStyle = C_INK; ctx.lineWidth = inkW * 2; ctx.stroke();
    ctx.fillStyle = far ? C_HIDE_FAR : C_HIDE; ctx.fill();
    const dx = Math.cos(ang), dy = Math.sin(ang);
    earPath(ctx, bu + dx * 1.7, bv + dy * 1.7, ang, len * 0.62, 1.9);
    ctx.fillStyle = C_EAR_IN; ctx.fill();
  }
  function ossPath(ctx, bu, bv) {
    ctx.beginPath(); ctx.moveTo(bu, bv); ctx.lineTo(bu + OSS_DX, bv + OSS_DY);
  }
  function drawTuft(ctx, bu, bv, inkW) {
    ctx.beginPath();
    ctx.arc(bu + OSS_DX, bv + OSS_DY - 0.6, TUFT_R, 0, TAU);
    ctx.strokeStyle = C_INK; ctx.lineWidth = inkW * 1.6; ctx.stroke();
    ctx.fillStyle = C_TUFT; ctx.fill();
  }

  // ------------------------------------------------------------ face (head frame)
  function drawFace(ctx, R, inkW) {
    const f = inkW / K.INK;                   // detail-stroke scale (thinner on big portraits)
    // nostril
    ctx.fillStyle = C_INK;
    ctx.beginPath(); ctx.ellipse(14.3, -1.1, 0.95, 0.62, 0.5, 0, TAU); ctx.fill();
    // blush
    if (R.blush > 0.03) {
      ctx.globalAlpha = clamp(R.blush, 0, 1) * 0.55;
      ctx.fillStyle = C_BLUSH;
      ctx.beginPath(); ctx.ellipse(8.2, 1.3, 2.4, 1.35, -0.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // mouth line: a smile that curls up at the corner (just the curl once the jaw opens)
    ctx.strokeStyle = C_INK; ctx.lineWidth = 1.0 * f;
    ctx.beginPath();
    if (R.jaw < 0.12) {
      ctx.moveTo(15.3, 3.05);
      ctx.quadraticCurveTo(12.3, 4.1 + R.grin * 0.4, 9.0, 3.0 - R.grin * 1.1);
    } else {
      ctx.moveTo(9.6, 3.4);
      ctx.quadraticCurveTo(8.7, 3.3, 8.5, 2.4 - R.grin * 0.6);
    }
    ctx.stroke();

    // eye
    const ex = 3.3, ey = -2.7;
    if (R.happy > 0.5 && R.wide < 0.5) {
      // happy squint: a fat closed arch with one flicked lash
      ctx.lineWidth = 1.7 * f;
      ctx.beginPath();
      ctx.moveTo(ex - 2.9, ey + 0.8);
      ctx.quadraticCurveTo(ex, ey - 3.6, ex + 2.9, ey + 0.8);
      ctx.moveTo(ex - 2.9, ey + 0.8); ctx.lineTo(ex - 4.0, ey - 0.2);
      ctx.stroke();
    } else {
      const sc = 1 + R.wide * 0.18, rx = 3.3 * sc, ry = 3.9 * sc;
      ctx.fillStyle = C_EYE;
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, -0.12, 0, TAU); ctx.fill();
      const pr = 1.75 - R.wide * 0.85;
      const px = ex + clamp(R.lookU, -1, 1) * (rx - pr - 0.5) * 0.8;
      const py = ey + clamp(R.lookV, -1, 1) * (ry - pr - 0.5) * 0.8;
      ctx.fillStyle = C_PUPIL;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px + pr * 0.45, py - pr * 0.5, pr * 0.42 + 0.25, 0, TAU); ctx.fill();
      // upper lid (blink / relaxed droop)
      const lid = clamp(R.lid, 0, 1);
      const yl = ey - ry + 2 * ry * lid;
      const q = (yl - ey) / ry, half = rx * Math.sqrt(Math.max(0, 1 - q * q));
      if (lid > 0.02) {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, -0.12, 0, TAU); ctx.clip();
        ctx.fillStyle = C_HIDE;
        ctx.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, yl - (ey - ry) + 1);
        ctx.restore();
      }
      ctx.strokeStyle = C_INK;
      ctx.lineWidth = 1.1 * f;
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, -0.12, 0, TAU); ctx.stroke();
      // lid edge + lashes (at the back corner of the lid)
      ctx.lineWidth = 1.2 * f;
      ctx.beginPath();
      ctx.moveTo(ex - half, yl); ctx.lineTo(ex + half, yl);
      const lx0 = ex - half * 0.85, lx1 = ex - half * 0.35;
      ctx.moveTo(lx0, yl); ctx.lineTo(lx0 - 1.5, yl - 1.3);
      ctx.moveTo(lx1, yl - 0.2); ctx.lineTo(lx1 - 1.0, yl - 1.9);
      ctx.stroke();
    }
    // brow: raised when alarmed, relaxed arch otherwise
    const lift = R.wide * 1.7 + R.happy * 0.3 + R.brow;
    ctx.lineWidth = 1.2 * f;
    ctx.beginPath();
    ctx.moveTo(ex - 2.6, ey - 5.0 - lift * 0.7);
    ctx.quadraticCurveTo(ex + 0.2, ey - 6.6 - lift * 1.1, ex + 2.9, ey - 5.0 - lift);
    ctx.stroke();

    // a stolen Acacia leaf poking out of the mouth while chewing
    if (R.leaf > 0.02) {
      const L = 5.5 * clamp(R.leaf, 0, 1), a = 0.75, dx = Math.cos(a), dy = Math.sin(a);
      const bu = 13.2, bv = 4.2;
      ctx.beginPath();
      ctx.moveTo(bu, bv);
      ctx.quadraticCurveTo(bu + dx * L * 0.5 - dy * 1.8, bv + dy * L * 0.5 + dx * 1.8, bu + dx * L, bv + dy * L);
      ctx.quadraticCurveTo(bu + dx * L * 0.5 + dy * 1.8, bv + dy * L * 0.5 - dx * 1.8, bu, bv);
      ctx.strokeStyle = C_INK; ctx.lineWidth = inkW * 1.4; ctx.stroke();
      ctx.fillStyle = PAL.leaf; ctx.fill();
    }
  }

  // ------------------------------------------------------------ the whole giraffe (body-local)
  function drawBody(ctx, R, inkW) {
    const I2 = inkW * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. things behind the body, each fully inked
    drawTail(ctx, R, inkW);
    drawLeg(ctx, R, 0, inkW, true);
    drawLeg(ctx, R, 1, inkW, true);
    ctx.save();
    headFrame(ctx, R);
    drawEar(ctx, R, inkW, true);
    ossPath(ctx, -1.8, -7.4);
    ctx.strokeStyle = C_INK; ctx.lineWidth = OSS_W + I2; ctx.stroke();
    ctx.strokeStyle = C_HIDE_FAR; ctx.lineWidth = OSS_W; ctx.stroke();
    drawTuft(ctx, -1.8, -7.4, inkW);
    ctx.restore();

    // 2. ink pass: neck + torso + head (+ near ossicone) merge into one silhouette
    ctx.strokeStyle = C_INK; ctx.lineWidth = I2;
    neckPath(ctx, R); ctx.stroke();
    torsoPath(ctx); ctx.stroke();
    ctx.save();
    headFrame(ctx, R);
    headPath(ctx, R); ctx.stroke();
    ossPath(ctx, 1.2, -8.2); ctx.lineWidth = OSS_W + I2; ctx.stroke();
    ctx.restore();

    // 3. mane (its inner half vanishes under the neck fill)
    manePath(ctx, R);
    ctx.strokeStyle = C_INK; ctx.lineWidth = I2; ctx.stroke();
    ctx.fillStyle = PAL.mane; ctx.fill();

    // 4. near legs: their tops get covered by the torso fill, so they grow out of it
    drawLeg(ctx, R, 2, inkW, false);
    drawLeg(ctx, R, 3, inkW, false);

    // 5. fill pass
    ctx.fillStyle = C_HIDE;
    neckPath(ctx, R); ctx.fill();
    torsoPath(ctx); ctx.fill();

    // torso: spots, pale belly, cel shade, top highlight
    ctx.save();
    torsoPath(ctx); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < torsoSpotN; i++) roundPoly(ctx, torsoSpots, i * 12);
    ctx.fillStyle = C_SPOT; ctx.fill();
    ctx.fillStyle = C_LIGHT;
    ctx.beginPath(); ctx.ellipse(-1, 3.4, 10.5, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C_SHADE;
    ctx.beginPath(); ctx.ellipse(-4, 8.2, 21, 6.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C_HI; ctx.lineWidth = 1.3 * inkW / K.INK;
    ctx.beginPath(); ctx.moveTo(-12.6, -8.6); ctx.quadraticCurveTo(-2, -14.6, 8.2, -12.0); ctx.stroke();
    ctx.restore();

    // neck: spots + cel shade along the back edge
    ctx.save();
    neckPath(ctx, R); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < neckSpotN; i++) {
      const o = i * 15, t = neckSpots[o], s = neckSpots[o + 1], size = neckSpots[o + 2];
      neckAt(R, t);
      const w = neckW(t), nx = -_ty, ny = _tx;
      const cx = _qx + nx * s * w * 0.5, cy = _qy + ny * s * w * 0.5;
      for (let k = 0; k < 6; k++) {
        const ang = neckSpots[o + 3 + k * 2], rr = neckSpots[o + 4 + k * 2] * size * w;
        const ca = Math.cos(ang) * rr * 0.95, sa = Math.sin(ang) * rr;
        _poly[k * 2] = cx + _tx * ca + nx * sa;
        _poly[k * 2 + 1] = cy + _ty * ca + ny * sa;
      }
      roundPoly(ctx, _poly, 0);
    }
    ctx.fillStyle = C_SPOT; ctx.fill();
    ctx.beginPath();
    for (let i = 2; i < NS; i++) {
      if (i === 2) ctx.moveTo(R.nB[i * 2], R.nB[i * 2 + 1]); else ctx.lineTo(R.nB[i * 2], R.nB[i * 2 + 1]);
    }
    ctx.strokeStyle = C_SHADE; ctx.lineWidth = 4.2; ctx.stroke();
    ctx.restore();

    // head: near ossicone fill, head fill, muzzle, shade, face, near ear in front
    ctx.save();
    headFrame(ctx, R);
    ossPath(ctx, 1.2, -8.2);
    ctx.strokeStyle = C_HIDE; ctx.lineWidth = OSS_W; ctx.stroke();
    headPath(ctx, R);
    ctx.fillStyle = C_HIDE; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = C_LIGHT;
    ctx.beginPath(); ctx.ellipse(14.4, 1.2, 4.9, 4.4, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = C_SHADE;
    ctx.beginPath(); ctx.ellipse(4, 9.4, 13, 4.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C_HI; ctx.lineWidth = 1.1 * inkW / K.INK;
    ctx.beginPath(); ctx.moveTo(-4.8, -4.6); ctx.quadraticCurveTo(-3.2, -8.6, 2.6, -7.0); ctx.stroke();
    ctx.restore();
    drawTuft(ctx, 1.2, -8.2, inkW);
    drawMouth(ctx, R, inkW);
    drawFace(ctx, R, inkW);
    drawEar(ctx, R, inkW, false);
    ctx.restore();
  }

  // Open mouth, painted over the silhouette's notch: dark interior, the tongue
  // lying in it (when out), then crisp lips. The long tongue itself is drawn
  // behind the head, so it seems to slide out from between the lips.
  function drawMouth(ctx, R, inkW) {
    if (R.jaw <= 0.06) return;
    const f = inkW / K.INK;
    ctx.save();
    mouthNotchPath(ctx, R);
    ctx.fillStyle = C_MOUTH; ctx.fill();
    if (R.tongueIn > 0.5) {
      ctx.clip();
      const y0 = (3.4 + R.lfv) * 0.5 + 0.5;
      ctx.beginPath(); ctx.moveTo(9.6, y0); ctx.lineTo(R.mhu + 3, R.mhv + 0.4);
      ctx.strokeStyle = PAL.tongue; ctx.lineWidth = K.TONGUE_W0 * 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(11.5, y0 - 1.1); ctx.lineTo(R.mhu + 3, R.mhv - 0.9);
      ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = 1.1 * f; ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(15.8, 2.95); ctx.lineTo(9.5, 3.4); ctx.lineTo(R.lfu + 0.2, R.lfv + 0.1);
    ctx.strokeStyle = C_INK; ctx.lineWidth = 1.3 * f; ctx.stroke();
  }

  // ------------------------------------------------------------ the tongue (world / screen space)
  const TMAX = 48;
  const TP = new Float64Array(TMAX * 2), TN = new Float64Array(TMAX * 2), TW = new Float64Array(TMAX);

  function quadSamples(n, x0, y0, cx, cy, x1, y1) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      TP[i * 2] = a * x0 + b * cx + c * x1;
      TP[i * 2 + 1] = a * y0 + b * cy + c * y1;
    }
  }
  // Displace samples sideways (perpendicular to the chord): a travelling wave
  // that is pinned at both ends.
  function wobble(n, amp, phase, waves) {
    const dx = TP[(n - 1) * 2] - TP[0], dy = TP[(n - 1) * 2 + 1] - TP[1];
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return;
    const px = -dy / l, py = dx / l;
    for (let i = 1; i < n - 1; i++) {
      const s = i / (n - 1), d = amp * Math.sin(Math.PI * s) * Math.sin(s * waves * Math.PI - phase);
      TP[i * 2] += px * d; TP[i * 2 + 1] += py * d;
    }
  }
  // Outline of a tapered, round-capped ribbon along TP[0..n).
  function ribbonPath(ctx, n, w0, w1) {
    let lx = 1, ly = 0;
    for (let i = 1; i < n; i++) {           // first valid direction as the fallback
      const dx = TP[i * 2] - TP[0], dy = TP[i * 2 + 1] - TP[1], l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1e-6) { lx = dx / l; ly = dy / l; break; }
    }
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
      let dx = TP[b * 2] - TP[a * 2], dy = TP[b * 2 + 1] - TP[a * 2 + 1];
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1e-6) { dx /= l; dy /= l; lx = dx; ly = dy; } else { dx = lx; dy = ly; }
      TN[i * 2] = -dy; TN[i * 2 + 1] = dx;
      TW[i] = Math.max(0.1, lerp(w0, w1, n > 1 ? i / (n - 1) : 0) * 0.5);
    }
    ctx.beginPath();
    ctx.moveTo(TP[0] + TN[0] * TW[0], TP[1] + TN[1] * TW[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(TP[i * 2] + TN[i * 2] * TW[i], TP[i * 2 + 1] + TN[i * 2 + 1] * TW[i]);
    const e = n - 1, ae = Math.atan2(TN[e * 2 + 1], TN[e * 2]);
    ctx.arc(TP[e * 2], TP[e * 2 + 1], TW[e], ae, ae - Math.PI, true);      // round tip
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(TP[i * 2] - TN[i * 2] * TW[i], TP[i * 2 + 1] - TN[i * 2 + 1] * TW[i]);
    const a0 = Math.atan2(TN[1], TN[0]);
    ctx.arc(TP[0], TP[1], TW[0], a0 + Math.PI, a0, true);                  // round root
    ctx.closePath();
  }
  // Ink + fill + a highlight stripe along the upper side. Returns the stripe side.
  function tongueRibbon(ctx, n, w0, w1, inkT) {
    ribbonPath(ctx, n, w0, w1);
    ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = inkT * 2; ctx.stroke();
    ctx.fillStyle = PAL.tongue; ctx.fill();
    if (n < 4) return 1;
    const m = n >> 1, side = TN[m * 2 + 1] > 0 ? -1 : 1;
    ctx.beginPath();
    for (let i = 1; i < n - 1; i++) {
      const k = side * TW[i] * 0.42;
      const x = TP[i * 2] + TN[i * 2] * k, y = TP[i * 2 + 1] + TN[i * 2 + 1] * k;
      if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = Math.max(0.5, (w0 + w1) * 0.1); ctx.stroke();
    return side;
  }
  // A short bright glint sliding along a taut tongue (the stretchy sheen).
  function glint(ctx, n, s, side, w) {
    const f = clamp(s, 0, 1) * (n - 3) + 1, i0 = Math.floor(f), i1 = Math.min(n - 2, i0 + 2);
    if (i1 <= i0) return;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const k = side * TW[i] * 0.4;
      const x = TP[i * 2] + TN[i * 2] * k, y = TP[i * 2 + 1] + TN[i * 2 + 1] * k;
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(236,226,255,0.9)'; ctx.lineWidth = Math.max(0.6, w * 0.26); ctx.stroke();
  }
  // Sticky splat where the tongue lands: a flattened blob + a spray of droplets.
  // SPRAY = (angle from the tongue direction, distance, radius) × 3, in blob radii.
  const SPRAY = [0.85, 1.85, 0.16, -0.62, 1.75, 0.13, 0.12, 1.55, 0.1];
  function splat(ctx, ax, ay, dx, dy, rad, inkT) {
    const nx = -dy, ny = dx, rot = Math.atan2(ny, nx);
    ctx.beginPath();
    // the blob, flattened against the surface it hit
    const bx = ax + dx * rad * 0.2, by = ay + dy * rad * 0.2;
    ctx.moveTo(bx + nx * rad * 1.3, by + ny * rad * 1.3);
    ctx.ellipse(bx, by, rad * 1.3, rad * 0.78, rot, 0, TAU);
    // an asymmetric spray of flung droplets (reads as "splat", not as ears)
    for (let i = 0; i < 3; i++) {
      const a = SPRAY[i * 3], dist = SPRAY[i * 3 + 1] * rad, lr = SPRAY[i * 3 + 2] * rad;
      const ca = Math.cos(a), sa = Math.sin(a);
      const lx = ax + (dx * ca + nx * sa) * dist, ly = ay + (dy * ca + ny * sa) * dist;
      ctx.moveTo(lx + lr, ly); ctx.arc(lx, ly, lr, 0, TAU);
    }
    ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = inkT * 2; ctx.stroke();
    ctx.fillStyle = PAL.tongue; ctx.fill();
    ctx.fillStyle = PAL.tongueHi;
    ctx.beginPath(); ctx.ellipse(ax - rad * 0.3, ay - rad * 0.38, rad * 0.34, rad * 0.2, -0.5, 0, TAU); ctx.fill();
  }
  // A little Acacia leaf (world/screen space) carried on the tongue tip.
  function leafAt(ctx, x, y, ang, len, inkT) {
    const dx = Math.cos(ang), dy = Math.sin(ang), w = len * 0.36;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * len * 0.5 - dy * w, y + dy * len * 0.5 + dx * w, x + dx * len, y + dy * len);
    ctx.quadraticCurveTo(x + dx * len * 0.5 + dy * w, y + dy * len * 0.5 - dx * w, x, y);
    ctx.strokeStyle = C_INK; ctx.lineWidth = inkT * 1.6; ctx.stroke();
    ctx.fillStyle = PAL.leaf; ctx.fill();
  }

  // The attached tongue from root (inside the mouth) to anchor, with sag / wobble / sheen / splat.
  function attachedTongue(ctx, Rx, Ry, ax, ay, S, inkT, slack, tAttach, time, maxLen, swayPh, facing) {
    let dx = ax - Rx, dy = ay - Ry;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= d; dy /= d;
    let cx = (Rx + ax) * 0.5, cy = (Ry + ay) * 0.5;
    const loose = slack > 0.5;
    if (loose) {
      // Sag (parabola: arc length ≈ span + 8h²/3span). It bellies out on the
      // downhill side of the chord; a near-vertical tongue bows out in front
      // of the face instead of looping back behind the giraffe.
      const h = Math.min(Math.sqrt(K.SAG * d * slack), d * 0.6 + 20 * S);
      let nx = -dy, ny = dx;
      if (ny < 0) { nx = -nx; ny = -ny; }
      if (ny < 0.35) { const f = (0.35 - ny) / 0.35; nx = lerp(nx, facing < 0 ? -1 : 1, f); ny = lerp(ny, 0.35, f); }
      const sw = 1 + Math.sin(time * 2.3 + swayPh) * 0.25;
      cx += nx * 2 * h * sw;
      cy += ny * 2 * h * sw;
    }
    const n = 16;
    quadSamples(n, Rx, Ry, cx, cy, ax, ay);
    if (tAttach >= 0 && tAttach < K.WOBBLE_TIME) {
      const e = 1 - tAttach / K.WOBBLE_TIME;
      wobble(n, Math.min(K.WOBBLE_AMP * S, d * 0.2) * e * e, tAttach * 42, 3);
    }
    const st = loose ? 1 : clamp(1.12 - (d / (maxLen || 970)) * K.TONGUE_STRETCH, 0.7, 1.1);
    const w0 = K.TONGUE_W0 * S * st, w1 = K.TONGUE_W1 * S * st;
    const side = tongueRibbon(ctx, n, w0, w1, inkT);
    if (!loose && d > 40 * S) glint(ctx, n, (time * 0.9) % 1, side, w0);
    const pop = tAttach >= 0 && tAttach < 0.25 ? 1 + 0.55 * (1 - tAttach / 0.25) : 1;
    splat(ctx, ax, ay, dx, dy, K.SPLAT_R * S * pop, inkT);
  }

  // ------------------------------------------------------------ aim reticle (world)
  function drawAim(ctx, g, Mx, My) {
    const a = g.aim, r = g.rope, p = g.player;
    const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
    if (!isFinite(dx) || !isFinite(dy)) return;
    const maxL = r.maxLength || 970;
    let D = 260, inRange = true;
    if (isFinite(a.worldX) && isFinite(a.worldY)) {
      // Mouse aim puts the cursor on the aim ray; a gamepad aim leaves it stale.
      const px = a.worldX - p.x, py = a.worldY - p.y, pd = Math.sqrt(px * px + py * py) || 1;
      if ((px * dx + py * dy) / pd > 0.985) {
        const ex = a.worldX - Mx, ey = a.worldY - My, dd = Math.sqrt(ex * ex + ey * ey);
        D = Math.min(dd, maxL); inRange = dd <= maxL;
      }
    }
    D = Math.max(24, D);
    const cd = r.cooldownTimer > 0, A = cd ? 0.35 : 1;
    const ex = Mx + dx * D, ey = My + dy * D;
    const gr = ctx.createLinearGradient(Mx, My, ex, ey);
    gr.addColorStop(0, C_AIM + (0.72 * A).toFixed(3) + ')');
    gr.addColorStop(1, C_AIM + (0.16 * A).toFixed(3) + ')');
    ctx.fillStyle = gr;
    ctx.beginPath();
    const sp = K.AIM_DOT_SPACING, off = ((g.time || 0) * 38) % sp;
    for (let s = 16 + off; s < D - 12; s += sp) {
      const x = Mx + dx * s, y = My + dy * s, rr = K.AIM_DOT_R * (0.65 + 0.45 * (1 - s / D));
      ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU);
    }
    ctx.fill();
    const rot = (g.time || 0) * 1.6, R0 = 8;
    ctx.strokeStyle = inRange ? 'rgba(255,211,92,' + (0.9 * A).toFixed(3) + ')' : 'rgba(255,236,190,' + (0.4 * A).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ex + R0, ey); ctx.arc(ex, ey, R0, 0, TAU);
    for (let k = 0; k < 4; k++) {
      const aa = rot + k * Math.PI * 0.5, c = Math.cos(aa), s = Math.sin(aa);
      ctx.moveTo(ex + c * (R0 + 2), ey + s * (R0 + 2)); ctx.lineTo(ex + c * (R0 + 6), ey + s * (R0 + 6));
    }
    ctx.stroke();
    if (inRange && !cd) {
      ctx.fillStyle = PAL.tongueHi;
      ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, TAU); ctx.fill();
    }
    if (cd) {
      const f = 1 - clamp(r.cooldownTimer / (r.cooldownDuration || 0.4), 0, 1);
      if (f > 0.01) {
        ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(ex, ey, R0 + 4, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      }
    }
  }

  // The victory lick: tongue arcs up from the mouth to the canopy (and brings a leaf home).
  function munchTongue(ctx, Mx, My, Rx, Ry, lx, ly, ext, curl, carry, S, inkT) {
    const ex = Mx + (lx - Mx) * ext, ey = My + (ly - My) * ext;
    const dx = ex - Rx, dy = ey - Ry, d = Math.sqrt(dx * dx + dy * dy) || 1;
    let nx = -dy / d, ny = dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; }               // bulge upward
    const bul = (4 + 9 * curl) * S * ext;
    quadSamples(12, Rx, Ry, (Rx + ex) * 0.5 + nx * bul, (Ry + ey) * 0.5 + ny * bul, ex, ey);
    tongueRibbon(ctx, 12, 6.5 * S, 4.2 * S, inkT);
    if (carry) leafAt(ctx, ex, ey, Math.atan2(dy, dx) + 0.6, 7 * S, inkT);
  }

  // ------------------------------------------------------------ animation state (closure, never on g)
  const GR = makeRig();          // the in-game giraffe
  const PR = makeRig();          // scratch rig for menu portraits
  const NULL_ROPE = { active: false, shooting: false, failedRopeTimer: 0, failedRopeSegments: [], cooldownTimer: 0 };
  const EMPTY_OPTS = {};
  const MS = {
    player: null, snap: true, lx: 0, ly: 0, pvx: 0, pvy: 0, ax: 0, ay: 0,
    thV: 0, q: 0, qv: 0, psiV: 0, phiV: 0, bendV: 0, nlV: 0,
    legAV: new Float64Array(4), legKV: new Float64Array(4),
    t1V: 0, t2V: 0, eNV: 0, eFV: 0,
    tuck: 0, walk: 0, blinkT: 3, blinkPh: 0, blinkDbl: false, shock: 0, oops: 0,
    lickExt: 0, lickCurl: 0, carry: false, leafX: 0, leafY: 0, munchT: 0,
    rnd: mulberry(0x9e3779b9),
  };
  let hooked = false;

  function resetPose(p) {
    const R = GR;
    MS.player = p; MS.snap = false;
    MS.lx = p ? fin(p.x, 0) : 0; MS.ly = p ? fin(p.y, 0) : 0;
    MS.pvx = p ? fin(p.vx, 0) : 0; MS.pvy = p ? fin(p.vy, 0) : 0;
    MS.ax = 0; MS.ay = 0; MS.thV = 0; MS.q = 0; MS.qv = 0;
    MS.psiV = 0; MS.phiV = 0; MS.bendV = 0; MS.t1V = 0; MS.t2V = 0; MS.eNV = 0; MS.eFV = 0;
    MS.tuck = 0; MS.shock = 0; MS.oops = 0; MS.lickExt = 0; MS.lickCurl = 0; MS.carry = false;
    R.theta = 0; R.fx = p && p.facing < 0 ? -1 : 1; R.sx = 1; R.sy = 1;
    R.pivot = p && p.onGround ? 16 : 0;
    R.phi = PHI0; R.bend = 0; R.psi = PSI0; R.jaw = 0; R.neckL = NECK_L; MS.nlV = 0;
    for (let i = 0; i < 4; i++) { R.legA[i] = REST_A[i]; R.legK[i] = 0; MS.legAV[i] = 0; MS.legKV[i] = 0; }
    R.tail1 = TAIL_REST; R.tail2 = TAIL_REST - 0.1; R.earN = 0.2; R.earF = 0.25;
    R.lid = 0.14; R.wide = 0; R.happy = 0; R.blush = 0; R.grin = 0.35; R.brow = 0; R.leaf = 0;
    R.lookU = 0.9; R.lookV = 0.2;
    solve(R);
  }

  function onFx(type, d) {
    d = d || EMPTY_OPTS;
    if (type === 'jump') { MS.tuck = 1; MS.qv += d.double ? 2.0 : 2.6; }
    else if (type === 'land') MS.qv -= clamp(fin(d.speed, 300) / 250, 0.6, 4.5);
    else if (type === 'tongueAttach') MS.qv += 1.4;
    else if (type === 'tongueCut') MS.shock = 0.9;
    else if (type === 'tongueMiss') MS.oops = 0.8;
    else if (type === 'boost') MS.qv += 0.8;
    else if (type === 'goal') MS.qv += 2;
    else if (type === 'respawn' || type === 'runStart') MS.snap = true;
  }

  function update(g, dt) {
    const p = g.player;
    if (!p) return;
    if (MS.player !== p || MS.snap) resetPose(p);
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    const R = GR, S = gScale(), r = g.rope || NULL_ROPE, t = fin(g.time, 0);
    const px = fin(p.x, 0), py = fin(p.y, 0), pvx = fin(p.vx, 0), pvy = fin(p.vy, 0);
    if (Math.abs(px - MS.lx) > 400 || Math.abs(py - MS.ly) > 400) resetPose(p);   // teleported
    MS.lx = px; MS.ly = py;

    // smoothed acceleration (drives the dangling limbs)
    const ax = clamp(fin((pvx - MS.pvx) / dt, 0), -5000, 5000);
    const ay = clamp(fin((pvy - MS.pvy) / dt, 0), -5000, 5000);
    MS.pvx = pvx; MS.pvy = pvy;
    const ka = 1 - Math.exp(-dt * 14);
    MS.ax += (ax - MS.ax) * ka; MS.ay += (ay - MS.ay) * ka;
    const speed = Math.sqrt(pvx * pvx + pvy * pvy);
    const goal = g.goal, won = !!(goal && goal.reached);
    const grav = fin(g.gravity, 600);

    // facing flip: fx sweeps through 0 (a paper-thin squash), never snaps
    const tf = p.facing < 0 ? -1 : 1;
    R.fx += clamp(tf - R.fx, -K.FLIP_RATE * dt, K.FLIP_RATE * dt);
    const fs = R.fx < 0 ? -1 : 1;

    MS.tuck = Math.max(0, MS.tuck - dt * 2.2);
    MS.shock = Math.max(0, MS.shock - dt);
    MS.oops = Math.max(0, MS.oops - dt);

    // where the tongue is (or is going)
    let tgx = 0, tgy = 0, tongueOut = false;
    if (r.active) { tgx = fin(r.x, px); tgy = fin(r.y, py - 100); tongueOut = true; }
    else if (r.shooting) { tgx = px + fin(r.shootDX, 0) * 1000; tgy = py + fin(r.shootDY, -1) * 1000; tongueOut = true; }

    // victory munch timeline: reach → curl round a leaf → reel it in → chew
    let chew = 0, tm = 0;
    if (won) {
      tm = Math.max(0, t - fin(goal.reachedAt, t));
      const P = K.MUNCH_PERIOD, ph = (tm % P) / P;
      let ext = 0;
      if (ph < 0.28) ext = smooth(ph / 0.28);
      else if (ph < 0.45) ext = 1;
      else if (ph < 0.62) ext = 1 - smooth((ph - 0.45) / 0.17);
      MS.lickExt = ext;
      MS.lickCurl = Math.sin(Math.PI * clamp((ph - 0.28) / 0.34, 0, 1));
      MS.carry = ph > 0.4 && ph < 0.62;
      chew = ph >= 0.62 ? 1 : 0;
      R.leaf = ph >= 0.6 && ph < 0.97 ? smooth((ph - 0.6) / 0.04) : 0;
      l2w(R, px, py, S, R.mx, R.my);
      const lx = _wx - goal.x, ly = _wy - goal.y, ll = Math.sqrt(lx * lx + ly * ly) || 1;
      const gr = fin(goal.radius, 40) * 0.5;
      MS.leafX = goal.x + lx / ll * gr; MS.leafY = goal.y + ly / ll * gr;
    } else { MS.lickExt = 0; MS.carry = false; R.leaf = 0; }

    // ---- body rotation
    const mvx = fxc(R.fx) * R.sx * R.mx, mvy = R.pivot + (R.my - R.pivot) * R.sy;
    // Standing hooves stay planted: a tongue fired from the ground only turns the head.
    const hang = tongueOut && !p.onGround;
    let thT, k, z;
    if (won) { thT = -0.08 * fs + Math.sin(t * 2.2) * 0.05; k = K.FLY_K; z = 0.6; }
    else if (hang) {
      thT = Math.atan2(tgy - py, tgx - px) - Math.atan2(mvy, mvx);
      if (r.shooting) { k = K.SNAP_K; z = K.SNAP_Z; } else { k = K.HANG_K; z = K.HANG_Z; }
    } else if (p.onGround || g.debugFlying) { thT = 0; k = K.GROUND_K; z = K.GROUND_Z; }
    else {
      const up = clamp(-pvy / 700, 0, 1);
      let fall = smooth((pvy - 300) / 800);
      if (g.ground) fall *= clamp((g.ground.y - py - 60) / 250, 0, 1);   // right itself before touchdown
      thT = clamp(pvx / 900, -1, 1) * K.LEAN + fs * (-up * K.NOSE_UP + fall * K.DIVE_MAX);
      k = K.FLY_K; z = K.FLY_Z;
    }
    const err = wrapA(thT - R.theta);
    R.theta = wrapA(spr(R.theta, MS.thV, R.theta + err, k, z, dt));
    MS.thV = clamp(_v, -40, 40);

    // ---- apparent gravity + air drag, in the body frame: where loose limbs hang
    w2lDir(R, -MS.ax - pvx * 0.5, grav - MS.ay - pvy * 0.5);
    const ltx = _lx, lty = _ly;
    const mag = Math.sqrt(ltx * ltx + lty * lty), wT = clamp(mag / 500, 0, 1);
    const dangle = clamp(Math.atan2(ltx, Math.abs(lty)), -1.25, 1.25);
    const upness = lty < 0 ? clamp(-lty / (mag + 1), 0, 1) : 0;

    // ---- legs
    const walking = p.onGround && Math.abs(pvx) > 30;
    if (walking) MS.walk += Math.abs(pvx) * dt / 7;
    for (let i = 0; i < 4; i++) {
      const front = (i & 1) === 1;
      let aT, kT, k1 = K.LEG_K, z1 = K.LEG_Z, k2 = K.KNEE_K, z2 = K.KNEE_Z;
      if (p.onGround) {
        aT = REST_A[i]; kT = 0; k1 = 320; z1 = 0.9; k2 = 320; z2 = 0.9;
        if (walking) {                         // giraffes pace: same-side legs together
          const ph = MS.walk + (i < 2 ? 0 : Math.PI), amp = Math.min(1, Math.abs(pvx) / 160);
          aT += Math.sin(ph) * 0.42 * amp;
          kT = Math.max(0, Math.sin(ph + 1.4)) * 0.8 * amp;
        }
      } else {
        aT = lerp(FLY_A[i], dangle, wT * 0.85) + Math.sin(t * (2.1 + i * 0.37) + i * 1.9) * 0.16;
        kT = 0.35 + upness * 1.1 + Math.sin(t * 1.7 + i * 1.3) * 0.12;
        if (p.boosting) {                      // paddling through space
          const ph = t * 13 + (i === 0 || i === 3 ? 0 : Math.PI);
          aT = aT * 0.4 + Math.sin(ph) * 0.75;
          kT = 0.75 + 0.55 * Math.sin(ph + 1.2);
        }
        if (won) {                             // happy little kicks
          const ph = t * 5.5 + i * 1.6;
          aT = FLY_A[i] + Math.sin(ph) * 0.4;
          kT = 0.6 + 0.35 * Math.sin(ph + 1.1);
        }
        if (MS.tuck > 0) {
          const tk = smooth(MS.tuck);
          aT = lerp(aT, front ? 0.95 : -0.85, tk);
          kT = lerp(kT, 1.9, tk);
        }
      }
      aT = clamp(aT, -1.35, 1.35); kT = clamp(kT, 0, 2.2);
      R.legA[i] = clamp(spr(R.legA[i], MS.legAV[i], aT, k1, z1, dt), -1.8, 1.8); MS.legAV[i] = _v;
      R.legK[i] = clamp(spr(R.legK[i], MS.legKV[i], kT, k2, z2, dt), -0.2, 2.4); MS.legKV[i] = _v;
    }

    // ---- tail (swings with lag; wags when happy)
    let tailD = Math.atan2(ltx, lty);
    if (tailD > 1.2) tailD -= TAU;
    let tT = lerp(TAIL_REST, clamp(tailD, -2.8, 0.9), wT * 0.8) + Math.sin(t * 2.1) * 0.22;
    if (won || R.happy > 0.5) tT += Math.sin(t * 9) * 0.45;
    R.tail1 = clamp(spr(R.tail1, MS.t1V, tT, K.TAIL_K, K.TAIL_Z, dt), -3.2, 1.4); MS.t1V = _v;
    R.tail2 = clamp(spr(R.tail2, MS.t2V, R.tail1 + Math.sin(t * 2.1 - 0.9) * 0.3, K.TAIL_K * 0.7, K.TAIL_Z, dt), -3.6, 1.8); MS.t2V = _v;

    // ---- ears flop with g-force, perk up when weightless or alarmed
    let flopT = clamp((lty - 300) / 900, -0.6, 0.9) + clamp(-MS.thV * 0.06, -0.5, 0.5) + Math.sin(t * 1.3) * 0.08;
    if (R.wide > 0.5) flopT -= 0.4;
    R.earN = clamp(spr(R.earN, MS.eNV, flopT, K.EAR_K, K.EAR_Z, dt), -0.9, 1.3); MS.eNV = _v;
    R.earF = clamp(spr(R.earF, MS.eFV, flopT + 0.05, K.EAR_K * 0.8, K.EAR_Z, dt), -0.9, 1.3); MS.eFV = _v;

    // ---- neck / head / jaw
    let phiT = PHI0, psiT = PSI0 + Math.sin(t * 0.9) * 0.05 + (p.onGround ? 0 : 0.06), jawT = 0;
    let bendT = clamp(ltx / 300, -3.5, 3.5) + Math.sin(t * 1.6) * 1.1;
    let neckT = NECK_L;
    if (hang) {
      // the neck leads the swing; the head keeps the muzzle on the tongue line
      phiT = PHI0 + 0.08 + clamp(err * fs * 0.8, -0.45, 0.45);
      psiT = psiAligned(R, R.psi) + clamp(err * fs * 0.4, -0.3, 0.3);
      jawT = K.JAW_TONGUE;
      // reeled in tight: scrunch the neck so the mouth stays short of the anchor
      if (r.active) {
        const dx = tgx - px, dy = tgy - py, d = Math.sqrt(dx * dx + dy * dy) / S;
        neckT = clamp(NECK_L - Math.max(0, 70 - d), 18, NECK_L);
      }
    } else if (tongueOut) {
      // licking from the planet surface: body stays planted, the head aims
      w2lDir(R, tgx - px, tgy - py);
      psiT = clamp(Math.atan2(_ly / S - R.n1y, _lx / S - R.n1x), -1.5, 1.0);
      phiT = PHI0 + 0.1;
      jawT = K.JAW_TONGUE;
    } else if (won) {
      w2lDir(R, MS.leafX - px, MS.leafY - py);
      psiT = clamp(Math.atan2(_ly / S - R.n1y, _lx / S - R.n1x), -1.4, 0.7);
      phiT = PHI0 + 0.12;
      jawT = MS.lickExt > 0.02 ? K.JAW_TONGUE : chew ? 0.1 + 0.4 * (0.5 + 0.5 * Math.sin(tm * 17)) : 0.05;
      bendT += Math.sin(tm * 17) * 0.6 * chew;
    } else if (r.failedRopeTimer > 0 && r.failedCause === 'miss') {
      jawT = 0.55; psiT = PSI0 + 0.15;
    }
    if (MS.shock > 0) jawT = Math.max(jawT, 0.6);
    R.tongueIn = tongueOut || (won && MS.lickExt > 0.02) ||
      (r.failedRopeTimer > 0 && !r.active && !r.shooting) ? 1 : 0;
    R.phi = clamp(spr(R.phi, MS.phiV, phiT, K.HEAD_K * 0.6, 0.6, dt), -0.4, 1.0); MS.phiV = _v;
    R.psi = clamp(spr(R.psi, MS.psiV, psiT, K.HEAD_K, K.HEAD_Z, dt), -1.6, 1.2); MS.psiV = _v;
    R.bend = clamp(spr(R.bend, MS.bendV, bendT, K.NECK_K, K.NECK_Z, dt), -6, 6); MS.bendV = _v;
    R.neckL = clamp(spr(R.neckL, MS.nlV, neckT, 160, 0.55, dt), 14, NECK_L + 4); MS.nlV = _v;
    R.jaw += (jawT - R.jaw) * (1 - Math.exp(-dt * (jawT > R.jaw ? 22 : 10)));

    // ---- squash & stretch (+ a bump while the facing flips)
    let qT = p.onGround ? 0 : clamp(speed / 3000, 0, 0.08);
    if (won) qT = chew * Math.sin(tm * 17) * 0.03;
    MS.q = clamp(spr(MS.q, MS.qv, qT, K.SQUASH_K, K.SQUASH_Z, dt), -0.35, 0.35); MS.qv = clamp(_v, -8, 8);
    const flip = 0.12 * (1 - Math.min(1, Math.abs(R.fx)));
    R.sy = 1 + MS.q + flip; R.sx = 1 - MS.q * 0.7 + flip * 0.3;
    R.pivot = p.onGround ? 16 : R.pivot * Math.exp(-dt * 10);

    // ---- face
    MS.blinkT -= dt;
    if (MS.blinkT <= 0 && MS.blinkPh <= 0) {
      MS.blinkPh = 1e-4;
      MS.blinkT = K.BLINK_MIN + MS.rnd() * (K.BLINK_MAX - K.BLINK_MIN);
      MS.blinkDbl = MS.rnd() < 0.2;
    }
    let lidB = 0;
    if (MS.blinkPh > 0) {
      MS.blinkPh += dt / 0.15;
      if (MS.blinkPh >= 1) { if (MS.blinkDbl) { MS.blinkDbl = false; MS.blinkPh = 1e-4; } else MS.blinkPh = 0; }
      else lidB = Math.sin(MS.blinkPh * Math.PI);
    }
    const wideT = fin(g.fallShake, 0) > 0.3 || g.inGravityWell || MS.shock > 0 ? 1 : 0;
    const happyT = !wideT && (speed > 700 || p.boosting || won) ? 1 : 0;
    const ke = 1 - Math.exp(-dt * 12);
    R.wide += (wideT - R.wide) * ke;
    R.happy += (happyT - R.happy) * ke;
    R.blush += ((won || p.boosting ? 1 : happyT * 0.6) - R.blush) * (1 - Math.exp(-dt * 4));
    R.grin = 0.35 + R.happy * 0.65 - MS.oops * 0.5;
    R.brow = MS.oops * 0.9;
    R.lid = Math.max(lidB, 0.14 * (1 - R.wide) + MS.oops * 0.3);

    // pupils: the anchor / the flying tongue / the leaf / the aim / the ground rushing up
    let lkx = 0, lky = 0, look = true;
    if (tongueOut) { lkx = tgx - px; lky = tgy - py; }
    else if (won) { lkx = MS.leafX - px; lky = MS.leafY - py; }
    else if (R.wide > 0.5 && pvy > 300) { lkx = 0; lky = 1; }
    else if (g.aim && g.aim.visible && isFinite(g.aim.angle)) { lkx = Math.cos(g.aim.angle); lky = Math.sin(g.aim.angle); }
    else look = false;
    let tu = 0.9, tv = 0.2;
    if (look) {
      w2lDir(R, lkx, lky);
      const hu = _lx * R.hc + _ly * R.hs, hv = -_lx * R.hs + _ly * R.hc, l = Math.sqrt(hu * hu + hv * hv);
      if (l > 1e-6) { tu = hu / l; tv = hv / l; }
    }
    R.lookU += (tu - R.lookU) * ke * 1.4;
    R.lookV += (tv - R.lookV) * ke * 1.4;

    solve(R);
    if (!isFinite(R.theta + R.mx + R.my + R.legA[0] + R.legA[3] + R.tail2 + R.sx + R.sy)) resetPose(p);
  }

  // ------------------------------------------------------------ in-game draw
  function draw(ctx, g) {
    const p = g.player;
    if (!p) return;
    if (MS.player !== p) resetPose(p);
    if (!torsoSpots) buildSpots();
    const R = GR, S = gScale(), r = g.rope || NULL_ROPE, inkW = K.INK, t = fin(g.time, 0);
    const px = fin(p.x, 0), py = fin(p.y, 0);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // warm back-glow (lifts the silhouette off dark space) + debug-fly halo
    if (glowWarm || (g.debugFlying && glowCyan)) {
      l2w(R, px, py, S, 4, -20);
      ctx.globalCompositeOperation = 'lighter';
      if (glowWarm) {
        const gs = 150 * S;
        ctx.globalAlpha = K.GLOW_ALPHA;
        ctx.drawImage(glowWarm, _wx - gs / 2, _wy - gs / 2, gs, gs);
      }
      if (g.debugFlying && glowCyan) {
        const gs = 200 * S;
        ctx.globalAlpha = 0.4 + 0.12 * Math.sin(fin(g.shaderTime, 0) * 4);
        ctx.drawImage(glowCyan, _wx - gs / 2, _wy - gs / 2, gs, gs);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // (the tongue is drawn first: it sits behind the head and slides out of the open mouth)
    l2w(R, px, py, S, R.mx, R.my); const Mx = _wx, My = _wy;
    l2w(R, px, py, S, R.rx, R.ry); const Rx = _wx, Ry = _wy;
    const inkT = inkW * 0.85 * S;

    // failed licks: the limp flop (miss) or the severed piece + stub (comet cut)
    const segs = r.failedRopeSegments;
    if (r.failedRopeTimer > 0 && segs && segs.length > 1) {
      const alpha = clamp(r.failedRopeTimer / (r.failedRopeMaxTime || 0.8), 0, 1);
      if (r.failedCause === 'cut') {
        const n = Math.min(segs.length, TMAX);
        let ok = true;
        for (let i = 0; i < n; i++) {
          const sx = segs[i].x, sy = segs[i].y;
          if (!isFinite(sx) || !isFinite(sy)) { ok = false; break; }
          TP[i * 2] = sx; TP[i * 2 + 1] = sy;
        }
        if (ok && alpha > 0.01) {
          ctx.globalAlpha = alpha;
          tongueRibbon(ctx, n, 5.5 * S, 4 * S, inkT);
          ctx.globalAlpha = 1;
        }
        if (!r.active && !r.shooting) {
          h2l(R, R.mhu + 5, R.mhv);
          l2w(R, px, py, S, _hx, _hy);
          let hx = _wx - Mx, hy = _wy - My;
          const hl = Math.sqrt(hx * hx + hy * hy) || 1;
          hx /= hl; hy /= hl;
          TP[0] = Rx; TP[1] = Ry; TP[2] = Mx; TP[3] = My;
          TP[4] = Mx + hx * 5 * S; TP[5] = My + hy * 5 * S + 3 * S * alpha;
          tongueRibbon(ctx, 3, 7 * S, 5.5 * S, inkT);
        }
      } else if (!r.active && !r.shooting) {
        const kk = Math.pow(alpha, 0.6);
        const cnt = Math.min(segs.length, Math.max(1, Math.ceil(segs.length * alpha)), TMAX - 2);
        TP[0] = Rx; TP[1] = Ry; TP[2] = Mx; TP[3] = My;
        let n = 2;
        for (let i = 0; i < cnt; i++) {
          const sx = segs[i].x, sy = segs[i].y;
          if (!isFinite(sx) || !isFinite(sy)) break;
          TP[n * 2] = Mx + (sx - Mx) * kk; TP[n * 2 + 1] = My + (sy - My) * kk;
          n++;
        }
        if (n >= 3) {
          ctx.globalAlpha = Math.min(1, alpha * 1.5);
          tongueRibbon(ctx, n, 6.5 * S, 3.5 * S, inkT);
          ctx.globalAlpha = 1;
        }
      }
    }

    // the live tongue
    if (r.active) {
      attachedTongue(ctx, Rx, Ry, fin(r.x, Mx), fin(r.y, My - 50), S, inkT,
        r.taut ? 0 : Math.max(0, fin(r.slack, 0)), t - fin(r.attachTime, -9), t, r.maxLength, px * 0.003, R.fx);
    } else if (r.shooting) {
      const dx = fin(r.shootDX, 0), dy = fin(r.shootDY, -1);
      let tx = fin(r.shootX, Mx), ty = fin(r.shootY, My);
      if (!((tx - Mx) * dx + (ty - My) * dy > 8 * S)) { tx = Mx + dx * 8 * S; ty = My + dy * 8 * S; }
      quadSamples(24, Rx, Ry, (Rx + tx) * 0.5, (Ry + ty) * 0.5, tx, ty);
      wobble(24, 2.2 * S, t * 38, 3);
      tongueRibbon(ctx, 24, K.TONGUE_W0 * S, 5.6 * S, inkT);   // a round sticky ball leads the way
    } else if (g.goal && g.goal.reached && MS.lickExt > 0.02) {
      munchTongue(ctx, Mx, My, Rx, Ry, MS.leafX, MS.leafY, MS.lickExt, MS.lickCurl, MS.carry, S, inkT);
    }

    // the giraffe
    ctx.save();
    applyLocal(ctx, R, px, py, S);
    drawBody(ctx, R, inkW);
    ctx.restore();

    // aim reticle
    if (g.state === 'playing' && g.aim && g.aim.visible && !r.active && !r.shooting && !(g.goal && g.goal.reached)) {
      drawAim(ctx, g, Mx, My);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ menu portrait (screen space)
  function drawPortrait(ctx, x, y, scale, t, opts) {
    const o = opts || EMPTY_OPTS;
    if (!torsoSpots) buildSpots();
    const pose = o.pose || 'float', facing = o.facing < 0 ? -1 : 1;
    x = fin(x, 0); y = fin(y, 0);
    const tt = fin(t, 0), sc = Math.max(0.05, fin(scale, 1)), S = sc * gScale();
    const inkW = K.INK / Math.pow(Math.max(1, sc), K.PORTRAIT_INK_EXP);
    const to = o.tongueTo && isFinite(o.tongueTo.x) && isFinite(o.tongueTo.y) ? o.tongueTo : null;
    const R = PR;

    // base "floating in space" pose, purely a function of t
    R.fx = facing; R.sx = 1; R.sy = 1 + Math.sin(tt * 2.1) * 0.012; R.pivot = 0; R.neckL = NECK_L;
    R.phi = PHI0 + Math.sin(tt * 0.8) * 0.06; R.bend = Math.sin(tt * 1.1) * 1.6;
    R.psi = PSI0 + Math.sin(tt * 0.9) * 0.08;
    for (let i = 0; i < 4; i++) {
      R.legA[i] = FLY_A[i] + Math.sin(tt * 1.9 + i * 1.3) * 0.3;
      R.legK[i] = 0.45 + 0.25 * Math.sin(tt * 1.9 + i * 1.3 + 1.1);
    }
    R.tail1 = -0.5 + Math.sin(tt * 1.7) * 0.35; R.tail2 = R.tail1 + Math.sin(tt * 1.7 - 0.9) * 0.4;
    R.earN = 0.1 + Math.sin(tt * 1.3) * 0.25; R.earF = R.earN + 0.1;
    const bt = tt % 3.3;
    R.lid = Math.max(0.12, bt < 0.16 ? Math.sin(bt / 0.16 * Math.PI) : 0);
    R.wide = 0; R.happy = 0; R.blush = 0.35; R.grin = 0.6; R.brow = 0; R.leaf = 0; R.jaw = 0; R.tongueIn = 0;
    R.lookU = 0.9; R.lookV = 0.15 + Math.sin(tt * 0.7) * 0.2;
    let theta = fin(o.bodyAngle, NaN);
    let lickExt = 0, lickCurl = 0, carry = false;

    if (pose === 'lick' && to) {
      R.jaw = K.JAW_TONGUE; R.blush = 0.6; R.tongueIn = 1;
      solve(R); R.psi = psiAligned(R, R.psi); solve(R);
      if (!isFinite(theta)) theta = Math.atan2(to.y - y, to.x - x) - Math.atan2(R.my, facing * R.mx) + Math.sin(tt * 1.2) * 0.05;
      R.theta = theta;
      // legs and tail hang toward screen-down
      w2lDir(R, 0, 1);
      const dg = clamp(Math.atan2(_lx, Math.abs(_ly)), -1.25, 1.25);
      for (let i = 0; i < 4; i++) R.legA[i] = lerp(FLY_A[i], dg, 0.7) + Math.sin(tt * 1.9 + i * 1.3) * 0.2;
      R.tail1 = lerp(TAIL_REST, dg, 0.7) + Math.sin(tt * 1.7) * 0.3; R.tail2 = R.tail1 + Math.sin(tt * 1.7 - 0.9) * 0.4;
    } else if (pose === 'munch') {
      R.happy = 1; R.blush = 1; R.grin = 1;
      if (!isFinite(theta)) theta = Math.sin(tt * 2.2) * 0.05 - 0.05 * facing;
      R.theta = theta;
      let chew = 1;
      if (to) {
        const P = K.MUNCH_PERIOD, ph = (tt % P) / P;
        if (ph < 0.28) lickExt = smooth(ph / 0.28);
        else if (ph < 0.45) lickExt = 1;
        else if (ph < 0.62) lickExt = 1 - smooth((ph - 0.45) / 0.17);
        lickCurl = Math.sin(Math.PI * clamp((ph - 0.28) / 0.34, 0, 1));
        carry = ph > 0.4 && ph < 0.62;
        chew = ph >= 0.62 ? 1 : 0;
        solve(R);
        w2lDir(R, to.x - x, to.y - y);
        R.psi = clamp(Math.atan2(_ly / S - R.n1y, _lx / S - R.n1x), -1.4, 0.7);
      }
      R.jaw = lickExt > 0.02 ? K.JAW_TONGUE : chew ? 0.1 + 0.4 * (0.5 + 0.5 * Math.sin(tt * 17)) : 0.05;
      R.leaf = chew; R.tongueIn = lickExt > 0.02 ? 1 : 0;
      R.tail1 += Math.sin(tt * 9) * 0.45;
      for (let i = 0; i < 4; i++) {
        const ph = tt * 5.5 + i * 1.6;
        R.legA[i] = FLY_A[i] + Math.sin(ph) * 0.4; R.legK[i] = 0.6 + 0.35 * Math.sin(ph + 1.1);
      }
    } else {
      if (!isFinite(theta)) theta = Math.sin(tt * 0.7) * 0.1;
      R.theta = theta;
    }
    R.theta = wrapA(theta);
    solve(R);
    if (to && !(pose === 'munch')) {
      w2lDir(R, to.x - x, to.y - y);
      const hu = _lx * R.hc + _ly * R.hs, hv = -_lx * R.hs + _ly * R.hc, l = Math.sqrt(hu * hu + hv * hv);
      if (l > 1e-6) { R.lookU = hu / l; R.lookV = hv / l; }
    }

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    l2w(R, x, y, S, R.mx, R.my); const Mx = _wx, My = _wy;
    l2w(R, x, y, S, R.rx, R.ry); const Rx = _wx, Ry = _wy;
    const inkT = inkW * 0.85 * S;
    if (pose === 'lick' && to) {
      const slack = (0.5 + 0.5 * Math.sin(tt * 1.3)) * 14 * S;
      attachedTongue(ctx, Rx, Ry, to.x, to.y, S, inkT, slack > 3 * S ? slack : 0,
        tt % K.PORTRAIT_LICK_PERIOD, tt, 1e9, 0, facing);
    } else if (pose === 'munch' && to && lickExt > 0.02) {
      munchTongue(ctx, Mx, My, Rx, Ry, to.x, to.y, lickExt, lickCurl, carry, S, inkT);
    }
    ctx.save();
    applyLocal(ctx, R, x, y, S);
    drawBody(ctx, R, inkW);
    ctx.restore();
    ctx.restore();
  }

  // ------------------------------------------------------------ public API
  ASCENT.Giraffe = {
    K,
    init(g) {
      if (!torsoSpots) buildSpots();
      buildGlows(false);
      if (!hooked && ASCENT.FX && ASCENT.FX.on) { hooked = true; ASCENT.FX.on(onFx); }
      resetPose(g && g.player);
    },
    // GPU context restored (main.js): the glow sprites are the only canvases
    // this style owns (the coat pattern is plain data, gradients are per-frame).
    // Safe before init and when called repeatedly; the pose is left alone.
    rebuild(_g) { buildGlows(true); },
    update(g, dt) { update(g, dt); },
    draw(ctx, g) { draw(ctx, g); },
    drawPortrait(ctx, x, y, scale, t, opts) { drawPortrait(ctx, x, y, scale, t, opts); },
    mouthPos(g) {
      const p = g && g.player;
      if (!p) return { x: 0, y: 0 };
      if (MS.player !== p) resetPose(p);
      l2w(GR, fin(p.x, 0), fin(p.y, 0), gScale(), GR.mx, GR.my);
      return { x: _wx, y: _wy };
    },
  };
})();

// Register as a selectable giraffe style (see giraffe.js, the dispatcher).
(ASCENT.GiraffeSkins = ASCENT.GiraffeSkins || {}).cartoon = ASCENT.Giraffe;
