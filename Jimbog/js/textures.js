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

  // Polished grey concrete, saw-cut joints on the 2m grid, hairline cracks, oil stains.
  function gen_concrete_floor(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const big = fbmN(N, 3, 3, 3, R), med = fbmN(N, 12, 12, 3, R), agg = vnoise(N, 190, 190, R);
    for (let i = 0; i < N * N; i++) {
      const sp = sstep(0.82, 0.93, agg[i]), dk = sstep(0.16, 0.05, agg[i]);
      const l = 1 + (big[i] - 0.5) * 0.14 + (med[i] - 0.5) * 0.06 + sp * 0.06 - dk * 0.1;
      C[i * 3] = 0.5 * l; C[i * 3 + 1] = 0.5 * l; C[i * 3 + 2] = 0.485 * l;
      H[i] = 0.5 + (med[i] - 0.5) * 0.08 + sp * 0.1 - dk * 0.12;
      RO[i] = 0.42 + (big[i] - 0.5) * 0.25 + dk * 0.2;
    }
    const gw = 1.2 / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const d = Math.min(u, 1 - u, w, 1 - w);            // distance to the tile edge = joint line
      const g = 1 - sstep(gw * 0.5, gw * 2.5, d);
      if (g > 0) { shadeC(C, i, 1 - 0.35 * g); H[i] -= 0.3 * g; RO[i] += 0.25 * g; }
    }
    for (let k = 0; k < 3; k++) {
      walk(N, R, R(), R(), 45, 0.0035, 1.1 / N, 0.8, undefined, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.45 * f); H[i] -= 0.2 * f; RO[i] += 0.3 * f;
      });
    }
    for (let k = 0; k < 4; k++) {   // oil / dirt stains: soft, with ragged edges
      stamp(N, R(), R(), 0.05 + R() * 0.08, (i, t) => {
        const f = (1 - t) * (1 - t) * sstep(0.45, 0.8, big[i] * 0.5 + med[i] * 0.5) * 0.8;
        shadeC(C, i, 1 - 0.12 * f); RO[i] -= 0.15 * f;
      });
    }
    S.bump = 8;
  }

  // Painted cinder block, 40 x 20 cm blocks in running bond, mortar recess, dirt at the base.
  function gen_concrete_wall(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, ROWS = 10, COLS = 5;
    const tint = new Float32Array(ROWS * COLS);
    for (let k = 0; k < tint.length; k++) tint[k] = (R() - 0.5) * 0.08;
    const mot = fbmN(N, 4, 4, 3, R), pit = vnoise(N, 170, 170, R), streak = vnoise(N, 70, 6, R), grain = vnoise(N, 40, 40, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const rw = w * ROWS, row = Math.floor(rw), fy = rw - row;
      const off = (row & 1) ? 0.5 : 0;
      const cu = u * COLS + off, col = Math.floor(cu), fx = cu - col;
      const e = Math.min(Math.min(fx, 1 - fx) / COLS, Math.min(fy, 1 - fy) / ROWS);   // UV distance to a joint
      const mortar = 1 - sstep(0.0022, 0.003, e);
      const bevel = sstep(0.0025, 0.008, e);
      const bi = row * COLS + wrapI(col, COLS);
      const D = Math.exp(-((w / 0.3) ** 2)) + Math.exp(-(((1 - w) / 0.3) ** 2));   // dirt, symmetric so it tiles
      const pitD = sstep(0.12, 0.03, pit[i]);
      const dirt = 1 - 0.14 * D * (0.5 + streak[i]);
      const blk = (1 + tint[bi] + (mot[i] - 0.5) * 0.08 + (grain[i] - 0.5) * 0.04) * (1 - 0.35 * pitD) * dirt;
      const mor = (0.8 + 0.4 * grain[i]) * dirt;
      C[i * 3] = lerp(0.76 * blk, 0.55 * mor, mortar);
      C[i * 3 + 1] = lerp(0.74 * blk, 0.53 * mor, mortar);
      C[i * 3 + 2] = lerp(0.69 * blk, 0.5 * mor, mortar);
      H[i] = lerp(0.6 + 0.06 * bevel - 0.08 * pitD + (grain[i] - 0.5) * 0.02, 0.25, mortar);
      RO[i] = lerp(0.7 + 0.1 * pitD + (grain[i] - 0.5) * 0.08, 0.95, mortar);
    }
    S.bump = 3.5;
  }

  // Vertical steel cladding: 1m panels, seams with rivet rows, brushed streaks, scratches.
  function gen_metal_panel(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), wave = fbmN(N, 2, 2, 2, R), brush = vnoise(N, 256, 3, R);
    const pt = [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N;
      const pan = u < 0.5 ? 0 : 1;
      const dS = Math.min(u, 1 - u, Math.abs(u - 0.5));   // distance to a panel seam
      const seam = 1 - sstep(0.0015, 0.0035, dS);
      const k = (1 + pt[pan] + (mot[i] - 0.5) * 0.12 + (brush[i] - 0.5) * 0.06) * (1 - 0.3 * seam);
      C[i * 3] = 0.35 * k; C[i * 3 + 1] = 0.39 * k; C[i * 3 + 2] = 0.44 * k;
      H[i] = 0.5 + (wave[i] - 0.5) * 0.04 + (brush[i] - 0.5) * 0.02 - 0.25 * seam;
      RO[i] = 0.42 + (brush[i] - 0.5) * 0.08 + (mot[i] - 0.5) * 0.1 + 0.25 * seam;
    }
    for (let k = 0; k < 7; k++) {
      walk(N, R, R(), R(), 30 + ((R() * 30) | 0), 0.003, 0.9 / N, 0.3, Math.PI / 2 + (R() - 0.5) * 0.5, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 + 0.3 * f); RO[i] += 0.2 * f;
      });
    }
    // rivets: two rows either side of each seam, 8 per panel height
    for (const s of [0, 0.5]) for (const o of [-0.018, 0.018]) for (let k = 0; k < 8; k++) {
      stamp(N, s + o, (k + 0.5) / 8, 0.009, (i, t) => {
        const dome = Math.sqrt(1 - t * t);
        H[i] = Math.max(H[i], 0.5 + 0.3 * dome);
        shadeC(C, i, 1.12 + 0.2 * dome);
        RO[i] = 0.35 + 0.1 * (1 - dome);
      });
    }
    S.bump = 6;
  }

  // Steel diamond tread plate: raised lozenges (20 per tile), worn bright tops, grimy gaps.
  function gen_diamond_plate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, K = 20;
    const grime = fbmN(N, 8, 8, 3, R), wear = fbmN(N, 5, 5, 3, R), fine = vnoise(N, 200, 200, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const a = u * K, b = w * K;
      const d = Math.abs(a - Math.floor(a) - 0.5) + Math.abs(b - Math.floor(b) - 0.5);   // 0 centre .. 1 corner
      const top = sstep(0.5, 0.36, d);
      const gd = 0.7 + 0.6 * grime[i], wk = 0.95 + 0.1 * wear[i];
      C[i * 3] = lerp(0.19 * gd, 0.5 * wk, top);
      C[i * 3 + 1] = lerp(0.19 * gd, 0.52 * wk, top);
      C[i * 3 + 2] = lerp(0.18 * gd, 0.55 * wk, top);
      H[i] = 0.2 + 0.8 * top + (fine[i] - 0.5) * 0.02;
      RO[i] = lerp(0.8 + 0.1 * (grime[i] - 0.5), 0.22 + 0.15 * wear[i] + 0.05 * fine[i], top);
    }
    for (let k = 0; k < 10; k++) {
      walk(N, R, R(), R(), 12 + ((R() * 20) | 0), 0.004, 0.9 / N, 1.2, undefined, (i, t) => {
        shadeC(C, i, 1 + 0.12 * (1 - t)); RO[i] -= 0.05 * (1 - t);
      });
    }
    S.bump = 5;
  }

  // Yellow/black 45 degree hazard stripes (5 pairs per tile, ~14cm each), chipped to grey metal.
  function gen_hazard(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const chipA = fbmN(N, 14, 14, 3, R), chipB = vnoise(N, 96, 96, R), metal = fbmN(N, 6, 6, 3, R), grime = fbmN(N, 5, 5, 3, R);
    const chip = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const yel = sstep(-0.1, 0.1, Math.sin(TAU * 5 * (u + w)));   // 1 = yellow band
      const ch = sstep(0.7, 0.77, chipA[i] * 0.7 + chipB[i] * 0.3);
      chip[i] = ch;
      const g = 0.9 + 0.2 * grime[i];
      const pr = lerp(0.07, 0.93, yel) * g, pg = lerp(0.065, 0.74, yel) * g, pb = lerp(0.06, 0.12, yel) * g;
      const mt = 0.5 * (0.85 + 0.3 * metal[i]);
      C[i * 3] = lerp(pr, mt, ch); C[i * 3 + 1] = lerp(pg, mt, ch); C[i * 3 + 2] = lerp(pb, mt * 1.04, ch);
      H[i] = lerp(0.62, 0.36, ch) + (chipB[i] - 0.5) * 0.02;
      RO[i] = lerp(0.5 + 0.1 * (grime[i] - 0.5), 0.42 + 0.1 * metal[i], ch);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // dark rim on chip edges
      const gx = chip[y * N + wrapI(x + 1, N)] - chip[y * N + wrapI(x - 1, N)];
      const gy = chip[wrapI(y + 1, N) * N + x] - chip[wrapI(y - 1, N) * N + x];
      const e = Math.min(1, Math.abs(gx) + Math.abs(gy));
      if (e > 0) shadeC(C, y * N + x, 1 - 0.35 * e);
    }
    for (let k = 0; k < 9; k++) {   // boot scuffs
      walk(N, R, R(), R(), 14 + ((R() * 16) | 0), 0.004, 1.0 / N, 1.0, undefined, (i, t) => {
        const f = (1 - t) * 0.5;
        tintC(C, i, 0.45, 0.45, 0.45, f); RO[i] += 0.2 * (1 - t);
      });
    }
    S.bump = 4;
  }

  // Glossy off-white wall tiles, 13 per tile (~15cm), grey grout, slight tint per tile, cracked/stained ones.
  function gen_tiles_wall(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, T = 13, GH = 0.0015;
    const tint = new Float32Array(T * T), warm = new Float32Array(T * T);
    for (let k = 0; k < T * T; k++) { tint[k] = (R() - 0.5) * 0.05; warm[k] = (R() - 0.5) * 0.02; }
    const glz = fbmN(N, 3, 3, 3, R), gm = vnoise(N, 180, 180, R), grime = fbmN(N, 6, 6, 3, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const tu = u * T, tw = w * T, ci = Math.floor(tu), cj = Math.floor(tw);
      const fx = tu - ci, fy = tw - cj;
      const e = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / T;
      const face = sstep(GH, GH * 4, e);
      const bi = cj * T + ci;
      const g = 1 + tint[bi] + (glz[i] - 0.5) * 0.03;
      const gr = (0.85 + 0.3 * gm[i]) * (1 - 0.25 * sstep(0.6, 0.9, grime[i]));
      C[i * 3] = lerp(0.6 * gr, 0.92 * g + warm[bi], face);
      C[i * 3 + 1] = lerp(0.6 * gr, 0.92 * g, face);
      C[i * 3 + 2] = lerp(0.58 * gr, 0.9 * g - warm[bi], face);
      H[i] = 0.2 + 0.45 * Math.sqrt(face) + (glz[i] - 0.5) * 0.02;
      RO[i] = lerp(0.85 + 0.1 * (gm[i] - 0.5), 0.1 + 0.06 * glz[i], face);
    }
    for (let k = 0; k < 3; k++) {   // cracked tiles
      const ti = Math.floor(R() * T), tj = Math.floor(R() * T);
      walk(N, R, (ti + 0.3 + 0.4 * R()) / T, (tj + 0.3 + 0.4 * R()) / T, 14, 0.0045, 1.0 / N, 1.0, undefined, (i, t) => {
        const f = 1 - t; shadeC(C, i, 1 - 0.5 * f); H[i] -= 0.1 * f; RO[i] = lerp(RO[i], 0.6, f);
      });
    }
    for (let k = 0; k < 4; k++) {   // water / mineral stains
      stamp(N, R(), R(), 0.012 + R() * 0.02, (i, t) => {
        const f = Math.pow(1 - t, 2) * 0.25 * (0.5 + glz[i]);
        tintC(C, i, 0.8, 0.74, 0.5, f);
      });
    }
    S.bump = 4;
  }

  // Charcoal floor tiles, 20 per tile (~10cm), lighter grimy grout.
  function gen_tiles_floor(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, T = 20, GH = 0.002;
    const tint = new Float32Array(T * T);
    for (let k = 0; k < T * T; k++) tint[k] = (R() - 0.5) * 0.06;
    const spk = vnoise(N, 150, 150, R), grime = fbmN(N, 4, 4, 3, R), gm = vnoise(N, 200, 200, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const tu = u * T, tw = w * T, ci = Math.floor(tu), cj = Math.floor(tw);
      const fx = tu - ci, fy = tw - cj;
      const e = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / T;
      const face = sstep(GH, GH * 4, e);
      const bi = cj * T + ci;
      const gy = 1 - 0.08 * sstep(0.6, 0.9, grime[i]);
      const tk = (1 + tint[bi]) * (1 + (spk[i] - 0.5) * 0.12) * gy;
      const gr = (0.9 + 0.2 * gm[i]) * (1 - 0.15 * sstep(0.6, 0.9, grime[i]));
      C[i * 3] = lerp(0.55 * gr, 0.2 * tk, face);
      C[i * 3 + 1] = lerp(0.55 * gr, 0.2 * tk, face);
      C[i * 3 + 2] = lerp(0.53 * gr, 0.21 * tk, face);
      H[i] = 0.2 + 0.35 * Math.sqrt(face);
      RO[i] = lerp(0.9, 0.4 + 0.1 * (spk[i] - 0.5), face);
    }
    S.bump = 4;
  }

  // Worn ochre epoxy floor: wear patches down to concrete, forklift tyre tracks, roller marks.
  function gen_epoxy_yellow(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 5, 5, 3, R), wearA = fbmN(N, 4, 4, 4, R), wearB = vnoise(N, 160, 160, R);
    const roll = vnoise(N, 2, 220, R), spot = vnoise(N, 200, 200, R);
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
      const wear = sstep(0.6, 0.72, wearA[i] * 0.75 + wearB[i] * 0.25);
      const ry = 1 + (roll[i] - 0.5) * 0.05, my = 0.94 + 0.12 * (mot[i] - 0.5);
      const cc = 0.85 + 0.3 * spot[i];
      const tk = 1 - 0.4 * track[i];
      C[i * 3] = lerp(0.8 * my * ry, 0.5 * cc, wear) * tk;
      C[i * 3 + 1] = lerp(0.6 * my * ry, 0.5 * cc, wear) * tk;
      C[i * 3 + 2] = lerp(0.22 * my * ry, 0.48 * cc, wear) * tk;
      H[i] = lerp(0.6, 0.42 + 0.08 * spot[i], wear) + (roll[i] - 0.5) * 0.01;
      RO[i] = lerp(0.35 + (mot[i] - 0.5) * 0.1, 0.85 + 0.1 * spot[i], wear) + 0.25 * track[i];
    }
    S.bump = 5;
  }

  // Teal machinery paint: orange peel, chipped to grey primer, rust blooms with downward streaks.
  function gen_painted_metal(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 4, 4, 3, R), peel = vnoise(N, 220, 220, R), chipA = fbmN(N, 30, 30, 2, R), rustN = fbmN(N, 40, 40, 3, R);
    const rust = new Float32Array(N * N);
    for (let k = 0; k < 14; k++) {
      const cu = R(), cw = R(), r0 = 0.02 + R() * 0.02, len = 0.05 + R() * 0.16, bloom = 0.7 + R() * 0.3;
      stamp(N, cu, cw, r0, (i, t) => { rust[i] = Math.max(rust[i], (1 - t) * bloom); });
      const steps = Math.ceil(len * N);
      for (let s = 0; s <= steps; s++) {   // streak running down (increasing canvas y)
        const f = s / steps;
        stamp(N, cu, cw + len * f, 0.003 + r0 * 0.6 * (1 - f), (i, t) => {
          rust[i] = Math.max(rust[i], (1 - t) * 0.8 * (1 - f) * bloom);
        });
      }
    }
    for (let i = 0; i < N * N; i++) {
      const rv = rust[i] * (0.65 + 0.7 * rustN[i]);
      const rm = sstep(0.2, 0.4, rv);
      const chip = sstep(0.8, 0.86, chipA[i] * 0.6 + peel[i] * 0.4);
      const pm = 1 + (mot[i] - 0.5) * 0.08 + (peel[i] - 0.5) * 0.04;
      const rk = 0.8 + 0.4 * rustN[i];
      let r = lerp(0.14 * pm, 0.56, chip), g = lerp(0.4 * pm, 0.57, chip), b = lerp(0.41 * pm, 0.6, chip);
      r = lerp(r, 0.46 * rk, rm); g = lerp(g, 0.24 * rk, rm); b = lerp(b, 0.11 * rk, rm);
      C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
      H[i] = 0.6 + (peel[i] - 0.5) * 0.03 - 0.12 * chip + 0.12 * rm;
      RO[i] = lerp(lerp(0.4 + (mot[i] - 0.5) * 0.1, 0.3, chip), 0.9, rm);
    }
    S.bump = 6;
  }

  // Heavily rusted steel: layered orange-brown, pitted, very rough.
  function gen_rust(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const m1 = fbmN(N, 3, 3, 3, R), m2 = fbmN(N, 18, 18, 3, R), fine = vnoise(N, 160, 160, R), pits = worley(N, 40, R);
    for (let i = 0; i < N * N; i++) {
      const pit = sstep(0.2, 0.09, pits[i]);
      const q = sstep(0.3, 0.7, m1[i] * 0.7 + m2[i] * 0.3);
      let r = lerp(0.2, 0.5, q), g = lerp(0.11, 0.24, q), b = lerp(0.06, 0.1, q);
      const o = sstep(0.6, 0.8, m2[i]) * 0.5;
      r = lerp(r, 0.66, o); g = lerp(g, 0.4, o); b = lerp(b, 0.18, o);
      const k = (0.85 + 0.3 * fine[i]) * (1 - 0.4 * pit);
      C[i * 3] = r * k; C[i * 3 + 1] = g * k; C[i * 3 + 2] = b * k;
      H[i] = 0.5 + (m2[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.12 - pit * 0.3;
      RO[i] = 0.82 + 0.18 * pit + (fine[i] - 0.5) * 0.12 + (m2[i] - 0.5) * 0.1;
    }
    S.bump = 6;
  }

  // Bar grating: horizontal bars every ~3cm, cross ties every ~12cm. Holes are alpha 0.
  function gen_grate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const A = S.a = new Float32Array(N * N);
    const gal = fbmN(N, 6, 6, 3, R), spang = vnoise(N, 200, 200, R), grime = fbmN(N, 10, 10, 3, R);
    const PRI = 64, TIE = 16, BW = 0.24, TW = 0.0028;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const pw = w * PRI, dd = Math.abs(pw - Math.floor(pw) - 0.5);   // pitch units from bar centre
      const prim = 1 - sstep(BW - 0.03, BW + 0.03, dd);
      const pz = Math.sqrt(Math.max(0, 1 - (dd / BW) * (dd / BW)));
      const tu = u * TIE, du = Math.abs(tu - Math.floor(tu) - 0.5) / TIE;   // UV distance from tie centre
      const tie = 1 - sstep(TW - 0.0006, TW + 0.0006, du);
      const tz = Math.sqrt(Math.max(0, 1 - (du / TW) * (du / TW)));
      A[i] = Math.max(prim, tie);
      const top = Math.max(prim * pz, tie * tz);
      const gd = 1 - 0.15 * sstep(0.6, 0.9, grime[i]);
      const k = (0.9 + 0.2 * spang[i]) * (0.92 + 0.16 * gal[i]) * gd * (0.8 + 0.3 * top);
      C[i * 3] = 0.37 * k; C[i * 3 + 1] = 0.39 * k; C[i * 3 + 2] = 0.41 * k;
      H[i] = 0.4 + 0.5 * top;
      RO[i] = 0.42 + (spang[i] - 0.5) * 0.1 + 0.25 * sstep(0.6, 0.9, grime[i]);
    }
    S.bump = 2.5;
  }

  // Corrugated roof deck: 8 ribs per tile running down the canvas, dusty grey, sheet laps and stains.
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
      const dustA = clamp01(0.45 + 0.6 * (dust[i] - 0.5) + 0.15 * top);
      const stain = sstep(0.6, 0.9, streak[i]) * 0.06;
      const k = (0.9 + 0.2 * mot[i]) * (1 - stain) * (1 - 0.3 * lap) * (0.82 + 0.25 * top);
      C[i * 3] = lerp(0.42, 0.56, dustA) * k;
      C[i * 3 + 1] = lerp(0.44, 0.54, dustA) * k;
      C[i * 3 + 2] = lerp(0.46, 0.5, dustA) * k;
      H[i] = 0.5 + 0.22 * prof + (fine[i] - 0.5) * 0.02 - 0.06 * lap;
      RO[i] = lerp(0.45, 0.75, dustA) + (fine[i] - 0.5) * 0.05;
    }
    S.bump = 6;
  }

  // Wooden shipping crate: 16 planks, darker end cleats, nail heads, faded red stencil box, knots.
  function gen_crate(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, PL = 16;
    const tint = new Float32Array(PL);
    for (let k = 0; k < PL; k++) tint[k] = (R() - 0.5) * 0.14;
    const grain = vnoise(N, 3, 110, R), grain2 = fbmN(N, 3, 40, 3, R), fine = vnoise(N, 260, 260, R), fade = fbmN(N, 5, 5, 3, R);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const pw = w * PL, pk = Math.floor(pw), fy = pw - pk;
      const e = Math.min(fy, 1 - fy) / PL;
      const gap = 1 - sstep(0.0008, 0.0022, e);
      const cleat = 1 - sstep(0.035, 0.045, Math.min(u, 1 - u));
      const k = (1 + tint[pk] + (grain2[i] - 0.5) * 0.25 + (grain[i] - 0.5) * 0.15 + (fine[i] - 0.5) * 0.05)
        * (1 - 0.28 * cleat) * (1 - 0.85 * gap);
      C[i * 3] = 0.66 * k; C[i * 3 + 1] = 0.5 * k; C[i * 3 + 2] = 0.33 * k;
      H[i] = 0.55 + (grain[i] - 0.5) * 0.04 + (grain2[i] - 0.5) * 0.03 - 0.25 * gap;
      RO[i] = 0.8 + (fine[i] - 0.5) * 0.12;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // faded stencil box
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const inside = sstep(0.3, 0.302, u) * sstep(0.7, 0.698, u) * sstep(0.28, 0.282, w) * sstep(0.46, 0.458, w);
      const inner = sstep(0.312, 0.314, u) * sstep(0.688, 0.686, u) * sstep(0.292, 0.294, w) * sstep(0.448, 0.446, w);
      const ring = inside * (1 - inner) * (0.35 + 0.4 * fade[i]);
      tintC(C, i, 0.55, 0.2, 0.14, ring);
      RO[i] = lerp(RO[i], 0.7, ring);
    }
    for (let k = 0; k < 16; k++) {   // nail heads on the cleats and along plank ends
      const nu = k & 1 ? 0.022 : 0.978, nw = (((k >> 1) + 0.5) / 8);
      stamp(N, nu, nw, 0.0045, (i, t) => {
        const dome = Math.sqrt(1 - t * t);
        H[i] = Math.max(H[i], 0.6 + 0.3 * dome);
        tintC(C, i, 0.5, 0.5, 0.52, 0.85);
        RO[i] = 0.4;
      });
    }
    for (let k = 0; k < 2; k++) {   // knots
      stamp(N, R(), R(), 0.01, (i, t) => { shadeC(C, i, 0.72 + 0.2 * t); });
    }
    S.bump = 4;
  }

  // Old factory brick: 9 bricks x 25 courses per tile, running bond, mortar recess, soot and efflorescence.
  function gen_brick(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r, CO = 25, BC = 9;
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
      const sootA = sstep(0.55, 0.85, soot[i]) * 0.25;
      const k = (0.9 + 0.2 * mot[i]) * (0.94 + 0.12 * fine[i]) * (1 - sootA);
      let r = lerp(0.6, 0.45, tn) * k, g = lerp(0.27, 0.21, tn) * k, b = lerp(0.18, 0.17, tn) * k;
      const ef = sstep(0.82, 0.88, eff[i]) * 0.18;
      r = lerp(r, 0.78, ef); g = lerp(g, 0.74, ef); b = lerp(b, 0.7, ef);
      const mk = (0.9 + 0.15 * fine[i]) * (1 - 0.3 * sstep(0.5, 0.9, soot[i]));
      C[i * 3] = lerp(r, 0.62 * mk, mort);
      C[i * 3 + 1] = lerp(g, 0.6 * mk, mort);
      C[i * 3 + 2] = lerp(b, 0.56 * mk, mort);
      H[i] = lerp(0.6 + 0.12 * face + (mot[i] - 0.5) * 0.05 + (fine[i] - 0.5) * 0.03, 0.25, mort);
      RO[i] = lerp(0.75 + (fine[i] - 0.5) * 0.15 + (soot[i] - 0.5) * 0.1, 0.95, mort);
    }
    S.bump = 2.8;
  }

  // Dark rubber mat: fine granule speckle.
  function gen_rubber(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const gran = vnoise(N, 240, 240, R), mot = fbmN(N, 3, 3, 3, R), g2 = vnoise(N, 110, 110, R);
    for (let i = 0; i < N * N; i++) {
      const bump = sstep(0.55, 0.9, gran[i]), pit = sstep(0.35, 0.12, gran[i]);
      const L = 0.11 * (0.92 + 0.16 * (mot[i] - 0.5)) * (1 + 0.35 * bump - 0.25 * pit);
      C[i * 3] = L * 0.96; C[i * 3 + 1] = L; C[i * 3 + 2] = L * 1.05;
      H[i] = 0.5 + 0.25 * bump - 0.12 * pit + (g2[i] - 0.5) * 0.02;
      RO[i] = 0.85 + (g2[i] - 0.5) * 0.1 + 0.05 * bump;
    }
    S.bump = 5;
  }

  // Clean white lab panels, 1m, fine glossy seams.
  function gen_lab_white(S, R) {
    const N = S.N, C = S.c, H = S.h, RO = S.r;
    const mot = fbmN(N, 3, 3, 3, R), fine = vnoise(N, 220, 220, R), dust = fbmN(N, 12, 12, 3, R);
    const pt = [0, 1, 2, 3].map(() => (R() - 0.5) * 0.012);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, w = (y + 0.5) / N;
      const du = Math.min(u, 1 - u, Math.abs(u - 0.5)), dw = Math.min(w, 1 - w, Math.abs(w - 0.5));
      const seam = 1 - sstep(0.0012, 0.0028, Math.min(du, dw));
      const p = (w >= 0.5 ? 2 : 0) + (u >= 0.5 ? 1 : 0);
      const dm = 1 - 0.03 * sstep(0.6, 0.9, dust[i]);
      const k = (0.93 + pt[p] + (mot[i] - 0.5) * 0.02 + (fine[i] - 0.5) * 0.01) * (1 - 0.1 * seam) * dm;
      C[i * 3] = k; C[i * 3 + 1] = k; C[i * 3 + 2] = k * 1.01;
      H[i] = 0.5 + (mot[i] - 0.5) * 0.01 - 0.25 * seam;
      RO[i] = 0.18 + (mot[i] - 0.5) * 0.05 + 0.4 * seam + 0.1 * sstep(0.6, 0.9, dust[i]);
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
    return (cache[key] = {
      map: mkTex(out.map, true),
      normalMap: mkTex(out.normal, false),
      roughnessMap: mkTex(out.rough, false),
    });
  }

  // Other files can add generators: gen(S, R) fills S.c (sRGB 0..1, 3 per px),
  // S.h (height 0..1), S.r (roughness), optional S.a (alpha) and S.bump.
  function register(name, gen) { GEN[name] = gen; JB.Tex.list = Object.keys(GEN); }
  const helpers = { vnoise, fbm, fbmN, worley, stamp, walk, shadeC, tintC, sstep, lerp, clamp01, clampN, wrapI, TAU };
  JB.Tex = { make: make, list: Object.keys(GEN), register: register, helpers: helpers };
})();
