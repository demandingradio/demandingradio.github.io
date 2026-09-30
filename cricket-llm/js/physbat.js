/*
 * PHYSICAL BAT
 * ============
 * "Hold the bat yourself." The pointer (mouse or finger) places the bat's
 * sweet spot in a vertical hitting plane in front of the stumps; swiping
 * through the ball swings it. Contact is physics, not timing windows:
 *
 *   - Where the ball meets the blade sets how clean it is (middle / toe /
 *     splice / edge).
 *   - How fast you're moving at that instant is the bat speed (a still bat
 *     is a dead-bat block).
 *   - Which way you're moving angles the face: sideways steers it, up lofts
 *     it, down keeps it on the ground.
 *   - Miss it and the ball carries on to the pads and stumps. Leave it by
 *     taking the bat out of the line.
 *
 * Everything is authored in world space; the camera sits behind the batter.
 *
 * The bat's TRACK (rebuild) is the single source every judgement reads:
 * pointer -> hitting plane -> pinned inside what a batter can reach ->
 * (optionally) followed by a weighted / speed-limited bat, with the
 * cross-bat turn and your feet placed at the moments they happened.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, BallPhys, Field, World, Figure, CFG } = CLLM;
  const smooth = (x) => { const t = M.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
  const D2R = Math.PI / 180;
  const R = World.PITCH.BALL_R;

  const BLADE = { UP: 0.39, DOWN: 0.16, HALF_W: 0.054, GRIP: 0.55 };   // from the sweet spot
  const PHYS = {
    Q_MAX: 0.24,          // collision efficiency in the middle (measured cricket ~0.20-0.26)
    VEL_WINDOW: 50,       // ms of pointer history in each least-squares velocity fit
    DEAD: 0.4,            // m/s at the plane: slower than this is a still bat
    CURVE: 7,             // m/s of pointer speed (at the plane) for ~3/4 power
    EXP: 1.3,             // ease-in: small pushes stay controllable
    MAX_BAT: 28,          // m/s, approached softly: frantic swipes gain little
    TOUCH_LIFT: 70,       // px: on touch the bat sits above the finger
    LAT_TOUCH_EXTRA: 25,  // ms: touchscreens report a little later than mice
    STROKE_FULL: 0.4,     // m the bat must travel (last ~160 ms) for full power: no power from a twitch
    TIME_ROT_MAX: 25,     // degrees timing can turn the face
  };

  // pointer speed at the plane (m/s, real time) -> bat speed (m/s)
  function batSpeedOf(sp) {
    if (sp <= PHYS.DEAD) return 0;
    return PHYS.MAX_BAT * Math.tanh(Math.pow((sp - PHYS.DEAD) / PHYS.CURVE, PHYS.EXP));
  }

  class PhysBat {
    constructor(session) {
      this.s = session;
      this.game = session.game;
      this.h = session.h;
      this.plane = CFG.BAT.PLANES.stance;
      this.pose = null;       // current (display) bat pose
      this.ghost = null;      // what happened at the last crossing
      this.speedNow = 0;      // current bat speed (m/s, physical)
      this.peak = 0;          // bat speed at the last contact
      this.feet = 0;          // -1 right back .. 0 stance .. +1 full stride forward
      this.camShift = 0;      // the camera moves with your feet
      this.crossOn = false;   // cross-bat hold, as last reported
      this.resetTrack();
    }

    // ---- footwork -----------------------------------------------------------------
    // Where the bat meets the ball for a given foot position (m in front of the stumps)
    planeFor(p) {
      const P = CFG.BAT.PLANES;
      return p >= 0 ? M.lerp(P.stance, P.front, p) : M.lerp(P.stance, P.back, -p);
    }
    resetFeet() { this.feet = 0; this.plane = this.planeFor(0); this.camShift = 0; }
    // Feet glide toward `target` (hold to stride: a tap is a short step, a
    // hold a full stride). canFwd(p) says whether stepping to p would still
    // meet the ball in front of you. locked = the ball has arrived / you danced.
    stepFeet(dt, target, locked, canFwd) {
      if (!locked && target != null) {
        let p = this.feet + (target - this.feet) * (1 - Math.exp(-CFG.PHYS.FEET_RATE * dt));
        if (Math.abs(target - p) < 0.004) p = target;
        if (p > this.feet && canFwd && !canFwd(p)) p = this.feet;
        this.feet = M.clamp(p, -1, 1);
        this.plane = this.planeFor(this.feet);
      }
      this.camShift = (this.plane - CFG.BAT.PLANES.stance) * CFG.PHYS.CAM_FOLLOW;   // the view comes with you
      this.noteFeet(performance.now(), this.feet, !locked && target != null ? target : this.feet);
    }

    // Footwork scores at this length: how good is it to be right back,
    // on the crease, or fully forward? (coaching tables in config.js)
    footRow(plan, spin, cross) {
      const F = CFG.PHYS.FIT, tab = spin ? F.spin : F.pace;
      let L = plan.lengthM != null ? plan.lengthM : plan.bounce.z;
      if (!spin && plan.kmh) L *= Math.pow(plan.kmh / 136, 0.35);      // slower balls: you can get forward to more
      let i = 0;
      while (i < tab.length - 2 && L > tab[i + 1][0]) i++;
      const A = tab[i], Bq = tab[i + 1], u = M.clamp((L - A[0]) / (Bq[0] - A[0]), 0, 1);
      const row = { L, back: M.lerp(A[1], Bq[1], u), crease: M.lerp(A[2], Bq[2], u), front: M.lerp(A[3], Bq[3], u) };
      if (!spin && cross && L >= 8 && L <= 10.5) row.front = Math.max(row.front, 0.8);   // the front-foot pull
      else if (!spin && cross && L > 10.5) row.front = Math.max(row.front, 0.6);
      return row;
    }
    fitAt(row, feet, spin) {
      const F = CFG.PHYS.FIT;
      const u = Math.pow(Math.min(1, Math.abs(feet)), spin ? F.shapeSpin : F.shapePace);
      return feet >= 0 ? M.lerp(row.crease, row.front, u) : M.lerp(row.crease, row.back, u);
    }
    // How well your feet suit this ball (1 = right foot for the length).
    // y = ball height where it meets the bat; moved = feet change after your
    // deadline (+ forward, - back); danced = you came down the track.
    footFit(plan, feet, o = {}) {
      const F = CFG.PHYS.FIT, spin = !!o.spin;
      let row, fit, notes = [];
      if (o.danced) {
        row = this.footRow({ lengthM: Math.max(0, (plan.lengthM || 0) - 2.0), bounce: plan.bounce, lengthName: plan.lengthName }, true, false);
        fit = row.front;
        if (fit < 0.75) notes.push('beaten in the flight');
      } else {
        row = this.footRow(plan, spin, o.cross);
        fit = this.fitAt(row, feet, spin);
        const y = o.y;
        if (y != null && !o.cross && feet > 0.3 && y > 0.85) { fit *= 1 - 0.5 * M.clamp((y - 0.85) / 0.35, 0, 1); notes.push('too high to get over it'); }
        if (y != null && feet < -0.3 && o.bounced && y < 0.35) { fit *= 1 - 0.5 * M.clamp((0.35 - y) / 0.2, 0, 1); notes.push('kept low on you'); }
      }
      let late = false;
      const mv = o.moved || 0;
      if (Math.abs(mv) > F.lateMove) {
        late = true;
        fit *= spin ? (mv < 0 ? F.late.spinBack : F.late.spinFwd) : F.late.pace;
      }
      const best = Math.max(row.back, row.crease, row.front);
      const bestFoot = best === row.front ? 1 : best === row.back ? -1 : 0;
      return { fit: M.clamp(fit, F.floor, 1), row, feet, L: row.L, late, notes, danced: !!o.danced, bestFoot, spin };
    }

    // ---- settings the player can tune in the pause menu -------------------------
    _set() { return (this.game.save && this.game.save.data.settings) || {}; }
    // Bat speed limit (m/s on the plane); 0 = off
    speedLimit() { const v = +this._set().batLimit || 0; return v > 0 ? v : 0; }
    // Bat weight: the bat follows your hand on a spring (rad/s); 0 = off
    weight() { const v = +this._set().batWeight || 0; return v > 0 ? v : 0; }
    // Swing power multiplier
    power() { return M.clamp(+this._set().batPower || 1, 0.4, 2.5); }

    // ---- reach: where a batter can actually put the bat -------------------------
    // c = how far the bat has turned cross (0 straight .. 1 horizontal),
    // p = feet (-1 back .. +1 forward). Going back lifts everything a little,
    // striding forward lowers it and lets you reach further to the off side.
    reach(c, p) {
      const R = CFG.PHYS.REACH, h = this.h, k = smooth(c || 0);
      const at = (o) => (p >= 0 ? M.lerp(o.stance, o.front, p) : M.lerp(o.stance, o.back, -p));
      const yLo = M.lerp(at(R.straight.lo), at(R.cross.lo), k);
      const yHi = M.lerp(at(R.straight.hi), at(R.cross.hi), k);
      const bodyX = CFG.PHYS.BODY_X * h;
      const a = bodyX - h * at(R.off), bnd = bodyX + h * M.lerp(R.leg.straight, R.leg.cross, k);
      return { xLo: Math.min(a, bnd), xHi: Math.max(a, bnd), yLo, yHi };
    }
    // Pin a point inside the reach, with a soft edge (a few cm of give, not a wall)
    _pin(P, Rb) {
      const E = CFG.PHYS.REACH.give;
      const soft = (v, lo, hi) => (v > hi ? hi + E * Math.tanh((v - hi) / E) : v < lo ? lo - E * Math.tanh((lo - v) / E) : v);
      return { x: soft(P.x, Rb.xLo, Rb.xHi), y: soft(P.y, Rb.yLo, Rb.yHi) };
    }

    // ---- input history for the track ------------------------------------------------
    resetTrack() {
      this.trk = [];              // {s, x, y (bat), hx, hy (hand, for swing speed), c, p, brk}
      this.crossEv = [];          // {s, on}: cross-bat hold changes, timestamped
      this.feetHist = [];         // {s, p}: where your feet were
      this.tgtRaw = null;         // latest pointer point on the plane (unpinned)
    }
    noteCross(s, on) {
      const E = this.crossEv, L = E[E.length - 1];
      this.crossOn = on;
      if (L && L.on === on) return;
      if (L && s < L.s) s = L.s;
      E.push({ s, on });
      while (E.length > 2 && E[1].s < s - 2000) E.shift();
    }
    noteFeet(s, p, g = p) {
      const F = this.feetHist, L = F[F.length - 1];
      if (L && s <= L.s) { L.p = p; L.g = g; return; }
      F.push({ s, p, g });
      while (F.length > 2 && F[1].s < s - 1500) F.shift();
    }
    // where your feet were heading at perf time s
    goalAt(s) {
      const F = this.feetHist;
      for (let i = F.length - 1; i >= 0; i--) if (F[i].s <= s) return F[i].g != null ? F[i].g : F[i].p;
      return F.length ? F[0].p : this.feet;
    }
    feetAt(s) {
      const F = this.feetHist;
      if (!F.length) return this.feet;
      if (s >= F[F.length - 1].s) return F[F.length - 1].p;
      if (s <= F[0].s) return F[0].p;
      let i = F.length - 1;
      while (i > 0 && F[i - 1].s > s) i--;
      const a = F[i - 1], b = F[i];
      return a.p + (b.p - a.p) * (s - a.s) / Math.max(1e-6, b.s - a.s);
    }
    crossAt(s) {
      const E = this.crossEv;
      for (let i = E.length - 1; i >= 0; i--) if (E[i].s <= s) return E[i].on;
      return E.length ? !E[0].on : this.crossOn;
    }

    // Pointer pixel -> (x, y) on the hitting plane, measured as if you were in
    // your stance: your feet move the bat with you, but never change how far
    // a given hand movement moves it (so a swing is the same swing front or back).
    // On touch the bat sits above your finger (so you can see the ball),
    // less so near the bottom of the screen so the ground stays reachable.
    touchLiftFor(py) { return M.lerp(20, PHYS.TOUCH_LIFT, M.clamp((this.game.cam.h - py) / 120, 0, 1)); }
    refPoint(px, py, lift) {
      const cam = this.game.cam;
      if (this.game.input.touchBat()) py -= lift != null ? lift : this.touchLiftFor(py);
      const dx = (px - cam.cx) / cam.focal, dy = -(py - cam.cy) / cam.focal;
      const dir = V.norm(V.add(cam.f, V.add(V.mul(cam.r, dx), V.mul(cam.u, dy))));
      if (dir.z < 1e-3) return null;
      const P0 = CFG.BAT.PLANES.stance;
      const t = (P0 - (cam.pos.z - this.camShift)) / dir.z;
      if (t <= 0) return null;
      return { x: M.clamp(cam.pos.x + dir.x * t, -4, 4), y: M.clamp(cam.pos.y + dir.y * t, -1, 4) };
    }
    planePoint(px, py) { const q = this.refPoint(px, py); return q ? V.v(q.x, q.y, this.plane) : null; }

    /*
     * THE TRACK. Rebuilt from the raw pointer history in 2 ms steps every
     * time it's needed, so late-arriving samples, the cross-bat hold and your
     * feet are all placed at the moment they really happened. For each step:
     *   hand = pointer on the plane, pinned inside your reach
     *   bat  = the hand, through the optional bat weight / speed limit
     * Swing speed, stroke length and face angle read the HAND (minus any
     * shift caused by the reach itself moving: turning the bat or stepping
     * isn't a swing). Contact and timing read the BAT.
     */
    rebuild(nowMs) {
      const I = this.game.input, H = I.hist;
      const DT = 2;
      const last = H.length ? H[H.length - 1].s : -Infinity;
      const end = Math.max(nowMs, last);
      let start = end - 700;
      const rest = I.rest;
      if (H.length && H[0].s > start && !(rest && rest.until > start)) start = H[0].s;
      const lim = this.speedLimit(), om = this.weight();
      const PC = CFG.PHYS;
      const out = [];
      let j = 0;
      const rawAt = (t) => {                        // pointer px at t (walks forward)
        if (rest && t < rest.until) return { x: rest.x, y: rest.y };
        if (!H.length) return { x: I.mouse.x, y: I.mouse.y };
        if (t <= H[0].s) return H[0];
        while (j < H.length - 1 && H[j + 1].s < t) j++;
        if (j >= H.length - 1) return H[H.length - 1];
        const a = H[j], b = H[j + 1], u = (t - a.s) / Math.max(1e-6, b.s - a.s);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      let t = start;
      let r0 = rawAt(t);
      // the touch lift drifts slowly toward its target, so it never adds
      // speed to a swing that passes through the bottom of the screen
      const touch = I.touchBat();
      let lift = touch ? this.touchLiftFor(r0.y) : 0;
      let P = this.refPoint(r0.x, r0.y, lift) || { x: 0, y: 0.6 };
      let c = this.crossAt(t) ? 1 : 0, p = this.feetAt(t);
      let box = this.reach(c, p), hand = this._pin(P, box);
      let bx = hand.x, by = hand.y, vx = 0, vy = 0, ox = 0, oy = 0;
      let brkPending = !!(rest && rest.until > start);
      for (; t <= end + 1e-6; t += DT) {
        const r = rawAt(t);
        if (touch) lift += (this.touchLiftFor(r.y) - lift) * (1 - Math.exp(-DT / 300));
        P = this.refPoint(r.x, r.y, lift) || P;
        const want = this.crossAt(t) ? 1 : 0;
        c = approach(c, want, DT / (want ? PC.CROSS_IN_MS : PC.CROSS_OUT_MS));
        p = this.feetAt(t);
        const boxNew = this.reach(c, p);
        const hOld = this._pin(P, box), hNew = this._pin(P, boxNew);
        box = boxNew;
        // the reach moving (turning the bat, stepping) carries the bat with it,
        // but it isn't a swing
        const sx = hNew.x - hOld.x, sy = hNew.y - hOld.y;
        ox += sx; oy += sy; bx += sx; by += sy;
        let brk = false;
        if (brkPending && rest && t >= rest.until) {
          // a fresh touch: the bat is where your finger lands, no swing read across it
          brkPending = false; brk = true;
          bx = hNew.x; by = hNew.y; vx = 0; vy = 0;
        } else if (om > 0) {
          // bat weight: a critically damped spring pulls the bat after your hand
          const ax = om * om * (hNew.x - bx) - 2 * om * vx, ay = om * om * (hNew.y - by) - 2 * om * vy;
          vx += ax * DT / 1000; vy += ay * DT / 1000;
          let nx = bx + vx * DT / 1000, ny = by + vy * DT / 1000;
          if (lim > 0) {
            const d = Math.hypot(nx - bx, ny - by), m = lim * DT / 1000;
            if (d > m) { nx = bx + (nx - bx) / d * m; ny = by + (ny - by) / d * m; vx = (nx - bx) / (DT / 1000); vy = (ny - by) / (DT / 1000); }
          }
          bx = nx; by = ny;
        } else if (lim > 0) {
          const dx = hNew.x - bx, dy = hNew.y - by, d = Math.hypot(dx, dy), m = lim * DT / 1000;
          if (d <= m) { bx = hNew.x; by = hNew.y; } else { bx += dx / d * m; by += dy / d * m; }
        } else { bx = hNew.x; by = hNew.y; }
        // the swing is the BAT's motion (so a speed limit or a heavy bat
        // changes the swing too), minus any shift of the reach itself
        out.push({ s: t, x: bx, y: by, hx: bx - ox, hy: by - oy, c, p, brk });
      }
      this.trk = out;
      this.tgtRaw = P;
    }

    // Track at perf time s (ms), interpolated.
    trkAt(s) {
      const h = this.trk;
      if (!h.length) return null;
      if (s >= h[h.length - 1].s) return h[h.length - 1];
      if (s <= h[0].s) return h[0];
      const i = Math.min(h.length - 1, Math.max(1, Math.ceil((s - h[0].s) / (h[1].s - h[0].s || 2))));
      const a = h[i - 1], b = h[i];
      const u = M.clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
      return { s, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, hx: a.hx + (b.hx - a.hx) * u, hy: a.hy + (b.hy - a.hy) * u, c: a.c + (b.c - a.c) * u, p: a.p + (b.p - a.p) * u };
    }
    ptAt(s) { const T = this.trkAt(s); return T ? V.v(T.x, T.y, this.plane) : null; }
    // Latest moment in (s0, s1] where a fresh touch broke the track, or null
    _brkIn(s0, s1) {
      const h = this.trk;
      for (let i = h.length - 1; i >= 0; i--) { const e = h[i]; if (e.s <= s0) break; if (e.brk && e.s <= s1) return e.s; }
      return null;
    }

    setPlane(z) { this.plane = z; }

    // Where the sweet spot was, and how fast the HAND was moving, at perf time s (ms).
    stateAt(sMs) {
      const T = this.trkAt(sMs);
      if (!T) return null;
      return { S: V.v(T.x, T.y, this.plane), vReal: this.velAt(sMs, PHYS.VEL_WINDOW), c: T.c, p: T.p };
    }

    // Least-squares HAND velocity (m/s on the plane) over [sMs - win, sMs + win2].
    velAt(sMs, win, win2 = 0) {
      const h = this.trk;
      const pts = [];
      for (let i = h.length - 1; i >= 0; i--) {
        const e = h[i];
        if (e.s > sMs + win2) continue;
        if (e.s < sMs - win) break;
        pts.push({ t: e.s / 1000, x: e.hx, y: e.hy });
        if (e.brk) break;                          // never read a swing across a fresh touch
      }
      if (pts.length < 3) {
        const bk = this._brkIn(sMs - win, sMs + win2);
        const t0 = bk != null ? bk : sMs - win;
        const pa = this.trkAt(sMs + win2), pb = this.trkAt(t0);
        if (!pa || !pb) return V.v();
        const dt = Math.max(0.005, (sMs + win2 - t0) / 1000);
        return V.v((pa.hx - pb.hx) / dt, (pa.hy - pb.hy) / dt, 0);
      }
      let mt = 0, mx = 0, my = 0;
      for (const p of pts) { mt += p.t; mx += p.x; my += p.y; }
      mt /= pts.length; mx /= pts.length; my /= pts.length;
      let stt = 0, stx = 0, sty = 0;
      for (const p of pts) { const dt = p.t - mt; stt += dt * dt; stx += dt * (p.x - mx); sty += dt * (p.y - my); }
      if (stt < 1e-9) return V.v();
      return V.v(stx / stt, sty / stt, 0);
    }

    // The swing through contact: the strongest recent stroke, read over a
    // window from ~40 ms before to ~30 ms after the ball arrived (the
    // follow-through counts), weighted toward the moment of contact.
    swingAt(sMs) {
      let best = V.v(), bestW = -1;
      for (let c = -40; c <= 30; c += 10) {
        const v = this.velAt(sMs + c + 25, 50);
        const w = V.len(v) * (1 - Math.abs(c) / 90);
        if (w > bestW) { bestW = w; best = v; }
      }
      return best;
    }

    // How far the HAND actually travelled from sMs0 to sMs1 (straight line on
    // the plane). A real stroke covers ground; a wrist twitch doesn't.
    strokeLen(sMs0, sMs1) {
      const bk = this._brkIn(sMs0, sMs1);
      if (bk != null) sMs0 = bk;
      const A = this.trkAt(sMs0), C = this.trkAt(sMs1);
      return A && C ? Math.hypot(C.hx - A.hx, C.hy - A.hy) : 0;
    }

    // Build the full bat pose from the sweet spot and the hand's velocity.
    // strokeL (m) caps the power by how long the stroke was; c = cross-bat turn.
    poseFrom(S, vReal, tsc, strokeL, c = 0) {
      const h = this.h;
      const k = smooth(c);
      // swing: hand speed -> bat speed (measured in real time, so the slowed
      // ball on easy levels doesn't turn every nudge into a six). Swing power
      // (pause menu) scales the swing above the still-bat threshold.
      const spReal = Math.hypot(vReal.x, vReal.y);
      const pw = this.power();
      let batSpeed = batSpeedOf(spReal <= PHYS.DEAD ? spReal : PHYS.DEAD + (spReal - PHYS.DEAD) * pw);
      if (strokeL != null) batSpeed = Math.min(batSpeed, PHYS.MAX_BAT * Math.sqrt(Math.min(1, strokeL / PHYS.STROKE_FULL)));
      // face: toward the bowler, turned by the swipe direction AS SEEN ON
      // SCREEN (swipe right = hit it to the right of the screen)
      const cam = this.game.cam;
      const rH = V.norm(V.v(cam.r.x, 0, cam.r.z));
      const sx = V.dot(vReal, rH), sy = vReal.y;
      const u = spReal / (spReal + 1.2);                      // slow moves barely turn the face
      const yawMax = M.lerp(50, 65, k);                       // a cross bat can go further round (cut, pull)
      const yaw = M.clamp((sx / (spReal + 1e-6)) * u * 55, -yawMax, yawMax) * D2R;
      // hands slightly ahead of the blade: the face looks a touch down unless you swing up
      const pitch = (M.clamp((sy / (spReal + 1e-6)) * u * 50, -10, 45) - 5 - (batSpeed < 2.2 ? 14 : 0)) * D2R;
      const fwd = V.v(0, 0, 1);
      let n = V.norm(V.add(V.add(V.mul(fwd, Math.cos(yaw) * Math.cos(pitch)), V.mul(rH, Math.sin(yaw) * Math.cos(pitch))), V.v(0, Math.sin(pitch), 0)));
      // A straight bat: nearly upright, leaning only a little toward where
      // you're reaching. (Straight = the whole blade sweeps through the ball's
      // line on a vertical swing; a sideways swipe only has its width.)
      const bodyX = CFG.PHYS.BODY_X * h;
      const lean = M.clamp((S.x - bodyX) * 0.22, -0.3, 0.3);
      let dir = V.norm(V.v(lean, -1, -0.12));
      // Cross bat: the blade lies horizontal, toe to the off side, hands on
      // the leg side, turned with the swing so the face stays square to the
      // blade. Now a SIDEWAYS swipe sweeps the whole blade through the ball's
      // line (pull, cut, hook, sweep) and a height error is a top or bottom edge.
      if (k > 0.001) {
        const th = Math.atan2(rH.x * Math.sin(yaw), Math.cos(yaw));   // rotation about y taking +z to the face's heading
        const d0 = V.norm(V.v(-h, -0.1, -0.12));
        const cs = Math.cos(th), sn = Math.sin(th);
        const dirX = V.norm(V.v(d0.x * cs + d0.z * sn, d0.y, -d0.x * sn + d0.z * cs));
        dir = V.norm(V.add(V.mul(dir, 1 - k), V.mul(dirX, k)));
      }
      // keep the face square to the blade
      n = V.sub(n, V.mul(dir, V.dot(n, dir)));
      if (V.len(n) < 1e-3) n = V.v(0, 0, 1);
      n = V.norm(n);
      if (n.z < 0.15) n = V.norm(V.v(n.x, n.y, 0.15));
      const grip = V.sub(S, V.mul(dir, BLADE.GRIP));
      const H = grip;
      let w = V.cross(dir, n);
      if (V.len(w) < 1e-3) w = V.v(1, 0, 0);
      w = V.norm(w);                                          // across the blade
      return { S, H, dir, grip, n, w, batSpeed, vReal, yaw, pitch, cross: k };
    }

    // Per-frame display pose.
    update() {
      const s = this.s, b = s.b;
      const real = performance.now();
      this.rebuild(real);
      let now = real;
      if (b && b.physPending && !b.resolved) now = Math.min(now, b.physPending.tJ);
      const st = this.stateAt(now);
      if (!st) return;
      const tsc = b && b.tsc ? b.tsc : 0.5;
      this.pose = this.poseFrom(st.S, st.vReal, tsc, this.strokeLen(now - 160, now), st.c);
      // the swing meter shows the swing you'd make now (capped if cramped)
      const cap = b && b.physCap != null ? b.physCap : PHYS.MAX_BAT;
      this.speedNow = M.lerp(this.speedNow, Math.min(cap, this.pose.batSpeed), 0.5);
      // where you're pointing vs where the bat is (reach edge / bat lag)
      const tg = this.tgtRaw, Rb = this.reach(st.c, st.p);
      this.reachNow = Rb;
      this.pinned = !!tg && (tg.x < Rb.xLo - 0.03 || tg.x > Rb.xHi + 0.03 || tg.y < Rb.yLo - 0.03 || tg.y > Rb.yHi + 0.03);
      this.lagging = !!tg && Math.hypot(tg.x - st.S.x, tg.y - st.S.y) > 0.03;
    }

    // Display + input lag (ms). The frame showing the ball reaching you
    // lands on the screen ~2 frames after it's simulated, so a swing timed
    // to what you SEE arrives that much later: judge the bat then (the
    // rhythm-game rule), not at the simulated instant.
    latency() {
      const f = M.clamp(this.game.frameMs || 16.7, 4, 40);
      const set = this.game.save && this.game.save.data.settings;
      return Math.max(0, M.clamp(2 * f + 8, 16, 60) + (this.game.input.touchBat() ? PHYS.LAT_TOUCH_EXTRA : 0) + ((set && set.calib) || 0));
    }

    // Is the bat near the ball's crossing point, or on its way? Then freeze
    // at the crossing while we wait for the moment you actually saw.
    shouldFreeze() {
      const b = this.s.b;
      const B = BallPhys.posAt(b.plan, BallPhys.timeAtZ(b.plan, this.plane));
      this.rebuild(performance.now());
      const S = this.ptAt(performance.now());
      const reach = 0.45 + 6 * (this.latency() + (this.s.diff.physTimeAssist || 0)) / 1000;
      return this.game.input.touchBat() || this.speedNow > 2 || (!!S && Math.hypot(S.x - B.x, S.y - B.y) < reach);
    }

    /*
     * The ball has just crossed the hitting plane. Decide what happened,
     * using the bat exactly as it was at the crossing instant.
     */
    resolve(tCrossGame) {
      const s = this.s, b = s.b, plan = b.plan, D = s.diff;
      const tSim = BallPhys.timeAtZ(plan, this.plane);
      const B = BallPhys.posAt(plan, tSim);
      const vb = BallPhys.velAt(plan, tSim);
      const perfX = this.perfX != null ? this.perfX : this.game.perfAt(tCrossGame);
      this.perfX = null;
      this.rebuild(performance.now());
      let tSee = perfX + this.latency();               // when you SAW it arrive
      const tTrue = tSee;
      // Timing forgiveness (Club/Grade/State): use the moment within a few
      // ms either side when your sweet spot was closest to the ball.
      const W = D.physTimeAssist || 0;
      let usedDt = 0;
      if (W > 0) {
        const dAt = (t) => { const S = this.trkAt(t); return S ? Math.hypot(S.x - B.x, S.y - B.y) : Infinity; };
        // measured across the blade as it really was: the help may slide
        // contact toward the sweet spot, but never further off the face
        const at0 = this.trkAt(tTrue);
        const pA = at0 ? this.poseFrom(V.v(at0.x, at0.y, this.plane), this.swingAt(tTrue), b.tsc, this.strokeLen(tTrue - 130, tTrue + 30), at0.c) : null;
        const dw0 = pA ? pA.dir.x * pA.w.y - pA.dir.y * pA.w.x : 0;
        const acrossAt = (t) => {
          const S = this.trkAt(t);
          if (!S || Math.abs(dw0) < 0.08) return Infinity;
          return Math.abs((pA.dir.x * (B.y - S.y) - pA.dir.y * (B.x - S.x)) / dw0);
        };
        const acLim = Math.max(BLADE.HALF_W, acrossAt(tTrue));
        let best = dAt(tSee);
        for (let dt = -W; dt <= W; dt += 3) {
          const d = dAt(tSee + dt) + Math.abs(dt) * 0.0004;       // prefer the true moment
          if (d < best - 0.004 && acrossAt(tSee + dt) <= acLim + 1e-6) { best = d; usedDt = dt; }
        }
        tSee += usedDt;
      }
      const at = this.trkAt(tSee);
      const Sx = at ? V.v(at.x, at.y, this.plane) : null;
      const pose = Sx ? this.poseFrom(Sx, this.swingAt(tSee), b.tsc, this.strokeLen(tSee - 130, tSee + 30), at.c) : this.pose;
      const r = {
        phys: true, cls: 0, e: null, kind: 'phys', foot: b.foot || 'stance', notes: [], why: [], a: 0,
        fam: { key: 'phys', name: 'Your shot' }, runs: 0, out: false, contact: false, plane: this.plane,
      };
      if (!pose) { s._beaten(r, false); return r; }
      const crossNow = (pose.cross || 0) > 0.5;
      // Footwork, judged where your feet were when you saw it arrive: the
      // right foot for the length lets you swing freely.
      const feetJ = at ? at.p : this.feet;
      const dl = (D.footDeadline || 0.3) * 1000;
      // late feet = moving after your deadline, beyond a stride you'd
      // already committed to before it (a glide still finishing isn't late)
      const p0 = this.feetAt(tTrue - dl), g0 = this.goalAt(tTrue - dl);
      const moved = feetJ - M.clamp(feetJ, Math.min(p0, g0), Math.max(p0, g0));
      const ff = this.footFit(plan, feetJ, { spin: s.spin, cross: crossNow, y: B.y, bounced: tSim >= plan.T, moved, danced: !!b.danced });
      const fit = ff.fit;
      const cap = PHYS.MAX_BAT * (0.55 + 0.45 * fit);              // cramped / reaching: swing capped
      // Hanging the bat out, well away from your body
      const offBody = Math.abs(pose.S.x - CFG.PHYS.BODY_X * this.h);
      const reachU = crossNow ? 0 : M.clamp((offBody - 0.7) / 0.4, 0, 1);
      if (pose !== this.pose) {
        pose.batSpeed = Math.min(pose.batSpeed, cap) * (1 - 0.3 * reachU);
      }
      const rel = V.sub(B, pose.S);
      // Where the ball's line (it travels ~along z, and rel.z = 0) meets the
      // blade: solve rel = along*dir + across*w in the plane. A face turned
      // by the swipe then offers only its projected width, as drawn.
      const dw = pose.dir.x * pose.w.y - pose.dir.y * pose.w.x;
      if (!(Math.abs(dw) >= 0.08)) {                                  // blade edge-on to the ball: no face to hit
        s._beaten(r, true); r.label = 'MISSED'; r.physInfo = { ff, cap, speed: pose.batSpeed, cross: pose.cross || 0, B, miss: 'your bat was edge-on to it' };
        return r;
      }
      const along = (rel.x * pose.w.y - rel.y * pose.w.x) / dw;        // + toward the toe
      const across = (pose.dir.x * rel.y - pose.dir.y * rel.x) / dw;
      // The level's assist only widens the CONTACT zone: anything caught by
      // the extra margin is an edge, never a free middle.
      const assist = D.physAssist || 0;
      const halfW = BLADE.HALF_W;
      const inAlong = along >= -BLADE.UP - R && along <= BLADE.DOWN + R;
      const inAcross = Math.abs(across) <= halfW + R + assist;
      // Cross bat: past the top of the blade are your gloves and the handle.
      // A ball there is gloved: weak, and straight up (the classic hook /
      // down-the-leg-side dismissal).
      const gloved = crossNow && !inAlong && along < -BLADE.UP - R && along >= -BLADE.UP - R - 0.25 && Math.abs(across) <= 0.06 + R;
      r.physInfo = { assistMs: usedDt, along, across, speed: pose.batSpeed, yaw: pose.yaw, pitch: pose.pitch, B, S: pose.S, dir: pose.dir, n: pose.n, grip: pose.grip, cross: pose.cross || 0, ff, cap, capped: pose.batSpeed >= cap - 0.05 && fit < 0.95, reachU };
      this.ghost = { B, pose, t: this.game.clock };
      if (!((inAlong && inAcross) || gloved)) {
        // Missed it. Was it a shot or a leave?
        const near = Math.abs(across) < halfW + 0.3 && along > -BLADE.UP - 0.3 && along < BLADE.DOWN + 0.3;
        const offered = near;               // bat nowhere near it = you left it
        s._beaten(r, offered);
        r.label = offered ? 'MISSED' : 'LEFT';
        r.kind = offered ? 'phys' : 'leave';
        const topS = this.reach(0, feetJ).yHi;
        const overTop = along < -BLADE.UP - R;                       // passed above the handle end
        const crossKey = this.game.input.touchBat() ? 'drag the stance pad in' : 'hold Space';
        r.physInfo.miss = !crossNow && overTop && B.y > topS + 0.12 && Math.abs(across) < 0.4
          ? `too high for a straight bat (ball ${B.y.toFixed(2)} m, your reach ${topS.toFixed(2)} m): go back and ${crossKey} to pull, or leave it`
          : this._missText(rel, pose, B, tSee, along, across);
        return r;
      }
      // ---- contact ------------------------------------------------------------
      // Across the blade: on the face the contact normal IS the face; over
      // the edge it tilts toward the side (sin β = how far over the edge the
      // ball's centre is, in ball radii). A thick edge squirts square; a
      // feather barely changes the ball's path and carries on to the keeper
      // and slips. Anything only reached thanks to the level's assist is
      // turned into a thick edge, never a feather.
      const over = Math.abs(across) - halfW;
      const overEff = over > R ? R * 0.5 : over;
      const betaEdge = Math.asin(M.clamp(overEff / R, 0, 0.985));
      // Off-centre across the face twists the bat (cricket bat study, Peploe
      // 2018: ~3° at 1 cm, 10° at 2 cm, 24° at 3 cm — we use half, so it
      // teaches rather than feels random)
      const xcm = Math.min(4, Math.abs(across) * 100);
      const twist = 0.5 * Math.max(0, 605433 * Math.pow(xcm / 100, 3) - 6812 * Math.pow(xcm / 100, 2) + 494 * (xcm / 100) - 1.5) * D2R;
      const beta = Math.max(betaEdge, twist);
      // High on the blade pops it up (the face is laid back up there); off
      // the toe it's jammed into the ground.
      let loftAdj = M.clamp(-along * 30, -8, 10) * D2R * Math.abs(pose.dir.y);
      if (gloved) loftAdj += 25 * D2R;
      if (crossNow) {
        const bRel = (B.x - CFG.PHYS.BODY_X * this.h) * -this.h;      // + = off side of your body
        // no room to pull: a ball at your body, chest high
        if (bRel > -0.15 && bRel < 0.2 && B.y > 0.7) { loftAdj += 12 * D2R; pose.batSpeed *= 0.6; r.physInfo.noRoom = true; }
        // no width to cut: swiping to the off side at a ball close to you
        const toOff = V.dot(pose.vReal, V.v(-this.h, 0, 0)) > 0.5;
        if (toOff && bRel < 0.55 && B.y < 0.9) { loftAdj -= 10 * D2R; r.physInfo.noWidth = true; }
        // late on a rising ball: top edge; early rolls it over
        const tE = this._closestT(B, tTrue);
        if (vb.y > 0 && tE) loftAdj += M.clamp(tE * vb.y * 0.25, -10, 15) * D2R;
      }
      let nFace = pose.n;
      if (Math.abs(loftAdj) > 1e-4) nFace = V.norm(V.add(V.mul(nFace, Math.cos(loftAdj)), V.mul(V.v(0, 1, 0), Math.sin(loftAdj))));
      // Timing turns the face (baseball's "early pulls, late goes the other
      // way"). The bat keeps rotating through the swing, so arriving early
      // means the face has turned further: on a straight (vertical) swing it
      // has opened and the ball goes up; on a cross-bat (sideways) swing it's
      // dragged further round. Late is the reverse. Faster swings turn more
      // per ms, so a big swing is a bigger gamble. The level's gain softens it.
      const tErr = pose.batSpeed > 2.2 ? this._closestT(B, tTrue) : 0;
      let tRot = 0, tAxis = 'loft';
      if (tErr != null && tErr !== 0) {
        const gain = (D.physTimeGain != null ? D.physTimeGain : 1) * (1 + 0.25 * (1 - fit)) * (1 + 0.5 * reachU);
        tRot = M.clamp(gain * pose.batSpeed * (-tErr / 1000), -PHYS.TIME_ROT_MAX * D2R, PHYS.TIME_ROT_MAX * D2R);
        const cam = this.game.cam;
        const rH = V.norm(V.v(cam.r.x, 0, cam.r.z));
        const spv = Math.hypot(pose.vReal.x, pose.vReal.y) + 1e-6;
        const fx = V.dot(pose.vReal, rH) / spv, fy = Math.abs(pose.vReal.y) / spv;
        tAxis = Math.abs(fx) > fy ? 'line' : 'loft';
        nFace = V.norm(V.add(nFace, V.add(V.mul(V.v(0, 1, 0), Math.sin(tRot) * fy), V.mul(rH, Math.sin(tRot) * fx))));
      }
      const nEff = V.norm(V.add(V.mul(nFace, Math.cos(beta)), V.mul(pose.w, Math.sign(across || 1) * Math.sin(beta))));
      // collision efficiency by where it hit the blade (the level's assist
      // pulls contact toward the middle of the bat)
      const dMid = Math.abs(along) * (1 - (D.physMagnet || 0));
      let q = PHYS.Q_MAX * (1 - 0.75 * Math.pow(Math.min(1, dMid / 0.24), 2));
      if (along < -0.3) q *= 0.55;                                 // up on the splice
      q *= 1 - 0.5 * Math.sin(betaEdge);
      q *= 1 - 0.02 * xcm;                                          // ~2% per cm off the middle, across
      const soft = pose.batSpeed < 2.2;
      if (soft) q *= 0.5;                                          // soft hands: dead bat
      if (usedDt) q *= 1 - 0.3 * (Math.abs(usedDt) / W);           // being bailed out costs a little
      q *= 0.9 + 0.1 * fit;                                        // wrong foot: not quite as clean
      if (gloved) q = 0.08;
      const vBat = V.add(V.mul(pose.n, pose.batSpeed), V.mul(V.v(pose.vReal.x, pose.vReal.y, 0), 0.3));
      const vbn = V.dot(vb, nEff), vbatn = V.dot(vBat, nEff);
      const vnOut = -q * vbn + (1 + q) * vbatn;
      const vbT = V.sub(vb, V.mul(nEff, vbn)), vbatT = V.sub(vBat, V.mul(nEff, vbatn));
      // Along the face, friction drags the ball toward rolling with the bat
      // (a sphere keeps ~5/7 of its slide), but a glancing touch hasn't the
      // grip to do even that: a feather keeps nearly all its pace.
      const vrT = V.sub(vbT, vbatT);
      const grip = Math.min(2 / 7, 0.5 * Math.abs(vbn - vbatn) / (V.len(vrT) + 1e-6));
      let vOut = V.add(V.mul(nEff, vnOut), V.add(vbatT, V.mul(vrT, 1 - grip)));
      // never through the bat
      if (V.dot(vOut, nEff) < 0.5) vOut = V.add(vOut, V.mul(nEff, 0.5 - V.dot(vOut, nEff)));
      const speed = V.len(vOut);
      const horiz = Math.hypot(vOut.x, vOut.z);
      const phi = Math.atan2(vOut.x, vOut.z);
      const loft = Math.atan2(vOut.y, horiz);
      const edge = betaEdge > 15 * D2R;
      // "Middled" means middle of the bat AND on time: never tell someone
      // they nailed it when the timing was off (the game only bailed them out)
      const tAbs = Math.abs(tErr || 0);
      const middled = !gloved && !edge && dMid < 0.09 && pose.batSpeed > 8 && tAbs < 15;
      r.contact = true;
      r.exitVel = vOut; r.exitPhi = phi; r.exitSpeed = speed; r.exitLoft = loft;
      r.physInfo.q = q; r.physInfo.exit = speed; r.physInfo.edge = edge; r.physInfo.launch = loft / D2R;
      r.physInfo.tErr = tErr || 0; r.physInfo.tRot = tRot / D2R; r.physInfo.tAxis = tAxis;
      // which edge: top/bottom on a cross bat, outside (off side)/inside on a straight one
      const sideV = V.mul(pose.w, Math.sign(across || 1));
      r.physInfo.edgeName = (pose.cross || 0) > 0.5 ? (sideV.y > 0 ? 'top edge' : 'bottom edge') : (sideV.x * -this.h > 0 ? 'outside edge' : 'inside edge');
      r.label = gloved ? 'GLOVED' : edge ? 'EDGED' : soft ? 'BLOCKED' : middled ? 'MIDDLED' : tAbs >= 30 ? 'MISTIMED' : q > 0.15 ? 'TIMED' : 'MISHIT';
      r.cls = r.label === 'MIDDLED' ? 3 : r.label === 'TIMED' || r.label === 'BLOCKED' ? 2 : 1;
      r.pure = middled && pose.batSpeed > 20;
      if (soft && !edge) r.kindRes = 'block';
      // ---- where does it go? ---------------------------------------------------
      // back onto the stumps?
      if (vOut.z < -0.2) {
        const t = B.z / -vOut.z;
        const xs = B.x + vOut.x * t, ys = B.y + vOut.y * t - 4.905 * t * t;
        if (Math.abs(xs) < 0.14 && ys > -0.3 && ys < 0.75) {
          r.out = true; r.how = 'bowled'; r.call = 'Played on!'; r.sub = 'Dragged it back onto the stumps'; r.playedOn = true;
          return r;
        }
      }
      const F = s.field;
      let pr;
      const rel2 = M.deg(M.wrapAng(phi * -this.h));   // batter-relative (+off)
      if (Math.abs(rel2) > 115 && loft > 0.02) {
        pr = this._cordon(F, phi, speed, loft, B.y) || F.project(phi, speed * 0.7, 0);
      } else {
        pr = F.project(phi, speed, loft > 0.1 ? loft : 0, { pure: r.pure });
      }
      F.last = pr;
      s._applyProjection(r, pr);
      if (r.label === 'BLOCKED' && !r.out) { r.call = 'Blocked'; r.sub = 'Dead bat'; }
      else if (edge && !r.out) r.call = r.runs ? `Edged — ${r.runs === 4 ? 'FOUR' : r.runs}` : 'Edged';
      else if (edge && r.out) r.call = `Edged — caught${pr.fielder ? ' by ' + pr.fielder : ''}!`;
      return r;
    }

    // Keeper / slips / gully: does the edge carry to a catcher on that line?
    _cordon(F, phi, v, loft, h0) {
      const dir = Field.dir(phi);
      const vh = v * Math.cos(loft), vy = v * Math.sin(loft);
      const yAt = (d) => { const t = d / Math.max(0.1, vh); return h0 + vy * t - 4.905 * t * t; };
      for (const p of F.players) {
        if (!/keeper|slip|gully|short leg/.test(p.name)) continue;
        const along = p.x * dir.x + p.z * dir.z;
        if (along <= 0) continue;
        const perp = Math.abs(p.x * dir.z - p.z * dir.x);
        const dist = Math.hypot(p.x, p.z);
        const reach = Math.min(p.name === 'keeper' ? 1.8 : 1.5, 0.3 + 0.11 * dist);
        const y = yAt(along);
        if (perp <= reach && y > 0.08 && y < 2.4) {
          return { runs: 0, out: true, how: 'caught', fielder: p.name, kind: 'caught', airborne: true, phi, path: [{ x: 0, z: 0 }, { x: p.x, z: p.z }] };
        }
      }
      return null;
    }

    // When (ms, relative to tSee) did the sweet spot's path come closest to
    // the ball's crossing point? Negative = the bat got there early.
    _closestT(B, tSee) {
      let best = Infinity, bestT = 0;
      for (let dt = -90; dt <= 90; dt += 2) {
        const S = this.trkAt(tSee + dt);
        if (!S) continue;
        const d = Math.hypot(S.x - B.x, S.y - B.y) + Math.abs(dt) * 1e-5;
        if (d < best) { best = d; bestT = dt; }
      }
      return best < 0.3 ? bestT : 0;
    }

    _missText(rel, pose, B, tSee, alongIn, acrossIn) {
      // Did the bat pass through the ball's spot at all? Then it's timing.
      if (B && tSee != null) {
        let best = Infinity, bestT = 0;
        for (let dt = -220; dt <= 160; dt += 4) {
          const S = this.trkAt(tSee + dt);
          if (!S) continue;
          const d = Math.hypot(S.x - B.x, S.y - B.y);
          if (d < best) { best = d; bestT = dt; }
        }
        if (best < 0.09 && Math.abs(bestT) >= 12) return `your bat went through its spot ${Math.abs(bestT)} ms ${bestT < 0 ? 'early' : 'late'}`;
      }
      // Express the miss in screen terms: which way was the ball from the bat?
      const cam = this.game.cam;
      const up = V.dot(rel, V.v(0, 1, 0));
      const side = V.dot(rel, cam.r);
      const across = Math.abs(acrossIn) - BLADE.HALF_W - R;
      const alongOut = alongIn > BLADE.DOWN + R || alongIn < -BLADE.UP - R;
      const cm = (m) => Math.max(1, Math.round(m * 100));
      if ((pose.cross || 0) > 0.5) {
        // a horizontal bat: missing across it is over / under, missing along it is past an end
        if (!alongOut && across > 0) return `ball passed ${cm(across)} cm ${up > 0 ? 'over' : 'under'} the bat`;
        return alongIn > 0 ? 'ball passed beyond the toe of the bat' : 'ball passed inside, by your hands';
      }
      if (!alongOut && across > 0) return `ball passed ${cm(across)} cm to the ${side > 0 ? 'right' : 'left'} of the bat`;
      return `ball passed ${up > 0 ? 'over' : 'under'} the bat`;
    }

    // ---- drawing -----------------------------------------------------------------
    queue(queue, cam) {
      const p = this.pose;
      if (!p) return;
      const s = this.s;
      const g = {
        top: V.sub(p.grip, V.mul(p.dir, 0.15)),
        shoulder: V.add(p.grip, V.mul(p.dir, 0.16)),
        toe: V.add(p.grip, V.mul(p.dir, 0.71)),
        sweet: p.S, side: p.w, face: p.n, dir: p.dir, halfW: BLADE.HALF_W,
      };
      const kit = Figure.KITS.batter;
      const d = cam.depth(p.S) + 0.05;
      queue.push({
        z: d,
        draw: (ctx) => {
          ctx.save();
          Figure.drawBat(ctx, cam, g, { kit });
          // gloves on the handle
          const gl = cam.project(V.sub(p.grip, V.mul(p.dir, 0.05)));
          if (gl) {
            const r = Math.max(4, 0.06 * gl.s);
            ctx.fillStyle = '#1f5a9e'; ctx.beginPath(); ctx.arc(gl.x, gl.y, r * 1.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f7f7f2'; ctx.beginPath(); ctx.arc(gl.x - r * 0.15, gl.y - r * 0.15, r * 0.85, 0, Math.PI * 2); ctx.fill();
          }
          // the sweet spot, faintly
          const sw = cam.project(p.S);
          if (sw) {
            ctx.strokeStyle = 'rgba(242,193,78,0.55)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sw.x, sw.y, Math.max(3, 0.035 * sw.s), 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
        },
      });
      // Your reach, drawn faintly on the hitting plane (brighter near its
      // edge). On Club / Grade it's tinted by how right your feet are for
      // this ball. A thin tether shows where you're pointing whenever the
      // bat can't be there (past your reach, or trailing a heavy bat).
      const tg = this.tgtRaw, Rb = this.reachNow, bb = this.s.b;
      if (Rb) {
        const P = tg ? V.v(tg.x, tg.y, this.plane) : null;
        const near = tg ? Math.min(tg.x - Rb.xLo, Rb.xHi - tg.x, tg.y - Rb.yLo, Rb.yHi - tg.y) : 1;
        const ef = bb && bb.envFit != null ? bb.envFit : null;
        queue.push({
          z: cam.depth(p.S) + 0.3,
          draw: (ctx) => {
            const cs = [[Rb.xLo, Rb.yLo], [Rb.xHi, Rb.yLo], [Rb.xHi, Rb.yHi], [Rb.xLo, Rb.yHi]].map(([x, y]) => cam.project(V.v(x, y, this.plane)));
            if (!cs.every(Boolean)) return;
            ctx.save();
            const edgeA = this.pinned ? 0.55 : M.clamp(0.1 + (0.15 - near) / 0.15 * 0.3, 0.1, 0.4);
            if (ef != null) {
              ctx.fillStyle = ef >= 0.9 ? 'rgba(95,210,138,0.10)' : ef >= 0.7 ? 'rgba(242,193,78,0.10)' : 'rgba(255,107,110,0.12)';
              ctx.beginPath(); cs.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = ef == null ? `rgba(246,241,227,${edgeA})` : ef >= 0.9 ? `rgba(95,210,138,${edgeA + 0.15})` : ef >= 0.7 ? `rgba(242,193,78,${edgeA + 0.15})` : `rgba(255,107,110,${edgeA + 0.15})`;
            ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
            ctx.beginPath(); cs.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.closePath(); ctx.stroke();
            ctx.setLineDash([]);
            if (P && (this.pinned || this.lagging)) {
              const q = cam.project(P), sw = cam.project(p.S);
              if (q && sw) {
                ctx.strokeStyle = this.pinned ? 'rgba(255,157,107,0.7)' : 'rgba(246,241,227,0.45)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sw.x, sw.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.stroke();
              }
            }
            ctx.restore();
          },
        });
      }
      // Ghost of the last crossing: where the ball went through vs your bat
      const gh = this.ghost;
      if (gh && this.game.clock - gh.t < 2.2) {
        const a = M.clamp(1 - (this.game.clock - gh.t - 1.2), 0, 1);
        queue.push({
          z: cam.depth(gh.B) - 0.2,
          draw: (ctx) => {
            const q = cam.project(gh.B);
            const sp = cam.project(gh.pose.S);
            if (!q || !sp) return;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.strokeStyle = '#ff6b6e'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(4, R * q.s * 1.4), 0, Math.PI * 2); ctx.stroke();
            const top = cam.project(V.sub(gh.pose.S, V.mul(gh.pose.dir, BLADE.UP)));
            const toe = cam.project(V.add(gh.pose.S, V.mul(gh.pose.dir, BLADE.DOWN)));
            if (top && toe) {
              ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([4, 3]);
              ctx.lineWidth = Math.max(2, BLADE.HALF_W * 2 * sp.s);
              ctx.globalAlpha = a * 0.35;
              ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(toe.x, toe.y); ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.restore();
          },
        });
      }
    }
  }

  PhysBat.batSpeedOf = batSpeedOf;
  PhysBat.BLADE = BLADE;
  PhysBat.PHYS = PHYS;
  CLLM.PhysBat = PhysBat;
})();
