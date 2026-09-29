/* Diorama — Realm, "The Patchwork" (spec §3.11): the land reckoned in manors, honours and shires.
   A Uint32 grid on the same 16 m cells as W.zone:
     bits 0-15 manor id (1..4000; 0 = sea/none) · 16-23 shire id (1..6) · 24 borough · 25 abbey demesne
   It is surveyed once (time-sliced, at story:prepare), written by the chronicle's begin commit, and after that
   cells are only ever reassigned to a NEWLY CREATED child manor (parent = old id, y0 = the year), so the realm
   at any past year Y is exact and cheap:  disp(m, Y) = y0(m) > Y ? disp(parent(m), Y) : group(m).
   Who holds a manor is an append-only [[year, holder], ...] log per manor (binary search for year Y).
   Undo: the cells live in the 'realm' History regArray (tile copy-on-write); the metadata is this Story
   part's snap(): records are frozen and REPLACED on change, so a snapshot is a set of shallow slices.
   Optional module: without it the Atlas drops the Lordship page and the realm rings, and there are no stones.
   Everything that mutates the realm runs inside a Story season commit (I1); the survey, the topology cache
   and the stone renderer are derived state. Pure logic is exported in Realm._pure for dev/tests/realm.test.js. */
(function () {
'use strict';
const D = window.D;

const MANOR = 0xffff, SH_SHIFT = 16, BOROUGH = 1 << 24, ABBEY = 1 << 25;
const MAXM = 4001;               // manor ids 1..4000 (topology arrays are sized once)
const TUNE = Object.assign({
  rate: 0.1,                     // transfer chance per season (~0.4 a year)
  perYear: 2,                    // transfers per game year (≤ 1 per season via ctx.budget.realm)
  seedSpacing: 1300, seedClear: 1000, seedMerge: 200,   // m: Poisson virtual manors / clearance / settlement dedupe
  riverCost: 40, islandMin: 12,  // survey cost of a river cell; manors / fragments under this (32 m cells) merge
  shireKm2: 45, shireGap: 5000,  // one shire per 45 km² (3..6); shire seeds at least 5 km apart
  dowryDist: 8000, bequestDist: 10000,
  stoneYears: 20, stoneGap: 500, stoneChance: 0.3, stoneSlope: 18,   // a Winter stone ~1 in 3 years; never on ground steeper than 18°
  maxManors: 4000, maxHolders: 400, maxGhosts: 60, maxStones: 24,
  weights: { dowry: 20, bequest: 20, partition: 15, sale: 15, regrant: 15, charter: 10, escheat: 5 }
}, D.TUNE && D.TUNE.realm);
D.TUNE = D.TUNE || {}; D.TUNE.realm = TUNE;

// ---- small helpers ------------------------------------------------------------------------------------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
function hash32L() {                     // exact copy of town.js hash32 (fallback when core lacks D.hash32)
  let h = 0x811c9dc5 ^ arguments.length;
  for (let a = 0; a < arguments.length; a++) {
    let v = arguments[a];
    if (typeof v === 'string') v = D.hashStr(v);
    else if (typeof v !== 'number' || !isFinite(v)) v = 0x9e37;
    else v = (v | 0) ^ ((v / 4294967296) | 0);
    h = Math.imul(h ^ v, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h ^= h >>> 15;
  return h >>> 0;
}
const H32 = function () { return (D.hash32 || hash32L).apply(null, arguments); };
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pickIdx(r, w) { let s = 0; for (const x of w) s += x; let t = r() * s; for (let i = 0; i < w.length; i++) { t -= w[i]; if (t < 0) return i; } return w.length - 1; }
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const words = n => WORDS[n] || String(n);
const listJoin = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const freeze = Object.freeze;

// base64 / RLE (binary carried as base64 strings, spec §7)
function b64FromBytes(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function bytesFromB64(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function rle32Enc(a) {
  const out = []; const n = a.length; let i = 0;
  while (i < n) { const v = a[i]; let j = i + 1; while (j < n && a[j] === v) j++; out.push(v, j - i); i = j; }
  return b64FromBytes(new Uint8Array(new Uint32Array(out).buffer));
}
function rle32Dec(s, n, out) {            // -> Uint32Array(n) or null when malformed
  if (typeof s !== 'string') return null;
  let u; try { u = bytesFromB64(s); } catch (e) { return null; }
  if (u.length % 8) return null;
  const a = new Uint32Array(u.buffer, 0, u.length / 4);
  out = out || new Uint32Array(n);
  let p = 0;
  for (let i = 0; i < a.length; i += 2) { const c = a[i + 1]; if (p + c > n) return null; out.fill(a[i], p, p + c); p += c; }
  return p === n ? out : null;
}
const f32ToB64 = f => b64FromBytes(new Uint8Array(f.buffer, f.byteOffset, f.byteLength));
function b64ToF32(s) { try { const u = bytesFromB64(s); return new Float32Array(u.buffer, 0, u.length >> 2); } catch (e) { return new Float32Array(0); } }

// ---- names --------------------------------------------------------------------------------------------
const SURNAMES = ['Basset', 'Mauduit', 'Giffard', 'Malet', 'Lovel', 'Corbet', 'Venables', 'Tancred', 'Peverel', 'Mortimer',
  'Beauchamp', 'Ferrers', 'Mowbray', 'Braose', 'Warenne', 'Bigod', 'Tosny', 'Lacy', 'Clare', 'Courtenay', 'Despenser',
  'Grey', 'Talbot', 'Harcourt', 'Cheyne', 'Mandeville', 'Bohun', 'Say', 'Vere', 'Arundel', 'Chaworth', 'Burgh',
  'Quincy', 'Beaumont', 'Neville', 'Percy', 'Clifford', 'Stafford', 'Montagu', 'Camville', 'Paynel', 'Tracy'];
const GIVEN = ['Walter', 'Hugh', 'Ralph', 'Robert', 'William', 'Roger', 'Geoffrey', 'Richard', 'Gilbert', 'Henry', 'Simon',
  'Baldwin', 'Reginald', 'Bernard', 'Odo', 'Alan', 'Payn', 'Humphrey', 'Nigel', 'Osbert', 'Fulk', 'Thomas', 'John', 'Stephen'];
const GIVEN_F = ['Maud', 'Alice', 'Isabel', 'Agnes', 'Joan', 'Margery', 'Cecily', 'Emma', 'Juliana', 'Mabel', 'Avice',
  'Hawise', 'Beatrice', 'Eleanor', 'Sibyl', 'Rohese', 'Petronel', 'Edith'];
const PRE = ['West', 'East', 'North', 'South', 'Upper', 'Nether', 'Long', 'Black', 'White', 'Oak', 'Ash', 'Thorn', 'Broad',
  'High', 'Cold', 'Stan', 'Red', 'Hazel', 'Elm', 'Kings', 'Brad', 'Mill', 'Sut', 'Nor', 'Wex', 'Crow', 'Hart', 'Wolf',
  'Bex', 'Ald', 'Win', 'Har', 'Holm', 'Lang', 'Fen', 'Birch', 'Sel', 'Ember', 'Throck', 'Wick'];
const SUF_HIGH = ['moor', 'down', 'fell', 'edge', 'hill', 'knoll', 'ridge', 'hope', 'tor', 'combe'];
const SUF_WATER = ['ford', 'mere', 'marsh', 'wick', 'bourne', 'brook', 'well', 'ey', 'wash', 'fleet'];
const SUF_WOOD = ['holt', 'wood', 'hurst', 'shaw', 'grove', 'den', 'ley'];
const SUF_FIELD = ['field', 'lea', 'green', 'heath', 'stead', 'thorpe', 'worth', 'ton', 'ham', 'cote', 'stow', 'by'];
const ENDS = ['End', 'Green', 'Cross', 'Common', 'Heath', 'Barton'];
const SPECIAL = { church: 'the church', chapel: 'the chapel', cathedral: 'the cathedral', watermill: 'the mill', windmill: 'the mill',
  markethall: 'the market', marketcross: 'the market cross', tavern: 'the inn', smithy: 'the smithy', hall: 'the manor hall' };
function uniqueName(base, used) {
  if (!used.has(base)) { used.add(base); return base; }
  for (const s of [' Parva', ' Magna', ' Minor', ' End', ' Green']) if (!used.has(base + s)) { used.add(base + s); return base + s; }
  for (let n = 2; ; n++) if (!used.has(base + ' ' + n)) { used.add(base + ' ' + n); return base + ' ' + n; }
}
function terrainName(r, f, used) {
  for (let t = 0; t < 24; t++) {
    const pool = f.high ? SUF_HIGH : f.water ? SUF_WATER : f.wood ? SUF_WOOD : SUF_FIELD;
    const suf = pick(r, pool);
    const n = r() < 0.72 ? pick(r, PRE) + suf : cap1(suf) + ' ' + pick(r, ENDS);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return uniqueName(pick(r, PRE) + pick(r, SUF_FIELD), used);
}
// "Wexcombe Castle" -> "Wexcombe"; "St Mary's Abbey" stays usable as a root for "the Honour of ..."
function rootOf(name) {
  const s = String(name || '').replace(/\s+(Castle|Abbey|Priory|Minster|Harbour|Haven|Quay|Fields?|Farms?|Grange|Keep|Hall)$/i, '').trim();
  return s || String(name || 'the Marches');
}
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const HUE = { crown: 285, see: 40, abbey: 36, borough: 5 };
function houseHue(i) {                    // golden angle, nudged off the crown / church / borough hues
  let h = (20 + i * 137.508) % 360;
  for (let k = 0; k < 4; k++) { if (Math.abs(h - 285) < 16 || Math.abs(h - 38) < 14 || h < 14 || h > 350) h = (h + 29) % 360; }
  return Math.round(h * 10) / 10;
}

// =====================================================================================================
// State
// =====================================================================================================
const X0 = freeze({ castles: freeze([]), sees: freeze([]), charters: freeze([]), ty: 0, tn: 0 });
function newState(N) {
  return { N, cells: new Uint32Array(N * N), ready: false, manors: [null], holders: [null], hold: [null], ghosts: [],
    stones: [], shireNames: freeze(['']), x: X0, cver: 0, topo: null, cost32: null, parish: null, memo: null };
}
// cost32 (the 32 m survey cost grid, used only by parishes) is derived from the world: it is dropped with the realm
// and re-primed in slices by part.update. The river mask is never cached (partition rasterises it afresh), so a
// river cut never depends on what ran earlier in the session.
function resetMeta(st) {
  st.ready = false; st.manors = [null]; st.holders = [null]; st.hold = [null]; st.ghosts = []; st.stones = [];
  st.shireNames = freeze(['']); st.x = X0; st.cver++; st.topo = null; st.parish = null; st.memo = null; st.cost32 = null;
}
// a manor's name as it stood in year Y (a rename records its year in ry; the old name is kept in aka)
const nameAt = (M, Y) => M ? (Y !== undefined && Y !== null && Y !== Infinity && M.aka && M.ry && Y < M.ry ? M.aka : M.name) : '';
const holderNow = (st, m) => { const h = st.hold[m]; return h && h.length ? h[h.length - 1][1] : 0; };
function holderAt(st, m, Y) {             // binary search the append-only [year, holder] log
  const h = st.hold[m]; if (!h || !h.length) return 0;
  if (Y === undefined || Y === null || Y === Infinity) return h[h.length - 1][1];
  let lo = 0, hi = h.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (h[mid][0] <= Y) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return h[ans][1];
}
function lastHoldYear(st, m) { const h = st.hold[m]; return h && h.length ? h[h.length - 1][0] : 0; }
// the manor record that cell-manor m displays as at year Y (walks up through later carvings)
function dispManor(st, m, Y) {
  if (Y === undefined || Y === null || Y === Infinity) return m;
  const M = st.manors;
  for (let g = 0; g < 64 && m && M[m] && M[m].y0 > Y && M[m].parent; g++) m = M[m].parent;
  return m;
}
const disp = (st, m, Y) => { const d = dispManor(st, m, Y); return d && st.manors[d] ? st.manors[d].group : 0; };
function setHold(st, m, y, h) { st.hold[m] = freeze((st.hold[m] || []).concat([freeze([y, h])])); }
function setHolder(st, h, patch) { st.holders[h] = freeze(Object.assign({}, st.holders[h], patch)); }
function honourName(st, h) { const H = st.holders[h]; return H ? (H.honour || H.name) : 'no lord'; }
function cellOf(st, x, z) { const N = st.N, C = 16; return clamp(Math.floor(z / C), 0, N - 1) * N + clamp(Math.floor(x / C), 0, N - 1); }

// =====================================================================================================
// Topology cache (derived): per-manor cell counts / bboxes / centroids / shire, 8-connected manor adjacency
// (pair key a*65536+b -> shared 4-edge count; diagonal-only contacts count 0) and manor tripoints
// (2x2 blocks holding three distinct manors, keyed by the block's top-left cell).
// =====================================================================================================
function topoNew() {
  const T = { cnt: new Int32Array(MAXM), bb: new Int32Array(MAXM * 4), sx: new Float64Array(MAXM), sz: new Float64Array(MAXM),
    sh: new Uint8Array(MAXM), adj: new Map(), tri: new Map(), nb: null, ver: -1 };
  for (let m = 0; m < MAXM; m++) topoClear(T, m);
  return T;
}
function topoClear(T, m) { T.cnt[m] = 0; T.bb[m * 4] = 1e9; T.bb[m * 4 + 1] = 1e9; T.bb[m * 4 + 2] = -1; T.bb[m * 4 + 3] = -1; T.sx[m] = 0; T.sz[m] = 0; }
function scanTopo(st, T, i0, j0, i1, j1, A) {
  const N = st.N, C = st.cells, cnt = T.cnt, bb = T.bb, sx = T.sx, sz = T.sz, adj = T.adj;
  const pair = (a, b, w) => {
    if (!a || !b || a === b) return;
    if (A && !A.has(a) && !A.has(b)) return;
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    adj.set(key, (adj.get(key) || 0) + w);
  };
  for (let j = j0; j <= j1; j++) {
    let k = j * N + i0;
    for (let i = i0; i <= i1; i++, k++) {
      const c = C[k], a = c & MANOR;
      if (a && (!A || A.has(a))) {
        cnt[a]++; sx[a] += i; sz[a] += j; T.sh[a] = (c >>> SH_SHIFT) & 255;
        const b4 = a * 4; if (i < bb[b4]) bb[b4] = i; if (j < bb[b4 + 1]) bb[b4 + 1] = j; if (i > bb[b4 + 2]) bb[b4 + 2] = i; if (j > bb[b4 + 3]) bb[b4 + 3] = j;
      }
      const hasR = i + 1 < N, hasD = j + 1 < N;
      const p = hasR ? C[k + 1] & MANOR : a;
      if (p !== a) pair(a, p, 1);
      if (!hasD) continue;
      const q = C[k + N] & MANOR;
      if (q !== a) pair(a, q, 1);
      if (i > 0) { const w = C[k + N - 1] & MANOR; if (w !== a) pair(a, w, 0); }
      if (!hasR) continue;
      const s = C[k + N + 1] & MANOR;
      if (s !== a) pair(a, s, 0);
      if (a === p && a === q && a === s) continue;
      // tripoint: three distinct non-zero manors meet in this 2x2 block
      let n = 0, x0 = 0, x1 = 0, x2 = 0;
      for (let t = 0; t < 4; t++) { const v = t === 0 ? a : t === 1 ? p : t === 2 ? q : s; if (!v || v === x0 || v === x1 || v === x2) continue; if (n === 0) x0 = v; else if (n === 1) x1 = v; else if (n === 2) x2 = v; n++; }
      if (n >= 3) T.tri.set(k, [x0, x1, x2]);
    }
  }
}
function* topoGen(st, tk) {
  const T = topoNew(), N = st.N, ver = st.cver;
  for (let j = 0; j < N; j += 8) { scanTopo(st, T, 0, j, N - 1, Math.min(N - 1, j + 7), null); if (tk && now() > tk.until) yield; }
  T.ver = ver;
  return T;
}
function runGen(g) { let r = g.next(); while (!r.done) r = g.next(); return r.value; }
function topo(st) {
  if (!st.topo || st.topo.ver !== st.cver) st.topo = runGen(topoGen(st, null));
  return st.topo;
}
// Re-scan after cells of the manors in A changed. The rect must cover the (pre-change) bboxes of all of A.
function topoPatch(st, T, i0, j0, i1, j1, A) {
  const N = st.N;
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(N - 1, i1 + 1); j1 = Math.min(N - 1, j1 + 1);
  for (const a of A) topoClear(T, a);
  for (const key of Array.from(T.adj.keys())) { const a = Math.floor(key / 65536), b = key - a * 65536; if (A.has(a) || A.has(b)) T.adj.delete(key); }
  for (const key of Array.from(T.tri.keys())) { const i = key % N, j = (key - i) / N; if (i >= i0 && i <= i1 && j >= j0 && j <= j1) T.tri.delete(key); }
  scanTopo(st, T, i0, j0, i1, j1, A);
  T.nb = null; T.ver = st.cver;
}
function nbOf(T, m) {
  if (!T.nb) {
    T.nb = new Map();
    T.adj.forEach((w, key) => {
      const a = Math.floor(key / 65536), b = key - a * 65536;
      let x = T.nb.get(a); if (!x) T.nb.set(a, x = []); x.push(b);
      let y = T.nb.get(b); if (!y) T.nb.set(b, y = []); y.push(a);
    });
    T.nb.forEach(v => v.sort((p, q) => p - q));
  }
  return T.nb.get(m) || [];
}
const centroid = (T, m) => T.cnt[m] ? [(T.sx[m] / T.cnt[m] + .5) * 16, (T.sz[m] / T.cnt[m] + .5) * 16] : [0, 0];
function cellsOf(st, T, m) {
  const N = st.N, C = st.cells, b = m * 4, out = new Int32Array(T.cnt[m]); let n = 0;
  for (let j = T.bb[b + 1]; j <= T.bb[b + 3]; j++) for (let i = T.bb[b]; i <= T.bb[b + 2]; i++) { const k = j * N + i; if ((C[k] & MANOR) === m) out[n++] = k; }
  return n === out.length ? out : out.slice(0, n);
}
function holdings(st, T) {              // holder -> alive manors (sorted)
  const own = new Map();
  for (let m = 1; m < st.manors.length; m++) {
    if (!T.cnt[m]) continue;
    const h = holderNow(st, m); let a = own.get(h); if (!a) own.set(h, a = []); a.push(m);
  }
  return own;
}
// connected pieces of a set of manors over the manor adjacency graph
function piecesOf(T, ms) {
  const set = new Set(ms), seen = new Set(); let n = 0;
  for (const m of ms) {
    if (seen.has(m)) continue; n++;
    const st = [m]; seen.add(m);
    while (st.length) { const a = st.pop(); for (const b of nbOf(T, a)) if (set.has(b) && !seen.has(b)) { seen.add(b); st.push(b); } }
  }
  return n;
}

// =====================================================================================================
// Survey (spec §3.11 "Base survey"): a generator, time-sliced by tk.until (ms, performance.now()).
// env: { N, CELL, hV(i,j) vertex height, wetV(i,j) sea/lake at vertex, river32(G)->Uint8Array|null,
//        settlements() -> [{sid, uid, type, name, x, z, houses, ms, ...}], cover(x,z,r)? }
// =====================================================================================================
function* costGen(env, G, tk, out) {
  const GG = G * G, CS = (env.CELL || 16) * 2, over = () => tk && now() > tk.until;
  const h = new Float32Array(GG), wet = new Uint8Array(GG);
  for (let J = 0; J < G; J += 4) { sampleRows(env, h, wet, G, J, Math.min(G, J + 4)); if (over()) yield; }
  const riv = (env.river32 && env.river32(G)) || new Uint8Array(GG);
  if (over()) yield;
  // rel = h - mean(land h within ~600 m), via a summed-area table
  const G1 = G + 1, S = new Float64Array(G1 * G1), Sn = new Float64Array(G1 * G1);
  for (let J = 0; J < G; J += 32) { satRows(h, wet, G, S, Sn, J, Math.min(G, J + 32)); if (over()) yield; }
  const R0 = Math.max(1, Math.round(600 / CS));
  const rel = new Float32Array(GG), cost = new Float32Array(GG);
  let land = 0;
  for (let J = 0; J < G; J += 16) { land += costRows(h, wet, riv, S, Sn, G, R0, CS, rel, cost, J, Math.min(G, J + 16)); if (over()) yield; }
  Object.assign(out, { G, h, wet, riv, rel, cost, land });
  return out;
}
function sampleRows(env, h, wet, G, J0, J1) {
  for (let J = J0; J < J1; J++) for (let I = 0; I < G; I++) { const k = J * G + I; h[k] = env.hV(2 * I + 1, 2 * J + 1); wet[k] = env.wetV(2 * I + 1, 2 * J + 1) ? 1 : 0; }
}
function satRows(h, wet, G, S, Sn, J0, J1) {
  const G1 = G + 1;
  for (let J = J0; J < J1; J++) {
    let rs = 0, rn = 0;
    for (let I = 0; I < G; I++) { const k = J * G + I; if (!wet[k]) { rs += h[k]; rn++; } S[(J + 1) * G1 + I + 1] = S[J * G1 + I + 1] + rs; Sn[(J + 1) * G1 + I + 1] = Sn[J * G1 + I + 1] + rn; }
  }
}
// cost = 1 + 6·slope + 40·river + .05·max(0, rel); sea and lakes impassable. Returns the land cells in the rows.
function costRows(h, wet, riv, S, Sn, G, R0, CS, rel, cost, J0, J1) {
  const G1 = G + 1, rc = TUNE.riverCost; let land = 0;
  for (let J = J0; J < J1; J++) {
    const a0 = Math.max(0, J - R0), a1 = Math.min(G, J + R0 + 1);
    for (let I = 0; I < G; I++) {
      const k = J * G + I;
      if (wet[k]) { cost[k] = Infinity; continue; }
      land++;
      const b0 = Math.max(0, I - R0), b1 = Math.min(G, I + R0 + 1);
      const s = S[a1 * G1 + b1] - S[a0 * G1 + b1] - S[a1 * G1 + b0] + S[a0 * G1 + b0];
      const n = Sn[a1 * G1 + b1] - Sn[a0 * G1 + b1] - Sn[a1 * G1 + b0] + Sn[a0 * G1 + b0];
      rel[k] = h[k] - (n > 0 ? s / n : h[k]);
      let sl = 0; const hk = h[k];
      if (I > 0 && !wet[k - 1]) sl = Math.max(sl, Math.abs(hk - h[k - 1]));
      if (I < G - 1 && !wet[k + 1]) sl = Math.max(sl, Math.abs(hk - h[k + 1]));
      if (J > 0 && !wet[k - G]) sl = Math.max(sl, Math.abs(hk - h[k - G]));
      if (J < G - 1 && !wet[k + G]) sl = Math.max(sl, Math.abs(hk - h[k + G]));
      cost[k] = 1 + 6 * (sl / CS) + rc * riv[k] + 0.05 * Math.max(0, rel[k]);
    }
  }
  return land;
}
const SEED_PRI = { 1: 0, 3: 1, 4: 2, 5: 3 };   // village, castle, monastery, harbour seed manors (farmland does not)
function* surveyGen(env, seed, tk, out) {
  out = out || {};
  const N = env.N, CELL = env.CELL || 16, G = N >> 1, GG = G * G, CS = CELL * 2, SIZE = N * CELL;
  const r = D.rng(seed >>> 0);
  const F = yield* costGen(env, G, tk, {});
  const { wet, riv, rel, cost, h } = F;
  const over = () => tk && now() > tk.until;
  // ---- seeds: settlement origins (deduped), then Poisson virtual seeds on dry land ----
  const sets = (env.settlements() || []).filter(s => s && SEED_PRI[s.type] !== undefined && isFinite(s.x) && isFinite(s.z))
    .sort((a, b) => SEED_PRI[a.type] - SEED_PRI[b.type] || (b.houses || 0) - (a.houses || 0) || (a.uid || 0) - (b.uid || 0));
  const seeds = [];
  const dryNear = (I, J) => {
    for (let rr = 0; rr <= 3; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const a = I + di, b = J + dj; if (a < 0 || b < 0 || a >= G || b >= G) continue; if (!wet[b * G + a]) return [a, b];
    }
    return null;
  };
  for (const s of sets) {
    const c = dryNear(clamp(Math.floor(s.x / CS), 0, G - 1), clamp(Math.floor(s.z / CS), 0, G - 1)); if (!c) continue;
    if (seeds.some(o => Math.hypot(o.x - s.x, o.z - s.z) < TUNE.seedMerge)) continue;
    seeds.push({ I: c[0], J: c[1], x: s.x, z: s.z, s });
  }
  const nSet = seeds.length, lat = TUNE.seedSpacing / 2, cand = [];
  for (let z = lat / 2; z < SIZE; z += lat) for (let x = lat / 2; x < SIZE; x += lat) cand.push([x + (r() - .5) * lat * .8, z + (r() - .5) * lat * .8]);
  shuffle(cand, r);
  for (let ci = 0; ci < cand.length; ci++) {
    const x = cand[ci][0], z = cand[ci][1];
    if ((ci & 31) === 31 && over()) yield;
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) continue;
    const I = Math.floor(x / CS), J = Math.floor(z / CS); if (wet[J * G + I]) continue;
    let ok = true;
    // virtual seeds keep off rivers, so manor (and shire) bounds settle on the water
    for (let dj = -5; dj <= 5 && ok; dj++) for (let di = -5; di <= 5; di++) { const a = I + di, b = J + dj; if (a >= 0 && b >= 0 && a < G && b < G && riv[b * G + a]) { ok = false; break; } }
    for (let t = 0; t < seeds.length && ok; t++) { const o = seeds[t], d = Math.hypot(o.x - x, o.z - z); if (d < (t < nSet ? TUNE.seedClear : TUNE.seedSpacing)) ok = false; }
    if (ok) seeds.push({ I, J, x, z, s: null });
  }
  if (over()) yield;
  // ---- multi-source Dijkstra on the 32 m cost grid ----
  const lab = new Int32Array(GG), dist = new Float32Array(GG).fill(Infinity), heap = new D.Heap(1 << 15);
  seeds.forEach((s, i) => { const k = s.J * G + s.I; if (dist[k] === 0) return; dist[k] = 0; lab[k] = i + 1; heap.push(0, k); });
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  let it = 0;
  while (heap.n) {
    const k = heap.pop(), d = heap.lastKey; if (d > dist[k]) continue;
    const I = k % G, J = (k - I) / G, L = lab[k], ck = cost[k];
    for (let q = 0; q < 8; q++) {
      const I2 = I + DI[q], J2 = J + DJ[q]; if (I2 < 0 || J2 < 0 || I2 >= G || J2 >= G) continue;
      const k2 = J2 * G + I2, c2 = cost[k2]; if (c2 === Infinity) continue;
      const nd = d + (ck + c2) * (q < 4 ? .5 : .70711);
      if (nd < dist[k2]) { dist[k2] = nd; lab[k2] = L; heap.push(nd, k2); }
    }
    if ((++it & 1023) === 0 && over()) yield;
  }
  // ---- land the fronts never reached (islands): big ones become virtual manors ----
  const stack = new Int32Array(GG), mark = new Uint8Array(GG);
  const bfs = (k0, test, fn) => { let sp = 0, n = 0; stack[sp++] = k0; mark[k0] = 1;
    while (sp) { const k = stack[--sp]; fn(k, n++); const I = k % G, J = (k - I) / G;
      if (I > 0 && !mark[k - 1] && test(k - 1)) { mark[k - 1] = 1; stack[sp++] = k - 1; }
      if (I < G - 1 && !mark[k + 1] && test(k + 1)) { mark[k + 1] = 1; stack[sp++] = k + 1; }
      if (J > 0 && !mark[k - G] && test(k - G)) { mark[k - G] = 1; stack[sp++] = k - G; }
      if (J < G - 1 && !mark[k + G] && test(k + G)) { mark[k + G] = 1; stack[sp++] = k + G; } }
    return n; };
  for (let k = 0; k < GG; k++) {
    if ((k & 4095) === 4095 && over()) yield;
    if (wet[k] || lab[k] || mark[k]) continue;
    const list = []; bfs(k, q => !wet[q] && !lab[q], q => list.push(q));
    if (list.length < TUNE.islandMin) continue;
    let sx = 0, sz = 0; for (const q of list) { sx += q % G; sz += (q / G) | 0; }
    sx /= list.length; sz /= list.length;
    let best = list[0], bd = 1e18; for (const q of list) { const d = (q % G - sx) ** 2 + (((q / G) | 0) - sz) ** 2; if (d < bd) { bd = d; best = q; } }
    seeds.push({ I: best % G, J: (best / G) | 0, x: (best % G + .5) * CS, z: (((best / G) | 0) + .5) * CS, s: null });
    const L = seeds.length; for (const q of list) lab[q] = L;
  }
  if (over()) yield;
  // ---- fragments under islandMin cells (and whole manors that small) join their majority neighbour ----
  mark.fill(0);
  const tot = new Int32Array(seeds.length + 1);
  for (let k0 = 0; k0 < GG; k0 += 65536) { countInto(lab, tot, k0, Math.min(GG, k0 + 65536)); if (over()) yield; }
  // components as runs of one shared typed array (no per-component garbage)
  const comps = [], order = new Int32Array(GG); let on = 0;
  if (over()) yield;
  for (let k = 0; k < GG; k++) {
    if (!lab[k] || mark[k]) continue;
    const L = lab[k], sk = seeds[L - 1].J * G + seeds[L - 1].I, start = on;
    let hasSeed = false;
    bfs(k, q => lab[q] === L, q => { order[on++] = q; if (q === sk) hasSeed = true; });
    comps.push({ L, start, len: on - start, hasSeed });
    if (over()) yield;                      // one component (a whole manor at most) per check
  }
  const mainOf = new Map();
  for (const c of comps) { const m = mainOf.get(c.L); if (!m || (c.hasSeed && !m.hasSeed) || (c.hasSeed === m.hasSeed && c.len > m.len)) mainOf.set(c.L, c); }
  for (const c of comps) {
    if (!(c.len < TUNE.islandMin && (mainOf.get(c.L) !== c || tot[c.L] < TUNE.islandMin))) continue;
    const vote = new Map();
    c.list = order.subarray(c.start, c.start + c.len);
    for (const q of c.list) { const I = q % G, J = (q - I) / G;
      for (const k2 of [I > 0 ? q - 1 : -1, I < G - 1 ? q + 1 : -1, J > 0 ? q - G : -1, J < G - 1 ? q + G : -1]) {
        if (k2 < 0) continue; const L2 = lab[k2]; if (L2 && L2 !== c.L) vote.set(L2, (vote.get(L2) || 0) + 1); } }
    let bestL = 0, bv = 0; vote.forEach((v, L2) => { if (v > bv || (v === bv && L2 < bestL)) { bv = v; bestL = L2; } });
    if (bestL) { for (const q of c.list) lab[q] = bestL; tot[c.L] -= c.list.length; tot[bestL] += c.list.length; }
    if (over()) yield;
  }
  // compact labels -> manor ids 1..M in seed order
  const remap = new Int32Array(seeds.length + 1), mSeed = [null]; let M = 0;
  for (let L = 1; L <= seeds.length; L++) if (tot[L] > 0 && M < TUNE.maxManors) { remap[L] = ++M; mSeed.push(seeds[L - 1]); }
  for (let k0 = 0; k0 < GG; k0 += 65536) { remapRange(lab, remap, k0, Math.min(GG, k0 + 65536)); if (over()) yield; }
  // every place lies in some manor; a manor is named after (and seated on) its principal place (sets are in priority order)
  const mPlaces = []; for (let m = 0; m <= M; m++) mPlaces.push([]);
  for (const s of sets) {
    const I = clamp(Math.floor(s.x / CS), 0, G - 1), J = clamp(Math.floor(s.z / CS), 0, G - 1);
    let m = lab[J * G + I]; if (!m) { const c = dryNear(I, J); if (c) m = lab[c[1] * G + c[0]]; }
    if (m) mPlaces[m].push(s);
  }
  for (let m = 1; m <= M; m++) { const p = mPlaces[m][0]; mSeed[m] = Object.assign({}, mSeed[m], p ? { s: p, x: p.x, z: p.z } : { s: null }, { ps: mPlaces[m] }); }
  if (over()) yield;
  // ---- manor stats at 32 m: centroid, size, adjacency with the share of the shared border on a river ----
  const cnt = new Int32Array(M + 1), sx = new Float64Array(M + 1), sz = new Float64Array(M + 1), pairs = new Map();
  for (let J0 = 0; J0 < G; J0 += 32) { manorStats(lab, riv, G, J0, Math.min(G, J0 + 32), cnt, sx, sz, pairs); if (over()) yield; }
  const cx = m => (sx[m] / cnt[m] + .5) * CS, cz = m => (sz[m] / cnt[m] + .5) * CS;
  const nb = []; for (let m = 0; m <= M; m++) nb.push([]);
  pairs.forEach((p, key) => { const a = Math.floor(key / 65536), b = key - a * 65536; nb[a].push([b, p[1] / p[0]]); nb[b].push([a, p[1] / p[0]]); });
  nb.forEach(l => l.sort((p, q) => p[0] - q[0]));
  if (over()) yield;
  // ---- shires: farthest-point seeds over manor centroids >= 5 km apart, grown over the manor graph ----
  const land = F.land;
  const landKm2 = land * CS * CS / 1e6, K = clamp(Math.round(landKm2 / TUNE.shireKm2), 3, 6);
  const shire = new Uint8Array(M + 1), sSeeds = [];
  if (M) {
    let lx = 0, lz = 0; for (let m = 1; m <= M; m++) { lx += cx(m) * cnt[m]; lz += cz(m) * cnt[m]; }
    let tw = 0; for (let m = 1; m <= M; m++) tw += cnt[m]; lx /= tw; lz /= tw;
    let first = 1, fd = -1; for (let m = 1; m <= M; m++) { const d = Math.hypot(cx(m) - lx, cz(m) - lz); if (d > fd + 1e-6) { fd = d; first = m; } }
    sSeeds.push(first);
    while (sSeeds.length < K) {
      let best = 0, bd = -1;
      for (let m = 1; m <= M; m++) { let d = 1e18; for (const s of sSeeds) d = Math.min(d, Math.hypot(cx(m) - cx(s), cz(m) - cz(s))); if (d > bd + 1e-6) { bd = d; best = m; } }
      if (bd < TUNE.shireGap) break; sSeeds.push(best);
    }
    const sd = new Float32Array(M + 1).fill(Infinity), hp = new D.Heap(256);   // float32, exactly like the heap keys
    sSeeds.forEach((m, i) => { sd[m] = 0; shire[m] = i + 1; hp.push(0, m); });
    while (hp.n) {
      const a = hp.pop(), d = hp.lastKey; if (d > sd[a]) continue;
      for (const [b, rf] of nb[a]) { const nd = d + Math.hypot(cx(a) - cx(b), cz(a) - cz(b)) * (1 + 6 * rf); if (nd < sd[b]) { sd[b] = nd; shire[b] = shire[a]; hp.push(nd, b); } }
    }
    for (let m = 1; m <= M; m++) if (!shire[m]) { let bs = 1, bd = 1e18; sSeeds.forEach((s, i) => { const d = Math.hypot(cx(m) - cx(s), cz(m) - cz(s)); if (d < bd) { bd = d; bs = i + 1; } }); shire[m] = bs; }
  }
  if (over()) yield;
  // ---- names: settlement manors keep their place's name; virtual manors are named from the land ----
  const used = new Set(sets.map(s => s.name));
  const manors = [null];
  for (let m = 1; m <= M; m++) {
    const sd = mSeed[m], k = sd.J * G + sd.I;
    let riverNear = false;
    for (let dj = -6; dj <= 6 && !riverNear; dj++) for (let di = -6; di <= 6; di++) { const a = sd.I + di, b = sd.J + dj; if (a >= 0 && b >= 0 && a < G && b < G && riv[b * G + a]) { riverNear = true; break; } }
    if ((m & 7) === 7 && over()) yield;
    const wood = env.cover ? env.cover(sd.x, sd.z, 200) > .45 : false;
    const name = sd.s ? sd.s.name : terrainName(r, { high: rel[k] > 22 || h[k] > 180, water: riverNear, wood }, used);
    manors.push({ id: m, name, parent: 0, group: m, seat: [Math.round(sd.x), Math.round(sd.z)], virt: sd.s ? 0 : 1, uid: sd.s ? sd.s.uid || 0 : 0, stype: sd.s ? sd.s.type : 0 });
  }
  // shire names: "<largest place>shire"
  const shireNames = [''];
  const usedS = new Set();
  for (let s = 1; s <= sSeeds.length; s++) {
    const inS = []; for (let m = 1; m <= M; m++) if (shire[m] === s) inS.push(m);
    const places = inS.filter(m => mSeed[m].s).sort((a, b) => (mSeed[a].s.type === 1 ? 0 : 1) - (mSeed[b].s.type === 1 ? 0 : 1) || (mSeed[b].s.houses || 0) - (mSeed[a].s.houses || 0) || a - b);
    const byArea = inS.slice().sort((a, b) => cnt[b] - cnt[a] || a - b);
    let nm = null;
    for (const m of places.concat(byArea)) { const n = rootOf(manors[m].name).replace(/\s+/g, '') + 'shire'; if (!usedS.has(n)) { nm = n; break; } }
    if (!nm) nm = uniqueName((pick(r, PRE)) + 'shire', usedS);
    usedS.add(nm); shireNames.push(nm);
  }
  // ---- holders at the begin year ----
  const Hs = makeHolders(r, M, nb, mSeed, manors, cnt, cx, cz);
  if (over()) yield;
  // ---- upsample to 16 m: nearest, then a 3x3 majority, then sea/lake cells -> 0 ----
  const cells = new Uint32Array(N * N), tmp = new Uint16Array(N * N);
  for (let j0 = 0; j0 < N; j0 += 16) { upsampleRows(lab, G, N, tmp, j0, Math.min(N, j0 + 16)); if (over()) yield; }
  const abbeySeat = new Uint8Array(M + 1); Hs.holders.forEach(H => { if (H && H.kind === 'abbey') abbeySeat[H.seatManor] = 1; });
  const vs = new Uint16Array(8);
  for (let j0 = 0; j0 < N; j0 += 8) { majorityRows(tmp, cells, N, j0, Math.min(N, j0 + 8), shire, abbeySeat, env.wetV, vs); if (over()) yield; }
  // ---- tri-shire points (2x2 blocks with three distinct shires), 500 m apart ----
  const triShire = [];
  for (let j0 = 0; j0 < N - 1; j0 += 16) { triShireRows(cells, N, j0, Math.min(N - 1, j0 + 16), CELL, triShire); if (over()) yield; }
  // the topology cache of the begin grid, built here in slices so the first seasons never rebuild it synchronously
  const topo0 = yield* topoGen({ N, cells, cver: 0 }, tk);
  Object.assign(out, { N, cells, manors, shireNames, holders: Hs.holders, owner: Hs.owner, triShire, cost32: cost, topo: topo0, done: true, M, K: sSeeds.length });
  return out;
}
// ---- survey inner loops as plain functions (optimisable), run in row chunks by the generator ----
function countInto(lab, tot, k0, k1) { for (let k = k0; k < k1; k++) tot[lab[k]]++; }
function remapRange(lab, remap, k0, k1) { for (let k = k0; k < k1; k++) lab[k] = remap[lab[k]]; }
function manorStats(lab, riv, G, J0, J1, cnt, sx, sz, pairs) {
  const pair = (a, b, r) => { const key = a < b ? a * 65536 + b : b * 65536 + a; let p = pairs.get(key); if (!p) pairs.set(key, p = [0, 0]); p[0]++; if (r) p[1]++; };
  for (let J = J0; J < J1; J++) for (let I = 0; I < G; I++) {
    const k = J * G + I, a = lab[k]; if (!a) continue;
    cnt[a]++; sx[a] += I; sz[a] += J;
    if (I < G - 1) { const b = lab[k + 1]; if (b && b !== a) pair(a, b, riv[k] || riv[k + 1]); }
    if (J < G - 1) { const b = lab[k + G]; if (b && b !== a) pair(a, b, riv[k] || riv[k + G]); }
  }
}
function upsampleRows(lab, G, N, tmp, j0, j1) {
  for (let j = j0; j < j1; j++) {
    const J = Math.min(G - 1, j >> 1);
    for (let i = 0; i < N; i++) {
      let L = lab[J * G + Math.min(G - 1, i >> 1)];
      if (!L) { // a dry 16 m cell whose 32 m sample was wet: borrow the commonest neighbouring manor
        let bl = 0, bc = 0; const I = i >> 1;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a = I + di, b = J + dj; if (a < 0 || b < 0 || a >= G || b >= G) continue;
          const l2 = lab[b * G + a]; if (!l2) continue;
          let c = 0; for (let ej = -1; ej <= 1; ej++) for (let ei = -1; ei <= 1; ei++) { const a2 = I + ei, b2 = J + ej; if (a2 >= 0 && b2 >= 0 && a2 < G && b2 < G && lab[b2 * G + a2] === l2) c++; }
          if (c > bc || (c === bc && l2 < bl)) { bc = c; bl = l2; }
        }
        L = bl;
      }
      tmp[j * N + i] = L;
    }
  }
}
function majorityRows(tmp, cells, N, j0, j1, shire, abbeySeat, wetV, vs) {
  for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let L = tmp[k];
    if (i > 0 && j > 0 && i < N - 1 && j < N - 1) {
      // 3x3 majority: a cell changes only when 5+ of its 8 neighbours share another manor
      vs[0] = tmp[k - N - 1]; vs[1] = tmp[k - N]; vs[2] = tmp[k - N + 1]; vs[3] = tmp[k - 1]; vs[4] = tmp[k + 1]; vs[5] = tmp[k + N - 1]; vs[6] = tmp[k + N]; vs[7] = tmp[k + N + 1];
      let same = 0; for (let t = 0; t < 8; t++) if (vs[t] === L) same++;
      if (same < 8) for (let t = 0; t < 8; t++) { const v = vs[t]; if (v === L || !v) continue; let n = 0; for (let u = 0; u < 8; u++) if (vs[u] === v) n++; if (n >= 5) { L = v; break; } }
    }
    if (!L || wetV(i, j)) { cells[k] = 0; continue; }
    cells[k] = (L | (shire[L] << SH_SHIFT) | (abbeySeat[L] ? ABBEY : 0)) >>> 0;
  }
}
function triShireRows(cells, N, j0, j1, CELL, out) {   // 2x2 blocks with three distinct shires, 500 m apart
  for (let j = j0; j < j1; j++) for (let i = 0; i < N - 1; i++) {
    const k = j * N + i;
    const a = cells[k] >>> SH_SHIFT & 255, b = cells[k + 1] >>> SH_SHIFT & 255, c = cells[k + N] >>> SH_SHIFT & 255, d = cells[k + N + 1] >>> SH_SHIFT & 255;
    if (a === b && a === c && a === d) continue;
    let x0 = 0, x1 = 0, x2 = 0, n = 0;
    for (let t = 0; t < 4; t++) { const v = t === 0 ? a : t === 1 ? b : t === 2 ? c : d; if (!v || v === x0 || v === x1 || v === x2) continue; if (n === 0) x0 = v; else if (n === 1) x1 = v; else if (n === 2) x2 = v; n++; }
    if (n < 3) continue;
    const x = (i + 1) * CELL, z = (j + 1) * CELL;
    if (out.some(t => Math.hypot(t[0] - x, t[1] - z) < TUNE.stoneGap)) continue;
    out.push([x, z].concat([x0, x1, x2].sort((p, q) => p - q)));
  }
}
function runSurvey(env, seed) { return runGen(surveyGen(env, seed, null, {})); }

// The holders of the begin year: the Crown (the rest, at least 10%), one See, each abbey (1-4 manors next to it),
// each castle an honour of 3-8 contiguous manors, 6-12 knightly houses of 1-3 manors each.
function makeHolders(r, M, nb, mSeed, manors, cnt, cx, cz) {
  const owner = new Int32Array(M + 1), holders = [null];
  const add = h => { h.id = holders.length; holders.push(h); return h.id; };
  const usedSur = new Set();
  const surname = seatM => {
    if (seatM && r() < .45) { const s = 'de ' + rootOf(manors[seatM].name); if (!usedSur.has(s)) { usedSur.add(s); return s; } }
    for (let t = 0; t < 40; t++) { const s = pick(r, SURNAMES); if (!usedSur.has(s)) { usedSur.add(s); return s; } }
    return uniqueName(pick(r, SURNAMES), usedSur);
  };
  const crown = add({ kind: 'crown', name: 'the Crown', honour: 'the Royal Demesne', seatManor: 0, hue: HUE.crown, sur: '' });
  const grab = (m, h) => { if (m && !owner[m]) { owner[m] = h; return true; } return false; };
  const grow = (seat, h, extra) => {   // seat + up to `extra` unassigned contiguous manors (BFS order, shuffled per ring)
    if (!grab(seat, h)) return 0;
    let got = 1; const q = [seat];
    while (q.length && got <= extra) {
      const a = q.shift(); const ns = shuffle(nb[a].map(p => p[0]), r);
      for (const b of ns) { if (got > extra) break; if (grab(b, h)) { got++; q.push(b); } }
    }
    return got;
  };
  const placeIn = (m, t) => mSeed[m].ps.find(s => s.type === t) || null;
  const places = t => { const a = []; for (let m = 1; m <= M; m++) if (placeIn(m, t)) a.push(m); return a; };
  // a place whose own manor is already taken is seated on the nearest free neighbour instead
  const freeSeat = m => { if (!owner[m]) return m; for (const [b] of nb[m]) if (!owner[b]) return b; return 0; };
  // the See: the largest church town
  if (M) {
    const towns = places(1).sort((a, b) => (churchBit(placeIn(b, 1)) - churchBit(placeIn(a, 1))) || (placeIn(b, 1).houses || 0) - (placeIn(a, 1).houses || 0) || a - b);
    let seat = towns[0];
    if (!seat) { let bd = 1e18, mx = 0, mz = 0, n = 0; for (let m = 1; m <= M; m++) { mx += cx(m); mz += cz(m); n++; } mx /= n; mz /= n; for (let m = 1; m <= M; m++) { const d = Math.hypot(cx(m) - mx, cz(m) - mz); if (d < bd) { bd = d; seat = m; } } }
    const sn = rootOf(placeIn(seat, 1) ? placeIn(seat, 1).name : manors[seat].name);
    const see = add({ kind: 'see', name: 'the See of ' + sn, honour: 'the lands of the See of ' + sn, seatManor: seat, hue: HUE.see, sur: '' });
    grow(seat, see, 1 + Math.floor(r() * 2));
  }
  for (const m0 of places(4)) {
    const m = freeSeat(m0); if (!m) continue;
    const pn = placeIn(m0, 4).name, nm = /abbey|priory|minster/i.test(pn) ? pn : 'the Abbey of ' + pn;
    const h = add({ kind: 'abbey', name: nm, honour: 'the lands of ' + nm, seatManor: m, hue: HUE.abbey + Math.round(r() * 8), sur: '' });
    grow(m, h, Math.floor(r() * 4));
  }
  let hi = 0;
  for (const m0 of places(3)) {
    const m = freeSeat(m0); if (!m) continue;
    const root = rootOf(placeIn(m0, 3).name), sur = 'de ' + root; usedSur.add(sur);
    const h = add({ kind: 'house', name: 'the ' + sur + ' family', honour: 'the Honour of ' + root, seatManor: m, hue: houseHue(hi++), sur, castle: 1 });
    grow(m, h, 2 + Math.floor(r() * 6));
  }
  const nK = 6 + Math.floor(r() * 7);
  for (let t = 0; t < nK; t++) {
    const free = [], w = [];
    for (let m = 1; m <= M; m++) if (!owner[m]) { free.push(m); w.push(mSeed[m].s ? 3 : 1); }
    if (!free.length) break;
    const seat = free[pickIdx(r, w)], sur = surname(seat);
    const h = add({ kind: 'house', name: 'the ' + sur + ' family', honour: feeName(sur), seatManor: seat, hue: houseHue(hi++), sur });
    grow(seat, h, Math.floor(r() * 3));
  }
  for (let m = 1; m <= M; m++) if (!owner[m]) owner[m] = crown;
  // the Crown keeps at least 10%: knights give back their outlying manors, newest first
  const crownN = () => { let n = 0; for (let m = 1; m <= M; m++) if (owner[m] === crown) n++; return n; };
  for (let h = holders.length - 1; h > 0 && crownN() < Math.ceil(M * .1); h--) {
    if (holders[h].kind !== 'house') continue;
    for (let m = 1; m <= M && crownN() < Math.ceil(M * .1); m++) if (owner[m] === h && m !== holders[h].seatManor) owner[m] = crown;
  }
  return { holders, owner };
}
const churchBit = s => (s.ms === undefined || s.ms === null ? 1 : s.ms) & 1;
const feeName = sur => 'the ' + (sur.indexOf('de ') === 0 ? sur.slice(3) : sur) + ' fee';

// Rasterise rivers (Float32 stride 4: x, z, y, width) onto a G x G mask.
function rasterRivers(rivers, G, cs) {
  const out = new Uint8Array(G * G);
  for (const rv of rivers || []) {
    const s = rv && rv.s; if (!s || s.length < 8) continue;
    for (let k = 0; k + 7 < s.length; k += 4) {
      const ax = s[k], az = s[k + 1], bx = s[k + 4], bz = s[k + 5], w = Math.max(s[k + 3], s[k + 7]) / 2;
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (cs * .5)));
      const rc = Math.max(0, Math.round((w - cs * .5) / cs));
      for (let t = 0; t <= n; t++) {
        const x = ax + (bx - ax) * t / n, z = az + (bz - az) * t / n, I = Math.floor(x / cs), J = Math.floor(z / cs);
        for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) { const a = I + di, b = J + dj; if (a >= 0 && b >= 0 && a < G && b < G) out[b * G + a] = 1; }
      }
    }
  }
  return out;
}

// Write a finished survey into the (empty) realm at the begin year.
function applySurvey(st, res, year) {
  st.cells.set(res.cells);
  st.manors = [null];
  for (let m = 1; m < res.manors.length; m++) st.manors.push(freeze(Object.assign({}, res.manors[m], { y0: year, seat: freeze(res.manors[m].seat.slice()) })));
  st.holders = [null];
  for (let h = 1; h < res.holders.length; h++) st.holders.push(freeze(Object.assign({}, res.holders[h], { y0: year, y1: 0 })));
  st.hold = [null];
  for (let m = 1; m < st.manors.length; m++) st.hold.push(freeze([freeze([year, res.owner[m] || 1])]));
  st.shireNames = freeze(res.shireNames.slice());
  st.ghosts = []; st.stones = []; st.x = X0;
  st.cost32 = res.cost32 || null;
  st.ready = true; st.cver++; st.topo = null; st.parish = null; st.memo = null;
  // adopt the survey's topology (built over exactly these cells); consumed once, so a retried begin never reuses
  // an object later seasons have patched
  if (res.topo && res.topo.cnt) { st.topo = res.topo; st.topo.ver = st.cver; st.topo.nb = null; res.topo = null; }
}

// =====================================================================================================
// Old bounds (ghosts): holder outline edges that existed before a change and not after, on the 32 m lattice
// =====================================================================================================
// Sampled per changed manor (bbox + 2 samples), overlapping windows merged, so scattered estates stay cheap.
function ghostOpen(st, T, ms) {
  const G = st.N >> 1, rects = [];
  for (const m of ms) {
    const b = m * 4; if (!T.cnt[m]) continue;
    rects.push([Math.max(0, (T.bb[b] >> 1) - 2), Math.max(0, (T.bb[b + 1] >> 1) - 2), Math.min(G - 1, (T.bb[b + 2] >> 1) + 2), Math.min(G - 1, (T.bb[b + 3] >> 1) + 2)]);
  }
  for (let merged = true; merged;) {
    merged = false;
    for (let p = 0; p < rects.length && !merged; p++) for (let q = p + 1; q < rects.length; q++) {
      const A = rects[p], B = rects[q];
      if (A[0] > B[2] + 1 || B[0] > A[2] + 1 || A[1] > B[3] + 1 || B[1] > A[3] + 1) continue;
      rects[p] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]; rects.splice(q, 1); merged = true; break;
    }
  }
  if (!rects.length) return null;
  return rects.map(R => { const g = { I0: R[0], J0: R[1], w: R[2] - R[0] + 1, h: R[3] - R[1] + 1 }; g.a = ghostSample(st, g); return g; });
}
function ghostSample(st, g) {
  const N = st.N, C = st.cells, a = new Int32Array(g.w * g.h);
  for (let J = 0; J < g.h; J++) for (let I = 0; I < g.w; I++) { const m = C[(2 * (g.J0 + J)) * N + 2 * (g.I0 + I)] & MANOR; a[J * g.w + I] = m ? holderNow(st, m) : 0; }
  return a;
}
function ghostClose(st, gs, label, y0, y1) {
  if (!gs) return null;
  const E = [], seen = new Set();
  for (const g of gs) {
    const b = ghostSample(st, g), a = g.a, w = g.w, h = g.h;
    const gone = (u, v) => a[u] && a[v] && a[u] !== a[v] && b[u] === b[v];
    const push = (o, p, q, e) => { const key = ((p + 2) * 1024 + q + 2) * 2 + o; if (!seen.has(key)) { seen.add(key); E.push(e); } };
    for (let J = 0; J < h; J++) for (let I = 0; I < w; I++) {
      const u = J * w + I, p = g.I0 + I, q = g.J0 + J;
      if (I + 1 < w && gone(u, u + 1)) push(0, p, q, [p, q - 1, p, q]);          // vertical edge (lattice a, b)
      if (J + 1 < h && gone(u, u + w)) push(1, p, q, [p - 1, q, p, q]);          // horizontal edge
    }
  }
  if (!E.length) return null;
  const lines = chainEdges(E).map(pl => dpSimplify(pl.map(([p, q]) => [(2 * p + 1.5) * 16, (2 * q + 1.5) * 16]), 12));
  let len = 0, n = 0;
  for (const pl of lines) { n += pl.length * 2 + 2; for (let t = 1; t < pl.length; t++) len += Math.hypot(pl[t][0] - pl[t - 1][0], pl[t][1] - pl[t - 1][1]); }
  const f = new Float32Array(Math.max(0, n - 2)); let o = 0;
  lines.forEach((pl, li) => { if (li) { f[o++] = NaN; f[o++] = NaN; } for (const p of pl) { f[o++] = p[0]; f[o++] = p[1]; } });
  const gh = freeze({ label, y0, y1, pts: f32ToB64(f), len: Math.round(len) });
  st.ghosts = st.ghosts.concat([gh]);
  if (st.ghosts.length > TUNE.maxGhosts) {   // drop the least (length x recency)
    let worst = 0, ws = Infinity;
    st.ghosts.forEach((q, i) => { const s = q.len / (1 + Math.max(0, y1 - q.y1) / 100); if (s < ws) { ws = s; worst = i; } });
    st.ghosts = st.ghosts.filter((q, i) => i !== worst);
  }
  return gh;
}
// edges [a0,b0,a1,b1] on an integer lattice -> polylines (walk from odd-degree vertices first, then loops)
function chainEdges(E) {
  const key = (a, b) => (a + 2) * 65536 + (b + 2), at = new Map(), used = new Uint8Array(E.length);
  E.forEach((e, i) => { for (const k of [key(e[0], e[1]), key(e[2], e[3])]) { let l = at.get(k); if (!l) at.set(k, l = []); l.push(i); } });
  const out = [];
  const walk = (a, b) => {
    const pl = [[a, b]];
    for (;;) {
      const l = at.get(key(a, b)); let nx = -1;
      for (const i of l) if (!used[i]) { nx = i; break; }
      if (nx < 0) break;
      used[nx] = 1; const e = E[nx];
      if (e[0] === a && e[1] === b) { a = e[2]; b = e[3]; } else { a = e[0]; b = e[1]; }
      pl.push([a, b]);
    }
    if (pl.length > 1) out.push(pl);
  };
  const starts = Array.from(at.keys()).sort((p, q) => p - q);
  for (const k of starts) if (at.get(k).length % 2) walk(Math.floor(k / 65536) - 2, k % 65536 - 2);
  for (let i = 0; i < E.length; i++) if (!used[i]) walk(E[i][0], E[i][1]);
  return out;
}
function dpSimplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let dm = -1, im = -1;
    const ax = pts[a][0], az = pts[a][1], dx = pts[b][0] - ax, dz = pts[b][1] - az, L = Math.hypot(dx, dz);
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - az) : Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L;
      if (d > dm) { dm = d; im = i; }
    }
    if (dm > tol) { keep[im] = 1; st.push([a, im], [im, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}

// =====================================================================================================
// Season (spec §6E realm.season): begin grid, renames, castle houses, See seats, Winter stones, transfers.
// env adds: settlements(), zoneSid(k), mainStreet(sid), specials(sid), works(), stoneOk(x,z), hAt(x,z),
//           touch(i0,j0,i1,j1) (History), river32(G). ctx per §5.3.
// =====================================================================================================
function seasonStep(st, env, ctx, res, seed) {
  let changed = false;
  if (ctx.first && !st.ready) {
    if (!res || !res.done) res = runSurvey(env, seed);
    env.touch(0, 0, st.N - 1, st.N - 1);
    applySurvey(st, res, ctx.year);
    beginExtras(st, env, ctx, res);
    ctx.mark();
    return true;   // the topology cache is rebuilt in slices (part.update) before the next season needs it
  }
  if (!st.ready) return changed;
  const r = ctx.rng('realm');
  // the glue sets lazyTopo when the topology cache is still being rebuilt in slices (after a load or an undo) and
  // this commit has no time to finish it: the state-derived steps simply happen next season, and a successful
  // transfer roll is owed rather than lost
  if (ctx.lazyTopo && !(st.topo && st.topo.ver === st.cver)) return transfers(st, env, ctx, null, null, r);
  const T = topo(st), sets = (env.settlements() || []).filter(Boolean);
  if (renames(st, env, ctx, T, sets)) changed = true;
  if (ctx.season === 3 && raiseHouses(st, env, ctx, T, sets, r)) changed = true;
  if (seeSeats(st, env, ctx, T, sets, r)) changed = true;
  if (st.x.tri && st.x.tri.length && triStones(st, env, ctx)) changed = true;
  if (ctx.season === 3 && winterStone(st, env, ctx, T, r)) changed = true;
  if (transfers(st, env, ctx, T, sets, r)) changed = true;
  return changed;
}
function beginExtras(st, env, ctx, res) {
  const sets = (env.settlements() || []).filter(Boolean);
  const tri = freeze((res.triShire || []).map(t => freeze(t.slice())));
  st.x = freeze(Object.assign({}, X0, { castles: freeze(sets.filter(s => s.type === 3).map(s => s.uid).sort((a, b) => a - b)), tri }));
  triStones(st, env, ctx);
}
// tri-shire stones: tried at the begin commit while time lasts; what is left waits in st.x.tri for later seasons
// (stone probes can hit Town.collide / Roads.near, so a crowded begin commit must not blow the 12 ms budget)
function triStones(st, env, ctx) {
  const L = st.x.tri; if (!L || !L.length) return false;
  let n = 0;
  for (; n < L.length; n++) {
    if (ctx.timeLeft && ctx.timeLeft() < 3) break;
    const t = L[n], nm = t.slice(2).map(q => st.shireNames[q]).filter(Boolean);
    const s = placeStone(st, env, t[0], t[1], ctx.year, listJoin(nm));
    if (s) ctx.log({ k: 'stone', imp: 1, txt: `A stone marks where ${listJoin(nm)} meet.`, x: s.x, z: s.z });
  }
  if (!n) return false;
  st.x = freeze(Object.assign({}, st.x, { tri: freeze(L.slice(n)) }));
  ctx.mark();
  return true;
}
function placeStone(st, env, x0, z0, year, label) {
  if (st.stones.length >= TUNE.maxStones) return null;
  for (let rr = 0; rr <= 64; rr += 8) {             // at most 97 probes (8 rings x 12 angles + the point itself)
    const n = rr ? 12 : 1;
    for (let t = 0; t < n; t++) {
      const an = t / n * Math.PI * 2, x = x0 + Math.cos(an) * rr, z = z0 + Math.sin(an) * rr;
      if (st.stones.some(s => Math.hypot(s.x - x, s.z - z) < TUNE.stoneGap)) return null;
      if (!env.stoneOk(x, z)) continue;
      const s = freeze({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, y: Math.round((env.hAt ? env.hAt(x, z) : 0) * 100) / 100,
        rot: Math.round((H32(x | 0, z | 0, 'stone') / 4294967296) * 6283) / 1000, year, label });
      st.stones = st.stones.concat([s]);
      return s;
    }
  }
  return null;
}
const settleAt = (st, s) => st.cells[cellOf(st, s.x, s.z)] & MANOR;
// a history founding inside a virtual manor renames it (state-derived: happens once, the manor stops being virtual)
function renames(st, env, ctx, T, sets) {
  let any = false;
  for (const s of sets) {
    if (s.by !== 'h' || !s.name || s.type === 2) continue;
    const m = settleAt(st, s), M = st.manors[m];
    if (!M || !M.virt || M.aka) continue;
    const nm = rootOf(s.name);
    st.manors[m] = freeze(Object.assign({}, M, { name: nm, aka: M.name, ry: ctx.year, virt: 0, uid: s.uid || 0 }));
    ctx.log({ k: 'rename', imp: 1, txt: `The manor of ${M.name}, now called ${nm}.`, x: s.x, z: s.z, uid: s.uid });
    ctx.mark(); any = true;
  }
  return any;
}
function newHouse(st, r, seatM, year, opts) {
  if (st.holders.length > TUNE.maxHolders) return 0;
  opts = opts || {};
  const usedSur = new Set(); st.holders.forEach(H => { if (H && H.sur) usedSur.add(H.sur); });
  let sur = opts.sur;
  if (!sur && seatM && r() < .4) { const s = 'de ' + rootOf(st.manors[seatM].name); if (!usedSur.has(s)) sur = s; }
  if (!sur) for (let t = 0; t < 30 && !sur; t++) { const s = pick(r, SURNAMES); if (!usedSur.has(s)) sur = s; }
  if (!sur) sur = uniqueName(pick(r, SURNAMES), usedSur);
  let nh = 0; st.holders.forEach(H => { if (H && H.kind === 'house') nh++; });
  const id = st.holders.length;
  st.holders.push(freeze({ id, kind: 'house', name: 'the ' + sur + ' family', honour: opts.honour || feeName(sur), seatManor: seatM, hue: houseHue(nh), y0: year, y1: 0, sur, castle: opts.castle ? 1 : 0 }));
  return id;
}
const knight = (st, h, r) => { const H = st.holders[h]; if (!H) return 'a knight'; if (H.kind === 'crown') return 'the King'; return H.sur ? 'Sir ' + pick(r, GIVEN) + ' ' + H.sur : cap1(H.name); };
function moveManors(st, T, ms, toH, year, loser, label) {
  const g = ghostOpen(st, T, ms);
  let y0 = 0; for (const m of ms) y0 = Math.max(y0, lastHoldYear(st, m), st.manors[m].y0 || 0);
  for (const m of ms) setHold(st, m, year, toH);
  ghostClose(st, g, label || `Bounds of ${honourName(st, loser)}, to ${year}`, y0, year);
}
// a new castle raises a house the next Winter: its manor plus 1-3 crown neighbours
function raiseHouses(st, env, ctx, T, sets, r) {
  let any = false;
  for (const s of sets) {
    if (s.type !== 3 || st.x.castles.indexOf(s.uid) >= 0) continue;
    if (s.fy && s.fy >= ctx.year) continue;
    const m = settleAt(st, s); if (!m) continue;
    const hm = holderNow(st, m), kind = st.holders[hm] && st.holders[hm].kind;
    const take = (kind === 'crown' || kind === 'house') ? [m] : [];
    const crown = nbOf(T, m).filter(b => T.cnt[b] && st.holders[holderNow(st, b)] && st.holders[holderNow(st, b)].kind === 'crown');
    shuffle(crown, r); take.push(...crown.slice(0, 1 + Math.floor(r() * 3)));
    st.x = freeze(Object.assign({}, st.x, { castles: freeze(st.x.castles.concat([s.uid]).sort((a, b) => a - b)) }));
    ctx.mark(); any = true;
    if (!take.length) continue;
    const root = rootOf(s.name), h = newHouse(st, r, take[0], ctx.year, { sur: 'de ' + root, honour: 'the Honour of ' + root, castle: true });
    if (!h) continue;
    const losers = new Set(take.map(b => holderNow(st, b)));
    moveManors(st, T, take, h, ctx.year, Array.from(losers)[0]);
    const others = take.filter(b => b !== m).map(b => st.manors[b].name);
    ctx.log({ k: 'house', imp: 2, uid: s.uid, x: s.x, z: s.z,
      txt: `The de ${root} family is raised to hold the new castle at ${s.name}${others.length ? ', with ' + listJoin(others) : ''}: the Honour of ${root}.` });
  }
  return any;
}
// a completed cathedral makes its town a See seat, and the See gains 1-2 manors
function seeSeats(st, env, ctx, T, sets, r) {
  const ws = env.works ? env.works() || [] : [];
  let any = false;
  for (const w of ws) {
    if (!w || w.kind !== 'cathedral' || !w.done || st.x.sees.indexOf(w.wid) >= 0) continue;
    st.x = freeze(Object.assign({}, st.x, { sees: freeze(st.x.sees.concat([w.wid])) }));
    ctx.mark(); any = true;
    const s = sets.find(q => q.uid === w.uid); if (!s) continue;
    const m = settleAt(st, s); if (!m) continue;
    let see = 0; st.holders.forEach(H => { if (H && H.kind === 'see' && H.seatManor === m) see = H.id; });
    const isNew = !see;
    if (isNew) {
      if (st.holders.length > TUNE.maxHolders) continue;
      see = st.holders.length;
      const root = rootOf(s.name);
      st.holders.push(freeze({ id: see, kind: 'see', name: 'the See of ' + root, honour: 'the lands of the See of ' + root, seatManor: m, hue: HUE.see, y0: ctx.year, y1: 0, sur: '' }));
    }
    const hk = st.holders[holderNow(st, m)] && st.holders[holderNow(st, m)].kind;
    const take = (hk === 'crown' || hk === 'house') ? [m] : [];
    const crown = shuffle(nbOf(T, m).filter(b => T.cnt[b] && holderNow(st, b) === 1), r);
    take.push(...crown.slice(0, 1 + Math.floor(r() * 2)));
    if (take.length) moveManors(st, T, take, see, ctx.year, holderNow(st, take[0]));
    ctx.log({ k: 'see', imp: 2, uid: s.uid, x: s.x, z: s.z,
      txt: `${s.name} becomes the seat of a bishop${take.length ? `, and ${st.holders[see].name} takes ${listJoin(take.map(b => st.manors[b].name))}` : ''}.` });
  }
  return any;
}
// holder tripoints (manor tripoints whose three manors have three different holders) and how long they have stood:
// derived from the hold logs and carve years, so nothing needs tracking between seasons
function holderTripoints(st, T) {
  const out = [];
  T.tri.forEach((ms, k) => {
    const hs = ms.map(m => holderNow(st, m));
    if (hs[0] === hs[1] || hs[0] === hs[2] || hs[1] === hs[2]) return;
    let since = 0; for (const m of ms) since = Math.max(since, lastHoldYear(st, m), st.manors[m] ? st.manors[m].y0 : 0);
    out.push({ k, ms, hs, since });
  });
  return out;
}
function winterStone(st, env, ctx, T, r) {
  if (st.stones.length >= TUNE.maxStones) return false;
  if (ctx.rng && ctx.rng('stone')() > TUNE.stoneChance) return false;   // own stream: the transfer rolls are unchanged
  const N = st.N;
  const c = holderTripoints(st, T).filter(t => ctx.year - t.since >= TUNE.stoneYears)
    .sort((a, b) => a.since - b.since || a.k - b.k);
  let tries = 0;
  for (const t of c) {
    const x = (t.k % N + 1) * 16, z = (Math.floor(t.k / N) + 1) * 16;
    if (st.stones.some(s => Math.hypot(s.x - x, s.z - z) < TUNE.stoneGap)) continue;
    if (++tries > 6 || (ctx.timeLeft && ctx.timeLeft() < 3)) break;   // an unplaced stone is simply tried next Winter
    const names = t.ms.map(m => st.manors[m].name);
    const s = placeStone(st, env, x, z, ctx.year, listJoin(names));
    if (!s) continue;
    ctx.log({ k: 'stone', imp: 2, x: s.x, z: s.z, txt: `A stone is set where ${listJoin(names)} meet.` });
    ctx.mark();
    return true;
  }
  return false;
}

// ---- transfers ------------------------------------------------------------------------------------------
// A successful roll that cannot run now (no time left in the commit, or the topology cache is still being rebuilt:
// T === null) is owed in st.x.owe (at most 2) and honoured by the next seasons before any fresh roll, still under
// the per-season and per-year caps, so how many transfers happen does not depend on frame timing.
function transfers(st, env, ctx, T, sets, r, forced) {
  const x = st.x, tn = x.ty === ctx.year ? x.tn : 0, owe = x.owe | 0;
  const budget = ctx.budget && ctx.budget.realm !== undefined ? ctx.budget.realm : 1;
  const roll = r(), hit = roll < TUNE.rate ? 1 : 0;
  const setOwe = v => { v = Math.max(0, Math.min(2, v)); if (v === (st.x.owe | 0)) return false; st.x = freeze(Object.assign({}, st.x, { owe: v })); ctx.mark(); return true; };
  if (!forced) {
    if (!hit && !owe) return false;
    if (budget < 1 || tn >= TUNE.perYear) return false;               // capped (spec): a fresh roll is lost, a debt waits
    // a carving transfer can take a few ms
    if (!T || (ctx.timeLeft && ctx.timeLeft() < 6)) return setOwe(owe + hit);
  }
  if (!T) T = topo(st);
  const own = holdings(st, T);
  let kinds = forced ? [forced] : Object.keys(TUNE.weights);
  // one transfer runs now: it pays off one owed roll (or is this season's own); the other stays owed
  const left = forced ? owe : owe + hit - 1;
  while (kinds.length) {
    const k = forced || kinds[pickIdx(r, kinds.map(q => TUNE.weights[q]))];
    kinds = kinds.filter(q => q !== k);
    const e = XFER[k](st, env, ctx, T, sets, r, own);
    if (e) {
      st.x = freeze(Object.assign({}, st.x, { ty: ctx.year, tn: tn + 1, owe: Math.max(0, Math.min(2, left)) }));
      ctx.log(e); ctx.mark();
      return true;
    }
    if (forced) break;
  }
  return forced ? false : setOwe(left);   // nothing fit: the roll is honoured all the same
}
const housesOf = (st, own, min) => { const a = []; own.forEach((ms, h) => { const H = st.holders[h]; if (H && H.kind === 'house' && ms.length >= (min || 1)) a.push(h); }); return a.sort((p, q) => p - q); };
function villageIn(st, env, m, sets) {
  for (const s of sets) if (s.type === 1 && settleAt(st, s) === m) { const pts = env.mainStreet ? env.mainStreet(s.sid) : null; return { s, street: pts && pts.length >= 4 ? pts : null }; }
  return null;
}
// carve `cells` (Int32Array of cell indices, all currently manor `parent`) into a new child manor
function carve(st, env, T, parent, list, rec, flags) {
  const N = st.N, C = st.cells, id = st.manors.length;
  let i0 = N, j0 = N, i1 = -1, j1 = -1, sx = 0, sz = 0;
  for (const k of list) { const i = k % N, j = (k - i) / N; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; sx += i; sz += j; }
  env.touch(i0, j0, i1, j1);
  for (const k of list) C[k] = (((C[k] & ~MANOR) | id) | (flags || 0)) >>> 0;
  st.manors.push(freeze(Object.assign({ id, parent, y0: 0, group: id, seat: freeze([Math.round((sx / list.length + .5) * 16), Math.round((sz / list.length + .5) * 16)]), virt: 0, uid: 0 }, rec)));
  st.cver++;
  return id;
}
function patchAfter(st, T, ms) {           // rect = union of the pre-change bboxes of ms (children lie inside)
  let i0 = st.N, j0 = st.N, i1 = -1, j1 = -1;
  for (const m of ms) { const b = m * 4; if (T.bb[b + 2] < 0) continue; i0 = Math.min(i0, T.bb[b]); j0 = Math.min(j0, T.bb[b + 1]); i1 = Math.max(i1, T.bb[b + 2]); j1 = Math.max(j1, T.bb[b + 3]); }
  return A => { if (i1 >= 0) topoPatch(st, T, i0, j0, i1, j1, A); else st.topo = null; };
}
const XFER = {
  // a house with >= 3 manors gives a non-seat manor to a house seated >= 8 km away: an exclave
  dowry(st, env, ctx, T, sets, r, own) {
    const givers = housesOf(st, own, 3); if (!givers.length) return null;
    const A = pick(r, givers), HA = st.holders[A];
    const ms = own.get(A).filter(m => m !== HA.seatManor); if (!ms.length) return null;
    const m = pick(r, ms), [mx, mz] = centroid(T, m);
    const takers = housesOf(st, own, 1).filter(h => { if (h === A) return false; const S = st.manors[st.holders[h].seatManor]; return S && Math.hypot(S.seat[0] - mx, S.seat[1] - mz) >= TUNE.dowryDist; });
    if (!takers.length) return null;
    const B = pick(r, takers);
    moveManors(st, T, [m], B, ctx.year, A);
    return { k: 'dowry', imp: 2, x: mx, z: mz, txt: `${pick(r, GIVEN_F)}, daughter of ${knight(st, A, r)}, weds into ${st.holders[B].name}, and the manor of ${st.manors[m].name} goes with her as her dowry.` };
  },
  // the manor's high ground (above its 70th height percentile, >= 20 cells) is left to the nearest abbey or See
  bequest(st, env, ctx, T, sets, r, own) {
    if (st.manors.length >= TUNE.maxManors) return null;
    const church = []; own.forEach((ms, h) => { const H = st.holders[h]; if (H && (H.kind === 'abbey' || H.kind === 'see')) church.push(h); });
    if (!church.length) return null;
    const cands = [];
    for (const h of housesOf(st, own, 1)) for (const m of own.get(h)) {
      if (T.cnt[m] < 60) continue;
      const [mx, mz] = centroid(T, m);
      let best = 0, bd = TUNE.bequestDist;
      for (const c of church) { const S = st.manors[st.holders[c].seatManor]; if (!S) continue; const d = Math.hypot(S.seat[0] - mx, S.seat[1] - mz); if (d < bd) { bd = d; best = c; } }
      if (best) cands.push([m, h, best]);
    }
    if (!cands.length) return null;
    shuffle(cands, r);
    for (const [m, h, to] of cands.slice(0, 4)) {
      const list = cellsOf(st, T, m), N = st.N;
      const hs = new Float32Array(list.length);
      for (let t = 0; t < list.length; t++) { const i = list[t] % N, j = (list[t] - i) / N; hs[t] = env.hV(i + 1, j + 1); }   // the cell's far vertex: cheap and exact enough
      const p70 = Float32Array.from(hs).sort()[Math.floor(hs.length * .7)];
      // largest 4-connected component of the high ground (flood fill on a bbox-local grid: 1 = high, 2 = visited)
      const b4 = m * 4, bi = T.bb[b4], bj = T.bb[b4 + 1], bw = T.bb[b4 + 2] - bi + 1, bh = T.bb[b4 + 3] - bj + 1, hg = new Uint8Array(bw * bh);
      for (let t = 0; t < list.length; t++) if (hs[t] > p70) { const i = list[t] % N; hg[((list[t] - i) / N - bj) * bw + i - bi] = 1; }
      let best = null; const stk = new Int32Array(bw * bh);
      for (let l0 = 0; l0 < hg.length; l0++) {
        if (hg[l0] !== 1) continue;
        const comp = []; let sp = 0; stk[sp++] = l0; hg[l0] = 2;
        while (sp) {
          const l = stk[--sp], li = l % bw, lj = (l - li) / bw; comp.push((lj + bj) * N + li + bi);
          if (li > 0 && hg[l - 1] === 1) { hg[l - 1] = 2; stk[sp++] = l - 1; }
          if (li < bw - 1 && hg[l + 1] === 1) { hg[l + 1] = 2; stk[sp++] = l + 1; }
          if (lj > 0 && hg[l - bw] === 1) { hg[l - bw] = 2; stk[sp++] = l - bw; }
          if (lj < bh - 1 && hg[l + bw] === 1) { hg[l + bw] = 2; stk[sp++] = l + bw; }
        }
        if (!best || comp.length > best.length) best = comp;
      }
      if (!best || best.length < 20 || list.length - best.length < 20) continue;
      const g = ghostOpen(st, T, [m]), patch = patchAfter(st, T, [m]);
      const used = new Set(st.manors.filter(Boolean).map(q => q.name)), M = st.manors[m].name;
      const nm = uniqueName(pick(r, ['Over ' + M, M + ' Hill', 'Upper ' + M, M + ' Edge', 'High ' + M]), used);
      const c = carve(st, env, T, m, Int32Array.from(best.sort((p, q) => p - q)), { name: nm, y0: ctx.year }, st.holders[to].kind === 'abbey' ? ABBEY : 0);
      setHold(st, c, ctx.year, to);
      patch(new Set([m, c]));
      ghostClose(st, g, `Bounds of ${honourName(st, h)}, to ${ctx.year}`, Math.max(lastHoldYear(st, m), st.manors[m].y0), ctx.year);
      const [cx, cz] = centroid(T, c);
      return { k: 'bequest', imp: 2, x: cx, z: cz, txt: `${knight(st, h, r)}, dying, leaves the hillside above ${M} to ${st.holders[to].name}.` };
    }
    return null;
  },
  // coheiresses: a manor is parted between 2-3 houses along its high street (or a river, or a straight bound)
  partition(st, env, ctx, T, sets, r, own) {
    if (st.manors.length + 3 > TUNE.maxManors) return null;
    const cands = [], w = [];
    for (const h of housesOf(st, own, 1)) for (const m of own.get(h)) {
      if (T.cnt[m] < 60) continue;
      const v = villageIn(st, env, m, sets);
      cands.push([m, h, v]); w.push(v && v.street ? 10 : 1);   // villages are parted along their street by preference
    }
    if (!cands.length) return null;
    const N = st.N;
    const load = m => {                      // the manor's cells and a street cut of them (null when the street is not a fair bound)
      const list = cellsOf(st, T, m), n = list.length, xs = new Float32Array(n), zs = new Float32Array(n);
      let mx = 0, mz = 0; for (let t = 0; t < n; t++) { const i = list[t] % N; xs[t] = (i + .5) * 16; zs[t] = ((list[t] - i) / N + .5) * 16; mx += xs[t]; mz += zs[t]; }
      return { list, n, xs, zs, mx: mx / n, mz: mz / n, side: new Uint8Array(n) };
    };
    const fair = L => { let a = 0; for (let t = 0; t < L.n; t++) a += L.side[t]; const lo = Math.max(20, L.n * .15); return a >= lo && L.n - a >= lo; };
    // a polyline cut: every 4th cell first, so a clearly lopsided cut (a street that is already a bound, a road
    // skirting the manor) is rejected at a quarter of the cost; a plausible one is then tested exactly (budget, §3.14)
    const polyCut = (L, P) => {
      let a = 0, m = 0; for (let t = 0; t < L.n; t += 4) { a += polySide(P, L.xs[t], L.zs[t]); m++; }
      const lo = Math.max(20, L.n * .15) * 0.7, est = a * L.n / Math.max(1, m);
      if (est < lo || L.n - est < lo) return false;
      for (let t = 0; t < L.n; t++) L.side[t] = polySide(P, L.xs[t], L.zs[t]);
      return fair(L);
    };
    const street = (L, P) => polyCut(L, P);
    let pi = pickIdx(r, w), [m, h, v] = cands[pi], L = load(m), via = '', dir = [1, 0];
    if (v && v.street) {
      let good = street(L, v.street);
      // a street that is already a bound (the village was parted before) cannot part it again: try other street villages
      if (!good) for (const q of shuffle(cands.map((c, i) => i).filter(i => i !== pi && cands[i][2] && cands[i][2].street), r).slice(0, 4)) {
        const L2 = load(cands[q][0]); if (street(L2, cands[q][2].street)) { [m, h, v] = cands[q]; L = L2; good = true; break; }
      }
      if (good) { via = 'street'; const P = v.street; dir = [P[P.length - 2] - P[0], P[P.length - 1] - P[1]]; }
    }
    const { list, n, xs, zs, mx, mz, side } = L, ok = () => fair(L);
    // principal axis of the river cells inside the manor; the 32 m mask is rasterised afresh from the world's rivers
    // (never a cache), so the cut is the same in memory, after a reload, and whatever the viewer opened
    const G = N >> 1, riv = !via && env.river32 ? env.river32(G) : null;
    if (riv) {
      const rx = [], rz = [];
      for (let t = 0; t < n; t++) { const i = list[t] % N, j = (list[t] - i) / N; if (riv[(j >> 1) * G + (i >> 1)]) { rx.push(xs[t]); rz.push(zs[t]); } }
      if (rx.length >= 8) {
        let ax = 0, az = 0; rx.forEach((q, i) => { ax += q; az += rz[i]; }); ax /= rx.length; az /= rx.length;
        let sxx = 0, szz = 0, sxz = 0; rx.forEach((q, i) => { const dx = q - ax, dz = rz[i] - az; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; });
        const an = .5 * Math.atan2(2 * sxz, sxx - szz); dir = [Math.cos(an), Math.sin(an)];
        for (let t = 0; t < n; t++) side[t] = ((xs[t] - ax) * dir[1] - (zs[t] - az) * dir[0]) > 0 ? 1 : 0;
        if (ok()) via = 'river';
      }
    }
    if (!via && env.roads) {                   // a road through the manor (longest first)
      const b4 = m * 4, bb = [T.bb[b4] * 16, T.bb[b4 + 1] * 16, (T.bb[b4 + 2] + 1) * 16, (T.bb[b4 + 3] + 1) * 16];
      for (const P of (env.roads(bb) || []).slice(0, 3)) {
        if (polyCut(L, P)) { via = 'road'; dir = [P[P.length - 2] - P[0], P[P.length - 1] - P[1]]; break; }
      }
    }
    if (!via) {
      const an = r() * Math.PI; dir = [Math.cos(an), Math.sin(an)];
      for (let t = 0; t < n; t++) side[t] = ((xs[t] - mx) * dir[1] - (zs[t] - mz) * dir[0]) > 0 ? 1 : 0;
      if (!ok()) return null;
      via = 'line';
    }
    // a third daughter: the larger side is split again across the bound
    const part = Uint8Array.from(side);
    let parts = 2;
    { let a = 0; for (let t = 0; t < n; t++) a += side[t]; const big = a >= n - a ? 1 : 0, bn = big ? a : n - a;
      if (r() < .35 && bn >= 90) {
        let bx = 0, bz = 0; for (let t = 0; t < n; t++) if (side[t] === big) { bx += xs[t]; bz += zs[t]; } bx /= bn; bz /= bn;
        let c2 = 0; for (let t = 0; t < n; t++) if (side[t] === big && ((xs[t] - bx) * dir[0] + (zs[t] - bz) * dir[1]) > 0) { part[t] = 2; c2++; }
        if (c2 >= 20 && bn - c2 >= 20) parts = 3; else for (let t = 0; t < n; t++) part[t] = side[t];
      } }
    const pool = shuffle(housesOf(st, own, 1).filter(q => q !== h), r);
    if (pool.length < parts && st.holders.length + parts - pool.length > TUNE.maxHolders + 1) return null;
    const takers = [];
    for (let t = 0; t < parts; t++) { const q = pool[t] || newHouse(st, r, 0, ctx.year); if (!q) return null; takers.push(q); }
    const g = ghostOpen(st, T, [m]), patch = patchAfter(st, T, [m]);
    const M = st.manors[m].name, used = new Set(st.manors.filter(Boolean).map(q => q.name));
    const kids = [], cents = [];
    for (let p = 0; p < parts; p++) {
      const cl = []; let cx = 0, cz = 0; for (let t = 0; t < n; t++) if (part[t] === p) { cl.push(list[t]); cx += xs[t]; cz += zs[t]; }
      cents.push([cx / cl.length, cz / cl.length]);
      kids.push(cl);
    }
    const dirWord = (cx, cz) => { const dx = cx - mx, dz = cz - mz; return Math.abs(dz) >= Math.abs(dx) ? (dz < 0 ? 'north' : 'south') : (dx < 0 ? 'west' : 'east'); };
    const words3 = cents.map(c => dirWord(c[0], c[1]));
    const ids = kids.map((cl, p) => {
      const nm = uniqueName(cap1(words3[p]) + ' ' + M, used);
      const c = carve(st, env, T, m, Int32Array.from(cl), { name: nm, y0: ctx.year });
      setHold(st, c, ctx.year, takers[p]);
      return c;
    });
    patch(new Set([m].concat(ids)));
    ghostClose(st, g, `Bounds of ${honourName(st, h)}, to ${ctx.year}`, Math.max(lastHoldYear(st, m), st.manors[m].y0), ctx.year);
    // which specials fell on which side
    let tail = via === 'street' ? 'the high street becomes the bound' : via === 'river' ? 'the river becomes the bound' : via === 'road' ? 'the road becomes the bound' : 'a straight bound is run across the fields';
    if (via === 'street' && env.specials) {
      const bySide = new Map();
      for (const sp of env.specials(v.s.sid) || []) {
        const k = cellOf(st, sp.x, sp.z), p = ids.indexOf(st.cells[k] & MANOR); if (p < 0) continue;
        let a = bySide.get(p); if (!a) bySide.set(p, a = []); if (a.indexOf(sp.name) < 0) a.push(sp.name);
      }
      const bits = Array.from(bySide.keys()).sort((a, b) => a - b).slice(0, 2).map((p, i) => i === 0 ? `${listJoin(bySide.get(p).slice(0, 2))} falling to the ${words3[p]} side` : `${listJoin(bySide.get(p).slice(0, 2))} to the ${words3[p]}`);
      if (bits.length) tail += ', ' + bits.join(' and ');
    }
    return { k: 'partition', imp: 2, x: mx, z: mz, uid: v ? v.s.uid : undefined, via,
      txt: `${knight(st, h, r)} dies leaving ${words(parts)} daughters, and ${M} is parted between ${listJoin(takers.map(q => st.holders[q].name))}: ${tail}.` };
  },
  // a house sells a manor to a neighbouring house, or to an adjacent borough
  sale(st, env, ctx, T, sets, r, own) {
    const cands = [];
    for (const A of housesOf(st, own, 2)) for (const m of own.get(A)) {
      if (m === st.holders[A].seatManor) continue;
      for (const b of nbOf(T, m)) { if (!T.cnt[b]) continue; const B = holderNow(st, b), HB = st.holders[B]; if (B !== A && HB && (HB.kind === 'house' || HB.kind === 'borough')) cands.push([m, A, B]); }
    }
    if (!cands.length) return null;
    const [m, A, B] = pick(r, cands), [mx, mz] = centroid(T, m);
    moveManors(st, T, [m], B, ctx.year, A);
    const HB = st.holders[B];
    return { k: 'sale', imp: 1, x: mx, z: mz, txt: HB.kind === 'borough'
      ? `${cap1(HB.name)} buys the manor of ${st.manors[m].name} from ${st.holders[A].name}.`
      : `${cap1(st.holders[A].name)} sells the manor of ${st.manors[m].name} to ${HB.name}.` };
  },
  // the Crown (>= 4 manors) grants 2-5 contiguous manors to a new house
  regrant(st, env, ctx, T, sets, r, own) {
    const cm = own.get(1) || []; if (cm.length < 4 || st.holders.length > TUNE.maxHolders) return null;
    const cset = new Set(cm), seeds = shuffle(cm.filter(m => nbOf(T, m).some(b => cset.has(b))), r);
    if (!seeds.length) return null;
    const want = 2 + Math.floor(r() * 4), got = [seeds[0]], q = [seeds[0]], inG = new Set(got);
    while (q.length && got.length < want) { const a = q.shift(); for (const b of shuffle(nbOf(T, a).slice(), r)) { if (got.length >= want) break; if (cset.has(b) && !inG.has(b)) { inG.add(b); got.push(b); q.push(b); } } }
    if (got.length < 2) return null;
    const h = newHouse(st, r, got[0], ctx.year); if (!h) return null;
    moveManors(st, T, got, h, ctx.year, 1);
    const [mx, mz] = centroid(T, got[0]), who = knight(st, h, r);
    return { k: 'regrant', imp: 2, x: mx, z: mz, txt: `The Crown grants ${listJoin(got.map(m => st.manors[m].name))} to ${who}, who takes his seat at ${st.manors[got[0]].name}.` };
  },
  // once per town (houses >= 80, wealth >= .5, age >= 30): its cells plus a 1-cell margin become a borough
  charter(st, env, ctx, T, sets, r, own) {
    if (st.holders.length > TUNE.maxHolders) return null;
    const cands = sets.filter(s => s.type === 1 && (s.houses || 0) >= 80 && (s.wealth || 0) >= .5 && (!s.fy || ctx.year - s.fy >= 30)
      && st.x.charters.indexOf(s.uid) < 0 && s.bb && env.zoneSid).sort((a, b) => a.uid - b.uid);
    if (!cands.length) return null;
    const s = pick(r, cands), N = st.N, C = st.cells;
    const i0 = clamp(Math.floor(s.bb[0] / 16) - 1, 0, N - 1), j0 = clamp(Math.floor(s.bb[1] / 16) - 1, 0, N - 1), i1 = clamp(Math.floor(s.bb[2] / 16) + 1, 0, N - 1), j1 = clamp(Math.floor(s.bb[3] / 16) + 1, 0, N - 1);
    const inZ = new Set();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * N + i; if (env.zoneSid(k) === s.sid) inZ.add(k); }
    if (!inZ.size) return null;
    const bySrc = new Map();
    for (const k of inZ) {
      const i = k % N, j = (k - i) / N;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const k2 = b * N + a, c = C[k2], m = c & MANOR; if (!m || (c & BOROUGH)) continue;
        let l = bySrc.get(m); if (!l) bySrc.set(m, l = new Set()); l.add(k2);
      }
    }
    if (!bySrc.size || st.manors.length + bySrc.size > TUNE.maxManors) return null;
    const srcs = Array.from(bySrc.keys()).sort((a, b) => a - b);
    const g = ghostOpen(st, T, srcs), patch = patchAfter(st, T, srcs);
    const bid = st.holders.length, name = 'the Borough of ' + s.name;
    const kids = [];
    for (const m of srcs) {
      const c = carve(st, env, T, m, Int32Array.from(Array.from(bySrc.get(m)).sort((a, b) => a - b)), { name: s.name, y0: ctx.year, group: kids.length ? kids[0] : st.manors.length, uid: s.uid }, BOROUGH);
      kids.push(c);
    }
    st.holders.push(freeze({ id: bid, kind: 'borough', name, honour: name, seatManor: kids[0], hue: HUE.borough, y0: ctx.year, y1: 0, sur: '' }));
    for (const c of kids) setHold(st, c, ctx.year, bid);
    patch(new Set(srcs.concat(kids)));
    let y0 = 0; for (const m of srcs) y0 = Math.max(y0, lastHoldYear(st, m), st.manors[m].y0);
    ghostClose(st, g, `Bounds of ${honourName(st, holderNow(st, srcs[0]))}, to ${ctx.year}`, y0, ctx.year);
    st.x = freeze(Object.assign({}, st.x, { charters: freeze(st.x.charters.concat([s.uid]).sort((a, b) => a - b)) }));
    return { k: 'charter', imp: 3, x: s.x, z: s.z, uid: s.uid, txt: `${s.name} buys its charter and answers to no lord.` };
  },
  // the house dies out: all its manors go to the Crown
  escheat(st, env, ctx, T, sets, r, own) {
    const hs = housesOf(st, own, 1).filter(h => ctx.year - (st.holders[h].y0 || 0) >= 30);
    if (!hs.length) return null;
    const h = pick(r, hs), ms = own.get(h), H = st.holders[h];
    moveManors(st, T, ms, 1, ctx.year, h);
    setHolder(st, h, { y1: ctx.year });
    const [mx, mz] = centroid(T, ms[0]);
    return { k: 'escheat', imp: 2, x: mx, z: mz, txt: `The line of ${H.name} fails, and ${ms.length > 1 ? 'its lands escheat' : 'the manor of ' + st.manors[ms[0]].name + ' escheats'} to the Crown.` };
  }
};
// which side of polyline P (x,z pairs) a point lies on, judged by the nearest segment
function polySide(P, x, z) {
  let bd = Infinity, sgn = 0;
  for (let t = 0; t + 3 < P.length; t += 2) {
    const ax = P[t], az = P[t + 1], dx = P[t + 2] - ax, dz = P[t + 3] - az, L2 = dx * dx + dz * dz || 1;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = ax + dx * u - x, ez = az + dz * u - z, d = ex * ex + ez * ez;
    if (d < bd - 1e-9) { bd = d; sgn = (dx * (z - az) - dz * (x - ax)) > 0 ? 1 : 0; }
  }
  return sgn;
}

// =====================================================================================================
// Views at year Y: ids, colouring, masks, parishes, legend, ghosts
// =====================================================================================================
function memoFor(st, Y) {                 // per-manor group / holder at Y (cached per state version and year)
  const key = st.cver + ':' + st.manors.length + ':' + (Y === undefined || Y === null ? 'now' : Y) + ':' + holdSig(st);
  if (st.memo && st.memo.key === key) return st.memo;
  const n = st.manors.length, grp = new Int32Array(n), hol = new Int32Array(n), dm = new Int32Array(n);
  for (let m = 1; m < n; m++) { const d = dispManor(st, m, Y); dm[m] = d; grp[m] = st.manors[d] ? st.manors[d].group : 0; hol[m] = holderAt(st, d, Y); }
  return (st.memo = { key, grp, hol, dm });
}
function holdSig(st) { let s = st.holders.length; for (let m = 1; m < st.hold.length; m++) s = (s * 31 + (st.hold[m] ? st.hold[m].length : 0)) | 0; return s; }
// greedy colouring: nodes by degree (desc), each gets the smallest index 1..254 unused by any neighbour
function colourGreedy(nodes, nbrs) {
  const col = new Map(), order = nodes.slice().sort((a, b) => (nbrs(b).length - nbrs(a).length) || (a - b));
  for (const v of order) {
    const used = new Set(); for (const u of nbrs(v)) { const c = col.get(u); if (c) used.add(c); }
    let c = 1; while (used.has(c) && c < 254) c++;
    col.set(v, c);
  }
  return col;
}
// adjacency of level regions, mapped from the manor graph (exact for past years: children union into parents)
function levelAdj(T, n, idOf) {
  const nb = new Map(), add = (a, b) => { let l = nb.get(a); if (!l) nb.set(a, l = new Set()); l.add(b); };
  const nodes = new Set();
  for (let m = 1; m < n; m++) if (T.cnt[m]) { const a = idOf(m); if (a) { nodes.add(a); if (!nb.has(a)) nb.set(a, new Set()); } }
  T.adj.forEach((w, key) => {
    const p = Math.floor(key / 65536), q = key - p * 65536, a = idOf(p), b = idOf(q);
    if (a && b && a !== b) { add(a, b); add(b, a); }
  });
  const arr = new Map(); nb.forEach((s, k) => arr.set(k, Array.from(s)));
  return { nodes: Array.from(nodes).sort((a, b) => a - b), nbrs: v => arr.get(v) || [] };
}
function colourLevel(T, n, idOf) { const L = levelAdj(T, n, idOf); return colourGreedy(L.nodes, L.nbrs); }
// parishes: cost-distance at 64 m from churches (type-1 places with the church bit) and monasteries; never saved
function parishes(st, env, Y) {
  const sets = (env.settlements ? env.settlements() || [] : []).filter(s => s && ((s.type === 1 && (s.ms === undefined || s.ms === null || (s.ms & 1))) || s.type === 4)
    && (Y === undefined || Y === null || !s.fy || s.fy <= Y)).sort((a, b) => (a.uid || 0) - (b.uid || 0));
  const N = st.N, G4 = N >> 2, G = N >> 1;
  const sig = sets.map(s => (s.uid || 0) + ':' + Math.round(s.x / 64) + ':' + Math.round(s.z / 64)).join(',');
  if (st.parish && st.parish.sig === sig) return st.parish;
  if (!st.cost32) st.cost32 = runGen(costGen(env, G, null, {})).cost;   // fallback: part.update primes it in slices
  const cost = st.cost32, grid = new Uint16Array(G4 * G4), dist = new Float32Array(G4 * G4).fill(Infinity), heap = new D.Heap(4096), recs = [null];
  for (const s of sets) {
    const I = clamp(Math.floor(s.x / 64), 0, G4 - 1), J = clamp(Math.floor(s.z / 64), 0, G4 - 1), k = J * G4 + I;
    if (grid[k] || cost[(2 * J) * G + 2 * I] === Infinity) continue;
    const id = recs.length; recs.push({ id, name: 'the parish of ' + s.name, x: s.x, z: s.z, uid: s.uid });
    grid[k] = id; dist[k] = 0; heap.push(0, k);
  }
  const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
  while (heap.n) {
    const k = heap.pop(), d = heap.lastKey; if (d > dist[k]) continue;
    const I = k % G4, J = (k - I) / G4, ck = cost[(2 * J) * G + 2 * I];
    for (let q = 0; q < 4; q++) {
      const I2 = I + DI[q], J2 = J + DJ[q]; if (I2 < 0 || J2 < 0 || I2 >= G4 || J2 >= G4) continue;
      const k2 = J2 * G4 + I2, c2 = cost[(2 * J2) * G + 2 * I2]; if (c2 === Infinity) continue;
      const nd = d + (ck + c2) * .5; if (nd < dist[k2]) { dist[k2] = nd; grid[k2] = grid[k]; heap.push(nd, k2); }
    }
  }
  return (st.parish = { sig, grid, recs, G4 });
}
const parishAtCell = (st, P, k) => { if (!P || !(st.cells[k] & MANOR)) return 0; const N = st.N, i = k % N, j = (k - i) / N; return P.grid[(j >> 2) * P.G4 + (i >> 2)]; };
// RGBA per cell of greedy colour indices at year Y: r shire · g honour (holder) · b manor · a parish
function fillIdTex(st, env, out, Y) {
  const N = st.N, C = st.cells;
  if (!st.ready) { out.fill(0); return out; }
  const T = topo(st), n = st.manors.length, mm = memoFor(st, Y);
  const cS = colourLevel(T, n, m => T.sh[m]), cH = colourLevel(T, n, m => mm.hol[m]), cM = colourLevel(T, n, m => mm.grp[m]);
  const P = parishes(st, env, Y), G4 = P.G4;
  // parish adjacency straight from the 64 m parish grid (8-connected, land blocks only)
  const pn = new Map(), padd = (a, b) => { let l = pn.get(a); if (!l) pn.set(a, l = new Set()); l.add(b); };
  for (let J = 0; J < G4; J++) for (let I = 0; I < G4; I++) {
    const a = P.grid[J * G4 + I]; if (!a) continue; if (!pn.has(a)) pn.set(a, new Set());
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) { const I2 = I + di, J2 = J + dj; if (I2 < 0 || I2 >= G4 || J2 >= G4) continue; const b = P.grid[J2 * G4 + I2]; if (b && b !== a) { padd(a, b); padd(b, a); } }
  }
  const pArr = new Map(); pn.forEach((s, k) => pArr.set(k, Array.from(s)));
  const cP = colourGreedy(Array.from(pn.keys()).sort((a, b) => a - b), v => pArr.get(v) || []);
  const lutS = new Uint8Array(256), lutH = new Uint8Array(n), lutM = new Uint8Array(n), lutP = new Uint8Array(P.recs.length + 1);
  cS.forEach((c, id) => { if (id < 256) lutS[id] = c; });
  for (let m = 1; m < n; m++) { lutH[m] = cH.get(mm.hol[m]) || 0; lutM[m] = cM.get(mm.grp[m]) || 0; }
  cP.forEach((c, id) => { lutP[id] = c; });
  for (let j = 0, k = 0; j < N; j++) {
    const prow = (j >> 2) * G4;
    for (let i = 0; i < N; i++, k++) {
      const c = C[k], m = c & MANOR, o = k * 4;
      if (!m) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      out[o] = lutS[(c >>> SH_SHIFT) & 255]; out[o + 1] = lutH[m]; out[o + 2] = lutM[m]; out[o + 3] = lutP[P.grid[prow + (i >> 2)]];
    }
  }
  return out;
}
const LEVELS = ['plot', 'settlement', 'parish', 'manor', 'honour', 'shire'];
function levelFn(st, env, level, Y) {
  const mm = memoFor(st, Y), C = st.cells;
  if (level === 'shire') return k => (C[k] >>> SH_SHIFT) & 255;
  if (level === 'manor') return k => mm.grp[C[k] & MANOR] || 0;
  if (level === 'honour') return k => mm.hol[C[k] & MANOR] || 0;
  if (level === 'parish') { const P = parishes(st, env, Y); return k => parishAtCell(st, P, k); }
  if (level === 'settlement') return k => env.zoneSid ? env.zoneSid(k) : 0;
  return () => 0;
}
function maskOf(st, env, level, id, Y, out) {
  const N = st.N, f = levelFn(st, env, level, Y);
  let n = 0, i0 = N, j0 = N, i1 = -1, j1 = -1;
  for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
    const hit = id && f(k) === id; out[k] = hit ? 255 : 0;
    if (hit) { n++; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  }
  return { n, bb: [i0, j0, i1, j1] };
}
function maskStats(st, mask, bb) {        // 8-connected pieces + a shape hash over the bbox
  const N = st.N; let pieces = 0, h = 2166136261 >>> 0;
  const seen = new Uint8Array((bb[2] - bb[0] + 1) * (bb[3] - bb[1] + 1)), W = bb[2] - bb[0] + 1;
  h = Math.imul(h ^ bb[0], 16777619); h = Math.imul(h ^ bb[1], 16777619); h = Math.imul(h ^ bb[2], 16777619); h = Math.imul(h ^ bb[3], 16777619);
  const stk = [];
  for (let j = bb[1]; j <= bb[3]; j++) for (let i = bb[0]; i <= bb[2]; i++) {
    const k = j * N + i, l = (j - bb[1]) * W + (i - bb[0]);
    if (mask[k]) h = Math.imul(h ^ (k + 1), 16777619);
    if (!mask[k] || seen[l]) continue;
    pieces++; seen[l] = 1; stk.push(k);
    while (stk.length) {
      const q = stk.pop(), qi = q % N, qj = (q - qi) / N;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = qi + di, b = qj + dj; if (a < bb[0] || b < bb[1] || a > bb[2] || b > bb[3]) continue;
        const k2 = b * N + a, l2 = (b - bb[1]) * W + (a - bb[0]); if (mask[k2] && !seen[l2]) { seen[l2] = 1; stk.push(k2); }
      }
    }
  }
  return { pieces, hash: (h >>> 0).toString(36) };
}
function legend(st, Y) {
  if (!st.ready) return [];
  const T = topo(st), n = st.manors.length, mm = memoFor(st, Y), by = new Map();
  for (let m = 1; m < n; m++) {
    if (!T.cnt[m]) continue;
    const h = mm.hol[m]; let e = by.get(h); if (!e) by.set(h, e = { groups: new Set(), ms: [] });
    e.groups.add(mm.grp[m]); e.ms.push(m);
  }
  const out = [];
  by.forEach((e, h) => { const H = st.holders[h]; if (!H) return; out.push({ holder: { id: h, kind: H.kind, name: H.name, honour: H.honour }, hue: H.hue, manors: e.groups.size, pieces: piecesOf(T, e.ms) }); });
  return out.sort((a, b) => b.manors - a.manors || a.holder.id - b.holder.id);
}
// detached pieces of houses (exclaves), used by the tests and the dev check
function exclaves(st) {
  const T = topo(st), own = holdings(st, T); let n = 0;
  own.forEach((ms, h) => { const H = st.holders[h]; if (H && H.kind === 'house') n += piecesOf(T, ms) - 1; });
  return n;
}
function ghostsAt(st, Y) {
  return st.ghosts.filter(g => Y === undefined || Y === null || g.y1 <= Y).map(g => {
    let f = ghostCache.get(g); if (!f) ghostCache.set(g, f = b64ToF32(g.pts));
    return { label: g.label, y0: g.y0, y1: g.y1, pts: f };
  });
}
const ghostCache = new WeakMap();

// ---- snap / restore / serialize ---------------------------------------------------------------------------
function snapState(st) {
  return { ready: st.ready, manors: st.manors.slice(), holders: st.holders.slice(), hold: st.hold.slice(), ghosts: st.ghosts.slice(),
    stones: st.stones.slice(), shireNames: st.shireNames, x: st.x };
}
function restoreState(st, s) {             // never reads other systems (Story part protocol)
  if (!s) { resetMeta(st); return; }
  st.ready = !!s.ready; st.manors = s.manors.slice(); st.holders = s.holders.slice(); st.hold = s.hold.slice();
  st.ghosts = s.ghosts.slice(); st.stones = s.stones.slice(); st.shireNames = s.shireNames; st.x = s.x;
  st.cver++; st.topo = null; st.memo = null; st.parish = null;
}
function serializeState(st) {
  if (!st.ready) return { v: 1 };
  const hold = []; for (let m = 1; m < st.hold.length; m++) if (st.hold[m] && st.hold[m].length) hold.push([m, st.hold[m].map(p => [p[0], p[1]])]);
  return { v: 1, cells: rle32Enc(st.cells),
    manors: st.manors.slice(1).map(m => [m.id, m.name, m.parent, m.y0, m.group, m.seat[0], m.seat[1], m.aka || 0, m.virt ? 1 : 0, m.uid || 0, m.ry || 0]),
    holders: st.holders.slice(1).map(h => [h.id, h.kind, h.name, h.seatManor, h.hue, h.y0, h.y1 || 0, h.honour || '', h.sur || '', h.castle ? 1 : 0]),
    hold, ghosts: st.ghosts.map(g => [g.label, g.y0, g.y1, g.pts, g.len]), stones: st.stones.map(s => [s.x, s.z, s.y, s.rot, s.year, s.label]),
    shireNames: st.shireNames.slice(1),
    x: { castles: st.x.castles.slice(), sees: st.x.sees.slice(), charters: st.x.charters.slice(), ty: st.x.ty, tn: st.x.tn, owe: st.x.owe | 0, tri: (st.x.tri || []).map(t => t.slice()) } };
}
function deserializeState(st, o) {         // -> true when a realm was loaded
  resetMeta(st);
  if (!o || !o.cells || !Array.isArray(o.manors)) { st.cells.fill(0); return false; }
  const cells = rle32Dec(o.cells, st.N * st.N);
  if (!cells) { st.cells.fill(0); console.warn('[realm] bad cells in save; realm reset'); return false; }
  st.cells.set(cells);
  for (const a of o.manors) { if (!Array.isArray(a) || !(a[0] > 0)) continue;
    st.manors[a[0]] = freeze({ id: a[0], name: String(a[1]), parent: a[2] | 0, y0: +a[3] || 0, group: a[4] | 0 || a[0], seat: freeze([+a[5] || 0, +a[6] || 0]), aka: a[7] || undefined, ry: a[10] | 0, virt: a[8] ? 1 : 0, uid: a[9] | 0 }); }
  for (let m = 1; m < st.manors.length; m++) if (!st.manors[m]) st.manors[m] = freeze({ id: m, name: 'Manor', parent: 0, y0: 0, group: m, seat: freeze([0, 0]), virt: 1, uid: 0 });
  for (const a of o.holders || []) { if (!Array.isArray(a) || !(a[0] > 0)) continue;
    st.holders[a[0]] = freeze({ id: a[0], kind: a[1], name: String(a[2]), seatManor: a[3] | 0, hue: +a[4] || 0, y0: +a[5] || 0, y1: +a[6] || 0, honour: a[7] || '', sur: a[8] || '', castle: a[9] ? 1 : 0 }); }
  for (let h = 1; h < st.holders.length; h++) if (!st.holders[h]) st.holders[h] = freeze({ id: h, kind: 'house', name: 'a forgotten house', seatManor: 0, hue: 0, y0: 0, y1: 0, honour: '', sur: '' });
  if (!st.holders[1]) st.holders[1] = freeze({ id: 1, kind: 'crown', name: 'the Crown', honour: 'the Royal Demesne', seatManor: 0, hue: HUE.crown, y0: 0, y1: 0, sur: '' });
  st.hold = [null]; for (let m = 1; m < st.manors.length; m++) st.hold[m] = null;
  const nh = st.holders.length, hid = v => { v = v | 0; return v > 0 && v < nh ? v : 1; };   // a dangling holder falls to the Crown
  for (const a of o.hold || []) if (Array.isArray(a) && a[0] > 0 && a[0] < st.manors.length && Array.isArray(a[1]) && a[1].length) st.hold[a[0]] = freeze(a[1].map(p => freeze([+p[0] || 0, hid(p && p[1])])));
  for (let m = 1; m < st.manors.length; m++) if (!st.hold[m]) st.hold[m] = freeze([freeze([st.manors[m].y0, 1])]);
  st.ghosts = (o.ghosts || []).filter(Array.isArray).map(a => freeze({ label: String(a[0]), y0: +a[1] || 0, y1: +a[2] || 0, pts: String(a[3] || ''), len: +a[4] || 0 }));
  st.stones = (o.stones || []).filter(Array.isArray).map(a => freeze({ x: +a[0], z: +a[1], y: +a[2], rot: +a[3], year: +a[4] || 0, label: String(a[5] || '') }));
  st.shireNames = freeze([''].concat((o.shireNames || []).map(String)));
  const x = o.x || {};
  st.x = freeze({ castles: freeze((x.castles || []).slice()), sees: freeze((x.sees || []).slice()), charters: freeze((x.charters || []).slice()), ty: x.ty | 0, tn: x.tn | 0, owe: Math.max(0, Math.min(2, x.owe | 0)),
    tri: freeze((Array.isArray(x.tri) ? x.tri : []).filter(t => Array.isArray(t) && t.length >= 5).map(t => freeze(t.map(Number)))) });
  // a save that parses but is inconsistent (a cell naming a manor the save does not list, or a broken parent chain)
  // would throw later in at()/describe(): refuse it as a whole, like bad RLE
  const nm = st.manors.length;
  let bad = nm > MANOR + 1;
  for (let m = 1; m < nm && !bad; m++) { const p = st.manors[m].parent; if (p && (p >= m || p < 0)) bad = true; }
  for (let k = 0; k < cells.length && !bad; k++) if ((cells[k] & MANOR) >= nm) bad = true;
  if (bad) { resetMeta(st); st.cells.fill(0); console.warn('[realm] inconsistent realm in save; realm reset'); return false; }
  st.ready = true;
  return true;
}

// =====================================================================================================
// Browser glue: env adapter, Story part, public API
// =====================================================================================================
let st = newState(D.N || 1024), env = null, seedOverride = null;
let survey = null, surveyTk = { until: 0 }, surveyRes = null;
let topoJob = null, topoTk = { until: 0 }, costJob = null, costTk = { until: 0 };
let stoneT = -1, stoneLast = -1e9, viewY = null, forceKind = null;
let setsCache = null, setsT = -1e9, cntMemo = null;

function listSettlements() {
  const T = D.Town; if (!T) return [];
  if (T.hist && T.hist.list) { try { return T.hist.list() || []; } catch (e) { return []; } }
  // no director hooks (older town.js): derive a minimal list from Town.list plus one zone scan, cached briefly
  const t = now();
  if (setsCache && t - setsT < 2000 && setsCache.n === T.list.size) return setsCache.list;
  const W = D.W, N = D.N, Z = W && W.zone, acc = new Map();
  if (Z) for (let k = 0, j = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
    const g = Z[k * 4 + 1]; if (!g) continue;
    let a = acc.get(g); if (!a) acc.set(g, a = { n: 0, sx: 0, sz: 0, bb: [1e9, 1e9, -1e9, -1e9] });
    a.n++; a.sx += i; a.sz += j; if (i < a.bb[0]) a.bb[0] = i; if (j < a.bb[1]) a.bb[1] = j; if (i > a.bb[2]) a.bb[2] = i; if (j > a.bb[3]) a.bb[3] = j;
  }
  const houses = new Map();
  (T.chunks || []).forEach(arr => arr.forEach(b => { if (b.sid) houses.set(b.sid, (houses.get(b.sid) || 0) + 1); }));
  const list = [];
  T.list.forEach((S, sid) => {
    const a = acc.get(sid); if (!a) return;
    const o = T.originOf ? T.originOf(sid) : null;
    list.push({ sid, uid: S.uid, type: S.type, name: S.name, by: 'p', fy: 0, houses: houses.get(sid) || 0, wealth: (S.tw && S.tw.wealth) || .4,
      x: o ? o.x : (a.sx / a.n + .5) * 16, z: o ? o.z : (a.sz / a.n + .5) * 16, bb: [a.bb[0] * 16, a.bb[1] * 16, (a.bb[2] + 1) * 16, (a.bb[3] + 1) * 16] });
  });
  setsCache = { n: T.list.size, list }; setsT = t;
  return list;
}
function browserEnv() {
  const W = D.W, N = D.N, VN = D.VN;
  const vi = (i, j) => (j < 0 ? 0 : j > N ? N : j) * VN + (i < 0 ? 0 : i > N ? N : i);
  return {
    N, CELL: D.CELL || 16,
    hV: (i, j) => W.h[vi(i, j)],
    wetV: (i, j) => { const v = vi(i, j); return Math.max(W.seaLevel, W.water[v]) > W.h[v] + .05; },
    hAt: (x, z) => D.Terrain && D.Terrain.hAt ? D.Terrain.hAt(x, z) : W.h[vi(Math.round(x / 16), Math.round(z / 16))],
    river32: G => rasterRivers(W.rivers || [], G, N * 16 / G),
    cover: (x, z, r) => { try { return D.Nature && D.Nature.cover ? D.Nature.cover(x, z, r) : 0; } catch (e) { return 0; } },
    settlements: listSettlements,
    zoneSid: k => W.zone ? W.zone[k * 4 + 1] : 0,
    mainStreet: sid => { try { return D.Town && D.Town.hist && D.Town.hist.mainStreet ? D.Town.hist.mainStreet(sid) : null; } catch (e) { return null; } },
    specials: sid => {
      const out = []; const T = D.Town; if (!T || !T.chunks) return out;
      T.chunks.forEach(arr => arr.forEach(b => { if (b.sid === sid && SPECIAL[b.kind]) out.push({ name: SPECIAL[b.kind], x: b.x, z: b.z }); }));
      return out;
    },
    // road centrelines (Bezier segs, sampled) crossing a world bbox, longest first
    roads: bb => {
      const R = D.Roads, out = []; if (!R || !R.segs || !R.nodes) return out;
      try {
        R.segs.forEach(seg => {
          const b = seg._bb; if (b && (b[0] > bb[2] || b[2] < bb[0] || b[1] > bb[3] || b[3] < bb[1])) return;
          const A = R.nodes.get(seg.a), B = R.nodes.get(seg.b); if (!A || !B || !seg.c1 || !seg.c2) return;
          const P = new Float32Array(18); let len = 0;
          for (let q = 0; q <= 8; q++) {
            const t = q / 8, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
            P[q * 2] = w0 * A.x + w1 * seg.c1[0] + w2 * seg.c2[0] + w3 * B.x; P[q * 2 + 1] = w0 * A.z + w1 * seg.c1[1] + w2 * seg.c2[1] + w3 * B.z;
            if (q) len += Math.hypot(P[q * 2] - P[q * 2 - 2], P[q * 2 + 1] - P[q * 2 - 1]);
          }
          out.push([len, P]);
        });
      } catch (e) { return []; }
      return out.sort((p, q) => q[0] - p[0]).map(p => p[1]);
    },
    works: () => { try { return D.Works && D.Works.list ? D.Works.list() || [] : []; } catch (e) { return []; } },
    stoneOk: (x, z) => {
      if (!(x > 8 && z > 8 && x < N * 16 - 8 && z < N * 16 - 8)) return false;
      const i = Math.round(x / 16), j = Math.round(z / 16), v = vi(i, j), k = Math.min(N - 1, Math.floor(z / 16)) * N + Math.min(N - 1, Math.floor(x / 16));
      if (Math.max(W.seaLevel, W.water[v]) > W.h[v] - .3) return false;
      if (D.Terrain && D.Terrain.slopeAt && D.Terrain.slopeAt(x, z) > TUNE.stoneSlope) return false;   // fields, not crags
      if (!(st.cells[k] & MANOR)) return false;
      if (W.zone && (W.zone[k * 4] || W.zone[k * 4 + 1])) return false;
      if (D.Water && D.Water.riverAt && D.Water.riverAt(x, z) > W.h[v] - 2) return false;
      if (D.Town && D.Town.collide && D.Town.collide(x, z, 1.5)) return false;
      if (D.Roads && D.Roads.near && D.Roads.near(x, z, 3)) return false;
      return true;
    },
    touch: (i0, j0, i1, j1) => { if (D.History && D.History.touch) D.History.touch('realm', i0, j0, i1, j1); }
  };
}
const worldSeed = () => seedOverride !== null ? seedOverride : H32((D.W && D.W.seed) || 1, 'realm');
function changed() { Realm.ver++; stoneT = stoneT < 0 ? 5 : Math.min(stoneT, 5); D.emit('realm:changed'); }
function stonesSoon(t) { stoneT = stoneT < 0 ? t : Math.min(stoneT, t); }
function refreshStones() {
  const N_ = D.Nature; if (!N_ || !N_.setExtra) return;
  const sp = N_.SP_INDEX ? N_.SP_INDEX.boundstone : undefined;
  const list = st.ready && sp !== undefined ? st.stones.filter(s => viewY === null || s.year <= viewY) : [];
  if (!list.length) { N_.setExtra('realm:stones', null); return; }
  const a = new Float32Array(list.length * 7);
  const hAt = D.Terrain && D.Terrain.hAt;
  list.forEach((s, i) => { a.set([s.x, s.z, hAt ? hAt(s.x, s.z) : s.y, sp, 1, s.rot, H32(s.x | 0, s.z | 0) % 1000], i * 7); });
  N_.setExtra('realm:stones', a);
}
function startSurvey() {
  if (st.ready || !env) return;
  surveyRes = {}; surveyTk.until = 0;
  survey = surveyGen(env, worldSeed(), surveyTk, surveyRes);
}

const part = {
  order: 40,
  busy() { return !!survey; },
  season(ctx) {
    if (!env) env = browserEnv();
    let res = null;
    if (!ctx.first && !st.ready) {
      if (!survey && !(surveyRes && surveyRes.done)) { startSurvey(); return; }   // busy() now holds the clock until it is done
      if (!(surveyRes && surveyRes.done)) return;
      const c2 = Object.create(ctx); c2.first = true; ctx = c2;                    // "late begin": written at this season's year
    }
    if (ctx.first && !st.ready) {
      if (survey) { surveyTk.until = Infinity; runGen(survey); survey = null; }   // should not happen: busy() gates the begin commit
      res = surveyRes && surveyRes.done ? surveyRes : null;   // kept: a cancelled begin commit retries without re-surveying
      // no survey in hand (it was released, or story:prepare never reached us): never survey synchronously inside a
      // commit; start one now and let a later season write the realm ("late begin")
      if (!res) { startSurvey(); return; }
    }
    if (st.ready && !ctx.first && !(st.topo && st.topo.ver === st.cver)) {
      // topology still being rebuilt in slices (load / undo): finish it with the time this commit can spare, else
      // tell seasonStep to defer (§3.3: parts defer what they could not finish)
      if (!topoJob || topoJob.ver !== st.cver) topoJob = { ver: st.cver, g: topoGen(st, topoTk) };
      topoTk.until = now() + Math.max(0, (ctx.timeLeft ? ctx.timeLeft() : 12) - 6);
      const r = topoJob.g.next();
      if (r.done) { st.topo = r.value; topoJob = null; }
      else { const c2 = Object.create(ctx); c2.lazyTopo = true; ctx = c2; }
    }
    const was = st.ready, v0 = st.cver, ng = st.ghosts.length + ':' + st.stones.length;
    let any = seasonStep(st, env, ctx, res, worldSeed());
    if (forceKind && st.ready) { const T = topo(st); if (transfers(st, env, ctx, T, (env.settlements() || []).filter(Boolean), ctx.rng('realm:force'), forceKind)) any = true; forceKind = null; }
    if (any || was !== st.ready || v0 !== st.cver || ng !== st.ghosts.length + ':' + st.stones.length) changed();
  },
  update(dt) {
    const budget = D.Story && D.Story.partBudget ? D.Story.partBudget(2) : (dt > .025 ? 1 : 2);
    if (survey) {
      surveyTk.until = now() + budget;
      try { if (survey.next().done) survey = null; } catch (err) { console.error('[realm] survey', err); survey = null; surveyRes = null; }
    } else if (st.ready && (!st.topo || st.topo.ver !== st.cver)) {
      // rebuild the topology cache in slices (it is otherwise rebuilt synchronously on first use)
      if (!topoJob || topoJob.ver !== st.cver) topoJob = { ver: st.cver, g: topoGen(st, topoTk) };
      topoTk.until = now() + budget;
      const r = topoJob.g.next();
      if (r.done) { if (topoJob.ver === st.cver) st.topo = r.value; topoJob = null; }
    } else if (st.ready && !st.cost32 && env) {
      // prime the parish cost grid in slices (after a load), so the first Atlas click does not pay ~30 ms for it
      if (!costJob) costJob = costGen(env, st.N >> 1, costTk, {});
      costTk.until = now() + budget;
      try { const r = costJob.next(); if (r.done) { st.cost32 = r.value.cost; st.parish = null; costJob = null; } } catch (err) { console.error('[realm] cost', err); costJob = null; }
    }
    if (!st.ready && costJob) costJob = null;
    // the survey result is kept only so a cancelled begin commit can retry; once the chronicle runs, let it go (~6 MB)
    if (surveyRes && surveyRes.done && !survey && st.ready && D.Story && D.Story.started) surveyRes = null;
    if (stoneT >= 0) { stoneT -= dt; if (stoneT < 0) { stoneLast = now(); refreshStones(); } }
  },
  snap() { return snapState(st); },
  restore(s) { restoreState(st, s); Realm.ver++; stonesSoon(.5); D.emit('realm:changed'); },
  serialize() { return serializeState(st); },
  deserialize(o) { survey = null; surveyRes = null; costJob = null; topoJob = null; deserializeState(st, o); Realm.ver++; stonesSoon(.2); D.emit('realm:changed'); },
  reset() { survey = null; surveyRes = null; costJob = null; topoJob = null; resetMeta(st); st.cells.fill(0); Realm.ver++; stonesSoon(0); D.emit('realm:changed'); },
  onView(Y) { viewY = Y === undefined ? null : Y; const wait = Math.max(0, 1 - (now() - stoneLast) / 1000); stonesSoon(wait); }
};

const Realm = D.Realm = {
  ver: 0,
  get ready() { return st.ready; },
  busy: () => !!survey,
  init() {
    if (Realm._inited) return; Realm._inited = true;
    env = browserEnv();
    if (D.History && D.History.regArray) D.History.regArray('realm', {
      get data() { return st.cells; }, ch: 1, res: st.N,
      onRestore(i0, j0, i1, j1) {
        st.cver++; st.topo = null; st.memo = null; Realm.ver++;
        const d = Realm.dirtyRect; Realm.dirtyRect = d ? [Math.min(d[0], i0), Math.min(d[1], j0), Math.max(d[2], i1), Math.max(d[3], j1)] : [i0, j0, i1, j1];
        D.emit('realm:changed');
      }
    });
    if (D.Story && D.Story.register) D.Story.register('realm', part);
    D.on('story:prepare', startSurvey);
    D.on('story:restored', () => stonesSoon(.5));
  },
  dirtyRect: null,                       // [i0,j0,i1,j1] cells changed by undo/redo since the Atlas last cleared it
  at(x, z, year) {
    if (!st.ready) return null;
    const k = cellOf(st, x, z), c = st.cells[k], m = c & MANOR; if (!m || !st.manors[m]) return null;
    const Y = year === undefined ? null : year, d = dispManor(st, m, Y), M = st.manors[d], h = holderAt(st, d, Y), H = st.holders[h] || {};
    if (!M) return null;
    let parish = null;
    try { const P = parishes(st, env, Y), p = parishAtCell(st, P, k); if (p) parish = { id: p, name: P.recs[p].name }; } catch (e) { parish = null; }
    const s = (c >>> SH_SHIFT) & 255;
    return { manor: { id: M.group, name: nameAt(M, Y) }, honour: { id: h, name: honourName(st, h), holder: { id: h, kind: H.kind, name: H.name, hue: H.hue } }, parish, shire: { id: s, name: st.shireNames[s] || '' } };
  },
  describe(x, z) {
    if (!st.ready) return '';
    const m = st.cells[cellOf(st, x, z)] & MANOR; if (!m || !st.manors[m]) return '';
    const H = st.holders[holderNow(st, m)];
    return `Manor of ${st.manors[m].name}${H ? ' · held by ' + H.name : ''}`;
  },
  rings(x, z, rec, year) {
    const out = []; if (!env) return out;
    const Y = year === undefined ? null : year, N = st.N, k = cellOf(st, x, z), mask = scratch();
    const T = D.Town;
    if (rec) {
      let poly = null, name = rec.kind || 'building';
      try { const p = T && T.plotOf ? T.plotOf(rec) : null; if (p && p.poly) poly = p.poly.length && Array.isArray(p.poly[0]) ? [].concat(...p.poly) : Array.from(p.poly); } catch (e) { poly = null; }
      let bb;
      if (poly && poly.length >= 6) { bb = [1e9, 1e9, -1e9, -1e9]; for (let t = 0; t + 1 < poly.length; t += 2) { bb[0] = Math.min(bb[0], poly[t]); bb[1] = Math.min(bb[1], poly[t + 1]); bb[2] = Math.max(bb[2], poly[t]); bb[3] = Math.max(bb[3], poly[t + 1]); } }
      else { const w = (rec.w || 8) / 2 + 3, d = (rec.d || 8) / 2 + 3, rr = Math.hypot(w, d); bb = [rec.x - rr, rec.z - rr, rec.x + rr, rec.z + rr]; }
      let hsh = 2166136261; for (const v of (poly || bb)) hsh = Math.imul(hsh ^ Math.round(v * 10), 16777619);
      out.push({ level: 'plot', id: rec.id || rec.key || 0, name, caption: `The plot of this ${name}`, bb, pieces: 1, maskHash: 'p' + (hsh >>> 0).toString(36), poly });
    }
    const sid = env.zoneSid(k);
    const sets = sid ? (env.settlements() || []).filter(s => s && s.sid === sid) : [];
    const R = [];
    if (sid && sets[0]) R.push(['settlement', sid, sets[0].name, `The ${sets[0].type === 1 ? ((sets[0].houses || 0) >= 60 ? 'town' : 'village') : (D.Town && D.Town.TYPES && D.Town.TYPES[sets[0].type] ? D.Town.TYPES[sets[0].type].short : 'place')} of ${sets[0].name}`]);
    const a = st.ready && (st.cells[k] & MANOR) ? Realm.at(x, z, Y === null ? undefined : Y) : null;
    if (a) {
      if (a.parish) R.push(['parish', a.parish.id, a.parish.name, cap1(a.parish.name)]);
      R.push(['manor', a.manor.id, a.manor.name, `The manor of ${a.manor.name}, held by ${a.honour.holder.name}`]);
      R.push(['honour', a.honour.id, a.honour.name, cap1(a.honour.name)]);
      R.push(['shire', a.shire.id, a.shire.name, a.shire.name]);
    }
    for (const [level, id, name, caption] of R) {
      const m = maskOf(st, env, level, id, Y, mask); if (!m.n) continue;
      const s = maskStats(st, mask, m.bb);
      const ring = { level, id, name, caption: level === 'honour' && s.pieces > 1 ? `${caption}, in ${words(s.pieces)} pieces` : caption,
        bb: [m.bb[0] * 16, m.bb[1] * 16, (m.bb[2] + 1) * 16, (m.bb[3] + 1) * 16], pieces: s.pieces, maskHash: s.hash };
      if (level === 'honour') {                // extras: who holds it and where the lord sits
        const H = st.holders[id], SM = H && st.manors[H.seatManor];
        ring.holder = H ? { id, kind: H.kind, name: H.name } : null;
        if (SM) ring.seat = SM.seat.slice();
      }
      out.push(ring);
    }
    return out;
  },
  fillIdTex(outU8, year) { return fillIdTex(st, env || browserEnv(), outU8, year === undefined ? null : year); },
  maskOf(level, id, year, outU8) { return maskOf(st, env || browserEnv(), level, id, year === undefined ? null : year, outU8); },
  ghosts(year) { return ghostsAt(st, year); },
  legend(year) { return legend(st, year === undefined ? null : year); },
  // ---- additions for the Atlas (beyond §5.11) ----
  counts() {
    if (!st.ready) return null;
    let m = 0; const T = st.topo && st.topo.ver === st.cver ? st.topo : null;
    if (T) { for (let i = 1; i < st.manors.length; i++) if (T.cnt[i]) m++; }
    else if (!st.manors.some(q => q && q.parent)) m = st.manors.length - 1;   // exact at begin (nothing carved yet)
    else {   // after a load/undo, before the topology is re-primed: one cell scan, cached per cell version (was manors.length - 1)
      if (!cntMemo || cntMemo.st !== st || cntMemo.v !== st.cver || cntMemo.n !== st.manors.length) {
        const seen = new Uint8Array(st.manors.length), C = st.cells; let c = 0;
        for (let k = 0; k < C.length; k++) seen[C[k] & MANOR] = 1;
        for (let i = 1; i < seen.length; i++) c += seen[i];
        cntMemo = { st, v: st.cver, n: st.manors.length, m: c };
      }
      m = cntMemo.m;
    }
    return { shires: st.shireNames.length - 1, manors: m, holders: st.holders.length - 1 };
  },
  holderColor(h) { const H = st.holders[h]; if (!H) return [.8, .78, .74]; return hslRgb(H.hue, H.kind === 'crown' ? .30 : .34, H.kind === 'borough' ? .62 : .68); },
  // holder id per cell at year Y (Uint16Array N*N) for page fills
  fillHolders(outU16, year) { const N = st.N; if (!st.ready) { outU16.fill(0); return outU16; } const mm = memoFor(st, year === undefined ? null : year), C = st.cells; for (let k = 0; k < N * N; k++) outU16[k] = mm.hol[C[k] & MANOR] || 0; return outU16; },
  holder(h) { return st.holders[h] || null; },
  stones(year) { return st.stones.filter(s => year === undefined || year === null || s.year <= year).map(s => Object.assign({}, s)); },
  // label anchors: shires (centroid of their manors) and manors (displayed groups at Y)
  labels(year) {
    if (!st.ready) return [];
    const T = topo(st), mm = memoFor(st, year === undefined ? null : year), acc = new Map(), out = [];
    const add = (key, level, id, name, m) => { let a = acc.get(key); if (!a) acc.set(key, a = { level, id, name, sx: 0, sz: 0, n: 0 }); a.sx += T.sx[m]; a.sz += T.sz[m]; a.n += T.cnt[m]; };
    for (let m = 1; m < st.manors.length; m++) { if (!T.cnt[m]) continue; const g = mm.grp[m]; add('s' + T.sh[m], 'shire', T.sh[m], st.shireNames[T.sh[m]] || '', m); add('m' + g, 'manor', g, nameAt(st.manors[mm.dm[m]], year), m); }
    acc.forEach(a => out.push({ level: a.level, id: a.id, name: a.name, x: (a.sx / a.n + .5) * 16, z: (a.sz / a.n + .5) * 16, cells: a.n }));
    return out;
  },
  _pure: null, _dev: null
};
let scratchMask = null;
function scratch() { if (!scratchMask || scratchMask.length !== st.N * st.N) scratchMask = new Uint8Array(st.N * st.N); return scratchMask; }

Realm._pure = { newState, costGen, surveyGen, runSurvey, runGen, applySurvey, seasonStep, topo, topoGen, topoPatch, holdings, piecesOf,
  rle32Enc, rle32Dec, colourGreedy, colourLevel, levelAdj, dispManor, disp, holderAt, holderNow, holderTripoints, snapState, restoreState,
  serializeState, deserializeState, fillIdTex, maskOf, maskStats, parishes, legend, exclaves, ghostsAt, chainEdges, dpSimplify, polySide,
  rasterRivers, transfers, nameAt, XFER, TUNE, MANOR, SH_SHIFT, BOROUGH, ABBEY };
Realm._dev = {
  state: () => st,
  force(kind) { if (!XFER[kind]) return 'kinds: ' + Object.keys(XFER).join(', '); forceKind = kind; return 'queued for the next season commit'; },
  // invariants: shires fixed 1..6, manor ids valid, children inside the grid, caps respected
  check() {
    const errs = []; if (!st.ready) return errs;
    const T = topo(st);
    if (st.manors.length - 1 > TUNE.maxManors) errs.push('too many manors');
    if (st.holders.length - 1 > TUNE.maxHolders + 3) errs.push('too many holders');
    if (st.ghosts.length > TUNE.maxGhosts) errs.push('too many ghosts');
    if (st.stones.length > TUNE.maxStones) errs.push('too many stones');
    for (let m = 1; m < st.manors.length; m++) { if (T.cnt[m] && !holderNow(st, m)) errs.push('manor ' + m + ' has no holder'); const p = st.manors[m].parent; if (p && (p >= m || !st.manors[p])) errs.push('manor ' + m + ' bad parent'); }
    for (let k = 0; k < st.cells.length; k++) { const m = st.cells[k] & MANOR; if (m >= st.manors.length) { errs.push('cell ' + k + ' unknown manor ' + m); break; } }
    return errs;
  },
  held: () => ({ survey: !!survey, surveyRes: !!surveyRes, topoJob: !!topoJob, costJob: !!costJob }),
  survey() { if (!env) env = browserEnv(); const t = now(); const r = runSurvey(env, worldSeed()); return { ms: Math.round(now() - t), manors: r.M, shires: r.K }; }
};
})();
