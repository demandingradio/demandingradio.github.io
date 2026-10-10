// Jimbog — the match: fighters (you + 3 AI cats), movement, shooting,
// damage, pickups, respawns, the camera and the game loop.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;
  const W = JB.Weapons, DEFS = W.DEFS;

  const GRAV = 19, JUMP = 6.3;
  const RUN = 6.2, SPRINT = 8.2, CROUCH_SPEED = 3.0;
  const STAND_H = 1.72, CROUCH_H = 1.15;
  const FIX_DT = 1 / 120;

  const ROSTER = [
    { name: 'Mittens', fur: 'calico', vest: 0xb8433b, color: '#ff7a6b', voice: 1.25, p: { aggro: 0.9, accuracy: 0.9, fav: 'shotgun' } },
    { name: 'Ginger Tom', fur: 'ginger', vest: 0x3b6fb8, color: '#5aa8ff', voice: 0.95, p: { aggro: 0.6, accuracy: 1.0, fav: 'rifle' } },
    { name: 'Smokey', fur: 'grey', vest: 0xd0a428, color: '#ffd24a', voice: 0.8, p: { aggro: 0.35, accuracy: 1.15, fav: 'sniper' } }
  ];
  const SPARE_FURS = ['tabby', 'black', 'tuxedo', 'ginger', 'grey', 'calico'];
  const STREAKS = { 3: 'TRIPLE KILL — Purr-fect!', 5: 'RAMPAGE — Cat-astrophic!', 7: 'UNSTOPPABLE — Nine Lives!', 10: 'LEGENDARY — Top Cat!' };

  // Free geometries/materials of a removed object tree (textures are shared).
  function disposeTree(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) m.dispose();
    });
  }
  const sfx = (name, opts) => { if (JB.Audio) JB.Audio.play(name, opts); };

  // ------------------------------------------------------------------ fighter
  class Fighter {
    constructor(game, cfg, isPlayer) {
      this.g = game;
      this.name = cfg.name; this.fur = cfg.fur; this.color = cfg.color; this.voice = cfg.voice || 1;
      this.furLabel = JB.Cat.FURS[cfg.fur].label;
      this.isPlayer = isPlayer;
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      this.body = { pos: this.pos, vel: this.vel, r: 0.34, h: STAND_H, onGround: false };
      this.yaw = 0; this.pitch = 0;
      this.eyeH = 1.58; this.crouching = false; this.crouchK = 0;
      this.hp = 100; this.armor = 0; this.alive = false; this.respawnT = 0; this.invuln = 0;
      this.kills = 0; this.deaths = 0; this.streak = 0; this.bestStreak = 0;
      this.weapons = {};
      this.current = 'pistol'; this.prev = 'claws';
      this.cool = 0; this.reloadT = 0; this.switching = false; this.switchT = 0; this.bloom = 0;
      this.fireLatch = false;
      this.input = { mx: 0, mz: 0, fire: false, ads: false, jump: false, crouch: false, sprint: false, reload: false, weapon: null };
      this.adsK = 0; this.stepAcc = 0; this.wasGround = true;
      this.cat = new JB.Cat({ fur: cfg.fur, vest: cfg.vest, name: cfg.name });
      this.cat.root.rotation.order = 'YXZ';
      game.R.scene.add(this.cat.root);
      this.cat.root.visible = !isPlayer;
      this.furColor = new THREE.Color(JB.Cat.FURS[cfg.fur].base === 0xffffff ? 0xf2e6d8 : JB.Cat.FURS[cfg.fur].base);
      if (!isPlayer) this.brain = new JB.Brain(game, this, cfg.p);
      this.lightCol = new THREE.Color();
      this.resetWeapons();
    }
    resetWeapons() {
      const arsenal = this.g.settings.loadout === 'arsenal';
      for (const k of W.ORDER) {
        const d = DEFS[k];
        this.weapons[k] = { owned: k === 'claws' || k === 'pistol' || arsenal, mag: d.mag || 0, reserve: k === 'pistol' ? 48 : (arsenal ? (d.reserve || 0) : 0) };
      }
      this.current = 'pistol'; this.prev = 'claws';
      this.cat.setWeapon('pistol');
    }
  }

  // ------------------------------------------------------------------ pickups
  function pickupMesh(kind, type, probe) {
    const g = new THREE.Group();
    const item = new THREE.Group();
    g.add(item);
    const std = (p) => JB.Cat.probeMaterial(new THREE.MeshStandardMaterial(p), probe);
    let ring = 0xff8a2a;
    if (kind === 'weapon') {
      const m = W.buildModel(type, probe, false);
      m.scale.setScalar(1.35);
      m.position.z = -0.15;
      item.add(m);
    } else if (kind === 'health') {
      ring = 0x4cff8a;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), std({ color: 0xff8a5c, roughness: 0.35, metalness: 0.1 }));
      body.scale.set(1.5, 0.75, 0.55);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), std({ color: 0xffd6b8, roughness: 0.4 }));
      belly.scale.set(1.35, 0.5, 0.52); belly.position.y = -0.04;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 4), std({ color: 0xff7044, roughness: 0.4 }));
      tail.rotation.z = Math.PI / 2; tail.position.x = -0.38; tail.scale.set(1, 1, 0.3);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(0.22, 0.04, 0.1);
      item.add(body, belly, tail, eye);
    } else if (kind === 'armor') {
      ring = 0x4cb4ff;
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.22), std({ color: 0x2f5f9a, roughness: 0.6 }));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.06), std({ color: 0x9fb6cf, roughness: 0.3, metalness: 0.8 }));
      plate.position.z = 0.13;
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.2), std({ color: 0x1f2124 }));
      s1.position.set(-0.17, 0.36, 0); const s2 = s1.clone(); s2.position.x = 0.17;
      item.add(vest, plate, s1, s2);
    } else {
      ring = 0xffd23a;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.32), std({ color: 0x4d5a2a, roughness: 0.7 }));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.34), std({ color: 0x3a4520, roughness: 0.7 }));
      lid.position.y = 0.16;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.505, 0.06, 0.325), std({ color: 0xffd23a, roughness: 0.5 }));
      item.add(box, lid, stripe);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), std({ color: 0xd4a53a, metalness: 1, roughness: 0.3 }));
        b.position.set(-0.12 + i * 0.08, 0.24, 0); item.add(b);
      }
    }
    item.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // glowing base ring
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(ring).multiplyScalar(2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.02;
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    const gc = glowCv.getContext('2d'); const gg = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, 'rgba(255,255,255,0.7)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); gc.fillStyle = gg; gc.fillRect(0, 0, 64, 64);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCv), color: ring, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03;
    g.add(ringM, disc);
    g.userData.item = item; g.userData.ring = ringM; g.userData.disc = disc;
    return g;
  }

  class Pickup {
    constructor(game, def, temp) {
      this.g = game;
      this.kind = ['health', 'armor', 'ammo'].includes(def.t) ? def.t : 'weapon';
      this.type = def.t;
      const y = game.level.floorAt(def.x, def.z);
      this.pos = new THREE.Vector3(def.x, y === null ? 0 : y, def.z);
      this.active = true; this.timer = 0; this.temp = !!temp; this.life = temp ? 20 : 0;
      this.respawn = { weapon: 16, health: 18, armor: 26, ammo: 12 }[this.kind];
      this.probe = JB.Cat.newProbe();
      this.mesh = pickupMesh(this.kind, this.type, this.probe);
      this.mesh.position.copy(this.pos);
      game.R.scene.add(this.mesh);
      this.phase = Math.random() * 6;
      const c = new THREE.Color();
      game.level.sampleLight(this.pos.x, this.pos.y, this.pos.z, c);
      this.probe.color.value.copy(c).multiplyScalar(1.2).addScalar(0.05);
      this.probe.env.value = 0.9;
      this.ammo = null;
    }
    label() {
      if (this.kind === 'health') return 'Fish Snack +35';
      if (this.kind === 'armor') return 'Body Armour +50';
      if (this.kind === 'ammo') return 'Ammo';
      return DEFS[this.type].name;
    }
    update(dt) {
      if (this.temp) { this.life -= dt; if (this.life <= 0) { this.remove(); return false; } }
      if (!this.active) {
        this.timer -= dt;
        if (this.timer <= 0) { this.active = true; this.mesh.visible = true; this.mesh.scale.setScalar(0.01); }
      }
      if (this.active) {
        this.phase += dt;
        const it = this.mesh.userData.item;
        it.position.y = 0.75 + Math.sin(this.phase * 2) * 0.08;
        it.rotation.y += dt * 1.6;
        const s = this.mesh.scale.x;
        if (s < 1) this.mesh.scale.setScalar(Math.min(1, s + dt * 3));
        this.mesh.userData.disc.material.opacity = 0.4 + Math.sin(this.phase * 3) * 0.15;
      }
      return true;
    }
    take() {
      if (this.temp) { this.remove(); return; }
      this.active = false; this.timer = this.respawn; this.mesh.visible = false;
    }
    remove() { this.g.R.scene.remove(this.mesh); this.dead = true; }
  }

  // ------------------------------------------------------------------ game
  class Game {
    constructor(canvas, settings, hud) {
      this.canvas = canvas; this.settings = settings; this.hud = hud;
      this.time = 0; this.state = 'menu'; this.paused = false;
      this.keys = {}; this.mouse = { fire: false, ads: false };
      this.look = { x: 0, y: 0 };
      this.shake = 0; this.kick = { p: 0, y: 0 }; this.eyeSmooth = 0; this.dip = 0; this.dipV = 0;
      this.damageK = 0; this.healK = 0;
      this.projectiles = [];
      this.fighters = [];
      this.pickups = [];
      this.acc = 0;
    }

    build(progress) {
      const q = this.settings.quality;
      progress('Building the factory…');
      this.level = JB.Level.build({ quality: q });
      progress('Laying collision…');
      this.world = new JB.World(this.level.boxes, this.level.bounds);
      progress('Teaching cats the way around…');
      this.nav = new JB.Nav(this.level, this.world);
      progress('Lighting the plant…');
      this.R = JB.Render.create(this.canvas, q, this.level);
      this.R.scene.add(this.level.group);
      this.shafts = this.level.group.getObjectByName('shafts');
      this.fx = new JB.FX(this.R);
      // spawn points snapped to the nav mesh
      this.spawns = JB.MapData.spawns.map(([x, z, yaw]) => {
        const c = this.nav.nearest(x, this.level.floorAt(x, z) || 0, z, 3);
        const p = this.nav.pointOf(c, new THREE.Vector3());
        return { pos: p, yaw };
      });
      // fans in the air duct
      this.fans = [];
      for (const d of this.level.decor) if (d.t === 'fan') {
        const fan = new THREE.Group();
        const bm = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.8, roughness: 0.4 });
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.01, 0.16), bm); b.rotation.y = i * Math.PI / 4; fan.add(b); }
        fan.position.set(d.x, d.y, d.z);
        this.R.scene.add(fan); this.fans.push(fan);
      }
      this.menuCam = { shot: 0, t: 0 };
      this.R.camera.position.set(70, 1, 45);
    }

    // ---------------------------------------------------------------- match
    startMatch() {
      // clean up any previous match (and free its GPU memory)
      for (const f of this.fighters) { this.R.scene.remove(f.cat.root); disposeTree(f.cat.root); }
      for (const p of this.pickups) { this.R.scene.remove(p.mesh); disposeTree(p.mesh); }
      for (const pr of this.projectiles) this.R.scene.remove(pr.mesh);
      this.fighters = []; this.pickups = []; this.projectiles = [];
      const s = this.settings;
      const furs = [s.fur];
      const bots = ROSTER.map((r) => {
        const c = Object.assign({}, r);
        if (furs.includes(c.fur)) c.fur = SPARE_FURS.find((f) => !furs.includes(f) && !ROSTER.some((o) => o.fur === f)) || 'tabby';
        furs.push(c.fur);
        return c;
      });
      this.player = new Fighter(this, { name: (s.name || 'Jimbog').slice(0, 16), fur: s.fur, vest: 0x3f8f4f, color: '#7dff8a', voice: 1.05 }, true);
      this.fighters.push(this.player);
      for (const b of bots.slice(0, s.bots)) this.fighters.push(new Fighter(this, b, false));
      for (const p of JB.MapData.pickups) {
        const it = new Pickup(this, p);
        if (it.kind === 'weapon' && s.loadout === 'arsenal') { this.R.scene.remove(it.mesh); continue; }
        this.pickups.push(it);
      }
      if (!this.vm) this.vm = new W.ViewModel(this.R, s.fur);
      else { this.R.vmCamera.remove(this.vm.root); disposeTree(this.vm.root); this.vm = new W.ViewModel(this.R, s.fur); }
      this.vm.setWeapon('pistol', true);
      // spawn everyone apart
      const used = [];
      for (const f of this.fighters) this.respawn(f, used);
      this.time = 0;
      this.matchTime = s.time * 60;
      this.state = 'countdown'; this.countT = 3.2; this.lastCount = 4;
      this.ended = false;
      this.hud.show(true);
      this.hud.scoreboard(false);
      this.hud.death(false);
      if (JB.Audio) JB.Audio.startAmbience();
    }

    respawn(f, used) {
      // choose a spawn far from living enemies (and out of their sight)
      const enemies = this.fighters.filter((e) => e !== f && e.alive);
      let best = null, bestS = -Infinity;
      for (const sp of this.spawns) {
        if (used && used.includes(sp)) continue;
        let minD = 80;
        let seen = false;
        for (const e of enemies) {
          const d = e.pos.distanceTo(sp.pos);
          minD = Math.min(minD, d);
          if (d < 40 && this.world.clear(e.pos.x, e.pos.y + 1.5, e.pos.z, sp.pos.x, sp.pos.y + 1.4, sp.pos.z)) seen = true;
        }
        const s = minD - (seen ? 25 : 0) + Math.random() * 12;
        if (s > bestS) { bestS = s; best = sp; }
      }
      if (used) used.push(best);
      f.pos.copy(best.pos); f.vel.set(0, 0, 0);
      f.yaw = best.yaw; f.pitch = 0;
      f.hp = 100; f.armor = 0; f.alive = true; f.invuln = 1.5;
      f.crouching = false; f.body.h = STAND_H; f.crouchK = 0; f.eyeH = 1.58;
      f.reloadT = 0; f.switching = false; f.cool = 0.3; f.bloom = 0; f.streak = 0;
      f.resetWeapons();
      f.cat.revive();
      f.cat.root.visible = !f.isPlayer;
      f.cat.setWeapon(f.current);
      if (f.brain) { f.brain.reset(); f.brain.aimYaw = f.yaw; }
      if (f.isPlayer) {
        this.vm.setWeapon('pistol', true);
        this.vm.root.visible = true;
        this.hud.death(false);
        sfx('respawn');
        this.healK = 0.6;
      }
    }

    // ---------------------------------------------------------------- input
    bindInput() {
      if (this._bound) return;
      this._bound = true;
      const keys = this.keys;
      addEventListener('keydown', (e) => {
        if (this.state === 'menu' || e.target.tagName === 'INPUT') return;
        keys[e.code] = true;
        if (e.code === 'Tab') { e.preventDefault(); }
        if (!this.locked()) return;
        const p = this.player;
        if (!p || !p.alive) return;
        const m = /^Digit([1-7])$/.exec(e.code);
        if (m) { const k = W.ORDER[+m[1] - 1]; if (p.weapons[k].owned) p.input.weapon = k; }
        if (e.code === 'KeyQ') p.input.weapon = p.prev;
        if (e.code === 'KeyV' || e.code === 'KeyF') p.input.weapon = p.current === 'claws' ? p.prev : 'claws';
        if (e.code === 'KeyR') p.input.reload = true;
      });
      addEventListener('keyup', (e) => { keys[e.code] = false; });
      addEventListener('blur', () => { for (const k in keys) keys[k] = false; this.mouse.fire = false; this.mouse.ads = false; });
      this.canvas.addEventListener('mousedown', (e) => {
        if (!this.locked()) return;
        if (e.button === 0) this.mouse.fire = true;
        if (e.button === 2) this.mouse.ads = true;
      });
      addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.fire = false;
        if (e.button === 2) this.mouse.ads = false;
      });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      addEventListener('mousemove', (e) => {
        if (!this.locked()) return;
        this.look.x += e.movementX || 0; this.look.y += e.movementY || 0;
      });
      addEventListener('wheel', (e) => {
        if (!this.locked() || !this.player || !this.player.alive) return;
        const p = this.player, dir = e.deltaY > 0 ? 1 : -1;
        let i = W.ORDER.indexOf(p.input.weapon || p.current);
        for (let n = 0; n < 7; n++) {
          i = (i + dir + 7) % 7;
          const k = W.ORDER[i], w = p.weapons[k];
          if (w.owned && (DEFS[k].melee || w.mag + w.reserve > 0)) { p.input.weapon = k; break; }
        }
      }, { passive: true });
    }
    locked() { return document.pointerLockElement === this.canvas || this.touchMode; }

    playerInput(dt) {
      const p = this.player, k = this.keys, inp = p.input;
      const S = this.settings;
      // mouse look (slower when zoomed)
      const zoom = this.R.camera.userData.zoom || 1;
      const sens = 0.0018 * S.sens / Math.pow(zoom, 0.85);
      p.yaw -= this.look.x * sens;
      p.pitch -= this.look.y * sens * (S.invert ? -1 : 1);
      p.pitch = U.clamp(p.pitch, -1.5, 1.5);
      this.lookFrame = { x: this.look.x, y: this.look.y };
      this.look.x = 0; this.look.y = 0;
      let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      let s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      if (this.touch) { f += this.touch.f; s += this.touch.s; }
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      inp.mx = -sy * f + cy * s; inp.mz = -cy * f - sy * s;
      inp.fwd = f; inp.side = s;
      inp.jump = !!(k.Space || (this.touch && this.touch.jump));
      inp.crouch = !!(k.KeyC || k.ControlLeft || (this.touch && this.touch.crouch));
      inp.sprint = !!((k.ShiftLeft || k.ShiftRight) && f > 0);
      inp.fire = this.mouse.fire || !!(this.touch && this.touch.fire);
      inp.ads = this.mouse.ads || !!(this.touch && this.touch.ads);
      if (this.touch && this.touch.reload) { inp.reload = true; this.touch.reload = false; }
      if (this.touch && this.touch.cycle) {
        this.touch.cycle = false;
        let i = W.ORDER.indexOf(p.current);
        for (let n = 0; n < 7; n++) { i = (i + 1) % 7; const kk = W.ORDER[i], w = p.weapons[kk]; if (w.owned && (DEFS[kk].melee || w.mag + w.reserve > 0)) { inp.weapon = kk; break; } }
      }
    }

    // --------------------------------------------------------- simulation
    moveFighter(f, dt) {
      const inp = f.input, b = f.body;
      // crouch (stand only if there's room)
      let crouch = inp.crouch;
      if (!crouch && f.crouching && !this.world.fits(f.pos.x, f.pos.y, f.pos.z, b.r, STAND_H)) crouch = true;
      f.crouching = crouch;
      b.h = crouch ? CROUCH_H : STAND_H;
      f.crouchK = U.damp(f.crouchK, crouch ? 1 : 0, 14, dt);
      f.eyeH = 1.58 - f.crouchK * 0.56;
      const def = DEFS[f.current];
      let speed = f.isPlayer ? RUN : RUN * 0.95;
      const sprint = inp.sprint && !crouch && !inp.ads && !inp.fire;
      if (sprint) speed = f.isPlayer ? SPRINT : SPRINT * 0.9;
      if (crouch) speed = CROUCH_SPEED;
      f.adsK = U.damp(f.adsK, inp.ads && !f.switching && f.reloadT <= 0 && !def.melee ? 1 : 0, 12, dt);
      speed *= 1 - f.adsK * (def.scope ? 0.55 : 0.35);
      if (f.current === 'claws') speed *= 1.08;
      const L = Math.hypot(inp.mx, inp.mz);
      const wx = L > 0.01 ? inp.mx / L * speed : 0, wz = L > 0.01 ? inp.mz / L * speed : 0;
      const accel = b.onGround ? 15 : 2.2;
      f.vel.x = U.damp(f.vel.x, wx, accel, dt);
      f.vel.z = U.damp(f.vel.z, wz, accel, dt);
      if (inp.jump && b.onGround && f.jumpCool <= 0) {
        f.vel.y = JUMP; b.onGround = false; f.jumpCool = 0.3;
        sfx('jump', f.isPlayer ? { volume: 0.6 } : { pos: f.pos, volume: 0.5 });
      }
      f.jumpCool = (f.jumpCool || 0) - dt;
      f.vel.y -= GRAV * dt;
      const wasGround = b.onGround;
      b.landSpeed = 0;
      this.world.move(b, dt);
      if (f.isPlayer && b.stepUp > 0) this.eyeSmooth -= b.stepUp;
      if (!wasGround && b.onGround && b.landSpeed > 4) {
        sfx('land', f.isPlayer ? { volume: U.clamp(b.landSpeed / 10, 0.3, 1) } : { pos: f.pos, volume: 0.6 });
        if (f.isPlayer) this.dipV -= b.landSpeed * 0.03;
        if (b.landSpeed > 13) this.damage(f, (b.landSpeed - 13) * 6, null, 'fall', {});
      }
      // footsteps
      const hs = Math.hypot(f.vel.x, f.vel.z);
      if (b.onGround && hs > 1.5) {
        f.stepAcc += hs * dt;
        const stride = sprint ? 2.6 : 2.1;
        if (f.stepAcc > stride) {
          f.stepAcc = 0;
          if (!crouch) sfx('footstep', f.isPlayer ? { volume: sprint ? 0.55 : 0.4 } : { pos: f.pos, volume: sprint ? 0.9 : 0.6 });
          if (sprint && !f.isPlayer) this.noise(f.pos, f, false, 12);
        }
      }
      // fell out of the world (shouldn't happen) — put back
      if (f.pos.y < -14) { this.damage(f, 999, null, 'fall', {}); }
    }

    separate() {
      const fs = this.fighters;
      for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i], b = fs[j];
        if (!a.alive || !b.alive) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.68 && d > 1e-4) {
          const push = (0.68 - d) / 2, nx = dx / d, nz = dz / d;
          const tryMove = (f, sx, sz) => {
            const nxp = f.pos.x + sx, nzp = f.pos.z + sz;
            if (this.world.fits(nxp, f.pos.y, nzp, f.body.r, f.body.h)) { f.pos.x = nxp; f.pos.z = nzp; }
          };
          tryMove(a, -nx * push, -nz * push); tryMove(b, nx * push, nz * push);
        }
      }
    }

    updateWeapon(f, dt) {
      const inp = f.input;
      f.cool -= dt;
      f.bloom = Math.max(0, f.bloom - dt * 0.15);
      if (f.switching) { f.switchT -= dt; if (f.switchT <= 0) f.switching = false; }
      if (inp.weapon) { this.switchTo(f, inp.weapon); inp.weapon = null; }
      const def = DEFS[f.current], w = f.weapons[f.current];
      if (f.reloadT > 0) {
        f.reloadT -= dt;
        if (f.reloadT <= 0) {
          if (def.shellReload) {
            if (w.reserve > 0 && w.mag < def.mag) { w.mag++; w.reserve--; sfx('shell', f.isPlayer ? {} : { pos: f.pos }); }
            if (w.mag < def.mag && w.reserve > 0 && !inp.fire) { f.reloadT = def.reload; if (f.isPlayer) this.vm.reload(def.reload); }
          } else {
            const n = Math.min(def.mag - w.mag, w.reserve);
            w.mag += n; w.reserve -= n;
          }
        }
      }
      if (inp.reload) { this.startReload(f); inp.reload = false; }
      if (inp.fire) {
        if (def.auto || !f.fireLatch) this.tryFire(f);
      }
      f.fireLatch = inp.fire;
    }

    switchTo(f, type) {
      const w = f.weapons[type];
      if (!w || !w.owned || type === f.current) return;
      f.prev = f.current; f.current = type;
      f.switching = true; f.switchT = 0.38; f.reloadT = 0; f.cool = Math.max(f.cool, 0.1);
      f.cat.setWeapon(type);
      if (f.isPlayer) { this.vm.setWeapon(type); sfx('switch', { volume: 0.7 }); }
    }

    startReload(f) {
      const def = DEFS[f.current], w = f.weapons[f.current];
      if (def.melee || f.reloadT > 0 || w.mag >= def.mag || w.reserve <= 0 || f.switching) return;
      f.reloadT = def.reload;
      if (f.isPlayer) { this.vm.reload(def.reload); if (!def.shellReload) sfx('reload', { volume: 0.9 }); }
      else if (!def.shellReload) sfx('reload', { pos: f.pos, volume: 0.6 });
    }

    eyeOf(f, out) { return out.set(f.pos.x, f.pos.y + f.eyeH, f.pos.z); }
    forwardOf(f, out) {
      const cp = Math.cos(f.pitch);
      return out.set(-Math.sin(f.yaw) * cp, Math.sin(f.pitch), -Math.cos(f.yaw) * cp);
    }
    muzzleOf(f, out) {
      if (f.isPlayer) {
        this.vm.muzzleView(out);
        // view-model space -> world (same orientation as the main camera)
        out.applyQuaternion(this.R.camera.quaternion).add(this.R.camera.position);
        return out;
      }
      if (f.cat.gun) { f.cat.gun.updateWorldMatrix(true, false); return f.cat.gun.localToWorld(out.copy(f.cat.gun.userData.muzzle)); }
      return this.eyeOf(f, out);
    }

    tryFire(f) {
      const def = DEFS[f.current], w = f.weapons[f.current];
      if (f.cool > 0 || f.switching || !f.alive) return;
      if (f.reloadT > 0) {
        if (def.shellReload && w.mag > 0) f.reloadT = 0; else return;
      }
      if (def.melee) return this.melee(f);
      if (w.mag <= 0) {
        f.cool = 0.25;
        sfx('empty', f.isPlayer ? {} : { pos: f.pos, volume: 0.6 });
        if (w.reserve > 0) this.startReload(f);
        else if (f.isPlayer) {
          // out of ammo: fall back to the next weapon that has some
          for (const k of W.ORDER.slice().reverse()) { const ww = f.weapons[k]; if (ww.owned && (DEFS[k].melee || ww.mag + ww.reserve > 0)) { f.input.weapon = k; break; } }
        }
        return;
      }
      w.mag--;
      f.cool = def.rate;
      const eye = this.eyeOf(f, new THREE.Vector3());
      const fwd = this.forwardOf(f, new THREE.Vector3());
      const muzzle = this.muzzleOf(f, new THREE.Vector3());
      const hs = Math.hypot(f.vel.x, f.vel.z);
      let spread = U.lerp(def.spread, def.adsSpread, f.adsK) + def.moveSpread * U.clamp(hs / 6, 0, 1) + (f.body.onGround ? 0 : 0.05) + f.bloom;
      if (f.crouching) spread *= 0.75;
      if (def.auto) f.bloom = Math.min(0.045, f.bloom + def.recoil * 0.35);
      // sound + light
      sfx(def.sound, f.isPlayer ? {} : { pos: muzzle });
      this.noise(eye, f, true);
      this.R.flash(muzzle, 0xffb35c, def.slot === 6 ? 7 : 4.5, 7, 0.06);
      f.cat.fire();
      if (f.isPlayer) {
        this.vm.fire(def);
        const kickMul = 1 - f.adsK * 0.35;
        this.kick.p += def.recoil * kickMul * (0.85 + Math.random() * 0.3);
        this.kick.y += (Math.random() - 0.5) * def.recoil * 0.8 * kickMul;
        this.shake = Math.max(this.shake, def.recoil * 0.6);
      }
      if (def.projectile) { this.launch(f, muzzle, fwd, spread); return; }
      const n = def.pellets || 1;
      const dir = new THREE.Vector3();
      let anyHit = false, headHit = false, killed = false;
      for (let i = 0; i < n; i++) {
        W.spreadDir(fwd, spread, dir);
        const r = W.trace(this.world, this.fighters, f, eye, dir, def.range);
        const pt = new THREE.Vector3(r.x, r.y, r.z);
        if (i < 3) this.fx.tracer(muzzle, pt, f.isPlayer ? 0xffe0a8 : 0xffc890, def.slot === 6 ? 0.045 : 0.022);
        if (r.cat) {
          let dmg = def.damage * (r.head ? def.head : 1);
          if (def.pellets) dmg *= 1 - U.clamp((r.t - 6) / 30, 0, 0.7);
          else if (r.t > 30) dmg *= 1 - U.clamp((r.t - 30) / 120, 0, 0.35);
          const res = this.damage(r.cat, dmg, f, f.current, { head: r.head, dir, point: pt });
          anyHit = true; headHit = headHit || r.head; killed = killed || res === 'kill';
        } else if (r.wall) {
          const reg = this.level.regionAt(r.x - r.wall.nx * 0.1, r.z - r.wall.nz * 0.1);
          const metal = reg && /metal|diamond|grate/.test(reg.wmat + reg.fmat);
          this.fx.impact(r.wall, metal ? 'metal' : 'concrete');
          if (i === 0) sfx(Math.random() < 0.12 ? 'ricochet' : 'impact', { pos: pt, volume: 0.6 });
        }
        // near-miss whizz for the player
        if (!f.isPlayer && this.player.alive && r.cat !== this.player) this.whiz(eye, dir, r.t);
      }
      if (f.isPlayer && anyHit) this.hud.hitmarker(headHit, killed);
    }

    whiz(o, d, len) {
      const p = this.player;
      const hx = p.pos.x - o.x, hy = p.pos.y + p.eyeH - o.y, hz = p.pos.z - o.z;
      const t = hx * d.x + hy * d.y + hz * d.z;
      if (t < 2 || t > len) return;
      const cx = o.x + d.x * t - p.pos.x, cy = o.y + d.y * t - (p.pos.y + p.eyeH), cz = o.z + d.z * t - p.pos.z;
      if (cx * cx + cy * cy + cz * cz < 1.4 * 1.4 && Math.random() < 0.6) sfx('bullet_whiz', { pos: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), volume: 0.8 });
    }

    melee(f) {
      const def = DEFS.claws;
      f.cool = def.rate;
      sfx('claw', f.isPlayer ? {} : { pos: f.pos });
      if (f.isPlayer) this.vm.fire(def);
      f.cat.fire();
      const eye = this.eyeOf(f, new THREE.Vector3());
      const fwd = this.forwardOf(f, new THREE.Vector3());
      let best = null, bd = Infinity;
      for (const e of this.fighters) {
        if (e === f || !e.alive) continue;
        const c = new THREE.Vector3(e.pos.x, e.pos.y + 1.0, e.pos.z);
        const to = c.clone().sub(eye);
        const d = to.length();
        if (d > def.range + 0.4) continue;
        if (to.normalize().dot(fwd) < 0.55) continue;
        if (!this.world.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z)) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        // pounce from behind = double damage
        const behind = Math.cos(best.yaw - f.yaw) > 0.6;
        const res = this.damage(best, def.damage * (behind ? 2 : 1), f, 'claws', { dir: fwd, point: new THREE.Vector3(best.pos.x, best.pos.y + 1.1, best.pos.z), head: false });
        sfx('claw_hit', { pos: best.pos });
        if (f.isPlayer) { this.hud.hitmarker(false, res === 'kill'); if (behind) this.hud.center('POUNCE!', 'gold'); }
      }
    }

    launch(f, muzzle, fwd, spread) {
      const def = DEFS.launcher;
      const dir = W.spreadDir(fwd, spread, new THREE.Vector3());
      if (!this.hairballMat) {
        const tx = JB.Tex.make('fur_ginger', 256);
        this.hairballMat = new THREE.MeshStandardMaterial({ color: 0xc08a50, map: tx.map, normalMap: tx.normalMap, roughness: 1 });
        this.hairballGeo = new THREE.IcosahedronGeometry(0.13, 2);
      }
      const mesh = new THREE.Mesh(this.hairballGeo, this.hairballMat);
      mesh.castShadow = true;
      // start a little in front of the eye so it never spawns inside a wall
      const eye = this.eyeOf(f, new THREE.Vector3());
      const start = eye.clone().addScaledVector(fwd, 0.4);
      if (!this.world.clear(eye.x, eye.y, eye.z, start.x, start.y, start.z, 0)) start.copy(eye);
      mesh.position.copy(start);
      this.R.scene.add(mesh);
      this.projectiles.push({
        mesh, owner: f, pos: mesh.position, vel: dir.multiplyScalar(def.speed).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(f.vel, 0.3),
        r: 0.13, life: 2.4, age: 0, bounces: 0
      });
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.age += dt; pr.life -= dt;
        pr.vel.y -= 13 * dt;
        const hit = this.world.bounce(pr, dt, 0.42);
        if (hit && !pr.rest) { pr.bounces++; if (pr.bounces < 6) sfx('impact', { pos: pr.pos, volume: 0.35, pitch: 0.6 }); }
        pr.mesh.rotation.x += dt * 9; pr.mesh.rotation.z += dt * 5;
        if (Math.random() < 0.5) this.fx.smoke.add(pr.pos.x, pr.pos.y, pr.pos.z, 0, 0.2, 0, 0.5, 0.05, 0.03, 0.7, 0.5, 0.3, 0.8, 1, 1);
        let boom = pr.life <= 0;
        for (const e of this.fighters) {
          if (!e.alive || (e === pr.owner && pr.age < 0.35)) continue;
          const dx = e.pos.x - pr.pos.x, dz = e.pos.z - pr.pos.z;
          const dy = (e.pos.y + 0.9) - pr.pos.y;
          if (dx * dx + dz * dz < 0.5 * 0.5 && Math.abs(dy) < 1.0) boom = true;
        }
        if (boom) {
          this.explode(pr.pos.clone(), pr.owner);
          this.R.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    }

    explode(p, owner) {
      const def = DEFS.launcher;
      this.fx.explosion(p);
      const down = this.world.raycast(p.x, p.y + 0.2, p.z, 0, -1, 0, 1.2, 3);
      if (down) this.fx.scorch(down, 1);
      this.R.flash(p, 0xff9a40, 14, 14, 0.35);
      sfx('explosion', { pos: p, volume: 1 });
      this.noise(p, owner, true);
      for (const e of this.fighters) {
        if (!e.alive) continue;
        const c = new THREE.Vector3(e.pos.x, e.pos.y + 0.9, e.pos.z);
        const d = c.distanceTo(p);
        if (d > def.radius) continue;
        if (!this.world.clear(p.x, p.y + 0.1, p.z, c.x, c.y, c.z) && !this.world.clear(p.x, p.y + 0.1, p.z, c.x, c.y + 0.6, c.z)) continue;
        const k = Math.pow(1 - d / def.radius, 1.1);
        let dmg = def.damage * k;
        if (e === owner) dmg *= 0.55;
        const dir = c.clone().sub(p).normalize();
        e.vel.addScaledVector(dir, 9 * k); e.vel.y += 4 * k; e.body.onGround = false;
        this.damage(e, dmg, owner, 'launcher', { dir, point: c, splash: true });
      }
      if (this.player) {
        const d = this.player.pos.distanceTo(p);
        this.shake = Math.max(this.shake, U.clamp(1.2 - d / 14, 0, 1) * 1.1);
      }
    }

    noise(pos, who, loud, radius) {
      for (const f of this.fighters) if (f.brain) {
        if (radius && f.pos.distanceTo(pos) > radius) continue;
        f.brain.hear(pos, who, loud);
      }
    }

    // ---------------------------------------------------------------- damage
    damage(v, amount, attacker, weapon, opts) {
      if (!v.alive || v.invuln > 0 || this.state !== 'play') return null;
      if (attacker && attacker !== v && v.invuln > 0) return null;
      amount = Math.max(0, amount);
      if (v.armor > 0) {
        const soak = Math.min(v.armor, amount * 0.66);
        v.armor -= soak; amount -= soak;
      }
      v.hp -= amount;
      v.cat.hit();
      v.lastHitBy = attacker; v.lastHitT = this.time;
      if (opts.point) this.fx.fur(opts.point, v.furColor, opts.head ? 14 : 8, opts.dir);
      if (v.isPlayer) {
        this.damageK = Math.min(1.2, this.damageK + amount / 45);
        sfx('hurt', { volume: 0.8, pitch: v.voice });
        if (attacker && attacker !== v) {
          const dx = attacker.pos.x - v.pos.x, dz = attacker.pos.z - v.pos.z;
          const ang = Math.atan2(-dx, -dz);
          this.hud.damageDir(-(ang - v.yaw));
        }
        this.shake = Math.max(this.shake, Math.min(0.6, amount / 60));
      } else {
        sfx(opts.head ? 'headshot' : 'hit', { pos: v.pos, volume: 0.8 });
        if (Math.random() < 0.3) sfx('hurt', { pos: v.pos, volume: 0.7, pitch: v.voice });
        if (v.brain) v.brain.damagedBy(attacker);
      }
      if (attacker && attacker.isPlayer && attacker !== v) sfx(opts.head ? 'headshot' : 'hitmarker', { volume: 0.7 });
      if (v.hp <= 0) { this.kill(v, attacker, weapon, opts.head); return 'kill'; }
      return 'hit';
    }

    kill(v, killer, weapon, head) {
      v.alive = false; v.hp = 0; v.deaths++;
      v.respawnT = 3.2;
      v.streak = 0;
      v.killer = killer; v.killWeapon = weapon;
      const dir = killer ? Math.sign(Math.cos(killer.yaw - v.yaw)) || 1 : 1;
      v.cat.die(-dir);
      v.cat.root.visible = true;
      sfx('death', { pos: v.pos, pitch: v.voice });
      this.fx.fur(new THREE.Vector3(v.pos.x, v.pos.y + 1.0, v.pos.z), v.furColor, 26, null);
      // drop the weapon they were holding
      if (!['pistol', 'claws'].includes(v.current) && v.weapons[v.current].mag + v.weapons[v.current].reserve > 0) {
        const it = new Pickup(this, { t: v.current, x: v.pos.x, z: v.pos.z }, true);
        it.ammo = { mag: v.weapons[v.current].mag, reserve: v.weapons[v.current].reserve };
        this.pickups.push(it);
      }
      if (killer && killer !== v) {
        killer.kills++; killer.streak++;
        killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
        if (killer.isPlayer) {
          sfx('kill');
          this.hud.center(head ? 'HEADSHOT — ' + v.name : 'ELIMINATED ' + v.name, head ? 'gold' : '');
          if (STREAKS[killer.streak]) setTimeout(() => this.hud.center(STREAKS[killer.streak], 'gold big'), 500);
        } else if (Math.random() < 0.7) setTimeout(() => sfx('meow', { pos: killer.pos, pitch: killer.voice }), 400);
      } else {
        v.kills = Math.max(0, v.kills - 1);
      }
      this.hud.feed(killer, v, weapon, head, killer && killer.isPlayer, v.isPlayer);
      if (v.isPlayer) {
        this.vm.root.visible = false;
        this.deathCam = { t: 0, pos: v.pos.clone(), yaw: v.yaw };
        this.mouse.fire = false;
      }
      if (killer && killer.kills >= this.settings.frags) this.endMatch();
    }

    endMatch() {
      if (this.ended) return;
      this.ended = true;
      this.state = 'end';
      this.endT = 0;
      sfx('match_end');
      const rows = this.fighters.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const win = rows[0];
      this.result = { winner: win, rows, playerWon: win.isPlayer };
      if (this.onEnd) setTimeout(() => this.onEnd(this.result), 1600);
    }

    // ---------------------------------------------------------------- pickups
    updatePickups(dt) {
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        if (!it.update(dt)) { this.pickups.splice(i, 1); continue; }
        if (!it.active) continue;
        for (const f of this.fighters) {
          if (!f.alive) continue;
          const dx = f.pos.x - it.pos.x, dz = f.pos.z - it.pos.z, dy = f.pos.y - it.pos.y;
          if (dx * dx + dz * dz > 1.0 || Math.abs(dy) > 1.3) continue;
          if (this.grab(f, it)) { it.take(); break; }
        }
      }
    }
    grab(f, it) {
      let msg = '';
      if (it.kind === 'health') {
        if (f.hp >= 100) return false;
        f.hp = Math.min(100, f.hp + 35); msg = 'Fish Snack  +35 health';
        sfx('pickup_health', f.isPlayer ? {} : { pos: f.pos });
        if (f.isPlayer) this.healK = 0.8;
      } else if (it.kind === 'armor') {
        if (f.armor >= 100) return false;
        f.armor = Math.min(100, f.armor + 50); msg = 'Body Armour  +50';
        sfx('pickup_armor', f.isPlayer ? {} : { pos: f.pos });
      } else if (it.kind === 'ammo') {
        let any = false;
        for (const k of W.ORDER) {
          const d = DEFS[k], w = f.weapons[k];
          if (!w.owned || d.melee) continue;
          if (w.reserve < d.maxReserve) { w.reserve = Math.min(d.maxReserve, w.reserve + Math.max(1, Math.round(d.mag * (k === 'pistol' ? 1 : 0.75)))); any = true; }
        }
        if (!any) return false;
        msg = 'Ammo';
        sfx('pickup_ammo', f.isPlayer ? {} : { pos: f.pos });
      } else {
        const d = DEFS[it.type], w = f.weapons[it.type];
        const extra = it.ammo ? it.ammo.mag + it.ammo.reserve : d.mag * 2;
        if (w.owned) {
          if (w.reserve >= d.maxReserve) return false;
          w.reserve = Math.min(d.maxReserve, w.reserve + Math.max(d.mag, Math.round(extra * 0.6)));
          msg = d.name + ' ammo';
        } else {
          w.owned = true; w.mag = it.ammo ? Math.min(d.mag, it.ammo.mag || d.mag) : d.mag;
          w.reserve = it.ammo ? Math.min(d.maxReserve, it.ammo.reserve) : d.mag;
          msg = d.name;
          // auto-switch to a better gun
          if (f.isPlayer && W.ORDER.indexOf(it.type) > W.ORDER.indexOf(f.current) && !f.input.fire) f.input.weapon = it.type;
        }
        sfx('pickup_weapon', f.isPlayer ? {} : { pos: f.pos });
      }
      if (f.isPlayer) this.hud.pickup(msg);
      return true;
    }

    // ---------------------------------------------------------------- frame
    frame(dt) {
      dt = Math.min(dt, 0.05);
      if (this.paused) { this.render(0); return; }
      if (this.state === 'menu') { this.menuCamera(dt); this.render(dt); return; }
      this.time += dt;
      if (this.state === 'countdown') {
        this.countT -= dt;
        const n = Math.ceil(this.countT);
        if (n !== this.lastCount && n > 0) { this.lastCount = n; this.hud.center(String(n), 'big'); sfx('countdown'); }
        if (this.countT <= 0) { this.state = 'play'; this.hud.center('FIGHT!', 'big gold'); sfx('go'); }
      }
      const live = this.state === 'play';
      if (live) {
        this.matchTime -= dt;
        if (this.matchTime <= 0) { this.matchTime = 0; this.endMatch(); }
      }
      // input + AI
      if (this.player.alive) this.playerInput(dt);
      else { this.look.x = 0; this.look.y = 0; this.lookFrame = { x: 0, y: 0 }; }
      for (const f of this.fighters) {
        if (f.brain && f.alive && live) f.brain.update(dt);
        if (!live || !f.alive) {
          const keepLook = f.isPlayer;
          f.input.mx = 0; f.input.mz = 0; f.input.fire = false; f.input.jump = false;
          if (!keepLook) f.input.ads = false;
        }
      }
      // fixed-step physics for stable collisions
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIX_DT && steps < 8) {
        for (const f of this.fighters) if (f.alive) this.moveFighter(f, FIX_DT);
        this.acc -= FIX_DT; steps++;
      }
      if (steps >= 8) this.acc = 0;
      this.separate();
      for (const f of this.fighters) {
        if (f.alive) {
          f.invuln = Math.max(0, f.invuln - dt);
          if (live) this.updateWeapon(f, dt);
        } else if (live || this.state === 'end') {
          f.respawnT -= dt;
          if (f.respawnT <= 0 && this.state === 'play') {
            if (!f.isPlayer || this.mouse.fire || f.respawnT < -2.5 || (this.touch && this.touch.fire)) { this.respawn(f); this.mouse.fire = false; }
          }
        }
      }
      this.updateProjectiles(dt);
      this.updatePickups(dt);
      for (const fan of this.fans) fan.rotation.y += dt * 9;
      this.animateCats(dt);
      this.updateCamera(dt);
      this.updateHUD(dt);
      this.render(dt);
    }

    animateCats(dt) {
      const col = new THREE.Color();
      for (const f of this.fighters) {
        if (!f.cat.root.visible) continue;
        const c = f.cat;
        c.root.position.copy(f.pos);
        if (f.alive) c.root.rotation.y = f.yaw + Math.PI;
        // local movement for leg animation
        const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
        const fwd = -(f.vel.x * sy + f.vel.z * cy), side = f.vel.x * cy - f.vel.z * sy;
        c.update(dt, { speed: Math.hypot(f.vel.x, f.vel.z), fwd, side, onGround: f.body.onGround, crouch: f.crouching, aimPitch: f.pitch, sprint: f.input.sprint });
        this.level.sampleLight(f.pos.x, f.pos.y, f.pos.z, col);
        const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
        c.setLight(col, U.clamp(lum * 1.6 + 0.1, 0.12, 1.1));
        const L = this.level;
        c.setShadow(L.inSun(f.pos.x, f.pos.y + 0.2, f.pos.z) || L.inSun(f.pos.x, f.pos.y + 1.0, f.pos.z) || L.inSun(f.pos.x, f.pos.y + 1.7, f.pos.z));
        // spawn-protection shimmer
        c.probe.flash.value.setRGB(f.invuln > 0 ? 0.15 + Math.sin(this.time * 20) * 0.1 : 0, f.invuln > 0 ? 0.3 : 0, f.invuln > 0 ? 0.4 : 0);
        if (!f.alive && f.respawnT < 0.6 && !f.isPlayer) c.root.visible = f.respawnT > 0 ? (Math.floor(f.respawnT * 20) % 2 === 0) : false;
      }
    }

    updateCamera(dt) {
      const p = this.player, cam = this.R.camera, S = this.settings;
      this.kick.p *= Math.exp(-dt * 9); this.kick.y *= Math.exp(-dt * 9);
      // land dip spring
      this.dipV += (-this.dip * 120 - this.dipV * 14) * dt; this.dip += this.dipV * dt;
      this.eyeSmooth = U.damp(this.eyeSmooth, 0, 14, dt);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.damageK = Math.max(0, this.damageK - dt * 0.9);
      this.healK = Math.max(0, this.healK - dt * 1.2);
      const sh = this.shake * this.shake;
      if (p.alive) {
        const def = DEFS[p.current];
        cam.position.set(p.pos.x, p.pos.y + p.eyeH + this.eyeSmooth + this.dip, p.pos.z);
        const roll = -(p.input.side || 0) * 0.012 * (p.body.onGround ? 1 : 0);
        this.roll = U.damp(this.roll || 0, roll, 8, dt);
        cam.rotation.set(p.pitch + this.kick.p + (Math.random() - 0.5) * sh * 0.05, p.yaw + this.kick.y + (Math.random() - 0.5) * sh * 0.05, this.roll, 'YXZ');
        // recoil partly sticks (pull-down is the player's job)
        p.pitch = U.clamp(p.pitch + this.kick.p * dt * 3.2, -1.5, 1.5);
        const zoom = U.lerp(1, def.zoom || 1, p.adsK);
        const sprintFov = p.input.sprint && Math.hypot(p.vel.x, p.vel.z) > 7 ? 1.06 : 1;
        this.fovMul = U.damp(this.fovMul || 1, sprintFov, 6, dt);
        const fov = S.fov * this.fovMul / zoom;
        if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
        cam.userData.zoom = zoom;
        // view-model
        const lf = this.lookFrame || { x: 0, y: 0 };
        this.vm.update(dt, { speed: Math.hypot(p.vel.x, p.vel.z), sprint: p.input.sprint, onGround: p.body.onGround, ads: p.input.ads && !def.melee, lookX: lf.x, lookY: lf.y });
        const col = new THREE.Color();
        this.level.sampleLight(p.pos.x, p.pos.y, p.pos.z, col);
        const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
        this.vm.setLight(col.multiplyScalar(1.1), U.clamp(lum * 1.5 + 0.15, 0.2, 1.1));
        this.R.vmHemi.intensity = 0.25 + lum * 0.4;
        this.R.vmKey.intensity = this.level.inSun(p.pos.x, p.pos.y + 1.5, p.pos.z) ? 1.6 : 0.35 + lum * 0.4;
      } else if (this.deathCam) {
        // orbit the fallen cat, then look toward whoever did it
        const dc = this.deathCam;
        dc.t += dt;
        const k = p.killer && p.killer !== p && p.killer.alive ? p.killer : null;
        const target = new THREE.Vector3(dc.pos.x, dc.pos.y + 0.6, dc.pos.z);
        const ang = dc.yaw + dc.t * 0.35;
        const want = new THREE.Vector3(dc.pos.x + Math.sin(ang) * 3.2, dc.pos.y + 2.4, dc.pos.z + Math.cos(ang) * 3.2);
        // keep the camera inside the room
        const hit = this.world.raycast(target.x, target.y, target.z, want.x - target.x, want.y - target.y, want.z - target.z, 1, 3);
        if (hit) want.lerpVectors(target, want, Math.max(0.1, hit.t - 0.15));
        cam.position.lerp(want, 1 - Math.exp(-dt * 4));
        const look = k && dc.t > 1.2 ? new THREE.Vector3(k.pos.x, k.pos.y + 1.2, k.pos.z) : target;
        const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        cam.quaternion.slerp(q, 1 - Math.exp(-dt * 3));
        if (Math.abs(cam.fov - S.fov) > 0.01) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
        cam.userData.zoom = 1;
      }
      if (this.R.finalPass) {
        this.R.finalPass.uniforms.uDamage.value = this.damageK + (p.alive ? U.clamp((35 - p.hp) / 35, 0, 1) * 0.35 : 0.6);
        this.R.finalPass.uniforms.uHeal.value = this.healK;
        this.R.finalPass.uniforms.uSat.value = p.alive ? 1.08 : 0.25;
      }
      if (JB.Audio) {
        const f = this.forwardOf({ yaw: cam.rotation.y, pitch: 0 }, new THREE.Vector3());
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        JB.Audio.setListener(cam.position, dir.lengthSq() > 0 ? dir : f);
      }
    }

    updateHUD(dt) {
      const h = this.hud, p = this.player;
      h.update(dt);
      const def = DEFS[p.current], w = p.weapons[p.current];
      h.vitals(p.hp, p.armor);
      const owned = {};
      for (const k of W.ORDER) owned[k] = p.weapons[k].owned;
      const rk = p.reloadT > 0 && !def.shellReload ? 1 - p.reloadT / def.reload : 0;
      h.weapon(p.current, w.mag, w.reserve, owned, rk);
      // crosshair gap from current spread (in pixels)
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const spread = def.melee ? 0.02 : U.lerp(def.spread, def.adsSpread, p.adsK) + def.moveSpread * U.clamp(hs / 6, 0, 1) + (p.body.onGround ? 0 : 0.05) + p.bloom;
      const px = Math.tan(spread) / Math.tan(this.R.camera.fov * Math.PI / 360) * innerHeight / 2;
      h.crosshair(4 + px, p.alive && this.state !== 'end' && !(p.input.sprint && hs > 6) && (def.melee || p.adsK < 0.5), p.alive && def.scope && p.adsK > 0.85);
      // timer + standing
      const rows = this.fighters.slice().sort((a, b) => b.kills - a.kills);
      const rank = rows.indexOf(p) + 1;
      const ord = ['1st', '2nd', '3rd', '4th'][rank - 1] || rank + 'th';
      const leader = rows[0] === p ? (rows[1] ? rows[1] : null) : rows[0];
      h.timer(this.matchTime, ord + '  ·  ' + p.kills + ' / ' + this.settings.frags + (leader ? '   (' + (rows[0] === p ? 'next ' : 'leader ') + leader.name + ' ' + leader.kills + ')' : ''));
      if (p.alive) {
        const reg = this.level.regionAt(p.pos.x, p.pos.z);
        if (reg && reg.name) h.area(reg.name);
        h.hint(p.invuln > 0 && this.state === 'play' ? 'Spawn protection' : (w.mag === 0 && w.reserve === 0 && !def.melee ? 'Out of ammo — find a pickup or switch weapon' : (w.mag === 0 && !def.melee ? 'Press R to reload' : '')));
      } else if (this.state !== 'end') {
        const k = p.killer;
        const kt = k && k !== p ? 'Scratched out by <b style="color:' + k.color + '">' + k.name.replace(/</g, '&lt;') + '</b> — ' + (DEFS[p.killWeapon] ? DEFS[p.killWeapon].name : 'a fall') : 'You coughed up a hairball';
        const ct = p.respawnT > 0 ? 'Respawning in ' + Math.ceil(p.respawnT) : (this.touchMode ? 'Tap FIRE to respawn' : 'Click to respawn');
        h.death(true, kt, ct);
        h.hint('');
      }
      h.scoreboard(!!this.keys.Tab && (this.state === 'play' || this.state === 'countdown'), this.fighters);
    }

    // Slow cinematic fly-through behind the menu.
    menuCamera(dt) {
      const shots = [
        { a: [86, -2.2, 37.5], b: [70, -2.4, 50], look: [80, -1.0, 44] },
        { a: [94, -2.6, 21.5], b: [107, -2.6, 20], look: [101, -2.5, 15] },
        { a: [31, 1.5, 18.5], b: [58, 1.5, 19], look: [64, 1.4, 19] },
        { a: [70, 0.0, 36.5], b: [78, -0.2, 36.8], look: [88, -2.0, 46] },
        { a: [4, -3.0, 55], b: [10, -3.0, 59], look: [11, -3.3, 64] },
        { a: [20, 1.6, 26], b: [12, 1.6, 33], look: [5, 1.4, 22] }
      ];
      const m = this.menuCam;
      m.t += dt;
      if (m.t > 9) { m.t = 0; m.shot = (m.shot + 1) % shots.length; }
      const s = shots[m.shot], k = U.smooth(m.t / 9);
      const cam = this.R.camera;
      cam.position.set(U.lerp(s.a[0], s.b[0], k), U.lerp(s.a[1], s.b[1], k), U.lerp(s.a[2], s.b[2], k));
      cam.lookAt(s.look[0], s.look[1], s.look[2]);
      if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
      if (this.R.finalPass) { this.R.finalPass.uniforms.uDamage.value = 0; this.R.finalPass.uniforms.uSat.value = 1.08; }
    }

    render(dt) {
      this.R.update(dt, performance.now() / 1000);
      if (this.shafts) this.shafts.userData.shaft.uniforms.uTime.value = performance.now() / 1000;
      this.fx.update(dt, this.R.camera);
      this.R.render();
      // first second in the menu: make sure post-processing isn't drawing black
      this.frames = (this.frames || 0) + 1;
      if (this.R.composer && this.frames <= 90 && this.frames % 15 === 0) this.R.selfCheck();
    }
  }

  JB.Game = Game;
})();
