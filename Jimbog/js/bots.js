// Jimbog — AI cats. Each bot perceives (sight + hearing), picks a goal
// (fight, chase, grab items, hunt), navigates with A*, and aims with a
// human-ish reaction time and tracking error that depend on difficulty.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  const SKILL = {
    easy:   { react: 0.7, err0: 0.11, err1: 0.045, track: 1.6, turn: 3.2, tap: 0.3, view: 38, fov: 1.0, strafe: 0.5, jump: 0.0, comp: 0.2, burst: 12, runGun: true, sneak: false, nades: 0.15 },
    normal: { react: 0.4, err0: 0.075, err1: 0.022, track: 2.6, turn: 5.5, tap: 0.14, view: 60, fov: 1.15, strafe: 0.8, jump: 0.05, comp: 0.55, burst: 8, runGun: false, sneak: true, nades: 0.4 },
    hard:   { react: 0.24, err0: 0.05, err1: 0.009, track: 4.0, turn: 9, tap: 0.06, view: 90, fov: 1.3, strafe: 1.0, jump: 0.12, comp: 0.85, burst: 10, runGun: false, sneak: true, nades: 0.7 }
  };

  class Brain {
    constructor(game, me, personality) {
      this.g = game; this.me = me;
      this.p = personality;       // { aggro, accuracy, fav }
      this.S = SKILL[game.settings.difficulty] || SKILL.normal;
      this.path = null; this.pi = 0; this.goal = null; this.goalKind = '';
      this.repathT = 0; this.thinkT = Math.random() * 0.2; this.senseT = 0;
      this.target = null; this.seenT = 0; this.visible = false;
      this.lastSeen = new THREE.Vector3(); this.lastSeenT = -99;
      this.heard = null; this.heardT = -99;
      this.memory = new Map();      // fighter -> { pos, t } last seen / heard
      this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
      this.aimYaw = me.yaw; this.aimPitch = 0;
      this.err = new THREE.Vector2(); this.errT = 0;
      this.fireHold = 0; this.nextShot = 0;
      this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.progressT = 0;
      this.huntT = 6 + Math.random() * 6;
      this.crouchT = 0;
      this.wantJump = false;
      this._v = new THREE.Vector3();
    }

    // Called by the game when a gunshot / explosion is heard.
    hear(pos, who, loud) {
      if (who === this.me || !this.me.alive) return;
      const d = pos.distanceTo(this.me.pos);
      if (d > (loud ? 55 : 32)) return;
      if (!this.visible || who === this.target) { this.heard = pos.clone(); this.heardT = this.g.time; this.heardWho = who; }
      if (who) this.memory.set(who, { pos: pos.clone(), t: this.g.time });
    }
    damagedBy(who) {
      if (!who || who === this.me) return;
      this.lastAttacker = who; this.lastAttackT = this.g.time;
      if (!this.visible) {
        this.heard = who.pos.clone(); this.heardT = this.g.time; this.heardWho = who;
        if (this.goalKind !== 'noise' && this.goalKind !== 'chase') { this.path = null; this.goal = null; }
      }
      // turn toward the threat
      this.alarm = 0.5;
    }

    reset() {
      this.path = null; this.goal = null; this.target = null; this.visible = false; this.heard = null;
      this.lastSeenT = -99; this.huntT = 4 + Math.random() * 6;
      this.memory.clear();
    }

    // --------------------------------------------------------------- senses
    _sense() {
      const me = this.me, g = this.g, S = this.S;
      const eye = this._v.set(me.pos.x, me.pos.y + me.eyeH, me.pos.z);
      let best = null, bestScore = -Infinity;
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      for (const e of g.fighters) {
        if (e === me || !e.alive) continue;
        const dx = e.pos.x - me.pos.x, dy = e.pos.y - me.pos.y, dz = e.pos.z - me.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > S.view) continue;
        const cos = (dx * fx + dz * fz) / (Math.hypot(dx, dz) + 1e-6);
        const ang = Math.acos(U.clamp(cos, -1, 1));
        const recentlyHurt = this.lastAttacker === e && g.time - this.lastAttackT < 2.5;
        if (ang > S.fov && d > 4 && !recentlyHurt) continue;
        // line of sight to head or chest
        const hy = e.pos.y + 1.45 - (e.crouchK || 0) * 0.4, cy = e.pos.y + 1.0 - (e.crouchK || 0) * 0.3;
        const see = g.losClear(eye.x, eye.y, eye.z, e.pos.x, hy, e.pos.z) || g.losClear(eye.x, eye.y, eye.z, e.pos.x, cy, e.pos.z);
        if (!see) continue;
        let score = -d - ang * 6 + (recentlyHurt ? 25 : 0) + (e === this.target ? 12 : 0) + (100 - e.hp) * 0.08;
        if (e.isPlayer) score += this.p.grudge || 0;
        if (score > bestScore) { bestScore = score; best = e; }
      }
      const wasVisible = this.visible;
      if (best) {
        if (best !== this.target || !wasVisible) {
          // fresh sighting: reaction delay + big initial error
          this.seenT = 0;
          this.reactLeft = S.react * (0.75 + Math.random() * 0.5) * (this.alarm ? 0.6 : 1);
          this.err.set((Math.random() - 0.5) * 2, (Math.random() - 0.5)).multiplyScalar(S.err0 * 3);
        }
        this.target = best; this.visible = true;
        this.lastSeen.copy(best.pos); this.lastSeenT = g.time;
        this.memory.set(best, { pos: best.pos.clone(), t: g.time });
      } else {
        this.visible = false;
        if (this.target && !this.target.alive) this.target = null;
      }
      this.alarm = 0;
    }

    // ----------------------------------------------------------- goal choice
    _chooseGoal() {
      const me = this.me, g = this.g;
      const t = g.time;
      // 1) chase a target we just lost
      if (this.target && this.target.alive && t - this.lastSeenT < 6) return this._setGoal(this.lastSeen, 'chase');
      // 2) investigate noise
      if (this.heard && t - this.heardT < 7) {
        const h = this.heard; this.heard = null;
        return this._setGoal(h, 'noise');
      }
      // 3) items when weak / under-armed
      const needHealth = me.hp < 55, needWeapon = this._bestTier() < 2, needArmor = me.armor < 25;
      const armed = !needWeapon && me.hp > 60;
      let bestItem = null, bestD = Infinity;
      for (const it of g.pickups) {
        if (!it.active) continue;
        let want = 0;
        if (it.kind === 'health' && needHealth) want = me.hp < 35 ? 3 : 2;
        else if (it.kind === 'armor' && needArmor) want = 1.4;
        else if (it.kind === 'weapon' && !me.weapons[it.type].owned) want = needWeapon ? 2.5 : (it.type === this.p.fav ? 1.6 : 0.8);
        else if (it.kind === 'ammo' && this._lowAmmo()) want = 1.2;
        if (!want) continue;
        const raw = it.pos.distanceTo(me.pos);
        if (armed && raw > 22 && it.kind !== 'health') continue;   // armed cats would rather hunt
        const d = raw / want;
        if (d < bestD && d < 70) { bestD = d; bestItem = it; }
      }
      if (bestItem) return this._setGoal(bestItem.pos, 'item');
      // 4) hunt: head for where someone probably is
      this.huntT -= 1;
      if (this.huntT <= 0 || Math.random() < 0.45 + 0.4 * this.p.aggro) {
        this.huntT = 5 + Math.random() * 8;
        // somewhere a cat was last seen or heard, else a rough guess at the
        // area a cat is in (a hunch, not a wallhack: ±12 m)
        const mem = this.memory;
        let p = null;
        for (const [e, m] of mem) {
          if (!e.alive || t - m.t > 20 || e.pos.distanceTo(m.pos) > 30) { mem.delete(e); continue; }
          if (!p || Math.random() < 0.5) p = m.pos.clone();
        }
        if (!p) {
          const others = g.fighters.filter((e) => e !== me && e.alive);
          if (others.length) {
            const e = others[Math.floor(Math.random() * others.length)];
            const c = g.nav.nearest(e.pos.x + (Math.random() - 0.5) * 24, e.pos.y, e.pos.z + (Math.random() - 0.5) * 24, 8);
            if (c >= 0) p = g.nav.pointOf(c, new THREE.Vector3());
          }
        }
        if (p) return this._setGoal(p, 'hunt');
      }
      // 5) wander somewhere far-ish
      const c = g.nav.randomNode();
      return this._setGoal(g.nav.pointOf(c, new THREE.Vector3()), 'wander');
    }
    _setGoal(p, kind) {
      this.goal = p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
      this.goalKind = kind;
      this.path = this.g.nav.route(this.me.pos, this.goal);
      this.pi = this.path && this.path.length > 1 ? 1 : 0;
      this.repathT = 3 + Math.random() * 2;
      if (!this.path) { this.goal = null; }
    }
    _bestTier() {
      const w = this.me.weapons;
      let t = 0;
      for (const k of ['smg', 'shotgun', 'rifle', 'sniper', 'launcher']) if (w[k].owned && (w[k].mag + w[k].reserve) > 0) t = Math.max(t, 2);
      return t || 1;
    }
    _lowAmmo() {
      const w = this.me.weapons;
      for (const k of ['smg', 'shotgun', 'rifle', 'sniper', 'launcher']) if (w[k].owned && w[k].mag + w[k].reserve < JB.Weapons.DEFS[k].mag) return true;
      return false;
    }

    // Pick the best owned weapon for a given distance.
    _pickWeapon(d) {
      const me = this.me, D = JB.Weapons.DEFS;
      let best = 'claws', bestS = -1;
      for (const k of JB.Weapons.ORDER) {
        const w = me.weapons[k];
        if (!w.owned || D[k].grenade) continue;
        const def = D[k];
        if (!def.melee && w.mag + w.reserve <= 0) continue;
        const b = def.bot;
        let s = { claws: 1, pistol: 3, smg: 5, shotgun: 6, rifle: 7, sniper: 6, launcher: 6.5 }[k];
        if (d > b.max) s -= 5; if (d < b.min) s -= 4;
        s -= Math.abs(d - b.pref) * 0.08;
        if (k === this.p.fav) s += 1.2;
        if (k === 'launcher' && d < 5) s -= 6;   // don't blow yourself up
        if (s > bestS) { bestS = s; best = k; }
      }
      return best;
    }

    // ---------------------------------------------------------------- update
    // Fills me.input = { move:{x,z} world dir, sprint, jump, crouch, fire, ads, reload, weapon }
    update(dt) {
      const me = this.me, g = this.g, S = this.S, inp = me.input;
      inp.mx = 0; inp.mz = 0; inp.fire = false; inp.alt = false; inp.jump = false; inp.walk = false; inp.reload = false; inp.crouch = false;
      if (!me.alive) return;
      // flashed: blind, stumbling, maybe spraying where the enemy last was
      if (me.blindT > 0) {
        this.visible = false;
        this.blindDir = this.blindDir || (Math.random() < 0.5 ? -1 : 1);
        const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
        inp.mx = cy * this.blindDir * 0.8 + sy * 0.4; inp.mz = -sy * this.blindDir * 0.8 + cy * 0.4;
        if (Math.random() < dt * 1.5) this.blindDir *= -1;
        const def0 = JB.Weapons.DEFS[me.current];
        if (g.time - this.lastSeenT < 1.5 && !def0.melee && Math.random() < 0.4) inp.fire = true;
        return;
      }
      this.blindDir = 0;
      this.senseT -= dt;
      if (this.senseT <= 0) { this._sense(); this.senseT = 0.12 + Math.random() * 0.06; }
      this._grenades(dt);
      if (this.target && !this.target.alive) { this.target = null; this.visible = false; }

      const tgt = this.visible ? this.target : null;
      let distT = tgt ? tgt.pos.distanceTo(me.pos) : 0;

      // weapon selection
      const want = tgt ? this._pickWeapon(distT) : this._pickWeapon(15);
      if (want !== me.current && !me.switching) inp.weapon = want;
      const def = JB.Weapons.DEFS[me.current];
      const ws = me.weapons[me.current];

      // ---------------- aim
      let desiredYaw = this.aimYaw, desiredPitch = 0;
      if (tgt) {
        this.seenT += dt;
        this.reactLeft = (this.reactLeft || 0) - dt;
        // tracking error decays the longer we track
        const k = Math.exp(-this.seenT * S.track);
        const errMag = U.lerp(S.err1, S.err0, k) / (this.p.accuracy || 1);
        this.errT -= dt;
        if (this.errT <= 0) {
          this.errT = 0.25 + Math.random() * 0.3;
          this.errTarget = new THREE.Vector2((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2).multiplyScalar(errMag);
        }
        this.err.x = U.damp(this.err.x, this.errTarget ? this.errTarget.x : 0, 6, dt);
        this.err.y = U.damp(this.err.y, this.errTarget ? this.errTarget.y : 0, 6, dt);
        // lead moving targets a little (projectiles more)
        const lead = def.projectile ? distT / def.projSpeed : 0.05;
        const tx = tgt.pos.x + tgt.vel.x * lead, tz = tgt.pos.z + tgt.vel.z * lead;
        const headBias = S === SKILL.hard ? 0.5 : 0.25;
        const ty = tgt.pos.y + (def.projectile ? 0.4 : U.lerp(1.05, 1.45, headBias)) - (tgt.crouchK || 0) * 0.35;
        const ex = me.pos.x, ey = me.pos.y + me.eyeH, ez = me.pos.z;
        const dx = tx - ex, dy = ty - ey, dz = tz - ez;
        desiredYaw = Math.atan2(-dx, -dz) + this.err.x;
        let pitch = Math.atan2(dy, Math.hypot(dx, dz));
        if (def.projectile) pitch += Math.min(0.5, distT * distT * 0.5 * 9.8 / (def.projSpeed * def.projSpeed) / Math.max(1, distT));
        desiredPitch = pitch + this.err.y;
        // pull against the spray pattern (better bots control it better)
        if (def.pattern) {
          const off = g.recoilOffset(me), comp = S.comp;
          desiredPitch -= off[1] * comp * Math.PI / 180;
          desiredYaw += off[0] * comp * Math.PI / 180;
        }
      } else if (this.path && this.pi < this.path.length) {
        const wp = this.path[this.pi];
        desiredYaw = Math.atan2(-(wp.x - me.pos.x), -(wp.z - me.pos.z));
        desiredPitch = 0;
      } else if (this.heard && g.time - this.heardT < 3) {
        desiredYaw = Math.atan2(-(this.heard.x - me.pos.x), -(this.heard.z - me.pos.z));
      }
      const turn = S.turn * (tgt ? 1 : 0.7);
      const dyaw = U.angDiff(this.aimYaw, desiredYaw);
      this.aimYaw += U.clamp(dyaw, -turn * dt, turn * dt) * (Math.abs(dyaw) < 0.3 ? 0.6 + 0.4 : 1);
      this.aimPitch += U.clamp(desiredPitch - this.aimPitch, -turn * dt, turn * dt);
      me.yaw = this.aimYaw; me.pitch = U.clamp(this.aimPitch, -1.3, 1.3);

      // ---------------- shooting
      // CS habit: accurate guns are fired standing still (counter-strafe, then shoot)
      const runGun = def.melee || def.pellets || me.current === 'smg' || me.current === 'launcher';
      const speedNow = Math.hypot(me.vel.x, me.vel.z);
      const steady = runGun || speedNow < JB.Movement.maxSpeed(me) * 0.36 || S.runGun;
      if (def.scope) { const wantZoom = tgt && distT > 10 ? 1 : 0; if ((me.zoom || 0) !== wantZoom && !me.rescopeT) g.setZoom(me, wantZoom); }
      if (tgt && this.reactLeft <= 0 && !me.switching) {
        const aimErr = Math.abs(U.angDiff(this.aimYaw, desiredYaw - this.err.x));
        const tol = def.melee ? 0.6 : Math.max(0.05, Math.atan2(0.45, distT) + (def.pellets ? def.spread : 0));
        const inRange = def.melee ? distT < def.range + 0.3 : distT < (def.bot ? def.bot.max * 1.3 : 50);
        this.wantShoot = aimErr < tol * 2.5 && inRange;
        if (aimErr < tol && inRange && steady) {
          if (def.auto) { if (g.time >= this.nextShot) { inp.fire = true; if (me.recoilIdx > S.burst) this.nextShot = g.time + 0.25 + Math.random() * 0.3; } }
          else if (g.time >= this.nextShot) { inp.fire = true; this.nextShot = g.time + def.rate + S.tap * (0.6 + Math.random() * 0.8); }
        }
      } else this.wantShoot = false;
      if (!def.melee && ws.mag === 0 && ws.reserve > 0) inp.reload = true;
      if (!tgt && !def.melee && ws.mag < def.mag * 0.5 && ws.reserve > 0) inp.reload = true;

      // ---------------- movement
      this.thinkT -= dt; this.repathT -= dt;
      if (tgt) {
        // combat movement: strafe + keep preferred range
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          // alternate strafing with planting your feet to shoot
          this.planted = !this.planted && !runGun;
          this.strafeT = this.planted ? 0.35 + Math.random() * 0.45 : 0.35 + Math.random() * 0.7;
          if (Math.random() < 0.6) this.strafeDir *= -1;
          this.crouchT = this.planted && Math.random() < 0.15 ? 0.6 : 0;
        }
        const pref = def.bot ? def.bot.pref * (1.15 - this.p.aggro * 0.3) : 10;
        const dx = tgt.pos.x - me.pos.x, dz = tgt.pos.z - me.pos.z, L = Math.hypot(dx, dz) || 1;
        const fwdX = dx / L, fwdZ = dz / L;
        let approach = distT > pref * 1.25 ? 1 : (distT < pref * 0.6 ? -0.8 : 0);
        if (def.melee) approach = 1;
        let mx = fwdX * approach + -fwdZ * this.strafeDir * S.strafe;
        let mz = fwdZ * approach + fwdX * this.strafeDir * S.strafe;
        // don't strafe off ledges / into walls
        const probe = g.nav.cellOf(me.pos.x + mx * 1.0, me.pos.z + mz * 1.0, me.pos.y);
        if (!g.nav.isNode(probe) || Math.abs(g.level.grid.floorH[probe] - me.pos.y) > 0.6) { this.strafeDir *= -1; mx = fwdX * approach; mz = fwdZ * approach; }
        if (approach > 0 && distT > 3) {
          // close in along the nav path rather than straight through walls
          if (!this.path || this.repathT <= 0 || this.goalKind !== 'engage') { this._setGoal(tgt.pos, 'engage'); this.repathT = 1.0; }
          const w = this._follow();
          if (w) { mx = w.x * 0.8 + mx * 0.4; mz = w.z * 0.8 + mz * 0.4; }
        }
        if (this.planted && this.wantShoot) { mx = 0; mz = 0; }
        inp.mx = mx; inp.mz = mz;
        inp.crouch = this.crouchT > 0 && !def.melee;
        this.crouchT -= dt;
        if (Math.random() < S.jump * dt * 3) inp.jump = true;
      } else {
        if (!this.goal || !this.path || this.pi >= this.path.length || this.repathT <= 0 && this.goalKind === 'chase') this._chooseGoal();
        const w = this._follow();
        if (w) {
          inp.mx = w.x; inp.mz = w.z;
          // sneak (silent walk) when closing in on a sound, like a CS player
          inp.walk = S.sneak && (this.goalKind === 'noise' || this.goalKind === 'chase') && this.goal && this.goal.distanceTo(me.pos) < 14;
        }
        else this.goal = null;
      }
      // stuck detection
      this.progressT += dt;
      if (this.progressT > 1.2) {
        const moved = this._v.copy(me.pos).sub(this.lastPos).length();
        if (moved < 0.35 && (inp.mx || inp.mz)) {
          this.stuckT++;
          inp.jump = true;
          if (this.stuckT > 1) { this.goal = null; this.path = null; this.stuckT = 0; }
        } else this.stuckT = 0;
        this.lastPos.copy(me.pos); this.progressT = 0;
      }
    }

    // Flash a corner before pushing a lost target; smoke off a long-range threat.
    _grenades(dt) {
      const me = this.me, g = this.g, S = this.S;
      this.nadeCool = (this.nadeCool || 3) - dt;
      if (this.nadeCool > 0 || me.switching) return;
      const t = g.time;
      if (me.nades.flash > 0 && this.target && this.target.alive && !this.visible && t - this.lastSeenT > 0.6 && t - this.lastSeenT < 4) {
        const d = this.lastSeen.distanceTo(me.pos);
        if (d > 6 && d < 26 && Math.random() < S.nades) {
          const aimAt = this.lastSeen.clone(); aimAt.y += 1.6;
          if (g.botThrow(me, 'flash', aimAt)) { this.nadeCool = 8 + Math.random() * 6; return; }
        }
        this.nadeCool = 2;
      }
      if (me.nades.smoke > 0 && me.hp < 55 && this.lastAttacker && t - (this.lastAttackT || -9) < 1 && this.lastAttacker.alive) {
        const a = this.lastAttacker.pos, d = a.distanceTo(me.pos);
        if (d > 12 && Math.random() < S.nades) {
          const mid = me.pos.clone().lerp(a, Math.min(0.5, 7 / d)); mid.y = me.pos.y;
          if (g.botThrow(me, 'smoke', mid)) { this.nadeCool = 10; this.heard = null; this.goal = null; return; }
        }
        this.nadeCool = 2;
      }
    }

    // Steering toward the next waypoint. Returns a world-space direction.
    _follow() {
      if (!this.path || this.pi >= this.path.length) return null;
      const me = this.me;
      let wp = this.path[this.pi];
      let dx = wp.x - me.pos.x, dz = wp.z - me.pos.z;
      let d = Math.hypot(dx, dz);
      while (d < 0.55 && this.pi < this.path.length - 1) {
        this.pi++;
        wp = this.path[this.pi]; dx = wp.x - me.pos.x; dz = wp.z - me.pos.z; d = Math.hypot(dx, dz);
      }
      if (d < 0.55 && this.pi >= this.path.length - 1) { this.pi = this.path.length; return null; }
      return { x: dx / d, z: dz / d };
    }
  }

  JB.Brain = Brain;
  JB.Brain.SKILL = SKILL;
})();
