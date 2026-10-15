/* Tiny SVG chart helpers for Poonomics. No dependencies. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function niceTicks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi = lo + 1; }
    const span = hi - lo;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = a; v <= b + step * 0.5; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }
  function tipEl() {
    let t = document.getElementById('chart-tip');
    if (!t) { t = document.createElement('div'); t.id = 'chart-tip'; t.className = 'chart-tip'; t.hidden = true; document.body.appendChild(t); }
    return t;
  }

  /* opts: xs[], series[{name,data[],color,dash,width,fmt}], cursor (index), onPick(i),
           yFmt, zero, yMin, yMax, height, unit */
  function lineChart(host, opts) {
    host.textContent = '';
    const W = Math.max(280, host.clientWidth || 520), H = opts.height || 190;
    const m = { l: 44, r: 12, t: 10, b: 22 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
    svg.setAttribute('class', 'chart');
    const xs = opts.xs;
    let lo = Infinity, hi = -Infinity;
    opts.series.forEach((s) => s.data.forEach((v) => { if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }));
    if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (opts.yMin !== undefined) lo = opts.yMin;
    if (opts.yMax !== undefined) hi = opts.yMax;
    if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
    const pad = (hi - lo) * 0.06;
    const ticks = niceTicks(lo - (opts.yMin === undefined ? pad : 0), hi + (opts.yMax === undefined ? pad : 0), 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = (i) => m.l + (W - m.l - m.r) * (xs.length > 1 ? i / (xs.length - 1) : 0);
    const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0 || 1));
    const yFmt = opts.yFmt || ((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)));
    ticks.forEach((t) => {
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax0' : 'grid' }));
      svg.appendChild(el('text', { x: m.l - 6, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, yFmt(t)));
    });
    const xl = opts.xLabel || ((x) => "'" + String(x).slice(-2));
    const step = xs.length > 22 ? 5 : (xs.length > 12 ? 2 : 1);
    xs.forEach((x, i) => {
      if (i % step === 0 || i === xs.length - 1) svg.appendChild(el('text', { x: X(i), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, xl(x)));
    });
    opts.series.forEach((s) => {
      let d = '';
      s.data.forEach((v, i) => { if (!isFinite(v)) return; d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      const p = el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (s.dash) p.setAttribute('stroke-dasharray', s.dash);
      svg.appendChild(p);
    });
    if (opts.cursor !== undefined && opts.cursor >= 0) {
      svg.appendChild(el('line', { x1: X(opts.cursor), x2: X(opts.cursor), y1: m.t, y2: H - m.b, class: 'cursor' }));
      opts.series.forEach((s) => { const v = s.data[opts.cursor]; if (isFinite(v)) svg.appendChild(el('circle', { cx: X(opts.cursor), cy: Y(v), r: 3.5, fill: s.color, class: 'dot' })); });
    }
    const over = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', style: 'cursor:crosshair' });
    const tip = tipEl();
    function idxAt(ev) {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      return Math.max(0, Math.min(xs.length - 1, Math.round((px - m.l) / (W - m.l - m.r) * (xs.length - 1))));
    }
    over.addEventListener('mousemove', (ev) => {
      const i = idxAt(ev);
      tip.hidden = false;
      tip.innerHTML = '<b>' + xs[i] + '</b>' + opts.series.map((s) => `<div><i style="background:${s.color}"></i>${s.name}<span>${(s.fmt || yFmt)(s.data[i])}</span></div>`).join('');
      tip.style.left = Math.min(window.innerWidth - 190, ev.clientX + 14) + 'px';
      tip.style.top = (ev.clientY + 14) + 'px';
    });
    over.addEventListener('mouseleave', () => { tip.hidden = true; });
    over.addEventListener('click', (ev) => { if (opts.onPick) opts.onPick(idxAt(ev)); });
    svg.appendChild(over);
    host.appendChild(svg);
    const leg = document.createElement('div'); leg.className = 'legend';
    opts.series.forEach((s) => { const b = document.createElement('span'); b.innerHTML = `<i style="background:${s.color};${s.dash ? 'opacity:.55' : ''}"></i>${s.name}`; leg.appendChild(b); });
    host.appendChild(leg);
  }

  /* stacked area: layers[{name,color,data[]}] in the same units */
  function stackChart(host, opts) {
    host.textContent = '';
    const W = Math.max(280, host.clientWidth || 520), H = opts.height || 230;
    const m = { l: 40, r: 10, t: 8, b: 22 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart' });
    const xs = opts.xs, n = xs.length;
    const totals = xs.map((_, i) => opts.layers.reduce((s, l) => s + Math.max(0, l.data[i] || 0), 0));
    const hi = Math.max.apply(null, totals) * 1.05 || 1;
    const ticks = niceTicks(0, hi, 4);
    const top = ticks[ticks.length - 1];
    const X = (i) => m.l + (W - m.l - m.r) * (n > 1 ? i / (n - 1) : 0);
    const Y = (v) => m.t + (H - m.t - m.b) * (1 - v / top);
    ticks.forEach((t) => {
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid' }));
      svg.appendChild(el('text', { x: m.l - 6, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, (opts.yFmt || ((v) => v.toFixed(0)))(t)));
    });
    xs.forEach((x, i) => { if (i % 5 === 0 || i === n - 1) svg.appendChild(el('text', { x: X(i), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, "'" + String(x).slice(-2))); });
    const base = new Array(n).fill(0);
    opts.layers.forEach((l) => {
      let up = '', down = '';
      const next = base.map((b, i) => b + Math.max(0, l.data[i] || 0));
      for (let i = 0; i < n; i++) up += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(next[i]).toFixed(1);
      for (let i = n - 1; i >= 0; i--) down += 'L' + X(i).toFixed(1) + ' ' + Y(base[i]).toFixed(1);
      svg.appendChild(el('path', { d: up + down + 'Z', fill: l.color, opacity: 0.88 }));
      for (let i = 0; i < n; i++) base[i] = next[i];
    });
    if (opts.cursor !== undefined) svg.appendChild(el('line', { x1: X(opts.cursor), x2: X(opts.cursor), y1: m.t, y2: H - m.b, class: 'cursor' }));
    const over = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent', style: 'cursor:crosshair' });
    const tip = tipEl();
    function idxAt(ev) {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      return Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
    }
    over.addEventListener('mousemove', (ev) => {
      const i = idxAt(ev);
      tip.hidden = false;
      const rows = opts.layers.slice().reverse().filter((l) => (l.data[i] || 0) > 0.0001);
      tip.innerHTML = '<b>' + xs[i] + ' &middot; total ' + (opts.yFmt || ((v) => v.toFixed(1)))(totals[i]) + '</b>' + rows.map((l) => `<div><i style="background:${l.color}"></i>${l.name}<span>${(opts.vFmt || opts.yFmt || ((v) => v.toFixed(2)))(l.data[i])}</span></div>`).join('');
      tip.style.left = Math.min(window.innerWidth - 210, ev.clientX + 14) + 'px';
      tip.style.top = (ev.clientY + 14) + 'px';
    });
    over.addEventListener('mouseleave', () => { tip.hidden = true; });
    over.addEventListener('click', (ev) => { if (opts.onPick) opts.onPick(idxAt(ev)); });
    svg.appendChild(over);
    host.appendChild(svg);
    const leg = document.createElement('div'); leg.className = 'legend';
    opts.layers.forEach((l) => { const b = document.createElement('span'); b.innerHTML = `<i style="background:${l.color}"></i>${l.name}`; leg.appendChild(b); });
    host.appendChild(leg);
  }

  /* grouped bars: cats[], series[{name,color,data[]}] */
  function barChart(host, opts) {
    host.textContent = '';
    const W = Math.max(280, host.clientWidth || 520), H = opts.height || 210;
    const m = { l: 44, r: 8, t: 8, b: 30 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart' });
    let lo = 0, hi = 0;
    opts.series.forEach((s) => s.data.forEach((v) => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    const ticks = niceTicks(lo, hi * 1.05, 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0 || 1));
    const yFmt = opts.yFmt || ((v) => v.toFixed(0));
    ticks.forEach((t) => {
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax0' : 'grid' }));
      svg.appendChild(el('text', { x: m.l - 6, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, yFmt(t)));
    });
    const n = opts.cats.length, bw = (W - m.l - m.r) / n, k = opts.series.length;
    const gw = bw * 0.78 / k;
    opts.cats.forEach((c, i) => {
      opts.series.forEach((s, j) => {
        const v = s.data[i];
        if (!isFinite(v)) return;
        const x = m.l + i * bw + bw * 0.11 + j * gw;
        const yy = Y(Math.max(v, 0)), yb = Y(Math.min(v, 0));
        const r = el('rect', { x, y: yy, width: Math.max(1, gw - 1), height: Math.max(0.5, yb - yy), fill: s.color });
        const t = el('title'); t.textContent = c + ' - ' + s.name + ': ' + yFmt(v); r.appendChild(t);
        svg.appendChild(r);
      });
      svg.appendChild(el('text', { x: m.l + i * bw + bw / 2, y: H - 12, class: 'tick', 'text-anchor': 'middle' }, c));
    });
    host.appendChild(svg);
    const leg = document.createElement('div'); leg.className = 'legend';
    opts.series.forEach((s) => { const b = document.createElement('span'); b.innerHTML = `<i style="background:${s.color}"></i>${s.name}`; leg.appendChild(b); });
    host.appendChild(leg);
  }

  root.PoonCharts = { lineChart, stackChart, barChart };
})(window);
