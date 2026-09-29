/*
 * GIRAFFE STYLE: PLUSH (design A — "Storybook plush")
 * =====================================
 * The star of the show: a chubby, huggable plush giraffe drifting through
 * space, hanging from (and slurping with) its comically long dark-purple tongue.
 *
 * Style: chibi proportions (big head, huge shiny lashy eye, plump body, stubby
 * sock-legs, bendy noodle neck), soft radial-gradient shading and chunky warm
 * outlines so it reads instantly at ~75px against dark space, plus a faint cool
 * rim light and a soft warm aura so it glows like a storybook character.
 *
 * How it is drawn
 *   Everything is vector (crisp at any zoom / menu scale). Gradients are created
 *   ONCE in body-local coordinates and reused every frame: a canvas gradient is
 *   interpreted in the current transform, so it rotates and flips with the body.
 *   The coat pattern (seeded rounded patches with thin light cracks between) is
 *   generated once at load time and is attached to the body/head frames.
 *
 * The rig (body-local units, scale 1, COM at the origin, facing right, +y down)
 *   body      ellipse centre (-2,-3), 17 x 10
 *   legs      hips near-front (9,3.5) far-front (5.5,2) near-back (-11,3.5)
 *             far-back (-14.5,2); two segments (knee) + round hoof caps; the
 *             near hooves' bottoms sit exactly on y = 16 = player.radius
 *   neck      flares out of the chest at (2,-12.7)..(13.5,-7.1), a bendy
 *             quadratic "noodle" up to the head attach point T ≈ (14.5,-36.5)
 *   head      frame at H = T + R(headAng)·(4.5,-6); skull 11.5 x 9.5, muzzle,
 *             chin (jaw), big eye, ossicones with dark tufts (tips ≈ y -60)
 *   mouth     head-local (15, 6.5)  →  body-local ≈ (34,-34)
 * World transform: translate(COM) · rotate(rot) · squash about the hoof line ·
 * scale(S·flip, S), where flip eases through ±1 for a quick squashy turn.
 *
 * Motion (all dt-based springs, state in this closure — never on g)
 *   · Hanging from the tongue: the body rotates (springy) so the mouth lies on
 *     the ray COM → anchor: rot = atan2(anchor − COM) − atan2(mouth offset).
 *     The noodle neck scrunches if the anchor is closer than the mouth.
 *   · Free flight: nose-up when rising, head-first dive when falling fast, lean
 *     into horizontal travel; upright on the ground (with a tiny walk patter).
 *   · Legs / tail follow the *apparent* gravity (gravity − acceleration), so they
 *     lag, swing outward on a swing, and float weightlessly in free fall; paddle
 *     when boosting, tuck on a jump; ears stream in the airflow.
 *   · Faces: blink, wide eyes + tiny pupils when falling / near a black hole,
 *     happy squint + grin when fast, wince when a comet cuts the tongue, and a
 *     munching victory at the Celestial Acacia (tongue curls out for leaves).
 *
 * API (ASCENT.Giraffe): init(g), update(g, dt), draw(ctx, g),
 *   drawPortrait(ctx, x, y, scale, t, opts), mouthPos(g) → {x, y},
 *   rebuild(g) (GPU context restored: re-create the cached gradients).
 *   drawPortrait's (x, y) is the visual centre of the figure (screen space);
 *   opts = {pose:'float'|'lick'|'munch', facing:±1, tongueTo:{x,y}|null, bodyAngle?}.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Tuning knobs
  // ---------------------------------------------------------------------------
  const K = {
    OUTLINE: '#4a230c',       // warm dark-brown plush outline
    OUTLINE_W: 1.5,           // outline width (body-local px)
    FAR_TINT: '#d6953c',      // far legs / far ear (one step darker than the coat)
    RIM: 'rgba(150,200,255,0.5)', // cool "space" rim light on the shadow side
    AURA: 0.10,               // warm storybook glow behind the giraffe (alpha)

    // body orientation springs: [angular freq rad/s, damping ratio]
    ROT_FREE: [7.5, 0.5],
    ROT_HANG: [11, 0.42],     // springy while dangling from the tongue
    ROT_SHOOT: [24, 0.8],     // quick head-snap toward the aim when the tongue fires
    ROT_GROUND: [18, 0.9],
    RISE_TILT: 0.28,          // nose-up (rad) when rising fast
    LEAN: 0.18,               // lean into horizontal travel (rad)
    DIVE_MAX: 1.9,            // head-first dive (rad) at full fall speed
    DIVE_V0: 380, DIVE_V1: 950, // fall speeds (px/s) where the dive starts / maxes

    LEG_FOLLOW: 0.75,         // how far legs swing toward apparent gravity
    LEG_Z: 0.28,              // leg spring damping (low = floppier)
    TAIL_W: 7, TAIL_Z: 0.22,
    EAR_W: 10, EAR_Z: 0.25,
    FLIP_TIME: 0.14,          // seconds for a full facing flip
    HANG_TURN: 0.25,          // hanging: turn only when |anchor dx| > this × tongue length
    BLINK_MIN: 2.5, BLINK_MAX: 5, BLINK_DUR: 0.13,
    HAPPY_SPEED: 700,         // px/s — happy squint + grin above this
    OUCH_TIME: 0.75,          // wince after a comet cuts the tongue

    TONGUE_W0: 7,             // tongue width at the mouth (scale 1)
    TONGUE_W1: 4,             // ... at the tip
    TONGUE_N: 18,             // ribbon samples
    SAG_PER_SLACK: 0.55,      // loose-tongue sag (px per px of slack)
    WOBBLE_TIME: 0.35,        // attach wobble duration
    WOBBLE_AMP: 9,            // attach wobble amplitude (px)
    MUNCH_PERIOD: 2.2,        // victory lick-and-chew cycle (s)

    AIM_DOT_GAP: 13,          // aim reticle dot spacing (world px)
  };

  const TAU = Math.PI * 2;
  const PAL = ASCENT.PAL;
  const OUT = K.OUTLINE;

  // Eye / mouth modes
  const EYE_NORMAL = 0, EYE_WIDE = 1, EYE_HAPPY = 2, EYE_JOY = 3, EYE_OUCH = 4;
  const MOUTH_SMILE = 0, MOUTH_OPEN = 1, MOUTH_GRIN = 2, MOUTH_O = 3, MOUTH_CHEW = 4;

  // ---------------------------------------------------------------------------
  // Rig (body-local, scale 1, facing right, +y down, COM at origin)
  // ---------------------------------------------------------------------------
  const RIG = {
    bcx: -2, bcy: -3, brx: 17, bry: 10,                    // body ellipse
    hips: [[9, 3.5], [5.5, 2], [-11, 3.5], [-14.5, 2]],    // 0 near-front, 1 far-front, 2 near-back, 3 far-back
    legL1: 4.4, legL2: 4.7, legW: 6.4,                     // near hoof cap bottom = 3.5+9.1+3.2 ≈ 16
    neckPb: [2, -12.7], neckPf: [13.5, -7.1],              // neck edges leave the body outline here
    neckB0: [7.75, -9.9], neckT: [14.5, -36.5],            // neck centre-line base → rest top
    neckTopHW: 3.9, neckMidHW: 5.2, neckBow: 2.4,
    headAttach: [-4.5, 6],                                 // head-local point where the neck enters
    headRest: 0.1,                                          // resting nod (rad, nose slightly down)
    mouth: [15, 6.5],                                       // head-local mouth
    tailRoot: [-18, -5], tailLen: 12,
    groundY: 16,                                            // hoof line (= player radius)
  };
  const TAIL_REST = Math.PI * 0.62;   // tail points down-back
  const EAR_REST = 3.3;               // ears point back, slightly up (head-local)
  const WALK_PH = [0, Math.PI, Math.PI, 0];   // diagonal pairs trot together

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const fin = (v, d) => (Number.isFinite(v) ? v : d);
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function ease(x, tgt, rate, dt) { return x + (tgt - x) * (1 - Math.exp(-rate * dt)); }
  function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  // Damped spring (semi-implicit Euler, sub-stepped so a 50ms frame stays stable).
  // Returns the new position; the new velocity is left in _sv.
  let _sv = 0;
  function spring(x, v, tgt, w, z, dt) {
    const n = dt > 0.017 ? Math.ceil(dt / 0.0167) : 1, h = dt / n;
    for (let i = 0; i < n; i++) { v += (w * w * (tgt - x) - 2 * z * w * v) * h; x += v * h; }
    if (!Number.isFinite(x) || !Number.isFinite(v)) { x = tgt; v = 0; }
    _sv = v;
    return x;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const blinkRnd = mulberry32(0xB11C);

  // ---------------------------------------------------------------------------
  // Coat pattern — seeded rounded patches, generated once at load.
  // Each blob is a flat [x0,y0,x1,y1,...] polygon traced with rounded corners.
  // ---------------------------------------------------------------------------
  function makeBlob(rnd, cx, cy, r, n) {
    const pts = new Float64Array(n * 2), a0 = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (rnd() - 0.5) * 0.5;
      const rr = r * (0.8 + rnd() * 0.3);
      pts[i * 2] = cx + Math.cos(a) * rr;
      pts[i * 2 + 1] = cy + Math.sin(a) * rr * 0.9;
    }
    return pts;
  }
  const BODY_SPOTS = [], HEAD_SPOTS = [];
  (function buildSpots() {
    const rnd = mulberry32(20260929);
    const rows = [-10.2, -3.4, 3.2];
    for (let ri = 0; ri < rows.length; ri++) {
      for (let x = -21 + (ri % 2) * 4.2; x < 18; x += 8.4) {
        const cx = x + (rnd() - 0.5) * 2.2, cy = rows[ri] + (rnd() - 0.5) * 1.8;
        const ex = (cx - RIG.bcx) / RIG.brx, ey = (cy - RIG.bcy) / RIG.bry;
        if (ex * ex + ey * ey > 1.05) continue;           // outside the body (clip handles the rest)
        BODY_SPOTS.push(makeBlob(rnd, cx, cy, 3.4 + rnd() * 0.5, 7));
      }
    }
    HEAD_SPOTS.push(makeBlob(rnd, -6.2, -0.8, 2.7, 6));
    HEAD_SPOTS.push(makeBlob(rnd, -3.2, -5.6, 1.9, 6));
    HEAD_SPOTS.push(makeBlob(rnd, -7.4, 4.2, 1.6, 6));
  })();

  function traceBlob(ctx, pts) {
    const n = pts.length >> 1;
    ctx.moveTo((pts[(n - 1) * 2] + pts[0]) * 0.5, (pts[(n - 1) * 2 + 1] + pts[1]) * 0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) * 0.5, (pts[i * 2 + 1] + pts[j * 2 + 1]) * 0.5);
    }
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Gradients — created once (lazily, from whichever ctx draws first) in
  // body/head-local coordinates, then reused every frame.
  // ---------------------------------------------------------------------------
  const GR = { ok: false };
  function ensureGrads(ctx) {
    if (GR.ok) return;
    let gr = ctx.createRadialGradient(-8, -9, 1, -3, -3, 23);
    gr.addColorStop(0, '#ffe7ad'); gr.addColorStop(0.42, PAL.hide); gr.addColorStop(1, '#c27a26');
    GR.body = gr;
    gr = ctx.createRadialGradient(-3.5, -5, 0.5, 0, 0, 14.5);
    gr.addColorStop(0, '#ffe8b0'); gr.addColorStop(0.45, PAL.hide); gr.addColorStop(1, '#c98428');
    GR.head = gr;
    gr = ctx.createRadialGradient(8, 0.5, 0.5, 9, 3.2, 8.5);
    gr.addColorStop(0, '#fff3d2'); gr.addColorStop(0.65, PAL.hideLight); gr.addColorStop(1, '#efbd66');
    GR.muzzle = gr;
    gr = ctx.createLinearGradient(0, 0, 0, 8);
    gr.addColorStop(0, 'rgba(255,226,162,0.95)'); gr.addColorStop(1, 'rgba(244,198,110,0.95)');
    GR.belly = gr;
    gr = ctx.createRadialGradient(6, -20, 4, 6, -20, 62);
    gr.addColorStop(0, 'rgba(255,196,120,' + K.AURA + ')');
    gr.addColorStop(0.5, 'rgba(255,170,90,' + (K.AURA * 0.4) + ')');
    gr.addColorStop(1, 'rgba(255,160,80,0)');
    GR.aura = gr;
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 72);
    gr.addColorStop(0, 'rgba(110,250,255,0.28)'); gr.addColorStop(0.6, 'rgba(80,220,255,0.08)'); gr.addColorStop(1, 'rgba(80,220,255,0)');
    GR.halo = gr;
    gr = ctx.createLinearGradient(0, 0, 1000, 0);
    gr.addColorStop(0, 'rgba(228,214,255,0.8)'); gr.addColorStop(0.6, 'rgba(210,190,255,0.35)'); gr.addColorStop(1, 'rgba(200,180,255,0.12)');
    GR.aim = gr;
    GR.ok = true;
  }

  // ---------------------------------------------------------------------------
  // Pose objects. A pose holds everything drawFigure needs; the in-game one
  // (A) also carries the spring velocities. computeRig() derives neck/head/mouth.
  // ---------------------------------------------------------------------------
  function makePose() {
    return {
      rot: 0, fx: 1, fs: 1, sqx: 1, sqy: 1, S: 1,
      phi: new Float64Array(4), knee: new Float64Array(4),
      tail: TAIL_REST, ear: EAR_REST, neckLean: 0, scrunch: 1, headAng: RIG.headRest,
      eye: EYE_NORMAL, blink: 0, lookX: 1, lookY: 0, mouth: MOUTH_SMILE, jaw: 0, leaf: 0,
      Tx: 0, Ty: 0, Hx: 0, Hy: 0, Mx: 0, My: 0, Cx: 0, Cy: 0,
    };
  }

  function computeRig(P) {
    const b0x = RIG.neckB0[0], b0y = RIG.neckB0[1];
    const dx = RIG.neckT[0] - b0x, dy = RIG.neckT[1] - b0y;
    const c = Math.cos(P.neckLean), s = Math.sin(P.neckLean), k = P.scrunch;
    P.Tx = b0x + (dx * c - dy * s) * k;
    P.Ty = b0y + (dx * s + dy * c) * k;
    const ch = Math.cos(P.headAng), sh = Math.sin(P.headAng);
    const ax = RIG.headAttach[0], ay = RIG.headAttach[1];
    P.Hx = P.Tx - (ax * ch - ay * sh);
    P.Hy = P.Ty - (ax * sh + ay * ch);
    const mx = RIG.mouth[0], my = RIG.mouth[1];
    P.Mx = P.Hx + mx * ch - my * sh;
    P.My = P.Hy + mx * sh + my * ch;
  }

  // Body-local point → outer (world or screen) coords under a pose placed at
  // (ox, oy). Mirrors applyXform exactly. Result in _wx/_wy.
  let _wx = 0, _wy = 0;
  function localToOuter(P, lx, ly, ox, oy) {
    const S = P.S, gy = RIG.groundY * S;
    const x1 = lx * S * P.fx * P.sqx;
    const y1 = (ly * S - gy) * P.sqy + gy;
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    _wx = ox + x1 * c - y1 * s;
    _wy = oy + x1 * s + y1 * c;
  }
  function applyXform(ctx, P, ox, oy) {
    const S = P.S, gy = RIG.groundY * S;
    ctx.translate(ox, oy);
    if (P.rot) ctx.rotate(P.rot);
    ctx.translate(0, gy);
    ctx.scale(P.sqx, P.sqy);
    ctx.translate(0, -gy);
    ctx.scale(S * P.fx, S);
  }

  // ---------------------------------------------------------------------------
  // Figure drawing (body-local coordinates; caller applies the transform and
  // wraps in save/restore).
  // ---------------------------------------------------------------------------
  function drawLeg(ctx, P, i, near) {
    const h = RIG.hips[i], hx = h[0], hy = h[1];
    const phi = P.phi[i], kn = P.knee[i];
    const bend = i < 2 ? -1 : 1;                 // front knees fold back, hocks fold forward
    const kx = hx + Math.sin(phi) * RIG.legL1, ky = hy + Math.cos(phi) * RIG.legL1;
    const a2 = phi + bend * kn;
    const dx = Math.sin(a2), dy = Math.cos(a2);
    const fx = kx + dx * RIG.legL2, fy = ky + dy * RIG.legL2;
    const w = RIG.legW;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
    ctx.strokeStyle = OUT; ctx.lineWidth = w + K.OUTLINE_W * 2; ctx.stroke();
    ctx.strokeStyle = near ? PAL.hide : K.FAR_TINT; ctx.lineWidth = w; ctx.stroke();
    if (near) {
      // soft plush sheen down the lit (back) side of the leg
      const o = w * 0.22;
      ctx.beginPath();
      ctx.moveTo(hx - Math.cos(phi) * o, hy + Math.sin(phi) * o);
      ctx.lineTo(kx - Math.cos(phi) * o, ky + Math.sin(phi) * o);
      ctx.lineTo(kx - dy * o + dx * 2.3, ky + dx * o + dy * 2.3);
      ctx.strokeStyle = 'rgba(255,232,172,0.55)'; ctx.lineWidth = w * 0.28; ctx.stroke();
    }
    // hoof: a dark band + the round bottom cap
    const r = w * 0.5, band = 1.9;
    const px = dy, py = -dx;                     // perpendicular to the lower leg
    const da = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(fx - dx * band + px * r, fy - dy * band + py * r);
    ctx.lineTo(fx + px * r, fy + py * r);
    ctx.arc(fx, fy, r, da - Math.PI / 2, da + Math.PI / 2, false);
    ctx.lineTo(fx - dx * band - px * r, fy - dy * band - py * r);
    ctx.closePath();
    ctx.fillStyle = PAL.hoof; ctx.fill();
  }

  function drawTail(ctx, P) {
    const rx = RIG.tailRoot[0], ry = RIG.tailRoot[1], L = RIG.tailLen;
    const a = P.tail, ca = Math.cos(a), sa = Math.sin(a);
    const ex = rx + ca * L, ey = ry + sa * L;
    const cx = rx + Math.cos(a - 0.4) * L * 0.55, cy = ry + Math.sin(a - 0.4) * L * 0.55;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.1 + K.OUTLINE_W * 2; ctx.stroke();
    ctx.strokeStyle = PAL.hide; ctx.lineWidth = 2.1; ctx.stroke();
    // the tuft: a dark teardrop
    ctx.beginPath(); ctx.ellipse(ex + ca * 2.2, ey + sa * 2.2, 3.6, 2.4, a, 0, TAU);
    ctx.fillStyle = PAL.spotsDark; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
  }

  function drawBody(ctx) {
    ctx.beginPath(); ctx.ellipse(RIG.bcx, RIG.bcy, RIG.brx, RIG.bry, 0, 0, TAU);
    ctx.fillStyle = GR.body; ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < BODY_SPOTS.length; i++) traceBlob(ctx, BODY_SPOTS[i]);
    ctx.fillStyle = PAL.spots; ctx.fill();
    ctx.strokeStyle = PAL.spotsDark; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-1, 5, 13, 4.6, 0, 0, TAU);
    ctx.fillStyle = GR.belly; ctx.fill();
    ctx.beginPath(); ctx.ellipse(RIG.bcx, RIG.bcy, RIG.brx - 1.3, RIG.bry - 1.3, 0, 1.75, 3.45);
    ctx.strokeStyle = K.RIM; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(RIG.bcx, RIG.bcy, RIG.brx, RIG.bry, 0, 0, TAU);
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
  }

  // Point on the neck centre quadratic (B0 → C → T) at s; result in _qx/_qy.
  let _qx = 0, _qy = 0;
  function neckAt(P, s) {
    const u = 1 - s, b0x = RIG.neckB0[0], b0y = RIG.neckB0[1];
    _qx = u * u * b0x + 2 * u * s * P.Cx + s * s * P.Tx;
    _qy = u * u * b0y + 2 * u * s * P.Cy + s * s * P.Ty;
  }
  const NECK_SPOTS = [[0.3, 1.3, 3.3, 2.5], [0.5, -1.4, 3.1, 2.3], [0.69, 1.0, 2.8, 2.1], [0.86, -0.8, 2.3, 1.8]];

  function drawNeck(ctx, P) {
    const b0x = RIG.neckB0[0], b0y = RIG.neckB0[1];
    let dx = P.Tx - b0x, dy = P.Ty - b0y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const nbx = dy, nby = -dx;                    // "back" normal (toward the mane side)
    P.Cx = (b0x + P.Tx) * 0.5 + nbx * RIG.neckBow;
    P.Cy = (b0y + P.Ty) * 0.5 + nby * RIG.neckBow;
    let tx = P.Tx - P.Cx, ty = P.Ty - P.Cy;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const ntx = ty, nty = -tx;                    // back normal at the top
    const hw = RIG.neckTopHW, mw = RIG.neckMidHW;
    const pbx = RIG.neckPb[0], pby = RIG.neckPb[1], pfx = RIG.neckPf[0], pfy = RIG.neckPf[1];
    const cbx = P.Cx + nbx * mw, cby = P.Cy + nby * mw, cfx = P.Cx - nbx * mw, cfy = P.Cy - nby * mw;
    const tbx = P.Tx + ntx * hw, tby = P.Ty + nty * hw, tfx = P.Tx - ntx * hw, tfy = P.Ty - nty * hw;

    // mane: a dashed round-capped band just behind the back edge; the neck fill
    // then covers its inner half, leaving a row of little scalloped tufts.
    ctx.save();
    ctx.setLineDash(MANE_DASH);
    ctx.beginPath();
    ctx.moveTo(pbx + nbx * 0.6 + dx * 1.5, pby + nby * 0.6 + dy * 1.5);
    ctx.quadraticCurveTo(cbx + nbx * 1.5, cby + nby * 1.5, tbx + ntx * 1.3 - tx * 1.5, tby + nty * 1.3 - ty * 1.5);
    ctx.strokeStyle = OUT; ctx.lineWidth = 5.6; ctx.stroke();
    ctx.strokeStyle = PAL.mane; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.restore();

    // neck fill, closed along an arc just inside the body outline so it hides
    // the chest seam without flattening the body's shading/spots
    ctx.beginPath();
    ctx.moveTo(pbx, pby);
    ctx.quadraticCurveTo(cbx, cby, tbx, tby);
    ctx.lineTo(tfx, tfy);
    ctx.quadraticCurveTo(cfx, cfy, pfx, pfy);
    ctx.ellipse(RIG.bcx, RIG.bcy, RIG.brx - 0.9, RIG.bry - 0.9, 0, NECK_ARC_F, NECK_ARC_B, true);
    ctx.closePath();
    ctx.fillStyle = PAL.hide; ctx.fill();

    // soft plush sheen down the neck (sub-curve s∈[0.2, 0.85] via blossoming)
    const a = 0.2, b = 0.85;
    const ob = 1.7;
    const s0x = (1 - a) * (1 - a) * b0x + 2 * (1 - a) * a * P.Cx + a * a * P.Tx;
    const s0y = (1 - a) * (1 - a) * b0y + 2 * (1 - a) * a * P.Cy + a * a * P.Ty;
    const s1x = (1 - b) * (1 - b) * b0x + 2 * (1 - b) * b * P.Cx + b * b * P.Tx;
    const s1y = (1 - b) * (1 - b) * b0y + 2 * (1 - b) * b * P.Cy + b * b * P.Ty;
    const kcx = (1 - a) * (1 - b) * b0x + ((1 - a) * b + a * (1 - b)) * P.Cx + a * b * P.Tx;
    const kcy = (1 - a) * (1 - b) * b0y + ((1 - a) * b + a * (1 - b)) * P.Cy + a * b * P.Ty;
    ctx.beginPath();
    ctx.moveTo(s0x + nbx * ob, s0y + nby * ob);
    ctx.quadraticCurveTo(kcx + nbx * ob, kcy + nby * ob, s1x + nbx * ob, s1y + nby * ob);
    ctx.strokeStyle = 'rgba(255,228,160,0.6)'; ctx.lineWidth = 2.4; ctx.stroke();

    // neck patches, following the bend
    const spotAng = Math.atan2(dy, dx);
    ctx.beginPath();
    for (let i = 0; i < NECK_SPOTS.length; i++) {
      const q = NECK_SPOTS[i];
      neckAt(P, q[0]);
      const px = _qx + nbx * q[1], py = _qy + nby * q[1];
      ctx.moveTo(px + Math.cos(spotAng) * q[2], py + Math.sin(spotAng) * q[2]);
      ctx.ellipse(px, py, q[2], q[3], spotAng, 0, TAU);
    }
    ctx.fillStyle = PAL.spots; ctx.fill();

    // side outlines only (their feet sit on the body outline → seamless chest)
    ctx.beginPath();
    ctx.moveTo(pbx, pby); ctx.quadraticCurveTo(cbx, cby, tbx, tby);
    ctx.moveTo(pfx, pfy); ctx.quadraticCurveTo(cfx, cfy, tfx, tfy);
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
    // cool rim light just inside the front edge of the neck
    ctx.beginPath();
    ctx.moveTo(pfx + nbx * 1.1, pfy + nby * 1.1);
    ctx.quadraticCurveTo(cfx + nbx * 1.1, cfy + nby * 1.1, tfx + ntx * 1.1, tfy + nty * 1.1);
    ctx.strokeStyle = K.RIM; ctx.lineWidth = 1.0; ctx.stroke();
  }
  // Round-capped dashes whose caps overlap → a scalloped row of mane tufts.
  const MANE_DASH = [0.6, 4.4];
  // Ellipse parameters of the neck's two feet on the body outline (for the fill's closing arc).
  const NECK_ARC_F = Math.atan2((RIG.neckPf[1] - RIG.bcy) / RIG.bry, (RIG.neckPf[0] - RIG.bcx) / RIG.brx);
  const NECK_ARC_B = Math.atan2((RIG.neckPb[1] - RIG.bcy) / RIG.bry, (RIG.neckPb[0] - RIG.bcx) / RIG.brx);

  function drawEar(ctx, rx, ry, ang, near) {
    const c = Math.cos(ang), s = Math.sin(ang);
    ctx.beginPath(); ctx.ellipse(rx + c * 6.1, ry + s * 6.1, 7.1, 3.1, ang, 0, TAU);
    ctx.fillStyle = near ? PAL.hide : K.FAR_TINT; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(rx + c * 6.8, ry + s * 6.8, 4.8, 1.4, ang, 0, TAU);
    ctx.fillStyle = near ? '#f09a86' : '#cf7c6a'; ctx.fill();
  }

  function drawEye(ctx, P) {
    const ex = 2.6, ey = -2.6, mode = P.eye;
    ctx.strokeStyle = OUT;
    if (mode === EYE_HAPPY || mode === EYE_JOY) {
      // happy closed "∩" with two lashes
      ctx.beginPath();
      ctx.moveTo(ex - 3.7, ey + 1.3); ctx.quadraticCurveTo(ex, ey - 4.0, ex + 3.7, ey + 1.3);
      ctx.moveTo(ex - 2.7, ey - 0.9); ctx.lineTo(ex - 4.9, ey - 2.4);
      ctx.moveTo(ex - 1.0, ey - 1.6); ctx.lineTo(ex - 2.0, ey - 3.9);
      ctx.lineWidth = 1.7; ctx.stroke();
      return;
    }
    if (mode === EYE_OUCH) {
      // wince ">" squeezed shut
      ctx.beginPath();
      ctx.moveTo(ex - 2.8, ey - 3.4); ctx.lineTo(ex + 2.6, ey - 0.6); ctx.lineTo(ex - 2.8, ey + 2.0);
      ctx.lineWidth = 1.7; ctx.stroke();
      return;
    }
    if (P.blink) {
      // relaxed closed lid "‿" with lashes
      ctx.beginPath();
      ctx.moveTo(ex - 3.9, ey - 0.4); ctx.quadraticCurveTo(ex, ey + 3.0, ex + 3.9, ey - 0.4);
      ctx.moveTo(ex - 2.9, ey + 0.9); ctx.lineTo(ex - 4.8, ey + 2.4);
      ctx.moveTo(ex - 1.1, ey + 1.5); ctx.lineTo(ex - 1.9, ey + 3.5);
      ctx.lineWidth = 1.6; ctx.stroke();
      return;
    }
    const wide = mode === EYE_WIDE;
    const rx = wide ? 4.9 : 4.2, ry = wide ? 5.5 : 4.8;
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.lineWidth = 1.1; ctx.stroke();
    const ir = wide ? 1.7 : 3.2;
    const lk = wide ? 1.9 : 0.75;
    const ix = ex + 0.3 + P.lookX * lk, iy = ey + 0.5 + P.lookY * lk;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU);
    ctx.fillStyle = '#4e2810'; ctx.fill();
    ctx.beginPath(); ctx.arc(ix + 0.2, iy + 0.25, ir * 0.62, 0, TAU);
    ctx.fillStyle = '#140904'; ctx.fill();
    // big shiny highlight + a small sparkle
    const hr = Math.max(0.5, ir * 0.4);
    ctx.beginPath();
    ctx.arc(ix - ir * 0.36, iy - ir * 0.42, hr, 0, TAU);
    ctx.moveTo(ix + ir * 0.42 + hr * 0.45, iy + ir * 0.4);
    ctx.arc(ix + ir * 0.42, iy + ir * 0.4, hr * 0.45, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    // upper lid line + lashes (+ raised brow when startled)
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.moveTo(ex - rx * 0.72, ey - ry * 0.62); ctx.lineTo(ex - rx * 1.2, ey - ry * 0.95);
    ctx.moveTo(ex - rx * 0.3, ey - ry * 0.9); ctx.lineTo(ex - rx * 0.5, ey - ry * 1.35);
    ctx.moveTo(ex + rx * 0.2, ey - ry * 0.97); ctx.lineTo(ex + rx * 0.22, ey - ry * 1.38);
    if (wide) { ctx.moveTo(ex - 3.2, ey - 8.4); ctx.quadraticCurveTo(ex, ey - 10.6, ex + 3.2, ey - 8.6); }
    ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawLeaf(ctx, x, y, ang, sz) {
    ctx.beginPath(); ctx.ellipse(x, y, 4.4 * sz, 2.2 * sz, ang, 0, TAU);
    ctx.fillStyle = PAL.leaf; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * 4 * sz, y - Math.sin(ang) * 4 * sz);
    ctx.lineTo(x + Math.cos(ang) * 4 * sz, y + Math.sin(ang) * 4 * sz);
    ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 0.7 * sz; ctx.stroke();
  }

  function drawHead(ctx, P) {
    ctx.save();
    ctx.translate(P.Hx, P.Hy);
    ctx.rotate(P.headAng);
    // far ear (behind the skull)
    drawEar(ctx, -2.8, -7.4, P.ear + 0.55, false);
    // ossicones (bases hidden by the skull) + dark tufts
    ctx.beginPath();
    ctx.moveTo(-4, -6.5); ctx.lineTo(-5.6, -13.6);
    ctx.moveTo(1.4, -7.5); ctx.lineTo(0.6, -14.6);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.9 + K.OUTLINE_W * 2; ctx.stroke();
    ctx.strokeStyle = PAL.hide; ctx.lineWidth = 2.9; ctx.stroke();
    ctx.beginPath();
    ctx.arc(-5.7, -14.2, 2.45, 0, TAU);
    ctx.moveTo(0.6 + 2.45, -15.2);
    ctx.arc(0.6, -15.2, 2.45, 0, TAU);
    ctx.fillStyle = PAL.spotsDark; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    // skull
    ctx.beginPath(); ctx.ellipse(0, 0, 11.5, 9.5, 0, 0, TAU);
    ctx.fillStyle = GR.head; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < HEAD_SPOTS.length; i++) traceBlob(ctx, HEAD_SPOTS[i]);
    ctx.fillStyle = PAL.spots; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 10.3, 8.3, 0, 1.9, 3.35);
    ctx.strokeStyle = K.RIM; ctx.lineWidth = 1.1; ctx.stroke();
    // mouth interior (visible when the jaw drops) → chin → muzzle
    const jaw = P.jaw;
    if (jaw > 0.04) {
      ctx.beginPath(); ctx.ellipse(12.4, 7.6, 3.9, 0.5 + jaw * 1.8, 0, 0, TAU);
      ctx.fillStyle = '#3b0f18'; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(10.8, 7.8 + jaw * 1.8, 5, 2.5, 0.08, 0, TAU);
    ctx.fillStyle = '#f7c774'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(9, 3.2, 7.3, 5.6, 0, 0, TAU);
    ctx.fillStyle = GR.muzzle; ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, 3.2, 7.3, 5.6, 0, -1.75, 1.95);
    ctx.strokeStyle = OUT; ctx.lineWidth = K.OUTLINE_W; ctx.stroke();
    // nostril + blush
    ctx.beginPath(); ctx.ellipse(13.7, 0.7, 1.15, 0.75, 0.5, 0, TAU);
    ctx.fillStyle = '#6a2f12'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(5.2, 4.7, 2.8, 1.7, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,118,108,0.4)'; ctx.fill();
    // mouth
    const m = P.mouth;
    if (m === MOUTH_OPEN) {
      ctx.beginPath(); ctx.ellipse(14.2, 6.9, 2.5, 1.2 + jaw * 1.4, 0.15, 0, TAU);
      ctx.fillStyle = '#3b0f18'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(14.7, 7.4 + jaw * 0.5, 1.9, 1.05, 0.15, 0, TAU);
      ctx.fillStyle = PAL.tongue; ctx.fill();
    } else if (m === MOUTH_GRIN) {
      ctx.beginPath();
      ctx.moveTo(9.2, 6.3); ctx.quadraticCurveTo(12.8, 12.2, 16.1, 5.7); ctx.quadraticCurveTo(12.8, 7.7, 9.2, 6.3);
      ctx.fillStyle = '#5b1a22'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(12.9, 8.9, 2.0, 1.0, 0, 0, TAU);
      ctx.fillStyle = PAL.tongueHi; ctx.fill();
    } else if (m === MOUTH_O) {
      ctx.beginPath(); ctx.ellipse(13.7, 7.3, 1.5, 1.9, 0, 0, TAU);
      ctx.fillStyle = '#3b0f18'; ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
    } else if (m === MOUTH_CHEW) {
      ctx.beginPath(); ctx.moveTo(9.8, 7.5); ctx.quadraticCurveTo(12.6, 8.6 + jaw, 15.3, 6.6);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
      if (P.leaf > 0.02) drawLeaf(ctx, 16.6, 7.4 + jaw * 0.8, 0.5 + jaw * 0.3, 0.55 + 0.45 * P.leaf);
    } else {
      ctx.beginPath(); ctx.moveTo(10.2, 7.3); ctx.quadraticCurveTo(13, 8.9, 15.4, 6.4);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    }
    drawEye(ctx, P);
    // near ear on top
    drawEar(ctx, -6, -4.6, P.ear, true);
    ctx.restore();
  }

  // The whole giraffe, back to front. Transform already applied (body-local).
  function drawFigure(ctx, P) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // soft warm storybook glow so the plush pops off dark space
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = GR.aura;
    ctx.beginPath(); ctx.arc(6, -20, 62, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    drawLeg(ctx, P, 1, false);
    drawLeg(ctx, P, 3, false);
    drawTail(ctx, P);
    drawBody(ctx);
    drawLeg(ctx, P, 2, true);
    drawLeg(ctx, P, 0, true);
    drawNeck(ctx, P);
    drawHead(ctx, P);
  }

  // ---------------------------------------------------------------------------
  // The tongue — a tapered ribbon sampled along a (possibly sagging / wobbling
  // / curling) centre line, drawn with a few fills/strokes. Buffers are
  // preallocated; modulation parameters live in TP (no per-frame objects).
  // ---------------------------------------------------------------------------
  const TN = K.TONGUE_N;
  const TCX = new Float64Array(TN + 1), TCY = new Float64Array(TN + 1);
  const TLX = new Float64Array(TN + 1), TLY = new Float64Array(TN + 1);
  const TRX = new Float64Array(TN + 1), TRY = new Float64Array(TN + 1);
  const TP = { sag: 0, lat: 0, wobA: 0, wobPh: 0, waveA: 0, wavePh: 0, curl: 0, thin: 1 };
  let _tny = -1;   // y of the line's left normal (which side is "up")

  function resetTP() {
    TP.sag = 0; TP.lat = 0; TP.wobA = 0; TP.wobPh = 0; TP.waveA = 0; TP.wavePh = 0; TP.curl = 0; TP.thin = 1;
  }

  function buildTongue(ax, ay, bx, by, S) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    const inv = L > 1e-6 ? 1 / L : 0;
    const nx = L > 1e-6 ? -dy * inv : 0, ny = L > 1e-6 ? dx * inv : -1;
    _tny = ny;
    for (let i = 0; i <= TN; i++) {
      const s = i / TN, env = Math.sin(Math.PI * s), para = 4 * s * (1 - s);
      const off = TP.lat * para + TP.wobA * env * Math.sin(s * 13 - TP.wobPh) +
                  TP.waveA * env * Math.sin(s * 9 - TP.wavePh) + TP.curl * s * s;
      TCX[i] = ax + dx * s + nx * off;
      TCY[i] = ay + dy * s + ny * off + TP.sag * para;
    }
    const w0 = K.TONGUE_W0 * S * TP.thin, w1 = K.TONGUE_W1 * S * TP.thin;
    for (let i = 0; i <= TN; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < TN ? i + 1 : TN;
      let tx = TCX[i1] - TCX[i0], ty = TCY[i1] - TCY[i0];
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-6) { tx /= tl; ty /= tl; } else { tx = L > 1e-6 ? dx * inv : 1; ty = L > 1e-6 ? dy * inv : 0; }
      const hw = (w0 + (w1 - w0) * (i / TN)) * 0.5;
      TLX[i] = TCX[i] - ty * hw; TLY[i] = TCY[i] + tx * hw;
      TRX[i] = TCX[i] + ty * hw; TRY[i] = TCY[i] - tx * hw;
    }
  }

  // Outline + body + highlight stripe (+ a travelling stretchy sheen when taut).
  function drawRibbon(ctx, S, sheen) {
    ctx.beginPath();
    ctx.moveTo(TLX[0], TLY[0]);
    for (let i = 1; i <= TN; i++) ctx.lineTo(TLX[i], TLY[i]);
    for (let i = TN; i >= 0; i--) ctx.lineTo(TRX[i], TRY[i]);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = 2.2 * S; ctx.stroke();
    ctx.fillStyle = PAL.tongue; ctx.fill();
    const up = _tny <= 0;
    ctx.beginPath();
    for (let i = 1; i < TN - 1; i++) {
      const ex = up ? TLX[i] : TRX[i], ey = up ? TLY[i] : TRY[i];
      const x = TCX[i] + (ex - TCX[i]) * 0.45, y = TCY[i] + (ey - TCY[i]) * 0.45;
      if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const ga = clamp(fin(ctx.globalAlpha, 1), 0, 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = 1.5 * S * TP.thin;
    ctx.globalAlpha = ga * 0.8; ctx.stroke();
    if (sheen >= 0) {
      const k0 = 1 + Math.floor(clamp(sheen, 0, 0.999) * (TN - 5));
      ctx.beginPath();
      for (let i = k0; i <= k0 + 3; i++) {
        const ex = up ? TLX[i] : TRX[i], ey = up ? TLY[i] : TRY[i];
        const x = TCX[i] + (ex - TCX[i]) * 0.5, y = TCY[i] + (ey - TCY[i]) * 0.5;
        if (i === k0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(244,236,255,0.75)'; ctx.lineWidth = 1.1 * S;
      ctx.globalAlpha = ga; ctx.stroke();
    }
    ctx.globalAlpha = ga;
  }

  function drawTipBall(ctx, x, y, r, S) {
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
    ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = 2.2 * S; ctx.stroke();
    ctx.fillStyle = PAL.tongue; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.3, r * 0.32), 0, TAU);
    ctx.fillStyle = PAL.tongueHi; ctx.fill();
  }

  function hash(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

  // Sticky splat where the tongue is stuck: squishes flat on impact, with a
  // few slobber droplets (stable per attach — seeded from attachTime).
  function drawSplat(ctx, x, y, dirAng, S, age, seed) {
    const e = age >= 0 ? Math.max(0, 1 - age / 0.25) : 0;
    const rx = 6.2 * S * (1 + 0.45 * e), ry = 3.7 * S * (1 - 0.3 * e);
    const rot = dirAng + Math.PI / 2;
    const c = Math.cos(rot), s = Math.sin(rot), bx = Math.cos(dirAng), by = Math.sin(dirAng);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    const sd = fin(seed, 0) * 7.13;
    for (let i = 0; i < 3; i++) {
      const side = i === 1 ? -1 : 1;
      const along = side * rx * (0.8 + 0.5 * hash(sd + i));
      const back = (hash(sd + i + 10) - 0.2) * ry * 1.6;
      const dr = S * (1.1 + 1.1 * hash(sd + i + 20));
      const px = x + c * along - bx * back, py = y + s * along - by * back;
      ctx.moveTo(px + dr, py);
      ctx.arc(px, py, dr, 0, TAU);
    }
    ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = 2 * S; ctx.stroke();
    ctx.fillStyle = PAL.tongue; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - bx * ry * 0.3 - c * rx * 0.25, y - by * ry * 0.3 - s * rx * 0.25, rx * 0.35, ry * 0.3, rot, 0, TAU);
    ctx.fillStyle = 'rgba(200,180,255,0.6)'; ctx.fill();
  }

  // Tongue stuck to an anchor: taut (straight, stretchy sheen) or loose
  // (sagging and swaying), with a wobble wave right after it sticks.
  function drawAttachedTongue(ctx, r, mx, my, S, t) {
    const ax = r.x, ay = r.y;
    const L = Math.hypot(ax - mx, ay - my);
    resetTP();
    const slack = fin(r.slack, 0);
    const loose = !r.taut && slack > 0.5;
    if (loose) {
      TP.sag = Math.min(slack * K.SAG_PER_SLACK, L * 0.45 + 8);
      TP.lat = TP.sag * 0.18 * Math.sin(t * 2.6);
    }
    const age = t - fin(r.attachTime, -99);
    if (age >= 0 && age < K.WOBBLE_TIME) {
      const e = 1 - age / K.WOBBLE_TIME;
      TP.wobA = K.WOBBLE_AMP * S * e * e * Math.min(1, L / 120);
      TP.wobPh = age * 55;
    }
    const maxL = fin(r.maxLength, 970) || 970;
    TP.thin = loose ? 1 : 1 - 0.22 * clamp(L / maxL, 0, 1);
    buildTongue(mx, my, ax, ay, S);
    drawRibbon(ctx, S, loose ? -1 : (t * 0.9) % 1);
    drawSplat(ctx, ax, ay, Math.atan2(TCY[TN] - TCY[TN - 2], TCX[TN] - TCX[TN - 2]), S, age, r.attachTime);
  }

  // Tongue in flight: slight travelling wave, round sticky tip.
  function drawShootingTongue(ctx, r, p, mx, my, S, t) {
    let tx = fin(r.shootX, mx), ty = fin(r.shootY, my);
    const dm = Math.hypot(mx - p.x, my - p.y), dtp = Math.hypot(tx - p.x, ty - p.y);
    if (dtp < dm + 4) { tx = mx + fin(r.shootDX, 1) * 4 * S; ty = my + fin(r.shootDY, 0) * 4 * S; }
    resetTP();
    TP.waveA = 2.2 * S; TP.wavePh = t * 60;
    buildTongue(mx, my, tx, ty, S);
    drawRibbon(ctx, S, -1);
    drawTipBall(ctx, tx, ty, K.TONGUE_W1 * 0.78 * S, S);
  }

  const DBX = new Float64Array(64), DBY = new Float64Array(64);   // debris polyline scratch
  // Failed tongue: "miss" = flops back limp, still attached, retracting;
  // "cut" = a severed piece tumbling away + a sore little stub at the mouth.
  function drawFailedTongue(ctx, r, p, mx, my, S, attachedNow) {
    const segs = r.failedRopeSegments;
    if (!segs || segs.length < 2) return;
    const maxT = fin(r.failedRopeMaxTime, 0.8) || 0.8;
    const a = clamp(fin(r.failedRopeTimer, 0) / maxT, 0, 1);
    if (a <= 0.01) return;
    const n = segs.length;
    const md = Math.hypot(mx - p.x, my - p.y);
    let first = 0;
    while (first < n - 2 && Math.hypot(segs[first].x - p.x, segs[first].y - p.y) < md) first++;
    const cut = r.failedCause === 'cut';
    const connected = !cut && !attachedNow;
    const last = connected ? Math.min(n - 1, first + Math.ceil((n - 1 - first) * a)) : n - 1;
    ctx.save();
    ctx.globalAlpha = connected ? Math.min(1, a * 1.6) : a;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // gather the points, then trace a smooth curve through their midpoints
    // (the raw segments jitter independently and would read as a zigzag)
    let np = 0;
    if (connected) { DBX[0] = mx; DBY[0] = my; np = 1; }
    for (let i = first; i <= last && np < DBX.length; i++) {
      const sx = segs[i].x, sy = segs[i].y;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      DBX[np] = sx; DBY[np] = sy; np++;
    }
    if (np >= 2) {
      ctx.beginPath();
      ctx.moveTo(DBX[0], DBY[0]);
      for (let i = 1; i < np - 1; i++) ctx.quadraticCurveTo(DBX[i], DBY[i], (DBX[i] + DBX[i + 1]) * 0.5, (DBY[i] + DBY[i + 1]) * 0.5);
      ctx.lineTo(DBX[np - 1], DBY[np - 1]);
      ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = 7.4 * S; ctx.stroke();
      ctx.strokeStyle = PAL.tongue; ctx.lineWidth = 5.2 * S; ctx.stroke();
      ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = 1.4 * S; ctx.stroke();
    }
    if (cut && !attachedNow) {
      // stub: points toward where the piece went, shrinking back in
      let ddx = segs[first].x - mx, ddy = segs[first].y - my;
      const dl = Math.hypot(ddx, ddy);
      if (dl > 1e-3 && Number.isFinite(dl)) { ddx /= dl; ddy /= dl; } else { ddx = 1; ddy = 0; }
      const sl = 9 * S * a;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + ddx * sl, my + ddy * sl);
      ctx.strokeStyle = PAL.tongueDark; ctx.lineWidth = 7.4 * S; ctx.stroke();
      ctx.strokeStyle = PAL.tongue; ctx.lineWidth = 5.2 * S; ctx.stroke();
    }
    ctx.restore();
  }

  // Aim reticle: marching faded dots from the mouth to where the tongue would
  // stop (the physics ray runs from the COM), plus a small target marker.
  const AIM_DASH = [0.01, K.AIM_DOT_GAP];
  function drawReticle(ctx, g, p, r, mx, my, t) {
    const aim = g.aim;
    const ang = fin(aim.angle, -Math.PI / 2);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let D = fin(r.maxLength, 900);
    if (!g._padAiming && Number.isFinite(aim.worldX) && Number.isFinite(aim.worldY)) {
      D = Math.min(D, Math.hypot(aim.worldX - p.x, aim.worldY - p.y));
    }
    const tx = p.x + dx * D, ty = p.y + dy * D;
    const L = Math.hypot(tx - mx, ty - my);
    const cdDur = fin(r.cooldownDuration, 0.4) || 0.4;
    const cd = fin(r.cooldownTimer, 0) > 0 ? clamp(r.cooldownTimer / cdDur, 0, 1) : 0;
    ctx.save();
    ctx.globalAlpha = cd > 0 ? 0.38 : 1;
    if (L > 22) {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(ty - my, tx - mx));
      ctx.setLineDash(AIM_DASH);
      ctx.lineDashOffset = -((t * 26) % K.AIM_DOT_GAP);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = GR.aim;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(L - 11, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.translate(tx, ty);
    const spin = t * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(c * 9.5, s * 9.5); ctx.lineTo(c * 13, s * 13);
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(232,218,255,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU);
    ctx.fillStyle = 'rgba(255,245,255,0.9)'; ctx.fill();
    if (cd > 0) {
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(0, 0, 16, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd));
      ctx.strokeStyle = PAL.tongueHi; ctx.lineWidth = 2.4; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Victory munch: the tongue curls out to the Acacia's leaves, grabs one,
  // reels it in, and the giraffe chews happily. Shared by game + portrait.
  // ---------------------------------------------------------------------------
  const MU = { ext: 0, leafTip: 0, chew: 0, jaw: 0, leafMouth: 0 };
  function munchCycle(ts) {
    const per = K.MUNCH_PERIOD, u = (((ts % per) + per) % per) / per;
    MU.ext = 0; MU.leafTip = 0; MU.leafMouth = 0; MU.chew = 0;
    if (u < 0.26) MU.ext = smooth01(u / 0.26);
    else if (u < 0.4) { MU.ext = 1; MU.leafTip = u > 0.3 ? 1 : 0; }
    else if (u < 0.58) { MU.ext = 1 - smooth01((u - 0.4) / 0.18); MU.leafTip = 1; }
    else { MU.chew = 1; MU.leafMouth = clamp(1 - (u - 0.58) / 0.3, 0, 1); }
    MU.jaw = MU.ext > 0.02 ? 0.55 : 0.5 + 0.5 * Math.sin(ts * 12);
  }

  // Draw the curling munch tongue from the mouth toward (tx, ty) (call munchCycle first).
  function drawMunchTongue(ctx, mx, my, tx, ty, S, fs, ts) {
    if (MU.ext <= 0.02) return;
    const ex = mx + (tx - mx) * MU.ext, ey = my + (ty - my) * MU.ext;
    resetTP();
    TP.curl = -6 * fs * S * MU.ext;
    TP.thin = 0.9;
    TP.waveA = 1.2 * S; TP.wavePh = ts * 20;
    buildTongue(mx, my, ex, ey, S);
    drawRibbon(ctx, S, -1);
    const ang = Math.atan2(TCY[TN] - TCY[TN - 2], TCX[TN] - TCX[TN - 2]);
    drawTipBall(ctx, TCX[TN], TCY[TN], K.TONGUE_W1 * 0.7 * S, S);
    if (MU.leafTip) {
      ctx.save();
      ctx.translate(TCX[TN], TCY[TN]);
      ctx.scale(S, S);
      drawLeaf(ctx, Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, ang + 0.6, 1);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // In-game animation state (closure only). A is a pose + spring velocities.
  // ---------------------------------------------------------------------------
  const A = makePose();
  A.player = null; A.rotV = 0; A.fv = 1; A.faceT = 1; A.pvx = 0; A.pvy = 0; A.ax = 0; A.ay = 0;
  A.phiV = new Float64Array(4); A.tailV = 0; A.earV = 0; A.neckV = 0; A.headV = 0;
  A.sq = 0; A.sqV = 0; A.tuck = 0; A.ouch = 0; A.blinkT = 3; A.blinkLeft = 0; A.walk = 0;

  function scaleCfg() { return fin(ASCENT.CONFIG && ASCENT.CONFIG.GIRAFFE_SCALE, 1) || 1; }

  function resetAnim(g) {
    const p = g && g.player;
    A.player = p || null;
    A.rot = 0; A.rotV = 0;
    A.fv = p && p.facing < 0 ? -1 : 1;
    A.faceT = A.fv;
    A.pvx = p ? fin(p.vx, 0) : 0; A.pvy = p ? fin(p.vy, 0) : 0; A.ax = 0; A.ay = 0;
    for (let i = 0; i < 4; i++) { A.phi[i] = 0; A.phiV[i] = 0; A.knee[i] = 0; }
    A.tail = TAIL_REST; A.tailV = 0; A.ear = EAR_REST; A.earV = 0;
    A.neckLean = 0; A.neckV = 0; A.scrunch = 1; A.headAng = RIG.headRest; A.headV = 0;
    A.sq = 0; A.sqV = 0; A.tuck = 0; A.ouch = 0; A.blinkLeft = 0; A.walk = 0;
    A.eye = EYE_NORMAL; A.blink = 0; A.lookX = 1; A.lookY = 0; A.mouth = MOUTH_SMILE; A.jaw = 0; A.leaf = 0;
    A.S = scaleCfg(); A.fs = A.fv; A.fx = A.fv; A.sqx = 1; A.sqy = 1;
    computeRig(A);
  }

  // World direction → head-local look vector (pupils), under pose P.
  let _lx = 1, _ly = 0;
  function toHeadLocal(P, dx, dy) {
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const cr = Math.cos(P.rot), sr = Math.sin(P.rot);
    const bx = (dx * cr + dy * sr) * P.fs, by = -dx * sr + dy * cr;
    const ch = Math.cos(P.headAng), sh = Math.sin(P.headAng);
    _lx = bx * ch + by * sh; _ly = -bx * sh + by * ch;
  }

  function stepAnim(g, dt) {
    const p = g.player, r = g.rope;
    if (A.player !== p) resetAnim(g);
    const t = fin(g.time, 0);
    const S = A.S = scaleCfg();
    const vx = fin(p.vx, 0), vy = fin(p.vy, 0);

    // low-passed acceleration (a teleport's velocity jump is clamped)
    let rax = (vx - A.pvx) / dt, ray = (vy - A.pvy) / dt;
    A.pvx = vx; A.pvy = vy;
    const am = Math.hypot(rax, ray);
    if (am > 4000) { rax *= 4000 / am; ray *= 4000 / am; }
    const ka = 1 - Math.exp(-dt / 0.07);
    A.ax += (rax - A.ax) * ka; A.ay += (ray - A.ay) * ka;

    const speed = Math.hypot(vx, vy);
    const onGround = !!p.onGround;
    const goal = !!(g.goal && g.goal.reached);
    const active = !!r.active && !goal && Number.isFinite(r.x) && Number.isFinite(r.y);
    const shooting = !!r.shooting && !goal;
    const hang = active && !onGround;

    // facing flip: squash through a thin sliver instead of snapping. While
    // hanging, player.js flips facing whenever the anchor crosses 4px either
    // side — so a giraffe dangling almost straight down would flicker. The
    // hang pose works either way near vertical, so only turn once the anchor
    // is clearly on the other side (hysteresis band).
    let ft = p.facing < 0 ? -1 : 1;
    if (hang) {
      const hdx = r.x - p.x, hd = Math.hypot(hdx, r.y - p.y);
      if (hdx > K.HANG_TURN * hd) A.faceT = 1; else if (hdx < -K.HANG_TURN * hd) A.faceT = -1;
      ft = A.faceT;
    } else A.faceT = ft;
    const fstep = (2 * dt) / K.FLIP_TIME;
    A.fv = A.fv < ft ? Math.min(ft, A.fv + fstep) : Math.max(ft, A.fv - fstep);
    const fs = A.fv >= 0 ? 1 : -1;
    A.fs = fs; A.fx = fs * Math.max(0.2, Math.abs(A.fv));

    // apparent gravity (gravity − acceleration) in the flipped body frame:
    // what the dangly bits "feel" (zero in free fall → they float)
    const cr = Math.cos(A.rot), sr = Math.sin(A.rot);
    const grav = fin(g.gravity, 600);
    const gwx = -A.ax, gwy = grav - A.ay;
    const glx = (gwx * cr + gwy * sr) * fs, gly = -gwx * sr + gwy * cr;
    const gm = Math.hypot(glx, gly), wgt = clamp(gm / 500, 0, 1);
    const phiG = gm > 1e-3 ? Math.atan2(glx, gly) : 0;
    const alx = (A.ax * cr + A.ay * sr) * fs, aly = -A.ax * sr + A.ay * cr;
    const fall = clamp(fin(g.fallShake, 0), 0, 1);
    const wide = !goal && (fall > 0.3 || !!g.inGravityWell);
    const happy = !goal && (speed > K.HAPPY_SPEED || !!p.boosting);

    // timers
    A.tuck = Math.max(0, A.tuck - dt * 2.2);
    A.ouch = Math.max(0, A.ouch - dt);
    A.blinkLeft = Math.max(0, A.blinkLeft - dt);
    A.blinkT -= dt;
    if (A.blinkT <= 0) { A.blinkLeft = K.BLINK_DUR; A.blinkT = K.BLINK_MIN + blinkRnd() * (K.BLINK_MAX - K.BLINK_MIN); }
    if (onGround && Math.abs(vx) > 25) A.walk = (A.walk + Math.abs(vx) * dt / 5) % 6283.185;

    let ts = 0;
    if (goal) { ts = t - fin(g.goal.reachedAt, t); munchCycle(ts); }

    // ---- neck lean / scrunch, head nod ----
    let nt = clamp(-alx * 0.00022, -0.28, 0.28) + 0.05 * Math.sin(t * 1.3);
    if (shooting) nt += 0.16;
    if (goal) nt = 0.1 + 0.12 * MU.ext + 0.04 * Math.sin(t * 2.2);
    A.neckLean = spring(A.neckLean, A.neckV, nt, 9, 0.35, dt); A.neckV = _sv;
    let sct = 1;
    if (active) sct = clamp((Math.hypot(r.x - p.x, r.y - p.y) / S - 25) / 27, 0.45, 1);
    A.scrunch = ease(A.scrunch, sct, 12, dt);
    let hat = RIG.headRest + clamp(-aly * 0.00012, -0.25, 0.25) + 0.04 * Math.sin(t * 1.7 + 0.5);
    if (wide) hat -= 0.12;
    if (goal) hat = RIG.headRest - 0.12 + (MU.chew ? 0.05 * Math.sin(ts * 12) : -0.1 * MU.ext);
    A.headAng = spring(A.headAng, A.headV, hat, 12, 0.4, dt); A.headV = _sv;
    computeRig(A);

    // ---- whole-body orientation ----
    const mAng = Math.atan2(A.My, A.Mx * fs);
    let tgt, W = K.ROT_FREE;
    if (goal) tgt = -0.12 * fs + 0.05 * Math.sin(t * 2.2);
    else if (onGround) { tgt = 0; W = K.ROT_GROUND; }
    else if (hang) {
      // hang from the tongue: the mouth sits on the ray COM → anchor
      const dx = r.x - p.x, dy = r.y - p.y;
      tgt = dx * dx + dy * dy > 1 ? Math.atan2(dy, dx) - mAng : A.rot;
      W = K.ROT_HANG;
    } else if (shooting) {
      tgt = Math.atan2(fin(r.shootDY, -1), fin(r.shootDX, 0)) - mAng;
      W = K.ROT_SHOOT;
    } else if (g.debugFlying) tgt = 0.1 * fs * clamp(vx / 600, -1, 1);
    else {
      const rise = clamp(-vy / 500, 0, 1);
      const dive = smooth01((vy - K.DIVE_V0) / (K.DIVE_V1 - K.DIVE_V0));
      const lean = clamp((vx * fs) / 600, -1, 1);
      tgt = fs * (-K.RISE_TILT * rise + K.LEAN * lean + K.DIVE_MAX * dive);
    }
    tgt = A.rot + wrap(tgt - A.rot);
    A.rot = spring(A.rot, A.rotV, tgt, W[0], W[1], dt); A.rotV = _sv;
    if (A.rot > Math.PI) A.rot -= TAU; else if (A.rot < -Math.PI) A.rot += TAU;

    // ---- squash & stretch (landing jiggle, flip squash, idle breathing) ----
    A.sq = spring(A.sq, A.sqV, 0, 16, 0.3, dt); A.sqV = _sv;
    A.sq = clamp(A.sq, -0.5, 0.9);
    A.sqx = 1 + 0.12 * A.sq;
    A.sqy = (1 - 0.16 * A.sq) * (1 + 0.12 * (1 - Math.abs(A.fv))) * (onGround ? 1 + 0.012 * Math.sin(t * 2.4) : 1);

    // ---- legs: dangle toward apparent gravity, paddle, tuck, trot ----
    for (let i = 0; i < 4; i++) {
      let pt, kt, w = 13 + i * 1.2, z = K.LEG_Z;
      if (goal) {
        const ph = t * 5 + WALK_PH[i];
        pt = 0.25 * Math.sin(ph) - 0.15; kt = 0.3 + 0.25 * Math.sin(ph + 1);
      } else if (onGround) {
        w = 26; z = 0.9;
        if (Math.abs(vx) > 25) { const ph = A.walk + WALK_PH[i]; pt = 0.45 * Math.sin(ph); kt = 0.4 * Math.max(0, Math.sin(ph + 1.2)); }
        else { pt = 0; kt = 0; }
      } else {
        pt = clamp(phiG * K.LEG_FOLLOW, -1.3, 1.3) * wgt + (1 - wgt) * 0.3 * Math.sin(t * 2.1 + i * 1.7);
        kt = 0.1 + 0.25 * (1 - wgt);
        if (p.boosting) { const ph = t * 17 + WALK_PH[i]; pt += 0.55 * Math.sin(ph); kt += 0.45 + 0.45 * Math.sin(ph + 1.3); }
        if (fall > 0) pt += 0.45 * fall * Math.sin(t * 23 + i * 2.1);
        if (A.tuck > 0) { pt -= 0.35 * A.tuck; kt += 1.25 * A.tuck; }
      }
      A.phi[i] = clamp(spring(A.phi[i], A.phiV[i], pt, w, z, dt), -1.9, 1.9); A.phiV[i] = _sv;
      A.knee[i] = ease(A.knee[i], clamp(kt, 0, 1.6), 14, dt);
    }

    // ---- tail: lags toward apparent gravity, sways, wags when happy ----
    const gdir = gm > 1e-3 ? Math.atan2(gly, glx) : TAIL_REST;
    let tt = TAIL_REST + clamp(wrap(gdir - TAIL_REST) * 0.7, -1.1, 1.1) * wgt +
             0.22 * Math.sin(t * 2.3) + (1 - wgt) * 0.45 * Math.sin(t * 1.3);
    if (goal || happy) tt += 0.35 * Math.sin(t * 10);
    A.tail = clamp(spring(A.tail, A.tailV, clamp(tt, 1.1, 4.1), K.TAIL_W, K.TAIL_Z, dt), 0.9, 4.3); A.tailV = _sv;

    // ---- ears stream in the airflow ----
    toHeadLocal(A, speed > 1 ? -vx : -fs, speed > 1 ? -vy : 0);
    const drag = clamp(speed / 900, 0, 1) * 0.9;
    const dd = Math.atan2(_ly, _lx);
    let et = EAR_REST + clamp(wrap(dd - EAR_REST), -1.1, 1.1) * drag + 0.12 * Math.sin(t * 1.9);
    if (fall > 0) et += 0.25 * fall * Math.sin(t * 21);
    if (goal) et += 0.15 * Math.sin(t * 6);
    A.ear = spring(A.ear, A.earV, et, K.EAR_W, K.EAR_Z, dt); A.earV = _sv;

    // ---- face ----
    A.eye = goal ? EYE_JOY : A.ouch > 0 ? EYE_OUCH : wide ? EYE_WIDE : happy ? EYE_HAPPY : EYE_NORMAL;
    A.blink = A.blinkLeft > 0 && A.eye === EYE_NORMAL ? 1 : 0;
    let jt = 0;
    A.leaf = 0;
    if (goal) { A.mouth = MU.ext > 0.02 ? MOUTH_OPEN : MOUTH_CHEW; jt = MU.jaw; A.leaf = MU.leafMouth; }
    else if (active || shooting || A.ouch > 0) { A.mouth = MOUTH_OPEN; jt = 0.55; }
    else if (wide) { A.mouth = MOUTH_O; jt = 0.45; }
    else if (happy) { A.mouth = MOUTH_GRIN; jt = 0.2; }
    else A.mouth = MOUTH_SMILE;
    A.jaw = goal ? jt : ease(A.jaw, jt, 22, dt);

    // pupils look at what matters: anchor / shot / aim / travel
    let ldx, ldy;
    if (goal) { ldx = fin(g.goal.x, p.x) - p.x; ldy = fin(g.goal.y, p.y) - p.y; }
    else if (active) { ldx = r.x - p.x; ldy = r.y - p.y; }
    else if (shooting) { ldx = fin(r.shootDX, fs); ldy = fin(r.shootDY, 0); }
    else if (g.aim && g.aim.visible) { const aa = fin(g.aim.angle, 0); ldx = Math.cos(aa); ldy = Math.sin(aa); }
    else if (speed > 40) { ldx = vx; ldy = vy; }
    else { ldx = fs; ldy = 0.25; }
    toHeadLocal(A, ldx, ldy);
    A.lookX = ease(A.lookX, _lx, 10, dt); A.lookY = ease(A.lookY, _ly, 10, dt);
  }

  function onFx(type, d) {
    if (type === 'jump') A.tuck = 1;
    else if (type === 'land') A.sq = clamp(fin(d && d.speed, 0) / 900, 0, 0.85);
    else if (type === 'tongueCut') A.ouch = K.OUCH_TIME;
    else if (type === 'tongueAttach') A.headV -= 3;
    else if (type === 'boost') A.sq = Math.min(A.sq, -0.25);
    else if (type === 'respawn' || type === 'runStart') A.player = null;   // re-snap next frame
  }

  const NO_ROPE = { active: false, shooting: false, failedRopeTimer: 0, failedRopeSegments: [] };
  const NO_OPTS = {};
  const Q = makePose();   // portrait pose (menus)
  let hooked = false;

  ASCENT.Giraffe = {
    K,

    init(g) {
      if (!hooked && ASCENT.FX && ASCENT.FX.on) { ASCENT.FX.on(onFx); hooked = true; }
      if (ASCENT.Gfx && ASCENT.Gfx.ctx) ensureGrads(ASCENT.Gfx.ctx);
      A.player = null;
    },

    // GPU context restored (main.js). This style owns no offscreen canvases;
    // its only cache is the gradient set made from the main context, so drop
    // it and re-create it from the restored one (or lazily on the next draw).
    // Safe before init and when called repeatedly; the pose is left alone.
    rebuild(_g) {
      GR.ok = false;
      if (ASCENT.Gfx && ASCENT.Gfx.ctx) ensureGrads(ASCENT.Gfx.ctx);
    },

    update(g, dt) {
      const p = g && g.player;
      if (!p || !g.rope || !(dt > 0)) return;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      stepAnim(g, Math.min(dt, 0.05));
    },

    draw(ctx, g) {
      const p = g && g.player;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const r = g.rope || NO_ROPE;
      ensureGrads(ctx);
      if (A.player !== p) resetAnim(g);
      const t = fin(g.time, 0), S = A.S;
      const goal = !!(g.goal && g.goal.reached);
      localToOuter(A, A.Mx, A.My, p.x, p.y);
      const mx = _wx, my = _wy;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      if (g.debugFlying) {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.scale(S, S);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = GR.halo;
        ctx.beginPath(); ctx.arc(0, 0, 72, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // tongue first, so it slides out from under the muzzle
      const attached = !goal && !!r.active && Number.isFinite(r.x) && Number.isFinite(r.y);
      if (fin(r.failedRopeTimer, 0) > 0) drawFailedTongue(ctx, r, p, mx, my, S, attached || (!goal && !!r.shooting));
      if (goal) {
        const gr = fin(g.goal.radius, 40);
        munchCycle(t - fin(g.goal.reachedAt, t));
        drawMunchTongue(ctx, mx, my, fin(g.goal.x, p.x) - A.fs * gr * 0.35, fin(g.goal.y, p.y) + gr * 0.15, S, A.fs, t);
      } else if (attached) drawAttachedTongue(ctx, r, mx, my, S, t);
      else if (r.shooting) drawShootingTongue(ctx, r, p, mx, my, S, t);

      ctx.save();
      applyXform(ctx, A, p.x, p.y);
      drawFigure(ctx, A);
      ctx.restore();

      if (g.state === 'playing' && !goal && g.aim && g.aim.visible && !r.active && !r.shooting) {
        drawReticle(ctx, g, p, r, mx, my, t);
      }
      ctx.restore();
    },

    // Menu / title portrait in screen space. (x, y) = the figure's visual centre.
    drawPortrait(ctx, x, y, scale, t, opts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      ensureGrads(ctx);
      const o = opts || NO_OPTS;
      const pose = o.pose === 'lick' || o.pose === 'munch' ? o.pose : 'float';
      const fs = o.facing < 0 ? -1 : 1;
      const S = Math.max(0.05, fin(scale, 1)) * scaleCfg();
      t = fin(t, 0);
      const tt = o.tongueTo && Number.isFinite(o.tongueTo.x) && Number.isFinite(o.tongueTo.y) ? o.tongueTo : null;

      Q.S = S; Q.fs = fs; Q.fx = fs; Q.sqx = 1; Q.sqy = 1 + 0.015 * Math.sin(t * 2.4);
      for (let i = 0; i < 4; i++) {
        const ph = t * 1.8 + i * 1.3;
        Q.phi[i] = 0.28 * Math.sin(ph) - 0.12;
        Q.knee[i] = 0.25 + 0.2 * Math.sin(ph + 1);
      }
      Q.tail = TAIL_REST + 0.3 * Math.sin(t * 1.6);
      Q.ear = EAR_REST + 0.15 * Math.sin(t * 1.9);
      Q.neckLean = 0.06 * Math.sin(t * 1.1);
      Q.scrunch = 1;
      Q.headAng = RIG.headRest + 0.05 * Math.sin(t * 1.3 + 0.7);
      Q.eye = EYE_NORMAL;
      Q.blink = (((t % 3.7) + 3.7) % 3.7) < K.BLINK_DUR ? 1 : 0;
      Q.lookX = 0.35; Q.lookY = 0.25;
      Q.mouth = MOUTH_SMILE; Q.jaw = 0; Q.leaf = 0;

      let rot = 0.1 * Math.sin(t * 0.9) - 0.06 * fs;
      if (pose === 'munch') {
        munchCycle(t);
        Q.eye = EYE_JOY;
        const out = tt && MU.ext > 0.02;
        Q.mouth = out ? MOUTH_OPEN : MOUTH_CHEW;
        Q.jaw = MU.jaw;
        Q.leaf = tt ? MU.leafMouth : 0.5 + 0.5 * MU.leafMouth;
        Q.tail += 0.35 * Math.sin(t * 10);
        Q.ear += 0.15 * Math.sin(t * 6);
        Q.headAng = RIG.headRest - 0.12 + (MU.chew ? 0.05 * Math.sin(t * 12) : -0.1 * MU.ext);
        for (let i = 0; i < 4; i++) { const ph = t * 5 + WALK_PH[i]; Q.phi[i] = 0.25 * Math.sin(ph) - 0.15; Q.knee[i] = 0.3 + 0.25 * Math.sin(ph + 1); }
        rot = -0.1 * fs + 0.04 * Math.sin(t * 2.2);
      } else if (pose === 'lick') {
        Q.mouth = MOUTH_OPEN; Q.jaw = 0.55;
        Q.tail += 0.25 * Math.sin(t * 7);
      }
      computeRig(Q);

      // (x, y) is the visual centre: the figure's bbox middle is ≈ local (7, -22)
      const cx = x - 7 * S * fs, cy = y + 22 * S;
      if (pose === 'lick' && tt) {
        const full = Math.atan2(tt.y - cy, tt.x - cx) - Math.atan2(Q.My, Q.Mx * fs);
        rot = wrap(full) * 0.8 + 0.04 * Math.sin(t * 1.7);
      }
      if (Number.isFinite(o.bodyAngle)) rot = o.bodyAngle;
      Q.rot = rot;
      localToOuter(Q, Q.Mx, Q.My, cx, cy);
      const mx = _wx, my = _wy;
      if (tt) { toHeadLocal(Q, tt.x - mx, tt.y - my); Q.lookX = _lx; Q.lookY = _ly; }

      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (pose === 'lick') {
        if (tt) {
          resetTP();
          const L = Math.hypot(tt.x - mx, tt.y - my);
          TP.wobA = Math.min(1, L / 150) * 1.4 * S * Math.sin(t * 2.3);
          TP.wobPh = t * 3;
          TP.sag = Math.min(L * 0.08, 14 * S) * (0.6 + 0.4 * Math.sin(t * 1.4));
          buildTongue(mx, my, tt.x, tt.y, S);
          drawRibbon(ctx, S, (t * 0.6) % 1);
          drawSplat(ctx, tt.x, tt.y, Math.atan2(TCY[TN] - TCY[TN - 2], TCX[TN] - TCX[TN - 2]), S, 1, 0.37);
        } else {
          // a cheeky "blep": short tongue flopping out of the mouth
          localToOuter(Q, Q.Mx + 7 + Math.sin(t * 3) * 0.8, Q.My + 5.5, cx, cy);
          resetTP(); TP.sag = 2.5 * S; TP.thin = 0.85;
          buildTongue(mx, my, _wx, _wy, S);
          drawRibbon(ctx, S, -1);
          drawTipBall(ctx, _wx, _wy, K.TONGUE_W1 * 0.62 * S, S);
        }
      } else if (pose === 'munch' && tt) {
        drawMunchTongue(ctx, mx, my, tt.x, tt.y, S, fs, t);
      }
      ctx.save();
      applyXform(ctx, Q, cx, cy);
      drawFigure(ctx, Q);
      ctx.restore();
      ctx.restore();
    },

    // World position of the mouth (fresh object each call).
    mouthPos(g) {
      const p = g && g.player;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: 0, y: 0 };
      if (A.player !== p) resetAnim(g);
      localToOuter(A, A.Mx, A.My, p.x, p.y);
      return { x: _wx, y: _wy };
    },
  };
})();

// Register as a selectable giraffe style (see giraffe.js, the dispatcher).
(ASCENT.GiraffeSkins = ASCENT.GiraffeSkins || {}).plush = ASCENT.Giraffe;
