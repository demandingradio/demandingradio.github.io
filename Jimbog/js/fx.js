// Jimbog — visual effects: GPU point particles (sparks, fire, smoke, dust,
// fur tufts), bullet tracers, bullet-hole decals and explosions.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  function softTex(kind) {
    const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const c = cv.getContext('2d');
    if (kind === 'smoke') {
      const rnd = U.rng(7);
      for (let i = 0; i < 26; i++) {
        const x = 18 + rnd() * 28, y = 18 + rnd() * 28, r = 8 + rnd() * 16;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      }
    } else {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
    const t = new THREE.CanvasTexture(cv);
    return t;
  }

  // A particle pool rendered as one THREE.Points.
  class Pool {
    constructor(scene, cap, additive, tex) {
      this.cap = cap; this.n = 0;
      this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
      this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
      this.life = new Float32Array(cap); this.max = new Float32Array(cap);
      this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
      this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
      const geo = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
      this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
      this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
      this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', this.aPos); geo.setAttribute('color', this.aCol);
      geo.setAttribute('size', this.aSize); geo.setAttribute('alpha', this.aAlpha);
      geo.setDrawRange(0, 0);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
        vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;\n' +
          'uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);\n' +
          'gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord);\n' +
          (additive ? 'gl_FragColor = vec4(vC * t.a * vA, 1.0); }' : 'gl_FragColor = vec4(vC, t.a * vA); }'),
        transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 5 : 4;
      scene.add(this.points);
    }
    add(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag) {
      let i = this.n;
      if (i >= this.cap) i = Math.floor(Math.random() * this.cap); else this.n++;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.a0[i] = a;
      this.grav[i] = grav || 0; this.drag[i] = drag || 0;
      this.size[i] = s0; this.alpha[i] = a;
    }
    update(dt, scale) {
      this.mat.uniforms.uScale.value = scale;
      let n = this.n;
      for (let i = 0; i < n; i++) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          n--;
          if (i !== n) this._move(n, i);
          i--;
          continue;
        }
        const k = 1 - this.life[i] / this.max[i];
        const dr = Math.exp(-this.drag[i] * dt);
        this.v[i * 3] *= dr; this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt; this.v[i * 3 + 2] *= dr;
        this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
        this.alpha[i] = this.a0[i] * (1 - k) * Math.min(1, k * 12 + 0.3);
      }
      this.n = n;
      this.points.geometry.setDrawRange(0, n);
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
    }
    _move(from, to) {
      for (let a = 0; a < 3; a++) {
        this.p[to * 3 + a] = this.p[from * 3 + a]; this.v[to * 3 + a] = this.v[from * 3 + a]; this.col[to * 3 + a] = this.col[from * 3 + a];
      }
      this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
      this.a0[to] = this.a0[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
      this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from];
    }
  }

  // ------------------------------------------------------------ bullet holes and scorch
  // Hole atlas: one 256 px canvas, a 128 px quadrant per surface kind.
  function holeConcrete(c, rnd) {
    const ring = c.createRadialGradient(64, 64, 14, 64, 64, 62);
    ring.addColorStop(0, 'rgba(206,200,190,0)'); ring.addColorStop(0.2, 'rgba(206,200,190,0.5)');
    ring.addColorStop(0.45, 'rgba(196,190,180,0.3)'); ring.addColorStop(1, 'rgba(196,190,180,0)');
    c.fillStyle = ring; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {               // pale dust flecks on the ring
      const a = rnd() * 6.2832, d = 22 + rnd() * 30;
      c.fillStyle = 'rgba(214,208,198,' + (0.2 + rnd() * 0.3).toFixed(2) + ')';
      c.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const core = c.createRadialGradient(64, 64, 0, 64, 64, 28);   // chipped dark crater
    core.addColorStop(0, 'rgba(8,7,6,1)'); core.addColorStop(0.45, 'rgba(20,17,15,0.95)');
    core.addColorStop(0.8, 'rgba(40,36,32,0.55)'); core.addColorStop(1, 'rgba(40,36,32,0)');
    c.fillStyle = core; c.beginPath(); c.arc(64, 64, 28, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(16,13,11,0.75)'; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {                // short radial cracks
      const a = (i / 8) * 6.2832 + rnd() * 0.5, r0 = 12 + rnd() * 6, r1 = 30 + rnd() * 24;
      c.lineWidth = 0.8 + rnd() * 1.2;
      c.beginPath(); c.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
      c.lineTo(64 + Math.cos(a + (rnd() - 0.5) * 0.25) * r1, 64 + Math.sin(a + (rnd() - 0.5) * 0.25) * r1); c.stroke();
    }
  }
  function holeMetal(c, rnd) {
    const dent = c.createRadialGradient(60, 58, 4, 64, 64, 42);   // the dent: dark inside, lighter outside
    dent.addColorStop(0, 'rgba(18,19,21,0.95)'); dent.addColorStop(0.55, 'rgba(70,74,80,0.6)'); dent.addColorStop(1, 'rgba(120,124,130,0)');
    c.fillStyle = dent; c.beginPath(); c.arc(64, 64, 42, 0, 6.2832); c.fill();
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(238,240,244,0.9)'; c.lineWidth = 3.2;   // bright rim on the lit side
    c.beginPath(); c.arc(64, 64, 26, Math.PI * 1.1, Math.PI * 1.85); c.stroke();
    c.strokeStyle = 'rgba(190,196,202,0.55)'; c.lineWidth = 2;
    c.beginPath(); c.arc(64, 64, 36, Math.PI * 1.05, Math.PI * 1.7); c.stroke();
    c.fillStyle = 'rgba(6,6,7,1)'; c.beginPath(); c.arc(64, 64, 7 + rnd() * 2, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(30,32,36,0.6)'; c.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = rnd() * 6.2832;
      c.beginPath(); c.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10);
      c.lineTo(64 + Math.cos(a) * (26 + rnd() * 12), 64 + Math.sin(a) * (26 + rnd() * 12)); c.stroke();
    }
  }
  function holeWood(c, rnd) {
    c.fillStyle = 'rgba(26,15,8,0.96)'; c.beginPath();      // ragged dark hole
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.2832, r = 12 + rnd() * 7, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r * 0.8;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath(); c.fill();
    for (let i = 0; i < 16; i++) {                           // splinters pointing away from the hole
      const a = rnd() * 6.2832, r0 = 12, r1 = 26 + rnd() * 30, w = 1.2 + rnd() * 2.2;
      const ca = Math.cos(a), sa = Math.sin(a);
      c.fillStyle = rnd() < 0.6 ? 'rgba(214,182,132,0.85)' : 'rgba(120,80,44,0.85)';
      c.beginPath(); c.moveTo(64 + ca * r0 - sa * w, 64 + sa * r0 + ca * w); c.lineTo(64 + ca * r1, 64 + sa * r1);
      c.lineTo(64 + ca * r0 + sa * w, 64 + sa * r0 - ca * w); c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(60,36,18,0.45)'; c.lineWidth = 1;  // grain
    for (let i = 0; i < 5; i++) { const y = 20 + rnd() * 88; c.beginPath(); c.moveTo(10, y); c.lineTo(118, y + (rnd() - 0.5) * 6); c.stroke(); }
  }
  function holeGlass(c, rnd) {
    c.fillStyle = 'rgba(30,40,46,0.9)'; c.beginPath(); c.arc(64, 64, 5 + rnd() * 2, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(240,248,252,0.9)'; c.lineWidth = 1.1; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {                            // radial cracks
      let a = (i / 9) * 6.2832 + rnd() * 0.3, r = 7;
      c.beginPath(); c.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      for (let k = 0; k < 4; k++) { r += 8 + rnd() * 10; a += (rnd() - 0.5) * 0.25; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(120,150,166,0.65)'; c.lineWidth = 0.8;   // broken rings
    for (let k = 0; k < 3; k++) {
      const r = 18 + k * 14;
      for (let n = 0; n < 3; n++) { const a0 = rnd() * 6.2832; c.beginPath(); c.arc(64, 64, r, a0, a0 + 0.8 + rnd() * 1.4); c.stroke(); }
    }
  }
  function holeAtlas() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), rnd = U.rng(2024), rect = {};
    const cells = { concrete: [0, 0, holeConcrete], metal: [128, 0, holeMetal], wood: [0, 128, holeWood], glass: [128, 128, holeGlass] };
    for (const k of Object.keys(cells)) {
      const [x0, y0, fn] = cells[k];
      c.save(); c.beginPath(); c.rect(x0, y0, 128, 128); c.clip(); c.translate(x0, y0);
      fn(c, rnd);
      c.restore();
      rect[k] = [x0 / 256, 1 - (y0 + 128) / 256, (x0 + 128) / 256, 1 - y0 / 256];
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return { tex, rect };
  }
  // A plane whose uv covers one atlas rectangle [u0, v0, u1, v1].
  function quadrantPlane(r, size) {
    const g = new THREE.PlaneGeometry(size, size), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    uv.needsUpdate = true;
    return g;
  }
  // Scorch atlas: two soot blotches side by side (256 x 128).
  function scorchAtlas() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d'), rnd = U.rng(88);
    for (let v = 0; v < 2; v++) {
      c.save(); c.beginPath(); c.rect(v * 128, 0, 128, 128); c.clip(); c.translate(v * 128, 0);
      const cx = 64 + (rnd() - 0.5) * 10, cy = 64 + (rnd() - 0.5) * 10;
      let g = c.createRadialGradient(cx, cy, 0, cx, cy, 62);
      g.addColorStop(0, 'rgba(12,10,8,0.85)'); g.addColorStop(0.45, 'rgba(18,15,12,0.55)');
      g.addColorStop(0.8, 'rgba(18,15,12,0.18)'); g.addColorStop(1, 'rgba(18,15,12,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 16; i++) {                           // ragged blotches
        const a = rnd() * 6.2832, d = rnd() * 34, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = 6 + rnd() * 16;
        g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(8,6,5,0.5)'); g.addColorStop(1, 'rgba(8,6,5,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      for (let i = 0; i < 14; i++) {                           // soot streaks
        const a = rnd() * 6.2832, r0 = 16 + rnd() * 10, r1 = 40 + rnd() * 22;
        c.strokeStyle = 'rgba(10,8,6,' + (0.12 + rnd() * 0.18).toFixed(2) + ')'; c.lineWidth = 1 + rnd() * 3;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a + 0.05) * r1, cy + Math.sin(a + 0.05) * r1); c.stroke();
      }
      c.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  class FX {
    constructor(R) {
      this.R = R;
      const scene = R.scene;
      this.glow = new Pool(scene, 1400, true, softTex('dot'));
      this.smoke = new Pool(scene, 700, false, softTex('smoke'));
      // tracers
      const tcv = document.createElement('canvas'); tcv.width = 64; tcv.height = 8;
      const tc = tcv.getContext('2d');
      const tg = tc.createLinearGradient(0, 0, 0, 8);
      tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(0.5, 'rgba(255,255,255,1)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
      tc.fillStyle = tg; tc.fillRect(0, 0, 64, 8);
      const ttex = new THREE.CanvasTexture(tcv);
      this.tracers = [];
      const tgeo = new THREE.PlaneGeometry(1, 1);
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ map: ttex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.matrixAutoUpdate = false; m.visible = false; m.frustumCulled = false; m.renderOrder = 6;
        scene.add(m);
        this.tracers.push({ m, life: 0, max: 0.07 });
      }
      // bullet holes: one atlas, a quadrant per surface kind (concrete chip, metal dent, wood splinters, glass crack)
      const hole = holeAtlas();
      this.holeTex = hole.tex;
      const dmat = new THREE.MeshStandardMaterial({ map: hole.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
      this.holeGeo = {};
      for (const k of Object.keys(hole.rect)) this.holeGeo[k] = quadrantPlane(hole.rect[k], 0.13);
      this.decals = [];
      for (let i = 0; i < 90; i++) {
        const m = new THREE.Mesh(this.holeGeo.concrete, dmat);
        m.visible = false; m.renderOrder = 1;
        scene.add(m);
        this.decals.push(m);
      }
      this.decalI = 0;
      // scorch marks: soot blotches, two variants, random size and turn
      this.scorchMat = new THREE.MeshBasicMaterial({ map: scorchAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.scorchGeo = [quadrantPlane([0, 0, 0.5, 1], 3), quadrantPlane([0.5, 0, 1, 1], 3)];
      this.scorches = [];
      this.time = 0;
      this._m = new THREE.Matrix4(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    }

    sparks(p, n, nx, ny, nz, count, hot) {
      for (let i = 0; i < count; i++) {
        const s = 2 + Math.random() * 5;
        this.glow.add(p.x, p.y, p.z,
          (nx + (Math.random() - 0.5) * 1.6) * s, (ny + Math.random() * 0.9) * s, (nz + (Math.random() - 0.5) * 1.6) * s,
          0.15 + Math.random() * 0.25, 0.05, 0.015, 1.0, hot ? 0.75 : 0.85, hot ? 0.35 : 0.55, 1.6, 9, 1.5);
      }
      this.glow.add(p.x + nx * 0.03, p.y + ny * 0.03, p.z + nz * 0.03, 0, 0, 0, 0.05, 0.35, 0.1, 1.0, 0.8, 0.5, 1.0, 0, 0);
    }
    dust(p, nx, ny, nz, count, r, g, b) {
      for (let i = 0; i < count; i++) {
        const s = 0.4 + Math.random() * 1.2;
        this.smoke.add(p.x, p.y, p.z, (nx + (Math.random() - 0.5)) * s, (ny + Math.random() * 0.5) * s + 0.2, (nz + (Math.random() - 0.5)) * s,
          0.6 + Math.random() * 0.6, 0.12, 0.55 + Math.random() * 0.3, r, g, b, 0.45, -0.1, 2.5);
      }
    }
    fur(p, col, count, dir) {
      for (let i = 0; i < count; i++) {
        const s = 1 + Math.random() * 2.5;
        const dx = (dir ? dir.x : 0) * 1.5 + (Math.random() - 0.5) * 2, dz = (dir ? dir.z : 0) * 1.5 + (Math.random() - 0.5) * 2;
        this.smoke.add(p.x, p.y, p.z, dx * s * 0.6, (Math.random() * 1.5) * s * 0.6, dz * s * 0.6,
          0.7 + Math.random() * 0.8, 0.07, 0.04, col.r, col.g, col.b, 0.95, 2.2, 3.0);
      }
      // a soft puff
      this.smoke.add(p.x, p.y, p.z, 0, 0.3, 0, 0.35, 0.2, 0.6, col.r, col.g, col.b, 0.5, 0, 2);
    }
    tracer(a, b, color, width) {
      const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
      t.life = t.max = 0.06 + Math.random() * 0.03;
      t.a = a.clone(); t.b = b.clone(); t.w = width || 0.025;
      t.m.material.color.setHex(color || 0xffd9a0);
      t.m.visible = true;
    }
    decal(p, nx, ny, nz, kind) {
      const m = this.decals[this.decalI++ % this.decals.length];
      m.geometry = this.holeGeo[kind] || this.holeGeo.concrete;
      m.position.set(p.x + nx * 0.004, p.y + ny * 0.004, p.z + nz * 0.004);
      this._x.set(p.x + nx, p.y + ny, p.z + nz);
      m.up.set(Math.abs(ny) > 0.9 ? 1 : 0, Math.abs(ny) > 0.9 ? 0 : 1, 0);
      m.lookAt(this._x);
      m.rotateZ(Math.random() * 6.28);
      const s = (kind === 'wood' ? 1.0 : 0.75) + Math.random() * 0.5;
      m.scale.set(s * (0.85 + Math.random() * 0.3), s, s);
      m.visible = true;
    }
    impact(hit, surface) {
      const nx = hit.nx || 0, ny = hit.ny || 0, nz = hit.nz || 0;
      const kind = JB.Decals && JB.Decals.holeKind ? JB.Decals.holeKind(hit, surface) : (surface === 'metal' ? 'metal' : 'concrete');
      const metal = kind === 'metal', soft = kind === 'wood' || kind === 'glass';
      this.sparks(hit, null, nx, ny, nz, metal ? 7 : soft ? 0 : 3, false);
      this.dust(hit, nx, ny, nz, metal ? 1 : 3, kind === 'wood' ? 0.6 : 0.55, kind === 'wood' ? 0.5 : 0.52, kind === 'wood' ? 0.4 : 0.48);
      this.decal(hit, nx, ny, nz, kind);
    }
    explosion(p) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, e = Math.random() * 1.2 - 0.2, s = 2 + Math.random() * 6;
        this.glow.add(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s,
          0.35 + Math.random() * 0.35, 0.8 + Math.random() * 0.6, 2.2 + Math.random() * 1.2, 1.0, 0.55 + Math.random() * 0.2, 0.18, 1.0, -1, 4);
      }
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.28, e = Math.random() * 1.4 - 0.1, s = 6 + Math.random() * 12;
        this.glow.add(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s,
          0.3 + Math.random() * 0.6, 0.06, 0.02, 1.0, 0.75, 0.35, 1.0, 9, 1.2);
      }
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.28, s = 0.5 + Math.random() * 2.5;
        const g = 0.14 + Math.random() * 0.1;
        this.smoke.add(p.x + (Math.random() - 0.5), p.y + Math.random() * 0.6, p.z + (Math.random() - 0.5), Math.cos(a) * s, 0.6 + Math.random() * 1.8, Math.sin(a) * s,
          1.6 + Math.random() * 1.6, 1.0, 3.6 + Math.random() * 2, g, g * 0.95, g * 0.9, 0.75, -0.25, 1.2);
      }
      // fur shrapnel (it's a hairball, after all)
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * 6.28, s = 3 + Math.random() * 5;
        this.smoke.add(p.x, p.y, p.z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 1 + Math.random(), 0.09, 0.06, 0.65, 0.45, 0.25, 1, 6, 1);
      }
    }
    clearMarks() {
      for (const m of this.decals) m.visible = false;
      for (const m of this.scorches) this.R.scene.remove(m);
      this.scorches.length = 0;
    }
    scorch(p, ny) {
      if (ny < 0.7) return;
      let m = this.scorches.length < 12 ? null : this.scorches.shift();
      if (!m) m = new THREE.Mesh(this.scorchGeo[0], this.scorchMat);
      m.geometry = this.scorchGeo[Math.random() < 0.5 ? 0 : 1];
      const s = 0.6 + Math.random() * 0.4;   // soot about 1.8 to 3 m across (the plane is 3 m)
      m.scale.set(s * (0.85 + Math.random() * 0.3), s, 1);
      m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
      m.position.set(p.x, p.y + 0.01, p.z);
      this.R.scene.add(m);
      this.scorches.push(m);
    }
    update(dt, camera) {
      this.time += dt;
      // gl_PointSize is in drawing-buffer pixels
      const scale = this.R.renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);
      this.glow.update(dt, scale);
      this.smoke.update(dt, scale);
      // tracers: billboard quads stretched from a to b
      const cp = camera.position;
      for (const t of this.tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) { t.m.visible = false; continue; }
        const k = t.life / t.max;
        // the tracer streak travels along the shot
        const head = 1 - k * 0.6, tail = Math.max(0, head - 0.55);
        const ax = t.a.x + (t.b.x - t.a.x) * tail, ay = t.a.y + (t.b.y - t.a.y) * tail, az = t.a.z + (t.b.z - t.a.z) * tail;
        const bx = t.a.x + (t.b.x - t.a.x) * head, by = t.a.y + (t.b.y - t.a.y) * head, bz = t.a.z + (t.b.z - t.a.z) * head;
        const X = this._x.set(bx - ax, by - ay, bz - az);
        const len = X.length();
        if (len < 1e-3) continue;
        X.divideScalar(len);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        const Z = this._z.set(cp.x - mx, cp.y - my, cp.z - mz);
        Z.addScaledVector(X, -Z.dot(X)).normalize();
        const Y = this._y.crossVectors(Z, X);
        const w = t.w * (1 + len * 0.004);
        this._m.set(X.x * len, Y.x * w, Z.x, mx, X.y * len, Y.y * w, Z.y, my, X.z * len, Y.z * w, Z.z, mz, 0, 0, 0, 1);
        t.m.matrix.copy(this._m);
        t.m.material.opacity = Math.min(1, k * 1.6);
      }
    }
  }

  JB.FX = FX;
})();
