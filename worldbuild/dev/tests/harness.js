// Diorama test harness (Deno: `deno run -A dev/tests/run.js` from worldbuild/).
// Loads the game's plain browser scripts into a stub `window` so pure logic can be tested
// without WebGL or a DOM. Anything that needs rendering is verified in the browser instead.
//
//   import { load, test, assert, eq, near } from './harness.js';
//   const D = load(['js/core.js', 'js/director.js']);   // fresh sandbox per call
//   load(files, { now: () => myClock })   // optional virtual performance.now()
//   test('growLobe never claims occupied cells', () => { ... });

const ROOT = new URL('../../', import.meta.url);

function stubEl() {
  const el = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [], childNodes: [], innerHTML: '', textContent: '', hidden: false,
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, insertBefore(c) { return c; },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; },
    getContext() { return null; }, focus() {}, blur() {}, click() {}, cloneNode() { return stubEl(); }
  };
  return el;
}

// Just enough of THREE for module top-level code that builds colours / vectors / geometry helpers.
function stubTHREE() {
  class Color {
    constructor(r, g, b) { if (typeof r === 'number' && g === undefined) this.setHex(r); else { this.r = r || 0; this.g = g || 0; this.b = b || 0; } }
    setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    convertSRGBToLinear() { const f = c => c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); this.r = f(this.r); this.g = f(this.g); this.b = f(this.b); return this; }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
    clone() { return new Color(this.r, this.g, this.b); }
    lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
    getHex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
  }
  class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } copy(v) { this.x = v.x; this.y = v.y; return this; } }
  class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } clone() { return new Vector3(this.x, this.y, this.z); } }
  class Vector4 { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } }
  const Any = function () { return new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : Any(), apply: () => Any(), construct: () => Any() }); };
  const T = { Color, Vector2, Vector3, Vector4, RedFormat: 1028, RGFormat: 1030, RGBAFormat: 1023, FloatType: 1015, UnsignedByteType: 1009, HalfFloatType: 1016,
    NearestFilter: 1003, LinearFilter: 1006, ClampToEdgeWrapping: 1001, AdditiveBlending: 2, DoubleSide: 2, FrontSide: 0 };
  return new Proxy(T, { get: (t, k) => (k in t ? t[k] : Any()) });
}

export function load(files, opts = {}) {
  const listeners = {};
  const window = { D: {}, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } } };
  const document = { getElementById() { return null; }, createElement() { return stubEl(); }, querySelector() { return null; }, querySelectorAll() { return []; },
    body: stubEl(), head: stubEl(), documentElement: stubEl(), addEventListener() {}, removeEventListener() {}, visibilityState: 'visible', hidden: false, readyState: 'complete' };
  const THREE = opts.THREE || stubTHREE();
  const perf = { now: opts.now || (() => Date.now()) };   // opts.now: a virtual clock for time-based logic
  const req = cb => 0;
  for (const f of files) {
    const src = Deno.readTextFileSync(new URL(f, ROOT));
    const fn = new Function('window', 'document', 'THREE', 'performance', 'requestAnimationFrame', 'localStorage', 'navigator', src + '\n//# sourceURL=' + f);
    fn(window, document, THREE, perf, req, window.localStorage, { userAgent: 'harness' });
  }
  const D = window.D;
  // minimal fallbacks when core.js is not loaded
  if (!D.on) { D.on = (e, f) => (listeners[e] = listeners[e] || []).push(f); D.emit = (e, a, b, c, d, x) => (listeners[e] || []).forEach(f => f(a, b, c, d, x)); }
  if (!D.toast) D.toast = () => {};
  D.toast = opts.toast || (() => {});
  return D;
}

// ---- tiny test runner -------------------------------------------------------------------------------
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }
export function assert(c, msg) { if (!c) throw new Error('assert failed: ' + (msg || '')); }
export function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`eq failed${msg ? ' (' + msg + ')' : ''}: ${A.slice(0, 200)} !== ${B.slice(0, 200)}`); }
export function near(a, b, eps = 1e-6, msg) { if (!(Math.abs(a - b) <= eps)) throw new Error(`near failed${msg ? ' (' + msg + ')' : ''}: ${a} vs ${b}`); }
export async function runAll(label) {
  let ok = 0, bad = 0;
  for (const t of tests.splice(0)) {
    try { await t.fn(); ok++; console.log('  ok  ' + t.name); }
    catch (e) { bad++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
  }
  console.log(`${label}: ${ok} passed, ${bad} failed`);
  return bad;
}
