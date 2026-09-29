// E2 "Atlas table": uniforms/GLSL contract, the atlas.js pure helpers, page painting, the drain state machine,
// the pull-back ring order, and the nature/water/post hooks. (Shader compilation: dev/tests/glsl-check.js.)
import { load, test, assert, eq, near } from './harness.js';

const N = 1024, SIZE = 16384;
const AU_NAMES = ['uAtlas', 'uAtFocus', 'uAtMapA', 'uAtMapB', 'uAtMapG', 'uAtSlide', 'uAtGlass', 'uAtId', 'uAtSelTex', 'uAtSel', 'uAtInk', 'uAtPage', 'uAtYear'];
const atlasD = () => load(['js/core.js', 'js/terrain.js', 'js/atlas.js']);

// ---- contract: D.AU / D.GLSL_ATLAS (spec 5.11) ------------------------------------------------------
test('terrain.js ships D.AU with every 5.11 uniform, merged by reference into TU', () => {
  const D = load(['js/core.js', 'js/terrain.js']);
  for (const n of AU_NAMES) { assert(D.AU[n] && 'value' in D.AU[n], 'missing ' + n); assert(D.TU[n] === D.AU[n], n + ' not shared with TU'); }
  eq(D.AU.uAtlas.value, 0, 'atlas starts off');
});
test('D.GLSL_ATLAS declares the uniforms and the six public helpers, never redefining d_*', () => {
  const D = load(['js/core.js', 'js/terrain.js']);
  const g = D.GLSL_ATLAS;
  for (const n of AU_NAMES) assert(new RegExp('uniform \\w+ ' + n + ';').test(g), 'uniform ' + n);
  for (const sig of ['float at_k(vec2 xz)', 'vec3 at_pageCol(vec2 xz)', 'vec3 at_surface(vec3 c, vec2 xz)', 'vec3 at_surfaceLin(vec3 c, vec2 xz, float year)',
    'vec3 at_emis(vec2 xz, float ny)', 'vec3 at_ink(vec3 c, vec2 xz, float gpx, float gEdge)']) assert(g.includes(sig), 'signature ' + sig);
  assert(!/\bd_(hash12|vnoise|fbm)\s*\(/.test(g.replace(/\/\/[^\n]*/g, '')), 'must not define or call d_* (not every material has GLSL_NOISE)');
  const defs = [...g.matchAll(/^\s*(?:float|vec[234]|bool|void)\s+(\w+)\s*\(/gm)].map(m => m[1]);
  assert(defs.length >= 10 && defs.every(n => n.startsWith('at_')), 'helpers must be at_-prefixed: ' + defs.filter(n => !n.startsWith('at_')));
  assert(/if \(uAtlas < 0\.001\) return 0\.0;/.test(g), 'at_k is exact 0 while the atlas is off');
});
test('terrain shader: atlas block is gated, sits before the neatline, and the biome block is skipped at full plaster', () => {
  const src = Deno.readTextFileSync(new URL('../../js/terrain.js', import.meta.url)).replace(/\r\n/g, '\n');
  const shade = src.slice(src.indexOf('void terrainShade'));
  const iGate = shade.indexOf('if (uAtlas > 0.001) {'), iEdge = shade.indexOf('col = edgeApply('), iOver = shade.indexOf('// ---- editor overlays');
  assert(iGate > 0 && iGate < iEdge && iEdge < iOver, 'atlas ink under the neatline and every editor overlay');
  assert(shade.indexOf('if (uAtlas < 0.999 || at_live() > 0.0) {') > 0 && shade.includes('} else { col = vec3(0.8); rough = 0.95; }'), 'biome skip');
  assert(shade.indexOf('bool gHave = gdFetch(') < shade.indexOf('if (uAtlas < 0.999'), 'gdFetch hoisted above the skipped block');
  assert(src.includes('${D.GLSL_EDGE}\n${D.GLSL_ATLAS}'), 'GLSL_ATLAS injected right after GLSL_EDGE');
});

// ---- optional module ------------------------------------------------------------------------------------
test('atlas.js is optional: without D.AU it defines nothing and does not throw', () => {
  const D = load(['js/core.js', 'js/atlas.js']);
  assert(D.Atlas === undefined);
});
test('atlas.js exposes the 5.11 API', () => {
  const D = atlasD(), A = D.Atlas;
  eq(A.PAGES, ['lordship', 'rings', 'roads', 'places', 'relief']);
  for (const f of ['toggle', 'page', 'click', 'update', 'init', 'cancel', 'setPage']) assert(typeof A[f] === 'function', f);
  eq([A.on, A.k], [false, 0]);
  A.init();
  A.update(0.016, null); eq(D.AU.uAtlas.value, 0, 'idle update leaves the uniform alone');
});

test('without realm.js the Lordship page is dropped from stepping and from setPage', () => {
  const D = atlasD(), A = D.Atlas; A.init();
  A.setPage('relief'); eq(A.page(), 'relief');
  A.page(1); eq(A.page(), 'rings', 'PageDown steps over Lordship');
  eq(A.setPage('lordship'), 'rings', 'refused');
  A.page(-1); eq(A.page(), 'relief');
  D.Realm = { ready: false }; eq(A.setPage('lordship'), 'relief', 'realm.js without story.js: still dropped (no ▶, the realm can never survey)');
  D.Story = { started: false }; eq(A.setPage('lordship'), 'lordship', 'offered (with its "not yet surveyed" note) once realm.js and story.js are loaded');
});

// ---- pure helpers ---------------------------------------------------------------------------------------
test('ringColor mirrors at_ring: oldest century sepia, newest pale gold, unknown grey', () => {
  const P = atlasD().Atlas._pure;
  const c0 = P.ringColor(1086, 1086, 1390), c3 = P.ringColor(1390, 1086, 1390);
  eq(c0.map(v => +v.toFixed(3)), P.RING_STOPS[0]); eq(c3.map(v => +v.toFixed(3)), P.RING_STOPS[3]);
  eq(P.ringColor(0, 1000, 1300), [0.62, 0.61, 0.59]);
  const mid = P.ringColor(1250, 1000, 1300);   // band 2 of 3 -> t = 2/3 -> exactly the rose stop
  eq(mid.map(v => +v.toFixed(3)), P.RING_STOPS[2]);
  near(P.ringColor(1099, 1086, 1390)[0], c0[0], 1e-9, 'a band is a whole century');
});
test('hypso is continuous and walks from water to snow', () => {
  const P = atlasD().Atlas._pure;
  let prev = P.hypso(-100);
  for (let h = -100; h <= 1600; h += 5) { const c = P.hypso(h); if (h !== 5) for (let k = 0; k < 3; k++) assert(Math.abs(c[k] - prev[k]) <= 40, 'jump at ' + h); prev = c; }   // (the coastline itself is a hard edge)
  assert(P.hypso(1600)[0] > 240 && P.hypso(-50)[2] > P.hypso(-50)[0], 'snow up high, blue under water');
});
test('fitBB frames the box at the camera fov and clamps the distance', () => {
  const P = atlasD().Atlas._pure;
  const f = P.fitBB([1000, 2000, 1400, 2100], 1.3, 50);
  near(f.x, 1200); near(f.z, 2050);
  near(f.dist, 400 * 1.3 / (2 * Math.tan(25 * Math.PI / 180)), 1e-6);
  eq(P.fitBB([0, 0, 1, 1]).dist, 120); eq(P.fitBB([0, 0, 1e6, 1]).dist, 30000);
});
test('glassUniform matches the DOM ring at pixel ratios 1, 1.5 and 2 (gl_FragCoord is bottom-up)', () => {
  const P = atlasD().Atlas._pure;
  for (const pr of [1, 1.5, 2]) eq(P.glassUniform(300, 100, 110, 700, pr, 2), [300 * pr, 600 * pr, 110 * pr, 2]);
});
test('waveMax reaches every map corner from any focus', () => {
  const P = atlasD().Atlas._pure;
  for (const [x, z] of [[0, 0], [8192, 8192], [16384, 100], [-3000, 20000]]) {
    const r = P.waveMax(x, z);
    for (const [cx, cz] of [[0, 0], [SIZE, 0], [0, SIZE], [SIZE, SIZE]]) assert(r - Math.hypot(cx - x, cz - z) >= 480 + 220, 'corner uncovered');
  }
});
test('leagueBar prefers one league, else the largest measure that fits', () => {
  const P = atlasD().Atlas._pure;
  eq(P.leagueBar(40).label, 'one league'); near(P.leagueBar(40).px, 4828 / 40);
  eq(P.leagueBar(2).label, 'a furlong');          // a league would be 2414 px, half a mile 402
  eq(P.leagueBar(5).label, 'half a mile');
  eq(P.leagueBar(1000).label, 'five leagues');
  eq(P.leagueBar(0), null);
});
test('polylines: flat with NaN breaks, base64 Float32, nested arrays', () => {
  const P = atlasD().Atlas._pure;
  eq(P.polylines([0, 0, 10, 0, NaN, NaN, 5, 5, 6, 6, 7, 7]).map(l => Array.from(l)), [[0, 0, 10, 0], [5, 5, 6, 6, 7, 7]]);
  const f = new Float32Array([1, 2, 3, 4, 5, 6]), b64 = btoa(String.fromCharCode(...new Uint8Array(f.buffer)));
  eq(P.polylines(b64).map(l => Array.from(l)), [[1, 2, 3, 4, 5, 6]]);
  eq(P.polylines([[[0, 0], [1, 1]], [2, 2, 3, 3]]).map(l => Array.from(l)), [[0, 0, 1, 1], [2, 2, 3, 3]]);
  eq(P.polylines(null), []); eq(P.polylines('%%%'), []);
});
test('ink kernel (JS mirror of at_lines): zero on the border, 8 m at a cell centre, no line inside a region', () => {
  const P = atlasD().Atlas._pure;
  near(P.inkLine(1, 2, 1, 2, 0.5, 0.3).dist, 0, 1e-9, 'vertical border between two columns');
  near(Math.abs(P.inkLine(1, 2, 1, 2, 0, 0.3).dist), 8, 1e-9, 'half a cell away');
  near(Math.abs(P.inkLine(1, 2, 1, 2, 0.25, 0.7).dist), 4, 1e-9);
  eq(P.inkLine(3, 3, 3, 3, 0.4, 0.6).v, 1, 'same region: v = 1, the shader draws nothing');
  const s = P.inkLine(1, 1, 1, 2, 0.3, 0.3);   // corner: the nearest cell's own side stays positive
  assert(s.v >= 0.5 && s.dist >= 0);
});
test('streetBorder: a street along a boundary counts, one inside a region does not', () => {
  const P = atlasD().Atlas._pure;
  const idAt = (x, z) => (z < 1000 ? 1 : 2);
  const along = [0, 1000, 100, 1000, 200, 1000, 300, 1000], inside = [0, 500, 100, 500, 200, 500];
  eq(P.streetBorder(along, idAt), 1); eq(P.streetBorder(inside, idAt), 0);
});
test('card wording: six different places, or the coincidence', () => {
  const P = atlasD().Atlas._pure;
  const lv = ['plot', 'settlement', 'parish', 'manor', 'honour', 'shire'];
  eq(P.answers(lv.map((l, i) => ({ level: l, id: i, maskHash: 'h' + i }))), 'Answers to six different places, none of them the same shape.');
  const r2 = lv.map((l, i) => ({ level: l, id: i, maskHash: l === 'manor' || l === 'parish' ? 'same' : 'h' + i }));
  eq(P.answers(r2), 'Answers to five places; the parish and the manor share one bound.');
  eq(P.words(11), 'eleven'); eq(P.words(40), '40');
  eq(P.landPhrase('dowry', 1244), 'its manor was a dowry in 1244'); eq(P.landPhrase('nope', 1), null);
});
test('page titles and page stepping', () => {
  const P = atlasD().Atlas._pure;
  eq(P.pageTitle('lordship', 'Wexcombe', 1311.6), 'A MAP OF THE LORDSHIPS OF WEXCOMBE, ANNO DOMINI 1311');
  eq(P.pageTitle('lordship', 'Wexcombe', 0), 'A MAP OF THE LORDSHIPS OF WEXCOMBE');
  eq([P.resolvePage(1, 4), P.resolvePage(-1, 0), P.resolvePage('relief', 0), P.resolvePage(3, 0), P.resolvePage(9, 2), P.resolvePage('+1', 2)], [0, 4, 4, 3, 2, 3]);
});
test('regionsFrom labels each region on its own sample nearest the centroid', () => {
  const P = atlasD().Atlas._pure;
  // a C-shaped region: the centroid (5, 3.3) is not a member sample; the label must sit on one that is
  const s = [[0, 0], [10, 0], [0, 5], [0, 10], [10, 10]].map(([x, z]) => ({ id: 7, name: 'Holt End', x, z }));
  const r = P.regionsFrom(s.concat([{ id: 0, x: 5, z: 5 }])).get(7);
  eq(r.name, 'Holt End'); eq(r.n, 5); assert(s.some(p => p.x === r.x && p.z === r.z), 'label on a member sample');
});
test('holderRgb: realm hue in degrees, turns or hex; deterministic golden-angle fallback; low chroma', () => {
  const P = atlasD().Atlas._pure;
  eq(P.holderRgb('#8040c0', 0), [128, 64, 192]);
  eq(P.holderRgb(120, 0), P.holderRgb(1 / 3, 5));
  eq(P.holderRgb(undefined, 3), P.holderRgb(undefined, 3));
  for (let i = 0; i < 20; i++) { const c = P.holderRgb(i * 37, i); assert(Math.max(...c) - Math.min(...c) < 130, 'chroma too high'); }
});

// ---- page painting (driven through _dev.paintGen into a stub canvas) -------------------------------------
function stubPage() {
  const img = { data: new Uint8ClampedArray(N * N * 4) };
  const ctx = new Proxy({ createImageData: () => img, putImageData() {}, calls: [] }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, tex: {}, img: null, page: null, ready: false, px: (i, j) => Array.from(img.data.slice((j * N + i) * 4, (j * N + i) * 4 + 3)) };
}
const drain = g => { let n = 0; while (!g.next().done) n++; return n; };
function worldD(extra) {
  const D = atlasD();
  D.W.zone = new Uint8Array(N * N * 4);
  D.W.seaLevel = 0; D.W.h.fill(50);
  Object.assign(D, extra || {});
  return D;
}
test('places page paints zone colours, water, paper; and yields in row strips', () => {
  const D = worldD();
  D.W.zone[(10 * N + 20) * 4] = 3;           // a castle cell at i=20, j=10
  D.W.h[5 * D.VN + 5] = -4;                  // sea at i=5, j=5
  const P = stubPage(), steps = drain(D.Atlas._dev.paintGen(P, 'places', 0));
  eq(P.px(20, 10), [200, 90, 80]); eq(P.px(5, 5), [206, 222, 230]); eq(P.px(600, 600), [255, 255, 255]);
  assert(steps >= N / 8, 'must yield at least every 8 rows: ' + steps);
  assert(P.ready && P.page === 'places' && P.tex.needsUpdate === true);
});
test('growth rings page: cells by century of their year, future cells blank in replay, uAtYear set', () => {
  const yg = { fill: null };
  const D = worldD({ Town: { hist: { fillYearGrid(out) { out.fill(0); out[3 * N + 3] = 1090; out[4 * N + 4] = 1310; out[6 * N + 6] = 1400; return out; } } } });
  for (const k of [3 * N + 3, 4 * N + 4, 6 * N + 6, 7 * N + 7]) D.W.zone[k * 4] = 1;
  const P = stubPage(); drain(D.Atlas._dev.paintGen(P, 'rings', 1350));
  const R = D.Atlas._pure.ringColor;
  eq(P.px(3, 3), R(1090, 1090, 1400).map(v => Math.round(v * 255)));
  eq(P.px(4, 4), R(1310, 1090, 1400).map(v => Math.round(v * 255)));
  eq(P.px(6, 6), [255, 255, 255], 'built after the view year: not yet there');
  eq(P.px(7, 7), [158, 156, 150], 'a zone cell of unknown age');
  eq([D.AU.uAtYear.value.x, D.AU.uAtYear.value.y, D.AU.uAtYear.value.z], [1090, 1400, 1350]);
});
test('roads overlay: live = no year filter (roads carry fractional years); replay = the fractional view year', () => {
  const years = [];
  const D = worldD({ Roads: { drawAtlas(ctx, s, o) { years.push(o.year); } }, Story: { started: true, displayYear: () => 1142 } });
  D.Atlas.init();
  drain(D.Atlas._dev.paintGen(stubPage(), 'roads', 1142));
  eq(years, [undefined], 'live: a road stamped 1142.6 must not be hidden by the floored 1142');
  D.emit('story:view', 1142.6); years.length = 0;
  drain(D.Atlas._dev.paintGen(stubPage(), 'places', 1142.6));
  eq(years, [1142.6], 'replay: the fractional view year, not floored');
  D.emit('story:view', null); years.length = 0;
  drain(D.Atlas._dev.paintGen(stubPage(), 'rings', 1142));
  eq(years, [undefined], 'back to live');
});
test('lordship page: legend holders in their own hue, the rest in muted tints; unsurveyed = plain paper', () => {
  const Realm = {
    ready: true,
    fillIdTex(out) { for (let k = 0; k < N * N; k++) out[k * 4 + 1] = k < N * 512 ? 1 : 2; },
    legend: () => [{ holder: { id: 9, name: 'the Crown' }, hue: '#8040c0', manors: 12, pieces: 5 }],
    maskOf(level, id, y, out) { if (level === 'honour' && id === 9) for (let k = 0; k < N * 100; k++) out[k] = 1; },
    ghosts: () => [{ label: 'Bounds of the Honour of Wexcombe', y0: 1100, y1: 1311, pts: [0, 0, 1000, 0, 1000, 1000] }]
  };
  const D = worldD({ Realm });
  D.Atlas._dev.paintGen({ ctx: null }, 'relief', 0);   // (generator not started: no-op)
  const P = stubPage();
  // resources are made on the first entry; make them via toggle so idBuf exists
  D.Atlas.toggle(true);
  drain(D.Atlas._dev.paintGen(P, 'lordship', 1311));
  eq(P.px(5, 5), [128, 64, 192], 'the Crown (legend) in its own hue');
  const muted = P.px(5, 300), other = P.px(5, 900);
  assert(muted.join() !== other.join() && muted[0] > 190 && other[0] > 190, 'others: quiet parchment tints by colour index');
  eq(D.AU.uAtInk.value.w, 1, 'realm ink enabled once the id texture is filled');
  const D2 = worldD(); D2.Atlas.toggle(true);
  const P2 = stubPage(); drain(D2.Atlas._dev.paintGen(P2, 'lordship', 0));
  eq(P2.px(300, 300), [255, 255, 255]); assert(P2.info.unsurveyed);
});

// ---- the drain: 1.6 s ease, reversible mid-way, emits atlas:toggle ------------------------------------------
test('toggle drains in over ~1.6 s from the focus, and blooms back out', () => {
  const D = atlasD(), A = D.Atlas, seen = [];
  D.on('atlas:toggle', on => seen.push(on));
  D.Cam = { focusPoint: () => ({ x: 4000, z: 5000 }) };
  A.init(); A.toggle(true);
  eq([D.AU.uAtFocus.value.x, D.AU.uAtFocus.value.y, D.AU.uAtFocus.value.w], [4000, 5000, 0]);
  for (let t = 0; t < 0.8; t += 0.1) A.update(0.1, null);
  assert(A.k > 0.3 && A.k < 0.7, 'half way at 0.8 s: ' + A.k);
  for (let t = 0; t < 1.0; t += 0.1) A.update(0.1, null);
  eq(A.k, 1); eq(D.AU.uAtlas.value, 1);
  A.toggle(false); eq(D.AU.uAtFocus.value.w, 1, 'exit blooms out');
  for (let t = 0; t < 2; t += 0.1) A.update(0.1, null);
  eq([A.k, D.AU.uAtlas.value, D.AU.uAtGlass.value.w], [0, 0, 0]);
  eq(seen, [true, false]);
});
test('reversing mid-drain runs the same wave back (no pop)', () => {
  const D = atlasD(), A = D.Atlas;
  A.init(); A.toggle(true);
  for (let i = 0; i < 6; i++) A.update(0.1, null);
  const k0 = A.k, r0 = D.AU.uAtFocus.value.z;
  A.toggle(false);
  eq(D.AU.uAtFocus.value.w, 0, 'still the drain wave, running backwards');
  A.update(0.1, null);
  assert(A.k < k0 && D.AU.uAtFocus.value.z < r0 && A.k > k0 - 0.2, 'continuous: ' + k0 + ' -> ' + A.k);
  for (let i = 0; i < 20; i++) A.update(0.1, null);
  eq(A.k, 0);
});

test('budget: fillIdTex runs as a job (not on the Shift+M frame); a clock-only refresh does not repaint Relief', () => {
  let fills = 0;
  const Realm = { ready: true, fillIdTex() { fills++; }, legend: () => [], ghosts: () => [] };
  const D = worldD({ Realm, Story: { started: true, displayYear: () => 1300 } }), A = D.Atlas;
  A.init(); A.setPage('relief'); A.toggle(true);
  eq(fills, 0, 'not synchronous in toggle');
  for (let i = 0; i < 20; i++) A.update(0.1, null);
  eq(fills, 1); eq(A.page(), 'relief'); eq(D.AU.uAtInk.value.w, 1);
  const U = D.AU.uAtSlide.value; U.z = 5;              // swapAB (a finished main repaint) resets this to -1
  D.emit('story:season'); for (let i = 0; i < 20; i++) A.update(0.1, null);
  eq(U.z, 5, 'season only: Relief is not repainted');
  D.emit('stroke:end'); for (let i = 0; i < 25; i++) A.update(0.1, null);
  eq(U.z, -1, 'a player edit repaints it');
  D.emit('realm:changed'); for (let i = 0; i < 20; i++) A.update(0.1, null);
  eq(fills, 2, 'realm change refreshes the ids');
});

// ---- pull-back: rings in order, masks, spotlight, card ------------------------------------------------------
test('click pulls back through every ring in order, selecting each exactly', async () => {
  const lv = ['plot', 'settlement', 'parish', 'manor', 'honour', 'shire'];
  const masks = [], flights = [];
  const Realm = { ready: true, fillIdTex() {}, legend: () => [], ghosts: () => [],
    rings: () => lv.map((l, i) => ({ level: l, id: i + 1, name: l, caption: 'The ' + l, bb: [1000 - i * 300, 1000 - i * 300, 1100 + i * 300, 1100 + i * 300], pieces: l === 'honour' ? 11 : 1, maskHash: 'h' + i })),
    maskOf(level, id, y, out) { masks.push(level); out[0] = 1; } };
  const D = worldD({ Realm, Cam: { fov: 50, focusPoint: () => ({ x: 0, z: 0 }), flyPath(legs, done) { flights.push(legs[0]); done(); return 1; } }, Town: { buildingAt: () => ({ x: 1050, z: 1050, w: 8, d: 6, rot: 0 }) } });
  D.Atlas.init(); D.Atlas.toggle(true);
  D.Atlas.click(1050, 1050);
  assert(D.Atlas.pulling);
  for (let i = 0; i < 20 && D.Atlas.pulling; i++) await new Promise(r => setTimeout(r, 0));
  eq(masks, ['settlement', 'parish', 'manor', 'honour', 'shire'], 'every ring but the plot uses an exact mask');
  eq(flights.length, 6); near(flights[0].x, 1050); near(flights[5].x, 1050);
  assert(flights[5].dist > flights[0].dist, 'pulls back');
  eq([flights[0].dur, flights[0].hold], [1.1, 1.2]);
  eq(D.AU.uAtInk.value.y, 1, 'the last ring stays selected until the card is dismissed');
  assert(!D.Atlas.pulling);
  D.Atlas.cancel(); eq(D.AU.uAtInk.value.y, 0);
});
test('a cancelled fly (keyboard pan, Chronicle fly-to) ends the pull-back instead of jumping to the next ring', async () => {
  const lv = ['plot', 'settlement', 'parish', 'manor', 'honour', 'shire'];
  const masks = [], flights = [];
  let pending = null, cancels = 0;
  const Realm = { ready: true, fillIdTex() {}, legend: () => [], ghosts: () => [],
    rings: () => lv.map((l, i) => ({ level: l, id: i + 1, name: l, caption: 'The ' + l, bb: [1000 - i * 300, 1000 - i * 300, 1100 + i * 300, 1100 + i * 300], pieces: 1, maskHash: 'h' + i })),
    maskOf(level, id, y, out) { masks.push(level); out[0] = 1; } };
  // camera.js semantics: onDone(false) when the leg finishes, onDone(true) from cancelFly (panBy/orbitBy/zoomAt/flyTo...)
  const Cam = { fov: 50, focusPoint: () => ({ x: 0, z: 0 }),
    flyPath(legs, done) { flights.push(legs[0]); pending = done; return 1; },
    cancelFly() { cancels++; const f = pending; pending = null; if (f) f(true); } };
  const D = worldD({ Realm, Cam, Town: { buildingAt: () => ({ x: 1050, z: 1050, w: 8, d: 6, rot: 0 }) } });
  D.Atlas.init(); D.Atlas.toggle(true);
  D.Atlas.click(1050, 1050);
  const tickAsync = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };
  await tickAsync();
  eq(flights.length, 1);
  { const f = pending; pending = null; f(false); }   // the plot leg completes normally
  await tickAsync();
  eq(flights.length, 2); eq(masks, ['settlement']);
  Cam.cancelFly();                                     // the user holds W: camera.js cancels the fly
  await tickAsync();
  assert(!D.Atlas.pulling, 'the pull ended');
  eq(flights.length, 2, 'no flight to the parish');
  eq(masks, ['settlement'], 'the next ring was not selected');
  eq([D.AU.uAtInk.value.y, D.AU.uAtSel.value.w], [0, 0], 'selection cleared');
  eq(cancels, 1, 'no recursive cancelFly');
  // Esc / Atlas.cancel() during a pull cancels the camera's fly once, and the pull stays ended
  D.Atlas.click(1050, 1050); await tickAsync();
  assert(D.Atlas.pulling && pending);
  assert(D.Atlas.cancel()); await tickAsync();
  eq(cancels, 2); assert(!D.Atlas.pulling); eq(flights.length, 3);
});

// ---- nature / water / post hooks ------------------------------------------------------------------------------
test('nature: boundstone appended at index 34, older indices untouched, cover() reads the canopy grid', () => {
  const D = load(['js/core.js', 'js/terrain.js', 'js/nature.js']);
  const S = D.Nature.SPECIES;
  eq(S.length, 35); eq(S[34].id, 'boundstone'); eq(D.Nature.SP_INDEX.boundstone, 34);
  eq(S[34], { id: 'boundstone', name: 'Boundary stone', cat: 'prop', cols: [0x9a948a, 0x8e887e, 0xa29c90], canopy: 0, h: 1.1, line: 60, noScale: true });
  eq(S.slice(0, 34).map(s => s.id).join(','), 'oak,pine,poplar,birch,spruce,palm,jungle,blossom,cactus,bush,scrub,flowers,rock,lantern,wattle,hedge,barrels,haystack,cart,crates,woodpile,stook,drystone,veg,herbs,apple,pear,grave,skep,netrack,waycross,yew,vine,torchpost');
  eq(D.Nature.cover(5000, 5000, 48), 0);
  const VN = D.VN;
  for (let j = 300; j <= 330; j++) for (let i = 300; i <= 330; i++) D.W.forest[j * VN + i] = 255;
  eq(D.Nature.cover(315 * 16, 315 * 16, 48), 1);
  const edge = D.Nature.cover(300 * 16, 315 * 16, 48);
  assert(edge > 0.3 && edge < 0.8, 'half in the wood: ' + edge);
  eq(D.Nature.cover(-100, -100, 0), 0);
});
test('water: the shared Atlas uniforms are spread into the water uniforms', () => {
  const D = load(['js/core.js', 'js/terrain.js', 'js/water.js']);
  for (const n of AU_NAMES) assert(D.Water.U[n] === D.AU[n], n);
});
test('post: the Atlas grade never writes the user preset, and is exact identity at k = 0', () => {
  const D = load(['js/core.js', 'js/terrain.js', 'js/post.js']);
  const R = { capabilities: { isWebGL2: false }, setRenderTarget() {}, render() {} };
  D.Post.init(R); D.Post.w = D.Post.h = 64;
  D.Post.applyPreset('vintage');
  const before = JSON.stringify(D.Post.p), c = D.Post.comp.u;
  D.Post.render(R, {}, { near: 1, far: 10 }, 0);
  const off = [c.uSat.value, c.uContrast.value, c.uBloom.value, c.uGrain.value, c.uVig.value];
  eq(off, [D.Post.p.saturation, D.Post.p.contrast, D.Post.p.bloom, D.Post.p.grain, D.Post.p.vignette]);
  D.AU.uAtlas.value = 1;
  D.Post.render(R, {}, { near: 1, far: 10 }, 0);
  eq([c.uSat.value, c.uContrast.value, c.uSplit.value], [1, 1, 0]);
  near(c.uBloom.value, D.Post.p.bloom * 0.2); near(c.uLift.value, 0.03); near(c.uGrain.value, 0.015);
  assert(c.uVig.value > D.Post.p.vignette - 1e-9);
  eq(JSON.stringify(D.Post.p), before, 'preset untouched');
});
