/*
 * PLAYER — horizontal control, friction, integration, collisions, jump.
 * =====================================================================
 * Physics ported unchanged from Cosmic Ascent. Gravity and the tongue
 * constraint are applied by game.js *around* move(), in the original's order:
 * gravity → tongue constrain → move → integrate.
 *
 * Cosmic Giraffe additions: FX events (jump / land / goal) and a `facing`
 * hint for the giraffe sprite.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Player = {

  move(g, dt) {
    const C = ASCENT.CONFIG, p = g.player, r = g.rope, In = ASCENT.Input;
    const airCtl = r.active ? C.MOVE_AIR_FACTOR : 1.0;
    const accel = g.moveSpeed * airCtl * dt * 3;   // ×3 matches the original feel

    let steer = 0;
    if (In.hasGamepad()) {
      const lx = In.gamepadAxis('leftx');
      if (Math.abs(lx) > C.DEADZONE) { p.vx += lx * accel; steer = Math.sign(lx); }
    }
    if (!steer) {
      if (In.isDown('left') || In.isDown('a')) { p.vx -= accel; steer = -1; }
      else if (In.isDown('right') || In.isDown('d')) { p.vx += accel; steer = 1; }
    }
    p.steer = steer;

    ASCENT.Rope.reelKeyboard(g, dt);

    // Friction (stronger on the ground when not roping).
    if (p.onGround && !r.active) p.vx *= (1 - (1 - g.friction) * dt * 60);
    else p.vx *= (1 - (1 - g.airFriction) * dt * 60);

    // Integrate.
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    // Ground (the home planet's surface).
    if (p.y + p.radius > g.ground.y) {
      const impact = p.vy;
      p.y = g.ground.y - p.radius;
      p.vy = 0;
      p.onGround = true;
      p.hasDoubleJump = true;
      p.ropeGraceTimer = 0;
      if (impact > 100) {
        ASCENT.Audio.play('landing', 0.7);
        ASCENT.FX.emit('land', { x: p.x, y: g.ground.y, speed: impact });
      }
    }

    // Facing: toward the aim when free, toward the anchor when licking,
    // otherwise follow horizontal travel.
    if (r.active) { if (Math.abs(r.x - p.x) > 4) p.facing = r.x > p.x ? 1 : -1; }
    else if (r.shooting) p.facing = r.shootDX >= 0 ? 1 : -1;
    else if (steer) p.facing = steer;
    else if (Math.abs(p.vx) > 60) p.facing = p.vx > 0 ? 1 : -1;

    // Drifted out of the world → respawn on the home planet.
    if (p.x < -100 || p.x > g.levelWidth + 100 || p.y > g.levelHeight + 100) {
      ASCENT.Game.killPlayer('void');
      return;
    }

    // Reached the Celestial Acacia.
    if (!g.goal.reached) {
      const dx = p.x - g.goal.x, dy = p.y - g.goal.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.radius + g.goal.radius) {
        g.goal.reached = true;
        g.goal.reachedAt = g.time;
        if (!g._debugUsed) {   // F-fly / G-warp wins aren't real completions
          ASCENT.Save.stats.gamesCompleted++;
          ASCENT.Game.unlockAchievement('first_win');
        }
        ASCENT.Audio.play('victory', 1.0);
        ASCENT.FX.emit('goal', { x: g.goal.x, y: g.goal.y });
      }
    }
  },

  jump(g) {
    const p = g.player;
    if (g.debugFlying) return;
    if (p.onGround) {
      p.vy = g.jumpPower;
      p.hasDoubleJump = true;
      ASCENT.Save.stats.jumps++;
      ASCENT.Audio.play('jump', 0.6);
      ASCENT.FX.emit('jump', { x: p.x, y: p.y + p.radius, double: false });
    } else if (p.hasDoubleJump || p.ropeGraceTimer > 0) {
      p.vy = g.jumpPower * ASCENT.CONFIG.DOUBLE_JUMP_MULT;
      p.hasDoubleJump = false;
      p.ropeGraceTimer = 0;
      ASCENT.Save.stats.jumps++;
      ASCENT.Audio.play('jump', 0.5, 1.2);
      ASCENT.FX.emit('jump', { x: p.x, y: p.y + p.radius, double: true });
    }
  },
};
