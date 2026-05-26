/* Cricket Sim — simulation engine
 *
 * Generates full Test careers by simulating match-by-match with all 22 players'
 * scorecards. The hero player's d20/d10 rolls map to realistic career averages;
 * teammates and opposition are auto-generated.
 */

window.CricketEngine = (function () {

  const D = window.CricketData;

  // ===== RNG helpers =====
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function randNormal() {
    // Box-Muller
    let u1 = Math.random(); if (u1 < 1e-9) u1 = 1e-9;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function pickWeighted(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  function shortName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return parts[0][0] + ' ' + parts.slice(1).join(' ');
  }
  function lastNameOf(fullName) {
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
  }

  // ===== Single innings outcomes =====

  // Sample a batting score for a player given their batting skill (1-20 d20-equivalent).
  function batterInningsScore(skill, conditionsMod) {
    const targetAvg = D.BAT_TARGET_AVG[Math.max(1, Math.min(20, Math.round(skill)))] * (conditionsMod || 1.0);

    // Duck rate scales inverse to skill
    const duckRate = 0.05 + Math.max(0, (15 - skill) * 0.012);
    if (Math.random() < duckRate) {
      return { runs: 0, balls: randInt(1, 12), fours: 0, sixes: 0 };
    }

    // Log-normal sample
    const sigma = 0.90 + Math.min(0.35, Math.max(0, (skill - 6) / 32));
    const mu = Math.log(Math.max(2, targetAvg * 1.12)) - (sigma * sigma) / 2;
    const z = randNormal();
    let runs = Math.floor(Math.exp(mu + sigma * z));
    runs = Math.max(0, runs);
    // Soft-cap: compress the long tail so triples stay rare. Hard cap at 380.
    if (runs > 200) runs = 200 + Math.floor((runs - 200) * 0.55);
    if (runs > 380) runs = 380;

    // Strike rate ~ Test pace: better batters slightly faster
    const sr = 38 + skill * 0.55 + (Math.random() - 0.5) * 12;
    const balls = Math.max(1, Math.round(runs * 100 / Math.max(20, sr)));

    // Boundaries: roughly 35-50% of runs from boundaries for higher scores
    let fours = 0, sixes = 0;
    if (runs >= 4) {
      const boundaryShare = 0.30 + Math.random() * 0.20;
      let boundaryRuns = Math.floor(runs * boundaryShare);
      // Sixes more likely with bigger scores and higher skill
      const sixChance = runs > 50 ? 0.15 + skill / 200 : runs > 25 ? 0.05 : 0;
      while (boundaryRuns >= 6 && Math.random() < sixChance) {
        sixes++; boundaryRuns -= 6;
      }
      fours = Math.floor(boundaryRuns / 4);
    }

    return { runs, balls, fours, sixes };
  }

  // ===== Player generation =====

  // Build a roster of 10 teammates for the hero given nation rating.
  function buildTeammates(heroSetup, heroPlayer) {
    const nation = D.getNation(heroSetup.nation);
    const ratingMod = (nation.rating - 7) * 0.5; // -1 to +1.5 d20 adjustment

    // Roster archetypes — fill all batting positions 1-11 with hero already at heroPlayer.battingPosition
    const archetypes = [
      { pos: 1,  role: 'bat',  battingBase: 13, bowlingBase: 2  },
      { pos: 2,  role: 'bat',  battingBase: 13, bowlingBase: 2  },
      { pos: 3,  role: 'bat',  battingBase: 14, bowlingBase: 2  },
      { pos: 4,  role: 'bat',  battingBase: 15, bowlingBase: 3  },
      { pos: 5,  role: 'bat',  battingBase: 13, bowlingBase: 3  },
      { pos: 6,  role: 'wk',   battingBase: 11, bowlingBase: 2  },
      { pos: 7,  role: 'allr', battingBase: 11, bowlingBase: 12 },
      { pos: 8,  role: 'bowl', battingBase: 7,  bowlingBase: 14 },
      { pos: 9,  role: 'bowl', battingBase: 5,  bowlingBase: 15 },
      { pos: 10, role: 'bowl', battingBase: 4,  bowlingBase: 14 },
      { pos: 11, role: 'bowl', battingBase: 3,  bowlingBase: 13 }
    ];

    const usedNames = new Set([heroPlayer.name]);
    const teammates = [];
    const bowlingTypes = D.BOWLING_TYPES;

    for (const arch of archetypes) {
      if (arch.pos === heroPlayer.battingPosition) {
        // Hero takes this slot — but we still might need a "shadow" if hero is bat at 6 (no wk)
        // Simplify: hero takes the slot regardless of archetype.
        continue;
      }
      let name;
      let tries = 0;
      do {
        name = D.randomName(heroSetup.nation);
        tries++;
      } while (usedNames.has(name) && tries < 10);
      usedNames.add(name);

      const bSkill = Math.max(1, Math.min(20, Math.round(arch.battingBase + ratingMod + (Math.random() - 0.5) * 4)));
      const bowlSkill = arch.bowlingBase > 0
        ? Math.max(1, Math.min(20, Math.round(arch.bowlingBase + ratingMod + (Math.random() - 0.5) * 4)))
        : 0;
      const bType = arch.bowlingBase >= 9 ? bowlingTypes[Math.floor(Math.random() * bowlingTypes.length)] : null;

      teammates.push({
        name,
        shortName: shortName(name),
        lastName: lastNameOf(name),
        battingPosition: arch.pos,
        battingSkill: bSkill,
        bowlingSkill: bowlSkill,
        bowlingType: bType,
        isHero: false,
        isKeeper: arch.role === 'wk'
      });
    }

    return teammates;
  }

  // Build 11 opposition players for a given nation.
  function buildOpposition(oppCode) {
    const nation = D.getNation(oppCode);
    const ratingMod = (nation.rating - 7) * 0.5;

    const archetypes = [
      { pos: 1,  battingBase: 13, bowlingBase: 1  },
      { pos: 2,  battingBase: 13, bowlingBase: 2  },
      { pos: 3,  battingBase: 15, bowlingBase: 2  },
      { pos: 4,  battingBase: 15, bowlingBase: 2  },
      { pos: 5,  battingBase: 13, bowlingBase: 3  },
      { pos: 6,  battingBase: 11, bowlingBase: 2  },  // keeper
      { pos: 7,  battingBase: 11, bowlingBase: 11 }, // all-rounder
      { pos: 8,  battingBase: 7,  bowlingBase: 15 },
      { pos: 9,  battingBase: 5,  bowlingBase: 14 },
      { pos: 10, battingBase: 4,  bowlingBase: 14 },
      { pos: 11, battingBase: 3,  bowlingBase: 12 }
    ];

    const usedNames = new Set();
    const players = [];
    const types = D.BOWLING_TYPES;

    for (const arch of archetypes) {
      let name;
      let tries = 0;
      do {
        name = D.randomName(oppCode);
        tries++;
      } while (usedNames.has(name) && tries < 10);
      usedNames.add(name);

      const bSkill = Math.max(1, Math.min(20, Math.round(arch.battingBase + ratingMod + (Math.random() - 0.5) * 4)));
      const bowlSkill = arch.bowlingBase > 0
        ? Math.max(1, Math.min(20, Math.round(arch.bowlingBase + ratingMod + (Math.random() - 0.5) * 4)))
        : 0;
      const bType = arch.bowlingBase >= 9 ? types[Math.floor(Math.random() * types.length)] : null;

      players.push({
        name,
        shortName: shortName(name),
        lastName: lastNameOf(name),
        battingPosition: arch.pos,
        battingSkill: bSkill,
        bowlingSkill: bowlSkill,
        bowlingType: bType,
        isHero: false,
        isKeeper: arch.pos === 6
      });
    }

    return players;
  }

  // Build the hero player object from setup.
  function buildHero(setup) {
    // Determine batting/bowling skills based on role
    let battingSkill, bowlingSkill, bowlingType = null;
    let battingPosition;

    if (setup.role === 'batter') {
      battingSkill = setup.primaryRoll;
      bowlingSkill = setup.secondaryRoll;  // d10 mapped 1:1 to d20-low
      battingPosition = pickPositionInGroup(setup.styleId);
      // Batters bowl only if secondary >= 6 (true part-time / all-round capacity)
      if (bowlingSkill >= 6) {
        bowlingType = D.BOWLING_TYPES[Math.floor(Math.random() * D.BOWLING_TYPES.length)];
      } else {
        bowlingSkill = 0;
      }
    } else {
      // bowler
      bowlingSkill = setup.primaryRoll;
      battingSkill = setup.secondaryRoll;
      bowlingType = D.getBowlingType(setup.styleId);
      // Bowler batting position depends on secondary
      if (battingSkill >= 9) battingPosition = randInt(6, 7);
      else if (battingSkill >= 6) battingPosition = randInt(7, 8);
      else if (battingSkill >= 3) battingPosition = randInt(8, 10);
      else battingPosition = randInt(9, 11);
    }

    const name = setup.name && setup.name.trim() ? setup.name.trim() : D.randomName(setup.nation);

    return {
      name,
      shortName: shortName(name),
      lastName: lastNameOf(name),
      battingPosition,
      battingSkill,
      bowlingSkill,
      bowlingType,
      isHero: true,
      isKeeper: false,
      role: setup.role,
      nation: setup.nation
    };
  }

  function pickPositionInGroup(groupId) {
    const group = D.getBattingPosition(groupId);
    if (!group) return 5;
    return randInt(group.range[0], group.range[1]);
  }

  // ===== Match simulation =====

  function pickOpposition(heroNation, recentOpps) {
    // Pick a different nation, avoiding the same opponent too consecutively.
    const others = D.NATIONS.filter(n => n.code !== heroNation).map(n => n.code);
    const recentSet = new Set(recentOpps.slice(-2));
    const candidates = others.filter(c => !recentSet.has(c));
    const pool = candidates.length > 0 ? candidates : others;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function decideVenue(heroNation, oppNation, isHome) {
    if (isHome) return D.randomGround(heroNation);
    return D.randomGround(oppNation);
  }

  // Distribute bowling load and runs across opposition bowlers for one innings.
  function distributeBowling(bowlingTeam, innings) {
    // Threshold at >=6 — below that bowlers are very rarely thrown the ball.
    let bowlers = bowlingTeam.players.filter(p => p.bowlingSkill >= 6 && p.bowlingType);
    // Always need at least 4-5 bowlers to bowl the innings out
    if (bowlers.length < 4) {
      const fillers = bowlingTeam.players
        .filter(p => !bowlers.includes(p) && p.bowlingType)
        .sort((a, b) => b.bowlingSkill - a.bowlingSkill);
      while (bowlers.length < 4 && fillers.length > 0) bowlers.push(fillers.shift());
    }
    if (bowlers.length === 0) bowlers = bowlingTeam.players.slice(7, 11);

    // Compute total overs to bowl
    const totalBalls = innings._estimatedBalls || 480;
    const totalOvers = totalBalls / 6;

    // Weight each bowler by overload (capacity) × skill^2 — steep falloff for part-timers.
    const weights = bowlers.map(b => {
      const cap = b.bowlingType ? b.bowlingType.overload : 12;
      const skillW = Math.pow(b.bowlingSkill / 14, 2.2);  // skill 14 = 1.0, skill 7 = 0.21
      return cap * skillW;
    });
    const wSum = weights.reduce((s, w) => s + w, 0);

    let overShares = weights.map(w => Math.floor((w / wSum) * totalOvers));
    let remainder = totalOvers - overShares.reduce((s, o) => s + o, 0);
    // Give remainder to the highest-weighted bowlers first
    const sortedIdx = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
    let ri = 0;
    while (remainder > 0 && ri < 100) {
      overShares[sortedIdx[ri % bowlers.length]]++;
      remainder--;
      ri++;
    }

    // Wickets per bowler: weight by EXPECTED wickets (balls bowled / strike rate)
    // so part-time bowlers get a fair share of their overs' production. Per-innings
    // form multiplier creates natural concentration (5-fers, 6-fers).
    const dismissalsToAssign = innings._dismissedToBowler || 0;
    const wktWeights = bowlers.map((b, i) => {
      const balls = overShares[i] * 6;
      const sr = D.BOWL_TARGET_SR[Math.max(1, Math.min(20, b.bowlingSkill))] || 100;
      const expectedWkts = balls / sr;
      const form = 0.45 + Math.random() * 1.25;  // 0.45-1.70
      return expectedWkts * form * (b.bowlingType ? b.bowlingType.wicketMod : 1);
    });
    const bowlerWickets = bowlers.map(() => 0);
    for (let i = 0; i < dismissalsToAssign; i++) {
      const idx = pickWeightedIndex(wktWeights);
      bowlerWickets[idx]++;
    }

    // Runs conceded: economy varies more with skill
    const runsToDistribute = innings.total - innings.extras;
    const ecoWeights = bowlers.map((b, i) => {
      const skillEco = 1.25 - b.bowlingSkill / 32;  // skill 20 → 0.625, skill 7 → 1.03
      return overShares[i] * (b.bowlingType ? b.bowlingType.economyMod : 1.0) * skillEco;
    });
    const ecoSum = ecoWeights.reduce((s, w) => s + w, 0) || 1;
    let bowlerRuns = ecoWeights.map(w => Math.round((w / ecoSum) * runsToDistribute));
    let runDiff = runsToDistribute - bowlerRuns.reduce((s, r) => s + r, 0);
    if (bowlerRuns.length > 0) bowlerRuns[0] += runDiff;

    const bowlerMaidens = bowlers.map((b, i) => {
      const rate = 0.04 + Math.min(0.20, b.bowlingSkill / 90);
      return Math.floor(overShares[i] * rate * (Math.random() * 0.6 + 0.7));
    });

    return bowlers.map((b, i) => ({
      player: b,
      overs: overShares[i],
      maidens: bowlerMaidens[i],
      runs: Math.max(0, bowlerRuns[i]),
      wickets: bowlerWickets[i]
    })).filter(r => r.overs > 0);
  }

  function pickWeightedIndex(weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  // Generate dismissal description.
  function chooseDismissalType(bowlerType) {
    const isPace = bowlerType && bowlerType.pace;
    const isSpin = bowlerType && bowlerType.spin;
    const r = Math.random();
    if (isPace) {
      if (r < 0.42) return 'c';
      if (r < 0.62) return 'b';
      if (r < 0.82) return 'lbw';
      if (r < 0.95) return 'c &';  // caught and bowled
      return 'c';
    } else if (isSpin) {
      if (r < 0.40) return 'c';
      if (r < 0.58) return 'b';
      if (r < 0.76) return 'lbw';
      if (r < 0.86) return 'st';
      if (r < 0.95) return 'c &';
      return 'c';
    } else {
      if (r < 0.45) return 'c';
      if (r < 0.70) return 'b';
      return 'lbw';
    }
  }

  function pickFielder(team, excludeBowler) {
    const candidates = team.players.filter(p => p !== excludeBowler);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Simulate one innings.
  function simulateInnings(battingTeam, bowlingTeam, options) {
    options = options || {};
    const innings = {
      battingTeam: battingTeam.code,
      battingTeamName: battingTeam.name,
      bowlingTeam: bowlingTeam.code,
      declared: false,
      followedOn: !!options.followedOn,
      total: 0,
      wickets: 0,
      overs: 0,
      extras: 0,
      batting: [],
      bowling: [],
      fallOfWickets: [],
      _estimatedBalls: 0,
      _dismissedToBowler: 0
    };

    const sortedBatters = battingTeam.players.slice().sort((a, b) => a.battingPosition - b.battingPosition);

    let runningTotal = 0;
    let wickets = 0;
    let totalBalls = 0;
    let dismissalsToBowlers = 0;

    // Per-match conditions modifier (affects scoring)
    const conditionsMod = options.conditionsMod || 1.0;
    // Innings position mod (4th innings is harder)
    const inningsPosMod = options.inningsPosMod || 1.0;

    for (let pi = 0; pi < sortedBatters.length; pi++) {
      if (wickets >= 10) break;
      const batter = sortedBatters[pi];

      // If chasing & target reached, stop
      if (options.target && runningTotal > options.target) break;

      const outcome = batterInningsScore(batter.battingSkill, conditionsMod * inningsPosMod);

      // Decide if out
      let isOut;
      if (pi === sortedBatters.length - 1) {
        // last batter must end the innings unless declaration / chase complete
        isOut = true;
      } else {
        // Not-out rate ~9% normally, higher for tail batsmen
        const notOutChance = 0.08 + (batter.battingPosition >= 9 ? 0.06 : 0);
        isOut = Math.random() > notOutChance;
      }

      // Build the row
      let howOut = 'not out';
      if (isOut) {
        wickets++;
        runningTotal += outcome.runs;
        totalBalls += outcome.balls;

        // 6% chance run out, rest attributed to a bowler
        if (Math.random() < 0.06) {
          // Pick a fielder credited
          const fielder = pickFielder(bowlingTeam, null);
          howOut = 'run out (' + fielder.lastName + ')';
        } else {
          const bowler = pickWeightedBowler(bowlingTeam.players);
          const dismissalType = chooseDismissalType(bowler.bowlingType);
          dismissalsToBowlers++;
          if (dismissalType === 'c') {
            const fielder = pickFielder(bowlingTeam, bowler);
            howOut = 'c ' + fielder.lastName + ' b ' + bowler.lastName;
          } else if (dismissalType === 'c &') {
            howOut = 'c & b ' + bowler.lastName;
          } else if (dismissalType === 'st') {
            const keeper = bowlingTeam.players.find(p => p.isKeeper);
            howOut = 'st ' + (keeper ? keeper.lastName : bowlingTeam.players[5].lastName) + ' b ' + bowler.lastName;
          } else if (dismissalType === 'b') {
            howOut = 'b ' + bowler.lastName;
          } else {
            // lbw or other
            howOut = dismissalType + ' b ' + bowler.lastName;
          }
        }

        innings.fallOfWickets.push({
          wkt: wickets,
          score: runningTotal,
          batter: batter.lastName,
          overs: estimateOversAt(totalBalls)
        });
      } else {
        runningTotal += outcome.runs;
        totalBalls += outcome.balls;
      }

      innings.batting.push({
        name: batter.shortName,
        fullName: batter.name,
        pos: batter.battingPosition,
        runs: outcome.runs,
        balls: outcome.balls,
        fours: outcome.fours,
        sixes: outcome.sixes,
        out: isOut,
        howOut,
        isHero: batter.isHero,
        isKeeper: batter.isKeeper
      });
    }

    // Extras: 5-12% of runs total
    innings.extras = Math.floor(runningTotal * (0.04 + Math.random() * 0.07));
    innings.total = runningTotal + innings.extras;
    innings.wickets = wickets;

    // Estimate balls + extras balls
    totalBalls += Math.round(innings.extras * 0.6);
    const overs = Math.floor(totalBalls / 6);
    const balls = totalBalls % 6;
    innings.overs = overs + balls / 10;
    innings._estimatedBalls = totalBalls;
    innings._dismissedToBowler = dismissalsToBowlers;

    // Possibly declare if huge lead / batting third with strong lead
    if (options.declarationLikely && wickets < 10 && runningTotal > 350) {
      innings.declared = true;
    }

    // Distribute bowling
    const bowlingStats = distributeBowling(bowlingTeam, innings);
    innings.bowling = bowlingStats.map(s => ({
      name: s.player.shortName,
      fullName: s.player.name,
      type: s.player.bowlingType ? s.player.bowlingType.id : null,
      overs: s.overs,
      maidens: s.maidens,
      runs: s.runs,
      wickets: s.wickets,
      isHero: s.player.isHero
    }));

    return innings;
  }

  function pickWeightedBowler(players) {
    const bowlers = players.filter(p => p.bowlingSkill >= 5 && p.bowlingType);
    if (bowlers.length === 0) return players[5] || players[0];
    const weights = bowlers.map(b => Math.pow(b.bowlingSkill, 1.5) * b.bowlingType.wicketMod);
    return pickWeighted(bowlers, weights);
  }

  function estimateOversAt(balls) {
    const o = Math.floor(balls / 6);
    const b = balls % 6;
    return o + '.' + b;
  }

  // ===== Match-level simulation =====

  function simulateMatch(heroTeam, oppTeam, ctx) {
    // ctx: { matchNum, year, venue, isHome, oppCode, conditionsMod }
    const homeTeam  = ctx.isHome ? heroTeam : oppTeam;
    const awayTeam  = ctx.isHome ? oppTeam : heroTeam;

    // Toss: random, winner usually bats
    const tossWinner = Math.random() < 0.5 ? heroTeam : oppTeam;
    const decisionBat = Math.random() < 0.72;
    const firstBat = decisionBat ? tossWinner : (tossWinner === heroTeam ? oppTeam : heroTeam);
    const secondBat = firstBat === heroTeam ? oppTeam : heroTeam;

    const conditionsMod = ctx.conditionsMod || (0.92 + Math.random() * 0.16);

    // Innings 1
    const inn1 = simulateInnings(firstBat, secondBat, { conditionsMod, inningsPosMod: 1.0 });
    // Innings 2
    const inn2 = simulateInnings(secondBat, firstBat, { conditionsMod, inningsPosMod: 0.98 });

    const innings = [inn1, inn2];

    // Follow-on?
    const lead = inn1.total - inn2.total;
    const followOn = lead >= 200 && Math.random() < 0.35;

    let inn3, inn4;
    if (followOn) {
      // Team B bats again
      inn3 = simulateInnings(secondBat, firstBat, { conditionsMod, inningsPosMod: 0.90, followedOn: true });
      innings.push(inn3);
      // If still trailing & all out, A wins by innings
      if (inn3.total < lead) {
        // Match ends
      } else {
        // A bats again
        const target = inn3.total - lead;  // not really used, A just bats to chase
        inn4 = simulateInnings(firstBat, secondBat, { conditionsMod, inningsPosMod: 0.85, target: Math.max(40, target + 30) });
        innings.push(inn4);
      }
    } else {
      // Normal flow: A bats again
      inn3 = simulateInnings(firstBat, secondBat, { conditionsMod, inningsPosMod: 0.94, declarationLikely: lead > 0 });
      innings.push(inn3);
      // Target for B
      const target = inn1.total + inn3.total - inn2.total + 1;
      // B chases
      inn4 = simulateInnings(secondBat, firstBat, { conditionsMod, inningsPosMod: 0.86, target: target });
      innings.push(inn4);
    }

    // Determine result
    const result = determineResult(innings, firstBat, secondBat, followOn);

    // Aggregate hero's per-innings figures
    const heroBatting = [];
    const heroBowling = [];
    innings.forEach((inn, idx) => {
      const b = inn.batting.find(r => r.isHero);
      if (b) heroBatting.push({ ...b, inningsIdx: idx });
      const w = inn.bowling.find(r => r.isHero);
      if (w) heroBowling.push({ ...w, inningsIdx: idx });
    });

    return {
      matchNum: ctx.matchNum,
      year: ctx.year,
      seriesIdx: ctx.seriesIdx,
      venue: ctx.venue,
      isHome: ctx.isHome,
      heroNation: heroTeam.code,
      oppNation: oppTeam.code,
      oppName: oppTeam.name,
      firstBat: firstBat.code,
      tossWinner: tossWinner.code,
      tossDecision: decisionBat ? 'bat' : 'bowl',
      followOn,
      result: result.text,
      resultCode: result.code,           // 'win' | 'loss' | 'draw' | 'tie' from hero perspective
      margin: result.margin,
      innings,
      heroBatting,
      heroBowling
    };
  }

  function determineResult(innings, firstBat, secondBat, followOn) {
    // Determine winner from team totals
    let firstBatTotal = 0;
    let secondBatTotal = 0;
    for (const inn of innings) {
      if (inn.battingTeam === firstBat.code) firstBatTotal += inn.total;
      else secondBatTotal += inn.total;
    }

    // If 4-innings match with chase: was target reached?
    const lastInn = innings[innings.length - 1];
    const allOut = lastInn.wickets === 10;
    const reachedTarget = (() => {
      if (followOn) return innings.length === 4 ? firstBatTotal > secondBatTotal : false;
      if (innings.length < 4) return false;
      return secondBatTotal > firstBatTotal;
    })();

    // Compute basic margins
    let resultText = '';
    let resultCode = 'draw';
    let margin = 0;

    if (followOn && innings.length === 3) {
      const innMargin = firstBatTotal - secondBatTotal;
      if (innMargin > 0) {
        // Innings + runs
        resultText = firstBat.name + ' won by an innings and ' + innMargin + ' runs';
        resultCode = firstBat.isHeroTeam ? 'win' : 'loss';
        margin = innMargin;
      } else {
        resultText = 'Match drawn';
        resultCode = 'draw';
      }
    } else if (innings.length === 4) {
      if (reachedTarget) {
        const winningSide = followOn ? firstBat : secondBat;
        const wickets = 10 - lastInn.wickets;
        resultText = winningSide.name + ' won by ' + wickets + ' wickets';
        resultCode = winningSide.isHeroTeam ? 'win' : 'loss';
        margin = wickets;
      } else if (allOut) {
        const winningSide = followOn ? secondBat : firstBat;
        const runMargin = Math.abs(firstBatTotal - secondBatTotal);
        if (runMargin === 0) {
          resultText = 'Match tied';
          resultCode = 'tie';
        } else if (runMargin > 220) {
          // Huge margins → in real Tests the chase rarely all-outs by hundreds,
          // usually drawn by batting out the day. Convert to a draw.
          resultText = 'Match drawn';
          resultCode = 'draw';
        } else {
          resultText = winningSide.name + ' won by ' + runMargin + ' runs';
          resultCode = winningSide.isHeroTeam ? 'win' : 'loss';
          margin = runMargin;
        }
      } else {
        // 4th innings team neither all out nor reached target → draw (5 days up)
        resultText = 'Match drawn';
        resultCode = 'draw';
      }
    } else {
      resultText = 'Match drawn';
      resultCode = 'draw';
    }

    return { text: resultText, code: resultCode, margin };
  }

  // ===== Career generation =====

  function generateCareer(setup, onProgress) {
    const hero = buildHero(setup);
    const teammates = buildTeammates(setup, hero);

    // Pack into team object
    const heroNation = D.getNation(setup.nation);
    const heroTeam = {
      code: setup.nation,
      name: heroNation.name,
      short: heroNation.short,
      players: [hero, ...teammates],
      isHeroTeam: true
    };

    // Career length target
    const baseLen = 50 + setup.primaryRoll * 6 + setup.secondaryRoll * 3;
    const lengthVariance = randInt(-12, 25);
    let targetMatches = Math.max(50, Math.min(200, baseLen + lengthVariance));

    // Start year — random year between 1990 and current era
    const startYear = randInt(1990, 2020);
    const debutAge = randInt(20, 25);

    const career = {
      id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
      generatedAt: Date.now(),
      setup,
      hero,
      teammates,
      startYear,
      debutAge,
      targetMatches,
      matches: [],
      retired: false,
      retiredReason: '',
      retiredYear: 0
    };

    // Simulation loop
    let badStreak = 0;
    let formInnings = [];      // recent batting innings { runs, outs } for batters
    let formBowling = [];      // recent matches { wickets, runs } for bowlers
    let matchesPerYear = randInt(8, 12);
    let matchNum = 0;
    let yearOffset = 0;
    let seriesIdx = 0;
    let recentOpps = [];

    const oppCycle = [];  // pool of upcoming opponents

    while (matchNum < targetMatches) {
      // Pick opposition; series of 3 matches typically
      let oppCode;
      if (oppCycle.length === 0) {
        oppCode = pickOpposition(setup.nation, recentOpps);
        const seriesLen = randInt(2, 5);
        for (let i = 0; i < seriesLen; i++) oppCycle.push(oppCode);
        seriesIdx++;
      }
      oppCode = oppCycle.shift();
      recentOpps.push(oppCode);
      if (recentOpps.length > 6) recentOpps.shift();

      const oppNation = D.getNation(oppCode);
      const oppPlayers = buildOpposition(oppCode);
      const oppTeam = {
        code: oppCode,
        name: oppNation.name,
        short: oppNation.short,
        players: oppPlayers,
        isHeroTeam: false
      };

      // Alternate home/away per series
      const isHome = (seriesIdx % 2 === 1);
      const venue = decideVenue(setup.nation, oppCode, isHome);
      const year = startYear + yearOffset;

      const match = simulateMatch(heroTeam, oppTeam, {
        matchNum: matchNum + 1,
        year,
        seriesIdx,
        venue,
        isHome,
        oppCode
      });
      career.matches.push(match);
      matchNum++;

      // Update form — role-appropriate metric
      const heroRuns = match.heroBatting.reduce((s, b) => s + b.runs, 0);
      const heroOuts = match.heroBatting.filter(b => b.out).length;
      formInnings.push({ runs: heroRuns, outs: heroOuts });
      if (formInnings.length > 10) formInnings.shift();

      const heroWkts = match.heroBowling.reduce((s, b) => s + b.wickets, 0);
      const heroRunsConc = match.heroBowling.reduce((s, b) => s + b.runs, 0);
      formBowling.push({ wkts: heroWkts, runs: heroRunsConc });
      if (formBowling.length > 10) formBowling.shift();

      let inForm = true;
      if (setup.role === 'batter' && formInnings.length >= 6) {
        const recentRuns = formInnings.reduce((s, f) => s + f.runs, 0);
        const recentOuts = Math.max(1, formInnings.reduce((s, f) => s + f.outs, 0));
        const formAvg = recentRuns / recentOuts;
        const expectedAvg = D.BAT_TARGET_AVG[setup.primaryRoll] || 25;
        inForm = formAvg >= expectedAvg * 0.45;
      } else if (setup.role === 'bowler' && formBowling.length >= 6) {
        const recentWkts = formBowling.reduce((s, f) => s + f.wkts, 0);
        // Expected wickets per match scales with skill — elite bowler ~4/match
        const expectedPerMatch = 1.5 + setup.primaryRoll * 0.16;
        const formWPM = recentWkts / formBowling.length;
        inForm = formWPM >= expectedPerMatch * 0.50;
      }

      if (matchNum > 18) {
        if (!inForm) badStreak++;
        else badStreak = Math.max(0, badStreak - 1);
      }

      // Early retirement triggers
      if (matchNum > 30) {
        if (badStreak >= 7) {
          career.retired = true;
          career.retiredReason = 'Dropped from the side after a prolonged loss of form';
          break;
        }
      }
      // Career-ending injury — rare, more likely later in career
      if (matchNum > 60) {
        const injuryChance = 0.0008 + Math.max(0, (matchNum - 100) / 100) * 0.0010;
        if (Math.random() < injuryChance) {
          career.retired = true;
          career.retiredReason = 'Career-ending injury';
          break;
        }
      }

      // Late-career decline
      if (matchNum > 110) {
        const declineP = (matchNum - 110) / 180;
        if (Math.random() < declineP * 0.03) {
          career.retired = true;
          career.retiredReason = 'Retired from international cricket';
          break;
        }
      }

      // Year rollover
      if (matchNum % matchesPerYear === 0) {
        yearOffset++;
      }

      if (onProgress && matchNum % 5 === 0) {
        onProgress(matchNum, targetMatches);
      }
    }

    if (!career.retired) {
      career.retired = true;
      career.retiredReason = matchNum >= 180 ? 'Retired at the top after a stellar career' : 'Retired from international cricket';
    }
    career.retiredYear = startYear + yearOffset;
    career.endYear = career.retiredYear;
    career.totalMatches = career.matches.length;

    // Compute summary stats
    career.summary = computeCareerSummary(career);
    return career;
  }

  // ===== Career aggregate stats =====

  function computeCareerSummary(career) {
    const matches = career.matches;

    // Batting career
    let battingInnings = 0;
    let runs = 0;
    let notOuts = 0;
    let fours = 0;
    let sixes = 0;
    let balls = 0;
    let high = 0;
    let highNotOut = false;
    let fifties = 0;
    let hundreds = 0;
    let doubles = 0;
    let triples = 0;
    let ducks = 0;

    let bowlingInnings = 0;
    let oversBowled = 0;
    let maidens = 0;
    let runsConceded = 0;
    let wickets = 0;
    let bestBowlingInnW = 0;
    let bestBowlingInnR = Infinity;
    let bestBowlingInnDesc = '';
    let bestBowlingMatchW = 0;
    let bestBowlingMatchR = Infinity;
    let bestBowlingMatchDesc = '';
    let fiveWInn = 0;
    let tenWMatch = 0;

    let wins = 0, losses = 0, draws = 0, ties = 0;

    for (const m of matches) {
      if (m.resultCode === 'win') wins++;
      else if (m.resultCode === 'loss') losses++;
      else if (m.resultCode === 'draw') draws++;
      else if (m.resultCode === 'tie') ties++;

      // Batting innings
      for (const b of m.heroBatting) {
        battingInnings++;
        runs += b.runs;
        balls += b.balls;
        fours += b.fours;
        sixes += b.sixes;
        if (!b.out) notOuts++;
        if (b.runs > high || (b.runs === high && !b.out && !highNotOut)) {
          high = b.runs;
          highNotOut = !b.out;
        }
        if (b.runs === 0 && b.out) ducks++;
        if (b.runs >= 300) triples++;
        else if (b.runs >= 200) doubles++;
        else if (b.runs >= 100) hundreds++;
        else if (b.runs >= 50) fifties++;
      }

      // Bowling innings
      let matchBowlW = 0;
      let matchBowlR = 0;
      for (const w of m.heroBowling) {
        bowlingInnings++;
        oversBowled += w.overs;
        maidens += w.maidens;
        runsConceded += w.runs;
        wickets += w.wickets;
        matchBowlW += w.wickets;
        matchBowlR += w.runs;
        if (w.wickets >= 5) fiveWInn++;
        // Best innings — most wickets, then fewest runs
        if (w.wickets > bestBowlingInnW || (w.wickets === bestBowlingInnW && w.runs < bestBowlingInnR)) {
          bestBowlingInnW = w.wickets;
          bestBowlingInnR = w.runs;
          bestBowlingInnDesc = w.wickets + '/' + w.runs;
        }
      }
      if (matchBowlW >= 10) tenWMatch++;
      if (matchBowlW > bestBowlingMatchW || (matchBowlW === bestBowlingMatchW && matchBowlR < bestBowlingMatchR)) {
        bestBowlingMatchW = matchBowlW;
        bestBowlingMatchR = matchBowlR;
        bestBowlingMatchDesc = matchBowlW + '/' + matchBowlR;
      }
    }

    const battingAvg = battingInnings - notOuts > 0 ? runs / (battingInnings - notOuts) : runs;
    const sr = balls > 0 ? (runs * 100) / balls : 0;
    const bowlingAvg = wickets > 0 ? runsConceded / wickets : null;
    const economy = oversBowled > 0 ? runsConceded / oversBowled : 0;
    const strikeRateBowl = wickets > 0 ? (oversBowled * 6) / wickets : null;

    return {
      matches: matches.length,
      battingInnings, runs, notOuts, balls, fours, sixes,
      high, highNotOut,
      fifties, hundreds, doubles, triples, ducks,
      battingAvg, strikeRate: sr,
      bowlingInnings, oversBowled, maidens, runsConceded, wickets,
      bestBowlingInn: bestBowlingInnDesc || '-',
      bestBowlingMatch: bestBowlingMatchDesc || '-',
      fiveWInn, tenWMatch,
      bowlingAvg, economy, bowlStrikeRate: strikeRateBowl,
      wins, losses, draws, ties
    };
  }

  // ===== Expose =====

  return {
    generateCareer,
    buildHero,
    buildTeammates,
    buildOpposition,
    simulateMatch,
    randInt,
    shortName,
    lastNameOf
  };
})();
