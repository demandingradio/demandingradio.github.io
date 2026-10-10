// Jimbog — anthropomorphic cat characters, built procedurally and animated
// with code (walk/run cycle, aim with two-bone IK arms, tail physics-ish
// sway, blinking, ear twitches, flinches and a death fall).
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  // Fur looks: base colour, light colour (muzzle/bib/paws), texture, eyes.
  const FURS = {
    tuxedo: { label: 'Tuxedo', base: 0x232328, light: 0xdcdcd8, tex: 'fur_grey', tint: 0x2c2c33, eye: 0x9cff5a, nose: 0x2b2224, bib: true, socks: true },
    ginger: { label: 'Ginger Tabby', base: 0xe08a3a, light: 0xf6e2c6, tex: 'fur_ginger', tint: 0xffffff, eye: 0x7dd84a, nose: 0xe98c8c, bib: true, socks: false },
    grey:   { label: 'Russian Blue', base: 0x7d8a99, light: 0xb9c3cf, tex: 'fur_grey', tint: 0xffffff, eye: 0x5ad7ff, nose: 0x5a5f6a, bib: false, socks: false },
    calico: { label: 'Calico', base: 0xffffff, light: 0xe2ddd4, tex: 'fur_calico', tint: 0xffffff, eye: 0xffbf3a, nose: 0xf0a0a0, bib: true, socks: true },
    tabby:  { label: 'Brown Tabby', base: 0xa77a4e, light: 0xeadcc4, tex: 'fur_tabby', tint: 0xffffff, eye: 0xd8e04a, nose: 0xc77f78, bib: true, socks: false },
    black:  { label: 'Midnight', base: 0x17171b, light: 0x2a2a30, tex: 'fur_grey', tint: 0x1d1d22, eye: 0xffd23a, nose: 0x1a1a1c, bib: false, socks: false }
  };

  // ------------------------------------------------------------ shared geometry
  const G = {};
  function geos() {
    if (G.ready) return G;
    // body: a bean-shaped lathe (hips -> chest -> neck)
    const prof = [[0, -0.02], [0.13, -0.01], [0.175, 0.06], [0.18, 0.16], [0.195, 0.27], [0.215, 0.38], [0.215, 0.45], [0.19, 0.51], [0.13, 0.565], [0.07, 0.6], [0, 0.61]];
    G.torso = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 22);
    const vprof = [[0.19, 0.14], [0.2, 0.2], [0.215, 0.3], [0.233, 0.4], [0.232, 0.46], [0.2, 0.515], [0.16, 0.545]];
    G.vest = new THREE.LatheGeometry(vprof.map((p) => new THREE.Vector2(p[0], p[1])), 22);
    G.belt = new THREE.TorusGeometry(0.178, 0.028, 8, 24);
    G.thigh = new THREE.CylinderGeometry(0.098, 0.074, 0.42, 14);
    G.shin = new THREE.CylinderGeometry(0.07, 0.056, 0.38, 14);
    G.upperArm = new THREE.CylinderGeometry(0.86, 1, 1, 12);   // +y points at the elbow
    G.foreArm = new THREE.CylinderGeometry(0.74, 0.86, 1, 12);
    G.rbox = roundedBox(1, 1, 1, 0.18);
    G.belly = new THREE.SphereGeometry(0.19, 16, 12);
    G.head = new THREE.SphereGeometry(0.2, 28, 20);
    G.cheek = new THREE.SphereGeometry(0.105, 16, 12);
    G.muzzle = new THREE.SphereGeometry(0.068, 14, 10);
    G.nose = new THREE.SphereGeometry(0.03, 10, 8);
    G.eye = new THREE.SphereGeometry(0.056, 18, 14);
    G.pupil = new THREE.SphereGeometry(0.03, 10, 8);
    G.glint = new THREE.SphereGeometry(0.011, 6, 6);
    G.ear = new THREE.ConeGeometry(0.095, 0.2, 4, 1);
    G.earIn = new THREE.ConeGeometry(0.06, 0.13, 4, 1);
    G.whisker = new THREE.CylinderGeometry(0.0025, 0.0015, 0.2, 4);
    G.limb = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);      // scaled per use
    G.joint = new THREE.SphereGeometry(1, 12, 10);
    G.paw = new THREE.SphereGeometry(1, 14, 10);
    G.bean = new THREE.SphereGeometry(0.018, 8, 6);
    G.tailSeg = new THREE.SphereGeometry(1, 10, 8);
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.collar = new THREE.TorusGeometry(0.12, 0.022, 8, 20);
    G.tag = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12);
    G.ready = true;
    return G;
  }

  // Rounded box (unit size) for vest plates, pouches and pads.
  function roundedBox(w, h, d, r) {
    const g = new THREE.BoxGeometry(w, h, d, 6, 6, 6);
    const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(U.clamp(v.x, -hx, hx), U.clamp(v.y, -hy, hy), U.clamp(v.z, -hz, hz));
      v.sub(inner).normalize().multiplyScalar(r).add(inner);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  // Subtle fabric/camo texture for the cargo pants.
  let PANTS = null;
  function pantsTex() {
    if (PANTS) return PANTS;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#9a9a96'; c.fillRect(0, 0, 128, 128);
    const rnd = U.rng(31);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = ['#7e7e7a', '#b2b2ac', '#8a8c86'][i % 3];
      c.beginPath(); c.ellipse(rnd() * 128, rnd() * 128, 6 + rnd() * 14, 4 + rnd() * 8, rnd() * 3, 0, 6.28); c.fill();
    }
    for (let y = 0; y < 128; y += 2) { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, y, 128, 1); }
    PANTS = new THREE.CanvasTexture(cv);
    PANTS.wrapS = PANTS.wrapT = THREE.RepeatWrapping;
    PANTS.encoding = THREE.sRGBEncoding;
    return PANTS;
  }

  // Inject a per-character light probe so cats pick up the room's lighting.
  function probeMaterial(mat, probe) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uProbe = probe.color;
      shader.uniforms.uProbeEnv = probe.env;
      shader.uniforms.uFlashCol = probe.flash;
      shader.fragmentShader = 'uniform vec3 uProbe; uniform float uProbeEnv; uniform vec3 uFlashCol;\n' + shader.fragmentShader
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tirradiance += uProbe * PI;\n\tradiance *= uProbeEnv; iblIrradiance *= uProbeEnv;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uFlashCol;');
    };
    mat.customProgramCacheKey = () => 'jb-probe';
    return mat;
  }
  function newProbe() {
    return { color: { value: new THREE.Color(0.3, 0.3, 0.3) }, env: { value: 0.6 }, flash: { value: new THREE.Color(0, 0, 0) } };
  }

  class Cat {
    // opts: { fur, vest (hex), name, viewModel? }
    constructor(opts) {
      const g = geos();
      this.opts = opts;
      const F = FURS[opts.fur] || FURS.ginger;
      this.F = F;
      this.probe = newProbe();
      const P = this.probe;
      const tx = JB.Tex.make(F.tex, 256);
      const furMat = (color, useTex) => probeMaterial(new THREE.MeshStandardMaterial({
        color, map: useTex ? tx.map : null, normalMap: useTex ? tx.normalMap : null, roughness: 0.88, metalness: 0,
        normalScale: new THREE.Vector2(0.6, 0.6)
      }), P);
      this.mats = {
        fur: furMat(F.tint, true),
        light: furMat(F.light, false),
        pad: probeMaterial(new THREE.MeshStandardMaterial({ color: 0xe8a0a8, roughness: 0.6 }), P),
        nose: probeMaterial(new THREE.MeshStandardMaterial({ color: F.nose, roughness: 0.35 }), P),
        earIn: probeMaterial(new THREE.MeshStandardMaterial({ color: 0xe9a6a6, roughness: 0.7 }), P),
        eye: probeMaterial(new THREE.MeshPhysicalMaterial({ color: F.eye, emissive: new THREE.Color(F.eye).multiplyScalar(0.35), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }), P),
        pupil: new THREE.MeshBasicMaterial({ color: 0x050506 }),
        glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        whisker: new THREE.MeshBasicMaterial({ color: 0xf4f4f4 }),
        vest: probeMaterial(new THREE.MeshStandardMaterial({ color: opts.vest || 0x3a5a3a, roughness: 0.75, metalness: 0.05 }), P),
        vestDark: probeMaterial(new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.vest || 0x3a5a3a).multiplyScalar(0.45), roughness: 0.8 }), P),
        strap: probeMaterial(new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6, metalness: 0.3 }), P),
        pants: probeMaterial(new THREE.MeshStandardMaterial({ color: opts.pants || 0x2c3036, roughness: 0.9, map: pantsTex() }), P),
        boot: probeMaterial(new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7 }), P),
        metal: probeMaterial(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 1 }), P)
      };
      const M = this.mats;
      const add = (parent, geo, mat, x, y, z, sx, sy, sz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x || 0, y || 0, z || 0);
        if (sx !== undefined) m.scale.set(sx, sy, sz);
        m.castShadow = true; m.receiveShadow = true;
        parent.add(m);
        return m;
      };

      // Hierarchy: root (feet, yaw) > hips > spine > chest(aim) / neck > head
      const root = this.root = new THREE.Group();
      const hips = this.hips = new THREE.Group(); hips.position.y = 0.84; root.add(hips);
      const spine = this.spine = new THREE.Group(); hips.add(spine);
      add(spine, g.torso, M.fur, 0, -0.06, 0, 1, 1, 0.8);
      if (F.bib) add(spine, g.belly, M.light, 0, 0.22, 0.055, 0.82, 1.25, 0.62);
      // tactical plate-carrier vest: shell, front/back plates, pouches, straps
      add(spine, g.vest, M.vest, 0, -0.06, 0, 1.0, 1, 0.84);
      add(spine, g.rbox, M.vest, 0, 0.28, 0.165, 0.3, 0.27, 0.07);
      add(spine, g.rbox, M.vest, 0, 0.28, -0.165, 0.3, 0.29, 0.07);
      for (const sx of [-0.095, 0, 0.095]) add(spine, g.rbox, M.vestDark, sx, 0.165, 0.205, 0.082, 0.1, 0.06);
      add(spine, g.rbox, M.vestDark, 0.08, 0.36, 0.2, 0.09, 0.06, 0.03);
      add(spine, g.box, M.strap, -0.07, 0.36, 0.205, 0.07, 0.012, 0.02);
      for (const sx of [-0.115, 0.115]) add(spine, g.rbox, M.vestDark, sx, 0.45, 0.0, 0.07, 0.035, 0.34);
      add(spine, g.belt, M.strap, 0, 0.02, 0, 0.98, 0.8, 1).rotation.x = Math.PI / 2;
      add(spine, g.rbox, M.metal, 0, 0.02, 0.185, 0.06, 0.045, 0.02);
      for (const sx of [-0.15, 0.15]) add(spine, g.rbox, M.vestDark, sx, 0.0, 0.1, 0.06, 0.09, 0.07);
      // pants (seat)
      add(hips, g.joint, M.pants, 0, -0.02, -0.01, 0.19, 0.12, 0.155);

      // neck + head
      const neck = this.neck = new THREE.Group(); neck.position.set(0, 0.5, 0.0); spine.add(neck);
      add(neck, g.collar, M.strap, 0, 0.0, 0, 1, 1, 1).rotation.x = Math.PI / 2;
      add(neck, g.tag, M.metal, 0, -0.06, 0.13).rotation.x = Math.PI / 2;
      const head = this.head = new THREE.Group(); head.position.set(0, 0.17, 0.02); neck.add(head);
      add(head, g.head, M.fur, 0, 0, 0, 1.06, 0.93, 1.0);
      for (const sx of [-1, 1]) add(head, g.cheek, M.fur, sx * 0.13, -0.07, 0.04, 0.95, 0.8, 0.9);
      for (const sx of [-1, 1]) add(head, g.muzzle, M.light, sx * 0.047, -0.075, 0.16, 1, 0.85, 0.9);
      add(head, g.muzzle, M.light, 0, -0.115, 0.13, 0.75, 0.6, 0.75);   // chin
      add(head, g.nose, M.nose, 0, -0.035, 0.2, 1.15, 0.75, 0.8);
      this.eyes = [];
      for (const sx of [-1, 1]) {
        const eg = new THREE.Group();
        eg.position.set(sx * 0.078, 0.022, 0.158);
        eg.rotation.y = sx * 0.32; eg.rotation.z = -sx * 0.12;
        head.add(eg);
        add(eg, g.eye, M.eye, 0, 0, 0, 1, 1.12, 0.55);
        add(eg, g.pupil, M.pupil, 0, 0, 0.024, 0.32, 1.25, 0.4);
        add(eg, g.glint, M.glint, 0.015, 0.022, 0.034);
        this.eyes.push(eg);
      }
      // brow ridge gives some attitude
      for (const sx of [-1, 1]) {
        const b = add(head, g.box, M.fur, sx * 0.08, 0.075, 0.16, 0.09, 0.025, 0.04);
        b.rotation.z = sx * 0.28;
      }
      this.ears = [];
      for (const sx of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(sx * 0.115, 0.15, -0.01);
        ear.rotation.set(-0.12, sx * -0.25, sx * -0.32);
        head.add(ear);
        add(ear, g.ear, M.fur, 0, 0.08, 0, 1, 1, 0.55).rotation.y = Math.PI / 4;
        add(ear, g.earIn, M.earIn, 0, 0.06, 0.022, 1, 1, 0.35).rotation.y = Math.PI / 4;
        this.ears.push(ear);
      }
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
        const w = add(head, g.whisker, M.whisker, sx * 0.15, -0.075 + k * 0.018, 0.15);
        w.rotation.z = sx * (Math.PI / 2 + (k - 1) * 0.16);
        w.rotation.y = sx * -0.25;
        w.castShadow = false; w.userData.noShadow = true;
      }

      // arms: shoulder anchors live in the chest group; IK solves hands.
      this.arms = [];
      for (const sx of [-1, 1]) {
        const arm = {
          sx,
          shoulder: new THREE.Vector3(sx * 0.2, 0.42, 0.0),
          upper: add(spine, g.upperArm, M.fur), fore: add(spine, g.foreArm, M.fur),
          elbow: add(spine, g.joint, M.fur), hand: add(spine, g.paw, (F.socks ? M.light : M.fur)),
          shoulderBall: add(spine, g.joint, M.fur, sx * 0.2, 0.42, 0.0, 0.07, 0.07, 0.07),
          target: new THREE.Vector3(), pole: new THREE.Vector3(sx * 0.6, -0.6, -0.2)
        };
        for (const k of ['upper', 'fore', 'elbow', 'hand']) arm[k].userData.dyn = true;
        arm.elbow.scale.setScalar(0.052);
        arm.hand.scale.set(0.055, 0.072, 0.06);
        this.arms.push(arm);
      }
      // legs: thigh > shin > foot (FK)
      this.legs = [];
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(sx * 0.105, -0.02, 0); hips.add(hip);
        add(hip, g.thigh, M.pants, 0, -0.2, 0);
        add(hip, g.joint, M.pants, 0, 0, 0, 0.098, 0.098, 0.098);
        add(hip, g.rbox, M.vestDark, sx * 0.085, -0.17, 0.0, 0.03, 0.11, 0.09);
        const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
        add(knee, g.joint, M.pants, 0, 0, 0, 0.074, 0.074, 0.074);
        add(knee, g.rbox, M.strap, 0, 0.0, 0.06, 0.1, 0.11, 0.05);
        add(knee, g.shin, M.pants, 0, -0.18, 0);
        add(knee, g.limb, M.boot, 0, -0.34, 0, 0.062, 0.07, 0.062);
        const ankle = new THREE.Group(); ankle.position.set(0, -0.38, 0); knee.add(ankle);
        add(ankle, g.paw, F.socks ? M.light : M.fur, 0, -0.02, 0.06, 0.075, 0.055, 0.12);
        for (const bx of [-0.035, 0, 0.035]) add(ankle, g.bean, M.pad, bx, -0.06, 0.15, 1, 0.6, 1).castShadow = false;
        this.legs.push({ hip, knee, ankle, sx });
      }
      // tail: chain of segments from the lower back
      this.tail = [];
      let parent = hips;
      const tb = new THREE.Group(); tb.position.set(0, 0.0, -0.17); hips.add(tb); parent = tb;
      for (let k = 0; k < 9; k++) {
        const seg = new THREE.Group();
        if (k > 0) seg.position.y = 0.085;
        parent.add(seg);
        const r = 0.05 - k * 0.0032;
        add(seg, g.tailSeg, k === 8 && F.socks ? M.light : M.fur, 0, 0.045, 0, r, 0.065, r);
        this.tail.push(seg);
        parent = seg;
      }
      this.tailBase = tb;

      // weapon socket (in spine/chest space, follows aim pitch)
      this.weaponSocket = new THREE.Group();
      this.weaponSocket.position.set(0.04, 0.4, 0.0);
      spine.add(this.weaponSocket);
      this.gun = null;

      // merge rigid parts that share a material (far fewer draw calls)
      const groups = [];
      root.traverse((o) => { if (o.isGroup || o === root) groups.push(o); });
      for (const gr of groups) mergeStatic(gr);
      this.meshes = [];
      root.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
      this.shadowOn = true;

      // animation state
      this.phase = Math.random() * 6;
      this.blinkT = 2 + Math.random() * 3;
      this.earT = 1 + Math.random() * 3;
      this.flinch = 0;
      this.deathT = -1;
      this.time = Math.random() * 10;
      this.lean = 0;
      this.legYaw = 0;
      this.crouchK = 0;
      this.airK = 0;
      this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
      this._q = new THREE.Quaternion();
      this.hold = { right: new THREE.Vector3(0.05, -0.08, 0.32), left: new THREE.Vector3(-0.02, -0.04, 0.55) };
      this.recoil = 0;
    }

    setWeapon(type) {
      if (this.gun) { this.weaponSocket.remove(this.gun); this.gun = null; }
      this.weaponType = type;
      if (!type || type === 'claws') {
        this.hold.right.set(0.14, -0.14, 0.26); this.hold.left.set(-0.2, -0.14, 0.24);
        return;
      }
      const gun = JB.Weapons.buildModel(type, this.probe, false);
      gun.traverse((o) => { if (o.isMesh) { o.castShadow = this.shadowOn !== false; } });
      gun.position.set(0.04, -0.03, 0.17);
      this.weaponSocket.add(gun);
      this.gun = gun;
      const D = JB.Weapons.DEFS[type];
      const hp = D.hold || [0.04, -0.07, 0.17, 0.0, -0.05, 0.45];
      this.hold.right.set(hp[0], hp[1], hp[2]);
      this.hold.left.set(hp[3], hp[4], hp[5]);
    }

    // Two-bone IK: place upper/fore cylinders from shoulder to target.
    _solveArm(arm, aimPitch) {
      const a = 0.27, b = 0.26;
      const S = this._v1.copy(arm.shoulder);
      const T = this._v2.copy(arm.sx > 0 ? this.hold.right : this.hold.left);
      // targets are in weapon-socket space; rotate by aim pitch around socket
      T.applyAxisAngle(AX, -aimPitch);
      T.add(this.weaponSocket.position);
      const d = this._v3.subVectors(T, S);
      let len = d.length();
      const maxL = a + b - 0.005;
      if (len > maxL) { d.multiplyScalar(maxL / len); T.copy(S).add(d); len = maxL; }
      if (len < 0.05) len = 0.05;
      const dir = d.clone().normalize();
      const cosA = U.clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      const pole = arm.pole.clone().sub(dir.clone().multiplyScalar(arm.pole.dot(dir))).normalize();
      const E = S.clone().add(dir.multiplyScalar(cosA * a)).add(pole.multiplyScalar(sinA * a));
      placeLimb(arm.upper, S, E, 0.06);
      placeLimb(arm.fore, E, T, 0.06);
      arm.elbow.position.copy(E);
      arm.hand.position.copy(T);
      arm.hand.quaternion.setFromUnitVectors(Y_AXIS, this._v3.subVectors(T, E).normalize());
    }

    // state: { speed, fwd, side, onGround, crouch, aimPitch, dead, sprint }
    update(dt, s) {
      this.time += dt;
      const t = this.time;
      if (this.deathT >= 0) { this._updateDeath(dt); return; }
      const speed = s.speed || 0;
      const moving = speed > 0.3 && s.onGround;
      // gait phase advances with distance travelled
      this.phase += dt * (moving ? 2.2 + speed * 1.15 : 0) * (s.fwd < -0.1 ? -1 : 1);
      const k = moving ? U.clamp(speed / 7, 0, 1) : 0;
      this.moveK = U.damp(this.moveK || 0, k, 10, dt);
      const mk = this.moveK;
      this.crouchK = U.damp(this.crouchK, s.crouch ? 1 : 0, 12, dt);
      this.airK = U.damp(this.airK, s.onGround ? 0 : 1, 10, dt);
      // legs swing in the movement direction (strafing turns the hips)
      const sideAng = Math.atan2(s.side || 0, Math.abs(s.fwd || 0) + 1e-3) * 0.6;
      this.legYaw = U.damp(this.legYaw, moving ? U.clamp(sideAng, -0.9, 0.9) : 0, 8, dt);
      this.hips.rotation.y = this.legYaw;
      this.spine.rotation.y = -this.legYaw;
      const ph = this.phase;
      const cr = this.crouchK;
      this.hips.position.y = 0.84 - cr * 0.3 + Math.abs(Math.sin(ph)) * 0.05 * mk - this.airK * 0.05 + Math.sin(t * 2.1) * 0.006;
      for (const L of this.legs) {
        const p = ph + (L.sx > 0 ? Math.PI : 0);
        const swing = Math.sin(p) * 0.75 * mk;
        const bend = Math.max(0, -Math.cos(p)) * 1.1 * mk;
        L.hip.rotation.x = -swing - cr * 0.95 - this.airK * 0.6;
        L.knee.rotation.x = bend + cr * 1.6 + this.airK * 1.0;
        L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.85;
        L.hip.rotation.z = -L.sx * 0.04;
      }
      // torso lean + breathing + aim
      const aim = U.clamp(s.aimPitch || 0, -1.2, 1.2);
      this.lean = U.damp(this.lean, mk * 0.18 + cr * 0.25 + (s.sprint ? 0.12 : 0), 8, dt);
      this.flinch = Math.max(0, this.flinch - dt * 4);
      this.spine.rotation.x = this.lean - aim * 0.35 - this.flinch * 0.25 + Math.sin(ph * 2) * 0.03 * mk;
      this.spine.rotation.z = Math.sin(ph) * 0.05 * mk;
      const breathe = 1 + Math.sin(t * 2.4) * 0.012;
      this.spine.scale.set(breathe, 1, breathe);
      this.head.rotation.x = -aim * 0.5 - this.lean * 0.8 - this.flinch * 0.3;
      this.head.rotation.z = Math.sin(t * 0.7) * 0.04;
      // weapon follows the rest of the aim pitch
      this.recoil = Math.max(0, this.recoil - dt * 8);
      const wp = aim * 0.65 + this.lean;
      this.weaponSocket.rotation.x = -wp - this.recoil * 0.25;
      this.weaponSocket.position.z = -this.recoil * 0.05;
      for (const arm of this.arms) this._solveArm(arm, wp + this.recoil * 0.25);
      // tail sway
      const tailAmp = 0.22 + mk * 0.25;
      for (let i = 0; i < this.tail.length; i++) {
        const seg = this.tail[i];
        seg.rotation.x = i === 0 ? -2.1 + mk * 0.5 : 0.2 + Math.sin(t * 2.2 - i * 0.6) * 0.06 - (i > 4 ? 0.12 : 0);
        seg.rotation.z = Math.sin(t * 1.6 - i * 0.55) * tailAmp * (0.4 + i * 0.12);
      }
      // blink + ear twitch
      this.blinkT -= dt;
      const blink = this.blinkT < 0.12 ? 0.1 : 1;
      if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 4;
      for (const e of this.eyes) e.scale.y = U.damp(e.scale.y, blink, 30, dt);
      this.earT -= dt;
      const tw = this.earT < 0.15 ? Math.sin(this.earT * 40) * 0.25 : 0;
      if (this.earT < 0) this.earT = 2 + Math.random() * 5;
      this.ears[0].rotation.x = -0.12 + tw;
      this.ears[1].rotation.x = -0.12 - tw * 0.5 + this.flinch * 0.5;
    }

    hit() { this.flinch = 1; }
    fire() { this.recoil = 1; }

    die(dir) {
      this.deathT = 0;
      this.deathDir = dir || 1;
      this.deathYaw = this.root.rotation.y;
    }
    revive() {
      this.deathT = -1;
      this.root.rotation.set(0, 0, 0);
      this.root.visible = true;
      this.root.position.y = 0;
    }
    _updateDeath(dt) {
      this.deathT += dt;
      const t = Math.min(1, this.deathT / 0.55);
      const e = t * t * (3 - 2 * t);
      // topple backwards (or forwards) around the feet, limbs go limp
      this.root.rotation.x = -this.deathDir * e * 1.45;
      this.hips.position.y = 0.84 - e * 0.25;
      for (const L of this.legs) { L.hip.rotation.x = U.lerp(L.hip.rotation.x, -0.3 + L.sx * 0.2, e); L.knee.rotation.x = U.lerp(L.knee.rotation.x, 0.5, e); }
      this.spine.rotation.x = U.lerp(this.spine.rotation.x, -0.2 * this.deathDir, e);
      for (const ear of this.ears) ear.rotation.x = U.lerp(ear.rotation.x, 0.6, e);
      for (const eye of this.eyes) eye.scale.y = Math.max(0.12, 1 - e);
      for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.z *= 0.95;
      for (const arm of this.arms) {
        arm.target = arm.target || new THREE.Vector3();
      }
      this.weaponSocket.rotation.x = U.lerp(this.weaponSocket.rotation.x, 1.2, e);
      for (const arm of this.arms) this._solveArm(arm, 0.8 * e);
    }

    // Only cats standing in sunlight can cast a visible (sun) shadow.
    setShadow(on) {
      if (on === this.shadowOn) return;
      this.shadowOn = on;
      for (const m of this.meshes) m.castShadow = on && !m.userData.noShadow;
      if (this.gun) this.gun.traverse((o) => { if (o.isMesh) o.castShadow = on; });
    }

    // Update the light probe from the level each frame.
    setLight(col, envK) {
      this.probe.color.value.copy(col);
      this.probe.env.value = envK;
    }
  }

  // Merge a group's direct static child meshes that share a material.
  function mergeStatic(group) {
    const buckets = new Map();
    for (const ch of group.children) {
      if (!ch.isMesh || ch.userData.dyn) continue;
      const k = ch.material.uuid;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(ch);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const parts = [];
      let n = 0;
      for (const m of list) {
        m.updateMatrix();
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        parts.push(g); n += g.attributes.position.count;
      }
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of parts) {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += g.attributes.position.count;
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, list[0].material);
      mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = true;
      for (const m of list) group.remove(m);
      group.add(mesh);
    }
  }

  const AX = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const _d = new THREE.Vector3();
  function placeLimb(mesh, A, B, r) {
    _d.subVectors(B, A);
    const len = _d.length();
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    mesh.scale.set(r, len, r);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, _d.normalize());
  }

  JB.Cat = Cat;
  JB.Cat.FURS = FURS;
  JB.Cat.probeMaterial = probeMaterial;
  JB.Cat.newProbe = newProbe;
})();
