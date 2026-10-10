// Jimbog — outdoor props for the Whisker Point research campus (section 2 of _kit/SPEC.md).
// Each type is registered with JB.Props.register(type, fn(p, ctx)). Materials are keyed 'p:<name>'.
// Everything is deterministic: layout randomness comes from a PRNG seeded from the prop itself.
(function () {
  'use strict';
  const JB = window.JB;
  const hasTex = (n) => JB.Tex.list.indexOf(n) >= 0;

  // ------------------------------------------------------------------ materials
  // `color` multiplies the texture when one exists, so the textured ones use white and
  // the base colour only matters when the texture is missing (bench fallback).
  const MATS = {
    'p:bark_gum':    { params: { color: hasTex('bark_gum') ? 0xffffff : 0xd6d0c2, roughness: 0.85 }, tex: 'bark_gum' },
    'p:leaves_gum':  { params: { color: hasTex('leaves_gum') ? 0xffffff : 0x7f9a62, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, tex: 'leaves_gum' },
    'p:leaves_round':{ params: { color: hasTex('leaves_round') ? 0xffffff : 0x5fa04a, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, tex: 'leaves_round' },
    'p:vine':        { params: { color: hasTex('vine') ? 0xffffff : 0x5f9a3a, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, tex: 'vine' },
    // Blended, not cut out: the wire covers ~20% of a mip-averaged texel, so a cutout test either hides the
    // fence at range or fills the holes up close. Blending gives a faint mesh far off and crisp wire near.
    'p:chainlink':   { params: { color: hasTex('chainlink') ? 0xffffff : 0x9aa2aa, alphaTest: 0.08, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5 }, tex: 'chainlink' },
    // Nets are blended for the same reason as the chain-link (see below): no speckle at range.
    'p:net_white':   { params: { color: hasTex('net_white') ? 0xffffff : 0xe8ecef, alphaTest: 0.08, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8 }, tex: 'net_white' },
    'p:net_dark':    { params: { color: 0x2a2e33, alphaTest: 0.08, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8 }, tex: 'net_white' },
    'p:timber':      { params: { color: hasTex('timber') ? 0xffffff : 0x8a6d4e, roughness: 0.85 }, tex: 'timber' },
    'p:brick_tan':   { params: { color: hasTex('brick_tan') ? 0xffffff : 0xdcbd90, roughness: 0.9 }, tex: 'brick_tan' },
    'p:soil':        { params: { color: hasTex('soil') ? 0xffffff : 0x6b5239, roughness: 1.0 }, tex: 'soil' },
    'p:galv':        { params: { color: 0xb9bfc6, roughness: 0.45, metalness: 0.6 } },
    'p:galv_dark':   { params: { color: 0x7d8790, roughness: 0.5, metalness: 0.6 } },
    'p:frame_dark':  { params: { color: 0x2b2f35, roughness: 0.5, metalness: 0.6 } },
    'p:post_white':  { params: { color: 0xf2f3f4, roughness: 0.4, metalness: 0.2 } },
    'p:glass_dark':  { params: { color: 0x1d2a33, roughness: 0.08, metalness: 0.4 } },
    'p:lamp_head':   { basic: true, params: { color: new THREE.Color(0xfff2d0).multiplyScalar(1.8) } },
    'p:lamp_tail':   { basic: true, params: { color: new THREE.Color(0xff2a1a).multiplyScalar(1.6) } },
    'p:canopy_glass':{ params: { color: 0x7fa38d, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false } },
    'p:hoop_orange': { params: { color: 0xe0661c, roughness: 0.55 } },
    'p:bin_green':   { params: { color: 0x2f5a3c, roughness: 0.6, metalness: 0.1 } },
    'p:grape':       { params: { color: 0x5b2a6e, roughness: 0.35 } },
    'p:wheel_rim':   { params: { color: 0xc4c9ce, roughness: 0.3, metalness: 0.9 } },
    'p:wood_table':  { params: { color: hasTex('timber') ? 0xffffff : 0x9a7452, roughness: 0.8 }, tex: 'timber' },
    // Dark grey posts (not p:steel_dark, which is near black without an environment map).
    'p:post_grey':   { params: { color: 0x4b525a, roughness: 0.55, metalness: 0.25 } },
    // Net tape is a single strip: double sided so it shows from either side.
    'p:tape_white':  { params: { color: 0xf4f4f2, roughness: 0.6, side: THREE.DoubleSide } }
  };
  JB.Props.addMaterials(MATS);
  JB.Props.addMaterials({
    'p:cladding_white': { params: { color: hasTex('cladding_white') ? 0xffffff : 0xeef3f6, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide }, tex: 'cladding_white' },
    'p:solar': { params: { color: 0x1f2e4a, roughness: 0.25, metalness: 0.35 } },
    // Campus sign returns (cream edges and back of the board).
    'p:sign_edge': { params: { color: 0xefe6cf, roughness: 0.5 } }
  });

  // Car body palette: muted tones, each its own material key so the bucket colour is right.
  const CAR_COLOURS = [0xe9ebec, 0x9ea4aa, 0x7a2a2a, 0x1f3a5c, 0x2f5a46, 0xb9a88a, 0x3a3f46, 0x6e8aa3];
  const carKey = (c) => 'p:car_' + ('000000' + c.toString(16)).slice(-6);
  const carMats = {};
  CAR_COLOURS.forEach((c) => { carMats[carKey(c)] = { params: { color: c, roughness: 0.35, metalness: 0.15 }, tex: hasTex('car_paint') ? 'car_paint' : undefined }; });
  JB.Props.addMaterials(carMats);
  // Any explicit `color` gets its own key, registered before the level reads the table.
  function bodyKey(color) {
    if (typeof color === 'number') {
      const k = carKey(color);
      if (!carMats[k]) { carMats[k] = { params: { color: color, roughness: 0.35, metalness: 0.15 }, tex: hasTex('car_paint') ? 'car_paint' : undefined }; JB.Props.addMaterials({ [k]: carMats[k] }); }
      return k;
    }
    return carKey(CAR_COLOURS[0]);
  }

  // ------------------------------------------------------------------ helpers
  const UP = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0);
  const _qa = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qs = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _d = new THREE.Vector3();

  // Orientation that maps local +Y onto dir, then spins about world Y by yaw.
  function alignQuat(dir, yaw, out) {
    _d.copy(dir).normalize();
    if (_d.y < -0.9999) _qa.setFromAxisAngle(AX, Math.PI);
    else _qa.setFromUnitVectors(UP, _d);
    _qy.setFromAxisAngle(UP, yaw || 0);
    return out.copy(_qy).multiply(_qa);
  }
  // Add geometry `geo` with its local origin at (x,y,z), local +Y along dir, spun by yaw, scaled.
  function place(P, key, geo, x, y, z, dir, yaw, g, aof, sc) {
    alignQuat(dir || UP, yaw, _qs);
    _p.set(x, y, z);
    if (sc) _s.set(sc[0], sc[1], sc[2]); else _s.set(1, 1, 1);
    _m.compose(_p, _qs, _s);
    P.addGeo(key, geo, _m, g, aof);
  }
  // Same, but the card is spun about its own axis (for leaf cards hanging along dir).
  function placeSpin(P, key, geo, x, y, z, dir, spin, g, aof) {
    alignQuat(dir, 0, _qs);
    _qy.setFromAxisAngle(UP, spin);
    // spin about the local Y axis (the card's length axis) before aligning to dir
    _qa.setFromAxisAngle(UP, spin);
    _qs.copy(_qs).multiply(_qa);
    _p.set(x, y, z); _s.set(1, 1, 1);
    _m.compose(_p, _qs, _s);
    P.addGeo(key, geo, _m, g, aof);
  }

  // Cached geometries (built once, shared by every prop instance; never mutated).
  const GEO = {};
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Leaf card: base at origin, extends along +Y. UVs are world scaled (2 m per tile) and each of the
  // 8 variants starts at a different offset in the leaf texture, so neighbouring cards do not repeat.
  function cardGeo(w, len, v) {
    v = (v || 0) % 8;
    const k = 'card' + w + '_' + len + '_' + v;
    if (GEO[k]) return GEO[k];
    const g = new THREE.PlaneGeometry(w, len, 1, 1);
    g.translate(0, len / 2, 0);
    const uv = g.attributes.uv, ou = (v * 0.618) % 1, ov = (v * 0.382 + 0.25) % 1;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2 + ou, uv.getY(i) * len / 2 + ov);
    return (GEO[k] = g);
  }
  // Cylinder: whole tiles around (so the texture wraps seamlessly), 2 m per tile along the length.
  function cylGeo(rt, rb, h, seg) {
    const k = 'cyl' + rt.toFixed(3) + '_' + rb.toFixed(3) + '_' + h.toFixed(3) + '_' + seg;
    if (GEO[k]) return GEO[k];
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
    const uv = g.attributes.uv, tiles = Math.max(1, Math.round(Math.PI * (rt + rb) / 2));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tiles, uv.getY(i) * h / 2);
    return (GEO[k] = g);
  }
  // Box: each face is scaled by its own size, so a 0.04 m edge does not stretch the texture.
  function boxGeo(sx, sy, sz) {
    const k = 'box' + sx + '_' + sy + '_' + sz;
    if (GEO[k]) return GEO[k];
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) for (let j = 0; j < 4; j++) {
      const i = f * 4 + j;
      uv.setXY(i, uv.getX(i) * dims[f][0] / 2, uv.getY(i) * dims[f][1] / 2);
    }
    return (GEO[k] = g);
  }
  function sphGeo(r, ws, hs) {
    const k = 'sph' + r + '_' + ws + '_' + hs;
    return GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, ws, hs));
  }
  // Seeded PRNG for a prop (JB.U.rng, the same generator as ctx.rng, but seeded per prop so
  // layout does not depend on build order).
  const _rng = (seed) => JB.U.rng(seed >>> 0);
  // Seed from the prop's own fields: x/z, or the first corner of r / a for rect and line props.
  function seedOf(p, salt) {
    const ax = p.x !== undefined ? p.x : (p.r ? p.r[0] : (p.a ? p.a[0] : 0));
    const az = p.z !== undefined ? p.z : (p.r ? p.r[1] : (p.a ? p.a[1] : 0));
    const s = (p.seed !== undefined ? p.seed : 0) * 7919 + Math.round((ax || 0) * 13) * 31 + Math.round((az || 0) * 17) * 101 + Math.round((p.h || 0) * 7) + salt;
    return s >>> 0;
  }
  function floorOf(P, p) { return P.floorAt(p.x || 0, p.z || 0); }
  function groupOf(P, p) { return P.groupAt(p.x || 0, p.z || 0); }

  // Hanging leaf clump around attach point (ax,ay,az). Each card gets a crossing twin half the time,
  // so the canopy reads as crossed cards rather than single flat sheets.
  function clump(P, key, w, len, rnd, ax, ay, az, n, spread, droop, g, aof) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const tilt = (rnd() - 0.5) * spread;
      const dir = new THREE.Vector3(Math.sin(a) * (0.6 + tilt), -(droop + rnd() * 0.5), Math.cos(a) * (0.6 + tilt));
      const x = ax + (rnd() - 0.5) * 0.4, z = az + (rnd() - 0.5) * 0.4, spin = rnd() * Math.PI * 2;
      placeSpin(P, key, cardGeo(w, len, Math.floor(rnd() * 8)), x, ay, z, dir, spin, g, aof);
      if (rnd() < 0.5) placeSpin(P, key, cardGeo(w, len, Math.floor(rnd() * 8)), x, ay, z, dir, spin + Math.PI / 2, g, aof);
    }
  }

  // Continuous tube along a polyline pts [[x,y,z],...] with a radius per point. One smooth surface
  // (parallel-transported rings), so bends and tapers have no joints. Bark UVs: whole tiles around, 2 m along.
  function tube(P, key, pts, radii, seg, g, aof) {
    const n = pts.length, S = Math.max(3, seg || 8), T = [];
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
      T.push([dx / L, dy / L, dz / L]);
    }
    let N = Math.abs(T[0][0]) < 0.9 ? cross(T[0], [1, 0, 0]) : cross(T[0], [0, 1, 0]);
    const nl0 = Math.hypot(N[0], N[1], N[2]) || 1; N = [N[0] / nl0, N[1] / nl0, N[2] / nl0];
    const avgR = radii.reduce((a, b) => a + b, 0) / n, tiles = Math.max(1, Math.round(Math.PI * avgR));
    const pos = [], nor = [], uv = [], idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      const t = T[i], d = N[0] * t[0] + N[1] * t[1] + N[2] * t[2];
      N = [N[0] - d * t[0], N[1] - d * t[1], N[2] - d * t[2]];
      const nl = Math.hypot(N[0], N[1], N[2]) || 1; N = [N[0] / nl, N[1] / nl, N[2] / nl];
      const B = cross(t, N), r = radii[i];
      for (let k = 0; k <= S; k++) {
        const th = k / S * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        const nx = c * N[0] + sn * B[0], ny = c * N[1] + sn * B[1], nz = c * N[2] + sn * B[2];
        pos.push(pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r);
        nor.push(nx, ny, nz);
        uv.push(k / S * tiles, s / 2);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < S; k++) {
      const a = i * (S + 1) + k, b = a + S + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    P.addGeo(key, geo, _id, g, aof);
  }
  // Callers keep the old trunk(P, key, pts, radii, rnd, ...) signature; rnd is unused.
  function trunk(P, key, pts, radii, rnd, g, aof, seg) { tube(P, key, pts, radii, seg, g, aof); }

  // ------------------------------------------------------------------ gum_tree
  // Tall eucalyptus: one smooth pale trunk (lean and a gentle kink), 2-4 branches leaving the trunk at
  // 42-54% of h, and a sparse drooping canopy of crossed leaf cards in clumps from ~55% to 100% of h.
  JB.Props.register('gum_tree', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 11));
    const f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const h = p.h || 14;
    const r0 = 0.27 + rnd() * 0.12;                          // base radius 0.27-0.39 m
    const lean = (rnd() - 0.5) * 0.3, kink = (rnd() - 0.5) * 0.24;
    const TOP = 0.56;                                        // trunk runs to 56% of h; branches take over above
    // Trunk centre line: s = 0 at the base, s = 1 at the top of the trunk. Offsets stay small below 4 m.
    const at = (s) => {
      const ox = lean * s * s * h * 0.2 + kink * Math.sin(s * Math.PI);
      const oz = lean * 0.5 * s * s * h * 0.2 + kink * 0.5 * Math.cos(s * Math.PI) * s;
      return [p.x + ox, f + s * TOP * h, p.z + oz];
    };
    const rad = (s) => r0 * (1 - 0.45 * s);
    const N = 10, pts = [], radii = [];
    for (let i = 0; i <= N; i++) { const s = i / N; pts.push(at(s)); radii.push(rad(s)); }
    trunk(P, 'p:bark_gum', pts, radii, rnd, g, aof, 10);
    // 2-4 main branches leaving the trunk at 42-54% of h, angled outwards and up. Each starts on the trunk axis.
    const nb = 2 + Math.floor(rnd() * 3);
    const tips = [];
    for (let k = 0; k < nb; k++) {
      const sb = (0.42 + k * 0.04 + rnd() * 0.03) / TOP;
      const b = at(sb), rb = rad(sb) * 0.7;
      const ang = (k / nb) * Math.PI * 2 + rnd() * 0.9;
      const up = 0.5 + rnd() * 0.25, len = h * (0.2 + rnd() * 0.08);
      let v = [Math.sin(ang) * 0.8, up, Math.cos(ang) * 0.8];
      const vl = Math.hypot(v[0], v[1], v[2]); v = [v[0] / vl, v[1] / vl, v[2] / vl];
      const mid = [b[0] + v[0] * len * 0.5, b[1] + v[1] * len * 0.5 + 0.15, b[2] + v[2] * len * 0.5];
      const tip = [b[0] + v[0] * len, b[1] + v[1] * len, b[2] + v[2] * len];
      tube(P, 'p:bark_gum', [b, mid, tip], [rb, rb * 0.5, 0.05], 6, g, aof);
      tips.push(tip);
    }
    // Canopy: clumps of drooping cards from ~55% to 100% of h, around the branch tips and the crown.
    const nClumps = 14 + Math.floor(rnd() * 4);                // sparse: fewer, smaller clumps
    for (let i = 0; i < nClumps; i++) {
      let c;
      if (i < tips.length * 2) {
        const e = tips[i % tips.length];
        c = [e[0] + (rnd() - 0.5) * 2.4, e[1] + rnd() * 1.2, e[2] + (rnd() - 0.5) * 2.4];
      } else {
        const a = rnd() * Math.PI * 2, rr = 1.0 + rnd() * 2.4;
        c = [p.x + Math.cos(a) * rr, f + h * (0.6 + rnd() * 0.36), p.z + Math.sin(a) * rr];
      }
      c[1] = Math.min(f + h - 0.5, Math.max(f + h * 0.55, c[1]));
      clump(P, 'p:leaves_gum', 1.1, 1.5, rnd, c[0], c[1], c[2], 5 + Math.floor(rnd() * 3), 0.9, 0.5, g, aof);
    }
    // Collider: the trunk base up to 4 m, 0.6 m square or wider if the trunk leans or kinks further out.
    let x0 = p.x - 0.3, x1 = p.x + 0.3, z0 = p.z - 0.3, z1 = p.z + 0.3;
    for (let i = 0; i <= N; i++) {
      if (pts[i][1] - f > 4.5) break;
      const rr = radii[i];
      x0 = Math.min(x0, pts[i][0] - rr); x1 = Math.max(x1, pts[i][0] + rr);
      z0 = Math.min(z0, pts[i][2] - rr); z1 = Math.max(z1, pts[i][2] + rr);
    }
    ctx.solidBox(x0, f, z0, x1, f + 4, z1);
  });

  // ------------------------------------------------------------------ small_tree
  // Young street tree: thin tapering trunk and a round canopy of leaf cards on a shell.
  JB.Props.register('small_tree', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 23));
    const f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const h = p.h || 5;
    const pts = [[p.x, f, p.z], [p.x + 0.04, f + h * 0.35, p.z], [p.x, f + h * 0.65, p.z]];
    trunk(P, 'p:bark_gum', pts, [0.13, 0.09, 0.05], rnd, g, aof, 8);
    const cy = f + h * 0.72, R = Math.max(1.2, h * 0.36);
    const n = 64;
    for (let i = 0; i < n; i++) {
      // a point on the canopy shell, cards pointing outward (and a little down)
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const ox = s * Math.cos(th), oy = u, oz = s * Math.sin(th);
      const sh = (0.35 + 0.65 * rnd()) * R;
      const ax = p.x + ox * sh, ay = cy + oy * sh, az = p.z + oz * sh;
      const dir = new THREE.Vector3(ox, oy - 0.25, oz);
      placeSpin(P, 'p:leaves_round', cardGeo(0.95, 1.05, Math.floor(rnd() * 8)), ax, ay, az, dir, rnd() * Math.PI * 2, g, aof);
    }
    ctx.solidBox(p.x - 0.15, f, p.z - 0.15, p.x + 0.15, f + 1.0, p.z + 0.15);
  });

  // ------------------------------------------------------------------ orchard_tree
  // Fruit tree ~3.5 m: short trunk, a few branches, dense rounded canopy of cards. Collider: trunk only.
  JB.Props.register('orchard_tree', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 37));
    const f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const pts = [[p.x, f, p.z], [p.x, f + 0.5, p.z], [p.x, f + 1.0, p.z]];
    trunk(P, 'p:bark_gum', pts, [0.14, 0.12, 0.08], rnd, g, aof, 8);
    const nb = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < nb; k++) {
      const ang = (k / nb) * Math.PI * 2 + rnd() * 0.6;
      const e = [p.x + Math.sin(ang) * 0.9, f + 1.9 + rnd() * 0.4, p.z + Math.cos(ang) * 0.9];
      trunk(P, 'p:bark_gum', [[p.x, f + 0.9, p.z], [(p.x + e[0]) / 2, (f + 0.9 + e[1]) / 2, (p.z + e[2]) / 2], e], [0.07, 0.05, 0.03], rnd, g, aof, 6);
    }
    const cx = p.x, cy = f + 2.2, cz = p.z, R = 1.6;          // canopy ~0.6-4.0 m: about 3.5 m tree overall
    const n = 120;
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const ox = s * Math.cos(th), oy = u, oz = s * Math.sin(th);
      const rr = R * (0.2 + rnd() * 0.8);
      const dir = new THREE.Vector3(ox, oy * 0.8 - 0.2, oz);
      placeSpin(P, 'p:leaves_round', cardGeo(0.9, 1.0, Math.floor(rnd() * 8)), cx + ox * rr, cy + oy * rr * 0.9, cz + oz * rr, dir, rnd() * Math.PI * 2, g, aof);
    }
    ctx.solidBox(p.x - 0.2, f, p.z - 0.2, p.x + 0.2, f + 2, p.z + 0.2);
  });

  // ------------------------------------------------------------------ shared helpers (part B)
  const _id = new THREE.Matrix4();
  // Local (lx, lz) offset rotated by yaw about base (bx, bz) -> world [x, z].
  function lp(bx, bz, yaw, lx, lz) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [bx + lx * c + lz * s, bz - lx * s + lz * c];
  }
  // Facing: 'N','E','S','W' or radians. Radians convention matches the car: 0 faces -z (north).
  function facingAngle(f) {
    if (typeof f === 'number') return f;
    const k = { N: 0, E: Math.PI / 2, S: Math.PI, W: Math.PI * 1.5 }[String(f).toUpperCase()];
    return k === undefined ? 0 : k;
  }
  // Yaw that maps local +Z onto the facing direction (sin a, -cos a).
  function fwdYaw(a) { return Math.PI - a; }
  // Strip of vertical-ish quads through world points. bots/tops: equal-length arrays of [x,y,z].
  // uv is world scaled (2 m per tile) so textures keep their size.
  function strip(P, key, bots, tops, g, aof) {
    const n = bots.length, pos = [], nor = [], uv = [], idx = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(bots[i][0] - bots[i - 1][0], bots[i][2] - bots[i - 1][2]);
      pos.push(bots[i][0], bots[i][1], bots[i][2], tops[i][0], tops[i][1], tops[i][2]);
      uv.push(s / 2, bots[i][1] / 2, s / 2, tops[i][1] / 2);
    }
    // Face normal from the first quad (works for vertical strips and flat quads alike).
    const ex = bots[1][0] - bots[0][0], ey = bots[1][1] - bots[0][1], ez = bots[1][2] - bots[0][2];
    const vx = tops[0][0] - bots[0][0], vy = tops[0][1] - bots[0][1], vz = tops[0][2] - bots[0][2];
    let nx = ey * vz - ez * vy, ny = ez * vx - ex * vz, nz = ex * vy - ey * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    for (let i = 0; i < 2 * n; i++) nor.push(nx, ny, nz);
    for (let i = 0; i < n - 1; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    P.addGeo(key, geo, _id, g, aof);
  }
  // One flat quad through four world points (p0..p3 in order around the quad), world-scaled uv.
  function quad(P, key, p0, p1, p2, p3, g, aof) {
    strip(P, key, [p0, p3], [p1, p2], g, aof);
  }
  // Axis-aligned collider from local extents rotated by yaw about (bx, f, bz).
  function localBox(P, bx, f, bz, yaw, l0, l1, flags) {
    const c = [lp(bx, bz, yaw, l0[0], l0[2]), lp(bx, bz, yaw, l1[0], l0[2]), lp(bx, bz, yaw, l0[0], l1[2]), lp(bx, bz, yaw, l1[0], l1[2])];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of c) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    P.addBox(x0, f + l0[1], z0, x1, f + l1[1], z1, flags || 0);
  }
  function torusGeo() { return GEO.torus || (GEO.torus = (function () { const t = new THREE.TorusGeometry(0.23, 0.02, 6, 18); t.rotateX(Math.PI / 2); return t; })()); }
  function netCylGeo() {
    if (GEO.netCyl) return GEO.netCyl;
    const c = new THREE.CylinderGeometry(0.23, 0.16, 0.42, 16, 1, true);
    const uv = c.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.61, uv.getY(i) * 0.21);
    return (GEO.netCyl = c);
  }

  // ------------------------------------------------------------------ vine_row
  // Vineyard row along the long axis of r: posts, two wires, leafy vine hedge, a few grape bunches.
  JB.Props.register('vine_row', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 53));
    const r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const alongX = (x1 - x0) >= (z1 - z0);
    const ax = alongX ? x0 : cx, az = alongX ? cz : z0;   // start point of the centre line
    const bx = alongX ? x1 : cx, bz = alongX ? cz : z1;   // end point
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const yaw = Math.atan2(-uz, ux);
    const nx = -uz, nz = ux;                               // across the row
    const at = (s, o) => [ax + ux * s + nx * o, f, az + uz * s + nz * o];
    // Posts every 2.5 m on the centre line.
    const np = Math.max(1, Math.round(L / 2.5));
    for (let k = 0; k <= np; k++) {
      const s = L * k / np, q = at(s, 0);
      place(P, 'p:timber', cylGeo(0.045, 0.045, 1.8, 7), q[0], f + 0.9, q[2], UP, 0, g, aof);
    }
    // Two wires along the row.
    for (const h of [1.0, 1.6]) {
      const m = at(L / 2, 0);
      place(P, 'p:galv_dark', cylGeo(0.008, 0.008, L, 4), m[0], f + h, m[2], new THREE.Vector3(ux, 0, uz), 0, g, aof);
    }
    // Leafy hedge: vine cards in planes along the row, three layers across ~0.5 m thickness.
    for (const o of [-0.2, 0, 0.2]) {
      let s = rnd() * 0.6;
      while (s < L + 0.6) {
        const w = 1.6, len = 1.0 + rnd() * 0.3;              // cards start at 0.4 m and top out near 1.75 m
        const q = at(Math.min(s, L), o + (rnd() - 0.5) * 0.06);
        place(P, 'p:vine', cardGeo(w, len, Math.floor(rnd() * 8)), q[0], f + 0.4 + rnd() * 0.05, q[2], UP, yaw, g, aof);
        s += 1.25 + rnd() * 0.25;
      }
    }
    // Grape bunches on the front of the hedge.
    const nb = Math.max(2, Math.round(L / 6));
    for (let k = 0; k < nb; k++) {
      const s = rnd() * L, o = (rnd() - 0.5) * 0.3, h = 1.0 + rnd() * 0.4;
      const q = at(s, o);
      for (let i = 0; i < 4; i++) {
        place(P, 'p:grape', sphGeo(0.06, 6, 4), q[0] + (rnd() - 0.5) * 0.08, f + h - i * 0.045, q[2] + (rnd() - 0.5) * 0.08, UP, 0, g, aof);
      }
    }
    P.addBox(x0, f, z0, x1, f + 1.8, z1, P.F_GLASS);
    P.markSolid(x0, z0, x1, z1);
  });

  // ------------------------------------------------------------------ fence
  // Chain-link fence from a to b (axis aligned), with optional gates and a top rail.
  JB.Props.register('fence', function (p, ctx) {
    const P = ctx.P;
    const ax = p.a[0], az = p.a[1], bx = p.b[0], bz = p.b[1];
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const yaw = Math.atan2(-uz, ux), h = p.h || 2.1, top = p.top !== false;
    const pt = (d, y) => [ax + ux * d, f + y, az + uz * d];
    // Gates as sorted, clipped distance intervals.
    const gates = (p.gates || []).map((q) => [Math.max(0, Math.min(q[0], q[1])), Math.min(L, Math.max(q[0], q[1]))]).sort((u, v) => u[0] - v[0]);
    // Mesh intervals = complement of gates.
    const mesh = [];
    let s = 0;
    for (const gt of gates) { if (gt[0] > s + 1e-3) mesh.push([s, gt[0]]); s = Math.max(s, gt[1]); }
    if (L > s + 1e-3) mesh.push([s, L]);
    // Posts: evenly spaced ~2.7 m, plus a post each side of every gate.
    const np = Math.max(1, Math.ceil(L / 2.7));
    const posts = [];
    for (let k = 0; k <= np; k++) posts.push(L * k / np);
    for (const gt of gates) { posts.push(gt[0]); posts.push(gt[1]); }
    posts.sort((u, v) => u - v);
    const seen = [];
    for (const d of posts) {
      if (seen.length && Math.abs(d - seen[seen.length - 1]) < 0.05) continue;
      seen.push(d);
      const q = pt(d, h / 2);
      place(P, 'p:galv', cylGeo(0.03, 0.03, h, 6), q[0], q[1], q[2], UP, 0, g, aof);
    }
    // Top rail over each mesh run.
    if (top) for (const m of mesh) {
      const a = pt((m[0] + m[1]) / 2, h);
      place(P, 'p:galv', cylGeo(0.02, 0.02, m[1] - m[0], 5), a[0], a[1], a[2], new THREE.Vector3(ux, 0, uz), 0, g, aof);
    }
    // Chain-link mesh panels, double sided, with 2 m tiling so diamonds are ~0.08 m.
    for (const m of mesh) {
      const b0 = pt(m[0], 0), b1 = pt(m[1], 0), t0 = pt(m[0], h), t1 = pt(m[1], h);
      strip(P, 'p:chainlink', [b0, b1], [t0, t1], g, aof);
      // Collider: thin full-height box over this run (gates have none).
      const xa = Math.min(b0[0], b1[0]) - 0.025, xb = Math.max(b0[0], b1[0]) + 0.025;
      const za = Math.min(b0[2], b1[2]) - 0.025, zb = Math.max(b0[2], b1[2]) + 0.025;
      P.addBox(xa, f, za, xb, f + h, zb, P.F_GLASS);
    }
  });

  // ------------------------------------------------------------------ tennis_net
  // Net across the court along the long axis of r: 1.07 m posts at the ends, 0.914 m at the centre.
  JB.Props.register('tennis_net', function (p, ctx) {
    const P = ctx.P;
    const r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const alongX = (x1 - x0) >= (z1 - z0);
    const A = alongX ? [x0, cz] : [cx, z0], B = alongX ? [x1, cz] : [cx, z1];
    const N = 24, bots = [], tops = [], tapeTop = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t;
      const y = 0.914 + (1.07 - 0.914) * Math.pow(2 * t - 1, 2);
      bots.push([x, f, z]); tops.push([x, f + y, z]); tapeTop.push([x, f + y + 0.05, z]);
    }
    strip(P, 'p:net_dark', bots, tops, g, aof);
    strip(P, 'p:tape_white', tops, tapeTop, g, aof);
    for (const e of [A, B]) place(P, 'p:frame_dark', cylGeo(0.045, 0.045, 1.07, 8), e[0], f + 0.535, e[1], UP, 0, g, aof);
    P.addBox(x0, f, z0, x1, f + 0.95, z1, P.F_GLASS);
  });

  // ------------------------------------------------------------------ hoop
  // Basketball hoop behind the baseline: padded post, arm, backboard, orange rim and net.
  // Local frame: +Z faces the court (facing), origin on the ground at the post line's front.
  JB.Props.register('hoop', function (p, ctx) {
    const P = ctx.P, f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z), aof = ctx.aoFor(f);
    const yaw = fwdYaw(facingAngle(p.facing));
    const put = (key, geo, lx, ly, lz, dir) => { const q = lp(p.x, p.z, yaw, lx, lz); place(P, key, geo, q[0], f + ly, q[1], dir || UP, yaw, g, aof); };
    const PZ = -0.9;   // post sits 0.9 m behind the board
    put('p:galv_dark', cylGeo(0.06, 0.07, 3.4, 10), 0, 1.7, PZ);
    put('p:frame_dark', cylGeo(0.13, 0.13, 1.2, 12), 0, 0.8, PZ);
    put('p:galv_dark', boxGeo(0.5, 0.04, 0.5), 0, 0.02, PZ);
    put('p:galv', boxGeo(0.09, 0.09, 0.85), 0, 3.35, PZ + 0.425);   // arm
    put('p:galv', boxGeo(0.06, 0.6, 0.06), 0, 2.9, PZ + 0.12, new THREE.Vector3(0, 1, 0.2));  // brace
    put('p:post_white', boxGeo(1.8, 1.05, 0.05), 0, 3.425, -0.03);       // backboard, bottom at 2.9 m
    put('p:hoop_orange', boxGeo(0.59, 0.45, 0.012), 0, 3.275, 0.003);    // target square
    put('p:hoop_orange', torusGeo(), 0, 3.05, 0.38);                      // rim, radius 0.23
    put('p:net_white', netCylGeo(), 0, 3.05 - 0.21, 0.38);                // net
    // Collider: the post only.
    localBox(P, p.x, f, p.z, yaw, [-0.12, 0, PZ - 0.12], [0.12, 3.4, PZ + 0.12], 0);
  });

  // ------------------------------------------------------------------ goal
  // Soccer goal 7.32 m wide, 2.44 m high, 2 m deep; the mouth opens towards facing.
  JB.Props.register('goal', function (p, ctx) {
    const P = ctx.P, f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z), aof = ctx.aoFor(f);
    const yaw = fwdYaw(facingAngle(p.facing));
    const W = 3.66, H = 2.44, D = 2.0;
    const L = (lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); return [q[0], f + ly, q[1]]; };
    const put = (key, geo, lx, ly, lz, dir) => { const q = lp(p.x, p.z, yaw, lx, lz); place(P, key, geo, q[0], f + ly, q[1], dir || UP, yaw, g, aof); };
    // Posts and crossbar.
    for (const sx of [-W, W]) put('p:post_white', cylGeo(0.06, 0.06, H, 10), sx, H / 2, 0);
    const bar = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const cb = L(0, H, 0);
    place(P, 'p:post_white', cylGeo(0.06, 0.06, 2 * W, 10), cb[0], cb[1], cb[2], bar, 0, g, aof);
    // Net: two sides, roof and back.
    for (const sx of [-W, W]) quad(P, 'p:net_white', L(sx, 0, 0), L(sx, H, 0), L(sx, H, -D), L(sx, 0, -D), g, aof);
    quad(P, 'p:net_white', L(-W, H, 0), L(W, H, 0), L(W, H, -D), L(-W, H, -D), g, aof);
    quad(P, 'p:net_white', L(-W, 0, -D), L(-W, H, -D), L(W, H, -D), L(W, 0, -D), g, aof);
    // Colliders: posts and crossbar (solid), back net (glass).
    localBox(P, p.x, f, p.z, yaw, [-W - 0.06, 0, -0.06], [-W + 0.06, H, 0.06], 0);
    localBox(P, p.x, f, p.z, yaw, [W - 0.06, 0, -0.06], [W + 0.06, H, 0.06], 0);
    localBox(P, p.x, f, p.z, yaw, [-W, H - 0.06, -0.06], [W, H + 0.06, 0.06], 0);
    localBox(P, p.x, f, p.z, yaw, [-W, 0, -D - 0.02], [W, H, -D + 0.02], P.F_GLASS);
  });

  // ------------------------------------------------------------------ part C helpers
  // Axis-aligned footprint [x0,z0,x1,z1] of a local rectangle rotated by yaw about (bx,bz).
  function localRect(bx, bz, yaw, lx0, lz0, lx1, lz1) {
    const c = [lp(bx, bz, yaw, lx0, lz0), lp(bx, bz, yaw, lx1, lz0), lp(bx, bz, yaw, lx0, lz1), lp(bx, bz, yaw, lx1, lz1)];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const q of c) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    return [x0, z0, x1, z1];
  }
  // Solid (collider + AI footprint) over a local rectangle, from height y0 to y1.
  function solidLocal(P, bx, f, bz, yaw, lx0, lz0, lx1, lz1, y0, y1) {
    const r = localRect(bx, bz, yaw, lx0, lz0, lx1, lz1);
    P.addBox(r[0], f + y0, r[1], r[2], f + y1, r[3], 0);
    P.markSolid(r[0], r[1], r[2], r[3]);
  }
  const toHex = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);
  const wheelGeo = () => GEO.wheel || (GEO.wheel = (function () { const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14); w.rotateZ(Math.PI / 2); return w; })());
  const rimGeo = () => GEO.rim || (GEO.rim = (function () { const w = new THREE.CylinderGeometry(0.19, 0.19, 0.26, 12); w.rotateZ(Math.PI / 2); return w; })());

  // ------------------------------------------------------------------ car
  // Extrude a convex side profile prof = [[z, y], ...] across x in [xa, xb]. Edge i runs from prof[i] to
  // prof[i+1]; keyEdge is one key or one per edge; keyCap covers both side faces. Normals are flat per
  // face and winding follows the normal, so the profile order does not matter. M maps the frame to world.
  function prismX(P, prof, xa, xb, keyEdge, keyCap, M, g, aof) {
    const bins = {};
    const bin = (k) => bins[k] || (bins[k] = { p: [], n: [], uv: [], i: [] });
    const tri = (k, a, b, c, n) => {
      const cr = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
      const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
      const V = flip ? [a, c, b] : [a, b, c], B = bin(k), base = B.p.length / 3;
      for (const v of V) { B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]); B.uv.push(v[2] / 2, v[1] / 2); }
      B.i.push(base, base + 1, base + 2);
    };
    let area = 0;
    for (let i = 0; i < prof.length; i++) { const p0 = prof[i], p1 = prof[(i + 1) % prof.length]; area += p0[0] * p1[1] - p1[0] * p0[1]; }
    const sg = area >= 0 ? 1 : -1, m = prof.length;
    for (let i = 0; i < m; i++) {
      const p0 = prof[i], p1 = prof[(i + 1) % m];
      const dz = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dz, dy) || 1;
      const n = [0, -sg * dz / L, sg * dy / L];                       // outward normal of this edge
      const a = [xa, p0[1], p0[0]], b = [xb, p0[1], p0[0]], c = [xb, p1[1], p1[0]], d = [xa, p1[1], p1[0]];
      const k = Array.isArray(keyEdge) ? keyEdge[i] : keyEdge;
      tri(k, a, b, c, n); tri(k, a, c, d, n);
    }
    // Side caps: convex fans from the first profile point.
    for (const x of [xa, xb]) {
      const n = [x === xa ? -1 : 1, 0, 0], V = (q) => [x, prof[q][1], prof[q][0]];
      for (let i = 1; i < m - 1; i++) tri(keyCap, V(0), V(i), V(i + 1), n);
    }
    for (const k in bins) {
      const B = bins[k], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      geo.setIndex(B.i);
      P.addGeo(k, geo, M, g, aof);
    }
  }

  // Modern hatchback ~4.4 x 1.8 x 1.45 m. rot 0 faces -z (north); front is local -Z.
  JB.Props.register('car', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 61)), yaw = p.rot || 0;
    const f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const colour = p.color !== undefined ? toHex(p.color) : CAR_COLOURS[Math.floor(rnd() * CAR_COLOURS.length)];
    const body = bodyKey(colour);
    const M = new THREE.Matrix4().compose(new THREE.Vector3(p.x, f, p.z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
    const put = (key, geo, lx, ly, lz, dir) => { const q = lp(p.x, p.z, yaw, lx, lz); place(P, key, geo, q[0], f + ly, q[1], dir || UP, yaw, g, aof); };
    // Side profiles as [z, y] (front is -z). Lower body: full width, bonnet slope up to the windscreen base.
    prismX(P, [[-2.2, 0.28], [2.2, 0.28], [2.2, 1.0], [-1.25, 1.0], [-2.2, 0.92]], -0.9, 0.9, body, body, M, g, aof);
    // Greenhouse, inset: sloped windscreen and rear glass, body-coloured roof, tinted side glass.
    prismX(P, [[-1.2, 0.96], [-0.42, 1.44], [0.72, 1.44], [1.75, 0.96]], -0.76, 0.76,
      ['p:glass_dark', body, 'p:glass_dark', 'p:glass_dark'], 'p:glass_dark', M, g, aof);
    // Bumpers, head and tail lights, side mirrors.
    put('p:rubber', boxGeo(1.84, 0.22, 0.12), 0, 0.3, -2.2);
    put('p:rubber', boxGeo(1.84, 0.22, 0.12), 0, 0.3, 2.2);
    for (const sx of [-0.6, 0.6]) {
      put('p:lamp_head', boxGeo(0.36, 0.12, 0.04), sx, 0.86, -2.22);
      put('p:lamp_tail', boxGeo(0.36, 0.12, 0.04), sx, 0.9, 2.22);
    }
    for (const sx of [-0.98, 0.98]) put(body, boxGeo(0.12, 0.14, 0.2), sx, 1.0, -0.75);
    // Wheels: dark tyre with a silver rim cap on each side.
    for (const sx of [-0.82, 0.82]) for (const sz of [-1.4, 1.4]) {
      put('p:rubber', wheelGeo(), sx, 0.32, sz);
      put('p:wheel_rim', rimGeo(), sx, 0.32, sz);
    }
    // Colliders: lower body to 1.0 m, and the inset greenhouse footprint to 1.45 m.
    solidLocal(P, p.x, f, p.z, yaw, -0.9, -2.2, 0.9, 2.2, 0, 1.0);
    solidLocal(P, p.x, f, p.z, yaw, -0.76, -1.2, 0.76, 1.75, 1.0, 1.45);
  });

  // ------------------------------------------------------------------ bench
  // Park bench 1.8 m along local X: timber slats on a dark steel frame. Collider to 0.5 m.
  JB.Props.register('bench', function (p, ctx) {
    const P = ctx.P, yaw = p.rot || 0, f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const put = (key, geo, lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); place(P, key, geo, q[0], f + ly, q[1], UP, yaw, g, aof); };
    for (let i = 0; i < 5; i++) put('p:timber', boxGeo(1.8, 0.035, 0.09), 0, 0.46, -0.24 + i * 0.12);       // seat slats
    for (let i = 0; i < 3; i++) put('p:timber', boxGeo(1.8, 0.09, 0.03), 0, 0.6 + i * 0.12, -0.33);         // back slats
    for (const sx of [-0.8, 0.8]) {
      for (const sz of [-0.3, 0.3]) put('p:frame_dark', boxGeo(0.05, 0.46, 0.05), sx, 0.23, sz);           // legs
      put('p:frame_dark', boxGeo(0.05, 0.6, 0.05), sx, 0.7, -0.33);                                         // back uprights
      put('p:frame_dark', boxGeo(0.05, 0.05, 0.62), sx, 0.44, 0);                                           // seat frame rail
    }
    solidLocal(P, p.x, f, p.z, yaw, -0.9, -0.36, 0.9, 0.36, 0, 0.5);
  });

  // ------------------------------------------------------------------ picnic_table
  // Timber table with two attached benches (~1.8 x 1.5 m). Collider: table top to 0.75 m.
  JB.Props.register('picnic_table', function (p, ctx) {
    const P = ctx.P, yaw = p.rot || 0, f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const put = (key, geo, lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); place(P, key, geo, q[0], f + ly, q[1], UP, yaw, g, aof); };
    for (let i = 0; i < 5; i++) put('p:wood_table', boxGeo(1.8, 0.04, 0.1), 0, 0.74, -0.24 + i * 0.12);    // table top
    for (const sz of [-0.6, 0.6]) for (let i = 0; i < 3; i++) put('p:wood_table', boxGeo(1.8, 0.04, 0.1), 0, 0.44, sz - 0.1 + i * 0.1);  // seats
    for (const sx of [-0.75, 0.75]) {
      put('p:frame_dark', boxGeo(0.06, 0.74, 0.06), sx, 0.37, 0);                                       // table posts
      for (const sz of [-0.6, 0.6]) put('p:frame_dark', boxGeo(0.06, 0.44, 0.06), sx, 0.22, sz);        // seat posts
      put('p:frame_dark', boxGeo(0.06, 0.06, 1.4), sx, 0.2, 0);                                          // ground rail
    }
    solidLocal(P, p.x, f, p.z, yaw, -0.9, -0.3, 0.9, 0.3, 0, 0.75);
  });

  // ------------------------------------------------------------------ bin
  // Wheelie bin, dark green body with a coloured lid. Collider to 1.0 m.
  JB.Props.register('bin', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 71)), f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const put = (key, geo, x, y, z) => place(P, key, geo, x, f + y, z, UP, 0, g, aof);
    put('p:bin_green', boxGeo(0.56, 0.9, 0.58), p.x, 0.5, p.z);
    put(rnd() < 0.5 ? 'p:yellow' : 'p:barrel_red', boxGeo(0.6, 0.07, 0.62), p.x, 0.98, p.z);    // lid, sits on the body top (0.95 m)
    put('p:rubber', boxGeo(0.5, 0.04, 0.04), p.x, 0.86, p.z + 0.31);                              // handle bar
    // Two back wheels: discs with their axle along x.
    for (const sx of [-0.22, 0.22]) place(P, 'p:rubber', cylGeo(0.05, 0.05, 0.04, 8), p.x + sx, f + 0.05, p.z - 0.2, new THREE.Vector3(1, 0, 0), 0, g, aof);
    ctx.solidBox(p.x - 0.3, f, p.z - 0.3, p.x + 0.3, f + 1.0, p.z + 0.3);
  });

  // ------------------------------------------------------------------ street_light
  // 7 m galvanised pole with a curved outreach arm towards `facing` and a flat dark LED head.
  JB.Props.register('street_light', function (p, ctx) {
    const P = ctx.P, f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const yaw = fwdYaw(facingAngle(p.facing));
    const wp = (lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); return [q[0], f + ly, q[1]]; };
    place(P, 'p:galv', cylGeo(0.065, 0.11, 7, 10), p.x, f + 3.5, p.z, UP, 0, g, aof);
    place(P, 'p:galv_dark', boxGeo(0.4, 0.03, 0.4), p.x, f + 0.015, p.z, UP, 0, g, aof);
    const arm = [wp(0, 6.9, 0), wp(0, 7.12, 0.5), wp(0, 7.15, 1.0), wp(0, 7.0, 1.4)];
    trunk(P, 'p:galv', arm, [0.06, 0.05, 0.045, 0.04], _rng(seedOf(p, 81)), g, aof, 6);
    const h = wp(0, 6.92, 1.4);
    place(P, 'p:frame_dark', boxGeo(0.55, 0.07, 0.3), h[0], h[1], h[2], UP, yaw, g, aof);
    const l = wp(0, 6.88, 1.4);
    place(P, 'p:glass_dark', boxGeo(0.5, 0.01, 0.26), l[0], l[1], l[2], UP, yaw, g, aof);
    ctx.solidBox(p.x - 0.12, f, p.z - 0.12, p.x + 0.12, f + 7, p.z + 0.12);
  });

  // ------------------------------------------------------------------ campus sign
  // Board face texture: cream board, navy panel, white title, teal wave logo. Drawn in metres
  // (3.2 m x 1.4 m) so lettering keeps its proportions on the board.
  function gen_sign_campus(S, R) {
    const N = S.N, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const cx = cv.getContext('2d');
    cx.setTransform(N / 3.2, 0, 0, N / 1.4, 0, 0);
    cx.fillStyle = '#efe6cf'; cx.fillRect(0, 0, 3.2, 1.4);
    cx.fillStyle = '#1d3557'; cx.fillRect(0.12, 0.12, 2.96, 1.16);
    // Teal wave logo: circle with three white wave lines.
    cx.fillStyle = '#2a9d8f'; cx.beginPath(); cx.arc(0.62, 0.7, 0.3, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 0.035; cx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      cx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, x = 0.38 + t * 0.48, y = 0.6 + k * 0.1 + Math.sin(t * Math.PI * 2) * 0.05;
        i ? cx.lineTo(x, y) : cx.moveTo(x, y);
      }
      cx.stroke();
    }
    // Title (fitted to 1.9 m) and subtitle.
    cx.fillStyle = '#ffffff'; cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
    let fs = 0.26;
    cx.font = 'bold ' + fs + 'px Helvetica, Arial, sans-serif';
    const w1 = cx.measureText('WHISKER POINT').width;
    if (w1 > 1.9) { fs = fs * 1.9 / w1; cx.font = 'bold ' + fs + 'px Helvetica, Arial, sans-serif'; }
    cx.fillText('WHISKER POINT', 1.15, 0.66);
    cx.font = '0.11px Helvetica, Arial, sans-serif';
    cx.fillStyle = '#cfe3ee';
    cx.fillText('RESEARCH CAMPUS', 1.17, 0.9);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    const img = cx.getImageData(0, 0, N, N).data;
    for (let i = 0; i < N * N; i++) {
      S.c[i * 3] = img[i * 4] / 255; S.c[i * 3 + 1] = img[i * 4 + 1] / 255; S.c[i * 3 + 2] = img[i * 4 + 2] / 255;
      S.h[i] = 0.5; S.r[i] = 0.55;
    }
    S.bump = 0.2;
    void R;
  }
  if (JB.Tex && JB.Tex.register && JB.Tex.list.indexOf('sign_campus') < 0) JB.Tex.register('sign_campus', gen_sign_campus);
  JB.Props.addMaterials({
    'p:sign_board': { params: { color: 0xffffff, roughness: 0.55 }, tex: 'sign_campus' }
  });

  // Campus entrance sign: cream board (3.2 x 1.4 m, bottom at 2.4 m) carrying the drawn face on the front,
  // on a single white post behind it, with a triangular bracket under the board. Collider: post only.
  JB.Props.register('sign', function (p, ctx) {
    const P = ctx.P, f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const yaw = fwdYaw(facingAngle(p.facing));
    const at = (lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); return [q[0], f + ly, q[1]]; };
    const put = (key, geo, lx, ly, lz, dir) => { const q = at(lx, ly, lz); place(P, key, geo, q[0], q[1], q[2], dir || UP, yaw, g, aof); };
    const PZ = -0.45;                                                       // post line, behind the board (board at z 0)
    put('p:post_white', cylGeo(0.06, 0.06, 2.45, 10), 0, 1.225, PZ);        // post, ground to just under the board
    // Triangular bracket: arm from the post to the board underside, and a diagonal strut from the post.
    put('p:post_white', boxGeo(0.05, 0.05, 0.42), 0, 2.37, -0.24);
    put('p:post_white', boxGeo(0.05, 0.71, 0.05), 0, 2.015, -0.285, new THREE.Vector3(0, 0.63, 0.33));
    // Board: textured front (the drawn face), cream box for the edges and back. Bottom 2.4 m, top 3.8 m.
    put('p:sign_edge', boxGeo(3.2, 1.4, 0.06), 0, 3.1, 0);
    put('p:sign_board', new THREE.PlaneGeometry(3.2, 1.4), 0, 3.1, 0.04);
    const q = at(0, 0, PZ);
    ctx.solidBox(q[0] - 0.08, f, q[2] - 0.08, q[0] + 0.08, f + 2.4, q[2] + 0.08);
  });

  // ------------------------------------------------------------------ posts
  // n slim steel posts evenly spaced from a to b (inclusive), each with a collider.
  JB.Props.register('posts', function (p, ctx) {
    const P = ctx.P, n = Math.max(1, p.n || 1), h = p.h || 3.4;
    const ax = p.a[0], az = p.a[1], bx = p.b[0], bz = p.b[1];
    const f = P.floorAt((ax + bx) / 2, (az + bz) / 2), g = P.groupAt((ax + bx) / 2, (az + bz) / 2), aof = ctx.aoFor(f);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      place(P, 'p:post_grey', boxGeo(0.08, h, 0.08), x, f + h / 2, z, UP, 0, g, aof);
      ctx.solidBox(x - 0.04, f, z - 0.04, x + 0.04, f + h, z + 0.04);
    }
  });

  // ------------------------------------------------------------------ bike_rack
  // Galvanised inverted-U hoops on a base rail. n hoops, 0.6 m apart along local X.
  JB.Props.register('bike_rack', function (p, ctx) {
    const P = ctx.P, yaw = p.rot || 0, n = Math.max(1, p.n || 5), f = floorOf(P, p), g = groupOf(P, p), aof = ctx.aoFor(f);
    const at = (lx, ly, lz) => { const q = lp(p.x, p.z, yaw, lx, lz); return [q[0], f + ly, q[1]]; };
    const put = (key, geo, lx, ly, lz, dir) => { const q = at(lx, ly, lz); place(P, key, geo, q[0], q[1], q[2], dir || UP, yaw, g, aof); };
    const len = (n - 1) * 0.6;
    // Local axes: put() applies the yaw itself, so pass unrotated directions here (passing rotated ones doubled the yaw).
    const ex = new THREE.Vector3(1, 0, 0), ez = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const s = -len / 2 + i * 0.6;
      put('p:galv', cylGeo(0.02, 0.02, 0.7, 6), s, 0.35, -0.25);
      put('p:galv', cylGeo(0.02, 0.02, 0.7, 6), s, 0.35, 0.25);
      put('p:galv', cylGeo(0.02, 0.02, 0.5, 6), s, 0.7, 0, ez);
    }
    put('p:galv_dark', cylGeo(0.015, 0.015, len + 0.6, 5), 0, 0.04, 0, ex);
    solidLocal(P, p.x, f, p.z, yaw, -len / 2 - 0.3, -0.3, len / 2 + 0.3, 0.3, 0, 0.8);
  });

  // ------------------------------------------------------------------ canopy
  // Low flat translucent canopy at height y on slim dark corner posts. Collider: posts only.
  JB.Props.register('canopy', function (p, ctx) {
    const P = ctx.P, r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const y = p.y !== undefined ? p.y : 2.7, w = x1 - x0, d = z1 - z0, t = 0.12;
    place(P, 'p:canopy_glass', boxGeo(w, t, d), cx, y - t / 2, cz, UP, 0, g, aof);
    // Dark frame beams around the perimeter.
    place(P, 'p:frame_dark', boxGeo(w + 0.1, 0.1, 0.1), cx, y + 0.02, z0, UP, 0, g, aof);
    place(P, 'p:frame_dark', boxGeo(w + 0.1, 0.1, 0.1), cx, y + 0.02, z1, UP, 0, g, aof);
    place(P, 'p:frame_dark', boxGeo(0.1, 0.1, d + 0.1), x0, y + 0.02, cz, UP, 0, g, aof);
    place(P, 'p:frame_dark', boxGeo(0.1, 0.1, d + 0.1), x1, y + 0.02, cz, UP, 0, g, aof);
    // Slim posts at the outer corners, plus one per 8 m of long side.
    const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
    const nx = Math.max(0, Math.floor(w / 8)), nz = Math.max(0, Math.floor(d / 8));
    for (let k = 1; k <= nx; k++) { pts.push([x0 + w * k / (nx + 1), z0], [x0 + w * k / (nx + 1), z1]); }
    for (let k = 1; k <= nz; k++) { pts.push([x0, z0 + d * k / (nz + 1)], [x1, z0 + d * k / (nz + 1)]); }
    for (const q of pts) {
      place(P, 'p:frame_dark', boxGeo(0.12, y - f, 0.12), q[0], f + (y - f) / 2, q[1], UP, 0, g, aof);
      ctx.solidBox(q[0] - 0.06, f, q[1] - 0.06, q[0] + 0.06, y, q[1] + 0.06);
    }
  });

  // ------------------------------------------------------------------ barrel_vault
  // Half-cylinder (elliptical) roof over r in cladding_white, closed by arched end walls.
  // axis 'z': the barrel runs along z and the arch is visible from the south.
  JB.Props.register('barrel_vault', function (p, ctx) {
    const P = ctx.P, r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const y0 = p.y0 !== undefined ? p.y0 : 4.4, rise = p.rise || 4, alongZ = (p.axis || 'z') !== 'x';
    const N = 16, a = alongZ ? (x1 - x0) / 2 : (z1 - z0) / 2, xc = alongZ ? cx : cz;
    const L0 = alongZ ? z0 : x0, L1 = alongZ ? z1 : x1;     // extent along the barrel axis
    // Arch point for angle th (0..pi): profile u across the span, v up.
    const arch = (th) => [xc - a * Math.cos(th), y0 + rise * Math.sin(th)];
    const pos = [], nor = [], uv = [], idx = [];
    let arcLen = 0, prev = arch(0);
    const arcs = [];
    for (let i = 0; i <= N; i++) {
      const th = Math.PI * i / N, q = arch(th);
      if (i > 0) arcLen += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
      arcs.push({ u: q[0], v: q[1], s: arcLen, th });
    }
    // Surface: two rows of vertices (at L0 and L1) per arch point.
    for (const q of arcs) {
      const nu = -rise * Math.cos(q.th), nv = a * Math.sin(q.th), nl = Math.hypot(nu, nv) || 1;
      for (const L of [L0, L1]) {
        const w3 = alongZ ? [q.u, q.v, L] : [L, q.v, q.u];
        pos.push(w3[0], w3[1], w3[2]);
        const n3 = alongZ ? [nu / nl, nv / nl, 0] : [0, nv / nl, nu / nl];
        nor.push(n3[0], n3[1], n3[2]);
        uv.push(q.s / 2, L / 2);
      }
    }
    for (let i = 0; i < N; i++) { const A = 2 * i, B = A + 1, C = A + 2, D = A + 3; idx.push(A, C, B, B, C, D); }
    const surf = new THREE.BufferGeometry();
    surf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    surf.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    surf.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    surf.setIndex(idx);
    P.addGeo('p:cladding_white', surf, _id, g, aof);
    // End walls: fan from the springing centre to the arch, at both ends of the barrel.
    for (const L of [L0, L1]) {
      const wp = [], wn = [], wuv = [], wi = [];
      const C = alongZ ? [xc, y0, L] : [L, y0, xc];
      const toP = (u, v) => (alongZ ? [u, v, L] : [L, v, u]);
      wp.push(C[0], C[1], C[2]); wn.push(alongZ ? 0 : (L === L0 ? -1 : 1), 0, alongZ ? (L === L0 ? -1 : 1) : 0); wuv.push(0, 0);
      arcs.forEach((q) => { const w3 = toP(q.u, q.v); wp.push(w3[0], w3[1], w3[2]); wn.push(alongZ ? 0 : (L === L0 ? -1 : 1), 0, alongZ ? (L === L0 ? -1 : 1) : 0); wuv.push(q.s / 2, q.v / 2); });
      // vertex 0 is the springing centre; vertices 1..N+1 are the arch points in order
      for (let i = 1; i <= N; i++) wi.push(0, i, i + 1);
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
      wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
      wg.setIndex(wi);
      P.addGeo('p:cladding_white', wg, _id, g, aof);
    }
    // Eaves fascia along both springing lines.
    for (const s of [a, -a]) {
      const cxp = alongZ ? xc + s : cx, czp = alongZ ? cz : xc + s;
      const len = alongZ ? (z1 - z0) : (x1 - x0);
      place(P, 'p:frame_dark', boxGeo(alongZ ? 0.12 : len, 0.14, alongZ ? len : 0.12), cxp, y0 + 0.07, czp, UP, 0, g, aof);
    }
    P.addBox(x0, y0, z0, x1, y0 + rise, z1, 0);
  });

  // ------------------------------------------------------------------ pergola_frame
  // Open steel frame under a flat walkway roof (underside at y): posts along both long edges every ~3 m,
  // edge beams just below y, and cross rafters every 0.6 m running across the walkway.
  // axis = direction of the walkway (its long side). Colliders: posts only.
  JB.Props.register('pergola_frame', function (p, ctx) {
    const P = ctx.P, r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const y = p.y !== undefined ? p.y : 2.75, alongX = p.axis ? p.axis !== 'z' : (x1 - x0) >= (z1 - z0);
    const put = (key, geo, x, yy, z) => place(P, key, geo, x, yy, z, UP, 0, g, aof);
    const beam = 0.15, pw = 0.12;
    if (alongX) {
      // Walkway along x: edge beams along x at the two z edges, posts every ~3 m, rafters along z every 0.6 m in x.
      for (const ez of [z0 + pw / 2, z1 - pw / 2]) {
        put('p:frame_dark', boxGeo(x1 - x0, beam, pw), cx, y - beam / 2, ez);
        const np = Math.max(1, Math.round((x1 - x0) / 3));
        for (let k = 0; k <= np; k++) {
          const x = x0 + pw / 2 + (x1 - x0 - pw) * k / np;
          put('p:frame_dark', boxGeo(pw, y - beam - f, pw), x, f + (y - beam - f) / 2, ez);
          ctx.solidBox(x - pw / 2, f, ez - pw / 2, x + pw / 2, y - beam, ez + pw / 2);
        }
      }
      for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6) put('p:frame_dark', boxGeo(0.08, 0.08, z1 - z0), x, y - beam - 0.04, cz);
    } else {
      // Walkway along z: edge beams along z at the two x edges, posts every ~3 m, rafters along x every 0.6 m in z.
      for (const ex of [x0 + pw / 2, x1 - pw / 2]) {
        put('p:frame_dark', boxGeo(pw, beam, z1 - z0), ex, y - beam / 2, cz);
        const np = Math.max(1, Math.round((z1 - z0) / 3));
        for (let k = 0; k <= np; k++) {
          const z = z0 + pw / 2 + (z1 - z0 - pw) * k / np;
          put('p:frame_dark', boxGeo(pw, y - beam - f, pw), ex, f + (y - beam - f) / 2, z);
          ctx.solidBox(ex - pw / 2, f, z - pw / 2, ex + pw / 2, y - beam, z + pw / 2);
        }
      }
      for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.6) put('p:frame_dark', boxGeo(x1 - x0, 0.08, 0.08), cx, y - beam - 0.04, z);
    }
  });

  // ------------------------------------------------------------------ weather_station
  // 4 m mast with anemometer cups and a wind vane, a small solar panel and an instrument box,
  // inside a 2 x 2 m low post-and-rail enclosure.
  JB.Props.register('weather_station', function (p, ctx) {
    const P = ctx.P, f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z), aof = ctx.aoFor(f);
    const put = (key, geo, x, y, z, dir) => place(P, key, geo, x, f + y, z, dir || UP, 0, g, aof);
    const x = p.x, z = p.z;
    put('p:post_white', cylGeo(0.035, 0.035, 4, 8), x, 2, z);                       // mast
    // Anemometer: three arms with cups.
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3 + 0.4;
      const ax = x + Math.cos(a) * 0.3, az = z + Math.sin(a) * 0.3;
      put('p:galv', cylGeo(0.012, 0.012, 0.32, 5), x + Math.cos(a) * 0.16, 3.9, z + Math.sin(a) * 0.16, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      put('p:post_white', sphGeo(0.055, 8, 5), ax, 3.9, az);
    }
    // Wind vane.
    put('p:galv', cylGeo(0.012, 0.012, 0.3, 5), x, 4.1, z, UP);
    put('p:white', boxGeo(0.5, 0.015, 0.06), x, 4.2, z);
    put('p:white', boxGeo(0.12, 0.08, 0.01), x - 0.22, 4.2, z);
    // Solar panel on a bracket, tilted towards the south.
    put('p:galv', boxGeo(0.04, 0.72, 0.04), x - 0.5, 0.36, z - 0.35);   // bracket up to the panel underside
    put('p:solar', boxGeo(0.6, 0.03, 0.42), x - 0.5, 0.78, z - 0.35, new THREE.Vector3(0, 0.87, 0.5));
    // Instrument box.
    put('p:post_white', boxGeo(0.38, 0.3, 0.26), x + 0.45, 0.45, z + 0.3);
    put('p:frame_dark', boxGeo(0.4, 0.03, 0.28), x + 0.45, 0.61, z + 0.3);
    // Enclosure: four corner posts and rails at 0.5 m and 0.9 m.
    const hx = 1, hz = 1;
    for (const sx of [-hx, hx]) for (const sz of [-hz, hz]) put('p:galv', boxGeo(0.06, 1.0, 0.06), x + sx, 0.5, z + sz);
    for (const yy of [0.45, 0.9]) {
      put('p:galv', boxGeo(2, 0.04, 0.04), x, yy, z - hz);
      put('p:galv', boxGeo(2, 0.04, 0.04), x, yy, z + hz);
      put('p:galv', boxGeo(0.04, 0.04, 2), x - hx, yy, z);
      put('p:galv', boxGeo(0.04, 0.04, 2), x + hx, yy, z);
    }
    // Colliders: mast and corner posts; rails block players only (F_RAIL).
    ctx.solidBox(x - 0.06, f, z - 0.06, x + 0.06, f + 4, z + 0.06);
    for (const sx of [-hx, hx]) for (const sz of [-hz, hz]) ctx.solidBox(x + sx - 0.05, f, z + sz - 0.05, x + sx + 0.05, f + 1.0, z + sz + 0.05);
    P.addBox(x - hx, f, z - hz - 0.03, x + hx, f + 0.95, z - hz + 0.03, P.F_RAIL);
    P.addBox(x - hx, f, z + hz - 0.03, x + hx, f + 0.95, z + hz + 0.03, P.F_RAIL);
    P.addBox(x - hx - 0.03, f, z - hz, x - hx + 0.03, f + 0.95, z + hz, P.F_RAIL);
    P.addBox(x + hx - 0.03, f, z - hz, x + hx + 0.03, f + 0.95, z + hz, P.F_RAIL);
  });

  // ------------------------------------------------------------------ planter
  // Low brick planter (0.5 m, brick_tan) filled with soil and a few shrubs. Collider to 0.5 m.
  JB.Props.register('planter', function (p, ctx) {
    const P = ctx.P, rnd = _rng(seedOf(p, 91)), r = p.r, x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), z0 = Math.min(r[1], r[3]), z1 = Math.max(r[1], r[3]);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), aof = ctx.aoFor(f);
    const H = 0.5, t = 0.2, w = x1 - x0, d = z1 - z0;
    P.boxGeo('p:brick_tan', x0, f, z0, x0 + w, f + H, z0 + t, g, 'tnsew', 1);
    P.boxGeo('p:brick_tan', x0, f, z1 - t, x0 + w, f + H, z1, g, 'tnsew', 1);
    P.boxGeo('p:brick_tan', x0, f, z0 + t, x0 + t, f + H, z1 - t, g, 'tnsew', 1);
    P.boxGeo('p:brick_tan', x1 - t, f, z0 + t, x1, f + H, z1 - t, g, 'tnsew', 1);
    P.boxGeo('p:soil', x0 + t, f + 0.36, z0 + t, x1 - t, f + 0.42, z1 - t, g, 'tnsew', 1);
    // Shrubs: clumps of round leaf cards, one or two per 1.5 m of planter.
    const ns = Math.max(2, Math.round(w * d / 1.2));
    for (let k = 0; k < ns; k++) {
      const sx = x0 + t + 0.3 + rnd() * Math.max(0.1, w - 2 * t - 0.6), sz = z0 + t + 0.3 + rnd() * Math.max(0.1, d - 2 * t - 0.6);
      for (let i = 0; i < 9; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s2 = Math.sqrt(1 - u * u);
        const dir = new THREE.Vector3(s2 * Math.cos(th), 0.6 + rnd() * 0.5, s2 * Math.sin(th));
        placeSpin(P, 'p:leaves_round', cardGeo(0.6, 0.7, Math.floor(rnd() * 8)), sx + (rnd() - 0.5) * 0.3, f + 0.42, sz + (rnd() - 0.5) * 0.3, dir, rnd() * 6.28, g, aof);
      }
    }
    P.addBox(x0, f, z0, x1, f + H, z1, 0);
    P.markSolid(x0, z0, x1, z1);
  });

})();
