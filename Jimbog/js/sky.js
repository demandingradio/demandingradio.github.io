/*
 * Jimbog sky and backdrop (spec section 4). Plain script, three.js r137 global THREE.
 *
 *   var sky = JB.Sky.build({ sunDir, bounds, road, footpath, streetLights, houses, far });
 *   scene.add(sky.group);       // static: one mesh per material, a few dozen draw calls
 *   sky.update(dt, camera);     // each frame: the dome follows the camera, clouds drift
 *   sky.dispose();              // optional, when the map is unloaded
 *
 * sunDir points FROM the sky TO the ground. JB.Sky.HORIZON (raw hex, same convention as the
 * map env fog) is the colour of the sky at the horizon: use it as the fog colour so the
 * ground fades into the sky.
 */
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  // HORIZON is the map's fog colour. It is deliberately darker than the spec's #cfe2f0: that colour's
  // linear luminance (0.87) is over the bloom threshold (0.82), so bloom washed the horizon and the top of
  // the frame to white. This value stays under it (max channel 0.80). The map env must read it at level
  // start (JB.Sky.HORIZON), not at file load, because sky.js loads after maps.js.
  const HORIZON = 0xb3c7cc, ZENITH = 0x3f7fc4, GROUND = 0x7d8c76, SUN = 0xfff0d6;
  const TAU = Math.PI * 2;
  const UP = [0, 1, 0];

  // ---------------------------------------------------------------- helpers
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };
  // World-scaled UVs for flat faces: one texture tile = 2 m.
  function autoUV(p, n) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (ay >= ax && ay >= az) return [p[0] * 0.5, p[2] * 0.5];
    if (ax >= az) return [p[2] * 0.5, p[1] * 0.5];
    return [p[0] * 0.5, p[1] * 0.5];
  }

  // ---------------------------------------------------------------- textures
  // Repeating copies of the shared JB.Tex maps (the cached originals belong to other systems).
  let TEX = 256;
  const texCache = {};
  function texSet(name) {
    if (!JB.Tex || !JB.Tex.list || JB.Tex.list.indexOf(name) < 0) return null;
    const key = name + '@' + TEX;
    if (texCache[key] !== undefined) return texCache[key];
    let out = null;
    try {
      const src = JB.Tex.make(name, TEX);
      out = {};
      for (const k of ['map', 'normalMap', 'roughnessMap']) {
        if (!src[k]) continue;
        const t = src[k].clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.encoding = src[k].encoding;
        t.needsUpdate = true;
        out[k] = t;
      }
    } catch (e) { console.warn('Jimbog sky: texture ' + name + ' failed', e); out = null; }
    return (texCache[key] = out);
  }
  const hasTex = (name) => !!texSet(name);

  // Standard material: texture (tinted) when available, flat fallback colour otherwise.
  function stdMat(tex, o) {
    const t = tex ? texSet(tex) : null;
    const p = { roughness: o.r !== undefined ? o.r : 0.85, metalness: o.m || 0 };
    if (t) {
      p.map = t.map; p.normalMap = t.normalMap; p.roughnessMap = t.roughnessMap;
      p.color = new THREE.Color(o.tint !== undefined ? o.tint : 0xffffff);
      if (o.nb) p.normalScale = new THREE.Vector2(o.nb, o.nb);
    } else {
      p.color = new THREE.Color(o.fb !== undefined ? o.fb : 0x888888);
    }
    if (o.vc) p.vertexColors = true;
    if (o.poff) { p.polygonOffset = true; p.polygonOffsetFactor = -2; p.polygonOffsetUnits = -4; }
    return new THREE.MeshStandardMaterial(p);
  }
  function lambertMat(tex, o) {
    const t = tex ? texSet(tex) : null;
    const p = {};
    if (t) { p.map = t.map; p.color = new THREE.Color(0xffffff); } else p.color = new THREE.Color(o.fb);
    if (o.at) { p.alphaTest = o.at; }
    if (o.side) p.side = o.side;
    if (o.nofog) p.fog = false;
    return new THREE.MeshLambertMaterial(p);
  }

  function materials() {
    const M = {};
    M.grass = stdMat('grass', { fb: 0x7f9f5a, vc: true, nb: 0.5, r: 0.95 });
    // The lawn sits 3 cm under the map ground (y = 0). Push it back so the map ground wins
    // wherever the two overlap, at any distance, instead of z-fighting.
    M.grass.polygonOffset = true; M.grass.polygonOffsetFactor = 2; M.grass.polygonOffsetUnits = 4;
    M.asphalt = stdMat('asphalt', { fb: 0x3d4043, r: 0.9, poff: true });
    M.kerb = stdMat('court_grey', { tint: 0xd9d5cd, fb: 0xbcb8af, r: 0.8 });
    M.paving = stdMat('paving', { fb: 0xcbc5b6, r: 0.85 });
    M.paint = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    M.cream = stdMat('render_cream', { fb: 0xefe9da, r: 0.9 });
    M.brick = stdMat('brick_tan', { tint: 0x7f3f35, fb: 0x8e4a3c, r: 0.9 });       // red-brown brick
    M.plinth = stdMat('brick_dark', { fb: 0x8a6446, r: 0.9 });
    M.terra = stdMat('brick_dark', { tint: 0xe0806a, fb: 0xa65a3c, r: 0.8 });      // terracotta tiles
    M.colorbond = stdMat('roof_metal', { tint: 0x8e9ba6, fb: 0x6f7a84, r: 0.45, m: 0.3 });
    // Dark glass that does not turn into a bloomed sun glint (a near-mirror peaks far above the bloom threshold).
    M.glass = new THREE.MeshStandardMaterial({ color: 0x27343d, roughness: 0.42, metalness: 0 });
    M.frame = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.6 });
    M.door = new THREE.MeshStandardMaterial({ color: 0x3e4a51, roughness: 0.6 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xb4bbc1, roughness: 0.45, metalness: 0.5 });
    M.lamp = new THREE.MeshStandardMaterial({ color: 0x2c3237, roughness: 0.3 });
    M.bark = lambertMat('bark_gum', { fb: 0xd9d4c6 });
    M.leaf = lambertMat('leaves_gum', { fb: 0x6f8f5a, at: 0.5, side: THREE.DoubleSide });
    // Unlit and unfogged on purpose: a flat, distant silhouette. Lit by the 3.0 sun it blows out to white,
    // and fog would hide it entirely at this range.
    M.hill = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.58, 0.67, 0.70), side: THREE.DoubleSide, fog: false, toneMapped: false });
    return M;
  }

  // ---------------------------------------------------------------- geometry batch
  // Collects triangles per material key. Each key becomes one mesh.
  class Batch {
    constructor() { this.b = {}; this.tris = 0; }
    bucket(key, mat, cast) {
      this.b[key] = { key, mat, cast: !!cast, p: [], n: [], uv: [], c: [], i: [] };
    }
    count(k) { return this.b[k].p.length / 3; }
    vtx(k, p, n, uv, col) {
      const b = this.b[k];
      b.p.push(p[0], p[1], p[2]); b.n.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]);
      if (col !== undefined) b.c.push(col, col, col);
      return b.p.length / 3 - 1;
    }
    // Triangle from three vertex indices. Winding is fixed so the geometric normal agrees
    // with `want` (or with the averaged vertex normals when `want` is missing).
    tri(k, a, b2, c, want) {
      const b = this.b[k], P = b.p, N = b.n;
      const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
      const pb = [P[b2 * 3], P[b2 * 3 + 1], P[b2 * 3 + 2]];
      const pc = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
      const g = V.cross(V.sub(pb, pa), V.sub(pc, pa));
      if (V.dot(g, g) < 1e-14) return;
      const w = want || [N[a * 3] + N[b2 * 3] + N[c * 3], N[a * 3 + 1] + N[b2 * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b2 * 3 + 2] + N[c * 3 + 2]];
      if (V.dot(g, w) < 0) b.i.push(a, c, b2); else b.i.push(a, b2, c);
      this.tris++;
    }
    // Convex planar polygon (fan). With no `want`, the normal points away from `centre`.
    flat(k, pts, want, centre) {
      let n = want;
      if (!n) {
        n = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])));
        if (centre) {
          let cen = [0, 0, 0];
          for (const p of pts) cen = V.add(cen, p);
          cen = V.mul(cen, 1 / pts.length);
          if (V.dot(n, V.sub(cen, centre)) < 0) n = V.mul(n, -1);
        }
      }
      const idx = pts.map((p) => this.vtx(k, p, n, autoUV(p, n)));
      for (let j = 1; j + 1 < idx.length; j++) this.tri(k, idx[0], idx[j], idx[j + 1], n);
    }
    // Axis-aligned box. Faces to leave out are given as letters: t b e(+x) w(-x) s(+z) n(-z).
    box(k, x0, y0, z0, x1, y1, z1, skip) {
      skip = skip || '';
      if (skip.indexOf('t') < 0) this.flat(k, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
      if (skip.indexOf('b') < 0) this.flat(k, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
      if (skip.indexOf('e') < 0) this.flat(k, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
      if (skip.indexOf('w') < 0) this.flat(k, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
      if (skip.indexOf('s') < 0) this.flat(k, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      if (skip.indexOf('n') < 0) this.flat(k, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1]);
    }
    // Open tube from A to B with smooth normals; u wraps twice around, v = height / 2 m (bark streaks up).
    tube(k, A, B, r0, r1, segs) {
      const d = V.norm(V.sub(B, A));
      const h = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = V.norm(V.cross(d, h)), v = V.cross(d, u);
      const base = this.count(k);
      for (let j = 0; j <= segs; j++) {
        const t = j / segs * TAU, c = Math.cos(t), s = Math.sin(t);
        const n = [c * u[0] + s * v[0], c * u[1] + s * v[1], c * u[2] + s * v[2]];
        const pa = V.add(A, V.mul(n, r0)), pb = V.add(B, V.mul(n, r1));
        this.vtx(k, pa, n, [j / segs * 2, pa[1] * 0.5]);
        this.vtx(k, pb, n, [j / segs * 2, pb[1] * 0.5]);
      }
      for (let j = 0; j < segs; j++) {
        const a0 = base + 2 * j, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
        this.tri(k, a0, a1, b0);
        this.tri(k, a1, b1, b0);
      }
    }
    meshes() {
      const out = [];
      for (const key in this.b) {
        const b = this.b[key];
        if (!b.i.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        if (b.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        g.setIndex(b.i);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, b.mat);
        m.name = 'sky_' + key;
        m.castShadow = b.cast;
        m.receiveShadow = true;
        out.push(m);
      }
      return out;
    }
  }

  // ---------------------------------------------------------------- ground, roads
  function addGround(G, cx, cz) {
    const HALF = 600, N = 60, cell = 2 * HALF / N, x0 = cx - HALF, z0 = cz - HALF, Y = -0.03;
    const shade = (x, z) => 1 + 0.035 * Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017 - 0.6)
      + 0.025 * Math.sin((x + z) * 0.0093 + 0.4) + 0.02 * Math.cos(x * 0.0051 - z * 0.0077);
    const ids = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = x0 + i * cell, z = z0 + j * cell;
        ids.push(G.vtx('grass', [x, Y, z], UP, [x * 0.5, z * 0.5], shade(x, z)));
      }
    }
    const at = (i, j) => ids[j * (N + 1) + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      G.tri('grass', at(i, j), at(i, j + 1), at(i + 1, j), UP);
      G.tri('grass', at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), UP);
    }
  }

  function addRoad(G, road, fp, zA, zB) {
    const KW = 0.15, TOP = 0.05, KTOP = 0.15;
    G.box('asphalt', road.x0, -0.03, zA, road.x1, TOP, zB, 'b');
    G.box('kerb', road.x0 - KW, -0.03, zA, road.x0, KTOP, zB, 'b');     // west kerb (verge side)
    G.box('kerb', road.x1, -0.03, zA, road.x1 + KW, KTOP, zB, 'b');     // kerb between road and footpath
    G.box('paving', fp.x0 + KW, -0.03, zA, fp.x1, KTOP, zB, 'b');
    // broken white centre line: 3 m dashes every 12 m
    const cxr = (road.x0 + road.x1) / 2, hw = 0.07, y = TOP + 0.006;
    for (let z = zA + 4; z + 3 < zB - 4; z += 12) {
      G.flat('paint', [[cxr - hw, y, z], [cxr + hw, y, z], [cxr + hw, y, z + 3], [cxr - hw, y, z + 3]], UP);
    }
  }

  function addStreetLights(G, lights) {
    for (const L of lights) {
      const x = L[0], z = L[1];
      G.box('kerb', x - 0.2, -0.03, z - 0.2, x + 0.2, 0.25, z + 0.2, 'b');       // base
      G.tube('steel', [x, 0.2, z], [x, 7.0, z], 0.10, 0.07, 8);                   // 7 m pole
      G.box('steel', x - 4.6, 6.92, z - 0.05, x + 0.06, 7.04, z + 0.05);           // outreach arm to the road
      G.box('lamp', x - 5.0, 6.70, z - 0.2, x - 4.45, 6.9, z + 0.2);               // flat dark head
    }
  }

  // ---------------------------------------------------------------- houses
  function hipRoof(G, key, ex0, ex1, ez0, ez1, ye, rise) {
    const cx = (ex0 + ex1) / 2, cz = (ez0 + ez1) / 2, yr = ye + rise;
    const L = (ex1 - ex0) - (ez1 - ez0), centre = [cx, ye, cz];
    if (L > 0.6) {                                   // ridge along x, with two hips
      const rx0 = cx - L / 2, rx1 = cx + L / 2;
      G.flat(key, [[ex0, ye, ez0], [ex1, ye, ez0], [rx1, yr, cz], [rx0, yr, cz]], null, centre);
      G.flat(key, [[ex0, ye, ez1], [rx0, yr, cz], [rx1, yr, cz], [ex1, ye, ez1]], null, centre);
      G.flat(key, [[ex0, ye, ez0], [rx0, yr, cz], [ex0, ye, ez1]], null, centre);
      G.flat(key, [[ex1, ye, ez0], [ex1, ye, ez1], [rx1, yr, cz]], null, centre);
    } else {                                         // pyramid hip
      const apex = [cx, yr, cz];
      G.flat(key, [[ex0, ye, ez0], [ex1, ye, ez0], apex], null, centre);
      G.flat(key, [[ex1, ye, ez0], [ex1, ye, ez1], apex], null, centre);
      G.flat(key, [[ex1, ye, ez1], [ex0, ye, ez1], apex], null, centre);
      G.flat(key, [[ex0, ye, ez1], [ex0, ye, ez0], apex], null, centre);
    }
  }

  // Single-storey suburban house, north-facing (front door towards the map). Body on the
  // west part of the lot, carport on the east, small front fence on some lots.
  function addHouse(G, r, i) {
    const W = r.x1 - r.x0;
    const bx0 = r.x0 + 0.8, bx1 = r.x0 + Math.min(9.0, W - 4.0);
    const bz0 = r.z0 + 1.8, bz1 = Math.min(r.z1 - 3.0, r.z0 + 8.8);
    const wallH = 2.6, plinth = 0.3, rise = 1.9;
    const wall = i % 2 === 1 ? 'brick' : 'cream';
    const roof = i % 3 === 1 ? 'terra' : 'colorbond';

    G.box('plinth', bx0 - 0.04, 0, bz0 - 0.04, bx1 + 0.04, plinth, bz1 + 0.04, 'b');
    G.box(wall, bx0, plinth - 0.01, bz0, bx1, wallH, bz1, 'bt');

    // front (north) face: door and two windows, set just proud of the wall
    const zf = bz0;
    const quadN = (k, x0, y0, x1, y1, z) => G.flat(k, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, -1]);
    const d0 = bx0 + 0.9, d1 = bx0 + 2.0;
    quadN('door', d0, plinth, d1, 2.15, zf - 0.025);
    for (const [w0, w1] of [[bx0 + 2.6, bx0 + 4.1], [bx0 + 4.6, bx0 + 6.1]]) {
      quadN('frame', w0 - 0.12, 0.92, w1 + 0.12, 2.36, zf - 0.02);
      quadN('glass', w0, 1.0, w1, 2.28, zf - 0.03);
    }
    // path from the door to the street side of the lot
    G.box('paving', (d0 + d1) / 2 - 0.6, -0.03, r.z0, (d0 + d1) / 2 + 0.6, 0.05, zf + 0.02, 'b');

    // carport on the east side with a flat metal roof on four posts
    const cx0 = bx1 + 0.3, cx1 = r.x1 - 0.3, cz0 = bz0 + 0.2, cz1 = Math.min(bz1 + 0.2, bz0 + 5.5);
    if (cx1 - cx0 > 1.8) {
      G.box('kerb', cx0, -0.03, r.z0 + 0.5, cx1, 0.05, cz1, 'b');              // driveway and pad
      G.box('colorbond', cx0, 2.4, cz0, cx1, 2.52, cz1, 'b');
      for (const [px, pz] of [[cx0 + 0.1, cz0 + 0.1], [cx1 - 0.1, cz0 + 0.1], [cx0 + 0.1, cz1 - 0.1], [cx1 - 0.1, cz1 - 0.1]]) {
        G.box('steel', px - 0.06, 0, pz - 0.06, px + 0.06, 2.4, pz + 0.06);
      }
    }

    hipRoof(G, roof, bx0 - 0.5, bx1 + 0.5, bz0 - 0.5, bz1 + 0.5, wallH, rise);

    if (i % 4 === 0) {                               // low front fence, gap for the path and driveway
      const fz0 = r.z0 + 0.35, fz1 = r.z0 + 0.55;
      if (d0 - 0.8 > r.x0 + 0.2) G.box('cream', r.x0 + 0.2, 0, fz0, d0 - 0.8, 1.0, fz1);
      if (cx0 - 0.3 > d1 + 0.8) G.box('cream', d1 + 0.8, 0, fz0, cx0 - 0.3, 1.0, fz1);
      if (r.x1 - 0.2 > cx1 + 0.3) G.box('cream', cx1 + 0.3, 0, fz0, r.x1 - 0.2, 1.0, fz1);
    }
  }

  // ---------------------------------------------------------------- gum trees
  // One gum: pale leaning trunk, a few branches (near trees only), clumps of crossed leaf cards
  // (or low-poly blobs when the leaf texture is missing).
  function gumTree(G, rnd, x, z, h, near, cards) {
    const bk = near ? 'bark_n' : 'bark_f', lk = near ? 'leaf_n' : 'leaf_f';
    const lean = (rnd() - 0.5) * 1.6, leanZ = (rnd() - 0.5) * 1.6;
    const r0 = 0.22 + rnd() * 0.12, r1 = 0.09 + rnd() * 0.04;
    const top = h * (0.5 + rnd() * 0.1);
    const K = near ? 4 : 2, P = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const kink = near && k === 2 ? (rnd() - 0.5) * 0.6 : 0;
      P.push([x + lean * t * t + kink, top * t, z + leanZ * t * t]);
    }
    for (let k = 0; k < K; k++) {
      G.tube(bk, P[k], P[k + 1], r0 + (r1 - r0) * (k / K), r0 + (r1 - r0) * ((k + 1) / K), near ? 7 : 5);
    }
    const tip = P[K];
    if (near) {
      for (let s = 0; s < 3; s++) {
        const from = P[2 + (s % 2)], a = rnd() * TAU, out = 1.2 + rnd() * 1.4;
        const to = [from[0] + Math.cos(a) * out, from[1] + h * (0.2 + rnd() * 0.12), from[2] + Math.sin(a) * out];
        G.tube(bk, from, to, r1 * 0.9, r1 * 0.3, 4);
      }
    }
    const clumps = near ? 5 : 3;
    for (let c = 0; c < clumps; c++) {
      const a = rnd() * TAU, rad = h * (0.04 + rnd() * 0.16);
      const cx = tip[0] + Math.cos(a) * rad, cz = tip[2] + Math.sin(a) * rad;
      const cy = h * (0.62 + rnd() * 0.3);
      const w = h * (0.22 + rnd() * 0.08), ht = h * (0.12 + rnd() * 0.06);
      const psi = rnd() * TAU;
      if (cards) {
        for (let q = 0; q < 2; q++) {
          const ps = q === 0 ? psi : psi + Math.PI / 2 + (rnd() - 0.5) * 0.4;
          const ex = [Math.cos(ps), 0, Math.sin(ps)], ny = [-Math.sin(ps), 0, Math.cos(ps)];
          const corner = (lx, ly) => V.add([cx, cy, cz], V.add(V.mul(ex, lx), [0, ly, 0]));
          const pts = [corner(-w / 2, ht * 0.4), corner(w / 2, ht * 0.4), corner(w * 0.42, -ht * 0.7), corner(-w * 0.42, -ht * 0.7)];
          const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
          const ids = pts.map((p, j) => G.vtx(lk, p, ny, uvs[j]));
          G.tri(lk, ids[0], ids[1], ids[2], ny);
          G.tri(lk, ids[0], ids[2], ids[3], ny);
        }
      } else {
        const rx = w * 0.5, ry = ht * 0.6;
        const c0 = [cx, cy, cz];
        const T = V.add(c0, [0, ry, 0]), B = V.add(c0, [0, -ry, 0]);
        const E = [V.add(c0, [rx * Math.cos(psi), 0, rx * Math.sin(psi)]), V.add(c0, [-rx * Math.cos(psi), 0, -rx * Math.sin(psi)]),
          V.add(c0, [-rx * Math.sin(psi), 0, rx * Math.cos(psi)]), V.add(c0, [rx * Math.sin(psi), 0, -rx * Math.cos(psi)])];
        for (let e = 0; e < 4; e++) {
          const p = E[e], q = E[(e + 1) % 4];
          G.flat(lk, [T, p, q], null, c0);
          G.flat(lk, [B, q, p], null, c0);
        }
      }
    }
  }

  function addTrees(G, rnd, bd, road, fp, houses, N, cards, zA, zB) {
    const ex0 = bd.x0 - 250, ex1 = bd.x1 + 250, ez0 = bd.z0 - 250, ez1 = bd.z1 + 250;
    // no trees on the road, footpath or house lots; the road strip is clear along the road's own length
    const strip = [road.x0 - 4, fp.x1 + 4];
    const lots = houses.map((h) => [h.x0 - 4, h.z0 - 4, h.x1 + 4, h.z1 + 4]);
    let n = 0, tries = 0, near = 0;
    while (n < N && tries < N * 30) {
      tries++;
      const x = ex0 + rnd() * (ex1 - ex0), z = ez0 + rnd() * (ez1 - ez0);
      const dx = Math.max(bd.x0 - x, 0, x - bd.x1), dz = Math.max(bd.z0 - z, 0, z - bd.z1);
      const d = Math.hypot(dx, dz);
      if (d < 15 || d > 250) continue;
      // denser to the east and north, thinning with distance
      const dens = (x > bd.x1 || z < bd.z0 ? 1 : 0.5) * Math.exp(-d / 150);
      if (rnd() > dens) continue;
      if (x > strip[0] && x < strip[1] && z > zA && z < zB) continue;
      if (lots.some((l) => x > l[0] && x < l[2] && z > l[1] && z < l[3])) continue;
      const isNear = d < 70;
      gumTree(G, rnd, x, z, isNear ? 13 + rnd() * 7 : 11 + rnd() * 9, isNear, cards);
      n++; if (isNear) near++;
    }
    return { trees: n, near };
  }

  // Low hill line far to the east, faint and fogged by colour (no fog on it).
  // Kept within ~930 m of every point on the map so the camera's far plane (950 m) never cuts it off.
  function addHills(G, bd) {
    const xr = bd.x1 + 700;
    const zA = bd.z0 - 260, zB = bd.z1 + 260, step = 22;
    const prof = [];
    for (let z = zA; z <= zB; z += step) {
      const h = 16 + 12 * Math.sin(z * 0.0071 + 0.3) + 7 * Math.sin(z * 0.0233 + 1.1) + 4 * Math.sin(z * 0.061);
      prof.push([z, Math.max(3, h)]);
    }
    for (let k = 0; k + 1 < prof.length; k++) {
      const z0 = prof[k][0], h0 = prof[k][1], z1 = prof[k + 1][0], h1 = prof[k + 1][1];
      const A = [xr - 170, 0, z0], Bp = [xr, h0, z0], C = [xr - 170, 0, z1], D = [xr, h1, z1];
      G.flat('hill', [A, Bp, D], null);
      G.flat('hill', [A, D, C], null);
    }
  }

  // ---------------------------------------------------------------- the dome
  const DOME_VS = [
    'varying vec3 vDir;',
    'void main() {',
    '  vDir = position;',
    '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = p.xyww;',   // depth = 1.0: always behind everything, never clipped by the far plane
    '}'
  ].join('\n');
  const DOME_FS = [
    'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGnd; uniform vec3 uSun; uniform vec3 uSunCol;',
    'uniform float uTime;',
    'varying vec3 vDir;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float fbm(vec2 p) {',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }',
    '  return s / 0.96875;',
    '}',
    'void main() {',
    '  vec3 d = normalize(vDir);',
    '  float y = d.y;',
    '  vec3 col;',
    '  float cov = 0.0;',
    '  if (y >= 0.0) {',
    '    col = mix(uHor, uZen, smoothstep(0.0, 0.55, y));',
    '    if (y > 0.01) {',
    '      vec2 q = d.xz / (y + 0.18) * 1.7 + uTime * vec2(0.010, 0.004);',
    '      float n = fbm(q);',
    '      cov = smoothstep(0.50, 0.70, n) * smoothstep(0.01, 0.16, y) * 0.95;',
    '      vec2 sdir = normalize(uSun.xz + vec2(1e-4));',
    '      float nl = fbm(q + sdir * 0.22);',          // sample towards the sun: sunlit tops, greyer undersides
    '      float lit = clamp(0.55 + (n - nl) * 5.0, 0.0, 1.0);',
    '      vec3 cloud = mix(vec3(0.50, 0.54, 0.60), vec3(0.80, 0.79, 0.76), lit);',
    '      col = mix(col, cloud, cov);',
    '    }',
    '  } else {',
    // Stays horizon-coloured just past the far lawn edge (600 m; 97.5% fogged) so there is no seam
    // when the camera is high, then fades to the muted green-grey.
    '    col = mix(uHor, uGnd, smoothstep(-0.10, -0.55, y));',
    '  }',
    '  float sd = max(dot(d, uSun), 0.0);',
    // Haze and halo. Clouds block most of the glow, so cloud tops near the sun don't bloom into hot spots.
    '  col += uSunCol * (0.16 * pow(sd, 8.0) + 0.5 * pow(sd, 120.0)) * (1.0 - 0.8 * cov);',
    '  col += uSunCol * 5.0 * smoothstep(0.99980, 0.99992, sd);',          // the disc
    // No tone-map / encode chunks: r137 mixes fog after those, so the dome has to be output the
    // same way for its horizon to match the fog colour exactly (the game's final pass does the rest).
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------- build
  function vec3Of(s) {
    if (!s) return new THREE.Vector3(0.34, -1, 0.24).normalize();
    return Array.isArray(s) ? new THREE.Vector3(s[0], s[1], s[2]).normalize() : new THREE.Vector3().copy(s).normalize();
  }

  function build(cfg) {
    cfg = cfg || {};
    TEX = cfg.texSize || 256;
    const far = cfg.far || 900;
    const sunDir = vec3Of(cfg.sunDir);
    const bd = cfg.bounds || { x0: 0, z0: 0, x1: 125, z1: 165 };
    const road = cfg.road || { x0: -9, x1: -2, z0: 0, z1: 165 };
    const fp = cfg.footpath || { x0: -2, x1: 0, z0: 0, z1: 165 };
    const houses = cfg.houses || [];
    const zA = Math.min(bd.z0 - 60, road.z0), zB = Math.max(bd.z1 + 60, road.z1);
    const M = materials();
    const cards = hasTex('leaves_gum');

    const G = new Batch();
    const cast = { cream: true, brick: true, plinth: true, terra: true, colorbond: true, steel: true, bark_n: true, leaf_n: true };
    const mats = {
      grass: M.grass, asphalt: M.asphalt, kerb: M.kerb, paving: M.paving, paint: M.paint,
      cream: M.cream, brick: M.brick, plinth: M.plinth, terra: M.terra, colorbond: M.colorbond,
      glass: M.glass, frame: M.frame, door: M.door, steel: M.steel, lamp: M.lamp, hill: M.hill,
      bark_n: M.bark, leaf_n: M.leaf, bark_f: M.bark, leaf_f: M.leaf
    };
    for (const k in mats) G.bucket(k, mats[k], !!cast[k]);

    addGround(G, (bd.x0 + bd.x1) / 2, (bd.z0 + bd.z1) / 2);
    addRoad(G, road, fp, zA, zB);
    addStreetLights(G, cfg.streetLights || []);
    houses.forEach((h, i) => addHouse(G, h, i));
    const trees = addTrees(G, rng(0x1971), bd, road, fp, houses, cfg.trees || 1100, cards, zA, zB);
    addHills(G, bd);

    const group = new THREE.Group();
    group.name = 'sky';
    const meshes = G.meshes();
    for (const m of meshes) group.add(m);

    const uniforms = {
      uZen: { value: new THREE.Color(ZENITH) }, uHor: { value: new THREE.Color(HORIZON) },
      uGnd: { value: new THREE.Color(GROUND) }, uSun: { value: toSun(sunDir) },
      uSunCol: { value: new THREE.Color(SUN) }, uTime: { value: 0 }
    };
    const domeMat = new THREE.ShaderMaterial({ uniforms, vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, fog: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(far, 40, 20), domeMat);
    dome.name = 'sky_dome';
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    dome.castShadow = false; dome.receiveShadow = false;
    group.add(dome);

    let tris = 0, verts = 0;
    for (const m of meshes) { tris += m.geometry.index.count / 3; verts += m.geometry.attributes.position.count; }
    tris += dome.geometry.index.count / 3; verts += dome.geometry.attributes.position.count;
    const info = { meshes: meshes.length + 1, triangles: Math.round(tris), vertices: verts, trees: trees.trees, nearTrees: trees.near, cards: cards };

    let time = 0;
    const camPos = new THREE.Vector3();
    function update(dt, camera) {
      time += dt || 0;
      uniforms.uTime.value = time;
      if (camera) { camera.getWorldPosition(camPos); dome.position.copy(camPos); }
    }
    // Frees this build's geometry and materials. Textures are shared through JB.Tex and stay cached.
    function dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      group.clear();
    }
    return { group, update, dispose, info, sunDir: sunDir.clone() };
  }
  function toSun(sunDir) { return sunDir.clone().negate(); }

  JB.Sky = { build, HORIZON, ZENITH };
})();
