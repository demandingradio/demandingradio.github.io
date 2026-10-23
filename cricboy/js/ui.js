/* Cricboy UI: screens, flow, persistence. Everything renders into #app from a small state object. */
(function () {
  'use strict';
  const CB = window.CB;
  const $app = document.getElementById('app');
  const SAVE = 'cricboy.save.v1', SHELF = 'cricboy.shelf.v1';
  let W = null;                 // the world (persisted)
  let pending = null;           // between-screen state (persisted, compact)
  let live = null;              // current match replay (memory only)
  const ui = { screen: 'title', tab: 'home', create: null, scTab: 0, shelfOpen: null, statView: 'season', chart: null };

  // ---------------------------------------------------------------- persistence
  const strip = (k, v) => (k === 'e' || k === 'bw' || k === '_ctx') ? undefined : v;
  function save() {
    if (!W) return;
    try { localStorage.setItem(SAVE, JSON.stringify({ W, pending, screen: ui.screen }, strip)); } catch (e) { toast('Could not save (storage full?)'); }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (!s || !s.W) return false;
      W = s.W; pending = s.pending || null;
      let maxId = 0;
      for (const p of Object.values(W.players)) { if (p.st && !p.st.county) p.st.county = CB.blankStats(); CB.refresh(p); maxId = Math.max(maxId, p.id); }
      CB.setNextId(maxId + 1);
      const p = CB.user(W);
      // saves from before the update: fill in the new fields
      if (p) { p.ilog = p.ilog || []; p.blog = p.blog || []; p.captRec = p.captRec || {}; p.captPrefs = p.captPrefs || { toss: 'auto', style: 'balanced' }; p.fame = p.fame || 0; if (p.lifeLeft == null) CB.seasonStartCareer(W); }
      W.season.lb = W.season.lb || { shield: {}, test: {} };
      W.offers = W.offers || [];
      return true;
    } catch (e) { console.error(e); return false; }
  }
  const hasSave = () => { try { return !!localStorage.getItem(SAVE); } catch (e) { return false; } };
  // older entries stored the legacy perk over the legacy verdict (and crashed the Shelf): rebuild the verdict from the stats
  const fixEntry = e => {
    if (!e.legacy || typeof e.legacy !== 'object' || e.legacy.rank == null) {
      if (typeof e.legacy === 'string' && !e.legacyPerk) e.legacyPerk = e.legacy;
      e.legacy = CB.legacyFromLines(e.test || { m: 0, w: 0 }, e.shield || { m: 0 });
    }
    e.traits = e.traits || []; e.hidden = e.hidden || { bat: '-', bowl: null };
    return e;
  };
  const getShelf = () => { try { return JSON.parse(localStorage.getItem(SHELF) || '[]').filter(Boolean).map(fixEntry); } catch (e) { return []; } };
  const addShelf = e => { const s = getShelf(); s.unshift(e); try { localStorage.setItem(SHELF, JSON.stringify(s)); } catch (x) { } };
  const wipeSave = () => { try { localStorage.removeItem(SAVE); } catch (e) { } };

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const me = () => W && CB.user(W);
  const LV = { seconds: 'Second XI', shield: 'Shield', test: 'Test', county: 'County' };
  const LVC = ['seconds', 'shield', 'test', 'county'];
  const lvBadge = lv => `<span class="badge lv-${lv}">${lv === 'test' ? '🧢 ' : lv === 'county' ? '🏴 ' : ''}${LV[lv]}</span>`;
  const roleText = p => (p.role === 'pace' || p.role === 'spin') ? CB.SUB_INFO[p.sub] : CB.ROLE_INFO[p.role].label + (p.role === 'ar' && p.sub ? ' · ' + CB.SUB_INFO[p.sub].toLowerCase() : '');
  const isBowler = p => p.role === 'pace' || p.role === 'spin';
  const initials = p => (p.first[0] + p.last[0]).toUpperCase();
  const stateOf = id => CB.stateById(id);
  const teamName = id => (stateOf(id) || CB.countyById(id) || CB.NATIONS[id] || { name: id }).name;
  const fmtOv = b => CB.oversStr(b);
  const avg = (r, o) => o > 0 ? (r / o).toFixed(1) : '-';
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
  function confetti() {
    const c = document.createElement('div'); c.className = 'confetti';
    const cols = ['#f4c542', '#2fbf71', '#e5484d', '#5aa9e6', '#f5efd9'];
    for (let i = 0; i < 70; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + 'vw'; s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * 0.6 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`; c.appendChild(s); }
    document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
  }
  function go(screen, tab) {
    const changed = screen !== ui.screen || (tab && tab !== ui.tab);
    ui.screen = screen; if (tab) ui.tab = tab;
    render();
    if (changed) { window.scrollTo(0, 0); $app.classList.remove('enter'); void $app.offsetWidth; $app.classList.add('enter'); }  // opacity-only fade: keeps fixed bars fixed
  }
  function bar(html) { return `<div class="bar"><div class="inner">${html}</div></div>`; }
  function withLoading(fn) {
    const o = document.createElement('div'); o.className = 'loading'; o.innerHTML = '<div class="spinner"></div><div class="small mute">Playing the round…</div>';
    document.body.appendChild(o);
    setTimeout(() => { try { fn(); } finally { o.remove(); } }, 40);
  }

  // ---------------------------------------------------------------- app shell (career screens)
  function appbar(p) {
    const st = stateOf(p.team), cap = CB.isCaptain(W, p);
    return `<header class="appbar"><div class="avatar" style="--c:${st.color}">${esc(initials(p))}</div>
      <div class="grow"><div class="ab-name">${esc(p.first)} ${esc(p.last)}${cap ? ' <span class="armband" title="Captain">C</span>' : ''}</div><div class="tiny mute">${p.age} · ${esc(roleText(p))}</div></div>
      ${lvBadge(CB.userLevel(W, p))}<button class="iconbtn" data-a="menu" aria-label="Menu">☰</button></header>`;
  }
  function nav() {
    const T = [['home', '🏠', 'Home'], ['stats', '📊', 'Stats'], ['season', '🗓️', 'Season'], ['locker', '🧳', 'Locker']];
    return `<nav class="nav">${T.map(([id, ic, l]) => `<button class="${ui.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}"><span class="ni">${ic}</span><span>${l}</span></button>`).join('')}</nav>`;
  }

  // ---------------------------------------------------------------- screens
  const SCREENS = {};

  SCREENS.title = () => {
    const un = CB.getUnlocks(), nU = Object.keys(un).length;
    return `
    <div class="title reveal">
      <div class="ball"></div>
      <div class="logo">CRIC<span>BOY</span></div>
      <div class="tagline">Seventeen years old. A Second XI cap. A dream of a baggy green.<br><span class="small faint">Every ball simulated from 2.5 million real Test, Sheffield Shield and County Championship deliveries.</span></div>
      <div class="col" style="max-width:340px;margin:8px auto 0;width:100%">
        ${hasSave() ? `<button class="btn primary big" data-a="continue">Continue career</button>` : ''}
        <button class="btn ${hasSave() ? '' : 'primary'} big" data-a="new">New career</button>
        <button class="btn" data-a="shelf">🏆 The Shelf${getShelf().length ? ' · ' + getShelf().length : ''}</button>
        <button class="btn" data-a="legacy">👑 Legacy unlocks · ${nU}/${CB.UNLOCKS.length}</button>
        <button class="btn ghost" data-a="about">How it works</button>
      </div>
      <a class="small faint" href="/" style="margin-top:10px">← mondayjeffrey.com</a>
    </div>`;
  };

  SCREENS.about = () => `
    <div class="pagehead"><button class="iconbtn" data-a="back-title">←</button><h2>How it works</h2></div>
    <div class="card"><h3>The cricket is real</h3><p class="mute">Every delivery is drawn from a statistical model fitted to every ball of 896 men's Tests (2001-2026), 212 Sheffield Shield matches (2017-2026) and 265 County Championship matches (2017-2019): how often batters get out and score depending on balls faced, ball age, the day, the country, home advantage, declarations and run chases. Captains bowl, declare and enforce follow-ons the way real ones do. Weather, pitches and form come from the same data.</p>
    <p class="mute small">Ball-by-ball data from <a href="https://cricsheet.org" style="color:var(--green)">Cricsheet</a> (ODC-By licence). All players are fictional.</p></div>
    <div class="card"><h3>Your career</h3><p class="mute">You start at 17 in your state's Second XI. Talent is random and hidden. Score runs or take wickets and the selectors notice: Shield, then Tests. Get dropped if you don't. Senior players with big numbers and a cool head get offered the captaincy. Shield regulars outside the Test side may get a county stint in England.</p></div>
    <div class="card"><h3>Every match</h3><p class="mute">A key moment every match, in your own trade, and sometimes a bonus one when it gets big (the nineties, a hat-trick ball, a tight chase). Read the pitch, the ball and the game: a call that fits lifts you for the rest of that innings or spell, one that fights them can cost you. Either way that area trains 50% harder afterwards. Spend energy on 15 training areas and pair them for combo bonuses; hundreds and five-fors earn extra energy. Life happens between matches three to five times a season, and you have 15 seconds to choose. Milestones unlock perks.</p></div>
    <div class="card"><h3>Legacy</h3><p class="mute">Five huge achievements unlock legacy perks you can start a new career with. Retired careers go on the Shelf with your hidden ratings revealed.</p></div>
    ${bar('<button class="btn primary" data-a="back-title">Got it</button>')}`;

  SCREENS.legacy = () => {
    const un = CB.getUnlocks();
    return `<div class="pagehead"><button class="iconbtn" data-a="back-title">←</button><h2>Legacy unlocks</h2></div>
      <p class="mute small mb">Huge career feats. Each one unlocks a perk you can carry into a new career.</p>
      ${CB.UNLOCKS.map(u => legacyRow(u, un[u.id])).join('')}`;
  };
  function legacyRow(u, got, prog) {
    return `<div class="card lockrow ${got ? 'got' : ''}"><div class="lk-ic">${got ? u.icon : '🔒'}</div><div class="grow"><div class="b">${esc(u.name)}</div>
      <div class="small mute">${esc(u.desc)}</div><div class="tiny ${got ? 'good' : 'faint'} mt">${got ? 'Unlocked by ' + esc(got.by) + ' · ' + CB.seasonLabel(got.y) : 'Requires: ' + esc(u.need)}${prog ? ' · this career ' + prog : ''}</div></div></div>`;
  }

  // ---- create
  SCREENS.create = () => {
    const c = ui.create;
    const roles = [
      { id: 'open', t: 'Opening batter', d: 'Face the new ball' },
      { id: 'top', t: 'Top-order batter', d: 'Nos. 3-5' },
      { id: 'mid', t: 'Middle-order batter', d: 'Counter-puncher' },
      { id: 'wk', t: 'Keeper-batter', d: 'Gloves + runs' },
      { id: 'ar', t: 'All-rounder', d: 'Bat and bowl' },
      { id: 'bowl', t: 'Bowler', d: 'Take 20 wickets' },
    ];
    const subs = [{ id: 'fast', t: 'Fast', d: 'Raw pace, bounce' }, { id: 'swing', t: 'Swing & seam', d: 'Movement, new ball' }, { id: 'finger', t: 'Finger spin', d: 'Off-spin / orthodox' }, { id: 'wrist', t: 'Wrist spin', d: 'Leg-spin: high risk' }];
    const needSub = c.role === 'ar' || c.role === 'bowl';
    const un = CB.getUnlocks(), legs = CB.UNLOCKS.filter(u => un[u.id]);
    return `
    <div class="pagehead"><button class="iconbtn" data-a="back-title">←</button><h2>New career</h2></div>
    <div class="sec-title">Name</div>
    <div class="row"><input class="input" id="fn" value="${esc(c.first)}" placeholder="First" maxlength="16"><input class="input" id="ln" value="${esc(c.last)}" placeholder="Surname" maxlength="18"><button class="iconbtn lg" data-a="rname" title="Random name">🎲</button></div>
    <div class="sec-title">Your state</div>
    <div class="choice-grid">${CB.STATES.map(s => `<button class="choice ${c.state === s.id ? 'on' : ''}" data-a="cstate" data-v="${s.id}"><div class="t state-chip"><span class="dot" style="background:${s.color}"></span>${s.name}</div><div class="d">${s.ground}</div></button>`).join('')}</div>
    <div class="sec-title">Role</div>
    <div class="choice-grid">${roles.map(r => `<button class="choice ${c.role === r.id ? 'on' : ''}" data-a="crole" data-v="${r.id}"><div class="t">${r.t}</div><div class="d">${r.d}</div></button>`).join('')}</div>
    ${needSub ? `<div class="sec-title">Bowling type</div><div class="choice-grid">${subs.map(s => `<button class="choice ${c.sub === s.id ? 'on' : ''}" data-a="csub" data-v="${s.id}"><div class="t">${s.t}</div><div class="d">${s.d}</div></button>`).join('')}</div>` : ''}
    <div class="sec-title">Bats</div>
    <div class="seg"><button class="${c.hand === 'R' ? 'on' : ''}" data-a="chand" data-v="R">Right-handed</button><button class="${c.hand === 'L' ? 'on' : ''}" data-a="chand" data-v="L">Left-handed</button></div>
    ${legs.length ? `<div class="sec-title">Legacy perk</div><div class="choice-grid"><button class="choice ${!c.legacy ? 'on' : ''}" data-a="clegacy" data-v=""><div class="t">None</div><div class="d">A clean slate</div></button>${legs.map(u => `<button class="choice ${c.legacy === u.id ? 'on' : ''}" data-a="clegacy" data-v="${u.id}"><div class="t">${u.icon} ${esc(u.name)}</div><div class="d">${esc(u.desc)}</div></button>`).join('')}</div>` : ''}
    <p class="small faint mt">Your talent is rolled when you sign. You won't see the numbers. Ever. (Well, until you retire.)</p>
    ${bar(`<button class="btn primary big" data-a="sign" ${c.role && c.state && (!needSub || c.sub) ? '' : 'disabled'}>Sign rookie contract</button>`)}`;
  };

  SCREENS.scout = () => {
    const p = me();
    const leg = p.legacy && CB.UNLOCKS.find(u => u.id === p.legacy);
    return `
    <div class="card scout flip">
      <div class="avatar xl" style="--c:${stateOf(p.team).color}">${esc(initials(p))}</div>
      <div class="badge lv-seconds mt">Rookie contract · ${esc(stateOf(p.team).name)}</div>
      <div class="mt"><span class="mute">Age 17 · ${esc(roleText(p))}</span></div>
      <div class="disp" style="font-size:40px;margin-top:6px;line-height:1">${esc(p.first)} ${esc(p.last)}</div>
      <div class="quote">"${esc(CB.scoutReport(p))}"</div>
      <div class="mute small">State talent scout</div>
      ${leg ? `<div class="chip mt">${leg.icon} Legacy: ${esc(leg.name)}</div>` : ''}
    </div>
    <div class="card"><h3>Season ${CB.seasonLabel(W.year)}</h3><p class="mute">You'll start in the ${esc(stateOf(p.team).name)} Second XI. Ten rounds, three-day games. Make the selectors notice.</p></div>
    ${bar('<button class="btn primary big" data-a="hub">Let\'s go</button>')}`;
  };

  // ---- the career hub (tabs)
  SCREENS.hub = () => {
    const p = me(); if (!p) return SCREENS.title();
    return appbar(p) + `<main class="tabbody">${TABS[ui.tab] ? TABS[ui.tab]() : TABS.home()}</main>` + nav();
  };
  function nextSlot(p) {
    const S = W.season;
    let nxt = S.slots[S.cursor];
    if (nxt && !W.aus.xi.includes(p.id)) nxt = S.slots.slice(S.cursor).find(s => s.type !== 'test') || nxt;
    return nxt;
  }
  function slotTitle(slot, p) {
    if (slot.type === 'test') { const s = W.season.series[slot.series]; return `${slot.no}${['st', 'nd', 'rd'][slot.no - 1] || 'th'} Test v ${CB.NATIONS[s.opp].name}`; }
    if (slot.type === 'final') return 'Sheffield Shield Final';
    if (slot.type === 'county') return `${W.county ? CB.countyById(W.county.id).name : 'County'} v ${CB.countyById(slot.opp).name}`;
    const pair = slot.pairs.find(pp => pp.includes(p.team));
    const opp = pair ? (pair[0] === p.team ? pair[1] : pair[0]) : null;
    return `Round ${slot.round}${opp ? ' v ' + stateOf(opp).name : ''}`;
  }
  function slotSub(slot, p) {
    if (slot.type === 'test') { const s = W.season.series[slot.series]; return (s.home ? 'Home series' : 'Tour of ' + CB.NATIONS[s.opp].name) + ` · series ${s.res[0]}-${s.res[1]}`; }
    if (slot.type === 'final') return 'Top two on the ladder · five days';
    if (slot.type === 'county') return `County Championship · ${slot.home ? 'home' : 'away'} · four days`;
    const pair = slot.pairs.find(pp => pp.includes(p.team));
    return `${pair && pair[0] === p.team ? 'Home' : 'Away'} · Shield or Second XI, selectors decide`;
  }
  function gauge(heat) {
    const a = Math.PI * (1 - heat), x = 60 + 46 * Math.cos(a), y = 58 - 46 * Math.sin(a);
    return `<svg class="gauge" viewBox="0 0 120 66" aria-hidden="true"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#e5484d"/><stop offset=".5" stop-color="#f4c542"/><stop offset="1" stop-color="#2fbf71"/></linearGradient></defs>
      <path d="M14 58 A46 46 0 0 1 106 58" fill="none" stroke="var(--line)" stroke-width="9" stroke-linecap="round"/>
      <path d="M14 58 A46 46 0 0 1 106 58" fill="none" stroke="url(#gg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(144.5 * heat).toFixed(1)} 200"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="var(--ink)"/></svg>`;
  }
  const TABS = {};
  TABS.home = () => {
    const p = me(), st = stateOf(p.team), S = W.season;
    const sel = CB.selectionView(W, p);
    const nxt = nextSlot(p);
    const L = { test: p.st.test, shield: p.st.shield, seconds: p.st.seconds };
    const mainLv = p.st.test.m ? 'test' : p.st.shield.m ? 'shield' : 'seconds';
    const sl = CB.statLine(L[mainLv]);
    const stats = isBowler(p) ? [['Wkts', sl.w], ['Avg', sl.bavg], ['Best', sl.bb], ['M', sl.m]] : [['Runs', sl.runs], ['Avg', sl.avg], ['100s', sl.h100], ['M', sl.m]];
    const form = p.history.slice(-6);
    const offers = (W.offers || []).filter(o => o.type === 'captain');
    return `
    <section class="card hero" style="--c:${st.color}">
      <div class="hero-top"><div class="avatar lg" style="--c:${st.color}">${esc(initials(p))}</div><div class="grow"><div class="hero-name">${esc(p.first)}<br>${esc(p.last)}</div>
      <div class="tiny mute">${esc(st.name)}${p.capNo ? ' · Test cap ' + p.capNo : ''}${p.fame >= 4 ? ' · ⭐ fan favourite' : ''}</div></div></div>
      <div class="statrow">${stats.map(s => `<div class="stat"><div class="v num">${esc(s[1])}</div><div class="k">${LV[mainLv]} ${s[0]}</div></div>`).join('')}</div>
      ${form.length ? `<div class="formstrip">${form.map(h => `<span class="fs ${h.res === 'W' ? 'w' : h.res === 'L' ? 'l' : 'd'}" title="${esc(h.vs)}"><b>${esc((h.bat || '-').split(' & ')[0])}</b>${h.bowl ? `<i>${esc(h.bowl.split(' & ')[0])}</i>` : ''}</span>`).join('')}</div>` : ''}
    </section>
    ${offers.map(o => `<section class="card offer"><div class="kicker">Captaincy offer</div><h3>${o.level === 'test' ? 'Captain Australia?' : 'Captain ' + esc(stateOf(o.team).name) + '?'}</h3>
      <p class="small mute">${o.level === 'test' ? 'The selectors want you to lead the Test side. The armband brings pressure, and the toss is yours.' : 'The state wants you to lead. Your mental game will decide whether the extra weight helps or hurts.'}</p>
      <div class="row"><button class="btn primary grow" data-a="capt-yes" data-v="${o.level}">Accept</button><button class="btn grow" data-a="capt-no" data-v="${o.level}">Not yet</button></div></section>`).join('')}
    ${p.inj > 0 ? `<div class="news red">🩹 ${esc(p.injName || 'Injured')}: out for ${p.inj} more game${p.inj > 1 ? 's' : ''}.</div>` : ''}
    ${W.county ? `<div class="news blue">🏴 Overseas pro for ${esc(CB.countyById(W.county.id).name)} this summer · ${W.county.res[0]}W ${W.county.res[1]}L ${W.county.res[2]}D</div>` : ''}
    ${nxt ? `<section class="card next glow"><div class="tiny faint">UP NEXT · ${esc(CB.slotDate(W, nxt))}</div><div class="vs mt">${esc(slotTitle(nxt, p))}</div><div class="mute small">${esc(slotSub(nxt, p))}</div>
      <button class="btn primary big block mt" data-a="next">${p.inj > 0 ? 'Sim while injured' : 'Play next match'} ▶</button></section>`
      : `<section class="card next glow"><h3>Season complete</h3><p class="mute small">Time for the season review.</p><button class="btn gold big block mt" data-a="season-end">Season review</button></section>`}
    <section class="card"><div class="row between"><h3>Selectors' radar</h3><span class="tiny faint">${esc(CB.seasonLabel(S.year))}</span></div>
      <div class="row mt">${sel.heat != null ? gauge(sel.heat) : '<div class="gauge-tick">🧢</div>'}<div class="grow small mute">${esc(sel.text)}</div></div></section>`;
  };

  // ---- stats
  function seasonRows(p) {
    const rows = {};
    for (const x of p.ilog || []) { const k = x[0] + ':' + x[1]; const r = rows[k] || (rows[k] = { y: x[0], lv: x[1], i: 0, o: 0, r: 0, h: 0, f: 0, hs: 0, w: 0, rc: 0, b: 0 }); r.i++; if (x[7]) r.o++; r.r += x[5]; if (x[5] >= 100) r.h++; else if (x[5] >= 50) r.f++; r.hs = Math.max(r.hs, x[5]); }
    for (const x of p.blog || []) { const k = x[0] + ':' + x[1]; const r = rows[k] || (rows[k] = { y: x[0], lv: x[1], i: 0, o: 0, r: 0, h: 0, f: 0, hs: 0, w: 0, rc: 0, b: 0 }); r.w += x[7]; r.rc += x[6]; r.b += x[5]; }
    for (const h of p.history) { const k = h.y + ':' + LVC.indexOf(h.lv); const r = rows[k] || (rows[k] = { y: h.y, lv: LVC.indexOf(h.lv), i: 0, o: 0, r: 0, h: 0, f: 0, hs: 0, w: 0, rc: 0, b: 0 }); r.m = (r.m || 0) + 1; }
    return Object.values(rows).sort((a, b) => a.y - b.y || a.lv - b.lv);
  }
  function chartSVG(p, mode) {
    // per season across all levels: bars (runs or wickets) + line (average)
    const by = {};
    for (const x of p.ilog || []) { const b = by[x[0]] || (by[x[0]] = { r: 0, o: 0, w: 0, rc: 0 }); b.r += x[5]; if (x[7]) b.o++; }
    for (const x of p.blog || []) { const b = by[x[0]] || (by[x[0]] = { r: 0, o: 0, w: 0, rc: 0 }); b.w += x[7]; b.rc += x[6]; }
    const ys = Object.keys(by).map(Number).sort((a, b) => a - b);
    if (ys.length < 1) return '<p class="mute small">Play a few matches to see your chart.</p>';
    const bars = ys.map(y => mode === 'bowl' ? by[y].w : by[y].r);
    const line = ys.map(y => mode === 'bowl' ? (by[y].w ? by[y].rc / by[y].w : null) : (by[y].o ? by[y].r / by[y].o : null));
    const Wd = 320, H = 150, pad = 22, bw = Math.min(26, (Wd - pad * 2) / ys.length - 4);
    const maxB = Math.max(1, ...bars), maxL = Math.max(1, ...line.filter(v => v != null)) * 1.15;
    const X = i => pad + (i + 0.5) * (Wd - pad * 2) / ys.length;
    const pts = line.map((v, i) => v == null ? null : [X(i), H - pad - (v / maxL) * (H - pad * 2)]);
    const path = pts.filter(Boolean).map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    return `<svg class="chart" viewBox="0 0 ${Wd} ${H + 14}" role="img" aria-label="${mode === 'bowl' ? 'Wickets' : 'Runs'} per season">
      ${bars.map((v, i) => `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(H - pad - (v / maxB) * (H - pad * 2)).toFixed(1)}" width="${bw.toFixed(1)}" height="${((v / maxB) * (H - pad * 2)).toFixed(1)}" rx="3" class="cb"/>`).join('')}
      <path d="${path}" class="cl"/>${pts.filter(Boolean).map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" class="cd"/>`).join('')}
      ${ys.map((y, i) => ys.length <= 12 || i % 2 === 0 ? `<text x="${X(i).toFixed(1)}" y="${H + 8}" class="ct">${String(y).slice(2)}</text>` : '').join('')}
      <text x="${pad}" y="12" class="ct l">${mode === 'bowl' ? 'wickets' : 'runs'} ▮ · avg ━</text></svg>`;
  }
  const HOW = ['Not out', 'Bowled', 'Caught', 'LBW', 'Stumped', 'Caught & bowled', 'Hit wicket', 'Run out'];
  const MS = { fc50: 'Maiden first-class fifty', fc100: 'Maiden first-class hundred', fc200: 'First-class double hundred', fc5w: 'Maiden first-class five-for', fc1000: '1,000 first-class runs', fc5000: '5,000 first-class runs', fc100w: '100 first-class wickets', fc300w: '300 first-class wickets', t50: 'Maiden Test fifty', t100: 'Maiden Test hundred', t5w: 'Maiden Test five-for', t1000: '1,000 Test runs', t5000: '5,000 Test runs', t10000: '10,000 Test runs', t100w: '100 Test wickets', t300w: '300 Test wickets', t50m: '50 Test caps', t100m: '100 Test caps', 'capt-shield': 'First match as state captain', 'capt-test': 'First Test as Australian captain' };
  TABS.stats = () => {
    const p = me();
    const views = [['season', 'Seasons'], ['splits', 'Splits'], ['records', 'Records'], ['leaders', 'Leaders']];
    const head = `<div class="seg mb">${views.map(([id, l]) => `<button class="${ui.statView === id ? 'on' : ''}" data-a="statview" data-v="${id}">${l}</button>`).join('')}</div>`;
    return head + (STATV[ui.statView] || STATV.season)(p);
  };
  const STATV = {};
  STATV.season = p => {
    const mode = ui.chart || (isBowler(p) ? 'bowl' : 'bat');
    const rows = seasonRows(p).reverse();
    const lvRows = ['test', 'shield', 'county', 'seconds'].filter(l => p.st[l] && p.st[l].m).map(l => ({ l, s: CB.statLine(p.st[l]) }));
    return `<section class="card"><div class="row between mb"><h3>Career arc</h3><div class="seg sm"><button class="${mode === 'bat' ? 'on' : ''}" data-a="chart" data-v="bat">Runs</button><button class="${mode === 'bowl' ? 'on' : ''}" data-a="chart" data-v="bowl">Wickets</button></div></div>${chartSVG(p, mode)}</section>
      ${lvRows.length ? `<section class="card scroll-x"><h3 class="mb">Career</h3><table><tr><th></th><th>M</th><th>Runs</th><th>Avg</th><th>HS</th><th>100</th><th>Wk</th><th>Avg</th><th>BB</th></tr>${lvRows.map(r => `<tr><td>${LV[r.l]}</td><td>${r.s.m}</td><td class="b">${r.s.runs}</td><td>${r.s.avg}</td><td>${r.s.hs}</td><td>${r.s.h100}</td><td class="b">${r.s.w}</td><td>${r.s.bavg}</td><td>${r.s.bb}</td></tr>`).join('')}</table></section>` : ''}
      <section class="card scroll-x"><h3 class="mb">Season by season</h3>${rows.length ? `<table><tr><th>Season</th><th></th><th>M</th><th>Runs</th><th>Avg</th><th>100</th><th>Wk</th><th>Avg</th></tr>${rows.map(r => `<tr><td>${CB.seasonLabel(r.y)}</td><td class="tiny">${LV[LVC[r.lv]]}</td><td>${r.m || '-'}</td><td class="b">${r.r}</td><td>${avg(r.r, r.o)}</td><td>${r.h}</td><td class="b">${r.w}</td><td>${r.w ? (r.rc / r.w).toFixed(1) : '-'}</td></tr>`).join('')}</table>` : '<p class="mute small">Your seasons will build up here.</p>'}</section>`;
  };
  STATV.splits = p => {
    const I = p.ilog || [], B = p.blog || [];
    if (!I.length && !B.length) return '<section class="card"><p class="mute">Splits appear once you have played a few matches.</p></section>';
    const grp = (rows, f) => { const g = {}; for (const x of rows) { const k = f(x); const s = g[k] || (g[k] = { i: 0, o: 0, r: 0, w: 0, rc: 0 }); if (rows === I) { s.i++; if (x[7]) s.o++; s.r += x[5]; } else { s.w += x[7]; s.rc += x[6]; s.i++; } } return g; };
    const ha = grp(I, x => x[3] ? 'Home' : 'Away'), inn = grp(I, x => x[4] <= 1 ? '1st innings' : '2nd innings');
    const vs = grp(I.filter(x => x[1] === 2), x => x[2]), vsB = grp(B.filter(x => x[1] === 2), x => x[2]);
    const outs = new Array(8).fill(0); for (const x of I) outs[x[7]]++;
    const totOut = outs.slice(1).reduce((a, b) => a + b, 0);
    const bh = grp(B, x => x[3] ? 'Home' : 'Away');
    const t = (g, cols) => Object.entries(g).map(([k, s]) => `<tr><td>${esc(teamName(k) || k)}</td>${cols(s)}</tr>`).join('');
    return `${I.length ? `<section class="card"><h3 class="mb">How you get out</h3>${outs.slice(1).map((n, i) => n ? `<div class="hbar"><span>${HOW[i + 1]}</span><i style="width:${(n / Math.max(1, totOut) * 100).toFixed(0)}%"></i><b>${Math.round(n / Math.max(1, totOut) * 100)}%</b></div>` : '').join('')}
      <p class="tiny faint mt">Not out in ${outs[0]} of ${I.length} innings.</p></section>
      <section class="card scroll-x"><h3 class="mb">Batting splits</h3><table><tr><th></th><th>Inns</th><th>Runs</th><th>Avg</th></tr>${t(ha, s => `<td>${s.i}</td><td class="b">${s.r}</td><td>${avg(s.r, s.o)}</td>`)}${t(inn, s => `<td>${s.i}</td><td class="b">${s.r}</td><td>${avg(s.r, s.o)}</td>`)}</table></section>` : ''}
      ${Object.keys(vs).length ? `<section class="card scroll-x"><h3 class="mb">Tests by opponent</h3><table><tr><th></th><th>Inns</th><th>Runs</th><th>Avg</th></tr>${t(vs, s => `<td>${s.i}</td><td class="b">${s.r}</td><td>${avg(s.r, s.o)}</td>`)}</table></section>` : ''}
      ${B.length ? `<section class="card scroll-x"><h3 class="mb">Bowling splits</h3><table><tr><th></th><th>Inns</th><th>Wkts</th><th>Avg</th></tr>${t(bh, s => `<td>${s.i}</td><td class="b">${s.w}</td><td>${s.w ? (s.rc / s.w).toFixed(1) : '-'}</td>`)}${t(vsB, s => `<td>${s.i}</td><td class="b">${s.w}</td><td>${s.w ? (s.rc / s.w).toFixed(1) : '-'}</td>`)}</table></section>` : ''}`;
  };
  STATV.records = p => {
    const I = (p.ilog || []).slice().sort((a, b) => b[5] - a[5] || a[6] - b[6]).slice(0, 6);
    const B = (p.blog || []).slice().sort((a, b) => b[7] - a[7] || a[6] - b[6]).slice(0, 6);
    const ms = Object.entries(p.milestones || {}).sort((a, b) => a[1] - b[1]);
    const capt = p.captRec || {};
    return `<section class="card"><h3 class="mb">Highest scores</h3>${I.length ? I.map(x => `<div class="item row between"><span><b class="num">${x[5]}${x[7] ? '' : '*'}</b> <span class="mute small">(${x[6]}b)</span></span><span class="tiny mute">${LV[LVC[x[1]]]} v ${esc(teamName(x[2]))} · ${CB.seasonLabel(x[0])}</span></div>`).join('') : '<p class="mute small">-</p>'}</section>
      ${B.length && B[0][7] ? `<section class="card"><h3 class="mb">Best bowling</h3>${B.filter(x => x[7]).map(x => `<div class="item row between"><span><b class="num">${x[7]}/${x[6]}</b> <span class="mute small">(${fmtOv(x[5])} ov)</span></span><span class="tiny mute">${LV[LVC[x[1]]]} v ${esc(teamName(x[2]))} · ${CB.seasonLabel(x[0])}</span></div>`).join('')}</section>` : ''}
      ${capt.test || capt.shield ? `<section class="card"><h3 class="mb">As captain</h3>${['test', 'shield'].filter(l => capt[l]).map(l => `<div class="item row between"><span>${LV[l]}</span><span class="num">${capt[l].m} M · ${capt[l].w} W · ${capt[l].l} L · ${capt[l].d} D</span></div>`).join('')}</section>` : ''}
      <section class="card"><h3 class="mb">Milestones</h3>${ms.length ? ms.map(([k, y]) => `<div class="tl"><span class="tl-y">${CB.seasonLabel(y)}</span><span>${esc(MS[k] || k)}</span></div>`).join('') : '<p class="mute small">Your first fifty is waiting.</p>'}
      ${p.potm ? `<div class="tl"><span class="tl-y">⭐</span><span>Player of the match × ${p.potm}</span></div>` : ''}</section>`;
  };
  STATV.leaders = p => {
    const runs = CB.leaders(W, 'shield', 'r', 6), wk = CB.leaders(W, 'shield', 'w', 6);
    const all = CB.allTime(W);
    const tr = all.filter(x => x.tm).sort((a, b) => b.tr - a.tr).slice(0, 8), tw = all.filter(x => x.tm).sort((a, b) => b.tw - a.tw).slice(0, 8);
    const row = (n, u, v, sub) => `<div class="item row between ${u ? 'meitem' : ''}"><span>${u ? '🟢 ' : ''}${esc(n)}</span><span class="num"><b>${v}</b> <span class="tiny mute">${sub || ''}</span></span></div>`;
    return `<section class="card"><h3 class="mb">Shield ${CB.seasonLabel(W.season.year)}: most runs</h3>${runs.length ? runs.map(x => row(x.p.first + ' ' + x.p.last, x.p.user, x.r, 'avg ' + avg(x.r, x.o))).join('') : '<p class="mute small">No Shield games yet this season.</p>'}</section>
      <section class="card"><h3 class="mb">Shield ${CB.seasonLabel(W.season.year)}: most wickets</h3>${wk.length ? wk.filter(x => x.w).map(x => row(x.p.first + ' ' + x.p.last, x.p.user, x.w, 'avg ' + (x.w ? (x.rc / x.w).toFixed(1) : '-'))).join('') : '<p class="mute small">-</p>'}</section>
      <section class="card"><h3 class="mb">Australia, all-time Test runs</h3><p class="tiny faint mb">Everyone who has played in this world since ${W.history.length ? W.history[0].year : W.season.year}.</p>${tr.length ? tr.map(x => row(x.n, x.u, x.tr.toLocaleString(), x.tm + ' Tests · avg ' + avg(x.tr, x.ti))).join('') : '<p class="mute small">-</p>'}</section>
      <section class="card"><h3 class="mb">Australia, all-time Test wickets</h3>${tw.filter(x => x.tw).length ? tw.filter(x => x.tw).map(x => row(x.n, x.u, x.tw, x.tm + ' Tests · avg ' + (x.tw ? (x.trc / x.tw).toFixed(1) : '-'))).join('') : '<p class="mute small">-</p>'}</section>`;
  };

  TABS.season = () => {
    const S = W.season, p = me();
    const lad = Object.entries(S.ladder).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);
    const mine = S.results.filter(r => r.home === p.team || r.away === p.team || r.level === 'test' || r.level === 'county').slice(-14).reverse();
    return `<section class="card scroll-x"><h3 class="mb">Sheffield Shield ladder</h3><table><tr><th></th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>
        ${lad.map(([id, L], i) => `<tr class="${id === p.team ? 'me' : ''}"><td><span class="dot" style="background:${stateOf(id).color}"></span> ${i + 1}. ${stateOf(id).name}</td><td>${L.p}</td><td>${L.w}</td><td>${L.d}</td><td>${L.l}</td><td class="b">${L.pts}</td></tr>`).join('')}</table></section>
      <section class="card"><h3 class="mb">Australia's Tests</h3>${S.series.map(s => `<div class="item row between"><span>${s.home ? 'v' : '@'} ${CB.NATIONS[s.opp].name} <span class="faint small">(${s.tests} Tests)</span></span><span class="num b">${s.res[0]}-${s.res[1]}${s.res[2] ? ' · ' + s.res[2] + 'D' : ''}</span></div>`).join('')}</section>
      <section class="card"><h3 class="mb">Results</h3>${mine.length ? mine.map(r => `<div class="item"><div class="grow"><div class="small">${r.level === 'test' ? 'Test' : r.level === 'county' ? 'County' : r.level === 'shield' ? (r.final ? 'Shield Final' : 'Shield') : '2nd XI'} · ${esc(r.venue || '')}</div>${r.score ? `<div class="tiny mute">${esc(r.score)}</div>` : ''}<div class="tiny">${esc(r.text)}</div></div></div>`).join('') : '<p class="mute small">No results yet.</p>'}</section>
      <section class="card list"><h3 class="mb">Your matches</h3>${p.history.slice(-20).reverse().map(x => `<div class="item"><span class="badge ${x.res === 'W' ? 'win' : x.res === 'L' ? 'loss' : 'draw'}">${x.res}</span><div class="grow"><div class="small"><b>${esc(x.bat || '-')}</b>${x.bowl ? ' · ' + esc(x.bowl) : ''}</div><div class="tiny mute">${LV[x.lv]}${x.final ? ' Final' : ''} v ${esc(teamName(x.vs))} · ${CB.seasonLabel(x.y)}</div></div></div>`).join('') || '<p class="mute small">Your matches will appear here.</p>'}</section>`;
  };

  TABS.locker = () => {
    const p = me(), cap = CB.isCaptain(W, p), pf = p.captPrefs || {};
    const ps = p.traits.map(id => CB.PERKS.find(k => k.id === id)).filter(Boolean);
    const un = CB.getUnlocks();
    const prog = { runmachine: `${p.st.test.h100}/20`, whisperer: `${p.st.test.w}/300`, prodigy: `${p.st.test.f6}/75`, ironman: `${p.st.test.m}/100`, leader: `${((p.captRec || {}).test || {}).m || 0}/25` };
    const seg = (key, opts) => `<div class="seg sm">${opts.map(([v, l]) => `<button class="${(pf[key] || opts[0][0]) === v ? 'on' : ''}" data-a="cpref" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    return `<section class="card ${cap ? 'glow' : ''}"><div class="row between"><h3>Captaincy</h3>${cap ? '<span class="armband lg">C</span>' : ''}</div>
      ${cap ? `<p class="small mute">You lead ${cap === 'test' ? 'Australia' : esc(stateOf(p.team).name)}. Your calls change how the side declares, sets targets and enforces the follow-on.</p>
        <div class="tiny faint mt">When you win the toss</div>${seg('toss', [['auto', 'Read the pitch'], ['bat', 'Bat'], ['bowl', 'Bowl']])}
        <div class="tiny faint mt">Style</div>${seg('style', [['balanced', 'Balanced'], ['attack', 'Attacking'], ['defend', 'Cautious']])}
        <button class="btn ghost block mt" data-a="resign">Give up the captaincy</button>`
      : `<p class="small mute">Not captain. Selectors look for seniority, big numbers at that level and a strong mental game. State sides from 23, Australia from 25.</p>`}</section>
      <section class="card"><h3>Perks <span class="faint small">${ps.length}/5</span></h3>${ps.length ? ps.map(k => `<div class="perkrow"><span class="pi">${k.icon}</span><div><b>${esc(k.name)}</b><div class="small mute">${esc(k.desc)}</div></div></div>`).join('') : '<p class="faint small">None yet. Debuts, maiden hundreds and five-fors unlock picks.</p>'}</section>
      <section class="card"><h3 class="mb">Legacy unlocks</h3>${CB.UNLOCKS.map(u => `<div class="perkrow ${un[u.id] ? '' : 'dim'}"><span class="pi">${un[u.id] ? u.icon : '🔒'}</span><div class="grow"><b>${esc(u.name)}</b><div class="small mute">${esc(u.need)} · this career ${prog[u.id]}</div></div></div>`).join('')}</section>
      <section class="card"><h3>Training combos</h3><p class="mute small">Put points in both areas in one session: both train harder.</p>${CB.COMBOS.map(c => `<span class="combo">${esc(c.name)}: ${c.need.map(k => CB.focusLabel(CB.FOCUS.find(f => f.id === k), p).name).join(' + ')}</span>`).join('')}</section>
      ${(p.lifeLog || []).length ? `<section class="card"><h3 class="mb">Off the field</h3>${p.lifeLog.slice(-8).reverse().map(l => `<div class="tl"><span class="tl-y">${CB.seasonLabel(l.y)}</span><span>${esc(l.t)}: <span class="mute">${esc(l.c)}</span></span></div>`).join('')}</section>` : ''}`;
  };

  // ---- menu
  SCREENS.menu = () => `
    <div class="pagehead"><button class="iconbtn" data-a="hub">←</button><h2>Menu</h2></div>
    <div class="col">
      <button class="btn block" data-a="shelf">🏆 The Shelf</button>
      <button class="btn block" data-a="about2">How it works</button>
      <button class="btn block danger" data-a="retire">Retire now</button>
      <button class="btn block ghost" data-a="to-title">Title screen</button>
    </div>
    <p class="faint small mt2">Progress saves automatically on this device.</p>`;

  // ---- offers between matches
  SCREENS.county = () => {
    const o = pending.countyOffer, p = me();
    return `<div class="center mb"><div class="kicker">The English summer</div><h2>A county wants you</h2></div>
      <div class="card"><p>The Shield season is done and you're not touring with Australia. ${o.counties.length > 1 ? 'Two counties' : 'A county'} want an overseas pro for six County Championship matches: green seamers, Dukes balls and grey skies.</p><p class="small mute">County form counts with the selectors. It's also six more matches of training and key moments.</p></div>
      ${o.counties.map(id => { const c = CB.countyById(id); return `<button class="opt" data-a="county-yes" data-v="${id}"><span class="ic">🏴</span><span class="grow"><b>Sign for ${esc(c.name)}</b><div class="tg">${esc(c.ground)}</div></span></button>`; }).join('')}
      ${bar('<button class="btn ghost" data-a="county-no">Rest up at home instead</button>')}`;
  };
  SCREENS.life = () => {
    const L = pending.life;
    if (L.result) return `<div class="lifecard reveal"><div class="life-ic">${L.icon}</div><div class="kicker">Between matches</div><h2>${esc(L.title)}</h2>${L.result.auto ? `<p class="small mute">⏱️ Time's up. You went with: <b>${esc(L.result.auto)}</b></p>` : ''}<p>${esc(L.result.out)}</p>
      <div class="chips">${L.result.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>
      ${bar(`<button class="btn primary big" data-a="life-done">Continue</button>`)}`;
    if (ui.lifeFor !== L.id) { ui.lifeFor = L.id; ui.lifeEnd = Date.now() + LIFE_SECS * 1000; }
    const gone = Math.min(LIFE_SECS, Math.max(0, LIFE_SECS - (ui.lifeEnd - Date.now()) / 1000));
    return `<div class="lifecard reveal"><div class="life-ic">${L.icon}</div><div class="kicker">Between matches</div><h2>${esc(L.title)}</h2><p>${esc(L.text)}</p>
      <div class="lifetimer" title="Choose before time runs out, or it's chosen for you"><i style="animation-duration:${LIFE_SECS}s;animation-delay:-${gone.toFixed(2)}s"></i></div></div>
      ${L.options.map((o, i) => `<button class="opt" data-a="life-pick" data-v="${i}"><span class="ic letter">${'ABC'[i]}</span><span class="grow"><b>${esc(o)}</b></span></button>`).join('')}`;
  };

  // ---- pre-match
  SCREENS.prematch = () => {
    const L = live, U = L.U, M = U.M, p = me();
    const t0 = M.teams[U.ti], t1 = M.teams[1 - U.ti];
    const pos = U.sides[U.ti].indexOf(p.id) + 1;
    const cond = conditions(M);
    return `
    ${L.skipped.length ? `<div class="card flat"><div class="tiny faint mb">MEANWHILE</div>${L.skipped.slice(-4).map(s => `<div class="small mute">· ${esc(s)}</div>`).join('')}</div>` : ''}
    <div class="card glow reveal">
      <div class="row between">${lvBadge(U.level)}<span class="tiny faint">${esc(CB.slotDate(W, L.slot))}</span></div>
      <div class="vs mt">${esc(t0.name)}<br><span class="mute" style="font-size:16px">v</span> ${esc(t1.name)}</div><div class="mute small mt">${esc(U.cfg.venue || '')}${U.cfg.final ? ' · Sheffield Shield Final' : ''}</div>
    </div>
    ${L.debut ? `<div class="news gold">${U.level === 'test' ? `🧢 Test debut. Cap number ${p.capNo || '?'} is yours.` : U.level === 'county' ? `🏴 County Championship debut for ${esc(t0.name)}.` : `🎉 First-class debut for ${esc(stateOf(p.team).name)}!`}</div>` : ''}
    ${U.captain ? `<div class="news gold">🎖️ You're captain. Toss: ${esc({ auto: 'read the pitch', bat: 'bat first', bowl: 'bowl first' }[(p.captPrefs || {}).toss || 'auto'])} · style: ${esc({ balanced: 'balanced', attack: 'attacking', defend: 'cautious' }[(p.captPrefs || {}).style || 'balanced'])}. ${M.toss.winner === U.ti ? 'You won the toss and chose to ' + (M.toss.bat ? 'bat.' : 'bowl.') : 'You lost the toss.'}</div>` : ''}
    <div class="card"><h3 class="mb">Conditions</h3><div class="row wrap" style="gap:6px">${cond.map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div></div>
    <div class="card"><h3 class="mb">${esc(t0.name)}</h3><div class="xi">${t0.xi.map((x, i) => `<div class="${x.user ? 'mine' : ''}"><span class="n">${i + 1}</span>${esc(x.name)}${i === t0.keeper ? ' †' : ''}${U.cfg.capt && U.cfg.capt[U.ti] === i ? ' (c)' : ''}</div>`).join('')}</div>
    <p class="small faint mt">You're batting at ${pos}.</p></div>
    ${bar('<button class="btn primary big" data-a="play">Start match</button>')}`;
  };
  function conditions(M) {
    const out = [], P = M.pitch;
    if (P.wS > 0.12) out.push('🌀 Dry, turning pitch'); else if (P.wP > 0.08) out.push('🌱 Green seamer'); else if (P.r > 0.06 && P.wP < 0) out.push('🛣️ Flat road'); else out.push('🏏 Good cricket wicket');
    const rain = M.rainLost.reduce((a, b) => a + b, 0);
    out.push(rain > 90 ? '🌧️ Wet week forecast' : rain > 20 ? '🌦️ Showers about' : '☀️ Fine');
    out.push(M.country === 'AUS' ? '📍 Australia' : M.level === 'county' ? '📍 England' : '📍 ' + CB.NATIONS[Object.keys(CB.NATIONS).find(k => CB.NATIONS[k].country === M.country) || 'ENG'].name);
    out.push(`${M.days}-day match`);
    return out;
  }

  // ---- live replay
  SCREENS.live = () => {
    const L = live;
    return `
    <div class="scoreboard" id="sb">${scoreboardHTML()}</div>
    <div class="row between mt"><div class="small mute" id="dayline">${esc(L.dayText || 'Day 1')}</div>
      <div class="speed"><span class="ff" id="ff" title="Fast-forwarding: you're not in the middle">⏩</span><button class="btn ${L.speed === 1 ? 'primary' : ''}" data-a="spd" data-v="1">1×</button><button class="btn ${L.speed === 3 ? 'primary' : ''}" data-a="spd" data-v="3">3×</button><button class="btn" data-a="skip">Skip ⏭</button></div></div>
    <div class="ticker mt" id="ticker">${L.shown.map(tickHTML).join('')}</div>
    ${bar(L.done ? '<button class="btn primary big" data-a="result">Result & scorecard</button>' : '<button class="btn big" disabled>Play in progress…</button>')}
    ${L.momentOpen ? momentHTML() : ''}`;
  };
  function scoreboardHTML() {
    const L = live, M = L.U.M, s = L.sb;
    const lines = [];
    for (let k = 0; k <= s.k && k < M.inns.length; k++) {
      const I = M.inns[k]; const cur = k === s.k;
      const runs = cur ? s.runs : I.runs, wk = cur ? s.wk : I.wk, balls = cur ? s.balls : I.balls;
      const tm = M.teams[I.bat];
      lines.push(`<div class="t ${cur ? '' : 'dim'}"><span>${esc(tm.short || tm.name)}${k >= 2 ? ' (2)' : ''}${I.followOn && k === 2 ? ' f/o' : ''}</span><span class="s num">${runs}${wk < 10 ? '/' + wk : ''}${!cur && I.closed === 'declared' ? 'd' : ''} <span class="mute" style="font-size:15px">${fmtOv(balls)} ov</span></span></div>`);
    }
    const I = M.inns[s.k];
    let sub = '';
    if (I && I.k === 3 && s.k === 3) sub = `Target ${I.target} · need ${Math.max(0, I.target - s.runs)}`;
    else if (I && s.k >= 1) { const lead = leadNow(M, s); sub = lead >= 0 ? `${M.teams[I.bat].short} lead by ${lead}` : `${M.teams[I.bat].short} trail by ${-lead}`; }
    return lines.join('') + (sub ? `<div class="sub">${esc(sub)}</div>` : '') + mineStripHTML();
  }
  // the user's innings / spell in the current innings, live
  function mineStripHTML() {
    const m = live.mine; if (!m) return '';
    let h = '';
    if (m.bat) h += m.bat.out
      ? `<div class="mebat out"><span>☝️ <b>YOU: OUT</b> ${m.bat.runs} (${m.bat.balls})</span><span class="how">${esc(m.bat.how || '')}</span></div>`
      : `<div class="mebat in"><span>🏏 <b>YOU</b> ${m.bat.runs}* (${m.bat.balls})</span><span class="how">batting</span></div>`;
    if (m.bowl && m.bowl.balls) h += `<div class="mebat bowl"><span>🎯 <b>YOU</b> ${fmtOv(m.bowl.balls)}-${m.bowl.runs}-${m.bowl.wk}</span><span class="how">overs-runs-wkts</span></div>`;
    return h;
  }
  function leadNow(M, s) { const I = M.inns[s.k]; let own = s.runs, opp = 0; for (let k = 0; k < s.k; k++) { if (M.inns[k].bat === I.bat) own += M.inns[k].runs; else opp += M.inns[k].runs; } return own - opp; }
  const tickHTML = t => `<div class="tick ${t.cls || ''}">${t.html}</div>`;
  function momentHTML() {
    const mo = live.moments[live.cur], p = me();
    const span = mo.side === 'bat' ? 'innings' : mo.captain ? 'match' : 'spell';
    if (mo.done) {
      const after = mo.fit > 0 ? `You'll play better for the rest of this ${span}.` : mo.fit < 0 ? 'It could cost you.' : 'No edge either way.';
      return `<div class="moment"><div class="sheet"><div class="handle"></div><div class="kicker">Your call</div><h2>${esc(mo.choice || mo.title)}</h2>
      <div class="verdict ${mo.fit > 0 ? 'good' : mo.fit < 0 ? 'bad' : ''}">${esc(mo.verdict || '')}</div>
      <p class="small mute">${after} Momentum: <b style="color:var(--gold)">${esc(CB.focusLabel(CB.FOCUS.find(f => f.id === p.momentum.attr), p).name)}</b> trains ×${CB.hasPerk(p, 'fastlearner') ? 2 : 1.5} next session.</p><button class="btn primary block big mt" data-a="mom-close">Play on</button></div></div>`;
    }
    return `<div class="moment"><div class="sheet"><div class="handle"></div>
      <div class="kicker">${mo.captain ? '🎖️ Captain\'s moment' : mo.bonus ? '🔥 Bonus moment' : '⚡ Key moment'}</div><h2>${esc(mo.title)}</h2><div class="sit">${esc(mo.situation)}</div>
      <p>${esc(mo.text)}</p>
      <div class="cues">${(mo.cues || []).map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div>
      <p class="tiny faint">Read the conditions and the game: the right call lifts you for the rest of this ${span}.</p>
      ${mo.options.map((o, i) => { const f = CB.FOCUS.find(x => x.id === o.a); const lab = CB.focusLabel(f, p); return `<button class="opt" data-a="mom" data-v="${i}"><span class="ic">${lab.icon}</span><span class="grow"><div><b>${esc(o.t)}</b></div><div class="tg">Trains ${esc(lab.name)}</div></span></button>`; }).join('')}
    </div></div>`;
  }

  // timeline of highlights from the simulated match
  function buildTimeline(U, p, moments) {
    const M = U.M, ev = [], meIdx = U.sides[U.ti].indexOf(p.id);
    const nm = (ti, i) => { const x = M.teams[ti].xi[i]; return x.user ? 'You' : x.name; };
    M.inns.forEach((I, k) => {
      const bt = M.teams[I.bat];
      ev.push({ k, html: `<b>${esc(bt.name)}</b> ${k === 3 ? `need ${I.target} to win` : k === 2 && I.followOn ? 'follow on' : 'begin their innings'}`, cls: 'big', sc: { runs: 0, wk: 0, balls: 0 } });
      const runs = new Array(11).fill(0);
      const marks = (I.dayMarks || []).slice();
      let arrived = false, bowled = false, lastMyB = -99;
      let lastSc = { runs: 0, wk: 0, balls: 0 };
      // the user's own innings / spell, snapshotted onto every event for the scoreboard strip
      const mine = { bat: null, bowl: null };
      // inv: the user is in the middle (batting, or in a bowling spell); everything else plays at triple speed
      const push = e => { e.mine = { bat: mine.bat && { ...mine.bat }, bowl: mine.bowl && { ...mine.bowl } }; e.inv = I.bat === U.ti ? !!(mine.bat && !mine.bat.out) : (e.sc ? e.sc.balls : 0) - lastMyB <= 12; ev.push(e); };
      I.log.forEach((L, i) => {
        while (marks.length && marks[0].at === i) { const m = marks.shift(); push({ k, html: `Stumps, day ${m.day}: ${esc(bt.short || bt.name)} ${lastSc.runs}/${lastSc.wk}`, cls: 'day', sc: lastSc, day: m.day + 1 }); }
        const sc = { runs: L.sc, wk: L.wk, balls: L.b };
        moments.forEach((mo, mi) => { if (mo.inns === k && mo.at === i) push({ k, moment: true, mi, sc: lastSc }); });
        const sIsMe = I.bat === U.ti && L.s === meIdx, bIsMe = I.fld === U.ti && L.bw === meIdx;
        if (bIsMe) lastMyB = L.b;
        if (!arrived && I.bat === U.ti && (L.s === meIdx || L.n === meIdx)) { arrived = true; mine.bat = { runs: 0, balls: 0, out: false }; push({ k, html: `🏏 <b>You walk out</b> at ${esc(bt.short)} ${L.sc - (L.r || 0)}/${L.wk}`, cls: 'me', sc }); }
        if (!bowled && bIsMe) { bowled = true; mine.bowl = { balls: 0, runs: 0, wk: 0 }; push({ k, html: `🎯 <b>You're on</b> to bowl · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: 'me', sc }); }
        if (sIsMe && mine.bat && L.w !== 'wd') { if (L.w !== 'nb') mine.bat.balls++; if (typeof L.w === 'number' || L.w === 'nb') mine.bat.runs += L.r; }
        if (bIsMe && mine.bowl) { if (L.w !== 'wd' && L.w !== 'nb') mine.bowl.balls++; if (typeof L.w === 'number' || L.w === 'nb' || L.w === 'wd') mine.bowl.runs += L.r + (L.w === 'nb' ? 1 : 0); }
        if (typeof L.w === 'number' || L.w === 'nb') {
          const before = runs[L.s]; runs[L.s] += L.r;
          for (const ms of [50, 100, 150, 200, 250, 300]) if (before < ms && runs[L.s] >= ms) push({ k, html: `${sIsMe ? '🎉 <b>' + (ms === 100 ? 'HUNDRED!' : ms + '!') + '</b> You' : '<b>' + ms + '</b> for ' + esc(nm(I.bat, L.s))} ${sIsMe ? 'raise the bat' : ''} · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: sIsMe ? 'me ms' : 'ms', sc, big: sIsMe && ms >= 100 });
          if (sIsMe && (L.r === 4 || L.r === 6)) push({ k, html: `${L.r === 6 ? '💥 SIX' : 'FOUR'} off ${esc(nm(I.fld, L.bw))}`, cls: 'me', sc, fast: true });
        }
        if (L.w === 'drop' && (sIsMe || (I.fld === U.ti && L.x && L.x.fielder === meIdx))) push({ k, html: sIsMe ? '😮‍💨 Dropped! You survive.' : '😬 You put down a chance.', cls: 'me', sc });
        if (L.w === 'W') {
          const out = L.x.out, b = I.bats[out], how = CB.dismissalText(M, I, b);
          const isMe = I.bat === U.ti && out === meIdx;
          if (isMe) {
            // the user's own dismissal: its own loud card, never confused with a wicket the user took
            mine.bat.out = true; mine.bat.how = how; mine.bat.runs = b.runs; mine.bat.balls = b.balls;
            const head = b.runs === 0 ? '🦆 OUT FOR A DUCK' : b.runs >= 100 ? '☝️ OUT, WHAT A KNOCK' : '☝️ YOU\'RE OUT';
            push({ k, html: `<div class="oh">${head}</div><div><b>${b.runs}</b> off ${b.balls} balls · ${esc(how)}</div><div class="tiny mute">${esc(bt.short)} ${L.sc}/${L.wk}</div>`, cls: 'out', sc, meOut: true });
          } else {
            const mineW = bIsMe && b.out.kind !== 7;
            if (mineW) mine.bowl.wk++;
            push({ k, html: `${mineW ? '🎯 <b>YOUR WICKET</b>' : '<b>WICKET</b>'} ${esc(nm(I.bat, out))} ${esc(how)} ${b.runs} (${b.balls}) · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: mineW ? 'mew' : 'w', sc });
          }
        }
        lastSc = sc;
      });
      const endTxt = I.closed === 'allout' ? `${esc(bt.name)} all out for ${I.runs}` : I.closed === 'declared' ? `${esc(bt.name)} declare at ${I.runs}/${I.wk}` : I.closed === 'target' ? `${esc(bt.name)} reach the target` : `${esc(bt.name)} ${I.runs}/${I.wk} when play ends`;
      const endSc = { runs: I.runs, wk: I.wk, balls: I.balls };
      if (mine.bat && !mine.bat.out) push({ k, html: `✅ <b>Not out.</b> You finish ${mine.bat.runs}* off ${mine.bat.balls} balls`, cls: 'me', sc: endSc });
      push({ k, html: endTxt + ` (${fmtOv(I.balls)} ov)`, cls: 'big', sc: endSc, end: true });
    });
    ev.push({ k: M.inns.length - 1, html: `🏁 <b>${esc(M.result.text)}</b>`, cls: 'big ms', sc: { runs: M.inns[M.inns.length - 1].runs, wk: M.inns[M.inns.length - 1].wk, balls: M.inns[M.inns.length - 1].balls }, final: true });
    return ev;
  }
  function stepLive() {
    const L = live; if (!L || L.done || L.momentOpen || L.paused) return;
    const e = L.events[L.ei++];
    if (!e) { L.done = true; render(); return; }
    L.sb = { k: e.k, ...e.sc }; L.mine = e.mine || null;
    if (e.day) L.dayText = 'Day ' + e.day;
    if (e.moment) { L.cur = e.mi; L.momentOpen = true; render(); return; }
    L.shown.push(e);
    const tk = document.getElementById('ticker');
    if (tk) { tk.insertAdjacentHTML('beforeend', tickHTML(e)); tk.scrollTop = tk.scrollHeight; }
    const sb = document.getElementById('sb'); if (sb) sb.innerHTML = scoreboardHTML();
    const dl = document.getElementById('dayline'); if (dl) dl.textContent = L.dayText || 'Day 1';
    if (e.big) confetti();
    if (e.meOut) {
      if (sb) { sb.classList.remove('flash-out'); void sb.offsetWidth; sb.classList.add('flash-out'); }
      buzz([120, 60, 220]);
    }
    if (e.final) { L.done = true; render(); return; }
    const base = e.meOut ? 1900 : e.fast ? 140 : e.cls === 'w' || e.cls === 'mew' ? 620 : e.cls === 'day' ? 700 : 380;
    // 3x whenever you're not batting or bowling
    const nx = L.events[L.ei], inv = e.inv || e.meOut || e.big || e.cls === 'mew' || (nx && (nx.inv || nx.moment)), mult = inv ? 1 : 3;
    const ff = document.getElementById('ff'); if (ff) ff.classList.toggle('on', mult > 1);
    L.timer = setTimeout(stepLive, base / (L.speed * mult));
  }

  // ---- result
  SCREENS.result = () => {
    const L = live, U = L.U, M = U.M, p = me();
    const won = M.result.winner === U.ti, drew = M.result.draw || M.result.tie;
    const lines = L.post.lines;
    const bat = lines.bat.map(b => `${b.runs}${b.out ? '' : '*'} <span class="mute small">(${b.balls})</span>`).join(' & ') || '<span class="mute">DNB</span>';
    const bowl = lines.bowl.filter(b => b.balls).map(b => `${b.wk}/${b.runs} <span class="mute small">(${fmtOv(b.balls)})</span>`).join(' & ') || '<span class="mute">-</span>';
    const meIdx = U.sides[U.ti].indexOf(p.id);
    const hows = M.inns.filter(I => I.bat === U.ti && I.bats[meIdx] && I.bats[meIdx].in).map(I => {
      const b = I.bats[meIdx];
      return `<div class="tiny ${b.out ? 'howout' : 'hownot'}">${b.out ? '☝️ ' + esc(CB.dismissalText(M, I, b)) : '✅ not out'}</div>`;
    }).join('');
    const potm = M.potm ? M.teams[M.potm.team].xi[M.potm.idx] : null;
    return `
    <div class="card result-banner reveal ${drew ? '' : won ? 'won' : 'lost'}">
      <span class="badge ${drew ? 'draw' : won ? 'win' : 'loss'}">${drew ? 'Draw' : won ? 'Win' : 'Loss'}</span>
      <div class="big mt">${esc(M.result.text)}</div>
      <div class="mute small mt">${esc(CB.scoreLine(M))}</div>
    </div>
    <div class="perf"><div class="p"><div class="tiny faint">BATTING</div><div class="v num">${bat}</div>${hows}</div><div class="p"><div class="tiny faint">BOWLING</div><div class="v num">${bowl}</div></div></div>
    ${L.moments.map(mo => `<div class="news blue mt"><b>${mo.captain ? '🎖️' : mo.bonus ? '🔥' : '⚡'} ${esc(mo.title)}</b>${mo.choice ? ' · you chose: ' + esc(mo.choice) : ''}${mo.verdict ? `<div class="small">${esc(mo.verdict)}</div>` : ''}<div class="small mute">${esc(mo.after || '')}</div></div>`).join('')}
    ${potm ? `<div class="news gold mt">⭐ Player of the match: <b>${potm.user ? 'YOU' : esc(potm.name)}</b></div>` : ''}
    ${L.post.ev.filter(e => e.type === 'milestone').map(e => `<div class="news gold">🏅 ${esc(e.text)}</div>`).join('')}
    ${L.post.ev.filter(e => e.type === 'energy').map(e => `<div class="news gold">⚡ ${esc(e.text)}</div>`).join('')}
    <div class="sec-title">Scorecard</div>
    <div class="seg mb">${M.inns.map((I, i) => `<button class="${ui.scTab === i ? 'on' : ''}" data-a="sctab" data-v="${i}">${esc(M.teams[I.bat].short || M.teams[I.bat].name)} ${i >= 2 ? '2nd' : '1st'}</button>`).join('')}</div>
    ${scorecardHTML(M, M.inns[ui.scTab] || M.inns[0])}
    ${bar('<button class="btn primary big" data-a="train">Training ▶</button>')}`;
  };
  function scorecardHTML(M, I) {
    if (!I) return '';
    const bt = M.teams[I.bat], ft = M.teams[I.fld];
    const bats = I.bats.map((b, i) => ({ b, x: bt.xi[i] })).filter(o => o.b.in);
    const dnb = I.bats.map((b, i) => ({ b, x: bt.xi[i] })).filter(o => !o.b.in);
    const ex = I.ex.b + I.ex.lb + I.ex.w + I.ex.nb;
    return `<div class="card scroll-x"><table>
      <tr><th>${esc(bt.name)}</th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr>
      ${bats.map(o => `<tr class="${o.x.user ? 'me' : ''}"><td>${esc(o.x.name)}${o.x === bt.xi[bt.keeper] ? ' †' : ''}<span class="how">${esc(CB.dismissalText(M, I, o.b))}</span></td><td class="b">${o.b.runs}</td><td>${o.b.balls}</td><td>${o.b.f4}</td><td>${o.b.f6}</td></tr>`).join('')}
      <tr><td>Extras <span class="how">b ${I.ex.b}, lb ${I.ex.lb}, w ${I.ex.w}, nb ${I.ex.nb}</span></td><td>${ex}</td><td></td><td></td><td></td></tr>
      <tr class="tot"><td>Total <span class="how">${fmtOv(I.balls)} overs${I.closed === 'declared' ? ', declared' : ''}</span></td><td>${I.runs}${I.wk < 10 ? '/' + I.wk : ''}</td><td></td><td></td><td></td></tr>
    </table>
    ${dnb.length ? `<div class="tiny faint mt">Did not bat: ${dnb.map(o => esc(o.x.name)).join(', ')}</div>` : ''}
    ${I.fow.length ? `<div class="tiny faint mt">FoW: ${I.fow.map(f => `${f.runs}-${f.wk}`).join(', ')}</div>` : ''}
    <table class="mt"><tr><th>${esc(ft.name)}</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>
      ${I.bowl.map((b, i) => ({ b, x: ft.xi[i] })).filter(o => o.b.balls).map(o => `<tr class="${o.x.user ? 'me' : ''}"><td>${esc(o.x.name)}</td><td>${fmtOv(o.b.balls)}</td><td>${o.b.md}</td><td>${o.b.runs}</td><td class="b">${o.b.wk}</td><td>${(o.b.runs / o.b.balls * 6).toFixed(2)}</td></tr>`).join('')}
    </table></div>`;
  }

  // ---- training
  SCREENS.train = () => {
    const p = me(), T = pending.train;
    const used = Object.values(T.alloc).reduce((a, b) => a + b, 0), left = T.energy - used;
    const combos = CB.activeCombos(T.alloc).map(c => c.id);
    const groups = [['bat', 'Batting'], ['bowl', 'Bowling'], ['gen', 'Body & mind']];
    const card = f => {
      const lab = CB.focusLabel(f, p), n = T.alloc[f.id] || 0, mom = p.momentum && p.momentum.attr === f.id;
      return `<div class="focus ${n ? 'on' : ''} ${mom ? 'mom' : ''}">${mom ? '<span class="mtag">MOMENTUM</span>' : ''}<div class="top"><span class="ic">${lab.icon}</span><span>${esc(lab.name)}</span></div>
        <div class="ctl"><button data-a="tminus" data-v="${f.id}" ${n ? '' : 'disabled'} aria-label="Remove a point">−</button><span class="cnt num">${n}</span><button class="plus" data-a="tplus" data-v="${f.id}" ${left ? '' : 'disabled'} aria-label="Add a point">+</button></div></div>`;
    };
    return `
    <div class="row between mb"><div><h2>Training</h2><div class="mute small">${esc(T.reason)}</div></div><div class="energy">${Array.from({ length: T.energy }, (_, i) => `<span class="pip ${i < left ? 'full' : ''}"></span>`).join('')}</div></div>
    ${p.momentum ? `<div class="news gold small">⚡ Momentum from your key moment: <b>${esc(CB.focusLabel(CB.FOCUS.find(f => f.id === p.momentum.attr), p).name)}</b> trains ×${CB.hasPerk(p, 'fastlearner') ? 2 : 1.5}.</div>` : ''}
    <div class="mt">${CB.COMBOS.map(c => `<span class="combo ${combos.includes(c.id) ? 'lit' : ''}">🃏 ${esc(c.name)}</span>`).join('')}</div>
    ${groups.map(([g, title]) => `<div class="fgroup">${title}</div><div class="fgrid">${CB.FOCUS.filter(f => f.group === g).map(card).join('')}</div>`).join('')}
    <p class="faint small mt">Gains are hidden. Your coach will tell you when something clicks. Repeating one area gives diminishing returns; age slows everything.</p>
    ${bar(`<button class="btn ghost" data-a="tauto" title="Spread points sensibly">Auto</button><button class="btn primary big" data-a="tdone" ${left ? 'disabled' : ''}>${left ? left + ' energy left' : 'Train'}</button>`)}`;
  };

  // ---- post-match news
  SCREENS.post = () => {
    const P = pending.post, p = me();
    const nextA = pending.life ? 'life' : p.perkOffer ? 'perk' : 'hub';
    return `
    <h2 class="mb">After the match</h2>
    ${P.note ? `<div class="news">${esc(P.note)}</div>` : ''}
    ${P.combos && P.combos.length ? `<div class="news blue">🃏 Combo${P.combos.length > 1 ? 's' : ''}: ${P.combos.map(esc).join(', ')}</div>` : ''}
    ${P.items.map(i => `<div class="news ${i.cls || ''}">${i.html}</div>`).join('')}
    ${bar(`<button class="btn primary big" data-a="${nextA}">${nextA === 'life' ? 'Between matches ▶' : nextA === 'perk' ? 'Choose a perk ▶' : 'Continue'}</button>`)}`;
  };

  // ---- perk choice
  SCREENS.perk = () => {
    const p = me();
    pending = pending || {};
    if (!pending.perkChoices) { pending.perkChoices = CB.perkChoices(W, p).map(k => k.id); save(); }
    const ch = pending.perkChoices.map(id => CB.PERKS.find(k => k.id === id));
    const full = p.traits.length >= 5;
    return `
    <div class="center mb"><div class="kicker" style="color:var(--violet)">Pick one</div><h2>A new perk</h2><p class="mute small">${full ? 'All five slots are full. Picking one replaces your oldest perk.' : `Slot ${p.traits.length + 1} of 5.`}</p></div>
    <div class="perks">${ch.map((k, i) => `<button class="perk flip" style="animation-delay:${i * 0.12}s" data-a="pickperk" data-v="${k.id}"><span class="ic">${k.icon}</span><span><div class="n">${esc(k.name)}</div><div class="small mute">${esc(k.desc)}</div></span></button>`).join('')}</div>
    ${bar('<button class="btn ghost" data-a="skipperk">Skip</button>')}`;
  };

  // ---- season end
  SCREENS.season = () => {
    const S = W.season, p = me();
    const lad = Object.entries(S.ladder).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);
    const rows = seasonRows(p).filter(r => r.y === S.year);
    return `
    <div class="center mb"><div class="kicker" style="color:var(--gold)">Season ${CB.seasonLabel(S.year)}</div><h2>Season review</h2></div>
    <div class="card"><h3 class="mb">Your season</h3>${rows.length ? rows.map(r => `<div class="item row between"><span>${lvBadge(LVC[r.lv])} ${r.m || 0} match${r.m === 1 ? '' : 'es'}</span><span class="num small">${r.r} runs @ ${avg(r.r, r.o)}${r.w ? ' · ' + r.w + ' wkts' : ''}</span></div>`).join('') : '<p class="mute">You didn\'t get a game this season.</p>'}</div>
    <div class="card"><h3 class="mb">Sheffield Shield</h3><p class="small">🏆 Champions: <b>${S.champion ? stateOf(S.champion).name : '-'}</b></p><table><tr><th></th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>${lad.map(([id, L], i) => `<tr class="${id === p.team ? 'me' : ''}"><td>${i + 1}. ${stateOf(id).name}</td><td>${L.w}</td><td>${L.d}</td><td>${L.l}</td><td class="b">${L.pts}</td></tr>`).join('')}</table></div>
    <div class="card"><h3 class="mb">Australia's Tests</h3>${S.series.map(s => `<div class="item row between"><span>${s.home ? 'v' : '@'} ${CB.NATIONS[s.opp].name}</span><span class="num b">${s.res[0]}-${s.res[1]}${s.res[2] ? ' (' + s.res[2] + 'D)' : ''}</span></div>`).join('')}</div>
    ${bar('<button class="btn gold big" data-a="next-season">Next season ▶</button>')}`;
  };

  // ---- shelf
  SCREENS.shelf = () => {
    const s = getShelf();
    if (ui.shelfOpen != null && s[ui.shelfOpen]) return shelfEntryHTML(s[ui.shelfOpen], false);
    return `
    <div class="pagehead"><button class="iconbtn" data-a="${W && me() ? 'hub' : 'back-title'}">←</button><h2>The Shelf</h2></div>
    ${s.length ? `<div class="shelf">${s.map((e, i) => `<div class="pcard r${e.legacy.rank}" data-a="openshelf" data-v="${i}"><div><div class="l">${esc(e.legacy.label)}</div><div class="n mt">${esc(e.name)}</div><div class="tiny mute">${esc(e.years)} · ${esc(stateOf(e.state) ? stateOf(e.state).id : '')}</div></div><div class="small num">${e.test.m ? `${e.test.m} Tests` : e.shield.m ? `${e.shield.m} Shield` : `${e.seconds.m} 2nd XI`}<br><span class="mute">${(() => { const s = e.test.m ? e.test : e.shield.m ? e.shield : e.seconds, bowler = e.role === 'pace' || e.role === 'spin'; return bowler ? s.w + ' wkts' + (e.test.m ? ' @ ' + s.bavg : '') : s.runs + (e.test.m ? ' @ ' + s.avg : ' runs'); })()}</span></div></div>`).join('')}</div>` : '<div class="card"><p class="mute">No careers yet. Every finished career gets a spot here, with a bio and your hidden ratings revealed.</p></div>'}`;
  };
  function shelfEntryHTML(e, fresh) {
    const row = (l, s) => s && s.m ? `<tr><td>${l}</td><td>${s.m}</td><td class="b">${s.runs}</td><td>${s.avg}</td><td>${s.hs}</td><td>${s.h100}</td><td class="b">${s.w}</td><td>${s.bavg}</td><td>${s.bb}</td></tr>` : '';
    const leg = e.legacyPerk && CB.UNLOCKS.find(u => u.id === e.legacyPerk);
    return `
    ${fresh ? '' : `<div class="pagehead"><button class="iconbtn" data-a="closeshelf">←</button><h2>The Shelf</h2></div>`}
    <div class="card pcard r${e.legacy.rank} flip" style="min-height:0;cursor:default"><div class="l">${esc(e.legacy.label)}</div><div class="n" style="font-size:38px;margin-top:6px">${esc(e.name)}</div><div class="mute small">${esc(e.years)} · ${e.role === 'pace' || e.role === 'spin' ? CB.SUB_INFO[e.sub] : CB.ROLE_INFO[e.role].label} · ${esc(stateOf(e.state).name)}${e.capNo ? ' · Test cap ' + e.capNo : ''}</div>${leg ? `<div class="chip mt">${leg.icon} ${esc(leg.name)}</div>` : ''}</div>
    <div class="card"><p class="bio">${esc(e.bio)}</p></div>
    <div class="card scroll-x"><table><tr><th></th><th>M</th><th>Runs</th><th>Avg</th><th>HS</th><th>100</th><th>Wk</th><th>Avg</th><th>BB</th></tr>${row('Tests', e.test)}${row('Shield', e.shield)}${row('County', e.county)}${row('2nd XI', e.seconds)}</table></div>
    ${e.capt && (e.capt.test || e.capt.shield) ? `<div class="card"><h3 class="mb">Captaincy</h3>${['test', 'shield'].filter(l => e.capt[l]).map(l => `<div class="item row between"><span>${LV[l]}</span><span class="num">${e.capt[l].m} M · ${e.capt[l].w}W ${e.capt[l].l}L ${e.capt[l].d}D</span></div>`).join('')}</div>` : ''}
    <div class="card"><h3 class="mb">Hidden ratings, revealed</h3><div class="hidden-reveal">
      <div class="stat"><div class="v">${e.hidden.bat}</div><div class="k">Peak batting</div></div>
      <div class="stat"><div class="v">${e.hidden.bowl == null ? '-' : e.hidden.bowl}</div><div class="k">Peak bowling</div></div>
      <div class="stat"><div class="v">${{ club: 'C', journeyman: 'B-', regular: 'B', fringe: 'B+', test: 'A', star: 'A+', great: 'S' }[e.tier] || '?'}</div><div class="k">Talent grade</div></div></div>
      <p class="tiny faint mt">50 = an average Shield regular. 56 ~ average Test top-order. 70+ is greatness.</p></div>
    ${e.traits.length ? `<div class="card"><h3 class="mb">Perks</h3>${e.traits.map(id => { const k = CB.PERKS.find(x => x.id === id); return k ? `<span class="trait">${k.icon} ${esc(k.name)}</span>` : ''; }).join('')}</div>` : ''}
    ${fresh ? bar('<button class="btn ghost" data-a="shelf">The Shelf</button><button class="btn primary big" data-a="new">New career</button>') : ''}`;
  }
  SCREENS.retired = () => shelfEntryHTML(pending.entry, true);

  // ---------------------------------------------------------------- flow
  // The user's match is simulated but not committed until its key moment is settled: the call re-runs the match from
  // that ball (same seed, so everything before it is identical). Until then nothing is saved; leaving mid-replay
  // returns to the last save and the same match plays again.
  function startLive(res, skipped) {
    const p = me();
    const U = res.user;
    const debut = !p.debut[U.level] && U.level !== 'seconds';
    const moment = CB.findMoment(U, p), moments = moment ? [moment] : [];
    live = { U, slot: res.slot, moments, calls: [], cur: 0, events: buildTimeline(U, p, moments), ei: 0, shown: [], speed: 1, sb: { k: 0, runs: 0, wk: 0, balls: 0 }, done: false, momentOpen: false, skipped, debut, final: false };
    ui.scTab = 0;
    if (res.lostCaptaincy) skipped.push('Dropped from the Test side, you lose the captaincy.');
    if (!moment) finalizeLive();
    go('prematch');
  }
  function finalizeLive() {
    const p = me(), L = live;
    CB.commitUserMatch(W, L.U);
    L.post = CB.userPostMatch(W, L.U);
    L.final = true;
    for (const mo of L.moments) mo.after = CB.momentAfter(L.U, mo, p);
    pending = { stage: 'train', train: { energy: CB.energyFor(p, p.lastMatch), alloc: {}, reason: reasonText(p) }, post: { items: postItems(L.post), note: null }, moment: L.momAttr ? { attr: L.momAttr } : null };
    save();
  }
  function reasonText(p) {
    const e = CB.energyFor(p, p.lastMatch);
    const bits = [];
    if (CB.hasPerk(p, 'netrat') && p.lastMatch && p.lastMatch.quiet) bits.push('Net Rat +1');
    if (CB.hasPerk(p, 'coachspet')) bits.push("Coach's Pet +1");
    if (p.energyBonus > 0) bits.push('bonus +' + p.energyBonus); else if (p.energyBonus < 0) bits.push('drained ' + p.energyBonus);
    if (p.lastMatch && p.lastMatch.ton) bits.push((p.lastMatch.ton > 1 ? 'Double hundred' : 'Hundred') + ' +' + p.lastMatch.ton);
    if (p.lastMatch && p.lastMatch.five) bits.push((p.lastMatch.five > 1 ? 'Ten-for' : 'Five-for') + ' +' + p.lastMatch.five);
    if (p.lastMatch && p.lastMatch.overs >= 45 && !p.lastMatch.five) bits.push('Heavy workload -1');
    return `${e} energy${bits.length ? ' · ' + bits.join(', ') : ''}`;
  }
  function postItems(post) {
    const p = me(), items = [];
    for (const e of post.ev) {
      if (e.type === 'debut') items.push({ cls: 'gold', html: e.level === 'test' ? `🧢 <b>Test debut!</b> You're Australian Test cricketer number ${p.capNo || '?'}.` : e.level === 'county' ? `🏴 <b>County debut.</b> An overseas pro in England.` : `🎉 <b>First-class debut</b> for ${esc(stateOf(p.team).name)}.` });
      if (e.type === 'milestone') items.push({ cls: 'gold', html: `🏅 ${esc(e.text)}` });
      if (e.type === 'potm') items.push({ cls: 'gold', html: '⭐ Player of the match.' });
      if (e.type === 'energy') items.push({ cls: 'gold', html: '⚡ <b>' + esc(e.text) + '</b>' });
      if (e.type === 'injury') items.push({ cls: 'red', html: `🩹 Injury: ${esc(e.name)}. Out for ${e.len} game${e.len > 1 ? 's' : ''}.` });
      if (e.type === 'unlock') items.push({ cls: 'gold', party: true, html: `👑 <b>LEGACY UNLOCKED: ${esc(e.u.name)}</b><br><span class="small">${esc(e.u.desc)} Available for your next career.</span>` });
    }
    return items;
  }
  function advance() {
    const p = me();
    const skipped = (pending && pending.skipped) || [];
    for (let guard = 0; guard < 60; guard++) {
      const S = W.season;
      if (S.cursor >= S.slots.length) { save(); go('season'); return; }
      const co = CB.countyOfferDue(W);
      if (co) { pending = { countyOffer: co, skipped }; save(); go('county'); return; }
      const res = CB.playSlot(W, { defer: true });
      if (res.user) { startLive(res, skipped); return; }
      // summarise a slot without us
      const slot = res.slot;
      if (res.lostCaptaincy) skipped.push('Dropped from the Test side, you lose the captaincy.');
      const why = p.inj > 0 ? 'injured' : slot.type === 'test' ? 'not in the Test XI' : '';
      if (slot.type === 'test') { const r = res.results[0]; skipped.push(`${r.text} (${CB.NATIONS[r.away].name} Test ${r.no})${why ? ' · you: ' + why : ''}`); }
      else if (slot.type === 'county') skipped.push(`County: ${res.results[0].text}`);
      else { const r = res.results.find(x => x.level === 'shield' && (x.home === p.team || x.away === p.team)); if (r) skipped.push(`Shield: ${r.text}${p.inj > 0 ? ' · you: injured' : ' · you: on Test duty'}`); else if (slot.type === 'final') skipped.push(`Shield Final: ${res.results[0].text}`); }
    }
    save(); go('hub', 'home');
  }
  function finishCareer(ended) {
    const entry = CB.shelfEntry(W, ended);
    entry.legacyPerk = me().legacy || null;
    addShelf(entry);
    wipeSave();
    pending = { entry };
    W = null;
    go('retired');
    confetti();
  }

  // ---------------------------------------------------------------- actions
  const ACT = {
    'continue': () => { if (load()) { if (pending && pending.stage === 'train' && pending.train) go('train'); else if (pending && pending.life && !pending.life.result) go('life'); else go('hub', 'home'); } else go('title'); },
    'new': () => {
      if (hasSave() && !confirm('Start a new career? Your current one will be lost (it will not go on the Shelf).')) return;
      const r = CB.rng((Math.random() * 1e9) >>> 0); const n = CB.genName(r, 'AUS');
      ui.create = { first: n.first, last: n.last, state: CB.STATES[Math.floor(Math.random() * 6)].id, role: null, sub: null, hand: 'R', legacy: '' };
      go('create');
    },
    'legacy': () => go('legacy'),
    'rname': () => { readNames(); const r = CB.rng((Math.random() * 1e9) >>> 0); const n = CB.genName(r, 'AUS'); ui.create.first = n.first; ui.create.last = n.last; render(); },
    'cstate': d => { readNames(); ui.create.state = d.v; render(); },
    'crole': d => { readNames(); ui.create.role = d.v; if (d.v !== 'ar' && d.v !== 'bowl') ui.create.sub = null; render(); },
    'csub': d => { readNames(); ui.create.sub = d.v; render(); },
    'chand': d => { readNames(); ui.create.hand = d.v; render(); },
    'clegacy': d => { readNames(); ui.create.legacy = d.v; render(); },
    'sign': () => {
      readNames();
      const c = ui.create;
      const role = c.role === 'bowl' ? (c.sub === 'finger' || c.sub === 'wrist' ? 'spin' : 'pace') : c.role;
      W = CB.newWorld((Math.random() * 4294967295) >>> 0, 2026);
      CB.createUser(W, { first: (c.first || 'Sam').trim(), last: (c.last || 'Smith').trim(), state: c.state, role, sub: c.sub, hand: c.hand, legacy: c.legacy || null });
      pending = null; save(); go('scout');
    },
    'hub': () => { if (pending && (pending.stage === 'train' || pending.stage === 'post')) pending = null; save(); go('hub', 'home'); },
    'tab': d => go('hub', d.v),
    'statview': d => { ui.statView = d.v; render(); },
    'chart': d => { ui.chart = d.v; render(); },
    'menu': () => go('menu'),
    'about': () => go('about'), 'about2': () => go('about'),
    'back-title': () => go('title'), 'to-title': () => { save(); go('title'); },
    'shelf': () => { ui.shelfOpen = null; go('shelf'); },
    'openshelf': d => { ui.shelfOpen = +d.v; render(); window.scrollTo(0, 0); },
    'closeshelf': () => { ui.shelfOpen = null; render(); },
    'next': () => withLoading(advance),
    'capt-yes': d => { const o = W.offers.find(x => x.type === 'captain' && x.level === d.v); if (o) { CB.acceptCaptaincy(W, o, true); toast(d.v === 'test' ? 'Captain of Australia.' : 'You have the armband.'); buzz(30); confetti(); } save(); render(); },
    'capt-no': d => { const o = W.offers.find(x => x.type === 'captain' && x.level === d.v); if (o) CB.acceptCaptaincy(W, o, false); save(); render(); },
    'cpref': d => { const p = me(); p.captPrefs = p.captPrefs || {}; p.captPrefs[d.k] = d.v; save(); render(); },
    'resign': () => { const p = me(); if (!confirm('Give up the captaincy?')) return; if (W.aus.captain === p.id) W.aus.captain = null; if (W.states[p.team].captain === p.id) W.states[p.team].captain = null; p.declinedCaptain = true; p.declinedTestCaptain = true; save(); render(); },
    'county-yes': d => { CB.startCounty(W, d.v); toast(`Signed for ${CB.countyById(d.v).name}`); const sk = pending.skipped; pending = { skipped: sk }; save(); withLoading(advance); },
    'county-no': () => { const sk = pending.skipped; pending = { skipped: sk }; save(); withLoading(advance); },
    'play': () => { go('live'); live.timer = setTimeout(stepLive, 400); },
    'spd': d => { live.speed = +d.v; render(); if (!live.done && !live.momentOpen) { clearTimeout(live.timer); live.timer = setTimeout(stepLive, 200); } },
    'skip': () => {
      clearTimeout(live.timer);
      // fast-forward to the moment (if still to come), else to the end
      while (live.ei < live.events.length) {
        const e = live.events[live.ei];
        if (e.moment && !live.moments[e.mi].done) { live.ei++; live.sb = { k: e.k, ...e.sc }; live.mine = e.mine || null; live.cur = e.mi; live.momentOpen = true; break; }
        live.ei++; if (!e.moment) live.shown.push(e); live.sb = { k: e.k, ...e.sc }; live.mine = e.mine || null;
        if (e.final) { live.done = true; }
      }
      if (live.ei >= live.events.length) live.done = true;
      render();
      requestAnimationFrame(() => { const tk = document.getElementById('ticker'); if (tk) { tk.style.scrollBehavior = 'auto'; tk.scrollTop = tk.scrollHeight; tk.style.scrollBehavior = ''; } });
    },
    'mom': d => {
      const L = live, p = me(), mi = L.cur, mo = L.moments[mi], i = +d.v, o = mo.options[i];
      if (mo.done) return;
      const plan = CB.momentPlan(L.U, mo, i, p);
      L.calls.push(plan.mom);
      CB.replayUserMatch(W, L.U, L.calls);
      Object.assign(mo, { done: true, choice: o.t, verdict: plan.verdict, fit: plan.fit });
      p.momentum = { attr: o.a }; L.momAttr = o.a;
      // a bigger situation later in the replayed match can bring a bonus moment
      if (!mo.bonus) { const b = CB.findBonusMoment(L.U, p, mo); if (b) L.moments.push(b); }
      // the replayed match is identical up to this moment; carry on from there with its new ending
      L.events = buildTimeline(L.U, p, L.moments);
      L.ei = L.events.findIndex(e => e.moment && e.mi === mi) + 1;
      if (L.moments.every(m => m.done)) finalizeLive();
      buzz(plan.fit > 0 ? [20, 40, 20] : 15); render();
    },
    'mom-close': () => { live.momentOpen = false; render(); const tk = document.getElementById('ticker'); if (tk) tk.scrollTop = tk.scrollHeight; live.timer = setTimeout(stepLive, 300 / live.speed); },
    'result': () => { clearTimeout(live.timer); go('result'); },
    'sctab': d => { ui.scTab = +d.v; render(); },
    'train': () => { clearTimeout(live && live.timer); go('train'); },
    'tplus': d => { const T = pending.train; const used = Object.values(T.alloc).reduce((a, b) => a + b, 0); if (used < T.energy) { T.alloc[d.v] = (T.alloc[d.v] || 0) + 1; buzz(6); render(); } },
    'tminus': d => { const T = pending.train; if (T.alloc[d.v]) { T.alloc[d.v]--; if (!T.alloc[d.v]) delete T.alloc[d.v]; render(); } },
    'tauto': () => {
      const p = me(), T = pending.train; T.alloc = {};
      const pref = { open: ['DEF', 'CON', 'PACE', 'ATT', 'SPIN'], top: ['DEF', 'PACE', 'SPIN', 'CON', 'ATT'], mid: ['ATT', 'SPIN', 'DEF', 'PACE', 'RUN'], wk: ['KEEP', 'DEF', 'CON', 'PACE', 'ATT'], ar: ['DEF', 'ACC', 'CRA', 'PACE', 'STK'], pace: ['ACC', 'STK', 'CRA', 'STA', 'FIT'], spin: ['STK', 'CRA', 'ACC', 'STA', 'MEN'] }[p.role];
      const order = p.momentum ? [p.momentum.attr].concat(pref.filter(x => x !== p.momentum.attr)) : pref;
      for (let i = 0; i < T.energy; i++) { const k = order[i % order.length]; T.alloc[k] = (T.alloc[k] || 0) + 1; }
      render();
    },
    'tdone': () => {
      const p = me(), T = pending.train;
      if (pending.moment && !p.momentum) p.momentum = pending.moment;
      p.energyBonus = 0;            // spent this session (life events / combos set it for the next one)
      const res = CB.train(W, p, T.alloc);
      pending.post.note = res.note; pending.post.combos = res.combos.map(c => c.name);
      const sel = CB.selectionView(W, p);
      pending.post.items.push({ cls: 'blue', html: `📋 ${esc(sel.text)}` });
      if (W.county && !W.season.slots.slice(W.season.cursor).some(s => s.type === 'county')) pending.post.items.push({ cls: 'blue', html: `🏴 That's the end of your summer with ${esc(CB.countyById(W.county.id).name)}: ${W.county.res[0]} won, ${W.county.res[1]} lost, ${W.county.res[2]} drawn.` });
      pending.stage = 'post'; delete pending.train;
      const le = CB.maybeLifeEvent(W); if (le) pending.life = le;
      save(); go('post');
      if (pending.post.items.some(i => i.party)) setTimeout(confetti, 300);
    },
    'life': () => go('life'),
    'life-pick': d => {
      const L = pending && pending.life; if (!L || L.result) return;
      clearTimeout(ui.lifeT);
      L.result = CB.resolveLifeEvent(W, L.id, +d.v, L.ctx);
      if (d.auto) L.result.auto = L.options[+d.v];
      buzz(12); save(); render();
    },
    'life-done': () => { pending.life = null; save(); if (me().perkOffer) go('perk'); else ACT.hub(); },
    'perk': () => go('perk'),
    'pickperk': d => { const p = me(); if (p.traits.length >= 5) p.traits.shift(); p.traits.push(d.v); p.perkOffer = false; if (pending) pending.perkChoices = null; toast(CB.PERKS.find(k => k.id === d.v).name + ' unlocked'); save(); ACT.hub(); },
    'skipperk': () => { me().perkOffer = false; if (pending) pending.perkChoices = null; save(); ACT.hub(); },
    'season-end': () => go('season'),
    'next-season': () => {
      const e = CB.userSeasonEnd(W);
      if (e.ended) { finishCareer(e.ended); return; }
      CB.endSeason(W);
      pending = null; save();
      const p = me();
      if (p.age >= 35) toast(`You're ${p.age}. Retire any time from the menu.`);
      if (p.perkOffer) go('perk'); else go('hub', 'home');
    },
    'retire': () => { const p = me(); if (confirm(`Retire ${p.first} ${p.last} at ${p.age}? This puts your career on the Shelf.`)) finishCareer('retired'); },
  };
  function readNames() { const f = document.getElementById('fn'), l = document.getElementById('ln'); if (f && ui.create) { ui.create.first = f.value; ui.create.last = l.value; } }
  $app.addEventListener('click', e => {
    const t = e.target.closest('[data-a]'); if (!t || t.disabled) return;
    const fn = ACT[t.dataset.a]; if (fn) fn(t.dataset, t, e);
  });

  function render() {
    const f = SCREENS[ui.screen] || SCREENS.title;
    document.body.dataset.screen = ui.screen;
    try { $app.innerHTML = f(); } catch (err) { console.error(err); $app.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="mute small">${esc(err.message)}</p><button class="btn" data-a="to-title">Title</button></div>`; }
    lifeTimer();
  }
  // life events: if no choice is made in time, one is picked at random. The clock stops while the app is hidden.
  const LIFE_SECS = 15;
  function lifeTimer() {
    clearTimeout(ui.lifeT);
    const L = pending && pending.life;
    if (ui.screen !== 'life' || !L || L.result || document.hidden) return;
    ui.lifeT = setTimeout(() => {
      if (ui.screen === 'life' && pending && pending.life === L && !L.result) ACT['life-pick']({ v: String(Math.floor(Math.random() * L.options.length)), auto: '1' });
    }, Math.max(0, ui.lifeEnd - Date.now()));
  }
  document.addEventListener('visibilitychange', () => {
    const L = pending && pending.life, onLife = ui.screen === 'life' && L && !L.result;
    if (document.hidden) {
      if (onLife) { ui.lifeLeft = ui.lifeEnd - Date.now(); clearTimeout(ui.lifeT); }
      if (W && !(live && live.final === false)) save();
    } else if (onLife && ui.lifeLeft != null) { ui.lifeEnd = Date.now() + ui.lifeLeft; ui.lifeLeft = null; render(); }
  });
  // an unsettled match (key moment still to come) is never saved: the last save replays it identically
  window.addEventListener('beforeunload', () => { if (W && !(live && live.final === false)) save(); });
  // test hook (?dev): drive the real actions from the console
  if (/[?&]dev/.test(location.search)) window.CBUI = { ACT, ui, render, get W() { return W; }, get live() { return live; }, get pending() { return pending; } };
  // boot
  render();
})();
