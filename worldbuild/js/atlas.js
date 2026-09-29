/* Diorama — the Atlas table (Living History, spec 3.12 / 5.11).
   The diorama drains to chalk plaster from the camera focus and becomes a projected map. Pages (Lordship,
   Growth rings, Roads & traffic, Places, Relief) are painted into 1024 x 1024 canvases (one pixel per 16 m
   cell) in time-sliced row strips and slid over one another; realm borders are inked by the terrain shader
   from a colour-index texture (Realm.fillIdTex); a brass looking glass shows another page, or the living
   world, through a circle; clicking a place pulls the camera back through every "ring" it answers to.
   Everything is a view filter: nothing here touches History or saved state.
   Optional: without this file D.AU.uAtlas stays 0 and every shader hook is skipped. */
(function () {
'use strict';
const D = window.D;
if (!D || !D.AU) return;   // terrain.js owns the uniforms; without them there is nothing to drive
const N = D.N, SIZE = D.SIZE, VN = D.VN;
const AU = D.AU;

const PAGES = ['lordship', 'rings', 'roads', 'places', 'relief'];
const PAGE_LABEL = { lordship: 'Lordship', rings: 'Growth rings', roads: 'Roads & traffic', places: 'Places', relief: 'Relief' };
const PAGE_Q = { lordship: 'Whose land is this?', rings: 'How old is it?', roads: 'Which way do people go?', places: 'What stands where?', relief: 'How does the land lie?' };
const INK = { lordship: 1, rings: 0.45, roads: 0.45, places: 0.6, relief: 0.6 };   // realm line strength per page
const MIX = { lordship: 0.55, rings: 0.7, roads: 0.92, places: 0.6, relief: 0.6 };  // how strongly the page tints the plaster (thin road lines need more)
const TUNE = Object.assign({ ease: 1.6, slide: 0.9, paintMs: 4, idDebounce: 1.5, glassR: 110 }, D.TUNE && D.TUNE.atlas);
if (D.TUNE) D.TUNE.atlas = TUNE;
const UNSURVEYED = 'The land has not yet been surveyed; press ▶ to begin the chronicle.';

// =====================================================================================================
// Pure helpers (exported as Atlas._pure for the Deno tests)
// =====================================================================================================
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
// growth-ring century bands (sRGB 0..1); mirrors at_ring() in terrain.js GLSL_ATLAS exactly
const RING_STOPS = [[0.50, 0.36, 0.24], [0.80, 0.60, 0.28], [0.82, 0.55, 0.52], [0.96, 0.89, 0.62]];
const RING_UNKNOWN = [0.62, 0.61, 0.59];
function ringColor(y, y0, y1) {
  if (!(y > 0.5)) return RING_UNKNOWN.slice();
  const c0 = Math.floor(y0 / 100), c1 = Math.max(Math.floor(y1 / 100), c0 + 1);
  const t = clamp01((Math.floor(y / 100) - c0) / (c1 - c0));
  const s = t < 0.3334 ? 0 : t < 0.6667 ? 1 : 2, u = t * 3 - s, a = RING_STOPS[s], b = RING_STOPS[s + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
// hypsometric tint by height above the sea (sRGB 0..255)
const HYPSO = [[-80, [168, 196, 210]], [0, [204, 222, 228]], [0.5, [178, 200, 146]], [60, [202, 212, 156]], [180, [228, 216, 164]],
  [400, [214, 186, 140]], [800, [186, 166, 148]], [1200, [214, 210, 206]], [1500, [244, 243, 240]]];
function hypso(dh) {
  if (dh <= HYPSO[0][0]) return HYPSO[0][1].slice();
  for (let q = 1; q < HYPSO.length; q++) if (dh <= HYPSO[q][0]) {
    const [h0, a] = HYPSO[q - 1], [h1, b] = HYPSO[q], t = (dh - h0) / (h1 - h0);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
  }
  return HYPSO[HYPSO.length - 1][1].slice();
}
const HYPSO_LUT = []; for (let m = -100; m <= 1600; m++) HYPSO_LUT.push(hypso(m));   // 1 m steps, index = metres + 100
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const words = n => (n >= 0 && n < WORDS.length && n === Math.floor(n) ? WORDS[n] : String(n));
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// camera goal that frames a world bbox [x0, z0, x1, z1]
function fitBB(bb, margin, fovDeg) {
  const w = Math.max(1, bb[2] - bb[0]), h = Math.max(1, bb[3] - bb[1]);
  const size = Math.max(w, h) * (margin || 1.3);
  const dist = size / (2 * Math.tan((fovDeg || 50) * Math.PI / 360));
  return { x: (bb[0] + bb[2]) / 2, z: (bb[1] + bb[3]) / 2, dist: Math.min(30000, Math.max(120, dist)) };
}
// looking-glass uniform from the DOM ring (CSS px, relative to the viewport); gl_FragCoord is bottom-up
function glassUniform(cx, cy, r, vpH, pr, mode) { return [cx * pr, (vpH - cy) * pr, r * pr, mode]; }
// the drain wave must reach every map corner (plus its noisy 480 m edge) by the end
function waveMax(fx, fz) {
  let m = 0;
  for (const [x, z] of [[0, 0], [SIZE, 0], [0, SIZE], [SIZE, SIZE]]) m = Math.max(m, Math.hypot(x - fx, z - fz));
  return m + 900;
}
const MEASURES = [['a furlong', 201.2], ['half a mile', 804.7], ['a mile', 1609.3], ['a league', 4828], ['two leagues', 9656], ['five leagues', 24140]];
// a scale bar: one league whenever it fits, else the largest measure that does
function leagueBar(mPerPx, maxPx) {
  maxPx = maxPx || 170;
  if (!(mPerPx > 0)) return null;
  const lg = 4828 / mPerPx;
  if (lg >= 40 && lg <= maxPx) return { px: lg, label: 'one league' };
  let best = MEASURES[0];
  for (const m of MEASURES) if (m[1] / mPerPx <= maxPx) best = m;
  return { px: best[1] / mPerPx, label: best[0] };
}
function decodeF32(v) {
  if (!v) return null;
  if (v instanceof Float32Array || Array.isArray(v)) return v;
  if (ArrayBuffer.isView(v)) return Array.from(v);
  if (typeof v === 'string') {
    try { const bin = atob(v), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer, 0, u8.length >> 2); }
    catch (e) { return null; }
  }
  return null;
}
// ghost polylines: a flat [x, z, ...] run (NaN pairs split it), a base64 Float32 string, or arrays of either
function polylines(pts) {
  const a = decodeF32(pts); if (!a || !a.length) return [];
  if (Array.isArray(a) && (Array.isArray(a[0]) || ArrayBuffer.isView(a[0]))) {
    const out = [];
    for (const p of a) { const f = Array.isArray(p) && Array.isArray(p[0]) ? [].concat(...p) : Array.from(p); out.push(...polylines(f)); }
    return out;
  }
  const out = []; let cur = [];
  for (let q = 0; q + 1 < a.length; q += 2) {
    const x = a[q], z = a[q + 1];
    if (!(x === x) || !(z === z)) { if (cur.length >= 4) out.push(cur); cur = []; continue; }
    cur.push(x, z);
  }
  if (cur.length >= 4) out.push(cur);
  return out;
}
function hslRgb(h, s, l) {
  const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
// holder fill: the realm's own hue (degrees, a 0..1 turn, or a CSS hex), low chroma to suit the plaster
function holderRgb(hue, i) {
  if (typeof hue === 'string' && /^#?[0-9a-f]{6}$/i.test(hue)) { const v = parseInt(hue.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  let h = typeof hue === 'number' && isFinite(hue) ? (hue >= 0 && hue < 1 ? hue * 360 : hue) : (i || 0) * 137.508;
  h = ((h % 360) + 360) % 360;
  return hslRgb(h / 360, 0.46, 0.62);
}
// quiet parchment tints for the holders that do not make the legend (by greedy colour index)
const MUTED = [[222, 212, 190], [206, 204, 184], [226, 218, 202], [198, 198, 186], [214, 204, 178], [204, 210, 196], [222, 206, 190], [210, 202, 202]];
const ZONE_RGB = [null, [224, 184, 90], [216, 200, 96], [200, 90, 80], [154, 120, 208], [77, 155, 224]];   // terrain zoneColor()
const ZONE_NAME = [null, 'Villages & towns', 'Farmland', 'Castles', 'Monasteries', 'Harbours'];
function pageTitle(page, world, year) {
  const W = String(world || 'this land').toUpperCase(), y = year > 0 ? Math.floor(year) : 0, ad = y ? `, ANNO DOMINI ${y}` : '';
  switch (page) {
    case 'lordship': return `A MAP OF THE LORDSHIPS OF ${W}${ad}`;
    case 'rings': return `THE GROWTH OF ${W}${y ? ', AS IT STOOD IN ' + y : ''}`;
    case 'roads': return `THE ROADS & WAYFARING OF ${W}${ad}`;
    case 'places': return `THE TOWNS & PLACES OF ${W}${ad}`;
    default: return `THE LIE OF THE LAND IN ${W}`;
  }
}
const NOUN = { plot: 'plot', settlement: 'settlement', parish: 'parish', manor: 'manor', honour: 'honour', shire: 'shire' };
const hashOf = r => (r.maskHash !== undefined && r.maskHash !== null ? String(r.maskHash) : r.level + ':' + r.id);
function coincidence(rings) {
  for (let a = 0; a < rings.length; a++) for (let b = a + 1; b < rings.length; b++)
    if (hashOf(rings[a]) === hashOf(rings[b])) return `the ${NOUN[rings[a].level] || rings[a].level} and the ${NOUN[rings[b].level] || rings[b].level} share one bound`;
  return 'some of them share a bound';
}
function answers(rings) {
  const n = new Set(rings.map(hashOf)).size;
  if (n === rings.length) return `Answers to ${words(n)} different place${n === 1 ? '' : 's'}${n > 1 ? ', none of them the same shape' : ''}.`;
  return `Answers to ${words(n)} place${n === 1 ? '' : 's'}; ${coincidence(rings)}.`;
}
// one channel of the shader's at_lines() kernel (2x2 "same as nearest" isoline): v and metres to the border
function inkLine(A, B, C, E, fx, fy) {
  const Nn = fx < 0.5 ? (fy < 0.5 ? A : C) : (fy < 0.5 ? B : E);
  const wa = +(A === Nn), wb = +(B === Nn), wc = +(C === Nn), we = +(E === Nn), mix = (a, b, t) => a + (b - a) * t;
  const v = mix(mix(wa, wb, fx), mix(wc, we, fx), fy), gx = mix(wb - wa, we - wc, fy), gy = mix(wc - wa, we - wb, fx);
  return { v, dist: (v - 0.5) / Math.max(Math.hypot(gx, gy), 1e-3) * 16 };
}
// share of a street's segments whose two sides (off metres either way) fall in different regions
function streetBorder(pts, idAt, off) {
  off = off || 12; let n = 0, hit = 0;
  for (let q = 2; q + 1 < pts.length; q += 2) {
    const x0 = pts[q - 2], z0 = pts[q - 1], dx = pts[q] - x0, dz = pts[q + 1] - z0, L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    const mx = x0 + dx / 2, mz = z0 + dz / 2, px = -dz / L * off, pz = dx / L * off;
    n++; if (idAt(mx + px, mz + pz) !== idAt(mx - px, mz - pz)) hit++;
  }
  return n ? hit / n : 0;
}
const LAND_EVENT = { dowry: 'a dowry', sale: 'sold', bequest: 'bequeathed to the Church', partition: 'divided between heiresses',
  regrant: 'granted to a new house', charter: 'chartered as a borough', escheat: 'forfeit to the Crown' };
function landPhrase(k, y) { const p = LAND_EVENT[k]; return p ? `its manor was ${p} in ${y}` : null; }
// accumulate coarse samples into named regions; the label goes on the member sample nearest the centroid
function regionsFrom(samples) {
  const m = new Map();
  for (const s of samples) {
    if (!s || !s.id) continue;
    let e = m.get(s.id); if (!e) m.set(s.id, e = { id: s.id, name: s.name || '', n: 0, sx: 0, sz: 0, pts: [] });
    e.n++; e.sx += s.x; e.sz += s.z; e.pts.push(s.x, s.z);
  }
  m.forEach(e => {
    const cx = e.sx / e.n, cz = e.sz / e.n; let bd = Infinity;
    for (let q = 0; q < e.pts.length; q += 2) { const d = (e.pts[q] - cx) ** 2 + (e.pts[q + 1] - cz) ** 2; if (d < bd) { bd = d; e.x = e.pts[q]; e.z = e.pts[q + 1]; } }
    delete e.pts; delete e.sx; delete e.sz;
  });
  return m;
}
// page(i): +1 / -1 step (PageUp / PageDown), other integers and names are absolute
function resolvePage(arg, cur) {
  if (typeof arg === 'string') { if (arg === '+1' || arg === '-1') arg = +arg; else { const i = PAGES.indexOf(arg); return i >= 0 ? i : cur; } }
  if (arg === 1 || arg === -1) return (cur + arg + PAGES.length) % PAGES.length;
  return Number.isInteger(arg) && arg >= 0 && arg < PAGES.length ? arg : cur;
}

const Atlas = D.Atlas = {
  on: false, k: 0, PAGES, cur: 0, pulling: false,
  glass: { show: false, mode: 'rings', cx: -1, cy: -1, r: TUNE.glassR }
};
Atlas._pure = { ease, ringColor, hypso, words, fitBB, glassUniform, waveMax, leagueBar, decodeF32, polylines, holderRgb, hslRgb,
  pageTitle, answers, coincidence, inkLine, streetBorder, landPhrase, regionsFrom, resolvePage, RING_STOPS, PAGES };

// =====================================================================================================
// State
// =====================================================================================================
let res = false;                        // GPU/canvas resources made (lazily, on the first entry)
let pgA = null, pgB = null, pgG = null;  // page slots: A shown, B incoming / scratch, G looking glass
let idBuf = null, idTex = null, selBuf = null, selTex = null, yearGrid = null, hold8 = null, tmpMask = null, holdGrid = null;
let idsDirty = true, idYear = null;
const wave = { run: false, mode: 0, p: 0, dir: 1, rmax: SIZE * 1.5 };
let slide = null;                        // { p, idx }
const jobs = [];
const WAIT = { wait: true };
let refreshT = -1, lastRefreshYear = null, regionsDirty = true, regionsT = 0, regions = null;
let domT = 0, lastTick = 0, selfLoop = false, wantPage = 0;
let viewY = null;                        // replay view year (story:view), null = live
let lastFrameMs = 16;

const realmReady = () => !!(D.Realm && D.Realm.ready);
// without realm.js, or without story.js (no clock, no ▶, so the realm never surveys), the Lordship page is dropped (spec 5.13)
const avail = i => PAGES[i] !== 'lordship' || !!(D.Realm && D.Story);
function viewYear() {
  if (viewY !== null && viewY !== undefined) return viewY;
  const S = D.Story;
  if (!S || !S.started) return 0;
  try { return +(S.displayYear ? S.displayYear() : S.year ? S.year() : 0) || 0; } catch (e) { return 0; }
}
const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
function focusXZ() { const f = D.Cam && D.Cam.focusPoint ? safe(() => D.Cam.focusPoint(), null) : null; return f ? { x: f.x, z: f.z } : { x: SIZE / 2, z: SIZE / 2 }; }
const vpEl = () => document.getElementById('viewport');

// ---- resources ---------------------------------------------------------------------------------------
function makePage() {
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, N, N); }   // blank = untinted chalk
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
  return { cv, ctx, tex, img: null, page: null, year: null, ready: false, info: null };
}
function dataTex(buf, fmt) {
  const t = new THREE.DataTexture(buf, N, N, fmt, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.flipY = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
function ensureRes() {
  if (res) return;
  pgA = makePage(); pgB = makePage(); pgG = makePage();
  idBuf = new Uint8Array(N * N * 4); idTex = dataTex(idBuf, THREE.RGBAFormat);
  selBuf = new Uint8Array(N * N); selTex = dataTex(selBuf, THREE.RedFormat);
  AU.uAtMapA.value = pgA.tex; AU.uAtMapB.value = pgB.tex; AU.uAtMapG.value = pgG.tex;
  AU.uAtId.value = idTex; AU.uAtSelTex.value = selTex;
  res = true;
}

// ---- realm colour indices (terrain ink) ----------------------------------------------------------------
function refreshIds(year) {
  if (!res) return;
  if (!realmReady() || !D.Realm.fillIdTex) { AU.uAtInk.value.w = 0; return; }
  if (!idsDirty && idYear === year) return;
  try { D.Realm.fillIdTex(idBuf, year || undefined); idTex.needsUpdate = true; AU.uAtInk.value.w = 1; idYear = year; idsDirty = false; D.Realm.dirtyRect = null; }
  catch (e) { AU.uAtInk.value.w = 0; console.warn('[atlas] Realm.fillIdTex failed', e); }
}
const cellOf = (x, z) => Math.min(N - 1, Math.max(0, Math.floor(z / 16))) * N + Math.min(N - 1, Math.max(0, Math.floor(x / 16)));
const manorIdxAt = (x, z) => (idBuf ? idBuf[cellOf(x, z) * 4 + 2] : 0);

// =====================================================================================================
// Page painting (time-sliced generators; each yield is a safe stopping point)
// =====================================================================================================
function queue(key, gen, onDone) {
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].key === key && !jobs[i].started) jobs.splice(i, 1);
  jobs.push({ key, gen, onDone, started: false });
}
// the realm id refresh (fillIdTex, its own <= 15 ms cap) as a job, ahead of every paint not yet started
function queueIds() {
  for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].key === 'ids' && !jobs[i].started) jobs.splice(i, 1);
  let at = 0; while (at < jobs.length && jobs[at].started) at++;
  jobs.splice(at, 0, { key: 'ids', gen: (function* () { refreshIds(viewYear()); })(), onDone: null, started: false });
}
function runJobs(budget) {
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < budget) {
    const j = jobs[0]; j.started = true;
    let r;
    try { r = j.gen.next(); } catch (e) { console.warn('[atlas] page paint failed', e); jobs.shift(); continue; }
    if (r.done) { jobs.shift(); try { if (j.onDone) j.onDone(); } catch (e) { console.warn('[atlas]', e); } continue; }
    if (r.value === WAIT) break;
  }
}
const holderId = h => (h && h.holder && typeof h.holder === 'object' ? h.holder.id : h && h.id !== undefined ? h.id : h ? h.holder : null);
const holderName = h => (h && h.holder && typeof h.holder === 'object' ? h.holder.name : (h && (h.name || (typeof h.holder === 'string' ? h.holder : ''))) || 'a lord');
function* prepLordship(info, year) {
  const R = D.Realm;
  if (!realmReady()) { info.unsurveyed = true; return; }
  refreshIds(year);
  info.ids = AU.uAtInk.value.w > 0.5;
  let leg = safe(() => (R.legend ? R.legend(year || undefined) : []) || [], []);
  leg = leg.slice().sort((a, b) => (b.manors || 0) - (a.manors || 0));
  info.legend = leg;
  const top = leg.slice(0, 12);
  // the realm's own holder colours when it offers them (realm.js extras), else our low-chroma reading of its hue
  const rgbOf = (h, i) => { const c = R.holderColor ? safe(() => R.holderColor(holderId(h)), null) : null; return c && c.length >= 3 ? c.map(v => Math.round(v * 255)) : holderRgb(h.hue, i); };
  info.hcol = [null].concat(top.map(rgbOf));
  info.hold = null; info.hgrid = null;
  if (R.fillHolders && R.holderColor) {       // exact: a holder id per cell, every holder in its own colour
    const hg = holdGrid || (holdGrid = new Uint16Array(N * N));
    if (safe(() => (R.fillHolders(hg, year || undefined), true), false)) { info.hgrid = hg; info.hrgb = new Map(); }
    yield;
  } else if (R.maskOf && top.length) {        // contract-only: exact masks for the legend's twelve, tints for the rest
    const hold = info.hold = hold8 || (hold8 = new Uint8Array(N * N)), tmp = tmpMask || (tmpMask = new Uint8Array(N * N));
    hold.fill(0);
    for (let t = 0; t < top.length; t++) {
      const id = holderId(top[t]); if (id === null || id === undefined) continue;
      tmp.fill(0);
      if (safe(() => R.maskOf('honour', id, year || undefined, tmp), false) === false) continue;
      yield;
      for (let j0 = 0; j0 < N; j0 += 128) {     // merge in strips: the page budget is 4 ms a frame
        for (let k = j0 * N, e = (j0 + 128) * N; k < e; k++) if (tmp[k] && !hold[k]) hold[k] = t + 1;
        yield;
      }
    }
  }
  // ghost bounds: dashed on the canvas, DOM date labels for the nearest few
  info.ghosts = [];
  const gs = safe(() => (R.ghosts ? R.ghosts(year || undefined) : []) || [], []);
  for (const g of gs) {
    const lines = polylines(g.pts); if (!lines.length) continue;
    let best = lines[0]; for (const l of lines) if (l.length > best.length) best = l;
    const m = (best.length >> 2) << 1;
    const lab = String(g.label || 'Old bounds'), y1 = g.y1 ? Math.floor(g.y1) : 0;
    info.ghosts.push({ lines, x: best[m], z: best[m + 1], text: y1 && lab.indexOf(String(y1)) < 0 ? `${lab}, to ${y1}` : lab });
  }
}
function* prepRings(info, year) {
  const yg = yearGrid || (yearGrid = new Uint16Array(N * N));
  yg.fill(0);
  const TH = D.Town && D.Town.hist;
  if (TH && TH.fillYearGrid) { yield; safe(() => TH.fillYearGrid(yg)); }
  yield;
  let lo = 1e9, hi = 0;
  for (let j0 = 0; j0 < N; j0 += 128) {        // the min/max scan in strips (page budget)
    for (let k = j0 * N, e = (j0 + 128) * N; k < e; k++) { const y = yg[k]; if (y) { if (y < lo) lo = y; if (y > hi) hi = y; } }
    yield;
  }
  if (!hi) lo = hi = year || 0;
  hi = Math.max(hi, year || 0);
  info.yg = yg; info.y0 = lo; info.y1 = hi;
  AU.uAtYear.value.set(lo, hi, year || 0, 0);
}
function* paint(P, page, year) {
  if (!P.ctx) return;   // no 2D canvas (headless): nothing to paint
  const img = P.img || (P.img = P.ctx.createImageData(N, N)), d = img.data;
  const W = D.W, H = W.h, Wt = W.water, sea = W.seaLevel, Z = W.zone;
  const info = { page, year };
  if (page === 'lordship') yield* prepLordship(info, year);
  else if (page === 'rings') yield* prepRings(info, year);
  yield;
  const ringLUT = new Map();
  for (let j = 0; j < N; j++) {
    let o = j * N * 4;
    for (let i = 0; i < N; i++, o += 4) {
      const v = j * VN + i, h = H[v], wet = h < sea || Wt[v] > h + 0.05, k = j * N + i;
      let r = 255, g = 255, b = 255;
      if (page === 'relief') { const c = HYPSO_LUT[Math.max(0, Math.min(HYPSO_LUT.length - 1, Math.round((wet ? Math.min(h - sea, -1) : h - sea) + 100)))]; r = c[0]; g = c[1]; b = c[2]; }
      else if (wet) { r = 206; g = 222; b = 230; }
      else if (page === 'lordship') {
        if (info.hgrid) {
          const hid = info.hgrid[k];
          if (hid) { let c = info.hrgb.get(hid); if (!c) info.hrgb.set(hid, c = (safe(() => D.Realm.holderColor(hid), null) || [0.8, 0.78, 0.74]).map(x => Math.round(x * 255))); r = c[0]; g = c[1]; b = c[2]; }
        } else if (info.ids) {
          const hi = info.hold ? info.hold[k] : 0;
          if (hi) { const c = info.hcol[hi]; r = c[0]; g = c[1]; b = c[2]; }
          else { const gi = idBuf[k * 4 + 1]; if (gi) { const c = MUTED[gi % MUTED.length]; r = c[0]; g = c[1]; b = c[2]; } }
        }
      } else if (page === 'rings') {
        const y = info.yg[k];
        if (y && (!year || y <= year)) {
          let c = ringLUT.get(y); if (!c) ringLUT.set(y, c = ringColor(y, info.y0, info.y1).map(x => Math.round(x * 255)));
          r = c[0]; g = c[1]; b = c[2];
        } else if (Z && Z[k * 4] && !y) { r = 158; g = 156; b = 150; }
      } else if (page === 'roads') { if (Z && Z[k * 4]) { r = 236; g = 226; b = 206; } }
      else if (page === 'places') { const t = Z ? Z[k * 4] : 0; if (t && ZONE_RGB[t]) { const c = ZONE_RGB[t]; r = c[0]; g = c[1]; b = c[2]; } }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    if ((j & 7) === 7) yield;
  }
  for (let j0 = 0; j0 < N; j0 += 256) { P.ctx.putImageData(img, 0, 0, 0, j0, N, 256); yield; }   // dirty-rect strips
  overlays(P.ctx, page, info, year);
  P.tex.needsUpdate = true; P.page = page; P.year = year; P.ready = true; P.info = info;
}
function overlays(ctx, page, info, year) {
  const s = N / SIZE, R = D.Roads, Y = year || undefined;
  // roads are stamped with FRACTIONAL years (seg.yr / seg.up), so a live (floored) year would hide this year's
  // new roads and show pre-upgrade types: live → no year filter; replay → the fractional view year as painted
  const rY = viewY !== null && viewY !== undefined ? (year || undefined) : undefined;
  const roads = mode => { if (R && R.drawAtlas) safe(() => R.drawAtlas(ctx, s, { mode, year: rY, traffic: D.Wayfarer && D.Wayfarer.traffic })); };
  ctx.save();
  if (page === 'lordship') {
    ctx.strokeStyle = 'rgba(92,88,82,0.85)'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
    for (const g of info.ghosts || []) for (const l of g.lines) {
      ctx.beginPath(); for (let q = 0; q < l.length; q += 2) q ? ctx.lineTo(l[q] * s, l[q + 1] * s) : ctx.moveTo(l[q] * s, l[q + 1] * s); ctx.stroke();
    }
    ctx.setLineDash([]);
    // boundary stones: from the realm (stones set after the view year are left out), else the rendered extras
    const glyph = (x, z) => { ctx.beginPath(); ctx.moveTo(x * s, z * s - 3.5); ctx.lineTo(x * s + 3, z * s + 2); ctx.lineTo(x * s - 3, z * s + 2); ctx.closePath(); ctx.fill(); };
    ctx.fillStyle = '#3a3430';
    const RS = D.Realm && D.Realm.stones ? safe(() => D.Realm.stones(Y), null) : null;
    if (RS) { for (const t of RS) if (t && t.x >= 0) glyph(t.x, t.z); }
    else {
      const st = D.Nature && D.Nature.getExtra ? D.Nature.getExtra('realm:stones') : null, STR = (D.Nature && D.Nature.STRIDE) || 7;
      if (st) for (let q = 0; q + 1 < st.length; q += STR) glyph(st[q], st[q + 1]);
    }
  } else if (page === 'rings') roads('age');
  else if (page === 'roads') roads(D.Wayfarer && D.Wayfarer.traffic && D.Wayfarer.traffic.size ? 'traffic' : 'type');
  else if (page === 'places') {
    roads('type');
    const list = safe(() => (D.Town && D.Town.hist ? D.Town.hist.list() : []) || [], []);
    ctx.fillStyle = '#2e2218'; ctx.strokeStyle = '#2e2218'; ctx.lineWidth = 1.6;
    for (const S of list) {
      if (!(S.x >= 0)) continue;
      const x = S.x * s, z = S.z * s;
      if (S.type === 3) {        // castle: a crenellated tower
        ctx.fillRect(x - 4, z - 3, 8, 7);
        for (let c = 0; c < 3; c++) ctx.fillRect(x - 4 + c * 3, z - 5.5, 2, 2.5);
      } else if (S.type === 4) { // abbey: a cross
        ctx.fillRect(x - 1, z - 6, 2.2, 12); ctx.fillRect(x - 4, z - 3, 8.2, 2.2);
      } else if (S.type === 5) { // harbour: an anchor ring
        ctx.beginPath(); ctx.arc(x, z, 3.2, 0, Math.PI * 2); ctx.stroke(); ctx.fillRect(x - 0.8, z - 6, 1.6, 3);
      }
    }
  }
  ctx.restore();
}
// main page: paint into B, then slide it in (or swap instantly for a refresh)
function requestMain(idx, slideIn) {
  const page = PAGES[idx];
  queue('main', (function* () {
    while (slide) yield WAIT;
    yield* paint(pgB, page, viewYear());
  })(), () => {
    if (slideIn && Atlas.on) startSlide(idx); else swapAB(idx);
  });
}
function requestGlass() {
  const m = Atlas.glass.mode;
  if (!Atlas.glass.show || m === 'living' || PAGES.indexOf(m) < 0) return;
  pgG.ready = pgG.page === m && pgG.ready;
  queue('glass', paint(pgG, m, viewYear()), () => { AU.uAtPage.value.z = PAGES.indexOf(m); });
}
function startSlide(idx) {
  const cam = D.camera;
  let dx = 1, dz = 0;
  if (cam && cam.matrixWorld) { const e = cam.matrixWorld.elements; dx = e[0]; dz = e[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
  AU.uAtPage.value.y = idx; AU.uAtPage.value.w = MIX[PAGES[idx]] || 0.55; AU.uAtSlide.value.set(dx, dz, 0, 0);
  slide = { p: 0, idx };
  Atlas.cur = idx; savePrefs(); domPage(pgB);
}
function swapAB(idx) {
  const t = pgA; pgA = pgB; pgB = t;
  AU.uAtMapA.value = pgA.tex; AU.uAtMapB.value = pgB.tex;
  AU.uAtPage.value.x = idx; AU.uAtPage.value.w = MIX[PAGES[idx]] || 0.55; AU.uAtSlide.value.z = -1; slide = null;
  Atlas.cur = idx;
  AU.uAtInk.value.x = INK[PAGES[idx]];
  domPage(pgA);
}

// =====================================================================================================
// Public API
// =====================================================================================================
Atlas.toggle = function (on) {
  on = on === undefined ? !Atlas.on : !!on;
  if (on === Atlas.on) return Atlas.on;
  if (on) {
    if (D.UI && D.UI.photo && D.UI.exitPhoto) safe(() => D.UI.exitPhoto());
    ensureRes(); ensureDom();
  } else endPull();
  Atlas.on = on;
  startWave(on);
  const vp = vpEl(), app = document.getElementById('app');
  if (vp) vp.classList.toggle('atlas', on);
  if (app) app.classList.toggle('atlas', on);
  if (on) {
    if (PAGES[Atlas.cur] === 'lordship' && (!avail(Atlas.cur) || (!realmReady() && !prefs.page))) Atlas.cur = PAGES.indexOf('places');
    idsDirty = true; regionsDirty = true; queueIds();   // fillIdTex runs as the first job, not on the Shift+M frame
    AU.uAtInk.value.x = INK[PAGES[Atlas.cur]];
    wantPage = Atlas.cur;
    requestMain(Atlas.cur, true);
    fixGlassMode(); requestGlass();
    lastRefreshYear = viewYear();
    domPage(null); domGlass();
    ensureDriver();
  }
  D.emit('atlas:toggle', on);
  return on;
};
Atlas.page = function (i) {
  if (i === undefined) return PAGES[Atlas.cur];
  const from = Atlas.on ? wantPage : Atlas.cur;   // steps count from the last request
  let idx = resolvePage(i, from);
  if (!avail(idx) && (i === 1 || i === -1 || i === '+1' || i === '-1')) idx = resolvePage(i, idx);
  return Atlas.setPage(idx);
};
Atlas.setPage = function (i) {
  const idx = typeof i === 'string' ? PAGES.indexOf(i) : i;
  if (!(idx >= 0 && idx < PAGES.length) || !avail(idx)) return PAGES[Atlas.cur];
  if (!Atlas.on || !res) { Atlas.cur = idx; prefs.page = PAGES[idx]; savePrefs(); return PAGES[idx]; }
  if (idx === wantPage) return PAGES[idx];
  wantPage = idx;
  const painting = jobs.some(j => j.key === 'main' && j.started);
  if (idx !== Atlas.cur || slide || painting) requestMain(idx, true);
  else for (let q = jobs.length - 1; q >= 0; q--) if (jobs[q].key === 'main' && !jobs[q].started) jobs.splice(q, 1);   // back to the page on show
  AU.uAtInk.value.x = Math.max(AU.uAtInk.value.x, INK[PAGES[idx]]);
  prefs.page = PAGES[idx]; savePrefs();
  if (Atlas.glass.mode === PAGES[idx]) { fixGlassMode(); requestGlass(); if (dom) domGlass(); }
  domTabs(idx);
  return PAGES[idx];
};
function startWave(on) {
  const w = wave;
  if (w.run && w.p > 0 && w.p < 1) { w.dir = -w.dir; return; }   // reversed mid-way: run the same wave back (continuous)
  const f = focusXZ();
  w.mode = on ? 0 : 1; w.p = 0; w.dir = 1; w.run = true; w.rmax = waveMax(f.x, f.z);
  AU.uAtFocus.value.set(f.x, f.z, 0, w.mode);
}
function finishExit() {
  AU.uAtGlass.value.w = 0; AU.uAtInk.value.y = 0; AU.uAtSel.value.w = 0; AU.uAtSlide.value.z = -1;
  if (slide) swapAB(slide.idx);
  jobs.length = 0;
}

// ---- per frame -------------------------------------------------------------------------------------------
function tick(dt, camera) {
  lastFrameMs = dt * 1000;
  const active = Atlas.on || Atlas.k > 0 || wave.run;
  if (!active && !jobs.length) return;
  if (wave.run) {
    wave.p = clamp01(wave.p + wave.dir * dt / TUNE.ease);
    const e = ease(wave.p);
    Atlas.k = wave.mode === 0 ? e : 1 - e;
    AU.uAtFocus.value.z = e * wave.rmax;
    if ((wave.dir > 0 && wave.p >= 1) || (wave.dir < 0 && wave.p <= 0)) { wave.run = false; Atlas.k = Atlas.on ? 1 : 0; }
  }
  AU.uAtlas.value = Atlas.k;
  if (!Atlas.on && Atlas.k <= 0) { finishExit(); return; }
  runJobs(lastFrameMs > 25 ? TUNE.paintMs / 2 : TUNE.paintMs);
  if (slide) {
    slide.p = Math.min(1, slide.p + dt / TUNE.slide);
    AU.uAtSlide.value.z = ease(slide.p);
    if (slide.p >= 1) swapAB(slide.idx);
  }
  AU.uAtInk.value.z = (performance.now() / 1000) % 1000;
  // looking glass: recomputed every frame so it matches the DOM ring at any pixel ratio (and during capture)
  const g = Atlas.glass, vp = vpEl();
  if (g.show && Atlas.on && vp) {
    const pr = (D.Post && D.Post.pixelRatio) || 1, mode = g.mode === 'living' ? 1 : (pgG && pgG.ready && pgG.page === g.mode ? 2 : 0);
    const u = glassUniform(g.cx, g.cy, g.r, vp.clientHeight, pr, mode);
    AU.uAtGlass.value.set(u[0], u[1], u[2], u[3]);
  } else AU.uAtGlass.value.w = 0;
  // debounced refresh (realm change, season, replay year, player edits)
  if (refreshT >= 0) { refreshT -= dt; if (refreshT < 0 && Atlas.on) doRefresh(); }
  if (Atlas.on && regionsDirty && (regionsT -= dt) <= 0) { regionsDirty = false; regionsT = 2; queue('regions', sampleRegions()); }
  // labels are re-projected every frame (they must not lag the map); only the candidate lists rebuild at ~8 Hz
  if (Atlas.on) { const rebuild = (domT -= dt) <= 0; if (rebuild) domT = 0.12; domFrame(camera || D.camera, rebuild); }
}
Atlas.update = function (dt, camera) { lastTick = performance.now(); selfLoop = false; tick(dt, camera); };
// if main.js is not calling Atlas.update (older wiring), drive ourselves while anything is moving
function ensureDriver() {
  setTimeout(() => {
    if (performance.now() - lastTick < 400 || selfLoop) return;
    selfLoop = true; let t0 = performance.now();
    const step = now => {
      if (!selfLoop) return;
      const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
      tick(dt, D.camera);
      if (Atlas.on || Atlas.k > 0 || jobs.length) requestAnimationFrame(step); else selfLoop = false;
    };
    requestAnimationFrame(step);
  }, 500);
}
// throttle, not debounce: fires `delay` after the first request, so a stream of seasons (Rapid) still repaints
// `why` 'season' / 'view' mark a clock-only refresh (a new season, a replay scrub): Relief (heights only) needs no repaint
let refreshWhy = new Set();
function bump(delay, why) { refreshT = refreshT >= 0 ? Math.min(refreshT, delay) : delay; refreshWhy.add(why || 'any'); }
function doRefresh() {
  const y = viewYear(), clockOnly = [...refreshWhy].every(w => w === 'season' || w === 'view');
  refreshWhy = new Set();
  if (y !== idYear) idsDirty = true;
  queueIds();
  const still = i => clockOnly && PAGES[i] === 'relief';
  if (!(still(wantPage) && wantPage === Atlas.cur && !slide)) requestMain(wantPage, wantPage !== Atlas.cur);   // never drop a queued page change
  if (!(clockOnly && Atlas.glass.mode === 'relief' && pgG && pgG.ready && pgG.page === 'relief')) requestGlass();
  regionsDirty = true;
  if (y !== lastRefreshYear) { lastRefreshYear = y; domPage(null); }
}
// region name anchors from a 64 x 64 sample of Realm.at (a time-sliced job: 8 rows per slice)
function* sampleRegions() {
  const R = D.Realm; if (!realmReady()) { regions = null; return; }
  const year = viewYear() || undefined;
  if (R.labels) {                              // realm.js extra: exact anchors, no sampling
    const L = safe(() => R.labels(year), null);
    if (L) { const sh = new Map(), mn = new Map(); for (const a of L) (a.level === 'shire' ? sh : a.level === 'manor' ? mn : new Map()).set(a.id, a); regions = { shires: sh, manors: mn }; return; }
  }
  if (!R.at) { regions = null; return; }
  const S = 64, st = SIZE / S, sh = [], mn = [];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = (i + 0.5) * st, z = (j + 0.5) * st;
      const a = safe(() => R.at(x, z, year), null); if (!a) continue;
      if (a.shire) sh.push({ id: a.shire.id, name: a.shire.name, x, z });
      if (a.manor) mn.push({ id: a.manor.id, name: a.manor.name, x, z });
    }
    if ((j & 7) === 7) yield;
  }
  regions = { shires: regionsFrom(sh), manors: regionsFrom(mn) };
}

// =====================================================================================================
// Pull-back through the rings (click)
// =====================================================================================================
let pull = null, cardOn = false;
Atlas.click = function (x, z) {
  if (!Atlas.on || !res) return;
  endPull();
  const tok = pull = { cancelled: false, finish: null };
  Atlas.pulling = true;
  runPull(tok, x, z).catch(e => console.warn('[atlas] pull-back', e)).then(() => { if (pull === tok) Atlas.pulling = false; });
};
Atlas.cancel = function () { const had = Atlas.pulling || cardOn; endPull(); return had; };
function recBB(rec) {
  const c = Math.cos(rec.rot || 0), s = Math.sin(rec.rot || 0), hw = (rec.w || 8) / 2, hd = (rec.d || 8) / 2;
  const ex = Math.abs(c * hw) + Math.abs(s * hd), ez = Math.abs(s * hw) + Math.abs(c * hd);
  return [rec.x - ex, rec.z - ez, rec.x + ex, rec.z + ez];
}
function polyBB(p) {
  if (!p || p.length < 4) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let q = 0; q + 1 < p.length; q += 2) { x0 = Math.min(x0, p[q]); x1 = Math.max(x1, p[q]); z0 = Math.min(z0, p[q + 1]); z1 = Math.max(z1, p[q + 1]); }
  return [x0, z0, x1, z1];
}
// without realm.js: the plot and the settlement only (spec 5.13)
function localRings(x, z, rec) {
  const out = [], T = D.Town, Z = D.W.zone;
  if (rec) {
    const pl = T && T.plotOf ? safe(() => T.plotOf(rec), null) : null;
    out.push({ level: 'plot', id: rec.key || 1, name: 'this plot', caption: 'The plot', bb: (pl && polyBB(pl.poly)) || recBB(rec), pieces: 1, maskHash: 'plot' });
  }
  const sid = Z ? Z[cellOf(x, z) * 4 + 1] : 0;
  const S = sid && T && T.hist && T.hist.info ? safe(() => T.hist.info(sid), null) : null;
  if (S && S.bb) out.push({ level: 'settlement', id: sid, name: S.name, caption: S.name, bb: S.bb, pieces: 1, maskHash: 's' + sid });
  return out;
}
async function runPull(tok, x, z) {
  const T = D.Town, R = D.Realm, year = viewYear();
  const rec = T && T.buildingAt ? safe(() => T.buildingAt(x, z), null) : null;
  let rings = realmReady() && R.rings ? safe(() => R.rings(x, z, rec, year || undefined), null) : null;
  if (!rings || !rings.length) rings = localRings(x, z, rec);
  rings = rings.filter(r => r && r.bb && r.bb.length >= 4);
  if (!rings.length) { caption('Nothing here answers to anyone.'); setTimeout(() => { if (pull === tok) caption(''); }, 2500); return; }
  let manorMask = null;
  for (const r of rings) {
    if (tok.cancelled) return;
    if (r.level === 'plot') setSpot(r.bb);
    else { AU.uAtSel.value.w = 0; selectMask(r, year); if (r.level === 'manor') manorMask = selBuf.slice(); }
    caption(r.caption || r.name || '');
    await fly(r.bb, tok);
  }
  if (tok.cancelled) return;
  caption('');
  showCard(answers(rings), twoFacts(rings, x, z, manorMask));
}
function fly(bb, tok) {
  return new Promise(resolve => {
    const C = D.Cam, f = fitBB(bb, 1.3, (C && C.fov) || 50), dur = 1.1, hold = 1.2;
    let done = false, tm = 0;
    const finish = () => { if (done) return; done = true; clearTimeout(tm); resolve(); };
    tok.finish = finish;
    tm = setTimeout(finish, (dur + hold) * 1000 + 1500);
    // a cancelled fly (keyboard pan/zoom, a Chronicle fly-to, a minimap click...) is the user taking the camera: end the
    // pull there, never jump on to the next ring. The fly is already gone, so endPull must not cancel it again (pulling
    // = false); endPull marks tok cancelled before its own cancelFly, so that path does not come back here either.
    // (a leg already finished by the safety timeout - slow or throttled frames - is cancelled by the NEXT ring's flyPath:
    // that is our own hand-over, not the user's, so it must not end the pull)
    const onDone = cancelled => { if (cancelled && !done && pull === tok && !tok.cancelled) { Atlas.pulling = false; endPull(); } finish(); };
    if (C && C.flyPath) { if (safe(() => (C.flyPath([{ x: f.x, z: f.z, dist: f.dist, dur, hold }], onDone), true), false)) return; }
    if (C && C.focusOn) { C.focusOn(f.x, f.z, f.dist); clearTimeout(tm); tm = setTimeout(finish, (dur + hold) * 1000); }
    else finish();
  });
}
function endPull() {
  if (pull) { pull.cancelled = true; if (pull.finish) pull.finish(); if (Atlas.pulling && D.Cam && D.Cam.cancelFly) safe(() => D.Cam.cancelFly()); }
  pull = null; Atlas.pulling = false;
  AU.uAtInk.value.y = 0; AU.uAtSel.value.w = 0;
  caption(''); hideCard();
}
function setSpot(bb) {
  const r = Math.max(6, Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.55);
  AU.uAtSel.value.set((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, r, 1);
  AU.uAtInk.value.y = 0;
}
function selectMask(r, year) {
  selBuf.fill(0);
  let ok = false;
  if (realmReady() && D.Realm.maskOf) ok = safe(() => D.Realm.maskOf(r.level, r.id, year || undefined, selBuf) !== false, false);
  let any = false;
  for (let k = 0; k < selBuf.length; k++) if (selBuf[k]) { selBuf[k] = 255; any = true; }
  if (!any && r.level === 'settlement') {       // our own fallback: the settlement's zone cells
    const Z = D.W.zone;
    if (Z) for (let k = 0; k < selBuf.length; k++) if (Z[k * 4] && Z[k * 4 + 1] === r.id) { selBuf[k] = 255; any = true; }
  }
  selTex.needsUpdate = true;
  AU.uAtInk.value.y = ok || any ? 1 : 0;
}
function twoFacts(rings, x, z, manorMask) {
  const facts = [], by = l => rings.find(r => r.level === l);
  const hon = by('honour'), set = by('settlement'), shire = by('shire');
  let seat = hon && (hon.seat || (hon.holder && hon.holder.seat));
  const R = D.Realm;
  if (hon && !seat && R && R.holder && R.labels) {   // realm.js extras: the holder's seat manor, located by its label anchor
    const H = safe(() => R.holder(hon.id), null), L = H && H.seatManor ? safe(() => R.labels(viewYear() || undefined), null) : null;
    const a = L && L.find(l => l.level === 'manor' && l.id === H.seatManor);
    if (a) seat = [a.x, a.z];
  }
  if (seat && seat.length >= 2) {
    const km = Math.hypot(seat[0] - x, seat[1] - z) / 1000;
    if (km >= 1) facts.push(`its lord sits ${km < 10 ? km.toFixed(1) : Math.round(km)} km away`);
  }
  if (hon && hon.pieces > 1) facts.push(`it is one of ${words(hon.pieces)} scattered pieces of ${hon.name || 'its honour'}`);
  const TH = D.Town && D.Town.hist;
  if (set && TH && TH.mainStreet && AU.uAtInk.value.w > 0.5) {
    const pts = safe(() => TH.mainStreet(set.id), null);
    if (pts && pts.length >= 4 && streetBorder(pts, manorIdxAt) > 0.3) facts.push('the border runs down its high street');
  }
  const ev = manorMask ? manorEvent(manorMask) : null; if (ev) facts.push(ev);
  if (facts.length < 2 && shire && shire.name) facts.push(`it lies in ${shire.name}`);
  if (facts.length < 2 && set && set.name) facts.push(`it belongs to ${set.name}`);
  return facts.slice(0, 2).map(cap);
}
function manorEvent(mask) {
  const S = D.Story; if (!S || !S.events) return null;
  const ev = safe(() => S.events(), null); if (!ev || !ev.length) return null;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i], arr = Array.isArray(e);
    const k = arr ? e[1] : e.k, x = arr ? e[2] : e.x, z = arr ? e[3] : e.z, q = arr ? e[0] : e.q;
    if (!LAND_EVENT[k] || !(x > 0 || z > 0) || !mask[cellOf(x, z)]) continue;
    const y = e.y || (q >> 2);
    return landPhrase(k, y);
  }
  return null;
}

// =====================================================================================================
// DOM: cartouche, legend, region names, looking glass, caption, card
// =====================================================================================================
const CSS = `
#atlas-cart, #atlas-legend, #atlas-cap, #atlas-card { font-family: Georgia, 'Times New Roman', serif; color: #3a2816; }
#atlas-cart { position: absolute; left: 12px; top: 12px; z-index: 18; width: min(440px, calc(100% - 24px)); box-sizing: border-box; padding: 10px 14px 9px;
  background: linear-gradient(#f7eed6, #ead9b2); border: 1px solid #7a5a32; border-radius: 2px; user-select: none; display: none;
  box-shadow: 0 0 0 3px #f3e6c6, 0 0 0 4px #7a5a32, 0 8px 20px rgba(0,0,0,.35); }
#viewport.atlas #atlas-cart, #viewport.atlas #atlas-legend { display: block; }
#atlas-cart .ac-top { display: flex; gap: 10px; align-items: center; }
#atlas-cart .ac-rose { flex: 0 0 46px; width: 46px; height: 46px; }
#atlas-cart .ac-rose g { transition: transform .15s linear; transform-origin: 23px 23px; }
#atlas-cart .ac-titles { flex: 1; min-width: 0; }
#atlas-cart .ac-title { font-size: 12.5px; letter-spacing: .12em; line-height: 1.3; font-weight: bold; }
#atlas-cart .ac-sub { font-size: 11.5px; font-style: italic; opacity: .8; margin-top: 2px; }
#atlas-cart .ac-x { flex: 0 0 auto; align-self: flex-start; background: none; border: 1px solid #7a5a32; color: #3a2816; width: 22px; height: 22px;
  border-radius: 50%; cursor: pointer; font: 14px/18px Georgia, serif; padding: 0; }
#atlas-cart .ac-x:hover { background: #7a5a32; color: #f7eed6; }
#atlas-cart .ac-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 6px; }
#atlas-cart .ac-tab { font: 11.5px Georgia, serif; color: #3a2816; background: rgba(255,250,236,.6); border: 1px solid #b09060; border-radius: 2px;
  padding: 3px 7px; cursor: pointer; }
#atlas-cart .ac-tab:hover { background: #fff8e6; }
#atlas-cart .ac-tab.on { background: #7a5a32; color: #f7eed6; border-color: #5a3e1e; }
#atlas-cart .ac-tab.dim { opacity: .55; }
#atlas-cart .ac-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
#atlas-cart .ac-scale { font-size: 10.5px; font-style: italic; }
#atlas-cart .ac-bar { height: 5px; border: 1px solid #3a2816; border-top: 0; background: repeating-linear-gradient(90deg, #3a2816 0 25%, transparent 25% 50%); margin-bottom: 2px; width: 60px; }
#atlas-cart .ac-glassbtn { font: 11px Georgia, serif; color: #3a2816; background: none; border: 1px solid #b09060; border-radius: 12px; padding: 2px 9px; cursor: pointer; }
#atlas-cart .ac-glassbtn.on { background: #b8862e; color: #fff8e6; border-color: #7a5418; }
#atlas-cart .ac-note { font-size: 11.5px; font-style: italic; margin-top: 6px; color: #7a2a18; }
#atlas-cart .ac-note:empty { display: none; }
#atlas-legend { position: absolute; left: 12px; bottom: 14px; z-index: 18; max-width: 270px; padding: 8px 11px; display: none; user-select: none;
  background: rgba(247,238,214,.93); border: 1px solid #7a5a32; border-radius: 2px; box-shadow: 0 4px 14px rgba(0,0,0,.28); font-size: 11.5px; }
#atlas-legend .al-h { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 4px; }
#atlas-legend .al-row { display: flex; align-items: center; gap: 6px; line-height: 1.5; }
#atlas-legend .al-sw { flex: 0 0 18px; height: 10px; border: 1px solid rgba(58,40,22,.6); }
#atlas-legend .al-sw.line { height: 0; border: 0; border-top: 3px solid #3a2816; }
#atlas-legend .al-n { opacity: .7; font-style: italic; margin-left: auto; padding-left: 6px; }
#atlas-legend .al-call { margin-top: 5px; font-style: italic; color: #7a2a18; }
#atlas-legend .al-call:empty { display: none; }
#atlas-names { position: absolute; inset: 0; z-index: 12; pointer-events: none; overflow: hidden; display: none; }
#viewport.atlas #atlas-names { display: block; }
#atlas-names span { position: absolute; left: 0; top: 0; white-space: nowrap; font-family: Georgia, 'Times New Roman', serif; color: #3a2816;
  text-shadow: 0 0 3px rgba(250,244,228,.95), 0 1px 0 rgba(250,244,228,.9); will-change: transform; }
#atlas-names .an-shire { font-size: 17px; letter-spacing: .32em; text-transform: uppercase; font-weight: bold; color: #4a3018; }
#atlas-names .an-manor { font-size: 12px; font-style: italic; letter-spacing: .04em; }
#atlas-names .an-ghost { font-size: 10.5px; font-style: italic; color: #5a5650; }
#atlas-glass { position: absolute; left: 0; top: 0; z-index: 19; pointer-events: none; display: none; }
#viewport.atlas #atlas-glass.show { display: block; }
#atlas-glass svg { position: absolute; overflow: visible; pointer-events: none; }
#atlas-glass .ag-ring { pointer-events: stroke; cursor: grab; }
#atlas-glass .ag-handle { position: absolute; pointer-events: auto; cursor: pointer; transform: translate(-50%, -100%); white-space: nowrap;
  font: 11px Georgia, serif; color: #3a2210; background: linear-gradient(#f3d58a, #b8862e); border: 1px solid #6a4410; border-radius: 9px 9px 3px 3px;
  padding: 2px 10px; box-shadow: 0 2px 5px rgba(0,0,0,.35); user-select: none; }
#atlas-glass .ag-knob { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; pointer-events: auto; cursor: nwse-resize;
  background: radial-gradient(circle at 35% 35%, #fbe6a8, #b8862e 60%, #6a4410); border: 1px solid #5a3a0e; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
#atlas-cap { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 18; pointer-events: none; font-size: 16px; font-style: italic;
  letter-spacing: .04em; padding: 4px 14px; background: rgba(247,238,214,.88); border: 1px solid #7a5a32; border-radius: 2px; display: none; }
#viewport.atlas #atlas-cap.show { display: block; }
#atlas-card { position: absolute; left: 50%; bottom: 72px; transform: translateX(-50%); z-index: 19; width: min(460px, calc(100% - 40px)); box-sizing: border-box;
  padding: 14px 18px 10px; background: linear-gradient(#f7eed6, #ead9b2); border: 1px solid #7a5a32; border-radius: 2px; cursor: pointer; display: none;
  box-shadow: 0 0 0 3px #f3e6c6, 0 0 0 4px #7a5a32, 0 10px 26px rgba(0,0,0,.4); }
#viewport.atlas #atlas-card.show { display: block; }
#atlas-card .acd-h { font-size: 17px; line-height: 1.35; }
#atlas-card ul { margin: 8px 0 4px; padding-left: 18px; font-size: 13px; font-style: italic; }
#atlas-card .acd-f { font-size: 10.5px; opacity: .65; text-align: right; }
/* settlement labels restyled as engraved serif caps (classes owned by town.js) */
#viewport.atlas #town-labels .tl, #viewport.atlas .tl-label { background: transparent !important; border-color: transparent !important; box-shadow: none !important;
  color: #2e2014 !important; font-family: Georgia, 'Times New Roman', serif !important; text-transform: uppercase; letter-spacing: .14em;
  text-shadow: 0 0 3px rgba(250,244,228,.95), 0 1px 0 rgba(250,244,228,.9) !important; }
#viewport.atlas #town-labels .tl em, #viewport.atlas .tl-label em { display: none; }
`;
let dom = null;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROSE = `<svg class="ac-rose" viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" fill="none" stroke="#7a5a32" stroke-width="1"/>
<circle cx="23" cy="23" r="17.5" fill="none" stroke="#7a5a32" stroke-width=".6" stroke-dasharray="1.2 1.8"/><g>
<path d="M23 3 L26 20 L23 23 L20 20Z" fill="#3a2816"/><path d="M23 43 L26 26 L23 23 L20 26Z" fill="#b09060"/>
<path d="M3 23 L20 20 L23 23 L20 26Z" fill="#b09060"/><path d="M43 23 L26 20 L23 23 L26 26Z" fill="#b09060"/>
<text x="23" y="10.5" font-size="7" text-anchor="middle" fill="#f7eed6" font-family="Georgia,serif">N</text></g></svg>`;
function ensureDom() {
  if (dom) return dom;
  const vp = vpEl(); if (!vp) return null;
  if (!document.getElementById('atlas-css')) { const st = el('style'); st.id = 'atlas-css'; st.textContent = CSS; document.head.appendChild(st); }
  const stop = e => e.stopPropagation();
  const cart = el('div'); cart.id = 'atlas-cart';
  cart.innerHTML = `<div class="ac-top">${ROSE}<div class="ac-titles"><div class="ac-title"></div><div class="ac-sub"></div></div>
    <button class="ac-x" title="Leave the Atlas table (Esc)">&times;</button></div><div class="ac-tabs"></div>
    <div class="ac-foot"><div class="ac-scale"><div class="ac-bar"></div><span></span></div><button class="ac-glassbtn" title="A brass looking glass: another page, or the living world, seen through a circle">&#9711; Looking glass</button></div>
    <div class="ac-note"></div>`;
  const tabs = cart.querySelector('.ac-tabs');
  PAGES.forEach((p, i) => { const b = el('button', 'ac-tab', esc(PAGE_LABEL[p])); b.title = PAGE_Q[p]; b.onclick = () => Atlas.setPage(i); tabs.appendChild(b); });
  cart.querySelector('.ac-x').onclick = () => Atlas.toggle(false);
  cart.querySelector('.ac-glassbtn').onclick = () => setGlass(!Atlas.glass.show);
  ['pointerdown', 'wheel', 'dblclick'].forEach(t => cart.addEventListener(t, stop));
  const legend = el('div'); legend.id = 'atlas-legend';
  legend.innerHTML = '<div class="al-h"></div><div class="al-rows"></div><div class="al-call"></div>';
  ['pointerdown', 'wheel'].forEach(t => legend.addEventListener(t, stop));
  const names = el('div'); names.id = 'atlas-names';
  const glass = el('div'); glass.id = 'atlas-glass';
  glass.innerHTML = `<svg><defs><linearGradient id="ag-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc96"/><stop offset=".42" stop-color="#b8862e"/>
    <stop offset=".62" stop-color="#ecc870"/><stop offset="1" stop-color="#6a4410"/></linearGradient></defs>
    <circle class="ag-outer" fill="none" stroke="#5a3a0e" stroke-width="1"/><circle class="ag-ring" fill="none" stroke="url(#ag-brass)" stroke-width="14"/>
    <circle class="ag-inner" fill="none" stroke="#3a2610" stroke-width="1.2"/></svg><div class="ag-handle"></div><div class="ag-knob"></div>`;
  const cap = el('div'); cap.id = 'atlas-cap';
  const card = el('div'); card.id = 'atlas-card';
  card.addEventListener('pointerdown', stop);
  card.onclick = () => endPull();
  [cart, legend, names, glass, cap, card].forEach(e => vp.appendChild(e));
  dom = { vp, cart, tabs, title: cart.querySelector('.ac-title'), sub: cart.querySelector('.ac-sub'), rose: cart.querySelector('.ac-rose g'),
    bar: cart.querySelector('.ac-bar'), barLab: cart.querySelector('.ac-scale span'), gbtn: cart.querySelector('.ac-glassbtn'), note: cart.querySelector('.ac-note'),
    legend, lh: legend.querySelector('.al-h'), lrows: legend.querySelector('.al-rows'), lcall: legend.querySelector('.al-call'),
    names, nameEls: new Map(), glass, gsvg: glass.querySelector('svg'), handle: glass.querySelector('.ag-handle'), knob: glass.querySelector('.ag-knob'), cap, card };
  wireGlass();
  // a running pull-back owns Esc first (the tools.js cascade then exits replay / the Atlas on the next press)
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !(Atlas.pulling || cardOn)) return;
    e.preventDefault(); e.stopImmediatePropagation(); endPull();
  }, true);
  // any camera handling of the user's own ends a pull-back (the fly is cancelled by the camera anyway)
  const cv = document.getElementById('c');
  if (cv) { const cut = () => { if (Atlas.pulling) endPull(); }; cv.addEventListener('wheel', cut, { passive: true }); cv.addEventListener('pointerdown', cut); }
  domTabs(Atlas.cur);
  return dom;
}
function domTabs(idx) {
  if (!dom) return;
  Array.from(dom.tabs.children).forEach((b, i) => {
    b.classList.toggle('on', i === idx);
    b.style.display = avail(i) ? '' : 'none';
    const dim = PAGES[i] === 'lordship' && !realmReady();
    b.classList.toggle('dim', dim);
    b.title = dim ? UNSURVEYED : PAGE_Q[PAGES[i]];
  });
}
// title, note, tabs and legend for the page now showing (P = the painted slot, or null to keep the legend)
function domPage(P) {
  if (!dom) return;
  const page = PAGES[Atlas.cur], y = viewYear();
  dom.title.textContent = pageTitle(page, D.W && D.W.name, y);
  dom.sub.textContent = PAGE_Q[page] + (viewY !== null && viewY !== undefined ? ' · as it stood in ' + Math.floor(viewY) : '');
  dom.note.textContent = page === 'lordship' && !realmReady() ? UNSURVEYED : '';
  domTabs(Atlas.cur);
  if (P && P.info) legend(P.info);
}
function legend(info) {
  const rows = [], row = (sw, name, n) => rows.push(`<div class="al-row">${sw}<span>${esc(name)}</span>${n ? `<span class="al-n">${esc(n)}</span>` : ''}</div>`);
  const sw = c => `<span class="al-sw" style="background:rgb(${c.map(Math.round).join(',')})"></span>`;
  let head = PAGE_LABEL[info.page], call = '';
  if (info.page === 'lordship') {
    if (info.unsurveyed) { head = 'Lordship'; call = UNSURVEYED; }
    else {
      const leg = info.legend || [];
      leg.slice(0, 12).forEach((h, i) => row(sw(info.hcol[i + 1] || MUTED[0]), holderName(h), h.manors ? `${h.manors} manor${h.manors === 1 ? '' : 's'}` : ''));
      if (leg.length > 12) rows.push(`<div class="al-row"><span class="al-sw" style="background:rgb(${MUTED[0].join(',')})"></span><span>and ${leg.length - 12} others</span></div>`);
      let most = null; for (const h of leg.slice(0, 12)) if ((h.pieces || 0) > (most ? most.pieces : 2)) most = h;
      if (most) call = `The lands of ${holderName(most)} lie in ${words(most.pieces)} pieces.`;
      head = 'Holders of the land';
    }
  } else if (info.page === 'rings') {
    const c0 = Math.floor((info.y0 || 0) / 100), c1 = Math.max(Math.floor((info.y1 || 0) / 100), c0);
    if (info.y1 > 0) for (let c = c0; c <= c1 && rows.length < 10; c++) row(sw(ringColor(c * 100 + 50, info.y0, info.y1).map(v => v * 255)), `${c * 100}s`);
    row(sw(RING_UNKNOWN.map(v => v * 255)), 'Before the chronicle / unknown');
    head = 'Built in';
  } else if (info.page === 'roads') {
    rows.push('<div class="al-row"><span class="al-sw line"></span><span>Line weight shows the traffic</span></div>');
    rows.push('<div class="al-row"><span class="al-sw" style="background:#e9c46a;border-radius:50%;width:10px;flex-basis:10px"></span><span>Great bridges</span></div>');
    head = 'Roads & traffic';
  } else if (info.page === 'places') {
    for (let t = 1; t <= 5; t++) row(sw(ZONE_RGB[t]), ZONE_NAME[t]);
    head = 'Places';
  } else {
    for (const [h, lab] of [[-20, 'Water'], [20, 'Lowland'], [180, 'Downs'], [400, 'Upland'], [800, 'Fell'], [1400, 'Snow']]) row(sw(hypso(h)), lab);
    call = 'Contours every 10 m, bold every 50 m.';
    head = 'Height above the sea';
  }
  dom.lh.textContent = head; dom.lrows.innerHTML = rows.join(''); dom.lcall.textContent = call;
}
function caption(t) { if (!dom) return; dom.cap.textContent = t || ''; dom.cap.classList.toggle('show', !!t); }
function showCard(head, facts) {
  if (!dom) return;
  dom.card.innerHTML = `<div class="acd-h">${esc(head)}</div>${facts.length ? '<ul>' + facts.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>' : ''}<div class="acd-f">Click or press Esc to close</div>`;
  dom.card.classList.add('show'); cardOn = true;
}
function hideCard() { cardOn = false; if (dom) dom.card.classList.remove('show'); }
// ---- per-frame DOM: compass, scale bar, region names, ghost date labels ----------------------------------------
const v3 = typeof THREE !== 'undefined' && THREE.Vector3 ? new THREE.Vector3() : null;
function project(x, y, z, cam, W, H) {
  v3.set(x, y, z).project(cam);
  if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) return null;
  return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H];
}
let domList = [];   // label candidates { key, cls, text, x, y, z, kind: s|m|g }, rebuilt at ~8 Hz; positions are per frame
function domFrame(cam, rebuild) {
  if (!dom || !cam || !v3) return;
  const C = D.Cam, W = dom.vp.clientWidth || 1, H = dom.vp.clientHeight || 1;
  const hAt = (x, z) => (D.Terrain ? D.Terrain.hAt(D.clamp(x, 0, SIZE), D.clamp(z, 0, SIZE)) : 0);
  if (C && dom.rose) dom.rose.style.transform = `rotate(${((C.yaw || 0) * 180 / Math.PI).toFixed(1)}deg)`;
  // scale bar: metres per CSS pixel across the focus
  const f = focusXZ(), fy = hAt(f.x, f.z);
  const e = cam.matrixWorld.elements, rx = e[0], rz = e[2], rl = Math.hypot(rx, rz) || 1;
  const a = project(f.x, fy, f.z, cam, W, H), b = project(f.x + rx / rl * 500, fy, f.z + rz / rl * 500, cam, W, H);
  const lb = a && b ? leagueBar(500 / Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]))) : null;
  if (lb) { dom.bar.style.width = lb.px.toFixed(0) + 'px'; dom.barLab.textContent = lb.label; }
  const dist = C && C.distance ? C.distance() : 5000;
  if (rebuild) {   // candidates: every shire, the 40 manors nearest the focus (close in), the 12 nearest ghost date labels
    const L = [], add = (key, cls, text, x, z, kind) => L.push({ key, cls, text, x, z, y: hAt(x, z) + 25, kind });
    if (regions) {
      regions.shires.forEach(r => add('s' + r.id, 'an-shire', r.name, r.x, r.z, 's'));
      if (dist < 4500) {
        const near = []; regions.manors.forEach(r => { const d = Math.hypot(r.x - f.x, r.z - f.z); if (d < dist * 2.2) near.push([d, r]); });
        near.sort((p, q) => p[0] - q[0]);
        for (const [, r] of near.slice(0, 40)) add('m' + r.id, 'an-manor', r.name, r.x, r.z, 'm');
      }
    }
    const info = pgA && pgA.info;
    if (info && info.page === 'lordship' && !slide && info.ghosts && info.ghosts.length && dist < 9000) {
      const gs = info.ghosts.map(g => [Math.hypot(g.x - f.x, g.z - f.z), g]).sort((p, q) => p[0] - q[0]).slice(0, 12);
      gs.forEach(([, g], i) => add('g' + i + ':' + g.text, 'an-ghost', g.text, g.x, g.z, 'g'));
    }
    domList = L;
    const keep = new Set(L.map(c => c.key));
    dom.nameEls.forEach((s, k) => { if (!keep.has(k)) { if (k.charAt(0) === 'g') { s.remove(); dom.nameEls.delete(k); } else s.style.display = 'none'; } });
  }
  // shires from far away, manors close in (opacity follows the live distance every frame)
  const so = D.smooth(8000, 9000, dist), mo = 1 - D.smooth(3500, 4000, dist);
  for (const c of domList) {
    const op = c.kind === 's' ? so : c.kind === 'm' ? mo : 0.9;
    let s = dom.nameEls.get(c.key);
    const p = op >= 0.02 ? project(c.x, c.y, c.z, cam, W, H) : null;
    if (!p) { if (s && s.style.display !== 'none') s.style.display = 'none'; continue; }
    if (!s) { s = el('span', c.cls); dom.names.appendChild(s); dom.nameEls.set(c.key, s); }
    if (s._t !== c.text) { s.textContent = c.text; s._t = c.text; }
    s.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) translate(-50%, -50%)`;
    const o = op.toFixed(2); if (s._o !== o) { s.style.opacity = o; s._o = o; }
    if (s.style.display) s.style.display = '';
  }
}

// ---- looking glass ---------------------------------------------------------------------------------------
function glassModes() { return ['living'].concat(PAGES.filter((p, i) => p !== PAGES[Atlas.cur] && avail(i))); }
function fixGlassMode() {
  const g = Atlas.glass;
  if (g.mode === 'living') return;
  if (PAGES.indexOf(g.mode) < 0 || g.mode === PAGES[Atlas.cur] || !avail(PAGES.indexOf(g.mode))) g.mode = PAGES[Atlas.cur] !== 'rings' ? 'rings' : avail(0) ? 'lordship' : 'relief';
}
function setGlass(show) {
  const g = Atlas.glass;
  g.show = !!show;
  if (g.show) { fixGlassMode(); if (res) requestGlass(); }
  prefs.glass = g.show; savePrefs(); domGlass();
}
function domGlass() {
  if (!dom) return;
  const g = Atlas.glass, vp = dom.vp, W = vp.clientWidth || 800, H = vp.clientHeight || 600;
  g.r = D.clamp(g.r || TUNE.glassR, 50, Math.max(60, Math.min(W, H) * 0.45));
  if (!(g.cx >= 0) || !(g.cy >= 0)) { g.cx = W - g.r - 48; g.cy = H - g.r - 70; }
  g.cx = D.clamp(g.cx, g.r * 0.3, W - g.r * 0.3); g.cy = D.clamp(g.cy, g.r * 0.3, H - g.r * 0.3);
  dom.glass.classList.toggle('show', g.show);
  dom.gbtn.classList.toggle('on', g.show);
  const pad = 20, S = (g.r + pad) * 2, svg = dom.gsvg;
  svg.setAttribute('width', S); svg.setAttribute('height', S); svg.setAttribute('viewBox', `0 0 ${S} ${S}`);
  svg.style.left = (g.cx - g.r - pad) + 'px'; svg.style.top = (g.cy - g.r - pad) + 'px';
  const c = g.r + pad;
  svg.querySelectorAll('circle').forEach(ci => { ci.setAttribute('cx', c); ci.setAttribute('cy', c); });
  svg.querySelector('.ag-inner').setAttribute('r', g.r + 0.6);
  svg.querySelector('.ag-ring').setAttribute('r', g.r + 7.5);
  svg.querySelector('.ag-outer').setAttribute('r', g.r + 14.5);
  dom.handle.style.left = g.cx + 'px'; dom.handle.style.top = (g.cy - g.r - 13) + 'px';
  dom.handle.textContent = (g.mode === 'living' ? 'Living world' : PAGE_LABEL[g.mode]) + ' ▸';
  dom.handle.title = 'Click to show another page through the glass';
  const a = Math.PI / 4;
  dom.knob.style.left = (g.cx + Math.cos(a) * (g.r + 7.5)) + 'px'; dom.knob.style.top = (g.cy + Math.sin(a) * (g.r + 7.5)) + 'px';
}
function wireGlass() {
  const g = Atlas.glass, vpRect = () => dom.vp.getBoundingClientRect();
  const drag = (target, onMove) => {
    target.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { target.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      const mv = ev => { const r = vpRect(); onMove(ev.clientX - r.left, ev.clientY - r.top); domGlass(); };
      const up = () => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); savePrefs(); };
      target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
      target._grab = [e.clientX - vpRect().left - g.cx, e.clientY - vpRect().top - g.cy];
    });
  };
  const ring = dom.gsvg.querySelector('.ag-ring');
  drag(ring, (x, y) => { g.cx = x - ring._grab[0]; g.cy = y - ring._grab[1]; });
  drag(dom.knob, (x, y) => { g.r = Math.hypot(x - g.cx, y - g.cy) - 7.5; });
  dom.handle.addEventListener('pointerdown', e => e.stopPropagation());
  dom.handle.addEventListener('click', e => {
    e.stopPropagation();
    const m = glassModes(), i = m.indexOf(g.mode);
    g.mode = m[(i + 1) % m.length];
    prefs.glassMode = g.mode; savePrefs();
    requestGlass(); domGlass();
  });
}

// ---- per-viewer prefs (a convenience only; nothing depends on them) -----------------------------------------
let prefs = {};
function loadPrefs() {
  try { prefs = JSON.parse(localStorage.getItem('diorama-atlas') || '{}') || {}; } catch (e) { prefs = {}; }
  const i = PAGES.indexOf(prefs.page); if (i >= 0) Atlas.cur = i;
  const g = Atlas.glass;
  if (typeof prefs.glass === 'boolean') g.show = prefs.glass;
  if (prefs.glassMode && (prefs.glassMode === 'living' || PAGES.indexOf(prefs.glassMode) >= 0)) g.mode = prefs.glassMode;
  if (prefs.gr > 0) g.r = prefs.gr;
  if (prefs.gx >= 0 && prefs.gy >= 0) { g.cx = prefs.gx; g.cy = prefs.gy; }
}
function savePrefs() {
  const g = Atlas.glass;
  prefs.gx = Math.round(g.cx); prefs.gy = Math.round(g.cy); prefs.gr = Math.round(g.r);
  try { localStorage.setItem('diorama-atlas', JSON.stringify(prefs)); } catch (e) { /* private window: fine */ }
}

// =====================================================================================================
// Init and event wiring
// =====================================================================================================
let inited = false;
Atlas.init = function () {
  if (inited) return; inited = true;
  loadPrefs();
  console.info('[atlas] tune', JSON.stringify(TUNE));
  const live = fn => (...a) => { if (Atlas.on) fn(...a); };
  D.on('ui:ready', () => ensureDom());
  D.on('realm:changed', () => { idsDirty = true; regionsDirty = true; if (Atlas.on) bump(TUNE.idDebounce); });
  D.on('story:season', live(() => bump(TUNE.idDebounce, 'season')));
  D.on('story:view', Y => { viewY = Y === null || Y === undefined ? null : Y; idsDirty = true; if (Atlas.on) bump(1.0, 'view'); });
  D.on('story:restored', () => { idsDirty = true; regionsDirty = true; if (Atlas.on) bump(0.3); });
  D.on('story:begin', () => { idsDirty = true; regionsDirty = true; if (Atlas.on) bump(0.5); });
  D.on('roads:rebuilt', live(() => bump(2)));
  D.on('stroke:end', live(() => bump(2)));
  D.on('terrain:all', () => { idsDirty = true; regionsDirty = true; if (Atlas.on) bump(0.3); });
  D.on('world:reset', () => { idsDirty = true; regions = null; if (Atlas.on) bump(0.3); });
  D.on('resize', () => { if (dom) domGlass(); });
};
Atlas._dev = {
  // paint a page synchronously into the shown slot (for inspection in the console)
  paintNow(page) { ensureRes(); const idx = resolvePage(page === undefined ? Atlas.cur : page, Atlas.cur); const g = paint(pgB, PAGES[idx], viewYear()); while (!g.next().done); swapAB(idx); return PAGES[idx]; },
  state() { return { on: Atlas.on, k: Atlas.k, cur: PAGES[Atlas.cur], jobs: jobs.map(j => j.key), slide: slide && slide.p, wave: Object.assign({}, wave), ids: AU.uAtInk.value.w, glass: Object.assign({}, Atlas.glass) }; },
  paintGen(P, page, year) { return paint(P, page, year); },   // tests: drive a paint into a stub slot
  canvases() { return { A: pgA && pgA.cv, B: pgB && pgB.cv, G: pgG && pgG.cv }; },
  setK(k) { Atlas.k = clamp01(k); AU.uAtlas.value = Atlas.k; }
};
})();
