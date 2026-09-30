/*
 * MATCH CAM
 * =========
 * The camera while a match ball is live.
 *
 * The delivery view holds for 0.3 s of REAL time after contact (you see it
 * leave the bat; hit-stop and slow-mo don't stretch that). Then it either
 * stays (a block, a leave, a keeper take: short, and nobody calls) or CUTS,
 * never pans, to one fixed high camera behind the end you were watching
 * from. That pose sees the whole rope and is never mirrored or swapped for
 * where the ball went, so left stays left. It follows only by crop & zoom
 * (Camera.setView): the scenery is drawn once for the pose and re-used
 * (World._groundStatic), so following costs no re-render.
 *
 *   const mc = new CLLM.MatchCam(game)
 *   mc.start(ball, fs, 'bat' | 'bowl')   at contact
 *   mc.forceCut()                        a RUN press: cut once the hold is over
 *   mc.update(dt)                        every frame while live (game dt)
 *   mc.stop()                            dead ball: zoom 1 (the session then
 *                                        calls game._setCamera() for the next ball)
 *   mc.active                            the camera is ours (session.camOverride)
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M } = CLLM;

  // CFG.MATCH.CAM (config.js loads after this file, so it is read at call time)
  const DEF = {
    hold: 0.30, noCutTravel: 12, noCutCall: 0.5,
    bat: { pos: [0, 42, -96], tgt: [0, 0, 4], fov: 54, hfov: 64 },
    bowl: { pos: [0, 46, 116], tgt: [0, 0, 16], fov: 54, hfov: 64 },
    kMin: 1, kMax: 2.6, kStart: 1.6, omega: 4, fit: 0.7,
    wBall: 0.5, wChaser: 0.25, wPitch: 0.25,
  };
  function cfg() {
    const C = CLLM.CFG && CLLM.CFG.MATCH && CLLM.CFG.MATCH.CAM;
    return C ? Object.assign({}, DEF, C) : DEF;
  }
  const vec = (a) => (Array.isArray(a) ? V.v(a[0], a[1], a[2]) : V.v(a.x, a.y, a.z));
  const endZ = (e) => ((CLLM.FieldSim && CLLM.FieldSim.END_Z) || [0, 20.12])[e];
  const PITCH_MID = V.v(0, 0, 10);
  const STUMPS_IN = [V.v(0, 0, 0.5), V.v(0, 0, 19.6)];

  // One step of a critically damped spring toward `to`, solved exactly: no
  // overshoot, and a long frame can't make it blow up. Returns [x, v].
  function spring(x, v, to, w, h) {
    const y = x - to, c = v + w * y, e = Math.exp(-w * h);
    return [to + (y + c * h) * e, (v - w * c * h) * e];
  }

  class MatchCam {
    constructor(game) {
      this.game = game;
      this.on = false; this.cut = false; this.forced = false;
      this.base = new CLLM.Camera();       // the follow pose at zoom 1: what the scenery cache holds
      this.c = { x: 0, y: 0 }; this.cv = { x: 0, y: 0 };   // framing centre, in base pixels
      this.z = 1; this.zv = 0;
    }

    get active() { return this.on && this.cut; }

    start(ball, fs, side) {
      if (this.cut) this.stop();           // never left following from the last ball
      this.on = true; this.cut = false; this.forced = false;
      this.ball = ball; this.fs = fs; this.side = side === 'bowl' ? 'bowl' : 'bat';
      this.t0 = this.game.realTime || 0;
      this.travel = undefined;             // measured once, when the hold ends
    }

    forceCut() { this.forced = true; }

    stop() {
      this.on = false; this.cut = false; this.forced = false;
      // Back to zoom 1. cam.crop stays set until the next cam.set() (the
      // session's game._setCamera()), so any frame drawn in between is still
      // served from the cached follow pose rather than re-rendered.
      this.game.cam.setView(1, 0, 0);
    }

    update(dt) {
      if (!this.on) return;
      const C = cfg(), cam = this.game.cam;
      if (!this.cut) {
        if ((this.game.realTime || 0) - this.t0 < C.hold) return;
        if (this.travel === undefined) this.travel = this._travel();
        if (!this._wantCut(C)) return;
        this._cut(C);
      } else if (this.base.w !== cam.w || this.base.h !== cam.h) this._recut(C);
      this._follow(C, dt);
    }

    // ---- the no-cut rule ------------------------------------------------------------
    // How far it will go on its own (m from the popping crease), or null when
    // it is not free (already in someone's hands).
    _travel() {
      const fs = this.fs, b = this.ball;
      if (!fs || !b || b.mode !== 'free') return null;
      let p = null;
      if (typeof fs.predictEnd === 'function') p = fs.predictEnd(5);
      else if (typeof fs._predict === 'function') {       // before FieldSim.predictEnd existed
        const S = fs._predict(5);
        p = S && S.length ? S[S.length - 1].p : null;
      }
      return p ? Math.hypot(p.x, p.z - 1.2) : null;
    }

    // Cut the moment anyone calls (or there's news), on a RUN press, or when
    // it's going somewhere. Blocks, leaves and keeper takes stay put.
    _wantCut(C) {
      const fs = this.fs;
      if (this.forced) return true;
      if (fs.want > 0 || fs.runsRun > 0 || fs.misfield != null || fs.thrown) return true;
      // a miss the keeper is taking (it's past you: nothing to follow)
      const taker = fs.holder || fs.prim;
      if (fs.hit === false && (!taker || taker.role === 'keeper')) return false;
      return this.travel != null && this.travel >= C.noCutTravel;
    }

    // ---- cutting and following ------------------------------------------------------
    _q(p) {
      return this.base.project(p) || { x: this.base.w / 2, y: this.base.h / 2 };
    }

    _ballPt() {
      const p = this.ball.pos;
      return V.v(p.x, Math.min(p.y, 12), p.z);
    }

    // Put the camera on the fixed pose (zoom 1); `this.base` is the same pose
    // kept at zoom 1 for framing maths.
    _pose(C) {
      const cam = this.game.cam, base = this.base, P = C[this.side] || DEF[this.side];
      base.hfov = P.hfov; base.zoom = 1; base.ox = 0; base.oy = 0; base.dolly = 0;
      base.w = cam.w; base.h = cam.h;
      base.set(vec(P.pos), vec(P.tgt), P.fov);
      cam.hfov = P.hfov; cam.dolly = 0; cam.zoom = 1; cam.ox = 0; cam.oy = 0;
      cam.set(vec(P.pos), vec(P.tgt), P.fov);
      cam.crop = true;                     // World: a crop of this one pose, never re-rendered
    }

    _cut(C) {
      this._pose(C);
      const q = this._q(this._ballPt()), m = this._q(PITCH_MID);
      this.c = { x: (q.x + m.x) / 2, y: (q.y + m.y) / 2 }; this.cv = { x: 0, y: 0 };
      this.z = C.kStart; this.zv = 0;
      this.cut = true;
    }

    // The viewport changed: same pose, same spot on the ground in the middle,
    // same zoom.
    _recut(C) {
      const g = this.base.unprojectToPlane(this.c.x, this.c.y, 0);
      this._pose(C);
      const q = g && this.base.project(g);
      this.c = q ? { x: q.x, y: q.y } : { x: this.base.w / 2, y: this.base.h / 2 };
      this.cv = { x: 0, y: 0 };
    }

    _follow(C, dt) {
      const cam = this.game.cam, fs = this.fs, W = cam.w, H = cam.h;
      const ball = this._ballPt();
      // the man going for it (or holding it); once thrown, the end it's going to
      const ch = fs.holder || (!fs.thrown && fs.prim) || null;
      const chPt = ch && ch.pos ? V.v(ch.pos.x, 0, ch.pos.z) : null;
      const endPt = fs.thrown && fs.throwEnd != null ? V.v(0, 0, endZ(fs.throwEnd)) : null;
      const qb = this._q(ball), qm = this._q(PITCH_MID);
      const qc = chPt ? this._q(chPt) : endPt ? this._q(endPt) : qm;
      const wt = C.wBall + C.wChaser + C.wPitch || 1;
      const want = {
        x: (C.wBall * qb.x + C.wChaser * qc.x + C.wPitch * qm.x) / wt,
        y: (C.wBall * qb.y + C.wChaser * qc.y + C.wPitch * qm.y) / wt,
      };
      // zoom so the ball, both sets of stumps and the chaser fit
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of [ball, STUMPS_IN[0], STUMPS_IN[1], chPt]) {
        const q = p && this.base.project(p);
        if (!q) continue;
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
      }
      const kWant = x1 > x0 ? M.clamp(Math.min((C.fit * W) / Math.max(30, x1 - x0), (C.fit * H) / Math.max(30, y1 - y0)), C.kMin, C.kMax) : this.z;
      const w = C.omega, h = Math.max(0, Math.min(dt || 0, 0.05));
      [this.c.x, this.cv.x] = spring(this.c.x, this.cv.x, want.x, w, h);
      [this.c.y, this.cv.y] = spring(this.c.y, this.cv.y, want.y, w, h);
      [this.z, this.zv] = spring(this.z, this.zv, kWant, w, h);
      this.z = M.clamp(this.z, C.kMin, C.kMax);
      const z = this.z;
      const ox = M.clamp(-z * (this.c.x - W / 2), (-(z - 1) * W) / 2, ((z - 1) * W) / 2);
      const oy = M.clamp(-z * (this.c.y - H / 2), (-(z - 1) * H) / 2, ((z - 1) * H) / 2);
      cam.setView(z, ox, oy);
    }
  }

  CLLM.MatchCam = MatchCam;
})();
