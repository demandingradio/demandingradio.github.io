// Mega Trade Machine — build any AFL trade, then rate it.
(function () {
  'use strict';
  const D = window.TRADE_DATA, M = window.TradeModel, J = window.Jumpers;
  for (const [k, v] of Object.entries(D.params)) if (k !== 'modeScale' && v != null) M.params[k] = v; // calibrated settings (incl. role multipliers)
  for (const [m, s] of Object.entries(D.params.modeScale)) M.params.modes[m].scale = s;

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en-AU');
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const CLUBS = D.clubs;
  const CODES = Object.keys(CLUBS).sort((a, b) => CLUBS[a].name.localeCompare(CLUBS[b].name));
  const MODE_CODE = { contender: 'c', balanced: 'b', rebuild: 'r' };
  const MODE_FROM = { c: 'contender', b: 'balanced', r: 'rebuild' };
  const ROUND = ['', '1st', '2nd', '3rd', '4th', '5th'];
  const MAX_CLUBS = 6;

  // ---------------- assets ----------------
  const assets = new Map();
  for (const p of D.players) assets.set(p.id, { kind: 'player', id: p.id, owner: p.c, p });
  for (const k of D.picks) assets.set(k.id, { kind: 'pick', id: k.id, owner: k.owner, k });
  const featOf = (p) => ({ A: p.A, age: p.age, avail: p.avail, ped: p.ped, group: p.grp, games: p.gms, dy: p.dy, dp: p.dp, contractEnd: p.ce, fa: p.fa });

  const vcache = new Map();
  function value(id, mode = 'balanced') {
    const key = id + '|' + mode;
    if (vcache.has(key)) return vcache.get(key);
    const a = assets.get(id);
    let r;
    if (a.kind === 'player') { const v = M.playerValue(featOf(a.p), { mode }); r = { points: v.points, why: v.leverage.why, code: v.leverage.code, k: v.leverage.k, path: v.path, vet: v.vet, draftee: v.draftee }; }
    else { const k = a.k; const v = M.pickValue(k.year === 2026 ? { year: 2026, pick: k.pick } : { year: k.year, round: k.round, orig: k.orig }, { mode, ladderRank: D.ladderRank }); r = { points: v.points, why: v.why }; }
    vcache.set(key, r);
    return r;
  }

  function eqPick(pts) {
    if (pts < 7) return 'no draft value';
    const ones = Math.floor(pts / 3000); let rem = pts - ones * 3000;
    const parts = ones ? [ones > 1 ? `${ones} × #1` : '#1'] : [];
    if (rem >= (ones ? 60 : 7)) { let best = 1; for (let k = 1; k <= M.DVI.length; k++) if (Math.abs(M.dvi(k) - rem) < Math.abs(M.dvi(best) - rem)) best = k; parts.push('#' + best); }
    return '≈ ' + parts.join(' + ');
  }
  const ovr = (p) => M.ovr(p.A);
  const ovrColour = (o) => (o >= 90 ? '#ffd24d' : o >= 84 ? '#b6ef5e' : o >= 78 ? '#7fd6ff' : o >= 71 ? '#d3d8e2' : '#8d8d9a');
  const surnameTag = (p) => `${p.f[0]}.${p.l}`.toUpperCase();
  const posShort = { MID: 'MID', RUC: 'RUCK', KF: 'KEY FWD', GF: 'FWD', KD: 'KEY DEF', GD: 'DEF' };

  function label(id, ctxClub, style = 'board') {
    const a = assets.get(id);
    if (a.kind === 'player') return style === 'board' ? surnameTag(a.p) : a.p.n;
    const k = a.k;
    if (k.year === 2026) return style === 'board' ? `PICK ${k.pick}` : `Pick ${k.pick}`;
    const tag = k.orig !== ctxClub ? ` (${CLUBS[k.orig].tag})` : '';
    return style === 'board' ? `${k.year} ${ROUND[k.round].toUpperCase()}${tag}` : `${k.year} ${ROUND[k.round]} round${k.orig !== ctxClub ? ` (${CLUBS[k.orig].short})` : ''}`;
  }

  // ---------------- state ----------------
  const S = { clubs: [], legs: new Map(), modes: {}, view: null, filter: 'all', sort: 'value', q: '', rated: false };
  const modeOf = (c) => S.modes[c] || CLUBS[c].mode;
  const legsFrom = (c) => [...S.legs].filter(([id]) => assets.get(id).owner === c).map(([id]) => id);
  const legsTo = (c) => [...S.legs].filter(([, to]) => to === c).map(([id]) => id);

  function addClub(c, { view = true } = {}) {
    if (S.clubs.includes(c)) { if (view) S.view = c; return true; }
    if (S.clubs.length >= MAX_CLUBS) { toast(`Six clubs is the limit for one trade.`); return false; }
    S.clubs.push(c); if (view || !S.view) S.view = c;
    return true;
  }
  function removeClub(c) {
    for (const [id, to] of [...S.legs]) if (to === c || assets.get(id).owner === c) S.legs.delete(id);
    S.clubs = S.clubs.filter((x) => x !== c);
    if (S.view === c) S.view = S.clubs[0] || null;
    changed();
  }
  function setLeg(id, to) {
    const a = assets.get(id);
    if (to === a.owner) return;
    if (!S.clubs.includes(to) && !addClub(to, { view: false })) return;
    S.legs.set(id, to);
    changed();
  }
  function removeLeg(id) { S.legs.delete(id); changed(); }
  function changed() { renderAll(); writeHash(); }

  // ---------------- rendering ----------------
  function renderAll() {
    renderStrip(); renderTabs(); renderBrowser(); renderBoard(); renderWarnings();
    const has = S.legs.size > 0;
    $('#btnRate').disabled = !has; $('#btnShare').disabled = !has; $('#btnImage').disabled = !has;
    if (S.rated && has) renderResults(); else $('#results').innerHTML = '';
  }

  function renderStrip() {
    $('#clubStrip').innerHTML = CODES.map((c) => `<button class="club-pick ${S.clubs.includes(c) ? 'in' : ''}" data-club="${c}" title="${esc(CLUBS[c].name)} — ${M.ord(CLUBS[c].rank)} in 2026" aria-pressed="${S.clubs.includes(c)}">${J.svg(c, 40)}<span class="abbr">${CLUBS[c].abbr}</span></button>`).join('');
  }

  function renderTabs() {
    $('#tabs').innerHTML = S.clubs.map((c) => `<button class="tab ${S.view === c ? 'on' : ''}" role="tab" aria-selected="${S.view === c}" data-tab="${c}">${J.svg(c, 20)}${CLUBS[c].abbr}${legsFrom(c).length ? '<span class="dot" title="Giving assets"></span>' : ''}</button>`).join('');
  }

  const FILTERS = [['all', 'All'], ['mid', 'Mid'], ['fwd', 'Fwd'], ['def', 'Def'], ['ruck', 'Ruck'], ['picks', 'Picks']];
  const inFilter = (p, f) => f === 'all' || (f === 'mid' && p.grp === 'MID') || (f === 'fwd' && (p.grp === 'GF' || p.grp === 'KF')) || (f === 'def' && (p.grp === 'GD' || p.grp === 'KD')) || (f === 'ruck' && p.grp === 'RUC');

  function renderBrowser() {
    const body = $('#browserBody');
    const c = S.view;
    if (!c) { body.innerHTML = `<div class="empty-browser">Pick clubs from the strip above.<br>Their full list and draft picks show up here — drag them onto the board or tap one to send it.</div>`; return; }
    const club = CLUBS[c];
    const mode = modeOf(c);
    let html = `<div class="club-head" style="--club:${club.c1}"><div class="row1">${J.svg(c, 46)}<div><h2>${esc(club.name)}</h2><div class="sub">${M.ord(club.rank)} in 2026 (${club.w}-${club.l}${club.d ? '-' + club.d : ''}) · ${esc(club.finish)}</div></div></div>
      <div class="persp"><span class="lbl">Rates trades as</span><div class="seg" role="group" aria-label="Club perspective">${Object.entries(M.params.modes).map(([k, m]) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}" aria-pressed="${mode === k}">${m.label}</button>`).join('')}</div></div></div>
      <div class="filters"><input type="search" id="q" placeholder="Search ${esc(club.short)}…" value="${esc(S.q)}" aria-label="Search players">
      <select class="sortby" id="sortby" aria-label="Sort"><option value="value">Value</option><option value="ovr">Rating</option><option value="age">Age</option><option value="name">Name</option><option value="no">Number</option></select>
      <div style="display:flex;gap:5px;flex-wrap:wrap;width:100%">${FILTERS.map(([k, l]) => `<button class="chipf ${S.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div></div>`;

    if (S.filter !== 'picks') {
      const q = S.q.trim().toLowerCase();
      let list = D.players.filter((p) => p.c === c && inFilter(p, S.filter) && (!q || p.n.toLowerCase().includes(q)));
      const sorters = { value: (a, b) => value(b.id).points - value(a.id).points, ovr: (a, b) => b.A - a.A, age: (a, b) => a.age - b.age, name: (a, b) => a.l.localeCompare(b.l), no: (a, b) => (a.no || 99) - (b.no || 99) };
      list.sort(sorters[S.sort]);
      html += `<div class="section-h"><span>Players</span><span>${list.length} · market value</span></div>`;
      html += list.map((p) => playerRow(p)).join('') || `<div class="empty-browser">No players match.</div>`;
    }
    if (S.filter === 'all' || S.filter === 'picks') {
      const mine = D.picks.filter((k) => k.owner === c);
      html += `<div class="section-h"><span>Draft picks</span><span>${mine.length}</span></div>`;
      for (const y of [2026, 2027, 2028]) {
        const ks = mine.filter((k) => k.year === y).sort((a, b) => (a.pick || a.round * 100) - (b.pick || b.round * 100) || a.orig.localeCompare(b.orig));
        if (!ks.length) continue;
        html += `<div class="section-h" style="color:var(--muted);padding-top:6px"><span>${y}${y === 2026 ? ' national draft' : ' (future)'}</span><span></span></div>`;
        html += ks.map((k) => pickRow(k, c)).join('');
      }
    }
    body.innerHTML = html;
    const sel = $('#sortby'); if (sel) sel.value = S.sort;
  }

  function tagsFor(p) {
    const t = [];
    if (p.ce && p.ce <= D.season) t.push(`<span class="tag fa" title="Out of contract${/Free Agent/.test(p.fa) && !/Non/.test(p.fa) ? ' — ' + esc(p.fa) : ''}">${/Unrestricted/.test(p.fa) ? 'UFA' : /Restricted/.test(p.fa) ? 'RFA' : 'OOC'}</span>`);
    if (p.rk) t.push(`<span class="tag rk" title="Rookie list">R</span>`);
    if (S.legs.has(p.id)) t.push(`<span class="tag in">→ ${CLUBS[S.legs.get(p.id)].abbr}</span>`);
    return t.join('');
  }
  function playerRow(p) {
    const v = value(p.id).points; const o = ovr(p);
    const used = S.legs.has(p.id);
    return `<button class="asset ${used ? 'used' : ''}" data-asset="${p.id}" aria-label="${esc(p.n)}, ${esc(p.pos)}, value ${fmt(v)} points">
      <span class="no">${p.no ?? ''}</span>
      <span><span class="nm"><span class="t">${esc(p.n)}</span>${tagsFor(p)}</span><span class="meta"><span class="ovr" style="background:${ovrColour(o)}">${o}</span> ${posShort[p.grp] || ''} · ${p.age.toFixed(0)}y · ${p.gms} gm${p.s[2026] ? ` · ${p.s[2026].gm} in '26` : ''} <span class="info-btn" data-info="${p.id}" role="button" tabindex="0" aria-label="Details for ${esc(p.n)}">ⓘ</span></span></span>
      <span class="val"><div class="pts">${fmt(v)}</div><div class="eq">${eqPick(v)}</div></span></button>`;
  }
  function pickRow(k, c) {
    const v = value(k.id).points; const used = S.legs.has(k.id);
    const name = k.year === 2026 ? `Pick ${k.pick}` : `${ROUND[k.round]} round`;
    const sub = k.year === 2026 ? `Round ${k.round}${k.orig !== k.owner ? ` · via ${CLUBS[k.orig].short}` : ''}` : (k.orig !== k.owner ? `${CLUBS[k.orig].short}'s pick` : 'Own pick');
    return `<button class="asset pick-row ${used ? 'used' : ''}" data-asset="${k.id}" aria-label="${esc(name)} ${k.year}, value ${fmt(v)} points">
      <span class="no">${k.year === 2026 ? '#' + k.pick : 'R' + k.round}</span>
      <span><span class="nm"><span class="t">${esc(name)}</span>${used ? `<span class="tag in">→ ${CLUBS[S.legs.get(k.id)].abbr}</span>` : ''}</span><span class="meta">${esc(sub)} <span class="info-btn" data-info="${k.id}" role="button" tabindex="0" aria-label="How this pick is valued">ⓘ</span></span></span>
      <span class="val"><div class="pts">${fmt(v)}</div><div class="eq">${v < 14 ? 'no DVI points' : k.year === 2026 ? 'DVI' : 'projected'}</div></span></button>`;
  }

  function renderBoard() {
    const b = $('#board');
    if (!S.clubs.length) {
      b.innerHTML = `<div class="board-empty"><h3>BUILD A MEGA TRADE</h3><p>Add two or more clubs from the strip above, then drag players and draft picks onto the board — or tap any player or pick to choose where it goes.</p></div>`;
      return;
    }
    let html = `<div class="board-head"><div></div><div>GET</div><div>GIVE</div></div>`;
    for (const c of S.clubs) {
      const club = CLUBS[c];
      const gets = legsTo(c), gives = legsFrom(c);
      html += `<div class="brow" style="--club:${club.c1}">
        <div class="who">${J.svg(c, 64)}<div class="nm">${esc(club.short)}</div><button class="x" data-remove-club="${c}" aria-label="Remove ${esc(club.name)} from the deal" title="Remove club">×</button></div>
        <div class="cell" data-club="${c}" data-side="get">${gets.map((id) => boardChip(id, c, 'get')).join('') || `<div class="hint">Drop what ${esc(club.short)} get</div>`}</div>
        <div class="cell" data-club="${c}" data-side="give">${gives.map((id) => boardChip(id, c, 'give')).join('') || `<div class="hint">Drop what ${esc(club.short)} give</div>`}</div>
      </div>`;
    }
    if (S.clubs.length === 1) html += `<div class="board-empty" style="padding:22px"><p style="margin:0">Add at least one more club from the strip above.</p></div>`;
    b.innerHTML = html;
  }
  function boardChip(id, rowClub, side) {
    const v = value(id).points; const to = S.legs.get(id);
    const dest = side === 'give' && S.clubs.length > 2 ? `<button class="dest" data-dest="${id}" title="Change destination">→ ${CLUBS[to].tag}</button>` : '';
    return `<span class="bchip" data-asset="${id}" tabindex="0" role="button" aria-label="${esc(label(id, rowClub, 'list'))}">${esc(label(id, rowClub))}${dest}<span class="v">${fmt(v)}</span><button class="rm" data-rm="${id}" aria-label="Remove from trade">×</button></span>`;
  }

  // ---------------- rule checks ----------------
  function checks() {
    const out = [];
    if (!S.legs.size) return out;
    const moving = [...S.legs.keys()].map((id) => assets.get(id));
    for (const c of S.clubs) {
      const g = legsFrom(c), r = legsTo(c);
      if (!g.length && !r.length) out.push(['warn', `<b>${esc(CLUBS[c].name)}</b> aren't sending or receiving anything yet — every club in a trade has to be part of it.`]);
      const netPlayers = r.filter((id) => assets.get(id).kind === 'player').length - g.filter((id) => assets.get(id).kind === 'player').length;
      if (netPlayers > 0) out.push(['info', `<b>${esc(CLUBS[c].name)}</b> take on ${netPlayers} more player${netPlayers > 1 ? 's' : ''} than they send out, so they'll need ${netPlayers} extra list spot${netPlayers > 1 ? 's' : ''} (lists max out at 44).`]);
      // pick holdings after the trade
      const holds = D.picks.filter((k) => (S.legs.has(k.id) ? S.legs.get(k.id) === c : k.owner === c));
      const n26 = holds.filter((k) => k.year === 2026).length;
      if (g.some((id) => assets.get(id).kind === 'pick' && assets.get(id).k.year === 2026) && n26 < 3) out.push(['warn', `<b>${esc(CLUBS[c].name)}</b> would hold only ${n26} pick${n26 === 1 ? '' : 's'} in the 2026 national draft — clubs must use at least 3.`]);
      const firsts = holds.filter((k) => (k.year === 2026 ? k.pick <= 18 : k.round === 1)).length;
      if (g.some((id) => { const a = assets.get(id); return a.kind === 'pick' && (a.k.year === 2026 ? a.k.pick <= 18 : a.k.round === 1); }) && firsts < 2) out.push(['warn', `<b>${esc(CLUBS[c].name)}</b> would have ${firsts} first-round pick${firsts === 1 ? '' : 's'} across 2026–28. The AFL wants clubs to use two firsts every four years (exemptions are possible).`]);
      const own28 = (r) => g.includes(`f2028-${r}-${c}`);
      if (own28(1) && (own28(2) || own28(3))) out.push(['warn', `<b>${esc(CLUBS[c].name)}</b> can't trade their 2028 first <i>and</i> their 2028 second or third — for the furthest-out year, a club must keep the rest of the suite to trade the first.`]);
    }
    for (const a of moving) if (a.kind === 'player') {
      const p = a.p;
      if (p.ce && p.ce <= D.season && /Unrestricted/.test(p.fa)) out.push(['info', `<b>${esc(p.n)}</b> is an unrestricted free agent — he could simply sign with a new club in free agency (2–9 Oct), and ${esc(CLUBS[p.c].short)} would get an AFL compensation pick instead of trade value.`]);
      else if (p.ce && p.ce <= D.season && /Restricted/.test(p.fa)) out.push(['info', `<b>${esc(p.n)}</b> is a restricted free agent — ${esc(CLUBS[p.c].short)} can match a rival offer, or let him go for an AFL compensation pick.`]);
    }
    if (moving.some((a) => a.kind === 'pick' && a.k.year === 2026)) out.push(['info', `2026 pick numbers can still shift by a spot or two when the AFL hands out free-agency compensation picks.`]);
    if (moving.some((a) => a.kind === 'player')) out.push(['info', `Every player has to agree to a trade, and clubs need board sign-off to trade first-round picks.`]);
    return out;
  }
  function renderWarnings() { $('#warnings').innerHTML = checks().map(([k, t]) => `<div class="warn ${k === 'info' ? 'info' : ''}"><span>${k === 'info' ? 'ℹ️' : '⚠️'}</span><span>${t}</span></div>`).join(''); }

  // ---------------- rating ----------------
  function gradeOf(score) {
    const T = [[0.3, 'A+'], [0.18, 'A'], [0.1, 'A-'], [0.04, 'B+'], [-0.04, 'B'], [-0.1, 'B-'], [-0.18, 'C+'], [-0.28, 'C'], [-0.42, 'D']];
    for (const [t, g] of T) if (score >= t) return g;
    return 'F';
  }
  const gradeClass = (g) => 'g-' + g[0].toLowerCase();

  function rate() {
    const res = {};
    for (const c of S.clubs) {
      const mode = modeOf(c);
      const ins = legsTo(c).map((id) => ({ id, v: value(id, mode).points, mv: value(id).points }));
      const outs = legsFrom(c).map((id) => ({ id, v: value(id, mode).points, mv: value(id).points }));
      const vin = sum(ins.map((x) => x.v)), vout = sum(outs.map((x) => x.v));
      const min = sum(ins.map((x) => x.mv)), mout = sum(outs.map((x) => x.mv));
      const score = (vin - vout) / (Math.max(vin, vout) + 300);
      res[c] = { c, mode, ins, outs, vin, vout, net: vin - vout, mnet: min - mout, score, grade: gradeOf(score) };
    }
    return res;
  }

  function reasonsFor(r) {
    const out = [];
    const c = r.c, club = CLUBS[c];
    const desc = (id) => {
      const a = assets.get(id);
      if (a.kind === 'player') { const p = a.p; return `<b>${esc(p.n)}</b> (${ovr(p)} rated ${esc(p.pos.toLowerCase())}, ${Math.floor(p.age)})`; }
      return `<b>${esc(label(id, c, 'list'))}</b>`;
    };
    const topIn = [...r.ins].sort((a, b) => b.v - a.v)[0], topOut = [...r.outs].sort((a, b) => b.v - a.v)[0];
    if (topIn) out.push(`Headline get: ${desc(topIn.id)} — worth ${fmt(topIn.v)} to them`);
    if (topOut) out.push(`Biggest price: ${desc(topOut.id)} — ${fmt(topOut.v)}`);
    const agesIn = r.ins.map((x) => assets.get(x.id)).filter((a) => a.kind === 'player').map((a) => a.p.age);
    const agesOut = r.outs.map((x) => assets.get(x.id)).filter((a) => a.kind === 'player').map((a) => a.p.age);
    const picksIn = r.ins.filter((x) => assets.get(x.id).kind === 'pick').length, picksOut = r.outs.filter((x) => assets.get(x.id).kind === 'pick').length;
    if (agesIn.length && !agesOut.length && picksOut) out.push(`Turns picks into ${agesIn.length === 1 ? 'a player' : agesIn.length + ' players'} — ${r.mode === 'contender' ? 'exactly what a club chasing a flag should do' : r.mode === 'rebuild' ? 'an unusual move for a club still rebuilding' : 'a push toward the finals'}.`);
    else if (!agesIn.length && agesOut.length && picksIn) out.push(`Cashes in ${agesOut.length === 1 ? 'a player' : agesOut.length + ' players'} for draft capital — ${r.mode === 'rebuild' ? 'textbook rebuild stuff' : r.mode === 'contender' ? 'a strange look for a contender' : 'a bet on the future'}.`);
    else if (agesIn.length && agesOut.length) { const d = sum(agesIn) / agesIn.length - sum(agesOut) / agesOut.length; if (Math.abs(d) >= 1.5) out.push(`The players coming in are ${Math.abs(d).toFixed(1)} years ${d > 0 ? 'older' : 'younger'} on average than the ones going out.`); }
    for (const x of r.ins) { const a = assets.get(x.id); if (a.kind === 'player') { const v = value(x.id); if (v.why) out.push(`${esc(a.p.n)} is ${esc(v.why)} — that takes ${Math.round((1 - v.k) * 100)}% off his price.`); if (v.vet < 0.95) out.push(`${esc(a.p.n)} is ${Math.floor(a.p.age)}: the market knocks about ${Math.round((1 - v.vet) * 100)}% off for age.`); } }

    const lens = { contender: `Rated through a <b>win-now</b> lens (${M.ord(club.rank)} in 2026): the next two or three seasons count most, and picks are worth 15% less to them.`, balanced: `Rated through a <b>balanced</b> lens.`, rebuild: `Rated through a <b>rebuild</b> lens: youth and long-term value weigh more, and picks are worth 15% more to them.` };
    return [...out.slice(0, 5), lens[r.mode]];
  }

  function renderResults() {
    const res = rate(); const list = Object.values(res).filter((r) => r.ins.length || r.outs.length);
    if (list.length < 2) { $('#results').innerHTML = ''; return; }
    const best = [...list].sort((a, b) => b.score - a.score)[0], worst = [...list].sort((a, b) => a.score - b.score)[0];
    let head, sub;
    const net = (r) => Math.max(0, -r.net);
    if (list.every((r) => r.net >= 0)) { head = list.length > 2 ? 'Everyone wins — that’s how mega trades get done' : 'Both clubs win'; sub = `Each club comes out ahead by its own lens. Biggest winner: ${CLUBS[best.c].name} (+${fmt(best.net)} pts).`; }
    else if (list.every((r) => Math.abs(r.score) < 0.06)) { head = 'Fair trade — everyone gets about what they give'; sub = 'No club is more than a late pick either way. The kind of deal that actually gets done.'; }
    else if (best.score > 0.3 && worst.score < -0.3) { head = `Daylight robbery: ${CLUBS[best.c].short} fleece ${CLUBS[worst.c].short}`; sub = `${CLUBS[worst.c].name} give up about ${fmt(-worst.net)} points more than they get back (${eqPick(-worst.net).replace('≈ ', 'roughly ')}). Their list manager would be taking calls from the board.`; }
    else { head = `${CLUBS[best.c].short} win this trade`; sub = `${CLUBS[worst.c].name} pay the most — about ${fmt(net(worst))} points over the odds (${eqPick(net(worst)).replace('≈ ', 'roughly ')}).`; }
    const has27 = list.some((r) => r.ins.concat(r.outs).some((x) => { const a = assets.get(x.id); return a.kind === 'pick' && a.k.year === 2027; }));
    const maxV = Math.max(...list.map((r) => Math.max(r.vin, r.vout)), 1);
    const cards = list.map((r) => {
      const club = CLUBS[r.c];
      const reasons = reasonsFor(r).map((t) => `<li>${t}</li>`).join('');
      return `<div class="card"><div class="card-top">${J.svg(r.c, 44)}<div><div class="nm">${esc(club.short)}</div><div class="persp-l">${M.params.modes[r.mode].label} lens</div></div><div class="grade ${gradeClass(r.grade)}">${r.grade}</div></div>
        <div class="netline">${r.net >= 0 ? '+' : '−'}${fmt(Math.abs(r.net))} pts <small>${r.net >= 0 ? 'gained' : 'lost'} · ${eqPick(Math.abs(r.net))}</small></div>
        <div class="bars"><span>GET</span><div class="bar in"><i style="width:${(r.vin / maxV) * 100}%"></i></div><span class="n">${fmt(r.vin)}</span><span>GIVE</span><div class="bar out"><i style="width:${(r.vout / maxV) * 100}%"></i></div><span class="n">${fmt(r.vout)}</span></div>
        <ul class="reasons">${reasons}</ul>
        <div class="market-note">Neutral market view: ${r.mnet >= 0 ? '+' : '−'}${fmt(Math.abs(r.mnet))} pts</div></div>`;
    }).join('');
    $('#results').innerHTML = `<div class="verdict"><div class="verdict-top"><div><div class="kicker">The verdict</div><h3>${esc(head)}</h3><p>${esc(sub)}</p></div></div><div class="cards">${cards}</div>
      <div class="verdict-foot">Grades use each club's own lens (change it in the club panel). Points are on the AFL's Draft Value Index scale — pick 1 = 3,000.${has27 ? ' 2027 picks are worth less than 2026 ones because Tasmania joins that draft with picks 1, 3, 5, 7, 9, 11 and 13.' : ''} <a href="#" id="howLink" style="color:var(--accent)">How values work</a></div></div>`;
  }

  // ---------------- menus ----------------
  const menu = $('#menu');
  let menuReturn = null; // element to hand keyboard focus back to
  function openMenu(html, anchor, focus = true) {
    const r = anchor.getBoundingClientRect(); // before innerHTML: the anchor may live inside the menu
    if (!menu.contains(anchor)) menuReturn = anchor;
    menu.innerHTML = html; menu.hidden = false; menu.style.maxHeight = '';
    const vh = window.innerHeight, vw = window.innerWidth;
    const mw = Math.min(360, vw - 20);
    menu.style.left = Math.max(10, Math.min(r.left, vw - mw - 10)) + 'px';
    const below = vh - r.bottom - 16, above = r.top - 16;
    const mh = menu.offsetHeight;
    if (mh <= below || below >= above) { menu.style.top = Math.min(r.bottom + 6, vh - 10 - Math.min(mh, below)) + 'px'; menu.style.maxHeight = Math.max(120, below) + 'px'; }
    else { const h = Math.min(mh, above); menu.style.top = Math.max(10, r.top - h - 6) + 'px'; menu.style.maxHeight = Math.max(120, above) + 'px'; }
    if (focus) { const first = menu.querySelector('button'); if (first) first.focus({ preventScroll: true }); }
  }
  function closeMenu(restore = false) {
    const had = !menu.hidden; menu.hidden = true; menu.innerHTML = '';
    if (restore && had && menuReturn?.isConnected) menuReturn.focus({ preventScroll: true });
  }
  function focusAsset(id) { const el = document.querySelector(`#browserBody [data-asset="${CSS.escape(id)}"]`) || document.querySelector(`#board [data-asset="${CSS.escape(id)}"]`); if (el) el.focus({ preventScroll: true }); }

  function openAssetMenu(id, anchor) {
    const a = assets.get(id); const owner = a.owner;
    const cur = S.legs.get(id);
    const others = S.clubs.filter((c) => c !== owner);
    const v = value(id).points;
    let h = `<div class="mh">${esc(label(id, owner, 'list'))} · ${fmt(v)} pts</div>`;
    if (others.length) h += `<div class="mh">Send to</div>` + others.map((c) => `<button class="mi" data-send="${id}" data-to="${c}">${J.svg(c, 22)}<span>${esc(CLUBS[c].name)}${cur === c ? ' ✓' : ''}</span></button>`).join('');
    else h += `<div class="mh" style="text-transform:none;letter-spacing:0">Add another club to send this somewhere.</div>`;
    h += `<button class="mi" data-more="${id}">➕ <span>Send to another club…</span></button>`;
    if (cur) h += `<hr><button class="mi" data-rm="${id}">✕ <span>Take out of the trade</span></button>`;
    if (a.kind === 'player') h += `<hr><button class="mi" data-info="${id}">ⓘ <span>Player details</span></button>`;
    else h += `<hr><button class="mi" data-info="${id}">ⓘ <span>How this pick is valued</span></button>`;
    openMenu(h, anchor);
  }
  function openClubPicker(id, anchor) {
    const owner = assets.get(id).owner;
    const full = S.clubs.length >= MAX_CLUBS;
    const h = `<div class="mh">Send ${esc(label(id, owner, 'list'))} to…</div>` + (full ? `<div class="mh" style="text-transform:none;letter-spacing:0">Six clubs is the limit — remove one to add another.</div>` : '') + CODES.filter((c) => c !== owner).map((c) => { const off = full && !S.clubs.includes(c); return `<button class="mi" data-send="${id}" data-to="${c}"${off ? ' disabled style="opacity:.35;cursor:not-allowed"' : ''}>${J.svg(c, 22)}<span>${esc(CLUBS[c].name)}</span></button>`; }).join('');
    openMenu(h, anchor);
  }
  function openDestMenu(id, anchor) {
    const owner = assets.get(id).owner;
    const h = `<div class="mh">Where does ${esc(label(id, owner, 'list'))} go?</div>` + S.clubs.filter((c) => c !== owner).map((c) => `<button class="mi" data-send="${id}" data-to="${c}">${J.svg(c, 22)}<span>${esc(CLUBS[c].name)}</span></button>`).join('');
    openMenu(h, anchor);
  }


  // ---------------- find any player ----------------
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '');
  function findMenu(input) {
    const q = norm(input.value.trim());
    if (q.length < 2) { closeMenu(); return; }
    const hits = D.players.filter((p) => norm(p.n).includes(q)).sort((a, b) => (norm(b.l).startsWith(q) - norm(a.l).startsWith(q)) || value(b.id).points - value(a.id).points).slice(0, 8);
    const h = hits.length ? hits.map((p) => `<button class="mi" data-find="${p.id}">${J.svg(p.c, 22)}<span>${esc(p.n)}<small>${esc(CLUBS[p.c].name)} · ${esc(p.pos)} · ${fmt(value(p.id).points)} pts</small></span></button>`).join('') : `<div class="mh" style="text-transform:none;letter-spacing:0">No listed player matches “${esc(input.value)}”.</div>`;
    openMenu(h, input, false);
  }
  function findPlayer(id) {
    const p = assets.get(id).p;
    if (!S.clubs.includes(p.c) && !addClub(p.c)) return;
    S.view = p.c; S.filter = 'all'; S.q = '';
    changed();
    const row = document.querySelector(`#browserBody [data-asset="${CSS.escape(id)}"]`);
    if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => openAssetMenu(id, row), 450); }
  }

  // ---------------- modals ----------------
  const modal = $('#modal');
  let modalReturn = null;
  function openModal(html) { modalReturn = document.activeElement; $('#modalBody').innerHTML = html; modal.hidden = false; $('#modalX').focus(); }
  function closeModal() { if (modal.hidden) return; modal.hidden = true; if (modalReturn?.isConnected) modalReturn.focus({ preventScroll: true }); }

  function playerModal(id) {
    const a = assets.get(id);
    if (a.kind === 'pick') return pickModal(id);
    const p = a.p; const club = CLUBS[p.c];
    const vals = Object.keys(M.params.modes).map((m) => [m, value(id, m).points]);
    const v = value(id);
    const contract = !p.ce ? 'Unknown' : p.ce <= D.season ? `Out of contract${/Free Agent/.test(p.fa) && !/Non/.test(p.fa) ? ` — ${p.fa.toLowerCase()}` : ''}` : `Signed to end of ${p.ce}`;
    const drafted = p.dr ? `${p.dr.y} · pick ${p.dr.p}${p.dr.t ? ` (${p.dr.t.toLowerCase()})` : ''}` : (p.rk ? 'Rookie / other entry' : '—');
    const years = Object.keys(p.s).sort().reverse();
    const rows = years.map((y) => { const s = p.s[y]; return `<tr><td>${y}</td><td>${esc(CLUBS[s.tm]?.abbr || s.tm)}</td><td>${s.gm}</td><td>${s.di}</td><td>${s.gl}</td><td>${s.cl}</td><td>${s.tk}</td><td>${s.sc}</td><td>${s.br}</td></tr>`; }).join('');
    // projected rating path (balanced lens)
    const path = v.path.slice(0, 8);
    const now = ovr(p);
    const pts = [[Math.floor(p.age), now], ...path.map((x) => [x.age, M.ovr(x.z)])];
    const lo = Math.min(...pts.map((x) => x[1])) - 3, hi = Math.max(...pts.map((x) => x[1])) + 3;
    const W = 640, H = 90, px = (i) => 20 + (i * (W - 40)) / (pts.length - 1), py = (o) => H - 16 - ((o - lo) / (hi - lo || 1)) * (H - 30);
    const spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="var(--accent)" stroke-width="3" points="${pts.map((q, i) => `${px(i)},${py(q[1])}`).join(' ')}"/>${pts.map((q, i) => `<circle cx="${px(i)}" cy="${py(q[1])}" r="4" fill="${i ? '#16161c' : 'var(--accent)'}" stroke="var(--accent)" stroke-width="2"/><text x="${px(i)}" y="${py(q[1]) - 9}" fill="#ddd" font-size="12" text-anchor="middle" font-family="Barlow Condensed">${q[1]}</text><text x="${px(i)}" y="${H - 2}" fill="#888" font-size="11" text-anchor="middle" font-family="Barlow Condensed">${q[0]}</text>`).join('')}</svg>`;
    openModal(`<div style="display:flex;gap:14px;align-items:center">${J.svg(p.c, 58)}<div><h2>${p.no ? '#' + p.no + ' ' : ''}${esc(p.n)}</h2><div style="color:var(--muted)">${esc(club.name)} · ${esc(p.pos)}${p.rk ? ' · rookie list' : ''}</div></div></div>
      <div class="pgrid">
        <div class="pstat"><div class="k">Trade value</div><div class="v" style="color:var(--accent)">${fmt(v.points)}</div><div style="font-size:12px;color:var(--muted)">${eqPick(v.points)}</div></div>
        <div class="pstat"><div class="k">Rating</div><div class="v"><span class="ovr" style="background:${ovrColour(now)};font-size:20px;padding:0 6px">${now}</span></div></div>
        <div class="pstat"><div class="k">Age</div><div class="v">${p.age.toFixed(1)}</div></div>
        <div class="pstat"><div class="k">Games</div><div class="v">${p.gms}</div></div>
        <div class="pstat"><div class="k">Height</div><div class="v">${p.ht ? p.ht + 'cm' : '—'}</div></div>
        <div class="pstat"><div class="k">Drafted</div><div class="v" style="font-size:17px">${esc(drafted)}</div></div>
        <div class="pstat" style="grid-column:span 2"><div class="k">Contract</div><div class="v" style="font-size:17px">${esc(contract)}</div></div>
      </div>
      <h3>Value through each lens</h3>
      <div class="pgrid">${vals.map(([m, x]) => `<div class="pstat"><div class="k">${M.params.modes[m].label}</div><div class="v">${fmt(x)}</div></div>`).join('')}</div>
      ${v.why ? `<p style="font-size:13.5px;color:var(--muted);margin:8px 0 0">He is ${esc(v.why)}, which takes ${Math.round((1 - v.k) * 100)}% off his trade price.</p>` : ''}
      ${v.vet < 0.99 ? `<p style="font-size:13.5px;color:var(--muted);margin:6px 0 0">Veteran discount: the market pays about ${Math.round((1 - v.vet) * 100)}% less for a player his age.</p>` : ''}
      ${v.draftee ? `<p style="font-size:13.5px;color:var(--muted);margin:6px 0 0">Only ${p.gms} games in, so ${Math.round(v.draftee.w * 100)}% of his value still comes from where he was drafted (pick ${v.draftee.pick}).</p>` : ''}
      <h3>Projected rating</h3>${spark}
      <p style="font-size:12.5px;color:var(--muted);margin:2px 0 0">Rating by age, using the model's development and ageing curve. The dot on the left is now.</p>
      <h3>Recent seasons</h3>
      ${rows ? `<table><thead><tr><th>Year</th><th>Club</th><th>GM</th><th>Disp</th><th>Goals</th><th>Clr</th><th>Tkl</th><th title="SuperCoach-style score per game">Score</th><th title="Brownlow votes">BV</th></tr></thead><tbody>${rows}</tbody></table>` : `<p>No AFL games in 2023–26.</p>`}
      <p style="font-size:12.5px;color:var(--muted)">Per-game averages except goals and Brownlow votes (totals). "Score" is a SuperCoach-style points-per-game estimate built from the raw stats.</p>
      <div style="margin-top:14px"><button class="btn" data-send-menu="${id}">Send ${esc(p.f)} somewhere…</button></div>`);
  }
  function pickModal(id) {
    const k = assets.get(id).k;
    const vals = Object.keys(M.params.modes).map((m) => [m, value(id, m).points]);
    const title = k.year === 2026 ? `Pick ${k.pick} · 2026` : `${k.year} ${ROUND[k.round]} round (${CLUBS[k.orig].short})`;
    openModal(`<div style="display:flex;gap:14px;align-items:center">${J.svg(k.owner, 58)}<div><h2>${esc(title)}</h2><div style="color:var(--muted)">Held by ${esc(CLUBS[k.owner].name)}${k.orig !== k.owner ? ` · originally ${esc(CLUBS[k.orig].name)}'s` : ''}</div></div></div>
      <div class="pgrid">${vals.map(([m, x]) => `<div class="pstat"><div class="k">${M.params.modes[m].label}</div><div class="v">${fmt(x)}</div></div>`).join('')}</div>
      <h3>Why</h3><p>${esc(value(id).why)}.</p>
      ${k.year === 2026 ? `<p style="color:var(--muted);font-size:13.5px">Pick values are the AFL's own 2026 Draft Value Index — the table clubs use to match father–son and academy bids. Picks after 54 carry no points.</p>` : `<p style="color:var(--muted);font-size:13.5px">Future picks are projected from where ${esc(CLUBS[k.orig].short)} finished in 2026, pulled toward the middle of the round (a lot can change in a year), then discounted a little for the wait.</p>`}
      <div style="margin-top:14px"><button class="btn" data-send-menu="${id}">Send this pick somewhere…</button></div>`);
  }
  function howModal() {
    const P = M.params;
    openModal(`<h2>How the values work</h2>
      <p>Every player and pick gets a value in <b>draft points</b>, on the scale the AFL itself uses: the 2026 Draft Value Index, where <b>pick 1 = 3,000</b>, pick 10 = 1,276, pick 20 = 757 and anything after pick 54 = 0. That puts players and picks on the same scale, so "Butters for pick 12 and two future firsts" can actually be added up.</p>
      <h3>1 · How good is he now?</h3>
      <p>For every game from 2023 to 2026 (${D.players.length} listed players, from AFL Tables), I rebuilt a SuperCoach-style score from the raw stats: kicks, handballs, marks, tackles, contested ball, hitouts, goals, one-percenters and more. A model fitted on the 2026 SuperCoach averages matches them almost exactly (R² 0.98). Two things are added on top. Brownlow votes per game are the umpires' view of who actually ran the game. Extra credit for goals, doubled for key forwards, covers the one thing SuperCoach badly under-rates: a 60-goal full-forward would otherwise look like a fringe player.</p>
      <p>Each season is then compared with players in the <b>same role</b> (inside mid, mid-forward, ruck, key forward, small forward, key defender, general defender) <i>and</i> with the whole league. That's because a gun key defender never racks up midfield numbers. Recent seasons count most (2026 ×1, 2025 ×0.6, 2024 ×0.35, 2023 ×0.2; under-23s lean even harder on their latest season), weighted by games played. A season lost to injury counts against you, and young players with little senior footy lean on their draft pick. That gives the <b>rating</b> you see (the league's best sit in the 90s).</p>
      <h3>2 · How good will he be, and for how long?</h3>
      <p>The rating is projected forward year by year using a development and ageing curve <b>measured from the data</b>, then tuned to the trade market. Young players improve about +${(0.36 * M.params.growthMult).toFixed(2)} a year at 19 and +${(0.2 * M.params.growthMult).toFixed(2)} at 22, a bit faster if they were high draft picks. Careers plateau from 25 to 28 and fall away after 29, and retirement odds climb from 30. Games missed through injury trim the value.</p>
      <h3>3 · Turn future seasons into points</h3>
      <p>Each projected season is worth more the further a player sits above a replacement-level fringe player, and stars are worth <i>disproportionately</i> more (to the power of ${M.params.gamma.toFixed(2)}). Future seasons are discounted (×${M.params.delta.toFixed(2)} a year) because clubs care most about the next few years. Past ${Math.round(M.params.vetStart)}, the market pays about ${Math.round(M.params.vetSlope * 100)}% less per extra year of age (salary and short windows). First- and second-year players are still valued mostly on their draft slot until they've played about 40 games.</p>
      <h3>4 · Calibrated on real trades, and checked by footy people</h3>
      <p>The settings were tuned against two things at once. The first is <b>${D.meta.calibrationTrades} real trades from the 2023, 2024 and 2025 trade periods</b>: every deal with a player in it (Petracca, Curnow, Bolton, Flanders, Schultz, Rioli and the rest), valued with the data clubs had at the time. The second is <b>${D.meta.anchors} expert-checked price ranges</b> for current players, cross-checked by two independent reviewers against 2026 All-Australian selections, free-agency compensation bands and recent trade prices. The fit also learned a small premium or discount by role: inside midfielders and key forwards fetch a bit more, wingers and general defenders a bit less. The market is short-termist. It pays for proven players now and discounts "he'll get better", so the model does too.</p>
      <h3>5 · Contract leverage</h3>
      <p>Clubs can't extract full price for players who could walk: out of contract −8%, restricted free agent −12%, unrestricted free agent −28%. One year left costs −4%.</p>
      <h3>Club lenses</h3>
      <p>The grade for each club uses its own situation. <b>Win now</b> (the default for the top six) weights the next two or three seasons heavily and values picks 15% less. <b>Rebuild</b> (the bottom six) looks further ahead and values picks 15% more. You can switch any club's lens in its panel. That's why a trade can be good for both sides.</p>
      <h3>Picks</h3>
      <p>2026 picks use the official order (after the Grand Final, before free-agency compensation). 2027 and 2028 picks are projected from each club's 2026 ladder spot, pulled toward the middle of the round, discounted 7% (2027) and 14% (2028). They also account for Tasmania joining: the Devils hold picks 1, 3, 5, 7, 9, 11 and 13 in 2027, which pushes everyone else back.</p>
      <h3>Honest caveats</h3>
      <ul><li>No salary data, so "salary dump" trades look odd (e.g. Clayton Oliver went for a third-round pick).</li><li>It doesn't know about injuries beyond games missed, off-field issues, or who a player is willing to go to.</li><li>Real trades land within about ±30% of "fair" by this model, and a few players will always look off (an All-Australian 20-year-old whose stats haven't caught up, or a 34-year-old ruck still dominating). It's a guide for arguing at the pub, not gospel.</li></ul>
      <p style="color:var(--muted);font-size:13px">Data as at ${esc(D.asOf)} — lists &amp; contracts from footywire.com, stats from afltables.com, picks and the DVI from afl.com.au, ladder from the Squiggle API, trade history from Wikipedia. Unofficial and not affiliated with the AFL.</p>`);
  }

  // ---------------- share link ----------------
  function writeHash() {
    if (!S.clubs.length) { history.replaceState(null, '', location.pathname); return; }
    const parts = [`c=${S.clubs.join(',')}`];
    if (S.legs.size) parts.push('l=' + [...S.legs].map(([id, to]) => `${id}:${to}`).join(','));
    const ms = S.clubs.filter((c) => S.modes[c] && S.modes[c] !== CLUBS[c].mode).map((c) => `${c}:${MODE_CODE[S.modes[c]]}`);
    if (ms.length) parts.push('m=' + ms.join(','));
    if (S.rated) parts.push('r=1');
    history.replaceState(null, '', '#' + parts.join('&'));
  }
  const isClub = (c) => Object.hasOwn(CLUBS, c);
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const cs = (h.get('c') || '').split(',').filter(isClub);
    for (const c of cs) addClub(c, { view: false });
    for (const pair of (h.get('l') || '').split(',').filter(Boolean)) {
      const [id, to] = pair.split(':');
      const a = assets.get(id);
      if (a && isClub(to) && to !== a.owner && addClub(a.owner, { view: false }) && addClub(to, { view: false })) S.legs.set(id, to);
    }
    for (const pair of (h.get('m') || '').split(',').filter(Boolean)) { const [c, m] = pair.split(':'); if (isClub(c) && S.clubs.includes(c) && Object.hasOwn(MODE_FROM, m)) S.modes[c] = MODE_FROM[m]; }
    S.rated = h.get('r') === '1' && S.legs.size > 0;
    S.view = S.clubs[0] || null;
  }

  // ---------------- graphic export ----------------
  async function saveGraphic() {
    const cv = await drawGraphic();
    cv.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mega-trade.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Graphic saved'); }, 'image/png');
  }
  async function drawGraphic() {
    const W = 1080;
    const rows = S.clubs.map((c) => ({ c, get: legsTo(c).map((id) => label(id, c)), give: legsFrom(c).map((id) => label(id, c)) }));
    const res = S.rated ? rate() : null;
    const lineH = 44;
    const rowH = rows.map((r) => Math.max(190, Math.max(r.get.length, r.give.length, 1) * lineH + 70));
    const H = 210 + 90 + sum(rowH) + rows.length * 8 + 70;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await Promise.all([document.fonts.load('64px Anton'), document.fonts.load('800 40px "Barlow Condensed"'), document.fonts.load('600 20px Barlow')]); } catch { /* fall back to system fonts */ }
    const imgs = {};
    await Promise.all(S.clubs.map((c) => new Promise((ok) => { const im = new Image(); im.onload = () => { imgs[c] = im; ok(); }; im.onerror = ok; im.src = J.dataUrl(c, '#ffffff'); })));
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // header
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#a2a2b0'; g.font = '700 22px "Barlow Condensed", sans-serif';
    g.fillText('TRADE MACHINE · 2026 TRADE PERIOD', W / 2, 52);
    g.font = '118px Anton, Impact, sans-serif';
    const wm1 = 'MEGA ', wm2 = '⇄ ', wm3 = 'TRADE';
    const w1 = g.measureText(wm1).width, w3 = g.measureText(wm3).width; g.font = '700 90px Barlow, sans-serif'; const w2 = g.measureText(wm2).width;
    let x = W / 2 - (w1 + w2 + w3) / 2; g.textAlign = 'left';
    g.font = '118px Anton, Impact, sans-serif'; g.fillStyle = '#fff'; g.fillText(wm1, x, 178); x += w1;
    g.font = '700 90px Barlow, sans-serif'; g.fillStyle = '#ffb000'; g.fillText(wm2, x, 168); x += w2;
    g.font = '118px Anton, Impact, sans-serif'; g.fillStyle = '#ffb000'; g.fillText(wm3, x, 178);
    g.fillStyle = '#ffb000'; g.fillRect(0, 198, W, 12);
    // column heads
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '60px Anton, Impact, sans-serif';
    const colX1 = 200 + (W - 200) / 4, colX2 = 200 + (3 * (W - 200)) / 4;
    g.fillText('GET', colX1, 280); g.fillText('GIVE', colX2, 280);
    let y = 300;
    rows.forEach((r, i) => {
      y += 8;
      const h = rowH[i]; const club = CLUBS[r.c];
      g.fillStyle = club.c1; g.fillRect(0, y, W, h);
      const grd = g.createLinearGradient(0, y, W, y); grd.addColorStop(0, 'rgba(0,0,0,.18)'); grd.addColorStop(.4, 'rgba(0,0,0,.04)'); grd.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = grd; g.fillRect(0, y, W, h);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(200, y, 5, h); g.fillRect(200 + (W - 200) / 2, y, 5, h);
      const graded = res && res[r.c] && (r.get.length || r.give.length);
      if (imgs[r.c]) { const sz = graded ? 118 : 140; g.drawImage(imgs[r.c], graded ? 12 : 30, y + h / 2 - sz / 2, sz, sz); }
      const drawCol = (items, cx) => {
        const n = Math.max(items.length, 1); const top = y + h / 2 - ((n - 1) * lineH) / 2 + 14;
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6;
        items.forEach((t, j) => { let size = 40; g.font = `800 ${size}px "Barlow Condensed", sans-serif`; while (g.measureText(t).width > (W - 200) / 2 - 36 && size > 22) { size -= 2; g.font = `800 ${size}px "Barlow Condensed", sans-serif`; } g.fillText(t, cx, top + j * lineH); });
        if (!items.length) { g.globalAlpha = .5; g.font = '700 30px "Barlow Condensed", sans-serif'; g.fillText('—', cx, top); g.globalAlpha = 1; }
        g.shadowBlur = 0;
      };
      drawCol(r.get, colX1); drawCol(r.give, colX2);
      if (graded) {
        const gr = res[r.c].grade; const col = { A: '#3ddc97', B: '#cde86b', C: '#ffc94d', D: '#ff9a5c', F: '#ff6b6b' }[gr[0]];
        g.fillStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.arc(166, y + h / 2, 27, 0, Math.PI * 2); g.fill();
        g.fillStyle = col; g.font = '34px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.fillText(gr, 166, y + h / 2 + 12);
      }
      y += h;
    });
    g.fillStyle = '#ffb000'; g.fillRect(0, y + 8, W, 6);
    g.fillStyle = '#a2a2b0'; g.font = '600 22px Barlow, sans-serif'; g.textAlign = 'center';
    g.fillText('Build your own: mondayjeffrey.com/afl-trade', W / 2, y + 50);
    return cv;
  }

  // ---------------- drag & drop (mouse/pen; touch uses tap menus) ----------------
  let drag = null, suppressClick = false;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const el = e.target.closest('[data-asset]');
    if (!el || el.classList.contains('used') && !S.legs.has(el.dataset.asset)) return;
    if (e.target.closest('.rm, .dest, .info-btn')) return;
    drag = { id: el.dataset.asset, fromBoard: !!el.closest('#board'), x0: e.clientX, y0: e.clientY, started: false, ghost: null, target: null };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true; closeMenu();
      const a = assets.get(drag.id);
      drag.ghost = document.createElement('div'); drag.ghost.className = 'ghost-drag';
      drag.ghost.textContent = `${label(drag.id, a.owner, 'list')} · ${fmt(value(drag.id).points)}`;
      document.body.appendChild(drag.ghost); document.body.classList.add('dragging');
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
    if (drag.target && drag.target !== cell) drag.target.classList.remove('drop-ok', 'drop-bad');
    drag.target = cell;
    if (cell) cell.classList.add(dropValid(cell, drag.id) ? 'drop-ok' : 'drop-bad');
  });
  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.started) return;
    suppressClick = true; setTimeout(() => (suppressClick = false), 0);
    d.ghost.remove(); document.body.classList.remove('dragging');
    if (d.target) { d.target.classList.remove('drop-ok', 'drop-bad'); dropOn(d.target, d.id); }
    else if (d.fromBoard && S.legs.has(d.id) && e.target.closest('#browser')) removeLeg(d.id); // board chip dragged back to the list
  });
  function cancelDrag() {
    if (!drag) return;
    drag.ghost?.remove(); drag.target?.classList.remove('drop-ok', 'drop-bad');
    document.body.classList.remove('dragging'); drag = null;
  }
  document.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  function dropValid(cell, id) {
    const owner = assets.get(id).owner;
    return cell.dataset.side === 'get' ? cell.dataset.club !== owner : cell.dataset.club === owner;
  }
  function dropOn(cell, id) {
    const club = cell.dataset.club, side = cell.dataset.side; const owner = assets.get(id).owner;
    if (side === 'get') {
      if (club === owner) return toast(`That's already ${CLUBS[owner].short}'s — drop it on another club's GET.`);
      setLeg(id, club);
    } else {
      if (club !== owner) return toast(`${label(id, owner, 'list')} belongs to ${CLUBS[owner].name}.`);
      const others = S.clubs.filter((c) => c !== owner);
      if (!others.length) return toast('Add another club first.');
      if (others.length === 1) setLeg(id, others[0]);
      else openDestMenu(id, cell);
    }
  }

  // ---------------- events ----------------
  document.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); return; }
    const t = e.target;
    if (!t.closest('#menu') && !menu.hidden && !t.closest('[data-asset],.dest')) closeMenu();
    let el;
    if ((el = t.closest('[data-find]'))) { closeMenu(); $('#find').value = ''; findPlayer(el.dataset.find); return; }
    if ((el = t.closest('[data-send]'))) { if (el.disabled) return; const id = el.dataset.send; setLeg(id, el.dataset.to); closeMenu(); focusAsset(id); return; }
    if ((el = t.closest('[data-more]'))) { openClubPicker(el.dataset.more, menu.querySelector('.mh') || el); return; }
    if ((el = t.closest('[data-send-menu]'))) { closeModal(); const id = el.dataset.sendMenu; const sel = `[data-asset="${CSS.escape(id)}"]`; const onBoard = document.querySelector('#board ' + sel), inList = document.querySelector('#browserBody ' + sel); if (!onBoard && inList) inList.scrollIntoView({ block: 'nearest' }); openAssetMenu(id, onBoard || inList || $('#board')); return; }
    if ((el = t.closest('[data-rm]'))) { e.stopPropagation(); removeLeg(el.dataset.rm); closeMenu(); return; }
    if ((el = t.closest('[data-dest]'))) { e.stopPropagation(); openDestMenu(el.dataset.dest, el); return; }
    if ((el = t.closest('[data-info]'))) { e.stopPropagation(); closeMenu(); playerModal(el.dataset.info); return; }
    if ((el = t.closest('[data-remove-club]'))) { const c = el.dataset.removeClub; if (legsFrom(c).length + legsTo(c).length && !confirm(`Remove ${CLUBS[c].name} and everything they're trading?`)) return; removeClub(c); return; }
    if ((el = t.closest('.club-pick'))) { const c = el.dataset.club; if (S.view !== c) S.q = ''; if (S.clubs.includes(c)) { if (S.view !== c) { S.view = c; renderAll(); } else if (!legsFrom(c).length && !legsTo(c).length) removeClub(c); else { S.view = c; renderAll(); } } else { addClub(c); changed(); } return; }
    if ((el = t.closest('[data-tab]'))) { S.view = el.dataset.tab; S.q = ''; renderTabs(); renderBrowser(); return; }
    if ((el = t.closest('[data-mode]'))) { S.modes[S.view] = el.dataset.mode; changed(); return; }
    if ((el = t.closest('[data-filter]'))) { S.filter = el.dataset.filter; renderBrowser(); return; }
    if ((el = t.closest('[data-asset]'))) { if (el.closest('#menu')) return; openAssetMenu(el.dataset.asset, el); return; }
    if (t.closest('#btnHow') || t.closest('#howLink')) { e.preventDefault(); howModal(); return; }
    if (t.closest('#btnReset')) { if (S.legs.size && !confirm('Clear the whole trade?')) return; S.clubs = []; S.legs.clear(); S.view = null; S.rated = false; S.modes = {}; changed(); return; }
    if (t.closest('#btnRate')) { S.rated = true; changed(); $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.closest('#btnShare')) { writeHash(); (navigator.clipboard?.writeText(location.href) || Promise.reject()).then(() => toast('Link copied — paste it anywhere'), () => prompt('Copy this link:', location.href)); return; }
    if (t.closest('#btnImage')) { saveGraphic(); return; }
    if (t === modal || t.closest('#modalX')) { closeModal(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (drag) cancelDrag(); if (!menu.hidden) closeMenu(true); else closeModal(); }
    if (e.target.id === 'find' && (e.key === 'ArrowDown' || e.key === 'Enter') && !menu.hidden) { const b = menu.querySelector('[data-find]'); if (b) { e.preventDefault(); if (e.key === 'Enter') b.click(); else b.focus(); } return; }
    if (!menu.hidden && menu.contains(e.target) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); const items = [...menu.querySelectorAll('button:not([disabled])')]; const i = items.indexOf(e.target);
      if (e.key === 'ArrowUp' && i <= 0 && menuReturn?.id === 'find') { menuReturn.focus(); return; }
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bchip, .info-btn')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'find') { findMenu(e.target); return; } });
  document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; const pos = e.target.selectionStart; renderBrowser(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'sortby') { S.sort = e.target.value; renderBrowser(); } });
  window.addEventListener('resize', () => { if (document.activeElement?.id !== 'find') closeMenu(); }); // phone keyboards resize the page while typing
  $('#browserBody').addEventListener('scroll', closeMenu, { passive: true });

  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

  // ---------------- boot ----------------
  $('#asOf').textContent = D.asOf;
  readHash();
  renderAll();
  window.addEventListener('hashchange', () => { S.clubs = []; S.legs.clear(); S.modes = {}; S.rated = false; S.q = ''; readHash(); renderAll(); });
  window.__trade = { S, value, rate, assets, M, drawGraphic };
})();
