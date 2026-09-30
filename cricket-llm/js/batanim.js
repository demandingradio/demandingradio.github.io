/*
 * BATTER ANIMATION
 * ================
 * Poses for the batter, authored in the canonical RIGHT-HANDED frame
 * (batter faces -x = off side, left shoulder points up the pitch at +z).
 *
 * A pose is: pelvis, facing, chest facing, lean, feet, and the bat
 * (grip point, blade direction, face normal). Hands are derived from the bat
 * grip and the arms are IK-solved by Figure.
 *
 * Layers: stance -> backlift (auto, as the bowler releases) -> footwork
 * (front / back / none) -> shot swing keyed around the contact instant.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M } = CLLM;

  const v = V.v;
  const nz = (x, y, z) => V.norm(v(x, y, z));

  // Feet + body for each footwork option.
  // Facing angles: a = -PI faces the off side (-x); a = -PI - d opens the
  // chest toward the bowler (+z) by d radians.
  const FEET = {
    stance: { pel: v(0.25, 0.9, 1.22), lF: v(0.2, 0.08, 1.52), rF: v(0.25, 0.08, 0.98), face: -Math.PI - 0.12, chest: -Math.PI - 0.3, lean: v(-0.09, -0.03, 0.02) },
    front:  { pel: v(0.16, 0.84, 1.62), lF: v(0.06, 0.08, 2.18), rF: v(0.25, 0.1, 1.0), face: -Math.PI - 0.25, chest: -Math.PI - 0.4, lean: v(-0.08, -0.06, 0.2) },
    back:   { pel: v(0.14, 0.93, 1.02), lF: v(0.16, 0.1, 1.28), rF: v(0.04, 0.08, 0.8), face: -Math.PI - 0.3, chest: -Math.PI - 0.5, lean: v(-0.04, -0.01, -0.02) },
    // charging down the track to a spinner
    dance:  { pel: v(0.12, 0.84, 2.45), lF: v(0.02, 0.08, 2.95), rF: v(0.2, 0.1, 1.9), face: -Math.PI - 0.3, chest: -Math.PI - 0.5, lean: v(-0.08, -0.05, 0.2) },
    // sweep: front knee bent low, back knee on the ground
    sweep:  { pel: v(0.2, 0.55, 1.62), lF: v(0.02, 0.08, 2.15), rF: v(0.3, 0.1, 0.95), face: -Math.PI - 0.25, chest: -Math.PI - 0.6, lean: v(-0.12, -0.05, 0.22) },
  };

  // Bat keys: grip position + direction (grip -> toe) + face normal.
  const BAT = {
    stance:   { g: v(0.05, 0.8, 1.22), d: nz(-0.07, -0.73, -0.17), f: nz(-0.25, 0, 1) },
    backlift: { g: v(0.2, 1.18, 0.98), d: nz(-0.08, 0.4, -0.75), f: nz(-1, -0.2, 0) },
    leave:    { g: v(0.26, 1.72, 1.05), d: nz(-0.2, 0.75, -0.55), f: nz(-1, 0, 0) },
  };

  class BatterAnim {
    constructor(fig) {
      this.fig = fig;
      this.reset();
    }

    reset() {
      this.foot = 'stance';     // target footwork
      this.footT0 = 0;          // when footwork started
      this.footFrom = FEET.stance;
      this.backliftT = Infinity;
      this.shot = null;         // { keys:[{t (rel. contact), g, d, f}], tContact, footKey, look }
      this.leaving = false;
      this.fallT = null;
    }

    startBacklift(t) { if (this.backliftT === Infinity) this.backliftT = t; }

    setFoot(key, t) {
      if (this.foot === key) return;
      this.footFrom = this._feetAt(t);
      this.foot = key;
      this.footT0 = t;
    }

    playShot(shot) { this.shot = shot; }

    _feetAt(t) {
      const to = FEET[this.foot];
      const dur = this.foot === 'dance' ? 0.42 : 0.2;
      const u = M.easeOut((t - this.footT0) / dur);
      const f = this.footFrom;
      return {
        pel: V.lerp(f.pel, to.pel, u), lF: V.lerp(f.lF, to.lF, u), rF: V.lerp(f.rF, to.rF, u),
        face: M.lerp(f.face, to.face, u), chest: M.lerp(f.chest, to.chest, u), lean: V.lerp(f.lean, to.lean, u),
        lift: Math.sin(u * Math.PI) * 0.08,
      };
    }

    // Bat state at time t (grip/dir/face), canonical frame.
    _batAt(t) {
      let g, d, f;
      const bl = M.smooth((t - this.backliftT) / 0.28);
      g = V.lerp(BAT.stance.g, BAT.backlift.g, bl);
      d = V.norm(V.lerp(BAT.stance.d, BAT.backlift.d, bl));
      f = V.norm(V.lerp(BAT.stance.f, BAT.backlift.f, bl));
      const s = this.shot;
      if (s) {
        const keys = s.keys;
        const rt = t - s.tContact;
        if (rt >= keys[0].t) {
          let i = 0;
          while (i < keys.length - 2 && keys[i + 1].t <= rt) i++;
          const A = keys[i], B = keys[i + 1];
          const u = M.clamp((rt - A.t) / Math.max(1e-3, B.t - A.t), 0, 1);
          const e = A.ease === 'in' ? M.easeIn(u) : A.ease === 'out' ? M.easeOut(u) : M.easeInOut(u);
          // blend from whatever the bat was doing into the first key
          const blendIn = M.clamp((rt - keys[0].t) / 0.06, 0, 1);
          const kg = V.lerp(A.g, B.g, e), kd = V.norm(V.lerp(A.d, B.d, e)), kf = V.norm(V.lerp(A.f, B.f, e));
          g = V.lerp(g, kg, blendIn); d = V.norm(V.lerp(d, kd, blendIn)); f = V.norm(V.lerp(f, kf, blendIn));
        }
      }
      return { g, d, f };
    }

    pose(t, lookAt) {
      const fe = this._feetAt(t);
      const bat = this._batAt(t);
      // subtle idle breathing before the backlift
      const idle = this.backliftT === Infinity ? Math.sin(t * 2.4) * 0.008 : 0;
      let pel = V.add(fe.pel, v(0, idle, 0));
      let lean = fe.lean;
      let chest = fe.chest;
      // A shot can twist the upper body through
      if (this.shot && this.shot.body) {
        const rt = t - this.shot.tContact;
        const b = this.shot.body;
        const u = M.clamp((rt - b.t0) / (b.t1 - b.t0), 0, 1);
        chest += (b.chest || 0) * M.easeInOut(u);
        lean = V.add(lean, V.mul(b.lean || v(), M.easeInOut(u)));
        pel = V.add(pel, V.mul(b.pel || v(), M.easeInOut(u)));
      }
      if (this.fallT != null) {
        const u = M.easeOut((t - this.fallT) / 0.5);
        lean = V.add(lean, v(0.1 * u, -0.1 * u, -0.15 * u));
      }
      const lFoot = V.add(fe.lF, v(0, fe.lift, 0));
      const g = bat.g;
      const topHand = V.sub(g, V.mul(bat.d, 0.07));
      const botHand = V.add(g, V.mul(bat.d, 0.05));
      return this.fig.solve({
        pelvis: pel,
        facing: { x: Math.cos(fe.face), z: Math.sin(fe.face) },
        chestFacing: { x: Math.cos(chest), z: Math.sin(chest) },
        lean,
        lookAt: lookAt || v(-0.4, 1.8, 19),
        lFoot, rFoot: fe.rF,
        lToe: nz(-1, 0, 0.45), rToe: nz(-1, 0, -0.1),
        lHand: topHand, rHand: botHand,
        lElbowPole: v(-0.3, -0.4, 1), rElbowPole: v(0.2, -1, -0.3),
        bat: { grip: g, dir: bat.d, face: bat.f },
      });
    }
  }

  /*
   * Build shot keyframes (canonical right-hander frame).
   *   family: 'drive' | 'loft' | 'defend' | 'punch' | 'flick' | 'cut' | 'pull' | 'sweep' | 'leave'
   *   C: contact point (where the sweet spot meets the ball)
   *   u: horizontal unit vector of the intended shot direction
   *   tContact: absolute time of contact
   *   lead: seconds from swing start to contact
   */
  function makeShot(family, C, u, tContact, lead) {
    lead = lead || 0.11;
    const down = v(0, -1, 0);
    const keys = [];
    let body = null;
    const back = V.mul(u, -1);
    if (family === 'leave') {
      const L = BAT.leave;
      keys.push({ t: -0.12, g: BAT.backlift.g, d: BAT.backlift.d, f: BAT.backlift.f });
      keys.push({ t: 0.05, g: L.g, d: L.d, f: L.f });
      keys.push({ t: 0.6, g: L.g, d: L.d, f: L.f });
      return { keys, tContact, family, body: { t0: -0.1, t1: 0.2, chest: 0.25, lean: v(0.04, 0.02, -0.05) } };
    }
    const vertical = family === 'drive' || family === 'loft' || family === 'defend' || family === 'punch' || family === 'flick';
    if (vertical) {
      // The bat swings in the vertical plane of the shot. psi: 0 = hanging
      // straight down, + = toe back (backlift), - = toe forward/up (follow-through).
      const pivot = V.add(C, v(0, 0.8, 0));
      const at = (psi, extraUp = 0) => {
        const ph = psi * 0.75;
        const hands = V.add(pivot, V.add(V.mul(down, Math.cos(ph) * 0.25), V.mul(back, Math.sin(ph) * 0.25)));
        const d = V.norm(V.add(V.mul(down, Math.cos(psi)), V.mul(back, Math.sin(psi))));
        const g = V.add(hands, v(0, extraUp, 0));
        const f = V.norm(V.sub(u, V.mul(d, V.dot(u, d))));
        return { g, d, f };
      };
      let psis;
      if (family === 'defend') psis = [[-lead - 0.02, 1.7], [-lead * 0.45, 0.7], [0, -0.12], [0.15, -0.2], [0.55, -0.15]];
      else if (family === 'punch') psis = [[-lead - 0.02, 1.9], [-lead * 0.45, 0.9], [0, 0.02], [0.12, -1.1], [0.45, -1.7]];
      else if (family === 'loft') psis = [[-lead - 0.02, 2.4], [-lead * 0.45, 1.05], [0, -0.08], [0.13, -1.5], [0.5, -2.75]];
      else psis = [[-lead - 0.02, 2.3], [-lead * 0.45, 1.0], [0, 0.04], [0.12, -1.3], [0.45, -2.35]];
      for (const [t, psi] of psis) {
        const k = at(psi, t > 0.2 && family !== 'defend' ? 0.08 : 0);
        k.t = t; k.ease = t < 0 ? 'in' : 'out';
        keys.push(k);
      }
      const open = family === 'flick' ? 0.75 : family === 'defend' ? 0.1 : 0.35;
      body = { t0: -0.08, t1: 0.35, chest: -open, lean: V.add(V.mul(u, 0.08), v(0, -0.02, 0)) };
    } else {
      // Cross-bat: hands near the body, the bat reaches out to the ball and
      // rotates about a vertical axis through the hands.
      let H0;
      if (family === 'cut') H0 = v(0.08, 1.02, 1.05);
      else if (family === 'pull') H0 = v(0.12, 1.12, 1.35);
      else H0 = v(0.18, 0.55, 1.85);   // sweep
      const d0 = V.norm(V.sub(C, H0));
      const g0 = V.sub(C, V.mul(d0, 0.55));
      // Which rotation sense moves the sweet spot along u?
      const test = V.add(g0, V.mul(V.rotY(d0, 0.05), 0.55));
      const sgn = V.dot(V.sub(test, C), u) >= 0 ? 1 : -1;
      const at = (ang, up, handUp, handShift) => {
        let d = V.rotY(d0, ang * sgn);
        d = V.norm(V.add(d, v(0, up, 0)));
        const g = V.add(g0, V.add(v(0, handUp, 0), V.mul(u, handShift)));
        const f = V.norm(V.sub(u, V.mul(d, V.dot(u, d))));
        return { g, d, f };
      };
      const seq = family === 'cut'
        ? [[-lead - 0.02, -1.4, 1.2, 0.35, -0.1], [-lead * 0.45, -0.6, 0.55, 0.15, -0.05], [0, 0, -0.08, 0, 0], [0.12, 0.9, -0.2, 0.05, 0.12], [0.45, 1.6, 0.6, 0.35, 0.1]]
        : family === 'pull'
          ? [[-lead - 0.02, -1.5, 1.0, 0.3, -0.1], [-lead * 0.45, -0.65, 0.35, 0.1, -0.05], [0, 0, 0, 0, 0], [0.12, 1.1, 0.25, 0.1, 0.12], [0.45, 2.3, 1.2, 0.35, 0.05]]
          : [[-lead - 0.02, -1.3, 0.9, 0.35, -0.1], [-lead * 0.45, -0.55, 0.2, 0.1, -0.05], [0, 0, -0.05, 0, 0], [0.12, 1.0, 0.1, 0.05, 0.1], [0.45, 2.0, 1.0, 0.45, 0.05]];
      for (const [t, ang, up, hu, hs] of seq) {
        const k = at(ang, up, hu, hs);
        k.t = t; k.ease = t < 0 ? 'in' : 'out';
        keys.push(k);
      }
      body = { t0: -0.1, t1: 0.35, chest: family === 'pull' ? -1.0 : family === 'sweep' ? -0.7 : 0.1, lean: V.mul(u, 0.06) };
    }
    return { keys, tContact, family, body };
  }

  CLLM.BatterAnim = BatterAnim;
  CLLM.BatterAnim.FEET = FEET;
  CLLM.BatterAnim.BAT = BAT;
  CLLM.BatterAnim.makeShot = makeShot;
})();
