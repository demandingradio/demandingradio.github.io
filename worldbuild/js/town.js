/* Diorama — town: medieval settlements that grow themselves.
   Zone painting (Village/Town, Farmland, Castle, Monastery, Harbour), settlement records and
   history, a time-sliced planner (A-roots villages, region-growth farmland, pluggable planners
   for the other types), deterministic decoration into Kit buildings / ground-atlas lanes and
   areas / Nature props, a presenter that reveals everything over ~30–90 s, the ground-detail
   atlas writer, manual buildings, the settlement inspector, labels, navigation edges and save.
   D.Town is also published as D.City (older callers keep working).

=====================================================================================================
 PLANNER EXTENSION API  (for js/townx.js — castle 3, monastery 4, harbour 5)
=====================================================================================================
 Registration (parse time, townx.js loads after town.js):
     D.TownX = { planners: { 3: function* (ctx) {...}, 4: function* (ctx) {...}, 5: function* (ctx) {...} } };
 Town looks the planner up when a job starts (D.TownX.planners[type]); with none registered the job
 finishes with an empty plan and a "coming soon" toast. The village (1) and farmland (2) planners in
 this file are written against exactly the same ctx, so everything below is exercised.

 A planner is a GENERATOR FUNCTION taking ctx. It emits elements through the ctx emitters and time
 slices itself with `yield* ctx.yieldIfOverBudget();` (or `if (ctx.overBudget()) yield;`) inside every
 loop that can run long (≈ every few hundred cheap operations is fine; the check is a clock read).
 It returns nothing: Town calls ctx.finish() itself (returning a finished Plan object is also accepted).
 Exceptions are caught; whatever was emitted before the throw is kept.
 Never use Math.random: use ctx.rng(tag, ...ints). Iterate arrays in index order, sort before using
 Map/Set iteration for decisions. Units are world metres, angles radians, x/z the ground plane.

 ---- inputs (read only) ------------------------------------------------------------------------------
 ctx.S           snapshot of the settlement record (copy): {id, uid, type, seed, name, tw, epochs, pin}
 ctx.tw          tweaks {dens, wealth, walls:'none'|'palisade'|'stone', layout, squares, greens, gardens} (0..1)
 ctx.type, ctx.sid, ctx.uid, ctx.seed
 ctx.job         {kind:'found'|'expand'|'replan'|'infill', jobId, epoch}; ctx.kind === ctx.job.kind
 ctx.prev        previous Plan for 'expand'/'infill' (its elements are ALREADY copied into the output
                 arrays ctx.lanes/plots/specials/areas and stamped into occ; add only new things), else null
 ctx.style       {region 0..4, gableBias, churchStyle 0..3, roofPitch, wanderMul, frontMul} (rolled for you)
 ctx.neighbours  [{sid, type, uid, name, origin:{x,z,kind}, style, plan}] other planned settlements within 3 km
 ctx.x0,z0,x1,z1 planning window (world m, multiple of 4; H bbox + 80 m, capped to 3200 m square)
 ctx.cells       Int32Array of H zone cells (k = j*1024 + i, 16 m cells), ascending
 ctx.cellCount, ctx.areaM2, ctx.areaHa, ctx.centroid {x,z}, ctx.hbb {x0,z0,x1,z1} (H bbox, world m)
 ctx.OCC         occupancy codes {FREE:0, LANE:1, VERGE:2, BUILDING:3, YARD:4, SQUARE:5, WALL:6,
                 PRECINCT:7, FIELD:8, ROAD:9, BLOCKED:255}  (BLOCKED = water, slope > 0.45 or outside H)
 ctx.ALLOW       ready masks for the `allow` args: FREE (0 only), FV (free|verge), FVL (free|verge|lane),
                 ANY (every code except 255). Build your own with ctx.allow(code, code, ...) → bit mask.

 ---- random / noise ---------------------------------------------------------------------------------
 ctx.rng(tag, ...ints)   → function() in [0,1), seeded from hash(S.seed, tag, ints). Same args → same stream.
 ctx.hash(tag, ...ints)  → uint32
 ctx.fbm(x, z)           → smooth noise ≈ [-1, 1] (3 octaves, scale 1 = feature size ~1 unit; pass x/90 etc.)

 ---- H mask (the settlement's zone cells) --------------------------------------------------------------
 ctx.inH(x, z) → bool      ctx.isNew(x, z) → bool (cell painted by this expansion epoch; always true for found)
 ctx.cellOf(x, z) → k      ctx.cellCenter(k) → [x, z]      ctx.anchorCell(x, z) → k of H at/near x,z or -1
 ctx.sdf(x, z) → metres, signed distance to the H edge (+ inside, − outside; 4 m resolution, bilinear)
 ctx.inside(x, z) → bool   perturbed H (sdf + 11 m·noise > 0): the organic edge used for lanes and plots
 ctx.forCells(fn(k, x, z)) iterate H cells in index order (x,z = cell centre)

 ---- terrain (exact calls pass through to D.Terrain; the others use 4 m caches of the window) --------
 ctx.hAt(x, z), ctx.waterAt(x, z) (surface level, ≥ sea level)          exact
 ctx.h4(x, z) bilinear cached height; ctx.slopeAt(x, z) → gradient magnitude (rise/run, NOT degrees)
 ctx.gradAt(x, z) → [dh/dx, dh/dz]; ctx.isWet(x, z) → bool; ctx.depthAt(x, z) → water depth ≥ 0 (m)
 ctx.waterDist(x, z) → metres to nearest wet cell (capped 2000)
 ctx.prominence(x, z, r=60) → h − mean h of 8 points at radius r
 ctx.spread(x, z, rot, w, d) → max − min terrain height under the rect corners and centre

 ---- manual roads (D.Roads, snapshotted at job start, sorted by seg id) ---------------------------------
 ctx.roads   [{id, type, w, rank (kingsroad/street 0, lane/track 1, footpath 2), pts: Float32Array [x,z,..]
              every ~3 m, len, bb:[x0,z0,x1,z1]}] for segments whose bbox meets the window
 ctx.roadNodes [{id, x, z, deg}] inside the window (sorted by id)
 ctx.nearestRoad(x, z, maxD) → {d, x, z, tx, tz, road} | null

 ---- occupancy raster (2 m cells over the window; outside the window counts as BLOCKED) -----------------
 Rect args: centre x,z, rot (Kit frame: local −z is the front; world = (x + lx·cos + lz·sin, z − lx·sin + lz·cos)),
 w along local x, d along local z, pad (m, may be negative). `allow` = bit mask of acceptable codes.
 ctx.occAt(x, z) → code
 ctx.testRect(x, z, rot, w, d, pad = 0, allow = ALLOW.FREE) → bool     ctx.stampRect(x, z, rot, w, d, code, pad = 0)
 ctx.testDisc(x, z, r, allow)  / ctx.stampDisc(x, z, r, code)
 ctx.testPoly(poly, allow)     / ctx.stampPoly(poly, code)            poly = Float32Array|number[] [x,z,...] closed
 ctx.testPolyline(pts, hw, allow) / ctx.stampPolyline(pts, hw, code, mode = 0)
 Stamps never overwrite BLOCKED. stampPolyline mode 0 overwrites everything else, 1 only FREE cells,
 2 only FREE|VERGE|FIELD cells (what lanes use).
 ctx.fits(x, z, rot, w, d, {pad = 0.3, allow = FV, maxSpread = max(3, .35·min(w,d)), inside = true}) → bool
     rect free + dry corners/centre + terrain spread ok + corners inside: inside:true = perturbed ctx.inside,
     'H' = plain H cells (use for compact precincts/baileys that should reach the zone edge), false = no test

 ---- geometry helpers: ctx.geo -------------------------------------------------------------------------
 geo.dp(pts, tol, closed) · geo.chaikin(pts, iters, closed) · geo.resample(pts, step, closed)  (Float32Array in/out)
 geo.pip(poly, x, z) · geo.area(poly) (signed) · geo.centroid(poly) → [x,z] · geo.bbox(pts) → [x0,z0,x1,z1]
 geo.distToPolyline(pts, x, z) · geo.rectPoly(x, z, rot, w, d) → Float32Array(8) · geo.len(pts)
 ctx.traceMask(mask Uint8Array, w, h, ox, oz, step) → loops [Float32Array] (marching squares of mask>0;
     cell (i,j) centre = (ox + (i+.5)·step, oz + (j+.5)·step)), largest first
 ctx.contours(fn(x, z) → value, level, step = 4, x0, z0, x1, z1) → [{pts: Float32Array, closed}]  (window default)
 ctx.shoreline(step = 4) → contours of (waterAt − hAt) at 0 inside the window (land/water edges), longest first
 ctx.astar(ax, az, {target(x,z)→bool | goal:[x,z], cost(x,z)→extra ≥ 0 or Infinity, step = 8, maxNodes = 250000})
     → Float32Array path [x,z,...] from a to the first target cell, or null. Default cost per step:
     len·(1 + 25·slope² + 8·(occ BUILDING/YARD) + 3·wet) + len·cost(x,z).  Generator-safe? No: it runs to
     completion (bounded by maxNodes), so call it between yields.

 ---- emitters (assign key, o, cell and ep; stamp occ unless opts.noStamp) --------------------------------
 Order `o` is emission order (0,1,2,...): the presenter reveals in that order, so emit a lane before the
 plots along it, a church before its churchyard props etc. ctx.nextO() peeks the next o.
 ctx.lane({pts, rank = 1, w = 4.5, surf = 1, tip = false, noStamp}) → laneKey
     pts: Float32Array|number[]|[[x,z],...] polyline. Resampled to ~6 m, split into ~24 m steps (one plan entry
     each, key laneKey + '.' + i, consecutive o). rank 0 main,1 lane,2 alley,3 track; surf 1 dirt,2 cobble,
     3 flagstone,4 gravel,5 steps (surf ≤ 2 is re-chosen from wealth by decorate; 3..5 are kept). Stamps LANE
     over w/2 and VERGE 1.5 m beyond.
 ctx.newLaneKey() → key;  ctx.laneStep({lane: key, i, pts, rank, w, surf, tip}) → step key   (incremental lanes)
 ctx.plot({x, z, rot, w, d, yardD, frontW, rank, netD, wq, role: 'house'|'farm'|'harbour'|'bailey'|'cloister',
     corner, town, mkt}) → key.  x,z,rot,w,d = the HOUSE rect (front = local −z towards the street);
     the yard is frontW × yardD directly behind it. Stamps BUILDING + YARD. wq = local wealth offset −1..1.
 ctx.special({kind, x, z, rot, w, d, h, var, extra, code = BUILDING}) → key
     kind = any D.Kit kind (a building) or one of the generic decorations:
       'curtain'   extra {loop: Float32Array|[[x,z]] (closed), gates: [{x, z, kind:'gatehouse'|'postern'}],
                   wallKind: 'stone'|'palisade', h}            → D.Kit.wallRun (x,z = loop centroid)
       'precinct'  extra {loop, gates}                       → low stone D.Kit.wallRun (h 3.2)
       'pierline'  extra {pts: Float32Array|[[x,z]] from the shore outwards} → D.Kit.pierRun; its end piece is a
                   mooring for boats (Town.moorings)
     Generic kinds are not rect-stamped; stamp their footprint yourself (stampPolyline etc.).
     extra.water = ±1 is passed to Kit.design (watermill wheel side); extra.orient = 'east' too.
     Specials whose kind is church/chapel/cathedral with extra.ms === 'church' get chapel→church phase upgrades.
 ctx.area({cls, poly, ang = 0, rf = 0, extra}) → key
     cls: 'square' (paved flagstone with its own SDF) or the §3.3 B class 1..16 (1 yard, 2 garden beds,
     3 green, 4 churchyard, 5 ploughed, 6 wheat, 7 barley, 8 oats, 9 rye, 10 fallow, 11 pasture, 12 meadow,
     13 orchard, 14 vineyard, 15 dry ditch, 16 herb garden). ang = furrow direction (rad), rf = 1 ridge&furrow.
     Decorate adds props: 4 graves+yews, 13 fruit trees, 14 vine rows, 16 herbs+skeps, 6..9 stooks,
     'square' market stalls/barrels. extra.edges (Float32Array [x,z,ang,type]) = field border props
     (type 0 hedge, 1 drystone, 2 wattle, 3 hedgerow oak).
 ctx.setOrigin(x, z, kind)   the settlement centre (labels, waves, road goals). Default: H centroid.
 ctx.setWallO(o)             order threshold for village walls (−1 none)
 ctx.toast(msg)              shown when the plan is attached (not on undo/load)
 ctx.finish() → Plan         (Town calls it)
 Plan = {v:1, uid, type, style, origin:{x,z,kind}, lanes:[], plots:[], specials:[], areas:[], wallO, n}

 ---- how the result is shown (so you can plan for it) -------------------------------------------------
 - Visibility: an element shows only while its anchor cell is a current cell of this settlement (r == type,
   g == sid); lanes/areas also paint into unzoned cells next to the zone. Buildings under manual roads hide.
 - Bld items are Kit records made with D.Kit.design(kind, x, z, rot, {w, d, h, var, wealth, age, region, seed,
   water, orient}) and seated by KINDS[kind].seat ('water' for pier/boat/quay pieces, 'given' for bridges).
   Keep every building inside the rect you reserve (Kit envelope rule, §3.4).
 - Reveal order is `o`; the presenter reveals ~30–90 s per settlement. Put the landmark first (e.g. the keep,
   the church east end), walls after the buildings they enclose.
 - Villages send lanes towards neighbouring castle gates (specials of kind 'curtain', extra.gates entries with
   kind 'gatehouse', within ~600 m) and towards harbour rank-0 lanes (within 400 m): emit those to be joined.
 - Ticker toasts fire for these kinds when revealed: church, cathedral, watermill, windmill, tavern, markethall,
   hall, smithy, keep, motte, cloister, pier, bridge, and the first piece of any wall run.
 - Wealth/Walls tweaks and the prosperity brush re-decorate (no re-plan); other tweaks re-run your planner
   with the same seed, so keep it deterministic.
=====================================================================================================*/
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE, CHUNK, NCH } = D;
const W = D.W;
const CHS = CHUNK * CELL;          // 1024 m chunk
const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;

W.zone = new Uint8Array(N * N * 4); // r type · g slot · b prosperity · a epoch (see spec §3.1)

const Town = D.Town = { chunks: [], list: new Map(), navVersion: 0, speed: 1, nextUid: 1, nextJob: 1, zoneTex: null, selected: 0 };
D.City = Town;
Town.histPace = 1;                  // reveal-speed multiplier set by story.js while history runs (Living History §3.1)
for (let i = 0; i < NCH * NCH; i++) Town.chunks.push([]);
const chunks = Town.chunks, list = Town.list;

// ---- zone types --------------------------------------------------------------------------------------
const TYPES = [
  null,
  { id: 1, name: 'Village / Town', short: 'village', emoji: '🏘', col: '#e0b85a' },
  { id: 2, name: 'Farmland', short: 'farmland', emoji: '🌾', col: '#d8c860' },
  { id: 3, name: 'Castle', short: 'castle', emoji: '🏰', col: '#c85a50' },
  { id: 4, name: 'Monastery', short: 'monastery', emoji: '⛪', col: '#9a78d0' },
  { id: 5, name: 'Harbour', short: 'harbour', emoji: '⚓', col: '#4d9be0' }
];
Town.TYPES = TYPES;
const OCC = Object.freeze({ FREE: 0, LANE: 1, VERGE: 2, BUILDING: 3, YARD: 4, SQUARE: 5, WALL: 6, PRECINCT: 7, FIELD: 8, ROAD: 9, BLOCKED: 255 });
const allowMask = function () { let m = 0; for (let i = 0; i < arguments.length; i++) m |= 1 << arguments[i]; return m; };
const ALLOW = Object.freeze({ FREE: 1, FV: allowMask(0, 2), FVL: allowMask(0, 1, 2), ANY: 0x3ff });
const LANE_OK = allowMask(0, 1, 2, 4, 5, 8, 9);
const HOUSE_KINDS = { cottage: 3, longhouse: 3, timberhouse: 5, stonehouse: 5, townhouse: 6, shop: 5, tavern: 6, smithy: 4, farmhouse: 5, fishhut: 3, range: 8, hall: 4 };
const CHURCH_KINDS = { chapel: 1, church: 1, cathedral: 1 };

// ---- small utilities -------------------------------------------------------------------------------
const clamp = D.clamp, lerp = D.lerp;
const now = () => performance.now();
function hash32() {
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
function rngFor() { return D.rng(hash32.apply(null, arguments)); }
const h01 = function () { return hash32.apply(null, arguments) / 4294967296; };

// base64 for typed arrays (chunks of 0x8000 bytes)
function b64FromBytes(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function bytesFromB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function packVal(v) {
  if (v instanceof Float32Array) return { $f32: b64FromBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Int32Array) return { $i32: b64FromBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Uint8Array) return { $u8: b64FromBytes(v) };
  if (Array.isArray(v)) return v.map(packVal);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) if (k[0] !== '_') o[k] = packVal(v[k]); return o; }
  if (typeof v === 'number' && !isFinite(v)) return 0;
  return v;
}
function unpackVal(v) {
  if (Array.isArray(v)) return v.map(unpackVal);
  if (v && typeof v === 'object') {
    if (typeof v.$f32 === 'string') { const u = bytesFromB64(v.$f32); return new Float32Array(u.buffer, 0, u.length >> 2); }
    if (typeof v.$i32 === 'string') { const u = bytesFromB64(v.$i32); return new Int32Array(u.buffer, 0, u.length >> 2); }
    if (typeof v.$u8 === 'string') return bytesFromB64(v.$u8);
    const o = {}; for (const k in v) o[k] = unpackVal(v[k]); return o;
  }
  return v;
}

// ---- geometry ------------------------------------------------------------------------------------------
function toF32(p) {
  if (p instanceof Float32Array) return p;
  if (!p || !p.length) return new Float32Array(0);
  if (Array.isArray(p[0])) { const o = new Float32Array(p.length * 2); for (let i = 0; i < p.length; i++) { o[i * 2] = p[i][0]; o[i * 2 + 1] = p[i][1]; } return o; }
  return Float32Array.from(p);
}
function toPairs(p) { const o = []; for (let i = 0; i + 1 < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; }
function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}
function distToPolyline(p, x, z) {
  let best = 1e18;
  const n = p.length >> 1;
  if (n === 1) return Math.hypot(p[0] - x, p[1] - z);
  for (let i = 0; i < n - 1; i++) { const d = segDist2(x, z, p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]); if (d < best) best = d; }
  return Math.sqrt(best);
}
function distToLoop(p, x, z) {
  let best = 1e18; const n = p.length >> 1;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; const d = segDist2(x, z, p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1]); if (d < best) best = d; }
  return Math.sqrt(best);
}
function pip(poly, x, z) {
  let inside = false; const n = poly.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea(p) { let a = 0; const n = p.length >> 1; for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; return a / 2; }
function polyCentroid(p) {
  const n = p.length >> 1; let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) { const f = p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1]; a += f; cx += (p[j * 2] + p[i * 2]) * f; cz += (p[j * 2 + 1] + p[i * 2 + 1]) * f; }
  if (Math.abs(a) < 1e-6) { let sx = 0, sz = 0; for (let i = 0; i < n; i++) { sx += p[i * 2]; sz += p[i * 2 + 1]; } return [sx / Math.max(1, n), sz / Math.max(1, n)]; }
  return [cx / (3 * a), cz / (3 * a)];
}
function bboxOf(p, pad) {
  pad = pad || 0; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i + 1 < p.length; i += 2) { const x = p[i], z = p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
function polyLen(p) { let L = 0; for (let i = 2; i + 1 < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return L; }
function dpSimplify(p, tol, closed) {
  const n = p.length >> 1; if (n < 3) return toF32(p);
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]]; const t2 = tol * tol;
  if (closed) { // split the ring at the farthest point from vertex 0
    let far = 0, bd = -1; for (let i = 1; i < n; i++) { const d = D.dist2(p[0], p[1], p[i * 2], p[i * 2 + 1]); if (d > bd) { bd = d; far = i; } }
    keep[far] = 1; stack.length = 0; stack.push([0, far], [far, n - 1]);
  }
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, md = t2;
    for (let i = a + 1; i < b; i++) { const d = segDist2(p[i * 2], p[i * 2 + 1], p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1]); if (d > md) { md = d; idx = i; } }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  if (closed && out.length > 2 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return Float32Array.from(out);
}
function chaikin(p, iters, closed) {
  let a = toF32(p);
  for (let it = 0; it < iters; it++) {
    const n = a.length >> 1; if (n < 3) return a;
    const o = [];
    if (!closed) o.push(a[0], a[1]);
    const lim = closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const j = (i + 1) % n, ax = a[i * 2], az = a[i * 2 + 1], bx = a[j * 2], bz = a[j * 2 + 1];
      o.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
    }
    if (!closed) o.push(a[a.length - 2], a[a.length - 1]);
    a = Float32Array.from(o);
  }
  return a;
}
function resample(p, step, closed) {
  p = toF32(p); const n = p.length >> 1; if (n < 2) return p;
  const pts = closed ? Float32Array.from(Array.from(p).concat([p[0], p[1]])) : p;
  const m = pts.length >> 1; let L = 0; for (let i = 1; i < m; i++) L += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  if (L < 1e-3) return p;
  const cnt = Math.max(closed ? 3 : 1, Math.round(L / step)), st = L / cnt;
  const out = [pts[0], pts[1]]; let seg = 0, segPos = 0, acc = 0;
  let segL = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
  for (let k = 1; k < cnt + (closed ? 0 : 1); k++) {
    const target = k * st;
    while (acc + segL < target - 1e-6 && seg < m - 2) { acc += segL; seg++; segL = Math.hypot(pts[seg * 2 + 2] - pts[seg * 2], pts[seg * 2 + 3] - pts[seg * 2 + 1]); }
    const u = segL > 1e-9 ? clamp((target - acc) / segL, 0, 1) : 0;
    if (!closed && k === cnt) { out.push(pts[m * 2 - 2], pts[m * 2 - 1]); break; }
    out.push(pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * u, pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * u);
    segPos = u;
  }
  return Float32Array.from(out);
}
// Kit local frame: world = (x + lx·c + lz·s, z − lx·s + lz·c)
function rectPoly(x, z, rot, w, d) {
  const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
  const o = new Float32Array(8), L = [-hw, -hd, hw, -hd, hw, hd, -hw, hd];
  for (let i = 0; i < 4; i++) { const lx = L[i * 2], lz = L[i * 2 + 1]; o[i * 2] = x + lx * c + lz * s; o[i * 2 + 1] = z - lx * s + lz * c; }
  return o;
}
function corners(b, pad) {
  pad = pad || 0;
  const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2 + pad, hd = b.d / 2 + pad;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]);
}
function obbOverlap(a, b, pad) {
  const A = corners(a, pad), B = corners(b, pad);
  const axes = [a.rot, a.rot + PI / 2, b.rot, b.rot + PI / 2];
  for (const ang of axes) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const p of A) { const v = p[0] * ax + p[1] * az; if (v < a0) a0 = v; if (v > a1) a1 = v; }
    for (const p of B) { const v = p[0] * ax + p[1] * az; if (v < b0) b0 = v; if (v > b1) b1 = v; }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}
function pointInB(b, x, z, pad) {
  pad = pad || 0;
  const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad;
}
// intersections of a horizontal line z with polygon edges (sorted x), for scanline fills
function scanX(poly, z, out) {
  out.length = 0; const n = poly.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const zi = poly[i * 2 + 1], zj = poly[j * 2 + 1];
    if ((zi > z) !== (zj > z)) { const xi = poly[i * 2], xj = poly[j * 2]; out.push(xi + (xj - xi) * (z - zi) / (zj - zi)); }
  }
  out.sort((a, b) => a - b);
  return out;
}
const geo = { dp: dpSimplify, chaikin, resample, pip, area: polyArea, centroid: polyCentroid, bbox: (p) => bboxOf(p, 0), distToPolyline, distToLoop, rectPoly, len: polyLen, toF32, toPairs };
Town.geo = geo;

// deterministic priority queue: Float64 keys, ties broken by insertion order
class PQ {
  constructor(cap) { cap = cap || 256; this.k = new Float64Array(cap); this.s = new Int32Array(cap); this.v = new Int32Array(cap); this.n = 0; this.seq = 0; }
  get size() { return this.n; }
  less(i, j) { return this.k[i] < this.k[j] || (this.k[i] === this.k[j] && this.s[i] < this.s[j]); }
  push(key, val) {
    if (this.n >= this.k.length) { const c = this.k.length * 2; const k = new Float64Array(c), s = new Int32Array(c), v = new Int32Array(c); k.set(this.k); s.set(this.s); v.set(this.v); this.k = k; this.s = s; this.v = v; }
    let i = this.n++; this.k[i] = key; this.s[i] = this.seq++; this.v[i] = val;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  swap(a, b) { let t = this.k[a]; this.k[a] = this.k[b]; this.k[b] = t; t = this.s[a]; this.s[a] = this.s[b]; this.s[b] = t; t = this.v[a]; this.v[a] = this.v[b]; this.v[b] = t; }
  peekKey() { return this.n ? this.k[0] : Infinity; }
  pop() {
    const top = this.v[0]; this.lastKey = this.k[0];
    this.n--; if (this.n > 0) { this.k[0] = this.k[this.n]; this.s[0] = this.s[this.n]; this.v[0] = this.v[this.n]; }
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.n && this.less(l, m)) m = l; if (r < this.n && this.less(r, m)) m = r; if (m === i) break; this.swap(i, m); i = m; }
    return top;
  }
}

// simple point hash (buckets of B metres) for lane-point queries
class PtHash {
  constructor(B) { this.B = B; this.m = new Map(); }
  key(bx, bz) { return (bx + 64) * 8192 + (bz + 64); }
  add(p) { const k = this.key(Math.floor(p.x / this.B), Math.floor(p.z / this.B)); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(p); }
  query(x, z, r, fn) {
    const B = this.B, bx0 = Math.floor((x - r) / B), bx1 = Math.floor((x + r) / B), bz0 = Math.floor((z - r) / B), bz1 = Math.floor((z + r) / B), r2 = r * r;
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) {
      const a = this.m.get(this.key(bx, bz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const p = a[i], dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz <= r2) if (fn(p, dx * dx + dz * dz) === false) return; }
    }
  }
}

// ---- Kit access (the Kit is another workstream: guard every call) -----------------------------------
let localClock = 0;
const KIT_SHIM = {
  KINDS: {},
  design(kind, x, z, rot, o) {
    o = o || {};
    return { kind, x, z, rot, w: o.w || 8, d: o.d || 8, h: o.h || 6, floors: o.floors || 1, wealth: o.wealth === undefined ? 0.5 : o.wealth, age: o.age || 0,
      seed: (o.seed >>> 0) || 1, var: o.var || 0, region: o.region || 0, gable: o.gable || 'side', party: o.party || 0, jetty: o.jetty || 0, trade: o.trade || 'none', water: o.water || 0, mat: o.mat || null };
  },
  add() { }, remove() { }, reseat() { }, clear() { }, setVisible() { }, count() { return 0; },
  wallRun() { return []; }, pierRun() { return []; }, showGhost() { }, catalogue() { return []; }
};
const DEFAULT_META = { seat: 'ground', collide: true, placeable: false, name: '', emoji: '🏠' };
function K() { const k = D.Kit; return k && typeof k.add === 'function' && typeof k.design === 'function' ? k : KIT_SHIM; }
function kclock() { const k = D.Kit; return k && typeof k.clock === 'number' ? k.clock : localClock; }
function kmeta(kind) { const k = D.Kit; return (k && k.KINDS && k.KINDS[kind]) || DEFAULT_META; }
function kdesign(kind, x, z, rot, o) {
  const k = K();
  let r = null;
  try { r = k.design(kind, x, z, rot, o); } catch (e) { console.warn('[town] Kit.design failed for', kind, e); }
  if (!r) r = KIT_SHIM.design(kind, x, z, rot, o);
  if (!r.seed) r.seed = (o && o.seed) || 1;
  return r;
}

// =====================================================================================================
// Zone texture, per-settlement bounding boxes
// =====================================================================================================
let zoneDirtyRect = null, zoneVer = 1;
function zoneRect(i0, j0, i1, j1) {
  i0 = clamp(i0 | 0, 0, N - 1); j0 = clamp(j0 | 0, 0, N - 1); i1 = clamp(Math.ceil(i1), 0, N - 1); j1 = clamp(Math.ceil(j1), 0, N - 1);
  const r = zoneDirtyRect;
  if (!r) zoneDirtyRect = [i0, j0, i1, j1];
  else { r[0] = Math.min(r[0], i0); r[1] = Math.min(r[1], j0); r[2] = Math.max(r[2], i1); r[3] = Math.max(r[3], j1); }
  zoneVer++;
  if (D.UI && D.UI.navDirty) D.UI.navDirty();
}
const BB = { ver: 0, i0: new Int32Array(256), j0: new Int32Array(256), i1: new Int32Array(256), j1: new Int32Array(256), hc: new Int32Array(256), mc: new Int32Array(256) };
function allBBs() {
  if (BB.ver === zoneVer) return BB;
  BB.ver = zoneVer;
  BB.i0.fill(1 << 30); BB.j0.fill(1 << 30); BB.i1.fill(-1); BB.j1.fill(-1); BB.hc.fill(0); BB.mc.fill(0);
  const Z = W.zone;
  for (let j = 0; j < N; j++) {
    const row = j * N;
    for (let i = 0; i < N; i++) {
      const g = Z[(row + i) * 4 + 1]; if (!g) continue;
      if (i < BB.i0[g]) BB.i0[g] = i; if (i > BB.i1[g]) BB.i1[g] = i;
      if (j < BB.j0[g]) BB.j0[g] = j; if (j > BB.j1[g]) BB.j1[g] = j;
      BB.hc[g]++; if (Z[(row + i) * 4]) BB.mc[g]++;
    }
  }
  return BB;
}
function sidWorldBB(sid, pad) {
  const b = allBBs(); if (!b.hc[sid]) return null; pad = pad || 0;
  return [b.i0[sid] * CELL - pad, b.j0[sid] * CELL - pad, (b.i1[sid] + 1) * CELL + pad, (b.j1[sid] + 1) * CELL + pad];
}
const bbHit = (a, b) => a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function cellK(x, z) { return clamp(Math.floor(z / CELL), 0, N - 1) * N + clamp(Math.floor(x / CELL), 0, N - 1); }
function biasB(cell) { const b = W.zone[cell * 4 + 2]; return b ? (b - 128) / 127 : 0; }

// =====================================================================================================
// Records & history
// =====================================================================================================
function copyRec(S) {
  if (!S) return null;
  const o = Object.assign({}, S);
  o.tw = Object.assign({}, S.tw);
  o.pending = S.pending ? Object.assign({}, S.pending) : null;
  if (S.ey) o.ey = S.ey.slice();
  if (S.plock) o.plock = Object.assign({}, S.plock);
  return o;
}
// ---- Living History record fields (spec §3.5): by 'p'|'h', fy founded year, ey[epoch] = year the epoch began,
// grow (history may extend it), plock {wealth, walls} (tweaks the player set). All optional: absent = unknown/player.
// (the begin commit runs with started still false: its foundings are dated too)
function yearNow() { const St = D.Story; return St && (St.started || St.committing === true) && typeof St.time === 'function' ? +St.time() || 0 : 0; }
Town.yearNow = yearNow;
function stampEy(S, ep, y) { const e = S.ey || (S.ey = []); for (let i = e.length; i < ep; i++) e[i] = 0; e[ep] = y; }
const minNZ = (a, b) => (a > 0 && b > 0) ? Math.min(a, b) : (a > 0 ? a : b > 0 ? b : 0);
function mergeYears(K, O) { // a player zone merge: the keeper takes the earliest known dates (approximate, §3.5)
  K.fy = minNZ(K.fy | 0, O.fy | 0);
  const a = K.ey || [], b = O.ey || [], n = Math.max(a.length, b.length);
  if (!n) return;
  const out = []; for (let i = 0; i < n; i++) out[i] = minNZ(+a[i] || 0, +b[i] || 0);
  K.ey = out;
}
// a new pending job for S. A pending expand that has not run yet keeps its (older) epoch so its cells are still
// planned (Ctx marks cells with alpha ≥ epoch as new), and a queued great-work request rides along on whatever
// job replaces it.
function nextPending(S, kind) {
  const old = S.pending, p = { kind, jobId: Town.nextJob++, epoch: S.epochs };
  if (old && kind === 'expand' && (old.kind === 'expand' || old.kind === 'work') && old.epoch > 0) p.epoch = Math.min(old.epoch, S.epochs);
  if (old && old.work) { p.work = old.work; p.wid = old.wid; if (old.cellsEp) p.cellsEp = old.cellsEp; }
  return p;
}
const needReconcile = new Set();        // sids restored by history
const restampQ = new Set();             // sids whose shown records need their built year re-derived (undo of a stamp)
let histVer = 1;                        // bumped on every record change: Town.hist.list() cache key
const needRefilter = new Set();         // sids whose visibility inputs changed
let needRefilterAll = false, refilterInstant = false;
const redecorateQ = new Set();          // sids to redecorate (wave)
const redecorateInstant = new Set();    // sids to redecorate instantly (undo of prosperity)
const bVersion = new Int32Array(256);
const LRU = new Map();                   // jobId -> Plan (≤ 32)
const instantJobs = new Set();           // jobIds whose reveal must be instant (undo/redo/load)
function lruSet(id, P) { LRU.delete(id); LRU.set(id, P); while (LRU.size > 32) LRU.delete(LRU.keys().next().value); }
const PLAN_VER = 4;                      // 4: terraced cores, tighter + deeper plots, denser lanes, closes (village/town planner)
const TW_DEFAULT = { dens: 0.5, wealth: 0.45, walls: 'none', layout: 0.2, squares: 0.4, greens: 0.5, gardens: 0.6 };
function twFrom(o) {
  const t = {};
  for (const k in TW_DEFAULT) t[k] = o && o[k] !== undefined ? o[k] : TW_DEFAULT[k];
  t.walls = t.walls === 'palisade' || t.walls === 'stone' ? t.walls : 'none';
  return t;
}
function emitChanged() { townChangedT = 0; histVer++; D.emit('town:changed'); }
let townChangedT = 0, townChangedPending = false;

// =====================================================================================================
// Live building records (manual + settlement) in 1 km chunks
// =====================================================================================================
let nextBid = 1;
function chunkOf(x, z) { return clamp(Math.floor(z / CHS), 0, NCH - 1) * NCH + clamp(Math.floor(x / CHS), 0, NCH - 1); }
function forNear(x0, z0, x1, z1, fn) {
  const c0 = chunkOf(x0 - 60, z0 - 60), c1 = chunkOf(x1 + 60, z1 + 60);
  for (let cz = Math.floor(c0 / NCH); cz <= Math.floor(c1 / NCH); cz++) for (let cx = c0 % NCH; cx <= c1 % NCH; cx++) {
    const a = chunks[cz * NCH + cx];
    for (let k = a.length - 1; k >= 0; k--) {
      const b = a[k];
      if (b.x >= x0 - 60 && b.x <= x1 + 60 && b.z >= z0 - 60 && b.z <= z1 + 60) if (fn(b) === false) return;
    }
  }
}
// seat a record on the terrain by its Kit seat mode (§3.4)
function seat(rec) {
  const T = D.Terrain, mode = kmeta(rec.kind).seat || 'ground';
  const cs = corners(rec);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < 5; i++) {
    const p = i < 4 ? cs[i] : [rec.x, rec.z];
    const y = T.hAt(p[0], p[1]); if (y < mn) mn = y; if (y > mx) mx = y;
  }
  if (mode === 'water') {
    const w = T.waterAt(rec.x, rec.z);
    rec.y = w > mn ? w : mx; rec.y0 = mn - 0.5;
  } else if (mode === 'given') {
    if (rec.kind === 'bridge') {
      const c = Math.cos(rec.rot), s = Math.sin(rec.rot), hw = rec.w / 2;
      const ya = T.hAt(rec.x - hw * c, rec.z + hw * s), yb = T.hAt(rec.x + hw * c, rec.z - hw * s);
      const wl = T.waterAt(rec.x, rec.z);
      rec.y = Math.max(ya, yb, wl + 2.5); rec.y0 = mn - 0.5;
    } else { const y = T.hAt(rec.x, rec.z); rec.y = y; rec.y0 = Math.min(mn, y) - 1.5; }
  } else { rec.y = mx; rec.y0 = mn - 1.5; }
  return rec;
}
function liveAdd(rec) {
  const ci = chunkOf(rec.x, rec.z);
  chunks[ci].push(rec);
  try { K().add(rec); } catch (e) { console.warn('[town] Kit.add failed', rec.kind, e); }
  navRecDirty = true;
}
// remove records (batched chunk filtering)
function liveRemove(recs, sink) {
  if (!recs.length) return;
  const touched = new Set();
  const k = K();
  for (const r of recs) { r._gone = true; touched.add(chunkOf(r.x, r.z)); try { k.remove(r, !!sink); } catch (e) { } }
  touched.forEach(ci => { chunks[ci] = chunks[ci].filter(b => !b._gone); });
  navRecDirty = true;
}
function cleanCopy(b) { const o = {}; for (const k in b) if (k[0] !== '_' && k !== 'die') o[k] = b[k]; return o; }
function addManual(rec) {
  const ci = chunkOf(rec.x, rec.z);
  D.History.touchChunk('city', ci);
  rec.auto = false; delete rec.sid; delete rec.key;
  if (!rec.id) rec.id = nextBid++;
  chunks[ci].push(rec);
  try { K().add(rec); } catch (e) { console.warn('[town] Kit.add failed', e); }
  navRecDirty = true;
  manualChanged(rec);
  return rec;
}
function removeManual(rec, sink) {
  const ci = chunkOf(rec.x, rec.z);
  D.History.touchChunk('city', ci);
  const a = chunks[ci], i = a.indexOf(rec);
  if (i >= 0) a.splice(i, 1);
  try { K().remove(rec, sink !== false); } catch (e) { }
  navRecDirty = true;
  manualChanged(rec);
}
// ---- manual (player-placed) buildings: a lazily rebuilt per-chunk index. Settlement content never overlaps them:
// planners stamp them as BUILDING and visibleItem hides older plan items they overlap (Living History I2).
let manualVer = 1, manualIdxVer = 0;
const manualIdx = new Map();              // chunk -> [manual recs]
function manualChanged(rec) {
  manualVer++;
  if (rec) { const r = Math.hypot(rec.w || 8, rec.d || 8) / 2 + 4, bb = [rec.x - r, rec.z - r, rec.x + r, rec.z + r]; list.forEach(S => { if (bbHit(sidWorldBB(S.id, 20), bb)) needRefilter.add(S.id); }); }
}
function manualIndex() {
  if (manualIdxVer === manualVer) return manualIdx;
  manualIdx.clear();
  for (let ci = 0; ci < chunks.length; ci++) { const a = chunks[ci]; for (let q = 0; q < a.length; q++) if (!a[q].sid) { let m = manualIdx.get(ci); if (!m) manualIdx.set(ci, m = []); m.push(a[q]); } }
  manualIdxVer = manualVer;
  return manualIdx;
}
function forManual(x0, z0, x1, z1, fn) {
  const M = manualIndex(); if (!M.size) return;
  const c0 = chunkOf(x0 - 60, z0 - 60), c1 = chunkOf(x1 + 60, z1 + 60);
  for (let cz = Math.floor(c0 / NCH); cz <= Math.floor(c1 / NCH); cz++) for (let cx = c0 % NCH; cx <= c1 % NCH; cx++) {
    const a = M.get(cz * NCH + cx); if (!a) continue;
    for (let k = 0; k < a.length; k++) { const b = a[k]; if (b.x >= x0 - 60 && b.x <= x1 + 60 && b.z >= z0 - 60 && b.z <= z1 + 60) if (fn(b) === false) return; }
  }
}
// does a settlement building overlap a player's manual building?
function manualSuppressed(rec) {
  if (!manualIndex().size) return false;
  const r = Math.hypot(rec.w || 6, rec.d || 6) / 2;
  let hit = false;
  forManual(rec.x - r, rec.z - r, rec.x + r, rec.z + r, m => {
    if (kmeta(m.kind).collide === false) return;
    if (Math.hypot(m.x - rec.x, m.z - rec.z) > r + Math.hypot(m.w || 6, m.d || 6) / 2) return;
    if (obbOverlap(rec, m, -0.2)) { hit = true; return false; }
  });
  return hit;
}
Town.forManual = forManual;
const cityStore = {
  snapChunk: ci => chunks[ci].filter(b => !b.sid),
  loadChunk(ci, s) {
    const cur = chunks[ci], snap = s || [];
    const want = new Set(snap), have = new Set();
    const drop = [];
    for (const b of cur) { if (b.sid) continue; if (want.has(b)) have.add(b); else drop.push(b); }
    const k = K();
    for (const b of drop) { try { k.remove(b, false); } catch (e) { } }
    const next = cur.filter(b => b.sid), added = [];
    for (const b of snap) {
      if (have.has(b)) { next.push(b); continue; }
      const c = cleanCopy(b); c.born = kclock() - 10; seat(c);
      next.push(c); added.push(c);
      try { k.add(c); } catch (e) { }
    }
    chunks[ci] = next;
    navRecDirty = true;
    // undo / redo of player buildings: settlement houses they hid (or now overlap) are re-filtered
    for (const b of drop) manualChanged(b);
    for (const b of added) manualChanged(b);
    manualVer++;
  }
};
const townStore = {
  snapChunk: id => copyRec(list.get(id)) || null,
  loadChunk(id, s) {
    if (s) list.set(id, copyRec(s)); else list.delete(id);
    needReconcile.add(id); restampQ.add(id); histVer++;
    if (s && s.pending) instantJobs.add(s.pending.jobId);
  }
};

// =====================================================================================================
// Names (§5.12)
// =====================================================================================================
// (append only: names are saved, so growing the pools never renames an existing place)
const PREFIX = ['Ash', 'Thorn', 'Brad', 'Wick', 'Oak', 'Stan', 'Mel', 'Ald', 'Crow', 'Wend', 'Hart', 'Ley', 'Bram', 'Fern', 'Kings', 'Sut', 'Wes', 'Nor', 'Hol', 'Mar', 'Brook', 'Lang', 'Whit', 'Red',
  'Elm', 'Hazel', 'Ship', 'Wool', 'Stock', 'Barn', 'Chad', 'Dun', 'Eg', 'Fal', 'Gold', 'Hamp', 'Ick', 'Kel', 'Lid', 'Mid', 'New', 'Ot', 'Pen', 'Rad', 'Salt', 'Tad', 'Up', 'Wal', 'Win', 'Yar',
  'Ab', 'Bur', 'Cal', 'Ched', 'Dray', 'Ever', 'Fox', 'Gat', 'Hen', 'Kirk', 'Lox', 'Mere', 'Ny', 'Pid', 'Rook', 'Sand', 'Thack', 'Wan'];
const SUFFIX = ['ton', 'by', 'ham', 'ley', 'thorpe', 'stead', 'worth', 'wick', 'field', 'combe', 'hurst', 'den', 'stow', 'cote'];
const SAINTS = ['Mary', 'Michael', 'Peter', 'Paul', 'Andrew', 'John', 'James', 'Thomas', 'Bartholomew', 'Matthew', 'Luke', 'Mark', 'Stephen', 'Lawrence', 'Nicholas', 'Martin', 'George',
  'Giles', 'Leonard', 'Botolph', 'Cuthbert', 'Aidan', 'Oswald', 'Chad', 'Wilfrid', 'Hilda', 'Etheldreda', 'Swithun', 'Edmund', 'Alban', 'Augustine', 'Benedict', 'Bride', 'Dunstan',
  'Guthlac', 'Werburgh', 'Frideswide', 'Neot', 'Petroc', 'Helen'];
const NAME_PRE = ['Great ', 'Little ', 'Market ', 'Kings '];
function nameTaken(n, exceptSid) { for (const [sid, S] of list) if (sid !== exceptSid && S.name === n) return true; return false; }
function joinName(p, s) {
  if (p.endsWith('s') && s[0] === 's') s = s.slice(1);
  if (p.endsWith(s[0]) && s.length > 2 && s[0] === s[1]) s = s.slice(1);
  return p + s;
}
function riverIn(cells) {
  if (!D.Water || !D.Water.riverAt) return false;
  const step = Math.max(1, Math.floor(cells.length / 160));
  for (let i = 0; i < cells.length; i += step) {
    const k = cells[i], x = (k % N + 0.5) * CELL, z = (Math.floor(k / N) + 0.5) * CELL;
    if (D.Water.riverAt(x, z) > D.Terrain.hAt(x, z)) return true;
  }
  return false;
}
function makeName(type, cells, walls, seed, exceptSid) {
  const r = D.rng(hash32(seed, 'name'));
  const river = type !== 3 && riverIn(cells);
  for (let tries = 0; tries < 60; tries++) {
    const p = PREFIX[Math.floor(r() * PREFIX.length)];
    let s = SUFFIX[Math.floor(r() * SUFFIX.length)];
    if (river && r() < 0.65) s = 'ford';
    if (type === 5) s = r() < 0.5 ? 'wick' : 'mouth';
    else if (type === 4) s = 'minster';
    else if (type === 2 && r() < 0.75) s = 'field';
    else if (type === 1 && walls !== 'none' && r() < 0.6) s = 'bury';
    let n = joinName(p, s);
    if (type === 3) n = joinName(p, SUFFIX[Math.floor(r() * 3)]) + ' Castle';
    else if (type === 4 && r() < 0.5) n = 'St ' + SAINTS[Math.floor(r() * SAINTS.length)] + "'s " + (r() < 0.5 ? 'Priory' : 'Abbey');
    if (tries > 40) n += [' Parva', ' Magna', ' St Mary', ' Green', ' End'][tries % 5];
    if (!nameTaken(n, exceptSid)) return n;
  }
  // before numbering: Great / Little / Market / Kings ‹name›
  for (let tries = 0; tries < 40; tries++) {
    const n = NAME_PRE[tries % 4] + joinName(PREFIX[Math.floor(r() * PREFIX.length)], SUFFIX[Math.floor(r() * SUFFIX.length)]) + (type === 3 ? ' Castle' : '');
    if (!nameTaken(n, exceptSid)) return n;
  }
  return 'Settlement ' + (Town.nextUid);
}

// =====================================================================================================
// Zone painting & stroke resolution (§5.3)
// =====================================================================================================
function stAddBB(st, i0, j0, i1, j1) {
  if (!st.zbb) st.zbb = [i0, j0, i1, j1];
  else { const b = st.zbb; b[0] = Math.min(b[0], i0); b[1] = Math.min(b[1], j0); b[2] = Math.max(b[2], i1); b[3] = Math.max(b[3], j1); }
}
function paintCells(p, st, o) {
  const T = +o.ztype || 0, erase = !!st.shift || T === 0, r = Math.max(8, o.size);
  const i0 = Math.max(0, Math.floor((p.x - r) / CELL)), i1 = Math.min(N - 1, Math.floor((p.x + r) / CELL));
  const j0 = Math.max(0, Math.floor((p.z - r) / CELL)), j1 = Math.min(N - 1, Math.floor((p.z + r) / CELL));
  if (i1 < i0 || j1 < j0) return;
  D.History.touch('zone', i0, j0, i1, j1);
  const Z = W.zone;
  if (!st.touchedSids) { st.touchedSids = new Set(); st.lostSids = new Set(); }
  const ci = clamp(Math.floor(p.x / CELL), 0, N - 1), cj = clamp(Math.floor(p.z / CELL), 0, N - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot((i + 0.5) * CELL - p.x, (j + 0.5) * CELL - p.z);
    if (d > r && !(i === ci && j === cj)) continue;
    const k = (j * N + i) * 4, cr = Z[k], cg = Z[k + 1];
    if (erase) { if (cr > 0) { Z[k] = 0; if (cg) st.touchedSids.add(cg); } continue; }
    if (cr === T) continue;
    const S = cg ? list.get(cg) : null;
    if (S && S.type === T) { Z[k] = T; st.touchedSids.add(cg); continue; }
    if (cg) st.lostSids.add(cg);
    Z[k] = T; Z[k + 1] = 0; Z[k + 3] = 255;
  }
  stAddBB(st, i0, j0, i1, j1);
  zoneRect(i0, j0, i1, j1);
}

let bfsVisited = null, bfsQueue = null;
function freeSlot() { for (let s = 1; s <= 255; s++) if (!list.has(s)) return s; return 0; }
function deleteSettlement(S) { // inside an entry: touch record + zone, clear its g/a cells
  const b = sidWorldBB(S.id);
  D.History.touchChunk('town', S.id);
  list.delete(S.id);
  if (b) {
    const bb = allBBs(), i0 = bb.i0[S.id], j0 = bb.j0[S.id], i1 = bb.i1[S.id], j1 = bb.j1[S.id];
    D.History.touch('zone', i0, j0, i1, j1);
    const Z = W.zone;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = (j * N + i) * 4; if (Z[k + 1] === S.id) { Z[k] = 0; Z[k + 1] = 0; Z[k + 3] = 0; } }
    zoneRect(i0, j0, i1, j1);
  }
  needReconcile.add(S.id);
}
function mergePlans(A, B) {
  if (!A) return B; if (!B) return A;
  const all = [];
  const push = (arr, src, kind) => arr.forEach((e, i) => all.push({ e, src, kind, o: e.o, i }));
  push(A.lanes, 0, 'lanes'); push(A.plots, 0, 'plots'); push(A.specials, 0, 'specials'); push(A.areas, 0, 'areas');
  push(B.lanes, 1, 'lanes'); push(B.plots, 1, 'plots'); push(B.specials, 1, 'specials'); push(B.areas, 1, 'areas');
  // interleave on the original o: normalise each plan's o to [0,1) of its own n, stable
  all.sort((a, b) => (a.o / Math.max(1, a.src ? B.n : A.n)) - (b.o / Math.max(1, b.src ? B.n : A.n)) || a.src - b.src || a.o - b.o || a.i - b.i);
  const out = { lanes: [], plots: [], specials: [], areas: [] };
  let wallO = -1;
  all.forEach((x, idx) => {
    const e = Object.assign({}, x.e, { o: idx });
    delete e.nE;                          // phase anchors are in the old o scale: re-anchor to the merged plan
    out[x.kind].push(e);
    if (x.src === 0 && A.wallO >= 0 && wallO < 0 && x.o >= A.wallO) wallO = idx;
  });
  return Object.assign({}, A, out, { wallO: A.wallO >= 0 ? (wallO >= 0 ? wallO : all.length - 1) : -1, n: all.length, merged: (A.merged || 1) + 1 });
}
function resolveStroke(st, o) {
  if (!st || !st.zbb) return;
  const T = +o.ztype || 0, erase = !!st.shift || T === 0;
  const Z = W.zone;
  const lost = st.lostSids || new Set(), touched = st.touchedSids || new Set();
  lost.forEach(s => needRefilter.add(s)); touched.forEach(s => needRefilter.add(s));
  if (erase) {
    // settlements whose H meets the stroke: refilter (hide content anchored on erased cells)
    const [i0, j0, i1, j1] = st.zbb;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const g = Z[(j * N + i) * 4 + 1]; if (g) needRefilter.add(g); }
    emitChanged();
    return;
  }
  if (!bfsVisited) { bfsVisited = new Uint8Array(N * N); bfsQueue = new Int32Array(N * N); }
  const vis = bfsVisited, Q = bfsQueue, dirty = [];
  const [i0, j0, i1, j1] = st.zbb;
  let made = 0, tooSmall = false, full = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k0 = j * N + i;
    if (vis[k0] || Z[k0 * 4 + 3] !== 255 || Z[k0 * 4] !== T) continue;
    // BFS the 8-connected component of type T
    let qh = 0, qt = 0; Q[qt++] = k0; vis[k0] = 1; dirty.push(k0);
    const owners = new Set(), comp = [];
    while (qh < qt) {
      const k = Q[qh++]; comp.push(k);
      const g = Z[k * 4 + 1]; if (g) { const S = list.get(g); if (S && S.type === T) owners.add(g); }
      const ci = k % N, cj = (k / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni; if (vis[nk] || Z[nk * 4] !== T) continue;
        vis[nk] = 1; dirty.push(nk); Q[qt++] = nk;
      }
    }
    const fresh = comp.filter(k => Z[k * 4 + 3] === 255);
    if (!owners.size) {
      const revert = () => { for (const k of fresh) { Z[k * 4] = 0; Z[k * 4 + 3] = 0; } };
      if (comp.length < 10) { revert(); tooSmall = true; continue; }
      let slot = freeSlot();
      if (!slot) { // garbage-collect a settlement with no current cells
        const bb = allBBs();
        const ids = Array.from(list.keys()).sort((a, b) => a - b);
        for (const sid of ids) if (!bb.mc[sid]) { deleteSettlement(list.get(sid)); slot = sid; break; }
      }
      if (!slot) { revert(); full = true; continue; }
      D.History.touchChunk('town', slot);           // snapshot = null (record does not exist yet)
      const uid = Town.nextUid++;
      const seed = hash32(W.seed || 1, comp[0], uid);
      const S = { id: slot, uid, type: T, seed, name: '', tw: twFrom(o), epochs: 1, razed: [], plan: null,
        pending: { kind: 'found', jobId: Town.nextJob++, epoch: 1 }, pin: null, by: 'p', fy: 0, ey: [], grow: true, plock: {} };
      const yN = yearNow(); if (yN > 0) { S.fy = Math.floor(yN); stampEy(S, 1, yN); }
      S.name = makeName(T, comp, S.tw.walls, seed, slot);
      list.set(slot, S);
      for (const k of fresh) { Z[k * 4 + 1] = slot; Z[k * 4 + 3] = 1; }
      needReconcile.add(slot);
      made++;
      continue;
    }
    // one or several owners: the keeper is the lowest uid
    const own = Array.from(owners).map(s => list.get(s)).sort((a, b) => a.uid - b.uid);
    const keeper = own[0];
    own.forEach(S => D.History.touchChunk('town', S.id));
    for (let q = 1; q < own.length; q++) {
      const O = own[q], bb = allBBs();
      const a0 = bb.i0[O.id], b0 = bb.j0[O.id], a1 = bb.i1[O.id], b1 = bb.j1[O.id];
      if (a1 >= a0) {
        D.History.touch('zone', a0, b0, a1, b1);
        for (let jj = b0; jj <= b1; jj++) for (let ii = a0; ii <= a1; ii++) { const kk = (jj * N + ii) * 4; if (Z[kk + 1] === O.id) Z[kk + 1] = keeper.id; }
        zoneRect(a0, b0, a1, b1);
      }
      keeper.plan = mergePlans(keeper.plan, O.plan);
      keeper.razed = keeper.razed.concat(O.razed || []);
      mergeYears(keeper, O);
      transferLive(O.id, keeper.id);
      list.delete(O.id);
      needReconcile.add(O.id);
    }
    keeper.epochs = Math.min(254, keeper.epochs + 1);
    for (const k of fresh) { Z[k * 4 + 1] = keeper.id; Z[k * 4 + 3] = keeper.epochs; }
    { const yN = yearNow(); if (yN > 0) stampEy(keeper, keeper.epochs, yN); }
    const wasFound = keeper.pending && keeper.pending.kind === 'found', wasReplan = keeper.pending && keeper.pending.kind === 'replan';
    keeper.pending = nextPending(keeper, (!keeper.plan || wasFound) ? 'found' : wasReplan ? 'replan' : 'expand');
    needReconcile.add(keeper.id); needRefilter.add(keeper.id);
    made++;
  }
  for (const k of dirty) vis[k] = 0;
  // any stray transient marks (should not happen) are cleared
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = (j * N + i) * 4; if (Z[k + 3] === 255) { Z[k] = 0; Z[k + 1] = 0; Z[k + 3] = 0; } }
  zoneRect(i0, j0, i1, j1);
  if (tooSmall && !made) D.toast('Too small to settle. Paint a bigger area.', 'warn');
  if (full) D.toast('Too many settlements', 'warn');
  emitChanged();
}
function settlementAt(x, z) {
  const k = cellK(x, z) * 4, g = W.zone[k + 1];
  if (g && list.has(g) && W.zone[k]) return list.get(g);
  const b = Town.buildingAt(x, z); if (b && b.sid && list.has(b.sid)) return list.get(b.sid);
  let best = null, bd = 60 * 60;
  for (const S of list.values()) { const o = originOf(S); const d = D.dist2(o.x, o.z, x, z); if (d < bd) { bd = d; best = S; } }
  return best;
}
function originOf(S) {
  if (S.plan && S.plan.origin) return S.plan.origin;
  const b = sidWorldBB(S.id); if (!b) return { x: 0, z: 0, kind: 'none' };
  return { x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, kind: 'none' };
}

// =====================================================================================================
// Planner context (the PLANNER EXTENSION API documented at the top of this file)
// =====================================================================================================
function chamfer(src, w, h, step, want) { // distance (m) from every cell to the nearest cell with src == want
  const d = new Float32Array(w * h), a = step, b = step * Math.SQRT2, INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = src[i] === want ? 0 : INF;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; let v = d[k]; if (!v) continue;
    if (i > 0 && d[k - 1] + a < v) v = d[k - 1] + a;
    if (j > 0) { if (d[k - w] + a < v) v = d[k - w] + a; if (i > 0 && d[k - w - 1] + b < v) v = d[k - w - 1] + b; if (i < w - 1 && d[k - w + 1] + b < v) v = d[k - w + 1] + b; }
    d[k] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i; let v = d[k]; if (!v) continue;
    if (i < w - 1 && d[k + 1] + a < v) v = d[k + 1] + a;
    if (j < h - 1) { if (d[k + w] + a < v) v = d[k + w] + a; if (i < w - 1 && d[k + w + 1] + b < v) v = d[k + w + 1] + b; if (i > 0 && d[k + w - 1] + b < v) v = d[k + w - 1] + b; }
    d[k] = v;
  }
  return d;
}
// marching squares over a (w×h) scalar grid, value(i,j) at cell centres; pad = value outside the grid.
// Returns [{pts: Float32Array, closed}] (closed loops and open chains), longest first.
function march(val, w, h, ox, oz, step, level, pad, interp) {
  const W2 = w + 2, H2 = h + 2, V = new Float32Array(W2 * H2), B = new Uint8Array(W2 * H2);
  for (let pj = 0; pj < H2; pj++) for (let pi = 0; pi < W2; pi++) {
    let v;
    if (pi < 1 || pj < 1 || pi > w || pj > h) v = pad === 'clamp' ? val[clamp(pj - 1, 0, h - 1) * w + clamp(pi - 1, 0, w - 1)] : pad;
    else v = val[(pj - 1) * w + (pi - 1)];
    V[pj * W2 + pi] = v; B[pj * W2 + pi] = v > level ? 1 : 0;
  }
  const NN = W2 * H2 * 2, nb = new Int32Array(NN * 2).fill(-1), touched = [];
  const link = (a, b) => { if (nb[a * 2] < 0) { nb[a * 2] = b; touched.push(a); } else nb[a * 2 + 1] = b; if (nb[b * 2] < 0) { nb[b * 2] = a; touched.push(b); } else nb[b * 2 + 1] = a; };
  for (let j = 0; j < H2 - 1; j++) for (let i = 0; i < W2 - 1; i++) {
    const k = j * W2 + i, c = B[k] * 8 + B[k + 1] * 4 + B[k + W2 + 1] * 2 + B[k + W2];
    if (c === 0 || c === 15) continue;
    const T = k * 2, Bo = (k + W2) * 2, L = k * 2 + 1, R = (k + 1) * 2 + 1;
    switch (c) {
      case 1: case 14: link(L, Bo); break;
      case 2: case 13: link(Bo, R); break;
      case 3: case 12: link(L, R); break;
      case 4: case 11: link(T, R); break;
      case 6: case 9: link(T, Bo); break;
      case 7: case 8: link(L, T); break;
      case 5: link(T, R); link(L, Bo); break;
      case 10: link(L, T); link(Bo, R); break;
    }
  }
  const pos = id => {
    const k = id >> 1, pi = k % W2, pj = (k / W2) | 0;
    if ((id & 1) === 0) { const a = V[k], b = V[k + 1]; const t = interp && a !== b ? clamp((level - a) / (b - a), 0.02, 0.98) : 0.5; return [ox + (pi - 0.5 + t) * step, oz + (pj - 0.5) * step]; }
    const a = V[k], b = V[k + W2]; const t = interp && a !== b ? clamp((level - a) / (b - a), 0.02, 0.98) : 0.5; return [ox + (pi - 0.5) * step, oz + (pj - 0.5 + t) * step];
  };
  const used = new Uint8Array(NN), out = [];
  const walk = start => {
    const pts = []; let prev = -1, cur = start;
    for (let guard = 0; guard < NN; guard++) {
      used[cur] = 1; const p = pos(cur); pts.push(p[0], p[1]);
      const a = nb[cur * 2], b = nb[cur * 2 + 1];
      let nx = -1;
      if (a >= 0 && a !== prev && !used[a]) nx = a; else if (b >= 0 && b !== prev && !used[b]) nx = b;
      if (nx < 0) { const closed = (a === start || b === start) && cur !== start && pts.length > 4; return { pts: Float32Array.from(pts), closed }; }
      prev = cur; cur = nx;
    }
    return { pts: Float32Array.from(pts), closed: false };
  };
  touched.sort((a, b) => a - b);
  for (const id of touched) if (!used[id] && nb[id * 2 + 1] < 0) out.push(walk(id));
  for (const id of touched) if (!used[id]) out.push(walk(id));
  out.forEach(c => { c.len = polyLen(c.pts); });
  out.sort((a, b) => b.len - a.len);
  return out;
}
function traceMaskLoops(mask, w, h, ox, oz, step) {
  const cs = march(mask, w, h, ox, oz, step, 0.5, 0, false).filter(c => c.closed);
  cs.forEach(c => { c.area = Math.abs(polyArea(c.pts)); });
  cs.sort((a, b) => b.area - a.area);
  return cs.map(c => c.pts);
}
// element key prefix per job. Expands carry the job id too: epochs cap at 254, so the epoch alone repeats
// on long-lived towns (Living History I4). Old plans keep their old keys.
function jobPrefix(uid, job) {
  return job.kind === 'expand' ? uid + ':x' + job.epoch + '.' + job.jobId + ':' : job.kind === 'work' ? uid + ':w' + job.jobId + ':'
    : job.kind === 'infill' ? uid + ':i' + job.jobId + ':' : uid + ':';
}
const AREA_CODE = { square: OCC.SQUARE, 1: OCC.YARD, 2: OCC.YARD, 3: OCC.SQUARE, 4: OCC.PRECINCT, 15: OCC.WALL, 16: OCC.PRECINCT };
const GENERIC_SPECIAL = { curtain: 1, precinct: 1, pierline: 1 };
class Ctx {
  constructor(S, job) {
    this.S = S; this.job = job; this.kind = job.kind; this.epoch = job.epoch;
    this.type = S.type; this.sid = S.id; this.uid = S.uid; this.seed = S.seed >>> 0;
    this.tw = Object.freeze(twFrom(S.tw));
    this.prev = (job.kind === 'expand' || job.kind === 'infill' || job.kind === 'work') ? S.plan : null;
    this.OCC = OCC; this.ALLOW = ALLOW; this.geo = geo;
    this.lanes = []; this.plots = []; this.specials = []; this.areas = [];
    this.o = 0; this.cnt = { L: 0, P: 0, S: 0, A: 0 };
    this.prefix = jobPrefix(S.uid, job);
    this._keepGW = [];
    this.wallO = -1; this.origin = null; this.style = null; this.msgs = []; this.neighbours = [];
    this._deadline = Infinity; this.empty = false; this._lastAnchor = -1;
    this._noise = D.makeNoise(hash32(this.seed, 'noise') & 0x7fffffff);
  }
  // ---- random / budget ------------------------------------------------------------------------------
  rng() { const a = [this.seed]; for (let i = 0; i < arguments.length; i++) a.push(arguments[i]); return D.rng(hash32.apply(null, a)); }
  hash() { const a = [this.seed]; for (let i = 0; i < arguments.length; i++) a.push(arguments[i]); return hash32.apply(null, a); }
  fbm(x, z) { return this._noise.fbm(x, z, 3); }
  allow() { return allowMask.apply(null, arguments); }
  overBudget() { return now() > (this._h ? this._h.deadline : this._deadline); }
  *yieldIfOverBudget() { if (now() > (this._h ? this._h.deadline : this._deadline)) yield; }
  nextO() { return this.o; }
  toast(m) { this.msgs.push(m); }
  setOrigin(x, z, kind) { this.origin = { x, z, kind: kind || 'none' }; }
  setWallO(o) { this.wallO = o; }

  // ---- set-up (time sliced) ---------------------------------------------------------------------------
  *_init() {
    const sid = this.sid, Z = W.zone, bb = allBBs(), T = D.Terrain;
    if (!bb.hc[sid]) { this.empty = true; this.cells = new Int32Array(0); this.cellCount = 0; this.areaM2 = 0; this.areaHa = 0; this.centroid = { x: 0, z: 0 }; return; }
    const ci0 = bb.i0[sid], cj0 = bb.j0[sid], ci1 = bb.i1[sid], cj1 = bb.j1[sid];
    this.ci0 = ci0; this.cj0 = cj0; this.cw = ci1 - ci0 + 1; this.chh = cj1 - cj0 + 1;
    const hm = this.hm = new Uint8Array(this.cw * this.chh), cells = [];
    const expand = this.kind === 'expand' || (this.kind === 'work' && this.job.cellsEp > 0);
    let sx = 0, sz = 0;
    for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) {
      const k = j * N + i; if (Z[k * 4 + 1] !== sid) continue;
      hm[(j - cj0) * this.cw + (i - ci0)] = (!expand || Z[k * 4 + 3] >= this.epoch) ? 2 : 1;
      cells.push(k); sx += (i + 0.5) * CELL; sz += (j + 0.5) * CELL;
    }
    this.cells = Int32Array.from(cells); this.cellCount = cells.length;
    this.areaM2 = cells.length * CELL * CELL; this.areaHa = this.areaM2 / 1e4;
    this.centroid = { x: sx / cells.length, z: sz / cells.length };
    this.hbb = { x0: ci0 * CELL, z0: cj0 * CELL, x1: (ci1 + 1) * CELL, z1: (cj1 + 1) * CELL };
    // window
    let x0 = ci0 * CELL - 80, x1 = (ci1 + 1) * CELL + 80, z0 = cj0 * CELL - 80, z1 = (cj1 + 1) * CELL + 80;
    const cap = 3200;
    if (x1 - x0 > cap) { const c = clamp(this.centroid.x, x0 + cap / 2, x1 - cap / 2); x0 = c - cap / 2; x1 = c + cap / 2; this.capped = true; }
    if (z1 - z0 > cap) { const c = clamp(this.centroid.z, z0 + cap / 2, z1 - cap / 2); z0 = c - cap / 2; z1 = c + cap / 2; this.capped = true; }
    x0 = Math.max(0, Math.floor(x0 / 4) * 4); z0 = Math.max(0, Math.floor(z0 / 4) * 4);
    x1 = Math.min(SIZE, Math.ceil(x1 / 4) * 4); z1 = Math.min(SIZE, Math.ceil(z1 / 4) * 4);
    this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1;
    const gw = this.gw = Math.max(1, (x1 - x0) / 4), gh = this.gh = Math.max(1, (z1 - z0) / 4);
    const hgt = this.hgt = new Float32Array(gw * gh), wl = this.wl = new Float32Array(gw * gh);
    const hin = this.hin4 = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      const z = z0 + (j + 0.5) * 4;
      for (let i = 0; i < gw; i++) {
        const x = x0 + (i + 0.5) * 4, k = j * gw + i;
        hgt[k] = T.hAt(x, z); wl[k] = T.waterAt(x, z);
        const ci = Math.floor(x / CELL) - ci0, cj = Math.floor(z / CELL) - cj0;
        hin[k] = ci >= 0 && cj >= 0 && ci < this.cw && cj < this.chh ? hm[cj * this.cw + ci] : 0;
      }
      if ((j & 7) === 7 && this.overBudget()) yield;
    }
    const gxA = this.gxA = new Float32Array(gw * gh), gzA = this.gzA = new Float32Array(gw * gh), sl = this.slope = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const a = hgt[j * gw + Math.max(0, i - 1)], b = hgt[j * gw + Math.min(gw - 1, i + 1)];
      const c = hgt[Math.max(0, j - 1) * gw + i], d = hgt[Math.min(gh - 1, j + 1) * gw + i];
      const sx2 = Math.max(1, Math.min(gw - 1, i + 1) - Math.max(0, i - 1)) * 4, sz2 = Math.max(1, Math.min(gh - 1, j + 1) - Math.max(0, j - 1)) * 4;
      gxA[k] = (b - a) / sx2; gzA[k] = (d - c) / sz2; sl[k] = Math.hypot(gxA[k], gzA[k]);
    }
    if (this.overBudget()) yield;
    // signed distance to the H edge
    const dOut = chamfer(hin, gw, gh, 4, 0); // for inside cells: distance to nearest outside
    if (this.overBudget()) yield;
    const inMask = new Uint8Array(gw * gh); for (let k = 0; k < gw * gh; k++) inMask[k] = hin[k] ? 1 : 0;
    const dIn = chamfer(inMask, gw, gh, 4, 1);
    const sd = this.sdfA = new Float32Array(gw * gh), ins = this.ins = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      sd[k] = hin[k] ? Math.min(dOut[k], 1e5) - 2 : -(Math.min(dIn[k], 1e5) - 2);
      const x = x0 + (i + 0.5) * 4, z = z0 + (j + 0.5) * 4;
      ins[k] = sd[k] + 11 * this.fbm(x / 90, z / 90) > 0 && hin[k] ? 1 : 0;
    }
    if (this.overBudget()) yield;
    // occupancy (2 m)
    const ow = this.ow = gw * 2, oh = this.oh = gh * 2, occ = this.occ = new Uint8Array(ow * oh);
    for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
      const k4 = (j >> 1) * gw + (i >> 1);
      occ[j * ow + i] = hin[k4] && wl[k4] <= hgt[k4] + 0.05 && sl[k4] <= 0.45 ? 0 : 255;
    }
    if (this.overBudget()) yield;
    // manual roads
    this.roads = []; this.roadNodes = [];
    if (D.Roads && D.Roads.segs) {
      const segs = Array.from(D.Roads.segs.values()).sort((a, b) => a.id - b.id);
      for (const seg of segs) {
        let S2; try { S2 = D.Roads.segSamples(seg); } catch (e) { continue; }
        if (!S2 || !S2.n) continue;
        const TT = (D.Roads.TYPES && D.Roads.TYPES[seg.type]) || { w: 5 };
        const pts = new Float32Array(S2.n * 2);
        for (let q = 0; q < S2.n; q++) { pts[q * 2] = S2.x[q]; pts[q * 2 + 1] = S2.z[q]; }
        const b = bboxOf(pts, TT.w / 2 + 2);
        if (b[2] < x0 - 60 || b[0] > x1 + 60 || b[3] < z0 - 60 || b[1] > z1 + 60) continue;
        const rank = seg.type === 'kingsroad' || seg.type === 'street' || seg.type === 'highway' || seg.type === 'avenue' ? 0 : seg.type === 'footpath' || seg.type === 'path' ? 2 : 1;
        const rd = { id: seg.id, type: seg.type, w: TT.w || 5, rank, pts, len: S2.len || polyLen(pts), bb: b };
        this.roads.push(rd);
        this.stampPolyline(pts, rd.w / 2 + 1, OCC.ROAD, 0);
      }
      const nodes = [];
      if (D.Roads.nodes) D.Roads.nodes.forEach(n => { if (n.x >= x0 && n.x <= x1 && n.z >= z0 && n.z <= z1) nodes.push({ id: n.id, x: n.x, z: n.z, deg: (n.segs || []).length }); });
      nodes.sort((a, b) => a.id - b.id); this.roadNodes = nodes;
    }
    // the player's own buildings are never built over (Living History I2)
    forManual(x0, z0, x1, z1, b => { this.stampRect(b.x, b.z, b.rot, b.w + 2, b.d + 2, OCC.BUILDING, 2); });
    // a replan keeps its great works (same key, same footprint): they are re-appended by finish()
    if (!this.prev && this.S.plan && this.S.plan.specials) for (const sp of this.S.plan.specials) if (sp.kind === 'greatwork') { this.stampRect(sp.x, sp.z, sp.rot || 0, sp.w, sp.d, OCC.BUILDING, 3); this._keepGW.push(sp); }
    if (this.overBudget()) yield;
    // neighbours
    const ids = Array.from(list.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      if (id === sid) continue;
      const O = list.get(id); if (!O || !O.plan) continue;
      const o = O.plan.origin || originOf(O);
      if (Math.hypot(o.x - this.centroid.x, o.z - this.centroid.z) > 3000 + Math.max(x1 - x0, z1 - z0) / 2) continue;
      this.neighbours.push({ sid: id, type: O.type, uid: O.uid, name: O.name, origin: o, style: O.plan.style, plan: O.plan });
    }
    // frozen elements (expand / infill)
    const P = this.prev;
    if (P) {
      this.origin = P.origin ? Object.assign({}, P.origin) : null; this.style = P.style; this.wallO = P.wallO;
      for (const e of P.lanes) { this.lanes.push(e); this._stampLane(e.pts, e.w); }
      for (const e of P.plots) { this.plots.push(e); this._stampPlot(e); }
      for (const e of P.specials) { this.specials.push(e); this._stampSpecial(e); }
      for (const e of P.areas) { this.areas.push(e); this.stampPoly(e.poly, AREA_CODE[e.cls] || OCC.FIELD); }
      this.o = P.n || 0;
      if (this.overBudget()) yield;
    }
  }
  _rollStyle() {
    if (this.style) return;
    const r = this.rng('style'), tw = this.tw, T = D.Terrain;
    const c = this.centroid;
    const hAbove = (this.h4(c.x, c.z) || 0) - (W.seaLevel || 0);
    let alpine = 0;
    if (W.biome) { const vi = D.vi(Math.round(c.x / CELL), Math.round(c.z / CELL)); alpine = W.biome[vi * 4 + 1] / 255; }
    let slopeSum = 0, sc = 0, wetNear = 0;
    const step = Math.max(1, Math.floor(this.cells.length / 300));
    for (let i = 0; i < this.cells.length; i += step) { const [x, z] = this.cellCenter(this.cells[i]); slopeSum += this.slopeAt(x, z); sc++; }
    const meanSlope = slopeSum / Math.max(1, sc);
    for (let a = 0; a < 12; a++) for (const rr of [100, 200, 300]) { const x = c.x + Math.cos(a * PI / 6) * rr, z = c.z + Math.sin(a * PI / 6) * rr; if (T.isWet(x, z)) wetNear++; }
    let region;
    if (hAbove > 250 || alpine > 0.5 || W.climate === 1) region = 2;
    else if (meanSlope > 0.09) region = 1;
    else if (hAbove < 30 && meanSlope < 0.04 && wetNear > 0) region = 3;
    else if (this.type === 5 || (tw.layout > 0.6 && tw.wealth > 0.6)) region = 4;
    else region = 0;
    // inherit from the nearest neighbour within 3 km (p .7)
    let nb = null, nd = 3000;
    for (const n of this.neighbours) { const d = Math.hypot(n.origin.x - c.x, n.origin.z - c.z); if (d < nd && n.style) { nd = d; nb = n; } }
    const inh = r();
    if (nb && inh < 0.7) region = nb.style.region;
    this.style = { region, gableBias: 0.2 + 0.6 * r(), churchStyle: Math.floor(r() * 4), roofPitch: 42 + 16 * r(), wanderMul: 0.7 + 0.7 * r(), frontMul: 0.85 + 0.35 * r() };
  }
  finish() {
    const c = this.centroid || { x: 0, z: 0 };
    // great works survive a replan with the same key (their record, scaffolding and progress stay attached)
    const gwid = e => e.kind === 'greatwork' && e.extra ? e.extra.wid | 0 : 0;
    for (const sp0 of this._keepGW) if (!this.specials.some(e => gwid(e) && gwid(e) === gwid(sp0))) {
      let sp = sp0;
      // (legacy: a kept work whose key a new element now uses gets its own key; Works tracks it by wid)
      if (this.specials.some(e => e.key === sp.key) || this.lanes.some(e => e.key === sp.key)) sp = Object.assign({}, sp, { key: this.uid + ':wk' + gwid(sp) + ':S0' });
      let cell = sp.cell; if (!(cell >= 0) || W.zone[cell * 4 + 1] !== this.sid) { cell = this.anchorCell(sp.x, sp.z); if (cell < 0) cell = cellK(sp.x, sp.z); }
      this.specials.push(Object.assign({}, sp, { o: this.o++, cell, ep: this.epoch }));
    }
    // phase anchors: every element remembers the plan size it was planned under, so later expands (which grow
    // P.n) do not shift its phase-upgrade orders (o2 / oS in decorate). Older elements get prev.n.
    const n = this.o, pn = this.prev ? (this.prev.n || 0) : 0;
    const anchor = arr => { for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (e.nE !== undefined) continue; if (e.o >= pn) e.nE = n; else arr[i] = Object.assign({}, e, { nE: pn }); } return arr; };
    // director expands keep the wall where it was (the new streets become a faubourg); player expands move it
    // (only a wall that exists: an unwalled place, or a plan too small for a wall, keeps planning its wallO normally)
    const wallO = this.prev && this.job.src === 'dir' && !this.job.rewall && this.prev.wallO >= 0 && this.tw.walls !== 'none' ? this.prev.wallO : this.wallO;
    const P = {
      v: 1, pv: PLAN_VER, uid: this.uid, type: this.type, style: this.style || { region: 0, gableBias: 0.5, churchStyle: 0, roofPitch: 50, wanderMul: 1, frontMul: 1 },
      origin: this.origin || { x: c.x, z: c.z, kind: 'none' },
      lanes: anchor(this.lanes), plots: anchor(this.plots), specials: anchor(this.specials), areas: anchor(this.areas),
      wallO, n
    };
    if (this._workFail) P.extra = { workFail: this._workFail };
    return P;
  }
  // ---- H mask ---------------------------------------------------------------------------------------
  _hmAt(x, z) { if (!this.hm) return 0; const ci = Math.floor(x / CELL) - this.ci0, cj = Math.floor(z / CELL) - this.cj0; return ci >= 0 && cj >= 0 && ci < this.cw && cj < this.chh ? this.hm[cj * this.cw + ci] : 0; }
  inH(x, z) { return this._hmAt(x, z) > 0; }
  isNew(x, z) { return this._hmAt(x, z) === 2; }
  cellOf(x, z) { return cellK(x, z); }
  cellCenter(k) { return [(k % N + 0.5) * CELL, (Math.floor(k / N) + 0.5) * CELL]; }
  anchorCell(x, z) {
    if (this.inH(x, z)) return cellK(x, z);
    let best = -1, bd = 1e18;
    for (let r = 1; r <= 3 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const xx = x + di * CELL, zz = z + dj * CELL; if (!this.inH(xx, zz)) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = cellK(xx, zz); }
    }
    return best;
  }
  forCells(fn) { for (let i = 0; i < this.cells.length; i++) { const k = this.cells[i]; fn(k, (k % N + 0.5) * CELL, (Math.floor(k / N) + 0.5) * CELL); } }
  // ---- terrain ----------------------------------------------------------------------------------------
  _gi(x, z) { const i = clamp(Math.floor((x - this.x0) / 4), 0, this.gw - 1), j = clamp(Math.floor((z - this.z0) / 4), 0, this.gh - 1); return j * this.gw + i; }
  _inWin(x, z) { return x >= this.x0 && z >= this.z0 && x < this.x1 && z < this.z1; }
  hAt(x, z) { return D.Terrain.hAt(x, z); }
  waterAt(x, z) { return D.Terrain.waterAt(x, z); }
  h4(x, z) {
    if (!this.hgt) return D.Terrain.hAt(x, z);
    if (!this._inWin(x, z)) return D.Terrain.hAt(x, z);
    const fx = clamp((x - this.x0) / 4 - 0.5, 0, this.gw - 1.001), fz = clamp((z - this.z0) / 4 - 0.5, 0, this.gh - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = this.gw, H = this.hgt, k = j * w + i;
    const i1 = Math.min(i + 1, this.gw - 1) - i, j1 = (Math.min(j + 1, this.gh - 1) - j) * w;
    return (H[k] * (1 - u) + H[k + i1] * u) * (1 - v) + (H[k + j1] * (1 - u) + H[k + j1 + i1] * u) * v;
  }
  slopeAt(x, z) { if (!this.slope || !this._inWin(x, z)) { const T = D.Terrain; const gx = (T.hAt(x + 4, z) - T.hAt(x - 4, z)) / 8, gz = (T.hAt(x, z + 4) - T.hAt(x, z - 4)) / 8; return Math.hypot(gx, gz); } return this.slope[this._gi(x, z)]; }
  gradAt(x, z) { if (!this.gxA || !this._inWin(x, z)) { const T = D.Terrain; return [(T.hAt(x + 4, z) - T.hAt(x - 4, z)) / 8, (T.hAt(x, z + 4) - T.hAt(x, z - 4)) / 8]; } const k = this._gi(x, z); return [this.gxA[k], this.gzA[k]]; }
  isWet(x, z) { if (!this.wl || !this._inWin(x, z)) return D.Terrain.isWet(x, z); const k = this._gi(x, z); return this.wl[k] > this.hgt[k] + 0.05; }
  depthAt(x, z) { if (!this.wl || !this._inWin(x, z)) return Math.max(0, D.Terrain.waterAt(x, z) - D.Terrain.hAt(x, z)); const k = this._gi(x, z); return Math.max(0, this.wl[k] - this.hgt[k]); }
  sdf(x, z) {
    if (!this.sdfA) return -1e3;
    if (!this._inWin(x, z)) return -Math.max(Math.abs(x - clamp(x, this.x0, this.x1)), Math.abs(z - clamp(z, this.z0, this.z1))) - 80;
    const fx = clamp((x - this.x0) / 4 - 0.5, 0, this.gw - 1.001), fz = clamp((z - this.z0) / 4 - 0.5, 0, this.gh - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = this.gw, A = this.sdfA, k = j * w + i;
    const i1 = Math.min(i + 1, this.gw - 1) - i, j1 = (Math.min(j + 1, this.gh - 1) - j) * w;
    return (A[k] * (1 - u) + A[k + i1] * u) * (1 - v) + (A[k + j1] * (1 - u) + A[k + j1 + i1] * u) * v;
  }
  inside(x, z) { return !!this.ins && this._inWin(x, z) && this.ins[this._gi(x, z)] === 1; }
  prominence(x, z, r) {
    r = r || 60; let s = 0;
    for (let a = 0; a < 8; a++) s += this.h4(x + Math.cos(a * PI / 4) * r, z + Math.sin(a * PI / 4) * r);
    return this.h4(x, z) - s / 8;
  }
  spread(x, z, rot, w, d) {
    const T = D.Terrain, P = rectPoly(x, z, rot, w, d);
    let mn = T.hAt(x, z), mx = mn;
    for (let i = 0; i < 4; i++) { const y = T.hAt(P[i * 2], P[i * 2 + 1]); if (y < mn) mn = y; if (y > mx) mx = y; }
    return mx - mn;
  }
  waterDist(x, z) {
    if (!this.wl) return 2000;
    if (!this._wd) {
      const n = this.gw * this.gh, wet = new Uint8Array(n);
      for (let k = 0; k < n; k++) wet[k] = this.wl[k] > this.hgt[k] + 0.05 ? 1 : 0;
      this._wd = chamfer(wet, this.gw, this.gh, 4, 1);
    }
    return this._inWin(x, z) ? Math.min(2000, this._wd[this._gi(x, z)]) : 2000;
  }
  nearestRoad(x, z, maxD) {
    let best = null, bd = maxD || 100;
    for (const r of this.roads) {
      const b = r.bb; if (x < b[0] - bd || x > b[2] + bd || z < b[1] - bd || z > b[3] + bd) continue;
      const p = r.pts, n = p.length >> 1;
      for (let i = 0; i < n - 1; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], dx = p[i * 2 + 2] - ax, dz = p[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = ax + dx * t, ez = az + dz * t, d = Math.hypot(ex - x, ez - z);
        if (d < bd) { bd = d; const L = Math.sqrt(L2); best = { d, x: ex, z: ez, tx: dx / L, tz: dz / L, road: r }; }
      }
    }
    return best;
  }
  // ---- occupancy ------------------------------------------------------------------------------------
  _oi(x, z) { const i = Math.floor((x - this.x0) / 2), j = Math.floor((z - this.z0) / 2); return i < 0 || j < 0 || i >= this.ow || j >= this.oh ? -1 : j * this.ow + i; }
  occAt(x, z) { if (!this.occ) return 255; const k = this._oi(x, z); return k < 0 ? 255 : this.occ[k]; }
  _rect(x, z, rot, w, d, pad, fn) {
    const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2 + (pad || 0), hd = d / 2 + (pad || 0);
    if (hw <= 0 || hd <= 0) return fn(this._oi(x, z)) !== false;
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const i0 = Math.floor((x - ex - this.x0) / 2), i1 = Math.floor((x + ex - this.x0) / 2), j0 = Math.floor((z - ez - this.z0) / 2), j1 = Math.floor((z + ez - this.z0) / 2);
    let any = false;
    for (let j = j0; j <= j1; j++) {
      const cz = this.z0 + (j + 0.5) * 2 - z;
      for (let i = i0; i <= i1; i++) {
        const cx = this.x0 + (i + 0.5) * 2 - x;
        const lx = cx * c - cz * s, lz = cx * s + cz * c;
        if (lx < -hw || lx > hw || lz < -hd || lz > hd) continue;
        any = true;
        const k = i < 0 || j < 0 || i >= this.ow || j >= this.oh ? -1 : j * this.ow + i;
        if (fn(k) === false) return false;
      }
    }
    if (!any) return fn(this._oi(x, z)) !== false;
    return true;
  }
  _okCell(k, allow) { if (k < 0) return false; const c = this.occ[k]; return c !== 255 && ((allow >> c) & 1) === 1; }
  testRect(x, z, rot, w, d, pad, allow) { if (!this.occ) return false; allow = allow === undefined ? ALLOW.FREE : allow; return this._rect(x, z, rot, w, d, pad || 0, k => this._okCell(k, allow)); }
  stampRect(x, z, rot, w, d, code, pad) { if (!this.occ) return; const O = this.occ; this._rect(x, z, rot, w, d, pad || 0, k => { if (k >= 0 && O[k] !== 255) O[k] = code; }); }
  _disc(x, z, r, fn) {
    const i0 = Math.floor((x - r - this.x0) / 2), i1 = Math.floor((x + r - this.x0) / 2), j0 = Math.floor((z - r - this.z0) / 2), j1 = Math.floor((z + r - this.z0) / 2), r2 = r * r;
    for (let j = j0; j <= j1; j++) { const dz = this.z0 + (j + 0.5) * 2 - z; for (let i = i0; i <= i1; i++) { const dx = this.x0 + (i + 0.5) * 2 - x; if (dx * dx + dz * dz > r2) continue; const k = i < 0 || j < 0 || i >= this.ow || j >= this.oh ? -1 : j * this.ow + i; if (fn(k) === false) return false; } }
    return true;
  }
  testDisc(x, z, r, allow) { if (!this.occ) return false; allow = allow === undefined ? ALLOW.FREE : allow; return this._disc(x, z, r, k => this._okCell(k, allow)); }
  stampDisc(x, z, r, code) { if (!this.occ) return; const O = this.occ; this._disc(x, z, r, k => { if (k >= 0 && O[k] !== 255) O[k] = code; }); }
  _poly(poly, fn) {
    poly = toF32(poly); const b = bboxOf(poly, 0), xs = [];
    const j0 = Math.floor((b[1] - this.z0) / 2), j1 = Math.floor((b[3] - this.z0) / 2);
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * 2; scanX(poly, z, xs);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.ceil((xs[q] - this.x0) / 2 - 0.5), i1 = Math.floor((xs[q + 1] - this.x0) / 2 - 0.5);
        for (let i = i0; i <= i1; i++) { const k = i < 0 || j < 0 || i >= this.ow || j >= this.oh ? -1 : j * this.ow + i; if (fn(k) === false) return false; }
      }
    }
    return true;
  }
  testPoly(poly, allow) { if (!this.occ) return false; allow = allow === undefined ? ALLOW.FREE : allow; return this._poly(poly, k => this._okCell(k, allow)); }
  stampPoly(poly, code) { if (!this.occ) return; const O = this.occ; this._poly(poly, k => { if (k >= 0 && O[k] !== 255) O[k] = code; }); }
  _polyline(pts, hw, fn) {
    pts = toF32(pts); const n = pts.length >> 1;
    for (let s = 0; s < Math.max(1, n - 1); s++) {
      const ax = pts[s * 2], az = pts[s * 2 + 1], bx = n > 1 ? pts[s * 2 + 2] : ax, bz = n > 1 ? pts[s * 2 + 3] : az;
      const i0 = Math.floor((Math.min(ax, bx) - hw - this.x0) / 2), i1 = Math.floor((Math.max(ax, bx) + hw - this.x0) / 2);
      const j0 = Math.floor((Math.min(az, bz) - hw - this.z0) / 2), j1 = Math.floor((Math.max(az, bz) + hw - this.z0) / 2);
      const h2 = hw * hw;
      for (let j = j0; j <= j1; j++) { const z = this.z0 + (j + 0.5) * 2; for (let i = i0; i <= i1; i++) { const x = this.x0 + (i + 0.5) * 2; if (segDist2(x, z, ax, az, bx, bz) > h2) continue; const k = i < 0 || j < 0 || i >= this.ow || j >= this.oh ? -1 : j * this.ow + i; if (fn(k) === false) return false; } }
    }
    return true;
  }
  testPolyline(pts, hw, allow) { if (!this.occ) return false; allow = allow === undefined ? ALLOW.FVL : allow; return this._polyline(pts, hw, k => this._okCell(k, allow)); }
  stampPolyline(pts, hw, code, mode) {
    if (!this.occ) return; const O = this.occ; mode = mode || 0;
    this._polyline(pts, hw, k => {
      if (k < 0) return; const c = O[k]; if (c === 255) return;
      if (mode === 1 && c !== 0) return;
      if (mode === 2 && c !== 0 && c !== 2 && c !== 8) return;
      O[k] = code;
    });
  }
  fits(x, z, rot, w, d, opts) {
    opts = opts || {};
    const pad = opts.pad === undefined ? 0.3 : opts.pad, allow = opts.allow === undefined ? ALLOW.FV : opts.allow;
    const maxSpread = opts.maxSpread === undefined ? Math.max(3, 0.35 * Math.min(w, d)) : opts.maxSpread;
    const P = rectPoly(x, z, rot, w, d);
    for (let i = 0; i < 5; i++) {
      const px = i < 4 ? P[i * 2] : x, pz = i < 4 ? P[i * 2 + 1] : z;
      if (opts.inside !== false && !this.inside(px, pz) && !(opts.inside === 'H' && this.inH(px, pz))) return false;
      if (this.isWet(px, pz)) return false;
    }
    if (!this.testRect(x, z, rot, w, d, pad, allow)) return false;
    return this.spread(x, z, rot, w, d) <= maxSpread;
  }
  // ---- contours / masks / paths -------------------------------------------------------------------
  traceMask(mask, w, h, ox, oz, step) { return traceMaskLoops(mask, w, h, ox, oz, step); }
  contours(fn, level, step, x0, z0, x1, z1) {
    step = step || 4; x0 = x0 === undefined ? this.x0 : x0; z0 = z0 === undefined ? this.z0 : z0; x1 = x1 === undefined ? this.x1 : x1; z1 = z1 === undefined ? this.z1 : z1;
    const w = Math.max(1, Math.round((x1 - x0) / step)), h = Math.max(1, Math.round((z1 - z0) / step));
    const v = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) v[j * w + i] = fn(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
    return march(v, w, h, x0, z0, step, level || 0, 'clamp', true);
  }
  shoreline() {
    if (!this.wl) return [];
    const n = this.gw * this.gh, v = new Float32Array(n);
    for (let k = 0; k < n; k++) v[k] = this.wl[k] - this.hgt[k];
    return march(v, this.gw, this.gh, this.x0, this.z0, 4, 0, 'clamp', true);
  }
  astar(ax, az, opts) {
    opts = opts || {};
    const s = opts.step || 8, w = Math.max(1, Math.ceil((this.x1 - this.x0) / s)), h = Math.max(1, Math.ceil((this.z1 - this.z0) / s)), n = w * h;
    if (!this._as || this._as.n !== n || this._as.s !== s) this._as = { n, s, g: new Float32Array(n), p: new Int32Array(n), gen: new Int32Array(n), done: new Int32Array(n), cur: 0 };
    const A = this._as; A.cur++;
    const gen = A.cur, G = A.g, Pp = A.p, GEN = A.gen, DONE = A.done;
    const idx = (x, z) => { const i = Math.floor((x - this.x0) / s), j = Math.floor((z - this.z0) / s); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; };
    const cx = k => this.x0 + (k % w + 0.5) * s, cz = k => this.z0 + (Math.floor(k / w) + 0.5) * s;
    const start = idx(ax, az); if (start < 0) return null;
    const goal = opts.goal, target = opts.target || (goal ? ((x, z) => Math.hypot(x - goal[0], z - goal[1]) < s) : null);
    if (!target) return null;
    const hfn = goal ? k => Math.hypot(cx(k) - goal[0], cz(k) - goal[1]) : () => 0;
    const pq = new PQ(1024);
    G[start] = 0; GEN[start] = gen; Pp[start] = -1; pq.push(hfn(start), start);
    const maxNodes = opts.maxNodes || 250000, extra = opts.cost;
    let pops = 0, found = -1;
    while (pq.size && pops < maxNodes) {
      const k = pq.pop(); if (DONE[k] === gen) continue; DONE[k] = gen; pops++;
      const x = cx(k), z = cz(k);
      if (k !== start && target(x, z)) { found = k; break; }
      const i = k % w, j = Math.floor(k / w);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni; if (DONE[nk] === gen) continue;
        const nx = cx(nk), nz = cz(nk), len = (di && dj ? Math.SQRT2 : 1) * s;
        const sl = this.slopeAt(nx, nz), oc = this.occAt(nx, nz), wet = this.isWet(nx, nz) ? 1 : 0;
        let c = 1 + 25 * sl * sl + ((oc === OCC.BUILDING || oc === OCC.YARD) ? 8 : 0) + 3 * wet;
        if (extra) { const e = extra(nx, nz); if (!(e < Infinity)) continue; c += e; }
        const ng = G[k] + len * c;
        if (GEN[nk] === gen && G[nk] <= ng) continue;
        GEN[nk] = gen; G[nk] = ng; Pp[nk] = k; pq.push(ng + hfn(nk), nk);
      }
    }
    if (found < 0) return null;
    const out = []; let k = found;
    while (k >= 0) { out.push(cz(k), cx(k)); k = k === start ? -1 : Pp[k]; }
    out.reverse(); // now x,z pairs from start to target
    out[0] = ax; out[1] = az;
    return Float32Array.from(out);
  }
  // ---- emitters -----------------------------------------------------------------------------------
  _anchorPts(pts) {
    const n = pts.length >> 1, m = n >> 1;
    let k = this.anchorCell(pts[m * 2], pts[m * 2 + 1]);
    for (let i = 0; k < 0 && i < n; i++) k = this.anchorCell(pts[i * 2], pts[i * 2 + 1]);
    if (k < 0) k = this._lastAnchor >= 0 ? this._lastAnchor : (this.cells.length ? this.cells[0] : 0);
    this._lastAnchor = k;
    return k;
  }
  _stampLane(pts, w) { this.stampPolyline(pts, w / 2, OCC.LANE, 2); this.stampPolyline(pts, w / 2 + 1.5, OCC.VERGE, 1); }
  _stampPlot(e) {
    this.stampRect(e.x, e.z, e.rot, e.w, e.d, OCC.BUILDING, 0);
    if (e.yardD > 0.5) { const s = Math.sin(e.rot), c = Math.cos(e.rot), off = e.d / 2 + e.yardD / 2; this.stampRect(e.x + s * off, e.z + c * off, e.rot, e.frontW || e.w, e.yardD, OCC.YARD, 0); }
  }
  _stampSpecial(e) {
    if (GENERIC_SPECIAL[e.kind]) {
      const ex = e.extra || {};
      if (e.kind === 'curtain' || e.kind === 'precinct') { const L = toF32(ex.loop || []); if (L.length > 4) this.stampPolyline(Float32Array.from(Array.from(L).concat([L[0], L[1]])), e.kind === 'curtain' ? 4 : 2, OCC.WALL, 0); }
      return;
    }
    this.stampRect(e.x, e.z, e.rot || 0, e.w || 6, e.d || 6, e.code !== undefined ? e.code : OCC.BUILDING, 0.5);
  }
  newLaneKey() { return this.prefix + 'L' + (this.cnt.L++); }
  laneStep(sp) {
    const pts = toF32(sp.pts);
    const e = { key: sp.lane + '.' + (sp.i | 0), rank: sp.rank === undefined ? 1 : sp.rank, w: sp.w || 4.5, surf: sp.surf || 1, pts, o: this.o++, ep: this.epoch, cell: this._anchorPts(pts) };
    if (sp.tip) e.tip = 1;
    this.lanes.push(e);
    return e.key;
  }
  lane(sp) {
    let pts = toF32(sp.pts); if (pts.length < 4) return null;
    const w = sp.w || 4.5, rank = sp.rank === undefined ? 1 : sp.rank;
    pts = resample(pts, 6, false);
    const key = this.newLaneKey(), n = pts.length >> 1;
    let i = 0;
    for (let a = 0; a < n - 1; a += 4) {
      const b = Math.min(n - 1, a + 4);
      this.laneStep({ lane: key, i: i++, pts: pts.slice(a * 2, b * 2 + 2), rank, w, surf: sp.surf || 1, tip: sp.tip && b === n - 1 });
    }
    if (!sp.noStamp) this._stampLane(pts, w);
    return key;
  }
  plot(sp) {
    const e = {
      key: this.prefix + 'P' + (this.cnt.P++), x: sp.x, z: sp.z, rot: sp.rot || 0, w: sp.w, d: sp.d, yardD: sp.yardD || 0, frontW: sp.frontW || sp.w,
      rank: sp.rank || 0, netD: sp.netD || 0, wq: clamp(sp.wq || 0, -1, 1), role: sp.role || 'house', corner: sp.corner ? 1 : 0, town: sp.town ? 1 : 0, mkt: sp.mkt ? 1 : 0,
      cell: this.anchorCell(sp.x, sp.z), o: this.o++, ep: this.epoch
    };
    if (e.cell < 0) e.cell = cellK(sp.x, sp.z);
    this.plots.push(e);
    if (!sp.noStamp) this._stampPlot(e);
    return e.key;
  }
  special(sp) {
    const e = { key: sp.key || this.prefix + 'S' + (this.cnt.S++), kind: sp.kind, x: sp.x, z: sp.z, rot: sp.rot || 0, w: sp.w || 0, d: sp.d || 0, h: sp.h || 0, var: sp.var || 0, extra: sp.extra || null, o: this.o++, ep: this.epoch };
    if (GENERIC_SPECIAL[sp.kind] && sp.extra) {
      const L = toF32(sp.extra.loop || sp.extra.pts || []);
      if ((e.x === undefined || e.x === 0) && L.length >= 2) { const c = sp.kind === 'pierline' ? [L[0], L[1]] : polyCentroid(L); e.x = c[0]; e.z = c[1]; }
    }
    e.cell = this.anchorCell(e.x, e.z); if (e.cell < 0) e.cell = cellK(e.x, e.z);
    if (sp.code !== undefined) e.code = sp.code;
    this.specials.push(e);
    if (!sp.noStamp && !GENERIC_SPECIAL[sp.kind]) this._stampSpecial(e);
    return e.key;
  }
  area(sp) {
    const poly = toF32(sp.poly); if (poly.length < 6) return null;
    const c = polyCentroid(poly);
    let cell = this.anchorCell(c[0], c[1]);
    for (let i = 0; cell < 0 && i < poly.length; i += 2) cell = this.anchorCell(poly[i], poly[i + 1]);
    if (cell < 0) cell = cellK(c[0], c[1]);
    const e = { key: this.prefix + 'A' + (this.cnt.A++), cls: sp.cls, poly, ang: sp.ang || 0, rf: sp.rf ? 1 : 0, cell, o: this.o++, ep: this.epoch };
    if (sp.extra) e.extra = sp.extra;
    if (sp.pk) e.pk = sp.pk;
    this.areas.push(e);
    if (!sp.noStamp) this.stampPoly(poly, AREA_CODE[sp.cls] || OCC.FIELD);
    return e.key;
  }
}
Town.Ctx = Ctx;

// =====================================================================================================
// VILLAGE / TOWN planner (A-roots, §5.5)
// =====================================================================================================
function* planVillage(ctx) {
  if (ctx.empty) return;
  const tw = ctx.tw, dens = tw.dens, densP = 0.6 + 0.8 * dens, layout = tw.layout, style = ctx.style;
  const planned = layout > 0.6, prev = ctx.prev, infill = ctx.kind === 'infill', expand = ctx.kind === 'expand';
  const plotCap = Math.max(6, Math.min(3000, Math.round(ctx.areaHa * (8 + 28 * dens))));
  const maxG = [0.10, 0.14, 0.20, 0.22];
  const WANDER = (38 * Math.pow(1 - layout, 1.5) + 2) * DEG * style.wanderMul;
  const turnW = lerp(0.6, 3.0, layout);
  const townSized = ctx.areaHa > 25 && dens > 0.55;
  const MAX_AGENTS = 40 + Math.round(plotCap / 4), MAX_STEPS = 6000 + plotCap * 12;
  const lanePts = new PtHash(12), juncs = new PtHash(16);
  const lins = [{ parent: -1, anc: new Set() }];   // lineage 0 = frozen lanes / manual roads
  const agents = [], buds = [], heap = new PQ(1024), wants = [], churches = [];
  let houses = 0, budId = 0, agentsMade = 0, totalSteps = 0, hamlets = 0;
  const ms = {};
  let origin = null, market = null, gridTh = 0, R90 = 200, churchRetry = 0;

  // ---- frozen state (expand / infill) ----------------------------------------------------------------
  if (prev) {
    origin = Object.assign({}, prev.origin);
    for (const p of prev.plots) if (p.role === 'house') houses++;
    for (const s of prev.specials) { const x = s.extra; if (x && x.ms) { ms[x.ms] = 1; if (x.ms === 'church') { churches.push({ x: s.x, z: s.z }); ms[x.tag || 'church'] = 1; } } }
    if (origin.kind === 'market' && origin.ax !== undefined) market = { x: origin.x, z: origin.z, ax: origin.ax, az: origin.az, L: origin.L, Wd: origin.Wd };
    gridTh = origin.grid || 0;
    ms.hall40 = ms.hall40 || houses >= 40 ? 1 : 0; ms.tavern = ms.tavern || houses >= 15 ? 1 : 0; ms.smithy = ms.smithy || houses >= 20 ? 1 : 0;
    ms.mill = ms.mill || houses >= 25 ? 1 : 0; ms.guild = ms.guild || houses >= 70 ? 1 : 0; ms.church = ms.church || (houses >= 8 && churches.length) ? 1 : 0;
    // frozen lane points
    const groups = new Map();
    for (const L of prev.lanes) { const base = L.key.slice(0, L.key.lastIndexOf('.')); let g = groups.get(base); if (!g) groups.set(base, g = []); g.push(L); }
    const gkeys = Array.from(groups.keys()).sort();
    for (const gk of gkeys) {
      const steps = groups.get(gk).sort((a, b) => stepIdx(a.key) - stepIdx(b.key));
      for (const L of steps) {
        const p = L.pts, n = p.length >> 1;
        for (let i = 1; i < n; i++) {
          const dx = p[i * 2] - p[i * 2 - 2], dz = p[i * 2 + 1] - p[i * 2 - 1], l = Math.hypot(dx, dz) || 1;
          lanePts.add({ x: p[i * 2], z: p[i * 2 + 1], lin: 0, tx: dx / l, tz: dz / l, nd: Math.hypot(p[i * 2] - origin.x, p[i * 2 + 1] - origin.z) * 1.15, rank: L.rank, w: L.w, lane: gk, frozen: 1 });
        }
      }
    }
    yield* ctx.yieldIfOverBudget();
  }
  function stepIdx(k) { return +k.slice(k.lastIndexOf('.') + 1) || 0; }

  // ---- seed site -------------------------------------------------------------------------------------
  if (!origin) {
    let ox = ctx.centroid.x, oz = ctx.centroid.z;
    if (ctx.S.pin) { ox = ctx.S.pin[0]; oz = ctx.S.pin[1]; }
    else {
      // road distance field (4 m) for the seed score
      let maxSdf = 0;
      for (let i = 0; i < ctx.cells.length; i++) { const [x, z] = ctx.cellCenter(ctx.cells[i]); const s = ctx.sdf(x, z); if (s > maxSdf) maxSdf = s; }
      const thr = Math.min(30, maxSdf * 0.6);
      const r = ctx.rng('seed');
      let best = -1e9;
      for (let i = 0; i < ctx.cells.length; i++) {
        const [x, z] = ctx.cellCenter(ctx.cells[i]);
        const s = ctx.sdf(x, z), rr = r();
        if (s < thr || ctx.isWet(x, z) || ctx.occAt(x, z) === 255) continue;
        const sl = ctx.slopeAt(x, z);
        let rj = 0;
        for (const nd of ctx.roadNodes) if (nd.deg >= 3 && Math.abs(nd.x - x) < 40 && Math.abs(nd.z - z) < 40 && Math.hypot(nd.x - x, nd.z - z) < 40) { rj = 1; break; }
        if (!rj && ctx.roads.length) { const nr = ctx.nearestRoad(x, z, 120); if (nr) rj = nr.d <= 40 ? 0.6 : 0.3; }
        const wd = ctx.waterDist(x, z);
        const wn = wd >= 30 && wd <= 160 && ctx.h4(x, z) - W.seaLevel >= 2.5 ? 1 : 0;
        const rise = ctx.prominence(x, z, 60);
        const sc = 2 * (1 - clamp(sl / 0.18, 0, 1)) + 1.6 * rj + wn + 0.8 * s / Math.max(1, maxSdf) + 0.5 * clamp(rise / 8, 0, 1) + 0.15 * rr;
        if (sc > best) { best = sc; ox = x; oz = z; }
        if ((i & 31) === 31) yield* ctx.yieldIfOverBudget();
      }
    }
    origin = { x: ox, z: oz, kind: 'well' };
  }
  // R90: 90th percentile of the distance from the origin to the H cells
  {
    const ds = new Float32Array(ctx.cells.length);
    for (let i = 0; i < ctx.cells.length; i++) { const [x, z] = ctx.cellCenter(ctx.cells[i]); ds[i] = Math.hypot(x - origin.x, z - origin.z); }
    ds.sort(); R90 = Math.max(60, ds[Math.floor(ds.length * 0.9)] || 60);
  }

  // ---- rays through `inside` ---------------------------------------------------------------------------
  const rays = new Float32Array(32);
  for (let a = 0; a < 32; a++) {
    const th = a / 32 * TAU, dx = Math.cos(th), dz = Math.sin(th); let L = 0;
    for (let d = 8; d <= 1600; d += 8) { const x = origin.x + dx * d, z = origin.z + dz * d; if (!ctx.inside(x, z) || ctx.isWet(x, z)) break; L = d; }
    rays[a] = L;
  }

  // ---- helpers ---------------------------------------------------------------------------------------
  const lensHalf = u => market ? market.Wd / 2 * Math.pow(Math.max(0, 1 - (2 * u / market.L) * (2 * u / market.L)), 0.7) : 0;
  function marketLW(x, z, w) {
    if (!market) return w / 2 + 1.2;
    const dx = x - market.x, dz = z - market.z, u = dx * market.ax + dz * market.az, v = -dx * market.az + dz * market.ax;
    if (Math.abs(u) < market.L / 2 && Math.abs(v) < market.Wd / 2 + 2) return Math.max(w / 2 + 1.2, lensHalf(u) + 0.8 - Math.abs(v) * 0);
    return w / 2 + 1.2;
  }
  const snapGrid = th => gridTh + Math.round((th - gridTh) / (PI / 2)) * (PI / 2);
  const gridDev = th => { const d = D.angDiff(snapGrid(th), th); return Math.abs(d) / (45 * DEG); };
  function nearSquare(x, z, r) {
    for (let a = 0; a < 6; a++) { const c = ctx.occAt(x + Math.cos(a * PI / 3) * r, z + Math.sin(a * PI / 3) * r); if (c === OCC.SQUARE || c === OCC.PRECINCT) return true; }
    return false;
  }
  function pushBuds(p) {
    let nearJ = false; juncs.query(p.x, p.z, 7, () => { nearJ = true; return false; });
    if (nearJ) return;
    const lw = marketLW(p.x, p.z, p.w);
    for (const side of [1, -1]) {
      const id = budId++, r = ctx.rng('bk', id);
      const b = { id, x: p.x, z: p.z, tx: p.tx, tz: p.tz, side, rank: p.rank, w: p.w, lw, nd: p.nd, lin: p.lin, lane: p.lane, skip: 0 };
      const adj = nearSquare(p.x - p.tz * side * 14, p.z + p.tx * side * 14, 12) ? 1 : 0;
      b.key = p.nd + 40 * Math.min(2, p.rank) + 20 * r() - 30 * adj;
      buds.push(b); heap.push(b.key, id);
    }
  }
  function addJunction(x, z, rankA, rankB, dirs, nd) {
    juncs.add({ x, z });
    const r = ctx.rng('jn', Math.round(x), Math.round(z));
    if (rankA <= 1 && rankB <= 1 && dirs && dirs.length >= 3 && r() < 0.25 * tw.squares) triSquare(x, z, dirs, 'square', r);
    else if (dirs && dirs.length >= 3 && nd > 0.5 * R90 && r() < 0.2 * tw.greens) triSquare(x, z, dirs, 3, r);
  }
  function triSquare(x, z, dirs, cls, r) {
    // the fork with the smallest angle between two arms becomes a triangular place
    let bi = -1, bj = -1, ba = 1e9;
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) { const a = Math.abs(D.angDiff(dirs[i], dirs[j])); if (a > 25 * DEG && a < ba) { ba = a; bi = i; bj = j; } }
    if (bi < 0) return false;
    const area = 400 + 500 * r(), s = clamp(Math.sqrt(2 * area / Math.max(0.3, Math.sin(ba))), 15, 60);
    const poly = new Float32Array([x, z, x + Math.cos(dirs[bi]) * s, z + Math.sin(dirs[bi]) * s, x + Math.cos(dirs[bj]) * s, z + Math.sin(dirs[bj]) * s]);
    if (!ctx.testPoly(poly, ALLOW.FVL)) return false;
    for (let i = 0; i < 3; i++) if (!ctx.inside(poly[i * 2], poly[i * 2 + 1])) return false;
    ctx.area({ cls, poly });
    return true;
  }
  function newAgent(x, z, th, rank, energy, parentLin, goal, nd) {
    const lin = lins.length;
    const anc = parentLin >= 0 && lins[parentLin] ? new Set(lins[parentLin].anc) : new Set();
    if (parentLin >= 0) anc.add(parentLin);
    lins.push({ parent: parentLin, anc });
    const r = ctx.rng('agent', lin, ctx.epoch);
    const w = rank === 0 ? 6 + 2 * dens + (townSized ? 2 : 0) : rank === 1 ? 4 + r() : 2.5 + r() * 0.5;
    const a = {
      lin, lane: ctx.newLaneKey(), si: 0, rank, w, x, z, sx: x, sz: z, th, th0: th, e: energy, e0: energy, s: 0, nd: nd || 0,
      buf: [x, z], pending: [], sinceBr: 0, brSpace: planned ? 48 + 26 * (1 - dens) : 16 + r() * 26, brSide: r() < 0.5 ? 1 : -1,
      goal: goal || null, goalW: goal ? 2.0 : 0.6, goalContinue: false, wantsLoop: r() > 0.25, r, bridges: 0, alive: true
    };
    const p0 = { x, z, lin, tx: Math.cos(th), tz: Math.sin(th), nd: a.nd, rank, w, lane: a.lane };
    lanePts.add(p0);
    agents.push(a); agentsMade++;
    return a;
  }
  function flushStep(a, tip) {
    if (a.buf.length >= 4) {
      ctx.laneStep({ lane: a.lane, i: a.si++, pts: a.buf, rank: a.rank, w: a.w, surf: 1, tip });
      for (const p of a.pending) pushBuds(p);
    }
    a.pending = [];
    a.buf = [a.x, a.z];
  }
  function layPoint(a, x, z) {
    const px = a.x, pz = a.z, L = Math.hypot(x - px, z - pz);
    if (L < 0.5) return;
    const seg = [px, pz, x, z];
    ctx.stampPolyline(seg, a.w / 2, OCC.LANE, 2);
    ctx.stampPolyline(seg, a.w / 2 + 1.5, OCC.VERGE, 1);
    a.x = x; a.z = z; a.nd += L;
    a.buf.push(x, z);
    const p = { x, z, lin: a.lin, tx: (x - px) / L, tz: (z - pz) / L, nd: a.nd, rank: a.rank, w: a.w, lane: a.lane };
    lanePts.add(p); a.pending.push(p);
    if (a.buf.length >= 10) flushStep(a, false);
  }
  function die(a, tip) { flushStep(a, tip); a.alive = false; return false; }
  function findLoopGoal(a) {
    let best = null, bd = 1e18;
    const ct = Math.cos(a.th), st = Math.sin(a.th);
    lanePts.query(a.x, a.z, 130, (p, d2) => {
      if (d2 < 1600 || p.lin === a.lin) return;
      if (lins[a.lin].anc.has(p.lin) && d2 < 3600) return;
      const L = Math.sqrt(d2); if (((p.x - a.x) * ct + (p.z - a.z) * st) / L < -0.2) return;
      if (d2 < bd || (d2 === bd && best && (p.x < best.x))) { bd = d2; best = p; }
    });
    if (best) { a.goal = [best.x, best.z]; a.goalW = 1.6; a.goalLin = best.lin; a.e = Math.max(a.e, Math.sqrt(bd) * 1.5 + 12); }
    a.wantsLoop = false;
  }
  function crossWater(a) { // rank-0 lanes bridge water up to ~30 m wide
    const dx = Math.cos(a.th), dz = Math.sin(a.th);
    if (!ctx.isWet(a.x + dx * 6, a.z + dz * 6)) return false;
    let far = 0;
    for (let d = 6; d <= 36; d += 3) { const x = a.x + dx * d, z = a.z + dz * d; if (!ctx.isWet(x, z)) { far = d; break; } }
    if (!far || far > 33) return false;
    const land = far + 4, ex = a.x + dx * land, ez = a.z + dz * land;
    if (!ctx.inside(ex, ez) || ctx.occAt(ex, ez) === OCC.BUILDING || ctx.occAt(ex, ez) === OCC.YARD) return false;
    const x0 = a.x, z0 = a.z;
    ctx.special({ kind: 'bridge', x: x0 + dx * land / 2, z: z0 + dz * land / 2, rot: Math.atan2(-dz, dx), w: land + 4, d: a.w + 1.2, noStamp: true, extra: { bridge: 1 } });
    const steps = Math.max(1, Math.ceil(land / 6));
    for (let i = 1; i <= steps; i++) layPoint(a, x0 + dx * land * i / steps, z0 + dz * land * i / steps);
    a.bridges++; a.e -= land; a.s += land;
    return true;
  }
  function tryConnector(a) {
    const dx = Math.cos(a.th), dz = Math.sin(a.th);
    if (ctx.inside(a.x + dx * 8, a.z + dz * 8)) return false;
    const nr = ctx.nearestRoad(a.x + dx * 20, a.z + dz * 20, 60);
    if (!nr || ctx.inH(nr.x, nr.z)) return false;
    const L = Math.hypot(nr.x - a.x, nr.z - a.z); if (L < 4 || L > 70) return false;
    const n = Math.max(1, Math.ceil(L / 6)), x0 = a.x, z0 = a.z;
    for (let i = 1; i <= n; i++) { const x = x0 + (nr.x - x0) * i / n, z = z0 + (nr.z - z0) * i / n; if (ctx.isWet(x, z)) return false; }
    for (let i = 1; i <= n; i++) layPoint(a, x0 + (nr.x - x0) * i / n, z0 + (nr.z - z0) * i / n);
    return true;
  }
  function maybeBranch(a) {
    if (a.rank >= 2 || agentsMade >= MAX_AGENTS || a.sinceBr < a.brSpace || houses >= plotCap) return;
    const p = planned ? 1 : [0.21, 0.18][a.rank] * densP;
    if (a.r() >= p) return;
    let side;
    if (planned) side = a.brSide = -a.brSide;
    else { side = a.r() < 0.7 ? -a.brSide : a.brSide; a.brSide = side; }
    const ang = planned ? 90 * DEG : (50 + 60 * a.r()) * DEG;
    const th = planned ? snapGrid(a.th + side * ang) : a.th + side * ang;
    const rank = a.rank + 1;
    const en = (rank === 1 ? 80 + 140 * a.r() : 30 + 60 * a.r()) * (0.75 + 0.5 * dens);
    newAgent(a.x, a.z, th, rank, en, a.lin, null, a.nd);
    const dirs = [a.th, a.th + PI, th];
    if (planned && a.r() < 0.25 + 0.5 * dens && agentsMade < MAX_AGENTS) { const th2 = snapGrid(a.th - side * ang); newAgent(a.x, a.z, th2, rank, en, a.lin, null, a.nd); dirs.push(th2); }
    addJunction(a.x, a.z, a.rank, rank, dirs, a.nd);
    a.sinceBr = 0; a.brSpace = planned ? 48 + 26 * (1 - dens) : 16 + a.r() * 32;
  }
  function stepAgent(a) {
    if (a.e <= 0) return die(a, true);
    if (!a.goal && a.wantsLoop && a.rank < 2 && a.e < 0.35 * a.e0 && a.s > 30) findLoopGoal(a);
    const ct = Math.cos(a.th), st = Math.sin(a.th);
    // join: a lane point of another lineage just ahead → T-junction
    if (a.s > 10) {
      let jp = null, jd = 1e9;
      lanePts.query(a.x + ct * 4, a.z + st * 4, 9, p => {
        if (p.lin === a.lin) return;
        const near0 = Math.hypot(p.x - a.sx, p.z - a.sz) < 25;
        if (near0 && (lins[a.lin].anc.has(p.lin) || p.lin === lins[a.lin].parent)) return;
        const dx = p.x - a.x, dz = p.z - a.z, dd = Math.hypot(dx, dz);
        if (dd < 1 || (dx * ct + dz * st) < 0.3 * dd) return;
        if (dd < jd) { jd = dd; jp = p; }
      });
      if (jp) {
        layPoint(a, jp.x, jp.z);
        addJunction(jp.x, jp.z, a.rank, jp.rank, [Math.atan2(-st, -ct), Math.atan2(jp.tz, jp.tx), Math.atan2(-jp.tz, -jp.tx)], a.nd);
        return die(a, false);
      }
    }
    if (a.goal && Math.hypot(a.goal[0] - a.x, a.goal[1] - a.z) < 10) {
      layPoint(a, a.goal[0], a.goal[1]);
      if (a.goalContinue) { a.goal = null; a.goalContinue = false; a.th0 = a.th; a.e = Math.max(a.e, 140 + 120 * dens); }
      else return die(a, false);
    }
    const thN = a.th0 + WANDER * 1.6 * ctx.fbm(a.s / 240, a.lin * 7.31 + 0.5);
    let best = -1, bc = 1e18, bx = 0, bz = 0, bth = 0;
    for (let k = -3; k <= 3; k++) {
      const th = a.th + k * 9 * DEG, dx = Math.cos(th), dz = Math.sin(th);
      const nx = a.x + dx * 6, nz = a.z + dz * 6;
      if (!ctx.inside(nx, nz)) continue;
      const oc = ctx.occAt(nx, nz);
      if (oc === OCC.BUILDING || oc === OCC.WALL || oc === OCC.PRECINCT || oc === 255) continue;
      if (oc === OCC.ROAD && ctx.occAt(nx + dx * 9, nz + dz * 9) === OCC.ROAD) continue;
      const px = -dz, pz = dx, hw = a.w / 2;
      const e1 = ctx.occAt(nx + px * hw, nz + pz * hw), e2 = ctx.occAt(nx - px * hw, nz - pz * hw);
      if (e1 === OCC.BUILDING || e2 === OCC.BUILDING || e1 === OCC.PRECINCT || e2 === OCC.PRECINCT) continue;
      if (!ctx.testPolyline([a.x, a.z, nx, nz], hw, LANE_OK)) continue;
      if (ctx.isWet(nx, nz)) continue;
      const g = Math.abs(ctx.h4(nx, nz) - ctx.h4(a.x, a.z)) / 6, mg = maxG[a.rank];
      if (g > mg * 1.6) continue;
      const gr = ctx.gradAt(nx, nz), sl = Math.hypot(gr[0], gr[1]);
      let cost = 4 * (g / mg) * (g / mg) + (sl > 0.06 ? 1.2 * Math.abs(dx * gr[0] + dz * gr[1]) / sl : 0)
        + turnW * Math.pow(k * 9 / 30, 2) + 0.8 * Math.abs(D.angDiff(th, thN)) / (45 * DEG);
      if (a.goal) { const gdx = a.goal[0] - nx, gdz = a.goal[1] - nz, gl = Math.hypot(gdx, gdz) || 1; cost -= a.goalW * (dx * gdx + dz * gdz) / gl; }
      let crowd = 0;
      for (let q = 0; q < 3; q++) { const f = q === 0 ? 12 : 10, l = q === 0 ? 0 : q === 1 ? 8 : -8; const c = ctx.occAt(nx + dx * f + px * l, nz + dz * f + pz * l); if (c === OCC.BUILDING || c === OCC.YARD) crowd++; }
      cost += 0.5 * crowd / 3;
      if (planned) { const dv = gridDev(th); cost += 3 * layout * dv * dv; }
      cost += k * 1e-7;
      if (cost < bc) { bc = cost; best = k; bx = nx; bz = nz; bth = th; }
    }
    if (bc >= 1e17) {
      if (a.rank === 0 && a.bridges < 2 && crossWater(a)) return true;
      if (a.rank === 0 && tryConnector(a)) return die(a, false);
      return die(a, true);
    }
    a.th = bth; layPoint(a, bx, bz);
    a.e -= 6; a.s += 6; a.sinceBr += 6;
    maybeBranch(a);
    return true;
  }
  // ---- plots ---------------------------------------------------------------------------------------
  function lanePointNear(b, x, z) {
    let best = null, bd = 1e9;
    lanePts.query(x, z, 10, (p, d2) => { if (p.lane !== b.lane) return; if (d2 < bd) { bd = d2; best = p; } });
    return best;
  }
  function frontFor(town, mid, r) {
    return (town ? lerp(8.2, 5.2, dens) + r() * 2.6 : mid ? lerp(11.5, 7.5, dens) + r() * 3 : lerp(14.5, 9.5, dens) + r() * 3.5) * style.frontMul;
  }
  function chainBud(b, dist, nfw) {
    const tx = b.x + b.tx * dist, tz = b.z + b.tz * dist;
    const q = lanePointNear(b, tx, tz); if (!q) return;
    let dot = (tx - q.x) * q.tx + (tz - q.z) * q.tz;
    const nb = Object.assign({}, b, { id: budId++, x: q.x + q.tx * dot, z: q.z + q.tz * dot, tx: q.tx, tz: q.tz, nd: b.nd + dist, skip: 0, fw: nfw || 0 });
    if (q.tx * b.tx + q.tz * b.tz < 0) { nb.tx = -q.tx; nb.tz = -q.tz; }
    nb.lw = marketLW(nb.x, nb.z, b.w);
    nb.key = b.key + 0.01;
    buds.push(nb); heap.push(nb.key, nb.id);
  }
  function placeFront(b, w, d, setback, kind, extra) {
    const nx = -b.tz * b.side, nz = b.tx * b.side, rot = Math.atan2(nx, nz);
    const off = b.lw + setback + d / 2, cx = b.x + nx * off, cz = b.z + nz * off;
    if (!ctx.fits(cx, cz, rot, w, d, { pad: 0.2, allow: ALLOW.FV })) return false;
    ctx.special({ kind, x: cx, z: cz, rot, w, d, extra });
    return true;
  }
  const bst = { tries: 0, ok: 0, small: 0, out: 0, house: 0, yout: 0, yard: 0, slope: 0, gaveUp: 0 };
  function tryBud(b) {
    if (houses >= plotCap) return;
    bst.tries++;
    for (let i = 0; i < wants.length; i++) {
      const wn = wants[i];
      if (wn.test(b) && placeFront(b, wn.w, wn.d, 1.2, wn.kind, { ms: wn.ms })) { wants.splice(i, 1); return; }
    }
    const r = ctx.rng('bud', b.id, ctx.epoch);
    const coreR = R90 * (0.18 + 0.55 * dens), midR = R90 * (0.42 + 0.5 * dens);
    const town = dens > 0.25 && houses >= 4 && b.rank <= 1 && (b.nd < coreR || (b.nd < midR && nearSquare(b.x, b.z, 26)));
    const mid = !town && b.nd < midR;
    const nx = -b.tz * b.side, nz = b.tx * b.side, rot = Math.atan2(nx, nz);
    const fw = b.fw || frontFor(town, mid, r);
    const depth0 = (town ? 22 + r() * 18 : 20 + r() * 18) * (0.6 + 0.8 * tw.gardens);
    const setback = town ? r() * 0.4 : mid ? 0.4 + r() * 1.6 : 1 + r() * 2.8;
    const hwid = fw * (town ? 0.985 : mid ? 0.78 + r() * 0.16 : 0.6 + r() * 0.22), hdep = town ? 7.5 + r() * 3.5 : 6 + r() * 3.5;
    for (let att = 0; att < 4; att++) {
      const dep = (att & 1) ? depth0 * 0.7 : depth0, turned = att >= 2;
      let w = hwid, d = hdep;
      if (turned) { w = Math.min(hdep, fw * 0.95); d = Math.min(Math.max(hwid, 7.5), dep - setback - 2.5); }
      const yardD = dep - setback - d; if (yardD < 2.5 || w < 3.5) { bst.small++; continue; }
      const off = b.lw + setback + d / 2, cx = b.x + nx * off, cz = b.z + nz * off;
      if (!ctx.inside(cx, cz) || ctx.isWet(cx, cz)) { bst.out++; continue; }
      if (!ctx.testRect(cx, cz, rot, w, d, -0.25, ALLOW.FV)) { bst.house++; continue; }
      const yo = d / 2 + yardD / 2, yx = cx + nx * yo, yz = cz + nz * yo;
      if (!ctx.inside(yx, yz) || ctx.isWet(yx, yz)) { bst.yout++; continue; }
      if (!ctx.testRect(yx, yz, rot, fw, yardD, -0.35, ALLOW.FV)) { bst.yard++; continue; }
      if (ctx.spread(cx, cz, rot, w, d) > Math.max(3, 0.35 * Math.min(w, d))) { bst.slope++; continue; }
      const cl = ctx.occAt(cx - b.tx * (w / 2 + 2.5), cz - b.tz * (w / 2 + 2.5)), cr = ctx.occAt(cx + b.tx * (w / 2 + 2.5), cz + b.tz * (w / 2 + 2.5));
      const corner = town && (cl === OCC.LANE || cr === OCC.LANE) ? 1 : 0;
      const nsq = nearSquare(cx, cz, 18);
      const wq = 0.35 * (1 - b.nd / R90) - 0.15 + (b.rank === 0 ? 0.1 : 0) + (nsq ? 0.1 : 0) + 0.08 * ctx.fbm(cx / 200, cz / 200);
      const mkt = market && Math.hypot(cx - market.x, cz - market.z) < market.L * 0.6 + 25 ? 1 : 0;
      ctx.plot({ x: cx, z: cz, rot, w, d, yardD, frontW: fw, rank: b.rank, netD: b.nd, wq, role: 'house', corner, town: town ? 1 : 0, mkt });
      houses++;
      // the next plot's frontage is chosen now so a terrace can abut exactly (party walls)
      const nfw = frontFor(town, mid, ctx.rng('nfw', b.id, ctx.epoch));
      chainBud(b, fw * 0.5 + nfw * 0.5 + (town ? 0.12 : mid ? 0.5 + r() * 1.2 : 0.6), nfw);
      milestones();
      bst.ok++;
      return;
    }
    bst.gaveUp++;
    if (!b.skip) {
      const q = lanePointNear(b, b.x + b.tx * 4, b.z + b.tz * 4);
      if (q) { const nb = Object.assign({}, b, { id: budId++, x: b.x + b.tx * 4, z: b.z + b.tz * 4, nd: b.nd + 4, skip: 1, fw: 0 }); nb.key = b.key + 2; buds.push(nb); heap.push(nb.key, nb.id); }
    }
  }
  // ---- milestone specials ----------------------------------------------------------------------------
  function frontND() { let m = 0; for (const a of agents) if (a.alive && a.nd > m) m = a.nd; return Math.max(m, 0.6 * R90); }
  function allLanePts(maxRank) {
    const out = [];
    const keys = Array.from(lanePts.m.keys()).sort((a, b) => a - b);
    for (const k of keys) for (const p of lanePts.m.get(k)) if (p.rank <= maxRank) out.push(p);
    return out;
  }
  function placeChurch(tag, final) {
    const small = plotCap < 40, envW = small ? 9 : 14, envD = small ? 16 : 30, kind = small ? 'chapel' : 'church';
    const r = ctx.rng('church', tag, ctx.epoch, churchRetry);
    const rotC = PI / 2 + (r() * 2 - 1) * 15 * DEG;
    const cyW = envW + 12, cyD = envD + 14, c = Math.cos(rotC), s = Math.sin(rotC);
    const cands = allLanePts(1);
    let best = null, bs = -1e9;
    for (let pass = 0; pass < (final ? 3 : 2) && !best; pass++) {
      const lo = pass ? 20 : 40, hi = pass === 2 ? 600 : pass ? 320 : 180, maxSp = pass === 2 ? 9 : pass ? 7 : 5;
      for (let i = 0; i < cands.length; i += 2) {
        const p = cands[i], d0 = Math.hypot(p.x - origin.x, p.z - origin.z);
        let far = 1e9; for (const ch of churches) far = Math.min(far, Math.hypot(p.x - ch.x, p.z - ch.z));
        if (tag === 'church') { if (d0 < lo || d0 > hi) continue; } else if (far < (pass === 2 ? 250 : 350)) continue;
        for (const side of [1, -1]) {
          const nx = -p.tz * side, nz = p.tx * side;
          const ext = Math.abs(nx * c - nz * s) * cyW / 2 + Math.abs(nx * s + nz * c) * cyD / 2;
          for (const back of pass === 2 ? [1, 9, 17] : [1, 6]) {
            const off = marketLW(p.x, p.z, p.w) + back + ext, cx = p.x + nx * off, cz = p.z + nz * off;
            if (!ctx.inside(cx, cz) || ctx.isWet(cx, cz)) continue;
            if (!ctx.testRect(cx, cz, rotC, cyW, cyD, -0.5, ALLOW.FV)) continue;
            const sp = ctx.spread(cx, cz, rotC, envW, envD); if (sp > maxSp) continue;
            const score = ctx.prominence(cx, cz, 60) * 0.6 - sp * 0.8 - back * 0.05 - (tag === 'church' ? Math.abs(d0 - 90) / 60 : -Math.min(far, 900) / 600) + r() * 0.3;
            if (score > bs) { bs = score; best = { x: cx, z: cz }; }
            break;
          }
        }
      }
    }
    if (!best) return false;
    ctx.area({ cls: 4, poly: rectPoly(best.x, best.z, rotC, cyW, cyD) });
    ctx.special({ kind, x: best.x, z: best.z, rot: rotC, w: envW, d: envD, extra: { ms: 'church', tag, orient: 'east' } });
    churches.push(best);
    return true;
  }
  function placeMill() {
    // watermill on a river bank within 120 m of the lanes
    if (D.Water && D.Water.riverAt && ctx.wl) {
      const gw = ctx.gw, gh = ctx.gh; let found = null, bd = 1e18, tests = 0;
      for (let j = 0; j < gh && tests < 20000; j += 2) for (let i = 0; i < gw && tests < 20000; i += 2) {
        const k = j * gw + i; if (ctx.wl[k] <= ctx.hgt[k] + 0.05) continue;
        const x = ctx.x0 + (i + 0.5) * 4, z = ctx.z0 + (j + 0.5) * 4; tests++;
        if (D.Water.riverAt(x, z) <= ctx.hgt[k] + 0.05) continue;
        let np = null, nd2 = 14400;
        lanePts.query(x, z, 120, (p, d2) => { if (d2 < nd2) { nd2 = d2; np = p; } });
        if (!np) continue;
        const d0 = Math.hypot(x - origin.x, z - origin.z); if (d0 < bd) { bd = d0; found = { x, z, p: np }; }
      }
      if (found) {
        const dx0 = found.p.x - found.x, dz0 = found.p.z - found.z, L = Math.hypot(dx0, dz0) || 1, ux = dx0 / L, uz = dz0 / L;
        // walk from the water towards the lane until dry, then back off onto the bank
        for (let t = 4; t < L; t += 2) {
          const x = found.x + ux * t, z = found.z + uz * t;
          if (ctx.isWet(x, z)) continue;
          for (const extraOff of [5, 8, 11]) {
            const cx = found.x + ux * (t + extraOff), cz = found.z + uz * (t + extraOff);
            const rot = Math.atan2(uz, -ux); // local +x points back to the water
            if (ctx.fits(cx, cz, rot, 12, 9, { pad: 0.2, allow: ALLOW.FV, maxSpread: 4.5 })) {
              ctx.special({ kind: 'watermill', x: cx, z: cz, rot, w: 12, d: 9, extra: { ms: 'mill', water: 1 } });
              return true;
            }
          }
          break;
        }
      }
    }
    // windmill on the best rise within 400 m
    let best = null, bs = -1e9;
    for (let i = 0; i < ctx.cells.length; i++) {
      const [x, z] = ctx.cellCenter(ctx.cells[i]);
      if (Math.hypot(x - origin.x, z - origin.z) > 400) continue;
      const pr = ctx.prominence(x, z, 60); if (pr <= bs) continue;
      if (!ctx.fits(x, z, 0, 9, 9, { pad: 1, allow: ALLOW.FREE })) continue;
      bs = pr; best = [x, z];
    }
    if (!best) return false;
    ctx.special({ kind: 'windmill', x: best[0], z: best[1], rot: ctx.rng('wm')() * TAU, w: 9, d: 9, var: 0, extra: { ms: 'mill' } });
    return true;
  }
  function placeMarketHall() {
    if (!market) return false;
    const rot = Math.atan2(-market.az, market.ax), px = -market.az, pz = market.ax;
    const side = origin.crossSide || 1;
    const hw0 = (6 + 2 * dens + (townSized ? 2 : 0)) / 2;
    for (const u of [0, 0.2, -0.2]) for (const f of [0, 1]) {
      const lh = lensHalf(u * market.L), off0 = hw0 + 1.5 + 4 + f * 1.5; if (off0 + 4 > lh) continue;
      const off = -side * off0, cx = market.x + market.ax * u * market.L + px * off, cz = market.z + market.az * u * market.L + pz * off;
      if (ctx.testRect(cx, cz, rot, 14, 8, 0, allowMask(OCC.SQUARE, OCC.FREE, OCC.VERGE)) && ctx.spread(cx, cz, rot, 14, 8) < 3) {
        ctx.special({ kind: 'markethall', x: cx, z: cz, rot, w: 14, d: 8, extra: { ms: 'hall40' } });
        return true;
      }
    }
    want({ ms: 'hall40', kind: 'markethall', w: 15, d: 9, test: b => b.rank === 0 && Math.hypot(b.x - market.x, b.z - market.z) < market.L + 60 });
    return false;
  }
  function placeTitheBarn() {
    const r = ctx.rng('tithe');
    const ref = churches.length ? churches[0] : origin;
    for (let t = 0; t < 40; t++) {
      const a = r() * TAU, d = 30 + r() * 70, x = ref.x + Math.cos(a) * d, z = ref.z + Math.sin(a) * d, rot = Math.floor(r() * 4) * PI / 2 + (r() - 0.5) * 0.3;
      if (ctx.fits(x, z, rot, 20, 10, { pad: 0.5, allow: ALLOW.FREE })) { ctx.special({ kind: 'barn', x, z, rot, w: 20, d: 10, extra: { ms: 'hall40', tithe: 1 } }); return true; }
    }
    return false;
  }
  function searchFront(test, kind, w, d, extra) {
    const cands = allLanePts(2);
    for (let i = 0; i < cands.length; i++) {
      const p = cands[i]; if (!test(p)) continue;
      for (const side of [1, -1]) if (placeFront({ x: p.x, z: p.z, tx: p.tx, tz: p.tz, side, lw: marketLW(p.x, p.z, p.w) }, w, d, 1.2, kind, extra)) return true;
    }
    return false;
  }
  function want(wn) { if (!searchFront(wn.test, wn.kind, wn.w, wn.d, { ms: wn.ms })) wants.push(wn); }
  let churchNext = 8, church2Next = 150, church2Retry = 0;
  function milestones(final) {
    if ((houses >= churchNext || (final && houses >= 8)) && !ms.church) { if (placeChurch('church', final)) ms.church = 1; else if (++churchRetry > 12) ms.church = 1; else churchNext = houses + 4; }
    if (houses >= 15 && !ms.tavern) { ms.tavern = 1; const tr = ctx.rng('tav'); want({ ms: 'tavern', kind: 'tavern', w: 13 + tr() * 3, d: 11 + tr() * 2, test: b => b.rank === 0 && (b.nd < 0.4 * R90 || b.nd < 170) }); }
    if (houses >= 20 && !ms.smithy) { ms.smithy = 1; want({ ms: 'smithy', kind: 'smithy', w: 10, d: 8, test: b => b.rank <= 1 && b.nd > 0.5 * frontND() }); }
    if (houses >= 25 && !ms.mill) { ms.mill = 1; placeMill(); }
    if (houses >= 40 && !ms.hall40) { ms.hall40 = 1; if (market && (dens > 0.5 || townSized)) placeMarketHall(); else placeTitheBarn(); }
    if (houses >= 70 && !ms.guild) { ms.guild = 1; want({ ms: 'guild', kind: 'hall', w: 16, d: 12, test: b => b.rank <= 1 && (market ? Math.hypot(b.x - market.x, b.z - market.z) < market.L * 0.5 + 90 : b.nd < 260) }); }
    if ((houses >= church2Next || (final && houses >= 150)) && !ms.church2) { if (placeChurch('church2', final)) ms.church2 = 1; else if (++church2Retry > 8) ms.church2 = 1; else church2Next = houses + 20; }
  }
  function coarseLaneDist(step) {
    const w = Math.ceil((ctx.x1 - ctx.x0) / step), h = Math.ceil((ctx.z1 - ctx.z0) / step), m = new Uint8Array(w * h);
    lanePts.m.forEach(arr => arr.forEach(p => { const i = Math.floor((p.x - ctx.x0) / step), j = Math.floor((p.z - ctx.z0) / step); if (i >= 0 && j >= 0 && i < w && j < h) m[j * w + i] = 1; }));
    for (const rd of ctx.roads) for (let q = 0; q < rd.pts.length; q += 2) { const i = Math.floor((rd.pts[q] - ctx.x0) / step), j = Math.floor((rd.pts[q + 1] - ctx.z0) / step); if (i >= 0 && j >= 0 && i < w && j < h) m[j * w + i] = 1; }
    return { w, h, step, d: chamfer(m, w, h, step, 1) };
  }
  function nearestLanePt(x, z) {
    let best = null, bd = 1e18;
    lanePts.m.forEach(arr => arr.forEach(p => { const d = D.dist2(p.x, p.z, x, z); if (d < bd || (d === bd && best && p.nd < best.nd)) { bd = d; best = p; } }));
    return best;
  }
  function raysFrom(x, z, n) {
    const out = [];
    for (let a = 0; a < n; a++) { const th = a / n * TAU, dx = Math.cos(th), dz = Math.sin(th); let L = 0; for (let d = 8; d <= 600; d += 8) { const px = x + dx * d, pz = z + dz * d; if (!ctx.inside(px, pz) || ctx.isWet(px, pz) || ctx.occAt(px, pz) === OCC.BUILDING) break; L = d; } out.push([th, L]); }
    return out;
  }
  // reach: grow a new lane from the existing network into the nearest land no lane serves yet
  let reaches = 0; const stats = ctx.stats = { reachOk: 0, reachFail: 0, cands: 0, agents: 0, maxAgents: MAX_AGENTS, steps: 0 };
  const reachLog = [], badT = [], badS = [];
  function trySpawnReach() {
    if (agentsMade >= MAX_AGENTS || reaches >= 150) return false;
    for (let i = reachLog.length - 1; i >= 0; i--) { const a = reachLog[i]; if (a.alive) continue; if (a.s < 18) { badT.push([a.goal0[0], a.goal0[1]]); badS.push([a.sx, a.sz]); } reachLog.splice(i, 1); }
    const cl = coarseLaneDist(24), r = ctx.rng('reach', reaches, ctx.epoch);
    const gap = 40 + 22 * tw.gardens;
    const cands = [];
    for (let i = 0; i < ctx.cells.length; i++) {
      const [x, z] = ctx.cellCenter(ctx.cells[i]);
      const ci = Math.floor((x - ctx.x0) / 24), cj = Math.floor((z - ctx.z0) / 24);
      if (ci < 0 || cj < 0 || ci >= cl.w || cj >= cl.h) continue;
      const ld = cl.d[cj * cl.w + ci]; if (ld < gap || ld > 600) continue;
      if (!ctx.inside(x, z) || ctx.isWet(x, z) || ctx.occAt(x, z) !== 0 || ctx.sdf(x, z) < 10) continue;
      if (badT.some(b => Math.abs(b[0] - x) < 90 && Math.abs(b[1] - z) < 90)) continue;
      cands.push([Math.abs(Math.min(ld, 400) - 170) + 60 * r(), x, z]);
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (let c = 0; c < Math.min(14, cands.length); c++) {
      const [, gx, gz] = cands[c];
      // lane points near the target whose first steps towards it are free
      const pts = [];
      lanePts.query(gx, gz, 400, (p, d2) => { pts.push([d2, p]); });
      pts.sort((a, b) => a[0] - b[0] || a[1].x - b[1].x);
      for (let i = 0; i < Math.min(120, pts.length); i++) {
        const p = pts[i][1], th = Math.atan2(gz - p.z, gx - p.x), dx = Math.cos(th), dz = Math.sin(th);
        if (badS.some(b => Math.abs(b[0] - p.x) < 10 && Math.abs(b[1] - p.z) < 10)) continue;
        const lw = marketLW(p.x, p.z, p.w || 4);
        let ok = true;
        for (const s of [lw + 2, lw + 7, lw + 13]) { const oc = ctx.occAt(p.x + dx * s, p.z + dz * s); if (oc === OCC.BUILDING || oc === OCC.PRECINCT || oc === 255 || oc === OCC.WALL) { ok = false; break; } }
        if (!ok) continue;
        let nearJ = false; juncs.query(p.x, p.z, 14, () => { nearJ = true; return false; }); if (nearJ) continue;
        const dist = Math.sqrt(pts[i][0]);
        const a = newAgent(p.x, p.z, th, 1, dist * 1.3 + 90 + 120 * dens, p.lin, [gx, gz], p.nd);
        a.goalW = 1.4; a.goalContinue = true; a.goal0 = [gx, gz];
        reachLog.push(a);
        addJunction(p.x, p.z, p.rank, 1, [Math.atan2(p.tz, p.tx), Math.atan2(-p.tz, -p.tx), th], p.nd);
        reaches++; stats.reachOk++;
        return true;
      }
      badT.push([gx, gz]);
    }
    reaches += 2; stats.reachFail++; stats.cands = cands.length;
    return false;
  }
  // ---- closes: leftover land inside the settlement becomes orchards, paddocks, meadows and allotments ------
  let closes = 0;
  function fillCloses() {
    const G = 6, ox = ctx.x0, oz = ctx.z0, gw = Math.ceil((ctx.x1 - ox) / G), gh = Math.ceil((ctx.z1 - oz) / G);
    if (gw <= 2 || gh <= 2 || gw * gh > 360 * 360) return;
    const n = gw * gh, m = new Uint8Array(n);
    const OFF = [[0, 0], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = ox + (i + 0.5) * G, z = oz + (j + 0.5) * G;
      if (!ctx.inside(x, z) || ctx.isWet(x, z) || ctx.slopeAt(x, z) > 0.22) continue;
      let ok = true;
      for (const o of OFF) if (ctx.occAt(x + o[0], z + o[1]) !== OCC.FREE) { ok = false; break; }
      if (ok) m[j * gw + i] = 1;
    }
    // erode one cell (a verge stays along lanes and yards); blobs under ~500 m² stay grass
    const e = new Uint8Array(n);
    for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) { const k = j * gw + i; e[k] = m[k] && m[k - 1] && m[k + 1] && m[k - gw] && m[k + gw] ? 1 : 0; }
    const lab = new Int32Array(n), st = [];
    const r = ctx.rng('closes', ctx.epoch), stoneLand = style.region === 1 || style.region === 2;
    let nlab = 0;
    for (let k0 = 0; k0 < n; k0++) {
      if (!e[k0] || lab[k0]) continue;
      nlab++; st.length = 0; st.push(k0); lab[k0] = nlab; const cells = [];
      while (st.length) {
        const k = st.pop(); cells.push(k); const i = k % gw;
        if (i > 0 && e[k - 1] && !lab[k - 1]) { lab[k - 1] = nlab; st.push(k - 1); }
        if (i < gw - 1 && e[k + 1] && !lab[k + 1]) { lab[k + 1] = nlab; st.push(k + 1); }
        if (k >= gw && e[k - gw] && !lab[k - gw]) { lab[k - gw] = nlab; st.push(k - gw); }
        if (k + gw < n && e[k + gw] && !lab[k + gw]) { lab[k + gw] = nlab; st.push(k + gw); }
      }
      if (cells.length < 14) continue;
      // parcels of ~1400 m²: nearest of k random seed cells
      const k = Math.max(1, Math.round(cells.length * G * G / 1400)), seeds = [];
      for (let q = 0; q < k; q++) { const c = cells[Math.floor(r() * cells.length)]; seeds.push([c % gw, (c / gw) | 0]); }
      const part = new Int32Array(cells.length);
      cells.forEach((c, q) => { const ci = c % gw, cj = (c / gw) | 0; let bi = 0, bd = 1e9; seeds.forEach((sd, t) => { const d = (sd[0] - ci) * (sd[0] - ci) + (sd[1] - cj) * (sd[1] - cj); if (d < bd) { bd = d; bi = t; } }); part[q] = bi; });
      for (let t = 0; t < k; t++) {
        const pc = cells.filter((c, q) => part[q] === t); if (pc.length < 10) continue;
        makeClose(pc, m, gw, gh, n, ox, oz, G, r, stoneLand);
        if (closes >= 80) return;
      }
    }
  }
  function makeClose(cells, m, gw, gh, n, ox, oz, G, r, stoneLand) {
    {
      const bm = new Uint8Array(n);
      for (const k of cells) bm[k] = 1;
      const loops = traceMaskLoops(bm, gw, gh, ox, oz, G); if (!loops.length) return;
      const poly = chaikin(dpSimplify(loops[0], 3, true), 1, true);
      if (poly.length < 8) return;
      let cx = 0, cz = 0; for (const k of cells) { cx += ox + (k % gw + 0.5) * G; cz += oz + (((k / gw) | 0) + 0.5) * G; } cx /= cells.length; cz /= cells.length;
      const near = Math.hypot(cx - origin.x, cz - origin.z) < R90 * 0.6, x = r();
      const cls = near ? (x < 0.3 ? 2 : x < 0.78 ? 13 : x < 0.93 ? 11 : 12) : (x < 0.45 ? 13 : x < 0.72 ? 11 : x < 0.8 ? 12 : 2);
      const type = cls === 2 ? 2 : stoneLand && r() < 0.6 ? 1 : r() < 0.7 ? 0 : 2;
      const edges = [], rp = resample(poly, 3, true), nn = rp.length >> 1;
      for (let q = 0; q < nn; q++) {
        const q2 = (q + 1) % nn, dx = rp[q2 * 2] - rp[q * 2], dz = rp[q2 * 2 + 1] - rp[q * 2 + 1];
        if (dx * dx + dz * dz < 0.25) continue;
        edges.push((rp[q * 2] + rp[q2 * 2]) / 2, (rp[q * 2 + 1] + rp[q2 * 2 + 1]) / 2, Math.atan2(-dz, dx), type);
      }
      ctx.area({ cls, poly, ang: r() * PI, extra: { edges: Float32Array.from(edges) }, noStamp: true });
      closes++;
    }
  }
  function trySpawnHamlet() {
    if (ctx.areaHa < 20 || hamlets >= 4 || agentsMade >= MAX_AGENTS - 3) return false;
    const cl = coarseLaneDist(32);
    let best = null, bs = -1e9;
    const r = ctx.rng('hamlet', hamlets, ctx.epoch);
    for (let i = 0; i < ctx.cells.length; i += 2) {
      const [x, z] = ctx.cellCenter(ctx.cells[i]);
      const ci = Math.floor((x - ctx.x0) / 32), cj = Math.floor((z - ctx.z0) / 32);
      if (ci < 0 || cj < 0 || ci >= cl.w || cj >= cl.h) continue;
      const ld = cl.d[cj * cl.w + ci]; if (ld < 330) continue;
      if (ctx.sdf(x, z) < 30 || !ctx.inside(x, z) || ctx.isWet(x, z) || ctx.occAt(x, z) !== 0) continue;
      const sc = -ctx.slopeAt(x, z) * 12 + Math.min(ld, 1200) / 800 + ctx.sdf(x, z) / 200 + r() * 0.3;
      if (sc > bs) { bs = sc; best = [x, z]; }
    }
    if (!best) return false;
    const [hx, hz] = best;
    ctx.area({ cls: 'square', poly: discPoly(hx, hz, 6, 12) });
    ctx.special({ kind: r() < 0.5 ? 'well' : 'shrine', x: hx, z: hz, rot: r() * TAU, w: 3.5, d: 3.5, extra: { hamlet: 1 } });
    hamlets++;
    const np = nearestLanePt(hx, hz);
    const baseND = np ? np.nd + Math.hypot(np.x - hx, np.z - hz) : 0;
    if (np) { const dist = Math.hypot(np.x - hx, np.z - hz); newAgent(np.x, np.z, Math.atan2(hz - np.z, hx - np.x), 1, dist * 1.5 + 60, np.lin, [hx, hz], np.nd); }
    const rs = raysFrom(hx, hz, 16).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const chosen = [];
    for (const [th, L] of rs) { if (L < 40) break; if (chosen.every(c => Math.abs(D.angDiff(c, th)) >= 70 * DEG)) { chosen.push(th); newAgent(hx + Math.cos(th) * 7, hz + Math.sin(th) * 7, th, 1, Math.min(L, 260) * (0.8 + 0.3 * dens), -1, null, baseND); } if (chosen.length >= 2) break; }
    return true;
  }

  // ---- seed, squares and roots (found / replan) -------------------------------------------------------
  if (!prev) {
    const r = ctx.rng('seedkind');
    let kind = ctx.areaHa < 4 ? 'well' : (dens < 0.45 && tw.greens > 0.35) ? 'green' : 'market';
    let bestA = 0, bestS = -1;
    for (let a = 0; a < 16; a++) { const s = Math.min(rays[a], rays[a + 16]) * 2 + rays[a] + rays[a + 16]; if (s > bestS) { bestS = s; bestA = a; } }
    const axTh = bestA / 32 * TAU;
    gridTh = axTh;
    ctx.setOrigin(origin.x, origin.z, kind);
    origin = ctx.origin; origin.grid = gridTh;
    let startOff = 7;
    if (kind === 'market') {
      const ax = Math.cos(axTh), az = Math.sin(axTh), px = -az, pz = ax;
      let L = clamp(60 + 50 * (0.6 * dens + 0.4 * r()), 60, 110), Wd = 20 + 14 * r();
      L = Math.min(L, 1.6 * Math.min(rays[bestA], rays[bestA + 16]));
      let ok = false;
      for (let t = 0; t < 4 && !ok; t++) {
        if (L < 40) break;
        const poly = lensPoly(origin.x, origin.z, ax, az, L, Wd);
        if (ctx.testPoly(poly, allowMask(OCC.FREE, OCC.VERGE, OCC.ROAD))) {
          market = { x: origin.x, z: origin.z, ax, az, L, Wd };
          Object.assign(origin, { ax, az, L, Wd, crossSide: r() < 0.5 ? 1 : -1 });
          ctx.area({ cls: 'square', poly });
          const hw0 = (6 + 2 * dens + (townSized ? 2 : 0)) / 2, cs = origin.crossSide * Math.min(Wd / 2 - 2.2, hw0 + 3);
          ctx.special({ kind: 'marketcross', x: origin.x + px * cs, z: origin.z + pz * cs, rot: axTh, w: 3.6, d: 3.6, extra: { seed: 1 } });
          ok = true;
        } else { L *= 0.82; Wd *= 0.88; }
      }
      if (!ok) kind = origin.kind = 'well';
      startOff = 0;
    }
    if (kind === 'green') {
      const rG = 18 + 12 * r();
      const poly = discPoly(origin.x, origin.z, rG, 22, ctx, 0.12);
      if (ctx.testPoly(poly, ALLOW.FV)) {
        ctx.area({ cls: 3, poly });
        if (ctx.prominence(origin.x, origin.z, 45) < -0.5) {
          const pr = rG * 0.35, a = r() * TAU, pw = 7 + 4 * r();
          ctx.special({ kind: 'pond', x: origin.x + Math.cos(a) * pr, z: origin.z + Math.sin(a) * pr, rot: r() * PI, w: pw, d: pw * (0.7 + 0.3 * r()), extra: { seed: 1 } });
        } else ctx.special({ kind: 'well', x: origin.x + rG * 0.5, z: origin.z, rot: 0, w: 3.5, d: 3.5, extra: { seed: 1 } });
        startOff = rG + 2;
      } else kind = origin.kind = 'well';
    }
    if (kind === 'well') {
      ctx.area({ cls: 'square', poly: discPoly(origin.x, origin.z, 7, 14) });
      ctx.special({ kind: 'well', x: origin.x, z: origin.z, rot: r() * TAU, w: 3.5, d: 3.5, extra: { seed: 1 } });
      startOff = 7.5;
    }
    // roots: goals first, then the market axis, then local maxima of the rays
    const roots = [];
    const addRoot = (th, energy, goal) => { if (roots.some(q => Math.abs(D.angDiff(q.th, th)) < 30 * DEG)) return false; roots.push({ th, energy, goal }); return true; };
    const goals = [];
    for (const rd of ctx.roads) {
      const p = rd.pts; let prevIn = ctx.inH(p[0], p[1]);
      for (let q = 2; q < p.length; q += 2) {
        const inn = ctx.inH(p[q], p[q + 1]);
        if (inn !== prevIn) { const d = Math.hypot(p[q] - origin.x, p[q + 1] - origin.z); if (d < 400 && d > 30) goals.push([p[q], p[q + 1], d]); }
        prevIn = inn;
      }
      const nr = ctx.nearestRoad(origin.x, origin.z, 400);
      if (nr && nr.road === rd && nr.d > 40) goals.push([nr.x, nr.z, nr.d]);
    }
    for (const n of ctx.neighbours) {
      if (n.type === 3 && n.plan) for (const s of n.plan.specials) if (s.kind === 'curtain' && s.extra && s.extra.gates) for (const g of s.extra.gates) { const d = Math.hypot(g.x - origin.x, g.z - origin.z); if (d < 600) goals.push([g.x, g.z, d]); }
      if (n.type === 5 && n.plan) { let bp = null, bd = 400; for (const L of n.plan.lanes) if (L.rank === 0) for (let q = 0; q < L.pts.length; q += 2) { const d = Math.hypot(L.pts[q] - origin.x, L.pts[q + 1] - origin.z); if (d < bd) { bd = d; bp = [L.pts[q], L.pts[q + 1], d]; } } if (bp) goals.push(bp); }
    }
    goals.sort((a, b) => a[2] - b[2]);
    for (const g of goals) addRoot(Math.atan2(g[1] - origin.z, g[0] - origin.x), g[2] * 1.3 + 40, [g[0], g[1]]);
    const nRoots = Math.max(2, 2 + Math.round(dens * 1.5) + (market ? 1 : 0));
    if (market) { addRoot(axTh, Math.max(80, rays[bestA] * (0.9 + 0.2 * r()))); addRoot(axTh + PI, Math.max(80, rays[bestA + 16] * (0.9 + 0.2 * r()))); }
    const maxima = [];
    for (let a = 0; a < 32; a++) if (rays[a] >= rays[(a + 31) % 32] && rays[a] >= rays[(a + 1) % 32] && rays[a] > 24) maxima.push(a);
    maxima.sort((a, b) => rays[b] - rays[a] || a - b);
    const farEnough = th => roots.every(q => Math.abs(D.angDiff(q.th, th)) >= 70 * DEG);
    for (const a of maxima) { if (roots.length >= nRoots) break; const th = a / 32 * TAU; if (farEnough(th)) roots.push({ th, energy: rays[a] * (0.9 + 0.2 * r()) }); }
    if (roots.length < 2) { const order = Array.from({ length: 32 }, (_, i) => i).sort((a, b) => rays[b] - rays[a] || a - b); for (const a of order) { if (roots.length >= 2) break; const th = a / 32 * TAU; if (rays[a] > 16 && farEnough(th)) roots.push({ th, energy: rays[a] }); } }
    for (const rt of roots) {
      const sx = origin.x + Math.cos(rt.th) * startOff, sz = origin.z + Math.sin(rt.th) * startOff;
      const a = newAgent(sx, sz, rt.th, 0, Math.max(60, rt.energy), -1, rt.goal || null, startOff);
      if (rt.goal) { a.goalW = 1.2; a.goalContinue = false; }
    }
    // manual roads inside H are rank-0 frontage
    roadFrontage();
  } else if (expand) {
    // resume dead-end tips near the new cells, bud along old lanes next to new land
    const groups = new Map();
    for (const L of prev.lanes) { const base = L.key.slice(0, L.key.lastIndexOf('.')); let g = groups.get(base); if (!g) groups.set(base, g = []); g.push(L); }
    const gk = Array.from(groups.keys()).sort();
    for (const k of gk) {
      const steps = groups.get(k).sort((a, b) => stepIdx(a.key) - stepIdx(b.key)), last = steps[steps.length - 1];
      if (!last.tip) continue;
      const p = last.pts, n = p.length >> 1; if (n < 2) continue;
      const x = p[n * 2 - 2], z = p[n * 2 - 1], th = Math.atan2(z - p[n * 2 - 3], x - p[n * 2 - 4]);
      let near = false; for (const d of [16, 32, 48]) if (ctx.isNew(x + Math.cos(th) * d, z + Math.sin(th) * d)) near = true;
      if (!near) continue;
      newAgent(x, z, th, Math.min(2, last.rank), 180 + 140 * dens, 0, null, Math.hypot(x - origin.x, z - origin.z) * 1.15);
    }
    lanePts.m.forEach(arr => arr.forEach(p => { if (!p.frozen) return; let nw = false; for (let a = 0; a < 4 && !nw; a++) nw = ctx.isNew(p.x + Math.cos(a * PI / 2) * 30, p.z + Math.sin(a * PI / 2) * 30); if (nw) pushBuds(p); }));
    // reach into a new lobe that no lane touches
    let nx = 0, nz = 0, nc = 0;
    ctx.forCells((k, x, z) => { if (ctx.isNew(x, z)) { nx += x; nz += z; nc++; } });
    if (nc * 256 > 40000) {
      nx /= nc; nz /= nc;
      const np = nearestLanePt(nx, nz);
      if (np && Math.hypot(np.x - nx, np.z - nz) > 120 && ctx.inside(nx, nz)) {
        const a = newAgent(np.x, np.z, Math.atan2(nz - np.z, nx - np.x), 1, Math.hypot(np.x - nx, np.z - nz) * 1.5 + 200, np.lin, [nx, nz], np.nd);
        a.goalContinue = true;
      }
    }
    roadFrontage(true);
  } else if (infill) {
    roadFrontage();
  }
  function roadFrontage(onlyNew) {
    for (const rd of ctx.roads) {
      const p = resample(rd.pts, 6, false);
      for (let q = 2; q < p.length; q += 2) {
        const x = p[q], z = p[q + 1]; if (!ctx.inH(x, z)) continue;
        if (onlyNew && !ctx.isNew(x, z)) continue;
        const dx = x - p[q - 2], dz = z - p[q - 1], l = Math.hypot(dx, dz) || 1;
        const pt = { x, z, lin: 0, tx: dx / l, tz: dz / l, nd: Math.hypot(x - origin.x, z - origin.z) * 1.1, rank: rd.rank === 0 ? 0 : 1, w: rd.w, lane: 'road' + rd.id };
        lanePts.add(pt); pushBuds(pt);
      }
    }
  }

  // ---- main growth loop ----------------------------------------------------------------------------------
  let popped = 0;
  for (;;) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]; if (!a.alive) continue;
      if (++totalSteps > MAX_STEPS || houses >= plotCap) { die(a, true); continue; }
      stepAgent(a);
      if ((i & 7) === 7) yield* ctx.yieldIfOverBudget();
    }
    let front = Infinity, alive = 0;
    for (const a of agents) if (a.alive) { alive++; if (a.nd < front) front = a.nd; }
    if (agents.length > 64) { let w = 0; for (let i = 0; i < agents.length; i++) if (agents[i].alive) agents[w++] = agents[i]; agents.length = w; }
    while (heap.size && houses < plotCap && heap.peekKey() <= front - 10) {
      tryBud(buds[heap.pop()]);
      if ((++popped & 15) === 0) yield* ctx.yieldIfOverBudget();
    }
    if (!alive) {
      while (heap.size && houses < plotCap) { tryBud(buds[heap.pop()]); if ((++popped & 15) === 0) yield* ctx.yieldIfOverBudget(); }
      if (houses < plotCap && !infill && (trySpawnReach() || trySpawnReach() || trySpawnReach())) continue;
      if (houses < plotCap && !infill && trySpawnHamlet()) continue;
      break;
    }
    yield* ctx.yieldIfOverBudget();
  }
  for (const a of agents) if (a.alive) die(a, true);
  stats.agents = agentsMade; stats.steps = totalSteps; stats.buds = bst; stats.budsMade = budId;
  milestones(true);
  for (const wn of wants.slice()) searchFront(wn.test, wn.kind, wn.w, wn.d, { ms: wn.ms });
  if (!infill) { fillCloses(); stats.closes = closes; }
  // walls: order threshold at 65% of the houses
  const hos = ctx.plots.filter(p => p.role === 'house').map(p => p.o).sort((a, b) => a - b);
  ctx.setWallO(hos.length >= 12 ? hos[Math.floor(hos.length * 0.65)] : -1);
}
function lensPoly(x, z, ax, az, L, Wd) {
  const px = -az, pz = ax, out = [], n = 12;
  for (let i = 0; i <= n; i++) { const u = -L / 2 + L * i / n, hw = Wd / 2 * Math.pow(Math.max(0, 1 - (2 * u / L) * (2 * u / L)), 0.7); out.push(x + ax * u + px * hw, z + az * u + pz * hw); }
  for (let i = n - 1; i >= 1; i--) { const u = -L / 2 + L * i / n, hw = Wd / 2 * Math.pow(Math.max(0, 1 - (2 * u / L) * (2 * u / L)), 0.7); out.push(x + ax * u - px * hw, z + az * u - pz * hw); }
  return Float32Array.from(out);
}
function discPoly(x, z, r, n, ctx, wob) {
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, rr = r * (1 + (wob && ctx ? wob * ctx.fbm(Math.cos(a) * 1.3 + x * 0.001, Math.sin(a) * 1.3) : 0));
    out[i * 2] = x + Math.cos(a) * rr; out[i * 2 + 1] = z + Math.sin(a) * rr;
  }
  return out;
}

// =====================================================================================================
// FARMLAND planner (farmsteads, A* tracks, region-growth fields, open-field strips, orchards, mills)
// =====================================================================================================
function* planFarm(ctx) {
  if (ctx.empty || ctx.kind === 'infill') return;
  const tw = ctx.tw, dens = tw.dens, layout = tw.layout, wealth = tw.wealth;
  const R = ctx.rng('farm', ctx.epoch);
  const planned = layout > 0.6, openField = layout < 0.35 || (layout < 0.5 && wealth < 0.4);
  const expand = ctx.kind === 'expand';
  if (!ctx.origin) ctx.setOrigin(ctx.centroid.x, ctx.centroid.z, 'farm');
  const gw = ctx.gw, gh = ctx.gh, x0 = ctx.x0, z0 = ctx.z0;
  const cellOK = (x, z) => expand ? ctx.isNew(x, z) : ctx.inH(x, z);

  // ---- targets for tracks: manual roads, neighbour lanes (8 m raster) -----------------------------
  const T8 = 8, tw8 = Math.ceil((ctx.x1 - x0) / T8), th8 = Math.ceil((ctx.z1 - z0) / T8), tmask = new Uint8Array(tw8 * th8);
  const markLine = (p, rad) => {
    for (let q = 0; q + 3 < p.length; q += 2) {
      const L = Math.hypot(p[q + 2] - p[q], p[q + 3] - p[q + 1]), n = Math.max(1, Math.ceil(L / 4));
      for (let s = 0; s <= n; s++) {
        const x = p[q] + (p[q + 2] - p[q]) * s / n, z = p[q + 1] + (p[q + 3] - p[q + 1]) * s / n;
        const i = Math.floor((x - x0) / T8), j = Math.floor((z - z0) / T8);
        for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < tw8 && jj < th8) tmask[jj * tw8 + ii] = 1; }
      }
    }
  };
  for (const rd of ctx.roads) markLine(rd.pts, 0);
  const villages = [];
  for (const n of ctx.neighbours) {
    if (!n.plan) continue;
    if (n.type === 1 || n.type === 3 || n.type === 5) villages.push(n.origin);
    for (const L of n.plan.lanes) { const b = bboxOf(L.pts, 0); if (b[2] < x0 || b[0] > ctx.x1 || b[3] < z0 || b[1] > ctx.z1) continue; markLine(L.pts, 0); }
  }
  if (ctx.prev) for (const L of ctx.prev.lanes) markLine(L.pts, 0);
  const tdist = chamfer(tmask, tw8, th8, T8, 1);
  const tdAt = (x, z) => { const i = clamp(Math.floor((x - x0) / T8), 0, tw8 - 1), j = clamp(Math.floor((z - z0) / T8), 0, th8 - 1); return tdist[j * tw8 + i]; };
  const hubs = [];
  const isTarget = (x, z) => { const oc = ctx.occAt(x, z); if (oc === OCC.ROAD || oc === OCC.LANE) return true; for (const hb of hubs) if (Math.abs(hb[0] - x) < 12 && Math.abs(hb[1] - z) < 12) return true; const i = Math.floor((x - x0) / T8), j = Math.floor((z - z0) / T8); return i >= 0 && j >= 0 && i < tw8 && j < th8 && tmask[j * tw8 + i] === 1; };
  yield* ctx.yieldIfOverBudget();

  // ---- 1. farmsteads --------------------------------------------------------------------------------
  const r0 = 380 - 180 * dens;
  const farms = [];
  if (ctx.prev) for (const p of ctx.prev.plots) if (p.role === 'farm') farms.push({ x: p.x, z: p.z, frozen: 1 });
  const cands = [];
  for (let i = 0; i < ctx.cells.length; i++) {
    const [x, z] = ctx.cellCenter(ctx.cells[i]); const rr = R();
    if (!cellOK(x, z) || ctx.slopeAt(x, z) > 0.1 || ctx.isWet(x, z) || ctx.occAt(x, z) !== 0 || ctx.sdf(x, z) < 18) continue;
    const near = tdAt(x, z) <= 150 ? 1 : 0;
    cands.push({ x, z, s: near + (1 - ctx.slopeAt(x, z) / 0.1) * 0.5 + rr * 0.6, i });
  }
  cands.sort((a, b) => b.s - a.s || a.i - b.i);
  const newFarms = [];
  const maxFarms = Math.max(1, Math.round(ctx.areaHa / (Math.PI * r0 * r0 / 4 / 1e4)) + 1);
  for (const c of cands) {
    if (newFarms.length >= maxFarms) break;
    if (farms.some(f => Math.hypot(f.x - c.x, f.z - c.z) < r0)) continue;
    // face the nearest road / lane (or the settlement centre)
    let fx, fz;
    const nr = ctx.nearestRoad(c.x, c.z, 500);
    if (nr) { fx = nr.x - c.x; fz = nr.z - c.z; }
    else { let bt = null, bd = 1e9; for (let a = 0; a < 16; a++) { const d = 60, x = c.x + Math.cos(a * PI / 8) * d, z = c.z + Math.sin(a * PI / 8) * d, t = tdAt(x, z); if (t < bd) { bd = t; bt = [x - c.x, z - c.z]; } } fx = bt ? bt[0] : 1; fz = bt ? bt[1] : 0; }
    let th0 = Math.atan2(fz, fx);
    if (planned) th0 = Math.round(th0 / (PI / 2)) * (PI / 2);
    let placed = null;
    for (let t = 0; t < 4 && !placed; t++) placed = farmLayout(c.x, c.z, th0 + t * PI / 2 + (R() - 0.5) * 0.2);
    if (!placed) continue;
    farms.push(placed); newFarms.push(placed);
    yield* ctx.yieldIfOverBudget();
  }
  function farmLayout(x, z, th) {
    const fx = Math.cos(th), fz = Math.sin(th), sx = -fz, sz = fx;
    const yard = rectPoly(x, z, Math.atan2(fx, fz), 20, 20);
    if (!ctx.testPoly(yard, ALLOW.FREE)) return null;
    const rotF = Math.atan2(-fx, -fz); // local −z (front) faces +fwd
    const hw = 10 + R() * 2, hd = 7 + R();
    const house = { kind: 'farmhouse', x: x + fx * (10 + hd / 2 + 0.5), z: z + fz * (10 + hd / 2 + 0.5), rot: Math.atan2(fx, fz), w: hw, d: hd };
    const barnW = 16 + R() * 4;
    const barn = { kind: 'barn', x: x - fx * (10 + 5.5), z: z - fz * (10 + 5.5), rot: rotF, w: barnW, d: 10 };
    const stable = { kind: 'stable', x: x + sx * (10 + 3.5), z: z + sz * (10 + 3.5), rot: Math.atan2(sx, sz), w: 12, d: 6 };
    const gran = { kind: 'granary', x: x - sx * (10 + 4) + fx * 4, z: z - sz * (10 + 4) + fz * 4, rot: Math.atan2(-sx, -sz), w: 6, d: 6 };
    for (const b of [house, barn, stable, gran]) if (!ctx.fits(b.x, b.z, b.rot, b.w, b.d, { pad: 0.5, allow: ALLOW.FREE, maxSpread: 3.5, inside: 'H' })) return null;
    ctx.stampPoly(yard, OCC.YARD);
    for (const b of [house, barn, stable, gran]) ctx.stampRect(b.x, b.z, b.rot, b.w, b.d, OCC.BUILDING, 0.5);
    return { x, z, th, fx, fz, sx, sz, yard, house, bld: [barn, stable, gran], gate: [x + fx * 10 + sx * 7, z + fz * 10 + sz * 7], fields: [], track: null, orchard: null, mills: [] };
  }

  // ---- 2. tracks (A* on an 8 m grid) to the nearest lane, road or track ------------------------------
  const cdist = f => Math.hypot(f.x - ctx.centroid.x, f.z - ctx.centroid.z);
  newFarms.sort((a, b) => (Math.min(tdAt(a.x, a.z), 1e8) - Math.min(tdAt(b.x, b.z), 1e8)) || cdist(a) - cdist(b) || a.x - b.x);
  let anyTarget = ctx.roads.length > 0 || farms.length > newFarms.length;
  for (let k = 0; k < tmask.length && !anyTarget; k++) if (tmask[k]) anyTarget = true;
  for (const f of newFarms) {
    if (!anyTarget && !hubs.length) { hubs.push(f.gate); continue; }   // isolated farmland: the first farm is the hub
    const path = ctx.astar(f.gate[0], f.gate[1], {
      step: 8, maxNodes: 60000, target: isTarget,
      cost: (x, z) => { const oc = ctx.occAt(x, z); if (oc === OCC.BUILDING) return Infinity; return oc === 255 && !ctx.inH(x, z) ? 4 : 0; }
    });
    if (path && path.length >= 4) {
      const sm = chaikin(path, 2, false);
      ctx.stampPolyline(sm, 1.75, OCC.LANE, 2); ctx.stampPolyline(sm, 3, OCC.VERGE, 1);
      f.track = sm;
    } else if (!hubs.length) hubs.push(f.gate);
    yield* ctx.yieldIfOverBudget();
  }

  // ---- 5/6. orchards and windmills (before the fields claim the land) -------------------------------
  for (const f of newFarms) {
    if (R() > 0.3 + 0.5 * tw.gardens) continue;
    for (let a = 0; a < 8; a++) {
      const ang = f.th + PI + a * PI / 4, d = 34 + R() * 10, x = f.x + Math.cos(ang) * d, z = f.z + Math.sin(ang) * d, rot = Math.atan2(f.fx, f.fz);
      if (ctx.fits(x, z, rot, 28, 36, { pad: 1, allow: ALLOW.FREE, maxSpread: 6, inside: 'H' })) { const poly = rectPoly(x, z, rot, 28, 36); ctx.stampPoly(poly, OCC.FIELD); f.orchard = poly; break; }
    }
  }
  const nMills = Math.min(3, Math.floor(ctx.areaHa / 40));
  const mills = [];
  if (nMills > 0) {
    const mc = [];
    for (let i = 0; i < ctx.cells.length; i++) { const [x, z] = ctx.cellCenter(ctx.cells[i]); if (!cellOK(x, z)) continue; const p = ctx.prominence(x, z, 60); if (p > 8) mc.push({ x, z, p, i }); }
    mc.sort((a, b) => b.p - a.p || a.i - b.i);
    for (const c of mc) {
      if (mills.length >= nMills) break;
      if (mills.some(m => Math.hypot(m.x - c.x, m.z - c.z) < 300)) continue;
      if (!ctx.fits(c.x, c.z, 0, 9, 9, { pad: 1.5, allow: ALLOW.FREE, inside: 'H' })) continue;
      ctx.stampRect(c.x, c.z, 0, 9, 9, OCC.BUILDING, 1.5);
      mills.push({ x: c.x, z: c.z, rot: R() * TAU });
    }
  }
  yield* ctx.yieldIfOverBudget();

  // ---- 3. fields: multi-source Dijkstra on the 4 m grid -----------------------------------------------
  const n4 = gw * gh, fid = new Int32Array(n4).fill(-1), dist = new Float32Array(n4).fill(Infinity);
  const occ = ctx.occ, ow = ctx.ow;
  const ok4 = (k, steep) => {
    if (!ctx.hin4[k]) return false;
    if (expand && ctx.hin4[k] !== 2) return false;
    if (ctx.wl[k] > ctx.hgt[k] + 0.05) return false;
    if (ctx.slope[k] > (steep ? 0.45 : 0.28)) return false;
    const i = k % gw, j = (k / gw) | 0, o = (j * 2) * ow + i * 2;
    return occ[o] === 0 && occ[o + 1] === 0 && occ[o + ow] === 0 && occ[o + ow + 1] === 0;
  };
  const regions = [];
  const pq = new PQ(4096);
  const fieldScale = 1.4 - 0.6 * dens;
  const distOwner = new Int32Array(n4).fill(-1);
  let eK = new Int32Array(1 << 16), eR = new Int32Array(1 << 16), eN = 0;
  const pushE = (key, k, ri) => {
    if (eN >= eK.length) { const a = new Int32Array(eK.length * 2), b = new Int32Array(eK.length * 2); a.set(eK); b.set(eR); eK = a; eR = b; }
    eK[eN] = k; eR[eN] = ri; pq.push(key, eN++);
  };
  const addSeed = (x, z, cls) => {
    const i = Math.floor((x - x0) / 4), j = Math.floor((z - z0) / 4); if (i < 0 || j < 0 || i >= gw || j >= gh) return;
    const k = j * gw + i; if (!ok4(k, cls === 11) || dist[k] === 0) return;
    const ri = regions.length;
    regions.push({ ri, target: Math.round(lerp(1.2, 5, R()) * fieldScale * 1e4 / 16), count: 0, cells: [], x, z, cls: cls || 0 });
    dist[k] = 0; distOwner[k] = ri; pushE(0, k, ri);
  };
  // seeds along our tracks, 30 m back on both sides
  for (const f of farms) {
    if (!f.track) continue;
    const p = resample(f.track, 4, false); let acc = 0, next = 35 + R() * 50;
    for (let q = 2; q < p.length; q += 2) {
      acc += Math.hypot(p[q] - p[q - 2], p[q + 1] - p[q - 1]);
      if (acc < next) continue;
      next = acc + 70 + R() * 90;
      const dx = p[q] - p[q - 2], dz = p[q + 1] - p[q - 1], l = Math.hypot(dx, dz) || 1;
      addSeed(p[q] - dz / l * 30, p[q + 1] + dx / l * 30); addSeed(p[q] + dz / l * 30, p[q + 1] - dx / l * 30);
    }
  }
  // interior sprinkles (jittered grid; the planned layout keeps it regular)
  const sp = planned ? 120 : 140, jit = planned ? 10 : 55;
  for (let z = ctx.hbb.z0 + sp / 2; z < ctx.hbb.z1; z += sp) for (let x = ctx.hbb.x0 + sp / 2; x < ctx.hbb.x1; x += sp) addSeed(x + (R() - 0.5) * 2 * jit, z + (R() - 0.5) * 2 * jit);
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  function* grow(steep) {
    let pops = 0;
    while (pq.size) {
      const e = pq.pop(), d0 = pq.lastKey, k = eK[e], ri = eR[e], reg = regions[ri];
      if (fid[k] >= 0 || reg.count >= reg.target) continue;
      fid[k] = ri; reg.count++; reg.cells.push(k);
      const i = k % gw, j = (k / gw) | 0, x = x0 + (i + 0.5) * 4, z = z0 + (j + 0.5) * 4;
      const wob = 1 + 0.35 * ctx.fbm(x / 60, z / 60);
      for (let q = 0; q < (planned ? 4 : 8); q++) {
        const ni = i + DI[q], nj = j + DJ[q]; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
        const nk = nj * gw + ni; if (fid[nk] >= 0 || !ok4(nk, steep)) continue;
        const sc = Math.abs(ctx.slope[nk] - ctx.slope[k]) * 10;
        const nd = d0 + (q < 4 ? 4 : 5.657) * wob * (1 + 3 * sc);
        const ow2 = distOwner[nk];
        if (nd < dist[nk] || ow2 < 0 || regions[ow2].count >= regions[ow2].target) { dist[nk] = nd; distOwner[nk] = ri; pushE(nd, nk, ri); }
      }
      if ((++pops & 2047) === 0) yield* ctx.yieldIfOverBudget();
    }
    eN = 0;
  }
  yield* grow(false);
  // pass 2: the rest of the usable land (incl. steep ground) becomes pasture and meadow
  for (let k = 0; k < n4; k += 7) {
    if (fid[k] >= 0 || !ok4(k, true)) continue;
    const ri = regions.length;
    regions.push({ ri, target: Math.round(lerp(1.5, 4, R()) * 1e4 / 16), count: 0, cells: [], x: x0 + (k % gw + 0.5) * 4, z: z0 + (((k / gw) | 0) + 0.5) * 4, cls: 11 });
    dist[k] = 0; distOwner[k] = ri; pushE(0, k, ri);
    yield* grow(true);
  }
  // drop slivers
  for (const reg of regions) if (reg.count > 0 && reg.count < 90) { for (const k of reg.cells) fid[k] = -2; reg.count = 0; reg.cells = []; }
  yield* ctx.yieldIfOverBudget();

  // ---- crops, strips and polygons ------------------------------------------------------------------
  const fields = [];
  const cropRoll = (reg) => {
    if (reg.cls === 11) return 11;
    const cx = reg.cx, cz = reg.cz;
    if (ctx.waterDist(cx, cz) < 60) return 12;
    const q = R();
    let c = q < 0.30 ? 6 : q < 0.48 ? 7 : q < 0.60 ? 8 : q < 0.75 ? (R() < 0.5 ? 10 : 5) : q < 0.90 ? 11 : 12;
    if (c === 6 && ctx.style.region === 2 && R() < 0.5) c = 9;
    return c;
  };
  let furlong = 0;
  for (const reg of regions) {
    if (!reg.count) continue;
    let sx = 0, sz = 0, gx = 0, gz = 0;
    for (const k of reg.cells) { sx += k % gw; sz += (k / gw) | 0; gx += ctx.gxA[k]; gz += ctx.gzA[k]; }
    reg.cx = x0 + (sx / reg.count + 0.5) * 4; reg.cz = z0 + (sz / reg.count + 0.5) * 4;
    gx /= reg.count; gz /= reg.count;
    // row direction: along the contour on slopes, along the long axis on the flat
    let ang;
    if (Math.hypot(gx, gz) > 0.02) ang = Math.atan2(gz, gx) + PI / 2;
    else {
      let cxx = 0, czz = 0, cxz = 0; const mx = sx / reg.count, mz = sz / reg.count;
      for (const k of reg.cells) { const dx = k % gw - mx, dz = ((k / gw) | 0) - mz; cxx += dx * dx; czz += dz * dz; cxz += dx * dz; }
      ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    }
    if (planned) ang = Math.round(ang / (PI / 2)) * (PI / 2);
    reg.ang = ang;
    reg.crop = cropRoll(reg);
    reg.fl = furlong++;
    const cereal = reg.crop >= 5 && reg.crop <= 10;
    if (openField && cereal && reg.count > 250) {
      // selions 8–20 m wide, running along the rows
      const vx = -Math.sin(ang), vz = Math.cos(ang), sw = 8 + 12 * R();
      const groups = new Map();
      for (const k of reg.cells) { const x = x0 + (k % gw + 0.5) * 4, z = z0 + (((k / gw) | 0) + 0.5) * 4; const s = Math.floor((x * vx + z * vz) / sw); let g = groups.get(s); if (!g) groups.set(s, g = []); g.push(k); }
      const keys = Array.from(groups.keys()).sort((a, b) => a - b);
      for (const s of keys) { const cells = groups.get(s); if (cells.length < 12) continue; fields.push({ reg, cells, crop: R() < 0.8 ? (R() < 0.5 ? reg.crop : cropRollStrip()) : 10, rf: 1, ang }); }
    } else fields.push({ reg, cells: reg.cells, crop: reg.crop, rf: 0, ang });
  }
  function cropRollStrip() { const q = R(); return q < 0.4 ? 6 : q < 0.65 ? 7 : q < 0.85 ? 8 : 5; }
  // per-cell field index (for borders): strips of one furlong share their furlong id
  const fcell = new Int32Array(n4).fill(-1);
  fields.forEach((f, i) => { for (const k of f.cells) fcell[k] = i; });
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    let bi0 = 1e9, bj0 = 1e9, bi1 = -1, bj1 = -1;
    for (const k of f.cells) { const a = k % gw, b = (k / gw) | 0; if (a < bi0) bi0 = a; if (a > bi1) bi1 = a; if (b < bj0) bj0 = b; if (b > bj1) bj1 = b; }
    const mw = bi1 - bi0 + 1, mh = bj1 - bj0 + 1, mask = new Uint8Array(mw * mh);
    for (const k of f.cells) mask[(((k / gw) | 0) - bj0) * mw + (k % gw - bi0)] = 1;
    const loops = traceMaskLoops(mask, mw, mh, x0 + bi0 * 4, z0 + bj0 * 4, 4);
    if (!loops.length) continue;
    f.poly = dpSimplify(loops[0], 2, true);
    if (f.poly.length < 6) f.poly = null;
    if ((i & 15) === 15) yield* ctx.yieldIfOverBudget();
  }
  // border props on cell edges between different fields (never between strips of one furlong)
  const farmNear = (x, z) => farms.some(fm => Math.abs(fm.x - x) < 60 && Math.abs(fm.z - z) < 60 && Math.hypot(fm.x - x, fm.z - z) < 60);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i, a = fcell[k]; if (a < 0) continue;
      for (let q = 0; q < 2; q++) {
        const ni = i + (q === 0 ? 1 : 0), nj = j + (q === 1 ? 1 : 0); if (ni >= gw || nj >= gh) continue;
        const b = fcell[nj * gw + ni]; if (b < 0 || b === a) continue;
        const A = fields[a], B = fields[b]; if (A.reg === B.reg) continue;
        const owner = a < b ? A : B;
        const hx = h01(i, j, q, ctx.seed), hz = h01(j, i, q + 7, ctx.seed);
        const x = q === 0 ? x0 + (i + 1) * 4 + (hx - 0.5) * 1.2 : x0 + (i + 0.5) * 4 + (hx - 0.5) * 4;
        const z = q === 1 ? z0 + (j + 1) * 4 + (hz - 0.5) * 1.2 : z0 + (j + 0.5) * 4 + (hz - 0.5) * 4;
        const rot = q === 0 ? PI / 2 : 0;
        const hh = ctx.hgt[k], sl = ctx.slope[k];
        const type = hh > 300 || sl > 0.2 ? 1 : farmNear(x, z) ? 2 : 0;
        owner.edges = owner.edges || [];
        owner.edges.push(x, z, rot + (hx - 0.5) * 0.3, type);
        if (type === 0 && h01(i, j, q, 99) < 0.05) owner.edges.push(x + (hz - 0.5) * 2, z + (hx - 0.5) * 2, hx * TAU, 3);
      }
    }
    if ((j & 31) === 31) yield* ctx.yieldIfOverBudget();
  }

  // ---- 7. emission order: farm by farm (nearest to a village or road first) -----------------------
  const nearestFarm = (x, z) => { let bi = -1, bd = 1200 * 1200; newFarms.forEach((f, i) => { const d = D.dist2(f.x, f.z, x, z); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const withPoly = fields.filter(f => f.poly);
  withPoly.forEach(f => { const c = polyCentroid(f.poly); f.cx = c[0]; f.cz = c[1]; f.farm = nearestFarm(f.cx, f.cz); });
  mills.forEach(m => { m.farm = nearestFarm(m.x, m.z); });
  const vd = (x, z) => { let d = tdAt(x, z); for (const v of villages) d = Math.min(d, Math.hypot(v.x - x, v.z - z)); return d; };
  const order = newFarms.map((f, i) => i).sort((a, b) => vd(newFarms[a].x, newFarms[a].z) - vd(newFarms[b].x, newFarms[b].z) || a - b);
  const emitField = f => {
    const edges = f.edges && f.edges.length ? Float32Array.from(f.edges) : null;
    ctx.area({ cls: f.crop, poly: f.poly, ang: ((f.ang % PI) + PI) % PI, rf: f.rf, extra: edges ? { edges, fl: f.reg.fl } : { fl: f.reg.fl }, noStamp: true });
  };
  for (const fi of order) {
    const f = newFarms[fi];
    ctx.area({ cls: 1, poly: f.yard, noStamp: true });
    const h = f.house;
    ctx.plot({ x: h.x, z: h.z, rot: h.rot, w: h.w, d: h.d, yardD: 0, frontW: h.w, rank: 3, netD: 0, wq: (R() - 0.5) * 0.2, role: 'farm', noStamp: true });
    for (const b of f.bld) ctx.special({ kind: b.kind, x: b.x, z: b.z, rot: b.rot, w: b.w, d: b.d, noStamp: true, extra: { farm: 1 } });
    if (f.track) ctx.lane({ pts: f.track, rank: 3, w: 3.5, surf: 1, noStamp: true });
    const mine = withPoly.filter(q => q.farm === fi).sort((a, b) => Math.hypot(a.cx - f.x, a.cz - f.z) - Math.hypot(b.cx - f.x, b.cz - f.z));
    for (let q = 0; q < mine.length; q++) { emitField(mine[q]); if ((q & 7) === 7) yield* ctx.yieldIfOverBudget(); }
    if (f.orchard) ctx.area({ cls: 13, poly: f.orchard, noStamp: true });
    for (const m of mills) if (m.farm === fi) ctx.special({ kind: 'windmill', x: m.x, z: m.z, rot: m.rot, w: 9, d: 9, var: R() < 0.3 + 0.5 * wealth ? 1 : 0, noStamp: true });
  }
  const o = ctx.origin;
  const rest = withPoly.filter(q => q.farm < 0).sort((a, b) => Math.hypot(a.cx - o.x, a.cz - o.z) - Math.hypot(b.cx - o.x, b.cz - o.z));
  for (const f of rest) emitField(f);
  for (const m of mills) if (m.farm < 0) ctx.special({ kind: 'windmill', x: m.x, z: m.z, rot: m.rot, w: 9, d: 9, var: 0, noStamp: true });
}

// =====================================================================================================
// Planner jobs: time-sliced generators, plan LRU, attaching finished plans
// =====================================================================================================
const PLANNERS = { 1: planVillage, 2: planFarm };
function plannerFor(type) {
  if (PLANNERS[type]) return PLANNERS[type];
  const X = D.TownX;
  return X && X.planners && typeof X.planners[type] === 'function' ? X.planners[type] : null;
}
function* planJob(Ssnap, job, holder) {
  const ctx = new Ctx(Ssnap, job);
  ctx._h = holder; holder.ctx = ctx;
  try {
    yield* ctx._init();
    if (!ctx.empty) {
      ctx._rollStyle();
      if (job.kind !== 'work') {        // a 'work' job only adds a great work to the frozen plan
        const fn = plannerFor(Ssnap.type);
        if (!fn) ctx.toast(`${(TYPES[Ssnap.type] || {}).name || 'This zone'}: coming soon. The zone is kept and will build once it is ready.`);
        else {
          const it = fn(ctx);
          if (it && typeof it.next === 'function') { const r = yield* it; if (r && r.lanes && r.plots && !job.work) return r; }
          else if (it && it.lanes && it.plots && !job.work) return it;
        }
      }
      if (job.work) yield* planGreatWork(ctx);
    }
  } catch (e) { console.error('[town] planner failed for', Ssnap.name, e); }
  return ctx.finish();
}
// ---- great-work job (Living History §3.8): reserve a real cathedral footprint (+3 m margin) near the church,
// then the origin, then the cells claimed for it, then anywhere in the town. Emits the 'greatwork' special
// (o = P.n), a cathedral close (green) and a short lane to the west door. On failure the plan is returned
// unchanged with extra.workFail = wid (Town.hist.workSite then reports false).
function* planGreatWork(ctx) {
  const job = ctx.job, wid = job.wid | 0, work = job.work || 'cathedral';
  if (!wid || ctx.specials.some(s => s.kind === 'greatwork' && s.extra && s.extra.wid === wid)) return;
  const r = ctx.rng('gw', wid);
  const W0 = 26 + 14 * r(), D0 = 60 + 30 * r();
  const sizes = [[W0, D0], [Math.max(26, W0 * 0.85), Math.max(60, D0 * 0.8)], [26, 60]];
  const rots = [PI / 2, PI / 2 + 12 * DEG, PI / 2 - 12 * DEG];      // east-oriented: local +z = world +x
  const claimEp = job.cellsEp | 0, Z = W.zone;
  const phases = [];
  const ring = (cx, cz, r0, r1, step) => { const out = []; for (let d = r0; d <= r1; d += step) for (let a = 0; a < 12; a++) out.push([cx + Math.cos(a * PI / 6) * d, cz + Math.sin(a * PI / 6) * d]); return out; };
  for (const s of ctx.specials) if (s.extra && s.extra.ms === 'church') phases.push(ring(s.x, s.z, 45, 150, 21));
  const o = ctx.origin || ctx.centroid;
  if (o) phases.push(ring(o.x, o.z, 30, 230, 25));
  const claimed = [], all = [];
  ctx.forCells((k, x, z) => { if (claimEp > 0 && Z[k * 4 + 1] === ctx.sid && Z[k * 4 + 3] >= claimEp) claimed.push([x, z]); });
  const step = Math.max(1, Math.floor(ctx.cells.length / 500));
  for (let i = 0; i < ctx.cells.length; i += step) all.push(ctx.cellCenter(ctx.cells[i]));
  phases.splice(0, 0, claimed);     // claimed cells were requested for exactly this: try them first
  phases.push(all);
  let got = null, tests = 0;
  for (const [w, d] of sizes) {
    for (const ph of phases) {
      for (const p of ph) {
        for (const rot of rots) {
          if (ctx.fits(p[0], p[1], rot, w + 6, d + 6, { pad: 0, allow: ALLOW.FV, inside: 'H', maxSpread: 8 })) { got = { x: p[0], z: p[1], rot, w, d }; break; }
        }
        if (got) break;
        if ((++tests & 15) === 0) yield* ctx.yieldIfOverBudget();
      }
      if (got) break;
    }
    if (got) break;
  }
  if (!got) { ctx._workFail = wid; return; }
  const { x, z, rot, w, d } = got;
  const green = rectPoly(x, z, rot, w + 14, d + 14), greenOK = ctx.testPoly(green, ALLOW.FVL);
  ctx.stampRect(x, z, rot, w + 6, d + 6, OCC.BUILDING, 0);
  // its own key whatever job sited it (a work carried onto a replan / found must not share the plain uid: prefix
  // with a later reroll's specials; for a 'work' job this equals the prefix + 'S0' it always had)
  ctx.special({ kind: 'greatwork', key: ctx.uid + ':w' + ctx.job.jobId + ':S0', x, z, rot, w, d, extra: { work, wid, w, d } });
  if (greenOK) ctx.area({ cls: 3, poly: green, noStamp: true });
  // a short close lane from the west door to the nearest village lane
  const c = Math.cos(rot), s = Math.sin(rot), fx = x - (d / 2 + 5) * s, fz = z - (d / 2 + 5) * c;
  let bp = null, bd = 120 * 120;
  for (const L of ctx.lanes) { if (L.rank > 1) continue; const p = L.pts; for (let q = 0; q + 1 < p.length; q += 2) { const dd = D.dist2(p[q], p[q + 1], fx, fz); if (dd < bd) { bd = dd; bp = [p[q], p[q + 1]]; } } }
  if (bp && bd > 36 && ctx.testPolyline([fx, fz, bp[0], bp[1]], 2, LANE_OK)) ctx.lane({ pts: [fx, fz, bp[0], bp[1]], rank: 1, w: 4.5, surf: 2 });
}

const jobs = new Map();          // sid -> {sid, jobId, kind, it, holder, instant}
let rrIdx = 0, finishBoostT = 0;
const regrowSids = new Set();
function anyFinishing() {
  if (finishBoostT > now()) return true;
  for (const L of lives.values()) if (L.ff || L.instant) return true;
  return false;
}
function startJobs() {
  const ids = Array.from(list.keys()).sort((a, b) => a - b);
  for (const [sid, j] of Array.from(jobs)) { const S = list.get(sid); if (!S || !S.pending || S.pending.jobId !== j.jobId) jobs.delete(sid); }
  for (const sid of ids) {
    const S = list.get(sid), p = S.pending;
    if (!p || jobs.has(sid)) continue;
    const hit = LRU.get(p.jobId);
    if (hit) { attachPlan(S, hit, instantJobs.has(p.jobId), null); continue; }
    const holder = { deadline: 0, ctx: null };
    jobs.set(sid, { sid, jobId: p.jobId, kind: p.kind, it: planJob(copyRec(S), Object.assign({}, p), holder), holder, instant: instantJobs.has(p.jobId), t0: now() });
  }
}
function runJobs() {
  if (!jobs.size) return;
  const budget = catchUp ? 12 : anyFinishing() ? 8 : 3, t0 = now(), end = t0 + budget;
  const arr = Array.from(jobs.values());
  let guard = 0;
  while (arr.length && now() < end && guard++ < 200) {
    const j = arr[rrIdx++ % arr.length];
    const slice = Math.max(0.5, (end - now()) / arr.length);
    j.holder.deadline = Math.min(end, now() + slice);
    let r;
    try { r = j.it.next(); } catch (e) { console.error('[town] job crashed', e); r = { done: true, value: j.holder.ctx ? j.holder.ctx.finish() : null }; }
    if (r.done) {
      arr.splice(arr.indexOf(j), 1);
      if (jobs.get(j.sid) === j) jobs.delete(j.sid);
      completeJob(j, r.value);
    }
  }
}
function completeJob(j, P) {
  if (!P) return;
  lruSet(j.jobId, P);
  const S = list.get(j.sid);
  if (S && S.pending && S.pending.jobId === j.jobId) attachPlan(S, P, j.instant, j.holder.ctx);
}
function attachPlan(S, P, instant, ctx) {
  const kind = S.pending ? S.pending.kind : 'found';
  if (S.pending) instantJobs.delete(S.pending.jobId);
  S.plan = P; S.pending = null;             // the one allowed out-of-history record change (§5.2)
  const L = lives.get(S.id);
  let mode = instant ? 'instant' : kind === 'replan' ? 'replan' : 'grow';
  if (mode === 'replan' && (!L || !L.shown.size)) mode = 'grow';
  if (!instant && regrowSids.has(S.id)) mode = 'regrow';
  regrowSids.delete(S.id);
  reconcile(S.id, mode);
  if (!instant && ctx && ctx.msgs.length) ctx.msgs.forEach(m => D.toast(m, 'warn', 4200));
  emitChanged();
}
function jobProgress(sid) { const j = jobs.get(sid); return j ? j : null; }

// =====================================================================================================
// Decoration: Plan + tweaks (+ prosperity b channel) → ordered items (§5.6). Deterministic, cached.
// =====================================================================================================
const planIds = new WeakMap(); let planIdN = 1;
const wallCache = new WeakMap();
function planId(P) { let i = planIds.get(P); if (!i) planIds.set(P, i = planIdN++); return i; }
let roadVer = 0;           // bumped on road edits: walls take their gates from manual roads
const roadVerS = new Int32Array(256);   // per settlement: only towns within 200 m of an edited road re-decorate their walls
function worksVer(uid) { try { return D.Works && D.Works.ver ? D.Works.ver(uid) | 0 : 0; } catch (e) { return 0; } }
function decoKey(S) {
  const t = S.tw;
  return planId(S.plan) + '|' + t.wealth.toFixed(3) + '|' + t.walls + '|' + t.gardens.toFixed(3) + '|' + t.dens.toFixed(3) + '|' + bVersion[S.id] + '|' + (t.walls !== 'none' ? roadVerS[S.id] : 0) + '|' + (D.Nature && D.Nature.SP_INDEX ? 1 : 0) + '|' + worksVer(S.uid);
}
function getDeco(S, L) {
  const k = decoKey(S);
  if (L && L.dk === k && L.dc) return L.dc;
  let d = null;
  try { d = decorate(S); } catch (e) { console.error('[town] decorate failed', e); d = null; }
  if (L) { L.dk = k; L.dc = d; }
  return d;
}
const tierOf = w => w < 0.34 ? 0 : w < 0.67 ? 1 : 2;
function sigOf(it) {
  if (it._sig) return it._sig;
  let s;
  if (it.t === 'bld') { const r = it.rec; s = 'B|' + r.kind + '|' + (+r.w).toFixed(1) + '|' + (+r.d).toFixed(1) + '|' + (r.floors || 0) + '|' + tierOf(r.wealth || 0) + '|' + r.x.toFixed(1) + '|' + r.z.toFixed(1) + '|' + (+r.rot).toFixed(2) + '|' + (r.var || 0) + '|' + (r.h || 0).toFixed(1) + (r.gw ? '|gw' + r.gw : ''); }  // gw: a great work taking over a same-shaped special (forced keep on a stone keep) must still swap in
  else if (it.t === 'lane') s = 'L|' + it.w + '|' + it.surf + '|' + it.pts.length + '|' + it.pts[0].toFixed(1) + '|' + it.pts[1].toFixed(1);
  else if (it.t === 'area') s = 'A|' + it.cls + '|' + it.poly.length + '|' + (+it.ang).toFixed(2) + '|' + it.poly[0].toFixed(1) + '|' + it.poly[1].toFixed(1);
  else s = 'P|' + it.arr.length + '|' + (it.arr.length ? it.arr[0].toFixed(1) : 0);
  it._sig = s;
  return s;
}
function baseKey(k) { return k && (k.endsWith(':v1') || k.endsWith(':v2')) ? k.slice(0, -3) : k; }
const TRADES = ['baker', 'butcher', 'cooper', 'weaver', 'cobbler', 'potter'];

function decorate(S) {
  const P = S.plan; if (!P) return null;
  const tw = S.tw, style = P.style || {}, region = style.region || 0, uid = P.uid;
  const K2 = K();
  const SPI = (D.Nature && D.Nature.SP_INDEX) || {};
  const items = [];
  let q = 0;
  const add = it => { it.q = q++; items.push(it); return it; };
  const n = Math.max(1, P.n);
  const houseCount = P.plots.reduce((a, p) => a + (p.role === 'house' ? 1 : 0), 0);
  const hasGW = P.specials.some(s => s.kind === 'greatwork' && s.extra && s.extra.work !== 'keep');
  const cellFor = (x, z, fb) => { const k = cellK(x, z); return W.zone[k * 4 + 1] === S.id ? k : fb; };
  const bldItem = (key, pk, o, cell, rec, extra) => {
    const r2 = Math.hypot(rec.w || 6, rec.d || 6) / 2 + 3;
    return add(Object.assign({ t: 'bld', key, pk, o, cell, rec, bb: [rec.x - r2, rec.z - r2, rec.x + r2, rec.z + r2] }, extra || {}));
  };
  // ---- props helper (Nature extras, stride 7: x,z,y,species,scale,rot,seed) -----------------------------
  function Props(seedKey) { this.a = []; this.r = rngFor(S.seed, seedKey, 'props'); }
  Props.prototype.put = function (id, x, z, rot, scale) {
    const sp = SPI[id]; if (sp === undefined) return;
    this.a.push(x, z, 0, sp, scale || 1, rot || 0, Math.floor(this.r() * 1e6));
  };
  const propsItem = (key, pk, o, cell, pr, pbox) => {
    if (!pr.a.length) return null;
    const arr = Float32Array.from(pr.a);
    return add({ t: 'props', key, pk, o, cell, arr, bb: propsBB(arr), pbox: pbox || null });
  };
  const lineRot = (dx, dz) => Math.atan2(-dz, dx); // Nature/three rotation.y that lays local +x along (dx,dz)

  // ---- village wall (computed first: pomerium & faubourg need it) -------------------------------------
  let wall = null;
  if (P.type === 1 && tw.walls !== 'none' && P.wallO >= 0) {
    const wk = tw.walls + '|' + roadVerS[S.id] + '|' + S.id, wc = wallCache.get(P);
    if (wc && wc.k === wk) wall = wc.wall;
    else { try { wall = villageWall(S, P, tw); } catch (e) { console.warn('[town] wall failed', e); wall = null; } wallCache.set(P, { k: wk, wall }); }
  }

  // ---- lanes -------------------------------------------------------------------------------------------
  for (const L of P.lanes) {
    let surf = L.surf || 1;
    if (surf <= 2) surf = L.rank === 3 ? 1 : (tw.wealth > 0.7 || (L.rank === 0 && tw.wealth > 0.45)) ? 2 : 1;
    add({ t: 'lane', key: L.key, pk: L.key, o: L.o, cell: L.cell, pts: L.pts, w: L.w, surf, rank: L.rank, bb: bboxOf(L.pts, L.w / 2 + 8) });
  }
  // ---- areas (+ their props / stalls) ------------------------------------------------------------------
  for (const A of P.areas) {
    const sq = A.cls === 'square';
    add({ t: 'area', key: A.key, pk: A.pk || A.key, o: A.o, cell: A.cell, cls: A.cls, poly: A.poly, ang: A.ang || 0, rf: A.rf || 0, vr: hash32(S.seed, A.key) & 3, square: sq, bb: bboxOf(A.poly, sq ? 9 : 1) });
    const pr = new Props(A.key);
    const poly = A.poly, bb = bboxOf(poly, 0), r = pr.r;
    const inPoly = (x, z) => pip(poly, x, z);
    const sample = (cnt, fn) => { for (let t = 0, got = 0; t < cnt * 12 && got < cnt; t++) { const x = lerp(bb[0], bb[2], r()), z = lerp(bb[1], bb[3], r()); if (inPoly(x, z) && fn(x, z) !== false) got++; } };
    const cls = A.cls;
    if (cls === 4) { // churchyard: graves in the ring around the church, a yew or two
      const v0x = poly[0], v0z = poly[1], v1x = poly[2], v1z = poly[3], v2x = poly[4], v2z = poly[5];
      const rot = Math.atan2(-(v1z - v0z), v1x - v0x), hw = Math.hypot(v1x - v0x, v1z - v0z) / 2, hd = Math.hypot(v2x - v1x, v2z - v1z) / 2;
      const [cx, cz] = polyCentroid(poly), c = Math.cos(rot), s = Math.sin(rot);
      const inner = { x: cx, z: cz, rot, w: Math.max(2, hw * 2 - 11), d: Math.max(2, hd * 2 - 12) };
      sample(6 + Math.floor(r() * 15), (x, z) => { if (pointInB(inner, x, z, 0.5)) return false; pr.put('grave', x, z, rot + (r() - 0.5) * 0.12, 0.9 + r() * 0.2); });
      const ny = 1 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < ny; i++) { const sx = i ? 1 : -1, lx = sx * (hw - 3), lz = (r() < 0.5 ? -1 : 1) * (hd - 3); pr.put('yew', cx + lx * c + lz * s, cz - lx * s + lz * c, r() * TAU, 0.85 + r() * 0.3); }
    } else if (cls === 13) { // orchard rows
      const sp = 7;
      for (let z = bb[1] + 3; z < bb[3]; z += sp) for (let x = bb[0] + 3; x < bb[2]; x += sp) { const jx = x + (r() - 0.5) * 1.6, jz = z + (r() - 0.5) * 1.6; if (inPoly(jx, jz)) pr.put(r() < 0.65 ? 'apple' : 'pear', jx, jz, r() * TAU, 0.8 + r() * 0.35); }
    } else if (cls === 14) { // vineyard rows along the angle
      const ca = Math.cos(A.ang || 0), sa = Math.sin(A.ang || 0);
      for (let v = -400; v < 400; v += 2.6) for (let u = -400; u < 400; u += 2.2) {
        const cx0 = (bb[0] + bb[2]) / 2, cz0 = (bb[1] + bb[3]) / 2, x = cx0 + u * ca - v * sa, z = cz0 + u * sa + v * ca;
        if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) continue;
        if (inPoly(x, z)) pr.put('vine', x, z, lineRot(ca, sa), 1);
      }
    } else if (cls === 16) { // herb garden + bee skeps
      for (let z = bb[1] + 1.5; z < bb[3]; z += 3) for (let x = bb[0] + 1.5; x < bb[2]; x += 3) if (inPoly(x, z)) pr.put('herbs', x, z, 0, 0.9 + r() * 0.2);
      sample(1 + Math.floor(r() * 3), (x, z) => pr.put('skep', x, z, r() * TAU, 1));
    } else if (cls >= 6 && cls <= 9) { // cereals: stooks (always placed)
      sample(2 + Math.floor(r() * 5), (x, z) => pr.put('stook', x, z, r() * TAU, 0.9 + r() * 0.2));
    } else if (cls === 12 && r() < 0.35) sample(1, (x, z) => pr.put('haystack', x, z, r() * TAU, 0.9 + r() * 0.2));
    if (A.extra && A.extra.edges) { // field borders
      const e = A.extra.edges;
      for (let i = 0; i + 3 < e.length; i += 4) {
        const t = e[i + 3];
        if (t === 3) pr.put('oak', e[i], e[i + 1], e[i + 2], 0.8 + r() * 0.3);
        else pr.put(t === 1 ? 'drystone' : t === 2 ? 'wattle' : 'hedge', e[i], e[i + 1], e[i + 2], t === 0 ? 1.35 : 1);
      }
    }
    if (sq && P.origin && P.origin.kind === 'market' && P.origin.L && pip(poly, P.origin.x, P.origin.z)) {
      // market stalls down both sides of the spindle, barrels and crates between them
      const o0 = P.origin, ax = o0.ax, az = o0.az, px = -az, pz = ax;
      const cnt = 4 + Math.round(6 * tw.wealth);
      const blockers = P.specials.filter(s2 => s2.kind === 'markethall' || s2.kind === 'marketcross');
      let si = 0;
      for (let i = 0; i < cnt; i++) {
        const u = (-0.34 + 0.68 * (i + 0.5) / cnt) * o0.L, side = i % 2 ? 1 : -1;
        const hwl = o0.Wd / 2 * Math.pow(Math.max(0, 1 - (2 * u / o0.L) * (2 * u / o0.L)), 0.7);
        const v = side * (hwl - 3.2); if (Math.abs(v) < 7) continue;
        const x = o0.x + ax * u + px * v, z = o0.z + az * u + pz * v;
        if (blockers.some(b => Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) / 2 + 4)) continue;
        const nx = -px * side, nz = -pz * side; // front faces the spindle axis
        const rec = kdesign('stall', x, z, Math.atan2(-nx, -nz), { w: 3.2, d: 2.4, wealth: tw.wealth, region, seed: hash32(S.seed, A.key, 'st', i) });
        bldItem(A.key + ':st' + (si++), A.key + ':st' + (si - 1), A.o + 0.5, A.cell, rec);
        if (r() < 0.6) pr.put(r() < 0.5 ? 'barrels' : 'crates', x + px * side * 2.2 + ax * 1.8, z + pz * side * 2.2 + az * 1.8, r() * TAU, 1);
      }
    }
    propsItem(A.key + ':p', A.pk || A.key, A.o + 0.5, A.cell, pr);
  }
  // ---- plots ---------------------------------------------------------------------------------------------
  const ph = new PtHash(16);
  for (const p of P.plots) ph.add(p);
  const o12 = (() => { const hs = P.plots.filter(p => p.role === 'house').map(p => p.o).sort((a, b) => a - b); return hs.length >= 12 ? hs[11] : -1; })();
  for (const p of P.plots) {
    const r = rngFor(S.seed, p.key, 'deco');
    let wl = clamp(tw.wealth + p.wq + biasB(p.cell) * 0.45, 0, 1);
    if (wall && p.o > P.wallO) {
      if (wall.pomerium(p)) continue;                        // no building in the wall's inner band
      if (!wall.inside(p.x, p.z)) wl = Math.max(0, wl - 0.2); // faubourg outside the gate
    }
    let party = 0;
    if (p.town) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      for (const sd of [-1, 1]) {
        const lx = sd * (p.w / 2 + 0.3), x = p.x + lx * c, z = p.z - lx * s;
        let hit = false; ph.query(x, z, 24, o => { if (o !== p && o.town && pointInB(o, x, z, 0.05)) { hit = true; return false; } });
        if (hit) party |= sd < 0 ? 1 : 2;
      }
    }
    const gable = p.town && r() < (style.gableBias || 0.5) ? 'street' : 'side';
    const mk = (w0, suffix, o, endO) => {
      const kind = plotKind(p, w0, r, region);
      let floors = 1, jetty = 0, trade;
      if (kind === 'timberhouse') { floors = p.town ? (r() < 0.3 + 0.3 * tw.dens ? 3 : 2) : w0 < 0.5 ? (r() < 0.35 ? 2 : r() < 0.4 ? 1.5 : 1) : r() < 0.2 ? 1.5 : 2; jetty = floors > 1.5 && (p.town || r() < 0.3) ? 1 : 0; }
      else if (kind === 'townhouse') { floors = 3 + (r() < tw.dens ? 1 : 0) - (r() < 0.25 ? 1 : 0); jetty = 1; }
      else if (kind === 'stonehouse') floors = p.town ? 2 + (r() < 0.35 ? 1 : 0) : w0 > 0.7 ? 2 : r() < 0.4 ? 2 : r() < 0.3 ? 1.5 : 1;
      else if (kind === 'cottage') floors = r() < 0.3 ? 1.5 : 1;
      else if (kind === 'shop') { floors = 2; jetty = 1; trade = TRADES[Math.floor(r() * TRADES.length)]; }
      else if (kind === 'farmhouse') floors = w0 > 0.5 ? 2 : 1;
      else if (kind === 'storehouse') floors = 3;
      const rec = kdesign(kind, p.x, p.z, p.rot, { w: p.w, d: p.d, wealth: w0, age: r(), density: tw.dens, region, seed: hash32(S.seed, p.key, suffix || ''), gable, party, jetty, floors, trade });
      const it = bldItem(p.key + (suffix || ''), p.key, o, p.cell, rec);
      if (endO !== undefined) it.endO = endO;
      return it;
    };
    if (p.role === 'house' && wl > 0.55 && r() < 0.4) {
      const o2 = p.o + 0.6 * ((p.nE !== undefined ? p.nE : n) - p.o);
      mk(Math.max(0, wl - 0.35), ':v1', p.o, o2); mk(wl, ':v2', o2);
    } else mk(wl, '', p.o);
    // yard + garden ground, props
    const s = Math.sin(p.rot), c = Math.cos(p.rot), s0 = s, c0 = c;
    const pr = new Props(p.key);
    const pbox = { x: p.x, z: p.z, rot: p.rot, w: p.w, d: p.d };
    let obD = 0;
    if (p.role === 'house' && p.yardD > 5.5 && p.frontW >= 4.5 && r() < (p.town ? 0.55 : 0.7) * (0.65 + 0.5 * tw.dens)) {
      const v = p.town ? (r() < 0.6 ? 0 : 1) : (() => { const x = r(); return x < 0.34 ? 0 : x < 0.62 ? 1 : x < 0.8 ? 2 : 3; })();
      const ow = clamp(p.frontW * (0.42 + r() * 0.3), 3, v === 2 ? 6.5 : 5.5);
      const od = v === 3 ? clamp(p.yardD * 0.45, 3.6, 5) : clamp(2.6 + r() * 1.8, 2.5, Math.min(4.6, p.yardD - 2.6));
      const lx = (r() - 0.5) * Math.max(0, p.frontW - ow - 1.2), lz = p.d / 2 + p.yardD - od / 2 - 0.45;
      const ox = p.x + lx * c0 + lz * s0, oz = p.z - lx * s0 + lz * c0;
      const rec = kdesign('shed', ox, oz, p.rot, { w: ow, d: od, wealth: clamp(wl * 0.85, 0, 1), age: r(), region, seed: hash32(S.seed, p.key, 'ob'), var: v });
      bldItem(p.key + ':ob', p.key, p.o + 0.45, p.cell, rec);
      obD = od + 0.6;
    }
    if (p.yardD > 2) {
      const yd = Math.min(6, p.yardD * 0.35), yo = p.d / 2 + yd / 2;
      add({ t: 'area', key: p.key + ':y', pk: p.key, o: p.o + 0.3, cell: p.cell, cls: 1, poly: rectPoly(p.x + s * yo, p.z + c * yo, p.rot, p.frontW * 0.9, yd), ang: p.rot, rf: 0, vr: hash32(p.key) & 3, bb: null });
      items[items.length - 1].bb = bboxOf(items[items.length - 1].poly, 1);
      let garden = null;
      if (tw.gardens > 0.3 && r() < 0.45 && p.yardD - yd - obD > 4) {
        const gd = Math.min(p.yardD - yd - 1.5 - obD, 14), go = p.d / 2 + yd + 0.8 + gd / 2;
        garden = { x: p.x + s * go, z: p.z + c * go, rot: p.rot, w: p.frontW * 0.7, d: gd };
        const gp = rectPoly(garden.x, garden.z, garden.rot, garden.w, garden.d);
        add({ t: 'area', key: p.key + ':g', pk: p.key, o: p.o + 0.35, cell: p.cell, cls: 2, poly: gp, ang: p.rot + PI / 2, rf: 0, vr: hash32(p.key, 'g') & 3, bb: bboxOf(gp, 1) });
        const rows = Math.max(2, Math.floor(gd / 2.2));
        for (let i = 0; i < rows; i++) { const lz = -gd / 2 + (i + 0.5) * gd / rows; for (let lx = -garden.w / 2 + 1; lx < garden.w / 2 - 0.5; lx += 2.5) if (r() < 0.7) pr.put('veg', garden.x + lx * c + lz * s, garden.z - lx * s + lz * c, lineRot(c, -s), 1); }
      }
      const toW = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      const y0 = p.d / 2, y1 = p.d / 2 + p.yardD;
      if (p.role === 'house' && p.yardD > 5 && r() < 0.72) { // plot lines: right side + back (the neighbour fences the other side)
        const stoneL = region === 1 || region === 2;
        const kf = p.town ? (stoneL && r() < 0.6 ? 'drystone' : 'wattle') : (r() < 0.45 ? 'hedge' : stoneL && r() < 0.5 ? 'drystone' : 'wattle');
        const hwF = p.frontW / 2 - 0.3, stF = kf === 'hedge' ? 2.4 : 3, scF = kf === 'hedge' ? 1.2 : 1;
        for (let lz = y0 + 1.5; lz < y1 - 0.5; lz += stF) { const [x, z] = toW(hwF, lz); pr.put(kf, x, z, lineRot(s, c), scF); }
        if (r() < 0.8) for (let lx = -hwF + 1; lx < hwF; lx += stF) { const [x, z] = toW(lx, y1 - 0.4); pr.put(kf, x, z, lineRot(c, -s), scF); }
      }
      // the croft: the rear of a deep plot as paddock, hay meadow or orchard grass
      const usedY = yd + (garden ? garden.d + 0.8 : 0), rest = p.yardD - usedY - obD - 1;
      if (p.role === 'house' && rest > 6 && r() < 0.6) {
        const co = p.d / 2 + usedY + 0.5 + rest / 2, x0 = r(), ccls = x0 < 0.45 ? 11 : x0 < 0.75 ? 12 : 13;
        const cp = rectPoly(p.x + s * co, p.z + c * co, p.rot, p.frontW * 0.92, rest);
        add({ t: 'area', key: p.key + ':c', pk: p.key, o: p.o + 0.4, cell: p.cell, cls: ccls, poly: cp, ang: p.rot, rf: 0, vr: hash32(p.key, 'c') & 3, bb: bboxOf(cp, 1) });
      }
      const nt = r() < tw.gardens ? 1 + (r() < 0.4 ? 1 : 0) : 0;
      for (let i = 0; i < nt; i++) { const yl = Math.max(2, p.yardD - obD); const [x, z] = toW((r() - 0.5) * (p.frontW - 3), y0 + yl * (0.5 + 0.42 * r())); pr.put(r() < 0.6 ? 'apple' : 'pear', x, z, r() * TAU, 0.8 + r() * 0.3); }
      if (r() < 0.6) { const [x, z] = toW((r() < 0.5 ? -1 : 1) * (p.w / 2 - 1), y0 + 1.4); pr.put('woodpile', x, z, lineRot(c, -s), 1); }
      if (p.town && r() < 0.3) { const [x, z] = toW((r() - 0.5) * p.frontW * 0.6, y0 + 2); pr.put(r() < 0.5 ? 'barrels' : 'crates', x, z, r() * TAU, 1); }
    }
    if (r() < 0.1 && p.role !== 'cloister') { const lx = (p.w / 2 + 1.6) * (r() < 0.5 ? -1 : 1), lz = -p.d / 2 + 1; pr.put('cart', p.x + lx * c + lz * s, p.z - lx * s + lz * c, p.rot + (r() - 0.5), 1); }
    if (p.role === 'harbour') { for (let i = 0; i < 2; i++) { const lx = (r() - 0.5) * p.w, lz = -p.d / 2 - 2 - r() * 2; pr.put(i ? (r() < 0.5 ? 'barrels' : 'crates') : 'netrack', p.x + lx * c + lz * s, p.z - lx * s + lz * c, p.rot + PI / 2, 1); } }
    if (p.role === 'farm') { for (let i = 0; i < 1 + Math.floor(r() * 3); i++) { const lx = (r() - 0.5) * 30, lz = p.d / 2 + 14 + r() * 10; pr.put('haystack', p.x + lx * c + lz * s, p.z - lx * s + lz * c, r() * TAU, 0.9 + r() * 0.2); } }
    propsItem(p.key + ':p', p.key, p.o + 0.5, p.cell, pr, pbox);
  }
  // ---- specials ----------------------------------------------------------------------------------------
  for (const sp of P.specials) {
    const ex = sp.extra || {}, r = rngFor(S.seed, sp.key, 'sp');
    const wl = clamp(tw.wealth + biasB(sp.cell) * 0.3, 0, 1);
    if (sp.kind === 'curtain' || sp.kind === 'precinct') {
      const loop = toF32(ex.loop || []); if (loop.length < 6) continue;
      const planned = ex.wallKind === 'palisade' ? 'palisade' : 'stone';
      let kind = sp.kind === 'precinct' ? 'stone' : planned, h = sp.kind === 'precinct' ? 3.2 : (ex.h || (kind === 'stone' ? 8 + 3 * wl : 4 + 1.5 * wl));
      // castles: the Walls / Wealth tweaks re-decorate the outer curtain (palisade ↔ stone), like the planner's choice
      if (P.type === 3 && sp.kind === 'curtain' && isOuterCurtain(P, sp)) {
        const want = tw.walls !== 'none' ? tw.walls : tw.wealth < 0.35 ? 'palisade' : 'stone';
        if (want !== planned) { kind = want; h = kind === 'stone' ? 7.5 + 3.5 * tw.wealth : 3.6 + 1.4 * tw.wealth; }
      }
      const spec = { kind, h, wealth: wl, seed: hash32(S.seed, sp.key), gates: (ex.gates || []).map(g => ({ x: g.x, z: g.z, kind: g.kind === 'postern' ? 'postern' : 'gatehouse' })) };
      if (sp.kind === 'precinct') spec.towerSpacing = 1e6;
      let recs = [];
      try { recs = K2.wallRun ? (K2.wallRun(toPairs(loop), spec) || []) : []; } catch (e) { console.warn('[town] wallRun failed', e); }
      if (sp.kind === 'precinct') { // a gatehouse special stands on the precinct gate: drop the postern Kit made there
        const ghs = P.specials.filter(s2 => s2.kind === 'gatehouse');
        if (ghs.length) recs = recs.filter(rc => !(rc.kind === 'postern' && ghs.some(g => Math.hypot(g.x - rc.x, g.z - rc.z) < 8)));
      }
      recs.forEach((rec, i) => { if (!rec.seed) rec.seed = hash32(S.seed, sp.key, i); bldItem(sp.key + ':w' + i, sp.key + ':w' + i, sp.o + 0.9 * (i + 1) / (recs.length + 1), cellFor(rec.x, rec.z, sp.cell), rec, { wall: kind, wallStart: i === 0 }); });
      if (sp.kind === 'curtain') { const pr = new Props(sp.key); for (const g of spec.gates) for (const sd of [-1, 1]) pr.put('torchpost', g.x + sd * 5, g.z + sd * 1.5, 0, 1); propsItem(sp.key + ':p', sp.key, sp.o + 0.95, sp.cell, pr); }
      continue;
    }
    if (sp.kind === 'pierline') {
      const pts = toF32(ex.pts || []); if (pts.length < 4) continue;
      let recs = [];
      try { recs = K2.pierRun ? (K2.pierRun(toPairs(pts), { wealth: wl, seed: hash32(S.seed, sp.key) }) || []) : []; } catch (e) { console.warn('[town] pierRun failed', e); }
      recs.forEach((rec, i) => { if (!rec.seed) rec.seed = hash32(S.seed, sp.key, i); bldItem(sp.key + ':k' + i, sp.key, sp.o + 0.9 * (i + 1) / (recs.length + 1), cellFor(pts[0], pts[1], sp.cell), rec, { pier: 1, supp: false }); });
      continue;
    }
    if (sp.kind === 'greatwork') { // a great work (Living History §3.8): the building itself; works.js drives its climb
      const gw = ex.wid | 0, wkind = ex.work === 'keep' ? 'keep' : 'cathedral';
      const rec = kdesign(wkind, sp.x, sp.z, sp.rot || 0, { w: ex.w || sp.w, d: ex.d || sp.d, wealth: Math.max(wl, 0.6), age: r(), density: tw.dens, region, seed: hash32(S.seed, sp.key), var: 0, orient: 'east', gw });
      rec.gw = gw;
      bldItem(sp.key, sp.key, sp.o, sp.cell, rec, { sp: 1, gw });
      continue;
    }
    const isChurch = ex.ms === 'church' && (sp.kind === 'church' || sp.kind === 'chapel');
    if (isChurch) {
      const H = houseCount;
      // a work cathedral (a great work) replaces the legacy "big rich town upgrades its church" rule
      let cls = sp.kind === 'chapel' || H < 25 ? 'chapel' : H < 90 ? 'church' : (H >= 300 && tw.wealth > 0.7 && !hasGW) ? 'cathedral' : 'church';
      const vr = H < 90 ? (style.churchStyle || 0) % 2 : 2;
      const des = (kind, w, d, suffix) => kdesign(kind, sp.x, sp.z, sp.rot, { w, d, wealth: wl, age: r(), density: tw.dens, region, seed: hash32(S.seed, sp.key, suffix), var: kind === 'church' ? vr : sp.var, orient: 'east' });
      if (cls === 'chapel') bldItem(sp.key, sp.key, sp.o, sp.cell, des('chapel', Math.min(9, sp.w), Math.min(16, sp.d), ''), { sp: 1 });
      else {
        const oS = sp.o + 0.45 * ((sp.nE !== undefined ? sp.nE : n) - sp.o);
        const a = bldItem(sp.key + ':v1', sp.key, sp.o, sp.cell, des('chapel', Math.min(9, sp.w), Math.min(16, sp.d), ':v1'), { sp: 1 }); a.endO = oS;
        bldItem(sp.key + ':v2', sp.key, oS, sp.cell, des(cls, sp.w, sp.d, ':v2'), { sp: 1 });
      }
      continue;
    }
    const opts = { w: sp.w || undefined, d: sp.d || undefined, wealth: wl, age: r(), density: tw.dens, region, seed: hash32(S.seed, sp.key), var: sp.var || 0 };
    if (sp.h) opts.h = sp.h;
    let spKind = sp.kind;
    // castles: the Wealth tweak renovates the keep (motte + tower < .35 ≤ square keep < .7 ≤ round keep)
    if (P.type === 3 && (spKind === 'keep' || spKind === 'motte') && P.origin && Math.hypot(sp.x - P.origin.x, sp.z - P.origin.z) < 1) {
      const kw = tw.wealth;
      if (kw < 0.35 && spKind === 'keep') { spKind = 'motte'; opts.h = 8 + 4 * h01(S.seed, sp.key, 'mh'); opts.var = 0; }
      else if (kw >= 0.35 && spKind === 'motte') { spKind = 'keep'; opts.w = opts.d = Math.min(sp.w || 18, 15 + 6 * kw); delete opts.h; }
      if (spKind === 'keep') opts.var = kw >= 0.7 ? 1 : 0;
      // a stone-keep great work (works.js) replaces the motte whatever the wealth; decoKey carries Works.ver
      let wk = null; try { wk = D.Works && D.Works.workAt ? D.Works.workAt(uid, 'keep') : null; } catch (e) { wk = null; }
      if (wk) { if (spKind === 'motte') { opts.w = opts.d = Math.min(sp.w || 18, 15 + 6 * Math.max(kw, 0.35)); delete opts.h; } spKind = 'keep'; opts.var = wk.var | 0; opts.gw = wk.wid; }
    }
    if (ex.water) opts.water = ex.water;
    if (ex.orient) opts.orient = ex.orient;
    if (ex.floors) opts.floors = ex.floors;
    if (ex.trade) opts.trade = ex.trade;
    const rec = kdesign(spKind, sp.x, sp.z, sp.rot || 0, opts);
    if (opts.gw) rec.gw = opts.gw;
    bldItem(sp.key, sp.key, sp.o, sp.cell, rec, { sp: 1, supp: sp.kind === 'bridge' ? false : undefined });
    // small props beside some specials
    const pr = new Props(sp.key), c = Math.cos(sp.rot || 0), s = Math.sin(sp.rot || 0);
    const at = (lx, lz) => [sp.x + lx * c + lz * s, sp.z - lx * s + lz * c];
    if (sp.kind === 'barn') { const nh = 1 + Math.floor(r() * 3); for (let i = 0; i < nh; i++) { const [x, z] = at((r() - 0.5) * sp.w, sp.d / 2 + 5 + r() * 6); pr.put('haystack', x, z, r() * TAU, 0.9 + r() * 0.2); } if (r() < 0.5) { const [x, z] = at(sp.w / 2 + 2, -sp.d / 2); pr.put('cart', x, z, sp.rot, 1); } }
    else if (sp.kind === 'tavern') { for (let i = 0; i < 2; i++) { const [x, z] = at((i ? 1 : -1) * (sp.w / 2 - 1), -sp.d / 2 - 1.2); pr.put('barrels', x, z, r() * TAU, 1); } }
    else if (sp.kind === 'smithy') { const [x, z] = at(-sp.w / 2 - 1.5, 1); pr.put('woodpile', x, z, sp.rot, 1); }
    else if (sp.kind === 'watermill' || sp.kind === 'storehouse' || sp.kind === 'granary') { const [x, z] = at(-sp.w / 2 - 1.5, -sp.d / 2 + 1); pr.put('crates', x, z, r() * TAU, 1); }
    else if (sp.kind === 'fishhut' || sp.kind === 'boathouse') { const [x, z] = at(sp.w / 2 + 2, 0); pr.put('netrack', x, z, sp.rot + PI / 2, 1); }
    propsItem(sp.key + ':p', sp.key, sp.o + 0.5, sp.cell, pr);
  }
  // ---- village walls -------------------------------------------------------------------------------------
  if (wall) {
    const addRun = (loop, kind, oBase, endO) => {
      const tag = kind === 'stone' ? 's' : 'p';
      const h = kind === 'stone' ? 6.5 + 3 * tw.wealth : 3.5 + 1.5 * tw.wealth;
      let recs = [];
      try { recs = K2.wallRun ? (K2.wallRun(toPairs(loop), { kind, h, wealth: tw.wealth, seed: hash32(S.seed, 'wall', kind), gates: wall.gates.map(g => ({ x: g.x, z: g.z, kind: g.kind })) }) || []) : []; } catch (e) { console.warn('[town] wallRun failed', e); }
      const oc = cellK(P.origin.x, P.origin.z);
      recs.forEach((rec, i) => {
        if (!rec.seed) rec.seed = hash32(S.seed, 'wall', kind, i);
        const it = bldItem(uid + ':W:' + tag + i, uid + ':W:' + tag + i, oBase + 0.9 * (i + 1) / (recs.length + 1), cellFor(rec.x, rec.z, oc), rec, { wall: kind, wallStart: i === 0 });
        if (endO !== undefined) it.endO = endO;
      });
    };
    if (tw.walls === 'palisade') addRun(wall.loopP, 'palisade', o12 >= 0 ? o12 : P.wallO);
    else { if (o12 >= 0 && o12 < P.wallO) addRun(wall.loopP, 'palisade', o12, P.wallO); addRun(wall.loop, 'stone', P.wallO); }
  }
  items.sort((a, b) => a.o - b.o || a.q - b.q);
  const byKey = new Map();
  items.forEach((it, i) => { it.i = i; byKey.set(it.key, it); });
  let bb = null;
  for (const it of items) if (it.bb) { if (!bb) bb = it.bb.slice(); else { if (it.bb[0] < bb[0]) bb[0] = it.bb[0]; if (it.bb[1] < bb[1]) bb[1] = it.bb[1]; if (it.bb[2] > bb[2]) bb[2] = it.bb[2]; if (it.bb[3] > bb[3]) bb[3] = it.bb[3]; } }
  return { items, byKey, wall, n: P.n, origin: P.origin, type: P.type, sid: S.id, bb: bb || [P.origin.x - 50, P.origin.z - 50, P.origin.x + 50, P.origin.z + 50], houses: houseCount };
}
// the largest curtain loop of a castle plan (the inner ring of a concentric castle stays stone)
const outerCurtainCache = new WeakMap();
function isOuterCurtain(P, sp) {
  let o = outerCurtainCache.get(P);
  if (o === undefined) {
    o = null; let ba = -1;
    for (const s2 of P.specials) if (s2.kind === 'curtain' && s2.extra && s2.extra.loop) { const a = Math.abs(polyArea(toF32(s2.extra.loop))); if (a > ba) { ba = a; o = s2; } }
    outerCurtainCache.set(P, o);
  }
  return o === sp;
}
function propsBB(arr) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < arr.length; i += 7) { const x = arr[i], z = arr[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0 - 4, z0 - 4, x1 + 4, z1 + 4]; }
function plotKind(p, wl, r, region) {
  if (p.role === 'farm') return 'farmhouse';
  if (p.role === 'harbour') return wl > 0.5 && r() < 0.45 ? 'storehouse' : 'fishhut';
  if (p.role === 'cloister') return 'range';
  if (p.role === 'bailey') return wl > 0.5 ? 'stonehouse' : 'timberhouse';
  const x = r(), stoneLand = region === 1 || region === 2;
  if (p.town) {
    if (p.mkt && x < 0.35) return 'shop';
    if (p.rank === 0 && x < 0.14) return 'shop';
    if (wl < 0.3) return x < 0.72 ? 'timberhouse' : 'cottage';
    if (wl < 0.62) return x < 0.52 ? 'timberhouse' : x < 0.8 ? 'townhouse' : stoneLand ? 'stonehouse' : 'shop';
    return x < 0.55 ? 'townhouse' : x < 0.82 ? 'stonehouse' : 'timberhouse';
  }
  if (wl < 0.22) return x < 0.18 ? 'longhouse' : 'cottage';
  if (wl < 0.45) return x < 0.34 ? 'cottage' : x < (stoneLand ? 0.62 : 0.86) ? 'timberhouse' : 'stonehouse';
  if (wl < 0.7) return x < 0.5 ? (stoneLand ? 'stonehouse' : 'timberhouse') : x < 0.82 ? 'timberhouse' : x < 0.92 ? 'stonehouse' : 'cottage';
  return x < 0.55 ? 'stonehouse' : 'timberhouse';
}

// ---- the village wall: raster the core, dilate/erode, trace, crest-snap, gates, pomerium ---------------
function villageWall(S, P, tw) {
  const core = P.plots.filter(p => p.o < P.wallO && p.role === 'house');
  if (core.length < 12) return null;
  const G = 4;
  let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9;
  for (const p of core) { bx0 = Math.min(bx0, p.x); bz0 = Math.min(bz0, p.z); bx1 = Math.max(bx1, p.x); bz1 = Math.max(bz1, p.z); }
  bx0 -= 90; bz0 -= 90; bx1 += 90; bz1 += 90;
  let w = Math.ceil((bx1 - bx0) / G), h = Math.ceil((bz1 - bz0) / G);
  if (w * h > 1200 * 1200) return null;
  const m = new Uint8Array(w * h);
  const fillPoly = poly => {
    const b = bboxOf(poly, 0), xs = [];
    for (let j = Math.max(0, Math.floor((b[1] - bz0) / G)); j <= Math.min(h - 1, Math.floor((b[3] - bz0) / G)); j++) {
      scanX(poly, bz0 + (j + 0.5) * G, xs);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q] - bx0) / G - 0.5)); i <= Math.min(w - 1, Math.floor((xs[q + 1] - bx0) / G - 0.5)); i++) m[j * w + i] = 1;
    }
  };
  for (const p of core) {
    const s = Math.sin(p.rot), c = Math.cos(p.rot), dep = p.d + (p.yardD || 0);
    fillPoly(rectPoly(p.x + s * (dep / 2 - p.d / 2), p.z + c * (dep / 2 - p.d / 2), p.rot, Math.max(p.frontW || p.w, p.w), dep));
  }
  for (const A of P.areas) if (A.o < P.wallO && (A.cls === 'square' || A.cls === 3 || A.cls === 4)) fillPoly(A.poly);
  for (const sp of P.specials) if (sp.o < P.wallO && !GENERIC_SPECIAL[sp.kind] && sp.kind !== 'windmill' && sp.kind !== 'watermill') fillPoly(rectPoly(sp.x, sp.z, sp.rot, sp.w, sp.d));
  // dilate 14 m, erode 9 m
  const dOut = chamfer(m, w, h, G, 1);
  const dil = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) dil[k] = dOut[k] <= 14 ? 1 : 0;
  const dIn = chamfer(dil, w, h, G, 0);
  const ero = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) ero[k] = dil[k] && dIn[k] > 9 ? 1 : 0;
  // component containing the origin (else the largest), holes filled
  const comp = new Uint8Array(w * h), stack = [];
  const flood = (k0, src, dst, val) => { stack.length = 0; stack.push(k0); dst[k0] = val; let c = 0; const push = nk => { if (src[nk] && !dst[nk]) { dst[nk] = val; stack.push(nk); } }; while (stack.length) { const k = stack.pop(); c++; const i = k % w; if (i + 1 < w) push(k + 1); if (i > 0) push(k - 1); if (k + w < w * h) push(k + w); if (k >= w) push(k - w); } return c; };
  const oi = Math.floor((P.origin.x - bx0) / G), oj = Math.floor((P.origin.z - bz0) / G);
  let seedK = oi >= 0 && oj >= 0 && oi < w && oj < h && ero[oj * w + oi] ? oj * w + oi : -1;
  if (seedK < 0) {
    const lab = new Uint8Array(w * h); let best = -1, bc = 0;
    for (let k = 0; k < w * h; k++) if (ero[k] && !lab[k]) { const c = flood(k, ero, lab, 1); if (c > bc) { bc = c; best = k; } }
    seedK = best;
  }
  if (seedK < 0) return null;
  flood(seedK, ero, comp, 1);
  const notComp = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) notComp[k] = comp[k] ? 0 : 1;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w; i++) { if (notComp[i] && !outside[i]) flood(i, notComp, outside, 1); const k = (h - 1) * w + i; if (notComp[k] && !outside[k]) flood(k, notComp, outside, 1); }
  for (let j = 0; j < h; j++) { const a = j * w, b = j * w + w - 1; if (notComp[a] && !outside[a]) flood(a, notComp, outside, 1); if (notComp[b] && !outside[b]) flood(b, notComp, outside, 1); }
  const town = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) town[k] = outside[k] ? 0 : 1;
  const dT = chamfer(town, w, h, G, 1);
  const trace = off => {
    const mk = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) mk[k] = dT[k] <= off ? 1 : 0;
    const loops = traceMaskLoops(mk, w, h, bx0, bz0, G); if (!loops.length) return null;
    let loop = chaikin(dpSimplify(loops[0], 4, true), 1, true);
    loop = crestSnap(S, loop, (x, z) => { const i = Math.floor((x - bx0) / G), j = Math.floor((z - bz0) / G); return i >= 0 && j >= 0 && i < w && j < h && dT[j * w + i] <= 2; });
    return loop;
  };
  const loop = trace(tw.walls === 'stone' ? 8 : 4), loopP = tw.walls === 'stone' ? trace(4) : loop;
  if (!loop || loop.length < 12) return null;
  // gates: lanes of rank ≤ 1 and manual roads crossing the loop
  const gates = [];
  const nL = loop.length >> 1, lbb = bboxOf(loop, 2);
  const LI = loopIndex(loop);
  const cross = (ax, az, bx, bz, kind, pri) => LI.cross(ax, az, bx, bz, (x, z) => gates.push({ x, z, kind, pri }));
  for (const L of P.lanes) {
    if (L.rank > 1) continue;
    const p = L.pts, b = bboxOf(p, 0); if (b[2] < lbb[0] || b[0] > lbb[2] || b[3] < lbb[1] || b[1] > lbb[3]) continue;
    for (let q = 0; q + 3 < p.length; q += 2) cross(p[q], p[q + 1], p[q + 2], p[q + 3], L.rank === 0 ? 'gatehouse' : 'postern', L.rank === 0 ? 2 : 1);
  }
  if (D.Roads && D.Roads.segs) Array.from(D.Roads.segs.values()).sort((a, b) => a.id - b.id).forEach(seg => {
    let S2; try { S2 = D.Roads.segSamples(seg); } catch (e) { return; }
    if (!S2) return;
    for (let q = 0; q + 1 < S2.n; q++) { const ax = S2.x[q], az = S2.z[q]; if (ax < lbb[0] - 20 || ax > lbb[2] + 20 || az < lbb[1] - 20 || az > lbb[3] + 20) continue; cross(ax, az, S2.x[q + 1], S2.z[q + 1], 'gatehouse', 3); }
  });
  gates.sort((a, b) => b.pri - a.pri || a.x - b.x || a.z - b.z);
  const merged = [];
  for (const g of gates) if (!merged.some(o => Math.hypot(o.x - g.x, o.z - g.z) < 35)) merged.push({ x: g.x, z: g.z, kind: g.kind });
  // wall mask raster (2 m) for lane stamping, pomerium test
  const band = tw.walls === 'stone' ? 8 : 3;
  const wmX0 = lbb[0] - 6, wmZ0 = lbb[1] - 6, wmW = Math.ceil((lbb[2] - lbb[0] + 12) / 2), wmH = Math.ceil((lbb[3] - lbb[1] + 12) / 2);
  const wm = wmW * wmH < 6e6 ? new Uint8Array(wmW * wmH) : null;
  if (wm) {
    for (let i = 0; i < nL; i++) {
      const j = (i + 1) % nL, ax = loop[i * 2], az = loop[i * 2 + 1], bx = loop[j * 2], bz = loop[j * 2 + 1];
      const i0 = Math.floor((Math.min(ax, bx) - 3 - wmX0) / 2), i1 = Math.floor((Math.max(ax, bx) + 3 - wmX0) / 2), j0 = Math.floor((Math.min(az, bz) - 3 - wmZ0) / 2), j1 = Math.floor((Math.max(az, bz) + 3 - wmZ0) / 2);
      for (let jj = Math.max(0, j0); jj <= Math.min(wmH - 1, j1); jj++) for (let ii = Math.max(0, i0); ii <= Math.min(wmW - 1, i1); ii++) if (segDist2(wmX0 + (ii + 0.5) * 2, wmZ0 + (jj + 0.5) * 2, ax, az, bx, bz) < 9) wm[jj * wmW + ii] = 1;
    }
    for (const g of merged) { const r = g.kind === 'gatehouse' ? 11 : 5; for (let jj = Math.floor((g.z - r - wmZ0) / 2); jj <= Math.floor((g.z + r - wmZ0) / 2); jj++) for (let ii = Math.floor((g.x - r - wmX0) / 2); ii <= Math.floor((g.x + r - wmX0) / 2); ii++) if (ii >= 0 && jj >= 0 && ii < wmW && jj < wmH) wm[jj * wmW + ii] = 0; }
  }
  const mask = (x, z) => { if (!wm) return false; const i = Math.floor((x - wmX0) / 2), j = Math.floor((z - wmZ0) / 2); return i >= 0 && j >= 0 && i < wmW && j < wmH && wm[j * wmW + i] === 1; };
  const pomerium = p => {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const lx = a * p.w / 2, lz = b * p.d / 2, x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
      const d = LI.dist(x, z, 12);
      if (d < 2.5) return true;
      if (d < band && LI.inside(x, z)) return true;
    }
    return false;
  };
  return { loop, loopP: loopP || loop, gates: merged, mask, pomerium, band, inside: LI.inside };
}
// bucketed index over a closed loop: exact distance, crossings and a raster inside test
function loopIndex(loop) {
  const n = loop.length >> 1, B = 32, bb = bboxOf(loop, 16);
  const bw = Math.max(1, Math.ceil((bb[2] - bb[0]) / B)), bh = Math.max(1, Math.ceil((bb[3] - bb[1]) / B));
  const cells = new Array(bw * bh);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = loop[i * 2], az = loop[i * 2 + 1], bx = loop[j * 2], bz = loop[j * 2 + 1];
    const i0 = Math.floor((Math.min(ax, bx) - bb[0]) / B), i1 = Math.floor((Math.max(ax, bx) - bb[0]) / B), j0 = Math.floor((Math.min(az, bz) - bb[1]) / B), j1 = Math.floor((Math.max(az, bz) - bb[1]) / B);
    for (let q = j0; q <= j1; q++) for (let p = i0; p <= i1; p++) { const k = q * bw + p; (cells[k] || (cells[k] = [])).push(i); }
  }
  // inside raster (4 m)
  const G = 4, gw = Math.ceil((bb[2] - bb[0]) / G), gh = Math.ceil((bb[3] - bb[1]) / G), ins = new Uint8Array(gw * gh), xs = [];
  for (let q = 0; q < gh; q++) { scanX(loop, bb[1] + (q + 0.5) * G, xs); for (let t = 0; t + 1 < xs.length; t += 2) for (let p = Math.max(0, Math.ceil((xs[t] - bb[0]) / G - 0.5)); p <= Math.min(gw - 1, Math.floor((xs[t + 1] - bb[0]) / G - 0.5)); p++) ins[q * gw + p] = 1; }
  const stamp = new Int32Array(n); let gen = 0;
  const near = (x0, z0, x1, z1, fn) => {
    gen++;
    const i0 = clamp(Math.floor((x0 - bb[0]) / B), 0, bw - 1), i1 = clamp(Math.floor((x1 - bb[0]) / B), 0, bw - 1), j0 = clamp(Math.floor((z0 - bb[1]) / B), 0, bh - 1), j1 = clamp(Math.floor((z1 - bb[1]) / B), 0, bh - 1);
    if (x1 < bb[0] || x0 > bb[2] || z1 < bb[1] || z0 > bb[3]) return;
    for (let q = j0; q <= j1; q++) for (let p = i0; p <= i1; p++) { const a = cells[q * bw + p]; if (a) for (const s of a) if (stamp[s] !== gen) { stamp[s] = gen; fn(s); } }
  };
  return {
    inside(x, z) { const p = Math.floor((x - bb[0]) / G), q = Math.floor((z - bb[1]) / G); return p >= 0 && q >= 0 && p < gw && q < gh && ins[q * gw + p] === 1; },
    dist(x, z, r) { let best = r * r; near(x - r, z - r, x + r, z + r, s => { const t = (s + 1) % n, d = segDist2(x, z, loop[s * 2], loop[s * 2 + 1], loop[t * 2], loop[t * 2 + 1]); if (d < best) best = d; }); return Math.sqrt(best); },
    cross(ax, az, bx, bz, fn) {
      near(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), i => {
        const j = (i + 1) % n, cx = loop[i * 2], cz = loop[i * 2 + 1], dx = loop[j * 2], dz = loop[j * 2 + 1];
        const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz, den = r1x * r2z - r1z * r2x;
        if (Math.abs(den) < 1e-9) return;
        const t = ((cx - ax) * r2z - (cz - az) * r2x) / den, u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) fn(ax + r1x * t, az + r1z * t);
      });
    }
  };
}
function crestSnap(S, loop, core) {
  const T = D.Terrain, n = loop.length >> 1; if (n < 4) return loop;
  let hr = 0; for (let i = 0; i < n; i++) hr += T.hAt(loop[i * 2], loop[i * 2 + 1]); hr /= n;
  const ccw = polyArea(loop) > 0;
  const out = new Float32Array(loop.length);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    let tx = loop[b * 2] - loop[a * 2], tz = loop[b * 2 + 1] - loop[a * 2 + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let nx = tz, nz = -tx;
    if (pip(loop, loop[i * 2] + nx * 2, loop[i * 2 + 1] + nz * 2)) { nx = -nx; nz = -nz; }
    let best = 0, bc = 1e9;
    for (const t of [-12, -6, 0, 6, 12]) {
      const x = loop[i * 2] + nx * t, z = loop[i * 2 + 1] + nz * t;
      const along = Math.abs(T.hAt(x + tx * 3, z + tz * 3) - T.hAt(x - tx * 3, z - tz * 3)) / 6;
      const k = cellK(x, z) * 4, outH = W.zone[k + 1] === S.id ? 0 : 1;
      const cost = along + 0.6 * -(T.hAt(x, z) - hr) * 0.1 + 3 * outH + (core(x, z) ? 4 : 0) + Math.abs(t) * 0.01;
      if (cost < bc) { bc = cost; best = t; }
    }
    out[i * 2] = loop[i * 2] + nx * best; out[i * 2 + 1] = loop[i * 2 + 1] + nz * best;
  }
  for (let it = 0; it < 2; it++) {
    const cp = out.slice();
    for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n; out[i * 2] = cp[i * 2] + 0.3 * ((cp[a * 2] + cp[b * 2]) / 2 - cp[i * 2]); out[i * 2 + 1] = cp[i * 2 + 1] + 0.3 * ((cp[a * 2 + 1] + cp[b * 2 + 1]) / 2 - cp[i * 2 + 1]); }
  }
  return out;
}

// =====================================================================================================
// Presenter: reveal items over time, visibility, reconcile & refilter (§5.7)
// =====================================================================================================
const lives = new Map(); // sid -> live
function newLive(sid) {
  return { sid, deco: null, dk: '', dc: null, idx: 0, curO: -1, targetO: Infinity, shown: new Map(), queue: [], qi: 0, qPace: 8, qAcc: 0, qMode: 'wave',
    acc: 0, epEl: 0, epE: 0, epDone: 0, ff: 0, instant: false, stagger: false, speed: 1, props: new Map(), propsDirty: false, propsT: 0,
    endKeys: new Set(), swaps: new Map(), wallShown: false, bb: null, provIdx: 0, provAcc: 0, ticks: new Set() };
}
function liveOf(sid) { let L = lives.get(sid); if (!L) { L = newLive(sid); lives.set(sid, L); } return L; }
const razedCache = new WeakMap();
function razedSet(S) { const r = S.razed || []; let s = razedCache.get(r); if (!s) { s = new Set(r); razedCache.set(r, s); } return s; }
function roadSuppressed(b) {
  const R = D.Roads; if (!R || !R.near || !R.segs || !R.segs.size) return false;
  const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hd = b.d / 2;
  const P = [[0, 0], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (const [lx, lz] of P) { try { if (R.near(b.x + lx * c + lz * s, b.z - lx * s + lz * c, 0.5)) return true; } catch (e) { return false; } }
  return false;
}
function visibleItem(S, it, rz) {
  const k = it.cell * 4, Z = W.zone;
  if (Z[k] !== S.type || Z[k + 1] !== S.id) return false;
  if (rz.has(it.pk)) return false;
  if (it.t === 'bld') {
    if (it.supp !== false && roadSuppressed(it.rec)) return false;
    if (manualSuppressed(it.rec)) return false;               // never over a player's own building (I2)
  }
  if (it.t === 'props' && it.pbox && roadSuppressed(it.pbox)) return false;
  // time-lapse replay: ground items (lanes, areas, props) after the view year are hidden. Buildings stay:
  // Kit's uView uniform sinks them on the GPU at no CPU cost.
  if (viewY !== undefined && it.t !== 'bld' && ((S.fy | 0) > viewY || itemYear(S, it) > viewY)) return false;
  return true;
}
// ---- built years (Living History §3.5) -----------------------------------------------------------------
// pure: the year of an item in epoch a, spread over up to 2 years in growth order (o) across the epoch's o-range
function itemYearOf(ey, fy, a, o, er) {
  const ye = a >= 1 && a <= 254 && ey ? +ey[a] || 0 : 0;
  let y = ye || (fy | 0);
  if (y && ye && er) {
    const span = clamp(((+ey[a + 1] || 0) || y + 2) - y, 0, 2);
    y += span * clamp((o - er[0]) / (er[1] - er[0] + 1), 0, 1);
  }
  return y;
}
// o-range of the deco items anchored in each epoch (lazy, cached on the deco; refreshed when the zone changes)
function epochRange(dc, a) {
  if (!dc._er || dc._erV !== zoneVer) {
    const m = new Map(), Z = W.zone;
    for (const it of dc.items) { const e = Z[it.cell * 4 + 3], r = m.get(e); if (!r) m.set(e, [it.o, it.o]); else { if (it.o < r[0]) r[0] = it.o; if (it.o > r[1]) r[1] = it.o; } }
    dc._er = m; dc._erV = zoneVer;
  }
  return dc._er.get(a) || null;
}
function itemYear(S, it) {
  if (!(S.fy > 0) && !(S.ey && S.ey.length)) return 0;
  const a = W.zone[it.cell * 4 + 3], L = lives.get(S.id);
  return itemYearOf(S.ey, S.fy, a, it.o, L && L.deco ? epochRange(L.deco, a) : null);
}
// town ticker toasts while history runs: only the selected place or places near the camera, never while catching up
function tickerOk(S) {
  const St = D.Story; if (!St) return true;
  if (St.catchingUp) return false;
  if (!(St.running && typeof St.ypm === 'function' && St.ypm() > 0)) return true;
  if (S.id === Town.selected) return true;
  let f = null; try { f = D.Cam && D.Cam.focusPoint ? D.Cam.focusPoint() : null; } catch (e) { f = null; }
  if (!f) return false;
  const o = originOf(S);
  return Math.hypot(o.x - f.x, o.z - f.z) <= 2500;
}
let remSink = [], remNow = [];
function flushRemovals() { if (remSink.length) { liveRemove(remSink, true); remSink = []; } if (remNow.length) { liveRemove(remNow, false); remNow = []; } }
const TICKS = { church: 'raised a church', cathedral: 'raised a cathedral', watermill: 'built a watermill', windmill: 'built a windmill', tavern: 'opened a tavern',
  markethall: 'built a market hall', hall: 'built a guildhall', smithy: 'lit a forge', keep: 'raised a keep', motte: 'threw up a motte and tower', cloister: 'built a cloister', pier: 'built a pier', bridge: 'bridged the river' };
function showItem(S, L, it, born, animated) {
  if (L.shown.has(it.key)) return 0;
  const e = { item: it };
  if (it.t === 'bld') {
    const rec = Object.assign({}, it.rec);
    seat(rec);
    rec.born = born; rec.sid = S.id; rec.key = it.key; rec.auto = true; rec.id = nextBid++;
    const yr = itemYear(S, it); if (yr > 0) rec.year = yr;
    // skeleton stage: an animated house reveal stands as a bare frame first (Kit reads _fe; never saved)
    // only while the chronicle is actually running: a paused/unstarted world keeps the v44 wave look (no bare frames)
    if (animated && HOUSE_KINDS[rec.kind] && D.Story && D.Story.started && D.Story.running && typeof D.Story.frameSeconds === 'function') rec._fe = born + D.Story.frameSeconds();
    if (rec.gw && D.Works && D.Works.progOf) { try { rec.prog = D.Works.progOf(rec.gw); } catch (er) { } }
    liveAdd(rec); e.recs = [rec];
    hideStampRec(rec); hideTouch(it.bb);
    if (it.wall && L.deco && L.deco.wall && !L.wallShown) { L.wallShown = true; markTilesFor(L); }
    if (animated) {
      let msg = TICKS[rec.kind];
      if (rec.kind === 'chapel' || (rec.kind === 'church' && it.key.endsWith(':v1'))) msg = null;
      if (it.wallStart && it.wall) msg = it.wall === 'stone' ? 'walled itself in stone' : 'raised a palisade';
      if (rec.kind === 'pier' && !it.wallStart && L.ticks.has('pier')) msg = null;
      if (msg && !L.ticks.has(msg)) { L.ticks.add(msg); if (tickerOk(S)) ticker(S.name + ' ' + msg); if (rec.kind === 'pier') L.ticks.add('pier'); }
    }
    navRecDirty = true;
  } else if (it.t === 'lane' || it.t === 'area') {
    atlasStamp(S, L, it, -1);
    hideStampItem(it); hideTouch(it.bb);
    if (it.t === 'lane') navDirty = true;
  } else if (it.t === 'props') {
    const a = it.arr.slice(), T = D.Terrain;
    for (let i = 0; i < a.length; i += 7) a[i + 2] = T.hAt(a[i], a[i + 1]);
    L.props.set(it.key, a); L.propsDirty = true;
  }
  L.shown.set(it.key, e);
  if (it.endO !== undefined) L.endKeys.add(it.key);
  return it.t === 'bld' ? 1 : 0;
}
function hideEntry(S, L, key, sink) {
  const e = L.shown.get(key); if (!e) return;
  L.shown.delete(key); L.endKeys.delete(key);
  const it = e.item;
  if (it.t === 'bld') { for (const r of e.recs || []) (sink ? remSink : remNow).push(r); hideRebuildRect(it.bb); }
  else if (it.t === 'lane' || it.t === 'area') { markTilesRebuild(it.bb); hideRebuildRect(it.bb); if (it.t === 'lane') navDirty = true; }
  else if (it.t === 'props') { L.props.delete(key); L.propsDirty = true; }
}
function teardown(sid, sink) {
  const L = lives.get(sid); if (!L) return;
  const S = list.get(sid) || { id: sid };
  for (const k of Array.from(L.shown.keys())) hideEntry(S, L, k, sink);
  flushRemovals();
  if (D.Nature && D.Nature.setExtra) D.Nature.setExtra('town:' + sid, null);
  lives.delete(sid);
  navDirty = true;
}
// move shown content from an absorbed settlement to its keeper (merge)
function transferLive(fromSid, toSid) {
  const A = lives.get(fromSid); if (!A) return;
  const B = liveOf(toSid);
  A.shown.forEach((e, k) => { if (e.recs) e.recs.forEach(r => { r.sid = toSid; }); B.shown.set(k, e); if (e.item.endO !== undefined) B.endKeys.add(k); });
  A.props.forEach((a, k) => B.props.set(k, a)); B.propsDirty = true;
  if (A.bb) markTilesRebuild(A.bb);
  if (D.Nature && D.Nature.setExtra) D.Nature.setExtra('town:' + fromSid, null);
  lives.delete(fromSid);
}
function speedMul(L) {
  let m = Town.speed * L.speed * (Town.histPace > 0 ? Town.histPace : 1);
  if (L.ff) m *= 1 + 39 * clamp((now() - L.ff) / 600, 0, 1);
  return m;
}
function pace(S, L) {
  const T = S.type === 2 ? 50 : 60, el = L.epEl;
  return clamp((L.epE - L.epDone) / Math.max(8, T - el), 4, 60) * speedMul(L);
}
// reconcile a settlement's shown content with its current record (modes: instant | grow | replan | wave | regrow)
function reconcile(sid, mode) {
  const S = list.get(sid);
  if (!S) { teardown(sid, mode !== 'instant'); return; }
  if (S.pending && LRU.has(S.pending.jobId)) {
    const kind = S.pending.kind; instantJobs.delete(S.pending.jobId);
    S.plan = LRU.get(S.pending.jobId); S.pending = null;
    if (mode !== 'instant') mode = kind === 'replan' ? 'replan' : 'grow';
  }
  const L = liveOf(sid);
  const target = S.plan ? getDeco(S, L) : null;
  const sink = mode !== 'instant';
  if (mode === 'regrow') { for (const k of Array.from(L.shown.keys())) hideEntry(S, L, k, true); L.curO = -1; mode = 'grow'; }
  if (!target) {
    const running = jobs.get(sid);
    for (const [k, e] of Array.from(L.shown)) if (!(running && e.prov)) hideEntry(S, L, k, sink);
    flushRemovals();
    L.deco = null; L.idx = 0; L.curO = -1; L.queue = []; L.qi = 0;
    return;
  }
  L.swaps.clear();
  for (const [k, e] of Array.from(L.shown)) {
    const ti = target.byKey.get(k);
    if (!ti) {
      if (sink && mode === 'wave' && e.item.t === 'bld') {
        const b = baseKey(k), alt = target.byKey.get(b) || target.byKey.get(b + ':v2');
        if (alt && alt.t === 'bld' && !L.shown.has(alt.key)) { e.stale = true; let a = L.swaps.get(alt.key); if (!a) L.swaps.set(alt.key, a = []); a.push(k); continue; }
      }
      hideEntry(S, L, k, sink);
    }
    else if (sigOf(ti) !== sigOf(e.item)) { if (sink && mode === 'wave' && ti.t === 'bld' && e.item.t === 'bld') e.stale = true; else hideEntry(S, L, k, sink); }
    else { e.item = ti; e.prov = false; e.stale = false; }
  }
  flushRemovals();
  const items = target.items, last = items.length ? items[items.length - 1].o : -1;
  L.deco = target; L.queue = []; L.qi = 0; L.qAcc = 0; L.bb = target.bb;
  if (L.wallShown && !target.wall) L.wallShown = false;
  if (mode === 'instant') {
    L.instant = true; L.stagger = false; L.idx = 0; L.targetO = last; L.curO = -1;
  } else {
    L.instant = false; L.stagger = false;
    const cut = mode === 'replan' ? Infinity : L.curO;
    let idx = 0; while (idx < items.length && items[idx].o <= cut) idx++;
    const q = [];
    for (let i = 0; i < idx; i++) { const it = items[i]; const ex = L.shown.get(it.key); if ((!ex || ex.stale) && !(it.endO !== undefined && it.endO <= cut)) q.push(it); }
    if (mode === 'wave' || mode === 'replan') {
      const o = target.origin || { x: 0, z: 0 };
      const dk = it => it.wall ? 1e9 + it.o : Math.hypot((it.bb ? (it.bb[0] + it.bb[2]) / 2 : o.x) - o.x, (it.bb ? (it.bb[1] + it.bb[3]) / 2 : o.z) - o.z);
      q.forEach(it => { it._wd = dk(it); });
      q.sort((a, b) => a._wd - b._wd || a.o - b.o);
    }
    L.queue = q; L.qMode = 'wave'; L.qPace = Math.max(4, q.length / 10);
    L.idx = idx; L.curO = idx ? items[idx - 1].o : L.curO; L.targetO = Infinity;
    if (mode === 'replan') L.curO = last;
    L.epEl = 0; L.epDone = 0; L.epE = 0;
    for (let i = idx; i < items.length; i++) if (items[i].t !== 'props' && !L.shown.has(items[i].key)) L.epE++;
  }
  markTilesFor(L);
  hideRebuildRect(L.bb);
  L.propsDirty = true;
  navDirty = true;
}
function refilter(sid, instant) {
  const S = list.get(sid), L = lives.get(sid); if (!S || !L || !L.deco) return;
  const rz = razedSet(S), items = L.deco.items;
  for (const [k, e] of Array.from(L.shown)) if (!visibleItem(S, e.item, rz)) hideEntry(S, L, k, !instant);
  flushRemovals();
  const add = [];
  const lim = Math.min(L.idx, items.length), cur = L.instant ? L.targetO : L.curO;
  for (let i = 0; i < lim; i++) { const it = items[i]; if (L.shown.has(it.key) || (it.endO !== undefined && it.endO <= cur)) continue; if (visibleItem(S, it, rz)) add.push(it); }
  if (add.length) {
    if (L.qi >= L.queue.length) { L.queue = []; L.qi = 0; }
    L.queue = L.queue.concat(add);
    L.qMode = instant ? 'instant' : 'wave'; L.qPace = Math.max(L.qPace, add.length / 3, 6);
  }
  hideRebuildRect(L.bb);
  L.propsDirty = true;
}
// ---- time-lapse replay filter (Living History §3.6): view-only, never touches saved state -----------------
let viewY;                                 // undefined = live
const viewSig = new Map();                 // sid -> signature of its visible-epoch set at viewY
let viewDirty = false, viewT = 0;
function viewSigOf(S, Y) {
  if ((S.fy | 0) > Y) return 'x';
  const ey = S.ey; if (!ey || !ey.length) return '';
  let s = '';
  for (let e = 1; e < ey.length; e++) { const y = +ey[e] || 0; if (!y) continue; const span = clamp(((+ey[e + 1] || 0) || y + 2) - y, 0.25, 2); s += Math.round(clamp((Y - y) / span, -0.1, 1) * 8) + ','; }
  return s;
}
Town.setViewYear = function (y) {
  const v = (y === undefined || y === null || !isFinite(y)) ? undefined : +y;
  if (v === viewY) return;
  viewY = v;
  if (v === undefined) { viewSig.clear(); viewDirty = false; needRefilterAll = true; refilterInstant = true; navDirty = true; return; }
  viewDirty = true;
};
Town.viewYear = () => viewY;
function viewFlush() {                     // ≤ 4 Hz: refilter (instantly) only settlements whose visible set changed
  if (!viewDirty || now() - viewT < 250) return;
  viewDirty = false; viewT = now();
  const ids = Array.from(list.keys()).sort((a, b) => a - b);
  for (const sid of ids) { const S = list.get(sid), sg = viewSigOf(S, viewY); if (viewSig.get(sid) === sg) continue; viewSig.set(sid, sg); refilter(sid, true); }
  navDirty = true;
}
function doSwaps(S, L, key) {
  const olds = L.swaps.get(key); if (!olds) return;
  L.swaps.delete(key);
  for (const k of olds) { const e = L.shown.get(k); if (e && e.stale) hideEntry(S, L, k, true); }
  flushRemovals();
}
function finishLive(L, instant) {
  if (!L) return;
  if (instant) { L.instant = true; L.stagger = true; L.targetO = L.deco && L.deco.items.length ? L.deco.items[L.deco.items.length - 1].o : L.curO; L.qMode = 'instant'; }
  else L.ff = now();
}
function advance(S, L, dt, B) {
  const d = L.deco; if (!d) return;
  const rz = razedSet(S), items = d.items, clk = kclock();
  // (1) queued items: waves, refilter re-appearances
  if (L.qi < L.queue.length) {
    const inst = L.qMode === 'instant';
    if (!inst) L.qAcc += L.qPace * dt * speedMul(L);
    let checks = 0;
    while (L.qi < L.queue.length && (inst || L.qAcc >= 1) && B.bld > 0 && B.ga > 0 && checks++ < 3000) {
      const it = L.queue[L.qi++];
      const ex = L.shown.get(it.key);
      if ((ex && !ex.stale) || (it.endO !== undefined && it.endO <= (L.instant ? L.targetO : L.curO)) || !visibleItem(S, it, rz)) continue;
      if (ex) { hideEntry(S, L, it.key, !inst); flushRemovals(); }   // renovation: swap the old house for the new one
      const b = inst ? (L.stagger ? clk + h01(it.key) * 1.5 : clk - 10) : clk;
      if (showItem(S, L, it, b, !inst)) B.bld--; else if (it.t !== 'props') B.ga--;
      if (L.swaps.size) doSwaps(S, L, it.key);
      if (!inst && it.t !== 'props') L.qAcc -= 1;
    }
    if (L.qi >= L.queue.length) {
      L.queue = []; L.qi = 0; L.qAcc = 0; if (L.qMode === 'instant') L.qMode = 'wave';
      for (const [k, e] of Array.from(L.shown)) if (e.stale) hideEntry(S, L, k, true);   // renovations that could not be shown
      L.swaps.clear();
      flushRemovals();
    }
  }
  // (2) the growth cursor
  if (L.idx < items.length) {
    const inst = L.instant;
    if (!inst) { L.acc += pace(S, L) * dt; L.epEl += dt * speedMul(L); if (L.acc > 40) L.acc = 40; }
    let checks = 0;
    while (L.idx < items.length && (inst || L.acc >= 1) && B.bld > 0 && B.ga > 0 && checks++ < 4000) {
      const it = items[L.idx++];
      if (!inst) L.curO = it.o;
      if (L.shown.has(it.key)) continue;
      if (inst && it.endO !== undefined && it.endO <= L.targetO) continue;
      if (!visibleItem(S, it, rz)) continue;
      const b = inst ? (L.stagger ? clk + h01(it.key) * 1.5 : clk - 10) : clk;
      if (showItem(S, L, it, b, !inst)) B.bld--; else if (it.t !== 'props') B.ga--;
      if (L.swaps.size) doSwaps(S, L, it.key);
      if (it.t !== 'props') { L.epDone++; if (!inst) L.acc -= 1; }
    }
    if (L.idx >= items.length) {
      if (inst) L.curO = L.targetO;
      L.instant = false; L.stagger = false; L.ff = 0; L.acc = 0; L.targetO = Infinity;
      townChangedPending = true;
    }
  }
  // (3) superseded phases (endO)
  if (L.endKeys.size) {
    for (const k of Array.from(L.endKeys)) { const e = L.shown.get(k); if (e && e.item.endO <= L.curO) hideEntry(S, L, k, true); }
    flushRemovals();
  }
}
// provisional lanes while the first plan of a settlement is still being computed (7 items/s)
function provisional(dt) {
  jobs.forEach(j => {
    const S = list.get(j.sid), ctx = j.holder.ctx; if (!S || !ctx || !ctx.lanes || j.instant) return;
    if (S.plan) return;
    const L = liveOf(j.sid);
    if (L.deco) return;
    L.provAcc = Math.min(20, L.provAcc + 7 * dt * speedMul(L));
    const rz = razedSet(S);
    while (L.provAcc >= 1 && L.provIdx < ctx.lanes.length) {
      const Ln = ctx.lanes[L.provIdx++];
      if (Ln.ep !== ctx.epoch && ctx.prev) continue;
      let surf = Ln.surf || 1; const tw = S.tw;
      if (surf <= 2) surf = Ln.rank === 3 ? 1 : (tw.wealth > 0.7 || (Ln.rank === 0 && tw.wealth > 0.45)) ? 2 : 1;
      const it = { t: 'lane', key: Ln.key, pk: Ln.key, o: Ln.o, cell: Ln.cell, pts: Ln.pts, w: Ln.w, surf, rank: Ln.rank, bb: bboxOf(Ln.pts, Ln.w / 2 + 8) };
      if (!visibleItem(S, it, rz)) continue;
      showItem(S, L, it, kclock(), true);
      L.shown.get(it.key).prov = true;
      L.provAcc -= 1;
    }
  });
}

// =====================================================================================================
// Ground-detail atlas (§3.3, §5.8)
// =====================================================================================================
const GT = 64, PW = 130;                      // 64×64 tiles of 256 m; 130-texel pages
const AT = { rows: 8, data: null, tex: null, idxData: new Uint8Array(GT * GT * 4), idxTex: null, idxDirty: false,
  pageOfTile: new Int16Array(GT * GT).fill(-1), tileOfPage: new Int16Array(16 * 64).fill(-1), has: new Uint8Array(16 * 64),
  up: new Set(), rebuild: new Set(), tileSids: new Array(GT * GT).fill(null), full: false, anyPage: false,
  pend: new Set() };   // pages whose index entry waits for their first upload (else the GPU reads zeros = one big dirt lane)
function atlasCreate() {
  AT.data = new Uint8Array(16 * PW * PW * AT.rows * 4);
  for (let o = 0; o < AT.data.length; o += 4) AT.data[o] = 255;      // empty: far from any lane
  AT.tex = new THREE.DataTexture(AT.data, 16 * PW, PW * AT.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  AT.tex.magFilter = THREE.LinearFilter; AT.tex.minFilter = THREE.LinearFilter; AT.tex.generateMipmaps = false;
  AT.tex.wrapS = AT.tex.wrapT = THREE.ClampToEdgeWrapping; AT.tex.flipY = false; AT.tex.needsUpdate = true;
  if (D.TU && D.TU.uGAtlas) D.TU.uGAtlas.value = AT.tex;
  if (D.TU && D.TU.uGSize && D.TU.uGSize.value && D.TU.uGSize.value.set) D.TU.uGSize.value.set(16 * PW, PW * AT.rows);
}
function atlasInit() {
  AT.idxTex = new THREE.DataTexture(AT.idxData, GT, GT, THREE.RGBAFormat, THREE.UnsignedByteType);
  AT.idxTex.magFilter = THREE.NearestFilter; AT.idxTex.minFilter = THREE.NearestFilter; AT.idxTex.generateMipmaps = false; AT.idxTex.flipY = false; AT.idxTex.needsUpdate = true;
  if (D.TU && D.TU.uGIdx) D.TU.uGIdx.value = AT.idxTex;
  atlasCreate();
}
function atlasGrow() {
  if (AT.rows >= 64) return false;
  const old = AT.tex, od = AT.data;
  AT.rows *= 2;
  atlasCreate();
  AT.data.set(od);
  if (old) old.dispose();
  AT.up.clear(); AT.full = true;
  return true;
}
function clearPage(p) {
  const pc = p % 16, pr = (p / 16) | 0, rowLen = 16 * PW * 4, d = AT.data;
  for (let v = 0; v < PW; v++) { let o = ((pr * PW + v) * 16 * PW + pc * PW) * 4; for (let u = 0; u < PW; u++, o += 4) { d[o] = 255; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; } }
  AT.has[p] = 0;
}
function allocPage(tile) {
  let p = AT.pageOfTile[tile]; if (p >= 0) return p;
  const cap = 16 * AT.rows;
  for (p = 0; p < cap; p++) if (AT.tileOfPage[p] < 0) break;
  if (p >= cap) { if (!atlasGrow()) return -1; p = cap; }
  AT.tileOfPage[p] = tile; AT.pageOfTile[tile] = p;
  clearPage(p);
  AT.pend.add(p); AT.anyPage = true;
  return p;
}
function publishPage(p) {
  if (!AT.pend.has(p)) return;
  AT.pend.delete(p);
  const tile = AT.tileOfPage[p]; if (tile < 0) return;
  const ti = tile % GT, tj = (tile / GT) | 0, o = (tj * GT + ti) * 4;
  AT.idxData[o] = p % 16; AT.idxData[o + 1] = (p / 16) | 0; AT.idxData[o + 2] = 0; AT.idxData[o + 3] = 255;
  AT.idxDirty = true;
}
function freePage(tile) {
  const p = AT.pageOfTile[tile]; if (p < 0) return;
  AT.pageOfTile[tile] = -1; AT.tileOfPage[p] = -1; AT.has[p] = 0; AT.pend.delete(p);
  const ti = tile % GT, tj = (tile / GT) | 0, o = (tj * GT + ti) * 4;
  AT.idxData[o] = AT.idxData[o + 1] = AT.idxData[o + 2] = AT.idxData[o + 3] = 0; AT.idxDirty = true;
  AT.up.delete(p);
}
function tilesOf(bb, pad) {
  const out = [];
  const ti0 = clamp(Math.floor((bb[0] - pad) / 256), 0, GT - 1), ti1 = clamp(Math.floor((bb[2] + pad) / 256), 0, GT - 1);
  const tj0 = clamp(Math.floor((bb[1] - pad) / 256), 0, GT - 1), tj1 = clamp(Math.floor((bb[3] + pad) / 256), 0, GT - 1);
  for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) out.push(tj * GT + ti);
  return out;
}
function markTilesRebuild(bb) { if (bb) for (const t of tilesOf(bb, 2)) if (AT.pageOfTile[t] >= 0 || AT.tileSids[t]) AT.rebuild.add(t); }
function markTilesFor(L) { if (!L || !L.bb) return; for (const t of tilesOf(L.bb, 2)) AT.rebuild.add(t); }
const encD = d => { const v = Math.round(128 + d * 4); return v < 0 ? 0 : v > 255 ? 255 : v; };
const scanBuf = [], scanBuf2 = [];
// stamp one lane/area item into the pages it touches (onlyTile ≥ 0 restricts to one tile: rebuilds)
function atlasStamp(S, L, it, onlyTile) {
  if (!AT.data) return;
  const pad = it.t === 'lane' ? it.w / 2 + 8 : it.square ? 8 : 0;
  const bb = it.bb;
  const tiles = onlyTile >= 0 ? [onlyTile] : tilesOf(bb, 2);
  const Z = W.zone, sid = S.id, typ = S.type;
  const wm = it.t === 'lane' && L && L.wallShown && L.deco && L.deco.wall ? L.deco.wall.mask : null;
  for (const tile of tiles) {
    const ti = tile % GT, tj = (tile / GT) | 0, tx0 = ti * 256, tz0 = tj * 256;
    if (bb[2] < tx0 - 4 || bb[0] > tx0 + 260 || bb[3] < tz0 - 4 || bb[1] > tz0 + 260) continue;
    const p = allocPage(tile); if (p < 0) continue;
    if (!AT.tileSids[tile]) AT.tileSids[tile] = new Set();
    AT.tileSids[tile].add(sid);
    const pc = p % 16, pr = (p / 16) | 0, d = AT.data;
    const u0 = clamp(Math.floor((bb[0] - tx0) / 2 + 0.5), 0, PW - 1), u1 = clamp(Math.ceil((bb[2] - tx0) / 2 + 0.5), 0, PW - 1);
    const v0 = clamp(Math.floor((bb[1] - tz0) / 2 + 0.5), 0, PW - 1), v1 = clamp(Math.ceil((bb[3] - tz0) / 2 + 0.5), 0, PW - 1);
    let wrote = false;
    const cellOk = (x, z) => {
      if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return false;
      const k = ((z / CELL | 0) * N + (x / CELL | 0)) * 4, g = Z[k + 1];
      if (g === sid) return Z[k] === typ;
      return g === 0;
    };
    if (it.t === 'lane') {
      const pts = it.pts, hw = it.w / 2, surf = it.surf, n = pts.length >> 1;
      for (let v = v0; v <= v1; v++) {
        const z = tz0 + (v - 0.5) * 2;
        let o = ((pr * PW + v) * 16 * PW + pc * PW + u0) * 4;
        for (let u = u0; u <= u1; u++, o += 4) {
          const x = tx0 + (u - 0.5) * 2;
          let best = 1e18;
          for (let s = 0; s < n - 1; s++) { const q = segDist2(x, z, pts[s * 2], pts[s * 2 + 1], pts[s * 2 + 2], pts[s * 2 + 3]); if (q < best) best = q; }
          const dd = Math.sqrt(best) - hw;
          if (dd > 8) continue;
          if (!cellOk(x, z)) continue;
          if (wm && wm(x, z)) continue;
          const e = encD(dd); if (e < d[o]) d[o] = e;
          if (dd < 0 && surf > d[o + 1]) d[o + 1] = surf;
          wrote = true;
        }
      }
    } else {
      const poly = it.poly, cls = it.cls, sq = it.square;
      const angIdx = Math.round((((it.ang % PI) + PI) % PI) / PI * 32) & 31;
      const A = (angIdx << 3) | ((it.rf ? 1 : 0) << 2) | (it.vr & 3);
      for (let v = v0; v <= v1; v++) {
        const z = tz0 + (v - 0.5) * 2;
        scanX(poly, z, scanBuf);
        const rowO = ((pr * PW + v) * 16 * PW + pc * PW) * 4;
        if (sq) {
          for (let u = u0; u <= u1; u++) {
            const x = tx0 + (u - 0.5) * 2;
            let inside = false; for (let q2 = 0; q2 + 1 < scanBuf.length; q2 += 2) if (x >= scanBuf[q2] && x <= scanBuf[q2 + 1]) { inside = true; break; }
            const dist = distToLoop(poly, x, z), dd = inside ? -dist : dist;
            if (dd > 8 || !cellOk(x, z)) continue;
            const o = rowO + u * 4, e = encD(dd);
            if (e < d[o]) d[o] = e;
            if (inside && d[o + 1] < 3) d[o + 1] = 3;
            wrote = true;
          }
        } else {
          for (let q2 = 0; q2 + 1 < scanBuf.length; q2 += 2) {
            const ua = Math.max(u0, Math.ceil((scanBuf[q2] - tx0) / 2 + 0.5)), ub = Math.min(u1, Math.floor((scanBuf[q2 + 1] - tx0) / 2 + 0.5));
            for (let u = ua; u <= ub; u++) {
              const x = tx0 + (u - 0.5) * 2; if (!cellOk(x, z)) continue;
              const o = rowO + u * 4; d[o + 2] = cls; d[o + 3] = A; wrote = true;
            }
          }
        }
      }
    }
    if (wrote) { AT.has[p] = 1; AT.up.add(p); }
  }
}
function rebuildTile(tile) {
  const p = AT.pageOfTile[tile];
  const sids = AT.tileSids[tile];
  if (p < 0 && !sids) return;
  if (p >= 0) clearPage(p);
  const tx0 = (tile % GT) * 256, tz0 = ((tile / GT) | 0) * 256, rect = [tx0 - 12, tz0 - 12, tx0 + 268, tz0 + 268];
  const ids = sids ? Array.from(sids).sort((a, b) => a - b) : [];
  AT.tileSids[tile] = null;
  for (const sid of ids) {
    const S = list.get(sid), L = lives.get(sid); if (!S || !L) continue;
    // areas first (their B/A), then lanes (min-union SDF)
    for (const pass of ['area', 'lane']) L.shown.forEach(e => { const it = e.item; if (it.t !== pass || !bbHit(it.bb, rect)) return; atlasStamp(S, L, it, tile); });
  }
  const p2 = AT.pageOfTile[tile];
  if (p2 >= 0) { if (!AT.has[p2]) freePage(tile); else AT.up.add(p2); }
}
function atlasFlush() {
  if (!AT.data) return;
  let n = 0;
  for (const t of Array.from(AT.rebuild)) { AT.rebuild.delete(t); rebuildTile(t); if (++n >= 6) break; }
  const R = D.renderer;
  if (AT.full || (AT.up.size && (!R || AT.tex.version === 0))) {   // whole-texture upload: every written page goes live
    AT.tex.needsUpdate = true; AT.full = false;
    for (const p of Array.from(AT.pend)) if (AT.has[p]) publishPage(p);
    AT.up.clear();
  } else if (AT.up.size) {
    let k = 0;
    for (const p of Array.from(AT.up)) {
      AT.up.delete(p);
      D.subUpload(R, AT.tex, (p % 16) * PW, ((p / 16) | 0) * PW, PW, PW);
      publishPage(p);
      if (++k >= 3) break;
    }
  }
  if (AT.idxDirty && AT.idxTex) { AT.idxTex.needsUpdate = true; AT.idxDirty = false; }
  AT.anyPage = AT.pageOfTile.some(v => v >= 0);
}
function atlasReset() {
  AT.pageOfTile.fill(-1); AT.tileOfPage.fill(-1); AT.has.fill(0); AT.idxData.fill(0); AT.idxDirty = true;
  AT.up.clear(); AT.rebuild.clear(); AT.tileSids.fill(null); AT.anyPage = false; AT.pend.clear();
}

// =====================================================================================================
// Hide mask for user trees (§5.13): 4096×4096 bits, 4 m cells
// =====================================================================================================
const HB = 4096, hideBits = new Uint8Array(HB * HB / 8);
let hideDirty = null, hideRebuild = null, hideT = 0, hideOn = true;
const hset = (i, j) => { if (i < 0 || j < 0 || i >= HB || j >= HB) return; const b = j * HB + i; hideBits[b >> 3] |= 1 << (b & 7); };
Town.hides = function (x, z) {
  if (!hideOn) return false;
  const i = Math.floor(x / 4), j = Math.floor(z / 4);
  if (i < 0 || j < 0 || i >= HB || j >= HB) return false;
  const b = j * HB + i; return ((hideBits[b >> 3] >> (b & 7)) & 1) === 1;
};
function growRect(r, bb) { if (!bb) return r; if (!r) return bb.slice(); r[0] = Math.min(r[0], bb[0]); r[1] = Math.min(r[1], bb[1]); r[2] = Math.max(r[2], bb[2]); r[3] = Math.max(r[3], bb[3]); return r; }
function hideTouch(bb) { hideDirty = growRect(hideDirty, bb); }
function hideRebuildRect(bb) { hideRebuild = growRect(hideRebuild, bb); }
function hideStampRec(rec, clip) {
  const c = Math.cos(rec.rot), s = Math.sin(rec.rot), hw = rec.w / 2 + 2, hd = rec.d / 2 + 2;
  const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
  for (let j = Math.floor((rec.z - ez) / 4); j <= Math.floor((rec.z + ez) / 4); j++) for (let i = Math.floor((rec.x - ex) / 4); i <= Math.floor((rec.x + ex) / 4); i++) {
    const x = (i + 0.5) * 4 - rec.x, z = (j + 0.5) * 4 - rec.z, lx = x * c - z * s, lz = x * s + z * c;
    if (Math.abs(lx) <= hw + 1 && Math.abs(lz) <= hd + 1 && (!clip || (i * 4 >= clip[0] && i * 4 < clip[2] && j * 4 >= clip[1] && j * 4 < clip[3]))) hset(i, j);
  }
}
function hideStampItem(it, clip) {
  const inClip = (i, j) => !clip || (i * 4 >= clip[0] && i * 4 < clip[2] && j * 4 >= clip[1] && j * 4 < clip[3]);
  if (it.t === 'lane') {
    const p = it.pts, hw = it.w / 2 + 1, n = p.length >> 1;
    for (let s = 0; s < n - 1; s++) {
      const ax = p[s * 2], az = p[s * 2 + 1], bx = p[s * 2 + 2], bz = p[s * 2 + 3];
      for (let j = Math.floor((Math.min(az, bz) - hw) / 4); j <= Math.floor((Math.max(az, bz) + hw) / 4); j++) for (let i = Math.floor((Math.min(ax, bx) - hw) / 4); i <= Math.floor((Math.max(ax, bx) + hw) / 4); i++)
        if (inClip(i, j) && segDist2((i + 0.5) * 4, (j + 0.5) * 4, ax, az, bx, bz) <= (hw + 2) * (hw + 2)) hset(i, j);
    }
    return;
  }
  if (it.t !== 'area') return;
  const cls = it.cls, poly = it.poly, bb = bboxOf(poly, 0);
  const field = typeof cls === 'number' && ((cls >= 5 && cls <= 12) || cls === 14);
  const yard = cls === 1;
  for (let j = Math.floor(bb[1] / 4); j <= Math.floor(bb[3] / 4); j++) {
    const z = (j + 0.5) * 4;
    scanX(poly, z, scanBuf2);
    let up = null, dn = null;
    if (field) { up = scanX(poly, z - 6, []); dn = scanX(poly, z + 6, []); }
    for (let q = 0; q + 1 < scanBuf2.length; q += 2) {
      let xa = scanBuf2[q], xb = scanBuf2[q + 1];
      if (field) { xa += 6; xb -= 6; }
      for (let i = Math.ceil(xa / 4 - 0.5); i <= Math.floor(xb / 4 - 0.5); i++) {
        if (!inClip(i, j)) continue;
        const x = (i + 0.5) * 4;
        if (field && !(spanHas(up, x) && spanHas(dn, x))) continue;
        if (yard && h01(i, j, 17) < 0.5) continue;
        hset(i, j);
      }
    }
  }
}
// history-built roads (seg.by === 1) never clear plants: the trees under their corridor are only hidden, so
// removing the road brings them back (Living History I2). Stamped on every rebuild of the rect.
function hideStampDirRoads(clip) {
  const R = D.Roads; if (!R || !R.segs || !R.segs.size || !R.segSamples) return;
  R.segs.forEach(seg => {
    if (seg.by !== 1) return;
    let S2; try { S2 = R.segSamples(seg); } catch (e) { return; }
    if (!S2 || !(S2.n >= 2)) return;
    const T = (R.TYPES && R.TYPES[seg.type]) || { w: 4 }, hw = (T.w || 4) / 2 + 1.5, n = S2.n, X = S2.x, Zs = S2.z;
    const [x0, z0, x1, z1] = samplesBB(S2);
    if (x1 + hw < clip[0] || x0 - hw > clip[2] || z1 + hw < clip[1] || z0 - hw > clip[3]) return;
    for (let s = 0; s < n - 1; s++) {
      const ax = X[s], az = Zs[s], bx = X[s + 1], bz = Zs[s + 1];
      for (let j = Math.floor((Math.min(az, bz) - hw) / 4); j <= Math.floor((Math.max(az, bz) + hw) / 4); j++) for (let i = Math.floor((Math.min(ax, bx) - hw) / 4); i <= Math.floor((Math.max(ax, bx) + hw) / 4); i++)
        if (i * 4 >= clip[0] && i * 4 < clip[2] && j * 4 >= clip[1] && j * 4 < clip[3] && segDist2((i + 0.5) * 4, (j + 0.5) * 4, ax, az, bx, bz) <= (hw + 2) * (hw + 2)) hset(i, j);
    }
  });
}
const sbbCache = new WeakMap();      // road samples object -> bbox (samples are replaced when a seg's geometry changes)
function samplesBB(S2) {
  let b = sbbCache.get(S2);
  if (!b) { b = [1e9, 1e9, -1e9, -1e9]; for (let q = 0; q < S2.n; q++) { const x = S2.x[q], z = S2.z[q]; if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (z < b[1]) b[1] = z; if (z > b[3]) b[3] = z; } sbbCache.set(S2, b); }
  return b;
}
// union bbox of all history-built roads (so a wholesale road reload re-derives exactly the corridors that changed)
let dirRoadBB = null;
function dirRoadsBB() {
  const R = D.Roads; let u = null; if (!R || !R.segs || !R.segSamples) return null;
  R.segs.forEach(seg => { if (seg.by !== 1) return; let S2; try { S2 = R.segSamples(seg); } catch (e) { return; } if (S2 && S2.n) u = growRect(u, samplesBB(S2)); });
  return u ? [u[0] - 12, u[1] - 12, u[2] + 12, u[3] + 12] : null;
}
Town.hideRoadRect = function (bb) { if (bb && bb.length >= 4) { hideRebuildRect([bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4]); hideT = Math.min(hideT, 0.05); } };
function spanHas(xs, x) { for (let q = 0; q + 1 < xs.length; q += 2) if (x >= xs[q] && x <= xs[q + 1]) return true; return false; }
function hideFlush(dt) {
  hideT -= dt;
  if (hideT > 0) return;
  if (hideRebuild) {
    const r = hideRebuild; hideRebuild = null;
    const i0 = Math.max(0, Math.floor(r[0] / 4)), i1 = Math.min(HB - 1, Math.floor(r[2] / 4)), j0 = Math.max(0, Math.floor(r[1] / 4)), j1 = Math.min(HB - 1, Math.floor(r[3] / 4));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const b = j * HB + i; hideBits[b >> 3] &= ~(1 << (b & 7)); }
    const clip = [i0 * 4, j0 * 4, (i1 + 1) * 4, (j1 + 1) * 4];
    lives.forEach(L => {
      if (!L.bb || !bbHit(L.bb, clip)) return;
      L.shown.forEach(e => { const it = e.item; if (!it.bb || !bbHit(it.bb, clip)) return; if (it.t === 'bld') { for (const rec of e.recs || []) hideStampRec(rec, clip); } else hideStampItem(it, clip); });
    });
    hideStampDirRoads(clip);
    hideDirty = growRect(hideDirty, r);
  }
  if (hideDirty && D.Nature && D.Nature.markHideDirty) { const r = hideDirty; D.Nature.markHideDirty(r[0], r[1], r[2], r[3]); }
  hideDirty = null;
  hideT = 0.4;
}

// =====================================================================================================
// Nature extras (props), navigation edges, moorings
// =====================================================================================================
let propsVisible = true;
function extrasFlush(dt) {
  if (!D.Nature || !D.Nature.setExtra) return;
  lives.forEach(L => {
    L.propsT -= dt;
    if (!L.propsDirty || L.propsT > 0) return;
    L.propsDirty = false; L.propsT = 0.25;
    if (!propsVisible || !L.props.size) { D.Nature.setExtra('town:' + L.sid, null); return; }
    let n = 0; L.props.forEach(a => n += a.length);
    const out = new Float32Array(n); let o = 0;
    L.props.forEach(a => { out.set(a, o); o += a.length; });
    D.Nature.setExtra('town:' + L.sid, out);
  });
}
let navDirty = true, navRecDirty = true, navT = 0, navCache = [], moorCache = [], moorVer = -1, recVer = 0;
Town.navEdges = function () {
  if (navCache) return navCache;
  const out = [];
  Array.from(lives.keys()).sort((a, b) => a - b).forEach(sid => {
    const L = lives.get(sid), groups = new Map();
    L.shown.forEach((e, k) => { const it = e.item; if (it.t !== 'lane') return; const dot = k.lastIndexOf('.'); const base = k.slice(0, dot); let g = groups.get(base); if (!g) groups.set(base, g = []); g.push([+k.slice(dot + 1) || 0, it]); });
    Array.from(groups.keys()).sort().forEach(base => {
      const g = groups.get(base).sort((a, b) => a[0] - b[0]);
      let run = null, last = -2;
      const push = () => { if (run && run.pts.length >= 4) out.push({ pts: Float32Array.from(run.pts), w: run.w, rank: run.rank, cart: run.rank !== 2, sid }); };
      for (const [i, it] of g) {
        if (!run || i !== last + 1) { push(); run = { pts: Array.from(it.pts), w: it.w, rank: it.rank }; }
        else for (let q = 2; q < it.pts.length; q++) run.pts.push(it.pts[q]);
        last = i;
      }
      push();
    });
  });
  navCache = out;
  return out;
};
Town.moorings = function () {
  if (moorVer === recVer && moorCache) return moorCache;
  const out = [];
  lives.forEach(L => L.shown.forEach(e => { if (!e.recs) return; for (const r of e.recs) if (r.kind === 'pier' && (r.var | 0) === 1) out.push({ x: r.x, z: r.z, heading: r.rot }); }));
  moorCache = out; moorVer = recVer;
  return out;
};
function navFlush(dt) {
  navT -= dt;
  if (navT > 0 || !(navDirty || navRecDirty)) return;
  // navVersion tracks the LANES only (Life rebuilds its lane graph on every bump); building changes
  // bump recVer (moorings cache) and redraw the navigator
  if (navDirty) { Town.navVersion++; navCache = null; }
  if (navRecDirty) recVer++;
  navDirty = false; navRecDirty = false; navT = 1.0;
  if (D.UI && D.UI.navDirty) D.UI.navDirty();
}

// =====================================================================================================
// Ticker toasts (one per 4 s)
// =====================================================================================================
const tickQ = []; let tickT = 0;
function ticker(msg) { if (tickQ.length < 4 && tickQ.indexOf(msg) < 0) tickQ.push(msg); }
function tickerFlush() { if (!tickQ.length || now() < tickT) return; D.toast(tickQ.shift(), '', 3200); tickT = now() + 4000; }

// =====================================================================================================
// Tools (pushed into D.toolDefs at parse time)
// =====================================================================================================
D.toolDefs = D.toolDefs || [];
const pct = v => Math.round(v * 100) + '%';
function hexRGB(h) { const c = parseInt(h.slice(1), 16); return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
function waterWithin(x, z, r) {
  const T = D.Terrain; if (!T || !T.isWet) return true;
  if (T.isWet(x, z)) return true;
  for (let a = 0; a < 12; a++) for (const d of [r * 0.5, r]) if (T.isWet(x + Math.cos(a * PI / 6) * d, z + Math.sin(a * PI / 6) * d)) return true;
  return false;
}
D.toolDefs.push({
  id: 'zone', name: 'Zone Paint', key: 'Z', group: 'city', icon: 'zone', layer: 'buildings', zoneOverlay: 1, sort: 3,
  desc: 'Paint where villages, farms, castles, monasteries and harbours should grow. They build themselves.',
  defaults: { size: 120, ztype: 1, hardness: 1, dens: 0.5, wealth: 0.45, walls: 'none', layout: 0.2, squares: 0.4, greens: 0.5, gardens: 0.6, speed: 1 },
  options: [
    { id: 'size', label: 'Size', type: 'range', min: 16, max: 1500, log: true, fmt: v => Math.round(v) + ' m' },
    { id: 'dens', label: 'Density', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'wealth', label: 'Wealth', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'walls', label: 'Walls', type: 'seg', choices: [['none', 'None'], ['palisade', 'Palisade'], ['stone', 'Stone']] },
    { id: 'layout', label: 'Layout', type: 'range', min: 0, max: 1, fmt: v => v < 0.34 ? 'Winding' : v < 0.67 ? 'Mixed' : 'Planned' },
    { id: 'squares', label: 'Squares', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'greens', label: 'Greens', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'gardens', label: 'Gardens', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'speed', label: 'Speed', type: 'seg', choices: [['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], get: () => String(Town.speed), set: v => { Town.speed = +v || 1; } },
    { id: 'finish', label: '⏭ Finish all', type: 'button', act: () => Town.finishAll(false) }
  ],
  hint: '<b>Drag</b> to zone · <b>Shift</b> erases · <b>Alt+click</b> a settlement to inspect it · it grows when you let go',
  brushColor(st) {
    const o = D.Tools.o('zone'), T = +o.ztype;
    if ((st && st.shift) || D.Tools.keyShift || !T) return [1, 0.42, 0.32];
    if (T === 5) { const h = D.Tools.hit; if (h && !waterWithin(h.x, h.z, 80)) return [1, 0.25, 0.2]; }
    return hexRGB(TYPES[T].col);
  },
  catalogue(grid, item, o) {
    TYPES.forEach(t => { if (!t) return; item(t.name, `<div style="width:100%;height:100%;border-radius:3px;background:${t.col};display:flex;align-items:center;justify-content:center;font-size:16px">${t.emoji}</div>`, +o.ztype === t.id, () => { o.ztype = t.id; }, t.id === 5 ? 'Must touch the sea, a lake or a river' : ''); });
    item('Clear', '⌫', +o.ztype === 0, () => { o.ztype = 0; }, 'Erase zones (or hold Shift)');
    return 'Settlement types';
  },
  down(p, st, o) { if (st.alt) { st.cancel = true; const s = p ? settlementAt(p.x, p.z) : null; Town.select(s ? s.id : 0); } },
  apply(p, dt, st, o) { paintCells(p, st, o); },
  up(p, st, o) { resolveStroke(st, o); }
});
D.toolDefs.push({
  id: 'prosperity', name: 'Prosperity Brush', key: 'shift+Z', group: 'city', icon: 'density', layer: 'buildings', zoneOverlay: 2, sort: 4,
  desc: 'Paint where folk are poor or rich. Rich streets rebuild in stone with cobbles; poor ones stay wattle and thatch.',
  defaults: { size: 160, strength: 0.6, hardness: 0.3, target: 0.85 },
  options: [{ id: 'size', label: 'Size', type: 'range', min: 16, max: 1500, log: true, fmt: v => Math.round(v) + ' m' }, 'strength', 'hardness',
    { id: 'target', label: 'Poor ↔ Rich', type: 'range', min: 0, max: 1, fmt: v => v < 0.34 ? 'Poor ' + pct(v) : v < 0.67 ? 'Middling ' + pct(v) : 'Rich ' + pct(v) }],
  hint: '<b>Drag</b> to paint prosperity · <b>Shift</b> resets to neutral · houses renovate when you let go',
  brushColor(st) { if ((st && st.shift) || D.Tools.keyShift) return [0.8, 0.8, 0.8]; const t = D.Tools.o('prosperity').target; return t < 0.5 ? [0.35, 0.55, 1] : [1, 0.8, 0.3]; },
  apply(p, dt, st, o) {
    const r = Math.max(8, o.size);
    const i0 = Math.max(0, Math.floor((p.x - r) / CELL)), i1 = Math.min(N - 1, Math.floor((p.x + r) / CELL));
    const j0 = Math.max(0, Math.floor((p.z - r) / CELL)), j1 = Math.min(N - 1, Math.floor((p.z + r) / CELL));
    D.History.touch('zone', i0, j0, i1, j1);
    const Z = W.zone, tgt = Math.round(1 + o.target * 254);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot((i + 0.5) * CELL - p.x, (j + 0.5) * CELL - p.z); if (d > r) continue;
      const w = D.falloff(d / r, o.hardness), k = (j * N + i) * 4 + 2;
      if (st.shift) { if (w > 0.3) Z[k] = 0; continue; }
      const cur = Z[k] || 128;
      Z[k] = clamp(Math.round(cur + (tgt - cur) * Math.min(1, w * o.strength * dt * 6)), 1, 255);
    }
    stAddBB(st, i0, j0, i1, j1);
    zoneRect(i0, j0, i1, j1);
  },
  up(p, st) {
    if (!st || !st.zbb) return;
    const [i0, j0, i1, j1] = st.zbb, seen = new Set();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const g = W.zone[(j * N + i) * 4 + 1]; if (g) seen.add(g); }
    seen.forEach(sid => { bVersion[sid]++; redecorateQ.add(sid); });
  }
});
// ---- Place Building ---------------------------------------------------------------------------------------
let ghostSeed = 1, ghostRec = null;
function footprintOK(b, ignore) {
  const cs = corners(b), T = D.Terrain;
  if (cs.some(([x, z]) => !D.inMap(x, z))) return false;
  let mn = 1e9, mx = -1e9;
  for (const [x, z] of cs.concat([[b.x, b.z]])) {
    const y = T.hAt(x, z);
    if (T.waterAt(x, z) > y - 0.3 && kmeta(b.kind).seat !== 'water') return false;
    mn = Math.min(mn, y); mx = Math.max(mx, y);
  }
  if (mx - mn > Math.max(5, Math.min(b.w, b.d) * 0.4)) return false;
  if (D.Roads && D.Roads.near) {
    const pts = cs.concat([[b.x, b.z], [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2], [(cs[2][0] + cs[3][0]) / 2, (cs[2][1] + cs[3][1]) / 2]]);
    for (const [x, z] of pts) if (D.Roads.near(x, z, 0.5)) return false;
  }
  let ok = true;
  forNear(b.x - 80, b.z - 80, b.x + 80, b.z + 80, o => { if (o !== ignore && kmeta(o.kind).collide !== false && obbOverlap(b, o, 0.8)) { ok = false; return false; } });
  return ok;
}
function regionNear(x, z) {
  let best = null, bd = 3000 * 3000;
  list.forEach(S => { if (!S.plan) return; const o = S.plan.origin; const d = D.dist2(o.x, o.z, x, z); if (d < bd) { bd = d; best = S; } });
  return best && best.plan.style ? best.plan.style.region : 0;
}
function roadFacing(x, z) {
  let best = null, bd = 70;
  if (D.Roads && D.Roads.nearestPoint) { const np = D.Roads.nearestPoint(x, z, 70); if (np) { best = Math.atan2(x - np.x, z - np.z); bd = Math.hypot(x - np.x, z - np.z); } }
  lives.forEach(L => L.shown.forEach(e => {
    const it = e.item; if (it.t !== 'lane' || !it.bb || x < it.bb[0] || x > it.bb[2] || z < it.bb[1] || z > it.bb[3]) return;
    const p = it.pts;
    for (let q = 0; q + 3 < p.length; q += 2) {
      const d = Math.sqrt(segDist2(x, z, p[q], p[q + 1], p[q + 2], p[q + 3]));
      if (d < bd) { bd = d; const dx = p[q + 2] - p[q], dz = p[q + 3] - p[q + 1], L2 = dx * dx + dz * dz || 1, t = clamp(((x - p[q]) * dx + (z - p[q + 1]) * dz) / L2, 0, 1); best = Math.atan2(x - (p[q] + dx * t), z - (p[q + 1] + dz * t)); }
    }
  }));
  return best;
}
function candidate(o, x, z, rot) {
  const kind = o.kind || 'cottage';
  const rec = kdesign(kind, x, z, rot, { wealth: o.wealth, seed: hash32(ghostSeed, kind), region: regionNear(x, z), age: 0.3 });
  seat(rec);
  return rec;
}
D.toolDefs.push({
  id: 'building', name: 'Place Building', key: 'shift+R', group: 'city', icon: 'building', noBrush: true, cursor: 'crosshair', layer: 'buildings', sort: 5,
  desc: 'Drop a single building exactly where you want it: cottages, a church, a windmill, a keep and more.',
  defaults: { kind: 'cottage', rot: 0, snap: true, wealth: 0.5 },
  options: [
    { id: 'rot', label: 'Rotate', type: 'range', min: 0, max: 360, step: 5, fmt: v => v.toFixed(0) + '°' },
    { id: 'snap', label: 'Face nearest road', type: 'check' },
    { id: 'wealth', label: 'Wealth', type: 'range', min: 0, max: 1, fmt: pct },
    { id: 'reroll', label: '🎲 New variation', type: 'button', act: () => { ghostSeed++; if (D.Tools && D.Tools.hit && D.Tools.defs.building) D.Tools.defs.building.move(D.Tools.hit); } }
  ],
  hint: '<b>Click</b> to place · <b>Shift+wheel</b> or <b>, .</b> to rotate · <b>Shift+click</b> removes a building',
  catalogue(grid, item, o) {
    let cat = [];
    try { cat = D.Kit && D.Kit.catalogue ? D.Kit.catalogue() || [] : []; } catch (e) { cat = []; }
    cat.forEach(c => item(c.name, c.emoji || '🏠', o.kind === c.kind, () => { o.kind = c.kind; ghostSeed++; }));
    return cat.length ? 'Buildings' : null;
  },
  move(hit) {
    const o = D.Tools.o('building'), k = D.Kit;
    if (!hit) { ghostRec = null; if (k && k.showGhost) k.showGhost(null); return; }
    let rot = o.rot * DEG;
    if (o.snap) { const f = roadFacing(hit.x, hit.z); if (f !== null) rot = f + o.rot * DEG; }
    ghostRec = candidate(o, hit.x, hit.z, rot);
    ghostRec._ok = footprintOK(ghostRec);
    if (k && k.showGhost) { try { k.showGhost(ghostRec, ghostRec._ok); } catch (e) { } }
  },
  down(p, st, o) {
    st.cancel = true;
    if (!p) return;
    if (st.shift) {
      const b = Town.buildingAt(p.x, p.z); if (!b) return;
      D.History.begin('Remove Building', 'bulldoze');
      removeRecs([b]);
      D.History.end();
      return;
    }
    const b = ghostRec; if (!b) return;
    seat(b);
    if (!footprintOK(b)) { D.toast('Not enough room there (roads, water, other buildings or too steep).', 'warn'); return; }
    const meta = kmeta(b.kind);
    D.History.begin('Place ' + (meta.name || b.kind), 'building');
    const rec = cleanCopy(b); rec.id = nextBid++; rec.born = kclock();
    { const y = yearNow(); if (y > 0) rec.year = y; }       // built year (saved with the manual record)
    addManual(rec);
    if (D.Nature && D.Nature.clearWhere) D.Nature.clearWhere(b.x - b.w - 4, b.z - b.d - 4, b.x + b.w + 4, b.z + b.d + 4, (x, z) => pointInB(b, x, z, 3));
    D.History.end();
    ghostSeed++;
    if (D.Audio && D.Audio.thunk) D.Audio.thunk();
    this.move(p);
  },
  leave() { ghostRec = null; if (D.Kit && D.Kit.showGhost) D.Kit.showGhost(null); },
  cancel() { ghostRec = null; if (D.Kit && D.Kit.showGhost) D.Kit.showGhost(null); }
});
window.addEventListener('keydown', e => {
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (!D.Tools || D.Tools.cur !== 'building' || D.Tools.paste) return;
  if (e.key === ',' || e.key === '.') { const o = D.Tools.o('building'); o.rot = (o.rot + (e.key === '.' ? 15 : -15) + 360) % 360; D.emit('opts:values'); if (D.Tools.hit) D.Tools.defs.building.move(D.Tools.hit); }
});

// =====================================================================================================
// Settlement inspector, labels (§5.11)
// =====================================================================================================
const CSS = `
#town-inspector{position:absolute;right:calc(var(--panels-w, 292px) + 12px);top:60px;width:260px;z-index:30;background:var(--panel,#2a2b2f);color:var(--text,#d6d7da);
  border:1px solid var(--line2,#3d3f45);border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:12px/1.35 system-ui,sans-serif;padding:10px 12px 12px;user-select:none}
#town-inspector .ti-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
#town-inspector .ti-ico{width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:16px;flex:none}
#town-inspector input.ti-name{flex:1;min-width:0;background:transparent;border:1px solid transparent;color:#fff;font:600 14px system-ui,sans-serif;padding:2px 4px;border-radius:3px}
#town-inspector input.ti-name:hover,#town-inspector input.ti-name:focus{border-color:var(--line2,#3d3f45);background:rgba(0,0,0,.2);outline:none}
#town-inspector .ti-x{cursor:pointer;color:var(--text2,#9fa2a8);font-size:16px;padding:0 2px}
#town-inspector .ti-x:hover{color:#fff}
#town-inspector .ti-sub{color:var(--text2,#9fa2a8);margin:0 0 8px}
#town-inspector .ti-stats{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-bottom:8px}
#town-inspector .ti-stats b{color:#fff;font-weight:600}
#town-inspector .ti-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;margin:-2px 0 10px}
#town-inspector .ti-bar i{display:block;height:100%;background:var(--accent,#31a8ff);width:0}
#town-inspector .ti-row{margin:6px 0}
#town-inspector .ti-row label{display:flex;justify-content:space-between;color:var(--text2,#9fa2a8)}
#town-inspector .ti-row label span{color:#fff}
#town-inspector input[type=range]{width:100%;margin:2px 0 0;accent-color:var(--accent,#31a8ff)}
#town-inspector .ti-cap{font-size:10.5px;color:var(--text3,#6f7278);margin-top:-1px}
#town-inspector .ti-seg{display:flex;gap:3px;margin-top:3px}
#town-inspector .ti-seg button,#town-inspector .ti-btns button{flex:1;background:rgba(0,0,0,.18);color:var(--text,#d6d7da);border:1px solid var(--line2,#3d3f45);border-radius:3px;padding:3px 0;cursor:pointer;font:12px system-ui,sans-serif}
#town-inspector .ti-seg button.on{border-color:var(--accent,#31a8ff);background:var(--accentbg,rgba(49,168,255,.16));color:#fff}
#town-inspector .ti-seg button:hover,#town-inspector .ti-btns button:hover{border-color:var(--accent,#31a8ff)}
#town-inspector .ti-btns{display:flex;gap:4px;margin-top:8px}
#town-inspector .ti-btns button.danger:hover{border-color:#e05a4a;color:#ffb0a4}
#town-labels{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:hidden;z-index:12}
#town-labels .tl{position:absolute;left:0;top:0;white-space:nowrap;pointer-events:auto;cursor:pointer;padding:2px 7px;border-radius:10px;
  background:rgba(22,20,16,.62);color:#f4ead2;font:600 11px/1.3 Georgia,'Times New Roman',serif;letter-spacing:.2px;border:1px solid rgba(224,184,90,.35);
  text-shadow:0 1px 1px rgba(0,0,0,.7);will-change:transform,opacity}
#town-labels .tl:hover{background:rgba(40,34,22,.85);border-color:rgba(224,184,90,.8)}
#town-labels .tl.sel{border-color:#ffd77a;box-shadow:0 0 0 1px rgba(255,215,122,.4)}
#town-labels .tl em{font-style:normal;font-weight:400;opacity:.75}
#town-labels .tl.fresh::after{content:'';position:absolute;left:12%;right:12%;bottom:2px;height:1px;background:#e0b85a;transform-origin:0 50%;animation:tl-quill 1.8s ease-out both}
@keyframes tl-quill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
#town-inspector .ti-hist{color:var(--text2,#9fa2a8);font-size:11px;margin:-4px 0 8px;font-style:italic}
#town-inspector .ti-hist:empty{display:none}
#town-inspector .ti-row label.ti-chk{justify-content:flex-start;gap:6px;align-items:center;cursor:pointer;color:var(--text,#d6d7da)}`;
function ensureCss() { if (document.getElementById('town-css')) return; const st = document.createElement('style'); st.id = 'town-css'; st.textContent = CSS; document.head.appendChild(st); }
function vpEl() { return document.getElementById('viewport') || document.body; }
function morph(S) {
  const L = lives.get(S.id), d = L && L.deco;
  switch (S.type) {
    case 1: { const h = d ? d.houses : 0; const town = h >= 60 || (h >= 35 && S.tw.dens > 0.55); return (S.tw.walls !== 'none' && town ? 'walled ' : '') + (h < 10 ? 'hamlet' : town ? 'town' : 'village'); }
    case 2: return 'farmland';
    case 3: return 'castle';
    case 4: return d && d.items.length > 400 ? 'abbey' : 'monastery';
    case 5: return d && d.houses > 30 ? 'port' : 'harbour';
  }
  return 'settlement';
}
function progressOf(S) {
  if (S.pending && !S.plan) return { txt: 'planning…', p: 0, growing: true };
  const L = lives.get(S.id);
  if (!L || !L.deco) return { txt: S.pending ? 'planning…' : '', p: 0, growing: !!S.pending };
  const n = L.deco.items.length, p = n ? Math.min(1, L.idx / n) : 1;
  if (p >= 1 && !(L.qi < L.queue.length)) return { txt: S.pending ? 'expanding…' : 'grown', p: 1, growing: !!S.pending };
  return { txt: 'growing ' + Math.round(p * 100) + '%', p, growing: true };
}
function statsOf(S) {
  const L = lives.get(S.id); let b = 0, pop = 0;
  if (L) L.shown.forEach(e => { if (!e.recs) return; for (const r of e.recs) { b++; pop += popOf(r); } });
  return { b, pop };
}
function popOf(r) { const k = r.kind; return k === 'cottage' || k === 'longhouse' || k === 'fishhut' ? 3 : HOUSE_KINDS[k] ? 5 : 0; }
let insEl = null, insSig = '', insT = 0;
Town.select = function (sid) {
  sid = sid && list.has(sid) ? sid : 0;
  Town.selected = sid;
  if (D.TU && D.TU.uSelSettle) D.TU.uSelSettle.value = sid;
  if (!sid) { if (insEl) insEl.style.display = 'none'; insSig = ''; return; }
  ensureCss();
  if (!insEl) { insEl = document.createElement('div'); insEl.id = 'town-inspector'; vpEl().appendChild(insEl); insEl.addEventListener('keydown', e => e.stopPropagation()); insEl.addEventListener('pointerdown', e => e.stopPropagation()); }
  insEl.style.display = '';
  insSig = ''; refreshInspector(true);
};
function insSignature(S) { return [S.id, S.uid, S.name, S.type, JSON.stringify(S.tw), S.pending ? S.pending.jobId : 0, planId(S.plan || {}), S.grow !== false, S.fy | 0, S.by || 'p'].join('|'); }
// the inspector's history lines: founding, lordship (realm.js), great works in progress (works.js)
function histLines(S) {
  const out = [];
  if (S.fy > 0) out.push(`Founded ${S.fy | 0}${S.by === 'h' ? ' · by history' : ''}`);
  const o = originOf(S);
  try { if (D.Realm && D.Realm.describe) { const t = D.Realm.describe(o.x, o.z); if (t) out.push(String(t)); } } catch (e) { }
  try {
    if (D.Works && D.Works.list) for (const w of D.Works.list() || []) {
      if (!w || w.uid !== S.uid || w.done) continue;
      const p = D.Works.progOf ? D.Works.progOf(w.wid) : undefined;
      out.push(`${w.kind === 'keep' ? 'Stone keep' : w.kind === 'bridge' ? 'Stone bridge' : 'Cathedral'} · ${Math.round(clamp(p === undefined ? 1 : p, 0, 1) * 100)}% · begun ${Math.floor(w.y0 || 0)}`);
    }
  } catch (e) { }
  return out.map(escapeHtml).join('<br>');
}
const SLIDERS = [['dens', 'Density', 'Re-plans streets'], ['wealth', 'Wealth', 'Renovates houses'], ['layout', 'Layout', 'Re-plans streets'], ['squares', 'Squares', 'Re-plans streets'], ['greens', 'Greens', 'Re-plans streets'], ['gardens', 'Gardens', 'Re-plans streets']];
function refreshInspector(force) {
  if (!insEl || !Town.selected) return;
  const S = list.get(Town.selected);
  if (!S) { Town.select(0); return; }
  const sig = insSignature(S);
  if (force || sig !== insSig) {
    insSig = sig;
    const t = TYPES[S.type] || TYPES[1];
    const L = lives.get(S.id), spd = L ? L.speed : 1;
    const fmt = (k, v) => k === 'layout' ? (v < 0.34 ? 'Winding' : v < 0.67 ? 'Mixed' : 'Planned') : pct(v);
    insEl.innerHTML = `<div class="ti-head"><div class="ti-ico" style="background:${t.col}">${t.emoji}</div><input class="ti-name" maxlength="40" spellcheck="false"><span class="ti-x" title="Close">×</span></div>
      <div class="ti-sub"></div>
      <div class="ti-hist"></div>
      <div class="ti-stats"><div>Buildings <b class="ti-b">0</b></div><div>People <b class="ti-p">0</b></div></div>
      <div class="ti-bar"><i></i></div>
      ${SLIDERS.map(([k, lab, cap]) => `<div class="ti-row"><label>${lab}<span data-v="${k}">${fmt(k, S.tw[k])}</span></label><input type="range" min="0" max="1" step="0.01" data-k="${k}" value="${S.tw[k]}"><div class="ti-cap">${cap}</div></div>`).join('')}
      <div class="ti-row"><label>Walls</label><div class="ti-seg ti-walls">${[['none', 'None'], ['palisade', 'Palisade'], ['stone', 'Stone']].map(([v, l]) => `<button data-w="${v}" class="${S.tw.walls === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="ti-cap">Rebuilds walls</div></div>
      <div class="ti-row"><label>Growth speed</label><div class="ti-seg ti-speed">${[[0, '⏸'], [0.5, '½'], [1, '1'], [2, '2'], [4, '4']].map(([v, l]) => `<button data-s="${v}" class="${spd === v ? 'on' : ''}">${l}</button>`).join('')}<button data-fin="1" title="Finish now (Shift: instantly)">⏭</button></div></div>
      ${D.Story || D.Director ? `<div class="ti-row"><label class="ti-chk" title="History may extend this place, wall it and make it richer (it never removes anything)"><input type="checkbox" class="ti-grow"${S.grow !== false ? ' checked' : ''}> Let history grow this place</label></div>` : ''}
      <div class="ti-btns"><button data-a="reroll" title="New seed, re-plan">🎲 Reroll</button><button data-a="regrow" title="Re-plan with the same seed and watch it grow again">↻ Regrow</button><button data-a="demolish" class="danger" title="Remove this settlement and its zone">🗑 Demolish</button></div>`;
    const nm = insEl.querySelector('.ti-name'); nm.value = S.name;
    nm.addEventListener('change', () => renameSettlement(S.id, nm.value));
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') nm.blur(); });
    insEl.querySelector('.ti-x').onclick = () => Town.select(0);
    insEl.querySelectorAll('input[type=range]').forEach(r => {
      r.addEventListener('input', () => { const k = r.dataset.k, sp = insEl.querySelector(`[data-v="${k}"]`); if (sp) sp.textContent = fmt(k, +r.value); });
      r.addEventListener('change', () => { const k = r.dataset.k, lab = SLIDERS.find(s => s[0] === k)[1]; applyTweak(S.id, k, +r.value, lab); r.blur(); });
    });
    insEl.querySelectorAll('.ti-walls button').forEach(b => b.onclick = () => applyTweak(S.id, 'walls', b.dataset.w, 'Walls'));
    insEl.querySelectorAll('.ti-speed button').forEach(b => b.onclick = e => {
      const L2 = liveOf(S.id);
      if (b.dataset.fin) { finishLive(L2, e.shiftKey); finishBoostT = now() + 5000; return; }
      L2.speed = +b.dataset.s; insEl.querySelectorAll('.ti-speed button[data-s]').forEach(x => x.classList.toggle('on', +x.dataset.s === L2.speed));
    });
    insEl.querySelectorAll('.ti-btns button').forEach(b => b.onclick = () => settlementAction(S.id, b.dataset.a));
    const gr = insEl.querySelector('.ti-grow'); if (gr) gr.addEventListener('change', () => { applyGrow(S.id, gr.checked); gr.blur(); });
  }
  const pr = progressOf(S), st = statsOf(S);
  const sub = insEl.querySelector('.ti-sub'); const txt = `${(TYPES[S.type] || {}).name || ''} · ${morph(S)}${pr.txt ? ' · ' + pr.txt : ''}`;
  if (sub.textContent !== txt) sub.textContent = txt;
  const hl = insEl.querySelector('.ti-hist'); if (hl) { const h = histLines(S); if (hl._h !== h) { hl.innerHTML = h; hl._h = h; } }
  insEl.querySelector('.ti-b').textContent = st.b.toLocaleString();
  insEl.querySelector('.ti-p').textContent = st.pop.toLocaleString();
  insEl.querySelector('.ti-bar i').style.width = Math.round(pr.p * 100) + '%';
}
function applyTweak(sid, k, v, label) {
  const S = list.get(sid); if (!S || S.tw[k] === v) return;
  D.History.begin(`${S.name}: ${label} ${typeof v === 'number' ? Math.round(v * 100) + '%' : v}`, 'zone');
  D.History.touchChunk('town', S.id);
  S.tw = Object.assign({}, S.tw, { [k]: v });
  if (k === 'wealth' || k === 'walls') { redecorateQ.add(S.id); S.plock = Object.assign({}, S.plock, { [k]: 1 }); }   // history never overrides it
  else S.pending = nextPending(S, S.plan ? 'replan' : 'found');
  D.History.end();
  emitChanged();
}
function applyGrow(sid, on) {
  const S = list.get(sid); if (!S || (S.grow !== false) === on) return;
  D.History.begin(`${S.name}: ${on ? 'Let history grow it' : 'History leaves it be'}`, 'zone');
  D.History.touchChunk('town', S.id);
  S.grow = on;
  D.History.end();
  emitChanged();
}
function renameSettlement(sid, name) {
  const S = list.get(sid); name = String(name || '').trim().slice(0, 40);
  if (!S || !name || name === S.name) return;
  D.History.begin('Rename', 'zone'); D.History.touchChunk('town', sid); S.name = name; D.History.end();
  emitChanged();
}
function settlementAction(sid, a) {
  const S = list.get(sid); if (!S) return;
  if (a === 'reroll' || a === 'regrow') {
    D.History.begin(`${S.name}: ${a === 'reroll' ? 'Reroll' : 'Regrow'}`, 'zone');
    D.History.touchChunk('town', sid);
    if (a === 'reroll') S.seed = hash32(S.seed, 'reroll', Town.nextJob);
    S.pending = nextPending(S, S.plan ? 'replan' : 'found');
    D.History.end();
    if (a === 'regrow') regrowSids.add(sid);
    emitChanged();
  } else if (a === 'demolish') {
    D.History.begin(`Demolish ${S.name}`, 'trash');
    deleteSettlement(S);
    D.History.end();
    Town.select(0);
    D.toast(`${S.name} was demolished.`);
    emitChanged();
  }
}
// ---- floating labels -------------------------------------------------------------------------------------
let labelsEl = null; const labelEls = new Map(); const v3 = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
function updateLabels() {
  const cam = D.camera; if (!cam || !v3) return;
  const vis = !(D.UI && D.UI.photo) && (!D.Layers || D.Layers.visible('buildings')) && Town.showLabels !== false && (!D.Cam || D.Cam.mode === 'orbit' || D.Cam.mode === undefined);
  if (!labelsEl) { if (!list.size) return; ensureCss(); labelsEl = document.createElement('div'); labelsEl.id = 'town-labels'; vpEl().appendChild(labelsEl); }
  labelsEl.style.display = vis ? '' : 'none';
  if (!vis) return;
  const vp = vpEl(), W2 = vp.clientWidth || 1, H2 = vp.clientHeight || 1;
  const arr = [];
  list.forEach(S => {
    if (!S.plan && D.History.active()) return; // planless origins need a zone scan: skip them mid-stroke
    if (viewY !== undefined && (S.fy | 0) > viewY) return;   // replay: not founded yet
    const o = originOf(S); const y = D.Terrain.hAt(o.x, o.z) + 22;
    const d = Math.hypot(cam.position.x - o.x, cam.position.y - y, cam.position.z - o.z);
    if (d < 4200) arr.push([d, S, o, y]);
  });
  arr.sort((a, b) => a[0] - b[0]);
  const keep = new Set();
  for (let i = 0; i < Math.min(24, arr.length); i++) {
    const [d, S, o, y] = arr[i];
    v3.set(o.x, y, o.z).project(cam);
    if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) continue;
    keep.add(S.id);
    let el = labelEls.get(S.id);
    if (!el) { el = document.createElement('div'); el.className = 'tl tl-label'; el.dataset.sid = S.id; el.addEventListener('click', ev => { ev.stopPropagation(); Town.select(+el.dataset.sid); }); el.addEventListener('pointerdown', ev => ev.stopPropagation()); labelsEl.appendChild(el); labelEls.set(S.id, el); }
    const pr = progressOf(S);
    const html = `${escapeHtml(S.name)} <em>· ${morph(S)}${pr.growing && pr.p > 0 && pr.p < 1 ? ' · ' + Math.round(pr.p * 100) + '%' : pr.txt === 'planning…' ? ' · planning' : ''}</em>`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.transform = `translate(${((v3.x + 1) / 2 * W2).toFixed(1)}px, ${((1 - v3.y) / 2 * H2).toFixed(1)}px) translate(-50%, -100%)`;
    el.style.opacity = (1 - D.smooth(3000, 4200, d)).toFixed(3);
    el.classList.toggle('sel', S.id === Town.selected);
    // Atlas restyles labels by type (atlas.js CSS); 'fresh' = founded in the last 2 game years (quill underline)
    const ty = (TYPES[S.type] || TYPES[1]).short; if (el.dataset.type !== ty) el.dataset.type = ty;
    const yN = yearNow(); el.classList.toggle('fresh', S.fy > 0 && yN > 0 && yN - S.fy < 2 && yN >= S.fy && viewY === undefined);
    el.style.display = '';
  }
  labelEls.forEach((el, sid) => { if (!keep.has(sid)) { if (!list.has(sid)) { el.remove(); labelEls.delete(sid); } else el.style.display = 'none'; } });
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// =====================================================================================================
// Public API: counts, collision, bulldoze, copy & paste, navigator (§3.5, §5.9)
// =====================================================================================================
Town.count = () => chunks.reduce((s, a) => s + a.length, 0);
// player-placed (manual, sid-less) records: story.js guardSnap uses it for the I2 "history never touches manual" check
Town.manualCount = () => { let n = 0; for (let ci = 0; ci < chunks.length; ci++) { const a = chunks[ci]; for (let q = 0; q < a.length; q++) if (!a[q].sid) n++; } return n; };
Town.population = () => { let p = 0; chunks.forEach(a => a.forEach(r => { p += popOf(r); })); return p; };
Town.zoneAt = (x, z) => W.zone[cellK(x, z) * 4];
Town.buildingAt = function (x, z) { let hit = null; forNear(x - 5, z - 5, x + 5, z + 5, b => { if (pointInB(b, x, z)) { hit = b; return false; } }); return hit; };
Town.collide = function (x, z, r) {
  let out = null;
  forNear(x - 90, z - 90, x + 90, z + 90, b => {
    if (kmeta(b.kind).collide === false) return;
    const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const hw = b.w / 2 + r, hd = b.d / 2 + r;
    if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
      const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
      let nlx = lx, nlz = lz;
      if (px < pz) nlx = (lx < 0 ? -1 : 1) * hw; else nlz = (lz < 0 ? -1 : 1) * hd;   // (Math.sign(0) would not push)
      out = [b.x + nlx * c + nlz * s, b.z - nlx * s + nlz * c];
      x = out[0]; z = out[1];
    }
  });
  return out;
};
// remove records inside an open history entry: manual ones directly, settlement ones by razing their key
function removeRecs(recs) {
  const raze = new Map();
  for (const b of recs) {
    if (!b.sid) { removeManual(b, true); continue; }
    const S = list.get(b.sid); if (!S) continue;
    let a = raze.get(b.sid); if (!a) raze.set(b.sid, a = []);
    const k = baseKey(b.key); if (a.indexOf(k) < 0) a.push(k);
  }
  raze.forEach((keys, sid) => {
    const S = list.get(sid);
    D.History.touchChunk('town', sid);
    S.razed = S.razed.concat(keys);
    refilter(sid, false);
  });
  flushRemovals();
  if (raze.size) emitChanged();
  return recs.length;
}
Town.removeIn = function (x, z, r) {
  const hit = [];
  forNear(x - r, z - r, x + r, z + r, b => {
    const cs = corners(b).concat([[b.x, b.z]]);
    if (cs.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < r) || pointInB(b, x, z)) hit.push(b);
  });
  return hit.length ? removeRecs(hit) : 0;
};
Town.clearRect = function (x0, z0, x1, z1) {
  const hit = [];
  forNear(x0, z0, x1, z1, b => { if (b.x >= x0 && b.x <= x1 && b.z >= z0 && b.z <= z1) hit.push(b); });
  return hit.length ? removeRecs(hit) : 0;
};
Town.clearCorridor = function (seg, w) {
  if (!D.Roads || !D.Roads.segSamples) return;
  const S2 = D.Roads.segSamples(seg);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let q = 0; q < S2.n; q++) { x0 = Math.min(x0, S2.x[q]); x1 = Math.max(x1, S2.x[q]); z0 = Math.min(z0, S2.z[q]); z1 = Math.max(z1, S2.z[q]); }
  const kill = [];
  forNear(x0 - w, z0 - w, x1 + w, z1 + w, b => {
    if (b.sid) return;
    const cs = corners(b).concat([[b.x, b.z]]);
    for (const [x, z] of cs) { const r = D.Roads.nearestOnSeg(seg, x, z); if (r.d < w && (!D.Roads.flagAt || D.Roads.flagAt(seg, r.dist) !== 2)) { kill.push(b); return; } }
  });
  kill.forEach(b => removeManual(b, true));
  const bb = [x0 - w, z0 - w, x1 + w, z1 + w];
  list.forEach(S => { const b2 = sidWorldBB(S.id, 20); if (bbHit(b2, bb)) needRefilter.add(S.id); });
};
Town.copyIn = function (x0, z0, x1, z1) {
  const out = [];
  forNear(x0, z0, x1, z1, b => {
    if (b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1) return;
    const o = {}; for (const k in b) if (k[0] !== '_' && k !== 'die' && k !== 'sid' && k !== 'key' && k !== 'auto') o[k] = b[k];
    o.x = b.x - x0; o.z = b.z - z0; out.push(o);
  });
  return out;
};
Town.pasteList = function (arr, xform, rot) {
  arr.forEach(src => {
    const [x, z] = xform(src.x, src.z);
    if (!D.inMap(x, z)) return;
    const b = Object.assign({}, src, { id: nextBid++, x, z, rot: src.rot - rot * PI / 2, auto: false, born: kclock() });
    delete b.sid; delete b.key;
    Town.clearRect(x - 1, z - 1, x + 1, z + 1);
    seat(b); addManual(b);
  });
};
Town.drawNav = function (ctx, S) {
  const k = S / SIZE;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  lives.forEach(L => {
    ctx.strokeStyle = 'rgba(222,200,150,0.85)';
    L.shown.forEach(e => {
      const it = e.item; if (it.t !== 'lane') return;
      ctx.lineWidth = Math.max(0.5, it.w * k * 1.3);
      ctx.beginPath(); const p = it.pts;
      for (let q = 0; q < p.length; q += 2) q ? ctx.lineTo(p[q] * k, p[q + 1] * k) : ctx.moveTo(p[q] * k, p[q + 1] * k);
      ctx.stroke();
    });
  });
  const cols = {};
  chunks.forEach(a => a.forEach(b => {
    if (viewY !== undefined && b.year > viewY) return;       // replay: not built yet
    const S2 = b.sid ? list.get(b.sid) : null;
    const t = S2 ? S2.type : 0;
    ctx.fillStyle = cols[t] || (cols[t] = t ? TYPES[t].col : '#f0e6d2');
    const s = Math.max(1, Math.sqrt((b.w * b.d) || 60) * k);
    ctx.fillRect(b.x * k - s / 2, b.z * k - s / 2, s, s);
  }));
  ctx.font = '600 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  list.forEach(S2 => {
    if (viewY !== undefined && (S2.fy | 0) > viewY) return;
    const o = originOf(S2), x = o.x * k, y = o.z * k - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(S2.name, x + 0.8, y + 0.8);
    ctx.fillStyle = S2.id === Town.selected ? '#ffd77a' : '#fff4dc'; ctx.fillText(S2.name, x, y);
  });
  ctx.restore();
};
Town._debug = { march, chamfer, traceMaskLoops, crestSnap, dpSimplify, chaikin, planJob: (S, job) => { const h = { deadline: Infinity, ctx: null }, it = planJob(copyRec(S), job, h); let r; do { r = it.next(); } while (!r.done); return { plan: r.value, ctx: h.ctx }; }, decorate, lives, AT, jobs, needRefilter };
Town.finishAll = function (instant) {
  lives.forEach(L => finishLive(L, instant));
  finishBoostT = now() + 8000;
};

// =====================================================================================================
// History hooks (Living History spec §5.5): read-only queries for story/director/wayfarer/works/realm, and
// commit-only mutators. Mutators refuse (0/false + a warning) unless D.Story is committing inside its open
// History entry (I1); they validate everything first and never throw after their first write.
// =====================================================================================================
let catchUp = false;
function committing(fn) {
  const St = D.Story;
  if (St && St.committing === true && D.History.active()) return true;
  console.warn('[town] Town.hist.' + fn + ' called outside a history commit: ignored');
  return false;
}
Town.zoneVersion = () => zoneVer;
Town.originOf = function (sid) { const S = list.get(sid); if (!S) return null; const o = originOf(S); return { x: o.x, z: o.z }; };
// I3: may history claim this 16 m cell for a settlement of `type` (sid 0 = a new one)?
function canClaim(k, type, sid) {
  if (!(k >= 0 && k < N * N)) return false;
  const Z = W.zone, o = k * 4;
  if (Z[o] !== 0 || Z[o + 1] !== 0) return false;
  const i = k % N, j = (k / N) | 0;
  if (i < 1 || j < 1 || i > N - 2 || j > N - 2) return false;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {      // gap rule: zones never auto-merge
    if (!di && !dj) continue;
    const q = ((j + dj) * N + i + di) * 4, g = Z[q + 1];
    if (g && g !== sid && Z[q] === type) return false;
  }
  const T = D.Terrain; if (!T || !T.hAt) return false;
  const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
  if (T.isWet(x, z)) return false;
  // average slope of the four 8 m quadrants
  const h = [];
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) h.push(T.hAt(x + a * 8, z + b * 8));
  let s = 0;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const p = b * 3 + a, gx = ((h[p + 1] - h[p]) + (h[p + 4] - h[p + 3])) / 16, gz = ((h[p + 3] - h[p]) + (h[p + 4] - h[p + 1])) / 16;
    s += Math.hypot(gx, gz);
  }
  if (s / 4 > 0.35) return false;
  let man = false;
  const cellB = { x, z, rot: 0, w: CELL, d: CELL };
  forManual(x - 8, z - 8, x + 8, z + 8, m => { if (Math.abs(m.x - x) > 60 || Math.abs(m.z - z) > 60) return; if (obbOverlap(cellB, m, 0.5)) { man = true; return false; } });
  return !man;
}
// per-plan derived facts (plans are immutable once attached, so a WeakMap by plan is exact)
const planFacts = new WeakMap();
function factsOf(P) {
  let f = planFacts.get(P); if (f) return f;
  let houses = 0, ms = 0, keepSp = null, gw = false;
  for (const p of P.plots) if (p.role === 'house') houses++;
  for (const s of P.specials) {
    const ex = s.extra || {};
    if (ex.ms === 'church') ms |= ex.tag === 'church2' ? 64 : 1;
    if (s.kind === 'tavern') ms |= 2;
    if (s.kind === 'smithy') ms |= 4;
    if (s.kind === 'watermill' || s.kind === 'windmill') ms |= 8;
    if (s.kind === 'markethall' || ex.tithe) ms |= 16;
    if (s.kind === 'hall' && ex.ms === 'guild') ms |= 32;
    if (s.kind === 'greatwork') { ms |= 256; gw = true; }
    if ((s.kind === 'keep' || s.kind === 'motte') && P.origin && Math.hypot(s.x - P.origin.x, s.z - P.origin.z) < 1) keepSp = s;
  }
  if (P.origin && P.origin.kind === 'market') ms |= 16;
  // cells the plan actually uses (coverage = how full the zone is)
  const cov = new Set(), add = (x, z) => cov.add(cellK(x, z));
  for (const p of P.plots) { const c = Math.cos(p.rot), s = Math.sin(p.rot), dep = p.d + (p.yardD || 0); for (let lz = -p.d / 2; lz <= -p.d / 2 + dep; lz += 8) for (let lx = -p.w / 2; lx <= p.w / 2; lx += 8) add(p.x + lx * c + lz * s, p.z - lx * s + lz * c); }
  for (const s of P.specials) { if (!(s.w > 0)) { add(s.x, s.z); continue; } const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); for (let lz = -s.d / 2; lz <= s.d / 2; lz += 8) for (let lx = -s.w / 2; lx <= s.w / 2; lx += 8) add(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c); }
  for (const A of P.areas) { const b = bboxOf(A.poly, 0); for (let z = b[1] + 4; z < b[3]; z += 12) for (let x = b[0] + 4; x < b[2]; x += 12) if (pip(A.poly, x, z)) add(x, z); }
  for (const L of P.lanes) for (let q = 0; q + 1 < L.pts.length; q += 2) add(L.pts[q], L.pts[q + 1]);
  f = { houses, ms, keepSp, gw, cov };
  planFacts.set(P, f);
  return f;
}
function morphOf(S, houses) {
  switch (S.type) {
    case 1: { const town = houses >= 60 || (houses >= 35 && S.tw.dens > 0.55); return (S.tw.walls !== 'none' && town ? 'walled ' : '') + (houses < 10 ? 'hamlet' : town ? 'town' : 'village'); }
    case 2: return 'farmland';
    case 3: return 'castle';
    case 4: return morph(S);
    case 5: return houses > 30 ? 'port' : 'harbour';
  }
  return 'settlement';
}
function capOf(S, ha) {
  const d = S.tw.dens;
  if (S.type === 1) return Math.max(6, Math.min(3000, Math.round(ha * (8 + 28 * d))));
  if (S.type === 5) return Math.max(6, Math.round(ha * (4 + 10 * d)));
  if (S.type === 3) return clamp(Math.round(ha * (2 + 6 * d)), 4, 60);
  return 0;                                  // farmland, monastery: coverage alone says how full they are
}
let hlCache = null, hlKey = '';
function histList() {
  const key = zoneVer + '|' + histVer;
  if (hlCache && hlKey === key) return hlCache;
  const bb = allBBs(), Z = W.zone, out = [];
  for (const sid of Array.from(list.keys()).sort((a, b) => a - b)) {
    const S = list.get(sid), P = S.plan, cells = bb.mc[sid], ha = cells * CELL * CELL / 1e4;
    const f = P ? factsOf(P) : null;
    let covered = 0;
    if (f) f.cov.forEach(k => { if (Z[k * 4 + 1] === sid && Z[k * 4] === S.type) covered++; });
    const houses = f ? f.houses : 0, cap = capOf(S, ha), coverage = cells ? Math.min(1, covered / cells) : 0;
    const full = clamp(Math.max(coverage, cap > 0 ? houses / cap : 0), 0, 1);
    let keep = null;
    if (S.type === 3 && f && f.keepSp) { let wk = null; try { wk = D.Works && D.Works.workAt ? D.Works.workAt(S.uid, 'keep') : null; } catch (e) { } keep = wk ? 'keep' : S.tw.wealth < 0.35 ? 'motte' : S.tw.wealth < 0.7 ? 'keep' : 'round'; }
    let ms = f ? f.ms : 0;
    if (f && S.type === 1 && (ms & 1) && houses >= 300 && S.tw.wealth > 0.7 && !f.gw) ms |= 128;
    const o = originOf(S), wb = sidWorldBB(sid, 0);
    // share of houses outside a stone wall (for the director's "rewall")
    let wallOut = 0;
    const L = lives.get(sid);
    if (S.tw.walls !== 'none' && L && L.deco && L.deco.wall && P) { let hn = 0, out2 = 0; for (const p of P.plots) if (p.role === 'house') { hn++; if (!L.deco.wall.inside(p.x, p.z)) out2++; } wallOut = hn ? out2 / hn : 0; }
    out.push(Object.freeze({ sid, uid: S.uid, type: S.type, name: S.name, by: S.by === 'h' ? 'h' : 'p', grow: S.grow !== false, fy: S.fy | 0, epochs: S.epochs | 0,
      pending: !!S.pending, cells, ha, houses, cap, full, wealth: S.tw.wealth, walls: S.tw.walls, dens: S.tw.dens, plock: Object.assign({}, S.plock),
      x: o.x, z: o.z, bb: wb || [o.x, o.z, o.x, o.z], ms, morph: morphOf(S, houses), keep, hasWork: !!(f && f.gw) || keep === 'keep' && !!(D.Works && D.Works.workAt && D.Works.workAt(S.uid, 'keep')) || !!(S.pending && S.pending.work),
      wallOut, wallable: !!(P && P.wallO >= 0), ey: (S.ey || []).slice() }));
  }
  hlCache = Object.freeze(out); hlKey = key;
  return hlCache;
}
function restampYears(sid) {
  const S = list.get(sid), L = lives.get(sid); if (!S || !L) return 0;
  const Kt = D.Kit; let n = 0;
  L.shown.forEach(e => {
    if (!e.recs) return;
    const y = itemYear(S, e.item);
    for (const rec of e.recs) {
      if ((rec.year || 0) === y) continue;
      try { if (Kt && Kt.setYear) Kt.setYear(rec, y); } catch (er) { }
      if (y > 0) rec.year = y; else delete rec.year;
      n++;
    }
  });
  return n;
}
function claimCells(S, cells, ep) {       // cells already validated; inside the open entry
  let i0 = N, j0 = N, i1 = -1, j1 = -1;
  for (const k of cells) { const i = k % N, j = (k / N) | 0; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  if (i1 < 0) return;
  D.History.touch('zone', i0, j0, i1, j1);
  const Z = W.zone;
  for (const k of cells) { Z[k * 4] = S.type; Z[k * 4 + 1] = S.id; Z[k * 4 + 3] = ep; }
  zoneRect(i0, j0, i1, j1);
}
Town.hist = {
  list: histList,
  info(sid) { for (const e of histList()) if (e.sid === sid) return e; return null; },
  byUid(uid) { for (const [sid, S] of list) if (S.uid === uid) return sid; return 0; },
  busy() { let n = 0; list.forEach(S => { if (S.pending) n++; }); return n; },
  canClaim,
  // where lanes leave the zone (road goals for wayfarer): [{x, z, dx, dz}] (unit outward direction)
  gates(sid) {
    const S = list.get(sid); if (!S || !S.plan) return [];
    const Z = W.zone, inZ = (x, z) => { const k = cellK(x, z) * 4; return Z[k + 1] === sid && Z[k] === S.type; };
    const out = [], push = (x, z, dx, dz) => { const l = Math.hypot(dx, dz) || 1; if (out.some(g => Math.hypot(g.x - x, g.z - z) < 60)) return; out.push({ x, z, dx: dx / l, dz: dz / l }); };
    const L = lives.get(sid);
    if (L && L.deco && L.deco.wall) for (const g of L.deco.wall.gates) { const o = originOf(S); push(g.x, g.z, g.x - o.x, g.z - o.z); }
    for (const Ln of S.plan.lanes) {
      if (Ln.rank > 1) continue;
      const p = Ln.pts;
      for (let q = 2; q + 1 < p.length; q += 2) { const a = inZ(p[q - 2], p[q - 1]), b = inZ(p[q], p[q + 1]); if (a && !b) push(p[q - 2], p[q - 1], p[q] - p[q - 2], p[q + 1] - p[q - 1]); else if (!a && b) push(p[q], p[q + 1], p[q - 2] - p[q], p[q - 1] - p[q + 1]); }
      if (Ln.tip && p.length >= 4) { const n = p.length; push(p[n - 2], p[n - 1], p[n - 2] - p[n - 4], p[n - 1] - p[n - 3]); }
    }
    if (!out.length) { const o = originOf(S); out.push({ x: o.x, z: o.z, dx: 1, dz: 0 }); }
    return out;
  },
  // the high street: the longest rank-0 lane (its steps joined), or null
  mainStreet(sid) {
    const S = list.get(sid); if (!S || !S.plan) return null;
    const groups = new Map();
    for (const Ln of S.plan.lanes) { if (Ln.rank !== 0) continue; const base = Ln.key.slice(0, Ln.key.lastIndexOf('.')); let g = groups.get(base); if (!g) groups.set(base, g = []); g.push(Ln); }
    let best = null, bl = 0;
    Array.from(groups.keys()).sort().forEach(b => {
      const st = groups.get(b).sort((x, y) => (+x.key.slice(x.key.lastIndexOf('.') + 1) || 0) - (+y.key.slice(y.key.lastIndexOf('.') + 1) || 0));
      const pts = []; for (const Ln of st) for (let q = pts.length ? 2 : 0; q < Ln.pts.length; q++) pts.push(Ln.pts[q]);
      const len = polyLen(pts); if (len > bl) { bl = len; best = pts; }
    });
    return best && best.length >= 4 ? Float32Array.from(best) : null;
  },
  workSite(uid, wid) {
    const sid = Town.hist.byUid(uid); if (!sid) return false;
    const S = list.get(sid);
    if (S.plan) for (const sp of S.plan.specials) if (sp.kind === 'greatwork' && sp.extra && sp.extra.wid === wid) return { key: sp.key, x: sp.x, z: sp.z, rot: sp.rot || 0, w: sp.w, d: sp.d, y: D.Terrain ? D.Terrain.hAt(sp.x, sp.z) : 0 };
    if (S.pending && S.pending.wid === wid) return null;
    return false;
  },
  forWork(uid, wid, fn) {
    const sid = Town.hist.byUid(uid), L = sid ? lives.get(sid) : null; if (!L) return;
    L.shown.forEach(e => { if (e.recs) for (const r of e.recs) if (r.gw === wid) fn(r); });
  },
  fillYearGrid(out) {
    out.fill(0);
    const bb = allBBs(), Z = W.zone;
    list.forEach((S, sid) => {
      if (!bb.hc[sid]) return;
      const ey = S.ey || [], fy = S.fy | 0;
      if (!fy && !ey.length) return;
      for (let j = bb.j0[sid]; j <= bb.j1[sid]; j++) for (let i = bb.i0[sid]; i <= bb.i1[sid]; i++) {
        const k = j * N + i; if (Z[k * 4 + 1] !== sid || !Z[k * 4]) continue;
        const a = Z[k * 4 + 3], y = (a >= 1 && a <= 254 && +ey[a]) || fy;
        if (y > 0) out[k] = Math.min(65535, Math.round(y));
      }
    });
    return out;
  },
  restampYears,
  setCatchUp(on) { catchUp = !!on; },
  // ---- commit-only mutators ------------------------------------------------------------------------------
  found(type, cells, o) {
    o = o || {};
    if (!committing('found')) return 0;
    if (!(type >= 1 && type <= 5) || !cells || cells.length < 10) return 0;
    for (let q = 0; q < cells.length; q++) if (!canClaim(cells[q], type, 0)) return 0;
    const slot = freeSlot(); if (!slot) return 0;
    D.History.touchChunk('town', slot);
    const uid = Town.nextUid++, seed = hash32(W.seed || 1, cells[0], uid), y = yearNow();
    const S = { id: slot, uid, type, seed, name: '', tw: twFrom(o.tw), epochs: 1, razed: [], plan: null,
      pending: { kind: 'found', jobId: Town.nextJob++, epoch: 1, src: 'dir' }, pin: o.pin ? [+o.pin[0], +o.pin[1]] : null,
      by: 'h', fy: Math.floor(y), ey: [], grow: true, plock: {} };
    if (y > 0) stampEy(S, 1, y);
    S.name = makeName(type, cells, S.tw.walls, seed, slot);
    list.set(slot, S);
    claimCells(S, cells, 1);
    if (o.instant || catchUp) instantJobs.add(S.pending.jobId);
    needReconcile.add(slot);
    emitChanged();
    return slot;
  },
  extend(sid, cells, o) {
    o = o || {};
    if (!committing('extend')) return 0;
    const S = list.get(sid); if (!S || !cells || !cells.length) return 0;
    if (S.pending && (S.pending.kind === 'work' || S.pending.work)) return 0;   // a great work is being sited: wait
    const acc = [];
    for (let q = 0; q < cells.length; q++) if (canClaim(cells[q], S.type, sid)) acc.push(cells[q]);
    if (!acc.length) return 0;
    D.History.touchChunk('town', sid);
    const ep = Math.min(254, (S.epochs | 0) + 1), y = yearNow();
    S.epochs = ep;
    if (y > 0) stampEy(S, ep, y);
    claimCells(S, acc, ep);
    const old = S.pending, kind = !S.plan || (old && old.kind === 'found') ? 'found' : old && old.kind === 'replan' ? 'replan' : 'expand';
    const p = nextPending(S, kind);
    if (!old || old.src === 'dir') { p.src = 'dir'; if (o.rewall || (old && old.rewall)) p.rewall = 1; }
    S.pending = p;
    if (o.instant || catchUp) instantJobs.add(p.jobId);
    needReconcile.add(sid); needRefilter.add(sid);
    emitChanged();
    return acc.length;
  },
  setTweakQuiet(sid, k, v) {
    if (!committing('setTweakQuiet')) return false;
    const S = list.get(sid); if (!S || (k !== 'wealth' && k !== 'walls')) return false;
    if (S.plock && S.plock[k]) return false;
    if (k === 'walls' && v !== 'none' && v !== 'palisade' && v !== 'stone') return false;
    // a wall is only drawn when the plan has a wall order (>= 12 houses): never log a wall nobody can see
    if (k === 'walls' && v !== 'none' && S.tw.walls === 'none' && !(S.plan && S.plan.wallO >= 0)) return false;
    if (k === 'wealth') v = clamp(+v || 0, 0, 1);
    if (S.tw[k] === v) return false;
    D.History.touchChunk('town', sid);
    S.tw = Object.assign({}, S.tw, { [k]: v });
    redecorateQ.add(sid);
    emitChanged();
    return true;
  },
  requestWork(sid, o) {
    o = o || {};
    if (!committing('requestWork')) return 0;
    const S = list.get(sid), wid = o.wid | 0;
    if (!S || !S.plan || !wid || S.pending) return 0;
    if (S.plan.specials.some(sp => sp.kind === 'greatwork' && sp.extra && sp.extra.wid === wid)) return 0;
    const acc = [];
    if (o.cells) for (let q = 0; q < o.cells.length; q++) if (canClaim(o.cells[q], S.type, sid)) acc.push(o.cells[q]);
    D.History.touchChunk('town', sid);
    const p = { kind: 'work', jobId: Town.nextJob++, epoch: S.epochs, work: o.work || 'cathedral', wid, src: 'dir' };
    if (acc.length >= 8) {
      const ep = Math.min(254, (S.epochs | 0) + 1), y = yearNow();
      S.epochs = ep; if (y > 0) stampEy(S, ep, y);
      claimCells(S, acc, ep);
      p.epoch = ep; p.cellsEp = ep;
    }
    S.pending = p;
    if (o.instant || catchUp) instantJobs.add(p.jobId);
    needReconcile.add(sid); needRefilter.add(sid);
    emitChanged();
    return p.jobId;
  },
  stampPrehistory(y0) {
    if (!committing('stampPrehistory')) return 0;
    y0 = +y0 || 1086;
    let n = 0;
    for (const sid of Array.from(list.keys()).sort((a, b) => a - b)) {
      const S = list.get(sid); if ((S.fy | 0) > 0) continue;
      D.History.touchChunk('town', sid);
      const fy = y0 - 20 - (hash32(S.uid, 'pre') % 120), E = Math.max(1, S.epochs | 0), ey = [0];
      for (let e = 1; e <= E; e++) ey[e] = E > 1 ? fy + (y0 - 2 - fy) * (e - 1) / (E - 1) : fy;
      S.fy = fy; S.ey = ey;
      restampYears(sid);
      n++;
    }
    if (n) emitChanged();
    return n;
  },
  redecorate(uid) { const sid = Town.hist.byUid(uid); if (sid) { redecorateQ.add(sid); histVer++; } },
  // cheap change counter (zone + records): lets the director skip rebuilding list() on frames where nothing moved
  ver() { return zoneVer + '.' + histVer; }
};
// the plot a settlement building stands on (Atlas "plot" ring): {sid, uid, key, role, poly} | null
Town.plotOf = function (rec) {
  if (!rec || !rec.sid) return null;
  const S = list.get(rec.sid), L = lives.get(rec.sid); if (!S || !S.plan) return null;
  const it = L && L.deco ? L.deco.byKey.get(rec.key) : null, pk = it ? it.pk : baseKey(rec.key);
  for (const p of S.plan.plots) if (p.key === pk) {
    const s = Math.sin(p.rot), c = Math.cos(p.rot), dep = p.d + (p.yardD || 0), off = dep / 2 - p.d / 2;
    return { sid: S.id, uid: S.uid, key: p.key, role: p.role, poly: rectPoly(p.x + s * off, p.z + c * off, p.rot, Math.max(p.frontW || p.w, p.w), dep) };
  }
  for (const sp of S.plan.specials) if (sp.key === pk) return { sid: S.id, uid: S.uid, key: sp.key, role: sp.kind, poly: sp.w > 0 && sp.d > 0 ? rectPoly(sp.x, sp.z, sp.rot || 0, sp.w, sp.d) : null };
  return { sid: S.id, uid: S.uid, key: pk, role: 'other', poly: null };
};
// pure helpers for dev/tests/director.test.js
Town._pure = { itemYearOf, jobPrefix, makeName, canClaim, viewSigOf, mergeYears, nextPending };
Town._dev = {
  // browser check: settlement buildings shown on top of a player's manual building (should be [])
  manualOverlaps() { const out = []; lives.forEach(L => L.shown.forEach(e => { if (e.recs) for (const r of e.recs) if (manualSuppressed(r)) out.push(r.key); })); return out; },
  keyDupes(sid) { const L = lives.get(sid), S = list.get(sid); if (!S || !S.plan) return []; const seen = new Set(), d = []; for (const a of [S.plan.lanes, S.plan.plots, S.plan.specials, S.plan.areas]) for (const e of a) { if (seen.has(e.key)) d.push(e.key); seen.add(e.key); } void L; return d; }
};

// =====================================================================================================
// reset / clear / save
// =====================================================================================================
function wipeLive() {
  const k = K(); try { k.clear(); } catch (e) { }
  for (let i = 0; i < chunks.length; i++) chunks[i] = [];
  if (D.Nature && D.Nature.setExtra) lives.forEach((L, sid) => D.Nature.setExtra('town:' + sid, null));
  lives.clear(); jobs.clear();
  atlasReset(); if (AT.data) { AT.tex.needsUpdate = true; }
  hideBits.fill(0); hideDirty = [0, 0, SIZE, SIZE]; hideRebuild = null; hideT = 0;
  needReconcile.clear(); needRefilter.clear(); redecorateQ.clear(); redecorateInstant.clear(); restoredSids.clear(); restampQ.clear();
  navDirty = true; navRecDirty = true; tickQ.length = 0; manualVer++; histVer++;
}
function sanitizeZone() {
  const Z = W.zone;
  for (let k = 0; k < N * N; k++) {
    const o = k * 4, g = Z[o + 1];
    if (g && !list.has(g)) { Z[o] = 0; Z[o + 1] = 0; Z[o + 3] = 0; }
    else if (!g && Z[o]) { Z[o] = 0; Z[o + 3] = 0; }
    else if (Z[o + 3] === 255) Z[o + 3] = 1;
  }
}
Town.reset = function () {
  wipeLive();
  list.clear();
  W.zone.fill(0);
  zoneRect(0, 0, N - 1, N - 1);
  if (Town.zoneTex) Town.zoneTex.needsUpdate = true;
  Town.select(0);
  emitChanged();
};
Town.clearAll = function () {
  D.History.begin('Clear Settlements', 'trash');
  for (let i = 0; i < chunks.length; i++) {
    const man = chunks[i].filter(b => !b.sid); if (!man.length) continue;
    D.History.touchChunk('city', i);
    for (const b of man) { try { K().remove(b, true); } catch (e) { } }
    chunks[i] = chunks[i].filter(b => b.sid);
  }
  manualVer++;
  for (const sid of Array.from(list.keys()).sort((a, b) => a - b)) { D.History.touchChunk('town', sid); list.delete(sid); needReconcile.add(sid); }
  D.History.touch('zone', 0, 0, N - 1, N - 1);
  W.zone.fill(0);
  zoneRect(0, 0, N - 1, N - 1);
  D.History.end();
  Town.select(0);
  needReconcile.forEach(sid => teardown(sid, true)); needReconcile.clear();
  navRecDirty = true;
  emitChanged();
};
Town.serialize = function () {
  const manual = [];
  chunks.forEach(a => a.forEach(b => { if (b.sid) return; const o = {}; for (const k in b) if (k[0] !== '_' && k !== 'die' && k !== 'born') o[k] = b[k]; manual.push(packVal(o)); }));
  const settlements = Array.from(list.keys()).sort((a, b) => a - b).map(sid => {
    const S = list.get(sid);
    return { id: S.id, uid: S.uid, type: S.type, seed: S.seed, name: S.name, tw: Object.assign({}, S.tw), epochs: S.epochs, razed: (S.razed || []).slice(),
      plan: S.plan ? packVal(S.plan) : null, pending: S.pending ? Object.assign({}, S.pending) : null, pin: S.pin ? S.pin.slice() : null,
      by: S.by === 'h' ? 'h' : 'p', fy: S.fy | 0, ey: (S.ey || []).map(v => +v || 0), grow: S.grow !== false, plock: Object.assign({}, S.plock) };
  });
  return { v: 2, nextUid: Town.nextUid, nextJob: Town.nextJob, manual, settlements };
};
Town.deserialize = function (d) {
  wipeLive();
  list.clear();
  Town.select(0);
  if (d && d.v === 2) {
    Town.nextUid = Math.max(Town.nextUid, d.nextUid || 1);
    Town.nextJob = Math.max(Town.nextJob, d.nextJob || 1);
    for (const m of d.manual || []) {
      const rec = unpackVal(m); if (!rec || !rec.kind) continue;
      rec.id = rec.id || nextBid; nextBid = Math.max(nextBid, (rec.id | 0) + 1);
      rec.born = kclock() - 10; delete rec.sid; delete rec.key; rec.auto = false;
      seat(rec);
      chunks[chunkOf(rec.x, rec.z)].push(rec);
      try { K().add(rec); } catch (e) { }
    }
    manualVer++;
    for (const s of d.settlements || []) {
      if (!s || !s.id || s.id > 255) continue;
      const S = { id: s.id, uid: s.uid || Town.nextUid++, type: s.type || 1, seed: s.seed >>> 0, name: s.name || 'Settlement', tw: twFrom(s.tw), epochs: s.epochs || 1,
        razed: Array.isArray(s.razed) ? s.razed.slice() : [], plan: s.plan ? unpackVal(s.plan) : null, pending: s.pending ? Object.assign({}, s.pending) : null, pin: s.pin || null,
        // Living History fields (absent in older saves: player-made, date unknown)
        by: s.by === 'h' ? 'h' : 'p', fy: s.fy | 0, ey: Array.isArray(s.ey) ? s.ey.map(v => +v || 0) : [], grow: s.grow !== false,
        plock: {} };
      if (s.plock && s.plock.wealth) S.plock.wealth = 1;
      if (s.plock && s.plock.walls) S.plock.walls = 1;
      Town.nextUid = Math.max(Town.nextUid, S.uid + 1);
      if (S.pending) { Town.nextJob = Math.max(Town.nextJob, (S.pending.jobId | 0) + 1); instantJobs.add(S.pending.jobId); }
      list.set(S.id, S);
    }
  }
  sanitizeZone();
  zoneRect(0, 0, N - 1, N - 1);
  if (Town.zoneTex) Town.zoneTex.needsUpdate = true;
  // villages planned by an older planner re-plan with the same seed (instantly) so they pick up the denser layout
  list.forEach(S => {
    if (S.type === 1 && S.plan && !S.pending && (S.plan.pv | 0) < PLAN_VER) {
      S.pending = { kind: 'replan', jobId: Town.nextJob++, epoch: S.epochs };
      instantJobs.add(S.pending.jobId);
    }
  });
  list.forEach((S, sid) => { if (S.plan) reconcile(sid, 'instant'); });
  // wipeLive dropped the plant-hide corridors of history roads (Roads load first): re-derive them all
  dirRoadBB = dirRoadsBB(); if (dirRoadBB) hideRebuildRect(dirRoadBB);
  navRecDirty = true;
  emitChanged();
};

// =====================================================================================================
// init / update / events (§5.15)
// =====================================================================================================
const restoredSids = new Set();
const reseatQ = [];
let rrPresent = 0;

Town.init = function (scene) {
  Town.scene = scene;
  if (D.Kit && D.Kit.init && !D.Kit._inited) { try { D.Kit.init(scene); } catch (e) { console.warn('[town] Kit.init failed', e); } }
  Town.zoneTex = new THREE.DataTexture(W.zone, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  Town.zoneTex.magFilter = THREE.NearestFilter; Town.zoneTex.minFilter = THREE.NearestFilter; Town.zoneTex.generateMipmaps = false; Town.zoneTex.flipY = false;
  Town.zoneTex.needsUpdate = true;
  if (D.TU && D.TU.uZoneTex) D.TU.uZoneTex.value = Town.zoneTex;
  atlasInit();
  D.History.regArray('zone', { get data() { return W.zone; }, ch: 4, res: N, onRestore: (a, b, c, d) => {
    zoneRect(a, b, c, d); needRefilterAll = true; refilterInstant = true;
    const Z = W.zone, seen = new Set();
    for (let j = Math.max(0, b); j <= Math.min(N - 1, d); j++) for (let i = Math.max(0, a); i <= Math.min(N - 1, c); i++) { const g = Z[(j * N + i) * 4 + 1]; if (g) seen.add(g); }
    seen.forEach(sid => { bVersion[sid]++; redecorateInstant.add(sid); });
  } });
  D.History.regStore('city', cityStore);
  D.History.regStore('town', townStore);
  D.on('roads:changed', segs => {
    roadVer++;
    if (!segs) {
      needRefilterAll = true;
      for (let s = 0; s < 256; s++) roadVerS[s]++;
      // a wholesale reload (load / undo): re-derive the plant hide mask under old and new history roads
      const u = dirRoadsBB(); if (u || dirRoadBB) { hideRebuildRect(growRect(u ? u.slice() : null, dirRoadBB)); dirRoadBB = u; }
      return;
    }
    if (!segs.length) {
      // Clear Roads (the network is now empty): every walled town's gates go, whatever was near it
      if (D.Roads && D.Roads.segs && !D.Roads.segs.size) list.forEach(S => { roadVerS[S.id]++; if (S.tw.walls !== 'none') { needRefilter.add(S.id); redecorateQ.add(S.id); } });
      return;
    }
    let dirBB = null;
    for (const sg of segs) if (sg && sg.by === 1) dirBB = growRect(dirBB, segBB(sg));
    if (dirBB) { hideRebuildRect(dirBB); dirRoadBB = growRect(dirRoadBB, dirBB); }
    list.forEach(S => {
      const bw = sidWorldBB(S.id, 200); if (!bw) return;
      const bb = sidWorldBB(S.id, 30);
      let near = false;
      for (const sg of segs) {
        const sb = segBB(sg); if (!bbHit(bw, sb)) continue;
        if (!near) { near = true; roadVerS[S.id]++; }
        if (!bbHit(bb, sb)) continue;
        needRefilter.add(S.id);
        if (S.tw.walls !== 'none' && S.type === 1) redecorateQ.add(S.id);
        // infill: a new road through a village's current cells re-buds along it (only inside an open entry;
        // never for places the player told history not to grow, and a history road (by 1) never replans a
        // player-painted village (E5) - look on for a player seg in the same batch; director-founded places
        // still infill along history roads)
        if (sg.by === 1 && S.by !== 'h') continue;
        if (D.History.active() && S.type === 1 && S.plan && (!S.pending) && S.grow !== false && segCrossesM(sg, S)) {
          D.History.touchChunk('town', S.id);
          S.pending = { kind: 'infill', jobId: Town.nextJob++, epoch: S.epochs };
        }
        break;
      }
    });
  });
  D.on('roads:removed', bb => {
    roadVer++;
    if (bb) hideRebuildRect(bb);          // trees hidden under a removed history road come back
    else {                                // Clear Roads (no bbox): every former history corridor, every town
      if (dirRoadBB) hideRebuildRect(dirRoadBB);
      dirRoadBB = dirRoadsBB();
      list.forEach(S => { roadVerS[S.id]++; needRefilter.add(S.id); if (S.tw.walls !== 'none') redecorateQ.add(S.id); });
      return;
    }
    list.forEach(S => {
      const bw = sidWorldBB(S.id, 200); if (bw && bb && bbHit(bw, bb)) roadVerS[S.id]++;
      const b = sidWorldBB(S.id, 30); if (b && bb && bbHit(b, bb)) { needRefilter.add(S.id); if (S.tw.walls !== 'none') redecorateQ.add(S.id); }
    });
  });
  D.on('story:view', y => Town.setViewYear(y === null ? undefined : y));
  D.on('story:restored', () => { list.forEach((S, sid) => restampQ.add(sid)); });
  D.on('terrain:h', (i0, j0, i1, j1) => { // core's D.emit forwards only 3 payload args: j1 may be missing
    if (!(j1 >= 0)) j1 = N;
    // coalesce into one union rect: a sculpt stroke emits this every frame and the queue is only
    // drained when the stroke ends (hundreds of overlapping rects would each re-scan the chunks)
    const r = [(i0 | 0) * CELL - 30, (j0 | 0) * CELL - 30, (i1 === undefined ? N : i1) * CELL + 30, j1 * CELL + 30];
    if (reseatQ.length) growRect(reseatQ[0], r); else reseatQ.push(r);
  });
  D.on('sea', () => { lives.forEach((L, sid) => { let wet = false; L.shown.forEach(e => { if (e.recs) for (const r of e.recs) if (kmeta(r.kind).seat === 'water') { const y = r.y; seat(r); if (Math.abs(r.y - y) > 0.01) { try { K().reseat(r); } catch (er) { } } wet = true; } }); const S = list.get(sid); if (wet || (S && S.type === 5)) needRefilter.add(sid); }); });
  D.on('world:reset', () => Town.reset());
  D.on('world:generated', () => { needRefilterAll = true; });
  D.on('restored', () => {
    needReconcile.forEach(s => restoredSids.add(s));
    needRefilterAll = true; refilterInstant = true;
    for (const [sid, j] of Array.from(jobs)) { const S = list.get(sid); if (!S || !S.pending || S.pending.jobId !== j.jobId) jobs.delete(sid); }
  });
  D.on('layers', id => { if (id === 'buildings' || id === undefined) layersChanged(); });
  if (D.Nature && D.Nature.setHideFn) D.Nature.setHideFn(Town.hides);
  layersChanged();
};
function segBB(seg) {
  if (seg._bb) return seg._bb;
  try { const S2 = D.Roads.segSamples(seg); const p = new Float32Array(S2.n * 2); for (let q = 0; q < S2.n; q++) { p[q * 2] = S2.x[q]; p[q * 2 + 1] = S2.z[q]; } return bboxOf(p, 10); } catch (e) { return [0, 0, SIZE, SIZE]; }
}
function segCrossesM(seg, S) {
  let S2; try { S2 = D.Roads.segSamples(seg); } catch (e) { return false; }
  for (let q = 0; q < S2.n; q += 2) { const k = cellK(S2.x[q], S2.z[q]) * 4; if (W.zone[k + 1] === S.id && W.zone[k] === S.type) return true; }
  return false;
}
function layersChanged() {
  const vis = !D.Layers || D.Layers.visible('buildings');
  try { K().setVisible(vis); } catch (e) { }
  if (vis !== propsVisible) { propsVisible = vis; lives.forEach(L => { L.propsDirty = true; L.propsT = 0; }); }
  if (vis !== hideOn) { hideOn = vis; if (D.Nature && D.Nature.markHideDirty) D.Nature.markHideDirty(0, 0, SIZE, SIZE); }
}
Town.update = function (dt, camera) {
  localClock += dt;
  if (zoneDirtyRect && Town.zoneTex) {
    const r = zoneDirtyRect; zoneDirtyRect = null;
    if (D.renderer) D.subUpload(D.renderer, Town.zoneTex, r[0], r[1], r[2] - r[0] + 1, r[3] - r[1] + 1); else Town.zoneTex.needsUpdate = true;
  }
  const active = D.History.active();
  if (!active) {
    // re-seat after terrain edits
    if (reseatQ.length) {
      const k = K();
      for (const [x0, z0, x1, z1] of reseatQ.splice(0)) {
        forNear(x0, z0, x1, z1, b => { if (b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1) return; const y = b.y, y0 = b.y0; seat(b); if (Math.abs(b.y - y) > 0.01 || Math.abs(b.y0 - y0) > 0.01) { try { k.reseat(b); } catch (e) { } } });
        lives.forEach(L => { if (!L.bb || !bbHit(L.bb, [x0, z0, x1, z1])) return; L.props.forEach(a => { for (let i = 0; i < a.length; i += 7) if (a[i] >= x0 && a[i] <= x1 && a[i + 1] >= z0 && a[i + 1] <= z1) { a[i + 2] = D.Terrain.hAt(a[i], a[i + 1]); L.propsDirty = true; } }); });
      }
    }
    // history restores and stroke results
    if (needReconcile.size) {
      const ids = Array.from(needReconcile).sort((a, b) => a - b); needReconcile.clear();
      for (const sid of ids) { const Lx = lives.get(sid); reconcile(sid, restoredSids.has(sid) ? 'instant' : Lx && Lx.shown.size && Lx.deco ? 'wave' : 'grow'); }
      restoredSids.clear();
      emitChanged();
    }
    if (redecorateInstant.size) { for (const sid of Array.from(redecorateInstant).sort((a, b) => a - b)) { redecorateQ.delete(sid); if (list.has(sid)) reconcile(sid, 'instant'); } redecorateInstant.clear(); }
    if (redecorateQ.size) { for (const sid of Array.from(redecorateQ).sort((a, b) => a - b)) if (list.has(sid)) reconcile(sid, 'wave'); redecorateQ.clear(); }
    if (needRefilterAll) { needRefilterAll = false; list.forEach((S, sid) => refilter(sid, refilterInstant)); needRefilter.clear(); refilterInstant = false; }
    if (needRefilter.size) { for (const sid of Array.from(needRefilter).sort((a, b) => a - b)) refilter(sid, false); needRefilter.clear(); }
    if (restampQ.size) { for (const sid of Array.from(restampQ).sort((a, b) => a - b)) if (list.has(sid)) restampYears(sid); restampQ.clear(); }
    if (viewY !== undefined) viewFlush();
    startJobs();
  }
  runJobs();
  provisional(dt);
  // presenters (shared per-frame budgets)
  let inst = false; lives.forEach(L => { if (L.instant || L.qMode === 'instant') inst = true; });
  const B = { bld: inst ? 600 : 60, ga: 400 };
  const ids = Array.from(lives.keys()).sort((a, b) => a - b);
  rrPresent = (rrPresent + 1) % 9973;
  for (let i = 0; i < ids.length; i++) {
    const sid = ids[(i + rrPresent) % ids.length], S = list.get(sid), L = lives.get(sid);
    if (!S) { teardown(sid, true); continue; }
    advance(S, L, dt, B);
  }
  atlasFlush();
  extrasFlush(dt);
  hideFlush(dt);
  navFlush(dt);
  tickerFlush();
  insT -= dt; if (insT <= 0 && Town.selected) { insT = 0.25; refreshInspector(false); }
  updateLabels();
  const vis = !D.Layers || D.Layers.visible('buildings');
  try { K().setVisible(vis); } catch (e) { }
  if (vis !== propsVisible || vis !== hideOn) layersChanged();
  if (D.TU) {
    if (D.TU.uGOn) D.TU.uGOn.value = AT.anyPage && vis ? 1 : 0;
    if (D.TU.uSelSettle) D.TU.uSelSettle.value = Town.selected || 0;
  }
  townChangedT += dt;
  if (townChangedPending && townChangedT > 1) { townChangedPending = false; emitChanged(); }
  else if (townChangedT > 2 && lives.size) { let growing = false; lives.forEach(L => { if (L.deco && L.idx < L.deco.items.length) growing = true; }); if (growing) emitChanged(); }
};
})();
