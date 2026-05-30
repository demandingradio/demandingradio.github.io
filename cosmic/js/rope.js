/*
 * ROPE — the grappling hook: fire, fly, attach, swing, reel, release.
 * ==================================================================
 * The heart of the game. Ported from shootRope() and the rope sections of
 * updateGame(): a raycast attach, a pendulum constraint that strips radial
 * velocity and adds a swing/boost force, and reel in/out.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  const rf = () => Math.random();

  ASCENT.Rope = {

    shoot(g, angle) {
      const r = g.rope;
      ASCENT.Save.stats.ropesShot++;
      r.shooting = true;
      r.shootDistance = 0;
      r.shootDX = Math.cos(angle);
      r.shootDY = Math.sin(angle);
      r.shootX = g.player.x;
      r.shootY = g.player.y;
      ASCENT.Audio.play('ropeShoot', 1.0);
    },

    // Bare detach (used by meteor/crumble cuts).
    detach(g) {
      const r = g.rope;
      r.active = false;
      r.attachedPlatform = null;
      r.attachOffsetX = 0;
      r.attachOffsetY = 0;
    },

    // Player-initiated release — keeps an extra jump for a grace window.
    release(g) {
      this.detach(g);
      g.player.hasDoubleJump = true;
      g.player.ropeGraceTimer = ASCENT.CONFIG.ROPE_GRACE_PERIOD;
      ASCENT.Audio.setTension(false, 0);
    },

    updateTimers(g, dt) {
      const r = g.rope, p = g.player;
      if (p.ropeGraceTimer > 0) p.ropeGraceTimer -= dt;
      if (r.cooldownTimer > 0) r.cooldownTimer -= dt;
      if (r.failedRopeTimer > 0) {
        r.failedRopeTimer -= dt;
        for (const s of r.failedRopeSegments) {
          s.vy += g.gravity * 2 * dt;
          s.y += s.vy * dt;
          s.x += s.vx * dt;
          s.vx *= 0.95;
        }
        if (r.failedRopeTimer <= 0) r.failedRopeSegments = [];
      }
    },

    // Projectile flight + attach/miss detection.
    updateProjectile(g, dt) {
      const r = g.rope, p = g.player;
      if (!r.shooting) return;
      r.shootDistance += r.shootSpeed * dt;
      r.shootX = p.x + r.shootDX * r.shootDistance;
      r.shootY = p.y + r.shootDY * r.shootDistance;

      if (r.shootDistance >= r.maxLength) {
        // miss
        ASCENT.Save.stats.ropesFailed++;
        ASCENT.Game.unlockAchievement('first_fail');
        r.failedRopeSegments = [];
        for (let i = 1; i <= 20; i++) {
          const f = i / 20;
          r.failedRopeSegments.push({
            x: p.x + r.shootDX * r.shootDistance * f,
            y: p.y + r.shootDY * r.shootDistance * f,
            vx: (rf() - 0.5) * 150, vy: -100 + rf() * 150,
          });
        }
        r.shooting = false;
        r.failedRopeTimer = r.failedRopeMaxTime;
        r.cooldownTimer = r.cooldownDuration;
        ASCENT.Audio.play('ropeSnap', 1.0);
        return;
      }

      // Raycast from player out to the current tip, stepping 5px.
      const step = 5;
      const steps = Math.floor(r.shootDistance / step);
      let bx = p.x, by = p.y;
      for (let s = 1; s <= steps; s++) {
        bx += r.shootDX * step;
        by += r.shootDY * step;
        for (const a of g.platforms) {
          if (a.type === 'crumbling' && a.crumbled) continue;
          if (a.type === 'disappearing' && !a.visible) continue;
          let dx = bx - a.x, dy = by - a.y;
          if (a.angle !== 0) {
            const c = Math.cos(-a.angle), si = Math.sin(-a.angle);
            const lx = dx * c - dy * si, ly = dx * si + dy * c;
            dx = lx; dy = ly;
          }
          if (Math.abs(dx) < a.width / 2 && Math.abs(dy) < a.height / 2) {
            r.x = bx; r.y = by; r.active = true; r.shooting = false;
            r.length = Math.sqrt((r.x - p.x) ** 2 + (r.y - p.y) ** 2);
            r.attachedPlatform = a;
            r.attachOffsetX = bx - a.x;
            r.attachOffsetY = by - a.y;
            ASCENT.Save.stats.successfulRopes++;
            if (a.type === 'crumbling' && !a.crumbling) { a.crumbling = true; a.crumbleTimer = 0; }
            ASCENT.Audio.play('ropeAttach', 1.0);
            return;
          }
        }
        if (by > g.ground.y) {
          r.x = bx; r.y = g.ground.y; r.active = true; r.shooting = false;
          r.length = Math.sqrt((r.x - p.x) ** 2 + (r.y - p.y) ** 2);
          r.attachedPlatform = null;
          ASCENT.Save.stats.successfulRopes++;
          ASCENT.Audio.play('ropeAttach', 1.0);
          return;
        }
      }
    },

    // Pendulum constraint + swing drive + boost (only while taut).
    constrain(g, dt) {
      const C = ASCENT.CONFIG, r = g.rope, p = g.player, In = ASCENT.Input;
      if (!r.active) return;

      // Anchor follows its platform.
      if (r.attachedPlatform) {
        const a = r.attachedPlatform;
        if (a.type === 'rotating') {
          const c = Math.cos(a.angle), si = Math.sin(a.angle);
          r.x = a.x + r.attachOffsetX * c - r.attachOffsetY * si;
          r.y = a.y + r.attachOffsetX * si + r.attachOffsetY * c;
        } else {
          r.x = a.x + r.attachOffsetX;
          r.y = a.y + r.attachOffsetY;
        }
      }

      let bx = r.x - p.x, by = r.y - p.y;
      const dist = Math.sqrt(bx * bx + by * by);
      if (dist > r.length) {
        bx /= dist; by /= dist;
        const radial = p.vx * bx + p.vy * by;   // velocity component along the rope
        p.vx -= radial * bx;
        p.vy -= radial * by;
        p.x = r.x - bx * r.length;
        p.y = r.y - by * r.length;

        const swing = C.SWING_FORCE * C.SWING_FORCE_MULTIPLIER;   // 600
        const c0 = Math.atan2(bx, by);
        p.vx += Math.sin(c0) * swing * dt;

        let boosting = false;
        const wasBoosting = p.boosting || false;
        const trig = In.gamepadAxis('triggerright');
        if (In.hasGamepad() && trig > 0.1) {
          boosting = true;
          p.vx += Math.sin(c0) * (700 * trig * C.SWING_FORCE_MULTIPLIER) * dt;
        } else if (In.isDown('lshift') || In.isDown('rshift')) {
          boosting = true;
          p.vx += Math.sin(c0) * (C.BOOST_FORCE * C.SWING_FORCE_MULTIPLIER) * dt;
        }
        if (boosting && !wasBoosting) ASCENT.Audio.play('boostPulse', 0.8);
        p.boosting = boosting;
      }

      // Gamepad reel (keyboard reel handled in reelKeyboard).
      if (In.hasGamepad()) {
        const ly = In.gamepadAxis('lefty');
        if (ly < -C.DEADZONE) r.length = Math.max(r.minLength, r.length - r.retractSpeed * dt);
        else if (ly > C.DEADZONE) r.length = Math.min(r.maxLength, r.length + r.retractSpeed * dt);
      }
    },

    // Keyboard reel (W/S while attached).
    reelKeyboard(g, dt) {
      const r = g.rope, In = ASCENT.Input;
      if (!r.active) return;
      if (In.isDown('w')) r.length = Math.max(r.minLength, r.length - r.retractSpeed * dt);
      else if (In.isDown('s')) r.length = Math.min(r.maxLength, r.length + r.retractSpeed * dt);
    },
  };
})();
