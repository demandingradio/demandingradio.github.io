// Jimbog — level builder for open-air, multi-storey maps.
//
// The Facility uses level.js: one floor per grid column, everything indoors.
// This builder stacks "spans" in each 0.5 m grid column instead: a span is a
// region's air from its floor to its ceiling (outdoor air reaches the sky).
// Upstairs rooms, building roofs, a pergola's walkway and its roof are all
// just spans in the same column. Walls are generated wherever the air on one
// side of a grid line meets solid (or a different room) on the other side, so
// building façades, slab edges, roof parapets and step risers all fall out of
// one rule. Doors and windows open holes in those walls.
//
// Output matches level.js (meshes, collision boxes, baked light, grid for the
// AI), with the grid extended to L slots per column.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  const CS = 0.5;          // grid cell (m)
  const BOTTOM = -9;       // floors are solid down to here
  const INF = 1000;        // "open sky"
  const DOOR_H = 2.3;

  const LIGHTS = Object.assign({}, JB.Level.LIGHTS, {
    outdoor:  { c: 0xbcd6f2, i: 0, r: 0, s: 99, fx: 'none', bounce: 0.46 },
    library:  { c: 0xfff1dc, i: 1.0, r: 8, s: 4, fx: 'panel', bounce: 0.11 },
    gym:      { c: 0xf4f6ff, i: 1.7, r: 13, s: 6, fx: 'highbay', bounce: 0.12 },
    shed:     { c: 0xffd9a8, i: 0.8, r: 6, s: 4, fx: 'cage', bounce: 0.07 },
    hall:     { c: 0xfff0dc, i: 1.4, r: 11, s: 5, fx: 'panel', bounce: 0.12 }
  });

  const MATP = {
    concrete_floor: { rough: 0.9, metal: 0.0, ns: 0.6 }, concrete_wall: { rough: 0.95, metal: 0.0, ns: 0.8 },
    metal_panel: { rough: 0.7, metal: 0.55, ns: 0.7 }, diamond_plate: { rough: 0.65, metal: 0.7, ns: 1.0 },
    tiles_wall: { rough: 0.55, metal: 0.0, ns: 0.6 }, tiles_floor: { rough: 0.8, metal: 0.0, ns: 0.6 },
    lab_white: { rough: 0.5, metal: 0.0, ns: 0.5 }, ceiling: { rough: 0.9, metal: 0.3, ns: 0.8 },
    brick: { rough: 0.95, metal: 0.0, ns: 1.0 }, hazard: { rough: 0.8, metal: 0.2, ns: 0.6 },
    grass: { rough: 0.97, metal: 0.0, ns: 0.8 }, paving: { rough: 0.85, metal: 0.0, ns: 0.7 },
    asphalt: { rough: 0.92, metal: 0.0, ns: 0.8 }, court_blue: { rough: 0.75, metal: 0.0, ns: 0.4 },
    court_green: { rough: 0.75, metal: 0.0, ns: 0.4 }, court_grey: { rough: 0.8, metal: 0.0, ns: 0.4 },
    brick_tan: { rough: 0.92, metal: 0.0, ns: 1.0 }, brick_dark: { rough: 0.92, metal: 0.0, ns: 1.0 },
    render_cream: { rough: 0.88, metal: 0.0, ns: 0.5 }, cladding_white: { rough: 0.45, metal: 0.25, ns: 0.6 },
    cladding_bluegrey: { rough: 0.45, metal: 0.25, ns: 0.6 }, panel_green: { rough: 0.5, metal: 0.1, ns: 0.5 },
    roof_membrane: { rough: 0.9, metal: 0.0, ns: 0.8 }, roof_metal: { rough: 0.4, metal: 0.65, ns: 1.0 },
    carpet_grey: { rough: 0.98, metal: 0.0, ns: 0.6 }, lino: { rough: 0.55, metal: 0.0, ns: 0.4 },
    timber_floor: { rough: 0.38, metal: 0.0, ns: 0.5 }, timber: { rough: 0.85, metal: 0.0, ns: 0.8 },
    soil: { rough: 1.0, metal: 0.0, ns: 1.0 }, gravel: { rough: 0.95, metal: 0.0, ns: 1.0 }
  };

  class Bucket {
    constructor(key) { this.key = key; this.pos = []; this.nor = []; this.uv = []; this.grp = []; this.ao = []; this.idx = []; }
    get count() { return this.pos.length / 3; }
    vert(x, y, z, nx, ny, nz, u, v, g, ao) {
      this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.grp.push(g); this.ao.push(ao);
      return this.pos.length / 3 - 1;
    }
  }

  // interval helpers: lists of [y0, y1]
  function subtract(iv, cuts) {
    let out = [iv];
    for (const c of cuts) {
      const nx = [];
      for (const s of out) {
        if (c[1] <= s[0] + 1e-3 || c[0] >= s[1] - 1e-3) { nx.push(s); continue; }
        if (c[0] > s[0] + 1e-3) nx.push([s[0], c[0]]);
        if (c[1] < s[1] - 1e-3) nx.push([c[1], s[1]]);
      }
      out = nx;
    }
    return out.filter((s) => s[1] - s[0] > 0.01);
  }
  function union(list) {
    const s = list.filter((v) => v[1] - v[0] > 0.005).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const v of s) {
      const l = out[out.length - 1];
      if (l && v[0] <= l[1] + 1e-3) l[1] = Math.max(l[1], v[1]); else out.push([v[0], v[1]]);
    }
    return out;
  }

  function build(opts) {
    const map = opts.map, M = map.data;
    const quality = opts.quality || 'medium';
    const texSize = quality === 'low' ? 256 : 512;
    const GX0 = M.grid.x0, GZ0 = M.grid.z0;
    const W = Math.round((M.grid.x1 - GX0) / CS), H = Math.round((M.grid.z1 - GZ0) / CS), N = W * H;
    const SUN_DIR = new THREE.Vector3().fromArray(M.sunDir || [0.34, -1, 0.24]).normalize();
    const ci = (x) => Math.round((x - GX0) / CS);
    const cj = (z) => Math.round((z - GZ0) / CS);
    const idx = (i, j) => j * W + i;
    const cellAt = (x, z) => {
      const i = Math.floor((x - GX0) / CS), j = Math.floor((z - GZ0) / CS);
      if (i < 0 || j < 0 || i >= W || j >= H) return -1;
      return idx(i, j);
    };
    const eachCell = (r, fn) => {
      const i0 = Math.max(0, ci(r[0])), i1 = Math.min(W, ci(r[2])), j0 = Math.max(0, cj(r[1])), j1 = Math.min(H, cj(r[3]));
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(idx(i, j), i, j);
    };

    // ---------------------------------------------------------------- regions
    const regs = [];
    const groupIndex = {};
    const groupOf = (name) => (name in groupIndex ? groupIndex[name] : (groupIndex[name] = Object.keys(groupIndex).length));
    const addReg = (r, extra) => {
      const reg = Object.assign({ floor: 0, ceil: INF, light: 'outdoor', fmat: 'grass', wmat: 'concrete_wall' }, r, extra, { index: regs.length });
      if (reg.ceil === undefined || reg.ceil === null || reg.ceil === Infinity) reg.ceil = INF;
      reg.gi = groupOf(reg.group);
      regs.push(reg);
      return reg;
    };
    const blds = (M.buildings || []).map((b, k) => Object.assign({ parapet: 0.45, ext: 'brick_tan', roofMat: 'roof_membrane', index: k }, b));
    const bldById = {};
    for (const b of blds) bldById[b.id] = b;

    // per-column span lists while painting: arrays of region indices
    const cols = new Array(N);
    for (let c = 0; c < N; c++) cols[c] = [];
    const overlaps = (a, b) => a.floor < b.ceil - 1e-3 && b.floor < a.ceil - 1e-3;
    const paint = (reg, rect, keep) => eachCell(rect, (c) => {
      const L = cols[c].filter((k) => keep && keep(regs[k]) ? true : !overlaps(regs[k], reg));
      L.push(reg.index);
      cols[c] = L;
    });
    const bldgCell = new Int16Array(N).fill(-1);

    // 1) ground (outdoor group), painted in order
    for (const g of M.ground || []) {
      const reg = addReg(g, { group: 'out', outdoor: true, light: 'outdoor' });
      for (const r of reg.rects) paint(reg, r);
    }
    // 2) whole-column solids
    for (const v of M.voids || []) eachCell(v, (c) => { cols[c] = []; });
    // 3) building footprints clear the outdoor ground inside them
    for (const b of blds) for (const r of b.rects) eachCell(r, (c) => {
      bldgCell[c] = b.index;
      cols[c] = cols[c].filter((k) => !regs[k].outdoor);
    });
    // 4) rooms
    for (const rm of M.rooms || []) {
      const b = rm.bldg ? bldById[rm.bldg] : null;
      const reg = addReg(rm, { group: rm.group || rm.id, outdoor: false, bldg: b ? b.index : -1 });
      if (!reg.name && b) reg.name = b.name;
      for (const r of reg.rects) paint(reg, r);
    }
    // 5) stairs: own region, per-cell step heights
    const stairs = [];
    const stepH = new Map();   // "regIndex|cell" -> floor height
    for (const s of M.stairs || []) {
      const r = s.rect;
      const b = s.bldg ? bldById[s.bldg] : null;
      const reg = addReg({ id: s.id, group: s.group, name: s.name || (b && b.name) || 'Stairs', rects: [r], floor: Math.min(s.y0, s.y1), ceil: s.ceil !== undefined ? s.ceil : Math.max(s.y0, s.y1) + 3.2, fmat: s.fmat || 'concrete_floor', wmat: s.wmat || 'concrete_wall', light: s.light || (s.outdoor ? 'outdoor' : 'stair'), riser: s.riser || 'concrete_floor', ceilMat: s.ceilMat }, { isStair: true, outdoor: !!s.outdoor, bldg: b ? b.index : -1 });
      const axisZ = s.up === 'N' || s.up === 'S';
      const L = axisZ ? r[3] - r[1] : r[2] - r[0];
      const rise = s.y1 - s.y0;
      const n = Math.max(1, Math.round(Math.abs(rise) / 0.18));
      const st = { def: s, reg, axisZ, L, rise, n, tread: L / n, rect: r };
      reg.st = st;
      stairs.push(st);
      paint(reg, r);
      eachCell(r, (c, i, j) => stepH.set(reg.index + '|' + c, stairHeightAt(st, GX0 + (i + 0.5) * CS, GZ0 + (j + 0.5) * CS)));
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
    // 6) roofs: open sky above each building
    for (const b of blds) {
      const reg = addReg({ id: 'roof:' + b.id, name: (b.name || b.id) + ' Roof', rects: b.rects, floor: b.roof, ceil: INF, fmat: b.roofMat, riser: b.ext, parapet: b.parapet }, { group: 'out', outdoor: true, roof: true, bldg: b.index, light: 'outdoor' });
      for (const r of b.rects) paint(reg, r);
    }

    // ---------------------------------------------------------------- slots
    let L = 1;
    for (let c = 0; c < N; c++) { cols[c].sort((a, b) => regs[a].floor - regs[b].floor); L = Math.max(L, cols[c].length); }
    const NN = L * N;
    const cellR = new Int16Array(NN).fill(-1);
    const floorH = new Float32Array(NN).fill(BOTTOM);   // per cell (stairs: step height)
    const wallF = new Float32Array(NN).fill(BOTTOM);    // region floor (stairs: bottom)
    const ceilH = new Float32Array(NN).fill(BOTTOM);
    const solid = new Uint8Array(NN);
    for (let c = 0; c < N; c++) {
      const list = cols[c];
      for (let s = 0; s < list.length; s++) {
        const reg = regs[list[s]], C = s * N + c;
        cellR[C] = reg.index; wallF[C] = reg.floor; ceilH[C] = reg.ceil;
        floorH[C] = reg.isStair ? stepH.get(reg.index + '|' + c) : reg.floor;
      }
    }
    const R = (C) => (C >= 0 && cellR[C] >= 0 ? regs[cellR[C]] : null);
    const spans = (c) => {
      const out = [];
      if (c < 0) return out;
      for (let s = 0; s < L; s++) { const C = s * N + c; if (cellR[C] < 0) break; out.push(C); }
      return out;
    };
    const slotAt = (c, y) => {
      // the span whose floor is the highest one at or below y + 0.6
      let best = -1, bf = -Infinity;
      for (let s = 0; s < L; s++) {
        const C = s * N + c;
        if (cellR[C] < 0) break;
        if (y === undefined) return C;
        if (floorH[C] <= y + 0.6 && floorH[C] > bf) { bf = floorH[C]; best = C; }
      }
      return best >= 0 ? best : (cellR[c] >= 0 ? c : -1);
    };

    // doors / windows indexed by cell
    const doors = (M.doors || []).map((d) => Object.assign({ y: 0, full: false }, d));
    const wins = (M.windows || []).map((w) => Object.assign({ y: 0 }, w));
    const doorsAt = new Map(), winsAt = new Map();
    doors.forEach((d, k) => eachCell(d.r, (c) => { if (!doorsAt.has(c)) doorsAt.set(c, []); doorsAt.get(c).push(k); }));
    wins.forEach((w, k) => eachCell(w.r, (c) => { if (!winsAt.has(c)) winsAt.set(c, []); winsAt.get(c).push(k); }));
    const common = (m, a, b) => { const la = m.get(a), lb = m.get(b); if (!la || !lb) return null; const r = la.filter((k) => lb.includes(k)); return r.length ? r : null; };
    // nav / AO compatibility: one cell array for "a door joins these two cells"
    const doorCell = new Int16Array(NN).fill(-1);

    // ---------------------------------------------------------------- output
    const buckets = {};
    const bucket = (key) => buckets[key] || (buckets[key] = new Bucket(key));
    const boxes = [];
    const addBox = (x0, y0, z0, x1, y1, z1, flags) => {
      boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], flags: flags || 0 });
    };
    const F_GLASS = 1, F_RAIL = 2;
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
    function wallFace(key, axis, line, a0, a1, y0, y1, sign, g, aof, seg) {
      if (y1 - y0 < 0.01 || a1 - a0 < 0.01) return;
      const sg = seg || 1;
      if (axis === 'x') {
        const n = [0, 0, sign];
        if (sign > 0) quad(key, [a0, y0, line], [a1, y0, line], [a1, y1, line], [a0, y1, line], n, uvXY, g, aof, sg);
        else quad(key, [a1, y0, line], [a0, y0, line], [a0, y1, line], [a1, y1, line], n, uvXY, g, aof, sg);
      } else {
        const n = [sign, 0, 0];
        if (sign > 0) quad(key, [line, y0, a1], [line, y0, a0], [line, y1, a0], [line, y1, a1], n, uvZY, g, aof, sg);
        else quad(key, [line, y0, a0], [line, y0, a1], [line, y1, a1], [line, y1, a0], n, uvZY, g, aof, sg);
      }
    }
    function boxGeo(key, x0, y0, z0, x1, y1, z1, g, faces, aoBase) {
      const ao = () => (aoBase === undefined ? 1 : aoBase);
      const f = faces || 'tbnsew';
      if (f.includes('t')) quad(key, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uvXZ, g, ao, 2);
      if (f.includes('b')) quad(key, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uvXZ, g, ao, 2);
      if (f.includes('s')) wallFace(key, 'x', z1, x0, x1, y0, y1, 1, g, ao, 2);
      if (f.includes('n')) wallFace(key, 'x', z0, x0, x1, y0, y1, -1, g, ao, 2);
      if (f.includes('e')) wallFace(key, 'z', x1, z0, z1, y0, y1, 1, g, ao, 2);
      if (f.includes('w')) wallFace(key, 'z', x0, z0, z1, y0, y1, -1, g, ao, 2);
    }
    const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
    function addGeo(key, geo, mtx, g, aof) {
      const b = bucket(key);
      const p = geo.attributes.position, nr = geo.attributes.normal, uv = geo.attributes.uv;
      _nm.getNormalMatrix(mtx);
      const base = b.count;
      for (let k = 0; k < p.count; k++) {
        _v.fromBufferAttribute(p, k).applyMatrix4(mtx);
        if (nr) _n.fromBufferAttribute(nr, k).applyMatrix3(_nm).normalize(); else _n.set(0, 1, 0);
        b.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0, g, aof ? aof(_v.x, _v.y, _v.z) : 1);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) b.idx.push(base + geo.index.getX(k));
      else for (let k = 0; k < p.count; k++) b.idx.push(base + k);
    }

    // ------------------------------------------------------------ connectivity
    // Can air in span A (column a) reach span B (column b) across their shared edge?
    function joined(A, B) {
      const ra = regs[cellR[A]], rb = regs[cellR[B]];
      if (ra.gi === rb.gi) return true;
      const ds = common(doorsAt, A % N, B % N);
      if (!ds) return false;
      const base = Math.max(floorH[A], floorH[B]);
      return ds.some((k) => doors[k].y === null || Math.abs(doors[k].y - base) < 0.6);
    }
    // span in column c2 whose floor is within 0.5 m of floor f (for walking)
    function stepTarget(c2, f) {
      let best = -1, bd = 0.501;
      for (let s = 0; s < L; s++) {
        const C = s * N + c2;
        if (cellR[C] < 0) break;
        const d = Math.abs(floorH[C] - f);
        if (d < bd) { bd = d; best = C; }
      }
      return best;
    }
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const nbTab = new Int32Array(NN * 8).fill(-1);
    for (let C = 0; C < NN; C++) {
      if (cellR[C] < 0) continue;
      const c = C % N, i = c % W, j = Math.floor(c / W);
      for (let d = 0; d < 8; d++) {
        const i2 = i + DIRS[d][0], j2 = j + DIRS[d][1];
        if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= H) continue;
        nbTab[C * 8 + d] = stepTarget(idx(i2, j2), floorH[C]);
      }
    }
    const neighbor = (C, d) => nbTab[C * 8 + d];
    function passable(A, B) {
      if (Math.abs(floorH[A] - floorH[B]) > 0.5) return false;
      const head = Math.min(ceilH[A], ceilH[B]) - Math.max(floorH[A], floorH[B]);
      if (head < 1.25) return false;
      return joined(A, B);
    }
    for (let C = 0; C < NN; C++) {
      if (cellR[C] < 0) continue;
      for (let d = 0; d < 4; d++) {
        const B = nbTab[C * 8 + d];
        if (B >= 0 && regs[cellR[C]].gi !== regs[cellR[B]].gi && joined(C, B)) { doorCell[C] = 1; doorCell[B] = 1; }
      }
    }

    // ------------------------------------------------------------ edge flags (AO)
    // bit 1=N 2=S 4=W 8=E : this span is closed off on that side at floor level
    const edgeFlag = new Uint8Array(NN);
    for (let C = 0; C < NN; C++) {
      if (cellR[C] < 0) continue;
      const c = C % N, i = c % W, j = Math.floor(c / W);
      let f = 0;
      const test = (bit, i2, j2) => {
        if (i2 < 0 || j2 < 0 || i2 >= W || j2 >= H) { f |= bit; return; }
        const c2 = idx(i2, j2), fl = floorH[C];
        // open if some span over there is joined and covers [fl + 0.05, fl + 1.2]
        for (const B of spans(c2)) {
          if (floorH[B] - fl > 0.3) continue;
          if (ceilH[B] < fl + 1.2 || wallF[B] > fl + 0.05 + (regs[cellR[B]].isStair ? 9 : 0)) continue;
          if (regs[cellR[B]].gi === regs[cellR[C]].gi || joined(C, B)) return;
        }
        f |= bit;
      };
      test(1, i, j - 1); test(2, i, j + 1); test(4, i - 1, j); test(8, i + 1, j);
      edgeFlag[C] = f;
    }

    // ------------------------------------------------------------ props
    const propAPI = {
      bucket, quad, boxGeo, wallFace, addBox, addGeo, uvXZ, uvXY, uvZY, hintY: undefined,
      floorAt: (x, z) => { const c = cellAt(x, z); if (c < 0) return 0; const C = slotAt(c, propAPI.hintY); return C >= 0 ? floorH[C] : 0; },
      ceilAt: (x, z) => { const c = cellAt(x, z); if (c < 0) return 3; const C = slotAt(c, propAPI.hintY); return C >= 0 ? Math.min(ceilH[C], 60) : 3; },
      groupAt: (x, z) => { const c = cellAt(x, z); if (c < 0) return 0; const C = slotAt(c, propAPI.hintY); return C >= 0 ? regs[cellR[C]].gi : 0; },
      regionAt: (x, z) => { const c = cellAt(x, z); if (c < 0) return null; return R(slotAt(c, propAPI.hintY)); },
      markSolid: (x0, z0, x1, z1) => {
        const i0 = Math.floor((x0 - GX0) / CS + 0.3), i1 = Math.ceil((x1 - GX0) / CS - 0.3);
        const j0 = Math.floor((z0 - GZ0) / CS + 0.3), j1 = Math.ceil((z1 - GZ0) / CS - 0.3);
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const C = slotAt(idx(i, j), propAPI.hintY);
          if (C >= 0) solid[C] = 1;
        }
      },
      F_GLASS, F_RAIL
    };
    const decor = JB.Props.build(propAPI, M.props || []);

    function aoFloor(x, z, C0, strength) {
      const s0 = Math.floor(C0 / N), fl = floorH[C0];
      const i0 = Math.floor((x - GX0) / CS), j0 = Math.floor((z - GZ0) / CS);
      let d = 9;
      for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const c = idx(i, j);
        const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS;
        // the span at this height in that column
        let C = -1;
        for (let s = 0; s < L; s++) { const K = s * N + c; if (cellR[K] < 0) break; if (Math.abs(floorH[K] - fl) < 0.3) { C = K; break; } }
        if (C < 0 || solid[C]) {
          const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
          d = Math.min(d, Math.hypot(dx, dz) + (C >= 0 ? 0.08 : 0));
          continue;
        }
        const f = edgeFlag[C];
        if (!f) continue;
        if (f & 1) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), z - z0));
        if (f & 2) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), z - z1));
        if (f & 4) d = Math.min(d, Math.hypot(x - x0, Math.max(z0 - z, 0, z - z1)));
        if (f & 8) d = Math.min(d, Math.hypot(x - x1, Math.max(z0 - z, 0, z - z1)));
      }
      void s0;
      const t = U.clamp(d / 1.1, 0, 1);
      return 1 - strength * (1 - U.smooth(t));
    }

    // ------------------------------------------------------------ floors / ceilings
    // Cells near a wall get their own quads (smooth AO); open ground merges into big quads.
    const nearEdge = new Uint8Array(NN);
    for (let C = 0; C < NN; C++) {
      if (cellR[C] < 0) continue;
      if (edgeFlag[C] || solid[C]) { nearEdge[C] = 1; continue; }
    }
    // dilate by 2 cells within the same slot
    for (let pass = 0; pass < 2; pass++) {
      const src = nearEdge.slice();
      for (let C = 0; C < NN; C++) {
        if (src[C] || cellR[C] < 0) continue;
        for (let d = 0; d < 4; d++) { const B = nbTab[C * 8 + d]; if (B >= 0 && src[B]) { nearEdge[C] = 1; break; } }
        if (!nearEdge[C]) for (let d = 0; d < 4; d++) { if (nbTab[C * 8 + d] < 0) { nearEdge[C] = 1; break; } }
      }
    }
    const coveredAO = (C) => (ceilH[C] < INF / 2 && regs[cellR[C]].outdoor ? 0.62 : 1);
    for (let C = 0; C < NN; C++) {
      const reg = R(C);
      if (!reg || reg.isStair) continue;
      if (!nearEdge[C] && reg.outdoor && ceilH[C] >= INF / 2) continue;   // merged below
      const c = C % N, i = c % W, j = Math.floor(c / W);
      const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS, y = floorH[C];
      const cov = coveredAO(C);
      quad('f:' + reg.fmat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], uvXZ, reg.gi, (x, yy, z) => aoFloor(x, z, C, 0.6) * cov, 1);
    }
    // greedy rectangles of open outdoor ground (same slot, region, height)
    function greedySlot(s, valueOf, emit) {
      const used = new Uint8Array(N);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const c = idx(i, j);
        if (used[c]) continue;
        const v = valueOf(s * N + c);
        if (v === null) continue;
        let w = 1;
        while (i + w < W && !used[c + w] && valueOf(s * N + c + w) === v) w++;
        let h = 1;
        outer: while (j + h < H) {
          for (let k = 0; k < w; k++) { const cc = idx(i + k, j + h); if (used[cc] || valueOf(s * N + cc) !== v) break outer; }
          h++;
        }
        for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) used[idx(i + k, j + jj)] = 1;
        emit(GX0 + i * CS, GZ0 + j * CS, GX0 + (i + w) * CS, GZ0 + (j + h) * CS, v, s * N + c);
      }
    }
    for (let s = 0; s < L; s++) {
      greedySlot(s, (C) => { const r = R(C); return r && !r.isStair && r.outdoor && !nearEdge[C] && ceilH[C] >= INF / 2 ? r.index + '|' + floorH[C] : null; },
        (x0, z0, x1, z1, v, C) => { const r = R(C), y = floorH[C]; quad('f:' + r.fmat, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], uvXZ, r.gi, null, 2.5); });
    }
    // ceilings (indoor rooms and covered outdoor walkways)
    for (let C = 0; C < NN; C++) {
      const reg = R(C);
      if (!reg || ceilH[C] >= INF / 2) continue;
      const c = C % N, i = c % W, j = Math.floor(c / W);
      const x0 = GX0 + i * CS, z0 = GZ0 + j * CS, x1 = x0 + CS, z1 = z0 + CS, y = ceilH[C];
      const key = reg.ceilMat ? 'c:' + reg.ceilMat : 'ceil';
      quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], uvXZ, reg.gi, (x, yy, z) => aoFloor(x, z, C, 0.4), 1);
    }
    // floor colliders: solid from the span below (or BOTTOM) up to each floor
    for (let s = 0; s < L; s++) {
      greedySlot(s, (C) => {
        const r = R(C);
        if (!r || r.isStair) return null;
        const below = s > 0 ? ceilH[C - N] : BOTTOM;
        return below + '|' + floorH[C];
      }, (x0, z0, x1, z1, v) => { const [a, b] = v.split('|').map(Number); addBox(x0, a, z0, x1, b, z1); });
      // cap above a top span that has a ceiling and nothing above it
      greedySlot(s, (C) => {
        const r = R(C);
        if (!r || ceilH[C] >= INF / 2) return null;
        const up = s + 1 < L ? cellR[C + N] : -1;
        return up < 0 ? String(ceilH[C]) : null;
      }, (x0, z0, x1, z1, v) => addBox(x0, +v, z0, x1, +v + 0.6, z1));
    }

    // ------------------------------------------------------------ stairs
    for (const st of stairs) {
      const r = st.rect, s = st.def, g = st.reg.gi, key = 'stair';
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
        quad(key, [x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0], [0, 1, 0], uvXZ, g, null, 1);
        const lo = Math.min(prev, top), hi = Math.max(prev, top);
        if (k === 0) { /* the first riser comes from the wall builder */ }
        else if (s.up === 'N') wallFace(key, 'x', z1, x0, x1, lo, hi, 1, g);
        else if (s.up === 'S') wallFace(key, 'x', z0, x0, x1, lo, hi, -1, g);
        else if (s.up === 'E') wallFace(key, 'z', x0, z0, z1, lo, hi, -1, g);
        else wallFace(key, 'z', x1, z0, z1, lo, hi, 1, g);
        const nose = 0.06;
        if (s.up === 'N') boxGeo('trim_y', x0, top - 0.02, z1 - nose, x1, top + 0.005, z1, g, 't');
        else if (s.up === 'S') boxGeo('trim_y', x0, top - 0.02, z0, x1, top + 0.005, z0 + nose, g, 't');
        else if (s.up === 'E') boxGeo('trim_y', x0, top - 0.02, z0, x0 + nose, top + 0.005, z1, g, 't');
        else boxGeo('trim_y', x1 - nose, top - 0.02, z0, x1, top + 0.005, z1, g, 't');
      }
      // handrail along both long sides: one sloped bar each (short stairs: none)
      if (Math.abs(st.rise) > 1.2) for (const side of [-1, 1]) {
        const len = Math.hypot(st.L, st.rise);
        const bar = new THREE.BoxGeometry(0.05, 0.05, len);
        const mx = (r[0] + r[2]) / 2, mz = (r[1] + r[3]) / 2, ym = s.y0 + st.rise / 2 + 0.95;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
        // bar runs along local z; tilt it up the stair, then turn it to the climb direction
        const yaw = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[s.up];
        q.setFromEuler(new THREE.Euler(Math.atan2(st.rise, st.L), yaw, 0, 'YXZ'));
        const px = st.axisZ ? (side < 0 ? r[0] + 0.08 : r[2] - 0.08) : mx, pz = st.axisZ ? mz : (side < 0 ? r[1] + 0.08 : r[3] - 0.08);
        m4.compose(new THREE.Vector3(px, ym, pz), q, new THREE.Vector3(1, 1, 1));
        addGeo('p:steel', bar, m4, g);
      }
    }

    // ------------------------------------------------------------ walls
    // For the edge between columns a (low side) and b (high side): which
    // heights are wall, glass, door opening, ledge (railing / parapet)?
    function edgeInfo(a, b) {
      const A = spans(a), B = spans(b);
      if (!A.length && !B.length) return null;
      if (A.length === 1 && B.length === 1 && cellR[A[0]] === cellR[B[0]] && regs[cellR[A[0]]].isStair) return null;
      const doorsHere = a >= 0 && b >= 0 ? common(doorsAt, a, b) : null;
      const winsHere = a >= 0 && b >= 0 ? common(winsAt, a, b) : null;
      const out = { fa: [], fb: [], col: [], glass: [], door: [], win: [], ledge: [], boundary: false, bldA: a >= 0 ? bldgCell[a] : -1, bldB: b >= 0 ? bldgCell[b] : -1 };
      const top = (list) => list.length ? ceilH[list[list.length - 1]] : 0;
      const side = (P, Q, faces, other) => {
        for (const Pk of P) {
          const rp = regs[cellR[Pk]];
          const iv = [wallF[Pk], ceilH[Pk]];
          const opens = [], glass = [];
          for (const Qk of Q) {
            const rq = regs[cellR[Qk]];
            const o0 = Math.max(wallF[Pk], wallF[Qk]), o1 = Math.min(ceilH[Pk], ceilH[Qk]);
            if (o1 - o0 < 0.05) continue;
            if (rp.gi === rq.gi) {
              const s0 = Math.max(bot(Pk), bot(Qk));
              if (o1 - s0 > 0.01) opens.push([s0, o1]);
              // a ledge: the other side's floor sits inside this side's air
              const hi = wallF[Qk] - wallF[Pk];
              if (hi > 0.8 && !rq.isStair && !rp.isStair) out.ledge.push({ y: wallF[Qk], lowSide: faces === out.fa ? 'a' : 'b', reg: rq });
              continue;
            }
            if (doorsHere) for (const k of doorsHere) {
              const d = doors[k];
              const base = d.y !== null ? d.y : Math.max(wallF[Pk], wallF[Qk]);
              if (base < o0 - 0.06 || base >= o1 - 0.5) continue;
              const tp = d.full ? o1 : Math.min(o1, base + (d.h || DOOR_H));
              opens.push([base, tp]);
              out.door.push({ k, base, top: tp, header: tp < o1 - 0.01, ra: faces === out.fa ? rp : rq, rb: faces === out.fa ? rq : rp });
            }
            if (winsHere) for (const k of winsHere) {
              const w = wins[k];
              const base = w.y;
              if (base < o0 - 0.06 || base >= o1 - 0.5) continue;
              const s0 = base + w.sill, s1 = Math.min(o1, base + w.top);
              glass.push([s0, s1]);
              out.win.push({ k, sill: s0, top: s1, ra: faces === out.fa ? rp : rq, rb: faces === out.fa ? rq : rp });
            }
          }
          let walls = subtract(iv, union(opens.concat(glass)));
          if (!Q.length) {
            if (rp.outdoor) { out.boundary = true; walls = []; }
          } else if (iv[1] >= INF / 2) {
            // open sky on this side: never draw above the other column's top solid
            const qTop = ceilH[Q[Q.length - 1]] >= INF / 2 ? wallF[Q[Q.length - 1]] : top(Q) + 0.6;
            walls = walls.map((w) => [w[0], Math.min(w[1], qTop)]).filter((w) => w[1] - w[0] > 0.01);
          }
          for (const w of walls) faces.push({ y0: w[0], y1: w[1], P: Pk, rp, mat: faceMat(rp, w, Q, other) });
          for (const gl of glass) out.glass.push(gl);
        }
      };
      side(A, B, out.fa, b);
      side(B, A, out.fb, a);
      // dedupe glass / doors / windows (each side records them)
      out.glass = union(out.glass);
      const seen = new Set();
      out.door = out.door.filter((d) => { const k = d.k + '|' + d.base.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });
      out.win = out.win.filter((d) => { const k = 'w' + d.k + '|' + d.sill.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });
      const ls = new Set();
      out.ledge = out.ledge.filter((d) => { const k = d.y.toFixed(2) + d.lowSide; if (ls.has(k)) return false; ls.add(k); return true; });
      out.col = union(out.fa.concat(out.fb).map((f) => [f.y0, f.y1]));
      if (!out.fa.length && !out.fb.length && !out.glass.length && !out.door.length && !out.ledge.length && !out.boundary) return null;
      out.key = keyOf(out);
      return out;
    }
    // bottom of a span's air in this column (stairs: the step here)
    const bot = (K) => (regs[cellR[K]].isStair ? floorH[K] : wallF[K]);
    // what a face on side P (region rp) looks like over height w, facing column 'other'
    function faceMat(rp, w, Q, other) {
      // the span just above this stretch on the other side (its riser / building)
      let above = null;
      for (const Qk of Q) if (bot(Qk) >= w[1] - 0.02) { above = regs[cellR[Qk]]; break; }
      if (above && above.gi === rp.gi && above.riser) return above.riser;
      if (!rp.outdoor) return rp.wmat;
      const bi = other >= 0 ? bldgCell[other] : -1;
      if (bi >= 0) return blds[bi].ext;
      return (above && above.riser) || 'concrete_wall';
    }
    function keyOf(e) {
      const f = (l) => l.map((x) => x.y0.toFixed(2) + ',' + x.y1.toFixed(2) + ',' + x.mat + ',' + x.rp.index + ',' + wallF[x.P].toFixed(2)).join(';');
      return f(e.fa) + '|' + f(e.fb) + '|' + e.glass.map((g) => g[0].toFixed(2) + ',' + g[1].toFixed(2)).join(';') + '|' +
        e.door.map((d) => d.k + ',' + d.base.toFixed(2) + ',' + d.top.toFixed(2)).join(';') + '|' + e.win.map((d) => d.k + ',' + d.sill.toFixed(2)).join(';') + '|' +
        e.ledge.map((d) => d.y.toFixed(2) + d.lowSide + d.reg.index).join(';') + '|' + (e.boundary ? 'B' : '') + '|' + e.bldA + ',' + e.bldB;
    }

    function wallAO(floor, ceil) {
      return (x, y, z) => {
        const db = y - floor, dt = ceil - y;
        return (1 - 0.45 * (1 - U.smooth(U.clamp(db / 0.9, 0, 1)))) * (ceil >= INF / 2 ? 1 : (1 - 0.3 * (1 - U.smooth(U.clamp(dt / 0.6, 0, 1)))));
      };
    }

    for (const axis of ['x', 'z']) {
      const lines = axis === 'x' ? H : W, len = axis === 'x' ? W : H;
      for (let Ln = 1; Ln < lines; Ln++) {
        let run = null;
        const flush = () => { if (run) emitRun(axis, Ln, run); run = null; };
        for (let t = 0; t <= len; t++) {
          let e = null;
          if (t < len) {
            const a = axis === 'x' ? idx(t, Ln - 1) : idx(Ln - 1, t);
            const b = axis === 'x' ? idx(t, Ln) : idx(Ln, t);
            e = edgeInfo(a, b);
          }
          if (run && e && e.key === run.e.key) { run.t1 = t + 1; continue; }
          flush();
          if (e) run = { e, t0: t, t1: t + 1 };
        }
      }
    }

    function emitRun(axis, Ln, run) {
      const e = run.e;
      const line = (axis === 'x' ? GZ0 : GX0) + Ln * CS;
      const a0 = (axis === 'x' ? GX0 : GZ0) + run.t0 * CS, a1 = (axis === 'x' ? GX0 : GZ0) + run.t1 * CS;
      const len = a1 - a0;
      // faces
      for (const f of e.fa) wallFace('w:' + f.mat, axis, line, a0, a1, f.y0, f.y1, -1, f.rp.gi, wallAO(wallF[f.P], ceilH[f.P]), f.rp.outdoor ? 1.5 : 1);
      for (const f of e.fb) wallFace('w:' + f.mat, axis, line, a0, a1, f.y0, f.y1, 1, f.rp.gi, wallAO(wallF[f.P], ceilH[f.P]), f.rp.outdoor ? 1.5 : 1);
      // façade trims on the outdoor side of buildings
      const trims = (faces, sign, bi) => {
        if (bi < 0) return;
        const b = blds[bi], fz = b.facade || {};
        for (const f of faces) {
          if (!f.rp.outdoor) continue;
          const gF = wallF[f.P];
          const bands = [];
          if (fz.plinth !== false) bands.push([gF, gF + 0.42, fz.plinth || 'brick_dark', 0.025]);
          for (const bd of fz.bands || []) bands.push([bd[0], bd[1], bd[2], bd[3] || 0.035]);
          for (const [y0, y1, mat, out] of bands) {
            const lo = Math.max(y0, f.y0), hi = Math.min(y1, f.y1);
            if (hi - lo < 0.02) continue;
            const o0 = sign < 0 ? line - out : line, o1 = sign < 0 ? line : line + out;
            if (axis === 'x') boxGeo('w:' + mat, a0 - out, lo, o0, a1 + out, hi, o1, f.rp.gi, sign < 0 ? 'tbnew' : 'tbsew', 0.95);
            else boxGeo('w:' + mat, o0, lo, a0 - out, o1, hi, a1 + out, f.rp.gi, sign < 0 ? 'tbnsw' : 'tbnse', 0.95);
          }
        }
      };
      trims(e.fa, -1, e.bldB);
      trims(e.fb, 1, e.bldA);
      // colliders
      const thin = 0.03;
      for (const c of e.col) {
        const y0 = c[0] - 0.02, y1 = Math.min(c[1] + 0.02, 60);
        if (axis === 'x') addBox(a0, y0, line - thin, a1, y1, line + thin); else addBox(line - thin, y0, a0, line + thin, y1, a1);
      }
      if (e.boundary) {
        // invisible wall at the edge of the playable area, thick on the outside
        const aIn = spans(axis === 'x' ? idx(run.t0, Ln - 1) : idx(Ln - 1, run.t0)).length > 0;
        const t0 = aIn ? line - 0.03 : line - 0.6, t1 = aIn ? line + 0.6 : line + 0.03;
        if (axis === 'x') addBox(a0, -2, t0, a1, 40, t1); else addBox(t0, -2, a0, t1, 40, a1);
      }
      for (const gl of e.glass) {
        if (axis === 'x') addBox(a0, gl[0], line - thin, a1, gl[1], line + thin, F_GLASS); else addBox(line - thin, gl[0], a0, line + thin, gl[1], a1, F_GLASS);
      }
      // doors and windows
      for (const d of e.door) doorFrame(axis, line, a0, a1, d.base, d.top, d.ra.outdoor ? d.rb : d.ra, d.header);
      for (const w of e.win) windowFrame(axis, line, a0, a1, w.sill, w.top, w.ra.outdoor ? w.rb : w.ra, wins[w.k]);
      // ledges: railings indoors, parapets on roofs
      for (const l of e.ledge) {
        const hiSign = l.lowSide === 'a' ? 1 : -1;       // the higher floor is on this side of the line
        if (l.reg.roof) {
          const p = l.reg.parapet === undefined ? 0.45 : l.reg.parapet;
          if (p <= 0.01) continue;
          const mat = 'w:' + (l.reg.riser || 'brick_tan');
          const t0 = hiSign > 0 ? line : line - 0.25, t1 = hiSign > 0 ? line + 0.25 : line;
          if (axis === 'x') { boxGeo(mat, a0, l.y, t0, a1, l.y + p, t1, l.reg.gi, 'nsew', 0.9); boxGeo('w:render_cream', a0 - 0.03, l.y + p, t0 - 0.03, a1 + 0.03, l.y + p + 0.06, t1 + 0.03, l.reg.gi, 'tnsew', 1); addBox(a0, l.y, t0, a1, l.y + p + 0.06, t1); }
          else { boxGeo(mat, t0, l.y, a0, t1, l.y + p, a1, l.reg.gi, 'nsew', 0.9); boxGeo('w:render_cream', t0 - 0.03, l.y + p, a0 - 0.03, t1 + 0.03, l.y + p + 0.06, a1 + 0.03, l.reg.gi, 'tnsew', 1); addBox(t0, l.y, a0, t1, l.y + p + 0.06, a1); }
        } else if (!l.reg.outdoor) {
          railing(axis, line + hiSign * 0.07, a0, a1, l.y, l.reg.gi);
        }
      }
      void len;
    }
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
    function windowFrame(axis, line, a0, a1, sill, top, reg, w) {
      const g = reg.gi, d = 0.1, mw = 0.06;
      const step = (w && w.mullion) || 1.5;
      if (axis === 'x') {
        boxGeo('frame', a0, sill - 0.05, line - d - 0.05, a1, sill, line + d + 0.05, g, 'tnsb');
        boxGeo('frame', a0, top, line - d, a1, top + 0.06, line + d, g, 'bns');
        for (let a = a0; a <= a1 + 1e-6; a += Math.max(0.6, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / step)))) {
          const aa = U.clamp(a, a0 + mw / 2, a1 - mw / 2);
          boxGeo('frame', aa - mw / 2, sill, line - d, aa + mw / 2, top, line + d, g, 'nsew');
        }
        quad('glass', [a0, sill, line], [a1, sill, line], [a1, top, line], [a0, top, line], [0, 0, 1], uvXY, g, null, 4);
      } else {
        boxGeo('frame', line - d - 0.05, sill - 0.05, a0, line + d + 0.05, sill, a1, g, 'tewb');
        boxGeo('frame', line - d, top, a0, line + d, top + 0.06, a1, g, 'bew');
        for (let a = a0; a <= a1 + 1e-6; a += Math.max(0.6, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / step)))) {
          const aa = U.clamp(a, a0 + mw / 2, a1 - mw / 2);
          boxGeo('frame', line - d, sill, aa - mw / 2, line + d, top, aa + mw / 2, g, 'nsew');
        }
        quad('glass', [line, sill, a1], [line, sill, a0], [line, top, a0], [line, top, a1], [1, 0, 0], uvZY, g, null, 4);
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
      if (axis === 'x') addBox(a0, y, line - 0.05, a1, y + 1.08, line + 0.05, F_RAIL);
      else addBox(line - 0.05, y, a0, line + 0.05, y + 1.08, a1, F_RAIL);
    }

    // ------------------------------------------------------------ lights
    const lights = [];
    for (const reg of regs) {
      const P = LIGHTS[reg.light];
      if (!P || reg.outdoor || P.fx === 'none') continue;
      const rects = reg.isStair ? [reg.st.rect] : reg.rects;
      for (const r of rects) {
        const w = r[2] - r[0], d = r[3] - r[1];
        const nx = Math.max(1, Math.round(w / P.s)), nz = Math.max(1, Math.round(d / P.s));
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const x = r[0] + (a + 0.5) * w / nx, z = r[1] + (b + 0.5) * d / nz;
          const c = cellAt(x, z);
          if (c < 0) continue;
          if (!spans(c).some((C) => cellR[C] === reg.index)) continue;
          lights.push({ x, y: reg.ceil - 0.02, z, i: P.i, r: P.r, g: reg.gi, c: new THREE.Color(P.c), fx: P.fx, along: w >= d ? 'x' : 'z', reg });
        }
      }
    }
    // daylight spilling in through windows (baked only)
    for (const w of wins) {
      const r = w.r, mx = (r[0] + r[2]) / 2, mz = (r[1] + r[3]) / 2;
      const alongX = r[2] - r[0] >= r[3] - r[1];
      const len = alongX ? r[2] - r[0] : r[3] - r[1];
      const n = Math.max(1, Math.round(len / 4));
      for (const off of [-0.9, 0.9]) {
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const x = alongX ? U.lerp(r[0], r[2], t) : mx + off, z = alongX ? mz + off : U.lerp(r[1], r[3], t);
          const c = cellAt(x, z);
          if (c < 0) continue;
          const C = slotAt(c, w.y + 1);
          const reg = R(C);
          if (!reg || reg.outdoor) continue;
          lights.push({ x, y: w.y + (w.sill + w.top) / 2, z, i: 0.3, r: 6, g: reg.gi, c: new THREE.Color(0xd8e8ff), fx: 'none', reg, beacon: true });
        }
      }
    }
    for (const Lt of lights) {
      const g = Lt.g, y = Lt.reg.ceil;
      if (Lt.fx === 'panel') {
        const sx = Lt.along === 'x' ? 1.2 : 0.6, sz = Lt.along === 'x' ? 0.6 : 1.2;
        boxGeo('lamp_frame', Lt.x - sx / 2 - 0.04, y - 0.05, Lt.z - sz / 2 - 0.04, Lt.x + sx / 2 + 0.04, y, Lt.z + sz / 2 + 0.04, g, 'bnsew');
        quad('lamp', [Lt.x - sx / 2, y - 0.055, Lt.z - sz / 2], [Lt.x + sx / 2, y - 0.055, Lt.z - sz / 2], [Lt.x + sx / 2, y - 0.055, Lt.z + sz / 2], [Lt.x - sx / 2, y - 0.055, Lt.z + sz / 2], [0, -1, 0], uvXZ, g, null, 4);
      } else if (Lt.fx === 'strip') {
        const sx = Lt.along === 'x' ? 1.6 : 0.16, sz = Lt.along === 'x' ? 0.16 : 1.6;
        boxGeo('lamp_frame', Lt.x - sx / 2 - 0.03, y - 0.09, Lt.z - sz / 2 - 0.03, Lt.x + sx / 2 + 0.03, y, Lt.z + sz / 2 + 0.03, g, 'nsew');
        boxGeo('lamp', Lt.x - sx / 2, y - 0.1, Lt.z - sz / 2, Lt.x + sx / 2, y - 0.03, Lt.z + sz / 2, g, 'b');
      } else if (Lt.fx === 'highbay') {
        const drop = Math.min(1.6, (y - Lt.reg.floor) * 0.2);
        boxGeo('lamp_frame', Lt.x - 0.02, y - drop, Lt.z - 0.02, Lt.x + 0.02, y, Lt.z + 0.02, g, 'nsew');
        JB.Props.highbay(propAPI, Lt.x, y - drop, Lt.z, g);
        Lt.y = y - drop - 0.35;
      } else if (Lt.fx === 'cage') {
        boxGeo('lamp_frame', Lt.x - 0.18, y - 0.16, Lt.z - 0.12, Lt.x + 0.18, y, Lt.z + 0.12, g, 'nsew');
        boxGeo('lamp_warm', Lt.x - 0.13, y - 0.2, Lt.z - 0.08, Lt.x + 0.13, y - 0.15, Lt.z + 0.08, g, 'bnsew');
      }
    }

    // ------------------------------------------------------------ baking
    const lightsByGroup = {};
    for (const Lt of lights) (lightsByGroup[Lt.g] || (lightsByGroup[Lt.g] = [])).push(Lt);
    const bounceByGroup = {};
    for (const reg of regs) {
      const P = LIGHTS[reg.light];
      if (!P) continue;
      const c = new THREE.Color(P.c).multiplyScalar(P.bounce);
      if (!bounceByGroup[reg.gi]) bounceByGroup[reg.gi] = c; else bounceByGroup[reg.gi].lerp(c, 0.3);
    }
    const outGi = groupIndex.out;
    function lightAt(x, y, z, nx, ny, nz, g, out) {
      const bc = bounceByGroup[g];
      let r = bc ? bc.r : 0.05, gg = bc ? bc.g : 0.05, b = bc ? bc.b : 0.05;
      const hemi = g === outGi ? 0.55 + 0.45 * ny : 0.75 + 0.25 * ny;
      r *= hemi; gg *= hemi; b *= hemi;
      const list = lightsByGroup[g];
      if (list) for (let k = 0; k < list.length; k++) {
        const Lt = list[k];
        const dx = Lt.x - x, dy = Lt.y - y, dz = Lt.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > Lt.r * Lt.r) continue;
        const d = Math.sqrt(d2) + 1e-4;
        let lam = (dx * nx + dy * ny + dz * nz) / d;
        if (nx === 0 && ny === 0 && nz === 0) lam = 0.6;
        lam = (lam + 0.15) / 1.15;
        if (lam <= 0) continue;
        const f = 1 - d2 / (Lt.r * Lt.r);
        const lobe = Lt.beacon ? 1 : 0.3 + 0.7 * U.clamp(dy / d, 0, 1);
        const att = (f * f) / (1 + 0.35 * d2) * 4.0;
        const k2 = Lt.i * lam * att * lobe;
        r += Lt.c.r * k2; gg += Lt.c.g * k2; b += Lt.c.b * k2;
      }
      out[0] = r; out[1] = gg; out[2] = b;
      return out;
    }

    // ------------------------------------------------------------ materials
    const mats = {};
    const tex = (name) => JB.Tex.make(name, texSize);
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
      if (texName && JB.Tex.list.includes(texName)) {
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
      } else if (texName) {
        const fallback = { grass: 0x6f9a4a, paving: 0xc8c4bb, asphalt: 0x3a3c3f, brick_tan: 0xdcbd90, brick_dark: 0xa8835a, render_cream: 0xefe9da, cladding_white: 0xeef3f6, cladding_bluegrey: 0x9fb0c4, panel_green: 0xc3d3cc, roof_membrane: 0x9a9c9e, roof_metal: 0xb8bcc0, court_blue: 0x3b6fa8, court_green: 0x3f7d5a, court_grey: 0x8f9196, carpet_grey: 0x6b7480, lino: 0xc9ccc8, timber_floor: 0xc8954f, timber: 0x8a7458, soil: 0x6b4f35, gravel: 0xa9a7a2 }[texName];
        if (p.color === undefined && fallback !== undefined) p.color = fallback;
      }
      const m = bakedPatch(new THREE.MeshStandardMaterial(p));
      if (opts.envIntensity !== undefined) m.envMapIntensity = opts.envIntensity;
      return m;
    }
    const PROP_MATS = JB.Props.materials();
    function matFor(key) {
      if (mats[key]) return mats[key];
      let m;
      const [kind, name] = key.split(':');
      if (kind === 'f') m = std(name === 'grate' ? { alphaTest: 0.5 } : {}, name, name === 'diamond_plate' ? 2 : 1);
      else if (kind === 'w' || kind === 'c') m = std({}, name);
      else if (key === 'ceil') m = std({ color: 0xc9ccd0 }, 'ceiling');
      else if (key === 'stair') m = std({ color: 0x9a9c9e }, 'concrete_floor');
      else if (key === 'trim' || key === 'frame' || key === 'lamp_frame') m = std({ color: 0x2e3238, roughness: 0.45, metalness: 0.8 });
      else if (key === 'trim_y') m = std({ color: 0xe0b020, roughness: 0.6, metalness: 0.2 });
      else if (key === 'rail') m = std({ color: 0x8d949c, roughness: 0.4, metalness: 0.8 });
      else if (key === 'threshold') m = std({ color: 0x8d9298, roughness: 0.35, metalness: 0.9 });
      else if (key === 'glass') {
        m = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
        m.envMapIntensity = 1.6;
      } else if (key === 'lamp') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.2) });
      else if (key === 'lamp_warm') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb46a).multiplyScalar(2.4) });
      else if (PROP_MATS[key]) {
        const d = PROP_MATS[key];
        if (d.basic) m = new THREE.MeshBasicMaterial(Object.assign({}, d.params));
        else m = std(d.params, d.tex);
      } else m = std({ color: 0xff00ff });
      if (m.isMeshBasicMaterial) m.userData.noBake = true;
      mats[key] = m;
      return m;
    }

    // ------------------------------------------------------------ meshes
    const group = new THREE.Group();
    group.name = 'level';
    const lc = [0, 0, 0], lc2 = [0, 0, 0];
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
        const isCeil = key === 'ceil' || key.startsWith('c:');
        for (let v = 0; v < n; v++) {
          const x = b.pos[v * 3], y = b.pos[v * 3 + 1], z = b.pos[v * 3 + 2];
          lightAt(x, y, z, b.nor[v * 3], b.nor[v * 3 + 1], b.nor[v * 3 + 2], b.grp[v], lc);
          if (isCeil || b.nor[v * 3 + 1] < -0.7) {
            const c = cellAt(x, z);
            const C = c >= 0 ? slotAt(c, y - 0.5) : -1;
            if (C >= 0) {
              lightAt(x, floorH[C], z, 0, 1, 0, b.grp[v], lc2);
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
      mesh.receiveShadow = !isEmissive && key !== 'glass';
      if (key === 'glass') mesh.renderOrder = 2;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }

    // ------------------------------------------------------------ AI helpers
    // cells near something solid at walking height (nav ray-tests only these)
    const nearBox = new Uint8Array(NN);
    for (const bx of boxes) {
      const i0 = Math.max(0, Math.floor((bx.min[0] - GX0) / CS) - 1), i1 = Math.min(W - 1, Math.floor((bx.max[0] - GX0) / CS) + 1);
      const j0 = Math.max(0, Math.floor((bx.min[2] - GZ0) / CS) - 1), j1 = Math.min(H - 1, Math.floor((bx.max[2] - GZ0) / CS) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = idx(i, j);
        for (let s = 0; s < L; s++) {
          const C = s * N + c;
          if (cellR[C] < 0) break;
          const f = floorH[C];
          if (bx.max[1] > f + 0.3 && bx.min[1] < f + 1.6) nearBox[C] = 1;
        }
      }
    }

    // ------------------------------------------------------------ queries
    const regionAt = (x, z, y) => { const c = cellAt(x, z); return c < 0 ? null : R(slotAt(c, y)); };
    const floorAt = (x, z, y) => { const c = cellAt(x, z); if (c < 0) return null; const C = slotAt(c, y); return C >= 0 ? floorH[C] : null; };
    const probeOut = [0, 0, 0];
    function sampleLight(x, y, z, out) {
      const r = regionAt(x, z, y);
      if (!r) { out.setRGB(0.3, 0.32, 0.36); return out; }
      lightAt(x, y + 0.9, z, 0, 0, 0, r.gi, probeOut);
      out.setRGB(probeOut[0] * 0.8, probeOut[1] * 0.8, probeOut[2] * 0.8);
      return out;
    }
    // height of the highest solid in each column (heightfield for sun tests)
    const topSolid = new Float32Array(N).fill(0);
    for (let c = 0; c < N; c++) {
      const S = spans(c);
      if (!S.length) { topSolid[c] = 0; continue; }
      const last = S[S.length - 1];
      topSolid[c] = ceilH[last] >= INF / 2 ? floorH[last] : ceilH[last] + 0.6;
    }
    const sunH = Math.hypot(SUN_DIR.x, SUN_DIR.z), sx = -SUN_DIR.x / sunH, sz = -SUN_DIR.z / sunH, rise = -SUN_DIR.y / sunH;
    function inSun(x, y, z) {
      const c0 = cellAt(x, z);
      if (c0 < 0) return true;
      const own = slotAt(c0, y);
      if (own >= 0 && ceilH[own] < INF / 2) return false;   // under a roof
      for (let t = 0.5; t < 40; t += 0.5) {
        const yy = y + t * rise;
        if (yy > 12) return true;
        const c = cellAt(x + sx * t, z + sz * t);
        if (c < 0) return true;
        if (topSolid[c] > yy) return false;
      }
      return true;
    }

    const bounds = Object.assign({ y0: -2, y1: 12 }, M.bounds);
    return {
      group, boxes, lights, regions: regs, stairs, decor,
      grid: { W, H, CS, GX0, GZ0, L, N, cellR, floorH, ceilH, solid, edgeFlag, doorCell, idx, cellAt, neighbor, passable, nearBox },
      regionAt, floorAt, sampleLight, inSun, SUN_DIR, bounds,
      stats: { verts: vertsTotal, boxes: boxes.length, lights: lights.length, buckets: Object.keys(buckets).length, slots: L },
      F_GLASS, F_RAIL, outdoor: true
    };
  }

  JB.Level2 = { build };
})();
