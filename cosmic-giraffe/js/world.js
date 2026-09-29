/*
 * WORLD — everything that lives *in* the level, drawn in world coordinates.
 * =========================================================================
 * ASCENT.World paints the home planet the giraffe launches from, every
 * lickable slab, the four hazards and the Celestial Acacia at the top.
 * All draw calls run with the camera transform already applied (render.js).
 *
 *   drawBack       home-planet surface (savanna, acacias, the herd, a glowing
 *                  atmosphere rim), solar-wind currents, mini black holes,
 *                  solar-flare bands while idle / warning
 *   drawPlatforms  asteroid slabs (tinted by altitude), drifting slabs with
 *                  motion ghosts + thruster puffs, tumbling satellites,
 *                  hot-cracked meteorites (+ their debris), phase crystals
 *   drawGoal       the Celestial Acacia on its tiny planetoid (+ aura/beacon)
 *   drawFront      comets and the active plasma beams of solar flares
 *
 * Honesty rule for slabs: the tongue sticks anywhere inside the rotated
 * rect (width × 14). Every silhouette is generated to hug that rect (top edge
 * within ~1.5px, ends inset, underside hanging ≤ ~5px), so a lick that looks
 * like it hit, hit.
 *
 * Cost model: every outline / crater / crack / leaf set is a Path2D built
 * once per level from the object's seed (onLevel). Glows are radial-gradient
 * sprites rendered once at init and drawn with 'lighter'. Nothing allocates
 * canvases, gradients or paths per frame; only this module's own clock (_t)
 * changes in update(), gameplay state is only read. rebuild(g) re-renders the
 * sprites and gradients after a GPU context loss (see main.js).
 */
window.ASCENT = window.ASCENT || {};

(function () {
  // ---------------------------------------------------------------- knobs
  const K = {
    PLANET_MARGIN: 1600,        // home planet extends this far past each level edge (px)
    PLANET_FAR_PARALLAX: 0.5,   // far hills follow the camera by this much (0 world-fixed, 1 = sky)
    PLANET_MID_PARALLAX: 0.22,  // mid silhouettes (acacias + the herd)
    HORIZON_GLOW_HEIGHT: 760,   // warm atmosphere glow above the surface (px)
    FIREFLIES: 44,              // pollen motes drifting over the grass
    GHOST_TIME: 0.022,          // moving-slab motion ghost offset = velocity × this (s)
    GHOST_MAX: 34,              // … clamped to this many px
    WELL_CORE_MIN: 20,          // black-hole core radius for the smallest well (px)
    WELL_CORE_MAX: 28,          // … and the largest
    WELL_DISK_SQUASH: 0.3,      // accretion disk tilt (1 = face-on circle)
    WELL_INFALL: 14,            // infalling streaks per black hole
    WIND_RIBBONS: 3,            // aurora ribbons per solar-wind current
    FLARE_CHEVRON_GAP: 90,      // spacing of warning chevrons (px)
    GOAL_AURA: 700,             // radius of the Acacia's big soft glow (px)
    GOAL_BEACON: 3400,          // length of the faint light column below the Acacia (px)
    GOAL_LEAVES: 16,            // drifting leaves around the Acacia
    COMET_TAIL: 300,            // ion-tail length (px)
  };

  const TAU = Math.PI * 2;
  const PAL = ASCENT.PAL;
  const NO_DASH = [];
  const DASH_RING = [16, 14];
  const DASH_BAND = [10, 16];
  const DASH_GHOST = [5, 5];
  const DASH_PATH = [22, 18];

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const frac = (v) => v - Math.floor(v);
  // Stable pseudo-random value per (i, k) — for per-frame deterministic variety.
  const hash = (i, k) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);

  // Seeded PRNG (mulberry32) from an object's 0..1 seed plus a salt.
  function rng(seed, salt) {
    let s = ((seed * 4294967296) ^ Math.imul((salt | 0) + 1, 2654435761)) >>> 0;
    if (!s) s = 0x9e3779b9;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexRgb(h) {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  const rgbStr = (c) => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`;
  const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a) => `rgba(${rgbStr(c)},${a})`;

  // Add a polygon (flat [x,y,...]) to a Path2D, always with the same winding
  // so overlapping shapes union under the nonzero fill rule.
  function addPoly(p, pts) {
    const n = pts.length;
    if (n < 6) return;
    let area = 0;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    if (area >= 0) {
      p.moveTo(pts[0], pts[1]);
      for (let i = 2; i < n; i += 2) p.lineTo(pts[i], pts[i + 1]);
    } else {
      p.moveTo(pts[n - 2], pts[n - 1]);
      for (let i = n - 4; i >= 0; i -= 2) p.lineTo(pts[i], pts[i + 1]);
    }
    p.closePath();
  }
  // Clockwise ellipse as its own subpath (moveTo first so fills never bridge).
  function addEll(p, x, y, rx, ry, rot) {
    rx = Math.max(0.1, rx); ry = Math.max(0.1, ry); rot = rot || 0;
    p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
    p.ellipse(x, y, rx, ry, rot, 0, TAU);
    p.closePath();
  }
  // Tapered limb (trunk, branch, leg, neck) from (x0,y0) to (x1,y1).
  function addSeg(p, x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / L, ny = dx / L;
    addPoly(p, [x0 + nx * w0, y0 + ny * w0, x1 + nx * w1, y1 + ny * w1,
                x1 - nx * w1, y1 - ny * w1, x0 - nx * w0, y0 - ny * w0]);
  }

  // An acacia silhouette: forked trunk + flat umbrella canopy (+ maybe a tier).
  function addAcacia(p, x, base, H, Wc, R) {
    const lean = (R() - 0.5) * H * 0.12;
    const fx = x + lean, fy = base - H * 0.5;               // fork point
    const cy = base - H * 0.9;                               // canopy centre line
    const tw = 1.2 + H * 0.035;
    addSeg(p, x, base + 3, fx, fy, tw, tw * 0.75);
    const nb = 3 + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < nb; i++) {
      const u = nb === 1 ? 0.5 : i / (nb - 1);
      const ex = fx + (u - 0.5) * Wc * 0.62 + (R() - 0.5) * Wc * 0.08;
      addSeg(p, fx, fy + 2, ex, cy + H * 0.04, tw * 0.6, tw * 0.3);
    }
    // canopy: a flat plate of overlapping lobes, domed very slightly
    const lobes = Math.max(4, Math.round(Wc / 16));
    for (let i = 0; i < lobes; i++) {
      const u = i / (lobes - 1), e = Math.abs(u - 0.5) * 2;
      const lx = fx + (u - 0.5) * Wc * 0.86;
      const rx = Wc / lobes * (0.95 + R() * 0.35) * (1 - 0.25 * e);
      const ry = Math.max(2.2, H * 0.07 * (1 - 0.3 * e) + R() * 1.5);
      addEll(p, lx, cy + e * e * H * 0.035 - R() * 1.5, rx, ry, 0);
    }
    addEll(p, fx, cy - H * 0.03, Wc * 0.44, Math.max(2, H * 0.06), 0);
    if (R() < 0.45) {                                        // a lower side tier
      const s = R() < 0.5 ? -1 : 1;
      addEll(p, fx + s * Wc * 0.3, cy + H * 0.12, Wc * 0.2, Math.max(1.8, H * 0.045), 0);
      addSeg(p, fx, fy + 4, fx + s * Wc * 0.26, cy + H * 0.13, tw * 0.45, tw * 0.25);
    }
  }

  // A giraffe silhouette (one of the herd back home). f = facing ±1.
  function addGiraffe(p, x, base, Hh, f, R, grazing) {
    const u = Hh / 44;
    const by = base - 24 * u;
    addEll(p, x, by, 9.5 * u, 5 * u, -0.14 * f);             // body, shoulders high
    const legs = [6.2, 3.6, -4.6, -7.2];
    for (let i = 0; i < 4; i++) {
      const lx = x + f * legs[i] * u, top = by - (i < 2 ? 1.5 : -0.5) * u;
      addSeg(p, lx, top, lx + (R() - 0.5) * 1.2 * u, base, 1.0 * u, 0.7 * u);
    }
    addSeg(p, x - f * 8.6 * u, by - 1.5 * u, x - f * 10 * u, by + 7 * u, 0.5 * u, 0.3 * u); // tail
    if (grazing) {                                           // neck down to the grass
      const hx = x + f * 17 * u, hy = base - 5 * u;
      addSeg(p, x + f * 6 * u, by - 2 * u, hx, hy, 2.4 * u, 1.3 * u);
      addEll(p, hx + f * 1.5 * u, hy + 1.2 * u, 3.1 * u, 1.5 * u, f * 1.1);
    } else {
      const hx = x + f * 12 * u, hy = base - 41 * u;
      addSeg(p, x + f * 5.5 * u, by - 2.5 * u, hx, hy, 2.5 * u, 1.3 * u);
      addEll(p, hx + f * 2.2 * u, hy + 0.6 * u, 3.3 * u, 1.6 * u, f * 0.35);
      addSeg(p, hx - f * 0.3 * u, hy - 1 * u, hx - f * 0.8 * u, hy - 4.2 * u, 0.55 * u, 0.5 * u); // ossicones
      addSeg(p, hx + f * 1.1 * u, hy - 1 * u, hx + f * 0.9 * u, hy - 4.0 * u, 0.55 * u, 0.5 * u);
      addEll(p, hx - f * 1.2 * u, hy - 0.8 * u, 1.4 * u, 0.6 * u, -f * 0.5);          // ear
    }
  }

  // ---------------------------------------------------------------- sprites
  const S = {};

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Soft radial glow: c0 at the very centre, c1 falling off to nothing.
  function glowSprite(c0, c1, size) {
    const cv = mkCanvas(size, size), x = cv.getContext('2d'), r = size / 2;
    const gr = x.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${c0},1)`);
    gr.addColorStop(0.12, `rgba(${c1},0.8)`);
    gr.addColorStop(0.3, `rgba(${c1},0.36)`);
    gr.addColorStop(0.55, `rgba(${c1},0.12)`);
    gr.addColorStop(0.8, `rgba(${c1},0.03)`);
    gr.addColorStop(1, `rgba(${c1},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return cv;
  }

  // Vertical colour profile strip (8px wide) — stretched sideways for bands.
  function vProfile(h, stops) {
    const cv = mkCanvas(8, h), x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    x.fillStyle = gr;
    x.fillRect(0, 0, 8, h);
    return cv;
  }

  // Comet tail: head at the left edge, fading to the right; soft layered edges.
  function tailSprite(rgb, core) {
    const W = 256, H = 64, cv = mkCanvas(W, H), x = cv.getContext('2d'), m = H / 2;
    x.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 6; j++) {
      const f = 1 - j / 6;
      const gr = x.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, `rgba(${rgb},0.3)`);
      gr.addColorStop(0.25, `rgba(${rgb},0.2)`);
      gr.addColorStop(0.6, `rgba(${rgb},0.07)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = gr;
      const h0 = 5 * f + 1, h1 = 30 * f + 1;
      x.beginPath();
      x.moveTo(0, m - h0);
      x.quadraticCurveTo(W * 0.4, m - h1 * 0.8, W, m - h1);
      x.lineTo(W, m + h1);
      x.quadraticCurveTo(W * 0.4, m + h1 * 0.8, 0, m + h0);
      x.closePath();
      x.fill();
    }
    if (core) {
      const gr = x.createLinearGradient(0, 0, W * 0.8, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, m - 1.2, W * 0.8, 2.4);
    }
    return cv;
  }

  // Slow star-burst of light rays behind the Acacia.
  function raySprite() {
    const N = 256, cv = mkCanvas(N, N), x = cv.getContext('2d'), c = N / 2;
    const gr = x.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,240,190,0.9)');
    gr.addColorStop(0.25, 'rgba(255,222,140,0.35)');
    gr.addColorStop(0.6, 'rgba(220,255,170,0.1)');
    gr.addColorStop(1, 'rgba(220,255,170,0)');
    x.fillStyle = gr;
    const R = rng(0.618, 3);
    x.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * TAU + (R() - 0.5) * 0.2, w = 0.025 + R() * 0.045, L = c * (0.55 + R() * 0.45);
      x.moveTo(c, c);
      x.lineTo(c + Math.cos(a - w) * L, c + Math.sin(a - w) * L);
      x.lineTo(c + Math.cos(a + w) * L, c + Math.sin(a + w) * L);
      x.closePath();
    }
    x.fill();
    return cv;
  }

  // Faint golden light column that hangs below the Acacia (a guide from afar).
  function beaconSprite() {
    const cv = mkCanvas(64, 256), x = cv.getContext('2d');
    const gh = x.createLinearGradient(0, 0, 64, 0);
    gh.addColorStop(0, 'rgba(255,220,120,0)');
    gh.addColorStop(0.5, 'rgba(255,236,170,1)');
    gh.addColorStop(1, 'rgba(255,220,120,0)');
    x.fillStyle = gh;
    x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = 'destination-in';
    const gv = x.createLinearGradient(0, 0, 0, 256);
    gv.addColorStop(0, 'rgba(0,0,0,1)');
    gv.addColorStop(0.2, 'rgba(0,0,0,0.75)');
    gv.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gv;
    x.fillRect(0, 0, 64, 256);
    return cv;
  }

  // A single glowing acacia leaf (drawn 12×6 world px).
  function leafSprite() {
    const cv = mkCanvas(48, 24), x = cv.getContext('2d');
    x.shadowColor = 'rgba(216,255,176,0.9)';
    x.shadowBlur = 6;
    const gr = x.createLinearGradient(0, 4, 0, 20);
    gr.addColorStop(0, '#eaffc8');
    gr.addColorStop(1, '#6fcf5e');
    x.fillStyle = gr;
    x.beginPath();
    x.moveTo(6, 12);
    x.quadraticCurveTo(24, 1, 42, 12);
    x.quadraticCurveTo(24, 23, 6, 12);
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = 'rgba(60,140,60,0.7)';
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(8, 12); x.lineTo(40, 12); x.stroke();
    return cv;
  }

  // The Celestial Acacia is pre-rendered at 3× so it stays crisp on retina.
  const GOAL_SC = 3;
  function blobs(x, list, dx, dy, k, col) {
    x.fillStyle = col;
    x.beginPath();
    for (let i = 0; i < list.length; i++) {
      const e = list[i], rx = e[2] * k, ry = e[3] * k;
      x.moveTo(e[0] + dx + rx, e[1] + dy);
      x.ellipse(e[0] + dx, e[1] + dy, rx, ry, 0, 0, TAU);
    }
    x.fill();
  }

  // Canopy sprite. Logical box x ∈ [-100,100], y ∈ [-44,40] around the canopy centre.
  function canopySprite() {
    const SC = GOAL_SC, W = 200, H = 84;
    const cv = mkCanvas(W * SC, H * SC), x = cv.getContext('2d');
    x.scale(SC, SC);
    x.translate(100, 44);
    const R = rng(0.4242, 11);
    const plate = [], crown = [], hang = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11, e = Math.abs(t - 0.5) * 2;
      plate.push([-80 + t * 160, 2 + 4 * e * e, (13 + R() * 5) * (1 - 0.3 * e), 8 + R() * 3]);
    }
    for (let i = 0; i < 9; i++) {
      const t = i / 8, e = Math.abs(t - 0.5) * 2;
      crown.push([-64 + t * 128 + (R() - 0.5) * 4, -9 + 5 * e * e, 12 + R() * 4, 6 + R() * 2]);
    }
    for (let i = 0; i < 7; i++) hang.push([-72 + i * 24 + (R() - 0.5) * 6, 11 + R() * 3, 8 + R() * 3, 4 + R() * 1.5]);
    const tiers = [[-58, 15, 26, 6.5], [62, 13, 20, 5.5]];
    const all = plate.concat(crown, tiers);

    x.shadowColor = 'rgba(200,255,150,0.85)';
    x.shadowBlur = 16 * SC;
    blobs(x, all.concat(hang), 0, 0, 1, '#4fae4a');
    x.shadowBlur = 0;
    blobs(x, hang, 0, 1, 1, '#2c6a36');                 // hanging clumps, shaded
    blobs(x, all, 0, 3, 1, '#2f7a3a');                  // underside shade
    blobs(x, all, 0, 0, 1, '#5cc45a');                  // leaf mass
    blobs(x, plate, 0, -3, 0.55, '#86d86c');            // mid highlights
    blobs(x, crown, 0, -2, 0.8, '#a4e880');             // sunlit crown
    blobs(x, crown, 0, -4.5, 0.42, '#dcffb4');          // top shine

    // leaf texture: specks painted only onto existing leaves
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(36,104,48,0.45)';
    for (let i = 0; i < 220; i++) x.fillRect(-88 + R() * 176, -22 + R() * 40, 1.3, 1.1);
    x.fillStyle = 'rgba(230,255,200,0.35)';
    for (let i = 0; i < 90; i++) x.fillRect(-80 + R() * 160, -20 + R() * 20, 1.1, 1.1);
    x.globalCompositeOperation = 'source-over';

    // golden blossoms (acacias flower in little yellow pompoms)
    x.shadowColor = 'rgba(255,211,92,0.95)';
    x.shadowBlur = 5 * SC;
    x.fillStyle = '#ffd35c';
    x.beginPath();
    const spots = crown.concat(plate);
    for (let i = 0; i < 46; i++) {
      const e = spots[Math.floor(R() * spots.length)];
      const a = R() * TAU, rr = Math.sqrt(R()) * 0.75;
      const bx = e[0] + Math.cos(a) * e[2] * rr, by = e[1] - 2 + Math.sin(a) * e[3] * rr;
      const br = 1.1 + R() * 0.8;
      x.moveTo(bx + br, by);
      x.arc(bx, by, br, 0, TAU);
    }
    x.fill();
    x.shadowBlur = 0;
    return cv;
  }

  // Trunk + planetoid sprite. Logical box x ∈ [-60,60], y ∈ [-6,112] from the goal centre.
  function trunkSprite() {
    const SC = GOAL_SC, W = 120, H = 118;
    const cv = mkCanvas(W * SC, H * SC), x = cv.getContext('2d');
    x.scale(SC, SC);
    x.translate(60, 6);
    const R = rng(0.1717, 5);
    const PY = 66, PR = 30;

    x.shadowColor = 'rgba(190,255,150,0.7)';
    x.shadowBlur = 18 * SC;
    x.fillStyle = '#6aa84e';
    x.beginPath(); x.arc(0, PY, PR, 0, TAU); x.fill();
    x.shadowBlur = 0;
    const gr = x.createRadialGradient(-9, PY - 14, 3, 0, PY, PR);
    gr.addColorStop(0, '#e4f7a8');
    gr.addColorStop(0.35, '#8cc85a');
    gr.addColorStop(0.75, '#44704a');
    gr.addColorStop(1, '#262440');
    x.fillStyle = gr;
    x.beginPath(); x.arc(0, PY, PR, 0, TAU); x.fill();

    x.globalCompositeOperation = 'source-atop';               // craters on the night side
    x.fillStyle = 'rgba(30,50,48,0.55)';
    x.beginPath();
    x.moveTo(15, PY + 14); x.ellipse(10, PY + 14, 5, 2.5, 0, 0, TAU);
    x.moveTo(-8.5, PY + 20); x.ellipse(-12, PY + 20, 3.5, 1.8, 0, 0, TAU);
    x.moveTo(4.5, PY + 25); x.ellipse(2, PY + 25, 2.5, 1.2, 0, 0, TAU);
    x.fill();
    x.globalCompositeOperation = 'source-over';

    x.fillStyle = '#a6e27a';                                   // grass cap
    x.beginPath();
    for (let a = -Math.PI * 0.94; a < -Math.PI * 0.06; a += 0.075) {
      const ca = Math.cos(a), sa = Math.sin(a), L = PR + 2.5 + R() * 3.5;
      const bx = ca * (PR - 1), by = PY + sa * (PR - 1);
      x.moveTo(bx - sa * 1.3, by + ca * 1.3);
      x.lineTo(ca * L + (R() - 0.5) * 1.6, PY + sa * L);
      x.lineTo(bx + sa * 1.3, by - ca * 1.3);
      x.closePath();
    }
    x.fill();
    x.strokeStyle = 'rgba(236,255,200,0.75)';
    x.lineWidth = 1.2;
    x.beginPath(); x.arc(0, PY, PR - 0.6, -Math.PI * 0.95, -Math.PI * 0.05); x.stroke();

    const tp = new Path2D();                                   // forked acacia trunk
    addSeg(tp, 0, 40, 1, 20, 3.4, 2.4);
    addSeg(tp, 1, 22, -36, 4, 2.0, 0.9);
    addSeg(tp, 1, 21, -10, 2, 1.9, 0.9);
    addSeg(tp, 1, 21, 14, 3, 1.9, 0.9);
    addSeg(tp, 1, 22, 40, 6, 2.0, 0.9);
    addSeg(tp, 0.5, 30, -20, 9, 1.4, 0.8);
    addSeg(tp, 0, 38, -7, 41, 1.4, 0.5);
    addSeg(tp, 0, 38, 7, 41.5, 1.4, 0.5);
    x.save(); x.translate(-0.8, -0.8);
    x.fillStyle = '#f3cf86'; x.fill(tp);                       // warm rim light from the canopy
    x.restore();
    x.fillStyle = '#5b3a24'; x.fill(tp);
    return cv;
  }

  // force (rebuild after GPU context loss): render every sprite again into NEW
  // canvases. S.ready stays true throughout, so a failure half-way keeps the
  // old sprites for the rest instead of blanking the world.
  function buildSprites(force) {
    if (S.ready && !force) return;
    const hot = '255,255,255';
    S.gWarm = glowSprite('255,244,220', '255,176,96', 128);
    S.gGold = glowSprite('255,240,190', '255,211,92', 128);
    S.gTeal = glowSprite('200,255,240', '70,240,192', 128);
    S.gBlue = glowSprite('230,245,255', '111,184,255', 128);
    S.gRed = glowSprite('255,200,190', '255,75,62', 128);
    S.gPlasma = glowSprite(hot, '255,177,59', 128);
    S.gViolet = glowSprite('220,190,255', '164,92,255', 128);
    S.gLeaf = glowSprite('240,255,220', '127,224,122', 128);
    S.gIce = glowSprite(hot, '140,205,255', 128);
    S.gMagenta = glowSprite('255,220,255', '220,110,255', 128);
    S.gWhite = glowSprite(hot, '255,250,240', 64);
    S.gAccr = glowSprite('255,236,200', '255,150,80', 128);
    {
      const cv = mkCanvas(128, 128), x = cv.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.3, 'rgba(0,0,0,0.92)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.5)');
      gr.addColorStop(0.8, 'rgba(0,0,0,0.14)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      S.dark = cv;
    }
    S.horizon = vProfile(256, [0, 'rgba(255,120,80,0)', 0.55, 'rgba(255,130,90,0.22)',
      0.85, 'rgba(255,180,120,0.6)', 1, 'rgba(255,225,170,0.95)']);
    S.beamCore = vProfile(128, [0, 'rgba(255,60,30,0)', 0.2, 'rgba(255,80,40,0.35)',
      0.38, 'rgba(255,170,60,0.95)', 0.5, 'rgba(255,252,235,1)', 0.62, 'rgba(255,170,60,0.95)',
      0.8, 'rgba(255,80,40,0.35)', 1, 'rgba(255,60,30,0)']);
    S.beamHeat = vProfile(128, [0, 'rgba(255,90,40,0)', 0.3, 'rgba(255,110,40,0.2)',
      0.5, 'rgba(255,170,70,0.55)', 0.7, 'rgba(255,110,40,0.2)', 1, 'rgba(255,90,40,0)']);
    S.warnBand = vProfile(64, [0, 'rgba(255,60,50,0)', 0.5, 'rgba(255,70,55,0.75)', 1, 'rgba(255,60,50,0)']);
    S.tailIon = tailSprite('150,210,255', true);
    S.tailDust = tailSprite('255,200,150', false);
    S.rays = raySprite();
    S.beacon = beaconSprite();
    S.leaf = leafSprite();
    S.canopy = canopySprite();
    S.trunk = trunkSprite();
    S.ready = true;
  }

  // ------------------------------------------------------- colour palettes
  // Rock colours by altitude band E: sandy → red rock → basalt-violet →
  // icy blue → crystal magenta. Quantised to BANDS steps, built once.
  const BAND_STOPS = [
    { E: 0.00, top: '#f0c47c', mid: '#b98048', under: '#5a3024', rim: '#fff0c8', crater: '#8a5634', leaf: '#8fe06a' },
    { E: 0.18, top: '#e6a070', mid: '#a65a42', under: '#4a2230', rim: '#ffd6b0', crater: '#7a3e34', leaf: '#8fe06a' },
    { E: 0.40, top: '#a894d8', mid: '#5e4c92', under: '#221a42', rim: '#e4dcff', crater: '#3c2e6a', leaf: '#86f0a8' },
    { E: 0.65, top: '#c4e8ff', mid: '#6c9ed2', under: '#20386a', rim: '#f4fcff', crater: '#4c78aa', leaf: '#a6f5c8' },
    { E: 0.90, top: '#ffb8ec', mid: '#b85aa8', under: '#461a52', rim: '#fff2fc', crater: '#7c3480', leaf: '#c8ff9a' },
    { E: 1.00, top: '#ffd0f0', mid: '#c070c0', under: '#4a1c5a', rim: '#ffffff', crater: '#8a3c90', leaf: '#d8ffb0' },
  ];
  const BANDS = 12;
  const GR = { pals: null };   // gradients & palettes (need a 2D context to build)

  function bandColour(E, key) {
    let a = BAND_STOPS[0], b = BAND_STOPS[BAND_STOPS.length - 1];
    for (let i = 0; i < BAND_STOPS.length - 1; i++) {
      if (E >= BAND_STOPS[i].E && E <= BAND_STOPS[i + 1].E) { a = BAND_STOPS[i]; b = BAND_STOPS[i + 1]; break; }
    }
    const t = b.E > a.E ? clamp((E - a.E) / (b.E - a.E), 0, 1) : 0;
    return mixRgb(hexRgb(a[key]), hexRgb(b[key]), t);
  }

  function buildGradients(ctx, force) {
    if ((GR.pals && !force) || !ctx) return;
    const pals = [];
    for (let q = 0; q < BANDS; q++) {
      const E = q / (BANDS - 1);
      const gr = ctx.createLinearGradient(0, -8, 0, 12);
      gr.addColorStop(0, rgba(bandColour(E, 'top'), 1));
      gr.addColorStop(0.35, rgba(bandColour(E, 'mid'), 1));
      gr.addColorStop(1, rgba(bandColour(E, 'under'), 1));
      pals.push({
        grad: gr,
        rim: rgba(bandColour(E, 'rim'), 1),
        crater: rgba(bandColour(E, 'crater'), 0.85),
        speck: rgba(bandColour(E, 'rim'), 0.55),
        leaf: rgba(bandColour(E, 'leaf'), 1),
      });
    }
    let gr = ctx.createLinearGradient(0, -8, 0, 12);          // brittle meteorite
    gr.addColorStop(0, '#9a8cb0');
    gr.addColorStop(0.25, '#4a3e58');
    gr.addColorStop(1, '#15101c');
    GR.crumble = gr;
    gr = ctx.createLinearGradient(0, -7, 0, 7);               // phase-crystal glass
    gr.addColorStop(0, 'rgba(255,225,252,0.9)');
    gr.addColorStop(0.45, 'rgba(205,125,255,0.55)');
    gr.addColorStop(1, 'rgba(95,45,175,0.8)');
    GR.crystal = gr;
    gr = ctx.createLinearGradient(0, -6.5, 0, 6.5);           // solar-panel wings
    gr.addColorStop(0, '#3a6ee0');
    gr.addColorStop(0.5, '#1d3f9a');
    gr.addColorStop(1, '#0f2360');
    GR.wing = gr;
    gr = ctx.createLinearGradient(0, -8, 0, 8);               // gold-foil hub
    gr.addColorStop(0, '#fff0b0');
    gr.addColorStop(0.35, '#e0b050');
    gr.addColorStop(1, '#7a5018');
    GR.hub = gr;
    GR.pals = pals;
  }

  // ------------------------------------------------------- per-level caches
  function addRRect(p, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
    p.closePath();
  }

  // Where the camera centre sits at launch (so the hero tree frames the start).
  function startCamX(g) {
    const vw = g.screenWidth, lw = g.levelWidth, px = g.player ? g.player.startX : lw / 4;
    return lw <= vw ? lw / 2 : clamp(px, vw / 2, lw - vw / 2);
  }

  // Gradients are split from the geometry below so a GPU-context rebuild can
  // renew them without re-rolling any Path2D or animation parameter.
  function planetGrads(P, ctx) {
    let gr = ctx.createLinearGradient(0, P.Gy - 2, 0, P.lh + 60);
    gr.addColorStop(0, '#d49440');
    gr.addColorStop(0.05, '#b27432');
    gr.addColorStop(0.3, '#6b3f1a');
    gr.addColorStop(1, '#1e0f08');
    P.soil = gr;
    gr = ctx.createLinearGradient(0, P.Gy - 16, 0, P.Gy + 8);
    gr.addColorStop(0, '#ffe4a4');
    gr.addColorStop(0.5, '#e8b050');
    gr.addColorStop(1, '#b87c34');
    P.grass = gr;
  }

  // The home planet: far hills, mid silhouettes (acacias, the herd), the
  // savanna surface in 1000px chunks, soil pebbles and pollen motes.
  function buildPlanet(g, ctx) {
    const lw = g.levelWidth, Gy = g.ground.y, lh = g.levelHeight;
    const R = rng(0.3719, 7);
    const xa = -K.PLANET_MARGIN, xb = lw + K.PLANET_MARGIN;
    const P = { xa, xb, Gy, lh, chunks: [], ff: [] };

    // far hills with small acacias (parallax layer)
    const far = new Path2D();
    const f0 = xa - 1000, f1 = xb + 1000;
    const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
    const hill = (x) => Math.max(5, 20 + 15 * Math.sin(x * 0.0019 + p1) + 9 * Math.sin(x * 0.0051 + p2) + 4 * Math.sin(x * 0.013 + p3));
    const fp = [];
    for (let x = f0; x <= f1; x += 40) fp.push(x, Gy - hill(x));
    fp.push(f1, Gy + 30, f0, Gy + 30);
    addPoly(far, fp);
    for (let x = f0 + R() * 300; x < f1; x += 240 + R() * 460) {
      addAcacia(far, x, Gy - hill(x) + 3, 16 + R() * 14, 24 + R() * 22, R);
    }
    P.far = far;

    // mid layer: acacias, bushes, the herd
    const mid = new Path2D();
    const m0 = xa - 800, m1 = xb + 800;
    const q1 = R() * TAU;
    const mp = [];
    for (let x = m0; x <= m1; x += 60) mp.push(x, Gy - 3 - 4 * (0.5 + 0.5 * Math.sin(x * 0.004 + q1)));
    mp.push(m1, Gy + 30, m0, Gy + 30);
    addPoly(mid, mp);
    const off0 = (startCamX(g) - lw / 2) * K.PLANET_MID_PARALLAX;
    const sx = g.player ? g.player.startX : lw / 4;
    const heroX = sx - 330 - off0, herdX = sx + 250 - off0;
    addAcacia(mid, heroX, Gy + 2, 128, 176, R);                 // the hero tree by the launch spot
    addGiraffe(mid, herdX, Gy + 1, 46, -1, R, false);           // mum, looking toward the launch
    addGiraffe(mid, herdX + 34, Gy + 1, 28, -1, R, false);      // calf
    for (let x = m0 + R() * 300; x < m1; x += 300 + R() * 520) {
      if (Math.abs(x - heroX) < 190 || Math.abs(x - herdX - 17) < 90) continue;
      if (R() < 0.8) addAcacia(mid, x, Gy + 2, 55 + R() * 60, 70 + R() * 90, R);
      else addEll(mid, x, Gy - 2, 14 + R() * 14, 5 + R() * 5, 0);          // a bush
    }
    for (let h = 0; h < 5; h++) {                               // grazing herds far out
      let x = m0 + (h + 0.5) / 5 * (m1 - m0) + (R() - 0.5) * 400;
      if (Math.abs(x - herdX) < 300) x += 600;
      const f = R() < 0.5 ? -1 : 1, n = 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const baby = i === n - 1 && R() < 0.5;
        addGiraffe(mid, x + i * (24 + R() * 14), Gy + 1, (baby ? 26 : 38 + R() * 8), f, R, !baby && R() < 0.3);
      }
    }
    P.mid = mid;
    planetGrads(P, ctx);

    // grass blades, chunked so only visible chunks are filled
    const CH = 1000;
    for (let c0 = xa; c0 < xb; c0 += CH) {
      const c1 = Math.min(xb, c0 + CH);
      const back = new Path2D(), front = new Path2D();
      for (let x = c0; x < c1; x += 4 + R() * 4) {
        const h = 6 + R() * 9 + (R() < 0.06 ? 8 : 0), lean = (R() - 0.5) * 7, w = 1.5 + R() * 1.5;
        back.moveTo(x - w, Gy + 5); back.lineTo(x + lean, Gy - h); back.lineTo(x + w, Gy + 5); back.closePath();
      }
      for (let x = c0 + 3; x < c1; x += 6 + R() * 6) {
        const h = 3 + R() * 7 + (R() < 0.05 ? 6 : 0), lean = (R() - 0.5) * 6, w = 1.6 + R() * 1.6;
        front.moveTo(x - w, Gy + 6); front.lineTo(x + lean, Gy - h); front.lineTo(x + w, Gy + 6); front.closePath();
      }
      P.chunks.push({ x0: c0 - 12, x1: c1 + 12, back, front });
    }
    const peb = new Path2D();
    for (let x = xa; x < xb; x += 22 + R() * 40) addEll(peb, x, Gy + 16 + R() * 70, 1.5 + R() * 3.5, 1 + R() * 1.6, 0);
    P.pebbles = peb;
    for (let i = 0; i < K.FIREFLIES; i++) {
      P.ff.push({ x: R() * lw, y: Gy - 14 - R() * 95, ph: R() * TAU, sp: 0.4 + R() * 0.8, r: 0.6 + R() * 0.6 });
    }
    return P;
  }

  // Asteroid slab / meteorite outline hugging the width × 14 lick rect.
  function buildRock(c, W, h2, R, brittle) {
    const jit = brittle ? 1.5 : 1.1;
    const cl = 2.5 + R() * 2.5, cr = 2.5 + R() * 2.5;
    const xl = -W / 2 + cl, xr = W / 2 - cr;
    const n = Math.max(3, Math.round(W / 14));
    const top = [];
    for (let i = 0; i <= n; i++) {
      const x = xl + (i / n) * (xr - xl);
      const y = -h2 + 0.3 + (i === 0 || i === n ? 0.6 : (R() * 2 - 1) * jit);
      top.push(x, y);
    }
    const pts = top.slice();
    pts.push(W / 2 - 0.3, -h2 + cr * 0.8, W / 2 - R() * 1.2, 0.5, W / 2 - cr * 0.6 - 1, h2 + 0.8);
    const m = Math.max(3, Math.round(W / 18));
    const dmax = Math.min(3.8, 1 + W * 0.02);
    c.bot = new Path2D();                                       // underside, for a cool bounce-light rim
    for (let i = m; i >= 0; i--) {
      const t = i / m;
      const x = xl + t * (xr - xl) + (i === 0 || i === m ? 0 : (R() - 0.5) * 3);
      const y = h2 + dmax * Math.pow(Math.sin(Math.PI * t), 0.7) + R() * (brittle ? 1.4 : 1);
      pts.push(x, y);
      if (i === m) c.bot.moveTo(x, y); else c.bot.lineTo(x, y);
    }
    pts.push(-W / 2 + cl * 0.6 + 1, h2 + 0.8, -W / 2 + R() * 1.2, 0.5, -W / 2 + 0.3, -h2 + cl * 0.8);
    c.sil = new Path2D();
    addPoly(c.sil, pts);

    c.top = new Path2D();                                       // sunlit top edge
    c.top.moveTo(top[0], top[1]);
    for (let i = 2; i < top.length; i += 2) c.top.lineTo(top[i], top[i + 1]);

    c.craters = new Path2D();
    c.specks = new Path2D();
    const nc = Math.max(1, Math.floor(W / 38)) + (R() < 0.5 ? 1 : 0);
    for (let i = 0; i < nc; i++) {
      const rx = Math.min(1.4 + R() * 2.2, W * 0.05 + 0.8), ry = rx * 0.62;
      const x = xl + 4 + R() * (xr - xl - 8), y = -1.5 + R() * 5.5;
      addEll(c.craters, x, y, rx, ry, 0);
      addEll(c.specks, x, y + ry * 0.55, rx * 0.75, ry * 0.3, 0); // lit lower lip
    }
    for (let i = 0; i < W / 9; i++) c.specks.rect(xl + R() * (xr - xl), -4.5 + R() * 10, 1.1, 1.1);

    if (brittle) {                                              // glowing fracture network
      c.cracks = new Path2D();
      const nk = Math.max(2, Math.round(W / 26));
      for (let i = 0; i < nk; i++) {
        let x = xl + (i + 0.5) / nk * (xr - xl) + (R() - 0.5) * 6, y = -h2 + 0.8;
        c.cracks.moveTo(x, y);
        for (let s = 1; s <= 3; s++) {
          x += (R() - 0.5) * 6;
          y = -h2 + 0.8 + (s / 3) * (2 * h2 + 1.5);
          c.cracks.lineTo(x, y);
          if (s === 1 && R() < 0.7) {
            c.cracks.lineTo(x + (R() < 0.5 ? -1 : 1) * (3 + R() * 4), y + 2 + R() * 2);
            c.cracks.moveTo(x, y);
          }
        }
      }
      let x = xl + 4;
      const y0 = 0.5 + R() * 2;
      c.cracks.moveTo(x, y0);
      while (x < xr - 6) { x += 5 + R() * 7; c.cracks.lineTo(Math.min(x, xr - 4), y0 + (R() - 0.5) * 3); }
    } else if (R() < (W > 90 ? 0.6 : 0.4)) {                   // lickable leaf tufts
      c.leaves = new Path2D();
      c.leafX = [];
      const nclus = W > 150 ? 2 : 1;
      for (let k = 0; k < nclus; k++) {
        const cx = xl + 8 + R() * (xr - xl - 16);
        c.leafX.push(cx);
        const nl = 3 + (R() < 0.5 ? 1 : 0);
        for (let j = 0; j < nl; j++) {
          const ang = -Math.PI / 2 + (j - (nl - 1) / 2) * 0.55 + (R() - 0.5) * 0.2;
          addEll(c.leaves, cx + Math.cos(ang) * 2.2, -h2 + 0.6 + Math.sin(ang) * 2, 2.8, 1.25, ang);
        }
      }
    }
  }

  // Phase crystal: an elongated faceted hexagonal bar inside the lick rect.
  function buildCrystal(c, W, h2, R) {
    const e = Math.min(6, W * 0.14), hw = W / 2;
    c.sil = new Path2D();
    addPoly(c.sil, [-hw + 0.5, 0, -hw + e, -h2 + 0.3, hw - e, -h2 + 0.3, hw - 0.5, 0, hw - e, h2 - 0.3, -hw + e, h2 - 0.3]);
    c.facet = new Path2D();
    addPoly(c.facet, [-hw + 0.5, 0, -hw + e, -h2 + 0.3, hw - e, -h2 + 0.3, hw - 0.5, 0, hw - e * 1.3, -1.6, -hw + e * 1.3, -1.6]);
    c.lines = new Path2D();
    const nl = Math.max(2, Math.round(W / 16));
    for (let i = 1; i < nl; i++) {
      const x = -hw + e + (i / nl) * (W - 2 * e) + (R() - 0.5) * 3, sl = (R() - 0.5) * 5;
      c.lines.moveTo(x - sl * 0.5, -h2 + 0.6);
      c.lines.lineTo(x + sl * 0.5, h2 - 0.6);
    }
    c.lines.moveTo(-hw + e * 1.3, -1.6);
    c.lines.lineTo(hw - e * 1.3, -1.6);
    c.hw = hw;
  }

  // Tumbling satellite: solar-panel wings, truss, gold-foil hub, tip beacons.
  function buildSatellite(c, W, h2, R) {
    const hw = W / 2, hub = clamp(W * 0.22, 22, 34) / 2;
    const x1 = hub + 6, x2 = hw - 1, wh = h2 - 0.5;
    c.wings = new Path2D();
    c.wings.rect(-x2, -wh, x2 - x1, 2 * wh);
    c.wings.rect(x1, -wh, x2 - x1, 2 * wh);
    c.grid = new Path2D();
    c.grid.rect(-x2, -wh, x2 - x1, 2 * wh);
    c.grid.rect(x1, -wh, x2 - x1, 2 * wh);
    const cells = Math.max(2, Math.round((x2 - x1) / 9));
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 1; i < cells; i++) {
        const x = s * (x1 + (i / cells) * (x2 - x1));
        c.grid.moveTo(x, -wh); c.grid.lineTo(x, wh);
      }
      c.grid.moveTo(s * x1, 0); c.grid.lineTo(s * x2, 0);
    }
    c.truss = new Path2D();
    for (let s = -1; s <= 1; s += 2) {
      const a = s * hub, b = s * x1;
      c.truss.moveTo(a, -3); c.truss.lineTo(b, -3);
      c.truss.moveTo(a, 3); c.truss.lineTo(b, 3);
      c.truss.moveTo(a, -3); c.truss.lineTo(b, 3);
      c.truss.moveTo(a, 3); c.truss.lineTo(b, -3);
    }
    c.hub = new Path2D();
    addRRect(c.hub, -hub, -h2 - 1, hub * 2, h2 * 2 + 2, 3);
    c.ribs = new Path2D();
    for (let i = 1; i < 4; i++) {
      const x = -hub + (i / 4) * hub * 2;
      if (Math.abs(x) < 4) continue;                            // leave room for the porthole
      c.ribs.moveTo(x, -h2); c.ribs.lineTo(x, h2);
    }
    c.port = new Path2D();
    addEll(c.port, 0, 0, 3.2, 3.2, 0);
    c.sil = new Path2D();
    c.sil.rect(-x2, -wh, 2 * x2, 2 * wh);
    c.tip = x2 - 1.5;
    c.blink = R();
  }

  function buildPlatform(a) {
    const R = rng(a.seed || 0, a.id || 0);
    const W = Math.max(8, a.width), h2 = (a.height || 14) / 2;
    const c = { sh: R() * TAU, q: Math.round(clamp(a.E || 0, 0, 1) * (BANDS - 1)) };
    if (a.type === 'rotating') buildSatellite(c, W, h2, R);
    else if (a.type === 'disappearing') buildCrystal(c, W, h2, R);
    else buildRock(c, W, h2, R, a.type === 'crumbling');
    return c;
  }

  function windGrads(c, ctx) {
    let gr = ctx.createLinearGradient(c.xL, 0, c.xR, 0);
    gr.addColorStop(0, 'rgba(70,240,192,0)');
    gr.addColorStop(0.22, 'rgba(70,240,192,0.3)');
    gr.addColorStop(0.5, 'rgba(111,184,255,0.34)');
    gr.addColorStop(0.78, 'rgba(70,240,192,0.3)');
    gr.addColorStop(1, 'rgba(70,240,192,0)');
    c.soft = gr;
    gr = ctx.createLinearGradient(c.xL, 0, c.xR, 0);
    gr.addColorStop(0, 'rgba(210,255,240,0)');
    gr.addColorStop(0.25, 'rgba(180,255,232,0.75)');
    gr.addColorStop(0.75, 'rgba(180,255,232,0.75)');
    gr.addColorStop(1, 'rgba(210,255,240,0)');
    c.core = gr;
  }

  // Solar-wind current: horizontal-fade gradients + aurora ribbon params.
  function buildWind(z, ctx) {
    const R = rng(z.seed || 0, 101);
    const xL = z.x - z.width / 2 - 140, xR = z.x + z.width / 2 + 140;
    const c = { xL, xR, ribbons: [] };
    windGrads(c, ctx);
    for (let i = 0; i < K.WIND_RIBBONS; i++) {
      const u = K.WIND_RIBBONS === 1 ? 0 : i / (K.WIND_RIBBONS - 1) - 0.5;
      c.ribbons.push({
        yo: u * z.height * 0.6 + (R() - 0.5) * 20, amp: 8 + R() * 12, k: TAU / (220 + R() * 160),
        ph: R() * TAU, spd: 140 + R() * 90, w: 12 + R() * 14, mod: R() * TAU,
      });
    }
    return c;
  }

  function wellGrad(c, ctx) {
    const gr = ctx.createRadialGradient(0, 0, c.inR, 0, 0, c.outR);
    gr.addColorStop(0, 'rgba(255,250,230,1)');
    gr.addColorStop(0.12, 'rgba(255,214,140,0.9)');
    gr.addColorStop(0.4, 'rgba(255,150,70,0.6)');
    gr.addColorStop(0.7, 'rgba(220,70,120,0.28)');
    gr.addColorStop(1, 'rgba(130,50,190,0)');
    c.grad = gr;
  }

  // Mini black hole: core size, tilted disk ring + its gradient, streak params.
  function buildWell(w, ctx) {
    const R = rng(w.seed || 0, 202);
    const u = clamp((w.radius - 150) / 100, 0, 1);
    const core = K.WELL_CORE_MIN + (K.WELL_CORE_MAX - K.WELL_CORE_MIN) * u;
    const inR = core * 1.3, outR = core * 3.5;
    const c = { core, inR, outR, tilt: (R() - 0.5) * 0.9, sq: K.WELL_DISK_SQUASH * (0.85 + R() * 0.3), streaks: [], infall: [] };
    c.ring = new Path2D();
    c.ring.moveTo(outR, 0);
    c.ring.arc(0, 0, outR, 0, TAU, false);
    c.ring.moveTo(inR, 0);
    c.ring.arc(0, 0, inR, 0, TAU, true);
    wellGrad(c, ctx);
    for (let i = 0; i < 9; i++) c.streaks.push({ r: inR + 2 + R() * (outR - inR - 6), a: R() * TAU, len: 0.5 + R() * 1.1 });
    for (let i = 0; i < K.WELL_INFALL; i++) c.infall.push({ a: R() * TAU, off: R(), spd: 0.16 + R() * 0.14 });
    return c;
  }

  // Comet nuclei: a small pool of lumpy unit-radius rocks, picked by seed.
  const NUCLEI = [];
  function buildNuclei() {
    if (NUCLEI.length) return;
    for (let k = 0; k < 6; k++) {
      const R = rng(0.13 + k * 0.137, 300 + k);
      const body = new Path2D(), pits = new Path2D(), pts = [];
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU, rr = 0.78 + R() * 0.3;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      addPoly(body, pts);
      for (let i = 0; i < 3; i++) addEll(pits, (R() - 0.5) * 0.9, (R() - 0.5) * 0.9, 0.12 + R() * 0.14, 0.1 + R() * 0.1, R());
      NUCLEI.push({ body, pits });
    }
  }

  // ------------------------------------------------------- per-frame helpers
  // Visible world rect (padded for tilt / shake), refreshed by each draw call.
  const V = { l: 0, r: 0, t: 0, b: 0, z: 1 };
  function setView(g) {
    const c = g.camera, z = c.zoom > 0.05 ? c.zoom : 1, pad = 90 / z;
    V.l = c.x - pad; V.r = c.x + c.viewW + pad; V.t = c.y - pad; V.b = c.y + c.viewH + pad; V.z = z;
  }
  // Glow sprite centred at (x, y) with radius r (caller picks the composite op).
  function glow(ctx, spr, x, y, r, a) {
    if (!(a > 0.004) || !(r > 0.5)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
  }
  // Stretch a vertical profile strip over a rect (samples the strip's middle
  // columns so smoothing never fades the ends).
  function stretch(ctx, spr, x, y, w, h, a) {
    if (!(a > 0.004) || !(w > 0.5) || !(h > 0.5)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(spr, 2, 0, 4, spr.height, x, y, w, h);
  }
  // Scratch buffers for aurora-ribbon points (allocated once).
  const RBN = 96;
  const RBX = new Float32Array(RBN), RBY = new Float32Array(RBN), RBW = new Float32Array(RBN);
  // Infalling-streak point (written to IX/IY to avoid allocating).
  let IX = 0, IY = 0;
  function infallPt(c, f, u, R2, rot) {
    const r = c.inR + (R2 - c.inR) * (1 - u * u);
    const th = f.a + u * u * 3.2 + rot * 0.3;
    const s = 1 + (c.sq - 1) * u;
    IX = Math.cos(th) * r;
    IY = Math.sin(th) * r * s;
  }
  // Accretion disk (half is clipped by the caller): gradient ring, beaming, streaks.
  function drawDisk(ctx, c, rot, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = c.grad;
    ctx.fill(c.ring);
    glow(ctx, S.gWarm, c.outR * 0.5, 0, c.outR * 0.75, 0.32 * a);   // Doppler-bright approaching side
    ctx.beginPath();
    for (let i = 0; i < c.streaks.length; i++) {
      const s = c.streaks[i];
      const ang = s.a + rot * 2.2 * Math.pow(c.inR / s.r, 1.5);
      ctx.moveTo(Math.cos(ang) * s.r, Math.sin(ang) * s.r);
      ctx.arc(0, 0, s.r, ang, ang + s.len);
    }
    ctx.strokeStyle = '#fff0d8';
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = 0.5 * a;
    ctx.stroke();
  }

  // ======================================================================
  ASCENT.World = {
    K,
    _t: 0,          // own animation clock (advances only while playing)
    _lvl: null,     // the g.platforms array the caches were built for
    _pc: null,      // per-platform caches (parallel to g.platforms)
    _wind: null,
    _wells: null,
    _planet: null,

    init(g) {
      buildSprites();
      buildNuclei();
      buildGradients(ASCENT.Gfx && ASCENT.Gfx.ctx);
      this._t = 0;
    },

    onLevel(g) {
      const ctx = ASCENT.Gfx && ASCENT.Gfx.ctx;
      buildSprites();
      buildNuclei();
      buildGradients(ctx);
      if (!ctx || !g.platforms || !g.ground) return;
      this._planet = buildPlanet(g, ctx);
      this._pc = g.platforms.map((a) => buildPlatform(a));
      this._wind = (g.windZones || []).map((z) => buildWind(z, ctx));
      this._wells = (g.gravityWells || []).map((w) => buildWell(w, ctx));
      this._lvl = g.platforms;
    },

    // GPU context restored (main.js): re-render every sprite into NEW canvases and
    // make every gradient anew. Level caches keep their Path2D geometry and animation
    // params (not tied to any context) and only get fresh gradients, so nothing on
    // screen re-rolls; a level with no caches yet gets the full onLevel build.
    // Idempotent, safe before init / the first level, and leaves the clock (_t) alone.
    rebuild(g) {
      const ctx = ASCENT.Gfx && ASCENT.Gfx.ctx;
      buildSprites(true);
      buildNuclei();
      buildGradients(ctx, true);
      if (!ctx) return;
      if (g && g.platforms && g.ground && (this._lvl !== g.platforms || !this._pc)) { this.onLevel(g); return; }
      if (this._planet) planetGrads(this._planet, ctx);
      const ws = this._wind || [], hs = this._wells || [];
      for (let i = 0; i < ws.length; i++) windGrads(ws[i], ctx);
      for (let i = 0; i < hs.length; i++) wellGrad(hs[i], ctx);
    },

    update(g, dt) {
      if (dt > 0 && dt < 1) this._t += dt;
    },

    // Rebuild caches if the level changed under us (safety net).
    _ready(g) {
      if (!g.platforms || !g.camera || !g.ground) return false;
      if (this._lvl !== g.platforms || !this._pc || this._pc.length !== g.platforms.length) this.onLevel(g);
      return !!(this._pc && GR.pals && S.ready);
    },

    // ------------------------------------------------------------ back
    drawBack(ctx, g) {
      if (!this._ready(g)) return;
      setView(g);
      const t = this._t;
      ctx.save();
      this._drawPlanet(ctx, g, t);
      this._drawWind(ctx, g, t);
      this._drawWells(ctx, g, t);
      this._drawFlareBands(ctx, g, t);
      ctx.restore();
    },

    _drawPlanet(ctx, g, t) {
      const P = this._planet;
      if (!P || V.b < P.Gy - K.HORIZON_GLOW_HEIGHT) return;
      const Gy = P.Gy, cam = g.camera, lw = g.levelWidth;
      const x0 = Math.max(P.xa, V.l), x1 = Math.min(P.xb, V.r);
      if (x1 <= x0) return;

      // atmosphere: a broad warm glow and a bright rim hugging the horizon
      ctx.globalCompositeOperation = 'lighter';
      stretch(ctx, S.horizon, x0, Gy - K.HORIZON_GLOW_HEIGHT, x1 - x0, K.HORIZON_GLOW_HEIGHT + 4, 0.45);
      stretch(ctx, S.horizon, x0, Gy - 130, x1 - x0, 134, 0.55);
      ctx.globalCompositeOperation = 'source-over';

      // far hills (hazy plum, rim-lit by the dusk behind them)
      const offF = (cam.cx - lw / 2) * K.PLANET_FAR_PARALLAX;
      ctx.save();
      ctx.translate(offF, -1.5);
      ctx.globalAlpha = 0.7; ctx.fillStyle = '#ffb08a'; ctx.fill(P.far);
      ctx.translate(0, 1.5);
      ctx.globalAlpha = 0.92; ctx.fillStyle = '#7a3c68'; ctx.fill(P.far);
      ctx.restore();

      // mid silhouettes: acacias and the herd, backlit orange
      const offM = (cam.cx - lw / 2) * K.PLANET_MID_PARALLAX;
      ctx.save();
      ctx.translate(offM, -2);
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#ff9a5a'; ctx.fill(P.mid);
      ctx.translate(0, 2);
      ctx.globalAlpha = 1; ctx.fillStyle = '#2a1230'; ctx.fill(P.mid);
      ctx.restore();

      // the savanna surface
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.soil;
      ctx.fillRect(x0, Gy - 1, x1 - x0, P.lh - Gy + 90);
      ctx.fillStyle = 'rgba(40,20,10,0.5)';
      ctx.fill(P.pebbles);
      ctx.fillStyle = '#8a5a2a';
      for (let i = 0; i < P.chunks.length; i++) {
        const ch = P.chunks[i];
        if (ch.x1 > x0 && ch.x0 < x1) ctx.fill(ch.back);
      }
      ctx.fillStyle = P.grass;
      for (let i = 0; i < P.chunks.length; i++) {
        const ch = P.chunks[i];
        if (ch.x1 > x0 && ch.x0 < x1) ctx.fill(ch.front);
      }

      // pollen motes drifting over the grass
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < P.ff.length; i++) {
        const f = P.ff[i];
        if (f.x < V.l - 30 || f.x > V.r + 30 || f.y < V.t - 30) continue;
        const x = f.x + Math.sin(t * f.sp + f.ph) * 18;
        const y = f.y + Math.sin(t * f.sp * 1.3 + f.ph * 2) * 10;
        const tw = 0.5 + 0.5 * Math.sin(t * 2.2 * f.sp + f.ph * 3);
        glow(ctx, S.gGold, x, y, 7 * f.r + 3, 0.2 + 0.5 * tw);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    _drawWind(ctx, g, t) {
      const zs = g.windZones, cs = this._wind;
      if (!zs || !cs) return;
      for (let i = 0; i < zs.length && i < cs.length; i++) {
        const z = zs[i], c = cs[i];
        if (!ASCENT.Cam.visible(g, z.x, z.y, z.width / 2 + 260)) continue;
        const dir = z.direction >= 0 ? 1 : -1;
        const zl = z.x - z.width / 2, zr = z.x + z.width / 2;
        ctx.globalCompositeOperation = 'lighter';

        // soft teal haze marks the current's body
        ctx.globalAlpha = 0.13;
        ctx.drawImage(S.gTeal, z.x - z.width * 0.7, z.y - z.height * 0.8, z.width * 1.4, z.height * 1.6);

        // aurora ribbons: travelling waves flowing downstream that pinch and
        // swell, with faint curtain rays hanging from them
        for (let r = 0; r < c.ribbons.length; r++) {
          const rb = c.ribbons[r];
          const amp = rb.amp * (0.7 + 0.3 * Math.sin(t * 0.7 + rb.mod));
          const yb = z.y + rb.yo, hw = rb.w * 0.5;
          let n = 0;
          for (let x = c.xL; x <= c.xR + 1 && n < RBN; x += 24, n++) {
            RBX[n] = x;
            RBY[n] = yb + amp * Math.sin((x - dir * t * rb.spd) * rb.k + rb.ph) +
                     amp * 0.35 * Math.sin((x - dir * t * rb.spd * 1.7) * rb.k * 2.3 + rb.mod);
            RBW[n] = hw * (0.3 + 0.7 * Math.abs(Math.sin((x - dir * t * rb.spd * 0.6) * rb.k * 0.7 + rb.mod * 2)));
          }
          if (n < 2) continue;
          ctx.beginPath();
          ctx.moveTo(RBX[0], RBY[0] - RBW[0]);
          for (let j = 1; j < n; j++) ctx.lineTo(RBX[j], RBY[j] - RBW[j]);
          for (let j = n - 1; j >= 0; j--) ctx.lineTo(RBX[j], RBY[j] + RBW[j]);
          ctx.closePath();
          ctx.fillStyle = c.soft; ctx.globalAlpha = 0.75; ctx.fill();
          ctx.beginPath();
          for (let j = 0; j < n - 1; j++) {
            for (let h = 0; h < 2; h++) {
              const f = h * 0.5;
              const x = RBX[j] + (RBX[j + 1] - RBX[j]) * f, y = RBY[j] + (RBY[j + 1] - RBY[j]) * f;
              const w = RBW[j] + (RBW[j + 1] - RBW[j]) * f;
              ctx.moveTo(x, y);
              ctx.lineTo(x - dir * 2, y + 6 + 26 * w / hw);
            }
          }
          ctx.strokeStyle = c.soft; ctx.lineWidth = 2; ctx.globalAlpha = 0.5; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(RBX[0], RBY[0]);
          for (let j = 1; j < n; j++) ctx.lineTo(RBX[j], RBY[j]);
          ctx.strokeStyle = c.core; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6; ctx.stroke();
        }

        // faint chevrons riding the flow (direction at a glance)
        const gap = 120, off = frac(t * 170 / gap) * gap * dir;
        ctx.beginPath();
        for (let row = -1; row <= 1; row += 2) {
          const y = z.y + row * z.height * 0.22, stag = row > 0 ? gap / 2 : 0;
          for (let x = zl - gap; x < zr + gap; x += gap) {
            const cx = x + off + stag;
            if (cx < zl + 10 || cx > zr - 10) continue;
            ctx.moveTo(cx - dir * 6, y - 8); ctx.lineTo(cx + dir * 4, y); ctx.lineTo(cx - dir * 6, y + 8);
          }
        }
        ctx.strokeStyle = c.core; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.3; ctx.stroke();

        // the simulated solar-wind particles: streaks, 3 depth layers,
        // dimmer outside the zone where they fade in / out
        const ps = z.particles;
        if (ps && ps.length) {
          for (let layer = 1; layer <= 3; layer++) {
            for (let pass = 0; pass < 2; pass++) {
              ctx.beginPath();
              let any = false;
              for (let j = 0; j < ps.length; j++) {
                const p = ps[j];
                if (p.layer !== layer) continue;
                const inside = p.x > zl && p.x < zr;
                if ((pass === 0) !== inside) continue;
                const len = (p.length || 20) * (0.8 + layer * 0.5);
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - dir * len, p.y);
                any = true;
              }
              if (!any) continue;
              ctx.strokeStyle = layer === 3 ? PAL.aurora : layer === 2 ? '#7fe8f0' : PAL.auroraB;
              ctx.lineWidth = 0.8 + layer * 0.55;
              ctx.globalAlpha = (0.12 + layer * 0.14) * (pass === 0 ? 1 : 0.4);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    _drawWells(ctx, g, t) {
      const ws = g.gravityWells, cs = this._wells;
      if (!ws || !cs) return;
      const p = g.player;
      for (let i = 0; i < ws.length && i < cs.length; i++) {
        const w = ws[i], c = cs[i];
        const R2 = w.radius * 2;
        if (!ASCENT.Cam.visible(g, w.x, w.y, R2 + 20)) continue;
        const rot = w.rotation || 0;
        let inside = false;
        if (p) { const dx = p.x - w.x, dy = p.y - w.y; inside = dx * dx + dy * dy < R2 * R2; }

        // influence zone: violet tint + slowly turning dashed boundary at radius×2
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, S.gViolet, w.x, w.y, R2 * 1.05, inside ? 0.17 : 0.09);
        ctx.globalCompositeOperation = 'source-over';
        ctx.setLineDash(DASH_RING);
        ctx.lineDashOffset = -rot * 24;
        ctx.strokeStyle = '#b88aff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = inside ? 0.55 + 0.2 * Math.sin(t * 6) : 0.26;
        ctx.beginPath(); ctx.arc(w.x, w.y, R2, 0, TAU); ctx.stroke();
        ctx.setLineDash(NO_DASH);

        // lensing: a warm halo whose middle is swallowed by a dark shroud
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, S.gAccr, w.x, w.y, c.outR * 2.4, 0.3);
        ctx.globalCompositeOperation = 'source-over';
        glow(ctx, S.dark, w.x, w.y, c.core * 3.4, 0.95);

        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(c.tilt);

        // infalling streaks spiral in and flatten into the disk plane
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffc890';
        ctx.lineWidth = 1.6;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          let any = false;
          for (let k = 0; k < c.infall.length; k++) {
            const f = c.infall[k];
            const u = frac(t * f.spd + f.off);
            if ((u < 0.55) !== (pass === 0)) continue;
            infallPt(c, f, u, R2, rot);
            ctx.moveTo(IX, IY);
            infallPt(c, f, Math.max(0, u - 0.035), R2, rot);
            ctx.lineTo(IX, IY);
            any = true;
          }
          if (!any) continue;
          ctx.globalAlpha = pass === 0 ? 0.28 : 0.6;
          ctx.stroke();
        }

        // far half of the disk (behind the core)
        ctx.save();
        ctx.scale(1, c.sq);
        ctx.beginPath();
        ctx.rect(-c.outR - 4, -c.outR - 4, c.outR * 2 + 8, c.outR + 4);
        ctx.clip();
        drawDisk(ctx, c, rot, 0.85);
        ctx.restore();

        // lensed image of the far disk arching over the core (+ faint one under it)
        ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 5; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 0, c.core * 1.5, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
        ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.lineWidth = 1.2; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(0, 0, c.core * 1.22, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();

        // the event horizon + photon ring
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(0, 0, c.core, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffe6c0'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(0, 0, c.core + 0.8, 0, TAU); ctx.stroke();

        // near half of the disk (crosses in front of the core)
        ctx.save();
        ctx.scale(1, c.sq);
        ctx.beginPath();
        ctx.rect(-c.outR - 4, 0, c.outR * 2 + 8, c.outR + 4);
        ctx.clip();
        drawDisk(ctx, c, rot, 1);
        ctx.restore();

        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    _drawFlareBands(ctx, g, t) {
      const fs = g.solarFlares;
      if (!fs || !fs.length) return;
      const lw = g.levelWidth;
      const x0 = Math.max(0, V.l), x1 = Math.min(lw, V.r);
      if (x1 <= x0) return;
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        const hh = (f.height || 30) / 2;
        if (f.y + hh + 240 < V.t || f.y - hh - 240 > V.b) continue;
        const dir = f.direction >= 0 ? 1 : -1, srcX = dir > 0 ? 0 : lw;
        if (f.state === 'warning') {
          this._flareWarning(ctx, g, f, i, x0, x1, hh, dir, srcX);
        } else if (f.state === 'active') {
          // the not-yet-swept part of the band: a faint red path ahead of the beam
          const ux0 = dir > 0 ? Math.max(x0, f.x) : x0, ux1 = dir > 0 ? x1 : Math.min(x1, f.x);
          if (ux1 > ux0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.1; ctx.fillStyle = PAL.danger;
            ctx.fillRect(ux0, f.y - hh, ux1 - ux0, hh * 2);
            ctx.setLineDash(DASH_PATH); ctx.lineDashOffset = ux0 % 40;
            ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(ux0, f.y - hh); ctx.lineTo(ux1, f.y - hh);
            ctx.moveTo(ux0, f.y + hh); ctx.lineTo(ux1, f.y + hh);
            ctx.stroke();
            ctx.setLineDash(NO_DASH);
          }
        } else {
          // idle: a faint marker band + the vent simmering at the source edge
          const k = clamp((f.timer || 0) / 5, 0, 1);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.045; ctx.fillStyle = PAL.plasma;
          ctx.fillRect(x0, f.y - hh, x1 - x0, hh * 2);
          ctx.setLineDash(DASH_BAND); ctx.lineDashOffset = x0 % 26;
          ctx.strokeStyle = PAL.plasma; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.16 + 0.1 * k;
          ctx.beginPath();
          ctx.moveTo(x0, f.y - hh); ctx.lineTo(x1, f.y - hh);
          ctx.moveTo(x0, f.y + hh); ctx.lineTo(x1, f.y + hh);
          ctx.stroke();
          ctx.setLineDash(NO_DASH);
          if (srcX > V.l - 200 && srcX < V.r + 200) {
            ctx.globalCompositeOperation = 'lighter';
            const fl = 0.85 + 0.15 * Math.sin(t * 9 + i);
            glow(ctx, S.gPlasma, srcX, f.y, 40 + 50 * k, (0.25 + 0.4 * k * k) * fl);
            glow(ctx, S.gWhite, srcX, f.y, 10 + 10 * k, 0.5 * fl);
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // Warning: pulsing red band, marching chevrons, charging glow at the source.
    _flareWarning(ctx, g, f, i, x0, x1, hh, dir, srcX) {
      const k = clamp((f.timer || 0) / (f.warningTime || 2), 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin((f.timer || 0) * (9 + 12 * k));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.16 + 0.18 * pulse;
      ctx.fillStyle = PAL.danger;
      ctx.fillRect(x0, f.y - hh, x1 - x0, hh * 2);
      ctx.globalCompositeOperation = 'lighter';
      stretch(ctx, S.warnBand, x0, f.y - hh * 3.2, x1 - x0, hh * 6.4, 0.25 + 0.35 * pulse);
      ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.4 * pulse;
      ctx.beginPath();
      ctx.moveTo(x0, f.y - hh); ctx.lineTo(x1, f.y - hh);
      ctx.moveTo(x0, f.y + hh); ctx.lineTo(x1, f.y + hh);
      ctx.stroke();

      // chevrons marching the way the beam will sweep
      const gap = K.FLARE_CHEVRON_GAP, off = frac((f.timer || 0) * 2.6) * gap * dir;
      const kx0 = Math.floor(x0 / gap) * gap - gap;
      ctx.beginPath();
      for (let x = kx0; x < x1 + gap; x += gap) {
        const cx = x + off;
        if (cx < x0 - 10 || cx > x1 + 10) continue;
        ctx.moveTo(cx - dir * 6, f.y - hh * 0.6);
        ctx.lineTo(cx + dir * 5, f.y);
        ctx.lineTo(cx - dir * 6, f.y + hh * 0.6);
      }
      ctx.strokeStyle = '#ffd2c4'; ctx.lineWidth = 3.2; ctx.globalAlpha = 0.55 + 0.4 * pulse;
      ctx.stroke();

      const cam = g.camera;
      if (srcX > cam.x - 60 && srcX < cam.x + cam.viewW + 60) {
        // the source edge charges up
        glow(ctx, S.gRed, srcX, f.y, 70 + 160 * k, 0.5 + 0.4 * k);
        glow(ctx, S.gPlasma, srcX, f.y, 30 + 70 * k, 0.6 + 0.4 * pulse);
        glow(ctx, S.gWhite, srcX, f.y, 12 + 20 * k, 0.9);
      } else {
        // source off-screen: flash an "incoming" marker at the view edge it will enter from
        const ex = dir > 0 ? cam.x + 70 / V.z : cam.x + cam.viewW - 70 / V.z;
        glow(ctx, S.gRed, ex, f.y, 70, 0.4 + 0.45 * pulse);
        ctx.beginPath();
        for (let j = 0; j < 3; j++) {
          const cx = ex + dir * (j - 1) * 16;
          ctx.moveTo(cx - dir * 8, f.y - 13);
          ctx.lineTo(cx + dir * 6, f.y);
          ctx.lineTo(cx - dir * 8, f.y + 13);
        }
        ctx.strokeStyle = '#fff0e8'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.stroke();
      }
    },

    // ------------------------------------------------------------ platforms
    drawPlatforms(ctx, g) {
      if (!this._ready(g)) return;
      setView(g);
      const t = this._t, P = g.platforms, C = this._pc, Cam = ASCENT.Cam;
      ctx.save();
      for (let i = 0; i < P.length; i++) {
        const a = P[i], c = C[i];
        if (a.type === 'crumbling') {
          if (a.debris && a.debris.length) this._debris(ctx, a);
          if (a.crumbled) continue;
        }
        if (!Cam.visible(g, a.x, a.y, a.width / 2 + 24)) continue;
        this._platform(ctx, a, c, t);
      }
      ctx.restore();
    },

    _platform(ctx, a, c, t) {
      const type = a.type;
      let ox = 0, oy = 0, k = 0;
      if (type === 'crumbling' && a.crumbling) {                   // shivers as it gives way
        k = clamp((a.crumbleTimer || 0) / (a.crumbleDelay || 1.5), 0, 1);
        const amp = 0.6 + 2.2 * k;
        ox = Math.sin(t * 71 + c.sh) * amp;
        oy = Math.cos(t * 53 + c.sh * 2) * amp * 0.6;
      }
      let phase = 0, solid = true;
      if (type === 'disappearing') {
        const cyc = (a.visibleDuration || 3) + (a.invisibleDuration || 2);
        phase = (((a.phaseTimer || 0) % cyc) + cyc) % cyc;
        solid = phase < (a.visibleDuration || 3);
      }
      ctx.save();
      ctx.translate(a.x + ox, a.y + oy);
      ctx.rotate(a.angle || 0);
      if (a.moving && solid) this._drift(ctx, a, c, t);
      if (type === 'rotating') this._satellite(ctx, a, c, t);
      else if (type === 'disappearing') this._crystal(ctx, a, c, t, phase);
      else if (type === 'crumbling') this._meteorite(ctx, a, c, t, k);
      else this._rock(ctx, a, c, t);
      ctx.restore();
    },

    // Drifting slabs: two fading motion ghosts + an ion puff at the trailing end.
    _drift(ctx, a, c, t) {
      const w = (a.moveTime || 0) * (a.moveSpeed || 0) / 100;
      const vx = Math.cos(w) * (a.moveAmplitude || 0) * (a.moveSpeed || 0) / 100;
      const s = clamp(Math.abs(vx) / 700, 0, 1);
      if (s < 0.03) return;
      const ang = a.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang);
      const d = clamp(-vx * K.GHOST_TIME, -K.GHOST_MAX, K.GHOST_MAX);
      const lx = d * ca, ly = -d * sa;                            // world (d,0) in the slab's frame
      ctx.fillStyle = a.type === 'rotating' ? '#9fc4ff' : a.type === 'disappearing' ? '#e0b0ff'
        : a.type === 'crumbling' ? '#cfe6ff' : GR.pals[c.q].rim;
      ctx.globalAlpha = 0.13 * s;
      ctx.translate(lx, ly); ctx.fill(c.sil);
      ctx.globalAlpha = 0.06 * s;
      ctx.translate(lx, ly); ctx.fill(c.sil);
      ctx.translate(-2 * lx, -2 * ly);
      if (a.type !== 'rotating') {
        const tail = -(vx * ca >= 0 ? 1 : -1) * (a.width / 2 + 2);
        const fl = 0.8 + 0.2 * Math.sin(t * 40 + c.sh);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, S.gBlue, tail, 1, 9 + 10 * s, 0.55 * s * fl);
        glow(ctx, S.gWhite, tail, 1, 3 + 3 * s, 0.7 * s * fl);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    },

    // Asteroid slab: altitude-tinted body, dark edge, craters, sunlit top, leaves.
    _rock(ctx, a, c, t) {
      const pal = GR.pals[c.q];
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.grad; ctx.fill(c.sil);
      ctx.strokeStyle = 'rgba(10,6,24,0.5)'; ctx.lineWidth = 1.2; ctx.stroke(c.sil);
      ctx.strokeStyle = 'rgba(150,170,255,0.32)'; ctx.lineWidth = 1.1; ctx.stroke(c.bot);
      ctx.fillStyle = pal.crater; ctx.fill(c.craters);
      ctx.fillStyle = pal.speck; ctx.fill(c.specks);
      ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9; ctx.stroke(c.top);
      if (c.leaves) {
        ctx.globalAlpha = 1; ctx.fillStyle = pal.leaf; ctx.fill(c.leaves);
        ctx.globalCompositeOperation = 'lighter';
        const tw = 0.75 + 0.25 * Math.sin(t * 2.4 + c.sh);
        const y = -(a.height || 14) / 2 - 2;
        for (let j = 0; j < c.leafX.length; j++) glow(ctx, S.gLeaf, c.leafX[j], y, 11, (0.22 + 0.3 * (a.E || 0)) * tw);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    },

    // Brittle meteorite: frost-crusted dark rock whose cracks glow hotter as it fails.
    _meteorite(ctx, a, c, t, k) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = GR.crumble; ctx.fill(c.sil);
      ctx.strokeStyle = 'rgba(8,4,16,0.6)'; ctx.lineWidth = 1.2; ctx.stroke(c.sil);
      ctx.fillStyle = 'rgba(20,14,30,0.7)'; ctx.fill(c.craters);
      ctx.strokeStyle = '#d6ecff'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85; ctx.stroke(c.top);
      const idle = 0.3 + 0.15 * Math.sin((a.pulseTimer || 0) * 2.2 + c.sh);
      const heat = Math.max(idle, k);
      const fl = k > 0 ? 0.85 + 0.15 * Math.sin(t * 30 + c.sh) : 1;
      ctx.globalCompositeOperation = 'lighter';
      if (k > 0) {
        ctx.globalAlpha = (0.25 + 0.6 * k) * fl;
        ctx.drawImage(S.gPlasma, -a.width * 0.7, -26, a.width * 1.4, 52);
      }
      ctx.save();
      ctx.clip(c.sil);                                           // cracks glow inside the rock only
      ctx.strokeStyle = '#ff5a20'; ctx.lineWidth = 3 + 3 * k; ctx.globalAlpha = (0.15 + 0.55 * heat * heat) * fl;
      ctx.stroke(c.cracks);
      ctx.strokeStyle = '#ffc070'; ctx.lineWidth = 1 + 0.8 * k; ctx.globalAlpha = (0.3 + 0.7 * heat) * fl;
      ctx.stroke(c.cracks);
      if (k > 0.45) {
        ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 0.8; ctx.globalAlpha = (k - 0.45) / 0.55;
        ctx.stroke(c.cracks);
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // Debris of a failing / shattered meteorite (world coords, lives on the slab).
    _debris(ctx, a) {
      const D = a.debris;
      if (!(a.y - 80 < V.b && a.y + 1500 > V.t && a.x + 600 > V.l && a.x - 600 < V.r)) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#5a4c6a';
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        let any = false;
        for (let j = 0; j < D.length; j++) {
          const d = D[j];
          if ((d.life > 0.4) !== (pass === 0)) continue;
          const s = d.size || 3, sp = (j % 3) * 0.2;
          ctx.moveTo(d.x, d.y - s);
          ctx.lineTo(d.x + s * (0.7 + sp), d.y - s * 0.1);
          ctx.lineTo(d.x + s * 0.1, d.y + s * 0.9);
          ctx.lineTo(d.x - s * (0.8 - sp), d.y + s * 0.1);
          ctx.closePath();
          any = true;
        }
        if (!any) continue;
        ctx.globalAlpha = pass === 0 ? 1 : 0.45;
        ctx.fill();
      }
      ctx.beginPath();                                           // glowing embers
      let any = false;
      for (let j = 0; j < D.length; j++) {
        const d = D[j];
        if (!(d.life > 0.3)) continue;
        const s = (d.size || 3) * 0.45;
        ctx.rect(d.x - s * 0.5, d.y - s * 0.5, s, s);
        any = true;
      }
      if (any) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffa050'; ctx.globalAlpha = 0.85; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    },

    // Tumbling satellite: panels catch the sun as it spins; tip beacons blink.
    _satellite(ctx, a, c, t) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = GR.wing; ctx.fill(c.wings);
      ctx.strokeStyle = '#a9bde0'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.85; ctx.stroke(c.grid);
      const sheen = Math.pow(Math.max(0, Math.cos((a.angle || 0) * 2 + c.sh)), 10);
      if (sheen > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sheen * 0.6; ctx.fillStyle = '#cfe4ff'; ctx.fill(c.wings);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#b8bccc'; ctx.lineWidth = 1.1; ctx.stroke(c.truss);
      ctx.fillStyle = GR.hub; ctx.fill(c.hub);
      ctx.strokeStyle = 'rgba(110,70,20,0.85)'; ctx.lineWidth = 0.8; ctx.stroke(c.ribs);
      ctx.fillStyle = '#1a2a50'; ctx.fill(c.port);
      const bl = frac(t * 0.9 + c.blink);
      const onR = bl < 0.12 ? 1 : 0, onG = bl > 0.5 && bl < 0.62 ? 1 : 0;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, S.gRed, c.tip, 0, 8 + 6 * onR, 0.2 + 0.75 * onR);
      glow(ctx, S.gTeal, -c.tip, 0, 8 + 6 * onG, 0.2 + 0.75 * onG);
      glow(ctx, S.gBlue, 0, 0, 6, 0.4 + 0.2 * Math.sin(t * 3 + c.sh));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // Phase crystal: shimmering glass while solid, flickering warning before it
    // goes, a dashed ghost (intangible) while gone, a flash when it's back.
    _crystal(ctx, a, c, t, ph) {
      const vis = a.visibleDuration || 3, inv = a.invisibleDuration || 2;
      const hw = c.hw, h2 = (a.height || 14) / 2;
      if (ph < vis) {
        const fin = clamp(ph / 0.25, 0, 1);
        const warn = clamp((ph - (vis - 0.8)) / 0.8, 0, 1);
        const blink = warn > 0 ? 0.5 + 0.5 * Math.cos(ph * TAU * (3 + 6 * warn)) : 1;
        const al = (0.85 + 0.15 * fin) * (1 - 0.55 * warn * (1 - blink));
        const shim = 0.8 + 0.2 * Math.sin(t * 3 + c.sh);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * al * shim;
        ctx.drawImage(S.gMagenta, -hw * 1.3, -18, hw * 2.6, 36);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = al;
        ctx.fillStyle = GR.crystal; ctx.fill(c.sil);
        ctx.fillStyle = 'rgba(255,240,255,0.42)'; ctx.fill(c.facet);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.8; ctx.stroke(c.lines);
        ctx.save();                                              // a glint sweeping the glass
        ctx.clip(c.sil);
        ctx.globalCompositeOperation = 'lighter';
        const sx = -hw - 10 + frac(t * 0.45 + c.sh) * (hw * 2 + 24);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(sx, -h2 - 2); ctx.lineTo(sx + 6, -h2 - 2); ctx.lineTo(sx - 2, h2 + 2); ctx.lineTo(sx - 8, h2 + 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffe6ff'; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.9 * al;
        ctx.stroke(c.sil);
        if (warn > 0) {
          ctx.strokeStyle = '#ff5a8a'; ctx.lineWidth = 2.6;
          ctx.globalAlpha = warn * (0.35 + 0.65 * (1 - blink));
          ctx.stroke(c.sil);
        }
        if (ph < 0.3) glow(ctx, S.gWhite, 0, 0, hw * 0.9 + 10, (1 - ph / 0.3) * 0.8);
      } else {
        const q = clamp((ph - vis) / inv, 0, 1);
        const pre = q > 0.8 ? (q - 0.8) / 0.2 : 0;               // about to re-materialise
        ctx.setLineDash(DASH_GHOST);
        ctx.lineDashOffset = -t * 10;
        ctx.strokeStyle = '#d8b8ff'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.3 + 0.35 * pre;
        ctx.stroke(c.sil);
        ctx.setLineDash(NO_DASH);
        if (pre > 0) { ctx.globalAlpha = 0.22 * pre; ctx.fillStyle = GR.crystal; ctx.fill(c.sil); }
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, S.gMagenta, Math.sin(t * 1.3 + c.sh * 3) * hw * 0.7, Math.cos(t * 1.9 + c.sh) * 3, 7, 0.45);
        glow(ctx, S.gMagenta, Math.sin(t * 0.9 + c.sh * 5 + 2) * hw * 0.7, Math.cos(t * 1.4 + c.sh) * 3, 5, 0.35);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // ------------------------------------------------------------ goal
    drawGoal(ctx, g) {
      const G0 = g.goal;
      if (!G0 || !g.camera || !S.ready) return;
      setView(g);
      const gx = G0.x, gy = G0.y, t = this._t;
      if (gy - K.GOAL_AURA > V.b || gy + K.GOAL_BEACON < V.t || gx + K.GOAL_AURA < V.l || gx - K.GOAL_AURA > V.r) return;
      const since = G0.reached ? Math.max(0, (g.time || 0) - (G0.reachedAt || 0)) : 0;
      const bloom = G0.reached ? clamp(since / 0.8, 0, 1) : 0;
      const pulse = 0.88 + 0.12 * Math.sin(t * 1.4);
      ctx.save();

      // radiance: a light column hanging down the sky, a huge soft aura, slow rays
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(0.12 * pulse * (1 + bloom), 0, 1);
      ctx.drawImage(S.beacon, gx - 80, gy + 30, 160, K.GOAL_BEACON);
      glow(ctx, S.gGold, gx, gy, K.GOAL_AURA * (1 + 0.15 * bloom), 0.3 * pulse * (1 + 0.6 * bloom));
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(t * 0.05);
      const rr = 380 + 60 * bloom;
      ctx.globalAlpha = clamp(0.28 * pulse + 0.3 * bloom, 0, 1);
      ctx.drawImage(S.rays, -rr, -rr, rr * 2, rr * 2);
      ctx.rotate(-t * 0.13);
      ctx.globalAlpha = 0.16 + 0.2 * bloom;
      ctx.drawImage(S.rays, -rr * 0.7, -rr * 0.7, rr * 1.4, rr * 1.4);
      ctx.restore();
      glow(ctx, S.gLeaf, gx, gy + 10, 200, 0.45 * pulse * (1 + bloom));

      // the tree on its planetoid; the canopy sways a hair
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(S.trunk, gx - 60, gy - 6, 120, 118);
      const sx = Math.sin(t * 0.9) * 1.2, sy = Math.sin(t * 1.3) * 0.6;
      ctx.drawImage(S.canopy, gx - 100 + sx, gy - 48 + sy, 200, 84);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(0.18 + 0.12 * Math.sin(t * 2) + 0.5 * bloom, 0, 1);
      ctx.drawImage(S.canopy, gx - 100 + sx, gy - 48 + sy, 200, 84);
      if (G0.reached && since < 0.7) glow(ctx, S.gWhite, gx, gy, 170, (1 - since / 0.7) * 0.9);

      // twinkling sparkles around the crown
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const s = 1.2 + 3.2 * Math.max(0, Math.sin(t * (1.6 + hash(i, 3) * 1.8) + i * 1.7)) * (1 + 0.4 * bloom);
        if (s < 1.35) continue;
        const px = gx + (hash(i, 1) - 0.5) * 230, py = gy - 10 + (hash(i, 2) - 0.5) * 110;
        ctx.moveTo(px, py - 2.2 * s); ctx.lineTo(px + 0.4 * s, py - 0.4 * s);
        ctx.lineTo(px + 2.2 * s, py); ctx.lineTo(px + 0.4 * s, py + 0.4 * s);
        ctx.lineTo(px, py + 2.2 * s); ctx.lineTo(px - 0.4 * s, py + 0.4 * s);
        ctx.lineTo(px - 2.2 * s, py); ctx.lineTo(px - 0.4 * s, py - 0.4 * s);
        ctx.closePath();
      }
      ctx.fillStyle = '#fff6c8'; ctx.globalAlpha = 0.85; ctx.fill();

      // leaves drifting off the canopy
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < K.GOAL_LEAVES; i++) {
        const p = frac(t * (0.07 + 0.06 * hash(i, 4)) * (1 + bloom) + hash(i, 5));
        const al = Math.sin(Math.PI * p) * 0.9;
        if (al < 0.03) continue;
        const ox = gx + (hash(i, 6) - 0.5) * 150, oy = gy - 4 + (hash(i, 7) - 0.5) * 22;
        const th = Math.PI / 2 + (hash(i, 8) - 0.5) * 2.6;
        const D = (50 + 150 * hash(i, 9)) * p;
        ctx.save();
        ctx.translate(ox + Math.cos(th) * D + Math.sin(t * 1.7 + i) * 7 * p, oy + Math.sin(th) * D);
        ctx.rotate(t * (0.8 + hash(i, 10)) + i);
        ctx.globalAlpha = al;
        ctx.drawImage(S.leaf, -6, -3, 12, 6);
        ctx.restore();
      }

      // reached: golden shockwaves roll out
      if (G0.reached && since < 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = PAL.gold;
        for (let j = 0; j < 2; j++) {
          const s2 = since - j * 0.3;
          if (s2 <= 0 || s2 > 1.5) continue;
          ctx.lineWidth = 6 * (1 - s2 / 1.5) + 1;
          ctx.globalAlpha = 0.8 * (1 - s2 / 1.5);
          ctx.beginPath(); ctx.arc(gx, gy, 40 + s2 * 420, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    },

    // ------------------------------------------------------------ front
    drawFront(ctx, g) {
      if (!g.camera || !S.ready || !NUCLEI.length) return;
      setView(g);
      ctx.save();
      this._drawComets(ctx, g);
      this._drawBeams(ctx, g, this._t);
      ctx.restore();
    },

    _drawComets(ctx, g) {
      const ms = g.meteors;
      if (!ms || !ms.length) return;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (!ASCENT.Cam.visible(g, m.x, m.y, K.COMET_TAIL)) continue;
        const sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        const ux = sp > 1e-3 ? m.vx / sp : 1, uy = sp > 1e-3 ? m.vy / sp : 0;
        const r = m.radius || 15, seed = m.seed || 0;
        ctx.globalCompositeOperation = 'lighter';

        // the recorded path: a bright ion streak
        const tr = m.trail;
        if (tr && tr.length > 1) {
          ctx.beginPath();
          ctx.moveTo(tr[0].x, tr[0].y);
          for (let j = 1; j < tr.length; j++) ctx.lineTo(tr[j].x, tr[j].y);
          ctx.lineTo(m.x, m.y);
          ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = r * 1.1; ctx.globalAlpha = 0.14; ctx.stroke();
          ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = r * 0.3; ctx.globalAlpha = 0.4; ctx.stroke();
        }

        // ion tail (straight, blue) + dust tail (warm, splayed), opposite the motion
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.atan2(-uy, -ux));
        const L = K.COMET_TAIL * (0.85 + 0.3 * seed);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(S.tailIon, -r * 0.3, -r * 1.5, L, r * 3);
        ctx.rotate(seed > 0.5 ? 0.14 : -0.14);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(S.tailDust, -r * 0.3, -r * 2.2, L * 0.6, r * 4.4);
        ctx.restore();
        glow(ctx, S.gIce, m.x, m.y, r * 3.4, 0.9);

        // the tumbling nucleus
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const nu = NUCLEI[Math.floor(seed * NUCLEI.length) % NUCLEI.length];
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot || 0);
        ctx.scale(r * 0.72, r * 0.72);
        ctx.fillStyle = '#8a86a4'; ctx.fill(nu.body);
        ctx.fillStyle = '#3e3852'; ctx.fill(nu.pits);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, S.gWhite, m.x + ux * r * 0.25, m.y + uy * r * 0.25, r * 1.2, 0.4);   // sunlit coma on the leading face
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    // Active solar flares: plasma over the swept part only, a white-hot front, sparks.
    _drawBeams(ctx, g, t) {
      const fs = g.solarFlares;
      if (!fs || !fs.length) return;
      const lw = g.levelWidth;
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        if (f.state !== 'active') continue;
        const hh = (f.height || 30) / 2;
        if (f.y + 200 < V.t || f.y - 200 > V.b) continue;
        const dir = f.direction >= 0 ? 1 : -1, seed = f.seed || 0;
        const bx0 = dir > 0 ? 0 : f.x, bx1 = dir > 0 ? f.x : lw;
        const vx0 = Math.max(bx0, V.l), vx1 = Math.min(bx1, V.r);
        const fl = 0.86 + 0.14 * Math.sin(t * 31 + i * 7) * Math.sin(t * 17 + seed * 40);
        ctx.globalCompositeOperation = 'lighter';
        if (vx1 > vx0) {
          stretch(ctx, S.beamHeat, vx0, f.y - 80, vx1 - vx0, 160, 0.6 * fl);
          stretch(ctx, S.beamCore, vx0, f.y - hh - 12, vx1 - vx0, hh * 2 + 24, 0.95 * fl);
          ctx.beginPath();                                        // writhing filaments
          const xs = Math.floor(vx0 / 22) * 22;
          for (let j = 0; j < 3; j++) {
            const A = hh * (0.35 + 0.18 * j), kx = 0.011 + j * 0.006, w = (9 + j * 5) * dir, ph = j * 2.1 + seed * 9;
            let first = true;
            for (let x = xs; x <= vx1 + 22; x += 22) {
              const xx = clamp(x, vx0, vx1);
              const y = f.y + A * Math.sin(xx * kx - t * w + ph) * (0.6 + 0.4 * Math.sin(xx * 0.003 + t * 3 + j));
              if (first) { ctx.moveTo(xx, y); first = false; } else ctx.lineTo(xx, y);
            }
          }
          ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 3.2; ctx.globalAlpha = 0.45 * fl; ctx.stroke();
          ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.85 * fl; ctx.stroke();
        }
        if (ASCENT.Cam.visible(g, f.x, f.y, 180)) {
          const fx = f.x - dir * 10;                              // glow sits on the burnt side
          glow(ctx, S.gPlasma, fx, f.y, 150, 0.85 * fl);
          ctx.globalAlpha = 0.6 * fl;
          ctx.drawImage(S.gPlasma, fx - 40, f.y - 130, 80, 260);
          glow(ctx, S.gWhite, fx, f.y, 46, 1);
          ctx.beginPath();
          for (let j = 0; j < 14; j++) {
            const age = frac(t * (1.4 + hash(j, 21) * 0.8) + hash(j, 22));
            const svx = -dir * (120 + 260 * hash(j, 23)), svy = (hash(j, 24) - 0.5) * 320;
            const px = f.x + svx * age * 0.55, py = f.y + (hash(j, 25) - 0.5) * hh * 1.6 + svy * age * 0.55;
            ctx.moveTo(px, py);
            ctx.lineTo(px - svx * 0.04, py - svy * 0.04);
          }
          ctx.strokeStyle = '#ffe3a0'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9; ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
})();
