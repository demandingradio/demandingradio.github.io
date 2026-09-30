// AFL Trade Machine — valuation model. Shared by the browser app and the Deno calibration scripts.
// Everything is expressed in "draft points" on the AFL Draft Value Index scale (pick 1 = 3000).
(function (root) {
  const M = {};

  M.params = {
    S: 400,            // points per unit of discounted surplus season (calibrated on real trades)
    gamma: 1.6,        // convexity: stars are worth disproportionately more than role players
    zRep: -1.0,        // replacement level (fringe best-22) in z units
    wGroup: 0.6,       // season rating = wGroup * (vs same position) + (1-wGroup) * (vs whole league)
    // key positions are scarce: judge them more against their own position than on raw stats
    // (small forwards and mid-forwards are judged more on raw output; rucks mostly against rucks)
    wGroupAdj: { KD: 0.2, KF: 0.3, GD: 0, GF: -0.4, MF: -0.4, MID: 0, RUC: 0.5 },
    seasonW: [1.0, 0.6, 0.35, 0.2], // weight of the latest season, the one before, ...
    youngSeasonW: [1.0, 0.4, 0.15, 0.05], // under-23s are still improving, so older seasons understate them
    priorGames: 4,     // shrinkage toward the prior, in weighted games
    // market premium/discount by role (fitted): e.g. inside mids fetch more than wingers of equal output
    posMult: { MID: 1, MF: 1, GF: 1, KF: 1, GD: 1, KD: 1, RUC: 1 },
    youngPrior: 14,    // extra prior weight for players with few games (fades out by 80 games)
    priorVet: -0.35,   // prior for established players (blends in as games pile up)
    // the market pays less for veterans (salary, short windows): -vetSlope per year past vetStart
    vetStart: 30, vetSlope: 0.15,
    // first- and second-year players are still mostly their draft slot
    drafteeBlend: { 1: 0.6, 2: 0.35 },
    horizon: 12,
    availFloor: 0.55,  // value multiplier for a player who never gets on the park
    pedGrowth: 0.4,    // high draft picks develop a little faster
    declineMult: 1.0,  // scales the negative (ageing) part of the curve
    growthMult: 1.0,   // scales the positive (development) part of the curve
    // yearly change in ability by age (empirical 2019-26 from the data)
    growth: { 17: 0.38, 18: 0.38, 19: 0.36, 20: 0.28, 21: 0.24, 22: 0.2, 23: 0.12, 24: 0.08, 25: 0.02, 26: -0.01, 27: -0.04, 28: -0.07, 29: -0.12, 30: -0.17, 31: -0.23, 32: -0.3, 33: -0.38, 34: -0.45 },
    // probability of still being on an AFL list at a given age
    survive: { 30: 0.97, 31: 0.92, 32: 0.84, 33: 0.73, 34: 0.6, 35: 0.45, 36: 0.3, 37: 0.18, 38: 0.1 },
    delta: 0.86,       // neutral yearly discount (the "market")
    modes: {
      contender: { label: 'Win now', delta: 0.62, picks: 0.85 },
      balanced: { label: 'Balanced', delta: null, picks: 1.0 },
      rebuild: { label: 'Rebuild', delta: 0.88, picks: 1.15 },
    },
    // market leverage from contract status (what a club can actually extract in a trade)
    leverage: { long: 1.0, oneYear: 0.96, oocNonFA: 0.92, oocRFA: 0.88, oocUFA: 0.72 },
    futureDiscount: { 1: 0.93, 2: 0.86 },
    futureRegress: { 1: 0.5, 2: 0.8 },
    futureSpread: 4.5,
  };

  // AFL Draft Value Index in force for the 2025 and 2026 drafts (afl.com.au): points to pick 54 only
  M.DVI = [3000, 2481, 2178, 1962, 1795, 1659, 1543, 1443, 1355, 1276, 1205, 1140, 1080, 1024, 973, 924, 879, 836, 796, 757, 721, 686, 653, 621, 590, 561, 533, 505, 479, 454, 429, 405, 382, 360, 338, 317, 297, 277, 257, 238, 220, 202, 184, 167, 150, 134, 118, 102, 86, 71, 57, 42, 28, 14];
  M.dvi = (pick) => (pick >= 1 && pick <= M.DVI.length ? M.DVI[pick - 1] : 0);

  const P = () => M.params;
  // tables are by whole age; interpolate so a player's value doesn't jump on his birthday
  const lerpTable = (t, age, lo, hi, below, above) => {
    if (age <= lo) return below ?? t[lo]; if (age >= hi) return above ?? t[hi];
    const a = Math.floor(age), f = age - a; return t[a] + ((t[a + 1] ?? t[a]) - t[a]) * f;
  };
  const growthAt = (age) => { const v = lerpTable(P().growth, age, 17, 34); return v < 0 ? v * P().declineMult : v * P().growthMult; };
  const surviveAt = (age) => (age < 29 ? 1 : age < 30 ? 1 - (age - 29) * (1 - P().survive[30]) : lerpTable(P().survive, age, 30, 38));
  M.vetFactor = (age) => Math.max(0.2, 1 - P().vetSlope * Math.max(0, age - P().vetStart));
  const seasonValue = (z) => { const x = z - P().zRep; return x > 0 ? Math.pow(x, P().gamma) : 0; };

  // Ability (z units) from season ratings. f.zs = [[zGroup, zAll, games, yearsAgo, group], ...]
  M.ability = (f) => {
    const p = P();
    let w = 0, s = 0;
    const sw = f.age < 23 ? p.youngSeasonW : p.seasonW;
    for (const [zg, za, gm, ago, g] of f.zs || []) {
      const k = (sw[ago] || 0) * gm; if (!k) continue;
      const wg = Math.max(0, Math.min(0.95, p.wGroup + (p.wGroupAdj[g ?? f.group] || 0)));
      w += k; s += k * (wg * zg + (1 - wg) * za);
    }
    const games = f.games || 0, young = Math.max(0, 1 - games / 80);
    const prior = young * f.zPrior + (1 - young) * p.priorVet;
    const pw = p.priorGames + p.youngPrior * young;
    return (s + pw * prior) / (w + pw);
  };

  M.leverageOf = (f, season) => {
    const L = P().leverage;
    // why = phrase that completes "He is …"
    if (!f.contractEnd) return { k: L.oneYear, code: 'unknown', why: null };
    const left = f.contractEnd - season;
    if (left >= 2) return { k: L.long, code: 'long', why: null };
    if (left === 1) return { k: L.oneYear, code: 'oneYear', why: 'into the last year of his contract' };
    if (/Unrestricted/.test(f.fa || '')) return { k: L.oocUFA, code: 'oocUFA', why: 'out of contract and an unrestricted free agent, so he could walk for nothing' };
    if (/Restricted/.test(f.fa || '')) return { k: L.oocRFA, code: 'oocRFA', why: 'out of contract and a restricted free agent' };
    return { k: L.oocNonFA, code: 'oocNonFA', why: 'out of contract' };
  };

  // f: {zs, zPrior, games, age, avail, ped, contractEnd, fa}; opts: {mode, season, leverage (override k)}
  M.playerValue = (f, opts = {}) => {
    const p = P(); const mode = p.modes[opts.mode || 'balanced']; const season = opts.season || 2026;
    const delta = mode.delta ?? p.delta;
    const A = f.A ?? M.ability(f);
    let z = A, age = f.age, tot = 0, disc = 1, surv = 1;
    const path = [];
    const availK = p.availFloor + (1 - p.availFloor) * (f.avail ?? 1);
    for (let t = 1; t <= p.horizon; t++) {
      const g = growthAt(age);
      z += g > 0 ? g * (1 + p.pedGrowth * (f.ped || 0)) : g;
      age += 1;
      surv = surviveAt(age);
      const v = seasonValue(z) * surv * availK;
      tot += disc * v;
      path.push({ age: Math.floor(age), z: +z.toFixed(2), v: +(disc * v).toFixed(3) });
      disc *= delta;
      if (surv < 0.05) break;
    }
    const lev = opts.leverage != null ? { k: opts.leverage, why: null } : M.leverageOf(f, season);
    const scale = mode.scale || 1;
    let pts = p.S * tot * scale * M.vetFactor(f.age) * (p.posMult[f.group] ?? 1);
    // recent draftees: mostly still worth what their pick was worth (one small sample shouldn't swing it)
    const yrs = f.dy ? season - f.dy : 99, bw = (p.drafteeBlend[yrs] || 0) * Math.max(0, 1 - (f.games || 0) / 40);
    if (bw && f.dp) pts = bw * M.dvi(f.dp) * (mode.picks || 1) + (1 - bw) * pts;
    return { points: Math.round(pts * lev.k), A, raw: tot, leverage: lev, path, vet: M.vetFactor(f.age), draftee: bw ? { w: bw, pick: f.dp } : null };
  };

  // Future drafts. Tasmania joins in 2027 and gets picks 1,3,5,7,9,11,13 plus the first pick of every
  // later round; from 2027 the DVI stretches to pick 57 (assumed: same curve, stretched).
  const dviStretch = (n) => { const x = n * 54 / 57; if (x > 54) return 0; const lo = Math.floor(x), f = x - lo; const a = lo < 1 ? 3000 : M.dvi(lo), b = M.dvi(lo + 1); return a + (b - a) * f; };
  M.futurePickNumber = (year, round, slot) => { // slot = 1..18 among the existing clubs
    if (year === 2027) {
      if (round === 1) return slot <= 7 ? slot * 2 : slot + 7;
      return 25 + (round - 2) * 19 + 1 + slot;
    }
    if (year >= 2028) return (round - 1) * 19 + Math.round(slot * 19 / 18);
    return (round - 1) * 18 + slot;
  };
  const futureDVI = (year, n) => (year >= 2027 ? dviStretch(n) : M.dvi(n));

  // expected DVI for a pick whose slot within a round is uncertain
  M.expectedDVI = (round, slot, spread, year = 2026) => {
    let num = 0, den = 0;
    for (let s = 1; s <= 18; s++) {
      const w = Math.exp(-0.5 * ((s - slot) / spread) ** 2);
      num += w * futureDVI(year, M.futurePickNumber(year, round, s)); den += w;
    }
    return num / den;
  };

  // pk: {year, round, pick (known number) | orig}; ctx: {season, ladderRank: {club: 1..18}, mode}
  M.pickValue = (pk, ctx = {}) => {
    const p = P(); const mode = p.modes[ctx.mode || 'balanced']; const season = ctx.season || 2026;
    let pts, why;
    if (pk.pick) { pts = M.dvi(pk.pick); why = pk.pick <= M.DVI.length ? `Draft Value Index for pick ${pk.pick}` : `pick ${pk.pick} is past the last pick with DVI points`; }
    else {
      const yrs = pk.year - season;
      const rank = ctx.ladderRank?.[pk.orig] || 9.5;
      const ladderSlot = 19 - rank;
      const rg = p.futureRegress[yrs] ?? 0.9;
      const slot = ladderSlot * (1 - rg) + 9.5 * rg;
      pts = M.expectedDVI(pk.round, slot, p.futureSpread, pk.year) * (p.futureDiscount[yrs] ?? 0.8);
      const est = M.futurePickNumber(pk.year, pk.round, Math.round(slot));
      why = `projected ≈ pick ${est} of the ${pk.year} draft (${pk.orig} finished ${ord(rank)} in ${season}; ${pk.year === 2027 ? 'Tasmania\'s concession picks push everyone back' : 'Tasmania makes it 19 clubs'}), ${Math.round((1 - (p.futureDiscount[yrs] ?? 0.8)) * 100)}% future discount`;
      if (pk.year < 2027) why = `projected ≈ pick ${est} (${pk.orig} finished ${ord(rank)} in ${season})${yrs ? `, ${Math.round((1 - (p.futureDiscount[yrs] ?? 0.8)) * 100)}% future discount` : ''}`;
    }
    return { points: Math.round(pts * mode.picks), why };
  };
  const ord = (n) => { n = Math.round(n); const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  M.ord = ord;

  // 0-99 overall rating from ability (display only)
  M.ovr = (A) => Math.max(40, Math.min(99, Math.round(72 + 9 * A)));

  root.TradeModel = M;
})(typeof window !== 'undefined' ? window : globalThis);
