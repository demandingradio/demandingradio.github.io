/*
 * CAMERA
 * ======
 * A plain pinhole camera that projects world points (metres) to canvas pixels.
 * Everything in the game is drawn with 2D canvas calls on projected points,
 * so this is the whole "3D engine".
 */
(function () {
  const CLLM = window.CLLM;
  const { V } = CLLM;

  class Camera {
    constructor() {
      this.pos = V.v(0, 2.9, 31);
      this.target = V.v(0, 0.7, 0);
      this.fov = 24;             // vertical field of view, degrees
      this.w = 800; this.h = 600;
      this.near = 0.25;
      this.shake = 0;
      this._basis();
    }

    setViewport(w, h) { this.w = w; this.h = h; this._basis(); }

    set(pos, target, fov) {
      this.pos = pos; this.target = target;
      if (fov) this.fov = fov;
      this._basis();
    }

    _basis() {
      const f = V.norm(V.sub(this.target, this.pos));
      const r = V.norm(V.cross(f, V.v(0, 1, 0)));
      const u = V.cross(r, f);
      this.f = f; this.r = r; this.u = u;
      // Keep the lane comfortably framed on tall (portrait) screens by
      // widening the vertical fov when the aspect gets narrow.
      const aspect = this.w / Math.max(1, this.h);
      let fov = this.fov;
      if (this.hfov) {
        // Show at least `fov` vertically AND `hfov` horizontally (whichever
        // needs the wider view): landscape fits the height, a phone the width.
        this.focal = Math.min((this.h / 2) / Math.tan((this.fov * Math.PI) / 360), (this.w / 2) / Math.tan((this.hfov * Math.PI) / 360));
      } else {
        if (aspect < 1.25) fov = this.fov * Math.min(1.9, 1.25 / aspect);
        this.focal = (this.h / 2) / Math.tan((fov * Math.PI) / 360);
      }
      this.cx = this.w / 2; this.cy = this.h / 2;
    }

    // Camera-space depth of a world point (metres along the view direction).
    depth(p) { return V.dot(V.sub(p, this.pos), this.f); }

    // Project a world point. Returns {x, y, z(depth), s(pixels per metre)} or
    // null if behind the near plane.
    project(p) {
      const d = V.sub(p, this.pos);
      const cz = V.dot(d, this.f);
      if (cz < this.near) return null;
      const k = this.focal / cz;
      return {
        x: this.cx + V.dot(d, this.r) * k,
        y: this.cy - V.dot(d, this.u) * k,
        z: cz,
        s: k,
      };
    }

    // Project, clamping behind-camera points onto the near plane (for lines).
    projectClamped(p) {
      const d = V.sub(p, this.pos);
      let cz = V.dot(d, this.f);
      if (cz < this.near) cz = this.near;
      const k = this.focal / cz;
      return { x: this.cx + V.dot(d, this.r) * k, y: this.cy - V.dot(d, this.u) * k, z: cz, s: k };
    }

    // Clip a segment against the near plane, then project both ends.
    segment(a, b) {
      const da = this.depth(a), db = this.depth(b);
      if (da < this.near && db < this.near) return null;
      let A = a, B = b;
      if (da < this.near) A = V.lerp(a, b, (this.near - da) / (db - da));
      else if (db < this.near) B = V.lerp(b, a, (this.near - db) / (da - db));
      return [this.projectClamped(A), this.projectClamped(B)];
    }

    // Screen y of the horizon (ground at infinity straight ahead).
    horizonY() {
      const far = V.add(this.pos, V.mul(V.norm(V.v(this.f.x, 0, this.f.z)), 20000));
      far.y = 0;
      const p = this.project(far);
      return p ? p.y : this.cy;
    }

    // Inverse: screen pixel -> point on the ground plane (y = h). Used for
    // mouse-aiming at the pitch when bowling.
    unprojectToPlane(sx, sy, h = 0) {
      const dx = (sx - this.cx) / this.focal;
      const dy = -(sy - this.cy) / this.focal;
      const dir = V.norm(V.add(this.f, V.add(V.mul(this.r, dx), V.mul(this.u, dy))));
      if (Math.abs(dir.y) < 1e-6) return null;
      const t = (h - this.pos.y) / dir.y;
      if (t <= 0) return null;
      return V.add(this.pos, V.mul(dir, t));
    }
  }

  CLLM.Camera = Camera;
})();
