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
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, BallPhys, Field, World, Figure } = CLLM;
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
      this.plane = 1.45;
      this.pose = null;       // current (display) bat pose
      this.ghost = null;      // what happened at the last crossing
      this.speedNow = 0;      // current bat speed (m/s, physical)
      this.peak = 0;          // bat speed at the last contact
    }

    setPlane(z) { this.plane = z; }

    // Pointer pixel -> point on the hitting plane z = plane.
    planePoint(px, py) {
      const cam = this.game.cam;
      if (this.game.input.touchBat()) py -= PHYS.TOUCH_LIFT;
      const dx = (px - cam.cx) / cam.focal, dy = -(py - cam.cy) / cam.focal;
      const dir = V.norm(V.add(cam.f, V.add(V.mul(cam.r, dx), V.mul(cam.u, dy))));
      if (Math.abs(dir.z) < 1e-4) return null;
      const t = (this.plane - cam.pos.z) / dir.z;
      if (t <= 0) return null;
      const p = V.add(cam.pos, V.mul(dir, t));
      p.x = M.clamp(p.x, -1.25, 1.25);
      p.y = M.clamp(p.y, 0.03, 2.2);
      p.z = this.plane;
      return p;
    }

    // Where the sweet spot was, and how fast it was moving, at perf time s (ms).
    stateAt(sMs) {
      const I = this.game.input;
      const a = I.sampleAt(sMs);
      const S = this.planePoint(a.x, a.y);
      if (!S) return null;
      return { S, vReal: this.velAt(sMs, PHYS.VEL_WINDOW) };
    }

    // Least-squares velocity (m/s at the plane) over [sMs - win, sMs].
    velAt(sMs, win, win2 = 0) {
      const I = this.game.input, h = I.hist;
      const pts = [];
      for (let i = h.length - 1; i >= 0; i--) {
        const e = h[i];
        if (e.s > sMs + win2) continue;
        if (e.s < sMs - win) break;
        const p = this.planePoint(e.x, e.y);
        if (p) pts.push({ t: e.s / 1000, x: p.x, y: p.y });
      }
      if (pts.length < 3) {
        // (never across the start of a new touch: that jump isn't a swing)
        const t0 = I.rest && I.rest.until > sMs - win && I.rest.until < sMs + win2 ? I.rest.until : sMs - win;
        const A = I.sampleAt(sMs + win2), B = I.sampleAt(t0);
        const pa = this.planePoint(A.x, A.y), pb = this.planePoint(B.x, B.y);
        if (!pa || !pb) return V.v();
        const dt = Math.max(0.005, (sMs + win2 - t0) / 1000);
        return V.v((pa.x - pb.x) / dt, (pa.y - pb.y) / dt, 0);
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

    // How far the sweet spot actually travelled from sMs0 to sMs1 (straight
    // line on the plane). A real stroke covers ground; a wrist twitch doesn't.
    strokeLen(sMs0, sMs1) {
      const I = this.game.input;
      if (I.rest && I.rest.until > sMs0 && I.rest.until < sMs1) sMs0 = I.rest.until;
      const a = I.sampleAt(sMs0), c = I.sampleAt(sMs1);
      const A = this.planePoint(a.x, a.y), C = this.planePoint(c.x, c.y);
      return A && C ? Math.hypot(C.x - A.x, C.y - A.y) : 0;
    }

    // Build the full bat pose from the sweet spot and its velocity.
    // strokeL (m) caps the power by how long the stroke was.
    // tsc converts real-time speed into physical speed (the ball is slowed
    // on easier levels, so your swing is relatively faster).
    poseFrom(S, vReal, tsc, strokeL) {
      const h = this.h;
      // A straight bat: nearly upright, leaning only a little toward where
      // you're reaching, hands a touch ahead of the blade. (Straight = the
      // whole blade sweeps through the ball's line on a straight swing;
      // cross-bat swings only have the bat's width to work with.)
      const bodyX = 0.2 * h;
      const lean = M.clamp((S.x - bodyX) * 0.22, -0.3, 0.3);
      let dir = V.norm(V.v(lean, -1, -0.12));
      const grip = V.sub(S, V.mul(dir, BLADE.GRIP));
      const H = grip;
      // swing: pointer speed -> bat speed (measured in real time, so the
      // slowed ball on easy levels doesn't turn every nudge into a six)
      const vPlane = V.v(vReal.x, vReal.y, 0);
      const spReal = V.len(vPlane);
      let batSpeed = batSpeedOf(spReal);
      if (strokeL != null) batSpeed = Math.min(batSpeed, PHYS.MAX_BAT * Math.sqrt(Math.min(1, strokeL / PHYS.STROKE_FULL)));
      // face: toward the bowler, turned by the swipe direction AS SEEN ON
      // SCREEN (swipe right = hit it to the right of the screen)
      const cam = this.game.cam;
      const rH = V.norm(V.v(cam.r.x, 0, cam.r.z));
      const sx = V.dot(vReal, rH), sy = vReal.y;
      const u = spReal / (spReal + 1.2);                      // slow moves barely turn the face
      const yaw = M.clamp((sx / (spReal + 1e-6)) * u * 55, -50, 50) * D2R;
      // hands slightly ahead of the blade: the face looks a touch down unless you swing up
      const pitch = (M.clamp((sy / (spReal + 1e-6)) * u * 50, -10, 45) - 5 - (batSpeed < 2.2 ? 14 : 0)) * D2R;
      const fwd = V.v(0, 0, 1);
      let n = V.add(V.add(V.mul(fwd, Math.cos(yaw) * Math.cos(pitch)), V.mul(rH, Math.sin(yaw) * Math.cos(pitch))), V.v(0, Math.sin(pitch), 0));
      // The swipe alone sets the face (so "swipe right = goes right" holds
      // wherever the bat is); the blade's lean only matters for drawing.
      n = V.norm(n);
      if (n.z < 0.15) n = V.norm(V.v(n.x, n.y, 0.15));
      let w = V.cross(dir, n);
      if (V.len(w) < 1e-3) w = V.v(1, 0, 0);
      w = V.norm(w);                                          // across the blade
      return { S, H, dir, grip, n, w, batSpeed, vReal, yaw, pitch };
    }

    // Per-frame display pose (from the latest pointer sample).
    update() {
      const s = this.s, b = s.b;
      let now = performance.now();
      if (b && b.physPending && !b.resolved) now = Math.min(now, b.physPending.tJ);
      const st = this.stateAt(now);
      if (!st) return;
      const tsc = b && b.tsc ? b.tsc : 0.5;
      this.pose = this.poseFrom(st.S, st.vReal, tsc, this.strokeLen(now - 160, now));
      this.speedNow = M.lerp(this.speedNow, this.pose.batSpeed, 0.5);
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
      const a = this.game.input.sampleAt(performance.now());
      const S = this.planePoint(a.x, a.y);
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
      let tSee = perfX + this.latency();               // when you SAW it arrive
      const tTrue = tSee;
      // Timing forgiveness (Club/Grade/State): use the moment within a few
      // ms either side when your sweet spot was closest to the ball.
      const W = D.physTimeAssist || 0;
      let usedDt = 0;
      if (W > 0) {
        const dAt = (t) => { const a = this.game.input.sampleAt(t); const S = this.planePoint(a.x, a.y); return S ? Math.hypot(S.x - B.x, S.y - B.y) : Infinity; };
        let best = dAt(tSee);
        for (let dt = -W; dt <= W; dt += 3) {
          const d = dAt(tSee + dt) + Math.abs(dt) * 0.0004;       // prefer the true moment
          if (d < best - 0.004) { best = d; usedDt = dt; }
        }
        tSee += usedDt;
      }
      const at = this.game.input.sampleAt(tSee);
      const Sx = this.planePoint(at.x, at.y);
      const pose = Sx ? this.poseFrom(Sx, this.swingAt(tSee), b.tsc, this.strokeLen(tSee - 130, tSee + 30)) : this.pose;
      const r = {
        phys: true, cls: 0, e: null, kind: 'phys', foot: b.foot || 'stance', notes: [], why: [], a: 0,
        fam: { key: 'phys', name: 'Your shot' }, runs: 0, out: false, contact: false, plane: this.plane,
      };
      if (!pose) { s._beaten(r, false); return r; }
      const rel = V.sub(B, pose.S);
      // Where the ball's line (it travels ~along z, and rel.z = 0) meets the
      // blade: solve rel = along*dir + across*w in the plane. A face turned
      // by the swipe then offers only its projected width, as drawn.
      const dw = pose.dir.x * pose.w.y - pose.dir.y * pose.w.x;
      const along = (rel.x * pose.w.y - rel.y * pose.w.x) / dw;        // + toward the toe
      const across = (pose.dir.x * rel.y - pose.dir.y * rel.x) / dw;
      // The level's assist only widens the CONTACT zone: anything caught by
      // the extra margin is an edge, never a free middle.
      const assist = D.physAssist || 0;
      const halfW = BLADE.HALF_W;
      const inAlong = along >= -BLADE.UP - R && along <= BLADE.DOWN + R;
      const inAcross = Math.abs(across) <= halfW + R + assist;
      r.physInfo = { assistMs: usedDt, along, across, speed: pose.batSpeed, yaw: pose.yaw, pitch: pose.pitch, B, S: pose.S, dir: pose.dir, n: pose.n, grip: pose.grip };
      this.ghost = { B, pose, t: this.game.clock };
      if (!(inAlong && inAcross)) {
        // Missed it. Was it a shot or a leave?
        const near = Math.abs(across) < halfW + 0.3 && along > -BLADE.UP - 0.3 && along < BLADE.DOWN + 0.3;
        const offered = near;               // bat nowhere near it = you left it
        s._beaten(r, offered);
        r.label = offered ? 'MISSED' : 'LEFT';
        r.kind = offered ? 'phys' : 'leave';
        r.physInfo.miss = this._missText(rel, pose, B, tSee, along, across);
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
      const loftAdj = M.clamp(-along * 30, -8, 10) * D2R;
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
        const gain = D.physTimeGain != null ? D.physTimeGain : 1;
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
      const middled = !edge && dMid < 0.09 && pose.batSpeed > 8 && tAbs < 15;
      r.contact = true;
      r.exitVel = vOut; r.exitPhi = phi; r.exitSpeed = speed; r.exitLoft = loft;
      r.physInfo.q = q; r.physInfo.exit = speed; r.physInfo.edge = edge; r.physInfo.launch = loft / D2R;
      r.physInfo.tErr = tErr || 0; r.physInfo.tRot = tRot / D2R; r.physInfo.tAxis = tAxis;
      r.label = edge ? 'EDGED' : soft ? 'BLOCKED' : middled ? 'MIDDLED' : tAbs >= 30 ? 'MISTIMED' : q > 0.15 ? 'TIMED' : 'MISHIT';
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
        const a = this.game.input.sampleAt(tSee + dt);
        const S = this.planePoint(a.x, a.y);
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
          const a = this.game.input.sampleAt(tSee + dt);
          const S = this.planePoint(a.x, a.y);
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
