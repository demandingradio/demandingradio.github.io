/*
 * PLAYER — horizontal control, friction, integration, collisions, jump.
 * =====================================================================
 * Ported from the player sections of updateGame() and the jump handler.
 * Gravity and the rope constraint are applied by game.js *around* move(),
 * in the original's order: gravity → rope constrain → move → integrate.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Player = {

  move(g, dt) {
    const C = ASCENT.CONFIG, p = g.player, r = g.rope, In = ASCENT.Input;
    const airCtl = r.active ? C.MOVE_AIR_FACTOR : 1.0;
    const accel = g.moveSpeed * airCtl * dt * 3;   // ×3 matches the original feel

    if (In.hasGamepad()) {
      const lx = In.gamepadAxis('leftx');
      if (Math.abs(lx) > C.DEADZONE) p.vx += lx * accel;
    } else {
      if (In.isDown('left') || In.isDown('a')) p.vx -= accel;
      else if (In.isDown('right') || In.isDown('d')) p.vx += accel;
    }

    ASCENT.Rope.reelKeyboard(g, dt);

    // Friction (stronger on the ground when not roping).
    if (p.onGround && !r.active) p.vx *= (1 - (1 - g.friction) * dt * 60);
    else p.vx *= (1 - (1 - g.airFriction) * dt * 60);

    // Integrate.
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    // Ground.
    if (p.y + p.radius > g.ground.y) {
      const wasFalling = p.vy > 100;
      p.y = g.ground.y - p.radius;
      p.vy = 0;
      p.onGround = true;
      p.hasDoubleJump = true;
      p.ropeGraceTimer = 0;
      if (wasFalling) ASCENT.Audio.play('landing', 0.7);
    }

    // Fell off the world → respawn.
    if (p.x < -100 || p.x > g.levelWidth + 100 || p.y > g.levelHeight + 100) {
      ASCENT.Game.resetGame();
      return;
    }

    // Reached the goal.
    if (!g.goal.reached) {
      const dx = p.x - g.goal.x, dy = p.y - g.goal.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.radius + g.goal.radius) {
        g.goal.reached = true;
        ASCENT.Save.stats.gamesCompleted++;
        ASCENT.Game.unlockAchievement('first_win');
        ASCENT.Audio.play('victory', 1.0);
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
    } else if (p.hasDoubleJump || p.ropeGraceTimer > 0) {
      p.vy = g.jumpPower * ASCENT.CONFIG.DOUBLE_JUMP_MULT;
      p.hasDoubleJump = false;
      p.ropeGraceTimer = 0;
      ASCENT.Save.stats.jumps++;
      ASCENT.Audio.play('jump', 0.5, 1.2);
    }
  },
};
