/*
 * BOWLER ANIMATION
 * ================
 * Drives a Figure through: stand at the mark -> run-up (a list of footfalls)
 * -> bound/gather -> back-foot contact -> front-foot contact -> release ->
 * follow-through.
 *
 * The run-up is just a list of footfall times, so the same animation serves
 * the AI bowler (evenly accelerating footfalls) and the player's rhythm
 * run-up (footfalls placed wherever the player actually tapped).
 *
 * Everything is authored for a RIGHT-arm bowler bowling over the wicket
 * (running in on the -x side of the stumps, toward -z).
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M } = CLLM;

  const STYLE = {
    pace: { strides: 9, strideMin: 1.45, strideMax: 2.15, periodStart: 0.36, periodEnd: 0.27, bound: 0.34, boundLen: 1.7, boundH: 0.32,
            bfcToFfc: 0.12, ffcToRel: 0.065, relH: 2.0, relZ: 19.22, relX: -0.36, lean: 0.2, bfcZ: 20.35, ffcZ: 19.08, runX: -0.78, bob: 0.06, knee: 0.34 },
    off:  { strides: 5, strideMin: 0.95, strideMax: 1.2, periodStart: 0.42, periodEnd: 0.36, bound: 0.22, boundLen: 0.9, boundH: 0.14,
            bfcToFfc: 0.16, ffcToRel: 0.09, relH: 2.0, relZ: 19.36, relX: -0.33, lean: 0.14, bfcZ: 20.12, ffcZ: 19.16, runX: -0.7, bob: 0.035, knee: 0.22 },
    leg:  { strides: 5, strideMin: 0.9, strideMax: 1.15, periodStart: 0.44, periodEnd: 0.37, bound: 0.2, boundLen: 0.85, boundH: 0.12,
            bfcToFfc: 0.17, ffcToRel: 0.1, relH: 1.97, relZ: 19.38, relX: -0.4, lean: 0.12, bfcZ: 20.1, ffcZ: 19.18, runX: -0.72, bob: 0.03, knee: 0.2 },
  };

  // Blend two pose-driver objects (vectors lerped, facings lerped).
  function lerpPose(a, b, u) {
    const L = (x, y) => (x && y ? V.lerp(x, y, u) : y || x);
    const F = (x, y) => (x && y ? { x: M.lerp(x.x, y.x, u), z: M.lerp(x.z, y.z, u) } : y || x);
    return Object.assign({}, b, {
      pelvis: L(a.pelvis, b.pelvis), lean: L(a.lean, b.lean), lookAt: L(a.lookAt, b.lookAt),
      lFoot: L(a.lFoot, b.lFoot), rFoot: L(a.rFoot, b.rFoot), lHand: L(a.lHand, b.lHand), rHand: L(a.rHand, b.rHand),
      lToe: L(a.lToe, b.lToe), rToe: L(a.rToe, b.rToe),
      facing: F(a.facing, b.facing), chestFacing: F(a.chestFacing || a.facing, b.chestFacing || b.facing),
    });
  }

  class BowlerAnim {
    constructor(fig, type) {
      this.fig = fig;
      this.setType(type || 'pace');
      this.steps = [];
      this.tRelease = Infinity;
      this.released = false;
    }

    setType(type) {
      this.type = type;
      this.S = STYLE[type];
    }

    // Where the ball leaves the hand (canonical frame, before mirroring).
    releasePoint() {
      const S = this.S;
      const p = V.v(S.relX, S.relH, S.relZ);
      return this.fig.mirror ? V.v(-p.x, p.y, p.z) : p;
    }

    // Build footfall positions (z) for the run-up, ending at the take-off
    // footfall just before the bound.
    _positions(n) {
      const S = this.S;
      const takeoffZ = S.bfcZ + S.boundLen;
      const zs = [takeoffZ];
      for (let i = 1; i < n; i++) {
        const k = i / Math.max(1, n - 1);
        zs.unshift(zs[0] + M.lerp(S.strideMax, S.strideMin, k));
      }
      return zs;
    }

    // AI / demo: evenly accelerating strides, run-up starting at tStart.
    autoSchedule(tStart) {
      const S = this.S, n = S.strides;
      const zs = this._positions(n);
      const times = [];
      let t = tStart + 0.35;
      for (let i = 0; i < n; i++) {
        times.push(t);
        t += M.lerp(S.periodStart, S.periodEnd, i / Math.max(1, n - 1));
      }
      this.setSteps(times, zs, tStart);
    }

    // Rhythm run-up: footfall times provided by the controller. zs optional.
    setSteps(times, zs, tStart) {
      const S = this.S;
      if (!zs) zs = this._positions(times.length);
      this.tStart = tStart != null ? tStart : times[0] - 0.4;
      this.steps = times.map((t, i) => ({ t, z: zs[i], foot: (times.length - 1 - i) % 2 === 0 ? 'l' : 'r' }));
      const last = times[times.length - 1];
      this.tBFC = last + S.bound;
      this.tFFC = this.tBFC + S.bfcToFfc;
      this.tRelease = this.tFFC + S.ffcToRel;
      this.tEnd = this.tRelease + 1.3;
      this.released = false;
      this.ballGone = false;
    }

    // Predicted times of the remaining pieces, given where the run-up ends.
    // Used by the rhythm controller to schedule the delivery stride.
    static styleOf(type) { return STYLE[type]; }

    runX(z) {
      const S = this.S;
      return M.lerp(S.runX, -0.6, M.clamp(M.invLerp(this.steps.length ? this.steps[0].z : 30, S.bfcZ, z), 0, 1));
    }

    // Compute the pose at time t and solve the figure.
    pose(t) {
      const S = this.S;
      const steps = this.steps;
      const fig = this.fig;
      let p;
      if (!steps.length || t < steps[0].t) {
        p = this._idle(t, steps.length ? steps[0].z + 0.05 : 30);
      } else if (t < steps[steps.length - 1].t + 1e-6 || t < this.tBFC - S.bound) {
        p = this._run(t);
        // ease out of the standing pose over the first stride
        const u = (t - steps[0].t) / 0.22;
        if (u < 1) p = lerpPose(this._idle(steps[0].t, steps[0].z + 0.05), p, M.smooth(u));
      } else {
        p = this._delivery(Math.min(t, this.tEnd));
      }
      fig.solve(p);
      // Ball in hand until release
      fig.ball = t < this.tRelease && !this.ballGone ? fig.J.rHand : null;
      return p;
    }

    _idle(t, z) {
      const x = this.S.runX - 0.05;
      const sway = Math.sin(t * 2.2) * 0.02;
      return {
        pelvis: V.v(x, 0.98 + sway * 0.3, z),
        facing: { x: 0.05, z: -1 },
        lean: V.v(0, 0, -0.04),
        lookAt: V.v(0, 1.2, 0),
        lFoot: V.v(x - 0.12, 0.08, z - 0.12), rFoot: V.v(x + 0.12, 0.08, z + 0.1),
        lToe: V.v(0, 0, -1), rToe: V.v(0.2, 0, -1),
        lHand: V.v(x - 0.28, 1.0, z - 0.05), rHand: V.v(x + 0.1, 1.18, z - 0.28),
      };
    }

    // Procedural running between footfalls.
    _run(t) {
      const S = this.S, st = this.steps;
      let i = 0;
      while (i < st.length - 1 && st[i + 1].t <= t) i++;
      const a = st[i];
      const b = st[i + 1] || { t: a.t + S.periodEnd, z: a.z - S.strideMax * 0.9 };
      const u = M.clamp((t - a.t) / Math.max(0.05, b.t - a.t), 0, 1);
      const zc = M.lerp(a.z, b.z, u);            // body centre travels between footfalls
      const x = this.runX(zc);
      // Planted foot = the one that landed at a; swing foot travels to b.
      const prev = st[i - 1] || { z: a.z + (a.z - b.z) };
      const plantedZ = a.z;
      const swingFrom = prev.z, swingTo = b.z;
      const lift = Math.sin(u * Math.PI);
      const swingZ = M.lerp(swingFrom, swingTo, M.easeInOut(u));
      const planted = V.v(x + (a.foot === 'l' ? -0.1 : 0.1), 0.08 + 0.02 * Math.max(0, u - 0.6), plantedZ);
      const swing = V.v(x + (a.foot === 'l' ? 0.1 : -0.1), 0.08 + S.knee * 0.55 * lift, swingZ);
      const lFoot = a.foot === 'l' ? planted : swing;
      const rFoot = a.foot === 'l' ? swing : planted;
      const bob = Math.cos(u * Math.PI * 2) * S.bob;
      const pel = V.v(x, 0.97 + bob, zc + 0.05);
      // Arms swing opposite to legs
      const arm = (a.foot === 'l' ? 1 : -1) * Math.cos(u * Math.PI);
      const nearEnd = M.clamp(M.invLerp(st.length - 3, st.length - 1, i + u), 0, 1);
      const lHand = V.v(x - 0.28, 1.05 + 0.12 * Math.abs(arm), zc - 0.28 * arm);
      // Bowling hand gradually comes up to the chest to hold the ball near the end
      const rRun = V.v(x + 0.26, 1.05 + 0.12 * Math.abs(arm), zc + 0.28 * arm);
      const rHold = V.v(x + 0.06, 1.45, zc - 0.22);
      const rHand = V.lerp(rRun, rHold, nearEnd * 0.8);
      return {
        pelvis: pel,
        facing: { x: 0, z: -1 },
        lean: V.v(0, 0, -S.lean * 0.9),
        lookAt: V.v(0, 1.0, 0),
        lFoot, rFoot,
        lToe: V.v(0, 0, -1), rToe: V.v(0, 0, -1),
        lHand, rHand,
      };
    }

    // Keyframed delivery stride: bound -> BFC -> FFC -> release -> follow-through.
    _delivery(t) {
      const S = this.S;
      const st = this.steps;
      const last = st[st.length - 1];
      const tT = last.t;                   // take-off
      const R = V.v(S.relX, S.relH, S.relZ);
      const bx = -0.6;
      // Key 0 is exactly the last running pose, so there's no seam at take-off
      if (!this._run0 || this._run0.t !== tT) this._run0 = { t: tT, p: this._run(tT - 1e-4) };
      const r0 = this._run0.p;
      const keys = [
        { t: tT, pel: r0.pelvis, face: -Math.PI / 2, chest: -Math.PI / 2, lean: r0.lean,
          lF: r0.lFoot, rF: r0.rFoot, lH: r0.lHand, rH: r0.rHand },
        { t: tT + S.bound * 0.55, pel: V.v(bx - 0.02, 0.97 + S.boundH, M.lerp(last.z, S.bfcZ, 0.55)), face: -0.3, chest: -0.1, lean: V.v(0.04, 0, -0.02),
          lF: V.v(bx - 0.05, 0.08 + S.boundH + 0.2, M.lerp(last.z, S.bfcZ, 0.6) - 0.35), rF: V.v(bx + 0.08, 0.08 + S.boundH * 0.8, M.lerp(last.z, S.bfcZ, 0.5) + 0.25),
          lH: V.v(bx - 0.2, 2.05, M.lerp(last.z, S.bfcZ, 0.55) - 0.35), rH: V.v(bx + 0.02, 1.6, M.lerp(last.z, S.bfcZ, 0.55) - 0.05) },
        { t: this.tBFC, pel: V.v(bx, 0.98, S.bfcZ - 0.18), face: 0.05, chest: 0.1, lean: V.v(0.06, 0, 0.1),
          lF: V.v(bx + 0.02, 0.35, S.bfcZ - 0.6), rF: V.v(bx - 0.02, 0.08, S.bfcZ),
          lH: V.v(bx - 0.1, 2.1, S.bfcZ - 0.55), rH: V.v(bx + 0.05, 0.95, S.bfcZ + 0.35) },
        { t: this.tFFC, pel: V.v(bx + 0.05, 0.93, (S.bfcZ + S.ffcZ) / 2), face: -0.5, chest: -0.7, lean: V.v(0.02, 0, -0.02),
          lF: V.v(bx + 0.12, 0.08, S.ffcZ), rF: V.v(bx - 0.02, 0.12, S.bfcZ),
          lH: V.v(bx - 0.4, 1.35, S.ffcZ + 0.35), rH: V.v(R.x - 0.05, 1.95, (S.bfcZ + S.ffcZ) / 2 + 0.45) },
        { t: this.tRelease, pel: V.v(bx + 0.08, 0.95, S.ffcZ + 0.22), face: -1.2, chest: -1.45, lean: V.v(0.0, 0, -S.lean - 0.08),
          lF: V.v(bx + 0.12, 0.08, S.ffcZ), rF: V.v(bx - 0.05, 0.2, S.bfcZ - 0.25),
          lH: V.v(bx - 0.28, 1.05, S.ffcZ + 0.25), rH: R },
        { t: this.tRelease + 0.16, pel: V.v(bx - 0.05, 0.9, S.ffcZ - 0.25), face: -1.4, chest: -1.9, lean: V.v(-0.05, 0, -S.lean - 0.12),
          lF: V.v(bx + 0.12, 0.08, S.ffcZ), rF: V.v(bx - 0.1, 0.35, S.ffcZ - 0.35),
          lH: V.v(bx - 0.35, 1.0, S.ffcZ + 0.5), rH: V.v(bx - 0.45, 0.85, S.ffcZ - 0.55) },
        { t: this.tRelease + 0.5, pel: V.v(bx - 0.45, 0.96, S.ffcZ - 1.5), face: -1.6, chest: -1.7, lean: V.v(0, 0, -0.1),
          lF: V.v(bx - 0.35, 0.2, S.ffcZ - 1.3), rF: V.v(bx - 0.55, 0.08, S.ffcZ - 1.75),
          lH: V.v(bx - 0.65, 1.05, S.ffcZ - 1.2), rH: V.v(bx - 0.2, 1.0, S.ffcZ - 1.75) },
        { t: this.tRelease + 1.1, pel: V.v(bx - 0.95, 0.98, S.ffcZ - 2.6), face: -2.2, chest: -2.3, lean: V.v(0, 0, 0),
          lF: V.v(bx - 0.9, 0.08, S.ffcZ - 2.45), rF: V.v(bx - 1.05, 0.08, S.ffcZ - 2.75),
          lH: V.v(bx - 1.2, 1.0, S.ffcZ - 2.5), rH: V.v(bx - 0.7, 1.0, S.ffcZ - 2.7) },
      ];
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
      const A = keys[i], B = keys[i + 1];
      const u = M.clamp((t - A.t) / Math.max(1e-3, B.t - A.t), 0, 1);
      const e = M.easeInOut(u);
      const L = (a, b) => V.lerp(a, b, e);
      // Bowling hand: arc over the top between FFC and just after release
      let rH = L(A.rH, B.rH);
      if (A.t >= this.tFFC - 1e-6 && B.t <= this.tRelease + 0.17) {
        // swing around the shoulder: circular interpolation in the y-z plane
        const sh = V.v(-0.42, 1.52, M.lerp(A.pel.z, B.pel.z, e));
        const ang = (p) => Math.atan2(p.z - sh.z, -(p.y - sh.y)); // 0 = down, +pi/2 = back
        let a0 = ang(A.rH), a1 = ang(B.rH);
        while (a1 < a0) a1 += Math.PI * 2;
        const lu = M.clamp((t - A.t) / Math.max(1e-3, B.t - A.t), 0, 1);
        const aa = M.lerp(a0, a1, lu);
        const r = M.lerp(V.dist(A.rH, sh), V.dist(B.rH, sh), lu);
        rH = V.v(M.lerp(A.rH.x, B.rH.x, lu), sh.y - Math.cos(aa) * r, sh.z + Math.sin(aa) * r);
        if (Math.abs(t - this.tRelease) < 1e-6) rH = B.rH;
      }
      const face = M.lerp(A.face, B.face, e), chest = M.lerp(A.chest, B.chest, e);
      // face angle: 0 = facing +x (side-on), -pi/2 = facing -z (at the batter)
      return {
        pelvis: L(A.pel, B.pel),
        facing: { x: Math.cos(face), z: Math.sin(face) },
        chestFacing: { x: Math.cos(chest), z: Math.sin(chest) },
        lean: L(A.lean, B.lean),
        lookAt: V.v(0, 0.8, 1),
        lFoot: L(A.lF, B.lF), rFoot: L(A.rF, B.rF),
        lToe: V.v(0.3, 0, -1), rToe: V.v(0.6, 0, -1),
        lHand: L(A.lH, B.lH), rHand: rH,
        rElbowPole: V.v(0.6, -0.3, 0.4),
      };
    }
  }

  CLLM.BowlerAnim = BowlerAnim;
})();
