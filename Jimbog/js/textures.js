/*
 * Jimbog procedural textures. Everything is drawn at runtime to 2D canvases (no image files).
 *
 *   JB.Tex.list                    array of supported names
 *   JB.Tex.make(name, size = 512)  -> { map, normalMap, roughnessMap }  (THREE.CanvasTexture, cached)
 *
 * One tile = 2m x 2m of world space. All features wrap at the tile edge, so tiles join seamlessly.
 * map: sRGB colour (alpha used by grate). normalMap: tangent space, from a Sobel of a height field.
 * roughnessMap: greyscale. Fur maps: canvas row fraction is v (top of body = 0, bottom = 1).
 */
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};
  const TAU = Math.PI * 2;

  // ---------- seeded random ----------
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  // mulberry32: small seeded PRNG returning floats in [0, 1)
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- small math helpers ----------
  const wrapI = (i, n) => ((i % n) + n) % n;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  // smoothstep; also works with a > b (falling edge)
  function sstep(a, b, x) {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  // ---------- periodic noise ----------
  // Value noise on a cx x cy lattice that wraps at the tile edge. Adds amp * noise into out.
  // Lattice rows are interpolated along x once, then blended along y (fewer loads per pixel).
  function vnoise(N, cx, cy, R, out, amp) {
    const L = new Float32Array(cx * cy);
    for (let i = 0; i < L.length; i++) L[i] = R();
    if (!out) out = new Float32Array(N * N);
    amp = amp === undefined ? 1 : amp;
    const xa = new Int32Array(N), xb = new Int32Array(N), xw = new Float32Array(N);
    const ya = new Int32Array(N), yb = new Int32Array(N), yw = new Float32Array(N);
    for (let x = 0; x < N; x++) {
      const g = (x + 0.5) / N * cx, i = Math.floor(g), f = g - i;
      xa[x] = wrapI(i, cx); xb[x] = wrapI(i + 1, cx); xw[x] = f * f * (3 - 2 * f);
    }
    for (let y = 0; y < N; y++) {
      const g = (y + 0.5) / N * cy, i = Math.floor(g), f = g - i;
      ya[y] = wrapI(i, cy) * N; yb[y] = wrapI(i + 1, cy) * N; yw[y] = f * f * (3 - 2 * f);
    }
    const rows = new Float32Array(cy * N);
    for (let j = 0; j < cy; j++) {
      const base = j * cx, o = j * N;
      for (let x = 0; x < N; x++) {
        const v = L[base + xa[x]];
        rows[o + x] = v + (L[base + xb[x]] - v) * xw[x];
      }
    }
    for (let y = 0; y < N; y++) {
      const p = ya[y], q = yb[y], wy = yw[y], o = y * N;
      for (let x = 0; x < N; x++) {
        const v = rows[p + x];
        out[o + x] += (v + (rows[q + x] - v) * wy) * amp;
      }
    }
    return out;
  }

  // Fractal sum of value noise (octaves double the lattice each time).
  function fbm(N, cx, cy, oct, R, gain) {
    const out = new Float32Array(N * N);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      vnoise(N, cx << o, cy << o, R, out, amp);
      tot += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }

  // fbm stretched to the full 0..1 range (consistent contrast).
  function fbmN(N, cx, cy, oct, R, gain) {
    const f = fbm(N, cx, cy, oct, R, gain === undefined ? 0.5 : gain);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
    const s = 1 / (hi - lo || 1);
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
    return f;
  }

  // Periodic cellular noise: distance to the nearest feature point, in cell units.
  function worley(N, cells, R) {
    const wt = new Int32Array(cells + 2);
    for (let q = -1; q <= cells; q++) wt[q + 1] = wrapI(q, cells);
    const ox = new Float32Array(cells * cells), oy = new Float32Array(cells * cells);
    for (let k = 0; k < cells * cells; k++) { ox[k] = R(); oy[k] = R(); }
    const out = new Float32Array(N * N), s = cells / N;
    for (let y = 0; y < N; y++) {
      const fy = (y + 0.5) * s, cy = Math.floor(fy);
      for (let x = 0; x < N; x++) {
        const fx = (x + 0.5) * s, cx = Math.floor(fx);
        let best = 1e9;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = cx + di, jj = cy + dj;
          const k = wt[jj + 1] * cells + wt[ii + 1];
          const dx = ii + ox[k] - fx, dy = jj + oy[k] - fy;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
        out[y * N + x] = Math.sqrt(best);
      }
    }
    return out;
  }

  // ---------- drawing helpers (all wrap at the tile edge) ----------
  // Surface buffers: c = sRGB colour (3 per px), h = height, r = roughness, a = alpha (optional).
  function Surf(N) {
    return {
      N: N, bump: 2, a: null,
      c: new Float32Array(N * N * 3),
      h: new Float32Array(N * N).fill(0.5),
      r: new Float32Array(N * N).fill(0.6),
    };
  }
  // Calls fn(pixelIndex, t) for every pixel within rad (UV units) of (cu, cw); t = 0 centre .. 1 edge.
  function stamp(N, cu, cw, rad, fn) {
    const cx = cu * N, cy = cw * N, rr = rad * N, rr2 = rr * rr;
    const x0 = Math.floor(cx - rr) - 1, x1 = Math.ceil(cx + rr) + 1;
    const y0 = Math.floor(cy - rr) - 1, y1 = Math.ceil(cy + rr) + 1;
    for (let y = y0; y <= y1; y++) {
      const row = wrapI(y, N) * N, dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
        if (d2 <= rr2) fn(row + wrapI(x, N), Math.sqrt(d2) / rr);
      }
    }
  }
  // Random walk of stamps (cracks, scratches, tyre marks). a0 = start angle (random if omitted).
  function walk(N, R, u, w, steps, step, rad, bend, a0, fn) {
    let a = a0 === undefined ? R() * TAU : a0;
    for (let s = 0; s < steps; s++) {
      a += (R() - 0.5) * bend;
      u += Math.cos(a) * step; w += Math.sin(a) * step;
      stamp(N, u, w, rad, fn);
    }
  }
  function shadeC(C, i, k) { C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k; }
  function tintC(C, i, r, g, b, t) {
    C[i * 3] = lerp(C[i * 3], r, t); C[i * 3 + 1] = lerp(C[i * 3 + 1], g, t); C[i * 3 + 2] = lerp(C[i * 3 + 2], b, t);
  }

  // ---------- output: canvases from buffers ----------
  function makeCanvas(N, fill) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N);
    fill(img.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  function finish(S) {
    const N = S.N, n = N * N, C = S.c, H = S.h, RO = S.r, A = S.a, K = S.bump;
    const map = makeCanvas(N, (d) => {
      for (let i = 0; i < n; i++) {
        d[i * 4] = C[i * 3] * 255; d[i * 4 + 1] = C[i * 3 + 1] * 255; d[i * 4 + 2] = C[i * 3 + 2] * 255;
        d[i * 4 + 3] = A ? A[i] * 255 : 255;
      }
    });
    // Normal map: Sobel (3x3, wrapped) of the height field. OpenGL convention: +v (canvas up) is green+.
    const normal = makeCanvas(N, (d) => {
      const prev = new Int32Array(N), next = new Int32Array(N);
      for (let j = 0; j < N; j++) { prev[j] = wrapI(j - 1, N); next[j] = wrapI(j + 1, N); }
      for (let y = 0; y < N; y++) {
        const r0 = prev[y] * N, r1 = y * N, r2 = next[y] * N;
        for (let x = 0; x < N; x++) {
          const xl = prev[x], xr = next[x];
          const gx = (H[r0 + xr] + 2 * H[r1 + xr] + H[r2 + xr] - H[r0 + xl] - 2 * H[r1 + xl] - H[r2 + xl]) / 8;
          const gy = (H[r2 + xl] + 2 * H[r2 + x] + H[r2 + xr] - H[r0 + xl] - 2 * H[r0 + x] - H[r0 + xr]) / 8;
          const nx = -gx * K, ny = gy * K, nz = 1;
          const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          const j = (y * N + x) * 4;
          d[j] = (nx * il * 0.5 + 0.5) * 255;
          d[j + 1] = (ny * il * 0.5 + 0.5) * 255;
          d[j + 2] = (nz * il * 0.5 + 0.5) * 255;
          d[j + 3] = 255;
        }
      }
    });
    const rough = makeCanvas(N, (d) => {
      for (let i = 0; i < n; i++) {
        const v = RO[i] * 255;
        d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
    });
    return { map: map, normal: normal, rough: rough };
  }

  // ---------- generators ----------
  // Each fills S.c / S.h / S.r (and optionally S.a, S.bump).

  // ===================== Facility materials: worn, muted, CS2-style =====================
  // Albedo stays between about 0.04 and 0.8 (sRGB). Hues are desaturated. Grime collects in
  // grout, seams and crevices. Paint, glaze and galvanising show chips where the base is lost.

  // Wrapped difference a - b in [-0.5, 0.5]: periodic distance on the tile.
  const wd = (a, b) => { const d = a - b; return d - Math.round(d); };
  // Rectangle mask (1 inside, 0 outside) with ragged edges. cu/cw centre, hw/hh half sizes, rag = edge offset.
  function rectMask(u, w, cu, cw, hw, hh, rag) {
    const d = Math.max(Math.abs(wd(u, cu)) / hw, Math.abs(wd(w, cw)) / hh) + rag;
    return 1 - sstep(0.9, 1.0, d);
  }
  // Calls fn(pixelIndex, u, w) for the pixels in a wrapped box of half sizes ex, ey around (cu, cw).
  // Use ex = 1.4 * hw and ey = 1.4 * hh with rectMask: outside that box the mask is always 0.
  function boxPx(N, cu, cw, ex, ey, fn) {
    const x0 = Math.floor((cu - ex) * N), x1 = Math.ceil((cu + ex) * N);
    const y0 = Math.floor((cw - ey) * N), y1 = Math.ceil((cw + ey) * N);
    for (let y = y0; y <= y1; y++) {
      const row = wrapI(y, N) * N, w = (y + 0.5) / N;
      for (let x = x0; x <= x1; x++) fn(row + wrapI(x, N), (x + 0.5) / N, w);
    }
  }

  // Concrete floor: saw-cut joints on the 2m grid, cement patches, oil stains, a faded painted line, hairline cracks.
  function gen_concrete_floor(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const big = fbmN(N, 3, 3, 3, R), med = fbmN(N, 10, 10, 3, R), mot = fbmN(N, 40, 40, 2, R), agg = vnoise(N, 180, 180, R);
    const patch = new Float32Array(N * N), edge = new Float32Array(N * N);
    for (let k = 0; k < 4; k++) {
      const cu = R(), cw = R(), hw = 0.05 + R() * 0.08, hh = 0.04 + R() * 0.06;
      boxPx(N, cu, cw, hw * 1.4, hh * 1.4, (i, u, w) => {
        const m = rectMask(u, w, cu, cw, hw, hh, (med[i] - 0.5) * 0.6 + (agg[i] - 0.5) * 0.12);
        if (m > patch[i]) patch[i] = m;
      });
    }
    for (let i = 0; i < N * N; i++) edge[i] = 4 * patch[i] * (1 - patch[i]);
    const gw = 1.2 / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const sp = sstep(0.8, 0.93, agg[i]), dk = sstep(0.2, 0.06, agg[i]), pm = patch[i];
      const l = 1 + (big[i] - 0.5) * 0.14 + (med[i] - 0.5) * 0.07 + (mot[i] - 0.5) * 0.04 + sp * 0.05 - dk * 0.1 - pm * 0.03;
      C[i * 3] = lerp(0.47, 0.51, pm) * l; C[i * 3 + 1] = lerp(0.465, 0.505, pm) * l; C[i * 3 + 2] = lerp(0.45, 0.49, pm) * l;
      H[i] = 0.5 + (med[i] - 0.5) * 0.05 + sp * 0.08 - dk * 0.12 - 0.12 * edge[i];
      RO[i] = 0.86 + (big[i] - 0.5) * 0.12 + dk * 0.05 - 0.04 * pm;
      // saw-cut joint on the tile edge: darker, dirtier
      const d = Math.min(u, 1 - u, w, 1 - w), g = 1 - sstep(gw * 0.5, gw * 2.5, d);
      if (g > 0) { shadeC(C, i, 1 - 0.3 * g); H[i] -= 0.3 * g; RO[i] += 0.1 * g; }
      // faded painted walkway line: dashes along u, centred on w = 0.5
      const lm = sstep(0.08, 0.1, u) * sstep(0.5, 0.48, u) * (1 - sstep(0.035, 0.045, Math.abs(wd(w, 0.5)))) * sstep(0.35, 0.6, med[i]) * 0.5;
      if (lm > 0) { tintC(C, i, 0.58, 0.53, 0.3, lm * 0.6); RO[i] -= 0.05 * lm; }
    }
    for (let k = 0; k < 5; k++) {   // oil and dirt stains: soft, ragged, slightly glossy
      stamp(N, R(), R(), 0.035 + R() * 0.07, (i, t) => {
        const f = (1 - t) * (1 - t) * sstep(0.3, 0.7, med[i]) * 0.8;
        tintC(C, i, 0.3, 0.28, 0.25, f * 0.35); RO[i] -= 0.15 * f;
      });
    }
    for (let k = 0; k < 2; k++) {   // hairline cracks
      walk(N, R, R(), R(), 40, 0.0035, 1.0 / N, 0.8, undefined, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.35 * f); H[i] -= 0.2 * f; RO[i] += 0.2 * f;
      });
    }
    S.bump = 7;
  }

  // Poured concrete and plaster: formwork seams and tie holes, bugholes, water streaks, dirt low down, a few patches.
  function gen_concrete_wall(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const big = fbmN(N, 3, 3, 3, R), mid = fbmN(N, 12, 12, 2, R), fine = vnoise(N, 200, 200, R), pit = worley(N, 40, R), streak = vnoise(N, 70, 4, R);
    const lt = new Float32Array(N * N), dk = new Float32Array(N * N);
    for (let k = 0; k < 4; k++) {
      const cu = R(), cw = R(), hw = 0.1 + R() * 0.1, hh = 0.1 + R() * 0.12, tgt = k & 1 ? dk : lt;
      boxPx(N, cu, cw, hw * 1.4, hh * 1.4, (i, u, w) => {
        const m = rectMask(u, w, cu, cw, hw, hh, (mid[i] - 0.5) * 0.4);
        if (m > tgt[i]) tgt[i] = m;
      });
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const pitD = sstep(0.15, 0.07, pit[i]);   // bugholes: small and sparse, so they do not read as dots at mid range
      // formwork: vertical seam on the tile edge, horizontal seams at w = 0 and 0.5
      const seam = 1 - sstep(0.0015, 0.0035, Math.min(Math.min(u, 1 - u), Math.min(Math.min(w, 1 - w), Math.abs(w - 0.5))));
      const ws = sstep(0.62, 0.9, streak[i]) * (0.4 + 0.8 * (big[i] - 0.5));   // water streaks
      const db = sstep(0.16, 0.0, Math.min(w, 1 - w)) * (0.5 + 0.8 * (mid[i] - 0.5));   // dirt at the base
      const l = (1 + (big[i] - 0.5) * 0.14 + (mid[i] - 0.5) * 0.06 + (fine[i] - 0.5) * 0.035 - pitD * 0.2 - seam * 0.06)
        * (1 + 0.05 * lt[i] - 0.07 * dk[i]) * (1 - 0.12 * db) * (1 - 0.08 * seam);
      C[i * 3] = 0.6 * l; C[i * 3 + 1] = 0.578 * l; C[i * 3 + 2] = 0.535 * l;
      tintC(C, i, 0.42, 0.38, 0.33, ws * 0.18 * (1 - lt[i]));
      H[i] = 0.5 + (mid[i] - 0.5) * 0.06 + (fine[i] - 0.5) * 0.03 - pitD * 0.35 + 0.12 * seam - 0.04 * dk[i];
      RO[i] = 0.92 + (big[i] - 0.5) * 0.1 + pitD * 0.04 + ws * 0.04;
    }
    for (const cu of [0.25, 0.75]) for (const cw of [0.25, 0.75]) {   // form tie holes
      stamp(N, cu, cw, 0.009, (i, t) => {
        if (t < 0.5) { shadeC(C, i, 0.6); H[i] = Math.min(H[i], 0.25); }
        else { shadeC(C, i, 0.9 + 0.1 * t); H[i] = Math.min(H[i], 0.4 + 0.12 * (t - 0.5) * 2); }
      });
    }
    for (let k = 0; k < 2; k++) {   // hairline cracks
      walk(N, R, R(), R(), 30, 0.004, 1.0 / N, 0.9, undefined, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.3 * f); H[i] -= 0.15 * f; RO[i] += 0.1 * f;
      });
    }
    S.bump = 4;
  }

  // Painted steel cladding: 1 m panels with seams and rivet rows, paint batches, chips to primer, rust bleeding from seams.
  function gen_metal_panel(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), wave = fbmN(N, 2, 2, 2, R), brush = vnoise(N, 256, 3, R), grime = fbmN(N, 6, 6, 3, R);
    const chipF = fbmN(N, 16, 16, 3, R), chipD = vnoise(N, 130, 130, R);   // paint loss: small irregular patches, not dots
    const pt = [(R() - 0.5) * 0.06, (R() - 0.5) * 0.06];
    const rust = new Float32Array(N * N);
    for (let k = 0; k < 10; k++) {   // rust running down from a seam
      const cu = (k & 1 ? 0.5 : 0) + (R() - 0.5) * 0.004, cw = R(), len = 0.03 + R() * 0.18, bl = 0.6 + R() * 0.4;
      const steps = Math.ceil(len * N);
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        stamp(N, cu, cw + len * f, 0.003 + 0.004 * (1 - f), (i, t) => { rust[i] = Math.max(rust[i], (1 - t) * (1 - f) * bl); });
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N;
      const pan = u < 0.5 ? 0 : 1;
      const dS = Math.min(u, 1 - u, Math.abs(u - 0.5));
      const seam = 1 - sstep(0.0015, 0.0035, dS);
      // paint chips: more of them near the seams, where panels rub and dent
      const chip = sstep(0.72, 0.78, chipF[i] * 0.6 + chipD[i] * 0.4 + 0.08 * (1 - sstep(0.02, 0.1, dS))) * 0.85;
      const gd = 1 - 0.1 * sstep(0.5, 0.85, grime[i]);
      const k = (1 + pt[pan] + (mot[i] - 0.5) * 0.12 + (brush[i] - 0.5) * 0.05) * (1 - 0.25 * seam) * gd;
      const rm = sstep(0.25, 0.45, rust[i] * (0.7 + 0.6 * grime[i]));
      let r = 0.4 * k, g = 0.43 * k, b = 0.41 * k;
      r = lerp(r, 0.5, chip); g = lerp(g, 0.49, chip); b = lerp(b, 0.46, chip);   // grey primer
      r = lerp(r, 0.4, rm); g = lerp(g, 0.23, rm); b = lerp(b, 0.12, rm);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = 0.5 + (wave[i] - 0.5) * 0.04 + (brush[i] - 0.5) * 0.02 - 0.25 * seam - 0.05 * chip + 0.02 * rm;
      RO[i] = 0.6 + (brush[i] - 0.5) * 0.08 + (mot[i] - 0.5) * 0.1 + 0.25 * seam + 0.2 * chip + 0.2 * rm;
    }
    for (let k = 0; k < 6; k++) {   // scratches down to bright metal
      walk(N, R, R(), R(), 30 + ((R() * 30) | 0), 0.003, 0.9 / N, 0.3, Math.PI / 2 + (R() - 0.5) * 0.5, (i, t) => {
        const f = (1 - t) * 0.5; tintC(C, i, 0.55, 0.56, 0.56, f); RO[i] -= 0.15 * f;
      });
    }
    for (const s of [0, 0.5]) for (const o of [-0.018, 0.018]) for (let k = 0; k < 8; k++) {   // rivet rows either side of seams
      stamp(N, s + o, (k + 0.5) / 8, 0.009, (i, t) => {
        const dome = Math.sqrt(1 - t * t);
        H[i] = Math.max(H[i], 0.5 + 0.3 * dome);
        shadeC(C, i, 1.08 + 0.12 * dome);
        RO[i] = 0.4 + 0.1 * (1 - dome);
      });
    }
    S.bump = 6;
  }

  // Worn steel tread plate: lozenges (20 per tile) with polished tops, dirty gaps, foot traffic and dust.
  function gen_diamond_plate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, K = 20;
    const grime = fbmN(N, 8, 8, 3, R), wear = fbmN(N, 5, 5, 3, R), fine = vnoise(N, 200, 200, R), dust = fbmN(N, 3, 3, 2, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const a = u * K, b = w * K;
      const d = Math.abs(a - Math.floor(a) - 0.5) + Math.abs(b - Math.floor(b) - 0.5);   // 0 centre .. 1 corner
      const top = sstep(0.5, 0.36, d);
      const dA = sstep(0.45, 0.75, grime[i] * 0.6 + dust[i] * 0.4) * 0.55;   // dirt layer
      const topC = (0.56 + 0.05 * wear[i]) * (1 - 0.12 * dA);   // polished, worn tops (mid grey, so treads do not read black)
      const gapC = (0.24 + 0.03 * grime[i]) * (1 - 0.2 * dA);
      let r = lerp(gapC, topC, top), g = lerp(gapC, topC * 0.99, top), b2 = lerp(gapC * 0.94, topC * 0.97, top);
      r = lerp(r, 0.3, dA * 0.6); g = lerp(g, 0.27, dA * 0.6); b2 = lerp(b2, 0.22, dA * 0.6);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b2;
      H[i] = 0.2 + 0.8 * top + (fine[i] - 0.5) * 0.02;
      RO[i] = lerp(0.85 + 0.1 * (grime[i] - 0.5), 0.36 + 0.2 * wear[i] + 0.08 * fine[i], top) + 0.08 * dA;
    }
    for (let k = 0; k < 10; k++) {   // scuffs
      walk(N, R, R(), R(), 12 + ((R() * 20) | 0), 0.004, 0.9 / N, 1.2, undefined, (i, t) => {
        shadeC(C, i, 1 + 0.1 * (1 - t)); RO[i] -= 0.05 * (1 - t);
      });
    }
    S.bump = 5;
  }

  // Yellow and black hazard stripes (5 pairs per tile), sun-faded and chipped down to bare steel.
  function gen_hazard(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const chipA = fbmN(N, 14, 14, 3, R), chipB = vnoise(N, 96, 96, R), metal = fbmN(N, 6, 6, 3, R), grime = fbmN(N, 5, 5, 3, R), fade = fbmN(N, 8, 8, 3, R);
    const chip = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const yel = sstep(-0.1, 0.1, Math.sin(TAU * 5 * (u + w)));   // 1 = yellow band
      const ch = sstep(0.7, 0.77, chipA[i] * 0.7 + chipB[i] * 0.3);
      chip[i] = ch;
      const fd = 0.2 + 0.4 * fade[i], gg = 0.9 + 0.2 * grime[i];
      const yR = lerp(0.62, 0.56, fd), yG = lerp(0.52, 0.5, fd), yB = lerp(0.2, 0.34, fd);
      const bR = lerp(0.09, 0.22, fd), bG = lerp(0.09, 0.21, fd), bB = lerp(0.085, 0.2, fd);
      const pr = lerp(bR, yR, yel) * gg, pg = lerp(bG, yG, yel) * gg, pb = lerp(bB, yB, yel) * gg;
      const mt = 0.42 * (0.85 + 0.3 * metal[i]);
      C[i * 3] = lerp(pr, mt, ch); C[i * 3 + 1] = lerp(pg, mt, ch); C[i * 3 + 2] = lerp(pb, mt * 1.02, ch);
      H[i] = lerp(0.62, 0.36, ch) + (chipB[i] - 0.5) * 0.02;
      RO[i] = lerp(0.6 + 0.1 * (grime[i] - 0.5), 0.4 + 0.1 * metal[i], ch);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // dark rim on chip edges
      const gx = chip[y * N + wrapI(x + 1, N)] - chip[y * N + wrapI(x - 1, N)];
      const gy = chip[wrapI(y + 1, N) * N + x] - chip[wrapI(y - 1, N) * N + x];
      const e = Math.min(1, Math.abs(gx) + Math.abs(gy));
      if (e > 0) shadeC(C, y * N + x, 1 - 0.3 * e);
    }
    for (let k = 0; k < 9; k++) {   // boot scuffs
      walk(N, R, R(), R(), 14 + ((R() * 16) | 0), 0.004, 1.0 / N, 1.0, undefined, (i, t) => {
        const f = (1 - t) * 0.45;
        tintC(C, i, 0.4, 0.4, 0.4, f); RO[i] += 0.15 * (1 - t);
      });
    }
    S.bump = 4;
  }

  // Glazed white wall tile (13 per tile), dirty grout, grime streaks down from the top of each column,
  // chipped corners, a few missing tiles where the substrate shows, and a crack or two.
  function gen_tiles_wall(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, T = 13, GH = 0.0015;
    const tint = new Float32Array(T * T), warm = new Float32Array(T * T), miss = new Uint8Array(T * T), chipM = new Float32Array(N * N);
    for (let k = 0; k < T * T; k++) { tint[k] = (R() - 0.5) * 0.05; warm[k] = (R() - 0.5) * 0.02; }
    for (let k = 0; k < 4; k++) miss[(R() * T * T) | 0] = 1;
    const glz = fbmN(N, 3, 3, 3, R), gm = vnoise(N, 180, 180, R), grime = fbmN(N, 6, 6, 3, R), streak = vnoise(N, 52, 6, R);
    for (let k = 0; k < 14; k++) {   // chipped corners
      const ti = (R() * T) | 0, tj = (R() * T) | 0;
      const cu = (ti + (R() < 0.5 ? 0 : 1)) / T, cw = (tj + (R() < 0.5 ? 0 : 1)) / T;
      stamp(N, cu, cw, 0.006 + R() * 0.006, (i, t) => { chipM[i] = Math.max(chipM[i], 1 - sstep(0.6, 1, t)); });
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const tu = u * T, tw = w * T, ci = Math.floor(tu), cj = Math.floor(tw);
      const fx = tu - ci, fy = tw - cj;
      const e = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / T;
      const bi = cj * T + ci, ms = miss[bi];
      const face = ms ? 0 : sstep(GH, GH * 4, e);
      const sk = sstep(0.55, 0.8, streak[i]);
      // glaze is kept below 0.8 (no pure white): the face sits near 0.7, dirt and streaks pull it down
      const gr = (0.84 + 0.24 * gm[i]) * (1 - 0.16 * sk) * (1 - 0.14 * sstep(0.55, 0.85, grime[i]));
      const g = 1 + tint[bi] + (glz[i] - 0.5) * 0.03;
      const ch = chipM[i] * face;
      let r = lerp(0.5 * gr, (0.72 * g + warm[bi]) * gr, face);
      let gg = lerp(0.49 * gr, 0.72 * g * gr, face);
      let b = lerp(0.46 * gr, (0.7 * g - warm[bi]) * gr, face);
      r = lerp(r, 0.56, ch); gg = lerp(gg, 0.52, ch); b = lerp(b, 0.48, ch);
      if (ms) { const sb = 0.4 + 0.08 * glz[i]; r = sb * 1.04; gg = sb; b = sb * 0.94; }
      C[i * 3] = Math.min(r, 0.8); C[i * 3 + 1] = Math.min(gg, 0.8); C[i * 3 + 2] = Math.min(b, 0.8);
      H[i] = ms ? 0.2 + 0.03 * (gm[i] - 0.5) : 0.2 + 0.45 * Math.sqrt(face) + (glz[i] - 0.5) * 0.02 - 0.12 * ch;
      const roG = 0.18 + 0.08 * glz[i] + 0.3 * sstep(0.55, 0.85, grime[i]) + 0.2 * sk;
      RO[i] = ms ? 0.92 : lerp(0.9 + 0.08 * gm[i], roG, face);
      RO[i] = lerp(RO[i], 0.65, ch);
    }
    for (let k = 0; k < 2; k++) {   // cracked tiles
      const ti = (R() * T) | 0, tj = (R() * T) | 0;
      walk(N, R, (ti + 0.3 + 0.4 * R()) / T, (tj + 0.3 + 0.4 * R()) / T, 12, 0.0045, 1.0 / N, 1.0, undefined, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.4 * f); H[i] -= 0.08 * f; RO[i] = lerp(RO[i], 0.6, f);
      });
    }
    S.bump = 3.5;
  }

  // Charcoal floor tiles (20 per tile) with lighter grout that has picked up grime.
  function gen_tiles_floor(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, T = 20, GH = 0.002;
    const tint = new Float32Array(T * T);
    for (let k = 0; k < T * T; k++) tint[k] = (R() - 0.5) * 0.06;
    const spk = vnoise(N, 150, 150, R), grime = fbmN(N, 4, 4, 3, R), gm = vnoise(N, 200, 200, R), wear = fbmN(N, 6, 6, 3, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const tu = u * T, tw = w * T, ci = Math.floor(tu), cj = Math.floor(tw);
      const fx = tu - ci, fy = tw - cj;
      const e = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / T;
      const face = sstep(GH, GH * 4, e);
      const bi = cj * T + ci;
      const gy = 1 - 0.1 * sstep(0.55, 0.9, grime[i]);
      const tk = (1 + tint[bi]) * (1 + (spk[i] - 0.5) * 0.12) * gy * (0.93 + 0.12 * wear[i]);
      const gr = (0.38 + 0.06 * gm[i]) * (1 - 0.25 * sstep(0.55, 0.9, grime[i]));   // grout: grimy, low contrast with the tile
      C[i * 3] = lerp(gr, 0.24 * tk, face); C[i * 3 + 1] = lerp(gr * 0.99, 0.245 * tk, face); C[i * 3 + 2] = lerp(gr * 0.96, 0.25 * tk, face);
      H[i] = 0.2 + 0.35 * Math.sqrt(face);
      RO[i] = lerp(0.9, 0.42 + 0.1 * (spk[i] - 0.5) + 0.1 * wear[i], face);
    }
    S.bump = 4;
  }

  // Muted ochre floor paint, scuffed through to grey concrete in places, with dark tyre tracks and roller bands. No blue.
  function gen_epoxy_yellow(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 5, 5, 3, R), wearA = fbmN(N, 4, 4, 4, R), wearB = vnoise(N, 160, 160, R);
    const roll = vnoise(N, 2, 220, R), spot = vnoise(N, 200, 200, R), grime = fbmN(N, 6, 6, 3, R);
    const track = new Float32Array(N * N);
    const t0 = R();
    for (const off of [0, 0.3]) {
      for (let s = 0; s < 220; s++) {
        const ws = s / 220;
        stamp(N, t0 + off + 0.02 * Math.sin(TAU * ws), ws, 0.03, (i, t) => {
          track[i] = Math.max(track[i], (1 - t) * (0.6 + 0.4 * spot[i]));
        });
      }
    }
    for (let i = 0; i < N * N; i++) {
      const wear = sstep(0.66, 0.76, wearA[i] * 0.75 + wearB[i] * 0.25);
      const ry = 1 + (roll[i] - 0.5) * 0.04, my = 0.95 + 0.1 * (mot[i] - 0.5);
      const gd = 1 - 0.1 * sstep(0.55, 0.9, grime[i]);
      // muted ochre paint (saturation about 0.4), scuffed through to grey concrete in patches
      let r = 0.46 * my * ry * gd, g = 0.43 * my * ry * gd, b = 0.34 * my * ry * gd;   // greyer, so warm light does not turn it into wood
      const cc = 0.5 + 0.08 * spot[i];
      r = lerp(r, cc, wear * 0.7); g = lerp(g, cc * 0.98, wear * 0.7); b = lerp(b, cc * 0.93, wear * 0.7);
      const tk = track[i] * 0.5;
      r = lerp(r, 0.3, tk); g = lerp(g, 0.28, tk); b = lerp(b, 0.22, tk);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = lerp(0.6, 0.42 + 0.08 * spot[i], wear) + (roll[i] - 0.5) * 0.01 - 0.03 * track[i];
      RO[i] = lerp(0.5 + (mot[i] - 0.5) * 0.1, 0.9 + 0.05 * spot[i], wear) + 0.15 * track[i];
    }
    for (let k = 0; k < 6; k++) {   // scuffs
      walk(N, R, R(), R(), 10 + ((R() * 14) | 0), 0.004, 1.0 / N, 0.9, undefined, (i, t) => {
        const f = (1 - t) * 0.5; tintC(C, i, 0.6, 0.58, 0.5, f); RO[i] -= 0.1 * f;
      });
    }
    S.bump = 5;
  }

  // Teal machine paint, orange-peel, chipped to grey primer, rust blooms with downward streaks.
  function gen_painted_metal(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), peel = vnoise(N, 220, 220, R), chipA = fbmN(N, 30, 30, 2, R), rustN = fbmN(N, 40, 40, 3, R), grime = fbmN(N, 5, 5, 3, R);
    const rust = new Float32Array(N * N);
    for (let k = 0; k < 14; k++) {
      // rust bleeding from a fixing: a soft stain that runs down and fades (no hard round heads)
      const cu = R(), cw = R(), r0 = 0.03 + R() * 0.03, len = 0.04 + R() * 0.1, bloom = 0.55 + R() * 0.35;
      stamp(N, cu, cw, r0 * 1.2, (i, t) => { rust[i] = Math.max(rust[i], (1 - t * t) * 0.6 * bloom); });
      const steps = Math.ceil(len * N);
      for (let s = 0; s <= steps; s++) {   // runoff down the panel (increasing canvas y)
        const f = s / steps;
        stamp(N, cu, cw + len * f, r0 * (0.4 + 0.6 * (1 - f)), (i, t) => {
          rust[i] = Math.max(rust[i], (1 - t) * (1 - f) * (1 - f) * 0.7 * bloom);
        });
      }
    }
    for (let i = 0; i < N * N; i++) {
      const rv = rust[i] * (0.4 + 1.0 * rustN[i]);   // broken up by noise so the stains are mottled
      const rm = sstep(0.3, 0.55, rv);
      const chip = sstep(0.78, 0.84, chipA[i] * 0.6 + peel[i] * 0.4);
      const pm = (1 + (mot[i] - 0.5) * 0.08 + (peel[i] - 0.5) * 0.04) * (1 - 0.1 * sstep(0.6, 0.9, grime[i]));
      const rk = 0.8 + 0.4 * rustN[i];
      let r = lerp(0.28 * pm, 0.56, chip), g = lerp(0.44 * pm, 0.56, chip), b = lerp(0.43 * pm, 0.52, chip);
      r = lerp(r, 0.4 * rk, rm); g = lerp(g, 0.23 * rk, rm); b = lerp(b, 0.12 * rk, rm);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = 0.6 + (peel[i] - 0.5) * 0.03 - 0.12 * chip + 0.12 * rm;
      RO[i] = lerp(lerp(0.42 + (mot[i] - 0.5) * 0.1, 0.75, chip), 0.9, rm);
    }
    S.bump = 6;
  }

  // Heavily rusted steel: dark brown, orange-brown blooms, pitted and very rough. Less saturated than before.
  function gen_rust(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const m1 = fbmN(N, 3, 3, 3, R), m2 = fbmN(N, 18, 18, 3, R), fine = vnoise(N, 160, 160, R), pits = worley(N, 40, R);
    for (let i = 0; i < N * N; i++) {
      const pit = sstep(0.2, 0.09, pits[i]);
      const q = sstep(0.3, 0.7, m1[i] * 0.7 + m2[i] * 0.3);
      let r = lerp(0.18, 0.34, q), g = lerp(0.13, 0.2, q), b = lerp(0.1, 0.13, q);
      const o = sstep(0.6, 0.8, m2[i]) * 0.4;
      r = lerp(r, 0.46, o); g = lerp(g, 0.29, o); b = lerp(b, 0.18, o);
      const k = (0.85 + 0.3 * fine[i]) * (1 - 0.4 * pit);
      C[i * 3] = r * k; C[i * 3 + 1] = g * k; C[i * 3 + 2] = b * k;
      H[i] = 0.5 + (m2[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.12 - pit * 0.3;
      RO[i] = 0.85 + 0.12 * pit + (fine[i] - 0.5) * 0.12 + (m2[i] - 0.5) * 0.1;
    }
    S.bump = 6;
  }

  // Bar grating: horizontal bars every ~3cm, cross ties every ~12cm. Holes are alpha 0. Grimy galvanised steel with rust spots.
  function gen_grate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const A = S.a = new Float32Array(N * N);
    const gal = fbmN(N, 6, 6, 3, R), spang = vnoise(N, 200, 200, R), grime = fbmN(N, 10, 10, 3, R), rustN = fbmN(N, 12, 12, 3, R);
    const PRI = 64, TIE = 16, BW = 0.24, TW = 0.0028;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const pw = w * PRI, dd = Math.abs(pw - Math.floor(pw) - 0.5);   // pitch units from bar centre
      const prim = 1 - sstep(BW - 0.03, BW + 0.03, dd);
      const pz = Math.sqrt(Math.max(0, 1 - (dd / BW) * (dd / BW)));
      const tu = u * TIE, du = Math.abs(tu - Math.floor(tu) - 0.5) / TIE;
      const tie = 1 - sstep(TW - 0.0006, TW + 0.0006, du);
      const tz = Math.sqrt(Math.max(0, 1 - (du / TW) * (du / TW)));
      A[i] = Math.max(prim, tie);
      const top = Math.max(prim * pz, tie * tz);
      const gd = 1 - 0.25 * sstep(0.55, 0.9, grime[i]);
      const rs = sstep(0.68, 0.8, rustN[i]) * 0.55;
      const k = (0.9 + 0.2 * spang[i]) * (0.92 + 0.16 * gal[i]) * gd * (0.8 + 0.3 * top);
      C[i * 3] = lerp(0.34 * k, 0.42 * k, rs); C[i * 3 + 1] = lerp(0.355 * k, 0.24 * k, rs); C[i * 3 + 2] = lerp(0.36 * k, 0.14 * k, rs);
      H[i] = 0.4 + 0.5 * top;
      RO[i] = 0.5 + (spang[i] - 0.5) * 0.1 + 0.3 * sstep(0.55, 0.9, grime[i]) + 0.2 * rs;
    }
    S.bump = 2.5;
  }

  // Corrugated roof deck: 8 ribs per tile running down the canvas, dusty grey, sheet laps and brown run-off.
  function gen_ceiling(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, RIBS = 8;
    const mot = fbmN(N, 3, 3, 3, R), dust = fbmN(N, 10, 10, 3, R), streak = vnoise(N, 50, 6, R), fine = vnoise(N, 200, 200, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const tu = u * RIBS, t = tu - Math.floor(tu);
      const prof = clampN(Math.sin(TAU * t) * 2.5, -1, 1);
      const top = (prof + 1) * 0.5;
      const dl = Math.min(w, 1 - w, Math.abs(w - 0.5));
      const lap = 1 - sstep(0.002, 0.004, dl);
      const dustA = clamp01(0.4 + 0.6 * (dust[i] - 0.5) + 0.2 * top);
      const k = (0.9 + 0.2 * mot[i]) * (1 - 0.3 * lap) * (0.86 + 0.25 * top);
      let r = lerp(0.38, 0.48, dustA) * k, g = lerp(0.39, 0.48, dustA) * k, b = lerp(0.4, 0.47, dustA) * k;
      const stain = sstep(0.6, 0.9, streak[i]) * 0.6;   // brown run-off streaks
      r = lerp(r, 0.38 * k, stain); g = lerp(g, 0.32 * k, stain); b = lerp(b, 0.25 * k, stain);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = 0.5 + 0.22 * prof + (fine[i] - 0.5) * 0.02 - 0.06 * lap;
      RO[i] = lerp(0.6, 0.85, dustA) + (fine[i] - 0.5) * 0.05;
    }
    S.bump = 6;
  }

  // Weathered wooden crate: 16 planks, grey-weathered edges, darker end cleats, nail heads, a faded red stencil box, knots.
  function gen_crate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, PL = 16;
    const tint = new Float32Array(PL);
    for (let k = 0; k < PL; k++) tint[k] = (R() - 0.5) * 0.14;
    const grain = vnoise(N, 3, 110, R), grain2 = fbmN(N, 3, 40, 3, R), fine = vnoise(N, 260, 260, R), weather = fbmN(N, 6, 6, 3, R), fade = fbmN(N, 3, 3, 3, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const pw = w * PL, pk = Math.floor(pw), fy = pw - pk;
      const e = Math.min(fy, 1 - fy) / PL;
      const gap = 1 - sstep(0.0008, 0.0022, e);
      const cleat = 1 - sstep(0.035, 0.045, Math.min(u, 1 - u));
      const k = (1 + tint[pk] + (grain2[i] - 0.5) * 0.25 + (grain[i] - 0.5) * 0.15 + (fine[i] - 0.5) * 0.05)
        * (1 - 0.25 * cleat) * (1 - 0.85 * gap);
      const wx = sstep(0.55, 0.8, weather[i] * 0.6 + fade[i] * 0.4) * 0.6;   // weathered grey
      C[i * 3] = lerp(0.5, 0.44, wx) * k; C[i * 3 + 1] = lerp(0.39, 0.41, wx) * k; C[i * 3 + 2] = lerp(0.27, 0.37, wx) * k;
      H[i] = 0.55 + (grain[i] - 0.5) * 0.04 + (grain2[i] - 0.5) * 0.03 - 0.25 * gap;
      RO[i] = 0.85 + (fine[i] - 0.5) * 0.12 + 0.1 * wx;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // faded stencil box
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const inside = sstep(0.3, 0.302, u) * sstep(0.7, 0.698, u) * sstep(0.28, 0.282, w) * sstep(0.46, 0.458, w);
      const inner = sstep(0.312, 0.314, u) * sstep(0.688, 0.686, u) * sstep(0.292, 0.294, w) * sstep(0.448, 0.446, w);
      const ring = inside * (1 - inner) * (0.25 + 0.3 * fade[i]);
      tintC(C, i, 0.42, 0.2, 0.15, ring);
      RO[i] = lerp(RO[i], 0.7, ring);
    }
    for (let k = 0; k < 16; k++) {   // nail heads on the cleats and along plank ends
      const nu = k & 1 ? 0.022 : 0.978, nw = (((k >> 1) + 0.5) / 8);
      stamp(N, nu, nw, 0.0045, (i, t) => {
        const dome = Math.sqrt(1 - t * t);
        H[i] = Math.max(H[i], 0.6 + 0.3 * dome);
        tintC(C, i, 0.42, 0.42, 0.43, 0.85);
        RO[i] = 0.45;
      });
    }
    for (let k = 0; k < 2; k++) {   // knots
      stamp(N, R(), R(), 0.01, (i, t) => { shadeC(C, i, 0.72 + 0.2 * t); });
    }
    S.bump = 4;
  }

  // Old factory brick, muted red-brown: 9 bricks x 24 courses per tile, running bond, grimy mortar, soot and efflorescence.
  // CO must be even: the bond offset alternates by row parity, so an odd count would stack two courses at the tile seam.
  function gen_brick(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, CO = 24, BC = 9;
    const tone = new Float32Array(CO * BC);
    for (let k = 0; k < tone.length; k++) tone[k] = R();
    const mot = fbmN(N, 16, 16, 3, R), fine = vnoise(N, 140, 140, R), soot = fbmN(N, 3, 3, 3, R), eff = vnoise(N, 22, 22, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const rw = w * CO, row = Math.floor(rw), fy = rw - row;
      const off = (row & 1) ? 0.5 : 0;
      const cu = u * BC + off, col = Math.floor(cu), fx = cu - col;
      const e = Math.min(Math.min(fx, 1 - fx) / BC, Math.min(fy, 1 - fy) / CO);
      const mort = 1 - sstep(0.0022, 0.0032, e);
      const face = sstep(0.0025, 0.009, e);
      const bi = row * BC + wrapI(col, BC);
      const tn = tone[bi];
      const sootA = sstep(0.5, 0.85, soot[i]) * 0.35;
      const k = (0.9 + 0.2 * mot[i]) * (0.94 + 0.12 * fine[i]) * (1 - sootA);
      let r = lerp(0.44, 0.36, tn) * k, g = lerp(0.26, 0.22, tn) * k, b = lerp(0.21, 0.19, tn) * k;
      const ef = sstep(0.82, 0.88, eff[i]) * 0.15;
      r = lerp(r, 0.66, ef); g = lerp(g, 0.64, ef); b = lerp(b, 0.6, ef);
      const mk = (0.9 + 0.15 * fine[i]) * (1 - 0.35 * sstep(0.5, 0.9, soot[i]));
      C[i * 3] = lerp(r, 0.52 * mk, mort);
      C[i * 3 + 1] = lerp(g, 0.5 * mk, mort);
      C[i * 3 + 2] = lerp(b, 0.46 * mk, mort);
      H[i] = lerp(0.6 + 0.12 * face + (mot[i] - 0.5) * 0.05 + (fine[i] - 0.5) * 0.03, 0.25, mort);
      RO[i] = lerp(0.75 + (fine[i] - 0.5) * 0.15 + (soot[i] - 0.5) * 0.1, 0.95, mort);
    }
    S.bump = 2.8;
  }

  // Dark rubber mat: fine granule speckle, lighter scuffs.
  function gen_rubber(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const gran = vnoise(N, 240, 240, R), mot = fbmN(N, 3, 3, 3, R), g2 = vnoise(N, 110, 110, R), scuff = fbmN(N, 4, 4, 3, R);
    for (let i = 0; i < N * N; i++) {
      const bump = sstep(0.55, 0.9, gran[i]), pit = sstep(0.35, 0.12, gran[i]);
      const sc = sstep(0.62, 0.78, scuff[i]) * 0.5;
      const L = 0.1 * (0.92 + 0.16 * (mot[i] - 0.5)) * (1 + 0.35 * bump - 0.25 * pit) * (1 + 0.5 * sc);
      C[i * 3] = L * 0.96; C[i * 3 + 1] = L; C[i * 3 + 2] = L * 1.04;
      H[i] = 0.5 + 0.25 * bump - 0.12 * pit + (g2[i] - 0.5) * 0.02;
      RO[i] = 0.9 + (g2[i] - 0.5) * 0.08 + 0.05 * bump - 0.05 * sc;
    }
    S.bump = 5;
  }

  // Off-white painted plaster with grime: 1m panels with seams, dust, a dirtier lower band, scuffs.
  function gen_lab_white(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 3, 3, 3, R), fine = vnoise(N, 220, 220, R), dust = fbmN(N, 12, 12, 3, R), grime = fbmN(N, 6, 6, 3, R), streak = vnoise(N, 60, 6, R);
    const pt = [0, 1, 2, 3].map(() => (R() - 0.5) * 0.02);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const du = Math.min(u, 1 - u, Math.abs(u - 0.5)), dw = Math.min(w, 1 - w, Math.abs(w - 0.5));
      const seam = 1 - sstep(0.0012, 0.0028, Math.min(du, dw));
      const p = (w >= 0.5 ? 2 : 0) + (u >= 0.5 ? 1 : 0);
      const dm = 1 - 0.04 * sstep(0.6, 0.9, dust[i]);
      const sk = sstep(0.55, 0.85, streak[i]);
      const dirt = sstep(0.55, 0.9, grime[i]) * 0.1 + 0.025 * sk;
      const k = (0.72 + pt[p] + (mot[i] - 0.5) * 0.03 + (fine[i] - 0.5) * 0.015) * (1 - 0.12 * seam) * dm * (1 - dirt);
      C[i * 3] = k; C[i * 3 + 1] = k * 0.99; C[i * 3 + 2] = k * 0.95;
      H[i] = 0.5 + (mot[i] - 0.5) * 0.01 - 0.25 * seam;
      RO[i] = 0.5 + (mot[i] - 0.5) * 0.05 + 0.35 * seam + 0.15 * sstep(0.6, 0.9, dust[i]);
    }
    S.bump = 4;
  }

  // ---------- fur ----------
  // Fine, mostly vertical strands drawn over the base colour, wrapping on both axes.
  function furStrands(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, s = N / 512;
    const B = C.slice(), count = Math.round(50000 * s * s);
    for (let n = 0; n < count; n++) {
      const y0 = Math.floor(R() * N), x0 = R() * N;
      const len = Math.round((6 + R() * 20) * s) + 2;
      const sh = (R() - 0.5) * 0.5, drift = (R() - 0.5) * 0.3;
      let fx = x0;
      for (let k = 0; k < len; k++) {
        let yy = y0 + k; if (yy >= N) yy -= N;
        let xx = Math.floor(fx); if (xx < 0) xx += N; else if (xx >= N) xx -= N;
        const i = yy * N + xx;
        const g = 1 + sh * (1 - 0.5 * k / len);
        C[i * 3] = B[i * 3] * g; C[i * 3 + 1] = B[i * 3 + 1] * g; C[i * 3 + 2] = B[i * 3 + 2] * g;
        H[i] = 0.5 + sh;
        RO[i] = 0.9 - sh * 0.1;
        fx += drift;
      }
    }
  }

  // Tabby: brown base with dark wavy horizontal bands (wave is integer in u, so it wraps).
  function gen_fur_tabby(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 6, 6, 3, R), nz = fbmN(N, 2, 8, 3, R), fine = vnoise(N, 200, 200, R), streak = vnoise(N, 230, 36, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const s = w * 12 + 0.22 * Math.sin(TAU * 2 * u) + 0.12 * Math.sin(TAU * 3 * u + 1.3) + 1.2 * (nz[i] - 0.5);
      const dark = sstep(0.6, 0.92, 0.5 + 0.5 * Math.cos(TAU * s)) * (0.3 + 1.2 * streak[i]);
      const m = (0.9 + 0.2 * mot[i]) * (0.94 + 0.08 * fine[i]) * (0.9 + 0.2 * streak[i]);
      C[i * 3] = lerp(0.6, 0.36, dark * 0.6) * m;
      C[i * 3 + 1] = lerp(0.44, 0.25, dark * 0.6) * m;
      C[i * 3 + 2] = lerp(0.28, 0.15, dark * 0.6) * m;
      H[i] = 0.5; RO[i] = 0.9;
    }
    furStrands(S, R);
    S.bump = 1.6;
  }

  // Ginger: orange base with darker orange wavy bands.
  function gen_fur_ginger(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 6, 6, 3, R), nz = fbmN(N, 2, 8, 3, R), fine = vnoise(N, 200, 200, R), streak = vnoise(N, 230, 36, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const s = w * 9 + 0.22 * Math.sin(TAU * 2 * u) + 0.12 * Math.sin(TAU * 3 * u + 0.7) + 0.7 * (nz[i] - 0.5);
      const dark = sstep(0.6, 0.92, 0.5 + 0.5 * Math.cos(TAU * s)) * (0.3 + 1.2 * streak[i]);
      const m = (0.9 + 0.2 * mot[i]) * (0.94 + 0.08 * fine[i]) * (0.9 + 0.2 * streak[i]);
      C[i * 3] = lerp(0.9, 0.68, dark * 0.6) * m;
      C[i * 3 + 1] = lerp(0.56, 0.38, dark * 0.6) * m;
      C[i * 3 + 2] = lerp(0.24, 0.15, dark * 0.6) * m;
      H[i] = 0.5; RO[i] = 0.9;
    }
    furStrands(S, R);
    S.bump = 1.6;
  }

  // Tuxedo: black with a white bib/chest patch in the lower-front (u 0.35-0.65, v > 0.45).
  function gen_fur_tuxedo(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 5, 5, 3, R), jit = fbmN(N, 4, 4, 2, R), fine = vnoise(N, 200, 200, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const j = (jit[i] - 0.5) * 0.06;
      const pat = sstep(0.32 + j, 0.36 + j, u) * sstep(0.68 + j, 0.64 + j, u) * sstep(0.4 + j * 2, 0.5 + j * 2, w);
      const blk = 0.07 * (0.9 + 0.2 * mot[i]) * (0.95 + 0.1 * fine[i]);
      const wht = 0.92 * (0.96 + 0.06 * mot[i]);
      const c = lerp(blk, wht, pat);
      C[i * 3] = c; C[i * 3 + 1] = c; C[i * 3 + 2] = c * 0.99;
      H[i] = 0.5; RO[i] = 0.9;
    }
    furStrands(S, R);
    S.bump = 1.6;
  }

  // Calico: white base with large soft orange and black patches.
  function gen_fur_calico(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 6, 6, 3, R), pa = fbmN(N, 4, 4, 3, R), pb = fbmN(N, 5, 5, 3, R), fine = vnoise(N, 200, 200, R), streak = vnoise(N, 230, 36, R);
    for (let i = 0; i < N * N; i++) {
      const om = sstep(0.56, 0.7, pa[i]);
      const bm = sstep(0.58, 0.72, pb[i]) * (1 - om);
      const m = (0.96 + 0.06 * mot[i]) * (0.97 + 0.06 * fine[i]) * (0.94 + 0.12 * streak[i]);
      let r = 0.94 * m, g = 0.93 * m, b = 0.9 * m;
      r = lerp(r, 0.86, om); g = lerp(g, 0.46, om); b = lerp(b, 0.14, om);
      r = lerp(r, 0.1, bm); g = lerp(g, 0.09, bm); b = lerp(b, 0.09, bm);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = 0.5; RO[i] = 0.9;
    }
    furStrands(S, R);
    S.bump = 1.6;
  }

  // Blue-grey cat: solid base, darker ticking from the strands.
  function gen_fur_grey(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 6, 6, 3, R), fine = vnoise(N, 200, 200, R), streak = vnoise(N, 230, 36, R);
    for (let i = 0; i < N * N; i++) {
      const m = (0.94 + 0.12 * mot[i]) * (0.97 + 0.06 * fine[i]) * (0.9 + 0.2 * streak[i]);
      C[i * 3] = 0.46 * m; C[i * 3 + 1] = 0.5 * m; C[i * 3 + 2] = 0.55 * m;
      H[i] = 0.5; RO[i] = 0.9;
    }
    furStrands(S, R);
    S.bump = 1.6;
  }

  // ---------- registry + cache ----------
  const GEN = {
    concrete_floor: gen_concrete_floor,
    concrete_wall: gen_concrete_wall,
    metal_panel: gen_metal_panel,
    diamond_plate: gen_diamond_plate,
    hazard: gen_hazard,
    tiles_wall: gen_tiles_wall,
    tiles_floor: gen_tiles_floor,
    epoxy_yellow: gen_epoxy_yellow,
    painted_metal: gen_painted_metal,
    rust: gen_rust,
    grate: gen_grate,
    ceiling: gen_ceiling,
    crate: gen_crate,
    brick: gen_brick,
    rubber: gen_rubber,
    lab_white: gen_lab_white,
    fur_tabby: gen_fur_tabby,
    fur_tuxedo: gen_fur_tuxedo,
    fur_calico: gen_fur_calico,
    fur_grey: gen_fur_grey,
    fur_ginger: gen_fur_ginger,
  };

  function mkTex(cv, colour) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (colour) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }

  // ---------- real-texture drop-in ----------
  // JB.TexManifest (js/texmanifest.js) can name JPG/PNG files for a texture. make() still returns the
  // procedural canvases at once; when an entry exists, the images load in the background and are swapped
  // into the same Texture objects (and any clones made from them, since levels clone for repeat).
  // A failed load keeps the procedural canvas. See Jimbog/assets/tex/README.md.
  const SLOTS = [['albedo', 'map'], ['normal', 'normalMap'], ['rough', 'roughnessMap']];
  const reals = {};   // name -> { imgs: {slot: Image}, users: {slot: [Texture]} }
  function realFor(name) {
    if (reals[name]) return reals[name];
    const M = window.JB && window.JB.TexManifest, spec = M && M[name];
    if (!spec) return null;
    const R = (reals[name] = { imgs: {}, users: { map: [], normalMap: [], roughnessMap: [] } });
    for (const [key, slot] of SLOTS) {
      if (!spec[key]) continue;
      const img = new Image();
      img.onload = () => {
        R.imgs[slot] = img;
        for (const t of R.users[slot]) { t.image = img; t.needsUpdate = true; }
      };
      img.onerror = () => { /* keep the procedural canvas */ };
      img.src = spec[key];
    }
    return R;
  }
  function attachReal(R, slot, tex) {
    R.users[slot].push(tex);
    const base = tex.clone;
    tex.clone = function () {
      const c = base.call(this);
      R.users[slot].push(c);
      return c;
    };
    if (R.imgs[slot]) { tex.image = R.imgs[slot]; tex.needsUpdate = true; }
  }

  const cache = {};
  function make(name, size) {
    size = Math.round(size || 512);
    const key = name + '@' + size;
    if (cache[key]) return cache[key];
    const gen = GEN[name];
    if (!gen) throw new Error('JB.Tex: unknown texture "' + name + '"');
    const S = Surf(size);
    gen(S, mulberry32(hashStr(name)));
    const out = finish(S);
    const entry = {
      map: mkTex(out.map, true),
      normalMap: mkTex(out.normal, false),
      roughnessMap: mkTex(out.rough, false),
    };
    const R = realFor(name);
    if (R) for (const [, slot] of SLOTS) attachReal(R, slot, entry[slot]);
    return (cache[key] = entry);
  }

  // Other files can add generators: gen(S, R) fills S.c (sRGB 0..1, 3 per px),
  // S.h (height 0..1), S.r (roughness), optional S.a (alpha) and S.bump.
  function register(name, gen) { GEN[name] = gen; JB.Tex.list = Object.keys(GEN); }
  const helpers = { vnoise, fbm, fbmN, worley, stamp, walk, shadeC, tintC, sstep, lerp, clamp01, clampN, wrapI, TAU };
  JB.Tex = { make: make, list: Object.keys(GEN), register: register, helpers: helpers };
})();
