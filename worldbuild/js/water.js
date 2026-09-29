/* Diorama — water: sea level, lakes (fill basins to the rim), rivers (carve beds,
   flow downhill, become waterfalls over drops) and waterfall mist. */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE, CHUNK, NCH, V } = D;
const W = D.W;
W.lakes = [];
W.rivers = [];

const Water = D.Water = {};
let nextId = 1;

// ---- Shared water shader (sea + lakes) ---------------------------------------
const WU = {
  uH: { value: null }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
  uSky: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() },
  uFogCol: { value: new THREE.Color() }, uFogD: { value: 0 }, uNight: { value: 0 }, uSea: { value: 0 },
  uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uChop: { value: 1 }, uSlab: { value: 0 },
  uSnow: { value: 0 },
  // border uniforms are the terrain's own objects (shared, not copies)
  uEdge: D.TU.uEdge, uEdgeCfg: D.TU.uEdgeCfg
};
Water.U = WU;
const WATER_COMMON = `
uniform sampler2D uH; uniform float uTime; uniform vec3 uSunDir, uSunCol, uSky, uHor, uCam, uFogCol, uShallow, uDeep;
uniform float uFogD, uNight, uSea, uChop, uSlab, uSnow;
${D.GLSL_NOISE}
${D.GLSL_EDGE || ''}
float groundH(vec2 xz){
  vec2 g = clamp(xz / ${CELL.toFixed(1)}, vec2(0.0), vec2(${N.toFixed(1)}));
  ivec2 i = min(ivec2(floor(g)), ivec2(${N - 1}));
  vec2 f = g - vec2(i);
  float a = texelFetch(uH, i, 0).r, b = texelFetch(uH, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uH, i + ivec2(0, 1), 0).r, d = texelFetch(uH, i + ivec2(1, 1), 0).r;
  float h = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  vec2 cl = clamp(xz, vec2(0.0), vec2(${SIZE.toFixed(1)}));
  float dOut = length(xz - cl);
  return mix(h, min(h, uSea - 90.0), smoothstep(0.0, 5200.0, dOut));
}
vec2 waveGrad(vec2 p, float t){
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * 0.070 * cos(dot(p, vec2(0.8, 0.6)) * 0.070 + t * 1.10);
  g += vec2(-0.5, 0.86) * 0.110 * cos(dot(p, vec2(-0.5, 0.86)) * 0.110 + t * 1.45) * 0.8;
  g += vec2(0.95, -0.3) * 0.210 * cos(dot(p, vec2(0.95, -0.3)) * 0.210 + t * 2.0) * 0.5;
  g += vec2(0.2, 0.98) * 0.370 * cos(dot(p, vec2(0.2, 0.98)) * 0.370 + t * 2.7) * 0.3;
  float e = 0.6;
  vec2 q = p * 0.22 + vec2(t * 0.35, t * 0.21);
  float n0 = d_vnoise(q), nx = d_vnoise(q + vec2(e * 0.22, 0.0)), nz = d_vnoise(q + vec2(0.0, e * 0.22));
  g += vec2(nx - n0, nz - n0) / e * 0.9;
  return g;
}
vec4 shadeWater(vec3 wp, float depth, float flowFoam){
  // border terms first: fwidth only in uniform control flow
  float sd = edgeSD(wp.xz), epx = max(fwidth(sd), 1e-3), epr = max(fwidth(edgeRun(wp.xz)), 1e-3);
  vec3 v = normalize(uCam - wp);
  float dist = length(uCam - wp);
  float amp = uChop * (1.0 - smoothstep(250.0, 3500.0, dist)) * 0.9 + 0.08;
  vec2 g = waveGrad(wp.xz, uTime);
  vec3 n = normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 refl = mix(uHor, uSky, clamp(r.y * 1.6, 0.0, 1.0));
  float dk = 1.0 - exp(-depth * 0.085);
  vec3 body = mix(uShallow, uDeep, dk);
  body *= 0.12 + 0.88 * (1.0 - uNight);
  vec3 col = mix(body, refl, clamp(fres * 0.85, 0.0, 0.9));
  vec3 hv = normalize(uSunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 220.0) * 4.0 + pow(max(dot(n, hv), 0.0), 30.0) * 0.12;
  spec *= 1.0 - 0.6 * smoothstep(0.0, 600.0, sd) * uEdge.x;
  col += uSunCol * spec * step(0.0, uSunDir.y + 0.05);
  // shoreline foam
  float fn = d_vnoise(wp.xz * 0.35 + vec2(uTime * 0.4, -uTime * 0.3)) * 0.6 + d_vnoise(wp.xz * 1.1 - uTime * 0.5) * 0.4;
  float band = 1.0 - smoothstep(0.0, 1.4 + fn * 1.6, depth);
  float lap = 0.5 + 0.5 * sin(depth * 3.5 - uTime * 2.2 + fn * 4.0);
  float foam = clamp(band * (0.55 + 0.45 * lap) * smoothstep(0.35, 0.6, fn + band * 0.4) + flowFoam, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.95, 0.97) * (0.12 + 0.88 * (1.0 - uNight)), foam * 0.85);
  float alpha = mix(0.25, 0.97, smoothstep(0.0, 6.0, depth));
  alpha = max(alpha, fres * 0.8);
  alpha *= smoothstep(0.0, 0.35, depth);
  alpha = max(alpha, foam * 0.9 * step(0.02, depth));
  float eBand; vec3 eEmis;
  col = edgeApply(col, wp.xz, sd, epx, epr, uNight, 1.0, eBand, eEmis);
  col += eEmis;
  alpha = max(alpha, eBand);
  float fog = 1.0 - exp(-pow(dist * uFogD, 2.0));
  col = mix(col, uFogCol, fog);
  return vec4(col, alpha);
}
`;

function makeWaterMat() {
  return new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vWP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: WATER_COMMON + `varying vec3 vWP;
      void main(){
        float depth = vWP.y - groundH(vWP.xz);
        if (depth < -0.5) discard;
        gl_FragColor = shadeWater(vWP, max(depth, 0.0), 0.0);
      }`
  });
}

function makeRiverMat() {
  const u = Object.assign({}, WU);
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    vertexShader: `attribute float flow; varying vec3 vWP; varying vec2 vUv; varying float vFlow;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vUv = uv; vFlow = flow; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: WATER_COMMON + `varying vec3 vWP; varying vec2 vUv; varying float vFlow;
      void main(){
        float depth = vWP.y - groundH(vWP.xz);
        float across = abs(vUv.x - 0.5) * 2.0;
        float streak = d_vnoise(vec2(vUv.x * 7.0, vUv.y * 0.06 - uTime * (1.0 + vFlow * 6.0)));
        float streak2 = d_vnoise(vec2(vUv.x * 19.0, vUv.y * 0.2 - uTime * (2.2 + vFlow * 9.0)));
        float ff = smoothstep(0.62, 0.9, streak * 0.6 + streak2 * 0.4) * 0.35 + smoothstep(0.08, 0.35, vFlow) * (0.55 + 0.45 * streak2);
        vec4 c = shadeWater(vWP, max(depth, 0.0) + (1.0 - across) * 2.5, ff);
        c.a *= 1.0 - smoothstep(0.8, 1.0, across);
        if (depth < -0.3) c.a *= 0.0;
        gl_FragColor = c;
      }`
  });
}

// ---- Init ---------------------------------------------------------------------
Water.init = function (scene, renderer) {
  Water.scene = scene;
  WU.uH.value = D.Terrain.hTex;
  Water.mat = makeWaterMat();
  Water.riverMat = makeRiverMat();
  // Sea
  const sg = new THREE.PlaneGeometry(1, 1);
  sg.rotateX(-Math.PI / 2);
  Water.sea = new THREE.Mesh(sg, Water.mat);
  Water.sea.renderOrder = 2;
  Water.sea.frustumCulled = false;
  scene.add(Water.sea);
  Water.setSeaMesh();
  Water.lakeGroup = new THREE.Group(); scene.add(Water.lakeGroup);
  Water.riverGroup = new THREE.Group(); scene.add(Water.riverGroup);
  Water.lakeMeshes = new Array(NCH * NCH).fill(null);
  buildMist(scene);

  D.History.regObj('sea', { save: () => W.seaLevel, load: v => Water.setSeaLevel(v, true) });
  D.History.regObj('lakes', { save: () => W.lakes.map(l => Object.assign({}, l)), load: v => { W.lakes = v.map(l => Object.assign({}, l)); Water.recomputeLakes(); } });
  D.History.regObj('rivers', { save: () => W.rivers.slice(), load: v => { W.rivers = v.slice(); Water.rebuildRivers(); } });
  D.on('restored', () => { if (W.lakes.length) Water.recomputeLakes(); });
  D.on('stroke:end', rect => { if (W.lakes.length) Water.recomputeLakes(); });
  D.on('edgemode', () => Water.setSeaMesh());
  D.on('world:reset', () => { W.lakes = []; W.rivers = []; W.water.fill(-1e9); Water.rebuildLakeMeshes(); Water.rebuildRivers(); });
};

Water.setSeaMesh = function () {
  const slab = D.Terrain.edgeMode === 'slab';
  const s = slab ? SIZE : 240000;
  Water.sea.scale.set(s, 1, s);
  Water.sea.position.set(SIZE / 2, W.seaLevel, SIZE / 2);
  WU.uSlab.value = slab ? 1 : 0;
};

Water.setSeaLevel = function (y, silent) {
  W.seaLevel = D.clamp(y, -300, 1500);
  Water.sea.position.y = W.seaLevel;
  D.TU.uSea.value = W.seaLevel;
  WU.uSea.value = W.seaLevel;
  if (D.Terrain.edgeMode === 'slab') D.Terrain.outerDirty = true;
  else D.Terrain.outerDirty = true;
  if (W.lakes.length) Water.recomputeLakes();
  D.emit('sea', W.seaLevel);
};

// ---- Lakes ------------------------------------------------------------------
const stamp = new Uint32Array(V);
const parent = new Int32Array(V);
let gen = 1;
const NB4 = [1, -1, VN, -VN];
const NB8 = [1, -1, VN, -VN, VN + 1, VN - 1, -VN + 1, -VN - 1];

function descend(k) { // slide to the local minimum
  const h = W.h;
  for (let s = 0; s < 4000; s++) {
    let best = k, bh = h[k];
    const i = k % VN, j = (k / VN) | 0;
    for (let n = 0; n < 8; n++) {
      const q = k + NB8[n];
      const qi = q % VN, qj = (q / VN) | 0;
      if (q < 0 || q >= V || Math.abs(qi - i) > 1 || Math.abs(qj - j) > 1) continue;
      if (h[q] < bh) { bh = h[q]; best = q; }
    }
    if (best === k) return k;
    k = best;
  }
  return k;
}

// Minimax priority flood from a pit: the lake level is the lowest possible "highest
// point" on any path from the pit to an outlet (the sea or the map edge). Ties are
// broken toward lower ground so the search runs quickly downhill once over the rim.
const wl = new Float32Array(V);
function flood(start, maxCells) {
  const h = W.h, sea = W.seaLevel;
  gen++; if (gen > 4e9) { stamp.fill(0); gen = 1; }
  const heap = new D.Heap(4096);
  wl[start] = h[start]; stamp[start] = gen;
  heap.push(h[start], start);
  let level = h[start], visited = 0, big = false, edge = false;
  while (heap.n) {
    const c = heap.pop();
    const i = c % VN, j = (c / VN) | 0;
    if (h[c] <= sea || i === 0 || j === 0 || i === N || j === N) { level = wl[c]; edge = h[c] > sea; break; }
    if (++visited > maxCells) { big = true; level = wl[c]; break; }
    const wc = wl[c];
    for (let n = 0; n < 4; n++) {
      const q = c + NB4[n];
      if (stamp[q] === gen) continue;
      stamp[q] = gen;
      const w = h[q] > wc ? h[q] : wc;
      wl[q] = w;
      heap.push(w - (w - h[q]) * 1e-4, q);
    }
  }
  // the lake: cells connected to the pit that sit below the level
  const cells = [];
  if (!big && level - h[start] > 0.05) {
    gen++;
    const q = [start]; stamp[start] = gen;
    while (q.length) {
      const c = q.pop();
      cells.push(c);
      if (cells.length > maxCells) { big = true; break; }
      for (let n = 0; n < 4; n++) {
        const d = c + NB4[n];
        if (d < 0 || d >= V || stamp[d] === gen) continue;
        stamp[d] = gen;
        if (h[d] < level - 0.02) q.push(d);
      }
    }
  }
  return { level, cells, big, edge };
}

Water.addLake = function (x, z) {
  const i = D.clamp(Math.round(x / CELL), 1, N - 1), j = D.clamp(Math.round(z / CELL), 1, N - 1);
  const pit = descend(j * VN + i);
  const pi = pit % VN, pj = (pit / VN) | 0;
  if (W.h[pit] <= W.seaLevel) { D.toast('That spot is already under the sea.', 'warn'); return false; }
  const f = flood(pit, 700000);
  if (f.big) { D.toast('That basin is enormous. Try the sea level slider instead.', 'warn'); return false; }
  const depth = f.level - W.h[pit];
  if (depth < 0.6) { D.toast('No basin here. Dig a hollow first (Lower tool), then fill it.', 'warn'); return false; }
  if (W.lakes.some(l => Math.abs(l.i - pi) + Math.abs(l.j - pj) < 2)) { D.toast('There is already a lake there.'); return false; }
  D.History.begin('Fill Lake', 'lake');
  D.History.touchObj('lakes');
  W.lakes.push({ id: nextId++, i: pi, j: pj, level: f.level });
  Water.recomputeLakes();
  D.History.end();
  const lake = W.lakes[W.lakes.length - 1];
  D.toast(`Lake filled: ${(lake.area / 1e6).toFixed(2)} km², ${depth.toFixed(0)} m deep`);
  return true;
};

Water.recomputeLakes = function () {
  const water = W.water, h = W.h;
  water.fill(-1e9);
  for (const l of W.lakes) {
    let pit = l.j * VN + l.i;
    pit = descend(pit);
    const f = flood(pit, 700000);
    l.level = f.level; l.area = 0; l.dup = water[pit] >= f.level - 0.01;
    if (f.big || l.dup || f.level - h[pit] < 0.3) continue;
    let i0 = N, j0 = N, i1 = 0, j1 = 0, cnt = 0;
    for (const c of f.cells) {
      if (water[c] < f.level) water[c] = f.level;
      const ci = c % VN, cj = (c / VN) | 0;
      if (ci < i0) i0 = ci; if (ci > i1) i1 = ci; if (cj < j0) j0 = cj; if (cj > j1) j1 = cj;
      cnt++;
    }
    l.area = cnt * CELL * CELL;
    l.bbox = [i0, j0, i1, j1];
  }
  Water.rebuildLakeMeshes();
  D.emit('lakes');
};

Water.rebuildLakeMeshes = function () {
  const water = W.water, h = W.h, sea = W.seaLevel;
  for (let ci = 0; ci < NCH * NCH; ci++) {
    const cx = ci % NCH, cz = (ci / NCH) | 0;
    const old = Water.lakeMeshes[ci];
    if (old) { Water.lakeGroup.remove(old); old.geometry.dispose(); Water.lakeMeshes[ci] = null; }
    const i0 = cx * CHUNK, j0 = cz * CHUNK;
    let any = false;
    for (let j = j0; j <= j0 + CHUNK && !any; j++) for (let i = i0; i <= i0 + CHUNK; i++) if (water[j * VN + i] > sea) { any = true; break; }
    if (!any) continue;
    const pos = [], idx = [];
    const vmap = new Int32Array((CHUNK + 1) * (CHUNK + 1)).fill(-1);
    const wl = (i, j) => {
      const k = j * VN + i;
      if (water[k] > -1e8) return water[k];
      let m = -1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const w = water[jj * VN + ii]; if (w > m) m = w;
      }
      return m;
    };
    const vert = (li, lj) => {
      const key = lj * (CHUNK + 1) + li;
      if (vmap[key] >= 0) return vmap[key];
      const gi = i0 + li, gj = j0 + lj;
      pos.push(gi * CELL, wl(gi, gj), gj * CELL);
      return (vmap[key] = pos.length / 3 - 1);
    };
    for (let lj = 0; lj < CHUNK; lj++) for (let li = 0; li < CHUNK; li++) {
      const gi = i0 + li, gj = j0 + lj;
      const k = gj * VN + gi;
      if (water[k] > sea || water[k + 1] > sea || water[k + VN] > sea || water[k + VN + 1] > sea) {
        const a = vert(li, lj), b = vert(li + 1, lj), c = vert(li, lj + 1), d = vert(li + 1, lj + 1);
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, Water.mat);
    m.renderOrder = 2;
    Water.lakeGroup.add(m);
    Water.lakeMeshes[ci] = m;
  }
};

Water.lakeAt = function (x, z) {
  const i = D.clamp(Math.round(x / CELL), 0, N), j = D.clamp(Math.round(z / CELL), 0, N);
  const w = W.water[j * VN + i];
  if (w < -1e8) return null;
  let best = null, bd = 1e18;
  for (const l of W.lakes) {
    if (Math.abs(l.level - w) > 0.01) continue;
    const d = (l.i - i) ** 2 + (l.j - j) ** 2;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
};
Water.removeLake = function (lake) {
  D.History.begin('Drain Lake', 'lake');
  D.History.touchObj('lakes');
  W.lakes = W.lakes.filter(l => l !== lake);
  Water.recomputeLakes();
  D.History.end();
};

// ---- Rivers -------------------------------------------------------------------
// A river is stored as resampled samples s = [x, z, surface, width, ...] so meshes can
// be rebuilt on undo without re-carving.
const SPACING = 8;

function resample(pts, spacing) {
  const out = [];
  if (pts.length < 2) return pts.slice();
  let carry = 0;
  out.push(pts[0].slice());
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
    const L = Math.hypot(bx - ax, bz - az);
    let d = spacing - carry;
    while (d <= L) { const t = d / L; out.push([ax + (bx - ax) * t, az + (bz - az) * t]); d += spacing; }
    carry = L - (d - spacing);
  }
  const last = pts[pts.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > spacing * 0.3) out.push(last.slice());
  return out;
}
function chaikin(pts, it) {
  for (let n = 0; n < it; n++) {
    const o = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      o.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    o.push(pts[pts.length - 1]);
    pts = o;
  }
  return pts;
}
// Catmull-Rom through user clicks
Water.smoothPath = function (pts) {
  if (pts.length < 3) return pts;
  const out = [];
  const P = (k) => pts[D.clamp(k, 0, pts.length - 1)];
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    const seg = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 12));
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

// Build a river from a polyline of [x,z] points: carve, store, mesh.
// opts: { width, widthEnd, depth, history:true }
Water.makeRiver = function (pts, opts) {
  opts = opts || {};
  const samples = resample(pts, SPACING);
  if (samples.length < 4) return null;
  const n = samples.length;
  const w0 = opts.width || 24, w1 = opts.widthEnd || w0;
  const depth = opts.depth || 3.2;
  const sea = W.seaLevel;
  // ground along the path: minimum across the channel width for a stable surface
  const g = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const [x, z] = samples[k];
    g[k] = D.Terrain.hAt(x, z);
  }
  // light smoothing of ground profile
  const gs = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0, c = 0;
    for (let q = -3; q <= 3; q++) { const kk = D.clamp(k + q, 0, n - 1); s += g[kk]; c++; }
    gs[k] = Math.min(g[k], s / c);
  }
  const surf = new Float32Array(n);
  const taperK = new Float32Array(n);
  let along = 0;
  for (let k = 0; k < n; k++) {
    if (k) along += Math.hypot(samples[k][0] - samples[k - 1][0], samples[k][1] - samples[k - 1][1]);
    taperK[k] = opts.taperStart ? Math.max(0.12, D.smooth(0, opts.taperStart, along)) : 1;
  }
  const drop = 1.3;
  surf[0] = gs[0] - (0.3 + 1.0 * taperK[0]);
  for (let k = 1; k < n; k++) surf[k] = Math.min(surf[k - 1] - 0.004, gs[k] - (0.3 + 1.0 * taperK[k]));
  for (let k = 0; k < n; k++) if (surf[k] < sea - 0.4) surf[k] = sea - 0.4;
  // widths
  const width = new Float32Array(n);
  for (let k = 0; k < n; k++) width[k] = D.lerp(w0, w1, k / (n - 1));

  // carve
  const h = W.h;
  const rec = opts.history !== false && D.History.active();
  const bankW = 14;
  const target = new Map();
  for (let k = 0; k < n - 1; k++) {
    const [ax, az] = samples[k], [bx, bz] = samples[k + 1];
    const hw = Math.max(width[k], width[k + 1]) / 2 + bankW;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw) / CELL)), i1 = Math.min(N, Math.ceil((Math.max(ax, bx) + hw) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - hw) / CELL)), j1 = Math.min(N, Math.ceil((Math.max(az, bz) + hw) / CELL));
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = i * CELL, pz = j * CELL;
      let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = D.clamp(t, 0, 1);
      const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
      const wv = D.lerp(width[k], width[k + 1], t) / 2;
      if (d > wv + bankW) continue;
      const s = D.lerp(surf[k], surf[k + 1], t);
      const bed = s - depth * (0.7 + 0.3 * Math.min(1, wv / 20)) * D.lerp(taperK[k], taperK[k + 1], t);
      const key = j * VN + i;
      let tv;
      if (d < wv * 0.72) tv = { lo: bed + (d / (wv * 0.72)) * depth * 0.25, levee: 0 };
      else if (d < wv) tv = { lo: D.lerp(bed + depth * 0.25, s - 0.25, (d - wv * 0.72) / (wv * 0.28)), levee: 0 };
      else { const u = (d - wv) / bankW; tv = { lo: s + 0.4 + u * u * 30, levee: s + 0.55, lw: 1 - u }; }
      const prev = target.get(key);
      if (!prev || tv.lo < prev.lo) target.set(key, tv);
    }
  }
  let bi0 = N, bj0 = N, bi1 = 0, bj1 = 0;
  target.forEach((tv, key) => { const i = key % VN, j = (key / VN) | 0; if (i < bi0) bi0 = i; if (i > bi1) bi1 = i; if (j < bj0) bj0 = j; if (j > bj1) bj1 = j; });
  if (rec) D.History.touch('h', bi0, bj0, bi1, bj1);
  target.forEach((tv, key) => {
    let y = h[key];
    if (y > tv.lo) y = tv.lo;
    if (tv.levee && y < tv.levee) y = D.lerp(y, tv.levee, tv.lw);
    h[key] = y;
  });
  D.Terrain.markH(bi0, bj0, bi1, bj1);
  const s = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) { s[k * 4] = samples[k][0]; s[k * 4 + 1] = samples[k][1]; s[k * 4 + 2] = surf[k]; s[k * 4 + 3] = width[k]; }
  const river = { id: nextId++, s, name: opts.name || '' };
  return river;
};

Water.addRiver = function (pts, opts) {
  D.History.begin(opts && opts.label || 'Paint River', 'river');
  D.History.touchObj('rivers');
  const r = Water.makeRiver(pts, opts);
  if (r) { W.rivers = W.rivers.concat([r]); Water.rebuildRivers(); }
  D.History.end();
  D.emit('stroke:end');
  return r;
};

// ---- Hydrology: depression-filled surface (priority flood from sea + edges) -----------
// Every cell of F drains to an outlet by strictly-descending steps, so traced rivers
// can never loop. Depressions (F - h > 0) are where lakes would naturally form.
Water._F = null;
function fillDEM() {
  if (Water._F && Water._Fsea === W.seaLevel) return Water._F;
  const h = W.h, sea = W.seaLevel;
  const F = new Float32Array(V);
  const done = new Uint8Array(V);
  const heap = new D.Heap(1 << 18);
  for (let k = 0; k < V; k++) {
    const i = k % VN, j = (k / VN) | 0;
    if (h[k] <= sea || i === 0 || j === 0 || i === N || j === N) { F[k] = Math.max(h[k], Math.min(h[k], sea)); done[k] = 1; heap.push(F[k], k); }
  }
  while (heap.n) {
    const c = heap.pop();
    const fc = F[c];
    for (let n = 0; n < 4; n++) {
      const q = c + NB4[n];
      if (q < 0 || q >= V || done[q]) continue;
      done[q] = 1;
      F[q] = Math.max(h[q], fc + 0.002);
      heap.push(F[q], q);
    }
  }
  Water._F = F; Water._Fsea = sea;
  return F;
}
D.on && D.on('terrain:h', () => { Water._F = null; });

// Trace downhill from a spring. Returns {paths: [[x,z]...][], lakes: [[i,j]...], ended, seen}
Water.trace = function (x, z, maxSteps, stopSet) {
  const h = W.h, sea = W.seaLevel;
  const F = fillDEM();
  let k = D.clamp(Math.round(z / CELL), 1, N - 1) * VN + D.clamp(Math.round(x / CELL), 1, N - 1);
  const paths = [[]], lakes = [];
  let cur = paths[0];
  const seen = new Set();
  let ended = 'length';
  let inLake = false, lakeDeep = -1, lakeDepth = 0, buf = [];
  const basinSize = (k0) => { // cells in the depression around k0 (capped)
    const q = [k0], vis = new Set([k0]);
    while (q.length && vis.size < 1500) {
      const c = q.pop();
      for (let n = 0; n < 4; n++) { const d = c + NB4[n]; if (!vis.has(d) && F[d] - h[d] > 0.8) { vis.add(d); q.push(d); } }
    }
    return vis.size;
  };
  for (let step = 0; step < (maxSteps || 8000); step++) {
    const i = k % VN, j = (k / VN) | 0;
    seen.add(k);
    const depth = F[k] - h[k];
    if (depth > 2.5 || (inLake && depth > 0.25)) {
      if (!inLake) { inLake = true; lakeDeep = k; lakeDepth = depth; buf = []; }
      else if (depth > lakeDepth) { lakeDeep = k; lakeDepth = depth; }
      buf.push([i * CELL, j * CELL]);
    } else {
      if (inLake) {
        inLake = false;
        if (lakeDepth > 4 && lakes.length < 6 && basinSize(lakeDeep) >= 20) { lakes.push([lakeDeep % VN, (lakeDeep / VN) | 0]); cur = []; paths.push(cur); }
        else for (const b of buf) cur.push(b);
        buf = [];
      }
      cur.push([i * CELL, j * CELL]);
    }
    if (h[k] <= sea + 0.2) { ended = 'sea'; break; }
    if (i <= 0 || j <= 0 || i >= N || j >= N) { ended = 'edge'; break; }
    if (stopSet && stopSet.has(k) && step > 0) { ended = 'join'; break; }
    let best = -1, bf = F[k];
    for (let n = 0; n < 8; n++) {
      const q = k + NB8[n];
      const fq = F[q] + (n >= 4 ? 0.0004 : 0);
      if (fq < bf) { bf = fq; best = q; }
    }
    if (best < 0) { ended = 'stuck'; break; }
    k = best;
  }
  return { paths: paths.filter(p => p.length > 1), lakes, ended, seen };
};

Water.autoRiver = function (x, z, opts) {
  opts = opts || {};
  const tr = Water.trace(x, z, 6000);
  const total = tr.paths.reduce((s, p) => s + p.length, 0);
  if (total < 12) { D.toast('Water from here pools immediately. Pick a spot higher up a slope.', 'warn'); return false; }
  const own = opts.history !== false;
  if (own) { D.History.begin('Spring River', 'river'); D.History.touchObj('rivers'); D.History.touchObj('lakes'); }
  const w = opts.width || 22;
  let made = 0, walked = 0;
  for (const p of tr.paths) {
    const sm = chaikin(p, 3);
    const t0 = walked / total, t1 = (walked + p.length) / total;
    walked += p.length;
    const r = Water.makeRiver(sm, { width: w * (0.45 + 0.55 * t0), widthEnd: w * (0.45 + 0.9 * t1), depth: opts.depth || 3, history: own, taperStart: p !== tr.paths[0] ? 60 : 0 });
    if (r) { W.rivers.push(r); made++; }
  }
  for (const [i, j] of tr.lakes) if (!W.lakes.some(l => Math.abs(l.i - i) + Math.abs(l.j - j) < 3)) W.lakes.push({ id: nextId++, i, j, level: 0 });
  Water.rebuildRivers();
  if (tr.lakes.length) Water.recomputeLakes();
  if (own) { D.History.end(); D.emit('stroke:end'); }
  if (!opts.silent) D.toast(made ? `River traced ${(total * CELL / 1000).toFixed(1)} km to the ${tr.ended === 'sea' ? 'sea' : tr.ended === 'edge' ? 'map edge' : 'lowlands'}${tr.lakes.length ? `, filling ${tr.lakes.length} lake${tr.lakes.length > 1 ? 's' : ''}` : ''}` : 'Could not trace a river from there.');
  return made > 0;
};

Water.generateRivers = function (seed, style) {
  const count = { continental: 5, island: 3, archipelago: 2, alpine: 5, plains: 3, mesas: 2, volcanic: 3 }[style] || 3;
  const r = D.rng(seed + 31337);
  const h = W.h, sea = W.seaLevel;
  let maxH = -1e9; for (let k = 0; k < V; k += 13) if (h[k] > maxH) maxH = h[k];
  if (maxH < sea + 40) return;
  const taken = new Set();
  let made = 0;
  for (let tries = 0; tries < 400 && made < count; tries++) {
    const i = 40 + Math.floor(r() * (N - 80)), j = 40 + Math.floor(r() * (N - 80));
    const y = h[j * VN + i];
    if (y < sea + (maxH - sea) * 0.35) continue;
    const tr = Water.trace(i * CELL, j * CELL, 6000, taken);
    const total = tr.paths.reduce((s, p) => s + p.length, 0);
    if (total < 110 || (tr.ended !== 'sea' && tr.ended !== 'edge' && tr.ended !== 'join')) continue;
    const w = 18 + r() * 16;
    let walked = 0;
    for (const p of tr.paths) {
      const sm = chaikin(p, 3);
      const t0 = walked / total, t1 = (walked + p.length) / total; walked += p.length;
      const rv = Water.makeRiver(sm, { width: w * (0.4 + 0.6 * t0), widthEnd: w * (0.4 + t1), depth: 3, history: false, taperStart: p !== tr.paths[0] ? 60 : 0 });
      if (rv) W.rivers.push(rv);
    }
    tr.seen.forEach(k => taken.add(k));
    for (const [li, lj] of tr.lakes) W.lakes.push({ id: nextId++, i: li, j: lj, level: 0 });
    made++;
  }
  Water.rebuildRivers();
  if (W.lakes.length) { Water.recomputeLakes(); W.lakes = W.lakes.filter(l => l.area > 5000 && !l.dup); Water.recomputeLakes(); }
};

// Spatial hash for riverAt()
let rHash = new Map();
const RH = 256;
Water.rebuildRivers = function () {
  while (Water.riverGroup.children.length) { const m = Water.riverGroup.children.pop(); m.geometry.dispose(); }
  rHash = new Map();
  const falls = [];
  W.rivers.forEach((rv, ri) => {
    const s = rv.s, n = s.length / 4;
    const ACROSS = 6;
    const pos = new Float32Array(n * (ACROSS + 1) * 3), uv = new Float32Array(n * (ACROSS + 1) * 2), flow = new Float32Array(n * (ACROSS + 1));
    let along = 0;
    for (let k = 0; k < n; k++) {
      const x = s[k * 4], z = s[k * 4 + 1], y = s[k * 4 + 2], w = s[k * 4 + 3];
      const kp = Math.max(0, k - 1), kn = Math.min(n - 1, k + 1);
      let tx = s[kn * 4] - s[kp * 4], tz = s[kn * 4 + 1] - s[kp * 4 + 1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k > 0) along += Math.hypot(x - s[kp * 4], z - s[kp * 4 + 1]);
      const slope = k > 0 ? (s[kp * 4 + 2] - y) / Math.max(1, Math.hypot(x - s[kp * 4], z - s[kp * 4 + 1])) : 0;
      const slope2 = k < n - 1 ? (y - s[kn * 4 + 2]) / Math.max(1, Math.hypot(x - s[kn * 4], z - s[kn * 4 + 1])) : 0;
      const st = Math.max(slope, slope2);
      const hw = w / 2 + 4;
      for (let a = 0; a <= ACROSS; a++) {
        const f = a / ACROSS - 0.5;
        const o = (k * (ACROSS + 1) + a);
        pos[o * 3] = x - tz * hw * 2 * f; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z + tx * hw * 2 * f;
        uv[o * 2] = a / ACROSS; uv[o * 2 + 1] = along;
        flow[o] = D.clamp(st, 0, 1.5);
      }
      // hash
      if (k < n - 1) {
        const cx = Math.floor(x / RH), cz = Math.floor(z / RH);
        const key = cx + ',' + cz;
        let l = rHash.get(key); if (!l) rHash.set(key, l = []);
        l.push(ri, k);
      }
    }
    // waterfalls: steep runs that drop more than 10 m; mist gathers at the foot
    let runStart = -1;
    for (let k = 1; k < n; k++) {
      const d = Math.hypot(s[k * 4] - s[k * 4 - 4], s[k * 4 + 1] - s[k * 4 - 3]) || 1;
      const steep = (s[k * 4 - 2] - s[k * 4 + 2]) / d > 0.6;
      if (steep && runStart < 0) runStart = k - 1;
      if ((!steep || k === n - 1) && runStart >= 0) {
        const end = steep ? k : k - 1;
        if (s[runStart * 4 + 2] - s[end * 4 + 2] > 10) falls.push([s[end * 4], s[end * 4 + 2], s[end * 4 + 1], s[end * 4 + 3]]);
        runStart = -1;
      }
    }
    const idx = [];
    for (let k = 0; k < n - 1; k++) for (let a = 0; a < ACROSS; a++) {
      const p = k * (ACROSS + 1) + a, q = p + ACROSS + 1;
      idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('flow', new THREE.BufferAttribute(flow, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, Water.riverMat);
    m.renderOrder = 3;
    m.userData.river = rv;
    Water.riverGroup.add(m);
  });
  setMist(falls);
  D.emit('rivers');
};

Water.riverAt = function (x, z) {
  const cx = Math.floor(x / RH), cz = Math.floor(z / RH);
  let best = -1e9;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const l = rHash.get((cx + dx) + ',' + (cz + dz)); if (!l) continue;
    for (let q = 0; q < l.length; q += 2) {
      const rv = W.rivers[l[q]]; if (!rv) continue;
      const s = rv.s, k = l[q + 1];
      const ax = s[k * 4], az = s[k * 4 + 1], bx = s[k * 4 + 4], bz = s[k * 4 + 5];
      const ddx = bx - ax, ddz = bz - az, L2 = ddx * ddx + ddz * ddz || 1;
      const t = D.clamp(((x - ax) * ddx + (z - az) * ddz) / L2, 0, 1);
      const d = Math.hypot(x - ax - ddx * t, z - az - ddz * t);
      const w = D.lerp(s[k * 4 + 3], s[k * 4 + 7], t) / 2;
      if (d < w) { const y = D.lerp(s[k * 4 + 2], s[k * 4 + 6], t); if (y > best) best = y; }
    }
  }
  return best;
};
Water.riverNear = function (x, z, extra) {
  let best = null, bd = 1e9;
  W.rivers.forEach(rv => {
    const s = rv.s;
    for (let k = 0; k < s.length / 4; k += 2) {
      const d = Math.hypot(s[k * 4] - x, s[k * 4 + 1] - z) - s[k * 4 + 3] / 2;
      if (d < bd) { bd = d; best = rv; }
    }
  });
  return bd < (extra || 20) ? best : null;
};
Water.removeRiver = function (rv) {
  D.History.begin('Remove River', 'river');
  D.History.touchObj('rivers');
  W.rivers = W.rivers.filter(r => r !== rv);
  Water.rebuildRivers();
  D.History.end();
};

// ---- Waterfall mist -------------------------------------------------------------
function buildMist(scene) {
  Water.mistU = { uT: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 1 } };
  Water.mistMat = new THREE.ShaderMaterial({
    uniforms: Water.mistU, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 seed; uniform float uT; uniform float uScale; varying float vA;
      void main(){
        float life = fract(uT * (0.25 + seed.x * 0.2) + seed.y);
        vec3 p = position;
        float ang = seed.z * 6.2831;
        float r = life * (6.0 + seed.w * 14.0);
        p += vec3(cos(ang) * r, life * (10.0 + seed.w * 18.0), sin(ang) * r);
        vA = (1.0 - life) * smoothstep(0.0, 0.15, life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((260.0 + life * 500.0) * uScale / -mv.z, 1.0, 90.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(uCol, vA * 0.45 * (1.0 - d * 4.0)); }`
  });
  Water.mist = new THREE.Points(new THREE.BufferGeometry(), Water.mistMat);
  Water.mist.frustumCulled = false;
  scene.add(Water.mist);
}
function setMist(falls) {
  const per = 40;
  const pos = new Float32Array(falls.length * per * 3), seed = new Float32Array(falls.length * per * 4);
  const r = D.rng(5);
  falls.forEach((f, i) => {
    for (let k = 0; k < per; k++) {
      const o = i * per + k;
      pos[o * 3] = f[0] + (r() - 0.5) * f[3] * 0.6; pos[o * 3 + 1] = f[1]; pos[o * 3 + 2] = f[2] + (r() - 0.5) * f[3] * 0.6;
      seed[o * 4] = r(); seed[o * 4 + 1] = r(); seed[o * 4 + 2] = r(); seed[o * 4 + 3] = r();
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  Water.mist.geometry.dispose();
  Water.mist.geometry = g;
  Water.falls = falls;
}

// ---- Per-frame -------------------------------------------------------------------
Water.update = function (dt, camera) {
  const E = D.Env;
  WU.uTime.value = (Date.now() * 0.001) % 10000;
  WU.uSunDir.value.copy(E.lightDir);
  WU.uSunCol.value.copy(E.sunColor);
  WU.uSky.value.copy(E.sky);
  WU.uHor.value.copy(E.horizon);
  WU.uCam.value.copy(camera.position);
  WU.uFogCol.value.copy(E.fogColor);
  WU.uFogD.value = E.fogDensity;
  WU.uNight.value = E.night;
  WU.uSea.value = W.seaLevel;
  const storm = E.weather === 'storm' ? 1 : E.weather === 'rain' ? 0.5 : 0;
  WU.uChop.value = 0.8 + storm * 1.4 + E.wind * 0.4;
  const clim = W.climate;
  const shallow = [0x2f928c, 0x3f8088, 0x3fa296, 0x2fc6be][clim] || 0x2f928c;
  const deep = [0x0b3a5a, 0x10324a, 0x0c3a58, 0x0a3d6e][clim] || 0x0b3a5a;
  WU.uShallow.value.setHex(shallow).convertSRGBToLinear().lerp(new THREE.Color(0.08, 0.1, 0.12), storm * 0.5);
  WU.uDeep.value.setHex(deep).convertSRGBToLinear().lerp(new THREE.Color(0.02, 0.03, 0.04), storm * 0.5);
  Water.mistU.uT.value = WU.uTime.value;
  Water.mistU.uScale.value = D.Post ? D.Post.pixelRatio : 1;
  const l = 0.25 + 0.75 * E.day;
  Water.mistU.uCol.value.setRGB(l, l, l);
  const vis = D.Layers ? D.Layers.visible('water') : true;
  Water.sea.visible = vis; Water.lakeGroup.visible = vis; Water.riverGroup.visible = vis; Water.mist.visible = vis;
};
})();
