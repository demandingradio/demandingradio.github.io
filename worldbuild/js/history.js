/* Diorama — undo / redo history.
   Grid layers (heights, paint, biomes, water, zones...) are snapshotted lazily in
   32x32 tiles the first time a stroke touches them (copy-on-write), so a stroke only
   costs memory for the area it actually changed. Object layers (roads, rivers...)
   register save/load functions; chunked instance stores (trees, buildings) snapshot
   per 1 km chunk. */
(function () {
'use strict';
const D = window.D;
const TS = 32;

const H = D.History = {
  entries: [],
  pos: 0,
  cur: null,
  arrays: {},   // name -> { get data(), ch, res, onRestore(i0,j0,i1,j1) }
  objs: {},     // name -> { save(), load(state) }
  stores: {},   // name -> store with snapChunk(ci), loadChunk(ci, snap)
  bytes: 0,
  MAX_ENTRIES: 80,
  MAX_BYTES: 260e6,

  regArray(name, def) { this.arrays[name] = def; },
  regObj(name, def) { this.objs[name] = def; },
  regStore(name, store) { this.stores[name] = store; },

  begin(label, icon) {
    if (this.cur) this.end();
    this.cur = { label, icon: icon || 'dot', tiles: new Map(), objs: {}, chunks: new Map(), bytes: 0, time: Date.now() };
    return this.cur;
  },

  active() { return !!this.cur; },

  // Snapshot the tiles of a grid layer covering the inclusive rect [i0..i1] x [j0..j1].
  touch(name, i0, j0, i1, j1) {
    const e = this.cur; if (!e) return;
    const A = this.arrays[name]; if (!A) return;
    const R = A.res;
    i0 = Math.max(0, i0 | 0); j0 = Math.max(0, j0 | 0);
    i1 = Math.min(R - 1, Math.ceil(i1)); j1 = Math.min(R - 1, Math.ceil(j1));
    if (i1 < i0 || j1 < j0) return;
    const ti0 = (i0 / TS) | 0, ti1 = (i1 / TS) | 0, tj0 = (j0 / TS) | 0, tj1 = (j1 / TS) | 0;
    for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) {
      const key = name + ':' + ti + ':' + tj;
      if (e.tiles.has(key)) continue;
      const before = copyTile(A, ti, tj);
      e.tiles.set(key, { name, ti, tj, before, after: null });
      e.bytes += before.byteLength;
    }
  },

  // Whole-layer snapshot for object lists (roads, rivers, lakes...)
  touchObj(name) {
    const e = this.cur; if (!e || e.objs[name]) return;
    const O = this.objs[name]; if (!O) return;
    e.objs[name] = { before: O.save(), after: null };
  },

  touchChunk(name, ci) {
    const e = this.cur; if (!e) return;
    const key = name + ':' + ci;
    if (e.chunks.has(key)) return;
    const S = this.stores[name]; if (!S) return;
    const snap = S.snapChunk(ci);
    e.chunks.set(key, { name, ci, before: snap, after: null });
    e.bytes += snapBytes(snap);
  },

  end() {
    const e = this.cur; if (!e) return null;
    this.cur = null;
    let changed = false;
    e.tiles.forEach(t => {
      t.after = copyTile(this.arrays[t.name], t.ti, t.tj);
      e.bytes += t.after.byteLength;
      if (!changed && !sameArr(t.before, t.after)) changed = true;
    });
    for (const n in e.objs) {
      const o = e.objs[n]; o.after = this.objs[n].save();
      changed = true; // object layers are only touched right before a real edit
    }
    e.chunks.forEach(c => {
      c.after = this.stores[c.name].snapChunk(c.ci);
      e.bytes += snapBytes(c.after);
      changed = true;
    });
    if (!changed) { D.emit('history'); return null; }
    // drop redo branch
    for (let k = this.pos; k < this.entries.length; k++) this.bytes -= this.entries[k].bytes;
    this.entries.length = this.pos;
    this.entries.push(e);
    this.pos++;
    this.bytes += e.bytes;
    while (this.entries.length > this.MAX_ENTRIES || (this.bytes > this.MAX_BYTES && this.entries.length > 1)) {
      const old = this.entries.shift(); this.bytes -= old.bytes; this.pos--;
    }
    D.emit('history');
    D.emit('changed');
    return e;
  },

  cancel() { // discard the open entry, restoring what it touched
    const e = this.cur; if (!e) return;
    this.cur = null;
    apply(e, 'before');
  },

  undo() {
    if (this.cur) this.end();
    if (this.pos <= 0) return false;
    const e = this.entries[--this.pos];
    apply(e, 'before');
    D.emit('history'); D.emit('changed');
    D.toast('Undo: ' + e.label);
    return true;
  },
  redo() {
    if (this.cur) this.end();
    if (this.pos >= this.entries.length) return false;
    const e = this.entries[this.pos++];
    apply(e, 'after');
    D.emit('history'); D.emit('changed');
    D.toast('Redo: ' + e.label);
    return true;
  },
  jump(k) { // make exactly k entries applied
    if (this.cur) this.end();
    k = D.clamp(k, 0, this.entries.length);
    let any = false;
    while (this.pos > k) { apply(this.entries[--this.pos], 'before'); any = true; }
    while (this.pos < k) { apply(this.entries[this.pos++], 'after'); any = true; }
    if (any) { D.emit('history'); D.emit('changed'); }
  },
  clear() { this.entries = []; this.pos = 0; this.cur = null; this.bytes = 0; D.emit('history'); }
};

function copyTile(A, ti, tj) {
  const R = A.res, ch = A.ch, data = A.data;
  const i0 = ti * TS, j0 = tj * TS;
  const w = Math.min(TS, R - i0), h = Math.min(TS, R - j0);
  const out = new data.constructor(w * h * ch);
  for (let j = 0; j < h; j++) {
    const src = ((j0 + j) * R + i0) * ch;
    out.set(data.subarray(src, src + w * ch), j * w * ch);
  }
  return out;
}
function writeTile(A, ti, tj, arr) {
  const R = A.res, ch = A.ch, data = A.data;
  const i0 = ti * TS, j0 = tj * TS;
  const w = Math.min(TS, R - i0), h = Math.min(TS, R - j0);
  for (let j = 0; j < h; j++) data.set(arr.subarray(j * w * ch, (j + 1) * w * ch), ((j0 + j) * R + i0) * ch);
  return [i0, j0, i0 + w - 1, j0 + h - 1];
}
function sameArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function snapBytes(s) {
  if (!s) return 0;
  if (s.data && s.data.byteLength) return s.data.byteLength;
  if (Array.isArray(s)) return s.length * 96;
  return 64;
}

function apply(e, which) {
  // grid tiles, grouped per layer so each layer gets one dirty rect callback
  const rects = {};
  e.tiles.forEach(t => {
    const A = H.arrays[t.name];
    const r = writeTile(A, t.ti, t.tj, t[which]);
    const R = rects[t.name];
    if (!R) rects[t.name] = r.slice();
    else { R[0] = Math.min(R[0], r[0]); R[1] = Math.min(R[1], r[1]); R[2] = Math.max(R[2], r[2]); R[3] = Math.max(R[3], r[3]); }
  });
  for (const n in rects) { const r = rects[n]; H.arrays[n].onRestore(r[0], r[1], r[2], r[3]); }
  e.chunks.forEach(c => H.stores[c.name].loadChunk(c.ci, c[which]));
  for (const n in e.objs) H.objs[n].load(e.objs[n][which]);
  D.emit('restored', e);
}
})();
