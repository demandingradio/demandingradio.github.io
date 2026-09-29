/* Diorama — editor UI: menus, tool strip, options bar, panels, dialogs, photo mode. */
(function () {
'use strict';
const D = window.D;
const { SIZE, N, VN, CELL } = D;
const W = D.W;
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ---- Icons (24px stroke) ---------------------------------------------------------------
const IC = {
  hand: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  marquee: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="2.6 2.2"/>',
  raise: '<path d="M2.5 20l6-9 4 5 3-4 6 8z"/><path d="M17 2.5v6.5M14.5 5L17 2.5 19.5 5"/>',
  smooth: '<path d="M3 13c3-6 5 4 9-2s6 3 9-1"/><path d="M3 18.5c3-2 5 1.5 9-.5s6 1 9-.5" opacity=".55"/>',
  flatten: '<path d="M3 17h18"/><path d="M7 4v8M4.5 9.5 7 12l2.5-2.5M17 4v8M14.5 9.5 17 12l2.5-2.5"/>',
  noise: '<path d="M2.5 16l2-4 2 3 2-7 2 6 2-3 2 4 2-8 2 7 2-3 1 2"/>',
  terrace: '<path d="M3 20h4v-4h4v-4h4V8h6"/><path d="M3 20h18" opacity=".4"/>',
  erode: '<path d="M2.5 20l7-13 4 6 2-3 6 10z"/><path d="M9.5 11.5v3M12.5 14v2.5M15 14.5v2" opacity=".7"/>',
  cliff: '<path d="M3 20h6V8h12"/><path d="M9 11.5l-2.5 2M9 15.5l-2.5 2" opacity=".55"/>',
  ramp: '<path d="M3 19.5 21 7v12.5z"/>',
  stamp: '<path d="M9 3h6v5l3 3v3H6v-3l3-3z"/><path d="M4 17.5h16V21H4z"/>',
  sea: '<path d="M3 15c2-2 4 2 6 0s4 2 6 0 4 2 6 0M3 19.5c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/><path d="M12 3v7M9.5 5.5 12 3l2.5 2.5"/>',
  lake: '<path d="M12 3c4 5 6 8.2 6 11a6 6 0 0 1-12 0c0-2.8 2-6 6-11z"/><path d="M9 15a3 3 0 0 0 3 3" opacity=".6"/>',
  river: '<path d="M6 3c4 4-4 7 0 11s-2 5 2 7M14 3c4 4-4 7 0 11s-2 5 2 7"/>',
  brush: '<path d="M18.5 2.5l3 3-9 9-3-3z"/><path d="M9.2 12.3c-3 0-5 2-5 5 0 1-1 3-2 4 4 0 8-1 8-5z"/>',
  biome: '<path d="M4.5 19.5c0-9 6-15 16-15 0 9.5-5.5 15.5-15 15.5z"/><path d="M4.5 19.5l8-8"/>',
  tree: '<path d="M12 2l6 9h-3l4 6H5l4-6H6z"/><path d="M12 17v5"/>',
  road: '<path d="M8.5 3 5 21M15.5 3 19 21"/><path d="M12 4v3M12 10.5v3M12 17v3"/>',
  bulldoze: '<path d="M2.5 16.5h10l2-5h3.5v5"/><path d="M4 16.5V9h6l2 2.5"/><circle cx="5.5" cy="19" r="2"/><circle cx="11.5" cy="19" r="2"/><path d="M21 8.5v9.5"/>',
  zone: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1" opacity=".4"/>',
  density: '<path d="M4 21v-7h4v7M10 21V9h4v12M16 21V4h4v17M2.5 21h19"/>',
  building: '<path d="M5 21V5l7-2.5V21M12 8h7v13M3 21h18"/><path d="M8 8v1M8 12v1M8 16v1M15.5 12v1M15.5 16v1"/>',
  walk: '<circle cx="12" cy="4.5" r="1.9"/><path d="M12 7.5v5.5l-3 8M12 13l3 8M7.5 10.5 12 8.5l4.5 2"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" opacity=".35"/><path d="M4 4l16 16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2" opacity=".6"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7" opacity=".6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="1.5"/><path d="M9 4V2.5h6V4"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
  trash2: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
};
const svg = (name, sz) => `<svg viewBox="0 0 24 24" width="${sz || 20}" height="${sz || 20}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[name] || IC.dot}</svg>`;
D.svg = svg; D.IC = IC;

// ---- Layers ---------------------------------------------------------------------------
const LAYERS = [
  { id: 'sky', name: 'Sky & weather', sw: 'linear-gradient(#6fa8e8,#cfe3f5)', noLock: true },
  { id: 'water', name: 'Water', sw: 'linear-gradient(135deg,#2a9fc0,#0b3a5a)' },
  { id: 'nature', name: 'Nature', sw: 'linear-gradient(135deg,#6a9a3a,#2f5a2c)' },
  { id: 'roads', name: 'Roads & paths', sw: 'linear-gradient(135deg,#8c857a,#5a4a36)' },
  { id: 'buildings', name: 'Buildings', sw: 'linear-gradient(135deg,#e8dcc8,#9a8f80)' },
  { id: 'zones', name: 'Zones overlay', sw: 'linear-gradient(135deg,#e0b85a,#d8c860 25%,#c85a50 50%,#9a78d0 75%,#4d9be0)', noLock: true, startHidden: true },
  { id: 'life', name: 'Traffic & people', sw: 'linear-gradient(135deg,#d23c32,#3c6ed2)', noLock: true },
  { id: 'paint', name: 'Ground paint', sw: 'linear-gradient(135deg,#b9a24e,#d98fb0)' },
  { id: 'terrain', name: 'Terrain', sw: 'linear-gradient(135deg,#8a8a60,#5a7a3a)', noHide: true }
];
const Layers = D.Layers = {
  st: {},
  visible(id) { return !this.st[id] || this.st[id].visible; },
  locked(id) { return !!(this.st[id] && this.st[id].locked); },
  set(id, k, v) { this.st[id][k] = v; D.emit('layers', id); }
};
LAYERS.forEach(l => Layers.st[l.id] = { visible: !l.startHidden, locked: false });

const UI = D.UI = { photo: false };

UI.init = function () {
  buildMenus();
  buildQuick();
  buildToolstrip();
  buildPanels();
  buildNewWorld();
  D.on('tool', () => { refreshToolstrip(); buildOptions(); refreshCatalogue(); });
  D.on('opts', buildOptions);
  D.on('opts:values', refreshOptionValues);
  D.on('history', refreshHistory);
  D.on('hover', updateStatus);
  D.on('changed', () => { navDirty = true; });
  D.on('terrain:h', () => { navDirty = true; });
  D.on('terrain:a', () => { navDirty = true; });
  D.on('world:generated', () => { navDirty = true; refreshWorld(); });
  D.on('sea', () => { navDirty = true; refreshEnvValues(); });
  D.on('time', refreshEnvValues);
  D.on('flyover', on => { $('app').classList.toggle('cine', on); if (on) { $('app').classList.add('no-panels'); $('photoui').hidden = true; } else if (!UI.photo) { $('app').classList.remove('no-panels'); } else $('photoui').hidden = false; });
  D.on('street', on => { $('app').classList.toggle('no-panels', on || UI.photo); });
  D.on('flykeys', refreshFlyKeys);
  D.on('town:changed', () => { refreshWorld(); navDirty = true; });
  D.on('layers', refreshLayers);
  buildOptions();
  refreshHistory();
  document.addEventListener('mousedown', e => { if (!e.target.closest('#dropdown') && !e.target.closest('.menu-btn')) closeMenu(); });
  setInterval(refreshWorld, 3000);
};

// ---- Menus ------------------------------------------------------------------------------
let openMenu = null;
function menuDefs() {
  const V = D.TU;
  return {
    File: [
      { label: 'New world…', kb: '', act: () => UI.newWorld() },
      { label: 'Rename world…', act: renameWorld },
      { sep: 1 },
      { label: 'Save now', kb: 'Ctrl+S', act: () => D.Save && D.Save.saveNow(true) },
      { label: 'Export world file…', act: () => D.Save && D.Save.exportFile() },
      { label: 'Import world file…', act: () => D.Save && D.Save.importFile() },
      { sep: 1 },
      { label: 'Save photo (PNG)', act: () => D.Post.capture(1) },
      { sep: 1 },
      { label: 'Back to desktop', act: () => { location.href = '../index.html'; } }
    ],
    Edit: [
      { label: 'Undo' + (D.History.pos > 0 ? ' ' + D.History.entries[D.History.pos - 1].label : ''), kb: 'Ctrl+Z', act: () => D.History.undo(), disabled: D.History.pos <= 0 },
      { label: 'Redo', kb: 'Ctrl+Y', act: () => D.History.redo(), disabled: D.History.pos >= D.History.entries.length },
      { sep: 1 },
      { label: 'Cut', kb: 'Ctrl+X', act: () => D.Tools.copy(true), disabled: !D.Tools.selection },
      { label: 'Copy', kb: 'Ctrl+C', act: () => D.Tools.copy(false), disabled: !D.Tools.selection },
      { label: 'Paste', kb: 'Ctrl+V', act: () => D.Tools.startPaste(), disabled: !D.Tools.clipboard },
      { sep: 1 },
      { label: 'Select all', kb: 'Ctrl+A', act: () => { D.Tools.select('select'); D.Tools.setSelection({ x0: 0, z0: 0, x1: SIZE, z1: SIZE }); } },
      { label: 'Deselect', kb: 'Ctrl+D', act: () => D.Tools.setSelection(null), disabled: !D.Tools.selection },
      { label: 'Flatten selection', act: () => D.Tools.flattenSelection(), disabled: !D.Tools.selection },
      { label: 'Clear trees & buildings in selection', kb: 'Del', act: () => D.Tools.clearSelection(), disabled: !D.Tools.selection }
    ],
    View: [
      { label: 'Grid overlay', checked: V.uGrid.value > 0.5, act: () => { V.uGrid.value = V.uGrid.value > 0.5 ? 0 : 1; } },
      { label: 'Contour lines', checked: V.uContour.value > 0.5, act: () => { V.uContour.value = V.uContour.value > 0.5 ? 0 : 1; } },
      { label: 'Zones overlay', checked: Layers.visible('zones'), act: () => Layers.set('zones', 'visible', !Layers.visible('zones')) },
      { label: 'Faceted low-poly terrain', checked: D.Terrain.material.flatShading, act: () => D.Terrain.setFaceted(!D.Terrain.material.flatShading) },
      { label: 'Diorama edges (model on a plinth)', checked: D.Terrain.edgeMode === 'slab', act: () => { D.Terrain.setEdgeMode(D.Terrain.edgeMode === 'slab' ? 'endless' : 'slab'); D.Env.studio = D.Terrain.edgeMode === 'slab' ? 1 : 0; } },
      { label: 'Show land border', checked: D.Terrain.showBorder !== false, act: () => { D.Terrain.showBorder = D.Terrain.showBorder === false; D.emit('changed'); } },
      { label: 'Tilt-shift look while editing', checked: D.Post.p.tiltOn && !UI.photo, act: () => { D.Post.p.tiltOn = !D.Post.p.tiltOn; } },
      { sep: 1 },
      { label: 'Graphics: High', checked: D.Q.high, act: () => setQuality('high') },
      { label: 'Graphics: Low (faster)', checked: !D.Q.high, act: () => setQuality('low') },
      { sep: 1 },
      { label: 'Hide panels', kb: 'Tab', act: () => UI.togglePanels() },
      { label: 'Overview camera', kb: 'Home', act: () => D.Cam.overview() }
    ],
    Mode: [
      { label: 'Photo mode', act: () => UI.enterPhoto() },
      { label: 'Walk / drive (click to drop in)', act: () => D.Tools.select('walk') },
      { label: 'Flyover editor', act: () => { UI.enterPhoto(); setTimeout(() => { const f = $('ph-fly'); if (f) f.scrollIntoView(); }, 50); } },
      { label: 'Showcase orbit', checked: !!D.Cam.autoOrbit, act: () => { D.Cam.autoOrbit = D.Cam.autoOrbit ? 0 : 0.06; } }
    ],
    Help: [
      { label: 'Quick start', act: () => UI.quickstart(true) },
      { label: 'Keyboard shortcuts', kb: 'F1', act: () => UI.help() },
      { label: 'About Diorama', act: () => UI.help(true) }
    ]
  };
}
function buildMenus() {
  const nav = $('menus');
  Object.keys(menuDefs()).forEach(name => {
    const b = el('div', 'menu-btn', name);
    b.addEventListener('mousedown', e => { e.preventDefault(); if (openMenu === name) closeMenu(); else showMenu(name, b); });
    b.addEventListener('mouseenter', () => { if (openMenu && openMenu !== name) showMenu(name, b); });
    nav.appendChild(b);
  });
}
function showMenu(name, btn) {
  closeMenu();
  openMenu = name;
  btn.classList.add('open');
  const dd = $('dropdown');
  dd.innerHTML = '';
  menuDefs()[name].forEach(it => {
    if (it.sep) { dd.appendChild(el('div', 'dd-sep')); return; }
    const row = el('div', 'dd-item' + (it.checked ? ' checked' : '') + (it.disabled ? ' disabled' : ''), `<span>${it.label}</span><span class="kb">${it.kb || ''}</span>`);
    row.addEventListener('mouseup', () => { closeMenu(); it.act(); });
    dd.appendChild(row);
  });
  const r = btn.getBoundingClientRect();
  dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 2 + 'px';
  dd.hidden = false;
}
function closeMenu() {
  openMenu = null;
  $('dropdown').hidden = true;
  document.querySelectorAll('.menu-btn.open').forEach(b => b.classList.remove('open'));
}
function renameWorld() {
  const n = prompt('Name your world:', W.name);
  if (n && n.trim()) { W.name = n.trim().slice(0, 60); refreshWorld(); D.emit('changed'); }
}
function setQuality(q) {
  D.Q.level = q;
  D.Sky.setShadowRes(q === 'high' ? 4096 : 2048);
  D.emit('resize');
  D.Nature.forceRebuild();
  if (D.Save) D.Save.prefs({ quality: q });
  D.toast('Graphics: ' + (q === 'high' ? 'High' : 'Low'));
  refreshQuick();
}

// ---- Quick buttons -----------------------------------------------------------------------
function buildQuick() {
  const q = $('quick');
  q.innerHTML = `
    <button class="qbtn" id="q-sound" title="Ambient sound">${svg('mute', 14)}<span>Sound</span></button>
    <button class="qbtn" id="q-quality" title="Graphics quality">${svg('gauge', 14)}<span>High</span></button>
    <button class="qbtn" id="q-photo" title="Photo mode">${svg('camera', 14)}<span>Photo</span></button>`;
  $('q-sound').onclick = () => { if (D.Audio) { D.Audio.toggle(); refreshQuick(); } };
  $('q-quality').onclick = () => setQuality(D.Q.high ? 'low' : 'high');
  $('q-photo').onclick = () => UI.enterPhoto();
  refreshQuick();
}
function refreshQuick() {
  const on = D.Audio && D.Audio.on;
  $('q-sound').classList.toggle('on', !!on);
  $('q-sound').innerHTML = `${svg(on ? 'sound' : 'mute', 14)}<span>Sound</span>`;
  $('q-quality').innerHTML = `${svg('gauge', 14)}<span>${D.Q.high ? 'High' : 'Low'}</span>`;
}
UI.refreshQuick = refreshQuick;

// ---- Tool strip -------------------------------------------------------------------------
function buildToolstrip() {
  const ts = $('toolstrip');
  ts.innerHTML = '';
  let lastGroup = null;
  D.Tools.order.forEach(id => {
    const d = D.Tools.defs[id];
    if (lastGroup && d.group !== lastGroup) ts.appendChild(el('div', 'tool-sep'));
    lastGroup = d.group;
    const b = el('div', 'tool', svg(d.icon));
    b.dataset.id = id;
    b.addEventListener('click', () => D.Tools.select(id));
    tip(b, () => `<b>${d.name}</b>${d.key ? `<span class="kb">${d.key}</span>` : ''}<div class="tip-desc">${d.desc || ''}</div>`);
    ts.appendChild(b);
  });
  refreshToolstrip();
}
function refreshToolstrip() {
  document.querySelectorAll('#toolstrip .tool').forEach(b => b.classList.toggle('on', b.dataset.id === D.Tools.cur));
  const d = D.Tools.defs[D.Tools.cur];
  $('st-tool').textContent = d ? d.name : 'Ready';
}

// tooltips
function tip(elm, html) {
  elm.addEventListener('mouseenter', () => {
    const t = $('tooltip');
    t.innerHTML = typeof html === 'function' ? html() : html;
    t.hidden = false;
    const r = elm.getBoundingClientRect();
    let x = r.right + 8, y = r.top;
    t.style.left = x + 'px'; t.style.top = y + 'px';
    const tr = t.getBoundingClientRect();
    if (tr.right > innerWidth - 8) t.style.left = (r.left - tr.width - 8) + 'px';
    if (tr.bottom > innerHeight - 8) t.style.top = (innerHeight - tr.height - 8) + 'px';
  });
  elm.addEventListener('mouseleave', () => { $('tooltip').hidden = true; });
}
UI.tip = tip;

// ---- Options bar --------------------------------------------------------------------------
const toSlider = (o, v) => o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) * 1000 : v;
const fromSlider = (o, s) => o.log ? o.min * Math.pow(o.max / o.min, s / 1000) : +s;
function buildOptions() {
  const bar = $('optionsbar');
  bar.innerHTML = '';
  const id = D.Tools.cur, d = D.Tools.defs[id];
  if (!d) return;
  bar.appendChild(el('div', 'opt-title', `${svg(d.icon, 18)}<span>${d.name}</span>`));
  const o = D.Tools.o(id);
  D.Tools.optSpec(id).forEach(spec => {
    const wrap = el('div', 'opt');
    wrap.dataset.opt = spec.id;
    const get = () => spec.get ? spec.get() : o[spec.id];
    const set = v => { if (spec.set) spec.set(v); else o[spec.id] = v; if (spec.onChange) spec.onChange(v); };
    if (spec.type === 'range') {
      if (spec.label) wrap.appendChild(el('label', '', spec.label));
      const r = el('input'); r.type = 'range';
      r.min = spec.log ? 0 : spec.min; r.max = spec.log ? 1000 : spec.max; r.step = spec.log ? 1 : (spec.step || (spec.max - spec.min) / 200);
      r.value = toSlider(spec, get());
      const val = el('span', 'val', spec.fmt ? spec.fmt(get()) : get());
      r.addEventListener('input', () => { set(fromSlider(spec, r.value)); val.textContent = spec.fmt ? spec.fmt(get()) : get(); });
      r.addEventListener('change', () => r.blur());
      if (spec.tip) r.title = spec.tip;
      wrap.appendChild(r); wrap.appendChild(val);
      wrap._refresh = () => { r.value = toSlider(spec, get()); val.textContent = spec.fmt ? spec.fmt(get()) : get(); };
    } else if (spec.type === 'seg') {
      if (spec.label) wrap.appendChild(el('label', '', spec.label));
      const seg = el('div', 'seg');
      spec.choices.forEach(([v, lab]) => {
        const b = el('button', '', lab);
        b.addEventListener('click', () => { set(v); refresh(); b.blur(); });
        b.dataset.v = v;
        seg.appendChild(b);
      });
      const refresh = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(get()) === b.dataset.v));
      refresh();
      wrap.appendChild(seg);
      wrap._refresh = refresh;
    } else if (spec.type === 'check') {
      const lab = el('label', '', `<input type="checkbox"> ${spec.label}`);
      const cb = lab.querySelector('input');
      cb.checked = !!get();
      cb.addEventListener('change', () => { set(cb.checked); cb.blur(); });
      lab.style.display = 'flex'; lab.style.alignItems = 'center'; lab.style.gap = '5px'; lab.style.cursor = 'pointer'; lab.style.color = 'var(--text)';
      wrap.appendChild(lab);
      wrap._refresh = () => { cb.checked = !!get(); };
    } else if (spec.type === 'number') {
      if (spec.label) wrap.appendChild(el('label', '', spec.label));
      const inp = el('input'); inp.type = 'number'; inp.min = spec.min; inp.max = spec.max; inp.step = spec.step || 1; inp.style.width = '72px';
      inp.value = Math.round(get());
      inp.addEventListener('change', () => { set(D.clamp(+inp.value, spec.min, spec.max)); });
      wrap.appendChild(inp);
      wrap._refresh = () => { if (document.activeElement !== inp) inp.value = Math.round(get()); };
    } else if (spec.type === 'select') {
      if (spec.label) wrap.appendChild(el('label', '', spec.label));
      const s = el('select');
      spec.choices.forEach(([v, lab]) => { const op = el('option', '', lab); op.value = v; s.appendChild(op); });
      s.value = get();
      s.addEventListener('change', () => { set(s.value); s.blur(); refreshCatalogue(); });
      wrap.appendChild(s);
      wrap._refresh = () => { s.value = get(); };
    } else if (spec.type === 'button') {
      const b = el('button', 'btn small', spec.label);
      b.addEventListener('click', () => { spec.act(); b.blur(); });
      wrap.appendChild(b);
    }
    bar.appendChild(wrap);
  });
  if (d.extraOptions) d.extraOptions(bar);
  if (d.hint) bar.appendChild(el('div', 'opt-hint', d.hint.replace(/<[^>]+>/g, '')));
}
function refreshOptionValues() {
  document.querySelectorAll('#optionsbar .opt').forEach(w => { if (w._refresh) w._refresh(); });
}
UI.refreshOptions = refreshOptionValues;

// ---- Panels ----------------------------------------------------------------------------------
function panel(id, title, body, opts) {
  opts = opts || {};
  const p = el('div', 'panel' + (opts.collapsed ? ' collapsed' : ''));
  p.id = 'panel-' + id;
  const h = el('div', 'panel-h', `<span class="chev">▾</span><span class="ptitle">${title}</span><span class="ph-extra"></span>`);
  h.addEventListener('click', e => { if (e.target.closest('.ph-extra')) return; p.classList.toggle('collapsed'); });
  const b = el('div', 'panel-b' + (opts.flush ? ' flush' : ''));
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  p.appendChild(h); p.appendChild(b);
  $('panels').appendChild(p);
  return { p, h, b, extra: h.querySelector('.ph-extra'), title: h.querySelector('.ptitle') };
}
let P = {};
function buildPanels() {
  P.nav = panel('nav', 'Navigator', `<div id="nav-wrap"><canvas id="nav-canvas" width="256" height="256"></canvas><svg id="nav-view" viewBox="0 0 256 256"></svg></div>`);
  P.cat = panel('cat', 'Catalogue', '');
  P.env = panel('env', 'Environment', envHTML());
  P.layers = panel('layers', 'Layers', '', { flush: true });
  P.hist = panel('hist', 'History', '<div id="history-list"></div>', { flush: true });
  P.world = panel('world', 'World', '<div id="world-info" class="small"></div>', { collapsed: true });
  wireNav();
  wireEnv();
  buildLayers();
  refreshCatalogue();
  refreshWorld();
}

// Navigator minimap: the land is drawn inset inside a map frame so the border reads clearly
let navDirty = true, navTimer = 0;
const NM = 12, NI = 256 - NM * 2;        // margin and inset size in canvas px
const toNav = v => NM + v / SIZE * NI;
function wireNav() {
  const wrap = $('nav-wrap');
  let down = false;
  const go = e => {
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * 256, py = (e.clientY - r.top) / r.height * 256;
    D.Cam.focusOn((px - NM) / NI * SIZE, (py - NM) / NI * SIZE);
  };
  wrap.addEventListener('pointerdown', e => { down = true; wrap.setPointerCapture(e.pointerId); go(e); });
  wrap.addEventListener('pointermove', e => { if (down) go(e); });
  wrap.addEventListener('pointerup', () => { down = false; });
  wrap.addEventListener('wheel', e => { e.preventDefault(); D.Cam.zoomAt(e.deltaY); }, { passive: false });
}
function drawNav() {
  const c = $('nav-canvas'); if (!c) return;
  const ctx = c.getContext('2d');
  const S = NI, img = ctx.createImageData(S, S);
  const h = W.h, sea = W.seaLevel, B = W.biome, F = W.forest, Wt = W.water;
  const pal = [[96, 146, 62], [96, 130, 88], [214, 178, 118], [66, 150, 58]];
  const step = N / S;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const gi = Math.round(i * step), gj = Math.round(j * step), k = gj * VN + gi;
    const y = h[k];
    const hx = h[gj * VN + Math.min(N, gi + 4)] - h[gj * VN + Math.max(0, gi - 4)];
    const hz = h[Math.min(N, gj + 4) * VN + gi] - h[Math.max(0, gj - 4) * VN + gi];
    const shade = D.clamp(1 - (hx * 0.6 + hz * 0.45) / 150, 0.55, 1.4);
    let r, g, b;
    const wl = Math.max(sea, Wt[k]);
    if (y < wl) { const dd = D.clamp((wl - y) / 60, 0, 1); r = D.lerp(64, 16, dd); g = D.lerp(170, 70, dd); b = D.lerp(186, 120, dd); }
    else {
      const bw = [B[k * 4], B[k * 4 + 1], B[k * 4 + 2], B[k * 4 + 3]], bs = bw[0] + bw[1] + bw[2] + bw[3] || 1;
      r = 0; g = 0; b = 0;
      for (let q = 0; q < 4; q++) { r += pal[q][0] * bw[q] / bs; g += pal[q][1] * bw[q] / bs; b += pal[q][2] * bw[q] / bs; }
      const slope = Math.hypot(hx, hz) / (8 * CELL);
      if (slope > 0.5) { r = D.lerp(r, 128, 0.6); g = D.lerp(g, 122, 0.6); b = D.lerp(b, 114, 0.6); }
      if (y - sea < 2) { r = 220; g = 205; b = 160; }
      const snow = (bw[0] * 950 + bw[1] * 600 + bw[2] * 1700 + bw[3] * 3000) / bs;
      if (y - sea > snow) { r = 240; g = 242; b = 246; }
      const f = F[k] / 255;
      r = D.lerp(r, 40, f * 0.6); g = D.lerp(g, 80, f * 0.6); b = D.lerp(b, 40, f * 0.6);
      r *= shade; g *= shade; b *= shade;
    }
    const o = (j * S + i) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  // hatched "beyond the border" margin, then the land, then a piano-key frame
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#17181b'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let k = -256; k < 256; k += 6) { ctx.beginPath(); ctx.moveTo(k, 256); ctx.lineTo(k + 256, 0); ctx.stroke(); }
  const off = document.createElement('canvas'); off.width = S; off.height = S;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(off, NM, NM);
  ctx.fillStyle = '#0d0e10'; ctx.fillRect(NM - 4, NM - 4, NI + 8, 4); ctx.fillRect(NM - 4, NM + NI, NI + 8, 4); ctx.fillRect(NM - 4, NM, 4, NI); ctx.fillRect(NM + NI, NM, 4, NI);
  const keys = 16, kl = NI / keys;
  for (let k = 0; k < keys; k++) {
    ctx.fillStyle = k % 2 ? '#e9dcb8' : '#2a2520';
    ctx.fillRect(NM + k * kl, NM - 3, kl, 2); ctx.fillRect(NM + k * kl, NM + NI + 1, kl, 2);
    ctx.fillRect(NM - 3, NM + k * kl, 2, kl); ctx.fillRect(NM + NI + 1, NM + k * kl, 2, kl);
  }
  // roads & rivers on top (drawn in inset coordinates)
  ctx.save();
  ctx.beginPath(); ctx.rect(NM, NM, NI, NI); ctx.clip();
  ctx.setTransform(1, 0, 0, 1, NM, NM);
  ctx.lineCap = 'round';
  if (W.rivers) { ctx.strokeStyle = 'rgba(80,180,220,0.95)'; ctx.lineWidth = 1.2; W.rivers.forEach(rv => { ctx.beginPath(); for (let k = 0; k < rv.s.length; k += 16) { const x = rv.s[k] / SIZE * S, z = rv.s[k + 1] / SIZE * S; k ? ctx.lineTo(x, z) : ctx.moveTo(x, z); } ctx.stroke(); }); }
  if (D.Roads && D.Roads.drawNav) D.Roads.drawNav(ctx, S);
  if (D.City && D.City.drawNav) D.City.drawNav(ctx, S);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function drawNavView() {
  const s = $('nav-view'); if (!s) return;
  const cam = D.camera; if (!cam) return;
  const pts = [];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y]) => {
    const o = cam.position.clone(), d = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(o).normalize();
    let hit = D.Terrain.rayPlane(o, d, D.Cam.target.y);
    if (!hit || hit.t > 60000) hit = { x: o.x + d.x * 60000, z: o.z + d.z * 60000 };
    pts.push([toNav(hit.x), toNav(hit.z)]);
  });
  const t = D.Cam.target;
  if (pts.some(p => !isFinite(p[0]) || !isFinite(p[1])) || !isFinite(t.x)) return;
  const outside = t.x < 0 || t.z < 0 || t.x > SIZE || t.z > SIZE;
  s.innerHTML = `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="rgba(49,168,255,.14)" stroke="#31a8ff" stroke-width="1.2"/><circle cx="${toNav(t.x)}" cy="${toNav(t.z)}" r="2.5" fill="${outside ? '#ff5a4a' : '#fff'}"/>`;
}
UI.update = function (dt) {
  navTimer -= dt;
  if (navDirty && navTimer <= 0 && !D.History.active()) { navDirty = false; navTimer = 1.5; drawNav(); }
  drawNavView();
};
UI.navDirty = () => { navDirty = true; };

// Environment panel
function envHTML() {
  return `
  <div class="row"><label>Time of day</label><input type="range" id="env-time" min="0" max="24" step="0.05"><span class="val" id="env-time-v"></span></div>
  <div class="row"><label>Clock</label><div class="chips" id="env-speed"></div></div>
  <div class="row" style="align-items:flex-start"><label style="padding-top:3px">Weather</label><div class="chips" id="env-weather"></div></div>
  <div class="row"><label>Season</label><div class="chips" id="env-season"></div></div>
  <div class="row"><label>Sea level</label><input type="range" id="env-sea" min="-250" max="900" step="0.5"><span class="val" id="env-sea-v"></span></div>
  <div class="row"><label>Wind</label><input type="range" id="env-wind" min="0" max="1.5" step="0.01"><span class="val" id="env-wind-v"></span></div>`;
}
function fmtTime(t) { const h = Math.floor(t), m = Math.floor((t - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
function chips(container, items, get, set) {
  const c = $(container); c.innerHTML = '';
  items.forEach(([v, lab, title]) => {
    const b = el('span', 'chip', lab); if (title) b.title = title;
    b.onclick = () => { set(v); refresh(); };
    b.dataset.v = v; c.appendChild(b);
  });
  const refresh = () => c.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', String(get()) === b.dataset.v));
  refresh();
  return refresh;
}
let envRefreshers = [];
function wireEnv() {
  const E = D.Env;
  const t = $('env-time');
  t.value = E.time; $('env-time-v').textContent = fmtTime(E.time);
  t.oninput = () => { E.time = +t.value; $('env-time-v').textContent = fmtTime(E.time); };
  envRefreshers.push(chips('env-speed', [[0, '⏸', 'Paused'], [0.02, '1×', '1 hour per 50 s'], [0.1, '5×'], [0.5, '25×']], () => E.timeSpeed, v => { E.timeSpeed = v; }));
  envRefreshers.push(chips('env-weather', [['clear', '☀ Clear'], ['cloudy', '⛅ Cloudy'], ['rain', '🌧 Rain'], ['storm', '⛈ Storm'], ['fog', '🌫 Fog'], ['snow', '❄ Snow']], () => E.weather, v => D.Sky.setWeather(v)));
  envRefreshers.push(chips('env-season', [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']], () => E.season, v => D.Sky.setSeason(v)));
  const s = $('env-sea');
  s.oninput = () => { D.Water.setSeaLevel(+s.value); };
  s.onpointerdown = () => { D.History.begin('Sea Level', 'sea'); D.History.touchObj('sea'); };
  s.onchange = () => { if (D.History.active()) D.History.end(); };
  const wd = $('env-wind');
  wd.oninput = () => { E.wind = +wd.value; $('env-wind-v').textContent = Math.round(E.wind * 100) + '%'; };
  refreshEnvValues();
}
function refreshEnvValues() {
  const E = D.Env;
  const t = $('env-time'); if (!t) return;
  if (document.activeElement !== t) t.value = E.time;
  $('env-time-v').textContent = fmtTime(E.time);
  const s = $('env-sea');
  if (document.activeElement !== s) s.value = W.seaLevel;
  $('env-sea-v').textContent = W.seaLevel.toFixed(1) + ' m';
  $('env-wind').value = E.wind; $('env-wind-v').textContent = Math.round(E.wind * 100) + '%';
  envRefreshers.forEach(f => f());
}
UI.refreshEnv = refreshEnvValues;

// Layers panel
function buildLayers() {
  const b = P.layers.b; b.innerHTML = '';
  LAYERS.forEach(l => {
    const row = el('div', 'layer');
    row.dataset.id = l.id;
    row.innerHTML = `<div class="lv" title="Show / hide">${l.noHide ? '' : svg('eye', 14)}</div>
      <div class="lname"><span class="lswatch" style="background:${l.sw}"></span><span>${l.name}</span><span class="lcount"></span></div>
      <div class="ll" title="Lock (stop edits)">${l.noLock ? '' : svg('unlock', 14)}</div>
      <div class="lc" title="Clear layer">${l.clear === false || l.id === 'sky' || l.id === 'zones' || l.id === 'life' || l.id === 'terrain' ? '' : svg('trash', 14)}</div>`;
    if (!l.noHide) row.querySelector('.lv').onclick = () => Layers.set(l.id, 'visible', !Layers.visible(l.id));
    if (!l.noLock) row.querySelector('.ll').onclick = () => Layers.set(l.id, 'locked', !Layers.locked(l.id));
    const lc = row.querySelector('.lc');
    if (lc.innerHTML) lc.onclick = () => clearLayer(l);
    b.appendChild(row);
  });
  refreshLayers();
}
function refreshLayers() {
  document.querySelectorAll('#panel-layers .layer').forEach(row => {
    const id = row.dataset.id, l = LAYERS.find(x => x.id === id);
    row.classList.toggle('hidden', !Layers.visible(id));
    if (!l.noHide) row.querySelector('.lv').innerHTML = svg(Layers.visible(id) ? 'eye' : 'eyeoff', 14);
    if (!l.noLock) { const ll = row.querySelector('.ll'); ll.innerHTML = svg(Layers.locked(id) ? 'lock' : 'unlock', 14); ll.classList.toggle('on', Layers.locked(id)); }
  });
  // zones overlay layer: force overlay on when visible
  const zv = Layers.visible('zones');
  const d = D.Tools.defs[D.Tools.cur];
  D.TU.uZoneOn.value = d && d.zoneOverlay ? d.zoneOverlay : (zv ? 1 : 0);
  D.TU.uPaintVis.value = Layers.visible('paint') ? 1 : 0;
}
function clearLayer(l) {
  if (!confirm(`Clear everything on the “${l.name}” layer? You can undo this.`)) return;
  if (l.id === 'water') {
    D.History.begin('Clear Water', 'trash'); D.History.touchObj('lakes'); D.History.touchObj('rivers');
    W.lakes = []; W.rivers = []; D.Water.recomputeLakes(); D.Water.rebuildRivers(); D.History.end();
  } else if (l.id === 'nature') {
    D.History.begin('Clear Nature', 'trash');
    for (let i = 0; i < D.Nature.chunks.length; i++) if (D.Nature.chunks[i].n) D.History.touchChunk('nature', i);
    D.Nature.clearAll(); D.History.end();
  } else if (l.id === 'paint') {
    D.History.begin('Clear Paint', 'trash'); D.History.touch('paint', 0, 0, N, N); W.paint.fill(0); D.Terrain.markA(0, 0, N, N); D.History.end();
  } else if (l.id === 'roads' && D.Roads) D.Roads.clearAll();
  else if (l.id === 'buildings' && D.City) D.City.clearAll();
  D.toast(`Cleared ${l.name}`);
}

// History panel
const HIST_ICONS = { raise: 'raise', smooth: 'smooth', flatten: 'flatten', noise: 'noise', terrace: 'terrace', erode: 'erode', cliff: 'cliff', ramp: 'ramp', stamp: 'stamp', sea: 'sea', lake: 'lake', river: 'river', brush: 'brush', biome: 'biome', tree: 'tree', road: 'road', bulldoze: 'bulldoze', zone: 'zone', density: 'density', prosperity: 'density', building: 'building', paste: 'paste', trash: 'trash' };
function refreshHistory() {
  const list = $('history-list'); if (!list) return;
  const H = D.History;
  list.innerHTML = '';
  const start = el('div', 'hist' + (H.pos === 0 ? ' cur' : ''), `${svg('world', 14)}<span>${W.name || 'World'} (start)</span>`);
  start.onclick = () => H.jump(0);
  list.appendChild(start);
  H.entries.forEach((e, i) => {
    const row = el('div', 'hist' + (i === H.pos - 1 ? ' cur' : '') + (i >= H.pos ? ' future' : ''), `${svg(HIST_ICONS[e.icon] || 'dot', 14)}<span>${e.label}</span>`);
    row.onclick = () => H.jump(i + 1);
    list.appendChild(row);
  });
  const cur = list.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  P.hist.extra.innerHTML = `<span class="muted">${H.pos}/${H.entries.length}</span>`;
}

// Catalogue panel (contextual)
function refreshCatalogue() {
  const d = D.Tools.defs[D.Tools.cur];
  const panelEl = P.cat.p;
  const b = P.cat.b;
  b.innerHTML = '';
  let title = null;
  const o = D.Tools.o();
  const grid = el('div', 'cat-grid');
  const item = (label, swatchHTML, on, click, tipText) => {
    const c = el('div', 'cat' + (on ? ' on' : ''), `<div class="sw">${swatchHTML}</div><span>${label}</span>`);
    c.onclick = () => { click(); refreshCatalogue(); refreshOptionValues(); };
    if (tipText) c.title = tipText;
    grid.appendChild(c);
  };
  if (d.id === 'paint') {
    title = 'Ground materials';
    D.Tools.MATERIALS.forEach(m => item(m.name, m.id < 0 ? '⌫' : `<div style="width:100%;height:100%;border-radius:3px;background:${m.col}"></div>`, o.material === m.id, () => { o.material = m.id; }));
  } else if (d.id === 'forest') {
    title = 'Plants & props';
    const sw = (c) => `<div style="width:100%;height:100%;border-radius:3px;background:${c}"></div>`;
    item('Auto trees', '🌳', o.species === -1, () => { o.species = -1; }, 'Picks trees that suit the biome and altitude');
    item('Auto bushes', '🌿', o.species === -2, () => { o.species = -2; });
    const emoji = { oak: '🌳', pine: '🌲', poplar: '🌲', birch: '🌳', spruce: '🌲', palm: '🌴', jungle: '🌳', blossom: '🌸', cactus: '🌵', bush: '🌿', scrub: '🌾', flowers: '🌷', rock: '🪨',
      lantern: '🏮', wattle: '🧺', hedge: '🟩', barrels: '🛢', haystack: '🌾', cart: '🛒', crates: '📦', woodpile: '🪵', stook: '🌾', drystone: '🪨', veg: '🥬', herbs: '🌿',
      apple: '🍎', pear: '🍐', grave: '🪦', skep: '🐝', netrack: '🎣', waycross: '✝', yew: '🌲', vine: '🍇', torchpost: '🔥' };
    D.Nature.SPECIES.forEach((s, i) => item(s.name, emoji[s.id] || '•', o.species === i, () => {
      o.species = i;
      if (s.cat === 'prop' && o.mode === 'scatter') { o.mode = 'line'; D.toast(`${s.name}: Line mode, drag to lay them along your stroke`); }
      if (s.cat !== 'prop' && o.mode === 'line') o.mode = 'scatter';
    }));
  } else if (d.id === 'stamp') {
    title = 'Stamp shapes';
    const em = { mountain: '⛰', volcano: '🌋', hill: '🟢', mesa: '🟫', ridge: '〰', crater: '🕳', canyon: '⌇', dunes: '≋' };
    D.Tools.STAMPS.forEach(s => item(s.name, em[s.id], o.shape === s.id, () => { o.shape = s.id; }));
  } else if (d.catalogue) {
    title = d.catalogue(grid, item, o);
  }
  if (!title) { panelEl.style.display = 'none'; return; }
  panelEl.style.display = '';
  P.cat.title.textContent = title;
  b.appendChild(grid);
}
UI.refreshCatalogue = refreshCatalogue;

// World info
function refreshWorld() {
  const e = $('world-info'); if (!e) return;
  const trees = D.Nature.count();
  const roads = D.Roads && D.Roads.totalLength ? D.Roads.totalLength() : 0;
  const bld = D.City && D.City.count ? D.City.count() : 0;
  const pop = D.City && D.City.population ? D.City.population() : 0;
  e.innerHTML = `
    <div class="row"><label>Name</label><span style="color:#fff">${W.name}</span></div>
    <div class="row"><label>Landscape</label><span>${(D.Gen.STYLES.find(s => s.id === W.style) || {}).name || '—'} · seed ${W.seed}</span></div>
    <div class="row"><label>Plants</label><span>${trees.toLocaleString()}</span></div>
    <div class="row"><label>Lakes · rivers</label><span>${W.lakes.length} · ${W.rivers.length}</span></div>
    <div class="row"><label>Roads</label><span>${(roads / 1000).toFixed(1)} km</span></div>
    <div class="row"><label>Settlements</label><span>${D.Town && D.Town.list ? D.Town.list.size : 0}</span></div>
    <div class="row"><label>Buildings</label><span>${bld.toLocaleString()}${pop ? ` · ~${pop.toLocaleString()} people` : ''}</span></div>`;
}
UI.refreshWorld = refreshWorld;

// Status bar
function updateStatus(hit) {
  if (!hit) { $('st-pos').textContent = 'x — z —'; $('st-elev').textContent = 'elev —'; $('st-slope').textContent = 'slope —'; return; }
  $('st-pos').textContent = `x ${(hit.x / 1000).toFixed(2)} km  z ${(hit.z / 1000).toFixed(2)} km`;
  const wl = D.Terrain.waterAt(hit.x, hit.z);
  const rel = hit.y - W.seaLevel;
  $('st-elev').textContent = wl > hit.y ? `depth ${(wl - hit.y).toFixed(1)} m` : `elev ${rel.toFixed(1)} m`;
  $('st-slope').textContent = `slope ${D.Terrain.slopeAt(hit.x, hit.z).toFixed(0)}°`;
}
UI.setPerf = function (fps, extra) { $('st-perf').textContent = `${fps} fps${extra ? ' · ' + extra : ''}`; };
UI.setSave = function (txt) { $('st-save').textContent = txt; };

UI.togglePanels = function () {
  const a = $('app');
  a.classList.toggle('no-panels');
  D.emit('resize');
};

// ---- New world dialog -------------------------------------------------------------------------
let nwStyle = 'continental';
function buildNewWorld() {
  const g = $('nw-styles');
  D.Gen.STYLES.forEach(s => {
    const c = el('div', 'style-card', `<div class="sc-name"><span>${s.icon}</span>${s.name}</div><div class="sc-desc">${s.desc}</div>`);
    c.dataset.id = s.id;
    c.onclick = () => { nwStyle = s.id; refreshNW(); };
    g.appendChild(c);
  });
  $('nw-seed').value = String(Math.floor(Math.random() * 99999));
  $('nw-dice').onclick = () => { $('nw-seed').value = String(Math.floor(Math.random() * 99999)); refreshNW(); };
  $('nw-seed').oninput = () => refreshNW(true);
  $('nw-climate').onchange = () => refreshNW();
  $('nw-cancel').onclick = () => { if (UI.hasWorld) $('newworld').hidden = true; else D.toast('Pick a style and generate your first world!'); };
  $('nw-go').onclick = () => UI.generate();
}
let nwTimer = 0;
function nwOpts() {
  const seedStr = $('nw-seed').value.trim() || '1';
  const seed = /^\d+$/.test(seedStr) ? +seedStr : D.hashStr(seedStr) % 1e6;
  const c = $('nw-climate').value;
  return { style: nwStyle, seed, climate: c === 'auto' ? 'auto' : c === 'mixed' ? 'mixed' : +c,
    forests: $('nw-forests').checked, rivers: $('nw-rivers').checked, erosion: $('nw-erosion').checked };
}
function refreshNW(debounce) {
  document.querySelectorAll('.style-card').forEach(c => c.classList.toggle('on', c.dataset.id === nwStyle));
  const s = D.Gen.STYLES.find(s => s.id === nwStyle);
  $('nw-desc').textContent = s.desc;
  clearTimeout(nwTimer);
  nwTimer = setTimeout(() => D.Gen.preview(nwOpts(), $('nw-preview')), debounce ? 250 : 20);
}
UI.newWorld = function () {
  $('newworld').hidden = false;
  refreshNW();
};
UI.generate = async function () {
  const o = nwOpts();
  $('newworld').hidden = true;
  $('loading').hidden = false;
  $('ld-title').textContent = 'Building world';
  const prog = (step, p) => { $('ld-step').textContent = step + '…'; $('ld-fill').style.width = Math.round(p * 100) + '%'; };
  if (D.Roads && D.Roads.reset) D.Roads.reset();
  if (D.City && D.City.reset) D.City.reset();
  await D.Gen.generate(o, prog);
  const s = D.Gen.STYLES.find(s => s.id === o.style);
  W.name = `${s.name} #${o.seed}`;
  D.Water.setSeaLevel(W.seaLevel);
  D.Water.setSeaMesh();
  $('loading').hidden = true;
  UI.hasWorld = true;
  D.Cam.overview(); D.Cam.goal.yaw = 0.7; D.Cam.snap();
  D.Cam.goal.dist = 11000; D.Cam.goal.pitch = 0.6;
  refreshWorld(); refreshHistory();
  navDirty = true;
  if (D.Save) D.Save.saveNow(false);
  D.toast(`Welcome to <b>${W.name}</b>. Pick a tool on the left and start shaping!`, '', 4500);
  UI.quickstart(false);
};

// ---- Quick start card -------------------------------------------------------------------------
UI.quickstart = function (force) {
  const prefs = D.Save ? D.Save.loadPrefs() : {};
  if (!force && prefs.seenQuickstart) return;
  let c = $('quickstart');
  if (c) c.remove();
  c = el('div', '', '');
  c.id = 'quickstart';
  const step = (icon, title, text) => `<div class="qs-step">${svg(icon, 18)}<div><b>${title}</b><span>${text}</span></div></div>`;
  c.innerHTML = `<div class="qs-h"><span class="logo"></span>Quick start<span class="x" title="Close">×</span></div>
    ${step('raise', 'Sculpt', 'Raise / Lower (B), Stamp a mountain (K), carve Cliffs (C). Hold Shift to invert.')}
    ${step('river', 'Add water', 'River (I): click high ground and a spring finds its way to the sea. Lake (L) fills a hollow.')}
    ${step('tree', 'Grow nature', 'Nature brush (V) sprays forests; Ground paint (P) lays fields, sand and flowers.')}
    ${step('zone', 'Grow a settlement', 'Paint a Village, Farmland, Castle, Monastery or Harbour zone (Z) and watch it build itself. Draw roads (R) to guide it; Alt+click a settlement to tweak it.')}
    ${step('camera', 'Show it off', 'Photo mode for tilt-shift shots, or Walk (the little person) to explore at street level.')}
    <div class="qs-foot">Right-drag orbits · wheel zooms · Ctrl+Z undoes anything · F1 lists every shortcut</div>`;
  $('viewport').appendChild(c);
  c.querySelector('.x').onclick = () => { c.remove(); if (D.Save) D.Save.prefs({ seenQuickstart: true }); };
};

// ---- Help -----------------------------------------------------------------------------------------
UI.help = function (about) {
  const h = $('help');
  const k = (a, b) => `<div class="krow"><span>${b}</span><span class="k">${a}</span></div>`;
  const tools = D.Tools.order.map(id => D.Tools.defs[id]).filter(d => d.key).map(d => k(d.key, d.name)).join('');
  h.innerHTML = `<div class="dialog"><div class="dlg-title"><span class="logo"></span>${about ? 'About Diorama' : 'Keyboard shortcuts'}</div><div class="dlg-body">
    ${about ? `<p><b>Diorama</b> is a sandbox world builder: Photoshop-style tools for sculpting landscapes, carving rivers and planting forests, then painting zones where medieval villages, farms, castles, monasteries and harbours grow all by themselves. No money, no goals, just making something beautiful.</p>
      <p class="muted">Everything is generated in your browser: the terrain, trees, buildings and even the ambient sound. Your world autosaves in this browser; use File → Export to keep a copy.</p>
      <p class="muted">Built for mondayjeffrey.com.</p>` : `
    <div class="help-h">Camera</div><div class="keys-grid">
      ${k('Right-drag', 'Orbit')}${k('Middle-drag / Space+drag', 'Pan')}${k('Wheel', 'Zoom (toward cursor)')}${k('W A S D', 'Move')}${k('Q / E', 'Rotate')}${k('Home', 'Overview')}</div>
    <div class="help-h">Brushes</div><div class="keys-grid">
      ${k('[ / ]', 'Brush size')}${k('Shift+[ / ]', 'Hardness')}${k('1 … 0', 'Strength 10–100%')}${k('Ctrl+wheel', 'Brush size')}${k('Shift (hold)', 'Invert: lower / erase')}${k('Alt+click', 'Sample height (Flatten, Sea)')}</div>
    <div class="help-h">Edit</div><div class="keys-grid">
      ${k('Ctrl+Z / Ctrl+Y', 'Undo / Redo')}${k('Ctrl+C / X / V', 'Copy / Cut / Paste land')}${k('Ctrl+A / Ctrl+D', 'Select all / Deselect')}${k(', / .', 'Rotate paste')}${k('Del', 'Clear selection')}${k('Tab', 'Hide panels')}${k('Ctrl+S', 'Save now')}${k('Esc', 'Cancel / exit mode')}</div>
    <div class="help-h">Tools</div><div class="keys-grid">${tools}</div>
    <div class="help-h">Street level</div><div class="keys-grid">${k('W A S D + mouse', 'Walk / drive')}${k('C', 'Switch walk ↔ drive')}${k('Shift', 'Run')}${k('Esc', 'Back to editor')}</div>`}
  </div><div class="dlg-foot"><button class="btn primary" id="help-close">Close</button></div></div>`;
  h.hidden = false;
  $('help-close').onclick = () => { h.hidden = true; };
  h.onclick = e => { if (e.target === h) h.hidden = true; };
};

// ---- Photo mode ---------------------------------------------------------------------------------
let photoSaved = null;
UI.enterPhoto = function () {
  if (UI.photo) return;
  UI.photo = true;
  photoSaved = Object.assign({}, D.Post.p, { preset: D.Post.preset });
  if (D.Post.preset === 'natural') D.Post.applyPreset('diorama');
  $('app').classList.add('no-panels');
  D.emit('resize');
  buildPhotoUI();
  $('photoui').hidden = false;
  D.hint('Photo mode · <b>H</b> hides this panel · click the scene to focus (depth of field) · <b>Esc</b> exits', 4000);
};
UI.exitPhoto = function () {
  if (!UI.photo) return;
  UI.photo = false;
  if (D.Cam.flyT >= 0) D.Cam.stopFly();
  $('photoui').hidden = true;
  $('app').classList.remove('no-panels');
  $('thirds').hidden = true;
  if (photoSaved) { const pr = photoSaved.preset; delete photoSaved.preset; Object.assign(D.Post.p, photoSaved); D.Post.preset = pr; }
  D.Post.p.letterbox = 0; D.Post.p.dofOn = false;
  D.Cam.fov = 50; D.Cam.roll = 0;
  D.emit('resize');
};
UI.togglePhotoPanel = function () { $('photoui').classList.toggle('min'); };
function buildPhotoUI() {
  const pu = $('photoui');
  const p = D.Post.p;
  const sl = (id, label, min, max, step, get, set, fmt) => `<div class="row"><label>${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"><span class="val" id="${id}-v"></span></div>`;
  pu.innerHTML = `<div class="ph-title">${svg('camera', 16)} Photo mode<span class="x" id="ph-min" title="Collapse (H)">–</span><span class="x" id="ph-x" title="Exit (Esc)">×</span></div>
  <div class="ph-body">
    <div class="ph-sec">Filter</div><div class="chips" id="ph-presets"></div>
    <div class="ph-sec">Light & colour</div>
    ${sl('ph-exp', 'Exposure', 0.4, 2, 0.01)}${sl('ph-con', 'Contrast', 0.6, 1.6, 0.01)}${sl('ph-sat', 'Saturation', 0, 2, 0.01)}
    ${sl('ph-temp', 'Warmth', -0.6, 0.6, 0.01)}${sl('ph-bloom', 'Glow', 0, 1.5, 0.01)}${sl('ph-vig', 'Vignette', 0, 1, 0.01)}${sl('ph-grain', 'Grain', 0, 0.25, 0.005)}
    <div class="ph-sec">Lens</div>
    <div class="row"><label>Tilt-shift</label><input type="checkbox" id="ph-tilt"></div>
    ${sl('ph-tilty', 'Focus band', 0.1, 0.9, 0.01)}${sl('ph-tiltb', 'Band width', 0.02, 0.35, 0.005)}${sl('ph-tiltblur', 'Blur', 0.2, 1.6, 0.01)}
    <div class="row"><label>Depth of field</label><input type="checkbox" id="ph-dof"><span class="muted small">click to focus</span></div>
    ${sl('ph-ap', 'Aperture', 0.2, 4, 0.01)}
    ${sl('ph-fov', 'Field of view', 15, 100, 1)}${sl('ph-roll', 'Roll', -30, 30, 0.5)}${sl('ph-letter', 'Letterbox', 0, 0.2, 0.005)}
    <div class="row"><label>Thirds grid</label><input type="checkbox" id="ph-thirds"></div>
    <div class="ph-sec">Scene</div>
    <div class="row"><label>Time</label><input type="range" id="ph-time" min="0" max="24" step="0.05"><span class="val" id="ph-time-v"></span></div>
    <div class="chips" id="ph-weather" style="margin-bottom:6px"></div>
    <div class="chips" id="ph-season"></div>
    <div class="btnrow" style="margin-top:10px"><button class="btn primary ph-cap" id="ph-cap">${svg('camera', 15)} Capture</button></div>
    <div class="btnrow" style="margin-top:6px"><button class="btn small" id="ph-cap2">Capture 2× (hi-res)</button><button class="btn small" id="ph-orbit">Showcase orbit</button></div>
    <div class="ph-sec" id="ph-fly">Flyover</div>
    <div class="muted small">Frame a shot, add it as a keyframe, repeat, then play.</div>
    <div class="flyover-list" id="ph-keys"></div>
    <div class="btnrow"><button class="btn small" id="ph-addkey">+ Add keyframe</button><button class="btn small primary" id="ph-play">▶ Play</button></div>
    ${sl('ph-dur', 'Duration', 4, 90, 1)}
    <div class="row"><label>Loop</label><input type="checkbox" id="ph-loop"></div>
  </div>`;
  const bind = (id, get, set, fmt) => {
    const r = $(id), v = $(id + '-v');
    const upd = () => { if (v) v.textContent = fmt ? fmt(get()) : (+get()).toFixed(2); };
    r.value = get(); upd();
    r.oninput = () => { set(+r.value); upd(); };
    r._refresh = () => { r.value = get(); upd(); };
    return r;
  };
  const sliders = [
    bind('ph-exp', () => p.exposure, v => p.exposure = v), bind('ph-con', () => p.contrast, v => p.contrast = v),
    bind('ph-sat', () => p.saturation, v => p.saturation = v), bind('ph-temp', () => p.temp, v => p.temp = v),
    bind('ph-bloom', () => p.bloom, v => p.bloom = v), bind('ph-vig', () => p.vignette, v => p.vignette = v),
    bind('ph-grain', () => p.grain, v => p.grain = v),
    bind('ph-tilty', () => 1 - p.tiltY, v => p.tiltY = 1 - v), bind('ph-tiltb', () => p.tiltBand, v => p.tiltBand = v), bind('ph-tiltblur', () => p.tiltBlur, v => p.tiltBlur = v),
    bind('ph-ap', () => p.dofAperture, v => p.dofAperture = v),
    bind('ph-fov', () => D.Cam.fov, v => D.Cam.fov = v, v => v.toFixed(0) + '°'), bind('ph-roll', () => D.Cam.roll * 180 / Math.PI, v => D.Cam.roll = v * Math.PI / 180, v => v.toFixed(1) + '°'),
    bind('ph-letter', () => p.letterbox, v => p.letterbox = v),
    bind('ph-time', () => D.Env.time, v => { D.Env.time = v; refreshEnvValues(); }, fmtTime),
    bind('ph-dur', () => D.Cam.flyDur, v => D.Cam.flyDur = v, v => v.toFixed(0) + ' s')
  ];
  const cb = (id, get, set) => { const c = $(id); c.checked = get(); c.onchange = () => set(c.checked); return c; };
  const tiltCb = cb('ph-tilt', () => p.tiltOn, v => p.tiltOn = v);
  cb('ph-dof', () => p.dofOn, v => { p.dofOn = v; if (v) p.dofFocus = D.Cam.distance(); });
  cb('ph-thirds', () => !$('thirds').hidden, v => { $('thirds').hidden = !v; });
  cb('ph-loop', () => D.Cam.flyLoop, v => D.Cam.flyLoop = v);
  const presets = $('ph-presets');
  Object.keys(D.Post.PRESETS).forEach(k => {
    const c = el('span', 'chip' + (D.Post.preset === k ? ' on' : ''), D.Post.PRESETS[k].name);
    c.onclick = () => { D.Post.applyPreset(k); presets.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); sliders.forEach(s => s._refresh()); tiltCb.checked = p.tiltOn; };
    presets.appendChild(c);
  });
  chips('ph-weather', [['clear', '☀'], ['cloudy', '⛅'], ['rain', '🌧'], ['storm', '⛈'], ['fog', '🌫'], ['snow', '❄']], () => D.Env.weather, v => { D.Sky.setWeather(v); refreshEnvValues(); });
  chips('ph-season', [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']], () => D.Env.season, v => { D.Sky.setSeason(v); refreshEnvValues(); });
  $('ph-x').onclick = UI.exitPhoto;
  $('ph-min').onclick = UI.togglePhotoPanel;
  $('ph-cap').onclick = () => { $('photoui').hidden = true; setTimeout(() => { D.Post.capture(1); setTimeout(() => { if (UI.photo) $('photoui').hidden = false; }, 300); }, 50); };
  $('ph-cap2').onclick = () => { $('photoui').hidden = true; setTimeout(() => { D.Post.capture(2); setTimeout(() => { if (UI.photo) $('photoui').hidden = false; }, 600); }, 50); };
  $('ph-orbit').onclick = () => { D.Cam.autoOrbit = D.Cam.autoOrbit ? 0 : 0.06; };
  $('ph-addkey').onclick = () => { D.Cam.addKey(); D.toast(`Keyframe ${D.Cam.flyKeys.length} added`); };
  $('ph-play').onclick = () => D.Cam.playFly();
  refreshFlyKeys();
}
function refreshFlyKeys() {
  const l = $('ph-keys'); if (!l) return;
  l.innerHTML = D.Cam.flyKeys.length ? '' : '<div class="muted small" style="padding:4px 0">No keyframes yet.</div>';
  D.Cam.flyKeys.forEach((k, i) => {
    const r = el('div', 'fk', `<span>Keyframe ${i + 1} · ${(k.p.y - D.Terrain.hAt(D.clamp(k.p.x, 0, SIZE), D.clamp(k.p.z, 0, SIZE))).toFixed(0)} m up</span><button title="Remove">✕</button>`);
    r.querySelector('button').onclick = () => D.Cam.removeKey(i);
    l.appendChild(r);
  });
}
})();
