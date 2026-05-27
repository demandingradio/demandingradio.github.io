/*
 * BALL
 * ====
 * The ball has 2D position (x, y) on the field plane plus a vertical height
 * `z` (0 = on the ground). Velocity has (vx, vy, vz). Gravity acts on vz.
 *
 *   - When `holder` is non-null, the ball just sticks to that player and
 *     physics is paused.
 *   - When free, the ball flies until it lands (z hits 0), then rolls with
 *     ground friction until it stops.
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Ball = class {
  constructor(cfg, field) {
    this.cfg = cfg;
    this.field = field;
    this.reset();
  }

  reset() {
    this.x = this.field.cx;
    this.y = this.field.cy;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.holder = null;     // Player reference if held
    this.lastKicker = null; // who last kicked (for own-mark prevention)
    this.lastKickType = null; // 'kick' | 'handball' | null
    this.outOfPlay = false; // set true after a goal/behind until reset()
  }

  // Snap the ball to a held player's pocket. Called every frame while held.
  followHolder() {
    if (!this.holder) return;
    const p = this.holder;
    // Position the ball slightly in front of the carrier based on facing.
    const fwd = 14;
    this.x = p.x + Math.cos(p.facing) * fwd;
    this.y = p.y + Math.sin(p.facing) * fwd;
    this.z = 18; // held a bit above the ground (cosmetic)
    this.vx = 0; this.vy = 0; this.vz = 0;
  }

  // Launch the ball from current position with given horizontal speed,
  // facing angle, and a vertical lift ratio (vz / horizontalSpeed).
  launch(speed, angle, liftRatio, kicker, type) {
    this.holder = null;
    this.lastKicker = kicker || null;
    this.lastKickType = type || 'kick';
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.vz = speed * liftRatio;
    this.z = Math.max(this.z, 12); // lift off the ground
  }

  // Step physics by dt seconds. Returns previous position for goal-line tests.
  step(dt) {
    if (this.holder) {
      this.followHolder();
      return { prev: { x: this.x, y: this.y }, curr: { x: this.x, y: this.y } };
    }

    const B = this.cfg.BALL;
    const prev = { x: this.x, y: this.y };

    // Apply gravity to vertical velocity.
    this.vz -= B.GRAVITY * dt;

    // Apply horizontal friction. Less when airborne, more when rolling.
    const fric = (this.z > 0.5) ? B.AIR_FRICTION : B.GROUND_FRICTION;
    const decay = Math.exp(-fric * dt);
    this.vx *= decay;
    this.vy *= decay;

    // Advance position.
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    // Ground collision / bounce.
    if (this.z <= 0) {
      this.z = 0;
      if (this.vz < -B.REST_Z_VELOCITY) {
        // Bounce.
        this.vz = -this.vz * B.BOUNCE_DAMPING_Z;
        this.vx *= B.BOUNCE_DAMPING_XY;
        this.vy *= B.BOUNCE_DAMPING_XY;
      } else {
        // Settle on ground.
        this.vz = 0;
      }
    }

    // Snapshot the position before boundary clamping — the game uses this to
    // detect goal-line crossings, which would otherwise be eaten by the clamp.
    const curr = { x: this.x, y: this.y };

    // Out-of-bounds: bounce off the oval boundary (simple).
    if (!this.field.contains(this.x, this.y)) {
      const c = this.field.clamp(this.x, this.y, 0);
      this.x = c.x;
      this.y = c.y;
      // Reflect velocity roughly back toward center.
      const toCx = this.field.cx - this.x;
      const toCy = this.field.cy - this.y;
      const len = Math.hypot(toCx, toCy) || 1;
      const speed = Math.hypot(this.vx, this.vy) * 0.5;
      this.vx = (toCx / len) * speed;
      this.vy = (toCy / len) * speed;
    }

    return { prev, curr };
  }

  // True if the ball is descending toward the ground (mark window).
  isDescending() {
    return this.z > 8 && this.vz < 0;
  }

  // True if the ball is on the ground and essentially still.
  isLoose() {
    if (this.holder) return false;
    const speed = Math.hypot(this.vx, this.vy);
    return this.z < 4 && speed < 250;
  }

  draw(ctx) {
    const C  = this.cfg.COLORS;
    const r  = this.cfg.BALL.RADIUS;

    // Shadow on the ground — wider when ball is higher.
    const shadowR = r + Math.min(this.z * 0.15, 14);
    ctx.fillStyle = C.BALL_SHADOW;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 2, shadowR, shadowR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // The ball itself drawn at (x, y - z) — z is "height above ground".
    const drawY = this.y - this.z * 0.6; // small parallax-y offset so height reads
    ctx.save();
    ctx.translate(this.x, drawY);
    // Rotate based on velocity for a bit of life.
    const angle = Math.atan2(this.vy, this.vx);
    ctx.rotate(angle);
    // Body (sherrin-shaped ellipse).
    ctx.fillStyle = C.BALL;
    ctx.strokeStyle = '#3a1a08';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.4, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Laces (white).
    ctx.strokeStyle = C.BALL_LACE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0);
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 4, -r * 0.4);
      ctx.lineTo(i * 4,  r * 0.4);
    }
    ctx.stroke();
    ctx.restore();
  }
};
