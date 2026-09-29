/*
 * GIRAFFE STYLE: NATURALIST (design B) — "sleek naturalist illustration"
 * =====================================================
 * The star of Cosmic Giraffe: a real-proportioned giraffe (long legs, back
 * sloping from high withers to a lower rump, long bending neck, small head)
 * drawn as crisp flat-vector illustration: a warm coat, a seeded reticulated
 * patch pattern (Voronoi polygons with cut corners, cream-gold gaps), a few
 * layered tone shapes for shading, and a faint cool rim light from space.
 * The comedy comes from the absurd dark-violet tongue and the expressions.
 *
 * API (ASCENT.Giraffe):
 *   init(g)            build geometry + glow sprites, subscribe to FX events
 *   update(g, dt)      springs / secondary motion (called while playing)
 *   draw(ctx, g)       tongue + giraffe + aim reticle, in WORLD coords
 *   drawPortrait(ctx, x, y, scale, t, opts)
 *                      screen-space giraffe for menus; (x, y) = the giraffe's
 *                      centre of mass (middle of the torso). At scale 1 the
 *                      figure spans ≈ x-20..x+37 and y-41..y+35 facing right.
 *                      opts = {pose:'float'|'lick'|'munch', facing:±1,
 *                              tongueTo:{x,y}|null, bodyAngle?, aura?:bool}
 *   mouthPos(g)        {x, y} world position of the mouth (tongue root)
 *   rebuild(g)         GPU context restored: re-render the glow sprites into
 *                      NEW canvases (geometry, pose and FX hook untouched)
 *
 * THE RIG
 *   Everything is authored in "rig" coordinates: facing right, +y down, the
 *   torso's centre of mass at (0,0), hoof soles at y = +35, ossicone tips at
 *   ≈ −41 (≈ 75 px tall at GIRAFFE_SCALE 1). A 2×3 matrix maps rig → world:
 *     world = player + R(θ) · ( fx·sx·S·x ,  sy·S·y + offset )
 *   fx = animated facing (−1..1, squashes through 0 when turning round),
 *   sx/sy = squash & stretch, offset = slides the rig down so the hooves sit
 *   exactly on p.y + p.radius when standing (ground blend), 0 in open space.
 *   The neck bends (per-vertex skinning about its base), the head nods about
 *   the poll, the jaw opens about its hinge.
 *
 *   Hanging from the tongue: θ = atan2(anchor − COM) − atan2(m), where m is
 *   the mouth offset (body frame, facing-adjusted) of the "licking" head pose,
 *   so the mouth lies on the physics ray from the COM to the anchor and the
 *   tongue is drawn from the true mouth. θ is a springy (underdamped) angle.
 *
 * All secondary motion (legs, tail, ears, neck, squash) is dt-based springs;
 * the portrait uses the same drawing code with a procedural (time-based) pose.
 * Spot geometry is generated once from a fixed seed, so it never changes.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // =====================================================================
  // Tuning knobs
  // =====================================================================
  const K = {
    // body rotation springs: ω (rad/s), ζ (damping ratio; <1 = springy)
    ropeOmega: 13, ropeZeta: 0.5,      // hanging from a taut tongue
    slackOmega: 7,                      // tongue attached but loose
    shootOmega: 22, shootZeta: 0.78,    // whip round toward the shot
    freeOmega: 5.5, freeZeta: 0.62,     // free flight (velocity pose)
    groundOmega: 18, groundZeta: 0.9,   // standing

    // free-flight pose (radians)
    noseUp: 0.38,          // nose-up when rising
    diveMax: 2.1,          // head-first dive when falling fast
    diveStart: 420,        // fall speed where the dive starts (px/s)
    diveRange: 700,        // …and reaches full dive after this much more
    leanMax: 0.22,         // lean into horizontal motion
    groundBlendRange: 110, // px above the planet where the rig eases onto its hooves

    // licking head pose (neck bend / head nod) used while the tongue is out
    hangNu: -0.25,
    hangTau: -0.7,
    jawTongue: 0.24,       // jaw opening while the tongue is out

    flipRate: 15,          // facing flip speed (units/s over the −1..1 range)
    flipMinW: 0.28,        // narrowest width mid-turn
    flipStretch: 0.12,     // vertical stretch while mid-turn
    squashAmt: 0.16,       // squash & stretch strength

    // tongue look (px at GIRAFFE_SCALE 1)
    tongueW0: 7,           // at the mouth
    tongueW1: 4,           // at the tip
    sagMax: 420,           // cap on loose-tongue sag
    wobbleTime: 0.35, wobbleAmp: 9, wobbleWaves: 2.5, wobbleSpeed: 34,
    sheenDash: 7, sheenGap: 34, sheenSpeed: 260,
    retractTime: 0.14,     // tongue snapping back into the mouth on release

    munchReach: 0.3,       // victory lick target: fraction of the goal radius from its centre
    munchCycle: 1.6,       // s per lick + chew cycle

    // light
    rimAlpha: 0.5, rimW: 1.0,   // cool space rim light (upper-left); width grows with √scale
    auraAlpha: 0.10, auraR: 50, // faint warm glow so the silhouette reads on black

    // aim reticle
    aimDot: 2.6, aimGap: 12, aimMarkerR: 7,
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

  // =====================================================================
  // Rig landmarks (rig coords, see header)
  // =====================================================================
  const RIG = {
    hoofY: 35,
    nx: 11, ny: -4,             // neck bend pivot (base of the neck)
    hx: 20.8, hy: -30.6,        // head nod pivot (poll)
    jx: 22.8, jy: -28.0,        // jaw hinge
    lipUpX: 34.0, lipUpY: -26.85,
    lipLoX: 33.4, lipLoY: -26.8,
    ex: 25.6, ey: -33.1,        // eye centre
    earNX: 20.4, earNY: -34.4,  // near ear base
    earFX: 21.8, earFY: -35.9,  // far ear base
    ossN: [22.9, -37.2, 22.3, -39.9],   // near ossicone base → tip
    ossF: [20.9, -36.8, 20.1, -39.3],   // far ossicone
    nostX: 33.0, nostY: -30.9,
    blushX: 26.4, blushY: -29.7,
    tailX: -17.6, tailY: -3.8,
  };
  RIG.nax = RIG.hx - RIG.nx; RIG.nay = RIG.hy - RIG.ny;
  RIG.nlen = Math.sqrt(RIG.nax * RIG.nax + RIG.nay * RIG.nay);
  RIG.nax /= RIG.nlen; RIG.nay /= RIG.nlen;
  RIG.h0 = Math.atan2(RIG.lipUpY - RIG.hy, RIG.lipUpX - RIG.hx); // muzzle direction at rest

  // Legs: 0 near fore, 1 far fore, 2 near hind, 3 far hind.
  // Angles: u = upper segment, measured from rig-down toward +x (forward);
  //         b = lower segment relative to the upper (fore knees fold back −, hocks +).
  const LEGS = [
    { rx: 11.2, ry: 1.5, lu: 18.5, ll: 12.8, w: 3.2 },
    { rx: 8.6, ry: 1.2, lu: 18.5, ll: 12.8, w: 3.0 },
    { rx: -12.2, ry: -0.6, lu: 20.0, ll: 13.6, w: 3.9 },
    { rx: -9.8, ry: -0.8, lu: 20.0, ll: 13.6, w: 3.6 },
  ];
  const HOOF_L = 2.2, LOWER_W = 2.0, HOOF_W = 2.6;
  const REST_GU = [0.02, -0.05, -0.1, -0.03], REST_GB = [-0.02, 0.05, 0.1, 0.03];  // standing
  const REST_AU = [0.2, 0.34, -0.2, -0.04], REST_AB = [-0.4, -0.62, 0.38, 0.5];    // floating
  const TUCK_U = [0.9, 1.0, -0.45, -0.3], TUCK_B = [-2.0, -2.1, 1.8, 1.9];         // fresh jump
  const FLEX = [-1, -1, 1, 1];
  const PADDLE_PH = [0, 2.2, 3.4, 5.3];
  const WALK_OFF = [0, Math.PI, 0, Math.PI];   // giraffes pace: same-side legs together

  // Outlines as compact path strings (M/L/Q/C/Z), parsed once.
  const SRC = {
    torso: 'M 7 -12 C 0 -11.6 -7 -8.6 -13 -6.6 Q -17.4 -5.6 -18.6 -1.6 Q -19.6 3.6 -16.2 7.2 ' +
      'Q -13.4 9.4 -9 8.4 Q 0 10.6 9 9.6 Q 14.8 9.2 16.6 4 Q 18.4 -0.2 15.6 -4.6 Q 12.4 -10.6 7 -12 Z',
    torsoShade: 'M -23 4.2 Q -2 8.2 21 3 L 21 14 L -23 14 Z ' +
      'M -22 -9 Q -15.6 -3 -17.4 9 L -23 9 Z',
    torsoLight: 'M 9 -15 L -15 -9.5 L -14 -5.6 Q -4 -8.6 6.8 -9.8 Z',
    neck: 'M 3.2 -9.6 Q 10.4 -21.4 18.6 -31.6 Q 22.8 -33.4 24.6 -27.6 Q 19.8 -11 15.8 2 Q 8 4 3.2 -9.6 Z',
    neckLight: 'M 1.6 -12.2 Q 9.4 -23 17.6 -34 L 19.2 -30.4 Q 12.4 -20.4 6.2 -8 Z',
    neckShade: 'M 26.2 -28.4 Q 21.2 -11 17.2 3 L 14.2 3 Q 18.6 -11 23 -27.2 Z ' +
      'M 4 -12.8 Q 12.6 -12 16.6 -4.2 L 19 -6.4 Q 13.8 -15.2 5.2 -15.8 Z',
    head: 'M 19.4 -29.6 Q 18.2 -32.2 18.9 -34.4 Q 20.2 -37.6 23.8 -37.5 Q 27.2 -37.3 29.8 -34.6 ' +
      'Q 32.4 -33 34.6 -31.4 Q 36.2 -30 35.6 -28.2 Q 35.2 -26.8 33.9 -26.8 Q 28.8 -26.6 23.4 -27.9 ' +
      'Q 21 -28.5 19.4 -29.6 Z',
    headShade: 'M 17 -30.4 Q 23.4 -28.7 31 -28.4 L 31 -24 L 17 -24 Z',
    headLight: 'M 21 -37.3 Q 25.6 -38.8 29.6 -35.1 Q 25.4 -36.3 21.6 -35.7 Z',
    jaw: 'M 22.8 -28.3 Q 28.4 -27.0 33.2 -26.95 Q 34.3 -26.5 33.5 -25.5 Q 28.8 -24.3 24.6 -25.1 Q 22 -25.6 21 -27.2 Z',
    jawShade: 'M 20 -26.6 Q 27 -25.6 35 -26.2 L 35 -23 L 20 -23 Z',
    ear: 'M 0 -1.3 Q 4.6 -3.5 8.2 0 Q 4.4 2.7 0 1.3 Z',
    earIn: 'M 1.3 -0.55 Q 4.6 -2.0 7.0 0 Q 4.4 1.25 1.3 0.55 Z',
    leaf: 'M 0 0 Q 2.6 -2.1 6.2 -0.2 Q 2.8 1.9 0 0 Z',
  };

  function parsePath(str) {
    const tok = str.trim().split(/[\s,]+/), out = [];
    let i = 0;
    while (i < tok.length) {
      const c = tok[i++];
      const n = c === 'M' || c === 'L' ? 2 : c === 'Q' ? 4 : c === 'C' ? 6 : 0;
      out.push(c === 'M' ? 0 : c === 'L' ? 1 : c === 'Q' ? 2 : c === 'C' ? 3 : 4);
      for (let k = 0; k < n; k++) out.push(+tok[i++]);
    }
    return new Float32Array(out);
  }

  // =====================================================================
  // Geometry build (paths + seeded reticulated patches), done once
  // =====================================================================
  const G = {};
  const COL = {};
  let built = false;

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Keep the half-plane (P − a)·n ≤ 0 of a flat polygon.
  function clipHalf(poly, ax, ay, nx, ny) {
    const out = [], n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = poly[i * 2], y1 = poly[i * 2 + 1], x2 = poly[j * 2], y2 = poly[j * 2 + 1];
      const d1 = (x1 - ax) * nx + (y1 - ay) * ny, d2 = (x2 - ax) * nx + (y2 - ay) * ny;
      if (d1 <= 0) out.push(x1, y1);
      if ((d1 <= 0) !== (d2 <= 0)) { const t = d1 / (d1 - d2); out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t); }
    }
    return out;
  }

  // Polygon (flat [x,y,…]) point test.
  function inPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Sample a parsed path's anchor + control points into a rough polygon (for region tests).
  function roughPoly(cmd) {
    const out = [];
    let i = 0;
    while (i < cmd.length) {
      const op = cmd[i++];
      if (op === 4) continue;
      const cnt = op === 2 ? 2 : op === 3 ? 3 : 1;
      for (let k = 0; k < cnt; k++) { const x = cmd[i++], y = cmd[i++]; if (k === cnt - 1) out.push(x, y); }
    }
    return out;
  }

  // Reticulated coat: jittered hex-grid Voronoi cells inside `box`, each shrunk
  // toward its centroid (the cream network) and corner-cut into soft polygons.
  // Returns two command buffers (two patch tones).
  function patches(rng, box, spacing, jitter, inset, keep) {
    const seeds = [];
    const rowH = spacing * 0.866;
    let row = 0;
    for (let y = box[1] - spacing * 1.5; y <= box[3] + spacing * 1.5; y += rowH, row++) {
      for (let x = box[0] - spacing * 1.5 + (row & 1 ? spacing / 2 : 0); x <= box[2] + spacing * 1.5; x += spacing) {
        seeds.push(x + (rng() - 0.5) * jitter * spacing, y + (rng() - 0.5) * jitter * spacing);
      }
    }
    const A = [], B = [];
    const ns = seeds.length / 2;
    for (let i = 0; i < ns; i++) {
      const sx = seeds[i * 2], sy = seeds[i * 2 + 1];
      const tone = rng();
      const var_ = rng();
      if (sx < box[0] - spacing * 0.5 || sx > box[2] + spacing * 0.5 || sy < box[1] - spacing * 0.5 || sy > box[3] + spacing * 0.5) continue;
      const R = spacing * 2;
      let poly = [sx - R, sy - R, sx + R, sy - R, sx + R, sy + R, sx - R, sy + R];
      for (let j = 0; j < ns && poly.length >= 6; j++) {
        if (j === i) continue;
        const dx = seeds[j * 2] - sx, dy = seeds[j * 2 + 1] - sy;
        if (dx * dx + dy * dy > 9 * spacing * spacing) continue;
        poly = clipHalf(poly, sx + dx / 2, sy + dy / 2, dx, dy);
      }
      if (poly.length < 6) continue;
      let cx = 0, cy = 0;
      const n = poly.length / 2;
      for (let k = 0; k < n; k++) { cx += poly[k * 2]; cy += poly[k * 2 + 1]; }
      cx /= n; cy /= n;
      if (keep && !keep(cx, cy)) continue;
      // shrink toward the centroid, dropping near-duplicate vertices
      const sc = inset * (0.93 + var_ * 0.1);
      const v = [];
      for (let k = 0; k < n; k++) {
        const x = cx + (poly[k * 2] - cx) * sc, y = cy + (poly[k * 2 + 1] - cy) * sc;
        if (v.length >= 2) { const lx = v[v.length - 2], ly = v[v.length - 1]; if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 0.04 * spacing * spacing) continue; }
        v.push(x, y);
      }
      if (v.length >= 4) { const dx = v[0] - v[v.length - 2], dy = v[1] - v[v.length - 1]; if (dx * dx + dy * dy < 0.04 * spacing * spacing) v.length -= 2; }
      const m = v.length / 2;
      if (m < 3) continue;
      const out = tone < 0.55 ? A : B;
      const cut = 0.3;
      for (let k = 0; k < m; k++) {
        const p = (k + m - 1) % m, q = (k + 1) % m;
        const vx = v[k * 2], vy = v[k * 2 + 1];
        const p1x = vx + (v[p * 2] - vx) * cut, p1y = vy + (v[p * 2 + 1] - vy) * cut;
        const p2x = vx + (v[q * 2] - vx) * cut, p2y = vy + (v[q * 2 + 1] - vy) * cut;
        out.push(k === 0 ? 0 : 1, p1x, p1y);
        out.push(2, vx, vy, p2x, p2y);
      }
      out.push(4);
    }
    return [new Float32Array(A), new Float32Array(B)];
  }

  // Short serrated mane strip along the back edge of the neck.
  function buildMane() {
    const b0x = 3.2, b0y = -9.6, cx = 10.4, cy = -21.4, b1x = 18.6, b1y = -31.6;
    const N = 16, outer = [], inner = [];
    for (let k = 0; k <= N; k++) {
      const s = 0.2 + (0.95 - 0.2) * (k / N);
      const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
      const x = a * b0x + b * cx + c * b1x, y = a * b0y + b * cy + c * b1y;
      let tx = 2 * (1 - s) * (cx - b0x) + 2 * s * (b1x - cx), ty = 2 * (1 - s) * (cy - b0y) + 2 * s * (b1y - cy);
      const L = Math.sqrt(tx * tx + ty * ty) || 1; tx /= L; ty /= L;
      const nx = ty, ny = -tx;                       // outward (back / up)
      const taper = Math.min(1, (k + 1) / 4) * Math.min(1, (N - k + 1) / 3);
      const h = (k % 2 ? 1.25 : 2.15) * taper + 0.35;
      outer.push(x + nx * h - tx * (k % 2 ? 0 : 0.35), y + ny * h - ty * (k % 2 ? 0 : 0.35));
      inner.push(x - nx * 0.45, y - ny * 0.45);
    }
    const out = [0, inner[0], inner[1]];
    for (let k = 0; k < outer.length; k += 2) out.push(1, outer[k], outer[k + 1]);
    for (let k = inner.length - 2; k >= 0; k -= 2) out.push(1, inner[k], inner[k + 1]);
    out.push(4);
    return new Float32Array(out);
  }

  function hexRGB(h) {
    let s = String(h || '').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    if (!isFinite(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexRGB(a), B = hexRGB(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function rgba(h, a) { const A = hexRGB(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

  function ensureBuilt() {
    if (built) return;
    built = true;
    for (const k in SRC) G[k] = parsePath(SRC[k]);
    G.mane = buildMane();

    const rng = mulberry(0x6a1ff3b);
    const torsoPoly = roughPoly(G.torso), neckPoly = roughPoly(G.neck), headPoly = roughPoly(G.head);
    const near = (poly, sp) => (x, y) => inPoly(poly, x, y) || inPoly(poly, x + sp, y) || inPoly(poly, x - sp, y) ||
      inPoly(poly, x, y + sp) || inPoly(poly, x, y - sp);
    const torsoNear = near(torsoPoly, 3.4);
    let s = patches(rng, [-21, -14, 19, 7], 6.2, 0.55, 0.8, (x, y) => y < 5.6 && torsoNear(x, y));
    G.torsoSpotsA = s[0]; G.torsoSpotsB = s[1];
    const neckNear = near(neckPoly, 2.6);
    s = patches(rng, [1, -35, 27, 3], 5.0, 0.5, 0.78, (x, y) => y > -33 && neckNear(x, y));
    G.neckSpotsA = s[0]; G.neckSpotsB = s[1];
    s = patches(rng, [16.5, -39, 28.5, -29], 3.0, 0.45, 0.74, (x, y) => {
      const dx = x - RIG.ex, dy = y - RIG.ey;
      return x < 27.4 && y < -30.4 && dx * dx + dy * dy > 3.1 * 3.1 && inPoly(headPoly, x, y);
    });
    // head: one tone is enough at this size
    const hs = new Float32Array(s[0].length + s[1].length); hs.set(s[0]); hs.set(s[1], s[0].length);
    G.headSpots = hs;

    const P = ASCENT.PAL || {};
    const hide = P.hide || '#f2b64c', light = P.hideLight || '#ffd98a', spots = P.spots || '#9a4a17',
      spotsDark = P.spotsDark || '#6e3010', hoof = P.hoof || '#3a2414';
    COL.coat = hide;
    COL.belly = mix(hide, light, 0.75);
    COL.spotA = spots;
    COL.spotB = mix(spots, spotsDark, 0.45);
    COL.coatFar = mix(hide, spotsDark, 0.24);
    COL.legLow = mix(hide, light, 0.62);
    COL.legLowFar = mix(COL.coatFar, light, 0.3);
    COL.jaw = mix(hide, light, 0.22);
    COL.muzzle = mix(hide, light, 0.72);
    COL.tail = mix(hide, spots, 0.45);
    COL.tuft = hoof;
    COL.hoof = hoof;
    COL.hoofFar = mix(hoof, '#000000', 0.3);
    COL.mane = P.mane || '#7a3a12';
    COL.earIn = mix(light, '#ffb49a', 0.45);
    COL.earInFar = mix(COL.earIn, spotsDark, 0.25);
    COL.eye = '#26120a';
    COL.sclera = '#fffaf0';
    COL.mouthIn = '#3a1030';
    COL.nostril = mix(spots, spotsDark, 0.5);
    COL.mouthLine = mix(spots, hide, 0.25);
    COL.shade = 'rgba(70,32,98,0.24)';
    COL.light = 'rgba(255,238,196,0.34)';
    COL.rim = P.starCool || '#bcd8ff';
    COL.blush = 'rgba(255,112,122,0.38)';
    COL.tongue = P.tongue || '#4b2f78';
    COL.tongueHi = P.tongueHi || '#8a6cc8';
    COL.tongueDark = P.tongueDark || '#2a1846';
    COL.sheen = mix(COL.tongueHi, '#ffffff', 0.55);
    COL.leaf = P.leaf || '#7fe07a';
    COL.leafHi = P.leafGlow || '#d8ffb0';
    COL.ui = hexRGB(P.ui || '#eaf2ff');
  }

  // Glow sprites (created at init only).
  let auraSpr = null, haloSpr = null;
  function makeGlow(r, g, b, a0) {
    try {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      if (!x) return null;
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + a0 + ')');
      gr.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',' + (a0 * 0.35) + ')');
      gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      return c;
    } catch (e) { return null; }
  }
  // fresh = always make new canvases (after a GPU context loss the old ones may
  // be blank or still lost); otherwise only fill in what is missing.
  function buildGlows(fresh) {
    if (fresh || !auraSpr) auraSpr = makeGlow(255, 196, 120, 0.9);
    if (fresh || !haloSpr) haloSpr = makeGlow(110, 240, 255, 0.9);
  }

  // =====================================================================
  // Path tracing (with optional neck skinning)
  // =====================================================================
  let SX = 0, SY = 0, skinNu = 0;
  const PXa = new Float32Array(3), PYa = new Float32Array(3);

  // Bend the neck: a point's rotation about the neck base grows smoothly
  // from 0 at the base to ν at the poll, so the neck curves instead of pivoting.
  function skinXY(x, y) {
    if (skinNu === 0) { SX = x; SY = y; return; }
    const t = clamp(((x - RIG.nx) * RIG.nax + (y - RIG.ny) * RIG.nay) / RIG.nlen, 0, 1);
    const a = skinNu * t * t * (3 - 2 * t);
    const c = Math.cos(a), s = Math.sin(a), dx = x - RIG.nx, dy = y - RIG.ny;
    SX = RIG.nx + dx * c - dy * s; SY = RIG.ny + dx * s + dy * c;
  }

  function trace(ctx, cmd, skin) {
    const n = cmd.length;
    let i = 0;
    while (i < n) {
      const op = cmd[i++];
      if (op === 4) { ctx.closePath(); continue; }
      const cnt = op === 2 ? 2 : op === 3 ? 3 : 1;
      for (let k = 0; k < cnt; k++) {
        const x = cmd[i++], y = cmd[i++];
        if (skin) { skinXY(x, y); PXa[k] = SX; PYa[k] = SY; } else { PXa[k] = x; PYa[k] = y; }
      }
      if (op === 0) ctx.moveTo(PXa[0], PYa[0]);
      else if (op === 1) ctx.lineTo(PXa[0], PYa[0]);
      else if (op === 2) ctx.quadraticCurveTo(PXa[0], PYa[0], PXa[1], PYa[1]);
      else ctx.bezierCurveTo(PXa[0], PYa[0], PXa[1], PYa[1], PXa[2], PYa[2]);
    }
  }

  function rotAboutCtx(ctx, cx, cy, a) {
    if (!a) return;
    ctx.translate(cx, cy); ctx.rotate(a); ctx.translate(-cx, -cy);
  }

  const OUT = { x: 0, y: 0 };
  let GA = 1;   // the caller's globalAlpha when a draw started (portraits may be faded in by the UI)
  function rotP(x, y, cx, cy, a) {
    const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    OUT.x = cx + dx * c - dy * s; OUT.y = cy + dx * s + dy * c;
  }

  // Mouth (tongue root) in rig coords for a given neck bend / head nod / jaw.
  function mouthRig(nu, tau, jaw) {
    rotP(RIG.lipLoX, RIG.lipLoY, RIG.jx, RIG.jy, jaw);
    const x = (RIG.lipUpX + OUT.x) * 0.5, y = (RIG.lipUpY + OUT.y) * 0.5;
    rotP(x, y, RIG.hx, RIG.hy, tau);
    rotP(OUT.x, OUT.y, RIG.nx, RIG.ny, nu);
  }

  // =====================================================================
  // Pose + rig matrix
  // =====================================================================
  function makePose() {
    return {
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, S: 1,
      nu: 0, tau: 0, jaw: 0,
      legU: new Float32Array(4), legB: new Float32Array(4),
      tail1: -0.4, tail2: -0.4, earN: -0.15, earF: -0.15,
      eye: 0, lookX: 1, lookY: 0, smile: 0.35, blush: 0,
      leaf: 0, leafAng: 0, tongueRoot: false,
      rimX: 0, rimY: 0, aura: 1, mouthX: 0, mouthY: 0,
    };
  }
  const GP = makePose();   // in-game pose
  const PP = makePose();   // portrait pose

  let BA = 1, BB = 1, BC = 0;   // body frame: body = (BA·x, BB·y + BC)
  function bodyFrame(fx, sq, gb, S, radius) {
    // turning round: squash to a sliver (never zero width), then pop to the other side
    const f = (fx < 0 ? -1 : 1) * (K.flipMinW + (1 - K.flipMinW) * Math.min(1, Math.abs(fx)));
    BA = f * (1 + K.squashAmt * sq) * S;
    BB = (1 - K.squashAmt * sq) * (1 + K.flipStretch * (1 - Math.abs(fx))) * S;
    const pivot = RIG.hoofY * gb;                  // squash about the hooves when standing
    const off = gb * (radius - RIG.hoofY * S);     // hooves on p.y + radius when standing
    BC = off + pivot * S - pivot * BB;
  }
  function setMatrix(P, px, py, theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    P.a = c * BA; P.b = s * BA; P.c = -s * BB; P.d = c * BB;
    P.e = px - s * BC; P.f = py + c * BC;
  }
  function xf(P, x, y) { OUT.x = P.a * x + P.c * y + P.e; OUT.y = P.b * x + P.d * y + P.f; }

  // =====================================================================
  // Drawing the giraffe (rig space)
  // =====================================================================
  const LKX = new Float32Array(4), LKY = new Float32Array(4), LFX = new Float32Array(4), LFY = new Float32Array(4),
    LHX = new Float32Array(4), LHY = new Float32Array(4);
  function legJoints(P) {
    for (let i = 0; i < 4; i++) {
      const L = LEGS[i], u = P.legU[i], b = u + P.legB[i];
      const kx = L.rx + Math.sin(u) * L.lu, ky = L.ry + Math.cos(u) * L.lu;
      const sb = Math.sin(b), cb = Math.cos(b);
      LKX[i] = kx; LKY[i] = ky;
      LFX[i] = kx + sb * L.ll; LFY[i] = ky + cb * L.ll;
      LHX[i] = LFX[i] + sb * HOOF_L; LHY[i] = LFY[i] + cb * HOOF_L;
    }
  }

  function drawLegPair(ctx, far) {
    const iF = far ? 1 : 0, iH = far ? 3 : 2;
    const up = far ? COL.coatFar : COL.coat, low = far ? COL.legLowFar : COL.legLow;
    ctx.lineCap = 'round';
    // lower legs (pale), then upper legs over the knees
    ctx.beginPath();
    ctx.moveTo(LKX[iF], LKY[iF]); ctx.lineTo(LFX[iF], LFY[iF]);
    ctx.moveTo(LKX[iH], LKY[iH]); ctx.lineTo(LFX[iH], LFY[iH]);
    ctx.lineWidth = LOWER_W; ctx.strokeStyle = low; ctx.stroke();
    ctx.strokeStyle = up;
    for (let k = 0; k < 2; k++) {
      const i = k === 0 ? iF : iH, L = LEGS[i];
      ctx.beginPath(); ctx.moveTo(L.rx, L.ry); ctx.lineTo(LKX[i], LKY[i]);
      ctx.lineWidth = L.w; ctx.stroke();
    }
    if (!far) {
      // a couple of patches running down the near upper legs
      ctx.beginPath();
      for (let i = 0; i < 4; i += 2) {
        const L = LEGS[i], dx = LKX[i] - L.rx, dy = LKY[i] - L.ry;
        ctx.moveTo(L.rx + dx * 0.5, L.ry + dy * 0.5); ctx.lineTo(L.rx + dx * 0.6, L.ry + dy * 0.6);
        ctx.moveTo(L.rx + dx * 0.74, L.ry + dy * 0.74); ctx.lineTo(L.rx + dx * 0.8, L.ry + dy * 0.8);
      }
      ctx.lineWidth = 2.1; ctx.strokeStyle = COL.spotA; ctx.stroke();
    }
    // hooves
    ctx.beginPath();
    ctx.moveTo(LFX[iF], LFY[iF]); ctx.lineTo(LHX[iF], LHY[iF]);
    ctx.moveTo(LFX[iH], LFY[iH]); ctx.lineTo(LHX[iH], LHY[iH]);
    ctx.lineCap = 'butt'; ctx.lineWidth = HOOF_W; ctx.strokeStyle = far ? COL.hoofFar : COL.hoof; ctx.stroke();
    ctx.lineCap = 'round';
  }

  function drawTail(ctx, P) {
    const x0 = RIG.tailX, y0 = RIG.tailY, a1 = P.tail1, a2 = P.tail2;
    const x1 = x0 + Math.sin(a1) * 9, y1 = y0 + Math.cos(a1) * 9;
    const x2 = x1 + Math.sin(a2) * 7.5, y2 = y1 + Math.cos(a2) * 7.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2);
    ctx.lineWidth = 1.25; ctx.strokeStyle = COL.tail; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x2 + Math.sin(a2) * 2.1, y2 + Math.cos(a2) * 2.1, 1.3, 2.8, -a2, 0, TAU);
    ctx.fillStyle = COL.tuft; ctx.fill();
  }

  function drawNeck(ctx, P) {
    skinNu = P.nu;
    ctx.save();
    ctx.beginPath(); trace(ctx, G.neck, true);
    ctx.fillStyle = COL.coat; ctx.fill();
    ctx.clip();
    ctx.beginPath(); trace(ctx, G.neckSpotsA, true); ctx.fillStyle = COL.spotA; ctx.fill();
    ctx.beginPath(); trace(ctx, G.neckSpotsB, true); ctx.fillStyle = COL.spotB; ctx.fill();
    ctx.beginPath(); trace(ctx, G.neckLight, true); ctx.fillStyle = COL.light; ctx.fill();
    ctx.beginPath(); trace(ctx, G.neckShade, true); ctx.fillStyle = COL.shade; ctx.fill();
    ctx.restore();
    ctx.beginPath(); trace(ctx, G.mane, true); ctx.fillStyle = COL.mane; ctx.fill();
    skinNu = 0;
  }

  function drawTorso(ctx) {
    ctx.save();
    ctx.beginPath(); trace(ctx, G.torso, false);
    ctx.fillStyle = COL.coat; ctx.fill();
    ctx.clip();
    ctx.beginPath(); ctx.ellipse(-1, 9.8, 15.5, 4.4, 0.03, 0, TAU); ctx.fillStyle = COL.belly; ctx.fill();
    ctx.beginPath(); trace(ctx, G.torsoSpotsA, false); ctx.fillStyle = COL.spotA; ctx.fill();
    ctx.beginPath(); trace(ctx, G.torsoSpotsB, false); ctx.fillStyle = COL.spotB; ctx.fill();
    ctx.beginPath(); trace(ctx, G.torsoShade, false); ctx.fillStyle = COL.shade; ctx.fill();
    ctx.beginPath(); trace(ctx, G.torsoLight, false); ctx.fillStyle = COL.light; ctx.fill();
    ctx.restore();
  }

  function drawEar(ctx, bx, by, ang, sc, outer, inner) {
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(ang); ctx.scale(sc, sc);
    ctx.beginPath(); trace(ctx, G.ear, false); ctx.fillStyle = outer; ctx.fill();
    if (inner) { ctx.beginPath(); trace(ctx, G.earIn, false); ctx.fillStyle = inner; ctx.fill(); }
    ctx.restore();
  }

  function drawOssicone(ctx, o, w, col) {
    ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[2], o[3]);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
    ctx.beginPath(); ctx.arc(o[2], o[3], 1.25, 0, TAU); ctx.fillStyle = COL.tuft; ctx.fill();
  }

  function drawEye(ctx, P) {
    const ex = RIG.ex, ey = RIG.ey, lx = P.lookX, ly = P.lookY;
    ctx.lineCap = 'round';
    switch (P.eye) {
      case 1: { // wide: white all round, tiny pupil, raised brow
        ctx.beginPath(); ctx.ellipse(ex, ey - 0.25, 2.15, 2.5, 0, 0, TAU);
        ctx.fillStyle = COL.sclera; ctx.fill();
        ctx.beginPath(); ctx.arc(ex + lx * 0.95, ey - 0.25 + ly * 1.0, 0.7, 0, TAU);
        ctx.fillStyle = COL.eye; ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex, ey - 0.25, 2.15, 2.5, 0, 0, TAU);
        ctx.moveTo(ex - 2.3, ey - 3.9); ctx.quadraticCurveTo(ex - 0.2, ey - 5.3, ex + 1.9, ey - 4.2);
        ctx.moveTo(ex - 1.5, ey - 2.2); ctx.lineTo(ex - 2.6, ey - 3.0);
        ctx.moveTo(ex - 0.5, ey - 2.7); ctx.lineTo(ex - 1.0, ey - 3.6);
        ctx.lineWidth = 0.45; ctx.strokeStyle = COL.eye; ctx.stroke();
        break;
      }
      case 2: { // happy squint ^
        ctx.beginPath();
        ctx.moveTo(ex - 1.8, ey + 0.5); ctx.quadraticCurveTo(ex - 0.1, ey - 2.1, ex + 1.7, ey + 0.3);
        ctx.moveTo(ex - 1.45, ey - 0.3); ctx.lineTo(ex - 2.6, ey - 1.0);
        ctx.lineWidth = 0.75; ctx.strokeStyle = COL.eye; ctx.stroke();
        break;
      }
      case 3: { // blink (closed, lashes down)
        ctx.beginPath();
        ctx.moveTo(ex - 1.9, ey - 0.3); ctx.quadraticCurveTo(ex, ey + 1.3, ex + 1.8, ey - 0.5);
        ctx.moveTo(ex - 1.2, ey + 0.35); ctx.lineTo(ex - 2.0, ey + 1.3);
        ctx.moveTo(ex - 0.1, ey + 0.6); ctx.lineTo(ex - 0.5, ey + 1.7);
        ctx.lineWidth = 0.55; ctx.strokeStyle = COL.eye; ctx.stroke();
        break;
      }
      case 4: { // ouch: squeezed shut >
        ctx.beginPath();
        ctx.moveTo(ex - 1.7, ey - 1.7); ctx.lineTo(ex + 1.3, ey - 0.15); ctx.lineTo(ex - 1.7, ey + 1.3);
        ctx.lineWidth = 0.8; ctx.strokeStyle = COL.eye; ctx.stroke();
        break;
      }
      default: { // normal (0) / half-lidded "meh" (5): big glossy dark eye + lashes
        const ix = ex + lx * 0.3, iy = ey + ly * 0.3;
        ctx.beginPath(); ctx.ellipse(ix, iy, 1.55, 1.85, 0, 0, TAU);
        ctx.fillStyle = COL.eye; ctx.fill();
        ctx.beginPath();
        ctx.arc(ix + 0.5, iy - 0.72, 0.62, 0, TAU);
        ctx.moveTo(ix - 0.2, iy + 0.78); ctx.arc(ix - 0.48, iy + 0.78, 0.28, 0, TAU);
        ctx.fillStyle = COL.sclera; ctx.fill();
        ctx.beginPath();
        if (P.eye === 5) {
          ctx.moveTo(ex - 2.3, ey - 0.1); ctx.lineTo(ex + 2.2, ey - 0.45); ctx.lineTo(ex + 2.2, ey - 2.8); ctx.lineTo(ex - 2.3, ey - 2.8);
          ctx.closePath(); ctx.fillStyle = COL.coat; ctx.fill();
          ctx.beginPath();
          ctx.moveTo(ex - 2.0, ey - 0.1); ctx.lineTo(ex + 1.9, ey - 0.45);
          ctx.moveTo(ex - 1.5, ey - 0.05); ctx.lineTo(ex - 2.4, ey + 0.7);
        } else {
          ctx.moveTo(ex - 1.9, ey - 0.5); ctx.quadraticCurveTo(ex - 0.2, ey - 2.9, ex + 1.8, ey - 1.0);
          ctx.moveTo(ex - 1.5, ey - 1.45); ctx.lineTo(ex - 2.6, ey - 2.35);
          ctx.moveTo(ex - 0.65, ey - 1.9); ctx.lineTo(ex - 1.3, ey - 3.15);
          ctx.moveTo(ex + 0.35, ey - 1.95); ctx.lineTo(ex + 0.1, ey - 3.2);
        }
        ctx.lineWidth = 0.45; ctx.strokeStyle = COL.eye; ctx.stroke();
      }
    }
  }

  function drawHead(ctx, P) {
    ctx.save();
    rotAboutCtx(ctx, RIG.nx, RIG.ny, P.nu);
    rotAboutCtx(ctx, RIG.hx, RIG.hy, P.tau);

    // behind the head: far ear, far ossicone
    drawEar(ctx, RIG.earFX, RIG.earFY, Math.PI + P.earF + 0.38, 0.86, COL.coatFar, COL.earInFar);
    drawOssicone(ctx, RIG.ossF, 1.7, COL.coatFar);

    // lower lip position for the open jaw
    rotP(RIG.lipLoX, RIG.lipLoY, RIG.jx, RIG.jy, P.jaw);
    const llx = OUT.x, lly = OUT.y;
    const mx = (RIG.lipUpX + llx) * 0.5, my = (RIG.lipUpY + lly) * 0.5;
    if (P.jaw > 0.02) {
      ctx.beginPath();
      ctx.moveTo(RIG.jx - 0.6, RIG.jy - 0.1); ctx.lineTo(RIG.lipUpX + 0.4, RIG.lipUpY - 0.15); ctx.lineTo(llx + 0.4, lly + 0.1);
      ctx.closePath();
      ctx.fillStyle = COL.mouthIn; ctx.fill();
      if (P.tongueRoot) {
        ctx.beginPath(); ctx.moveTo(RIG.jx + 4.5, (RIG.jy + my) * 0.5 + 0.3); ctx.lineTo(mx + 0.6, my);
        ctx.lineWidth = 3.1; ctx.strokeStyle = COL.tongue; ctx.stroke();
      }
    }
    // jaw
    ctx.save();
    rotAboutCtx(ctx, RIG.jx, RIG.jy, P.jaw);
    ctx.beginPath(); trace(ctx, G.jaw, false); ctx.fillStyle = COL.jaw; ctx.fill();
    ctx.clip();
    ctx.beginPath(); trace(ctx, G.jawShade, false); ctx.fillStyle = COL.shade; ctx.fill();
    ctx.restore();
    // head
    ctx.save();
    ctx.beginPath(); trace(ctx, G.head, false); ctx.fillStyle = COL.coat; ctx.fill();
    ctx.clip();
    ctx.beginPath(); trace(ctx, G.headSpots, false); ctx.fillStyle = COL.spotA; ctx.fill();
    ctx.beginPath(); trace(ctx, G.headShade, false); ctx.fillStyle = COL.shade; ctx.fill();
    ctx.beginPath(); ctx.ellipse(33.3, -29.3, 3.7, 3.2, 0, 0, TAU); ctx.fillStyle = COL.muzzle; ctx.fill();
    ctx.beginPath(); trace(ctx, G.headLight, false); ctx.fillStyle = COL.light; ctx.fill();
    ctx.restore();

    // in front: ossicone, ear, face
    drawOssicone(ctx, RIG.ossN, 1.9, COL.coat);
    drawEar(ctx, RIG.earNX, RIG.earNY, Math.PI + P.earN, 1, COL.coat, COL.earIn);
    if (P.blush > 0.02) {
      ctx.beginPath(); ctx.ellipse(RIG.blushX, RIG.blushY, 2.2, 1.15, -0.1, 0, TAU);
      ctx.globalAlpha = GA * clamp(P.blush, 0, 1); ctx.fillStyle = COL.blush; ctx.fill();
      ctx.globalAlpha = GA;
    }
    drawEye(ctx, P);
    ctx.beginPath(); ctx.ellipse(RIG.nostX, RIG.nostY, 0.9, 0.42, -0.45, 0, TAU);
    ctx.fillStyle = COL.nostril; ctx.fill();
    if (P.jaw < 0.05) {
      const sm = P.smile;
      ctx.beginPath(); ctx.moveTo(33.7, -26.9);
      ctx.quadraticCurveTo(31.8, -26.6 + sm * 0.25, 29.9, -27.0 - sm * 1.0);
      ctx.lineWidth = 0.45; ctx.strokeStyle = COL.mouthLine; ctx.stroke();
    }
    if (P.leaf > 0.02) {
      ctx.save();
      ctx.translate(mx - 0.3, my + 0.2); ctx.rotate(0.55 + P.leafAng); ctx.scale(P.leaf * 1.3, P.leaf * 1.3);
      ctx.beginPath(); trace(ctx, G.leaf, false); ctx.fillStyle = COL.leaf; ctx.fill();
      ctx.rotate(-0.9);
      ctx.beginPath(); trace(ctx, G.leaf, false); ctx.fillStyle = COL.leafHi; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Silhouette only (for the rim-light pass).
  function drawSilhouette(ctx, P) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(LKX[i], LKY[i]); ctx.lineTo(LFX[i], LFY[i]); }
    ctx.lineWidth = LOWER_W; ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(LEGS[i].rx, LEGS[i].ry); ctx.lineTo(LKX[i], LKY[i]);
      ctx.lineWidth = LEGS[i].w; ctx.stroke();
    }
    skinNu = P.nu;
    ctx.beginPath(); trace(ctx, G.neck, true); ctx.fill();
    skinNu = 0;
    ctx.beginPath(); trace(ctx, G.torso, false); ctx.fill();
    ctx.save();
    rotAboutCtx(ctx, RIG.nx, RIG.ny, P.nu);
    rotAboutCtx(ctx, RIG.hx, RIG.hy, P.tau);
    ctx.beginPath(); trace(ctx, G.head, false); ctx.fill();
    drawEar(ctx, RIG.earNX, RIG.earNY, Math.PI + P.earN, 1, COL.rim, null);
    rotAboutCtx(ctx, RIG.jx, RIG.jy, P.jaw);
    ctx.beginPath(); trace(ctx, G.jaw, false); ctx.fill();
    ctx.restore();
  }

  function drawGiraffe(ctx, P) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    legJoints(P);
    // warm aura behind (additive)
    if (P.aura > 0 && auraSpr && K.auraAlpha > 0) {
      xf(P, 7, -3);
      const R = K.auraR * P.S;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = GA * clamp(K.auraAlpha * P.aura, 0, 1);
      ctx.drawImage(auraSpr, OUT.x - R, OUT.y - R, R * 2, R * 2);
      ctx.restore();
    }
    // cool rim from space: the silhouette, nudged toward the light, drawn first
    if (K.rimAlpha > 0) {
      ctx.save();
      ctx.translate(P.rimX, P.rimY);
      ctx.transform(P.a, P.b, P.c, P.d, P.e, P.f);
      ctx.globalAlpha = GA * clamp(K.rimAlpha, 0, 1);
      ctx.fillStyle = COL.rim; ctx.strokeStyle = COL.rim;
      drawSilhouette(ctx, P);
      ctx.restore();
    }
    ctx.transform(P.a, P.b, P.c, P.d, P.e, P.f);
    drawTail(ctx, P);
    drawLegPair(ctx, true);
    drawLegPair(ctx, false);
    drawNeck(ctx, P);
    drawTorso(ctx);
    drawHead(ctx, P);
    ctx.restore();
  }

  // =====================================================================
  // Tongue: tapered ribbon along a centreline (TX/TY), a few paths only
  // =====================================================================
  const TMAX = 96;
  const TX = new Float32Array(TMAX), TY = new Float32Array(TMAX), TW = new Float32Array(TMAX),
    NX = new Float32Array(TMAX), NY = new Float32Array(TMAX), UX = new Float32Array(TMAX), UY = new Float32Array(TMAX);
  let tn = 0;
  function tReset() { tn = 0; }
  function tPush(x, y) { if (tn < TMAX && isFinite(x) && isFinite(y)) { TX[tn] = x; TY[tn] = y; tn++; } }

  // One Chaikin pass (keeps both ends).
  function tSmooth() {
    if (tn < 3 || tn * 2 > TMAX) return;
    let m = 0;
    UX[m] = TX[0]; UY[m] = TY[0]; m++;
    for (let i = 0; i < tn - 1; i++) {
      const ax = TX[i], ay = TY[i], bx = TX[i + 1], by = TY[i + 1];
      if (i > 0) { UX[m] = ax * 0.75 + bx * 0.25; UY[m] = ay * 0.75 + by * 0.25; m++; }
      if (i < tn - 2) { UX[m] = ax * 0.25 + bx * 0.75; UY[m] = ay * 0.25 + by * 0.75; m++; }
    }
    UX[m] = TX[tn - 1]; UY[m] = TY[tn - 1]; m++;
    for (let i = 0; i < m; i++) { TX[i] = UX[i]; TY[i] = UY[i]; }
    tn = m;
  }

  // Moving-average blur of the centreline (ends fixed): tames jittery physics debris.
  function tBlur(rad) {
    if (tn < 3) return;
    for (let i = 0; i < tn; i++) { UX[i] = TX[i]; UY[i] = TY[i]; }
    for (let i = 1; i < tn - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let k = -rad; k <= rad; k++) { const j = clamp(i + k, 0, tn - 1); sx += UX[j]; sy += UY[j]; n++; }
      TX[i] = sx / n; TY[i] = sy / n;
    }
  }

  function tNormals() {
    for (let i = 0; i < tn; i++) {
      const i0 = i > 0 ? i - 1 : i, i1 = i < tn - 1 ? i + 1 : i;
      const dx = TX[i1] - TX[i0], dy = TY[i1] - TY[i0];
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L > 1e-6) { NX[i] = -dy / L; NY[i] = dx / L; }
      else if (i > 0) { NX[i] = NX[i - 1]; NY[i] = NY[i - 1]; }
      else { NX[i] = 0; NY[i] = -1; }
    }
  }

  function ribbonPath(ctx, w0, w1, cap) {
    for (let i = 0; i < tn; i++) {
      const f = tn > 1 ? i / (tn - 1) : 0;
      TW[i] = 0.5 * (w0 + (w1 - w0) * Math.pow(f, 0.8));
    }
    ctx.beginPath();
    ctx.moveTo(TX[0] + NX[0] * TW[0], TY[0] + NY[0] * TW[0]);
    for (let i = 1; i < tn; i++) ctx.lineTo(TX[i] + NX[i] * TW[i], TY[i] + NY[i] * TW[i]);
    const e = tn - 1, w = TW[e];
    if (cap) ctx.quadraticCurveTo(TX[e] + NY[e] * w * 2, TY[e] - NX[e] * w * 2, TX[e] - NX[e] * w, TY[e] - NY[e] * w);
    else ctx.lineTo(TX[e] - NX[e] * w, TY[e] - NY[e] * w);
    for (let i = e - 1; i >= 0; i--) ctx.lineTo(TX[i] - NX[i] * TW[i], TY[i] - NY[i] * TW[i]);
    ctx.closePath();
  }

  const DASH = [7, 34], NODASH = [];
  // Fill + edge + highlight stripe (+ travelling sheen when taut).
  function drawRibbon(ctx, S, w0, w1, alpha, sheen, time, cap) {
    if (tn < 2) return;
    tNormals();
    ctx.globalAlpha = GA * clamp(alpha, 0, 1);
    ribbonPath(ctx, w0, w1, cap !== false);
    ctx.fillStyle = COL.tongue; ctx.fill();
    ctx.lineWidth = 1.1 * S; ctx.strokeStyle = COL.tongueDark; ctx.stroke();
    // highlight on the side facing up (decided once so it never flips mid-tongue)
    const mid = tn >> 1;
    const side = NY[mid] < 0 ? 1 : -1;
    ctx.beginPath();
    const i0 = tn > 3 ? 1 : 0;
    for (let i = i0; i < tn; i++) {
      const k = side * TW[i] * 0.4;
      if (i === i0) ctx.moveTo(TX[i] + NX[i] * k, TY[i] + NY[i] * k);
      else ctx.lineTo(TX[i] + NX[i] * k, TY[i] + NY[i] * k);
    }
    ctx.lineWidth = Math.max(0.6, w0 * 0.24); ctx.strokeStyle = COL.tongueHi;
    ctx.globalAlpha = GA * clamp(alpha * 0.8, 0, 1); ctx.stroke();
    if (sheen) {
      DASH[0] = K.sheenDash * S; DASH[1] = K.sheenGap * S;
      ctx.setLineDash(DASH);
      ctx.lineDashOffset = -((time * K.sheenSpeed * S) % 100000);
      ctx.lineWidth = Math.max(0.5, w0 * 0.16); ctx.strokeStyle = COL.sheen;
      ctx.globalAlpha = GA * clamp(alpha * 0.9, 0, 1); ctx.stroke();
      ctx.setLineDash(NODASH);
    }
    ctx.globalAlpha = GA;
  }

  // Sticky splat where the tongue landed (flattened along the surface).
  const SPJ = new Float32Array(8);                  // in-game splat lumps (re-rolled per attach)
  const PSPJ = new Float32Array([0.3, -0.25, 0.4, -0.1, 0.2, -0.35, 0.15, -0.2]);  // portrait splat
  const SPX = new Float32Array(8), SPY = new Float32Array(8);
  function drawSplat(ctx, x, y, ang, S, pop, alpha, J) {
    const rx = 6.2 * S * pop, ry = 3.6 * S * pop, c = Math.cos(ang), s = Math.sin(ang);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, j = 1 + J[k] * 0.45;
      const lx = Math.cos(a) * rx * j, ly = Math.sin(a) * ry * j;
      SPX[k] = x + lx * c - ly * s; SPY[k] = y + lx * s + ly * c;
    }
    ctx.globalAlpha = GA * clamp(alpha, 0, 1);
    ctx.beginPath();
    ctx.moveTo((SPX[0] + SPX[1]) * 0.5, (SPY[0] + SPY[1]) * 0.5);
    for (let k = 1; k <= 8; k++) {
      const a = k % 8, b = (k + 1) % 8;
      ctx.quadraticCurveTo(SPX[a], SPY[a], (SPX[a] + SPX[b]) * 0.5, (SPY[a] + SPY[b]) * 0.5);
    }
    ctx.closePath();
    // droplets flung round the splat
    for (let k = 0; k < 3; k++) {
      const a = 0.8 + k * 2.2 + J[k] * 2, d = 1.55 + J[k + 3] * 0.4;
      const lx = Math.cos(a) * rx * d, ly = Math.sin(a) * ry * d * 1.3;
      const dxp = x + lx * c - ly * s, dyp = y + lx * s + ly * c, rr = Math.max(0.1, (0.7 + J[k + 5] * 0.6) * S * pop);
      ctx.moveTo(dxp + rr, dyp); ctx.arc(dxp, dyp, rr, 0, TAU);
    }
    ctx.fillStyle = COL.tongue; ctx.fill();
    ctx.lineWidth = 0.9 * S; ctx.strokeStyle = COL.tongueDark; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - c * rx * 0.25 + s * ry * 0.3, y - s * rx * 0.25 - c * ry * 0.3, Math.max(0.1, rx * 0.36), Math.max(0.1, ry * 0.28), ang, 0, TAU);
    ctx.fillStyle = COL.tongueHi; ctx.globalAlpha = GA * clamp(alpha * 0.85, 0, 1); ctx.fill();
    ctx.globalAlpha = GA;
  }

  function drawTipBulb(ctx, x, y, r, alpha) {
    ctx.globalAlpha = GA * clamp(alpha, 0, 1);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
    ctx.fillStyle = COL.tongue; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.1, r * 0.38), 0, TAU);
    ctx.fillStyle = COL.tongueHi; ctx.fill();
    ctx.globalAlpha = GA;
  }

  // Quadratic centreline mouth → (ax,ay) with sag + attach wobble.
  function buildLine(mx, my, ax, ay, sag, swing, wobA, wobPh) {
    tReset();
    const dx = ax - mx, dy = ay - my, d = Math.sqrt(dx * dx + dy * dy);
    const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
    const nx = -uy, ny = ux;
    const cx = (mx + ax) * 0.5 + swing, cy = (my + ay) * 0.5 + sag * 2;
    const N = wobA > 0.05 ? 28 : (sag > 1 ? 20 : 12);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1), a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
      let x = a * mx + b * cx + c * ax, y = a * my + b * cy + c * ay;
      if (wobA > 0.05) {
        const w = wobA * Math.sin(Math.PI * s) * Math.sin(s * K.wobbleWaves * TAU - wobPh);
        x += nx * w; y += ny * w;
      }
      tPush(x, y);
    }
  }

  // =====================================================================
  // In-game state (closure)
  // =====================================================================
  const spr = () => ({ x: 0, v: 0 });
  const st = {
    g: null, player: null, valid: false, snap: false, listening: false,
    px: 0, py: 0, pvx: 0, pvy: 0, ax: 0, ay: 0,
    th: spr(), fx: 1, sq: spr(), nu: spr(), tau: spr(), jaw: 0,
    legU: [spr(), spr(), spr(), spr()], legB: [spr(), spr(), spr(), spr()],
    tail1: spr(), tail2: spr(), earN: spr(), earF: spr(),
    phiD: 0, tuck: 0, boostW: 0, walkW: 0, walkPh: 0, floatW: 0,
    wideW: 0, happyW: 0, ouch: 0, meh: 0, blinkT: 3, blinking: 0, twitchT: 4,
    lookX: 1, lookY: 0,
    prevActive: false, lastAX: 0, lastAY: 0, retractT: -10, retX: 0, retY: 0,
    cutT: -10, cutDX: 1, cutDY: 0,
    splatFor: -1,
    lickExt: 0, lickTX: 0, lickTY: 0, vt: 0,
    mx: 0, my: 0,
  };

  function spring(s, target, omega, zeta, dt) {
    if (!isFinite(target)) return;
    if (st.snap) { s.x = target; s.v = 0; return; }
    if (!(dt > 0)) return;
    const n = Math.min(10, Math.ceil(dt * 120));
    const h = dt / n, w2 = omega * omega, c = 2 * zeta * omega;
    for (let i = 0; i < n; i++) { s.v += (w2 * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = target; s.v = 0; }
  }
  function aspring(s, target, omega, zeta, dt) {
    if (!isFinite(target)) return;
    if (!isFinite(s.x)) { s.x = 0; s.v = 0; }
    spring(s, s.x + wrap(target - s.x), omega, zeta, dt);
    if (s.x > Math.PI) s.x -= TAU; else if (s.x < -Math.PI) s.x += TAU;
  }

  // Exponential ease toward a target (instant while snapping).
  function easeTo(cur, tgt, rate, dt) { return st.snap ? tgt : cur + (tgt - cur) * (1 - Math.exp(-dt * rate)); }

  function onEvent(type, d) {
    const g = st.g;
    switch (type) {
      case 'jump': st.tuck = 1; st.sq.v -= 6; break;
      case 'land': st.sq.v += clamp(fin(d.speed, 300) / 450, 0.3, 2.2) * 9; break;
      case 'tongueAttach': st.sq.v -= 3.5; st.tau.v += 4; break;
      case 'tongueMiss': st.meh = 0.7; break;
      case 'tongueCut': {
        st.ouch = 0.55; st.cutT = g ? fin(g.time, 0) : 0;
        const p = g && g.player;
        if (p) {
          const dx = fin(d.x, p.x) - p.x, dy = fin(d.y, p.y) - p.y, L = Math.sqrt(dx * dx + dy * dy);
          if (L > 1e-3) { st.cutDX = dx / L; st.cutDY = dy / L; }
        }
        break;
      }
      case 'respawn': case 'runStart': st.valid = false; break;
    }
  }

  // Look toward world point (tx,ty) → angle in the facing-normalised rig frame, from the poll.
  function rigAngleTo(P, tx, ty, theta, fs) {
    xf(P, RIG.hx, RIG.hy);
    const dx = tx - OUT.x, dy = ty - OUT.y;
    const c = Math.cos(theta), s = Math.sin(theta);
    const bx = (c * dx + s * dy) * fs, by = -s * dx + c * dy;
    return Math.atan2(by, bx);
  }

  function updatePose(g, dt) {
    const p = g.player, r = g.rope || {}, C = ASCENT.CONFIG || {};
    const time = fin(g.time, 0);
    const S = fin(C.GIRAFFE_SCALE, 1);
    const radius = fin(p.radius, 16);
    const px = fin(p.x, 0), py = fin(p.y, 0), vx = fin(p.vx, 0), vy = fin(p.vy, 0);
    const speed = Math.sqrt(vx * vx + vy * vy);
    const goal = g.goal;
    const victory = !!(goal && goal.reached);
    const attached = !!r.active && !victory;
    const shooting = !!r.shooting && !victory;
    const onGround = !!p.onGround && !victory;
    const fall = clamp(fin(g.fallShake, 0), 0, 1);

    // --- teleport / replacement → snap everything
    const jx = px - st.px, jy = py - st.py;
    if (st.player !== p || !st.valid || jx * jx + jy * jy > 260 * 260) {
      st.player = p; st.valid = true; st.snap = true;
      st.pvx = vx; st.pvy = vy; st.ax = 0; st.ay = 0;
      st.fx = p.facing < 0 ? -1 : 1;
      st.sq.x = 0; st.sq.v = 0; st.tuck = 0; st.jaw = 0;
      st.prevActive = !!r.active; st.retractT = -10;
      st.wideW = 0; st.happyW = 0; st.ouch = 0; st.meh = 0;
      st.boostW = 0; st.walkW = 0; st.floatW = 0;
    }
    st.px = px; st.py = py;
    if (!st.snap) dt = clamp(fin(dt, 0), 0, 0.1); else dt = 0;

    // --- acceleration (smoothed, clamped)
    if (dt > 0) {
      const k = 1 - Math.exp(-dt * 14);
      st.ax += (clamp((vx - st.pvx) / dt, -6000, 6000) - st.ax) * k;
      st.ay += (clamp((vy - st.pvy) / dt, -6000, 6000) - st.ay) * k;
    }
    st.pvx = vx; st.pvy = vy;

    // --- facing flip: squash through zero width; mirror θ as we pass zero
    const fT = p.facing < 0 ? -1 : 1;
    if (st.fx !== fT) {
      const prev = st.fx >= 0 ? 1 : -1;
      st.fx = st.snap ? fT : st.fx + clamp(fT - st.fx, -K.flipRate * dt, K.flipRate * dt);
      if ((st.fx >= 0 ? 1 : -1) !== prev) { st.th.x = -st.th.x; st.th.v = -st.th.v; }
    }
    const fs = st.fx >= 0 ? 1 : -1;

    // --- squash spring
    spring(st.sq, 0, 15, 0.32, dt);
    const sq = clamp(st.sq.x, -0.7, 0.9);

    // --- ground blend (rig slides onto its hooves near the planet)
    const gd = g.ground ? fin(g.ground.y, 1e9) - (py + radius) : 1e9;
    const gb = victory ? 0 : onGround ? 1 : clamp(1 - gd / K.groundBlendRange, 0, 1);
    const airW = 1 - gb;
    bodyFrame(st.fx, sq, gb, S, radius);

    // --- body rotation target
    let thT = 0, om = K.groundOmega, ze = K.groundZeta, thRope = st.th.x;
    let Tx = 0, Ty = 0;
    if (victory) {
      const gx = fin(goal.x, px), gy = fin(goal.y, py), gr = fin(goal.radius, 40);
      let ux = st.mx - gx, uy = st.my - gy;
      const ul = Math.sqrt(ux * ux + uy * uy);
      if (ul > 1e-3) { ux /= ul; uy /= ul; } else { ux = -fs; uy = 0; }
      Tx = gx + ux * gr * K.munchReach; Ty = gy + uy * gr * K.munchReach - gr * 0.12;
      thT = 0.06 * fs; om = 6; ze = 0.8;
    } else if (attached || shooting) {
      Tx = fin(attached ? r.x : r.shootX, px); Ty = fin(attached ? r.y : r.shootY, py);
      mouthRig(K.hangNu, K.hangTau, K.jawTongue);
      const mxB = BA * OUT.x, myB = BB * OUT.y + BC;
      const dx = Tx - px, dy = Ty - py;
      if (dx * dx + dy * dy > 1) thRope = wrap(Math.atan2(dy, dx) - Math.atan2(myB, mxB));
      const lean = clamp(vx / 900, -1, 1) * 0.05;
      thT = thRope + wrap(lean - thRope) * gb;
      if (shooting) { om = K.shootOmega; ze = K.shootZeta; }
      else if (r.taut || !(fin(r.slack, 0) > 1)) { om = K.ropeOmega; ze = K.ropeZeta; }
      else { om = K.slackOmega; ze = K.ropeZeta; }
      if (gb > 0.5) { om = Math.max(om, K.groundOmega); ze = K.groundZeta; }
    } else if (gb > 0.999) {
      thT = clamp(vx / 900, -1, 1) * 0.05;
    } else {
      const rise = clamp(-vy / 700, 0, 1);
      const dive = smooth(clamp((vy - K.diveStart) / K.diveRange, 0, 1));
      const lean = clamp(vx / 900, -1, 1) * K.leanMax;
      let thF = fs * (-K.noseUp * rise + K.diveMax * dive) + lean;
      if (g.inGravityWell) thF += fs * 0.4 * Math.sin(time * 2.4);
      let u = gb;
      if (vy > 60 && gd < 1e8) u = Math.max(u, clamp(1 - (gd / vy - 0.12) / 0.4, 0, 1));   // right itself before landing
      thT = thF * (1 - u);
      om = K.freeOmega + 12 * u; ze = K.freeZeta;
    }
    aspring(st.th, thT, om, ze, dt);
    const theta = st.th.x;
    const c0 = Math.cos(theta), s0 = Math.sin(theta);
    const arx = (c0 * st.ax + s0 * st.ay) * fs, ary = -s0 * st.ax + c0 * st.ay;

    // --- neck bend / head nod
    let nuT = 0, tauT = 0, nuOm = 10, nuZe = 0.55;
    let lookA = null;
    if (attached || shooting) {
      const resid = wrap(thRope - theta);            // what the body hasn't caught up with yet
      nuT = K.hangNu + clamp(resid * 0.8, -0.5, 0.5) + 0.03 * Math.sin(time * 1.7);
      tauT = K.hangTau + clamp(resid * 0.5, -0.35, 0.3);
      if (shooting) { nuOm = 34; nuZe = 0.7; } else { nuOm = 12; nuZe = 0.5; }
      lookA = rigAngleTo(GP, Tx, Ty, theta, fs);
    } else if (victory) {
      const a = rigAngleTo(GP, Tx, Ty, theta, fs), e0 = wrap(a - RIG.h0);
      nuT = clamp(e0 * 0.4, -0.6, 0.5); tauT = clamp(e0 * 0.6, -1.0, 0.5);
      lookA = a;
    } else {
      const aim = g.aim;
      if (aim && aim.visible && g.state === 'playing') {
        let ax = fin(aim.worldX, NaN), ay = fin(aim.worldY, NaN);
        if (!isFinite(ax) || !isFinite(ay) || g._padAiming) { const an = fin(aim.angle, -1.57); ax = px + Math.cos(an) * 300; ay = py + Math.sin(an) * 300; }
        const a = rigAngleTo(GP, ax, ay, theta, fs), e0 = wrap(a - RIG.h0);
        nuT = clamp(e0 * 0.16, -0.22, 0.22); tauT = clamp(e0 * 0.3, -0.5, 0.35);
        lookA = a;
      } else if (speed > 200) {
        lookA = rigAngleTo(GP, px + vx, py + vy, theta, fs);
      }
      nuT += 0.04 * Math.sin(time * 1.3) + 0.05 * st.walkW * Math.sin(st.walkPh * 2);
    }
    nuT += clamp(-arx * 0.00011, -0.16, 0.16) * airW;
    spring(st.nu, clamp(nuT, -0.75, 0.6), nuOm, nuZe, dt);
    spring(st.tau, clamp(tauT, -1.15, 0.55), nuOm * 1.1, nuZe, dt);

    // eyes look toward the target (in the head frame)
    if (lookA !== null) {
      const la = lookA - st.nu.x - st.tau.x;
      st.lookX += (Math.cos(la) - st.lookX) * (st.snap ? 1 : 1 - Math.exp(-dt * 12));
      st.lookY += (Math.sin(la) - st.lookY) * (st.snap ? 1 : 1 - Math.exp(-dt * 12));
    } else {
      st.lookX += (0.95 - st.lookX) * (st.snap ? 1 : 1 - Math.exp(-dt * 4));
      st.lookY += (0.2 - st.lookY) * (st.snap ? 1 : 1 - Math.exp(-dt * 4));
    }

    // --- tongue retraction bookkeeping (release / phase / crumble detach)
    if (st.prevActive && !r.active && !st.snap) {
      const cut = r.failedCause === 'cut' && fin(r.failedRopeTimer, 0) > fin(r.failedRopeMaxTime, 0.8) - 0.1;
      if (!cut) { st.retractT = time; st.retX = st.lastAX; st.retY = st.lastAY; }
    }
    if (r.active) { st.lastAX = fin(r.x, px); st.lastAY = fin(r.y, py); }
    st.prevActive = !!r.active;
    if (r.active && r.attachTime !== st.splatFor) {
      st.splatFor = r.attachTime;
      for (let k = 0; k < 8; k++) SPJ[k] = Math.random() - 0.5;
    }
    const retracting = time - st.retractT < K.retractTime;
    const cutStub = r.failedCause === 'cut' && fin(r.failedRopeTimer, 0) > 0;

    // --- victory lick / chew cycle
    st.lickExt = 0;
    if (victory) {
      const vt = time - fin(goal.reachedAt, time) - 0.5;
      st.vt = vt;
      if (vt > 0) {
        const q = (vt % K.munchCycle) / K.munchCycle;
        st.lickExt = q < 0.45 ? Math.sin(q / 0.45 * Math.PI) : 0;
      }
      st.lickTX = Tx; st.lickTY = Ty;
    }

    // --- jaw
    let jawT;
    if (victory) jawT = st.lickExt > 0.02 ? K.jawTongue : 0.04 + 0.2 * Math.max(0, Math.sin(Math.max(0, st.vt) * 11));
    else if (attached || shooting || retracting || cutStub) jawT = K.jawTongue;
    else jawT = 0.16 * st.wideW;
    st.jaw = st.snap ? jawT : st.jaw + (jawT - st.jaw) * (1 - Math.exp(-dt * 22));

    // --- dangle direction: tension when hanging, drag-trailing when flying, else down
    let Dx = 0, Dy = 1;
    if (attached) {
      const dx = px - fin(r.x, px), dy = py - fin(r.y, py), d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) { Dx = dx / d; Dy = dy / d; }
    } else if (!onGround && !victory && speed > 1) {
      const w = clamp((speed - 120) / 500, 0, 1);
      Dx = -vx / speed * w; Dy = -vy / speed * w + (1 - w);
      const d = Math.sqrt(Dx * Dx + Dy * Dy);
      if (d > 1e-3) { Dx /= d; Dy /= d; } else { Dx = 0; Dy = 1; }
    }
    const bxD = (c0 * Dx + s0 * Dy) * fs, byD = -s0 * Dx + c0 * Dy;
    let phiD = Math.atan2(bxD, byD);
    if (Math.abs(phiD) > 2.6 && st.phiD * phiD < 0) phiD -= TAU * Math.sign(phiD);   // no flip-flop at "straight up"
    st.phiD = phiD;

    // --- motion weights
    st.tuck = Math.max(0, st.tuck - dt / 0.5);
    st.boostW = easeTo(st.boostW, p.boosting && attached ? 1 : 0, 10, dt);
    const walking = onGround && Math.abs(vx) > 25 && !attached;
    st.walkW = easeTo(st.walkW, walking ? 1 : 0, 8, dt);
    st.walkPh += Math.abs(vx) * dt / 9.5;
    if (st.walkPh > 1000) st.walkPh -= 20 * Math.PI;
    st.floatW = easeTo(st.floatW, (!onGround && !attached && (speed < 160 || victory)) ? 1 : 0, 3, dt);

    // --- legs
    const Kd = attached ? 0.75 : 0.55;
    for (let i = 0; i < 4; i++) {
      let u = lerp(REST_GU[i], REST_AU[i], airW) + clamp(phiD * Kd, -1.25, 1.25) * airW - clamp(arx * 0.0002, -0.45, 0.45) * airW;
      let b = lerp(REST_GB[i], REST_AB[i], airW);
      if (st.tuck > 0) { const w = smooth(clamp(st.tuck, 0, 1)); u = lerp(u, TUCK_U[i], w); b = lerp(b, TUCK_B[i], w); }
      const lom = gb > 0.5 ? 28 : 10.5 + i * 0.9, lze = gb > 0.5 ? 1 : 0.3;
      spring(st.legU[i], u, lom, lze, dt);
      spring(st.legB[i], b, lom * 1.2, lze + 0.1, dt);
    }

    // --- tail (lags, trails, swishes)
    let tT = lerp(-0.1, -0.45, airW) + clamp(phiD * 0.85, -1.6, 0.3) * airW - clamp(arx * 0.00025, -0.6, 0.6) * airW;
    tT += gb > 0.5 ? 0.22 * Math.sin(time * 1.6) : 0.12 * Math.sin(time * 2.1);
    spring(st.tail1, clamp(tT, -2.4, 0.35), 7, 0.3, dt);
    spring(st.tail2, st.tail1.x + 0.22 * Math.sin(time * 2.4 + 0.7), 9, 0.35, dt);

    // --- ears (floppy)
    let eT = -0.15 - 0.5 * byD * airW + clamp(ary * 0.0005, -0.5, 0.5) * airW;
    if (fall > 0.01) eT += 0.35 * fall * Math.sin(time * 24);
    eT = clamp(eT, -1.2, 1.1);
    st.twitchT -= dt;
    if (st.twitchT <= 0) { st.twitchT = 2.5 + Math.random() * 4; st.earN.v += (Math.random() < 0.5 ? -1 : 1) * 9; }
    spring(st.earN, eT, 12, 0.2, dt);
    spring(st.earF, eT + 0.05, 10.5, 0.22, dt);

    // --- expressions
    st.ouch = Math.max(0, st.ouch - dt);
    st.meh = Math.max(0, st.meh - dt);
    const wideT = (fall > 0.3 || g.inGravityWell || st.ouch > 0) ? 1 : 0;
    const happyT = (p.boosting || (attached && speed > 700) || (!attached && !onGround && speed > 700 && vy < -150)) ? 1 : 0;
    st.wideW = easeTo(st.wideW, wideT, 10, dt);
    st.happyW = easeTo(st.happyW, happyT, 8, dt);
    st.blinkT -= dt;
    if (st.blinkT <= 0) { st.blinking = 0.14; st.blinkT = 2.5 + Math.random() * 2.5; }
    st.blinking = Math.max(0, st.blinking - dt);
    let eye = 0;
    if (victory) eye = 2;
    else if (st.ouch > 0) eye = 4;
    else if (st.wideW > 0.5) eye = 1;
    else if (st.happyW > 0.5) eye = 2;
    else if (st.meh > 0) eye = 5;
    if (st.blinking > 0 && (eye === 0 || eye === 1 || eye === 5)) eye = 3;

    // --- fill the pose
    const P = GP;
    P.S = S;
    setMatrix(P, px, py, theta);
    P.nu = st.nu.x; P.tau = st.tau.x; P.jaw = clamp(st.jaw, 0, 0.6);
    for (let i = 0; i < 4; i++) {
      const ph = PADDLE_PH[i], fg = FLEX[i];
      let du = 0, db = 0;
      if (st.boostW > 0.01) { const w = st.boostW; du += 0.5 * w * Math.sin(time * 13 + ph); db += fg * 0.6 * w * (0.5 + 0.5 * Math.sin(time * 13 + ph + 1.4)); }
      if (st.floatW > 0.01) { const w = st.floatW; du += 0.2 * w * Math.sin(time * 3.1 + ph); db += fg * 0.25 * w * (0.5 + 0.5 * Math.sin(time * 3.1 + ph + 1.2)); }
      if (fall > 0.01) { du += 0.5 * fall * Math.sin(time * 17 + ph * 1.7); db += fg * 0.45 * fall * (0.5 + 0.5 * Math.sin(time * 14 + ph)); }
      if (st.walkW > 0.01) { const wp = st.walkPh + WALK_OFF[i]; du += 0.3 * st.walkW * Math.sin(wp); db += fg * 0.65 * st.walkW * Math.max(0, Math.cos(wp)); }
      P.legU[i] = st.legU[i].x + du; P.legB[i] = st.legB[i].x + db;
    }
    P.tail1 = st.tail1.x; P.tail2 = st.tail2.x;
    P.earN = st.earN.x; P.earF = st.earF.x;
    P.eye = eye;
    const ll = Math.sqrt(st.lookX * st.lookX + st.lookY * st.lookY) || 1;
    P.lookX = st.lookX / ll; P.lookY = st.lookY / ll;
    P.smile = victory || st.happyW > 0.5 ? 1 : st.wideW > 0.5 ? -0.4 : st.meh > 0 ? 0 : 0.35;
    P.blush = victory ? 1 : st.happyW;
    P.leaf = victory && st.lickExt < 0.05 && st.vt > 0 ? 1 : 0;
    P.leafAng = 0.25 * Math.sin(Math.max(0, st.vt) * 11);
    P.tongueRoot = attached || shooting || retracting || cutStub || st.lickExt > 0.02;
    P.rimX = -0.55 * K.rimW * Math.sqrt(S); P.rimY = -0.83 * K.rimW * Math.sqrt(S);
    P.aura = 1;
    mouthRig(P.nu, P.tau, P.jaw);
    xf(P, OUT.x, OUT.y);
    P.mouthX = OUT.x; P.mouthY = OUT.y;
    st.mx = OUT.x; st.my = OUT.y;
    st.snap = false;
  }

  // =====================================================================
  // In-game tongue layer
  // =====================================================================
  const PT = { x: 0, y: 0 };   // sanitised player position for drawing
  function drawGameTongue(ctx, g, P, time) {
    const r = g.rope, S = P.S;
    const p = PT; PT.x = fin(g.player.x, 0); PT.y = fin(g.player.y, 0);
    const mx = P.mouthX, my = P.mouthY;
    const w0 = K.tongueW0 * S, w1 = K.tongueW1 * S;
    const victory = !!(g.goal && g.goal.reached);

    if (victory && st.lickExt > 0.01) {
      // curl out to the Acacia's leaves and back
      const e = st.lickExt, tx = mx + (st.lickTX - mx) * e, ty = my + (st.lickTY - my) * e;
      const dx = tx - mx, dy = ty - my, L = Math.sqrt(dx * dx + dy * dy);
      let nx = -dy, ny = dx;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const nl = Math.sqrt(nx * nx + ny * ny) || 1;
      const cx = (mx + tx) * 0.5 + nx / nl * L * 0.35, cy = (my + ty) * 0.5 + ny / nl * L * 0.35;
      tReset();
      for (let i = 0; i < 12; i++) {
        const s = i / 11, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
        tPush(a * mx + b * cx + c * tx, a * my + b * cy + c * ty);
      }
      drawRibbon(ctx, S, w0 * 0.85, w1, 1, false, time, true);
      return;
    }
    if (victory) return;

    if (r.active) {
      const ax = fin(r.x, mx), ay = fin(r.y, my);
      const age = typeof r.attachTime === 'number' ? time - r.attachTime : 99;
      const wob = age >= 0 && age < K.wobbleTime ? K.wobbleAmp * S * Math.pow(1 - age / K.wobbleTime, 2) : 0;
      const slack = fin(r.slack, 0);
      const dx = ax - mx, dy = ay - my, d = Math.sqrt(dx * dx + dy * dy);
      const taut = !!r.taut || slack < 0.5;
      const sag = taut ? 0 : Math.min(K.sagMax * S, Math.sqrt(3 * Math.max(d, 30) * slack / 8));
      buildLine(mx, my, ax, ay, sag, Math.sin(time * 2.3) * sag * 0.22, wob, age * K.wobbleSpeed);
      // long taut tongues thin out a touch (it's stretching!)
      const stretch = taut ? 1 - 0.18 * clamp(d / fin(r.maxLength, 970), 0, 1) : 1;
      drawRibbon(ctx, S, w0 * stretch, w1 * stretch, 1, taut, time, true);
      const pl = r.attachedPlatform;
      const ang = pl ? fin(pl.angle, 0) : 0;
      const pop = age >= 0 && age < 0.22 ? 1 + 0.55 * Math.pow(1 - age / 0.22, 2) * Math.cos(age * 30) : 1;
      drawSplat(ctx, ax, ay, ang, S, Math.max(0.3, pop), 1, SPJ);
    } else if (r.shooting) {
      const tx = fin(r.shootX, mx), ty = fin(r.shootY, my);
      const age = typeof r.shootTime === 'number' ? time - r.shootTime : 0;
      tReset();
      const dx = tx - mx, dy = ty - my, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / d, ny = dx / d;
      for (let i = 0; i < 14; i++) {
        const s = i / 13, w = 1.8 * S * Math.sin(Math.PI * s) * Math.sin(s * 8 - age * 50);
        tPush(mx + dx * s + nx * w, my + dy * s + ny * w);
      }
      drawRibbon(ctx, S, w0, w1 * 1.05, 1, false, time, true);
      drawTipBulb(ctx, tx, ty, w1 * 0.75, 1);
    }

    // snapping back into the mouth after a release
    const rq = (time - st.retractT) / K.retractTime;
    if (!r.active && !r.shooting && rq >= 0 && rq < 1) {
      const dx = st.retX - mx, dy = st.retY - my, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        const len = d * (1 - rq) * (1 - rq), ux = dx / d, uy = dy / d;
        tReset();
        for (let i = 0; i < 10; i++) {
          const s = i / 9, w = Math.sin(s * TAU * 1.5 - rq * 20) * len * 0.05 * Math.sin(Math.PI * s);
          tPush(mx + ux * len * s - uy * w, my + uy * len * s + ux * w);
        }
        drawRibbon(ctx, S, w0, w1, 1, false, time, true);
      }
    }

    // failed licks
    const segs = r.failedRopeSegments;
    const ft = fin(r.failedRopeTimer, 0);
    if (ft > 0 && segs && segs.length > 1) {
      const alpha = clamp(ft / fin(r.failedRopeMaxTime, 0.8), 0, 1);
      if (r.failedCause === 'cut') {
        // severed piece drifting away
        const ml = Math.sqrt((mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y));
        tReset();
        let started = false;
        for (let i = 0; i < segs.length; i++) {
          const sgm = segs[i], sx = fin(sgm.x, NaN), sy = fin(sgm.y, NaN);
          if (!started) { const ddx = sx - p.x, ddy = sy - p.y; if (ddx * ddx + ddy * ddy < ml * ml * 0.85) continue; started = true; }
          tPush(sx, sy);
        }
        tBlur(2); tSmooth(); tSmooth();
        drawRibbon(ctx, S, w1 * 1.2, w1 * 0.9, Math.sqrt(alpha), false, time, true);
        // ragged stub at the mouth, drooping
        const L = 13 * S * (0.4 + 0.6 * alpha);
        tReset();
        for (let i = 0; i < 6; i++) {
          const s = i / 5;
          tPush(mx + st.cutDX * L * s, my + st.cutDY * L * s + L * 0.55 * s * s * (1 - alpha * 0.4) + Math.sin(time * 30) * s * 0.6 * S);
        }
        drawRibbon(ctx, S, w0, w0 * 0.72, 1, false, time, false);
        if (tn > 0) {
          ctx.beginPath(); ctx.arc(TX[tn - 1], TY[tn - 1], Math.max(0.1, w0 * 0.34), 0, TAU);
          ctx.fillStyle = COL.tongueHi; ctx.fill();
        }
      } else {
        // miss: the limp tongue flops and reels back in
        const n = segs.length, k = Math.max(2, Math.ceil(n * alpha));
        const s0x = fin(segs[0].x, mx), s0y = fin(segs[0].y, my);
        const ox = mx - s0x, oy = my - s0y;
        tReset();
        tPush(mx, my);
        for (let i = 1; i < k; i++) {
          const f = 1 - i / (n - 1);
          tPush(fin(segs[i].x, mx) + ox * f, fin(segs[i].y, my) + oy * f);
        }
        tBlur(3); tSmooth(); tSmooth();
        drawRibbon(ctx, S, w0 * 0.95, w1 * 0.95, Math.pow(alpha, 0.6), false, time, true);
      }
    }
  }

  // Dotted aim line from the mouth + target marker (+ cooldown ring).
  const DOTS = [0.01, 12];
  function uiCol(al) { const U = COL.ui; return 'rgba(' + U[0] + ',' + U[1] + ',' + U[2] + ',' + clamp(al, 0, 1) + ')'; }
  function drawReticle(ctx, g, P, time) {
    const r = g.rope, a = g.aim, S = P.S;
    const p = PT; PT.x = fin(g.player.x, 0); PT.y = fin(g.player.y, 0);
    const ang = fin(a.angle, -Math.PI / 2), dx = Math.cos(ang), dy = Math.sin(ang);
    const maxL = Math.max(60, fin(r.maxLength, 900));
    let L;
    const wx = a.worldX, wy = a.worldY;
    if (typeof wx === 'number' && typeof wy === 'number' && isFinite(wx) && isFinite(wy) && !g._padAiming) {
      L = Math.sqrt((wx - p.x) * (wx - p.x) + (wy - p.y) * (wy - p.y));
    } else L = maxL * 0.5;
    const mx = P.mouthX, my = P.mouthY;
    const ml = Math.sqrt((mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y));
    const atMax = L >= maxL;
    L = clamp(L, ml + 30, maxL);
    const ex = p.x + dx * L, ey = p.y + dy * L;
    const cdT = fin(r.cooldownTimer, 0);
    const cd = cdT > 0 ? clamp(cdT / Math.max(0.01, fin(r.cooldownDuration, 0.4)), 0, 1) : 0;
    const dim = cdT > 0 ? 0.35 : 1;

    // start just past the lips
    const lx = ex - mx, ly = ey - my, ld = Math.sqrt(lx * lx + ly * ly) || 1;
    const sx = mx + lx / ld * 9 * S, sy = my + ly / ld * 9 * S;
    ctx.save();
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, uiCol(0.75 * dim));
    grad.addColorStop(1, uiCol(0.14 * dim));
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineWidth = K.aimDot * S;
    DOTS[1] = K.aimGap * S;
    ctx.setLineDash(DOTS);
    ctx.lineDashOffset = -((time * 24 * S) % (K.aimGap * S * 1000));
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash(NODASH);

    // marker: ring + four ticks (a small dashed ring when the cursor is out of reach)
    const pulse = 1 + 0.08 * Math.sin(time * 6);
    const R = K.aimMarkerR * S * pulse * (atMax ? 0.8 : 1);
    ctx.beginPath();
    ctx.arc(ex, ey, R, 0, TAU);
    if (!atMax) {
      for (let k = 0; k < 4; k++) {
        const t = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(t), s = Math.sin(t);
        ctx.moveTo(ex + c * R * 0.45, ey + s * R * 0.45); ctx.lineTo(ex + c * R * 1.55, ey + s * R * 1.55);
      }
    }
    ctx.lineWidth = 1.4 * S;
    ctx.strokeStyle = uiCol((atMax ? 0.45 : 0.85) * dim);
    ctx.stroke();
    if (cd > 0) {
      ctx.beginPath();
      ctx.arc(ex, ey, R + 4 * S, -Math.PI / 2, -Math.PI / 2 + TAU * cd);
      ctx.lineWidth = 2 * S; ctx.strokeStyle = COL.tongueHi; ctx.stroke();
    }
    ctx.restore();
  }

  // =====================================================================
  // Portrait (menus): procedural pose, same drawing code
  // =====================================================================
  function drawPortrait(ctx, x, y, scale, t, opts) {
    ensureBuilt();
    const o = opts || {};
    const C = ASCENT.CONFIG || {};
    const S = Math.max(0.05, fin(scale, 1)) * fin(C.GIRAFFE_SCALE, 1);
    t = fin(t, 0);
    x = fin(x, 0); y = fin(y, 0);
    const pose = o.pose === 'lick' || o.pose === 'munch' ? o.pose : 'float';
    const facing = o.facing < 0 ? -1 : 1;
    const tt = o.tongueTo && isFinite(o.tongueTo.x) && isFinite(o.tongueTo.y) ? o.tongueTo : null;
    const P = PP;
    const lick = pose === 'lick', munch = pose === 'munch';

    // munch lick cycle (only with a target)
    let ext = 0;
    if (munch && tt) { const q = (t % K.munchCycle) / K.munchCycle; ext = q < 0.45 ? Math.sin(q / 0.45 * Math.PI) : 0; }
    const tongueToTarget = (lick && tt) || ext > 0.01;
    const blep = lick && !tt;

    let nu, tau, jaw;
    if (lick && tt) { nu = K.hangNu + 0.04 * Math.sin(t * 1.9); tau = K.hangTau + 0.05 * Math.sin(t * 2.3); jaw = K.jawTongue; }
    else if (blep) { nu = 0.03 * Math.sin(t * 1.2); tau = -0.18 + 0.06 * Math.sin(t * 1.7); jaw = K.jawTongue; }
    else if (munch) {
      nu = 0.05 * Math.sin(t * 1.1); tau = 0.08 + 0.05 * Math.sin(t * 5.5);
      jaw = ext > 0.02 ? K.jawTongue : 0.04 + 0.2 * Math.max(0, Math.sin(t * 11));
    } else { nu = 0.05 * Math.sin(t * 1.1); tau = 0.06 * Math.sin(t * 0.9 + 1); jaw = 0; }

    bodyFrame(facing, 0, 0, S, 16);
    let theta;
    if (typeof o.bodyAngle === 'number' && isFinite(o.bodyAngle)) theta = o.bodyAngle;
    else if (lick && tt) {
      mouthRig(nu, tau, jaw);
      const mxB = BA * OUT.x, myB = BB * OUT.y + BC;
      theta = wrap(Math.atan2(tt.y - y, tt.x - x) - Math.atan2(myB, mxB)) + 0.04 * Math.sin(t * 1.3);
    } else theta = facing * (0.07 * Math.sin(t * 0.8) - 0.05);
    P.S = S;
    setMatrix(P, x, y, theta);
    P.nu = nu; P.tau = tau; P.jaw = jaw;

    // dangle: away from the lick target, else down
    let Dx = 0, Dy = 1;
    if (lick && tt) { const dx = x - tt.x, dy = y - tt.y, d = Math.sqrt(dx * dx + dy * dy); if (d > 1) { Dx = dx / d; Dy = dy / d; } }
    const c0 = Math.cos(theta), s0 = Math.sin(theta);
    const phiD = Math.atan2((c0 * Dx + s0 * Dy) * facing, -s0 * Dx + c0 * Dy);
    const kick = lick ? 1.6 : 1;
    for (let i = 0; i < 4; i++) {
      const ph = PADDLE_PH[i], fg = FLEX[i];
      P.legU[i] = REST_AU[i] + clamp(phiD * 0.6, -1.2, 1.2) + 0.2 * Math.sin(t * 1.7 * kick + ph);
      P.legB[i] = REST_AB[i] + fg * 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 * kick + ph + 1.2));
    }
    P.tail1 = clamp(-0.45 + clamp(phiD * 0.8, -1.4, 0.3) + 0.2 * Math.sin(t * 1.5), -2.4, 0.35);
    P.tail2 = P.tail1 + 0.3 * Math.sin(t * 1.5 - 0.9);
    const flick = Math.max(0, Math.sin(t * 0.7 + 0.4) - 0.96) * 18;   // occasional ear flick
    P.earN = -0.18 + 0.12 * Math.sin(t * 1.3) + flick * 0.3;
    P.earF = -0.12 + 0.1 * Math.sin(t * 1.3 - 0.5);

    const blink = ((t + 0.37) % 3.1) > 2.96;
    P.eye = lick || munch ? 2 : blink ? 3 : 0;
    let la = 0.2;
    if (tt) {
      xf(P, RIG.ex, RIG.ey);
      const dx = tt.x - OUT.x, dy = tt.y - OUT.y;
      la = Math.atan2(-s0 * dx + c0 * dy, (c0 * dx + s0 * dy) * facing) - nu - tau;
    }
    P.lookX = Math.cos(la); P.lookY = Math.sin(la);
    P.smile = lick || munch ? 1 : 0.45;
    P.blush = lick || munch ? 1 : 0.35;
    P.leaf = munch && ext < 0.05 ? 1 : 0;
    P.leafAng = 0.25 * Math.sin(t * 11);
    P.tongueRoot = lick || ext > 0.02;
    P.rimX = -0.55 * K.rimW * Math.sqrt(S); P.rimY = -0.83 * K.rimW * Math.sqrt(S);
    P.aura = o.aura === false ? 0 : 0.8;
    mouthRig(nu, tau, jaw);
    xf(P, OUT.x, OUT.y);
    const mx = OUT.x, my = OUT.y;
    P.mouthX = mx; P.mouthY = my;

    GA = clamp(fin(ctx.globalAlpha, 1), 0, 1);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const w0 = K.tongueW0 * S, w1 = K.tongueW1 * S;
    if (tongueToTarget) {
      const e = lick ? 1 : ext;
      const tx = mx + (tt.x - mx) * e, ty = my + (tt.y - my) * e;
      const d = Math.sqrt((tx - mx) * (tx - mx) + (ty - my) * (ty - my));
      if (lick) {
        // hanging from the target: a gently sagging, wobbling, glistening tongue + splat
        buildLine(mx, my, tx, ty, d * 0.05 + 2 * S, Math.sin(t * 1.8) * d * 0.03, S * (0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 2.2))), t * 6);
        drawRibbon(ctx, S, w0, w1, 1, true, t, true);
        drawSplat(ctx, tx, ty, 0.3 * Math.sin(t * 0.5), S * 0.8, 1, 1, PSPJ);
      } else {
        // munch: curl up and over toward the target
        let nx = -(ty - my), ny = tx - mx;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        buildLine(mx, my, tx, ty, ny / nl * d * 0.175, nx / nl * d * 0.35, 0, 0);
        drawRibbon(ctx, S, w0 * 0.85, w1, 1, false, t, true);
      }
    } else if (blep) {
      // playful lick: out forward-down, the tip curling up (as if licking its nose), in and out
      const ext = 0.5 + 0.5 * Math.sin(t * 3);
      const L = S * (7 + 9 * ext);
      xf(P, RIG.hx, RIG.hy);
      const a0 = Math.atan2(my - OUT.y, mx - OUT.x) + facing * 0.45;
      const N = 10, step = L / (N - 1);
      tReset();
      let qx = mx, qy = my;
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1), a = a0 - facing * (0.6 + 1.2 * ext) * s * s * 1.6;
        tPush(qx, qy);
        qx += Math.cos(a) * step; qy += Math.sin(a) * step;
      }
      drawRibbon(ctx, S, w0 * 0.85, w1 * 1.15, 1, false, t, true);
    }
    drawGiraffe(ctx, P);
    ctx.restore();
  }

  // =====================================================================
  // Public API
  // =====================================================================
  ASCENT.Giraffe = {
    K,

    init(g) {
      ensureBuilt();
      st.g = g;
      st.valid = false;
      buildGlows(false);
      if (!st.listening && ASCENT.FX && ASCENT.FX.on) { ASCENT.FX.on(onEvent); st.listening = true; }
    },

    // GPU context restored (main.js): the glow sprites are the only canvases
    // this style owns (geometry is plain data, gradients are per-frame).
    // Safe before init and when called repeatedly; the pose is left alone.
    rebuild(_g) { buildGlows(true); },

    update(g, dt) {
      if (!g || !g.player) return;
      ensureBuilt();
      st.g = g;
      updatePose(g, dt);
    },

    draw(ctx, g) {
      const p = g && g.player;
      if (!p) return;
      ensureBuilt();
      st.g = g;
      if (st.player !== p || !st.valid) updatePose(g, 0);
      const time = fin(g.time, 0);
      const P = GP, r = g.rope || {};
      GA = clamp(fin(ctx.globalAlpha, 1), 0, 1);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (g.debugFlying && haloSpr) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = GA * 0.45;
        const R = 46 * P.S;
        ctx.drawImage(haloSpr, fin(p.x, 0) - R, fin(p.y, 0) - R * 1.2, R * 2, R * 2);
        ctx.restore();
      }
      drawGameTongue(ctx, g, P, time);
      drawGiraffe(ctx, P);
      const victory = !!(g.goal && g.goal.reached);
      if (g.state === 'playing' && g.aim && g.aim.visible && !r.active && !r.shooting && !victory) drawReticle(ctx, g, P, time);
      ctx.restore();
    },

    drawPortrait(ctx, x, y, scale, t, opts) {
      if (!ctx) return;
      drawPortrait(ctx, x, y, scale, t, opts);
    },

    mouthPos(g) {
      const p = g && g.player;
      if (!p) return { x: 0, y: 0 };
      if (st.player === p && st.valid) return { x: st.mx, y: st.my };
      const S = fin((ASCENT.CONFIG || {}).GIRAFFE_SCALE, 1), f = p.facing < 0 ? -1 : 1;
      return { x: fin(p.x, 0) + f * 34 * S, y: fin(p.y, 0) - 27 * S };
    },
  };
})();

// Register as a selectable giraffe style (see giraffe.js, the dispatcher).
(ASCENT.GiraffeSkins = ASCENT.GiraffeSkins || {}).naturalist = ASCENT.Giraffe;
