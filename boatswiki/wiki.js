/* ============================================================
   BOATS Wiki engine — hash router, search, TOC, infoboxes,
   sortable tables, mobile drawer, pixel-art sprites.
   Loads BEFORE articles.js (articles use these helpers at
   parse time); boots on DOMContentLoaded once WIKI exists.
   ============================================================ */
'use strict';

/* ---------------- pixel sprites ---------------- */
/* Each sprite is a char grid; chars map to palette colors, '.' = transparent. */
const PIX = {
  boat: { p:{ f:'#ffd23f', m:'#4a3014', s:'#f4f0e2', S:'#d8d2c0', h:'#7a4a22', d:'#5c3318', w:'#2e6a9e', W:'#cfe8f4' },
    g:[ '......f.........',
        '......m.........',
        '......ms........',
        '......mss.......',
        '......msss......',
        '......mssss.....',
        '......msssss....',
        '......mssssss...',
        '......m..S......',
        '.hhhhhhhhhhhhh..',
        '..hdddddddddh...',
        '...hhhhhhhhh....',
        'W.wwWwwwWwww.wW.' ] },
  explorer: { p:{ H:'#6b4a2a', B:'#7e5a34', F:'#e8b888', e:'#2a2018', r:'#c0392b', c:'#b89a62', C:'#9a7e4e', t:'#5a4630', b:'#4a3322', s:'#c8ccd1', g:'#8a6a2c' },
    g:[ '...HHHHHH...',
        '..HHHHHHHH..',
        '.BBBBBBBBBB.',
        '...FFFFFF...',
        '...FeFFeF...',
        '...FFFFFF...',
        '....rrrr....',
        '..cccccccc..',
        '.cccctcccc..',
        'sg.cctccc...',
        '.s..cccc....',
        '.s..CCCC....',
        '.s..C..C....',
        '....b..b....',
        '...bb..bb...' ] },
  boar: { p:{ m:'#3e2a18', B:'#6b4a30', D:'#54381f', s:'#8a5c3c', e:'#d04030', T:'#e8dcc8' },
    g:[ '....mmmmmmm.....',
        '..mmBBBBBBBmm...',
        '.mBBBBBBBBBBBm..',
        'mBBBBBBBBBBBBBm.',
        'sBBeBBBBBBBBBBm.',
        'ssBBBBBBBBBBBBB.',
        'ssBBBBBBBBBBBBB.',
        'Ts.BBBBBBBBBBB..',
        'T..DDD...DDD....',
        '...DDD...DDD....' ] },
  snake: { p:{ V:'#2e3338', v:'#454d56', y:'#ffd23f', t:'#d04030' },
    g:[ '.....vVVV.....',
        '....VVyVV.....',
        '....VVVV......',
        '.....tVV......',
        '....t..VV.....',
        '..VVVVVVVV....',
        '.VVvVVVVvVV...',
        'VVV......VVV..',
        'VV........VV..',
        '.VVVVVVVVVV...',
        '...vvVVvv.....' ] },
  chest: { p:{ g:'#ffd23f', G:'#b8860b', w:'#7a4a22', d:'#5c3318', k:'#3a2c08' },
    g:[ '..gggggggggg..',
        '.gwwwwwwwwwwg.',
        'gwwwwwwwwwwwwg',
        'gddddddddddddg',
        'GggggggggggggG',
        'gwwwwwGGwwwwwg',
        'gwwwwwGkwwwwwg',
        'gwwwwwGGwwwwwg',
        'gddddddddddddg',
        '.gggggggggggg.' ] },
  flag: { p:{ p:'#5a4630', f:'#ffd23f', F:'#d8a818', r:'#8a8276', R:'#6e685e' },
    g:[ '..p.........',
        '..pffffff...',
        '..pfffF.....',
        '..pfF.......',
        '..p.........',
        '..p.........',
        '..p.........',
        '..p.........',
        '..rrr.......',
        '.rrRrrr.....',
        'rrRrrRrr....' ] },
  gold: { p:{ g:'#ffd23f', G:'#d8a818', w:'#fff6d8' },
    g:[ '..gggggg..',
        '.gGGGGGGg.',
        'gGgwggggGg',
        'gGwgggggGg',
        'gGggggggGg',
        'gGggggggGg',
        'gGGggggGGg',
        '.gGGGGGGg.',
        '..gggggg..' ] },
  gem: { p:{ c:'#7fffd8', C:'#3fae9e', w:'#ffffff' },
    g:[ '...cccc...',
        '..cwcccc..',
        '.cwcccccC.',
        'ccccccccCC',
        '.ccccccCC.',
        '..ccccCC..',
        '...ccCC...',
        '....cC....' ] },
  herb: { p:{ h:'#5a9a4a', H:'#3e7e3d', s:'#4a6a2c' },
    g:[ '..h...h...',
        '.hhh.hhh..',
        '.hHh.hHh..',
        '..hhshh...',
        '...hsh....',
        '....s.....',
        '...ss.....',
        '....s.....' ] },
  relic: { p:{ a:'#c08a4a', A:'#9a6a34', d:'#6e4a22' },
    g:[ '..aa..aa..',
        '.a..aa..a.',
        '.a.aaaa.a.',
        '..aaaaaa..',
        '..aAAAAa..',
        '..aAAAAa..',
        '..aaAAaa..',
        '...aaaa...',
        '...aAAa...',
        '....aa....',
        '...adda...' ] },
  ore: { p:{ o:'#8a8da0', O:'#6a6d80', w:'#c8ccd1' },
    g:[ '...ooo....',
        '..oowoo...',
        '.ooooooo..',
        'ooOoooOoo.',
        'oOOooooOo.',
        '.oOOOOOo..',
        '..ooooo...' ] },
  whale: { p:{ s:'#cfe8f4', B:'#4a6e8c', b:'#3a5a74', f:'#2f4a60', w:'#9fc2d8', e:'#16222e' },
    g:[ '....s..s..........',
        '.....ss...........',
        '.....ss...........',
        '..BBBBBBBBBBB.....',
        '.BBbbbbbbbbbbBB...',
        'Bbbbbbbbbbbbbbb.f.',
        'Bbebbbbbbbbbbbfff.',
        '.wwwwwwwwwwbbfff..',
        '..wwwwwwwwbbf.....',
        '.....f...bf.......' ] },
  fish: { p:{ f:'#7fb8d8', F:'#5a92b2', e:'#16222e', w:'#cfe8f4' },
    g:[ '.........ff.',
        '..ffffff.ff.',
        '.fwffffffff.',
        'fefffffFfff.',
        '.ffffffFfff.',
        '..ffffff.ff.',
        '.........ff.' ] },
};

/* spr('boar', 4) → svg string. swap remaps palette keys to new colors. */
function spr(name, scale, swap, cls){
  const d = PIX[name]; if(!d) return '';
  scale = scale || 4;
  const pal = Object.assign({}, d.p, swap || {});
  const h = d.g.length, w = Math.max(...d.g.map(r => r.length));
  let rects = '';
  for(let y = 0; y < h; y++){
    const row = d.g[y];
    let x = 0;
    while(x < row.length){
      const ch = row[x];
      if(ch === '.' || !pal[ch]){ x++; continue; }
      let run = 1;
      while(row[x+run] === ch) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${pal[ch]}"/>`;
      x += run;
    }
  }
  return `<svg class="px ${cls||''}" width="${w*scale}" height="${h*scale}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${name} pixel art">${rects}</svg>`;
}

/* ---------------- article helpers (used inside articles.js templates) ---------------- */
function pretty(page){ return page.replace(/_/g, ' '); }
function L(page, text){ return `<a href="#/${page}">${text || pretty(page)}</a>`; }
function tier(n, label){ return `<span class="tier tier-${n}">${label}</span>`; }
function hatnote(html){ return `<div class="hatnote">${html}</div>`; }

/* Infobox builder: ib({title, sub, art, cap, rows:[[label, value]|'SECTION:Heading', ...]}) */
function ib(o){
  let rows = '';
  for(const r of (o.rows || [])){
    if(typeof r === 'string' && r.startsWith('SECTION:'))
      rows += `<tr><td colspan="2" class="ib-section">${r.slice(8)}</td></tr>`;
    else
      rows += `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`;
  }
  return `<aside class="infobox">
    <div class="ib-title">${o.title}</div>
    ${o.sub ? `<div class="ib-sub">${o.sub}</div>` : ''}
    ${o.art ? `<div class="ib-art">${o.art}</div>` : ''}
    ${o.cap ? `<div class="ib-cap">${o.cap}</div>` : ''}
    ${rows ? `<table>${rows}</table>` : ''}
  </aside>`;
}

/* Wrap a wikitable for horizontal scrolling on small screens. */
function scrollTable(tableHtml){ return `<div class="table-scroll">${tableHtml}</div>`; }

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const articleEl = $('#article'), navEl = $('#navlist'),
        sidebar = $('#sidebar'), scrim = $('#scrim'), burger = $('#burger'),
        searchEl = $('#search'), suggestEl = $('#suggest');

  /* ----- search index ----- */
  const strip = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const INDEX = Object.keys(WIKI).map(key => ({
    key, title: WIKI[key].title || pretty(key),
    text: strip(WIKI[key].html || ''),
  }));
  const ALIAS = Object.keys(REDIRECTS).map(key => ({ key, to: REDIRECTS[key] }));

  /* ----- sidebar nav ----- */
  navEl.innerHTML = NAV.map(group =>
    `<h4>${group.head}</h4>` + group.items.map(it => {
      const [page, label] = Array.isArray(it) ? it : [it, null];
      return `<a href="#/${page}" data-page="${page}">${label || pretty(page)}</a>`;
    }).join('')
  ).join('') + `<h4>Tools</h4>
    <a href="#/Special:Random" data-page="Special:Random">⚄ Random page</a>
    <a href="/boats" class="ext">⛵ Play BOATS</a>
    <a href="/" class="ext">Monday Jeffrey</a>`;

  function setActiveNav(page){
    navEl.querySelectorAll('a').forEach(a =>
      a.classList.toggle('active', a.dataset.page === page));
  }

  /* ----- mobile drawer ----- */
  function drawer(open){
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    requestAnimationFrame(() => scrim.classList.toggle('show', open));
    burger.setAttribute('aria-expanded', open);
  }
  burger.addEventListener('click', () => drawer(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => drawer(false));
  navEl.addEventListener('click', e => { if(e.target.closest('a')) drawer(false); });
  addEventListener('keydown', e => {
    if(e.key === 'Escape') drawer(false);
    if(e.key === '/' && document.activeElement !== searchEl){ e.preventDefault(); searchEl.focus(); }
  });

  /* ----- router ----- */
  function parseHash(){
    let h = decodeURIComponent(location.hash || '');
    if(h.startsWith('#/')) h = h.slice(2); else h = h.replace(/^#/, '');
    if(!h) return { page: 'Main_Page', section: null };
    const i = h.indexOf('/');
    if(h.startsWith('Special:Search')){
      return { page: 'Special:Search', section: h.slice('Special:Search'.length + 1) };
    }
    if(i === -1) return { page: h, section: null };
    return { page: h.slice(0, i), section: h.slice(i + 1) };
  }

  function go(){
    let { page, section } = parseHash(), redirectedFrom = null;
    if(page === 'Special:Random'){
      const keys = Object.keys(WIKI).filter(k => k !== 'Main_Page');
      location.replace('#/' + keys[Math.floor(Math.random() * keys.length)]);
      return;
    }
    if(REDIRECTS[page]){
      redirectedFrom = pretty(page);
      const t = REDIRECTS[page].split('/');
      page = t[0]; section = section || t[1] || null;
    }
    if(page === 'Special:Search'){ renderSearch(section || ''); return; }
    if(page.startsWith('Category:')){ renderCategory(page.slice(9)); return; }
    const art = WIKI[page];
    if(!art){ renderMissing(page); return; }
    renderArticle(page, art, redirectedFrom, section);
  }
  addEventListener('hashchange', go);

  /* ----- renderers ----- */
  const TAGLINE = 'From BOATS Wiki, the cartographer’s companion';

  function renderArticle(page, art, redirectedFrom, section){
    const isMain = page === 'Main_Page';
    let html = '';
    if(!art.noTitle) html += `<h1>${art.title || pretty(page)}</h1>`;
    html += `<p class="tagline">${TAGLINE}${redirectedFrom ? ` &nbsp;<span class="redirnote">(redirected from “${redirectedFrom}”)</span>` : ''}</p>`;
    html += art.html;
    articleEl.innerHTML = html;

    if(!isMain){
      wrapSections();
      buildTOC(art);
      appendNavbox(page);
      appendCats(art);
    }
    markRedlinks();
    initSortables();
    document.title = (isMain ? 'BOATS Wiki' : `${art.title || pretty(page)} — BOATS Wiki`);
    setActiveNav(page);
    jump(section);
  }

  function jump(section){
    if(section){
      const el = document.getElementById(slug(section));
      if(el){ el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -62); return; }
    }
    scrollTo(0, 0);
  }

  function renderMissing(page){
    articleEl.innerHTML = `<h1>${pretty(page)}</h1><p class="tagline">${TAGLINE}</p>
      <p>This page does not exist — the chart here is still blank parchment.</p>
      <p>Try the search box, or start from the ${L('Main_Page', 'Main Page')}.
      If you sailed here from a link inside the wiki, that link is a <a class="new" href="#/${page}">redlink</a> — territory not yet surveyed.</p>`;
    document.title = `${pretty(page)} (page does not exist) — BOATS Wiki`;
    setActiveNav(null); markRedlinks(); scrollTo(0, 0);
  }

  function renderCategory(cat){
    const members = Object.keys(WIKI)
      .filter(k => (WIKI[k].cats || []).includes(cat))
      .sort((a, b) => (WIKI[a].title || a).localeCompare(WIKI[b].title || b));
    articleEl.innerHTML = `<h1>Category: ${cat}</h1><p class="tagline">${TAGLINE}</p>
      <p>The following ${members.length} page${members.length === 1 ? '' : 's'} are in this category.</p>
      <ul>${members.map(k => `<li>${L(k, WIKI[k].title)}</li>`).join('')}</ul>`;
    document.title = `Category: ${cat} — BOATS Wiki`;
    setActiveNav(null); markRedlinks(); scrollTo(0, 0);
  }

  function renderSearch(q){
    q = (q || '').trim();
    searchEl.value = q;
    const ql = q.toLowerCase();
    const hits = !ql ? [] : INDEX.map(it => {
      const t = it.title.toLowerCase(), ti = t.indexOf(ql), ci = it.text.toLowerCase().indexOf(ql);
      let score = -1;
      if(ti === 0) score = 100; else if(ti > 0) score = 60; else if(ci >= 0) score = 20;
      return { it, score, ci };
    }).filter(h => h.score > 0).sort((a, b) => b.score - a.score);

    const items = hits.map(({ it, ci }) => {
      let snip = it.text.slice(0, 180);
      if(ci > 40) snip = '…' + it.text.slice(ci - 40, ci + 140);
      snip = snip.replace(new RegExp('(' + escapeRe(q) + ')', 'ig'), '<mark>$1</mark>');
      return `<div class="sr-item"><div class="sr-t">${L(it.key, it.title)}</div>
        <div class="sr-snip">${snip}…</div></div>`;
    }).join('');

    articleEl.innerHTML = `<h1>Search results</h1><p class="tagline">${TAGLINE}</p>
      <p>${hits.length ? `${hits.length} page${hits.length === 1 ? '' : 's'} match` : 'No pages match'} <b>“${escapeHtml(q)}”</b>.</p>
      ${items || `<p>The lookout saw nothing on the horizon. Try a shorter word — or ${L('Special:Random', 'sail somewhere random')}.</p>`}`;
    document.title = `Search “${q}” — BOATS Wiki`;
    setActiveNav(null); markRedlinks(); scrollTo(0, 0);
  }

  /* ----- TOC + collapsible sections ----- */
  function slug(t){ return t.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function wrapSections(){
    /* Wrap everything following each h2 (until the next h2) so sections can collapse. */
    const kids = [...articleEl.children];
    const firstH2 = kids.findIndex(k => k.tagName === 'H2');
    if(firstH2 === -1) return;
    let i = firstH2;
    while(i < articleEl.children.length){
      const node = articleEl.children[i];
      if(node.tagName !== 'H2'){ i++; continue; }
      const body = document.createElement('div');
      body.className = 'section-body';
      let n = node.nextSibling;
      while(n && !(n.tagName === 'H2')){ const next = n.nextSibling; body.appendChild(n); n = next; }
      node.after(body);
      const t = document.createElement('span');
      t.className = 'sec-toggle'; t.textContent = '[hide]';
      t.addEventListener('click', () => {
        const c = node.classList.toggle('sec-collapsed');
        t.textContent = c ? '[show]' : '[hide]';
      });
      node.appendChild(t);
      i++;
    }
  }

  function buildTOC(art){
    if(art.notoc) return;
    const hs = [...articleEl.querySelectorAll('h2, h3')];
    const h2s = hs.filter(h => h.tagName === 'H2');
    if(h2s.length < 3) {
      hs.forEach(h => h.id = slug(h.tagName === 'H2' ? h.childNodes[0].textContent : h.textContent));
      return;
    }
    let n2 = 0, n3 = 0, out = '<ol>';
    let openSub = false;
    for(const h of hs){
      const label = h.tagName === 'H2' ? h.childNodes[0].textContent.trim() : h.textContent.trim();
      h.id = slug(label);
      if(h.tagName === 'H2'){
        if(openSub){ out += '</ol></li>'; openSub = false; } else if(n2 > 0) out += '</li>';
        n2++; n3 = 0;
        out += `<li><a href="javascript:void 0" data-jump="${h.id}"><span class="tocnum">${n2}</span>${label}</a>`;
      } else {
        if(!openSub){ out += '<ol>'; openSub = true; }
        n3++;
        out += `<li><a href="javascript:void 0" data-jump="${h.id}"><span class="tocnum">${n2}.${n3}</span>${label}</a></li>`;
      }
    }
    if(openSub) out += '</ol></li>'; else out += '</li>';
    out += '</ol>';
    const toc = document.createElement('nav');
    toc.className = 'toc';
    toc.innerHTML = `<div class="toc-title">Contents <button type="button">[hide]</button></div>${out}`;
    const list = toc.querySelector('ol'), btn = toc.querySelector('button');
    btn.addEventListener('click', () => {
      const hid = list.style.display === 'none';
      list.style.display = hid ? '' : 'none';
      btn.textContent = hid ? '[hide]' : '[show]';
    });
    toc.addEventListener('click', e => {
      const a = e.target.closest('[data-jump]'); if(!a) return;
      const el = document.getElementById(a.dataset.jump);
      if(el){ el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    const firstH2 = articleEl.querySelector('h2');
    firstH2.before(toc);
  }

  /* ----- navbox + categories ----- */
  function appendNavbox(current){
    const rows = NAVBOX.map(([group, pages]) =>
      `<div class="nb-row"><div class="nb-group">${group}</div><div class="nb-links">${
        pages.map(p => current === p
          ? `<b>${pretty(p)}</b>`
          : L(p)).join('<span class="dot">·</span>')
      }</div></div>`).join('');
    articleEl.insertAdjacentHTML('beforeend',
      `<nav class="navbox"><div class="nb-title">⛵ The world of ${L('BOATS')}</div>${rows}</nav>`);
  }

  function appendCats(art){
    if(!art.cats || !art.cats.length) return;
    articleEl.insertAdjacentHTML('beforeend',
      `<div class="catlinks"><b>Categories:</b> ${
        art.cats.map(c => `<a href="#/Category:${c}">${c}</a>`).join(' <span class="dot">|</span> ')}</div>`);
  }

  /* ----- redlinks ----- */
  function markRedlinks(){
    articleEl.querySelectorAll('a[href^="#/"]').forEach(a => {
      const page = decodeURIComponent(a.getAttribute('href').slice(2)).split('/')[0];
      if(page.startsWith('Special:') || page.startsWith('Category:')) return;
      if(!WIKI[page] && !REDIRECTS[page]) a.classList.add('new');
    });
  }

  /* ----- sortable tables ----- */
  function initSortables(){
    articleEl.querySelectorAll('table.sortable').forEach(tb => {
      const ths = tb.querySelectorAll('thead th');
      ths.forEach((th, ci) => th.addEventListener('click', () => {
        const tbody = tb.querySelector('tbody');
        const dir = th.classList.contains('asc') ? -1 : 1;
        ths.forEach(o => o.classList.remove('asc', 'desc'));
        th.classList.add(dir === 1 ? 'asc' : 'desc');
        const rows = [...tbody.rows];
        const val = r => {
          const c = r.cells[ci]; if(!c) return '';
          const s = (c.dataset.sort != null ? c.dataset.sort : c.textContent).trim();
          const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
          return isNaN(n) || !/\d/.test(s) ? s.toLowerCase() : n;
        };
        rows.sort((a, b) => {
          const va = val(a), vb = val(b);
          if(typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
        rows.forEach(r => tbody.appendChild(r));
      }));
    });
  }

  /* ----- search box + suggestions ----- */
  let selIdx = -1;
  function suggest(){
    const q = searchEl.value.trim().toLowerCase();
    selIdx = -1;
    if(!q){ suggestEl.classList.add('hidden'); return; }
    const starts = [], contains = [], inText = [];
    for(const it of INDEX){
      const t = it.title.toLowerCase();
      if(t.startsWith(q)) starts.push(it);
      else if(t.includes(q)) contains.push(it);
      else if(it.text.toLowerCase().includes(q)) inText.push(it);
    }
    for(const al of ALIAS){
      if(al.key.toLowerCase().replace(/_/g, ' ').startsWith(q)){
        const target = al.to.split('/')[0];
        if(WIKI[target]) starts.push({ key: al.key, title: pretty(al.key), alias: pretty(target) });
      }
    }
    const top = [...starts, ...contains, ...inText].slice(0, 8);
    if(!top.length){ suggestEl.classList.add('hidden'); return; }
    suggestEl.innerHTML = top.map(it =>
      `<a href="#/${it.key}"><span class="s-ico">${(WIKI[it.key] && WIKI[it.key].icon) || '📄'}</span>${escapeHtml(it.title)}${
        it.alias ? `<small>→ ${escapeHtml(it.alias)}</small>` : ''}</a>`).join('');
    suggestEl.classList.remove('hidden');
  }
  searchEl.addEventListener('input', suggest);
  searchEl.addEventListener('focus', suggest);
  searchEl.addEventListener('blur', () => setTimeout(() => suggestEl.classList.add('hidden'), 160));
  searchEl.addEventListener('keydown', e => {
    const opts = [...suggestEl.querySelectorAll('a')];
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      if(!opts.length) return;
      selIdx = (selIdx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('sel', i === selIdx));
    } else if(e.key === 'Enter'){
      e.preventDefault();
      if(selIdx >= 0 && opts[selIdx]) location.hash = opts[selIdx].getAttribute('href');
      else if(searchEl.value.trim()) location.hash = '#/Special:Search/' + encodeURIComponent(searchEl.value.trim());
      suggestEl.classList.add('hidden'); searchEl.blur();
    } else if(e.key === 'Escape'){
      suggestEl.classList.add('hidden'); searchEl.blur();
    }
  });
  suggestEl.addEventListener('mousedown', () => { /* let the click land before blur hides it */ });

  /* ----- utils ----- */
  function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  go();
});
