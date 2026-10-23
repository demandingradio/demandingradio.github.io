/* Cricboy Arcade: a career squeezed to the length of a card-game run. Eight antes of three blinds (each blind is one
   match, a Second XI game up to the Ashes) with a score target; miss one and the run is over. Every ball is still the
   real engine; the arcade scores the user's part in the match (points x mult) and adds one of three skill systems:
     1  a build: cards bought between matches that score off what you do, some of them changing how you play
     2  a hand: shot / delivery cards played through your innings and spells, a deck you build between matches
     3  a read: three calls a match feeding a momentum multiplier you either ride or bank
   Pure logic: the UI (js/arcade-ui.js) and the calibration bots (cricboy-dev/tools/arcadebot.js) drive it. */
(function (G) {
  'use strict';
  const CB = G.CB = G.CB || {};
  const A = CB.ARC = {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const shuffle = (r, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------------------------------------------------------- the run
  A.ANTES = [
    { lv: 'seconds', name: 'Second XI', short: '2nd XI' },
    { lv: 'shield', name: 'Sheffield Shield', short: 'Shield' },
    { lv: 'shield', name: 'Shield run-in', short: 'Shield' },
    { lv: 'test', name: 'Test debut summer', short: 'Tests', opp: ['NZ', 'WI'], home: true },
    { lv: 'test', name: 'Tour of India', short: 'India', opp: ['IND'], home: false },
    { lv: 'test', name: 'Tour of South Africa', short: 'S Africa', opp: ['SA'], home: false },
    { lv: 'test', name: 'The Ashes in England', short: 'Ashes', opp: ['ENG'], home: false },
    { lv: 'test', name: 'The Ashes at home', short: 'Ashes', opp: ['ENG'], home: true },
  ];
  A.BLINDS = [{ id: 'small', name: 'Small blind', reward: 3 }, { id: 'big', name: 'Big blind', reward: 4 }, { id: 'boss', name: 'Boss', reward: 5 }];
  A.BOSSES = [
    { id: 'green', name: 'The Green Top', icon: '🌱', text: 'A grassy pitch. The ball seams all match.', pitch: { r: -0.08, wP: 0.3, wS: -0.08 } },
    { id: 'dust', name: 'The Dustbowl', icon: '🌀', text: 'Cracks everywhere. It turns from day one.', pitch: { r: -0.04, wP: -0.06, wS: 0.34 } },
    { id: 'road', name: 'The Road', icon: '🛣️', text: 'Flat as a pancake. Wickets cost a fortune.', pitch: { r: 0.16, wP: -0.16, wS: -0.12 } },
    { id: 'crowd', name: 'The Hostile Crowd', icon: '📣', text: 'Booed every ball. You play under pressure.' },
    { id: 'rain', name: 'The Washout', icon: '🌧️', text: 'A day lost to rain before a ball is bowled.' },
    { id: 'spot', name: 'The Spotlight', icon: '🔦', text: 'Only your best innings with bat or ball counts.' },
    { id: 'champ', name: 'The Champions', icon: '🏆', text: 'The opposition are at their very best.' },
    { id: 'chair', name: 'The Chairman', icon: '🧐', text: 'Target +25%. Pays $3 more.' },
  ];
  A.boss = id => A.BOSSES.find(b => b.id === id);
  // score targets per variant and role group: [base, growth] for each blind, target = base x growth^(ante-1)
  // (fitted to the expert bot's scores by cricboy-dev/tools/arcadefit.js: small/big/boss at its 6th/10th/14th
  // percentile; variant 3 gentler at 4/7/10, as its expert bot reads every call perfectly)
  A.TARGETS = {"1":{"bat":[[30,1.142],[40,1.188],[50,1.208]],"wk":[[24,1.305],[32,1.307],[45,1.265]],"ar":[[58,1.258],[71,1.32],[83,1.337]],"pace":[[52,1.39],[69,1.378],[81,1.391]],"spin":[[48,1.308],[59,1.302],[67,1.333]]},"2":{"bat":[[144,1],[219,1],[251,1]],"wk":[[53,1],[82,1],[97,1.031]],"ar":[[80,1.013],[115,1],[137,1]],"pace":[[49,1],[68,1],[81,1]],"spin":[[61,1],[76,1],[90,1]]},"3":{"bat":[[70,1.074],[124,1.046],[143,1.063]],"wk":[[89,1.013],[112,1.04],[134,1.043]],"ar":[[187,1.031],[217,1.036],[243,1.034]],"pace":[[123,1.071],[160,1.063],[206,1.035]],"spin":[[140,1.04],[158,1.052],[181,1.053]]}};
  A.group = p => ['open', 'top', 'mid'].includes(p.role) ? 'bat' : p.role;
  A.target = function (R, ante, blind) {
    const T = A.TARGETS[R.v][R.group || 'bat'][blind];
    let t = T[0] * Math.pow(T[1], ante - 1);
    if (blind === 2 && R.bosses[ante - 1] === 'chair') t *= 1.25;
    return Math.max(5, Math.round(t / 5) * 5);
  };
  A.SKILLS = {
    bat: ['DEF', 'ATT', 'PACE', 'SPIN', 'CON', 'RUN', 'MEN'],
    bowl: ['ACC', 'STK', 'CRA', 'STA', 'MEN', 'FIT'],
    wk: ['DEF', 'ATT', 'PACE', 'SPIN', 'CON', 'KEEP', 'MEN'],
    ar: ['DEF', 'ATT', 'PACE', 'SPIN', 'CON', 'ACC', 'STK', 'CRA', 'MEN'],
  };
  const skillSet = p => p.role === 'pace' || p.role === 'spin' ? A.SKILLS.bowl : p.role === 'wk' ? A.SKILLS.wk : p.role === 'ar' ? A.SKILLS.ar : A.SKILLS.bat;
  const sides = p => ({ bat: ['open', 'top', 'mid', 'wk', 'ar'].includes(p.role), bowl: ['pace', 'spin', 'ar'].includes(p.role) });

  // every run starts from the same player: a fringe state cricketer. The skill system decides the rest.
  function baseline(p) {
    const s = sides(p), set = (k, v) => { p.a[k] = v; p.caps[k] = 99; };
    const B = p.role === 'ar' || p.role === 'wk' ? 43 : s.bat ? 47 : 24;
    for (const k of ['DEF', 'PACE', 'SPIN', 'CON']) set(k, B);
    set('ATT', s.bat ? B + 2 : 28); set('RUN', 52);
    const Q = p.role === 'ar' ? 44 : s.bowl ? 47 : 18;
    for (const k of ['ACC', 'STK', 'CRA']) set(k, Q);
    set('STA', s.bowl ? 56 : 30); set('FLD', 52); set('FIT', 62); set('MEN', 52); set('KEEP', p.role === 'wk' ? 56 : 15);
    if (!s.bowl) { p.bowls = false; p.sub = null; }
    p.tier = 'arcade'; p.injury = 0; p.power = 0; p.bias = 0; p.traits = [];
    CB.refresh(p);
  }

  A.newRun = function (o) {
    const W = CB.newWorld(o.seed >>> 0, 2026);
    const state = o.state || CB.STATES[(o.seed >>> 3) % 6].id;
    const p = CB.createUser(W, { first: o.first, last: o.last, state, role: o.role, sub: o.sub, hand: o.hand || 'R' });
    baseline(p);
    const r = CB.rngFor(W);
    const bosses = shuffle(r, A.BOSSES.map(b => b.id)).slice(0, 8);
    W.arcade = { v: o.v, ante: 1, blind: 0, money: 4, bosses, stage: 'board', over: false, won: false,
      group: A.group(p), strikes: 3, jokers: [], deck: null, discards: 2, chain: 1, items: [], ups: {}, hist: [], stats: { m: 0, runs: 0, wk: 0, best: 0 }, shop: null, rerolls: 0 };
    if (o.v === 2) initDeck(W.arcade, p);
    return W;
  };

  // ---------------------------------------------------------------- building the blind's match
  function freeze(t) { t.xi = t.xi.map(x => Object.assign({}, x, { e: Object.assign({}, x.e), bw: x.bw ? Object.assign({}, x.bw) : x.bw })); }
  A.buildMatch = function (W) {
    const R = W.arcade, ante = A.ANTES[R.ante - 1], p = CB.user(W), r = CB.rngFor(W);
    const boss = R.blind === 2 ? A.boss(R.bosses[R.ante - 1]) : null;
    const lv = ante.lv, home = ante.home != null ? ante.home : R.blind !== 1;
    p._ctx = { level: lv, home, final: false, debut: false, captain: false };
    let cfg, ids;
    if (lv !== 'test') {
      const st = W.states[p.team], opp = pick(r, CB.STATES.filter(s => s.id !== p.team)), os = W.states[opp.id];
      const firsts = s => CB.pickXI(W, s.squad, 'shield', {});
      let mine, theirs;
      if (lv === 'shield') { mine = CB.pickXI(W, st.squad, 'shield', { force: p.id }); theirs = firsts(os); }
      else {
        const f1 = firsts(st).filter(id => id !== p.id), f2 = firsts(os);
        mine = CB.pickXI(W, st.squad.filter(id => !f1.includes(id)).concat(st.club), 'seconds', { force: p.id });
        theirs = CB.pickXI(W, os.squad.filter(id => !f2.includes(id)).concat(os.club), 'seconds', {});
      }
      const nm = s => s.name + (lv === 'seconds' ? ' 2nd XI' : '');
      const hs = home ? CB.stateById(p.team) : opp;
      ids = [mine, theirs];
      cfg = { level: lv, country: 'AUS', home: home ? 0 : 1, venue: lv === 'shield' ? hs.ground : hs.ground2,
        teams: [CB.teamFromIds(W, mine, nm(CB.stateById(p.team)), p.team), CB.teamFromIds(W, theirs, nm(opp), opp.id)] };
    } else {
      const code = pick(r, ante.opp), nat = CB.NATIONS[code], country = home ? 'AUS' : nat.country;
      const asia = ['IND', 'SL', 'BAN', 'PAK'].includes(country);
      const aus = CB.pickXI(W, CB.STATES.flatMap(s => W.states[s.id].squad), 'test', { force: p.id, spinners: asia ? 2 : 1, mustSpin: true });
      const oxi = CB.pickXI(W, W.nations[code].squad, 'test', { spinners: asia && !home ? 2 : 1 });
      ids = [aus, oxi];
      cfg = { level: 'test', country, home: home ? 0 : 1, venue: home ? pick(r, CB.AUS_TEST_VENUES) : pick(r, nat.venues),
        teams: [CB.teamFromIds(W, aus, 'Australia', 'AUS'), CB.teamFromIds(W, oxi, nat.name, code)] };
    }
    cfg.seed = (r() * 4294967296) >>> 0;
    cfg.teams.forEach(freeze);
    const me = ids[0].indexOf(p.id), ux = cfg.teams[0].xi[me];
    if (ux.bw) ux.bw.q += 0.8;  // an arcade run is about you: the captain gives you a real bowl
    if (boss) {
      if (boss.pitch) cfg.pitch = Object.assign({}, boss.pitch);
      if (boss.id === 'rain') cfg.days = CB.LEVELS[lv].days - 1;
      if (boss.id === 'crowd') { ux.e.mod = (ux.e.mod || 0) + 0.12; if (ux.bw) ux.bw.mod = (ux.bw.mod || 0) - 0.1; }
      if (boss.id === 'champ') for (const x of cfg.teams[1].xi) { x.e.W -= 0.12; if (x.bw) x.bw.W += 0.12; }
    }
    if (R.v === 1) applyEngineJokers(R, ux, cfg);
    const M = CB.simMatch(cfg);
    return { M, cfg, sides: ids, ti: 0, level: lv, committed: false, boss, home };
  };

  // ---------------------------------------------------------------- the user's match, for scoring
  A.lines = function (U, p) {
    const M = U.M, ti = U.ti, me = U.sides[ti].indexOf(p.id);
    const bat = [], bowl = [];
    let ct = 0, st = 0;
    for (const I of M.inns) {
      if (I.bat === ti) {
        const b = I.bats[me]; if (!b.in) continue;
        const ai = I.log.findIndex(L => L.s === me || L.n === me), P = I.log[ai - 1] || { sc: 0, wk: 0 };
        bat.push({ k: I.k, runs: b.runs, balls: b.balls, out: !!b.out, f4: b.f4, f6: b.f6, inWk: P.wk, inSc: P.sc });
      } else {
        const b = I.bowl[me];
        if (b && (b.balls || b.wd || b.nb)) {
          const kinds = [], pos = [];
          I.bats.forEach((x, j) => { if (x.out && x.out.bowler === me && x.out.kind !== 7) { kinds.push(x.out.kind); pos.push(j); } });
          bowl.push({ k: I.k, balls: b.balls, runs: b.runs, wk: b.wk, md: b.md, kinds, pos });
        }
        for (const x of I.bats) if (x.out && x.out.fielder === me) { if (x.out.kind === 4) st++; else if (x.out.kind === 2 || x.out.kind === 5) ct++; }
      }
    }
    const res = M.result || {};
    return { bat, bowl, ct, st, win: res.winner === ti, draw: !!(res.draw || res.tie), home: U.home };
  };
  const RUNS = L => L.bat.reduce((a, b) => a + b.runs, 0), WKTS = L => L.bowl.reduce((a, b) => a + b.wk, 0);
  A.WK_PTS = 12; A.CT_PTS = 6;

  // ---------------------------------------------------------------- variant 1: the build (cards bought between matches)
  // kind: chips (+points) | mult (+mult) | xmult (x mult) | econ | engine (changes how you play)
  const J = [
    { id: 'boundary', name: 'Boundary Rider', icon: '🏏', cost: 4, r: 0, kind: 'chips', text: '+4 pts for every four you hit', f: x => 4 * x.L.bat.reduce((a, b) => a + b.f4, 0) },
    { id: 'bighit', name: 'Big Hitter', icon: '💥', cost: 5, r: 0, kind: 'chips', text: '+12 pts for every six', f: x => 12 * x.L.bat.reduce((a, b) => a + b.f6, 0) },
    { id: 'anchor', name: 'The Anchor', icon: '⚓', cost: 5, r: 0, kind: 'mult', text: '+1 mult per 50 balls you face', f: x => Math.floor(x.L.bat.reduce((a, b) => a + b.balls, 0) / 50) },
    { id: 'fifty', name: 'Fifty Club', icon: '🎖️', cost: 4, r: 0, kind: 'mult', text: '+2 mult for each fifty', f: x => 2 * x.L.bat.filter(b => b.runs >= 50).length },
    { id: 'ton', name: 'Ton-Up', icon: '💯', cost: 7, r: 2, kind: 'xmult', text: 'x2 mult for each hundred', f: x => Math.pow(2, x.L.bat.filter(b => b.runs >= 100).length) },
    { id: 'notout', name: 'Not Out', icon: '🧱', cost: 5, r: 1, kind: 'xmult', text: 'x1.5 mult if you finish an innings unbeaten (10+ balls)', f: x => x.L.bat.some(b => !b.out && b.balls >= 10) ? 1.5 : 1 },
    { id: 'rescue', name: 'Rescue Act', icon: '🚑', cost: 5, r: 1, kind: 'mult', text: '+3 mult if you walk in at 3 down or worse and make 30+', f: x => x.L.bat.some(b => b.inWk >= 3 && b.runs >= 30) ? 3 : 0 },
    { id: 'quick', name: 'Quickfire', icon: '⚡', cost: 5, r: 0, kind: 'mult', text: '+2 mult for an innings of 30+ balls at a strike rate of 65+', f: x => 2 * x.L.bat.filter(b => b.balls >= 30 && b.runs / b.balls >= 0.65).length },
    { id: 'graft', name: 'Grafter', icon: '⛏️', cost: 5, r: 1, kind: 'mult', text: '+3 mult for an innings of 120+ balls', f: x => 3 * x.L.bat.filter(b => b.balls >= 120).length },
    { id: 'strike', name: 'Strike Bowler', icon: '🎯', cost: 5, r: 0, kind: 'mult', text: '+0.5 mult per wicket', f: x => 0.5 * WKTS(x.L) },
    { id: 'fivefor', name: 'Five-for', icon: '🖐️', cost: 7, r: 2, kind: 'xmult', text: 'x2 mult for each five-wicket innings', f: x => Math.pow(2, x.L.bowl.filter(b => b.wk >= 5).length) },
    { id: 'miser', name: 'The Miser', icon: '🧾', cost: 4, r: 0, kind: 'chips', text: '+6 pts per maiden', f: x => 6 * x.L.bowl.reduce((a, b) => a + b.md, 0) },
    { id: 'bowled', name: 'Timber!', icon: '🪵', cost: 4, r: 0, kind: 'chips', text: '+12 pts per bowled or lbw', f: x => 12 * x.L.bowl.reduce((a, b) => a + b.kinds.filter(k => k === 1 || k === 3).length, 0) },
    { id: 'toporder', name: 'Top-Order Hunter', icon: '👑', cost: 5, r: 1, kind: 'chips', text: '+15 pts per top-four wicket', f: x => 15 * x.L.bowl.reduce((a, b) => a + b.pos.filter(j => j <= 3).length, 0) },
    { id: 'workhorse', name: 'Workhorse', icon: '🐎', cost: 4, r: 0, kind: 'chips', text: '+1 pt per over you bowl', f: x => Math.floor(x.L.bowl.reduce((a, b) => a + b.balls, 0) / 6) },
    { id: 'hands', name: 'Safe Hands', icon: '🧤', cost: 3, r: 0, kind: 'chips', text: '+15 pts per catch or stumping', f: x => 15 * (x.L.ct + x.L.st) },
    { id: 'winner', name: 'Winning Habit', icon: '🏆', cost: 5, r: 1, kind: 'xmult', text: 'x1.5 mult if your side wins', f: x => x.L.win ? 1.5 : 1 },
    { id: 'home', name: 'Hometown', icon: '🏠', cost: 3, r: 0, kind: 'mult', text: '+2 mult at home', f: x => x.L.home ? 2 : 0 },
    { id: 'tourist', name: 'Tourist', icon: '🧳', cost: 3, r: 0, kind: 'mult', text: '+2 mult away from home', f: x => x.L.home ? 0 : 2 },
    { id: 'sponsor', name: 'Sponsor Deal', icon: '💰', cost: 4, r: 0, kind: 'econ', text: '+$2 after every match you pass', f: () => 0 },
    { id: 'piggy', name: 'Piggy Bank', icon: '🐷', cost: 5, r: 1, kind: 'mult', text: '+1 mult per $5 you hold', f: x => Math.floor(x.R.money / 5) },
    { id: 'runbank', name: 'Run Bank', icon: '🏦', cost: 6, r: 1, kind: 'chips', text: '+1 pt per 12 runs scored since you bought it', f: (x, j) => Math.floor((j.n || 0) / 12), grow: (x, j) => { j.n = (j.n || 0) + RUNS(x.L); } },
    { id: 'tally', name: 'Wicket Tally', icon: '📈', cost: 6, r: 1, kind: 'mult', text: '+0.05 mult per wicket taken since you bought it', f: (x, j) => 0.05 * (j.n || 0), grow: (x, j) => { j.n = (j.n || 0) + WKTS(x.L); } },
    { id: 'collector', name: 'Fifty Collector', icon: '📚', cost: 6, r: 1, kind: 'mult', text: '+0.4 mult per fifty scored since you bought it', f: (x, j) => 0.4 * (j.n || 0), grow: (x, j) => { j.n = (j.n || 0) + x.L.bat.filter(b => b.runs >= 50).length; } },
    { id: 'bosskill', name: 'Boss Killer', icon: '🗡️', cost: 6, r: 1, kind: 'xmult', text: 'x2 mult against a boss', f: x => x.boss ? 2 : 1 },
    { id: 'allround', name: 'Bits and Pieces', icon: '🔀', cost: 5, r: 1, kind: 'xmult', text: 'x2 mult if you make 25+ runs and take 2+ wickets', f: x => RUNS(x.L) >= 25 && WKTS(x.L) >= 2 ? 2 : 1 },
    { id: 'heavybat', name: 'Heavy Bat', icon: '🪓', cost: 6, r: 1, kind: 'engine', text: 'You hit far more boundaries, and get out a bit more', eng: (ux) => { ux.e.B += 0.22; ux.e.S6 = (ux.e.S6 || 0) + 0.15; ux.e.W += 0.06; } },
    { id: 'ironwall', name: 'Iron Wall', icon: '🛡️', cost: 6, r: 1, kind: 'engine', text: 'Much harder to dismiss, but you score slower', eng: (ux) => { ux.e.W -= 0.16; ux.e.R -= 0.08; ux.e.B -= 0.12; } },
    { id: 'swingking', name: 'Swing King', icon: '🌬️', cost: 6, r: 1, kind: 'engine', text: 'Deadly with the new ball (first 20 overs of each ball)', eng: (ux) => { if (ux.bw) ux.bw.swing = (ux.bw.swing || 0) + 0.2; } },
    { id: 'spinwiz', name: 'Spin Wizard', icon: '🪄', cost: 6, r: 1, kind: 'engine', text: 'Your bowling takes more wickets, far more in Asia', eng: (ux, cfg) => { if (ux.bw) ux.bw.W += ['IND', 'SL', 'BAN', 'PAK', 'UAE'].includes(cfg.country) ? 0.22 : 0.07; } },
    { id: 'tight', name: 'Dot-Ball Merchant', icon: '🧊', cost: 5, r: 0, kind: 'engine', text: 'You concede far fewer runs', eng: (ux) => { if (ux.bw) { ux.bw.R -= 0.12; ux.bw.B -= 0.15; } } },
  ];
  A.JOKERS = J;
  A.joker = id => J.find(j => j.id === id);
  A.JOKER_SLOTS = 5;
  function applyEngineJokers(R, ux, cfg) { for (const j of R.jokers) { const d = A.joker(j.id); if (d.kind === 'engine' && d.eng) d.eng(ux, cfg); } }

  // ---------------------------------------------------------------- variant 2: the hand (cards played through the match)
  // each card: mods for the phase (bat W/R/B for your batting; bowl W/R/B for your bowling), a condition that sharpens it,
  // and a goal that adds mult if met in that phase. Phases: 24 balls of your innings, or 48 balls of an innings you bowl in.
  const BAT_C = [
    { id: 'leave', name: 'Leave', icon: '🙅', m: { W: -0.3, R: -0.15, B: -0.45 }, cond: c => c.seam > 0.1 || c.age < 15, condText: 'new ball or seaming', bonus: { W: -0.25 }, goal: 'survive', g: 0.5, goalText: 'survive the phase' },
    { id: 'defend', name: 'Solid Defence', icon: '🛡️', m: { W: -0.18, R: -0.06, B: -0.25 }, cond: c => c.turn > 0.1 || c.wk >= 3, condText: 'turning, or wickets down', bonus: { W: -0.12 }, goal: 'survive', g: 0.35, goalText: 'survive the phase' },
    { id: 'drive', name: 'Cover Drive', icon: '🏏', m: { W: 0.08, B: 0.3 }, cond: c => c.flat > 0.04 || (c.age >= 30 && c.seam < 0.05), condText: 'flat deck or old ball', bonus: { W: -0.2 }, anti: c => c.seam > 0.1 && c.age < 20, antiBonus: { W: 0.25 }, goal: 'fours', g: 0.15, goalText: '+0.15 per four' },
    { id: 'pull', name: 'Pull & Hook', icon: '🪝', m: { W: 0.1, B: 0.32 }, cond: c => !c.spin && c.flat > -0.02, condText: 'pace on a true pitch', bonus: { W: -0.12, B: 0.1 }, anti: c => c.spin, antiBonus: { W: 0.25 }, goal: 'sixes', g: 0.3, goalText: '+0.3 per six' },
    { id: 'cut', name: 'Square Cut', icon: '✂️', m: { W: 0.05, R: 0.05, B: 0.22 }, cond: c => !c.spin && c.age >= 35, condText: 'pace, old ball', bonus: { W: -0.1 }, goal: 'fours', g: 0.12, goalText: '+0.12 per four' },
    { id: 'sweep', name: 'Sweep', icon: '🧹', m: { W: 0.02, B: 0.26 }, cond: c => c.spin && c.turn > 0.1, condText: 'spin on a turner', bonus: { W: -0.18 }, anti: c => !c.spin, antiBonus: { W: 0.3 }, goal: 'fours', g: 0.15, goalText: '+0.15 per four' },
    { id: 'feet', name: 'Use Your Feet', icon: '👟', m: { W: 0.02, B: 0.2, R: 0.05 }, cond: c => c.spin && c.turn < 0.06, condText: 'spin with little turn', bonus: { W: -0.14 }, anti: c => !c.spin, antiBonus: { W: 0.28 }, goal: 'sixes', g: 0.3, goalText: '+0.3 per six' },
    { id: 'rotate', name: 'Rotate the Strike', icon: '🔄', m: { W: 0, R: 0.3, B: -0.1 }, cond: c => c.spin || (c.part >= 10 && c.partRR < 2.5), condText: 'spin, or a slow scoreboard', bonus: { W: -0.06, R: 0.1 }, goal: 'runs15', g: 0.4, goalText: '15+ runs in the phase' },
    { id: 'loft', name: 'Go Aerial', icon: '🚀', m: { W: 0.24, B: 0.45 }, cond: c => c.flat > 0.06 || c.k === 3 && c.rr > 4, condText: 'a road, or a chase on', bonus: { W: -0.18 }, anti: c => c.seam > 0.1 || c.turn > 0.15, antiBonus: { W: 0.2 }, goal: 'sixes', g: 0.45, goalText: '+0.45 per six' },
    { id: 'nudge', name: 'Nudge & Nurdle', icon: '🐌', m: { W: -0.08, R: 0.15, B: -0.15 }, cond: c => c.wk >= 5, condText: 'batting with the tail', bonus: { W: -0.08, R: 0.1 }, goal: 'survive', g: 0.3, goalText: 'survive the phase' },
  ];
  const BOWL_C = [
    { id: 'line', name: 'Line & Length', icon: '📏', m: { W: 0, R: -0.15, B: -0.2 }, cond: c => c.flat > 0.04, condText: 'a flat pitch', bonus: { R: -0.1, W: 0.05 }, goal: 'econ', g: 0.4, goalText: 'under 3 an over' },
    { id: 'outswing', name: 'Outswinger', icon: '🌬️', pace: true, m: { W: 0.1, B: 0.06 }, cond: c => c.seam > 0.08 || c.age < 20, condText: 'new ball or seaming', bonus: { W: 0.28 }, anti: c => c.age >= 40 && c.seam < 0, antiBonus: { W: -0.12, B: 0.15 }, goal: 'wkts', g: 0.35, goalText: '+0.35 per wicket' },
    { id: 'inswing', name: 'Inswinger', icon: '↩️', pace: true, m: { W: 0.08 }, cond: c => c.age < 20, condText: 'the new ball', bonus: { W: 0.24 }, anti: c => c.age >= 40, antiBonus: { W: -0.1 }, goal: 'bowled', g: 0.5, goalText: '+0.5 per bowled or lbw' },
    { id: 'bouncer', name: 'Bouncer Barrage', icon: '🪖', pace: true, m: { W: 0.1, B: 0.16 }, cond: c => c.seam > 0.04 && c.flat < 0.06, condText: 'a lively pitch', bonus: { W: 0.22 }, anti: c => c.flat > 0.08, antiBonus: { B: 0.2, W: -0.06 }, goal: 'wkts', g: 0.3, goalText: '+0.3 per wicket' },
    { id: 'yorker', name: 'Yorker', icon: '🦶', pace: true, m: { W: 0.07, R: -0.05 }, cond: c => c.wk >= 6 || c.age >= 45, condText: 'the tail, or an old ball', bonus: { W: 0.3 }, goal: 'bowled', g: 0.55, goalText: '+0.55 per bowled or lbw' },
    { id: 'cutter', name: 'Cutters & Slower Balls', icon: '🐢', pace: true, m: { W: 0.05, R: -0.1, B: -0.05 }, cond: c => c.age >= 40 || c.flat > 0.05, condText: 'old ball or flat', bonus: { W: 0.2 }, anti: c => c.age < 15, antiBonus: { W: -0.1, B: 0.1 }, goal: 'wkt1', g: 0.4, goalText: 'take a wicket' },
    { id: 'flight', name: 'Flight It', icon: '🪶', spin: true, m: { W: 0.12, B: 0.15 }, cond: c => c.turn > 0.08, condText: 'some turn', bonus: { W: 0.2 }, anti: c => c.turn < 0 , antiBonus: { W: -0.1, B: 0.2 }, goal: 'wkts', g: 0.35, goalText: '+0.35 per wicket' },
    { id: 'dart', name: 'Dart It In', icon: '🎯', spin: true, m: { W: -0.02, R: -0.15, B: -0.22 }, cond: c => c.turn < 0.04, condText: 'little turn', bonus: { R: -0.08, W: 0.06 }, goal: 'econ', g: 0.4, goalText: 'under 3 an over' },
    { id: 'rip', name: 'Rip It', icon: '🌪️', spin: true, m: { W: 0.1, B: 0.1 }, cond: c => c.turn > 0.15 || c.day >= 3, condText: 'big turn or a worn pitch', bonus: { W: 0.3 }, anti: c => c.day <= 1 && c.turn < 0.05, antiBonus: { W: -0.12, B: 0.12 }, goal: 'wkts', g: 0.45, goalText: '+0.45 per wicket' },
    { id: 'mystery', name: 'The Mystery Ball', icon: '🎭', spin: true, m: { W: 0.18, B: 0.12 }, cond: c => c.partRR > 3, condText: 'batters attacking', bonus: { W: 0.1 }, goal: 'wkts', g: 0.5, goalText: '+0.5 per wicket' },
    { id: 'attack', name: 'Attacking Field', icon: '🧲', m: { W: 0.09, B: 0.2 }, cond: c => c.wk >= 6 || c.k === 3 && c.rr > 3.5, condText: 'tail in, or they must chase', bonus: { W: 0.22 }, anti: c => c.partRR > 3.5 && c.wk < 4, antiBonus: { B: 0.2 }, goal: 'wkts', g: 0.25, goalText: '+0.25 per wicket' },
  ];
  A.CARDS = BAT_C.map(c => Object.assign({ side: 'bat' }, c)).concat(BOWL_C.map(c => Object.assign({ side: 'bowl' }, c)));
  A.card = id => A.CARDS.find(c => c.id === id);
  A.cardPool = p => A.CARDS.filter(c => (c.side === 'bat' ? sides(p).bat : sides(p).bowl) && !(c.pace && CB.isSpinner(p)) && !(c.spin && !CB.isSpinner(p)));
  const lvMul = lv => 1 + 0.2 * ((lv || 1) - 1);  // card effects per level; goals scale with the level itself
  function initDeck(R, p) {
    const spin = CB.isSpinner(p), s = sides(p), d = [];
    const add = (id, n) => { for (let i = 0; i < n; i++) d.push({ id, lv: 1 }); };
    if (s.bat) { add('leave', 2); add('defend', 2); add('drive', 2); add('rotate', 2); add('pull', 1); add('sweep', 1); }
    if (s.bowl) { add('line', 2); add('attack', 2); if (spin) { add('dart', 2); add('flight', 2); add('rip', 2); } else { add('outswing', 2); add('bouncer', 2); add('yorker', 2); } }
    R.deck = d;
  }
  A.PHASE = { bat: 24, bowl: 36, max: 8, hand: 4 };
  // draw a hand for one side from a per-match shuffled pile
  function drawHand(R, st, side, r) {
    st.piles = st.piles || {};
    let pile = st.piles[side];
    if (!pile || pile.length < A.PHASE.hand) { pile = shuffle(r, R.deck.map((c, i) => i).filter(i => A.card(R.deck[i].id).side === side)); st.piles[side] = pile; }
    return pile.splice(0, A.PHASE.hand);
  }
  A.cardMods = function (card, lv, c) {
    const d = A.card(card), m = Object.assign({}, d.m), k = lvMul(lv);
    for (const x in m) m[x] *= k;
    const on = d.cond(c), off = d.anti && d.anti(c);
    if (on) for (const x in d.bonus) m[x] = (m[x] || 0) + d.bonus[x] * k;
    if (off) for (const x in d.antiBonus) m[x] = (m[x] || 0) + d.antiBonus[x];
    return { m, on: !!on, off: !!off };
  };
  // phase starts are stopping times: found by walking the replayed match from the last phase on
  function nextPhase(U, p, st) {
    if ((st.phases || []).length >= A.PHASE.max) return null;
    const M = U.M, ti = U.ti, me = U.sides[ti].indexOf(p.id), s = sides(p), last = st.phases[st.phases.length - 1];
    for (const I of M.inns) {
      if (last && I.k < last.inns) continue;
      const batting = I.bat === ti;
      if (batting ? !s.bat : !s.bowl) continue;
      let fromB = last && last.inns === I.k ? last.untilB : -1;
      for (let i = 0; i < I.log.length; i++) {
        const L = I.log[i], P = I.log[i - 1] || { b: 0, sc: 0, wk: 0 };
        if (P.b < fromB) continue;
        if (batting) {
          if (L.s === me || L.n === me) return { phase: true, side: 'bat', inns: I.k, at: i, startB: P.b, untilB: P.b + A.PHASE.bat };
        } else if (L.bw === me) return { phase: true, side: 'bowl', inns: I.k, at: i, startB: P.b, untilB: P.b + A.PHASE.bowl };
      }
    }
    return null;
  }
  function phaseStats(U, p, ph) {
    const I = U.M.inns[ph.inns], me = U.sides[U.ti].indexOf(p.id), o = { runs: 0, f4: 0, f6: 0, out: false, wk: 0, bowled: 0, conc: 0, balls: 0 };
    for (let i = ph.at; i < I.log.length; i++) {
      const L = I.log[i], P = I.log[i - 1] || { b: 0 };
      if (P.b >= ph.untilB) break;
      if (ph.side === 'bat') {
        if (L.s === me && (typeof L.w === 'number' || L.w === 'nb')) { o.runs += L.r; if (L.r === 4) o.f4++; if (L.r === 6) o.f6++; }
        if (L.w === 'W' && L.x && L.x.out === me) { o.out = true; break; }
      } else if (L.bw === me) {
        if (L.w !== 'wd' && L.w !== 'nb') o.balls++;
        if (typeof L.w === 'number' || L.w === 'nb' || L.w === 'wd') o.conc += L.r + (L.w === 'nb' ? 1 : 0);
        if (L.w === 'W') { const b = I.bats[L.x.out]; if (b.out && b.out.kind !== 7 && b.out.bowler === me) { o.wk++; if (b.out.kind === 1 || b.out.kind === 3) o.bowled++; } }
      }
    }
    return o;
  }
  function goalMult(ph, s) {
    // the right card for the conditions doubles its goal; the wrong one scores nothing
    const d = A.card(ph.card), g = d.g * (ph.lv || 1) * (ph.on ? 2.5 : ph.off ? 0 : 1);
    switch (d.goal) {
      case 'survive': return s.out ? 0 : g;
      case 'fours': return g * s.f4;
      case 'sixes': return g * s.f6;
      case 'runs15': return s.runs >= 15 ? g : 0;
      case 'econ': return s.balls >= 12 && s.conc / s.balls * 6 < 3 ? g : 0;
      case 'wkts': return g * s.wk;
      case 'bowled': return g * s.bowled;
      case 'wkt1': return s.wk ? g : 0;
    }
    return 0;
  }

  // ---------------------------------------------------------------- variant 3: the read (momentum)
  A.ITEMS = [
    { id: 'second', name: 'Second Opinion', icon: '🔍', cost: 3, text: 'At your next call, see which option is the right read' },
    { id: 'insure', name: 'Insurance', icon: '☂️', cost: 3, text: 'Your next poor read keeps your momentum' },
    { id: 'hot', name: 'Hot Streak', icon: '🔥', cost: 4, text: 'Your next good read adds double momentum' },
  ];
  A.item = id => A.ITEMS.find(x => x.id === id);
  A.READS = 3;  // calls per match
  function nextRead(U, p, after) {
    for (const t of CB.momentTriggers(U, p)) {
      if (t.I.k < after.inns || (t.I.k === after.inns && t.i <= after.at)) continue;
      return CB.momentFrom(U, p, t, true);
    }
    return null;
  }

  // ---------------------------------------------------------------- decisions during a match (shared by UI and bots)
  // st: per-match state { calls, phases, moments, n, r } ; a decision is a key moment or (variant 2) a phase
  A.startMatch = function (W, U) {
    const R = W.arcade, st = { calls: [], phases: [], n: 0, r: CB.rngFor(W), discards: R.v === 2 ? R.discards : 0, chain0: R.chain, reviews: 1, reseeds: [] };
    return st;
  };
  // the match again from the same seed with every call so far, and fresh luck from each reviewed ball
  A.replay = function (W, U, st) { U.M = CB.simMatch(Object.assign({}, U.cfg, { moms: st.calls, reseeds: st.reseeds })); return U.M; };
  // reviews (one a match): your own dismissal, or a chance put down off your bowling, can be sent upstairs; the
  // ball is bowled again on fresh luck. This is the run's answer to bad luck, like a discard.
  A.reviewPoint = function (U, p, after) {
    const M = U.M, ti = U.ti, me = U.sides[ti].indexOf(p.id);
    for (const I of M.inns) {
      if (after && I.k < after.k) continue;
      for (let i = after && I.k === after.k ? after.i + 1 : 0; i < I.log.length; i++) {
        const L = I.log[i];
        if (I.bat === ti && L.w === 'W' && L.x && L.x.out === me) return { k: I.k, i, kind: 'out', runs: I.bats[me].runs };
        if (I.bat !== ti && L.w === 'drop' && L.bw === me) return { k: I.k, i, kind: 'drop' };
      }
    }
    return null;
  };
  A.review = function (W, U, st, pt) {
    if (!st.reviews) return false;
    st.reviews--;
    st.reseeds.push({ k: pt.k, i: pt.i, seed: (U.cfg.seed ^ Math.imul(0x9e3779b1, st.reseeds.length + 1)) >>> 0 });
    A.replay(W, U, st);
    return true;
  };
  // after a review the future has changed: the next decision is found again from the last one taken
  A.resume = function (W, U, st, last) {
    const R = W.arcade, p = CB.user(W);
    if (R.v === 2) return dealPhase(W, U, st, nextPhase(U, p, st));
    if (!last) return CB.findMoment(U, p);
    if (R.v === 3) return st.n < A.READS ? nextRead(U, p, last) : null;
    return last.bonus ? null : CB.findBonusMoment(U, p, last);
  };
  A.firstDecision = function (W, U, st) {
    const R = W.arcade, p = CB.user(W);
    if (R.v === 2) return dealPhase(W, U, st, nextPhase(U, p, st));
    return CB.findMoment(U, p);
  };
  function dealPhase(W, U, st, ph) {
    if (!ph) return null;
    const R = W.arcade, p = CB.user(W);
    const I = U.M.inns[ph.inns], c = CB.momentCues(U.M, I, ph.at, U.ti);
    c.spin = CB.lastBowlerSpin(U.M, I, ph.at);
    ph.hand = drawHand(R, st, ph.side, st.r);
    ph.cue = c; ph.cues = c.tags.concat(ph.side === 'bat' ? [c.spin ? '🌀 Spin bowling' : '⚡ Pace bowling'] : []);
    const L = I.log[ph.at - 1] || { sc: 0, wk: 0, b: 0 }, bt = U.M.teams[I.bat];
    ph.situation = `Innings ${I.k + 1} · ${bt.short || bt.name} ${L.sc}/${L.wk} · ${CB.oversStr(L.b)} ov`;
    ph.title = ph.side === 'bat' ? (st.phases.some(x => x.inns === ph.inns && x.side === 'bat') ? 'Next phase' : 'Walking out') : (st.phases.some(x => x.inns === ph.inns && x.side === 'bowl') ? 'Next spell' : 'Ball in hand');
    ph.text = ph.side === 'bat' ? `The next ${A.PHASE.bat / 6} overs. Pick your plan.` : `The next ${A.PHASE.bowl / 6} overs of the innings. Pick your plan.`;
    ph.options = ph.hand.map(di => { const cd = R.deck[di], d = A.card(cd.id), cm = A.cardMods(cd.id, cd.lv, c); return { t: d.name, a: cd.id, di, lv: cd.lv, on: cm.on, off: cm.off }; });
    return ph;
  }
  A.redraw = function (W, U, st, ph) {
    if (!st.discards) return false;
    st.discards--;
    return !!dealPhase(W, U, st, ph);
  };
  // apply a choice; returns { plan: {fit, verdict}, next }
  A.decide = function (W, U, st, dec, i) {
    const R = W.arcade, p = CB.user(W), me = U.sides[U.ti].indexOf(p.id);
    if (R.v === 2) {
      const o = dec.options[i], cd = R.deck[o.di], cm = A.cardMods(cd.id, cd.lv, dec.cue);
      const mom = { k: dec.inns, i: dec.at, untilB: dec.untilB, ti: U.ti, idx: me };
      mom[dec.side] = cm.m;
      st.calls.push(mom);
      A.replay(W, U, st);
      st.phases.push(Object.assign({}, dec, { card: cd.id, lv: cd.lv, on: cm.on, off: cm.off }));
      const d = A.card(cd.id);
      const verdict = cm.on ? `✦ ${d.name} fits: ${d.condText}. Goal: ${d.goalText}.` : cm.off ? `⚠️ Wrong conditions for ${d.name}. Goal: ${d.goalText}.` : `${d.name}. Goal: ${d.goalText}.`;
      return { plan: { fit: cm.on ? 1 : cm.off ? -1 : 0, verdict }, next: dealPhase(W, U, st, nextPhase(U, p, st)) };
    }
    const plan = CB.momentPlan(U, dec, i, p);
    st.calls.push(plan.mom);
    A.replay(W, U, st);
    st.n++;
    if (R.v === 3) {
      const before = R.chain;
      if (plan.fit > 0) R.chain = +(R.chain + (useItem(R, 'hot') ? 1 : 0.5)).toFixed(2);
      else if (plan.fit < 0) { if (!useItem(R, 'insure')) R.chain = 1; }
      plan.verdict += R.chain > before ? `  Momentum ×${R.chain}.` : R.chain < before ? '  Momentum lost.' : `  Momentum holds at ×${R.chain}.`;
      return { plan, next: st.n < A.READS ? nextRead(U, p, dec) : null };
    }
    return { plan, next: dec.bonus ? null : CB.findBonusMoment(U, p, dec) };
  };
  function useItem(R, id) { const i = R.items.indexOf(id); if (i < 0) return false; R.items.splice(i, 1); return true; }
  A.reveal = function (W, U, dec) {  // variant 3 "second opinion": the read of each option
    const R = W.arcade; if (R.v !== 3 || !R.items.includes('second') || dec.revealed) return null;
    useItem(R, 'second'); dec.revealed = dec.options.map((o, i) => CB.momentPlan(U, dec, i, CB.user(W)).fit);
    return dec.revealed;
  };

  // ---------------------------------------------------------------- scoring the match and paying out
  A.finish = function (W, U, st) {
    const R = W.arcade, p = CB.user(W), L = A.lines(U, p), boss = U.boss;
    let use = L;
    if (boss && boss.id === 'spot') {
      // only the best single innings (bat runs, or bowling wickets x points) counts
      const cand = L.bat.map(b => ({ v: b.runs, bat: [b], bowl: [] })).concat(L.bowl.map(b => ({ v: b.wk * A.WK_PTS, bat: [], bowl: [b] })));
      const best = cand.sort((a, b) => b.v - a.v)[0] || { bat: [], bowl: [] };
      use = Object.assign({}, L, { bat: best.bat, bowl: best.bowl, ct: 0, st: 0 });
    }
    const parts = [];
    const runs = RUNS(use), wk = WKTS(use);
    let chips = runs + A.WK_PTS * wk + A.CT_PTS * (use.ct + use.st), mult = 1;
    parts.push({ t: `${runs} run${runs === 1 ? '' : 's'}${wk ? ` · ${wk} wkt${wk > 1 ? 's' : ''} ×${A.WK_PTS}` : ''}${use.ct + use.st ? ` · ${use.ct + use.st} catch${use.ct + use.st > 1 ? 'es' : ''} ×${A.CT_PTS}` : ''}`, chips });
    if (R.v === 1) {
      const x = { L: use, R, boss, ante: R.ante };
      for (const j of R.jokers) { const d = A.joker(j.id); if (d.kind === 'chips') { const v = d.f(x, j); if (v) { chips += v; parts.push({ t: d.icon + ' ' + d.name, chips: v }); } } }
      for (const j of R.jokers) { const d = A.joker(j.id); if (d.kind === 'mult') { const v = d.f(x, j); if (v) { mult += v; parts.push({ t: d.icon + ' ' + d.name, mult: v }); } } }
      for (const j of R.jokers) { const d = A.joker(j.id); if (d.kind === 'xmult') { const v = d.f(x, j); if (v !== 1) { mult *= v; parts.push({ t: d.icon + ' ' + d.name, xmult: v }); } } }
      for (const j of R.jokers) { const d = A.joker(j.id); if (d.grow) d.grow({ L }, j); }
    } else if (R.v === 2) {
      for (const ph of st.phases) {
        const s = phaseStats(U, p, ph), g = goalMult(ph, s), d = A.card(ph.card);
        if (g > 0 && !(boss && boss.id === 'spot' && !use.bat.concat(use.bowl).some(x => x.k === ph.inns))) { mult += g; parts.push({ t: `${d.icon} ${d.name}${ph.lv > 1 ? ' Lv' + ph.lv : ''}`, mult: +g.toFixed(2) }); }
      }
    } else if (R.v === 3) {
      if (R.chain !== 1) { mult *= R.chain; parts.push({ t: '🔥 Momentum', xmult: R.chain }); }
    }
    if (boss && boss.id === 'crowd') parts.push({ t: '📣 Under pressure all match', note: true });
    mult = +mult.toFixed(2);
    const score = Math.round(chips * mult), target = A.target(R, R.ante, R.blind), pass = score >= target;
    R.stats.m++; R.stats.runs += RUNS(L); R.stats.wk += WKTS(L); R.stats.best = Math.max(R.stats.best, score);
    R.hist.push({ ante: R.ante, blind: R.blind, score, target, pass, line: lineText(L) });
    const res = { chips, mult, score, target, pass, parts, line: lineText(L), money: [] };
    if (pass) {
      const b = A.BLINDS[R.blind];
      res.money.push(['Blind cleared', b.reward + (R.blind === 2 && R.bosses[R.ante - 1] === 'chair' ? 3 : 0)]);
      const over = Math.min(3, Math.floor((score / target - 1) / 0.25));
      if (over > 0) res.money.push([`Beat the target by ${Math.round((score / target - 1) * 100)}%`, over]);
      const interest = Math.min(5, Math.floor(R.money / 5));
      if (interest) res.money.push(['Interest ($1 per $5 held)', interest]);
      if (R.v === 1) { const n = R.jokers.filter(j => j.id === 'sponsor').length; if (n) res.money.push(['💰 Sponsor Deal', 2 * n]); }
      R.money += res.money.reduce((a, m) => a + m[1], 0);
      R.stage = 'cashout';
      if (R.ante === 8 && R.blind === 2) { R.won = true; R.stage = 'won'; }
    } else {
      // a missed target costs one strike of the selectors' patience; the third ends the run
      R.strikes--;
      const interest = Math.min(5, Math.floor(R.money / 5));
      if (interest && R.strikes > 0) { res.money.push(['Interest ( per  held)', interest]); R.money += interest; }
      if (R.strikes <= 0) { R.over = true; R.stage = 'over'; } else { R.stage = 'cashout'; res.strike = true; if (R.ante === 8 && R.blind === 2) { R.over = true; R.stage = 'over'; } }
    }
    R.lastRes = res;
    return res;
  };
  function lineText(L) {
    const bat = L.bat.map(b => b.runs + (b.out ? '' : '*')).join(' & '), bowl = L.bowl.filter(b => b.balls).map(b => b.wk + '/' + b.runs).join(' & ');
    return [bat && 'Bat ' + bat, bowl && 'Bowl ' + bowl].filter(Boolean).join(' · ') || 'Did not bat or bowl';
  }

  // ---------------------------------------------------------------- the shop
  A.PACK_COST = 4; A.REROLL = 2;
  A.openShop = function (W) {
    const R = W.arcade, p = CB.user(W), r = CB.rngFor(W);
    R.rerolls = 0;
    R.shop = { pack: { cost: A.PACK_COST, skills: shuffle(r, skillSet(p).slice()).slice(0, 3), bought: false } };
    stock(W, r);
    R.stage = 'shop';
  };
  function stock(W, r) {
    const R = W.arcade, p = CB.user(W);
    if (R.v === 1) {
      const owned = new Set(R.jokers.map(j => j.id)), out = [];
      for (let n = 0; n < 2; n++) {
        const roll = r(), rar = roll < 0.06 ? 2 : roll < 0.32 ? 1 : 0;
        let pool = J.filter(j => !owned.has(j.id) && !out.includes(j.id) && j.r === rar);
        if (!pool.length) pool = J.filter(j => !owned.has(j.id) && !out.includes(j.id));
        if (pool.length) out.push(pick(r, pool).id);
      }
      R.shop.jokers = out.map(id => ({ id, sold: false }));
    } else if (R.v === 2) {
      const pool = A.cardPool(p);
      R.shop.cards = [0, 1, 2].map(() => ({ id: pick(r, pool).id, cost: 3, sold: false }));
      R.shop.upgrade = 4; R.shop.remove = 2;
    } else {
      R.shop.items = shuffle(r, A.ITEMS.map(x => x.id)).slice(0, 2).map(id => ({ id, sold: false }));
    }
  }
  A.reroll = function (W) {
    const R = W.arcade, cost = A.REROLL + R.rerolls;
    if (R.money < cost) return false;
    R.money -= cost; R.rerolls++;
    stock(W, CB.rngFor(W));
    return true;
  };
  A.rerollCost = R => A.REROLL + R.rerolls;
  A.buyPack = function (W, skill) {
    const R = W.arcade, p = CB.user(W), P = R.shop.pack;
    if (P.bought || R.money < P.cost || !P.skills.includes(skill)) return false;
    R.money -= P.cost; P.bought = true;
    p.a[skill] = clamp(p.a[skill] + 5, 0, 99); R.ups[skill] = (R.ups[skill] || 0) + 5;
    CB.refresh(p);
    return true;
  };
  A.buyJoker = function (W, i) {
    const R = W.arcade, s = R.shop.jokers[i]; if (!s || s.sold) return false;
    const d = A.joker(s.id);
    if (R.money < d.cost || R.jokers.length >= A.JOKER_SLOTS) return false;
    R.money -= d.cost; s.sold = true; R.jokers.push({ id: s.id, n: 0 });
    return true;
  };
  A.sellJoker = function (W, i) { const R = W.arcade, j = R.jokers[i]; if (!j) return false; R.money += Math.floor(A.joker(j.id).cost / 2); R.jokers.splice(i, 1); return true; };
  A.moveJoker = function (W, i, d) { const R = W.arcade, j = i + d; if (j < 0 || j >= R.jokers.length) return; [R.jokers[i], R.jokers[j]] = [R.jokers[j], R.jokers[i]]; };
  A.buyCard = function (W, i) { const R = W.arcade, s = R.shop.cards[i]; if (!s || s.sold || R.money < s.cost) return false; R.money -= s.cost; s.sold = true; R.deck.push({ id: s.id, lv: 1 }); return true; };
  A.removeCard = function (W, di) { const R = W.arcade; if (R.money < R.shop.remove || R.deck.length <= 6) return false; R.money -= R.shop.remove; R.deck.splice(di, 1); R.shop.remove++; return true; };
  A.CARD_MAX = 5;
  A.upgradeCard = function (W, di) { const R = W.arcade, c = R.deck[di]; if (!c || c.lv >= A.CARD_MAX || R.money < R.shop.upgrade) return false; R.money -= R.shop.upgrade; c.lv++; R.shop.upgrade++; return true; };
  A.buyItem = function (W, i) { const R = W.arcade, s = R.shop.items[i]; if (!s || s.sold) return false; const d = A.item(s.id); if (R.money < d.cost || R.items.length >= 2) return false; R.money -= d.cost; s.sold = true; R.items.push(s.id); return true; };
  // variant 3: cash the momentum in for permanent skill (and start again from x1)
  A.bankValue = R => Math.round((R.chain - 1) * 4);
  A.bank = function (W, skill) {
    const R = W.arcade, p = CB.user(W), v = A.bankValue(R);
    if (v <= 0 || !skillSet(p).includes(skill)) return false;
    p.a[skill] = clamp(p.a[skill] + v, 0, 99); R.ups[skill] = (R.ups[skill] || 0) + v; R.chain = 1;
    CB.refresh(p);
    return true;
  };
  A.skillSet = skillSet;
  A.nextBlind = function (W) {
    const R = W.arcade;
    R.blind++;
    if (R.blind > 2) { R.blind = 0; R.ante++; }
    R.shop = null; R.stage = 'board';
  };
})(typeof window !== 'undefined' ? window : globalThis);
