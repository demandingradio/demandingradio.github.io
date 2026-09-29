/* Diorama — life: horse carts and ox wagons (keep left) and riders on the roads,
   walkers on roads and on settlement lanes (monks in monasteries, guards in castles,
   loads by day, torches by night), cogs, fishing and rowing boats on the water
   (some sailing out from harbour piers and back), and wheeling bird flocks.
   Legs swing and wheels turn in the vertex shader (per-vertex aAnim tags +
   per-instance iAnim: rate, phase, amplitude). */
(function () {
'use strict';
const D = window.D;
const { SIZE } = D;

const Life = D.Life = { carts: [], riders: [], peds: [], nav: [], boats: [], birds: [] };
Life.cars = Life.carts; // legacy alias

// ---- palettes -------------------------------------------------------------------
const CLOTH = [0x6b4a2e, 0x4a5a3a, 0x7a2f25, 0x3f526a, 0xb8a47a, 0x5e4a36, 0x8a7a5a, 0xe0d8c0];
const MONK = [0x3a2e24, 0x2a2622, 0x5a4a38, 0xd8d0c0];
const HERALD = [0xb82a24, 0x1f3f8a, 0xd8a820, 0x1e6a3a];
const CART_WOOD = [0x8a6a44, 0x7a5c3a, 0x9c7a50, 0x6e5a44];
const CANVAS = [0xe6dcc0, 0xd8c8a0, 0xc8b890, 0xb89a70, 0xe0d0b0, 0x9a5a3a];
const HULL = [0x3a5a7a, 0x8a3a2a, 0x3e5e3a, 0xd8d0c0, 0x2e2824, 0x6a5a44];
const COG_SAIL = [0xe8e0cc, 0xd8c8a0, 0xb84a34, 0xc8a050];
// shader palettes (picked per instance from its phase): animal coats and secondary cloth
const COAT = [0x5a3218, 0x7a4424, 0x8e8a84, 0x2a2420, 0xa08058];
const CLOTH2 = [0xc8a860, 0x5a4030, 0x8a3024, 0x3a4a6a, 0xe8e2d0, 0x4a5e36];
const WHITE = 0xffffff, SKIN = 0xd8a888, HOSE = 0x3a3026, SHOE = 0x2a2018, WOOD = 0x6a5238, DARKW = 0x4a3a2a, IRON = 0x3a3634;
const pick = a => a[Math.floor(Math.random() * a.length)];
const linCache = new Map();
const lin = hex => { let c = linCache.get(hex); if (!c) { c = D.lin(hex); linCache.set(hex, c); } return c; };

// ---- geometry builder ------------------------------------------------------------
// every part carries: color, tint (colour mode) and aAnim (p0, p1, p2, mode)
//   mode 1 wheel: rotate about x through (y=p0, z=p1), radius p2
//   mode 2 leg:   swing about x through the hip (y=p0, z=p1), phase offset p2
//   mode 3 oar:   sweep about y through (x=p0, z=p1), side sign p2
// tint: 0 fixed, 1 x instance colour, 3 coat, 4 dark coat, 5 secondary cloth, 6 glow
const NOANIM = [0, 0, 0, 0];
function mk(g, col, tint, anim) {
  g = D.colorGeo(g, col, 'tint', tint || 0);
  const n = g.attributes.position.count, a = new Float32Array(n * 4), v = anim || NOANIM;
  for (let i = 0; i < n; i++) { a[i * 4] = v[0]; a[i * 4 + 1] = v[1]; a[i * 4 + 2] = v[2]; a[i * 4 + 3] = v[3]; }
  g.setAttribute('aAnim', new THREE.BufferAttribute(a, 4));
  return g;
}
const _q = new THREE.Quaternion(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
function builder() {
  const P = [];
  const add = (g, col, tint, anim) => { P.push(mk(g, col, tint, anim)); };
  return {
    box(w, h, d, x, y, z, col, tint, anim) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); add(g, col, tint, anim); },
    cyl(rt, rb, h, seg, x, y, z, col, tint, anim) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(x, y + h / 2, z); add(g, col, tint, anim); },
    ball(r, x, y, z, sx, sy, sz, col, tint, anim) { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(sx, sy, sz); g.translate(x, y, z); add(g, col, tint, anim); },
    beam(x0, y0, z0, x1, y1, z1, t, col, tint, anim) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-3;
      const g = new THREE.BoxGeometry(t, L, t); g.translate(0, L / 2, 0);
      _dir.set(dx / L, dy / L, dz / L); _q.setFromUnitVectors(_up, _dir);
      g.applyMatrix4(_m.makeRotationFromQuaternion(_q)); g.translate(x0, y0, z0);
      add(g, col, tint, anim);
    },
    raw(g, col, tint, anim) { add(g, col, tint, anim); },
    // wheel in the local YZ plane with 4 spokes and a hub; turns with anim mode 1
    wheel(x, y, z, r, col) {
      const an = [y, z, r, 1];
      const t = new THREE.TorusGeometry(r, 0.06, 4, 12); t.rotateY(Math.PI / 2); t.translate(x, y, z); add(t, col, 0, an);
      const h = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6); h.rotateZ(Math.PI / 2); h.translate(x, y, z); add(h, DARKW, 0, an);
      for (let k = 0; k < 4; k++) { const s = new THREE.BoxGeometry(0.045, r * 2 - 0.04, 0.06); s.rotateX(k * Math.PI / 4); s.translate(x, y, z); add(s, col, 0, an); }
    },
    done() { const g = D.mergeGeos(P); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
  };
}

// a walking person; front = local -z. o: {torch, back, head, guard, monk}
function human(b, o) {
  o = o || {};
  const leg = ph => [0.8, 0, ph, 2], arm = ph => [1.46, 0, ph, 2];
  if (!o.monk) {
    for (const s of [-1, 1]) {
      const an = leg(s < 0 ? 0 : Math.PI);
      b.cyl(0.075, 0.062, 0.8, 5, s * 0.1, 0.02, 0, HOSE, 0, an);
      b.box(0.12, 0.08, 0.25, s * 0.1, 0, -0.04, SHOE, 0, an);
    }
    b.cyl(0.2, 0.29, 0.66, 7, 0, 0.66, 0, WHITE, 1);                  // tunic skirt
    b.cyl(0.212, 0.212, 0.05, 7, 0, 0.95, 0, 0x3a2a1a, 0);            // belt
  } else {
    for (const s of [-1, 1]) b.box(0.12, 0.08, 0.24, s * 0.1, 0, -0.06, SHOE, 0, leg(s < 0 ? 0 : Math.PI));
    b.cyl(0.19, 0.31, 1.26, 8, 0, 0.08, 0, WHITE, 1);                 // habit to the ground
    b.cyl(0.215, 0.215, 0.04, 7, 0, 0.98, 0, 0xd8c8a0, 0);            // rope girdle
  }
  b.cyl(0.17, 0.2, 0.2, 7, 0, 1.32, 0, WHITE, 1);                     // chest
  b.ball(0.13, 0, 1.66, 0, 1, 1.12, 1, SKIN, 0);                      // head
  const sleeve = o.guard ? 0x8a8e92 : WHITE, sT = o.guard ? 0 : 1;
  // left arm swings; right arm swings unless it holds something
  b.box(0.09, 0.56, 0.1, -0.25, 0.9, 0, sleeve, sT, arm(Math.PI));
  b.box(0.08, 0.09, 0.08, -0.25, 0.82, 0, SKIN, 0, arm(Math.PI));
  if (o.torch) {
    b.beam(0.25, 1.46, 0, 0.27, 1.08, -0.3, 0.09, sleeve, sT);
    b.box(0.08, 0.09, 0.08, 0.27, 1.02, -0.31, SKIN, 0);
    b.beam(0.27, 0.95, -0.33, 0.3, 1.58, -0.42, 0.05, 0x5a4430, 0);
    b.cyl(0.01, 0.1, 0.34, 5, 0.3, 1.56, -0.43, 0xffa040, 6);
    b.cyl(0.005, 0.05, 0.42, 5, 0.3, 1.58, -0.43, 0xffe090, 6);
  } else if (o.guard) {
    b.beam(0.25, 1.46, 0, 0.3, 0.95, -0.08, 0.09, sleeve, sT);
    b.box(0.08, 0.09, 0.08, 0.3, 0.9, -0.1, SKIN, 0);
    b.beam(0.3, 0.05, -0.1, 0.3, 2.45, -0.12, 0.045, WOOD, 0);         // spear
    b.cyl(0.0, 0.05, 0.24, 4, 0.3, 2.45, -0.12, 0x9a9ea2, 0);
    b.box(0.44, 0.55, 0.05, 0, 0.92, 0.24, WHITE, 1);                  // shield on the back
  } else if (o.monk) {
    b.box(0.09, 0.56, 0.1, 0.25, 0.9, 0, WHITE, 1, arm(0));
    b.box(0.08, 0.09, 0.08, 0.25, 0.82, 0, SKIN, 0, arm(0));
  } else {
    b.box(0.09, 0.56, 0.1, 0.25, 0.9, 0, sleeve, sT, arm(0));
    b.box(0.08, 0.09, 0.08, 0.25, 0.82, 0, SKIN, 0, arm(0));
  }
  if (o.guard) {
    b.cyl(0.25, 0.25, 0.03, 8, 0, 1.71, 0, 0x8a8e92, 0);              // kettle hat
    b.ball(0.145, 0, 1.75, 0, 1, 0.75, 1, 0x9a9ea2, 0);
    b.cyl(0.19, 0.2, 0.34, 7, 0, 1.08, 0, WHITE, 1);                   // tabard over the belt
  } else if (o.monk) {
    b.ball(0.16, 0, 1.67, 0.045, 1.05, 1.08, 1.05, WHITE, 1);          // cowl
    b.cyl(0.2, 0.24, 0.1, 7, 0, 1.44, 0, WHITE, 1);
  } else {
    b.ball(0.145, 0, 1.69, 0.03, 1, 1, 1, WHITE, 5);                   // hood / coif
    b.cyl(0.21, 0.27, 0.12, 7, 0, 1.42, 0, WHITE, 5);                  // capelet
  }
  if (o.back) { b.ball(0.22, 0, 1.2, 0.27, 1, 1.25, 0.8, 0xc8b48a, 0); b.beam(-0.12, 1.5, -0.02, -0.1, 1.05, 0.2, 0.03, 0x5a4030, 0); }
  if (o.head) { b.cyl(0.2, 0.15, 0.16, 8, 0, 1.8, 0, 0xa8864a, 0); b.ball(0.15, 0, 1.98, 0, 1, 0.6, 1, 0x7a9a48, 0); }
}
// a seated figure (cart driver, rower); fs = 1 faces -z, -1 faces +z; clothT tint of the clothes
function seated(b, x, y, z, fs, clothT) {
  b.box(0.3, 0.14, 0.42, x, y, z - 0.18 * fs, HOSE, 0);
  b.box(0.26, 0.42, 0.12, x, y - 0.4, z - 0.38 * fs, HOSE, 0);
  b.cyl(0.17, 0.22, 0.58, 7, x, y + 0.02, z, WHITE, clothT);
  b.ball(0.13, x, y + 0.74, z, 1, 1.12, 1, SKIN, 0);
  b.cyl(0.24, 0.24, 0.03, 8, x, y + 0.8, z, 0xc8a860, 0);
  b.cyl(0.12, 0.13, 0.12, 8, x, y + 0.82, z, 0xc8a860, 0);
  for (const s of [-1, 1]) b.beam(x + s * 0.2, y + 0.5, z, x + s * 0.14, y + 0.22, z - 0.34 * fs, 0.08, WHITE, clothT);
}
// a horse (ox=false) or an ox, centred at (x, z), facing -z
function quad(b, x, z, ox) {
  const LEG = ox ? 0.62 : 0.9, r = ox ? 0.46 : 0.35, len = ox ? 1.6 : 1.45, by = LEG + r * 0.85;
  const body = new THREE.CylinderGeometry(r, r * 0.95, len, 8); body.rotateX(Math.PI / 2); body.translate(x, by, z); b.raw(body, WHITE, 3);
  b.ball(r * 1.08, x, by + 0.03, z - len * 0.5, 0.95, 1.0, 0.85, WHITE, 3);
  b.ball(r * 1.1, x, by + 0.04, z + len * 0.5, 0.95, 0.95, 0.85, WHITE, 3);
  const fz = z - len * 0.5;
  if (!ox) {
    b.beam(x, by + 0.12, fz - 0.05, x, by + 0.8, fz - 0.5, 0.28, WHITE, 3);        // neck
    b.beam(x, by + 0.9, fz - 0.44, x, by + 0.45, fz - 0.92, 0.22, WHITE, 3);        // head
    b.beam(x, by + 0.3, fz + 0.06, x, by + 0.98, fz - 0.4, 0.08, WHITE, 4);         // mane
    for (const s of [-1, 1]) b.cyl(0.0, 0.04, 0.14, 4, x + s * 0.06, by + 0.95, fz - 0.47, WHITE, 4);
  } else {
    b.ball(0.26, x, by + 0.02, fz - 0.42, 0.9, 0.95, 1.5, WHITE, 3);               // head
    b.ball(0.13, x, by - 0.12, fz - 0.78, 1.2, 0.9, 1, WHITE, 4);                   // muzzle
    for (const s of [-1, 1]) b.beam(x + s * 0.12, by + 0.18, fz - 0.3, x + s * 0.44, by + 0.36, fz - 0.24, 0.05, 0xd8ccb0, 0);
  }
  b.beam(x, by + 0.22, z + len * 0.5 + 0.28, x, by - 0.5, z + len * 0.5 + 0.44, 0.08, WHITE, 4);  // tail
  for (const f of [-1, 1]) for (const s of [-1, 1]) {
    const lz = z + f * len * 0.42, lx = x + s * r * 0.55;
    const an = [LEG + 0.05, lz, (f < 0) === (s < 0) ? 0 : Math.PI, 2];          // trot: diagonal pairs
    b.cyl(ox ? 0.1 : 0.075, ox ? 0.08 : 0.058, LEG + 0.1, 5, lx, 0.0, lz, WHITE, 3, an);
    b.box(0.13, 0.09, 0.15, lx, 0, lz, 0x2a2420, 0, an);
  }
  return by;
}
function cartLantern(b, x, z) {
  b.beam(x, 0.9, z, x, 1.75, z, 0.05, WOOD, 0);
  b.box(0.05, 0.05, 0.22, x, 1.68, z - 0.1, IRON, 0);
  b.box(0.15, 0.2, 0.15, x, 1.46, z - 0.2, 0xffd890, 6);
  b.cyl(0.0, 0.12, 0.08, 4, x, 1.66, z - 0.2, IRON, 0);
}
function horseCartGeo(load) {
  const b = builder();
  const by = quad(b, 0, -2.1, false);
  const nz = -2.1 - 0.725 - 0.15;
  { const t = new THREE.TorusGeometry(0.24, 0.06, 4, 10); t.translate(0, by + 0.28, nz); b.raw(t, 0x4a3020, 0); }  // collar
  for (const s of [-1, 1]) b.beam(s * 0.46, 0.95, -0.2, s * 0.34, 1.2, -2.6, 0.07, WOOD, 0);   // shafts
  b.box(1.4, 0.1, 2.1, 0, 0.8, 0.85, WHITE, 1);
  for (const s of [-1, 1]) b.box(0.06, 0.38, 2.1, s * 0.7, 0.9, 0.85, WHITE, 1);
  b.box(1.4, 0.38, 0.06, 0, 0.9, -0.2, WHITE, 1); b.box(1.4, 0.3, 0.06, 0, 0.9, 1.9, WHITE, 1);
  b.box(1.2, 0.08, 0.3, 0, 1.0, 0.0, DARKW, 0);
  for (const s of [-1, 1]) b.wheel(s * 0.84, 0.62, 0.9, 0.58, 0x5a4430);
  seated(b, 0, 1.08, 0.02, 1, 5);
  cartLantern(b, -0.74, -0.18);
  if (load === 'hay') {
    b.ball(1.0, 0, 1.35, 1.05, 0.72, 0.55, 0.95, 0xd2b068, 0); b.ball(0.8, 0.05, 1.7, 1.05, 0.62, 0.42, 0.8, 0xdcbc72, 0);
  } else {
    b.cyl(0.25, 0.25, 0.7, 8, 0.36, 0.9, 1.45, 0x8a6038, 0); b.cyl(0.26, 0.26, 0.05, 8, 0.36, 1.12, 1.45, IRON, 0);
    b.cyl(0.25, 0.25, 0.7, 8, -0.3, 0.9, 1.5, 0x7a5232, 0); b.cyl(0.26, 0.26, 0.05, 8, -0.3, 1.12, 1.5, IRON, 0);
    b.ball(0.3, -0.28, 1.12, 0.62, 1, 0.8, 1.3, 0xc8b48a, 0); b.ball(0.28, 0.1, 1.38, 0.72, 1.1, 0.75, 1.2, 0xbca47a, 0);
    b.box(0.5, 0.5, 0.5, 0.38, 0.9, 0.62, 0xa07a4a, 0);
  }
  return b.done();
}
function oxWagonGeo() {
  const b = builder();
  for (const s of [-1, 1]) quad(b, s * 0.56, -3.0, true);
  b.box(1.7, 0.12, 0.14, 0, 1.18, -3.75, WOOD, 0);                              // yoke
  b.beam(0, 0.78, -0.95, 0, 1.18, -3.72, 0.1, WOOD, 0);                          // pole
  b.box(1.7, 0.12, 3.4, 0, 0.82, 0.8, 0x7a5c3a, 0);
  for (const s of [-1, 1]) b.box(0.06, 0.32, 3.4, s * 0.85, 0.94, 0.8, 0x6e5236, 0);
  for (const s of [-1, 1]) { b.wheel(s * 0.95, 0.5, -0.35, 0.47, 0x5a4430); b.wheel(s * 0.95, 0.62, 2.0, 0.58, 0x5a4430); }
  { const c = new THREE.CylinderGeometry(0.9, 0.9, 2.9, 10, 1, false, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.translate(0, 1.02, 1.0); b.raw(c, WHITE, 1); }
  for (const zz of [-0.4, 1.0, 2.4]) { const c = new THREE.CylinderGeometry(0.92, 0.92, 0.06, 10, 1, false, Math.PI / 2, Math.PI); c.rotateX(Math.PI / 2); c.translate(0, 1.02, zz); b.raw(c, 0x5a4430, 0); }
  b.box(1.4, 0.08, 0.3, 0, 1.0, -0.75, DARKW, 0);
  seated(b, 0, 1.08, -0.72, 1, 5);
  cartLantern(b, -0.8, -0.85);
  return b.done();
}
function riderGeo() {
  const b = builder();
  const by = quad(b, 0, 0, false);
  const top = by + 0.35;
  b.box(0.82, 0.04, 0.75, 0, top - 0.02, 0.05, WHITE, 5);                       // saddle cloth
  b.box(0.42, 0.12, 0.5, 0, top, 0.05, 0x4a3020, 0);                            // saddle
  for (const s of [-1, 1]) {
    b.beam(s * 0.18, top + 0.1, 0.05, s * 0.4, top - 0.45, -0.12, 0.12, HOSE, 0);
    b.box(0.12, 0.12, 0.24, s * 0.42, top - 0.58, -0.16, SHOE, 0);
  }
  b.cyl(0.17, 0.2, 0.58, 7, 0, top + 0.08, 0.05, WHITE, 5);                     // tunic
  b.cyl(0.19, 0.42, 0.78, 8, 0, top - 0.12, 0.12, WHITE, 1);                    // cloak
  b.ball(0.13, 0, top + 0.82, 0.05, 1, 1.12, 1, SKIN, 0);
  b.ball(0.15, 0, top + 0.86, 0.09, 1.02, 1.02, 1.02, WHITE, 1);                // hood
  for (const s of [-1, 1]) b.beam(s * 0.2, top + 0.56, 0.05, s * 0.12, top + 0.25, -0.36, 0.08, WHITE, 1);
  return b.done();
}
function walkerGeo(o) { const b = builder(); human(b, o); return b.done(); }
// double-sided sheet from a geometry (sails)
function sheet(b, g, col, tint) {
  const f = g.index ? g.toNonIndexed() : g;
  const r = f.clone();
  const p = r.attributes.position.array;
  for (let t = 0; t < p.length; t += 9) for (let k = 0; k < 3; k++) { const a = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = a; }
  if (r.attributes.normal) r.deleteAttribute('normal');
  if (f.attributes.normal) f.deleteAttribute('normal');
  r.computeVertexNormals(); f.computeVertexNormals();
  b.raw(f, col, tint); b.raw(r, col, tint);
}
function rowboatGeo() {
  const b = builder();
  { const h = new THREE.CylinderGeometry(0.78, 0.46, 0.55, 10, 1); h.scale(1, 1, 2.9); h.translate(0, 0.22, 0); b.raw(h, WHITE, 1); }
  { const h = new THREE.CylinderGeometry(0.66, 0.66, 0.02, 10, 1); h.scale(1, 1, 2.8); h.translate(0, 0.46, 0); b.raw(h, 0x4a3828, 0); }
  b.box(1.3, 0.05, 0.22, 0, 0.44, -0.35, 0x8a6a44, 0); b.box(1.1, 0.05, 0.2, 0, 0.44, 1.3, 0x8a6a44, 0);
  seated(b, 0, 0.5, -0.35, -1, 5);
  for (const s of [-1, 1]) {
    const an = [s * 0.72, 0.0, -s, 3];
    b.beam(s * 0.2, 0.66, -0.05, s * 2.3, 0.08, 0.2, 0.05, 0xb8905a, 0, an);
    b.box(0.5, 0.03, 0.17, s * 2.2, 0.06, 0.19, 0xb8905a, 0, an);
    b.box(0.06, 0.1, 0.06, s * 0.72, 0.5, 0.0, IRON, 0);
  }
  return b.done();
}
function fishboatGeo() {
  const b = builder();
  { const h = new THREE.CylinderGeometry(1.15, 0.6, 0.95, 10, 1); h.scale(1, 1, 3.1); h.translate(0, 0.3, 0); b.raw(h, WHITE, 1); }
  { const h = new THREE.CylinderGeometry(1.0, 1.0, 0.02, 10, 1); h.scale(1, 1, 3.0); h.translate(0, 0.74, 0); b.raw(h, 0x5a4430, 0); }
  b.cyl(0.07, 0.09, 6.2, 6, 0, 0.7, -0.9, 0x6a5238, 0);                          // mast
  b.beam(-0.02, 5.9, -2.2, 0.36, 6.5, 0.7, 0.07, 0x6a5238, 0);                   // lug yard
  { // lug sail: a quad from the yard down to the boom, gently bellied
    const g = new THREE.BufferGeometry();
    const A = [0.0, 5.85, -2.1], B2 = [0.34, 6.4, 0.6], C = [0.26, 1.5, 0.9], Dd = [0.06, 1.5, -2.2];
    const mid = (p, q, bulge) => [(p[0] + q[0]) / 2 + bulge, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    const M = mid(A, C, 0.35), P1 = mid(A, B2, 0.1), P2 = mid(B2, C, 0.25), P3 = mid(C, Dd, 0.1), P4 = mid(Dd, A, 0.25);
    const T = [A, P1, M, P1, B2, M, B2, P2, M, P2, C, M, C, P3, M, P3, Dd, M, Dd, P4, M, P4, A, M];
    g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(...T), 3));
    sheet(b, g, WHITE, 5);
  }
  b.cyl(0.05, 0.05, 3.2, 5, 0, 1.45, -0.65, 0x6a5238, 0);
  b.ball(0.55, 0, 0.9, 1.9, 1.2, 0.45, 1.0, 0x4e5448, 0);                        // heaped nets
  b.box(0.5, 0.4, 0.5, 0.5, 0.75, 0.9, 0x8a6a44, 0);                              // fish basket
  seated(b, 0, 0.9, 2.6, 1, 0);
  b.box(0.1, 1.2, 0.7, 0, -0.2, 3.3, 0x5a4430, 0);                                // rudder
  return b.done();
}
function cogGeo() {
  const b = builder();
  const HW = 0x5a4430, HW2 = 0x4a382a;
  { const h = new THREE.CylinderGeometry(2.6, 1.5, 2.4, 12, 1); h.scale(1, 1, 2.9); h.translate(0, 0.5, 0); b.raw(h, HW, 0); }
  { const h = new THREE.CylinderGeometry(2.45, 2.45, 0.02, 12, 1); h.scale(1, 1, 2.8); h.translate(0, 1.7, 0); b.raw(h, 0x8a6a44, 0); }
  for (let k = 0; k < 3; k++) { const h = new THREE.CylinderGeometry(2.64 - k * 0.02, 2.62 - k * 0.02, 0.1, 12, 1); h.scale(1, 1, 2.92); h.translate(0, 0.1 + k * 0.55, 0); b.raw(h, HW2, 0); }
  // castles fore and aft with crenellated rails
  b.box(4.0, 1.7, 3.4, 0, 1.7, 5.0, HW, 0); b.box(4.2, 0.1, 3.6, 0, 3.4, 5.0, 0x8a6a44, 0);
  b.box(3.2, 1.4, 2.6, 0, 1.7, -5.6, HW, 0); b.box(3.4, 0.1, 2.8, 0, 3.1, -5.6, 0x8a6a44, 0);
  for (let k = 0; k < 5; k++) { b.box(0.3, 0.45, 0.14, -1.8 + k * 0.9, 3.5, 3.25, HW2, 0); b.box(0.3, 0.45, 0.14, -1.8 + k * 0.9, 3.5, 6.75, HW2, 0); }
  for (let k = 0; k < 4; k++) { b.box(0.14, 0.45, 0.3, -2.05, 3.5, 3.6 + k * 0.9, HW2, 0); b.box(0.14, 0.45, 0.3, 2.05, 3.5, 3.6 + k * 0.9, HW2, 0); }
  for (let k = 0; k < 4; k++) { b.box(0.28, 0.4, 0.14, -1.35 + k * 0.9, 3.2, -6.95, HW2, 0); }
  b.cyl(0.18, 0.26, 16.5, 6, 0, 1.7, 0, 0x6a5238, 0);                           // mast
  b.cyl(0.55, 0.45, 0.7, 8, 0, 16.4, 0, HW, 0);                                  // top castle
  { const y = new THREE.CylinderGeometry(0.12, 0.12, 9.6, 6); y.rotateZ(Math.PI / 2); y.translate(0, 15.4, -0.4); b.raw(y, 0x6a5238, 0); }
  { // square sail, bellied forward
    const g = new THREE.PlaneGeometry(9, 9.2, 4, 4), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const u = p.getX(k) / 4.5, v = (p.getY(k) + 4.6) / 9.2;
      p.setXYZ(k, p.getX(k) * (1 - 0.05 * (1 - v)), 6.2 + v * 9.1, -0.4 - 1.2 * (1 - u * u) * Math.sin(Math.PI * (0.25 + 0.75 * v)));
    }
    sheet(b, g, WHITE, 1);
  }
  b.beam(0, 2.6, -6.6, 0, 4.2, -9.6, 0.18, 0x6a5238, 0);                          // bowsprit
  b.box(0.22, 2.8, 1.2, 0, -0.6, 7.6, HW2, 0);                                    // rudder
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 18.6, 0, 0, 18.0, 0, 0, 18.3, 1.8], 3)); sheet(b, g, WHITE, 5); }  // pennant
  b.cyl(0.03, 0.03, 1.5, 4, 0, 17.1, 0, 0x6a5238, 0);
  return b.done();
}
function birdGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, -1.4, 0.3, 0.2, 0, 0, 0.4, 0, 0, -0.5, 0, 0, 0.4, 1.4, 0.3, 0.2], 3));
  g.computeVertexNormals();
  return D.colorGeo(g, 0x2a2a2e, 'tint', 0);
}

// ---- material (instance colour on tint 1, coats / cloth palettes, glow, leg + wheel anim) ----
const LU = { uClockL: { value: 0 }, uNightL: { value: 0 } };
function glc(hex) { const c = lin(hex); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; }
function palGLSL(name, list) {
  let s = `vec3 ${name}(float h){ float k = fract(h); `;
  list.forEach((c, i) => { s += i < list.length - 1 ? `if (k < ${((i + 1) / list.length).toFixed(4)}) return ${glc(c)}; ` : `return ${glc(c)}; }\n`; });
  return s;
}
function headGLSL() {
  return `
attribute float tint; attribute vec4 aAnim; attribute vec3 iAnim;
uniform float uClockL;
${palGLSL('lifeCoat', COAT)}${palGLSL('lifeCloth', CLOTH2)}
vec3 lifeRotX(vec3 p, float py, float pz, float a){ float c = cos(a), s = sin(a), yy = p.y - py, zz = p.z - pz; p.y = py + yy * c - zz * s; p.z = pz + yy * s + zz * c; return p; }
vec3 lifeAnim(vec3 p){
  float mode = aAnim.w;
  if (mode > 0.5 && mode < 1.5) p = lifeRotX(p, aAnim.x, aAnim.y, -uClockL * iAnim.x / (3.0 * max(aAnim.z, 0.1)) * step(0.01, iAnim.z));
  else if (mode > 1.5 && mode < 2.5) p = lifeRotX(p, aAnim.x, aAnim.y, sin(uClockL * iAnim.x + iAnim.y + aAnim.z) * 0.5 * iAnim.z);
  else if (mode > 2.5 && mode < 3.5) {
    float ph = uClockL * iAnim.x + iAnim.y, a = sin(ph) * 0.45 * iAnim.z * aAnim.z;
    float c = cos(a), s = sin(a), xx = p.x - aAnim.x, zz = p.z - aAnim.y;
    p.x = aAnim.x + xx * c + zz * s; p.z = aAnim.y - xx * s + zz * c;
    p.y += cos(ph) * 0.14 * abs(xx) * iAnim.z;
  }
  return p;
}
`;
}
function lifeMat() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.02, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uClockL = LU.uClockL; sh.uniforms.uNightL = LU.uNightL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + headGLSL() + 'varying float vGlowL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = lifeAnim(transformed);')
      .replace('#include <color_vertex>', `
vColor = color;
if (tint > 0.5 && tint < 1.5) vColor *= instanceColor;
else if (tint > 2.5 && tint < 4.5) vColor = color * lifeCoat(iAnim.y * 7.31 + 0.13) * (tint > 3.5 ? 0.45 : 1.0);
else if (tint > 4.5 && tint < 5.5) vColor = color * lifeCloth(iAnim.y * 3.77 + 0.71);
vGlowL = step(5.5, tint) * step(tint, 6.5) * (0.8 + 0.2 * sin(uClockL * 13.0 + iAnim.y * 20.0));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNightL; varying float vGlowL;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlowL * (0.15 + uNightL * 5.0);');
    if (sh.vertexShader.indexOf('lifeAnim(transformed)') < 0 || sh.vertexShader.indexOf('lifeCoat(iAnim') < 0 || sh.fragmentShader.indexOf('vGlowL * (') < 0)
      console.warn('Life: shader injection did not apply');
  };
  m.customProgramCacheKey = () => 'dio-life-2';
  return m;
}
function lifeDepthMat() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    sh.uniforms.uClockL = LU.uClockL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + headGLSL())
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = lifeAnim(transformed);');
    if (sh.vertexShader.indexOf('lifeAnim(transformed)') < 0) console.warn('Life: depth shader injection did not apply');
  };
  m.customProgramCacheKey = () => 'dio-life-depth';
  return m;
}

// instanced mesh record: { im, ia (iAnim attribute), cap, n }
function inst(geo, mat, cap, shadow, depthMat) {
  geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  geo.attributes.iAnim.setUsage(THREE.DynamicDrawUsage);
  const im = new THREE.InstancedMesh(geo, mat, cap);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  im.count = 0; im.frustumCulled = false; im.castShadow = !!shadow; im.receiveShadow = true;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (shadow && depthMat) im.customDepthMaterial = depthMat;
  Life.group.add(im);
  return { im, ia: geo.attributes.iAnim, cap, n: 0 };
}

Life.init = function (scene) {
  Life.group = new THREE.Group(); scene.add(Life.group);
  const mat = lifeMat(), dm = lifeDepthMat();
  Life.mat = mat;
  const M = Life.meshes = {
    horseCart: inst(horseCartGeo('goods'), mat, 90, true, dm),
    hayCart: inst(horseCartGeo('hay'), mat, 50, true, dm),
    oxWagon: inst(oxWagonGeo(), mat, 60, true, dm),
    rider: inst(riderGeo(), mat, 24, true, dm),
    walk: inst(walkerGeo({}), mat, 700, false),
    walkBack: inst(walkerGeo({ back: true }), mat, 200, false),
    walkHead: inst(walkerGeo({ head: true }), mat, 200, false),
    walkTorch: inst(walkerGeo({ torch: true }), mat, 260, false),
    guard: inst(walkerGeo({ guard: true }), mat, 260, false),
    monk: inst(walkerGeo({ monk: true }), mat, 260, false),
    rowboat: inst(rowboatGeo(), mat, 48, true, dm),
    fishboat: inst(fishboatGeo(), mat, 48, true, dm),
    cog: inst(cogGeo(), mat, 32, true, dm),
  };
  const bim = new THREE.InstancedMesh(birdGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), 90);
  bim.count = 0; bim.frustumCulled = false; bim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Life.group.add(bim);
  M.bird = { im: bim, ia: null, cap: 90, n: 0 };
  D.on('roads:rebuilt', () => { Life.needsRoute = true; });
  D.on('roads:changed', () => { Life.needsRoute = true; });
  const wipe = () => { Life.boats.length = 0; Life.carts.length = 0; Life.riders.length = 0; Life.peds.length = 0; Life.nav.length = 0; navVer = -1; navEdges = []; lastRaw = null; lastRawN = -1; navGrid = new Map(); moorings = []; mooredKeys.clear(); moorCache.clear(); moorT = 0; };
  D.on('world:generated', wipe);
  D.on('world:reset', wipe);
  D.on('sea', () => { moorCache.clear(); moorT = 0; }); // cached pier-head depths are stale after a sea change
};

// ---- road helpers ---------------------------------------------------------------------
const KEEP = { footpath: 0, track: 1.0, lane: 1.3, street: 2.0, kingsroad: 2.4 };
function typeOf(seg) { return D.Roads && D.Roads.TYPES ? D.Roads.TYPES[seg.type] : null; }
function laneOffset(T) {
  if (!T) return 1;
  const v = KEEP[T.id];
  return v !== undefined ? v : Math.min(2.4, Math.max(0.8, (T.w || 4) * 0.22));
}
const cartPred = s => { const T = typeOf(s); return !!(T && T.cars); };
const pedPred = s => { const T = typeOf(s); return !!(T && T.peds); };
const riderPred = s => { const T = typeOf(s); return !!(T && T.cars && (T.id === 'kingsroad' || T.id === 'street')); };
const bbCache = new WeakMap();
function segBB(seg) {
  if (seg._bb) return seg._bb;
  const S = D.Roads.segSamples(seg);
  let b = bbCache.get(S);
  if (!b) {
    b = [1e9, 1e9, -1e9, -1e9];
    for (let q = 0; q < S.n; q++) { b[0] = Math.min(b[0], S.x[q]); b[2] = Math.max(b[2], S.x[q]); b[1] = Math.min(b[1], S.z[q]); b[3] = Math.max(b[3], S.z[q]); }
    bbCache.set(S, b);
  }
  return b;
}
const bbDist = (b, x, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
function pickNext(nodeId, fromSeg, pred) {
  const n = D.Roads.nodes.get(nodeId); if (!n || !n.segs) return null;
  const opts = [];
  for (const id of n.segs) { const s = D.Roads.segs.get(id); if (s && s.id !== fromSeg.id && pred(s)) opts.push(s); }
  if (!opts.length) return null;
  return opts[Math.floor(Math.random() * opts.length)];
}
// position on segment at distance s, lateral offset (left of travel direction)
const tmpP = { x: 0, y: 0, z: 0, hx: 0, hz: 0, tunnel: false };
function posOn(seg, s, dir, lat) {
  const S = D.Roads.segSamples(seg);
  const f = D.clamp(s / (S.len || 1) * (S.n - 1), 0, S.n - 1), q = Math.max(0, Math.min(S.n - 2, Math.floor(f))), u = f - q;
  let tx = S.tx[q] + (S.tx[q + 1] - S.tx[q]) * u, tz = S.tz[q] + (S.tz[q + 1] - S.tz[q]) * u;
  const tl = Math.hypot(tx, tz) || 1; tx = tx / tl * dir; tz = tz / tl * dir;
  const lx = tz, lz = -tx; // left normal of the travel direction
  tmpP.x = S.x[q] + (S.x[q + 1] - S.x[q]) * u + lx * lat;
  tmpP.z = S.z[q] + (S.z[q + 1] - S.z[q]) * u + lz * lat;
  tmpP.y = D.Roads.profAt(seg, s) + 0.14;
  tmpP.hx = tx; tmpP.hz = tz;
  tmpP.tunnel = D.Roads.flagAt ? D.Roads.flagAt(seg, s) === 2 : false;
  return tmpP;
}
function pitchOn(seg, s, dir) {
  const S = D.Roads.segSamples(seg);
  const a = D.clamp(s - 1.6 * dir, 0, S.len), b = D.clamp(s + 1.6 * dir, 0, S.len);
  const d = Math.abs(b - a); if (d < 0.2) return 0;
  return Math.atan2(D.Roads.profAt(seg, b) - D.Roads.profAt(seg, a), d);
}
function advance(a, dt, pred) {
  let S = D.Roads.segSamples(a.seg);
  a.s += a.v * dt * a.dir;
  let guard = 0;
  while ((a.s > S.len || a.s < 0) && guard++ < 4) {
    const atEnd = a.s > S.len;
    const over = atEnd ? a.s - S.len : -a.s;
    const nodeId = atEnd ? a.seg.b : a.seg.a;
    const next = pickNext(nodeId, a.seg, pred);
    if (!next) { a.dir = -a.dir; a.s = atEnd ? S.len : 0; break; }
    const fwd = next.a === nodeId;
    a.seg = next; S = D.Roads.segSamples(next);
    a.dir = fwd ? 1 : -1;
    a.s = D.clamp(fwd ? over : S.len - over, 0, S.len);
    if (a.latT !== undefined) a.latT = laneOffset(typeOf(next));
  }
}
function pickWeighted(list, lens, total) {
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) { r -= lens[i]; if (r <= 0) return i; }
  return list.length - 1;
}

// ---- instance writers --------------------------------------------------------------------
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
function put(M, x, y, z, yaw, pitch, roll, col, rate, ph, amp) {
  if (M.n >= M.cap) return;
  const i = M.n++;
  eul.set(pitch || 0, yaw, roll || 0, 'YXZ'); q4.setFromEuler(eul); p3.set(x, y, z); s3.set(1, 1, 1);
  m4.compose(p3, q4, s3); M.im.setMatrixAt(i, m4);
  if (col) M.im.instanceColor.setXYZ(i, col.r, col.g, col.b);
  if (M.ia) { const a = M.ia.array; a[i * 3] = rate || 0; a[i * 3 + 1] = ph || 0; a[i * 3 + 2] = amp || 0; }
}
function beginMeshes() { const M = Life.meshes; for (const k in M) M[k].n = 0; }
function endMeshes() {
  const M = Life.meshes;
  for (const k in M) {
    const r = M[k];
    r.im.count = r.n;
    if (!r.n) continue;
    r.im.instanceMatrix.needsUpdate = true;
    if (r.im.instanceColor) r.im.instanceColor.needsUpdate = true;
    if (r.ia) r.ia.needsUpdate = true;
  }
}

// ---- management (spawning / culling), a few times per second --------------------------------
let manageT = 0;
const CART_R = 2500, PED_R = 1000, NAV_R = 1200;
function cullRoad(list, maxD, pred, focus) {
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (!D.Roads.segs.has(a.seg.id) || a.seg !== D.Roads.segs.get(a.seg.id) || !pred(a.seg) || Math.hypot(a.x - focus.x, a.z - focus.z) > maxD) list.splice(i, 1);
  }
}
function manageRoads(focus) {
  const R = D.Roads;
  if (!R || !R.segs || !R.TYPES) return;
  cullRoad(Life.carts, CART_R + 400, cartPred, focus);
  cullRoad(Life.riders, CART_R + 400, riderPred, focus);
  cullRoad(Life.peds, PED_R + 400, pedPred, focus);
  const cC = [], cL = [], rC = [], rL = [], pC = [], pL = [];
  let cT = 0, rT = 0, pT = 0;
  R.segs.forEach(seg => {
    const T = R.TYPES[seg.type]; if (!T) return;
    const d = bbDist(segBB(seg), focus.x, focus.z);
    if (d > CART_R) return;
    const L = R.segSamples(seg).len; if (!(L > 1)) return;
    if (T.cars) { cC.push(seg); cL.push(L); cT += L; if (T.id === 'kingsroad' || T.id === 'street') { rC.push(seg); rL.push(L); rT += L; } }
    if (T.peds && d < PED_R) { pC.push(seg); pL.push(L); pT += L; }
  });
  const spawn = (list, cands, lens, total, target, maxNew, make, maxD) => {
    for (let k = 0, tries = 0; list.length < target && k < maxNew && tries < maxNew * 3 && cands.length; tries++) {
      const seg = cands[pickWeighted(cands, lens, total)], S = R.segSamples(seg);
      const s = Math.random() * S.len;
      const i = Math.min(S.n - 1, Math.round(s / S.len * (S.n - 1)));
      if (Math.hypot(S.x[i] - focus.x, S.z[i] - focus.z) > maxD) continue;
      const a = make(seg, s); a.x = S.x[i]; a.z = S.z[i]; list.push(a); k++;
    }
  };
  const cartTarget = Math.min(D.Q.high ? 60 : 36, Math.floor(cT / 70));
  spawn(Life.carts, cC, cL, cT, cartTarget, 5, (seg, s) => {
    const T = typeOf(seg), r = Math.random();
    const kind = r < 0.45 ? 'horseCart' : r < 0.68 ? 'hayCart' : 'oxWagon';
    const ox = kind === 'oxWagon';
    const v0 = (T.speed || 4) * (ox ? 0.8 + Math.random() * 0.15 : 0.9 + Math.random() * 0.3);
    return { seg, s, dir: Math.random() < 0.5 ? 1 : -1, v0, v: v0, lat: laneOffset(T), latT: laneOffset(T), kind, col: lin(ox ? pick(CANVAS) : pick(CART_WOOD)), ph: Math.random() * 100, nr: Math.random(), slow: 1 };
  }, CART_R);
  const riderTarget = Math.min(15, Math.floor(rT / 350));
  spawn(Life.riders, rC, rL, rT, riderTarget, 3, (seg, s) => {
    const T = typeOf(seg), v0 = (T.speed || 5) * (1.2 + Math.random() * 0.4);
    return { seg, s, dir: Math.random() < 0.5 ? 1 : -1, v0, v: v0, lat: laneOffset(T), latT: laneOffset(T), kind: 'rider', col: lin(pick(CLOTH.concat(HERALD))), ph: Math.random() * 100, nr: Math.random(), slow: 1 };
  }, CART_R);
  const pedTarget = D.Cam.distance() < 1500 ? Math.min(600 - Math.min(Life.nav.length, 420), Math.floor(pT / 22)) : 0;
  if (Life.peds.length > pedTarget + 40) Life.peds.length = pedTarget;
  spawn(Life.peds, pC, pL, pT, pedTarget, 25, (seg, s) => {
    const r = Math.random();
    const kind = r < 0.08 ? 'walkBack' : r < 0.15 ? 'walkHead' : 'walk';
    return { seg, s, dir: Math.random() < 0.5 ? 1 : -1, v: 1.0 + Math.random() * 0.6, side: Math.random() < 0.5 ? 1 : -1, off: Math.random(), kind, col: lin(pick(CLOTH)), ph: Math.random() * 100, nr: Math.random() };
  }, PED_R);
}

// ---- settlement lanes (D.Town.navEdges) ---------------------------------------------------
let navEdges = [], navVer = -1, lastRaw = null, lastRawN = -1;
const NG = 8; // grid cell (m) for vertex lookup
let navGrid = new Map();
const gkey = (x, z) => Math.floor(x / NG) * 4096 + Math.floor(z / NG);
function settlementType(sid) {
  try { const T = D.Town; const S = T && T.list && T.list.get ? T.list.get(sid) : null; return S ? S.type | 0 : 0; } catch (e) { return 0; }
}
function nearestVertex(x, z, maxD, filter) {
  let best = null, bd = maxD * maxD;
  const gx = Math.floor(x / NG), gz = Math.floor(z / NG), rr = Math.ceil(maxD / NG);
  for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
    const l = navGrid.get((gx + dx) * 4096 + gz + dz); if (!l) continue;
    for (let i = 0; i < l.length; i++) {
      const ei = l[i] >>> 16, k = l[i] & 0xffff, E = navEdges[ei];
      if (filter && !filter(ei, k)) continue;
      const ex = E.pts[k * 2] - x, ez = E.pts[k * 2 + 1] - z, d2 = ex * ex + ez * ez;
      if (d2 < bd) { bd = d2; best = { ei, k }; }
    }
  }
  return best;
}
function refreshNav() {
  const T = D.Town;
  if (!(T && T.navEdges)) { if (navEdges.length) { navEdges = []; navGrid = new Map(); Life.nav.length = 0; lastRaw = null; } return; }
  const v = T.navVersion | 0;
  if (v === navVer) return;
  navVer = v;
  let raw;
  try { raw = T.navEdges() || []; } catch (e) { raw = []; }
  // navVersion also bumps when only records change: Town then hands back the same cached
  // array, so skip the (O(vertices)) re-link and re-bind work
  if (raw === lastRaw && raw.length === lastRawN) return;
  lastRaw = raw; lastRawN = raw.length;
  const E = [];
  for (const e of raw) {
    if (!e || !e.pts || e.pts.length < 4) continue;
    const pts = e.pts, n = pts.length >> 1;
    if (n > 65535) continue;
    const L = new Float32Array(n);
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let k = 0; k < n; k++) {
      const x = pts[k * 2], z = pts[k * 2 + 1];
      if (k) L[k] = L[k - 1] + Math.hypot(x - pts[k * 2 - 2], z - pts[k * 2 - 1]);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (!(L[n - 1] > 2)) continue;
    E.push({ pts, n, L, len: L[n - 1], w: e.w || 3, cart: !!e.cart, sid: e.sid | 0, stype: settlementType(e.sid | 0), bb: [x0, z0, x1, z1], linkE: null, linkV: null });
    if (E.length >= 32767) break;
  }
  navEdges = E;
  navGrid = new Map();
  E.forEach((ed, ei) => { for (let k = 0; k < ed.n; k++) { const key = gkey(ed.pts[k * 2], ed.pts[k * 2 + 1]); let l = navGrid.get(key); if (!l) navGrid.set(key, l = []); l.push(ei * 65536 + k); } });
  // junction links: each vertex -> the closest vertex of another lane nearby
  E.forEach((ed, ei) => {
    ed.linkE = new Int32Array(ed.n).fill(-1); ed.linkV = new Int32Array(ed.n);
    for (let k = 0; k < ed.n; k++) {
      const end = k === 0 || k === ed.n - 1;
      const hit = nearestVertex(ed.pts[k * 2], ed.pts[k * 2 + 1], end ? 9 : 5, (ej) => ej !== ei);
      if (hit) { ed.linkE[k] = hit.ei; ed.linkV[k] = hit.k; }
    }
  });
  // re-bind the agents already walking to the nearest vertex of the new lanes
  for (let i = Life.nav.length - 1; i >= 0; i--) {
    const a = Life.nav[i];
    const hit = nearestVertex(a.x, a.z, 7, a.kind === 'navCart' ? (ej => navEdges[ej].cart) : null);
    if (!hit) { Life.nav.splice(i, 1); continue; }
    const ed = navEdges[hit.ei];
    a.ei = hit.ei; a.s = ed.L[hit.k]; a.q = Math.min(hit.k, ed.n - 2); a.lastV = hit.k;
    const k2 = Math.min(ed.n - 1, hit.k + 1), k1 = k2 - 1;
    const tx = ed.pts[k2 * 2] - ed.pts[k1 * 2], tz = ed.pts[k2 * 2 + 1] - ed.pts[k1 * 2 + 1];
    a.dir = (tx * a.hx + tz * a.hz) >= 0 ? 1 : -1;
  }
}
const tmpN = { x: 0, z: 0, tx: 0, tz: 1 };
function navPos(a) {
  const E = navEdges[a.ei], pts = E.pts, L = E.L;
  let q = D.clamp(a.q | 0, 0, E.n - 2);
  while (q < E.n - 2 && L[q + 1] < a.s) q++;
  while (q > 0 && L[q] > a.s) q--;
  a.q = q;
  const span = (L[q + 1] - L[q]) || 1, u = D.clamp((a.s - L[q]) / span, 0, 1);
  let tx = pts[q * 2 + 2] - pts[q * 2], tz = pts[q * 2 + 3] - pts[q * 2 + 1];
  const tl = Math.hypot(tx, tz) || 1;
  tmpN.tx = tx / tl * a.dir; tmpN.tz = tz / tl * a.dir;
  tmpN.x = pts[q * 2] + tx * u; tmpN.z = pts[q * 2 + 1] + tz * u;
  return tmpN;
}
function navSwitch(a, ei, k) {
  const E = navEdges[ei];
  a.ei = ei; a.s = E.L[k]; a.lastV = k;
  a.dir = k === 0 ? 1 : k === E.n - 1 ? -1 : (Math.random() < 0.5 ? 1 : -1);
  a.q = Math.max(0, Math.min(E.n - 2, a.dir > 0 ? k : k - 1));
}
function navStep(a, dt) {
  const E = navEdges[a.ei];
  const cartOnly = a.kind === 'navCart';
  a.s += a.v * dt * a.dir;
  if (a.s < 0 || a.s > E.len) {
    const k = a.s < 0 ? 0 : E.n - 1;
    const le = E.linkE[k];
    if (le >= 0 && (!cartOnly || navEdges[le].cart) && Math.random() < 0.9) navSwitch(a, le, E.linkV[k]);
    else { a.dir = -a.dir; a.s = D.clamp(a.s, 0, E.len); a.lastV = k; }
    return;
  }
  navPos(a);
  const cv = a.dir > 0 ? a.q : a.q + 1; // the vertex most recently passed
  if (cv !== a.lastV) {
    a.lastV = cv;
    const le = E.linkE[cv];
    if (le >= 0 && (!cartOnly || navEdges[le].cart) && Math.random() < 0.28) navSwitch(a, le, E.linkV[cv]);
  }
}
function manageNav(focus) {
  refreshNav();
  const nav = Life.nav;
  for (let i = nav.length - 1; i >= 0; i--) {
    const a = nav[i];
    if (!navEdges[a.ei] || Math.hypot(a.x - focus.x, a.z - focus.z) > NAV_R + 250) nav.splice(i, 1);
  }
  if (!navEdges.length) return;
  const pc = [], pl = [], cc = [], cl = [];
  let pT = 0, cT = 0;
  navEdges.forEach((E, ei) => {
    if (bbDist(E.bb, focus.x, focus.z) > NAV_R) return;
    pc.push(ei); pl.push(E.len); pT += E.len;
    if (E.cart) { cc.push(ei); cl.push(E.len); cT += E.len; }
  });
  let nPed = 0, nCart = 0; for (const a of nav) { if (a.kind === 'navCart') nCart++; else nPed++; }
  const pedTarget = D.Cam.distance() < 1500 ? Math.min(420, Math.floor(pT / 9)) : 0;
  const cartTarget = Math.min(12, Math.floor(cT / 160));
  const place = (ei, a) => {
    const E = navEdges[ei];
    a.ei = ei; a.s = Math.random() * E.len; a.q = 0; a.dir = Math.random() < 0.5 ? 1 : -1; a.lastV = -1;
    const p = navPos(a); a.x = p.x; a.z = p.z; a.hx = p.tx; a.hz = p.tz; a.yaw = Math.atan2(-p.tx, -p.tz);
    return Math.hypot(p.x - focus.x, p.z - focus.z) <= NAV_R;
  };
  for (let k = 0, tries = 0; nPed < pedTarget && k < 30 && tries < 90 && pc.length; tries++) {
    const ei = pc[pickWeighted(pc, pl, pT)], E = navEdges[ei];
    const st = E.stype, r = Math.random();
    let kind = 'walk', col;
    if (st === 4 && r < 0.6) { kind = 'monk'; col = pick(MONK); }
    else if (st === 3 && r < 0.45) { kind = 'guard'; col = pick(HERALD); }
    else {
      const loadP = st === 5 ? 0.35 : st === 2 ? 0.3 : 0.15, r2 = Math.random();
      kind = r2 < loadP ? (r2 < loadP * 0.55 ? 'walkBack' : 'walkHead') : 'walk';
      col = pick(CLOTH);
    }
    const a = { kind, col: lin(col), v: kind === 'monk' ? 0.8 + Math.random() * 0.3 : 1.0 + Math.random() * 0.6, off: Math.random(), ph: Math.random() * 100, nr: Math.random() };
    if (!place(ei, a)) continue;
    nav.push(a); nPed++; k++;
  }
  for (let k = 0, tries = 0; nCart < cartTarget && k < 3 && tries < 9 && cc.length; tries++) {
    const ei = cc[pickWeighted(cc, cl, cT)];
    const a = { kind: 'navCart', mesh: Math.random() < 0.6 ? 'horseCart' : 'hayCart', col: lin(pick(CART_WOOD)), v: 2.2 + Math.random() * 1.2, ph: Math.random() * 100, nr: Math.random() };
    if (!place(ei, a)) continue;
    nav.push(a); nCart++; k++;
  }
}

// ---- per-frame update ---------------------------------------------------------------------
Life.update = function (dt, camera) {
  const vis = D.Layers ? D.Layers.visible('life') : true;
  Life.group.visible = vis;
  if (!vis) return;
  LU.uClockL.value = (performance.now() * 0.001) % 3600;
  LU.uNightL.value = D.Env.night;
  const focus = D.Cam.focusPoint();
  manageT -= dt;
  if (Life.needsRoute || manageT <= 0) {
    Life.needsRoute = false; manageT = 0.5;
    manageRoads(focus);
    manageNav(focus);
  }
  beginMeshes();
  const camD = D.Cam.distance();
  updateRoadMovers(dt, camD);
  updatePeds(dt, camD);
  updateNav(dt, camD);
  updateBoats(dt);
  updateBirds(dt, camera);
  endMeshes();
};

const MOVERS = [];
function updateRoadMovers(dt, camD) {
  if (!D.Roads || !D.Roads.segs) return;
  const M = Life.meshes, night = D.Env.night > 0.45, show = camD < 5000;
  const movers = MOVERS; movers.length = 0;
  for (const c of Life.carts) movers.push(c);
  for (const r of Life.riders) movers.push(r);
  // simple following: slow down behind a cart ahead on the same segment and lane
  for (const a of movers) a.slow = 1;
  for (let i = 0; i < movers.length; i++) {
    const a = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const b = movers[j];
      if (a.seg !== b.seg || a.dir !== b.dir) continue;
      const gap = (b.s - a.s) * a.dir;
      if (gap > 0 && gap < 11) a.slow = Math.min(a.slow, D.clamp((gap - 6.5) / 4.5, 0, 1));
      else if (gap < 0 && gap > -11) b.slow = Math.min(b.slow, D.clamp((-gap - 6.5) / 4.5, 0, 1));
    }
  }
  for (const c of movers) {
    if (!D.Roads.segs.has(c.seg.id)) continue;
    if (night && c.nr > 0.5) continue; // fewer carts abroad at night
    const target = c.v0 * c.slow;
    c.v += (target - c.v) * Math.min(1, dt * (target < c.v ? 4 : 1.2));
    advance(c, dt, c.kind === 'rider' ? riderPred : cartPred);
    c.lat += (c.latT - c.lat) * Math.min(1, dt * 1.2);
    const p = posOn(c.seg, c.s, c.dir, c.lat);
    c.x = p.x; c.z = p.z;
    if (p.tunnel || !show) continue;
    const pitch = pitchOn(c.seg, c.s, c.dir);
    const m = M[c.kind] || M.horseCart;
    const moving = c.v > 0.15 ? 1 : 0;
    // constant rate per agent (a changing rate would jump the phase); speed shows as stride amplitude
    put(m, p.x, p.y, p.z, Math.atan2(-p.hx, -p.hz), pitch, 0, c.col, c.v0 * 3, c.ph, moving ? D.clamp(c.v / c.v0, 0.15, 1) : 0);
  }
}
function updatePeds(dt, camD) {
  if (!D.Roads || !D.Roads.segs) return;
  const M = Life.meshes, night = D.Env.night > 0.45, show = camD < 1500;
  const peds = Life.peds;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (!D.Roads.segs.has(p.seg.id)) { peds.splice(i, 1); continue; }
    if (night && p.nr > 0.45) continue;
    advance(p, dt, pedPred);
    const T = typeOf(p.seg); if (!T) continue;
    const lat = (!T.cars || T.id === 'footpath') ? (p.off - 0.5) * Math.min(1.2, T.w * 0.35) : (T.w / 2 + 0.2 - p.off * 0.5) * p.side;
    const q = posOn(p.seg, p.s, p.dir, lat);
    p.x = q.x; p.z = q.z;
    if (q.tunnel || !show) continue;
    const kind = night && p.nr < 0.2 && p.kind === 'walk' ? 'walkTorch' : p.kind;
    put(M[kind], q.x, q.y - 0.08, q.z, Math.atan2(-q.hx, -q.hz), 0, 0, p.col, p.v * 4.5, p.ph, 1);
  }
}
function updateNav(dt, camD) {
  if (!navEdges.length) return;
  const M = Life.meshes, night = D.Env.night > 0.45, showPed = camD < 1500, showCart = camD < 5000;
  for (const a of Life.nav) {
    if (!navEdges[a.ei]) continue;
    const cart = a.kind === 'navCart';
    if (night && a.nr > (cart ? 0.35 : 0.45)) continue;
    navStep(a, dt);
    const p = navPos(a), E = navEdges[a.ei];
    const lat = cart ? Math.min(1.2, E.w * 0.2) : (a.off - 0.5) * E.w * 0.6;
    const x = p.x + p.tz * lat, z = p.z - p.tx * lat;
    a.x = x; a.z = z; a.hx = p.tx; a.hz = p.tz;
    const want = Math.atan2(-p.tx, -p.tz);
    a.yaw = a.yaw === undefined ? want : a.yaw + D.angDiff(a.yaw, want) * Math.min(1, dt * 6);
    if (cart ? !showCart : !showPed) continue;
    const y = D.Terrain.hAt(x, z) + (cart ? 0.02 : -0.04);
    if (cart) put(M[a.mesh], x, y, z, a.yaw, 0, 0, a.col, a.v * 3, a.ph, 1);
    else {
      const kind = night && a.nr < 0.2 && a.kind === 'walk' ? 'walkTorch' : a.kind;
      put(M[kind], x, y, z, a.yaw, 0, 0, a.col, a.v * 4.5, a.ph, 1);
    }
  }
}

// ---- boats ---------------------------------------------------------------------------------
const BOAT = {
  rowboat: { v: [1.6, 2.4], turn: 0.6, draft: 0.12, look: 18, halfW: 2.4, oar: 1 },
  fishboat: { v: [2.4, 3.8], turn: 0.45, draft: 0.2, look: 30, halfW: 2.8 },
  cog: { v: [2.6, 4.2], turn: 0.22, draft: 0.45, look: 60, halfW: 4.2 },
};
let moorings = [], moorT = 0;
const mooredKeys = new Set(), perMoorMap = new Map(); // reused every frame (no per-frame allocation)
const moorCache = new Map();
const depthAt = (x, z) => D.Terrain.waterAt(x, z) - D.Terrain.hAt(x, z);
function refreshMoorings() {
  let raw = [];
  const T = D.Town;
  if (T && T.moorings) { try { raw = T.moorings() || []; } catch (e) { raw = []; } }
  const out = [];
  for (const m of raw) {
    if (!m || !isFinite(m.x) || !isFinite(m.z) || !D.inMap(m.x, m.z)) continue;
    const key = Math.round(m.x) + ',' + Math.round(m.z);
    let c = moorCache.get(key);
    if (!c) {
      // the open-water direction: where the water is deepest 50 m out
      let best = -1e9, bx = 0, bz = 1;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        const d = depthAt(m.x + dx * 50, m.z + dz * 50) + 0.5 * depthAt(m.x + dx * 20, m.z + dz * 20);
        if (d > best) { best = d; bx = dx; bz = dz; }
      }
      c = { key, x: m.x, z: m.z, ox: bx, oz: bz, ok: best > 1.5, deep: depthAt(m.x + bx * 60, m.z + bz * 60) };
      moorCache.set(key, c);
      if (moorCache.size > 600) moorCache.delete(moorCache.keys().next().value);
    }
    if (c.ok) out.push(c);
  }
  moorings = out;
  mooredKeys.clear(); for (const c of out) mooredKeys.add(c.key);
}
function newBoat(kind, x, z, h) {
  const K = BOAT[kind];
  const col = kind === 'cog' ? pick(COG_SAIL) : pick(HULL);
  return { kind, x, z, h, v0: K.v[0] + Math.random() * (K.v[1] - K.v[0]), v: 0, turn: 0, col: lin(col), ph: Math.random() * 100, moor: null };
}
function dockPoint(m, side, kind) {
  const px = -m.oz, pz = m.ox, w = BOAT[kind].halfW;
  return { x: m.x + px * side * w - m.ox * 3, z: m.z + pz * side * w - m.oz * 3, h: Math.atan2(-m.ox, -m.oz) };
}
function steer(b, hd, dt) {
  const K = BOAT[b.kind];
  b.h += D.clamp(D.angDiff(b.h, hd), -K.turn * dt, K.turn * dt);
}
function freeSail(b, dt, K) {
  const ax = b.x - Math.sin(b.h) * K.look, az = b.z - Math.cos(b.h) * K.look;
  const dep = depthAt(ax, az);
  if (dep < (b.kind === 'cog' ? 4.5 : 2.5) || !D.inMap(ax, az)) b.turn = 0.6 * (b.turn >= 0 ? 1 : -1) || 0.6;
  else if (Math.random() < dt * 0.1) b.turn = (Math.random() - 0.5) * 0.3;
  else b.turn *= 0.98;
  b.h += b.turn * dt;
}
function updateBoats(dt) {
  const B = Life.boats;
  moorT -= dt;
  if (moorT <= 0) { moorT = 3; refreshMoorings(); }
  // free boats: keep the old sea and lake behaviour
  let free = 0; for (const b of B) if (!b.moor) free++;
  for (let k = 0; k < 20 && free < 26; k++) {
    const x = Math.random() * SIZE, z = Math.random() * SIZE;
    const d = depthAt(x, z);
    if (d < 5 || d > 90) continue;
    const r = Math.random();
    const kind = r < 1 / 3 && d > 8 ? 'cog' : r < 2 / 3 ? 'fishboat' : 'rowboat';
    const b = newBoat(kind, x, z, Math.random() * 6.28); b.v = b.v0;
    B.push(b); free++;
  }
  // harbour boats: about half the fleet starts and ends at pier heads
  const keys = mooredKeys, perMoor = perMoorMap; perMoor.clear();
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i]; if (!b.moor) continue;
    if (!keys.has(b.moor.m.key)) { if (depthAt(b.x, b.z) > 2) b.moor = null; else B.splice(i, 1); continue; }
    perMoor.set(b.moor.m.key, (perMoor.get(b.moor.m.key) || 0) + 1);
  }
  let harbour = 0; for (const b of B) if (b.moor) harbour++;
  const wantH = Math.min(16, moorings.length * 2);
  for (let i = 0; i < moorings.length && harbour < wantH; i++) {
    const m = moorings[i], have = perMoor.get(m.key) || 0;
    if (have >= 2) continue;
    const r = Math.random(), kind = r < 0.15 && m.deep > 4 ? 'cog' : r < 0.55 ? 'fishboat' : 'rowboat';
    const side = have ? -1 : 1, dp = dockPoint(m, side, kind);
    if (depthAt(dp.x, dp.z) < 0.3) continue;
    const b = newBoat(kind, dp.x, dp.z, dp.h);
    b.moor = { m, side, state: 'moored', t: 5 + Math.random() * 60 };
    B.push(b); perMoor.set(m.key, have + 1); harbour++;
  }
  const t = performance.now() * 0.001, M = Life.meshes;
  for (const b of B) {
    const K = BOAT[b.kind];
    let moving = true;
    if (!b.moor) { b.v += (b.v0 - b.v) * Math.min(1, dt * 0.5); freeSail(b, dt, K); }
    else {
      const H = b.moor, m = H.m, dp = dockPoint(m, H.side, b.kind);
      H.t -= dt;
      if (H.state === 'moored') {
        moving = false; b.v = 0;
        b.x += (dp.x - b.x) * Math.min(1, dt * 0.8); b.z += (dp.z - b.z) * Math.min(1, dt * 0.8);
        b.h += D.angDiff(b.h, dp.h) * Math.min(1, dt * 0.8);
        if (H.t <= 0) { H.state = 'out'; H.t = 60 + Math.random() * 110; }
      } else if (H.state === 'out') {
        b.v += (b.v0 - b.v) * Math.min(1, dt * 0.4);
        const dh = Math.hypot(b.x - m.x, b.z - m.z);
        if (dh < 90) steer(b, dp.h, dt);
        else if (dh > 900) steer(b, Math.atan2(b.x - m.x, b.z - m.z), dt);
        else freeSail(b, dt, K);
        if (H.t <= 0) { H.state = 'return'; H.t = 300; }
      } else { // return
        const ax = m.x + m.ox * 38, az = m.z + m.oz * 38;
        const dd = Math.hypot(dp.x - b.x, dp.z - b.z), toA = Math.hypot(ax - b.x, az - b.z);
        const tx = dd > 45 && toA > 8 ? ax : dp.x, tz = dd > 45 && toA > 8 ? az : dp.z;
        steer(b, Math.atan2(-(tx - b.x), -(tz - b.z)), dt * (dd < 45 ? 2 : 1));
        const want = b.v0 * D.clamp(dd / 40, 0.2, 1);
        b.v += (want - b.v) * Math.min(1, dt * 0.8);
        if (dd > 60) { const lx = b.x - Math.sin(b.h) * K.look, lz = b.z - Math.cos(b.h) * K.look; if (depthAt(lx, lz) < 1.5) b.h += 0.5 * dt; }
        if (dd < 2.5 || H.t <= 0) { H.state = 'moored'; H.t = 25 + Math.random() * 70; if (H.t <= 0 || dd > 30) { b.x = dp.x; b.z = dp.z; b.h = dp.h; } }
      }
    }
    b.x -= Math.sin(b.h) * b.v * dt; b.z -= Math.cos(b.h) * b.v * dt;
    if (!D.inMap(b.x, b.z)) { b.x = D.clamp(b.x, 0, SIZE); b.z = D.clamp(b.z, 0, SIZE); b.h += Math.PI; }
    const w = D.Terrain.waterAt(b.x, b.z);
    if (w < -1e8) continue;
    const roll = Math.sin(t * 1.3 + b.ph) * (b.kind === 'cog' ? 0.035 : 0.06);
    const pitch = Math.sin(t * 0.9 + b.ph) * (b.kind === 'cog' ? 0.02 : 0.04);
    put(M[b.kind], b.x, w - K.draft + Math.sin(t * 1.7 + b.ph) * 0.12, b.z, b.h, pitch, roll, b.col, K.oar ? 2.6 : 0, b.ph, K.oar && moving ? 1 : 0);
  }
}

// ---- birds (unchanged behaviour) ---------------------------------------------------------------
function updateBirds(dt, camera) {
  const M = Life.meshes.bird;
  const d = D.Cam.distance();
  if (d > 2500 || D.Env.night > 0.6 || D.Env.weather === 'storm') { M.n = 0; return; }
  const f = D.Cam.focusPoint();
  if (!Life.flocks) Life.flocks = [0, 1, 2].map(k => ({ cx: f.x + (k - 1) * 300, cz: f.z + (k - 1) * 200, a: k * 2, r: 80 + k * 40 }));
  const t = performance.now() * 0.001;
  let n = 0;
  Life.flocks.forEach((fl, k) => {
    fl.cx += (f.x + (k - 1) * 280 - fl.cx) * dt * 0.05; fl.cz += (f.z + (k - 1) * 180 - fl.cz) * dt * 0.05;
    const gy = D.Terrain.hAt(D.clamp(fl.cx, 0, SIZE), D.clamp(fl.cz, 0, SIZE));
    for (let b = 0; b < 12; b++) {
      const a = t * (0.25 + k * 0.05) + b * 0.13 + fl.a;
      const rr = fl.r + Math.sin(b * 1.7) * 14;
      const x = fl.cx + Math.cos(a) * rr + Math.sin(b * 3.1) * 6, z = fl.cz + Math.sin(a) * rr + Math.cos(b * 2.3) * 6;
      const y = Math.max(gy, D.W.seaLevel) + 60 + k * 15 + Math.sin(t * 0.7 + b) * 5;
      const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + b * 1.3));
      q4.setFromAxisAngle(_up, -a); p3.set(x, y, z); s3.set(1.2, flap * 1.2, 1.2);
      m4.compose(p3, q4, s3); M.im.setMatrixAt(n++, m4);
    }
  });
  M.n = n;
}
})();
