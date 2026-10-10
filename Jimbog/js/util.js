// Jimbog — shared helpers (math, random, small data structures).
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  const U = JB.U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Exponential approach that is frame-rate independent.
  U.damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  // Shortest signed angle difference a -> b.
  U.angDiff = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.dampAngle = (cur, target, rate, dt) => cur + U.angDiff(cur, target) * (1 - Math.exp(-rate * dt));

  // Seeded PRNG (mulberry32) for deterministic level dressing.
  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Min binary heap keyed by a numeric score (used by A*).
  U.Heap = class {
    constructor() { this.items = []; this.keys = []; }
    get size() { return this.items.length; }
    push(item, key) {
      const it = this.items, k = this.keys;
      it.push(item); k.push(key);
      let i = it.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= k[i]) break;
        [it[p], it[i]] = [it[i], it[p]]; [k[p], k[i]] = [k[i], k[p]];
        i = p;
      }
    }
    pop() {
      const it = this.items, k = this.keys;
      const top = it[0];
      const lastI = it.pop(), lastK = k.pop();
      if (it.length) {
        it[0] = lastI; k[0] = lastK;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < it.length && k[l] < k[m]) m = l;
          if (r < it.length && k[r] < k[m]) m = r;
          if (m === i) break;
          [it[m], it[i]] = [it[i], it[m]]; [k[m], k[i]] = [k[i], k[m]];
          i = m;
        }
      }
      return top;
    }
  };

  // Safe localStorage wrapper (private windows can throw).
  U.load = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  };
  U.save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } };
})();
