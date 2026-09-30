/*
 * MATH
 * ====
 * Tiny vector + easing helpers shared by everything.
 *
 * World coordinates are metres:
 *   x  across the pitch  (+x = screen-right when looking from the bowler's end)
 *   y  up
 *   z  along the pitch   (z = 0 is the batter's stumps, z = 20.12 the bowler's)
 * For a RIGHT-handed batter the leg side is +x and the off side is -x.
 */
(function () {
  const CLLM = (window.CLLM = window.CLLM || {});

  const V = {
    v(x = 0, y = 0, z = 0) { return { x, y, z }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
    mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
    dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    cross(a, b) {
      return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    },
    len(a) { return Math.hypot(a.x, a.y, a.z); },
    norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; },
    copy(a) { return { x: a.x, y: a.y, z: a.z }; },
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    // Rotate a vector around the world Y axis (radians, +angle turns +z toward +x).
    rotY(a, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { x: a.x * c + a.z * s, y: a.y, z: -a.x * s + a.z * c };
    },
  };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
  const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Weighted pick: items = [{w, ...}]
  const pickW = (items) => {
    let tot = 0;
    for (const it of items) tot += Math.max(0, it.w);
    let r = Math.random() * tot;
    for (const it of items) { r -= Math.max(0, it.w); if (r <= 0) return it; }
    return items[items.length - 1];
  };
  // Gaussian-ish (sum of uniforms), mean 0, sd ~1
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.7320508;
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  // Wrap an angle to (-PI, PI]
  const wrapAng = (a) => { while (a <= -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2; return a; };

  // Two-bone IK: returns the middle joint (elbow/knee) for root A reaching C.
  // `pole` is a direction hint for which way the joint bends.
  function ik2(A, C, l1, l2, pole) {
    let d = V.sub(C, A);
    let dl = V.len(d);
    // Never quite fully straight: near full extension the knee/elbow would
    // otherwise pop (sqrt of ~0), so keep a hint of bend.
    const maxL = (l1 + l2) * 0.985, minL = Math.abs(l1 - l2) + 1e-4;
    const L = clamp(dl, minL, maxL);
    const dir = dl > 1e-6 ? V.mul(d, 1 / dl) : { x: 0, y: -1, z: 0 };
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    let pp = V.sub(pole, V.mul(dir, V.dot(pole, dir)));
    const pl = V.len(pp);
    pp = pl > 1e-6 ? V.mul(pp, 1 / pl) : { x: 0, y: 0, z: 1 };
    return V.add(A, V.add(V.mul(dir, a), V.mul(pp, h)));
  }

  CLLM.V = V;
  CLLM.M = { clamp, lerp, invLerp, smooth, easeOut, easeIn, easeInOut, rand, randInt, pick, pickW, gauss, deg, rad, wrapAng, ik2 };
})();
