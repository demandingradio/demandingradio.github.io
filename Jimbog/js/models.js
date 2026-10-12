// Jimbog — CC0 Poly Haven models (Jimbog/assets/models/*.glb, credits in that folder's CREDITS.md).
// load() fetches them once at boot and bakes each one into geometry that props can place:
//   * every mesh's world transform is applied, then the model is recentred (x/z centred, bottom at y = 0);
//   * each glTF material becomes one prop material 'm:<name>:<i>' (the textures are shared, not copied);
//   * the mesh is simplified to a triangle target (LOD below). The sources are 0.2-9k triangles and a level
//     places dozens of instances, so full meshes would blow the triangle budget.
// Sizes come from the SIZE table, never from the loaded data, so colliders, nav and gameplay are the same
// whether or not a model loaded. A model that has not loaded keeps the old primitive look.
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  // Measured sizes in metres after node transforms (x, y, z). See _kit/MODELS_SPEC.md.
  const SIZE = {
    bench: [1.165, 0.889, 0.497], cardboard: [0.387, 0.342, 0.516], cat_statue: [0.153, 0.283, 0.25],
    crate_a: [0.825, 0.35, 0.409], crate_b: [0.529, 0.464, 1.166], drum_a: [0.563, 0.88, 0.563],
    drum_b: [0.488, 0.88, 0.485], generator: [0.817, 0.575, 0.564], picnic_table: [2.241, 0.746, 3.022],
    propane: [0.337, 0.554, 0.337], road_barrier: [1.564, 1.111, 0.442], school_chair: [0.566, 1.006, 0.675],
    school_desk: [0.712, 0.883, 0.546], shelves: [10.974, 21.405, 5.021], trash_can: [1.777, 0.906, 0.554],
    tyre: [0.6, 0.6, 0.165], utility_box: [0.52, 1.12, 0.432], wet_floor: [0.3, 0.63, 0.359],
    bin: [0.777, 0.906, 0.554]   // one bin of the trash_can file (its first mesh; the file holds two)
  };
  // Names that are a part of another file: { file, mesh } keeps only that mesh (in file order).
  const ALIAS = { bin: { file: 'trash_can', mesh: 0 } };
  // Triangle target per model after simplification (0 = keep the source mesh).
  const LOD = {
    bench: 0, wet_floor: 0, bin: 400, cardboard: 120, cat_statue: 800, crate_a: 120, crate_b: 120, drum_a: 200,
    drum_b: 200, generator: 1000, picnic_table: 1000, propane: 250, road_barrier: 400, school_chair: 600,
    school_desk: 500, shelves: 350, trash_can: 800, tyre: 300, utility_box: 400
  };

  const NAMES = Object.keys(SIZE);
  const BASE = 'assets/models/';
  const TIMEOUT_MS = 20000;
  // TUNE.maxErr: quadric error allowed per collapse (m^2 units). It stops a box face from being eaten.
  // Shelves are all open edges (thin frame), so they can only shrink with a larger allowance.
  const TUNE = { maxErr: 1e-2, byName: { shelves: 5e-2, crate_a: 8e-2, crate_b: 8e-2 } };
  const EDGE_PEN = 1000;       // open-edge penalty weight (keeps seams, box rims and silhouettes in place)
  const FLIP_DOT = 0.3;        // refuse a collapse that turns a face more than ~73 degrees

  // ------------------------------------------------------------------ simplification
  // Garland-Heckbert quadric edge collapse for one part. P, N: flat positions/normals (3 per vertex),
  // U: uvs (2 per vertex), I: triangle indices. Returns { P, N, U, I } with about `target` triangles.
  function simplify(P, N, U, I, target, maxErr) {
    const nv = P.length / 3, nt0 = I.length / 3;
    const pos = Float64Array.from(P);
    const T = Int32Array.from(I);
    const Q = new Float64Array(nv * 10);       // symmetric 4x4 per vertex: 00 01 02 03 11 12 13 22 23 33
    const tAlive = new Uint8Array(nt0).fill(1);
    const vAlive = new Uint8Array(nv).fill(1);
    const ver = new Int32Array(nv);
    const vt = new Array(nv);
    for (let v = 0; v < nv; v++) vt[v] = [];
    const addPlane = (v, w, a, b, c, d) => {
      const o = v * 10;
      Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
      Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
      Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
    };
    // Faces: area-weighted planes into the vertex quadrics; remember each edge's faces.
    const edges = new Map();
    let alive = 0;
    for (let t = 0; t < nt0; t++) {
      const i0 = T[3 * t], i1 = T[3 * t + 1], i2 = T[3 * t + 2];
      const ax = pos[3 * i0], ay = pos[3 * i0 + 1], az = pos[3 * i0 + 2];
      const e1x = pos[3 * i1] - ax, e1y = pos[3 * i1 + 1] - ay, e1z = pos[3 * i1 + 2] - az;
      const e2x = pos[3 * i2] - ax, e2y = pos[3 * i2 + 1] - ay, e2z = pos[3 * i2 + 2] - az;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) { tAlive[t] = 0; continue; }
      nx /= len; ny /= len; nz /= len;
      const d = -(nx * ax + ny * ay + nz * az), area = len / 2;
      addPlane(i0, area, nx, ny, nz, d); addPlane(i1, area, nx, ny, nz, d); addPlane(i2, area, nx, ny, nz, d);
      vt[i0].push(t); vt[i1].push(t); vt[i2].push(t);
      alive++;
      const pairs = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [p, q] of pairs) {
        const lo = Math.min(p, q), hi = Math.max(p, q), key = lo * nv + hi;
        const e = edges.get(key);
        if (e) e.n++; else edges.set(key, { n: 1, a: lo, b: hi, nx, ny, nz });
      }
    }
    // Open edges (count != 2): a penalty plane through the edge, perpendicular to its face.
    for (const e of edges.values()) {
      if (e.n === 2) continue;
      const ex = pos[3 * e.b] - pos[3 * e.a], ey = pos[3 * e.b + 1] - pos[3 * e.a + 1], ez = pos[3 * e.b + 2] - pos[3 * e.a + 2];
      const el = Math.hypot(ex, ey, ez);
      if (el < 1e-9) continue;
      let px = e.ny * ez - e.nz * ey, py = e.nz * ex - e.nx * ez, pz = e.nx * ey - e.ny * ex;
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl; py /= pl; pz /= pl;
      const d = -(px * pos[3 * e.a] + py * pos[3 * e.a + 1] + pz * pos[3 * e.a + 2]);
      addPlane(e.a, EDGE_PEN * el, px, py, pz, d); addPlane(e.b, EDGE_PEN * el, px, py, pz, d);
    }
    const heap = [];
    const hPush = (e) => {
      heap.push(e);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const hPop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    // Heap entry for collapsing edge (a, b): the lowest-error position of the two ends and the midpoint.
    const cost = (a, b) => {
      const oa = a * 10, ob = b * 10;
      const s = [];
      for (let k = 0; k < 10; k++) s.push(Q[oa + k] + Q[ob + k]);
      const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
      const bx = pos[3 * b], by = pos[3 * b + 1], bz = pos[3 * b + 2];
      const cand = [[ax, ay, az], [bx, by, bz], [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]];
      let best = cand[0], bc = Infinity;
      for (const [x, y, z] of cand) {
        const ce = s[0] * x * x + 2 * s[1] * x * y + 2 * s[2] * x * z + 2 * s[3] * x
          + s[4] * y * y + 2 * s[5] * y * z + 2 * s[6] * y
          + s[7] * z * z + 2 * s[8] * z + s[9];
        if (ce < bc) { bc = ce; best = [x, y, z]; }
      }
      return [Math.max(0, bc), a, b, ver[a], ver[b], best[0], best[1], best[2]];
    };
    const seen = new Set();
    for (const e of edges.values()) {
      const k = e.a * nv + e.b;
      if (seen.has(k)) continue;
      seen.add(k);
      hPush(cost(e.a, e.b));
    }
    const hasV = (t, v) => T[3 * t] === v || T[3 * t + 1] === v || T[3 * t + 2] === v;
    // Normal of triangle t with vertex a replaced by b (at position nb), and of the original triangle.
    const normalOf = (vs, px) => {
      const p0 = px(vs[0]), p1 = px(vs[1]), p2 = px(vs[2]);
      const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
      const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
      return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
    };
    while (alive > target && heap.length) {
      const [c, a, b, va, vb, x, y, z] = hPop();
      if (!vAlive[a] || !vAlive[b] || ver[a] !== va || ver[b] !== vb) continue;
      if (c > maxErr) break;
      const shared = [], onlyA = [];
      for (const t of vt[a]) if (tAlive[t]) (hasV(t, b) ? shared : onlyA).push(t);
      if (!shared.length) continue;
      let ok = true;
      const pOld = (v) => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
      const pNew = (v) => (v === b ? [x, y, z] : pOld(v));
      for (const t of onlyA) {
        const vs = [T[3 * t], T[3 * t + 1], T[3 * t + 2]];
        const nOld = normalOf(vs, pOld);
        const vs2 = vs.map((v) => (v === a ? b : v));
        const nNew = normalOf(vs2, pNew);
        const lo = Math.hypot(...nOld), ln = Math.hypot(...nNew);
        if (ln < 1e-12) { ok = false; break; }
        if ((nOld[0] * nNew[0] + nOld[1] * nNew[1] + nOld[2] * nNew[2]) / (lo * ln) < FLIP_DOT) { ok = false; break; }
      }
      if (!ok) continue;
      for (const t of onlyA) {
        for (let k = 0; k < 3; k++) if (T[3 * t + k] === a) T[3 * t + k] = b;
        vt[b].push(t);
      }
      for (const t of shared) tAlive[t] = 0;
      alive -= shared.length;
      pos[3 * b] = x; pos[3 * b + 1] = y; pos[3 * b + 2] = z;
      for (let k = 0; k < 10; k++) Q[b * 10 + k] += Q[a * 10 + k];
      vAlive[a] = 0; ver[a]++; ver[b]++;
      // edges around b changed: queue their new costs
      for (const t of vt[b]) {
        if (!tAlive[t]) continue;
        for (let k = 0; k < 3; k++) {
          const w = T[3 * t + k];
          if (w !== b && vAlive[w]) hPush(cost(b, w));
        }
      }
    }
    // Compact the surviving triangles and vertices.
    const remap = new Int32Array(nv).fill(-1);
    const oP = [], oN = [], oU = [], oI = [];
    let m = 0;
    for (let t = 0; t < nt0; t++) {
      if (!tAlive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const v = T[3 * t + k];
        if (remap[v] < 0) {
          remap[v] = m++;
          oP.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
          oN.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]);
          oU.push(U[2 * v], U[2 * v + 1]);
        }
        oI.push(remap[v]);
      }
    }
    return { P: Float32Array.from(oP), N: Float32Array.from(oN), U: Float32Array.from(oU), I: oI };
  }

  // ------------------------------------------------------------------ baking
  const _v = new THREE.Vector3(), _n = new THREE.Vector3();
  // Flatten every mesh of a glTF scene into one geometry per material, in world space, then recentre.
  function bake(gltf, keepMesh) {
    const scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!scene) throw new Error('no scene');
    scene.updateMatrixWorld(true);
    const groups = new Map();   // THREE material -> { P, N, U, I, n }
    let meshNo = -1;
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      meshNo++;
      if (keepMesh !== undefined && keepMesh >= 0 && meshNo !== keepMesh) return;
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      const idx = g.index ? g.index.array : null;
      const ranges = g.groups && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.length : pos.count, materialIndex: 0 }];
      const remaps = new Map();
      for (const r of ranges) {
        const mat = mats[r.materialIndex || 0] || mats[0];
        let G = groups.get(mat);
        if (!G) groups.set(mat, G = { P: [], N: [], U: [], I: [], n: 0 });
        let rm = remaps.get(mat);
        if (!rm) remaps.set(mat, rm = new Int32Array(pos.count).fill(-1));
        for (let i = r.start; i < r.start + r.count; i++) {
          const v = idx ? idx[i] : i;
          if (rm[v] < 0) {
            rm[v] = G.n++;
            _v.fromBufferAttribute(pos, v).applyMatrix4(o.matrixWorld);
            G.P.push(_v.x, _v.y, _v.z);
            if (nor) { _n.fromBufferAttribute(nor, v).applyMatrix3(nm).normalize(); G.N.push(_n.x, _n.y, _n.z); } else G.N.push(0, 1, 0);
            if (uv) G.U.push(uv.getX(v), uv.getY(v)); else G.U.push(0, 0);
          }
          G.I.push(rm[v]);
        }
      }
    });
    // Recentre on the whole model: x/z centred, bottom at y = 0.
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const G of groups.values()) for (let k = 0; k < G.P.length; k += 3) {
      const x = G.P[k], y = G.P[k + 1], z = G.P[k + 2];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    const ox = -(mnx + mxx) / 2, oy = -mny, oz = -(mnz + mxz) / 2;
    for (const G of groups.values()) for (let k = 0; k < G.P.length; k += 3) { G.P[k] += ox; G.P[k + 1] += oy; G.P[k + 2] += oz; }
    return { size: { x: mxx - mnx, y: mxy - mny, z: mxz - mnz }, groups: [...groups.values()], mats: [...groups.keys()] };
  }

  // The prop material params for one glTF material: its textures, factors and normal scale exactly as loaded.
  function paramsOf(m) {
    const p = {};
    if (m.map) p.map = m.map;
    if (m.normalMap) { p.normalMap = m.normalMap; p.normalScale = new THREE.Vector2(m.normalScale.x, m.normalScale.y); }
    if (m.roughnessMap) p.roughnessMap = m.roughnessMap;
    if (m.metalnessMap) p.metalnessMap = m.metalnessMap;
    if (m.color) p.color = m.color.clone();
    if (m.roughness !== undefined) p.roughness = m.roughness;
    if (m.metalness !== undefined) p.metalness = m.metalness;
    if (m.side !== THREE.FrontSide) p.side = m.side;
    return p;
  }

  const store = {};     // name -> { parts: [{ key, geometry }], tris, size }
  const api = {
    // ?nomodels (a test switch): build every map with the primitive props only.
    enabled: !(typeof location !== 'undefined' && /[?&]nomodels\b/.test(location.search)),
    TUNE,
    ready: false,
    NAMES,
    SIZE,
    has(name) { return !!(api.enabled && store[name]); },
    // Hard-coded measured size (always available, even before or without a load).
    size(name) { const s = SIZE[name]; return s ? { x: s[0], y: s[1], z: s[2] } : null; },
    // [{ key: 'm:<name>:<i>', geometry }] for a loaded model, else [].
    parts(name) { return (api.enabled && store[name] && store[name].parts) || []; },
    tris(name) { return store[name] ? store[name].tris : 0; },
    // Calls put(key, geometry, x, y, z, ry, g, aof, rx, rz, sc) once per part (the props.js `put` signature).
    put(put, name, x, y, z, ry, g, aof, rx, rz, sc) {
      for (const p of api.parts(name)) put(p.key, p.geometry, x, y, z, ry, g, aof, rx, rz, sc);
    },
    load(names) {
      const list = (names || NAMES).filter((n) => SIZE[n] && !store[n]);
      if (!api.enabled || !window.THREE || !THREE.GLTFLoader || !JB.Props) { api.ready = true; return Promise.resolve(api); }
      const loader = new THREE.GLTFLoader();
      const fileOf = (n) => (ALIAS[n] ? ALIAS[n].file : n);
      const files = [...new Set(list.map(fileOf))];
      // One request per file; a file's names are all registered from that one scene.
      const one = (file) => new Promise((resolve) => {
        const done = () => resolve();
        try {
          loader.load(BASE + file + '.glb', (gltf) => {
            for (const name of list.filter((n) => fileOf(n) === file)) {
              try { register(name, gltf); } catch (e) { console.warn('[models] ' + name + ' failed: ' + e.message); }
            }
            done();
          }, undefined, () => { console.warn('[models] could not load ' + file); done(); });
        } catch (e) { console.warn('[models] ' + file + ' failed: ' + e.message); done(); }
      });
      const all = Promise.all(files.map(one));
      const cap = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
      // Never rejects: a model that is late is simply missing from this build.
      return Promise.race([all, cap]).then(() => { api.ready = true; return api; });
    }
  };

  function register(name, gltf) {
    const B = bake(gltf, ALIAS[name] ? ALIAS[name].mesh : -1);
    const total = B.groups.reduce((s, G) => s + G.I.length / 3, 0);
    const target = LOD[name] || 0;
    const parts = [];
    const mats = {};
    B.groups.forEach((G, i) => {
      let P = Float32Array.from(G.P), N = Float32Array.from(G.N), U = Float32Array.from(G.U), I = G.I;
      const tris = I.length / 3;
      if (target && total > target) {
        const want = Math.max(12, Math.round(target * tris / total));
        const s = simplify(P, N, U, I, want, TUNE.byName[name] || TUNE.maxErr);
        P = s.P; N = s.N; U = s.U; I = s.I;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geometry.setIndex(I);
      const key = 'm:' + name + ':' + i;
      parts.push({ key, geometry });
      mats[key] = { params: paramsOf(B.mats[i]) };
    });
    JB.Props.addMaterials(mats);
    const out = { parts, tris: 0, size: B.size };
    for (const p of parts) out.tris += p.geometry.index.count / 3;
    store[name] = out;
  }

  JB.Models = api;
})();
