// Jimbog — indoor props for the Whisker Point research campus (section 3 of _kit/SPEC.md).
// Each type is registered with JB.Props.register(type, fn(p, ctx)). Materials are keyed 'p:<name>'.
// Everything is deterministic (ctx.rng). Props stand on P.floorAt(...), never assumed 0.
(function () {
  'use strict';
  const JB = window.JB;
  const hasTex = (n) => JB.Tex.list.indexOf(n) >= 0;
  const TEX_OR = (tex, fallbackColor) => (hasTex(tex) ? 0xffffff : fallbackColor);

  // Pegboard texture (only used by workbench backs): tan board with round holes on a 5 cm grid.
  // One 2 m tile = 40 x 40 holes, so it tiles seamlessly. Deterministic (the seeded R only adds tiny grain).
  JB.Tex.register('pegboard_ix', function (S, R) {
    const TH = JB.Tex.helpers, N = S.N, C = S.c, HT = S.h, RO = S.r, PITCH = 40;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = (x + 0.5) / N * PITCH, w = (y + 0.5) / N * PITCH;
      const du = u - Math.floor(u) - 0.5, dw = w - Math.floor(w) - 0.5;
      const hole = 1 - TH.sstep(0.17, 0.21, Math.sqrt(du * du + dw * dw));   // radius ~0.19 cell (~9.5 mm)
      const n = (R() - 0.5) * 0.03, k = 1 - hole;
      C[i * 3] = 0.79 * k + 0.12 * hole + n;
      C[i * 3 + 1] = 0.64 * k + 0.10 * hole + n;
      C[i * 3 + 2] = 0.45 * k + 0.08 * hole + n;
      HT[i] = 0.7 * k + 0.2 * hole;
      RO[i] = 0.85;
    }
  });

  // ------------------------------------------------------------------ materials
  // Textured materials use white colour (the texture carries the colour); the
  // fallback colour only shows when the texture is missing (bench / partial builds).
  const MATS = {
    'p:ix_timber':       { params: { color: TEX_OR('timber', 0xa37a4f), roughness: 0.75 }, tex: 'timber' },
    'p:ix_timber_light': { params: { color: TEX_OR('timber_floor', 0xd9b070), roughness: 0.6 }, tex: 'timber_floor' },
    'p:ix_book_red':     { params: { color: 0x9c2b2b, roughness: 0.8 } },
    'p:ix_book_blue':    { params: { color: 0x2b4f8c, roughness: 0.8 } },
    'p:ix_book_green':   { params: { color: 0x2f6b43, roughness: 0.8 } },
    'p:ix_book_cream':   { params: { color: 0xd8cba8, roughness: 0.85 } },
    'p:ix_book_brown':   { params: { color: 0x6b4a2e, roughness: 0.85 } },
    'p:ix_book_ochre':   { params: { color: 0xc08a2a, roughness: 0.85 } },
    'p:ix_book_grey':    { params: { color: 0x5b626b, roughness: 0.85 } },
    'p:ix_rack_black':   { params: { color: 0x0c0d0f, roughness: 0.5, metalness: 0.1 } },
    'p:ix_rack_mesh':    { params: { color: 0x25292e, roughness: 0.55, metalness: 0.3 } },
    'p:ix_sink':         { params: { color: 0xb9c1c8, roughness: 0.35, metalness: 0.4 } },
    'p:ix_alu':          { params: { color: 0xc9ced4, roughness: 0.35, metalness: 0.85 } },
    'p:ix_pegboard':     { params: { color: TEX_OR('pegboard_ix', 0xc9a372), roughness: 0.85 }, tex: 'pegboard_ix' },
    'p:ix_gym_blue':     { params: { color: 0x1f5ca8, roughness: 0.9 } },
    'p:ix_gym_blue_dk':  { params: { color: 0x18457e, roughness: 0.9 } },
    'p:ix_chair_grey':   { params: { color: 0x4d5560, roughness: 0.6, metalness: 0.2 } },
    'p:ix_chair_blue':   { params: { color: 0x2f5f8e, roughness: 0.6, metalness: 0.2 } },
    'p:ix_sofa':         { params: { color: TEX_OR('carpet_grey', 0x3b3d42), roughness: 0.95 }, tex: 'carpet_grey' },
    'p:ix_lathe_green':  { params: { color: 0x6e8a76, roughness: 0.5, metalness: 0.3 } },
    'p:ix_piano':        { params: { color: 0x0e0f11, roughness: 0.25, metalness: 0.1 } },
    'p:ix_vend_glow':    { basic: true, params: { color: new THREE.Color(0xfff3c4).multiplyScalar(1.4) } },
    'p:ix_vend_body':    { params: { color: 0xc8382f, roughness: 0.45, metalness: 0.2 } },
    'p:ix_board':        { params: { color: 0xf4f6f7, roughness: 0.3 } },
    'p:ix_desk_front':   { params: { color: TEX_OR('timber', 0x8c6a48), roughness: 0.7 }, tex: 'timber' },
    'p:ix_black_top':    { params: { color: 0x181b1f, roughness: 0.45, metalness: 0.05 } },
    'p:ix_hood_white':   { params: { color: 0xe9ecee, roughness: 0.4 } },
    'p:ix_sash':         { params: { color: 0x9fc4d6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false } }
  };
  JB.Props.addMaterials(MATS);

  // Book spine colours, picked deterministically per book.
  const SPINES = ['p:ix_book_red', 'p:ix_book_blue', 'p:ix_book_green', 'p:ix_book_cream', 'p:ix_book_brown', 'p:ix_book_ochre', 'p:ix_book_grey'];

  // ------------------------------------------------------------------ helpers
  // Footprint r = [x0,z0,x1,z1]. "along" = long axis, "across" = short axis.
  const longX = (r) => (r[2] - r[0]) >= (r[3] - r[1]);

  function makeFrame(ctx, r) {
    const P = ctx.P;
    const lx = longX(r);
    const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz);
    const A0 = lx ? r[0] : r[1], A1 = lx ? r[2] : r[3];
    const B0 = lx ? r[1] : r[0], B1 = lx ? r[3] : r[2];
    const toXZ = (a, b) => (lx ? [a, b] : [b, a]);
    // axis-aligned box in (along, height, across) coordinates
    const box = (a0, y0, b0, a1, y1, b1, key, faces, ao) => {
      const p = toXZ(a0, b0), q = toXZ(a1, b1);
      P.boxGeo(key, Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]), g, faces || 'tbnsew', ao === undefined ? 1 : ao);
    };
    return { lx, f, g, cx, cz, A0, A1, B0, B1, len: A1 - A0, depth: B1 - B0, toXZ, box };
  }

  // ------------------------------------------------------------ bookshelf {r}
  // Library shelving 2.1 m tall along the long axis of r. Double-sided if r is deeper than 0.5 m.
  function fillRow(ctx, fr, rng, y0, hMax, bFace, dir, dMax) {
    // Pass 1: lay out the books (null = gap). Pass 2: build only the faces that can be seen:
    // the top, the aisle-side front, and a side wherever there is no neighbouring book.
    const items = [];
    let a = fr.A0 + 0.035;
    const aEnd = fr.A1 - 0.035;
    while (a < aEnd - 0.02) {
      const w = 0.024 + rng() * 0.026;
      if (a + w > aEnd) break;
      if (rng() < 0.07) { a += w * (1.5 + rng() * 2); items.push(null); continue; }   // gap on the shelf
      const h = Math.min(hMax, 0.17 + rng() * 0.12);
      const d = Math.min(dMax, 0.17 + rng() * 0.05);
      const key = SPINES[Math.floor(rng() * SPINES.length)];
      const lean = rng() < 0.06 && h < 0.27 && hMax > 0.2;
      items.push({ a, w, h, d, key, lean });
      a += w;
    }
    // face letters for this row (the aisle side is bFace's side: min-b when dir > 0)
    const FC = fr.lx ? { aMin: 'w', aMax: 'e', bMin: 'n', bMax: 's' } : { aMin: 'n', aMax: 's', bMin: 'w', bMax: 'e' };
    const front = dir > 0 ? FC.bMin : FC.bMax;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      if (it.lean) {
        // leaning book: tilted about the across axis, pivot near its base
        const tilt = 0.14, geo = fr.lx ? ctx.boxG(it.w, it.h, it.d) : ctx.boxG(it.d, it.h, it.w);
        const xz = fr.toXZ(it.a + it.w / 2, bFace + dir * it.d / 2);
        const yc = y0 + (it.h / 2) * Math.cos(tilt) + (it.w / 2) * Math.sin(tilt);
        ctx.put(it.key, geo, xz[0], yc, xz[1], 0, fr.g, ctx.aoFor(fr.f), fr.lx ? 0 : tilt, fr.lx ? -tilt : 0);
        continue;
      }
      const faces = 't' + front + (items[i - 1] ? '' : FC.aMin) + (items[i + 1] ? '' : FC.aMax);
      const b1 = bFace + dir * it.d;
      fr.box(it.a, y0, Math.min(bFace, b1), it.a + it.w, y0 + it.h, Math.max(bFace, b1), it.key, faces, 0.9);   // bottom sits on the board
    }
  }

  JB.Props.register('bookshelf', function (p, ctx) {
    const rng = ctx.rng, fr = makeFrame(ctx, p.r), H = 2.1, f = fr.f;
    const dbl = fr.depth > 0.5, mid = (fr.B0 + fr.B1) / 2;
    const steel = rng() < 0.4;                       // grey steel or timber frame
    const sideKey = steel ? 'p:steel' : 'p:ix_timber';
    const boardKey = steel ? 'p:steel_dark' : 'p:ix_timber';
    // plinth, uprights, back panel (or centre partition), top cap
    fr.box(fr.A0, f, fr.B0 + 0.04, fr.A1, f + 0.1, fr.B1 - 0.04, 'p:steel_dark', 'tbnsew', 0.6);
    fr.box(fr.A0, f + 0.1, fr.B0, fr.A0 + 0.03, f + H, fr.B1, sideKey, 'tbnsew', 0.9);
    fr.box(fr.A1 - 0.03, f + 0.1, fr.B0, fr.A1, f + H, fr.B1, sideKey, 'tbnsew', 0.9);
    if (dbl) fr.box(fr.A0 + 0.03, f + 0.1, mid - 0.006, fr.A1 - 0.03, f + H - 0.025, mid + 0.006, boardKey, 'tbnsew', 0.9);
    else fr.box(fr.A0 + 0.03, f + 0.1, fr.B1 - 0.012, fr.A1 - 0.03, f + H - 0.025, fr.B1, boardKey, 'tbnsew', 0.9);
    fr.box(fr.A0, f + H - 0.025, fr.B0, fr.A1, f + H, fr.B1, boardKey, 'tbnsew', 1);
    // six book shelves: boards at 0.33 m pitch, books stand on each board
    for (let k = 0; k < 6; k++) {
      const B = f + 0.1 + k * 0.33, top = B + 0.025;
      fr.box(fr.A0 + 0.03, B, fr.B0, fr.A1 - 0.03, top, fr.B1, boardKey, 'tbnsew', 1);
      const limit = k < 5 ? B + 0.33 : f + H - 0.025;
      const hMax = limit - top - 0.02;
      if (dbl) {
        fillRow(ctx, fr, rng, top, hMax, fr.B0 + 0.015, +1, (mid - 0.01) - (fr.B0 + 0.015));
        fillRow(ctx, fr, rng, top, hMax, fr.B1 - 0.015, -1, (fr.B1 - 0.015) - (mid + 0.01));
      } else {
        fillRow(ctx, fr, rng, top, hMax, fr.B0 + 0.015, +1, (fr.B1 - 0.014) - (fr.B0 + 0.015) - 0.005);
      }
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + H, p.r[3]);
  });

  // ------------------------------------------------------------ server_rack {r}
  // Row of 0.6 m black 19" racks, 2.0 m tall, perforated door on the aisle side, LEDs, cable tray on top.
  JB.Props.register('server_rack', function (p, ctx) {
    const rng = ctx.rng, fr = makeFrame(ctx, p.r), H = 2.0, RW = 0.6, f = fr.f;
    const n = Math.max(1, Math.floor(fr.len / RW + 1e-6));
    const start = fr.A0 + (fr.len - n * RW) / 2;
    const mid = (fr.B0 + fr.B1) / 2;
    for (let i = 0; i < n; i++) {
      const a0 = start + i * RW, a1 = a0 + RW;
      fr.box(a0, f, fr.B0, a1, f + H, fr.B1, 'p:ix_rack_black', 'tbnsew', 0.9);
      // perforated door: a dark steel panel proud of the front, with a grid of square holes
      // (5 columns x 21 rows of 2 cm holes, one quad each, seen from the aisle side)
      fr.box(a0 + 0.03, f + 0.04, fr.B0 - 0.004, a1 - 0.03, f + H - 0.04, fr.B0 + 0.016, 'p:ix_rack_mesh', 'tbnsew', 0.9);
      for (let c = 0; c < 5; c++) {
        const ha = a0 + 0.13 + c * 0.085;
        for (let row = 0; row < 21; row++) {
          const hy = f + 0.1 + row * 0.09;
          fr.box(ha, hy, fr.B0 - 0.0055, ha + 0.02, hy + 0.02, fr.B0 - 0.0045, 'p:black', fr.lx ? 'n' : 'w', 1);
        }
      }
      // rows of tiny status LEDs in two columns at the door edges (front face only)
      for (let row = 0; row < 9; row++) {
        const y = f + 0.25 + row * 0.16;
        for (let c = 0; c < 2; c++) {
          const roll = rng();
          const key = roll < 0.82 ? 'p:led_green' : roll < 0.94 ? 'p:led_amber' : 'p:led_red';
          const a = a0 + (c ? 0.52 : 0.06);
          fr.box(a, y, fr.B0 - 0.014, a + 0.02, y + 0.02, fr.B0 - 0.004, key, fr.lx ? 'n' : 'w', 1);
        }
      }
    }
    // cable tray along the top
    fr.box(fr.A0 + 0.02, f + H, mid - 0.08, fr.A1 - 0.02, f + H + 0.05, mid + 0.08, 'p:ix_alu', 'tbnsew', 0.9);
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + H, p.r[3]);
  });

  // ------------------------------------------------------------ rotated-part helpers
  // Yaw from 'N','E','S','W' or a radian number. Local +z is a fixture's front.
  function yawOf(f) {
    if (typeof f === 'number') return f;
    return { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[f] || 0;
  }
  // Facing as a unit vector [dx, dz]: N = -z, S = +z, E = +x, W = -x.
  function facingVec(f) {
    const ry = yawOf(f);
    return [Math.sin(ry), Math.cos(ry)];
  }
  // World position of local point (u, v) for a fixture at (cx, cz) with yaw ry.
  function toWorld(cx, cz, ry, u, v) {
    const c = Math.cos(ry), s = Math.sin(ry);
    return [cx + u * c + v * s, cz - u * s + v * c];
  }
  // Box in fixture-local footprint (u along local x, v along local z), absolute heights.
  function lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, y0, y1, g, ao) {
    const sy = y1 - y0;
    const w = toWorld(cx, cz, ry, (u0 + u1) / 2, (v0 + v1) / 2);
    ctx.put(key, ctx.boxG(u1 - u0, sy, v1 - v0), w[0], y0 + sy / 2, w[1], ry, g, ao);
  }
  // Box centred on the origin with only the listed LOCAL faces (t b n s e w = +y, -y, -z, +z, +x, -x),
  // built once per size. Placed with ctx.put, so the faces turn with the fixture and hidden faces cost nothing.
  const FACEGEO = {};
  function faceGeo(sx, sy, sz, faces) {
    const key = [sx, sy, sz, faces].join('_');
    if (FACEGEO[key]) return FACEGEO[key];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, pos = [], nor = [], uv = [], idx = [];
    const quad = (p, n, uvf) => {
      const b = pos.length / 3;
      for (const q of p) { pos.push(q[0], q[1], q[2]); nor.push(n[0], n[1], n[2]); const t = uvf(q); uv.push(t[0], t[1]); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const uvXZ = (q) => [q[0] * 0.5, -q[2] * 0.5], uvXY = (q) => [q[0] * 0.5, q[1] * 0.5], uvZY = (q) => [q[2] * 0.5, q[1] * 0.5];
    if (faces.includes('t')) quad([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0], uvXZ);
    if (faces.includes('b')) quad([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0], uvXZ);
    if (faces.includes('s')) quad([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1], uvXY);
    if (faces.includes('n')) quad([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1], uvXY);
    if (faces.includes('e')) quad([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0], uvZY);
    if (faces.includes('w')) quad([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0], uvZY);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return (FACEGEO[key] = geo);
  }
  // Like lpart, but builds only the listed local faces.
  function lpartF(ctx, key, cx, cz, ry, u0, v0, u1, v1, y0, y1, g, ao, faces) {
    const sy = y1 - y0, w = toWorld(cx, cz, ry, (u0 + u1) / 2, (v0 + v1) / 2);
    ctx.put(key, faceGeo(u1 - u0, sy, v1 - v0, faces), w[0], y0 + sy / 2, w[1], ry, g, ao);
  }

  // Axis-aligned bounds [x0,z0,x1,z1] of a rotated local rectangle.
  function worldAABB(cx, cz, ry, u0, v0, u1, v1) {
    const pts = [toWorld(cx, cz, ry, u0, v0), toWorld(cx, cz, ry, u1, v0), toWorld(cx, cz, ry, u0, v1), toWorld(cx, cz, ry, u1, v1)];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    return [x0, z0, x1, z1];
  }
  // Axis-aligned box from any two corners.
  function abox(P, key, g, x0, y0, z0, x1, y1, z1, faces, ao) {
    P.boxGeo(key, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), g, faces || 'tbnsew', ao === undefined ? 1 : ao);
  }

  // ------------------------------------------------------------ workbench {r}
  // Heavy timber bench 0.9 m tall; steel vice at one end, pegboard with tools on the back wall.
  JB.Props.register('workbench', function (p, ctx) {
    const rng = ctx.rng, fr = makeFrame(ctx, p.r), f = fr.f, H = 0.9, len = fr.len;
    // legs (chunky timber posts), stretcher, top
    for (const a of [fr.A0, fr.A1 - 0.07]) for (const b of [fr.B0 + 0.02, fr.B1 - 0.09]) fr.box(a, f, b, a + 0.07, f + H - 0.05, b + 0.07, 'p:ix_timber', 'tbnsew', 0.8);
    fr.box(fr.A0 + 0.05, f + 0.12, fr.B0 + 0.05, fr.A1 - 0.05, f + 0.2, fr.B1 - 0.05, 'p:ix_timber', 'tbnsew', 0.8);
    fr.box(fr.A0, f + H - 0.05, fr.B0, fr.A1, f + H, fr.B1, 'p:ix_timber', 'tbnsew', 1);
    // steel vice on the front edge near one end
    fr.box(fr.A1 - 0.24, f + H, fr.B0 + 0.02, fr.A1 - 0.04, f + H + 0.1, fr.B0 + 0.16, 'p:steel', 'tbnsew', 1);
    fr.box(fr.A1 - 0.24, f + H, fr.B0 - 0.005, fr.A1 - 0.04, f + H + 0.13, fr.B0 + 0.02, 'p:steel_dark', 'tbnsew', 1);
    // pegboard back panel with tools hung on it (unless p.wall === false)
    if (p.wall !== false) {
      fr.box(fr.A0, f + H, fr.B1 - 0.018, fr.A1, f + 1.9, fr.B1, 'p:ix_pegboard', 'tbnsew', 0.9);
      const n = Math.max(3, Math.floor(len / 0.3));
      for (let k = 0; k < n; k++) {
        const a = fr.A0 + 0.1 + (k + 0.5) * (len - 0.2) / n;
        const y = f + 1.2 + rng() * 0.5;
        if (rng() < 0.5) fr.box(a, y, fr.B1 - 0.05, a + 0.025, y + 0.26, fr.B1 - 0.025, 'p:ix_timber', 'tbnsew', 0.9);
        else fr.box(a - 0.04, y + 0.18, fr.B1 - 0.04, a + 0.06, y + 0.22, fr.B1 - 0.02, 'p:steel', 'tbnsew', 0.9);
      }
    }
    // offcuts and a few loose blocks on the bench top
    const offs = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < offs; k++) {
      const a = fr.A0 + 0.15 + rng() * Math.max(0.1, len - 0.8), w = 0.1 + rng() * 0.2, h = 0.035 + rng() * 0.04;
      const b = fr.B0 + 0.25 + rng() * Math.max(0.05, fr.depth - 0.5);
      fr.box(a, f + H, b, a + w, f + H + h, b + 0.06 + rng() * 0.05, 'p:ix_timber_light', 'tbnsew', 1);
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + H, p.r[3]);
  });

  // ------------------------------------------------------------ lathe {x, z, rot?}
  // Metal lathe ~1.8 x 0.6 m on a cabinet stand, green-grey paint. Long axis = local x.
  JB.Props.register('lathe', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.rot || 0), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, y0, y1, g, ao);
    part('p:cabinet', -0.85, -0.28, 0.85, 0.28, f, f + 0.82);             // cabinet stand
    part('p:steel_dark', -0.82, -0.25, 0.82, 0.25, f, f + 0.08);           // toe kick
    part('p:ix_lathe_green', -0.9, -0.3, 0.9, 0.3, f + 0.82, f + 0.9);     // bed
    part('p:steel', -0.55, -0.1, 0.75, 0.1, f + 0.9, f + 0.96);            // slideway
    part('p:ix_lathe_green', -0.9, -0.25, -0.55, 0.25, f + 0.9, f + 1.3);  // headstock
    part('p:ix_lathe_green', 0.45, -0.16, 0.8, 0.16, f + 0.9, f + 1.22);   // tailstock
    part('p:steel', -0.5, -0.04, 0.45, 0.04, f + 0.96, f + 0.99);          // lead screw cover
    const axisY = f + 1.1, cyl = (rad, h) => ctx.cyl(rad, rad, h, 16, false);
    const at = (u, v) => toWorld(cx, cz, ry, u, v);
    let w = at(-0.62, 0);
    ctx.put('p:steel', cyl(0.09, 0.14), w[0], axisY, w[1], ry, g, ao, 0, Math.PI / 2);   // spindle nose
    w = at(-0.7, 0);
    ctx.put('p:steel', cyl(0.13, 0.04), w[0], axisY, w[1], ry, g, ao, 0, Math.PI / 2);   // chuck
    w = at(0.78, 0);
    ctx.put('p:steel_dark', cyl(0.05, 0.22), w[0], axisY, w[1], ry, g, ao, 0, Math.PI / 2); // tailstock quill
    w = at(0, 0.18);
    ctx.put('p:steel', ctx.cyl(0.02, 0.02, 1.4, 8, false), w[0], f + 0.98, w[1], ry, g, ao, 0, Math.PI / 2);  // lead screw
    const bb = worldAABB(cx, cz, ry, -0.9, -0.3, 0.9, 0.3);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 1.3, bb[3]);
  });

  // ------------------------------------------------------------ timber_rack {r}
  // Wall rack with stacked long timber lengths on steel arms, against a steel back panel.
  JB.Props.register('timber_rack', function (p, ctx) {
    const rng = ctx.rng, fr = makeFrame(ctx, p.r), f = fr.f, top = 2.35;
    fr.box(fr.A0, f, fr.B1 - 0.03, fr.A1, f + top, fr.B1, 'p:steel_dark', 'tbnsew', 0.9);   // back panel, to the floor
    for (let layer = 0; f + 0.25 + layer * 0.11 < f + top - 0.1; layer++) {
      const y = f + 0.25 + layer * 0.11;
      // arms under the boards at both ends
      for (const a of [fr.A0 + 0.12, fr.A1 - 0.15]) fr.box(a, y - 0.025, fr.B0 + 0.06, a + 0.03, y, fr.B1 - 0.03, 'p:steel_dark', 'tbnsew', 1);
      // boards side by side across the depth, staggered ends
      let b = fr.B0;
      while (b < fr.B1 - 0.05) {
        const w = Math.min(fr.B1 - b, 0.09 + rng() * 0.05);
        const a0 = fr.A0 + rng() * 0.2, a1 = fr.A1 - rng() * 0.25;
        if (a1 - a0 > 0.5) fr.box(a0, y, b, a1, y + 0.09, b + w, rng() < 0.4 ? 'p:ix_timber_light' : 'p:ix_timber', 'tnsew', 0.9);
        b += w + 0.004;
      }
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + top, p.r[3]);
  });

  // ------------------------------------------------------------ gym_mats {r}
  // Stack of folded blue gym mats, 0.4 m tall (four 0.1 m layers, each with a fold seam).
  JB.Props.register('gym_mats', function (p, ctx) {
    const rng = ctx.rng, fr = makeFrame(ctx, p.r), f = fr.f, mid = (fr.B0 + fr.B1) / 2;
    for (let t = 0; t < 4; t++) {
      const i = rng() * 0.02, y = f + t * 0.1;
      const key = rng() < 0.5 ? 'p:ix_gym_blue' : 'p:ix_gym_blue_dk';
      fr.box(fr.A0 + i, y, fr.B0 + i, fr.A1 - i, y + 0.1, fr.B1 - i, key, 'tbnsew', 0.9);
      fr.box(fr.A0 + 0.04, y + 0.1, mid - 0.012, fr.A1 - 0.04, y + 0.104, mid + 0.012, 'p:ix_gym_blue_dk', 'tbnsew', 1);  // fold seam
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + 0.4, p.r[3]);
  });

  // ------------------------------------------------------------ bleachers {r, facing}
  // Three 0.4 m tiers, each 0.8 m deep, rising toward the back. Seats face `facing`.
  JB.Props.register('bleachers', function (p, ctx) {
    const P = ctx.P, r = p.r, fv = facingVec(p.facing || 'S');
    const zAxis = Math.abs(fv[1]) >= Math.abs(fv[0]);      // depth runs along z (N/S) or x (E/W)
    const sd = zAxis ? Math.sign(fv[1]) : Math.sign(fv[0]);
    const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const dLo = zAxis ? r[1] : r[0], dHi = zAxis ? r[3] : r[2];
    const aLo = zAxis ? r[0] : r[1], aHi = zAxis ? r[2] : r[3];
    const front = sd > 0 ? dHi : dLo;                      // front edge of the lowest tier
    const bx = (a0, y0, d0, a1, y1, d1, key, faces) => {
      const p0 = zAxis ? [a0, d0] : [d0, a0], p1 = zAxis ? [a1, d1] : [d1, a1];
      abox(P, key, g, p0[0], y0, p0[1], p1[0], y1, p1[1], faces, ao);
    };
    for (let k = 0; k < 3; k++) {
      const dNear = front - sd * 0.8 * k, dFar = front - sd * 0.8 * (k + 1);
      const dA = Math.min(dNear, dFar), dB = Math.max(dNear, dFar), top = f + 0.4 * (k + 1);
      // riser on the front face of the tier, end plates, planks on top
      const rA = sd > 0 ? dNear - 0.04 : dNear, rB = sd > 0 ? dNear : dNear + 0.04;
      bx(aLo, f, rA, aHi, top, rB, 'p:steel_dark', 'tbnsew');
      bx(aLo, f, dA, aLo + 0.05, top - 0.03, dB, 'p:steel_dark', 'tbnsew');
      bx(aHi - 0.05, f, dA, aHi, top - 0.03, dB, 'p:steel_dark', 'tbnsew');
      const nPlank = Math.max(1, Math.floor((dB - dA) / 0.1));
      for (let j = 0; j < nPlank; j++) {
        const d0 = dA + j * (dB - dA) / nPlank + 0.01, d1 = dA + (j + 1) * (dB - dA) / nPlank - 0.01;
        bx(aLo + 0.03, top - 0.03, d0, aHi - 0.03, top, d1, 'p:ix_alu', 'tbnsew');
      }
      ctx.solidBox(...(zAxis ? [aLo, f, dA, aHi, top, dB] : [dA, f, aLo, dB, top, aHi]));
    }
  });

  // ------------------------------------------------------------ stacking chair (shared)
  // Local u = across the seat, v = front-back (front = +v). Seat 0.45, back top 0.85.
  function drawChair(ctx, cx, cz, ry, seatKey, g, ao, f) {
    const part = (key, u0, v0, u1, v1, y0, y1, faces) => lpartF(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao, faces);
    part(seatKey, -0.225, -0.225, 0.225, 0.225, 0.43, 0.46, 'tnsew');    // seat (underside never seen)
    part('p:steel', -0.2, 0.19, -0.17, 0.22, 0.0, 0.43, 'nsew');         // legs (tops under the seat, bottoms on the floor)
    part('p:steel', 0.17, 0.19, 0.2, 0.22, 0.0, 0.43, 'nsew');
    part('p:steel', -0.2, -0.22, -0.17, -0.19, 0.0, 0.43, 'nsew');
    part('p:steel', 0.17, -0.22, 0.2, -0.19, 0.0, 0.43, 'nsew');
    part('p:steel', -0.2, -0.21, -0.17, -0.19, 0.46, 0.6, 'nsew');       // back posts
    part('p:steel', 0.17, -0.21, 0.2, -0.19, 0.46, 0.6, 'nsew');
    part(seatKey, -0.21, -0.22, 0.21, -0.19, 0.6, 0.85, 'tnsew');        // back
  }

  // ------------------------------------------------------------ chair_rows {r, facing}
  // Rows of stacking chairs filling r; rows 0.6 m deep with 1 m aisles (1.6 m pitch).
  JB.Props.register('chair_rows', function (p, ctx) {
    const P = ctx.P, r = p.r, facing = p.facing || 'S', ry = yawOf(facing), fv = facingVec(facing);
    const zAxis = Math.abs(fv[1]) >= Math.abs(fv[0]);     // rows stack along the facing axis
    const dLo = zAxis ? r[1] : r[0], dHi = zAxis ? r[3] : r[2];
    const lLo = zAxis ? r[0] : r[1], lHi = zAxis ? r[2] : r[3];
    const cx0 = (r[0] + r[2]) / 2, cz0 = (r[1] + r[3]) / 2;
    const f = P.floorAt(cx0, cz0), g = P.groupAt(cx0, cz0), ao = ctx.aoFor(f);
    const depth = dHi - dLo, lat = lHi - lLo;
    const nRows = Math.max(1, Math.floor((depth + 1.0) / 1.6 + 1e-6));
    const used = nRows * 0.6 + (nRows - 1) * 1.0;
    const d0 = dLo + (depth - used) / 2;
    const nCh = Math.max(1, Math.floor(lat / 0.55 + 1e-6));
    const l0 = lLo + (lat - nCh * 0.55) / 2 + 0.275;
    for (let k = 0; k < nRows; k++) {
      const dc = d0 + k * 1.6 + 0.3;
      const key = k % 2 ? 'p:ix_chair_blue' : 'p:ix_chair_grey';
      for (let c = 0; c < nCh; c++) {
        const lc = l0 + c * 0.55;
        const w = zAxis ? [lc, dc] : [dc, lc];
        drawChair(ctx, w[0], w[1], ry, key, g, ao, f);
      }
      // one collider box per row, to 0.85 m
      const rowLo = l0 - 0.275, rowHi = l0 + (nCh - 1) * 0.55 + 0.275;
      const bb = zAxis ? [rowLo, dc - 0.3, rowHi, dc + 0.3] : [dc - 0.3, rowLo, dc + 0.3, rowHi];
      ctx.solidBox(bb[0], f, bb[1], bb[2], f + 0.85, bb[3]);
    }
  });

  // ------------------------------------------------------------ piano {x, z, rot?}
  // Black grand piano ~1.5 x 1.9 m, keyboard at +v, lid propped open at the back.
  JB.Props.register('piano', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.rot || 0), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    part('p:ix_piano', -0.75, -0.2, 0.75, 0.95, 0.22, 0.72);          // case
    const tail = toWorld(cx, cz, ry, 0, -0.2);
    ctx.put('p:ix_piano', ctx.cyl(0.75, 0.75, 0.5, 24, false), tail[0], f + 0.47, tail[1], ry, g, ao);  // curved tail
    part('p:white', -0.7, 0.92, 0.7, 1.05, 0.6, 0.66);                // keys, projecting from the case front
    part('p:ix_piano', -0.74, 0.9, 0.74, 1.06, 0.66, 0.72);           // key slip / front lip
    for (const [u, v] of [[-0.6, 0.7], [0.6, 0.7], [0, -0.7]]) {
      const w = toWorld(cx, cz, ry, u, v);
      ctx.put('p:ix_piano', ctx.cyl(0.03, 0.03, 0.22, 8, false), w[0], f + 0.11, w[1], ry, g, ao);
    }
    // lid: hinge at v = -0.9, 1.2 m long, raised 0.6 rad so the far edge lifts
    const th = 0.9, L = 1.1, hv = -0.9;
    const lc = toWorld(cx, cz, ry, 0, hv + (L / 2) * Math.cos(th));
    ctx.put('p:ix_piano', ctx.boxG(1.5, 0.02, L), lc[0], f + 0.74 + (L / 2) * Math.sin(th), lc[1], ry, g, ao, -th, 0);
    // prop stick from the case top to the lid
    const v1 = -0.1, y1 = 0.72, v2 = hv + (L / 2) * Math.cos(th), y2 = 0.74 + (L / 2) * Math.sin(th);
    const len = Math.hypot(v2 - v1, y2 - y1), sm = toWorld(cx, cz, ry, 0, (v1 + v2) / 2);
    ctx.put('p:steel', ctx.cyl(0.012, 0.012, len, 8, false), sm[0], f + (y1 + y2) / 2, sm[1], ry, g, ao, Math.atan2(v2 - v1, y2 - y1), 0);
    const bb = worldAABB(cx, cz, ry, -0.75, -0.95, 0.75, 0.95);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 1.0, bb[3]);
  });

  // ------------------------------------------------------------ sofa {x, z, rot?}
  // 2.2 m charcoal lounge sofa, length along local x, seat facing +v.
  JB.Props.register('sofa', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.rot || 0), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    for (const u of [-1.0, 1.0]) for (const v of [-0.35, 0.35]) part('p:black', u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 0.12);  // feet
    part('p:ix_sofa', -1.1, -0.45, 1.1, 0.45, 0.12, 0.42);                  // base
    part('p:ix_sofa', -1.1, -0.45, 1.1, -0.25, 0.42, 0.85);                 // back
    part('p:ix_sofa', -1.1, -0.45, -0.9, 0.45, 0.42, 0.65);                 // arms
    part('p:ix_sofa', 0.9, -0.45, 1.1, 0.45, 0.42, 0.65);
    part('p:ix_sofa', -0.9, -0.25, -0.02, 0.45, 0.42, 0.55);                // seat cushions
    part('p:ix_sofa', 0.02, -0.25, 0.9, 0.45, 0.42, 0.55);
    const bb = worldAABB(cx, cz, ry, -1.1, -0.45, 1.1, 0.45);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 0.8, bb[3]);
  });

  // ------------------------------------------------------------ meeting_table {r}
  // Long 0.75 m table with chairs down both long sides; collider is the table only.
  JB.Props.register('meeting_table', function (p, ctx) {
    const P = ctx.P, fr = makeFrame(ctx, p.r), f = fr.f, H = 0.75, ao = ctx.aoFor(f);
    fr.box(fr.A0, f + 0.72, fr.B0, fr.A1, f + H, fr.B1, 'p:ix_timber', 'tbnsew', 1);   // top
    for (const a of [fr.A0 + 0.1, fr.A1 - 0.16]) for (const b of [fr.B0 + 0.1, fr.B1 - 0.16]) fr.box(a, f, b, a + 0.06, f + 0.72, b + 0.06, 'p:steel_dark', 'tbnsew', 0.8);
    const n = Math.max(1, Math.floor(fr.len / 0.6 + 1e-6)), sp = fr.len / n;
    const chairsAt = [[fr.B0 - 0.35, fr.lx ? 0 : Math.PI / 2], [fr.B1 + 0.35, fr.lx ? Math.PI : -Math.PI / 2]];
    for (const [b, ry] of chairsAt) {
      for (let i = 0; i < n; i++) {
        const w = fr.toXZ(fr.A0 + (i + 0.5) * sp, b);
        drawChair(ctx, w[0], w[1], ry, 'p:ix_chair_grey', fr.g, ao, f);
      }
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + H, p.r[3]);
  });

  // ------------------------------------------------------------ printer {x, z, rot?}
  // Big office copier ~1.2 x 0.9 m, 1 m tall, with a control panel and a paper stack.
  JB.Props.register('printer', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.rot || 0), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    part('p:black', -0.55, -0.4, 0.55, 0.4, 0, 0.08);             // plinth
    part('p:white', -0.6, -0.45, 0.6, 0.45, 0.08, 0.95);          // body
    part('p:white', -0.62, -0.47, 0.62, 0.47, 0.95, 1.0);         // lid
    part('p:black', -0.5, -0.36, 0.5, 0.36, 1.0, 1.01);           // platen glass
    part('p:black', 0.25, 0.45, 0.52, 0.5, 0.62, 0.8);           // control panel
    part('p:screen', 0.3, 0.5, 0.47, 0.52, 0.7, 0.76);           // display
    part('p:ix_board', -0.5, 0.38, -0.12, 0.46, 0.35, 0.5);       // paper stack
    part('p:ix_board', -0.5, -0.4, -0.12, -0.3, 0.9, 0.95);       // output tray
    const bb = worldAABB(cx, cz, ry, -0.6, -0.45, 0.6, 0.45);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 1.0, bb[3]);
  });

  // ------------------------------------------------------------ reception_desk {r}
  // Customer counter 1.1 m tall on the B0 side, lower 0.75 m work surface behind, two monitors.
  JB.Props.register('reception_desk', function (p, ctx) {
    const fr = makeFrame(ctx, p.r), f = fr.f;
    const dF = Math.min(0.55, fr.depth * 0.6), bK = fr.B0 + dF;   // counter depth, boundary
    fr.box(fr.A0, f, fr.B0, fr.A1, f + 1.06, bK, 'p:ix_desk_front', 'nsewb', 0.9);            // counter body
    fr.box(fr.A0 - 0.02, f + 1.06, fr.B0 - 0.03, fr.A1 + 0.02, f + 1.1, bK + 0.03, 'p:bench_top', 'tbnsew', 1);
    fr.box(fr.A0, f, bK, fr.A1, f + 0.72, fr.B1, 'p:ix_desk_front', 'nsewb', 0.9);            // staff side body
    fr.box(fr.A0, f + 0.72, bK, fr.A1, f + 0.75, fr.B1, 'p:bench_top', 'tbnsew', 1);          // work surface
    // two monitors on the work surface, screens facing the staff (+across)
    const bc = fr.B1 - 0.2;
    for (const t of [0.28, 0.72]) {
      const a = fr.A0 + t * fr.len, aw = 0.24;
      fr.box(a - 0.09, f + 0.75, bc - 0.07, a + 0.09, f + 0.76, bc + 0.07, 'p:black', 'tbnsew', 1);   // foot
      fr.box(a - 0.01, f + 0.76, bc - 0.01, a + 0.01, f + 0.9, bc + 0.01, 'p:black', 'tbnsew', 1);    // neck
      fr.box(a - aw / 2, f + 0.9, bc - 0.012, a + aw / 2, f + 1.18, bc + 0.012, 'p:black', 'tbnsew', 1);
      fr.box(a - aw / 2 + 0.01, f + 0.92, bc + 0.012, a + aw / 2 - 0.01, f + 1.16, bc + 0.016, 'p:screen', 'tbnsew', 1);
    }
    // colliders: counter to 1.1 m, lower work surface to 0.75 m
    const solidAB = (a0, b0, a1, b1, y1) => {
      const p0 = fr.toXZ(a0, b0), p1 = fr.toXZ(a1, b1);
      ctx.solidBox(Math.min(p0[0], p1[0]), f, Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), f + y1, Math.max(p0[1], p1[1]));
    };
    solidAB(fr.A0, fr.B0, fr.A1, bK, 1.1);
    solidAB(fr.A0, bK, fr.A1, fr.B1, 0.75);
  });

  // ------------------------------------------------------------ fume_hood {x, z, facing}
  // Lab fume hood 1.8 wide, 0.9 deep, 2.3 tall; white cabinet, half-raised glass sash, lit control panel.
  JB.Props.register('fume_hood', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.facing || 'S'), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    part('p:black', -0.85, -0.42, 0.85, 0.42, 0, 0.08);             // plinth
    part('p:ix_hood_white', -0.9, -0.45, 0.9, 0.45, 0.08, 0.9);     // base cabinet
    part('p:ix_black_top', -0.93, -0.48, 0.93, 0.48, 0.9, 0.93);    // work surface
    part('p:ix_hood_white', -0.9, -0.45, 0.9, 0.45, 1.95, 2.3);     // top of hood
    part('p:ix_hood_white', -0.9, -0.45, -0.85, 0.45, 0.93, 1.95);  // side walls
    part('p:ix_hood_white', 0.85, -0.45, 0.9, 0.45, 0.93, 1.95);
    part('p:ix_hood_white', -0.9, -0.45, 0.9, -0.38, 0.93, 1.95);  // back wall
    part('p:ix_hood_white', -0.85, 0.38, 0.85, 0.45, 0.93, 0.98);  // lower front lip
    part('p:black', -0.85, -0.38, 0.85, 0.4, 0.98, 1.95);          // dark interior seen through the opening
    part('p:ix_sash', -0.84, 0.41, 0.84, 0.43, 1.4, 1.95);         // raised glass sash
    part('p:screen_g', 0.35, 0.45, 0.8, 0.457, 2.02, 2.2);         // lit control panel on the top front
    const bb = worldAABB(cx, cz, ry, -0.9, -0.45, 0.9, 0.45);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 2.3, bb[3]);
  });

  // ------------------------------------------------------------ vending {x, z, facing}
  // Vending machine 1.0 x 0.9 x 1.9 m with a glowing snack display on its front.
  JB.Props.register('vending', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.facing || 'S'), cx = p.x, cz = p.z;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    part('p:black', -0.46, -0.41, 0.46, 0.41, 0, 0.1);              // plinth
    part('p:ix_vend_body', -0.5, -0.45, 0.5, 0.45, 0.1, 1.9);       // cabinet
    part('p:ix_vend_glow', -0.4, 0.45, 0.4, 0.455, 0.35, 1.7);      // glowing backing panel on the front
    for (let row = 0; row < 5; row++) {
      const y = 0.4 + row * 0.27;
      for (let c = 0; c < 6; c++) {
        const u = -0.36 + c * 0.12;
        part(SPINES[(row * 3 + c) % SPINES.length], u, 0.455, u + 0.09, 0.48, y, y + 0.2);   // snack packets
      }
    }
    part('p:black', 0.25, 0.45, 0.38, 0.47, 1.0, 1.2);              // keypad
    part('p:screen_g', 0.25, 0.45, 0.38, 0.465, 1.25, 1.35);        // small display
    part('p:black', -0.3, 0.45, 0.3, 0.47, 0.12, 0.2);              // delivery tray
    const bb = worldAABB(cx, cz, ry, -0.5, -0.45, 0.5, 0.45);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 1.9, bb[3]);
  });

  // ------------------------------------------------------------ whiteboard {x, z, facing, w?}
  // Mobile whiteboard on a wheeled stand, board 1.2 m tall (bottom at 0.8 m), thin collider.
  JB.Props.register('whiteboard', function (p, ctx) {
    const P = ctx.P, ry = yawOf(p.facing || 'S'), cx = p.x, cz = p.z, w = p.w || 2.4;
    const f = P.floorAt(cx, cz), g = P.groupAt(cx, cz), ao = ctx.aoFor(f);
    const part = (key, u0, v0, u1, v1, y0, y1) => lpart(ctx, key, cx, cz, ry, u0, v0, u1, v1, f + y0, f + y1, g, ao);
    part('p:ix_board', -w / 2, -0.015, w / 2, 0.015, 0.8, 2.0);      // board (front = +v)
    part('p:ix_alu', -w / 2 - 0.02, -0.02, -w / 2, 0.02, 0.8, 2.02);  // frame
    part('p:ix_alu', w / 2, -0.02, w / 2 + 0.02, 0.02, 0.8, 2.02);
    part('p:ix_alu', -w / 2, -0.02, w / 2, 0.02, 2.0, 2.02);
    part('p:ix_alu', -w / 2, 0.0, w / 2, 0.07, 0.75, 0.8);           // tray
    part('p:black', -0.3, 0.02, -0.2, 0.05, 0.76, 0.79);             // marker
    part('p:black', 0.4, 0.02, 0.5, 0.06, 0.76, 0.8);                // eraser
    for (const u of [-w / 2 + 0.15, w / 2 - 0.15]) {
      part('p:steel', u - 0.02, -0.35, u + 0.02, 0.35, 0, 0.05);     // feet
      part('p:steel', u - 0.02, -0.03, u + 0.02, 0.03, 0.05, 0.8);   // upright behind the board
      for (const v of [-0.35, 0.35]) {
        const q = toWorld(cx, cz, ry, u, v);
        ctx.put('p:black', ctx.cyl(0.03, 0.03, 0.03, 8, false), q[0], f + 0.015, q[1], ry, g, ao);   // caster
      }
    }
    const bb = worldAABB(cx, cz, ry, -w / 2, -0.03, w / 2, 0.03);
    ctx.solidBox(bb[0], f, bb[1], bb[2], f + 2.05, bb[3]);
  });

  // ------------------------------------------------------------ lab_island {r}
  // Lab island bench 0.92 m with black top, white cabinets, a central shelf with reagent bottles,
  // and two sinks with gooseneck taps.
  JB.Props.register('lab_island', function (p, ctx) {
    const fr = makeFrame(ctx, p.r), f = fr.f, ao = ctx.aoFor(f), H = 0.92, rng = ctx.rng;
    const mid = (fr.B0 + fr.B1) / 2;
    fr.box(fr.A0, f, fr.B0 + 0.05, fr.A1, f + 0.08, fr.B1 - 0.05, 'p:black', 'tbnsew', 0.6);       // plinth
    fr.box(fr.A0 + 0.02, f + 0.08, fr.B0 + 0.04, fr.A1 - 0.02, f + 0.86, fr.B1 - 0.04, 'p:lab_cab', 'tbnsew', 0.9);
    for (let a = fr.A0 + 0.5; a < fr.A1 - 0.3; a += 0.5) {                                      // door seams
      fr.box(a - 0.004, f + 0.1, fr.B0 + 0.035, a + 0.004, f + 0.84, fr.B0 + 0.045, 'p:steel_dark', 'tbnsew', 1);
      fr.box(a - 0.004, f + 0.1, fr.B1 - 0.045, a + 0.004, f + 0.84, fr.B1 - 0.035, 'p:steel_dark', 'tbnsew', 1);
    }
    fr.box(fr.A0 - 0.01, f + 0.86, fr.B0 - 0.02, fr.A1 + 0.01, f + H, fr.B1 + 0.02, 'p:ix_black_top', 'tbnsew', 1); // matte black top
    // central shelving unit: two end uprights, two shelves with reagent bottles
    const sb0 = mid - 0.14, sb1 = mid + 0.14;
    fr.box(fr.A0 + 0.04, f + H, sb0, fr.A0 + 0.07, f + 1.85, sb1, 'p:steel_dark', 'tbnsew', 1);
    fr.box(fr.A1 - 0.07, f + H, sb0, fr.A1 - 0.04, f + 1.85, sb1, 'p:steel_dark', 'tbnsew', 1);
    for (const sy of [1.37, 1.8]) {
      fr.box(fr.A0 + 0.04, f + sy, sb0, fr.A1 - 0.04, f + sy + 0.02, sb1, 'p:steel_dark', 'tbnsew', 1);
      for (let a = fr.A0 + 0.2; a < fr.A1 - 0.2; a += 0.14) {
        if (rng() < 0.25) continue;
        const roll = rng(), key = roll < 0.6 ? 'p:glassware' : roll < 0.8 ? 'p:liquid' : 'p:bottle';
        const q = fr.toXZ(a, mid + (rng() - 0.5) * 0.12);
        ctx.put(key, ctx.cyl(0.035, 0.035, 0.16, 10, false), q[0], f + sy + 0.09, q[1], 0, fr.g, ao);
      }
    }
    // two sinks with gooseneck taps near the back edge
    for (const t of [0.3, 0.7]) {
      const a = fr.A0 + t * fr.len, bt = fr.B1 - 0.1;
      fr.box(a - 0.18, f + H, fr.B0 + 0.12, a + 0.18, f + H + 0.006, fr.B1 - 0.2, 'p:ix_sink', 'tnsew', 1);            // steel top plate
      fr.box(a - 0.14, f + H + 0.006, fr.B0 + 0.16, a + 0.14, f + H + 0.007, fr.B1 - 0.24, 'p:steel_dark', 'tnsew', 1); // dark basin
      const q = fr.toXZ(a, bt);
      ctx.put('p:chrome', ctx.cyl(0.012, 0.012, 0.28, 8, false), q[0], f + H + 0.14, q[1], 0, fr.g, ao);
      const h = fr.toXZ(a, bt - 0.12);
      ctx.put('p:chrome', ctx.cyl(0.012, 0.012, 0.24, 8, false), h[0], f + H + 0.28, h[1], 0, fr.g, ao, fr.lx ? Math.PI / 2 : 0, fr.lx ? 0 : Math.PI / 2);
    }
    ctx.solidBox(p.r[0], f, p.r[1], p.r[2], f + H, p.r[3]);
  });

})();
