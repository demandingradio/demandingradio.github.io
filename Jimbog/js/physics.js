// Jimbog — collision world: axis-aligned boxes in a 2D spatial hash,
// fast ray casts (bullets, line of sight) and a character mover with
// stair step-up / step-down.
(function () {
  'use strict';
  const JB = window.JB;

  const CELL = 2;
  const EPS = 1e-4;
  const STEP = 0.45;

  class World {
    constructor(boxes, bounds) {
      this.boxes = boxes;
      this.x0 = bounds.x0 - 4; this.z0 = bounds.z0 - 4;
      this.nx = Math.ceil((bounds.x1 - bounds.x0 + 8) / CELL);
      this.nz = Math.ceil((bounds.z1 - bounds.z0 + 8) / CELL);
      this.cells = new Array(this.nx * this.nz);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
      this.stamp = new Uint32Array(boxes.length);
      this.cur = 1;
      boxes.forEach((b, k) => this._insert(b, k));
      this._hits = [];
    }
    _insert(b, k) {
      const i0 = Math.max(0, Math.floor((b.min[0] - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((b.max[0] - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((b.min[2] - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((b.max[2] - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i].push(k);
    }
    _next() { if (++this.cur > 0xfffffff0) { this.stamp.fill(0); this.cur = 1; } return this.cur; }

    // Collect boxes overlapping an AABB (strictly). Returns a shared array.
    overlap(x0, y0, z0, x1, y1, z1, ignore) {
      const out = this._hits; out.length = 0;
      const s = this._next();
      const i0 = Math.max(0, Math.floor((x0 - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((z0 - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = this.cells[j * this.nx + i];
        for (let n = 0; n < c.length; n++) {
          const k = c[n];
          if (this.stamp[k] === s) continue;
          this.stamp[k] = s;
          const b = this.boxes[k];
          if (ignore && (b.flags & ignore)) continue;
          if (b.max[0] > x0 + EPS && b.min[0] < x1 - EPS && b.max[1] > y0 + EPS && b.min[1] < y1 - EPS && b.max[2] > z0 + EPS && b.min[2] < z1 - EPS) out.push(b);
        }
      }
      return out;
    }

    // Ray cast. Returns {t, x,y,z, nx,ny,nz} or null. `ignore` skips flagged boxes.
    raycast(ox, oy, oz, dx, dy, dz, maxT, ignore) {
      const s = this._next();
      let best = maxT, bn = -1, bAxis = 0, bSign = 0;
      // DDA over the XZ grid
      let i = Math.floor((ox - this.x0) / CELL), j = Math.floor((oz - this.z0) / CELL);
      const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
      const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
      let tMaxX = dx !== 0 ? ((this.x0 + (i + (dx > 0 ? 1 : 0)) * CELL) - ox) / dx : Infinity;
      let tMaxZ = dz !== 0 ? ((this.z0 + (j + (dz > 0 ? 1 : 0)) * CELL) - oz) / dz : Infinity;
      let tCell = 0;
      for (let guard = 0; guard < 400; guard++) {
        if (i >= 0 && j >= 0 && i < this.nx && j < this.nz) {
          const c = this.cells[j * this.nx + i];
          for (let n = 0; n < c.length; n++) {
            const k = c[n];
            if (this.stamp[k] === s) continue;
            this.stamp[k] = s;
            const b = this.boxes[k];
            if (ignore && (b.flags & ignore)) continue;
            // slab test
            let tmin = 0, tmax = best, axis = -1, sign = 0;
            let ok = true;
            for (let a = 0; a < 3; a++) {
              const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
              if (Math.abs(d) < 1e-9) { if (o < b.min[a] || o > b.max[a]) { ok = false; break; } continue; }
              let t1 = (b.min[a] - o) / d, t2 = (b.max[a] - o) / d, sg = -1;
              if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
              if (t1 > tmin) { tmin = t1; axis = a; sign = sg; }
              if (t2 < tmax) tmax = t2;
              if (tmin > tmax) { ok = false; break; }
            }
            if (ok && axis >= 0 && tmin < best) { best = tmin; bn = k; bAxis = axis; bSign = sign; }
          }
        }
        // stop once the next cell starts beyond the best hit
        tCell = Math.min(tMaxX, tMaxZ);
        if (tCell > best) break;
        if (tMaxX < tMaxZ) { i += stepI; tMaxX += tDeltaX; } else { j += stepJ; tMaxZ += tDeltaZ; }
        if ((i < -1 || i > this.nx || j < -1 || j > this.nz)) break;
      }
      if (bn < 0) return null;
      const r = { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: 0, ny: 0, nz: 0, box: this.boxes[bn] };
      if (bAxis === 0) r.nx = bSign; else if (bAxis === 1) r.ny = bSign; else r.nz = bSign;
      return r;
    }

    // Line of sight between two points (bullets pass glass and rails).
    clear(ax, ay, az, bx, by, bz, ignore) {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) return true;
      return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L, ignore === undefined ? 3 : ignore);
    }

    // Highest box top under a point within [y - down, y + up].
    groundAt(x, y, z, r, up, down) {
      const hits = this.overlap(x - r, y - down, z - r, x + r, y + up, z + r, 0);
      let top = -Infinity;
      for (const b of hits) if (b.max[1] <= y + up + EPS && b.max[1] > top) top = b.max[1];
      return top;
    }

    // ---------------------------------------------------------- character mover
    // body: { pos: THREE.Vector3 (feet), vel, r, h, onGround }
    move(body, dt) {
      const p = body.pos, v = body.vel;
      body.stepUp = 0; body.snapDown = 0;
      const wasGround = body.onGround;
      this._axis(body, 0, v.x * dt, wasGround);
      this._axis(body, 2, v.z * dt, wasGround);
      // vertical
      const dy = v.y * dt;
      p.y += dy;
      body.onGround = false;
      const hits = this.overlap(p.x - body.r, p.y, p.z - body.r, p.x + body.r, p.y + body.h, p.z + body.r, 0);
      if (hits.length) {
        if (dy <= 0) {
          let top = -Infinity;
          for (const b of hits) top = Math.max(top, b.max[1]);
          if (top - p.y < body.h * 0.6) { p.y = top; body.onGround = true; if (v.y < 0) { body.landSpeed = -v.y; v.y = 0; } }
        } else {
          let bot = Infinity;
          for (const b of hits) bot = Math.min(bot, b.min[1]);
          p.y = bot - body.h - EPS; v.y = Math.min(0, v.y);
        }
      }
      // stick to stairs/ramps going down
      if (!body.onGround && wasGround && v.y <= 0.01) {
        const top = this.groundAt(p.x, p.y, p.z, body.r - 0.02, 0.01, STEP);
        if (top > -Infinity && p.y - top <= STEP) { body.snapDown = p.y - top; p.y = top; body.onGround = true; v.y = 0; }
      }
      if (!body.onGround) {
        const top = this.groundAt(p.x, p.y, p.z, body.r - 0.02, 0.01, 0.03);
        if (top > -Infinity && p.y - top <= 0.03) { p.y = top; body.onGround = true; if (v.y < 0) { body.landSpeed = -v.y; v.y = 0; } }
      }
    }
    _axis(body, a, d, canStep) {
      if (Math.abs(d) < 1e-7) return;
      const p = body.pos;
      const r = body.r;
      if (a === 0) p.x += d; else p.z += d;
      const hits = this.overlap(p.x - r, p.y, p.z - r, p.x + r, p.y + body.h, p.z + r, 0);
      if (!hits.length) return;
      let top = -Infinity;
      for (const b of hits) top = Math.max(top, b.max[1]);
      if (canStep && top - p.y <= STEP && top > p.y) {
        const free = this.overlap(p.x - r, top + EPS, p.z - r, p.x + r, top + body.h, p.z + r, 0).length === 0;
        if (free) { body.stepUp = Math.max(body.stepUp, top - p.y); p.y = top; return; }
      }
      // push back out along the movement axis
      if (d > 0) {
        let lim = Infinity;
        for (const b of hits) lim = Math.min(lim, b.min[a]);
        const np = lim - r - EPS;
        if (a === 0) p.x = Math.min(p.x, np); else p.z = Math.min(p.z, np);
      } else {
        let lim = -Infinity;
        for (const b of hits) lim = Math.max(lim, b.max[a]);
        const np = lim + r + EPS;
        if (a === 0) p.x = Math.max(p.x, np); else p.z = Math.max(p.z, np);
      }
      if (a === 0) body.vel.x = 0; else body.vel.z = 0;
      body.blocked = true;
    }
    // Can a body of height h stand here?
    fits(x, y, z, r, h) { return this.overlap(x - r, y + 0.01, z - r, x + r, y + h, z + r, 0).length === 0; }

    // ---------------------------------------------------------- bouncing sphere
    // Returns true if it hit something this step.
    bounce(o, dt, restitution) {
      let hit = false;
      const steps = Math.ceil(Math.max(Math.abs(o.vel.x), Math.abs(o.vel.y), Math.abs(o.vel.z)) * dt / 0.08) || 1;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (let a = 0; a < 3; a++) {
          const key = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
          const d = o.vel[key] * h;
          o.pos[key] += d;
          const r = o.r;
          const hits = this.overlap(o.pos.x - r, o.pos.y - r, o.pos.z - r, o.pos.x + r, o.pos.y + r, o.pos.z + r, 0);
          if (hits.length) {
            o.pos[key] -= d;
            o.vel[key] *= -restitution;
            const other = a === 1 ? 0.7 : 0.85;
            for (const k of ['x', 'y', 'z']) if (k !== key) o.vel[k] *= other;
            hit = true;
            if (a === 1 && d < 0 && Math.abs(o.vel.y) < 0.8) { o.vel.y = 0; o.rest = true; }
          }
        }
      }
      return hit;
    }
  }

  JB.World = World;
  JB.STEP = STEP;
})();
