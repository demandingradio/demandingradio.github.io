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

    this.kickCharge = 0;       // 0..1 charge amount (legacy; unused with mouse aim)
    this.kickHeld = false;
    this.lastKickRequest = null; // {power01, angle} — angle absent ⇒ use facing
    this.handballRequest = false;
    this.tackleRequest = false;  // set by mouse player (space) or AI; consumed by Game
    this.pickupCooldown = 0;
    this.tackleCooldown = 0;

    // Possession tracking — seconds this player has held the ball *continuously*.
    // Drives the holding-the-ball mechanic (see game.js tackle branch) and the
    // holder-ring colour (white → yellow → red).
    this.possessionTime = 0;

    // Per-player tackle strength, 0..1. Higher = more likely to win a
    // holding-the-ball call. Set by Game when constructing players.
    this.tackleStrength = (opts.tackleStrength != null) ? opts.tackleStrength : 0.5;

    // Sprint stamina, 0..1. Drains while sprinting, regens otherwise.
    this.stamina = 1;
    this.sprintHeld = false;

    // Aim target in field units — only meaningful for the mouse-controlled
    // player. Game writes the cursor position here every frame.
    this.aimX = this.x;
    this.aimY = this.y;
  }

  // Read movement keys for the mouse-controlled human. Kick/handball/tackle
  // are mouse-driven and set by Game directly via the *Request fields.
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

    // Sprint: held only matters if we have any stamina left.
    this.sprintHeld = input.isDown(B.SPRINT);

    // Tackle button — set the request; Game decides if there's anyone to tackle.
    if (input.wasPressed(B.TACKLE)) this.tackleRequest = true;
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

    // Sprint stamina: drain while actively sprinting AND moving; regen otherwise.
    const S = this.cfg.SPRINT;
    const moving = (this.wishDx !== 0 || this.wishDy !== 0);
    const sprinting = this.sprintHeld && this.stamina > 0 && moving;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - S.STAMINA_DRAIN_RATE * dt);
    } else {
      this.stamina = Math.min(1, this.stamina + S.STAMINA_REGEN_RATE * dt);
    }

    let maxSpeed = carrying ? P.CARRY_SPEED : P.MAX_SPEED;
    if (sprinting) maxSpeed *= S.SPEED_MULT;

    // Accelerate toward wish direction, decay otherwise.
    if (this.wishDx !== 0 || this.wishDy !== 0) {
      const targetVx = this.wishDx * maxSpeed;
      const targetVy = this.wishDy * maxSpeed;
      // Dot product of wish direction vs current velocity direction is negative
      // when the player is trying to reverse — use a slower blend rate so there's
      // a brief "plant and turn" cost to changing direction sharply.
      const curSpeed = Math.hypot(this.vx, this.vy);
      const changingDir = curSpeed > 30 &&
        (this.vx * this.wishDx + this.vy * this.wishDy) / curSpeed < 0;
      const rate  = changingDir ? P.DECEL : P.ACCEL;
      const blend = Math.min(1, rate * dt / maxSpeed);
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

  // Execute any pending kick/handball this frame against a Ball. Returns one
  // of: 'kick', 'handball', 'rejected', or false.
  //
  // Kick direction model (mouse-aim):
  //   req.angle           — caller-supplied launch direction (radians)
  //   req.power01         — caller-supplied power 0..1 (already distance-based)
  //   If the angle between facing and req.angle exceeds MAX_FORWARD_ANGLE,
  //   the kick is rejected (you can't kick behind yourself). Otherwise the
  //   travel scales by ANGLE_PENALTY_MIN..1 based on cos(angleDelta).
  //
  // AI/legacy callers can omit angle to default to facing (no penalty).
  executeActions(ball) {
    if (ball.holder !== this) {
      this.lastKickRequest = null;
      this.handballRequest = false;
      return false;
    }

    if (this.lastKickRequest) {
      const K = this.cfg.KICK;
      const req = this.lastKickRequest;
      const aimAngle = (req.angle != null) ? req.angle : this.facing;
      const power01 = Math.max(0, Math.min(1, req.power01));

      // Angle delta in [-π, π] then absolute.
      let delta = aimAngle - this.facing;
      while (delta >  Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const absDelta = Math.abs(delta);

      if (absDelta > K.MAX_FORWARD_ANGLE) {
        // Can't kick behind yourself — reject and surface a "rejected" result
        // so Game can flash a hint. Ball stays in possession.
        this.lastKickRequest = null;
        this.handballRequest = false;
        return 'rejected';
      }

      const distanceMult = K.ANGLE_PENALTY_MIN
        + (1 - K.ANGLE_PENALTY_MIN) * Math.cos(absDelta);
      const speed = (K.MIN_POWER + (K.MAX_POWER - K.MIN_POWER) * power01) * distanceMult;
      // Baseline wobble + any overcharge wobble passed in from a held kick.
      const extra = req.extraWobble || 0;
      const baseWobble = K.INACCURACY_BASE * (1 - power01 * 0.5);
      const wobble = (Math.random() - 0.5) * 2 * (baseWobble + extra);
      ball.launch(speed, aimAngle + wobble, K.LIFT_RATIO, this, 'kick');
      ball.vx += this.vx * K.KICK_MOMENTUM;
      ball.vy += this.vy * K.KICK_MOMENTUM;
      this.pickupCooldown = this.cfg.PLAYER.PICKUP_COOLDOWN;
      this.lastKickRequest = null;
      this.handballRequest = false;
      return 'kick';
    }

    if (this.handballRequest) {
      const H = this.cfg.HANDBALL;
      // Handball uses the same aim if it was set explicitly via request angle;
      // otherwise it goes in facing direction (legacy / AI behaviour).
      const req = this.handballRequest === true ? null : this.handballRequest;
      const aimAngle = (req && req.angle != null) ? req.angle : this.facing;
      ball.launch(H.SPEED, aimAngle, H.LIFT_RATIO, this, 'handball');
      this.pickupCooldown = this.cfg.PLAYER.PICKUP_COOLDOWN;
      this.handballRequest = false;
      return 'handball';
    }
    return false;
  }

  // Aim-aware handball request (used by mouse). Direction toward (aimX, aimY).
  requestHandballAimed(targetX, targetY) {
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    this.handballRequest = { angle };
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

    // Stamina bar above the human player. Only draw when meaningful (not full,
    // OR currently sprinting) so it doesn't clutter the field.
    if (this.bindings && (this.stamina < 0.999 || this.sprintHeld)) {
      const w = 36, h = 4;
      const x = this.x - w / 2;
      const y = this.y - P.RADIUS - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      let fill = '#5ae15a';
      if (this.stamina < 0.25)     fill = '#ff5050';
      else if (this.stamina < 0.5) fill = '#ffaa30';
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w * this.stamina, h);
    }

    // Kick power bar — shown only while actively charging a kick. Two-zone
    // layout: a green "safe" section filling up to full power, then a red
    // "overcharge" section where holding longer hurts accuracy.
    if (this.kickHeld) {
      const K = this.cfg.KICK;
      const totalSec = K.CHARGE_TIME + K.OVERCHARGE_TIME;
      const greenW   = 50 * (K.CHARGE_TIME / totalSec);
      const redW     = 50 - greenW;
      const x = this.x - 25;
      const y = this.y - P.RADIUS - 22;
      // Frame.
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x - 2, y - 2, 54, 9);
      // Empty track (two zones, dim).
      ctx.fillStyle = 'rgba(120, 220, 120, 0.25)';
      ctx.fillRect(x, y, greenW, 5);
      ctx.fillStyle = 'rgba(220, 90, 90, 0.25)';
      ctx.fillRect(x + greenW, y, redW, 5);
      // Fill: how much of the total has elapsed (clamped).
      const fillSec = Math.min(this.kickChargeTime, totalSec);
      const fillFrac = fillSec / totalSec;
      // Draw green fill first.
      const fillSecGreen = Math.min(fillSec, K.CHARGE_TIME);
      ctx.fillStyle = '#5ae15a';
      ctx.fillRect(x, y, 50 * (fillSecGreen / totalSec), 5);
      // Then any red portion.
      if (fillSec > K.CHARGE_TIME) {
        const fillSecRed = fillSec - K.CHARGE_TIME;
        ctx.fillStyle = '#ff5050';
        ctx.fillRect(x + greenW, y, 50 * (fillSecRed / totalSec), 5);
      }
      // Divider tick at the boundary.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x + greenW - 1, y - 1, 1, 7);
      // Suppress unused-var lint
      void fillFrac;
    }
  }
};
