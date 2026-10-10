// Jimbog — navigation for the AI cats: a walkable grid derived from the
// level (0.5 m cells, stairs included) with A* and path smoothing.
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
      const N = W * H;
      const regs = level.regions;
      const walk = new Uint8Array(N);
      for (let c = 0; c < N; c++) walk[c] = cellR[c] >= 0 && !solid[c] ? 1 : 0;
      // can a body step directly between two adjacent cells?
      const pass = (a, b) => {
        if (!walk[a] || !walk[b]) return false;
        const ra = regs[cellR[a]], rb = regs[cellR[b]];
        if (ra.gi !== rb.gi && !(doorCell[a] >= 0 && doorCell[a] === doorCell[b])) return false;
        return Math.abs(floorH[a] - floorH[b]) <= 0.5;
      };
      // a node needs room around it for a cat (all 8 neighbours reachable)
      const ok = new Uint8Array(N);
      for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
        const c = j * W + i;
        if (!walk[c]) continue;
        let good = true;
        for (let d = 0; d < 4 && good; d++) if (!pass(c, c + DIRS[d][0] + DIRS[d][1] * W)) good = false;
        for (let d = 4; d < 8 && good; d++) {
          const n = c + DIRS[d][0] + DIRS[d][1] * W;
          if (!pass(c, c + DIRS[d][0]) || !pass(c, c + DIRS[d][1] * W) || !pass(c, n)) good = false;
        }
        ok[c] = good ? 1 : 0;
      }
      // edges, validated against real colliders (partitions, railings...)
      const mask = new Uint8Array(N);
      const cx = (c) => G.GX0 + ((c % W) + 0.5) * G.CS, cz = (c) => G.GZ0 + (Math.floor(c / W) + 0.5) * G.CS;
      for (let c = 0; c < N; c++) {
        if (!ok[c]) continue;
        for (let d = 0; d < 8; d++) {
          if (mask[c] & (1 << d)) continue;
          const n = c + DIRS[d][0] + DIRS[d][1] * W;
          if (!ok[n] || !pass(c, n)) continue;
          if (d >= 4 && (!pass(c, c + DIRS[d][0]) || !pass(c, c + DIRS[d][1] * W))) continue;
          const y = Math.max(floorH[c], floorH[n]);
          const x0 = cx(c), z0 = cz(c), x1 = cx(n), z1 = cz(n);
          if (!world.clear(x0, y + 0.55, z0, x1, y + 0.55, z1, 0) || !world.clear(x0, y + 1.3, z0, x1, y + 1.3, z1, 0)) continue;
          mask[c] |= 1 << d; mask[n] |= 1 << OPP[d];
        }
      }
      // connected components; keep the biggest as "the map"
      const comp = new Int32Array(N).fill(-1);
      let best = -1, bestSize = 0, id = 0;
      const stack = [];
      for (let c = 0; c < N; c++) {
        if (!ok[c] || comp[c] >= 0) continue;
        let size = 0;
        stack.push(c); comp[c] = id;
        while (stack.length) {
          const k = stack.pop(); size++;
          for (let d = 0; d < 8; d++) if (mask[k] & (1 << d)) {
            const n = k + DIRS[d][0] + DIRS[d][1] * W;
            if (comp[n] < 0) { comp[n] = id; stack.push(n); }
          }
        }
        if (size > bestSize) { bestSize = size; best = id; }
        id++;
      }
      this.ok = ok; this.mask = mask; this.comp = comp; this.main = best; this.W = W; this.H = H; this.N = N;
      this.nodes = [];
      for (let c = 0; c < N; c++) if (ok[c] && comp[c] === best) this.nodes.push(c);
      this.g = new Float32Array(N); this.par = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N); this.stampV = 1;
      this.cx = cx; this.cz = cz;
      this.size = bestSize;
    }

    cellOf(x, z) { return this.G.cellAt(x, z); }
    isNode(c) { return c >= 0 && this.ok[c] && this.comp[c] === this.main; }
    pointOf(c, out) { out.x = this.cx(c); out.y = this.G.floorH[c]; out.z = this.cz(c); return out; }

    // Nearest usable node to a world position (spiral search, prefers same height).
    nearest(x, y, z, maxR) {
      const c0 = this.cellOf(x, z);
      if (this.isNode(c0) && Math.abs(this.G.floorH[c0] - y) < 1.2) return c0;
      const W = this.W, i0 = c0 % W, j0 = Math.floor(c0 / W);
      const R = Math.ceil((maxR || 4) / this.G.CS);
      let best = -1, bd = Infinity;
      for (let r = 1; r <= R; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= W || j >= this.H) continue;
          const c = j * W + i;
          if (!this.isNode(c)) continue;
          const dh = Math.abs(this.G.floorH[c] - y);
          const d = di * di + dj * dj + dh * dh * 16;
          if (d < bd) { bd = d; best = c; }
        }
        if (best >= 0) return best;
      }
      return best;
    }

    randomNode(rng) { return this.nodes[Math.floor((rng || Math.random)() * this.nodes.length)]; }

    // A* from cell a to cell b. Returns an array of cells, or null.
    path(a, b, maxExpand) {
      if (a < 0 || b < 0) return null;
      if (a === b) return [a];
      const W = this.W, fh = this.G.floorH;
      const s = ++this.stampV;
      const heap = new U.Heap();
      const bx = b % W, bj = Math.floor(b / W);
      const hf = (c) => { const dx = (c % W) - bx, dz = Math.floor(c / W) - bj; return Math.hypot(dx, dz) * 1.0; };
      this.g[a] = 0; this.seen[a] = s; this.par[a] = -1;
      heap.push(a, hf(a));
      let n = 0;
      const lim = maxExpand || 30000;
      while (heap.size) {
        const c = heap.pop();
        if (this.closed[c] === s) continue;
        this.closed[c] = s;
        if (c === b) break;
        if (++n > lim) return null;
        const m = this.mask[c];
        for (let d = 0; d < 8; d++) {
          if (!(m & (1 << d))) continue;
          const nb = c + DIRS[d][0] + DIRS[d][1] * W;
          if (this.closed[nb] === s) continue;
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

    // Can a cat walk straight from cell a to cell b? (grid supercover walk)
    straight(a, b) {
      const W = this.W;
      let i = a % W, j = Math.floor(a / W);
      const i1 = b % W, j1 = Math.floor(b / W);
      const di = Math.sign(i1 - i), dj = Math.sign(j1 - j);
      const ni = Math.abs(i1 - i), nj = Math.abs(j1 - j);
      let c = a, ix = 0, jx = 0;
      while (ix < ni || jx < nj) {
        const tx = (ix + 0.5) / (ni || 1), tz = (jx + 0.5) / (nj || 1);
        let d, nc;
        if (ni && (tx < tz || !nj)) { d = di > 0 ? 0 : 1; nc = c + di; ix++; }
        else if (nj && (tz < tx || !ni)) { d = dj > 0 ? 2 : 3; nc = c + dj * W; jx++; }
        else { d = di > 0 ? (dj > 0 ? 4 : 6) : (dj > 0 ? 5 : 7); nc = c + di + dj * W; ix++; jx++; }
        if (!(this.mask[c] & (1 << d))) return false;
        c = nc;
      }
      return true;
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
