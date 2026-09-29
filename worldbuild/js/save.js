/* Diorama — saving: IndexedDB autosave in this browser, plus export/import of a
   compressed .diorama world file. Preferences live in localStorage. */
(function () {
'use strict';
const D = window.D;
const W = D.W;

const Save = D.Save = { dirty: false, lastSave: 0, saving: false };
const DB = 'diorama', STORE = 'worlds', KEY = 'current', PREFS = 'diorama-prefs';

// ---- prefs ------------------------------------------------------------------------
Save.loadPrefs = function () { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } };
Save.prefs = function (p) { try { localStorage.setItem(PREFS, JSON.stringify(Object.assign(Save.loadPrefs(), p))); } catch (e) { } };

// ---- IndexedDB -------------------------------------------------------------------------
function db() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(key, val) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function get(key) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

// ---- snapshot ----------------------------------------------------------------------------
function snapshot() {
  const nat = D.Nature.chunks;
  let total = 0; nat.forEach(c => total += c.n);
  const nd = new Float32Array(total * D.Nature.STRIDE), counts = new Uint32Array(nat.length);
  let off = 0;
  nat.forEach((c, i) => { counts[i] = c.n; nd.set(c.d.subarray(0, c.n * D.Nature.STRIDE), off); off += c.n * D.Nature.STRIDE; });
  return {
    v: 2, name: W.name, seed: W.seed, style: W.style, climate: W.climate, seaLevel: W.seaLevel,
    h: W.h, biome: W.biome, paint: W.paint, zone: W.zone,
    lakes: W.lakes.map(l => ({ id: l.id, i: l.i, j: l.j })),
    rivers: W.rivers.map(r => ({ id: r.id, s: r.s, name: r.name })),
    nature: nd, natCounts: counts,
    roads: D.Roads ? D.Roads.serialize() : null,
    city: D.City ? D.City.serialize() : null,
    env: { time: D.Env.time, weather: D.Env.weather, season: D.Env.season, wind: D.Env.wind },
    cam: Object.assign({}, D.Cam.goal),
    view: { edge: D.Terrain.edgeMode, faceted: D.Terrain.material.flatShading, grid: D.TU.uGrid.value, contour: D.TU.uContour.value, border: D.Terrain.showBorder !== false },
    saved: Date.now()
  };
}
function apply(s) {
  W.name = s.name || 'World'; W.seed = s.seed || 1; W.style = s.style || 'continental'; W.climate = s.climate || 0;
  W.h.set(s.h); W.biome.set(s.biome); W.paint.set(s.paint);
  const legacy = (s.v || 1) < 2;
  if (s.zone && W.zone) W.zone.set(s.zone);
  if (legacy && W.zone) W.zone.fill(0);
  W.seaLevel = s.seaLevel || 0;
  W.forest.fill(0);
  // nature
  const nat = D.Nature.chunks, st = D.Nature.STRIDE;
  let off = 0;
  nat.forEach((c, i) => {
    const n = s.natCounts ? s.natCounts[i] : 0;
    if (c.d.length < n * st) c.d = new Float32Array(Math.max(64, n) * st);
    c.d.set(s.nature.subarray(off, off + n * st)); c.n = n; c.grid = null; off += n * st;
  });
  D.Nature.forceRebuild();
  D.Nature.populated = true;
  for (let i = 0; i < nat.length; i++) D.Nature.loadChunk(i, D.Nature.snapChunk(i));
  // water
  W.lakes = (s.lakes || []).map(l => Object.assign({ level: 0 }, l));
  W.rivers = (s.rivers || []).map(r => ({ id: r.id, s: new Float32Array(r.s), name: r.name }));
  D.Terrain.recalcRange();
  D.Water.setSeaLevel(W.seaLevel, true);
  D.Water.recomputeLakes();
  D.Water.rebuildRivers();
  if (D.Roads) D.Roads.deserialize(s.roads);
  if (legacy && D.Nature.migrateV1) D.Nature.migrateV1();
  if (D.City) { D.City.deserialize(legacy ? null : s.city); if (D.City.zoneTex) D.City.zoneTex.needsUpdate = true; }
  if (legacy && (s.city && s.city.list && s.city.list.length || s.roads && s.roads.segs && s.roads.segs.length))
    setTimeout(() => D.toast('This world predates the medieval update: modern buildings and zones were cleared and roads were converted.', 'warn', 6000), 400);
  if (s.env) { Object.assign(D.Env, { time: s.env.time, wind: s.env.wind }); D.Sky.setWeather(s.env.weather || 'clear', true); D.Sky.setSeason(s.env.season || 'summer', true); }
  if (s.view) {
    if (s.view.edge && s.view.edge !== D.Terrain.edgeMode) { D.Terrain.edgeMode = s.view.edge; D.Env.studio = s.view.edge === 'slab' ? 1 : 0; }
    if (s.view.faceted) D.Terrain.setFaceted(true);
    D.TU.uGrid.value = s.view.grid || 0; D.TU.uContour.value = s.view.contour || 0;
    D.Terrain.showBorder = s.view.border !== false;
  }
  D.Terrain.rebuildAll();
  D.Water.setSeaMesh();
  if (s.cam) { Object.assign(D.Cam.goal, s.cam); D.Cam.snap(); }
  D.History.clear();
  D.emit('world:generated');
  if (D.UI) { D.UI.refreshEnv(); D.UI.refreshWorld(); }
}

Save.load = async function () {
  let s = null;
  try { s = await get(KEY); } catch (e) { return false; }
  if (!s || !s.h || s.h.length !== W.h.length) return false;
  const el = document.getElementById('loading');
  el.hidden = false; document.getElementById('ld-title').textContent = 'Opening ' + (s.name || 'world');
  document.getElementById('ld-step').textContent = 'Restoring your world…'; document.getElementById('ld-fill').style.width = '60%';
  await new Promise(r => setTimeout(r, 30));
  apply(s);
  el.hidden = true;
  Save.lastSave = Date.now(); Save.dirty = false;
  if (D.UI) D.UI.setSave('saved ' + new Date(s.saved || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return true;
};

Save.saveNow = async function (announce) {
  if (Save.saving) return;
  if (!D.UI || !D.UI.hasWorld) return;
  Save.saving = true;
  if (D.UI) D.UI.setSave('saving…');
  try {
    await put(KEY, snapshot());
    Save.dirty = false; Save.lastSave = Date.now();
    if (D.UI) D.UI.setSave('saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (announce) D.toast('World saved in this browser');
  } catch (e) {
    console.warn(e);
    if (D.UI) D.UI.setSave('save failed');
    if (announce) D.toast('Could not save: ' + (e.message || e), 'warn');
  }
  Save.saving = false;
};

Save.init = function () {
  D.on('changed', () => { Save.dirty = true; if (D.UI) D.UI.setSave('unsaved changes'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && Save.dirty) Save.saveNow(false); });
  window.addEventListener('beforeunload', () => { if (Save.dirty) Save.saveNow(false); });
};
let t = 0;
Save.update = function (dt) {
  t += dt;
  if (t < 2) return; t = 0;
  if (Save.dirty && !D.History.active() && Date.now() - Save.lastSave > 20000) Save.saveNow(false);
};

// ---- export / import ------------------------------------------------------------------------
// Binary layout: "DIOR" | u32 headerLen | JSON header | raw typed-array sections. Gzipped when possible.
async function gz(buf, inflate) {
  if (!window.CompressionStream) return buf;
  const s = new Blob([buf]).stream().pipeThrough(inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
Save.exportFile = async function () {
  D.toast('Packing your world…');
  const s = snapshot();
  const header = {}, plain = {};
  for (const k in s) if (!ArrayBuffer.isView(s[k])) plain[k] = s[k];
  // rivers and roads carry typed arrays too: store them as plain arrays
  plain.rivers = s.rivers.map(r => ({ id: r.id, name: r.name, s: Array.from(r.s) }));
  if (plain.roads) plain.roads = { nodes: plain.roads.nodes, next: plain.roads.next, segs: plain.roads.segs.map(g => Object.assign({}, g, { p: Array.from(g.p), f: Array.from(g.f) })) };
  let body = 0; const parts = [];
  for (const k in s) {
    const v = s[k]; if (!ArrayBuffer.isView(v)) continue;
    header[k] = { type: v.constructor.name, off: body, len: v.length };
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    parts.push([body, bytes]); body += bytes.byteLength; body = (body + 7) & ~7;
  }
  const hjson2 = new TextEncoder().encode(JSON.stringify({ header, plain }));
  let hdrLen = 8 + hjson2.length; hdrLen = (hdrLen + 7) & ~7;
  const out = new Uint8Array(hdrLen + body);
  out.set([68, 73, 79, 82], 0);
  new DataView(out.buffer).setUint32(4, hjson2.length, true);
  out.set(hjson2, 8);
  parts.forEach(([o, b]) => out.set(b, hdrLen + o));
  const z = await gz(out, false);
  const a = document.createElement('a');
  a.download = (W.name || 'world').replace(/[^\w-]+/g, '-').toLowerCase() + '.diorama';
  a.href = URL.createObjectURL(new Blob([z], { type: 'application/octet-stream' }));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  D.toast(`Exported ${(z.byteLength / 1e6).toFixed(1)} MB world file`);
};
Save.decode = async function (buf) {
  if (!(buf[0] === 68 && buf[1] === 73)) buf = await gz(buf, true);
  if (!(buf[0] === 68 && buf[1] === 73 && buf[2] === 79 && buf[3] === 82)) throw new Error('not a Diorama world file');
  const hl = new DataView(buf.buffer, buf.byteOffset).getUint32(4, true);
  const { header, plain } = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl)));
  const hdrLen = (8 + hl + 7) & ~7;
  const s = Object.assign({}, plain);
  const T = { Float32Array, Uint8Array, Uint32Array, Int32Array };
  for (const k in header) {
    const h = header[k], C = T[h.type];
    const bytes = buf.slice(hdrLen + h.off, hdrLen + h.off + h.len * C.BYTES_PER_ELEMENT);
    s[k] = new C(bytes.buffer);
  }
  s.rivers = (plain.rivers || []).map(r => ({ id: r.id, name: r.name, s: new Float32Array(r.s) }));
  if (s.roads) s.roads.segs = s.roads.segs.map(g => Object.assign({}, g, { p: new Float32Array(g.p), f: new Uint8Array(g.f) }));
  return s;
};
Save.importFile = function () {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.diorama';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const s = await Save.decode(new Uint8Array(await f.arrayBuffer()));
      if (!confirm(`Open “${s.name}”? This replaces the world you have open now (export it first if you want to keep it).`)) return;
      apply(s);
      D.UI.hasWorld = true;
      await Save.saveNow(false);
      D.toast(`Opened <b>${s.name}</b>`);
    } catch (e) { D.toast('Could not open that file: ' + (e.message || e), 'warn'); }
  };
  inp.click();
};
})();
