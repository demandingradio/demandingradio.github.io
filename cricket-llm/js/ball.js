/*
 * BALL
 * ====
 * Delivery planning + flight.
 *
 * A delivery is planned analytically so the ball lands EXACTLY on the chosen
 * bounce spot, whatever the swing/drift/dip. Before the bounce the ball has a
 * lateral acceleration that ramps up with time (late swing / drift). At the
 * bounce it loses some pace, gets a vertical kick, and a sideways velocity
 * change (spin turn / seam). After the bounce it is a plain projectile.
 *
 * Because the whole path is closed-form, anything can ask "where will the ball
 * be when it reaches z = 1.9?" (the batter's contact plane) or "does it hit
 * the stumps?" at any time — that is what the batting/umpire logic uses.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, World } = CLLM;
  const G = 9.81;
  const R = World.PITCH.BALL_R;

  /*
   * plan = {
   *   release: V3, bounce: {x, z}, speed (m/s at release, along the pitch),
   *   swing: lateral accel coefficient (m/s^3, jerk — late movement), sign = direction in world x
   *   drift: constant lateral accel (m/s^2) before bounce (spin drift)
   *   dip:   extra downward accel (m/s^2) before bounce (overspin dip)
   *   turn:  lateral velocity added at bounce (m/s)
   *   bounceK: vertical restitution at bounce (0.3 skiddy .. 0.6 bouncy)
   *   paceKeep: fraction of along-pitch speed kept after bounce
   * }
   */
  function planDelivery(plan) {
    const p0 = plan.release;
    const vz = -Math.abs(plan.speed);
    const T = (plan.bounce.z - p0.z) / vz;           // time to bounce (>0)
    const g = G + (plan.dip || 0);
    const vy = (R - p0.y + 0.5 * g * T * T) / T;
    const jerk = plan.swing || 0, drift = plan.drift || 0;
    // x(t) = x0 + vx t + drift t^2/2 + jerk t^3/6
    const vx = (plan.bounce.x - p0.x - 0.5 * drift * T * T - jerk * T * T * T / 6) / T;
    const vyB = vy - g * T;                           // vertical speed at bounce (negative)
    const vxB = vx + drift * T + 0.5 * jerk * T * T;  // lateral speed at bounce
    const k = plan.bounceK != null ? plan.bounceK : 0.5;
    const post = {
      vx: vxB + (plan.turn || 0),
      vy: -vyB * k,
      vz: vz * (plan.paceKeep != null ? plan.paceKeep : 0.88),
    };
    return Object.assign({}, plan, { vx, vy, vz, T, g, vyB, vxB, post });
  }

  // Position at time t after release (t may exceed bounce).
  function posAt(d, t) {
    const p0 = d.release;
    if (t <= d.T) {
      return V.v(
        p0.x + d.vx * t + 0.5 * (d.drift || 0) * t * t + (d.swing || 0) * t * t * t / 6,
        p0.y + d.vy * t - 0.5 * d.g * t * t,
        p0.z + d.vz * t
      );
    }
    const u = t - d.T;
    return V.v(
      d.bounce.x + d.post.vx * u,
      Math.max(R, R + d.post.vy * u - 0.5 * G * u * u),
      d.bounce.z + d.post.vz * u
    );
  }

  function velAt(d, t) {
    if (t <= d.T) {
      return V.v(d.vx + (d.drift || 0) * t + 0.5 * (d.swing || 0) * t * t, d.vy - d.g * t, d.vz);
    }
    const u = t - d.T;
    return V.v(d.post.vx, d.post.vy - G * u, d.post.vz);
  }

  // Time at which the ball reaches plane z = zc (on its way to the batter).
  function timeAtZ(d, zc) {
    const p0 = d.release;
    if (zc >= d.bounce.z) return (zc - p0.z) / d.vz;
    return d.T + (zc - d.bounce.z) / d.post.vz;
  }

  // Would this delivery hit the stumps (ignoring the batter)?
  function hitsStumps(d) {
    const t = timeAtZ(d, 0);
    const p = posAt(d, t);
    const P = World.PITCH;
    return { hit: Math.abs(p.x) < P.STUMPS_HALF_W + R && p.y < P.STUMP_H + R * 0.6, p, t };
  }

  /*
   * A ball in flight. Before contact it follows the planned delivery. After
   * contact (or a deflection) it switches to free flight with gravity, drag,
   * bounces, and stops in the nets.
   */
  class Ball {
    constructor() {
      this.onEvent = null;      // wiring, survives reset()
      this.reset();
    }

    reset() {
      this.d = null;
      this.mode = 'hidden';   // hidden | held | delivery | free | dead
      this.pos = V.v(0, -10, 0);
      this.vel = V.v();
      this.t = 0;
      this.trail = [];
      this.bounced = false;
      this.spin = 0;
    }

    launch(d) {
      this.d = d;
      this.mode = 'delivery';
      this.t = 0;
      this.pos = V.copy(d.release);
      this.trail = [];
      this.bounced = false;
      this.spin = 0;
    }

    // Free flight from a position/velocity (after bat contact etc).
    free(pos, vel, spin) {
      this.mode = 'free';
      this.pos = V.copy(pos);
      this.vel = V.copy(vel);
      this.spin = spin || 0;
      this.netHit = false;
    }

    update(dt) {
      if (this.mode === 'delivery') {
        const prevT = this.t;
        this.t += dt;
        if (!this.bounced && this.t >= this.d.T) {
          this.bounced = true;
          if (this.onEvent) this.onEvent('bounce', posAt(this.d, this.d.T), prevT);
        }
        this.pos = posAt(this.d, this.t);
      } else if (this.mode === 'free') {
        const N = World.NET;
        const steps = 4;
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          const v = this.vel;
          const sp = V.len(v);
          const drag = 0.0045 * sp;
          this.vel = V.v(v.x - v.x * drag * h, v.y - G * h - v.y * drag * h, v.z - v.z * drag * h);
          this.pos = V.add(this.pos, V.mul(this.vel, h));
          // ground
          if (this.pos.y < R) {
            this.pos.y = R;
            if (this.vel.y < 0) {
              const hard = -this.vel.y;
              this.vel.y = hard > 1.2 ? hard * 0.42 : 0;
              this.vel.x *= 0.8; this.vel.z *= 0.8;
              if (hard > 1.5 && this.onEvent) this.onEvent('ground', this.pos, hard);
            }
            // rolling friction
            this.vel.x *= 1 - 1.2 * h; this.vel.z *= 1 - 1.2 * h;
          }
          // Nets: side nets, back net, (open roof). Nets absorb most energy.
          const inNetZ = this.pos.z > N.BACK_Z && this.pos.z < N.FRONT_Z;
          if (inNetZ && this.pos.x > N.X[2] - R) { this._net('x', N.X[2] - R); }
          if (inNetZ && this.pos.x < N.X[1] + R) { this._net('x', N.X[1] + R); }
          if (this.pos.z < N.BACK_Z + R) { this._net('z', N.BACK_Z + R); }
          if (this.pos.y > N.H + 1.5 && this.pos.z < N.FRONT_Z) {
            // over the top of the net lane: pretend the roof netting catches it
            this._net('y', N.H + 1.5);
          }
        }
        if (V.len(this.vel) < 0.15 && this.pos.y <= R + 1e-3) this.mode = 'dead';
      }
      if (this.mode === 'delivery' || this.mode === 'free') {
        this.trail.push(V.copy(this.pos));
        if (this.trail.length > 14) this.trail.shift();
      }
    }

    _net(axis, v) {
      const hitSpeed = Math.abs(this.vel[axis]);
      this.pos[axis] = v;
      this.vel[axis] = -this.vel[axis] * 0.12;
      this.vel.x *= axis === 'x' ? 1 : 0.35;
      this.vel.y *= 0.4;
      this.vel.z *= axis === 'z' ? 1 : 0.35;
      if (!this.netHit || hitSpeed > 3) {
        this.netHit = true;
        if (this.onEvent) this.onEvent('net', V.copy(this.pos), hitSpeed);
      }
    }

    // Render: shadow + ball (+ optional faint trail). Pushes into queue.
    queue(queue, cam, opts) {
      if (this.mode === 'hidden' || this.mode === 'held') return;
      const pos = this.pos;
      const sh = World.shadowOf(pos);
      const trail = (opts && opts.trail) ? this.trail.slice() : null;
      queue.push({
        z: cam.depth(sh) + 0.5,
        draw: (ctx) => {
          const s = cam.project(sh);
          if (!s) return;
          const hgt = Math.max(0, pos.y);
          const a = M.clamp(0.4 - hgt * 0.08, 0.06, 0.4);
          ctx.fillStyle = `rgba(10,25,10,${a})`;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, Math.max(1.5, R * 1.3 * s.s), Math.max(0.8, R * 0.55 * s.s), 0, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      queue.push({
        z: cam.depth(pos) - 0.12,
        draw: (ctx) => {
          if (trail && trail.length > 2) {
            ctx.save();
            ctx.lineCap = 'round';
            for (let i = 1; i < trail.length; i++) {
              const a = cam.project(trail[i - 1]), b = cam.project(trail[i]);
              if (!a || !b) continue;
              ctx.strokeStyle = `rgba(255,240,220,${0.28 * (i / trail.length)})`;
              ctx.lineWidth = Math.max(1, R * 1.4 * b.s * (i / trail.length));
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
            ctx.restore();
          }
          const p = cam.project(pos);
          if (!p) return;
          // Slightly exaggerated size keeps the ball readable at distance.
          const r = Math.max(2.4, R * p.s * 1.35);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#5e0c13'; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.75, 0, Math.PI * 2);
          ctx.fillStyle = '#c3222e'; ctx.fill();
          if (r > 3) {
            ctx.strokeStyle = 'rgba(255,235,210,0.8)';
            ctx.lineWidth = Math.max(0.6, r * 0.14);
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.8, -0.9 + this.spin, 0.9 + this.spin); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.38, r * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
        },
      });
    }
  }

  CLLM.BallPhys = { planDelivery, posAt, velAt, timeAtZ, hitsStumps, G };
  CLLM.Ball = Ball;
})();
