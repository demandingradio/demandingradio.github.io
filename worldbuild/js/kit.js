/* Diorama — kit: the medieval building kit.
   A library of unit part geometries rendered through four instanced materials
   (WALL facade shader, ROOF shader, PLAIN, vertex-colour VC) with matching depth
   materials so shadows follow the grow / sink animation; recipes that turn a building
   record into parts for every canonical kind; wall and pier runs; a per-tile instanced
   renderer with an append fast path; chimney smoke, torch light pools and the ghost.
   Contract: master spec §3.4 and §6.  Local frame: front / door / street side is local -z,
   world = (x + lx·cos rot + lz·sin rot, y + ly, z − lx·sin rot + lz·cos rot).
   Party bits (design opts.party): 1 = local −x side, 2 = local +x side, 4 = back (+z). */
(function () {
'use strict';
const D = window.D;
const SIZE = D.SIZE;
const PI = Math.PI, TAU = PI * 2, HALF_PI = PI / 2;
const clamp = D.clamp, lerp = D.lerp;

// ---- flags, style codes ------------------------------------------------------------------
const F = {
  DOOR_F: 1, DOOR_B: 2, DOOR_R: 4, PARTY_L: 8, PARTY_R: 16, PARTY_B: 32, SHOP: 64, FRAMESTAGE: 128,
  SILL: 256, QUOINS: 512, BARNDOOR: 1024, STABLE: 2048, ROSE: 4096, GABLE: 8192, NOWIN: 16384,
  DBLDOOR: 32768, BELFRY: 65536,
  // Living History (decoded in GROW from iParams2.w; float-exact below 2^24)
  SCAFF: 131072, RIDE: 262144, PEG: 524288, LATE: 1048576,  // scaffolding · crane rides the cap · pegs & lines · roof rises late
  // FRAMESTAGE = may show a skeleton stage when a history reveal sets rec._fe; FRAMEOLD = the v44 2.2 s timber
  // skeleton on every animated reveal (only where v44 set it: framed timber storeys / gables)
  FRAMEOLD: 2097152
};
const WS = { wattle: 0, timber: 1, rubble: 2, ashlar: 3, plank: 4, log: 5, castle: 6, church: 7, render: 8 };
const RS = { thatch: 0, tile: 1, slate: 2, shingle: 3, lead: 4, turf: 5, stone: 6 };
const PS = { flat: 0, stripeX: 1, stripeR: 2, boards: 3, grid: 4, stone: 5, water: 6 };
const WALL_NAMES = ['wattle', 'timber', 'rubble', 'ashlar', 'plank', 'log', 'castle', 'church', 'render'];
const ROOF_NAMES = ['thatch', 'tile', 'slate', 'shingle', 'lead', 'turf', 'stone'];
const SMOKE = { hearth: 0, chimney: 1, forge: 2, hole: 3 };
// anim modes (iAnim.w = mode*16 + rate)
const AN = { none: 0, sail: 1, wheel: 2, wave: 3, flicker: 4, bob: 5, swing: 6 };

// ---- palettes (sRGB hex; tiers P / M / R) -------------------------------------------------
const PAL = {
  daub: [[0xc9bc9c, 0xbfb08e, 0xd2c4a0, 0xb8aa8a, 0xc4b08a], [0xe6dcc4, 0xece2cb, 0xdfcfa8, 0xd8c498, 0xe2c98f, 0xdcc0a6, 0xd6cdb0],
    [0xf3eee2, 0xefe0bc, 0xe9cf9c, 0xdcb8a4, 0xcfd4c8, 0xe7bfa6, 0xe3cd86, 0xc8d0d2, 0xeadcc0, 0xd9aa8c]],
  hanseRender: [0xe9cf9c, 0xdcb8a4, 0xf3eee2, 0xc98a6a, 0xd8c498],
  rubble: [0x9a9284, 0x8c8578, 0xa39884, 0x7f7a70],
  rubbleHoney: [0xb5a27a, 0xa8946c, 0xbfa981],
  rubbleGrey: [0x8a8a86, 0x7c7d7a, 0x939390],
  ashlar: [[0xcdbb98, 0xc4ae8c], [0xcdbb98, 0xc4ae8c], [0xd3c8b0, 0xcdbb98, 0xb8a58c, 0xaaa49a]],
  ashlarHoney: [0xd4bc8a, 0xc9ae78, 0xdcc596],
  brick: [0xa85a44, 0x9a5040, 0xb86a4c],
  castle: [0xa8a292, 0x9c968a, 0xb4aa96, 0x8e8a84],
  plank: [[0x6e5a44, 0x7a6450], [0x5e4632, 0x6a4e36], [0x2e2824, 0x3a302a]],
  log: [0x6a5238, 0x5c4630, 0x7a6044],
  thatch: [0xc8a45e, 0xbf9a56], thatchOld: [0xa08a5c, 0x8e7c58], reed: [0xb89c62, 0xae9058],
  turf: [0x5a6a38, 0x66703e],
  tile: [[0xa5553b, 0x9a4b35, 0xb56a47, 0x8e5a40], [0xa5553b, 0x9a4b35, 0xb56a47, 0xbf7a4e, 0x8a4c38, 0x9c6446], [0x8c4a3a, 0xa86a50, 0xa5553b, 0x7c4636, 0xb4704c]],
  slate: [[0x565b63], [0x565b63], [0x4a4e57, 0x3f444d, 0x4c4a52]],
  shingle: [0x7c5c3e, 0x8a6a4a, 0x6c5a4a],
  lead: [0x7c8086, 0x8a8e92],
  stone: [0x8a8478, 0x9a9282],
  cloth: [0xb83a2e, 0x2f5a9a, 0x3a7a44, 0xd8a030, 0xe8e0cc, 0x6a3a7a],
  heraldry: [0xb82a24, 0x1f3f8a, 0xd8a820, 0x1e6a3a, 0xf0ece0, 0x202020],
  // timber tones: brown, mid brown, dark brown, near-black (rich), weathered grey oak (poor)
  timber: [0x4a3526, 0x5a4030, 0x3a2a1e, 0x231c17, 0x6e5c4a]
};
const COL = {
  iron: 0x2c2a28, wood: 0x6b4a2e, darkWood: 0x3e2c1e, oak: 0x5a4030, stoneLight: 0xb8b0a0, stone: 0x9a9284,
  grass: 0x5f7a3a, water: 0x2a3a3c, flag: 0xa39a86, soot: 0x2a2624, bronze: 0xa8823a, straw: 0xc8a45e,
  glow: 0xffc070, fire: 0xff8a2a, coal: 0xff5a18, pot: 0xa0583a, deck: 0x7a6248
};
const lcache = new Map();
function lin(hex) { let c = lcache.get(hex); if (!c) { const t = new THREE.Color(hex).convertSRGBToLinear(); c = [t.r, t.g, t.b]; lcache.set(hex, c); } return c; }
function jit(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
function pick(arr, r) { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }
function pickW(r, list) { // list: [[value, weight], ...]
  let s = 0; for (const e of list) s += e[1];
  let x = r * s; for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; }
  return list[list.length - 1][0];
}
function tierOf(w) { return w < 0.34 ? 0 : w < 0.67 ? 1 : 2; }
function hash32(a, b) { // integer hash of two uint32s → uint32
  let h = (Math.imul(a >>> 0, 0x9E3779B1) ^ Math.imul((b >>> 0) + 0x7f4a7c15, 0x85EBCA77)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return h >>> 0;
}

// ---- geometry library -------------------------------------------------------------------------
// A tiny triangle builder with per-vertex extra attributes. tri() orients the winding so the
// face normal agrees with the supplied outward normal (unless fixed=true, for triangles that are
// degenerate at rest and only open up in the vertex shader).
function faceN(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z);
  return l < 1e-12 ? [0, 0, 0] : [x / l, y / l, z / l];
}
function nrm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function MB(defs) { this.P = []; this.N = []; this.defs = defs || {}; this.A = {}; for (const k in this.defs) this.A[k] = []; }
MB.prototype.v1 = function (v, n) {
  this.P.push(v.p[0], v.p[1], v.p[2]);
  const nn = v.n || n; this.N.push(nn[0], nn[1], nn[2]);
  for (const k in this.defs) {
    const d = this.defs[k], val = v[k] !== undefined ? v[k] : d.def;
    if (d.size === 1) this.A[k].push(val); else for (let i = 0; i < d.size; i++) this.A[k].push(val[i]);
  }
};
MB.prototype.tri = function (a, b, c, n, fixed) {
  const fn = faceN(a.p, b.p, c.p);
  if (!n) n = fn;
  else if (!fixed && fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] < 0) { const t = b; b = c; c = t; }
  this.v1(a, n); this.v1(b, n); this.v1(c, n);
};
MB.prototype.quad = function (a, b, c, d, n, fixed) { this.tri(a, b, c, n, fixed); this.tri(a, c, d, n, fixed); };
MB.prototype.geo = function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
  for (const k in this.defs) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.A[k]), this.defs[k].size));
  return g;
};
function nonIdx(g) { return g.index ? g.toNonIndexed() : g; }
function flat(g) { g = nonIdx(g); g.computeVertexNormals(); return g; }
function flipGeo(g) { // reverse winding and normals of a non-indexed geometry
  g = nonIdx(g);
  for (const k in g.attributes) {
    const a = g.attributes[k], s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let i = 0; i < s; i++) { const x = arr[(t + 1) * s + i]; arr[(t + 1) * s + i] = arr[(t + 2) * s + i]; arr[(t + 2) * s + i] = x; }
  }
  const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}
function addAttr(g, name, size, fn) {
  const n = g.attributes.position.count, arr = new Float32Array(n * size);
  for (let i = 0; i < n; i++) { const v = fn(i); if (size === 1) arr[i] = v; else for (let k = 0; k < size; k++) arr[i * size + k] = v[k]; }
  g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  return g;
}
function strip(g, keep) { for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); return g; }
function merge(list) { const g = D.mergeGeos(list.map(nonIdx)); return g; }
function boxAt(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return nonIdx(g); }
function rotAt(g, rx, ry, rz) { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')); g.applyMatrix4(m); return g; }
// extrude a 2D polygon (x,y) along z ∈ [-0.5, 0.5]
function extrudeZ(pts) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -0.5);
  return nonIdx(g);
}
// extrude a profile given as (z, y) along x ∈ [-0.5, 0.5]
function extrudeX(pts) {
  const g = extrudeZ(pts.map(p => [-p[0], p[1]]));   // shape x = -z
  g.rotateY(HALF_PI);                                 // (x,y,z) → (z, y, -x): shape x → -z, depth → x
  return g;
}

// WALL geometry: aU (curved param, -9 = box-projected) and gTop (gable apex marker)
function wallify(g, curvedScale) {
  g = nonIdx(g);
  const n = g.attributes.position.count;
  const aU = new Float32Array(n).fill(-9), gT = new Float32Array(n);
  if (curvedScale && g.attributes.uv) {
    const uv = g.attributes.uv, nor = g.attributes.normal;
    for (let i = 0; i < n; i++) if (Math.abs(nor.getY(i)) < 0.5) aU[i] = (uv.getX(i) - 0.5) * curvedScale;
  }
  g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  g.setAttribute('gTop', new THREE.BufferAttribute(gT, 1));
  return strip(g, ['position', 'normal', 'aU', 'gTop']);
}
function wbox(w, h, d, x, y, z) { return wallify(boxAt(w, h, d, x, y, z)); }

const G_WALL = {
  body() { return wbox(1, 1, 1, 0, 0, 0); },
  gwall() { // two gable ends at x = ±0.5; apex verts carry gTop = ±1 and open into a trapezoid (half-hip)
    const mb = new MB({ aU: { size: 1, def: -9 }, gTop: { size: 1, def: 0 } });
    for (const xs of [1, -1]) {
      const x = 0.5 * xs, n = [xs, 0, 0];
      const A = { p: [x, 0, -0.5] }, B = { p: [x, 0, 0.5] }, C = { p: [x, 1, 0], gTop: 1 }, Dv = { p: [x, 1, 0], gTop: -1 };
      if (xs > 0) { mb.tri(A, C, B, n, true); mb.tri(A, Dv, C, n, true); }
      else { mb.tri(A, B, C, n, true); mb.tri(A, C, Dv, n, true); }
    }
    return mb.geo();
  },
  cylW() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1); g.translate(0, 0.5, 0); return wallify(g, 1); },
  cylT() { const g = new THREE.CylinderGeometry(0.36, 0.5, 1, 14, 1); g.translate(0, 0.5, 0); return wallify(g, 1); },
  frustum() { const g = new THREE.CylinderGeometry(0.4, 0.5, 1, 4, 1); g.rotateY(PI / 4); g.scale(Math.SQRT2, 1, Math.SQRT2); g.translate(0, 0.5, 0); return wallify(flat(g)); },
  apseW() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true, -HALF_PI, PI); g.translate(0, 0.5, 0); return wallify(g, 0.5); },
  crenel4() { return crenelGeo(4); },
  crenel8() { return crenelGeo(8); },
  crenel() { return crenelGeo(16); },
  crenelR() {
    const parts = [];
    const o = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 16, 1, true); o.translate(0, 0.225, 0); parts.push(wallify(o, 1));
    const i = new THREE.CylinderGeometry(0.41, 0.41, 0.45, 16, 1, true); i.translate(0, 0.225, 0); parts.push(wallify(flipGeo(strip(i, ['position', 'normal']))));
    const rg = new THREE.RingGeometry(0.41, 0.5, 16, 1); rg.rotateX(-HALF_PI); rg.translate(0, 0.45, 0); parts.push(wallify(rg));
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU + 0.13;
      const b = new THREE.BoxGeometry(0.15, 0.55, 0.09); b.translate(0, 0.275, 0.455); b.rotateY(a); b.translate(0, 0.45, 0);
      parts.push(wallify(b));
    }
    return merge(parts);
  },
  stepG() { // crow-stepped gable slab (thickness along x, span along z)
    const W = [0.5, 0.39, 0.28, 0.17, 0.07], Y = [0, 0.3, 0.48, 0.66, 0.84, 1.0];
    return merge(W.map((w, k) => wbox(1, Y[k + 1] - Y[k], w * 2, 0, Y[k], 0)));
  },
  arch() { // block with a pointed arch passage along z
    const pts = [[-0.5, 0], [-0.25, 0], [-0.25, 0.3]];
    for (let k = 1; k <= 6; k++) { const t = k / 6, ang = PI - t * Math.acos(0.05 / 0.3); pts.push([0.05 + Math.cos(ang) * 0.3, 0.3 + Math.sin(ang) * 0.3]); }
    for (let k = 5; k >= 1; k--) { const t = k / 6, ang = t * Math.acos(0.05 / 0.3); pts.push([-0.05 + Math.cos(ang) * 0.3, 0.3 + Math.sin(ang) * 0.3]); }
    pts.push([0.25, 0.3], [0.25, 0], [0.5, 0], [0.5, 1], [-0.5, 1]);
    return wallify(extrudeZ(pts));
  },
  archB() { // bridge span: semi-elliptic arch, opening 0.84 wide, apex at 0.72
    const pts = [[-0.5, 0], [-0.42, 0]];
    for (let k = 1; k < 12; k++) { const a = PI - k / 12 * PI; pts.push([Math.cos(a) * 0.42, Math.sin(a) * 0.72]); }
    pts.push([0.42, 0], [0.5, 0], [0.5, 1], [-0.5, 1]);
    return wallify(extrudeZ(pts));
  },
  arcade() { // slab along x with 8 round-headed openings (cloister walk)
    const pts = [[-0.5, 0]];
    for (let b = 0; b < 8; b++) {
      const c = -0.5 + (b + 0.5) / 8, hw = 0.04;
      pts.push([c - hw, 0], [c - hw, 0.5]);
      for (let k = 1; k < 6; k++) { const a = PI - k / 6 * PI; pts.push([c + Math.cos(a) * hw, 0.5 + Math.sin(a) * 0.13]); }
      pts.push([c + hw, 0.5], [c + hw, 0]);
    }
    pts.push([0.5, 0], [0.5, 1], [-0.5, 1]);
    return wallify(extrudeZ(pts));
  },
  buttress() { // wall side at z = +0.5, projecting to z = -0.5, stepped with weathered tops
    return wallify(extrudeX([[0.5, 0], [0.5, 1], [0.12, 0.93], [0.12, 0.6], [-0.5, 0.46], [-0.5, 0]]));
  }
};
function crenelGeo(nm) {
  const parts = [wbox(1, 0.45, 1, 0, 0, 0)];
  for (let k = 0; k < nm; k++) parts.push(wbox(0.5 / nm, 0.55, 1, -0.5 + (k + 0.5) / nm, 0.45, 0));
  return merge(parts);
}

// ---- ROOF geometries ------------------------------------------------------------------------
// rUV = (x-param, down-param, mode 0 gable / 1 cone / 2 lean-to / 3 underside+fascia),
// rRow = 1 on the half-hip break row, rCap = (capT, capZ) on hip caps, capT = -1 elsewhere.
const RDEF = { rUV: { size: 3, def: [0, 0, 0] }, rRow: { size: 1, def: 0 }, rCap: { size: 2, def: [-1, 0] } };
function gableRoof(thatch) {
  const mb = new MB(RDEF);
  const U = thatch ? 0.075 : 0.035; // underside offset / fascia depth (unit y)
  const rows = thatch
    ? [{ y: 0, z: 0.5 }, { y: 0.5, z: 0.262 }, { y: 0.97, z: 0.0157, row: 1 }, { y: 0.999, z: 0.0005 }, { y: 0.985, z: 0.03 }, { y: 1.02, z: 0 }]
    : [{ y: 0, z: 0.5 }, { y: 0.999, z: 0.0005, row: 1 }, { y: 1, z: 0 }];
  for (const sg of [-1, 1]) {
    const n = nrm([0, 0.5, sg]);
    const V = (x, rw) => ({ p: [x, rw.y, sg * rw.z], rUV: [x + 0.5, 1 - rw.y, 0], rRow: rw.row || 0 });
    for (let i = 0; i + 1 < rows.length; i++) mb.quad(V(-0.5, rows[i]), V(0.5, rows[i]), V(0.5, rows[i + 1]), V(-0.5, rows[i + 1]), n);
    // underside (reversed copy, straight eave → ridge; the fragment shades it by its down normal)
    const un = nrm([0, -0.5, -sg]);
    const Uv = (x, y, z) => ({ p: [x, y, sg * z], rUV: [x + 0.5, 1 - y, 0] });
    mb.quad(Uv(-0.5, -U, 0.5), Uv(0.5, -U, 0.5), Uv(0.5, 1 - U, 0), Uv(-0.5, 1 - U, 0), un);
    // eave fascia
    const Fv = (x, y) => ({ p: [x, y, sg * 0.5], rUV: [x + 0.5, 1, 3] });
    mb.quad(Fv(-0.5, 0), Fv(0.5, 0), Fv(0.5, -U), Fv(-0.5, -U), [0, 0, sg]);
    // verges (barge ends) at x = ±0.5 closing the gap between top and underside
    for (const xs of [-1, 1]) {
      const x = 0.5 * xs, bn = [xs, 0, 0];
      const T0 = { p: [x, 0, sg * 0.5], rUV: [xs * 0.5 + 0.5, 1, 0] }, T1 = { p: [x, 1, 0], rUV: [xs * 0.5 + 0.5, 0, 0] };
      const B1 = { p: [x, 1 - U, 0], rUV: [xs * 0.5 + 0.5, 0, 0] }, B0 = { p: [x, -U, sg * 0.5], rUV: [xs * 0.5 + 0.5, 1, 0] };
      mb.quad(T0, B0, B1, T1, bn);
    }
  }
  // hip caps (degenerate at rest; opened by roofShape)
  for (const xs of [-1, 1]) {
    const x = 0.5 * xs, n = [xs, 0, 0];
    const Bf = { p: [x, 0.999, -0.0005], rCap: [0, -1], rUV: [xs * 0.5 + 0.5, 0, 0] };
    const Bb = { p: [x, 0.999, 0.0005], rCap: [0, 1], rUV: [xs * 0.5 + 0.5, 0, 0] };
    const A = { p: [x, 1, 0], rCap: [1, 0], rUV: [xs * 0.5 + 0.5, 0, 0] };
    if (xs > 0) mb.tri(Bf, A, Bb, n, true); else mb.tri(Bf, Bb, A, n, true);
  }
  return mb.geo();
}
function roofify(g, mode, underside) {
  g = nonIdx(g);
  const pos = g.attributes.position, uv = g.attributes.uv, nor = g.attributes.normal;
  addAttr(g, 'rUV', 3, i => [uv ? uv.getX(i) : 0, 1 - pos.getY(i), (underside && nor.getY(i) < -0.5) ? 3 : mode]);
  addAttr(g, 'rRow', 1, () => 0);
  addAttr(g, 'rCap', 2, () => [-1, 0]);
  return strip(g, ['position', 'normal', 'rUV', 'rRow', 'rCap']);
}
function coneRoof(r, seg, flatShade, rot, thetaStart, thetaLen) {
  const g = new THREE.ConeGeometry(r, 1, seg, 1, true, thetaStart || 0, thetaLen || TAU); g.translate(0, 0.5, 0);
  if (rot) g.rotateY(rot);
  const parts = [roofify(flatShade ? flat(g) : g, 1)];
  if (!thetaLen) { const b = new THREE.CircleGeometry(r, seg); b.rotateX(HALF_PI); if (rot) b.rotateY(rot); parts.push(roofify(b, 3)); }
  return merge(parts);
}
const G_ROOF = {
  roofG() { return gableRoof(false); },
  roofT() { return gableRoof(true); },
  roofL() { // lean-to: high edge z = +0.5 (y 1) to low edge z = -0.5 (y 0)
    const mb = new MB(RDEF), U = 0.04, n = nrm([0, 1, -1]);
    const V = (x, y, z, m) => ({ p: [x, y, z], rUV: [x + 0.5, 1 - y, m] });
    mb.quad(V(-0.5, 0, -0.5, 2), V(0.5, 0, -0.5, 2), V(0.5, 1, 0.5, 2), V(-0.5, 1, 0.5, 2), n);
    mb.quad(V(-0.5, -U, -0.5, 3), V(0.5, -U, -0.5, 3), V(0.5, 1 - U, 0.5, 3), V(-0.5, 1 - U, 0.5, 3), [0, -n[1], -n[2]]);
    mb.quad(V(-0.5, 0, -0.5, 3), V(0.5, 0, -0.5, 3), V(0.5, -U, -0.5, 3), V(-0.5, -U, -0.5, 3), [0, 0, -1]);
    for (const xs of [-1, 1]) { const x = 0.5 * xs; mb.tri(V(x, -U, -0.5, 3), V(x, -U, 0.5, 3), V(x, 1, 0.5, 3), [xs, 0, 0]); }
    return mb.geo();
  },
  coneR() { return coneRoof(0.5, 12, false); },
  pyrR() { return coneRoof(Math.SQRT1_2, 4, true, PI / 4); },
  spire() { // 8-sided broach spire over a square base
    const s = new THREE.ConeGeometry(0.5, 1, 8, 1, true); s.translate(0, 0.5, 0);
    const b = new THREE.ConeGeometry(Math.SQRT1_2, 0.3, 4, 1, true); b.rotateY(PI / 4); b.translate(0, 0.15, 0);
    const c = new THREE.CircleGeometry(Math.SQRT1_2, 4); c.rotateX(HALF_PI); c.rotateY(PI / 4);
    return merge([roofify(flat(s), 1), roofify(flat(b), 1), roofify(c, 3)]);
  },
  apseR() { return coneRoof(0.5, 8, false, 0, -HALF_PI, PI); }
};

// ---- PLAIN geometries ---------------------------------------------------------------------------
function plain(g) { return strip(nonIdx(g), ['position', 'normal']); }
const G_PLAIN = {
  box() { return plain(boxAt(1, 1, 1, 0, 0, 0)); },
  cyl8() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1); g.translate(0, 0.5, 0); return plain(flat(g)); },
  disc() { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1); g.translate(0, 0.5, 0); return plain(g); },
  mound() {
    const pr = [[0.5, 0], [0.485, 0.12], [0.44, 0.35], [0.36, 0.64], [0.27, 0.88], [0.215, 0.98], [0.19, 1.0], [0.0, 1.0]];
    const g = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 22);
    g.computeVertexNormals();
    return plain(g);
  },
  stakes() {
    const parts = [];
    for (let k = 0; k < 20; k++) {
      const x = -0.5 + (k + 0.5) / 20, h = 0.86 + 0.12 * D.hash2(k, 7), w = 0.042;
      parts.push(boxAt(w, h - 0.1, 0.9, x, 0, 0));
      const t = new THREE.ConeGeometry(w * 0.72, 0.12, 4, 1); t.rotateY(PI / 4); t.scale(1, 1, 0.9 / w * 0.95); t.translate(x, h - 0.1 + 0.06, 0);
      parts.push(flat(t));
    }
    parts.push(boxAt(1, 0.05, 0.25, 0, 0.62, 0.55), boxAt(1, 0.05, 0.25, 0, 0.2, 0.55));
    return plain(merge(parts));
  },
  staddle() {
    const p = new THREE.CylinderGeometry(0.18, 0.3, 0.74, 8, 1); p.translate(0, 0.37, 0);
    const c = new THREE.CylinderGeometry(0.5, 0.46, 0.26, 10, 1); c.translate(0, 0.87, 0);
    return plain(merge([flat(p), flat(c)]));
  },
  tentR() { // ridge tent / stall canopy: ridge along x at y 1, eaves at z ±0.5
    const mb = new MB();
    const P = (x, y, z) => ({ p: [x, y, z] });
    for (const sg of [-1, 1]) mb.quad(P(-0.5, 0, sg * 0.5), P(0.5, 0, sg * 0.5), P(0.5, 1, 0), P(-0.5, 1, 0), nrm([0, 0.5, sg]));
    for (const xs of [-1, 1]) mb.tri(P(xs * 0.5, 0, -0.5), P(xs * 0.5, 0, 0.5), P(xs * 0.5, 1, 0), [xs, 0, 0]);
    // undersides so the canopy reads from below
    for (const sg of [-1, 1]) mb.quad(P(-0.5, -0.01, sg * 0.5), P(0.5, -0.01, sg * 0.5), P(0.5, 0.99, 0), P(-0.5, 0.99, 0), nrm([0, -0.5, -sg]));
    return mb.geo();
  },
  tentC() {
    const w = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16, 1, true); w.translate(0, 0.16, 0);
    const c = new THREE.ConeGeometry(0.54, 0.72, 16, 1, true); c.translate(0, 0.32 + 0.36, 0);
    return plain(merge([w, c]));
  },
  awning() {
    const len = Math.hypot(1, 0.38);
    const s = new THREE.BoxGeometry(1, 0.05, len); s.rotateX(-Math.atan2(0.38, 1)); s.translate(0, 0.81, 0);
    const v = boxAt(1, 0.17, 0.03, 0, 0.45, -0.49);
    return plain(merge([flat(s), v]));
  },
  banner() { const g = new THREE.PlaneGeometry(1, 1, 8, 2); g.translate(0.5, -0.5, 0); const b = flipGeo(strip(nonIdx(g.clone()), ['position', 'normal'])); return plain(merge([plain(g), b])); },
  pennant() {
    const mb = new MB(), n = [0, 0, 1];
    const sgm = 6;
    for (let i = 0; i < sgm; i++) {
      const x0 = i / sgm, x1 = (i + 1) / sgm, h0 = 0.5 * (1 - x0), h1 = 0.5 * (1 - x1);
      const a = { p: [x0, -0.5 + h0, 0] }, b = { p: [x1, -0.5 + h1, 0] }, c = { p: [x1, -0.5 - h1, 0] }, d = { p: [x0, -0.5 - h0, 0] };
      mb.quad(a, b, c, d, n); mb.quad(a, b, c, d, [0, 0, -1]);
    }
    return mb.geo();
  },
  ladder() {
    const parts = [boxAt(0.1, 1, 0.5, -0.42, 0, 0), boxAt(0.1, 1, 0.5, 0.42, 0, 0)];
    for (let k = 1; k < 9; k++) parts.push(boxAt(0.84, 0.035, 0.3, 0, k / 9, 0));
    return plain(merge(parts));
  },
  stairs() { const parts = []; for (let k = 0; k < 8; k++) parts.push(boxAt(1, (k + 1) / 8, 1 / 8, 0, 0, -0.5 + (k + 0.5) / 8)); return plain(merge(parts)); }
};

// ---- VC geometries (vertex colour + tint: 0 fixed, 1 × instance colour, 6 glow) -------------------
function vc(g, hex, tint) { return D.colorGeo(nonIdx(g), hex, 'tint', tint || 0); }
function vbox(w, h, d, cx, cy, cz, hex, tint, rx, ry, rz) { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) rotAt(g, rx, ry, rz); g.translate(cx, cy, cz); return vc(g, hex, tint); }
function vcyl(rt, rb, h, seg, cx, cy, cz, hex, tint, rx, ry, rz, sz) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); if (sz) g.scale(1, 1, sz); if (rx || ry || rz) rotAt(g, rx, ry, rz); g.translate(cx, cy, cz); return vc(flat(g), hex, tint); }
function vcone(r, h, seg, cx, cy, cz, hex, tint, rx, rz) { const g = new THREE.ConeGeometry(r, h, seg, 1); if (rx || rz) rotAt(g, rx, 0, rz); g.translate(cx, cy, cz); return vc(flat(g), hex, tint); }
function vblob(r, cx, cy, cz, sx, sy, sz, hex, tint) { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(sx, sy, sz); g.translate(cx, cy, cz); return vc(g, hex, tint); }
function vbeam(a, b, t, hex, tint) { // square beam between two points
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(t, L, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  g.applyQuaternion(q); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return vc(g, hex, tint);
}
function vmerge(list) { const g = D.mergeGeos(list); return g; }
// hull: stations along z ∈ [-0.5, 0.5]; halfW(t), sheer(t) with t ∈ [-1, 1]; keel at y = keel
function hullGeo(halfW, sheer, keel, hex, inner) {
  const mb = new MB({ color: { size: 3, def: lin(hex) }, tint: { size: 1, def: 0 } });
  const NS = 12, prof = [[1, 1], [0.93, 0.55], [0.62, 0.12], [0, 0]]; // (width frac, height frac) gunwale → keel
  const sec = [];
  for (let i = 0; i <= NS; i++) {
    const t = -1 + 2 * i / NS, z = t * 0.5, hw = Math.max(0.004, halfW(t)), top = sheer(t);
    const row = [];
    for (let k = 0; k < prof.length; k++) { const [wf, hf] = prof[k]; row.push([-hw * wf, keel + (top - keel) * hf, z]); }
    for (let k = prof.length - 2; k >= 0; k--) { const [wf, hf] = prof[k]; row.push([hw * wf, keel + (top - keel) * hf, z]); }
    sec.push(row);
  }
  const ic = lin(inner);
  for (let i = 0; i < NS; i++) for (let k = 0; k + 1 < sec[i].length; k++) {
    const a = sec[i][k], b = sec[i][k + 1], c = sec[i + 1][k + 1], d = sec[i + 1][k];
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const out = nrm([mid[0], mid[1] - (keel + 0.3 * (sheer(0) - keel)), 0.0001 + mid[2] * 0.3]);
    mb.quad({ p: a }, { p: b }, { p: c }, { p: d }, out);
    mb.quad({ p: a, color: ic }, { p: b, color: ic }, { p: c, color: ic }, { p: d, color: ic }, [-out[0], -out[1], -out[2]]);
  }
  return mb.geo();
}
const G_VC = {
  sail() { // four lattice sails in the XY plane, hub at the origin, radius 0.5
    const P = [];
    P.push(vcyl(0.035, 0.035, 0.5, 8, 0, 0, -0.1, COL.darkWood, 0, HALF_PI));
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * HALF_PI, ca = Math.cos(a), sa = Math.sin(a);
      const g = new THREE.BoxGeometry(0.022, 0.5, 0.05); g.translate(0, 0.25, -0.12); g.rotateZ(a - HALF_PI); P.push(vc(g, COL.darkWood, 0));
      const cloth = new THREE.BoxGeometry(0.085, 0.36, 0.012); cloth.translate(0.05, 0.3, -0.13); cloth.rotateZ(a - HALF_PI); P.push(vc(cloth, 0xffffff, 1));
      for (let j = 0; j < 5; j++) { const bar = new THREE.BoxGeometry(0.1, 0.01, 0.03); bar.translate(0.05, 0.13 + j * 0.085, -0.135); bar.rotateZ(a - HALF_PI); P.push(vc(bar, COL.darkWood, 0)); }
      const edge = new THREE.BoxGeometry(0.01, 0.37, 0.03); edge.translate(0.095, 0.3, -0.135); edge.rotateZ(a - HALF_PI); P.push(vc(edge, COL.darkWood, 0));
      void ca; void sa;
    }
    return vmerge(P);
  },
  wheel() { // water wheel in the YZ plane, axle along x, radius 0.5
    const P = [], wood = 0x4a3a2a, dark = 0x2e241a;
    P.push(vcyl(0.07, 0.07, 1.1, 8, 0, 0, 0, dark, 0, 0, 0, HALF_PI));
    for (const xs of [-0.42, 0.42]) {
      for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P.push(vbox(0.07, 0.2, 0.05, xs, Math.cos(a) * 0.47, Math.sin(a) * 0.47, dark, 0, a + HALF_PI)); }
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; P.push(vbox(0.05, 0.45, 0.035, xs, Math.cos(a) * 0.23, Math.sin(a) * 0.23, wood, 0, a)); }
    }
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + 0.1; P.push(vbox(0.9, 0.11, 0.025, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.42, wood, 0, a)); }
    return vmerge(P);
  },
  rowboat() {
    const P = [hullGeo(t => 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.2)), 0.6), t => 0.3 + 0.12 * t * t, -0.3, 0x6a5038, 0x4e3a28)];
    P.push(vbox(0.9, 0.05, 0.08, 0, 0.14, -0.08, COL.oak), vbox(0.8, 0.05, 0.08, 0, 0.14, 0.2, COL.oak));
    P.push(vbox(0.06, 0.03, 0.8, -0.25, 0.3, 0.05, 0x8a6a48, 0, 0, 0.12), vbox(0.06, 0.03, 0.8, 0.25, 0.3, 0.05, 0x8a6a48, 0, 0, -0.12));
    return vmerge(P);
  },
  fishboat() {
    const P = [hullGeo(t => 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.55), t => 0.15 + 0.06 * t * t, -0.05, 0x5a4636, 0x3e3024)];
    P.push(vbox(0.9, 0.012, 0.7, 0, 0.1, 0, COL.deck));
    P.push(vcyl(0.022, 0.03, 0.9, 6, 0, 0.55, -0.05, COL.darkWood, 0, 0, 0, 0, 0.35));
    P.push(vcyl(0.012, 0.012, 0.7, 5, 0, 0.84, -0.05, COL.darkWood, 0, 0, 0, HALF_PI));
    P.push(vcyl(0.045, 0.045, 0.62, 6, 0, 0.8, -0.05, 0xffffff, 1, 0, 0, HALF_PI, 0.4));
    P.push(vblob(0.12, 0.12, 0.14, 0.28, 1.6, 0.5, 0.8, 0x3a4a3a), vbox(0.5, 0.1, 0.14, 0, 0.18, 0.4, COL.oak));
    P.push(vbeam([0, 0.98, -0.05], [0.42, 0.14, -0.05], 0.006, COL.soot), vbeam([0, 0.98, -0.05], [-0.42, 0.14, -0.05], 0.006, COL.soot));
    return vmerge(P);
  },
  cog() {
    const P = [hullGeo(t => 0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 5)), 0.5), t => 0.2 + 0.05 * t * t, -0.07, 0x5e4430, 0x3e2e20)];
    P.push(vbox(0.94, 0.01, 0.84, 0, 0.13, 0, COL.deck));
    P.push(vbox(0.88, 0.1, 0.2, 0, 0.26, 0.37, 0x4e3828), vbox(0.9, 0.04, 0.22, 0, 0.31, 0.37, 0x6a5038)); // aftcastle
    for (let k = 0; k < 6; k++) P.push(vbox(0.1, 0.035, 0.012, -0.38 + k * 0.152, 0.35, 0.265, 0x6a5038));
    P.push(vbox(0.6, 0.08, 0.13, 0, 0.26, -0.41, 0x4e3828), vbox(0.62, 0.035, 0.14, 0, 0.3, -0.41, 0x6a5038)); // forecastle
    P.push(vbeam([0, 0.24, -0.43], [0, 0.34, -0.485], 0.02, COL.darkWood)); // bowsprit (kept inside the rect by scale)
    P.push(vcyl(0.028, 0.04, 0.95, 8, 0, 0.55, 0, COL.darkWood, 0, 0, 0, 0, 0.33));
    P.push(vcyl(0.014, 0.014, 1.05, 6, 0, 0.83, 0, COL.darkWood, 0, 0, 0, HALF_PI));
    P.push(vcyl(0.05, 0.05, 1.0, 8, 0, 0.8, 0.005, 0xffffff, 1, 0, 0, HALF_PI, 0.35)); // furled sail
    P.push(vbox(0.03, 0.08, 0.06, 0, 0.1, 0.47, COL.darkWood)); // rudder
    P.push(vbox(0.01, 0.06, 0.02, 0, 1.0, 0.0, COL.darkWood), vbox(0.16, 0.05, 0.008, 0.08, 0.98, 0, 0xb82a24));
    for (const xs of [-1, 1]) for (const zz of [-0.08, 0.06]) P.push(vbeam([0, 0.97, 0], [xs * 0.46, 0.21, zz], 0.005, COL.soot));
    P.push(vbeam([0, 0.97, 0], [0, 0.33, 0.45], 0.005, COL.soot), vbeam([0, 0.97, 0], [0, 0.32, -0.46], 0.005, COL.soot));
    return vmerge(P);
  },
  torch() { // bracket at the wall (+z), flame (glow) in front
    return vmerge([vbox(0.12, 0.3, 0.06, 0, 0.35, 0.47, COL.iron), vbeam([0, 0.3, 0.45], [0, 0.55, 0.05], 0.06, COL.iron),
      vcyl(0.07, 0.05, 0.3, 6, 0, 0.62, 0.02, COL.darkWood), vcone(0.11, 0.3, 6, 0, 0.9, 0.02, COL.fire, 6)]);
  },
  lantern() {
    return vmerge([vbox(0.5, 0.06, 0.5, 0, 0.12, 0, COL.iron), vbox(0.36, 0.5, 0.36, 0, 0.42, 0, COL.glow, 6),
      vbox(0.06, 0.56, 0.06, -0.2, 0.42, -0.2, COL.iron), vbox(0.06, 0.56, 0.06, 0.2, 0.42, -0.2, COL.iron),
      vbox(0.06, 0.56, 0.06, -0.2, 0.42, 0.2, COL.iron), vbox(0.06, 0.56, 0.06, 0.2, 0.42, 0.2, COL.iron),
      vcone(0.4, 0.22, 4, 0, 0.8, 0, COL.iron), vbox(0.06, 0.12, 0.06, 0, 0.95, 0, COL.iron)]);
  },
  signArm() { // bar from the wall (+z) out to -z at the top; brace below
    return vmerge([vbox(0.5, 0.06, 1.0, 0, 0.97, 0, COL.iron), vbeam([0, 0.3, 0.48], [0, 0.95, -0.1], 0.05, COL.iron),
      vbox(0.5, 0.25, 0.06, 0, 0.8, 0.47, COL.iron), vblob(0.06, 0, 0.93, -0.5, 1, 1, 1, COL.iron)]);
  },
  signBoard() { // hangs from a pivot at the origin down to y = -1, board plane YZ
    return vmerge([vbox(0.12, 0.8, 0.92, 0, -0.55, 0, COL.darkWood), vbox(0.14, 0.62, 0.76, 0, -0.55, 0, 0xffffff, 1),
      vblob(0.16, 0, -0.55, 0, 0.95, 1, 1, 0xd8a820), vbox(0.03, 0.16, 0.03, 0, -0.07, -0.3, COL.iron), vbox(0.03, 0.16, 0.03, 0, -0.07, 0.3, COL.iron)]);
  },
  aleStake() { return vmerge([vbeam([0, 0.0, 0.5], [0, 0.55, -0.35], 0.07, COL.darkWood), vblob(0.2, 0, 0.62, -0.4, 1, 1.1, 1, 0x3f6a2c), vblob(0.13, 0.06, 0.52, -0.32, 1, 1, 1, 0x4e7a34)]); },
  windlass() {
    return vmerge([vcyl(0.12, 0.12, 0.84, 8, 0, 0.62, 0, COL.oak, 0, 0, 0, HALF_PI), vbox(0.05, 0.28, 0.05, 0.47, 0.5, 0, COL.iron),
      vbox(0.05, 0.05, 0.2, 0.52, 0.38, -0.08, COL.iron), vbox(0.012, 0.42, 0.012, 0, 0.3, -0.1, 0xbba27a),
      vcyl(0.09, 0.07, 0.14, 8, 0, 0.1, -0.1, COL.darkWood)]);
  },
  anvil() {
    return vmerge([vcyl(0.3, 0.34, 0.5, 8, 0, 0.25, 0, 0x5a4030), vbox(0.24, 0.12, 0.2, 0, 0.56, 0, COL.iron), vbox(0.5, 0.14, 0.28, 0, 0.69, 0, COL.iron),
      vcone(0.1, 0.24, 6, 0.36, 0.7, 0, COL.iron, 0, 0, -HALF_PI)]);
  },
  trough() { return vmerge([vbox(1, 0.5, 1, 0, 0.25, 0, 0x5a4633), vbox(0.86, 0.02, 0.7, 0, 0.44, 0, 0x3c4c52)]); },
  bell() {
    const pr = [[0.02, 1], [0.2, 0.98], [0.26, 0.8], [0.3, 0.45], [0.42, 0.12], [0.5, 0.0], [0.46, 0.0]];
    const g = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), 10);
    return vmerge([vc(flat(g), COL.bronze, 0), vbox(0.9, 0.1, 0.12, 0, 1.02, 0, COL.darkWood)]);
  },
  crossHead() { return vmerge([vbox(0.24, 1, 0.24, 0, 0.5, 0, COL.stoneLight, 5), vbox(0.8, 0.22, 0.22, 0, 0.66, 0, COL.stoneLight, 5), vbox(0.3, 0.08, 0.3, 0, 1.0, 0, COL.stoneLight, 5)]); },
  forgeGlow() {
    return vmerge([vbox(1, 0.55, 1, 0, 0.275, 0, 0x5a524a), vbox(0.72, 0.1, 0.72, 0, 0.6, 0, COL.coal, 6),
      vblob(0.2, -0.1, 0.66, 0.05, 1.3, 0.5, 1, COL.fire, 6), vblob(0.14, 0.18, 0.64, -0.12, 1.2, 0.5, 1, COL.coal, 6)]);
  },
  goods() {
    const P = [];
    for (let k = 0; k < 3; k++) { const x = -0.33 + k * 0.33; P.push(vcyl(0.14, 0.11, 0.18, 7, x, 0.09, -0.1, 0x8a6a40)); P.push(vblob(0.09, x - 0.04, 0.22, -0.12, 1, 0.8, 1, 0xffffff, 1), vblob(0.08, x + 0.05, 0.21, -0.06, 1, 0.8, 1, 0xffffff, 1)); }
    P.push(vcyl(0.09, 0.09, 0.5, 8, 0.1, 0.1, 0.25, 0xffffff, 1, 0, 0, HALF_PI), vcyl(0.08, 0.08, 0.5, 8, -0.2, 0.09, 0.26, 0xe8e0cc, 0, 0, 0, HALF_PI));
    P.push(vcyl(0.08, 0.06, 0.22, 7, 0.4, 0.11, 0.2, COL.pot), vcyl(0.06, 0.05, 0.18, 7, -0.42, 0.09, 0.22, COL.pot));
    return vmerge(P);
  },
  pillory() {
    return vmerge([vbox(1, 0.2, 1, 0, 0.1, 0, 0x6a5038), vbox(0.14, 0.9, 0.14, 0, 0.6, 0, COL.darkWood), vbox(0.7, 0.14, 0.1, 0, 0.9, 0, COL.darkWood),
      vbox(0.04, 0.04, 0.12, -0.22, 0.9, 0, COL.soot), vbox(0.04, 0.04, 0.12, 0, 0.9, 0, COL.soot), vbox(0.04, 0.04, 0.12, 0.22, 0.9, 0, COL.soot)]);
  },
  crane() { return craneGeo(true); },   // treadwheel crane frame + jib reaching to -z (the wheel is a separate part)
  craneT() { return craneGeo(false); }, // the same without its ground plate: rides the construction cap on a worksite
  // one bay of putlog scaffolding in a unit cube: x along the wall face, y up (3 lifts), +z against the wall.
  // Member sizes are pre-compensated for the usual bay scale (≈ 4.5 × 6 × 1.4 m).
  scaffold() {
    const P = [], pole = 0x8a7a62, led = 0x6b5a44, brd = 0x9c7e56, zo = -0.36, zi = 0.3;
    for (const x of [-0.49, 0.49]) for (const z of [zo, zi]) P.push(vbox(0.022, 1.0, 0.07, x, 0.5, z, pole));
    for (let k = 1; k <= 3; k++) {
      const y = k / 3 - 0.02;
      for (const z of [zo, zi]) P.push(vbox(1.0, 0.015, 0.05, 0, y, z, led));
      for (const x of [-0.3, 0.05, 0.4]) P.push(vbox(0.018, 0.012, 0.95, x, y - 0.012, 0.03, led));   // putlogs into the wall
      P.push(vbox(0.98, 0.008, 0.62, 0, y + 0.006, -0.03, brd));                                        // boards
      P.push(vbox(1.0, 0.012, 0.03, 0, y + 0.16, zo, led));                                            // guard rail
    }
    P.push(vbeam([-0.48, 0.02, zo - 0.03], [0.48, 0.98, zo - 0.03], 0.02, led));                       // raking brace
    return vmerge(P);
  }
};
function craneGeo(plate) {
  const w = COL.darkWood, P = [];
  if (plate) P.push(vbox(1, 0.06, 1, 0, 0.03, 0, 0x5a4633));
  for (const xs of [-0.3, 0.3]) { P.push(vbeam([xs, 0.05, 0.35], [xs * 0.4, 0.95, 0], 0.07, w), vbeam([xs, 0.05, -0.35], [xs * 0.4, 0.95, 0], 0.07, w)); }
  P.push(vbeam([0, 0.2, 0.3], [0, 1.0, -0.48], 0.07, w), vbeam([0, 0.95, 0.0], [0, 0.98, -0.48], 0.04, w));
  P.push(vbox(0.012, 0.5, 0.012, 0, 0.73, -0.47, 0xbba27a), vbox(0.08, 0.06, 0.08, 0, 0.46, -0.47, COL.iron));
  P.push(vbox(0.7, 0.34, 0.5, 0, 0.23, 0.2, 0x6a5038));
  return vmerge(P);
}

// ---- registry ---------------------------------------------------------------------------------
const MAT = { WALL: 0, ROOF: 1, PLAIN: 2, VC: 3 };
const DETAIL = new Set(['torch', 'lantern', 'signArm', 'signBoard', 'aleStake', 'windlass', 'anvil', 'goods', 'pillory', 'bell', 'pennant', 'ladder', 'trough', 'crossHead', 'scaffold']);
const GEO_LIST = [];
for (const [lib, mat] of [[G_WALL, MAT.WALL], [G_ROOF, MAT.ROOF], [G_PLAIN, MAT.PLAIN], [G_VC, MAT.VC]]) {
  for (const name in lib) GEO_LIST.push({ name, mat, detail: DETAIL.has(name), build: lib[name], geo: null });
}
const GI = {}; GEO_LIST.forEach((g, i) => GI[g.name] = i);
const NG = GEO_LIST.length;
function buildGeos() {
  for (const e of GEO_LIST) if (!e.geo) {
    e.geo = e.build();
    e.geo.computeBoundingSphere();
  }
}

// ---- shaders ---------------------------------------------------------------------------------
const CU = {
  uClock: { value: 0 }, uNightC: { value: 0 }, uLateC: { value: 0 }, uSnowC: { value: 0 }, uWindK: { value: 0.5 },
  uSpin: { value: 0 },  // integrated sail angle so a wind change never makes the sails jump
  // Living History: display year (0 = no story → legacy static age), replay view year (1e6 = live), rise span in years,
  // weathering spans in years (thatch, limewash, stone, lichen) and ivy (D.TUNE.kit.age)
  uYear: { value: 0 }, uView: { value: 1e6 }, uViewRise: { value: 1.5 },
  uAgeT: { value: new THREE.Vector4(35, 60, 160, 180) }, uAgeIvy: { value: 220 }
};
const TUNE = D.TUNE = D.TUNE || {};
TUNE.kit = Object.assign({ age: { thatch: 35, limewash: 60, stone: 160, lichen: 180, ivy: 220 } }, TUNE.kit || {});
const GLSL_U = `
uniform float uClock; uniform float uNightC; uniform float uLateC; uniform float uSnowC; uniform float uWindK; uniform float uSpin;
uniform float uYear; uniform float uView; uniform float uViewRise; uniform vec4 uAgeT; uniform float uAgeIvy;`;
// iLife replaces the old per-instance iDie float: x = die clock (the former iDie), y = built year (0 unknown),
// z = construction cap world Y (1e7 = complete), w = skeleton-stage end on the Kit clock (0 = legacy window)
const GLSL_IA = `
attribute vec4 iParams; attribute vec4 iParams2; attribute vec4 iAnim; attribute vec4 iLife; // iLife.x = the former iDie
`;
// shared growth / sink chunk (appended after project_vertex in every kit material and depth material).
// Part flags (iParams2.w): SCAFF clips to the cap + 2.4, RIDE rides the cap (crane), PEG shows only before the
// walls start, LATE (house roofs) is born 60% of the way into the skeleton stage. Other parts squash-rise as the
// cap passes them, except in the main WALL material (KIT_WALLCUT) whose fragments are cut at the cap instead.
// A RIDE part's iParams.w (vo) is its lift above the cap (only VC parts ride; VC never reads iParams.w otherwise).
const GROW = `
vec4 wpA = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
float kf = floor(iParams2.w + 0.5);
bool kSC = mod(floor(kf / 131072.0), 2.0) > 0.5, kRI = mod(floor(kf / 262144.0), 2.0) > 0.5,
     kPG = mod(floor(kf / 524288.0), 2.0) > 0.5, kLT = mod(floor(kf / 1048576.0), 2.0) > 0.5;
float kB = iAnim.x; if (kLT && iLife.w > 0.0 && iLife.w > kB) kB = mix(kB, iLife.w, 0.6);
float gA = clamp((uClock - kB) / 1.4, 0.0, 1.0); gA = 1.0 - pow(1.0 - gA, 3.0);
if (iLife.x > 0.0) gA *= 1.0 - clamp((uClock - iLife.x) / 0.8, 0.0, 1.0);
if (iLife.y > 0.5 && uView < 1e5) gA = min(gA, clamp((uView - iLife.y) / uViewRise, 0.0, 1.0));
float kCap = iLife.z, kTop = iAnim.y + length(instanceMatrix[1].xyz);
if (kPG && kCap > iAnim.y + 0.5) gA = 0.0;
if (kCap < 1e6) {
  if (kSC) { if (kCap + 2.4 < iAnim.y) gA = 0.0; }
#ifndef KIT_WALLCUT
  else if (!kRI && !kPG) gA = min(gA, clamp((kCap - iAnim.y) / max(kTop - iAnim.y, 0.1), 0.0, 1.0));
#endif
}
wpA.y = iAnim.y + (wpA.y - iAnim.y) * max(gA, 0.002);
if (kCap < 1e6) { if (kRI) wpA.y += kCap - iAnim.y + iParams.w; else if (kSC) wpA.y = min(wpA.y, kCap + 2.4); }
mvPosition = viewMatrix * wpA; gl_Position = projectionMatrix * mvPosition;
if (gA < 0.004) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`;
// main materials only: shadow lookups use the grown / sunk position too (worldpos_vertex runs after project_vertex)
const WPOS = `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION )
worldPosition = wpA; // kit-wpos
#endif`;
const KSC = `vec3 kSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`;

// -- WALL
const WALL_VDECL = `
attribute float aU; attribute float gTop;
// born, skeleton end, built year and construction cap share one vec4 (varying budget)
varying vec3 vKF; varying vec3 vKN; varying vec3 vKS; varying float vKU; varying vec4 vKP; varying vec4 vKP2; varying vec4 vKT; varying vec3 vAtW;
#define vKB vKT.x
#define vKFe vKT.y
#define vKY vKT.z
#define vKCap vKT.w
`;
const WALL_SHAPE = `
${KSC}
if (abs(gTop) > 0.5) { float kHg = clamp(iAnim.z, 0.0, 1.0); transformed.y = 1.0 - kHg; transformed.z = gTop * 0.5 * kHg; }`;
const WALL_VOUT = `
vKF = transformed * kSc; vKN = normal; vKS = kSc; vKU = aU > -5.0 ? aU * 3.14159265 * kSc.x : -1e4;
vKP = iParams; vKP2 = iParams2; vKB = iAnim.x;
vKFe = iLife.w; vKY = iLife.y; vKCap = iLife.z;`;
const FRAG_HELP = `
float kline(float d, float w, float px){ return 1.0 - smoothstep(w - px, w + px, d); }
float kbit(int f, int b){ return (f & b) != 0 ? 1.0 : 0.0; }
float ksegD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * h); }
float kbox(vec2 p, vec2 h, float px){ vec2 d = abs(p) - h; return 1.0 - smoothstep(-px, px, max(d.x, d.y)); }
float klancet(vec2 p, float w, float h, float px){
  float spr = max(h - 0.866 * w, 0.0);
  float body = kbox(p - vec2(0.0, spr * 0.5), vec2(w * 0.5, spr * 0.5), px);
  float head = (1.0 - smoothstep(-px, px, length(vec2(abs(p.x) + w * 0.5, p.y - spr)) - w)) * step(spr, p.y) * step(abs(p.x), w * 0.5);
  return max(body, head);
}`;
function glslVec(hex) { const c = lin(hex); return `vec3(${c[0].toFixed(4)}, ${c[1].toFixed(4)}, ${c[2].toFixed(4)})`; }
function wallFDecl() {
  const T = PAL.timber, S = [0x7a2f25, 0x3e5a36, 0x3f526a, 0xa8823a, 0x5e4632, 0x4e6a70];
  return `
// born, skeleton end, built year and construction cap share one vec4 (varying budget)
varying vec3 vKF; varying vec3 vKN; varying vec3 vKS; varying float vKU; varying vec4 vKP; varying vec4 vKP2; varying vec4 vKT; varying vec3 vAtW;
#define vKB vKT.x
#define vKFe vKT.y
#define vKY vKT.z
#define vKCap vKT.w

vec3 K_em; float K_ro;
vec3 kTcol(float t){ return t < 0.5 ? ${glslVec(T[0])} : t < 1.5 ? ${glslVec(T[1])} : t < 2.5 ? ${glslVec(T[2])} : t < 3.5 ? ${glslVec(T[3])} : ${glslVec(T[4])}; }
vec3 kShut(float h){ return h < 0.17 ? ${glslVec(S[0])} : h < 0.34 ? ${glslVec(S[1])} : h < 0.5 ? ${glslVec(S[2])} : h < 0.67 ? ${glslVec(S[3])} : h < 0.84 ? ${glslVec(S[4])} : ${glslVec(S[5])}; }`;
}
const FACADE = `
vec3 facade(vec3 base){
  K_em = vec3(0.0); K_ro = 0.88;
  vec3 n = normalize(vKN);
  float stF = vKP.x + 0.001;
  float st = floor(stF); float tone = floor(fract(stF) * 10.0);
  float seed = vKP.y, lit = vKP.z, vo = vKP.w;
  float wl = vKP2.x, age = vKP2.y, fh = max(vKP2.z, 1.2);
  // weathering: dated records (built year + a running chronicle) age from the clock; everything else keeps
  // its legacy static age, so undated records render exactly as before
  float kNew = (vKY > 0.5 && uYear > 0.5) ? 1.0 : 0.0;
  float ageY = kNew > 0.5 ? max(uYear - vKY, 0.0) : age * 110.0;
  if (kNew > 0.5) age = clamp(ageY / 110.0, 0.0, 1.0);
  float aWa = smoothstep(5.0, uAgeT.y, ageY) * kNew, aSt = smoothstep(15.0, uAgeT.z, ageY) * kNew;
  float aLi = smoothstep(40.0, uAgeT.w, ageY) * kNew, aIv = smoothstep(70.0, uAgeIvy, ageY) * kNew;
  int fl = int(vKP2.w + 0.5);
  float curved = step(-5000.0, vKU);
  float faceX = step(abs(n.z), abs(n.x));
  float sgz = n.z < 0.0 ? -1.0 : 1.0; float sgx = n.x < 0.0 ? -1.0 : 1.0;
  float u = mix(mix(-vKF.x * sgz, vKF.z * sgx, faceX), vKU, curved);
  float halfW = mix(mix(vKS.x, vKS.z, faceX) * 0.5, 3.14159265 * vKS.x * 0.5, curved);
  float v = vKF.y - vo;
  float edge = halfW - abs(u);
  // derivatives in uniform flow (facade() is called unconditionally)
  float pxm = max(fwidth(u), fwidth(v));
  float px = clamp(pxm, 0.002, 1.0);
  float fine = 1.0 - smoothstep(0.05, 0.14, pxm);
  float midF = 1.0 - smoothstep(0.20, 0.50, pxm);
  vec2 q = vec2(u, v) + vec2(seed * 1.37, seed * 0.71);
  float nA = d_vnoise(q * 1.1);
  float nB = d_vnoise(q * 4.3 + 11.0);
  if (n.y > 0.5) {   // wall-walk, flat top
    K_ro = 0.95;
    vec3 c = base * 0.72 * (0.82 + 0.3 * d_vnoise(vKF.xz * 1.3 + seed));
    return mix(c, vec3(0.88, 0.9, 0.95), uSnowC * 0.92);
  }
  if (n.y < -0.5) return base * 0.35;
  float faceId = curved > 0.5 ? (abs(u) < halfW * 0.5 ? 0.0 : 1.0) : (faceX > 0.5 ? (n.x > 0.0 ? 2.0 : 3.0) : (n.z < 0.0 ? 0.0 : 1.0));
  float party = faceId > 2.5 ? kbit(fl, 8) : faceId > 1.5 ? kbit(fl, 16) : (faceId > 0.5 && curved < 0.5) ? kbit(fl, 32) : 0.0;
  float isGable = kbit(fl, 8192);
  float noWin = max(kbit(fl, 16384), party);
  float ground = step(0.05, vo);
  float topV = vKS.y - vo;
  float isStone = ((st > 1.5 && st < 3.5) || (st > 5.5 && st < 7.5)) ? 1.0 : 0.0;
  float isTimber = (st > 0.5 && st < 1.5) ? 1.0 : 0.0;
  float church = (st > 6.5 && st < 7.5) ? 1.0 : 0.0;
  float castle = (st > 5.5 && st < 6.5) ? 1.0 : 0.0;
  vec3 tc = kTcol(tone);
  // timber bay grid (also sets the window rhythm on framed faces)
  float close = step(0.78, wl) * isTimber;
  float spc = mix(mix(1.9, 1.25, d_hash12(vec2(seed, 3.1))), 0.56, close);
  float nBay = max(1.0, floor(2.0 * halfW / spc + 0.5)); float bayW = 2.0 * halfW / nBay;
  float bu = (u + halfW) / bayW; float bayI = floor(bu); float lu = fract(bu) * bayW;
  float si = floor(max(v, 0.0) / fh); float vs = v - si * fh;
  vec3 col = base; vec3 avg = base;
  // ---- base material
  if (st < 1.5 || st > 7.5) {                 // daub / limewash / render
    if (kNew > 0.5) base *= mix(vec3(1.0), vec3(0.85, 0.75, 0.55), aWa);   // fresh limewash mellows to cream
    col = base * (0.9 + 0.16 * nA) * (1.0 - 0.07 * nB * fine);
    avg = base * 0.97; K_ro = 0.92;
    if (st < 0.5) {                            // wattle: flaking daub shows the hazel weave
      float fk = smoothstep(0.64, 0.72, d_fbm(q * 0.55) + age * 0.3 - 0.12);
      float wv = 0.5 + 0.5 * sin(u * 13.0 + sin(v * 11.0) * 1.3) * sin(v * 11.0);
      col = mix(col, vec3(0.21, 0.14, 0.08) * (0.7 + 0.6 * wv), fk * fine);
    }
  } else if (isStone > 0.5) {                  // rubble / ashlar / castle / church
    if (kNew > 0.5) {                          // new stone is pale; it darkens and greys with the years
      base *= 1.0 + (1.0 - aSt) * 0.12;
      base = mix(base, vec3(dot(base, vec3(0.3, 0.59, 0.11))), aSt * 0.45) * (1.0 - 0.25 * aSt);
    }
    float rowH = st < 2.5 ? 0.27 : st < 3.5 ? 0.34 : st < 6.5 ? 0.46 : 0.36;
    float row = floor(v / rowH), fr = fract(v / rowH);
    float bl = st < 2.5 ? mix(0.32, 0.75, d_hash12(vec2(row, seed))) : st < 3.5 ? 0.86 : st < 6.5 ? 1.05 : 0.78;
    float uu = u / bl + row * 0.53 + d_hash12(vec2(row, 3.7)) * (st < 2.5 ? 3.0 : 0.0);
    float bi = floor(uu), fu = fract(uu);
    float bh = d_hash12(vec2(bi, row) + seed * 0.37);
    float jitV = st < 2.5 ? (d_vnoise(vec2(u * 2.0, v * 2.0)) - 0.5) * 0.08 : 0.0;
    float jU = min(fu, 1.0 - fu) * bl, jV = min(fr, 1.0 - fr) * rowH + jitV;
    float mort = 1.0 - smoothstep(0.012, 0.04, min(jU, jV));
    vec3 sc = base * (0.8 + 0.34 * bh) * (0.9 + 0.16 * nA);
    col = mix(sc, base * 0.62 + vec3(0.05), mort * fine);
    avg = base * 0.93; K_ro = 0.86;
    if (kNew > 0.5) {                          // lichen speckle
      float lch = aLi * smoothstep(0.58, 0.78, d_fbm(vec2(u, v) / 0.7 + seed * 0.31)) * 0.55;
      col = mix(col, vec3(0.42, 0.43, 0.30) * (0.8 + 0.3 * nB), lch); avg = mix(avg, vec3(0.42, 0.43, 0.30), lch * 0.4);
    }
  } else if (st < 4.5) {                       // plank: vertical boards
    float bw = 0.26; float bq = u / bw; float bj = min(fract(bq), 1.0 - fract(bq)) * bw;
    float gap = 1.0 - smoothstep(0.006, 0.02, bj);
    float bt = d_hash12(vec2(floor(bq), seed));
    col = base * (0.8 + 0.3 * bt) * (0.9 + 0.15 * d_vnoise(vec2(u * 30.0, v * 1.5)) * fine);
    col = mix(col, base * 0.35, gap * fine);
    avg = base * 0.9; K_ro = 0.8;
  } else {                                     // log: horizontal logs, notched ends
    float lr = v / 0.3; float lf = fract(lr);
    float sh = sin(lf * 3.14159);
    col = base * (0.5 + 0.55 * sh) * (0.9 + 0.2 * d_hash12(vec2(floor(lr), seed)));
    col = mix(col, base * 0.25, (1.0 - smoothstep(0.02, 0.08, sh)) * fine);
    float endZ = (1.0 - smoothstep(0.16, 0.24, edge)) * (1.0 - curved);
    float ring = 0.5 + 0.5 * sin(length(vec2(edge - 0.1, (lf - 0.5) * 0.3)) * 60.0);
    col = mix(col, vec3(0.42, 0.33, 0.22) * (0.8 + 0.2 * ring), endZ * fine);
    avg = base * 0.8; K_ro = 0.85;
  }
  // quoins (stone or render)
  if (kbit(fl, 512) > 0.5 && curved < 0.5 && edge < 0.64) {
    float qr = floor(v / 0.34); float qlen = mod(qr, 2.0) < 0.5 ? 0.62 : 0.36;
    if (edge < qlen) {
      float qj = min(fract(v / 0.34), 1.0 - fract(v / 0.34)) * 0.34;
      col = base * 1.2 * (0.9 + 0.15 * d_hash12(vec2(qr, seed)));
      col *= 1.0 - 0.3 * (1.0 - smoothstep(0.01, 0.03, min(qj, qlen - edge))) * fine;
    }
  }
  // ---- timber framing
  float tim = 0.0;
  if (isTimber > 0.5) {
    float tw = mix(0.2, 0.15, close);
    float gab = isGable;
    float dP = min(lu, bayW - lu);
    float post = kline(dP, tw * 0.5, px);
    float rails = (kline(abs(vs - 0.09), 0.09, px) + kline(abs(vs - (fh - 0.08)), 0.08, px) + kline(abs(vs - fh * 0.36), 0.075, px) * (1.0 - close)) * (1.0 - gab);
    float endBay = max(step(bayI, 0.5), step(nBay - 1.5, bayI));
    float lxB = bayI < 0.5 ? lu : bayW - lu;
    float brace = kline(ksegD(vec2(lxB, vs), vec2(0.12, fh - 0.25), vec2(bayW - 0.1, fh * 0.36 + 0.05)), tw * 0.42, px) * endBay * step(1.5, nBay) * (1.0 - close) * (1.0 - gab);
    float deco = step(0.62, wl) * (1.0 - close) * (1.0 - gab) * (1.0 - endBay);
    vec2 pp = vec2(lu, vs);
    float xd = min(ksegD(pp, vec2(0.12, 0.2), vec2(bayW - 0.12, fh * 0.36 - 0.08)), ksegD(pp, vec2(0.12, fh * 0.36 - 0.08), vec2(bayW - 0.12, 0.2)));
    float crossB = kline(xd, 0.06, px) * deco * step(vs, fh * 0.36);
    float corner = kline(edge, 0.2, px) * (1.0 - curved);
    float rake = halfW * (1.0 - v / max(vKS.y, 0.1)) - abs(u);
    float gb = gab * max(max(kline(abs(v - 0.09), 0.1, px), kline(abs(v - vKS.y * 0.45), 0.08, px)), kline(rake, 0.16, px));
    tim = clamp(max(max(max(post, rails), max(brace, crossB)), max(corner, gb)), 0.0, 1.0);
  } else if (st < 0.5) {                       // wattle: crude corner posts and wall plate
    tim = max(kline(edge, 0.16, px) * (1.0 - curved), kline(abs(v - (topV - 0.1)), 0.1, px) * (1.0 - isGable));
  } else if (st > 3.5 && st < 4.5) {           // plank: corner posts
    tim = kline(edge, 0.13, px) * (1.0 - curved);
  }
  vec3 tcv = tc * (0.82 + 0.3 * d_vnoise(vec2(u * 3.0, v * 9.0) + seed));
  col = mix(col, tcv, tim);
  avg = mix(avg, tc, isTimber * (close > 0.5 ? 0.42 : 0.26));
  K_ro = mix(K_ro, 0.8, tim);
  // ---- plinth (sill wall under framed / plastered / boarded walls)
  float pl = step(v, 0.38) * ground * (1.0 - isStone) * (1.0 - isGable);
  if (pl > 0.5) {
    vec2 pq = vec2(u / 0.42 + floor(v / 0.19) * 0.5, v / 0.19);
    vec3 pc = vec3(0.30, 0.28, 0.25) * (0.75 + 0.4 * d_hash12(floor(pq) + seed));
    float pj = min(min(fract(pq.x), 1.0 - fract(pq.x)) * 0.42, min(fract(pq.y), 1.0 - fract(pq.y)) * 0.19);
    col = mix(pc, vec3(0.2, 0.19, 0.17), (1.0 - smoothstep(0.01, 0.03, pj)) * fine); avg = pc; tim = 1.0;
  }
  col *= 1.0 - 0.16 * step(v, 0.3) * ground * isStone;
  // ---- doors
  float fid = faceId;
  float doorF = (fid < 0.5 ? kbit(fl, 1) : fid < 1.5 ? kbit(fl, 2) : fid < 2.5 ? kbit(fl, 4) : 0.0) * ground;
  float barn = kbit(fl, 1024), dbl = kbit(fl, 32768);
  float dw = barn > 0.5 ? min(3.6, halfW * 1.1) : dbl > 0.5 ? 1.7 : 1.05;
  float dh = barn > 0.5 ? clamp(fh * 0.9, 2.4, 3.8) : dbl > 0.5 ? 2.25 : 2.0;
  float ud = (barn > 0.5 || curved > 0.5 || church > 0.5) ? 0.0 : (d_hash12(vec2(seed, fid + 7.0)) - 0.5) * 1.2 * max(0.0, halfW - dw * 0.5 - 0.9);
  if (isTimber > 0.5 && barn < 0.5 && dbl < 0.5 && bayW > dw + 0.2 && nBay > 1.5) ud = -halfW + (floor((ud + halfW) / bayW) + 0.5) * bayW;
  float du = (curved > 0.5 && fid > 0.5) ? edge : abs(u - ud);
  float archH = isStone > 0.5 ? dh - dw * 0.5 : dh;
  float inOpen = 0.0;
  if (doorF > 0.5 && v < dh + 0.35 && du < dw * 0.5 + 0.35 && v >= 0.0) {
    float inF = (du < dw * 0.5 + 0.14 && (v < archH + 0.14 || length(vec2(du, v - archH)) < dw * 0.5 + 0.14)) ? 1.0 : 0.0;
    float inD = (du < dw * 0.5 && (v < archH || length(vec2(du, v - archH)) < dw * 0.5)) ? 1.0 : 0.0;
    if (inF > 0.5) {
      col = isStone > 0.5 ? base * 1.14 : tc; tim = 1.0; inOpen = 1.0;
      if (inD > 0.5) {
        float pk = (u - ud) / 0.15; float pj = min(fract(pk), 1.0 - fract(pk)) * 0.15;
        vec3 dc = barn > 0.5 ? base * 0.55 + vec3(0.04, 0.02, 0.0) : vec3(0.19, 0.12, 0.07) * (0.75 + 0.45 * d_hash12(vec2(floor(pk), seed)));
        dc *= 1.0 - 0.45 * (1.0 - smoothstep(0.008, 0.025, pj)) * fine;
        float strap = kline(abs(v - 0.45), 0.05, px) + kline(abs(v - (archH - 0.35)), 0.05, px);
        dc = mix(dc, vec3(0.05), clamp(strap, 0.0, 1.0) * 0.8 * (1.0 - barn));
        if (barn > 0.5) dc = mix(dc, dc * 0.6, kline(ksegD(vec2(u - ud, v), vec2(-dw * 0.5 + 0.1, 0.2), vec2(dw * 0.5 - 0.1, dh - 0.2)), 0.1, px));
        dc = mix(dc, vec3(0.04), (dbl > 0.5 || barn > 0.5) ? kline(abs(u - ud), 0.03, px) : 0.0);
        col = dc; K_ro = 0.75;
      }
    }
  }
  // stable doors along the front
  if (kbit(fl, 2048) > 0.5 && fid < 0.5 && ground > 0.5 && v >= 0.0 && v < 2.25) {
    float nS = max(1.0, floor(2.0 * halfW / 3.2)); float cS = 2.0 * halfW / nS;
    float cuS = mod(u + halfW, cS) - cS * 0.5;
    if (abs(cuS) < 0.72) {
      col = tc; tim = 1.0; inOpen = 1.0;
      if (abs(cuS) < 0.6 && v < 2.1) col = v > 1.15 ? vec3(0.03, 0.025, 0.02) : vec3(0.26, 0.18, 0.11) * (0.8 + 0.3 * d_hash12(vec2(floor(cuS / 0.15), seed)));
    }
  }
  // shop front: open counter under the ground-floor lintel
  float shop = kbit(fl, 64) * step(fid, 0.5) * ground * (1.0 - curved);
  float openE = 0.0;
  if (shop > 0.5 && abs(u) < halfW - 0.45 && abs(u - ud) > dw * 0.5 + 0.35 && v > 0.62 && v < 2.3) {
    if (v > 0.85 && v < 2.15) { col = vec3(0.045, 0.035, 0.025) * (0.8 + 0.4 * nB); openE = 0.8; K_ro = 0.9; }
    else { col = tc * 1.25; }
    tim = 1.0; inOpen = 1.0;
  }
  // ---- windows
  float bel = kbit(fl, 65536) * step(topV - min(fh, 4.2), v);
  float winCov = 0.0;
  vec3 warm0 = vec3(1.0, 0.62, 0.28);
  if (noWin < 0.5 && v > 0.0 && (isGable < 0.5 || vKS.y > 2.3)) {
    float sp = church > 0.5 ? 4.6 : castle > 0.5 ? 4.5 : isTimber > 0.5 ? (bayW < 1.55 ? bayW * max(1.0, floor(2.2 / bayW + 0.5)) : bayW) : mix(3.4, 2.4, wl);
    float nC = max(1.0, floor(2.0 * halfW / sp + 0.2)); float cw = 2.0 * halfW / nC;
    float ci = floor((u + halfW) / cw); float cu = u + halfW - (ci + 0.5) * cw; float cc = -halfW + (ci + 0.5) * cw;
    float sfh = fh, wsi = si, sv = vs;
    float ww = clamp(mix(0.26, 0.5, wl) * cw, 0.5, 1.5);
    float wh = clamp(mix(0.3, 0.6, wl) * sfh, 0.55, 1.7);
    float wc = sfh * (si < 0.5 && ground > 0.5 ? 0.5 : 0.56);
    float pp0 = mix(0.45, 0.85, wl);
    if (church > 0.5) { ww = min(0.95, cw * 0.3); wh = clamp(sfh * 0.62, 1.6, 4.2); wc = sfh * 0.52; pp0 = 1.0; }
    if (castle > 0.5) { ww = 0.56; wh = 1.3; wc = sfh * 0.55; pp0 = 0.8; }
    if (isGable > 0.5) { cw = 2.0 * halfW; ci = 0.0; cu = u; cc = 0.0; wsi = 0.0; sv = v; ww = 0.62; wh = min(0.75, vKS.y * 0.3); wc = vKS.y * 0.3; sfh = 99.0; pp0 = 1.0; }
    winCov = pp0 * (castle > 0.5 ? 0.22 : 1.0) * (ww * wh) / (cw * min(sfh, 4.0));
    float h1 = d_hash12(vec2(ci, wsi) + seed * 0.173);
    float pres = step(h1, pp0);
    pres *= step(wsi * sfh + wc + wh * 0.5 + 0.18, topV);
    pres *= step(ww * 0.5 + 0.3, halfW - abs(cc));
    if (doorF > 0.5 && wsi < 0.5 && isGable < 0.5) pres *= step((dw + ww) * 0.5 + 0.25, (curved > 0.5 && fid > 0.5) ? halfW - abs(cc) : abs(cc - ud));
    pres *= 1.0 - shop * step(wsi, 0.5);
    if (kbit(fl, 2048) > 0.5 && fid < 0.5 && wsi < 0.5) pres = 0.0;
    if (barn > 0.5 && wsi < 0.5 && fid < 1.5) pres *= step(dw * 0.5 + ww * 0.5 + 0.3, abs(cc));
    pres *= 1.0 - bel;
    vec2 lp = vec2(cu, sv - wc);
    if (pres > 0.5 && inOpen < 0.5 && abs(lp.x) < ww + 0.25 && abs(lp.y) < wh * 0.5 + 0.25) {
      float wh2 = d_hash12(vec2(ci, wsi) * 1.7 + seed);
      float on = step(d_hash12(vec2(ci, wsi) + seed * 0.13), lit * (1.0 - 0.75 * uLateC));
      float flick = 0.86 + 0.14 * sin(uClock * (6.0 + 5.0 * wh2) + wh2 * 40.0);
      vec3 warm = warm0 * (0.8 + 0.4 * wh2);
      if (church > 0.5) {
        float m = klancet(vec2(lp.x, lp.y + wh * 0.5), ww, wh, px);
        float mf = klancet(vec2(lp.x, lp.y + wh * 0.5 + 0.12), ww + 0.24, wh + 0.2, px);
        col = mix(col, base * 1.14, mf * (1.0 - m));
        if (m > 0.01) {
          vec2 cg = vec2(lp.x / 0.2, (lp.y + wh * 0.5) / 0.28); vec2 cid = floor(cg);
          float hc = d_hash12(cid + seed * 0.7);
          vec3 sg = hc < 0.3 ? vec3(0.55, 0.05, 0.04) : hc < 0.55 ? vec3(0.05, 0.12, 0.5) : hc < 0.75 ? vec3(0.6, 0.42, 0.05) : hc < 0.88 ? vec3(0.08, 0.36, 0.12) : vec3(0.5, 0.45, 0.35);
          float ld = min(min(fract(cg.x), 1.0 - fract(cg.x)) * 0.2, min(fract(cg.y), 1.0 - fract(cg.y)) * 0.28);
          float lead = (1.0 - smoothstep(0.01, 0.025, ld)) * fine;
          col = mix(col, mix(sg * 0.2 + vec3(0.02), vec3(0.02), lead), m); K_ro = mix(K_ro, 0.3, m);
          K_em += sg * 1.4 * (1.0 - lead) * m * mix(0.35, 1.0, on) * flick * step(0.05, lit);
        }
      } else if (castle > 0.5) {
        float sl = max(kbox(lp, vec2(0.08, 0.65), px), kbox(lp - vec2(0.0, 0.12), vec2(0.28, 0.07), px));
        col = mix(col, vec3(0.03), sl);
        K_em += warm * sl * on * 0.5 * flick;
      } else {
        float inW = kbox(lp, vec2(ww * 0.5, wh * 0.5), px);
        float frm = kbox(lp, vec2(ww * 0.5 + 0.09, wh * 0.5 + 0.09), px) * (1.0 - inW);
        col = mix(col, isStone > 0.5 ? base * 1.18 : tc, frm); tim = max(tim, frm);
        float sil = kbox(lp - vec2(0.0, -wh * 0.5 - 0.08), vec2(ww * 0.5 + 0.16, 0.06), px) * max(kbit(fl, 256), isStone);
        col = mix(col, vec3(0.6, 0.57, 0.52), sil);
        float glazed = step(0.62, wl + 0.25 * wh2);
        float sh = d_hash12(vec2(ci, wsi) * 3.1 + seed * 0.5);
        float closed = (1.0 - glazed) * step(sh, 0.3);
        float open = step(0.3, sh) * step(sh, glazed > 0.5 ? 0.62 : 0.92);
        float brd = min(fract(lp.x / 0.12), 1.0 - fract(lp.x / 0.12)) * 0.12;
        vec3 shc = kShut(d_hash12(vec2(seed, 5.3))) * (1.0 - 0.3 * age) * (1.0 - 0.3 * (1.0 - smoothstep(0.006, 0.02, brd)) * fine);
        float sideP = kbox(vec2(abs(lp.x) - ww * 0.75 - 0.05, lp.y), vec2(ww * 0.25, wh * 0.5), px) * open;
        col = mix(col, shc, sideP); tim = max(tim, sideP);
        if (inW > 0.01) {
          vec3 gc;
          if (closed > 0.5) gc = shc;
          else if (glazed > 0.5) {
            vec2 dq = vec2(lp.x + lp.y, lp.x - lp.y) / 0.16;
            float lq = min(abs(fract(dq.x) - 0.5), abs(fract(dq.y) - 0.5)) * 0.16;
            gc = mix(vec3(0.05, 0.06, 0.07) + vec3(0.1, 0.12, 0.14) * smoothstep(-wh * 0.5, wh * 0.5, lp.y), vec3(0.03), (1.0 - smoothstep(0.006, 0.018, lq)) * fine * 0.8);
            K_ro = mix(K_ro, 0.25, inW);
          } else {
            gc = mix(vec3(0.03, 0.025, 0.02), tc, max(kline(abs(lp.x), 0.03, px), kline(abs(lp.y), 0.03, px)));
          }
          col = mix(col, gc, inW); tim = max(tim, inW);
          K_em += warm * inW * on * (1.0 - closed * 0.85) * flick;
        }
      }
    }
  }
  if (shop > 0.5 && openE > 0.0) K_em += warm0 * openE * step(0.2, lit);
  // rose window on the west front
  if (kbit(fl, 4096) > 0.5 && fid < 0.5 && curved < 0.5) {
    float rr = min(halfW * 0.42, 2.6);
    vec2 rp = vec2(u, v - (topV - rr - 1.2));
    float rd = length(rp);
    if (rd < rr + 0.25) {
      if (rd > rr) col = base * 1.15;
      else {
        float ang = atan(rp.y, rp.x);
        float pet = abs(fract(ang / 6.2831853 * 12.0) - 0.5);
        float trc = clamp(kline(abs(rd - rr * 0.45), 0.07, px) + kline(abs(rd - rr * 0.92), 0.08, px) + kline(pet * rd * 0.52, 0.05, px) * step(rr * 0.45, rd), 0.0, 1.0) * fine;
        float hc = d_hash12(vec2(floor(ang / 6.2831853 * 12.0), floor(rd / rr * 3.0)) + seed);
        vec3 sg = hc < 0.35 ? vec3(0.55, 0.05, 0.05) : hc < 0.7 ? vec3(0.06, 0.12, 0.5) : vec3(0.62, 0.45, 0.06);
        col = mix(sg * 0.22 + vec3(0.02), base * 0.9, trc);
        K_em += sg * 1.5 * (1.0 - trc) * step(0.05, lit);
        K_ro = 0.3;
      }
      tim = 1.0;
    }
  }
  // belfry louvres
  if (bel > 0.5 && v < topV - 0.3) {
    float nL = halfW > 2.4 ? 2.0 : 1.0; float cwL = 2.0 * halfW / nL;
    float cuL = mod(u + halfW, cwL) - cwL * 0.5;
    float hB = min(fh, 4.2); float b0 = topV - hB + 0.35;
    float m = klancet(vec2(cuL, v - b0), min(1.1, cwL * 0.4), hB - 0.9, px);
    float sl = step(0.5, fract((v - b0) / 0.24));
    col = mix(col, mix(vec3(0.03), tc * 1.1, sl * 0.8 * fine + 0.1), m);
    tim = max(tim, m);
  }
  // ---- far anti-aliasing: collapse detail to the average wall + window coverage
  vec3 avgW = mix(avg, vec3(0.05), winCov * 0.7);
  col = mix(avgW, col, midF);
  vec3 farEm = (church > 0.5 ? vec3(0.32, 0.18, 0.2) : warm0) * lit * (1.0 - 0.75 * uLateC) * winCov * 0.9;
  K_em = mix(farEm, K_em, midF);
  // ---- age: ground grime, streaks, moss on stone
  col *= 1.0 - 0.25 * age * (1.0 - smoothstep(0.0, 1.3, v)) * ground;
  col *= 1.0 - 0.13 * age * smoothstep(0.55, 0.9, d_vnoise(vec2(u * 1.8, v * 0.09) + seed)) * fine;
  col = mix(col, vec3(0.13, 0.17, 0.07) * (0.8 + 0.4 * nB), isStone * age * 0.6 * (1.0 - smoothstep(0.0, 1.1, v)) * ground * smoothstep(0.5, 0.75, d_fbm(q * 1.3)));
  if (kNew > 0.5) {
    // limewash grime streaks
    float wash = (st < 1.5 || st > 7.5) ? 1.0 : 0.0;
    col *= 1.0 - 0.1 * aWa * wash * smoothstep(0.6, 0.95, d_vnoise(vec2(u * 2.6, v * 0.12) + seed * 1.7)) * fine;
    // ivy: church and castle walls, and any stone wall past 80 years; climbs from the ground, keenest at corners
    float ivyOk = max(max(church, castle), isStone * step(80.0, ageY)) * ground * (1.0 - isGable) * (1.0 - step(0.5, tim));
    if (ivyOk > 0.5 && aIv > 0.0) {
      float reach = aIv * topV * (0.5 + 0.5 * d_vnoise(vec2(u * 0.3, seed))) * mix(0.55, 1.0, 1.0 - smoothstep(0.0, 3.0, edge * (1.0 - curved) + curved * 3.0));
      float leaf = d_vnoise(vec2(u, v) * 7.0 + seed);
      float iv = (1.0 - smoothstep(reach - 0.6, reach, v)) * smoothstep(0.25, 0.5, leaf + 0.2);
      col = mix(col, vec3(0.16, 0.24, 0.10) * (0.6 + 0.7 * leaf), iv); K_ro = mix(K_ro, 0.75, iv);
    }
  }
  // ---- framing stage: the skeleton stands first, infill follows. FRAMEOLD (framed timber, as in v44) keeps the
  // legacy 2.2 s window; with a history reveal (vKFe > 0) every style gets a stage, non-timber walls a
  // synthesised post-and-rail frame.
  if (kbit(fl, 128) > 0.5) {
    float fe = vKFe > 0.0 ? vKFe : (kbit(fl, 2097152) > 0.5 ? vKB + 2.2 : -1e9);
    if (uClock > vKB - 0.05 && uClock < fe && v > 0.45) {
      float fr = tim;
      if (isTimber < 0.5) {
        float bp = min(fract((u + halfW) / 2.4), 1.0 - fract((u + halfW) / 2.4)) * 2.4;
        fr = max(kline(edge, 0.2, px) * (1.0 - curved), kline(bp, 0.11, px));
        if (isGable > 0.5) fr = max(fr, kline(halfW * (1.0 - v / max(vKS.y, 0.1)) - abs(u), 0.16, px));
        else fr = max(fr, max(kline(abs(vs - 0.09), 0.09, px), kline(abs(v - (topV - 0.1)), 0.1, px)));
        col = mix(col, tcv, fr);
      }
      if (fr < 0.5) discard;
    }
  }
  return col;
}`;

// -- ROOF
const ROOF_DECL = `
attribute vec3 rUV; attribute float rRow; attribute vec2 rCap;
vec3 roofShape(vec3 p, vec3 kSc, float kHc){
  if (rCap.x >= 0.0) { p.y = (1.0 - kHc) + kHc * rCap.x; p.z = rCap.y * 0.5 * (1.0 - p.y); p.x = sign(position.x) * 0.5; }
  if (rRow > 0.5 && kHc > 0.001) { p.y = 1.0 - kHc; p.z = sign(position.z) * 0.5 * kHc; }   // hinge row moves only for a half-hip
  if (abs(position.x) > 0.499 && rUV.z < 0.5) { float e = max(0.0, p.y - (1.0 - kHc)); p.x = sign(position.x) * max(0.5 - e * 0.5 * kSc.z / kSc.x, 0.0); }
  return p;
}`;
const ROOF_VDECL = ROOF_DECL + `
varying vec2 vKR; varying float vKM; varying float vKUp; varying vec4 vKP; varying vec4 vKP2; varying float vKL; varying float vKY;`;
const ROOF_NORMAL = `
${KSC}
float kHc = clamp(iAnim.z, 0.0, 1.0);
if (rCap.x >= 0.0) objectNormal = normalize(vec3(sign(position.x) * 2.0 * kSc.x / kSc.z, 1.0, 0.0));`;
const ROOF_BEGIN = `
transformed = roofShape(transformed, kSc, kHc);
float kM = rUV.z;
if (kM < 0.5 && normal.y < -0.2) kM = 3.0;
float kSl = sqrt(0.25 * kSc.z * kSc.z + kSc.y * kSc.y);
vec2 kr;
if (kM > 0.5 && kM < 1.5) { kSl = sqrt(0.25 * kSc.x * kSc.x + kSc.y * kSc.y); kr = vec2(rUV.x * 3.14159265 * kSc.x * max(1.0 - transformed.y, 0.05), (1.0 - transformed.y) * kSl); }
else if (kM > 1.5 && kM < 2.5) { kSl = sqrt(kSc.z * kSc.z + kSc.y * kSc.y); kr = vec2(transformed.x * kSc.x, (1.0 - transformed.y) * kSl); }
else if (rCap.x >= 0.0) kr = vec2(transformed.z * kSc.z, (1.0 - transformed.y) * kSl);
else kr = vec2(transformed.x * kSc.x, (1.0 - transformed.y) * kSl);
vKR = kr; vKM = kM; vKL = kSl; vKP = iParams; vKP2 = iParams2; vKY = iLife.y;
vKUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (objectNormal / (kSc * kSc))).y;`;
const ROOF_DEPTH_BEGIN = `
${KSC}
float kHc = clamp(iAnim.z, 0.0, 1.0);
transformed = roofShape(transformed, kSc, kHc);`;
const ROOF_FDECL = `
varying vec2 vKR; varying float vKM; varying float vKUp; varying vec4 vKP; varying vec4 vKP2; varying float vKL; varying float vKY;
vec3 K_em; float K_ro;
vec3 roofCol(vec3 base){
  K_em = vec3(0.0); K_ro = 0.85;
  float a = vKR.x, s = vKR.y;
  float pxm = max(fwidth(a), fwidth(s)); float px = clamp(pxm, 0.002, 1.0);
  float fine = 1.0 - smoothstep(0.03, 0.10, pxm);
  float midF = 1.0 - smoothstep(0.10, 0.35, pxm);
  float st = floor(vKP.x + 0.001), seed = vKP.y, wl = vKP2.x, age = vKP2.y;
  float kNew = (vKY > 0.5 && uYear > 0.5) ? 1.0 : 0.0;       // dated record + running chronicle (else legacy age)
  float ageY = max(uYear - vKY, 0.0);
  if (kNew > 0.5) age = clamp(ageY / 110.0, 0.0, 1.0);
  if (kNew > 0.5 && st < 0.5) base = mix(base, vec3(0.237, 0.218, 0.181), smoothstep(2.0, uAgeT.x, ageY));   // straw gold → silver-grey
  vec2 q = vec2(a, s) + seed * 0.37;
  float nA = d_vnoise(q * 0.9);
  float nB = d_vnoise(q * 3.7 + 5.0);
  if (vKM > 2.5) { K_ro = 0.95; return base * 0.32; }
  vec3 col = base; vec3 avg = base * 0.9;
  if (st < 0.5) {                               // thatch
    float f1 = d_vnoise(vec2(a * 7.0, s * 0.8) + q);
    float f2 = d_vnoise(vec2(a * 31.0, s * 2.5) + 5.0);
    col = base * (0.74 + 0.32 * f1 + 0.16 * (f2 - 0.5) * fine);
    float crs = fract(s / 0.34 + d_vnoise(vec2(a * 0.6, 3.0)) * 0.3);
    col *= 1.0 - 0.12 * smoothstep(0.7, 1.0, crs) * midF;
    if (vKM < 0.5) {                            // block-cut ridge, scalloped + liggers when well-off
      float rich = step(0.45, wl);
      float scl = 0.62 + 0.14 * abs(sin(a * 3.14159 / 0.55)) * rich;
      float rid = 1.0 - smoothstep(scl - px - 0.02, scl + px + 0.02, s);
      vec3 rc = base * vec3(0.9, 0.86, 0.78) * (0.8 + 0.3 * f2);
      float lig = rich * (kline(abs(s - 0.18), 0.025, px) + kline(abs(s - scl + 0.12), 0.025, px));
      float spar = rich * rid * kline(abs(fract((a + s) / 0.35) - 0.5) * 0.35, 0.02, px);
      rc = mix(rc, vec3(0.3, 0.22, 0.12), clamp(lig + spar, 0.0, 1.0) * fine);
      col = mix(col, rc, rid);
    }
    col *= 1.0 - 0.28 * smoothstep(vKL - 0.45, vKL, s);
    avg = base * 0.9; K_ro = 0.97;
  } else if (st < 3.5) {                        // tile / slate / shingle
    float rh = st < 1.5 ? 0.27 : st < 2.5 ? 0.21 : 0.18;
    float tw = st < 1.5 ? 0.2 : st < 2.5 ? 0.3 : 0.16;
    float row = floor(s / rh), fr = fract(s / rh);
    float cu = a / tw + row * 0.5 + (st > 2.5 ? d_hash12(vec2(row, 1.3)) : 0.0);
    float ci = floor(cu), fu = fract(cu);
    float th = d_hash12(vec2(ci, row) + seed);
    vec3 tcol = base * (0.78 + 0.42 * th);
    if (st > 2.5) tcol = mix(tcol, vec3(0.42, 0.41, 0.4) * (0.8 + 0.4 * th), clamp(age * 0.9, 0.0, 1.0));
    tcol *= 0.7 + 0.3 * smoothstep(0.0, 0.4, fr);
    float jn = 1.0 - smoothstep(0.012, 0.04, min(fu, 1.0 - fu) * tw);
    col = tcol * (1.0 - 0.45 * jn * fine);
    if (vKM < 0.5) { float rt = 1.0 - smoothstep(0.2, 0.22 + px, s); col = mix(col, base * 0.62 * (0.9 + 0.2 * d_hash12(vec2(floor(a / 0.45), seed))), rt); }
    avg = st > 2.5 ? mix(base, vec3(0.42, 0.41, 0.4), clamp(age * 0.9, 0.0, 1.0)) * 0.85 : base * 0.86;
    K_ro = st > 1.5 && st < 2.5 ? 0.55 : 0.78;
  } else if (st < 4.5) {                        // lead with rolled seams
    float sm = min(fract(a / 0.62), 1.0 - fract(a / 0.62)) * 0.62;
    col = base * (0.86 + 0.18 * nA);
    col = mix(col, base * 1.35, kline(sm, 0.035, px) * fine);
    K_ro = 0.42;
  } else if (st < 5.5) {                        // turf
    col = base * (0.66 + 0.55 * d_fbm(q * 1.5));
    col = mix(col, vec3(0.8, 0.75, 0.3), step(0.93, d_hash12(floor(q * 6.0))) * fine * 0.6);
    K_ro = 1.0;
  } else {                                      // stone slabs, graded smaller toward the ridge
    float c = (sqrt(s + 0.3) - 0.5477) * 5.0;
    float row = floor(c), fr = fract(c);
    float sw = 0.3 + 0.25 * d_hash12(vec2(row, seed));
    float cu = a / sw + row * 0.5; float fu = fract(cu);
    float th = d_hash12(vec2(floor(cu), row) + seed);
    col = base * (0.75 + 0.45 * th) * (0.85 + 0.3 * smoothstep(0.0, 0.35, fr));
    col *= 1.0 - 0.4 * (1.0 - smoothstep(0.015, 0.05, min(fu, 1.0 - fu) * sw)) * fine;
    K_ro = 0.9;
  }
  col = mix(avg * (0.9 + 0.2 * nA), col, midF);
  float ms = age * smoothstep(0.52, 0.78, d_fbm(q * 0.7)) * (st < 0.5 ? 0.5 : (st > 3.5 && st < 4.5) ? 0.0 : 1.0);
  col = mix(col, vec3(0.15, 0.2, 0.07) * (0.8 + 0.4 * nB), ms * 0.75);
  col = mix(col, vec3(0.9, 0.92, 0.96), uSnowC * smoothstep(0.3, 0.62, vKUp));
  return col;
}`;

// -- PLAIN / VC animation (sails, wheels, banners, flicker, boats, signs)
const ANIM_FNS = `
vec2 kRot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
float kMode(){ return floor(iAnim.w / 16.0 + 0.001); }
vec3 kAnim(vec3 p, float isN){
  float m = kMode(); float r = (iAnim.w - m * 16.0) * 0.1; float ph = iAnim.z;
  if (m < 0.5) return p;
  if (m < 1.5) p.xy = kRot(p.xy, -uSpin * r + ph);
  else if (m < 2.5) p.yz = kRot(p.yz, -uClock * (0.4 + r) + ph);
  else if (m < 3.5) { if (isN < 0.5) { float x = max(p.x, 0.0); p.z += sin(x * 5.5 - uClock * (3.0 + r * 4.0) + ph) * 0.1 * x * (0.35 + uWindK); } }
  else if (m < 4.5) { }
  else if (m < 5.5) { if (isN < 0.5) p.y += sin(uClock * 1.1 + ph) * 0.025; p.xy = kRot(p.xy, sin(uClock * 0.9 + ph) * 0.035); p.yz = kRot(p.yz, sin(uClock * 0.7 + ph * 1.3) * 0.02); }
  else p.xy = kRot(p.xy, sin(uClock * 1.7 + ph) * (0.05 + 0.16 * uWindK));
  return p;
}`;
const PLAIN_VDECL = ANIM_FNS + `
varying vec3 vKF; varying vec3 vKN; varying vec4 vKP; varying float vKUp;`;
const PLAIN_BEGIN = `
${KSC}
transformed = kAnim(transformed, 0.0);
vKF = transformed * kSc; vKN = normal; vKP = iParams; vKUp = normal.y;`;
const ANIM_DEPTH_BEGIN = `
transformed = kAnim(transformed, 0.0);`;
const PLAIN_FDECL = `
varying vec3 vKF; varying vec3 vKN; varying vec4 vKP; varying float vKUp;
vec3 K_em; float K_ro;
vec3 plainCol(vec3 base){
  K_em = vec3(0.0); K_ro = 0.82;
  vec3 n = normalize(vKN);
  float st = floor(vKP.x + 0.001), seed = vKP.y, glow = vKP.w;
  float horiz = step(0.5, abs(n.y));
  vec2 q = mix(vec2(abs(n.x) > abs(n.z) ? vKF.z : vKF.x, vKF.y), vKF.xz, horiz);
  float ang = atan(vKF.z, vKF.x) / 6.2831853 * 12.0;
  float pxm = max(fwidth(q.x), fwidth(q.y)); float px = clamp(pxm, 0.002, 1.0);
  float pxa = fwidth(ang);
  float fine = 1.0 - smoothstep(0.04, 0.12, pxm);
  float fineA = 1.0 - smoothstep(0.08, 0.3, min(pxa, 1.0));
  vec3 cream = vec3(0.74, 0.69, 0.58);
  vec3 col = base * (0.9 + 0.12 * d_vnoise(q * 1.7 + seed));
  if (st > 0.5 && st < 1.5) {                   // stripes across x (awnings, stall cloth)
    float sb = step(0.5, fract(vKF.x / 0.9 + 0.25));
    col = mix(mix(col, cream, sb), mix(base, cream, 0.5), 1.0 - fine);
    K_ro = 0.95;
  } else if (st < 2.5) {                        // radial stripes (round tents)
    float sb = step(0.5, fract(ang));
    col = mix(mix(col, cream, sb), mix(base, cream, 0.5), 1.0 - fineA);
    K_ro = 0.95;
  } else if (st < 3.5) {                        // boards
    float jc = horiz > 0.5 ? q.y : q.x;
    float bj = min(fract(jc / 0.24), 1.0 - fract(jc / 0.24)) * 0.24;
    col *= (0.82 + 0.3 * d_hash12(vec2(floor(jc / 0.24), seed))) * (1.0 - 0.5 * (1.0 - smoothstep(0.006, 0.02, bj)) * fine);
    K_ro = 0.85;
  } else if (st < 4.5) {                        // iron grid (portcullis)
    vec2 g = fract(q / 0.42) - 0.5;
    float hole = step(abs(g.x), 0.34) * step(abs(g.y), 0.34);
    if (hole > 0.5 && fine > 0.5) discard;
    col = base * 0.8; K_ro = 0.5;
  } else if (st < 5.5) {                        // dressed stone
    float row = floor(q.y / 0.3); float uu = q.x / 0.7 + row * 0.5;
    float jj = min(min(fract(uu), 1.0 - fract(uu)) * 0.7, min(fract(q.y / 0.3), 1.0 - fract(q.y / 0.3)) * 0.3);
    col = base * (0.84 + 0.3 * d_hash12(vec2(floor(uu), row) + seed));
    col = mix(col, base * 0.62, (1.0 - smoothstep(0.012, 0.035, jj)) * fine * (1.0 - horiz * 0.6));
    K_ro = 0.9;
  } else {                                      // still water
    col = base * (0.85 + 0.25 * d_vnoise(vKF.xz * 0.5 + vec2(uClock * 0.15, uClock * 0.11)));
    K_ro = 0.14;
  }
  if (glow > 0.0) K_em = base * glow;
  if (st < 5.5) col = mix(col, vec3(0.88, 0.9, 0.95), uSnowC * smoothstep(0.55, 0.85, vKUp) * 0.9);
  return col;
}`;
const VC_VDECL = ANIM_FNS + `
attribute float tint; varying float vKG; varying float vKFl; varying float vKUp;`;
const VC_COLOR = `
if (tint < 0.5 || tint > 1.5) vColor.xyz = color.xyz;
vKG = step(5.5, tint); vKUp = normal.y * step(0.5, tint) * step(tint, 5.5);`;
const VC_BEGIN = `
transformed = kAnim(transformed, 0.0);
float kmF = kMode();
vKFl = (kmF > 3.5 && kmF < 4.5) ? 0.78 + 0.22 * sin(uClock * 9.0 + iAnim.z * 7.0) * sin(uClock * 5.3 + iAnim.z) : 1.0;`;
const VC_FDECL = `
varying float vKG; varying float vKFl; varying float vKUp;`;

function checkShader(sh, name, vMarks, fMarks) {
  for (const m of vMarks) if (sh.vertexShader.indexOf(m) < 0) console.warn('[kit] ' + name + ': vertex injection missing "' + m + '"');
  for (const m of fMarks || []) if (sh.fragmentShader.indexOf(m) < 0) console.warn('[kit] ' + name + ': fragment injection missing "' + m + '"');
  if (sh.vertexShader.indexOf('iDie') <= 0) console.warn('[kit] ' + name + ': iDie not injected');   // GLSL_IA keeps it in a comment
  if (sh.vertexShader.indexOf('attribute vec4 iLife') <= 0 || sh.vertexShader.indexOf('float kCap = iLife.z') <= 0) console.warn('[kit] ' + name + ': iLife / GROW not injected');
}
// ---- Atlas plaster hook (E defines the D.AU uniforms and the D.GLSL_ATLAS at_* helpers). Compiled in only when
// both exist, so a build without atlas.js / the terrain AU block compiles exactly the legacy programs.
function atlasOn() { return !!(D.AU && typeof D.GLSL_ATLAS === 'string' && D.GLSL_ATLAS.indexOf('at_surfaceLin') >= 0 && D.GLSL_ATLAS.indexOf('at_k') >= 0); }
function atlasGlsl() {   // helpers, plus uniform declarations for any AU entry the helper text does not declare itself
  const src = D.GLSL_ATLAS; let decl = '';
  for (const k in D.AU) {
    if (new RegExp('uniform\\s+\\w+\\s+' + k + '\\b').test(src)) continue;
    const v = D.AU[k] && D.AU[k].value;
    const t = typeof v === 'number' ? 'float' : !v ? null : v.isTexture ? 'sampler2D' : v.isVector4 ? 'vec4' : (v.isVector3 || v.isColor) ? 'vec3' : v.isVector2 ? 'vec2' : null;
    if (t) decl += `uniform ${t} ${k};\n`;
  }
  return '\n' + decl + src + '\n';
}
const NOISE = () => D.GLSL_NOISE || `
float d_hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float d_vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(d_hash12(i), d_hash12(i+vec2(1.0,0.0)), u.x), mix(d_hash12(i+vec2(0.0,1.0)), d_hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float d_fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a * d_vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }`;

// Thin roof verges, fascias and wall-tops are near edge-on slivers from a distance; with MSAA the fragment
// runs at the pixel centre outside such a triangle and extrapolated varyings blow up to Inf → NaN pixels
// that bloom smears into white blobs. Centroid sampling keeps interpolation inside the triangle; the clamps
// below are a belt-and-braces guard.
function cen(src) { return D.renderer && D.renderer.capabilities && D.renderer.capabilities.isWebGL2 ? src.replace(/\bvarying\b/g, 'centroid varying') : src; }
const SAFE_COL = 'diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.5);';
function makeMaterials() {
  const ATL = atlasOn(), AG = ATL ? atlasGlsl() : '';
  const U = sh => { Object.assign(sh.uniforms, CU); if (ATL) Object.assign(sh.uniforms, D.AU); };
  // vAtW: world position after grow / sink (WALL always has it: the construction cut needs it; the rest only for the Atlas)
  const ATW_OUT = '\nvAtW = wpA.xyz;';
  const atSurf = yr => ATL ? `\nif (uAtlas > 0.001) diffuseColor.rgb = at_surfaceLin(diffuseColor.rgb, vAtW.xz, ${yr});` : '';
  const atEm = ATL ? ' * (1.0 - at_k(vAtW.xz))' : '';
  // walls under construction are cut at the cap along ragged courses (not squashed; the depth material squashes)
  const CUT = '\nif (vKCap < 1e6 && vAtW.y > vKCap + 0.35 * d_vnoise(vec2((vAtW.x + vAtW.z) * 1.2, 7.0))) discard;';
  const wall = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  wall.onBeforeCompile = sh => {
    U(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GLSL_U + GLSL_IA + cen(WALL_VDECL))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n// kit-wall')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + WALL_SHAPE + WALL_VOUT)
      .replace('#include <project_vertex>', '#include <project_vertex>\n#define KIT_WALLCUT' + GROW)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + WPOS + ATW_OUT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GLSL_U + NOISE() + AG + FRAG_HELP + cen(wallFDecl()) + FACADE)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = facade(diffuseColor.rgb);' + SAFE_COL + CUT + atSurf('vKY'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(K_ro, 0.3, 1.0); K_em = clamp(K_em, 0.0, 8.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += K_em * uNightC * 1.6' + atEm + ';');
    checkShader(sh, 'kit-wall', ['vKU =', 'wpA.y', '// kit-wall', '// kit-wpos', 'KIT_WALLCUT', 'vAtW = wpA.xyz', 'vKFe = iLife.w'],
      ['facade(diffuseColor', 'roughnessFactor = clamp(K_ro', 'K_em * uNightC', 'vAtW.y > vKCap'].concat(ATL ? ['at_surfaceLin(diffuseColor'] : []));
  };
  wall.customProgramCacheKey = () => 'kit-wall' + (ATL ? '-at' : '');

  const roof = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  roof.onBeforeCompile = sh => {
    U(sh);
    const V = ATL ? '\nvarying vec3 vAtW;' : '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GLSL_U + GLSL_IA + cen(ROOF_VDECL + V))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + ROOF_NORMAL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + ROOF_BEGIN)
      .replace('#include <project_vertex>', '#include <project_vertex>' + GROW)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + WPOS + (ATL ? ATW_OUT : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GLSL_U + NOISE() + AG + FRAG_HELP + cen(ROOF_FDECL.replace('varying float vKY;', 'varying float vKY;' + V)))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = roofCol(diffuseColor.rgb);' + SAFE_COL + atSurf('vKY'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(K_ro, 0.3, 1.0); K_em = clamp(K_em, 0.0, 8.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += K_em' + atEm + ';');
    checkShader(sh, 'kit-roof', ['roofShape(transformed', 'wpA.y', 'objectNormal = normalize', '// kit-wpos', 'vKY = iLife.y'], ['roofCol(diffuseColor', 'roughnessFactor = clamp(K_ro', 'uAgeT.x']);
  };
  roof.customProgramCacheKey = () => 'kit-roof' + (ATL ? '-at' : '');

  const plainM = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  plainM.onBeforeCompile = sh => {
    U(sh);
    const V = ATL ? '\nvarying vec3 vAtW;' : '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GLSL_U + GLSL_IA + cen(PLAIN_VDECL + V))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = kAnim(objectNormal, 1.0);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + PLAIN_BEGIN)
      .replace('#include <project_vertex>', '#include <project_vertex>' + GROW)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + WPOS + (ATL ? ATW_OUT : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GLSL_U + NOISE() + AG + cen(PLAIN_FDECL + V))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = plainCol(diffuseColor.rgb);' + SAFE_COL + atSurf('0.0'))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(K_ro, 0.3, 1.0); K_em = clamp(K_em, 0.0, 8.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += K_em * (0.3 + uNightC * 3.0)' + atEm + ';');
    checkShader(sh, 'kit-plain', ['kAnim(objectNormal', 'vKF = transformed', 'wpA.y', '// kit-wpos'], ['plainCol(diffuseColor', 'roughnessFactor = clamp(K_ro']);
  };
  plainM.customProgramCacheKey = () => 'kit-plain' + (ATL ? '-at' : '');

  const vcM = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true, flatShading: true });
  vcM.onBeforeCompile = sh => {
    U(sh);
    const V = ATL ? '\nvarying vec3 vAtW;' : '';   // VC keeps plain (non-centroid) varyings like its other ones
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + GLSL_U + GLSL_IA + VC_VDECL + V)
      .replace('#include <color_vertex>', '#include <color_vertex>' + VC_COLOR)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = kAnim(objectNormal, 1.0);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + VC_BEGIN)
      .replace('#include <project_vertex>', '#include <project_vertex>' + GROW)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + WPOS + (ATL ? ATW_OUT : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + GLSL_U + (ATL ? NOISE() + AG : '') + VC_FDECL + V)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.95), uSnowC * smoothstep(0.55, 0.85, vKUp) * 0.9);' + atSurf('0.0'))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vKG * (0.4 + uNightC * 5.0) * vKFl' + atEm + ';');
    checkShader(sh, 'kit-vc', ['vColor.xyz = color.xyz', 'kAnim(objectNormal', 'vKFl =', 'wpA.y', '// kit-wpos'], ['vKG * (0.4']);
  };
  vcM.customProgramCacheKey = () => 'kit-vc' + (ATL ? '-at' : '');

  // depth materials: identical position code so shadows follow shape, animation and growth (no KIT_WALLCUT:
  // construction shadows squash; never atlas-aware)
  function depth(name, decl, begin) {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, CU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>' + GLSL_U + GLSL_IA + decl)
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + begin)
        .replace('#include <project_vertex>', '#include <project_vertex>' + GROW);
      checkShader(sh, name, ['wpA.y']);
    };
    m.customProgramCacheKey = () => name;
    return m;
  }
  const dWall = depth('kit-wall-depth', '\nattribute float aU; attribute float gTop;', WALL_SHAPE);
  const dRoof = depth('kit-roof-depth', ROOF_DECL, ROOF_DEPTH_BEGIN);
  const dPlain = depth('kit-plain-depth', ANIM_FNS, ANIM_DEPTH_BEGIN);
  const dVc = depth('kit-vc-depth', ANIM_FNS, ANIM_DEPTH_BEGIN);
  return { mats: [wall, roof, plainM, vcM], dmats: [dWall, dRoof, dPlain, dVc] };
}

// ---- kinds ----------------------------------------------------------------------------------------
function KD(name, emoji, cat, placeable, w, d, o) {
  o = o || {};
  return { name, emoji, cat, placeable, w, d, seat: o.seat || 'ground', collide: o.collide !== false, linear: !!o.linear, wealthRange: o.wr || [0, 1] };
}
const KINDS = {
  cottage: KD('Cottage', '🛖', 'home', true, [6, 9], [4.5, 6.5], { wr: [0, 0.4] }),
  longhouse: KD('Longhouse', '🏚', 'home', true, [12, 20], [5, 7], { wr: [0, 0.35] }),
  timberhouse: KD('Timber-framed house', '🏠', 'home', true, [6, 10], [6, 9], { wr: [0.25, 0.85] }),
  stonehouse: KD('Stone house', '🏡', 'home', true, [7, 11], [6, 9], { wr: [0.4, 1] }),
  townhouse: KD('Townhouse', '🏘', 'home', true, [5, 8], [8, 12], { wr: [0.6, 1] }),
  shop: KD('Shop', '🏪', 'home', true, [5, 9], [7, 10], { wr: [0.35, 1] }),
  tavern: KD('Tavern', '🍺', 'home', true, [10, 16], [8, 14], { wr: [0.3, 1] }),
  smithy: KD('Smithy', '⚒', 'home', true, [7, 11], [6, 9], { wr: [0.2, 0.8] }),
  farmhouse: KD('Farmhouse', '🌾', 'farm', true, [9, 14], [6, 9], { wr: [0.2, 0.85] }),
  barn: KD('Barn', '🐄', 'farm', true, [14, 24], [8, 12], { wr: [0.1, 0.9] }),
  granary: KD('Granary', '🌽', 'farm', true, [4, 6], [3.5, 5], { wr: [0.2, 0.9] }),
  stable: KD('Stable', '🐎', 'farm', true, [10, 16], [5, 7], { wr: [0.2, 0.9] }),
  shed: KD('Outbuilding', '🛖', 'farm', true, [3, 6], [2.5, 4.6], { wr: [0, 1] }),
  well: KD('Well', '🪣', 'civic', true, [3, 3.4], [3, 3.4]),
  marketcross: KD('Market cross', '✝', 'civic', true, [3.4, 4.2], [3.4, 4.2]),
  markethall: KD('Market hall', '🏬', 'civic', true, [10, 18], [7, 10], { wr: [0.45, 1] }),
  stall: KD('Market stall', '🧺', 'civic', true, [2.6, 4], [2, 3], { collide: false }),
  chapel: KD('Chapel', '🔔', 'civic', true, [7, 10], [12, 18]),
  church: KD('Church', '⛪', 'civic', true, [12, 18], [26, 40]),
  cathedral: KD('Cathedral', '🛐', 'civic', true, [26, 40], [60, 90], { wr: [0.6, 1] }),
  hall: KD('Guildhall', '🏛', 'civic', true, [10, 16], [16, 26], { wr: [0.5, 1] }),
  shrine: KD('Wayside shrine', '🕯', 'civic', true, [1.6, 2.4], [1.6, 2.4], { collide: false }),
  windmill: KD('Windmill', '🌬', 'mill', true, [7, 9], [7, 9]),
  watermill: KD('Watermill', '💧', 'mill', true, [10, 14], [8, 11]),
  keep: KD('Keep', '🏰', 'castle', true, [14, 22], [14, 22]),
  motte: KD('Motte & tower', '⛰', 'castle', true, [30, 44], [30, 44]),
  wall: KD('Curtain wall', '🧱', 'castle', false, [4, 36], [2.4, 2.4], { linear: true }),
  tower: KD('Wall tower', '🗼', 'castle', true, [7, 9], [7, 9]),
  gatehouse: KD('Gatehouse', '🚪', 'castle', false, [18, 18], [12, 12]),
  postern: KD('Postern gate', '🚪', 'castle', false, [6, 6], [3, 3]),
  palisade: KD('Palisade', '🪵', 'castle', false, [4, 36], [0.5, 0.5], { linear: true }),
  palisadegate: KD('Palisade gate', '🚧', 'castle', false, [6, 10], [4, 5]),
  watchtower: KD('Watchtower', '🔭', 'castle', true, [3.5, 4.5], [3.5, 4.5]),
  cloister: KD('Cloister', '⛲', 'monastery', false, [28, 40], [28, 40]),
  range: KD('Monastic range', '🏛', 'monastery', false, [20, 40], [8, 10]),
  pier: KD('Pier', '⚓', 'harbour', false, [3, 5], [3, 6.5], { seat: 'water', collide: false, linear: true }),
  quay: KD('Quay', '⚓', 'harbour', false, [6, 30], [4, 8], { seat: 'water', collide: false, linear: true }),
  fishhut: KD("Fisher's hut", '🐟', 'harbour', false, [4, 6], [3.5, 5], { wr: [0, 0.5] }),
  boathouse: KD('Boathouse', '🛶', 'harbour', false, [6, 9], [10, 16]),
  storehouse: KD('Storehouse', '📦', 'harbour', false, [8, 12], [8, 12], { wr: [0.45, 1] }),
  boat: KD('Boat', '⛵', 'harbour', false, [1.4, 7], [4, 24], { seat: 'water', collide: false }),
  crane: KD('Harbour crane', '🏗', 'harbour', false, [5, 7], [5, 7], { wr: [0.6, 1] }),
  bridge: KD('Stone bridge', '🌉', 'misc', false, [8, 60], [4, 8], { seat: 'given', collide: false, linear: true }),
  pond: KD('Pond', '💧', 'misc', false, [6, 20], [6, 16], { collide: false }),
  tent: KD('Tent', '⛺', 'misc', true, [4, 6], [4, 6]),
  beacontower: KD('Beacon tower', '🔥', 'misc', true, [6, 8], [6, 8])
};
const CATALOGUE = ['cottage', 'longhouse', 'timberhouse', 'stonehouse', 'townhouse', 'shop', 'tavern', 'smithy', 'farmhouse', 'barn', 'granary', 'stable', 'shed',
  'well', 'marketcross', 'markethall', 'stall', 'chapel', 'church', 'cathedral', 'hall', 'windmill', 'watermill', 'keep', 'motte', 'tower', 'watchtower',
  'tent', 'shrine', 'beacontower'];
const TRADES = ['baker', 'butcher', 'cooper', 'weaver', 'cobbler', 'potter', 'smith'];
const BOAT_H = [1, 7, 18];

// ---- materials by kind / tier / region -----------------------------------------------------------
function matCode(v, names) { if (typeof v === 'number') return v | 0; const i = names.indexOf(v); return i < 0 ? null : i; }
function defaultMat(kind, wl, reg, r) {
  const t = tierOf(wl);
  let wall, roof;
  const pRoof = () => pickW(r(), reg === 2 ? [[RS.thatch, 0.5], [RS.turf, 0.5]] : reg === 3 ? [[RS.thatch, 1]] : [[RS.thatch, 0.92], [RS.turf, 0.08]]);
  const mRoof = () => pickW(r(), [[[RS.tile, 0.45], [RS.thatch, 0.4], [RS.shingle, 0.15]], [[RS.stone, 0.6], [RS.thatch, 0.3], [RS.tile, 0.1]],
    [[RS.slate, 0.6], [RS.thatch, 0.3], [RS.shingle, 0.1]], [[RS.thatch, 0.8], [RS.tile, 0.2]], [[RS.tile, 0.8], [RS.shingle, 0.2]]][reg]);
  const rRoof = () => pickW(r(), [[[RS.tile, 0.9], [RS.slate, 0.1]], [[RS.stone, 0.9], [RS.tile, 0.1]], [[RS.slate, 1]], [[RS.tile, 0.6], [RS.thatch, 0.4]], [[RS.tile, 0.8], [RS.slate, 0.2]]][reg]);
  const tierRoof = () => t === 0 ? pRoof() : t === 1 ? mRoof() : rRoof();
  const pWall = () => pickW(r(), [[[WS.wattle, 0.6], [WS.plank, 0.25], [WS.log, 0.15]], [[WS.rubble, 0.5], [WS.wattle, 0.5]], [[WS.rubble, 0.5], [WS.log, 0.3], [WS.wattle, 0.2]],
    [[WS.wattle, 0.8], [WS.plank, 0.2]], [[WS.wattle, 0.5], [WS.plank, 0.5]]][reg]);
  const mWall = () => pickW(r(), [[[WS.timber, 0.85], [WS.rubble, 0.15]], [[WS.rubble, 0.7], [WS.ashlar, 0.2], [WS.timber, 0.1]], [[WS.rubble, 0.85], [WS.timber, 0.15]],
    [[WS.timber, 0.5], [WS.render, 0.5]], [[WS.render, 0.5], [WS.timber, 0.3], [WS.ashlar, 0.2]]][reg]);
  const rWall = () => pickW(r(), [[[WS.timber, 0.7], [WS.ashlar, 0.15], [WS.render, 0.15]], [[WS.ashlar, 0.85], [WS.timber, 0.15]], [[WS.ashlar, 0.5], [WS.rubble, 0.4], [WS.render, 0.1]],
    [[WS.render, 0.5], [WS.timber, 0.5]], [[WS.render, 0.5], [WS.ashlar, 0.5]]][reg]);
  switch (kind) {
    case 'cottage': case 'longhouse': wall = kind === 'longhouse' && r() < 0.4 ? WS.log : pWall(); roof = pRoof(); break;
    case 'fishhut': wall = WS.plank; roof = pRoof(); break;
    case 'shed':
      wall = pickW(r(), reg === 1 || reg === 2 ? [[WS.rubble, 0.45], [WS.plank, 0.35], [WS.wattle, 0.2]] : [[WS.plank, 0.45], [WS.wattle, 0.35], [WS.rubble, 0.2]]);
      roof = t === 0 || r() < 0.35 ? (reg === 2 && r() < 0.5 ? RS.turf : RS.thatch) : pickW(r(), reg === 2 ? [[RS.slate, 0.7], [RS.shingle, 0.3]] : reg === 1 ? [[RS.stone, 0.6], [RS.tile, 0.4]] : [[RS.tile, 0.55], [RS.shingle, 0.45]]);
      break;
    case 'timberhouse': case 'shop': case 'tavern': wall = t === 2 && (reg === 3 || reg === 4) && r() < 0.35 ? WS.render : WS.timber; roof = tierRoof(); break;
    case 'stonehouse': wall = reg === 4 && t === 2 ? WS.ashlar : WS.rubble; roof = t === 0 ? pRoof() : pickW(r(), reg === 1 ? [[RS.stone, 0.8], [RS.tile, 0.2]] : [[RS.slate, 0.5], [RS.stone, 0.25], [RS.tile, 0.25]]); break;
    case 'townhouse': wall = reg === 4 ? (r() < 0.5 ? WS.render : WS.ashlar) : (r() < 0.65 ? WS.timber : WS.render); roof = reg === 2 ? RS.slate : RS.tile; break;
    case 'smithy': wall = WS.rubble; roof = pickW(r(), [[RS.tile, 0.5], [RS.shingle, 0.3], [RS.thatch, 0.2]]); break;
    case 'farmhouse': wall = t === 0 ? pWall() : reg === 1 || reg === 2 ? WS.rubble : t === 2 ? rWall() : mWall(); roof = tierRoof(); break;
    case 'barn': case 'granary': case 'stable': case 'boathouse': wall = t === 2 && kind !== 'granary' ? WS.rubble : WS.plank; roof = t === 0 || r() < 0.5 ? RS.thatch : kind === 'boathouse' ? RS.shingle : RS.tile; break;
    case 'storehouse': wall = t === 2 && r() < 0.5 ? WS.ashlar : WS.timber; roof = t === 2 ? RS.slate : RS.tile; break;
    case 'watermill': wall = reg === 1 || reg === 2 || r() < 0.4 ? WS.rubble : WS.timber; roof = tierRoof(); break;
    case 'windmill': wall = WS.plank; roof = RS.shingle; break;
    case 'markethall': wall = WS.timber; roof = reg === 2 ? RS.slate : RS.tile; break;
    case 'chapel': case 'church': case 'cathedral': case 'hall': case 'range': case 'cloister': case 'shrine':
      wall = kind === 'range' ? (t === 0 ? WS.rubble : WS.ashlar) : kind === 'shrine' ? WS.rubble : WS.church;
      roof = t === 0 ? (kind === 'chapel' ? RS.thatch : RS.stone) : t === 1 ? (reg === 2 ? RS.slate : reg === 1 ? RS.stone : RS.tile) : (kind === 'cathedral' || kind === 'hall' ? (r() < 0.5 ? RS.lead : RS.slate) : RS.slate); break;
    case 'keep': case 'wall': case 'tower': case 'gatehouse': case 'postern': case 'beacontower': wall = WS.castle; roof = RS.slate; break;
    case 'watchtower': case 'motte': case 'palisade': case 'palisadegate': wall = WS.log; roof = t === 0 ? RS.thatch : RS.shingle; break;
    case 'crane': case 'pier': case 'quay': wall = WS.ashlar; roof = RS.shingle; break;
    default: wall = t === 0 ? pWall() : t === 1 ? mWall() : rWall(); roof = tierRoof();
  }
  return { wall, roof };
}
function stoneColFor(reg, r) { return lin(pick(reg === 1 ? PAL.rubbleHoney : reg === 2 ? PAL.rubbleGrey : PAL.rubble, r)); }
function wallColFor(st, tier, reg, r) {
  switch (st) {
    case WS.wattle: case WS.timber: return lin(pick(PAL.daub[tier], r));
    case WS.render: return lin(pick(reg === 4 ? PAL.hanseRender : PAL.daub[Math.max(1, tier)], r));
    case WS.rubble: return stoneColFor(reg, r);
    case WS.ashlar: return lin(pick(reg === 1 ? PAL.ashlarHoney : reg === 4 ? PAL.brick : PAL.ashlar[tier], r));
    case WS.plank: return lin(pick(PAL.plank[tier], r));
    case WS.log: return lin(pick(PAL.log, r));
    case WS.castle: return lin(pick(reg === 1 ? PAL.ashlarHoney : PAL.castle, r));
    case WS.church: return lin(pick(reg === 1 ? PAL.ashlarHoney : reg === 4 ? PAL.brick : PAL.ashlar[2], r));
  }
  return lin(0xc0b090);
}
function roofColFor(rs, tier, reg, age, r) {
  switch (rs) {
    case RS.thatch: return lin(pick(age > 0.5 ? PAL.thatchOld : reg === 3 ? PAL.reed : PAL.thatch, r));
    case RS.tile: return lin(pick(PAL.tile[tier], r));
    case RS.slate: return lin(pick(PAL.slate[tier], r));
    case RS.shingle: return lin(pick(PAL.shingle, r));
    case RS.lead: return lin(pick(PAL.lead, r));
    case RS.turf: return lin(pick(PAL.turf, r));
    case RS.stone: return lin(pick(PAL.stone, r));
  }
  return lin(0x8a6a4a);
}
function look(rec) {
  const r = D.rng(hash32(rec.seed, 0x51ed));
  const wl = rec.wealth, tier = tierOf(wl), reg = (rec.region | 0) % 5;
  let ws = rec.mat ? matCode(rec.mat.wall, WALL_NAMES) : null, rs = rec.mat ? matCode(rec.mat.roof, ROOF_NAMES) : null;
  if (ws === null || rs === null) { const m = defaultMat(rec.kind, wl, reg, r); if (ws === null) ws = m.wall; if (rs === null) rs = m.roof; }
  const L = { r, wl, tier, reg, ws, rs, age: rec.age || 0 };
  const j = 0.93 + r() * 0.14;
  L.wc = jit(wallColFor(ws, tier, reg, r()), j);
  // dated records start from fresh straw (the shader silvers it with the years); r() is drawn either way
  L.rc = jit(roofColFor(rs, tier, reg, rec.year > 0 ? 0 : L.age, r()), 0.94 + r() * 0.12);
  L.stoneC = jit(stoneColFor(reg, r()), 0.95 + r() * 0.1);
  L.tone = wl > 0.66 ? (r() < 0.5 ? 3 : 2) : wl < 0.3 ? (r() < 0.6 ? 4 : 1) : (r() < 0.5 ? 0 : 1);
  L.tc = lin(PAL.timber[L.tone]);
  const reg1 = reg === 1 ? 3 : reg === 3 ? -2 : reg === 4 ? 3 : 0;
  L.pitch = (rs === RS.thatch ? 50 + r() * 5 : rs === RS.tile ? 45 + r() * 7 : rs === RS.slate ? (reg === 2 ? 44 + r() * 2 : 42 + r() * 6) :
    rs === RS.shingle ? 45 + r() * 5 : rs === RS.stone ? 50 + r() * 6 : rs === RS.lead ? 22 + r() * 6 : 38 + r() * 4) + (rs === RS.thatch || rs === RS.lead ? 0 : reg1);
  const hr = r();
  L.hc = rs === RS.turf || rs === RS.lead ? 0 : reg === 0 && (rs === RS.tile || rs === RS.thatch) && hr < 0.6 ? 0.35 :
    reg === 3 && rs === RS.thatch && hr < 0.5 ? 0.4 : rs === RS.thatch && hr < 0.35 ? 0.35 : tier === 2 && rs === RS.tile && hr < 0.15 ? 1 : 0;
  L.thatch = rs === RS.thatch;
  L.cloth = lin(pick(PAL.cloth, r()));
  L.her = lin(pick(PAL.heraldry, r()));
  return L;
}

// ---- design ----------------------------------------------------------------------------------------
function kindSeed(kind, x, z) { return hash32(D.hashStr(kind), hash32(Math.round(x * 16) | 0, Math.round(z * 16) | 0)); }
function defFloors(kind, wl, dens, r) {
  const d5 = dens > 0.6 ? 0.5 : 0;
  switch (kind) {
    case 'timberhouse': return wl < 0.25 ? 1 : wl < 0.5 ? (r() < 0.5 ? 1 : 1.5) : wl < 0.75 ? 2 + (r() < 0.3 ? 0.5 : 0) + d5 : 2 + (r() < 0.5 ? 1 : 0.5);
    case 'stonehouse': return wl < 0.5 ? (r() < 0.5 ? 1 : 1.5) : 2 + (r() < 0.3 ? 0.5 : 0);
    case 'townhouse': return 3 + (wl > 0.8 || r() < 0.35 ? 1 : 0);
    case 'shop': return 2 + (wl > 0.65 && r() < 0.5 ? 1 : 0);
    case 'tavern': return 2 + (wl > 0.55 && r() < 0.55 ? 1 : 0);
    case 'farmhouse': return wl < 0.35 ? 1.5 : 2;
    case 'storehouse': return 3;
    case 'watermill': case 'hall': case 'range': return 2;
    default: return 1;
  }
}
function design(kind, x, z, rot, opts) {
  opts = opts || {};
  const K = KINDS[kind] || KINDS.cottage;
  const seed = opts.seed !== undefined ? (opts.seed >>> 0) : kindSeed(kind, x, z);
  const r = D.rng(hash32(seed, 0xde51));
  const wealth = clamp(opts.wealth !== undefined ? +opts.wealth : (K.wealthRange[0] + K.wealthRange[1]) / 2, 0, 1);
  const region = clamp(opts.region | 0, 0, 4);
  const density = clamp(opts.density !== undefined ? +opts.density : 0.5, 0, 1);
  let w = opts.w !== undefined ? +opts.w : lerp(K.w[0], K.w[1], r());
  let d = opts.d !== undefined ? +opts.d : lerp(K.d[0], K.d[1], r());
  let vr = opts.var !== undefined ? opts.var | 0 : 0;
  if (opts.var === undefined) {
    if (kind === 'windmill') vr = wealth > 0.6 && r() < 0.6 ? 1 : 0;
    else if (kind === 'keep') vr = wealth > 0.7 ? 1 : 0;
    else if (kind === 'tower') vr = wealth > 0.55 ? 1 : 0;
    else if (kind === 'church' || kind === 'chapel' || kind === 'cathedral') vr = Math.floor(r() * 4) & 3;
    else if (kind === 'boat') vr = w > 5 ? 2 : w > 2.2 ? 1 : 0;
  }
  if (kind === 'boat' && opts.w === undefined) { w = [1.6, 2.7, 6.5][vr] * (0.92 + r() * 0.16); if (opts.d === undefined) d = [4.4, 8, 20][vr] * (0.92 + r() * 0.16); }
  if (kind === 'motte' || kind === 'tower' || kind === 'watchtower' || kind === 'windmill' || kind === 'beacontower') { if (opts.d === undefined) d = w; }
  let floors = opts.floors !== undefined ? Math.max(1, Math.round(+opts.floors * 2) / 2) : defFloors(kind, wealth, density, r);
  let h = opts.h;
  if (h === undefined) {
    switch (kind) {
      case 'motte': h = 8 + r() * 4; break;
      case 'wall': h = 6.5 + 3 * wealth; break;
      case 'palisade': case 'palisadegate': h = 3.2 + 1.2 * wealth; break;
      case 'tower': h = 11.5 + 3 * wealth; break;
      case 'keep': h = 16 + 8 * wealth; break;
      case 'gatehouse': case 'postern': h = 6.5 + 3 * wealth; break;
      case 'watchtower': h = 8 + r() * 2; break;
      case 'windmill': h = 20 + r() * 4; break;
      case 'church': h = 14 + r() * 6; break;
      case 'boat': h = BOAT_H[vr] * (0.9 + r() * 0.2); break;
      case 'beacontower': h = 10 + r() * 2; break;
      case 'crane': h = w * 1.4; break;
      default: h = floors * 2.6 + 0.2;
    }
  }
  const gable = opts.gable || (kind === 'townhouse' || kind === 'storehouse' ? 'street' : kind === 'timberhouse' && d > w * 1.15 && r() < 0.5 ? 'street' : 'side');
  const party = (opts.party | 0) & 7;
  const jetty = opts.jetty !== undefined ? (opts.jetty ? 1 : 0) :
    (kind === 'townhouse' || kind === 'tavern' ? 1 : (kind === 'timberhouse' || kind === 'shop') && floors >= 2 && r() < 0.7 ? 1 : 0);
  const trade = opts.trade || (kind === 'shop' ? TRADES[Math.floor(r() * TRADES.length)] : kind === 'smithy' ? 'smith' : 'none');
  const water = opts.water === -1 ? -1 : 1;
  const age = clamp(opts.age !== undefined ? +opts.age : r() * 0.8, 0, 1);
  const dm = defaultMat(kind, wealth, region, r);
  const mat = { wall: opts.mat && opts.mat.wall != null ? matCode(opts.mat.wall, WALL_NAMES) : dm.wall, roof: opts.mat && opts.mat.roof != null ? matCode(opts.mat.roof, ROOF_NAMES) : dm.roof };
  if (mat.wall === null) mat.wall = dm.wall; if (mat.roof === null) mat.roof = dm.roof;
  const out = { kind: KINDS[kind] || kind === 'worksite' ? kind : 'cottage', x, z, rot: rot || 0, w, d, h, floors, wealth, age, seed, var: vr, region, gable, party, jetty, trade, water, mat };
  // Living History (only present when given, so undated records keep exactly their old fields)
  if (opts.year > 0) out.year = +opts.year;
  if (opts.gw) out.gw = opts.gw;
  if (kind === 'worksite') { if (opts.target) out.target = opts.target; if (opts.site) out.site = opts.site; }
  return out;
}

// ---- part builder --------------------------------------------------------------------------------------
// part stride: gi, lx, ly, lz, sx, sy, sz, ry, rx, rz, r, g, b, style, lit, vo(glow), fh, flags, delay, p0, p1
const PSTR = 21;
const NOOPT = {};
function PB(rec) {
  this.a = []; this.smoke = []; this.lights = []; this.rec = rec; this.dl = 0; this.tone = 0;
  const y = rec.y !== undefined ? rec.y : 0, y0 = rec.y0 !== undefined ? rec.y0 : y - 1.5;
  this.base = Math.max(0.3, y - y0);
}
PB.prototype.add = function (g, lx, ly, lz, sx, sy, sz, ry, col, st, o) {
  o = o || NOOPT;
  const gi = GI[g];
  if (gi === undefined) throw new Error('kit: unknown part ' + g);
  const m = GEO_LIST[gi].mat;
  let stc = st || 0;
  if (m === MAT.WALL) stc = Math.floor(stc) + this.tone * 0.1 + 0.02;
  const vo = o.vo !== undefined ? o.vo : m === MAT.WALL ? (ly < 0 ? -ly : 0) : (o.glow || 0);
  this.a.push(gi, lx, ly, lz, Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01), ry || 0, o.rx || 0, o.rz || 0,
    col[0], col[1], col[2], stc, o.lit || 0, vo, o.fh || 3, o.fl || 0, o.dl !== undefined ? o.dl : this.dl, o.p0 || 0, o.p1 || 0);
};
// wall body; y0 === null → from the foundation (plinth) up to h above ground
PB.prototype.body = function (lx, lz, w, d, y0, h, st, col, o) {
  o = o || NOOPT;
  if (y0 === null) this.add('body', lx, -this.base, lz, w, h + this.base, d, o.ry || 0, col, st, o);
  else this.add('body', lx, y0, lz, w, h, d, o.ry || 0, col, st, o);
};
PB.prototype.box = function (lx, ly, lz, sx, sy, sz, col, st, o) { this.add('box', lx, ly, lz, sx, sy, sz, (o && o.ry) || 0, col, st || 0, o); };
PB.prototype.post = function (lx, ly, lz, dia, h, col, o) { this.add('cyl8', lx, ly, lz, dia, h, dia, 0, col, 0, o); };
PB.prototype.vc = function (g, lx, ly, lz, sx, sy, sz, ry, col, o) { this.add(g, lx, ly, lz, sx, sy, sz, ry, col || lin(0xffffff), 0, o); };
PB.prototype.beam = function (a, b, t, col, st, th) { // plain box between two local points (rotations via YXZ)
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz), hz = Math.hypot(dx, dz);
  const ry = hz < 1e-6 ? 0 : Math.atan2(dx, dz), rx = -Math.atan2(dy, hz);
  th = th || t;
  // unit box is centred in x/z with base at y=0: offset so the beam is centred on the segment
  this.add('box', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - th / 2, (a[2] + b[2]) / 2, t, th, L, ry, col, st || 0, { rx });
};
PB.prototype.smokeAt = function (lx, ly, lz, k) { this.smoke.push([lx, ly, lz, k, this.dl + 1.8]); };
PB.prototype.lightAt = function (lx, ly, lz, rad, poolY) { this.lights.push([lx, ly, lz, rad || 7, poolY !== undefined ? poolY : 0]); };
PB.prototype.torch = function (lx, ly, lz, ry) {
  const ph = (this.rec.seed % 628) / 100 + lx * 0.7 + lz * 0.3;
  this.add('torch', lx, ly, lz, 0.55, 0.7, 0.55, ry || 0, lin(0xffffff), 0, { p0: ph, p1: AN.flicker * 16, dl: this.dl + 2 });
  this.lightAt(lx, ly + 0.6, lz, 7.5, 0);
};
PB.prototype.lantern = function (lx, ly, lz, s, poolY) {
  this.add('lantern', lx, ly, lz, s || 0.4, (s || 0.4) * 1.2, s || 0.4, 0, lin(0xffffff), 0, { dl: this.dl + 2 });
  this.lightAt(lx, ly, lz, 6, poolY);
};
PB.prototype.chim = function (lx, lz, y0, y1, k, col, big) {
  const s = big ? 1.25 : 0.85, dl = this.dl + 1.6;
  this.add('body', lx, y0, lz, s, y1 - y0, s, 0, col, WS.rubble, { fl: F.NOWIN, dl, vo: 0 });
  this.box(lx, y1, lz, s + 0.22, 0.16, s + 0.22, lin(COL.soot), 0, { dl: dl + 0.2 });
  if (!big) this.post(lx + s * 0.18, y1 + 0.16, lz, 0.26, 0.42, lin(COL.pot), { dl: dl + 0.3 });
  this.smoke.push([lx, y1 + 0.6, lz, k === undefined ? SMOKE.chimney : k, dl + 1.2]);
};
// crenellated parapet run of length len (merlon variant chosen for ~2.2 m spacing)
PB.prototype.cren = function (lx, ly, lz, len, th, h, ry, col, dl) {
  const g = len < 12 ? 'crenel4' : len < 26 ? 'crenel8' : 'crenel';
  this.add(g, lx, ly, lz, len, h, th, ry, col, WS.castle, { fl: F.NOWIN, dl });
};
// four crenellated sides around a rectangle (w along x, d along z) at height y
PB.prototype.crenRect = function (cx, cz, w, d, y, col, dl, th) {
  th = th || 0.5; const h = 1.6;
  this.cren(cx, y, cz - d / 2 + th / 2, w, th, h, 0, col, dl);
  this.cren(cx, y, cz + d / 2 - th / 2, w, th, h, 0, col, dl);
  this.cren(cx - w / 2 + th / 2, y, cz, d - 2 * th, th, h, HALF_PI, col, dl);
  this.cren(cx + w / 2 - th / 2, y, cz, d - 2 * th, th, h, HALF_PI, col, dl);
};
PB.prototype.banner = function (lx, ly, lz, w, h, ry, col) {
  this.add('banner', lx, ly, lz, w, h, 1, ry || 0, col, 0, { p0: (this.rec.seed % 97) * 0.13, p1: AN.wave * 16 + 3, dl: this.dl + 2.2 });
};

// generic house: storeys, jetties, gables or stepped gables, roof, chimneys, dormers.
// o: {cx, cz, w, d, storeys:[{h, st, col, fl}], jetty, alongZ, rs, rc, pitch, hc, ov, ovE, thatch, stepped,
//     dormers, chim:[{mode:'ridge'|'end'|'gable'|'party', t, side, k}], party, lit, frame, gableSt, gableCol, dl0}
function house(P, L, o) {
  const n = o.storeys.length, jet = o.jetty || 0;
  const partyF = (o.party & 1 ? F.PARTY_L : 0) | (o.party & 2 ? F.PARTY_R : 0) | (o.party & 4 ? F.PARTY_B : 0);
  let y = 0, cz = o.cz, d = o.d;
  const dl0 = o.dl0 || 0;
  for (let i = 0; i < n; i++) {
    const s = o.storeys[i];
    if (i > 0 && jet > 0) {
      d = o.d + jet * i; cz = o.cz - jet * i / 2;
      P.dl = dl0 + i * 0.45;
      P.box(o.cx, y - 0.26, cz - d / 2 + 0.16, o.w - 0.02, 0.28, 0.32, L.tc, 0);
    }
    P.dl = dl0 + i * 0.45;
    // every storey carries FRAMESTAGE (a skeleton when a history reveal sets rec._fe; facade: vKFe); only
    // framed timber keeps the v44 2.2 s skeleton on every animated reveal (FRAMEOLD)
    const fl = (s.fl || 0) | partyF | F.FRAMESTAGE | (o.frame && s.st === WS.timber ? F.FRAMEOLD : 0);
    P.body(o.cx, cz, o.w, d, i === 0 ? null : y, s.h, s.st, s.col, { fl, fh: s.fh || s.h, lit: o.lit });
    y += s.h;
  }
  const eave = y, tanP = Math.tan(o.pitch * PI / 180);
  const span = o.alongZ ? o.w : d, len = o.alongZ ? d : o.w;
  const rise = span / 2 * tanP;
  const ov = o.ov !== undefined ? o.ov : 0.45, ovE = o.stepped ? 0.02 : (o.ovE !== undefined ? o.ovE : 0.3);
  const roofSy = (span / 2 + ov) * tanP;
  const hc = o.stepped ? 0 : (o.hc || 0);
  const dlR = dl0 + n * 0.45 + 0.25;
  const ryR = o.alongZ ? HALF_PI : 0;
  P.dl = dlR + 0.2;
  P.add(o.thatch ? 'roofT' : 'roofG', o.cx, eave - ov * tanP, cz, len + 2 * ovE, roofSy, span + 2 * ov, ryR, o.rc, o.rs, { p0: hc, fl: F.LATE });
  P.dl = dlR;
  const gSt = o.gableSt !== undefined ? o.gableSt : o.storeys[n - 1].st, gCol = o.gableCol || o.storeys[n - 1].col;
  const toLocal = (along, across) => o.alongZ ? [o.cx + across, cz + along] : [o.cx + along, cz + across];
  if (o.stepped) {
    for (const e of [-1, 1]) {
      const [x, z] = toLocal(e * (len / 2 - 0.22), 0);
      P.add('stepG', x, eave, z, 0.44, rise + 0.9, span + 0.12, ryR, gCol, gSt === WS.timber ? WS.render : gSt, { fl: F.NOWIN });
    }
  } else if (hc < 0.99) {
    const hcG = hc > 0 ? clamp(hc * roofSy / rise, 0, 1) : 0;
    P.add('gwall', o.cx, eave, cz, len, rise, span, ryR, gCol, gSt, { p0: hcG, fl: F.GABLE | partyF | F.FRAMESTAGE | (o.frame && gSt === WS.timber ? F.FRAMEOLD : 0), fh: 99, lit: o.lit });
  }
  const ridgeY = eave + rise;
  // chimneys
  const sc = L.stoneC;
  for (const c of o.chim || []) {
    P.dl = dlR;
    if (c.mode === 'ridge') { const [x, z] = toLocal((c.t || 0) * len * 0.3, 0); P.chim(x, z, eave - 0.4, ridgeY + 0.9, c.k, sc); }
    else if (c.mode === 'end') { const [x, z] = toLocal(c.side * (len / 2 - 0.6), 0); P.chim(x, z, eave - 0.4, ridgeY + 0.6 - 0.6 * tanP * 0.2, c.k, sc); }
    else if (c.mode === 'party') {
      const [x, z] = toLocal((c.t || 0) * len * 0.25, c.side * (span / 2 - 0.45));
      P.chim(x, z, eave - 0.3, Math.max(eave + 0.45 * tanP + 1.6, ridgeY - 0.3), c.k, sc);
    } else { // external gable-end stack, broad at the base
      const [x, z] = toLocal(c.side * (len / 2 + 0.04), 0);
      const [xw, zw] = o.alongZ ? [1.6, 1.0] : [1.0, 1.6];
      P.dl = dl0 + 0.2;
      P.body(x, z, xw, zw, null, eave * 0.8, WS.rubble, sc, { fl: F.NOWIN });
      P.dl = dlR;
      P.chim(x, z, eave * 0.8, ridgeY + 0.7, c.k, sc);
    }
  }
  // dormers on the front slope (−z; the −x / +x slope when the ridge runs along z)
  const nd = o.dormers || 0;
  if (nd > 0 && span > 4) {
    const q = 1.0, depth = span / 2 - q, wD = 1.5, hD = 1.25;
    const yTop = eave + q * tanP + hD;
    const face = o.alongZ ? (o.party & 1 ? 1 : -1) : -1; // which slope
    for (let k = 0; k < nd; k++) {
      const t = nd === 1 ? 0 : (k / (nd - 1) - 0.5) * 0.9;
      const along = t * (len - 3);
      const across = face * (span / 2 - q - depth / 2);
      const [x, z] = toLocal(along, across);
      const ryD = o.alongZ ? (face < 0 ? HALF_PI : -HALF_PI) : 0;
      P.dl = dlR + 0.4;
      P.add('body', x, eave, z, wD, yTop - eave, depth, ryD, gCol, gSt, { vo: q * tanP, fh: hD, fl: F.PARTY_L | F.PARTY_R | F.PARTY_B, lit: o.lit });
      const acrossR = face * (span / 2 - q - depth / 2 + 0.12);
      const [xr, zr] = toLocal(along, acrossR);
      const dryR = o.alongZ ? 0 : HALF_PI;
      P.add('roofG', xr, yTop - 0.12, zr, depth + 0.25, 0.9, wD + 0.3, dryR, o.rc, o.rs, { dl: dlR + 0.6, fl: F.LATE });
      P.add('gwall', x, yTop, z, depth, 0.75, wD, dryR, gCol, gSt, { fl: F.GABLE | F.NOWIN, fh: 99, dl: dlR + 0.5 });
    }
  }
  return { eave, ridge: ridgeY, span, len, tanP, cz, d, rise };
}
// lean-to against a wall. dir: 'b' (+z), 'f' (−z), 'r' (+x), 'l' (−x); cx/cz = centre of its footprint,
// along = length along the wall, depth = out from the wall
function leanTo(P, L, o) {
  const alongX = o.dir === 'b' || o.dir === 'f';
  const ry = { f: 0, b: PI, r: -HALF_PI, l: HALF_PI }[o.dir];
  const [bw, bd] = alongX ? [o.along, o.depth] : [o.depth, o.along];
  if (o.posts) {
    const out = { f: [0, -1], b: [0, 1], r: [1, 0], l: [-1, 0] }[o.dir];
    for (const s of [-1, 1]) {
      const px = o.cx + (alongX ? s * (o.along / 2 - 0.2) : out[0] * (o.depth / 2 - 0.2));
      const pz = o.cz + (alongX ? out[1] * (o.depth / 2 - 0.2) : s * (o.along / 2 - 0.2));
      P.post(px, -P.base, pz, 0.26, o.hLow + P.base, L.tc);
    }
  } else P.body(o.cx, o.cz, bw, bd, null, o.hLow, o.st, o.col, { fl: (o.fl || 0), fh: o.hLow, lit: o.lit || 0 });
  P.add('roofL', o.cx, o.hLow - 0.05, o.cz, o.along + 0.2, o.hHigh - o.hLow + 0.1, o.depth + 0.25, ry, o.rc, o.rs, { dl: P.dl + 0.4 });
}

// ---- recipes ------------------------------------------------------------------------------------------
// Every recipe keeps its parts inside |lx| ≤ w/2 + 0.6, |lz| ≤ d/2 + 0.6 (sails / pennants / banners may
// only exceed that above 4 m). Local −z is the street side; for churches local +z points east.
const RC = {};
const TRADE_COL = { baker: 0xd8a030, butcher: 0xb83a2e, cooper: 0x8a5a2a, weaver: 0x2f5a9a, cobbler: 0x3a7a44, potter: 0xb8603a, smith: 0x4a4a4a, none: 0xd8c8a0 };
const GOODS_COL = { baker: 0xc8904a, butcher: 0x9a3a2e, cooper: 0x8a6a40, weaver: 0x6a3a7a, cobbler: 0x5a3a24, potter: 0xa0583a, smith: 0x5a5a5a, none: 0xb0a060 };
function partyFlags(p) { return (p & 1 ? F.PARTY_L : 0) | (p & 2 ? F.PARTY_R : 0) | (p & 4 ? F.PARTY_B : 0); }
function storeyList(n, h0, h, st0, col0, st, col, fl0) {
  const s = [];
  for (let i = 0; i < n; i++) s.push({ h: i === 0 ? h0 : h, st: i === 0 ? st0 : st, col: i === 0 ? col0 : col, fl: i === 0 ? fl0 : 0 });
  return s;
}

RC.cottage = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, party = rec.party | 0;
  const lean = !(party & 3) && W > 6.5 && r() < 0.3;
  const lw = lean ? clamp(W * 0.28, 1.8, 2.6) : 0, side = r() < 0.5 ? -1 : 1;
  const turf = L.rs === RS.turf, h = 2.25 + r() * 0.35;
  const benchSp = 0.45;
  const cx = -side * lw / 2, d = Dd - benchSp;
  const info = house(P, L, {
    cx, cz: benchSp / 2, w: W - lw, d, storeys: [{ h, st: L.ws, col: L.wc, fl: F.DOOR_F | (r() < 0.3 ? F.DOOR_B : 0) }],
    alongZ: false, rs: L.rs, rc: L.rc, pitch: turf ? 40 : 50 + r() * 4, hc: turf ? 0 : (r() < 0.5 ? 0 : 0.4), ov: turf ? 0.3 : 0.5, ovE: 0.3,
    thatch: L.thatch, party, lit: 0.15 + 0.2 * rec.wealth, chim: r() < 0.4 ? [{ mode: 'gable', side: lean ? -side : (r() < 0.5 ? -1 : 1) }] : []
  });
  if (!P.smoke.length) P.smoke.push([cx, info.ridge - 0.15, info.cz, SMOKE.hole, 1.8]);
  if (lean) { P.dl = 0.5; leanTo(P, L, { cx: side * (W / 2 - lw / 2), cz: benchSp / 2 + d * 0.1, along: d * 0.72, depth: lw, dir: side > 0 ? 'r' : 'l', hLow: 1.7, hHigh: Math.min(h + 0.4, 2.6), st: L.ws === WS.wattle ? WS.plank : L.ws, col: L.ws === WS.wattle ? lin(pick(PAL.plank[0], r())) : L.wc, rs: L.rs, rc: L.rc }); }
  P.dl = 2;
  if (r() < 0.55) P.box(cx + (r() - 0.5) * (W - lw) * 0.5, 0, -Dd / 2 + 0.2, 1.4, 0.45, 0.38, L.tc, PS.boards);           // bench by the door
  if (r() < 0.4) P.post(cx - (W - lw) / 2 + 0.45, 0, -Dd / 2 + 0.2, 0.62, 0.85, lin(0x5a4633));                       // water butt
};
RC.fishhut = RC.cottage;
RC.longhouse = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, turf = L.rs === RS.turf;
  const info = house(P, L, {
    cx: 0, cz: 0, w: W, d: Dd, storeys: [{ h: 2.15 + r() * 0.3, st: L.ws, col: L.wc, fl: F.DOOR_F | F.DOOR_B }], alongZ: false, rs: L.rs, rc: L.rc,
    pitch: turf ? 40 : 48 + r() * 5, hc: turf ? 0 : 0.35, ov: 0.45, ovE: 0.25, thatch: L.thatch, party: rec.party, lit: 0.18, chim: []
  });
  P.smoke.push([-W * 0.18, info.ridge - 0.2, 0, SMOKE.hearth, 1.8]);
  P.dl = 2;
  if (r() < 0.6) P.box(W * 0.3, 0, -Dd / 2 - 0.1, 2.2, 1.1, 0.12, L.tc, PS.boards, { ry: 0 });   // byre hurdle
};
function framedHouse(P, rec, L, opt) {
  const r = L.r, W = rec.w, Dd = rec.d, party = rec.party | 0;
  const full = Math.max(1, Math.floor(rec.floors)), half = rec.floors - full >= 0.5;
  const alongZ = rec.gable === 'street';
  const jet = rec.jetty && full > 1 ? (opt.jet || 0.5) : 0;
  const setback = Math.max(0, (opt.front || 0) - jet * (full - 1));
  const stoneGround = opt.stoneGround !== undefined ? opt.stoneGround : full > 1 && rec.wealth > 0.4 && L.ws === WS.timber && r() < 0.3;
  const st0 = opt.st0 !== undefined ? opt.st0 : stoneGround ? WS.rubble : L.ws, col0 = opt.col0 || (stoneGround ? L.stoneC : L.wc);
  const storeys = storeyList(full, opt.h0 || 2.7, opt.h || 2.5, st0, col0, opt.st !== undefined ? opt.st : L.ws, opt.col || L.wc, opt.fl0 !== undefined ? opt.fl0 : F.DOOR_F | (r() < 0.25 ? F.DOOR_B : 0));
  const d = Dd - jet * (full - 1) - setback;
  const cz = (Dd / 2 - d / 2) - 0;           // ground storey centre so the top storey front sits at −Dd/2 + setback
  const nC = opt.chimN !== undefined ? opt.chimN : 1 + (rec.wealth > 0.45 && r() < 0.6 ? 1 : 0);
  const chim = [];
  for (let i = 0; i < nC; i++) {
    const gSide = alongZ ? 1 : (i ? -1 : 1);                       // gable ends: ±x, or only the back when the gable faces the street
    const gOk = alongZ ? (i === 0 && !(party & 4)) : !(party & (gSide < 0 ? 1 : 2));
    if (opt.chimMode === 'party' && (party & 3)) chim.push({ mode: 'party', t: nC === 1 ? 0 : (i ? 0.6 : -0.6), side: party & 1 ? -1 : 1 });
    else if (opt.chimMode === 'gable' && gOk) chim.push({ mode: 'gable', side: gSide });
    else chim.push(r() < 0.5 ? { mode: 'ridge', t: nC === 1 ? (r() - 0.5) : (i ? 0.7 : -0.7) } : { mode: 'end', side: i ? -1 : 1 });
  }
  const lenW = opt.chimMode === 'gable' && !alongZ ? W - 0.5 : W;
  const info = house(P, L, {
    cx: 0, cz, w: lenW, d, storeys, jetty: jet, alongZ, rs: L.rs, rc: L.rc, pitch: (opt.pitch || L.pitch) + (half ? 4 : 0), hc: opt.stepped ? 0 : L.hc,
    ov: party & 3 && alongZ ? 0.05 : 0.45, ovE: party & 3 && !alongZ ? 0.02 : (L.hc > 0 ? 0.2 : 0.3), thatch: L.thatch, stepped: opt.stepped,
    dormers: opt.dormers !== undefined ? opt.dormers : half ? 1 + (r() < 0.5 && W > 7 ? 1 : 0) : 0, chim, party, lit: opt.lit !== undefined ? opt.lit : 0.2 + 0.3 * rec.wealth,
    frame: true, gableSt: opt.gableSt, gableCol: opt.gableCol
  });
  info.front = -Dd / 2 + setback + jet * (full - 1);   // ground-floor front wall
  info.full = full;
  return info;
}
RC.timberhouse = (P, rec, L) => { framedHouse(P, rec, L, {}); };
RC.stonehouse = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, full = Math.max(1, Math.floor(rec.floors));
  const stair = full > 1 && r() < 0.25 && !(rec.party & 3);
  const fl0 = F.DOOR_F | (rec.wealth > 0.6 ? F.QUOINS : 0) | F.SILL;
  const info = framedHouse(P, rec, L, {
    h0: 2.8, h: 2.6, st0: L.ws, col0: L.wc, st: L.ws, fl0, front: stair ? 1.1 : 0, pitch: clamp(L.pitch, 42, 48), chimMode: 'gable', chimN: 1 + (r() < 0.6 ? 1 : 0), stoneGround: false
  });
  if (rec.wealth > 0.6) for (let i = 0; i < P.a.length; i += PSTR) if (P.a[i] === GI.body && P.a[i + 13] < 4) P.a[i + 17] |= F.QUOINS;
  if (stair) {
    P.dl = 1.2;
    const run = 3.0, zc = info.front - 0.55;
    P.add('stairs', -W / 2 + 0.6 + run / 2, 0, zc, 1.0, 2.8, run, HALF_PI, L.stoneC, PS.stone);
    P.box(-W / 2 + 0.6 + run - 0.45, 2.8, info.front - 0.03, 1.0, 2.0, 0.08, lin(0x3a2616), PS.boards);
  }
};
RC.townhouse = (P, rec, L) => {
  const r = L.r, stepped = rec.region === 4 || r() < 0.4;
  const upSt = stepped && L.ws === WS.timber ? WS.render : L.ws;
  const shop = r() < 0.3;
  framedHouse(P, rec, L, {
    jet: 0.45, h0: 2.9, h: 2.55, st0: WS.ashlar, col0: jit(wallColFor(WS.ashlar, 2, rec.region, r()), 0.97), st: upSt, col: upSt !== L.ws ? jit(wallColFor(upSt, 2, rec.region, r()), 1) : L.wc,
    fl0: F.DOOR_F | F.SILL | (shop ? F.SHOP : 0), pitch: 56 + r() * 6, stepped, dormers: r() < 0.5 ? 1 + (r() < 0.5 ? 1 : 0) : 0, chimMode: 'party', chimN: 2, lit: 0.45,
    stoneGround: true
  });
};
RC.shop = (P, rec, L) => {
  const r = L.r, W = rec.w;
  const info = framedHouse(P, rec, L, { front: 0.55, fl0: F.DOOR_F | F.SHOP, lit: 0.35 + 0.2 * rec.wealth });
  const zf = info.front, trade = rec.trade || 'none', jt = info.full > 1 && rec.jetty;
  const yA = jt ? 1.82 : 2.2;                 // under a jetty everything hangs lower
  P.dl = 2;
  if (r() < 0.5) P.add('awning', 0, jt ? 1.75 : 2.0, zf - 0.5, W * 0.8, 0.7, 1.0, 0, L.cloth, PS.stripeX);
  else leanTo(P, L, { cx: 0, cz: zf - 0.45, along: W - 0.4, depth: 0.9, dir: 'f', hLow: jt ? 1.95 : 2.25, hHigh: jt ? 2.35 : 2.7, rs: L.rs, rc: L.rc, posts: true });
  const sx = (r() < 0.5 ? -1 : 1) * (W / 2 - 0.8);
  P.vc('signArm', sx, yA, zf - 0.55, 0.25, jt ? 0.62 : 0.8, 1.1, 0, null, { dl: 2.2 });
  P.vc('signBoard', sx, yA + (jt ? 0.6 : 0.74), zf - 0.8, 0.12, jt ? 0.62 : 0.72, 0.68, 0, lin(TRADE_COL[trade] || TRADE_COL.none), { p0: (rec.seed % 71) * 0.1, p1: AN.swing * 16, dl: 2.4 });
  P.vc('goods', 0, 0.85, zf - 0.22, Math.min(W * 0.6, 3), 0.5, 0.42, 0, lin(GOODS_COL[trade] || GOODS_COL.none));
  if (trade === 'cooper') for (let i = 0; i < 3; i++) P.post(-W / 2 + 0.5 + i * 0.62, 0, zf - 0.3, 0.55, 0.8, lin(0x7a5634));
  if (trade === 'potter') for (let i = 0; i < 3; i++) P.post(W / 2 - 0.5 - i * 0.45, 0, zf - 0.28, 0.36, 0.45, lin(COL.pot));
  if (trade === 'smith') P.vc('anvil', -W / 2 + 0.9, 0, zf - 0.35, 0.6, 0.8, 0.5, 0, null);
  if (trade === 'baker') { P.dl = 1.6; P.smoke.push([W * 0.25, info.ridge + 0.4, info.cz + info.d * 0.25, SMOKE.chimney, 3]); }
};
RC.tavern = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, full = Math.max(2, Math.floor(rec.floors));
  const wing = Dd > 10 && r() < 0.65;
  const dM = wing ? Math.min(Dd * 0.58, 9) : Dd;
  const jet = rec.jetty ? 0.5 : 0, setback = Math.max(0, 0.55 - jet * (full - 1));
  const d = dM - jet * (full - 1) - setback, cz = -Dd / 2 + setback + jet * (full - 1) + d / 2;
  const info = house(P, L, {
    cx: 0, cz, w: W, d, storeys: storeyList(full, 2.8, 2.5, L.ws, L.wc, L.ws, L.wc, F.DOOR_F | F.DBLDOOR), jetty: jet, alongZ: false, rs: L.rs, rc: L.rc,
    pitch: L.pitch, hc: L.hc, ov: 0.45, ovE: L.hc > 0 ? 0.2 : 0.3, thatch: L.thatch, party: rec.party, lit: 0.85, frame: true,
    chim: [{ mode: 'end', side: -1 }, { mode: 'ridge', t: 0.8 }], dormers: W > 11 && r() < 0.5 ? 2 : 0
  });
  if (wing) {
    const side = r() < 0.5 ? -1 : 1, ww = Math.min(W * 0.42, 6.5), wd = Dd - dM + 0.3;
    house(P, L, {
      cx: side * (W / 2 - ww / 2), cz: Dd / 2 - wd / 2, w: ww, d: wd, storeys: storeyList(2, 2.7, 2.4, L.ws, L.wc, L.ws, L.wc, F.DOOR_B), alongZ: true,
      rs: L.rs, rc: L.rc, pitch: L.pitch, hc: 0, ov: 0.4, ovE: 0.2, thatch: L.thatch, party: 0, lit: 0.7, frame: true, chim: [{ mode: 'end', side: 1 }], dl0: 0.6
    });
  }
  const zf = -Dd / 2 + setback + jet * (full - 1);
  P.dl = 2;
  const sx = (r() < 0.5 ? -1 : 1) * (W / 2 - 1.1), yA = jet ? 1.85 : 2.4, aS = jet ? 0.62 : 0.9;
  P.vc('signArm', sx, yA, zf - 0.55, 0.3, aS, 1.1, 0, null, { dl: 2.2 });
  P.vc('signBoard', sx, yA + aS * 0.94, zf - 0.72, 0.14, jet ? 0.7 : 0.95, 0.8, 0, lin(pick([0xb83a2e, 0x2f5a9a, 0x3a7a44, 0xd8a030], r())), { p0: (rec.seed % 53) * 0.1, p1: AN.swing * 16, dl: 2.4 });
  P.vc('aleStake', -sx * 0.5, jet ? 1.75 : 2.9, zf - 0.3, 0.5, jet ? 0.75 : 1.1, 0.6, 0, null);
  for (const s of [-1, 1]) P.lantern(s * 1.45, 2.05, zf - 0.22, 0.34);
  P.box(0, 0, zf - 0.28, W * 0.5, 0.45, 0.36, L.tc, PS.boards);
};
RC.smithy = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, side = r() < 0.5 ? -1 : 1;
  const bw = W * 0.6, lw = W - bw;
  const info = house(P, L, {
    cx: -side * lw / 2, cz: 0, w: bw, d: Dd, storeys: [{ h: 3.0, st: L.ws, col: L.wc, fl: F.DOOR_F | F.SHOP }], alongZ: false, rs: L.rs, rc: L.rc,
    pitch: clamp(L.pitch, 42, 52), hc: 0, ov: 0.4, ovE: 0.3, thatch: L.thatch, party: rec.party & 4, lit: 0.5, chim: []
  });
  P.dl = 0.6;
  const lx = side * (W / 2 - lw / 2);
  leanTo(P, L, { cx: lx, cz: 0, along: Dd - 0.6, depth: lw, dir: side > 0 ? 'r' : 'l', hLow: 2.3, hHigh: 2.95, rs: L.rs, rc: L.rc, posts: true });
  const hx = side * (W / 2 - lw + 0.75);
  P.dl = 1.2;
  P.chim(hx, Dd / 2 - 0.9, -P.base, info.ridge + 1.2, SMOKE.forge, L.stoneC, true);
  P.vc('forgeGlow', hx, 0, Dd / 2 - 2.1, 1.3, 0.95, 1.1, 0, null, { p0: (rec.seed % 31) * 0.2, p1: AN.flicker * 16, dl: 2 });
  P.lightAt(hx, 1.0, Dd / 2 - 2.1, 8, 0);
  P.vc('anvil', lx + side * 0.2, 0, -0.2, 0.6, 0.8, 0.5, side * 0.4, null);
  P.vc('trough', lx, 0, -Dd / 2 + 0.55, 1.4, 0.55, 0.5, 0, null);
};
RC.farmhouse = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, stone = L.ws === WS.rubble || L.ws === WS.ashlar;
  const porch = r() < 0.5;
  const info = framedHouse(P, rec, L, { front: porch ? 0.65 : 0, chimMode: stone ? 'gable' : 'end', chimN: 2, fl0: F.DOOR_F | F.DOOR_B | (stone ? F.SILL : 0), stoneGround: false });
  if (porch) {
    P.dl = 1.1;
    const pz = info.front - 0.5, pw = 2.1, ph = 2.3;
    P.body(0, pz, pw, 1.0, null, ph, L.ws, L.wc, { fl: F.DOOR_F | F.PARTY_L | F.PARTY_R, fh: ph });
    P.add('roofG', 0, ph - 0.1, pz - 0.05, 1.2, 1.1, pw + 0.4, HALF_PI, L.rc, L.rs, { dl: 1.5 });
    P.add('gwall', 0, ph, pz, 1.0, 1.0, pw, HALF_PI, L.wc, L.ws, { fl: F.GABLE | F.NOWIN, fh: 99, dl: 1.4 });
  }
};
RC.barn = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, cat = r() < 0.35;
  const od = cat ? 2.4 : 0, d = Dd - od, h = 4.2 + r() * 0.6;
  const info = house(P, L, {
    cx: 0, cz: -od / 2, w: W, d, storeys: [{ h, st: L.ws, col: L.wc, fl: F.BARNDOOR | F.DOOR_F | F.DOOR_B | F.NOWIN, fh: h }], alongZ: false, rs: L.rs, rc: L.rc,
    pitch: 50 + r() * 5, hc: L.thatch && r() < 0.5 ? 0.35 : 0, ov: 0.5, ovE: 0.35, thatch: L.thatch, party: 0, lit: 0.05, chim: []
  });
  if (cat) {
    P.dl = 0.8;
    const drop = od * info.tanP;
    leanTo(P, L, { cx: 0, cz: Dd / 2 - od / 2, along: W - 1.2, depth: od, dir: 'b', hLow: Math.max(1.8, h - drop), hHigh: h + 0.05, st: L.ws, col: L.wc, rs: L.rs, rc: L.rc, fl: F.NOWIN });
  }
  P.dl = 2;
  if (r() < 0.6) P.box(W / 2 - 1.3, 0, -Dd / 2 + 0.1, 1.8, 0.9, 0.1, L.tc, PS.boards);
};
RC.granary = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, nx = 3, nz = Dd > 4.2 ? 3 : 2;
  const bw = W - 0.3, bd = Dd - 1.2, zc = 0.6;
  P.dl = 0;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) P.add('staddle', -bw / 2 + 0.35 + i * (bw - 0.7) / (nx - 1), 0, zc - bd / 2 + 0.35 + k * (bd - 0.7) / (nz - 1), 0.7, 0.8, 0.7, 0, lin(COL.stone), 0);
  P.dl = 0.5;
  P.body(0, zc, bw, bd, 0.8, 2.3, L.ws, L.wc, { fl: F.DOOR_F | F.NOWIN, fh: 2.3, vo: 0 });
  P.dl = 0.95;
  const tanP = Math.tan(L.pitch * PI / 180), rise = bd / 2 * tanP;
  P.add(L.thatch ? 'roofT' : 'roofG', 0, 3.1 - 0.3 * tanP, zc, bw + 0.4, (bd / 2 + 0.3) * tanP, bd + 0.6, 0, L.rc, L.rs, { dl: 1.2 });
  P.add('gwall', 0, 3.1, zc, bw, rise, bd, 0, L.wc, L.ws, { fl: F.GABLE | F.NOWIN, fh: 99 });
  P.dl = 1.6;
  P.add('stairs', -bw / 2 + 1.0, 0, -Dd / 2 + 0.05, 0.9, 0.62, 1.0, 0, L.tc, PS.boards);
};
RC.stable = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d;
  house(P, L, {
    cx: 0, cz: 0, w: W, d: Dd, storeys: [{ h: 2.8, st: L.ws, col: L.wc, fl: F.STABLE | F.NOWIN }], alongZ: false, rs: L.rs, rc: L.rc,
    pitch: clamp(L.pitch, 42, 52), hc: L.hc, ov: 0.45, ovE: 0.3, thatch: L.thatch, party: 0, lit: 0.1, chim: []
  });
  P.dl = 2;
  P.vc('trough', (r() - 0.5) * W * 0.4, 0, -Dd / 2 - 0.3, 1.7, 0.55, 0.5, 0, null);
};
// back-yard outbuilding: 0 lean-to shed, 1 small gabled workshop / brewhouse, 2 open cart shed, 3 pigsty with pen.
// Local −z faces the house (the yard); the back (+z) sits on the plot's rear line.
RC.shed = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, v = (rec.var | 0) & 3;
  P.dl = 0;
  if (v === 0) {
    leanTo(P, L, { cx: 0, cz: 0, along: W, depth: Dd, dir: 'f', hLow: 1.85 + r() * 0.2, hHigh: 2.6 + r() * 0.3, st: L.ws, col: L.wc, rs: L.rs, rc: L.rc, fl: F.DOOR_F | F.NOWIN });
    P.dl = 1.4;
    if (r() < 0.5) P.box(W / 2 - 0.5, 0, -Dd / 2 - 0.25, 0.8, 0.9, 0.5, L.tc, PS.boards);            // a crate or two by the door
  } else if (v === 1) {
    house(P, L, {
      cx: 0, cz: 0, w: W, d: Dd, storeys: [{ h: 2.1 + r() * 0.3, st: L.ws, col: L.wc, fl: F.DOOR_F | (r() < 0.5 ? F.NOWIN : 0) }], alongZ: W < Dd, rs: L.rs, rc: L.rc,
      pitch: clamp(L.pitch, 42, 55), hc: 0, ov: 0.3, ovE: 0.2, thatch: L.thatch, party: 0, lit: 0.08,
      chim: r() < 0.3 ? [{ mode: 'ridge', t: r() < 0.5 ? -0.8 : 0.8 }] : []
    });
  } else if (v === 2) {
    P.body(0, Dd / 2 - 0.15, W, 0.3, null, 2.9, L.ws, L.wc, { fl: F.NOWIN });                      // back wall
    leanTo(P, L, { cx: 0, cz: 0, along: W, depth: Dd, dir: 'f', hLow: 2.2, hHigh: 3.0, posts: true, rs: L.rs, rc: L.rc });
    P.dl = 1.2;
    P.vc('trough', (r() - 0.5) * W * 0.4, 0, Dd / 2 - 0.9, 1.6, 0.5, 0.5, 0, null);
  } else {
    const hut = Math.min(2.2, Dd * 0.45), pen = Dd - hut, stone = L.stoneC;
    leanTo(P, L, { cx: 0, cz: Dd / 2 - hut / 2, along: W, depth: hut, dir: 'f', hLow: 1.3, hHigh: 1.8, st: WS.rubble, col: stone, rs: L.rs, rc: L.rc, fl: F.NOWIN });
    P.dl = 0.6;
    const zc = -Dd / 2 + pen / 2, th = 0.35, hh = 0.95;
    P.body(0, -Dd / 2 + th / 2, W, th, null, hh, WS.rubble, stone, { fl: F.NOWIN });
    for (const sx of [-1, 1]) P.body(sx * (W / 2 - th / 2), zc, th, pen, null, hh, WS.rubble, stone, { fl: F.NOWIN });
    P.dl = 1.2;
    P.vc('trough', W * 0.2, 0, zc, 1.2, 0.4, 0.45, HALF_PI, null);
  }
};
function wellParts(P, cx, cz, s, L) {
  const stone = L ? L.stoneC : lin(COL.stone);
  P.add('cylW', cx, -Math.min(P.base, 0.6), cz, 2.2 * s, 0.8 * s + Math.min(P.base, 0.6), 2.2 * s, 0, stone, WS.rubble, { fl: F.NOWIN, vo: Math.min(P.base, 0.6) });
  P.add('disc', cx, 0.5 * s, cz, 1.8 * s, 0.06, 1.8 * s, 0, lin(0x24343a), PS.water);
  P.dl = 0.5;
  for (const sx of [-1, 1]) P.post(cx + sx * 1.02 * s, 0.4 * s, cz, 0.2 * s, 2.0 * s, lin(COL.oak));
  P.dl = 0.9;
  P.add('roofG', cx, 2.25 * s, cz, 2.6 * s, 0.85 * s, 2.3 * s, 0, lin(pick(PAL.shingle, 0.3)), RS.shingle);
  P.vc('windlass', cx, 1.1 * s, cz, 1.95 * s, 0.9 * s, 0.6 * s, 0, null, { dl: 1.6 });
}
RC.well = (P, rec, L) => { wellParts(P, 0, 0, clamp(Math.min(rec.w, rec.d) / 3.1, 0.85, 1.1), L); };
RC.marketcross = (P, rec, L) => {
  const W = Math.min(rec.w, rec.d), stone = lin(COL.stoneLight);
  P.add('cyl8', 0, -P.base, 0, W * 0.95, 0.35 + P.base, W * 0.95, 0, stone, PS.stone);
  P.add('cyl8', 0, 0.35, 0, W * 0.72, 0.35, W * 0.72, 0, stone, PS.stone, { dl: 0.3 });
  P.add('cyl8', 0, 0.7, 0, W * 0.5, 0.35, W * 0.5, 0, stone, PS.stone, { dl: 0.6 });
  P.add('cyl8', 0, 1.05, 0, 0.62, 0.5, 0.62, 0, stone, PS.stone, { dl: 0.8 });
  P.add('cyl8', 0, 1.5, 0, 0.42, 3.4, 0.42, 0, stone, PS.stone, { dl: 1.0 });
  P.dl = 1.5;
  if (rec.wealth > 0.6) { P.lantern(0, 4.9, 0, 0.6, 0); P.box(0, 4.85, 0, 0.7, 0.1, 0.7, stone, PS.stone); }
  else P.vc('crossHead', 0, 4.85, 0, 0.9, 1.2, 0.3, 0, null);
};
RC.markethall = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, stoneP = rec.wealth > 0.65;
  const up = 3.0, uh = 2.9;
  P.box(0, -P.base, 0, W - 0.2, P.base + 0.18, Dd - 0.2, lin(COL.flag), PS.stone);
  P.dl = 0.3;
  const nx = Math.max(2, Math.round((W - 1) / 2.8)), nz = Math.max(2, Math.round((Dd - 1) / 2.8));
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    if (i > 0 && i < nx && k > 0 && k < nz) continue;
    const x = -W / 2 + 0.5 + i * (W - 1) / nx, z = -Dd / 2 + 0.5 + k * (Dd - 1) / nz;
    if (stoneP) P.post(x, 0.18, z, 0.5, up - 0.18, lin(COL.stoneLight));
    else P.box(x, 0.18, z, 0.34, up - 0.18, 0.34, L.tc, 0);
  }
  P.dl = 0.8;
  P.body(0, 0, W, Dd, up, uh, WS.timber, L.wc, { fl: F.SILL, fh: uh, lit: 0.3, vo: 0 });
  const tanP = Math.tan(clamp(L.pitch, 45, 52) * PI / 180), ov = 0.45;
  P.add('roofG', 0, up + uh - ov * tanP, 0, W + 0.9, (Dd / 2 + ov) * tanP, Dd + 2 * ov, 0, L.rc, L.rs, { p0: 1, dl: 1.4 });
  const ridge = up + uh + Dd / 2 * tanP;
  P.dl = 1.9;
  P.body(0, 0, 1.6, 1.6, ridge - 0.9, 2.1, WS.timber, L.wc, { fl: F.BELFRY | F.NOWIN, fh: 2.1, vo: 0 });
  P.add('pyrR', 0, ridge + 1.2, 0, 2.0, 1.4, 2.0, 0, lin(pick(PAL.lead, r())), RS.lead, { dl: 2.2 });
  P.vc('bell', 0, ridge + 0.1, 0, 0.7, 0.7, 0.7, 0, null, { dl: 2.3 });
  P.vc('goods', -W * 0.2, 0.18, 0, 2.2, 0.8, 1.0, 0, L.cloth, { dl: 2.4 });
  P.vc('goods', W * 0.22, 0.18, -0.4, 2.2, 0.8, 1.0, 1.2, lin(pick(PAL.cloth, r())), { dl: 2.5 });
};
RC.stall = (P, rec, L) => {
  const W = rec.w, Dd = rec.d;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.post(sx * (W / 2 - 0.12), -P.base * 0.2, sz * (Dd / 2 - 0.12), 0.12, 2.25 + P.base * 0.2, L.tc);
  P.dl = 0.6;
  P.add('tentR', 0, 2.1, 0, W + 0.3, 0.75, Dd + 0.3, 0, L.cloth, PS.stripeX);
  P.box(0, 0, -Dd / 2 + 0.3, W - 0.1, 0.9, 0.55, L.tc, PS.boards, { dl: 1.0 });
  P.vc('goods', 0, 0.9, -Dd / 2 + 0.3, W * 0.85, 0.42, 0.5, 0, lin(pick(PAL.cloth, L.r())), { dl: 1.6 });
};

// ---- churches (local +z = east; west front = local −z) ----
function churchRoof(L, wl) { return { rs: L.rs, rc: L.rc }; }
function buttress(P, x, z, side, h, col) { P.add('buttress', x, -P.base, z, 0.75, h + P.base, 0.8, side > 0 ? -HALF_PI : HALF_PI, col, WS.church, { fl: F.NOWIN, vo: P.base }); }
function towerTop(P, L, cx, cz, s, y, cap, col) {
  if (cap === 1) { P.add('pyrR', cx, y, cz, s + 0.5, s * 0.95, s + 0.5, 0, L.rc, L.rs === RS.thatch ? RS.shingle : L.rs); return y + s * 0.95; }
  if (cap === 2) {
    P.add('spire', cx, y - 0.1, cz, s, s * 2.4, s, 0, L.rs === RS.slate || L.rs === RS.lead ? L.rc : lin(pick(PAL.lead, 0.5)), L.rs === RS.slate ? RS.slate : RS.lead);
    return y + s * 2.4;
  }
  P.crenRect(cx, cz, s, s, y, col, P.dl + 0.3, 0.45);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('spire', cx + sx * (s / 2 - 0.35), y, cz + sz * (s / 2 - 0.35), 0.7, 2.4, 0.7, 0, col, RS.stone, { dl: P.dl + 0.5 });
  if (cap === 3) { P.add('spire', cx, y, cz, s * 0.45, s * 1.5, s * 0.45, 0, lin(pick(PAL.lead, 0.2)), RS.lead, { dl: P.dl + 0.6 }); return y + s * 1.5; }
  P.add('roofG', cx, y - 0.2, cz, s - 1.0, 1.0, s - 1.0, 0, lin(pick(PAL.lead, 0.4)), RS.lead, { p0: 1, dl: P.dl + 0.4 });
  return y + 2.4;
}
RC.chapel = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, col = L.wc;
  const nw = W - 1.5, apse = rec.var === 1 || r() < 0.3;
  const ar = apse ? nw * 0.42 : 0;
  const nl = Dd - ar, ncz = -Dd / 2 + nl / 2, hN = 4.2 + W * 0.22;
  const tanP = Math.tan(52 * PI / 180);
  P.body(0, ncz, nw, nl, null, hN, WS.church, col, { fl: F.DOOR_F, fh: hN, lit: 0.4 });
  P.dl = 0.5;
  P.add(L.thatch ? 'roofT' : 'roofG', 0, hN - 0.4 * tanP, ncz, nl + 0.4, (nw / 2 + 0.4) * tanP, nw + 0.8, HALF_PI, L.rc, L.rs, { dl: 0.9 });
  P.add('gwall', 0, hN, ncz, nl, nw / 2 * tanP, nw, HALF_PI, col, WS.church, { fl: F.GABLE, fh: 99, lit: 0.4 });
  if (apse) {
    P.add('apseW', 0, -P.base, Dd / 2 - ar, ar * 2, hN * 0.85 + P.base, ar * 2, 0, col, WS.church, { lit: 0.4, fh: hN * 0.85 + P.base, vo: P.base });
    P.add('apseR', 0, hN * 0.85, Dd / 2 - ar, ar * 2 + 0.3, ar * 1.1, ar * 2 + 0.3, 0, L.rc, L.rs, { dl: 1.0 });
  }
  const zs = [ncz - nl * 0.3, ncz + nl * 0.3];
  for (const z of zs) for (const s of [-1, 1]) buttress(P, s * (nw / 2 + 0.38), z, s, hN * 0.7, col);
  // bellcote on the west gable
  P.dl = 1.6;
  const rise = nw / 2 * tanP, bz = -Dd / 2 + 0.35, by = hN + rise - 0.5;
  for (const s of [-1, 1]) P.add('body', s * 0.45, by, bz, 0.32, 1.5, 0.45, 0, col, WS.church, { fl: F.NOWIN, vo: 0 });
  P.add('roofG', 0, by + 1.45, bz, 0.8, 0.5, 1.4, 0, L.rc, L.rs, { dl: 1.9 });
  P.vc('bell', 0, by + 0.45, bz, 0.5, 0.55, 0.5, 0, null, { dl: 2.0 });
};
RC.church = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, col = L.wc, cap = rec.var & 3;
  const pw = 2.6, xl = -W / 2 + pw, xr = W / 2 - 0.8, nw = xr - xl, ncx = (xl + xr) / 2;
  const tw = clamp(nw * 0.62, 5, 7.5), th = Math.max(rec.h || 16, 12);
  const apse = r() < 0.3;
  const cl = Dd * 0.26, cw = nw * 0.72;
  const nz0 = -Dd / 2 + tw - 0.2, nz1 = Dd / 2 - cl + 0.1, nl = nz1 - nz0, ncz = (nz0 + nz1) / 2;
  const hN = 6 + W * 0.2, hC = hN * 0.84;
  const tanP = Math.tan(clamp(L.pitch, 48, 56) * PI / 180);
  // nave
  P.body(ncx, ncz, nw, nl, null, hN, WS.church, col, { fh: hN, lit: 0.45 });
  P.dl = 0.55;
  P.add(L.thatch ? 'roofT' : 'roofG', ncx, hN - 0.4 * tanP, ncz, nl + 0.3, (nw / 2 + 0.4) * tanP, nw + 0.8, HALF_PI, L.rc, L.rs, { dl: 0.95 });
  P.add('gwall', ncx, hN, ncz, nl, nw / 2 * tanP, nw, HALF_PI, col, WS.church, { fl: F.GABLE, fh: 99, lit: 0.45 });
  // chancel (+ apse)
  P.dl = 0.3;
  const cl2 = apse ? cl - cw * 0.5 : cl;
  const ccz = Dd / 2 - cl + cl2 / 2;
  P.body(ncx, ccz, cw, cl2, null, hC, WS.church, col, { fh: hC, lit: 0.5 });
  P.dl = 0.8;
  P.add('roofG', ncx, hC - 0.35 * tanP, ccz + 0.15, cl2 + 0.3, (cw / 2 + 0.35) * tanP, cw + 0.7, HALF_PI, L.rc, L.rs, { dl: 1.1 });
  P.add('gwall', ncx, hC, ccz, cl2, cw / 2 * tanP, cw, HALF_PI, col, WS.church, { fl: F.GABLE, fh: 99, lit: 0.5 });
  if (apse) {
    P.dl = 0.5;
    P.add('apseW', ncx, -P.base, Dd / 2 - cw / 2, cw, hC + P.base, cw, 0, col, WS.church, { fh: hC + P.base, vo: P.base, lit: 0.5 });
    P.add('apseR', ncx, hC, Dd / 2 - cw / 2, cw + 0.3, cw * 0.6, cw + 0.3, 0, L.rc, L.rs, { dl: 1.1 });
  }
  // west tower
  P.dl = 0;
  const tz = -Dd / 2 + tw / 2, lower = th * 0.72;
  P.body(ncx, tz, tw, tw, null, lower, WS.church, col, { fl: F.DOOR_F, fh: lower, lit: 0.3 });
  P.dl = 0.9;
  P.body(ncx, tz, tw - 0.3, tw - 0.3, lower, th - lower, WS.church, col, { fl: F.BELFRY | F.NOWIN, fh: th - lower, vo: 0 });
  P.dl = 1.3;
  towerTop(P, L, ncx, tz, tw - 0.3, th, cap, col);
  // south porch (local −x)
  P.dl = 0.6;
  const pz = nz0 + Math.min(4.5, nl * 0.3);
  P.add('body', xl - pw / 2 + 0.05, -P.base, pz, 3.0, 3.3 + P.base, pw + 0.1, HALF_PI, col, WS.church, { fl: F.DOOR_F | F.PARTY_B, fh: 3.3 + P.base, vo: P.base });
  P.add('roofG', xl - pw / 2 - 0.1, 3.3 - 0.3 * tanP, pz, pw + 0.4, (1.5 + 0.3) * tanP, 3.6, 0, L.rc, L.rs, { dl: 1.0 });
  P.add('gwall', xl - pw / 2 + 0.05, 3.3, pz, pw + 0.1, 1.5 * tanP, 3.0, 0, col, WS.church, { fl: F.GABLE | F.NOWIN, fh: 99, dl: 0.9 });
  // buttresses
  const nb = Math.max(2, Math.round(nl / 5));
  for (let i = 1; i <= nb; i++) {
    const z = nz0 + nl * i / (nb + 1);
    buttress(P, xr + 0.4, z, 1, hN * 0.72, col);
    if (Math.abs(z - pz) > 2.2) buttress(P, xl - 0.4, z, -1, hN * 0.72, col);
  }
};
RC.cathedral = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, col = L.wc, rich = rec.wealth > 0.7;
  const nw = W * 0.32, aw = W * 0.14, outer = nw / 2 + aw;
  const hN = clamp(nw * 1.7, 9, 28), hA = hN * 0.48;
  const ta = nw * 1.15, tz = -Dd / 2 + Dd * 0.6;
  const tanP = Math.tan(clamp(L.pitch, 48, 56) * PI / 180);
  const twS = rich ? Math.min(aw + 2.2, nw * 0.8) : 0;
  const nz0 = -Dd / 2 + (rich ? twS * 0.5 : 0), nz1 = tz - ta / 2;
  const apseR = nw / 2, cz1 = Dd / 2 - apseR;
  // nave (west front carries the rose)
  P.body(0, (nz0 + tz) / 2, nw, tz - nz0, null, hN, WS.church, col, { fl: F.DOOR_F | F.DBLDOOR | F.ROSE, fh: hN * 0.55, lit: 0.6 });
  P.dl = 0.9;
  const naveL = cz1 - nz0;
  P.add('roofG', 0, hN - 0.4 * tanP, (nz0 + cz1) / 2, naveL + 0.3, (nw / 2 + 0.4) * tanP, nw + 0.8, HALF_PI, L.rc, L.rs, { dl: 1.3 });
  P.add('gwall', 0, hN, (nz0 + cz1) / 2, naveL, nw / 2 * tanP, nw, HALF_PI, col, WS.church, { fl: F.GABLE, fh: 99, lit: 0.6 });
  // aisles either side of nave and choir
  P.dl = 0.2;
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[nz0 + (rich ? twS * 0.5 : 0), nz1], [tz + ta / 2, cz1]]) {
      if (z1 - z0 < 2) continue;
      const zc = (z0 + z1) / 2, L2 = z1 - z0;
      P.body(s * (nw / 2 + aw / 2), zc, aw, L2, null, hA, WS.church, col, { fh: hA, lit: 0.5 });
      P.add('roofL', s * (nw / 2 + aw / 2), hA - 0.05, zc, L2 + 0.2, aw * 0.55, aw + 0.3, s > 0 ? -HALF_PI : HALF_PI, L.rc, L.rs, { dl: 0.7 });
      const nb = Math.max(1, Math.round(L2 / 6));
      for (let i = 0; i <= nb; i++) {
        const z = z0 + 0.6 + (L2 - 1.2) * i / nb;
        buttress(P, s * (outer + 0.5), z, s, hA * 1.25, col);
        // flying buttress from the pier head to the clerestory
        P.dl = 1.4;
        P.beam([s * (outer + 0.4), hA * 1.2, z], [s * (nw / 2 + 0.2), hN * 0.86, z], 0.55, col, PS.stone);
        P.dl = 0.2;
      }
    }
  }
  // choir
  P.dl = 0.3;
  P.body(0, (tz + cz1) / 2, nw, cz1 - tz, null, hN * 0.96, WS.church, col, { fh: hN * 0.55, lit: 0.6 });
  P.add('apseW', 0, -P.base, cz1, nw, hN * 0.96 + P.base, nw, 0, col, WS.church, { fh: hN * 0.55, vo: P.base, lit: 0.6 });
  P.add('apseR', 0, hN * 0.96, cz1, nw + 0.4, nw * 0.62, nw + 0.4, 0, L.rc, L.rs, { dl: 1.3 });
  // transept arms, rose windows on their ends
  P.dl = 0.4;
  for (const s of [-1, 1]) {
    const armL = W / 2 - nw / 2;
    P.add('body', s * (nw / 2 + armL / 2), -P.base, tz, ta, hN * 0.94 + P.base, armL, s > 0 ? -HALF_PI : HALF_PI, col, WS.church, { fl: F.ROSE | F.PARTY_B, fh: hN * 0.55, vo: P.base, lit: 0.55 });
    P.add('roofG', s * (nw / 2 + armL / 2) + s * 0.15, hN * 0.94 - 0.4 * tanP, tz, armL + 0.3, (ta / 2 + 0.4) * tanP, ta + 0.8, 0, L.rc, L.rs, { dl: 1.2 });
    P.add('gwall', s * (nw / 2 + armL / 2), hN * 0.94, tz, armL, ta / 2 * tanP, ta, 0, col, WS.church, { fl: F.GABLE, fh: 99, dl: 1.0 });
  }
  // crossing tower
  P.dl = 1.2;
  const cs = nw + 0.8, cth = hN + nw * 1.1;
  P.body(0, tz, cs, cs, hN * 0.8, cth - hN * 0.8, WS.church, col, { fl: F.BELFRY, fh: cth - hN * 0.8, vo: 0, lit: 0.2 });
  P.dl = 1.8;
  towerTop(P, L, 0, tz, cs, cth, rec.wealth > 0.6 ? 2 : 0, col);
  // west towers (rich) or a gabled west front
  if (rich) {
    P.dl = 0.1;
    const wth = hN * 1.45;
    for (const s of [-1, 1]) {
      const x = s * (nw / 2 + twS / 2 - 0.3), z = -Dd / 2 + twS / 2;
      P.body(x, z, twS, twS, null, wth * 0.78, WS.church, col, { fh: wth * 0.26, lit: 0.3 });
      P.dl = 1.0;
      P.body(x, z, twS - 0.4, twS - 0.4, wth * 0.78, wth * 0.22, WS.church, col, { fl: F.BELFRY | F.NOWIN, fh: wth * 0.22, vo: 0 });
      P.dl = 1.6;
      towerTop(P, L, x, z, twS - 0.4, wth, rec.var & 1 ? 2 : 0, col);
      P.dl = 0.1;
    }
  }
};
RC.hall = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, h = 7 + r() * 1.5;
  const setback = 0.6 + 1.6;
  const info = house(P, L, {
    cx: 0, cz: setback / 2, w: W, d: Dd - setback, storeys: [{ h, st: L.ws, col: L.wc, fl: F.SILL | F.QUOINS, fh: h }], alongZ: true, rs: L.rs, rc: L.rc,
    pitch: 50 + r() * 4, hc: 0, ov: 0.45, ovE: 0.3, thatch: false, party: 0, lit: 0.55, chim: [{ mode: 'party', t: 0.3, side: 1 }]
  });
  // porch on the street gable
  P.dl = 0.8;
  const pz = -Dd / 2 + 1.1 + 0.05, pwid = 3.2, ph = 3.6;
  P.body(0, pz, pwid, 2.2, null, ph, L.ws, L.wc, { fl: F.DOOR_F | F.PARTY_B | F.QUOINS, fh: ph });
  P.add('roofG', 0, ph - 0.1, pz, 2.6, 1.3, pwid + 0.4, HALF_PI, L.rc, L.rs, { dl: 1.2 });
  P.add('gwall', 0, ph, pz, 2.2, 1.2, pwid, HALF_PI, L.wc, L.ws, { fl: F.GABLE | F.NOWIN, fh: 99, dl: 1.1 });
  // louvred cupola on the ridge
  P.dl = 1.9;
  P.body(0, info.cz, 1.8, 1.8, info.ridge - 0.8, 2.2, WS.timber, lin(0xd8cfb8), { fl: F.BELFRY | F.NOWIN, fh: 2.2, vo: 0 });
  P.add('pyrR', 0, info.ridge + 1.4, info.cz, 2.3, 1.6, 2.3, 0, lin(pick(PAL.lead, r())), RS.lead, { dl: 2.2 });
  P.banner(0, info.ridge + 5.0, info.cz, 1.4, 1.0, 0, L.her);
  P.post(0, info.ridge + 2.8, info.cz, 0.12, 2.4, lin(COL.iron), { dl: 2.2 });
};
RC.shrine = (P, rec, L) => {
  const s = clamp(Math.min(rec.w, rec.d) / 2, 0.8, 1.2), st = L.stoneC;
  P.add('box', 0, -P.base, 0, 1.6 * s, P.base + 0.25, 1.4 * s, 0, st, PS.stone);
  P.body(0, 0, 1.1 * s, 0.9 * s, 0.25, 1.5 * s, WS.rubble, st, { fl: F.NOWIN, vo: 0 });
  P.box(0, 0.25 + 0.35 * s, -0.46 * s, 0.55 * s, 0.75 * s, 0.05, lin(0x1c1814), 0);
  P.dl = 0.6;
  P.add('roofG', 0, 0.25 + 1.45 * s, 0, 1.4 * s, 0.55 * s, 1.25 * s, 0, lin(pick(PAL.stone, 0.4)), RS.stone);
  P.vc('crossHead', 0, 0.25 + 2.0 * s, 0, 0.45 * s, 0.7 * s, 0.14 * s, 0, null, { dl: 1.2 });
  P.lantern(0, 0.3 + 0.35 * s, -0.4 * s, 0.18 * s, 0);
};

// ---- mills ----
RC.windmill = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, sail = clamp(rec.h || 22, 12, 26), R = sail / 2;
  const hub = 4.3 + Math.sqrt(Math.max(0, R * R - Math.pow(W / 2 + 0.6, 2))) + 0.6;
  const rate = 6 + Math.floor(r() * 6);
  if ((rec.var | 0) === 1) {           // tower mill
    const th = hub - 1.1, tb = W * 0.92;
    const tst = rec.region === 1 || rec.region === 2 || r() < 0.4 ? WS.rubble : WS.render;
    const tc = tst === WS.rubble ? L.stoneC : lin(pick(PAL.daub[2], r()));
    P.add('cylT', 0, -P.base, 0, tb, th + P.base, tb, 0, tc, tst, { fl: F.DOOR_F, fh: 3.2, vo: P.base, lit: 0.25 });
    P.dl = 0.9;
    P.add('disc', 0, th * 0.42, 0, tb * 0.95 + 0.6, 0.18, tb * 0.95 + 0.6, 0, L.tc, PS.boards);
    P.dl = 1.3;
    const capW = tb * 0.72 * 0.9;
    P.add('roofG', 0, th - 0.1, 0.2, Dd * 0.62, 2.0, capW, HALF_PI, lin(0x5a4a3a), RS.shingle, { p0: 1 });
    P.dl = 1.9;
    P.vc('sail', 0, hub, -capW * 0.5 - 0.35, sail, sail, 1, 0, lin(0xe8e0cc), { p0: r() * 6.28, p1: AN.sail * 16 + rate, dl: 2 });
    P.beam([0, th + 0.4, Dd * 0.32], [0, 1.2, Dd / 2 + 0.3], 0.3, L.tc);
    return;
  }
  // post mill: trestle (or roundhouse) + post + buck
  const bw = W * 0.62, bd = Dd * 0.78, bb = hub - 5.2, bt = hub + 1.0;
  const round = r() < 0.5;
  if (round) {
    P.add('cylW', 0, -P.base, 0, W * 0.72, 2.6 + P.base, W * 0.72, 0, L.stoneC, WS.rubble, { fl: F.DOOR_F, fh: 2.6, vo: P.base });
    P.add('coneR', 0, 2.5, 0, W * 0.8, 1.5, W * 0.8, 0, lin(pick(PAL.thatch, r())), RS.thatch, { dl: 0.6 });
  } else {
    P.box(0, -0.2, 0, W - 0.6, 0.45, 0.45, L.tc, 0);
    P.box(0, -0.2, 0, 0.45, 0.45, Dd - 0.6, L.tc, 0);
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.beam([sx * (W / 2 - 0.5), 0.2, sz * (Dd / 2 - 0.5)], [sx * 0.3, 3.2, sz * 0.3], 0.3, L.tc);
  }
  P.dl = 0.4;
  P.post(0, 0, 0, 0.75, bb + 0.3, L.tc);
  P.dl = 0.8;
  P.body(0, 0, bw, bd, bb, bt - bb, WS.plank, L.wc, { fl: F.DOOR_B, fh: 2.6, vo: 0, lit: 0.2 });
  P.add('roofG', 0, bt - 0.1, 0, bd + 0.3, 1.4, bw + 0.3, HALF_PI, lin(0x5a4a3a), RS.shingle, { dl: 1.2 });
  P.dl = 1.6;
  const lz0 = Dd / 2 + 0.45, ldz = lz0 - bd / 2 - 0.1;
  P.add('ladder', 0.9, 0, lz0, 0.8, Math.hypot(bb, ldz), 0.2, 0, L.tc, 0, { rx: -Math.atan2(ldz, bb) });
  P.beam([0, bb + 0.3, bd / 2], [0, 0.6, Dd / 2 + 0.2], 0.28, L.tc);
  P.dl = 1.9;
  P.vc('sail', 0, hub, -bd / 2 - 0.35, sail, sail, 1, 0, lin(0xe8e0cc), { p0: r() * 6.28, p1: AN.sail * 16 + rate, dl: 2 });
};
RC.watermill = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, ws = rec.water === -1 ? -1 : 1;
  const wd = clamp(Dd * 0.75, 3.5, 6.2), wwid = 1.3, over = r() < 0.5;
  const hw = W - wwid - 0.4, cx = -ws * (W - hw) / 2;
  const info = house(P, L, {
    cx, cz: 0, w: hw, d: Dd, storeys: storeyList(2, 2.9, 2.6, L.ws, L.wc, L.ws, L.wc, F.DOOR_F | F.SILL), alongZ: false, rs: L.rs, rc: L.rc,
    pitch: L.pitch, hc: L.hc, ov: 0.45, ovE: 0.3, thatch: L.thatch, party: 0, lit: 0.3, frame: true, chim: [{ mode: 'end', side: -ws }]
  });
  const wx = ws * (W / 2 - wwid / 2 - 0.05), hubY = over ? wd / 2 + 0.3 : wd / 2 - 0.9;
  P.dl = 1.6;
  P.vc('wheel', wx, hubY, 0, wwid, wd, wd, 0, null, { p0: r() * 6.28, p1: AN.wheel * 16 + 5 });
  if (over) {
    P.box(wx, hubY + wd / 2 + 0.25, Dd / 4 + 0.2, wwid - 0.1, 0.5, Dd / 2 - 0.2, L.tc, PS.boards);
    P.post(wx, 0, Dd / 2 - 0.4, 0.3, hubY + wd / 2 + 0.25, L.tc);
  } else P.box(wx, -0.6, 0, wwid + 0.1, 0.4, Dd - 0.4, lin(0x3a3228), PS.boards);
  void info;
};

// ---- castle ----
RC.keep = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, col = L.wc, h = Math.max(rec.h || 18, 10);
  if ((rec.var | 0) === 1) {           // round keep
    const s = Math.min(W, Dd) * 0.8;
    P.add('cylW', 0, -P.base, 0, s + 1.4, 2.5 + P.base, s + 1.4, 0, col, WS.castle, { fl: F.NOWIN, vo: P.base });
    P.dl = 0.2;
    P.add('cylW', 0, 2.4, 0, s, h - 2.4, s, 0, col, WS.castle, { fh: 4.2, lit: 0.3, vo: -2.4 });
    P.dl = 1.2;
    P.add('crenelR', 0, h, 0, s + 0.3, 1.6, s + 0.3, 0, col, WS.castle, { fl: F.NOWIN });
    if (r() < 0.4) P.add('coneR', 0, h + 0.3, 0, s * 0.92, s * 0.6, s * 0.92, 0, L.rc, RS.slate, { dl: 1.6 });
    else { P.post(0, h, 0, 0.22, 7, lin(COL.darkWood), { dl: 1.6 }); P.banner(0, h + 7, 0, 3, 2, 0, L.her); }
    P.dl = 1.5;
    const run = Math.min(3.4, Dd / 2 + 0.5 - s / 2 + 0.3), sh = Math.min(3.6, run * 1.3);
    P.add('stairs', 0, 0, -s / 2 + 0.3 - run / 2, 1.4, sh, run, 0, col, PS.stone);
    P.box(0, sh, -s / 2 - 0.02, 1.2, 2.2, 0.1, lin(0x3a2616), PS.boards);
    P.torch(-1.2, sh + 0.4, -s / 2 - 0.1, 0);
    P.torch(1.2, sh + 0.4, -s / 2 - 0.1, 0);
    return;
  }
  const s = Math.min(W, Dd) * 0.74, bz = Dd / 2 - s / 2 - 0.55;
  P.add('frustum', 0, -P.base, bz, s + 2.2, 3 + P.base, s + 2.2, 0, col, WS.castle, { fl: F.NOWIN, vo: P.base });
  P.dl = 0.2;
  P.body(0, bz, s, s, 2.9, h - 2.9, WS.castle, col, { fh: 4.2, lit: 0.3, vo: -2.9 });
  P.dl = 1.2;
  P.crenRect(0, bz, s, s, h, col, 1.5, 0.5);
  P.add('roofG', 0, h - 0.2, bz, s - 1.2, (s / 2 - 0.6) * Math.tan(24 * PI / 180), s - 1.2, 0, lin(pick(PAL.lead, r())), RS.lead, { p0: 1, dl: 1.6 });
  // corner turrets
  const cone = r() < 0.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tx = sx * (s / 2 - 0.6), tzz = bz + sz * (s / 2 - 0.6);
    P.dl = 0.3;
    P.add('cylW', tx, -P.base, tzz, 3.0, h + 3.4 + P.base, 3.0, 0, col, WS.castle, { fh: 4.2, vo: P.base, lit: 0.15 });
    P.dl = 1.6;
    P.add('crenelR', tx, h + 3.4, tzz, 3.3, 1.3, 3.3, 0, col, WS.castle, { fl: F.NOWIN });
    if (cone) P.add('coneR', tx, h + 3.6, tzz, 3.4, 3.2, 3.4, 0, L.rc, RS.slate, { dl: 1.9 });
  }
  // forebuilding, stair and entrance
  const fd = bz - s / 2 + Dd / 2 - 0.2, fw = s * 0.45, fx = -s * 0.2, fz = -Dd / 2 + 0.2 + fd / 2;
  P.dl = 0.6;
  P.body(fx, fz, fw, fd + 0.2, null, h * 0.45, WS.castle, col, { fl: F.DOOR_F, fh: 4, lit: 0.25 });
  P.dl = 1.4;
  P.crenRect(fx, fz, fw, fd + 0.2, h * 0.45, col, 1.6, 0.4);
  P.torch(fx - 1.3, 2.6, -Dd / 2 + 0.15, 0);
  P.torch(fx + 1.3, 2.6, -Dd / 2 + 0.15, 0);
  P.post(0, h, bz, 0.22, 7, lin(COL.darkWood), { dl: 1.8 });
  P.banner(0, h + 7, bz, 3, 2, 0, L.her);
};
RC.motte = (P, rec, L) => {
  const r = L.r, W = Math.min(rec.w, rec.d), h = Math.max(rec.h || 10, 4);
  P.add('mound', 0, -P.base, 0, W, h + P.base, W, 0, lin(COL.grass), 0, { dl: 0 });
  const rT = W * 0.19 - 0.6;
  P.dl = 1.0;
  const n = 10, seg = 2 * rT * Math.sin(PI / n) + 0.1;
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * TAU, x = Math.cos(a) * rT * Math.cos(PI / n), z = Math.sin(a) * rT * Math.cos(PI / n);
    if (Math.abs(a - 1.5 * PI) < 0.4) continue;    // gap for the ramp at the front
    P.add('stakes', x, h - 0.4, z, seg, 3.0, 0.3, Math.atan2(-z, x) + HALF_PI, lin(pick(PAL.log, r())), 0);
  }
  P.dl = 1.4;
  watchT(P, L, 0, h, 0, clamp(rT * 0.9, 3.6, 5.2), 8, 1.4);
  P.dl = 1.8;
  const z0 = -W / 2 + 1.2, z1 = -rT + 0.3;
  P.beam([0, 0.3, z0], [0, h + 0.1, z1], 1.6, L.tc, PS.boards, 0.25);
};
function watchT(P, L, cx, y0, cz, s, h, dl0) {
  const ground = y0 === 0;
  const yb = ground ? -P.base : y0, hp = h * 0.72;
  P.dl = dl0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(cx + sx * (s / 2 - 0.2), yb, cz + sz * (s / 2 - 0.2), 0.3, y0 - yb + h, 0.3, L.tc, 0);
  P.dl = dl0 + 0.4;
  const e = s / 2 - 0.2;
  for (const sz of [-1, 1]) { P.beam([cx - e, y0 + 0.3, cz + sz * e], [cx + e, y0 + hp - 0.3, cz + sz * e], 0.16, L.tc); P.beam([cx + e, y0 + 0.3, cz + sz * e], [cx - e, y0 + hp - 0.3, cz + sz * e], 0.16, L.tc); }
  for (const sx of [-1, 1]) { P.beam([cx + sx * e, y0 + 0.3, cz - e], [cx + sx * e, y0 + hp - 0.3, cz + e], 0.16, L.tc); }
  P.dl = dl0 + 0.8;
  P.box(cx, y0 + hp, cz, s + 0.4, 0.22, s + 0.4, L.tc, PS.boards);
  for (const sz of [-1, 1]) P.box(cx, y0 + hp + 1.0, cz + sz * (s / 2 + 0.1), s + 0.3, 0.1, 0.1, L.tc, 0);
  for (const sx of [-1, 1]) P.box(cx + sx * (s / 2 + 0.1), y0 + hp + 1.0, cz, 0.1, 0.1, s + 0.3, L.tc, 0);
  P.dl = dl0 + 1.2;
  P.add('pyrR', cx, y0 + h, cz, s + 0.8, 1.8, s + 0.8, 0, L.rs === RS.thatch ? L.rc : lin(pick(PAL.shingle, 0.5)), L.rs === RS.thatch ? RS.thatch : RS.shingle);
  P.add('ladder', cx, y0, cz - s / 2 + 0.35, 0.6, hp / Math.cos(0.12), 0.1, 0, L.tc, 0, { rx: 0.12, dl: dl0 + 1.4 });
  P.torch(cx + s / 2 - 0.2, y0 + hp + 1.4, cz - s / 2 + 0.05, 0);
}
RC.watchtower = (P, rec, L) => { watchT(P, L, 0, 0, 0, Math.min(rec.w, rec.d) - 0.2, Math.max(rec.h || 9, 5), 0); };
RC.wall = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, h = rec.h || 7, col = L.wc;
  P.body(0, 0, W, Dd, null, h, WS.castle, col, { fl: F.NOWIN, fh: 4 });
  P.dl = 0.3;
  P.cren(0, h, -Dd / 2 + 0.28, W, 0.56, 1.8, 0, col, 0.3);
  P.box(0, h, Dd / 2 - 0.1, W, 1.0, 0.15, L.tc, 0, { dl: 0.5 });
};
RC.tower = (P, rec, L) => {
  const r = L.r, s = Math.min(rec.w, rec.d), h = rec.h || 12, col = L.wc, cap = r() < 0.4;
  if ((rec.var | 0) === 1) {
    P.add('cylW', 0, -P.base, 0, s, h + P.base, s, 0, col, WS.castle, { fl: F.DOOR_B, fh: 4.2, vo: P.base, lit: 0.2 });
    P.dl = 1.2;
    P.add('crenelR', 0, h, 0, s + 0.3, 1.6, s + 0.3, 0, col, WS.castle, { fl: F.NOWIN });
    if (cap) P.add('coneR', 0, h + 0.4, 0, s + 0.5, s * 0.8, s + 0.5, 0, L.rc, RS.slate, { dl: 1.6 });
  } else {
    P.body(0, 0, s, s, null, h, WS.castle, col, { fl: F.DOOR_B, fh: 4.2, lit: 0.2 });
    P.dl = 1.2;
    if (cap) P.add('pyrR', 0, h, 0, s + 0.4, s * 0.75, s + 0.4, 0, L.rc, RS.slate, { dl: 1.6 });
    else P.crenRect(0, 0, s, s, h, col, 1.4, 0.5);
  }
};
function castleTower(P, x, z, s, h, round, col, dl) {
  P.dl = dl;
  if (round) { P.add('cylW', x, -P.base, z, s, h + P.base, s, 0, col, WS.castle, { fh: 4.2, vo: P.base, lit: 0.2 }); P.dl = dl + 1.1; P.add('crenelR', x, h, z, s + 0.3, 1.5, s + 0.3, 0, col, WS.castle, { fl: F.NOWIN }); }
  else { P.body(x, z, s, s, null, h, WS.castle, col, { fh: 4.2, lit: 0.2 }); P.dl = dl + 1.1; P.crenRect(x, z, s, s, h, col, dl + 1.1, 0.45); }
}
RC.gatehouse = (P, rec, L) => {
  // a gatehouse is never lower than 5 m, whatever wall it sits in (a 3.2 m precinct wall would invert the chamber)
  const W = rec.w, Dd = rec.d, h = Math.max(rec.h || 8, 5), col = L.wc, round = rec.wealth > 0.55;
  const ts = Math.min(6.4, W * 0.36), tx = W / 2 - ts / 2 - 0.1, tz = -Dd / 2 + ts / 2 + 0.2;
  for (const s of [-1, 1]) castleTower(P, s * tx, tz, ts, h + 3, round, col, 0);
  const bw = 2 * (tx - ts * 0.2), ah = Math.min(Math.max(7.5, h * 0.8), h + 0.5);
  P.dl = 0.2;
  P.add('arch', 0, -P.base, 0, bw, ah + P.base, Dd - 1, 0, col, WS.castle, { fl: F.NOWIN, vo: P.base });
  P.dl = 0.9;
  P.body(0, 0, bw, Dd - 1, ah, h + 1.5 - ah, WS.castle, col, { fh: 3.5, lit: 0.35, vo: 0 });
  P.dl = 1.6;
  P.cren(0, h + 1.5, -Dd / 2 + 0.5 + 0.28, bw, 0.56, 1.7, 0, col, 1.6);
  P.cren(0, h + 1.5, Dd / 2 - 0.5 - 0.28, bw, 0.56, 1.7, 0, col, 1.6);
  const apex = 0.596 * (ah + P.base) - P.base, open = bw * 0.5;
  P.box(0, apex - 1.8, -Dd / 2 + 1.4, open * 0.95, 1.8, 0.18, lin(0x2a2622), PS.grid, { dl: 1.4 });
  for (const s of [-1, 1]) P.box(s * (open / 2 - 0.12), 0, -Dd / 2 + 3.6, 0.14, Math.min(apex - 0.8, 4.5), open * 0.48, lin(0x4a3422), PS.boards, { dl: 1.5 });
  P.dl = 1.2;
  for (const s of [-1, 1]) P.torch(s * (open / 2 + 0.9), 3.4, -Dd / 2 + 0.2, 0);
  for (const s of [-1, 1]) P.banner(s * tx - 0.8, h + 1.8, tz - ts / 2 - (round ? 0.05 : 0.08), 1.6, 3.6, 0, L.her);
};
RC.postern = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, h = Math.max(rec.h || 7, 4.2), col = L.wc;   // keep a walk-through opening on low walls
  P.add('arch', 0, -P.base, 0, W, h + 0.5 + P.base, Dd, 0, col, WS.castle, { fl: F.NOWIN, vo: P.base });
  P.dl = 0.4;
  P.cren(0, h + 0.5, -Dd / 2 + 0.28, W, 0.56, 1.7, 0, col, 0.4);
  const apex = 0.596 * (h + 0.5 + P.base) - P.base;
  P.box(0, 0, 0.3, W * 0.48, Math.min(apex, 3.2), 0.12, lin(0x3a2616), PS.boards, { dl: 0.9 });
  P.torch(W / 2 - 0.9, 3.0, -Dd / 2 - 0.02, 0);
};
RC.palisade = (P, rec, L) => {
  const r = L.r, W = rec.w, h = rec.h || 4, n = Math.max(1, Math.ceil(W / 6)), seg = W / n;
  for (let k = 0; k < n; k++) { P.dl = k * 0.08; P.add('stakes', -W / 2 + (k + 0.5) * seg, -Math.min(P.base, 0.8), 0, seg + 0.05, h + Math.min(P.base, 0.8), 0.4, 0, jit(lin(pick(PAL.log, r())), 0.9 + r() * 0.2), 0); }
};
RC.palisadegate = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, h = rec.h || 4, s = Math.min(3, Dd - 0.4);
  for (const sx of [-1, 1]) watchT(P, L, sx * (W / 2 - s / 2 - 0.05), 0, 0, s, h + 2.4, 0);
  const gap = W - 2 * s;
  P.dl = 1.4;
  P.box(0, h + 0.2, 0, gap + 0.6, 0.4, 0.45, L.tc, 0);
  for (const sx of [-1, 1]) P.box(sx * (gap / 2 - 0.1), 0, -gap / 4 - 0.1, 0.18, h - 0.5, gap / 2 - 0.1, jit(L.tc, 1.15), PS.boards, { dl: 1.6 });
};

// ---- monastery ----
RC.cloister = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d, col = L.wc, walk = clamp(Math.min(W, Dd) * 0.1, 2.8, 3.6), ha = 3.2, ho = 4.1;
  const rc = L.rs === RS.thatch ? lin(pick(PAL.tile[1], r())) : L.rc, rs = L.rs === RS.thatch ? RS.tile : L.rs;
  for (const s of [-1, 1]) {
    P.body(0, s * (Dd / 2 - 0.3), W, 0.6, null, ho, WS.church, col, { fl: F.NOWIN, fh: ho });
    P.body(s * (W / 2 - 0.3), 0, 0.6, Dd - 1.2, null, ho, WS.church, col, { fl: F.NOWIN, fh: ho });
  }
  P.dl = 0.4;
  const iw = W - 2 * walk, id = Dd - 2 * walk;
  for (const s of [-1, 1]) {
    P.add('arcade', 0, -P.base, s * (Dd / 2 - walk), iw + 0.4, ha + P.base, 0.6, 0, col, WS.church, { fl: F.NOWIN, vo: P.base });
    P.add('arcade', s * (W / 2 - walk), -P.base, 0, id + 0.4, ha + P.base, 0.6, HALF_PI, col, WS.church, { fl: F.NOWIN, vo: P.base });
    for (const t of [-1, 1]) P.body(s * (W / 2 - walk), t * (Dd / 2 - walk), 1.0, 1.0, null, ha + 0.25, WS.church, col, { fl: F.NOWIN });
  }
  P.dl = 1.0;
  const sy = ho + 0.25 - ha;
  P.add('roofL', 0, ha, Dd / 2 - walk / 2, W - 0.2, sy, walk + 0.3, 0, rc, rs);
  P.add('roofL', 0, ha, -Dd / 2 + walk / 2, W - 0.2, sy, walk + 0.3, PI, rc, rs);
  P.add('roofL', W / 2 - walk / 2, ha, 0, id, sy, walk + 0.3, HALF_PI, rc, rs);
  P.add('roofL', -W / 2 + walk / 2, ha, 0, id, sy, walk + 0.3, -HALF_PI, rc, rs);
  P.dl = 1.4;
  wellParts(P, 0, 0, 0.9, L);
};
RC.range = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d;
  house(P, L, {
    cx: 0, cz: 0, w: W, d: Dd, storeys: storeyList(2, 3.2, 3.0, L.ws, L.wc, L.ws, L.wc, F.DOOR_F | F.SILL), alongZ: false, rs: L.rs, rc: L.rc,
    pitch: clamp(L.pitch, 44, 52), hc: 0, ov: 0.4, ovE: 0.3, thatch: L.thatch, party: rec.party, lit: 0.35, chim: [{ mode: 'ridge', t: -0.7 }, { mode: 'ridge', t: 0.7 }]
  });
  if (W > 24) { P.dl = 0.6; for (let i = 1; i < 4; i++) P.add('buttress', -W / 2 + W * i / 4, -P.base, -Dd / 2 - 0.2, 0.75, 3.6 + P.base, 0.8, 0, L.wc, L.ws, { fl: F.NOWIN, vo: P.base }); }
};

// ---- harbour ----
RC.pier = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, deckY = 1.2, wood = lin(COL.deck), dark = lin(0x3a2e24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.post(sx * (W / 2 - 0.22), -P.base, sz * (Dd / 2 - 0.35), 0.34, P.base + deckY - 0.2, dark);
  P.dl = 0.4;
  for (const sx of [-1, 1]) P.box(sx * (W / 2 - 0.22), deckY - 0.42, 0, 0.26, 0.24, Dd, dark, 0);
  P.dl = 0.7;
  P.box(0, deckY - 0.22, 0, W, 0.22, Dd + 0.06, wood, PS.boards);
  P.dl = 1.4;
  if ((rec.var | 0) === 1) {
    P.post(W / 2 - 0.3, deckY, Dd / 2 - 0.3, 0.16, 2.7, dark);
    P.lantern(W / 2 - 0.3, deckY + 2.7, Dd / 2 - 0.3, 0.42, deckY);
    for (const sx of [-1, 1]) P.post(sx * (W / 2 - 0.3), deckY, Dd / 2 - 1.2, 0.36, 0.55, lin(COL.iron));
  } else if ((rec.seed & 1) === 0) P.post((rec.seed & 2 ? 1 : -1) * (W / 2 - 0.3), deckY, 0, 0.36, 0.55, lin(COL.iron));
};
RC.quay = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, top = 1.5;
  P.body(0, 0, W, Dd, -P.base, P.base + top, WS.ashlar, L.wc, { fl: F.NOWIN, fh: 4, vo: P.base });
  P.dl = 1.0;
  const n = Math.max(1, Math.floor(W / 6));
  for (let i = 0; i < n; i++) P.post(-W / 2 + (i + 0.5) * W / n, top, -Dd / 2 + 0.45, 0.4, 0.6, lin(COL.iron));
  P.box(0, top, -Dd / 2 + 0.1, W, 0.18, 0.2, lin(0x6a5c4a), 0);
};
RC.boathouse = (P, rec, L) => {
  const r = L.r, W = rec.w, Dd = rec.d;
  house(P, L, {
    cx: 0, cz: 0, w: W, d: Dd, storeys: [{ h: 3.4, st: WS.plank, col: L.ws === WS.plank ? L.wc : lin(pick(PAL.plank[1], r())), fl: F.DOOR_F | F.BARNDOOR | F.DOOR_B, fh: 3.4 }], alongZ: true,
    rs: L.rs, rc: L.rc, pitch: clamp(L.pitch, 45, 55), hc: 0, ov: 0.45, ovE: 0.35, thatch: L.thatch, party: 0, lit: 0.1, chim: []
  });
  P.dl = 0.2;
  for (const sx of [-1, 1]) for (const k of [0, 1]) P.post(sx * (W / 2 - 0.2), -P.base - 1.0, -Dd / 2 + 0.3 + k * 2.2, 0.3, P.base + 1.0, lin(0x3a2e24));
};
RC.storehouse = (P, rec, L) => {
  const r = L.r, W = rec.w;
  const rec2 = Object.assign({}, rec, { gable: 'street', jetty: 0 });
  const info = framedHouse(P, rec2, L, { front: 0.4, h0: 3.0, h: 2.7, fl0: F.DOOR_F | F.DBLDOOR | F.SILL, dormers: 0, chimN: 1, lit: 0.2, stoneGround: rec.wealth > 0.6 });
  P.dl = 2.0;
  const zf = -rec.d / 2 + 0.4;
  for (let i = 1; i < info.full; i++) P.box(0, 3.0 + (i - 1) * 2.7 + 0.35, zf - 0.04, 1.3, 1.9, 0.08, lin(0x4a3422), PS.boards);
  const hy = info.eave + info.rise * 0.45;
  P.box(0, hy, zf - 0.45, 0.28, 0.28, 1.0, L.tc, 0);
  P.add('roofG', 0, hy + 0.3, zf - 0.35, 1.2, 0.6, 1.1, HALF_PI, L.rc, L.rs, { dl: 2.2 });
  P.box(0, 1.6, zf - 0.85, 0.03, hy - 1.6, 0.03, lin(0xbba27a), 0, { dl: 2.3 });
  void W; void r;
};
RC.boat = (P, rec, L) => {
  const v = clamp(rec.var | 0, 0, 2), g = ['rowboat', 'fishboat', 'cog'][v];
  const col = v === 2 ? lin(0xe0d6bc) : v === 1 ? lin(pick([0xb8a080, 0x9a5a3a, 0xd8ccb0], L.r())) : lin(0xffffff);
  P.vc(g, 0, v === 0 ? 0.05 : 0, 0, rec.w, rec.h || BOAT_H[v], rec.d, 0, col, { p0: (rec.seed % 628) / 100, p1: AN.bob * 16 });
};
RC.crane = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, h = rec.h || W * 1.4;
  P.box(0, -P.base, 0, W, P.base + 0.3, Dd, L.wc, PS.stone);
  P.dl = 0.5;
  P.vc('crane', 0, 0.3, 0, W, h, Dd, 0, null);
  P.dl = 1.3;
  const wd = W * 0.55;
  P.vc('wheel', W * 0.28, 0.3 + wd / 2, Dd * 0.12, 1.0, wd, wd, 0, null);
};

// ---- misc ----
RC.bridge = (P, rec, L) => {
  const W = rec.w, Dd = rec.d, H = Math.max(1.5, P.base), col = lin(pick(PAL.ashlar[2], L.r()));
  const n = Math.max(1, Math.ceil(W / 12)), s = W / n, deck = 0.35;
  const aH = clamp(0.583 * s, 1.2, H - deck);
  for (let k = 0; k < n; k++) P.add('archB', -W / 2 + (k + 0.5) * s, -aH - deck, 0, s + 0.02, aH, Dd, 0, col, WS.ashlar, { fl: F.NOWIN, vo: 0 });
  if (H - deck - aH > 0.2) for (let k = 0; k <= n; k++) {
    const x = clamp(-W / 2 + k * s, -W / 2 + 0.08 * s + 0.3, W / 2 - 0.08 * s - 0.3);
    P.body(x, 0, 0.16 * s + 0.6, Dd + 0.8, -H, H - deck - aH, WS.ashlar, col, { fl: F.NOWIN, vo: 0 });
  }
  P.dl = 0.6;
  P.box(0, -deck, 0, W, deck + 0.02, Dd - 0.6, lin(COL.flag), PS.stone);
  P.dl = 0.9;
  for (const sz of [-1, 1]) {
    P.add('body', 0, -deck, sz * (Dd / 2 - 0.2), W, 0.9 + deck, 0.4, 0, col, WS.ashlar, { fl: F.NOWIN, vo: 0 });
    P.box(0, 0.9, sz * (Dd / 2 - 0.2), W, 0.12, 0.5, jit(col, 1.08), PS.stone);
  }
};
RC.pond = (P, rec, L) => {
  P.add('disc', 0, -0.2, 0, rec.w + 0.6, 0.22, rec.d + 0.6, 0, lin(0x4a5a34), 0);
  P.add('disc', 0, -0.15, 0, rec.w, 0.2, rec.d, 0, lin(COL.water), PS.water, { dl: 0.3 });
};
RC.tent = (P, rec, L) => {
  const s = Math.min(rec.w, rec.d);
  P.add('tentC', 0, 0, 0, s, 3.2, s, 0, L.cloth, PS.stripeR);
  P.dl = 0.8;
  P.post(0, 0, 0, 0.12, 3.9, lin(COL.darkWood));
  P.add('pennant', 0, 3.9, 0, 1.2, 0.55, 1, 0, L.her, 0, { p0: (rec.seed % 97) * 0.1, p1: AN.wave * 16 + 5, dl: 1.4 });
};
RC.beacontower = (P, rec, L) => {
  const s = Math.min(rec.w, rec.d) * 0.82, h = rec.h || 10, col = L.wc;
  P.add('cylW', 0, -P.base, 0, s, h + P.base, s, 0, col, WS.castle, { fl: F.DOOR_F, fh: 4, vo: P.base, lit: 0.2 });
  P.dl = 1.1;
  P.add('crenelR', 0, h, 0, s + 0.3, 1.4, s + 0.3, 0, col, WS.castle, { fl: F.NOWIN });
  P.dl = 1.5;
  P.post(0, h, 0, 0.4, 1.1, lin(COL.iron));
  P.post(0, h + 1.1, 0, 1.8, 0.5, lin(COL.iron));
  P.vc('forgeGlow', 0, h + 1.35, 0, 1.4, 0.9, 1.4, 0, null, { p0: (rec.seed % 50) * 0.3, p1: AN.flicker * 16, dl: 2 });
  P.lightAt(0, h + 2, 0, 12, h);
  P.smoke.push([0, h + 2.4, 0, SMOKE.forge, 2.5]);
};

// ---- worksite (Living History) ------------------------------------------------------------------------
// A derived record owned by works.js: never saved, never in Town.chunks, not pickable, re-derived on load.
// rec.target = the live Kit record being built (the worksite shares its x / z / rot / y / y0): scaffold bays wrap
// every face of its WALL bodies (4.5 m bays, ~6 m tiers, SCAFF: clipped to the cap + 2.4), a treadwheel crane
// rides the cap on the tallest body (RIDE; a ridden part's iParams.w = its lift above the cap), pegs and string
// lines mark the footprint (PEG: gone once the walls start), and a stone heap + timber stack sit beside it.
// rec.site = a bridge work site {x, z, y, rot, len, piers:[{x, z, yBase, yTop}]}: a scaffold tower round the pier
// nearest (x, z) with the crane on it (works.js gives the worksite rec._cap = that pier's top).
const SCAF_BODY = new Set(['body', 'cylW', 'cylT', 'frustum']);
const SCAF_MAX = 900;
function scaffoldBox(P, bodies, i, S, white) {   // bodies[i] = {lx, lz, ry, sx, sz, base, top}; S = bay / tier scale
  const b = bodies[i], c = Math.cos(b.ry), s = Math.sin(b.ry), dep = 1.4, off = 0.4 + dep / 2;
  const inside = (x, z, y) => {                  // a bay tucked inside a neighbouring body (nave face under an aisle) is skipped
    for (let j = 0; j < bodies.length; j++) {
      if (j === i) continue;
      const o = bodies[j]; if (o.top < y + 1) continue;
      const dx = x - o.lx, dz = z - o.lz, co = Math.cos(o.ry), so = Math.sin(o.ry);
      const px = dx * co - dz * so, pz = dx * so + dz * co;
      if (Math.abs(px) < o.sx / 2 && Math.abs(pz) < o.sz / 2) return true;
    }
    return false;
  };
  const H = b.top + 1 - b.base, nT = Math.max(1, Math.round(H / (6 * S))), th = H / nT;
  for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const half = fx ? b.sx / 2 : b.sz / 2, len = fx ? b.sz : b.sx;
    const nB = Math.max(1, Math.round(len / (4.5 * S))), bw = len / nB;
    const nx = fx * c + fz * s, nz = -fx * s + fz * c, ry = Math.atan2(-nx, -nz);   // local −z faces outward
    const tx = fz ? 1 : 0, tz = fx ? 1 : 0;                                         // face tangent (part frame)
    for (let k = 0; k < nB; k++) {
      const a = -len / 2 + (k + 0.5) * bw, px = fx * (half + off) + tx * a, pz = fz * (half + off) + tz * a;
      const x = b.lx + px * c + pz * s, z = b.lz - px * s + pz * c;
      for (let t = 0; t < nT; t++) {
        const y = b.base + t * th;
        if (inside(x, z, y)) continue;
        P.dl = t * 0.12;
        P.add('scaffold', x, y, z, bw + 0.05, th, dep, ry, white, 0, { fl: F.SCAFF });
      }
    }
  }
}
function craneAt(P, x, z, ry, white, s) {        // treadwheel crane + turning wheel, both riding the cap
  P.dl = 0.4;
  P.add('craneT', x, 0, z, 5 * s, 7 * s, 5 * s, ry, white, 0, { fl: F.RIDE });
  const ox = 1.4 * s, oz = 0.6 * s, c = Math.cos(ry), sn = Math.sin(ry);
  P.add('wheel', x + ox * c + oz * sn, 0, z - ox * sn + oz * c, 1.0 * s, 2.8 * s, 2.8 * s, ry, white, 0,
    { fl: F.RIDE, vo: 1.7 * s, p0: (P.rec.seed % 628) / 100, p1: AN.wheel * 16 + 5 });
}
RC.worksite = (P, rec, L) => {
  const white = lin(0xffffff);
  if (rec.site) {                                 // bridge: the active pier
    const S = rec.site, piers = S.piers || [];
    let pr = null, bd = 1e18;
    for (const q of piers) { const d = (q.x - S.x) ** 2 + (q.z - S.z) ** 2; if (d < bd) { bd = d; pr = q; } }
    const c = Math.cos(rec.rot), s = Math.sin(rec.rot), y = rec.y || 0;
    const wx = pr ? pr.x - rec.x : 0, wz = pr ? pr.z - rec.z : 0, lx = wx * c - wz * s, lz = wx * s + wz * c;
    const base = pr && pr.yBase !== undefined ? pr.yBase - y : -4, top = pr && pr.yTop !== undefined ? pr.yTop - y : 0;
    // the site's rot runs local +z along the bridge: the pier is deck-wide across (x) and ~3 m along (z)
    scaffoldBox(P, [{ lx, lz, ry: 0, sx: Math.max(4, Math.min(9, S.w || 7)), sz: 3.2, base, top }], 0, 0.75, white);
    craneAt(P, lx, lz, 0, white, 0.8);
    return;
  }
  const T = rec.target; if (!T) return;
  const TP = ensureParts(T), bodies = [];
  let maxA = 0;
  for (let o = 0; o < TP.length; o += PSTR) {
    const G = GEO_LIST[TP[o]]; if (!G || !SCAF_BODY.has(G.name)) continue;
    const sx = TP[o + 4], sz = TP[o + 6], ly = TP[o + 2], top = ly + TP[o + 5];
    const base = Math.max(ly, 0);
    if (top - base < 2 || Math.max(sx, sz) < 2.5 || sx * sz < 4) continue;       // chimneys, stubs
    bodies.push({ lx: TP[o + 1], lz: TP[o + 3], ry: TP[o + 7], sx, sz, base, top, ground: ly <= 0.5 });
    maxA = Math.max(maxA, sx * sz);
  }
  if (!bodies.length) return;
  // bay / tier scale so a huge cathedral stays within SCAF_MAX scaffold instances
  let area = 0; for (const b of bodies) area += 2 * (b.sx + b.sz) * (b.top + 1 - b.base);
  const S = Math.max(1, Math.sqrt(area / (4.5 * 6) / SCAF_MAX));
  for (let i = 0; i < bodies.length; i++) scaffoldBox(P, bodies, i, S, white);
  // crane on the tallest body
  let tb = bodies[0]; for (const b of bodies) if (b.top > tb.top) tb = b;
  craneAt(P, tb.lx, tb.lz, tb.ry, white, clamp(Math.sqrt(tb.sx * tb.sz) / 10, 0.7, 1.4));
  // pegs and string lines on the main footprint
  P.dl = 0;
  const wood = lin(COL.wood), line = lin(0xe8dcc0);
  for (const b of bodies) {
    if (!b.ground || b.sx * b.sz < maxA * 0.1) continue;
    const c = Math.cos(b.ry), s = Math.sin(b.ry), hx = b.sx / 2, hz = b.sz / 2;
    const at = (px, pz) => [b.lx + px * c + pz * s, b.lz - px * s + pz * c];
    for (const [px, pz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) { const [x, z] = at(px, pz); P.add('stakes', x, 0, z, 0.3, 0.7, 0.12, b.ry, wood, 0, { fl: F.PEG }); }
    for (const [px, pz, len, r] of [[0, -hz, b.sx, 0], [0, hz, b.sx, 0], [-hx, 0, b.sz, HALF_PI], [hx, 0, b.sz, HALF_PI]]) {
      const [x, z] = at(px, pz); P.add('box', x, 0.35, z, len, 0.025, 0.025, b.ry + r, line, 0, { fl: F.PEG });
    }
  }
  // stone heap and timber stack beside the site (+x side of the record)
  const hx = (T.w || 10) / 2 + 4, stoneC = lin(COL.stone);
  P.add('mound', hx, -0.3, -2, 4.5, 1.6, 3.5, 0.3, stoneC, 0, { fl: F.SCAFF });
  for (let k = 0; k < 4; k++) P.add('box', hx + 0.2, k * 0.34, 3 + (k % 2) * 0.2, 4.2, 0.34, 1.6 - k * 0.3, HALF_PI * 0.1, wood, PS.boards, { fl: F.SCAFF });
};

function recipe(rec) {
  const P = new PB(rec);
  const L = look(rec);
  P.tone = L.tone;
  rec._tho = L.rs === RS.thatch && L.age > 0.5;   // undated, this roof bakes old thatch: a year flip must re-derive it
  const fn = RC[rec.kind] || RC.cottage;
  try { fn(P, rec, L); } catch (e) { console.warn('[kit] recipe failed for', rec.kind, e); }
  return { parts: new Float32Array(P.a), smoke: P.smoke, lights: P.lights };
}

// ---- wall & pier runs ---------------------------------------------------------------------------------
function resampleLoop(points, step) {
  const n = points.length, P = [];
  for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % n]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const k = Math.max(1, Math.ceil(L / step)); for (let j = 0; j < k; j++) P.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); }
  const S = [0]; for (let i = 1; i <= P.length; i++) { const a = P[i - 1], b = P[i % P.length]; S.push(S[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { P, S, L: S[P.length] };
}
function loopAt(R, s) { // point + tangent at arc position s (wraps)
  const L = R.L; s = ((s % L) + L) % L;
  let lo = 0, hi = R.P.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.S[m] <= s) lo = m; else hi = m - 1; }
  const a = R.P[lo], b = R.P[(lo + 1) % R.P.length], seg = Math.max(1e-6, R.S[lo + 1] - R.S[lo]), t = (s - R.S[lo]) / seg;
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz };
}
function nearestS(R, x, z) {
  let best = 1e18, bs = 0;
  for (let i = 0; i < R.P.length; i++) {
    const a = R.P[i], b = R.P[(i + 1) % R.P.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1), px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d = px * px + pz * pz;
    if (d < best) { best = d; bs = R.S[i] + Math.sqrt(L2) * t; }
  }
  return bs;
}
function hAtSafe(x, z) { return D.Terrain && D.Terrain.hAt ? D.Terrain.hAt(x, z) : 0; }
function wallRun(points, spec) {
  spec = spec || {};
  if (!points || points.length < 3) return [];
  const pal = spec.kind === 'palisade';
  const wealth = clamp(spec.wealth !== undefined ? spec.wealth : 0.5, 0, 1), seed = (spec.seed >>> 0) || 1, region = spec.region | 0;
  const h = spec.h !== undefined ? spec.h : 6.5 + 3 * wealth;
  const hPal = Math.min(h, 3.2 + 1.2 * wealth);
  const R = resampleLoop(points, 2), L = R.L;
  if (L < 20) return [];
  const cd = (a, b) => { const d = Math.abs(a - b) % L; return Math.min(d, L - d); };   // circular arc distance
  // orientation: signed area > 0 ⇒ counter-clockwise in (x, z)
  let area = 0; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const outSign = area > 0 ? 1 : -1;                                   // outward normal = outSign·(tz, −tx)
  const rotOut = (tx, tz) => { const nx = outSign * tz, nz = -outSign * tx; return Math.atan2(-nx, -nz); };   // local −z faces outward
  const mk = (kind, s, w, d, extra) => {
    const p = loopAt(R, s);
    return design(kind, p.x, p.z, rotOut(p.tx, p.tz), Object.assign({ w, d, wealth, region, seed: hash32(seed, Math.round(s * 10) + D.hashStr(kind)) }, extra || {}));
  };
  // 1-2. gates at their nearest arc positions (overlapping gates are dropped)
  const gates = [];
  for (const g of spec.gates || []) {
    const s = nearestS(R, g.x, g.z), big = g.kind !== 'postern';
    const gw = pal ? (big ? 9 : 6.5) : big ? 18 : 6;
    if (gates.some(o => cd(s, o.s) < (gw + o.w) / 2 + 4)) continue;
    gates.push({ s, w: gw, kind: pal ? 'palisadegate' : big ? 'gatehouse' : 'postern', d: pal ? 4.5 : big ? 12 : 3 });
  }
  const s0 = gates.length ? gates[0].s : 0;
  const rel = s => ((s - s0) % L + L) % L;
  const inGate = (s, pad) => gates.some(g => cd(s, g.s) < g.w / 2 + pad);
  // 3. towers: corners over 30° and every lerp(45, 35, wealth) m (palisade: watchtower every 60 m when wealth > .3)
  const tDia = pal ? 4 : 7 + 2 * wealth;
  const towers = [];
  if (!pal || wealth > 0.3) {
    const sp = pal ? 60 : (spec.towerSpacing || lerp(45, 35, wealth));
    if (!pal) for (let i = 0; i < points.length; i++) {
      const a = points[(i - 1 + points.length) % points.length], b = points[i], c = points[(i + 1) % points.length];
      const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      if (Math.abs(D.angDiff(t1, t2)) > 30 * PI / 180) {
        const s = nearestS(R, b[0], b[1]);
        if (!inGate(s, tDia / 2 + 4) && !towers.some(o => cd(s, o) < sp * 0.45)) towers.push(s);
      }
    }
    const feats = towers.map(s => ({ s: rel(s), w: tDia })).concat(gates.map(g => ({ s: rel(g.s), w: g.w }))).sort((a, b) => a.s - b.s);
    if (!feats.length) feats.push({ s: 0, w: 0 });
    const fill = [];
    for (let i = 0; i < feats.length; i++) {
      const a = feats[i], b = i + 1 < feats.length ? feats[i + 1] : { s: feats[0].s + L, w: feats[0].w };
      const gap = b.s - a.s - a.w / 2 - b.w / 2, k = Math.floor(gap / sp);
      for (let j = 1; j <= k; j++) fill.push(((a.s + a.w / 2 + gap * j / (k + 1)) + s0) % L);
    }
    for (const s of fill) if (!inGate(s, tDia / 2 + 3) && !towers.some(o => cd(s, o) < tDia + 6)) towers.push(s);
  }
  // 4-5. wall / palisade pieces between features: ≤ 36 m, ≤ 12 m where the ground climbs more than 1.6 m
  const feats = gates.map(g => ({ s: rel(g.s), w: g.w })).concat(towers.map(s => ({ s: rel(s), w: tDia * 0.7 }))).sort((a, b) => a.s - b.s);
  const pieces = [];
  const addRun = (a, b) => {
    const len0 = b - a; if (len0 < 1.5) return;
    const n = Math.max(1, Math.ceil(len0 / 36)), cuts = [];
    for (let i = 0; i < n; i++) {
      const pa = a + len0 * i / n, pb = a + len0 * (i + 1) / n, A = loopAt(R, pa + s0), B = loopAt(R, pb + s0);
      const m = Math.abs(hAtSafe(B.x, B.z) - hAtSafe(A.x, A.z)) > 1.6 ? Math.ceil((pb - pa) / 12) : 1;
      for (let j = 0; j < m; j++) cuts.push([pa + (pb - pa) * j / m, pa + (pb - pa) * (j + 1) / m]);
    }
    for (const [pa, pb] of cuts) {
      const A = loopAt(R, pa + s0), B = loopAt(R, pb + s0);
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      const rec = design(pal ? 'palisade' : 'wall', (A.x + B.x) / 2, (A.z + B.z) / 2, rotOut(dx / len, dz / len), {
        w: len + (pal ? 0.25 : 0.7), d: pal ? 0.5 : 2.4, h: pal ? hPal : h, wealth, region, seed: hash32(seed, Math.round(pa * 10) + 7)
      });
      pieces.push({ rec, s: (pa + pb) / 2 });
    }
  };
  if (!feats.length) addRun(0, L);
  for (let i = 0; i < feats.length; i++) {
    const a = feats[i], b = i + 1 < feats.length ? feats[i + 1] : { s: feats[0].s + L, w: feats[0].w };
    addRun(a.s + a.w / 2, b.s - b.w / 2);
  }
  // 6. construction order: gates, then pieces outward from gates[0] alternating directions,
  //    each tower right before its first adjacent piece
  const out = [];
  for (const g of gates) out.push(mk(g.kind, g.s, g.w, g.d, { h: pal ? hPal : h }));
  const tRecs = towers.map(s => ({ s: rel(s), placed: false, rec: mk(pal ? 'watchtower' : 'tower', s, tDia, tDia, pal ? { h: 7 + wealth * 2 } : { h: h + 5, var: wealth > 0.55 ? 1 : 0 }) }));
  const dist = p => Math.min(p.s, L - p.s);
  pieces.sort((a, b) => (dist(a) - dist(b)) || (a.s - b.s));
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    for (const t of tRecs) if (!t.placed && cd(p.s, t.s) <= p.rec.w / 2 + tDia) { out.push(t.rec); t.placed = true; }
    out.push(p.rec);
  }
  for (const t of tRecs) if (!t.placed) out.push(t.rec);
  return out;
}
function pierRun(points, spec) {
  spec = spec || {};
  if (!points || points.length < 2) return [];
  const wealth = clamp(spec.wealth !== undefined ? spec.wealth : 0.5, 0, 1), seed = (spec.seed >>> 0) || 1;
  const width = spec.width || 3.2 + wealth * 1.2;
  const S = [0]; for (let i = 1; i < points.length; i++) S.push(S[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const L = S[S.length - 1]; if (L < 1) return [];
  const at = s => { let i = 1; while (i < S.length - 1 && S[i] < s) i++; const a = points[i - 1], b = points[i], seg = Math.max(1e-6, S[i] - S[i - 1]), t = clamp((s - S[i - 1]) / seg, 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const n = Math.max(1, Math.ceil(L / 6)), piece = L / n, out = [];
  for (let k = 0; k < n; k++) {
    const A = at(k * piece), B = at((k + 1) * piece), dx = B[0] - A[0], dz = B[1] - A[1];
    out.push(design('pier', (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, Math.atan2(dx, dz), {
      w: width, d: Math.hypot(dx, dz) + 0.3, wealth, var: k === n - 1 ? 1 : 0, region: spec.region | 0, seed: hash32(seed, k + 1)
    }));
  }
  return out;
}

// ---- renderer --------------------------------------------------------------------------------------------
const TS = 4096, NT = 4;                          // 4×4 tiles of 4 km
const TILE_R = Math.SQRT2 * 2048 + 700;
let inited = false, group = null, mats = null, dmats = null;
const tiles = [];
let live = 0;
const sinkQ = [];
const emitRecs = new Set();
let emitDirty = true;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function tileIndex(x, z) { return clamp(Math.floor(z / TS), 0, NT - 1) * NT + clamp(Math.floor(x / TS), 0, NT - 1); }
let GEN = 1;                                        // globally unique tile generations (a stale rec._gen never matches another tile)
// full tile rebuilds share a per-frame budget (the first always runs); a mass restamp spreads over frames and the
// round-robin start keeps any tile from starving. A stale full tile keeps drawing its last good buffers meanwhile.
const RB_MS = 6;
let rbNext = 0;
const nowMs = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();
function newTile(i) { return { i, recs: new Set(), meshes: new Array(NG), full: false, last: -1, gen: ++GEN, cy: 0, hasY: false }; }
function createMesh(T, gi, cap) {
  const G = GEO_LIST[gi], base = G.geo;
  const g = new THREE.BufferGeometry();
  for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  if (base.index) g.setIndex(base.index);
  const mk = (n, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iP = mk(cap, 4), iP2 = mk(cap, 4), iA = mk(cap, 4), iL = mk(cap, 4);   // iLife: die, year, cap, skeleton end
  g.setAttribute('iParams', iP); g.setAttribute('iParams2', iP2); g.setAttribute('iAnim', iA); g.setAttribute('iLife', iL);
  const cx = (T.i % NT + 0.5) * TS, cz = (Math.floor(T.i / NT) + 0.5) * TS;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, T.cy, cz), TILE_R);
  const im = new THREE.InstancedMesh(g, mats[G.mat], cap);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);   // set before first render
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.count = 0; im.visible = false;
  im.frustumCulled = true;
  im.castShadow = !G.detail; im.receiveShadow = true;
  im.customDepthMaterial = dmats[G.mat];
  im.matrixAutoUpdate = false;
  group.add(im);
  // own/ownK: which record part sits in each slot (lets removals swap the last instance in instead of a tile rebuild)
  return { mesh: im, geo: g, gi, cap, count: 0, iP, iP2, iA, iL, r0: Infinity, r1: -1, own: new Array(cap).fill(null), ownK: new Int32Array(cap) };
}
// The per-tile geometry shares the base position/normal/... buffers: detach those first, then dispose, so only this
// tile's own instanced attributes (and its VAO states) are freed. (r137 cannot free instanceMatrix/instanceColor.)
function disposeMesh(M) {
  group.remove(M.mesh);
  const base = GEO_LIST[M.gi].geo;
  for (const k in base.attributes) M.geo.deleteAttribute(k);
  M.geo.dispose();
  M.mesh.dispose();
}
function ensureParts(rec) {
  const pk = (rec.y !== undefined ? rec.y : 0) - (rec.y0 !== undefined ? rec.y0 : (rec.y || 0) - 1.5);
  if (!rec._parts || rec._pk !== pk) {
    const R = recipe(rec);
    rec._parts = R.parts; rec._smoke = R.smoke; rec._lights = R.lights; rec._pk = pk;
    rec._slots = new Int32Array(R.parts.length / PSTR); rec._gen = 0;
    const K = partTops(R.parts); rec._eav = K.eav; rec._rdg = K.rdg; rec._top = K.top;
  }
  return rec._parts;
}
// construction knots (heights above rec.y): _eav = top of the highest main WALL body (bodies ≥ 25% of the largest
// footprint, so towers and chimneys don't count), _rdg = the same over roofs (≥ eav), _top = everything
function partTops(parts) {
  let aW = 0, aR = 0, eav = 0, rdg = 0, top = 0;
  for (let o = 0; o < parts.length; o += PSTR) {
    const G = GEO_LIST[parts[o]], a = parts[o + 4] * parts[o + 6];
    if (G.mat === MAT.WALL && SCAF_BODY.has(G.name)) aW = Math.max(aW, a); else if (G.mat === MAT.ROOF) aR = Math.max(aR, a);
  }
  for (let o = 0; o < parts.length; o += PSTR) {
    const G = GEO_LIST[parts[o]], a = parts[o + 4] * parts[o + 6], rx = parts[o + 8];
    const t = parts[o + 2] + parts[o + 5] + (rx ? parts[o + 6] * Math.abs(Math.sin(rx)) : 0);
    if (t > top) top = t;
    if (G.mat === MAT.WALL && SCAF_BODY.has(G.name) && a >= aW * 0.25 && t > eav) eav = t;
    if (G.mat === MAT.ROOF && a >= aR * 0.25 && t > rdg) rdg = t;
  }
  rdg = Math.max(rdg, eav); top = Math.max(top, rdg);
  return { eav, rdg, top };
}
// cap height above rec.y at build progress p: pegs (≤ .04) → footings 1.5 m (.10) → eaves (.75) → ridge (.85) → top (1)
const CAP_X = [0, 0.04, 0.10, 0.75, 0.85, 1];
function capKnots(p, eav, rdg, top) {
  const Y = [-0.2, -0.2, 1.5, eav, rdg, top + 0.5];
  for (let i = 1; i < Y.length; i++) if (Y[i] < Y[i - 1]) Y[i] = Y[i - 1];
  p = clamp(p, 0, 1);
  let i = 1; while (i < CAP_X.length - 1 && p > CAP_X[i]) i++;
  const t = (p - CAP_X[i - 1]) / (CAP_X[i] - CAP_X[i - 1]);
  return Y[i - 1] + (Y[i] - Y[i - 1]) * clamp(t, 0, 1);
}
function capFor(rec, prog) {
  if (prog === undefined || prog === null || !isFinite(prog)) return 1e7;
  if (rec._top === undefined) ensureParts(rec);
  return (rec.y || 0) + capKnots(prog, rec._eav || 0, rec._rdg || 0, rec._top || 0);
}
// iLife.z: a worksite follows its target's cap (or a bridge pier top given as _cap); complete = 1e7
function capOf(rec) {
  if (rec._cap !== undefined) return rec._cap;
  if (rec.prog === undefined) return 1e7;
  return capFor(rec.kind === 'worksite' && rec.target ? rec.target : rec, rec.prog);
}
function writePart(M, slot, rec, P, k) {
  const o = k * PSTR;
  const lx = P[o + 1], ly = P[o + 2], lz = P[o + 3], sx = P[o + 4], sy = P[o + 5], sz = P[o + 6];
  const ry = rec.rot + P[o + 7], rx = P[o + 8], rz = P[o + 9];
  const c = Math.cos(rec.rot), s = Math.sin(rec.rot);
  const y = rec.y || 0, y0 = rec.y0 !== undefined ? rec.y0 : y - 1.5;
  const wx = rec.x + lx * c + lz * s, wy = y + ly, wz = rec.z - lx * s + lz * c;
  const e = M.mesh.instanceMatrix.array, b = slot * 16;
  if (rx === 0 && rz === 0) {
    const cr = Math.cos(ry), sr = Math.sin(ry);
    e[b] = cr * sx; e[b + 1] = 0; e[b + 2] = -sr * sx; e[b + 3] = 0;
    e[b + 4] = 0; e[b + 5] = sy; e[b + 6] = 0; e[b + 7] = 0;
    e[b + 8] = sr * sz; e[b + 9] = 0; e[b + 10] = cr * sz; e[b + 11] = 0;
    e[b + 12] = wx; e[b + 13] = wy; e[b + 14] = wz; e[b + 15] = 1;
  } else {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(wx, wy, wz); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s); _m.toArray(e, b);
  }
  const ca = M.mesh.instanceColor.array; ca[slot * 3] = P[o + 10]; ca[slot * 3 + 1] = P[o + 11]; ca[slot * 3 + 2] = P[o + 12];
  const a = M.iP.array; a[slot * 4] = P[o + 13]; a[slot * 4 + 1] = ((rec.seed >>> 0) + k * 31) % 997; a[slot * 4 + 2] = P[o + 14]; a[slot * 4 + 3] = P[o + 15];
  const a2 = M.iP2.array; a2[slot * 4] = rec.wealth || 0; a2[slot * 4 + 1] = rec.age || 0; a2[slot * 4 + 2] = P[o + 16]; a2[slot * 4 + 3] = P[o + 17];
  const a3 = M.iA.array; a3[slot * 4] = (rec.born !== undefined ? rec.born : -100) + P[o + 18]; a3[slot * 4 + 1] = Math.max(y0, wy); a3[slot * 4 + 2] = P[o + 19]; a3[slot * 4 + 3] = P[o + 20];
  lifeOf(rec, M.iL.array, slot * 4);
  if (rec._stag && rec.die) M.iL.array[slot * 4] = stagDie(rec, P, k);
  M.own[slot] = rec; M.ownK[slot] = k;
}
// iLife from rec fields only (die clock, built year, construction cap, skeleton-stage end), so tile rebuilds and
// swaps reproduce the state exactly
function lifeOf(rec, a, i) {
  a[i] = rec.die || 0;
  a[i + 1] = rec.year > 0 ? rec.year : 0;
  a[i + 2] = capOf(rec);
  a[i + 3] = rec._fe > 0 ? rec._fe : 0;
}
// staggered sink (remove(rec, true, {stagger})): the highest parts go first, the lowest `stagger` s later
function stagDie(rec, P, k) {
  const o = k * PSTR, top = rec._top > 0 ? rec._top : 1;
  return rec.die + rec._stag * (1 - clamp((P[o + 2] + P[o + 5]) / top, 0, 1));
}
// move the instance in slot a into slot b (all attributes + ownership)
function copySlot(M, a, b) {
  M.mesh.instanceMatrix.array.copyWithin(b * 16, a * 16, a * 16 + 16);
  M.mesh.instanceColor.array.copyWithin(b * 3, a * 3, a * 3 + 3);
  M.iP.array.copyWithin(b * 4, a * 4, a * 4 + 4);
  M.iP2.array.copyWithin(b * 4, a * 4, a * 4 + 4);
  M.iA.array.copyWithin(b * 4, a * 4, a * 4 + 4);
  M.iL.array.copyWithin(b * 4, a * 4, a * 4 + 4);
  const o = M.own[a], k = M.ownK[a];
  M.own[b] = o; M.ownK[b] = k;
  if (o && o._slots) o._slots[k] = b;
}
// O(parts) removal: fill each freed slot with the mesh's last instance. false → caller falls back to a tile rebuild.
function swapRemove(T, rec) {
  if (T.full || rec._gen !== T.gen || !rec._parts || !rec._slots) return false;
  const P = rec._parts, slots = rec._slots;
  for (let k = 0, o = 0; o < P.length; k++, o += PSTR) {
    const M = T.meshes[P[o]], s = slots[k];
    if (!M || s >= M.count || M.own[s] !== rec || M.ownK[s] !== k) return false;
  }
  for (let k = 0, o = 0; o < P.length; k++, o += PSTR) {
    const M = T.meshes[P[o]], s = slots[k], last = M.count - 1;
    if (s !== last) copySlot(M, last, s);
    M.own[last] = null; M.count = last;
    markRange(M, s < last ? s : last);     // also makes the next flush publish the smaller count
  }
  rec._gen = 0;
  return true;
}
function markRange(M, slot) { if (slot < M.r0) M.r0 = slot; if (slot > M.r1) M.r1 = slot; }
function flushRange(M) {
  if (M.r1 < M.r0) return;
  const off = M.r0, cnt = M.r1 - M.r0 + 1;
  const set = (attr, s) => { attr.updateRange.offset = off * s; attr.updateRange.count = cnt * s; attr.needsUpdate = true; };
  set(M.mesh.instanceMatrix, 16); set(M.mesh.instanceColor, 3); set(M.iP, 4); set(M.iP2, 4); set(M.iA, 4); set(M.iL, 4);
  M.mesh.count = M.count; M.mesh.visible = M.count > 0;
  M.r0 = Infinity; M.r1 = -1;
}
function rebuildTile(T) {
  T.gen = ++GEN; T.full = false; T.last = Kit.clock;
  const cnt = new Int32Array(NG);
  let sy = 0, ny = 0;
  for (const rec of T.recs) {
    const P = ensureParts(rec);
    for (let o = 0; o < P.length; o += PSTR) cnt[P[o]]++;
    sy += rec.y || 0; ny++;
  }
  if (ny) { T.cy = sy / ny; T.hasY = true; }
  for (let gi = 0; gi < NG; gi++) {
    let M = T.meshes[gi];
    if (cnt[gi] > 0 && (!M || M.cap < cnt[gi])) {
      let cap = 64; while (cap < cnt[gi] * 1.25) cap *= 2;
      if (M) disposeMesh(M);
      M = T.meshes[gi] = createMesh(T, gi, cap);
    }
    if (M) { M.count = 0; M.geo.boundingSphere.center.y = T.cy; }
  }
  for (const rec of T.recs) {
    const P = rec._parts, slots = rec._slots;
    for (let k = 0, o = 0; o < P.length; k++, o += PSTR) {
      const M = T.meshes[P[o]], slot = M.count++;
      writePart(M, slot, rec, P, k); slots[k] = slot;
    }
    rec._gen = T.gen;
  }
  for (let gi = 0; gi < NG; gi++) {
    const M = T.meshes[gi]; if (!M) continue;
    M.own.fill(null, M.count);
    for (const a of [M.mesh.instanceMatrix, M.mesh.instanceColor, M.iP, M.iP2, M.iA, M.iL]) { a.updateRange.offset = 0; a.updateRange.count = -1; a.needsUpdate = true; }
    M.mesh.count = M.count; M.mesh.visible = M.count > 0; M.r0 = Infinity; M.r1 = -1;
  }
}
function appendRec(T, rec) {
  if (T.full) return false;
  const P = ensureParts(rec);
  const need = new Map();
  for (let o = 0; o < P.length; o += PSTR) need.set(P[o], (need.get(P[o]) || 0) + 1);
  for (const [gi, n] of need) { const M = T.meshes[gi]; if (!M || M.count + n > M.cap) return false; }
  const slots = rec._slots;
  for (let k = 0, o = 0; o < P.length; k++, o += PSTR) {
    const M = T.meshes[P[o]], slot = M.count++;
    writePart(M, slot, rec, P, k); slots[k] = slot; markRange(M, slot);
  }
  rec._gen = T.gen;
  if (!T.hasY) { T.cy = rec.y || 0; T.hasY = true; for (const M of T.meshes) if (M) M.geo.boundingSphere.center.y = T.cy; }
  return true;
}
// rewrite iLife (die / year / cap / skeleton end) over the record's slots; a stale record → tile rebuild
function writeLife(T, rec) {
  if (rec._gen !== T.gen || !rec._parts) { T.full = true; return; }
  const P = rec._parts, slots = rec._slots, tmp = _life;
  lifeOf(rec, tmp, 0);
  const stag = rec._stag && rec.die;
  for (let k = 0, o = 0; o < P.length; k++, o += PSTR) {
    const M = T.meshes[P[o]]; if (!M) { T.full = true; return; }
    const a = M.iL.array, i = slots[k] * 4;
    a[i] = stag ? stagDie(rec, P, k) : tmp[0]; a[i + 1] = tmp[1]; a[i + 2] = tmp[2]; a[i + 3] = tmp[3];
    markRange(M, slots[k]);
  }
}
const _life = new Float32Array(4);
function writeDie(T, rec) { writeLife(T, rec); }

// ---- smoke --------------------------------------------------------------------------------------------------
const SMOKE_PER = 12, SMOKE_MAX = 400;
let smoke = null, smokeU = null, smokeCam = new THREE.Vector3(1e9, 0, 0), smokeT = 0;
function buildSmoke(scene) {
  smokeU = { uT: { value: 0 }, uCol: { value: new THREE.Color(0.8, 0.8, 0.82) }, uWindS: { value: new THREE.Vector2(0.9, 0.4) }, uScale: { value: 800 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: smokeU, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 seed; attribute vec2 kb; uniform float uT; uniform vec2 uWindS; uniform float uScale; varying float vA; varying float vK;
      void main(){
        float k = kb.x;
        float spd = (0.07 + seed.x * 0.05) * ((k > 1.5 && k < 2.5) ? 1.3 : 1.0);
        float life = fract(uT * spd + seed.y);
        float rise = k < 0.5 ? 12.0 : k < 1.5 ? 20.0 : k < 2.5 ? 28.0 : 9.0;
        vec3 p = position + vec3(uWindS.x * life * rise * 0.9 + (seed.z - 0.5) * life * rise * 0.35, life * rise, uWindS.y * life * rise * 0.9 + (seed.w - 0.5) * life * rise * 0.35);
        vA = (1.0 - life) * smoothstep(0.0, 0.1, life) * step(kb.y, uT) * (k > 2.5 ? 0.55 : (k > 1.5 ? 1.25 : 1.0));
        vK = k;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = ((k > 1.5 && k < 2.5) ? 2.4 : 1.6) * (0.35 + life * 1.6);
        gl_PointSize = clamp(sz * uScale / max(-mv.z, 1.0), 1.0, 90.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; varying float vK;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        vec3 col = (vK > 1.5 && vK < 2.5) ? uCol * 0.45 : uCol;
        float g = exp(-d * 9.0);
        gl_FragColor = vec4(col, vA * 0.26 * g); }`
  });
  smoke = new THREE.Points(new THREE.BufferGeometry(), mat);
  smoke.frustumCulled = false; smoke.renderOrder = 3;
  scene.add(smoke);
}
function rebuildSmoke(cam) {
  const winter = D.TU && D.TU.uSeason ? D.TU.uSeason.value.w : 0, day = D.Env ? D.Env.day : 1;
  const frac = 0.22 + 0.4 * winter + 0.25 * (1 - day);
  const R2 = 1800 * 1800, list = [];
  for (const rec of emitRecs) {
    if (rec.die || (rec.prog !== undefined && rec.prog < 1) || !rec._smoke || !rec._smoke.length) continue;   // no smoke from a building site
    const dx0 = rec.x - cam.x, dz0 = rec.z - cam.z; if (dx0 * dx0 + dz0 * dz0 > R2 * 1.1) continue;
    const c = Math.cos(rec.rot), s = Math.sin(rec.rot);
    for (let i = 0; i < rec._smoke.length; i++) {
      const e = rec._smoke[i];
      if (D.hash2((rec.seed >>> 0) % 100000 + i * 7, 13) > frac) continue;
      const x = rec.x + e[0] * c + e[2] * s, z = rec.z - e[0] * s + e[2] * c, y = (rec.y || 0) + e[1];
      const d2 = (x - cam.x) * (x - cam.x) + (z - cam.z) * (z - cam.z);
      if (d2 < R2) list.push([d2, x, y, z, e[3], (rec.born !== undefined ? rec.born : -100) + (e[4] || 2) + 0.6]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  const n = Math.min(SMOKE_MAX, list.length);
  const pos = new Float32Array(n * SMOKE_PER * 3), seed = new Float32Array(n * SMOKE_PER * 4), kb = new Float32Array(n * SMOKE_PER * 2);
  for (let i = 0; i < n; i++) {
    const L = list[i], r = D.rng(hash32(Math.round(L[1] * 10), Math.round(L[3] * 10)));
    for (let k = 0; k < SMOKE_PER; k++) {
      const o = i * SMOKE_PER + k;
      pos[o * 3] = L[1]; pos[o * 3 + 1] = L[2]; pos[o * 3 + 2] = L[3];
      seed[o * 4] = r(); seed[o * 4 + 1] = (k + r() * 0.8) / SMOKE_PER; seed[o * 4 + 2] = r(); seed[o * 4 + 3] = r();
      kb[o * 2] = L[4]; kb[o * 2 + 1] = L[5];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('kb', new THREE.BufferAttribute(kb, 2));
  smoke.geometry.dispose(); smoke.geometry = g;
}

// ---- light pools ------------------------------------------------------------------------------------------------
const POOL_MAX = 4096;
let pools = null, poolU = null;
function buildPools(scene) {
  poolU = { uNightC: CU.uNightC, uClock: CU.uClock };
  const mat = new THREE.ShaderMaterial({
    uniforms: poolU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: `uniform float uClock; varying vec2 vP; varying float vF;
      void main(){ vP = position.xz * 2.0; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vF = 0.88 + 0.12 * sin(uClock * 8.0 + wp.x * 0.37 + wp.z * 0.21);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uNightC; varying vec2 vP; varying float vF;
      void main(){ float r = length(vP); float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * a * uNightC * 0.55 * vF, 1.0); }`
  });
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-HALF_PI);
  pools = new THREE.InstancedMesh(g, mat, POOL_MAX);
  pools.count = 0; pools.frustumCulled = false; pools.renderOrder = 2; pools.matrixAutoUpdate = false;
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pools);
}
function rebuildPools(cam) {
  const list = [];
  for (const rec of emitRecs) {
    if (rec.die || (rec.prog !== undefined && rec.prog < 1) || !rec._lights || !rec._lights.length) continue;
    const dx0 = rec.x - cam.x, dz0 = rec.z - cam.z; if (dx0 * dx0 + dz0 * dz0 > 2500 * 2500) continue;
    const c = Math.cos(rec.rot), s = Math.sin(rec.rot);
    for (const e of rec._lights) {
      const x = rec.x + e[0] * c + e[2] * s, z = rec.z - e[0] * s + e[2] * c;
      list.push([(x - cam.x) * (x - cam.x) + (z - cam.z) * (z - cam.z), x, (rec.y || 0) + e[4] + 0.25, z, e[3]]);
    }
  }
  if (list.length > POOL_MAX) list.sort((a, b) => a[0] - b[0]);
  const n = Math.min(POOL_MAX, list.length), a = pools.instanceMatrix.array;
  for (let i = 0; i < n; i++) {
    const L = list[i], sc = L[4] * 2, b = i * 16;
    a[b] = sc; a[b + 1] = 0; a[b + 2] = 0; a[b + 3] = 0; a[b + 4] = 0; a[b + 5] = 1; a[b + 6] = 0; a[b + 7] = 0;
    a[b + 8] = 0; a[b + 9] = 0; a[b + 10] = sc; a[b + 11] = 0; a[b + 12] = L[1]; a[b + 13] = L[2]; a[b + 14] = L[3]; a[b + 15] = 1;
  }
  pools.count = n; pools.instanceMatrix.needsUpdate = true;
}

// ---- ghost -------------------------------------------------------------------------------------------------------
let ghost = null, ghostMat = null;
const ghostPool = [];
function showGhost(rec, ok) {
  if (!inited) return;
  if (!ghost) {
    ghost = new THREE.Group(); ghost.renderOrder = 22;
    ghostMat = new THREE.MeshBasicMaterial({ color: 0x31a8ff, transparent: true, opacity: 0.55, depthWrite: false });
    (D.scene || group.parent).add(ghost);
  }
  if (!rec) { ghost.visible = false; return; }
  ghostMat.color.setHex(ok === false ? 0xff5040 : 0x31a8ff);
  const r2 = Object.assign({}, rec);
  if (r2.y === undefined) r2.y = hAtSafe(rec.x, rec.z);
  if (r2.y0 === undefined) r2.y0 = r2.y - 1.5;
  const R = recipe(r2), P = R.parts, n = P.length / PSTR;
  const c = Math.cos(r2.rot), s = Math.sin(r2.rot);
  for (let k = 0; k < n; k++) {
    let m = ghostPool[k];
    if (!m) { m = ghostPool[k] = new THREE.Mesh(GEO_LIST[0].geo, ghostMat); m.matrixAutoUpdate = false; m.renderOrder = 22; m.frustumCulled = false; }
    const o = k * PSTR, lx = P[o + 1], ly = P[o + 2], lz = P[o + 3];
    m.geometry = GEO_LIST[P[o]].geo;
    _e.set(P[o + 8], r2.rot + P[o + 7], P[o + 9], 'YXZ'); _q.setFromEuler(_e);
    _p.set(r2.x + lx * c + lz * s, r2.y + ly, r2.z - lx * s + lz * c); _s.set(P[o + 4], P[o + 5], P[o + 6]);
    m.matrix.compose(_p, _q, _s); m.matrixWorldNeedsUpdate = true;
    if (m.parent !== ghost) ghost.add(m);
  }
  for (let k = n; k < ghostPool.length; k++) if (ghostPool[k].parent) ghost.remove(ghostPool[k]);
  ghost.visible = true;
}

// ---- public API ------------------------------------------------------------------------------------------------------
const Kit = D.Kit = {
  clock: 0,
  KINDS, REGIONS: ['wealden', 'cotswold', 'northern', 'fenland', 'hanse'], FLAGS: F, CU,
  WALL_STYLES: WALL_NAMES, ROOF_STYLES: ROOF_NAMES, TRADES,
  get _inited() { return inited; },   // town.js checks this before calling init again
  init(scene) {
    if (inited) return;
    inited = true;
    buildGeos();
    const M = makeMaterials(); mats = M.mats; dmats = M.dmats;
    group = new THREE.Group(); group.name = 'kit'; group.matrixAutoUpdate = false;
    scene.add(group);
    for (let i = 0; i < NT * NT; i++) tiles.push(newTile(i));
    buildSmoke(scene);
    buildPools(scene);
  },
  update(dt, camera) {
    if (!inited) return;
    dt = Math.min(dt || 0, 0.25);
    Kit.clock += dt;
    const E = D.Env || {};
    CU.uClock.value = Kit.clock;
    CU.uNightC.value = E.night || 0;
    CU.uSnowC.value = D.TU && D.TU.uSnow ? D.TU.uSnow.value : 0;
    CU.uWindK.value = E.wind !== undefined ? E.wind : 0.5;
    CU.uSpin.value = (CU.uSpin.value + dt * (0.35 + CU.uWindK.value * 1.3 + (E.weather === 'storm' ? 0.8 : 0))) % 62831.853;
    const t = E.time !== undefined ? E.time : 12;
    CU.uLateC.value = t >= 22 ? D.smooth(22, 23.5, t) : t < 4.5 ? 1 : t < 6 ? 1 - D.smooth(4.5, 6, t) : 0;
    // Living History: weathering clock and the replay filter (no story → 0 / live, i.e. the legacy look)
    const S = D.Story;
    const yr = S && S.started && typeof S.displayTime === 'function' ? +S.displayTime() : 0;
    CU.uYear.value = isFinite(yr) && yr > 0 ? yr : 0;
    const vy = S && S.replaying ? S.viewYear : null;
    CU.uView.value = typeof vy === 'number' && isFinite(vy) ? vy : 1e6;
    const ag = (TUNE.kit && TUNE.kit.age) || {};
    CU.uAgeT.value.set(ag.thatch || 35, ag.limewash || 60, ag.stone || 160, ag.lichen || 180); CU.uAgeIvy.value = ag.ivy || 220;
    // finish sinks
    if (sinkQ.length) {
      let j = 0;
      for (let i = 0; i < sinkQ.length; i++) {
        const q = sinkQ[i];
        if (Kit.clock < q.t) { sinkQ[j++] = q; continue; }
        const T = tiles[q.rec._tile];
        if (T && T.recs.has(q.rec) && q.rec.die && q.rec.die === q.die) {
          T.recs.delete(q.rec);
          if (!swapRemove(T, q.rec)) T.full = true;
          emitRecs.delete(q.rec); emitDirty = true;
        }
      }
      sinkQ.length = j;
    }
    // flush tiles: full rebuilds throttled to ≥ 80 ms per tile and to RB_MS per frame, appends every frame
    const nT = tiles.length, t0 = nowMs();
    let rb = 0, last = -1;
    for (let j = 0; j < nT; j++) {
      const i = (rbNext + j) % nT, T = tiles[i];
      if (T.full) {
        if (Kit.clock - T.last >= 0.08 && (rb === 0 || nowMs() - t0 < RB_MS)) { rebuildTile(T); rb++; last = i; }
      } else for (const M of T.meshes) if (M && M.r1 >= M.r0) flushRange(M);
    }
    if (last >= 0) rbNext = (last + 1) % nT;   // next frame starts after the last tile rebuilt
    // smoke and light pools follow the camera
    if (camera) {
      const cp = camera.position;
      smokeT -= dt;
      // records changed (at most every 0.5 s), camera moved > 200 m, or a slow refresh for season / daylight
      if ((emitDirty && smokeT <= 4.5) || smokeT <= 0 || smokeCam.distanceToSquared(cp) > 200 * 200) {
        rebuildSmoke(cp); rebuildPools(cp);
        smokeCam.copy(cp); emitDirty = false; smokeT = 5;
      }
      if (D.renderer && camera.isPerspectiveCamera) {
        const h = D.renderer.getContext().drawingBufferHeight || 800;
        smokeU.uScale.value = h / (2 * Math.tan(camera.fov * PI / 360));
      }
    }
    smokeU.uT.value = Kit.clock;
    const l = 0.3 + 0.6 * (E.day !== undefined ? E.day : 1);
    smokeU.uCol.value.setRGB(l * 0.5, l * 0.51, l * 0.55);   // soft blue-grey, never a white ball
    const w = 0.5 + (E.wind !== undefined ? E.wind : 0.5);
    smokeU.uWindS.value.set(0.9 * w, 0.4 * w);
    smoke.visible = group.visible && smoke.geometry.attributes.position !== undefined && !(D.Atlas && D.Atlas.k > 0.5);
    pools.visible = group.visible && CU.uNightC.value > 0.02 && pools.count > 0;
    if (ghost && ghost.visible) ghostMat.opacity = 0.5 + 0.12 * Math.sin(Kit.clock * 5);
  },
  design(kind, x, z, rot, opts) { return design(kind, x, z, rot, opts); },
  add(rec) {
    if (!inited || !rec) return;
    const ti = tileIndex(rec.x, rec.z), T = tiles[ti];
    if (rec._tile !== undefined && rec._tile !== ti && tiles[rec._tile] && tiles[rec._tile].recs.has(rec)) {   // moved to another tile
      const O = tiles[rec._tile];
      O.recs.delete(rec);
      if (!swapRemove(O, rec)) O.full = true;
      if (!rec.die) live--;
    }
    if (T.recs.has(rec)) {           // re-added while sinking: revive
      if (rec.die) { rec.die = 0; rec._stag = 0; live++; writeDie(T, rec); emitDirty = true; }
      return;
    }
    rec.die = 0; rec._tile = ti; rec._gen = 0;
    T.recs.add(rec); live++;
    try { ensureParts(rec); if (!appendRec(T, rec)) T.full = true; } catch (e) { console.warn('[kit] add failed', rec.kind, e); T.full = true; }
    if ((rec._smoke && rec._smoke.length) || (rec._lights && rec._lights.length)) { emitRecs.add(rec); emitDirty = true; }
  },
  // opts.stagger (s): the sink runs top-first over that long (the scaffolding comes down)
  remove(rec, sink, opts) {
    if (!inited || !rec || rec._tile === undefined) return;
    const T = tiles[rec._tile];
    if (!T || !T.recs.has(rec)) return;
    if (sink) {
      if (rec.die) return;
      rec.die = Kit.clock > 0 ? Kit.clock : 1e-3;
      rec._stag = opts && opts.stagger > 0 ? +opts.stagger : 0;
      live--;
      writeDie(T, rec);
      sinkQ.push({ rec, t: Kit.clock + 0.9 + rec._stag, die: rec.die });
      emitDirty = true;
    } else {
      T.recs.delete(rec);
      if (!swapRemove(T, rec)) T.full = true;
      if (!rec.die) live--;
      emitRecs.delete(rec); emitDirty = true;
    }
  },
  reseat(rec) {
    if (!rec) return;
    rec._parts = null;
    if (rec._tile !== undefined && tiles[rec._tile] && tiles[rec._tile].recs.has(rec)) {
      tiles[rec._tile].full = true;
      ensureParts(rec);
      if ((rec._smoke && rec._smoke.length) || (rec._lights && rec._lights.length)) emitRecs.add(rec); else emitRecs.delete(rec);
      emitDirty = true;
    }
  },
  clear() {
    for (const T of tiles) { T.recs.clear(); T.full = false; for (const M of T.meshes) if (M) { M.count = 0; M.mesh.count = 0; M.mesh.visible = false; M.r0 = Infinity; M.r1 = -1; M.own.fill(null); } T.gen = ++GEN; }
    sinkQ.length = 0; emitRecs.clear(); emitDirty = true; live = 0;
  },
  // ---- Living History --------------------------------------------------------------------------------
  FRAME_T: 2.2, F,
  // construction progress: undefined = complete, else 0..1 (fast iLife rewrite; a stale record rebuilds its tile)
  setBuild(rec, prog) {
    if (!rec) return;
    const was = rec.prog;
    if (prog === undefined || prog === null || !isFinite(prog)) delete rec.prog; else rec.prog = clamp(+prog, 0, 1);
    const done = p => p === undefined || p >= 1;
    if (done(was) !== done(rec.prog)) emitDirty = true;   // smoke / light pools skip building sites
    if (!inited || rec._tile === undefined) return;
    const T = tiles[rec._tile]; if (!T || !T.recs.has(rec)) return;
    writeLife(T, rec);
  },
  // built year (0 / falsy = unknown); a 0 <-> dated flip re-derives the parts only where the roof colour depends
  // on it (old thatch), everything else is a fast iLife rewrite
  setYear(rec, y) {
    if (!rec) return;
    const ny = y > 0 && isFinite(y) ? +y : 0, flip = (rec.year > 0) !== (ny > 0);
    if (ny > 0) rec.year = ny; else delete rec.year;
    if (!inited || rec._tile === undefined) return;
    const T = tiles[rec._tile]; if (!T || !T.recs.has(rec)) return;
    // flip on an old-thatch roof: drop the parts and let the (frame-budgeted) tile rebuild run the recipe, so a
    // begin-commit prehistory stamp over thousands of records never runs recipes synchronously
    if (flip && rec._tho !== false) { rec._parts = null; T.full = true; } else writeLife(T, rec);
  },
  capFor(rec, prog) { return capFor(rec, prog); },
  has(rec) { return !!(inited && rec && rec._tile !== undefined && tiles[rec._tile] && tiles[rec._tile].recs.has(rec) && !rec.die); },
  topOf(rec) { if (!rec) return null; ensureParts(rec); return { top: rec._top, eav: rec._eav, rdg: rec._rdg }; },
  setVisible(v) { if (group) group.visible = !!v; if (smoke) smoke.visible = !!v; if (pools && !v) pools.visible = false; },
  count() { return live; },
  wallRun, pierRun,
  showGhost,
  catalogue() { return CATALOGUE.map(k => ({ kind: k, name: KINDS[k].name, emoji: KINDS[k].emoji })); },
  // internal helpers exposed for debugging / tests
  _recipe: recipe, _geos: GEO_LIST, _tiles: tiles, _mats() { return { mats, dmats }; },
  _pure: { capKnots, partTops, lifeOf, capFor, CAP_X }
};
})();
