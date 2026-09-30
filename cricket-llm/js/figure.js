/*
 * FIGURE
 * ======
 * A tiny procedural skeleton for the batter and the bowler.
 *
 * Animation code only supplies a handful of "driver" targets (pelvis, facing,
 * chest lean, feet, hands, look-at point). Knees and elbows are solved with
 * two-bone IK, then every limb is pushed into the shared render queue as a
 * shaded tube so it depth-sorts against the ball, stumps and bat.
 *
 * Poses are authored in a canonical RIGHT-HANDED frame (off side = -x) and
 * mirrored in x for left-handers / left-arm bowlers.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, World } = CLLM;

  const RIG = {
    HIP: 0.1, SHO: 0.19, SPINE: 0.46, NECK: 0.1, HEAD_R: 0.112,
    THIGH: 0.46, SHIN: 0.45, FOOT: 0.2, UPPER: 0.3, FORE: 0.29,
  };

  const KITS = {
    batter: {
      shirt: '#f4f1e6', shirtShade: '#cfc8b4', pants: '#f1ede0', pantsShade: '#c9c2ad',
      pads: '#fbfbf7', padsShade: '#c8c8c0', shoes: '#f2f2ee', gloves: '#f7f7f2', glovesTrim: '#1f5a9e',
      helmet: '#15294a', grille: '#c9d0d6', skin: '#d9a07a', skinShade: '#a8704f',
      bat: '#ead3a0', batEdge: '#b58c52', grip: '#2b2f3a', sleeve: '#f4f1e6',
    },
    bowler: {
      shirt: '#7a1f2d', shirtShade: '#4f121c', pants: '#f1ede0', pantsShade: '#c9c2ad',
      pads: null, shoes: '#f5f5f0', gloves: null,
      cap: '#15294a', skin: '#b87a52', skinShade: '#86553a', sleeve: '#7a1f2d',
    },
  };

  const SKINS = [['#e2b08e', '#b27d5c'], ['#d19a72', '#9e6a4a'], ['#b87a52', '#86553a'], ['#8d5a3b', '#5f3a25'], ['#6b4430', '#452a1c']];

  function mirrorX(p) { return { x: -p.x, y: p.y, z: p.z }; }

  class Figure {
    constructor(kind, kit) {
      this.kind = kind;
      this.kit = Object.assign({}, kit || KITS[kind]);
      this.mirror = false;       // true for left-handers / left-arm
      this.J = null;             // solved joints (world space)
      this.bat = null;           // {grip, dir, face} world space (batter)
      this.ball = null;          // ball held in hand (world pos) or null
      this.alpha = 1;
    }

    setSkin(i) {
      const s = SKINS[((i % SKINS.length) + SKINS.length) % SKINS.length];
      this.kit.skin = s[0]; this.kit.skinShade = s[1];
    }

    // Solve the skeleton from driver targets (canonical frame).
    // p = {pelvis, facing:{x,z}, chestFacing, lean, lookAt, lFoot, rFoot,
    //      lToe, rToe (dirs), lHand, rHand, bat?}
    solve(p) {
      const up = V.v(0, 1, 0);
      const fH = V.norm(V.v(p.facing.x, 0, p.facing.z));
      const fC = V.norm(V.v((p.chestFacing || p.facing).x, 0, (p.chestFacing || p.facing).z));
      const leftH = V.rotY(fH, Math.PI / 2);
      const leftC = V.rotY(fC, Math.PI / 2);
      const pel = p.pelvis;
      const lHip = V.add(pel, V.mul(leftH, RIG.HIP));
      const rHip = V.sub(pel, V.mul(leftH, RIG.HIP));
      const lean = p.lean || V.v();
      const chest = V.add(pel, V.add(V.mul(up, RIG.SPINE), lean));
      const lSho = V.add(chest, V.mul(leftC, RIG.SHO));
      const rSho = V.sub(chest, V.mul(leftC, RIG.SHO));
      const spineDir = V.norm(V.sub(chest, pel));
      const neck = V.add(chest, V.mul(spineDir, RIG.NECK));
      let head = V.add(neck, V.mul(spineDir, RIG.HEAD_R + 0.02));
      if (p.lookAt) {
        const toL = V.norm(V.sub(p.lookAt, head));
        head = V.add(head, V.mul(toL, 0.03));
      }
      // Legs
      const lAnk = p.lFoot, rAnk = p.rFoot;
      const lToeD = V.norm(p.lToe || fH), rToeD = V.norm(p.rToe || fH);
      const lKnee = M.ik2(lHip, lAnk, RIG.THIGH, RIG.SHIN, V.add(lToeD, V.v(0, 0.15, 0)));
      const rKnee = M.ik2(rHip, rAnk, RIG.THIGH, RIG.SHIN, V.add(rToeD, V.v(0, 0.15, 0)));
      const lToe = V.add(V.v(lAnk.x, Math.max(0.03, lAnk.y - 0.05), lAnk.z), V.mul(lToeD, RIG.FOOT));
      const rToe = V.add(V.v(rAnk.x, Math.max(0.03, rAnk.y - 0.05), rAnk.z), V.mul(rToeD, RIG.FOOT));
      // Arms
      const down = V.v(0, -1, 0);
      const lPole = p.lElbowPole || V.add(V.mul(leftC, 0.7), V.add(down, V.mul(fC, -0.2)));
      const rPole = p.rElbowPole || V.add(V.mul(leftC, -0.7), V.add(down, V.mul(fC, -0.2)));
      const lElb = M.ik2(lSho, p.lHand, RIG.UPPER, RIG.FORE, lPole);
      const rElb = M.ik2(rSho, p.rHand, RIG.UPPER, RIG.FORE, rPole);
      const lHand = reach(lSho, lElb, p.lHand, RIG.FORE);
      const rHand = reach(rSho, rElb, p.rHand, RIG.FORE);

      let J = { pel, lHip, rHip, chest, lSho, rSho, neck, head, lKnee, rKnee, lAnk, rAnk, lToe, rToe, lElb, rElb, lHand, rHand, facing: fC };
      // If the arms couldn't reach, the bat stays in the hands (top hand = left in this frame)
      let bat = p.bat ? { grip: V.add(lHand, V.mul(V.norm(p.bat.dir), 0.07)), dir: V.norm(p.bat.dir), face: V.norm(p.bat.face || fH) } : null;
      if (this.mirror) {
        const J2 = {};
        for (const k in J) J2[k] = mirrorX(J[k]);
        J = J2;
        if (bat) bat = { grip: mirrorX(bat.grip), dir: mirrorX(bat.dir), face: mirrorX(bat.face) };
      }
      this.J = J;
      this.bat = bat;
      return J;
    }

    // Blade geometry of the bat in world space.
    batGeom() {
      const b = this.bat;
      if (!b) return null;
      const side = V.norm(V.cross(b.dir, b.face));
      const top = V.sub(b.grip, V.mul(b.dir, 0.15));
      const shoulder = V.add(b.grip, V.mul(b.dir, 0.16));
      const toe = V.add(b.grip, V.mul(b.dir, 0.71));
      const sweet = V.add(b.grip, V.mul(b.dir, 0.55));
      return { top, shoulder, toe, sweet, side, face: b.face, dir: b.dir, halfW: 0.054 };
    }

    // Push shaded limb primitives into the render queue.
    queue(queue, cam, shadows) {
      const J = this.J;
      if (!J) return;
      const k = this.kit;
      const a = this.alpha;
      const isBat = this.kind === 'batter';
      const prims = [];
      const tube = (p0, p1, w, col, shade) => prims.push({ t: 'tube', p0, p1, w, col, shade });
      // Legs
      tube(J.lHip, J.lKnee, 0.15, k.pants, k.pantsShade);
      tube(J.rHip, J.rKnee, 0.15, k.pants, k.pantsShade);
      if (isBat && k.pads) {
        tube(V.lerp(J.lKnee, J.lHip, 0.12), J.lAnk, 0.17, k.pads, k.padsShade);
        tube(V.lerp(J.rKnee, J.rHip, 0.12), J.rAnk, 0.17, k.pads, k.padsShade);
      } else {
        tube(J.lKnee, J.lAnk, 0.12, k.pants, k.pantsShade);
        tube(J.rKnee, J.rAnk, 0.12, k.pants, k.pantsShade);
      }
      tube(J.lAnk, J.lToe, 0.095, k.shoes, '#9a9a94');
      tube(J.rAnk, J.rToe, 0.095, k.shoes, '#9a9a94');
      // Torso: pelvis block + chest block
      prims.push({ t: 'torso', pts: [J.lHip, J.rHip, J.rSho, J.lSho], col: k.shirt, shade: k.shirtShade });
      tube(J.chest, J.neck, 0.11, k.skin, k.skinShade);
      // Arms
      tube(J.lSho, J.lElb, 0.105, k.sleeve, k.shirtShade);
      tube(J.rSho, J.rElb, 0.105, k.sleeve, k.shirtShade);
      tube(J.lElb, J.lHand, 0.085, k.skin, k.skinShade);
      tube(J.rElb, J.rHand, 0.085, k.skin, k.skinShade);
      if (isBat && k.gloves) {
        prims.push({ t: 'ball', p: J.lHand, r: 0.058, col: k.gloves, shade: k.glovesTrim });
        prims.push({ t: 'ball', p: J.rHand, r: 0.058, col: k.gloves, shade: k.glovesTrim });
      } else {
        prims.push({ t: 'ball', p: J.lHand, r: 0.045, col: k.skin, shade: k.skinShade });
        prims.push({ t: 'ball', p: J.rHand, r: 0.045, col: k.skin, shade: k.skinShade });
      }
      // Head (skipped when ghosted, e.g. in the batter's-eye camera)
      if (a >= 0.2) prims.push({ t: 'head', p: J.head, r: RIG.HEAD_R, fig: this });
      // Bat
      if (this.bat) prims.push({ t: 'bat', g: this.batGeom() });
      // Ball in hand
      if (this.ball) prims.push({ t: 'ball', p: this.ball, r: 0.036, col: '#b3202a', shade: '#6d0f16' });

      // Shadows (flattened onto the ground, drawn before everything else)
      if (shadows) {
        const sh = (p0, p1, w) => shadows.push({ p0: World.shadowOf(p0), p1: World.shadowOf(p1), w });
        sh(J.lAnk, J.lKnee, 0.16); sh(J.rAnk, J.rKnee, 0.16);
        sh(J.lKnee, J.lHip, 0.16); sh(J.rKnee, J.rHip, 0.16);
        sh(J.pel, J.chest, 0.34); sh(J.chest, J.head, 0.2);
        sh(J.lSho, J.lElb, 0.1); sh(J.rSho, J.rElb, 0.1);
        sh(J.lElb, J.lHand, 0.09); sh(J.rElb, J.rHand, 0.09);
        if (this.bat) { const g = this.batGeom(); sh(g.top, g.toe, 0.1); }
      }

      for (const pr of prims) {
        let d;
        if (pr.t === 'tube') d = cam.depth(V.lerp(pr.p0, pr.p1, 0.5));
        else if (pr.t === 'torso') d = cam.depth(V.lerp(V.lerp(pr.pts[0], pr.pts[1], 0.5), V.lerp(pr.pts[2], pr.pts[3], 0.5), 0.5)) + 0.02;
        else if (pr.t === 'bat') d = cam.depth(V.lerp(pr.g.top, pr.g.toe, 0.5));
        else d = cam.depth(pr.p);
        const pa = pr.t === 'bat' ? Math.max(a, this.batAlpha || 0) : a;
        queue.push({ z: d, draw: (ctx) => drawPrim(ctx, cam, pr, pa) });
      }
    }
  }

  // Keep the hand on the end of the solved forearm (IK may clamp reach).
  function reach(sho, elb, target, fore) {
    const d = V.sub(target, elb);
    const l = V.len(d);
    if (l <= fore + 1e-6) return target;
    return V.add(elb, V.mul(d, fore / l));
  }

  // ---- primitive drawing --------------------------------------------------

  function tube2(ctx, a, b, w, col, shade) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineWidth = w;
    ctx.strokeStyle = shade;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.x - w * 0.12, a.y - w * 0.12); ctx.lineTo(b.x - w * 0.12, b.y - w * 0.12);
    ctx.lineWidth = w * 0.62;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  function drawPrim(ctx, cam, pr, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (pr.t === 'tube') {
      const s = cam.segment(pr.p0, pr.p1);
      if (s) tube2(ctx, s[0], s[1], Math.max(1.2, pr.w * (s[0].s + s[1].s) * 0.5), pr.col, pr.shade);
    } else if (pr.t === 'torso') {
      const pp = pr.pts.map((p) => cam.project(p));
      if (pp.every(Boolean)) {
        const sc = pp.reduce((s, p) => s + p.s, 0) / 4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pp[0].x, pp[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(pp[i].x, pp[i].y);
        ctx.closePath();
        ctx.lineWidth = Math.max(2, 0.17 * sc);
        ctx.strokeStyle = pr.shade;
        ctx.fillStyle = pr.shade;
        ctx.fill();
        ctx.stroke();
        // lighter inner panel
        const cx = (pp[0].x + pp[1].x + pp[2].x + pp[3].x) / 4, cy = (pp[0].y + pp[1].y + pp[2].y + pp[3].y) / 4;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const x = cx + (pp[i].x - cx) * 0.78 - 0.02 * sc, y = cy + (pp[i].y - cy) * 0.82 - 0.02 * sc;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.lineWidth = Math.max(1.5, 0.12 * sc);
        ctx.strokeStyle = pr.col;
        ctx.fillStyle = pr.col;
        ctx.fill();
        ctx.stroke();
      }
    } else if (pr.t === 'ball') {
      const p = cam.project(pr.p);
      if (p) {
        const r = Math.max(1.4, pr.r * p.s);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = pr.shade; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x - r * 0.18, p.y - r * 0.18, r * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = pr.col; ctx.fill();
      }
    } else if (pr.t === 'head') {
      drawHead(ctx, cam, pr);
    } else if (pr.t === 'bat') {
      drawBat(ctx, cam, pr.g, pr.fig);
    }
    ctx.restore();
  }

  function drawHead(ctx, cam, pr) {
    const fig = pr.fig, k = fig.kit, J = fig.J;
    const p = cam.project(pr.p);
    if (!p) return;
    const r = Math.max(2, pr.r * p.s);
    // Which way is the face pointing, on screen?
    const faceW = V.add(pr.p, V.mul(J.facing, 0.2));
    const fp = cam.project(faceW) || p;
    const fx = M.clamp((fp.x - p.x) / Math.max(1, r * 1.8), -1, 1);
    const towardCam = V.dot(J.facing, V.norm(V.sub(cam.pos, pr.p)));
    if (fig.kind === 'batter') {
      // helmet shell
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = k.helmet; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - r * 0.25, p.y - r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      // grille on the facing side
      if (towardCam > -0.6) {
        ctx.strokeStyle = k.grille; ctx.lineWidth = Math.max(1, r * 0.12);
        const gx = p.x + fx * r * 0.55;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(gx, p.y + r * 0.15, r * (0.5 + i * 0.16), Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        }
      }
      // peak
      ctx.beginPath();
      ctx.ellipse(p.x + fx * r * 0.8, p.y - r * 0.15, r * 0.55, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = k.helmet; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = k.skinShade; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + fx * r * 0.2, p.y + r * 0.05, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = k.skin; ctx.fill();
      // cap
      ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.12, r * 1.0, Math.PI, Math.PI * 2);
      ctx.fillStyle = k.cap; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + fx * r * 0.85, p.y - r * 0.12, r * 0.6, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBat(ctx, cam, g, fig) {
    const k = (fig && fig.kit) || KITS.batter;
    const hw = g.halfW;
    const s1 = V.mul(g.side, hw);
    const A = cam.project(V.add(g.shoulder, s1)), B = cam.project(V.sub(g.shoulder, s1));
    const C = cam.project(V.sub(g.toe, s1)), D = cam.project(V.add(g.toe, s1));
    if (!(A && B && C && D)) {
      // Part of the blade is behind the camera: draw the clipped blade only
      const pp = World.projPoly(cam, [V.add(g.shoulder, s1), V.sub(g.shoulder, s1), V.sub(g.toe, s1), V.add(g.toe, s1)]);
      if (!pp) return;
      ctx.beginPath(); ctx.moveTo(pp[0].x, pp[0].y);
      for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i].x, pp[i].y);
      ctx.closePath(); ctx.fillStyle = '#c9a66a'; ctx.fill();
      return;
    }
    // handle
    const h = cam.segment(g.top, g.shoulder);
    if (h && h[0].z > 0.6 && h[1].z > 0.6) {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(h[0].x, h[0].y); ctx.lineTo(h[1].x, h[1].y);
      ctx.lineWidth = Math.max(1.3, 0.036 * (h[0].s + h[1].s) * 0.5);
      ctx.strokeStyle = '#2b2f3a'; ctx.stroke();
    }
    if (!(A && B && C && D)) return;
    // Is the face of the bat toward the camera?
    const toCam = V.norm(V.sub(cam.pos, g.sweet));
    const facing = V.dot(g.face, toCam);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath();
    ctx.fillStyle = facing > 0 ? '#ecd6a4' : '#c9a66a';
    ctx.strokeStyle = '#a67c43';
    ctx.lineWidth = Math.max(1, 0.012 * A.s);
    ctx.fill(); ctx.stroke();
    // spine / edge highlight
    const m0 = cam.project(g.shoulder), m1 = cam.project(g.toe);
    if (m0 && m1) {
      ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y);
      ctx.strokeStyle = facing > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(80,50,20,0.35)';
      ctx.lineWidth = Math.max(1, 0.018 * m0.s);
      ctx.stroke();
    }
  }

  // Draw the flattened shadows (called before the render queue).
  function drawShadows(ctx, cam, shadows) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(10,25,10,0.22)';
    for (const s of shadows) {
      const seg = cam.segment(s.p0, s.p1);
      if (!seg) continue;
      ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y);
      ctx.lineWidth = Math.max(1, s.w * (seg[0].s + seg[1].s) * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  CLLM.Figure = Figure;
  CLLM.Figure.KITS = KITS;
  CLLM.Figure.RIG = RIG;
  CLLM.Figure.drawShadows = drawShadows;
  CLLM.Figure.drawBat = drawBat;
})();
