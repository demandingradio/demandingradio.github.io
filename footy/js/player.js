/*
 * PLAYER
 * ======
 * One entity for both humans (with key bindings) and the AI (with no
 * bindings — its movement gets driven externally by FOOTY.AI).
 *
 * Public API used by the game loop:
 *   p.applyInput(keys, dt)     — set wishDir from inputs
 *   p.setAIMove(dx, dy)        — AI alternative to applyInput
 *   p.update(dt, ball, field)  — integrate motion, handle possession
 *   p.tryKick(charge), p.handball(), p.releaseKick()
 *   p.draw(ctx)
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Player = class {
  // bindings: { UP, DOWN, LEFT, RIGHT, KICK, HANDBALL } or null for AI.
  // team: 'A' or 'B'. attacksRight: which goal this player attacks.
  constructor(cfg, opts) {
    this.cfg = cfg;
    this.id = opts.id;
    this.team = opts.team;
    this.attacks = opts.attacks;       // 'left' or 'right'
    this.bindings = opts.bindings || null;
    this.colors = opts.colors;         // { BODY, HEAD }

    this.x = opts.x;
    this.y = opts.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = opts.attacks === 'right' ? 0 : Math.PI;

    this.wishDx = 0;
    this.wishDy = 0;

    this.kickCharge = 0;       // 0..1 charge amount (kick held)
    this.kickHeld = false;
    this.lastKickRequest = null; // {power01, angle} populated on release
    this.handballRequest = false;
    this.pickupCooldown = 0;
    this.tackleCooldown = 0;

    // Possession tracking — seconds this player has held the ball *continuously*.
    // Drives the holding-the-ball mechanic (see game.js tackle branch) and the
    // holder-ring colour (white → yellow → red).
    this.possessionTime = 0;

    // Per-player tackle strength, 0..1. Higher = more likely to win a
    // holding-the-ball call. Set by Game when constructing players.
    this.tackleStrength = (opts.tackleStrength != null) ? opts.tackleStrength : 0.5;
  }

  // Read keys for a human player. Sets wishDx/wishDy and charge state.
  applyInput(input, dt) {
    if (!this.bindings) return;
    const B = this.bindings;
    let dx = 0, dy = 0;
    if (input.isDown(B.LEFT))  dx -= 1;
    if (input.isDown(B.RIGHT)) dx += 1;
    if (input.isDown(B.UP))    dy -= 1;
    if (input.isDown(B.DOWN))  dy += 1;
    if (dx !== 0 || dy !== 0) {
      const l = Math.hypot(dx, dy);
      dx /= l; dy /= l;
    }
    this.wishDx = dx;
    this.wishDy = dy;

    const kickDown = input.isDown(B.KICK);
    if (kickDown) {
      this.kickHeld = true;
      this.kickCharge = Math.min(1, this.kickCharge + dt / this.cfg.KICK.CHARGE_TIME);
    } else if (this.kickHeld) {
      // Just released — emit a kick request.
      this.lastKickRequest = { power01: this.kickCharge, angle: this.facing };
      this.kickHeld = false;
      this.kickCharge = 0;
    }

    if (input.wasPressed(B.HANDBALL)) {
      this.handballRequest = true;
    }
  }

  // AI sets motion directly (already normalized).
  setAIMove(dx, dy) {
    this.wishDx = dx;
    this.wishDy = dy;
  }

  // AI / forced kick — caller passes power 0..1 and an angle.
  requestKick(power01, angle) {
    this.lastKickRequest = { power01, angle };
  }
  requestHandball() { this.handballRequest = true; }

  update(dt, ball, field) {
    const P = this.cfg.PLAYER;
    this.pickupCooldown = Math.max(0, this.pickupCooldown - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);

    const carrying = (ball.holder === this);
    // Possession timer — accumulates while holding, resets the instant we don't.
    if (carrying) this.possessionTime += dt;
    else          this.possessionTime = 0;

    const maxSpeed = carrying ? P.CARRY_SPEED : P.MAX_SPEED;

    // Accelerate toward wish direction, decay otherwise.
    if (this.wishDx !== 0 || this.wishDy !== 0) {
      const targetVx = this.wishDx * maxSpeed;
      const targetVy = this.wishDy * maxSpeed;
      const blend = Math.min(1, P.ACCEL * dt / maxSpeed);
      this.vx += (targetVx - this.vx) * blend;
      this.vy += (targetVy - this.vy) * blend;
      this.facing = Math.atan2(this.wishDy, this.wishDx);
    } else {
      const decay = Math.exp(-P.FRICTION * dt);
      this.vx *= decay;
      this.vy *= decay;
    }

    // Apply velocity.
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Keep inside oval.
    const c = field.clamp(this.x, this.y, P.RADIUS);
    if (c.hit) {
      this.x = c.x; this.y = c.y;
      // Kill outward velocity component.
      const toCx = field.cx - this.x;
      const toCy = field.cy - this.y;
      const len  = Math.hypot(toCx, toCy) || 1;
      const nx = toCx / len, ny = toCy / len;
      const proj = this.vx * nx + this.vy * ny;
      if (proj < 0) {
        this.vx -= nx * proj;
        this.vy -= ny * proj;
      }
    }
  }

  // ---- Possession actions ----

  // Try to pick up a loose ball if close enough.
  tryPickup(ball) {
    if (ball.holder) return false;
    if (this.pickupCooldown > 0) return false;
    // Just got tackled? Can't grab the ball back instantly — other players
    // get first crack at it during this player's TACKLE_COOLDOWN window.
    if (this.tackleCooldown > 0) return false;
    const dx = ball.x - this.x;
    const dy = ball.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.cfg.PLAYER.POSSESSION_RADIUS && ball.z < 30) {
      ball.holder = this;
      ball.lastKicker = null;
      return true;
    }
    return false;
  }

  // Try to mark (catch a descending kick).
  tryMark(ball) {
    if (ball.holder) return false;
    if (!ball.isDescending()) return false;
    if (ball.lastKicker === this && ball.lastKickType === 'kick') return false; // no self-mark
    const dx = ball.x - this.x;
    const dy = ball.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.cfg.PLAYER.MARK_RADIUS && ball.z < 60) {
      ball.holder = this;
      ball.lastKicker = null;
      ball.vx = ball.vy = ball.vz = 0;
      return true;
    }
    return false;
  }

  // Execute any pending kick/handball this frame against a Ball. Returns true
  // if the ball was launched.
  executeActions(ball) {
    if (ball.holder !== this) {
      // No ball — clear pending actions so they don't fire next time we grab it.
      this.lastKickRequest = null;
      this.handballRequest = false;
      return false;
    }

    if (this.lastKickRequest) {
      const K = this.cfg.KICK;
      const { power01, angle } = this.lastKickRequest;
      const speed = K.MIN_POWER + (K.MAX_POWER - K.MIN_POWER) * power01;
      // Tiny baseline inaccuracy so kicks aren't laser-perfect.
      const wobble = (Math.random() - 0.5) * 2 * K.INACCURACY_BASE * (1 - power01 * 0.5);
      ball.launch(speed, angle + wobble, K.LIFT_RATIO, this, 'kick');
      this.pickupCooldown = this.cfg.PLAYER.PICKUP_COOLDOWN;
      this.lastKickRequest = null;
      this.handballRequest = false;
      return true;
    }
    if (this.handballRequest) {
      const H = this.cfg.HANDBALL;
      ball.launch(H.SPEED, this.facing, H.LIFT_RATIO, this, 'handball');
      this.pickupCooldown = this.cfg.PLAYER.PICKUP_COOLDOWN;
      this.handballRequest = false;
      return true;
    }
    return false;
  }

  // ---- Drawing ----
  draw(ctx, isControlled, isHolder) {
    const C = this.cfg.COLORS;
    const P = this.cfg.PLAYER;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 4, P.RADIUS * 0.9, P.RADIUS * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (jumper).
    ctx.fillStyle = this.colors.BODY;
    ctx.strokeStyle = C.OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, P.RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head (small circle slightly offset in facing direction).
    const hx = this.x + Math.cos(this.facing) * (P.RADIUS * 0.35);
    const hy = this.y + Math.sin(this.facing) * (P.RADIUS * 0.35);
    ctx.fillStyle = this.colors.HEAD;
    ctx.beginPath();
    ctx.arc(hx, hy, P.RADIUS * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Facing tick (little arrow at front).
    const fx = this.x + Math.cos(this.facing) * (P.RADIUS + 4);
    const fy = this.y + Math.sin(this.facing) * (P.RADIUS + 4);
    ctx.strokeStyle = C.OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    // Holder ring — colour signals how long the carrier has had the ball.
    //   white  : safe (no holding-the-ball possible yet)
    //   yellow : prior opportunity reached, caution
    //   red    : dispose now or you'll lose the free kick
    if (isHolder) {
      const H = this.cfg.HOLDING_BALL;
      const cautionAt = H.PRIOR_OPP_TIME;
      const dangerAt  = H.PRIOR_OPP_TIME + H.FULL_PENALTY_DELAY * 0.6;
      let ringColor = C.HOLDER_RING;
      if (this.possessionTime >= dangerAt)       ringColor = '#ff4040';
      else if (this.possessionTime >= cautionAt) ringColor = '#ffd24a';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, P.RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Kick charge bar (above the player) for human only.
    if (this.kickHeld && this.kickCharge > 0.02) {
      const w = 36, h = 5;
      const x = this.x - w / 2;
      const y = this.y - P.RADIUS - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(x, y, w * this.kickCharge, h);
    }
  }
};
