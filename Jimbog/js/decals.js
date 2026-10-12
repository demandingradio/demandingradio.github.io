// Jimbog — decals and trim for both maps.
//
// Darkening decals (wall-base grime, streaks, stains, oil, cracks, scuffs, tyre
// marks) share ONE multiply-blended mesh. They multiply whatever light is already
// on the surface, so they follow the sun, the shadows and the baked light for free.
//
// Colour decals (chipped painted lower bands, kick strips, corner guards, door
// kick plates, grass tufts) are merged per material and lit exactly like the level
// walls: each vertex gets the same `bake` attribute the level uses, computed here
// from the level's own light list (see lightAt), and the same shader patch.
//
// Everything is placed deterministically from the level grid and the map data.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  const CS = 0.5;        // grid cell (m)
  const INF = 1000;      // "open sky" ceiling (campus)
  const EPS = 0.003;     // decals sit 3 mm off the surface they decorate

  // Presets the campus adds to the Facility light table (level2.js LIGHTS). Only
  // the bounce values are needed here; the colours are the same as level2's.
  const CAMPUS_LIGHTS = {
    outdoor: { c: 0xbcd6f2, bounce: 0.46 },
    library: { c: 0xfff1dc, bounce: 0.065 },
    gym: { c: 0xf4f6ff, bounce: 0.07 },
    shed: { c: 0xffd9a8, bounce: 0.04 },
    hall: { c: 0xfff0dc, bounce: 0.07 }
  };

  // Deterministic hash in [0, 1) for two integers.
  function hash(a, b) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x27d4eb2f, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  // ------------------------------------------------------------ procedural atlases
  // Each atlas cell is drawn in canvas space: canvas bottom is v = 0 (the floor
  // line on walls), canvas top is v = 1 (where streaks start).

  function drawGrime(c, s, rnd) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.68)'); g.addColorStop(1, 'rgba(0,0,0,0.95)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) {          // ragged, blotchy upper edge
      const x = rnd() * s, y = s * (0.3 + rnd() * 0.65), r = s * (0.03 + rnd() * 0.09);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)';      // drips running down from the top
    for (let i = 0; i < 5; i++) {
      const x = rnd() * s;
      c.lineWidth = s * (0.012 + rnd() * 0.02);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (rnd() - 0.5) * s * 0.06, s * (0.3 + rnd() * 0.55)); c.stroke();
    }
  }
  function drawStreak(c, s, rnd, thin) {
    const n = thin ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const x = s * (0.2 + rnd() * 0.6), w = s * (thin ? 0.035 + rnd() * 0.05 : 0.09 + rnd() * 0.12);
      const len = s * (0.55 + rnd() * 0.45);
      const g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.6, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - w / 2, 0, w, len);
    }
    const t = c.createLinearGradient(0, 0, 0, s * 0.14);
    t.addColorStop(0, 'rgba(0,0,0,0.9)'); t.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = t; c.fillRect(0, 0, s, s * 0.14);
  }
  function drawStain(c, s, rnd) {
    for (let i = 0; i < 12; i++) {
      const x = s * (0.2 + rnd() * 0.6), y = s * (0.2 + rnd() * 0.6), r = s * (0.08 + rnd() * 0.2);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,0.32)'); rg.addColorStop(0.7, 'rgba(0,0,0,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  function drawOil(c, s, rnd) {
    for (let i = 0; i < 6; i++) {
      const x = s * (0.4 + rnd() * 0.2), y = s * (0.4 + rnd() * 0.2), r = s * (0.18 + rnd() * 0.24);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.8, 'rgba(0,0,0,0.4)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  function drawCrack(c, s, rnd) {
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      let x = s * (0.15 + rnd() * 0.7), y = s * (k ? 0.95 : 0.02), a = (k ? -Math.PI / 2 : Math.PI / 2) + (rnd() - 0.5) * 1.1;
      c.lineWidth = s * (0.012 + rnd() * 0.01);
      c.beginPath(); c.moveTo(x, y);
      for (let st = 0; st < 10; st++) {
        a += (rnd() - 0.5) * 0.9;
        const len = s * (0.07 + rnd() * 0.06);
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        c.lineTo(x, y);
        if (rnd() < 0.18) { // branch
          c.moveTo(x, y); c.lineTo(x + Math.cos(a + 0.9) * len * 0.8, y + Math.sin(a + 0.9) * len * 0.8); c.moveTo(x, y);
        }
      }
      c.stroke();
    }
  }
  function drawScuff(c, s, rnd) {
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      c.lineWidth = s * (0.025 + rnd() * 0.05);
      const cx = s * (0.5 + (rnd() - 0.5) * 0.3), cy = s * (0.5 + (rnd() - 0.5) * 0.3), r = s * (0.22 + rnd() * 0.2);
      const a0 = rnd() * 6.28;
      c.beginPath(); c.arc(cx, cy, r, a0, a0 + 0.9 + rnd() * 1.4); c.stroke();
    }
  }
  function drawTyre(c, s, rnd) {
    for (const x0 of [0.3, 0.7]) {
      const w = s * (0.13 + rnd() * 0.04), x = s * (x0 + (rnd() - 0.5) * 0.04);
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.8, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - w / 2, 0, w, s);
    }
  }
  function drawPatch(c, s, rnd) {
    const cx = s / 2, cy = s / 2, n = 14, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = s * (0.3 + (rnd() - 0.5) * 0.12);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= n; i++) { const p = pts[i % n]; c.lineTo(p[0], p[1]); }
    c.closePath();
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = s * 0.03; c.stroke();
  }

  // Darkening atlas: alpha is coverage, RGB is unused (the tint is a vertex attribute).
  function makeMulAtlas(S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const cell = S / 4, rnd = U.rng(5150), rect = {};
    const put = (name, col, row, blur, draw) => {
      const x0 = col * cell, y0 = row * cell, m = Math.max(2, Math.round(cell * 0.03));
      c.save();
      c.beginPath(); c.rect(x0 + m, y0 + m, cell - 2 * m, cell - 2 * m); c.clip();
      c.translate(x0, y0);
      c.filter = blur ? 'blur(' + (blur * cell / 128).toFixed(2) + 'px)' : 'none';
      draw(cell);
      c.restore();
      rect[name] = [(x0 + m) / S, 1 - (y0 + cell - m) / S, (x0 + cell - m) / S, 1 - (y0 + m) / S];
    };
    put('grimeA', 0, 0, 0.5, (s) => drawGrime(c, s, rnd));
    put('grimeB', 1, 0, 0.5, (s) => drawGrime(c, s, rnd));
    put('grimeC', 2, 0, 0.7, (s) => { drawGrime(c, s, rnd); drawGrime(c, s, rnd); });
    put('streakA', 3, 0, 0.6, (s) => drawStreak(c, s, rnd, false));
    put('streakB', 0, 1, 0.6, (s) => drawStreak(c, s, rnd, false));
    put('streakThin', 1, 1, 0.5, (s) => drawStreak(c, s, rnd, true));
    put('stainA', 2, 1, 1.4, (s) => drawStain(c, s, rnd));
    put('stainB', 3, 1, 1.4, (s) => drawStain(c, s, rnd));
    put('oilA', 0, 2, 1.8, (s) => drawOil(c, s, rnd));
    put('oilB', 1, 2, 1.8, (s) => drawOil(c, s, rnd));
    put('crackA', 2, 2, 0, (s) => drawCrack(c, s, rnd));
    put('crackB', 3, 2, 0, (s) => drawCrack(c, s, rnd));
    put('scuffA', 0, 3, 1.0, (s) => drawScuff(c, s, rnd));
    put('tyreA', 1, 3, 1.2, (s) => drawTyre(c, s, rnd));
    put('patchA', 2, 3, 0.8, (s) => drawPatch(c, s, rnd));
    put('dustA', 3, 3, 2.0, (s) => drawStain(c, s, rnd));
    const tex = new THREE.CanvasTexture(cv);
    return { tex, rect };
  }

  // Grass tuft cards: four 2x2 cells, blades drawn light so the vertex colour sets the green.
  function makeGrassAtlas(S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const cell = S / 2, rnd = U.rng(777), rect = [];
    for (let k = 0; k < 4; k++) {
      const x0 = (k % 2) * cell, y0 = Math.floor(k / 2) * cell;
      for (let b = 0; b < 16; b++) {
        const bx = x0 + cell * (0.2 + rnd() * 0.6), h = cell * (0.4 + rnd() * 0.5);
        const lean = (rnd() - 0.5) * cell * 0.5, w = cell * (0.025 + rnd() * 0.03);
        const v = Math.round(190 + rnd() * 65);
        c.fillStyle = 'rgba(' + v + ',' + v + ',' + Math.round(v * 0.92) + ',1)';
        c.beginPath();
        c.moveTo(bx - w, y0 + cell); c.lineTo(bx + w * 0.3, y0 + cell); c.lineTo(bx + lean, y0 + cell - h);
        c.closePath(); c.fill();
      }
      rect.push([x0 / S, 1 - (y0 + cell) / S, (x0 + cell) / S, 1 - y0 / S]);
    }
    const tex = new THREE.CanvasTexture(cv);
    return { tex, rect };
  }

  // Painted-band grain: mid-light speckle that multiplies the band colour.
  function makeBandTex() {
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), rnd = U.rng(4242);
    c.fillStyle = '#e4e4e0'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const v = Math.round(150 + rnd() * 100);
      c.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
      const r = 0.6 + rnd() * 1.6;
      c.fillRect(rnd() * S, rnd() * S, r, r);
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 14;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(120,120,120,0.10)'); rg.addColorStop(1, 'rgba(120,120,120,0)');
      c.fillStyle = rg; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Atlases are shared by every build at the same resolution and never disposed.
  const TEX = {};
  function textures(q) {
    if (TEX[q]) return TEX[q];
    const S = q === 'low' ? 256 : 512;
    const mul = makeMulAtlas(S);
    const grass = makeGrassAtlas(256);
    return (TEX[q] = { mul, grass, band: makeBandTex() });
  }

  // Bakes the level's patch into a MeshStandardMaterial (copied from level.js bakedPatch,
  // so these materials share the wall shader program).
  function bakedPatch(m) {
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec4 bake;\nvarying vec4 vBake;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBake = bake;');
      shader.fragmentShader = 'varying vec4 vBake;\n' + shader.fragmentShader
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tirradiance += vBake.rgb * PI;\n\tfloat bakeLum = dot(vBake.rgb, vec3(0.3, 0.59, 0.11));\n\tfloat envK = clamp(bakeLum * 1.6 + 0.06, 0.0, 1.2);\n\tradiance *= envK; iblIrradiance *= envK;')
        .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= vBake.a;\n\treflectedLight.indirectSpecular *= vBake.a;\n\treflectedLight.directDiffuse *= mix(1.0, vBake.a, 0.35);');
    };
    m.customProgramCacheKey = () => 'jb-baked';
    return m;
  }

  // ------------------------------------------------------------ geometry accumulators
  class Acc {
    constructor(kind) { this.kind = kind; this.pos = []; this.nor = []; this.uv = []; this.col = []; this.bake = []; this.tint = []; this.idx = []; this.quads = 0; }
    get n() { return this.pos.length / 3; }
  }
  const UV4 = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
  const UV_UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

  // Reorders four corners (BL, BR, TR, TL) so the quad faces n.
  function orient(p, uv, n) {
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) return { p, uv };
    return { p: [p[0], p[3], p[2], p[1]], uv: [uv[0], uv[3], uv[2], uv[1]] };
  }
  function pushQuad(acc, p, uv, n) {
    const base = acc.n;
    for (let k = 0; k < 4; k++) {
      acc.pos.push(p[k][0], p[k][1], p[k][2]);
      acc.nor.push(n[0], n[1], n[2]);
      acc.uv.push(uv[k][0], uv[k][1]);
    }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    acc.quads++;
  }
  // Darkening quad: only position, uv and the tint (rgb, strength) go in.
  function mulQuad(acc, p, uv, n, tint, str) {
    const o = orient(p, uv, n);
    pushQuad(acc, o.p, o.uv, n);
    for (let k = 0; k < 4; k++) acc.tint.push(tint[0], tint[1], tint[2], str);
  }

  // Lighting replica: the same formulas as level.js lightAt, fed from the level's
  // exported light list and region bounce values.
  function makeLighter(level, campus) {
    const groupOf = {};
    const bounce = {};
    const outGi = campus ? (level.regions.find((r) => r.outdoor && !r.roof) || {}).gi : -1;
    const preset = (name) => (campus && CAMPUS_LIGHTS[name]) || (JB.Level.LIGHTS[name] || null);
    for (const reg of level.regions) {
      const P = preset(reg.light);
      if (!P) continue;
      const c = new THREE.Color(P.c).multiplyScalar(P.bounce * (reg.sky ? 1.6 : 1));
      if (!bounce[reg.gi]) bounce[reg.gi] = c; else bounce[reg.gi].lerp(c, 0.3);
    }
    for (const L of level.lights) (groupOf[L.g] || (groupOf[L.g] = [])).push(L);
    const out = [0, 0, 0];
    function lightAt(x, y, z, nx, ny, nz, g) {
      const bc = bounce[g];
      let r = bc ? bc.r : 0.05, gg = bc ? bc.g : 0.05, b = bc ? bc.b : 0.05;
      const hemi = g === outGi ? 0.55 + 0.45 * ny : 0.75 + 0.25 * ny;
      r *= hemi; gg *= hemi; b *= hemi;
      const list = groupOf[g];
      if (list) for (let k = 0; k < list.length; k++) {
        const Lt = list[k];
        const dx = Lt.x - x, dy = Lt.y - y, dz = Lt.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > Lt.r * Lt.r) continue;
        const d = Math.sqrt(d2) + 1e-4;
        let lam = (dx * nx + dy * ny + dz * nz) / d;
        lam = (lam + 0.15) / 1.15;
        if (lam <= 0) continue;
        const f = 1 - d2 / (Lt.r * Lt.r);
        const lobe = (Lt.beacon || Lt.fx === 'beacon') ? 1 : 0.3 + 0.7 * U.clamp(dy / d, 0, 1);
        const att = (f * f) / (1 + 0.35 * d2) * 4.0;
        const k2 = Lt.i * lam * att * lobe;
        r += Lt.c.r * k2; gg += Lt.c.g * k2; b += Lt.c.b * k2;
      }
      out[0] = r; out[1] = gg; out[2] = b;
      return out;
    }
    // Wall-style ambient occlusion (level.js wallAO): darker at the floor and under the ceiling.
    function aoAt(y, fl, ce) {
      const db = y - fl, dt = ce - y;
      let ao = 1 - 0.45 * (1 - smooth(clamp01(db / 0.9)));
      if (ce < INF / 2) ao *= 1 - 0.3 * (1 - smooth(clamp01(dt / 0.6)));
      return ao;
    }
    return { lightAt, aoAt };
  }

  // Lit quad: colour per vertex plus the level's bake (light rgb + AO in alpha).
  function litQuad(acc, p, uv, n, col, gi, fl, ce, L) {
    const o = orient(p, uv, n);
    pushQuad(acc, o.p, o.uv, n);
    for (let k = 0; k < 4; k++) {
      const q = o.p[k];
      acc.col.push(col[0], col[1], col[2]);
      const lc = L.lightAt(q[0], q[1], q[2], n[0], n[1], n[2], gi);
      const ao = fl === null ? 0.9 : L.aoAt(q[1], fl, ce);
      acc.bake.push(lc[0], lc[1], lc[2], ao);
    }
  }
  function litBox(acc, b, col, gi, fl, ce, L) {
    const [x0, y0, z0, x1, y1, z1] = b;
    litQuad(acc, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], UV_UNIT, [1, 0, 0], col, gi, fl, ce, L);
    litQuad(acc, [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], UV_UNIT, [-1, 0, 0], col, gi, fl, ce, L);
    litQuad(acc, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], UV_UNIT, [0, 1, 0], col, gi, fl, ce, L);
    litQuad(acc, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], UV_UNIT, [0, 0, 1], col, gi, fl, ce, L);
    litQuad(acc, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], UV_UNIT, [0, 0, -1], col, gi, fl, ce, L);
  }

  // ------------------------------------------------------------ map read-out
  // Walls and floors per grid cell, for both builders. A wall face is a 0.5 m run on
  // one grid edge with its room side (n points into the room) and its vertical span.
  function readMap(level, data, campus) {
    const G = level.grid, W = G.W, H = G.H, GX0 = G.GX0, GZ0 = G.GZ0;
    const N = campus ? G.N : W * H, L = campus ? G.L : 1;
    const regions = level.regions;
    const regC = (C) => { const k = G.cellR[C]; return k >= 0 ? regions[k] : null; };
    const forCells = (r, fn) => {
      const i0 = Math.max(0, Math.floor((r[0] - GX0) / CS + 1e-6)), i1 = Math.min(W, Math.ceil((r[2] - GX0) / CS - 1e-6));
      const j0 = Math.max(0, Math.floor((r[1] - GZ0) / CS + 1e-6)), j1 = Math.min(H, Math.ceil((r[3] - GZ0) / CS - 1e-6));
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(j * W + i, i, j);
    };
    const bldAt = new Int16Array(W * H).fill(-1);
    (data.buildings || []).forEach((b, k) => (b.rects || []).forEach((r) => forCells(r, (c) => { bldAt[c] = k; })));
    const doorAt = new Map(), winAt = new Map();
    (data.doors || []).forEach((d) => forCells(d.r, (c) => doorAt.set(c, d)));
    (data.windows || []).forEach((w) => forCells(w.r, (c) => winAt.set(c, w)));

    const walls = [], floors = [], cornerMask = new Uint8Array(W * H);
    const colTop = (c2) => {
      let top = -Infinity;
      for (let s = 0; s < L; s++) {
        const C2 = s * N + c2;
        if (G.cellR[C2] < 0) break;
        const cy = G.ceilH[C2] < INF / 2 ? G.ceilH[C2] : G.floorH[C2];
        if (cy > top) top = cy;
      }
      return top;
    };
    const outdoorAt = (c2, y) => {
      for (let s = 0; s < L; s++) {
        const C2 = s * N + c2;
        const r = regC(C2);
        if (!r) break;
        if (r.outdoor && Math.abs(G.floorH[C2] - y) < 0.8) return true;
      }
      return false;
    };
    // DIRS: bit, di, dj, and the face placement: N/S runs along x, W/E along z.
    const DIRS = [
      { bit: 1, di: 0, dj: -1, axis: 'x', nx: 0, nz: 1, edge: (x0, z0) => z0 },
      { bit: 2, di: 0, dj: 1, axis: 'x', nx: 0, nz: -1, edge: (x0, z0) => z0 + CS },
      { bit: 4, di: -1, dj: 0, axis: 'z', nx: 1, nz: 0, edge: (x0) => x0 },
      { bit: 8, di: 1, dj: 0, axis: 'z', nx: -1, nz: 0, edge: (x0) => x0 + CS }
    ];
    for (let s = 0; s < L; s++) for (let c = 0; c < W * H; c++) {
      const C = s * N + c;
      const reg = regC(C);
      if (!reg) continue;
      const i = c % W, j = (c / W) | 0;
      const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, y = G.floorH[C];
      if (reg.isStair) continue;
      floors.push({ x0, z0, x1: x0 + CS, z1: z0 + CS, y, reg, gi: reg.gi, c, C, outdoor: !!reg.outdoor, roof: !!reg.roof, ceil: G.ceilH ? G.ceilH[C] : reg.ceil });
      const ceil = campus ? G.ceilH[C] : reg.ceil;
      for (const d of DIRS) {
        const i2 = i + d.di, j2 = j + d.dj;
        if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= H) continue;
        const c2 = j2 * W + i2;
        let wallHere, ext = false, bld = bldAt[c], top = ceil;
        if (campus) {
          if (!(G.edgeFlag[C] & d.bit)) continue;
          const t2 = colTop(c2);
          if (t2 === -Infinity || t2 <= y + 0.8) continue;   // no building wall here
          ext = !!reg.outdoor || outdoorAt(c2, y);
          if (ext) bld = reg.outdoor ? bldAt[c2] : bldAt[c];
          top = ceil < INF / 2 ? ceil : t2;
          wallHere = true;
        } else {
          const C2 = c2;
          const rn = regC(C2);
          if (rn && rn.gi === reg.gi) continue;
          if (G.doorCell[c] >= 0 && G.doorCell[c] === G.doorCell[c2]) continue;
          wallHere = true;
        }
        if (!wallHere) continue;
        const cx = x0 + CS / 2, cz = z0 + CS / 2;
        const line = d.edge(x0, z0);
        const door = doorAt.get(c) && doorAt.get(c) === doorAt.get(c2) ? doorAt.get(c) : null;
        const win = winAt.get(c) || winAt.get(c2) || null;
        if (top - y < 0.3) continue;
        walls.push({
          axis: d.axis, line, a0: d.axis === 'x' ? x0 : z0, a1: d.axis === 'x' ? x0 + CS : z0 + CS,
          nx: d.nx, nz: d.nz, y0: y, y1: top, reg, gi: reg.gi, c, c2, C, cx, cz, ext, bld,
          door, win, outdoorRoom: !!reg.outdoor, roofFace: !!reg.roof
        });
        cornerMask[c] |= d.bit;
      }
    }
    // Fences and other props as line segments (for tufts).
    const fences = (data.props || []).filter((p) => p.t === 'fence' && p.a && p.b).map((p) => [p.a, p.b]);
    return { walls, floors, cornerMask, doorAt, winAt, bldAt, fences, forCells, W, H, GX0, GZ0 };
  }

  // ------------------------------------------------------------ the builder
  let ACTIVE = null;   // { level, campus } while a map is built, for surfaceOf()

  function build(opts) {
    const level = opts.level, data = opts.data || {}, scene = opts.scene;
    const campus = opts.mapId === 'campus';
    const q = opts.quality === 'low' ? 'low' : opts.quality === 'high' ? 'high' : 'medium';
    const dens = q === 'low' ? 0.6 : q === 'high' ? 1.1 : 1;
    const rnd = U.rng(campus ? 9337 : 4217);
    const T = textures(q);
    const Lt = makeLighter(level, campus);
    const M = readMap(level, data, campus);
    const { walls, floors, cornerMask, doorAt, winAt, bldAt, fences, W, H, GX0, GZ0 } = M;
    const G = level.grid;

    const mulAcc = new Acc('mul'), bandAcc = new Acc('lit'), trimAcc = new Acc('lit'), metalAcc = new Acc('lit'), grassAcc = new Acc('lit');
    const R = T.mul.rect;
    const mulColour = {
      grime: [0.40, 0.38, 0.35], rust: [0.55, 0.38, 0.22], water: [0.42, 0.43, 0.42],
      stain: [0.50, 0.42, 0.30], oil: [0.26, 0.27, 0.31], crack: [0.30, 0.29, 0.28],
      scuff: [0.45, 0.43, 0.40], tyre: [0.20, 0.20, 0.22], patch: [0.46, 0.44, 0.41]
    };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const wallP = (w, a, y, push) => {
      const e = EPS + (push || 0);
      return w.axis === 'x' ? [a, y, w.line + w.nz * e] : [w.line + w.nx * e, y, a];
    };
    const wallN = (w) => [w.nx, 0, w.nz];
    // A darkening quad on a wall: a run [a0, a1] between heights y0 and y1.
    const wallMul = (w, cell, a0, a1, y0, y1, tint, str) => {
      const p = [wallP(w, a0, y0), wallP(w, a1, y0), wallP(w, a1, y1), wallP(w, a0, y1)];
      mulQuad(mulAcc, p, UV4(R[cell]), wallN(w), tint, str);
    };
    // A darkening quad on the floor: centre (cx, cz), half sizes hw (along angle a) and hh.
    const floorMul = (cx, cz, y, a, hw, hh, cell, tint, str) => {
      const t = [Math.cos(a), 0, Math.sin(a)], b = [-Math.sin(a), 0, Math.cos(a)];
      const P = (sx, sy) => [cx + t[0] * sx * hw + b[0] * sy * hh, y + EPS, cz + t[2] * sx * hw + b[2] * sy * hh];
      mulQuad(mulAcc, [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], UV4(R[cell]), [0, 1, 0], tint, str);
    };
    const tuftAt = (x, y, z, gi, scale) => {
      const s = scale || 1, col = [0.42 + rnd() * 0.12, 0.47 + rnd() * 0.1, 0.27 + rnd() * 0.06];
      const cell = T.grass.rect[Math.floor(rnd() * 4)];
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI + k * Math.PI / 2, hw = 0.2 * s, hh = 0.2 * s + rnd() * 0.08 * s;
        const tx = Math.cos(a), tz = Math.sin(a);
        const p = [[x - tx * hw, y, z - tz * hw], [x + tx * hw, y, z + tz * hw], [x + tx * hw, y + hh * 1.2, z + tz * hw], [x - tx * hw, y + hh * 1.2, z - tz * hw]];
        litQuad(grassAcc, p, UV4(cell), [0, 1, 0], col, gi, null, null, Lt);
      }
    };

    // Chipped painted lower band along one wall run. The top edge is a wobbly
    // line with notches where the paint has come off; a thin grey render lip sits above.
    const bandPalette = [[0.365, 0.541, 0.361], [0.369, 0.557, 0.522], [0.482, 0.557, 0.624]];
    const bandRun = (w, a0, a1, bh, col, k) => {
      const seg = 0.125;
      for (let a = a0; a < a1 - 1e-6; a += seg) {
        const b = Math.min(a1, a + seg);
        const ta = edgeTop(a, bh, k), tb = edgeTop(b, bh, k);
        const shade = 0.93 + 0.12 * hash(Math.floor(a * 8), k);
        const c2 = [col[0] * shade, col[1] * shade, col[2] * shade];
        litQuad(bandAcc, [wallP(w, a, w.y0), wallP(w, b, w.y0), wallP(w, b, tb), wallP(w, a, ta)], UV_UNIT, wallN(w), c2, w.gi, w.y0, w.y1, Lt);
        litQuad(bandAcc, [wallP(w, a, ta), wallP(w, b, tb), wallP(w, b, tb + 0.03, 0), wallP(w, a, ta + 0.03, 0)], UV_UNIT, wallN(w), [0.70, 0.69, 0.65], w.gi, w.y0, w.y1, Lt);
      }
    };
    const edgeTop = (s, bh, k) => {
      let dip = 0;
      const cell = Math.floor(s / 1.6);
      for (let q2 = cell - 1; q2 <= cell + 1; q2++) {
        if (hash(q2, k) < 0.45) continue;
        const cx = (q2 + 0.2 + 0.6 * hash(q2, k + 1)) * 1.6;
        const wd = 0.18 + 0.4 * hash(q2, k + 2), dp = 0.06 + 0.2 * hash(q2, k + 3);
        const d = Math.abs(s - cx) / wd;
        if (d < 1) dip = Math.max(dip, dp * (1 - d * d));
      }
      return bh + 0.025 * Math.sin(s * 3.1 + k) + 0.018 * Math.sin(s * 7.3 + 2 * k) - dip;
    };

    // Door kick plates and kick strips and corner guards go through trimAcc / metalAcc.
    const trimCol = [0.22, 0.24, 0.27];
    const metalCol = [0.46, 0.49, 0.53];
    const plateCol = [0.50, 0.53, 0.56];

    // ------------------------------------------------------------ walls
    let nBand = 0, nKick = 0;
    for (const w of walls) {
      let y1 = w.y1;
      const inDoor = !!w.door;
      if (w.win) {
        const base = campus && w.win.y !== undefined ? w.win.y : w.y0;
        const sill = base + w.win.sill;
        if (sill < y1) y1 = sill;
      }
      if (inDoor) continue;   // door openings get plates and scuffs below, nothing else on the wall
      const h = y1 - w.y0;
      if (h < 0.3) continue;
      const along = w.a1 - w.a0;
      // wall-base grime (0 to ~0.6 m), strongest on the outside and in corridors
      const corr = w.reg && (w.reg.light === 'corridor' || /Corridor/i.test(w.reg.name || ''));
      const pGrime = w.ext ? 0.88 : corr ? 0.92 : 0.6;
      if (rnd() < pGrime * dens) {
        const hg = Math.min(h, w.ext ? 0.5 + rnd() * 0.45 : 0.32 + rnd() * 0.3);
        const grow = (rnd() - 0.5) * 0.1;
        const cell = pick(['grimeA', 'grimeB', 'grimeC']);
        const str = w.ext ? 0.85 + rnd() * 0.15 : 0.55 + rnd() * 0.3;
        wallMul(w, cell, w.a0 - grow, w.a1 + grow, w.y0, w.y0 + hg, mulColour.grime, str);
      }
      // dark streaks running down from the top edge (roof edge, sills, parapets, pipes)
      if (h > 2.0 && rnd() < (w.ext ? 0.2 : w.reg && /metal|panel/.test(w.reg.wmat || '') ? 0.2 : 0.035) * dens) {
        const len = Math.min(h - 0.3, 1.2 + rnd() * 2.2), x = w.a0 + along * (0.2 + 0.6 * rnd()), hw = 0.11 + rnd() * 0.1;
        const rust = w.ext ? rnd() < 0.4 : rnd() < 0.5;
        wallMul(w, rnd() < 0.5 ? 'streakA' : 'streakB', x - hw, x + hw, y1 - len, y1, rust ? mulColour.rust : mulColour.water, 0.6 + rnd() * 0.25);
      }
      // plaster stains (interior)
      if (!w.ext && h > 1.2 && rnd() < 0.05 * dens) {
        const x = w.a0 + along * (0.2 + 0.6 * rnd()), yy = w.y0 + 0.9 + rnd() * 1.2, hw = 0.25 + rnd() * 0.22, hh = 0.2 + rnd() * 0.25;
        wallMul(w, rnd() < 0.5 ? 'stainA' : 'stainB', x - hw, x + hw, yy - hh, yy + hh, mulColour.stain, 0.5 + rnd() * 0.3);
      }
      // water running down from a window sill
      if (w.win && rnd() < 0.85 * dens) {
        const base = campus && w.win.y !== undefined ? w.win.y : w.y0;
        const sill = base + w.win.sill, len = 0.8 + rnd() * 1.1;
        if (sill > w.y0 + 0.3) wallMul(w, 'streakThin', w.a0 + along * 0.1, w.a1 - along * 0.1, sill - len, sill, mulColour.water, 0.7);
      }
      // bands (campus outside walls, a few corridor walls in the Facility)
      if (!inDoor) {
        const bandOK = campus ? (w.ext && w.outdoorRoom && !w.roofFace && (hash(w.bld, 11) < 0.72)) : (corr && hash(w.reg.index, 19) < 0.3);
        const bh = campus ? 1.05 + hash(w.bld, 13) * 0.35 : 1.05 + rnd() * 0.25;
        if (bandOK && y1 - w.y0 > bh + 0.25) {
          const col = campus ? bandPalette[Math.floor(hash(w.bld, 3) * 3)] : [0.463, 0.522, 0.353];
          bandRun(w, w.a0, w.a1, w.y0 + bh, col, Math.round(w.a0 * 37 + w.line * 11) | 0);
          nBand++;
        }
        // grass tufts at the foot of building walls
        if (campus && w.ext && w.outdoorRoom && rnd() < 0.3 * dens) {
          tuftAt(w.cx + w.nx * 0.2 + (w.axis === 'z' ? 0 : (rnd() - 0.5) * 0.4), w.y0, w.cz + w.nz * 0.2 + (w.axis === 'x' ? 0 : (rnd() - 0.5) * 0.4), w.gi, 0.9 + rnd() * 0.5);
        }
      }
      // kick strips at interior bases (campus has none; the Facility has them except on tiles and brick)
      if (!w.ext && !(w.reg && w.reg.isStair)) {
        const kick = campus ? rnd() < 0.9 : /tiles|brick/.test(w.reg.wmat || '');
        if (kick) {
          const kh = campus ? 0.1 : 0.12;
          const a0 = w.a0, a1 = w.a1;
          const yy = w.y0;
          if (w.axis === 'x') litBox(trimAcc, [a0, yy, w.nz > 0 ? w.line : w.line - 0.02, a1, yy + kh, w.nz > 0 ? w.line + 0.02 : w.line], trimCol, w.gi, yy, w.y1, Lt);
          else litBox(trimAcc, [w.nx > 0 ? w.line : w.line - 0.02, yy, a0, w.nx > 0 ? w.line + 0.02 : w.line, yy + kh, a1], trimCol, w.gi, yy, w.y1, Lt);
          nKick++;
        }
      }
    }

    // ------------------------------------------------------------ corners (Facility corridors)
    if (!campus) {
      for (let c = 0; c < W * H; c++) {
        const m = cornerMask[c];
        if (!m) continue;
        const reg = G.cellR[c] >= 0 ? level.regions[G.cellR[c]] : null;
        if (!reg || reg.isStair) continue;
        const corr = reg.light === 'corridor' || /Corridor/i.test(reg.name || '');
        const hasN = !!(m & 1), hasS = !!(m & 2), hasW = !!(m & 4), hasE = !!(m & 8);
        const pC = corr ? 0.3 : 0.07;
        if (rnd() > pC * dens) continue;
        const i = c % W, j = (c / W) | 0;
        const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS, fl = G.floorH[c];
        if (!(hasN !== hasS && hasE !== hasW)) continue;
        const cornerX = hasE ? x1 : x0, cornerZ = hasS ? z1 : z0;
        const ix = hasE ? -1 : 1, iz = hasS ? -1 : 1, ln = 0.45, th = 0.025, hgt = 1.2;
        const gi = reg.gi;
        // along the east/west wall, then along the north/south wall
        const gx = Math.min(cornerX, cornerX + ix * th), gxM = Math.max(cornerX, cornerX + ix * th);
        const gzA = Math.min(cornerZ, cornerZ + iz * ln), gzB = Math.max(cornerZ, cornerZ + iz * ln);
        litBox(metalAcc, [gx, fl, gzA, gxM, fl + hgt, gzB], metalCol, gi, fl, reg.ceil, Lt);
        const gz = Math.min(cornerZ, cornerZ + iz * th), gzM = Math.max(cornerZ, cornerZ + iz * th);
        const gxA = Math.min(cornerX, cornerX + ix * ln), gxB = Math.max(cornerX, cornerX + ix * ln);
        litBox(metalAcc, [gxA, fl, gz, gxB, fl + hgt, gzM], metalCol, gi, fl, reg.ceil, Lt);
      }
    }

    // ------------------------------------------------------------ door kick plates and scuffs
    const doneDoors = new Set();
    for (const [c, d] of doorAt) {
      if (doneDoors.has(d)) continue;
      doneDoors.add(d);
      const r = d.r, alongX = r[2] - r[0] >= r[3] - r[1];
      const midX = (r[0] + r[2]) / 2, midZ = (r[1] + r[3]) / 2;
      const yFloor = level.floorAt(midX, midZ, 0);
      const fl = yFloor === null || yFloor === undefined ? 0 : yFloor;
      const reg = level.regionAt(midX, midZ, fl + 0.5);
      if (!reg) continue;
      // plates on the two flanks of the opening, both room faces
      const fa = alongX ? [r[0], r[2]] : [r[1], r[3]];
      const flankSpans = [[fa[0] - 0.32, fa[0]], [fa[1], fa[1] + 0.32]];
      for (const [s0, s1] of flankSpans) {
        for (const side of [-1, 1]) {
          const sx = alongX ? (s0 + s1) / 2 : (side < 0 ? r[0] : r[2]) + side * 0.25;
          const sz = alongX ? (side < 0 ? r[1] : r[3]) + side * 0.25 : (s0 + s1) / 2;
          const room = level.regionAt(sx, sz, fl + 0.5);
          if (!room) continue;
          if (alongX) {
            const zf = side < 0 ? r[1] : r[3];
            const zb = zf + (side < 0 ? -0.012 : 0.012);
            const zlo = Math.min(zf, zb), zhi = Math.max(zf, zb);
            litBox(metalAcc, [s0, fl, zlo, s1, fl + 0.3, zhi], plateCol, room.gi, fl, reg.ceil || fl + 3, Lt);
          } else {
            const xf = side < 0 ? r[0] : r[2];
            const xb = xf + (side < 0 ? -0.012 : 0.012);
            litBox(metalAcc, [Math.min(xf, xb), fl, s0, Math.max(xf, xb), fl + 0.3, s1], plateCol, room.gi, fl, reg.ceil || fl + 3, Lt);
          }
        }
      }
      // scuffs on the floor either side of the opening, where the walk goes through
      for (const side of [-1, 1]) {
        if (rnd() > 0.85 * dens) continue;
        const px = alongX ? midX : midX + side * 0.85, pz = alongX ? midZ + side * 0.85 : midZ;
        const f = level.floorAt(px, pz, fl);
        if (f === null || f === undefined) continue;
        floorMul(px, pz, f, rnd() * Math.PI, 0.6, 0.4, 'scuffA', mulColour.scuff, 0.45 + rnd() * 0.3);
      }
    }

    // ------------------------------------------------------------ floors
    let nFloorDec = 0;
    for (const f of floors) {
      const reg = f.reg, fm = reg.fmat || '';
      const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, y = f.y;
      const asphalt = /asphalt/.test(fm), paving = /paving/.test(fm);
      const corr = reg.light === 'corridor' || /Corridor/i.test(reg.name || '');
      // stains and oil
      if (!f.roof && !asphalt && !paving && rnd() < (f.outdoor ? 0.01 : 0.03) * dens) {
        floorMul(cx + (rnd() - 0.5) * 0.3, cz + (rnd() - 0.5) * 0.3, y, rnd() * 3, 0.45 + rnd() * 0.4, 0.4 + rnd() * 0.35, rnd() < 0.5 ? 'stainA' : 'stainB', mulColour.stain, 0.6 + rnd() * 0.3);
        nFloorDec++;
      }
      if (/diamond|grate|epoxy|hazard/.test(fm) && rnd() < 0.02 * dens) {
        floorMul(cx, cz, y, rnd() * 3, 0.5, 0.45, 'oilA', mulColour.oil, 0.6 + rnd() * 0.25);
        nFloorDec++;
      }
      if (asphalt) {
        if (rnd() < 0.028 * dens) {
          floorMul(cx, cz, y, rnd() < 0.5 ? 0 : Math.PI / 2, 0.85, 1.6, 'tyreA', mulColour.tyre, 0.55 + rnd() * 0.2);
          nFloorDec++;
        }
        if (rnd() < 0.02 * dens) { floorMul(cx, cz, y, rnd() * 3, 0.6 + rnd() * 0.5, 0.6 + rnd() * 0.5, rnd() < 0.5 ? 'oilA' : 'oilB', mulColour.oil, 0.6 + rnd() * 0.3); nFloorDec++; }
        if (rnd() < 0.018 * dens) { floorMul(cx, cz, y, rnd() * 3, 0.6 + rnd() * 0.4, 0.6 + rnd() * 0.4, 'patchA', mulColour.patch, 0.6 + rnd() * 0.3); nFloorDec++; }
        if (rnd() < 0.02 * dens) { floorMul(cx, cz, y, rnd() < 0.5 ? 0 : Math.PI / 2, 0.8 + rnd() * 0.5, 0.25 + rnd() * 0.1, rnd() < 0.5 ? 'crackA' : 'crackB', mulColour.crack, 0.7); nFloorDec++; }
      }
      if (paving && !f.roof) {
        if (rnd() < 0.02 * dens) { floorMul(cx, cz, y, rnd() < 0.5 ? 0 : Math.PI / 2, 0.8, 0.22, rnd() < 0.5 ? 'crackA' : 'crackB', mulColour.crack, 0.6); nFloorDec++; }
        // grass tufts in paving joints
        if (rnd() < 0.02 * dens) { tuftAt(cx + (rnd() - 0.5) * 0.4, y, cz + (rnd() - 0.5) * 0.4, f.gi, 0.7 + rnd() * 0.4); }
      }
      if (f.roof && rnd() < 0.015 * dens) { floorMul(cx, cz, y, rnd() * 3, 0.7, 0.5, 'stainB', mulColour.stain, 0.6); nFloorDec++; }
      // corridor walking lines: scuffs along the middle of the room
      if (corr && rnd() < 0.2 * dens) {
        const a = rnd() < 0.5 ? 0 : Math.PI / 2;
        floorMul(cx + (rnd() - 0.5) * 0.25, cz + (rnd() - 0.5) * 0.25, y, a, 0.55, 0.22, 'scuffA', mulColour.scuff, 0.4 + rnd() * 0.25);
        nFloorDec++;
      }
    }
    // long tyre tracks: a few per car park
    for (const f of floors) {
      if (!f.reg.fmat || !/asphalt/.test(f.reg.fmat)) continue;
      if (rnd() > 0.02 * dens) continue;
      const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, a = rnd() < 0.5 ? 0 : Math.PI / 2;
      for (let k = -1; k <= 1; k += 2) {
        const ox = Math.cos(a) * 0.55 * k, oz = Math.sin(a) * 0.55 * k;
        floorMul(cx + ox, cz + oz, f.y, a, 0.42, 1.6, 'tyreA', mulColour.tyre, 0.45);
      }
    }

    // ------------------------------------------------------------ fences: tufts along the foot
    for (const [a, b] of fences) {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      for (let s = 0.6; s < len - 0.4; s += 1.1) {
        if (rnd() > 0.45 * dens) continue;
        const side = rnd() < 0.5 ? -1 : 1, off = side * (0.25 + rnd() * 0.35);
        const x = a[0] + ux * s + nx * off, z = a[1] + uz * s + nz * off;
        const y = level.floorAt(x, z, 0);
        if (y === null || y === undefined) continue;
        const reg = level.regionAt(x, z, y + 0.5);
        if (!reg) continue;
        tuftAt(x, y, z, reg.gi, 0.9 + rnd() * 0.6);
      }
    }

    // ------------------------------------------------------------ meshes
    const group = new THREE.Group();
    group.name = 'decals';
    const mats = [], geos = [];
    const meshOf = (acc, mat, shadowIn) => {
      if (!acc.n) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      if (acc.kind === 'mul') {
        geo.setAttribute('aTint', new THREE.Float32BufferAttribute(acc.tint, 4));
      } else {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
        geo.setAttribute('bake', new THREE.Float32BufferAttribute(acc.bake, 4));
      }
      geo.setIndex(acc.n > 65535 ? new THREE.Uint32BufferAttribute(acc.idx, 1) : new THREE.Uint16BufferAttribute(acc.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = !!shadowIn;
      group.add(mesh);
      mats.push(mat); geos.push(geo);
      return mesh;
    };
    const fadeNear = campus ? [60, 130] : [26, 66];
    const mulMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: T.mul.tex }, uFade: { value: new THREE.Vector2(fadeNear[0], fadeNear[1]) } },
      vertexShader: 'attribute vec4 aTint; varying vec2 vUv; varying vec4 vTint; varying float vDist;\n' +
        'void main(){ vUv = uv; vTint = aTint; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uMap; uniform vec2 uFade; varying vec2 vUv; varying vec4 vTint; varying float vDist;\n' +
        'void main(){ float a = texture2D(uMap, vUv).a * vTint.a * (1.0 - smoothstep(uFade.x, uFade.y, vDist));\n' +
        '  gl_FragColor = vec4(mix(vec3(1.0), vTint.rgb, a), 1.0); }',
      // FrontSide: every quad is wound to face its normal (orient()). A transparent DoubleSide
      // material is drawn twice per frame in this three.js build (r137), which doubled its cost.
      transparent: true, depthWrite: false, depthTest: true, side: THREE.FrontSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4
    });
    const mulMesh = meshOf(mulAcc, mulMat, false);
    if (mulMesh) mulMesh.renderOrder = 2;
    const litStd = (extra) => bakedPatch(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, extra)));
    const bandMesh = meshOf(bandAcc, litStd({ map: T.band, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), true);
    const trimMesh = meshOf(trimAcc, litStd({ roughness: 0.7, metalness: 0.05 }), true);
    const metalMesh = meshOf(metalAcc, litStd({ roughness: 0.38, metalness: 0.55 }), true);
    const grassMesh = meshOf(grassAcc, litStd({ map: T.grass.tex, alphaTest: 0.45, roughness: 0.95, metalness: 0 }), false);
    if (bandMesh) bandMesh.renderOrder = 0;
    scene.add(group);

    ACTIVE = { level, campus };
    const stats = {
      calls: group.children.length, mulQuads: mulAcc.quads, bandQuads: bandAcc.quads, trimQuads: trimAcc.quads + metalAcc.quads,
      grassQuads: grassAcc.quads, bands: nBand, kicks: nKick, floorDecals: nFloorDec, tris: 0
    };
    stats.tris = group.children.reduce((s, m) => s + m.geometry.index.count / 3, 0);

    return {
      group, stats,
      dispose() {
        if (ACTIVE && ACTIVE.level === level) ACTIVE = null;
        scene.remove(group);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        group.clear();
      }
    };
  }

  // Surface class of a bullet hit, for the impact decals in fx.js.
  // Returns 'glass' | 'metal' | 'wood' | 'concrete'.
  function holeKind(hit, surface) {
    if (hit && hit.box && (hit.box.flags & 1)) return 'glass';
    if (surface === 'metal') return 'metal';
    if (ACTIVE && hit) {
      const r = ACTIVE.level.regionAt(hit.x - (hit.nx || 0) * 0.1, hit.z - (hit.nz || 0) * 0.1, hit.y - 0.3);
      if (r && /timber|wood/.test((r.fmat || '') + ' ' + (r.wmat || ''))) return 'wood';
      if (r && /metal|diamond|grate|roof_metal/.test((r.wmat || '') + ' ' + (r.fmat || ''))) return 'metal';
    }
    return surface === 'concrete' ? 'concrete' : (surface || 'concrete');
  }

  JB.Decals = { build, holeKind, hash };
})();
