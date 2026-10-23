/* Cricboy life: what happens off the field. Random life events between matches (3-5 a season), legacy unlocks that
   carry over between careers, captaincy records, and county-stint offers. Effects are applied to hidden attributes and
   short-term form; the UI only ever shows them as vague chips, never numbers. */
(function (G) {
  'use strict';
  const CB = G.CB = G.CB || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  // ---------------------------------------------------------------- legacy unlocks (persist across careers)
  CB.UNLOCKS = [
    { id: 'runmachine', name: 'Run Machine', icon: '🏭', need: '20 Test hundreds', test: p => p.st.test.h100 >= 20,
      desc: 'Born to bat long: +4 batting potential from day one.' },
    { id: 'whisperer', name: 'Wicket Whisperer', icon: '🪄', need: '300 Test wickets', test: p => p.st.test.w >= 300,
      desc: 'The ball talks to you: +4 bowling potential from day one.' },
    { id: 'prodigy', name: 'Attacking Prodigy', icon: '💥', need: '75 Test sixes', test: p => p.st.test.f6 >= 75,
      desc: 'Fearless strokemaker: +10 attacking potential, a head start and extra power.' },
    { id: 'ironman', name: 'Iron Constitution', icon: '🦾', need: '100 Test caps', test: p => p.st.test.m >= 100,
      desc: 'Rarely breaks down: +6 fitness and stamina potential, far fewer injuries.' },
    { id: 'leader', name: 'Born Leader', icon: '👑', need: 'Captain Australia in 25 Tests', test: p => ((p.captRec || {}).test || {}).m >= 25,
      desc: '+8 mental potential, selectors trust you, and the armband comes years sooner.' },
  ];
  const UKEY = 'cricboy.unlocks.v1';
  const hasLS = () => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } };
  CB.getUnlocks = () => { if (!hasLS()) return {}; try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } };
  CB.checkUnlocks = function (W, p) {
    if (!hasLS() || p.god) return [];  // god mode can't earn legacies
    const u = CB.getUnlocks(), fresh = [];
    for (const x of CB.UNLOCKS) if (!u[x.id] && x.test(p)) { u[x.id] = { by: p.first + ' ' + p.last, y: W.season.year }; fresh.push(x); }
    if (fresh.length) { try { localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) { } }
    return fresh;
  };
  const bump = (p, keys, cap, now) => { for (const k of keys) { p.caps[k] = clamp(p.caps[k] + cap, 0, 99); p.a[k] = clamp(p.a[k] + now, 0, 99); } };
  CB.applyLegacy = function (p, id) {
    if (!id) return;
    p.legacy = id;
    if (id === 'runmachine') bump(p, ['DEF', 'PACE', 'SPIN', 'CON'], 4, 2);
    if (id === 'whisperer') { bump(p, ['ACC', 'STK', 'CRA'], 4, 2); if (!p.bowls) { p.bowls = true; p.sub = p.sub || 'swing'; } }
    if (id === 'prodigy') { bump(p, ['ATT'], 10, 6); p.power = +(p.power + 0.3).toFixed(2); }
    if (id === 'ironman') { bump(p, ['FIT', 'STA'], 6, 4); p.injury = +(p.injury * 0.7).toFixed(2); }
    if (id === 'leader') { bump(p, ['MEN'], 8, 6); p.bias = 1.5; }
    CB.refresh(p);
  };

  // ---------------------------------------------------------------- captaincy record
  CB.recordCaptaincy = function (W, U, p, ev) {
    if (!U.captain || (U.level !== 'shield' && U.level !== 'test')) return;
    p.captRec = p.captRec || {};
    const c = p.captRec[U.level] || (p.captRec[U.level] = { m: 0, w: 0, d: 0, l: 0 });
    const M = U.M;
    c.m++; if (M.result.draw || M.result.tie) c.d++; else if (M.result.winner === U.ti) c.w++; else c.l++;
    if (c.m === 1) ev.push({ type: 'milestone', key: 'capt-' + U.level, text: U.level === 'test' ? `First Test as Australian captain${p.capTestNo ? ' (no. ' + p.capTestNo + ')' : ''}` : `First match as ${CB.stateById(p.team).name} captain` });
    if (U.level === 'test' && U.slot && W.season.series[U.slot.series]) W.season.series[U.slot.series].ucapt = true;
  };
  // the armband weighs on some and lifts others (mental game)
  CB.captainMod = p => 0.0025 * (55 - p.a.MEN);

  // ---------------------------------------------------------------- life events
  // The events themselves are plain data in js/life/*.js (CB.addLife). Each says whose career it fits (who), at what
  // level (lv), age and situation (need); text can use {placeholders}. Options carry fx, or roll between outcomes.
  // fx: form n (+ confident / - off your game, |n| games) | energy n (next session) | attr {K: d} | cap {K: d}
  //     bias d (selectors) | fame d | inj n (miss games) | rest n. Attr keys: the training areas, plus MAIN (your main
  //     discipline), BAT and BOWL (spread across that discipline's skills).
  CB.LIFE = [];
  CB.addLife = list => { for (const e of list) CB.LIFE.push(e); };
  CB.LIFE_WHO = {
    any: () => true,
    bat: p => ['open', 'top', 'mid', 'wk', 'ar'].includes(p.role),
    bowl: p => ['pace', 'spin', 'ar'].includes(p.role),
    pace: p => (p.role === 'pace' || p.role === 'ar') && !CB.isSpinner(p),
    spin: p => (p.role === 'spin' || p.role === 'ar') && CB.isSpinner(p),
    keep: p => p.role === 'wk',
    ar: p => p.role === 'ar',
  };
  CB.LIFE_NEED = {
    quiet: (W, p) => !!(p.lastMatch && p.lastMatch.quiet),
    big: (W, p) => !!(p.lastMatch && (p.lastMatch.runs >= 50 || p.lastMatch.wk >= 3)),
    capt: (W, p) => !!CB.isCaptain(W, p),
    fame: (W, p) => (p.fame || 0) >= 3,
    capped: (W, p) => p.st.test.m > 0,
    uncapped: (W, p) => p.st.test.m === 0,
  };
  CB.LIFE_LEVELS = ['seconds', 'shield', 'test', 'county'];
  // where the user is living right now: the level of his last match
  const lifeLevel = (W, p) => { const h = p.history[p.history.length - 1]; return h ? h.lv : 'seconds'; };
  CB.lifeEligible = function (W, p, e, lv) {
    if (e.who && !CB.LIFE_WHO[e.who](p)) return false;
    if (e.lv && !e.lv.includes(lv)) return false;
    if (e.age && (p.age < e.age[0] || p.age > e.age[1])) return false;
    if (e.need && !CB.LIFE_NEED[e.need](W, p)) return false;
    return true;
  };
  // specific stories (your discipline, your situation) come up more often than generic ones
  const lifeWeight = e => (e.who && e.who !== 'any' ? 1.6 : 1) * (e.need ? 2 : 1) * (e.lv ? 1.3 : 1);

  const CITY = { NSW: 'Sydney', VIC: 'Melbourne', QLD: 'Brisbane', WA: 'Perth', SA: 'Adelaide', TAS: 'Hobart' };
  CB.lifeCtx = function (W, p, r) {
    const st = CB.stateById(p.team), lv = lifeLevel(W, p), nm = q => q.first + ' ' + q.last;
    const mates = W.states[p.team].squad.map(id => W.players[id]).filter(q => q && !q.user);
    const others = CB.STATES.filter(s => s.id !== p.team), oppState = pick(r, others);
    const ser = W.season.series.find(s => s.xi && s.xi.includes(p.id)) || W.season.series.find(s => s.home) || W.season.series[0];
    const natId = ser ? ser.opp : 'ENG', nation = CB.NATIONS[natId].name;
    const county = W.county ? CB.countyById(W.county.id) : (p.countyStints && p.countyStints.length ? CB.countyById(p.countyStints[p.countyStints.length - 1].id) : null);
    let rivals = W.states[oppState.id].squad.map(id => W.players[id]).filter(Boolean);
    if (lv === 'test') rivals = W.nations[natId].squad.map(id => W.players[id]).filter(Boolean);
    if (!p.coach) { const n = CB.genName(CB.rng((W.seed ^ (p.id * 7919)) >>> 0), 'AUS'); p.coach = n.first + ' ' + n.last; }
    const spin = CB.isSpinner(p), bowler = p.role === 'pace' || p.role === 'spin';
    const engName = () => { const n = CB.genName(r, 'ENG'); return n.first + ' ' + n.last; };
    return {
      first: p.first, last: p.last, age: p.age, state: st.name, city: CITY[p.team], ground: st.ground,
      mate: mates.length ? nm(pick(r, mates)) : 'your roommate', mate2: mates.length ? nm(pick(r, mates)) : 'a teammate',
      rival: lv === 'county' ? engName() : rivals.length ? nm(pick(r, rivals)) : 'an opponent', coach: p.coach,
      county: county ? county.name : 'a county side', countyground: county ? county.ground : 'a county ground',
      opp: lv === 'test' ? nation : lv === 'county' ? pick(r, CB.COUNTIES.filter(c => !county || c.id !== county.id)).name : oppState.name,
      nation, skill: bowler ? 'bowling' : p.role === 'wk' ? 'keeping' : 'batting',
      weapon: spin ? 'revs' : 'pace', bowltype: spin ? 'spinner' : 'quick', niggle: p.bowls && !spin && p.role !== 'wk' ? 'side' : 'hamstring',
    };
  };
  const fill = (s, ctx) => String(s).replace(/\{(\w+)\}/g, (m, k) => ctx[k] != null ? ctx[k] : m);
  CB.lifeFill = fill;

  CB.seasonStartCareer = function (W) {
    const p = W.userId && W.players[W.userId]; if (!p) return;
    const r = CB.rngFor(W);
    p.lifeLeft = 3 + Math.floor(r() * 3);
    p.lifeSeen = p.lifeSeen || [];
    W.season.countyOffered = false;
  };
  // remaining user games this season (rough), for spreading 3-5 events across it
  function remainingGames(W, p) {
    const S = W.season, inTests = W.aus.xi.includes(p.id);
    return S.slots.slice(S.cursor).filter(s => s.type === 'dom' || s.type === 'county' || (s.type === 'test' && inTests)).length + 1;
  }
  CB.maybeLifeEvent = function (W) {
    const p = CB.user(W); if (!p) return null;
    if (p.lifeLeft == null) CB.seasonStartCareer(W);
    if (!p.lifeLeft) return null;
    const r = CB.rngFor(W);
    const prob = Math.min(1, p.lifeLeft / Math.max(1, remainingGames(W, p)) * 1.15);
    if (r() > prob) return null;
    const lv = lifeLevel(W, p);
    // a story is told once per career; only a very long career starts hearing the oldest ones again
    const pool = () => { const seen = new Set(p.lifeSeen); return CB.LIFE.filter(e => !seen.has(e.id) && CB.lifeEligible(W, p, e, lv)); };
    let cand = pool();
    if (!cand.length) { p.lifeSeen = p.lifeSeen.slice(Math.ceil(p.lifeSeen.length / 2)); cand = pool(); }
    if (!cand.length) return null;
    const tot = cand.reduce((a, e) => a + lifeWeight(e), 0);
    let u = r() * tot, e = cand[cand.length - 1];
    for (const x of cand) { u -= lifeWeight(x); if (u <= 0) { e = x; break; } }
    p.lifeLeft--; p.lifeSeen.push(e.id);
    const ctx = CB.lifeCtx(W, p, r);
    return { id: e.id, icon: e.icon, title: fill(e.title, ctx), text: fill(e.text, ctx), options: e.options.map(o => fill(o.t, ctx)), ctx };
  };
  CB.resolveLifeEvent = function (W, id, choice, ctx) {
    const p = CB.user(W), e = CB.LIFE.find(x => x.id === id), r = CB.rngFor(W);
    if (!e || !e.options[choice]) return { out: 'Life goes on.', chips: [] };  // a save from before this event was retired
    const o = e.options[choice];
    let fx = o.fx, out = o.out;
    if (o.roll) { let u = r(); for (const x of o.roll) { u -= x.p; if (u <= 0 || x === o.roll[o.roll.length - 1]) { fx = x.fx; out = x.out; break; } } }
    const chips = CB.applyFx(p, fx || {});
    const c = ctx || CB.lifeCtx(W, p, r);
    p.lifeLog = (p.lifeLog || []).concat({ y: W.season.year, t: fill(e.title, c), c: fill(o.t, c) }).slice(-60);
    return { out: fill(out || '', c), chips };
  };
  // pseudo-attributes spread across a discipline
  const SPREAD = { BAT: { DEF: 0.45, CON: 0.4, PACE: 0.35, SPIN: 0.35, ATT: 0.25 }, BOWL: { ACC: 0.55, STK: 0.45, CRA: 0.5 } };
  function mainSpread(p) {
    if (p.role === 'pace' || p.role === 'spin') return { BOWL: 1 };
    if (p.role === 'ar') return { BAT: 0.6, BOWL: 0.6 };
    if (p.role === 'wk') return { BAT: 0.8, KEEP: 0.5 };
    return { BAT: 1 };
  }
  CB.applyFx = function (p, fx) {
    const chips = [];
    if (fx.form) {
      const f = typeof fx.form === 'number' ? (fx.form > 0 ? { bat: -0.05, bowl: 0.04, n: fx.form } : { bat: 0.06, bowl: -0.05, n: -fx.form }) : fx.form;
      p.form = { bat: f.bat || 0, bowl: f.bowl || 0, n: f.n || 1 };
      const good = (f.bat || 0) < 0 || (f.bowl || 0) > 0;
      chips.push(good ? `🔥 Confidence up (next ${p.form.n > 1 ? p.form.n + ' games' : 'game'})` : `📉 Off your game (next ${p.form.n > 1 ? p.form.n + ' games' : 'game'})`);
    }
    if (fx.energy) { p.energyBonus = (p.energyBonus || 0) + fx.energy; chips.push(fx.energy > 0 ? `⚡ +${fx.energy} energy next session` : `🪫 ${fx.energy} energy next session`); }
    if (fx.attr) {
      const flat = {}, labels = [];
      const add = (k, d) => { flat[k] = (flat[k] || 0) + d; };
      for (const [k, d] of Object.entries(fx.attr)) {
        if (k === 'MAIN') {
          for (const [g, w] of Object.entries(mainSpread(p))) {
            if (SPREAD[g]) for (const [a, x] of Object.entries(SPREAD[g])) add(a, d * w * x); else add(g, d * w);
            labels.push([g, d]);
          }
        } else if (SPREAD[k]) { for (const [a, x] of Object.entries(SPREAD[k])) add(a, d * x); labels.push([k, d]); }
        else { add(k, d); labels.push([k, d]); }
      }
      // gains are soft-capped by potential: life can polish a player, not make a different one
      for (const [k, d] of Object.entries(flat)) p.a[k] = clamp(p.a[k] + (d > 0 ? d * clamp((p.caps[k] + 4 - p.a[k]) / 8, 0.15, 1) : d), 0, 100);
      for (const [k, d] of labels) chips.push(chipFor(k, d, p));
    }
    if (fx.cap) for (const [k, d] of Object.entries(fx.cap)) {
      const keys = k === 'MAIN' ? Object.keys(mainSpread(p)).flatMap(g => SPREAD[g] ? Object.keys(SPREAD[g]) : [g]) : SPREAD[k] ? Object.keys(SPREAD[k]) : [k];
      for (const a of keys) p.caps[a] = clamp(p.caps[a] + d * (keys.length > 1 ? 0.6 : 1), 0, 99);
      chips.push('🌱 New ceiling: ' + (k === 'MAIN' ? 'your ' + (p.role === 'pace' || p.role === 'spin' ? 'bowling' : 'game') : nameFor(k, p)));
    }
    if (fx.bias) { p.bias = clamp((p.bias || 0) + fx.bias, -4, 4); chips.push(fx.bias > 0 ? '📋 Selectors noticed' : '📋 Selectors unimpressed'); }
    if (fx.fame) { p.fame = (p.fame || 0) + fx.fame; chips.push(fx.fame > 0 ? '⭐ Profile up' : '⭐ Profile down'); }
    if (fx.inj) { p.inj = Math.max(p.inj || 0, fx.inj); p.injName = p.injName || 'precaution'; chips.push(`🩹 Miss ${fx.inj} game${fx.inj > 1 ? 's' : ''}`); }
    if (fx.rest) { p.rest = (p.rest || 0) + fx.rest; chips.push('🛌 Fresher body'); }
    CB.refresh(p);
    return [...new Set(chips.filter(Boolean))];
  };
  function nameFor(k, p) { if (k === 'BAT') return 'batting'; if (k === 'BOWL') return 'bowling'; const f = CB.FOCUS.find(x => x.id === k); return f ? CB.focusLabel(f, p).name.toLowerCase() : k; }
  function chipFor(k, d, p) {
    const up = d > 0 ? ' ↑' : ' ↓';
    if (k === 'BAT') return '🏏 Batting' + up;
    if (k === 'BOWL') return '🎯 Bowling' + up;
    const f = CB.FOCUS.find(x => x.id === k); if (!f) return k + up;
    const l = CB.focusLabel(f, p); return l.icon + ' ' + l.name + up;
  }

  // ---------------------------------------------------------------- county stint offers
  // After the Shield season, a state regular who isn't in the Test side may be wanted by a county.
  CB.countyOfferDue = function (W) {
    const p = CB.user(W), S = W.season; if (!p || S.countyOffered || W.county) return null;
    const next = S.slots[S.cursor];
    const shieldLeft = S.slots.slice(S.cursor).some(s => s.type === 'dom');
    if (!next || shieldLeft || next.day < 175) return null;
    if (W.aus.xi.includes(p.id) && S.series.some(s => s.tag === 'winter')) return null;   // touring with Australia
    S.countyOffered = true;
    const played = p.history.filter(h => h.y === S.year && (h.lv === 'shield' || h.lv === 'test')).length;
    if (p.age < 19 || p.age > 35 || played < 3) return null;
    const r = CB.rngFor(W);
    if (r() > 0.7) return null;
    const cs = CB.COUNTIES.slice().sort(() => r() - 0.5).slice(0, 2);
    return { counties: cs.map(c => c.id) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
