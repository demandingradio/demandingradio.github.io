/* Diorama — core: constants, RNG, noise, math, events, small helpers.
   Every module hangs off the single global `D`. Scripts load in order from index.html. */
(function () {
'use strict';
const D = window.D = window.D || {};

// ---- World constants -------------------------------------------------------
// The region is a 1024 x 1024 cell heightmap at 16 m per cell = 16.4 km square.
D.N = 1024;              // cells per side
D.VN = D.N + 1;          // vertices per side
D.CELL = 16;             // metres per cell
D.SIZE = D.N * D.CELL;   // 16384 m
D.CHUNK = 64;            // cells per terrain chunk
D.NCH = D.N / D.CHUNK;   // 16 chunks per side
D.V = D.VN * D.VN;       // vertex count

// ---- Math ---------------------------------------------------------------
D.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
D.lerp = (a, b, t) => a + (b - a) * t;
D.smooth = (e0, e1, x) => { const t = D.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
D.fract = x => x - Math.floor(x);
D.dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
D.angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// Brush falloff: t = d / r in [0,1]; hardness in [0,1]
D.falloff = function (t, hard) {
  if (t >= 1) return 0;
  if (t <= hard) return 1;
  const u = (t - hard) / (1 - hard + 1e-6);
  return 0.5 + 0.5 * Math.cos(Math.PI * u);
};

// ---- RNG ----------------------------------------------------------------
D.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
D.hashStr = function (s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
// Variadic uint32 hash of numbers / strings. EXACT copy of town.js hash32 so outputs match.
D.hash32 = function () {
  let h = 0x811c9dc5 ^ arguments.length;
  for (let a = 0; a < arguments.length; a++) {
    let v = arguments[a];
    if (typeof v === 'string') v = D.hashStr(v);
    else if (typeof v !== 'number' || !isFinite(v)) v = 0x9e37;
    else v = (v | 0) ^ ((v / 4294967296) | 0);
    h = Math.imul(h ^ v, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h ^= h >>> 15;
  return h >>> 0;
};
// Tuning knobs: each module merges its own defaults into D.TUNE.<module> in its own file.
D.TUNE = D.TUNE || {};
// Integer hash -> [0,1)
D.hash2 = function (x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---- Simplex noise (2D) ---------------------------------------------------
const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
D.makeNoise = function (seed) {
  const r = D.rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm8 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm8[i] = perm[i] & 7; }
  function n2(xin, yin) {
    let n0 = 0, n1 = 0, n2v = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm8[ii + perm[jj]]; t0 *= t0; n0 = t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm8[ii + i1 + perm[jj + j1]]; t1 *= t1; n1 = t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm8[ii + 1 + perm[jj + 1]]; t2 *= t2; n2v = t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
    return 70 * (n0 + n1 + n2v);
  }
  function fbm(x, y, oct, lac, gain) {
    oct = oct || 5; lac = lac || 2; gain = gain || 0.5;
    let s = 0, a = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * n2(x * f + o * 17.31, y * f - o * 9.17); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  function ridged(x, y, oct, lac, gain) {
    oct = oct || 5; lac = lac || 2.1; gain = gain || 0.5;
    let s = 0, a = 1, f = 1, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n2(x * f + o * 31.7, y * f + o * 11.3));
      v *= v; v *= w; w = D.clamp(v * 1.6, 0, 1);
      s += a * v; norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }
  return { n2, fbm, ridged };
};

// ---- Events -----------------------------------------------------------
const listeners = {};
D.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
D.emit = (evt, a, b, c, d, e) => { const l = listeners[evt]; if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c, d, e); };

// ---- Colour helpers (sRGB hex -> linear THREE.Color) ----------------------
D.lin = function (hex) { return new THREE.Color(hex).convertSRGBToLinear(); };
D.hexToRgb = function (hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; };

// ---- Grid helpers ----------------------------------------------------------
// vertex index for grid coords (clamped)
D.vi = (i, j) => (j < 0 ? 0 : j > D.N ? D.N : j) * D.VN + (i < 0 ? 0 : i > D.N ? D.N : i);
D.inMap = (x, z) => x >= 0 && z >= 0 && x <= D.SIZE && z <= D.SIZE;

// ---- Toast ---------------------------------------------------------------
D.toast = function (msg, kind, ms) {
  const box = document.getElementById('toast');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = msg;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, ms || 2600);
};

// ---- Viewport hint --------------------------------------------------------
let hintTimer = 0;
D.hint = function (html, ms) {
  const el = document.getElementById('vp-hint');
  if (!el) return;
  if (!html) { el.classList.remove('show'); return; }
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(hintTimer);
  if (ms !== 0) hintTimer = setTimeout(() => el.classList.remove('show'), ms || 3500);
};

// ---- Fast partial GPU texture upload ---------------------------------------
// three r137 only knows whole-texture uploads; for big DataTextures that change in
// small rectangles (heights, zones) we call texSubImage2D ourselves. Falls back to
// a full upload the first time (before the GL texture exists).
D.subUpload = function (renderer, tex, x, y, w, h) {
  const props = renderer.properties.get(tex);
  const glTex = props && props.__webglTexture;
  if (!glTex || tex.version === 0 || props.__version !== tex.version) { tex.needsUpdate = true; return; }
  const gl = renderer.getContext();
  const img = tex.image;
  const state = renderer.state;
  state.activeTexture(gl.TEXTURE0);
  state.bindTexture(gl.TEXTURE_2D, glTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, img.width);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
  const fmt = tex.format === THREE.RedFormat ? gl.RED : tex.format === THREE.RGFormat ? gl.RG : gl.RGBA;
  const typ = tex.type === THREE.FloatType ? gl.FLOAT : gl.UNSIGNED_BYTE;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, fmt, typ, img.data);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
};

// ---- Minimal binary heap (priority queue on float keys) ---------------------
D.Heap = class {
  constructor(cap) { this.k = new Float32Array(cap || 1024); this.v = new Int32Array(cap || 1024); this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) {
      const k2 = new Float32Array(this.k.length * 2), v2 = new Int32Array(this.k.length * 2);
      k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2;
    }
    let i = this.n++;
    const K = this.k, Vv = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; Vv[i] = Vv[p]; i = p; }
    K[i] = key; Vv[i] = val;
  }
  pop() { // returns value; key in this.lastKey
    const K = this.k, Vv = this.v;
    const top = Vv[0]; this.lastKey = K[0];
    const key = K[--this.n], val = Vv[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && K[c + 1] < K[c]) c++;
      if (K[c] >= key) break;
      K[i] = K[c]; Vv[i] = Vv[c]; i = c;
    }
    K[i] = key; Vv[i] = val;
    return top;
  }
};

// ---- Quality settings --------------------------------------------------------
D.Q = {
  level: 'high',
  get high() { return this.level === 'high'; }
};

// ---- Geometry helpers ------------------------------------------------------
// Merge an array of BufferGeometries (non-indexed or indexed) into one; keeps
// position / normal / color and any extra float attributes they all share.
D.mergeGeos = function (geos) {
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  const names = Object.keys(parts[0].attributes).filter(n => parts.every(p => p.attributes[n]));
  let count = 0; parts.forEach(p => count += p.attributes.position.count);
  const out = new THREE.BufferGeometry();
  names.forEach(n => {
    const isz = parts[0].attributes[n].itemSize;
    const arr = new Float32Array(count * isz);
    let off = 0;
    parts.forEach(p => { arr.set(p.attributes[n].array, off); off += p.attributes[n].array.length; });
    out.setAttribute(n, new THREE.BufferAttribute(arr, isz));
  });
  return out;
};
// Paint a flat colour (and an optional float "tag" attribute) onto a geometry.
D.colorGeo = function (g, hex, tagName, tagVal) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (tagName) g.setAttribute(tagName, new THREE.BufferAttribute(new Float32Array(n).fill(tagVal), 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
};

// Small shared GLSL helpers injected into several shaders
D.GLSL_NOISE = `
float d_hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float d_vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(d_hash12(i), d_hash12(i+vec2(1.0,0.0)), u.x), mix(d_hash12(i+vec2(0.0,1.0)), d_hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float d_fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a * d_vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;
})();
