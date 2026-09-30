/*
 * GROUND
 * ======
 * The match ground: an oval with a rope, advertising boards, stands full of
 * people, sightscreens at both ends, a pavilion, a scoreboard, floodlights,
 * and a proper Test strip in the middle of the square. Drawn into the same
 * cached static layer as the nets (World.scene = 'ground').
 *
 * The camera can be anywhere (behind the batter, behind the bowler, high up
 * following the ball), so everything around the edge is sorted far-to-near
 * and painted in that order. Everything on the grass is painted first.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, World } = CLLM;
  const { fillPoly, groundRect, line3, projPoly } = World;

  // Field centre and the rope (matches CLLM.Field's boundary)
  const C = { x: 0, z: 10 };
  const ROPE = { rx: 62, rz: 68 };
  const GRASS = { rx: 70, rz: 76 };        // playing surface ends at the boards
  const BOARDS = { rx: 68.5, rz: 74.5, h: 0.95 };
  const STAND = { in: { rx: 71.5, rz: 77.5, h: 1.3 }, out: { rx: 90, rz: 96, h: 14 }, roof: { rx: 93, rz: 99, h: 18.5 } };
  const TREES = { rx: 150, rz: 160 };
  const SCREEN_HALF = 11;                   // sightscreen half width (m)

  function rnd(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rnd(7171);

  const ell = (e, a, h = 0) => V.v(C.x + Math.cos(a) * e.rx, h, C.z + Math.sin(a) * e.rz);

  // ---- a crowd texture (made once) -------------------------------------------
  let crowdCanvas = null;
  function crowd() {
    if (crowdCanvas) return crowdCanvas;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = '#39424a'; g.fillRect(0, 0, 96, 48);
    const shirts = ['#e8e2d0', '#d94b4b', '#2e5fa8', '#f2c14e', '#2f8a4c', '#f4f4f4', '#7a3b8f', '#e37b2b', '#1c1c1c', '#9fc3e8'];
    const r = rnd(99);
    for (let row = 0; row < 12; row++) {
      g.fillStyle = row % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.04)';
      g.fillRect(0, row * 4, 96, 1);
      for (let col = 0; col < 32; col++) {
        if (r() < 0.16) continue;                    // empty seat
        g.fillStyle = shirts[Math.floor(r() * shirts.length)];
        g.fillRect(col * 3 + (row % 2), row * 4 + 1, 2, 2);
        g.fillStyle = r() < 0.5 ? '#d8a27c' : '#8d5a3b';
        g.fillRect(col * 3 + (row % 2), row * 4, 2, 1);
      }
    }
    crowdCanvas = c;
    return c;
  }

  // ---- geometry built once ---------------------------------------------------------
  const N = 72;                           // segments around the oval
  const angs = [];
  for (let i = 0; i < N; i++) angs.push((i / N) * Math.PI * 2);
  // Ends of the ground (straight behind each set of stumps): x near 0
  const isEnd = (a) => Math.abs(Math.cos(a) * STAND.in.rx) < SCREEN_HALF + 3;
  const BOARD_COLS = ['#14365e', '#f3efe2', '#8c1d2c', '#143d2b', '#f2c14e', '#1f2a44', '#e6e1d3', '#b33a1f'];
  const boards = angs.map((a, i) => ({ a, a2: angs[(i + 1) % N] + (i === N - 1 ? Math.PI * 2 : 0), col: BOARD_COLS[i % BOARD_COLS.length] }));
  const treeH = [];
  for (let i = 0; i < 120; i++) treeH.push(12 + R() * 9 + Math.sin(i * 0.7) * 3);

  // ---- drawing -------------------------------------------------------------------
  function ellipsePts(e, n, h) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(ell(e, (i / n) * Math.PI * 2, h));
    return pts;
  }

  // Grass, stripes and the rope (cached with the scenery)
  function drawGrass(ctx, cam) {
    fillPoly(ctx, cam, ellipsePts(GRASS, 96, 0.001), '#4c8d38');
    // Mown checkerboard, clipped to the playing surface
    const clip = projPoly(cam, ellipsePts(GRASS, 96, 0.001));
    if (clip) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(clip[0].x, clip[0].y);
      for (let i = 1; i < clip.length; i++) ctx.lineTo(clip[i].x, clip[i].y);
      ctx.closePath(); ctx.clip();
      for (let x = -GRASS.rx; x < GRASS.rx; x += 7) {
        if (Math.round(x / 7) % 2 === 0) groundRect(ctx, cam, x, x + 7, C.z - GRASS.rz, C.z + GRASS.rz, 'rgba(255,255,255,0.055)', 0.0015);
      }
      for (let z = C.z - GRASS.rz; z < C.z + GRASS.rz; z += 7) {
        if (Math.round(z / 7) % 2 === 0) groundRect(ctx, cam, C.x - GRASS.rx, C.x + GRASS.rx, z, z + 7, 'rgba(0,30,0,0.045)', 0.0016);
      }
      ctx.restore();
    }
    // Just inside the boards: a darker worn strip where the fielders patrol
    // (drawn as a ring between the rope and the boards)
    const rope = ellipsePts(ROPE, 96, 0.004);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < rope.length; i++) {
      const a = rope[i], b = rope[(i + 1) % rope.length];
      const s = cam.segment(a, b);
      if (!s) continue;
      const w = Math.max(1, 0.09 * (s[0].s + s[1].s) * 0.5);
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); ctx.lineTo(s[1].x, s[1].y);
      ctx.lineWidth = w * 1.8; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = '#efe9d6'; ctx.stroke();
    }
    ctx.restore();
  }

  // The square and the strip: near the batter, so drawn live every frame
  // with the exact camera (cheap: a couple of dozen small polygons)
  function drawStrip(ctx, cam) {
    // The square (a lighter block of pitches) and the strip
    groundRect(ctx, cam, -12, 12, -4, 24, 'rgba(206,214,140,0.1)', 0.002);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      groundRect(ctx, cam, i * 3.05 - 1.4, i * 3.05 + 1.4, -1.5, 21.6, i % 2 ? 'rgba(190,200,120,0.12)' : 'rgba(170,190,110,0.1)', 0.0025);
    }
    const P = World.PITCH;
    groundRect(ctx, cam, -1.52, 1.52, -1.83, 21.95, '#cdbb86', 0.003);
    // wear: good-length patches, the batter's crease scuffs, bowlers' footmarks
    World.groundEllipse(ctx, cam, 0, 7.2, 0.6, 3.0, 'rgba(160,130,80,0.09)', 0.0035);
    World.groundEllipse(ctx, cam, 0, 12.9, 0.6, 3.0, 'rgba(160,130,80,0.09)', 0.0035);
    World.groundEllipse(ctx, cam, 0.05, 1.1, 0.7, 0.55, 'rgba(120,95,60,0.16)', 0.0036);
    World.groundEllipse(ctx, cam, 0.05, 19.0, 0.7, 0.55, 'rgba(120,95,60,0.16)', 0.0036);
    World.groundEllipse(ctx, cam, -0.5, 19.6, 0.35, 0.6, 'rgba(110,85,55,0.3)', 0.0037);
    World.groundEllipse(ctx, cam, 0.5, 0.5, 0.35, 0.6, 'rgba(110,85,55,0.3)', 0.0037);
    // creases
    const white = 'rgba(250,250,245,0.95)', lw = 0.05;
    const across = (z, half) => groundRect(ctx, cam, -half, half, z - lw / 2, z + lw / 2, white, 0.004);
    const along = (x, z0, z1) => groundRect(ctx, cam, x - lw / 2, x + lw / 2, z0, z1, white, 0.004);
    across(P.POPPING, 1.83); across(0, P.RETURN_X);
    across(P.LENGTH - P.POPPING, 1.83); across(P.LENGTH, P.RETURN_X);
    along(-P.RETURN_X, P.POPPING - 2.44, P.POPPING); along(P.RETURN_X, P.POPPING - 2.44, P.POPPING);
    along(-P.RETURN_X, P.LENGTH - P.POPPING, P.LENGTH - P.POPPING + 2.44); along(P.RETURN_X, P.LENGTH - P.POPPING, P.LENGTH - P.POPPING + 2.44);
  }

  // Everything around the edge, as depth-sortable pieces.
  function edgeItems(cam) {
    const items = [];
    const cp = cam.pos;
    const dist = (p) => Math.hypot(p.x - cp.x, p.z - cp.z) + p.y * 0.01;
    // tree line far beyond the stands
    for (let i = 0; i < treeH.length; i++) {
      const a0 = (i / treeH.length) * Math.PI * 2, a1 = ((i + 1) / treeH.length) * Math.PI * 2;
      const h0 = treeH[i], h1 = treeH[(i + 1) % treeH.length];
      const p0 = ell(TREES, a0), p1 = ell(TREES, a1);
      items.push({ d: dist(V.lerp(p0, p1, 0.5)) + 40, draw: (ctx) => fillPoly(ctx, cam, [p0, p1, V.v(p1.x, h1, p1.z), V.v(p0.x, h0, p0.z)], 'rgba(58,92,58,0.95)') });
    }
    // boards + stands, segment by segment
    const pat = crowd();
    for (const bd of boards) {
      const a0 = bd.a, a1 = bd.a2, am = (a0 + a1) / 2;
      const b0 = ell(BOARDS, a0), b1 = ell(BOARDS, a1);
      items.push({ d: dist(V.lerp(b0, b1, 0.5)), draw: (ctx) => {
        fillPoly(ctx, cam, [b0, b1, V.v(b1.x, BOARDS.h, b1.z), V.v(b0.x, BOARDS.h, b0.z)], bd.col);
        fillPoly(ctx, cam, [V.v(b0.x, BOARDS.h * 0.62, b0.z), V.v(b1.x, BOARDS.h * 0.62, b1.z), V.v(b1.x, BOARDS.h * 0.72, b1.z), V.v(b0.x, BOARDS.h * 0.72, b0.z)], 'rgba(255,255,255,0.28)');
      } });
      if (isEnd(am)) continue;             // sightscreens / pavilion go at the ends
      const i0 = ell(STAND.in, a0, STAND.in.h), i1 = ell(STAND.in, a1, STAND.in.h);
      const o0 = ell(STAND.out, a0, STAND.out.h), o1 = ell(STAND.out, a1, STAND.out.h);
      const r0 = ell(STAND.roof, a0, STAND.roof.h), r1 = ell(STAND.roof, a1, STAND.roof.h);
      const g0 = ell(STAND.in, a0, 0), g1 = ell(STAND.in, a1, 0);
      items.push({ d: dist(V.lerp(o0, o1, 0.5)), draw: (ctx) => {
        // front wall, seating (crowd), back wall + roof
        fillPoly(ctx, cam, [g0, g1, i1, i0], '#5c6268');
        const pp = projPoly(cam, [i0, i1, o1, o0]);
        if (pp) {
          ctx.beginPath(); ctx.moveTo(pp[0].x, pp[0].y);
          for (let k = 1; k < pp.length; k++) ctx.lineTo(pp[k].x, pp[k].y);
          ctx.closePath();
          const q = cam.project(V.lerp(i0, o1, 0.5));
          const fill = ctx.createPattern(pat, 'repeat');
          if (fill && q && fill.setTransform && window.DOMMatrix) {
            const sc = M.clamp(q.s * 0.12, 0.25, 3);
            fill.setTransform(new DOMMatrix().translateSelf(q.x, q.y).scaleSelf(sc, sc));
          }
          ctx.fillStyle = fill || '#4a5159';
          ctx.fill();
          ctx.fillStyle = 'rgba(20,30,40,0.18)'; ctx.fill();
        }
        fillPoly(ctx, cam, [o0, o1, r1, r0], '#d9dde0');
        fillPoly(ctx, cam, [o0, o1, V.v(o1.x, o1.y + 0.8, o1.z), V.v(o0.x, o0.y + 0.8, o0.z)], '#8e969c');
      } });
    }
    // sightscreens at both ends, the pavilion behind the keeper's end and
    // the scoreboard over the bowler's end
    for (const end of [-1, 1]) {
      const z = C.z + end * (BOARDS.rz + 2.5);
      const s0 = V.v(-SCREEN_HALF, 0, z), s1 = V.v(SCREEN_HALF, 0, z);
      items.push({ d: dist(V.v(0, 4, z)), draw: (ctx) => {
        fillPoly(ctx, cam, [s0, s1, V.v(s1.x, 8, z), V.v(s0.x, 8, z)], '#f4f2ea');
        fillPoly(ctx, cam, [V.v(-SCREEN_HALF, 7.6, z - end * 0.05), V.v(SCREEN_HALF, 7.6, z - end * 0.05), V.v(SCREEN_HALF, 8, z - end * 0.05), V.v(-SCREEN_HALF, 8, z - end * 0.05)], '#b9b6aa');
        line3(ctx, cam, V.v(-SCREEN_HALF, 0, z), V.v(-SCREEN_HALF, 8.2, z), 0.25, '#8f8b80');
        line3(ctx, cam, V.v(SCREEN_HALF, 0, z), V.v(SCREEN_HALF, 8.2, z), 0.25, '#8f8b80');
      } });
      const zb = z + end * 6;
      if (end < 0) {
        // Pavilion: a long cream building with a green roof, balconies and a flag
        items.push({ d: dist(V.v(0, 8, zb)) + 3, draw: (ctx) => {
          fillPoly(ctx, cam, [V.v(-26, 0, zb), V.v(26, 0, zb), V.v(26, 13, zb), V.v(-26, 13, zb)], '#ebe0c4');
          fillPoly(ctx, cam, [V.v(-28, 13, zb), V.v(28, 13, zb), V.v(22, 17.5, zb - 4), V.v(-22, 17.5, zb - 4)], '#35573f');
          for (let y = 2.5; y < 12; y += 3.4) {
            fillPoly(ctx, cam, [V.v(-24, y, zb + 0.1), V.v(24, y, zb + 0.1), V.v(24, y + 1.6, zb + 0.1), V.v(-24, y + 1.6, zb + 0.1)], 'rgba(70,90,105,0.75)');
            fillPoly(ctx, cam, [V.v(-24, y - 0.4, zb + 0.15), V.v(24, y - 0.4, zb + 0.15), V.v(24, y, zb + 0.15), V.v(-24, y, zb + 0.15)], '#f6f2e6');
          }
          line3(ctx, cam, V.v(0, 17.5, zb - 4), V.v(0, 24, zb - 4), 0.15, '#dcdcdc');
          fillPoly(ctx, cam, [V.v(0.1, 23.8, zb - 4), V.v(3.4, 23.2, zb - 4), V.v(0.1, 22.4, zb - 4)], '#b8322c');
        } });
      } else {
        // Scoreboard on stilts above the far sightscreen
        items.push({ d: dist(V.v(0, 12, zb)) + 3, draw: (ctx) => {
          fillPoly(ctx, cam, [V.v(-9, 9, zb), V.v(9, 9, zb), V.v(9, 17, zb), V.v(-9, 17, zb)], '#1d2923');
          fillPoly(ctx, cam, [V.v(-8.4, 14.6, zb - 0.1), V.v(8.4, 14.6, zb - 0.1), V.v(8.4, 16.4, zb - 0.1), V.v(-8.4, 16.4, zb - 0.1)], '#2f4a3a');
          for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
            if ((r * 7 + c * 3) % 5 === 0) continue;
            const x = -7.6 + c * 1.7, y = 10 + r * 1.35;
            fillPoly(ctx, cam, [V.v(x, y, zb - 0.1), V.v(x + 1.1, y, zb - 0.1), V.v(x + 1.1, y + 0.9, zb - 0.1), V.v(x, y + 0.9, zb - 0.1)], '#f2d36b');
          }
          line3(ctx, cam, V.v(-7, 0, zb), V.v(-7, 9, zb), 0.5, '#26312b');
          line3(ctx, cam, V.v(7, 0, zb), V.v(7, 9, zb), 0.5, '#26312b');
        } });
      }
    }
    // Floodlight towers on the diagonals
    for (const a of [0.55, Math.PI - 0.55, Math.PI + 0.55, -0.55]) {
      const base = ell({ rx: 104, rz: 110 }, a), top = V.v(base.x, 46, base.z);
      const tw = V.norm(V.v(C.x - base.x, 0, C.z - base.z)), side = V.v(-tw.z, 0, tw.x);
      items.push({ d: dist(base) - 1, draw: (ctx) => {
        line3(ctx, cam, base, top, 1.1, '#9aa1a6');
        const hw = 4.5, hh = 3.2;
        const q0 = V.add(top, V.mul(side, -hw)), q1 = V.add(top, V.mul(side, hw));
        fillPoly(ctx, cam, [q0, q1, V.v(q1.x, top.y + hh, q1.z), V.v(q0.x, top.y + hh, q0.z)], '#3b4146');
        for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
          const p = V.add(V.add(top, V.mul(side, -hw + 0.75 + c * 1.5)), V.v(0, 0.55 + r * 1.0, 0));
          const q = cam.project(V.add(p, V.mul(tw, 0.2)));
          if (!q) continue;
          ctx.fillStyle = '#fffbe6';
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.8, 0.32 * q.s), 0, Math.PI * 2); ctx.fill();
        }
      } });
    }
    items.sort((a, b) => b.d - a.d);
    return items;
  }

  const Ground = {
    C, ROPE, GRASS, BOARDS,
    // Called by World._render after the sky + base when World.scene === 'ground'
    draw(ctx, cam, opts) {
      // The grass first: everything around the edge stands up out of it, so
      // (from anywhere on or above the field) it can only ever cover grass
      // that lies beyond it. Then the edge, far to near.
      drawGrass(ctx, cam);
      if (!(opts && opts.strip === false)) drawStrip(ctx, cam);
      for (const it of edgeItems(cam)) it.draw(ctx);
    },
    drawNear(ctx, cam) { drawStrip(ctx, cam); },
    // Is a ground point over the rope?  (>1 = beyond)
    ropeK(x, z) { return Math.hypot((x - C.x) / ROPE.rx, (z - C.z) / ROPE.rz); },
  };

  CLLM.Ground = Ground;
})();
