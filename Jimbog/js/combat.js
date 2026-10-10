// Jimbog — combat: Counter-Strike style shooting (inaccuracy + spray
// patterns), the CS damage model (hit groups, armour penetration, helmet),
// claws, hairball launcher, and smoke / flash grenades.
//
// Everything here is mixed into JB.Game.prototype. In online games the
// shooter's own client does hit detection and reports hits to the host,
// which owns health, armour and kills (see online.js); `this.authority` is
// true offline and on the host.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;
  const W = JB.Weapons, DEFS = W.DEFS;
  const DEG = Math.PI / 180;
  const sfx = (name, opts) => { if (JB.Audio) JB.Audio.play(name, opts); };

  const NADE_GRAVITY = 0.4 * 800 * 0.0254;   // CS grenades fall at 0.4x gravity
  const NADE_SPEED = 675 * 0.0254;           // 17.1 m/s full overhand throw

  // Pattern offset (degrees) at a fractional burst index.
  function patternAt(def, idx) {
    const p = def.pattern;
    if (!p || !p.length) return [0, 0];
    const i = Math.min(p.length - 1, Math.max(0, idx));
    const a = Math.floor(i), b = Math.min(p.length - 1, a + 1), t = i - a;
    return [p[a][0] + (p[b][0] - p[a][0]) * t, p[a][1] + (p[b][1] - p[a][1]) * t];
  }

  const Combat = {
    // ------------------------------------------------------------ handling
    inaccuracy(f) {
      const def = DEFS[f.current];
      if (def.melee || def.grenade) return 0;
      const scoped = def.scope && f.zoom > 0;
      let base = f.crouching ? (scoped ? def.scopedCrouch : def.crouch) : (scoped ? def.scopedStand : def.stand);
      const hs = Math.hypot(f.vel.x, f.vel.z), max = def.speed;
      const mv = U.clamp((hs - 0.34 * max) / (0.66 * max), 0, 1);
      let a = (def.spread || 0) + (base || 0) + def.move * mv + (f.fireInacc || 0);
      if (!f.body.onGround) a += def.jump;
      return a;
    },
    recoilOffset(f) { return patternAt(DEFS[f.current], f.recoilIdx || 0); },

    updateWeapon(f, dt) {
      const inp = f.input;
      f.cool -= dt;
      const def0 = DEFS[f.current];
      // recoil + fire inaccuracy recover between bursts
      if (def0.recover) f.fireInacc = (f.fireInacc || 0) * Math.exp(-dt / def0.recover);
      if (def0.pattern && this.time - (f.lastShot || -9) > (def0.rate || 0.1) * 1.3) f.recoilIdx = Math.max(0, (f.recoilIdx || 0) - dt * def0.recoverRate);
      if (f.switching) { f.switchT -= dt; if (f.switchT <= 0) f.switching = false; }
      if (inp.weapon) { this.switchTo(f, inp.weapon); inp.weapon = null; }
      const def = DEFS[f.current], w = f.weapons[f.current];
      // sniper: re-scope after the bolt is worked
      if (f.rescopeT > 0) { f.rescopeT -= dt; if (f.rescopeT <= 0 && f.current === 'sniper' && f.reloadT <= 0) this.setZoom(f, f.rescopeTo); }
      if (f.reloadT > 0) {
        f.reloadT -= dt;
        if (f.reloadT <= 0) {
          if (def.shellReload) {
            if (w.reserve > 0 && w.mag < def.mag) { w.mag++; w.reserve--; sfx('shell', f.isPlayer ? {} : { pos: f.pos }); }
            if (w.mag < def.mag && w.reserve > 0 && !(inp.fire && !f.fireLatch)) { f.reloadT = def.reload; if (f.isPlayer) this.vm.reload(def.reload); }
          } else {
            const n = Math.min(def.mag - w.mag, w.reserve);
            w.mag += n; w.reserve -= n;
          }
        }
      }
      if (inp.reload) { this.startReload(f); inp.reload = false; }
      // grenades: hold to pull the pin, release to throw (LMB far, RMB lob, both medium)
      if (def.grenade) {
        const held = inp.fire || inp.alt;
        if (held && !f.nadeHold && !f.switching && f.cool <= 0 && (f.nades[def.grenade] || 0) > 0) {
          f.nadeHold = { kind: def.grenade, lmb: false, rmb: false };
          sfx('grenade_pin', f.isPlayer ? {} : { pos: f.pos, volume: 0.6 });
          if (f.isPlayer) this.vm.pullPin();
        }
        if (f.nadeHold) {
          f.nadeHold.lmb = f.nadeHold.lmb || inp.fire; f.nadeHold.rmb = f.nadeHold.rmb || inp.alt;
          if (!held) {
            const h = f.nadeHold;
            const strength = h.lmb && h.rmb ? 0.6 : (h.rmb ? 0.3 : 1);
            f.nadeHold = null;
            this.throwGrenade(f, h.kind, strength);
          }
        }
        f.fireLatch = inp.fire; f.altLatch = inp.alt;
        return;
      }
      if (inp.fire && (def.auto || !f.fireLatch)) this.tryFire(f, false);
      // secondary: sniper zoom levels, claws stab
      if (inp.alt && !f.altLatch) {
        if (def.scope && !f.switching && f.reloadT <= 0) { this.setZoom(f, ((f.zoom || 0) + 1) % def.zooms.length); f.rescopeT = 0; }
        else if (def.melee) this.tryFire(f, true);
      }
      f.fireLatch = inp.fire; f.altLatch = inp.alt;
    },

    setZoom(f, z) {
      if ((f.zoom || 0) === z) return;
      f.zoom = z;
      if (f.isPlayer) sfx(z > 0 ? 'scope_in' : 'scope_out', { volume: 0.7 });
    },

    switchTo(f, type) {
      const w = f.weapons[type];
      if (!w || !w.owned || type === f.current) return;
      const def = DEFS[type];
      if (def.grenade && !(f.nades[def.grenade] > 0)) return;
      f.prev = DEFS[f.current].grenade ? f.prev : f.current;
      f.current = type;
      f.switching = true; f.switchT = def.deploy || 0.5; f.reloadT = 0; f.cool = 0;
      f.zoom = 0; f.rescopeT = 0; f.nadeHold = null; f.recoilIdx = 0;
      f.cat.setWeapon(type);
      if (f.isPlayer) { this.vm.setWeapon(type); sfx('deploy', { volume: 0.7 }); }
      this.netEmit('weapon', { id: f.netId, w: type });
    },

    startReload(f) {
      const def = DEFS[f.current], w = f.weapons[f.current];
      if (def.melee || def.grenade || f.reloadT > 0 || w.mag >= def.mag || w.reserve <= 0 || f.switching) return;
      f.reloadT = def.reload;
      f.zoom = 0; f.rescopeT = 0;
      if (f.isPlayer) { this.vm.reload(def.reload); if (!def.shellReload) sfx('reload', { volume: 0.9 }); }
      else if (!def.shellReload) sfx('reload', { pos: f.pos, volume: 0.6 });
    },

    eyeOf(f, out) { return out.set(f.pos.x, f.pos.y + f.eyeH, f.pos.z); },
    forwardOf(f, out) { return this.dirFrom(f.yaw, f.pitch, out); },
    dirFrom(yaw, pitch, out) {
      const cp = Math.cos(pitch);
      return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    },
    muzzleOf(f, out) {
      if (f.isPlayer && this.vm) {
        this.vm.muzzleView(out);
        out.applyQuaternion(this.R.camera.quaternion).add(this.R.camera.position);
        return out;
      }
      if (f.cat.gun) { f.cat.gun.updateWorldMatrix(true, false); return f.cat.gun.localToWorld(out.copy(f.cat.gun.userData.muzzle)); }
      return this.eyeOf(f, out);
    },

    // ------------------------------------------------------------ shooting
    tryFire(f, secondary) {
      const def = DEFS[f.current], w = f.weapons[f.current];
      if (f.cool > 0 || f.switching || !f.alive || def.grenade) return;
      if ((f.readyAt[f.current] || 0) > this.time) return;   // this gun's own fire rate
      if (f.reloadT > 0) {
        if (def.shellReload && w.mag > 0) f.reloadT = 0; else return;
      }
      if (def.melee) return this.melee(f, secondary);
      if (w.mag <= 0) {
        f.cool = 0.25;
        sfx('dryfire', f.isPlayer ? {} : { pos: f.pos, volume: 0.6 });
        if (w.reserve > 0) this.startReload(f);
        else if (f.isPlayer) {
          for (const k of W.ORDER.slice().reverse()) { const ww = f.weapons[k]; if (ww.owned && !DEFS[k].grenade && (DEFS[k].melee || ww.mag + ww.reserve > 0)) { f.input.weapon = k; break; } }
        }
        return;
      }
      w.mag--;
      f.cool = def.rate;
      f.readyAt[f.current] = this.time + def.rate;
      // spray pattern + inaccuracy cone
      const off = patternAt(def, f.recoilIdx || 0);
      const inacc = this.inaccuracy(f);
      f.recoilIdx = (f.recoilIdx || 0) + 1;
      f.fireInacc = (f.fireInacc || 0) + def.fire;
      f.lastShot = this.time;
      const eye = this.eyeOf(f, new THREE.Vector3());
      const aim = this.dirFrom(f.yaw - off[0] * DEG, f.pitch + off[1] * DEG, new THREE.Vector3());
      const muzzle = this.muzzleOf(f, new THREE.Vector3());
      sfx(def.sound, f.isPlayer ? {} : { pos: muzzle, occluded: !this.audibleLOS(muzzle) });
      this.noise(eye, f, true);
      this.R.flash(muzzle, 0xffb35c, def.slot === 6 ? 7 : 4.5, 7, 0.06);
      f.cat.fire();
      if (f.isPlayer) {
        this.vm.fire(def);
        this.shake = Math.max(this.shake, def.slot === 6 || def.pellets ? 0.25 : 0.06);
      }
      // the AWP-style sniper drops out of scope after each shot
      if (def.scope && f.zoom > 0) { f.rescopeTo = f.zoom; f.zoom = 0; f.rescopeT = def.rate * 0.9; }
      if (def.projectile) { this.launch(f, aim, inacc); return; }
      this.fireBullets(f, def, eye, aim, inacc, muzzle);
    },

    fireBullets(f, def, eye, aim, inacc, muzzle) {
      const n = def.pellets || 1;
      const dir = new THREE.Vector3();
      const perVictim = new Map();
      const tracers = [];
      for (let i = 0; i < n; i++) {
        W.spreadDir(aim, inacc, dir);
        const r = W.trace(this.world, this.fighters, f, eye, dir, def.range);
        const pt = new THREE.Vector3(r.x, r.y, r.z);
        if (i < 3) { this.fx.tracer(muzzle, pt, f.isPlayer ? 0xffe0a8 : 0xffc890, def.slot === 6 ? 0.045 : 0.022); tracers.push([+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2)]); }
        if (r.cat) {
          const group = r.head ? 'head' : this.hitGroup(r.cat, r.y);
          const dmg = def.damage * Math.pow(def.rangeMod || 1, r.t / 12.7);
          const e = perVictim.get(r.cat) || { dmg: 0, head: false, group, point: pt, dir: dir.clone() };
          e.dmg += dmg * this.groupMult(group); e.head = e.head || r.head;
          if (r.head) e.group = 'head';
          perVictim.set(r.cat, e);
        } else if (r.wall) {
          this.impactFX(r.wall, pt, i === 0);
        }
        if (!f.isPlayer && this.player && this.player.alive && r.cat !== this.player) this.whiz(eye, dir, r.t);
      }
      let anyHit = false, headHit = false, killed = false;
      for (const [victim, e] of perVictim) {
        const res = this.reportHit(f, victim, e.dmg, f.current, { group: e.group, head: e.head, dir: e.dir, point: e.point, premult: true });
        if (res === null) continue;
        anyHit = true; headHit = headHit || e.head; killed = killed || res === 'kill';
      }
      if (f.isPlayer && anyHit) this.hud.hitmarker(headHit, killed);
      this.netEmit('fire', { id: f.netId, w: f.current, m: [+muzzle.x.toFixed(2), +muzzle.y.toFixed(2), +muzzle.z.toFixed(2)], t: tracers });
    },

    impactFX(hit, pt, withSound) {
      const reg = this.level.regionAt(hit.x - (hit.nx || 0) * 0.1, hit.z - (hit.nz || 0) * 0.1, hit.y - 0.3);
      const metal = reg && /metal|diamond|grate/.test(reg.wmat + reg.fmat);
      this.fx.impact(hit, metal ? 'metal' : 'concrete');
      if (withSound) sfx(Math.random() < 0.12 ? 'ricochet' : 'impact', { pos: pt, volume: 0.6 });
    },

    // CS hit groups from where on the body the bullet landed
    hitGroup(v, y) {
      const h = v.crouching ? 1.15 : 1.72, rel = (y - v.pos.y) / h;
      if (rel < 0.45) return 'legs';
      if (rel < 0.62) return 'stomach';
      return 'chest';
    },
    groupMult(g) { return g === 'head' ? 4 : g === 'stomach' ? 1.25 : g === 'legs' ? 0.75 : 1; },

    whiz(o, d, len) {
      const p = this.player;
      const hx = p.pos.x - o.x, hy = p.pos.y + p.eyeH - o.y, hz = p.pos.z - o.z;
      const t = hx * d.x + hy * d.y + hz * d.z;
      if (t < 2 || t > len) return;
      const cx = o.x + d.x * t - p.pos.x, cy = o.y + d.y * t - (p.pos.y + p.eyeH), cz = o.z + d.z * t - p.pos.z;
      if (cx * cx + cy * cy + cz * cz < 1.4 * 1.4 && Math.random() < 0.6) sfx('bullet_whiz', { pos: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), volume: 0.8 });
    },

    // Claws: slash (left) or stab (right); x2 from behind (stab from behind kills).
    melee(f, stab) {
      const def = DEFS.claws;
      f.cool = stab ? def.stabRate : def.rate;
      f.readyAt.claws = this.time + f.cool;
      sfx(stab ? 'knife_stab' : 'knife_slash', f.isPlayer ? {} : { pos: f.pos });
      if (f.isPlayer) this.vm.fire(def, { stab });
      f.cat.fire();
      const eye = this.eyeOf(f, new THREE.Vector3());
      const fwd = this.forwardOf(f, new THREE.Vector3());
      const range = stab ? def.stabRange : def.range;
      let best = null, bd = Infinity;
      for (const e of this.fighters) {
        if (e === f || !e.alive) continue;
        const c = new THREE.Vector3(e.pos.x, e.pos.y + 1.0 - e.crouchK * 0.35, e.pos.z);
        const to = c.clone().sub(eye);
        const d = to.length();
        if (d > range + 0.45) continue;
        if (to.normalize().dot(fwd) < 0.55) continue;
        if (!this.world.clear(eye.x, eye.y, eye.z, c.x, c.y, c.z)) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const behind = Math.cos(best.yaw - f.yaw) > 0.6;
        const dmg = stab ? (behind ? def.stabBack : def.stab) : (behind ? def.back : def.damage);
        const res = this.reportHit(f, best, dmg, 'claws', { dir: fwd, point: new THREE.Vector3(best.pos.x, best.pos.y + 1.1, best.pos.z), head: false, group: 'chest', premult: true });
        sfx('claw_hit', { pos: best.pos });
        if (f.isPlayer && res !== null) { this.hud.hitmarker(false, res === 'kill'); if (behind) this.hud.center(stab ? 'BACKSTAB!' : 'POUNCE!', 'gold'); }
      } else {
        // claws on a wall
        const hit = this.world.raycast(eye.x, eye.y, eye.z, fwd.x, fwd.y, fwd.z, range, 3);
        if (hit) { sfx('knife_hit_wall', { pos: new THREE.Vector3(hit.x, hit.y, hit.z), volume: 0.7 }); this.fx.sparks(hit, null, hit.nx, hit.ny, hit.nz, 4, false); }
      }
      this.netEmit('melee', { id: f.netId, s: stab ? 1 : 0 });
    },

    // ------------------------------------------------------------ hairballs
    launch(f, aim, inacc) {
      const def = DEFS.launcher;
      const dir = W.spreadDir(aim, inacc, new THREE.Vector3());
      const eye = this.eyeOf(f, new THREE.Vector3());
      const start = eye.clone().addScaledVector(dir, 0.4);
      if (!this.world.clear(eye.x, eye.y, eye.z, start.x, start.y, start.z, 0)) start.copy(eye);
      const vel = dir.multiplyScalar(def.projSpeed).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(f.vel, 0.3);
      this.spawnHairball(f, start, vel, true);
      this.netEmit('hairball', { id: f.netId, p: [start.x, start.y, start.z], v: [vel.x, vel.y, vel.z] });
    },
    spawnHairball(owner, start, vel, live) {
      if (!this.hairballMat) {
        const tx = JB.Tex.make('fur_ginger', 256);
        this.hairballMat = new THREE.MeshStandardMaterial({ color: 0xc08a50, map: tx.map, normalMap: tx.normalMap, roughness: 1 });
        this.hairballGeo = new THREE.IcosahedronGeometry(0.13, 2);
      }
      const mesh = new THREE.Mesh(this.hairballGeo, this.hairballMat);
      mesh.castShadow = true;
      mesh.position.copy(start);
      this.R.scene.add(mesh);
      // `live` = this client owns the damage for it
      this.projectiles.push({ mesh, owner, pos: mesh.position, vel: vel.clone(), r: 0.13, life: 2.4, age: 0, bounces: 0, live });
    },

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
          this.explode(pr.pos.clone(), pr.owner, pr.live);
          this.R.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
        }
      }
    },

    explode(p, owner, live) {
      const def = DEFS.launcher;
      this.fx.explosion(p);
      const down = this.world.raycast(p.x, p.y + 0.2, p.z, 0, -1, 0, 1.2, 3);
      if (down) this.fx.scorch(down, 1);
      this.R.flash(p, 0xff9a40, 14, 14, 0.35);
      sfx('explosion', { pos: p, volume: 1, occluded: !this.audibleLOS(p) });
      this.noise(p, owner, true);
      if (this.player) {
        const d = this.player.pos.distanceTo(p);
        this.shake = Math.max(this.shake, U.clamp(1.2 - d / 14, 0, 1) * 1.1);
      }
      if (!live) return;
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
        if (!e.remote && !this.net) { e.vel.addScaledVector(dir, 9 * k); e.vel.y += 4 * k; e.body.onGround = false; }
        this.reportHit(owner, e, dmg, 'launcher', { dir, point: c, group: 'chest', premult: true, push: [dir.x * 9 * k, dir.y * 9 * k + 4 * k, dir.z * 9 * k] });
      }
    },

    // ------------------------------------------------------------ grenades
    throwGrenade(f, kind, strength) {
      const def = DEFS[kind];
      if (!(f.nades[kind] > 0)) return;
      f.nades[kind]--;
      f.cool = 0.6;
      const eye = this.eyeOf(f, new THREE.Vector3());
      // CS raises the throw ~10 degrees above the crosshair
      const pitch = U.clamp(f.pitch + 10 * DEG * (1 - Math.abs(f.pitch) / (Math.PI / 2)), -1.5, 1.5);
      const dir = this.dirFrom(f.yaw, pitch, new THREE.Vector3());
      const speed = NADE_SPEED * (strength * 0.7 + 0.3);
      const start = eye.clone().addScaledVector(dir, 0.35);
      start.y -= strength < 0.5 ? 0.35 : 0.05;
      if (!this.world.clear(eye.x, eye.y, eye.z, start.x, start.y, start.z, 0)) start.copy(eye);
      const vel = dir.multiplyScalar(speed).addScaledVector(f.vel, 1.25);
      this.spawnNade(kind, start, vel, f);
      sfx('grenade_throw', f.isPlayer ? {} : { pos: f.pos, volume: 0.6 });
      if (f.isPlayer) this.vm.throwNade();
      f.cat.fire();
      this.netEmit('nade', { id: f.netId, k: kind, p: [start.x, start.y, start.z], v: [vel.x, vel.y, vel.z] });
      // after the throw: draw another of the same, or go back to the last weapon
      f.afterNade = { t: 0.45, kind };
      void def;
    },

    // Bots throw straight to a target with a ballistic arc.
    botThrow(f, kind, target) {
      if (!(f.nades[kind] > 0) || f.switching) return false;
      const eye = this.eyeOf(f, new THREE.Vector3());
      const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
      const dh = Math.hypot(dx, dz);
      const tFlight = U.clamp(dh / 12, 0.45, 1.6);
      const vel = new THREE.Vector3(dx / tFlight, (dy + 0.5 * NADE_GRAVITY * tFlight * tFlight) / tFlight, dz / tFlight);
      if (vel.length() > NADE_SPEED * 1.1) vel.multiplyScalar(NADE_SPEED * 1.1 / vel.length());
      f.nades[kind]--;
      // CS bots time their grenades: pop on arrival instead of rolling on
      const fuse = kind === 'flash' ? U.clamp(tFlight, 0.4, DEFS.flash.fuse) : tFlight + 0.1;
      this.spawnNade(kind, eye.clone().add(new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(0.3)), vel, f, fuse);
      sfx('grenade_throw', { pos: f.pos, volume: 0.6 });
      f.cat.fire();
      return true;
    },

    spawnNade(kind, start, vel, owner, fuse) {
      if (!this.nadeModels) this.nadeModels = {};
      const proto = this.nadeModels[kind] || (this.nadeModels[kind] = W.buildModel(kind, null, false));
      const mesh = proto.clone();
      mesh.scale.setScalar(1.2);
      mesh.position.copy(start);
      this.R.scene.add(mesh);
      this.nades.push({ kind, mesh, owner, pos: mesh.position, vel: vel.clone(), r: 0.05, t: 0, still: 0, bounces: 0, fuse: fuse || 0 });
    },

    updateNades(dt) {
      for (let i = this.nades.length - 1; i >= 0; i--) {
        const n = this.nades[i];
        n.t += dt;
        if (!n.rest) {
          n.vel.y -= NADE_GRAVITY * dt;
          const before = n.vel.length();
          const hit = this.world.bounce(n, dt, 0.45);
          if (hit) {
            n.bounces++;
            if (before > 1.5 && n.bounces < 12) sfx('grenade_bounce', { pos: n.pos, volume: U.clamp(before / 10, 0.2, 1), surface: JB.Movement.surfaceAt(this.level, n.pos.x, n.pos.z, n.pos.y) });
            // ground friction
            n.vel.x *= 0.8; n.vel.z *= 0.8;
            if (n.rest) n.vel.set(0, 0, 0);   // settled on the floor
          }
          n.mesh.rotation.x += dt * Math.min(20, n.vel.length() * 2); n.mesh.rotation.z += dt * 3;
        }
        const speed = n.vel.length();
        n.still = speed < 0.25 ? n.still + dt : 0;
        let boom = false;
        if (n.kind === 'flash') boom = n.t >= (n.fuse || DEFS.flash.fuse);
        else boom = (n.t > 1.2 && n.still > 0.25) || n.t >= (n.fuse || DEFS.smoke.fuse);
        if (boom) {
          if (n.kind === 'flash') this.detonateFlash(n.pos.clone(), n.owner);
          else this.detonateSmoke(n.pos.clone(), n.owner);
          this.R.scene.remove(n.mesh);
          this.nades.splice(i, 1);
        }
      }
    },

    detonateFlash(p, owner) {
      this.R.flash(p, 0xf4f8ff, 60, 30, 0.22);
      this.fx.sparks(p, null, 0, 1, 0, 14, false);
      sfx('flash_explode', { pos: p, volume: 1, occluded: !this.audibleLOS(p) });
      this.noise(p, owner, true);
      for (const f of this.fighters) {
        if (!f.alive || f.remote) continue;   // remote players work out their own flash
        if (f === owner && f.brain) continue;  // bots turn away from their own flash
        const eye = this.eyeOf(f, new THREE.Vector3());
        const d = eye.distanceTo(p);
        if (d > 42) continue;
        if (!this.world.clear(p.x, p.y + 0.05, p.z, eye.x, eye.y, eye.z)) continue;
        const to = p.clone().sub(eye).normalize();
        const dot = this.forwardOf(f, new THREE.Vector3()).dot(to);
        const ang = dot >= 0.5 ? 1 : (dot >= -0.3 ? 0.3 + 0.7 * (dot + 0.3) / 0.8 : 0.15);
        const distK = U.clamp(1 - (d - 4) / 32, 0.12, 1);
        const strength = ang * distK;
        const dur = 0.4 + 4.4 * strength;
        if (f.isPlayer) {
          this.pendingFlash = { strength, dur };
          if (JB.Audio) { JB.Audio.setDeafen && JB.Audio.setDeafen(U.clamp(strength, 0, 1), dur * 0.85); if (strength > 0.35) sfx('flash_ring', { duration: dur, volume: strength }); }
        } else if (f.brain && strength > 0.3) {
          f.blindT = Math.max(f.blindT || 0, dur * strength);
        }
      }
    },

    detonateSmoke(p, owner) {
      sfx('smoke_pop', { pos: p, volume: 0.9 });
      sfx('smoke_hiss', { pos: p, volume: 0.6 });
      void owner;
      if (!JB.GrenadeFX) return;
      // grey smoke lit by the room (the shader output is already display-
      // referred, so keep it mid-grey and under the bloom threshold)
      const tint = new THREE.Color();
      this.level.sampleLight(p.x, p.y + 0.5, p.z, tint);
      const L = (v) => U.clamp(0.62 * Math.pow(Math.max(0, v), 0.8), 0.06, 0.45);
      const lum = (tint.r + tint.g + tint.b) / 3;
      tint.setRGB(L(lum * 0.7 + tint.r * 0.3), L(lum * 0.7 + tint.g * 0.3), L(lum * 0.7 + tint.b * 0.3));
      const world = this.world;
      const clip = (from, to) => {
        const d = to.clone().sub(from); const L = d.length();
        if (L < 1e-4) return to.clone();
        d.divideScalar(L);
        const h = world.raycast(from.x, from.y, from.z, d.x, d.y, d.z, L, 3);
        return h ? from.clone().addScaledVector(d, Math.max(0, h.t - 0.3)) : to.clone();
      };
      const cloud = new JB.GrenadeFX.SmokeCloud(this.R.scene, { pos: p, radius: 3.6, height: 2.9, duration: 18, clip, tint, quality: this.settings.quality });
      this.smokes.push(cloud);
    },

    updateSmokes(dt) {
      for (let i = this.smokes.length - 1; i >= 0; i--) {
        const s = this.smokes[i];
        if (!s.update(dt, this.R.camera)) { s.dispose(); this.smokes.splice(i, 1); }
      }
    },
    smokeAt(p) {
      let d = 0;
      for (const s of this.smokes) {
        const k = s.density ? s.density(p) : 0;
        if (k > d) { d = k; this.smokeTint = s.tint; }
      }
      return d;
    },
    // Line of sight for AI: walls and smoke both block.
    losClear(ax, ay, az, bx, by, bz) {
      if (!this.world.clear(ax, ay, az, bx, by, bz)) return false;
      if (this.smokes.length) {
        const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
        for (const s of this.smokes) if (s.blocks && s.blocks(a, b)) return false;
      }
      return true;
    },
    // Is a sound source in direct line of the listener? (else it's muffled)
    audibleLOS(p) {
      const c = this.R.camera.position;
      return this.world.clear(c.x, c.y, c.z, p.x, p.y + 0.1, p.z);
    },

    noise(pos, who, loud, radius) {
      for (const f of this.fighters) if (f.brain) {
        if (radius && f.pos.distanceTo(pos) > radius) continue;
        f.brain.hear(pos, who, loud);
      }
    },

    // ------------------------------------------------------------ damage
    // A hit by `attacker` on `victim`. Online clients only report it.
    reportHit(attacker, victim, dmg, weapon, opts) {
      if (this.net && !this.authority) {
        if (attacker === this.player) {
          if (!victim.alive || victim.invuln > 0) return null;
          this.net.sendHit(victim, dmg, weapon, opts);
          if (opts.point) this.fx.fur(opts.point, victim.furColor, opts.head ? 14 : 8, opts.dir);
          if (victim !== this.player) sfx(opts.head ? (victim.armor > 0 && victim.helmet ? 'headshot_helmet' : 'headshot') : 'hitmarker', { volume: 0.7 });
          // the host decides; this guess only picks the kill-style hitmarker
          const group = opts.head ? 'head' : (opts.group || 'chest');
          const est = this.armorSplit(victim, opts.premult ? dmg : dmg * this.groupMult(group), weapon, group);
          return victim.hp - est.hp <= 0 ? 'kill' : 'pending';
        }
        return 'pending';
      }
      return this.applyDamage(victim, dmg, attacker, weapon, opts);
    },

    // CS armour: how much of `dmg` reaches health and how much armour it eats.
    armorSplit(v, dmg, weapon, group) {
      const def = DEFS[weapon] || {};
      const armored = v.armor > 0 && group !== 'legs' && (group !== 'head' || v.helmet) && weapon !== 'fall';
      if (!armored) return { hp: dmg, ar: 0, armored: false };
      const pen = def.armorPen !== undefined ? def.armorPen : (weapon === 'claws' ? 0.85 : 0.57);
      let hp = dmg * pen, ar = (dmg - hp) * 0.5;
      if (ar > v.armor) { hp = dmg - v.armor * 2; ar = v.armor; }
      return { hp: Math.max(0, hp), ar, armored: true };
    },

    // Authoritative damage (offline or on the host).
    applyDamage(v, amount, attacker, weapon, opts) {
      if (!v.alive || v.invuln > 0 || this.state !== 'play') return null;
      const def = DEFS[weapon] || {};
      const group = opts.head ? 'head' : (opts.group || 'chest');
      let dmg = Math.max(0, opts.premult ? amount : amount * this.groupMult(group));
      let dink = false;
      const split = this.armorSplit(v, dmg, weapon, group);
      if (split.armored) {
        v.armor = Math.max(0, v.armor - split.ar);
        if (v.armor <= 0) v.helmet = false;
        dmg = split.hp;
        dink = group === 'head';
      }
      v.hp -= dmg;
      if (def.tag) v.velMod = Math.min(v.velMod || 1, 1 - def.tag);
      this.hitFX(v, attacker, dmg, { head: group === 'head', dink, dir: opts.dir, point: opts.point });
      if (this.net) this.net.onDamage(v, attacker, dmg, weapon, { head: group === 'head', dink, point: opts.point, dir: opts.dir, push: opts.push });
      if (v.hp <= 0) { this.kill(v, attacker, weapon, group === 'head'); return 'kill'; }
      return 'hit';
    },

    // Presentation of a hit (runs on every client).
    hitFX(v, attacker, dmg, o) {
      v.cat.hit();
      v.lastHitBy = attacker; v.lastHitT = this.time;
      if (o.point && !(this.net && attacker === this.player && !this.authority)) this.fx.fur(o.point, v.furColor, o.head ? 14 : 8, o.dir);
      if (v.isPlayer) {
        this.damageK = Math.min(1.2, this.damageK + dmg / 45);
        sfx('hurt', { volume: 0.8, pitch: v.voice });
        if (o.head && o.dink) sfx('headshot_helmet', { volume: 0.9 });
        if (attacker && attacker !== v) {
          const dx = attacker.pos.x - v.pos.x, dz = attacker.pos.z - v.pos.z;
          this.hud.damageDir(-(Math.atan2(-dx, -dz) - v.yaw));
          // aim punch when shot (CS)
          this.punch.y += Math.min(2.5, dmg * 0.05);
        }
        this.shake = Math.max(this.shake, Math.min(0.5, dmg / 70));
      } else {
        sfx(o.head ? (o.dink ? 'headshot_helmet' : 'headshot') : (v.armor > 0 ? 'hit_armor' : 'hit'), { pos: v.pos, volume: 0.8 });
        if (Math.random() < 0.3) sfx('hurt', { pos: v.pos, volume: 0.7, pitch: v.voice });
        if (v.brain) v.brain.damagedBy(attacker);
      }
      if (attacker && attacker.isPlayer && attacker !== v && this.authority) sfx(o.head ? (o.dink ? 'headshot_helmet' : 'headshot') : 'hitmarker', { volume: 0.7 });
    }
  };

  JB.Combat = Combat;
  JB.Combat.patternAt = patternAt;
})();
