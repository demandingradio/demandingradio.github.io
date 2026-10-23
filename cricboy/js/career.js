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
      god: !!o.god,  // god mode: every hidden number visible and editable (no legacy unlocks)
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
    // the buzz of a hundred or a five-for (it also carries a bowler through a heavy workload)
    if (last && last.ton) e += last.ton;
    if (last && last.five) e += last.five;
    if (last && last.overs >= 45 && !last.five) e--;
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
  // Every match has a key moment: the user's first chance in his own trade (walking out to bat, his first over, or a
  // spell behind the stumps for a keeper). After that call, a bigger situation later on (the nervous nineties, a
  // hat-trick ball, a tight chase, a declaration) can bring a bonus moment.
  // Both must be stopping times, decided from what has happened so far and never from how the match ends: picking a
  // moment with hindsight and then replaying from it gives failed innings a second go. The first chance is always
  // taken; later triggers are walked in order and each is taken or passed on an independent coin.
  function momentTriggers(U, p) {
    const M = U.M, ti = U.ti, me = U.sides[ti].indexOf(p.id);
    const bats = ['open', 'top', 'mid', 'wk', 'ar'].includes(p.role);
    const bowls = ['pace', 'spin', 'ar'].includes(p.role) && !!M.teams[ti].xi[me].bw;
    const keeps = p.role === 'wk' && M.teams[ti].keeperIdx === me;
    const out = [];
    let own = 0, opp = 0;
    for (const I of M.inns) {
      const batting = I.bat === ti, tr = [];
      if (batting && bats && I.bats[me].in) {
        const dayStart = new Set((I.dayMarks || []).map(m => m.at)), nb = new Set(I.newBalls || []);
        let runs = 0, faced = 0, arrived = false, n50 = false, n100 = false, night = false, gone = false, spun = false, nbOn = false, newBallDue = false;
        for (let i = 0; i < I.log.length; i++) {
          const L = I.log[i], P = I.log[i - 1] || { sc: 0, wk: 0 };
          if (nb.has(i)) newBallDue = true;
          if (!arrived && (L.s === me || L.n === me)) {
            arrived = true;
            const need = I.k === 3 ? I.target - P.sc : 0;
            const kind = I.k === 3 && need > 40 && need < 220 ? 'chase' : me <= 1 ? 'open' : P.wk >= 3 && P.sc < 120 ? 'rescue' : CB.lastBowlerSpin(M, I, i) ? 'spinArrive' : 'arrive';
            tr.push({ kind, i, need, main: true, bonus: kind === 'chase' ? 1 : 0 });
          } else if (arrived) {
            // set and still there: a new morning, a new partner, spin on, the second new ball
            if (!night && dayStart.has(i) && runs >= 10) { night = true; tr.push({ kind: 'overnight', i, runs, bonus: 0.08 }); }
            if (!gone && P.w === 'W' && P.x && P.x.out !== me && runs >= 20) { gone = true; tr.push({ kind: 'partnerGone', i, runs, bonus: 0.05 }); }
            if (!spun && L.s === me && faced >= 12 && CB.lastBowlerSpin(M, I, i)) { spun = true; tr.push({ kind: 'spinOn', i, runs, bonus: 0.05 }); }
            if (!nbOn && newBallDue && runs >= 10) { nbOn = true; tr.push({ kind: 'newBallBat', i, runs, bonus: 0.08 }); }
          }
          if (L.s === me && !n50 && runs >= 42 && runs < 50) { n50 = true; tr.push({ kind: 'near50', i, runs, bonus: 0.1 }); }
          if (L.s === me && !n100 && runs >= 88 && runs < 100) { n100 = true; tr.push({ kind: 'near100', i, runs, bonus: 1 }); }
          if (L.s === me && (typeof L.w === 'number' || L.w === 'nb')) runs += L.r;
          if (L.s === me && L.w !== 'wd' && L.w !== 'nb') faced++;
          if (L.w === 'W' && L.x && L.x.out === me) break;
        }
      }
      if (!batting && bowls) {
        const spin = CB.isSpinner(p), nb = I.newBalls || [], dayOf = j => { let d = I.startDay; for (const o of I.om || []) { if (o[0] > j) break; d = o[1]; } return d; };
        let first = false, stand = false, tail = false, morning = false, second = false, part = 0, lastDay = 0, w1 = false, w2 = false, fresh = false;
        for (let i = 0; i < I.log.length; i++) {
          const L = I.log[i];
          if (L.bw === me) {
            const d = dayOf(i);
            if (!first) {
              first = true;
              // brought on: what the game looks like right then
              const kind = part >= 70 ? (spin ? 'spinStand' : 'stand') : L.wk >= 8 ? 'tail' : spin ? (I.k >= 2 ? 'spinWorn' : 'spinFirst') : (L.b < 30 ? 'newBall' : 'paceFirst');
              tr.push({ kind, i, part, main: true, bonus: spin && I.k >= 2 ? 0.2 : 0.04 });
              stand = stand || part >= 70; tail = tail || L.wk >= 8;
            } else {
              if (!morning && d > lastDay && d >= 2) { morning = true; tr.push({ kind: 'morning', i, bonus: 0.05 }); }
              if (!second && nb.length && i >= nb[0] && !spin) { second = true; tr.push({ kind: 'secondNew', i, bonus: 0.1 }); }
              if (w1 && w2) tr.push({ kind: 'hattrick', i, bonus: 1 });
              else if (w1 && !fresh) { fresh = true; tr.push({ kind: 'freshBat', i, bonus: 0.05 }); }
              if (!stand && part >= 70) { stand = true; tr.push({ kind: spin ? 'spinStand' : 'stand', i, part, bonus: 0.07 }); }
              if (!tail && L.wk >= 8) { tail = true; tr.push({ kind: 'tail', i, bonus: 0.07 }); }
            }
            lastDay = d;
            if (L.w !== 'wd' && L.w !== 'nb') { const mine = L.w === 'W' && L.x && I.bats[L.x.out].out && I.bats[L.x.out].out.kind !== 7; w2 = w1 && mine; w1 = mine; }
          }
          part = L.w === 'W' ? 0 : part + L.r;
        }
      }
      if (!batting && keeps && I.log.length > 40) {
        // behind the stumps: the first spell of spin after the new ball, else a long day standing back
        const i = I.log.findIndex((L, j) => j >= 30 && CB.lastBowlerSpin(M, I, j));
        tr.push(i >= 0 ? { kind: 'keepSpin', i, main: true, bonus: 0 } : { kind: 'keepPace', i: 40, main: true, bonus: 0 });
      }
      if (U.captain) {
        if (batting && I.k === 2) {
          const i = I.log.findIndex(L => own + L.sc - opp >= 200);
          if (i > 0 && i + 1 < I.log.length && I.log[i].wk <= 7) tr.push({ kind: 'captDeclare', i: i + 1, lead: own + I.log[i].sc - opp, bonus: 1 });
        }
        if (!batting) {
          let part = 0;
          const i = I.log.findIndex(L => { part = L.w === 'W' ? 0 : part + L.r; return part >= 80; });
          if (i >= 0 && i + 1 < I.log.length) tr.push({ kind: 'captStand', i: i + 1, part, bonus: 0.3 });
        }
      }
      tr.sort((a, b) => a.i - b.i);
      for (const t of tr) out.push(Object.assign(t, { I }));
      if (batting) own += I.runs; else opp += I.runs;
    }
    return out;
  }
  CB.momentTriggers = (U, p) => momentTriggers(U, p);
  CB.momentFrom = (U, p, t, bonus) => momentFrom(U, p, t, bonus);
  CB.findMoment = function (U, p) {
    if (U.sides[U.ti].indexOf(p.id) < 0) return null;
    const t = momentTriggers(U, p).find(x => x.main);
    return t ? momentFrom(U, p, t, false) : null;
  };
  // after the main call has been replayed: a bonus moment later in the match, or null
  CB.findBonusMoment = function (U, p, main) {
    const coin = CB.rng((U.cfg.seed ^ 0x6a09e667) >>> 0);
    for (const t of momentTriggers(U, p)) {
      if (t.I.k < main.inns || (t.I.k === main.inns && t.i <= main.at) || !t.bonus) continue;
      if (coin() < t.bonus) return momentFrom(U, p, t, true);
    }
    return null;
  };
  function momentFrom(U, p, c, bonus) {
    const M = U.M, ti = U.ti;
    const T = MOMENTS[c.kind];
    const cue = CB.momentCues(M, c.I, c.i, ti);
    const L = c.I.log[c.i - 1] || { sc: 0, wk: 0, b: 0 }, now = c.I.log[c.i] || L;
    const bt = M.teams[c.I.bat].short || M.teams[c.I.bat].name;
    const ctx = { score: `${bt} ${L.sc}/${L.wk}`, runs: c.runs, need: c.need, part: c.part, lead: c.lead, opp: M.teams[1 - ti].name, team: M.teams[ti].name,
      bowler: M.teams[c.I.fld].xi[now.bw] ? M.teams[c.I.fld].xi[now.bw].short : 'the bowler', cue };
    const opts = typeof T.options === 'function' ? T.options(p) : T.options;
    return { kind: c.kind, inns: c.I.k, at: c.i, title: T.title, text: T.text(ctx), situation: `Innings ${c.I.k + 1} · ${ctx.score} · ${CB.oversStr(L.b)} ov`,
      cues: cue.tags, options: opts, bonus, captain: c.kind.startsWith('capt'), side: c.kind.startsWith('capt') ? 'capt' : c.I.bat === ti ? 'bat' : c.kind.startsWith('keep') ? 'keep' : 'bowl' };
  };
  CB.lastBowlerSpin = (M, I, i) => { const L = I.log[i]; const b = L && M.teams[I.fld].xi[L.bw]; return !!(b && b.bw && b.bw.t === 1); };

  // what a player can read at that moment: the day, the pitch on the day, the ball, the state of the game
  CB.momentCues = function (M, I, i, ti) {
    const L = I.log[i - 1] || { sc: 0, wk: 0, b: 0 };
    const om = (I.om || []).filter(o => o[0] <= i).pop() || [0, I.startDay, (M.days - I.startDay + 1) * M.opd * 6];
    const day = om[1], fx = M.dayFx[day - 1] || M.pitch;
    const ov = L.b / 6, nbAt = (I.newBalls || []).filter(j => j <= i).pop(), age = nbAt != null ? ov - (I.log[nbAt - 1] ? I.log[nbAt - 1].b / 6 : 0) : ov;
    let own = 0, opp = 0;
    for (const J of M.inns) { if (J === I) break; if (J.bat === I.bat) own += J.runs; else opp += J.runs; }
    const lead = own + L.sc - opp, need = I.k === 3 ? I.target - L.sc : null;
    let part = 0, pb = 0;
    for (let j = i - 1; j >= 0 && I.log[j].w !== 'W'; j--) { part += I.log[j].r; if (I.log[j].w !== 'wd' && I.log[j].w !== 'nb') pb++; }
    const c = { day, seam: fx.wP, turn: fx.wS, flat: fx.r, age, wk: L.wk, sc: L.sc, lead, need, k: I.k, oversLeft: om[2] / 6,
      part, partRR: pb ? part / pb * 6 : 0, batting: I.bat === ti, spin: CB.lastBowlerSpin(M, I, i), days: M.days };
    c.rr = need != null ? need / Math.max(1, c.oversLeft) : null;
    c.helpful = c.seam > 0.1 || c.turn > 0.12;
    const t = [`Day ${day}`];
    if (c.seam > 0.1) t.push('🌱 Seaming'); if (c.turn > 0.12) t.push('🌀 Turning');
    if (!c.helpful) t.push(c.flat > 0.06 || (c.seam < -0.1 && c.turn < 0.05) ? '🛣️ Flat deck' : '🏏 Even contest');
    t.push(age < 12 ? '🔴 New ball' : age >= 50 ? '🟤 Old ball' : `⚪ Ball ${Math.floor(age)} ov old`);
    if (need != null) t.push(`🎯 ${need} needed · ~${Math.round(c.oversLeft)} ov left`);
    else if (I.k > 0) t.push(lead >= 0 ? `📈 Lead by ${lead}` : `📉 Trail by ${-lead}`);
    if (c.wk >= 3 && c.sc / c.wk < 25) t.push('😬 Wickets tumbling');
    if (part >= 50) t.push(`🤝 Stand of ${part}`);
    c.tags = t;
    return c;
  };

  // each moment: options (training area a), and a read of the cues -> { good: [a...], bad: [a...], why }
  const MOMENTS = {
    captDeclare: { title: 'Declaration call', text: c => `${c.score}. You lead by ${c.lead}. The dressing room is waiting on your call.`,
      options: [{ t: 'Declare now and back your bowlers', a: 'MEN', m: 'now' }, { t: 'Bat on and make it safe', a: 'CON', m: 'later' }, { t: 'Ten quick overs, then declare', a: 'ATT', m: 'push' }],
      read: c => {
        const needOv = c.helpful ? 75 : 100;
        if (c.oversLeft < needOv) return { good: ['MEN'], bad: ['CON'], why: `About ${Math.round(c.oversLeft)} overs left: you need time to bowl them out.` };
        if (c.oversLeft > needOv + 60) return { good: ['CON'], bad: ['MEN'], why: `${Math.round(c.oversLeft)} overs left is plenty. Bat them out of the game first.` };
        return { good: ['ATT'], bad: [], why: 'Quick runs now, then enough time to bowl them out.' };
      } },
    captStand: { title: "Captain's call", text: c => `${c.score}. A ${c.part}-run stand. Every head on the field turns to you.`,
      options: p => [{ t: 'Attack: three slips and a gully', a: 'MEN', m: 'attack' }, { t: 'Spread the field and dry up the runs', a: 'CON', m: 'spread' }, p.bowls ? { t: 'Throw the ball to yourself', a: CB.isSpinner(p) ? 'CRA' : 'STK', m: 'self' } : { t: 'Move yourself to short leg', a: 'FLD', m: 'shortleg' }],
      read: (c, p) => {
        const mine = p.bowls && ((CB.isSpinner(p) && c.turn > 0.12) || (!CB.isSpinner(p) && (c.seam > 0.1 || c.age < 15)));
        if (mine) return { good: [CB.isSpinner(p) ? 'CRA' : 'STK', 'MEN'], bad: ['CON'], why: 'The conditions suit your own bowling: back yourself.' };
        if (c.helpful || c.age < 15) return { good: ['MEN'], bad: ['CON'], why: 'There is help for the bowlers. Attack it.' };
        if (c.partRR > 3.5) return { good: ['CON'], bad: ['MEN'], why: 'Runs are flowing on a good deck. Squeeze them.' };
        return { good: [], bad: [], why: 'No obvious answer on this pitch.' };
      } },
    open: { title: 'New ball', text: c => `You walk out to open. ${c.opp} have the new ball and ${c.bowler} is at the top of his mark.`,
      options: [{ t: 'Leave everything outside off', a: 'DEF' }, { t: 'Look to drive anything full', a: 'ATT' }, { t: 'Get forward, play late, soft hands', a: 'PACE' }],
      read: c => c.seam > 0.1 ? { good: ['DEF', 'PACE'], bad: ['ATT'], why: 'It is seaming around: leave well, play late.' }
        : c.seam < -0.08 || c.flat > 0.08 ? { good: ['ATT'], bad: [], why: 'Nothing in it for the quicks. There are runs up front.' }
        : { good: ['PACE'], bad: ['ATT'], why: 'A bit of early movement: soft hands, nothing loose.' } },
    arrive: { title: 'Walking out', text: c => `${c.score}. You're in. Fielders chirp as you take guard against ${c.bowler}.`,
      options: [{ t: 'Get off the mark early, look for singles', a: 'RUN' }, { t: 'Block, block, block. Earn the right', a: 'CON' }, { t: 'Put the bad ball away', a: 'ATT' }],
      read: c => c.wk >= 3 && c.sc / Math.max(1, c.wk) < 30 ? { good: ['CON'], bad: ['ATT'], why: 'Wickets have been falling. Survive first.' }
        : c.seam > 0.1 || c.age < 12 ? { good: ['CON'], bad: ['ATT'], why: 'The ball is still doing a bit. Earn the right.' }
        : c.flat > 0.06 || (c.k === 2 && c.lead > 150) ? { good: ['ATT'], bad: [], why: 'Flat deck, and the game wants runs.' }
        : { good: ['RUN'], bad: [], why: 'Rotate the strike and the field has to come in.' } },
    rescue: { title: 'Rescue job', text: c => `${c.score}. Collapse on. The crowd's gone quiet. Your side needs a partnership.`,
      options: [{ t: 'Counter-punch: hit them off their length', a: 'ATT' }, { t: 'Dig in for the long haul', a: 'CON' }, { t: 'Solid technique, play straight', a: 'DEF' }],
      read: c => c.turn > 0.12 ? { good: ['ATT'], bad: ['DEF'], why: 'On a turner a ball has your name on it. Make them pay first.' }
        : c.seam > 0.1 || c.age < 20 ? { good: ['DEF'], bad: ['ATT'], why: 'The ball is moving. Play straight and late.' }
        : { good: ['CON'], bad: [], why: 'The pitch is fine. It needs time, not shots.' } },
    spinArrive: { title: 'Spin from the off', text: c => `${c.score}. ${c.bowler} is wheeling away with men around the bat.`,
      options: [{ t: 'Use your feet, get to the pitch', a: 'SPIN' }, { t: 'Sweep hard, put him off his length', a: 'ATT' }, { t: 'Pad it away, smother the spin', a: 'DEF' }],
      read: c => c.turn > 0.12 ? { good: ['ATT'], bad: ['DEF'], why: 'It is ragging out of the rough. Sweep him off his length.' }
        : c.turn < 0 ? { good: ['SPIN'], bad: [], why: 'Little turn: get down the pitch and smother it.' }
        : { good: ['SPIN'], bad: ['DEF'], why: 'Footwork beats a spinner on a fair pitch. Pads invite the lbw.' } },
    near50: { title: 'Knocking on fifty', text: c => `You're on ${c.runs}*. ${c.score}. A fifty is right there. The field spreads.`,
      options: [{ t: 'Keep the scoreboard ticking with singles', a: 'RUN' }, { t: "Stay patient. It'll come", a: 'CON' }, { t: 'Loft one over the infield', a: 'ATT' }],
      read: c => (c.k === 2 && c.lead > 150) || (c.rr != null && c.rr > 4) ? { good: ['ATT'], bad: ['CON'], why: 'The game needs quick runs.' }
        : c.wk >= 5 ? { good: ['CON'], bad: ['ATT'], why: 'Your side is five down. Stay there.' }
        : { good: ['RUN'], bad: ['ATT'], why: 'Singles are there with the field back.' } },
    near100: { title: 'The nervous nineties', text: c => `On ${c.runs}*. ${c.score}. The whole ground knows. Your heart is thumping.`,
      options: [{ t: 'Back yourself, go big', a: 'ATT' }, { t: 'Breathe. One ball at a time', a: 'MEN' }, { t: 'Nudge, nurdle and run hard', a: 'RUN' }],
      read: c => (c.k === 2 && c.lead > 150) || (c.rr != null && c.rr > 4) ? { good: ['ATT'], bad: [], why: 'The team needs quick runs. Go and get it.' }
        : c.wk >= 6 ? { good: ['MEN'], bad: ['ATT'], why: 'The tail is with you. Don\'t throw it away.' }
        : { good: ['MEN'], bad: ['ATT'], why: 'Nerves are the enemy. Slow the heart rate down.' } },
    chase: { title: 'The chase', text: c => `Chasing. ${c.need} still needed. ${c.score}. Time and wickets both matter now.`,
      options: [{ t: 'Take the attack to them', a: 'ATT' }, { t: 'Rotate strike, keep wickets in hand', a: 'RUN' }, { t: 'Shut up shop, play for time', a: 'DEF' }],
      read: c => c.rr > 5.5 ? { good: ['DEF'], bad: ['ATT'], why: `${Math.round(c.rr * 10) / 10} an over is beyond you. Save the game.` }
        : c.rr > 3.6 ? { good: ['ATT'], bad: ['DEF'], why: `${Math.round(c.rr * 10) / 10} an over: you have to go now.` }
        : { good: ['RUN'], bad: ['ATT'], why: `${Math.round(c.rr * 10) / 10} an over is gettable. No risks, keep it ticking.` } },
    overnight: { title: 'Resuming overnight', text: c => `You resume on ${c.runs}*. ${c.score}. A fresh morning and fresh bowlers.`,
      options: [{ t: 'Leave well early on', a: 'DEF' }, { t: 'Pick up where you left off', a: 'ATT' }, { t: 'Re-set: bat like you\'re on nought', a: 'CON' }],
      read: c => c.seam > 0.08 ? { good: ['DEF'], bad: ['ATT'], why: 'The morning ball is moving. Respect the first hour.' }
        : c.flat > 0.06 ? { good: ['ATT'], bad: [], why: 'A flat deck in the sun. Keep the momentum.' }
        : { good: ['CON'], bad: ['ATT'], why: 'Overnight batters get out early. Start again.' } },
    newBallBat: { title: 'The second new ball', text: c => `${c.score}. They've taken the new ball. You're on ${c.runs}*.`,
      options: [{ t: 'See it off, soft hands', a: 'PACE' }, { t: 'Hard ball flies: cash in', a: 'ATT' }, { t: 'Get off strike, share the load', a: 'RUN' }],
      read: c => c.seam > 0.05 ? { good: ['PACE'], bad: ['ATT'], why: 'The new ball is seaming. Survive it.' }
        : c.flat > 0.06 ? { good: ['ATT'], bad: [], why: 'Hard ball, flat deck: it comes on nicely.' }
        : { good: ['PACE'], bad: [], why: 'Ten careful overs and the ball is yours again.' } },
    partnerGone: { title: 'Partner gone', text: c => `${c.score}. Your partner's gone. You're set on ${c.runs}* and there's a new batter in.`,
      options: [{ t: 'Take charge, farm the strike', a: 'RUN' }, { t: 'Keep playing your own game', a: 'CON' }, { t: 'Take the quicks, shield the new man', a: 'PACE' }],
      read: c => c.wk >= 6 ? { good: ['RUN'], bad: ['CON'], why: 'The tail is in. Farm the strike.' }
        : c.seam > 0.08 || c.age < 15 ? { good: ['PACE'], bad: [], why: 'Lively ball. Protect the new man from it.' }
        : { good: ['CON'], bad: [], why: 'You are the set batter. Keep doing what works.' } },
    spinOn: { title: 'Spin on', text: c => `${c.score}. ${c.bowler} comes on. You're ${c.runs}* and the field closes in.`,
      options: [{ t: 'Use your feet', a: 'SPIN' }, { t: 'Sweep him off his length', a: 'ATT' }, { t: 'Watch him out of the hand', a: 'DEF' }],
      read: c => c.turn > 0.12 ? { good: ['ATT'], bad: ['DEF'], why: 'Big turn: sweep and push him off his length.' }
        : { good: ['SPIN'], bad: [], why: 'Not much turn. Get to the pitch of it.' } },
    freshBat: { title: 'New batter', text: c => `${c.score}. Wicket! A new batter is in. Your over.`,
      options: p => CB.isSpinner(p) ? [{ t: 'Toss it up, men around the bat', a: 'CRA' }, { t: 'Rip one big first up', a: 'STK' }, { t: 'Dart it in at the stumps', a: 'ACC' }]
        : [{ t: 'Full and straight first ball', a: 'ACC' }, { t: 'Bouncer to welcome him', a: 'STK' }, { t: 'Pack the cordon, hunt the edge', a: 'CRA' }],
      read: (c, p) => CB.isSpinner(p)
        ? (c.turn > 0.12 ? { good: ['STK'], bad: [], why: 'It is turning. A big one first up.' } : c.wk >= 7 ? { good: ['ACC'], bad: [], why: 'A tail-ender: straight ones do it.' } : { good: ['CRA'], bad: [], why: 'New batters are vulnerable in the air.' })
        : (c.wk >= 7 ? { good: ['ACC'], bad: ['CRA'], why: 'Tail-enders miss straight ones. They rarely nick.' } : c.seam > 0.08 ? { good: ['CRA'], bad: [], why: 'It is seaming. Make the new man play.' } : { good: ['ACC'], bad: ['STK'], why: 'Make him play first ball. A bouncer lets him off.' }) },
    hattrick: { title: 'On a hat-trick', text: c => `${c.score}. Two in two. The whole ground is on its feet.`,
      options: p => [{ t: CB.isSpinner(p) ? 'Fire it at the stumps' : 'Yorker. Full and straight', a: 'ACC' }, { t: CB.isSpinner(p) ? 'Biggest leg-break you\'ve got' : 'The bouncer he won\'t expect', a: 'STK' }, { t: 'Same ball as the last two', a: 'CRA' }],
      read: () => ({ good: ['ACC'], bad: ['STK'], why: 'Hit the stumps: bowled and lbw need no help.' }) },
    morning: { title: 'New day', text: c => `Day ${c.cue.day}. ${c.score}. Fresh legs, fresh spell.`,
      options: p => CB.isSpinner(p) ? [{ t: 'Flight it early', a: 'CRA' }, { t: 'Rip it from ball one', a: 'STK' }, { t: 'Hold an end, tight lines', a: 'ACC' }]
        : [{ t: 'Pitch it up, look for swing', a: 'CRA' }, { t: 'Hit the deck, hard length', a: 'STK' }, { t: 'Make them play every ball', a: 'ACC' }],
      read: (c, p) => CB.isSpinner(p)
        ? (c.turn > 0.12 ? { good: ['STK'], bad: [], why: 'Overnight dew gone, the dust is back. Spin it.' } : { good: ['ACC'], bad: [], why: 'Little turn this morning. Build pressure.' })
        : (c.seam > 0.08 ? { good: ['CRA'], bad: ['STK'], why: 'Morning moisture: pitch it up and swing it.' } : c.seam < -0.05 ? { good: ['STK'], bad: ['CRA'], why: 'No swing about. Bang it in.' } : { good: ['ACC'], bad: [], why: 'Settle into a line and make them play.' }) },
    secondNew: { title: 'Second new ball', text: c => `${c.score}. 80 overs up. The captain takes the new ball and hands it to you.`,
      options: [{ t: 'Pitch it up and swing it', a: 'CRA' }, { t: 'Hit the deck hard', a: 'STK' }, { t: 'Tight lines, make them play', a: 'ACC' }],
      read: c => c.seam > 0.1 ? { good: ['CRA'], bad: [], why: 'It is moving. Pitch it up.' }
        : c.seam < -0.05 ? { good: ['STK'], bad: ['CRA'], why: 'No movement: use the hardness and bounce.' }
        : { good: ['ACC'], bad: [], why: 'A good pitch rewards a tight line.' } },
    newBall: { title: 'Taking the new ball', text: c => `${c.score}. The captain tosses you the cherry.`,
      options: [{ t: 'Pitch it up and swing it', a: 'CRA' }, { t: 'Hit the deck hard, extract bounce', a: 'STK' }, { t: 'Tight lines, make them play', a: 'ACC' }],
      read: c => c.seam > 0.1 ? { good: ['CRA'], bad: [], why: 'It is moving. Pitch it up and let it swing.' }
        : c.seam < -0.05 ? { good: ['STK'], bad: ['CRA'], why: 'No movement: hit the deck and make it uncomfortable.' }
        : { good: ['ACC'], bad: [], why: 'A good pitch rewards a tight line on off stump.' } },
    paceFirst: { title: 'First change', text: c => `${c.score}. You come on first change. The shine is going.`,
      options: [{ t: 'Bang it in, bouncer plan', a: 'STK' }, { t: 'Fourth-stump line, dry them up', a: 'ACC' }, { t: 'Wobble seam, hunt the edge', a: 'CRA' }],
      read: c => c.seam > 0.08 ? { good: ['CRA'], bad: [], why: 'There is still something off the seam.' }
        : c.age >= 40 ? { good: ['CRA'], bad: [], why: 'Old ball: wobble it and hunt reverse.' }
        : c.flat > 0.06 || c.partRR > 3.5 ? { good: ['ACC'], bad: ['CRA'], why: 'Runs are flowing. Dry them up first.' }
        : { good: ['STK'], bad: [], why: 'A flat patch. Rough them up.' } },
    stand: { title: 'Break the stand', text: c => `${c.score}. A ${c.part}-run partnership is killing you. The captain needs something.`,
      options: [{ t: 'Short-ball barrage', a: 'STK' }, { t: 'Patience: maidens build pressure', a: 'ACC' }, { t: 'Go wider on the crease, angle it in', a: 'CRA' }],
      read: c => c.age >= 45 ? { good: ['CRA'], bad: [], why: 'The old ball is reversing. Angle it in.' }
        : c.partRR > 3.8 ? { good: ['ACC'], bad: ['STK'], why: 'They are scoring freely. Starve them.' }
        : c.seam > 0.05 ? { good: ['STK'], bad: [], why: 'Pace and bounce in the deck. Test them up top.' }
        : { good: ['ACC'], bad: [], why: 'Pressure builds wickets on a good pitch.' } },
    tail: { title: 'Mopping up', text: c => `${c.score}. The tail is in. Finish this.`,
      options: [{ t: 'Yorkers, full and straight', a: 'ACC' }, { t: 'Bouncers to the tail-enders', a: 'STK' }, { t: 'Keep running in hard, bowl long', a: 'STA' }],
      read: c => c.seam > 0.1 ? { good: ['STK'], bad: [], why: 'Lively deck: the short ball will do it.' }
        : { good: ['ACC'], bad: ['STA'], why: 'Full and straight. Tail-enders miss straight ones.' } },
    spinFirst: { title: 'Toss it up', text: c => `${c.score}. You're on early. The batters are eyeing you up.`,
      options: [{ t: 'Flight it, buy the wicket', a: 'CRA' }, { t: 'Dart it in, keep it tight', a: 'ACC' }, { t: 'Rip it hard, look for drift', a: 'STK' }],
      read: c => c.turn > 0.12 ? { good: ['STK'], bad: [], why: 'It is turning already. Give it a rip.' }
        : c.turn < -0.05 ? { good: ['ACC'], bad: ['CRA'], why: 'Nothing in it for you yet. Hold an end.' }
        : { good: ['CRA'], bad: [], why: 'A fair pitch: flight beats them in the air.' } },
    spinWorn: { title: 'Day dust', text: c => `${c.score}. Footmarks outside off. This could be your day.`,
      options: [{ t: 'Aim at the rough, rip it', a: 'STK' }, { t: 'Vary flight and pace', a: 'CRA' }, { t: 'Bowl all day from one end', a: 'STA' }],
      read: c => c.turn > 0.1 ? { good: ['STK'], bad: [], why: 'The rough is there to use. Hit it.' }
        : c.rr != null && c.rr > 3.5 ? { good: ['CRA'], bad: ['STA'], why: 'They need to go after you. Tempt them.' }
        : { good: ['CRA'], bad: [], why: 'Not much turn: beat them in the air.' } },
    spinStand: { title: 'Holding an end', text: c => `${c.score}. A ${c.part}-run stand. The quicks are cooked. The captain throws you the ball.`,
      options: [{ t: 'Fire it in flat, bore them out', a: 'ACC' }, { t: 'Tempt the big drive', a: 'CRA' }, { t: 'More revs, more risk', a: 'STK' }],
      read: c => c.turn > 0.12 ? { good: ['STK'], bad: [], why: 'The pitch is turning. Spin it hard.' }
        : c.partRR > 3.5 ? { good: ['CRA'], bad: [], why: 'They are attacking. Give them the bait.' }
        : { good: ['ACC'], bad: [], why: 'On a flat one, dry them up.' } },
    keepSpin: { title: 'Standing up', text: c => `${c.score}. Standing up to the spinner, the batter's lunging. Half a chance is coming.`,
      options: [{ t: 'Stay low, move late', a: 'KEEP' }, { t: 'Chirp and build pressure', a: 'MEN' }, { t: 'Keep your energy for the long day', a: 'FIT' }],
      read: c => c.turn > 0.1 ? { good: ['KEEP'], bad: ['FIT'], why: 'It is spitting. Every half-chance counts.' }
        : c.day >= 3 ? { good: ['FIT'], bad: [], why: 'A long day in the field. Stay sharp late.' }
        : { good: ['MEN'], bad: [], why: 'Little turn: build the pressure yourself.' } },
    keepPace: { title: 'Behind the stumps', text: c => `${c.score}. Standing back to the quicks. A long session ahead.`,
      options: [{ t: 'Stay low, watch every ball in', a: 'KEEP' }, { t: 'Chirp and lift the bowlers', a: 'MEN' }, { t: 'Pace yourself for the day', a: 'FIT' }],
      read: c => c.seam > 0.1 ? { good: ['KEEP'], bad: [], why: 'Edges will come. Be ready.' }
        : c.day >= 3 || c.flat > 0.06 ? { good: ['FIT', 'MEN'], bad: [], why: 'A long grind. Energy and voice win days like this.' }
        : { good: ['KEEP'], bad: [], why: 'Concentration behind the stumps is your job.' } },
  };

  // how each call plays (wicket logit W, rotation R, boundaries B; q = more overs). The styles are trade-offs, roughly
  // even on their own; what pays is the read: a call that fits the conditions and the game, or fights them.
  const BAT_STYLE = { ATT: { W: 0.12, B: 0.25 }, DEF: { W: -0.1, R: -0.12, B: -0.25 }, CON: { W: -0.07, R: -0.06, B: -0.15 }, RUN: { W: 0.03, R: 0.18, B: -0.08 }, PACE: { W: -0.04, R: -0.03, B: -0.06 }, SPIN: { W: 0.02, R: 0.05, B: 0.1 }, MEN: { W: -0.03, B: -0.03 } };
  const BOWL_STYLE = { STK: { W: 0.06, B: 0.12 }, ACC: { W: -0.03, R: -0.1, B: -0.12 }, CRA: { W: 0.03, B: 0.06 }, STA: { R: -0.04, q: 0.6 } };
  const READ_BAT = { 1: { W: -0.25, R: 0.04, B: 0.04 }, 0: {}, '-1': { W: 0.2 } };
  const READ_BOWL = { 1: { W: 0.2 }, 0: {}, '-1': { W: -0.1, B: 0.08 } };
  const plus = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; };
  // the user's call -> fit (+1 good read, 0, -1 against the grain), a verdict, and the engine's cfg.mom
  CB.momentPlan = function (U, mo, choice, p) {
    const M = U.M, I = M.inns[mo.inns], ti = U.ti, me = U.sides[ti].indexOf(p.id);
    const T = MOMENTS[mo.kind], o = mo.options[choice];
    const c = CB.momentCues(M, I, mo.at, ti);
    const rd = T.read(c, p);
    const fit = rd.good.includes(o.a) ? 1 : rd.bad.includes(o.a) ? -1 : 0;
    const L = I.log[mo.at - 1] || { sc: 0, b: 0 };
    const mom = { k: mo.inns, i: mo.at, ti, idx: me };
    if (mo.side === 'bat') mom.bat = plus(BAT_STYLE[o.a] || {}, READ_BAT[fit]);
    else if (mo.side === 'bowl') mom.bowl = plus(BOWL_STYLE[o.a] || {}, READ_BOWL[fit]);
    else if (mo.side === 'keep') { mom.keep = o.a === 'KEEP' ? { drop: fit > 0 ? 0.55 : 0.75, bye: 0.7 } : { drop: fit < 0 ? 1.25 : 0.9, bye: 1 }; mom.own = { W: fit * 0.05 + (o.a === 'MEN' ? 0.03 : 0) }; }
    else if (mo.kind === 'captDeclare') { mom.declare = o.m; mom.b0 = L.b; mom.r0 = L.sc; mom.after = true; mom.own = { W: fit > 0 ? 0.08 : fit < 0 ? -0.04 : 0 }; }
    else if (mo.kind === 'captStand') {
      const bonus = fit > 0 ? 0.1 : fit < 0 ? -0.05 : 0;
      if (o.m === 'attack') mom.opp = { W: 0.1 + bonus, B: 0.1 };
      else if (o.m === 'spread') mom.opp = { W: -0.04 + bonus, R: -0.08, B: -0.18 };
      else if (o.m === 'self') { mom.bowl = { q: 1.5, W: bonus }; mom.opp = { W: bonus * 0.5 }; }
      else mom.opp = { W: 0.03 + bonus };
    }
    const verdict = fit > 0 ? '✅ Great read. ' + rd.why : fit < 0 ? '⚠️ Against the grain. ' + rd.why : '👍 Fair call. ' + rd.why;
    return { mom, fit, verdict };
  };
  // the line under the moment on the result screen, from the final match
  CB.momentAfter = function (U, mo, p) {
    const M = U.M, I = M.inns[mo.inns], me = U.sides[U.ti].indexOf(p.id);
    if (mo.captain) return M.result.text + '.';
    if (I.bat === U.ti) {
      const b = I.bats[me];
      const d = CB.dismissalText(M, I, b);
      return b.out ? `You made ${b.runs} off ${b.balls} before you were ${d.startsWith('run out') ? d : 'out ' + d}.` : `You finished ${b.runs}* off ${b.balls}.`;
    }
    if (mo.side === 'keep') { const t = M.teams[I.fld]; let ct = 0, st = 0; for (const b of I.bats) if (b.out && b.out.fielder === me) { if (b.out.kind === 4) st++; else ct++; } return `Behind the stumps: ${ct} catch${ct === 1 ? '' : 'es'}${st ? ', ' + st + ' stumping' + (st > 1 ? 's' : '') : ''}. ${t.name} conceded ${I.ex.b} byes.`; }
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
    const ton = best >= 200 ? 2 : best >= 100 ? 1 : 0, five = wk >= 10 ? 2 : bestW >= 5 ? 1 : 0;
    p.lastMatch = { quiet, overs, runs, wk, ton, five };
    if (ton) ev.push({ type: 'energy', text: (best >= 200 ? 'Double hundred' : 'Hundred') + ': +' + ton + ' energy for training' });
    if (five) ev.push({ type: 'energy', text: (wk >= 10 ? 'Ten in the match' : 'Five-for') + ': +' + five + ' energy for training' });
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
    const my = myV, bar = weakest;
    const text = d > 2 ? `Selectors are talking about you for the ${nm} side.` : d > -2 ? `On the fringe. One big game could get you a ${nm} call-up.` : d > -6 ? `In the frame, but there are players ahead of you for a ${nm} spot.` : `A long way from ${nm} selection. Keep piling up the numbers.`;
    return { level: lvl, text, heat: clamp((d + 8) / 12, 0, 1), my, bar, target };
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
    const t = p.st.test;
    return legacyOf(t.m, t.inn - t.no > 0 ? t.r / (t.inn - t.no) : 0, t.w, t.w ? t.rc / t.w : 99, p.st.shield.m);
  };
  // the same verdict from a finished career's stat lines (the Shelf keeps those, not raw stats)
  CB.legacyFromLines = (t, s) => legacyOf(t.m, parseFloat(t.avg) || 0, t.w, parseFloat(t.bavg) || 99, s.m);
  function legacyOf(tm, tAvg, tw, tBowlAvg, sm) {
    const t = { m: tm, w: tw }, s = { m: sm };
    if ((tAvg >= 55 && t.m >= 40) || (tAvg >= 50 && t.m >= 110) || (t.w >= 400 && tBowlAvg < 26) || (t.w >= 250 && tBowlAvg < 22)) return { label: 'All-time great', rank: 7 };
    if ((tAvg >= 45 && t.m >= 60) || (tAvg >= 50 && t.m >= 25) || (t.w >= 220 && tBowlAvg < 29) || (t.w >= 150 && tBowlAvg < 24) || (t.m >= 120)) return { label: 'Australian great', rank: 6 };
    if (t.m >= 20) return { label: 'Test regular', rank: 5 };
    if (t.m >= 2) return { label: 'Test cricketer', rank: 4 };
    if (t.m === 1) return { label: 'One-Test wonder', rank: 4 };
    if (s.m >= 50) return { label: 'Shield stalwart', rank: 3 };
    if (s.m >= 10) return { label: 'State player', rank: 2 };
    if (s.m >= 1) return { label: 'Fringe state player', rank: 1 };
    return { label: 'Second XI battler', rank: 0 };
  }
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
    } else { const n = p.st.seconds.m; parts.push(`He never quite broke into the Shield side, battling away in the Second XI for ${n} match${n === 1 ? '' : 'es'}.`); }
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
      capt: p.captRec || {}, legacyPerk: p.legacy || null, fame: p.fame || 0,
      traits: p.traits.slice(), honours: [...new Set(p.honours.map(h => h.text))], potm: p.potm || 0, capNo: p.capNo || null,
      hidden: { bat: peakBat, bowl: peakBowl, keep: p.role === 'wk' ? Math.round(p.caps.KEEP) : null }, ended, god: !!p.god,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
