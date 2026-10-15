/* ==========================================================================
   POONOMICS app shell: levers, KPI strip, tabs, debug tools, console.
   ========================================================================== */
(function () {
  'use strict';
  const POON = window.POON, LV = window.POON_LEVERS, C = window.POON_CALIB, CH = window.PoonCharts;
  const PRESETS = window.POON_PRESETS, REFORMS = window.POON_REFORMS;
  const LS_KEY = 'poonomics.v1';
  const HORIZON = C.horizon;
  const $ = (s, r) => (r || document).querySelector(s);

  // ------------------------------------------------------------------ helpers
  function append(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(e, x));
    else if (c.nodeType) e.appendChild(c);
    else e.appendChild(document.createTextNode(String(c)));
  }
  function h(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (let i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const f0 = (v) => (isNum(v) ? Math.round(v).toLocaleString('en-AU') : '-');
  const f1 = (v, d) => (isNum(v) ? v.toFixed(d === undefined ? 1 : d) : '-');
  function money(v) {            // $B in, compact out
    if (!isNum(v)) return '-';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1000) return s + '$' + (a / 1000).toFixed(2) + 'T';
    if (a >= 100) return s + '$' + a.toFixed(0) + 'B';
    if (a >= 1) return s + '$' + a.toFixed(1) + 'B';
    return s + '$' + (a * 1000).toFixed(0) + 'M';
  }
  function dollars(v) {
    if (!isNum(v)) return '-';
    if (v >= 1e9) return '$' + +(v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + +(v / 1e6).toFixed(2) + 'M';
    return '$' + Math.round(v).toLocaleString('en-AU');
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function sgn(v, d) { const s = Math.abs(v).toFixed(d); return parseFloat(s) === 0 ? '0' : (v > 0 ? '+' : '-') + s; }
  const FY = (y) => 'FY' + String(y).slice(-2);
  const ORIG_CALIB = clone(C);

  // -------------------------------------------------------------------- state
  const defaults = POON.defaults();
  const levById = {};
  LV.forEach((l) => { levById[l.id] = l; l.log = l.min > 0 && l.max / l.min >= 200; });
  const state = { P: {}, events: [], pins: [], calib: {}, cursor: 10, tab: 'dash', showBase: true, open: {}, search: '' };
  let base = null, res = null, resObj = null, lastErr = null, labMemo = null, playTimer = null;
  const val = (id) => (state.P[id] === undefined ? defaults[id] : state.P[id]);

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ P: state.P, events: state.events, pins: state.pins, calib: state.calib, cursor: state.cursor, tab: state.tab, showBase: state.showBase })); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      let raw = null;
      if (location.hash.indexOf('#s=') === 0) raw = decodeURIComponent(atob(location.hash.slice(3)));
      else raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      state.P = o.P || {}; state.events = o.events || []; state.pins = o.pins || []; state.calib = o.calib || {};
      if (isNum(o.cursor)) state.cursor = o.cursor;
      if (o.tab) state.tab = o.tab;
      if (o.showBase === false) state.showBase = false;
    } catch (e) { /* ignore bad saved state */ }
  }
  function setPath(obj, path, v) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] === undefined) throw new Error('No such path: ' + path); o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (o[last] === undefined) throw new Error('No such path: ' + path);
    o[last] = v;
  }
  function applyCalib() {
    Object.keys(ORIG_CALIB).forEach((k) => { C[k] = clone(ORIG_CALIB[k]); });
    Object.keys(state.calib).forEach((p) => { try { setPath(C, p, state.calib[p]); } catch (e) { delete state.calib[p]; } });
    POON.resetBaseline();
  }

  // ---------------------------------------------------------------- recompute
  function recompute() {
    try {
      const P = Object.assign({}, state.P, { _pins: state.pins });
      base = POON.baseline().rows;
      resObj = POON.scenario(P, state.events);
      res = resObj.rows;
      lastErr = null;
    } catch (e) {
      lastErr = e;
      console.error(e);
    }
    labMemo = null;
  }
  let rtimer = 0;
  function refresh() {
    clearTimeout(rtimer);
    rtimer = setTimeout(() => {
      recompute();
      renderKpis();
      renderView();
      updateChanged();
      save();
    }, 0);
  }

  // ---------------------------------------------------------------- KPI strip
  const KPIS = [
    { k: 'gdpReal', l: 'Real GDP', f: (v) => '$' + (v / 1000).toFixed(2) + 'T', better: 1, rel: true },
    { k: 'gdpPC', l: 'GDP / person', f: (v) => '$' + v.toFixed(0) + 'k', better: 1, rel: true },
    { k: 'u', l: 'Unemployment', f: (v) => v.toFixed(1) + '%', better: -1, unit: 'pp' },
    { k: 'cpi', l: 'Inflation', f: (v) => v.toFixed(1) + '%', better: 0, unit: 'pp' },
    { k: 'rcash', l: 'Cash rate', f: (v) => v.toFixed(2) + '%', better: 0, unit: 'pp' },
    { k: 'balPct', l: 'Budget balance', f: (v) => v.toFixed(1) + '% GDP', better: 1, unit: 'pp' },
    { k: 'debtPct', l: 'Net debt', f: (v) => v.toFixed(0) + '% GDP', better: -1, unit: 'pp' },
    { k: 'taxPct', l: 'Tax take', f: (v) => v.toFixed(1) + '% GDP', better: 0, unit: 'pp' },
    { k: 'poverty', l: 'Poverty rate', f: (v) => v.toFixed(1) + '%', better: -1, unit: 'pp' },
    { k: 'gini', l: 'Inequality (Gini)', f: (v) => v.toFixed(1), better: -1, unit: 'pt' },
    { k: 'careGap', l: 'Care gap', f: (v) => v.toFixed(1) + '/100', better: -1, unit: 'pt' },
    { k: 'priceToIncome', l: 'House price / income', f: (v) => v.toFixed(1) + 'x', better: -1, unit: 'x' }
  ];
  function renderKpis() {
    const box = $('#kpis');
    box.textContent = '';
    if (!res) return;
    const r = res[state.cursor], b = base[state.cursor];
    KPIS.forEach((k) => {
      const v = r[k.k], bv = b[k.k];
      let d = '', cls = '';
      if (k.rel) { const p = (v / bv - 1) * 100; d = sgn(p, 1) + '% vs base'; if (Math.abs(p) > 0.05) cls = (p * k.better > 0) ? 'good' : 'bad'; }
      else { const diff = v - bv; d = sgn(diff, Math.abs(diff) < 10 ? 1 : 0) + k.unit + ' vs base'; if (Math.abs(diff) > 0.05 && k.better) cls = (diff * k.better > 0) ? 'good' : 'bad'; }
      box.appendChild(h('div', { class: 'kpi', title: 'Base year (' + FY(res[0].year) + '): ' + k.f(res[0][k.k]) }, h('div', { class: 'l', text: k.l }), h('div', { class: 'v', text: k.f(v) }), h('div', { class: 'd ' + cls, text: d })));
    });
    $('#yearBig').textContent = FY(r.year);
    $('#cursor').value = state.cursor;
  }

  // --------------------------------------------------------------- lever panel
  const leverRefs = {};
  function fmtLever(l, v) {
    switch (l.type) {
      case 'pct': { const d = l.step * 100 < 0.1 ? 2 : l.step * 100 < 1 ? 1 : 0; return (v * 100).toFixed(d) + '%'; }
      case 'usd': return dollars(v);
      case 'usdB': return '$' + v.toFixed(1) + 'B';
      case 'mult': return v.toFixed(2) + 'x';
      case 'bool': return v ? 'On' : 'Off';
      case 'sel': return l.opts[v];
      case 'int': return String(Math.round(v));
      default: return String(+v.toFixed(3));
    }
  }
  function toSlider(l, v) { return l.log ? Math.round(Math.log(v / l.min) / Math.log(l.max / l.min) * 1000) : v; }
  function fromSlider(l, t) {
    if (l.log) { const raw = l.min * Math.pow(l.max / l.min, t / 1000); const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1); return Math.round(raw / mag) * mag; }
    return +t;
  }
  function setLever(id, v, noRefresh) {
    const l = levById[id];
    v = Math.min(l.max, Math.max(l.min, v));
    if (l.type === 'bool' || l.type === 'sel' || l.type === 'int') v = Math.round(v);
    if (Math.abs(v - defaults[id]) < 1e-12) delete state.P[id]; else state.P[id] = v;
    syncLever(id);
    if (!noRefresh) refresh();
  }
  function syncLever(id) {
    const ref = leverRefs[id]; if (!ref) return;
    const l = levById[id], v = val(id);
    ref.val.textContent = fmtLever(l, v);
    if (ref.input) { if (ref.input.type === 'checkbox') ref.input.checked = !!v; else ref.input.value = l.type === 'sel' ? v : toSlider(l, v); }
    const ch = state.P[id] !== undefined;
    ref.row.classList.toggle('changed', ch);
    ref.undo.hidden = !ch;
  }
  function updateChanged() {
    const n = Object.keys(state.P).length + state.events.length + state.pins.length;
    $('#changedPill').textContent = n + ' changed';
    LV.forEach((l) => { });
    document.querySelectorAll('details.grp').forEach((d) => {
      const g = d.dataset.g; const c = LV.filter((l) => l.g === g && state.P[l.id] !== undefined).length;
      d.querySelector('.n').textContent = c ? c + ' changed' : '';
    });
  }
  function buildLevers() {
    const box = $('#levers'); box.textContent = '';
    const groups = []; LV.forEach((l) => { if (groups.indexOf(l.g) < 0) groups.push(l.g); });
    const q = state.search.trim().toLowerCase();
    groups.forEach((g) => {
      const items = LV.filter((l) => l.g === g && (!q || (l.label + ' ' + l.tip + ' ' + g).toLowerCase().indexOf(q) >= 0));
      if (!items.length) return;
      const d = h('details', { class: 'grp', 'data-g': g });
      if (q || state.open[g]) d.open = true;
      d.addEventListener('toggle', () => { state.open[g] = d.open; });
      d.appendChild(h('summary', null, h('span', { text: g }), h('span', { class: 'n' })));
      items.forEach((l) => {
        const row = h('div', { class: 'lever' });
        const valEl = h('span', { class: 'val' });
        const undo = h('button', { class: 'undo', type: 'button', text: 'reset', onclick: () => setLever(l.id, defaults[l.id]) });
        let input;
        if (l.type === 'bool') input = h('input', { type: 'checkbox', id: 'lv_' + l.id, onchange: (e) => setLever(l.id, e.target.checked ? 1 : 0) });
        else if (l.type === 'sel') {
          input = h('select', { id: 'lv_' + l.id, onchange: (e) => setLever(l.id, +e.target.value) }, l.opts.map((o, i) => h('option', { value: i, text: o })));
        } else {
          input = h('input', { type: 'range', id: 'lv_' + l.id, min: l.log ? 0 : l.min, max: l.log ? 1000 : l.max, step: l.log ? 1 : l.step,
            oninput: (e) => setLever(l.id, fromSlider(l, +e.target.value)) });
        }
        row.appendChild(h('div', { class: 'top' }, h('label', { for: 'lv_' + l.id, text: l.label }), h('span', null, valEl, ' ', undo)));
        row.appendChild(input);
        if (l.tip) row.appendChild(h('div', { class: 'tip', text: l.tip }));
        d.appendChild(row);
        leverRefs[l.id] = { row, val: valEl, input, undo };
        syncLever(l.id);
      });
      box.appendChild(d);
    });
    updateChanged();
  }
  function syncAllLevers() { LV.forEach((l) => syncLever(l.id)); }

  // ---------------------------------------------------------------- view core
  const TABS = [['dash', 'Dashboard'], ['budget', 'Budget'], ['people', 'People'], ['services', 'Services'], ['housing', 'Housing'], ['wealth', 'Wealth and tax gap'], ['lab', 'Reform lab'], ['debug', 'Debug'], ['notes', 'Notes']];
  let pending = [];
  function chartCard(title, sub, draw, cls) {
    const host = h('div', { class: 'chart-host' });
    pending.push(() => draw(host));
    return h('div', { class: 'card ' + (cls || '') }, h('h3', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, host);
  }
  const xs = () => res.map((r) => r.year);
  function pair(key, scale, opt) {
    const sc = scale || 1;
    const out = [];
    if (state.showBase) out.push({ name: 'Baseline', data: base.map((r) => r[key] * sc), color: 'var(--base)', dash: '5 4', width: 1.6 });
    out.push({ name: (opt && opt.name) || 'Scenario', data: res.map((r) => r[key] * sc), color: (opt && opt.color) || 'var(--s1)' });
    return out;
  }
  const lc = (key, o) => (host) => CH.lineChart(host, Object.assign({ xs: xs(), series: pair(key, o && o.scale, o), cursor: state.cursor, onPick: pick }, o));
  function pick(i) { state.cursor = i; renderKpis(); renderView(); save(); }

  function renderTabs() {
    const t = $('#tabs'); t.textContent = '';
    TABS.forEach(([id, label]) => {
      t.appendChild(h('button', { class: 'tab', role: 'tab', 'aria-selected': state.tab === id ? 'true' : 'false', type: 'button', text: label,
        onclick: () => { state.tab = id; renderTabs(); renderView(); save(); } }));
    });
  }
  function renderView() {
    const v = $('#view');
    if (lastErr) { v.textContent = ''; v.appendChild(h('div', { class: 'callout bad', html: '<b>The model threw an error.</b> ' + String(lastErr.message || lastErr) + ' &ndash; try Reset all, or undo the last change in Debug.' })); return; }
    if (!res) return;
    pending = [];
    const fn = { dash: viewDash, budget: viewBudget, people: viewPeople, services: viewServices, housing: viewHousing, wealth: viewWealth, lab: viewLab, debug: viewDebug, notes: viewNotes }[state.tab];
    const scroll = window.scrollY;
    v.textContent = '';
    v.appendChild(fn());
    pending.forEach((d) => d());
    pending = [];
    window.scrollTo(0, scroll);
  }
  window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(renderView, 150); }; })());

  // ---------------------------------------------------------------- dashboard
  function summaryCallout() {
    const r = res[state.cursor], b = base[state.cursor];
    const n = Object.keys(state.P).length + state.events.length + state.pins.length;
    if (!n) return h('div', { class: 'callout', html: '<b>This is the baseline.</b> Current policy plus legislated changes, calibrated to FY2025-26. Move any lever on the left, load a preset, or open Debug to break things on purpose. Every chart shows your scenario against this baseline.' });
    const dg = (r.balPct - b.balPct), dd = r.debtPct - b.debtPct, dgdp = (r.gdpReal / b.gdpReal - 1) * 100;
    const parts = [];
    parts.push('In <b>' + FY(r.year) + '</b> your scenario has GDP <b>' + (dgdp >= 0 ? '+' : '') + dgdp.toFixed(1) + '%</b> against baseline, unemployment <b>' + r.u.toFixed(1) + '%</b>, inflation <b>' + r.cpi.toFixed(1) + '%</b>.');
    parts.push('The budget is <b>' + (dg >= 0 ? '+' : '') + dg.toFixed(1) + ' points of GDP</b> different and net debt is <b>' + (dd >= 0 ? '+' : '') + dd.toFixed(0) + ' points</b>.');
    parts.push('Poverty is <b>' + r.poverty.toFixed(1) + '%</b> (baseline ' + b.poverty.toFixed(1) + '%), care gap <b>' + r.careGap.toFixed(1) + '</b> (baseline ' + b.careGap.toFixed(1) + ').');
    const warn = res.some((x) => Math.abs(x.identity) > 0.5);
    return h('div', { class: 'callout' + (warn ? ' bad' : '') , html: parts.join(' ') + (warn ? ' <b>Accounting identity is broken in some years (see Debug).</b>' : '') });
  }
  function viewDash() {
    const g = h('div', { class: 'grid' });
    g.appendChild(chartCard('Real GDP ($B, FY26 prices)', 'Output after inflation', lc('gdpReal', { yFmt: (v) => f0(v) })));
    g.appendChild(chartCard('Real GDP per person ($k)', 'Living standards', lc('gdpPC', { yFmt: (v) => v.toFixed(0) })));
    g.appendChild(chartCard('Unemployment (%)', 'Share of the labour force without work', lc('u')));
    g.appendChild(chartCard('Inflation (%) and cash rate', 'Scenario lines. Dashed is baseline inflation', (host) => {
      const s = [];
      if (state.showBase) s.push({ name: 'Baseline inflation', data: base.map((r) => r.cpi), color: 'var(--base)', dash: '5 4', width: 1.6 });
      s.push({ name: 'Inflation', data: res.map((r) => r.cpi), color: 'var(--s2)' });
      s.push({ name: 'Cash rate', data: res.map((r) => r.rcash), color: 'var(--s1)' });
      CH.lineChart(host, { xs: xs(), series: s, cursor: state.cursor, onPick: pick });
    }));
    g.appendChild(chartCard('Budget balance (% of GDP)', 'Revenue minus spending, all governments', lc('balPct', { zero: true })));
    g.appendChild(chartCard('Net government debt (% of GDP)', '', lc('debtPct', { zero: true, yFmt: (v) => v.toFixed(0) })));
    g.appendChild(chartCard('Poverty rate (%)', 'Below half of median income', lc('poverty')));
    g.appendChild(chartCard('Share of income to the top 10% (%)', 'Of disposable income', lc('topShare')));
    g.appendChild(chartCard('Care gap (0 to 100, lower is better)', 'How far services fall short of need', lc('careGap')));
    g.appendChild(chartCard('House price / income', 'Median house vs labour income per household', lc('priceToIncome')));
    g.appendChild(chartCard('Real wage index', 'Average pay after inflation (FY26 = 1)', lc('realWageIdx', { yFmt: (v) => v.toFixed(2) })));
    g.appendChild(chartCard('Current account (% of GDP)', 'Negative means borrowing from the world', lc('CAPct', { zero: true })));
    return h('div', null, summaryCallout(), g);
  }

  // ------------------------------------------------------------------- budget
  const LABELS = {
    pit: 'Personal income tax and Medicare levy', cgt: 'Capital gains tax', negGear: 'Negative gearing change', franking: 'Franking refund change', corp: 'Company tax', gst: 'GST', fuel: 'Fuel excise',
    tobacco: 'Tobacco excise', alcohol: 'Alcohol excise', customs: 'Customs and tariffs', superTax: 'Tax on super', fbt: 'Fringe benefits tax', payroll: 'Payroll tax', stamp: 'Stamp duty',
    land: 'Land tax and rates', gambling: 'Gambling taxes', motor: 'Motor vehicle taxes', insurance: 'Insurance taxes', otherTax: 'Other taxes', royalties: 'Mining royalties', rent: 'Resource rent tax',
    wealth: 'Wealth tax', inherit: 'Inheritance tax', carbon: 'Carbon price', nonTax: 'Non-tax revenue',
    pension: 'Age pension', ndis: 'NDIS', dsp: 'Disability support', family: 'Family and child payments', js: 'JobSeeker and youth', vets: 'Veterans', aged: 'Aged care',
    medicare: 'Medicare and PBS', hospitals: 'Public hospitals', otherHealth: 'Other health', dental: 'Dental', schools: 'Schools', higher: 'Universities', vet: 'TAFE and vocational',
    defence: 'Defence', order: 'Police, courts, prisons', transport: 'Transport and infrastructure', housing: 'Housing and community', env: 'Environment and energy', general: 'General services and aid',
    econ: 'Industry subsidies', interest: 'Interest on debt', ubi: 'Universal basic income', compensation: 'GST and carbon compensation', jobGuarantee: 'Job guarantee'
  };
  const REV_GROUPS = [
    ['Personal income tax', ['pit', 'cgt', 'negGear', 'franking'], '--s1'], ['Company tax', ['corp'], '--s2'], ['GST', ['gst'], '--s3'],
    ['Excise, customs, carbon', ['fuel', 'tobacco', 'alcohol', 'customs', 'carbon'], '--s4'], ['State taxes', ['payroll', 'stamp', 'land', 'gambling', 'motor', 'insurance', 'otherTax'], '--s5'],
    ['Resources', ['rent', 'royalties'], '--s6'], ['Super and FBT', ['superTax', 'fbt'], '--s7'], ['Wealth and estates', ['wealth', 'inherit'], '--s8'], ['Non-tax', ['nonTax'], '--s9']
  ];
  const SPEND_GROUPS = [
    ['Payments to people', ['pension', 'js', 'dsp', 'family', 'vets', 'ubi', 'compensation', 'jobGuarantee'], '--s1'], ['NDIS', ['ndis'], '--s2'], ['Health', ['medicare', 'hospitals', 'otherHealth', 'dental'], '--s3'],
    ['Aged care', ['aged'], '--s4'], ['Education', ['schools', 'higher', 'vet'], '--s5'], ['Defence', ['defence'], '--s6'], ['Police and justice', ['order'], '--s7'], ['Transport and infrastructure', ['transport'], '--s8'],
    ['Housing and community', ['housing'], '--s9'], ['Environment and energy', ['env'], '--s10'], ['General services', ['general'], '--s11'], ['Industry subsidies', ['econ'], '--s12'], ['Interest', ['interest'], '--base']
  ];
  function groupSeries(groups, lineKey) {
    return groups.map(([name, keys, col]) => ({ name, color: 'var(' + col + ')', data: res.map((r) => keys.reduce((s, k) => s + (r[lineKey][k] || 0), 0) / r.gdp * 100) }));
  }
  function viewBudget() {
    const g = h('div', { class: 'grid wide' });
    g.appendChild(chartCard('Where the money comes from (% of GDP)', 'Hover to read each layer, click to move the year', (host) => CH.stackChart(host, { xs: xs(), layers: groupSeries(REV_GROUPS, 'revLines'), cursor: state.cursor, onPick: pick, yFmt: (v) => v.toFixed(0) + '%', vFmt: (v) => v.toFixed(2) + '%' })));
    g.appendChild(chartCard('Where it goes (% of GDP)', '', (host) => CH.stackChart(host, { xs: xs(), layers: groupSeries(SPEND_GROUPS, 'spendLines'), cursor: state.cursor, onPick: pick, yFmt: (v) => v.toFixed(0) + '%', vFmt: (v) => v.toFixed(2) + '%' })));
    const r = res[state.cursor], b = base[state.cursor], r0 = res[0];
    const rows = [];
    function section(t) { rows.push(h('tr', { class: 'sec' }, h('td', { colspan: 6, text: t }))); }
    function line(k, srcKey) {
      const v = r[srcKey][k] || 0, bv = b[srcKey][k] || 0, v0 = r0[srcKey][k] || 0;
      if (Math.abs(v) < 0.005 && Math.abs(bv) < 0.005 && Math.abs(v0) < 0.005) return;
      const d = v - bv;
      rows.push(h('tr', null, h('td', { text: LABELS[k] || k }), h('td', { class: 'n', text: money(v0) }), h('td', { class: 'n', text: money(bv) }), h('td', { class: 'n', text: money(v) }),
        h('td', { class: 'n ' + (Math.abs(d) < 0.05 ? 'mut' : ''), text: (d >= 0 ? '+' : '') + money(d) }), h('td', { class: 'n', text: (v / r.gdp * 100).toFixed(2) + '%' })));
    }
    section('Revenue');
    REV_GROUPS.forEach(([n, keys]) => keys.forEach((k) => line(k, 'revLines')));
    rows.push(h('tr', { class: 'tot' }, h('td', { text: 'Total revenue' }), h('td', { class: 'n', text: money(r0.rev) }), h('td', { class: 'n', text: money(b.rev) }), h('td', { class: 'n', text: money(r.rev) }), h('td', { class: 'n', text: (r.rev - b.rev >= 0 ? '+' : '') + money(r.rev - b.rev) }), h('td', { class: 'n', text: r.revPct.toFixed(1) + '%' })));
    section('Spending');
    SPEND_GROUPS.forEach(([n, keys]) => keys.forEach((k) => line(k, 'spendLines')));
    rows.push(h('tr', { class: 'tot' }, h('td', { text: 'Total spending' }), h('td', { class: 'n', text: money(r0.spend) }), h('td', { class: 'n', text: money(b.spend) }), h('td', { class: 'n', text: money(r.spend) }), h('td', { class: 'n', text: (r.spend - b.spend >= 0 ? '+' : '') + money(r.spend - b.spend) }), h('td', { class: 'n', text: r.spendPct.toFixed(1) + '%' })));
    rows.push(h('tr', { class: 'tot' }, h('td', { text: 'Budget balance' }), h('td', { class: 'n', text: money(r0.bal) }), h('td', { class: 'n', text: money(b.bal) }), h('td', { class: 'n', text: money(r.bal) }), h('td', { class: 'n', text: (r.bal - b.bal >= 0 ? '+' : '') + money(r.bal - b.bal) }), h('td', { class: 'n', text: r.balPct.toFixed(1) + '%' })));
    const tbl = h('div', { class: 'card span2' }, h('h3', { text: 'Budget line by line, ' + FY(r.year) }), h('p', { class: 'sub', text: 'Nominal dollars. The last column is your scenario as a share of GDP.' }),
      h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Line' }), h('th', { text: FY(r0.year) + ' actual' }), h('th', { text: 'Baseline' }), h('th', { text: 'Scenario' }), h('th', { text: 'Difference' }), h('th', { text: '% GDP' }))), h('tbody', null, rows))));
    g.appendChild(tbl);
    return g;
  }

  // ------------------------------------------------------------------- people
  function viewPeople() {
    const r = res[state.cursor], b = base[state.cursor], r0 = res[0];
    const g = h('div', { class: 'grid wide' });
    const real = (o, arr) => arr.map((v) => v / o.priceLevel);
    g.appendChild(chartCard('Disposable income per person, ' + FY(r.year) + ' ($k, FY26 prices)', 'Deciles 1 to 9, next 9%, top 1%. After tax, with payments received.', (host) => CH.barChart(host, {
      cats: C.groups, yFmt: (v) => v.toFixed(0),
      series: [{ name: 'Base year', color: 'var(--s6)', data: real(r0, r0.perGroup) }, { name: 'Baseline', color: 'var(--base)', data: real(b, b.perGroup) }, { name: 'Scenario', color: 'var(--s1)', data: real(r, r.perGroup) }] })));
    const perP = (o, arr) => arr.map((v, i) => v / (o.pop * C.gShare[i]) / o.priceLevel);
    g.appendChild(chartCard('Income tax paid per person ($k)', 'Includes Medicare levy', (host) => CH.barChart(host, {
      cats: C.groups, yFmt: (v) => v.toFixed(0), series: [{ name: 'Baseline', color: 'var(--base)', data: perP(b, b.gPit) }, { name: 'Scenario', color: 'var(--s2)', data: perP(r, r.gPit) }] })));
    g.appendChild(chartCard('Government payments received per person ($k)', 'Pensions, JobSeeker, family payments, UBI', (host) => CH.barChart(host, {
      cats: C.groups, yFmt: (v) => v.toFixed(1), series: [{ name: 'Baseline', color: 'var(--base)', data: perP(b, b.gTrans) }, { name: 'Scenario', color: 'var(--s3)', data: perP(r, r.gTrans) }] })));
    g.appendChild(chartCard('Population by age (millions), ' + FY(r.year), 'Ageing is the main structural pressure on the budget', (host) => CH.barChart(host, {
      cats: C.cohorts, yFmt: (v) => v.toFixed(1), series: [{ name: 'Base year', color: 'var(--s6)', data: r0.popC }, { name: 'Baseline', color: 'var(--base)', data: b.popC }, { name: 'Scenario', color: 'var(--s5)', data: r.popC }] })));
    g.appendChild(chartCard('Gini coefficient', 'Higher means more unequal', lc('gini')));
    g.appendChild(chartCard('Pension and JobSeeker as % of the poverty line', 'Single person, annual payment', (host) => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick,
      series: [].concat(state.showBase ? [{ name: 'Baseline JobSeeker', data: base.map((x) => x.jsAdequacy), color: 'var(--base)', dash: '5 4', width: 1.6 }, { name: 'Baseline pension', data: base.map((x) => x.pensionAdequacy), color: 'var(--base)', dash: '2 3', width: 1.6 }] : [],
        [{ name: 'JobSeeker', data: res.map((x) => x.jsAdequacy), color: 'var(--s2)' }, { name: 'Age pension', data: res.map((x) => x.pensionAdequacy), color: 'var(--s1)' }]) })));
    g.appendChild(chartCard('Workers and the people they support', 'Employed people, millions, and the dependency ratio', (host) => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick,
      series: [{ name: 'Employed (M)', data: res.map((x) => x.emp), color: 'var(--s1)' }, { name: 'Dependants per 100 of working age', data: res.map((x) => x.dependency / 4), color: 'var(--s2)', fmt: (v) => (v * 4).toFixed(0) }] })));
    const facts = h('div', { class: 'card span2' }, h('h3', { text: 'Facts at ' + FY(r.year) }), h('div', { class: 'stat3', style: 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr))' },
      [['Poverty line', '$' + r.povLine.toFixed(1) + 'k'], ['Median income', '$' + r.medianInc.toFixed(1) + 'k'], ['Top 1% share', r.top1Share.toFixed(1) + '%'], ['Bottom 20% share', r.bottom20Share.toFixed(1) + '%'],
        ['Rent / income, lower-middle', r.rentBurden.toFixed(0) + '%'], ['Unemployed', r.unemployed.toFixed(2) + 'M'], ['Age pensioners', r.pensioners.toFixed(2) + 'M'], ['Life expectancy', r.lifeExp.toFixed(1) + ' yrs'],
        ['Population', r.pop.toFixed(1) + 'M'], ['Over 65', r.old.toFixed(1) + '%']].map(([l, v]) => h('div', null, h('b', { text: v }), h('span', { text: l })))));
    g.appendChild(facts);
    return g;
  }

  // ----------------------------------------------------------------- services
  const SVC_NAMES = { health: 'Health (Medicare, hospitals)', aged: 'Aged care', dental: 'Dental', edu: 'Education', ndis: 'Disability (NDIS)' };
  function diagnose(s) {
    if (s.delivered >= 0.985 && s.funded <= 1.02) return ['good', 'Meeting need at today\'s service level.'];
    if (s.delivered >= s.funded * 0.97 && s.funded > 1.02) return ['good', 'Extra funding is being turned into extra service.'];
    if (s.funded > s.cap * 1.02) return ['bad', 'Workforce is the limit. Extra money mostly raises prices, not services.'];
    if (s.delivered < 0.97 && s.funded <= 1.02) return ['amber', 'Funding has not kept up with growing need. Services are rationed.'];
    return ['amber', 'Mixed: funding and workforce are both close to their limits.'];
  }
  function viewServices() {
    const r = res[state.cursor], b = base[state.cursor];
    const wrap = h('div', null);
    wrap.appendChild(h('div', { class: 'callout amber', html: '<b>Money is not care.</b> Each service has a funded level (what governments pay for) and a staff capacity (doctors, nurses, dentists, carers, teachers). Delivered service is whichever binds. Spending above capacity mostly bids up prices. Tick <i>GOD: unlimited workforce</i> in the levers to see what pure money would buy.' }));
    const g = h('div', { class: 'svc-grid' });
    Object.keys(SVC_NAMES).forEach((s) => {
      const o = r.svc[s], ob = b.svc[s];
      const [cls, txt] = diagnose(o);
      const card = h('div', { class: 'card' }, h('h3', { text: SVC_NAMES[s] }), h('span', { class: 'pill ' + cls, text: txt }),
        h('div', { class: 'stat3' }, h('div', null, h('b', { text: o.funded.toFixed(2) + 'x' }), h('span', { text: 'Funded' })), h('div', null, h('b', { text: (s === 'ndis' ? '-' : o.cap.toFixed(2) + 'x') }), h('span', { text: 'Staff capacity' })),
          h('div', null, h('b', { text: (o.delivered * 100).toFixed(0) + '%' }), h('span', { text: 'Delivered' }))),
        h('p', { class: 'sub', text: 'Everything is relative to today\'s service level adjusted for how many people need it (' + o.need.toFixed(2) + 'x the need of FY26). Baseline delivered: ' + (ob.delivered * 100).toFixed(0) + '%.' }));
      const host = h('div', { class: 'chart-host' }); card.appendChild(host);
      pending.push(() => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick, height: 150, yFmt: (v) => v.toFixed(2),
        series: [].concat(state.showBase ? [{ name: 'Baseline delivered', data: base.map((x) => x.svc[s].delivered), color: 'var(--base)', dash: '5 4', width: 1.6 }] : [],
          [{ name: 'Delivered', data: res.map((x) => x.svc[s].delivered), color: 'var(--s1)' }, { name: 'Funded', data: res.map((x) => x.svc[s].funded), color: 'var(--s2)', width: 1.4 }].concat(s === 'ndis' ? [] : [{ name: 'Staff capacity', data: res.map((x) => x.svc[s].cap), color: 'var(--s3)', width: 1.4 }])) }));
      g.appendChild(card);
    });
    g.appendChild(chartCard('Care gap composite (0 to 100)', 'Weighted shortfall across services and income support', lc('careGap')));
    g.appendChild(chartCard('Share of dental costs paid publicly (%)', 'Zero in Medicare today', lc('dentalCover')));
    g.appendChild(chartCard('Life expectancy (years)', 'Health delivery feeds mortality', lc('lifeExp', { yFmt: (v) => v.toFixed(1) })));
    g.appendChild(chartCard('Human capital index', 'Education delivery builds skills that lift productivity', lc('humanCapital', { yFmt: (v) => v.toFixed(3) })));
    wrap.appendChild(g);
    return wrap;
  }

  // ------------------------------------------------------------------ housing
  function viewHousing() {
    const g = h('div', { class: 'grid' });
    g.appendChild(chartCard('Median house price ($k, nominal)', '', lc('house', { yFmt: (v) => f0(v) })));
    g.appendChild(chartCard('Average rent ($k a year, nominal)', '', lc('rentK')));
    g.appendChild(chartCard('House price / labour income per household', 'Affordability', lc('priceToIncome')));
    g.appendChild(chartCard('Dwellings completed (thousands)', 'Versus the thousand households formed each year', (host) => {
      const need = (arr) => arr.map((x, i) => (i ? (x.households - arr[i - 1].households) * 1000 + 11 : NaN));
      const s = [].concat(state.showBase ? [{ name: 'Baseline completions', data: base.map((x) => x.completions), color: 'var(--base)', dash: '5 4', width: 1.6 }] : [],
        [{ name: 'Completions', data: res.map((x) => x.completions), color: 'var(--s1)' }, { name: 'Needed (new households + demolitions)', data: need(res), color: 'var(--s2)', width: 1.4 }]);
      CH.lineChart(host, { xs: xs(), series: s, cursor: state.cursor, onPick: pick, yFmt: (v) => v.toFixed(0) });
    }));
    g.appendChild(chartCard('Housing tightness (1 = balanced)', 'Households relative to dwellings, base year = 1', lc('tight', { yFmt: (v) => v.toFixed(3) })));
    g.appendChild(chartCard('Mortgage rate (%) and stress', 'Share of mortgagors under strain', (host) => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick,
      series: [{ name: 'Mortgage rate %', data: res.map((x) => x.rm), color: 'var(--s2)' }, { name: 'Mortgage stress % (scaled /5)', data: res.map((x) => x.mortgageStress / 5), color: 'var(--s4)', fmt: (v) => (v * 5).toFixed(0) + '%' }] })));
    g.appendChild(chartCard('House price growth (% a year)', '', lc('hpgr', { zero: true })));
    g.appendChild(chartCard('Home ownership rate (%)', '', lc('homeown')));
    g.appendChild(chartCard('Household debt service (% of disposable income)', 'Interest on household debt', (host) => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick,
      series: pair('dsr') })));
    return g;
  }

  // ------------------------------------------------------------------- wealth
  function viewWealth() {
    const r = res[state.cursor], b = base[state.cursor];
    const wrap = h('div', null);
    wrap.appendChild(h('div', { class: 'callout', html: '<b>How big is the prize?</b> In FY' + String(r.year).slice(-2) + ' the model has about <b>' + f0(r.billionaires) + ' billionaires</b>. Wealth above a threshold follows a Pareto tail calibrated to roughly 60,000 people above $10M. Taxing a thin slice raises little. Taxing a wide slice raises more but runs into avoidance and admin limits. Move the wealth-tax levers on the left.' }));
    const g = h('div', { class: 'grid' });
    g.appendChild(chartCard('Wealth tax revenue ($B a year)', '', lc('wealth', { yFmt: (v) => v.toFixed(1) })));
    g.appendChild(chartCard('Taxable wealth above threshold ($B)', 'Shrinks if avoidance and capital flight bite', lc('wealthTaxBase', { yFmt: (v) => f0(v) })));
    g.appendChild(chartCard('Revenue by threshold at today\'s rate (' + FY(r.year) + ')', 'What the same rate raises if you move the threshold', (host) => {
      const th = [1e6, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6, 250e6, 500e6, 1e9];
      const rate = Math.max(val('w_rate'), 0.01);
      const avoid = 1 - Math.exp(-val('w_avoid') * rate * 100);
      const scale = r.wealthTaxBase > 0 && val('w_rate') > 0 ? r.wealthTaxBase / POON.wealthExcessB(val('w_thresh')) : 1;
      const data = th.map((t) => rate * POON.wealthExcessB(t) * scale * (1 - avoid) * val('w_admin'));
      CH.lineChart(host, { xs: th.map((t) => (t >= 1e9 ? '$1B' : '$' + t / 1e6 + 'M')), series: [{ name: 'At ' + (rate * 100).toFixed(1) + '%', data, color: 'var(--s1)' }], height: 190, yFmt: (v) => v.toFixed(0), xLabel: (x) => x });
    }));
    g.appendChild(chartCard('Company tax leakage (% of base)', 'Profit shifting and avoidance. Falls with enforcement and a global minimum tax', lc('leak')));
    g.appendChild(chartCard('Company tax paid ($B)', '', lc('corp', { yFmt: (v) => f0(v) })));
    g.appendChild(chartCard('Estimated tax gap from leakage ($B)', 'Company tax lost to shifting at the current setting', lc('taxGapB', { yFmt: (v) => f0(v) })));
    g.appendChild(chartCard('Super assets (% of GDP)', '', lc('superPct', { yFmt: (v) => v.toFixed(0) })));
    g.appendChild(chartCard('Wage share vs profit share (% of GDP)', 'Compensation of employees and gross operating surplus', (host) => CH.lineChart(host, { xs: xs(), cursor: state.cursor, onPick: pick,
      series: [{ name: 'Wage share', data: res.map((x) => x.wageShare), color: 'var(--s1)' }, { name: 'Profit share', data: res.map((x) => x.profitShare), color: 'var(--s2)' }] })));
    wrap.appendChild(g);
    return wrap;
  }

  // ---------------------------------------------------------------------- lab
  function runScenario(patch) {
    const P = Object.assign({}, state.P, patch, { _pins: state.pins });
    return POON.scenario(P, state.events).rows;
  }
  function summarise(rows) {
    const r10 = rows[10], c10 = res[10];
    let avg = 0; for (let i = 1; i <= 10; i++) avg += rows[i].balPct - res[i].balPct; avg /= 10;
    return { avg, d10: rows[10].bal - res[10].bal, gdp: (r10.gdpReal / c10.gdpReal - 1) * 100, pov: r10.poverty - c10.poverty, gap: r10.careGap - c10.careGap, debt: rows[30].debtPct - res[30].debtPct };
  }
  function viewLab() {
    const wrap = h('div', null);
    wrap.appendChild(h('div', { class: 'callout', html: '<b>One reform at a time, on top of your current scenario.</b> Each row re-runs the whole 30 years with just that change. Positive budget numbers help the budget. Tick several and press <i>Combine</i> to see them together, or <i>Apply</i> to load them into your levers.' }));
    const holder = h('div', { class: 'card' }, h('div', { class: 'tblwrap', id: 'labTable' }, 'Running reforms...'));
    const btns = h('div', { class: 'row2' },
      h('button', { class: 'btn primary', type: 'button', id: 'labCombine', text: 'Combine ticked' }),
      h('button', { class: 'btn', type: 'button', id: 'labApply', text: 'Apply ticked to my levers' }),
      h('span', { class: 'mut', id: 'labCombined' }));
    wrap.appendChild(holder); wrap.appendChild(btns);
    setTimeout(() => {
      if (state.tab !== 'lab' || !$('#labTable')) return;
      const key = JSON.stringify([state.P, state.events, state.pins]);
      if (!labMemo || labMemo.key !== key) {
        labMemo = { key, rows: REFORMS.map((rf) => Object.assign({ rf }, summarise(runScenario(rf.p)))) };
      }
      const tb = h('tbody');
      const sorted = labMemo.rows.slice().sort((a, b) => b.avg - a.avg);
      sorted.forEach((x) => {
        const cls = (v, dir) => (Math.abs(v) < 0.005 ? 'mut' : v * dir > 0 ? 'pos' : 'neg');
        tb.appendChild(h('tr', null, h('td', null, h('label', null, h('input', { type: 'checkbox', 'data-rf': x.rf.id }), ' ', x.rf.name), ' ', h('span', { class: 'pill ' + (x.rf.kind === 'raise' ? 'good' : 'amber'), text: x.rf.kind === 'raise' ? 'revenue' : 'spending' })),
          h('td', { class: 'n ' + cls(x.avg, 1), text: (x.avg >= 0 ? '+' : '') + x.avg.toFixed(2) + '%' }), h('td', { class: 'n ' + cls(x.d10, 1), text: (x.d10 >= 0 ? '+' : '') + money(x.d10) }),
          h('td', { class: 'n ' + cls(x.gdp, 1), text: (x.gdp >= 0 ? '+' : '') + x.gdp.toFixed(2) + '%' }), h('td', { class: 'n ' + cls(x.pov, -1), text: (x.pov >= 0 ? '+' : '') + x.pov.toFixed(2) }),
          h('td', { class: 'n ' + cls(x.gap, -1), text: (x.gap >= 0 ? '+' : '') + x.gap.toFixed(1) }), h('td', { class: 'n ' + cls(x.debt, -1), text: (x.debt >= 0 ? '+' : '') + x.debt.toFixed(0) })));
      });
      const t = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Reform' }), h('th', { text: 'Budget, avg 10 yrs (% GDP)' }), h('th', { text: 'Budget in FY36' }), h('th', { text: 'GDP FY36' }), h('th', { text: 'Poverty FY36 (pp)' }), h('th', { text: 'Care gap FY36' }), h('th', { text: 'Debt FY56 (pts GDP)' }))), tb);
      const lt = $('#labTable'); lt.textContent = ''; lt.appendChild(t);
      const ticked = () => Array.prototype.slice.call(document.querySelectorAll('input[data-rf]:checked')).map((c) => REFORMS.find((r) => r.id === c.dataset.rf));
      $('#labCombine').onclick = () => {
        const sel = ticked(); if (!sel.length) { $('#labCombined').textContent = 'Tick at least one reform.'; return; }
        const patch = {}; sel.forEach((s) => Object.assign(patch, s.p));
        const s = summarise(runScenario(patch));
        $('#labCombined').innerHTML = '<b>Combined:</b> budget ' + (s.avg >= 0 ? '+' : '') + s.avg.toFixed(2) + '% GDP a year (avg 10 yrs), ' + (s.d10 >= 0 ? '+' : '') + money(s.d10) + ' in FY36, GDP ' + (s.gdp >= 0 ? '+' : '') + s.gdp.toFixed(2) + '%, poverty ' + (s.pov >= 0 ? '+' : '') + s.pov.toFixed(2) + ' pp, care gap ' + (s.gap >= 0 ? '+' : '') + s.gap.toFixed(1) + ', debt in FY56 ' + (s.debt >= 0 ? '+' : '') + s.debt.toFixed(0) + ' pts GDP.';
      };
      $('#labApply').onclick = () => {
        const sel = ticked(); sel.forEach((s) => Object.keys(s.p).forEach((k) => setLever(k, s.p[k], true))); refresh();
      };
    }, 30);
    return wrap;
  }

  // -------------------------------------------------------------------- debug
  const EVENT_KINDS = { oreCrash: 'Iron ore crash', oreBoom: 'Commodity boom', pandemic: 'Pandemic', financialCrisis: 'Financial crisis', oilShock: 'Oil shock', drought: 'Drought', housingBoom: 'Housing boom', techBoom: 'Tech boom', techBust: 'Tech bust', war: 'War and defence surge', refugees: 'Sudden arrivals (0.4M)' };
  const PIN_VARS = { rcash: ['Cash rate (%)', 100], pi: ['Inflation (%)', 100], w: ['Wage growth (%)', 100], tot: ['Terms of trade (index)', 1], fx: ['Exchange rate (index)', 1], hp: ['House price growth (%)', 100] };
  const PATCH_TARGETS = ['netDebt', 'nfl', 'K', 'A', 'HP', 'hhDebt', 'superA', 'P', 'pe', 'rcash', 'cap.health', 'cap.aged', 'cap.dental', 'cap.edu', 'pop.0', 'pop.1', 'pop.2', 'pop.3', 'pop.4', 'pop.5', 'discScale', 'wavg'];
  const CALIB_KEYS = ['Y0', 'cpi0', 'rcash0', 'netDebt0', 'nfl0', 'hhDebt0', 'alpha', 'okun', 'nairu0', 'gA', 'delta', 'K2Y', 'ghh', 'payout', 'sigma', 'taxUnits', 'worldInfl', 'lifeExp0'];
  function viewDebug() {
    const wrap = h('div', null);
    const grid = h('div', { class: 'grid wide' });
    // integrity
    const maxId = Math.max.apply(null, res.map((x) => Math.abs(x.identity)));
    const nf = res.reduce((s, x) => s + (x.nonFinite || 0), 0);
    grid.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Accounting integrity' }),
      h('p', { class: 'sub', text: 'Households, companies, government and the rest of the world must net to zero every year. The residual below is the leftover. Anything above $0.5B means a break.' }),
      h('div', { class: 'stat3' }, h('div', null, h('b', { class: maxId < 0.5 ? 'pos' : 'neg', text: '$' + maxId.toFixed(4) + 'B' }), h('span', { text: 'Largest residual' })), h('div', null, h('b', { class: nf ? 'neg' : 'pos', text: String(nf) }), h('span', { text: 'Non-finite values' })),
        h('div', null, h('b', { text: f1(resObj ? res[state.cursor].dShare * 100 : 0, 2) + '%' }), h('span', { text: 'Baseline add-factor' }))),
      chartHost((host) => CH.lineChart(host, { xs: xs(), series: [{ name: 'Household', data: res.map((x) => x.sectorHH), color: 'var(--s1)' }, { name: 'Companies', data: res.map((x) => x.sectorCorp), color: 'var(--s2)' }, { name: 'Government', data: res.map((x) => x.sectorGov), color: 'var(--s4)' }, { name: 'Rest of world', data: res.map((x) => x.sectorRow), color: 'var(--s3)' }], zero: true, cursor: state.cursor, onPick: pick, height: 170, yFmt: (v) => v.toFixed(1) + '%' }))));
    // events
    const evList = h('div');
    state.events.forEach((e, i) => evList.appendChild(h('div', { class: 'row2' }, h('span', { class: 'pill amber', text: FY(e.year) }), h('span', { text: e.kind === 'patch' ? 'Set ' + e.target + ' ' + (e.op || 'set') + ' ' + e.value : (EVENT_KINDS[e.kind] || e.kind) + ' x' + e.mag }), h('button', { class: 'btn small warn', type: 'button', text: 'remove', onclick: () => { state.events.splice(i, 1); refresh(); } }))));
    if (!state.events.length) evList.appendChild(h('p', { class: 'sub', text: 'No events scheduled.' }));
    const kindSel = h('select', { id: 'evKind' }, Object.keys(EVENT_KINDS).map((k) => h('option', { value: k, text: EVENT_KINDS[k] })));
    grid.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Events' }), h('p', { class: 'sub', text: 'Drop a shock into any year.' }), evList,
      h('div', { class: 'row2' }, kindSel, h('input', { type: 'number', id: 'evYear', value: res[state.cursor].year, min: 2027, max: 2056, style: 'width:80px' }), h('input', { type: 'number', id: 'evMag', value: 1, step: 0.25, min: 0.25, max: 4, style: 'width:70px', title: 'Magnitude' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Add', onclick: () => { state.events.push({ year: +$('#evYear').value, kind: kindSel.value, mag: +$('#evMag').value }); refresh(); } }))));
    // pins
    const pinList = h('div');
    state.pins.forEach((p, i) => pinList.appendChild(h('div', { class: 'row2' }, h('span', { class: 'pill amber', text: PIN_VARS[p.name][0] }), h('span', { text: '= ' + (p.value * PIN_VARS[p.name][1]).toFixed(2).replace(/\.?0+$/, '') + ' from ' + FY(p.from) + (p.to ? ' to ' + FY(p.to) : ' onwards') }), h('button', { class: 'btn small warn', type: 'button', text: 'unpin', onclick: () => { state.pins.splice(i, 1); refresh(); } }))));
    if (!state.pins.length) pinList.appendChild(h('p', { class: 'sub', text: 'Nothing pinned.' }));
    const pinSel = h('select', { id: 'pinVar' }, Object.keys(PIN_VARS).map((k) => h('option', { value: k, text: PIN_VARS[k][0] })));
    grid.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Pin a variable' }), h('p', { class: 'sub', text: 'Override what the model would compute. Dangerous and fun: pin the cash rate at 0 or the dollar at 0.5.' }), pinList,
      h('div', { class: 'row2' }, pinSel, h('input', { type: 'number', id: 'pinVal', value: 0, step: 0.1, style: 'width:80px' }), h('input', { type: 'number', id: 'pinFrom', value: res[state.cursor].year, min: 2027, max: 2056, style: 'width:80px', title: 'From year' }), h('input', { type: 'number', id: 'pinTo', placeholder: 'to', min: 2027, max: 2056, style: 'width:70px', title: 'To year (optional)' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Pin', onclick: () => { const nm = pinSel.value; state.pins.push({ name: nm, value: +$('#pinVal').value / PIN_VARS[nm][1], from: +$('#pinFrom').value, to: $('#pinTo').value ? +$('#pinTo').value : 0 }); refresh(); } }))));
    // state patch
    const tgtSel = h('select', { id: 'ptTarget' }, PATCH_TARGETS.map((t) => h('option', { value: t, text: t })));
    const opSel = h('select', { id: 'ptOp' }, ['set', 'add', 'mul'].map((t) => h('option', { value: t, text: t })));
    grid.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Edit the state of the world' }), h('p', { class: 'sub', text: 'At the start of a chosen year, set, add to or multiply a stock: wipe the debt, halve the capital stock, delete 1M over-80s. Units are the model\'s own ($B, millions, index).' }),
      h('div', { class: 'row2' }, tgtSel, opSel, h('input', { type: 'number', id: 'ptVal', value: 0, step: 'any', style: 'width:110px' }), h('input', { type: 'number', id: 'ptYear', value: res[state.cursor].year, min: 2027, max: 2056, style: 'width:80px' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Apply', onclick: () => { state.events.push({ year: +$('#ptYear').value, kind: 'patch', target: tgtSel.value, op: opSel.value, value: +$('#ptVal').value }); refresh(); } }))));
    // calibration
    const cal = h('div', { class: 'row2', style: 'align-items:flex-end' });
    CALIB_KEYS.forEach((k) => {
      cal.appendChild(h('div', { class: 'field', style: 'width:120px' }, h('span', { text: k }), h('input', { type: 'number', step: 'any', value: C[k], title: 'Factory: ' + ORIG_CALIB[k], onchange: (e) => { state.calib[k] = +e.target.value; if (state.calib[k] === ORIG_CALIB[k]) delete state.calib[k]; applyCalib(); refresh(); } })));
    });
    grid.appendChild(h('div', { class: 'card span2' }, h('h3', { text: 'Base-year facts (calibration)' }), h('p', { class: 'sub', text: 'Change what the economy looked like in FY26 and the model recalibrates itself. Revenue and spending lines are editable through the console: calib rev0.pit 360.' }), cal,
      h('div', { class: 'row2' }, h('button', { class: 'btn warn', type: 'button', text: 'Restore factory calibration', onclick: () => { state.calib = {}; applyCalib(); refresh(); } }))));
    // inspector
    const r = res[state.cursor], b = base[state.cursor];
    const keys = Object.keys(r).filter((k) => isNum(r[k]) && isNum(b[k]));
    const tbody = h('tbody');
    const draw = (q) => {
      tbody.textContent = '';
      keys.filter((k) => !q || k.toLowerCase().indexOf(q.toLowerCase()) >= 0).forEach((k) => {
        const d = r[k] - b[k];
        tbody.appendChild(h('tr', null, h('td', { text: k }), h('td', { class: 'n', text: +b[k].toFixed(4) }), h('td', { class: 'n', text: +r[k].toFixed(4) }), h('td', { class: 'n ' + (Math.abs(d) < 1e-9 ? 'mut' : ''), text: (d >= 0 ? '+' : '') + +d.toFixed(4) })));
      });
    };
    draw('');
    grid.appendChild(h('div', { class: 'card span2' }, h('h3', { text: 'State inspector, ' + FY(r.year) }), h('p', { class: 'sub', text: 'Every output the model produces for this year.' }),
      h('input', { type: 'search', placeholder: 'filter variables', oninput: (e) => draw(e.target.value), style: 'max-width:280px;margin-bottom:8px;width:100%;padding:6px 8px;background:var(--surface-2);border:1px solid var(--border-strong);border-radius:6px' }),
      h('div', { class: 'tblwrap', style: 'max-height:340px;overflow:auto' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', { text: 'Variable' }), h('th', { text: 'Baseline' }), h('th', { text: 'Scenario' }), h('th', { text: 'Diff' }))), tbody))));
    // share
    const ta = h('textarea', { rows: 4, style: 'width:100%;font:12px var(--mono)', placeholder: 'Paste exported JSON here to load it' });
    grid.appendChild(h('div', { class: 'card span2' }, h('h3', { text: 'Save, share, load' }),
      h('div', { class: 'row2' },
        h('button', { class: 'btn', type: 'button', text: 'Show current as JSON', onclick: () => { ta.value = JSON.stringify({ P: state.P, events: state.events, pins: state.pins, calib: state.calib }); ta.select(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Copy link', onclick: () => { const u = location.origin + location.pathname + '#s=' + btoa(encodeURIComponent(JSON.stringify({ P: state.P, events: state.events, pins: state.pins, calib: state.calib }))); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => { ta.value = 'Link copied.'; }, () => { ta.value = u; ta.select(); }); } }),
        h('button', { class: 'btn primary', type: 'button', text: 'Load from box', onclick: () => { try { const o = JSON.parse(ta.value); state.P = o.P || {}; state.events = o.events || []; state.pins = o.pins || []; state.calib = o.calib || {}; applyCalib(); syncAllLevers(); refresh(); } catch (e) { ta.value = 'Could not read that: ' + e.message; } } })),
      ta));
    wrap.appendChild(grid);
    wrap.appendChild(consoleCard());
    return wrap;
  }
  function chartHost(draw) { const host = h('div', { class: 'chart-host' }); pending.push(() => draw(host)); return host; }

  // ------------------------------------------------------------------ console
  const consoleLines = [{ t: 'Poonomics console. Type help.', c: 'inf' }];
  function consoleCard() {
    const out = h('div', { class: 'out', id: 'conOut' });
    const inp = h('input', { type: 'text', id: 'conIn', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Console command' });
    function paint() { out.textContent = ''; consoleLines.slice(-300).forEach((l) => out.appendChild(h('div', { class: l.c || '', text: l.t }))); out.scrollTop = out.scrollHeight; }
    const hist = []; let hi = 0;
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const line = inp.value.trim(); if (!line) return; hist.push(line); hi = hist.length; consoleLines.push({ t: '> ' + line, c: '' }); try { runCommand(line); } catch (err) { consoleLines.push({ t: String(err.message || err), c: 'err' }); } inp.value = ''; paint(); }
      else if (e.key === 'ArrowUp' && hi > 0) { hi--; inp.value = hist[hi]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ''; e.preventDefault(); }
    });
    pending.push(paint);
    return h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', { text: 'Console' }), h('p', { class: 'sub', text: 'Type help. Examples: set w_rate 2%  |  event pandemic 2031  |  sweep t_corp 0.25,0.3,0.4 debtPct  |  calib rev0.pit 360' }),
      h('div', { class: 'term' }, out, h('div', { class: 'in' }, h('span', { text: '>' }), inp)));
  }
  function parseVal(l, s) {
    s = String(s).toLowerCase();
    if (s === 'on' || s === 'true' || s === 'yes') return 1;
    if (s === 'off' || s === 'false' || s === 'no') return 0;
    if (s.slice(-1) === '%') return parseFloat(s) / 100;
    if (s.slice(-1) === 'm' && /^[\d.]+m$/.test(s)) return parseFloat(s) * 1e6;
    if (s.slice(-1) === 'b' && /^[\d.]+b$/.test(s)) return parseFloat(s) * 1e9;
    if (s.slice(-1) === 'k' && /^[\d.]+k$/.test(s)) return parseFloat(s) * 1e3;
    const v = parseFloat(s);
    if (isNaN(v)) throw new Error('Not a number: ' + s);
    return v;
  }
  function say(t, c) { consoleLines.push({ t, c: c || '' }); }
  function runCommand(line) {
    const a = line.split(/\s+/); const cmd = a[0].toLowerCase();
    if (cmd === 'help') {
      ['list [text]                  levers matching text', 'get <lever|output> [year]    read a lever or a model output (all years if no year)', 'set <lever> <value>          e.g. set t_corp 25%  /  set w_thresh 1b  /  set t_negGear off',
        'reset [lever]                reset one lever or everything', 'event <kind> <year> [mag]    kinds: ' + Object.keys(EVENT_KINDS).join(', '), 'pin <rcash|pi|w|tot|fx|hp> <value> <from> [to>   values in % except tot and fx',
        'patch <path> <value> <year> [set|add|mul]   change a stock, e.g. patch netDebt 0 2035', 'sweep <lever> <v1,v2,..> [output] [year]   run several values and compare', 'calib <path> <value>         change a base-year fact, e.g. calib rev0.pit 360',
        'year <2027-2056>             move the year cursor', 'preset <id>                  ' + PRESETS.map((p) => p.id).join(', '), 'clear                        clear this screen'].forEach((t) => say(t, 'inf'));
    } else if (cmd === 'clear') { consoleLines.length = 0; }
    else if (cmd === 'list') { const q = (a[1] || '').toLowerCase(); LV.filter((l) => !q || (l.id + l.label).toLowerCase().indexOf(q) >= 0).forEach((l) => say(l.id.padEnd(16) + ' ' + l.label + '  = ' + fmtLever(l, val(l.id)))); }
    else if (cmd === 'get') {
      const k = a[1]; if (!k) throw new Error('get <lever|output>');
      if (levById[k]) { say(k + ' = ' + fmtLever(levById[k], val(k)) + '  (default ' + fmtLever(levById[k], defaults[k]) + ')'); return; }
      if (res[0][k] === undefined || !isNum(res[0][k])) throw new Error('Unknown: ' + k);
      if (a[2]) { const i = +a[2] - C.baseYear; say(k + ' ' + a[2] + ': scenario ' + res[i][k].toFixed(3) + ', baseline ' + base[i][k].toFixed(3)); }
      else say(k + ': ' + res.filter((_, i) => i % 5 === 0).map((r) => FY(r.year) + '=' + r[k].toFixed(2)).join('  '));
    } else if (cmd === 'set') {
      const l = levById[a[1]]; if (!l) throw new Error('No lever ' + a[1] + '. Try list.'); const v = parseVal(l, a[2]);
      setLever(l.id, v, true); say(l.id + ' = ' + fmtLever(l, val(l.id)), 'inf'); refresh();
    } else if (cmd === 'reset') {
      if (a[1]) { const l = levById[a[1]]; if (!l) throw new Error('No lever ' + a[1]); setLever(a[1], defaults[a[1]], true); } else { state.P = {}; state.events = []; state.pins = []; syncAllLevers(); }
      say('reset', 'inf'); refresh();
    } else if (cmd === 'event') {
      if (!EVENT_KINDS[a[1]]) throw new Error('Unknown event kind. Kinds: ' + Object.keys(EVENT_KINDS).join(', ')); state.events.push({ year: +a[2], kind: a[1], mag: a[3] ? +a[3] : 1 }); say('scheduled ' + a[1] + ' in ' + a[2], 'inf'); refresh();
    } else if (cmd === 'pin') {
      const nm = a[1]; if (!PIN_VARS[nm]) throw new Error('Pin one of: ' + Object.keys(PIN_VARS).join(', ')); state.pins.push({ name: nm, value: +a[2] / PIN_VARS[nm][1], from: +a[3], to: a[4] ? +a[4] : 0 }); say('pinned ' + nm, 'inf'); refresh();
    } else if (cmd === 'patch') {
      state.events.push({ year: +a[3], kind: 'patch', target: a[1], op: a[4] || 'set', value: +a[2] }); say('patch scheduled for ' + a[3], 'inf'); refresh();
    } else if (cmd === 'calib') {
      const v = parseFloat(a[2]); if (isNaN(v)) throw new Error('calib <path> <number>'); setPath(clone(C), a[1], v); state.calib[a[1]] = v; applyCalib(); say(a[1] + ' = ' + v + ' (recalibrated)', 'inf'); refresh();
    } else if (cmd === 'year') { state.cursor = Math.min(HORIZON, Math.max(0, +a[1] - C.baseYear)); refresh(); }
    else if (cmd === 'preset') { applyPreset(a[1]); say('loaded ' + a[1], 'inf'); }
    else if (cmd === 'sweep') {
      const l = levById[a[1]]; if (!l) throw new Error('sweep <lever> <v1,v2,..> [output] [year]');
      const outK = a[3] || 'gdpReal', yr = (a[4] ? +a[4] : 2036) - C.baseYear;
      a[2].split(',').forEach((s) => { const v = parseVal(l, s); const rows = runScenario({ [l.id]: v }); say(l.id + '=' + fmtLever(l, v) + '  ->  ' + outK + ' ' + FY(rows[yr].year) + ' = ' + rows[yr][outK].toFixed(3) + '   (balance ' + rows[yr].balPct.toFixed(2) + '% GDP, debt ' + rows[yr].debtPct.toFixed(0) + '%, unemployment ' + rows[yr].u.toFixed(1) + '%)'); });
    } else throw new Error('Unknown command. Type help.');
  }

  // -------------------------------------------------------------------- notes
  function viewNotes() {
    const d = h('div', { class: 'card notes' });
    d.innerHTML = `
<h2 style="margin-top:0">What this is</h2>
<p>Poonomics is a macro-and-distribution model of the Australian economy built to be pushed around. It starts from a rounded picture of FY2025-26 and runs 30 years forward in yearly steps. Every number in the base year is an approximation written down by hand from memory of public statistics (ABS, Treasury, AIHW, ATO, RBA). It has not been checked line by line against the latest releases. Treat the shapes and the sizes of effects as informative, and the exact dollars as rough. You can change any base-year fact in Debug.</p>
<h3>What is modelled</h3>
<ul>
<li><b>People:</b> six age groups with births, deaths, ageing and migration. Labour force by age, pension eligibility, and the cost pressure from ageing.</li>
<li><b>Capacity:</b> capital, labour and productivity give potential output. Hours worked, retirement age, training and education quality feed in.</li>
<li><b>Demand:</b> consumption by eleven income groups, business and housing investment, government, exports and imports are solved together each year, so a dollar of stimulus has a multiplier. Demand beyond capacity spills into imports and prices.</li>
<li><b>Prices and money:</b> wages, inflation expectations, a Taylor-rule central bank (or your override), the exchange rate, the terms of trade, a bond yield and average interest on debt.</li>
<li><b>Government:</b> about 25 tax lines and 25 spending lines with real brackets, indexation, a fiscal rule, wealth and inheritance taxes, GST design, carbon pricing, resource rent, UBI, a job guarantee and more.</li>
<li><b>Services:</b> health, aged care, dental, education and the NDIS each have a funded level, a workforce capacity and a delivered level. Money above capacity bids up prices.</li>
<li><b>Housing:</b> house prices, rents, dwelling supply, builder capacity, mortgage stress and ownership.</li>
<li><b>Distribution:</b> poverty and the Gini come from a mix of eleven income groups with spread inside each, so top-end tax changes and bottom-end payment changes show up properly.</li>
<li><b>Wealth and avoidance:</b> a Pareto tail for top wealth, with avoidance and capital flight, plus company profit-shifting leakage that falls with enforcement or a global minimum tax.</li>
</ul>
<h3>How the baseline works</h3>
<p>The first run with unchanged policy is forced onto a smooth path for the output gap, and the demand left over is stored as an add-factor (the same device Treasury and the RBA use). Your scenarios reuse those add-factors, so every difference you see comes from your changes. The size of the add-factor is shown in Debug. If you turn on <i>GOD: no demand add-factors</i> the add-factors are removed and the baseline drifts.</p>
<h3>Honest limits</h3>
<ul>
<li>It is one aggregated economy, not a firm-by-firm simulation. Industries are not modelled separately, except mining through the terms of trade.</li>
<li>Behavioural responses (avoidance, investment, labour supply, migration of the rich) use simple elasticities that I chose to be plausible. They are the weakest part and the most arguable. Change them and see.</li>
<li>States and the Commonwealth are combined. GST distribution between them is not modelled.</li>
<li>Household wealth is only partly modelled (housing, super, a top-wealth tail).</li>
<li>It has no financial-sector balance sheet beyond household debt and net foreign liabilities.</li>
<li>Poverty and inequality use per-person income and do not adjust for household size.</li>
<li>The extreme settings (printing 100% of deficits, 4x spending) are meant to show direction and breakage, not forecast a real outcome.</li>
</ul>
<h3>What it can and cannot say about "false scarcity"</h3>
<p>It can show how large each revenue lever is, how fast avoidance eats a base, whether a given service is limited by money or by staff, and how long it takes to build capacity. It cannot prove anyone is hoarding anything. That depends on the elasticities you believe. The Reform lab and the Services tab are the quickest way to test your own view.</p>
<h3>Base-year numbers used</h3>`;
    const rows = [];
    const rv = C.rev0, sp = C.spend0;
    rows.push(['GDP', money(C.Y0)], ['Population', C.pop0.reduce((s, v) => s + v, 0).toFixed(1) + 'M'], ['Unemployment', '4.1%'], ['Inflation', (C.cpi0 * 100).toFixed(1) + '%'], ['Cash rate', (C.rcash0 * 100).toFixed(1) + '%'],
      ['Government revenue', money(Object.keys(rv).reduce((s, k) => s + rv[k], 0))], ['Government spending (ex interest)', money(Object.keys(sp).reduce((s, k) => s + sp[k], 0))], ['Net debt', money(C.netDebt0)], ['Net foreign liabilities', money(C.nfl0)], ['Household debt', money(C.hhDebt0)], ['Super assets', money(C.superAssets0)]);
    d.appendChild(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl', style: 'max-width:420px' }, h('tbody', null, rows.map((r) => h('tr', null, h('td', { text: r[0] }), h('td', { class: 'n', text: r[1] })))))));
    return d;
  }

  // ------------------------------------------------------------------ presets
  function applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id); if (!p) throw new Error('No preset ' + id + '. Try: ' + PRESETS.map((x) => x.id).join(', '));
    state.P = {}; Object.keys(p.p).forEach((k) => { if (Math.abs(p.p[k] - defaults[k]) > 1e-12) state.P[k] = p.p[k]; });
    state.events = clone(p.ev); state.pins = [];
    syncAllLevers(); refresh();
  }

  // --------------------------------------------------------------------- init
  function init() {
    load();
    applyCalib();
    const ps = $('#presetSel');
    ps.appendChild(h('option', { value: '', text: 'Scenario presets...' }));
    PRESETS.forEach((p) => ps.appendChild(h('option', { value: p.id, text: p.name, title: p.desc })));
    ps.addEventListener('change', () => { if (ps.value) { applyPreset(ps.value); const p = PRESETS.find((x) => x.id === ps.value); consoleLines.push({ t: 'Loaded: ' + p.name + '. ' + p.desc, c: 'inf' }); } ps.value = ''; });
    $('#cursor').max = HORIZON;
    $('#cursor').addEventListener('input', (e) => { state.cursor = +e.target.value; renderKpis(); renderView(); save(); });
    $('#playBtn').addEventListener('click', () => {
      const b = $('#playBtn');
      if (playTimer) { clearInterval(playTimer); playTimer = null; b.textContent = 'Play'; return; }
      if (state.cursor >= HORIZON) state.cursor = 0;
      b.textContent = 'Pause';
      playTimer = setInterval(() => { if (state.cursor >= HORIZON) { clearInterval(playTimer); playTimer = null; b.textContent = 'Play'; return; } state.cursor++; renderKpis(); renderView(); }, 650);
    });
    $('#resetBtn').addEventListener('click', () => { state.P = {}; state.events = []; state.pins = []; state.calib = {}; applyCalib(); syncAllLevers(); refresh(); });
    $('#leverSearch').addEventListener('input', (e) => { state.search = e.target.value; buildLevers(); });
    $('#expandBtn').addEventListener('click', () => { LV.forEach((l) => { state.open[l.g] = true; }); buildLevers(); });
    $('#collapseBtn').addEventListener('click', () => { state.open = {}; buildLevers(); });
    $('#drawerBtn').addEventListener('click', () => document.body.classList.toggle('drawer-open'));
    $('#drawerClose').addEventListener('click', () => document.body.classList.remove('drawer-open'));
    state.open[LV[0].g] = true;
    buildLevers();
    renderTabs();
    recompute();
    renderKpis();
    renderView();
    save();
    window.POONOMICS = { state, get res() { return res; }, get base() { return base; }, setLever, runCommand, refresh };
  }
  init();
})();
