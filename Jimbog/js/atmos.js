// Jimbog: atmosphere. Dust motes drifting through the air (brighter where sun
// lands and near openings), and sun shafts through the campus windows.
// Exposes JB.Atmos = { build(opts) }. build() returns { update(dt, camera), dispose(), stats }.
// game.js calls build() in loadMap, update() in render() and dispose() in unloadMap.
// Depends only on the global THREE (r137) and JB.
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  const DUST_COUNT = { low: 300, medium: 1200, high: 2000 };
  const MAX_OPEN = 24;                    // openings sent to the dust shader (nearest first)
  const BOX = [14, 6, 14];                // dust lives in a box around the camera and wraps
  const SKY_DEPTH = 0.7;                  // skylight well depth, as in level.js buildShafts
  // Smoke sun term (see JB.GrenadeFX.setSun): interiors get less sun than the open campus.
  const SMOKE_SUN = { facility: 0.16, campus: 0.5 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  // Seeded PRNG (mulberry32): the same map always gets the same dust layout.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ openings
  // An opening is a rectangle on an axis-aligned plane that sunlight comes through.
  // ax = 0 (plane x = c), 1 (plane y = c: a skylight) or 2 (plane z = c: a window).
  // The in-plane axes are u = (ax+1)%3 and v = (ax+2)%3; rect = [u0, v0, u1, v1].
  function makeOpening(ax, mn, mx, floor) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const c = mn[ax];
    const u0 = Math.min(mn[u], mx[u]), u1 = Math.max(mn[u], mx[u]);
    const v0 = Math.min(mn[v], mx[v]), v1 = Math.max(mn[v], mx[v]);
    const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(function (q) {
      const p = [0, 0, 0];
      p[ax] = c; p[u] = q[0]; p[v] = q[1];
      return p;
    });
    const center = [0, 0, 0];
    center[ax] = c; center[u] = (u0 + u1) / 2; center[v] = (v0 + v1) / 2;
    return { ax: ax, c: c, rect: [u0, v0, u1, v1], corners: corners, floor: floor, center: center };
  }

  // Skylights: the same openings level.js cuts the shafts from.
  function skylightOpenings(level) {
    const out = [];
    for (const reg of level.regions || []) {
      if (!reg.sky) continue;
      for (const s of reg.sky) {
        const y = reg.ceil + SKY_DEPTH;
        out.push(makeOpening(1, [s[0], y, s[1]], [s[2], y, s[3]], reg.floor || 0));
      }
    }
    return out;
  }

  // Which side of a wall is the room? +1 if the building interior is on the + side of the
  // plane, -1 for the - side, 0 if both sides or neither are inside a building (a window
  // between two buildings, or in a courtyard wall). Tested with points 0.8 m off the wall.
  function insideAny(buildings, x, z) {
    for (const b of buildings) {
      for (const r of b.rects || []) {
        if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true;
      }
    }
    return false;
  }
  function roomSide(buildings, ax, c, along) {
    const at = function (off) {
      return ax === 2 ? insideAny(buildings, along, c + off) : insideAny(buildings, c + off, along);
    };
    const plusIn = at(0.8), minusIn = at(-0.8);
    if (plusIn && !minusIn) return 1;
    if (minusIn && !plusIn) return -1;
    return 0;
  }

  // Campus windows that the sun can light: on an outside wall that faces the sun.
  function windowOpenings(data, sunTo) {
    const out = [];
    const buildings = (data && data.buildings) || [];
    for (const w of (data && data.windows) || []) {
      if (!w || !w.r) continue;
      const x0 = w.r[0], z0 = w.r[1], x1 = w.r[2], z1 = w.r[3];
      const ax = (x1 - x0) >= (z1 - z0) ? 2 : 0;          // long side along x: the wall plane is z
      const c = ax === 2 ? (z0 + z1) / 2 : (x0 + x1) / 2;
      const along = ax === 2 ? (x0 + x1) / 2 : (z0 + z1) / 2;
      const room = roomSide(buildings, ax, c, along);
      if (!room) continue;
      if (Math.sign(-sunTo.getComponent(ax)) !== room) continue;   // the wall is in shade
      const floor = num(w.y, 0);
      const ylo = floor + num(w.sill, 0), yhi = floor + num(w.top, 0);
      const mn = ax === 2 ? [x0, ylo, c] : [c, ylo, z0];
      const mx = ax === 2 ? [x1, yhi, c] : [c, yhi, z1];
      out.push(makeOpening(ax, mn, mx, floor));
    }
    return out;
  }

  // ------------------------------------------------------------------ dust
  const DUST_VERT = [
    'uniform vec3 uCam;',
    'uniform vec3 uBox;',
    'uniform float uTime;',
    'uniform float uPx;',
    'uniform float uOut;',
    'uniform float uNOp;',
    'uniform vec3 uSunTo;',
    'uniform vec4 uOpP[' + MAX_OPEN + '];',     // (ax, c, 0, 0)
    'uniform vec4 uOpR[' + MAX_OPEN + '];',     // rect (u0, v0, u1, v1)
    'attribute vec4 aSeed;',                    // x: size (m), y/z: wobble phases, w: brightness
    'attribute vec3 aDir;',                     // drift velocity (m/s)
    'varying float vLit;',
    'varying float vA;',
    'void main() {',
    '  vec3 base = position + aDir * uTime;',
    '  vec3 rel = mod(base - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;',   // wrap inside the box
    '  vec3 w = uCam + rel;',
    '  w += 0.06 * vec3(sin(uTime * 0.31 + aSeed.y), sin(uTime * 0.23 + aSeed.z), cos(uTime * 0.27 + aSeed.y * 1.7));',
    '  vec4 mv = viewMatrix * vec4(w, 1.0);',
    '  float depth = max(-mv.z, 0.05);',
    '  gl_PointSize = clamp(aSeed.x * uPx / depth, 1.5, 4.0);',
    '  gl_Position = projectionMatrix * mv;',
    // sunlight: a mote is lit if the ray towards the sun passes through an opening;
    // motes just inside an opening catch some of its glow.
    '  float lit = 0.0, glow = 0.0;',
    '  for (int i = 0; i < ' + MAX_OPEN + '; i++) {',
    '    if (float(i) >= uNOp) break;',
    '    float ax = uOpP[i].x, c = uOpP[i].y;',
    '    vec3 mP = vec3(float(ax == 0.0), float(ax == 1.0), float(ax == 2.0));',
    '    vec3 mU = vec3(float(ax == 2.0), float(ax == 0.0), float(ax == 1.0));',
    '    vec3 mV = vec3(float(ax == 1.0), float(ax == 2.0), float(ax == 0.0));',
    '    vec4 r = uOpR[i];',
    '    float den = dot(uSunTo, mP);',
    '    float side = dot(w, mP) - c;',
    '    if (abs(den) > 0.001) {',
    '      float t = -side / den;',
    '      if (t > 0.0) {',
    '        vec3 h = w + uSunTo * t;',
    '        float hu = dot(h, mU), hv = dot(h, mV);',
    '        if (hu > r.x && hu < r.z && hv > r.y && hv < r.w) lit = 1.0;',
    '      }',
    '    }',
    '    if (side * den < 0.0) {',                 // on the room side of the opening
    '      float pu = dot(w, mU), pv = dot(w, mV);',
    '      float du = max(max(r.x - pu, pu - r.z), 0.0), dv = max(max(r.y - pv, pv - r.w), 0.0);',
    '      float d = length(vec3(du, dv, side));',
    '      glow = max(glow, 1.0 - smoothstep(0.4, 3.2, d));',
    '    }',
    '  }',
    '  float sun = max(lit, glow * 0.4);',
    '  vec3 e = 0.5 * uBox - abs(rel);',
    '  float edge = clamp(min(min(e.x, e.y), e.z) / 1.2, 0.0, 1.0);',   // hide the wrap seam
    '  float near = smoothstep(0.2, 1.0, depth);',                    // no blobs in front of the lens
    '  vLit = clamp(max(sun, uOut * 0.3), 0.0, 1.0);',
    '  vA = aSeed.w * edge * near * (0.3 + 0.7 * max(sun, 0.25)) * mix(1.0, 0.5, uOut);',
    '}'
  ].join('\n');

  const DUST_FRAG = [
    'uniform vec3 uSunC;',
    'uniform vec3 uShadeC;',
    'varying float vLit;',
    'varying float vA;',
    'void main() {',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float r2 = dot(q, q) * 4.0;',
    '  float a = (1.0 - smoothstep(0.15, 1.0, r2)) * vA * 0.4;',
    '  if (a < 0.003) discard;',
    '  vec3 col = mix(uShadeC, uSunC, vLit);',
    '  gl_FragColor = vec4(col * a, 1.0);',                 // additive: specks catch light
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ sun shafts (campus)
  // Each shaft is four side quads running from the opening to the floor along the
  // sun direction. Fades at the floor and the opening, and with distance from the camera.
  const SHAFT_VERT = [
    'varying vec2 vUv;',
    'varying vec3 vW;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 w = modelMatrix * vec4(position, 1.0);',
    '  vW = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}'
  ].join('\n');

  const SHAFT_FRAG = [
    'uniform float uTime;',
    'uniform vec3 uColor;',
    'uniform float uStrength;',
    'varying vec2 vUv;',
    'varying vec3 vW;',
    'float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
    'float vnoise(vec3 p) {',
    '  vec3 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);',
    '  float b = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);',
    '  return mix(a, b, f.z);',
    '}',
    'void main() {',
    '  float n = vnoise(vW * 1.4 + vec3(uTime * 0.05, -uTime * 0.11, uTime * 0.03));',
    '  n = 0.6 + 0.8 * (n - 0.5) + 0.2 * vnoise(vW * 3.3 - vec3(0.0, uTime * 0.2, 0.0));',
    '  float ex = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);',   // soft side edges
    '  float ey = smoothstep(0.0, 0.35, vUv.y) * (0.45 + 0.55 * vUv.y);',           // dim at the floor
    '  float d = length(vW - cameraPosition);',
    '  float fd = 1.0 - smoothstep(10.0, 34.0, d);',
    '  float a = ex * ey * clamp(n, 0.0, 1.4) * fd * uStrength;',
    '  gl_FragColor = vec4(uColor * a, 1.0);',
    '}'
  ].join('\n');

  // Four side faces per opening. Each face has its own vertices so uv.x runs 0..1
  // across it (soft edges) and uv.y runs from the opening (1) to the floor (0).
  function shaftGeometry(openings, sunTo) {
    const pos = [], uv = [], ind = [];
    for (const o of openings) {
      const C = o.corners;
      const F = C.map(function (p) {
        const s = p[1] > o.floor ? (p[1] - o.floor) / Math.max(sunTo.y, 0.05) : 0;
        return [p[0] - sunTo.x * s, o.floor, p[2] - sunTo.z * s];
      });
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) % 4;
        const quad = [C[k], C[k1], F[k1], F[k]];
        const b = pos.length / 3;
        for (const p of quad) pos.push(p[0], p[1], p[2]);
        uv.push(0, 1, 1, 1, 1, 0, 0, 0);
        ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    return { pos: pos, ind: ind, uv: uv };
  }

  // ------------------------------------------------------------------ build
  function build(opts) {
    opts = opts || {};
    const level = opts.level;
    const scene = opts.scene;
    if (!level || !scene || !THREE) return null;
    const quality = DUST_COUNT[opts.quality] !== undefined ? opts.quality : 'medium';
    const mapId = opts.mapId || 'facility';
    const renderer = opts.renderer || null;
    const outdoorMap = mapId !== 'facility';

    const sunTo = level.SUN_DIR ? level.SUN_DIR.clone().negate().normalize() : new THREE.Vector3(-0.34, 1, -0.24).normalize();
    const group = new THREE.Group();
    group.name = 'atmos';
    const res = { group: group, points: null, beams: null };

    // openings: skylights everywhere, sun-facing windows on the campus
    let openings = skylightOpenings(level);
    let beamOpenings = [];
    if (outdoorMap) {
      beamOpenings = windowOpenings(opts.data, sunTo);
      openings = openings.concat(beamOpenings);
    }

    // smoke takes its sun term from the same sun
    if (JB.GrenadeFX && JB.GrenadeFX.setSun) {
      JB.GrenadeFX.setSun(sunTo, new THREE.Color(1.0, 0.93, 0.8), SMOKE_SUN[outdoorMap ? 'campus' : 'facility']);
    }

    // ---- dust
    const count = DUST_COUNT[quality];
    const rnd = rng(mapId === 'campus' ? 0x2c9277b5 : 0x6b43a9b5);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4), dir = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd() * BOX[0]; pos[i * 3 + 1] = rnd() * BOX[1]; pos[i * 3 + 2] = rnd() * BOX[2];
      seed[i * 4] = 0.022 + 0.022 * rnd();
      seed[i * 4 + 1] = rnd() * 6.2832; seed[i * 4 + 2] = rnd() * 6.2832;
      seed[i * 4 + 3] = 0.45 + 0.55 * rnd();
      dir[i * 3] = (rnd() - 0.5) * 0.12; dir[i * 3 + 1] = (rnd() - 0.5) * 0.03; dir[i * 3 + 2] = (rnd() - 0.5) * 0.12;
    }
    const opP = [], opR = [];
    for (let i = 0; i < MAX_OPEN; i++) { opP.push(new THREE.Vector4()); opR.push(new THREE.Vector4()); }
    const U = {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(BOX[0], BOX[1], BOX[2]) },
      uTime: { value: 0 },
      uPx: { value: 300 },
      uOut: { value: 0 },
      uNOp: { value: 0 },
      uSunTo: { value: sunTo },
      uOpP: { value: opP },
      uOpR: { value: opR },
      uSunC: { value: new THREE.Color(1.0, 0.88, 0.66) },
      uShadeC: { value: new THREE.Color(0.52, 0.54, 0.6) }
    };
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.StaticDrawUsage));
    dgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4).setUsage(THREE.StaticDrawUsage));
    dgeo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3).setUsage(THREE.StaticDrawUsage));
    const dmat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(dgeo, dmat);
    points.frustumCulled = false;     // the motes wrap around the camera, so the CPU bounds are wrong
    points.renderOrder = 5;
    group.add(points);
    res.points = { geo: dgeo, mat: dmat };

    // ---- campus sun shafts through the lit windows
    if (beamOpenings.length) {
      const g = shaftGeometry(beamOpenings, sunTo);
      const bgeo = new THREE.BufferGeometry();
      bgeo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      bgeo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      bgeo.setIndex(g.ind);
      const bmat = new THREE.ShaderMaterial({
        uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(1.0, 0.9, 0.72) }, uStrength: { value: 0.1 } },
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const beams = new THREE.Mesh(bgeo, bmat);
      beams.name = 'sunshafts';
      beams.frustumCulled = false;
      beams.renderOrder = 3;
      group.add(beams);
      res.beams = { geo: bgeo, mat: bmat };
    }

    scene.add(group);

    const sz = new THREE.Vector2(1, 1);
    const tmpOpen = openings.slice();
    let outT = 0, t = 0, alive = true;
    return {
      group: group,
      stats: { dust: count, openings: openings.length, beams: beamOpenings.length },
      update: function (dt, camera) {
        if (!alive || !camera) return;
        const step = clamp(num(dt, 0), 0, 0.1);
        t += step;
        U.uTime.value = t;
        const cp = camera.position;
        U.uCam.value.copy(cp);
        // pixels per metre at distance 1: viewport height over the vertical field of view
        if (renderer && renderer.getDrawingBufferSize) renderer.getDrawingBufferSize(sz);
        const H = sz.y || 540;
        U.uPx.value = H / (2 * Math.tan(camera.fov * Math.PI / 360));
        // openings nearest the camera first; the dust shader reads at most MAX_OPEN
        const cx = cp.x, cy = cp.y, cz = cp.z;
        tmpOpen.sort(function (a, b) {
          const ax = a.center[0] - cx, ay = a.center[1] - cy, az = a.center[2] - cz;
          const bx = b.center[0] - cx, by = b.center[1] - cy, bz = b.center[2] - cz;
          return (ax * ax + ay * ay + az * az) - (bx * bx + by * by + bz * bz);
        });
        const n = Math.min(MAX_OPEN, tmpOpen.length);
        for (let i = 0; i < n; i++) {
          const o = tmpOpen[i];
          opP[i].set(o.ax, o.c, 0, 0);
          opR[i].set(o.rect[0], o.rect[1], o.rect[2], o.rect[3]);
        }
        U.uNOp.value = n;
        // outdoors (campus only): the air is open to the sun, so motes read dimmer and softer
        let target = 0;
        if (outdoorMap && level.regionAt) {
          const r = level.regionAt(cx, cz, cy);
          target = r && r.outdoor ? 1 : 0;
        }
        outT = lerp(outT, target, clamp(step * 3, 0, 1));
        U.uOut.value = outT;
      },
      dispose: function () {
        if (!alive) return;
        alive = false;
        scene.remove(group);
        if (res.points) { res.points.geo.dispose(); res.points.mat.dispose(); }
        if (res.beams) { res.beams.geo.dispose(); res.beams.mat.dispose(); }
        res.points = null; res.beams = null;
      }
    };
  }

  JB.Atmos = { build: build, windowOpenings: windowOpenings, skylightOpenings: skylightOpenings };
})();
