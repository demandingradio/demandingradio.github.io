// Jimbog — weapons: stats, procedural gun models, the first-person
// view-model (cat paws included) and hitscan ray tests against cats.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  // ------------------------------------------------------------------ stats
  // spread = cone half-angle (radians) from the hip; adsSpread when aiming.
  const DEFS = {
    claws: {
      name: 'Claws', short: 'CLAWS', slot: 1, melee: true, damage: 55, rate: 0.45, range: 2.4,
      icon: '🐾', sound: 'claw', bot: { min: 0, max: 2.5, pref: 1.5 }
    },
    pistol: {
      name: 'Purr-9 Pistol', short: 'PURR-9', slot: 2, damage: 24, rate: 0.17, auto: false, mag: 12, reserve: 72, maxReserve: 96,
      spread: 0.016, adsSpread: 0.004, moveSpread: 0.02, recoil: 0.035, reload: 1.3, range: 120, head: 2.0, zoom: 1.25,
      sound: 'pistol', icon: '🔫', hold: [0.04, -0.12, 0.27, -0.02, -0.13, 0.25],
      vm: { hip: [0.13, -0.125, -0.34], ads: [0, 0, -0.27] }, bot: { min: 0, max: 30, pref: 10 }
    },
    smg: {
      name: 'Hiss-5 SMG', short: 'HISS-5', slot: 3, damage: 13, rate: 0.068, auto: true, mag: 32, reserve: 128, maxReserve: 192,
      spread: 0.032, adsSpread: 0.014, moveSpread: 0.025, recoil: 0.014, reload: 1.7, range: 90, head: 1.6, zoom: 1.3,
      sound: 'smg', icon: '🔫', hold: [0.05, -0.11, 0.24, -0.01, -0.06, 0.44],
      vm: { hip: [0.13, -0.13, -0.33], ads: [0, 0, -0.25] }, bot: { min: 0, max: 22, pref: 8 }
    },
    shotgun: {
      name: 'Scratcher-12 Shotgun', short: 'SCRATCHER', slot: 4, damage: 11, pellets: 9, rate: 0.9, auto: false, mag: 6, reserve: 24, maxReserve: 36,
      spread: 0.075, adsSpread: 0.06, moveSpread: 0.01, recoil: 0.09, reload: 0.5, shellReload: true, range: 40, head: 1.5, zoom: 1.2,
      sound: 'shotgun', icon: '🔫', hold: [0.05, -0.1, 0.22, 0.0, -0.08, 0.58],
      vm: { hip: [0.13, -0.13, -0.32], ads: [0, 0, -0.24] }, bot: { min: 0, max: 14, pref: 5 }
    },
    rifle: {
      name: 'Tom-47 Rifle', short: 'TOM-47', slot: 5, damage: 19, rate: 0.1, auto: true, mag: 30, reserve: 120, maxReserve: 180,
      spread: 0.02, adsSpread: 0.003, moveSpread: 0.022, recoil: 0.018, reload: 2.0, range: 150, head: 2.0, zoom: 1.6,
      sound: 'rifle', icon: '🔫', hold: [0.05, -0.1, 0.22, 0.0, -0.07, 0.52],
      vm: { hip: [0.13, -0.135, -0.33], ads: [0, 0, -0.22] }, bot: { min: 0, max: 45, pref: 16 }
    },
    sniper: {
      name: 'Whisker .50 Sniper', short: 'WHISKER', slot: 6, damage: 95, rate: 1.25, auto: false, mag: 5, reserve: 15, maxReserve: 25,
      spread: 0.06, adsSpread: 0.0, moveSpread: 0.05, recoil: 0.11, reload: 2.6, range: 220, head: 2.5, zoom: 5, scope: true,
      sound: 'sniper', icon: '🎯', hold: [0.05, -0.1, 0.22, 0.0, -0.08, 0.6],
      vm: { hip: [0.13, -0.14, -0.33], ads: [0, 0, -0.2] }, bot: { min: 8, max: 90, pref: 30 }
    },
    launcher: {
      name: 'Hairball Launcher', short: 'HAIRBALL', slot: 7, damage: 125, radius: 4.8, rate: 0.85, auto: false, mag: 4, reserve: 8, maxReserve: 12,
      projectile: true, speed: 24, spread: 0.01, adsSpread: 0.005, moveSpread: 0.01, recoil: 0.07, reload: 2.4, range: 60, zoom: 1.2,
      sound: 'launcher', icon: '💥', hold: [0.06, -0.1, 0.18, 0.0, -0.06, 0.45],
      vm: { hip: [0.14, -0.145, -0.36], ads: [0.0, 0, -0.28] }, bot: { min: 6, max: 30, pref: 14 }
    }
  };
  const ORDER = ['claws', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher'];
  // Where the paws go on each gun (model space, +z = muzzle direction).
  const GRIPS = {
    pistol: { grip: [0, -0.05, -0.01], fore: [0.0, -0.075, 0.02] },
    smg: { grip: [0, -0.045, -0.015], fore: [0, -0.005, 0.2] },
    shotgun: { grip: [0, -0.045, -0.07], fore: [0, -0.005, 0.36] },
    rifle: { grip: [0, -0.05, -0.045], fore: [0, -0.005, 0.33] },
    sniper: { grip: [0, -0.05, -0.065], fore: [0, -0.02, 0.3] },
    launcher: { grip: [0, -0.045, 0.0], fore: [0, -0.04, 0.2] }
  };
  const VM_SCALE = 0.72;

  // ------------------------------------------------------------------ models
  let MAT = null;
  function materials() {
    if (MAT) return MAT;
    const std = (p) => new THREE.MeshStandardMaterial(p);
    MAT = {
      gunmetal: std({ color: 0x24272c, roughness: 0.42, metalness: 0.7 }),
      steel: std({ color: 0x6f757d, roughness: 0.32, metalness: 0.85 }),
      polymer: std({ color: 0x1b1c1f, roughness: 0.7, metalness: 0.05 }),
      grey: std({ color: 0x4a4e55, roughness: 0.55, metalness: 0.3 }),
      tan: std({ color: 0x8c7650, roughness: 0.75, metalness: 0.05 }),
      wood: std({ color: 0x7a4a26, roughness: 0.55, metalness: 0.0 }),
      orange: std({ color: 0xff7a1a, roughness: 0.45, metalness: 0.2 }),
      teal: std({ color: 0x18b6a8, roughness: 0.45, metalness: 0.25 }),
      pink: std({ color: 0xff6fa8, roughness: 0.45, metalness: 0.2 }),
      brass: std({ color: 0xd4a53a, roughness: 0.3, metalness: 1.0 }),
      lens: std({ color: 0x2a6aa8, roughness: 0.05, metalness: 0.6, emissive: 0x0a2440, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(3) }),
      hairball: std({ color: 0xa8743e, roughness: 1.0 })
    };
    return MAT;
  }
  // Clone materials per owner so each gets its own light probe uniforms.
  function ownedMaterials(probe) {
    const base = materials(), out = {};
    for (const k in base) {
      const m = base[k].clone();
      if (m.isMeshStandardMaterial) JB.Cat.probeMaterial(m, probe);
      out[k] = m;
    }
    return out;
  }

  // Boxes with softly bevelled edges catch highlights like machined parts.
  const BCACHE = {};
  const B = (w, h, d) => {
    const k = w + '_' + h + '_' + d;
    if (BCACHE[k]) return BCACHE[k];
    const r = Math.min(0.006, Math.min(w, h, d) * 0.22);
    const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(c);
      if (v.lengthSq() > 1e-12) v.normalize().multiplyScalar(r);
      v.add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return (BCACHE[k] = g);
  };
  const C = (r1, r2, h, s) => new THREE.CylinderGeometry(r1, r2, h, s || 14);
  // Parts are placed with +z pointing down the barrel; y up.
  function part(g, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m);
    return m;
  }
  const along = Math.PI / 2;  // cylinders are Y-aligned; rotate onto Z

  function buildModel(type, probe, isVM) {
    const M = probe ? ownedMaterials(probe) : materials();
    const g = new THREE.Group();
    g.userData.muzzle = new THREE.Vector3(0, 0.03, 0.3);
    g.userData.eject = new THREE.Vector3(0.03, 0.05, 0.08);
    if (type === 'pistol') {
      part(g, B(0.034, 0.038, 0.2), M.gunmetal, 0, 0.045, 0.07);
      part(g, B(0.03, 0.03, 0.16), M.polymer, 0, 0.012, 0.06);
      part(g, B(0.028, 0.11, 0.045), M.polymer, 0, -0.045, -0.005, -0.22);
      part(g, B(0.031, 0.02, 0.02), M.orange, 0, 0.02, 0.0);
      part(g, C(0.009, 0.009, 0.03), M.steel, 0, 0.045, 0.18, along);
      part(g, B(0.008, 0.01, 0.01), M.steel, 0, 0.069, 0.155);
      part(g, B(0.022, 0.01, 0.01), M.steel, 0, 0.069, -0.02);
      part(g, B(0.006, 0.03, 0.03), M.gunmetal, 0, -0.005, 0.03);
      g.userData.muzzle.set(0, 0.045, 0.2);
      g.userData.sightY = 0.074;
    } else if (type === 'smg') {
      part(g, B(0.05, 0.065, 0.3), M.polymer, 0, 0.03, 0.08);
      part(g, B(0.052, 0.02, 0.22), M.teal, 0, 0.07, 0.09);
      part(g, C(0.016, 0.016, 0.12), M.gunmetal, 0, 0.035, 0.28, along);
      part(g, C(0.011, 0.011, 0.04), M.steel, 0, 0.035, 0.35, along);
      part(g, B(0.03, 0.17, 0.05), M.gunmetal, 0, -0.08, 0.12, 0.12);
      part(g, B(0.03, 0.1, 0.045), M.polymer, 0, -0.04, -0.01, -0.25);
      part(g, B(0.012, 0.04, 0.2), M.steel, 0, 0.03, -0.16);
      part(g, B(0.03, 0.05, 0.015), M.steel, 0, 0.03, -0.26);
      part(g, B(0.01, 0.025, 0.012), M.steel, 0, 0.09, 0.2);
      part(g, B(0.03, 0.025, 0.012), M.steel, 0, 0.09, 0.0);
      g.userData.muzzle.set(0, 0.035, 0.37);
      g.userData.sightY = 0.1;
    } else if (type === 'shotgun') {
      part(g, C(0.02, 0.02, 0.62), M.gunmetal, 0, 0.05, 0.32, along);
      part(g, C(0.016, 0.016, 0.5), M.gunmetal, 0, 0.012, 0.28, along);
      part(g, B(0.06, 0.04, 0.16), M.wood, 0, 0.012, 0.36);
      for (let i = 0; i < 6; i++) part(g, B(0.062, 0.006, 0.012), M.polymer, 0, 0.034, 0.3 + i * 0.022);
      part(g, B(0.055, 0.08, 0.2), M.gunmetal, 0, 0.035, 0.02);
      part(g, B(0.03, 0.1, 0.045), M.wood, 0, -0.04, -0.06, -0.3);
      part(g, B(0.05, 0.08, 0.3), M.wood, 0, -0.01, -0.26, 0.12);
      part(g, B(0.052, 0.09, 0.03), M.polymer, 0, -0.03, -0.41, 0.12);
      part(g, B(0.057, 0.012, 0.15), M.orange, 0, 0.078, 0.02);
      part(g, C(0.004, 0.004, 0.01), M.brass, 0, 0.075, 0.62, 0);
      for (let i = 0; i < 4; i++) part(g, C(0.009, 0.009, 0.05), M.pink, -0.034, 0.03, -0.02 + i * 0.022, 0, 0, along);
      g.userData.muzzle.set(0, 0.05, 0.64);
      g.userData.sightY = 0.08;
    } else if (type === 'rifle') {
      part(g, B(0.05, 0.075, 0.32), M.tan, 0, 0.035, 0.05);
      part(g, B(0.055, 0.06, 0.26), M.polymer, 0, 0.035, 0.33);
      for (let i = 0; i < 8; i++) part(g, B(0.058, 0.008, 0.012), M.gunmetal, 0, 0.069, 0.22 + i * 0.03);
      part(g, C(0.012, 0.012, 0.18), M.gunmetal, 0, 0.035, 0.53, along);
      part(g, C(0.018, 0.018, 0.06), M.gunmetal, 0, 0.035, 0.62, along);
      const mag = part(g, B(0.035, 0.17, 0.07), M.gunmetal, 0, -0.07, 0.12, 0.25);
      mag.userData.mag = true;
      part(g, B(0.032, 0.11, 0.05), M.polymer, 0, -0.045, -0.04, -0.3);
      part(g, B(0.045, 0.08, 0.25), M.tan, 0, 0.0, -0.24, 0.06);
      part(g, B(0.048, 0.1, 0.03), M.polymer, 0, -0.01, -0.37, 0.06);
      // red-dot optic
      part(g, B(0.03, 0.014, 0.08), M.gunmetal, 0, 0.078, 0.06);
      part(g, new THREE.CylinderGeometry(0.021, 0.021, 0.055, 16, 1, true), M.gunmetal, 0, 0.103, 0.06, along);
      part(g, new THREE.TorusGeometry(0.021, 0.004, 6, 18), M.gunmetal, 0, 0.103, 0.033);
      part(g, new THREE.CircleGeometry(0.019, 16), M.lens, 0, 0.103, 0.087).material = M.lens.clone();
      part(g, new THREE.CircleGeometry(0.0025, 8), M.dot, 0, 0.103, 0.086, 0, Math.PI, 0);
      part(g, B(0.052, 0.012, 0.08), M.orange, 0, 0.0, -0.2, 0.06);
      g.userData.muzzle.set(0, 0.035, 0.66);
      g.userData.sightY = 0.102;
    } else if (type === 'sniper') {
      part(g, B(0.05, 0.07, 0.3), M.gunmetal, 0, 0.03, 0.03);
      part(g, C(0.014, 0.016, 0.62), M.gunmetal, 0, 0.04, 0.46, along);
      part(g, B(0.035, 0.05, 0.06), M.steel, 0, 0.04, 0.78);
      part(g, B(0.055, 0.06, 0.3), M.teal, 0, 0.0, 0.25);
      part(g, C(0.026, 0.026, 0.3), M.polymer, 0, 0.115, 0.05, along);
      part(g, C(0.032, 0.026, 0.06), M.polymer, 0, 0.115, 0.22, along);
      part(g, C(0.03, 0.026, 0.05), M.polymer, 0, 0.115, -0.11, along);
      part(g, C(0.028, 0.028, 0.005), M.lens, 0, 0.115, 0.252, along);
      part(g, B(0.03, 0.04, 0.03), M.gunmetal, 0, 0.08, -0.02);
      part(g, B(0.03, 0.04, 0.03), M.gunmetal, 0, 0.08, 0.12);
      part(g, C(0.008, 0.008, 0.06), M.steel, 0.045, 0.04, -0.05, 0, 0, along);
      part(g, new THREE.SphereGeometry(0.014, 8, 6), M.steel, 0.075, 0.04, -0.05);
      part(g, B(0.032, 0.11, 0.05), M.polymer, 0, -0.045, -0.06, -0.3);
      part(g, B(0.05, 0.09, 0.32), M.teal, 0, -0.005, -0.28, 0.05);
      part(g, B(0.052, 0.035, 0.12), M.polymer, 0, 0.05, -0.26);
      part(g, B(0.052, 0.11, 0.03), M.polymer, 0, -0.02, -0.45, 0.05);
      g.userData.muzzle.set(0, 0.04, 0.82);
      g.userData.sightY = 0.115;
    } else if (type === 'launcher') {
      part(g, C(0.055, 0.055, 0.52), M.grey, 0, 0.05, 0.12, along);
      part(g, C(0.062, 0.062, 0.06), M.orange, 0, 0.05, 0.36, along);
      part(g, C(0.062, 0.062, 0.04), M.orange, 0, 0.05, -0.1, along);
      const ball = part(g, new THREE.SphereGeometry(0.05, 14, 10), M.hairball, 0, 0.05, 0.37);
      ball.userData.ball = true;
      part(g, B(0.032, 0.11, 0.05), M.polymer, 0, -0.04, 0.0, -0.25);
      part(g, B(0.03, 0.09, 0.04), M.polymer, 0, -0.04, 0.2, 0.1);
      part(g, B(0.006, 0.07, 0.006), M.steel, 0, 0.13, 0.2);
      part(g, B(0.05, 0.006, 0.006), M.steel, 0, 0.165, 0.2);
      part(g, B(0.006, 0.04, 0.006), M.steel, 0, 0.12, -0.02);
      part(g, B(0.06, 0.07, 0.12), M.polymer, 0, -0.005, -0.2);
      g.userData.muzzle.set(0, 0.05, 0.4);
      g.userData.sightY = 0.155;
    }
    if (!isVM) g.scale.setScalar(1.0);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !isVM; o.receiveShadow = !isVM; } });
    return g;
  }

  // ------------------------------------------------------------ view model
  class ViewModel {
    constructor(R, furKey) {
      this.R = R;
      this.probe = JB.Cat.newProbe();
      this.root = new THREE.Group();        // sways/bobs
      R.vmCamera.add(this.root);
      this.holder = new THREE.Group();      // weapon + paws, recoil applied here
      this.root.add(this.holder);
      const F = JB.Cat.FURS[furKey] || JB.Cat.FURS.ginger;
      const tx = JB.Tex.make(F.tex, 256);
      const P = this.probe;
      this.furMat = JB.Cat.probeMaterial(new THREE.MeshStandardMaterial({ color: F.tint, map: tx.map, normalMap: tx.normalMap, roughness: 0.85 }), P);
      this.pawMat = JB.Cat.probeMaterial(new THREE.MeshStandardMaterial({ color: F.socks ? F.light : F.tint, map: F.socks ? null : tx.map, roughness: 0.85 }), P);
      this.beanMat = JB.Cat.probeMaterial(new THREE.MeshStandardMaterial({ color: 0xf09aa8, roughness: 0.5 }), P);
      this.clawMat = JB.Cat.probeMaterial(new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.3 }), P);
      this.sleeveMat = JB.Cat.probeMaterial(new THREE.MeshStandardMaterial({ color: 0x31343a, roughness: 0.8 }), P);
      this.models = {};
      this.type = null;
      this.t = 0;
      this.bobT = 0;
      this.sway = new THREE.Vector2();
      this.kick = { z: 0, vz: 0, p: 0, vp: 0, roll: 0 };
      this.switchK = 0;     // 0 = up, 1 = lowered
      this.reloadT = 0; this.reloadDur = 0;
      this.adsK = 0;
      this.sprintK = 0;
      this.swingT = 0;
      this.flashT = 0;
      this.shells = [];
      this._buildFlash();
      this._buildShells();
    }
    // A furry forearm ending in a paw at `pos`; the arm runs back along `dir`.
    _paw(group, pos, dir, claws) {
      const arm = new THREE.Group();
      arm.position.set(pos[0], pos[1], pos[2]);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
      group.add(arm);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.4, 14), this.furMat);
      fore.position.y = -0.2; arm.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.045, 0.07, 14), this.sleeveMat);
      cuff.position.y = -0.36; arm.add(cuff);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), this.pawMat);
      paw.scale.set(1.05, 1.15, 0.95); paw.position.y = 0.005; arm.add(paw);
      // toe beans + main pad (on the palm side, facing the gun)
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), this.beanMat);
        b.position.set(-0.018 + k * 0.012, 0.03 - Math.abs(k - 1.5) * 0.004, 0.022); b.scale.set(1, 1, 0.6);
        arm.add(b);
      }
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), this.beanMat);
      pad.position.set(0, 0.0, 0.03); pad.scale.set(1.25, 1, 0.45); arm.add(pad);
      if (claws) {
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.045, 6), this.clawMat);
          c.position.set(-0.018 + k * 0.012, 0.045, 0.012); c.rotation.x = -0.35;
          arm.add(c);
        }
      }
      return arm;
    }
    _build(type) {
      const g = new THREE.Group();
      if (type === 'claws') {
        this._paw(g, [0.13, -0.1, -0.26], [0.35, -0.55, 0.75], true);
        this._paw(g, [-0.13, -0.1, -0.26], [-0.35, -0.55, 0.75], true);
        g.userData.claws = true;
        g.children.forEach((c) => { c.userData.rest = c.position.clone(); c.userData.restQ = c.quaternion.clone(); });
        return g;
      }
      const gun = buildModel(type, this.probe, true);
      gun.rotation.y = Math.PI;   // view-model looks down -z
      gun.scale.setScalar(VM_SCALE);
      g.add(gun);
      g.userData.gun = gun;
      const toVM = (p) => [-p[0] * VM_SCALE, p[1] * VM_SCALE, -p[2] * VM_SCALE];
      const G2 = GRIPS[type];
      const gp = toVM(G2.grip), fp = toVM(G2.fore);
      this._paw(g, [gp[0] + 0.006, gp[1] - 0.012, gp[2]], [0.3, -0.62, 0.72], false);
      if (type === 'pistol') this._paw(g, [fp[0] - 0.02, fp[1] - 0.006, fp[2] - 0.005], [-0.4, -0.58, 0.7], false);
      else this._paw(g, [fp[0] - 0.008, fp[1] - 0.024, fp[2]], [-0.42, -0.5, 0.75], false);
      const vm = (v) => v.clone().set(-v.x * VM_SCALE, v.y * VM_SCALE, -v.z * VM_SCALE);
      g.userData.muzzle = vm(gun.userData.muzzle);
      g.userData.eject = vm(gun.userData.eject);
      g.userData.sightY = gun.userData.sightY * VM_SCALE;
      return g;
    }
    _buildFlash() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const c = cv.getContext('2d');
      const grd = c.createRadialGradient(64, 64, 2, 64, 64, 62);
      grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,0.9)'); grd.addColorStop(1, 'rgba(255,90,0,0)');
      c.fillStyle = grd; c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, r = i % 2 ? 22 : 62;
        c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      c.fill();
      const tex = new THREE.CanvasTexture(cv);
      this.flashTex = tex;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.6, 1.3, 1) });
      this.flash = new THREE.Group();
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), mat); b.rotation.y = Math.PI / 2; b.position.z = -0.08;
      const c2 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), mat); c2.rotation.set(0, Math.PI / 2, Math.PI / 2); c2.position.z = -0.08;
      this.flash.add(a, b, c2);
      this.flash.visible = false;
      this.holder.add(this.flash);
    }
    _buildShells() {
      const m = materials().brass;
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6), m);
        s.visible = false;
        this.root.add(s);
        this.shells.push({ m: s, v: new THREE.Vector3(), life: 0 });
      }
    }
    setWeapon(type, instant) {
      if (this.type === type) return;
      this.nextType = type;
      if (instant || !this.type) { this._swap(); this.switchK = instant ? 0 : 1; }
    }
    _swap() {
      if (this.model) this.holder.remove(this.model);
      this.type = this.nextType;
      this.nextType = null;
      this.model = this.models[this.type] || (this.models[this.type] = this._build(this.type));
      this.holder.add(this.model);
      this.flash.position.copy(this.model.userData.muzzle || new THREE.Vector3(0, 0, -0.5));
      this.reloadT = 0;
    }
    get busy() { return !!this.nextType || this.switchK > 0.3; }
    fire(def) {
      const k = this.kick;
      k.vz += 0.9 + def.recoil * 12; k.vp += 6 + def.recoil * 70;
      k.roll = (Math.random() - 0.5) * def.recoil * 3;
      if (!def.melee) {
        this.flashT = 0.05;
        this.flash.rotation.z = Math.random() * Math.PI;
        const sc = def.pellets ? 1.5 : (def.slot === 6 ? 1.6 : 1);
        this.flash.scale.setScalar(sc * (0.8 + Math.random() * 0.4));
        if (!def.projectile && !def.pellets) this._ejectShell();
      } else this.swingT = 0.35;
    }
    _ejectShell() {
      const s = this.shells.find((x) => x.life <= 0) || this.shells[0];
      const ej = this.model.userData.eject;
      if (!ej) return;
      s.m.position.copy(ej).applyMatrix4(this.model.matrix).add(this.holder.position);
      s.v.set(0.9 + Math.random() * 0.4, 1.0 + Math.random() * 0.5, 0.2);
      s.life = 0.6; s.m.visible = true;
      s.m.rotation.set(Math.random() * 3, 0, Math.random() * 3);
    }
    reload(dur) { this.reloadT = dur; this.reloadDur = dur; }
    // st: { speed, sprint, onGround, ads, lookX, lookY, crouch, landing }
    update(dt, st) {
      this.t += dt;
      const D = DEFS[this.type] || DEFS.pistol;
      // weapon switch: lower, swap, raise
      if (this.nextType) { this.switchK = Math.min(1, this.switchK + dt * 6); if (this.switchK >= 1) this._swap(); }
      else this.switchK = Math.max(0, this.switchK - dt * 4.5);
      this.adsK = U.damp(this.adsK, st.ads && !this.nextType && this.reloadT <= 0 ? 1 : 0, 14, dt);
      this.sprintK = U.damp(this.sprintK, st.sprint && st.speed > 1 ? 1 : 0, 8, dt);
      // bob (figure-eight) scaled by speed
      const sp = st.onGround ? U.clamp(st.speed / 6, 0, 1.4) : 0;
      this.bobT += dt * (6 + sp * 5) * (sp > 0.05 ? 1 : 0);
      const bobA = sp * (1 - this.adsK * 0.85);
      const bx = Math.sin(this.bobT) * 0.012 * bobA, by = -Math.abs(Math.cos(this.bobT)) * 0.014 * bobA;
      // sway from mouse look
      this.sway.x = U.damp(this.sway.x, U.clamp(-st.lookX * 0.0009, -0.04, 0.04), 9, dt);
      this.sway.y = U.damp(this.sway.y, U.clamp(st.lookY * 0.0009, -0.04, 0.04), 9, dt);
      const idle = Math.sin(this.t * 1.4) * 0.002 * (1 - this.adsK);
      // recoil spring
      const k = this.kick;
      k.vz += (-k.z * 220 - k.vz * 22) * dt; k.z += k.vz * dt;
      k.vp += (-k.p * 200 - k.vp * 20) * dt; k.p += k.vp * dt;
      k.roll *= Math.exp(-dt * 10);
      // place
      const hip = D.vm ? D.vm.hip : [0.12, -0.11, -0.28];
      const ads = D.vm ? D.vm.ads : hip;
      const a = this.adsK;
      const sightCorrection = this.model && this.model.userData.sightY ? -this.model.userData.sightY * a : 0;
      const px = U.lerp(hip[0], ads[0], a) + bx + this.sway.x * (1 - a * 0.7);
      const py = U.lerp(hip[1], ads[1], a) + by + idle + this.sway.y * (1 - a * 0.7) - this.switchK * 0.35 - this.sprintK * 0.05 + sightCorrection;
      const pz = U.lerp(hip[2], ads[2], a);
      this.root.position.set(px, py, pz);
      this.root.rotation.set(this.switchK * -0.6 + this.sprintK * -0.25, (1 - a) * 0.045 + this.sprintK * 0.55 + this.sway.x * 2, this.sprintK * 0.2 + this.sway.x * 3);
      // recoil + reload motion on the holder
      let rx = k.p * 0.01, rz = k.z * 0.05, ry = 0, rr = k.roll, hy = 0;
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        const t = 1 - this.reloadT / this.reloadDur;
        const env = Math.sin(Math.min(1, t) * Math.PI);
        rx -= env * 0.5; rr += env * 0.6; hy -= env * 0.08;
        // magazine drop + insert wobble
        if (this.model) this.model.traverse((o) => { if (o.userData.mag) o.position.y = -0.07 - Math.max(0, Math.sin(t * Math.PI * 2)) * 0.12; });
      }
      // melee swipe
      if (this.model && this.model.userData.claws) {
        this.swingT = Math.max(0, this.swingT - dt);
        const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) : 0;
        const right = this.model.children[0], left = this.model.children[1];
        right.position.copy(right.userData.rest).add(new THREE.Vector3(-sw * 0.22, sw * 0.06, -sw * 0.12));
        right.quaternion.copy(right.userData.restQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sw * 0.5, 0, sw * 1.1)));
        left.position.copy(left.userData.rest); left.position.y += Math.sin(this.t * 2) * 0.004;
      }
      this.holder.position.set(0, hy, rz);
      this.holder.rotation.set(-rx * -1, ry, rr);
      this.holder.rotation.x = rx;
      // muzzle flash
      if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = true; } else this.flash.visible = false;
      this.R.vmFlash.intensity = this.flashT > 0 ? 3.5 : 0;
      if (this.model && this.model.userData.muzzle) this.R.vmFlash.position.copy(this.model.userData.muzzle).add(this.root.position);
      // shells
      for (const s of this.shells) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.v.y -= 9 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += dt * 20;
        if (s.life <= 0) s.m.visible = false;
      }
      // hide the gun when the sniper scope overlay is up
      this.root.visible = !(D.scope && this.adsK > 0.85);
    }
    // muzzle position in view space (for tracers)
    muzzleView(out) {
      if (!this.model || !this.model.userData.muzzle) return out.set(0.15, -0.12, -0.6);
      out.copy(this.model.userData.muzzle);
      this.holder.updateMatrix(); this.root.updateMatrix();
      out.applyMatrix4(this.holder.matrix).applyMatrix4(this.root.matrix);
      return out;
    }
    setLight(col, envK) { this.probe.color.value.copy(col).multiplyScalar(0.6); this.probe.env.value = envK * 0.8; }
  }

  // ------------------------------------------------------------ hit tests
  // Hitboxes for a cat at feet position p: head sphere + body capsule.
  function hitboxes(e, out) {
    const p = e.pos, cr = e.crouchK || 0;
    const fy = Math.cos(e.yaw), fx = Math.sin(e.yaw);
    out.headX = p.x - fx * 0.05; out.headZ = p.z - fy * 0.05;
    out.headY = p.y + 1.52 - cr * 0.42; out.headR = 0.22;
    out.ay = p.y + 0.25; out.by = p.y + 1.28 - cr * 0.4; out.bodyR = 0.32;
    return out;
  }
  const HB = {};
  // Ray vs sphere: returns t or -1
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = ox - cx, ly = oy - cy, lz = oz - cz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const h = b * b - c;
    if (h < 0) return -1;
    const t = -b - Math.sqrt(h);
    return t >= 0 ? t : (c < 0 ? 0 : -1);
  }
  // Ray vs vertical capsule (x,z fixed, y from a to b)
  function rayCapsule(ox, oy, oz, dx, dy, dz, cx, cz, ya, yb, r) {
    // cylinder part (infinite in y, clipped)
    const lx = ox - cx, lz = oz - cz;
    const A = dx * dx + dz * dz, Bq = 2 * (lx * dx + lz * dz), Cq = lx * lx + lz * lz - r * r;
    let best = -1;
    if (A > 1e-9) {
      const disc = Bq * Bq - 4 * A * Cq;
      if (disc >= 0) {
        const t = (-Bq - Math.sqrt(disc)) / (2 * A);
        const y = oy + dy * t;
        if (t >= 0 && y >= ya && y <= yb) best = t;
      }
    }
    for (const yy of [ya, yb]) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, cx, yy, cz, r);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }
  // Trace a bullet through cats and the world.
  function trace(world, cats, shooter, o, d, range) {
    const hit = world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range, 3);
    let bestT = hit ? hit.t : range, who = null, head = false;
    for (const e of cats) {
      if (e === shooter || !e.alive) continue;
      hitboxes(e, HB);
      const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, HB.headX, HB.headY, HB.headZ, HB.headR);
      if (th >= 0 && th < bestT) { bestT = th; who = e; head = true; }
      const tb = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, e.pos.x, e.pos.z, HB.ay, HB.by, HB.bodyR);
      if (tb >= 0 && tb < bestT) { bestT = tb; who = e; head = false; }
    }
    return {
      t: bestT, x: o.x + d.x * bestT, y: o.y + d.y * bestT, z: o.z + d.z * bestT,
      cat: who, head, wall: !who && hit ? hit : null
    };
  }
  // Random direction inside a cone around d.
  const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
  function spreadDir(d, angle, out) {
    if (angle <= 0) return out.copy(d);
    _t1.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    _t2.crossVectors(d, _t1);
    const r = Math.sqrt(Math.random()) * Math.tan(angle), a = Math.random() * Math.PI * 2;
    out.copy(d).addScaledVector(_t1, Math.cos(a) * r).addScaledVector(_t2, Math.sin(a) * r).normalize();
    return out;
  }

  JB.Weapons = { DEFS, ORDER, buildModel, ViewModel, trace, spreadDir, hitboxes };
})();
