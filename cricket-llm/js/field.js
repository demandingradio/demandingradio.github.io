/*
 * IMAGINARY FIELD
 * ===============
 * The nets have no fielders, but everyone knows where they'd be. Each bowler
 * type sets a field. A shot is projected onto a top-down ground (metres,
 * batter's stumps at the origin, bowler's end at +z) and the field decides:
 * boundary, runs, stopped, or caught.
 *
 * It is deterministic: the same shot into the same field gives the same
 * result, so placement is a skill. Fielders are drawn on the mini-map.
 *
 * Positions are authored for a RIGHT-hander (off side = -x) and mirrored for
 * left-handers.
 */
(function () {
  const CLLM = window.CLLM;
  const { M } = CLLM;

  const BOUNDARY = { cx: 0, cz: 10, rx: 62, rz: 68 };

  // name, x, z   (RH batter; off side is -x)
  const FIELDS = {
    pace: [
      ['keeper', -0.4, -15], ['first slip', -2.4, -15.8], ['second slip', -4.4, -15.2], ['gully', -10.5, -10],
      ['point', -24, 1], ['cover', -24, 17], ['mid-off', -11, 36], ['mid-on', 10, 36],
      ['midwicket', 25, 14], ['fine leg', 26, -48],
    ],
    off: [
      ['keeper', -0.3, -3.2], ['slip', -1.6, -4.6], ['short leg', 3.2, 2.2], ['point', -20, 1],
      ['cover', -22, 16], ['mid-off', -11, 34], ['mid-on', 10, 34], ['midwicket', 22, 16],
      ['deep square leg', 52, 0], ['long-on', 22, 66],
    ],
    leg: [
      ['keeper', -0.3, -3.2], ['slip', -1.8, -4.8], ['point', -22, 0], ['cover', -21, 17],
      ['deep cover', -48, 34], ['mid-off', -10, 34], ['mid-on', 10, 34], ['midwicket', 22, 14],
      ['deep midwicket', 50, 30], ['fine leg', 24, -46],
    ],
  };

  // Boundary distance from the batter along a direction (unit dx, dz).
  function boundaryDist(dx, dz) {
    // Solve |(t*dx - cx)/rx, (t*dz - cz)/rz| = 1
    const B = BOUNDARY;
    const a = (dx * dx) / (B.rx * B.rx) + (dz * dz) / (B.rz * B.rz);
    const b = -2 * ((dx * B.cx) / (B.rx * B.rx) + (dz * B.cz) / (B.rz * B.rz));
    const c = (B.cx * B.cx) / (B.rx * B.rx) + (B.cz * B.cz) / (B.rz * B.rz) - 1;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  class Field {
    constructor() {
      this.type = 'pace';
      this.hand = 'R';
      this.players = [];
      this.last = null;      // last shot projection for the mini-map
      this.set('pace', 'R');
    }

    set(type, hand) {
      this.type = type;
      this.hand = hand;
      const sx = hand === 'L' ? -1 : 1;
      this.players = FIELDS[type].map(([name, x, z]) => ({ name, x: x * sx, z }));
    }

    // Unit direction for a field angle phi (radians, 0 = straight back past
    // the bowler toward +z, +pi/2 = toward +x).
    static dir(phi) { return { x: Math.sin(phi), z: Math.cos(phi) }; }

    // Is the angle behind square on the off side? (for the edge model)
    /*
     * Project a shot.
     *   phi:   direction (world field angle)
     *   speed: exit speed (m/s)
     *   loft:  launch elevation (radians). ~0 = along the ground.
     * Returns { runs, out, how, fielder, path:[{x,z}], landing, dist, kind }
     */
    project(phi, speed, loft, opts = {}) {
      const d = Field.dir(phi);
      const bd = boundaryDist(d.x, d.z);
      const g = 9.81;
      let res;
      if (loft > 0.12 && speed > 4) {
        // Airborne: carry with a touch of drag.
        const vy = speed * Math.sin(loft), vh = speed * Math.cos(loft);
        const hang = (2 * vy) / g * 0.94;
        const carry = vh * hang * (speed > 25 ? 0.8 : 0.88);
        const land = { x: d.x * carry, z: d.z * carry };
        // Catchable by anyone who can get under it in the hang time?
        let catcher = null, best = Infinity;
        for (const p of this.players) {
          const dist = Math.hypot(p.x - land.x, p.z - land.z);
          const reach = (p.name === 'keeper' ? 1.2 : 1.6) + 6.0 * Math.max(0, hang - (p.name === 'keeper' ? 0.2 : 0.55));
          const along = p.x * d.x + p.z * d.z;       // fielders "in front" only
          if (dist <= reach && along > -2 && dist < best) { best = dist; catcher = p; }
        }
        if (carry >= bd && (!catcher || carry > bd + 1)) {
          res = { runs: 6, out: false, how: 'six', kind: 'six' };
        } else if (catcher) {
          res = { runs: 0, out: true, how: 'caught', fielder: catcher.name, kind: 'caught' };
        } else {
          // Lands safely: then runs along the ground
          const roll = this._roll(phi, speed * 0.45, carry, bd);
          res = Object.assign(roll, { kind: roll.runs === 4 ? 'four' : roll.runs ? 'runs' : 'stopped', landed: carry });
        }
        res.landing = land;
        res.path = [{ x: 0, z: 0 }, { x: land.x, z: land.z }];
        if (res.kind === 'six') res.path = [{ x: 0, z: 0 }, { x: d.x * bd * 1.08, z: d.z * bd * 1.08 }];
        res.dist = carry;
        res.airborne = true;
        res.hang = hang;
      } else {
        res = this._roll(phi, speed, 0, bd, opts);
        res.airborne = false;
      }
      res.phi = phi;
      res.speed = speed;
      this.last = res;
      return res;
    }

    // Ground ball from distance d0 with speed v along phi.
    _roll(phi, v, d0, bd, opts = {}) {
      const d = Field.dir(phi);
      const decel = 3.0;                      // outfield friction (m/s^2)
      const stopDist = d0 + (v * v) / (2 * decel);
      // Earliest intercept
      let hit = null, hitS = Infinity;
      for (const p of this.players) {
        if (p.name === 'keeper' && d.z > -0.2) continue;
        const s = p.x * d.x + p.z * d.z;                 // along-path distance
        if (s < d0 - 1 || s > Math.min(stopDist, bd) + 1) continue;
        const perp = Math.abs(p.x * d.z - p.z * d.x);     // off-path distance
        // time for the ball to get there
        const sRel = Math.max(0, s - d0);
        const vAt = Math.sqrt(Math.max(0.01, v * v - 2 * decel * sRel));
        const tb = (v - vAt) / decel;
        let reach = 1.3 + 5.8 * Math.max(0, tb - 0.4) + (vAt < 8 ? 1.2 : 0);
        if (opts.pure && s < 40) reach *= 0.45;      // a pure strike beats the ring fielder
        if (perp <= reach && s < hitS) { hitS = s; hit = p; }
      }
      const path = [{ x: 0, z: 0 }];
      if (hit) {
        path.push({ x: d.x * hitS, z: d.z * hitS });
        const deep = hitS > 38;
        return { runs: deep ? 1 : 0, out: false, how: 'fielded', fielder: hit.name, kind: deep ? 'runs' : 'stopped', path, dist: hitS };
      }
      if (stopDist >= bd) {
        path.push({ x: d.x * bd, z: d.z * bd });
        return { runs: 4, out: false, how: 'four', kind: 'four', path, dist: bd };
      }
      path.push({ x: d.x * stopDist, z: d.z * stopDist });
      const runs = stopDist > 46 ? 3 : stopDist > 28 ? 2 : stopDist > 9 ? 1 : 0;
      return { runs, out: false, how: 'gap', kind: runs ? 'runs' : 'stopped', path, dist: stopDist };
    }

    // Name the region a shot goes to (for commentary), relative to the batter.
    regionName(phi) {
      // a: batter-relative angle, +off / -leg (degrees)
      const a = M.deg(this.hand === 'L' ? phi : -phi);
      const A = Math.abs(a);
      const side = a >= 0 ? 'off' : 'leg';
      if (A < 12) return 'straight back past the bowler';
      if (side === 'off') {
        if (A < 32) return 'past mid-off';
        if (A < 62) return 'through the covers';
        if (A < 100) return 'square through point';
        if (A < 140) return 'behind point';
        return 'down to third man';
      }
      if (A < 32) return 'past mid-on';
      if (A < 70) return 'through midwicket';
      if (A < 110) return 'square on the leg side';
      if (A < 150) return 'behind square';
      return 'fine down the leg side';
    }

    // ---- mini-map ----------------------------------------------------------
    // Top-down, matching the 3D view: bowler's end at the bottom, keeper at
    // the top, +x to the right.
    draw(ctx, W, H, opts = {}) {
      const B = BOUNDARY;
      const scale = (Math.min(W, H) / 2 - 6) / Math.max(B.rx, B.rz);
      const cx = W / 2, cy = H / 2;
      const X = (x) => cx + (x - B.cx) * scale;
      const Y = (z) => cy + (z - B.cz) * scale;
      ctx.clearRect(0, 0, W, H);
      // grass
      ctx.fillStyle = '#2f6a35';
      ctx.beginPath(); ctx.ellipse(cx, cy, B.rx * scale, B.rz * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.ellipse(cx, cy, 30 * scale, 34 * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, B.rx * scale - 1, B.rz * scale - 1, 0, 0, Math.PI * 2); ctx.stroke();
      // pitch
      ctx.fillStyle = '#c9b98a';
      ctx.fillRect(X(-1.5), Y(-1), 3 * scale, 22 * scale);
      // aim wedge
      if (opts.aimPhi != null) {
        const d = Field.dir(opts.aimPhi);
        const len = 58 * scale;
        const grd = ctx.createLinearGradient(X(0), Y(0), X(0) + d.x * len, Y(0) + d.z * len);
        grd.addColorStop(0, 'rgba(242,193,78,0.55)');
        grd.addColorStop(1, 'rgba(242,193,78,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        const w = 0.13;
        const d1 = Field.dir(opts.aimPhi - w), d2 = Field.dir(opts.aimPhi + w);
        ctx.lineTo(X(0) + d1.x * len, Y(0) + d1.z * len);
        ctx.lineTo(X(0) + d2.x * len, Y(0) + d2.z * len);
        ctx.closePath(); ctx.fill();
      }
      // fielders
      for (const p of this.players) {
        ctx.fillStyle = p.name === 'keeper' ? '#9ec5ff' : '#f6f1e3';
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.z), 3.2, 0, Math.PI * 2); ctx.fill();
      }
      // batter + bowler
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath(); ctx.arc(X(0), Y(0.8), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9534f';
      ctx.beginPath(); ctx.arc(X(-0.6), Y(21), 3, 0, Math.PI * 2); ctx.fill();
      // last shot
      const s = opts.shot;
      if (s && s.path && s.path.length > 1) {
        const a = s.path[0], b = s.path[s.path.length - 1];
        const t = M.clamp(opts.shotT == null ? 1 : opts.shotT, 0, 1);
        const ex = a.x + (b.x - a.x) * t, ez = a.z + (b.z - a.z) * t;
        const col = s.out ? '#ff6b6e' : s.kind === 'six' ? '#d6a4ff' : s.kind === 'four' ? '#8fc3ff' : '#ffe39a';
        ctx.strokeStyle = col; ctx.lineWidth = 2.2;
        ctx.setLineDash(s.airborne ? [4, 3] : []);
        ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.z)); ctx.lineTo(X(ex), Y(ez)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(X(ex), Y(ez), 3.2, 0, Math.PI * 2); ctx.fill();
        if (s.out && t >= 1) {
          ctx.strokeStyle = '#ff6b6e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(X(ex), Y(ez), 7, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
  }

  Field.FIELDS = FIELDS;
  Field.boundaryDist = boundaryDist;
  CLLM.Field = Field;
})();
