// Jimbog — navigation for the AI cats: a walkable grid derived from the
// level (0.5 m cells, stairs included) with A* and path smoothing.
//
// Multi-storey maps stack up to G.L floors per grid column. A node id is
// slot * N + cell; the level says which slot a step in each direction lands
// on (G.neighbor). Single-floor maps (L = 1) behave exactly as before.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;

  // 8 directions: E, W, S, N, SE, SW, NE, NW
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const OPP = [1, 0, 3, 2, 7, 6, 5, 4];

  class Nav {
    constructor(level, world) {
      const G = level.grid;
      this.G = G; this.level = level; this.world = world;
      const { W, H, cellR, floorH, solid, doorCell } = G;
      const N = W * H, L = G.L || 1, NN = N * L;
      const regs = level.regions;
      this.W = W; this.H = H; this.N = N; this.L = L;
      // neighbour of node C in direction d (or -1)
      const nb = L === 1
        ? (C, d) => { const i = C % W + DIRS[d][0], j = Math.floor(C / W) + DIRS[d][1]; return i < 0 || j < 0 || i >= W || j >= H ? -1 : C + DIRS[d][0] + DIRS[d][1] * W; }
        : (C, d) => G.neighbor(C, d);
      this.nb = nb;
      const walk = new Uint8Array(NN);
      for (let c = 0; c < NN; c++) walk[c] = cellR[c] >= 0 && !solid[c] ? 1 : 0;
      // can a body step directly between two adjacent cells?
      const pass = L === 1
        ? (a, b) => {
          if (b < 0 || !walk[a] || !walk[b]) return false;
          const ra = regs[cellR[a]], rb = regs[cellR[b]];
          if (ra.gi !== rb.gi && !(doorCell[a] >= 0 && doorCell[a] === doorCell[b])) return false;
          return Math.abs(floorH[a] - floorH[b]) <= 0.5;
        }
        : (a, b) => b >= 0 && walk[a] && walk[b] && G.passable(a, b);
      // a node needs room around it for a cat (all 8 neighbours reachable)
      const ok = new Uint8Array(NN);
      for (let C = 0; C < NN; C++) {
        if (!walk[C]) continue;
        const c = C % N, i = c % W, j = Math.floor(c / W);
        if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) continue;
        let good = true;
        for (let d = 0; d < 4 && good; d++) if (!pass(C, nb(C, d))) good = false;
        for (let d = 4; d < 8 && good; d++) {
          const ax = nb(C, d < 6 ? (d === 4 ? 0 : 1) : (d === 6 ? 0 : 1)); // E or W
          const az = nb(C, d === 4 || d === 5 ? 2 : 3);                    // S or N
          if (!pass(C, ax) || !pass(C, az) || !pass(C, nb(C, d))) good = false;
        }
        ok[C] = good ? 1 : 0;
      }
      // edges, validated against real colliders (partitions, railings...).
      // Big maps only ray-test edges near a collider (G.nearBox), the rest are open ground.
      const mask = new Uint8Array(NN);
      const cx = (C) => G.GX0 + ((C % N) % W + 0.5) * G.CS, cz = (C) => G.GZ0 + (Math.floor((C % N) / W) + 0.5) * G.CS;
      const near = G.nearBox || null;
      for (let C = 0; C < NN; C++) {
        if (!ok[C]) continue;
        for (let d = 0; d < 8; d++) {
          if (mask[C] & (1 << d)) continue;
          const n = nb(C, d);
          if (n < 0 || !ok[n] || !pass(C, n)) continue;
          if (d >= 4) {
            const ax = nb(C, d === 4 || d === 6 ? 0 : 1), az = nb(C, d === 4 || d === 5 ? 2 : 3);
            if (!pass(C, ax) || !pass(C, az)) continue;
          }
          if (!near || near[C] || near[n]) {
            const y = Math.max(floorH[C], floorH[n]);
            const x0 = cx(C), z0 = cz(C), x1 = cx(n), z1 = cz(n);
            if (!world.clear(x0, y + 0.55, z0, x1, y + 0.55, z1, 0) || !world.clear(x0, y + 1.3, z0, x1, y + 1.3, z1, 0)) continue;
          }
          mask[C] |= 1 << d;
          // the reverse step lands back on C only if the level agrees
          if (nb(n, OPP[d]) === C) mask[n] |= 1 << OPP[d];
        }
      }
      // connected components; keep the biggest as "the map"
      const comp = new Int32Array(NN).fill(-1);
      let best = -1, bestSize = 0, id = 0;
      const stack = [];
      for (let C = 0; C < NN; C++) {
        if (!ok[C] || comp[C] >= 0) continue;
        let size = 0;
        stack.push(C); comp[C] = id;
        while (stack.length) {
          const k = stack.pop(); size++;
          for (let d = 0; d < 8; d++) if (mask[k] & (1 << d)) {
            const n = nb(k, d);
            if (n >= 0 && comp[n] < 0) { comp[n] = id; stack.push(n); }
          }
        }
        if (size > bestSize) { bestSize = size; best = id; }
        id++;
      }
      this.ok = ok; this.mask = mask; this.comp = comp; this.main = best;
      this.nodes = [];
      for (let C = 0; C < NN; C++) if (ok[C] && comp[C] === best) this.nodes.push(C);
      this.g = new Float32Array(NN); this.par = new Int32Array(NN); this.seen = new Uint32Array(NN); this.closed = new Uint32Array(NN); this.stampV = 1;
      this.cx = cx; this.cz = cz;
      this.size = bestSize;
      this.expandLimit = Math.max(30000, Math.round(this.nodes.length * 0.6));
    }

    // Node under (x, z); with y, the floor nearest below y + 0.6 on multi-storey maps.
    cellOf(x, z, y) {
      const c = this.G.cellAt(x, z);
      if (c < 0 || this.L === 1) return c;
      const N = this.N, fh = this.G.floorH, cr = this.G.cellR;
      let best = c, bestF = -Infinity;
      for (let s = 0; s < this.L; s++) {
        const C = s * N + c;
        if (cr[C] < 0) continue;
        const f = fh[C];
        if (y === undefined) return C;
        if (f <= y + 0.6 && f > bestF) { bestF = f; best = C; }
      }
      return best;
    }
    isNode(C) { return C >= 0 && this.ok[C] && this.comp[C] === this.main; }
    pointOf(C, out) { out.x = this.cx(C); out.y = this.G.floorH[C]; out.z = this.cz(C); return out; }

    // Nearest usable node to a world position (spiral search, prefers same height).
    nearest(x, y, z, maxR) {
      const c0 = this.G.cellAt(x, z);
      const N = this.N, W = this.W, fh = this.G.floorH;
      if (c0 >= 0) for (let s = 0; s < this.L; s++) {
        const C = s * N + c0;
        if (this.isNode(C) && Math.abs(fh[C] - y) < 1.2) return C;
      }
      const i0 = c0 >= 0 ? c0 % W : Math.floor((x - this.G.GX0) / this.G.CS), j0 = c0 >= 0 ? Math.floor(c0 / W) : Math.floor((z - this.G.GZ0) / this.G.CS);
      const R = Math.ceil((maxR || 4) / this.G.CS);
      let best = -1, bd = Infinity;
      for (let r = 1; r <= R; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= W || j >= this.H) continue;
          for (let s = 0; s < this.L; s++) {
            const C = s * N + j * W + i;
            if (!this.isNode(C)) continue;
            const dh = Math.abs(fh[C] - y);
            const d = di * di + dj * dj + dh * dh * 16;
            if (d < bd) { bd = d; best = C; }
          }
        }
        // stop once no farther ring can beat the best so far (another storey may be closer)
        if (best >= 0 && (r + 1) * (r + 1) > bd) return best;
      }
      return best;
    }

    randomNode(rng) { return this.nodes[Math.floor((rng || Math.random)() * this.nodes.length)]; }

    // A* from node a to node b. Returns an array of nodes, or null.
    path(a, b, maxExpand) {
      if (a < 0 || b < 0) return null;
      if (a === b) return [a];
      const W = this.W, N = this.N, fh = this.G.floorH;
      const s = ++this.stampV;
      const heap = new U.Heap();
      const bc = b % N, bx = bc % W, bj = Math.floor(bc / W), by = fh[b];
      const hf = (C) => { const c = C % N, dx = (c % W) - bx, dz = Math.floor(c / W) - bj, dy = (fh[C] - by) * 2; return Math.sqrt(dx * dx + dz * dz + dy * dy); };
      this.g[a] = 0; this.seen[a] = s; this.par[a] = -1;
      heap.push(a, hf(a));
      let n = 0;
      const lim = maxExpand || this.expandLimit;
      while (heap.size) {
        const c = heap.pop();
        if (this.closed[c] === s) continue;
        this.closed[c] = s;
        if (c === b) break;
        if (++n > lim) return null;
        const m = this.mask[c];
        for (let d = 0; d < 8; d++) {
          if (!(m & (1 << d))) continue;
          const nb = this.nb(c, d);
          if (nb < 0 || this.closed[nb] === s) continue;
          const cost = this.g[c] + (d < 4 ? 1 : 1.4142) + Math.abs(fh[nb] - fh[c]) * 0.6;
          if (this.seen[nb] !== s || cost < this.g[nb]) {
            this.seen[nb] = s; this.g[nb] = cost; this.par[nb] = c;
            heap.push(nb, cost + hf(nb));
          }
        }
      }
      if (this.closed[b] !== s) return null;
      const out = [];
      for (let c = b; c !== -1; c = this.par[c]) out.push(c);
      out.reverse();
      return out;
    }

    // Can a cat walk straight from node a to node b? (grid supercover walk)
    straight(a, b) {
      const W = this.W, N = this.N;
      const ca = a % N, cb = b % N;
      let i = ca % W, j = Math.floor(ca / W);
      const i1 = cb % W, j1 = Math.floor(cb / W);
      const di = Math.sign(i1 - i), dj = Math.sign(j1 - j);
      const ni = Math.abs(i1 - i), nj = Math.abs(j1 - j);
      let c = a, ix = 0, jx = 0;
      while (ix < ni || jx < nj) {
        const tx = (ix + 0.5) / (ni || 1), tz = (jx + 0.5) / (nj || 1);
        let d;
        if (ni && (tx < tz || !nj)) { d = di > 0 ? 0 : 1; ix++; }
        else if (nj && (tz < tx || !ni)) { d = dj > 0 ? 2 : 3; jx++; }
        else { d = di > 0 ? (dj > 0 ? 4 : 6) : (dj > 0 ? 5 : 7); ix++; jx++; }
        if (!(this.mask[c] & (1 << d))) return false;
        c = this.nb(c, d);
        if (c < 0) return false;
      }
      return c === b;
    }

    // Path as world points with line-of-sight smoothing.
    route(fromPos, toPos) {
      const a = this.nearest(fromPos.x, fromPos.y, fromPos.z, 3);
      const b = this.nearest(toPos.x, toPos.y, toPos.z, 5);
      const cells = this.path(a, b);
      if (!cells) return null;
      const keep = [cells[0]];
      let k = 0;
      while (k < cells.length - 1) {
        let far = k + 1;
        const lim = Math.min(cells.length - 1, k + 40);
        for (let m = lim; m > k + 1; m--) {
          if (Math.abs(this.G.floorH[cells[m]] - this.G.floorH[cells[k]]) > 0.05 && m - k > 3) continue;
          if (this.straight(cells[k], cells[m])) { far = m; break; }
        }
        keep.push(cells[far]);
        k = far;
      }
      return keep.map((c) => this.pointOf(c, { x: 0, y: 0, z: 0 }));
    }
  }

  JB.Nav = Nav;
})();
