/* Cricboy Arcade screens: the run board, the match (on the classic live replay), reviews, scoring, the shop and the end
   of a run. The rules live in js/arcade.js; this file draws them and wires the buttons. */
(function () {
  'use strict';
  const CB = window.CB, A = CB.ARC, X = window.CBApp;
  const { SCREENS, ACT, esc, bar, ui } = X;
  const REC = 'cricboy.arcrec.v1';
  const getRec = () => { try { return JSON.parse(localStorage.getItem(REC) || '{}'); } catch (e) { return {}; } };
  const putRec = r => { try { localStorage.setItem(REC, JSON.stringify(r)); } catch (e) { } };
  const peekRun = () => { try { const s = JSON.parse(localStorage.getItem(X.ARC) || 'null'); return s && s.W && s.W.arcade && !s.W.arcade.over && !s.W.arcade.won ? s.W.arcade : null; } catch (e) { return null; } };
  const R = () => X.W && X.W.arcade, me = () => CB.user(X.W);
  const go = X.go, render = X.render;
  const save = () => X.save();
  ui.arc = ui.arc || { v: 1, role: 'top' };
  const ROLES = [['top', 'Batter', '🏏', 'top', null], ['wk', 'Keeper', '🧤', 'wk', null], ['ar', 'All-rounder', '🔀', 'ar', 'swing'], ['fast', 'Fast bowler', '⚡', 'pace', 'fast'],
    ['swing', 'Swing bowler', '🌬️', 'pace', 'swing'], ['finger', 'Finger spinner', '🌀', 'spin', 'finger'], ['wrist', 'Wrist spinner', '🪄', 'spin', 'wrist']];
  const money = n => `<span class="arc-money">$${n}</span>`;
  const strikes = r => `<span class="arc-strikes" title="Selectors' patience">${[0, 1, 2].map(i => `<i class="${i < r.strikes ? 'on' : ''}"></i>`).join('')}</span>`;
  const bat = p => (0.5 * (CB.batComposite(p.a, false) + CB.batComposite(p.a, true))).toFixed(0), bowl = p => p.bowls ? CB.bowlComposite(p.a, p.sub).toFixed(0) : null;
  const ratingLine = p => `Batting ${bat(p)}${bowl(p) ? ' · Bowling ' + bowl(p) : ''}${p.role === 'wk' ? ' · Keeping ' + p.a.KEEP.toFixed(0) : ''}`;

  // ---------------------------------------------------------------- arcade menu
  SCREENS['arc-home'] = () => {
    const rec = getRec(), run = peekRun(), a = ui.arc;
    return `
    <div class="pagehead"><button class="iconbtn" data-a="arc-exit">←</button><h2>🕹️ Arcade</h2></div>
    <p class="mute small">A whole career in about half an hour. Eight antes of three blinds, from the Second XI to the Ashes. Every blind is one match with a score to beat. Miss one and the selectors lose patience: three strikes and you're dropped.</p>
    ${run ? `<button class="btn primary big block mb" data-a="arc-continue">Continue Arcade ${run.v} · ante ${run.ante}, ${esc(A.BLINDS[run.blind].name.toLowerCase())}</button>` : ''}
    <div class="sec-title">Mode</div>
    <div class="arc-modes">${[1, 2, 3].map(v => `<button class="arc-mode ${a.v === v ? 'on' : ''}" data-a="arc-v" data-v="${v}"><div class="n">Arcade ${v}</div><div class="tiny mute">${rec[v] ? (rec[v].won ? `🏆 won ${rec[v].won}×` : `best: ante ${rec[v].best}`) + ` · ${rec[v].runs} run${rec[v].runs > 1 ? 's' : ''}` : 'not played yet'}</div></button>`).join('')}</div>
    <div class="sec-title">Your cricketer</div>
    <div class="choice-grid">${ROLES.map(([id, t, ic]) => `<button class="choice ${a.role === id ? 'on' : ''}" data-a="arc-role" data-v="${id}"><div class="t">${ic} ${t}</div></button>`).join('')}</div>
    <p class="tiny faint mt">Every run starts from the same fringe state player. What happens next is up to you.</p>
    ${bar(`<button class="btn primary big" data-a="arc-start">Start Arcade ${a.v} ▶</button>`)}`;
  };
  ACT['arc-home'] = () => { X.saveClassic(); if (X.W && !X.W.arcade) { X.W = null; X.pending = null; } go('arc-home'); };
  ACT['arc-v'] = d => { ui.arc.v = +d.v; render(); };
  ACT['arc-role'] = d => { ui.arc.role = d.v; render(); };
  ACT['arc-start'] = () => {
    if (peekRun() && !confirm('Start a new run? Your current arcade run will be lost.')) return;
    const [, , , role, sub] = ROLES.find(x => x[0] === ui.arc.role);
    const seed = (Math.random() * 4294967295) >>> 0, n = CB.genName(CB.rng(seed ^ 77), 'AUS');
    X.W = A.newRun({ seed, v: ui.arc.v, role, sub, first: n.first, last: n.last });
    X.pending = null; X.live = null;
    save(); go('arc-board');
  };
  ACT['arc-continue'] = () => {
    try {
      const s = JSON.parse(localStorage.getItem(X.ARC));
      const W = s.W; let maxId = 0;
      for (const p of Object.values(W.players)) { CB.refresh(p); maxId = Math.max(maxId, p.id); }
      CB.setNextId(maxId + 1);
      X.W = W; X.pending = null; X.live = null;
    } catch (e) { console.error(e); X.toast('Could not load that run'); return; }
    const r = R();
    go(r.stage === 'shop' ? 'arc-shop' : r.stage === 'cashout' ? 'arc-result' : r.stage === 'over' || r.stage === 'won' ? 'arc-over' : 'arc-board');
  };
  ACT['arc-menu'] = () => { save(); go('arc-home'); };
  // leaving the arcade: the run is saved in its own slot and out of memory, so classic screens never see it
  ACT['arc-exit'] = () => { if (R()) save(); if (X.W && X.W.arcade) { X.W = null; X.live = null; } go('title'); };

  // ---------------------------------------------------------------- the run board
  function arcBar() {
    const r = R(), p = me();
    return `<header class="arcbar"><button class="iconbtn" data-a="arc-menu" aria-label="Arcade menu">☰</button>
      <div class="grow"><div class="ab-name">Arcade ${r.v} · ${esc(p.first)} ${esc(p.last)}</div><div class="tiny mute">${esc(ratingLine(p))}</div></div>
      ${strikes(r)}${money(r.money)}</header>`;
  }
  function blindCard(r, i) {
    const b = A.BLINDS[i], state = i < r.blind ? 'done' : i === r.blind ? 'now' : 'next';
    const boss = i === 2 ? A.boss(r.bosses[r.ante - 1]) : null;
    return `<div class="blind ${b.id} ${state}"><div class="bn">${boss ? boss.icon + ' ' + esc(boss.name) : esc(b.name)}</div>
      <div class="bt"><span class="tiny mute">Target</span><b>${A.target(r, r.ante, i)}</b></div>
      <div class="tiny mute">${boss ? esc(boss.text) : i === 0 ? 'A gentle start' : 'Turn it up'}</div>
      <div class="br">${state === 'done' ? '✓ cleared' : 'Reward $' + (b.reward + (boss && boss.id === 'chair' ? 3 : 0))}</div></div>`;
  }
  function buildPanel(compact) {
    const r = R(), p = me();
    if (r.v === 1) return `<div class="card"><h3 class="mb">Your cards <span class="faint small">${r.jokers.length}/${A.JOKER_SLOTS}</span></h3>${r.jokers.length ? `<div class="jrow">${r.jokers.map((j, i) => jokerHTML(j.id, j, compact ? null : `<button class="btn sm ghost" data-a="arc-sell" data-v="${i}">Sell $${Math.floor(A.joker(j.id).cost / 2)}</button>`)).join('')}</div>` : '<p class="faint small">None yet. Buy cards in the shop after each match.</p>'}</div>`;
    if (r.v === 2) {
      const by = {}; r.deck.forEach(c => { const k = c.id + ':' + c.lv; by[k] = (by[k] || 0) + 1; });
      return `<div class="card"><h3 class="mb">Your deck <span class="faint small">${r.deck.length} cards · hand of ${A.PHASE.hand} · ${r.discards} redraws a match</span></h3><div class="deckrow">${Object.entries(by).map(([k, n]) => { const [id, lv] = k.split(':'), d = A.card(id); return `<span class="dcard ${d.side}">${d.icon} ${esc(d.name)}${+lv > 1 ? ` <b>Lv${lv}</b>` : ''}${n > 1 ? ` ×${n}` : ''}</span>`; }).join('')}</div></div>`;
    }
    return `<div class="card"><div class="row between"><h3>Momentum</h3><span class="chain">×${r.chain}</span></div><p class="small mute">Three calls a match. A good read adds ×0.5, a poor read resets it to ×1. Your score is multiplied by your momentum.</p>${r.items.length ? `<div class="mt">${r.items.map(id => `<span class="chip">${A.item(id).icon} ${esc(A.item(id).name)}</span>`).join(' ')}</div>` : ''}</div>`;
  }
  function jokerHTML(id, inst, btn) {
    const d = A.joker(id), grows = d.grow && inst ? ` <span class="faint">(${inst.n || 0} so far)</span>` : '';
    return `<div class="joker r${d.r} ${d.kind}"><div class="ji">${d.icon}</div><div class="jn">${esc(d.name)}</div><div class="jt">${esc(d.text)}${grows}</div>${btn || ''}</div>`;
  }
  SCREENS['arc-board'] = () => {
    const r = R(), ante = A.ANTES[r.ante - 1];
    return `${arcBar()}
    <div class="arc-ante"><div class="kicker">Ante ${r.ante} of 8</div><h2>${esc(ante.name)}</h2></div>
    <div class="blinds">${A.BLINDS.map((b, i) => blindCard(r, i)).join('')}</div>
    ${buildPanel(false)}
    <p class="tiny faint">Score = points × mult. Points: 1 a run, ${A.WK_PTS} a wicket, ${A.CT_PTS} a catch. One review a match: send your own dismissal, or a chance dropped off your bowling, upstairs.</p>
    ${bar(`<button class="btn primary big" data-a="arc-play">Play ${esc(A.BLINDS[r.blind].name.toLowerCase())} ▶</button>`)}`;
  };
  ACT['arc-sell'] = d => { if (A.sellJoker(X.W, +d.v)) { save(); render(); } };

  // ---------------------------------------------------------------- the match
  ACT['arc-play'] = () => {
    const W = X.W, p = me(), U = A.buildMatch(W), st = A.startMatch(W, U), first = A.firstDecision(W, U, st);
    const moments = first ? [first] : [];
    X.live = { U, slot: null, moments, calls: [], cur: 0, events: X.buildTimeline(U, p, moments), ei: 0, shown: [], speed: 1, sb: { k: 0, runs: 0, wk: 0, balls: 0 },
      done: false, momentOpen: false, skipped: [], debut: false, final: false, arcade: true, st, reviewAfter: null,
      onChoose, onFinal: () => { }, sheet, onEvent, overlay };
    ui.scTab = 0;
    go('arc-pre');
  };
  SCREENS['arc-pre'] = () => {
    const L = X.live, U = L.U, M = U.M, r = R(), p = me(), t0 = M.teams[0], t1 = M.teams[1];
    const boss = U.boss, pos = U.sides[0].indexOf(p.id) + 1;
    return `${arcBar()}
    <div class="card glow reveal"><div class="row between">${X.lvBadge(U.level)}<span class="tiny faint">Ante ${r.ante} · ${esc(A.BLINDS[r.blind].name)}</span></div>
      <div class="vs mt">${esc(t0.name)}<br><span class="mute" style="font-size:16px">v</span> ${esc(t1.name)}</div><div class="mute small mt">${esc(U.cfg.venue || '')}</div>
      <div class="arc-target mt"><span class="tiny mute">Target</span><b>${A.target(r, r.ante, r.blind)}</b></div></div>
    ${boss ? `<div class="news gold">${boss.icon} <b>${esc(boss.name)}</b>: ${esc(boss.text)}</div>` : ''}
    <div class="card"><h3 class="mb">Conditions</h3><div class="row wrap" style="gap:6px">${X.conditions(M).map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div>
      <p class="small faint mt">You bat at ${pos}.</p></div>
    ${buildPanel(true)}
    ${bar('<button class="btn primary big" data-a="play">Start match</button>')}`;
  };
  // a choice at a moment / phase: the arcade rules decide what it does and what comes next
  function onChoose(L, mo, i) {
    const r = A.decide(X.W, L.U, L.st, mo, i);
    if (r.next) L.moments.push(r.next);
    return r.plan;
  }
  // the sheets: phase cards (2), calls with momentum (3), plain calls (1), and the verdict after
  function sheet(mo) {
    const r = R(), L = X.live, p = me();
    const span = mo.side === 'bat' ? 'innings' : mo.captain ? 'match' : 'spell';
    if (mo.done) {
      return `<div class="moment"><div class="sheet"><div class="handle"></div><div class="kicker">${mo.phase ? 'Your plan' : 'Your call'}</div><h2>${esc(mo.choice || mo.title)}</h2>
        <div class="verdict ${mo.fit > 0 ? 'good' : mo.fit < 0 ? 'bad' : ''}">${esc(mo.verdict || '')}</div>
        ${r.v === 3 ? `<div class="chainbig">Momentum ×${r.chain}</div>` : ''}
        <button class="btn primary block big mt" data-a="mom-close">Play on</button></div></div>`;
    }
    const cues = `<div class="cues">${(mo.cues || []).map(c => `<span class="badge">${esc(c)}</span>`).join('')}</div>`;
    if (mo.phase) {
      const opts = mo.options.map((o, i) => {
        const d = A.card(o.a), m = A.cardMods(o.a, o.lv, mo.cue).m, side = d.side;
        const arrows = (v, good) => { const n = Math.min(3, Math.round(Math.abs(v) / 0.12)); return n ? (v * (good ? 1 : -1) > 0 ? '▲' : '▼').repeat(n) : '·'; };
        const stats = side === 'bat' ? `Safety ${arrows(-(m.W || 0), true)} · Boundaries ${arrows(m.B || 0, true)} · Singles ${arrows(m.R || 0, true)}`
          : `Wickets ${arrows(m.W || 0, true)} · Runs saved ${arrows(-((m.R || 0) + (m.B || 0)), true)}`;
        const tag = o.on ? `<span class="fit on">✦ Fits: goal ×2.5</span>` : o.off ? `<span class="fit off">✗ Wrong conditions: goal ×0</span>` : `<span class="fit">Best: ${esc(d.condText)}</span>`;
        return `<button class="opt pcard2 ${o.on ? 'on' : o.off ? 'off' : ''}" data-a="mom" data-v="${i}"><span class="ic">${d.icon}</span><span class="grow"><div><b>${esc(d.name)}</b>${o.lv > 1 ? ` <span class="lv">Lv${o.lv}</span>` : ''}</div><div class="tiny mute">${stats}</div><div class="tiny">Goal: ${esc(d.goalText)}${o.lv > 1 ? ` (×${o.lv})` : ''}</div>${tag}</span></button>`;
      }).join('');
      return `<div class="moment"><div class="sheet"><div class="handle"></div><div class="kicker">🃏 ${mo.side === 'bat' ? 'Batting' : 'Bowling'} · phase ${L.st.phases.length + 1}</div><h2>${esc(mo.title)}</h2><div class="sit">${esc(mo.situation)}</div>
        <p class="small">${esc(mo.text)}</p>${cues}${opts}
        <button class="btn ghost block mt" data-a="arc-redraw" ${L.st.discards ? '' : 'disabled'}>Redraw hand (${L.st.discards} left)</button></div></div>`;
    }
    const rev = mo.revealed;
    const opts = mo.options.map((o, i) => {
      const t = rev ? `<span class="godread ${rev[i] > 0 ? 'good' : rev[i] < 0 ? 'bad' : ''}">${rev[i] > 0 ? '🔍 Good read' : rev[i] < 0 ? '🔍 Poor read' : '🔍 Fair'}</span>` : '';
      return `<button class="opt" data-a="mom" data-v="${i}"><span class="ic letter">${'ABC'[i]}</span><span class="grow"><b>${esc(o.t)}</b></span>${t}</button>`;
    }).join('');
    return `<div class="moment"><div class="sheet"><div class="handle"></div>
      <div class="kicker">${mo.captain ? '🎖️ Captain\'s call' : r.v === 3 ? `🔥 Call ${L.st.n + 1} of ${A.READS} · momentum ×${r.chain}` : mo.bonus ? '🔥 Bonus moment' : '⚡ Key moment'}</div><h2>${esc(mo.title)}</h2><div class="sit">${esc(mo.situation)}</div>
      <p>${esc(mo.text)}</p>${cues}
      <p class="tiny faint">Read the conditions and the game: the right call lifts you for the rest of this ${span}.</p>
      ${opts}
      ${r.v === 3 && r.items.includes('second') && !rev ? '<button class="btn ghost block mt" data-a="arc-second">🔍 Use Second Opinion</button>' : ''}</div></div>`;
  }
  ACT['arc-redraw'] = () => { const L = X.live, mo = L.moments[L.cur]; if (A.redraw(X.W, L.U, L.st, mo)) render(); };
  ACT['arc-second'] = () => { const L = X.live, mo = L.moments[L.cur]; if (A.reveal(X.W, L.U, mo)) render(); };
  // reviews: the replay stops on your dismissal or a chance dropped off your bowling, while you have one left
  function onEvent(e) {
    const L = X.live;
    if (!L.st.reviews || !(e.meOut || e.myDrop)) return;
    const pt = A.reviewPoint(L.U, me(), L.reviewAfter);
    if (!pt || pt.k !== e.k || pt.i !== e.li) return;
    L.reviewOpen = pt; L.paused = true; clearTimeout(L.timer); render();
    return 'pause';
  }
  function overlay() {
    const L = X.live, pt = L.reviewOpen; if (!pt) return '';
    return `<div class="moment"><div class="sheet"><div class="handle"></div><div class="kicker">📺 Review</div>
      <h2>${pt.kind === 'out' ? `Out for ${pt.runs}?` : 'Dropped!'}</h2>
      <p>${pt.kind === 'out' ? "You've been given out." : 'A chance went down off your bowling.'} You have ${L.st.reviews} review this match. Send it upstairs and that ball is bowled again on fresh luck.</p>
      <button class="btn primary block big" data-a="arc-review">📺 Review it</button>
      <button class="btn ghost block mt" data-a="arc-accept">${pt.kind === 'out' ? 'Walk off' : 'Bowl on'}</button></div></div>`;
  }
  ACT['arc-review'] = () => {
    const L = X.live, W = X.W, p = me(), pt = L.reviewOpen; if (!pt) return;
    A.review(W, L.U, L.st, pt);
    L.reviewOpen = null; L.paused = false; L.reviewAfter = pt;
    // the future has changed: undecided moments go, and the next one is found again from the last decision
    L.moments = L.moments.filter(m => m.done);
    const lastDone = L.moments.filter(m => !m.phase).slice(-1)[0] || null;
    const nx = A.resume(W, L.U, L.st, lastDone); if (nx) L.moments.push(nx);
    L.events = X.buildTimeline(L.U, p, L.moments);
    const me_ = L.U.sides[L.U.ti].indexOf(p.id), I = L.U.M.inns[pt.k], B = I.log[pt.i];
    const stillOut = pt.kind === 'out' ? B && B.w === 'W' && B.x && B.x.out === me_ : B && B.w === 'W';
    const msg = pt.kind === 'out' ? (stillOut ? '📺 Review: the decision stands. Out.' : '📺 Review: overturned! Not out.') : (stillOut ? '📺 Review: it was out! Wicket.' : '📺 Review: not out. No luck.');
    const ev = { k: pt.k, html: `<b>${msg}</b>`, cls: stillOut === (pt.kind === 'out') ? 'w' : 'me ms', sc: L.sb };
    L.shown.push(ev);
    L.ei = L.events.findIndex(x => !x.moment && (x.k > pt.k || (x.k === pt.k && x.li != null && x.li >= pt.i)));
    if (L.ei < 0) L.ei = L.events.length;
    if (L.events[L.ei] && L.events[L.ei].meOut && stillOut && pt.kind === 'out') L.ei++;  // the same dismissal, already shown
    X.buzz(30); render();
    L.timer = setTimeout(X.stepLive, 700);
  };
  ACT['arc-accept'] = () => { const L = X.live; L.reviewAfter = L.reviewOpen; L.reviewOpen = null; L.paused = false; render(); L.timer = setTimeout(X.stepLive, 300); };

  // ---------------------------------------------------------------- the score
  SCREENS['arc-result'] = () => {
    const r = R(), L = X.live;
    if (L && L.arcade && !L.res) { L.res = A.finish(X.W, L.U, L.st); L.final = true; save(); }
    const res = (L && L.arcade && L.res) || r.lastRes;
    if (!res) return SCREENS['arc-board']();
    const b = A.BLINDS[r.hist.length ? r.hist[r.hist.length - 1].blind : r.blind];
    const M = L && L.arcade ? L.U.M : null;
    return `${arcBar()}
    <div class="card result-banner reveal ${res.pass ? 'won' : 'lost'}"><span class="badge ${res.pass ? 'win' : 'loss'}">${res.pass ? 'Target beaten' : res.strike ? 'Missed: a strike' : 'Missed'}</span>
      <div class="formula mt"><span class="fc">${res.chips}</span><span class="fx">×</span><span class="fm">${res.mult}</span><span class="fx">=</span><span class="fs">${res.score}</span></div>
      <div class="small mute">Target ${res.target} · ${esc(b.name)}</div><div class="small mt">${esc(res.line)}</div></div>
    <div class="card list"><h3 class="mb">Scoring</h3>${res.parts.map((x, i) => `<div class="item row between pop" style="animation-delay:${i * 0.12}s"><span>${esc(x.t)}</span><span class="num">${x.chips != null ? `<span class="pc">+${x.chips} pts</span>` : x.mult != null ? `<span class="pm">+${x.mult} mult</span>` : x.xmult != null ? `<span class="pm">×${x.xmult} mult</span>` : ''}</span></div>`).join('')}</div>
    ${res.money.length ? `<div class="card list"><h3 class="mb">Cash</h3>${res.money.map(m => `<div class="item row between"><span>${esc(m[0])}</span><span class="num arc-money">+$${m[1]}</span></div>`).join('')}</div>` : ''}
    ${M ? `<div class="sec-title">Scorecard</div><div class="seg mb">${M.inns.map((I, i) => `<button class="${ui.scTab === i ? 'on' : ''}" data-a="sctab" data-v="${i}">${esc(M.teams[I.bat].short || M.teams[I.bat].name)} ${i >= 2 ? '2nd' : '1st'}</button>`).join('')}</div>${X.scorecardHTML(M, M.inns[ui.scTab] || M.inns[0])}` : ''}
    ${bar(r.over || r.won ? `<button class="btn primary big" data-a="arc-end">${r.won ? '🏆 The end of the run' : 'Dropped. See your run'}</button>` : `<button class="btn primary big" data-a="arc-shop-open">To the shop ▶</button>`)}`;
  };
  ACT['arc-end'] = () => { X.live = null; go('arc-over'); };

  // ---------------------------------------------------------------- the shop
  ACT['arc-shop-open'] = () => { const r = R(); if (r.stage === 'cashout') A.openShop(X.W); X.live = null; save(); go('arc-shop'); };
  SCREENS['arc-shop'] = () => {
    const r = R(), p = me(), S = r.shop;
    if (!S) return SCREENS['arc-board']();
    const P = S.pack;
    const pack = `<div class="card"><h3 class="mb">Net session <span class="faint small">$${P.cost} · +5 to one skill</span></h3>${P.bought ? '<p class="faint small">Done for this shop.</p>' : `<div class="row wrap" style="gap:8px">${P.skills.map(k => { const f = CB.FOCUS.find(x => x.id === k), l = CB.focusLabel(f, p); return `<button class="btn sm" data-a="arc-pack" data-v="${k}" ${r.money < P.cost ? 'disabled' : ''}>${l.icon} ${esc(l.name)} <span class="faint">${p.a[k].toFixed(0)}</span></button>`; }).join('')}</div>`}</div>`;
    let body = '';
    if (r.v === 1) {
      body = `<div class="card"><h3 class="mb">For sale</h3><div class="jrow">${S.jokers.map((s, i) => { const d = A.joker(s.id); return s.sold ? `<div class="joker sold"><div class="jn faint">Sold</div></div>` : jokerHTML(s.id, null, `<button class="btn sm primary" data-a="arc-buyj" data-v="${i}" ${r.money < d.cost || r.jokers.length >= A.JOKER_SLOTS ? 'disabled' : ''}>Buy $${d.cost}</button>`); }).join('')}</div>
        <button class="btn ghost block mt" data-a="arc-reroll" ${r.money < A.rerollCost(r) ? 'disabled' : ''}>🔄 Reroll $${A.rerollCost(r)}</button></div>${buildPanel(false)}`;
    } else if (r.v === 2) {
      body = `<div class="card"><h3 class="mb">New cards <span class="faint small">$3 each, added to your deck</span></h3>${S.cards.map((c, i) => { const d = A.card(c.id); return `<div class="item row between"><span>${d.icon} <b>${esc(d.name)}</b><div class="tiny mute">${esc(d.goalText)} · best: ${esc(d.condText)}</div></span>${c.sold ? '<span class="faint small">Bought</span>' : `<button class="btn sm primary" data-a="arc-buyc" data-v="${i}" ${r.money < c.cost ? 'disabled' : ''}>Buy</button>`}</div>`; }).join('')}
        <button class="btn ghost block mt" data-a="arc-reroll" ${r.money < A.rerollCost(r) ? 'disabled' : ''}>🔄 Reroll $${A.rerollCost(r)}</button></div>
        <div class="card"><h3 class="mb">Your deck <span class="faint small">upgrade $${S.upgrade} · remove $${S.remove}</span></h3>${r.deck.map((c, i) => { const d = A.card(c.id); return `<div class="item row between"><span>${d.icon} ${esc(d.name)} <span class="lv">Lv${c.lv}</span></span><span class="row" style="gap:6px"><button class="btn sm" data-a="arc-upc" data-v="${i}" ${r.money < S.upgrade || c.lv >= A.CARD_MAX ? 'disabled' : ''}>▲</button><button class="btn sm ghost" data-a="arc-rmc" data-v="${i}" ${r.money < S.remove || r.deck.length <= 6 ? 'disabled' : ''}>✕</button></span></div>`; }).join('')}</div>`;
    } else {
      const bv = A.bankValue(r);
      body = `<div class="card"><div class="row between"><h3>Momentum</h3><span class="chain">×${r.chain}</span></div>
        ${bv > 0 ? `<p class="small mute">Bank it: turn ×${r.chain} into <b>+${bv}</b> to one skill, for good. Momentum goes back to ×1.</p><div class="row wrap" style="gap:8px">${A.skillSet(p).map(k => { const f = CB.FOCUS.find(x => x.id === k), l = CB.focusLabel(f, p); return `<button class="btn sm" data-a="arc-bank" data-v="${k}">${l.icon} ${esc(l.name)}</button>`; }).join('')}</div>` : '<p class="faint small">Nothing to bank yet. Good reads build momentum.</p>'}</div>
        <div class="card"><h3 class="mb">Tools <span class="faint small">hold up to 2</span></h3>${S.items.map((s, i) => { const d = A.item(s.id); return `<div class="item row between"><span>${d.icon} <b>${esc(d.name)}</b><div class="tiny mute">${esc(d.text)}</div></span>${s.sold ? '<span class="faint small">Bought</span>' : `<button class="btn sm primary" data-a="arc-buyi" data-v="${i}" ${r.money < d.cost || r.items.length >= 2 ? 'disabled' : ''}>$${d.cost}</button>`}</div>`; }).join('')}
          ${r.items.length ? `<p class="small mt">Holding: ${r.items.map(id => A.item(id).icon + ' ' + esc(A.item(id).name)).join(', ')}</p>` : ''}
          <button class="btn ghost block mt" data-a="arc-reroll" ${r.money < A.rerollCost(r) ? 'disabled' : ''}>🔄 Reroll $${A.rerollCost(r)}</button></div>`;
    }
    const nb = r.blind === 2 ? `ante ${r.ante + 1}` : A.BLINDS[r.blind + 1].name.toLowerCase();
    return `${arcBar()}<div class="arc-ante"><div class="kicker">Shop</div><h2>Between matches</h2><div class="small mute">Interest: $1 for every $5 you hold when a match ends (up to $5).</div></div>
      ${body}${pack}
      ${bar(`<button class="btn primary big" data-a="arc-next">Next: ${esc(nb)} ▶</button>`)}`;
  };
  const act = (fn, fail) => d => { if (fn(d)) { X.buzz(10); save(); render(); } else X.toast(fail || 'Not enough $'); };
  ACT['arc-pack'] = act(d => A.buyPack(X.W, d.v));
  ACT['arc-buyj'] = act(d => A.buyJoker(X.W, +d.v), 'Not enough $, or no free slot (sell one)');
  ACT['arc-buyc'] = act(d => A.buyCard(X.W, +d.v));
  ACT['arc-upc'] = act(d => A.upgradeCard(X.W, +d.v));
  ACT['arc-rmc'] = act(d => A.removeCard(X.W, +d.v), 'Not enough $, or the deck is too small');
  ACT['arc-buyi'] = act(d => A.buyItem(X.W, +d.v), 'Not enough $, or your hands are full');
  ACT['arc-bank'] = act(d => A.bank(X.W, d.v), 'Nothing to bank');
  ACT['arc-reroll'] = act(() => A.reroll(X.W));
  ACT['arc-next'] = () => { A.nextBlind(X.W); save(); go('arc-board'); window.scrollTo(0, 0); };

  // ---------------------------------------------------------------- the end of a run
  SCREENS['arc-over'] = () => {
    const r = R(); if (!r) return SCREENS['arc-home']();
    if (!r.recorded) {
      const rec = getRec(), x = rec[r.v] || { best: 0, won: 0, runs: 0 };
      x.runs++; x.best = Math.max(x.best, r.ante); if (r.won) x.won = (x.won || 0) + 1;
      rec[r.v] = x; putRec(rec); r.recorded = true;
      try { localStorage.removeItem(X.ARC); } catch (e) { }
    }
    const p = me(), cleared = r.hist.filter(h => h.pass).length;
    return `<div class="center mb reveal"><div class="kicker">${r.won ? '🏆 Legend' : 'Dropped'}</div><h2>${r.won ? 'You won the Ashes' : `Out in ante ${r.ante}`}</h2><div class="mute small">Arcade ${r.v} · ${esc(p.first)} ${esc(p.last)}</div></div>
      <div class="gtiles"><div class="gtile"><div class="l">Ante reached</div><div class="v">${r.ante}</div><div class="s">${esc(A.ANTES[Math.min(7, r.ante - 1)].name)}</div></div>
        <div class="gtile"><div class="l">Blinds cleared</div><div class="v">${cleared}</div><div class="s">of ${r.hist.length} played</div></div>
        <div class="gtile"><div class="l">Best score</div><div class="v">${r.stats.best}</div><div class="s">in one match</div></div>
        <div class="gtile"><div class="l">Career</div><div class="v">${r.stats.runs}<span class="small"> r</span></div><div class="s">${r.stats.wk} wickets · ${r.stats.m} matches</div></div></div>
      <div class="card list"><h3 class="mb">The run</h3>${r.hist.map(h => `<div class="item row between"><span class="small">${h.pass ? '✅' : '❌'} Ante ${h.ante} · ${esc(A.BLINDS[h.blind].name)}<div class="tiny mute">${esc(h.line)}</div></span><span class="num small">${h.score} / ${h.target}</span></div>`).join('')}</div>
      ${bar(`<button class="btn ghost" data-a="arc-home">Arcade menu</button><button class="btn primary big" data-a="arc-again">Again ▶</button>`)}`;
  };
  ACT['arc-again'] = () => { ui.arc.v = R() ? R().v : ui.arc.v; X.W = null; ACT['arc-start'](); };
})();
