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
      // bullet holes
      const dcv = document.createElement('canvas'); dcv.width = dcv.height = 64;
      const dc = dcv.getContext('2d');
      const dg = dc.createRadialGradient(32, 32, 0, 32, 32, 30);
      dg.addColorStop(0, 'rgba(8,6,5,1)'); dg.addColorStop(0.22, 'rgba(20,16,14,0.95)'); dg.addColorStop(0.4, 'rgba(40,34,30,0.55)'); dg.addColorStop(1, 'rgba(40,34,30,0)');
      dc.fillStyle = dg; dc.fillRect(0, 0, 64, 64);
      dc.strokeStyle = 'rgba(15,12,10,0.6)'; dc.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + 0.3; dc.beginPath(); dc.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); dc.lineTo(32 + Math.cos(a) * (14 + (i % 3) * 5), 32 + Math.sin(a) * (14 + (i % 3) * 5)); dc.stroke(); }
      const dtex = new THREE.CanvasTexture(dcv);
      dtex.encoding = THREE.sRGBEncoding;
      const dmat = new THREE.MeshStandardMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
      const dgeo = new THREE.PlaneGeometry(0.13, 0.13);
      this.decals = [];
      for (let i = 0; i < 90; i++) {
        const m = new THREE.Mesh(dgeo, dmat);
        m.visible = false; m.renderOrder = 1;
        scene.add(m);
        this.decals.push(m);
      }
      this.decalI = 0;
      // scorch marks
      const scv = document.createElement('canvas'); scv.width = scv.height = 128;
      const sc = scv.getContext('2d');
      const sg = sc.createRadialGradient(64, 64, 0, 64, 64, 62);
      sg.addColorStop(0, 'rgba(10,8,6,0.9)'); sg.addColorStop(0.5, 'rgba(20,16,12,0.5)'); sg.addColorStop(1, 'rgba(20,16,12,0)');
      sc.fillStyle = sg; sc.fillRect(0, 0, 128, 128);
      const stex = new THREE.CanvasTexture(scv);
      stex.encoding = THREE.sRGBEncoding;
      this.scorchMat = new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
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
    decal(p, nx, ny, nz) {
      const m = this.decals[this.decalI++ % this.decals.length];
      m.position.set(p.x + nx * 0.004, p.y + ny * 0.004, p.z + nz * 0.004);
      this._x.set(p.x + nx, p.y + ny, p.z + nz);
      m.up.set(Math.abs(ny) > 0.9 ? 1 : 0, Math.abs(ny) > 0.9 ? 0 : 1, 0);
      m.lookAt(this._x);
      m.rotateZ(Math.random() * 6.28);
      const s = 0.7 + Math.random() * 0.5;
      m.scale.set(s, s, s);
      m.visible = true;
    }
    impact(hit, surface) {
      const nx = hit.nx || 0, ny = hit.ny || 0, nz = hit.nz || 0;
      const metal = surface === 'metal';
      this.sparks(hit, null, nx, ny, nz, metal ? 7 : 3, false);
      this.dust(hit, nx, ny, nz, metal ? 1 : 3, 0.55, 0.52, 0.48);
      this.decal(hit, nx, ny, nz);
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
      if (!m) m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), this.scorchMat);
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
