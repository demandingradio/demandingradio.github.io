// Jimbog — level builder.
//
// Rasterises JB.MapData onto a 0.5 m grid, then generates:
//   * architecture (floors, ceilings, walls, door frames, windows, stairs,
//     skylights, railings) merged into one mesh per material,
//   * axis-aligned collision boxes for the physics world,
//   * light fixtures, and per-vertex BAKED lighting + ambient occlusion
//     (a cheap lightmap: every fixture lights every surface in its room),
//   * grid data the nav-mesh and gameplay code query (floor height, region).
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  const CS = 0.5;          // grid cell size (m)
  const BOTTOM = -9;       // solid floors extend down to here
  const DOOR_H = 2.5;      // standard door opening height
  const GX0 = -2, GZ0 = -1, GX1 = 114, GZ1 = 84;

  // Light presets: colour, intensity, range, spacing, fixture style.
  const LIGHTS = {
    office:   { c: 0xeef3ff, i: 1.05, r: 8.5, s: 4.5, fx: 'panel', bounce: 0.10 },
    lab:      { c: 0xe4f6ff, i: 1.15, r: 8, s: 4, fx: 'panel', bounce: 0.12 },
    corridor: { c: 0xfff0d8, i: 0.95, r: 7, s: 4.5, fx: 'strip', bounce: 0.08 },
    hall:     { c: 0xffc27e, i: 2.2, r: 15, s: 7.5, fx: 'highbay', bounce: 0.10 },
    barrel:   { c: 0xffc994, i: 1.7, r: 10, s: 6, fx: 'highbay', bounce: 0.09 },
    tunnel:   { c: 0xffad66, i: 1.0, r: 6.5, s: 6, fx: 'cage', bounce: 0.05 },
    wash:     { c: 0xd8ffe6, i: 0.95, r: 6.5, s: 3.5, fx: 'panel', bounce: 0.10 },
    duct:     { c: 0xff7a44, i: 0.8, r: 5, s: 5, fx: 'cage', bounce: 0.04 },
    stair:    { c: 0xf0f2ff, i: 0.95, r: 6.5, s: 3.5, fx: 'strip', bounce: 0.08 }
  };

  // Material parameters per texture.
  const MATP = {
    concrete_floor: { rough: 0.9, metal: 0.0, ns: 0.6 },
    concrete_wall:  { rough: 0.95, metal: 0.0, ns: 0.8 },
    metal_panel:    { rough: 0.7, metal: 0.55, ns: 0.7 },
    diamond_plate:  { rough: 0.65, metal: 0.7, ns: 1.0 },
    hazard:         { rough: 0.8, metal: 0.2, ns: 0.6 },
    tiles_wall:     { rough: 0.55, metal: 0.0, ns: 0.6 },
    tiles_floor:    { rough: 0.8, metal: 0.0, ns: 0.6 },
    epoxy_yellow:   { rough: 0.7, metal: 0.0, ns: 0.5 },
    painted_metal:  { rough: 0.6, metal: 0.35, ns: 0.6 },
    rust:           { rough: 1.0, metal: 0.3, ns: 1.0 },
    ceiling:        { rough: 0.9, metal: 0.3, ns: 0.8 },
    crate:          { rough: 0.9, metal: 0.0, ns: 0.7 },
    brick:          { rough: 0.95, metal: 0.0, ns: 1.0 },
    rubber:         { rough: 1.0, metal: 0.0, ns: 0.5 },
    lab_white:      { rough: 0.5, metal: 0.0, ns: 0.5 },
    grate:          { rough: 0.6, metal: 0.7, ns: 0.8 }
  };

  // Sun direction (from the sky toward the ground).
  const SUN_DIR = new THREE.Vector3(0.34, -1, 0.24).normalize();

  // ------------------------------------------------------------ geometry buckets
  // A bucket collects triangles for one material. Each vertex also records
  // the nav group it belongs to (for baking) and an ambient-occlusion value.
  class Bucket {
    constructor(key) {
      this.key = key; this.pos = []; this.nor = []; this.uv = []; this.grp = []; this.ao = []; this.idx = [];
      this.noBake = false;
    }
    get count() { return this.pos.length / 3; }
    vert(x, y, z, nx, ny, nz, u, v, g, ao) {
      this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.grp.push(g); this.ao.push(ao);
      return this.pos.length / 3 - 1;
    }
  }

  function build(opts) {
    const M = JB.MapData;
    const quality = opts.quality || 'medium';
    const texSize = quality === 'low' ? 256 : 512;
    const W = Math.round((GX1 - GX0) / CS), H = Math.round((GZ1 - GZ0) / CS), N = W * H;

    const cellR = new Int16Array(N).fill(-1);    // region index
    const floorH = new Float32Array(N).fill(BOTTOM);
    const doorCell = new Int16Array(N).fill(-1);
    const winCell = new Int16Array(N).fill(-1);
    const skyCell = new Uint8Array(N);
    const solid = new Uint8Array(N);               // prop footprints (for AO + nav)

    const ci = (x) => Math.round((x - GX0) / CS);
    const cj = (z) => Math.round((z - GZ0) / CS);
    const idx = (i, j) => j * W + i;
    const cx = (i) => GX0 + (i + 0.5) * CS;
    const cz = (j) => GZ0 + (j + 0.5) * CS;
    const cellAt = (x, z) => {
      const i = Math.floor((x - GX0) / CS), j = Math.floor((z - GZ0) / CS);
      if (i < 0 || j < 0 || i >= W || j >= H) return -1;
      return idx(i, j);
    };
    const fillRect = (r, fn) => {
      const i0 = ci(r[0]), i1 = ci(r[2]), j0 = cj(r[1]), j1 = cj(r[3]);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(idx(i, j), i, j);
    };

    // ---------------------------------------------------------------- regions
    const regs = [];
    const groupIndex = {};
    const groupOf = (name) => (name in groupIndex ? groupIndex[name] : (groupIndex[name] = Object.keys(groupIndex).length));
    for (const r of M.regions) {
      const reg = Object.assign({}, r, { index: regs.length, isStair: false });
      reg.gi = groupOf(r.group);
      regs.push(reg);
      for (const rect of r.rects) fillRect(rect, (c) => { cellR[c] = reg.index; floorH[c] = reg.floor; });
    }
    for (const v of M.voids) fillRect(v, (c) => { cellR[c] = -1; floorH[c] = BOTTOM; });

    // Stairs become regions of their own; cells get per-step heights.
    const stairs = [];
    for (const s of M.stairs) {
      const r = s.rect;
      const mid = cellAt((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
      const under = cellR[mid] >= 0 ? regs[cellR[mid]] : null;
      const inGroup = !!(under && under.group === s.group);
      const reg = {
        id: s.id, group: s.group, name: s.name || (under && under.name) || 'Stairs',
        floor: Math.min(s.y0, s.y1),
        ceil: inGroup ? under.ceil : Math.max(s.y0, s.y1) + 3.6,
        fmat: 'concrete_floor', wmat: inGroup ? under.wmat : 'concrete_wall',
        light: inGroup ? under.light : 'stair', index: regs.length, isStair: true, stair: s, inGroup
      };
      reg.gi = groupOf(s.group);
      regs.push(reg);
      const axisZ = s.up === 'N' || s.up === 'S';
      const L = axisZ ? r[3] - r[1] : r[2] - r[0];
      const rise = s.y1 - s.y0;
      const n = Math.max(1, Math.round(Math.abs(rise) / 0.18));
      const st = { def: s, reg, axisZ, L, rise, n, tread: L / n, rect: r };
      stairs.push(st);
      reg.st = st;
      fillRect(r, (c, i, j) => { cellR[c] = reg.index; floorH[c] = stairHeightAt(st, cx(i), cz(j)); });
    }
    function stairS(st, x, z) {
      const r = st.rect, up = st.def.up;
      if (up === 'N') return r[3] - z;
      if (up === 'S') return z - r[1];
      if (up === 'E') return x - r[0];
      return r[2] - x;
    }
    function stairHeightAt(st, x, z) {
      const s = U.clamp(stairS(st, x, z), 0, st.L - 1e-4);
      const k = Math.floor(s / st.tread);
      return st.def.y0 + (k + 1) * st.rise / st.n;
    }

    M.doors.forEach((d, k) => fillRect(d.r, (c) => { doorCell[c] = k; }));
    M.windows.forEach((w, k) => fillRect(w.r, (c) => { winCell[c] = k; }));
    for (const reg of regs) if (reg.sky) for (const s of reg.sky) fillRect(s, (c) => { if (cellR[c] === reg.index) skyCell[c] = 1; });

    const R = (c) => (c >= 0 && cellR[c] >= 0 ? regs[cellR[c]] : null);

    // ---------------------------------------------------------------- outputs
    const buckets = {};
    const bucket = (key) => buckets[key] || (buckets[key] = new Bucket(key));
    const boxes = [];   // {min:[..], max:[..], flags}
    const addBox = (x0, y0, z0, x1, y1, z1, flags) => {
      boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], flags: flags || 0 });
    };
    const F_GLASS = 1, F_RAIL = 2;   // glass/rails stop players but not bullets

    // Quad helper: corners in order (counter-clockwise seen from the front).
    // Tessellates into roughly `seg`-metre pieces so baked lighting is smooth.
    function quad(key, p0, p1, p2, p3, n, uvf, g, aof, seg) {
      const b = bucket(key);
      const lenU = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const lenV = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      const nu = Math.max(1, Math.ceil(lenU / (seg || 1) - 1e-6)), nv = Math.max(1, Math.ceil(lenV / (seg || 1) - 1e-6));
      const base = b.count;
      for (let v = 0; v <= nv; v++) {
        const tv = v / nv;
        for (let u = 0; u <= nu; u++) {
          const tu = u / nu;
          const x = p0[0] + (p1[0] - p0[0]) * tu + (p3[0] - p0[0]) * tv;
          const y = p0[1] + (p1[1] - p0[1]) * tu + (p3[1] - p0[1]) * tv;
          const z = p0[2] + (p1[2] - p0[2]) * tu + (p3[2] - p0[2]) * tv;
          const uv = uvf(x, y, z);
          b.vert(x, y, z, n[0], n[1], n[2], uv[0], uv[1], g, aof ? aof(x, y, z) : 1);
        }
      }
      for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
        const a = base + v * (nu + 1) + u, b1 = a + 1, c = a + nu + 2, d = a + nu + 1;
        b.idx.push(a, b1, c, a, c, d);
      }
    }
    const uvXZ = (x, y, z) => [x * 0.5, -z * 0.5];
    const uvXY = (x, y, z) => [x * 0.5, y * 0.5];
    const uvZY = (x, y, z) => [z * 0.5, y * 0.5];

    // Wall face on a grid line. axis 'x': the face runs along x at z = line,
    // normal = sign * +z.  axis 'z': runs along z at x = line, normal sign * +x.
    function wallFace(key, axis, line, a0, a1, y0, y1, sign, g, aof) {
      if (y1 - y0 < 0.01 || a1 - a0 < 0.01) return;
      if (axis === 'x') {
        const n = [0, 0, sign];
        if (sign > 0) quad(key, [a0, y0, line], [a1, y0, line], [a1, y1, line], [a0, y1, line], n, uvXY, g, aof, 1);
        else quad(key, [a1, y0, line], [a0, y0, line], [a0, y1, line], [a1, y1, line], n, uvXY, g, aof, 1);
      } else {
        const n = [sign, 0, 0];
        if (sign > 0) quad(key, [line, y0, a1], [line, y0, a0], [line, y1, a0], [line, y1, a1], n, uvZY, g, aof, 1);
        else quad(key, [line, y0, a0], [line, y0, a1], [line, y1, a1], [line, y1, a0], n, uvZY, g, aof, 1);
      }
    }
    // Axis-aligned box with world-scaled UVs (trim, frames, steps).
    function boxGeo(key, x0, y0, z0, x1, y1, z1, g, faces, aoBase) {
      const ao = () => (aoBase === undefined ? 1 : aoBase);
      const f = faces || 'tbnsew';
      if (f.includes('t')) quad(key, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvXZ, g, ao, 2);
      if (f.includes('b')) quad(key, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uvXZ, g, ao, 2);
      if (f.includes('s')) wallFace(key, 'x', z1, x0, x1, y0, y1, 1, g, ao);
      if (f.includes('n')) wallFace(key, 'x', z0, x0, x1, y0, y1, -1, g, ao);
      if (f.includes('e')) wallFace(key, 'z', x1, z0, z1, y0, y1, 1, g, ao);
      if (f.includes('w')) wallFace(key, 'z', x0, z0, z1, y0, y1, -1, g, ao);
    }

    // ------------------------------------------------------- edge flags (for AO)
    // For each cell: bit 1=N 2=S 4=W 8=E edge is "blocked" (wall, void, step up).
    const edgeFlag = new Uint8Array(N);
    const blocked = (a, b) => {
      const ra = R(a), rb = R(b);
      if (!ra) return false;
      if (!rb) return true;
      if (ra.gi !== rb.gi) {
        return !(doorCell[a] >= 0 && doorCell[a] === doorCell[b]);
      }
      return floorH[b] - floorH[a] > 0.3;
    };

    // ------------------------------------------------------------- props first
    // Props register colliders + footprints before AO so floors darken under them.
    const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
    function addGeo(key, geo, mtx, g, aof) {
      const b = bucket(key);
      const p = geo.attributes.position, nr = geo.attributes.normal, uv = geo.attributes.uv;
      _nm.getNormalMatrix(mtx);
      const base = b.count;
      for (let k = 0; k < p.count; k++) {
        _v.fromBufferAttribute(p, k).applyMatrix4(mtx);
        _n.fromBufferAttribute(nr, k).applyMatrix3(_nm).normalize();
        b.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, g, aof ? aof(_v.x, _v.y, _v.z) : 1);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) b.idx.push(base + geo.index.getX(k));
      else for (let k = 0; k < p.count; k++) b.idx.push(base + k);
    }
    const propAPI = {
      bucket, quad, boxGeo, wallFace, addBox, addGeo, uvXZ, uvXY, uvZY,
      floorAt: (x, z) => { const c = cellAt(x, z); return c >= 0 && cellR[c] >= 0 ? floorH[c] : 0; },
      ceilAt: (x, z) => { const r = R(cellAt(x, z)); return r ? r.ceil : 3; },
      groupAt: (x, z) => { const r = R(cellAt(x, z)); return r ? r.gi : 0; },
      regionAt: (x, z) => R(cellAt(x, z)),
      markSolid: (x0, z0, x1, z1) => {
        const i0 = Math.floor((x0 - GX0) / CS + 0.3), i1 = Math.ceil((x1 - GX0) / CS - 0.3);
        const j0 = Math.floor((z0 - GZ0) / CS + 0.3), j1 = Math.ceil((z1 - GZ0) / CS - 0.3);
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (i >= 0 && j >= 0 && i < W && j < H) solid[idx(i, j)] = 1;
      },
      F_GLASS, F_RAIL
    };

    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const c = idx(i, j);
      if (cellR[c] < 0) continue;
      let f = 0;
      if (blocked(c, c - W)) f |= 1;
      if (blocked(c, c + W)) f |= 2;
      if (blocked(c, c - 1)) f |= 4;
      if (blocked(c, c + 1)) f |= 8;
      edgeFlag[c] = f;
    }
    const decor = JB.Props.build(propAPI, M.props);  // dynamic bits (fans, steam)
    // Floor AO: distance to the nearest blocked edge or prop footprint.
    function aoFloor(x, z, strength) {
      const i0 = Math.floor((x - GX0) / CS), j0 = Math.floor((z - GZ0) / CS);
      let d = 9;
      for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const c = idx(i, j);
        const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS;
        if (solid[c] || cellR[c] < 0) {
          const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
          d = Math.min(d, Math.hypot(dx, dz) + (solid[c] ? 0.08 : 0));
          continue;
        }
        const f = edgeFlag[c];
        if (!f) continue;
        if (f & 1) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), z - z0));
        if (f & 2) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), z - z1));
        if (f & 4) d = Math.min(d, Math.hypot(x - x0, Math.max(z0 - z, 0, z - z1)));
        if (f & 8) d = Math.min(d, Math.hypot(x - x1, Math.max(z0 - z, 0, z - z1)));
      }
      const t = U.clamp(d / 1.1, 0, 1);
      return 1 - strength * (1 - U.smooth(t));
    }

    // ------------------------------------------------------------- floors/ceils
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = idx(i, j), reg = R(c);
      if (!reg) continue;
      const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS;
      if (!reg.isStair) {
        const y = reg.floor;
        quad('f:' + reg.fmat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], uvXZ, reg.gi, (x, yy, z) => aoFloor(x, z, 0.62), 1);
      }
      if (!skyCell[c]) {
        const y = reg.ceil;
        quad('ceil', [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], uvXZ, reg.gi, (x, yy, z) => aoFloor(x, z, 0.45), 1);
      }
    }
    // Floor + ceiling colliders: greedy rectangles of equal height per group.
    function greedy(valueOf, emit) {
      const used = new Uint8Array(N);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const c = idx(i, j);
        if (used[c]) continue;
        const v = valueOf(c);
        if (v === null) continue;
        let w = 1;
        while (i + w < W && !used[c + w] && valueOf(c + w) === v) w++;
        let h = 1;
        outer: while (j + h < H) {
          for (let k = 0; k < w; k++) { const cc = idx(i + k, j + h); if (used[cc] || valueOf(cc) !== v) break outer; }
          h++;
        }
        for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) used[idx(i + k, j + jj)] = 1;
        emit(GX0 + i * CS, GZ0 + j * CS, GX0 + (i + w) * CS, GZ0 + (j + h) * CS, v);
      }
    }
    greedy((c) => { const r = R(c); return r && !r.isStair ? r.floor : null; }, (x0, z0, x1, z1, y) => addBox(x0, BOTTOM, z0, x1, y, z1));
    greedy((c) => { const r = R(c); return r ? r.ceil : null; }, (x0, z0, x1, z1, y) => addBox(x0, y, z0, x1, y + 0.6, z1));

    // ------------------------------------------------------------------ stairs
    for (const st of stairs) {
      const r = st.rect, s = st.def, g = st.reg.gi;
      const key = 'stair';
      for (let k = 0; k < st.n; k++) {
        const top = s.y0 + (k + 1) * st.rise / st.n;
        const prev = s.y0 + k * st.rise / st.n;
        const sa = k * st.tread, sb = (k + 1) * st.tread;
        let x0, x1, z0, z1;
        if (s.up === 'N') { x0 = r[0]; x1 = r[2]; z1 = r[3] - sa; z0 = r[3] - sb; }
        else if (s.up === 'S') { x0 = r[0]; x1 = r[2]; z0 = r[1] + sa; z1 = r[1] + sb; }
        else if (s.up === 'E') { z0 = r[1]; z1 = r[3]; x0 = r[0] + sa; x1 = r[0] + sb; }
        else { z0 = r[1]; z1 = r[3]; x1 = r[2] - sa; x0 = r[2] - sb; }
        addBox(x0, BOTTOM, z0, x1, top, z1);
        // tread with a hazard nosing strip
        quad(key, [x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0], [0, 1, 0], uvXZ, g, (x, y, z) => aoFloor(x, z, 0.4), 1);
        // riser facing down-stairs
        const lo = Math.min(prev, top), hi = Math.max(prev, top);
        if (s.up === 'N') wallFace(key, 'x', z1, x0, x1, lo, hi, 1, g);
        else if (s.up === 'S') wallFace(key, 'x', z0, x0, x1, lo, hi, -1, g);
        else if (s.up === 'E') wallFace(key, 'z', x0, z0, z1, lo, hi, -1, g);
        else wallFace(key, 'z', x1, z0, z1, lo, hi, 1, g);
        const nose = 0.06;
        if (s.up === 'N') boxGeo('trim_y', x0, top - 0.02, z1 - nose, x1, top + 0.005, z1, g, 't');
        else if (s.up === 'S') boxGeo('trim_y', x0, top - 0.02, z0, x1, top + 0.005, z0 + nose, g, 't');
        else if (s.up === 'E') boxGeo('trim_y', x0, top - 0.02, z0, x0 + nose, top + 0.005, z1, g, 't');
        else boxGeo('trim_y', x1 - nose, top - 0.02, z0, x1, top + 0.005, z1, g, 't');
        // visible sides where the neighbour is an open lower floor of the same room
        const sideCheck = (sx, sz) => { const nr = R(cellAt(sx, sz)); return nr && nr.gi === g && !nr.isStair ? nr.floor : null; };
        if (st.axisZ) {
          const zm = (z0 + z1) / 2;
          const fw = sideCheck(x0 - 0.25, zm), fe = sideCheck(x1 + 0.25, zm);
          if (fw !== null && fw < top) wallFace(key, 'z', x0, z0, z1, fw, top, -1, g);
          if (fe !== null && fe < top) wallFace(key, 'z', x1, z0, z1, fe, top, 1, g);
        } else {
          const xm = (x0 + x1) / 2;
          const fn = sideCheck(xm, z0 - 0.25), fs = sideCheck(xm, z1 + 0.25);
          if (fn !== null && fn < top) wallFace(key, 'x', z0, x0, x1, fn, top, -1, g);
          if (fs !== null && fs < top) wallFace(key, 'x', z1, x0, x1, fs, top, 1, g);
        }
      }
      // handrails on open sides of stairs inside rooms
      const railSide = (side) => {
        let px, pz, ox = 0, oz = 0;
        if (st.axisZ) { px = side < 0 ? r[0] - 0.25 : r[2] + 0.25; pz = (r[1] + r[3]) / 2; ox = side < 0 ? 0.08 : -0.08; }
        else { px = (r[0] + r[2]) / 2; pz = side < 0 ? r[1] - 0.25 : r[3] + 0.25; oz = side < 0 ? 0.08 : -0.08; }
        const nr = R(cellAt(px, pz));
        return nr && nr.gi === g && !nr.isStair ? { ox, oz } : null;
      };
      for (const side of [-1, 1]) {
        const rs = railSide(side);
        if (!rs) continue;
        const n = Math.max(2, Math.ceil(st.L / 1.2));
        for (let k = 0; k <= n; k++) {
          const sPos = (k / n) * st.L;
          let x, z;
          if (s.up === 'N') { z = r[3] - sPos; x = side < 0 ? r[0] : r[2]; }
          else if (s.up === 'S') { z = r[1] + sPos; x = side < 0 ? r[0] : r[2]; }
          else if (s.up === 'E') { x = r[0] + sPos; z = side < 0 ? r[1] : r[3]; }
          else { x = r[2] - sPos; z = side < 0 ? r[1] : r[3]; }
          x += rs.ox; z += rs.oz;
          const yb = s.y0 + Math.min(st.n, Math.ceil(sPos / st.tread + 1e-3)) * st.rise / st.n;
          boxGeo('trim', x - 0.025, yb, z - 0.025, x + 0.025, yb + 1.0, z + 0.025, g, 'nsew');
        }
        // sloped top rail as a thin quad strip of short boxes
        const segs = Math.ceil(st.L / 0.5);
        for (let k = 0; k < segs; k++) {
          const sa = (k / segs) * st.L, sb = ((k + 1) / segs) * st.L, sm = (sa + sb) / 2;
          const ym = s.y0 + (sm / st.L) * st.rise + 1.0;
          let x0, x1, z0, z1;
          if (st.axisZ) {
            const xx = (side < 0 ? r[0] : r[2]) + rs.ox;
            x0 = xx - 0.03; x1 = xx + 0.03;
            if (s.up === 'N') { z0 = r[3] - sb; z1 = r[3] - sa; } else { z0 = r[1] + sa; z1 = r[1] + sb; }
          } else {
            const zz = (side < 0 ? r[1] : r[3]) + rs.oz;
            z0 = zz - 0.03; z1 = zz + 0.03;
            if (s.up === 'E') { x0 = r[0] + sa; x1 = r[0] + sb; } else { x0 = r[2] - sb; x1 = r[2] - sa; }
          }
          boxGeo('rail', x0, ym - 0.03, z0, x1, ym + 0.03, z1, g, 'tnsew');
        }
      }
    }

    // ------------------------------------------------------------------ walls
    // Walk every grid line, merge equal consecutive edges into runs.
    const AXES = ['x', 'z'];
    for (const axis of AXES) {
      // axis 'x': horizontal lines z = GZ0 + j*CS between rows j-1 / j, runs along x (i)
      // axis 'z': vertical lines x = GX0 + i*CS between cols i-1 / i, runs along z (j)
      const lines = axis === 'x' ? H : W, len = axis === 'x' ? W : H;
      for (let L = 1; L < lines; L++) {
        let run = null;
        const flush = () => { if (run) emitRun(axis, L, run); run = null; };
        for (let t = 0; t <= len; t++) {
          let key = null, e = null;
          if (t < len) {
            const a = axis === 'x' ? idx(t, L - 1) : idx(L - 1, t);
            const b = axis === 'x' ? idx(t, L) : idx(L, t);
            e = edgeInfo(a, b);
            if (e) key = e.key;
          }
          if (run && key === run.key) { run.t1 = t + 1; run.minFa = Math.min(run.minFa, e.fa); run.minFb = Math.min(run.minFb, e.fb); continue; }
          flush();
          if (key) run = Object.assign({ key, t0: t, t1: t + 1, minFa: e.fa, minFb: e.fb }, e);
        }
      }
    }

    function edgeInfo(a, b) {
      const ra = R(a), rb = R(b);
      if (!ra && !rb) return null;
      const fa = ra ? (ra.isStair ? ra.floor : floorH[a]) : BOTTOM, fb = rb ? (rb.isStair ? rb.floor : floorH[b]) : BOTTOM;
      if (!ra || !rb || ra.gi !== rb.gi) {
        if (ra && rb && doorCell[a] >= 0 && doorCell[a] === doorCell[b]) return { key: 'd' + doorCell[a] + '|' + ra.index + '|' + rb.index, type: 'door', ra, rb, fa, fb, door: M.doors[doorCell[a]] };
        if (ra && rb && winCell[a] >= 0 && winCell[a] === winCell[b]) return { key: 'g' + winCell[a] + '|' + ra.index + '|' + rb.index, type: 'window', ra, rb, fa, fb, win: M.windows[winCell[a]] };
        return { key: 'w|' + (ra ? ra.index : -1) + '|' + (rb ? rb.index : -1), type: 'wall', ra, rb, fa, fb };
      }
      if (ra.isStair || rb.isStair) return null;
      const df = Math.abs(fa - fb) > 0.05, dc = Math.abs(ra.ceil - rb.ceil) > 0.05;
      if (!df && !dc) return null;
      return { key: 's|' + ra.index + '|' + rb.index, type: 'step', ra, rb, fa, fb };
    }

    function emitRun(axis, L, run) {
      const line = (axis === 'x' ? GZ0 : GX0) + L * CS;
      const a0 = (axis === 'x' ? GX0 : GZ0) + run.t0 * CS, a1 = (axis === 'x' ? GX0 : GZ0) + run.t1 * CS;
      const { ra, rb } = run;
      // side A sits at the smaller coordinate -> its face normal points negative.
      const faceA = (y0, y1, key) => ra && wallFace(key || 'w:' + ra.wmat, axis, line, a0, a1, y0, y1, -1, ra.gi, wallAO(run.minFa, ra.ceil));
      const faceB = (y0, y1, key) => rb && wallFace(key || 'w:' + rb.wmat, axis, line, a0, a1, y0, y1, 1, rb.gi, wallAO(run.minFb, rb.ceil));
      const lo = Math.min(ra ? run.minFa : 99, rb ? run.minFb : 99) - 0.5;
      const hi = Math.max(ra ? ra.ceil : -99, rb ? rb.ceil : -99) + 0.5;
      const collider = (y0, y1, flags) => {
        // thin on region|region lines, thick into the void otherwise
        const t0 = ra ? -0.03 : -0.4, t1 = rb ? 0.03 : 0.4;
        if (axis === 'x') addBox(a0, y0, line + t0, a1, y1, line + t1, flags);
        else addBox(line + t0, y0, a0, line + t1, y1, a1, flags);
      };
      if (run.type === 'wall') {
        faceA(run.minFa, ra && ra.ceil);
        faceB(run.minFb, rb && rb.ceil);
        if (ra) skirting(axis, line, a0, a1, run.minFa, -1, ra);
        if (rb) skirting(axis, line, a0, a1, run.minFb, 1, rb);
        collider(lo, hi);
      } else if (run.type === 'door') {
        const base = Math.max(run.minFa, run.minFb);
        const top = run.door.full ? Math.min(ra.ceil, rb.ceil) : base + DOOR_H;
        faceA(top, ra.ceil); faceB(top, rb.ceil);
        collider(top, hi);
        doorFrame(axis, line, a0, a1, base, top, ra, !run.door.full);
      } else if (run.type === 'window') {
        const base = Math.max(run.minFa, run.minFb);
        const sill = base + run.win.sill, top = base + run.win.top;
        faceA(run.minFa, sill); faceB(run.minFb, sill);
        faceA(top, ra.ceil); faceB(top, rb.ceil);
        collider(lo, sill); collider(sill, top, F_GLASS); collider(top, hi);
        windowFrame(axis, line, a0, a1, sill, top, ra);
      } else if (run.type === 'step') {
        // floor step inside a room: riser facing the lower side, rail on top
        if (Math.abs(run.fa - run.fb) > 0.05) {
          const lowA = run.fa < run.fb;
          const high = lowA ? rb : ra, yl = Math.min(run.fa, run.fb), yh = Math.max(run.fa, run.fb);
          wallFace('w:' + (high.riser || 'concrete_wall'), axis, line, a0, a1, yl, yh, lowA ? -1 : 1, high.gi, wallAO(yl, yh + 4));
          if (yh - yl > 0.8) railing(axis, line + (lowA ? 0.07 : -0.07), a0, a1, yh, high.gi);
        }
        if (Math.abs(ra.ceil - rb.ceil) > 0.05) {
          const highA = ra.ceil > rb.ceil, cl = Math.min(ra.ceil, rb.ceil), ch = Math.max(ra.ceil, rb.ceil);
          wallFace('w:' + (highA ? ra : rb).wmat, axis, line, a0, a1, cl, ch, highA ? -1 : 1, ra.gi);
          if (axis === 'x') addBox(a0, cl, line - 0.03, a1, ch, line + 0.03); else addBox(line - 0.03, cl, a0, line + 0.03, ch, a1);
        }
      }
    }
    function wallAO(floor, ceil) {
      return (x, y, z) => {
        const db = y - floor, dt = ceil - y;
        return (1 - 0.5 * (1 - U.smooth(U.clamp(db / 0.9, 0, 1)))) * (1 - 0.35 * (1 - U.smooth(U.clamp(dt / 0.6, 0, 1))));
      };
    }
    // Dark skirting board along wall bases (skipped on tiles/brick).
    function skirting(axis, line, a0, a1, floor, sign, reg) {
      if (reg.isStair || reg.wmat === 'tiles_wall' || reg.wmat === 'brick') return;
      const off = sign * 0.015, h = 0.12;
      if (axis === 'x') boxGeo('skirt', a0, floor, Math.min(line, line + off), a1, floor + h, Math.max(line, line + off), reg.gi, sign < 0 ? 'tn' : 'ts');
      else boxGeo('skirt', Math.min(line, line + off), floor, a0, Math.max(line, line + off), floor + h, a1, reg.gi, sign < 0 ? 'tw' : 'te');
    }
    // Door frame: two jambs + header + floor threshold, giving thin walls depth.
    function doorFrame(axis, line, a0, a1, base, top, reg, header) {
      const g = reg.gi, d = 0.13, w = 0.09;
      const jamb = (a) => {
        if (axis === 'x') boxGeo('frame', a - w / 2, base, line - d, a + w / 2, top, line + d, g, 'nsew');
        else boxGeo('frame', line - d, base, a - w / 2, line + d, top, a + w / 2, g, 'nsew');
      };
      jamb(a0 + w / 2); jamb(a1 - w / 2);
      if (header) {
        if (axis === 'x') boxGeo('frame', a0, top - 0.02, line - d, a1, top + 0.1, line + d, g, 'bns');
        else boxGeo('frame', line - d, top - 0.02, a0, line + d, top + 0.1, a1, g, 'bew');
      }
      if (axis === 'x') boxGeo('threshold', a0 + w, base, line - d, a1 - w, base + 0.012, line + d, g, 't');
      else boxGeo('threshold', line - d, base, a0 + w, line + d, base + 0.012, a1 - w, g, 't');
    }
    function windowFrame(axis, line, a0, a1, sill, top, reg) {
      const g = reg.gi, d = 0.1, w = 0.07;
      const glassKey = 'glass';
      if (axis === 'x') {
        boxGeo('frame', a0, sill - 0.05, line - d - 0.05, a1, sill, line + d + 0.05, g, 'tnsb');
        boxGeo('frame', a0, top, line - d, a1, top + 0.06, line + d, g, 'bns');
        for (let a = a0; a <= a1 + 1e-6; a += Math.max(1.2, (a1 - a0) / Math.round((a1 - a0) / 1.5))) {
          const aa = U.clamp(a, a0 + w / 2, a1 - w / 2);
          boxGeo('frame', aa - w / 2, sill, line - d, aa + w / 2, top, line + d, g, 'nsew');
        }
        quad(glassKey, [a0, sill, line], [a1, sill, line], [a1, top, line], [a0, top, line], [0, 0, 1], uvXY, g, null, 4);
      } else {
        boxGeo('frame', line - d - 0.05, sill - 0.05, a0, line + d + 0.05, sill, a1, g, 'tewb');
        boxGeo('frame', line - d, top, a0, line + d, top + 0.06, a1, g, 'bew');
        for (let a = a0; a <= a1 + 1e-6; a += Math.max(1.2, (a1 - a0) / Math.round((a1 - a0) / 1.5))) {
          const aa = U.clamp(a, a0 + w / 2, a1 - w / 2);
          boxGeo('frame', line - d, sill, aa - w / 2, line + d, top, aa + w / 2, g, 'nsew');
        }
        quad(glassKey, [line, sill, a1], [line, sill, a0], [line, top, a0], [line, top, a1], [1, 0, 0], uvZY, g, null, 4);
      }
    }
    function railing(axis, line, a0, a1, y, g) {
      const n = Math.max(1, Math.round((a1 - a0) / 1.4));
      for (let k = 0; k <= n; k++) {
        const a = a0 + 0.04 + (a1 - a0 - 0.08) * (k / n);
        if (axis === 'x') boxGeo('rail', a - 0.03, y, line - 0.03, a + 0.03, y + 1.05, line + 0.03, g, 'nsew');
        else boxGeo('rail', line - 0.03, y, a - 0.03, line + 0.03, y + 1.05, a + 0.03, g, 'nsew');
      }
      for (const h of [0.5, 1.02]) {
        if (axis === 'x') boxGeo('rail', a0, y + h - 0.03, line - 0.03, a1, y + h + 0.03, line + 0.03, g, 'tbns');
        else boxGeo('rail', line - 0.03, y + h - 0.03, a0, line + 0.03, y + h + 0.03, a1, g, 'tbew');
      }
      if (axis === 'x') boxGeo('hazard', a0, y, line - 0.04, a1, y + 0.1, line + 0.04, g, 'tns');
      else boxGeo('hazard', line - 0.04, y, a0, line + 0.04, y + 0.1, a1, g, 'tew');
      if (axis === 'x') addBox(a0, y, line - 0.05, a1, y + 1.08, line + 0.05, F_RAIL);
      else addBox(line - 0.05, y, a0, line + 0.05, y + 1.08, a1, F_RAIL);
    }

    // --------------------------------------------------------------- skylights
    const shafts = [];
    for (const reg of regs) {
      if (!reg.sky) continue;
      for (const s of reg.sky) {
        const [x0, z0, x1, z1] = s, y = reg.ceil, dep = 0.7, g = reg.gi;
        // light well walls
        wallFace('w:metal_panel', 'x', z0, x0, x1, y, y + dep, 1, g);
        wallFace('w:metal_panel', 'x', z1, x0, x1, y, y + dep, -1, g);
        wallFace('w:metal_panel', 'z', x0, z0, z1, y, y + dep, 1, g);
        wallFace('w:metal_panel', 'z', x1, z0, z1, y, y + dep, -1, g);
        quad('sky', [x0, y + dep, z0], [x1, y + dep, z0], [x1, y + dep, z1], [x0, y + dep, z1], [0, -1, 0], uvXZ, g, null, 8);
        // mullions
        for (let x = x0 + 1.25; x < x1 - 0.2; x += 1.25) boxGeo('frame', x - 0.04, y + dep - 0.12, z0, x + 0.04, y + dep - 0.01, z1, g, 'bew');
        boxGeo('frame', x0, y + dep - 0.12, (z0 + z1) / 2 - 0.04, x1, y + dep - 0.01, (z0 + z1) / 2 + 0.04, g, 'bns');
        addBox(x0, y + dep, z0, x1, y + dep + 0.3, z1);
        // sun shaft: prism from the opening to where the sun lands
        const floorY = reg.floor;
        shafts.push({ x0, z0, x1, z1, top: y + dep, bottom: floorY });
      }
    }

    // ------------------------------------------------------------- light fixtures
    const lights = [];  // {x,y,z,col:[r,g,b],i,r,g}
    for (const reg of regs) {
      const P = LIGHTS[reg.light];
      if (!P || (reg.isStair && reg.inGroup)) continue;
      const rects = reg.isStair ? [reg.st.rect] : reg.rects;
      for (const r of rects) {
        const w = r[2] - r[0], d = r[3] - r[1];
        const nx = Math.max(1, Math.round(w / P.s)), nz = Math.max(1, Math.round(d / P.s));
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const x = r[0] + (a + 0.5) * w / nx, z = r[1] + (b + 0.5) * d / nz;
          const c = cellAt(x, z);
          if (c < 0 || cellR[c] !== reg.index || skyCell[c]) continue;
          // don't put a lamp inside the sky well or right over a solid block
          const y = reg.ceil - 0.02;
          lights.push({ x, y, z, i: P.i, r: P.r, g: reg.gi, c: new THREE.Color(P.c), fx: P.fx, along: w >= d ? 'x' : 'z', reg });
        }
      }
    }
    // Emergency + accent lights placed by hand (colour pops).
    const accents = [
      [61.8, -1.2, 44.5, 0xff3322, 1.3, 6], [99.5, -1.2, 44.5, 0xff3322, 1.2, 6], [2, -2.2, 37, 0xff3322, 1.1, 6],
      [36, -0.8, 60.5, 0xff5a1a, 1.0, 5], [89.5, 2.0, 44.7, 0x55ffb0, 1.2, 9], [74.2, 3.0, 19, 0x66d8ff, 1.0, 6],
      [101.2, 1.6, 19.2, 0xffa040, 1.1, 8], [6.2, -1.5, 63.5, 0x80ffd0, 0.6, 5]
    ];
    for (const a of accents) {
      const r = R(cellAt(a[0], a[2]));
      if (!r) continue;
      lights.push({ x: a[0], y: a[1], z: a[2], i: a[4], r: a[5], g: r.gi, c: new THREE.Color(a[3]), fx: 'beacon', reg: r });
    }
    // Fixture meshes (emissive).
    for (const L of lights) {
      const g = L.g, y = L.reg.ceil;
      if (L.fx === 'panel') {
        const sx = L.along === 'x' ? 1.2 : 0.6, sz = L.along === 'x' ? 0.6 : 1.2;
        boxGeo('lamp_frame', L.x - sx / 2 - 0.04, y - 0.05, L.z - sz / 2 - 0.04, L.x + sx / 2 + 0.04, y, L.z + sz / 2 + 0.04, g, 'bnsew');
        quad('lamp', [L.x - sx / 2, y - 0.055, L.z - sz / 2], [L.x + sx / 2, y - 0.055, L.z - sz / 2], [L.x + sx / 2, y - 0.055, L.z + sz / 2], [L.x - sx / 2, y - 0.055, L.z + sz / 2], [0, -1, 0], uvXZ, g, null, 4);
      } else if (L.fx === 'strip') {
        const sx = L.along === 'x' ? 1.6 : 0.16, sz = L.along === 'x' ? 0.16 : 1.6;
        boxGeo('lamp_frame', L.x - sx / 2 - 0.03, y - 0.09, L.z - sz / 2 - 0.03, L.x + sx / 2 + 0.03, y, L.z + sz / 2 + 0.03, g, 'nsew');
        boxGeo('lamp', L.x - sx / 2, y - 0.1, L.z - sz / 2, L.x + sx / 2, y - 0.03, L.z + sz / 2, g, 'b');
      } else if (L.fx === 'highbay') {
        const drop = Math.min(2.2, (y - L.reg.floor) * 0.25);
        boxGeo('lamp_frame', L.x - 0.02, y - drop, L.z - 0.02, L.x + 0.02, y, L.z + 0.02, g, 'nsew');
        JB.Props.highbay(propAPI, L.x, y - drop, L.z, g);
        L.y = y - drop - 0.35;
      } else if (L.fx === 'cage') {
        boxGeo('lamp_frame', L.x - 0.18, y - 0.16, L.z - 0.12, L.x + 0.18, y, L.z + 0.12, g, 'nsew');
        boxGeo('lamp_warm', L.x - 0.13, y - 0.2, L.z - 0.08, L.x + 0.13, y - 0.15, L.z + 0.08, g, 'bnsew');
      }
    }

    // ------------------------------------------------------------------ baking
    const lightsByGroup = {};
    for (const L of lights) (lightsByGroup[L.g] || (lightsByGroup[L.g] = [])).push(L);
    const bounceByGroup = {};
    for (const reg of regs) {
      const P = LIGHTS[reg.light];
      if (!P) continue;
      const c = new THREE.Color(P.c).multiplyScalar(P.bounce * (reg.sky ? 1.6 : 1));
      if (!bounceByGroup[reg.gi]) bounceByGroup[reg.gi] = c; else bounceByGroup[reg.gi].lerp(c, 0.3);
    }
    const tmpC = [0, 0, 0];
    function lightAt(x, y, z, nx, ny, nz, g, out) {
      const bc = bounceByGroup[g];
      let r = bc ? bc.r : 0.05, gg = bc ? bc.g : 0.05, b = bc ? bc.b : 0.05;
      // upward-facing surfaces catch more bounce than ceilings
      const hemi = 0.75 + 0.25 * ny;
      r *= hemi; gg *= hemi; b *= hemi;
      const list = lightsByGroup[g];
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const L = list[k];
          const dx = L.x - x, dy = L.y - y, dz = L.z - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > L.r * L.r) continue;
          const d = Math.sqrt(d2) + 1e-4;
          let lam = (dx * nx + dy * ny + dz * nz) / d;
          if (nx === 0 && ny === 0 && nz === 0) lam = 0.6;
          lam = (lam + 0.15) / 1.15;
          if (lam <= 0) continue;
          const f = 1 - d2 / (L.r * L.r);
          const lobe = L.fx === 'beacon' ? 1 : 0.3 + 0.7 * U.clamp(dy / d, 0, 1);
          const att = (f * f) / (1 + 0.35 * d2) * 4.0;
          const k2 = L.i * lam * att * lobe;
          r += L.c.r * k2; gg += L.c.g * k2; b += L.c.b * k2;
        }
      }
      out[0] = r; out[1] = gg; out[2] = b;
      return out;
    }

    // ------------------------------------------------------------------ materials
    const textures = {};
    const tex = (name) => textures[name] || (textures[name] = JB.Tex.make(name, texSize));
    const mats = {};
    const bakedPatch = (m) => {
      m.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute vec4 bake;\nvarying vec4 vBake;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBake = bake;');
        shader.fragmentShader = 'varying vec4 vBake;\n' + shader.fragmentShader
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n\tirradiance += vBake.rgb * PI;\n\tfloat bakeLum = dot(vBake.rgb, vec3(0.3, 0.59, 0.11));\n\tfloat envK = clamp(bakeLum * 1.6 + 0.06, 0.0, 1.2);\n\tradiance *= envK; iblIrradiance *= envK;')
          .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= vBake.a;\n\treflectedLight.indirectSpecular *= vBake.a;\n\treflectedLight.directDiffuse *= mix(1.0, vBake.a, 0.35);');
      };
      m.customProgramCacheKey = () => 'jb-baked';
      return m;
    };
    function std(params, texName, repeat) {
      const p = Object.assign({}, params);
      if (texName) {
        let t = tex(texName);
        if (repeat && repeat !== 1) {
          const cl = (tx) => { const c = tx.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
          t = { map: cl(t.map), normalMap: cl(t.normalMap), roughnessMap: cl(t.roughnessMap) };
        }
        const mp = MATP[texName] || { rough: 0.8, metal: 0, ns: 0.6 };
        p.map = t.map; p.normalMap = t.normalMap; p.roughnessMap = t.roughnessMap;
        if (p.roughness === undefined) p.roughness = mp.rough;
        if (p.metalness === undefined) p.metalness = mp.metal;
        p.normalScale = new THREE.Vector2(mp.ns, mp.ns);
      }
      return bakedPatch(new THREE.MeshStandardMaterial(p));
    }
    const PROP_MATS = JB.Props.materials();
    function matFor(key) {
      if (mats[key]) return mats[key];
      let m;
      const [kind, name] = key.split(':');
      if (kind === 'f') m = std(name === 'grate' ? { alphaTest: 0.5 } : {}, name, name === 'diamond_plate' ? 2 : 1);
      else if (kind === 'w') m = std({}, name);
      else if (key === 'ceil') m = std({ color: 0x9a9da3 }, 'ceiling');
      else if (key === 'stair') m = std({ color: 0x9a9c9e }, 'diamond_plate', 2);
      else if (key === 'trim' || key === 'frame' || key === 'lamp_frame') m = std({ color: 0x2e3238, roughness: 0.45, metalness: 0.8 });
      else if (key === 'trim_y') m = std({ color: 0xe0b020, roughness: 0.6, metalness: 0.2 });
      else if (key === 'rail') m = std({ color: 0xd9a514, roughness: 0.45, metalness: 0.5 });
      else if (key === 'hazard') m = std({}, 'hazard');
      else if (key === 'skirt') m = std({ color: 0x1b1d20, roughness: 0.7, metalness: 0.1 });
      else if (key === 'threshold') m = std({ color: 0x8d9298, roughness: 0.35, metalness: 0.9 }, 'diamond_plate');
      else if (key === 'glass') {
        m = new THREE.MeshStandardMaterial({ color: 0xa8d8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
        m.envMapIntensity = 1.4;
      } else if (key === 'sky') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcecff).multiplyScalar(2.2), toneMapped: true });
      else if (key === 'lamp') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.6) });
      else if (key === 'lamp_warm') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb46a).multiplyScalar(2.6) });
      else if (PROP_MATS[key]) {
        const d = PROP_MATS[key];
        if (d.basic) m = new THREE.MeshBasicMaterial(Object.assign({}, d.params));
        else m = std(d.params, d.tex);
      } else m = std({ color: 0xff00ff });
      if (m.isMeshBasicMaterial) m.userData.noBake = true;
      mats[key] = m;
      return m;
    }

    // ------------------------------------------------------------------ meshes
    const group = new THREE.Group();
    group.name = 'level';
    const lc = [0, 0, 0], lc2 = [0, 0, 0];
    const floorAt = (x, z) => { const c = cellAt(x, z); return c >= 0 && cellR[c] >= 0 ? floorH[c] : null; };
    let vertsTotal = 0;
    for (const key in buckets) {
      const b = buckets[key];
      if (!b.idx.length) continue;
      const mat = matFor(key);
      const geo = new THREE.BufferGeometry();
      const n = b.count;
      vertsTotal += n;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (!mat.userData.noBake) {
        const bake = new Float32Array(n * 4);
        const isCeil = key === 'ceil';
        for (let v = 0; v < n; v++) {
          lightAt(b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2], b.nor[v * 3], b.nor[v * 3 + 1], b.nor[v * 3 + 2], b.grp[v], lc);
          if (isCeil || b.nor[v * 3 + 1] < -0.7) {
            // light bounced off the floor below
            const fy = floorAt(b.pos[v * 3], b.pos[v * 3 + 2]);
            if (fy !== null) {
              lightAt(b.pos[v * 3], fy, b.pos[v * 3 + 2], 0, 1, 0, b.grp[v], lc2);
              lc[0] += lc2[0] * 0.32; lc[1] += lc2[1] * 0.3; lc[2] += lc2[2] * 0.28;
            }
          }
          bake[v * 4] = lc[0]; bake[v * 4 + 1] = lc[1]; bake[v * 4 + 2] = lc[2]; bake[v * 4 + 3] = b.ao[v];
        }
        geo.setAttribute('bake', new THREE.BufferAttribute(bake, 4));
      }
      geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = key;
      const isEmissive = !!mat.userData.noBake;
      mesh.castShadow = !isEmissive && key !== 'glass' && !key.startsWith('f:') && key !== 'threshold';
      mesh.receiveShadow = !isEmissive && key !== 'ceil' && key !== 'glass';
      if (key === 'glass') mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }

    // Sun shafts (additive volumetric fakes).
    if (shafts.length) group.add(buildShafts(shafts));

    // ------------------------------------------------------------- queries
    const regionAt = (x, z) => R(cellAt(x, z));
    // Light probe for dynamic objects (cats, pickups, view-model).
    const probeOut = [0, 0, 0];
    function sampleLight(x, y, z, out) {
      const r = regionAt(x, z);
      if (!r) { out.setRGB(0.15, 0.15, 0.15); return out; }
      lightAt(x, y + 0.9, z, 0, 0, 0, r.gi, probeOut);
      out.setRGB(probeOut[0] * 0.8, probeOut[1] * 0.8, probeOut[2] * 0.8);
      return out;
    }
    function inSun(x, y, z) {
      // true if the ray toward the sun reaches a skylight opening
      for (const s of shafts) {
        if (y > s.top) continue;
        const t = (s.top - y) / -SUN_DIR.y;
        const px = x - SUN_DIR.x * t, pz = z - SUN_DIR.z * t;
        if (px > s.x0 && px < s.x1 && pz > s.z0 && pz < s.z1) return true;
      }
      return false;
    }

    return {
      group, boxes, lights, regions: regs, stairs, decor,
      grid: { W, H, CS, GX0, GZ0, cellR, floorH, solid, edgeFlag, doorCell, idx, cellAt },
      regionAt, floorAt, sampleLight, inSun, SUN_DIR,
      bounds: { x0: -1, z0: 0, x1: 112, z1: 82, y0: -5, y1: 8 },
      stats: { verts: vertsTotal, boxes: boxes.length, lights: lights.length, buckets: Object.keys(buckets).length },
      F_GLASS, F_RAIL
    };
  }

  // Additive light shafts under skylights, slanted along the sun.
  function buildShafts(shafts) {
    const pos = [], uv = [], ind = [];
    const sd = SUN_DIR;
    for (const s of shafts) {
      const h = s.top - s.bottom;
      const t = h / -sd.y;
      const ox = sd.x * t, oz = sd.z * t;
      const top = [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]];
      const base = pos.length / 3;
      for (const [x, z] of top) { pos.push(x, s.top, z); uv.push(0, 1); }
      for (const [x, z] of top) { pos.push(x + ox, s.bottom, z + oz); uv.push(0, 0); }
      // four side faces (double-sided material)
      for (let k = 0; k < 4; k++) {
        const a = base + k, b = base + ((k + 1) % 4), c = b + 4, d = a + 4;
        ind.push(a, b, c, a, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xfff0d0) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;\n' +
        'void main(){ float n = 0.65 + 0.35 * sin(vW.x * 1.7 + vW.z * 1.3 + uTime * 0.4) * sin(vW.y * 0.9 - uTime * 0.25);\n' +
        ' float a = smoothstep(0.0, 0.35, vUv.y) * (0.55 + 0.45 * vUv.y) * n * 0.085; gl_FragColor = vec4(uColor * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'shafts';
    m.renderOrder = 3;
    m.userData.shaft = mat;
    return m;
  }

  JB.Level = { build, SUN_DIR, LIGHTS };
})();
