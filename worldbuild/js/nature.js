/* Diorama — nature & props: trees, bushes, rocks, flowers and small medieval props
   (lanterns, hurdles, barrels, hayricks, stooks, drystone walls, graves...).
   Stored per 1 km chunk as flat Float32 arrays; rendered with per-species
   InstancedMeshes at two levels of detail, rebuilt as the camera moves.
   Settlements add derived "extras" (never saved) and may hide user instances
   under their buildings and lanes through a hide function. */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE, CHUNK, NCH } = D;
const W = D.W;
const STRIDE = 7; // x, z, y, species, scale, rot, seed
const CHS = CHUNK * CELL;

// tint codes (nature material):
//  0 fixed colour            1 evergreen canopy (x instance colour, sways)
//  2 deciduous canopy        3 blossom canopy
//  4 instance-coloured, static (stone, wood) + snow
//  5 fixed colour + snow     6 lamp / flame glow (flickers)
//  7 fruit (vertex colour = ripe colour; blossom in spring, follows the canopy)
//  9 crop leaves (x instance colour, seasonal, no winter shrink)
// Indices 0..12 and the saved indices 13..17 must never move (saved worlds store them).
const SPECIES = [
  { id: 'oak', name: 'Oak', cat: 'tree', cols: [0x4d7a2c, 0x6a9236, 0x587f2e], canopy: 1, h: 13 },
  { id: 'pine', name: 'Pine', cat: 'tree', cols: [0x2f5a2c, 0x3e6b33, 0x355f2f], canopy: 1, h: 17 },
  { id: 'poplar', name: 'Poplar', cat: 'tree', cols: [0x5b8a34, 0x6f9a3c], canopy: 1, h: 19 },
  { id: 'birch', name: 'Birch', cat: 'tree', cols: [0x7aa040, 0x8fb04a], canopy: 1, h: 14 },
  { id: 'spruce', name: 'Spruce', cat: 'tree', cols: [0x1e4830, 0x2a5638, 0x244e33], canopy: 1, h: 22 },
  { id: 'palm', name: 'Palm', cat: 'tree', cols: [0x4b8c2e, 0x5f9c38, 0x6aa33c], canopy: 1, h: 12 },
  { id: 'jungle', name: 'Rainforest', cat: 'tree', cols: [0x2d7a28, 0x3c8f32, 0x2f6e2a], canopy: 1, h: 18 },
  { id: 'blossom', name: 'Blossom', cat: 'tree', cols: [0xf0a0bf, 0xf6c2d4, 0xe98fb0], canopy: 1, h: 8 },
  { id: 'cactus', name: 'Cactus', cat: 'tree', cols: [0x5f8a3a], canopy: 0, h: 7 },
  { id: 'bush', name: 'Bush', cat: 'bush', cols: [0x4a7a2e, 0x5d8a36, 0x3f6d2a], canopy: 1, h: 2.5 },
  { id: 'scrub', name: 'Dry scrub', cat: 'bush', cols: [0x8a8656, 0x75784a, 0x9a8a5a], canopy: 1, h: 2 },
  { id: 'flowers', name: 'Flower bed', cat: 'bush', cols: [0xe85a8a, 0xf2c94a, 0xa070e0, 0xf5f0e8], canopy: 1, h: 0.6 },
  { id: 'rock', name: 'Boulder', cat: 'rock', cols: [0x8a8680, 0x75716c, 0x9a958c], canopy: 1, h: 3 },
  // 13..17: renamed medieval props (saved indices kept)
  { id: 'lantern', name: 'Lantern post', cat: 'prop', cols: [0x3a3430], canopy: 0, h: 3.4, line: 28 },
  { id: 'wattle', name: 'Wattle hurdle', cat: 'prop', cols: [0x8a6a44, 0x7e6040, 0x967452], canopy: 0, h: 1.2, line: 3, noScale: true },
  { id: 'hedge', name: 'Hedge', cat: 'prop', cols: [0x3f6b2c], canopy: 1, h: 1.6, line: 3, noScale: true },
  { id: 'barrels', name: 'Barrels', cat: 'prop', cols: [0x8a6038, 0x7a5232, 0x96683e], canopy: 0, h: 1.2, line: 5, noScale: true },
  { id: 'haystack', name: 'Haystack', cat: 'prop', cols: [0xd2b068], canopy: 0, h: 5, line: 12 },
  // 18..33: appended
  { id: 'cart', name: 'Handcart', cat: 'prop', cols: [0x8a6a44, 0x7a5c3a, 0x9c7a50], canopy: 0, h: 1.3, line: 9, noScale: true },
  { id: 'crates', name: 'Crates & sacks', cat: 'prop', cols: [0xa07a4a, 0x8e6a40, 0xb08a58], canopy: 0, h: 1.5, line: 4, noScale: true },
  { id: 'woodpile', name: 'Woodpile', cat: 'prop', cols: [0x6a4a30], canopy: 0, h: 1.0, line: 3, noScale: true },
  { id: 'stook', name: 'Stook', cat: 'prop', cols: [0xd8b865], canopy: 0, h: 1.6, line: 5 },
  { id: 'drystone', name: 'Drystone wall', cat: 'prop', cols: [0x8a8680, 0x9a9282, 0x7e7a72, 0xa09a8c], canopy: 0, h: 1.2, line: 3, noScale: true },
  { id: 'veg', name: 'Vegetable rows', cat: 'prop', cols: [0x6a9a48, 0x5e8e4c, 0x78a452], canopy: 1, h: 0.6, line: 2.6, noScale: true },
  { id: 'herbs', name: 'Herb knot', cat: 'prop', cols: [0x3f6b2c, 0x4a7a34, 0x44702e], canopy: 1, h: 0.8, line: 2.6, noScale: true },
  { id: 'apple', name: 'Apple tree', cat: 'tree', cols: [0x5a8a32, 0x66963a, 0x4e7e2e], canopy: 1, h: 5.4 },
  { id: 'pear', name: 'Pear tree', cat: 'tree', cols: [0x5e8c36, 0x6a9a3e, 0x52803a], canopy: 1, h: 6.1 },
  { id: 'grave', name: 'Grave', cat: 'prop', cols: [0x9a968c, 0x8a867e, 0xa8a296, 0x7c786e], canopy: 0, h: 1.0, line: 2.5, noScale: true },
  { id: 'skep', name: 'Bee skeps', cat: 'prop', cols: [0xc9a050], canopy: 0, h: 1.1, line: 3, noScale: true },
  { id: 'netrack', name: 'Net rack', cat: 'prop', cols: [0x6e6a58], canopy: 0, h: 2.3, line: 5, noScale: true },
  { id: 'waycross', name: 'Wayside cross', cat: 'prop', cols: [0x9a948a], canopy: 0, h: 3, line: 40, noScale: true },
  { id: 'yew', name: 'Yew', cat: 'tree', cols: [0x1f3a22, 0x24402a, 0x2b4a2c], canopy: 1, h: 10 },
  { id: 'vine', name: 'Vine row', cat: 'prop', cols: [0x5e8a36, 0x6a943c, 0x54803a], canopy: 1, h: 1.6, line: 2, noScale: true },
  { id: 'torchpost', name: 'Torch post', cat: 'prop', cols: [0x5a4430], canopy: 0, h: 3, line: 14, noScale: true },
];
const SP_INDEX = {}; SPECIES.forEach((s, i) => SP_INDEX[s.id] = i);
const DECID = new Set(['oak', 'poplar', 'birch']);
const BLOSSOM = new Set(['blossom']);
// geometry aliases for ids that existed before the medieval update (other files may still ask)
const GEO_ALIAS = { streetlight: 'lantern', fence: 'wattle', bench: 'barrels', windmill: 'haystack' };
// the hide mask applies to every category except boulders
const HIDEABLE = new Uint8Array(SPECIES.length);
SPECIES.forEach((s, i) => { HIDEABLE[i] = s.cat === 'rock' ? 0 : 1; });

const Nature = D.Nature = { SPECIES, SP_INDEX, STRIDE };

// ---- Chunk store ------------------------------------------------------------------
const chunks = [];
for (let i = 0; i < NCH * NCH; i++) chunks.push({ n: 0, d: new Float32Array(64 * STRIDE), grid: null });
Nature.chunks = chunks;
let dirtyRender = true;
const dirtyForest = new Set();

Nature.snapChunk = function (ci) { const c = chunks[ci]; return { n: c.n, data: c.d.slice(0, c.n * STRIDE) }; };
Nature.loadChunk = function (ci, s) {
  const c = chunks[ci];
  if (c.d.length < s.n * STRIDE) c.d = new Float32Array(Math.max(64, s.n) * STRIDE * 1.5 | 0);
  c.d.set(s.data); c.n = s.n; c.grid = null;
  markChunk(ci);
};
function markChunk(ci) { dirtyRender = true; dirtyForest.add(ci); }
function chunkOf(x, z) {
  const cx = D.clamp(Math.floor(x / CHS), 0, NCH - 1), cz = D.clamp(Math.floor(z / CHS), 0, NCH - 1);
  return cz * NCH + cx;
}
function push(ci, x, z, y, sp, sc, rot, seed) {
  const c = chunks[ci];
  if ((c.n + 1) * STRIDE > c.d.length) { const nd = new Float32Array(c.d.length * 2); nd.set(c.d); c.d = nd; }
  const o = c.n * STRIDE;
  c.d[o] = x; c.d[o + 1] = z; c.d[o + 2] = y; c.d[o + 3] = sp; c.d[o + 4] = sc; c.d[o + 5] = rot; c.d[o + 6] = seed;
  c.n++;
  c.grid = null;
}
function removeAt(ci, k) {
  const c = chunks[ci];
  const last = (c.n - 1) * STRIDE;
  if (k * STRIDE !== last) c.d.copyWithin(k * STRIDE, last, last + STRIDE);
  c.n--; c.grid = null;
}
Nature.count = function () { let n = 0; for (const c of chunks) n += c.n; return n; };
Nature.clearAll = function () { for (const c of chunks) { c.n = 0; c.grid = null; } dirtyRender = true; for (let i = 0; i < chunks.length; i++) dirtyForest.add(i); };

// bucket grid for spacing queries (16 m buckets)
const GB = 16, GN = CHS / GB;
function grid(ci) {
  const c = chunks[ci];
  if (c.grid) return c.grid;
  const head = new Int32Array(GN * GN).fill(-1), next = new Int32Array(Math.max(1, c.n));
  const x0 = (ci % NCH) * CHS, z0 = Math.floor(ci / NCH) * CHS;
  for (let k = 0; k < c.n; k++) {
    const gx = D.clamp(Math.floor((c.d[k * STRIDE] - x0) / GB), 0, GN - 1), gz = D.clamp(Math.floor((c.d[k * STRIDE + 1] - z0) / GB), 0, GN - 1);
    const b = gz * GN + gx; next[k] = head[b]; head[b] = k;
  }
  return (c.grid = { head, next });
}
// nearest distance (squared) from x,z to any item (optionally only one category) within r
function nearestSq(x, z, r) {
  let best = r * r;
  const ci0 = chunkOf(x - r, z - r), ci1 = chunkOf(x + r, z + r);
  const cx0 = ci0 % NCH, cz0 = Math.floor(ci0 / NCH), cx1 = ci1 % NCH, cz1 = Math.floor(ci1 / NCH);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const ci = cz * NCH + cx, c = chunks[ci];
    if (!c.n) continue;
    const g = grid(ci);
    const x0 = cx * CHS, z0 = cz * CHS;
    const gx0 = D.clamp(Math.floor((x - r - x0) / GB), 0, GN - 1), gx1 = D.clamp(Math.floor((x + r - x0) / GB), 0, GN - 1);
    const gz0 = D.clamp(Math.floor((z - r - z0) / GB), 0, GN - 1), gz1 = D.clamp(Math.floor((z + r - z0) / GB), 0, GN - 1);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      for (let k = g.head[gz * GN + gx]; k >= 0; k = g.next[k]) {
        const dx = c.d[k * STRIDE] - x, dz = c.d[k * STRIDE + 1] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
    }
  }
  return best;
}

// ---- Extras (derived settlement props: never saved, never in history) -----------------
// key -> { a: Float32Array (stride 7), n, bb: [x0, z0, x1, z1] }
const extras = new Map();
Nature.setExtra = function (key, arr) {
  if (!arr || !arr.length) { if (extras.delete(key)) dirtyRender = true; return; }
  const n = Math.floor(arr.length / STRIDE);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let k = 0; k < n; k++) {
    const x = arr[k * STRIDE], z = arr[k * STRIDE + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  extras.set(key, { a: arr, n, bb: [x0, z0, x1, z1] });
  dirtyRender = true;
};
Nature.getExtra = function (key) { const e = extras.get(key); return e ? e.a : null; };
Nature.clearExtras = function (prefix) {
  let any = false;
  for (const k of Array.from(extras.keys())) if (!prefix || k.indexOf(prefix) === 0) { extras.delete(k); any = true; }
  if (any) dirtyRender = true;
};
Nature.extraCount = function () { let n = 0; extras.forEach(e => n += e.n); return n; };

// ---- Hide mask hook (settlements hide user instances under their content) -------------
let hideFn = null;
Nature.setHideFn = function (fn) {
  const had = !!hideFn;
  hideFn = typeof fn === 'function' ? fn : null;
  dirtyRender = true;
  if (had || hideFn) for (let i = 0; i < chunks.length; i++) if (chunks[i].n) dirtyForest.add(i);
};
Nature.markHideDirty = function (x0, z0, x1, z1) {
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
  const c0 = chunkOf(x0 - CELL, z0 - CELL), c1 = chunkOf(x1 + CELL, z1 + CELL);
  for (let cz = Math.floor(c0 / NCH); cz <= Math.floor(c1 / NCH); cz++)
    for (let cx = c0 % NCH; cx <= c1 % NCH; cx++) dirtyForest.add(cz * NCH + cx);
  dirtyRender = true;
};
Nature.hidden = function (x, z, sp) { return !!(hideFn && HIDEABLE[sp] && hideFn(x, z)); };

// v1 worlds: species 17 was the modern wind turbine; it is now the haystack.
Nature.migrateV1 = function () {
  const OLD = 17;
  for (let ci = 0; ci < chunks.length; ci++) {
    const c = chunks[ci];
    let removed = false;
    for (let k = c.n - 1; k >= 0; k--) if (c.d[k * STRIDE + 3] === OLD) { removeAt(ci, k); removed = true; }
    if (removed) markChunk(ci);
  }
  dirtyRender = true;
};

// ---- Geometry ------------------------------------------------------------------------
function cyl(rt, rb, h, seg, y0, col, tint) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(0, y0 + h / 2, 0); return D.colorGeo(g, col, 'tint', tint); }
function cone(r, h, seg, y0, col, tint) { const g = new THREE.ConeGeometry(r, h, seg, 1); g.translate(0, y0 + h / 2, 0); return D.colorGeo(g, col, 'tint', tint); }
function blob(r, det, x, y, z, sx, sy, sz, col, tint, seed) {
  const g = new THREE.IcosahedronGeometry(r, det);
  const rnd = D.rng(seed || 1);
  const p = g.attributes.position;
  const jit = new Map();
  for (let k = 0; k < p.count; k++) {
    const key = p.getX(k).toFixed(3) + p.getY(k).toFixed(3) + p.getZ(k).toFixed(3);
    let j = jit.get(key); if (j === undefined) { j = 0.85 + rnd() * 0.3; jit.set(key, j); }
    p.setXYZ(k, p.getX(k) * j, p.getY(k) * j, p.getZ(k) * j);
  }
  g.scale(sx, sy, sz); g.translate(x, y, z);
  return D.colorGeo(g, col, 'tint', tint);
}
function box(w, h, d, x, y, z, col, tint) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return D.colorGeo(g, col, 'tint', tint); }
// a square-section timber from p0 to p1
const _q = new THREE.Quaternion(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _mat = new THREE.Matrix4();
function beam(x0, y0, z0, x1, y1, z1, t, col, tint) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-3;
  const g = new THREE.BoxGeometry(t, L, t); g.translate(0, L / 2, 0);
  _dir.set(dx / L, dy / L, dz / L); _q.setFromUnitVectors(_up, _dir);
  g.applyMatrix4(_mat.makeRotationFromQuaternion(_q)); g.translate(x0, y0, z0);
  return D.colorGeo(g, col, 'tint', tint);
}
// cylinder whose axis runs along x (logs, axles), centred at x,y,z
function cylX(r, len, seg, x, y, z, col, tint) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return D.colorGeo(g, col, 'tint', tint); }
// torus lying in the local YZ plane (a wheel rolling along z), centred at x,y,z
function wheelRing(R, t, x, y, z, col, tint) { const g = new THREE.TorusGeometry(R, t, 4, 12); g.rotateY(Math.PI / 2); g.translate(x, y, z); return D.colorGeo(g, col, 'tint', tint); }
// per-triangle brightness jitter (hay, straw, stone: reads as texture in flat shading)
function speckle(g, amt, seed) {
  const c = g.attributes.color, rnd = D.rng(seed || 7);
  for (let t = 0; t < c.count; t += 3) {
    const f = 1 + (rnd() - 0.5) * amt;
    for (let v = t; v < t + 3 && v < c.count; v++) c.setXYZ(v, c.getX(v) * f, c.getY(v) * f, c.getZ(v) * f);
  }
  return g;
}
// recolour the faces whose normal points along +-axis (log ends, cut timber)
function endCol(g, axis, hex) {
  const n = g.attributes.normal, c = g.attributes.color, col = new THREE.Color(hex).convertSRGBToLinear();
  if (!n) return g;
  for (let v = 0; v < c.count; v++) {
    const a = axis === 0 ? n.getX(v) : axis === 1 ? n.getY(v) : n.getZ(v);
    if (Math.abs(a) > 0.9) c.setXYZ(v, col.r, col.g, col.b);
  }
  return g;
}
// reversed copy of a (non-indexed) sheet so it shows from both sides
function backFace(g) {
  const b = g.clone();
  for (const name of Object.keys(b.attributes)) {
    const at = b.attributes[name], s = at.itemSize, a = at.array;
    for (let t = 0; t + 2 < at.count; t += 3) for (let k = 0; k < s; k++) {
      const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = a[i1]; a[i1] = a[i2]; a[i2] = tmp;
    }
  }
  return b;
}
function moveAll(list, fn) { list.forEach(fn); return list; }
const TRUNK = 0x6b4a2e, WHITE = 0xffffff;

function barrel(P, x, z, lying, ry, lod) {
  const STAVE = 0xffffff, HOOP = 0x2e2a26, LID = 0x6e5236;
  const g = new THREE.CylinderGeometry(0.3, 0.3, 0.9, lod ? 6 : 9, lod ? 1 : 2);
  if (!lod) {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) if (Math.abs(p.getY(k)) < 0.01) { p.setX(k, p.getX(k) * 1.13); p.setZ(k, p.getZ(k) * 1.13); }
  }
  g.translate(0, 0.45, 0);
  const parts = [endCol(D.colorGeo(g, STAVE, 'tint', 4), 1, LID)];
  if (!lod) parts.push(cyl(0.325, 0.325, 0.05, 9, 0.16, HOOP, 0), cyl(0.325, 0.325, 0.05, 9, 0.69, HOOP, 0));
  moveAll(parts, q => {
    if (lying) { q.translate(0, -0.45, 0); q.rotateZ(Math.PI / 2); q.translate(0, 0.33, 0); }
    q.rotateY(ry || 0); q.translate(x, 0, z); P.push(q);
  });
}
function crate(P, s, x, y, z, ry) {
  const CR = 0xffffff, BAND = 0x5a4430;
  moveAll([box(s, s, s, 0, 0, 0, CR, 4), box(s + 0.03, 0.07, s + 0.03, 0, 0.05, 0, BAND, 0), box(s + 0.03, 0.07, s + 0.03, 0, s - 0.12, 0, BAND, 0),
    box(0.07, s - 0.1, s + 0.03, 0, 0.05, 0, BAND, 0)], g => { g.rotateY(ry); g.translate(x, y, z); P.push(g); });
}
function fruitTree(P, pear, lod) {
  const T = 0x5e4632, rnd = D.rng(pear ? 7717 : 5511);
  const canopy = pear
    ? [[1.7, 0, 4.0, 0, 1, 1.35, 1], [1.2, 0.7, 3.3, 0.4, 1, 1.1, 1], [1.1, -0.6, 4.6, -0.3, 1, 1.1, 1]]
    : [[2.0, 0, 3.6, 0, 1.15, 0.8, 1.15], [1.4, 1.1, 3.3, 0.6, 1, 0.8, 1], [1.3, -1.0, 3.4, -0.6, 1, 0.8, 1], [1.2, 0.1, 4.4, -0.2, 1, 0.8, 1]];
  if (lod) {
    P.push(cyl(0.2, 0.28, 2.3, 4, 0, T, 0));
    P.push(pear ? blob(1.8, 0, 0, 3.9, 0, 1, 1.4, 1, WHITE, 2, 8) : blob(2.3, 0, 0, 3.6, 0, 1.15, 0.8, 1.15, WHITE, 2, 6));
    const FR = pear ? 0xc8c45a : 0xc8302a;
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.4; P.push(blob(0.16, 0, Math.cos(a) * 1.9, 3.3, Math.sin(a) * 1.9, 1, 1, 1, FR, 7, 900 + k)); }
    return;
  }
  const tr = new THREE.CylinderGeometry(0.15, 0.25, 2.4, 6); tr.translate(0, 1.2, 0); tr.rotateZ(0.07);
  P.push(D.colorGeo(tr, T, 'tint', 0));
  P.push(beam(-0.05, 1.9, 0, 0.9, 2.9, 0.3, 0.12, T, 0), beam(-0.1, 2.0, 0, -0.85, 3.0, -0.4, 0.11, T, 0), beam(-0.1, 2.1, 0.05, 0.15, 3.1, 0.85, 0.1, T, 0));
  canopy.forEach((c, i) => P.push(blob(c[0], 1, c[1], c[2], c[3], c[4], c[5], c[6], WHITE, 2, (pear ? 610 : 510) + i)));
  const main = canopy[0], RED = pear ? [0xc8c45a, 0xb8b84a, 0xd0b050] : [0xc8302a, 0xb82a24, 0xd8a030, 0xc8402a];
  for (let k = 0; k < 13; k++) {
    const a = rnd() * Math.PI * 2, v = -0.45 + rnd() * 0.85, w = Math.sqrt(1 - v * v) * 1.02;
    const x = main[1] + Math.cos(a) * main[0] * main[4] * w, y = main[2] + v * main[0] * main[5] * 1.02, z = main[3] + Math.sin(a) * main[0] * main[6] * w;
    P.push(blob(pear ? 0.12 : 0.13, 0, x, y, z, 1, pear ? 1.35 : 1, 1, RED[k % RED.length], 7, 700 + k));
  }
}

function speciesGeo(id, lod) {
  id = GEO_ALIAS[id] || id;
  const dec = DECID.has(id) ? 2 : BLOSSOM.has(id) ? 3 : 1;
  const parts = [];
  switch (id) {
    case 'oak':
      if (lod) { parts.push(cyl(0.5, 0.6, 5, 4, 0, TRUNK, 0), blob(4.2, 0, 0, 8, 0, 1.1, 0.85, 1.1, WHITE, dec, 3)); break; }
      parts.push(cyl(0.32, 0.5, 6, 5, 0, TRUNK, 0),
        blob(3.3, 1, 0, 8.2, 0, 1, 0.85, 1, WHITE, dec, 11), blob(2.6, 1, 2.0, 7.0, 0.8, 1, 0.8, 1, WHITE, dec, 12),
        blob(2.5, 1, -1.8, 7.2, -1.1, 1, 0.8, 1, WHITE, dec, 13), blob(2.2, 1, 0.4, 10.2, -0.5, 1, 0.8, 1, WHITE, dec, 14));
      break;
    case 'birch':
      if (lod) { parts.push(cyl(0.3, 0.3, 6, 4, 0, 0xe8e4dc, 0), blob(2.8, 0, 0, 9, 0, 0.9, 1.3, 0.9, WHITE, dec, 3)); break; }
      parts.push(cyl(0.2, 0.3, 9, 5, 0, 0xe9e5dd, 0), box(0.42, 0.25, 0.42, 0, 2.2, 0, 0x2a2622, 0), box(0.4, 0.2, 0.4, 0, 4.6, 0, 0x2a2622, 0),
        blob(2.2, 1, 0, 9.5, 0, 0.9, 1.3, 0.9, WHITE, dec, 21), blob(1.8, 1, 0.9, 11.6, 0.3, 0.9, 1.1, 0.9, WHITE, dec, 22), blob(1.7, 1, -0.8, 8.2, -0.4, 0.9, 1, 0.9, WHITE, dec, 23));
      break;
    case 'poplar':
      if (lod) { parts.push(cone(2.2, 16, 4, 2, WHITE, dec)); break; }
      parts.push(cyl(0.25, 0.4, 4, 5, 0, TRUNK, 0), blob(2.0, 1, 0, 10, 0, 1, 3.4, 1, WHITE, dec, 31));
      break;
    case 'pine':
      if (lod) { parts.push(cone(3.2, 14, 4, 2, WHITE, 1)); break; }
      parts.push(cyl(0.25, 0.4, 4, 5, 0, TRUNK, 0), cone(3.4, 5.5, 7, 2.5, WHITE, 1), cone(2.7, 5, 7, 5.6, WHITE, 1), cone(1.9, 4.5, 7, 8.7, WHITE, 1), cone(1.1, 3.5, 6, 11.6, WHITE, 1));
      break;
    case 'spruce':
      if (lod) { parts.push(cone(2.6, 20, 4, 1.5, WHITE, 1)); break; }
      parts.push(cyl(0.25, 0.45, 3, 5, 0, TRUNK, 0), cone(3.0, 6, 7, 1.5, WHITE, 1), cone(2.5, 5.5, 7, 5.0, WHITE, 1), cone(2.0, 5, 7, 8.4, WHITE, 1), cone(1.4, 4.5, 6, 11.8, WHITE, 1), cone(0.8, 4, 6, 15, WHITE, 1));
      break;
    case 'palm': {
      if (lod) { parts.push(cyl(0.3, 0.3, 10, 3, 0, 0x8a6a44, 0), blob(3.5, 0, 0.8, 11, 0, 1.2, 0.35, 1.2, WHITE, 1, 5)); break; }
      let x = 0, y = 0;
      for (let s = 0; s < 5; s++) { // gently curved trunk
        const g = new THREE.CylinderGeometry(0.28 - s * 0.03, 0.36 - s * 0.03, 2.4, 6);
        g.rotateZ(-0.05 - s * 0.05); g.translate(x + 0.08 + s * 0.06, y + 1.2, 0);
        parts.push(D.colorGeo(g, s % 2 ? 0x8a6a44 : 0x7a5c3a, 'tint', 0));
        x += 0.12 + s * 0.13; y += 2.35;
      }
      for (let f = 0; f < 8; f++) {
        const ang = f / 8 * Math.PI * 2 + 0.2;
        const leaf = new THREE.BufferGeometry();
        const L = 5.2, Wd = 0.85, pts = [];
        const seg = 4;
        for (let k = 0; k < seg; k++) {
          const t0 = k / seg, t1 = (k + 1) / seg;
          const y0 = -t0 * t0 * 2.6, y1 = -t1 * t1 * 2.6;
          const w0 = Wd * Math.sin(Math.PI * (0.15 + t0 * 0.85)), w1 = Wd * Math.sin(Math.PI * (0.15 + t1 * 0.85));
          pts.push(t0 * L, y0, -w0, t1 * L, y1, -w1, t0 * L, y0 + 0.15, 0, t0 * L, y0 + 0.15, 0, t1 * L, y1, -w1, t1 * L, y1 + 0.15, 0);
          pts.push(t0 * L, y0 + 0.15, 0, t1 * L, y1 + 0.15, 0, t0 * L, y0, w0, t0 * L, y0, w0, t1 * L, y1 + 0.15, 0, t1 * L, y1, w1);
        }
        leaf.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        leaf.rotateZ(0.25); leaf.rotateY(ang); leaf.translate(x, y + 0.1, 0);
        leaf.computeVertexNormals();
        parts.push(D.colorGeo(leaf, WHITE, 'tint', 1));
      }
      break;
    }
    case 'jungle':
      if (lod) { parts.push(cyl(0.5, 0.5, 12, 3, 0, TRUNK, 0), blob(5.5, 0, 0, 14, 0, 1.2, 0.45, 1.2, WHITE, 1, 9)); break; }
      parts.push(cyl(0.4, 0.75, 13, 6, 0, 0x7a6048, 0),
        blob(4.6, 1, 0, 14.5, 0, 1.25, 0.42, 1.25, WHITE, 1, 41), blob(3.4, 1, 2.6, 12.8, 1.2, 1.2, 0.4, 1.2, WHITE, 1, 42),
        blob(3.2, 1, -2.4, 13, -1.4, 1.2, 0.4, 1.2, WHITE, 1, 43), blob(2.4, 1, 0.5, 16.2, 0.6, 1.2, 0.45, 1.2, WHITE, 1, 44));
      break;
    case 'blossom':
      if (lod) { parts.push(cyl(0.3, 0.4, 3, 4, 0, 0x5a3e2c, 0), blob(3.2, 0, 0, 5.2, 0, 1.2, 0.8, 1.2, WHITE, 3, 7)); break; }
      parts.push(cyl(0.22, 0.38, 3.2, 5, 0, 0x5a3e2c, 0),
        blob(2.4, 1, 0, 5.4, 0, 1.2, 0.75, 1.2, WHITE, 3, 51), blob(1.9, 1, 1.8, 4.8, 0.5, 1.1, 0.7, 1.1, WHITE, 3, 52),
        blob(1.8, 1, -1.6, 4.9, -0.8, 1.1, 0.7, 1.1, WHITE, 3, 53), blob(1.6, 1, 0.2, 6.6, -1.0, 1.1, 0.7, 1.1, WHITE, 3, 54));
      break;
    case 'cactus':
      if (lod) { parts.push(box(0.9, 6, 0.9, 0, 0, 0, 0x5f8a3a, 5)); break; }
      parts.push(cyl(0.42, 0.48, 6.2, 7, 0, 0x5f8a3a, 5), cone(0.42, 0.35, 7, 6.2, 0x6f9a46, 5));
      { const a1 = new THREE.CylinderGeometry(0.28, 0.28, 1.4, 6); a1.rotateZ(Math.PI / 2); a1.translate(0.9, 2.6, 0); parts.push(D.colorGeo(a1, 0x5f8a3a, 'tint', 5)); }
      parts.push(cyl(0.28, 0.28, 2.0, 6, 3.3 - 0.8, 0x5f8a3a, 5).translate(1.55, 0, 0));
      { const a2 = new THREE.CylinderGeometry(0.25, 0.25, 1.1, 6); a2.rotateZ(Math.PI / 2); a2.translate(-0.8, 3.6, 0); parts.push(D.colorGeo(a2, 0x5f8a3a, 'tint', 5)); }
      parts.push(cyl(0.25, 0.25, 1.5, 6, 3.6, 0x5f8a3a, 5).translate(-1.3, 0, 0));
      break;
    case 'bush':
      if (lod) { parts.push(blob(1.6, 0, 0, 1.1, 0, 1.2, 0.8, 1.2, WHITE, 1, 2)); break; }
      parts.push(blob(1.3, 1, 0, 1.1, 0, 1.2, 0.8, 1.2, WHITE, 1, 61), blob(1.0, 1, 1.0, 0.9, 0.3, 1.1, 0.8, 1.1, WHITE, 1, 62), blob(0.9, 1, -0.8, 0.8, -0.4, 1.1, 0.8, 1.1, WHITE, 1, 63));
      break;
    case 'scrub':
      if (lod) { parts.push(blob(1.2, 0, 0, 0.6, 0, 1.3, 0.6, 1.3, WHITE, 1, 2)); break; }
      parts.push(blob(0.9, 0, 0, 0.6, 0, 1.4, 0.6, 1.3, WHITE, 1, 71), blob(0.7, 0, 1.0, 0.45, 0.4, 1.2, 0.6, 1.2, WHITE, 1, 72), blob(0.6, 0, -0.8, 0.4, -0.5, 1.2, 0.6, 1.2, WHITE, 1, 73));
      break;
    case 'flowers':
      if (lod) { parts.push(box(2.4, 0.4, 2.4, 0, 0, 0, WHITE, 1)); break; }
      parts.push(box(2.6, 0.25, 2.6, 0, 0, 0, 0x4a7a2e, 0));
      for (let f = 0; f < 9; f++) parts.push(blob(0.28, 0, (f % 3 - 1) * 0.8, 0.45, (Math.floor(f / 3) - 1) * 0.8, 1, 0.8, 1, WHITE, 1, 80 + f));
      break;
    case 'rock':
      if (lod) { parts.push(blob(2, 0, 0, 0.7, 0, 1.2, 0.7, 1, WHITE, 4, 3)); break; }
      parts.push(blob(1.8, 0, 0, 0.9, 0, 1.3, 0.8, 1.1, WHITE, 4, 91), blob(1.0, 0, 1.4, 0.4, 0.8, 1.1, 0.8, 1, WHITE, 4, 92));
      break;

    // ---- medieval props ------------------------------------------------------------
    case 'lantern': { // oak post, iron bracket along +x, glazed lantern (glows at night)
      const OAK = 0x5a4430, IRON = 0x2a2624, GLASS = 0xffd890;
      if (lod) { parts.push(cyl(0.1, 0.12, 3.35, 4, 0, OAK, 0), box(0.86, 0.07, 0.07, 0.4, 3.05, 0, IRON, 0), box(0.28, 0.36, 0.28, 0.74, 2.48, 0, GLASS, 6)); break; }
      parts.push(speckle(box(0.4, 0.28, 0.4, 0, 0, 0, 0x7a7468, 0), 0.25, 131), cyl(0.085, 0.12, 3.2, 6, 0.2, OAK, 0), box(0.2, 0.08, 0.2, 0, 3.4, 0, OAK, 0),
        box(0.86, 0.07, 0.07, 0.4, 3.05, 0, IRON, 0), beam(0.06, 2.55, 0, 0.5, 3.07, 0, 0.05, IRON, 0),
        box(0.03, 0.16, 0.03, 0.74, 2.9, 0, IRON, 0), box(0.32, 0.05, 0.32, 0.74, 2.43, 0, IRON, 0),
        box(0.25, 0.34, 0.25, 0.74, 2.48, 0, GLASS, 6),
        cone(0.24, 0.18, 4, 2.82, IRON, 0).rotateY(Math.PI / 4).translate(0.74, 0, 0));
      for (let k = 0; k < 4; k++) parts.push(box(0.035, 0.36, 0.035, 0.74 + (k & 1 ? 0.13 : -0.13), 2.47, k & 2 ? 0.13 : -0.13, IRON, 0));
      break;
    }
    case 'wattle': { // woven hazel hurdle, 3 m along local x
      const ST = 0x6a5238;
      if (lod) { parts.push(box(3.0, 0.95, 0.1, 0, 0.1, 0, 0xffffff, 4), box(0.08, 1.2, 0.08, -1.45, 0, 0, ST, 0)); break; }
      for (let k = 0; k < 4; k++) parts.push(cyl(0.035, 0.045, 1.22, 4, 0, ST, 0).translate(-1.5 + k * 1.0, 0, 0));
      for (let b = 0; b < 5; b++) {
        const y = 0.14 + b * 0.19;
        for (let k = 0; k < 3; k++) parts.push(box(1.02, 0.17, 0.05, -1.0 + k * 1.0, y, ((k + b) % 2 ? 0.03 : -0.03), b % 2 ? 0xe8dcc8 : 0xffffff, 4));
      }
      break;
    }
    case 'hedge':
      parts.push(box(3.1, 1.6, 1.2, 0, 0, 0, WHITE, 1));
      break;
    case 'barrels':
      barrel(parts, -0.4, -0.15, false, 0.3, lod);
      barrel(parts, 0.38, -0.25, false, 1.1, lod);
      barrel(parts, 0.02, 0.55, true, 0.25, lod);
      break;
    case 'haystack': { // rounded rick with a darker thatched cap
      const HAY = 0xd2b068, CAP = 0xa08a5c;
      if (lod) { parts.push(cyl(1.95, 1.85, 2.6, 6, 0, HAY, 5), cone(2.05, 2.4, 6, 2.6, HAY, 5)); break; }
      const body = new THREE.CylinderGeometry(2.0, 1.85, 2.6, 12, 2); body.translate(0, 1.3, 0);
      { const p = body.attributes.position; for (let k = 0; k < p.count; k++) if (Math.abs(p.getY(k) - 1.3) < 0.01) { p.setX(k, p.getX(k) * 1.04); p.setZ(k, p.getZ(k) * 1.04); } }
      const dome = new THREE.SphereGeometry(2.02, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.02, 1); dome.translate(0, 2.6, 0);
      const cap = new THREE.SphereGeometry(2.1, 12, 2, 0, Math.PI * 2, 0, 0.62); cap.translate(0, 2.6, 0);
      parts.push(speckle(D.colorGeo(body, HAY, 'tint', 5), 0.22, 171), speckle(D.colorGeo(dome, HAY, 'tint', 5), 0.22, 172),
        speckle(D.colorGeo(cap, CAP, 'tint', 5), 0.2, 173), cyl(0.07, 0.12, 0.4, 5, 4.62, 0x6a5238, 0));
      break;
    }
    case 'cart': { // two-wheeled handcart resting on its legs, a sack and a crate aboard
      const WD = 0xffffff, DK = 0x4a3a2a, WH = 0x5a4430;
      if (lod) { parts.push(box(1.2, 0.4, 1.9, 0, 0.62, 0, WD, 4), box(0.1, 1.15, 1.15, -0.7, 0, -0.3, DK, 0), box(0.1, 1.15, 1.15, 0.7, 0, -0.3, DK, 0)); break; }
      parts.push(box(1.2, 0.08, 1.9, 0, 0.62, 0, WD, 4),
        box(0.06, 0.32, 1.9, -0.6, 0.7, 0, 0xe8e0d4, 4), box(0.06, 0.32, 1.9, 0.6, 0.7, 0, 0xe8e0d4, 4),
        box(1.2, 0.32, 0.06, 0, 0.7, -0.95, 0xe8e0d4, 4), box(1.2, 0.26, 0.06, 0, 0.7, 0.95, 0xe8e0d4, 4),
        beam(-0.45, 0.72, 0.9, -0.38, 0.62, 2.05, 0.07, DK, 0), beam(0.45, 0.72, 0.9, 0.38, 0.62, 2.05, 0.07, DK, 0),
        box(0.07, 0.62, 0.07, -0.5, 0, 0.8, DK, 0), box(0.07, 0.62, 0.07, 0.5, 0, 0.8, DK, 0),
        cylX(0.04, 1.5, 5, 0, 0.58, -0.3, DK, 0));
      for (const sx of [-0.72, 0.72]) {
        parts.push(wheelRing(0.54, 0.055, sx, 0.58, -0.3, WH, 0), cylX(0.09, 0.14, 6, sx, 0.58, -0.3, DK, 0));
        for (let k = 0; k < 3; k++) { const g = new THREE.BoxGeometry(0.04, 1.06, 0.05); g.rotateX(k * Math.PI / 3); g.translate(sx, 0.58, -0.3); parts.push(D.colorGeo(g, WH, 'tint', 0)); }
      }
      parts.push(speckle(blob(0.34, 0, 0.12, 0.92, -0.3, 1.1, 0.8, 1.35, 0xc8b48a, 0, 181), 0.15, 182));
      crate(parts, 0.45, -0.25, 0.66, 0.45, 0.3);
      break;
    }
    case 'crates': { // a stack of crates and a couple of sacks
      const SACK = 0xc8b48a;
      if (lod) { parts.push(box(0.9, 0.9, 0.9, -0.4, 0, 0, WHITE, 4), box(0.75, 0.7, 0.75, 0.52, 0, -0.35, WHITE, 4), blob(0.4, 0, 0.6, 0.35, 0.5, 1, 1.1, 1, SACK, 0, 5)); break; }
      crate(parts, 0.9, -0.42, 0, 0.05, 0.2);
      crate(parts, 0.62, -0.36, 0.9, 0.02, 0.65);
      crate(parts, 0.72, 0.52, 0, -0.38, -0.25);
      parts.push(speckle(blob(0.36, 0, 0.56, 0.38, 0.55, 1, 1.15, 0.95, SACK, 0, 191), 0.15, 192), cyl(0.06, 0.09, 0.16, 5, 0.76, 0xa89470, 0).translate(0.56, 0, 0.55),
        speckle(blob(0.33, 0, 1.0, 0.26, 0.18, 1.35, 0.78, 0.95, 0xbca47a, 0, 193), 0.15, 194));
      break;
    }
    case 'woodpile': { // stacked split logs with a chopping block and axe
      const BARK = 0x6a4a30, END = 0xc9a472;
      if (lod) { parts.push(endCol(box(1.9, 0.75, 1.0, 0, 0, 0, BARK, 0), 0, END)); break; }
      const rnd = D.rng(2020);
      const rows = [[4, 0.14, 0.3], [3, 0.4, 0.3], [2, 0.66, 0.3]];
      rows.forEach(([n, y, sp]) => {
        for (let k = 0; k < n; k++) {
          const r = 0.12 + rnd() * 0.04, z = (k - (n - 1) / 2) * sp;
          parts.push(endCol(cylX(r, 1.75 + rnd() * 0.15, 6, (rnd() - 0.5) * 0.14, y, z, BARK, 0), 0, END));
        }
      });
      parts.push(endCol(cyl(0.28, 0.31, 0.48, 7, 0, BARK, 0).translate(1.35, 0, 0.45), 1, END),
        beam(1.3, 0.44, 0.45, 1.05, 1.05, 0.58, 0.045, 0x8a6a44, 0), box(0.2, 0.12, 0.03, 1.3, 0.4, 0.45, 0x3a3634, 0));
      break;
    }
    case 'stook': { // four sheaves leaning together
      const ST = 0xd8b865, BAND = 0xa88a40;
      if (lod) { parts.push(cone(0.55, 1.45, 5, 0, ST, 5)); break; }
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const sheaf = [cyl(0.1, 0.19, 1.3, 6, 0, ST, 5), cone(0.19, 0.34, 6, 1.28, 0xe2c472, 5), cyl(0.13, 0.14, 0.07, 6, 0.72, BAND, 5)];
        sheaf.forEach((g, i) => { speckle(g, 0.25, 210 + k * 3 + i); g.translate(0.28, 0, 0); g.rotateZ(0.17); g.rotateY(a); parts.push(g); });
      }
      break;
    }
    case 'drystone': { // 3 m drystone wall along local x: two courses and a coping of upright stones
      if (lod) {
        const g = new THREE.BoxGeometry(3.0, 1.1, 0.66); g.translate(0, 0.55, 0);
        const p = g.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) > 0.6) p.setZ(k, p.getZ(k) * 0.6);
        parts.push(D.colorGeo(g, 0xcac2b6, 'tint', 4)); break;
      }
      const rnd = D.rng(221), SC = [0xd6d0c6, 0xbfb8ac, 0xcac2b2, 0xb2ab9e];
      for (let k = 0; k < 5; k++) parts.push(blob(0.34, 0, -1.2 + k * 0.6 + (rnd() - 0.5) * 0.1, 0.26, (rnd() - 0.5) * 0.06, 1.0 + rnd() * 0.25, 0.72, 1.05, SC[k % 4], 4, 300 + k));
      for (let k = 0; k < 4; k++) parts.push(blob(0.31, 0, -0.9 + k * 0.6 + (rnd() - 0.5) * 0.1, 0.7, (rnd() - 0.5) * 0.05, 1.02, 0.62, 0.95, SC[(k + 2) % 4], 4, 310 + k));
      for (let k = 0; k < 6; k++) parts.push(blob(0.22, 0, -1.25 + k * 0.5, 1.0, 0, 0.9, 0.9, 1.1, SC[(k + 1) % 4], 4, 320 + k));
      break;
    }
    case 'veg': { // two rows of cabbages and a row of leeks (2.4 x 2 m)
      if (lod) { for (let r = 0; r < 3; r++) parts.push(box(2.3, r === 2 ? 0.4 : 0.26, 0.42, 0, 0, -0.7 + r * 0.7, r === 2 ? 0xdde8c8 : WHITE, 9)); break; }
      for (let r = 0; r < 2; r++) for (let k = 0; k < 5 - r; k++) {
        const x = -1.0 + k * 0.5 + (r ? 0.25 : 0);
        parts.push(blob(0.21, 0, x, 0.14, -0.7 + r * 0.7, 1, 0.68, 1, (k + r) % 2 ? 0xe4f0d4 : WHITE, 9, 400 + r * 10 + k));
      }
      for (let k = 0; k < 7; k++) {
        const x = -1.05 + k * 0.35;
        parts.push(cyl(0.035, 0.045, 0.3, 4, 0, 0xf2f0e0, 0).translate(x, 0, 0.7), cone(0.1, 0.42, 4, 0.26, 0xcfe0b4, 9).rotateY(k * 0.7).translate(x, 0, 0.7));
      }
      break;
    }
    case 'herbs': { // a square knot garden of clipped box, herb clumps and a sundial
      if (lod) { parts.push(box(2.4, 0.28, 2.4, 0, 0, 0, WHITE, 1)); break; }
      parts.push(box(2.4, 0.3, 0.22, 0, 0, -1.09, WHITE, 1), box(2.4, 0.3, 0.22, 0, 0, 1.09, WHITE, 1),
        box(0.22, 0.3, 1.96, -1.09, 0, 0, WHITE, 1), box(0.22, 0.3, 1.96, 1.09, 0, 0, WHITE, 1),
        box(2.6, 0.24, 0.2, 0, 0, 0, 0xe8f0e0, 1).rotateY(Math.PI / 4), box(2.6, 0.24, 0.2, 0, 0, 0, 0xe8f0e0, 1).rotateY(-Math.PI / 4),
        cyl(0.13, 0.13, 0.3, 8, 0, 0xe8f0e0, 1), cyl(0.06, 0.08, 0.62, 6, 0.1, 0xb0aa9c, 0), box(0.24, 0.03, 0.24, 0, 0.72, 0, 0xb0aa9c, 0));
      const HB = [0x9a78c8, 0x8aa27a, 0xd8c050, 0x6a9a50];
      [[0, -0.66], [0.66, 0], [0, 0.66], [-0.66, 0]].forEach(([x, z], i) => parts.push(blob(0.27, 0, x, 0.17, z, 1, 0.62, 1, HB[i], 0, 440 + i)));
      break;
    }
    case 'apple': fruitTree(parts, false, lod); break;
    case 'pear': fruitTree(parts, true, lod); break;
    case 'grave': { // leaning round-topped headstone with an incised cross, and a low mound in front (local -z)
      if (lod) { parts.push(box(0.6, 0.86, 0.16, 0, 0, 0, WHITE, 4), box(0.8, 0.12, 1.7, 0, 0, -0.95, 0x5f7a3c, 5)); break; }
      const stone = [box(0.72, 0.1, 0.26, 0, 0, 0, WHITE, 4), box(0.6, 0.62, 0.14, 0, 0.08, 0, WHITE, 4)];
      const top = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 8, 1, false, Math.PI / 2, Math.PI); top.rotateX(Math.PI / 2); top.translate(0, 0.7, 0);
      stone.push(D.colorGeo(top, WHITE, 'tint', 4), box(0.07, 0.36, 0.012, 0, 0.3, -0.074, 0x4e4a44, 0), box(0.26, 0.07, 0.012, 0, 0.52, -0.074, 0x4e4a44, 0));
      stone.forEach((g, i) => { speckle(g, 0.18, 260 + i); g.rotateZ(0.045); g.rotateX(-0.035); parts.push(g); });
      parts.push(blob(0.5, 0, 0, 0.02, -0.95, 0.85, 0.26, 1.75, 0x5f7a3c, 5, 271));
      break;
    }
    case 'skep': { // straw bee skeps on a plank bench
      const WD = 0x8a6a44, LEG = 0x6a5238, S1 = 0xc9a050, S2 = 0xb08a44;
      if (lod) { parts.push(box(1.8, 0.07, 0.5, 0, 0.48, 0, WD, 0), box(0.1, 0.48, 0.4, -0.75, 0, 0, LEG, 0), box(0.1, 0.48, 0.4, 0.75, 0, 0, LEG, 0), cone(0.3, 0.52, 6, 0.55, S1, 5).translate(-0.45, 0, 0), cone(0.3, 0.52, 6, 0.55, S1, 5).translate(0.45, 0, 0)); break; }
      parts.push(box(1.8, 0.07, 0.52, 0, 0.48, 0, WD, 0), box(0.1, 0.48, 0.44, -0.75, 0, 0, LEG, 0), box(0.1, 0.48, 0.44, 0.75, 0, 0, LEG, 0));
      const rad = t => 0.3 * Math.sqrt(Math.max(0, 1 - (t / 5.4) * (t / 5.4)));
      for (const sx of [-0.45, 0.45]) {
        for (let k = 0; k < 5; k++) parts.push(cyl(rad(k + 1), rad(k), 0.1, 9, 0.55 + k * 0.1, k % 2 ? S2 : S1, 5).translate(sx, 0, 0));
        parts.push(cone(rad(5), 0.07, 9, 1.05, S1, 5).translate(sx, 0, 0), box(0.12, 0.05, 0.04, sx, 0.56, -0.29, 0x2a2018, 0));
      }
      break;
    }
    case 'netrack': { // two posts, a bar and a drying net that sags between them
      const P1 = 0x6a5238, NET = 0x6e6a58, CORK = 0xc89a40;
      if (lod) { parts.push(box(0.1, 2.2, 0.1, -2.2, 0, 0, P1, 0), box(0.1, 2.2, 0.1, 2.2, 0, 0, P1, 0), box(4.5, 0.08, 0.08, 0, 2.08, 0, P1, 0), box(4.2, 1.3, 0.04, 0, 0.72, 0, NET, 0)); break; }
      for (const sx of [-2.2, 2.2]) parts.push(cyl(0.06, 0.08, 2.25, 5, 0, P1, 0).translate(sx, 0, 0), beam(sx, 0, 0.55, sx, 1.45, 0.04, 0.06, P1, 0));
      parts.push(box(4.6, 0.08, 0.08, 0, 2.1, 0, P1, 0));
      const net = new THREE.PlaneGeometry(4.2, 1.5, 10, 4), p = net.attributes.position;
      const sagY = (u, v) => 2.08 - v * 1.45 - 0.2 * (1 - u * u) * v;
      for (let k = 0; k < p.count; k++) {
        const u = p.getX(k) / 2.1, v = (0.75 - p.getY(k)) / 1.5;
        p.setXYZ(k, p.getX(k) * (1 - 0.04 * v), sagY(u, v), 0.06 * Math.sin(v * Math.PI) * (1 - u * u) + 0.03 * Math.sin(u * 9) * v);
      }
      const ng = speckle(D.colorGeo(net, NET, 'tint', 0), 0.45, 291);
      parts.push(ng, backFace(ng));
      for (let k = 0; k < 7; k++) { const u = -0.85 + k * 0.283; parts.push(box(0.12, 0.07, 0.08, u * 2.1 * 0.96, sagY(u, 1) - 0.05, 0, CORK, 0)); }
      break;
    }
    case 'waycross': { // stone cross with a wheel head on a stepped plinth (fixed colours: roads use it too)
      const SG = 0x9a948a, SG2 = 0x8e887e;
      if (lod) { parts.push(box(1.3, 0.6, 1.3, 0, 0, 0, SG, 0), box(0.28, 2.3, 0.28, 0, 0.6, 0, SG, 0), box(0.95, 0.24, 0.24, 0, 2.3, 0, SG, 0)); break; }
      parts.push(speckle(box(1.5, 0.3, 1.5, 0, 0, 0, SG2, 5), 0.2, 301), speckle(box(1.1, 0.3, 1.1, 0, 0.3, 0, SG, 5), 0.2, 302),
        speckle(box(0.7, 0.35, 0.7, 0, 0.6, 0, SG2, 5), 0.2, 303),
        speckle(cyl(0.12, 0.17, 2.0, 4, 0.95, SG, 0).rotateY(Math.PI / 4), 0.15, 304),
        box(0.95, 0.22, 0.2, 0, 2.35, 0, SG, 0));
      { const t = new THREE.TorusGeometry(0.3, 0.045, 4, 12); t.translate(0, 2.46, 0); parts.push(D.colorGeo(t, SG2, 'tint', 0)); }
      parts.push(box(0.5, 0.05, 0.18, 0.4, 0.3, 0.64, 0x6e8a4a, 0)); // a tuft of moss on the lowest step
      break;
    }
    case 'yew': // broad, dark churchyard yew with a thick reddish trunk
      if (lod) { parts.push(cyl(0.45, 0.6, 2.5, 4, 0, 0x5a3a2a, 0), blob(3.4, 0, 0, 5.2, 0, 1.05, 1.15, 1.05, WHITE, 1, 31)); break; }
      parts.push(cyl(0.38, 0.72, 2.6, 7, 0, 0x5e3e2c, 0),
        blob(3.1, 1, 0, 4.6, 0, 1.1, 0.95, 1.1, WHITE, 1, 331), blob(2.6, 1, 0.3, 6.6, -0.2, 1, 0.95, 1, WHITE, 1, 332),
        blob(1.8, 1, -0.2, 8.2, 0.2, 1, 1, 1, WHITE, 1, 333), blob(2.2, 1, 1.9, 3.4, 1.0, 1, 0.8, 1, WHITE, 1, 334), blob(2.1, 1, -1.9, 3.6, -0.9, 1, 0.8, 1, WHITE, 1, 335));
      break;
    case 'vine': { // 2 m of vineyard row along local x: one post, wires, leafy canes, grapes
      const P1 = 0x6a5238;
      if (lod) { parts.push(box(0.06, 1.6, 0.06, -1, 0, 0, P1, 0), box(2.0, 0.75, 0.36, 0, 0.62, 0, WHITE, 9)); break; }
      parts.push(cyl(0.035, 0.045, 1.65, 4, 0, P1, 0).translate(-1, 0, 0),
        box(2.0, 0.015, 0.015, 0, 0.8, 0, 0x3a3a3a, 0), box(2.0, 0.015, 0.015, 0, 1.3, 0, 0x3a3a3a, 0),
        beam(-0.5, 0, 0, -0.45, 0.82, 0.02, 0.05, 0x5a4030, 0), beam(0.5, 0, 0, 0.53, 0.82, -0.02, 0.05, 0x5a4030, 0),
        blob(0.5, 0, -0.55, 1.05, 0, 1.2, 0.75, 0.55, WHITE, 9, 321), blob(0.5, 0, 0.05, 1.12, 0.02, 1.2, 0.8, 0.55, 0xe8f0d8, 9, 322),
        blob(0.48, 0, 0.6, 1.02, -0.02, 1.15, 0.72, 0.55, WHITE, 9, 323));
      for (let k = 0; k < 6; k++) parts.push(cone(0.07, 0.17, 5, 0, 0x4a2a5a, 7).rotateX(Math.PI).translate(-0.75 + k * 0.3, 0.86, k % 2 ? 0.2 : -0.2));
      break;
    }
    case 'torchpost': { // post with an iron basket and a flame (glows and flickers)
      const WD = 0x5a4430, IRON = 0x2a2624;
      if (lod) { parts.push(cyl(0.08, 0.1, 2.4, 4, 0, WD, 0), cone(0.2, 0.6, 4, 2.45, 0xff8a2a, 6)); break; }
      parts.push(cyl(0.07, 0.1, 2.35, 6, 0, WD, 0), cyl(0.2, 0.1, 0.26, 6, 2.3, IRON, 0),
        cone(0.17, 0.55, 5, 2.5, 0xff7a1a, 6), cone(0.09, 0.72, 5, 2.52, 0xffd070, 6).rotateY(0.6));
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.3; parts.push(blob(0.2, 0, Math.cos(a) * 0.22, 0.07, Math.sin(a) * 0.22, 1, 0.6, 1, 0x8a857c, 5, 340 + k)); }
      break;
    }
    default:
      parts.push(box(0.5, 0.5, 0.5, 0, 0, 0, 0xff00ff, 0));
  }
  const g = D.mergeGeos(parts);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---- Material ------------------------------------------------------------------------
const NU = { uTime: { value: 0 }, uWind: { value: 0.5 }, uNight: { value: 0 } };
function makeMat(far) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = NU.uTime; sh.uniforms.uWind = NU.uWind; sh.uniforms.uNight = NU.uNight;
    sh.uniforms.uSeason = D.TU.uSeason; sh.uniforms.uSnow = D.TU.uSnow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float tint; uniform float uTime, uWind, uSnow; uniform vec4 uSeason; varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float tt = tint;
bool nCanopy = (tt > 1.5 && tt < 3.5) || (tt > 6.5 && tt < 7.5);
if (nCanopy) { float bare = uSeason.w; transformed.xz *= mix(1.0, 0.28, bare); transformed.y *= mix(1.0, 0.9, bare); }
if ((tt > 0.5 && tt < 3.5) || (tt > 6.5 && tt < 7.5) || (tt > 8.5 && tt < 9.5)) {
  float ph = uTime * 1.4 + instanceMatrix[3].x * 0.043 + instanceMatrix[3].z * 0.061;
  float s = (sin(ph) + 0.5 * sin(ph * 2.3 + 1.0)) * uWind * 0.012 * transformed.y;
  transformed.x += s; transformed.z += s * 0.6;
}`)
      .replace('#include <color_vertex>', `
vColor = color;
float ih = fract(sin(instanceMatrix[3].x * 0.0131 + instanceMatrix[3].z * 0.0173) * 43758.5453);
vGlow = step(5.5, tint) * step(tint, 6.5) * (0.82 + 0.18 * sin(uTime * (7.0 + 5.0 * ih) + ih * 40.0));
if ((tint > 0.5 && tint < 4.5) || (tint > 8.5 && tint < 9.5)) {
  vec3 ic = instanceColor;
  if (tint > 1.5 && tint < 2.5) {
    vec3 aut = mix(vec3(0.80, 0.22, 0.03), vec3(0.92, 0.55, 0.05), ih);
    ic = mix(ic, ic * vec3(1.15, 1.2, 0.85), uSeason.x * 0.6);
    ic = mix(ic, aut, uSeason.z * 0.9);
    ic = mix(ic, vec3(0.16, 0.12, 0.09), uSeason.w);
  } else if (tint > 2.5 && tint < 3.5) {
    vec3 green = vec3(0.16, 0.30, 0.08);
    ic = mix(ic, mix(ic, green, 0.75), uSeason.y);
    ic = mix(ic, vec3(0.75, 0.30, 0.05), uSeason.z);
    ic = mix(ic, vec3(0.14, 0.10, 0.08), uSeason.w);
  } else if (tint > 8.5) {
    ic = mix(ic, ic * vec3(1.1, 1.18, 0.9), uSeason.x * 0.5);
    ic = mix(ic, ic * vec3(1.35, 1.0, 0.45) + vec3(0.06, 0.03, 0.0), uSeason.z * 0.55);
    ic = mix(ic, vec3(0.20, 0.15, 0.09), uSeason.w * 0.75);
  }
  vColor *= ic;
} else if (tint > 6.5 && tint < 7.5) {
  vec3 ripe = color;
  vColor = vec3(0.92, 0.80, 0.84) * uSeason.x + mix(ripe, vec3(0.20, 0.34, 0.07), 0.5) * uSeason.y + ripe * uSeason.z + vec3(0.16, 0.12, 0.09) * uSeason.w;
}
float snowK = uSnow * smoothstep(0.25, 0.75, normal.y) * max(step(0.5, tint) * step(tint, 5.5), step(6.5, tint));
vColor = mix(vColor, vec3(0.86, 0.88, 0.92), clamp(snowK * 1.2, 0.0, 1.0));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight; varying float vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * (0.3 + uNight * 6.0);`);
    if (sh.vertexShader.indexOf('nCanopy') < 0 || sh.vertexShader.indexOf('vGlow = step') < 0 || sh.fragmentShader.indexOf('vGlow *') < 0 && sh.fragmentShader.indexOf('* vGlow') < 0)
      console.warn('Nature: shader injection did not apply');
  };
  m.customProgramCacheKey = () => 'dio-nature-2';
  return m;
}

// ---- Rendering ---------------------------------------------------------------------------
Nature.init = function (scene) {
  Nature.scene = scene;
  Nature.mat = makeMat(false);
  Nature.meshes = SPECIES.map((sp, i) => {
    // three tiers: close (full detail + casts shadows, inside the shadow map), near (full detail),
    // far (low-poly LOD). Only the close tier pays for the shadow pass.
    const near = new THREE.InstancedMesh(speciesGeo(sp.id, false), Nature.mat, 256);
    const close = new THREE.InstancedMesh(near.geometry, Nature.mat, 256);
    const far = new THREE.InstancedMesh(sp.id === 'hedge' ? near.geometry : speciesGeo(sp.id, true), Nature.mat, 256);
    [close, near, far].forEach(m => {
      m.count = 0; m.frustumCulled = false; m.visible = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    });
    close.castShadow = true; close.receiveShadow = true;
    near.castShadow = false; near.receiveShadow = true;
    far.castShadow = false; far.receiveShadow = true;
    return { close, near, far };
  });
  // precomputed linear colours per species
  Nature.cols = SPECIES.map(sp => sp.cols.map(c => D.lin(c)));
  D.History.regStore('nature', Nature);
  D.on('terrain:h', (i0, j0, i1, j1) => {
    const c0 = chunkOf(i0 * CELL - 1, j0 * CELL - 1), c1 = chunkOf(i1 * CELL + 1, j1 * CELL + 1);
    for (let cz = Math.floor(c0 / NCH); cz <= Math.floor(c1 / NCH); cz++) for (let cx = c0 % NCH; cx <= c1 % NCH; cx++) reseat.add(cz * NCH + cx);
  });
  D.on('world:reset', () => Nature.clearAll());
};
const reseat = new Set();

function ensureCap(m, n) {
  if (m.instanceMatrix.count >= n) return m;
  let cap = m.instanceMatrix.count; while (cap < n) cap *= 2;
  const im = new THREE.InstancedMesh(m.geometry, m.material, cap);
  im.count = 0; im.frustumCulled = false; im.castShadow = m.castShadow; im.receiveShadow = m.receiveShadow; im.visible = m.visible;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Nature.scene.remove(m); m.dispose();
  Nature.scene.add(im);
  return im;
}

let lastCam = new THREE.Vector3(1e9, 0, 0), rebuildTimer = 0;
Nature.visibleCount = 0;

Nature.update = function (dt, camera) {
  NU.uTime.value = (Date.now() * 0.001) % 10000;
  NU.uWind.value = 0.35 + D.Env.wind * 0.9 + (D.Env.weather === 'storm' ? 1.4 : D.Env.weather === 'rain' ? 0.4 : 0);
  NU.uNight.value = D.Env.night;
  if (reseat.size && !D.History.active()) {
    reseat.forEach(ci => {
      const c = chunks[ci];
      for (let k = 0; k < c.n; k++) { const o = k * STRIDE; c.d[o + 2] = D.Terrain.hAt(c.d[o], c.d[o + 1]); }
    });
    reseat.clear(); dirtyRender = true;
  }
  if (dirtyForest.size && !D.History.active()) { updateForest(); }
  rebuildTimer -= dt;
  const moved = lastCam.distanceTo(camera.position);
  const thresh = D.clamp(D.Cam.distance() * 0.12, 60, 600);
  if ((dirtyRender && rebuildTimer <= 0) || (moved > thresh && rebuildTimer <= 0)) {
    rebuild(camera.position);
    lastCam.copy(camera.position);
    dirtyRender = false; rebuildTimer = 0.1;
  }
  const vis = D.Layers ? D.Layers.visible('nature') : true;
  for (const m of Nature.meshes) { m.close.visible = vis && m.close.count > 0; m.near.visible = vis && m.near.count > 0; m.far.visible = vis && m.far.count > 0; }
};

// One sweep over every chunk instance and every extra, used for BOTH the counting pass
// and the filling pass so the visibility predicate (distance, LOD class, hide mask) is
// guaranteed identical in both.
const nN = new Int32Array(SPECIES.length), nF = new Int32Array(SPECIES.length), nC = new Int32Array(SPECIES.length);
const SW = { cx: 0, cy: 0, cz: 0, fx: 0, fz: 0, sb: 0, farD2: 0, sea: 0, write: false, total: 0 };
// per-category full-detail and LOD ranges (squared), filled in rebuild()
const CAT_NEAR2 = {}, CAT_FAR2 = {};
function sweepOne(d, o, sp) {
  const x = d[o], z = d[o + 1], y = d[o + 2];
  const ex = x - SW.cx, ey = y - SW.cy, ez = z - SW.cz;
  const d2 = ex * ex + ey * ey + ez * ez;
  const spec = SPECIES[sp];
  // tier 0 close (shadow caster), 1 near, 2 far
  let tier;
  if (d2 < CAT_NEAR2[spec.cat]) tier = (Math.abs(x - SW.fx) < SW.sb && Math.abs(z - SW.fz) < SW.sb) ? 0 : 1;
  else if (d2 < CAT_FAR2[spec.cat]) tier = 2;
  else return;
  if (!SW.write) { if (tier === 2) nF[sp]++; else if (tier === 1) nN[sp]++; else nC[sp]++; return; }
  const M = Nature.meshes[sp];
  const m = tier === 2 ? M.far : tier === 1 ? M.near : M.close;
  const idx = tier === 2 ? nF[sp]++ : tier === 1 ? nN[sp]++ : nC[sp]++;
  let seed = d[o + 6];
  if (!(seed >= 0 && seed < 1)) seed = seed === seed ? D.fract(Math.sin(seed * 12.9898) * 43758.5453) : 0.5;
  const s = d[o + 4], r = d[o + 5];
  const drown = y < SW.sea - 1 && spec.cat !== 'rock';
  const cs = Math.cos(r), sn = Math.sin(r);
  const hv = spec.noScale ? 1 : 0.85 + seed * 0.3;
  const e = m.instanceMatrix.array, b = idx * 16;
  const sc = drown ? 0.0001 : s;
  e[b] = cs * sc; e[b + 1] = 0; e[b + 2] = -sn * sc; e[b + 3] = 0;
  e[b + 4] = 0; e[b + 5] = sc * hv; e[b + 6] = 0; e[b + 7] = 0;
  e[b + 8] = sn * sc; e[b + 9] = 0; e[b + 10] = cs * sc; e[b + 11] = 0;
  e[b + 12] = x; e[b + 13] = y - 0.15; e[b + 14] = z; e[b + 15] = 1;
  const cols = Nature.cols[sp];
  const col = cols[Math.floor(seed * 997) % cols.length];
  const v = 0.86 + ((seed * 7919) % 1) * 0.28;
  const ca = m.instanceColor.array;
  ca[idx * 3] = col.r * v; ca[idx * 3 + 1] = col.g * v; ca[idx * 3 + 2] = col.b * v;
  SW.total++;
}
function sweep(cp, write) {
  const S = SPECIES.length, hf = hideFn, farD = Math.sqrt(SW.farD2);
  nN.fill(0); nF.fill(0); nC.fill(0);
  SW.write = write; SW.total = 0;
  for (let ci = 0; ci < chunks.length; ci++) {
    const c = chunks[ci]; if (!c.n) continue;
    const x0 = (ci % NCH) * CHS, z0 = Math.floor(ci / NCH) * CHS;
    const dx = Math.max(x0 - cp.x, 0, cp.x - x0 - CHS), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - CHS);
    if (dx * dx + dz * dz > SW.farD2) continue;
    const d = c.d;
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE, sp = d[o + 3];
      if (!(sp >= 0 && sp < S)) continue;
      if (hf && HIDEABLE[sp] && hf(d[o], d[o + 1])) continue;
      sweepOne(d, o, sp);
    }
  }
  extras.forEach(e => {
    const bb = e.bb;
    const dx = Math.max(bb[0] - cp.x, 0, cp.x - bb[2]), dz = Math.max(bb[1] - cp.z, 0, cp.z - bb[3]);
    if (dx > farD || dz > farD || dx * dx + dz * dz > SW.farD2) return;
    const a = e.a;
    for (let k = 0; k < e.n; k++) {
      const o = k * STRIDE, sp = a[o + 3] | 0;
      if (sp < 0 || sp >= S) continue;
      sweepOne(a, o, sp);
    }
  });
}
function rebuild(cp) {
  const hi = D.Q.high;
  const farD = hi ? 6800 : 3800;
  const near = { tree: hi ? 1500 : 900, bush: hi ? 700 : 450, rock: hi ? 900 : 500, prop: hi ? 480 : 320 };
  const far = { tree: farD, bush: farD * 0.6, rock: farD * 0.6, prop: hi ? 1400 : 900 };
  for (const c in near) { CAT_NEAR2[c] = near[c] * near[c]; CAT_FAR2[c] = far[c] * far[c]; }
  SW.cx = cp.x; SW.cy = cp.y; SW.cz = cp.z;
  // shadow-casting box around the camera focus, a little larger than the sun's shadow frustum
  const f = D.Cam && D.Cam.focusPoint ? D.Cam.focusPoint() : cp;
  SW.fx = f.x; SW.fz = f.z;
  SW.sb = D.clamp((D.Cam && D.Cam.distance ? D.Cam.distance() : 1000) * 1.15, 260, hi ? 5200 : 3200) * 1.25;
  SW.farD2 = farD * farD; SW.sea = W.seaLevel;
  const S = SPECIES.length;
  // pass 1: count
  sweep(cp, false);
  for (let s = 0; s < S; s++) {
    const M = Nature.meshes[s];
    M.close = ensureCap(M.close, nC[s]);
    M.near = ensureCap(M.near, nN[s]);
    M.far = ensureCap(M.far, nF[s]);
  }
  // pass 2: fill
  sweep(cp, true);
  for (let s = 0; s < S; s++) {
    const M = Nature.meshes[s];
    M.close.count = nC[s]; M.near.count = nN[s]; M.far.count = nF[s];
    for (const m of [M.close, M.near, M.far]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  Nature.visibleCount = SW.total;
}

// ---- Forest density (tints distant terrain like a canopy) ---------------------------
function updateForest() {
  const F = W.forest;
  let i0 = N, j0 = N, i1 = 0, j1 = 0;
  dirtyForest.forEach(ci => {
    const cx = ci % NCH, cz = Math.floor(ci / NCH);
    i0 = Math.min(i0, cx * CHUNK); j0 = Math.min(j0, cz * CHUNK);
    i1 = Math.max(i1, cx * CHUNK + CHUNK); j1 = Math.max(j1, cz * CHUNK + CHUNK);
  });
  dirtyForest.clear();
  const w = i1 - i0 + 1, h = j1 - j0 + 1;
  const acc = new Float32Array(w * h);
  const hf = hideFn;
  const cx0 = Math.max(0, Math.floor(i0 / CHUNK) - 1), cx1 = Math.min(NCH - 1, Math.floor(i1 / CHUNK) + 1);
  const cz0 = Math.max(0, Math.floor(j0 / CHUNK) - 1), cz1 = Math.min(NCH - 1, Math.floor(j1 / CHUNK) + 1);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = chunks[cz * NCH + cx];
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      const sp = SPECIES[c.d[o + 3]];
      if (!sp || sp.cat !== 'tree') continue;
      if (hf && hf(c.d[o], c.d[o + 1])) continue;
      const i = Math.round(c.d[o] / CELL) - i0, j = Math.round(c.d[o + 1] / CELL) - j0;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      acc[j * w + i] += c.d[o + 4];
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = D.clamp(i + di, 0, w - 1), jj = D.clamp(j + dj, 0, h - 1);
      s += acc[jj * w + ii] * (di === 0 && dj === 0 ? 0.4 : 0.075);
    }
    F[(j0 + j) * VN + i0 + i] = Math.min(255, s * 330);
  }
  D.Terrain.markA(i0, j0, i1, j1);
}

// ---- Brush ops --------------------------------------------------------------------------
// Pick a species for "Auto" by biome and altitude at a point
Nature.autoSpecies = function (x, z, rnd, cat) {
  const i = D.clamp(Math.round(x / CELL), 0, N), j = D.clamp(Math.round(z / CELL), 0, N), v = j * VN + i;
  const B = W.biome;
  const b = [B[v * 4], B[v * 4 + 1], B[v * 4 + 2], B[v * 4 + 3]];
  let r = rnd() * (b[0] + b[1] + b[2] + b[3] || 1), bi = 0;
  while (bi < 3 && r > b[bi]) { r -= b[bi]; bi++; }
  const alt = W.h[v] - W.seaLevel;
  const q = rnd();
  if (cat === 'bush') return [SP_INDEX.bush, SP_INDEX.bush, SP_INDEX.scrub, SP_INDEX.bush][bi];
  if (cat === 'rock') return SP_INDEX.rock;
  switch (bi) {
    case 0: return alt > 600 ? (q < 0.8 ? SP_INDEX.pine : SP_INDEX.spruce) : q < 0.42 ? SP_INDEX.oak : q < 0.7 ? SP_INDEX.pine : q < 0.82 ? SP_INDEX.birch : q < 0.9 ? SP_INDEX.poplar : SP_INDEX.bush;
    case 1: return alt > 250 && q < 0.85 ? SP_INDEX.spruce : q < 0.55 ? SP_INDEX.spruce : q < 0.85 ? SP_INDEX.pine : q < 0.93 ? SP_INDEX.birch : SP_INDEX.bush;
    case 2: return q < 0.3 ? SP_INDEX.cactus : q < 0.85 ? SP_INDEX.scrub : q < 0.93 ? SP_INDEX.rock : SP_INDEX.palm;
    default: return alt < 25 ? (q < 0.75 ? SP_INDEX.palm : SP_INDEX.jungle) : q < 0.62 ? SP_INDEX.jungle : q < 0.85 ? SP_INDEX.palm : SP_INDEX.bush;
  }
};

function okSpot(x, z, maxSlope) {
  if (!D.inMap(x, z)) return false;
  const y = D.Terrain.hAt(x, z);
  if (D.Terrain.waterAt(x, z) > y - 0.2) return false;
  if (maxSlope < 90 && D.Terrain.slopeAt(x, z) > maxSlope) return false;
  if (D.Roads && D.Roads.near(x, z, 2)) return false;
  return y;
}

// Scatter: add up to `tries` items inside the brush. opts: {species (-1 auto), cat, spacing, scaleVar, maxSlope}
Nature.scatter = function (cx, cz, radius, hard, tries, opts, rnd) {
  let added = 0;
  for (let t = 0; t < tries; t++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * radius;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    if (rnd() > D.falloff(rr / radius, hard)) continue;
    const y = okSpot(x, z, opts.maxSlope);
    if (y === false) continue;
    const sp = opts.species >= 0 ? opts.species : Nature.autoSpecies(x, z, rnd, opts.cat);
    const spc = opts.spacing * (SPECIES[sp].cat === 'bush' ? 0.5 : SPECIES[sp].cat === 'rock' ? 0.8 : 1);
    if (nearestSq(x, z, spc) < spc * spc) continue;
    const ci = chunkOf(x, z);
    D.History.touchChunk('nature', ci);
    const sv = opts.scaleVar;
    push(ci, x, z, y, sp, SPECIES[sp].noScale ? 1 : (1 - sv * 0.5) + rnd() * sv, rnd() * Math.PI * 2, rnd());
    markChunk(ci);
    added++;
  }
  return added;
};

// Place one item exactly (line mode / props)
Nature.place = function (x, z, sp, rot, scale, rnd) {
  const y = okSpot(x, z, 90);
  if (y === false) return false;
  const ci = chunkOf(x, z);
  D.History.touchChunk('nature', ci);
  push(ci, x, z, y, sp, scale, rot, rnd ? rnd() : Math.random());
  markChunk(ci);
  return true;
};

// Erase inside the brush; prob scales with falloff*strength. filterCat optional.
Nature.erase = function (cx, cz, radius, hard, prob, filter, rnd) {
  let removed = 0;
  const c0 = chunkOf(cx - radius, cz - radius), c1 = chunkOf(cx + radius, cz + radius);
  for (let gz = Math.floor(c0 / NCH); gz <= Math.floor(c1 / NCH); gz++) for (let gx = c0 % NCH; gx <= c1 % NCH; gx++) {
    const ci = gz * NCH + gx, c = chunks[ci];
    let touched = false;
    for (let k = c.n - 1; k >= 0; k--) {
      const o = k * STRIDE;
      const d = Math.hypot(c.d[o] - cx, c.d[o + 1] - cz);
      if (d >= radius) continue;
      if (filter && !filter(c.d[o + 3])) continue;
      if (rnd() > D.falloff(d / radius, hard) * prob) continue;
      if (!touched) { D.History.touchChunk('nature', ci); touched = true; }
      removeAt(ci, k); removed++;
    }
    if (touched) markChunk(ci);
  }
  return removed;
};

// Remove everything inside a footprint polygon test fn (used by roads/buildings)
Nature.clearWhere = function (x0, z0, x1, z1, test) {
  const c0 = chunkOf(x0, z0), c1 = chunkOf(x1, z1);
  let removed = 0;
  for (let gz = Math.floor(c0 / NCH); gz <= Math.floor(c1 / NCH); gz++) for (let gx = c0 % NCH; gx <= c1 % NCH; gx++) {
    const ci = gz * NCH + gx, c = chunks[ci];
    let touched = false;
    for (let k = c.n - 1; k >= 0; k--) {
      const o = k * STRIDE;
      const x = c.d[o], z = c.d[o + 1];
      if (x < x0 || x > x1 || z < z0 || z > z1 || !test(x, z)) continue;
      if (!touched) { D.History.touchChunk('nature', ci); touched = true; }
      removeAt(ci, k); removed++;
    }
    if (touched) markChunk(ci);
  }
  return removed;
};

// Iterate items in a rect (for copy/paste)
Nature.forEachIn = function (x0, z0, x1, z1, fn) {
  const c0 = chunkOf(x0, z0), c1 = chunkOf(x1, z1);
  for (let gz = Math.floor(c0 / NCH); gz <= Math.floor(c1 / NCH); gz++) for (let gx = c0 % NCH; gx <= c1 % NCH; gx++) {
    const c = chunks[gz * NCH + gx];
    for (let k = 0; k < c.n; k++) {
      const o = k * STRIDE;
      const x = c.d[o], z = c.d[o + 1];
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) fn(c.d[o], c.d[o + 1], c.d[o + 3], c.d[o + 4], c.d[o + 5], c.d[o + 6]);
    }
  }
};

// ---- World generation: grow forests ----------------------------------------------
Nature.populate = function (seed) {
  const rnd = D.rng(seed + 777);
  const nF = D.makeNoise(seed + 4040), nG = D.makeNoise(seed + 5050);
  const sea = W.seaLevel, h = W.h, B = W.biome;
  const sp0 = 19;
  let placed = 0;
  const MAX = D.Q.high ? 170000 : 90000;
  for (let gz = sp0 / 2; gz < SIZE; gz += sp0) for (let gx = sp0 / 2; gx < SIZE; gx += sp0) {
    const x = gx + (rnd() - 0.5) * sp0 * 0.95, z = gz + (rnd() - 0.5) * sp0 * 0.95;
    const i = Math.round(x / CELL), j = Math.round(z / CELL), v = j * VN + i;
    const y = h[v]; const alt = y - sea;
    if (alt < 1.5) continue;
    if (W.water[v] > y) continue;
    const u = x / SIZE, w = z / SIZE;
    const f = nF.fbm(u * 9, w * 9, 5) * 0.8 + nG.fbm(u * 30, w * 30, 3) * 0.3;
    const b = [B[v * 4], B[v * 4 + 1], B[v * 4 + 2], B[v * 4 + 3]];
    const bs = b[0] + b[1] + b[2] + b[3] || 1;
    // forest cover per biome
    const cover = (b[0] * 0.05 + b[1] * 0.1 + b[2] * -0.45 + b[3] * 0.15) / bs;
    const snowline = (b[0] * 950 + b[1] * 600 + b[2] * 1700 + b[3] * 3000) / bs;
    let p = D.smooth(0.02 - cover, 0.22 - cover, f);
    p *= 1 - D.smooth(snowline - 260, snowline - 60, alt);
    // slope
    const hx = h[Math.min(v + 1, D.V - 1)] - h[Math.max(v - 1, 0)], hz = h[Math.min(v + VN, D.V - 1)] - h[Math.max(v - VN, 0)];
    const slope = Math.sqrt(hx * hx + hz * hz) / (2 * CELL);
    p *= 1 - D.smooth(0.7, 1.1, slope);
    // lone trees and bushes out in the open
    let lone = 0.012 + (b[2] / bs) * 0.02;
    if (D.Roads && D.Roads.near(x, z, 3)) continue;
    const r = rnd();
    let spI = -1, scale = 1;
    if (r < p * 0.92) { spI = Nature.autoSpecies(x, z, rnd); scale = 0.75 + rnd() * 0.55; }
    else if (r < p * 0.92 + lone) { spI = rnd() < 0.55 ? Nature.autoSpecies(x, z, rnd, 'bush') : Nature.autoSpecies(x, z, rnd); scale = 0.7 + rnd() * 0.6; }
    else if (slope > 0.55 && r < p * 0.92 + lone + 0.05) { spI = SP_INDEX.rock; scale = 0.6 + rnd() * 1.8; }
    if (spI < 0) continue;
    const ci = chunkOf(x, z);
    push(ci, x, z, D.Terrain.hAt(x, z), spI, scale, rnd() * Math.PI * 2, rnd());
    if (++placed >= MAX) break;
  }
  for (let i = 0; i < chunks.length; i++) dirtyForest.add(i);
  dirtyRender = true;
  updateForest();
};

Nature.forceRebuild = function () { dirtyRender = true; rebuildTimer = 0; };
Nature.makeGeo = speciesGeo;
})();
