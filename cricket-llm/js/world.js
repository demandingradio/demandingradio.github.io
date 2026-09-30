/*
 * WORLD
 * =====
 * The static scene: sky, club ground, a row of three net lanes, the synthetic
 * pitch with its crease markings, net poles and mesh. The static layer is
 * rendered once into an offscreen canvas and re-used until the camera or the
 * viewport changes.
 *
 * Also owns shared scene constants (pitch dimensions, net geometry, sun).
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M } = CLLM;

  const PITCH = {
    LENGTH: 20.12,          // stump to stump
    POPPING: 1.22,          // popping crease in front of the stumps
    RETURN_X: 1.32,         // return creases
    HALF_W: 1.45,           // synthetic strip half width
    STUMP_H: 0.711,
    STUMP_R: 0.018,
    STUMP_X: [-0.0965, 0, 0.0965],
    STUMPS_HALF_W: 0.1143,  // 9 inches / 2
    BALL_R: 0.036,
  };
  const NET = {
    X: [-5.4, -1.8, 1.8, 5.4],   // side-net planes
    BACK_Z: -2.6,
    FRONT_Z: 15.5,
    H: 3.1,
    POLES_Z: [-2.6, 3.2, 9.3, 15.5],
  };
  // Direction the sunlight travels (from sun toward the ground).
  const SUN = V.norm(V.v(0.42, -1, -0.62));

  // Seeded RNG so the scenery is identical every visit.
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- polygon helpers ---------------------------------------------------

  // Clip a 3D polygon against the camera near plane and project it.
  function projPoly(cam, pts) {
    const near = cam.near + 0.05;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = cam.depth(a), db = cam.depth(b);
      const ina = da >= near, inb = db >= near;
      if (ina) out.push(a);
      if (ina !== inb) out.push(V.lerp(a, b, (near - da) / (db - da)));
    }
    if (out.length < 3) return null;
    return out.map((p) => cam.projectClamped(p));
  }

  function fillPoly(ctx, cam, pts, style) {
    const pp = projPoly(cam, pts);
    if (!pp) return;
    ctx.beginPath();
    ctx.moveTo(pp[0].x, pp[0].y);
    for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i].x, pp[i].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  // Flat ground rectangle (y = h) from x0..x1, z0..z1.
  function groundRect(ctx, cam, x0, x1, z0, z1, style, h = 0) {
    fillPoly(ctx, cam, [V.v(x0, h, z0), V.v(x1, h, z0), V.v(x1, h, z1), V.v(x0, h, z1)], style);
  }

  // Flat ground ellipse.
  function groundEllipse(ctx, cam, cx, cz, rx, rz, style, h = 0.002) {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(V.v(cx + Math.cos(a) * rx, h, cz + Math.sin(a) * rz));
    }
    fillPoly(ctx, cam, pts, style);
  }

  function line3(ctx, cam, a, b, width, style) {
    const s = cam.segment(a, b);
    if (!s) return;
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    ctx.lineTo(s[1].x, s[1].y);
    ctx.lineWidth = Math.max(0.6, width * (s[0].s + s[1].s) * 0.5);
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  // ---- scenery generation -----------------------------------------------

  const rng = mulberry(20120);
  const TREES_FAR = [], TREES_NEAR = [];
  for (let x = -420; x <= 420; x += 5) {
    TREES_FAR.push({ x, h: 7 + rng() * 5 + Math.sin(x * 0.03) * 3 });
  }
  for (let x = -300; x <= 300; x += 3) {
    TREES_NEAR.push({ x, h: 7 + rng() * 5 + Math.sin(x * 0.07 + 2) * 2.5 });
  }
  const CLOUDS = [];
  for (let i = 0; i < 7; i++) {
    CLOUDS.push({ u: rng(), v: 0.15 + rng() * 0.55, w: 0.12 + rng() * 0.18, puffs: 3 + Math.floor(rng() * 4), seed: rng() });
  }

  // ---- the static layer --------------------------------------------------

  const World = {
    PITCH, NET, SUN, projPoly, fillPoly, groundRect, groundEllipse, line3,

    _cache: null,
    _cacheKey: '',
    scene: 'nets',            // 'nets' (practice) | 'ground' (a match: see ground.js)

    // Draw the static background into ctx (cached).
    drawStatic(ctx, cam, dpr) {
      if (cam.w < 2 || cam.h < 2) return;
      if (this.scene === 'ground' && CLLM.Ground) return this._groundStatic(ctx, cam, dpr);
      const key = [this.scene === 'ground' ? 1 : 0, cam.w, cam.h, dpr, cam.pos.x, cam.pos.y, cam.pos.z, cam.target.x, cam.target.y, cam.target.z, cam.fov, cam.hfov || 0].map((n) => (+n).toFixed(3)).join(',');
      if (key !== this._cacheKey || !this._cache) {
        if (!this._cache) this._cache = document.createElement('canvas');
        this._cache.width = Math.round(cam.w * dpr);
        this._cache.height = Math.round(cam.h * dpr);
        const c = this._cache.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._render(c, cam);
        this._cacheKey = key;
      }
      ctx.drawImage(this._cache, 0, 0, cam.w, cam.h);
    },

    // The ground (a match) is heavier than the nets, and its camera moves:
    // with your feet (a small dolly along z) and, once the ball is live, by
    // crop & zoom. So the scenery is rendered once per base spot (slightly
    // oversized) and re-used: scaled about the vanishing point for the
    // dolly, cropped for the zoom. The strip itself (near you, where a dolly
    // shows) is drawn live on top.
    _groundStatic(ctx, cam, dpr) {
      const W = cam.w, H = cam.h;
      // cam.crop: a follow cam is on its fixed pose, even at exactly zoom 1
      // (a spring settling on kMin must not flip to the dolly/overscan key)
      const crop = !!cam.crop || (cam.zoom || 1) !== 1 || !!cam.ox || !!cam.oy;
      const dz = crop ? 0 : (cam.dolly || 0);
      const m = crop ? 0 : 0.025;                         // overscan so a step back never shows an edge
      const S = crop ? Math.min(1.6, 2600 / (Math.max(W, H) * dpr)) : 1;
      const base = this._gBase || (this._gBase = new CLLM.Camera());
      base.hfov = cam.hfov; base.zoom = 1 / (1 + 2 * m); base.ox = 0; base.oy = 0;
      base.w = W * (1 + 2 * m); base.h = H * (1 + 2 * m);
      base.set(V.v(cam.pos.x, cam.pos.y, cam.pos.z - dz), V.v(cam.target.x, cam.target.y, cam.target.z - dz), cam.fov);
      const key = [W, H, dpr, S, m, base.pos.x, base.pos.y, base.pos.z, base.target.x, base.target.y, base.target.z, cam.fov, cam.hfov || 0].map((n) => (+n).toFixed(3)).join(',');
      // two slots: the delivery view and the follow view both stay cached
      const slots = this._gSlots || (this._gSlots = [{ key: '', c: null, used: 0 }, { key: '', c: null, used: 0 }]);
      let slot = slots.find((s) => s.key === key && s.c);
      if (!slot) {
        slot = slots[0].used <= slots[1].used ? slots[0] : slots[1];
        if (!slot.c) slot.c = document.createElement('canvas');
        slot.c.width = Math.round(base.w * dpr * S);
        slot.c.height = Math.round(base.h * dpr * S);
        const c = slot.c.getContext('2d');
        c.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
        this._farOnly = true;
        this._render(c, base);
        this._farOnly = false;
        slot.key = key;
      }
      slot.used = performance.now();
      this._gc = slot.c;
      const k = dpr * S;
      if (crop) {
        // live pixel (0,0) is base pixel (W/2 - cx/zoom, H/2 - cy/zoom)
        const z = cam.zoom || 1;
        // (clamped to the cache: a stale offset after a resize must not show a blank band)
        const sx = Math.max(0, Math.min(W - W / z, W / 2 - cam.cx / z)), sy = Math.max(0, Math.min(H - H / z, H / 2 - cam.cy / z));
        ctx.drawImage(this._gc, sx * k, sy * k, (W / z) * k, (H / z) * k, 0, 0, W, H);
      } else if (Math.abs(dz) > 1e-4) {
        const f = cam.project(V.add(cam.pos, V.v(0, 0, 2000))) || { x: W / 2, y: H / 2 };
        const s = 60 / (60 - dz);
        ctx.save();
        ctx.translate(f.x, f.y); ctx.scale(s, s); ctx.translate(-f.x, -f.y);
        ctx.drawImage(this._gc, -m * W, -m * H, base.w, base.h);
        ctx.restore();
      } else ctx.drawImage(this._gc, -m * W, -m * H, base.w, base.h);
      CLLM.Ground.drawNear(ctx, cam);
    },

    _render(ctx, cam) {
      const W = cam.w, H = cam.h;
      const hy = cam.horizonY();

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, Math.max(10, hy));
      sky.addColorStop(0, '#5f9fd1');
      sky.addColorStop(0.55, '#9cc6e2');
      sky.addColorStop(1, '#f2dcb2');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, Math.max(0, hy) + 2);
      // Sun glow, upper left
      const sg = ctx.createRadialGradient(W * 0.12, hy * 0.25, 0, W * 0.12, hy * 0.25, Math.max(W, H) * 0.55);
      sg.addColorStop(0, 'rgba(255,244,214,0.75)');
      sg.addColorStop(0.25, 'rgba(255,230,180,0.25)');
      sg.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, Math.max(0, hy) + 2);
      // Clouds
      for (const c of CLOUDS) {
        const cx = c.u * W, cy = hy * c.v, cw = c.w * W;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < c.puffs; i++) {
          const px = cx + (i / c.puffs - 0.5) * cw;
          const pr = cw * (0.16 + 0.1 * Math.sin(i * 1.7 + c.seed * 9));
          ctx.beginPath();
          ctx.ellipse(px, cy - pr * 0.25, pr, pr * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,250,240,0.35)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw * 0.55, cw * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ground base
      const g = ctx.createLinearGradient(0, hy, 0, H);
      g.addColorStop(0, '#8fa968');
      g.addColorStop(0.08, '#6f9a4a');
      g.addColorStop(1, '#3f7a30');
      ctx.fillStyle = g;
      ctx.fillRect(0, hy - 1, W, H - hy + 1);

      if (this.scene === 'ground' && CLLM.Ground) {
        CLLM.Ground.draw(ctx, cam, { strip: !this._farOnly });
        this._vignette(ctx, W, H);
        return;
      }

      // Mow stripes (bands parallel to the pitch)
      for (let x = -60; x < 60; x += 5) {
        if (Math.round(x / 5) % 2 === 0) groundRect(ctx, cam, x, x + 5, -400, 40, 'rgba(255,255,255,0.045)');
      }

      // Distant hills / tree lines
      this._treeLine(ctx, cam, TREES_FAR, -330, 'rgba(118,140,140,0.8)', 1.5);
      this._treeLine(ctx, cam, TREES_NEAR, -215, 'rgba(52,84,50,0.95)', 1.25);
      // Clubhouse + scoreboard + white fence
      this._clubhouse(ctx, cam);
      this._fence(ctx, cam);

      // Worn practice area around the nets
      groundRect(ctx, cam, -7.2, 7.2, -4.6, 23.5, 'rgba(120,120,70,0.10)');
      groundEllipse(ctx, cam, 0, 24, 2.4, 5.5, 'rgba(142,112,70,0.22)');

      // Three net lanes (neighbours are faded)
      for (const cx of [-3.6, 3.6]) this._lane(ctx, cam, cx, true);
      this._lane(ctx, cam, 0, false);

      // Nets: far/back net, then the side nets
      this._backNet(ctx, cam);
      for (const x of NET.X) this._sideNet(ctx, cam, x);
      this._poles(ctx, cam);

      this._vignette(ctx, W, H);
    },

    // Slight atmospheric vignette
    _vignette(ctx, W, H) {
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(20,24,10,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    },

    _treeLine(ctx, cam, trees, z, style, bump) {
      const pts = [];
      pts.push(V.v(trees[0].x, 0, z));
      for (const t of trees) pts.push(V.v(t.x, t.h * bump * 0.8, z));
      pts.push(V.v(trees[trees.length - 1].x, 0, z));
      const pp = pts.map((p) => cam.project(p)).filter(Boolean);
      if (pp.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(pp[0].x, pp[0].y);
      for (let i = 1; i < pp.length; i++) {
        const a = pp[i - 1], b = pp[i];
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
    },

    _box(ctx, cam, x0, x1, y0, y1, z, style) {
      fillPoly(ctx, cam, [V.v(x0, y0, z), V.v(x1, y0, z), V.v(x1, y1, z), V.v(x0, y1, z)], style);
    },

    _clubhouse(ctx, cam) {
      const z = -190;
      // Main building
      this._box(ctx, cam, -34, -9, 0, 7.5, z, '#e9dfc6');
      // Roof
      fillPoly(ctx, cam, [V.v(-35.5, 7.5, z), V.v(-7.5, 7.5, z), V.v(-11, 10.5, z), V.v(-32, 10.5, z)], '#3f5d45');
      // Veranda shadow + windows
      this._box(ctx, cam, -34, -9, 0, 2.6, z + 0.1, 'rgba(90,70,40,0.35)');
      for (let x = -32; x < -10; x += 3.2) this._box(ctx, cam, x, x + 1.8, 3.6, 6.0, z + 0.1, '#566b79');
      // Flag pole
      line3(ctx, cam, V.v(-21.5, 10.5, z), V.v(-21.5, 15.5, z), 0.12, '#dcdcdc');
      fillPoly(ctx, cam, [V.v(-21.4, 15.4, z), V.v(-18.6, 14.9, z), V.v(-21.4, 14.2, z)], '#b8322c');
      // Scoreboard on the right
      this._box(ctx, cam, 16, 30, 1.2, 8.2, z, '#1f2a24');
      this._box(ctx, cam, 16.5, 29.5, 6.3, 7.8, z + 0.1, '#2f4a3a');
      // "LLM" on the board, drawn as blocks of yellowish lights
      const txt = ['111 1   1   1', '1   1   11 11', '111 111 1 1 1'];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < txt[r].length; c++) {
          if (txt[r][c] !== '1') continue;
          const x = 18.2 + c * 0.75, y = 5.2 - r * 0.8;
          this._box(ctx, cam, x, x + 0.5, y, y + 0.5, z + 0.1, '#f2d36b');
        }
      }
      line3(ctx, cam, V.v(17, 0, z), V.v(17, 1.2, z), 0.35, '#1f2a24');
      line3(ctx, cam, V.v(29, 0, z), V.v(29, 1.2, z), 0.35, '#1f2a24');
    },

    _fence(ctx, cam) {
      const z = -120;
      // White picket boundary fence
      const a = cam.project(V.v(-200, 1.1, z)), b = cam.project(V.v(200, 1.1, z));
      const c = cam.project(V.v(-200, 0, z));
      if (!a || !b || !c) return;
      ctx.fillStyle = 'rgba(245,245,238,0.85)';
      ctx.fillRect(Math.min(a.x, c.x), a.y, Math.abs(b.x - a.x), Math.max(1, c.y - a.y));
      ctx.fillStyle = 'rgba(120,120,110,0.25)';
      ctx.fillRect(Math.min(a.x, c.x), a.y + (c.y - a.y) * 0.55, Math.abs(b.x - a.x), Math.max(1, (c.y - a.y) * 0.12));
    },

    _lane(ctx, cam, cx, faded) {
      const P = PITCH;
      // Concrete apron under the synthetic strip
      groundRect(ctx, cam, cx - 1.75, cx + 1.75, NET.BACK_Z, 22.2, faded ? '#8c8a7c' : '#9a978a');
      // Synthetic turf strip
      groundRect(ctx, cam, cx - P.HALF_W, cx + P.HALF_W, NET.BACK_Z + 0.25, 21.9, faded ? '#3d7446' : '#3f8a4c', 0.001);
      // Subtle lengthwise weave lines
      for (let i = -3; i <= 3; i++) {
        line3(ctx, cam, V.v(cx + i * 0.4, 0.002, NET.BACK_Z + 0.3), V.v(cx + i * 0.4, 0.002, 21.8), 0.012, 'rgba(255,255,255,0.05)');
      }
      // Worn good-length patch & crease scuffs
      groundEllipse(ctx, cam, cx, 6.5, 0.75, 3.2, 'rgba(180,200,150,0.10)');
      groundEllipse(ctx, cam, cx + 0.1, 1.4, 0.8, 0.7, 'rgba(210,220,190,0.10)');
      groundEllipse(ctx, cam, cx - 0.35, 19.3, 0.55, 0.9, 'rgba(210,220,190,0.12)');
      // Creases
      const white = faded ? 'rgba(240,240,235,0.55)' : 'rgba(250,250,245,0.92)';
      const lw = 0.05;
      const cz = (z) => groundRect(ctx, cam, cx - P.HALF_W, cx + P.HALF_W, z - lw / 2, z + lw / 2, white, 0.003);
      const bz = (z) => groundRect(ctx, cam, cx - P.RETURN_X, cx + P.RETURN_X, z - lw / 2, z + lw / 2, white, 0.003);
      const rz = (x, z0, z1) => groundRect(ctx, cam, x - lw / 2, x + lw / 2, z0, z1, white, 0.003);
      cz(P.POPPING); bz(0);
      rz(cx - P.RETURN_X, -1.0, P.POPPING); rz(cx + P.RETURN_X, -1.0, P.POPPING);
      cz(P.LENGTH - P.POPPING); bz(P.LENGTH);
      rz(cx - P.RETURN_X, P.LENGTH - P.POPPING, P.LENGTH + 1.0); rz(cx + P.RETURN_X, P.LENGTH - P.POPPING, P.LENGTH + 1.0);
      // Distant lane stumps (ours are drawn dynamically so they can be hit)
      if (faded) {
        for (const sx of P.STUMP_X) line3(ctx, cam, V.v(cx + sx, 0, 0), V.v(cx + sx, P.STUMP_H, 0), P.STUMP_R * 2, '#e8dcc0');
      }
    },

    _meshStyle(depthHint) {
      return 'rgba(30,36,34,0.30)';
    },

    _backNet(ctx, cam) {
      const z = NET.BACK_Z, x0 = NET.X[0], x1 = NET.X[3];
      // Translucent fill
      fillPoly(ctx, cam, [V.v(x0, 0, z), V.v(x1, 0, z), V.v(x1, NET.H, z), V.v(x0, NET.H, z)], 'rgba(20,28,26,0.18)');
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (let x = x0; x <= x1 + 1e-6; x += 0.18) line3(ctx, cam, V.v(x, 0, z), V.v(x, NET.H, z), 0.006, 'rgba(25,30,28,0.35)');
      for (let y = 0; y <= NET.H + 1e-6; y += 0.18) line3(ctx, cam, V.v(x0, y, z), V.v(x1, y, z), 0.006, 'rgba(25,30,28,0.35)');
      ctx.restore();
      // A small club banner hanging on our lane's back net
      fillPoly(ctx, cam, [V.v(-1.1, 2.15, z + 0.02), V.v(1.1, 2.15, z + 0.02), V.v(1.1, 2.75, z + 0.02), V.v(-1.1, 2.75, z + 0.02)], '#16324f');
      const p = cam.project(V.v(0, 2.45, z + 0.03));
      if (p) {
        ctx.fillStyle = '#f3e6c4';
        ctx.font = `700 ${Math.max(6, 0.36 * p.s)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CRICKET LLM · NETS', p.x, p.y);
      }
    },

    _sideNet(ctx, cam, x) {
      const z0 = NET.BACK_Z, z1 = NET.FRONT_Z;
      fillPoly(ctx, cam, [V.v(x, 0, z0), V.v(x, 0, z1), V.v(x, NET.H, z1), V.v(x, NET.H, z0)], 'rgba(20,28,26,0.14)');
      const inner = Math.abs(x) < 3;
      const a = inner ? 0.30 : 0.2;
      for (let z = z0; z <= z1 + 1e-6; z += 0.22) line3(ctx, cam, V.v(x, 0, z), V.v(x, NET.H, z), 0.006, `rgba(25,30,28,${a})`);
      for (let y = 0; y <= NET.H + 1e-6; y += 0.22) line3(ctx, cam, V.v(x, y, z0), V.v(x, y, z1), 0.006, `rgba(25,30,28,${a})`);
      // Weighted bottom edge + top rope
      line3(ctx, cam, V.v(x, 0.02, z0), V.v(x, 0.02, z1), 0.05, 'rgba(30,30,30,0.6)');
    },

    _poles(ctx, cam) {
      for (const x of NET.X) {
        for (const z of NET.POLES_Z) {
          line3(ctx, cam, V.v(x, 0, z), V.v(x, NET.H + 0.05, z), 0.06, '#3a3f3d');
        }
        line3(ctx, cam, V.v(x, NET.H, NET.BACK_Z), V.v(x, NET.H, NET.FRONT_Z), 0.03, '#3a3f3d');
      }
      line3(ctx, cam, V.v(NET.X[0], NET.H, NET.BACK_Z), V.v(NET.X[3], NET.H, NET.BACK_Z), 0.03, '#3a3f3d');
      // Cross rails across the lane tops
      for (const z of NET.POLES_Z) line3(ctx, cam, V.v(NET.X[0], NET.H, z), V.v(NET.X[3], NET.H, z), 0.025, 'rgba(58,63,61,0.8)');
    },

    // ---- dynamic helpers -------------------------------------------------

    // Shadow point of a world position on the ground.
    shadowOf(p) {
      const t = p.y / -SUN.y;
      return V.v(p.x + SUN.x * t, 0.004, p.z + SUN.z * t);
    },

    // Push the three stumps + bails at an end into the render queue.
    // `state` may carry {broken, t, hitX, bailsVel} for a stumps-shattered anim.
    queueStumps(queue, cam, zEnd, state) {
      const P = PITCH;
      const broken = state && state.broken;
      const t = broken ? state.t : 0;
      P.STUMP_X.forEach((sx, i) => {
        let top = V.v(sx, P.STUMP_H, zEnd);
        const base = V.v(sx, 0, zEnd);
        if (broken) {
          const lean = (state.lean[i] || 0) * M.easeOut(Math.min(1, t * 3));
          top = V.v(sx + lean * 0.5 * Math.sin(state.dir || 0), P.STUMP_H * Math.cos(lean), zEnd - lean * 0.5);
        }
        const d = cam.depth(V.lerp(base, top, 0.5));
        queue.push({
          z: d,
          draw: (ctx) => {
            // shadow
            const sb = this.shadowOf(base), st = this.shadowOf(top);
            line3(ctx, cam, sb, st, P.STUMP_R * 2, 'rgba(0,0,0,0.18)');
            line3(ctx, cam, base, top, P.STUMP_R * 2, '#f1e3c2');
            line3(ctx, cam, V.v(base.x + 0.005, base.y, base.z - 0.004), V.v(top.x + 0.005, top.y, top.z - 0.004), P.STUMP_R * 0.7, 'rgba(160,120,70,0.45)');
          },
        });
      });
      // Bails
      const bails = broken ? state.bails : [
        { a: V.v(-0.1, P.STUMP_H + 0.012, zEnd), b: V.v(-0.002, P.STUMP_H + 0.012, zEnd) },
        { a: V.v(0.002, P.STUMP_H + 0.012, zEnd), b: V.v(0.1, P.STUMP_H + 0.012, zEnd) },
      ];
      for (const bl of bails) {
        const d = cam.depth(V.lerp(bl.a, bl.b, 0.5)) - 0.01;
        queue.push({ z: d, draw: (ctx) => line3(ctx, cam, bl.a, bl.b, 0.014, '#e6d2a8') });
      }
    },
  };

  CLLM.World = World;
})();
