// Jimbog - tex_campus: the 27 textures for the Research Campus map.
// Each generator gen(S, R) fills S.c (sRGB, 3 per px), S.h (height), S.r (roughness),
// optionally S.a (alpha). One tile = 2 m x 2 m. Everything wraps at the tile edge.
// Seams: `u` runs across the canvas (x), `w` runs down it (y), so features that run
// "along v" (vertical in the image) are constant in u and vary in w.
(function () {
  'use strict';
  const JB = window.JB;
  const H = JB.Tex.helpers;
  const { vnoise, fbmN, worley, stamp, walk, shadeC, tintC, sstep, lerp, clamp01, clampN, wrapI, TAU } = H;
  const PI = Math.PI;

  // ---------- utilities ----------
  // Visit every pixel: f(index, u, w), u/w = pixel centres in tile units.
  function each(N, f) {
    const inv = 1 / N;
    for (let y = 0; y < N; y++) {
      const w = (y + 0.5) * inv, row = y * N;
      for (let x = 0; x < N; x++) f(row + x, (x + 0.5) * inv, w);
    }
  }
  function setC(C, i, r, g, b) { C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b; }
  // Signed distance (tile units) from x to the nearest multiple of 1/n. Periodic.
  function sdist(x, n) { const t = x * n; return (t - Math.round(t)) / n; }
  // Value below which a fraction q of the samples lie (histogram, cheap).
  function quant(arr, q) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const B = 1024, hist = new Uint32Array(B), s = (B - 1) / ((hi - lo) || 1);
    for (let i = 0; i < arr.length; i++) hist[((arr[i] - lo) * s) | 0]++;
    const target = q * arr.length;
    let acc = 0;
    for (let b = 0; b < B; b++) { acc += hist[b]; if (acc >= target) return lo + b / s; }
    return hi;
  }
  // Turn a 0/1 coverage mask into an alpha with a ~1 px soft edge (3x3 wrapped average).
  function softMask(N, A) {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const r = wrapI(y + dy, N) * N;
        for (let dx = -1; dx <= 1; dx++) s += A[r + wrapI(x + dx, N)];
      }
      out[y * N + x] = sstep(0.25, 0.75, s / 9);
    }
    return out;
  }
  // Transparent texels are stored at alpha 16/255 rather than 0. The canvas path in textures.js (finish())
  // is premultiplied and drops RGB where alpha is 0, which made transparent texels black and darkened
  // leaves and wires at mip levels and along edges. At 16/255 the colour survives (about +-8 levels) and
  // any alphaTest of 0.1 or more still discards these texels.
  const ALPHA_FLOOR = 16 / 255;
  function floorAlpha(A) { for (let i = 0; i < A.length; i++) if (A[i] < ALPHA_FLOOR) A[i] = ALPHA_FLOOR; }
  // Filled ellipse, periodic. fn(index, t, X, Y): t = 0 centre..1 edge, X/Y = coords on the
  // major/minor axes in units of the radii a/b (tile units). phi = rotation.
  function ellipse(N, cu, cw, a, b, phi, fn) {
    const cs = Math.cos(phi), sn = Math.sin(phi), rr = Math.ceil(Math.max(a, b) * N) + 2;
    const x0 = Math.floor(cu * N), y0 = Math.floor(cw * N);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      let ex = (x0 + dx + 0.5) / N - cu, ey = (y0 + dy + 0.5) / N - cw;
      ex -= Math.round(ex); ey -= Math.round(ey);
      const X = (ex * cs + ey * sn) / a, Y = (-ex * sn + ey * cs) / b, e2 = X * X + Y * Y;
      if (e2 > 1) continue;
      fn(wrapI(y0 + dy, N) * N + wrapI(x0 + dx, N), Math.sqrt(e2), X, Y);
    }
  }

  // ---------- 1. grass: mown lawn ----------
  function gen_grass(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const big = fbmN(N, 6, 6, 3, R), med = fbmN(N, 14, 14, 3, R);
    const fine = vnoise(N, 300, 300, R), fib = vnoise(N, 180, 70, R);
    each(N, (i) => {
      const lp = sstep(0.6, 0.85, big[i]), dp = sstep(0.4, 0.15, big[i]);
      const k = 1 + (med[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.24 + (fib[i] - 0.5) * 0.2;
      let r = lerp(0.44, 0.55, lp * 0.35), g = lerp(0.6, 0.69, lp * 0.35), b = lerp(0.28, 0.34, lp * 0.35);
      r = lerp(r, 0.37, dp * 0.3); g = lerp(g, 0.52, dp * 0.3); b = lerp(b, 0.24, dp * 0.3);
      setC(C, i, r * k, g * k, b * k);
      Hh[i] = 0.5 + (fine[i] - 0.5) * 0.12 + (fib[i] - 0.5) * 0.1 + (med[i] - 0.5) * 0.04;
      RO[i] = 0.95 + (fine[i] - 0.5) * 0.03;
    });
    for (let k = 0; k < 16; k++) {            // clover: small clusters of pale dots
      const cu = R(), cw = R();
      for (let d = 0; d < 3; d++) stamp(N, cu + (R() - 0.5) * 0.006, cw + (R() - 0.5) * 0.006, 1.3 / N, (i) => tintC(C, i, 0.66, 0.74, 0.5, 0.8));
    }
    for (let k = 0; k < 40; k++) {            // dry flecks
      stamp(N, R(), R(), 0.9 / N, (i) => tintC(C, i, 0.66, 0.58, 0.33, 0.85));
    }
    S.bump = 1.2;
  }

  // ---------- 2. paving: 0.5 m concrete slabs, 4 x 4 per tile ----------
  function gen_paving(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const tone = new Float32Array(16);
    for (let k = 0; k < 16; k++) tone[k] = (R() - 0.5) * 0.07;
    const mot = fbmN(N, 3, 3, 3, R), agg = vnoise(N, 300, 300, R), blot = fbmN(N, 6, 6, 3, R);
    each(N, (i, u, w) => {
      const su = u * 4, sw = w * 4, iu = Math.floor(su), iw = Math.floor(sw);
      const dj = Math.min(Math.min(su - iu, iu + 1 - su), Math.min(sw - iw, iw + 1 - sw)) / 4;
      const joint = 1 - sstep(1.0 / N, 2.2 / N, dj);
      const k = (1 + tone[iw * 4 + iu]) * (1 + (mot[i] - 0.5) * 0.07) * (1 + (agg[i] - 0.5) * 0.09);
      const st = sstep(0.6, 0.8, blot[i]) * 0.06;
      const m = k * (1 - st);
      setC(C, i, lerp(0.7 * m, 0.4, joint), lerp(0.68 * m, 0.39, joint), lerp(0.635 * m * (1 - 0.5 * st), 0.36, joint));
      Hh[i] = 0.5 + (agg[i] - 0.5) * 0.04 + 0.08 * sstep(0, 3 / N, dj) - 0.12 * joint;
      RO[i] = 0.7 + (mot[i] - 0.5) * 0.1 + 0.2 * joint;
    });
    S.bump = 4;
  }

  // ---------- 3. asphalt ----------
  function gen_asphalt(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), fine = vnoise(N, 380, 380, R), agg = vnoise(N, 180, 180, R);
    const thr = quant(agg, 0.9);                       // about 10% of pixels are aggregate chips
    each(N, (i) => {
      const chip = sstep(thr - 0.015, thr + 0.015, agg[i]);
      const base = 0.16 * (1 + (mot[i] - 0.5) * 0.35) * (1 + (fine[i] - 0.5) * 0.4);
      const v = lerp(base, 0.34 * (0.9 + 0.2 * fine[i]), chip);
      setC(C, i, v * 0.98, v, v * 1.04);
      Hh[i] = 0.4 + 0.12 * chip + (fine[i] - 0.5) * 0.12;
      RO[i] = lerp(0.9 + (mot[i] - 0.5) * 0.1, 0.7, chip);
    });
    const CR = new Float32Array(N * N);                // crack field: max over stamps, applied once
    for (let k = 0; k < 5; k++) {                      // faint cracks, ~2 px wide and continuous
      walk(N, R, R(), R(), 150 + ((R() * 100) | 0), 0.0016, 1.0 / N, 1.1, undefined, (i, t) => {
        const f = 1 - t; if (f > CR[i]) CR[i] = f;
      });
    }
    for (let i = 0; i < N * N; i++) if (CR[i] > 0) { shadeC(C, i, 1 - 0.4 * CR[i]); Hh[i] -= 0.15 * CR[i]; }
    for (let k = 0; k < 7; k++) {                      // oil spots (softer than before)
      stamp(N, R(), R(), 0.02 + R() * 0.035, (i, t) => {
        const f = (1 - t * t) * 0.4; shadeC(C, i, 1 - f); RO[i] = lerp(RO[i], 0.35, f * 0.8);
      });
    }
    S.bump = 3;
  }

  // ---------- 4-6. sports courts ----------
  function courtGen(S, R, base, rough, trowel, mottle) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const grit = vnoise(N, 420, 420, R), grit2 = vnoise(N, 200, 200, R), mot = fbmN(N, 3, 3, 3, R);
    each(N, (i) => {
      const g = grit[i] * 0.6 + grit2[i] * 0.4;
      const k = (1 + (mot[i] - 0.5) * mottle) * (1 + (g - 0.5) * 0.22);
      setC(C, i, base[0] * k, base[1] * k, base[2] * k);
      Hh[i] = 0.5 + (g - 0.5) * 0.25;
      RO[i] = rough + (g - 0.5) * 0.12;
    });
    // Wear arcs and trowel sweeps are accumulated into one additive field first (walk() stamps
    // a pixel many times, so applying the shade per stamp would compound), then applied once.
    const F = new Float32Array(N * N);
    for (let k = 0; k < 2; k++) {                      // very faint wear arcs
      walk(N, R, R(), R(), 90, 0.005, 0.03, 0.4, undefined, (i, t) => { const f = 1 - t; if (f > F[i]) F[i] = f; });
    }
    for (let i = 0; i < N * N; i++) {
      shadeC(C, i, 1 + 0.02 * F[i]);
      RO[i] -= 0.03 * F[i];
    }
    if (trowel) {
      const T = new Float32Array(N * N);
      for (let k = 0; k < 40; k++) {                   // trowel sweeps
        const sg = R() < 0.5 ? 1 : -1;
        walk(N, R, R(), R(), 30, 0.008, 2.2 / N, 0.3, R() * TAU, (i, t) => { T[i] += sg * (1 - t) * 0.5; });
      }
      for (let i = 0; i < N * N; i++) shadeC(C, i, 1 + clampN(T[i], -1, 1) * 0.03);
    }
    S.bump = 2;
  }
  function gen_court_blue(S, R) { courtGen(S, R, [0.231, 0.435, 0.659], 0.55, false, 0.05); }
  function gen_court_green(S, R) { courtGen(S, R, [0.247, 0.49, 0.353], 0.55, false, 0.05); }
  function gen_court_grey(S, R) { courtGen(S, R, [0.68, 0.675, 0.665], 0.7, true, 0.08); }

  // ---------- 7-8. face brick, stretcher bond: 8 bricks x 24 courses per tile ----------
  function genBrick(S, R, lo, hi, mortarC) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, ROWS = 24, COLS = 8;
    const tone = new Float32Array(ROWS * COLS), tint = new Float32Array(ROWS * COLS);
    for (let k = 0; k < tone.length; k++) { tone[k] = R(); tint[k] = (R() - 0.5) * 0.03; }
    const mot = fbmN(N, 16, 16, 3, R), fine = vnoise(N, 150, 150, R), soot = fbmN(N, 3, 3, 3, R);
    const pit = vnoise(N, 260, 260, R), pitT = quant(pit, 0.97);
    each(N, (i, u, w) => {
      const rw = w * ROWS, row = Math.floor(rw), fy = rw - row;
      const off = (row & 1) ? 0.5 : 0;
      const cu = u * COLS + off, col = Math.floor(cu), fx = cu - col;
      const e = Math.min(Math.min(fx, 1 - fx) / COLS, Math.min(fy, 1 - fy) / ROWS);
      const mort = 1 - sstep(0.0022, 0.0032, e);
      const bevel = sstep(0.0028, 0.0075, e);
      const bi = row * COLS + wrapI(col, COLS);
      const t = tone[bi];
      const sootA = sstep(0.6, 0.9, soot[i]) * 0.08;
      const k = (1 + tint[bi]) * (0.94 + 0.12 * mot[i]) * (0.97 + 0.06 * fine[i]) * (1 - sootA);
      const pk = sstep(pitT, pitT + 0.02, pit[i]) * 0.25;
      let r = lerp(lo[0], hi[0], t) * k, g = lerp(lo[1], hi[1], t) * k, b = lerp(lo[2], hi[2], t) * k;
      r *= 1 - pk; g *= 1 - pk; b *= 1 - pk;
      const mk = 0.92 + 0.1 * fine[i];
      setC(C, i, lerp(r, mortarC[0] * mk, mort), lerp(g, mortarC[1] * mk, mort), lerp(b, mortarC[2] * mk, mort));
      Hh[i] = lerp(0.55 + 0.12 * bevel + (mot[i] - 0.5) * 0.04 + (fine[i] - 0.5) * 0.03, 0.22, mort);
      RO[i] = lerp(0.8 + (fine[i] - 0.5) * 0.12 + (soot[i] - 0.5) * 0.1, 0.95, mort);
    });
    S.bump = 3;
  }
  function gen_brick_tan(S, R) { genBrick(S, R, [0.851, 0.692, 0.47], [0.941, 0.806, 0.604], [0.77, 0.77, 0.75]); }
  function gen_brick_dark(S, R) { genBrick(S, R, [0.562, 0.402, 0.226], [0.742, 0.552, 0.346], [0.74, 0.73, 0.7]); }

  // ---------- 9. render ----------
  function gen_render_cream(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), trow = vnoise(N, 300, 300, R), streak = vnoise(N, 70, 3, R);
    each(N, (i) => {
      const st = sstep(0.6, 0.78, streak[i]) * 0.05;       // rain streaks, running down
      const k = (1 + (mot[i] - 0.5) * 0.03 + (trow[i] - 0.5) * 0.012) * (1 - st);
      setC(C, i, 0.949 * k, 0.926 * k, 0.866 * k * (1 - 0.5 * st));
      Hh[i] = 0.5 + (trow[i] - 0.5) * 0.03;
      RO[i] = 0.9 + (trow[i] - 0.5) * 0.06;
    });
    for (let k = 0; k < 30; k++) {                        // trowel marks, very low contrast
      const sg = R() < 0.5 ? 1 : -1;
      walk(N, R, R(), R(), 25, 0.008, 2 / N, 0.3, R() * TAU, (i, t) => { shadeC(C, i, 1 + sg * 0.01 * (1 - t)); });
    }
    S.bump = 1.5;
  }

  // ---------- 10-12. panels (cladding, spandrel) ----------
  // nv / nh = number of panels across u / w per tile. Joints are shadowed grooves.
  function genPanels(S, R, base, rough, nv, nh, wave) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const tint = new Float32Array(nv * nh);
    for (let k = 0; k < tint.length; k++) tint[k] = (R() - 0.5) * 0.02;
    const mot = fbmN(N, 2, 2, 2, R), fine = vnoise(N, 240, 240, R), dim = fbmN(N, 4, 4, 2, R);
    each(N, (i, u, w) => {
      const du = Math.abs(sdist(u, nv)), dw = Math.abs(sdist(w, nh));
      const dj = Math.min(du, dw);
      const joint = 1 - sstep(1.2 / N, 2.6 / N, dj);
      const pidx = Math.floor(w * nh) * nv + Math.floor(u * nv);
      const sheen = 1 + 0.012 * Math.cos(TAU * u * nv);
      const k = (1 + tint[pidx]) * (1 + (mot[i] - 0.5) * 0.03) * (1 + (fine[i] - 0.5) * 0.012) * sheen * (1 - 0.42 * joint);
      setC(C, i, base[0] * k, base[1] * k, base[2] * k);
      Hh[i] = 0.5 + (dim[i] - 0.5) * wave - 0.3 * joint + 0.06 * sstep(0, 3 / N, dj);
      RO[i] = rough + (fine[i] - 0.5) * 0.05 + 0.25 * joint;
    });
    S.bump = 2;
  }
  function gen_cladding_white(S, R) { genPanels(S, R, [0.945, 0.966, 0.978], 0.4, 2, 1, 0.04); }
  function gen_cladding_bluegrey(S, R) { genPanels(S, R, [0.632, 0.699, 0.779], 0.4, 2, 1, 0.04); }
  function gen_panel_green(S, R) { genPanels(S, R, [0.773, 0.836, 0.809], 0.45, 2, 2, 0.02); }

  // ---------- 13. flat roof membrane ----------
  function gen_roof_membrane(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const mot = fbmN(N, 3, 3, 3, R), dirt = fbmN(N, 7, 7, 3, R), fine = vnoise(N, 250, 250, R), peb = vnoise(N, 170, 170, R);
    const pthr = quant(peb, 0.96);
    each(N, (i, u, w) => {
      // overlapping sheet seams every 1 m: a shadow just before each seam and a dark seam line
      const su = sdist(u, 2), sw = sdist(w, 2);
      const shU = sstep(-0.014, -0.005, su) * (1 - sstep(-0.003, 0, su));
      const shW = sstep(-0.014, -0.005, sw) * (1 - sstep(-0.003, 0, sw));
      const edU = 1 - sstep(0.0008, 0.0022, Math.abs(su)), edW = 1 - sstep(0.0008, 0.0022, Math.abs(sw));
      const shadow = Math.max(shU, shW), edge = Math.max(edU, edW);
      const pb = sstep(pthr, pthr + 0.02, peb[i]);
      const dA = sstep(0.6, 0.85, dirt[i]) * 0.08;
      let v = 0.56 * (1 + (mot[i] - 0.5) * 0.05) * (1 - dA) * (1 - 0.12 * shadow) * (1 - 0.3 * edge);
      v = lerp(v, 0.44 + 0.2 * fine[i], pb * 0.8);
      setC(C, i, v, v * 0.995, v * 0.98);
      Hh[i] = 0.5 + (fine[i] - 0.5) * 0.08 + 0.2 * pb - 0.1 * edge;
      RO[i] = 0.72 + (mot[i] - 0.5) * 0.08 + 0.1 * edge;
    });
    S.bump = 2.5;
  }

  // ---------- 14. zincalume corrugated roof: 26 ribs per tile running along v ----------
  function gen_roof_metal(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, RIBS = 26;
    const mot = fbmN(N, 4, 4, 3, R), fine = vnoise(N, 260, 260, R), streak = vnoise(N, 60, 4, R), spot = vnoise(N, 120, 120, R);
    each(N, (i, u) => {
      const t = u * RIBS, ph = t - Math.floor(t);
      const prof = Math.sin(TAU * ph);
      const top = (prof + 1) * 0.5;
      const k = (0.92 + (mot[i] - 0.5) * 0.12) * (0.93 + (fine[i] - 0.5) * 0.2) * (0.85 + 0.25 * top) * (1 - 0.06 * sstep(0.6, 0.8, streak[i]));
      setC(C, i, 0.66 * k, 0.69 * k, 0.72 * k);
      Hh[i] = 0.5 + 0.25 * prof + (spot[i] - 0.5) * 0.02;
      RO[i] = 0.34 + (fine[i] - 0.5) * 0.08 + (mot[i] - 0.5) * 0.08;
    });
    S.bump = 5;
  }

  // ---------- 15. carpet tiles: 0.5 m, 4 per tile ----------
  function gen_carpet_grey(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), fib = vnoise(N, 300, 300, R), nap = vnoise(N, 240, 60, R);
    each(N, (i, u, w) => {
      const du = Math.abs(sdist(u, 4)), dw = Math.abs(sdist(w, 4));
      const seam = 1 - sstep(0.5 / N, 1.6 / N, Math.min(du, dw));
      const k = (1 + (mot[i] - 0.5) * 0.08) * (0.93 + (fib[i] - 0.5) * 0.14) * (0.95 + (nap[i] - 0.5) * 0.1) * (1 - 0.04 * seam);
      setC(C, i, 0.36 * k, 0.4 * k, 0.45 * k);
      Hh[i] = 0.5 + (fib[i] - 0.5) * 0.08 + (nap[i] - 0.5) * 0.05 - 0.05 * seam;
      RO[i] = 0.95 + (fib[i] - 0.5) * 0.04;
    });
    S.bump = 2;
  }

  // ---------- 16. vinyl: pale speckled, 6 x 6 faint seams per tile (0.33 m) ----------
  function gen_lino(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const mot = fbmN(N, 3, 3, 3, R), fine = vnoise(N, 260, 260, R);
    each(N, (i, u, w) => {
      const du = Math.abs(sdist(u, 6)), dw = Math.abs(sdist(w, 6));
      const seam = 1 - sstep(0.5 / N, 1.3 / N, Math.min(du, dw));
      const k = (1 + (mot[i] - 0.5) * 0.06) * (1 + (fine[i] - 0.5) * 0.04) * (1 - 0.06 * seam);
      setC(C, i, 0.8 * k, 0.8 * k, 0.78 * k);
      Hh[i] = 0.5 + (fine[i] - 0.5) * 0.03 - 0.05 * seam;
      RO[i] = 0.4 + (fine[i] - 0.5) * 0.08 + 0.1 * seam;
    });
    const chips = [[0.25, 0.45, 0.6], [0.62, 0.36, 0.26], [0.3, 0.5, 0.36], [0.36, 0.34, 0.32], [0.86, 0.8, 0.5], [0.52, 0.3, 0.45]];
    for (let k = 0; k < 420; k++) {
      const c = chips[(R() * chips.length) | 0], rad = (1.8 + R() * 3.2) / N;
      stamp(N, R(), R(), rad, (i, t) => { tintC(C, i, c[0], c[1], c[2], 0.4 * (1 - 0.4 * t * t)); Hh[i] = 0.5 + 0.03 * (1 - t); });
    }
    S.bump = 1.5;
  }

  // ---------- 17. honey maple sports floor: 33 boards (0.06 m) along u, staggered ends ----------
  function gen_timber_floor(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, NB = 33;
    const btint = new Float32Array(NB), joints = [];
    for (let k = 0; k < NB; k++) {
      btint[k] = (R() - 0.5) * 0.07;
      const J = [];
      let p = R();
      const end = p + 1;
      while (p < end) { J.push(p % 1); p += 0.45 + R() * 0.45; }
      joints.push(J);
    }
    const g1 = vnoise(N, 5, 240, R), g2 = fbmN(N, 3, 12, 3, R), fine = vnoise(N, 220, 220, R);
    each(N, (i, u, w) => {
      const k = Math.min(NB - 1, Math.floor(w * NB));
      const seam = 1 - sstep(0.5 / N, 1.4 / N, Math.abs(sdist(w, NB)));
      const J = joints[k];
      let du = 1;
      for (let j = 0; j < J.length; j++) { let d = Math.abs(u - J[j]); if (d > 0.5) d = 1 - d; if (d < du) du = d; }
      const endJ = 1 - sstep(0.5 / N, 1.3 / N, du);
      const kk = (1 + btint[k]) * (0.93 + 0.1 * g1[i]) * (0.96 + 0.12 * (g2[i] - 0.5)) * (1 + (fine[i] - 0.5) * 0.03);
      const dk = 1 - 0.35 * Math.max(seam, endJ);
      setC(C, i, 0.95 * kk * dk, 0.76 * kk * dk, 0.52 * kk * dk);
      Hh[i] = 0.6 + (g1[i] - 0.5) * 0.04 - 0.15 * seam - 0.1 * endJ;
      RO[i] = 0.35 + (g1[i] - 0.5) * 0.08 + 0.2 * seam;
    });
    S.bump = 3;
  }

  // ---------- 18. weathered outdoor timber: 14 planks per tile, grain along v ----------
  function gen_timber(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, NP = 14;
    const grain = vnoise(N, 70, 3, R), grain2 = vnoise(N, 180, 6, R), weather = fbmN(N, 4, 4, 3, R), fine = vnoise(N, 220, 220, R);
    each(N, (i, u) => {
      const seam = 1 - sstep(1.0 / N, 2.4 / N, Math.abs(sdist(u, NP)));
      const bleach = sstep(0.5, 0.75, weather[i]) * 0.3;
      const k = (0.92 + (grain[i] - 0.5) * 0.24 + (grain2[i] - 0.5) * 0.12) * (0.94 + (fine[i] - 0.5) * 0.1) * (1 - 0.5 * seam);
      setC(C, i, lerp(0.44, 0.6, bleach) * k, lerp(0.4, 0.57, bleach) * k, lerp(0.34, 0.52, bleach) * k);
      Hh[i] = 0.5 + (grain[i] - 0.5) * 0.08 - 0.2 * seam;
      RO[i] = 0.85 + (fine[i] - 0.5) * 0.1 + 0.1 * seam;
    });
    for (let k = 0; k < 3; k++) {                          // splits along the grain
      walk(N, R, R(), R(), 50, 0.004, 0.5 / N, 0.3, PI / 2 + (R() - 0.5) * 0.3, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.4 * f); Hh[i] -= 0.15 * f;
      });
    }
    S.bump = 3;
  }

  // ---------- 19. eucalyptus bark: cream/grey-white with peeling pink/orange/grey patches ----------
  function gen_bark_gum(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const pf = fbmN(N, 9, 1, 3, R), pf2 = fbmN(N, 16, 1, 3, R);       // one cell down the tile: strips run along v
    const streak = vnoise(N, 110, 4, R), fine = vnoise(N, 240, 30, R), mot = fbmN(N, 3, 3, 3, R);
    const tA = quant(pf, 0.7), tB = quant(pf2, 0.8);
    each(N, (i) => {
      const k = (1 + (streak[i] - 0.5) * 0.08) * (1 + (fine[i] - 0.5) * 0.04);
      let r = 0.86 * k, g = 0.84 * k, b = 0.78 * k;
      const jit = (fine[i] - 0.5) * 0.05;                         // ragged edges, not ruler-straight
      const p1 = sstep(tA - 0.03, tA + 0.03, pf[i] + jit);        // pink peel, soft edge
      r = lerp(r, 0.8, p1 * 0.6); g = lerp(g, 0.7, p1 * 0.6); b = lerp(b, 0.66, p1 * 0.6);
      const p2 = sstep(tB - 0.03, tB + 0.03, pf2[i] + jit) * (1 - p1 * 0.5);  // orange peel
      r = lerp(r, 0.8, p2 * 0.5); g = lerp(g, 0.62, p2 * 0.5); b = lerp(b, 0.45, p2 * 0.5);
      const gy = sstep(0.8, 0.9, mot[i]) * 0.2;                   // grey weathered patches (faint)
      r = lerp(r, 0.6, gy); g = lerp(g, 0.6, gy); b = lerp(b, 0.58, gy);
      setC(C, i, r, g, b);
      const edge = 1 - sstep(0, 0.03, Math.abs(pf[i] - tA));      // curled peel edges
      Hh[i] = 0.5 + (fine[i] - 0.5) * 0.04 + 0.15 * edge + 0.05 * p1;
      RO[i] = lerp(0.62 + (streak[i] - 0.5) * 0.1, 0.85, Math.max(p1, p2));
    });
    S.bump = 3.5;
  }

  // ---------- 20. eucalyptus leaves (alpha): narrow drooping leaves in hanging clusters ----------
  function gen_leaves_gum(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const A = S.a = new Float32Array(N * N);
    const wfit = Math.sqrt(512 / N);                      // keep leaves legible at 256
    for (let i = 0; i < N * N; i++) { setC(C, i, 0.5, 0.58, 0.4); Hh[i] = 0.5; RO[i] = 0.5; }
    let cnt = 0;
    const target = 0.45 * N * N;
    for (let c = 0; c < 4000 && cnt < target; c++) {
      const cu = R(), cw = R(), nl = 5 + ((R() * 6) | 0);
      for (let k = 0; k < nl; k++) {
        const ax = cu + (R() - 0.5) * 0.025, aw = cw + (R() - 0.5) * 0.02;
        const ang = PI / 2 + (R() - 0.5) * 1.8;               // mostly hanging (+w is down)
        const L = 0.045 + R() * 0.04, hw = L * 0.055 * wfit, droop = 0.5 + R() * 0.6;
        const tt = R();
        let cr = lerp(0.435, 0.561, tt), cg = lerp(0.561, 0.651, tt), cb = lerp(0.353, 0.416, tt);
        if (R() < 0.12) { cr = 0.64; cg = 0.64; cb = 0.37; }  // a few yellowish leaves
        const sh = 0.88 + R() * 0.24;
        const dx = Math.cos(ang), dy = Math.sin(ang), NS = 9;
        for (let s = 0; s <= NS; s++) {
          const f = s / NS;
          const px = ax + dx * L * f, pw = aw + dy * L * f + droop * L * f * f;
          const wr = hw * (0.25 + 0.75 * Math.sin(PI * Math.min(1, f * 0.85 + 0.15))) * (1 - 0.35 * f);
          stamp(N, px, pw, wr, (i, t) => {
            if (!A[i]) { A[i] = 1; cnt++; }
            const m = sh * (t < 0.3 ? 1.1 : 1) * (1 - 0.22 * t * t);
            setC(C, i, cr * m, cg * m, cb * m);
            Hh[i] = 0.55 + 0.1 * (1 - t * t);
            RO[i] = 0.5;
          });
        }
      }
    }
    const soft = softMask(N, A);
    for (let i = 0; i < N * N; i++) A[i] = soft[i];
    floorAlpha(A);
    S.bump = 2;
  }

  // ---------- 21. orchard leaves (alpha): dense round leaves, red fruit dots ----------
  function gen_leaves_round(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const A = S.a = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { setC(C, i, 0.42, 0.66, 0.26); Hh[i] = 0.5; RO[i] = 0.6; }
    let cnt = 0;
    const target = 0.65 * N * N;
    const deep = [0.3, 0.56, 0.2], mid = [0.42, 0.68, 0.26], light = [0.58, 0.8, 0.34];
    for (let c = 0; c < 3000 && cnt < target; c++) {
      const cu = R(), cw = R(), a = 0.03 + R() * 0.02, b = a * (0.7 + R() * 0.25), phi = R() * PI;
      const tone = R();
      const from = tone < 0.5 ? deep : mid, to = tone < 0.5 ? mid : light, f = tone < 0.5 ? tone * 2 : (tone - 0.5) * 2;
      const pr = lerp(from[0], to[0], f), pg = lerp(from[1], to[1], f), pb = lerp(from[2], to[2], f);
      const sh = 0.9 + R() * 0.2;
      ellipse(N, cu, cw, a, b, phi, (i, t, X, Y) => {
        if (!A[i]) { A[i] = 1; cnt++; }
        const vein = sstep(0.0025, 0.0, Math.abs(Y) * b);
        const m = sh * (1 - 0.22 * t * t) * (1 - 0.12 * vein);
        setC(C, i, pr * m, pg * m, pb * m);
        Hh[i] = 0.5 + 0.2 * (1 - t * t);
        RO[i] = 0.55;
      });
    }
    for (let k = 0; k < 10; k++) {                        // fruit
      const red = R() < 0.5;
      const rf = 0.0085 + R() * 0.003;
      stamp(N, R(), R(), rf, (i, t) => {
        A[i] = 1;
        const m = (1 - 0.35 * t * t) * (1 + 0.15 * (1 - t));
        if (red) setC(C, i, 0.85 * m, 0.3 * m, 0.15 * m); else setC(C, i, 0.92 * m, 0.55 * m, 0.2 * m);
        Hh[i] = 0.6 + 0.2 * (1 - t * t);
        RO[i] = 0.4;
      });
    }
    const soft = softMask(N, A);
    for (let i = 0; i < N * N; i++) A[i] = soft[i];
    floorAlpha(A);
    S.bump = 2;
  }

  // ---------- 22. grapevine (alpha): lobed leaves, purple grape bunches ----------
  function gen_vine(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const A = S.a = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { setC(C, i, 0.37, 0.6, 0.23); Hh[i] = 0.5; RO[i] = 0.6; }
    // 5-lobe outline as a function of angle, tabulated once (1024 steps per turn) to keep the pixel loop cheap.
    const LOBE_N = 1024, LOBE = new Float32Array(LOBE_N);
    for (let k = 0; k < LOBE_N; k++) LOBE[k] = 0.64 + 0.36 * Math.pow(Math.abs(Math.cos(2.5 * (k + 0.5) / LOBE_N * TAU)), 0.7);
    const lobe = (th) => LOBE[((th / TAU - Math.floor(th / TAU)) * LOBE_N) | 0];
    const TIP = TAU / 5;
    let cnt = 0;
    const target = 0.75 * N * N;
    for (let c = 0; c < 5000 && cnt < target; c++) {
      const cu = R(), cw = R(), Rl = 0.045 + R() * 0.03, phi = R() * TAU, tone = 0.85 + R() * 0.3, lt = R();
      const rr = Math.ceil(Rl * N) + 2, Rl2 = Rl * Rl;
      const x0 = Math.floor(cu * N), y0 = Math.floor(cw * N);
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        let ex = (x0 + dx + 0.5) / N - cu, ey = (y0 + dy + 0.5) / N - cw;
        ex -= Math.round(ex); ey -= Math.round(ey);
        const r2 = ex * ex + ey * ey;
        if (r2 > Rl2) continue;
        const r = Math.sqrt(r2);
        const th = Math.atan2(ey, ex) - phi;
        const lim = Rl * lobe(th);
        if (r > lim) continue;
        const idx = wrapI(y0 + dy, N) * N + wrapI(x0 + dx, N);
        if (!A[idx]) { A[idx] = 1; cnt++; }
        const dth = Math.abs(th - Math.round(th / TIP) * TIP);
        const vein = sstep(0.0018, 0.0, r * dth);
        const edge = r / lim;
        const m = tone * (1 - 0.14 * sstep(0.8, 1.0, edge)) * (1 - 0.14 * vein);
        const hi = 0.5 * lt * 0.3;
        setC(C, idx, lerp(0.37, 0.5, hi) * m, lerp(0.6, 0.72, hi) * m, lerp(0.23, 0.3, hi) * m);
        Hh[idx] = 0.55 + 0.1 * (1 - edge * edge);
        RO[idx] = 0.5;
      }
    }
    for (let k = 0; k < 5; k++) {                            // grape bunches, tapering
      const cu = R(), cw = R(), ng = 12 + ((R() * 5) | 0);
      stamp(N, cu, cw - 0.006, 0.9 / N, (i) => { setC(C, i, 0.35, 0.5, 0.2); A[i] = 1; });   // stalk
      for (let g = 0; g < ng; g++) {
        const fh = R() * 0.042, gu = cu + (R() - 0.5) * 0.034 * (1.15 - fh / 0.042 * 0.7), gw = cw + fh;
        const gr = 0.0068 + R() * 0.0025, sh = 0.9 + R() * 0.2;
        stamp(N, gu, gw, gr, (i, t) => {
          A[i] = 1;
          const m = sh * (1 - 0.3 * t * t);
          setC(C, i, 0.46 * m + 0.06 * (1 - t), 0.2 * m + 0.04 * (1 - t), 0.56 * m + 0.06 * (1 - t));
          Hh[i] = 0.6 + 0.2 * (1 - t * t);
          RO[i] = 0.35;
        });
      }
    }
    const soft = softMask(N, A);
    for (let i = 0; i < N * N; i++) A[i] = soft[i];
    floorAlpha(A);
    S.bump = 2;
  }

  // ---------- 23. galvanised chain-link (alpha): 25 diamonds across the tile ----------
  function gen_chainlink(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, K = 25;
    const A = S.a = new Float32Array(N * N);
    const wpx = 1.2 * Math.sqrt(512 / N);                     // wire width in px
    const gal = fbmN(N, 6, 6, 3, R), fine = vnoise(N, 220, 220, R);
    each(N, (i, u, w) => {
      const s = u + w, d = u - w;
      // perpendicular distance (px) to the nearest wire of each diagonal family
      const ps = Math.abs(s * K - Math.round(s * K)) / (K * Math.SQRT2) * N;
      const pd = Math.abs(d * K - Math.round(d * K)) / (K * Math.SQRT2) * N;
      const cs = clamp01(wpx / 2 + 0.5 - ps), cd = clamp01(wpx / 2 + 0.5 - pd);
      const cov = Math.max(cs, cd);
      const near = Math.min(ps, pd);
      const sh = 1 + 0.12 * clamp01(1 - 2 * near / wpx) - 0.06;
      const k = (0.9 + 0.2 * (gal[i] - 0.5) * 2) * (0.95 + 0.1 * (fine[i] - 0.5) * 2) * sh * 0.95;
      setC(C, i, 0.7 * k, 0.72 * k, 0.74 * k);
      A[i] = cov;
      Hh[i] = 0.5 + 0.3 * clamp01(1 - 2 * near / wpx) * cov;
      RO[i] = 0.35 + (gal[i] - 0.5) * 0.1;
    });
    floorAlpha(A);
    S.bump = 2;
  }

  // ---------- 24. white sports net (alpha): 20 square holes (0.1 m) per tile ----------
  function gen_net_white(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, n = 20;
    const A = S.a = new Float32Array(N * N);
    const wpx = 2.2 * Math.sqrt(512 / N);
    const mot = fbmN(N, 4, 4, 2, R), fine = vnoise(N, 220, 220, R);
    each(N, (i, u, w) => {
      const pu = Math.abs(u * n - Math.round(u * n)) / n * N, pw = Math.abs(w * n - Math.round(w * n)) / n * N;
      const cu = clamp01(wpx / 2 + 0.5 - pu), cw = clamp01(wpx / 2 + 0.5 - pw);
      const cov = Math.max(cu, cw);
      const near = Math.min(pu, pw);
      const sh = 0.94 + 0.06 * clamp01(1 - 2 * near / wpx);
      const k = sh * (0.97 + 0.03 * (mot[i] - 0.5) * 2) * (0.98 + 0.02 * (fine[i] - 0.5) * 2);
      setC(C, i, 0.93 * k, 0.94 * k, 0.93 * k);
      A[i] = cov;
      Hh[i] = 0.5 + 0.2 * clamp01(1 - 2 * near / wpx) * cov;
      RO[i] = 0.6;
    });
    floorAlpha(A);
    S.bump = 1.5;
  }

  // ---------- 25. soil: clods, stones, a few dry leaves ----------
  function gen_soil(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const d = worley(N, 36, R), mot = fbmN(N, 5, 5, 3, R), fine = vnoise(N, 240, 240, R), dark = fbmN(N, 10, 10, 3, R);
    each(N, (i) => {
      const dome = clamp01(1 - d[i] / 0.62);
      const k = (0.78 + 0.44 * mot[i]) * (0.92 + 0.16 * fine[i]) * (0.88 + 0.24 * dark[i]) * (0.86 + 0.28 * dome);
      setC(C, i, 0.36 * k, 0.26 * k, 0.17 * k);
      Hh[i] = 0.3 + 0.5 * Math.sqrt(dome) + (fine[i] - 0.5) * 0.05;
      RO[i] = 0.95;
    });
    for (let k = 0; k < 150; k++) {                           // small stones
      const rs = 0.0035 + R() * 0.0055, g = 0.4 + R() * 0.16;
      stamp(N, R(), R(), rs, (i, t) => {
        const dome = Math.sqrt(Math.max(0, 1 - t * t));
        setC(C, i, g * (1 - 0.2 * t) * 1.02, g * (1 - 0.2 * t), g * 0.94 * (1 - 0.2 * t));
        Hh[i] = 0.45 + 0.5 * dome;
        RO[i] = 0.7;
      });
    }
    for (let k = 0; k < 16; k++) {                            // dry leaves
      const lc = [0.56 + R() * 0.06, 0.42 + R() * 0.05, 0.22];
      ellipse(N, R(), R(), 0.012 + R() * 0.006, 0.004 + R() * 0.002, R() * PI, (i, t, X, Y) => {
        const vein = sstep(0.02, 0.0, Math.abs(Y));
        const m = (1 - 0.25 * t * t) * (1 - 0.2 * vein);
        setC(C, i, lc[0] * m, lc[1] * m, lc[2] * m);
        Hh[i] = 0.42 + 0.06 * (1 - t * t);
        RO[i] = 0.8;
      });
    }
    S.bump = 4;
  }

  // ---------- 26. gravel: Voronoi stones, 50 per tile ----------
  function gen_gravel(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r, K = 50;
    const fx = new Float32Array(K * K), fy = new Float32Array(K * K), rad = new Float32Array(K * K), tone = new Float32Array(K * K);
    for (let k = 0; k < K * K; k++) {
      fx[k] = R(); fy[k] = R();
      rad[k] = 0.6 + R() * 0.3;
      tone[k] = 0.82 + R() * 0.3;
    }
    const fine = vnoise(N, 300, 300, R), mot = fbmN(N, 4, 4, 3, R);
    each(N, (i, u, w) => {
      const su = u * K, sw = w * K, cu = Math.floor(su), cw = Math.floor(sw);
      let best = 9, bk = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ci = cu + di, cj = cw + dj, k = wrapI(cj, K) * K + wrapI(ci, K);
        const dx = ci + fx[k] - su, dy = cj + fy[k] - sw, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bk = k; }
      }
      const dn = Math.sqrt(best) / rad[bk];                  // 0 at stone centre, 1 at its edge
      if (dn >= 1) { setC(C, i, 0.26, 0.26, 0.25); Hh[i] = 0.12; RO[i] = 0.9; return; }
      const dome = Math.sqrt(1 - dn * dn);
      const v = 0.8 * tone[bk] * (1 - 0.25 * dn * dn) * (1 + (mot[i] - 0.5) * 0.06) * (1 + (fine[i] - 0.5) * 0.06);
      setC(C, i, v, v * 0.98, v * 0.95);
      Hh[i] = 0.2 + 0.7 * dome;
      RO[i] = 0.75 + (fine[i] - 0.5) * 0.1;
    });
    S.bump = 5;
  }

  // ---------- 27. car paint: near-white, very subtle ----------
  function gen_car_paint(S, R) {
    const N = S.N, C = S.c, Hh = S.h, RO = S.r;
    const fine = vnoise(N, 400, 400, R), peel = vnoise(N, 180, 180, R), mot = fbmN(N, 3, 3, 3, R);
    each(N, (i) => {
      const k = (1 + (mot[i] - 0.5) * 0.01) * (1 + (fine[i] - 0.5) * 0.01);
      setC(C, i, 0.955 * k, 0.955 * k, 0.96 * k);
      Hh[i] = 0.5 + (peel[i] - 0.5) * 0.06;
      RO[i] = 0.28 + (fine[i] - 0.5) * 0.03 + (mot[i] - 0.5) * 0.02;
    });
    S.bump = 1.2;
  }

  // ---------- registration ----------
  const GENS = {
    grass: gen_grass,
    paving: gen_paving,
    asphalt: gen_asphalt,
    court_blue: gen_court_blue,
    court_green: gen_court_green,
    court_grey: gen_court_grey,
    brick_tan: gen_brick_tan,
    brick_dark: gen_brick_dark,
    render_cream: gen_render_cream,
    cladding_white: gen_cladding_white,
    cladding_bluegrey: gen_cladding_bluegrey,
    panel_green: gen_panel_green,
    roof_membrane: gen_roof_membrane,
    roof_metal: gen_roof_metal,
    carpet_grey: gen_carpet_grey,
    lino: gen_lino,
    timber_floor: gen_timber_floor,
    timber: gen_timber,
    bark_gum: gen_bark_gum,
    leaves_gum: gen_leaves_gum,
    leaves_round: gen_leaves_round,
    vine: gen_vine,
    chainlink: gen_chainlink,
    net_white: gen_net_white,
    soil: gen_soil,
    gravel: gen_gravel,
    car_paint: gen_car_paint,
  };
  for (const name in GENS) JB.Tex.register(name, GENS[name]);
})();
