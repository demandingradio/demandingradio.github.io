/* Diorama — undo / redo history.
   Grid layers (heights, paint, biomes, water, zones...) are snapshotted lazily in
   32x32 tiles the first time a stroke touches them (copy-on-write), so a stroke only
   costs memory for the area it actually changed. Object layers (roads, rivers...)
   register save/load functions; chunked instance stores (trees, buildings) snapshot
   per 1 km chunk.
   Entries opened with a `merge` key (Living History seasons) fold into the previous entry
   when it is the top of the stack with the same key, so a run of seasons is ONE undo step
   ("History 1142–1150"). Any player entry in between breaks the run. */
(function () {
'use strict';
const D = window.D;
const TS = 32;
const RUN_YEARS = 10, RUN_BYTES = 64e6;   // merged run caps (away:* runs have no span cap)

const H = D.History = {
  entries: [],
  pos: 0,
  cur: null,
  arrays: {},   // name -> { get data(), ch, res, onRestore(i0,j0,i1,j1) }
  objs: {},     // name -> { save(), load(state), bytes?(state) }
  stores: {},   // name -> store with snapChunk(ci), loadChunk(ci, snap)
  bytes: 0,
  MAX_ENTRIES: 80,
  MAX_BYTES: 260e6,

  regArray(name, def) { this.arrays[name] = def; },
  regObj(name, def) { this.objs[name] = def; },
  regStore(name, store) { this.stores[name] = store; },

  // opts = { merge?:string, y?:int, relabel?:(y0,y1)=>string }
  begin(label, icon, opts) {
    if (this.cur) this.end();
    this.cur = { label, icon: icon || 'dot', tiles: new Map(), objs: {}, chunks: new Map(), bytes: 0, time: Date.now() };
    if (opts) {
      if (opts.merge) this.cur.merge = opts.merge;
      if (opts.y !== undefined) this.cur.y = this.cur.y0 = this.cur.y1 = opts.y;
      if (opts.relabel) this.cur.relabel = opts.relabel;
    }
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
    const before = O.save();
    e.objs[name] = { before, after: null };
    e.bytes += objBytes(O, before);
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
      e.bytes += objBytes(this.objs[n], o.after);
      changed = true; // object layers are only touched right before a real edit
    }
    e.chunks.forEach(c => {
      c.after = this.stores[c.name].snapChunk(c.ci);
      e.bytes += snapBytes(c.after);
      changed = true;
    });
    if (!changed) { D.emit('history'); return null; }
    // merge fold: a season run joins the entry on top of the stack (no redo branch, same key, caps)
    const prev = this.entries[this.pos - 1];
    if (e.merge && prev && prev.merge === e.merge && this.pos === this.entries.length && canJoin(prev, e)) {
      const b0 = prev.bytes; fold(prev, e); this.bytes += prev.bytes - b0; this.trim();
      D.emit('history'); D.emit('changed', 'story'); return prev;
    }
    if (e.y !== undefined) e.y0 = e.y1 = e.y;
    // drop redo branch
    for (let k = this.pos; k < this.entries.length; k++) this.bytes -= this.entries[k].bytes;
    this.entries.length = this.pos;
    this.entries.push(e);
    this.pos++;
    this.bytes += e.bytes;
    this.trim();
    D.emit('history');
    if (e.merge) D.emit('changed', 'story'); else D.emit('changed');
    return e;
  },

  // drop the open entry without restoring anything (a season that changed nothing)
  abort() { this.cur = null; },

  // does the open entry hold a real change besides object layer `skip`? (Story: a season whose part
  // edited the world but forgot ctx.mark() must still be recorded, never aborted)
  changedBeyond(skip) {
    const e = this.cur; if (!e) return false;
    if (e.chunks.size) return true;
    for (const n in e.objs) if (n !== skip) return true;
    let ch = false;
    e.tiles.forEach(t => { if (!ch && !sameArr(t.before, copyTile(this.arrays[t.name], t.ti, t.tj))) ch = true; });
    return ch;
  },

  cancel() { // discard the open entry, restoring what it touched
    const e = this.cur; if (!e) return;
    this.cur = null;
    apply(e, 'before');
  },

  // forget the undone steps (truncate the redo branch)
  dropRedo() {
    if (this.cur) this.end();
    if (this.pos >= this.entries.length) return;
    for (let k = this.pos; k < this.entries.length; k++) this.bytes -= this.entries[k].bytes;
    this.entries.length = this.pos;
    D.emit('history');
  },

  trim() {
    while (this.entries.length > this.MAX_ENTRIES || (this.bytes > this.MAX_BYTES && this.entries.length > 1)) {
      const old = this.entries.shift(); this.bytes -= old.bytes; this.pos--;
    }
    if (this.pos < 0) this.pos = 0;
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

function canJoin(p, e) {
  return (e.merge.startsWith('away') || (e.y !== undefined && p.y0 !== undefined && e.y - p.y0 < RUN_YEARS)) && p.bytes + e.bytes <= RUN_BYTES;
}
// fold entry e (applied after p, nothing in between) into p: p keeps its 'before', takes e's 'after'
function fold(p, e) {
  e.tiles.forEach((t, k) => {
    const q = p.tiles.get(k);
    if (q) { p.bytes += t.after.byteLength - q.after.byteLength; q.after = t.after; }
    else { p.tiles.set(k, t); p.bytes += t.before.byteLength + t.after.byteLength; }
  });
  e.chunks.forEach((c, k) => {
    const q = p.chunks.get(k);
    if (q) { p.bytes += snapBytes(c.after) - snapBytes(q.after); q.after = c.after; }
    else { p.chunks.set(k, c); p.bytes += snapBytes(c.before) + snapBytes(c.after); }
  });
  for (const n in e.objs) {
    const O = H.objs[n], q = p.objs[n], o = e.objs[n];
    if (q) { p.bytes += objBytes(O, o.after) - objBytes(O, q.after); q.after = o.after; }
    else { p.objs[n] = o; p.bytes += objBytes(O, o.before) + objBytes(O, o.after); }
  }
  if (e.y !== undefined) p.y1 = e.y;
  p.label = p.relabel ? p.relabel(p.y0, p.y1) : e.label; p.time = e.time;
}

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
// optional per-object size estimate so object snapshots count toward MAX_BYTES
function objBytes(O, state) {
  if (!O || !O.bytes) return 0;
  try { const b = +O.bytes(state); return b > 0 ? b : 0; } catch (err) { return 0; }
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
  D.emit('restored', e, which);
}
})();
