/*
 * FIELDER ANIMATION
 * =================
 * Procedural poses for everyone on the field who isn't batting or bowling:
 * fielders (ready, walk-in, run, dive, pick up, throw, catch, celebrate),
 * the keeper (crouch, rise, take it), the umpire, and batters running
 * between the wickets with the bat (and stretching to ground it).
 *
 * The field simulation owns WHERE everyone is and WHAT they're doing; this
 * only turns that into a body. Call pose(t, d) every frame:
 *
 *   d = {
 *     at:     {x, z}   ground point under the pelvis (world metres)
 *     face:   {x, z}   facing (horizontal unit vector)
 *     speed:  m/s      ground speed (drives the gait)
 *     mode:   'stand' | 'ready' | 'run' | 'dive' | 'pickup' | 'throw' | 'catch'
 *             | 'keeper' | 'celebrate' | 'umpire' | 'batrun'
 *     u:      0..1     progress of a one-shot action (dive, pickup, throw, catch, celebrate)
 *     dir:    {x, z}   dive direction (unit)
 *     reach:  m        how far the dive carries the body
 *     hands:  V3       where the hands go (catch / gather / keeper take)
 *     crouch: 0..1     depth of the ready stance (slips crouch low)
 *     rise:   0..1     keeper: 0 = squatting, 1 = up to take it
 *     look:   V3       what to look at (usually the ball)
 *     ground: 0..1     batter running: stretching the bat out to ground it
 *     holding: bool    the ball is in the throwing hand
 *   }
 *
 * Everything is authored in the fielder's own frame (fwd, left, up) and
 * placed with at/face, so there's no mirroring: a figure can face anywhere.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, Figure } = CLLM;

  const THROW_RELEASE = 0.62;            // fraction of the throw action where the ball leaves the hand

  // Match kit: whites. The fielding side's cap colour is passed in.
  function whites(cap) {
    return {
      shirt: '#f4f1e6', shirtShade: '#cdc6b1', pants: '#f1ede0', pantsShade: '#c7c0aa', sleeve: '#f4f1e6',
      pads: null, shoes: '#f5f5f0', gloves: null, cap: cap || '#15294a', skin: '#b87a52', skinShade: '#86553a',
    };
  }
  function keeperKit(cap) {
    return Object.assign({}, Figure.KITS.batter, {
      gloves: '#efe9d6', glovesTrim: cap || '#15294a', helmet: cap || '#15294a', bat: null,
    });
  }
  function umpireKit() {
    return { shirt: '#fbfbf8', shirtShade: '#d8d8d2', pants: '#2c3038', pantsShade: '#1b1e24', sleeve: '#fbfbf8',
      pads: null, shoes: '#2a2a2a', gloves: null, cap: '#efe8d2', skin: '#d9a07a', skinShade: '#a8704f' };
  }

  class FielderAnim {
    constructor(fig) {
      this.fig = fig;
      this.phase = 0;
      this.last = null;
    }

    pose(t, d) {
      const at = d.at, F = norm2(d.face || { x: 0, z: -1 });
      const L = { x: F.z, z: -F.x };                         // the fielder's left
      const P = (fwd, left, y) => V.v(at.x + F.x * fwd + L.x * left, y, at.z + F.z * fwd + L.z * left);
      const D = (fwd, left, y) => V.v(F.x * fwd + L.x * left, y, F.z * fwd + L.z * left);
      // Gait phase from the distance actually covered
      if (this.last) {
        const moved = Math.hypot(at.x - this.last.x, at.z - this.last.z);
        const S = stepLen(d.speed || 0);
        if (moved < 3) this.phase = (this.phase + moved / (2 * S)) % 1;
      }
      this.last = { x: at.x, z: at.z };
      const look = d.look || P(4, 0, 1.4);
      let p;
      switch (d.mode) {
        case 'ready': p = this._ready(P, D, d.crouch == null ? 0.5 : d.crouch); break;
        case 'run': p = this._run(P, D, d.speed || 0, false, 0); break;
        case 'batrun': p = this._run(P, D, d.speed || 0, true, d.ground || 0); break;
        case 'dive': p = this._dive(P, D, d); break;
        case 'pickup': p = this._pickup(P, D, d); break;
        case 'throw': p = this._throw(P, D, d); break;
        case 'catch': p = this._catch(P, D, d); break;
        case 'keeper': p = this._keeper(P, D, d); break;
        case 'celebrate': p = this._celebrate(P, D, d, t); break;
        case 'umpire': p = this._umpire(P, D, d); break;
        default: p = this._stand(P, D, t);
      }
      p.facing = p.facing || F;
      p.lookAt = p.lookAt || look;
      p.lToe = p.lToe || V.v(F.x, 0, F.z);
      p.rToe = p.rToe || V.v(F.x, 0, F.z);
      this.fig.solve(p);
      this.fig.ball = d.holding ? this.fig.J.rHand : null;
      return p;
    }

    _stand(P, D, t) {
      const sway = Math.sin(t * 1.7) * 0.01;
      return {
        pelvis: P(0, 0, 0.97 + sway),
        lean: D(0.02, 0, 0),
        lFoot: P(0.02, 0.14, 0.08), rFoot: P(-0.02, -0.14, 0.08),
        lHand: P(0.06, 0.26, 0.9), rHand: P(0.06, -0.26, 0.9),
      };
    }

    // Set position: weight forward, hands out in front (slips: low)
    _ready(P, D, c) {
      return {
        pelvis: P(0, 0, 0.97 - 0.36 * c),
        lean: D(0.1 + 0.3 * c, 0, -0.03 - 0.1 * c),
        lFoot: P(0.04, 0.16 + 0.14 * c, 0.08), rFoot: P(-0.02, -0.16 - 0.14 * c, 0.08),
        lHand: P(0.36 + 0.12 * c, 0.13, 0.92 - 0.42 * c), rHand: P(0.36 + 0.12 * c, -0.13, 0.92 - 0.42 * c),
        lToe: D(1, 0.25, 0), rToe: D(1, -0.25, 0),
      };
    }

    // Running (and walking, and a batter running with the bat)
    _run(P, D, speed, withBat, ground) {
      const S = stepLen(speed);
      const w = M.clamp(speed / 1.4, 0, 1);                 // standing still -> feet together
      const k = M.clamp(speed / 7.5, 0, 1);                 // sprint intensity
      const ph = this.phase * Math.PI * 2;
      const s = Math.sin(ph), c = Math.cos(ph);
      const lf = S * 0.5 * s * w, rf = -S * 0.5 * s * w;
      const lLift = (0.04 + 0.3 * k) * Math.max(0, c) * w, rLift = (0.04 + 0.3 * k) * Math.max(0, -c) * w;
      const pelY = 0.96 - 0.06 * k + 0.035 * k * Math.cos(ph * 2);
      const arm = 0.34 * (0.3 + k) * w;
      const p = {
        pelvis: P(0, 0, pelY),
        lean: D(0.04 + 0.2 * k, 0, 0),
        lFoot: P(lf, 0.1, 0.08 + lLift), rFoot: P(rf, -0.1, 0.08 + rLift),
        lHand: P(-arm * s + 0.08, 0.24, 1.0 + 0.1 * k * Math.abs(s)), rHand: P(arm * s + 0.08, -0.24, 1.0 + 0.1 * k * Math.abs(s)),
      };
      if (withBat) {
        // bat carried in the bottom hand, toe forward and down; stretch it
        // out along the ground to make the crease
        const g = M.smooth(ground);
        const grip = V.lerp(P(0.25, -0.26, 0.95), P(1.05, -0.12, 0.42), g);
        p.rHand = grip;
        p.lHand = V.lerp(p.lHand, P(0.2, 0.22, 1.0), g);
        p.lean = V.add(p.lean, D(0.22 * g, 0, -0.12 * g));
        p.pelvis = V.add(p.pelvis, V.v(0, -0.12 * g, 0));
        const dir = V.norm(V.lerp(D(0.55, -0.1, -0.83), D(0.93, 0, -0.35), g));
        p.bat = { grip, dir, face: V.norm(D(0, 1, 0)) };
        p.lHand = V.add(grip, V.mul(dir, -0.09));          // both hands on the handle
        p.rHand = V.add(grip, V.mul(dir, 0.04));
      }
      return p;
    }

    _dive(P, D, d) {
      const u = M.clamp(d.u || 0, 0, 1);
      const dir = norm2(d.dir || { x: 1, z: 0 });
      const Dv = V.v(dir.x, 0, dir.z);
      const reach = d.reach == null ? 1.6 : d.reach;
      const fly = M.easeOut(M.clamp(u / 0.3, 0, 1));
      const rise = M.smooth(M.clamp((u - 0.62) / 0.38, 0, 1));
      const flat = M.clamp(u / 0.22, 0, 1) * (1 - rise);
      const base = V.add(P(0, 0, 0), V.mul(Dv, reach * fly));
      const pelY = M.lerp(0.95, 0.27, M.smooth(M.clamp(u / 0.3, 0, 1))) * (1 - rise) + 0.95 * rise;
      const pel = V.v(base.x, pelY, base.z);
      const handsTo = d.hands || V.add(pel, V.add(V.mul(Dv, 1.05), V.v(0, 0.1, 0)));
      const side = V.v(-dir.z * 0.07, 0, dir.x * 0.07);
      const st = this._stand(P, D, 0);
      const trail = V.sub(pel, V.mul(Dv, 0.85));
      return {
        pelvis: pel,
        lean: V.lerp(D(0.05, 0, 0), V.add(V.mul(Dv, 0.44), V.v(0, -0.36, 0)), flat),
        lFoot: V.lerp(st.lFoot, V.add(trail, V.v(side.x * 2, 0.12, side.z * 2)), flat),
        rFoot: V.lerp(st.rFoot, V.add(trail, V.v(-side.x * 2, 0.12, -side.z * 2)), flat),
        lHand: V.lerp(V.add(handsTo, side), st.lHand, rise),
        rHand: V.lerp(V.sub(handsTo, side), st.rHand, rise),
        lookAt: d.look || handsTo,
      };
    }

    // Swoop on it: bend, the hand to the ball, back up
    _pickup(P, D, d) {
      const u = M.clamp(d.u || 0, 0, 1);
      const b = Math.sin(Math.PI * M.clamp(u * 1.15, 0, 1));
      const ball = d.hands || P(0.55, -0.1, 0.05);
      const st = this._stand(P, D, 0);
      return {
        pelvis: P(0.05 * b, 0, 0.95 - 0.36 * b),
        lean: D(0.36 * b, 0, -0.28 * b),
        lFoot: P(0.36 * b, 0.14, 0.08), rFoot: P(-0.24 * b, -0.16, 0.08),
        rHand: V.lerp(st.rHand, ball, b),
        lHand: V.lerp(st.lHand, V.add(ball, D(-0.06, 0.12, 0.05)), b * 0.8),
        lookAt: ball,
      };
    }

    // Side-on wind-up, over the top, follow through. The ball goes at THROW_RELEASE.
    _throw(P, D, d) {
      const u = M.clamp(d.u || 0, 0, 1);
      const R = THROW_RELEASE;
      const wind = M.smooth(M.clamp(u / (R - 0.1), 0, 1));
      const whip = M.clamp((u - (R - 0.1)) / 0.16, 0, 1);
      const thru = M.smooth(M.clamp((u - R - 0.06) / (1 - R - 0.06), 0, 1));
      const F = D(1, 0, 0), Lh = D(0, 1, 0);
      const sideOn = { x: -Lh.x, z: -Lh.z };                  // chest to the right: left shoulder at the target
      const chest = norm2({ x: M.lerp(F.x, sideOn.x, wind * (1 - whip)), z: M.lerp(F.z, sideOn.z, wind * (1 - whip)) });
      let rH;
      if (whip <= 0) rH = V.lerp(P(0.2, -0.15, 1.15), P(-0.5, -0.3, 1.8), wind);
      else if (thru <= 0) {
        // over the top: an arc from behind the head to out in front
        const a = M.lerp(-2.4, 0.4, whip);                  // angle about the shoulder (0 = straight up)
        rH = P(0.05 + Math.sin(a) * 0.62, -0.2, 1.5 + Math.cos(a) * 0.62);
      } else rH = V.lerp(P(0.29, -0.2, 1.21), P(0.35, 0.25, 0.65), thru);
      return {
        pelvis: P(0.12 * wind + 0.2 * thru, 0, 0.95 - 0.05 * wind),
        facing: { x: F.x, z: F.z },
        chestFacing: chest,
        lean: D(-0.05 * wind * (1 - whip) + 0.22 * thru, 0, -0.08 * thru),
        lFoot: P(0.1 + 0.5 * wind, 0.14, 0.08), rFoot: P(-0.25, -0.12, 0.08 + 0.18 * thru),
        lHand: V.lerp(P(0.62, 0.18, 1.55), P(0.1, 0.3, 0.95), thru),
        rHand: rH,
        rElbowPole: D(-0.3, -1, 0.4),
      };
    }

    // Hands to the ball (a jump for a high one, down low for a low one),
    // then bring it in to the chest.
    _catch(P, D, d) {
      const u = M.clamp(d.u || 0, 0, 1);
      const hands = d.hands || P(0.4, 0, 1.2);
      const hy = hands.y;
      const pull = M.smooth(M.clamp((u - 0.5) / 0.5, 0, 1));
      const pelY = hy > 2.05 ? 0.97 + Math.min(0.45, hy - 2.05) * (1 - pull) : M.clamp(hy + 0.3, 0.5, 0.97);
      const L2 = D(0, 0.07, 0);
      const chestHold = P(0.28, 0, 1.18);
      return {
        pelvis: P(0, 0, M.lerp(pelY, 0.95, pull)),
        lean: D(0.12, 0, hy < 0.6 ? -0.15 : 0),
        lFoot: P(0.12, 0.15, 0.08 + (hy > 2.05 ? 0.25 * (1 - pull) : 0)), rFoot: P(-0.1, -0.15, 0.08 + (hy > 2.05 ? 0.25 * (1 - pull) : 0)),
        lHand: V.lerp(V.add(hands, L2), V.add(chestHold, L2), pull),
        rHand: V.lerp(V.sub(hands, L2), V.sub(chestHold, L2), pull),
        lookAt: hands,
      };
    }

    _keeper(P, D, d) {
      const r = M.clamp(d.rise || 0, 0, 1);
      const hands = d.hands || P(0.38, 0, 0.32);
      const L2 = D(0, 0.06, 0);
      const pelY = M.lerp(0.47, Math.max(0.55, Math.min(0.95, hands.y + 0.05)), r);
      return {
        pelvis: P(0, 0, pelY),
        lean: D(0.2 * (1 - r) + 0.08, 0, -0.04),
        lFoot: P(0.05, 0.3 - 0.08 * r, 0.08), rFoot: P(0.05, -0.3 + 0.08 * r, 0.08),
        lToe: D(1, 0.35, 0), rToe: D(1, -0.35, 0),
        lHand: V.add(r > 0 ? hands : P(0.38, 0, 0.32), L2), rHand: V.sub(r > 0 ? hands : P(0.38, 0, 0.32), L2),
      };
    }

    _celebrate(P, D, d, t) {
      const u = M.clamp(d.u || 0, 0, 1);
      const hop = Math.max(0, Math.sin(t * 9)) * 0.12 * (1 - u);
      return {
        pelvis: P(0, 0, 0.97 + hop),
        lean: D(0, 0, 0.02),
        lFoot: P(0.05, 0.15, 0.08 + hop), rFoot: P(-0.05, -0.15, 0.08 + hop),
        lHand: P(0.1, 0.35, 2.05), rHand: P(0.1, -0.35, 1.95 + 0.1 * Math.sin(t * 9)),
      };
    }

    _umpire(P, D, d) {
      const c = d.crouch || 0;
      return {
        pelvis: P(0, 0, 0.97 - 0.08 * c),
        lean: D(0.06 + 0.06 * c, 0, 0),
        lFoot: P(0.02, 0.15, 0.08), rFoot: P(-0.02, -0.15, 0.08),
        lHand: P(0.2, 0.06, 0.95 - 0.05 * c), rHand: P(0.2, -0.06, 0.95 - 0.05 * c),
      };
    }
  }

  function stepLen(speed) { return M.clamp(0.42 + 0.19 * speed, 0.42, 1.95); }
  function norm2(f) { const l = Math.hypot(f.x, f.z) || 1; return { x: f.x / l, z: f.z / l }; }

  FielderAnim.THROW_RELEASE = THROW_RELEASE;
  FielderAnim.whites = whites;
  FielderAnim.keeperKit = keeperKit;
  FielderAnim.umpireKit = umpireKit;
  CLLM.FielderAnim = FielderAnim;
})();
