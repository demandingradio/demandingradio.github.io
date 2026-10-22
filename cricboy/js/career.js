/* Cricboy career: the user's player (hidden talent + potential caps), training with energy, key moments, perks,
   injuries, milestones, delisting/retirement and the shelf of finished careers. */
(function (G) {
  'use strict';
  const CB = G.CB = G.CB || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------------------------------------------------------------- talent
  CB.TIERS = [
    { id: 'club', w: 12, peak: [24, 35] },
    { id: 'journeyman', w: 24, peak: [35, 44] },
    { id: 'regular', w: 26, peak: [44, 52] },
    { id: 'fringe', w: 17, peak: [52, 58] },
    { id: 'test', w: 12, peak: [58, 64] },
    { id: 'star', w: 6.5, peak: [64, 72] },
    { id: 'great', w: 2.5, peak: [72, 92] },
  ];
  CB.ROLE_INFO = {
    open: { label: 'Opening batter', group: 'Batter' }, top: { label: 'Top-order batter', group: 'Batter' }, mid: { label: 'Middle-order batter', group: 'Batter' },
    wk: { label: 'Wicketkeeper-batter', group: 'Keeper' }, ar: { label: 'All-rounder', group: 'All-rounder' },
    pace: { label: 'Bowler', group: 'Bowler' }, spin: { label: 'Bowler', group: 'Bowler' },
  };
  CB.SUB_INFO = { fast: 'Fast bowler', swing: 'Swing & seam bowler', finger: 'Finger spinner', wrist: 'Wrist spinner' };

  CB.createUser = function (W, o) {
    const r = CB.rngFor(W);
    const tot = CB.TIERS.reduce((a, t) => a + t.w, 0);
    let u = r() * tot, tier = CB.TIERS[0];
    for (const t of CB.TIERS) { u -= t.w; if (u <= 0) { tier = t; break; } }
    const peak = tier.peak[0] + r() * (tier.peak[1] - tier.peak[0]);
    const role = o.role, isBat = ['open', 'top', 'mid', 'wk', 'ar'].includes(role), isBowl = ['pace', 'spin', 'ar'].includes(role);
    const batPeak = role === 'ar' ? peak - 4 : role === 'wk' ? peak - 7 : isBat ? peak : 12 + r() * 14;
    const bowlPeak = role === 'ar' ? peak - 4 : isBowl ? peak : 14 + r() * 10;
    const g = () => CB.gauss(r);
    const caps = {}, a = {};
    const style = g();
    const set = (k, cap, gap) => { caps[k] = +clamp(cap, 1, 99).toFixed(1); a[k] = +clamp(cap - gap, 1, 99).toFixed(1); };
    const gap = 18 + r() * 6;  // how far a 17-year-old is from his peak
    set('DEF', batPeak + g() * 4 - style * 3, gap); set('PACE', batPeak + g() * 5, gap); set('SPIN', batPeak + g() * 5, gap); set('CON', batPeak + g() * 5, gap);
    set('ATT', (isBat ? 52 : 50) + style * 11 + g() * 5 + (peak - 50) * 0.35, gap * 0.8);
    set('RUN', 55 + g() * 10, 8);
    const bstyle = g();
    set('ACC', bowlPeak + g() * 4 - bstyle * 3, gap); set('STK', bowlPeak + g() * 5 + bstyle * 3, gap); set('CRA', bowlPeak + g() * 5, gap);
    set('STA', 55 + g() * 10, 10); set('FLD', 55 + g() * 10, 10); set('FIT', 58 + g() * 10, 8); set('MEN', 50 + g() * 12 + (peak - 50) * 0.2, 10);
    set('KEEP', role === 'wk' ? peak + 4 + g() * 4 : 15 + r() * 10, role === 'wk' ? gap : 0);
    const sub = isBowl ? o.sub : (r() < 0.4 ? (r() < 0.6 ? 'finger' : 'swing') : null);
    const p = {
      id: CB.nextId(), user: true, first: o.first, last: o.last, nat: 'AUS', role, sub, bowls: isBowl || !!sub,
      hand: o.hand || 'R', arm: 'R', age: 17, a, caps, power: +(g() * 0.4).toFixed(2), injury: +(0.8 + r() * 0.4).toFixed(2),
      team: o.state, tier: tier.id, traits: [], momentum: null, energyBonus: 0, rest: 0, history: [], milestones: {}, honours: [],
      debut: {}, joined: W.year, coachNotes: [], seasonsAt: {},
      fame: 0, ilog: [], blog: [], captRec: {}, captPrefs: { toss: 'auto', style: 'balanced' },
    };
    CB.refresh(p);
    CB.initPlayerState(p, r);
    p.bias = 0;
    if (o.legacy && CB.applyLegacy) CB.applyLegacy(p, o.legacy);
    W.players[p.id] = p;
    W.states[o.state].squad.push(p.id);
    W.userId = p.id;
    if (CB.seasonStartCareer) CB.seasonStartCareer(W);
    return p;
  };
  CB.user = W => W.players[W.userId];

  // a scout's line on a new player: honest but vague
  CB.scoutReport = function (p) {
    const notes = {
      club: ['Keen. Works hard. Tidy enough at club level.', 'Plenty of heart. The rest is a work in progress.'],
      journeyman: ['Solid technique, nothing flashy. Could carve out a state career.', 'A worker. Will need to grind for every opportunity.'],
      regular: ['Good habits for his age. Looks like a first-class cricketer.', 'Composed. The state coaches like what they see.'],
      fringe: ['Something there. Ahead of most kids his age.', 'Real ability. The question is how far it goes.'],
      test: ['Looks the part already. People are talking.', 'Rare poise. Talk of a future international.'],
      star: ['Special. The kind of talent that comes around once a decade.', 'Hits the ball like a man. Everyone stopped to watch the nets.'],
      great: ['Generational. Old timers say they have never seen a teenager like it.', 'The best young player anyone at the club has seen. Ever.'],
    };
    const l = notes[p.tier];
    return l[(p.id + p.last.length) % l.length];
  };

  // ---------------------------------------------------------------- training
  CB.FOCUS = [
    { id: 'DEF', name: 'Defence', icon: '🛡️', group: 'bat', desc: 'Technique, judgement outside off, a solid forward press.' },
    { id: 'ATT', name: 'Attacking shots', icon: '💥', group: 'bat', desc: 'Drives, pulls, cuts. Scoring rate and boundaries.' },
    { id: 'PACE', name: 'Playing pace', icon: '🏎️', group: 'bat', desc: 'Bowling machine at 145. Short ball, late movement.' },
    { id: 'SPIN', name: 'Playing spin', icon: '🌀', group: 'bat', desc: 'Footwork, sweeps, reading the hand.' },
    { id: 'CON', name: 'Concentration', icon: '🧘', group: 'bat', desc: 'Long sessions, fewer soft dismissals once set.' },
    { id: 'RUN', name: 'Running', icon: '👟', group: 'bat', desc: 'Calling, turning ones into twos, fewer run-outs.' },
    { id: 'ACC', name: 'Line & length', icon: '🎯', group: 'bowl', desc: 'Hit the top of off. Economy, fewer extras.' },
    { id: 'STK', name: 'Pace & power', icon: '⚡', group: 'bowl', spinName: 'Turn & spin', spinIcon: '🌪️', desc: 'Your stock weapon: speed (quicks) or revs (spinners).' },
    { id: 'CRA', name: 'Swing & seam', icon: '🌬️', group: 'bowl', spinName: 'Flight & variation', spinIcon: '🪶', desc: 'Your craft: movement (quicks) or guile (spinners).' },
    { id: 'STA', name: 'Bowling stamina', icon: '🔋', group: 'bowl', desc: 'Longer spells, bowl more overs, fresher late in the day.' },
    { id: 'FLD', name: 'Fielding', icon: '🧤', group: 'gen', desc: 'Catching and ground fielding.' },
    { id: 'KEEP', name: 'Glovework', icon: '🥅', group: 'gen', desc: 'Keeping: catches, stumpings, fewer byes.' },
    { id: 'FIT', name: 'Fitness', icon: '🏋️', group: 'gen', desc: 'Injury resistance and slower decline with age.' },
    { id: 'MEN', name: 'Mental game', icon: '🧠', group: 'gen', desc: 'Big-match temperament. Pressure, debuts, Tests.' },
    { id: 'REST', name: 'Rest & recovery', icon: '🛌', group: 'gen', desc: 'Lower injury risk next match. Fresh legs.' },
  ];
  CB.focusLabel = (f, p) => (CB.isSpinner(p) && f.spinName) ? { name: f.spinName, icon: f.spinIcon } : { name: f.name, icon: f.icon };
  // combos: training two related areas in one session gives both +20% (Balatro-style hands)
  CB.COMBOS = [
    { id: 'grafter', name: 'The Grafter', need: ['DEF', 'CON'], bonus: 0.2 },
    { id: 'strokemaker', name: 'Strokemaker', need: ['ATT', 'PACE'], bonus: 0.2 },
    { id: 'footwork', name: 'Twinkle-toes', need: ['SPIN', 'RUN'], bonus: 0.2 },
    { id: 'metronome', name: 'Metronome', need: ['ACC', 'STA'], bonus: 0.2 },
    { id: 'artist', name: 'The Artist', need: ['CRA', 'STK'], bonus: 0.2 },
    { id: 'athlete', name: 'Athlete', need: ['FIT', 'FLD'], bonus: 0.2 },
    { id: 'iron', name: 'Iron Mind', need: ['MEN', 'CON'], bonus: 0.2 },
    { id: 'complete', name: 'Complete Batter', need: ['DEF', 'ATT', 'PACE', 'SPIN'], bonus: 0.35 },
  ];
  const AGEF = a => a <= 20 ? 1 : a <= 23 ? 0.9 : a <= 26 ? 0.75 : a <= 29 ? 0.55 : a <= 32 ? 0.4 : 0.3;
  const DIM = [1, 0.85, 0.7, 0.55, 0.45, 0.4, 0.35];

  CB.energyFor = function (p, last) {
    let e = 5;
    if (CB.hasPerk(p, 'netrat') && last && last.quiet) e++;
    if (CB.hasPerk(p, 'coachspet')) e++;
    if (p.energyBonus) { e += p.energyBonus; }
    if (last && last.overs >= 45) e--;
    return Math.max(2, e);
  };
  CB.activeCombos = function (alloc) {
    return CB.COMBOS.filter(c => c.need.every(k => (alloc[k] || 0) > 0));
  };
  // apply an allocation {attr: points}; returns per-attribute gains (hidden from the UI except as coach notes)
  CB.train = function (W, p, alloc) {
    const gains = {};
    const combos = CB.activeCombos(alloc);
    const age = CB.hasPerk(p, 'latebloomer') && p.age <= 27 ? Math.min(p.age, 20) : p.age;
    for (const [k, pts] of Object.entries(alloc)) {
      if (!pts) continue;
      if (k === 'REST') { p.rest = (p.rest || 0) + pts; continue; }
      let g = 0;
      for (let i = 0; i < pts; i++) {
        const dim = CB.hasPerk(p, 'specialist') && i >= 2 ? DIM[1] : DIM[Math.min(i, DIM.length - 1)];
        const head = clamp((p.caps[k] + 2 - p.a[k]) / 9, 0.02, 1.2);  // potential is a near-hard ceiling
        let mult = 1;
        if (p.momentum && p.momentum.attr === k) mult *= CB.hasPerk(p, 'fastlearner') ? 2 : 1.5;
        for (const c of combos) if (c.need.includes(k)) mult *= 1 + c.bonus;
        if (k === 'FIT' && CB.hasPerk(p, 'gymjunkie')) mult *= 1.5;
        if (k === 'MEN' && CB.hasPerk(p, 'ironwill')) mult *= 2;
        g += 0.17 * AGEF(age) * head * dim * mult;
      }
      p.a[k] = +clamp(p.a[k] + g, 0, 100).toFixed(2);
      gains[k] = g;
      if (k === 'CON' && CB.hasPerk(p, 'grafter')) { p.a.DEF = +clamp(p.a.DEF + g * 0.5, 0, 100).toFixed(2); gains.DEF = (gains.DEF || 0) + g * 0.5; }
      if (k === 'STA' && CB.hasPerk(p, 'engine')) { p.a.FIT = +clamp(p.a.FIT + g * 0.5, 0, 100).toFixed(2); }
    }
    if (combos.length && CB.hasPerk(p, 'combo')) p.energyBonus = 1; else p.energyBonus = 0;
    p.momentum = null;
    CB.refresh(p);
    // a coach sometimes notices
    const best = Object.entries(gains).sort((a, b) => b[1] - a[1])[0];
    let note = null;
    if (best) {
      const f = CB.FOCUS.find(x => x.id === best[0]);
      const nm = f ? CB.focusLabel(f, p).name.toLowerCase() : best[0];
      const g = best[1];
      note = g > 1.6 ? `Coach: "Big week. Your ${nm} has clicked."` : g > 0.8 ? `Coach: "Your ${nm} is coming along nicely."` : g > 0.3 ? `Coach: "Small gains on your ${nm}. Keep at it."` : `Coach: "Not much left to find in your ${nm}."`;
    }
    return { gains, combos, note };
  };

  // natural development + decline each season (the user ages like everyone, but against his own caps)
  CB.ageUser = function (p, r) {
    p.age++;
    const A = p.age;
    const nat = A <= 18 ? 0.06 : A <= 21 ? 0.06 : A <= 24 ? 0.05 : A <= 27 ? 0.04 : A <= 30 ? 0.015 : 0;
    const gym = CB.hasPerk(p, 'gymjunkie') ? 0.7 : 1;
    const fit = clamp(1 - (p.a.FIT - 55) / 80, 0.5, 1.3);
    for (const k of CB.ATTRS) {
      const phys = ['STK', 'STA', 'FIT', 'RUN', 'FLD'].includes(k);
      const decl = phys ? (A >= 35 ? 4.5 : A >= 33 ? 3 : A >= 31 ? 1.5 : A >= 29 ? 0.5 : 0) * gym * fit : (A >= 37 ? 4.5 : A >= 35 ? 2.8 : A >= 33 ? 1.3 : A >= 31 ? 0.5 : 0);
      const gap = p.caps[k] - p.a[k];
      p.a[k] = +clamp(p.a[k] + Math.max(0, gap) * nat - decl * (k === 'STK' && p.sub === 'fast' ? 1.4 : 1) + CB.gauss(r) * 0.5, 0, 100).toFixed(2);
      if (A >= 30) p.caps[k] = +Math.max(0, p.caps[k] - decl).toFixed(2); // a declining body lowers the ceiling too
    }
    CB.refresh(p);
  };

  // ---------------------------------------------------------------- perks (light Balatro: up to 5)
  CB.PERKS = [
    { id: 'netrat', name: 'Net Rat', icon: '🐀', desc: '+1 energy after a quiet game (under 20 runs and fewer than 2 wickets).' },
    { id: 'grafter', name: 'Grafter', icon: '⛏️', desc: 'Concentration training also builds half as much Defence.' },
    { id: 'fastlearner', name: 'Fast Learner', icon: '📈', desc: 'Key-moment momentum doubles training in that area (instead of x1.5).' },
    { id: 'gymjunkie', name: 'Gym Junkie', icon: '🏋️', desc: 'Fitness training +50%. Physical decline with age -30%.' },
    { id: 'specialist', name: 'Specialist', icon: '🎓', desc: 'No diminishing returns after the 2nd point in one area.' },
    { id: 'engine', name: 'Big Engine', icon: '🚂', desc: 'Bowling stamina training also builds Fitness.' },
    { id: 'bigmatch', name: 'Big Match Player', icon: '🏟️', desc: 'Better in Tests and finals (harder to dismiss, more wickets).' },
    { id: 'favourite', name: "Selectors' Favourite", icon: '📋', desc: 'Selectors give you the benefit of the doubt.' },
    { id: 'ironman', name: 'Ironman', icon: '🦾', desc: 'Injury risk -40%.' },
    { id: 'latebloomer', name: 'Late Bloomer', icon: '🌱', desc: 'Train like a 20-year-old until you turn 28.' },
    { id: 'bunny', name: 'Bunny Hunter', icon: '🐇', desc: 'Your bowling feasts on tail-enders.' },
    { id: 'combo', name: 'Combo King', icon: '🃏', desc: 'Trigger any training combo and get +1 energy next match.' },
    { id: 'coachspet', name: "Coach's Pet", icon: '🍎', desc: '+1 energy every match.' },
    { id: 'ironwill', name: 'Iron Will', icon: '🗿', desc: 'Mental game training doubled.' },
    { id: 'homehero', name: 'Hometown Hero', icon: '🏠', desc: 'Better at your home ground.' },
    { id: 'lucky', name: 'Charmed Life', icon: '🍀', desc: 'Fielders drop you more often.' },
    { id: 'newball', name: 'New-Ball Bandit', icon: '🔴', desc: 'More wickets with a new ball (first 15 overs of it).' },
    { id: 'nightwatch', name: 'Stubborn', icon: '🧱', desc: 'Hard to remove early in an innings.' },
  ];
  CB.hasPerk = (p, id) => (p.traits || []).includes(id);
  CB.perkChoices = function (W, p) {
    const r = CB.rngFor(W);
    const pool = CB.PERKS.filter(k => !CB.hasPerk(p, k.id) && !(k.id === 'bunny' && !p.bowls) && !(k.id === 'newball' && !(p.bowls && !CB.isSpinner(p))));
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
  };

  // ---------------------------------------------------------------- match prep for the user (perks -> sim modifiers)
  CB.prepMatchPlayer = function (p) {
    if (!p.user) return;
    CB.refresh(p);
    const ctx = p._ctx || {};
    let batMod = 0, bowlMod = 0;
    if (CB.hasPerk(p, 'bigmatch') && (ctx.level === 'test' || ctx.final)) { batMod -= 0.08; bowlMod += 0.06; }
    if (CB.hasPerk(p, 'homehero') && ctx.home) { batMod -= 0.05; bowlMod += 0.04; }
    // nerves: mental game matters on debut and in Tests
    const nerves = (ctx.debut ? 0.12 : 0) + (ctx.level === 'test' ? 0.04 : 0);
    batMod += nerves * clamp((60 - p.a.MEN) / 30, 0, 1.5);
    if (p.form && p.form.n > 0) { batMod += p.form.bat || 0; bowlMod += p.form.bowl || 0; }
    if (ctx.captain) { const cm = CB.captainMod(p); batMod += cm; bowlMod -= cm * 0.8; }
    p.e.mod = batMod;
    if (CB.hasPerk(p, 'lucky')) p.e.luck = 1;
    if (CB.hasPerk(p, 'nightwatch')) p.e.early = -0.15;
    // Second XI captains give the state's rookie a proper bowl (usage only, not effectiveness)
    if (p.bw && ctx.level === 'seconds') p.bw.q += 0.6;
    if (p.bw) { p.bw.mod = bowlMod; if (CB.hasPerk(p, 'newball')) p.bw.swing = (p.bw.swing || 0) + 0.1; if (CB.hasPerk(p, 'bunny')) p.bw.bunny = 0.2; }
    p.perkSel = CB.hasPerk(p, 'favourite') ? 3 : 0;
  };

  // ---------------------------------------------------------------- injuries
  CB.rollInjury = function (p, r, overs, user) {
    let risk = (p.bowls && !CB.isSpinner(p) && overs > 0 ? 0.045 + overs * 0.0012 : 0.018) * p.injury * Math.exp(-(p.a.FIT - 55) / 30) * (1 + 0.12 * Math.max(0, p.age - 30));
    if (user) { if (CB.hasPerk(p, 'ironman')) risk *= 0.6; risk *= Math.pow(0.85, Math.min(4, p.rest || 0)); p.rest = 0; }
    if (r() < risk) { const pace = p.bowls && !CB.isSpinner(p) && overs > 8; const len = r() < (pace ? 0.4 : 0.6) ? 1 : r() < 0.6 ? 2 : r() < 0.6 ? 3 : pace ? 4 + Math.floor(r() * 5) : 4; return len; }
    return 0;
  };
  CB.INJURIES = { pace: ['side strain', 'stress reaction in the back', 'hamstring tightness', 'ankle impingement', 'calf strain'], bat: ['broken finger', 'hamstring strain', 'concussion (struck on the helmet)', 'sore back', 'quad strain'] };

  // ---------------------------------------------------------------- key moments
  // find the user's biggest moment in the simulated match; return a scenario with three choices (each trains an area)
  CB.findMoment = function (U, p) {
    const M = U.M, ti = U.ti, me = U.sides[ti].indexOf(p.id);
    if (me < 0) return null;
    const cands = [];
    const tname = M.teams[ti].name, oname = M.teams[1 - ti].name;
    for (const I of M.inns) {
      if (I.bat === ti) {
        const b = I.bats[me]; if (!b.in) continue;
        // walk the log to find arrival + milestones approaches
        let runs = 0, balls = 0, arrived = null, near50 = null, near100 = null, chase = null;
        for (let i = 0; i < I.log.length; i++) {
          const L = I.log[i];
          const involved = L.s === me || L.n === me;
          if (involved && arrived == null) arrived = i;
          if (L.s === me && L.w !== 'wd') { if (typeof L.w === 'number' || L.w === 'nb') runs += L.r; if (L.w !== 'nb') balls++; }
          if (L.s === me && near50 == null && runs >= 42 && runs < 50) near50 = { i, runs, balls };
          if (L.s === me && near100 == null && runs >= 88 && runs < 100) near100 = { i, runs, balls };
          if (I.k === 3 && involved && chase == null && I.target - L.sc > 40 && I.target - L.sc < 220) chase = { i, need: I.target - L.sc };
          if (L.w === 'W' && L.x && L.x.out === me) break;
        }
        if (arrived != null) { const L = I.log[arrived]; cands.push({ kind: me <= 1 ? 'open' : (L.wk >= 3 && L.sc < 120 ? 'rescue' : (CB.lastBowlerSpin(M, I, arrived) ? 'spinArrive' : 'arrive')), I, i: arrived, score: 2 + (L.wk >= 3 ? 2 : 0) + (I.k === 3 ? 1 : 0) }); }
        if (near50) cands.push({ kind: 'near50', I, i: near50.i, runs: near50.runs, score: 3 });
        if (near100) cands.push({ kind: 'near100', I, i: near100.i, runs: near100.runs, score: 6 });
        if (chase) cands.push({ kind: 'chase', I, i: chase.i, need: chase.need, score: 5 });
      } else if (p.bw) {
        // bowling: first over in the innings, a big stand, or the tail
        let first = null, stand = null, tail = null, part = 0;
        for (let i = 0; i < I.log.length; i++) {
          const L = I.log[i];
          part = L.w === 'W' ? 0 : part + L.r;
          if (L.bw === me) {
            if (first == null) first = i;
            if (stand == null && part >= 70) stand = { i, part };
            if (tail == null && L.wk >= 8) tail = i;
          }
        }
        if (first != null) cands.push({ kind: CB.isSpinner(p) ? (I.k >= 2 ? 'spinWorn' : 'spinFirst') : (I.log[first].b < 30 ? 'newBall' : 'paceFirst'), I, i: first, score: 2 + (I.log[first].b < 30 ? 1 : 0) + (I.k >= 2 ? 1 : 0) });
        if (stand) cands.push({ kind: CB.isSpinner(p) ? 'spinStand' : 'stand', I, i: stand.i, part: stand.part, score: 4 });
        if (tail != null) cands.push({ kind: 'tail', I, i: tail, score: 2.5 });
        if (p.role === 'wk') cands.push({ kind: 'keep', I, i: Math.min(I.log.length - 1, 30), score: 1.5 });
      } else if (p.role === 'wk') {
        cands.push({ kind: 'keep', I, i: Math.min(I.log.length - 1, 30), score: 1.5 });
      } else {
        cands.push({ kind: 'field', I, i: Math.min(I.log.length - 1, 60), score: 1 });
      }
    }
    if (U.captain) {
      // captaincy calls: when to declare, and what to do about a big stand
      let own = 0, opp = 0;
      for (const I of M.inns) {
        if (I.bat === ti) {
          if (I.k === 2 && I.closed === 'declared') {
            const i = I.log.findIndex(L => own + L.sc - opp >= 200);
            if (i >= 0) cands.push({ kind: 'captDeclare', I, i, lead: own + I.log[i].sc - opp, score: 5 });
          }
          own += I.runs;
        } else {
          let part = 0;
          const i = I.log.findIndex(L => { part = L.w === 'W' ? 0 : part + L.r; return part >= 80; });
          if (i >= 0) cands.push({ kind: 'captStand', I, i, part: 80, score: 4.5 });
          opp += I.runs;
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0];
    const T = MOMENTS[c.kind];
    const L = c.I.log[c.i] || c.I.log[c.I.log.length - 1];
    const bt = M.teams[c.I.bat].short || M.teams[c.I.bat].name;
    const day = 'Innings ' + (c.I.k + 1);
    const ctx = { score: `${bt} ${L ? L.sc : 0}/${L ? L.wk : 0}`, overs: CB.oversStr(L ? L.b : 0), runs: c.runs, need: c.need, part: c.part, lead: c.lead, opp: oname, team: tname, bowler: L && M.teams[c.I.fld].xi[L.bw] ? M.teams[c.I.fld].xi[L.bw].short : '' };
    const opts = typeof T.options === 'function' ? T.options(p) : T.options;
    return { kind: c.kind, inns: c.I.k, at: c.i, title: T.title, text: T.text(ctx), situation: `${day} · ${ctx.score} · ${ctx.overs} ov`, options: opts, after: c.kind.startsWith('capt') ? M.result.text + '.' : CB.momentAftermath(M, c, me, ti), captain: c.kind.startsWith('capt') };
  };
  CB.lastBowlerSpin = (M, I, i) => { const L = I.log[i]; const b = M.teams[I.fld].xi[L.bw]; return b && b.bw && b.bw.t === 1; };
  const MOMENTS = {
    captDeclare: { title: 'Declaration call', text: c => `${c.score}. You lead by ${c.lead}. The dressing room is waiting on your call.`,
      options: [{ t: 'Declare now and back your bowlers', a: 'MEN' }, { t: 'Bat on and make it safe', a: 'CON' }, { t: 'Ten quick overs, then declare', a: 'ATT' }] },
    captStand: { title: "Captain's call", text: c => `${c.score}. A ${c.part}-run stand. Every head on the field turns to you.`,
      options: p => [{ t: 'Attack: three slips and a gully', a: 'MEN' }, { t: 'Spread the field and dry up the runs', a: 'CON' }, p.bowls ? { t: 'Throw the ball to yourself', a: CB.isSpinner(p) ? 'CRA' : 'STK' } : { t: 'Move yourself to short leg', a: 'FLD' }] },
    open: { title: 'New ball', text: c => `You walk out to open. ${c.opp}'s quicks have the new ball and it's hooping. ${c.bowler} at the top of his mark.`,
      options: [{ t: 'Leave everything outside off', a: 'DEF' }, { t: 'Look to drive anything full', a: 'ATT' }, { t: 'Get forward, play late, soft hands', a: 'PACE' }] },
    arrive: { title: 'Walking out', text: c => `${c.score}. You're in. Fielders chirp as you take guard against ${c.bowler}.`,
      options: [{ t: 'Get off the mark early, look for singles', a: 'RUN' }, { t: 'Block, block, block. Earn the right', a: 'CON' }, { t: 'Put the bad ball away', a: 'ATT' }] },
    rescue: { title: 'Rescue job', text: c => `${c.score}. Collapse on. The crowd's gone quiet. Your side needs a partnership.`,
      options: [{ t: 'Counter-punch: hit them off their length', a: 'ATT' }, { t: 'Dig in for the long haul', a: 'CON' }, { t: 'Solid technique, play straight', a: 'DEF' }] },
    spinArrive: { title: 'Spin from the off', text: c => `${c.score}. ${c.bowler} is wheeling away with men around the bat. The ball is spitting out of the rough.`,
      options: [{ t: 'Use your feet, get to the pitch', a: 'SPIN' }, { t: 'Sweep hard, put him off his length', a: 'ATT' }, { t: 'Pad it away, smother the spin', a: 'DEF' }] },
    near50: { title: 'Knocking on fifty', text: c => `You're on ${c.runs}*. ${c.score}. A maiden fifty is right there. The field spreads.`,
      options: [{ t: 'Keep the scoreboard ticking with singles', a: 'RUN' }, { t: "Stay patient. It'll come", a: 'CON' }, { t: 'Loft one over the infield', a: 'ATT' }] },
    near100: { title: 'The nervous nineties', text: c => `On ${c.runs}*. ${c.score}. The whole ground knows. Your heart is thumping.`,
      options: [{ t: 'Back yourself, go big', a: 'ATT' }, { t: 'Breathe. One ball at a time', a: 'MEN' }, { t: 'Nudge, nurdle and run hard', a: 'RUN' }] },
    chase: { title: 'The chase', text: c => `Chasing. ${c.need} still needed. ${c.score}. Time and wickets both matter now.`,
      options: [{ t: 'Take the attack to them', a: 'ATT' }, { t: 'Rotate strike, keep wickets in hand', a: 'RUN' }, { t: 'Shut up shop, play for time', a: 'DEF' }] },
    newBall: { title: 'Taking the new ball', text: c => `${c.score}. Captain tosses you the cherry. Overhead conditions are cloudy.`,
      options: [{ t: 'Pitch it up and swing it', a: 'CRA' }, { t: 'Hit the deck hard, extract bounce', a: 'STK' }, { t: 'Tight lines, make them play', a: 'ACC' }] },
    paceFirst: { title: 'First change', text: c => `${c.score}. You come on first change. The pitch has gone flat and the ball has lost its shine.`,
      options: [{ t: 'Bang it in, bouncer plan', a: 'STK' }, { t: 'Fourth-stump line, dry them up', a: 'ACC' }, { t: 'Wobble seam, hunt the edge', a: 'CRA' }] },
    stand: { title: 'Break the stand', text: c => `${c.score}. A ${c.part}-run partnership is killing you. The captain needs something.`,
      options: [{ t: 'Short-ball barrage', a: 'STK' }, { t: 'Patience: maidens build pressure', a: 'ACC' }, { t: 'Go wider on the crease, angle it in', a: 'CRA' }] },
    tail: { title: 'Mopping up', text: c => `${c.score}. The tail is in. Finish this.`,
      options: [{ t: 'Yorkers, full and straight', a: 'ACC' }, { t: 'Bouncers to the tail-enders', a: 'STK' }, { t: 'Keep running in hard, bowl long', a: 'STA' }] },
    spinFirst: { title: 'Toss it up', text: c => `${c.score}. You're on early. There's not much in the pitch yet.`,
      options: [{ t: 'Flight it, buy the wicket', a: 'CRA' }, { t: 'Dart it in, keep it tight', a: 'ACC' }, { t: 'Rip it hard, look for drift', a: 'STK' }] },
    spinWorn: { title: 'Day five dust', text: c => `${c.score}. Footmarks outside off. This is your day.`,
      options: [{ t: 'Aim at the rough, rip it', a: 'STK' }, { t: 'Vary flight and pace', a: 'CRA' }, { t: 'Bowl all day from one end', a: 'STA' }] },
    spinStand: { title: 'Holding an end', text: c => `${c.score}. A ${c.part}-run stand. The quicks are cooked. Captain throws you the ball.`,
      options: [{ t: 'Fire it in flat, bore them out', a: 'ACC' }, { t: 'Tempt the big drive', a: 'CRA' }, { t: 'More revs, more risk', a: 'STK' }] },
    keep: { title: 'Behind the stumps', text: c => `${c.score}. Standing up to the spinner, the batter's lunging. Half a chance coming.`,
      options: [{ t: 'Stay low, move late', a: 'KEEP' }, { t: 'Chirp and build pressure', a: 'MEN' }, { t: 'Keep your energy for the long day', a: 'FIT' }] },
    field: { title: 'In the field', text: c => `${c.score}. Skier coming down at mid-on. It's yours.`,
      options: [{ t: 'Call loudly and take it', a: 'FLD' }, { t: 'Stay calm, eyes on the ball', a: 'MEN' }, { t: 'Sprint to get under it', a: 'FIT' }] },
  };

  CB.momentAftermath = function (M, c, me, ti) {
    const I = c.I;
    if (I.bat === ti) {
      const b = I.bats[me];
      const d = CB.dismissalText(M, I, b);
      return b.out ? `You made ${b.runs} off ${b.balls} before you were ${d.startsWith('run out') ? d : 'out ' + d}.` : `You finished ${b.runs}* off ${b.balls}.`;
    }
    const bs = I.bowl[me];
    if (bs && bs.balls) return `Your figures for the innings: ${CB.oversStr(bs.balls)}-${bs.md}-${bs.runs}-${bs.wk}.`;
    return 'The game moved on.';
  };

  // ---------------------------------------------------------------- after a user match: stats, milestones, selection
  CB.userPostMatch = function (W, U) {
    const p = CB.user(W), r = CB.rngFor(W);
    const lv = U.level;
    const me = U.sides[U.ti].indexOf(p.id);
    const M = U.M;
    const lines = CB.matchLines(M)[U.ti][me];
    const runs = lines.bat.reduce((a, b) => a + b.runs, 0), wk = lines.bowl.reduce((a, b) => a + b.wk, 0);
    const overs = lines.bowl.reduce((a, b) => a + b.balls, 0) / 6;
    const ev = [];
    if (!p.debut[lv]) { p.debut[lv] = { year: W.season.year, vs: M.teams[1 - U.ti].name }; if (lv !== 'seconds') ev.push({ type: 'debut', level: lv }); }
    // detailed logs for the stats screens: [season, level, opponent, home, innings no, runs, balls, how out (0 not out), 4s, 6s, position]
    const LVC = { seconds: 0, shield: 1, test: 2, county: 3 }[lv], vs = M.teams[1 - U.ti].short || M.teams[1 - U.ti].name, home = U.cfg.home === U.ti ? 1 : 0;
    p.ilog = p.ilog || []; p.blog = p.blog || [];
    for (const I of M.inns) {
      if (I.bat === U.ti) { const b = I.bats[me]; if (b && b.in) p.ilog.push([W.season.year, LVC, vs, home, I.k, b.runs, b.balls, b.out ? b.out.kind : 0, b.f4, b.f6, me + 1]); }
      else { const b = I.bowl[me]; if (b && (b.balls || b.wd || b.nb)) p.blog.push([W.season.year, LVC, vs, home, I.k, b.balls, b.runs, b.wk, b.md]); }
    }
    if (p.form && p.form.n > 0) p.form.n--;
    if (CB.recordCaptaincy) CB.recordCaptaincy(W, U, p, ev);
    const st = p.st[lv];
    const fc = { r: p.st.shield.r + p.st.test.r, w: p.st.shield.w + p.st.test.w, h100: p.st.shield.h100 + p.st.test.h100, w5: p.st.shield.w5 + p.st.test.w5 };
    const chk = (key, cond, text) => { if (cond && !p.milestones[key]) { p.milestones[key] = W.season.year; ev.push({ type: 'milestone', key, text }); } };
    const best = Math.max(0, ...lines.bat.map(b => b.runs)), bestW = Math.max(0, ...lines.bowl.map(b => b.wk));
    if (lv !== 'seconds') {
      chk('fc50', best >= 50, 'Maiden first-class fifty');
      chk('fc100', best >= 100, 'Maiden first-class hundred!');
      chk('fc200', best >= 200, 'A first-class double hundred!');
      chk('fc5w', bestW >= 5, 'Maiden first-class five-for!');
      chk('fc1000', fc.r >= 1000, '1,000 first-class runs');
      chk('fc5000', fc.r >= 5000, '5,000 first-class runs');
      chk('fc100w', fc.w >= 100, '100 first-class wickets');
      chk('fc300w', fc.w >= 300, '300 first-class wickets');
    }
    if (lv === 'test') {
      chk('t50', best >= 50, 'Maiden Test fifty');
      chk('t100', best >= 100, 'Maiden Test hundred!!');
      chk('t5w', bestW >= 5, 'Maiden Test five-wicket haul!!');
      chk('t1000', st.r >= 1000, '1,000 Test runs');
      chk('t5000', st.r >= 5000, '5,000 Test runs');
      chk('t10000', st.r >= 10000, '10,000 Test runs. Legend.');
      chk('t100w', st.w >= 100, '100 Test wickets');
      chk('t300w', st.w >= 300, '300 Test wickets. Legend.');
      chk('t50m', st.m >= 50, '50 Test caps');
      chk('t100m', st.m >= 100, '100 Test caps');
    }
    if (M.potm && M.potm.team === U.ti && M.potm.idx === me) { p.potm = (p.potm || 0) + 1; ev.push({ type: 'potm' }); }
    if (lv === 'test' && CB.checkUnlocks) for (const u of CB.checkUnlocks(W, p)) ev.push({ type: 'unlock', u });
    // match history line
    p.history.push({ y: W.season.year, lv, vs: M.teams[1 - U.ti].short || M.teams[1 - U.ti].name, venue: U.cfg.venue, res: M.result.draw ? 'D' : M.result.tie ? 'T' : M.result.winner === U.ti ? 'W' : 'L',
      bat: lines.bat.map(b => b.runs + (b.out ? '' : '*')).join(' & '), bowl: lines.bowl.filter(b => b.balls).map(b => b.wk + '/' + b.runs).join(' & '), final: !!U.cfg.final });
    // injury
    const inj = CB.rollInjury(p, r, overs, true);
    if (inj) { p.inj = inj; const kind = p.bowls && !CB.isSpinner(p) && overs > 10 ? CB.INJURIES.pace : CB.INJURIES.bat; p.injName = kind[Math.floor(r() * kind.length)]; ev.push({ type: 'injury', len: inj, name: p.injName }); }
    const quiet = runs < 20 && wk < 2;
    p.lastMatch = { quiet, overs, runs, wk };
    // perk offers
    if (ev.some(e => e.type === 'debut' || (e.type === 'milestone' && ['fc100', 'fc5w', 't100', 't5w', 'fc1000', 't1000', 't100w', 'fc100w'].includes(e.key)))) p.perkOffer = true;
    return { ev, runs, wk, overs, lines };
  };

  // selection status for the hub: how the selectors see you (vague words, no numbers)
  CB.selectionView = function (W, p) {
    const lvl = CB.userLevel(W, p);
    const words = [];
    if (lvl === 'test') return { level: 'test', text: 'Test cricketer. Keep the runs/wickets coming to hold your spot.' };
    const st = W.states[p.team];
    const target = lvl === 'seconds' ? 'shield' : 'test';
    const pool = target === 'shield' ? st.squad : CB.STATES.flatMap(s => W.states[s.id].squad);
    const f = CB.form(p, target);
    const myV = Math.max(CB.batVal(p) + f.bat, CB.bowlVal(p) + f.bowl) + p.bias;
    // compare to the incumbents in comparable roles
    const xi = target === 'shield' ? st.xi : W.aus.xi;
    const rivals = (xi || []).map(id => W.players[id]).filter(q => q && q.id !== p.id && sameLane(q, p));
    const theirs = rivals.map(q => { const fq = CB.form(q, target); return Math.max(CB.batVal(q) + fq.bat, CB.bowlVal(q) + fq.bowl) + q.bias; }).sort((a, b) => a - b);
    const weakest = theirs.length ? theirs[0] : 50;
    const d = myV - weakest;
    const nm = target === 'shield' ? 'Shield' : 'Test';
    const text = d > 2 ? `Selectors are talking about you for the ${nm} side.` : d > -2 ? `On the fringe. One big game could get you a ${nm} call-up.` : d > -6 ? `In the frame, but there are players ahead of you for a ${nm} spot.` : `A long way from ${nm} selection. Keep piling up the numbers.`;
    return { level: lvl, text, heat: clamp((d + 8) / 12, 0, 1) };
  };
  function sameLane(q, p) {
    const bat = r => ['open', 'top', 'mid'].includes(r);
    if (p.role === 'wk') return q.role === 'wk';
    if (bat(p.role)) return bat(q.role) || q.role === 'ar';
    if (p.role === 'ar') return q.role === 'ar' || q.role === 'mid' || q.role === 'pace' || q.role === 'spin';
    if (CB.isSpinner(p)) return CB.isSpinner(q) && (q.role === 'spin' || q.role === 'ar');
    return (q.role === 'pace' || q.role === 'ar') && !CB.isSpinner(q);
  }
  CB.userLevel = function (W, p) {
    if (W.aus.xi.includes(p.id)) return 'test';
    if (W.states[p.team].xi.includes(p.id)) return 'shield';
    return 'seconds';
  };

  // ---------------------------------------------------------------- end of a user's season / career
  CB.userSeasonEnd = function (W) {
    const p = CB.user(W), r = CB.rngFor(W);
    const y = W.season.year;
    const playedShield = p.history.filter(h => h.y === y && h.lv === 'shield').length;
    const playedTest = p.history.filter(h => h.y === y && h.lv === 'test').length;
    p.seasonsAt[y] = { shield: playedShield, test: playedTest };
    if (W.season.champion === p.team && playedShield > 0) p.honours.push({ y, text: W.states[p.team].captain === p.id ? 'Captained ' + CB.stateById(p.team).name + ' to the Shield' : 'Sheffield Shield champion' });
    for (const s of W.season.series) {
      if (!s.xi) continue;
      const played = p.history.filter(h => h.y === y && h.lv === 'test' && h.vs === s.opp).length;
      if (played && s.res[0] > s.res[1]) p.honours.push({ y, text: `${s.ucapt ? 'Captained Australia to a series' : 'Series'} win vs ${CB.NATIONS[s.opp].name}${s.opp === 'ENG' ? ' (the Ashes)' : ''}` });
    }
    CB.ageUser(p, r);
    // contract: delisted if not making the Shield side by the early-mid twenties
    const last2 = [y, y - 1].map(k => p.seasonsAt[k] || { shield: 0, test: 0 });
    const recentTop = last2.reduce((a, s) => a + s.shield + s.test, 0);
    let ended = null;
    if (p.age >= 41) ended = 'age';
    else if (p.age >= 24 && recentTop < 3) ended = 'delisted';
    else if (p.age >= 31 && (p.seasonsAt[y].shield + p.seasonsAt[y].test) === 0) ended = 'delisted';
    else if (p.age >= 36 && (p.seasonsAt[y].shield + p.seasonsAt[y].test) < 4) ended = 'delisted';
    if (!ended && (y - p.joined) % 2 === 1) p.perkOffer = true;
    return { ended };
  };

  // ---------------------------------------------------------------- shelf
  CB.legacy = function (p) {
    const t = p.st.test, s = p.st.shield;
    const tAvg = t.inn - t.no > 0 ? t.r / (t.inn - t.no) : 0, tBowlAvg = t.w ? t.rc / t.w : 99;
    if ((tAvg >= 55 && t.m >= 40) || (tAvg >= 50 && t.m >= 110) || (t.w >= 400 && tBowlAvg < 26) || (t.w >= 250 && tBowlAvg < 22)) return { label: 'All-time great', rank: 7 };
    if ((tAvg >= 45 && t.m >= 60) || (tAvg >= 50 && t.m >= 25) || (t.w >= 220 && tBowlAvg < 29) || (t.w >= 150 && tBowlAvg < 24) || (t.m >= 120)) return { label: 'Australian great', rank: 6 };
    if (t.m >= 20) return { label: 'Test regular', rank: 5 };
    if (t.m >= 2) return { label: 'Test cricketer', rank: 4 };
    if (t.m === 1) return { label: 'One-Test wonder', rank: 4 };
    if (s.m >= 50) return { label: 'Shield stalwart', rank: 3 };
    if (s.m >= 10) return { label: 'State player', rank: 2 };
    if (s.m >= 1) return { label: 'Fringe state player', rank: 1 };
    return { label: 'Second XI battler', rank: 0 };
  };
  const fmtAvg = (r, d) => d > 0 ? (r / d).toFixed(2) : '-';
  CB.statLine = function (s) {
    return { m: s.m, runs: s.r, avg: fmtAvg(s.r, s.inn - s.no), sr: s.bf ? (s.r / s.bf * 100).toFixed(1) : '-', hs: s.hs + (s.hsNo ? '*' : ''), h100: s.h100, f50: s.f50, w: s.w, bavg: s.w ? (s.rc / s.w).toFixed(2) : '-', bb: s.bbW ? s.bbW + '/' + s.bbR : '-', w5: s.w5, ct: s.ct, st: s.st, econ: s.b ? (s.rc / s.b * 6).toFixed(2) : '-' };
  };
  CB.bio = function (W, p, ended) {
    const L = CB.legacy(p), t = p.st.test, s = p.st.shield;
    const st = CB.stateById(p.team).name;
    const role = p.role === 'pace' || p.role === 'spin' ? CB.SUB_INFO[p.sub].toLowerCase() : CB.ROLE_INFO[p.role].label.toLowerCase();
    const years = `${p.joined}-${W.year}`;
    const parts = [];
    const desc = (p.hand === 'L' ? 'left-handed ' : '') + role;
    parts.push(`${p.first} ${p.last} was ${/^[aeiou]/i.test(desc) ? 'an' : 'a'} ${desc} from ${st} (${years}).`);
    if (t.m) {
      const tl = CB.statLine(t);
      parts.push(`He played ${t.m} Test${t.m > 1 ? 's' : ''} for Australia${p.capNo ? ' (cap no. ' + p.capNo + ')' : ''}, debuting against ${p.debut.test ? p.debut.test.vs : 'the old enemy'} in ${p.debut.test ? CB.seasonLabel(p.debut.test.year) : ''}.`);
      if (t.r >= 300) parts.push(`He scored ${t.r.toLocaleString()} Test runs at ${tl.avg} with ${t.h100} hundred${t.h100 === 1 ? '' : 's'} and a best of ${tl.hs}.`);
      if (t.w >= 10) parts.push(`With the ball he took ${t.w} Test wickets at ${tl.bavg}, best ${tl.bb}${t.w5 ? ', with ' + t.w5 + ' five-wicket haul' + (t.w5 > 1 ? 's' : '') : ''}.`);
    } else if (s.m) {
      const sl = CB.statLine(s);
      parts.push(`He never wore the baggy green but played ${s.m} Sheffield Shield match${s.m > 1 ? 'es' : ''}.`);
      if (s.r >= 300) parts.push(`${s.r.toLocaleString()} Shield runs at ${sl.avg}, best ${sl.hs}.`);
      if (s.w >= 10) parts.push(`${s.w} Shield wickets at ${sl.bavg}.`);
    } else parts.push(`He never quite broke into the Shield side, battling away in the Second XI for ${CB.statLine(p.st.seconds).m} matches.`);
    const ct = (p.captRec || {}).test, cs = (p.captRec || {}).shield;
    if (ct && ct.m) parts.push(`He captained Australia in ${ct.m} Test${ct.m > 1 ? 's' : ''} (won ${ct.w}, lost ${ct.l}, drew ${ct.d}).`);
    else if (cs && cs.m) parts.push(`He captained ${st} in ${cs.m} Shield match${cs.m > 1 ? 'es' : ''}.`);
    if (p.countyStints && p.countyStints.length) { const c = p.countyStints.map(x => CB.countyById(x.id) ? CB.countyById(x.id).name : x.id); parts.push(`County stints: ${[...new Set(c)].join(', ')} (${p.st.county ? p.st.county.r + ' runs, ' + p.st.county.w + ' wickets' : ''}).`); }
    if (p.honours.length) parts.push('Honours: ' + [...new Set(p.honours.map(h => h.text))].slice(0, 4).join(', ') + '.');
    if (p.potm) parts.push(`Player of the match ${p.potm} time${p.potm > 1 ? 's' : ''}.`);
    parts.push(ended === 'delisted' ? 'His state let him go when the contract list was trimmed.' : ended === 'age' ? 'He played on until his body finally said enough.' : `He retired aged ${p.age}.`);
    return { legacy: L, text: parts.join(' ') };
  };
  CB.shelfEntry = function (W, ended) {
    const p = CB.user(W);
    const b = CB.bio(W, p, ended);
    const peakBat = Math.round(0.5 * (CB.batComposite(p.caps, false) + CB.batComposite(p.caps, true)));
    const peakBowl = p.bowls ? Math.round(CB.bowlComposite(p.caps, p.sub)) : null;
    return {
      id: p.id + '-' + Date.now(), name: p.first + ' ' + p.last, state: p.team, role: p.role, sub: p.sub, hand: p.hand,
      years: `${p.joined}-${W.year}`, ageEnd: p.age, legacy: b.legacy, bio: b.text, tier: p.tier,
      test: CB.statLine(p.st.test), shield: CB.statLine(p.st.shield), seconds: CB.statLine(p.st.seconds), county: p.st.county ? CB.statLine(p.st.county) : null,
      capt: p.captRec || {}, legacy: p.legacy || null, fame: p.fame || 0,
      traits: p.traits.slice(), honours: [...new Set(p.honours.map(h => h.text))], potm: p.potm || 0, capNo: p.capNo || null,
      hidden: { bat: peakBat, bowl: peakBowl, keep: p.role === 'wk' ? Math.round(p.caps.KEEP) : null }, ended,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
