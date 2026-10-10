// Jimbog: CS:GO-style visual effects for smoke grenades and flashbangs.
// Exposes JB.GrenadeFX = { SmokeCloud, FlashOverlay }.
// Depends only on the global THREE (r137) and the DOM.
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  const TAU = Math.PI * 2;
  const FADE_TIME = 2.5;                       // smoke fades out over its last 2.5 s
  const BLOOM_TIME = 0.8;                      // puffs expand out of the grenade in ~0.8 s
  const QUALITY = { low: 40, medium: 70, high: 100 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut3 = (t) => { const u = 1 - t; return 1 - u * u * u; };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  // Seeded PRNG (mulberry32): the same seed always gives the same cloud shape.
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

  // Smooth, tileable value noise on an L x L lattice; (x, y) in [0, L).
  function valueNoise(lat, L, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const x0 = xi % L, y0 = yi % L, x1 = (x0 + 1) % L, y1 = (y0 + 1) % L;
    const a = lat[y0 * L + x0], b = lat[y0 * L + x1];
    const c = lat[y1 * L + x0], d = lat[y1 * L + x1];
    const top = a + (b - a) * fx, bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  }

  // 128 px cloudy puff sprite. Alpha = fBm noise times a radial falloff that
  // reaches 0 well inside the sprite edge, so no puff has a hard rim or disc.
  // RGB carries a little brightness variation (read as t.r in the shader).
  function makePuffTexture(seed) {
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(N, N);
    const px = img.data;
    const rnd = rng(seed);
    const OCT = [4, 8, 16, 32];
    const W = [1, 0.5, 0.25, 0.125];
    const wsum = W[0] + W[1] + W[2] + W[3];
    const lat = OCT.map(function (L) {
      const a = new Float32Array(L * L);
      for (let i = 0; i < a.length; i++) a[i] = rnd();
      return a;
    });
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N, v = (y + 0.5) / N;
        let f = 0;
        for (let o = 0; o < OCT.length; o++) {
          f += W[o] * valueNoise(lat[o], OCT[o], u * OCT[o], v * OCT[o]);
        }
        f /= wsum;
        const r = Math.hypot(u - 0.5, v - 0.5) * 2;               // 0 centre, 1 edge
        const fall = 1 - smooth(clamp((r - 0.3) / 0.7, 0, 1));
        const a = clamp(0.25 + (f - 0.35) * 2.6, 0, 1) * fall;
        const sh = Math.round(255 * clamp(0.9 + (f - 0.5) * 0.4, 0, 1));
        const k = (y * N + x) * 4;
        px[k] = px[k + 1] = px[k + 2] = sh;
        px[k + 3] = Math.round(255 * a);
      }
    }
    cx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(cv);
  }

  // Billboarded instanced quads. aOffset is a world position; the corner is
  // offset in view space so every puff always faces the camera.
  const VERT = [
    'attribute vec3 aOffset;',
    'attribute float aSize;',
    'attribute float aRot;',
    'attribute float aAlpha;',
    'attribute float aShade;',
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'varying float vShade;',
    'varying float vTop;',
    'void main() {',
    '  vUv = uv;',
    '  vAlpha = aAlpha;',
    '  vShade = aShade;',
    '  vTop = position.y + 0.5;',                         // screen-up, so the light does not spin with the puff
    '  vec4 mv = viewMatrix * modelMatrix * vec4(aOffset, 1.0);',
    '  float c = cos(aRot), s = sin(aRot);',
    '  vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c);',
    '  mv.xy += corner * aSize;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  const FRAG = [
    'uniform sampler2D uPuff;',
    'uniform vec3 uTint;',
    'varying vec2 vUv;',
    'varying float vAlpha;',
    'varying float vShade;',
    'varying float vTop;',
    'void main() {',
    '  vec4 t = texture2D(uPuff, vUv);',
    '  float a = min(1.0, t.a * vAlpha);',
    '  if (a < 0.003) discard;',
    '  float top = mix(0.88, 1.12, vTop);',               // tops of puffs catch more light
    '  vec3 col = uTint * vShade * top * (0.94 + 0.12 * t.r);',
    '  gl_FragColor = vec4(min(col, vec3(1.0)), a);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------------
  // SmokeCloud: one smoke grenade's cloud, drawn as a single instanced mesh.
  //   new SmokeCloud(scene, { pos, radius, height, duration, clip, tint, quality, seed })
  //   update(dt, camera) -> true while alive, false once finished
  //   density(point)     -> 0..1, how deep the point is inside the visible cloud
  //   blocks(a, b)       -> true if the segment a->b passes through the dense part
  //   dispose()          -> removes from the scene and frees GPU resources
  // ---------------------------------------------------------------------------
  class SmokeCloud {
    constructor(scene, opts) {
      opts = opts || {};
      this.scene = scene || null;
      this.pos = opts.pos ? new THREE.Vector3(opts.pos.x, opts.pos.y, opts.pos.z) : new THREE.Vector3();
      this.radius = Math.max(0.5, num(opts.radius, 3.6));
      this.height = Math.max(1.5, num(opts.height, 2.9));
      this.duration = Math.max(FADE_TIME + 1, num(opts.duration, 18));
      this.clip = typeof opts.clip === 'function' ? opts.clip : null;
      const t = opts.tint;
      this.tint = t ? new THREE.Color(t.r, t.g, t.b) : new THREE.Color(0.55, 0.55, 0.55);
      this.count = QUALITY[opts.quality] || QUALITY.medium;
      this.age = 0;
      this.alive = true;

      // The puff ellipsoid is centred 1.1 m above the grenade. It is wide,
      // reaches about `height` at the top and is flattened onto the floor.
      this.cx = this.pos.x; this.cy = this.pos.y + 1.1; this.cz = this.pos.z;
      this.rh = this.radius * 0.92;                 // horizontal semi-axis
      this.ru = Math.max(0.5, this.height - 1.8);   // upward semi-axis
      this.rd = 0.8;                                // downward semi-axis
      this._C = new THREE.Vector3(this.cx, this.cy, this.cz);
      this._cam = new THREE.Vector3();

      const seed = opts.seed != null ? (opts.seed >>> 0) : ((Math.random() * 4294967296) >>> 0);
      this._buildPuffs(seed);
      this._buildMesh(seed);
      this._writeFrame();
      if (this.scene) this.scene.add(this.mesh);
    }

    _buildPuffs(seed) {
      const rnd = rng(seed ^ 0x5bd1e995);
      const n = this.count;
      const k = clamp(this.radius / 3.6, 0.5, 1.6);
      // Fewer puffs get more alpha each, so the cloud is as opaque at every quality.
      const am = Math.min(1.5, Math.sqrt(QUALITY.high / n));
      const sm = Math.min(1.3, Math.pow(QUALITY.high / n, 0.25));   // and bigger puffs, so the rim still closes
      // Radial bands, shuffled so they are unrelated to direction. Stratifying them
      // (instead of random draws) keeps every seed's rim equally covered.
      const band = [];
      for (let i = 0; i < n; i++) band.push(i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = band[i]; band[i] = band[j]; band[j] = t;
      }
      const spin0 = rnd() * TAU;
      const P = this.puffs = [];
      for (let i = 0; i < n; i++) {
        // Directions on a golden-spiral sphere: evenly spread, with a little jitter.
        const z = 1 - 2 * (i + 0.5 + (rnd() - 0.5) * 0.8) / n;
        const phi = spin0 + i * 2.39996323 + (rnd() - 0.5) * 0.4, rr = Math.sqrt(Math.max(0, 1 - z * z));
        // 0 = core, 1 = edge of the ellipsoid. Biased outwards so the shell is dense.
        const e = 0.3 + 0.7 * Math.sqrt((band[i] + rnd()) / n);
        const dx = rr * Math.cos(phi) * this.rh * e;
        const dy = z * (z > 0 ? this.ru : this.rd) * e;
        const dz = rr * Math.sin(phi) * this.rh * e;
        let tx = this.cx + dx, ty = this.cy + dy, tz = this.cz + dz;
        if (this.clip) {
          // Keep smoke on this side of walls. The game's clip() pulls back 0.3 m.
          const hit = this.clip(this._C, new THREE.Vector3(tx, ty, tz));
          if (hit) { tx = hit.x; ty = hit.y; tz = hit.z; }
        }
        ty = Math.max(ty, this.pos.y + 0.25);       // the cloud sits on the floor
        const ht = clamp((ty - this.pos.y) / this.height, 0, 1);
        const edge = e * e;
        P.push({
          sx: this.pos.x + (rnd() - 0.5) * 0.3,
          sy: this.pos.y + 0.3 + (rnd() - 0.5) * 0.2,
          sz: this.pos.z + (rnd() - 0.5) * 0.3,
          tx: tx, ty: ty, tz: tz,
          delay: rnd() * 0.12,
          bdur: BLOOM_TIME * (0.85 + 0.3 * rnd()),
          size: (2.1 + 1.0 * rnd()) * k * sm * (1 + 0.25 * edge),   // edge puffs are wider to close the rim
          alpha: (0.6 + 0.15 * rnd()) * (1 - 0.1 * edge) * am, // outer puffs are a little fainter (soft edge)
          shade: 0.98 + 0.34 * ht + (rnd() - 0.5) * 0.1,    // lit from above, darker below
          rot: rnd() * TAU,
          spin: (rnd() - 0.5) * 0.3,
          wob: 0.06 + 0.12 * rnd(),                         // churn amplitude (m); stays inside the 0.3 m clip margin
          fx: 0.12 + 0.2 * rnd(), fy: 0.12 + 0.2 * rnd(), fz: 0.12 + 0.2 * rnd(),
          px: rnd() * TAU, py: rnd() * TAU, pz: rnd() * TAU,
          rise: 0.006 + 0.01 * rnd()                        // slow upward drift (m/s)
        });
      }
      this._x = new Float32Array(n); this._y = new Float32Array(n); this._z = new Float32Array(n);
      this._s = new Float32Array(n); this._r = new Float32Array(n);
      this._a = new Float32Array(n); this._h = new Float32Array(n);
      this._d = new Float32Array(n);
      this._ord = [];
      for (let i = 0; i < n; i++) this._ord.push(i);
    }

    _buildMesh(seed) {
      const n = this.count;
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.instanceCount = n;

      const inst = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size)
        .setUsage(THREE.DynamicDrawUsage);
      this.aOffset = inst(3); this.aSize = inst(1); this.aRot = inst(1);
      this.aAlpha = inst(1); this.aShade = inst(1);
      geo.setAttribute('aOffset', this.aOffset);
      geo.setAttribute('aSize', this.aSize);
      geo.setAttribute('aRot', this.aRot);
      geo.setAttribute('aAlpha', this.aAlpha);
      geo.setAttribute('aShade', this.aShade);

      this.tex = makePuffTexture(seed ^ 0x9e3779b9);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uPuff: { value: this.tex }, uTint: { value: this.tint } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide
      });
      this.geo = geo;
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 4;
    }

    // Poses every puff for the current age, sorts back-to-front from the
    // camera and uploads the instance attributes.
    _writeFrame() {
      const age = this.age, dur = this.duration;
      const fs = dur - FADE_TIME;
      const fadeMul = age > fs ? 1 - smooth(clamp((age - fs) / FADE_TIME, 0, 1)) : 1;
      const grow = 1 + 0.12 * clamp(age / dur, 0, 1);
      const P = this.puffs, n = P.length, cam = this._cam;
      const X = this._x, Y = this._y, Z = this._z, S = this._s, R = this._r, A = this._a, H = this._h, D = this._d;

      for (let i = 0; i < n; i++) {
        const q = P[i];
        const p = clamp((age - q.delay) / q.bdur, 0, 1);      // bloom progress 0..1
        const e = easeOut3(p);
        const wob = q.wob * (0.2 + 0.8 * e);                  // churn grows as the puff opens up
        const rise = q.rise * Math.min(age, 8);
        const x = lerp(q.sx, q.tx, e) + wob * Math.sin(age * q.fx + q.px);
        const y = lerp(q.sy, q.ty, e) + 0.5 * wob * Math.sin(age * q.fy + q.py) + rise;
        const z = lerp(q.sz, q.tz, e) + wob * Math.cos(age * q.fz + q.pz);
        X[i] = x; Y[i] = y; Z[i] = z;
        S[i] = q.size * (0.35 + 0.65 * e) * grow;
        A[i] = q.alpha * clamp(p * 1.6, 0, 1) * fadeMul;
        R[i] = q.rot + q.spin * age;
        H[i] = q.shade;
        const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
        D[i] = dx * dx + dy * dy + dz * dz;
      }

      const ord = this._ord;
      ord.sort(function (a, b) { return D[b] - D[a]; });     // farthest first (back-to-front)
      const aO = this.aOffset.array, aS = this.aSize.array, aR = this.aRot.array;
      const aA = this.aAlpha.array, aH = this.aShade.array;
      for (let k = 0; k < n; k++) {
        const i = ord[k];
        aO[k * 3] = X[i]; aO[k * 3 + 1] = Y[i]; aO[k * 3 + 2] = Z[i];
        aS[k] = S[i]; aR[k] = R[i]; aA[k] = A[i]; aH[k] = H[i];
      }
      this.aOffset.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aRot.needsUpdate = true;
      this.aAlpha.needsUpdate = true;
      this.aShade.needsUpdate = true;
    }

    // Advances the cloud. Returns true while alive, false once it has finished.
    // A finished cloud frees its GPU objects and leaves the scene by itself, so a
    // caller that forgets dispose() does not leak.
    update(dt, camera) {
      if (!this.alive) return false;
      if (camera && camera.position) this._cam.copy(camera.position);
      this.age += clamp(num(dt, 0), 0, 0.25);
      if (this.age >= this.duration) {
        this.age = this.duration;
        this._release();
        return false;
      }
      this._writeFrame();
      return true;
    }

    // 0..1: how deep `point` is inside the visible cloud (1 at the core), scaled
    // by bloom and fade. Points behind a wall (per clip) count as outside.
    density(point) {
      if (!this.alive || !point) return 0;
      const bloom = easeOut3(clamp(this.age / 0.9, 0, 1));
      const fs = this.duration - FADE_TIME;
      const fade = this.age > fs ? 1 - smooth(clamp((this.age - fs) / FADE_TIME, 0, 1)) : 1;
      const dx = point.x - this.cx, dy = point.y - this.cy, dz = point.z - this.cz;
      const ey = dy > 0 ? dy / this.ru : dy / this.rd;
      const e = Math.sqrt((dx * dx + dz * dz) / (this.rh * this.rh) + ey * ey);
      let d = clamp((1.2 - e) / 1.2, 0, 1);
      d = smooth(d);
      if (d <= 0 || bloom * fade <= 0) return 0;
      if (this.clip) {
        const hit = this.clip(this._C, point);
        if (hit && hit.distanceTo(this._C) < this._C.distanceTo(point) - 0.35) return 0;
      }
      return clamp(d * bloom * fade, 0, 1);
    }

    // Does the segment a->b pass through the dense part of the cloud? The dense
    // part is a vertical cylinder of radius 0.75*radius over the height band.
    // False during the first 0.4 s and the last 1 s.
    blocks(a, b) {
      if (!this.alive || !a || !b) return false;
      if (this.age < 0.4 || this.age > this.duration - 1.0) return false;
      const R = 0.75 * this.radius;
      const wx = a.x - this.cx, wz = a.z - this.cz;
      const ux = b.x - a.x, uz = b.z - a.z;
      const A = ux * ux + uz * uz;
      const B = wx * ux + wz * uz;
      const C = wx * wx + wz * wz - R * R;
      let t0 = 0, t1 = 1;
      if (A < 1e-9) {
        if (C > 0) return false;                 // a and b are both outside the cylinder
      } else {
        const disc = B * B - A * C;
        if (disc < 0) return false;              // the segment never gets within R
        const sq = Math.sqrt(disc);
        t0 = Math.max(0, (-B - sq) / A);
        t1 = Math.min(1, (-B + sq) / A);
        if (t0 > t1) return false;
      }
      // Height range of the part of the segment that is inside the cylinder.
      const y0 = a.y + (b.y - a.y) * t0, y1 = a.y + (b.y - a.y) * t1;
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      if (!(hi >= this.pos.y && lo <= this.pos.y + this.height)) return false;
      // smoke doesn't reach through walls: the middle of that stretch must be
      // on the cloud's side of any wall (same test as density())
      if (this.clip) {
        const m = new THREE.Vector3();
        for (let k = 0; k < 5; k++) {
          const tm = t0 + (t1 - t0) * (k + 0.5) / 5;
          m.set(a.x + (b.x - a.x) * tm, a.y + (b.y - a.y) * tm, a.z + (b.z - a.z) * tm);
          m.y = clamp(m.y, this.pos.y + 0.2, this.pos.y + this.height - 0.2);
          const hit = this.clip(this._C, m);
          if (!(hit && hit.distanceTo(this._C) < this._C.distanceTo(m) - 0.35)) return true;
        }
        return false;
      }
      return true;
    }

    dispose() {
      this._release();
    }

    // Removes the mesh from the scene and frees geometry, material and texture.
    // Safe to call more than once.
    _release() {
      if (this.mesh) {
        if (this.scene) this.scene.remove(this.mesh);
        this.geo.dispose();
        this.mat.dispose();
        this.tex.dispose();
        this.mesh = null;
      }
      this.alive = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FlashOverlay: full-screen white flash with a frozen afterimage under it.
  //   new FlashOverlay(glCanvas)
  //   capture()             copy the WebGL canvas into the afterimage. Call it
  //                         right after rendering, in the same frame as flash().
  //   flash(strength, dur)  white = strength, held for strength*dur*0.6, then
  //                         fades to 0 by dur. Overlapping flashes keep the max.
  //   update(dt), level(), reset(), destroy()
  // ---------------------------------------------------------------------------
  const AFTER_OPACITY = 0.6;      // afterimage opacity at full strength
  const AFTER_LINGER = 0.25;      // afterimage fades this much longer than the white

  class FlashOverlay {
    constructor(glCanvas) {
      this.gl = glCanvas || null;
      this.flashes = [];
      this.hasImage = false;
      this._cw = 0; this._ca = 0;
      this._shown = false; this._w = -1; this._a = -1;

      const root = document.createElement('div');
      root.className = 'jb-flash';
      root.setAttribute('aria-hidden', 'true');
      root.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;pointer-events:none;' +
        'z-index:2;display:none;overflow:hidden;';
      const after = document.createElement('canvas');
      after.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;opacity:0;';
      const white = document.createElement('div');
      white.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;opacity:0;';
      root.appendChild(after);
      root.appendChild(white);
      (document.body || document.documentElement).appendChild(root);
      this.root = root;
      this.after = after;
      this.white = white;
      this.actx = after.getContext('2d');

      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize);
      this._resize();
      this._apply();
    }

    // Snapshot the WebGL canvas into the afterimage. preserveDrawingBuffer is
    // false, so this must run right after rendering, in the same frame.
    capture() {
      if (!this.gl) return false;
      const w = this.after.width, h = this.after.height;
      try {
        this.actx.clearRect(0, 0, w, h);
        this.actx.drawImage(this.gl, 0, 0, w, h);
        this.hasImage = true;
      } catch (e) {
        return false;
      }
      return true;
    }

    flash(strength, duration) {
      const s = clamp(num(strength, 0), 0, 1);
      const d = Math.max(0, num(duration, 0));
      if (s <= 0.001 || d <= 0.001) return;
      const hold = s * d * 0.6;
      const afterEnd = d + (d - hold) * AFTER_LINGER;   // = hold + (d - hold) * (1 + AFTER_LINGER)
      this.flashes.push({ s: s, d: d, hold: hold, afterEnd: afterEnd, t: 0 });
      if (this.flashes.length > 16) this.flashes.shift();
      this._apply();
    }

    update(dt) {
      const step = Math.max(0, num(dt, 0));
      const fl = this.flashes;
      for (let i = fl.length - 1; i >= 0; i--) {
        fl[i].t += step;
        if (fl[i].t >= fl[i].afterEnd) fl.splice(i, 1);
      }
      this._apply();
    }

    // Current white opacity, 0..1.
    level() {
      this._calc();
      return this._cw;
    }

    reset() {
      this.flashes.length = 0;
      this.hasImage = false;
      this.actx.clearRect(0, 0, this.after.width, this.after.height);
      this._apply();
    }

    destroy() {
      window.removeEventListener('resize', this._onResize);
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
      this.root = null;
    }

    // Works out white and afterimage opacity from every active flash.
    // Overlapping flashes take the max, so a weaker flash never shortens one.
    _calc() {
      let w = 0, a = 0;
      const fl = this.flashes;
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i], t = f.t;
        if (t < f.d) {
          const v = t <= f.hold ? f.s : f.s * (1 - (t - f.hold) / (f.d - f.hold));
          if (v > w) w = v;
        }
        if (t < f.afterEnd) {
          const k = t <= f.hold ? 1 : 1 - (t - f.hold) / (f.afterEnd - f.hold);
          const v = AFTER_OPACITY * f.s * k;
          if (v > a) a = v;
        }
      }
      this._cw = clamp(w, 0, 1);
      this._ca = clamp(a, 0, 1);
    }

    _apply() {
      this._calc();
      if (!this.root) return;                          // destroyed: nothing to show
      const w = Math.round(this._cw * 1000) / 1000;
      const a = Math.round(this._ca * 1000) / 1000;
      const show = w > 0 || a > 0;
      if (show !== this._shown) {
        this.root.style.display = show ? 'block' : 'none';
        this._shown = show;
      }
      if (w !== this._w) { this.white.style.opacity = String(w); this._w = w; }
      if (a !== this._a) { this.after.style.opacity = String(a); this._a = a; }
    }

    // Matches the afterimage canvas to the window, keeping the frozen frame.
    _resize() {
      if (!this.root) return;
      const w = Math.max(1, Math.round(window.innerWidth || 1));
      const h = Math.max(1, Math.round(window.innerHeight || 1));
      const cv = this.after;
      if (cv.width === w && cv.height === h) return;
      let saved = null;
      if (this.hasImage && cv.width > 0 && cv.height > 0) {
        saved = document.createElement('canvas');
        saved.width = cv.width; saved.height = cv.height;
        saved.getContext('2d').drawImage(cv, 0, 0);
      }
      cv.width = w; cv.height = h;
      if (saved) this.actx.drawImage(saved, 0, 0, w, h);
    }
  }

  JB.GrenadeFX = { SmokeCloud: SmokeCloud, FlashOverlay: FlashOverlay };
})();
