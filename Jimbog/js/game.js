// Jimbog — the match: fighters (you, AI cats or online friends), the game
// loop, CS-style movement hookup, pickups, respawns, camera and HUD.
// Shooting, damage and grenades live in combat.js (mixed in below); the
// online protocol lives in online.js and plugs in through `this.net`.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;
  const W = JB.Weapons, DEFS = W.DEFS;
  const MV = JB.Movement;
  const DEG = Math.PI / 180;

  const FIX_DT = 1 / 120;

  const ROSTER = [
    { name: 'Mittens', fur: 'calico', vest: 0xb8433b, color: '#ff7a6b', voice: 1.25, p: { aggro: 0.9, accuracy: 0.9, fav: 'shotgun' } },
    { name: 'Ginger Tom', fur: 'ginger', vest: 0x3b6fb8, color: '#5aa8ff', voice: 0.95, p: { aggro: 0.6, accuracy: 1.0, fav: 'rifle' } },
    { name: 'Smokey', fur: 'grey', vest: 0xd0a428, color: '#ffd24a', voice: 0.8, p: { aggro: 0.35, accuracy: 1.15, fav: 'sniper' } }
  ];
  const SPARE_FURS = ['tabby', 'black', 'tuxedo', 'ginger', 'grey', 'calico'];
  const STREAKS = { 3: 'TRIPLE KILL — Purr-fect!', 5: 'RAMPAGE — Cat-astrophic!', 7: 'UNSTOPPABLE — Nine Lives!', 10: 'LEGENDARY — Top Cat!' };
  // Colours for online players (vest + name), in join order.
  const NET_COLORS = [
    { vest: 0x3f8f4f, color: '#7dff8a' }, { vest: 0xb8433b, color: '#ff7a6b' }, { vest: 0x3b6fb8, color: '#5aa8ff' }, { vest: 0xd0a428, color: '#ffd24a' },
    { vest: 0x8a4fc0, color: '#c58cff' }, { vest: 0x2fa0a0, color: '#5fe8e0' }, { vest: 0xc06a2a, color: '#ffab5c' }, { vest: 0x9a9aa0, color: '#e0e0e8' }
  ];

  // Free geometries/materials of a removed object tree (textures are shared,
  // except ones flagged userData.own).
  function disposeTree(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m) { if (m.map && m.map.userData.own) m.map.dispose(); m.dispose(); }
    });
  }
  const sfx = (name, opts) => { if (JB.Audio) JB.Audio.play(name, opts); };
  const ownTex = (cv) => { const t = new THREE.CanvasTexture(cv); t.userData.own = true; return t; };

  // ------------------------------------------------------------------ fighter
  // kind: 'player' (this browser), 'bot' (AI) or 'remote' (an online friend)
  class Fighter {
    constructor(game, cfg, kind) {
      this.g = game;
      this.name = cfg.name; this.fur = cfg.fur; this.color = cfg.color; this.voice = cfg.voice || 1;
      this.furLabel = (JB.Cat.FURS[cfg.fur] || JB.Cat.FURS.ginger).label;
      this.isPlayer = kind === 'player'; this.remote = kind === 'remote';
      this.netId = cfg.netId || null;
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      this.body = { pos: this.pos, vel: this.vel, r: 0.34, h: MV.C.STAND_H, onGround: true };
      this.yaw = 0; this.pitch = 0;
      this.eyeH = 1.58; this.crouching = false; this.crouchK = 0;
      this.hp = 100; this.armor = 0; this.helmet = false; this.alive = false; this.respawnT = 0; this.invuln = 0;
      this.kills = 0; this.deaths = 0; this.streak = 0; this.bestStreak = 0;
      this.weapons = {}; this.nades = { flash: 0, smoke: 0 };
      this.current = 'pistol'; this.prev = 'claws';
      this.cool = 0; this.reloadT = 0; this.switching = false; this.switchT = 0;
      this.fireInacc = 0; this.recoilIdx = 0; this.lastShot = -9; this.zoom = 0; this.velMod = 1; this.stamina = 0;
      this.fireLatch = false; this.altLatch = false; this.blindT = 0;
      this.readyAt = {};   // weapon -> game time it can fire again
      this.input = { mx: 0, mz: 0, fire: false, alt: false, jump: false, crouch: false, walk: false, reload: false, weapon: null, fwd: 0, side: 0 };
      this.cat = new JB.Cat({ fur: cfg.fur, vest: cfg.vest, name: cfg.name });
      this.cat.root.rotation.order = 'YXZ';
      game.R.scene.add(this.cat.root);
      this.cat.root.visible = !this.isPlayer;
      const F = JB.Cat.FURS[cfg.fur] || JB.Cat.FURS.ginger;
      this.furColor = new THREE.Color(F.base === 0xffffff ? 0xf2e6d8 : F.base);
      if (kind === 'bot') this.brain = new JB.Brain(game, this, cfg.p);
      this.resetWeapons();
    }
    resetWeapons() {
      const arsenal = (this.g.loadout || this.g.settings.loadout) === 'arsenal';
      for (const k of W.ORDER) {
        const d = DEFS[k];
        this.weapons[k] = { owned: k === 'claws' || k === 'pistol' || !!d.grenade || arsenal, mag: d.mag || 0, reserve: k === 'pistol' ? 24 : (arsenal ? (d.reserve || 0) : 0) };
      }
      this.nades.flash = arsenal ? 2 : 1;
      this.nades.smoke = 1;
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
    } else if (kind === 'nades') {
      ring = 0xc0c8ff;
      const a = W.buildModel('flash', probe, false), b = W.buildModel('smoke', probe, false);
      a.scale.setScalar(2.2); b.scale.setScalar(2.2);
      a.position.x = -0.1; b.position.x = 0.1;
      item.add(a, b);
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
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x2f5f9a, roughness: 0.5 }));
      helm.position.y = 0.5;
      item.add(vest, plate, s1, s2, helm);
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
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(ring).multiplyScalar(2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.02;
    const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
    const gc = glowCv.getContext('2d'); const gg = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, 'rgba(255,255,255,0.7)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); gc.fillStyle = gg; gc.fillRect(0, 0, 64, 64);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: ownTex(glowCv), color: ring, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03;
    g.add(ringM, disc);
    g.userData.item = item; g.userData.ring = ringM; g.userData.disc = disc;
    return g;
  }

  class Pickup {
    constructor(game, def, index, temp) {
      this.g = game; this.index = index;
      this.kind = ['health', 'armor', 'ammo', 'nades'].includes(def.t) ? def.t : 'weapon';
      this.type = def.t;
      const y = game.level.floorAt(def.x, def.z);
      this.pos = new THREE.Vector3(def.x, y === null ? 0 : y, def.z);
      // keep every pickup on walkable floor so cats can actually reach it
      if (!game.nav.isNode(game.nav.cellOf(def.x, def.z)) || y === null) {
        const c = game.nav.nearest(def.x, this.pos.y, def.z, 2.5);
        if (c >= 0) game.nav.pointOf(c, this.pos);
      }
      this.active = true; this.timer = 0; this.temp = !!temp; this.life = temp ? 20 : 0;
      this.respawn = { weapon: 16, health: 18, armor: 26, ammo: 12, nades: 20 }[this.kind];
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
    update(dt) {
      if (this.temp) { this.life -= dt; if (this.life <= 0) { this.remove(); return false; } }
      if (!this.active) {
        this.timer -= dt;
        if (this.timer <= 0 && !this.g.net) this.reappear();
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
    reappear() { this.active = true; this.mesh.visible = true; this.mesh.scale.setScalar(0.01); }
    take() {
      if (this.temp) { this.active = false; this.life = 0; this.remove(); return; }
      this.active = false; this.timer = this.respawn; this.mesh.visible = false;
    }
    remove() { this.g.R.scene.remove(this.mesh); this.dead = true; }
  }

  // ------------------------------------------------------------------ game
  class Game {
    constructor(canvas, settings, hud) {
      this.canvas = canvas; this.settings = settings; this.hud = hud;
      this.time = 0; this.state = 'menu'; this.paused = false;
      this.keys = {}; this.mouse = { fire: false, alt: false };
      this.look = { x: 0, y: 0 };
      this.shake = 0; this.punch = { x: 0, y: 0 }; this.eyeSmooth = 0; this.dip = 0; this.dipV = 0;
      this.damageK = 0; this.healK = 0;
      this.projectiles = []; this.nades = []; this.smokes = [];
      this.fighters = []; this.pickups = [];
      this.acc = 0;
      this.net = null; this.authority = true;
      this.moveEvents = [];
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
      if (JB.GrenadeFX && JB.GrenadeFX.FlashOverlay) this.flashFX = new JB.GrenadeFX.FlashOverlay(this.canvas);
      this.spawns = JB.MapData.spawns.map(([x, z, yaw]) => {
        const c = this.nav.nearest(x, this.level.floorAt(x, z) || 0, z, 3);
        const p = this.nav.pointOf(c, new THREE.Vector3());
        return { pos: p, yaw };
      });
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
    clearMatch() {
      for (const f of this.fighters) { this.R.scene.remove(f.cat.root); disposeTree(f.cat.root); }
      for (const p of this.pickups) { this.R.scene.remove(p.mesh); disposeTree(p.mesh); }
      for (const pr of this.projectiles) this.R.scene.remove(pr.mesh);
      for (const n of this.nades) this.R.scene.remove(n.mesh);
      for (const s of this.smokes) s.dispose();
      this.fighters = []; this.pickups = []; this.projectiles = []; this.nades = []; this.smokes = [];
      if (this.flashFX) this.flashFX.reset();
      this.pendingFlash = null;
    }

    // Shared setup for both modes. `opts.online` = the Online controller.
    startMatch(opts) {
      opts = opts || {};
      this.clearMatch();
      const s = this.settings;
      this.net = opts.online || null;
      this.authority = !this.net || this.net.isHost;
      this.mode = this.net ? 'online' : 'bots';
      this.loadout = opts.loadout || s.loadout;   // online: the host's choice, for this match only
      const me = this.net ? this.net.myInfo() : { name: (s.name || 'Jimbog').slice(0, 16), fur: s.fur, vest: 0x3f8f4f, color: '#7dff8a', voice: 1.05 };
      this.player = new Fighter(this, me, 'player');
      this.fighters.push(this.player);
      if (!this.net) {
        const furs = [s.fur];
        const bots = ROSTER.map((r) => {
          const c = Object.assign({}, r);
          if (furs.includes(c.fur)) c.fur = SPARE_FURS.find((f) => !furs.includes(f) && !ROSTER.some((o) => o.fur === f)) || 'tabby';
          furs.push(c.fur);
          return c;
        });
        for (const b of bots.slice(0, s.bots)) this.fighters.push(new Fighter(this, b, 'bot'));
      }
      JB.MapData.pickups.forEach((p, i) => {
        const it = new Pickup(this, p, i);
        if (it.kind === 'weapon' && this.loadout === 'arsenal') { this.R.scene.remove(it.mesh); disposeTree(it.mesh); return; }
        this.pickups.push(it);
      });
      if (this.vm) { this.R.vmCamera.remove(this.vm.root); disposeTree(this.vm.root); }
      this.vm = new W.ViewModel(this.R, this.player.fur);
      this.vm.setWeapon('pistol', true);
      this.time = 0;
      this.matchTime = (opts.matchTime !== undefined ? opts.matchTime : s.time * 60);
      this.fragLimit = opts.frags || s.frags;
      this.ended = false;
      this.punch.x = this.punch.y = 0;
      if (!this.net) {
        const used = [];
        for (const f of this.fighters) this.respawn(f, used);
      } else if (this.net.isHost) {
        this.respawn(this.player);
      } else {
        this.player.alive = false; this.player.respawnT = 0; this.awaitSpawn = true;
        this.net.requestRespawn();
      }
      this.state = opts.skipCountdown ? 'play' : 'countdown'; this.countT = 3.2; this.lastCount = 4;
      this.hud.show(true);
      this.hud.scoreboard(false);
      this.hud.death(false);
      if (JB.Audio) JB.Audio.startAmbience();
    }

    // Add an online friend's cat.
    addRemote(info) {
      const f = new Fighter(this, info, 'remote');
      f.alive = false;
      f.cat.root.visible = false;
      this.fighters.push(f);
      return f;
    }
    removeFighter(f) {
      const i = this.fighters.indexOf(f);
      if (i >= 0) this.fighters.splice(i, 1);
      this.R.scene.remove(f.cat.root); disposeTree(f.cat.root);
    }

    // Pick the safest spawn point (far from and out of sight of enemies).
    chooseSpawn(f, used) {
      const enemies = this.fighters.filter((e) => e !== f && e.alive);
      let best = null, bestS = -Infinity;
      for (const sp of this.spawns) {
        if (used && used.includes(sp)) continue;
        let minD = 80, seen = false;
        for (const e of enemies) {
          const d = e.pos.distanceTo(sp.pos);
          minD = Math.min(minD, d);
          if (d < 40 && this.world.clear(e.pos.x, e.pos.y + 1.5, e.pos.z, sp.pos.x, sp.pos.y + 1.4, sp.pos.z)) seen = true;
        }
        const s = minD - (seen ? 25 : 0) + Math.random() * 12;
        if (s > bestS) { bestS = s; best = sp; }
      }
      if (used) used.push(best);
      return best;
    }
    respawn(f, used) {
      const sp = this.chooseSpawn(f, used);
      if (this.net && f.remote) { this.net.sendSpawn(f, sp); return; }
      this.placeAt(f, sp.pos, sp.yaw);
      if (this.net && f.isPlayer) this.net.announceSpawn(f);
    }
    // Put a fighter into the world fresh (all modes).
    placeAt(f, pos, yaw) {
      f.pos.copy(pos); f.vel.set(0, 0, 0);
      f.yaw = yaw; f.pitch = 0;
      f.hp = 100; f.armor = 0; f.helmet = false; f.alive = true; f.invuln = 1.5;
      f.crouching = false; f.body.h = MV.C.STAND_H; f.crouchK = 0; f.eyeH = 1.58; f.body.onGround = true;
      f.reloadT = 0; f.switching = false; f.cool = 0.3; f.streak = 0; f.velMod = 1; f.stamina = 0;
      f.fireInacc = 0; f.recoilIdx = 0; f.zoom = 0; f.blindT = 0; f.nadeHold = null; f.afterNade = null; f.readyAt = {};
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
        this.awaitSpawn = false;
        this.punch.x = this.punch.y = 0;
        this.zoomK = 1;
        if (this.touch) { this.touch.cycle = false; this.touch.reload = false; }
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
        if (e.code === 'Tab') e.preventDefault();
        if (!this.locked()) return;
        const p = this.player;
        if (!p || !p.alive) return;
        const m = /^Digit([1-9])$/.exec(e.code);
        if (m) { const k = W.ORDER[+m[1] - 1]; if (k && p.weapons[k].owned) p.input.weapon = k; }
        if (e.code === 'KeyG') p.input.weapon = p.current === 'flash' ? 'smoke' : (p.nades.flash > 0 ? 'flash' : 'smoke');
        if (e.code === 'KeyQ') p.input.weapon = p.prev;
        if (e.code === 'KeyV' || e.code === 'KeyF') p.input.weapon = p.current === 'claws' ? p.prev : 'claws';
        if (e.code === 'KeyR') p.input.reload = true;
      });
      addEventListener('keyup', (e) => { keys[e.code] = false; });
      addEventListener('blur', () => { for (const k in keys) keys[k] = false; this.mouse.fire = false; this.mouse.alt = false; });
      this.canvas.addEventListener('mousedown', (e) => {
        if (!this.locked()) return;
        if (e.button === 0) this.mouse.fire = true;
        if (e.button === 2) this.mouse.alt = true;
      });
      addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.fire = false;
        if (e.button === 2) this.mouse.alt = false;
      });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      addEventListener('mousemove', (e) => {
        if (!this.locked()) return;
        this.look.x += e.movementX || 0; this.look.y += e.movementY || 0;
      });
      addEventListener('wheel', (e) => {
        if (!this.locked() || !this.player || !this.player.alive) return;
        this.player.input.weapon = this.nextWeapon(this.player, e.deltaY > 0 ? 1 : -1);
      }, { passive: true });
    }
    nextWeapon(p, dir) {
      let i = W.ORDER.indexOf(p.input.weapon || p.current);
      const n = W.ORDER.length;
      for (let k = 0; k < n; k++) {
        i = (i + dir + n) % n;
        const t = W.ORDER[i], w = p.weapons[t], d = DEFS[t];
        if (!w.owned) continue;
        if (d.grenade ? p.nades[d.grenade] > 0 : (d.melee || w.mag + w.reserve > 0)) return t;
      }
      return p.current;
    }
    locked() { return document.pointerLockElement === this.canvas || this.touchMode; }

    playerInput() {
      const p = this.player, k = this.keys, inp = p.input;
      const S = this.settings;
      // CS zoom sensitivity: scale by the zoom factor
      const zoom = this.R.camera.userData.zoom || 1;
      const sens = 0.0018 * S.sens / zoom;
      p.yaw -= this.look.x * sens;
      p.pitch -= this.look.y * sens * (S.invert ? -1 : 1);
      p.pitch = U.clamp(p.pitch, -1.5, 1.5);
      this.lookFrame = { x: this.look.x, y: this.look.y };
      this.look.x = 0; this.look.y = 0;
      let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      let s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      if (this.touch) { f += this.touch.f; s += this.touch.s; }
      const L = Math.hypot(f, s);
      if (L > 1) { f /= L; s /= L; }
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      inp.mx = -sy * f + cy * s; inp.mz = -cy * f - sy * s;
      inp.fwd = f; inp.side = s;
      inp.jump = !!(k.Space || (this.touch && this.touch.jump));
      inp.crouch = !!(k.KeyC || (this.touch && this.touch.crouch));   // not Ctrl: Ctrl+W closes the tab
      inp.walk = !!(k.ShiftLeft || k.ShiftRight || (this.touch && this.touch.walk));
      inp.fire = this.mouse.fire || !!(this.touch && this.touch.fire);
      inp.alt = this.mouse.alt || !!(this.touch && this.touch.alt);
      if (this.touch && this.touch.reload) { inp.reload = true; this.touch.reload = false; }
      if (this.touch && this.touch.cycle) { this.touch.cycle = false; inp.weapon = this.nextWeapon(p, 1); }
    }

    // ---------------------------------------------------------- simulation
    stepFighter(f, dt) {
      const ev = this.moveEvents; ev.length = 0;
      MV.step(this, f, dt, ev);
      for (const e of ev) {
        if (e[0] === 'jump') sfx('jump', f.isPlayer ? { volume: 0.5 } : { pos: f.pos, volume: 0.5 });
        else if (e[0] === 'stepup') { if (f.isPlayer) this.eyeSmooth -= e[1]; }
        else if (e[0] === 'land') {
          const ls = e[1];
          if (ls > 3) {
            const surface = MV.surfaceAt(this.level, f.pos.x, f.pos.z);
            sfx('land', f.isPlayer ? { volume: U.clamp(ls / 10, 0.3, 1), surface } : { pos: f.pos, volume: 0.7, surface, occluded: !this.audibleLOS(f.pos) });
            if (f.isPlayer) this.dipV -= ls * 0.025;
            if (!f.isPlayer) this.noise(f.pos, f, false, 14);
          }
          const fd = MV.fallDamage(ls);
          if (fd > 0 && (f.isPlayer || f.brain)) this.reportHit(f, f, fd, 'fall', { group: 'chest', premult: true });
        } else if (e[0] === 'step') {
          const surface = MV.surfaceAt(this.level, f.pos.x, f.pos.z);
          if (e[1]) {
            sfx('footstep', f.isPlayer ? { volume: 0.55, surface } : { pos: f.pos, surface, occluded: !this.audibleLOS(f.pos) });
            this.noise(f.pos, f, false, 22);
            if (f.isPlayer) this.netEmit('step', { id: f.netId, s: surface });
          } else if (f.isPlayer) sfx('walk_step', { volume: 0.35, surface });
        }
      }
      if (f.pos.y < -14 && this.time - (f.voidT || -9) > 0.5) { f.voidT = this.time; this.reportHit(f, f, 999, 'fall', { group: 'chest', premult: true }); }
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
            if (f.remote) return;
            const nxp = f.pos.x + sx, nzp = f.pos.z + sz;
            if (this.world.fits(nxp, f.pos.y, nzp, f.body.r, f.body.h)) { f.pos.x = nxp; f.pos.z = nzp; }
          };
          tryMove(a, -nx * push, -nz * push); tryMove(b, nx * push, nz * push);
        }
      }
    }

    // Authoritative kill (offline / host): scoring, then presentation.
    kill(v, killer, weapon, head) {
      v.deaths++;
      if (killer && killer !== v) { killer.kills++; killer.streak++; killer.bestStreak = Math.max(killer.bestStreak, killer.streak); }
      else v.kills = Math.max(0, v.kills - 1);
      // drop the weapon they were holding (offline only)
      if (!this.net && !['pistol', 'claws'].includes(v.current) && !DEFS[v.current].grenade && v.weapons[v.current].mag + v.weapons[v.current].reserve > 0) {
        const it = new Pickup(this, { t: v.current, x: v.pos.x, z: v.pos.z }, -1, true);
        it.ammo = { mag: v.weapons[v.current].mag, reserve: v.weapons[v.current].reserve };
        this.pickups.push(it);
      }
      if (this.net) this.net.onKill(v, killer, weapon, head);
      this.killFX(v, killer, weapon, head);
      if (killer && killer.kills >= this.fragLimit) this.endMatch();
    }
    // What everybody sees when a cat goes down.
    killFX(v, killer, weapon, head) {
      v.alive = false; v.hp = 0;
      v.respawnT = 3.2;
      v.streak = 0;
      v.killer = killer; v.killWeapon = weapon;
      const dir = killer ? Math.sign(Math.cos(killer.yaw - v.yaw)) || 1 : 1;
      v.cat.die(-dir);
      v.cat.root.visible = true;
      sfx('death', { pos: v.pos, pitch: v.voice });
      this.fx.fur(new THREE.Vector3(v.pos.x, v.pos.y + 1.0, v.pos.z), v.furColor, 26, null);
      if (killer && killer !== v) {
        if (killer.isPlayer) {
          sfx('kill');
          this.hud.center(head ? 'HEADSHOT — ' + v.name : 'ELIMINATED ' + v.name, head ? 'gold' : '');
          const st = killer.streak;
          if (STREAKS[st]) setTimeout(() => this.hud.center(STREAKS[st], 'gold big'), 500);
        } else if (Math.random() < 0.7) setTimeout(() => sfx('meow', { pos: killer.pos, pitch: killer.voice }), 400);
      }
      this.hud.feed(killer, v, weapon, head, killer && killer.isPlayer, v.isPlayer);
      if (v.isPlayer) {
        this.vm.root.visible = false;
        this.deathCam = { t: 0, pos: v.pos.clone(), yaw: v.yaw };
        this.mouse.fire = false;
        v.zoom = 0;
      }
    }

    endMatch(rows) {
      if (this.ended) return;
      this.ended = true;
      this.state = 'end';
      this.endT = 0;
      sfx('match_end');
      if (this.net && this.net.isHost) this.net.onEnd();
      rows = rows || this.fighters.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const win = rows[0];
      this.result = { winner: win, rows, playerWon: win === this.player, online: !!this.net, host: this.net ? this.net.isHost : false };
      if (this.onEnd) setTimeout(() => this.onEnd(this.result), 1600);
    }

    // ---------------------------------------------------------------- pickups
    updatePickups(dt) {
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const it = this.pickups[i];
        if (!it.update(dt)) { this.pickups.splice(i, 1); continue; }
        if (!it.active) continue;
        for (const f of this.fighters) {
          if (!f.alive || f.remote) continue;
          const dx = f.pos.x - it.pos.x, dz = f.pos.z - it.pos.z, dy = f.pos.y - it.pos.y;
          if (dx * dx + dz * dz > 1.0 || Math.abs(dy) > 1.3) continue;
          if (!this.canUse(f, it)) continue;
          if (this.net) {
            if (f.isPlayer && this.time - (it.askedT || -9) > 0.6) { it.askedT = this.time; this.net.requestPickup(it); }
          } else { this.grab(f, it); it.take(); }
          break;
        }
      }
    }
    canUse(f, it) {
      if (it.kind === 'health') return f.hp < 100;
      if (it.kind === 'armor') return f.armor < 100 || !f.helmet;
      if (it.kind === 'nades') return f.nades.flash < DEFS.flash.max || f.nades.smoke < DEFS.smoke.max;
      if (it.kind === 'ammo') return W.GUNS.some((k) => f.weapons[k].owned && f.weapons[k].reserve < DEFS[k].maxReserve);
      const w = f.weapons[it.type];
      return !w.owned || w.reserve < DEFS[it.type].maxReserve;
    }
    // Apply a pickup's effect to a fighter (health/armour are host-owned online).
    grab(f, it) {
      let msg = '';
      if (it.kind === 'health') {
        f.hp = Math.min(100, f.hp + 35); msg = 'Fish Snack  +35 health';
        sfx('pickup_health', f.isPlayer ? {} : { pos: f.pos });
        if (f.isPlayer) this.healK = 0.8;
      } else if (it.kind === 'armor') {
        f.armor = Math.min(100, f.armor + 50); f.helmet = true; msg = 'Body Armour + Helmet';
        sfx('pickup_armor', f.isPlayer ? {} : { pos: f.pos });
      } else if (it.kind === 'nades') {
        f.nades.flash = Math.min(DEFS.flash.max, f.nades.flash + 1);
        f.nades.smoke = Math.min(DEFS.smoke.max, f.nades.smoke + 1);
        msg = 'Flashbang + Smoke';
        sfx('pickup_ammo', f.isPlayer ? {} : { pos: f.pos });
      } else if (it.kind === 'ammo') {
        for (const k of W.GUNS) {
          const d = DEFS[k], w = f.weapons[k];
          if (w.owned && w.reserve < d.maxReserve) w.reserve = Math.min(d.maxReserve, w.reserve + Math.max(1, Math.round(d.mag * (k === 'pistol' ? 1 : 0.75))));
        }
        msg = 'Ammo';
        sfx('pickup_ammo', f.isPlayer ? {} : { pos: f.pos });
      } else {
        const d = DEFS[it.type], w = f.weapons[it.type];
        const extra = it.ammo ? it.ammo.mag + it.ammo.reserve : d.mag * 2;
        if (w.owned) {
          w.reserve = Math.min(d.maxReserve, w.reserve + Math.max(d.mag, Math.round(extra * 0.6)));
          msg = d.name + ' ammo';
        } else {
          w.owned = true; w.mag = it.ammo ? Math.min(d.mag, it.ammo.mag) : d.mag;
          w.reserve = it.ammo ? Math.min(d.maxReserve, it.ammo.reserve) : d.mag;
          msg = d.name;
          if (f.isPlayer && W.GUNS.indexOf(it.type) > W.GUNS.indexOf(f.current) && !f.input.fire) f.input.weapon = it.type;
        }
        sfx('pickup_weapon', f.isPlayer ? {} : { pos: f.pos });
      }
      if (f.isPlayer) this.hud.pickup(msg);
    }

    netEmit(type, data) { if (this.net) this.net.local(type, data); }

    // ---------------------------------------------------------------- frame
    frame(dt) {
      dt = Math.min(dt, 0.05);
      if (this.net) this.net.update(dt);
      if (this.paused && this.player && this.player.nadeHold) { this.player.nadeHold = null; if (this.vm) this.vm.nadeState = 'idle'; }
      if (this.paused && !this.net) { this.render(0); return; }
      if (this.state === 'menu' || this.state === 'lobby') { this.menuCamera(dt); this.render(dt); return; }
      this.time += dt;
      if (this.state === 'countdown') {
        this.countT -= dt;
        const n = Math.ceil(this.countT);
        if (n !== this.lastCount && n > 0) { this.lastCount = n; this.hud.center(String(n), 'big'); sfx('countdown'); }
        if (this.countT <= 0) { this.state = 'play'; this.hud.center('FIGHT!', 'big gold'); sfx('go'); }
      }
      const live = this.state === 'play';
      if (live && this.authority) {
        this.matchTime -= dt;
        if (this.matchTime <= 0) { this.matchTime = 0; this.endMatch(); }
      }
      // input + AI (a paused online player keeps standing in the world)
      if (this.player.alive && !this.paused) this.playerInput();
      else {
        this.look.x = 0; this.look.y = 0; this.lookFrame = { x: 0, y: 0 };
        if (this.paused) { const i = this.player.input; i.mx = i.mz = 0; i.fire = i.alt = i.jump = false; }
      }
      for (const f of this.fighters) {
        if (f.brain && f.alive && live) f.brain.update(dt);
        if (!live || !f.alive) { f.input.mx = 0; f.input.mz = 0; f.input.fire = false; f.input.alt = false; f.input.jump = false; }
      }
      // fixed-step physics (local fighters only; remote cats are interpolated)
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIX_DT && steps < 8) {
        for (const f of this.fighters) if (f.alive && !f.remote) this.stepFighter(f, FIX_DT);
        this.acc -= FIX_DT; steps++;
      }
      if (steps >= 8) this.acc = 0;
      this.separate();
      for (const f of this.fighters) {
        if (f.remote) continue;
        if (f.alive) {
          f.invuln = Math.max(0, f.invuln - dt);
          f.blindT = Math.max(0, (f.blindT || 0) - dt);
          if (live) this.updateWeapon(f, dt);
          if (f.afterNade) {
            f.afterNade.t -= dt;
            if (f.afterNade.t <= 0) {
              const k = f.afterNade.kind; f.afterNade = null;
              if (f.current === k && f.nades[k] > 0) { if (f.isPlayer) this.vm.setWeapon(k, false); }
              else if (f.current === k) this.switchTo(f, f.prev && !DEFS[f.prev].grenade ? f.prev : 'pistol');
            }
          }
        } else if (live || this.state === 'end') {
          f.respawnT -= dt;
          if (f.respawnT <= 0 && this.state === 'play') {
            const wants = !f.isPlayer || this.mouse.fire || f.respawnT < -2.5 || (this.touch && this.touch.fire);
            if (wants) {
              this.mouse.fire = false;
              if (!this.net) this.respawn(f);
              else if (f.isPlayer && !this.awaitSpawn) { this.awaitSpawn = true; this.net.requestRespawn(); }
            }
          }
        }
      }
      this.updateProjectiles(dt);
      this.updateNades(dt);
      this.updateSmokes(dt);
      this.updatePickups(dt);
      for (const fan of this.fans) fan.rotation.y += dt * 9;
      this.animateCats(dt);
      this.updateCamera(dt);
      this.updateHUD(dt);
      this.render(dt);
    }

    animateCats(dt) {
      const col = new THREE.Color();
      const L = this.level;
      for (const f of this.fighters) {
        if (!f.cat.root.visible) continue;
        const c = f.cat;
        c.root.position.copy(f.pos);
        if (f.alive) c.root.rotation.y = f.yaw + Math.PI;
        const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
        const fwd = -(f.vel.x * sy + f.vel.z * cy), side = f.vel.x * cy - f.vel.z * sy;
        c.update(dt, { speed: Math.hypot(f.vel.x, f.vel.z), fwd, side, onGround: f.body.onGround, crouch: f.crouching, aimPitch: f.pitch, sprint: false });
        L.sampleLight(f.pos.x, f.pos.y, f.pos.z, col);
        const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
        c.setLight(col, U.clamp(lum * 1.6 + 0.1, 0.12, 1.1));
        c.setShadow(L.inSun(f.pos.x, f.pos.y + 0.2, f.pos.z) || L.inSun(f.pos.x, f.pos.y + 1.0, f.pos.z) || L.inSun(f.pos.x, f.pos.y + 1.7, f.pos.z));
        c.probe.flash.value.setRGB(f.invuln > 0 ? 0.15 + Math.sin(this.time * 20) * 0.1 : 0, f.invuln > 0 ? 0.3 : 0, f.invuln > 0 ? 0.4 : 0);
        if (!f.alive && f.respawnT < 0.6 && !f.isPlayer && !f.remote) c.root.visible = f.respawnT > 0 ? (Math.floor(f.respawnT * 20) % 2 === 0) : false;
      }
    }

    updateCamera(dt) {
      const p = this.player, cam = this.R.camera, S = this.settings;
      this.dipV += (-this.dip * 120 - this.dipV * 14) * dt; this.dip += this.dipV * dt;
      this.eyeSmooth = U.damp(this.eyeSmooth, 0, 14, dt);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.damageK = Math.max(0, this.damageK - dt * 0.9);
      this.healK = Math.max(0, this.healK - dt * 1.2);
      const sh = this.shake * this.shake;
      if (p.alive) {
        const def = DEFS[p.current];
        // CS view punch: the screen shows half the spray offset and settles back
        const off = def.pattern ? JB.Combat.patternAt(def, p.recoilIdx) : [0, 0];
        const tx = off[0] * 0.5, ty = off[1] * 0.5;
        this.punch.x = U.damp(this.punch.x, tx, 22, dt);
        this.punch.y = U.damp(this.punch.y, ty, 22, dt);
        cam.position.set(p.pos.x, p.pos.y + p.eyeH + this.eyeSmooth + this.dip, p.pos.z);
        cam.rotation.set(p.pitch + this.punch.y * DEG + (Math.random() - 0.5) * sh * 0.04, p.yaw - this.punch.x * DEG + (Math.random() - 0.5) * sh * 0.04, 0, 'YXZ');
        const zoom = def.zooms ? def.zooms[p.zoom || 0] : 1;
        this.zoomK = U.damp(this.zoomK || 1, zoom, 30, dt);
        const fov = S.fov / this.zoomK;
        if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
        cam.userData.zoom = zoom;
        const lf = this.lookFrame || { x: 0, y: 0 };
        this.vm.update(dt, { speed: Math.hypot(p.vel.x, p.vel.z), onGround: p.body.onGround, scoped: (p.zoom || 0) > 0, lookX: lf.x, lookY: lf.y });
        const col = new THREE.Color();
        this.level.sampleLight(p.pos.x, p.pos.y, p.pos.z, col);
        const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
        this.vm.setLight(col.multiplyScalar(1.1), U.clamp(lum * 1.5 + 0.15, 0.2, 1.1));
        this.R.vmHemi.intensity = 0.25 + lum * 0.4;
        this.R.vmKey.intensity = this.level.inSun(p.pos.x, p.pos.y + 1.5, p.pos.z) ? 1.6 : 0.35 + lum * 0.4;
      } else if (this.deathCam) {
        const dc = this.deathCam;
        dc.t += dt;
        const k = p.killer && p.killer !== p && p.killer.alive ? p.killer : null;
        const target = new THREE.Vector3(dc.pos.x, dc.pos.y + 0.6, dc.pos.z);
        const ang = dc.yaw + dc.t * 0.35;
        const want = new THREE.Vector3(dc.pos.x + Math.sin(ang) * 3.2, dc.pos.y + 2.4, dc.pos.z + Math.cos(ang) * 3.2);
        const hit = this.world.raycast(target.x, target.y, target.z, want.x - target.x, want.y - target.y, want.z - target.z, 1, 3);
        if (hit) want.lerpVectors(target, want, Math.max(0.1, hit.t - 0.15));
        cam.position.lerp(want, 1 - Math.exp(-dt * 4));
        const look = k && dc.t > 1.2 ? new THREE.Vector3(k.pos.x, k.pos.y + 1.2, k.pos.z) : target;
        const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
        cam.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), 1 - Math.exp(-dt * 3));
        if (Math.abs(cam.fov - S.fov) > 0.01) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
        cam.userData.zoom = 1;
      } else if (this.awaitSpawn) {
        this.menuCamera(dt);
      }
      if (this.R.finalPass) {
        this.R.finalPass.uniforms.uDamage.value = this.damageK + (p.alive ? U.clamp((35 - p.hp) / 35, 0, 1) * 0.35 : 0.6);
        this.R.finalPass.uniforms.uHeal.value = this.healK;
        this.R.finalPass.uniforms.uSat.value = p.alive ? 1.08 : 0.25;
      }
      if (this.flashFX) this.flashFX.update(dt);
      if (JB.Audio) {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        JB.Audio.setListener(cam.position, dir);
        if (JB.Audio.setRoom) {
          const reg = this.level.regionAt(cam.position.x, cam.position.z);
          const room = reg ? U.clamp((reg.ceil - reg.floor) / 10, 0, 1) * 0.6 + (reg.rects ? 0.2 : 0) : 0.3;
          if (Math.abs(room - (this.roomK || 0)) > 0.05) { this.roomK = room; JB.Audio.setRoom(room); }
        }
      }
    }

    updateHUD(dt) {
      const h = this.hud, p = this.player;
      h.update(dt);
      const def = DEFS[p.current], w = p.weapons[p.current];
      h.vitals(p.hp, p.armor, p.helmet);
      const owned = {};
      for (const k of W.ORDER) owned[k] = DEFS[k].grenade ? p.nades[DEFS[k].grenade] : p.weapons[k].owned;
      const rk = p.reloadT > 0 && !def.shellReload ? 1 - p.reloadT / def.reload : 0;
      h.weapon(p.current, def.grenade ? p.nades[def.grenade] : w.mag, def.grenade ? -1 : w.reserve, owned, rk);
      // crosshair gap from the current inaccuracy (none for an unscoped sniper, like the AWP)
      const inacc = this.inaccuracy(p);
      const px = Math.tan(inacc) / Math.tan(this.R.camera.fov * Math.PI / 360) * innerHeight / 2;
      const scoped = def.scope && (p.zoom || 0) > 0;
      h.crosshair(3 + px, p.alive && this.state !== 'end' && !def.scope, p.alive && scoped);
      // smoke you're standing in greys the screen
      h.smoke(p.alive ? this.smokeAt(this.R.camera.position) : 0, this.smokeTint);
      // timer + standing
      const rows = this.fighters.slice().sort((a, b) => b.kills - a.kills);
      const rank = rows.indexOf(p) + 1;
      const ord = ['1st', '2nd', '3rd'][rank - 1] || rank + 'th';
      const leader = rows[0] === p ? (rows[1] ? rows[1] : null) : rows[0];
      h.timer(this.matchTime, ord + '  ·  ' + p.kills + ' / ' + this.fragLimit + (leader ? '   (' + (rows[0] === p ? 'next ' : 'leader ') + leader.name + ' ' + leader.kills + ')' : ''));
      if (p.alive) {
        const reg = this.level.regionAt(p.pos.x, p.pos.z);
        if (reg && reg.name) h.area(reg.name);
        h.hint(p.invuln > 0 && this.state === 'play' ? 'Spawn protection' : (def.grenade ? 'Left-click throw · Right-click lob · both = medium' : (w.mag === 0 && w.reserve === 0 && !def.melee ? 'Out of ammo — find a pickup or switch weapon' : (w.mag === 0 && !def.melee ? 'Press R to reload' : ''))));
      } else if (this.state !== 'end') {
        const k = p.killer;
        let kt = k && k !== p ? 'Scratched out by <b style="color:' + k.color + '">' + k.name.replace(/</g, '&lt;') + '</b> — ' + (DEFS[p.killWeapon] ? DEFS[p.killWeapon].name : 'a fall') : 'You coughed up a hairball';
        if (this.awaitSpawn && !p.killer) kt = 'Joining the match…';
        const ct = this.awaitSpawn ? 'Waiting for a spawn…' : (p.respawnT > 0 ? 'Respawning in ' + Math.ceil(p.respawnT) : (this.touchMode ? 'Tap FIRE to respawn' : 'Click to respawn'));
        h.death(true, kt, ct);
        h.hint('');
      } else h.death(false);
      h.scoreboard(!!this.keys.Tab && (this.state === 'play' || this.state === 'countdown'), this.fighters, this.net ? 'ONLINE · ' + this.fighters.length + ' cats' : null);
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
      if (this.headless) { this.pendingFlash = null; return; }   // background tab: simulate only
      this.R.update(dt, performance.now() / 1000);
      if (this.shafts) this.shafts.userData.shaft.uniforms.uTime.value = performance.now() / 1000;
      this.fx.update(dt, this.R.camera);
      this.R.render();
      // a flashbang went off: freeze this frame as the after-image, then white out
      if (this.pendingFlash) {
        const pf = this.pendingFlash; this.pendingFlash = null;
        if (this.flashFX) { try { this.flashFX.capture(); } catch (e) { /* ignore */ } this.flashFX.flash(U.clamp(pf.strength, 0, 1), pf.dur); }
      }
      this.frames = (this.frames || 0) + 1;
      if (this.R.composer && this.frames <= 90 && this.frames % 15 === 0) this.R.selfCheck();
    }
  }

  Object.assign(Game.prototype, JB.Combat);
  Game.NET_COLORS = NET_COLORS;
  JB.Game = Game;
  JB.Fighter = Fighter;
})();
