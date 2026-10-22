/* Cricboy UI: screens, flow, persistence. Everything renders into #app from a small state object. */
(function () {
  'use strict';
  const CB = window.CB;
  const $app = document.getElementById('app');
  const SAVE = 'cricboy.save.v1', SHELF = 'cricboy.shelf.v1';
  let W = null;                 // the world (persisted)
  let pending = null;           // post-match state (persisted, compact)
  let live = null;              // current match replay (memory only)
  const ui = { screen: 'title', tab: 'career', create: null, scTab: 0, shelfOpen: null, seasonTab: 'ladder' };

  // ---------------------------------------------------------------- persistence
  const strip = (k, v) => (k === 'e' || k === 'bw' || k === '_ctx') ? undefined : v;
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ W, pending, screen: ui.screen }, strip)); } catch (e) { toast('Could not save (storage full?)'); }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (!s || !s.W) return false;
      W = s.W; pending = s.pending || null;
      let maxId = 0;
      for (const p of Object.values(W.players)) { CB.refresh(p); maxId = Math.max(maxId, p.id); }
      CB.setNextId(maxId + 1);
      return true;
    } catch (e) { return false; }
  }
  const hasSave = () => { try { return !!localStorage.getItem(SAVE); } catch (e) { return false; } };
  const getShelf = () => { try { return JSON.parse(localStorage.getItem(SHELF) || '[]'); } catch (e) { return []; } };
  const addShelf = e => { const s = getShelf(); s.unshift(e); try { localStorage.setItem(SHELF, JSON.stringify(s)); } catch (x) { } };
  const wipeSave = () => { try { localStorage.removeItem(SAVE); } catch (e) { } };

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const me = () => W && CB.user(W);
  const LV = { seconds: 'Second XI', shield: 'Shield', test: 'Test' };
  const lvBadge = lv => `<span class="badge lv-${lv}">${lv === 'test' ? '🧢 ' : ''}${LV[lv]}</span>`;
  const roleText = p => (p.role === 'pace' || p.role === 'spin') ? CB.SUB_INFO[p.sub] : CB.ROLE_INFO[p.role].label + (p.role === 'ar' && p.sub ? ' · ' + CB.SUB_INFO[p.sub].toLowerCase() : '');
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }
  function confetti() {
    const c = document.createElement('div'); c.className = 'confetti';
    const cols = ['#f4c542', '#2fbf71', '#e5484d', '#5aa9e6', '#f5efd9'];
    for (let i = 0; i < 70; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + 'vw'; s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * 0.6 + 's'; s.style.transform = `rotate(${Math.random() * 360}deg)`; c.appendChild(s); }
    document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
  }
  const fmtOv = b => CB.oversStr(b);
  const stateOf = id => CB.stateById(id);
  function go(screen) { ui.screen = screen; render(); window.scrollTo(0, 0); }
  function bar(html) { return `<div class="bar"><div class="inner">${html}</div></div>`; }

  // ---------------------------------------------------------------- screens
  const SCREENS = {};

  SCREENS.title = () => `
    <div class="title reveal">
      <div class="ball"></div>
      <div class="logo">CRIC<span>BOY</span></div>
      <div class="tagline">Seventeen years old. A Second XI cap. A dream of a baggy green.<br><span class="small faint">Every ball simulated from 2.1 million real Test and Sheffield Shield deliveries.</span></div>
      <div class="col" style="max-width:340px;margin:8px auto 0;width:100%">
        ${hasSave() ? `<button class="btn primary big" data-a="continue">Continue career</button>` : ''}
        <button class="btn ${hasSave() ? '' : 'primary'} big" data-a="new">New career</button>
        <button class="btn" data-a="shelf">🏆 The Shelf${getShelf().length ? ' (' + getShelf().length + ')' : ''}</button>
        <button class="btn ghost" data-a="about">How it works</button>
      </div>
      <a class="small faint" href="/" style="margin-top:10px">← mondayjeffrey.com</a>
    </div>`;

  SCREENS.about = () => `
    <div class="row mb"><button class="btn ghost" data-a="back-title">←</button><h2>How it works</h2></div>
    <div class="card"><h3>The cricket is real</h3><p class="mute">Every delivery is drawn from a statistical model fitted to every ball of 896 men's Tests (2001-2026) and 212 Sheffield Shield matches (2017-2026): how often batters get out and score depending on balls faced, ball age, the day of the match, the country, home advantage, declarations and run chases. Captains bowl, declare and enforce follow-ons the way real ones do. Weather, pitches and form come from the same data.</p>
    <p class="mute small">Ball-by-ball data from <a href="https://cricsheet.org" style="color:var(--green)">Cricsheet</a> (ODC-By licence). All players are fictional.</p></div>
    <div class="card"><h3>Your career</h3><p class="mute">You start at 17 in your state's Second XI. Talent is random and hidden: you might be a club battler or a once-a-generation genius. Score runs or take wickets and the selectors notice: Shield, then Tests. Get dropped if you don't.</p></div>
    <div class="card"><h3>Every match</h3><p class="mute">Each game has one key moment. Your call there doesn't change the scorecard, but it gives momentum: that area trains 50% harder afterwards. Then spend your energy on 15 training areas. Pair the right ones for combo bonuses. Milestones unlock perks (up to five).</p></div>
    <div class="card"><h3>The end</h3><p class="mute">Retire when you like, or get delisted. Your career goes on the Shelf, with your hidden ratings finally revealed.</p></div>
    ${bar('<button class="btn primary" data-a="back-title">Got it</button>')}`;

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
    return `
    <div class="row mb"><button class="btn ghost" data-a="back-title">←</button><h2>New career</h2></div>
    <div class="sec-title">Name</div>
    <div class="row"><input class="input" id="fn" value="${esc(c.first)}" placeholder="First" maxlength="16"><input class="input" id="ln" value="${esc(c.last)}" placeholder="Surname" maxlength="18"><button class="btn" data-a="rname" title="Random name">🎲</button></div>
    <div class="sec-title">Your state</div>
    <div class="choice-grid">${CB.STATES.map(s => `<button class="choice ${c.state === s.id ? 'on' : ''}" data-a="cstate" data-v="${s.id}"><div class="t state-chip"><span class="dot" style="background:${s.color}"></span>${s.name}</div><div class="d">${s.ground}</div></button>`).join('')}</div>
    <div class="sec-title">Role</div>
    <div class="choice-grid">${roles.map(r => `<button class="choice ${c.role === r.id ? 'on' : ''}" data-a="crole" data-v="${r.id}"><div class="t">${r.t}</div><div class="d">${r.d}</div></button>`).join('')}</div>
    ${needSub ? `<div class="sec-title">Bowling type</div><div class="choice-grid">${subs.map(s => `<button class="choice ${c.sub === s.id ? 'on' : ''}" data-a="csub" data-v="${s.id}"><div class="t">${s.t}</div><div class="d">${s.d}</div></button>`).join('')}</div>` : ''}
    <div class="sec-title">Bats</div>
    <div class="choice-grid"><button class="choice ${c.hand === 'R' ? 'on' : ''}" data-a="chand" data-v="R"><div class="t">Right-handed</div></button><button class="choice ${c.hand === 'L' ? 'on' : ''}" data-a="chand" data-v="L"><div class="t">Left-handed</div></button></div>
    <p class="small faint mt">Your talent is rolled when you sign. You won't see the numbers. Ever. (Well, until you retire.)</p>
    ${bar(`<button class="btn primary big" data-a="sign" ${c.role && c.state && (!needSub || c.sub) ? '' : 'disabled'}>Sign rookie contract</button>`)}`;
  };

  SCREENS.scout = () => {
    const p = me();
    return `
    <div class="card scout flip">
      <div class="badge lv-seconds">Rookie contract · ${esc(stateOf(p.team).name)}</div>
      <div class="mt"><span class="mute">Age 17 · ${esc(roleText(p))}</span></div>
      <div class="hero name disp" style="background:none;padding:0;margin-top:6px;font-size:40px">${esc(p.first)} ${esc(p.last)}</div>
      <div class="quote">"${esc(CB.scoutReport(p))}"</div>
      <div class="mute small">State talent scout</div>
    </div>
    <div class="card"><h3>Season ${CB.seasonLabel(W.year)}</h3><p class="mute">You'll start in the ${esc(stateOf(p.team).name)} Second XI. Ten rounds, three-day games. Make the selectors notice.</p></div>
    ${bar('<button class="btn primary big" data-a="hub">Let\'s go</button>')}`;
  };

  // ---- hub
  SCREENS.hub = () => {
    const p = me(); if (!p) return SCREENS.title();
    const lvl = CB.userLevel(W, p);
    const st = stateOf(p.team);
    const sel = CB.selectionView(W, p);
    const S = W.season;
    // the user's own next game: skip Tests he isn't part of (they get simmed on the way)
    let nxt = S.slots[S.cursor];
    if (nxt && !W.aus.xi.includes(p.id)) nxt = S.slots.slice(S.cursor).find(s => s.type !== 'test') || nxt;
    const fc = { m: p.st.shield.m + p.st.test.m };
    const tl = CB.statLine(p.st.test), sl = CB.statLine(p.st.shield), xl = CB.statLine(p.st.seconds);
    const main = p.st.test.m ? ['Tests', tl, p.st.test] : p.st.shield.m ? ['Shield', sl, p.st.shield] : ['2nd XI', xl, p.st.seconds];
    const bowler = p.role === 'pace' || p.role === 'spin';
    const stats = bowler ? [['M', main[1].m], ['Wkts', main[1].w], ['Avg', main[1].bavg], ['Best', main[1].bb]] : [['M', main[1].m], ['Runs', main[1].runs], ['Avg', main[1].avg], ['100s', main[1].h100]];
    return `
    <div class="card hero">
      <div class="stripe" style="background:${st.color}"></div>
      <div class="row between"><div class="row" style="gap:6px">${lvBadge(lvl)}${p.inj > 0 ? '<span class="badge loss">🩹 Injured</span>' : ''}</div><button class="btn ghost" style="min-height:36px;padding:6px 10px" data-a="menu">☰</button></div>
      <div class="name mt">${esc(p.first)}<br>${esc(p.last)}</div>
      <div class="meta">${p.age} · ${esc(roleText(p))} · ${esc(st.name)}${p.capNo ? ' · Test cap ' + p.capNo : ''}</div>
      <div class="statrow">${stats.map(s => `<div class="stat"><div class="v num">${esc(s[1])}</div><div class="k">${main[0]} ${s[0]}</div></div>`).join('')}</div>
    </div>
    ${p.inj > 0 ? `<div class="news red">🩹 ${esc(p.injName || 'Injured')}: out for ${p.inj} more game${p.inj > 1 ? 's' : ''}.</div>` : ''}
    <div class="card">
      <div class="row between"><h3>Selectors' radar</h3><span class="tiny faint">${esc(CB.seasonLabel(S.year))}</span></div>
      <div class="mute small" style="margin-top:4px">${esc(sel.text)}</div>
      ${sel.heat != null ? `<div class="radar"><i style="width:${Math.round(sel.heat * 100)}%"></i></div>` : ''}
    </div>
    ${nxt ? `<div class="card glow"><div class="tiny faint">UP NEXT · ${esc(CB.slotDate(W, nxt))}</div><div class="next mt"><div class="grow"><div class="vs">${esc(slotTitle(nxt, p))}</div><div class="mute small">${esc(slotSub(nxt, p))}</div></div></div></div>` : `<div class="card glow"><h3>Season complete</h3><p class="mute small">Time for the season review.</p></div>`}
    <div class="tabs">${['career', 'season', 'history', 'perks'].map(t => `<button class="tab ${ui.tab === t ? 'on' : ''}" data-a="tab" data-v="${t}">${{ career: 'Career', season: 'Season', history: 'Matches', perks: 'Perks' }[t]}</button>`).join('')}</div>
    ${TABS[ui.tab]()}
    ${bar(nxt ? `<button class="btn primary big" data-a="next">${p.inj > 0 ? 'Sim while injured' : 'Next match'} ▶</button>` : `<button class="btn gold big" data-a="season-end">Season review</button>`)}`;
  };
  function slotTitle(slot, p) {
    if (slot.type === 'test') { const s = W.season.series[slot.series]; return `${slot.no}${['st', 'nd', 'rd'][slot.no - 1] || 'th'} Test v ${CB.NATIONS[s.opp].name}`; }
    if (slot.type === 'final') return 'Sheffield Shield Final';
    const pair = slot.pairs.find(pp => pp.includes(p.team));
    const opp = pair ? (pair[0] === p.team ? pair[1] : pair[0]) : null;
    return `Round ${slot.round}${opp ? ' v ' + stateOf(opp).name : ''}`;
  }
  function slotSub(slot, p) {
    if (slot.type === 'test') { const s = W.season.series[slot.series]; return (s.home ? 'Home series' : 'Tour of ' + CB.NATIONS[s.opp].name) + ` · series ${s.res[0]}-${s.res[1]}` + (W.aus.xi.includes(p.id) ? ' · you\'re in the XI' : ' · selectors pick the XI'); }
    if (slot.type === 'final') return 'Top two on the ladder · five days';
    const pair = slot.pairs.find(pp => pp.includes(p.team));
    const home = pair && pair[0] === p.team;
    return `${home ? 'Home' : 'Away'} · Shield XI or Second XI, selectors decide`;
  }

  const TABS = {
    career: () => {
      const p = me();
      const rows = ['test', 'shield', 'seconds'].filter(l => p.st[l].m).map(l => ({ l, s: CB.statLine(p.st[l]) }));
      if (!rows.length) return `<div class="card"><p class="mute">No matches yet. Your career starts at the next fixture.</p></div>`;
      return `<div class="card scroll-x"><h3 class="mb">Batting</h3><table><tr><th></th><th>M</th><th>Runs</th><th>Avg</th><th>SR</th><th>HS</th><th>100</th><th>50</th></tr>
        ${rows.map(r => `<tr><td>${LV[r.l]}</td><td>${r.s.m}</td><td class="b">${r.s.runs}</td><td>${r.s.avg}</td><td>${r.s.sr}</td><td>${r.s.hs}</td><td>${r.s.h100}</td><td>${r.s.f50}</td></tr>`).join('')}</table></div>
        <div class="card scroll-x"><h3 class="mb">Bowling & fielding</h3><table><tr><th></th><th>Wkts</th><th>Avg</th><th>Econ</th><th>BB</th><th>5w</th><th>Ct</th>${p.role === 'wk' ? '<th>St</th>' : ''}</tr>
        ${rows.map(r => `<tr><td>${LV[r.l]}</td><td class="b">${r.s.w}</td><td>${r.s.bavg}</td><td>${r.s.econ}</td><td>${r.s.bb}</td><td>${r.s.w5}</td><td>${r.s.ct}</td>${p.role === 'wk' ? '<td>' + r.s.st + '</td>' : ''}</tr>`).join('')}</table></div>
        ${p.honours.length || p.potm ? `<div class="card"><h3 class="mb">Honours</h3>${[...new Set(p.honours.map(h => h.text))].map(h => `<div class="news gold">🏆 ${esc(h)}</div>`).join('')}${p.potm ? `<div class="news gold">⭐ Player of the match × ${p.potm}</div>` : ''}</div>` : ''}`;
    },
    season: () => {
      const S = W.season, p = me();
      const lad = Object.entries(S.ladder).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);
      const mine = S.results.filter(r => r.home === p.team || r.away === p.team || (r.level === 'test')).slice(-12).reverse();
      return `<div class="card scroll-x"><h3 class="mb">Sheffield Shield ladder</h3><table><tr><th></th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>
        ${lad.map(([id, L], i) => `<tr class="${id === p.team ? 'me' : ''}"><td><span class="dot" style="background:${stateOf(id).color}"></span> ${i + 1}. ${stateOf(id).name}</td><td>${L.p}</td><td>${L.w}</td><td>${L.d}</td><td>${L.l}</td><td class="b">${L.pts}</td></tr>`).join('')}</table></div>
        <div class="card"><h3 class="mb">Test summer</h3>${S.series.map(s => `<div class="item row between" style="padding:6px 0"><span>${s.home ? 'v' : '@'} ${CB.NATIONS[s.opp].name} <span class="faint small">(${s.tests} Tests)</span></span><span class="num b">${s.res[0]}-${s.res[1]}${s.res[2] ? ' · ' + s.res[2] + 'D' : ''}</span></div>`).join('')}</div>
        <div class="card"><h3 class="mb">Results</h3>${mine.length ? mine.map(r => `<div class="list"><div class="item"><div class="grow"><div class="small">${r.level === 'test' ? 'Test' : r.level === 'shield' ? (r.final ? 'Shield Final' : 'Shield') : '2nd XI'} · ${esc(r.venue || '')}</div><div class="tiny mute">${esc(r.score)}</div><div class="tiny">${esc(r.text)}</div></div></div></div>`).join('') : '<p class="mute small">No results yet.</p>'}</div>`;
    },
    history: () => {
      const p = me();
      const h = p.history.slice(-25).reverse();
      if (!h.length) return `<div class="card"><p class="mute">Your matches will appear here.</p></div>`;
      return `<div class="card list">${h.map(x => `<div class="item"><span class="badge ${x.res === 'W' ? 'win' : x.res === 'L' ? 'loss' : 'draw'}">${x.res}</span><div class="grow"><div class="small"><b>${esc(x.bat || '-')}</b>${x.bowl ? ' · ' + esc(x.bowl) : ''}</div><div class="tiny mute">${LV[x.lv]}${x.final ? ' Final' : ''} v ${esc(x.vs)} · ${esc(x.venue || '')} · ${CB.seasonLabel(x.y)}</div></div></div>`).join('')}</div>`;
    },
    perks: () => {
      const p = me();
      const ps = p.traits.map(id => CB.PERKS.find(k => k.id === id)).filter(Boolean);
      return `<div class="card"><h3>Perks <span class="faint small">${ps.length}/5</span></h3><p class="mute small">Earned at milestones and every second season. Five slots.</p>
        ${ps.length ? ps.map(k => `<div class="news blue"><b>${k.icon} ${esc(k.name)}</b><div class="small mute">${esc(k.desc)}</div></div>`).join('') : '<p class="faint small">None yet. Debuts, maiden hundreds and five-fors unlock picks.</p>'}</div>
        <div class="card"><h3>Training combos</h3><p class="mute small">Put points in both areas in one session: both train harder.</p>${CB.COMBOS.map(c => `<span class="combo">${esc(c.name)}: ${c.need.map(k => CB.focusLabel(CB.FOCUS.find(f => f.id === k), p).name).join(' + ')} (+${Math.round(c.bonus * 100)}%)</span>`).join('')}</div>`;
    },
  };

  // ---- menu
  SCREENS.menu = () => `
    <div class="row mb"><button class="btn ghost" data-a="hub">←</button><h2>Menu</h2></div>
    <div class="col">
      <button class="btn block" data-a="shelf">🏆 The Shelf</button>
      <button class="btn block" data-a="about2">How it works</button>
      <button class="btn block danger" data-a="retire">Retire now</button>
      <button class="btn block ghost" data-a="to-title">Title screen</button>
    </div>
    <p class="faint small mt2">Progress saves automatically on this device.</p>`;

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
      <div class="next mt"><div class="grow"><div class="vs">${esc(t0.name)}<br><span class="mute" style="font-size:16px">v</span> ${esc(t1.name)}</div><div class="mute small mt">${esc(U.cfg.venue || '')}${U.cfg.final ? ' · Sheffield Shield Final' : ''}</div></div></div>
    </div>
    ${L.debut ? `<div class="news gold">${U.level === 'test' ? `🧢 Test debut. Cap number ${p.capNo || '?'} is yours.` : `🎉 First-class debut for ${esc(stateOf(p.team).name)}!`}</div>` : ''}
    <div class="card"><h3 class="mb">Conditions</h3><div class="row wrap" style="gap:6px">${cond.map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div></div>
    <div class="card"><h3 class="mb">${esc(t0.name)}</h3><div class="small">${t0.xi.map((x, i) => `<span class="${x.user ? 'b' : 'mute'}" style="${x.user ? 'color:var(--green)' : ''}">${i + 1}. ${esc(x.name)}${i === t0.keeper ? ' †' : ''}</span>`).join('<br>')}</div>
    <p class="small faint mt">You're batting at ${pos}.</p></div>
    ${bar('<button class="btn primary big" data-a="play">Start match</button>')}`;
  };
  function conditions(M) {
    const out = [], P = M.pitch;
    if (P.wS > 0.12) out.push('🌀 Dry, turning pitch'); else if (P.wP > 0.08) out.push('🌱 Green seamer'); else if (P.r > 0.06 && P.wP < 0) out.push('🛣️ Flat road'); else out.push('🏏 Good cricket wicket');
    const rain = M.rainLost.reduce((a, b) => a + b, 0);
    out.push(rain > 90 ? '🌧️ Wet week forecast' : rain > 20 ? '🌦️ Showers about' : '☀️ Fine');
    out.push(M.country === 'AUS' ? '📍 Australia' : '📍 ' + CB.NATIONS[Object.keys(CB.NATIONS).find(k => CB.NATIONS[k].country === M.country) || 'ENG'].name);
    out.push(`${M.days}-day match`);
    return out;
  }

  // ---- live replay
  SCREENS.live = () => {
    const L = live, M = L.U.M;
    return `
    <div class="scoreboard" id="sb">${scoreboardHTML()}</div>
    <div class="row between mt"><div class="small mute" id="dayline">${esc(L.dayText || 'Day 1')}</div>
      <div class="speed"><button class="btn ${L.speed === 1 ? 'primary' : ''}" data-a="spd" data-v="1">1×</button><button class="btn ${L.speed === 3 ? 'primary' : ''}" data-a="spd" data-v="3">3×</button><button class="btn" data-a="skip">Skip ⏭</button></div></div>
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
    return lines.join('') + (sub ? `<div class="sub">${esc(sub)}</div>` : '');
  }
  function leadNow(M, s) { const I = M.inns[s.k]; let own = s.runs, opp = 0; for (let k = 0; k < s.k; k++) { if (M.inns[k].bat === I.bat) own += M.inns[k].runs; else opp += M.inns[k].runs; } return own - opp; }
  const tickHTML = t => `<div class="tick ${t.cls || ''}">${t.html}</div>`;
  function momentHTML() {
    const mo = live.moment, p = me();
    if (live.momentDone) return `<div class="moment"><div class="sheet"><div class="kicker">Your call</div><h2>${esc(live.choice || mo.title)}</h2><p class="small mute">Momentum: <b style="color:var(--gold)">${esc(CB.focusLabel(CB.FOCUS.find(f => f.id === p.momentum.attr), p).name)}</b> trains ×${CB.hasPerk(p, 'fastlearner') ? 2 : 1.5} next session.</p><button class="btn primary block big mt" data-a="mom-close">Play on</button></div></div>`;
    return `<div class="moment"><div class="sheet">
      <div class="kicker">⚡ Key moment</div><h2>${esc(mo.title)}</h2><div class="sit">${esc(mo.situation)}</div>
      <p>${esc(mo.text)}</p>
      ${mo.options.map((o, i) => { const f = CB.FOCUS.find(x => x.id === o.a); const lab = CB.focusLabel(f, p); return `<button class="opt" data-a="mom" data-v="${i}"><span class="ic">${lab.icon}</span><span class="grow"><div><b>${esc(o.t)}</b></div><div class="tg">Trains ${esc(lab.name)}</div></span></button>`; }).join('')}
    </div></div>`;
  }

  // timeline of highlights from the simulated match
  function buildTimeline(U, p, moment) {
    const M = U.M, ev = [], meIdx = U.sides[U.ti].indexOf(p.id);
    const nm = (ti, i) => { const x = M.teams[ti].xi[i]; return x.user ? 'You' : x.name; };
    M.inns.forEach((I, k) => {
      const bt = M.teams[I.bat], ft = M.teams[I.fld];
      ev.push({ k, html: `<b>${esc(bt.name)}</b> ${k === 3 ? `need ${I.target} to win` : k === 2 && I.followOn ? 'follow on' : 'begin their innings'}`, cls: 'big', sc: { runs: 0, wk: 0, balls: 0 } });
      const runs = new Array(11).fill(0);
      const marks = (I.dayMarks || []).slice();
      let arrived = false, bowled = false;
      let lastSc = { runs: 0, wk: 0, balls: 0 };
      I.log.forEach((L, i) => {
        while (marks.length && marks[0].at === i) { const m = marks.shift(); ev.push({ k, html: `Stumps, day ${m.day}: ${esc(bt.short || bt.name)} ${lastSc.runs}/${lastSc.wk}`, cls: 'day', sc: lastSc, day: m.day + 1 }); }
        const sc = { runs: L.sc, wk: L.wk, balls: L.b };
        if (moment && moment.inns === k && moment.at === i) ev.push({ k, moment: true, sc });
        const sIsMe = I.bat === U.ti && L.s === meIdx, bIsMe = I.fld === U.ti && L.bw === meIdx;
        if (!arrived && I.bat === U.ti && (L.s === meIdx || L.n === meIdx)) { arrived = true; ev.push({ k, html: `🏏 <b>You walk out</b> at ${esc(bt.short)} ${L.sc - (L.r || 0)}/${L.wk}`, cls: 'me', sc }); }
        if (!bowled && bIsMe) { bowled = true; ev.push({ k, html: `🎯 <b>You're on</b> to bowl · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: 'me', sc }); }
        if (typeof L.w === 'number' || L.w === 'nb') {
          const before = runs[L.s]; runs[L.s] += L.r;
          for (const ms of [50, 100, 150, 200, 250, 300]) if (before < ms && runs[L.s] >= ms) ev.push({ k, html: `${sIsMe ? '🎉 <b>' + (ms === 100 ? 'HUNDRED!' : ms + '!') + '</b> You' : '<b>' + ms + '</b> for ' + esc(nm(I.bat, L.s))} ${sIsMe ? 'raise the bat' : ''} · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: sIsMe ? 'me ms' : 'ms', sc, big: sIsMe && ms >= 100 });
          if (sIsMe && (L.r === 4 || L.r === 6)) ev.push({ k, html: `${L.r === 6 ? '💥 SIX' : 'FOUR'} off ${esc(nm(I.fld, L.bw))}`, cls: 'me', sc, fast: true });
        }
        if (L.w === 'drop' && (sIsMe || (I.fld === U.ti && L.x && L.x.fielder === meIdx))) ev.push({ k, html: sIsMe ? '😮‍💨 Dropped! You survive.' : '😬 You put down a chance.', cls: 'me', sc });
        if (L.w === 'W') {
          const out = L.x.out, b = I.bats[out];
          const isMe = I.bat === U.ti && out === meIdx;
          ev.push({ k, html: `<b>WICKET</b> ${esc(nm(I.bat, out))} ${esc(CB.dismissalText(M, I, b))} ${b.runs} (${b.balls}) · ${esc(bt.short)} ${L.sc}/${L.wk}`, cls: 'w' + (isMe || bIsMe ? ' me' : ''), sc, me: isMe || bIsMe });
        }
        lastSc = sc;
      });
      const endTxt = I.closed === 'allout' ? `${esc(bt.name)} all out for ${I.runs}` : I.closed === 'declared' ? `${esc(bt.name)} declare at ${I.runs}/${I.wk}` : I.closed === 'target' ? `${esc(bt.name)} reach the target` : `${esc(bt.name)} ${I.runs}/${I.wk} when play ends`;
      ev.push({ k, html: endTxt + ` (${fmtOv(I.balls)} ov)`, cls: 'big', sc: { runs: I.runs, wk: I.wk, balls: I.balls }, end: true });
    });
    ev.push({ k: M.inns.length - 1, html: `🏁 <b>${esc(M.result.text)}</b>`, cls: 'big ms', sc: { runs: M.inns[M.inns.length - 1].runs, wk: M.inns[M.inns.length - 1].wk, balls: M.inns[M.inns.length - 1].balls }, final: true });
    return ev;
  }
  function stepLive() {
    const L = live; if (!L || L.done || L.momentOpen || L.paused) return;
    const e = L.events[L.ei++];
    if (!e) { L.done = true; render(); return; }
    L.sb = { k: e.k, ...e.sc };
    if (e.day) L.dayText = 'Day ' + e.day;
    if (e.moment) { L.momentOpen = true; render(); return; }
    L.shown.push(e);
    const tk = document.getElementById('ticker');
    if (tk) { tk.insertAdjacentHTML('beforeend', tickHTML(e)); tk.scrollTop = tk.scrollHeight; }
    const sb = document.getElementById('sb'); if (sb) sb.innerHTML = scoreboardHTML();
    const dl = document.getElementById('dayline'); if (dl) dl.textContent = L.dayText || 'Day 1';
    if (e.big) confetti();
    if (e.final) { L.done = true; render(); return; }
    const base = e.fast ? 140 : e.cls && e.cls.includes('w') ? 620 : e.cls === 'day' ? 700 : 380;
    L.timer = setTimeout(stepLive, base / L.speed);
  }

  // ---- result
  SCREENS.result = () => {
    const L = live, U = L.U, M = U.M, p = me();
    const won = M.result.winner === U.ti, drew = M.result.draw || M.result.tie;
    const lines = L.post.lines;
    const bat = lines.bat.map(b => `${b.runs}${b.out ? '' : '*'} <span class="mute small">(${b.balls})</span>`).join(' & ') || '<span class="mute">DNB</span>';
    const bowl = lines.bowl.filter(b => b.balls).map(b => `${b.wk}/${b.runs} <span class="mute small">(${fmtOv(b.balls)})</span>`).join(' & ') || '<span class="mute">-</span>';
    const potm = M.potm ? M.teams[M.potm.team].xi[M.potm.idx] : null;
    return `
    <div class="card result-banner reveal">
      <span class="badge ${drew ? 'draw' : won ? 'win' : 'loss'}">${drew ? 'Draw' : won ? 'Win' : 'Loss'}</span>
      <div class="big mt">${esc(M.result.text)}</div>
      <div class="mute small mt">${esc(CB.scoreLine(M))}</div>
    </div>
    <div class="perf"><div class="p"><div class="tiny faint">BATTING</div><div class="v num">${bat}</div></div><div class="p"><div class="tiny faint">BOWLING</div><div class="v num">${bowl}</div></div></div>
    ${L.moment ? `<div class="news blue mt"><b>⚡ ${esc(L.moment.title)}</b>${L.choice ? ' · you chose: ' + esc(L.choice) : ''}<div class="small mute">${esc(L.moment.after)}</div></div>` : ''}
    ${potm ? `<div class="news gold mt">⭐ Player of the match: <b>${potm.user ? 'YOU' : esc(potm.name)}</b></div>` : ''}
    ${L.post.ev.filter(e => e.type === 'milestone').map(e => `<div class="news gold">🏅 ${esc(e.text)}</div>`).join('')}
    <div class="sec-title">Scorecard</div>
    <div class="tabs">${M.inns.map((I, i) => `<button class="tab ${ui.scTab === i ? 'on' : ''}" data-a="sctab" data-v="${i}">${esc(M.teams[I.bat].short || M.teams[I.bat].name)} ${i >= 2 ? '2nd' : '1st'}</button>`).join('')}</div>
    ${scorecardHTML(M, M.inns[ui.scTab] || M.inns[0], U)}
    ${bar('<button class="btn primary big" data-a="train">Training ▶</button>')}`;
  };
  function scorecardHTML(M, I, U) {
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
        <div class="ctl"><button data-a="tminus" data-v="${f.id}" ${n ? '' : 'disabled'}>−</button><span class="cnt num">${n}</span><button class="plus" data-a="tplus" data-v="${f.id}" ${left ? '' : 'disabled'}>+</button></div></div>`;
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
    return `
    <h2 class="mb">After the match</h2>
    ${P.note ? `<div class="news">${esc(P.note)}</div>` : ''}
    ${P.combos && P.combos.length ? `<div class="news blue">🃏 Combo${P.combos.length > 1 ? 's' : ''}: ${P.combos.map(esc).join(', ')}</div>` : ''}
    ${P.items.map(i => `<div class="news ${i.cls || ''}">${i.html}</div>`).join('')}
    ${bar(`<button class="btn primary big" data-a="${p.perkOffer ? 'perk' : 'hub'}">${p.perkOffer ? 'Choose a perk ▶' : 'Continue'}</button>`)}`;
  };

  // ---- perk choice
  SCREENS.perk = () => {
    const p = me();
    if (!pending || !pending.perkChoices) { pending = pending || {}; pending.perkChoices = CB.perkChoices(W, p).map(k => k.id); save(); }
    const ch = pending.perkChoices.map(id => CB.PERKS.find(k => k.id === id));
    const full = p.traits.length >= 5;
    return `
    <div class="center mb"><div class="kicker disp" style="color:var(--violet);letter-spacing:.14em">PICK ONE</div><h2>A new perk</h2><p class="mute small">${full ? 'All five slots are full. Picking one replaces your oldest perk.' : `Slot ${p.traits.length + 1} of 5.`}</p></div>
    <div class="perks">${ch.map((k, i) => `<button class="perk flip" style="animation-delay:${i * 0.12}s" data-a="pickperk" data-v="${k.id}"><span class="ic">${k.icon}</span><span><div class="n">${esc(k.name)}</div><div class="small mute">${esc(k.desc)}</div></span></button>`).join('')}</div>
    ${bar('<button class="btn ghost" data-a="skipperk">Skip</button>')}`;
  };

  // ---- season end
  SCREENS.season = () => {
    const S = W.season, p = me();
    const lad = Object.entries(S.ladder).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);
    const mine = p.history.filter(h => h.y === S.year);
    const sum = lv => { const h = mine.filter(x => x.lv === lv); if (!h.length) return null; let r = 0, o = 0, w = 0; for (const x of h) { for (const s of (x.bat || '').split(' & ').filter(Boolean)) { r += parseInt(s, 10) || 0; if (!s.endsWith('*')) o++; } for (const s of (x.bowl || '').split(' & ').filter(Boolean)) w += parseInt(s, 10) || 0; } return { m: h.length, r, avg: o ? (r / o).toFixed(1) : '-', w }; };
    return `
    <div class="center mb"><div class="kicker disp" style="color:var(--gold);letter-spacing:.14em">SEASON ${CB.seasonLabel(S.year)}</div><h2>Season review</h2></div>
    <div class="card"><h3 class="mb">Your season</h3>${['test', 'shield', 'seconds'].map(lv => { const s = sum(lv); return s ? `<div class="item row between" style="padding:6px 0"><span>${lvBadge(lv)} ${s.m} match${s.m > 1 ? 'es' : ''}</span><span class="num small">${s.r} runs @ ${s.avg}${s.w ? ' · ' + s.w + ' wkts' : ''}</span></div>` : ''; }).join('') || '<p class="mute">You didn\'t get a game this season.</p>'}</div>
    <div class="card"><h3 class="mb">Sheffield Shield</h3><p class="small">🏆 Champions: <b>${S.champion ? stateOf(S.champion).name : '-'}</b></p><table><tr><th></th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>${lad.map(([id, L], i) => `<tr class="${id === p.team ? 'me' : ''}"><td>${i + 1}. ${stateOf(id).name}</td><td>${L.w}</td><td>${L.d}</td><td>${L.l}</td><td class="b">${L.pts}</td></tr>`).join('')}</table></div>
    <div class="card"><h3 class="mb">Australia's Tests</h3>${S.series.map(s => `<div class="item row between" style="padding:6px 0"><span>${s.home ? 'v' : '@'} ${CB.NATIONS[s.opp].name}</span><span class="num b">${s.res[0]}-${s.res[1]}${s.res[2] ? ' (' + s.res[2] + 'D)' : ''}</span></div>`).join('')}</div>
    ${bar('<button class="btn gold big" data-a="next-season">Next season ▶</button>')}`;
  };

  // ---- shelf
  SCREENS.shelf = () => {
    const s = getShelf();
    if (ui.shelfOpen != null && s[ui.shelfOpen]) return shelfEntryHTML(s[ui.shelfOpen], false);
    return `
    <div class="row mb"><button class="btn ghost" data-a="${W && me() ? 'hub' : 'back-title'}">←</button><h2>The Shelf</h2></div>
    ${s.length ? `<div class="shelf">${s.map((e, i) => `<div class="pcard r${e.legacy.rank}" data-a="openshelf" data-v="${i}"><div><div class="l">${esc(e.legacy.label)}</div><div class="n mt">${esc(e.name)}</div><div class="tiny mute">${esc(e.years)} · ${esc(stateOf(e.state) ? stateOf(e.state).id : '')}</div></div><div class="small num">${e.test.m ? `${e.test.m} Tests` : e.shield.m ? `${e.shield.m} Shield` : `${e.seconds.m} 2nd XI`}<br><span class="mute">${e.role === 'pace' || e.role === 'spin' ? (e.test.m ? e.test.w + ' wkts @ ' + e.test.bavg : e.shield.w + ' wkts') : (e.test.m ? e.test.runs + ' @ ' + e.test.avg : e.shield.runs + ' runs')}</span></div></div>`).join('')}</div>` : '<div class="card"><p class="mute">No careers yet. Every finished career gets a spot here, with a bio and your hidden ratings revealed.</p></div>'}`;
  };
  function shelfEntryHTML(e, fresh) {
    const row = (l, s) => s.m ? `<tr><td>${l}</td><td>${s.m}</td><td class="b">${s.runs}</td><td>${s.avg}</td><td>${s.hs}</td><td>${s.h100}</td><td class="b">${s.w}</td><td>${s.bavg}</td><td>${s.bb}</td></tr>` : '';
    return `
    ${fresh ? '' : `<div class="row mb"><button class="btn ghost" data-a="closeshelf">←</button><h2>The Shelf</h2></div>`}
    <div class="card pcard r${e.legacy.rank} flip" style="min-height:0;cursor:default"><div class="l">${esc(e.legacy.label)}</div><div class="n" style="font-size:38px;margin-top:6px">${esc(e.name)}</div><div class="mute small">${esc(e.years)} · ${e.role === 'pace' || e.role === 'spin' ? CB.SUB_INFO[e.sub] : CB.ROLE_INFO[e.role].label} · ${esc(stateOf(e.state).name)}${e.capNo ? ' · Test cap ' + e.capNo : ''}</div></div>
    <div class="card"><p class="bio">${esc(e.bio)}</p></div>
    <div class="card scroll-x"><table><tr><th></th><th>M</th><th>Runs</th><th>Avg</th><th>HS</th><th>100</th><th>Wk</th><th>Avg</th><th>BB</th></tr>${row('Tests', e.test)}${row('Shield', e.shield)}${row('2nd XI', e.seconds)}</table></div>
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
  function startLive(res, skipped) {
    const p = me();
    const U = res.user;
    const debut = !p.debut[U.level] && U.level !== 'seconds';
    const post = CB.userPostMatch(W, U);
    const moment = CB.findMoment(U, p);
    live = { U, slot: res.slot, post, moment, events: buildTimeline(U, p, moment), ei: 0, shown: [], speed: 1, sb: { k: 0, runs: 0, wk: 0, balls: 0 }, done: false, momentOpen: false, momentDone: false, skipped, debut };
    ui.scTab = 0;
    // persist the essentials now, so a refresh lands safely on training
    pending = { stage: 'train', train: { energy: CB.energyFor(p, p.lastMatch), alloc: {}, reason: reasonText(p) }, post: { items: postItems(post, U), note: null }, moment: moment ? { attr: moment.options[0].a } : null };
    save();
    go('prematch');
  }
  function reasonText(p) {
    const e = CB.energyFor(p, p.lastMatch);
    const bits = [];
    if (CB.hasPerk(p, 'netrat') && p.lastMatch && p.lastMatch.quiet) bits.push('Net Rat +1');
    if (CB.hasPerk(p, 'coachspet')) bits.push("Coach's Pet +1");
    if (p.energyBonus) bits.push('Combo King +1');
    if (p.lastMatch && p.lastMatch.overs >= 45) bits.push('Heavy workload -1');
    return `${e} energy${bits.length ? ' · ' + bits.join(', ') : ''}`;
  }
  function postItems(post, U) {
    const p = me(), items = [];
    for (const e of post.ev) {
      if (e.type === 'debut') items.push({ cls: 'gold', html: e.level === 'test' ? `🧢 <b>Test debut!</b> You're Australian Test cricketer number ${p.capNo || '?'}.` : `🎉 <b>First-class debut</b> for ${esc(stateOf(p.team).name)}.` });
      if (e.type === 'milestone') items.push({ cls: 'gold', html: `🏅 ${esc(e.text)}` });
      if (e.type === 'potm') items.push({ cls: 'gold', html: '⭐ Player of the match.' });
      if (e.type === 'injury') items.push({ cls: 'red', html: `🩹 Injury: ${esc(e.name)}. Out for ${e.len} game${e.len > 1 ? 's' : ''}.` });
    }
    return items;
  }
  function advance() {
    const p = me();
    const skipped = [];
    for (let guard = 0; guard < 60; guard++) {
      const S = W.season;
      if (S.cursor >= S.slots.length) { save(); go('season'); return; }
      const res = CB.playSlot(W);
      if (res.user) { startLive(res, skipped); return; }
      // summarise a slot without us
      const slot = res.slot;
      const why = p.inj > 0 ? 'injured' : slot.type === 'test' ? 'not in the Test XI' : '';
      if (slot.type === 'test') { const r = res.results[0]; skipped.push(`${r.text} (${CB.NATIONS[r.away].name} Test ${r.no})${why ? ' · you: ' + why : ''}`); }
      else { const r = res.results.find(x => x.level === 'shield' && (x.home === p.team || x.away === p.team)); if (r) skipped.push(`Shield: ${r.text}${p.inj > 0 ? ' · you: injured' : ' · you: on Test duty'}`); else if (slot.type === 'final') skipped.push(`Shield Final: ${res.results[0].text}`); }
    }
    save(); go('hub');
  }
  function finishCareer(ended) {
    const entry = CB.shelfEntry(W, ended);
    addShelf(entry);
    wipeSave();
    pending = { entry };
    W = null;
    go('retired');
    confetti();
  }

  // ---------------------------------------------------------------- actions
  const ACT = {
    'continue': () => { if (load()) { if (pending && pending.stage === 'train') go('train'); else go('hub'); } else go('title'); },
    'new': () => {
      if (hasSave() && !confirm('Start a new career? Your current one will be lost (it will not go on the Shelf).')) return;
      const r = CB.rng((Math.random() * 1e9) >>> 0); const n = CB.genName(r, 'AUS');
      ui.create = { first: n.first, last: n.last, state: CB.STATES[Math.floor(Math.random() * 6)].id, role: null, sub: null, hand: 'R' };
      go('create');
    },
    'rname': () => { readNames(); const r = CB.rng((Math.random() * 1e9) >>> 0); const n = CB.genName(r, 'AUS'); ui.create.first = n.first; ui.create.last = n.last; render(); },
    'cstate': d => { readNames(); ui.create.state = d.v; render(); },
    'crole': d => { readNames(); ui.create.role = d.v; if (d.v !== 'ar' && d.v !== 'bowl') ui.create.sub = null; render(); },
    'csub': d => { readNames(); ui.create.sub = d.v; render(); },
    'chand': d => { readNames(); ui.create.hand = d.v; render(); },
    'sign': () => {
      readNames();
      const c = ui.create;
      const role = c.role === 'bowl' ? (c.sub === 'finger' || c.sub === 'wrist' ? 'spin' : 'pace') : c.role;
      W = CB.newWorld((Math.random() * 4294967295) >>> 0, 2026);
      CB.createUser(W, { first: (c.first || 'Sam').trim(), last: (c.last || 'Smith').trim(), state: c.state, role, sub: c.sub, hand: c.hand });
      pending = null; save(); go('scout');
    },
    'hub': () => { if (pending && (pending.stage === 'train' || pending.stage === 'post')) pending = null; save(); go('hub'); },
    'tab': d => { ui.tab = d.v; render(); },
    'menu': () => go('menu'),
    'about': () => go('about'), 'about2': () => go('about'),
    'back-title': () => go('title'), 'to-title': () => { save(); go('title'); },
    'shelf': () => { ui.shelfOpen = null; go('shelf'); },
    'openshelf': d => { ui.shelfOpen = +d.v; render(); window.scrollTo(0, 0); },
    'closeshelf': () => { ui.shelfOpen = null; render(); },
    'next': () => advance(),
    'play': () => { go('live'); live.timer = setTimeout(stepLive, 400); },
    'spd': d => { live.speed = +d.v; render(); if (!live.done && !live.momentOpen) { clearTimeout(live.timer); live.timer = setTimeout(stepLive, 200); } },
    'skip': () => {
      clearTimeout(live.timer);
      // fast-forward to the moment (if still to come), else to the end
      while (live.ei < live.events.length) {
        const e = live.events[live.ei];
        if (e.moment && !live.momentDone) { live.ei++; live.sb = { k: e.k, ...e.sc }; live.momentOpen = true; break; }
        live.ei++; if (!e.moment) live.shown.push(e); live.sb = { k: e.k, ...e.sc };
        if (e.final) { live.done = true; }
      }
      if (live.ei >= live.events.length) live.done = true;
      render();
      requestAnimationFrame(() => { const tk = document.getElementById('ticker'); if (tk) { tk.style.scrollBehavior = 'auto'; tk.scrollTop = tk.scrollHeight; tk.style.scrollBehavior = ''; } });
    },
    'mom': d => { const o = live.moment.options[+d.v]; me().momentum = { attr: o.a }; pending.moment = { attr: o.a }; live.choice = o.t; live.momentDone = true; save(); render(); },
    'mom-close': () => { live.momentOpen = false; render(); const tk = document.getElementById('ticker'); if (tk) tk.scrollTop = tk.scrollHeight; live.timer = setTimeout(stepLive, 300 / live.speed); },
    'result': () => { clearTimeout(live.timer); go('result'); },
    'sctab': d => { ui.scTab = +d.v; render(); },
    'train': () => { clearTimeout(live && live.timer); go('train'); },
    'tplus': d => { const T = pending.train; const used = Object.values(T.alloc).reduce((a, b) => a + b, 0); if (used < T.energy) { T.alloc[d.v] = (T.alloc[d.v] || 0) + 1; render(); } },
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
      const res = CB.train(W, p, T.alloc);
      pending.post.note = res.note; pending.post.combos = res.combos.map(c => c.name);
      // selection outlook for the next game
      const sel = CB.selectionView(W, p);
      pending.post.items.push({ cls: 'blue', html: `📋 ${esc(sel.text)}` });
      pending.stage = 'post'; delete pending.train;
      save(); go('post');
    },
    'perk': () => go('perk'),
    'pickperk': d => { const p = me(); if (p.traits.length >= 5) p.traits.shift(); p.traits.push(d.v); p.perkOffer = false; if (pending) pending.perkChoices = null; toast(CB.PERKS.find(k => k.id === d.v).name + ' unlocked'); save(); go('hub'); },
    'skipperk': () => { me().perkOffer = false; if (pending) pending.perkChoices = null; save(); go('hub'); },
    'season-end': () => go('season'),
    'next-season': () => {
      const e = CB.userSeasonEnd(W);
      if (e.ended) { finishCareer(e.ended); return; }
      CB.endSeason(W);
      pending = null; save();
      const p = me();
      if (p.age >= 35) toast(`You're ${p.age}. Retire any time from the menu.`);
      if (p.perkOffer) go('perk'); else go('hub');
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
    try { $app.innerHTML = f(); } catch (err) { console.error(err); $app.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="mute small">${esc(err.message)}</p><button class="btn" data-a="to-title">Title</button></div>`; }
  }
  window.addEventListener('beforeunload', () => { if (W) save(); });
  // test hook (?dev): drive the real actions from the console
  if (/[?&]dev/.test(location.search)) window.CBUI = { ACT, ui, render, get W() { return W; }, get live() { return live; }, get pending() { return pending; } };
  // boot
  render();
})();
