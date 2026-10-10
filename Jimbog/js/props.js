// Jimbog — static props (furniture, machinery, tanks, stalls...).
// Every prop is merged into the level's per-material meshes and baked with
// the room lighting; it also registers collision boxes and floor footprints.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  // Material table used by the level's material factory (key -> params).
  function materials() {
    return {
      'p:steel': { params: { color: 0x7d858e, roughness: 0.4, metalness: 0.85 } },
      'p:steel_dark': { params: { color: 0x3a4048, roughness: 0.5, metalness: 0.8 } },
      'p:blue_steel': { params: { color: 0x2f5d8a, roughness: 0.55, metalness: 0.45 } },
      'p:tank': { params: { color: 0x9fb6b4, roughness: 0.55, metalness: 0.4 }, tex: 'painted_metal' },
      'p:tank_band': { params: { color: 0x2a2e33, roughness: 0.5, metalness: 0.8 } },
      'p:machine': { params: { color: 0x58718a, roughness: 0.55, metalness: 0.35 }, tex: 'painted_metal' },
      'p:machine_grey': { params: { color: 0x8a8f96, roughness: 0.6, metalness: 0.4 }, tex: 'metal_panel' },
      'p:wood': { params: { color: 0xc49a66 }, tex: 'crate' },
      'p:pallet': { params: { color: 0xa8875c, roughness: 0.9 } },
      'p:cardboard': { params: { color: 0xb08a5a, roughness: 0.95 } },
      'p:wrap': { params: { color: 0xd8dde2, roughness: 0.25, metalness: 0.0, transparent: false } },
      'p:bench_top': { params: { color: 0x22262b, roughness: 0.25, metalness: 0.05 } },
      'p:lab_cab': { params: { color: 0xe6e8ea, roughness: 0.45, metalness: 0.05 } },
      'p:white': { params: { color: 0xf0f1f2, roughness: 0.35, metalness: 0.0 } },
      'p:black': { params: { color: 0x15171a, roughness: 0.5, metalness: 0.2 } },
      'p:porcelain': { params: { color: 0xf4f6f6, roughness: 0.12, metalness: 0.0 } },
      'p:chrome': { params: { color: 0xd8dde3, roughness: 0.12, metalness: 1.0 } },
      'p:mirror': { params: { color: 0x6f7c88, roughness: 0.18, metalness: 0.7 } },
      'p:stall': { params: { color: 0x5f8f86, roughness: 0.4, metalness: 0.15 } },
      'p:barrel_blue': { params: { color: 0x2a6fb8, roughness: 0.5, metalness: 0.45 } },
      'p:barrel_red': { params: { color: 0xb5372b, roughness: 0.5, metalness: 0.45 } },
      'p:barrel_yellow': { params: { color: 0xe0b322, roughness: 0.5, metalness: 0.4 } },
      'p:yellow': { params: { color: 0xf0b414, roughness: 0.45, metalness: 0.3 } },
      'p:rubber': { params: { color: 0x1c1c1e, roughness: 0.9, metalness: 0.0 } },
      'p:belt': { params: { color: 0x2b2c2e, roughness: 0.85 }, tex: 'rubber' },
      'p:locker': { params: { color: 0x6c7f93, roughness: 0.5, metalness: 0.5 }, tex: 'metal_panel' },
      'p:cabinet': { params: { color: 0xa9aeb4, roughness: 0.5, metalness: 0.5 } },
      'p:hazard': { params: {}, tex: 'hazard' },
      'p:rust': { params: {}, tex: 'rust' },
      'p:bottle': { params: { color: 0x3fae5a, roughness: 0.1, metalness: 0.1, emissive: 0x0b3a14 } },
      'p:liquid': { basic: true, params: { color: new THREE.Color(0x48ff9a).multiplyScalar(1.8) } },
      'p:screen': { basic: true, params: { color: new THREE.Color(0x58c8ff).multiplyScalar(1.6) } },
      'p:screen_g': { basic: true, params: { color: new THREE.Color(0x7dff8a).multiplyScalar(1.5) } },
      'p:led_red': { basic: true, params: { color: new THREE.Color(0xff3020).multiplyScalar(2.5) } },
      'p:led_green': { basic: true, params: { color: new THREE.Color(0x30ff60).multiplyScalar(2.5) } },
      'p:led_amber': { basic: true, params: { color: new THREE.Color(0xffa020).multiplyScalar(2.5) } },
      'p:highbay': { basic: true, params: { color: new THREE.Color(0xffd9a8).multiplyScalar(3.0) } },
      'p:glassware': { params: { color: 0x9fe0d0, roughness: 0.05, metalness: 0.3 } }
    };
  }

  function build(P, list) {
    const rng = U.rng(1977);
    const dyn = [];   // animated decor descriptors
    const aoFor = (floor) => (x, y, z) => 0.55 + 0.45 * U.smooth(U.clamp((y - floor) / 0.7, 0, 1));
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), T = new THREE.Vector3();
    const UPV = new THREE.Vector3(0, 1, 0);
    const geoCache = {};
    const cyl = (rt, rb, h, seg, open) => {
      const k = 'c' + rt + '_' + rb + '_' + h + '_' + seg + (open ? 'o' : '');
      return geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open));
    };
    const sph = (r, ws, hs, ps, pl, ts, tl) => {
      const k = ['s', r, ws, hs, ps, pl, ts, tl].join('_');
      return geoCache[k] || (geoCache[k] = new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
    };
    const boxG = (sx, sy, sz) => {
      const k = 'b' + sx + '_' + sy + '_' + sz;
      return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(sx, sy, sz));
    };
    // place geometry at (x,y,z) with yaw ry (and optional roll / pitch)
    const put = (key, geo, x, y, z, ry, g, aof, rx, rz, sc) => {
      Q.setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ'));
      T.set(x, y, z);
      if (sc) S.set(sc[0], sc[1], sc[2]); else S.set(1, 1, 1);
      M4.compose(T, Q, S);
      P.addGeo(key, geo, M4, g, aof);
    };
    const solidBox = (x0, y0, z0, x1, y1, z1, flags) => {
      P.addBox(x0, y0, z0, x1, y1, z1, flags);
      P.markSolid(x0, z0, x1, z1);
    };

    // ---------------------------------------------------------------- builders
    function BUILD_shelf(p) {
      const [x0, z0, x1, z1] = p.r, f = P.floorAt((x0 + x1) / 2, (z0 + z1) / 2), g = P.groupAt((x0 + x1) / 2, (z0 + z1) / 2);
      const h = 2.4, ao = aoFor(f);
      const post = (x, z) => P.boxGeo('p:blue_steel', x - 0.04, f, z - 0.04, x + 0.04, f + h, z + 0.04, g, 'tnsew', 1);
      post(x0 + 0.04, z0 + 0.04); post(x1 - 0.04, z0 + 0.04); post(x0 + 0.04, z1 - 0.04); post(x1 - 0.04, z1 - 0.04);
      const longX = x1 - x0 > z1 - z0;
      if (longX) for (let x = x0 + 1.2; x < x1 - 0.5; x += 1.2) { post(x, z0 + 0.04); post(x, z1 - 0.04); }
      else for (let z = z0 + 1.2; z < z1 - 0.5; z += 1.2) { post(x0 + 0.04, z); post(x1 - 0.04, z); }
      for (let k = 0; k < 4; k++) {
        const y = f + 0.15 + k * 0.62;
        P.boxGeo('p:steel_dark', x0, y, z0, x1, y + 0.04, z1, g, 'tbnsew', 1);
        // cartons on the shelf
        if (k < 3) {
          let a = longX ? x0 + 0.1 : z0 + 0.1;
          const end = longX ? x1 - 0.1 : z1 - 0.1;
          while (a < end - 0.3) {
            const w = 0.3 + rng() * 0.45, hh = 0.2 + rng() * 0.3;
            if (rng() < 0.82 && a + w < end) {
              const key = rng() < 0.75 ? 'p:cardboard' : (rng() < 0.5 ? 'p:barrel_blue' : 'p:white');
              if (longX) P.boxGeo(key, a, y + 0.04, z0 + 0.06, a + w, y + 0.04 + hh, z1 - 0.06, g, 'tnsew', 0.85);
              else P.boxGeo(key, x0 + 0.06, y + 0.04, a, x1 - 0.06, y + 0.04 + hh, a + w, g, 'tnsew', 0.85);
            }
            a += w + 0.05;
          }
        }
      }
      solidBox(x0, f, z0, x1, f + h, z1);
      void ao;
    }

    function BUILD_desk(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), ao = aoFor(f);
      const top = f + 0.92;
      P.boxGeo('p:lab_cab', x0 + 0.06, f + 0.08, z0 + 0.06, x1 - 0.06, top - 0.04, z1 - 0.06, g, 'nsew', 0.9);
      P.boxGeo('p:rubber', x0 + 0.1, f, z0 + 0.1, x1 - 0.1, f + 0.08, z1 - 0.1, g, 'nsew', 0.6);
      P.boxGeo('p:bench_top', x0, top - 0.04, z0, x1, top, z1, g, 'tbnsew', 1);
      // drawer handle strips
      const longX = x1 - x0 >= z1 - z0;
      const n = Math.max(1, Math.floor((longX ? x1 - x0 : z1 - z0) / 0.6));
      for (let k = 0; k < n; k++) {
        const a = (longX ? x0 : z0) + (k + 0.5) * (longX ? x1 - x0 : z1 - z0) / n;
        if (longX) { P.boxGeo('p:steel', a - 0.12, top - 0.2, z0 + 0.03, a + 0.12, top - 0.17, z0 + 0.06, g, 'tnsew', 1); P.boxGeo('p:steel', a - 0.12, top - 0.2, z1 - 0.06, a + 0.12, top - 0.17, z1 - 0.03, g, 'tnsew', 1); }
        else { P.boxGeo('p:steel', x0 + 0.03, top - 0.2, a - 0.12, x0 + 0.06, top - 0.17, a + 0.12, g, 'tnsew', 1); P.boxGeo('p:steel', x1 - 0.06, top - 0.2, a - 0.12, x1 - 0.03, top - 0.17, a + 0.12, g, 'tnsew', 1); }
      }
      // stuff on top: a monitor, glassware, a microscope-ish block
      const items = Math.max(1, Math.round((longX ? x1 - x0 : z1 - z0) / 1.2));
      for (let k = 0; k < items; k++) {
        const t = (k + 0.5) / items;
        const ix = longX ? U.lerp(x0, x1, t) : mx + (rng() - 0.5) * 0.3;
        const iz = longX ? mz + (rng() - 0.5) * 0.3 : U.lerp(z0, z1, t);
        const r = rng();
        if (r < 0.4) {
          const ry = longX ? 0 : Math.PI / 2;
          put('p:black', boxG(0.55, 0.36, 0.04), ix, top + 0.3, iz, ry + (rng() - 0.5) * 0.4, g, ao);
          put('p:screen', boxG(0.5, 0.31, 0.005), ix + (longX ? 0 : 0.023), top + 0.3, iz + (longX ? 0.023 : 0), ry, g);
          put('p:black', boxG(0.06, 0.12, 0.06), ix, top + 0.06, iz, ry, g, ao);
          put('p:black', boxG(0.25, 0.015, 0.18), ix, top + 0.008, iz, ry, g, ao);
        } else if (r < 0.75) {
          for (let b = 0; b < 3; b++) {
            const bh = 0.12 + rng() * 0.2;
            put('p:glassware', cyl(0.04 + rng() * 0.03, 0.05 + rng() * 0.03, bh, 10), ix + (rng() - 0.5) * 0.4, top + bh / 2, iz + (rng() - 0.5) * 0.3, 0, g);
          }
          put('p:liquid', cyl(0.035, 0.035, 0.06, 8), ix, top + 0.03, iz, 0, g);
        } else {
          put('p:machine_grey', boxG(0.35, 0.3, 0.3), ix, top + 0.15, iz, 0, g, ao);
          put('p:led_green', boxG(0.04, 0.04, 0.005), ix + 0.1, top + 0.22, iz + 0.151, 0, g);
        }
      }
      solidBox(x0, f, z0, x1, top, z1);
    }

    function BUILD_cabinet(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), h = 1.95;
      P.boxGeo('p:cabinet', x0, f, z0, x1, f + h, z1, g, 'tnsew', 0.9);
      // door seams + handles on all four sides (cheap; whichever faces the room shows)
      const longX = x1 - x0 >= z1 - z0, len = longX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(len / 0.9));
      for (let k = 1; k < n; k++) {
        const a = (longX ? x0 : z0) + len * k / n;
        if (longX) P.boxGeo('p:steel_dark', a - 0.01, f + 0.05, z0 - 0.005, a + 0.01, f + h - 0.05, z1 + 0.005, g, 'ns', 1);
        else P.boxGeo('p:steel_dark', x0 - 0.005, f + 0.05, a - 0.01, x1 + 0.005, f + h - 0.05, a + 0.01, g, 'ew', 1);
      }
      solidBox(x0, f, z0, x1, f + h, z1);
    }

    function BUILD_lockers(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), h = 2.0;
      P.boxGeo('p:locker', x0, f, z0, x1, f + h, z1, g, 'tnsew', 0.9);
      const n = Math.round((z1 - z0) / 0.45);
      for (let k = 0; k < n; k++) {
        const a = z0 + (k + 0.5) * (z1 - z0) / n;
        P.boxGeo('p:steel_dark', x0 - 0.01, f + 0.05, a - (z1 - z0) / n / 2 + 0.01, x0, f + h - 0.05, a - (z1 - z0) / n / 2 + 0.02, g, 'w', 1);
        for (let v = 0; v < 4; v++) P.boxGeo('p:steel_dark', x0 - 0.008, f + 1.55 + v * 0.06, a - 0.12, x0, f + 1.58 + v * 0.06, a + 0.12, g, 'w', 1);
        P.boxGeo('p:chrome', x0 - 0.03, f + 1.0, a + 0.12, x0, f + 1.15, a + 0.15, g, 'tw', 1);
      }
      solidBox(x0, f, z0, x1, f + h, z1);
    }

    function BUILD_machine(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), h = p.big ? 2.6 : 1.8;
      P.boxGeo('p:hazard', x0, f, z0, x1, f + 0.15, z1, g, 'tnsew', 0.7);
      P.boxGeo('p:machine', x0 + 0.05, f + 0.15, z0 + 0.05, x1 - 0.05, f + h, z1 - 0.05, g, 'tnsew', 0.9);
      P.boxGeo('p:steel_dark', x0 + 0.02, f + h - 0.18, z0 + 0.02, x1 - 0.02, f + h, z1 - 0.02, g, 'tnsew', 1);
      // control panels on the two long faces
      const longX = x1 - x0 >= z1 - z0;
      for (const side of [-1, 1]) {
        if (longX) {
          const z = side < 0 ? z0 + 0.05 : z1 - 0.05;
          P.boxGeo('p:black', mx - 0.6, f + 1.0, z - (side < 0 ? 0.04 : 0), mx + 0.6, f + 1.5, z + (side > 0 ? 0.04 : 0), g, side < 0 ? 'ntb' : 'stb', 1);
          P.quad(side < 0 ? 'p:screen_g' : 'p:screen', [mx - 0.5, f + 1.12, z + side * 0.045], [mx - 0.1, f + 1.12, z + side * 0.045], [mx - 0.1, f + 1.4, z + side * 0.045], [mx - 0.5, f + 1.4, z + side * 0.045], [0, 0, side], P.uvXY, g, null, 4);
          for (let b = 0; b < 4; b++) P.boxGeo(b % 2 ? 'p:led_red' : 'p:led_amber', mx + 0.05 + b * 0.12, f + 1.2, z + side * 0.04, mx + 0.11 + b * 0.12, f + 1.26, z + side * 0.06, g, side < 0 ? 'n' : 's', 1);
        } else {
          const x = side < 0 ? x0 + 0.05 : x1 - 0.05;
          P.boxGeo('p:black', x - (side < 0 ? 0.04 : 0), f + 1.0, mz - 0.6, x + (side > 0 ? 0.04 : 0), f + 1.5, mz + 0.6, g, side < 0 ? 'wtb' : 'etb', 1);
          for (let b = 0; b < 4; b++) P.boxGeo(b % 2 ? 'p:led_green' : 'p:led_amber', x + side * 0.04, f + 1.2, mz - 0.3 + b * 0.15, x + side * 0.06, f + 1.26, mz - 0.24 + b * 0.15, g, side < 0 ? 'w' : 'e', 1);
        }
      }
      // pipes rising to the ceiling
      const ceil = P.ceilAt(mx, mz);
      put('p:steel', cyl(0.09, 0.09, ceil - (f + h), 10), x0 + 0.35, (f + h + ceil) / 2, z0 + 0.35, 0, g);
      put('p:steel', cyl(0.06, 0.06, ceil - (f + h), 10), x1 - 0.35, (f + h + ceil) / 2, z1 - 0.35, 0, g);
      solidBox(x0, f, z0, x1, f + h, z1);
    }

    function crate(x, z, s, y, g, ry) {
      const ao = aoFor(P.floorAt(x, z));
      put('p:wood', boxG(s, s, s), x, y + s / 2, z, ry, g, ao);
      // edge frame
      const e = 0.07, hs = s / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('p:pallet', boxG(e, s + 0.01, e), x + dx * (hs - e / 2 + 0.005), y + s / 2, z + dz * (hs - e / 2 + 0.005), ry, g, ao);
      solidBox(x - hs, y, z - hs, x + hs, y + s, z + hs);
    }
    function BUILD_crates(p) {
      const f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z);
      const s0 = 1.1;
      crate(p.x, p.z, s0, f, g, 0);
      if (p.n >= 2) crate(p.x + 1.0, p.z + (rng() - 0.5) * 0.2, 0.85, f, g, 0);
      if (p.n >= 3) crate(p.x + 0.05, p.z, 0.8, f + s0, g, 0);
    }

    function BUILD_pipes(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const ceil = P.ceilAt(mx, mz), g = P.groupAt(mx, mz);
      const along = p.axis === 'x';
      const len = along ? x1 - x0 : z1 - z0;
      const radii = [0.12, 0.08, 0.06];
      radii.forEach((r, k) => {
        const off = 0.3 + k * 0.32;
        const y = ceil - 0.25 - (k % 2) * 0.12;
        const key = k === 0 ? 'p:steel' : (k === 1 ? 'p:blue_steel' : 'p:barrel_red');
        if (along) put(key, cyl(r, r, len, 10, true), mx, y, z0 + off, 0, g, null, 0, Math.PI / 2);
        else put(key, cyl(r, r, len, 10, true), x0 + off, y, mz, 0, g, null, Math.PI / 2, 0);
      });
      // brackets
      for (let a = 1; a < len; a += 2.5) {
        if (along) P.boxGeo('p:steel_dark', x0 + a - 0.03, ceil - 0.5, z0 + 0.1, x0 + a + 0.03, ceil, z0 + 1.1, g, 'nsewb', 1);
        else P.boxGeo('p:steel_dark', x0 + 0.1, ceil - 0.5, z0 + a - 0.03, x0 + 1.1, ceil, z0 + a + 0.03, g, 'nsewb', 1);
      }
    }

    function BUILD_barrels(p) {
      const f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z), ao = aoFor(f);
      const offs = [[0, 0], [0.66, 0.1], [0.3, 0.62], [-0.4, 0.55]];
      for (let k = 0; k < p.n; k++) {
        const x = p.x + offs[k][0], z = p.z + offs[k][1];
        const r = rng();
        const key = r < 0.6 ? 'p:barrel_blue' : (r < 0.82 ? 'p:barrel_red' : 'p:barrel_yellow');
        const h = 0.9, rad = 0.3;
        put(key, cyl(rad, rad, h, 18), x, f + h / 2, z, rng() * 6, g, ao);
        for (const ry of [0.18, 0.5, 0.82]) put('p:steel_dark', cyl(rad + 0.012, rad + 0.012, 0.035, 18, true), x, f + h * ry, z, 0, g, ao);
        put('p:steel_dark', cyl(rad - 0.02, rad - 0.02, 0.01, 18), x, f + h + 0.004, z, 0, g);
        put('p:steel', cyl(0.035, 0.035, 0.025, 8), x + 0.14, f + h + 0.015, z + 0.05, 0, g);
        solidBox(x - rad, f, z - rad, x + rad, f + h, z + rad);
      }
    }

    function BUILD_tanks(p) {
      for (const x of p.xs) for (const z of p.zs) {
        const f = P.floorAt(x, z), g = P.groupAt(x, z), ceil = P.ceilAt(x, z), ao = aoFor(f);
        const r = 1.05, h = 6.2;
        put('p:tank_band', cyl(r + 0.08, r + 0.12, 0.35, 28), x, f + 0.175, z, 0, g, ao);
        put('p:tank', cyl(r, r, h, 28), x, f + 0.35 + h / 2, z, 0, g, ao);
        put('p:tank', sph(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, f + 0.35 + h, z, 0, g);
        for (const yy of [1.6, 3.4, 5.2]) put('p:tank_band', cyl(r + 0.03, r + 0.03, 0.12, 28, true), x, f + 0.35 + yy, z, 0, g);
        // sight gauge with glowing liquid
        const gx = x + (x < 89 ? -r - 0.05 : r + 0.05);
        put('p:glassware', cyl(0.06, 0.06, 3.0, 8), gx, f + 2.2, z, 0, g);
        put('p:liquid', cyl(0.04, 0.04, 1.8 + rng() * 1.0, 8), gx, f + 1.7, z, 0, g);
        // outlet pipe up into the roof
        put('p:steel', cyl(0.14, 0.14, ceil - (f + h + 1.2), 12), x, (f + h + 1.2 + ceil) / 2, z, 0, g);
        put('p:steel', cyl(0.12, 0.12, 1.4, 10, true), x, f + 0.6, z + (z % 2 > 1 ? 1.4 : -1.4), 0, g, ao, Math.PI / 2, 0);
        solidBox(x - r - 0.08, f, z - r - 0.08, x + r + 0.08, f + h + 1.2, z + r + 0.08);
      }
    }

    function BUILD_conveyor(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), top = f + 0.95;
      for (let z = z0 + 0.3; z < z1; z += 1.6) {
        P.boxGeo('p:steel_dark', x0 + 0.1, f, z - 0.05, x0 + 0.2, top - 0.1, z + 0.05, g, 'nsew', 0.9);
        P.boxGeo('p:steel_dark', x1 - 0.2, f, z - 0.05, x1 - 0.1, top - 0.1, z + 0.05, g, 'nsew', 0.9);
      }
      P.boxGeo('p:steel', x0, top - 0.15, z0, x0 + 0.12, top + 0.12, z1, g, 'tnsew', 1);
      P.boxGeo('p:steel', x1 - 0.12, top - 0.15, z0, x1, top + 0.12, z1, g, 'tnsew', 1);
      P.boxGeo('p:belt', x0 + 0.12, top - 0.08, z0, x1 - 0.12, top, z1, g, 'tnsb', 1);
      // bottles marching down the line
      for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.32) {
        for (const ox of [-0.35, 0, 0.35]) {
          if (rng() < 0.2) continue;
          const bx = mx + ox;
          put('p:bottle', cyl(0.07, 0.07, 0.24, 10), bx, top + 0.12, z, 0, g);
          put('p:bottle', cyl(0.025, 0.06, 0.1, 10), bx, top + 0.29, z, 0, g);
        }
      }
      solidBox(x0, f, z0, x1, top + 0.3, z1);
      // the bottle filler gantry
      const gz = (z0 + z1) / 2;
      P.boxGeo('p:machine', x0 - 0.1, f, gz - 0.4, x0 + 0.1, f + 2.6, gz + 0.4, g, 'tnsew', 0.9);
      P.boxGeo('p:machine', x1 - 0.1, f, gz - 0.4, x1 + 0.1, f + 2.6, gz + 0.4, g, 'tnsew', 0.9);
      P.boxGeo('p:machine', x0 - 0.1, f + 2.2, gz - 0.45, x1 + 0.1, f + 2.7, gz + 0.45, g, 'tbnsew', 1);
      P.boxGeo('p:led_green', x0 + 0.4, f + 2.45, gz + 0.45, x0 + 0.5, f + 2.55, gz + 0.47, g, 's', 1);
      P.boxGeo('p:led_red', x0 + 0.6, f + 2.45, gz + 0.45, x0 + 0.7, f + 2.55, gz + 0.47, g, 's', 1);
    }

    function BUILD_forklift(p) {
      const f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z), ry = p.rot || 0, ao = aoFor(f);
      const c = Math.cos(ry), s = Math.sin(ry);
      const at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      const part = (key, geo, lx, y, lz, rx, rz) => { const [x, z] = at(lx, lz); put(key, geo, x, y, z, ry, g, ao, rx, rz); };
      part('p:yellow', boxG(1.1, 0.7, 1.9), 0, f + 0.55, 0);
      part('p:steel_dark', boxG(1.05, 0.5, 0.5), 0, f + 0.9, 0.75);          // counterweight
      part('p:black', boxG(0.5, 0.12, 0.5), 0, f + 0.98, 0.1);               // seat
      part('p:black', boxG(0.5, 0.5, 0.1), 0, f + 1.2, 0.35);
      for (const [lx, lz] of [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0.65], [0.5, 0.65]]) part('p:rubber', cyl(0.25, 0.25, 0.22, 16), lx, f + 0.25, lz, 0, Math.PI / 2);
      for (const lx of [-0.5, 0.5]) for (const lz of [-0.6, 0.6]) part('p:steel_dark', boxG(0.06, 1.3, 0.06), lx, f + 1.55, lz * 0.9);
      part('p:steel_dark', boxG(1.1, 0.06, 1.2), 0, f + 2.2, 0);
      for (const lx of [-0.3, 0.3]) part('p:steel_dark', boxG(0.08, 2.4, 0.1), lx, f + 1.2, -1.0);
      part('p:steel_dark', boxG(0.8, 0.12, 0.1), 0, f + 0.35, -1.0);
      for (const lx of [-0.25, 0.25]) part('p:steel', boxG(0.12, 0.05, 1.1), lx, f + 0.12, -1.6);
      // a pallet on the forks
      part('p:pallet', boxG(1.0, 0.14, 1.0), 0, f + 0.22, -1.6);
      part('p:cardboard', boxG(0.9, 0.7, 0.9), 0, f + 0.64, -1.6);
      const ex = 1.4;
      solidBox(p.x - ex, f, p.z - ex, p.x + ex, f + 2.2, p.z + ex);
    }

    function BUILD_pallets(p) {
      const f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z);
      for (let k = 0; k < 4; k++) P.boxGeo('p:pallet', p.x - 0.6, f + k * 0.15, p.z - 0.5, p.x + 0.6, f + k * 0.15 + 0.13, p.z + 0.5, g, 'tnsew', 0.8);
      P.boxGeo('p:wrap', p.x - 0.55, f + 0.6, p.z - 0.45, p.x + 0.55, f + 1.5, p.z + 0.45, g, 'tnsew', 0.9);
      solidBox(p.x - 0.6, f, p.z - 0.5, p.x + 0.6, f + 1.5, p.z + 0.5);
    }

    function BUILD_sinks(p) {
      const [x0, z0, x1, z1] = p.r, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const f = P.floorAt(mx, mz), g = P.groupAt(mx, mz), ao = aoFor(f), top = f + 0.88;
      P.boxGeo('p:white', x0, f, z0, x1, top, z1, g, 'nsew', 0.85);
      P.boxGeo('p:bench_top', x0 - 0.04, top, z0 - 0.04, x1 + 0.04, top + 0.05, z1 + 0.04, g, 'tbnsew', 1);
      // mirror wall down the middle
      P.boxGeo('p:steel_dark', mx - 0.08, top + 0.05, z0 + 0.1, mx + 0.08, f + 2.3, z1 - 0.1, g, 'tnsew', 1);
      P.boxGeo('p:mirror', mx - 0.09, top + 0.35, z0 + 0.25, mx + 0.09, f + 2.05, z1 - 0.25, g, 'ew', 1);
      const n = Math.max(2, Math.round((z1 - z0) / 1.3));
      for (let k = 0; k < n; k++) {
        const z = z0 + (k + 0.5) * (z1 - z0) / n;
        for (const side of [-1, 1]) {
          const x = side < 0 ? x0 + 0.42 : x1 - 0.42;
          put('p:porcelain', sph(0.24, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), x, top + 0.05, z, 0, g, null, 0, 0, [1, 0.55, 1]);
          put('p:chrome', cyl(0.025, 0.025, 0.25, 8), x + side * 0.28, top + 0.17, z, 0, g);
          put('p:chrome', cyl(0.02, 0.02, 0.18, 8), x + side * 0.2, top + 0.28, z, 0, g, null, 0, Math.PI / 2);
        }
      }
      solidBox(x0, f, z0, x1, f + 2.3, z1);
      void ao;
    }

    function toilet(x, z, f, g, ry) {
      const ao = aoFor(f);
      put('p:porcelain', cyl(0.17, 0.13, 0.38, 14), x, f + 0.19, z, 0, g, ao);
      put('p:porcelain', cyl(0.21, 0.19, 0.08, 16), x, f + 0.42, z, 0, g, null, 0, 0, [1, 1, 1.25]);
      put('p:white', cyl(0.2, 0.2, 0.02, 16), x, f + 0.47, z, 0, g, null, 0, 0, [1, 1, 1.25]);
      const bz = z + Math.cos(ry) * 0.3, bx = x + Math.sin(ry) * 0.3;
      put('p:porcelain', boxG(0.42, 0.38, 0.18), bx, f + 0.66, bz, ry, g, ao);
      put('p:chrome', boxG(0.06, 0.02, 0.03), bx + 0.12, f + 0.86, bz, ry, g);
      P.addBox(x - 0.25, f, z - 0.3, x + 0.25, f + 0.5, z + 0.3);
    }
    function BUILD_stalls(p) {
      const top = p.side === 'top';
      const front = top ? p.z1 : p.z0, back = top ? p.z0 : p.z1;
      const xs = p.xs;
      const midZ = (p.z0 + p.z1) / 2;
      const f = P.floorAt((xs[0] + xs[xs.length - 1]) / 2, midZ), g = P.groupAt((xs[0] + xs[xs.length - 1]) / 2, midZ);
      const ph = 2.0, lift = 0.15, t = 0.03;
      // dividers
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k];
        if (x <= 0.01 || x >= 12.49) continue;
        P.boxGeo('p:stall', x - t, f + lift, Math.min(front, back), x + t, f + ph, Math.max(front, back), g, 'tnsew', 1);
        P.addBox(x - t, f + lift, Math.min(front, back), x + t, f + ph, Math.max(front, back));
      }
      // front panels with door openings, toilets, door leaves
      for (let k = 0; k < xs.length - 1; k++) {
        const a = xs[k], b = xs[k + 1], mid = (a + b) / 2, dw = 0.85;
        const fz0 = front - t, fz1 = front + t;
        P.boxGeo('p:stall', a, f + lift, fz0, mid - dw / 2, f + ph, fz1, g, 'tnsew', 1);
        P.boxGeo('p:stall', mid + dw / 2, f + lift, fz0, b, f + ph, fz1, g, 'tnsew', 1);
        P.addBox(a, f + lift, fz0, mid - dw / 2, f + ph, fz1);
        P.addBox(mid + dw / 2, f + lift, fz0, b, f + ph, fz1);
        // door leaf swung open into the stall
        const hingeX = mid - dw / 2, ang = 1.15 + rng() * 0.3;
        const dz = top ? -1 : 1;
        const lx = hingeX + Math.cos(ang) * dw / 2, lz = front + dz * Math.sin(ang) * dw / 2;
        put('p:stall', boxG(dw, ph - lift - 0.1, 0.03), lx, f + (ph + lift) / 2, lz, top ? ang : -ang, g);
        const tz = back + (top ? 0.45 : -0.45);
        toilet(mid, tz, f, g, top ? Math.PI : 0);
        // toilet roll holder
        P.boxGeo('p:chrome', b - 0.08, f + 0.7, tz - 0.05, b - 0.03, f + 0.8, tz + 0.12, g, 'tnsew', 1);
      }
    }

    function BUILD_vents(p) {
      const f = P.floorAt(p.x, p.z), g = P.groupAt(p.x, p.z);
      P.boxGeo('p:steel_dark', p.x - 0.5, f, p.z - 0.5, p.x + 0.5, f + 0.03, p.z + 0.5, g, 'tnsew', 1);
      for (let k = -4; k <= 4; k++) P.boxGeo('p:steel', p.x - 0.45, f + 0.03, p.z + k * 0.1 - 0.015, p.x + 0.45, f + 0.045, p.z + k * 0.1 + 0.015, g, 'tns', 1);
      dyn.push({ t: 'fan', x: p.x, y: f - 0.15, z: p.z });
    }

    const BUILD = {
      shelf: BUILD_shelf, desk: BUILD_desk, cabinet: BUILD_cabinet, lockers: BUILD_lockers, machine: BUILD_machine,
      crates: BUILD_crates, pipes: BUILD_pipes, barrels: BUILD_barrels, tanks: BUILD_tanks, conveyor: BUILD_conveyor,
      forklift: BUILD_forklift, pallets: BUILD_pallets, sinks: BUILD_sinks, stalls: BUILD_stalls, vents: BUILD_vents
    };
    for (const p of list) {
      const fn = BUILD[p.t];
      if (fn) fn(p);
    }
    return dyn;
  }

  // Hanging high-bay lamp used by the level's light fixtures.
  function highbay(P, x, y, z, g) {
    const M4 = new THREE.Matrix4().makeTranslation(x, y - 0.18, z);
    P.addGeo('p:steel_dark', new THREE.CylinderGeometry(0.12, 0.42, 0.36, 18, 1, true), M4, g);
    P.addGeo('p:steel_dark', new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), new THREE.Matrix4().makeTranslation(x, y + 0.02, z), g);
    const disc = new THREE.CircleGeometry(0.38, 18);
    disc.rotateX(Math.PI / 2);
    P.addGeo('p:highbay', disc, new THREE.Matrix4().makeTranslation(x, y - 0.34, z), g);
  }

  JB.Props = { build, materials, highbay };
})();
